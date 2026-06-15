import { parseNote, spellNote } from './theory.js';

export const INT_EASY = [
  ['Minor 2nd',1,1],['Major 2nd',2,1],['Minor 3rd',3,2],['Major 3rd',4,2],
  ['Perfect 4th',5,3],['Perfect 5th',7,4],['Minor 6th',8,5],['Major 6th',9,5],
  ['Minor 7th',10,6],['Major 7th',11,6],['Perfect Octave',12,0],
];
export const INT_MED_ADD = [
  ['Augmented 4th',6,3],['Diminished 5th',6,4],['Augmented 2nd',3,1],
  ['Diminished 3rd',2,2],['Augmented 5th',8,4],['Diminished 4th',4,3],
  ['Augmented 3rd',5,2],['Diminished 7th',9,6],
];
export const INT_HARD_ADD = [
  ['Augmented Unison',1,0],['Diminished 2nd',0,1],['Augmented 6th',10,5],
  ['Diminished 6th',7,5],['Augmented 7th',12,6],['Diminished Octave',11,0],
];

export function getIntervalPool(diff) {
  if (diff === 'easy') return [...INT_EASY];
  if (diff === 'medium') return [...INT_EASY, ...INT_MED_ADD];
  return [...INT_EASY, ...INT_MED_ADD, ...INT_HARD_ADD];
}

export function computeInterval(rootStr, interval) {
  const r = parseNote(rootStr);
  if (!r) return null;
  return spellNote(r.li, r.semi, interval[2], interval[1]);
}
