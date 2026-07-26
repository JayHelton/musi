// Movable sweep-picking library. Shapes are authored for root A in standard
// tuning (common 3/4/5-string root patterns with hammer-ons and pull-offs),
// then transposed by semitone so any tonal center can be practised as an
// exercise — not random scale tones.

import { parseNote, spellNote } from './theory.js';

// Spell a note as an interval above a tonal center (letter + semitone offsets).
function spellAbove(rootStr, letterOff, semiOff) {
  const r = parseNote(rootStr);
  if (!r) return '?';
  return spellNote(r.li, r.semi, letterOff, semiOff) || '?';
}

const A_SEMI = 9; // pitch-class of A

// Standard-tuning string labels used by the library (high → low display order).
export const SWEEP_STRING_SETS = {
  3: { id: 3, label: '3-string', strings: ['G', 'B', 'e'], used: 'G-B-e' },
  4: { id: 4, label: '4-string', strings: ['D', 'G', 'B', 'e'], used: 'D-G-B-e' },
  5: { id: 5, label: '5-string', strings: ['A', 'D', 'G', 'B', 'e'], used: 'A-D-G-B-e' },
};

// join: '' → "Amaj7"; ' ' → "A major"
function p(id, name, join, formula, stringSet, events) {
  return { id, name, join, formula, stringSet, events };
}

// events: ordered play sequence. `s` = string label, `f` = fret for root A,
// optional `t` = 'h' (hammer-on) or 'p' (pull-off) into this note.
const PATTERNS_3 = [
  p('maj', 'major', ' ', '1 3 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 12 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('min', 'minor', ' ', '1 b3 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 12 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('dim', 'diminished', ' ', '1 b3 b5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 11 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('aug', 'augmented', ' ', '1 3 #5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 13 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('sus2', 'sus2', '', '1 2 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 12 }, { s: 'e', f: 12 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 12 }, { s: 'G', f: 14 },
  ]),
  p('sus4', 'sus4', '', '1 4 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 15 }, { s: 'e', f: 12 },
    { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 15 }, { s: 'G', f: 14 },
  ]),
  p('maj7', 'maj7', '', '1 3 5 7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 12 },
    { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('7', '7', '', '1 3 5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 12 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('m7', 'm7', '', '1 b3 5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 12 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('mMaj7', 'mMaj7', '', '1 b3 5 7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 12 },
    { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('m7b5', 'm7b5', '', '1 b3 b5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 11 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('dim7', 'dim7', '', '1 b3 b5 bb7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 11 },
    { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('maj7#5', 'maj7#5', '', '1 3 #5 7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 13 },
    { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('7#5', '7#5', '', '1 3 #5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 13 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('7b5', '7b5', '', '1 3 b5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 11 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('6', '6', '', '1 3 5 6', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 14 }, { s: 'e', f: 12 },
    { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 },
  ]),
  p('m6', 'm6', '', '1 b3 5 6', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'e', f: 12 },
    { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 },
  ]),
  p('add9', 'add9', '', '1 2 3 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 12 }, { s: 'e', f: 9 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 9, t: 'p' },
    { s: 'B', f: 12 }, { s: 'G', f: 14 },
  ]),
  p('madd9', 'madd9', '', '1 2 b3 5', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 12 }, { s: 'e', f: 8 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 8, t: 'p' },
    { s: 'B', f: 12 }, { s: 'G', f: 14 },
  ]),
  p('7sus4', '7sus4', '', '1 4 5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 15 }, { s: 'e', f: 12 },
    { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 15 }, { s: 'G', f: 14 },
  ]),
  p('7b9', '7b9', '', '1 b9 3 5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' }, { s: 'G', f: 14 },
  ]),
  p('7#9', '7#9', '', '1 #9 3 5 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 13 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 13, t: 'p' }, { s: 'G', f: 14 },
  ]),
  p('13b9', '13b9', '', '1 b9 3 5 6 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 15, t: 'h' },
    { s: 'e', f: 14, t: 'p' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' }, { s: 'G', f: 14 },
  ]),
  p('7b9b13', '7b9b13', '', '1 b9 3 5 b6 b7', 3, [
    { s: 'G', f: 14 }, { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 13, t: 'h' }, { s: 'e', f: 15, t: 'h' },
    { s: 'e', f: 13, t: 'p' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' }, { s: 'G', f: 14 },
  ]),
];

