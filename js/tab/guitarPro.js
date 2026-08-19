// Offline reader for modern Guitar Pro files (.gp, Guitar Pro 7 & 8).
//
// Why this exists: PDF import of engraved tab is fundamentally lossy — real
// Guitar Pro / MuseScore / Soundslice exports draw fret numbers as individually
// positioned glyphs over vector staff lines, so there is no monospaced ASCII to
// recover and column reconstruction is guesswork. A `.gp` file, by contrast,
// carries the *exact* score: tuning, every beat, the fret on each string and the
// playing techniques. Parsing it gives the analyzer perfect input instead of a
// best-effort reflow.
//
// A `.gp` file is a plain ZIP whose `Content/score.gpif` entry is an XML
// document (GPIF). This module stays true to Musi's static/offline PWA rule:
//   * no third-party library and no network,
//   * ZIP entries are inflated with the platform DecompressionStream (the same
//     primitive the two PDF extractors already rely on), and
//   * a tiny dependency-free XML parser turns the GPIF into a TabModel so the
//     web view and the CLI share one code path.
//
// Binary Guitar Pro 5 (.gp5) is handled by the companion js/tab/gp5.js reader.
// The remaining older formats (.gp3/.gp4) and the GP6 .gpx container are
// detected and reported with a clear message rather than mis-parsed.

import { NOTE_NAMES_SHARP, TUNINGS } from '../theory.js';
import { parseGp5Tracks } from './gp5.js';
import {
  GPIF_NOTE_VALUES,
  noteValueToQuarters,
  normalizeTrackInfo,
  clampVelocity,
  graceLeadQuarters,
  sortEventsWithBeats,
} from './tabModel.js';
import {
  midiToDrumInstrument,
  dynamicsToVelocity,
  normalizePercussionMidi,
  gp6ElementVariationToMidi,
  makePercussionModel,
  markFlamPair,
  assignPercussionSlots,
  deriveMeasureSlotSpans,
} from './gpPercussion.js';

const CHUNK = 0x8000;

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('guitarPro: expected ArrayBuffer or Uint8Array');
}

function bytesToLatin1(bytes, start = 0, end = bytes.length) {
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, end)));
  }
  return out;
}

function bytesToUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  return bytesToLatin1(bytes);
}

// ---- ZIP container ---------------------------------------------------------
// Parsed via the central directory (robust against streamed entries that leave
// their sizes in a trailing data descriptor).

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('guitarPro: DecompressionStream is unavailable in this environment');
  }
  // ZIP stores raw DEFLATE (no zlib header); try raw first, then wrapped.
  for (const fmt of ['deflate-raw', 'deflate']) {
    try {
      const ds = new DecompressionStream(fmt);
      const resp = new Response(new Blob([bytes]).stream().pipeThrough(ds));
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) { /* try next */ }
  }
  throw new Error('guitarPro: could not inflate a ZIP entry');
}

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

// Locate the End Of Central Directory record and read the directory entries.
function readCentralDirectory(bytes) {
  const n = bytes.length;
  let eocd = -1;
  // EOCD signature 0x06054b50; scan backwards (comment is usually empty).
  for (let i = n - 22; i >= 0 && i >= n - 22 - 0xffff; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('guitarPro: not a ZIP (no end-of-central-directory record)');
  const count = u16(bytes, eocd + 10);
  let off = u32(bytes, eocd + 16);
  const entries = [];
  for (let e = 0; e < count && off + 46 <= n; e++) {
    if (u32(bytes, off) !== 0x02014b50) break;
    const method = u16(bytes, off + 10);
    const compSize = u32(bytes, off + 20);
    const nameLen = u16(bytes, off + 28);
    const extraLen = u16(bytes, off + 30);
    const commentLen = u16(bytes, off + 32);
    const localOff = u32(bytes, off + 42);
    const name = bytesToUtf8(bytes.subarray(off + 46, off + 46 + nameLen));
    entries.push({ name, method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntry(bytes, entry) {
  // Local file header: 30 fixed bytes + name + extra, then the data.
  const lo = entry.localOff;
  if (u32(bytes, lo) !== 0x04034b50) throw new Error('guitarPro: bad local file header');
  const nameLen = u16(bytes, lo + 26);
  const extraLen = u16(bytes, lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const raw = bytes.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return raw;            // stored
  if (entry.method === 8) return await inflateRaw(raw); // deflate
  throw new Error(`guitarPro: unsupported ZIP compression method ${entry.method}`);
}

// ---- minimal XML parser ----------------------------------------------------
// GPIF is regular XML (elements, attributes, text, CDATA, self-closing tags,
// comments). This builds a lightweight tree: { tag, attrs, children, text }.

function parseXml(src) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i) {
      const txt = src.slice(i, lt);
      if (txt.trim()) top().text += txt;
    }
    // Directives / comments / CDATA.
    if (src.startsWith('<!--', lt)) { const end = src.indexOf('-->', lt + 4); i = end === -1 ? n : end + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      const cdata = src.slice(lt + 9, end === -1 ? n : end);
      top().text += cdata;
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) { const end = src.indexOf('>', lt); i = end === -1 ? n : end + 1; continue; }

    const gt = src.indexOf('>', lt);
    if (gt === -1) break;
    let inner = src.slice(lt + 1, gt);
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1);

    if (inner[0] === '/') { // closing tag
      const name = inner.slice(1).trim();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) { stack.length = s; break; }
      }
      i = gt + 1;
      continue;
    }

    // Opening tag: split name + attributes.
    const node = { tag: '', attrs: {}, children: [], text: '' };
    const sp = inner.search(/\s/);
    if (sp === -1) { node.tag = inner; } else {
      node.tag = inner.slice(0, sp);
      const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(inner.slice(sp)))) node.attrs[a[1]] = a[2];
    }
    top().children.push(node);
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root;
}

const childrenNamed = (node, tag) => (node ? node.children.filter((c) => c.tag === tag) : []);
const firstChild = (node, tag) => (node ? node.children.find((c) => c.tag === tag) : undefined);
const childText = (node, tag) => { const c = firstChild(node, tag); return c ? c.text.trim() : ''; };

// Return the <Property name="X"> element within a <Properties> block.
function property(propsNode, name) {
  if (!propsNode) return undefined;
  return propsNode.children.find((c) => c.tag === 'Property' && c.attrs.name === name);
}
const hasEnabledProperty = (propsNode, name) => {
  const p = property(propsNode, name);
  return !!(p && (firstChild(p, 'Enable') || /true/i.test(p.text)));
};

// ---- GPIF -> TabModel ------------------------------------------------------

function midiToNoteOct(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return { note: NOTE_NAMES_SHARP[pc], oct: Math.floor(midi / 12) - 1, openMidi: midi };
}

// Map GPIF tuning pitches (low->high MIDI values) to a known TUNINGS name.
function matchTuningName(openMidis) {
  for (const [name, arr] of Object.entries(TUNINGS)) {
    if (arr.length !== openMidis.length) continue;
    const known = arr.map((s) => {
      const pc = NOTE_NAMES_SHARP.indexOf(s.note);
      return 12 * (s.oct + 1) + (pc >= 0 ? pc : 0);
    });
    if (known.every((v, k) => v === openMidis[k])) return name;
  }
  return null;
}

