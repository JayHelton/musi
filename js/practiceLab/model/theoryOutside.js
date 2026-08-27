// The ways out of a key.
//
// A mode gives seven chords. Most music leaves that set at some point, so this
// module builds the moves that leave it and says which note does the leaving:
//
//   * Modal interchange — a chord borrowed from a parallel mode on the same
//     root, such as the iv of A minor inside A major.
//   * Secondary dominants — the V7 of a chord that is not the tonic.
//   * Tritone substitutes — the dominant a tritone away from that V7.
//   * Leading-tone diminished 7ths — the dim7 a semitone under the target.
//   * Alterations — one tone of a chord you already have moves out of the key.
//
// Every result names its outside notes, so the neck can light them up.
//
// The module is pure. It reads no DOM and keeps no state.

import { parseNote, spellNote, NOTE_NAMES_SHARP, SCALES } from '../adapters/musiTheory.js';
import { buildChord, keyChords, keyNotes, scaleLabel } from './theoryChords.js';

/** The parallel modes the borrow list searches, in the order it shows them. */
export const BORROW_SOURCES = [
  'Major (Ionian)',
  'Natural Minor (Aeolian)',
  'Harmonic Minor',
  'Melodic Minor (Asc)',
  'Dorian',
  'Phrygian',
  'Lydian',
  'Mixolydian',
  'Phrygian Dominant',
  'Lydian Dominant',
  'Hungarian Minor',
  'Double Harmonic Major',
];

const DOMINANT_7 = [
  { slot: 0, semi: 0 }, { slot: 1, semi: 4 }, { slot: 2, semi: 7 }, { slot: 3, semi: 10 },
];
const DIMINISHED_7 = [
  { slot: 0, semi: 0 }, { slot: 1, semi: 3 }, { slot: 2, semi: 6 }, { slot: 3, semi: 9 },
];

function noteForPc(pc) {
  return NOTE_NAMES_SHARP[((pc % 12) + 12) % 12];
}

/** The tones of a chord that the key does not hold. */
export function outsideTones(chord, keyPcs) {
  const inside = new Set(keyPcs);
  return chord.tones.filter(tone => !inside.has(tone.pc));
}

function withOutside(chord, keyPcs, extra = {}) {
  if (!chord) return null;
  const outside = outsideTones(chord, keyPcs);
  return {
    ...chord,
    ...extra,
    outside,
    outsideNotes: outside.map(t => t.note),
    outsidePcs: outside.map(t => t.pc),
    inKey: outside.length === 0,
  };
}

/**
 * Chords borrowed from the parallel modes of the same root.
 * @param {string} root
 * @param {string} scale the mode the player is in
 * @param {{size?:number, sources?:string[]}} [options]
 * @returns {{source:string, label:string, chords:Array}[]}
 */
export function borrowedChords(root, scale, { size = 4, sources = BORROW_SOURCES } = {}) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];
  const keyPcs = key.pcs;
  const seen = new Set(keyChords(root, scale, size).map(c => c.pcs.slice().sort((a, b) => a - b).join('.')));

  const groups = [];
  for (const source of sources) {
    if (source === scale || !SCALES[source]) continue;
    const chords = [];
    for (const chord of keyChords(root, source, size)) {
      const signature = chord.pcs.slice().sort((a, b) => a - b).join('.');
      if (seen.has(signature)) continue;
      seen.add(signature);
      const entry = withOutside(chord, keyPcs, {
        from: source,
        fromLabel: scaleLabel(source),
        why: `Degree ${chord.roman} of ${root} ${scaleLabel(source)}.`,
      });
      if (entry.outside.length) chords.push(entry);
    }
    if (chords.length) groups.push({ source, label: `${root} ${scaleLabel(source)}`, chords });
  }
  return groups;
}

// The note a fifth above `note`, spelled with the right letter.
function fifthAbove(note) {
  const parsed = parseNote(note);
  if (!parsed) return null;
  return spellNote(parsed.li, parsed.semi, 4, 7);
}

// The note a semitone above `note`, spelled with the next letter up.
function semitoneAbove(note) {
  const parsed = parseNote(note);
  if (!parsed) return null;
  return spellNote(parsed.li, parsed.semi, 1, 1);
}

// The note a semitone under `note`, spelled as its leading tone.
function leadingToneUnder(note) {
  const parsed = parseNote(note);
  if (!parsed) return null;
  return spellNote(parsed.li, parsed.semi, 6, 11);
}

