// Key / tonal-center detection, shared by the recorder and the tab analyzer.
//
// The core is the Krumhansl-Schmuckler algorithm (correlating a 12-bin
// pitch-class weight profile against major/minor key templates). It was
// originally embedded in js/recorder.js; it now lives here so the CLI and the
// tab analyzer can reuse one implementation.
//
// On top of the raw key correlation, `tonalCenterReport` adds a
// chromatic-aware layer: a lot of riff-based / metal / atonal-leaning music
// does not sit cleanly in one major or minor key, yet it still orbits a tonic.
// Rather than forcing a single "key", we report the strongest tonal center, a
// confidence, and how chromatic the material is so callers can say
// "E (heavily chromatic)" instead of pretending it is E minor.

import { NOTE_NAMES_SHARP } from '../theory.js';
import { SCALES } from '../scales.js';

// Krumhansl-Schmuckler key profiles.
export const MAJ_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const MIN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function pearson(x, y) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

// Ranked major/minor key candidates for a 12-bin pitch-class weight profile.
// Returns [{ tonic, mode, r }] sorted by correlation (best first), or [] when
// the profile is empty.
export function detectKey(weights) {
  let total = 0;
  for (let i = 0; i < 12; i++) total += weights[i];
  if (total <= 0) return [];
  const results = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['major', MAJ_PROFILE], ['minor', MIN_PROFILE]]) {
      const candidate = new Array(12);
      for (let pc = 0; pc < 12; pc++) candidate[pc] = profile[(pc - tonic + 12) % 12];
      const r = pearson(Array.from(weights), candidate);
      results.push({ tonic, mode, r });
    }
  }
  results.sort((a, b) => b.r - a.r);
  return results;
}

export function keyLabel(k) {
  if (!k) return '—';
  return NOTE_NAMES_SHARP[k.tonic] + ' ' + (k.mode === 'major' ? 'Major' : 'Minor');
}

// Semitone sets of the major and minor scales, used to measure how much of the
// material falls outside a diatonic key (i.e. how chromatic it is).
const MAJOR_SEMIS = SCALES['Major (Ionian)'].map(([, s]) => s % 12);
const MINOR_SEMIS = SCALES['Natural Minor (Aeolian)'].map(([, s]) => s % 12);

function keyScaleSemis(mode) {
  return mode === 'major' ? MAJOR_SEMIS : MINOR_SEMIS;
}

// Weight fraction that falls outside the given key's diatonic scale.
function outOfKeyFraction(weights, tonic, mode) {
  const inScale = new Set(keyScaleSemis(mode).map((s) => (tonic + s) % 12));
  let total = 0, outside = 0;
  for (let pc = 0; pc < 12; pc++) {
    total += weights[pc];
    if (!inScale.has(pc)) outside += weights[pc];
  }
  return total > 0 ? outside / total : 0;
}

// The pitch class carrying the most weight — a mode-independent tonic guess that
// still works when nothing fits a major/minor key. Ties resolve to the lower pc.
export function heaviestPc(weights) {
  let best = -1, bestW = -Infinity;
  for (let pc = 0; pc < 12; pc++) {
    if (weights[pc] > bestW) { bestW = weights[pc]; best = pc; }
  }
  return best;
}

// Number of distinct pitch classes with meaningful weight (>= `frac` of the
// heaviest bin). A high count signals chromatic / diminished / whole-tone-ish
// material rather than tidy diatonic writing.
export function activePcCount(weights, frac = 0.08) {
  const peak = Math.max(...Array.from(weights));
  if (peak <= 0) return 0;
  let n = 0;
  for (let pc = 0; pc < 12; pc++) if (weights[pc] >= peak * frac) n++;
  return n;
}

/**
 * Chromatic-aware tonal-center summary for a pitch-class weight profile.
 *
 * @param {ArrayLike<number>} weights 12-bin pitch-class weights.
 * @returns {{
 *   candidates: {tonic:number, mode:string, r:number, label:string}[],
 *   best: {tonic:number, mode:string, r:number, label:string}|null,
 *   tonicPc: number,            // strongest tonal center (pc)
 *   confidence: number,         // 0..1, how decisive the best key is
 *   chromaticism: number,       // 0..1, weight outside the best diatonic key
 *   activePcs: number,          // distinct pitch classes in play
 *   isChromatic: boolean,       // true when material resists a single key
 *   descriptor: string          // e.g. "E Minor", "E center (chromatic)"
 * }}
 */
export function tonalCenterReport(weights) {
  const ranked = detectKey(weights).map((k) => ({ ...k, label: keyLabel(k) }));
  const activePcs = activePcCount(weights);
  const tonicByWeight = heaviestPc(weights);

  if (!ranked.length) {
    return {
      candidates: [], best: null, tonicPc: tonicByWeight,
      confidence: 0, chromaticism: 0, activePcs,
      isChromatic: false, descriptor: '—',
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  // Confidence blends the absolute fit of the top key with how far it stands
  // above the runner-up, so a clear diatonic tune scores high and an ambiguous
  // power-chord riff scores low.
  const gap = second ? Math.max(0, best.r - second.r) : best.r;
  const confidence = Math.max(0, Math.min(1, best.r * 0.6 + gap * 4));
  const chromaticism = outOfKeyFraction(weights, best.tonic, best.mode);

  // Treat the material as "chromatic" (no single clean key) when a lot of the
  // weight sits outside the best key, when it touches most of the 12 tones, or
  // when the top correlation is weak. The tonal center still stands.
  const isChromatic = chromaticism > 0.22 || activePcs >= 10 || best.r < 0.5;

  // When chromatic, prefer the weight-based tonic if it disagrees with the
  // (unreliable) K-S tonic — the heaviest note is usually the pedal / root.
  const tonicPc = isChromatic ? tonicByWeight : best.tonic;

  let descriptor;
  if (!isChromatic) {
    descriptor = best.label;
  } else {
    const flavour = best.mode === 'major' ? 'major-ish' : 'minor-ish';
    descriptor = `${NOTE_NAMES_SHARP[tonicPc]} center (chromatic, ${flavour})`;
  }

  return {
    candidates: ranked.slice(0, 4),
    best, tonicPc, confidence, chromaticism, activePcs,
    isChromatic, descriptor,
  };
}
