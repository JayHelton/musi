// Offline reader for binary Guitar Pro 5 files (.gp5, versions 5.00 and 5.10).
//
// Unlike the modern .gp container (a ZIP of XML), .gp5 is a proprietary binary
// stream. This module implements just enough of that format to build the same
// exact TabModel the .gp reader produces: tuning, per-beat note events with
// fret/string/MIDI, measures, and playing techniques. It is pure and
// dependency-free (a small DataView-based cursor), so it runs unchanged in the
// browser and under Node, matching Musi's static/offline rule.
//
// The byte layout follows the well-documented GP5 spec (as implemented by
// TuxGuitar / PyGuitarPro / alphaTab). Every field is consumed in order — even
// data we don't use (RSE mixer, page setup, chord diagrams) — because the
// format is a flat stream with no internal offsets, so skipping a field would
// desynchronize everything after it.

import { NOTE_NAMES_SHARP, TUNINGS } from '../theory.js';
import {
  gp5DurationToQuarters,
  clampVelocity,
  normalizeTrackInfo,
  graceLeadQuarters,
} from './tabModel.js';
import {
  midiToDrumInstrument,
  normalizeGp5PercussionMidi,
  dynamicsToVelocity,
  drumHitVelocity,
  makePercussionModel,
  markFlamPair,
  assignPercussionSlots,
  deriveMeasureSlotSpans,
} from './gpPercussion.js';

// ---- low-level cursor ------------------------------------------------------

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  get eof() { return this.p >= this.b.length; }
  skip(n) { this.p += n; }
  u8() { return this.b[this.p++]; }
  i8() { const v = this.dv.getInt8(this.p); this.p += 1; return v; }
  bool() { return this.u8() !== 0; }
  i16() { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
  i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  take(n) { const s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
  // 1 size byte, then `count` bytes; string is the first `size` of them.
  byteSizeString(count) { const size = this.u8(); const s = this.take(count); return latin1(s.subarray(0, size)); }
  intSizeString() { const c = this.i32(); return latin1(this.take(c)); }
  intByteSizeString() { const c = this.i32(); return this.byteSizeString(c - 1); }
  version() { return this.byteSizeString(30); }
}

// ---- shared model helpers (kept local to avoid a circular import) ----------

function midiToNoteOct(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return { note: NOTE_NAMES_SHARP[pc], oct: Math.floor(midi / 12) - 1, openMidi: midi };
}

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

// ---- structural sub-readers ------------------------------------------------

function readColor(r) { r.skip(4); }                       // r,g,b,blank
// A marker is a rehearsal/section label (e.g. "Intro", "Verse", "Chorus").
function readMarker(r) { const name = r.intByteSizeString(); readColor(r); return name; }

function readMidiChannels(r) {
  const channels = [];
  for (let i = 0; i < 64; i++) {
    const instrument = r.i32();
    const volume = r.u8();
    const balance = r.u8();
    r.skip(4);                     // chorus,reverb,phaser,tremolo
    r.skip(2);                     // 3.0 backward-compat blanks
    channels.push({ instrument, volume, balance });
  }
  return channels;
}

function readDirections(r) { for (let i = 0; i < 19; i++) r.i16(); }

function readRSEInstrument(r, ctx) {
  r.i32(); r.i32(); r.i32();       // instrument, unknown, soundBank
  if (ctx.v500) { r.i16(); r.skip(1); } else r.i32(); // effect number
}

function readRSEInstrumentEffect(r, ctx) {
  if (!ctx.v500) { r.intByteSizeString(); r.intByteSizeString(); }
}

// Returns { marker, timeSig } where marker is the section label starting at
// this measure (or null). The label is what Guitar Pro shows above the staff.
function decodeEndingsMask(mask) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    if (mask & (1 << i)) out.push(i + 1);
  }
  return out.length ? out : null;
}

function readMeasureHeader(r, ctx, isFirst) {
  if (!isFirst) r.skip(1);
  const flags = r.u8();
  let marker = null;
  let numerator = null;
  let denominator = null;
  const open = !!(flags & 0x04);
  if (flags & 0x01) numerator = r.i8();
  if (flags & 0x02) denominator = r.i8();
  let closeCount = null;
  if (flags & 0x08) {
    const raw = r.i8();
    if (raw > 0) closeCount = raw;
  }
  if (flags & 0x20) marker = readMarker(r) || null;
  if (flags & 0x40) { r.i8(); r.i8(); } // key signature
  let endings = null;
  if (flags & 0x10) endings = decodeEndingsMask(r.u8());
  if (flags & 0x03) r.skip(4);     // time-signature beams
  if ((flags & 0x10) === 0) r.skip(1);
  r.u8();                          // triplet feel
  const timeSig = (numerator != null && denominator != null)
    ? [numerator, denominator]
    : null;
  let repeat = null;
  if (open || closeCount != null || endings != null) {
    repeat = { open, closeCount, endings };
  }
  return { marker, timeSig, repeat };
}

