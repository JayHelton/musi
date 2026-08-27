// Turn a written drum pattern into a score the Guitar Pro player can read.
//
// A pattern is a grid. One bar holds one row of characters for each lane, and
// every row has the same length. The character says which stroke lands on that
// step, and a dash says the lane is quiet:
//
//   { H: 'x-x-x-x-x-x-x-x-', S: '----o-------o---', K: 'o-------o-o-----' }
//
// The characters are the drum-tab glyphs of `js/drums/notation.js`, so a
// pattern reads the same here as it reads on the Drum Notation screen.
//
// A bar can also carry a sticking row. The row names the hand of each step,
// and the player draws the letter under the staff:
//
//   { S: 'oooo oooo', LR: 'RLRL RLRL' }
//
// Every function here is pure. Nothing in this file touches the DOM.

import {
  barQuarters, beamUnitOf, noteValueOf, notationNameFor, DRUM_STAFF_POSITIONS,
} from './staffNotation.js';
import { drumArticulationFromMidi } from './notation.js';
import {
  assignPercussionSlots,
  deriveMeasureSlotSpans,
  makePercussionModel,
  drumHitVelocity,
} from '../tab/gpPercussion.js';

/** No pattern in this library runs longer than this. */
export const MAX_BARS = 8;

/** The written dynamic of a plain stroke, before an accent or a ghost note. */
const WRITTEN = 0.78;

/** How far in front of its main stroke each grace stroke sounds, in quarters. */
const GRACE_LEAD = { 1: [0.11], 2: [0.15, 0.075] };

/** A step the lane does not play. Both characters read as a rest. */
const REST_CHARS = new Set(['-', ' ', '.']);

/**
 * The lanes a pattern can write, top to bottom, with the stroke that each
 * character makes. The MIDI number picks the articulation, so a side stick and
 * a ride bell keep their own note head and their own sound.
 */
export const PATTERN_LANES = [
  {
    key: 'C',
    label: 'Crash',
    strokes: {
      x: { instrument: 'crash', midi: 49 },
      X: { instrument: 'crash', midi: 49, accent: true },
      c: { instrument: 'crash', midi: 52 },
      s: { instrument: 'crash', midi: 55 },
    },
  },
  {
    key: 'R',
    label: 'Ride',
    strokes: {
      x: { instrument: 'ride', midi: 51 },
      X: { instrument: 'ride', midi: 51, accent: true },
      b: { instrument: 'ride', midi: 53 },
    },
  },
  {
    key: 'H',
    label: 'Hi-hat',
    strokes: {
      x: { instrument: 'hihatClosed', midi: 42 },
      X: { instrument: 'hihatClosed', midi: 42, accent: true },
      O: { instrument: 'hihatOpen', midi: 46 },
      '+': { instrument: 'hihatClosed', midi: 44 },
    },
  },
  {
    key: 'S',
    label: 'Snare',
    strokes: {
      o: { instrument: 'snare', midi: 38 },
      O: { instrument: 'snare', midi: 38, accent: true },
      g: { instrument: 'snareGhost', midi: 38, ghost: true },
      '@': { instrument: 'snare', midi: 37 },
      f: { instrument: 'snare', midi: 38, graces: 1 },
      F: { instrument: 'snare', midi: 38, accent: true, graces: 1 },
      d: { instrument: 'snare', midi: 38, graces: 2 },
      D: { instrument: 'snare', midi: 38, accent: true, graces: 2 },
    },
  },
  {
    key: 'T1',
    label: 'Tom 1',
    strokes: {
      o: { instrument: 'tomHigh', midi: 48 },
      O: { instrument: 'tomHigh', midi: 48, accent: true },
      f: { instrument: 'tomHigh', midi: 48, graces: 1 },
    },
  },
  {
    key: 'T2',
    label: 'Tom 2',
    strokes: {
      o: { instrument: 'tomMid', midi: 45 },
      O: { instrument: 'tomMid', midi: 45, accent: true },
      f: { instrument: 'tomMid', midi: 45, graces: 1 },
    },
  },
  {
    key: 'FT',
    label: 'Floor tom',
    strokes: {
      o: { instrument: 'tomFloor', midi: 41 },
      O: { instrument: 'tomFloor', midi: 41, accent: true },
      f: { instrument: 'tomFloor', midi: 41, graces: 1 },
    },
  },
  {
    key: 'K',
    label: 'Kick',
    strokes: {
      o: { instrument: 'kick', midi: 36 },
      O: { instrument: 'kick', midi: 36, accent: true },
    },
  },
];