// Collect the technique ids for one <Note> (and its beat-level flags).
function techniquesForNote(noteNode, beatTechniques) {
  const set = new Set(beatTechniques);
  const props = firstChild(noteNode, 'Properties');

  if (hasEnabledProperty(props, 'Bended')) set.add('bend');
  if (hasEnabledProperty(props, 'PalmMuted')) set.add('palmMute');
  if (hasEnabledProperty(props, 'Tapped') || hasEnabledProperty(props, 'LeftHandTapped')) set.add('tap');
  if (hasEnabledProperty(props, 'Slapped')) set.add('slap');
  if (hasEnabledProperty(props, 'Popped')) set.add('pop');
  if (property(props, 'Harmonic') || property(props, 'HarmonicType')) set.add('harmonic');
  if (property(props, 'Slide')) set.add('slide');
  if (hasEnabledProperty(props, 'VibratoWTremBar')) set.add('vibrato');

  if (firstChild(noteNode, 'Vibrato')) set.add('vibrato');
  if (firstChild(noteNode, 'Trill')) set.add('trill');

  const dead = hasEnabledProperty(props, 'Muted');
  return { techniques: [...set], dead, hopoOrigin: hasEnabledProperty(props, 'HopoOrigin') };
}

// Build lookup maps keyed by id string for the flat GPIF collections.
function indexById(containerNode, tag) {
  const map = new Map();
  for (const el of childrenNamed(containerNode, tag)) map.set(el.attrs.id, el);
  return map;
}

// Extract the open-string MIDI pitches (low->high) for a track, if fretted.
function tuningPitchesOf(trackNode) {
  const staves = firstChild(trackNode, 'Staves');
  const staffList = staves ? childrenNamed(staves, 'Staff') : [];
  const nodes = staffList.length ? staffList : [trackNode];
  for (const holder of nodes) {
    const props = firstChild(holder, 'Properties');
    const tuning = property(props, 'Tuning');
    const pitches = childText(tuning, 'Pitches');
    if (pitches) {
      const arr = pitches.trim().split(/\s+/).map(Number).filter((x) => !Number.isNaN(x));
      if (arr.length) return arr;
    }
  }
  return [];
}

// Detect a drum/percussion track (these carry no string tuning, so they cannot
// be analyzed as tab).
function isPercussionTrack(trackNode) {
  const set = firstChild(trackNode, 'InstrumentSet');
  const type = childText(set, 'Type');
  if (/drum|perc/i.test(type)) return true;
  if (tuningPitchesOf(trackNode).length > 0) return false;
  const midiConn = firstChild(trackNode, 'MidiConnection');
  const channel = childText(midiConn, 'PrimaryChannel') || childText(trackNode, 'PrimaryChannel');
  if (channel === '9') return true;
  return readPercussionArticulations(trackNode).list.length > 0;
}

/**
 * Flatten InstrumentSet articulations in GPIF document order.
 * @param {object} trackNode
 * @returns {{ list: Array<{ outputMidi: number, inputMidis: number[] }>, byInputMidi: Map<number, number> }}
 */
function readPercussionArticulations(trackNode) {
  const list = [];
  const byInputMidi = new Map();
  const set = firstChild(trackNode, 'InstrumentSet');
  const elements = firstChild(set, 'Elements');
  for (const element of childrenNamed(elements, 'Element')) {
    // Pitched tracks get a placeholder articulation in GPIF; skip those elements.
    if (firstChild(element, 'Pitched')) continue;
    const elemType = childText(element, 'Type');
    if (/^pitched$/i.test(elemType)) continue;
    const articulations = firstChild(element, 'Articulations');
    for (const art of childrenNamed(articulations, 'Articulation')) {
      const inputTxt = childText(art, 'InputMidiNumbers');
      const inputMidis = inputTxt.split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
      const outputTxt = childText(art, 'OutputMidiNumber');
      let outputMidi = outputTxt !== '' ? parseInt(outputTxt, 10) : NaN;
      if (!Number.isFinite(outputMidi)) outputMidi = inputMidis.length ? inputMidis[0] : NaN;
      if (!Number.isFinite(outputMidi)) continue;
      list.push({ outputMidi, inputMidis });
      for (const n of inputMidis) byInputMidi.set(n, outputMidi);
    }
  }
  return { list, byInputMidi };
}

/**
 * Resolve one GPIF drum note to a GM kit number (or null).
 * Priority: InstrumentArticulation → GP6 Element/Variation → Midi property.
 * @param {object} noteNode
 * @param {{ list: object[], byInputMidi: Map<number, number> }} articulations
 * @returns {{ midi: number, ghost: boolean, accent: boolean }|null}
 */
function resolveGpifPercussionNote(noteNode, articulations) {
  const { list, byInputMidi } = articulations;
  const ghost = /normal/i.test(childText(noteNode, 'AntiAccent'));
  const accentTxt = childText(noteNode, 'Accent');
  const accentVal = accentTxt !== '' ? parseInt(accentTxt, 10) : NaN;
  // Only the normal (0x04) and heavy (0x08) accent bits count — other bits are unrelated.
  const accent = Number.isFinite(accentVal) && (accentVal & 0x0c) !== 0;
  const props = firstChild(noteNode, 'Properties');

  const resolveInput = (input) => {
    if (!Number.isFinite(input)) return null;
    if (byInputMidi.has(input)) return byInputMidi.get(input);
    return normalizePercussionMidi(input);
  };

  const artTxt = childText(noteNode, 'InstrumentArticulation');
  if (artTxt !== '') {
    const idx = parseInt(artTxt, 10);
    if (Number.isFinite(idx)) {
      if (list[idx]) return { midi: list[idx].outputMidi, ghost, accent };
      const midi = resolveInput(idx);
      if (midi != null) return { midi, ghost, accent };
    }
  }

  const elemTxt = childText(property(props, 'Element'), 'Element')
    || childText(property(props, 'Element'), 'Number');
  if (elemTxt !== '') {
    const element = parseInt(elemTxt, 10);
    const varTxt = childText(property(props, 'Variation'), 'Variation')
      || childText(property(props, 'Variation'), 'Number');
    const variation = varTxt !== '' ? parseInt(varTxt, 10) : 0;
    const input = gp6ElementVariationToMidi(element, variation);
    const midi = resolveInput(input);
    if (midi != null) return { midi, ghost, accent };
  }

  const midiTxt = childText(property(props, 'Midi'), 'Number');
  if (midiTxt !== '') {
    const midi = normalizePercussionMidi(parseInt(midiTxt, 10));
    if (midi != null) return { midi, ghost, accent };
  }

  return null;
}

/**
 * Convert a GPIF XML string into per-track TabModels (see js/tab/tabModel.js).
 * A Guitar Pro score has many parts (tracks); every fretted track becomes its
 * own model. Each beat is one time slot; notes stacked in a beat share the slot
 * (chords). Pitch comes straight from the file's MIDI/fret data.
 * @param {string} xml
 * @returns {{ tracks: Array<{index:number, name:string, fretted:boolean, isPercussion:boolean, model:object|null, tuningPitches:number[]}> }}
 */