// Read one track's header, returning its tuning (MIDI open pitches, high->low)
// and whether it is a percussion track.
function readTrack(r, ctx, trackNumber) {
  if (trackNumber === 1 || ctx.v500) r.skip(1);
  const flags1 = r.u8();
  const isPercussion = !!(flags1 & 0x01);
  const name = r.byteSizeString(40);
  const stringCount = r.i32();
  const tuning = [];               // high -> low, only first stringCount used
  for (let i = 0; i < 7; i++) {
    const t = r.i32();
    if (i < stringCount) tuning.push(t);
  }
  const port = r.i32();
  const channel = r.i32() - 1;     // channel index
  r.i32();                         // effect channel
  r.i32();                         // fret count
  const capo = r.i32();
  readColor(r);
  r.i16();                         // flags2 (display settings)
  r.u8();                          // auto accentuation
  r.u8();                          // MIDI bank
  r.u8();                          // humanize
  r.i32();                         // clef transpose
  r.i32();                         // clef transpose secondary
  r.i32();                         // unknown (-1 or 100)
  r.skip(12);                      // unknown block
  readRSEInstrument(r, ctx);
  if (!ctx.v500) {
    r.skip(4);                     // 3-band equalizer (4 signed bytes)
    readRSEInstrumentEffect(r, ctx);
  }
  return {
    number: trackNumber,
    name,
    tuning,
    stringCount,
    isPercussion: isPercussion || channel === 9,
    channel,
    port,
    capo,
  };
}

// ---- rhythm helpers --------------------------------------------------------

function gp5DurationToNoteValue(durationByte) {
  const d = Number(durationByte);
  if (!Number.isFinite(d)) return 4;
  return Math.pow(2, d + 2);
}

function gp5TupletToRatio(tuplet) {
  const t = Number(tuplet) || 0;
  if (t <= 0) return null;
  if (t === 3) return { num: 3, den: 2 };
  const den = t === 6 ? 4 : Math.pow(2, Math.floor(Math.log2(t)));
  return { num: t, den };
}

/** GP5 dynamics byte 1 = ppp through 9 = fff; default 6 = f. */
const GP5_DYNAMICS_VELOCITY = [0.30, 0.40, 0.50, 0.62, 0.74, 0.78, 0.86, 0.94, 1.0];

function gp5DynamicsToVelocity(dynamics) {
  if (dynamics == null) return clampVelocity(undefined);
  const d = Number(dynamics);
  if (!Number.isFinite(d)) return clampVelocity(undefined);
  if (d >= 1 && d <= 9) return clampVelocity(GP5_DYNAMICS_VELOCITY[d - 1]);
  return clampVelocity(d);
}

function mapSlideKind(slideByte) {
  const b = Number(slideByte) || 0;
  if (!b) return null;
  if (b & 0x01) return 'shift';
  if (b & 0x02) return 'legato';
  if (b & 0x10) return 'intoFromBelow';
  if (b & 0x20) return 'intoFromAbove';
  if (b & 0x04) return 'outDown';
  if (b & 0x08) return 'outUp';
  return null;
}

function buildTrackInfo(track, ctx) {
  const ch = (ctx.midiChannels && track.channel != null)
    ? ctx.midiChannels[track.channel]
    : null;
  const volumeRaw = ch?.volume;
  const balanceRaw = ch?.balance;
  return normalizeTrackInfo({
    program: ch?.instrument ?? 0,
    midiChannel: track.channel ?? 0,
    isPercussion: track.isPercussion,
    volume: Number.isFinite(volumeRaw) ? volumeRaw / 127 : undefined,
    pan: Number.isFinite(balanceRaw) ? (balanceRaw - 64) / 64 : undefined,
    capo: track.capo ?? 0,
  });
}

// ---- note / beat effect readers --------------------------------------------

function readBend(r) {
  r.i8();                          // type
  r.i32();                         // value
  const pointCount = r.i32();
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const position = r.i32();
    const value = r.i32();
    r.bool();
    if (position >= 0 && position <= 60 && Number.isFinite(value)) {
      points.push({ offset: position / 60, cents: value });
    }
  }
  if (!points.length) return null;
  return { points };
}

// GP5 grace duration byte → written length in quarter notes.
const GRACE_DURATION_QUARTERS = { 1: 0.125, 2: 1 / 6, 3: 0.25 };

