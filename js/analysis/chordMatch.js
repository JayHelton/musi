// Multi-answer chord identification for a set of selected notes.
//
// `chordDetect.js` answers one question: "what is the single best name for
// this set of pitch classes?" This module answers a different one: "what are
// all the names that are true?" A set of pitch classes almost never has one
// correct name. C E G A is both C6 and Am7. C Eb Gb A is a diminished 7th on
// any of its four notes. A voicing whose bass is not the root is a slash
// chord. The Chord Finder shows every reading, ranked, instead of picking one
// and hiding the rest.
//
// The rules the ranking follows:
//   1. A candidate must contain every selected pitch class. No name is
//      reported that leaves a selected note out.
//   2. The root must be one of the selected pitch classes. Rootless voicings
//      are real in jazz, but they are guesses, so this module does not make
//      them.
//   3. A chord tone may be missing only when the quality marks it optional.
//      The perfect 5th is optional on nearly every chord. Nothing else is.
//   4. Common qualities beat rare ones, complete voicings beat incomplete
//      ones, and a root in the bass beats an inversion.
//
// Spelling follows the chord, not a fixed sharp/flat table. A#dim spells as
// A# C# E; Bbdim would need F flat, so A# wins. B major spells as B D# F#;
// Cb major would need three flats, so B wins.

import { parseNote, spellNote, INTERVAL_LABELS } from '../theory.js';

/** Diatonic letter step for each scale-degree label, used for spelling. */
const R = 0, SECOND = 1, THIRD = 2, FOURTH = 3, FIFTH = 4, SIXTH = 5, SEVENTH = 6;

/**
 * @typedef {object} ChordQuality
 * @property {string} id stable identifier
 * @property {string} sym symbol appended to the root (e.g. 'm7b5')
 * @property {string} name spoken name (e.g. 'Half-diminished 7th')
 * @property {[number, number, string][]} tones [letterStep, semitones, degree]
 * @property {number} rarity 0 = everyday, 8 = very rare
 * @property {number[]} [omit] semitone degrees a player may leave out
 */

/**
 * Every chord quality the finder can name, from two-note dyads up to
 * thirteenths. `tones` uses the same [letterStep, semitones, label] shape as
 * `CHORDS` in js/chords.js so the spelling helper can stay shared.
 * @type {ChordQuality[]}
 */