/** Read score BPM and tempo automations from MasterTrack. */
function readGpifTempo(gpif) {
  const masterTrack = firstChild(gpif, 'MasterTrack');
  const automations = firstChild(masterTrack, 'Automations');
  const tempoMap = [];
  if (!automations) return { tempo: 120, tempoMap };
  // Prefer the earliest Tempo automation; fall back to any Value "bpm unit" pair.
  let bestTempo = null;
  let bestAny = null;
  const unitToQuarter = { 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3 };
  for (const auto of childrenNamed(automations, 'Automation')) {
    const valueTxt = childText(auto, 'Value');
    if (!valueTxt) continue;
    const parts = valueTxt.trim().split(/\s+/);
    const bpmRaw = Number(parts[0]);
    if (!Number.isFinite(bpmRaw) || bpmRaw <= 0) continue;
    let unit = 2; // single value or unit 0 → quarter-note BPM
    if (parts.length >= 2) {
      unit = Number(parts[1]);
      if (!Number.isFinite(unit) || unit === 0) unit = 2;
      else if (!(unit in unitToQuarter)) unit = 2;
    }
    const qBpm = bpmRaw * unitToQuarter[unit];
    const bar = Number(childText(auto, 'Bar'));
    const pos = Number(childText(auto, 'Position')) || 0;
    const rank = (Number.isFinite(bar) ? bar : 999) * 10 + pos;
    const type = childText(auto, 'Type') || '';
    const linearTxt = childText(auto, 'Linear');
    const linear = /true/i.test(linearTxt);
    if (/tempo/i.test(type)) {
      const barIndex = Number.isFinite(bar) && bar >= 0 ? bar : 0;
      const beat = Number.isFinite(pos) && pos >= 0 ? pos : 0;
      const bpm = Math.max(40, Math.min(320, Math.round(qBpm)));
      tempoMap.push({ barIndex, beat, bpm, linear });
      if (!bestTempo || rank < bestTempo.rank) bestTempo = { bpm, rank };
    } else if (!bestAny || rank < bestAny.rank) {
      bestAny = { bpm: qBpm, rank };
    }
  }
  tempoMap.sort((a, b) => a.barIndex - b.barIndex || a.beat - b.beat);
  const tempo = (bestTempo || bestAny)?.bpm || 120;
  return { tempo, tempoMap };
}

function readGpifAnacrusis(gpif) {
  const masterTrack = firstChild(gpif, 'MasterTrack');
  if (!masterTrack) return false;
  if (firstChild(masterTrack, 'Anacrusis')) return true;
  const props = firstChild(masterTrack, 'Properties');
  return hasEnabledProperty(props, 'Anacrusis');
}

function padMeasureToTimeSig({
  cursor,
  measureStartBeat,
  timeSig,
  anacrusis,
  isFirstMeasure,
}) {
  if (!timeSig) return cursor;
  const beatsInBar = timeSig[0] * (4 / (timeSig[1] || 4));
  const written = cursor - measureStartBeat;
  if (written < beatsInBar && !(anacrusis && isFirstMeasure)) {
    return measureStartBeat + beatsInBar;
  }
  return cursor;
}

/** Build Rhythm id → duration and written-value map from <Rhythms>. */
function readGpifRhythms(gpif) {
  const map = new Map();
  const rhythmsNode = firstChild(gpif, 'Rhythms');
  for (const node of childrenNamed(rhythmsNode, 'Rhythm')) {
    const id = node.attrs.id;
    const noteName = childText(node, 'NoteValue') || 'Quarter';
    const denom = GPIF_NOTE_VALUES[noteName] || 4;
    const dotNode = firstChild(node, 'AugmentationDot');
    const dots = dotNode ? Math.max(0, Math.min(2, Number(dotNode.attrs.count) || 1)) : 0;
    const tupletNode = firstChild(node, 'PrimaryTuplet');
    const tupletNum = tupletNode ? (Number(tupletNode.attrs.num) || 0) : 0;
    const tupletDen = tupletNode ? (Number(tupletNode.attrs.den) || 0) : 0;
    let tuplet = null;
    if (tupletNum > 0 && tupletDen > 0) tuplet = { num: tupletNum, den: tupletDen };
    map.set(id, {
      noteValue: denom,
      dots,
      tuplet,
      duration: noteValueToQuarters(denom, dots, tupletNum, tupletDen),
    });
  }
  return map;
}

function beatDurationQuarters(beat, rhythms) {
  const meta = readBeatRhythmMeta(beat, rhythms);
  return meta.duration;
}

function readBeatRhythmMeta(beat, rhythms) {
  const rhythmNode = firstChild(beat, 'Rhythm');
  const ref = rhythmNode ? (rhythmNode.attrs.ref ?? rhythmNode.attrs.id) : null;
  if (ref != null && rhythms.has(ref)) return rhythms.get(ref);
  const direct = childText(beat, 'NoteValue');
  if (direct && GPIF_NOTE_VALUES[direct]) {
    const noteValue = GPIF_NOTE_VALUES[direct];
    return { noteValue, dots: 0, tuplet: null, duration: noteValueToQuarters(noteValue) };
  }
  return { noteValue: 4, dots: 0, tuplet: null, duration: 1 };
}

/** Read repeat and alternate-ending marks from a MasterBar. */
function readGpifRepeat(mb) {
  const repeatNode = firstChild(mb, 'Repeat');
  const altTxt = childText(mb, 'AlternateEndings');
  let open = false;
  let closeCount = null;
  if (repeatNode) {
    if (repeatNode.attrs.start === 'true' || repeatNode.attrs.start === 'True') open = true;
    const countAttr = repeatNode.attrs.count;
    if (countAttr != null && countAttr !== '') {
      const c = parseInt(countAttr, 10);
      if (Number.isFinite(c)) closeCount = c;
    }
  }
  let endings = null;
  if (altTxt) {
    endings = altTxt.trim().split(/\s+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
    if (!endings.length) endings = null;
  }
  if (!open && closeCount == null && endings == null) return null;
  return { open, closeCount, endings };
}

function readPropertyFloat(props, name) {
  const p = property(props, name);
  if (!p) return null;
  const f = firstChild(p, 'Float');
  if (f && f.text.trim() !== '') return Number(f.text);
  const n = firstChild(p, 'Number');
  if (n && n.text.trim() !== '') return Number(n.text);
  const t = p.text.trim();
  if (t !== '') return Number(t);
  return null;
}

/** Map GPIF bend properties to TabEvent.bend points. */
function readNoteBend(props) {
  if (!hasEnabledProperty(props, 'Bended') && readPropertyFloat(props, 'BendOriginValue') == null) return null;
  const gpToCents = (v) => (Number.isFinite(v) ? v * 2 : 0);
  const gpToOffset = (v) => Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 0) / 100));
  const origOff = readPropertyFloat(props, 'BendOriginOffset') ?? 0;
  const origVal = readPropertyFloat(props, 'BendOriginValue') ?? 0;
  const midOff1 = readPropertyFloat(props, 'BendMiddleOffset1');
  const midOff2 = readPropertyFloat(props, 'BendMiddleOffset2');
  const midVal = readPropertyFloat(props, 'BendMiddleValue');
  const destOff = readPropertyFloat(props, 'BendDestinationOffset') ?? 100;
  const destVal = readPropertyFloat(props, 'BendDestinationValue') ?? 0;
  const points = [];
  const add = (off, val) => {
    if (!Number.isFinite(off) || !Number.isFinite(val)) return;
    points.push({ offset: gpToOffset(off), cents: gpToCents(val) });
  };
  add(0, origVal);
  if (origOff > 0) add(origOff, origVal);
  if (midOff1 != null && midVal != null) {
    add(midOff1, midVal);
    if (midOff2 != null) add(midOff2, midVal);
  }
  add(destOff, destVal);
  add(100, destVal);
  const uniq = [];
  for (const p of points) {
    const last = uniq[uniq.length - 1];
    if (!last || last.offset !== p.offset || last.cents !== p.cents) uniq.push(p);
  }
  if (!uniq.length) return null;
  return { points: uniq.slice(0, 16) };
}