function readGrace(r) {
  const fret = r.i8();
  const dynamics = r.i8();
  const transition = r.i8();
  const duration = r.i8();
  r.u8();                          // flags
  const transitions = { 0: null, 1: 'slide', 2: 'bend', 3: 'hammer' };
  return {
    fret,
    dynamics,
    lead: graceLeadQuarters(GRACE_DURATION_QUARTERS[duration]),
    graceTransition: transitions[transition] || null,
  };
}

function readTremoloPicking(r) { r.i8(); }

function readSlides(r) { return r.u8(); } // bitmask of slide types

function readHarmonic(r) {
  const type = r.i8();
  if (type === 2) { r.u8(); r.i8(); r.u8(); } // artificial: semitone, accidental, octave
  else if (type === 3) r.u8();                // tapped: fret
}

function readTrill(r) { r.i8(); r.i8(); } // fret, period

// Returns the set of technique ids attached to a note (excluding dead, which is
// derived from the note type) plus whether it is a HOPO (hammer/pull) origin.
function readNoteEffects(r) {
  const techniques = new Set();
  const flags1 = r.i8();
  const flags2 = r.i8();
  const hopo = !!(flags1 & 0x02);
  let bend = null;
  let slideKind = null;
  let graceInfo = null;
  if (flags2 & 0x02) techniques.add('palmMute');
  if (flags2 & 0x40) techniques.add('vibrato');
  if (flags1 & 0x01) {
    bend = readBend(r);
    techniques.add('bend');
  }
  if (flags1 & 0x10) graceInfo = readGrace(r);
  if (flags2 & 0x04) { readTremoloPicking(r); techniques.add('tremolo'); }
  if (flags2 & 0x08) {
    slideKind = mapSlideKind(readSlides(r));
    techniques.add('slide');
  }
  if (flags2 & 0x10) { readHarmonic(r); techniques.add('harmonic'); }
  if (flags2 & 0x20) { readTrill(r); techniques.add('trill'); }
  return { techniques, hopo, bend, slideKind, graceInfo };
}

// Beat effects precede the notes; returns techniques that apply to every note
// in the beat (slap/tap/pop, beat vibrato).
function readBeatEffects(r) {
  const beatTechniques = [];
  const flags1 = r.i8();
  const flags2 = r.i8();
  if (flags1 & 0x02) beatTechniques.push('vibrato');
  if (flags1 & 0x20) {
    const slap = r.i8();
    if (slap === 1) beatTechniques.push('tap');
    else if (slap === 2) beatTechniques.push('slap');
    else if (slap === 3) beatTechniques.push('pop');
  }
  if (flags2 & 0x04) readBend(r);   // tremolo bar
  if (flags1 & 0x40) r.skip(2);     // beat stroke (down, up)
  if (flags2 & 0x02) r.i8();        // pick stroke
  return beatTechniques;
}

function readChord(r, stringCount) {
  const newFormat = r.bool();
  if (!newFormat) {
    r.intByteSizeString();          // name
    const firstFret = r.i32();
    if (firstFret) for (let i = 0; i < 6; i++) r.i32();
    return;
  }
  // GP4/GP5 new-format diagram (fixed layout, consumed but unused).
  r.bool();                         // sharp
  r.skip(3);
  r.u8(); r.u8(); r.u8();            // root, type, extension
  r.i32(); r.i32();                 // bass, tonality
  r.bool();                         // add
  r.byteSizeString(22);             // name
  r.u8(); r.u8(); r.u8();            // fifth, ninth, eleventh
  r.i32();                          // first fret
  for (let i = 0; i < 7; i++) r.i32(); // frets
  r.u8();                           // barre count
  r.skip(15);                       // 5 frets + 5 starts + 5 ends
  r.skip(7);                        // omissions
  r.skip(1);
  r.skip(7);                        // fingerings
  r.bool();                         // show
}

function readMixTableChange(r, ctx) {
  r.i8();                           // instrument
  readRSEInstrument(r, ctx);
  if (ctx.v500) r.skip(1);
  const volume = r.i8();
  const balance = r.i8();
  const chorus = r.i8();
  const reverb = r.i8();
  const phaser = r.i8();
  const tremolo = r.i8();
  r.intByteSizeString();            // tempo name
  const tempo = r.i32();
  if (volume >= 0) r.i8();
  if (balance >= 0) r.i8();
  if (chorus >= 0) r.i8();
  if (reverb >= 0) r.i8();
  if (phaser >= 0) r.i8();
  if (tremolo >= 0) r.i8();
  let tempoChange = null;
  if (tempo >= 0) {
    r.i8();                         // duration byte
    const linear = !ctx.v500 ? r.bool() : false;
    tempoChange = { bpm: tempo, linear };
  }
  r.i8();                           // flags (all-tracks / RSE / wah)
  r.i8();                           // wah value
  readRSEInstrumentEffect(r, ctx);
  return tempoChange;
}

