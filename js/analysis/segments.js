// Musical sectioning. Splits the timeline into song parts and labels them.
//
// Two strategies, in order of reliability:
//   1. Section markers. Guitar Pro scores carry rehearsal marks ("Intro",
//      "Verse", "Chorus", "Solo", …) attached to measures. When present these
//      are the ground truth for the arrangement, so we group measures by marker.
//   2. Heuristic fallback. With no markers we split by measure (or even slot
//      windows), score each as riff-like vs solo-like from register / polyphony
//      / technique density, merge adjacent windows of the same kind, then label
//      repeated material as reusable sections (A, B, C…) so the structure of the
//      piece is still visible.

import { pitchedEvents, midiRange } from './pitchClass.js';

const LEAD_TECHNIQUES = new Set(['bend', 'vibrato', 'tap', 'slideUp', 'slideDown', 'slide', 'hammer', 'pull']);

// Map a free-text section label to a canonical type used for colour + grouping.
export function sectionType(label) {
  const s = String(label || '').toLowerCase();
  if (/intro/.test(s)) return 'intro';
  if (/pre[\s-]?chorus/.test(s)) return 'prechorus';
  if (/chorus|hook|refrain/.test(s)) return 'chorus';
  if (/verse/.test(s)) return 'verse';
  if (/bridge/.test(s)) return 'bridge';
  if (/solo|lead/.test(s)) return 'solo';
  if (/interlude|break/.test(s)) return 'interlude';
  if (/outro|coda|ending|fade|tag/.test(s)) return 'outro';
  if (/pre/.test(s)) return 'prechorus';
  if (/riff|main|theme|head/.test(s)) return 'riff';
  return 'section';
}

function eventsInRange(model, start, end) {
  return model.events.filter((e) => e.slot >= start && e.slot < end);
}

function windowsFrom(model) {
  if (model.measures && model.measures.length >= 2) {
    return model.measures.map((m, i) => ({ start: m.startSlot, end: m.endSlot, measure: i + 1 }));
  }
  const n = 8;
  const size = Math.max(1, Math.ceil(model.slots / n));
  const wins = [];
  for (let s = 0; s < model.slots; s += size) wins.push({ start: s, end: Math.min(model.slots, s + size), measure: null });
  return wins.length ? wins : [{ start: 0, end: model.slots, measure: null }];
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

// A slot-relative fingerprint of a span, so identical riffs / choruses collapse
// to the same string and can be recognised as repeats of one section.
function fingerprint(model, start, end) {
  return eventsInRange(model, start, end)
    .map((e) => `${e.slot - start}:${e.stringIndex}:${e.fret == null ? 'x' : e.fret}`)
    .join(',');
}

// Strategy 1: group measures by their section markers.
function markerSections(model) {
  const measures = model.measures || [];
  if (measures.length < 2) return null;
  const markerIdx = measures.map((m, i) => (m.marker ? i : -1)).filter((i) => i >= 0);
  if (!markerIdx.length) return null;

  // Section boundaries at every marked measure; include measure 0 so any lead-in
  // before the first marker becomes its own (implicit intro) section.
  const bounds = [...new Set([0, ...markerIdx])].sort((a, b) => a - b);
  const labelCounts = new Map();
  const sections = [];
  for (let b = 0; b < bounds.length; b++) {
    const startM = bounds[b];
    const endM = b + 1 < bounds.length ? bounds[b + 1] : measures.length;
    const startSlot = measures[startM].startSlot;
    const endSlot = measures[endM - 1].endSlot;
    const evs = eventsInRange(model, startSlot, endSlot);
    const score = scoreWindow(evs);
    const raw = measures[startM].marker || (startM === 0 ? 'Intro' : 'Section');
    const seen = (labelCounts.get(raw) || 0) + 1;
    labelCounts.set(raw, seen);
    sections.push({
      kind: score ? score.kind : 'riff',
      label: raw,
      type: sectionType(raw),
      slotRange: [startSlot, endSlot],
      measureRange: [startM + 1, endM],
      occurrence: seen,
      source: 'marker',
    });
  }
  return sections;
}

// Strategy 2: heuristic riff/solo windows merged, then labelled by repetition.
function heuristicSections(model) {
  const wins = windowsFrom(model);
  const scored = [];
  for (const w of wins) {
    const s = scoreWindow(eventsInRange(model, w.start, w.end));
    if (s) scored.push({ ...w, ...s });
  }
  if (!scored.length) return [];

  const merged = [];
  for (const w of scored) {
    const last = merged[merged.length - 1];
    if (last && last.kind === w.kind) {
      last.slotRange[1] = w.end;
      if (w.measure != null) last.measureRange[1] = w.measure;
    } else {
      merged.push({
        kind: w.kind,
        slotRange: [w.start, w.end],
        measureRange: w.measure != null ? [w.measure, w.measure] : null,
      });
    }
  }

  // Label distinct musical material A, B, C…; repeats reuse the earlier letter.
  const prints = new Map();
  let nextLetter = 0;
  for (const sec of merged) {
    const fp = fingerprint(model, sec.slotRange[0], sec.slotRange[1]);
    let letter = prints.get(fp);
    let repeat = true;
    if (letter == null) {
      letter = String.fromCharCode(65 + (nextLetter++ % 26));
      prints.set(fp, letter);
      repeat = false;
    }
    const kindWord = sec.kind === 'solo' ? 'Lead' : 'Rhythm';
    sec.label = `Section ${letter} · ${kindWord}`;
    sec.type = sec.kind === 'solo' ? 'solo' : 'riff';
    sec.letter = letter;
    sec.repeat = repeat;
    sec.source = 'auto';
  }
  return merged;
}

/**
 * Split a TabModel into labelled musical sections.
 * @param {import('../tab/tabModel.js').TabModel} model
 * @returns {{kind:string, label:string, type:string, slotRange:[number,number],
 *   measureRange:?[number,number], source:string}[]}
 */
export function segmentSections(model) {
  return markerSections(model) || heuristicSections(model);
}