/** Map GPIF slide flag bits to slideKind. */
function readNoteSlideKind(props) {
  const slideProp = property(props, 'Slide');
  if (!slideProp) return null;
  const numTxt = childText(slideProp, 'Number');
  if (numTxt !== '') {
    const flags = parseInt(numTxt, 10);
    if (!Number.isFinite(flags)) return null;
    if (flags & 1) return 'shift';
    if (flags & 2) return 'legato';
    if (flags & 4) return 'outDown';
    if (flags & 8) return 'outUp';
    if (flags & 16) return 'intoFromBelow';
    if (flags & 32) return 'intoFromAbove';
    return null;
  }
  if (hasEnabledProperty(slideProp, 'Enable') || hasEnabledProperty(props, 'Slide')) return 'shift';
  return null;
}

function readNoteTie(noteNode, props) {
  if (hasEnabledProperty(props, 'Tie')) return true;
  const tieNode = firstChild(noteNode, 'Tie');
  if (tieNode) {
    if (tieNode.attrs.destination === 'true' || hasEnabledProperty(tieNode, 'Enable')) return true;
  }
  return false;
}

function readNoteGrace(noteNode) {
  const grace = firstChild(noteNode, 'Grace');
  if (!grace) return null;
  const transition = childText(grace, 'Transition') || null;
  return { grace: true, graceTransition: transition };
}

/**
 * Grace mark of a GPIF beat. Guitar Pro 6 and later write a flam, a drag, or
 * an acciaccatura as a separate beat with a `GraceNotes` mark. That beat
 * decorates the beat after it and takes no time of its own, so the reader
 * must not advance the bar by its written value.
 * @param {object} beatNode
 * @returns {'beforeBeat'|'onBeat'|null}
 */
function readBeatGrace(beatNode) {
  const txt = childText(beatNode, 'GraceNotes');
  if (!txt) return null;
  return /onbeat/i.test(txt) ? 'onBeat' : 'beforeBeat';
}

function beatTechniquesFromNode(beat) {
  const beatTechniques = [];
  if (firstChild(beat, 'Tremolo')) beatTechniques.push('tremolo');
  if (firstChild(beat, 'DeadSlapped')) beatTechniques.push('slap');
  const beatProps = firstChild(beat, 'Properties');
  if (hasEnabledProperty(beatProps, 'Slapped')) beatTechniques.push('slap');
  if (hasEnabledProperty(beatProps, 'Popped')) beatTechniques.push('pop');
  return beatTechniques;
}

/** Read mixer and instrument data from a GPIF track node. */
function readGpifTrackInfo(trackNode, isPercussion) {
  const info = { isPercussion };
  const midiConn = firstChild(trackNode, 'MidiConnection');
  if (midiConn) {
    const ch = childText(midiConn, 'PrimaryChannel');
    if (ch !== '') info.midiChannel = parseInt(ch, 10);
  }
  const generalMidi = firstChild(trackNode, 'GeneralMidi');
  if (generalMidi) {
    const prog = childText(generalMidi, 'Program');
    if (prog !== '') info.program = parseInt(prog, 10);
    const ch = childText(generalMidi, 'PrimaryChannel');
    if (ch !== '' && info.midiChannel == null) info.midiChannel = parseInt(ch, 10);
  }
  const sounds = firstChild(trackNode, 'Sounds');
  const soundList = sounds ? childrenNamed(sounds, 'Sound') : [];
  if (soundList.length) {
    const midi = firstChild(soundList[0], 'MIDI');
    const prog = childText(midi, 'Program');
    if (prog !== '' && info.program == null) info.program = parseInt(prog, 10);
  }
  const rse = firstChild(trackNode, 'RSE');
  const channelStrip = rse ? firstChild(rse, 'ChannelStrip') : null;
  const paramsNode = channelStrip ? firstChild(channelStrip, 'Parameters') : null;
  if (paramsNode && paramsNode.text.trim()) {
    const param = paramsNode.text.trim().split(/\s+/);
    if (param.length > 11) {
      const bal = Number(param[11]);
      if (Number.isFinite(bal)) info.pan = Math.max(-1, Math.min(1, (bal - 0.5) * 2));
    }
    if (param.length > 12) {
      const vol = Number(param[12]);
      if (Number.isFinite(vol)) info.volume = Math.max(0, Math.min(1, vol));
    }
  }
  const staves = firstChild(trackNode, 'Staves');
  const staffList = staves ? childrenNamed(staves, 'Staff') : [];
  for (const staff of staffList.length ? staffList : [trackNode]) {
    const props = firstChild(staff, 'Properties');
    const capoProp = property(props, 'CapoFret');
    if (capoProp) {
      const capoTxt = childText(capoProp, 'Fret') || capoProp.text.trim();
      if (capoTxt !== '') info.capo = parseInt(capoTxt, 10);
    }
  }
  const trackProps = firstChild(trackNode, 'Properties');
  const capoTop = property(trackProps, 'CapoFret');
  if (capoTop && info.capo == null) {
    const capoTxt = childText(capoTop, 'Fret') || capoTop.text.trim();
    if (capoTxt !== '') info.capo = parseInt(capoTxt, 10);
  }
  return normalizeTrackInfo(info);
}

export function gpifToTracks(xml) {
  const root = parseXml(xml);
  const gpif = firstChild(root, 'GPIF') || root;

  const tracksNode = firstChild(gpif, 'Tracks');
  const trackNodes = childrenNamed(tracksNode, 'Track');
  if (!trackNodes.length) throw new Error('guitarPro: no tracks found in the score');

  const { tempo, tempoMap } = readGpifTempo(gpif);
  const shared = {
    bars: indexById(firstChild(gpif, 'Bars'), 'Bar'),
    voices: indexById(firstChild(gpif, 'Voices'), 'Voice'),
    beats: indexById(firstChild(gpif, 'Beats'), 'Beat'),
    notes: indexById(firstChild(gpif, 'Notes'), 'Note'),
    masterBars: childrenNamed(firstChild(gpif, 'MasterBars'), 'MasterBar'),
    rhythms: readGpifRhythms(gpif),
    tempo,
    tempoMap,
    anacrusis: readGpifAnacrusis(gpif),
  };

  const tracks = trackNodes.map((trackNode, index) => {
    const name = (firstChild(trackNode, 'Name') || {}).text?.trim() || `Track ${index + 1}`;
    const openMidis = tuningPitchesOf(trackNode);
    if (isPercussionTrack(trackNode)) {
      const model = buildGpifPercussionModel(trackNode, index, shared, name);
      return { index, name, fretted: false, isPercussion: true, model, tuningPitches: [] };
    }
    if (!openMidis.length) {
      // Untuned non-drum parts (keys/vocals) stay unanalyzable.
      return { index, name, fretted: false, isPercussion: false, model: null, tuningPitches: [] };
    }
    const model = buildGpifTrackModel(trackNode, index, openMidis, shared);
    return { index, name, fretted: true, isPercussion: false, model, tuningPitches: openMidis };
  });
  return { tracks, tempo: shared.tempo };
}