/**
 * The dominant of every chord of the key that can take one.
 * @returns {Array} one chord per usable target
 */
export function secondaryDominants(root, scale, { size = 4 } = {}) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];
  const targets = keyChords(root, scale, size);

  const out = [];
  for (const target of targets) {
    // A diminished or an augmented chord is not a stable place to land, so it
    // gets no dominant of its own.
    if (target.quality.startsWith('dim') || target.quality.startsWith('halfdim')) continue;
    if (target.quality.startsWith('aug')) continue;
    const dominantRoot = fifthAbove(target.root) || noteForPc((target.rootPc + 7) % 12);
    const chord = buildChord(dominantRoot, DOMINANT_7);
    const entry = withOutside(chord, key.pcs, {
      role: `V7/${target.roman}`,
      target: target.symbol,
      why: `The dominant 7 a fifth above ${target.root}. It pulls hard into ${target.symbol}.`,
    });
    // The dominant of the tonic is already the V of a major key, so it is not
    // a way out of anything. Drop any secondary dominant the key holds.
    if (entry.inKey) continue;
    out.push(entry);
  }
  return out;
}

/**
 * The tritone substitute of every secondary dominant.
 * The substitute sits a semitone above the target and shares its guide tones.
 */
export function tritoneSubs(root, scale, { size = 4 } = {}) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];

  const out = [];
  for (const target of keyChords(root, scale, size)) {
    if (target.quality.startsWith('dim') || target.quality.startsWith('halfdim')) continue;
    if (target.quality.startsWith('aug')) continue;
    const subRoot = semitoneAbove(target.root) || noteForPc((target.rootPc + 1) % 12);
    const chord = buildChord(subRoot, DOMINANT_7);
    out.push(withOutside(chord, key.pcs, {
      role: `subV7/${target.roman}`,
      target: target.symbol,
      why: `Stands in for the dominant of ${target.root}. The bass falls one semitone into ${target.symbol}.`,
    }));
  }
  return out;
}

/**
 * The diminished 7 a semitone under every chord of the key.
 * It shares three tones with the secondary dominant and leads the same way.
 */
export function leadingToneDiminished(root, scale, { size = 4 } = {}) {
  const key = keyNotes(root, scale);
  if (!key || key.size !== 7) return [];

  const out = [];
  for (const target of keyChords(root, scale, size)) {
    if (target.quality.startsWith('dim') || target.quality.startsWith('halfdim')) continue;
    const chordRoot = leadingToneUnder(target.root) || noteForPc((target.rootPc + 11) % 12);
    const chord = buildChord(chordRoot, DIMINISHED_7);
    out.push(withOutside(chord, key.pcs, {
      role: `vii°7/${target.roman}`,
      target: target.symbol,
      why: `Sits one semitone under ${target.root} and every tone wants to move into ${target.symbol}.`,
    }));
  }
  return out;
}

