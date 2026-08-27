// The chord set of a key, and the ways out of it.
//
// The Theory tab asks three questions, and this module answers all three with
// pure functions:
//
//   1. Which chords does this root and this mode contain?
//   2. How does that set change when the mode changes?
//   3. Which chords sit outside the key, and which note takes you there?
//
// Every chord comes from one method: stack scale thirds. Start on one degree,
// then add the degree two steps above it, and repeat. The stack knows the role
// of each tone by construction. Three semitones in the third slot is a b3, and
// the same three semitones in the ninth slot is a #9.
//
// No function here touches the DOM or the clock, so the test runner reads them
// directly.

import {
  parseNote, spellNote, INTERVAL_LABELS, NOTE_NAMES_SHARP,
  SCALES, getScaleNotes, shortScaleName,
} from '../adapters/musiTheory.js';

// Roman numerals of the seven scale degrees.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Chord sizes the tab offers, from a plain triad to a ninth chord. */
export const CHORD_SIZES = [
  { id: 3, label: 'Triads' },
  { id: 4, label: '7th chords' },
  { id: 5, label: '9th chords' },
];

/** The largest stack the model builds. Seven tones reach the 13th. */
export const MAX_STACK = 7;

// The tone label for one slot of the stack, keyed by semitones above the root.
// Slot 0 is the root, slot 1 is the third, slot 2 is the fifth, and so on.
const SLOT_LABELS = [
  { 0: 'R' },
  { 1: 'b3', 2: '2', 3: 'b3', 4: '3', 5: '4' },
  { 5: 'b5', 6: 'b5', 7: '5', 8: '#5', 9: '#5' },
  { 8: 'bb7', 9: 'bb7', 10: 'b7', 11: '7' },
  { 1: 'b9', 2: '9', 3: '#9', 4: '#9' },
  { 4: 'b11', 5: '11', 6: '#11', 7: '#11' },
  { 7: 'b13', 8: 'b13', 9: '13', 10: '#13' },
];

/** The tone label of one slot of a stack, such as "b3", "#5", or "b9". */
export function slotLabel(slot, semi) {
  const table = SLOT_LABELS[slot] || {};
  return table[semi] || INTERVAL_LABELS[semi] || String(semi);
}

// The letter step each slot moves above the root. A third is two letters up,
// a fifth is four, and a ninth wraps round to one.
//
// The third slot is the one exception. A suspension puts a second or a fourth
// where the third would be, so the spelling must follow the interval and not
// the slot. Without this, a C sus 4 reads "E#" instead of "F".
function slotLetterOffset(slot, semi) {
  if (slot === 1) {
    if (semi === 1 || semi === 2) return 1;
    if (semi === 5) return 3;
    return 2;
  }
  return (2 * slot) % 7;
}

/**
 * Build one chord from a root note and a list of slots.
 * The out-of-key moves use this, because their chords come from an interval
 * recipe and not from a degree of the current scale.
 * @param {string} rootNote a note name such as "F#"
 * @param {{slot:number, semi:number, label?:string, letterOffset?:number}[]} intervals
 *   slot 1 is the third. `letterOffset` overrides the letter step the spelling
 *   uses, which a 6th chord needs because its top tone is a sixth, not a seventh.
 * @param {Object} [extra] fields to copy onto the chord
 */
export function buildChord(rootNote, intervals, extra = {}) {
  const parsed = parseNote(rootNote);
  if (!parsed) return null;
  const tones = intervals.map(({ slot, semi, label, letterOffset }) => {
    const pc = (parsed.semi + semi) % 12;
    const lo = letterOffset == null ? slotLetterOffset(slot, semi % 12) : letterOffset;
    const spelled = spellNote(parsed.li, parsed.semi, lo, semi % 12);
    return {
      slot,
      semi,
      pc,
      note: spelled || NOTE_NAMES_SHARP[pc],
      label: label || slotLabel(slot, semi),
    };
  });
  const described = describeStack(tones);
  return {
    id: `${rootNote}-${intervals.map(i => i.semi).join('.')}`,
    degree: -1,
    roman: '',
    root: rootNote,
    rootPc: parsed.semi,
    tones,
    pcs: tones.map(t => t.pc),
    name: described.name,
    symbol: `${rootNote}${described.symbol}`,
    suffix: described.symbol,
    quality: described.quality,
    alterations: described.alterations,
    formula: tones.map(t => t.label),
    notes: tones.map(t => t.note),
    size: tones.length,
    inKey: false,
    ...extra,
  };
}

