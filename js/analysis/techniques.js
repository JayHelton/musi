// Technique catalog: tally the playing techniques attached to note events and
// derive a few plain-language insights.

import { TECHNIQUE_LABELS, LEGATO_TECHNIQUES } from '../tab/tabModel.js';

/**
 * Count techniques across an events array.
 * @param {Array} events tab events.
 * @returns {{ counts: Object, total: number, ordered: {id,label,count}[], insights: string[] }}
 */
export function summarizeTechniques(events) {
  const counts = {};
  for (const e of events) {
    for (const t of (e.techniques || [])) counts[t] = (counts[t] || 0) + 1;
    if (e.dead && !e.techniques.includes('dead')) counts.dead = (counts.dead || 0) + 1;
  }

  const ordered = Object.entries(counts)
    .map(([id, count]) => ({ id, label: TECHNIQUE_LABELS[id] || id, count }))
    .sort((a, b) => b.count - a.count);

  const total = ordered.reduce((s, x) => s + x.count, 0);

  const insights = [];
  const legato = ordered.filter((o) => LEGATO_TECHNIQUES.has(o.id)).reduce((s, o) => s + o.count, 0);
  if (legato >= 4) insights.push('Legato-heavy: relies on hammer-ons, pull-offs and slides.');
  if (counts.bend >= 3) insights.push('Expressive bends are a core part of the phrasing.');
  if (counts.palmMute >= 4) insights.push('Palm muting drives the rhythmic attack (chugging/riffing).');
  if (counts.tremolo >= 3) insights.push('Tremolo picking is used for sustained intensity.');
  if (counts.tap >= 2) insights.push('Two-hand tapping extends the reach of the lines.');
  if (counts.harmonic >= 2) insights.push('Harmonics add colour / accents.');
  if (counts.vibrato >= 3) insights.push('Vibrato is used to sustain and colour held notes.');

  return { counts, total, ordered, insights };
}
