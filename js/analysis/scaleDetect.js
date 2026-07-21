// Scale / mode detection: score a body of notes against the full SCALES library
// for every possible root and rank the best fits.
//
// Unlike the major/minor-only `findKeys`, this covers all 27 scales/modes
// (pentatonics, church modes, harmonic/melodic minor colours, diminished,
// whole-tone, exotic scales, …) so chromatic and modal riffs get a meaningful
// answer. Results are biased toward the detected tonal center so, e.g., a
// Phrygian-dominant riff rooted on E is reported on E rather than its relative.

import { SCALES, getScaleNotes } from '../scales.js';
import { buildHistogram, pitchClassSet, pcName } from './pitchClass.js';

// Precompute each scale's pitch-class offsets (0..11) from its root.
const SCALE_OFFSETS = Object.fromEntries(
  Object.entries(SCALES).map(([name, def]) => [name, [...new Set(def.map(([, s]) => ((s % 12) + 12) % 12))]])
);

/**
 * Rank scale/mode candidates for a set of events.
 * @param {Array} events tab events (ideally melodic/single-note material).
 * @param {number|null} tonalCenterPc bias root toward this pc (or null).
 * @param {object} [opts]
 * @param {number} [opts.limit=6] max candidates returned.
 * @returns {{root:number, rootName:string, scaleName:string, fit:number,
 *   matched:number, used:number, coverage:number, notes:string[],
 *   outNotes:string[], score:number, label:string}[]}
 */
export function detectScales(events, tonalCenterPc = null, opts = {}) {
  const limit = opts.limit || 6;
  const weights = buildHistogram(events);
  const used = pitchClassSet(events);
  if (!used.length) return [];
  const usedSet = new Set(used);
  let totalW = 0;
  for (let i = 0; i < 12; i++) totalW += weights[i];

  const out = [];
  for (let root = 0; root < 12; root++) {
    for (const [scaleName, offsets] of Object.entries(SCALE_OFFSETS)) {
      const scalePCs = new Set(offsets.map((o) => (root + o) % 12));
      let matched = 0, inWeight = 0;
      for (const pc of used) if (scalePCs.has(pc)) matched++;
      for (let pc = 0; pc < 12; pc++) if (scalePCs.has(pc)) inWeight += weights[pc];

      const fit = matched / used.length;             // fraction of used notes explained
      if (fit < 0.6) continue;                        // skip poor fits early
      const weightedFit = totalW > 0 ? inWeight / totalW : 0;
      const tightness = matched / scalePCs.size;      // how much of the scale is exercised
      const extra = scalePCs.size - matched;          // unused scale tones

      let score = fit * 100 + weightedFit * 40 + tightness * 12 - extra * 1.2;
      if (tonalCenterPc != null && root === tonalCenterPc) score += 10;
      // Nudge toward familiar scales when fit ties, so common answers win.
      if (/(Major \(Ionian\)|Natural Minor|Pentatonic|Blues|Dorian|Phrygian|Mixolydian)/.test(scaleName)) score += 1.5;

      out.push({ root, scaleName, fit, matched, used: used.length, weightedFit, tightness, extra, score });
    }
  }

  out.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const ranked = [];
  for (const cand of out) {
    const key = cand.root + '|' + cand.scaleName;
    if (seen.has(key)) continue;
    seen.add(key);
    const rootName = pcName(cand.root);
    const notes = getScaleNotes(rootName, cand.scaleName) || [];
    const scalePCs = new Set(SCALE_OFFSETS[cand.scaleName].map((o) => (cand.root + o) % 12));
    const outNotes = used.filter((pc) => !scalePCs.has(pc)).map(pcName);
    ranked.push({
      ...cand,
      rootName,
      coverage: cand.fit,
      notes,
      outNotes,
      label: `${rootName} ${cand.scaleName} (${cand.matched}/${cand.used} notes)`,
    });
    if (ranked.length >= limit) break;
  }
  return ranked;
}