// Triad names keyed by "third:fifth" in semitones.
const TRIAD_NAMES = {
  '4:7': { name: 'Major', symbol: '', quality: 'major' },
  '3:7': { name: 'Minor', symbol: 'm', quality: 'minor' },
  '3:6': { name: 'Diminished', symbol: 'dim', quality: 'diminished' },
  '4:8': { name: 'Augmented', symbol: 'aug', quality: 'augmented' },
  '2:7': { name: 'Sus 2', symbol: 'sus2', quality: 'sus2' },
  '5:7': { name: 'Sus 4', symbol: 'sus4', quality: 'sus4' },
  '4:6': { name: 'Major b5', symbol: '(b5)', quality: 'majorb5' },
  '3:8': { name: 'Minor #5', symbol: 'm(#5)', quality: 'minorsharp5' },
};

// Seventh-chord names keyed by "third:fifth:seventh" in semitones.
const SEVENTH_NAMES = {
  '4:7:11': { name: 'Major 7', symbol: 'maj7', quality: 'major7' },
  '4:7:10': { name: 'Dominant 7', symbol: '7', quality: 'dominant7' },
  '3:7:10': { name: 'Minor 7', symbol: 'm7', quality: 'minor7' },
  '3:6:10': { name: 'Half Diminished 7', symbol: 'm7b5', quality: 'halfdim7' },
  '3:6:9': { name: 'Diminished 7', symbol: 'dim7', quality: 'dim7' },
  '3:7:11': { name: 'Minor Major 7', symbol: 'mMaj7', quality: 'minmaj7' },
  '4:8:11': { name: 'Augmented Major 7', symbol: 'maj7#5', quality: 'augmaj7' },
  '4:8:10': { name: 'Dominant 7 #5', symbol: '7#5', quality: 'dominant7sharp5' },
  '4:6:10': { name: 'Dominant 7 b5', symbol: '7b5', quality: 'dominant7flat5' },
  '4:6:11': { name: 'Major 7 b5', symbol: 'maj7b5', quality: 'major7flat5' },
  '3:8:10': { name: 'Minor 7 #5', symbol: 'm7#5', quality: 'minor7sharp5' },
  '3:8:11': { name: 'Minor Major 7 #5', symbol: 'mMaj7#5', quality: 'minmaj7sharp5' },
  '3:6:11': { name: 'Diminished Major 7', symbol: 'dimMaj7', quality: 'dimmaj7' },
  '4:7:9': { name: 'Major 6', symbol: '6', quality: 'major6' },
  '3:7:9': { name: 'Minor 6', symbol: 'm6', quality: 'minor6' },
  '2:7:10': { name: 'Dominant 7 sus 2', symbol: '7sus2', quality: 'sus2' },
  '2:7:11': { name: 'Major 7 sus 2', symbol: 'maj7sus2', quality: 'sus2' },
  '5:7:10': { name: 'Dominant 7 sus 4', symbol: '7sus4', quality: 'sus4' },
  '5:7:11': { name: 'Major 7 sus 4', symbol: 'maj7sus4', quality: 'sus4' },
};

// The extension each quality expects on the 9th, the 11th, and the 13th. An
// extension that matches folds into the stacked symbol. Anything else stays
// visible as an alteration in brackets.
const NATURAL_EXTENSIONS = {
  major7: { 9: '9', 11: '11', 13: '13' },
  dominant7: { 9: '9', 11: '11', 13: '13' },
  minor7: { 9: '9', 11: '11', 13: '13' },
  halfdim7: { 9: '9', 11: '11', 13: 'b13' },
  minmaj7: { 9: '9', 11: '11', 13: '13' },
  augmaj7: { 9: '9', 11: '11', 13: '13' },
};

// The symbol that replaces the seventh symbol once the stack reaches a size.
// A quality with no entry keeps its seventh symbol and lists its extensions as
// alterations, because a name such as "dim9" has no agreed meaning.
const STACKED_SYMBOL = {
  major7: { 5: 'maj9', 6: 'maj11', 7: 'maj13' },
  dominant7: { 5: '9', 6: '11', 7: '13' },
  minor7: { 5: 'm9', 6: 'm11', 7: 'm13' },
  halfdim7: { 5: 'm9b5', 6: 'm11b5', 7: 'm13b5' },
  minmaj7: { 5: 'mMaj9', 6: 'mMaj11', 7: 'mMaj13' },
  augmaj7: { 5: 'maj9#5', 6: 'maj11#5', 7: 'maj13#5' },
};

