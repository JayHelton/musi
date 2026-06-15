import { parseNote, spellNote } from './theory.js';

export const SCALES = {
  'Major (Ionian)':       [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,11]],
  'Dorian':               [[0,0],[1,2],[2,3],[3,5],[4,7],[5,9],[6,10]],
  'Phrygian':             [[0,0],[1,1],[2,3],[3,5],[4,7],[5,8],[6,10]],
  'Lydian':               [[0,0],[1,2],[2,4],[3,6],[4,7],[5,9],[6,11]],
  'Mixolydian':           [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,10]],
  'Natural Minor (Aeolian)':[[0,0],[1,2],[2,3],[3,5],[4,7],[5,8],[6,10]],
  'Locrian':              [[0,0],[1,1],[2,3],[3,5],[4,6],[5,8],[6,10]],
  'Harmonic Minor':       [[0,0],[1,2],[2,3],[3,5],[4,7],[5,8],[6,11]],
  'Melodic Minor (Asc)':  [[0,0],[1,2],[2,3],[3,5],[4,7],[5,9],[6,11]],
  'Major Pentatonic':     [[0,0],[1,2],[2,4],[4,7],[5,9]],
  'Minor Pentatonic':     [[0,0],[2,3],[3,5],[4,7],[6,10]],
  'Blues':                 [[0,0],[2,3],[3,5],[4,6],[4,7],[6,10]],
  'Whole Tone':           [[0,0],[1,2],[2,4],[3,6],[4,8],[5,10]],
  'Diminished H-W':       [[0,0],[1,1],[2,3],[2,4],[3,6],[4,7],[5,9],[6,10]],
  'Diminished W-H':       [[0,0],[1,2],[2,3],[3,5],[4,6],[5,8],[5,9],[6,11]],
  'Hungarian Minor':      [[0,0],[1,2],[2,3],[3,6],[4,7],[5,8],[6,11]],
  'Phrygian Dominant':    [[0,0],[1,1],[2,4],[3,5],[4,7],[5,8],[6,10]],
  'Double Harmonic Major':[[0,0],[1,1],[2,4],[3,5],[4,7],[5,8],[6,11]],
  'Neapolitan Minor':     [[0,0],[1,1],[2,3],[3,5],[4,7],[5,8],[6,11]],
  'Neapolitan Major':     [[0,0],[1,1],[2,3],[3,5],[4,7],[5,9],[6,11]],
  'Persian':              [[0,0],[1,1],[2,4],[3,5],[4,6],[5,8],[6,11]],
  'Enigmatic':            [[0,0],[1,1],[2,4],[3,6],[4,8],[5,10],[6,11]],
  'Lydian Dominant':      [[0,0],[1,2],[2,4],[3,6],[4,7],[5,9],[6,10]],
  'Altered':              [[0,0],[1,1],[2,3],[3,4],[4,6],[5,8],[6,10]],
  'Bebop Dominant':       [[0,0],[1,2],[2,4],[3,5],[4,7],[5,9],[6,10],[6,11]],
  'Hirajoshi':            [[0,0],[1,2],[2,3],[4,7],[5,8]],
  'In-Sen':               [[0,0],[1,1],[3,5],[4,7],[6,10]],
};

export function getScaleNotes(rootStr, scaleName) {
  const r = parseNote(rootStr);
  if (!r) return null;
  const def = SCALES[scaleName];
  if (!def) return null;
  return def.map(([lo,so]) => spellNote(r.li, r.semi, lo, so));
}

export function scaleStepPattern(scaleName) {
  const def = SCALES[scaleName];
  if (!def) return '';
  const steps = [];
  for (let i = 1; i < def.length; i++) {
    const d = def[i][1] - def[i-1][1];
    if (d === 1) steps.push('H');
    else if (d === 2) steps.push('W');
    else if (d === 3) steps.push('m3');
    else steps.push(d+'h');
  }
  return steps.join(' – ');
}