export const CHORD_QUALITIES = [
  // --- Dyads. Two notes name an interval, not a chord, but a fifth is a
  // --- power chord and players do read the others as chord fragments.
  { id: 'dyad-5', sym: '5', name: 'Power chord', dyad: true, rarity: 0,
    tones: [[R, 0, 'R'], [FIFTH, 7, '5']] },
  { id: 'dyad-4', sym: '(4)', name: 'Fourth dyad', dyad: true, rarity: 3,
    tones: [[R, 0, 'R'], [FOURTH, 5, '4']] },
  { id: 'dyad-3', sym: '(3)', name: 'Major third dyad', dyad: true, rarity: 2,
    tones: [[R, 0, 'R'], [THIRD, 4, '3']] },
  { id: 'dyad-b3', sym: '(b3)', name: 'Minor third dyad', dyad: true, rarity: 2,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3']] },
  { id: 'dyad-6', sym: '(6)', name: 'Major sixth dyad', dyad: true, rarity: 4,
    tones: [[R, 0, 'R'], [SIXTH, 9, '6']] },
  { id: 'dyad-b6', sym: '(b6)', name: 'Minor sixth dyad', dyad: true, rarity: 4,
    tones: [[R, 0, 'R'], [SIXTH, 8, 'b6']] },
  { id: 'dyad-b5', sym: '(b5)', name: 'Tritone', dyad: true, rarity: 3,
    tones: [[R, 0, 'R'], [FIFTH, 6, 'b5']] },
  { id: 'dyad-b7', sym: '(b7)', name: 'Minor seventh dyad', dyad: true, rarity: 4,
    tones: [[R, 0, 'R'], [SEVENTH, 10, 'b7']] },
  { id: 'dyad-7', sym: '(7)', name: 'Major seventh dyad', dyad: true, rarity: 4,
    tones: [[R, 0, 'R'], [SEVENTH, 11, '7']] },
  { id: 'dyad-2', sym: '(2)', name: 'Major second dyad', dyad: true, rarity: 4,
    tones: [[R, 0, 'R'], [SECOND, 2, '2']] },
  { id: 'dyad-b2', sym: '(b2)', name: 'Minor second dyad', dyad: true, rarity: 5,
    tones: [[R, 0, 'R'], [SECOND, 1, 'b2']] },

  // --- Triads.
  { id: 'maj', sym: '', name: 'Major', rarity: 0,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 7, '5']] },
  { id: 'min', sym: 'm', name: 'Minor', rarity: 0,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 7, '5']] },
  { id: 'dim', sym: 'dim', name: 'Diminished', rarity: 1,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 6, 'b5']] },
  { id: 'aug', sym: 'aug', name: 'Augmented', rarity: 2,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 8, '#5']] },
  { id: 'sus4', sym: 'sus4', name: 'Suspended 4th', rarity: 1,
    tones: [[R, 0, 'R'], [FOURTH, 5, '4'], [FIFTH, 7, '5']] },
  { id: 'sus2', sym: 'sus2', name: 'Suspended 2nd', rarity: 1,
    tones: [[R, 0, 'R'], [SECOND, 2, '2'], [FIFTH, 7, '5']] },
  { id: 'majb5', sym: '(b5)', name: 'Major flat 5', rarity: 6,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 6, 'b5']] },
  { id: 'minS5', sym: 'm#5', name: 'Minor sharp 5', rarity: 7,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 8, '#5']] },

  // --- Sevenths and sixths.
  { id: 'maj7', sym: 'maj7', name: 'Major 7th', rarity: 0, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'dom7', sym: '7', name: 'Dominant 7th', rarity: 0, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'min7', sym: 'm7', name: 'Minor 7th', rarity: 0, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'minmaj7', sym: 'mMaj7', name: 'Minor major 7th', rarity: 4, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'min7b5', sym: 'm7b5', name: 'Half-diminished 7th', rarity: 2,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 6, 'b5'], [SEVENTH, 10, 'b7']] },
  { id: 'dim7', sym: 'dim7', name: 'Diminished 7th', rarity: 2,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 6, 'b5'], [SEVENTH, 9, 'bb7']] },
  { id: 'maj7S5', sym: 'maj7#5', name: 'Major 7th sharp 5', rarity: 5,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 8, '#5'], [SEVENTH, 11, '7']] },
  { id: 'dom7S5', sym: '7#5', name: 'Dominant 7th sharp 5', rarity: 3,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 8, '#5'], [SEVENTH, 10, 'b7']] },
  { id: 'dom7b5', sym: '7b5', name: 'Dominant 7th flat 5', rarity: 3,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 6, 'b5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj7b5', sym: 'maj7b5', name: 'Major 7th flat 5', rarity: 6,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 6, 'b5'], [SEVENTH, 11, '7']] },
  { id: 'min7S5', sym: 'm7#5', name: 'Minor 7th sharp 5', rarity: 7,
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 8, '#5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj6', sym: '6', name: 'Major 6th', rarity: 1, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SIXTH, 9, '6']] },
  { id: 'min6', sym: 'm6', name: 'Minor 6th', rarity: 2, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SIXTH, 9, '6']] },
  { id: 'add9', sym: 'add9', name: 'Added 9th', rarity: 1, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5']] },
  { id: 'madd9', sym: 'm(add9)', name: 'Minor added 9th', rarity: 2, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 7, '5']] },
  { id: 'add11', sym: 'add11', name: 'Added 11th', rarity: 4, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FOURTH, 17, '11'], [FIFTH, 7, '5']] },
  { id: 'madd11', sym: 'm(add11)', name: 'Minor added 11th', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [THIRD, 3, 'b3'], [FOURTH, 17, '11'], [FIFTH, 7, '5']] },
  { id: 'dom7sus4', sym: '7sus4', name: 'Dominant 7th suspended 4th', rarity: 2, omit: [7],
    tones: [[R, 0, 'R'], [FOURTH, 5, '4'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'dom7sus2', sym: '7sus2', name: 'Dominant 7th suspended 2nd', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 2, '2'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj7sus4', sym: 'maj7sus4', name: 'Major 7th suspended 4th', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [FOURTH, 5, '4'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },

  // --- Ninths.
  { id: 'dom9', sym: '9', name: 'Dominant 9th', rarity: 1, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj9', sym: 'maj9', name: 'Major 9th', rarity: 1, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'min9', sym: 'm9', name: 'Minor 9th', rarity: 1, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'minmaj9', sym: 'mMaj9', name: 'Minor major 9th', rarity: 6, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'dom7b9', sym: '7b9', name: 'Dominant 7th flat 9', rarity: 3, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 13, 'b9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'dom7S9', sym: '7#9', name: 'Dominant 7th sharp 9', rarity: 3, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 15, '#9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'dom9b5', sym: '9b5', name: 'Dominant 9th flat 5', rarity: 6,
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 6, 'b5'], [SEVENTH, 10, 'b7']] },
  { id: 'dom9S5', sym: '9#5', name: 'Dominant 9th sharp 5', rarity: 6,
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 8, '#5'], [SEVENTH, 10, 'b7']] },
  { id: 'min9b5', sym: 'm9b5', name: 'Minor 9th flat 5', rarity: 6,
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 6, 'b5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj69', sym: '6/9', name: 'Major 6th add 9', rarity: 3, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SIXTH, 9, '6']] },
  { id: 'min69', sym: 'm6/9', name: 'Minor 6th add 9', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SIXTH, 9, '6']] },
  { id: 'dom7S11', sym: '7#11', name: 'Dominant 7th sharp 11', rarity: 5,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FOURTH, 18, '#11'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj7S11', sym: 'maj7#11', name: 'Major 7th sharp 11', rarity: 5,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FOURTH, 18, '#11'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'dom7b13', sym: '7b13', name: 'Dominant 7th flat 13', rarity: 6,
    tones: [[R, 0, 'R'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SIXTH, 20, 'b13'], [SEVENTH, 10, 'b7']] },

  // --- Elevenths and thirteenths. An 11th chord drops the 3rd and a 13th
  // --- chord drops the 11th, which is how players actually voice them.
  { id: 'dom11', sym: '11', name: 'Dominant 11th', rarity: 4, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'min11', sym: 'm11', name: 'Minor 11th', rarity: 3, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SEVENTH, 10, 'b7']] },
  { id: 'maj11', sym: 'maj11', name: 'Major 11th', rarity: 6, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SEVENTH, 11, '7']] },
  { id: 'dom13', sym: '13', name: 'Dominant 13th', rarity: 3, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 10, 'b7']] },
  { id: 'maj13', sym: 'maj13', name: 'Major 13th', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 11, '7']] },
  { id: 'min13', sym: 'm13', name: 'Minor 13th', rarity: 5, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 10, 'b7']] },

  // --- Complete seven-note stacks. A player rarely voices one, but a full
  // --- diatonic selection on the neck is still one of these by name.
  { id: 'dom13full', sym: '13', name: 'Dominant 13th (full stack)', rarity: 7, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 10, 'b7']] },
  { id: 'maj13full', sym: 'maj13', name: 'Major 13th (full stack)', rarity: 7, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 11, '7']] },
  { id: 'min13full', sym: 'm13', name: 'Minor 13th (full stack)', rarity: 7, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 3, 'b3'], [FOURTH, 17, '11'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 10, 'b7']] },
  { id: 'dom13S11', sym: '13#11', name: 'Dominant 13th sharp 11', rarity: 7, omit: [7],
    tones: [[R, 0, 'R'], [SECOND, 14, '9'], [THIRD, 4, '3'], [FOURTH, 18, '#11'], [FIFTH, 7, '5'], [SIXTH, 21, '13'], [SEVENTH, 10, 'b7']] },
];

