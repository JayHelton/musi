// Orchestrator: turn a parsed TabModel into a full AnalysisReport combining
// tonal center, chords + progression (with roman numerals), scales, arpeggios,
// techniques and riff/solo sections. Pure and DOM-free so the web UI and CLI
// share it.

import { parseTab } from './tabParser.js';
import {
  buildHistogram, pitchedEvents, groupBySlot, midiRange, pcName,
} from '../analysis/pitchClass.js';
import { tonalCenterReport } from '../analysis/keyDetect.js';
import { identifyChordWithBass, romanNumeral } from '../analysis/chordDetect.js';
import { detectScales } from '../analysis/scaleDetect.js';
import { detectArpeggios } from '../analysis/arpeggios.js';
import { summarizeTechniques } from '../analysis/techniques.js';
import { segmentSections } from '../analysis/segments.js';

// Chord events: slots stacking 2+ distinct pitch classes (power chords, dyads,
// triads, …). Returns identified chords in time order with their bass note.
function chordsFromEvents(events) {
  const chords = [];
  for (const g of groupBySlot(pitchedEvents(events))) {
    const pcs = [...new Set(g.events.map((e) => e.pc))];
    if (pcs.length < 2) continue;
    const bass = g.events.reduce((lo, e) => (e.midi < lo.midi ? e : lo), g.events[0]);
    const chord = identifyChordWithBass(pcs, bass.pc);
    if (chord) chords.push({ slot: g.slot, ...chord });
  }
  return chords;
}

// Collapse immediately-repeated chords and attach roman numerals.
function buildProgression(chords, keyTonicPc, keyMode) {
  const prog = [];
  for (const ch of chords) {
    const last = prog[prog.length - 1];
    if (last && last.label === ch.label) continue;
    const rn = romanNumeral(ch.rootPC, ch.type, keyTonicPc, keyMode);
    prog.push({
      slot: ch.slot,
      label: ch.label,
      root: ch.root,
      quality: ch.unknown ? 'unknown' : ch.type.name,
      isPower: !ch.unknown && ch.type.name === 'Power',
      numeral: rn.numeral,
      diatonic: rn.diatonic,
    });
  }
  return prog;
}

// Detect a repeating chord loop (shortest period that tiles the progression).
function detectLoop(prog) {
  const labels = prog.map((p) => p.label);
  const n = labels.length;
  if (n < 4) return null;
  for (let p = 1; p <= Math.floor(n / 2); p++) {
    if (n % p !== 0) continue;
    let ok = true;
    for (let i = p; i < n; i++) if (labels[i] !== labels[i % p]) { ok = false; break; }
    if (ok) return { period: p, chords: labels.slice(0, p), repeats: n / p };
  }
  return null;
}

function eventsInRange(events, [start, end]) {
  return events.filter((e) => e.slot >= start && e.slot < end);
}

/**
 * Analyze a parsed TabModel.
 * @param {import('./tabModel.js').TabModel} model
 * @returns {object} AnalysisReport
 */
export function analyzeModel(model) {
  const events = model.events || [];
  const pitched = pitchedEvents(events);
  const histogram = buildHistogram(events);
  const key = tonalCenterReport(histogram);
  const keyTonic = key.tonicPc >= 0 ? key.tonicPc : (key.best ? key.best.tonic : 0);
  const keyMode = key.best ? key.best.mode : 'minor';

  const chords = chordsFromEvents(events);
  const progression = buildProgression(chords, keyTonic, keyMode);
  const loop = detectLoop(progression);

  const overallScales = detectScales(pitched, key.tonicPc, { limit: 5 });
  const arpeggios = detectArpeggios(events);
  const techniques = summarizeTechniques(events);
  const range = midiRange(events);

  const sectionSpans = segmentSections(model);
  const sections = sectionSpans.map((sec) => {
    const evs = eventsInRange(events, sec.slotRange);
    const secChords = chordsFromEvents(evs);
    return {
      kind: sec.kind,
      slotRange: sec.slotRange,
      scales: detectScales(pitchedEvents(evs), key.tonicPc, { limit: 3 }),
      arpeggios: detectArpeggios(evs),
      chords: buildProgression(secChords, keyTonic, keyMode),
      techniques: summarizeTechniques(evs),
      range: midiRange(evs),
      noteCount: pitchedEvents(evs).length,
    };
  });

  return {
    tuning: model.tuning,
    strings: model.strings.map((s) => s.label),
    slots: model.slots,
    noteCount: pitched.length,
    key: {
      descriptor: key.descriptor,
      tonic: pcName(keyTonic),
      tonicPc: keyTonic,
      mode: keyMode,
      confidence: key.confidence,
      chromaticism: key.chromaticism,
      activePcs: key.activePcs,
      isChromatic: key.isChromatic,
      candidates: key.candidates.map((c) => ({ label: c.label, r: c.r })),
    },
    scales: overallScales,
    progression,
    loop,
    arpeggios,
    techniques,
    range,
    histogram: Array.from(histogram),
    sections,
    warnings: model.warnings || [],
  };
}

/**
 * Convenience: parse text with a tuning and analyze in one call.
 * @param {string} text
 * @param {string|Array} tuning
 */
export function analyzeTab(text, tuning = 'Standard') {
  const model = parseTab(text, tuning);
  const report = analyzeModel(model);
  return { model, report };
}
