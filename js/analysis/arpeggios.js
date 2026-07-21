// Arpeggio detection: find melodic runs that outline a chord (leaps through
// chord tones) rather than moving stepwise like a scale run. Sweep-picked and
// tapped arpeggios are flagged as special cases.

import { identifyChordWithBass } from './chordDetect.js';
import { pitchedEvents, groupBySlot, pcName } from './pitchClass.js';

// Absolute semitone leaps typical of arpeggios (3rds..9ths); 1–2 semitones are
// stepwise/scalar and disqualify a chordal run.
const CHORD_LEAPS = new Set([3, 4, 5, 7, 8, 9, 10, 12]);

function isStep(iv) { return iv === 1 || iv === 2; }

/**
 * @param {Array} events tab events.
 * @returns {{chord:string, root:string, slotRange:[number,number],
 *   sweep:boolean, tapped:boolean, notes:string[]}[]}
 */
export function detectArpeggios(events) {
  // Melodic timeline: slots carrying exactly one pitched note, in order.
  const melodic = groupBySlot(pitchedEvents(events))
    .filter((g) => g.events.length === 1)
    .map((g) => ({ slot: g.slot, ...g.events[0] }));

  const arps = [];
  let i = 0;
  while (i < melodic.length) {
    let j = i;
    // Extend the run while consecutive leaps stay chordal (no stepwise motion).
    while (j + 1 < melodic.length) {
      const iv = Math.abs(melodic[j + 1].midi - melodic[j].midi);
      if (iv === 0 || isStep(iv) || !CHORD_LEAPS.has(iv)) break;
      j++;
    }

    const run = melodic.slice(i, j + 1);
    if (run.length >= 3) {
      const pcs = [...new Set(run.map((n) => n.pc))];
      if (pcs.length >= 3 && pcs.length <= 4) {
        const bassPc = run.reduce((lo, n) => (n.midi < lo.midi ? n : lo), run[0]).pc;
        const chord = identifyChordWithBass(pcs, bassPc);
        if (chord && !chord.unknown) {
          // Sweep: one note per string across adjacent, monotonically moving strings.
          let mono = true, prevDir = 0;
          for (let k = 1; k < run.length; k++) {
            const d = run[k].stringIndex - run[k - 1].stringIndex;
            if (Math.abs(d) !== 1) { mono = false; break; }
            if (prevDir && Math.sign(d) !== prevDir) { mono = false; break; }
            prevDir = Math.sign(d) || prevDir;
          }
          const strings = new Set(run.map((n) => n.stringIndex));
          const sweep = mono && strings.size >= 3;
          const tapped = run.some((n) => n.techniques.includes('tap'));
          arps.push({
            chord: chord.label,
            root: chord.root,
            slotRange: [run[0].slot, run[run.length - 1].slot],
            sweep, tapped,
            notes: run.map((n) => pcName(n.pc)),
          });
        }
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return arps;
}