/** Enharmonic root names to try, in preference order, for each pitch class. */
// A chord symbol never has B#, Cb, E# or Fb as its root, so those spellings
// are not offered. Where two spellings are usual, the first one wins a tie.
const ROOT_SPELLINGS = [
  ['C'], ['Db', 'C#'], ['D'], ['Eb', 'D#'], ['E'], ['F'],
  ['F#', 'Gb'], ['G'], ['Ab', 'G#'], ['A'], ['Bb', 'A#'], ['B'],
];

// Where each scale-degree label sits in a stack of thirds. The rank, not the
// pitch class, decides the inversion: the 3rd of a chord is rank 2 whether it
// is major, minor, or replaced by a suspended 2nd or 4th.
const DEGREE_RANK = {
  R: 0,
  b2: 1, 2: 1, b9: 1, 9: 1, '#9': 1,
  b3: 2, 3: 2,
  4: 3, 11: 3, '#11': 3,
  b5: 4, 5: 4, '#5': 4,
  b6: 5, 6: 5, 13: 5, b13: 5,
  bb7: 6, b7: 6, 7: 6,
};

/** Inversion name for a bass note that sits on a given stack rank. */
const INVERSION_NAMES = { 2: '1st inversion', 4: '2nd inversion', 6: '3rd inversion' };