// ---- note & beat --------------------------------------------------------

// Read the beat's played strings and their notes. Returns { notes } where each
// note is { number, fret, midi, dead, techniques, hopo }.
function readNotes(r, ctx, track, beatTechniques) {
  const stringFlags = r.u8();
  const notes = [];
  for (let idx = 0; idx < track.stringCount; idx++) {
    const number = idx + 1;         // 1 = highest string
    if (!(stringFlags & (1 << (7 - number)))) continue;
    const note = readNote(r, ctx, track, number, beatTechniques);
    if (note) notes.push(note);
  }
  return notes;
}

function readNote(r, ctx, track, number, beatTechniques) {
  const flags = r.u8();
  const accent = !!(flags & 0x40) || !!(flags & 0x02); // accentuated (0x40), heavy accent (0x02)
  const ghost = !!(flags & 0x04);                       // ghost note (0x04)
  let type = 1;                     // 1 normal, 2 tie, 3 dead
  if (flags & 0x20) type = r.u8();
  let dynamics = null;
  if (flags & 0x10) dynamics = r.i8();
  let fret = null;
  if (flags & 0x20) fret = r.i8();
  if (flags & 0x80) { r.i8(); r.i8(); } // fingering
  if (flags & 0x01) r.f64();        // duration percent
  r.u8();                           // flags2 (swap accidentals)
  let effects = {
    techniques: new Set(beatTechniques),
    hopo: false,
    bend: null,
    slideKind: null,
    graceInfo: null,
  };
  if (flags & 0x08) {
    const e = readNoteEffects(r);
    e.techniques.forEach((t) => effects.techniques.add(t));
    effects.hopo = e.hopo;
    effects.bend = e.bend;
    effects.slideKind = e.slideKind;
    effects.graceInfo = e.graceInfo;
  }
  const techniques = [...effects.techniques];
  const noteFields = {
    accent,
    ghost,
    techniques,
    hopo: effects.hopo,
    dynamics,
    bend: effects.bend,
    slideKind: effects.slideKind,
    graceInfo: effects.graceInfo,
  };
  if (type === 2) return { number, tie: true, fret: null, midi: null, dead: false, ...noteFields };
  const dead = type === 3;
  if (dead) return { number, fret: null, midi: null, dead: true, ...noteFields };
  if (fret == null) return null;
  // Percussion: GP5 stores the kit MIDI (or GS value) in the fret field.
  if (track.isPercussion) {
    const midi = normalizeGp5PercussionMidi(fret);
    return { number, fret, midi, dead: false, ...noteFields };
  }
  const open = track.tuning[number - 1];
  const midi = open != null ? open + fret : null;
  return { number, fret, midi, dead: false, ...noteFields };
}

// Read one beat; returns { notes, empty, duration, dotted }.
function readBeat(r, ctx, track) {
  const flags = r.u8();
  let empty = false;
  if (flags & 0x40) {
    const status = r.u8();
    empty = status === 0 || status === 2; // 0 empty, 2 rest
  }
  const durationByte = r.i8();
  let tuplet = 0;
  if (flags & 0x20) tuplet = r.i32();
  const dotted = !!(flags & 0x01);
  const duration = gp5DurationToQuarters(durationByte, tuplet, dotted);
  if (flags & 0x02) readChord(r, track.stringCount);
  // The beat text is the free-text mark a writer puts over a beat. A vocal
  // warm-up score uses it for the vowel or the syllable of that note.
  let text = '';
  if (flags & 0x04) text = r.intByteSizeString() || '';
  let beatTechniques = [];
  if (flags & 0x08) beatTechniques = readBeatEffects(r);
  let mixTempo = null;
  if (flags & 0x10) mixTempo = readMixTableChange(r, ctx);
  const notes = readNotes(r, ctx, track, beatTechniques);
  // gp5 trailing beat display flags
  const flags2 = r.i16();
  if (flags2 & 0x0800) r.u8();      // break secondary beams count
  return {
    notes,
    empty,
    duration,
    dotted,
    durationByte,
    tuplet,
    beatTechniques,
    mixTempo,
    text,
  };
}

// Read one measure (2 voices). Returns array of voices, each an array of beats.
function readMeasure(r, ctx, track) {
  const voices = [];
  for (let v = 0; v < 2; v++) {
    const beatCount = r.i32();
    const beats = [];
    for (let b = 0; b < beatCount; b++) beats.push(readBeat(r, ctx, track));
    voices.push(beats);
  }
  r.u8();                           // line break
  return voices;
}

