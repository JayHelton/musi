// Riff vs solo segmentation. Splits the timeline into windows (measures when
// available, otherwise even slot ranges), scores each as riff-like or solo-like
// from register / polyphony / technique density, then merges adjacent windows
// of the same kind into sections.

import { pitchedEvents, midiRange } from './pitchClass.js';

const LEAD_TECHNIQUES = new Set(['bend', 'vibrato', 'tap', 'slideUp', 'slideDown', 'slide', 'hammer', 'pull']);

function windowsFrom(model) {
  if (model.measures && model.measures.length >= 2) {
    return model.measures.map((m) => [m.startSlot, m.endSlot]);
  }
  const n = 8;
  const size = Math.max(1, Math.ceil(model.slots / n));
  const wins = [];
  for (let s = 0; s < model.slots; s += size) wins.push([s, Math.min(model.slots, s + size)]);
  return wins.length ? wins : [[0, model.slots]];
}

function scoreWindow(events) {
  const pitched = pitchedEvents(events);
  if (!pitched.length) return null;

  // Polyphony: fraction of occupied slots that stack 2+ notes (chords/dyads).
  const bySlot = new Map();
  for (const e of pitched) bySlot.set(e.slot, (bySlot.get(e.slot) || 0) + 1);
  let poly = 0;
  for (const c of bySlot.values()) if (c >= 2) poly++;
  const polyphony = bySlot.size ? poly / bySlot.size : 0;

  const avgMidi = pitched.reduce((s, e) => s + e.midi, 0) / pitched.length;
  const range = midiRange(pitched);
  const span = range ? range.highMidi - range.lowMidi : 0;
  const density = pitched.length / Math.max(1, bySlot.size);

  let leadTech = 0;
  for (const e of pitched) if ((e.techniques || []).some((t) => LEAD_TECHNIQUES.has(t))) leadTech++;
  const leadRatio = leadTech / pitched.length;
  const palm = pitched.some((e) => (e.techniques || []).includes('palmMute'));

  // Solo likelihood: higher register, mostly single notes, lots of expressive
  // technique and wider range. Riff: low register, chords/dyads, palm mutes.
  let solo = 0;
  if (avgMidi >= 57) solo += 1;          // ~A3 and up leans lead
  if (polyphony < 0.2) solo += 1; else solo -= 1;
  if (leadRatio >= 0.25) solo += 1.5;
  if (span >= 10) solo += 0.5;
  if (density > 1.4) solo += 0.5;
  if (palm) solo -= 1;
  if (avgMidi < 48) solo -= 1;           // below C3 leans riff

  return { kind: solo >= 1.5 ? 'solo' : 'riff', avgMidi, polyphony, leadRatio, span, notes: pitched.length };
}

/**
 * @param {import('../tab/tabModel.js').TabModel} model
 * @returns {{kind:string, slotRange:[number,number]}[]}
 */
export function segmentSections(model) {
  const wins = windowsFrom(model);
  const scored = [];
  for (const [start, end] of wins) {
    const evs = model.events.filter((e) => e.slot >= start && e.slot < end);
    const s = scoreWindow(evs);
    if (s) scored.push({ start, end, ...s });
  }
  if (!scored.length) return [];

  // Merge adjacent windows of the same kind.
  const sections = [];
  for (const w of scored) {
    const last = sections[sections.length - 1];
    if (last && last.kind === w.kind) {
      last.slotRange[1] = w.end;
    } else {
      sections.push({ kind: w.kind, slotRange: [w.start, w.end] });
    }
  }
  return sections;
}
