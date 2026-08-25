// The click plan builders of Practice Lab.
//
// A plan is a value, not a state. The trainers build it, and the scheduler
// plays it. Every function here is pure: no audio, no DOM, no clock. The Node
// tests read them directly.
//
// A segment holds one tempo, one subdivision, and a beat count. One click
// lasts `60 / bpm / perBeat` seconds. The scheduler never divides a segment
// across two tempos, so a tempo change starts a new segment.

/** The subdivisions a trainer offers. `perBeat` is the click count in a beat. */
export const SUBDIVISIONS = [
  { id: 'quarter', label: 'Quarter Notes', perBeat: 1 },
  { id: 'eighth', label: '8th Notes', perBeat: 2 },
  { id: 'triplet', label: 'Triplets', perBeat: 3 },
  { id: 'sixteenth', label: '16th Notes', perBeat: 4 },
];

const SUBDIV_BY_ID = new Map(SUBDIVISIONS.map(s => [s.id, s]));

/** The setting ranges of the data model. */
export const LIMITS = {
  bpm: { min: 30, max: 300, def: 80 },
  ratioBeats: { min: 1, max: 16, def: 4 },
  initialCountIn: { min: 0, max: 8, def: 4 },
  repeatCountIn: { min: 0, max: 8, def: 4 },
  beatsPerBar: { min: 2, max: 7, def: 4 },
  increment: { min: 1, max: 20, def: 5 },
  barsPerLoop: { min: 1, max: 16, def: 4 },
  loopsPerStep: { min: 1, max: 8, def: 2 },
  timerMinutes: { min: 1, max: 10, def: 2 },
};

/** Clamp a number into a limit range, and fall back to the default. */
export function clampTo(range, value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return range.def;
  return Math.max(range.min, Math.min(range.max, n));
}

/** The subdivision record of an id, or the quarter note. */
export function subdivision(id) {
  return SUBDIV_BY_ID.get(id) || SUBDIVISIONS[0];
}

let planCounter = 0;

function planId(kind) {
  planCounter += 1;
  return `plan-${kind}-${planCounter}`;
}

function segment({ index, phase, bpm, beats, perBeat, accentEvery, label }) {
  return {
    id: `seg-${index}`,
    phase,
    bpm,
    beats,
    perBeat,
    accentEvery,
    label,
  };
}

function countInSegment(index, bpm, beats) {
  // Every click of a count-in is an accent, so the player hears the switch.
  return segment({
    index,
    phase: 'count-in',
    bpm,
    beats,
    perBeat: 1,
    accentEvery: 1,
    label: 'Count In',
  });
}

/** The seconds one segment lasts. */
export function segmentSeconds(seg) {
  if (!seg || !seg.bpm || !seg.beats) return 0;
  return (seg.beats * 60) / seg.bpm;
}

/** The click count of one segment. */
export function segmentClicks(seg) {
  if (!seg) return 0;
  return seg.beats * seg.perBeat;
}

/**
 * The plan of the bottom metronome bar: one segment that repeats.
 * @param {{ bpm: number, beatsPerBar?: number }} options
 * @returns {Object}
 */
export function metronomePlan({ bpm, beatsPerBar = 4 } = {}) {
  const tempo = clampTo(LIMITS.bpm, bpm);
  const beats = clampTo(LIMITS.beatsPerBar, beatsPerBar);
  return {
    id: planId('metronome'),
    kind: 'metronome',
    segments: [segment({
      index: 0,
      phase: 'metronome',
      bpm: tempo,
      beats,
      perBeat: 1,
      accentEvery: beats,
      label: `${tempo} BPM`,
    })],
    loop: true,
    loopFrom: 0,
    topBpm: 0,
  };
}

/**
 * The plan of the ratios trainer.
 *
 * With the count-in on, the segments are
 * `[initial count-in, A, repeat count-in, B, repeat count-in]` and the repeat
 * starts at A. The cycle is therefore A, count-in, B, count-in, A, and so on.
 * With the count-in off, the plan is `[A, B]` and the repeat starts at A.
 *
 * @param {Object} options
 * @returns {Object}
 */
