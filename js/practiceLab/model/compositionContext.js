// The working context of Composition Lab.
//
// Every exercise reads one small context row: the instrument, the tuning, and
// the tonal center. Four optional fields sharpen it: the pitch collection, a
// second tonal center, a target degree, and a fret range.
//
// Nothing here is hard-coded to one key or one tuning. The source material for
// this feature used Drop A# and Phrygian Dominant, and that pair ships as a
// preset. It is one row in a list, not a rule.
//
// This module is pure. It touches no screen, no clock, and no audio.

import {
  ROOTS, TUNINGS, SCALES, shortScaleName, resolveTuningKey, parseNote,
} from '../adapters/musiTheory.js';
import { DEGREE_IDS, degreeById } from '../adapters/musiReference.js';

/** The instruments the lab knows. A fretted instrument unlocks the Map work. */
export const INSTRUMENTS = [
  { id: 'guitar', label: 'Guitar', fretted: true, strings: 6, defaultTuning: 'Standard' },
  { id: 'guitar7', label: '7-string guitar', fretted: true, strings: 7, defaultTuning: '7-String Standard' },
  { id: 'guitar8', label: '8-string guitar', fretted: true, strings: 8, defaultTuning: '8-String Standard' },
  { id: 'bass', label: 'Bass', fretted: true, strings: 4, defaultTuning: 'Bass Standard' },
  { id: 'keys', label: 'Keys', fretted: false, strings: 0, defaultTuning: '' },
  { id: 'voice', label: 'Voice', fretted: false, strings: 0, defaultTuning: '' },
];

const INSTRUMENT_BY_ID = new Map(INSTRUMENTS.map(i => [i.id, i]));

/** Context rows a player can load in one tap. */
export const CONTEXT_PRESETS = [
  {
    id: 'drop-asharp-phrygian-dominant',
    label: 'Drop A# · Phrygian Dominant',
    note: 'The low, dark row the source guide worked in.',
    context: {
      instrument: 'guitar',
      tuning: 'Drop Bb / A#',
      tonic: 'Bb',
      collection: 'Phrygian Dominant',
      targetDegree: 'b2',
      fretStart: 0,
      fretEnd: 7,
    },
  },
  {
    id: 'standard-a-minor',
    label: 'Standard · A Natural Minor',
    note: 'A plain minor room to test an idea in.',
    context: {
      instrument: 'guitar',
      tuning: 'Standard',
      tonic: 'A',
      collection: 'Natural Minor (Aeolian)',
      targetDegree: 'b6',
      fretStart: 0,
      fretEnd: 12,
    },
  },
  {
    id: 'drop-d-dorian',
    label: 'Drop D · D Dorian',
    note: 'A lifted minor color for riff writing.',
    context: {
      instrument: 'guitar',
      tuning: 'Drop D',
      tonic: 'D',
      collection: 'Dorian',
      targetDegree: '6',
      fretStart: 0,
      fretEnd: 9,
    },
  },
  {
    id: 'seven-string-e-phrygian',
    label: '7-string · E Phrygian',
    note: 'A wider range with the b2 low on the neck.',
    context: {
      instrument: 'guitar7',
      tuning: '7-String Standard',
      tonic: 'E',
      collection: 'Phrygian',
      targetDegree: 'b2',
      fretStart: 0,
      fretEnd: 7,
    },
  },
  {
    id: 'keys-c-major',
    label: 'Keys · C Major',
    note: 'No neck. The writing and hearing work still runs.',
    context: {
      instrument: 'keys',
      tuning: '',
      tonic: 'C',
      collection: 'Major (Ionian)',
      targetDegree: '7',
      fretStart: 0,
      fretEnd: 12,
    },
  },
];

/** The context the lab opens with when nothing is saved. */
export const DEFAULT_CONTEXT = {
  instrument: 'guitar',
  tuning: 'Standard',
  tonic: 'C',
  collection: 'Natural Minor (Aeolian)',
  secondTonic: '',
  targetDegree: '',
  fretStart: 0,
  fretEnd: 12,
};

/**
 * The name this app spells a root with.
 *
 * The shared root list uses one spelling per pitch class, so "A#" arrives as
 * "Bb". A preset or a saved context can hold either, and both must land on the
 * same tonal center.
 * @param {string} note a note name
 * @returns {string} a name in ROOTS, or '' when the note does not parse
 */
