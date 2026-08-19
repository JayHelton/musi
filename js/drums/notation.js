// Canonical drum-tab lanes, glyphs, and hit metadata for GP player views.
// DOM-free; shared by Guitar Pro percussion renderers and parse-time enrichment.

import { INSTRUMENT_LABELS } from './types.js';

/** Top-to-bottom drum-tab lanes (cymbals → kick). */
export const DRUM_TAB_LANES = [
  { key: 'crash', label: 'C', title: 'Crash', instruments: ['crash'] },
  { key: 'ride', label: 'R', title: 'Ride', instruments: ['ride'] },
  { key: 'hihat', label: 'H', title: 'Hi-hat', instruments: ['hihatClosed', 'hihatOpen'] },
  { key: 'snare', label: 'S', title: 'Snare', instruments: ['snare', 'snareGhost', 'snareFlam'] },
  { key: 'tomHigh', label: 'T1', title: 'Tom 1', instruments: ['tomHigh'] },
  { key: 'tomMid', label: 'T2', title: 'Tom 2', instruments: ['tomMid'] },
  { key: 'tomFloor', label: 'FT', title: 'Floor tom', instruments: ['tomFloor'] },
  { key: 'kick', label: 'K', title: 'Kick', instruments: ['kick'] },
];

/** Velocity fallback threshold when no explicit accent flag is present (hand-authored patterns). */
export const ACCENT_VELOCITY = 0.9;

const LANE_BY_INSTRUMENT = new Map();
for (const lane of DRUM_TAB_LANES) {
  for (const inst of lane.instruments) {
    LANE_BY_INSTRUMENT.set(inst, lane);
  }
}

/** GM percussion numbers that change the tab symbol beyond instrument + velocity. */
const MIDI_ARTICULATION = new Map([
  [44, 'hihatPedal'],
  [37, 'sideStick'],
  [53, 'rideBell'],
  [52, 'china'],
  [55, 'splash'],
]);

/** Lane-column collision priority (higher wins). Mirrors drums text tab renderer. */
const HIT_PRIORITY = {
  snareFlam: 3,
  snare: 2,
  snareGhost: 1,
  hihatOpen: 2,
  hihatClosed: 1,
};

// Tab symbol per instrument as [normal, accented].
const INSTRUMENT_GLYPHS = {
  crash: ['x', 'X'],
  ride: ['x', 'X'],
  hihatClosed: ['x', 'X'],
  hihatOpen: ['O', 'O'],
  snare: ['o', 'O'],
  snareGhost: ['g', 'g'],
  snareFlam: ['f', 'f'],
  tomHigh: ['o', 'O'],
  tomMid: ['o', 'O'],
  tomFloor: ['o', 'O'],
  kick: ['o', 'O'],
};

// Articulations drum tab spells with their own character, whatever the velocity.
const ARTICULATION_GLYPH = {
  hihatPedal: '+',
  rideBell: 'b',
  sideStick: '@',
};

// Ghost notes and flams already carry their own character, so an articulation
// never overrides them.
const SELF_SPELLED = new Set(['snareGhost', 'snareFlam', 'hihatOpen']);

/** Symbol for a flam on any lane. */
const FLAM_GLYPH = 'f';

/** Parenthetical articulation phrase appended to the instrument label. */
const ARTICULATION_PHRASE = {
  hihatPedal: 'foot',
  sideStick: 'side stick',
  rideBell: 'bell',
  china: 'china',
  splash: 'splash',
};

/** Instrument that owns each articulation-specific label phrase. */
const ARTICULATION_LABEL_INSTRUMENT = {
  hihatPedal: 'hihatClosed',
  sideStick: 'snare',
  rideBell: 'ride',
  china: 'crash',
  splash: 'crash',
};

/** Every glyph this module can emit, in display order. */
export const DRUM_TAB_LEGEND = [
  { glyph: 'x', text: 'Cymbal / closed hi-hat' },
  { glyph: 'X', text: 'Accented cymbal' },
  { glyph: 'o', text: 'Drum hit' },
  { glyph: 'O', text: 'Accent / open hi-hat' },
  { glyph: '+', text: 'Foot-closed hi-hat' },
  { glyph: 'b', text: 'Ride bell' },
  { glyph: '@', text: 'Side stick' },
  { glyph: 'g', text: 'Ghost note' },
  { glyph: 'f', text: 'Flam' },
];