export function ratioPlan({
  bpm,
  beats,
  loopA = 'eighth',
  loopB = 'sixteenth',
  countIn = true,
  initialCountIn = LIMITS.initialCountIn.def,
  repeatCountIn = LIMITS.repeatCountIn.def,
} = {}) {
  const tempo = clampTo(LIMITS.bpm, bpm);
  const segBeats = clampTo(LIMITS.ratioBeats, beats);
  const initial = clampTo(LIMITS.initialCountIn, initialCountIn);
  const repeat = clampTo(LIMITS.repeatCountIn, repeatCountIn);
  const subA = subdivision(loopA);
  const subB = subdivision(loopB);

  const segments = [];
  if (countIn && initial > 0) segments.push(countInSegment(segments.length, tempo, initial));
  const loopFrom = segments.length;

  segments.push(segment({
    index: segments.length,
    phase: 'loop-a',
    bpm: tempo,
    beats: segBeats,
    perBeat: subA.perBeat,
    accentEvery: 1,
    label: `Loop 1 · ${subA.label}`,
  }));
  if (countIn && repeat > 0) segments.push(countInSegment(segments.length, tempo, repeat));

  segments.push(segment({
    index: segments.length,
    phase: 'loop-b',
    bpm: tempo,
    beats: segBeats,
    perBeat: subB.perBeat,
    accentEvery: 1,
    label: `Loop 2 · ${subB.label}`,
  }));
  if (countIn && repeat > 0) segments.push(countInSegment(segments.length, tempo, repeat));

  return {
    id: planId('ratio'),
    kind: 'ratio',
    segments,
    loop: true,
    loopFrom,
    topBpm: 0,
  };
}

/**
 * The tempo ladder of the speed trainer.
 * @param {{ startBpm: number, endBpm: number, increment: number }} options
 * @returns {number[]} the tempo of each step, clamped to the end tempo
 */
export function speedSteps({ startBpm, endBpm, increment }) {
  const start = clampTo(LIMITS.bpm, startBpm);
  const end = clampTo(LIMITS.bpm, endBpm);
  const step = clampTo(LIMITS.increment, increment);
  if (end < start) return [];
  const out = [];
  let bpm = start;
  // The guard stops a bad increment from building an endless list.
  while (out.length < 400) {
    out.push(bpm);
    if (bpm >= end) break;
    bpm = Math.min(end, bpm + step);
  }
  return out;
}

/**
 * The plan of the speed trainer: a finite ladder.
 *
 * The trainer refuses a plan when the end tempo is below the start tempo. The
 * caller states the reason to the player.
 *
 * @param {Object} options
 * @returns {Object|null} the plan, or null when the settings are impossible
 */
export function speedPlan({
  timeSig = 4,
  startBpm,
  endBpm,
  increment,
  barsPerLoop,
  loopsPerStep,
  countIn = true,
  initialCountIn = LIMITS.initialCountIn.def,
  stepCountIn = LIMITS.repeatCountIn.def,
} = {}) {
  const steps = speedSteps({ startBpm, endBpm, increment });
  if (!steps.length) return null;

  const beatsPerBar = clampTo(LIMITS.beatsPerBar, timeSig);
  const bars = clampTo(LIMITS.barsPerLoop, barsPerLoop);
  const loops = clampTo(LIMITS.loopsPerStep, loopsPerStep);
  const initial = clampTo(LIMITS.initialCountIn, initialCountIn);
  const stepIn = clampTo(LIMITS.repeatCountIn, stepCountIn);
  const beats = beatsPerBar * bars * loops;

  const segments = [];
  steps.forEach((bpm, stepIndex) => {
    const countInBeats = stepIndex === 0 ? initial : stepIn;
    if (countIn && countInBeats > 0) {
      segments.push(countInSegment(segments.length, bpm, countInBeats));
    }
    segments.push(segment({
      index: segments.length,
      phase: 'step',
      bpm,
      beats,
      perBeat: 1,
      accentEvery: beatsPerBar,
      label: `${bpm} BPM · ${bars * loops} bars`,
    }));
  });

  return {
    id: planId('speed'),
    kind: 'speed',
    segments,
    loop: false,
    loopFrom: 0,
    topBpm: steps[steps.length - 1],
  };
}
