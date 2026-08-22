/**
 * The interval model behind the Scale Reference Interval Map.
 *
 * This is not the Fretboard Interval Map under js/interval-map/, which trains
 * interval shapes for the workbooks. This module serves the Intervals tab of
 * the Scale Reference.
 *
 * The Fretboard tab answers "where is this scale?". The Interval Map answers
 * "where is this interval?". The player picks a reference note and one or more
 * intervals, and the neck shows every note at those distances above it.
 *
 * The map opens on the third and the fifth the key puts above the reference
 * note, because those two intervals build the chord on that note. The size
 * follows the note. In A natural minor the third above A is a minor third and
 * the third above C is a major third, and a fifth above B is diminished while
 * a fifth above every other degree is perfect. Each is the variant that key
 * holds there, so moving the reference note walks the player through them.
 *
 * A third is two letter names apart and a fifth is four, whatever the scale.
 * Counting scale degrees instead would break: two degrees up from A in A minor
 * pentatonic is D, which is a fourth, not a third. Each entry of a SCALES
 * definition already carries its letter offset, so this module counts letters.
 */

/** Letter names to count for each named interval. A third spans two. */
export const THIRD_LETTERS = 2;
export const FIFTH_LETTERS = 4;

/** Letter names in an octave. */
const LETTERS = 7;

/** Short name of each interval, keyed by semitones above the reference note. */
export const INTERVAL_DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/**
 * Every size of one interval the scale contains.
 *
 * Walks each degree, looks for the degrees `letterStep` letter names above it,
 * and measures the distance in semitones. A scale can hold several sizes: a
 * major scale holds a minor third and a major third.
 *
 * @param {[number, number][]} def a SCALES entry: [letterOffset, semitones]
 * @param {number} letterStep letter names to count up
 * @returns {number[]} the sizes in semitones, low to high, without repeats
 */
export function intervalVariants(def, letterStep) {
  if (!Array.isArray(def) || def.length < 2) return [];
  const sizes = new Set();
  def.forEach(([letter, semi]) => {
    const wantLetter = (letter + letterStep) % LETTERS;
    def.forEach(([otherLetter, otherSemi]) => {
      if (otherLetter % LETTERS !== wantLetter) return;
      // The partner sits above the note, so lift it an octave when it wrapped.
      let size = otherSemi - semi;
      while (size <= 0) size += 12;
      if (size < 12) sizes.add(size);
    });
  });
  return [...sizes].sort((a, b) => a - b);
}

/** Sizes of third the scale contains, in semitones. */
export function thirdVariants(def) {
  return intervalVariants(def, THIRD_LETTERS);
}

/** Sizes of fifth the scale contains, in semitones. */
export function fifthVariants(def) {
  return intervalVariants(def, FIFTH_LETTERS);
}

/**
 * The scale entries that sit `letterStep` letter names above a note.
 *
 * @param {[number, number][]} def a SCALES entry
 * @param {number} rootSemi semitone class (0-11) of the scale root
 * @param {number} fromSemi semitone class (0-11) of the note to measure from
 * @param {number} letterStep letter names to count up
 * @returns {number[]} the distances in semitones above `fromSemi`
 */
export function intervalsAbove(def, rootSemi, fromSemi, letterStep) {
  if (!Array.isArray(def) || !def.length) return [];
  const pc = value => (((value % 12) + 12) % 12);
  const from = def.filter(([, semi]) => pc(rootSemi + semi) === pc(fromSemi));
  if (!from.length) return [];
  const sizes = new Set();
  from.forEach(([letter, semi]) => {
    const wantLetter = (letter + letterStep) % LETTERS;
    def.forEach(([otherLetter, otherSemi]) => {
      if (otherLetter % LETTERS !== wantLetter) return;
      let size = otherSemi - semi;
      while (size <= 0) size += 12;
      if (size < 12) sizes.add(size);
    });
  });
  return [...sizes].sort((a, b) => a - b);
}

/**
 * The intervals the map opens on: the third and the fifth the key puts above
 * the reference note.
 *
 * The size follows the note. In A natural minor the third above A is a minor
 * third and the third above C is a major third, and both belong to the key.
 * That is the variant the player came to see, so the default follows the
 * reference note rather than fixing one size.
 *
 * A reference note outside the key has no third or fifth in the key, so the
 * map then falls back to every size of third and fifth the scale contains.
 *
 * @param {[number, number][]} def a SCALES entry
 * @param {number} rootSemi semitone class (0-11) of the scale root
 * @param {number} refSemi semitone class (0-11) of the reference note
 * @returns {number[]} semitones above the reference note, low to high
 */
export function defaultMapIntervals(def, rootSemi = 0, refSemi = rootSemi) {
  const picked = new Set([
    ...intervalsAbove(def, rootSemi, refSemi, THIRD_LETTERS),
    ...intervalsAbove(def, rootSemi, refSemi, FIFTH_LETTERS),
  ]);
  if (picked.size) return [...picked].sort((a, b) => a - b);

  // Off the key, or a scale too small to stack thirds: show what it does hold.
  const fallback = new Set([...thirdVariants(def), ...fifthVariants(def)]);
  if (!fallback.size) {
    (def || []).forEach(([, semi]) => {
      const wrapped = ((semi % 12) + 12) % 12;
      if (wrapped) fallback.add(wrapped);
    });
  }
  return [...fallback].sort((a, b) => a - b);
}

/**
 * Keeps a chosen set of intervals inside 1 to 11 and in order.
 * The reference note is always on the map, so 0 never joins the set.
 */
export function normaliseIntervals(list) {
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach(value => {
    const semi = Number(value);
    if (!Number.isInteger(semi)) return;
    const wrapped = ((semi % 12) + 12) % 12;
    if (wrapped > 0) out.add(wrapped);
  });
  return [...out].sort((a, b) => a - b);
}

/**
 * One row per interval for the picker: what it is, and how the key uses it
 * above the reference note.
 *
 * @param {[number, number][]} def a SCALES entry
 * @param {number} rootSemi semitone class (0-11) of the scale root
 * @param {number} refSemi semitone class (0-11) of the reference note
 * @param {number[]} selected semitones the player picked
 * @returns {{semi:number, label:string, inKey:boolean, role:string|null,
 *   selected:boolean}[]} the eleven intervals above the reference, low to high
 */
export function intervalPickerRows(def, rootSemi, refSemi, selected) {
  const pc = value => (((value % 12) + 12) % 12);
  const keySemis = new Set((def || []).map(([, semi]) => pc(rootSemi + semi)));
  const inKey = new Set([...keySemis].map(semi => pc(semi - refSemi)));
  const thirds = new Set(intervalsAbove(def, rootSemi, refSemi, THIRD_LETTERS));
  const fifths = new Set(intervalsAbove(def, rootSemi, refSemi, FIFTH_LETTERS));
  const chosen = new Set(normaliseIntervals(selected));

  const rows = [];
  for (let semi = 1; semi < 12; semi++) {
    let role = null;
    if (thirds.has(semi) && fifths.has(semi)) role = '3rd · 5th';
    else if (thirds.has(semi)) role = '3rd';
    else if (fifths.has(semi)) role = '5th';
    rows.push({
      semi,
      label: INTERVAL_DEGREE_LABELS[semi],
      inKey: inKey.has(semi),
      role,
      selected: chosen.has(semi),
    });
  }
  return rows;
}
