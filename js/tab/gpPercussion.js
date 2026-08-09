// Guitar Pro percussion helpers: normalise GP kit input MIDI to General MIDI
// output numbers, map those onto Musi's drum instrument vocabulary, convert
// dynamics, decode GP6 element+variation pairs, and build a PercussionModel
// parallel to TabModel.

import { drumArticulationFromMidi } from '../drums/notation.js';

/** Guitar Pro "input" kit number → General MIDI percussion number. */
const INPUT_TO_GM = new Map([
  [27, 42], [28, 60], [29, 59], [30, 49], [31, 40], [32, 40], [33, 37], [34, 38],
  [91, 38], [92, 46], [93, 51], [94, 51], [95, 55], [96, 52], [97, 49], [98, 57],
  [99, 56], [100, 56], [101, 56], [102, 56], [103, 56], [104, 60], [105, 60], [106, 61],
  [107, 61], [108, 64], [109, 64], [110, 63], [111, 54], [112, 54], [113, 54], [114, 43],
  [115, 49], [116, 49], [117, 69], [118, 70], [119, 70], [120, 70], [122, 54], [123, 53],
  [124, 62], [125, 62], [126, 59], [127, 59],
]);

/** GPIF dynamic names → normalised velocity (0..1). */
const GPIF_DYNAMICS = new Map([
  ['FFF', 1.0],
  ['FF', 0.94],
  ['PPP', 0.30],
  ['PP', 0.40],
  ['MP', 0.62],
  ['MF', 0.74],
  ['P', 0.50],
  ['F', 0.86],
]);

/** GP6 percussion element → [variation0, variation1, variation2] input kit numbers. */
const GP6_ELEMENT_VARIATIONS = [
  [35, 35, 35],       // 0 Kick
  [38, 91, 37],       // 1 Snare — hit, rim shot, side stick
  [99, 100, 99],      // 2 Cowbell low
  [56, 100, 56],      // 3 Cowbell medium
  [102, 103, 102],    // 4 Cowbell high
  [43, 43, 43],       // 5 Tom very low
  [45, 45, 45],       // 6 Tom low
  [47, 47, 47],       // 7 Tom medium
  [48, 48, 48],       // 8 Tom high
  [50, 50, 50],       // 9 Tom very high
  [42, 92, 46],       // 10 Hi-hat — closed, half, open
  [44, 44, 44],       // 11 Pedal hi-hat
  [57, 98, 57],       // 12 Crash medium
  [49, 97, 49],       // 13 Crash high
  [55, 95, 55],       // 14 Splash
  [51, 93, 127],      // 15 Ride — middle, edge, bell
  [52, 96, 52],       // 16 China
];

// Start beats are accumulated by repeated addition and merged across voices, so
// two hits on the same musical position can differ in the last bit.
const BEAT_EPS = 1e-6;

const HIHAT_CLOSED_AUX = new Set([
  54, 56, 58, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 82, 85,
]);
const RIDE_BELLS = new Set([80, 81, 83, 84]);
const TOM_HIGH_HAND = new Set([60, 61, 65, 66]);
const TOM_FLOOR_EXTRA = new Set([86, 87]);

/**
 * Guitar Pro "input" kit number → General MIDI percussion number.
 * Non-identity remaps follow the GP7 default drum kit articulation table;
 * everything else passes through unchanged.
 * @param {number} input
 * @returns {number|null}
 */
export function normalizePercussionMidi(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return INPUT_TO_GM.has(n) ? INPUT_TO_GM.get(n) : n;
}

/**
 * Map a General MIDI / GP kit note number onto a Musi DrumInstrument.
 * Unknown values return null (ignored). Auxiliary percussion (cowbell,
 * tambourine, shaker, woodblock, etc.) is folded into the nearest kit lane
 * rather than dropped, so those parts still play.
 * @param {number} midi
 * @param {{ velocity?: number, ghost?: boolean }} [opts]
 * @returns {string|null}
 */
export function midiToDrumInstrument(midi, opts = {}) {
  let n = normalizePercussionMidi(midi);
  if (n == null) return null;
  const vel = Number(opts.velocity);

  if (n === 35 || n === 36) return 'kick';
  if (n === 37 || n === 38 || n === 39 || n === 40) {
    if (opts.ghost === true) return 'snareGhost';
    if ((n === 38 || n === 40) && Number.isFinite(vel) && vel < 0.45) return 'snareGhost';
    return 'snare';
  }
  if (n === 42 || n === 44 || HIHAT_CLOSED_AUX.has(n)) return 'hihatClosed';
  if (n === 46) return 'hihatOpen';
  if (n === 51 || n === 53 || n === 59 || RIDE_BELLS.has(n)) return 'ride';
  if (n === 49 || n === 52 || n === 55 || n === 57) return 'crash';
  if (n === 48 || n === 50 || TOM_HIGH_HAND.has(n)) return 'tomHigh';
  if (n === 45 || n === 47 || n === 62 || n === 63 || n === 64) return 'tomMid';
  if (n === 41 || n === 43 || TOM_FLOOR_EXTRA.has(n)) return 'tomFloor';
  return null;
}