const STACKED_NAMES = {
  major7: { 5: 'Major 9', 6: 'Major 11', 7: 'Major 13' },
  dominant7: { 5: 'Dominant 9', 6: 'Dominant 11', 7: 'Dominant 13' },
  minor7: { 5: 'Minor 9', 6: 'Minor 11', 7: 'Minor 13' },
  halfdim7: { 5: 'Half Diminished 9', 6: 'Half Diminished 11', 7: 'Half Diminished 13' },
  minmaj7: { 5: 'Minor Major 9', 6: 'Minor Major 11', 7: 'Minor Major 13' },
  augmaj7: { 5: 'Augmented Major 9', 6: 'Augmented Major 11', 7: 'Augmented Major 13' },
};

// The degree number each extension slot carries.
const SLOT_DEGREE = { 4: 9, 5: 11, 6: 13 };

/**
 * Name one stack of tones.
 * @param {{slot:number, semi:number, label:string}[]} tones the stacked tones
 * @returns {{name:string, symbol:string, quality:string, alterations:string[]}}
 */
export function describeStack(tones) {
  const bySlot = new Map(tones.map(t => [t.slot, t]));
  const third = bySlot.get(1);
  const fifth = bySlot.get(2);
  const seventh = bySlot.get(3);

  if (!third || !fifth) {
    return { name: 'Interval', symbol: '', quality: 'other', alterations: [] };
  }

  const triad = TRIAD_NAMES[`${third.semi}:${fifth.semi}`];
  if (!seventh) {
    if (triad) return { name: triad.name, symbol: triad.symbol, quality: triad.quality, alterations: [] };
    return {
      name: `${third.label} plus ${fifth.label}`,
      symbol: `(${third.label}${fifth.label})`,
      quality: 'other',
      alterations: [],
    };
  }

  const base = SEVENTH_NAMES[`${third.semi}:${fifth.semi}:${seventh.semi}`];
  if (!base) {
    return {
      name: triad ? `${triad.name} add ${seventh.label}` : `${third.label} ${fifth.label} ${seventh.label}`,
      symbol: `${triad ? triad.symbol : ''}(add${seventh.label})`,
      quality: 'other',
      alterations: [],
    };
  }

  // Fold an extension into the stacked symbol only while every extension below
  // it is the one the quality expects. A b9 on a minor 7 stops the fold, so the
  // chord reads "m7(b9)" and never the contradictory "m9(b9)".
  const natural = NATURAL_EXTENSIONS[base.quality] || {};
  const symbols = STACKED_SYMBOL[base.quality] || {};
  const names = STACKED_NAMES[base.quality] || {};
  const alterations = [];
  let symbolRoot = base.symbol;
  let nameRoot = base.name;
  let folding = true;

  for (const slot of [4, 5, 6]) {
    const tone = bySlot.get(slot);
    // A gap in the stack ends the fold. A #11 with no 9th below it must read
    // as "maj7(#11)" and never as "maj11".
    if (!tone) { folding = false; continue; }
    const stackedSymbol = symbols[slot + 1];
    if (folding && tone.label === natural[SLOT_DEGREE[slot]] && stackedSymbol) {
      symbolRoot = stackedSymbol;
      nameRoot = names[slot + 1] || nameRoot;
      continue;
    }
    folding = false;
    alterations.push(tone.label);
  }

  const suffix = alterations.length ? `(${alterations.join(',')})` : '';
  return {
    name: alterations.length ? `${nameRoot} ${suffix}` : nameRoot,
    symbol: `${symbolRoot}${suffix}`,
    quality: base.quality,
    alterations,
  };
}

// The pitch classes of a named scale on a named root, tonic first.
function scalePitchClasses(root, scale) {
  const parsed = parseNote(root);
  const def = SCALES[scale];
  if (!parsed || !def) return null;
  return def.map(([, semi]) => (parsed.semi + semi) % 12);
}

/**
 * Everything the tab needs to know about the notes of one key.
 * @param {string} root a root note such as "B" or "Eb"
 * @param {string} scale a scale name from SCALES
 * @returns {{root:string, scale:string, notes:string[], pcs:number[], size:number}|null}
 */
export function keyNotes(root, scale) {
  const pcs = scalePitchClasses(root, scale);
  if (!pcs) return null;
  const notes = getScaleNotes(root, scale) || pcs.map(pc => INTERVAL_LABELS[pc] || String(pc));
  return { root, scale, notes, pcs, size: pcs.length };
}

/** True when the scale has seven notes, so stacked thirds name real chords. */
export function isHeptatonic(scale) {
  const def = SCALES[scale];
  return !!def && def.length === 7;
}

/**
 * Stack thirds from one degree of a key.
 * @param {{notes:string[], pcs:number[]}} key the key from `keyNotes`
 * @param {number} degree the degree index, 0 for the tonic
 * @param {number} size how many tones to stack, 3 for a triad
 */