/**
 * Drum hits of one waiting grace beat, timed to sound `lead` quarters before
 * the beat that they decorate. `beats[].noteIndices` never holds a grace hit:
 * the beat owns the notes that carry its rhythm, and the score timeline reads
 * grace hits by `beatIndex`.
 * @returns {object[]}
 */
function gpifPercussionGraceEvents({
  waiting, notes, articulations, beatStart, voiceIndex, beatIndex,
}) {
  const out = [];
  for (const noteId of waiting.noteRefs) {
    const note = notes.get(noteId);
    if (!note) continue;
    const resolved = resolveGpifPercussionNote(note, articulations);
    if (!resolved) continue;
    const dynTxt = waiting.beatDyn
      || childText(note, 'Dynamic')
      || childText(firstChild(note, 'Dynamic'), 'Value');
    const velocity = dynamicsToVelocity(dynTxt === '' ? null : dynTxt);
    const instrument = midiToDrumInstrument(resolved.midi, {
      velocity,
      ghost: resolved.ghost,
    });
    if (!instrument) continue;
    out.push({
      start: beatStart,
      duration: waiting.lead,
      instrument,
      velocity,
      midi: resolved.midi,
      accent: resolved.accent,
      voiceIndex,
      beatIndex,
      grace: true,
    });
  }
  return out;
}

/** Build a PercussionModel for a GPIF drum track (no string tuning). */
function buildGpifPercussionModel(trackNode, trackIndex, shared, name) {
  const { bars, voices, beats, notes, masterBars, rhythms, tempo, tempoMap, anacrusis } = shared;
  const articulations = readPercussionArticulations(trackNode);
  const trackInfo = readGpifTrackInfo(trackNode, true);
  const rawEvents = [];
  const measureBeats = [];
  const modelBeats = [];
  const modelRests = [];
  const warnings = [];
  let cursor = 0;
  let measureIndex = 0;
  let maxVoiceCount = 0;
  // Grace beats wait for the beat that they decorate, which can sit in the
  // next bar. The wait is per voice, so each voice keeps its own list.
  const pendingGraces = new Map();

  for (const mb of masterBars) {
    const barRefs = childText(mb, 'Bars').split(/\s+/).filter(Boolean);
    const barId = barRefs[trackIndex] != null ? barRefs[trackIndex] : barRefs[0];
    const bar = bars.get(barId);
    if (!bar) continue;
    const measureStartBeat = cursor;
    const sectionNode = firstChild(mb, 'Section');
    const marker = sectionNode
      ? (childText(sectionNode, 'Text') || childText(sectionNode, 'Letter') || null)
      : null;
    const timeTxt = childText(mb, 'Time');
    let timeSig = null;
    if (timeTxt) {
      const parts = timeTxt.split('/').map(Number);
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) timeSig = parts;
    }

    const repeat = readGpifRepeat(mb);
    const voiceRefs = childText(bar, 'Voices').split(/\s+/).filter((v) => v && v !== '-1');
    maxVoiceCount = Math.max(maxVoiceCount, voiceRefs.length);
    let measureCursor = measureStartBeat;
    let advanced = false;
    for (let vi = 0; vi < voiceRefs.length; vi += 1) {
      const voiceRef = voiceRefs[vi];
      const voice = voices.get(voiceRef);
      if (!voice) continue;
      let voiceCursor = measureStartBeat;
      const beatRefs = childText(voice, 'Beats').split(/\s+/).filter(Boolean);
      for (const beatId of beatRefs) {
        const beat = beats.get(beatId);
        if (!beat) continue;
        const rhythmMeta = readBeatRhythmMeta(beat, rhythms);
        const duration = rhythmMeta.duration;
        const beatStart = voiceCursor;
        const beatDyn = childText(beat, 'Dynamic');
        const beatTechniques = beatTechniquesFromNode(beat);
        const noteRefs = childText(beat, 'Notes').split(/\s+/).filter(Boolean);
        const isRest = noteRefs.length === 0;
        const beatIndex = modelBeats.length;
        if (readBeatGrace(beat)) {
          if (!isRest) {
            const waiting = pendingGraces.get(vi) || [];
            waiting.push({ noteRefs, beatDyn, lead: graceLeadQuarters(duration) });
            pendingGraces.set(vi, waiting);
          }
          continue;
        }
        if (isRest) {
          const restEntry = {
            measureIndex,
            voiceIndex: vi,
            start: beatStart,
            duration,
            noteValue: rhythmMeta.noteValue,
            dots: rhythmMeta.dots,
            tuplet: rhythmMeta.tuplet,
          };
          modelRests.push(restEntry);
          modelBeats.push({
            ...restEntry,
            rest: true,
            techniques: beatTechniques,
            noteIndices: [],
          });
        } else {
          const noteIndices = [];
          for (const noteId of noteRefs) {
            const note = notes.get(noteId);
            if (!note) continue;
            const resolved = resolveGpifPercussionNote(note, articulations);
            if (!resolved) continue;
            const dynTxt = beatDyn
              || childText(note, 'Dynamic')
              || childText(firstChild(note, 'Dynamic'), 'Value');
            const velocity = dynamicsToVelocity(dynTxt === '' ? null : dynTxt);
            const instrument = midiToDrumInstrument(resolved.midi, {
              velocity,
              ghost: resolved.ghost,
            });
            if (!instrument) continue;
            noteIndices.push(rawEvents.length);
            rawEvents.push({
              start: beatStart,
              duration,
              instrument,
              velocity,
              midi: resolved.midi,
              accent: resolved.accent,
              voiceIndex: vi,
              beatIndex,
            });
          }
          // A grace hit sounds just before this beat. On the lane of one of
          // the beat's own hits it makes a flam, which drum tab spells with
          // one symbol on the main hit.
          const mainEvents = noteIndices.map((i) => rawEvents[i]);
          for (const waiting of pendingGraces.get(vi) || []) {
            for (const graceEvent of gpifPercussionGraceEvents({
              waiting, notes, articulations, beatStart, voiceIndex: vi, beatIndex,
            })) {
              markFlamPair(graceEvent, mainEvents);
              rawEvents.push(graceEvent);
            }
          }
          pendingGraces.delete(vi);
          modelBeats.push({
            measureIndex,
            voiceIndex: vi,
            start: beatStart,
            duration,
            noteValue: rhythmMeta.noteValue,
            dots: rhythmMeta.dots,
            tuplet: rhythmMeta.tuplet,
            rest: false,
            techniques: beatTechniques,
            noteIndices,
          });
        }
        voiceCursor += duration;
        advanced = true;
      }
      if (voiceCursor > measureCursor) measureCursor = voiceCursor;
    }
    if (!advanced) {
      const beatsInBar = timeSig ? (timeSig[0] * (4 / (timeSig[1] || 4))) : 4;
      measureCursor = measureStartBeat + beatsInBar;
    } else {
      measureCursor = padMeasureToTimeSig({
        cursor: measureCursor,
        measureStartBeat,
        timeSig,
        anacrusis,
        isFirstMeasure: measureBeats.length === 0,
      });
    }
    measureBeats.push({
      startBeat: measureStartBeat,
      endBeat: measureCursor,
      marker,
      timeSig: timeSig || undefined,
      repeat: repeat || undefined,
    });
    cursor = measureCursor;
    measureIndex += 1;
  }

  const events = assignPercussionSlots(rawEvents);
  const measures = deriveMeasureSlotSpans(measureBeats, events);

  if (!events.length) warnings.push('The percussion track had no mappable drum hits.');
  const voiceCount = Math.max(1, Math.min(4, maxVoiceCount || 1));
  const out = makePercussionModel({
    name,
    tempo,
    events,
    measures,
    warnings,
    beats: modelBeats.length ? modelBeats : null,
  });
  out.trackInfo = trackInfo;
  out.voiceCount = voiceCount;
  if (modelRests.length) out.rests = modelRests;
  if (tempoMap.length) out.tempoMap = tempoMap;
  return out;
}