/** Normalize a GP5 percussion fret/value to a GM-ish MIDI note. */
export function normalizeGp5PercussionMidi(fret) {
  return normalizePercussionMidi(fret);
}

/**
 * Velocity from GP dynamics byte, GPIF dynamic name, or a 0..1 / 0..127 value.
 * Defaults to a medium hit when absent or unrecognised.
 */
export function dynamicsToVelocity(dyn) {
  if (dyn == null || dyn === '') return 0.78;
  if (typeof dyn === 'string') {
    const key = dyn.trim().toUpperCase();
    return GPIF_DYNAMICS.has(key) ? GPIF_DYNAMICS.get(key) : 0.78;
  }
  const d = Number(dyn);
  if (!Number.isFinite(d)) return 0.78;
  if (d >= 1 && d <= 8) return Math.max(0.28, Math.min(1, 0.25 + d * 0.1));
  if (d <= 1) return Math.max(0.2, Math.min(1, d));
  if (d <= 127) return Math.max(0.2, Math.min(1, d / 127));
  return 0.78;
}

/**
 * GP6 percussion element+variation → input kit number.
 * @param {number} element
 * @param {number} variation
 * @returns {number|null}
 */
export function gp6ElementVariationToMidi(element, variation) {
  const el = Number(element);
  if (!Number.isFinite(el) || el < 0 || el >= GP6_ELEMENT_VARIATIONS.length) return null;
  const vars = GP6_ELEMENT_VARIATIONS[el];
  const v = Number(variation);
  const idx = Number.isFinite(v) && v >= 0 && v < vars.length ? v : 0;
  return vars[idx];
}

/**
 * Re-index `slot` on percussion events by ascending start beat (stable).
 * Events that share the same `start` receive the same slot.
 * @param {Array<{slot?:number,start:number}>} events
 * @returns {Array<object>}
 */
export function assignPercussionSlots(events) {
  if (!events?.length) return [];
  const starts = [...new Set(events.map((e) => e.start))].sort((a, b) => a - b);
  const slotByStart = new Map();
  let slot = -1;
  let openedAt = null;
  for (const s of starts) {
    if (openedAt == null || s - openedAt >= BEAT_EPS) {
      slot += 1;
      openedAt = s;
    }
    slotByStart.set(s, slot);
  }
  return events.map((e) => ({ ...e, slot: slotByStart.get(e.start) }));
}

/**
 * Bracket each measure's slot span from timed events after assignPercussionSlots.
 * Measures with no events receive a single placeholder slot. Returns new measure
 * objects; does not mutate the input arrays.
 * @param {Array<{startBeat:number,endBeat:number}>} measures
 * @param {Array<{slot:number,start:number}>} events
 * @returns {Array<object>}
 */
export function deriveMeasureSlotSpans(measures, events) {
  let fallbackSlot = 0;
  return measures.map((m) => {
    const inMeasure = events.filter((e) => e.start >= m.startBeat && e.start < m.endBeat);
    if (inMeasure.length) {
      const startSlot = Math.min(...inMeasure.map((e) => e.slot));
      const endSlot = Math.max(...inMeasure.map((e) => e.slot)) + 1;
      fallbackSlot = endSlot;
      return { ...m, startSlot, endSlot };
    }
    const startSlot = fallbackSlot;
    const endSlot = fallbackSlot + 1;
    fallbackSlot = endSlot;
    return { ...m, startSlot, endSlot };
  });
}

/**
 * Build a PercussionModel from timed drum hits.
 * @typedef {{ slot:number, start:number, duration:number, instrument:string, velocity:number, midi:number, articulation:string|null }} PercEvent
 * @typedef {{
 *   percussion: true,
 *   name: string,
 *   tempo: number,
 *   events: PercEvent[],
 *   measures: Array<{startSlot:number,endSlot:number,startBeat:number,endBeat:number,marker:?string,timeSig?:number[]}>,
 *   slots: number,
 *   totalBeats: number,
 *   warnings: string[],
 * }} PercussionModel
 */
export function makePercussionModel({ name, tempo, events, measures, warnings = [] }) {
  const evs = assignPercussionSlots(events || [])
    .sort((a, b) => (a.start - b.start) || (a.midi - b.midi))
    .map((e) => ({
      ...e,
      articulation: e.articulation ?? drumArticulationFromMidi(e.midi),
    }));
  const slots = evs.length ? Math.max(...evs.map((e) => e.slot)) + 1 : (measures?.length || 0);
  const totalBeats = measures?.length
    ? measures[measures.length - 1].endBeat
    : (evs.length ? Math.max(...evs.map((e) => e.start + (e.duration || 0))) : 0);
  return {
    percussion: true,
    name: name || 'Drums',
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    events: evs,
    measures: measures || [],
    slots,
    totalBeats,
    warnings,
  };
}