// ---- top-level song read ---------------------------------------------------

function readInfo(r) {
  for (let i = 0; i < 9; i++) r.intByteSizeString(); // title..instructions
  const notes = r.i32();
  for (let i = 0; i < notes; i++) r.intByteSizeString();
}

function readLyrics(r) {
  r.i32();                          // track choice
  for (let i = 0; i < 5; i++) { r.i32(); r.intSizeString(); }
}

function readPageSetup(r) {
  r.skip(2 * 4);                    // page size
  r.skip(4 * 4);                    // margins
  r.i32();                          // score size proportion
  r.i16();                          // header/footer flags
  for (let i = 0; i < 10; i++) r.intByteSizeString(); // placeholders (copyright is 2)
}

function parseVersionTuple(version) {
  const m = /v(\d+)\.(\d+)/.exec(version || '');
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * Parse a Guitar Pro 5 (.gp5) binary file into per-track TabModels.
 * A GP5 score has several parts; every fretted track is returned.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ tracks: Array<{index:number, name:string, fretted:boolean, model:object|null, tuningPitches:number[]}>, version:string }}
 */
export function parseGp5Tracks(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = new Reader(bytes);
  const version = r.version();
  const vt = parseVersionTuple(version);
  if (!vt || vt.major !== 5) throw new Error('gp5: not a Guitar Pro 5 file');
  const ctx = { v500: vt.minor === 0, midiChannels: null };

  try {
    readInfo(r);
    readLyrics(r);
    if (!ctx.v500) { r.i32(); r.i32(); r.skip(11); } // RSE master effect (vol, reserved, 11-band EQ)
    readPageSetup(r);
    r.intByteSizeString();          // tempo name
    const tempo = r.i32();          // tempo (BPM)
    if (!ctx.v500) r.bool();        // hide tempo
    r.i8();                         // key
    r.i32();                        // octave
    ctx.midiChannels = readMidiChannels(r);
    readDirections(r);
    r.i32();                        // master reverb
    const measureCount = r.i32();
    const trackCount = r.i32();

    const measureHeaders = [];
    for (let i = 0; i < measureCount; i++) measureHeaders.push(readMeasureHeader(r, ctx, i === 0));

    const tracks = [];
    for (let i = 0; i < trackCount; i++) tracks.push(readTrack(r, ctx, i + 1));
    r.skip(ctx.v500 ? 2 : 1);       // trailing blank(s)

    // Measures are stored measure-by-measure across all tracks; collect every
    // track's beats (parsing all of them keeps the stream byte-aligned).
    const measuresByTrack = tracks.map(() => []);
    for (let m = 0; m < measureCount; m++) {
      for (let t = 0; t < trackCount; t++) {
        measuresByTrack[t].push(readMeasure(r, ctx, tracks[t]));
      }
    }

    const scoreTempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
    const built = tracks.map((track, i) => {
      if (track.isPercussion) {
        const model = buildPercussionModel(track, measuresByTrack[i], measureHeaders, scoreTempo, ctx);
        return {
          index: i,
          name: track.name || `Track ${i + 1}`,
          fretted: false,
          isPercussion: true,
          model,
          tuningPitches: [],
        };
      }
      if (!track.tuning.length) {
        return {
          index: i,
          name: track.name || `Track ${i + 1}`,
          fretted: false,
          isPercussion: false,
          model: null,
          tuningPitches: [],
        };
      }
      const model = buildModel(track, measuresByTrack[i], measureHeaders, scoreTempo, ctx);
      return { index: i, name: track.name || `Track ${i + 1}`, fretted: true, isPercussion: false, model, tuningPitches: track.tuning.slice().reverse() };
    });
    return { tracks: built, version, tempo: scoreTempo };
  } catch (e) {
    if (e instanceof RangeError) throw new Error('gp5: unexpected end of file while parsing (unsupported variant?)');
    throw e;
  }
}

/**
 * Backward-compatible single-track parse: returns the first fretted track.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ model: object, meta: object }}
 */
export function parseGp5(input) {
  const { tracks, version } = parseGp5Tracks(input);
  const fretted = tracks.filter((t) => t.fretted && t.model);
  if (!fretted.length) throw new Error('gp5: no fretted track to analyze');
  const def = fretted[0];
  return { model: def.model, meta: { trackName: def.name, tracks: tracks.length, tuningPitches: def.tuningPitches, version } };
}