/** The sticking row of a bar. It names a hand and never makes a sound. */
export const STICKING_KEY = 'LR';

const LANE_BY_KEY = new Map(PATTERN_LANES.map((lane) => [lane.key, lane]));

/** The lane keys, in the order the writer should list them. */
export const PATTERN_LANE_KEYS = PATTERN_LANES.map((lane) => lane.key);

/**
 * Split a written row into one character per step.
 *
 * A row may carry `|` to group the steps for the reader. The bar `x-x-|x-x-`
 * and the bar `x-x-x-x-` hold the same eight steps, and a writer can count the
 * first one at a glance.
 * @param {string} row
 * @returns {string[]}
 */
export function rowSteps(row) {
  return String(row == null ? '' : row).replace(/\|/g, '').split('');
}

/**
 * Check one pattern and list every problem it has. An empty list means the
 * pattern builds.
 * @param {Object} pattern
 * @returns {string[]}
 */
export function patternProblems(pattern) {
  const problems = [];
  const bars = Array.isArray(pattern?.bars) ? pattern.bars : [];
  if (!bars.length) problems.push('the pattern has no bars');
  if (bars.length > MAX_BARS) problems.push(`the pattern has ${bars.length} bars, and the limit is ${MAX_BARS}`);
  const grid = Number(pattern?.grid);
  if (!Number.isFinite(grid) || grid < 1) problems.push('the pattern has no step count');

  bars.forEach((bar, index) => {
    const where = `bar ${index + 1}`;
    for (const [key, row] of Object.entries(bar || {})) {
      if (key === 'timeSig' || key === 'label') continue;
      if (key !== STICKING_KEY && !LANE_BY_KEY.has(key)) {
        problems.push(`${where} writes the unknown lane "${key}"`);
        continue;
      }
      const steps = rowSteps(row);
      if (steps.length !== grid) {
        problems.push(`${where} lane "${key}" has ${steps.length} steps, and the grid is ${grid}`);
      }
      if (key === STICKING_KEY) {
        for (const char of steps) {
          if (REST_CHARS.has(char)) continue;
          if (char !== 'R' && char !== 'L') problems.push(`${where} writes the unknown hand "${char}"`);
        }
        continue;
      }
      const lane = LANE_BY_KEY.get(key);
      for (const char of steps) {
        if (REST_CHARS.has(char)) continue;
        if (!lane.strokes[char]) {
          problems.push(`${where} lane "${key}" writes the unknown stroke "${char}"`);
        }
      }
    }
  });
  return problems;
}

/** True when a note carries a hand, so the hands play it and not the feet. */
function isHandEvent(event) {
  return DRUM_STAFF_POSITIONS[notationNameFor(event)]?.voice === 'up';
}

// A drum hit has no sustain, so the note a reader sees stops at the end of its
// own beat. Without the cap a kick on beat 1 of an empty bar would draw as a
// whole note, and no drum chart writes it that way.
function strokeEvent({ start, spec, barIndex, unit }) {
  const articulation = drumArticulationFromMidi(spec.midi);
  return {
    start,
    duration: unit,
    instrument: spec.instrument,
    midi: spec.midi,
    articulation,
    accent: spec.accent === true,
    velocity: drumHitVelocity(WRITTEN, {
      accent: spec.accent === true,
      ghost: spec.instrument === 'snareGhost',
    }),
    voiceIndex: 0,
    measureIndex: barIndex,
  };
}

function graceEvents({ start, spec, barIndex }) {
  const leads = GRACE_LEAD[spec.graces] || [];
  return leads.map((lead) => ({
    start,
    duration: lead,
    instrument: spec.instrument,
    midi: spec.midi,
    articulation: drumArticulationFromMidi(spec.midi),
    accent: false,
    velocity: drumHitVelocity(WRITTEN, { grace: true }),
    voiceIndex: 0,
    measureIndex: barIndex,
    grace: true,
    flam: true,
  }));
}

