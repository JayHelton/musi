// Shared drum-pattern data model, instrument vocabulary and notation symbols.
//
// The whole drum feature is browser-only and dependency-free. We keep the data
// model normalized around a flat list of `PatternStep`s plus enough metadata to
// render readable tab and schedule audio. JSDoc typedefs document the shapes
// (this codebase ships plain ES modules, so the original TypeScript types from
// the spec live here as documentation).
//
// @typedef {'crash'|'ride'|'hihatClosed'|'hihatOpen'|'kick'|'snare'|'snareGhost'|'snareFlam'|'tomHigh'|'tomMid'|'tomFloor'} DrumInstrument
// @typedef {{ instrument: DrumInstrument, step: number, velocity: number, probability?: number }} PatternStep
// @typedef {{ id:string, title:string, category:'beat'|'fill'|'exercise', style:string, difficulty:number, bpmRange:[number,number], meter:string, subdivision:string, bars:number, stepsPerBar:number, recommendedLoopBars?:number, notes?:string, steps:PatternStep[], tab:string, builtin?:boolean, createdAt?:string }} DrumPattern

// Ordered top-to-bottom the way a drummer reads a kit: cymbals, hats, snare,
// toms, kick. Tab rendering and the sequencer grid both follow this order.
export const INSTRUMENT_ORDER = [
  'crash',
  'ride',
  'hihatOpen',
  'hihatClosed',
  'snare',
  'snareGhost',
  'snareFlam',
  'tomHigh',
  'tomMid',
  'tomFloor',
  'kick',
];

// Human-readable labels for the sequencer lanes.
export const INSTRUMENT_LABELS = {
  crash: 'Crash',
  ride: 'Ride',
  hihatOpen: 'Open Hat',
  hihatClosed: 'Hi-Hat',
  kick: 'Kick',
  snare: 'Snare',
  snareGhost: 'Ghost',
  snareFlam: 'Flam',
  tomHigh: 'Tom 1',
  tomMid: 'Tom 2',
  tomFloor: 'Floor',
};

// Single-cell tab symbol used when rendering each instrument's row. Snare ghost
// and flam render with their own glyph; everything else uses an accent-aware
// glyph chosen at render time (X for accents, x otherwise).
export const INSTRUMENT_TAB_GLYPH = {
  crash: 'X',
  ride: 'x',
  hihatOpen: 'O',
  hihatClosed: 'x',
  kick: 'X',
  snare: 'X',
  snareGhost: 'g',
  snareFlam: 'f',
  tomHigh: 'x',
  tomMid: 'x',
  tomFloor: 'x',
};

// Row label that prefixes each instrument in the rendered tab, matching the
// legend in the product spec.
export const INSTRUMENT_ROW_LABEL = {
  crash: 'C',
  ride: 'R',
  hihatOpen: 'O',
  hihatClosed: 'H',
  kick: 'K',
  snare: 'S',
  snareGhost: 'S',
  snareFlam: 'S',
  tomHigh: 'T1',
  tomMid: 'T2',
  tomFloor: 'FT',
};

// Velocity each notation symbol maps to (0..1).
export const VELOCITY_BY_SYMBOL = {
  X: 1.0,
  x: 0.72,
  o: 0.55,
  g: 0.32,
  f: 0.95,
};

// How many grid steps fall on a single quarter-note beat, per subdivision. Used
// to convert a step index into a time offset and to lay out the count row.
export const STEPS_PER_BEAT = {
  '8th': 2,
  '16th': 4,
  triplet: 3,
  sixEight: 2,
};

export const SUBDIVISION_LABELS = {
  '8th': '8th notes',
  '16th': '16th notes',
  triplet: 'Triplets',
  sixEight: '6/8 feel',
};

export const STYLES = [
  'rock', 'punk', 'metal', 'hardcore', 'deathcore',
  'pop', 'funk', 'shuffle', 'linear', 'warmup', 'coordination',
];

export const CATEGORIES = ['beat', 'fill', 'exercise'];

export function stepsPerBeat(subdivision) {
  return STEPS_PER_BEAT[subdivision] || 4;
}

// Pull a default per-step velocity for an instrument when none is supplied
// (used by the sequencer when toggling a cell on).
export function defaultVelocity(instrument) {
  const glyph = INSTRUMENT_TAB_GLYPH[instrument] || 'x';
  return VELOCITY_BY_SYMBOL[glyph] ?? 0.72;
}