/**
 * Fretted notes of one waiting grace beat, timed to sound `lead` quarters
 * before the beat that they decorate. A grace note stays out of
 * `beats[].noteIndices`, because the beat owns the notes that carry its
 * rhythm; the score timeline reads grace notes by `beatIndex`.
 * @returns {object[]}
 */
function gpifFrettedGraceEvents({
  waiting, notes, strings, beatStart, eventSlot, voiceIndex, beatIndex,
}) {
  const out = [];
  for (const noteId of waiting.noteRefs) {
    const note = notes.get(noteId);
    if (!note) continue;
    const props = firstChild(note, 'Properties');
    const fretTxt = childText(property(props, 'Fret'), 'Fret');
    const strTxt = childText(property(props, 'String'), 'String');
    const midiTxt = childText(property(props, 'Midi'), 'Number');
    const fret = fretTxt === '' ? null : parseInt(fretTxt, 10);
    const stringIndex = strTxt === '' ? 0 : parseInt(strTxt, 10);
    let midi = midiTxt === '' ? null : parseInt(midiTxt, 10);
    if (midi == null && fret != null && strings[stringIndex]) {
      midi = strings[stringIndex].openMidi + fret;
    }
    if (midi == null) continue;
    const dynTxt = waiting.beatDyn
      || childText(note, 'Dynamic')
      || childText(firstChild(note, 'Dynamic'), 'Value');
    out.push({
      slot: eventSlot,
      stringIndex,
      fret,
      midi,
      pc: ((midi % 12) + 12) % 12,
      dead: false,
      start: beatStart,
      duration: waiting.lead,
      voiceIndex,
      beatIndex,
      grace: true,
      velocity: clampVelocity(dynamicsToVelocity(dynTxt === '' ? null : dynTxt)),
      techniques: [],
    });
  }
  return out;
}

