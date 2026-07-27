// Movable sweep-picking library. Shapes are authored for root A in standard
// tuning (common 3/4/5-string root patterns with hammer-ons and pull-offs),
// then transposed by semitone so any tonal center can be practised as an
// exercise — not random scale tones.

import { parseNote, spellNote, NOTE_NAMES_SHARP } from './theory.js';

// Spell a note as an interval above a tonal center (letter + semitone offsets).
function spellAbove(rootStr, letterOff, semiOff) {
  const r = parseNote(rootStr);
  if (!r) return '?';
  return spellNote(r.li, r.semi, letterOff, semiOff) || '?';
}

const A_SEMI = 9; // pitch-class of A

// Pitch classes / open MIDI of the open strings used by the library (standard).
const OPEN_PC = { A: 9, D: 2, G: 7, B: 11, e: 4, E: 4 };
const OPEN_MIDI = { E: 40, A: 45, D: 50, G: 55, B: 59, e: 64 };

// Standard-tuning string labels used by the library (high → low display order).
export const SWEEP_STRING_SETS = {
  3: { id: 3, label: '3-string', strings: ['G', 'B', 'e'], used: 'G-B-e' },
  4: { id: 4, label: '4-string', strings: ['D', 'G', 'B', 'e'], used: 'D-G-B-e' },
  5: { id: 5, label: '5-string', strings: ['A', 'D', 'G', 'B', 'e'], used: 'A-D-G-B-e' },
};

const FORMULA_SEMIS = {
  '1': 0, 'b2': 1, 'b9': 1, '2': 2, '#2': 3, '#9': 3, 'b3': 3, '3': 4,
  '4': 5, 'b5': 6, '5': 7, '#5': 8, 'b6': 8, 'b13': 8, '6': 9, '13': 9,
  'bb7': 9, 'b7': 10, '7': 11,
};
const INV_LABELS = ['Root', '1st', '2nd', '3rd', '4th', '5th'];

// Unique chord-tone semitones from a formula string, in written order.
export function formulaTones(formula) {
  const seen = new Set();
  const tones = [];
  String(formula || '').split(/\s+/).forEach((tok) => {
    const s = FORMULA_SEMIS[tok];
    if (s == null || seen.has(s)) return;
    seen.add(s);
    tones.push(s);
  });
  return tones;
}

// Inversions are taught on the chord's core shell (1 / 3 / 5 / 7 family),
// not on tensions like b9/#9. Cap at four (Root..3rd).
const INVERTIBLE = new Set([0, 3, 4, 6, 7, 8, 9, 10, 11]);

export function inversionBassTones(formula) {
  const tones = formulaTones(formula);
  const core = tones.filter((s) => INVERTIBLE.has(s));
  return (core.length ? core : tones).slice(0, 4);
}

export function inversionOptions(formula) {
  return inversionBassTones(formula).map((semi, i) => ({
    inv: i,
    label: INV_LABELS[i] || `${i}`,
    bassSemi: semi,
  }));
}

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

export function patternTitle(root, pattern, inversion = 0) {
  const base = pattern.join === '' ? `${root}${pattern.name}` : `${root} ${pattern.name}`;
  if (!inversion) return base;
  const opt = inversionOptions(pattern.formula)[inversion];
  return `${base} · ${opt ? opt.label : inversion} inv`;
}

export function patternsForStringSet(stringSet) {
  return SWEEP_PATTERNS.filter((p) => p.stringSet === stringSet);
}

// Build a playable ascending+descending sweep for an inversion. Root position
// (inversion 0) keeps the authored library events; higher inversions place the
// Nth chord tone on the lowest string of the set and ascend one chord tone per
// string with a hammer/pull turnaround on the top string — the standard way
// 1st/2nd/3rd inversion sweeps are taught.
function generateInversionEvents(pattern, inversion) {
  // Ascending path uses the full formula tone set; bass rotation uses the
  // invertible shell so tensions don't become inversion roots.
  const tones = formulaTones(pattern.formula);
  const bassTones = inversionBassTones(pattern.formula);
  if (!tones.length || !bassTones.length) return pattern.events;
  const inv = ((inversion % bassTones.length) + bassTones.length) % bassTones.length;
  if (inv === 0) return pattern.events;

  // Rotate the full tone list so it starts on the chosen bass degree.
  const bass = bassTones[inv];
  const start = tones.indexOf(bass);
  const rotated = start >= 0
    ? tones.slice(start).concat(tones.slice(0, start))
    : bassTones.slice(inv).concat(bassTones.slice(0, inv));

  const strings = SWEEP_STRING_SETS[pattern.stringSet].strings;
  const asc = [];
  let prevMidi = null;

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    const tone = rotated[i % rotated.length];
    const open = OPEN_MIDI[s];
    const targetPc = (A_SEMI + tone) % 12;
    let baseFret = (targetPc - (open % 12) + 12) % 12;
    let fret = baseFret;
    let midi = open + fret;

    if (prevMidi == null) {
      // Prefer a mid-neck starting fret so inversions sit as teachable shapes.
      let best = fret;
      let bestCost = Infinity;
      for (const oct of [-12, 0, 12, 24]) {
        const f = baseFret + oct;
        if (f < 0 || f > 21) continue;
        const cost = Math.abs(f - 10);
        if (cost < bestCost) {
          bestCost = cost;
          best = f;
        }
      }
      fret = best;
      midi = open + fret;
    } else {
      while (midi <= prevMidi) {
        fret += 12;
        midi += 12;
      }
      if (fret > 24) {
        // Fall back: allow a slightly lower pitch-class match an octave down
        // only if still above the previous note (rare on these string sets).
        const fallback = fret - 12;
        if (fallback >= 0 && open + fallback > prevMidi) {
          fret = fallback;
          midi = open + fret;
        }
      }
    }
    asc.push({ s, f: fret });
    prevMidi = midi;
  }

  const top = strings[strings.length - 1];
  const last = asc[asc.length - 1];
  const hammerTone = rotated[strings.length % rotated.length];
  const hammerPc = (A_SEMI + hammerTone) % 12;
  let hf = (hammerPc - (OPEN_MIDI[top] % 12) + 12) % 12;
  while (hf <= last.f) hf += 12;
  // Keep the hammer in a one-position stretch when possible.
  while (hf - last.f > 7 && hf - 12 > last.f) hf -= 12;

  const events = asc.map((n) => ({ s: n.s, f: n.f }));
  events.push({ s: top, f: hf, t: 'h' });
  events.push({ s: top, f: last.f, t: 'p' });
  for (let i = asc.length - 2; i >= 0; i--) events.push({ s: asc[i].s, f: asc[i].f });
  return events;
}