function mod12(n) {
  return ((n % 12) + 12) % 12;
}

/** Sorted, de-duplicated semitone classes of a quality, relative to its root. */
function qualityPcs(quality) {
  return [...new Set(quality.tones.map(([, semis]) => mod12(semis)))].sort((a, b) => a - b);
}

/** How awkward a spelling is: double accidentals cost far more than single. */
function spellingCost(names) {
  let cost = 0;
  for (const name of names) {
    const acc = name.slice(1);
    if (acc === '##' || acc === 'bb') cost += 10;
    else if (acc) cost += 1;
  }
  return cost;
}

/**
 * Spell a quality on a pitch class, choosing the enharmonic root that needs
 * the fewest accidentals. Returns null when no spelling is possible.
 * @param {number} rootPc 0..11
 * @param {ChordQuality} quality
 * @param {number[]} [omitted] semitone degrees left out of the voicing
 */
export function spellQuality(rootPc, quality, omitted = []) {
  const dropped = new Set(omitted.map(mod12));
  let best = null;
  for (const rootName of ROOT_SPELLINGS[mod12(rootPc)]) {
    const rp = parseNote(rootName);
    if (!rp) continue;
    const tones = [];
    let ok = true;
    for (const [letterStep, semis, degree] of quality.tones) {
      const pc = mod12(rp.semi + semis);
      const spelled = spellNote(rp.li, rp.semi, letterStep, mod12(semis));
      if (!spelled) { ok = false; break; }
      tones.push({ note: spelled, degree, pc, semis, omitted: dropped.has(mod12(semis)) });
    }
    if (!ok) continue;
    const cost = spellingCost(tones.filter(t => !t.omitted).map(t => t.note));
    if (!best || cost < best.cost) best = { root: rootName, tones, cost };
  }
  return best;
}

/** Every way to drop `count` entries from `list`. */
function combinations(list, count) {
  if (count === 0) return [[]];
  const out = [];
  for (let i = 0; i <= list.length - count; i++) {
    for (const rest of combinations(list.slice(i + 1), count - 1)) {
      out.push([list[i], ...rest]);
    }
  }
  return out;
}

