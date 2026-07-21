// Pitch-class helpers shared by the analysis passes.
//
// Events come from the tab parser. Some are "dead"/muted (no pitch); those are
// ignored for pitch analysis but still counted for techniques elsewhere.

import { NOTE_NAMES_SHARP } from '../theory.js';

export function pitchedEvents(events) {
  return events.filter((e) => e && e.pc != null && e.midi != null);
}

// Group events that share a slot (simultaneously sounding) into vertical
// "columns". Returns [{ slot, events }] ordered by slot.
export function groupBySlot(events) {
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.slot)) map.set(e.slot, []);
    map.get(e.slot).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, evs]) => ({ slot, events: evs }));
}

/**
 * 12-bin pitch-class weight histogram.
 * @param {Array} events tab events (dead notes ignored).
 * @returns {Float32Array} length-12 weights.
 */
export function buildHistogram(events) {
  const w = new Float32Array(12);
  for (const e of pitchedEvents(events)) w[e.pc] += 1;
  return w;
}

// Distinct pitch classes present, sorted ascending.
export function pitchClassSet(events) {
  const s = new Set();
  for (const e of pitchedEvents(events)) s.add(e.pc);
  return [...s].sort((a, b) => a - b);
}

export function pcName(pc) {
  return NOTE_NAMES_SHARP[((pc % 12) + 12) % 12];
}

// MIDI range of the pitched material.
export function midiRange(events) {
  const pitched = pitchedEvents(events);
  if (!pitched.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const e of pitched) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); }
  return { lowMidi: lo, highMidi: hi };
}