/**
 * Read a pattern into raw hits and bar spans.
 * @param {Object} pattern
 * @returns {{ events: Object[], measures: Object[], beats: Object[] }}
 */
export function readPattern(pattern) {
  const problems = patternProblems(pattern);
  if (problems.length) throw new Error(`drum pattern "${pattern?.id || '?'}": ${problems.join('; ')}`);

  const grid = Number(pattern.grid);
  const defaultSig = pattern.timeSig || [4, 4];
  const events = [];
  const measures = [];
  const beats = [];
  let cursor = 0;

  pattern.bars.forEach((bar, barIndex) => {
    const timeSig = bar.timeSig || defaultSig;
    const quarters = barQuarters(timeSig);
    const step = quarters / grid;
    const unit = beamUnitOf(timeSig);
    const barStart = cursor;
    const barEnd = barStart + quarters;
    const hands = rowSteps(bar[STICKING_KEY] || '');
    const mainByStart = new Map();
    const gracesByStart = new Map();

    for (const key of PATTERN_LANE_KEYS) {
      const row = bar[key];
      if (row == null) continue;
      const lane = LANE_BY_KEY.get(key);
      rowSteps(row).forEach((char, index) => {
        if (REST_CHARS.has(char)) return;
        const spec = lane.strokes[char];
        const start = barStart + index * step;
        const main = strokeEvent({ start, spec, barIndex, unit });
        const hand = hands[index];
        if ((hand === 'R' || hand === 'L') && isHandEvent(main)) main.hand = hand;
        if (spec.graces) {
          main.flam = true;
          main.graces = spec.graces;
          const list = gracesByStart.get(start) || [];
          list.push(...graceEvents({ start, spec, barIndex }));
          gracesByStart.set(start, list);
        }
        const bucket = mainByStart.get(start) || [];
        bucket.push(main);
        mainByStart.set(start, bucket);
      });
    }

    const starts = [...mainByStart.keys()].sort((a, b) => a - b);
    starts.forEach((start, index) => {
      const next = index + 1 < starts.length ? starts[index + 1] : barEnd;
      const duration = Math.max(step, next - start);
      const { value, dots } = noteValueOf(duration);
      const noteIndices = [];
      for (const event of mainByStart.get(start)) {
        noteIndices.push(events.length);
        events.push(event);
      }
      const beatIndex = beats.length;
      beats.push({
        measureIndex: barIndex,
        voiceIndex: 0,
        start,
        duration,
        noteValue: value,
        dots,
        tuplet: null,
        rest: false,
        techniques: [],
        noteIndices,
      });
      for (const grace of gracesByStart.get(start) || []) {
        events.push({ ...grace, beatIndex });
      }
    });

    measures.push({
      startBeat: barStart,
      endBeat: barEnd,
      marker: bar.label || null,
      timeSig,
    });
    cursor = barEnd;
  });

  return { events, measures, beats };
}

/**
 * Build the percussion model of one written pattern.
 * @param {Object} pattern
 * @returns {Object} a PercussionModel
 */
export function percussionModelOf(pattern) {
  const { events, measures, beats } = readPattern(pattern);
  const slotted = assignPercussionSlots(events);
  const model = makePercussionModel({
    name: pattern.name || 'Drums',
    tempo: pattern.bpm,
    events: slotted,
    measures: deriveMeasureSlotSpans(measures, slotted),
    warnings: [],
    beats,
  });
  model.voiceCount = 1;
  return model;
}

/**
 * Build the score object `mountGpPlayer` reads.
 * @param {Object} pattern
 * @returns {{ tempo: number, tracks: Array, drumTracks: Array, warnings: string[] }}
 */
export function gpResultOf(pattern) {
  const model = percussionModelOf(pattern);
  return {
    tempo: model.tempo,
    tracks: [],
    drumTracks: [{
      index: 0,
      name: model.name,
      model,
      hitCount: model.events.length,
    }],
    warnings: [],
  };
}
