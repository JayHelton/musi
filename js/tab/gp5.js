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
function readMarker(r) { r.intByteSizeString(); readColor(r); }

function readMidiChannels(r) {
  for (let i = 0; i < 64; i++) {
    r.i32();                       // instrument
    r.skip(6);                     // volume,balance,chorus,reverb,phaser,tremolo
    r.skip(2);                     // 3.0 backward-compat blanks
  }
}

function readDirections(r) { for (let i = 0; i < 19; i++) r.i16(); }

function readRSEInstrument(r, ctx) {
  r.i32(); r.i32(); r.i32();       // instrument, unknown, soundBank
  if (ctx.v500) { r.i16(); r.skip(1); } else r.i32(); // effect number
}

function readRSEInstrumentEffect(r, ctx) {
  if (!ctx.v500) { r.intByteSizeString(); r.intByteSizeString(); }
}

function readMeasureHeader(r, ctx, isFirst) {
  if (!isFirst) r.skip(1);
  const flags = r.u8();
  if (flags & 0x01) r.i8();        // numerator
  if (flags & 0x02) r.i8();        // denominator
  if (flags & 0x08) r.i8();        // repeat close count
  if (flags & 0x20) readMarker(r);
  if (flags & 0x40) { r.i8(); r.i8(); } // key signature
  if (flags & 0x10) r.u8();        // repeat alternative
  if (flags & 0x03) r.skip(4);     // time-signature beams
  if ((flags & 0x10) === 0) r.skip(1);
  r.u8();                          // triplet feel
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
  r.i32();                         // port
  const channel = r.i32() - 1;     // channel index
  r.i32();                         // effect channel
  r.i32();                         // fret count
  r.i32();                         // capo
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
  return { number: trackNumber, name, tuning, stringCount, isPercussion: isPercussion || channel === 9 };
}

// ---- note / beat effect readers --------------------------------------------

function readBend(r) {
  r.i8();                          // type
  r.i32();                         // value
  const points = r.i32();
  for (let i = 0; i < points; i++) { r.i32(); r.i32(); r.bool(); }
}

function readGrace(r) { r.skip(5); } // fret, velocity, transition, duration, flags

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
  if (flags2 & 0x02) techniques.add('palmMute');
  if (flags2 & 0x40) techniques.add('vibrato');
  if (flags1 & 0x01) { readBend(r); techniques.add('bend'); }
  if (flags1 & 0x10) readGrace(r);
  if (flags2 & 0x04) { readTremoloPicking(r); techniques.add('tremolo'); }
  if (flags2 & 0x08) { readSlides(r); techniques.add('slide'); }
  if (flags2 & 0x10) { readHarmonic(r); techniques.add('harmonic'); }
  if (flags2 & 0x20) { readTrill(r); techniques.add('trill'); }
  return { techniques, hopo };
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
  if (tempo >= 0) { r.i8(); if (!ctx.v500) r.bool(); }
  r.i8();                           // flags (all-tracks / RSE / wah)
  r.i8();                           // wah value
  readRSEInstrumentEffect(r, ctx);
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
  let type = 1;                     // 1 normal, 2 tie, 3 dead
  if (flags & 0x20) type = r.u8();
  if (flags & 0x10) r.i8();         // dynamics
  let fret = null;
  if (flags & 0x20) fret = r.i8();
  if (flags & 0x80) { r.i8(); r.i8(); } // fingering
  if (flags & 0x01) r.f64();        // duration percent
  r.u8();                           // flags2 (swap accidentals)
  let effects = { techniques: new Set(beatTechniques), hopo: false };
  if (flags & 0x08) {
    const e = readNoteEffects(r);
    e.techniques.forEach((t) => effects.techniques.add(t));
    effects.hopo = e.hopo;
  }
  const techniques = [...effects.techniques];
  if (type === 2) return { number, tie: true, fret: null, midi: null, dead: false, techniques, hopo: effects.hopo };
  const dead = type === 3;
  if (dead) return { number, fret: null, midi: null, dead: true, techniques, hopo: effects.hopo };
  if (fret == null) return null;
  const open = track.tuning[number - 1];
  const midi = open != null ? open + fret : null;
  return { number, fret, midi, dead: false, techniques, hopo: effects.hopo };
}