/**
 * @param {{ instrument?: string, velocity?: number, midi?: number, articulation?: string|null, accent?: boolean|null, flam?: boolean }} event
 * @returns {{
 *   instrument: string|undefined,
 *   articulation: string|null,
 *   accented: boolean,
 *   flam: boolean,
 *   glyph: string,
 *   normalGlyph: string,
 *   accentGlyph: string,
 * }}
 */
function resolveHit(event) {
  const instrument = event?.instrument;
  const articulation = event?.articulation ?? drumArticulationFromMidi(event?.midi);
  // Guitar Pro sets accent explicitly; hand-authored drum patterns rely on velocity.
  const accented = event?.accent
    ?? (Number.isFinite(event?.velocity) && event.velocity >= ACCENT_VELOCITY);
  // A flam is two strokes on one lane. Drum tab spells the pair with one
  // symbol, so the ornament wins over the accent and the articulation.
  const flam = event?.flam === true || instrument === 'snareFlam';
  const pair = instrument ? INSTRUMENT_GLYPHS[instrument] : null;
  const normalGlyph = pair ? pair[0] : 'x';
  const accentGlyph = pair ? pair[1] : 'x';
  const articGlyph = articulation && instrument && !SELF_SPELLED.has(instrument)
    ? ARTICULATION_GLYPH[articulation]
    : undefined;
  const glyph = flam ? FLAM_GLYPH : (articGlyph ?? (accented ? accentGlyph : normalGlyph));
  return { instrument, articulation, accented, flam, glyph, normalGlyph, accentGlyph };
}

/**
 * Lane object for a drum instrument, or null when unmapped.
 * @param {string} instrument
 * @returns {typeof DRUM_TAB_LANES[number]|null}
 */
export function drumLaneFor(instrument) {
  return LANE_BY_INSTRUMENT.get(instrument) ?? null;
}

/**
 * Playing articulation implied by a GM percussion note number.
 * @param {number} midi
 * @returns {string|null}
 */
export function drumArticulationFromMidi(midi) {
  if (!Number.isFinite(midi)) return null;
  return MIDI_ARTICULATION.get(midi) ?? null;
}

/**
 * Single-character drum-tab symbol for a percussion hit.
 * @param {{ instrument?: string, velocity?: number, midi?: number, articulation?: string|null, accent?: boolean|null, flam?: boolean }} event
 * @returns {string}
 */
export function drumTabGlyph(event) {
  return resolveHit(event).glyph;
}

/**
 * Short human label for tooltips and aria (instrument + ornament + accent).
 * @param {{ instrument?: string, velocity?: number, midi?: number, articulation?: string|null, accent?: boolean|null, flam?: boolean }} event
 * @returns {string}
 */
export function drumHitLabel(event) {
  const { instrument, articulation, flam, glyph, normalGlyph, accentGlyph } = resolveHit(event);
  const base = (instrument && INSTRUMENT_LABELS[instrument]) || 'Drum';

  if (flam) {
    return instrument === 'snareFlam' ? base : `${base} (flam)`;
  }

  if (
    articulation
    && ARTICULATION_PHRASE[articulation]
    && ARTICULATION_LABEL_INSTRUMENT[articulation] === instrument
  ) {
    return `${base} (${ARTICULATION_PHRASE[articulation]})`;
  }

  if (glyph === accentGlyph && accentGlyph !== normalGlyph) {
    return `${base} (accent)`;
  }

  return base;
}

/**
 * Priority when several hits share a lane column (higher wins).
 * @param {string} instrument
 * @returns {number}
 */
export function drumHitPriority(instrument) {
  return HIT_PRIORITY[instrument] ?? 2;
}

/**
 * True for the grace stroke of a flam. The main hit already spells the flam
 * with one symbol, so the grace stroke draws no symbol of its own.
 * @param {{ grace?: boolean, flam?: boolean }} event
 * @returns {boolean}
 */
export function isFlamGraceStroke(event) {
  return event?.grace === true && event?.flam === true;
}

/**
 * Legend rows whose glyph appears in `glyphs`, preserving DRUM_TAB_LEGEND order.
 * @param {Iterable<string>} glyphs
 * @returns {typeof DRUM_TAB_LEGEND}
 */
export function drumTabLegendFor(glyphs) {
  const want = new Set(glyphs);
  return DRUM_TAB_LEGEND.filter((row) => want.has(row.glyph));
}
