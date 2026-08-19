// Shared data shapes and small helpers for the guitar-tab analyzer / player.
//
// A parsed tab is described by a `TabModel`:
//   {
//     tuning: string,                 // tuning name (or 'Custom')
//     strings: [{ label, note, oct, openMidi }],  // low -> high index
//     events: [TabEvent],             // ordered by slot then string
//     slots: number,                  // total time slots (weak timing proxy)
//     measures: [Measure],            // written bar list
//     tempo: number,                  // BPM (quarter-note), when known from GP
//     totalBeats: number,             // length in quarter-note units
//     techniqueCounts: { [tech]: number },
//     warnings: string[],
//     tempoMap?: [{ barIndex, beat, bpm, linear }],  // tempo automations
//     beats?: [Beat],                 // rhythmic layer per voice
//     rests?: [Rest],                 // explicit rest list for the view
//     trackInfo?: TrackInfo,          // mixer and instrument data
//     voiceCount?: number,            // voice count the track uses (1–4)
//   }
//
// A `Measure` entry:
//   {
//     startSlot, endSlot, startBeat?, endBeat?, marker?, timeSig?,
//     repeat?: { open, closeCount, endings } | null,
//   }
//
// A `Beat` entry (`model.beats[]`):
//   {
//     measureIndex, voiceIndex, start, duration, noteValue, dots,
//     tuplet?: { num, den } | null, rest, techniques?: string[],
//     noteIndices?: number[],         // indexes into model.events
//   }
//
// A `Rest` entry (`model.rests[]`):
//   {
//     measureIndex, voiceIndex, start, duration, noteValue, dots,
//     tuplet?: { num, den } | null,
//   }
//
// `TrackInfo` (`model.trackInfo`):
//   { program?, midiChannel?, isPercussion?, volume?, pan?, capo? }
//
// A `TabEvent` is one played note:
//   {
//     slot, stringIndex, fret, midi, pc, techniques: string[], dead: bool,
//     start?: number,      // absolute position in quarter-note units
//     duration?: number,   // length in quarter-note units
//     voiceIndex?: number,
//     beatIndex?: number,  // index into model.beats
//     velocity?: number,   // dynamic level 0 to 1
//     tie?: boolean,
//     grace?: boolean,
//     graceTransition?: string | null,
//     bend?: { points: [{ offset, cents }] } | null,
//     slideKind?: 'shift' | 'legato' | 'intoFromBelow' | 'intoFromAbove'
//               | 'outDown' | 'outUp' | null,
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
  QuadrupleWhole: 0.25,
  Long: 0.25,
  DoubleWhole: 0.5,
  Whole: 1,
  Half: 2,
  Quarter: 4,
  Eighth: 8,
  '16th': 16,
  Sixteenth: 16,
  '32nd': 32,
  '64th': 64,
  '128th': 128,
  '256th': 256,
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

/** Longest lead-in a grace note may take before its main beat, in quarters. */
export const MAX_GRACE_LEAD_QUARTERS = 0.25;

/** Lead-in used when the file gives no usable grace length. */
export const DEFAULT_GRACE_LEAD_QUARTERS = 0.125;

/**
 * Lead-in a grace note takes before the beat that it decorates.
 * A flam sits close to its main note, so a long written value is clamped.
 * @param {number} [quarters] written length of the grace note in quarters
 * @returns {number} lead-in in quarter-note units
 */
export function graceLeadQuarters(quarters) {
  const q = Number(quarters);
  if (!Number.isFinite(q) || q <= 0) return DEFAULT_GRACE_LEAD_QUARTERS;
  return Math.min(MAX_GRACE_LEAD_QUARTERS, q);
}

/**
 * Sort model events and keep every `beats[].noteIndices` reference correct.
 * Each beat stores positions in the event array. A plain sort moves the
 * events but leaves those positions behind, so the beat then points at
 * another beat's notes. This returns the sorted events and matching beats.
 * @param {object[]} events
 * @param {object[]} [beats]
 * @param {(a:object,b:object)=>number} compare
 * @returns {{ events: object[], beats: object[] }}
 */