const PATTERNS_4 = [
  p('maj', 'major', ' ', '1 3 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'e', f: 5 },
    { s: 'e', f: 9, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('min', 'minor', ' ', '1 b3 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 5 }, { s: 'e', f: 5 },
    { s: 'e', f: 8, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('dim', 'diminished', ' ', '1 b3 b5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 4 }, { s: 'e', f: 5 },
    { s: 'e', f: 8, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 4 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('aug', 'augmented', ' ', '1 3 #5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 6 }, { s: 'e', f: 5 },
    { s: 'e', f: 9, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 6 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('sus2', 'sus2', '', '1 2 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 4 }, { s: 'B', f: 5 }, { s: 'e', f: 5 },
    { s: 'e', f: 7, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 4 }, { s: 'D', f: 7 },
  ]),
  p('sus4', 'sus4', '', '1 4 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 7 }, { s: 'B', f: 5 }, { s: 'e', f: 5 },
    { s: 'e', f: 10, t: 'h' }, { s: 'e', f: 5, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 7 }, { s: 'D', f: 7 },
  ]),
  p('maj7', 'maj7', '', '1 3 5 7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'e', f: 4 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 4, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('7', '7', '', '1 3 5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('m7', 'm7', '', '1 b3 5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 5 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('mMaj7', 'mMaj7', '', '1 b3 5 7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 5 }, { s: 'e', f: 4 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 4, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('m7b5', 'm7b5', '', '1 b3 b5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 4 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 4 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('dim7', 'dim7', '', '1 b3 b5 bb7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 5 }, { s: 'B', f: 4 }, { s: 'e', f: 2 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 2, t: 'p' },
    { s: 'B', f: 4 }, { s: 'G', f: 5 }, { s: 'D', f: 7 },
  ]),
  p('maj7#5', 'maj7#5', '', '1 3 #5 7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 6 }, { s: 'e', f: 4 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 4, t: 'p' },
    { s: 'B', f: 6 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('7#5', '7#5', '', '1 3 #5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 6 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 6 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('7b5', '7b5', '', '1 3 b5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 4 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 4 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('6', '6', '', '1 3 5 6', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 9 }, { s: 'B', f: 7 }, { s: 'e', f: 9 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 9, t: 'p' },
    { s: 'B', f: 7 }, { s: 'G', f: 9 }, { s: 'D', f: 7 },
  ]),
  p('m6', 'm6', '', '1 b3 5 6', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 9 }, { s: 'B', f: 7 }, { s: 'e', f: 8 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 8, t: 'p' },
    { s: 'B', f: 7 }, { s: 'G', f: 9 }, { s: 'D', f: 7 },
  ]),
  p('add9', 'add9', '', '1 2 3 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 9 }, { s: 'B', f: 12 }, { s: 'e', f: 9 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 9, t: 'p' },
    { s: 'B', f: 12 }, { s: 'G', f: 9 }, { s: 'D', f: 7 },
  ]),
  p('madd9', 'madd9', '', '1 2 b3 5', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 9 }, { s: 'B', f: 12 }, { s: 'e', f: 8 },
    { s: 'e', f: 12, t: 'h' }, { s: 'e', f: 8, t: 'p' },
    { s: 'B', f: 12 }, { s: 'G', f: 9 }, { s: 'D', f: 7 },
  ]),
  p('7sus4', '7sus4', '', '1 4 5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 7 }, { s: 'B', f: 5 }, { s: 'e', f: 3 },
    { s: 'e', f: 5, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 7 }, { s: 'D', f: 7 },
  ]),
  p('7b9', '7b9', '', '1 b9 3 5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'e', f: 3 },
    { s: 'e', f: 6, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('7#9', '7#9', '', '1 #9 3 5 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'e', f: 3 },
    { s: 'e', f: 8, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 5 }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('13b9', '13b9', '', '1 b9 3 5 6 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'B', f: 7, t: 'h' },
    { s: 'e', f: 3 }, { s: 'e', f: 6, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 7 }, { s: 'B', f: 5, t: 'p' }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
  p('7b9b13', '7b9b13', '', '1 b9 3 5 b6 b7', 4, [
    { s: 'D', f: 7 }, { s: 'G', f: 6 }, { s: 'B', f: 5 }, { s: 'B', f: 6, t: 'h' },
    { s: 'e', f: 3 }, { s: 'e', f: 6, t: 'h' }, { s: 'e', f: 3, t: 'p' },
    { s: 'B', f: 6 }, { s: 'B', f: 5, t: 'p' }, { s: 'G', f: 6 }, { s: 'D', f: 7 },
  ]),
];

const PATTERNS_5 = [
  p('maj', 'major', ' ', '1 3 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 14 }, { s: 'B', f: 14 },
    { s: 'e', f: 12 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('min', 'minor', ' ', '1 b3 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 14 }, { s: 'B', f: 13 },
    { s: 'e', f: 12 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('dim', 'diminished', ' ', '1 b3 b5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 13 }, { s: 'G', f: 14 }, { s: 'B', f: 13 },
    { s: 'e', f: 11 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 14 }, { s: 'D', f: 13 }, { s: 'A', f: 12 },
  ]),
  p('aug', 'augmented', ' ', '1 3 #5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 15 }, { s: 'G', f: 14 }, { s: 'B', f: 14 },
    { s: 'e', f: 13 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 14 }, { s: 'D', f: 15 }, { s: 'A', f: 12 },
  ]),
  p('sus2', 'sus2', '', '1 2 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 16 }, { s: 'B', f: 17 },
    { s: 'e', f: 17 }, { s: 'e', f: 19, t: 'h' }, { s: 'e', f: 17, t: 'p' },
    { s: 'B', f: 17 }, { s: 'G', f: 16 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('sus4', 'sus4', '', '1 4 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 14 }, { s: 'B', f: 15 },
    { s: 'e', f: 12 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 15 }, { s: 'G', f: 14 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('maj7', 'maj7', '', '1 3 5 7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 13 }, { s: 'B', f: 14 },
    { s: 'e', f: 12 }, { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 13 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('7', '7', '', '1 3 5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 12 }, { s: 'B', f: 14 },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 12 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('m7', 'm7', '', '1 b3 5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 12 }, { s: 'B', f: 13 },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 12 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('mMaj7', 'mMaj7', '', '1 b3 5 7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 13 }, { s: 'B', f: 13 },
    { s: 'e', f: 12 }, { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 13 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('m7b5', 'm7b5', '', '1 b3 b5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 13 }, { s: 'G', f: 12 }, { s: 'B', f: 13 },
    { s: 'e', f: 11 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 12 }, { s: 'D', f: 13 }, { s: 'A', f: 12 },
  ]),
  p('dim7', 'dim7', '', '1 b3 b5 bb7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 13 }, { s: 'G', f: 11 }, { s: 'B', f: 13 },
    { s: 'e', f: 11 }, { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 11 }, { s: 'D', f: 13 }, { s: 'A', f: 12 },
  ]),
  p('maj7#5', 'maj7#5', '', '1 3 #5 7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 15 }, { s: 'G', f: 13 }, { s: 'B', f: 14 },
    { s: 'e', f: 13 }, { s: 'e', f: 16, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 13 }, { s: 'D', f: 15 }, { s: 'A', f: 12 },
  ]),
  p('7#5', '7#5', '', '1 3 #5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 15 }, { s: 'G', f: 12 }, { s: 'B', f: 14 },
    { s: 'e', f: 13 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 13, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 12 }, { s: 'D', f: 15 }, { s: 'A', f: 12 },
  ]),
  p('7b5', '7b5', '', '1 3 b5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 13 }, { s: 'G', f: 12 }, { s: 'B', f: 14 },
    { s: 'e', f: 11 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 11, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 12 }, { s: 'D', f: 13 }, { s: 'A', f: 12 },
  ]),
  p('6', '6', '', '1 3 5 6', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 11 }, { s: 'B', f: 14 },
    { s: 'e', f: 12 }, { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 11 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('m6', 'm6', '', '1 b3 5 6', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 11 }, { s: 'B', f: 13 },
    { s: 'e', f: 12 }, { s: 'e', f: 14, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 11 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('add9', 'add9', '', '1 2 3 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 16 }, { s: 'B', f: 14 },
    { s: 'e', f: 12 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'G', f: 16 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('madd9', 'madd9', '', '1 2 b3 5', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 16 }, { s: 'B', f: 13 },
    { s: 'e', f: 12 }, { s: 'e', f: 17, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 13 }, { s: 'G', f: 16 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('7sus4', '7sus4', '', '1 4 5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 12 }, { s: 'B', f: 15 },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 15 }, { s: 'G', f: 12 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('7b9', '7b9', '', '1 b9 3 5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 12 },
    { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' },
    { s: 'G', f: 12 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('7#9', '7#9', '', '1 #9 3 5 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 }, { s: 'G', f: 12 },
    { s: 'B', f: 13 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 }, { s: 'e', f: 15, t: 'h' }, { s: 'e', f: 12, t: 'p' },
    { s: 'B', f: 14 }, { s: 'B', f: 13, t: 'p' },
    { s: 'G', f: 12 }, { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('13b9', '13b9', '', '1 b9 3 5 6 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 14 },
    { s: 'G', f: 11 }, { s: 'G', f: 12, t: 'h' },
    { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' },
    { s: 'G', f: 12 }, { s: 'G', f: 11, t: 'p' },
    { s: 'D', f: 14 }, { s: 'A', f: 12 },
  ]),
  p('7b9b13', '7b9b13', '', '1 b9 3 5 b6 b7', 5, [
    { s: 'A', f: 12 }, { s: 'D', f: 15 }, { s: 'G', f: 12 },
    { s: 'B', f: 11 }, { s: 'B', f: 14, t: 'h' },
    { s: 'e', f: 12 },
    { s: 'B', f: 14 }, { s: 'B', f: 11, t: 'p' },
    { s: 'G', f: 12 }, { s: 'D', f: 15 }, { s: 'A', f: 12 },
  ]),
];

export const SWEEP_PATTERNS = [...PATTERNS_3, ...PATTERNS_4, ...PATTERNS_5];

export const DIMINISHED_PRIORITY = {
  wholeHalf: {
    title: 'Whole-half diminished',
    // Authored for A as: A B C D Eb F F# G#
    scaleHint: (root) => [
      [0, 0], [1, 2], [2, 3], [3, 5], [4, 6], [5, 8], [5, 9], [6, 11],
    ].map(([lo, so]) => spellAbove(root, lo, so)).join(' '),
    // Adim7, Bdim7, Dm7b5, Fm7b5, Am6, Cm6
    prioritizeLabels: (root) => [
      `${root}dim7`,
      `${spellAbove(root, 1, 2)}dim7`,
      `${spellAbove(root, 3, 5)}m7b5`,
      `${spellAbove(root, 5, 8)}m7b5`,
      `${root}m6`,
      `${spellAbove(root, 2, 3)}m6`,
    ],
  },
  halfWhole: {
    title: 'Half-whole diminished (dominant)',
    // Authored for A as: A Bb C C# Eb E F# G
    scaleHint: (root) => [
      [0, 0], [1, 1], [2, 3], [2, 4], [4, 6], [4, 7], [5, 9], [6, 10],
    ].map(([lo, so]) => spellAbove(root, lo, so)).join(' '),
    prioritizeLabels: (root) => [
      `${root}7b9`,
      `${root}7#9`,
      `${root}13b9`,
      `${root}7b9b13`,
      `${root}7b5`,
      `${root}7#5`,
      `${spellAbove(root, 1, 1)}dim7 over ${/^[AEIOUaeiou]/.test(root) ? 'an' : 'a'} ${root} pedal`,
    ],
  },
  sequence: {
    title: 'Movable diminished sequence',
    // Adim7 → Cdim7 → Ebdim7 → F#dim7
    describe: (root) => {
      const a = root;
      const b = spellAbove(root, 2, 3);
      const c = spellAbove(root, 4, 6);
      const d = spellAbove(root, 5, 9);
      return `${a}dim7 → ${b}dim7 → ${c}dim7 → ${d}dim7`;
    },
    note: 'All four names contain the same notes. Move any dim7 sweep shape upward in three-fret increments.',
  },
};

export function patternTitle(root, pattern) {
  return pattern.join === '' ? `${root}${pattern.name}` : `${root} ${pattern.name}`;
}

export function patternsForStringSet(stringSet) {
  return SWEEP_PATTERNS.filter((p) => p.stringSet === stringSet);
}

// Semitone shift from authored root A → target tonal center, plus a whole-octave
// nudge so the shape sits on a playable 0–24 fret window.
export function transposeShift(rootStr, frets) {
  const root = parseNote(rootStr);
  if (!root) return 0;
  let shift = root.semi - A_SEMI;
  // Prefer the octave that keeps the majority of frets in 0–24 and near the
  // authored register (avoid dumping everything into negative frets).
  let best = shift;
  let bestCost = Infinity;
  for (const oct of [-12, 0, 12, 24]) {
    const s = shift + oct;
    let violation = 0;
    let sum = 0;
    frets.forEach((f) => {
      const v = f + s;
      sum += v;
      if (v < 0) violation += -v;
      else if (v > 24) violation += v - 24;
    });
    const mean = sum / frets.length;
    const cost = violation * 1000 + Math.abs(mean - 12);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
}

export function transposePattern(rootStr, pattern) {
  const baseFrets = pattern.events.map((e) => e.f);
  const shift = transposeShift(rootStr, baseFrets);
  return {
    ...pattern,
    title: patternTitle(rootStr, pattern),
    shift,
    events: pattern.events.map((e) => ({
      s: e.s,
      f: e.f + shift,
      t: e.t || null,
    })),
  };
}

// Render ASCII guitar tab with hammer-on / pull-off markers, matching the
// common teaching style (e.g. `12-h17-p12`).
export function renderSweepTab(transposed, stringSet) {
  const set = SWEEP_STRING_SETS[stringSet];
  if (!set || !transposed?.events?.length) return '';

  // Display high → low
  const order = [...set.strings].reverse();
  const rows = Object.fromEntries(order.map((s) => [s, '']));

  transposed.events.forEach((ev) => {
    const token = ev.t ? `${ev.t}${ev.f}` : String(ev.f);
    const blank = '-'.repeat(token.length);
    order.forEach((s) => {
      rows[s] += '-' + (s === ev.s ? token : blank);
    });
  });

  let tab = '';
  order.forEach((s) => {
    tab += `${s}|${rows[s]}-|\n`;
  });
  return tab;
}

export function getSweepLibrary(rootStr, stringSet) {
  return patternsForStringSet(stringSet).map((p) => {
    const tp = transposePattern(rootStr, p);
    return {
      id: p.id,
      title: tp.title,
      formula: p.formula,
      stringSet,
      stringsUsed: SWEEP_STRING_SETS[stringSet].used,
      tab: renderSweepTab(tp, stringSet),
      events: tp.events,
    };
  });
}