// Build one track's TabModel from the shared GPIF collections.
function buildGpifTrackModel(trackNode, trackIndex, openMidis, shared) {
  const { bars, voices, beats, notes, masterBars, rhythms, tempo, tempoMap, anacrusis } = shared;
  const strings = openMidis.map((m) => {
    const s = midiToNoteOct(m);
    return { note: s.note, oct: s.oct, label: s.note, openMidi: m };
  });
  const tuningName = matchTuningName(openMidis) || 'Custom';
  const trackInfo = readGpifTrackInfo(trackNode, false);

  const events = [];
  const modelBeats = [];
  const modelRests = [];
  const measures = [];
  const techniqueCounts = {};
  const warnings = [];
  const lastFretByString = new Map();

  let slot = 0;
  let cursor = 0;
  let measureIndex = 0;
  let maxVoiceCount = 0;
  // Grace beats wait for the beat that they decorate, which can sit in the
  // next bar. The wait is per voice, so each voice keeps its own list.
  const pendingGraces = new Map();
  for (const mb of masterBars) {
    const barRefs = childText(mb, 'Bars').split(/\s+/).filter(Boolean);
    const barId = barRefs[trackIndex] != null ? barRefs[trackIndex] : barRefs[0];
    const bar = bars.get(barId);
    if (!bar) continue;
    const measureStart = slot;
    const measureStartBeat = cursor;
    // Section markers (rehearsal marks) label song parts: Intro, Verse, Chorus…
    const sectionNode = firstChild(mb, 'Section');
    const marker = sectionNode
      ? (childText(sectionNode, 'Text') || childText(sectionNode, 'Letter') || null)
      : null;
    const timeTxt = childText(mb, 'Time');
    let timeSig = null;
    if (timeTxt) {
      const parts = timeTxt.split('/').map(Number);
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) timeSig = parts;
    }

    const repeat = readGpifRepeat(mb);
    const voiceRefs = childText(bar, 'Voices').split(/\s+/).filter((v) => v && v !== '-1');
    maxVoiceCount = Math.max(maxVoiceCount, voiceRefs.length);
    const beatStartToSlot = new Map();
    let advanced = false;

    for (let vi = 0; vi < voiceRefs.length; vi += 1) {
      const voiceRef = voiceRefs[vi];
      const voice = voices.get(voiceRef);
      if (!voice) continue;
      let voiceCursor = measureStartBeat;
      const beatRefs = childText(voice, 'Beats').split(/\s+/).filter(Boolean);

      for (const beatId of beatRefs) {
        const beat = beats.get(beatId);
        if (!beat) continue;
        const rhythmMeta = readBeatRhythmMeta(beat, rhythms);
        const duration = rhythmMeta.duration;
        const beatStart = voiceCursor;
        const beatTechniques = beatTechniquesFromNode(beat);
        const beatDyn = childText(beat, 'Dynamic');
        const noteRefs = childText(beat, 'Notes').split(/\s+/).filter(Boolean);
        const isRest = noteRefs.length === 0;
        const beatIndex = modelBeats.length;

        if (readBeatGrace(beat)) {
          if (!isRest) {
            const waiting = pendingGraces.get(vi) || [];
            waiting.push({ noteRefs, beatDyn, lead: graceLeadQuarters(duration) });
            pendingGraces.set(vi, waiting);
          }
          continue;
        }

        let eventSlot;
        if (vi === 0) {
          eventSlot = slot;
          beatStartToSlot.set(beatStart, eventSlot);
        } else {
          eventSlot = beatStartToSlot.get(beatStart);
          if (eventSlot == null) eventSlot = slot;
        }

        if (isRest) {
          const restEntry = {
            measureIndex,
            voiceIndex: vi,
            start: beatStart,
            duration,
            noteValue: rhythmMeta.noteValue,
            dots: rhythmMeta.dots,
            tuplet: rhythmMeta.tuplet,
          };
          modelRests.push(restEntry);
          modelBeats.push({
            ...restEntry,
            rest: true,
            techniques: beatTechniques,
            noteIndices: [],
          });
        } else {
          const noteIndices = [];
          for (const noteId of noteRefs) {
            const note = notes.get(noteId);
            if (!note) continue;
            const props = firstChild(note, 'Properties');
            const fretTxt = childText(property(props, 'Fret'), 'Fret');
            const strTxt = childText(property(props, 'String'), 'String');
            const midiTxt = childText(property(props, 'Midi'), 'Number');
            let fret = fretTxt === '' ? null : parseInt(fretTxt, 10);
            const stringIndex = strTxt === '' ? 0 : parseInt(strTxt, 10);
            const { techniques, dead, hopoOrigin } = techniquesForNote(note, beatTechniques);
            const isTie = readNoteTie(note, props);
            const graceInfo = readNoteGrace(note);
            const bend = readNoteBend(props);
            const slideKind = readNoteSlideKind(props);

            let midi = midiTxt === '' ? null : parseInt(midiTxt, 10);
            const prev = lastFretByString.get(stringIndex);
            if (isTie && prev) {
              if (fret == null) fret = prev.fret;
              if (midi == null) midi = prev.midi;
            }
            if (midi == null && fret != null && strings[stringIndex]) {
              midi = strings[stringIndex].openMidi + fret;
            }

            if (prev && prev.hopo && midi != null && prev.midi != null) {
              const t = midi >= prev.midi ? 'hammer' : 'pull';
              if (!techniques.includes(t)) techniques.push(t);
            }
            if (midi != null) lastFretByString.set(stringIndex, { midi, hopo: hopoOrigin, fret });

            const dynTxt = beatDyn
              || childText(note, 'Dynamic')
              || childText(firstChild(note, 'Dynamic'), 'Value');
            const velocity = clampVelocity(dynamicsToVelocity(dynTxt === '' ? null : dynTxt));

            for (const t of techniques) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;

            const base = {
              slot: eventSlot,
              stringIndex,
              start: beatStart,
              duration,
              techniques,
              dead: !!(dead || midi == null),
              voiceIndex: vi,
              beatIndex,
              velocity,
            };
            if (isTie) base.tie = true;
            if (graceInfo) {
              base.grace = graceInfo.grace;
              if (graceInfo.graceTransition) base.graceTransition = graceInfo.graceTransition;
            }
            if (bend) base.bend = bend;
            if (slideKind) base.slideKind = slideKind;

            if (dead || midi == null) {
              events.push({
                ...base,
                fret: dead ? null : fret,
                midi: null,
                pc: null,
                dead: true,
              });
            } else {
              events.push({
                ...base,
                fret,
                midi,
                pc: ((midi % 12) + 12) % 12,
                dead: false,
              });
            }
            noteIndices.push(events.length - 1);
          }
          for (const waiting of pendingGraces.get(vi) || []) {
            events.push(...gpifFrettedGraceEvents({
              waiting, notes, strings, beatStart, eventSlot, voiceIndex: vi, beatIndex,
            }));
          }
          pendingGraces.delete(vi);
          modelBeats.push({
            measureIndex,
            voiceIndex: vi,
            start: beatStart,
            duration,
            noteValue: rhythmMeta.noteValue,
            dots: rhythmMeta.dots,
            tuplet: rhythmMeta.tuplet,
            rest: false,
            techniques: beatTechniques,
            noteIndices,
          });
        }

        if (vi === 0 && (isRest || noteRefs.length > 0)) {
          slot += 1;
          cursor += duration;
          advanced = true;
        }
        voiceCursor += duration;
      }
    }
    if (!advanced) {
      // Empty measure: advance one bar of 4/4 (or declared time sig).
      const beatsInBar = timeSig ? (timeSig[0] * (4 / (timeSig[1] || 4))) : 4;
      slot += 1;
      cursor += beatsInBar;
    } else {
      cursor = padMeasureToTimeSig({
        cursor,
        measureStartBeat,
        timeSig,
        anacrusis,
        isFirstMeasure: measures.length === 0,
      });
    }
    measures.push({
      startSlot: measureStart,
      endSlot: slot,
      startBeat: measureStartBeat,
      endBeat: cursor,
      marker,
      timeSig: timeSig || undefined,
      repeat: repeat || undefined,
    });
    measureIndex += 1;
  }

  // The sort keeps `beats[].noteIndices` pointing at the same notes.
  const sorted = sortEventsWithBeats(
    events,
    modelBeats,
    (a, b) => (a.slot - b.slot) || (a.stringIndex - b.stringIndex),
  );
  const sortedEvents = sorted.events;
  const sortedBeats = sorted.beats;
  if (!sortedEvents.some((e) => e.fret != null || e.dead)) {
    warnings.push('The Guitar Pro track had no playable notes on the analyzed staff.');
  }

  const voiceCount = Math.max(1, Math.min(4, maxVoiceCount || 1));
  const out = {
    tuning: tuningName,
    strings,
    events: sortedEvents,
    slots: sortedEvents.length ? Math.max(...sortedEvents.map((e) => e.slot)) + 1 : slot,
    measures,
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    totalBeats: cursor,
    techniqueCounts,
    warnings,
    trackInfo,
    voiceCount,
  };
  if (tempoMap.length) out.tempoMap = tempoMap;
  if (sortedBeats.length) out.beats = sortedBeats;
  if (modelRests.length) out.rests = modelRests;
  return out;
}

// ---- ASCII rendering (for the editable textarea / previews) ----------------

// Render a TabModel back to monospaced ASCII tab so users can see, copy or edit
// what was imported. One column per occupied slot; multi-digit frets are kept
// intact and columns are padded to the widest cell so rows stay aligned.
export function modelToAsciiTab(model, { maxCols = 90 } = {}) {
  const strings = model.strings;
  const slots = [...new Set(model.events.map((e) => e.slot))].sort((a, b) => a - b);
  if (!slots.length) return '';
  const measureStarts = new Set((model.measures || []).map((m) => m.startSlot));

  const cell = (ev) => {
    if (!ev) return null;
    if (ev.dead || ev.fret == null) return 'x';
    return String(ev.fret);
  };

  // Bucket events by [stringIndex][slot].
  const grid = strings.map(() => new Map());
  for (const ev of model.events) grid[ev.stringIndex]?.set(ev.slot, ev);

  const lines = [];
  const chunkSlots = [];
  let colCount = 0;
  const flush = () => {
    if (!chunkSlots.length) return;
    for (let si = strings.length - 1; si >= 0; si--) {
      let row = strings[si].label.padEnd(2, ' ').slice(0, 2) + '|';
      for (const s of chunkSlots) {
        if (measureStarts.has(s) && s !== chunkSlots[0]) row += '|';
        const width = Math.max(...strings.map((_, k) => (cell(grid[k].get(s)) || '-').length));
        const c = cell(grid[si].get(s));
        row += (c || '-').padEnd(width, '-') + '-';
      }
      lines.push(row);
    }
    lines.push('');
    chunkSlots.length = 0;
    colCount = 0;
  };
  for (const s of slots) {
    chunkSlots.push(s);
    colCount += 2;
    if (colCount >= maxCols) flush();
  }
  flush();
  return lines.join('\n').replace(/\n+$/, '');
}