// Read one beat; returns { notes, empty } or null on rest.
function readBeat(r, ctx, track) {
  const flags = r.u8();
  let empty = false;
  if (flags & 0x40) { const status = r.u8(); empty = status === 0; } // 0 empty, 2 rest
  // duration
  r.i8();
  if (flags & 0x20) r.i32();        // tuplet
  if (flags & 0x02) readChord(r, track.stringCount);
  if (flags & 0x04) r.intByteSizeString(); // text
  let beatTechniques = [];
  if (flags & 0x08) beatTechniques = readBeatEffects(r);
  if (flags & 0x10) readMixTableChange(r, ctx);
  const notes = readNotes(r, ctx, track, beatTechniques);
  // gp5 trailing beat display flags
  const flags2 = r.i16();
  if (flags2 & 0x0800) r.u8();      // break secondary beams count
  return { notes, empty };
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
  const ctx = { v500: vt.minor === 0 };

  try {
    readInfo(r);
    readLyrics(r);
    if (!ctx.v500) { r.i32(); r.i32(); r.skip(11); } // RSE master effect (vol, reserved, 11-band EQ)
    readPageSetup(r);
    r.intByteSizeString();          // tempo name
    r.i32();                        // tempo
    if (!ctx.v500) r.bool();        // hide tempo
    r.i8();                         // key
    r.i32();                        // octave
    readMidiChannels(r);
    readDirections(r);
    r.i32();                        // master reverb
    const measureCount = r.i32();
    const trackCount = r.i32();

    for (let i = 0; i < measureCount; i++) readMeasureHeader(r, ctx, i === 0);

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

    const built = tracks.map((track, i) => {
      if (track.isPercussion || !track.tuning.length) {
        return { index: i, name: track.name || `Track ${i + 1}`, fretted: false, model: null, tuningPitches: [] };
      }
      const model = buildModel(track, measuresByTrack[i]);
      return { index: i, name: track.name || `Track ${i + 1}`, fretted: true, model, tuningPitches: track.tuning.slice().reverse() };
    });
    return { tracks: built, version };
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

function buildModel(track, measures) {
  if (!track || !track.tuning.length) throw new Error('gp5: no fretted track to analyze');
  const openMidis = track.tuning.slice().reverse(); // low -> high
  const strings = openMidis.map((m) => { const s = midiToNoteOct(m); return { note: s.note, oct: s.oct, label: s.note, openMidi: m }; });
  const tuningName = matchTuningName(openMidis) || 'Custom';
  const stringCount = track.stringCount;

  const events = [];
  const measureSpans = [];
  const techniqueCounts = {};
  const warnings = [];
  const lastByString = new Map();

  let slot = 0;
  for (const voices of measures) {
    const measureStart = slot;
    // Prefer the first voice that actually plays notes.
    const voice = voices.find((bts) => bts.some((b) => b.notes.length)) || voices[0] || [];
    for (const beat of voice) {
      for (const n of beat.notes) {
        const lowIndex = stringCount - n.number; // 0 = lowest string
        const techniques = n.techniques.slice();

        const prev = lastByString.get(lowIndex);
        // A tie inherits the sounding pitch of the previous note on the string.
        let { fret, midi } = n;
        if (n.tie && prev) { fret = prev.fret; midi = prev.midi; }

        if (prev && prev.hopo && midi != null && prev.midi != null) {
          const t = midi >= prev.midi ? 'hammer' : 'pull';
          if (!techniques.includes(t)) techniques.push(t);
        }
        if (midi != null || n.dead) lastByString.set(lowIndex, { midi, fret, hopo: n.hopo });

        if (n.dead) techniques.push('dead');
        for (const t of techniques) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;

        if (n.dead || midi == null) {
          events.push({ slot, stringIndex: lowIndex, fret: n.dead ? null : fret, midi: null, pc: null, techniques, dead: true });
        } else {
          events.push({ slot, stringIndex: lowIndex, fret, midi, pc: ((midi % 12) + 12) % 12, techniques, dead: false });
        }
      }
      slot += 1;
    }
    if (slot === measureStart) slot += 1;
    measureSpans.push({ startSlot: measureStart, endSlot: slot });
  }

  events.sort((a, b) => (a.slot - b.slot) || (a.stringIndex - b.stringIndex));
  if (!events.some((e) => e.fret != null || e.dead)) {
    warnings.push('The Guitar Pro 5 track had no playable notes on the analyzed staff.');
  }

  return {
    tuning: tuningName,
    strings,
    events,
    slots: events.length ? Math.max(...events.map((e) => e.slot)) + 1 : slot,
    measures: measureSpans,
    techniqueCounts,
    warnings,
  };
}