// One way to bend a chord you already hold. `apply` returns the new slot map,
// or null when the move does not fit the chord.
const ALTERATION_MOVES = [
  {
    id: 'aug5',
    label: 'Raise the 5th',
    hint: 'The augmented fifth lifts the chord and refuses to settle.',
    apply: (map) => (map.get(2) === 7 ? patch(map, 2, 8) : null),
  },
  {
    id: 'flat5',
    label: 'Lower the 5th',
    hint: 'The flat fifth hollows the chord out and adds a tritone.',
    apply: (map) => (map.get(2) === 7 ? patch(map, 2, 6) : null),
  },
  {
    id: 'major3',
    label: 'Raise the 3rd',
    hint: 'A minor chord turns major. This is how a picardy third works.',
    apply: (map) => (map.get(1) === 3 ? patch(map, 1, 4) : null),
  },
  {
    id: 'minor3',
    label: 'Lower the 3rd',
    hint: 'A major chord turns minor. The classic borrowed iv comes from here.',
    apply: (map) => (map.get(1) === 4 ? patch(map, 1, 3) : null),
  },
  {
    id: 'dominant',
    label: 'Make it a dominant 7',
    hint: 'A major third with a flat seventh. Any chord can push to the chord a fourth above it.',
    apply: (map) => patch(patch(map, 1, 4), 3, 10),
  },
  {
    id: 'major7',
    label: 'Raise the 7th',
    hint: 'A flat seventh becomes a major seventh and the chord stops pulling.',
    apply: (map) => (map.get(3) === 10 ? patch(map, 3, 11) : null),
  },
  {
    id: 'sixth',
    label: 'Use a 6th instead of a 7th',
    hint: 'The 6th keeps the colour and drops the tension.',
    apply: (map) => patch(map, 3, 9),
    label6: true,
  },
  {
    id: 'sus4',
    label: 'Suspend to the 4th',
    hint: 'The third steps up and the chord is neither major nor minor.',
    apply: (map) => (map.has(1) && map.get(1) !== 5 ? patch(map, 1, 5) : null),
  },
  {
    id: 'sus2',
    label: 'Suspend to the 2nd',
    hint: 'The third steps down and the chord opens out.',
    apply: (map) => (map.has(1) && map.get(1) !== 2 ? patch(map, 1, 2) : null),
  },
  {
    id: 'b9',
    label: 'Add a b9',
    hint: 'A semitone over the root. Dark, and at home on a dominant.',
    apply: (map) => patch(map, 4, 1),
  },
  {
    id: 'sharp9',
    label: 'Add a #9',
    hint: 'A minor third stacked over a major third. The Hendrix colour.',
    apply: (map) => (map.get(1) === 4 ? patch(map, 4, 3) : null),
  },
  {
    id: 'sharp11',
    label: 'Add a #11',
    hint: 'The Lydian tone. It floats over a major or a dominant chord.',
    apply: (map) => patch(map, 5, 6),
  },
  {
    id: 'flat13',
    label: 'Add a b13',
    hint: 'The dark top note of an altered dominant.',
    apply: (map) => patch(map, 6, 8),
  },
  {
    id: 'dim7',
    label: 'Diminish the whole chord',
    hint: 'Minor third, flat fifth, and a double flat seventh. Every tone is a semitone from somewhere.',
    apply: () => new Map([[0, 0], [1, 3], [2, 6], [3, 9]]),
  },
];

function patch(map, slot, semi) {
  const next = new Map(map);
  next.set(slot, semi);
  return next;
}

/**
 * Every way to bend one chord, with the notes each move takes outside the key.
 * @param {Object} chord a chord from `keyChords` or `buildChord`
 * @param {number[]} keyPcs the pitch classes of the current key
 */
export function alterationsFor(chord, keyPcs) {
  if (!chord) return [];
  const map = new Map(chord.tones.map(t => [t.slot, t.semi]));
  const original = chord.pcs.slice().sort((a, b) => a - b).join('.');

  // Two moves can land on the same chord. Raising the third of a minor 7 and
  // making it a dominant both give the same four notes, so the list keeps the
  // first of them and drops the repeat.
  const seen = new Set([original]);

  const out = [];
  for (const move of ALTERATION_MOVES) {
    const next = move.apply(map);
    if (!next) continue;
    const intervals = [...next.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, semi]) => {
        if (slot === 3 && semi === 9 && move.label6) return { slot, semi, label: '6', letterOffset: 5 };
        return { slot, semi };
      });
    const built = buildChord(chord.root, intervals);
    if (!built) continue;
    const signature = built.pcs.slice().sort((a, b) => a - b).join('.');
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(withOutside(built, keyPcs, {
      move: move.id,
      moveLabel: move.label,
      why: move.hint,
      from: chord.symbol,
    }));
  }
  return out;
}

/**
 * Every out-of-key group the tab shows, in one call.
 * @param {string} root
 * @param {string} scale
 * @param {{size?:number}} [options]
 */
export function outsideMoves(root, scale, { size = 4 } = {}) {
  return [
    {
      id: 'secondary',
      label: 'Secondary dominants',
      hint: 'Treat any chord of the key as a temporary tonic, then play its V7.',
      chords: secondaryDominants(root, scale, { size }),
    },
    {
      id: 'tritone',
      label: 'Tritone substitutes',
      hint: 'Swap a dominant for the dominant a tritone away. They share the same two guide tones.',
      chords: tritoneSubs(root, scale, { size }),
    },
    {
      id: 'leading',
      label: 'Leading-tone diminished 7ths',
      hint: 'A dim7 one semitone under the target. Every tone is a semitone from the chord it lands on.',
      chords: leadingToneDiminished(root, scale, { size }),
    },
  ];
}
