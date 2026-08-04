// Shared data shapes and small helpers for the guitar-tab analyzer / player.
//
// A parsed tab is described by a `TabModel`:
//   {
//     tuning: string,                 // tuning name (or 'Custom')
//     strings: [{ label, note, oct, openMidi }],  // low -> high index
//     events: [TabEvent],             // ordered by slot then string
//     slots: number,                  // total time slots (weak timing proxy)
//     measures: [{ startSlot, endSlot, startBeat, endBeat, marker, timeSig }],
//     tempo: number,                  // BPM (quarter-note), when known from GP
//     totalBeats: number,             // length in quarter-note units
//     techniqueCounts: { [tech]: number },
//     warnings: string[],
//   }
//
// A `TabEvent` is one played note:
//   {
//     slot, stringIndex, fret, midi, pc, techniques: string[], dead: bool,
//     start?: number,      // absolute position in quarter-note units
//     duration?: number,   // length in quarter-note units
//   }

import { parseNote, TUNINGS, NOTE_NAMES_SHARP } from '../theory.js';

// Canonical technique identifiers and their human labels.
export const TECHNIQUE_LABELS = {
  hammer: 'Hammer-on',
  pull: 'Pull-off',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  slide: 'Slide',
  bend: 'Bend',
  release: 'Bend release',
  vibrato: 'Vibrato',
  tap: 'Tapping',
  slap: 'Slap',
  pop: 'Pop',
  harmonic: 'Harmonic',
  palmMute: 'Palm mute',
  dead: 'Dead / muted note',
  tremolo: 'Tremolo picking',
  trill: 'Trill',
};

// Legato techniques (smooth, un-picked note connections).
export const LEGATO_TECHNIQUES = new Set(['hammer', 'pull', 'slideUp', 'slideDown', 'slide']);

// Open-string MIDI for a tuning string descriptor { note, oct }.
export function stringOpenMidi(str) {
  const p = parseNote(str.note);
  if (!p) return null;
  return 12 * (str.oct + 1) + p.semi;
}

// Resolve a tuning name or a custom array to normalized string descriptors,
// ordered low -> high (matching the TUNINGS convention).
export function resolveTuning(tuning) {
  let arr = null;
  let name = 'Custom';
  if (typeof tuning === 'string' && TUNINGS[tuning]) {
    arr = TUNINGS[tuning];
    name = tuning;
  } else if (Array.isArray(tuning)) {
    arr = tuning;
  } else {
    arr = TUNINGS['Standard'];
    name = 'Standard';
  }
  const strings = arr.map((s) => ({
    note: s.note,
    oct: s.oct,
    label: s.note,
    openMidi: stringOpenMidi(s),
  }));
  return { name, strings };
}

/** Map a GPIF NoteValue name (Whole/Half/Quarter/…) to its denominator. */
export const GPIF_NOTE_VALUES = {
  Whole: 1,
  Half: 2,
  Quarter: 4,
  Eighth: 8,
  '16th': 16,
  '32nd': 32,
  '64th': 64,
  '128th': 128,
};

/**
 * Convert a rhythmic value to quarter-note units.
 * @param {number} noteValueDenom  1=whole … 4=quarter … 16=16th
 * @param {number} [dots=0]
 * @param {number} [tupletNum=0]   enters (e.g. 3 for triplet)
 * @param {number} [tupletDen=0]   times  (e.g. 2 for triplet)
 */
export function noteValueToQuarters(noteValueDenom, dots = 0, tupletNum = 0, tupletDen = 0) {
  const denom = Number(noteValueDenom) || 4;
  let q = 4 / denom;
  const d = Math.max(0, Math.min(2, Number(dots) || 0));
  if (d === 1) q *= 1.5;
  else if (d === 2) q *= 1.75;
  const num = Number(tupletNum) || 0;
  const den = Number(tupletDen) || 0;
  if (num > 0 && den > 0) q *= den / num;
  return q;
}

/**
 * GP5 duration byte → quarter-note units.
 * GP stores: -2=whole, -1=half, 0=quarter, 1=eighth, 2=16th, …
 */
export function gp5DurationToQuarters(durationByte, tuplet = 0, dotted = false) {
  let q = Math.pow(2, -(Number(durationByte) || 0));
  if (dotted) q *= 1.5;
  const t = Number(tuplet) || 0;
  // GP5 stores tuplet as "how many of this value in the space of the next lower";
  // common values: 3 (triplet), 5, 6, 7… Map 3 → 3:2, 5 → 5:4, 6 → 6:4, 7 → 7:4.
  if (t === 3) q *= 2 / 3;
  else if (t > 0) q *= (t === 6 ? 4 : Math.pow(2, Math.floor(Math.log2(t)))) / t;
  return q;
}

export function midiToNoteOct(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return { note: NOTE_NAMES_SHARP[pc], oct: Math.floor(midi / 12) - 1, openMidi: midi };
}

