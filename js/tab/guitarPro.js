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
import { parseGp5 } from './gp5.js';

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

// Choose the track to analyze: the first one whose staff carries a string
// tuning (i.e. a fretted instrument), else the first track.
function pickTrack(tracks) {
  for (const t of tracks) {
    if (tuningPitchesOf(t).length) return t;
  }
  return tracks[0] || null;
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

/**
 * Convert a GPIF XML string into a TabModel (see js/tab/tabModel.js).
 * Each Guitar Pro beat becomes one time slot; notes stacked in a beat share the
 * slot (chords). Pitch comes straight from the file's MIDI/fret data.
 * @param {string} xml
 * @returns {{ model: object, meta: object }}
 */
export function gpifToModel(xml) {
  const root = parseXml(xml);
  const gpif = firstChild(root, 'GPIF') || root;

  const tracksNode = firstChild(gpif, 'Tracks');
  const tracks = childrenNamed(tracksNode, 'Track');
  const track = pickTrack(tracks);
  if (!track) throw new Error('guitarPro: no tracks found in the score');

  const openMidis = tuningPitchesOf(track);
  if (!openMidis.length) throw new Error('guitarPro: the first track is not a fretted (tuned) instrument');
  const strings = openMidis.map((m) => { const s = midiToNoteOct(m); return { note: s.note, oct: s.oct, label: s.note, openMidi: m }; });
  const tuningName = matchTuningName(openMidis) || 'Custom';

  const bars = indexById(firstChild(gpif, 'Bars'), 'Bar');
  const voices = indexById(firstChild(gpif, 'Voices'), 'Voice');
  const beats = indexById(firstChild(gpif, 'Beats'), 'Beat');
  const notes = indexById(firstChild(gpif, 'Notes'), 'Note');
  const masterBars = childrenNamed(firstChild(gpif, 'MasterBars'), 'MasterBar');

  // The track's index within <Tracks> selects its bar per master bar.
  const trackIndex = Math.max(0, tracks.indexOf(track));

  const events = [];
  const measures = [];
  const techniqueCounts = {};
  const warnings = [];
  const lastFretByString = new Map(); // for hammer/pull direction

  let slot = 0;
  for (const mb of masterBars) {
    const barRefs = childText(mb, 'Bars').split(/\s+/).filter(Boolean);
    const barId = barRefs[trackIndex] != null ? barRefs[trackIndex] : barRefs[0];
    const bar = bars.get(barId);
    if (!bar) continue;
    const measureStart = slot;

    // First playable voice (GP marks empty voices as -1).
    const voiceRefs = childText(bar, 'Voices').split(/\s+/).filter((v) => v && v !== '-1');
    const voice = voiceRefs.map((v) => voices.get(v)).find(Boolean);
    if (voice) {
      const beatRefs = childText(voice, 'Beats').split(/\s+/).filter(Boolean);
      for (const beatId of beatRefs) {
        const beat = beats.get(beatId);
        if (!beat) continue;
        const beatTechniques = [];
        if (firstChild(beat, 'Tremolo')) beatTechniques.push('tremolo');
        if (firstChild(beat, 'DeadSlapped')) beatTechniques.push('slap');
        const beatProps = firstChild(beat, 'Properties');
        if (hasEnabledProperty(beatProps, 'Slapped')) beatTechniques.push('slap');
        if (hasEnabledProperty(beatProps, 'Popped')) beatTechniques.push('pop');

        const noteRefs = childText(beat, 'Notes').split(/\s+/).filter(Boolean);
        let placedInSlot = false;
        for (const noteId of noteRefs) {
          const note = notes.get(noteId);
          if (!note) continue;
          const props = firstChild(note, 'Properties');
          const fretTxt = childText(property(props, 'Fret'), 'Fret');
          const strTxt = childText(property(props, 'String'), 'String');
          const midiTxt = childText(property(props, 'Midi'), 'Number');
          const fret = fretTxt === '' ? null : parseInt(fretTxt, 10);
          const stringIndex = strTxt === '' ? 0 : parseInt(strTxt, 10);
          const { techniques, dead, hopoOrigin } = techniquesForNote(note, beatTechniques);

          let midi = midiTxt === '' ? null : parseInt(midiTxt, 10);
          if (midi == null && fret != null && strings[stringIndex]) midi = strings[stringIndex].openMidi + fret;

          // A note flagged as a HOPO origin connects to the next note on the
          // same string; classify the link as hammer-on (up) or pull-off (down).
          const prev = lastFretByString.get(stringIndex);
          if (prev && prev.hopo && midi != null && prev.midi != null) {
            const t = midi >= prev.midi ? 'hammer' : 'pull';
            if (!techniques.includes(t)) techniques.push(t);
          }
          if (midi != null) lastFretByString.set(stringIndex, { midi, hopo: hopoOrigin });

          for (const t of techniques) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;

          if (dead || midi == null) {
            events.push({ slot, stringIndex, fret: dead ? null : fret, midi: null, pc: null, techniques, dead: true });
          } else {
            events.push({ slot, stringIndex, fret, midi, pc: ((midi % 12) + 12) % 12, techniques, dead: false });
          }
          placedInSlot = true;
        }
        if (placedInSlot || noteRefs.length === 0) slot += 1; // rests still advance time
      }
    }
    if (slot === measureStart) slot += 1; // guarantee forward progress
    measures.push({ startSlot: measureStart, endSlot: slot });
  }

  events.sort((a, b) => (a.slot - b.slot) || (a.stringIndex - b.stringIndex));
  if (!events.some((e) => e.fret != null || e.dead)) {
    warnings.push('The Guitar Pro track had no playable notes on the analyzed staff.');
  }

  const model = {
    tuning: tuningName,
    strings,
    events,
    slots: events.length ? Math.max(...events.map((e) => e.slot)) + 1 : slot,
    measures,
    techniqueCounts,
    warnings,
  };
  const meta = {
    trackName: (firstChild(track, 'Name') || {}).text?.trim() || null,
    tracks: tracks.length,
    tuningPitches: openMidis,
  };
  return { model, meta };
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

/**
 * Parse a Guitar Pro file into a TabModel.
 * Only the modern `.gp` (Guitar Pro 7/8) container is supported; other formats
 * throw a descriptive error so the UI can guide the user to re-export.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<{ model: object, meta: object, ascii: string }>}
 */
export async function parseGuitarPro(input) {
  const bytes = toUint8(input);
  const fmt = detectGuitarProFormat(bytes);
  if (fmt === 'gp5') {
    const { model, meta } = parseGp5(bytes);
    return { model, meta, ascii: modelToAsciiTab(model) };
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
  const { model, meta } = gpifToModel(xml);
  const ascii = modelToAsciiTab(model);
  return { model, meta, ascii };
}