function stackFromDegree(key, degree, size) {
  const len = key.pcs.length;
  const rootPc = key.pcs[degree % len];
  const tones = [];
  for (let slot = 0; slot < size; slot++) {
    const at = (degree + 2 * slot) % len;
    const semi = ((key.pcs[at] - rootPc) % 12 + 12) % 12;
    tones.push({
      slot,
      at,
      note: key.notes[at],
      pc: key.pcs[at],
      semi,
      label: slotLabel(slot, semi),
    });
  }
  return tones;
}

// A roman numeral carries the quality: lower case for a minor third, a degree
// sign for a diminished fifth, and a plus for an augmented fifth.
function romanFor(numeral, tones) {
  const third = tones.find(t => t.slot === 1);
  const fifth = tones.find(t => t.slot === 2);
  let text = third && third.semi === 3 ? numeral.toLowerCase() : numeral;
  if (fifth && fifth.semi === 6) text += '°';
  else if (fifth && fifth.semi === 8) text += '+';
  return text;
}

/**
 * One chord of a key, with everything the user interface shows.
 * @param {{notes:string[], pcs:number[], root:string, scale:string}} key
 * @param {number} degree
 * @param {number} size
 */
export function chordAtDegree(key, degree, size) {
  const tones = stackFromDegree(key, degree, size);
  const described = describeStack(tones);
  const rootNote = tones[0].note;
  return {
    id: `deg${degree}-${size}`,
    degree,
    roman: romanFor(ROMAN[degree] || String(degree + 1), tones),
    root: rootNote,
    rootPc: tones[0].pc,
    tones,
    pcs: tones.map(t => t.pc),
    name: described.name,
    symbol: `${rootNote}${described.symbol}`,
    suffix: described.symbol,
    quality: described.quality,
    alterations: described.alterations,
    formula: tones.map(t => t.label),
    notes: tones.map(t => t.note),
    size,
    inKey: true,
  };
}

/**
 * Every chord of a key at one stack size.
 * @param {string} root
 * @param {string} scale
 * @param {number} [size] 3 for triads, 4 for 7th chords
 * @returns {Array} one chord per degree, or an empty list for a non-7-note scale
 */
export function keyChords(root, scale, size = 4) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];
  const stack = Math.max(2, Math.min(MAX_STACK, size));
  return key.pcs.map((_, degree) => chordAtDegree(key, degree, stack));
}

/**
 * The full stack of one degree, from the triad up to the 13th chord.
 * The chord detail panel reads this to show how far a chord can go.
 */
export function chordLadder(root, scale, degree) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];
  const out = [];
  for (let size = 3; size <= MAX_STACK; size++) {
    const chord = chordAtDegree(key, degree, size);
    // A stack that repeats a pitch class adds no new tone, so stop there.
    if (new Set(chord.pcs).size !== chord.pcs.length) break;
    out.push(chord);
  }
  return out;
}

/**
 * Compare the chord set of two scales on the same root.
 * The Theory tab uses this to show how Harmonic Minor changes the chords of
 * Natural Minor.
 * @returns {{rows:Array, changed:number}|null}
 */
export function compareKeys(root, scaleA, scaleB, size = 4) {
  const a = keyChords(root, scaleA, size);
  const b = keyChords(root, scaleB, size);
  if (!a.length || !b.length) return null;

  const rows = a.map((left, i) => {
    const right = b[i];
    const changedTones = left.tones.map((tone, k) => {
      const other = right.tones[k];
      return !other || other.pc !== tone.pc;
    });
    return {
      degree: i,
      left,
      right,
      changed: left.symbol !== right.symbol || changedTones.some(Boolean),
      changedTones,
    };
  });
  return { rows, changed: rows.filter(r => r.changed).length };
}

/**
 * Every chord of the key, at every stack size, grouped by quality.
 * This answers "where is a diminished 7 in this key?".
 * @param {string} root
 * @param {string} scale
 * @param {number[]} [sizes] the stack sizes to search
 * @returns {{quality:string, name:string, chords:Array}[]} sorted by name
 */
export function qualityIndex(root, scale, sizes = [3, 4, 5]) {
  const map = new Map();
  for (const size of sizes) {
    for (const chord of keyChords(root, scale, size)) {
      const entry = map.get(chord.quality) || { quality: chord.quality, name: chord.name, chords: [] };
      entry.chords.push(chord);
      map.set(chord.quality, entry);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A short, readable name for a scale, for headings and chips. */
export function scaleLabel(scale) {
  return shortScaleName(scale) || scale;
}