function emitGuitarNoteEvent({
  n, stringCount, track, voiceCursor, currentSlot, duration,
  voiceIndex, beatIndex, lastByString, techniqueCounts, events,
}) {
  const lowIndex = stringCount - n.number;
  const techniques = n.techniques.slice();
  const prev = lastByString.get(lowIndex);
  let { fret, midi } = n;
  if (n.tie && prev) { fret = prev.fret; midi = prev.midi; }
  if (prev && prev.hopo && midi != null && prev.midi != null) {
    const t = midi >= prev.midi ? 'hammer' : 'pull';
    if (!techniques.includes(t)) techniques.push(t);
  }
  if (midi != null || n.dead) lastByString.set(lowIndex, { midi, fret, hopo: n.hopo });
  if (n.dead) techniques.push('dead');
  for (const t of techniques) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;

  const base = {
    slot: currentSlot,
    stringIndex: lowIndex,
    start: voiceCursor,
    duration,
    voiceIndex,
    beatIndex,
    velocity: gp5DynamicsToVelocity(n.dynamics),
    techniques,
  };
  if (n.tie) base.tie = true;
  if (n.bend) base.bend = n.bend;
  if (n.slideKind) base.slideKind = n.slideKind;

  if (n.dead || midi == null) {
    events.push({ ...base, fret: n.dead ? null : fret, midi: null, pc: null, dead: true });
    return events.length - 1;
  }
  events.push({
    ...base,
    fret,
    midi,
    pc: ((midi % 12) + 12) % 12,
    dead: false,
  });
  return events.length - 1;
}

function emitGraceGuitarEvent({
  n, number, stringCount, track, voiceCursor, currentSlot,
  voiceIndex, beatIndex, events, warnings,
}) {
  if (!n.graceInfo) return;
  const open = track.tuning[number - 1];
  if (open == null) {
    warnings.push('A grace note had no open string pitch for string ' + number + '.');
    return;
  }
  const gFret = n.graceInfo.fret;
  const midi = open + gFret;
  const lowIndex = stringCount - number;
  events.push({
    slot: currentSlot,
    stringIndex: lowIndex,
    fret: gFret,
    midi,
    pc: ((midi % 12) + 12) % 12,
    dead: false,
    start: voiceCursor,
    duration: 0,
    voiceIndex,
    beatIndex,
    grace: true,
    graceTransition: n.graceInfo.graceTransition,
    velocity: gp5DynamicsToVelocity(n.dynamics),
    techniques: [],
  });
}

function pushGp5BeatRhythm({
  beat, measureIndex, voiceIndex, voiceCursor, measureStartBeat,
  beats, rests, tempoMap, beatTechniques,
}) {
  const duration = Number.isFinite(beat.duration) && beat.duration > 0 ? beat.duration : 1;
  const noteValue = gp5DurationToNoteValue(beat.durationByte);
  const dots = beat.dotted ? 1 : 0;
  const tuplet = gp5TupletToRatio(beat.tuplet);
  const rhythm = { duration, noteValue, dots, tuplet };

  if (beat.mixTempo) {
    const bpm = Number(beat.mixTempo.bpm);
    if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 320) {
      tempoMap.push({
        barIndex: measureIndex,
        beat: voiceCursor - measureStartBeat,
        bpm,
        linear: !!beat.mixTempo.linear,
      });
    }
  }

  const techs = beatTechniques.length ? beatTechniques.slice() : undefined;
  const text = typeof beat.text === 'string' ? beat.text.trim() : '';
  const beatEntry = {
    measureIndex,
    voiceIndex,
    start: voiceCursor,
    ...rhythm,
    rest: !!beat.empty,
    noteIndices: [],
    techniques: techs,
  };
  if (text) beatEntry.text = text;

  if (beat.empty) {
    rests.push({
      measureIndex,
      voiceIndex,
      start: voiceCursor,
      ...rhythm,
    });
  }

  beats.push(beatEntry);
  return { ...rhythm, beatIndex: beats.length - 1 };
}

// One grace drum hit, timed to sound `lead` quarters before its beat.
// `beats[].noteIndices` never holds a grace hit: the beat owns the notes that
// carry its rhythm, and the score timeline reads grace hits by `beatIndex`.
function percussionGraceEvent({ grace, voiceCursor, voiceIndex, beatIndex }) {
  const midi = normalizeGp5PercussionMidi(grace.fret);
  if (midi == null) return null;
  const written = dynamicsToVelocity(grace.dynamics);
  const instrument = midiToDrumInstrument(midi, { velocity: written });
  if (!instrument) return null;
  return {
    start: voiceCursor,
    duration: grace.lead,
    instrument,
    velocity: drumHitVelocity(written, { grace: true }),
    midi,
    accent: false,
    voiceIndex,
    beatIndex,
    grace: true,
  };
}