export function sortEventsWithBeats(events, beats, compare) {
  const entries = (events || []).map((ev, index) => ({ ev, index }));
  entries.sort((a, b) => compare(a.ev, b.ev) || (a.index - b.index));
  const newIndexByOld = new Map();
  entries.forEach((entry, newIndex) => newIndexByOld.set(entry.index, newIndex));
  const sorted = entries.map((entry) => entry.ev);
  const remapped = (beats || []).map((beat) => {
    if (!beat?.noteIndices) return beat;
    return {
      ...beat,
      noteIndices: beat.noteIndices
        .map((old) => newIndexByOld.get(old))
        .filter((idx) => idx != null),
    };
  });
  return { events: sorted, beats: remapped };
}

export function midiToNoteOct(midi) {
  const pc = ((midi % 12) + 12) % 12;
  return { note: NOTE_NAMES_SHARP[pc], oct: Math.floor(midi / 12) - 1, openMidi: midi };
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Clamp a TabEvent velocity to 0–1; invalid input falls back to 0.78. */
export function clampVelocity(value) {
  return clampFloat(value, 0.78, 0, 1);
}

/** Normalize trackInfo with defaults from the data model. */
export function normalizeTrackInfo(info) {
  const src = info || {};
  return {
    program: clampInt(src.program, 0, 0, 127),
    midiChannel: clampInt(src.midiChannel, 0, 0, 15),
    isPercussion: Boolean(src.isPercussion),
    volume: clampFloat(src.volume, 1, 0, 1),
    pan: clampFloat(src.pan, 0, -1, 1),
    capo: clampInt(src.capo, 0, 0, 12),
  };
}

function cloneTuplet(tuplet) {
  if (!tuplet) return tuplet;
  return { ...tuplet };
}

function cloneRepeat(repeat) {
  if (!repeat) return repeat;
  const out = { ...repeat };
  if (repeat.endings != null) out.endings = repeat.endings.slice();
  return out;
}

function cloneBend(bend) {
  if (!bend) return bend;
  return {
    ...bend,
    points: (bend.points || []).map((p) => ({ ...p })),
  };
}

function cloneEvent(e) {
  const out = {
    ...e,
    techniques: Array.isArray(e.techniques) ? e.techniques.slice() : [],
  };
  if (e.bend != null) out.bend = cloneBend(e.bend);
  return out;
}

function cloneBeat(b) {
  const out = { ...b };
  if (b.tuplet != null) out.tuplet = cloneTuplet(b.tuplet);
  if (b.noteIndices != null) out.noteIndices = b.noteIndices.slice();
  if (b.techniques != null) out.techniques = b.techniques.slice();
  return out;
}

function cloneRest(r) {
  const out = { ...r };
  if (r.tuplet != null) out.tuplet = cloneTuplet(r.tuplet);
  return out;
}

function cloneMeasure(m) {
  const out = {
    ...m,
    timeSig: m.timeSig ? m.timeSig.slice() : undefined,
  };
  if (m.repeat != null) out.repeat = cloneRepeat(m.repeat);
  return out;
}

function getModelLength(model) {
  const tb = Number(model.totalBeats);
  if (Number.isFinite(tb) && tb >= 0) return tb;
  const measures = model.measures || [];
  if (measures.length) {
    const last = measures[measures.length - 1];
    const end = Number(last.endBeat);
    if (Number.isFinite(end)) return end;
  }
  return 0;
}

function modelPartTempo(model) {
  if (Number.isFinite(model.tempo)) return model.tempo;
  const tm = model.tempoMap;
  if (tm && tm.length) {
    const bpm = Number(tm[0].bpm);
    if (Number.isFinite(bpm)) return bpm;
  }
  return null;
}

function hasTempoMapEntryAtBar(tempoMap, barIndex) {
  return (tempoMap || []).some((t) => t.barIndex === barIndex && t.beat === 0);
}

/** Deep-ish clone of a TabModel (events/measures/strings copied). */
export function cloneModel(model) {
  if (!model) return null;
  const out = {
    ...model,
    strings: (model.strings || []).map((s) => ({ ...s })),
    events: (model.events || []).map(cloneEvent),
    measures: (model.measures || []).map(cloneMeasure),
    techniqueCounts: { ...(model.techniqueCounts || {}) },
    warnings: (model.warnings || []).slice(),
  };
  if (model.tempoMap != null) {
    out.tempoMap = model.tempoMap.map((t) => ({ ...t }));
  }
  if (model.beats != null) {
    out.beats = model.beats.map(cloneBeat);
  }
  if (model.rests != null) {
    out.rests = model.rests.map(cloneRest);
  }
  if (model.trackInfo != null) {
    out.trackInfo = { ...model.trackInfo };
  }
  if (model.voiceCount != null) {
    out.voiceCount = model.voiceCount;
  }
  return out;
}

/**
 * Join TabModel values in order. Returns a new model; inputs are not mutated.
 */
export function concatModels(models) {
  if (!models || !models.length) return null;
  const parts = models.filter(Boolean);
  if (!parts.length) return null;

  const out = cloneModel(parts[0]);
  let totalLength = getModelLength(parts[0]);

  for (let pi = 1; pi < parts.length; pi++) {
    const model = parts[pi];
    const beatOffset = totalLength;
    const measureOffset = out.measures.length;
    const eventOffset = out.events.length;
    const beatsOffset = out.beats ? out.beats.length : 0;

    const prevPartTempo = modelPartTempo(parts[pi - 1]);
    const nextPartTempo = modelPartTempo(model);
    if (
      prevPartTempo != null
      && nextPartTempo != null
      && prevPartTempo !== nextPartTempo
    ) {
      if (!out.tempoMap) out.tempoMap = [];
      if (!hasTempoMapEntryAtBar(out.tempoMap, measureOffset)) {
        out.tempoMap.push({
          barIndex: measureOffset,
          beat: 0,
          bpm: nextPartTempo,
          linear: false,
        });
      }
    }

    for (const m of model.measures || []) {
      const measure = cloneMeasure(m);
      const idx = out.measures.length;
      measure.startSlot = idx;
      measure.endSlot = idx + 1;
      if (Number.isFinite(m.startBeat)) measure.startBeat = m.startBeat + beatOffset;
      if (Number.isFinite(m.endBeat)) measure.endBeat = m.endBeat + beatOffset;
      out.measures.push(measure);
    }

    for (const e of model.events || []) {
      const ev = cloneEvent(e);
      if (Number.isFinite(e.start)) ev.start = e.start + beatOffset;
      if (typeof e.beatIndex === 'number') ev.beatIndex = e.beatIndex + beatsOffset;
      out.events.push(ev);
    }

    if (model.beats != null || out.beats != null) {
      if (!out.beats) out.beats = [];
      for (const b of model.beats || []) {
        const beat = cloneBeat(b);
        beat.measureIndex = beat.measureIndex + measureOffset;
        if (Number.isFinite(b.start)) beat.start = b.start + beatOffset;
        if (b.noteIndices != null) {
          beat.noteIndices = b.noteIndices.map((ni) => ni + eventOffset);
        }
        out.beats.push(beat);
      }
    }

    if (model.rests != null || out.rests != null) {
      if (!out.rests) out.rests = [];
      for (const r of model.rests || []) {
        const rest = cloneRest(r);
        rest.measureIndex = rest.measureIndex + measureOffset;
        if (Number.isFinite(r.start)) rest.start = r.start + beatOffset;
        out.rests.push(rest);
      }
    }

    if (model.tempoMap != null) {
      if (!out.tempoMap) out.tempoMap = [];
      for (const t of model.tempoMap) {
        out.tempoMap.push({ ...t, barIndex: t.barIndex + measureOffset });
      }
    }

    const tc = model.techniqueCounts || {};
    for (const [k, v] of Object.entries(tc)) {
      out.techniqueCounts[k] = (out.techniqueCounts[k] || 0) + (Number(v) || 0);
    }

    if (model.warnings?.length) {
      out.warnings = out.warnings.concat(model.warnings);
    }

    totalLength += getModelLength(model);
    out.totalBeats = totalLength;
  }

  out.slots = out.events.length
    ? Math.max(...out.events.map((ev) => ev.slot)) + 1
    : out.measures.length;

  return out;
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

/**
 * Slice a TabModel (fretted or percussion) to a beat window; events and
 * measures are filtered and rebased to start at beat 0.
 */
export function sliceModelByBeats(model, { startBeat = 0, endBeat = null, label = '' } = {}) {
  if (!model) return null;
  const windowStart = startBeat;
  const end = endBeat == null ? (model.totalBeats || Infinity) : endBeat;
  const eps = 1e-6;

  const measureIndexMap = new Map();
  const measures = [];
  for (let i = 0; i < (model.measures || []).length; i++) {
    const m = model.measures[i];
    const ms = Number.isFinite(m.startBeat) ? m.startBeat : 0;
    const me = Number.isFinite(m.endBeat) ? m.endBeat : ms;
    if (me > windowStart + eps && ms < end - eps) {
      measureIndexMap.set(i, measures.length);
      const out = {
        ...m,
        startBeat: Math.max(0, (m.startBeat || 0) - windowStart),
        endBeat: Math.max(0, (m.endBeat || 0) - windowStart),
        startSlot: measures.length,
        endSlot: measures.length + 1,
      };
      if (m.timeSig) out.timeSig = m.timeSig.slice();
      if (m.repeat != null) out.repeat = cloneRepeat(m.repeat);
      measures.push(out);
    }
  }

  const eventIndexMap = new Map();
  const events = [];
  for (let i = 0; i < (model.events || []).length; i++) {
    const e = model.events[i];
    const s = Number.isFinite(e.start) ? e.start : 0;
    if (s >= windowStart - eps && s < end - eps) {
      eventIndexMap.set(i, events.length);
      const out = cloneEvent(e);
      out.start = s - windowStart;
      out.slot = e.slot;
      events.push(out);
    }
  }

  const beatIndexMap = new Map();
  let beats = null;
  if (model.beats != null) {
    beats = [];
    for (let i = 0; i < model.beats.length; i++) {
      const b = model.beats[i];
      const s = Number.isFinite(b.start) ? b.start : 0;
      if (s < windowStart - eps || s >= end - eps) continue;
      const newMi = measureIndexMap.get(b.measureIndex);
      if (newMi == null) continue;
      beatIndexMap.set(i, beats.length);
      const out = cloneBeat(b);
      out.start = s - windowStart;
      out.measureIndex = newMi;
      if (b.noteIndices != null) {
        out.noteIndices = b.noteIndices
          .map((ni) => eventIndexMap.get(ni))
          .filter((ni) => ni != null);
      }
      beats.push(out);
    }
  }

  let rests = null;
  if (model.rests != null) {
    rests = [];
    for (const r of model.rests) {
      const s = Number.isFinite(r.start) ? r.start : 0;
      if (s < windowStart - eps || s >= end - eps) continue;
      const newMi = measureIndexMap.get(r.measureIndex);
      if (newMi == null) continue;
      const out = cloneRest(r);
      out.start = s - windowStart;
      out.measureIndex = newMi;
      rests.push(out);
    }
  }

  for (const ev of events) {
    if (ev.beatIndex == null) continue;
    const newBi = beatIndexMap.get(ev.beatIndex);
    if (newBi != null) {
      ev.beatIndex = newBi;
    } else {
      delete ev.beatIndex;
    }
  }

  let tempoMap = null;
  if (model.tempoMap != null) {
    tempoMap = [];
    for (const t of model.tempoMap) {
      const newBar = measureIndexMap.get(t.barIndex);
      if (newBar != null) tempoMap.push({ ...t, barIndex: newBar });
    }
  }

  const out = {
    tuning: model.tuning,
    strings: (model.strings || []).map((s) => ({ ...s })),
    events,
    measures,
    tempo: model.tempo,
    totalBeats: Math.max(0, end - windowStart),
    slots: events.length ? Math.max(...events.map((e) => e.slot)) + 1 : measures.length,
    techniqueCounts: { ...(model.techniqueCounts || {}) },
    warnings: [],
    label,
  };
  if (beats != null) out.beats = beats;
  if (rests != null) out.rests = rests;
  if (tempoMap != null) out.tempoMap = tempoMap;
  if (model.trackInfo != null) out.trackInfo = { ...model.trackInfo };
  if (model.voiceCount != null) out.voiceCount = model.voiceCount;
  return out;
}

/** Alias kept for drum-import callers. */
export function sliceGuitarModel(...args) {
  return sliceModelByBeats(...args);
}