export function resolveRoot(note) {
  const name = String(note || '').trim();
  if (ROOTS.includes(name)) return name;
  const parsed = parseNote(name);
  if (!parsed) return '';
  return ROOTS.find(root => {
    const other = parseNote(root);
    return other && other.semi === parsed.semi;
  }) || '';
}

/**
 * One instrument by id.
 * @param {string} id
 * @returns {Object} the instrument, or the guitar
 */
export function instrumentById(id) {
  return INSTRUMENT_BY_ID.get(id) || INSTRUMENT_BY_ID.get('guitar');
}

/** Tuning names that fit an instrument, longest list first. */
export function tuningsForInstrument(instrumentId) {
  const instrument = instrumentById(instrumentId);
  if (!instrument.fretted) return [];
  const names = Object.keys(TUNINGS)
    .filter(name => (TUNINGS[name] || []).length === instrument.strings);
  return names.length ? names : Object.keys(TUNINGS);
}

/**
 * Fill in and correct a context.
 * A bad tuning falls back to a tuning the instrument can hold, so a change of
 * instrument never leaves the neck with the wrong number of strings.
 * @param {Object} [partial]
 * @returns {Object} a complete context
 */
export function normalizeContext(partial = {}) {
  const next = { ...DEFAULT_CONTEXT, ...partial };
  const instrument = instrumentById(next.instrument);
  next.instrument = instrument.id;

  next.tonic = resolveRoot(next.tonic) || DEFAULT_CONTEXT.tonic;
  next.secondTonic = next.secondTonic ? resolveRoot(next.secondTonic) : '';
  if (!SCALES[next.collection]) next.collection = DEFAULT_CONTEXT.collection;
  if (next.targetDegree && !DEGREE_IDS.includes(next.targetDegree)) next.targetDegree = '';

  if (!instrument.fretted) {
    next.tuning = '';
  } else {
    const resolved = resolveTuningKey(next.tuning);
    const fits = resolved && TUNINGS[resolved] && TUNINGS[resolved].length === instrument.strings;
    if (fits) next.tuning = resolved;
    else next.tuning = tuningsForInstrument(instrument.id)[0] || 'Standard';
  }

  let start = Number(next.fretStart);
  let end = Number(next.fretEnd);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = 12;
  start = Math.max(0, Math.min(24, Math.round(start)));
  end = Math.max(0, Math.min(24, Math.round(end)));
  if (end <= start) end = Math.min(24, start + 1);
  next.fretStart = start;
  next.fretEnd = end;

  return next;
}

/**
 * The strings of the current context, low string first.
 * @param {Object} context
 * @returns {{note: string, oct: number}[]} an empty list for a non-fretted instrument
 */
export function stringsOf(context) {
  const instrument = instrumentById(context.instrument);
  if (!instrument.fretted) return [];
  return TUNINGS[context.tuning] || TUNINGS.Standard;
}

/** True when the context can carry a fretboard exercise. */
export function isFretted(context) {
  return instrumentById(context.instrument).fretted;
}

/**
 * The context row line, such as "Guitar · Drop A# · A# · Phrygian Dominant".
 * @param {Object} context
 * @returns {string}
 */
export function describeContext(context) {
  const instrument = instrumentById(context.instrument);
  const parts = [instrument.label];
  if (instrument.fretted && context.tuning) parts.push(context.tuning);
  parts.push(context.tonic);
  if (context.collection) parts.push(shortScaleName(context.collection));
  return parts.join(' · ');
}

/**
 * The optional fields of the context, as short lines for a summary.
 * @param {Object} context
 * @returns {string[]}
 */
export function describeOptions(context) {
  const out = [];
  if (context.secondTonic) out.push(`Second center: ${context.secondTonic}`);
  if (context.targetDegree) {
    const degree = degreeById(context.targetDegree);
    out.push(`Target color: ${context.targetDegree}${degree ? ` — ${degree.character.toLowerCase()}` : ''}`);
  }
  if (isFretted(context)) out.push(`Frets ${context.fretStart}–${context.fretEnd}`);
  return out;
}

/** Load a preset by id, corrected. */
export function applyPreset(presetId) {
  const preset = CONTEXT_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;
  return normalizeContext(preset.context);
}