function buildPercussionModel(track, measures, measureHeaders = [], tempo = 120, ctx = {}) {
  const events = [];
  const measureSpans = [];
  const beats = [];
  const rests = [];
  const tempoMap = [];
  const warnings = [];
  let cursor = 0;
  let measureIndex = 0;
  let currentTimeSig = [4, 4];
  let maxVoiceUsed = -1;

  if (Number.isFinite(tempo) && tempo >= 40 && tempo <= 320) {
    tempoMap.push({ barIndex: 0, beat: 0, bpm: tempo, linear: false });
  }

  for (const voices of measures) {
    const measureStartBeat = cursor;
    const header = measureHeaders[measureIndex] || {};
    const marker = header.marker || null;
    const repeat = header.repeat || null;
    if (header.timeSig) currentTimeSig = header.timeSig;

    let measureEndBeat = measureStartBeat;
    let anyVoiceAdvanced = false;

    for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex += 1) {
      const voice = voices[voiceIndex];
      if (!voice?.length) continue;
      let voiceCursor = measureStartBeat;
      let voiceUsed = false;

      for (const beat of voice) {
        const beatTechniques = beat.beatTechniques || [];
        const rhythm = pushGp5BeatRhythm({
          beat,
          measureIndex,
          voiceIndex,
          voiceCursor,
          measureStartBeat,
          beats,
          rests,
          tempoMap,
          beatTechniques,
        });
        const duration = rhythm.duration;
        const beatIndex = rhythm.beatIndex;

        if (!beat.empty) {
          const noteIndices = [];
          const graceNotes = [];
          for (const n of beat.notes) {
            if (n.dead || n.tie || n.midi == null) continue;
            const written = dynamicsToVelocity(n.dynamics);
            const instrument = midiToDrumInstrument(n.midi, { velocity: written, ghost: n.ghost });
            if (!instrument) continue;
            if (n.graceInfo) graceNotes.push(n.graceInfo);
            noteIndices.push(events.length);
            events.push({
              start: voiceCursor,
              duration,
              instrument,
              velocity: drumHitVelocity(written, {
                accent: n.accent,
                ghost: instrument === 'snareGhost',
              }),
              midi: n.midi,
              accent: n.accent,
              voiceIndex,
              beatIndex,
            });
          }
          // A grace hit sounds just before the beat, and it draws before the
          // main hit. On the lane of one of the beat's own hits it makes a
          // flam, and both strokes carry the mark.
          const mainEvents = noteIndices.map((i) => events[i]);
          for (const grace of graceNotes) {
            const graceEvent = percussionGraceEvent({
              grace, voiceCursor, voiceIndex, beatIndex,
            });
            if (!graceEvent) continue;
            markFlamPair(graceEvent, mainEvents);
            events.push(graceEvent);
          }
          if (beats[beatIndex] && !beats[beatIndex].rest) {
            beats[beatIndex].noteIndices = noteIndices;
          }
        }

        voiceCursor += duration;
        voiceUsed = true;
        anyVoiceAdvanced = true;
      }
      if (voiceUsed) maxVoiceUsed = Math.max(maxVoiceUsed, voiceIndex);
      measureEndBeat = Math.max(measureEndBeat, voiceCursor);
    }

    if (!anyVoiceAdvanced) {
      const beatsInBar = currentTimeSig[0] * (4 / (currentTimeSig[1] || 4));
      measureEndBeat = measureStartBeat + beatsInBar;
    }

    cursor = measureEndBeat;
    const span = {
      startBeat: measureStartBeat,
      endBeat: measureEndBeat,
      marker,
      timeSig: currentTimeSig.slice(),
    };
    if (repeat) span.repeat = repeat;
    measureSpans.push(span);
    measureIndex += 1;
  }

  if (!events.length) {
    warnings.push('The percussion track had no mappable drum hits.');
  }

  const slottedEvents = assignPercussionSlots(events);
  const measuresWithSlots = deriveMeasureSlotSpans(measureSpans, slottedEvents);
  const voiceCount = Math.max(1, maxVoiceUsed + 1);

  const model = makePercussionModel({
    name: track.name || 'Drums',
    tempo,
    events: slottedEvents,
    measures: measuresWithSlots,
    warnings,
    beats,
  });
  return {
    ...model,
    rests,
    voiceCount,
    trackInfo: buildTrackInfo(track, ctx),
    tempoMap,
  };
}