/** Deep-ish clone of a TabModel (events/measures/strings copied). */
export function cloneModel(model) {
  if (!model) return null;
  return {
    ...model,
    strings: (model.strings || []).map((s) => ({ ...s })),
    events: (model.events || []).map((e) => ({
      ...e,
      techniques: Array.isArray(e.techniques) ? e.techniques.slice() : [],
    })),
    measures: (model.measures || []).map((m) => ({
      ...m,
      timeSig: m.timeSig ? m.timeSig.slice() : undefined,
    })),
    techniqueCounts: { ...(model.techniqueCounts || {}) },
    warnings: (model.warnings || []).slice(),
    tempoMap: (model.tempoMap || []).map((t) => ({ ...t })),
  };
}

/**
 * Shift every pitched event by `semitones`. Frets are rewritten on the same
 * string when possible; otherwise the nearest playable string is chosen.
 */
export function transposeModel(model, semitones) {
  const out = cloneModel(model);
  const n = Number(semitones) || 0;
  if (!out || !n) return out;
  for (const ev of out.events) {
    if (ev.dead || ev.midi == null) continue;
    const target = ev.midi + n;
    placePitchOnModel(out, ev, target);
  }
  return out;
}

/**
 * Change the model's open-string tuning.
 * When `preservePitch` is true (default), frets/strings are rewritten so
 * sounding MIDI stays the same. When false, frets stay and MIDI is recomputed
 * from the new open pitches (same fingerings, different sound).
 */
export function retuneModel(model, tuning, { preservePitch = true } = {}) {
  const out = cloneModel(model);
  if (!out) return out;
  const resolved = resolveTuning(tuning);
  // Only apply when string counts match; otherwise keep original and warn.
  if (resolved.strings.length !== out.strings.length) {
    out.warnings = out.warnings || [];
    out.warnings.push(
      `Tuning "${resolved.name}" has ${resolved.strings.length} strings; track has ${out.strings.length}. Kept original tuning.`
    );
    return out;
  }
  const oldStrings = out.strings;
  out.tuning = resolved.name;
  out.strings = resolved.strings.map((s) => ({ ...s }));

  for (const ev of out.events) {
    if (ev.dead) continue;
    if (preservePitch) {
      if (ev.midi == null) continue;
      placePitchOnModel(out, ev, ev.midi);
    } else {
      const open = out.strings[ev.stringIndex]?.openMidi;
      if (open == null || ev.fret == null) continue;
      ev.midi = open + ev.fret;
      ev.pc = ((ev.midi % 12) + 12) % 12;
    }
  }
  // Drop unused old reference.
  void oldStrings;
  return out;
}

/** Apply transpose then retune (preserve pitch) for practice playback. */
export function transformModel(model, { transpose = 0, tuning = null, preservePitch = true } = {}) {
  let out = cloneModel(model);
  if (!out) return out;
  if (transpose) out = transposeModel(out, transpose);
  if (tuning != null && tuning !== '' && tuning !== out.tuning) {
    out = retuneModel(out, tuning, { preservePitch });
  }
  return out;
}

/** Place a target MIDI onto an event, preferring its current string. */
function placePitchOnModel(model, ev, targetMidi) {
  const strings = model.strings || [];
  const prefer = ev.stringIndex;
  const tryPlace = (si) => {
    const open = strings[si]?.openMidi;
    if (open == null) return false;
    const fret = targetMidi - open;
    if (fret < 0 || fret > 24) return false;
    ev.stringIndex = si;
    ev.fret = fret;
    ev.midi = targetMidi;
    ev.pc = ((targetMidi % 12) + 12) % 12;
    return true;
  };
  if (tryPlace(prefer)) return;
  // Search nearest string by open pitch distance.
  const order = strings
    .map((s, i) => ({ i, d: Math.abs((s.openMidi ?? 0) - targetMidi) }))
    .sort((a, b) => a.d - b.d);
  for (const { i } of order) {
    if (tryPlace(i)) return;
  }
  // Last resort: clamp on preferred string.
  const open = strings[prefer]?.openMidi;
  if (open != null) {
    ev.fret = Math.max(0, Math.min(24, targetMidi - open));
    ev.midi = open + ev.fret;
    ev.pc = ((ev.midi % 12) + 12) % 12;
  }
}

/** Seconds for a duration in quarter-note units at a given BPM. */
export function quartersToSeconds(quarters, bpm) {
  const b = Number(bpm) || 120;
  return (Number(quarters) || 0) * (60 / b);
}

/** Does this model carry real rhythm (vs equal-slot ASCII)? */
export function modelHasRhythm(model) {
  return !!(model && (
    Number.isFinite(model.tempo) ||
    (model.events || []).some((e) => Number.isFinite(e.duration) && e.duration > 0)
  ));
}