// ---- container detection + entry point -------------------------------------

/**
 * Detect the Guitar Pro container from the leading bytes.
 * @param {Uint8Array} bytes
 * @returns {'gp7'|'gpx'|'gp3'|'gp4'|'gp5'|'unknown'}
 */
export function detectGuitarProFormat(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'gp7'; // "PK" ZIP (GP7/GP8 .gp)
  const head = bytesToLatin1(bytes, 0, Math.min(64, bytes.length));
  if (head.startsWith('BCFS') || head.startsWith('BCFZ')) return 'gpx'; // GP6
  const m = head.match(/FICHIER GUITAR PRO v(\d)\.?(\d+)?/);
  if (m) { const v = Number(m[1]); return v <= 3 ? 'gp3' : v === 4 ? 'gp4' : 'gp5'; }
  return 'unknown';
}

export function isGuitarProName(name) {
  return /\.(gp|gpx|gp3|gp4|gp5)$/i.test(String(name || ''));
}

// Reason a raw track cannot be analyzed as tab (vocals/piano have no frets;
// drums are imported separately via drumTracks).
function unanalyzableReason(t) {
  if (t.isPercussion) return 'Drums / percussion — available in Drums';
  return 'No guitar/bass tuning — this part cannot be read as tab';
}

// Assemble the shared multi-track result from raw per-track entries. Fretted
// tracks stay the Tab Analyzer default; percussion tracks are returned as
// `drumTracks` for the drums importers. Top-level model/ascii
// describe the default fretted track when one exists.
function assembleResult(format, rawTracks, totalTracks) {
  const fretted = rawTracks.filter((t) => t.fretted && t.model);
  const drumRaw = rawTracks.filter((t) => t.isPercussion && t.model);
  if (!fretted.length && !drumRaw.length) {
    throw new Error('This Guitar Pro file has no fretted (tab) or drum part to import.');
  }
  const warnings = [];
  const mergeModelWarnings = (name, model) => {
    for (const w of (model?.warnings || [])) warnings.push(`${name}: ${w}`);
  };
  const tracks = fretted.map((t, i) => {
    mergeModelWarnings(t.name, t.model);
    const ti = normalizeTrackInfo(t.model?.trackInfo);
    return {
      index: i,
      sourceIndex: t.index,
      name: t.name,
      tuning: t.model.tuning,
      tuningPitches: t.tuningPitches,
      model: t.model,
      ascii: modelToAsciiTab(t.model),
      noteCount: t.model.events.filter((e) => e.fret != null || e.dead).length,
      program: ti.program,
      volume: ti.volume,
      pan: ti.pan,
    };
  });
  const drumTracks = drumRaw.map((t, i) => {
    mergeModelWarnings(t.name, t.model);
    return {
      index: i,
      sourceIndex: t.index,
      name: t.name,
      model: t.model,
      hitCount: (t.model.events || []).length,
      tempo: t.model.tempo,
    };
  });
  // Index analyzable fretted tracks by their source position for the parts list.
  const analyzableBySource = new Map(tracks.map((t) => [t.sourceIndex, t.index]));
  const drumBySource = new Map(drumTracks.map((t) => [t.sourceIndex, t.index]));
  const parts = rawTracks.map((t) => {
    const analyzableIndex = analyzableBySource.has(t.index) ? analyzableBySource.get(t.index) : -1;
    const drumIndex = drumBySource.has(t.index) ? drumBySource.get(t.index) : -1;
    const analyzable = analyzableIndex >= 0;
    const isDrum = drumIndex >= 0;
    return {
      name: t.name,
      sourceIndex: t.index,
      analyzable,
      analyzableIndex,
      isPercussion: !!t.isPercussion || isDrum,
      drumIndex,
      tuning: analyzable ? tracks[analyzableIndex].tuning : null,
      noteCount: analyzable
        ? tracks[analyzableIndex].noteCount
        : (isDrum ? drumTracks[drumIndex].hitCount : 0),
      reason: analyzable || isDrum ? null : unanalyzableReason(t),
    };
  });
  const def = tracks[0] || null;
  const meta = {
    format,
    tracks: totalTracks,
    frettedTracks: tracks.length,
    drumTracks: drumTracks.length,
    trackName: def ? def.name : (drumTracks[0]?.name || ''),
    tuningPitches: def ? def.tuningPitches : [],
  };
  return {
    format,
    tracks,
    drumTracks,
    parts,
    defaultIndex: 0,
    model: def ? def.model : null,
    ascii: def ? def.ascii : '',
    meta,
    warnings,
  };
}

/**
 * Parse a Guitar Pro file into per-track TabModels.
 *
 * Supports the modern `.gp` (Guitar Pro 7/8) container and binary `.gp5`; other
 * formats throw a descriptive error so the UI can guide the user to re-export.
 * A score usually has several parts, so the result carries every fretted track;
 * callers pick which to analyze (top-level fields describe the default track).
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<{ format:string, tracks:Array, parts:Array, defaultIndex:number, model:object, ascii:string, meta:object }>}
 */
export async function parseGuitarPro(input) {
  const bytes = toUint8(input);
  const fmt = detectGuitarProFormat(bytes);
  if (fmt === 'gp5') {
    const { tracks, tempo } = parseGp5Tracks(bytes);
    const result = assembleResult('gp5', tracks, tracks.length);
    if (Number.isFinite(tempo) && tempo > 0) {
      result.tempo = tempo;
      for (const t of result.tracks) {
        if (t.model) t.model.tempo = tempo;
      }
      if (result.model) result.model.tempo = tempo;
      for (const t of (result.drumTracks || [])) {
        if (t.model) t.model.tempo = tempo;
      }
    }
    return result;
  }
  if (fmt === 'gpx') {
    throw new Error('This is a Guitar Pro 6 (.gpx) file. Open it in Guitar Pro and re-export as “.gp” (Guitar Pro 7/8) or “.gp5” to analyze it.');
  }
  if (fmt === 'gp3' || fmt === 'gp4') {
    throw new Error(`This is an older binary Guitar Pro file (${fmt}). Open it in Guitar Pro and re-save as “.gp” (7/8) or “.gp5” to analyze it.`);
  }
  if (fmt !== 'gp7') {
    throw new Error('Unrecognized file — expected a Guitar Pro “.gp” (7/8) or “.gp5” file.');
  }

  const entries = readCentralDirectory(bytes);
  const gpif = entries.find((e) => /(^|\/)score\.gpif$/i.test(e.name))
    || entries.find((e) => /\.gpif$/i.test(e.name));
  if (!gpif) throw new Error('guitarPro: no score.gpif inside the .gp archive');
  const xmlBytes = await readZipEntry(bytes, gpif);
  const xml = bytesToUtf8(xmlBytes);
  const { tracks, tempo } = gpifToTracks(xml);
  const result = assembleResult('gp7', tracks, tracks.length);
  if (Number.isFinite(tempo) && tempo > 0) {
    result.tempo = tempo;
    for (const t of result.tracks) {
      if (t.model) t.model.tempo = tempo;
    }
    if (result.model) result.model.tempo = tempo;
    for (const t of (result.drumTracks || [])) {
      if (t.model) t.model.tempo = tempo;
    }
  }
  return result;
}