function buildModel(track, measures, measureHeaders = [], tempo = 120, ctx = {}) {
  if (!track || !track.tuning.length) throw new Error('gp5: no fretted track to analyze');
  const openMidis = track.tuning.slice().reverse(); // low -> high
  const strings = openMidis.map((m) => {
    const s = midiToNoteOct(m);
    return { note: s.note, oct: s.oct, label: s.note, openMidi: m };
  });
  const tuningName = matchTuningName(openMidis) || 'Custom';
  const stringCount = track.stringCount;

  const events = [];
  const measureSpans = [];
  const beats = [];
  const rests = [];
  const tempoMap = [];
  const techniqueCounts = {};
  const warnings = [];
  const lastByString = new Map();

  let slot = 0;
  let cursor = 0;
  let measureIndex = 0;
  let currentTimeSig = [4, 4];
  let maxVoiceUsed = -1;

  if (Number.isFinite(tempo) && tempo >= 40 && tempo <= 320) {
    tempoMap.push({ barIndex: 0, beat: 0, bpm: tempo, linear: false });
  }

  for (const voices of measures) {
    const measureStart = slot;
    const measureStartBeat = cursor;
    const header = measureHeaders[measureIndex] || {};
    const marker = header.marker || null;
    const repeat = header.repeat || null;
    if (header.timeSig) currentTimeSig = header.timeSig;

    const startToSlot = new Map();
    let advanced = false;

    for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex += 1) {
      const voice = voices[voiceIndex] || [];
      if (!voice.length) continue;
      let voiceCursor = measureStartBeat;
      let voiceUsed = false;

      for (const beat of voice) {
        const beatTechniques = beat.beatTechniques || [];
        const rhythm = pushGp5BeatRhythm({
          beat,
          measureIndex,
          voiceIndex,
          voiceCursor,
          measureStartBeat,
          beats,
          rests,
          tempoMap,
          beatTechniques,
        });
        const duration = rhythm.duration;
        const beatIndex = rhythm.beatIndex;

        let currentSlot;
        if (voiceIndex === 0) {
          currentSlot = slot;
          startToSlot.set(voiceCursor, currentSlot);
        } else {
          currentSlot = startToSlot.has(voiceCursor)
            ? startToSlot.get(voiceCursor)
            : slot;
        }

        const noteIndices = [];

        if (!beat.empty) {
          for (const n of beat.notes) {
            emitGraceGuitarEvent({
              n,
              number: n.number,
              stringCount,
              track,
              voiceCursor,
              currentSlot,
              voiceIndex,
              beatIndex,
              events,
              warnings,
            });
            const idx = emitGuitarNoteEvent({
              n,
              stringCount,
              track,
              voiceCursor,
              currentSlot,
              duration,
              voiceIndex,
              beatIndex,
              lastByString,
              techniqueCounts,
              events,
            });
            if (idx != null) noteIndices.push(idx);
          }
          if (beats[beatIndex] && !beats[beatIndex].rest) {
            beats[beatIndex].noteIndices = noteIndices;
          }
        }

        if (voiceIndex === 0) slot += 1;
        voiceCursor += duration;
        voiceUsed = true;
        advanced = true;
      }
      if (voiceUsed) maxVoiceUsed = Math.max(maxVoiceUsed, voiceIndex);
    }

    if (!advanced) {
      const beatsInBar = currentTimeSig[0] * (4 / (currentTimeSig[1] || 4));
      slot += 1;
      cursor += beatsInBar;
    } else {
      cursor = Math.max(cursor, measureStartBeat);
      for (let vi = 0; vi < voices.length; vi += 1) {
        const voice = voices[vi] || [];
        let vc = measureStartBeat;
        for (const beat of voice) {
          const d = Number.isFinite(beat.duration) && beat.duration > 0 ? beat.duration : 1;
          vc += d;
        }
        cursor = Math.max(cursor, vc);
      }
    }

    const span = {
      startSlot: measureStart,
      endSlot: slot,
      startBeat: measureStartBeat,
      endBeat: cursor,
      marker,
      timeSig: currentTimeSig.slice(),
    };
    if (repeat) span.repeat = repeat;
    measureSpans.push(span);
    measureIndex += 1;
  }

  events.sort((a, b) => (a.slot - b.slot) || (a.stringIndex - b.stringIndex));
  if (!events.some((e) => e.fret != null || e.dead)) {
    warnings.push('The Guitar Pro 5 track had no playable notes on the analyzed staff.');
  }

  const voiceCount = Math.max(1, maxVoiceUsed + 1);

  return {
    tuning: tuningName,
    strings,
    events,
    slots: events.length ? Math.max(...events.map((e) => e.slot)) + 1 : slot,
    measures: measureSpans,
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    totalBeats: cursor,
    techniqueCounts,
    warnings,
    beats,
    rests,
    voiceCount,
    trackInfo: buildTrackInfo(track, ctx),
    tempoMap,
  };
}