/** True when both sorted number arrays hold the same values. */
function sameSet(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Which chord tone the bass note is, and the inversion name that goes with it.
 * @param {number} bassPc pitch class of the lowest sounding note
 * @param {{note:string, degree:string, pc:number}[]} tones spelled chord tones
 */
function describeBass(bassPc, tones) {
  const tone = tones.find(t => t.pc === bassPc);
  if (!tone) return { rank: 7, tone: null, inversion: 'slash voicing' };
  const rank = DEGREE_RANK[tone.degree] ?? 7;
  if (rank === 0) return { rank, tone, inversion: null };
  return {
    rank,
    tone,
    inversion: INVERSION_NAMES[rank] || `${tone.degree} in the bass`,
  };
}

/**
 * Rank one candidate. Higher is a better reading of the same notes.
 * Complete voicings beat incomplete ones, everyday qualities beat rare ones,
 * and a root in the bass beats an inversion.
 */
function scoreCandidate({ quality, omitted, bass }) {
  let score = 100;
  score -= omitted.length * 16;
  score -= quality.rarity * 6;
  if (bass.rank === 0) score += 10;
  else score -= 5 + bass.rank * 2;
  if (quality.dyad) score -= 4;
  return score;
}

/**
 * Every true name for a set of notes, best first.
 *
 * @param {number[]} midis sounding MIDI numbers. The lowest one is the bass.
 * @param {{ maxResults?: number, minScore?: number }} [options]
 * @returns {{
 *   pitchClasses: number[],
 *   bassPc: number|null,
 *   interval: { semitones: number, label: string }|null,
 *   matches: object[],
 * }}
 */
export function matchChords(midis, { maxResults = 12, minScore = 0 } = {}) {
  const sorted = [...midis].filter(Number.isFinite).sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map(mod12))].sort((a, b) => a - b);
  const bassPc = sorted.length ? mod12(sorted[0]) : null;

  const result = {
    pitchClasses: pcs,
    bassPc,
    interval: null,
    matches: [],
  };
  if (pcs.length < 2) return result;

  if (pcs.length === 2) {
    // Measured up from the bass, so C under G is a 5th and G under C is a 4th.
    const upper = pcs.find(pc => pc !== bassPc);
    const semis = mod12(upper - bassPc);
    result.interval = { semitones: semis, label: INTERVAL_LABELS[semis] || `${semis} semitones` };
  }

  const matches = [];
  for (const rootPc of pcs) {
    const played = pcs.map(pc => mod12(pc - rootPc)).sort((a, b) => a - b);
    for (const quality of CHORD_QUALITIES) {
      const full = qualityPcs(quality);
      // A quality can never be smaller than the notes it has to account for.
      if (full.length < played.length) continue;

      // Only a quality that marks a tone optional may lose one, and it may
      // lose exactly one. Beyond that a name stops describing the notes.
      const omittable = (quality.omit && full.length >= 4) ? quality.omit : [];
      const missing = full.length - played.length;
      if (missing > 1 || missing > omittable.length) continue;

      for (const omitted of combinations(omittable, missing)) {
        const dropped = new Set(omitted.map(mod12));
        const reduced = full.filter(pc => !dropped.has(pc));
        if (!sameSet(reduced, played)) continue;

        const spelled = spellQuality(rootPc, quality, omitted);
        if (!spelled) continue;
        const bass = describeBass(bassPc, spelled.tones);
        const symbol = `${spelled.root}${quality.sym}`;
        const bassName = bass.rank === 0
          ? null
          : (bass.tone ? bass.tone.note : ROOT_SPELLINGS[bassPc][0]);
        matches.push({
          id: `${rootPc}-${quality.id}-${omitted.join('.')}`,
          qualityId: quality.id,
          rootPc,
          root: spelled.root,
          name: quality.name,
          sym: quality.sym,
          symbol,
          label: bassName ? `${symbol}/${bassName}` : symbol,
          bassNote: bassName,
          inversion: bass.inversion,
          dyad: !!quality.dyad,
          tones: spelled.tones,
          notes: spelled.tones.filter(t => !t.omitted).map(t => t.note),
          omitted: spelled.tones.filter(t => t.omitted).map(t => t.degree),
          exact: omitted.length === 0,
          rarity: quality.rarity,
          score: scoreCandidate({ quality, omitted, bass }),
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score
    || a.rarity - b.rarity
    || a.label.localeCompare(b.label));

  const best = matches.length ? matches[0].score : 0;
  result.matches = matches
    .filter(m => m.score >= minScore)
    .slice(0, maxResults)
    .map(m => ({ ...m, confidence: best > 0 ? Math.round((m.score / best) * 100) : 0 }));
  return result;
}

/**
 * A one-line reason the reading is not exact, or an empty string when it is.
 * @param {object} match one entry from `matchChords`
 */
export function matchCaveat(match) {
  const parts = [];
  if (match.omitted.length) parts.push(`no ${match.omitted.join(', no ')}`);
  if (match.inversion) parts.push(match.inversion);
  return parts.join(' · ');
}