export function resolvePattern(pattern, inversion = 0) {
  const bassTones = inversionBassTones(pattern.formula);
  const inv = Math.max(0, Math.min(inversion, Math.max(0, bassTones.length - 1)));
  return {
    ...pattern,
    inversion: inv,
    events: generateInversionEvents(pattern, inv),
  };
}

// Semitone shift from authored root A → target tonal center. Only nudge by
// whole octaves when needed to keep frets on a 0–24 neck — do not pull
// already-playable inversion shapes up toward mid-neck.
export function transposeShift(rootStr, frets) {
  const root = parseNote(rootStr);
  if (!root) return 0;
  const shift = root.semi - A_SEMI;
  let best = shift;
  let bestCost = Infinity;
  for (const oct of [-24, -12, 0, 12, 24]) {
    const s = shift + oct;
    let violation = 0;
    frets.forEach((f) => {
      const v = f + s;
      if (v < 0) violation += -v;
      else if (v > 24) violation += v - 24;
    });
    const cost = violation * 1000 + Math.abs(oct);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
}

export function transposePattern(rootStr, pattern, inversion = 0) {
  const resolved = resolvePattern(pattern, inversion);
  const baseFrets = resolved.events.map((e) => e.f);
  const shift = transposeShift(rootStr, baseFrets);
  return {
    ...resolved,
    title: patternTitle(rootStr, resolved, resolved.inversion),
    shift,
    events: resolved.events.map((e) => ({
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

// Fretboard layout for a transposed pattern: one entry per string (low → high
// within the string set), with unique fretted notes labelled by interval above
// the tonal center. Play order is preserved on each fret entry so the UI can
// show sequence numbers for the ascending sweep.
export function buildSweepLayout(rootStr, pattern, inversion = 0) {
  const root = parseNote(rootStr);
  const tp = transposePattern(rootStr, pattern, inversion);
  const set = SWEEP_STRING_SETS[pattern.stringSet];
  if (!root || !set) return null;

  const byString = Object.fromEntries(set.strings.map((s) => [s, []]));
  tp.events.forEach((ev, order) => {
    const pc = ((OPEN_PC[ev.s] + ev.f) % 12 + 12) % 12;
    const interval = (pc - root.semi + 12) % 12;
    const existing = byString[ev.s].find((f) => f.fret === ev.f);
    if (existing) {
      // Prefer the earliest (ascending) play order for the shared fretted note.
      if (order < existing.order) existing.order = order;
      if (ev.t && !existing.tech) existing.tech = ev.t;
      return;
    }
    byString[ev.s].push({
      fret: ev.f,
      interval,
      isRoot: interval === 0,
      noteName: NOTE_NAMES_SHARP[pc],
      order,
      tech: ev.t || null,
    });
  });

  return {
    title: tp.title,
    formula: pattern.formula,
    stringSet: pattern.stringSet,
    inversion: tp.inversion || 0,
    stringsUsed: set.used,
    events: tp.events,
    tab: renderSweepTab(tp, pattern.stringSet),
    strings: set.strings.map((s) => ({
      note: s,
      label: s,
      frets: byString[s],
    })),
  };
}

export function getSweepLibrary(rootStr, stringSet, inversion = 0) {
  return patternsForStringSet(stringSet).map((p) => {
    const layout = buildSweepLayout(rootStr, p, inversion);
    const invOpts = inversionOptions(p.formula);
    return {
      id: p.id,
      name: p.name,
      join: p.join,
      title: layout.title,
      formula: p.formula,
      stringSet,
      inversion: layout.inversion,
      inversions: invOpts,
      stringsUsed: layout.stringsUsed,
      tab: layout.tab,
      events: layout.events,
      strings: layout.strings,
      layout,
    };
  });
}

export function getSweepPattern(rootStr, stringSet, patternId, inversion = 0) {
  const pattern = patternsForStringSet(stringSet).find((p) => p.id === patternId)
    || patternsForStringSet(stringSet)[0];
  if (!pattern) return null;
  const layout = buildSweepLayout(rootStr, pattern, inversion);
  return {
    id: pattern.id,
    name: pattern.name,
    join: pattern.join,
    title: layout.title,
    formula: pattern.formula,
    stringSet,
    inversion: layout.inversion,
    inversions: inversionOptions(pattern.formula),
    stringsUsed: layout.stringsUsed,
    tab: layout.tab,
    events: layout.events,
    strings: layout.strings,
    layout,
  };
}
