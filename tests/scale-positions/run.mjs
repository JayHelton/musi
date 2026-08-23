/**
 * Zero-dependency Node tests for the scale position engine.
 *
 * The first two groups compare the computed shapes with the published ones.
 * The seven three-notes-per-string mode shapes and the five minor pentatonic
 * boxes are the most documented fingerings on the guitar, so they are the
 * reference the engine must reproduce.
 *
 * The other groups check the rules hold for every scale and every tuning.
 *
 * Run: node tests/scale-positions/run.mjs
 */

import assert from 'node:assert/strict';
import {
  buildScalePositions,
  nearestPositionIndex,
  positionNoteKeys,
  POSITION_REACH_BACK,
  MIN_NOTES_PER_STRING,
  MAX_NOTES_PER_STRING,
} from '../../js/scalePositions.js';
import { SCALES } from '../../js/scales.js';
import { TUNINGS } from '../../js/theory.js';
import { parseNote } from '../../js/theory.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** E standard, low string first. */
const E_STANDARD = [40, 45, 50, 55, 59, 64];

function openMidisFor(tuningName) {
  return TUNINGS[tuningName].map(s => {
    const p = parseNote(s.note);
    return 12 * (s.oct + 1) + p.semi;
  });
}

/** The frets of a position, one array per string, low string first. */
function fretRows(position, strings) {
  const rows = Array.from({ length: strings }, () => []);
  position.notes.forEach(n => rows[n.string].push(n.fret));
  return rows;
}

/** The frets of a position, measured from the note the position starts on. */
function shapeRows(position, strings) {
  return fretRows(position, strings).map(row => row.map(f => f - position.anchorFret));
}

function positionAt(positions, anchorFret) {
  const found = positions.find(p => p.anchorFret === anchorFret);
  assert.ok(found, `no position anchored at fret ${anchorFret}`);
  return found;
}

const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const A_SEMI = 9;
const MAJOR = SCALES['Major (Ionian)'].map(d => d[1]);

console.log('\nPublished three-notes-per-string mode shapes (E standard)');

/**
 * The seven diatonic mode shapes, in frets above the root.
 *
 * Each shape starts on its own root on the low string, and each string takes
 * the next three notes of the scale. No fret of a shape sits below the root.
 */
const MODE_SHAPES = {
  Ionian:     [[0, 2, 4], [0, 2, 4], [1, 2, 4], [1, 2, 4], [2, 4, 5], [2, 4, 5]],
  Dorian:     [[0, 2, 3], [0, 2, 4], [0, 2, 4], [0, 2, 4], [2, 3, 5], [2, 3, 5]],
  Phrygian:   [[0, 1, 3], [0, 2, 3], [0, 2, 3], [0, 2, 4], [1, 3, 5], [1, 3, 5]],
  Lydian:     [[0, 2, 4], [1, 2, 4], [1, 2, 4], [1, 3, 4], [2, 4, 5], [2, 4, 6]],
  Mixolydian: [[0, 2, 4], [0, 2, 4], [0, 2, 4], [1, 2, 4], [2, 3, 5], [2, 4, 5]],
  Aeolian:    [[0, 2, 3], [0, 2, 3], [0, 2, 4], [0, 2, 4], [1, 3, 5], [2, 3, 5]],
  Locrian:    [[0, 1, 3], [0, 1, 3], [0, 2, 3], [0, 2, 3], [1, 3, 5], [1, 3, 5]],
};

Object.keys(MODE_SHAPES).forEach((mode, modeIndex) => {
  test(`the ${mode} shape matches the published chart`, () => {
    const positions = buildScalePositions({
      openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex,
    });
    const box = positions.find(p => p.isTonic);
    assert.deepEqual(shapeRows(box, 6), MODE_SHAPES[mode]);
    assert.equal(box.perString, 3);
    // The root is the first note and no fret of the shape sits below it.
    assert.equal(box.start, box.anchorFret);
    assert.equal(box.notes[0].fret, box.anchorFret);
  });
});

test('every mode shape holds three notes on each string', () => {
  Object.keys(MODE_SHAPES).forEach((mode, modeIndex) => {
    const positions = buildScalePositions({
      openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex,
    });
    positions.forEach(p => {
      fretRows(p, 6).forEach(row => assert.equal(row.length, 3, `${mode}: a string has ${row.length} notes`));
    });
  });
});

console.log('\nPublished minor pentatonic boxes (A minor, E standard)');

const aMinorPentatonic = buildScalePositions({
  openMidis: E_STANDARD,
  semis: MINOR_PENTATONIC,
  rootSemi: A_SEMI,
});

test('a pentatonic scale takes two notes on each string', () => {
  aMinorPentatonic.forEach(p => assert.equal(p.perString, 2));
});

// Box 1 — the home box. Root A on the low string, fret 5.
test('box 1 matches the published shape', () => {
  const box = positionAt(aMinorPentatonic, 5);
  assert.deepEqual(fretRows(box, 6), [
    [5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8],
  ]);
  assert.equal(box.degree, 1);
  assert.equal(box.isTonic, true);
});

// Box 2 — starts on the b3. The little finger keeps the top of the box.
test('box 2 matches the published shape', () => {
  const box = positionAt(aMinorPentatonic, 8);
  assert.deepEqual(fretRows(box, 6), [
    [8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10],
  ]);
  assert.equal(box.degree, 2);
});

// Box 3 — the index finger reaches back to fret 9 on the G string.
test('box 3 matches the published shape', () => {
  const box = positionAt(aMinorPentatonic, 10);
  assert.deepEqual(fretRows(box, 6), [
    [10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12],
  ]);
  assert.equal(box.degree, 3);
});

// Box 4 — starts on the 5th.
test('box 4 matches the published shape', () => {
  const box = positionAt(aMinorPentatonic, 12);
  assert.deepEqual(fretRows(box, 6), [
    [12, 15], [12, 15], [12, 14], [12, 14], [13, 15], [12, 15],
  ]);
  assert.equal(box.degree, 4);
});

// Box 5 — the open-position box, one octave below box 5 at fret 15.
test('box 5 matches the published shape in open position', () => {
  const box = positionAt(aMinorPentatonic, 3);
  assert.deepEqual(fretRows(box, 6), [
    [3, 5], [3, 5], [2, 5], [2, 5], [3, 5], [3, 5],
  ]);
  assert.equal(box.degree, 5);
});

test('the pentatonic boxes are the reach-back exception', () => {
  // Box 2, box 3 and box 5 reach one fret below the note the box starts on.
  // That reach is part of the published shape, and it never grows past one
  // fret. Box 1 and box 4 need no reach at all.
  const reach = aMinorPentatonic
    .filter(p => p.anchorFret >= 3 && p.anchorFret <= 12)
    .map(p => [p.degree, p.anchorFret - p.start]);
  assert.deepEqual(reach, [[5, 1], [1, 0], [2, 1], [3, 1], [4, 0]]);
});

test('the five boxes repeat one octave higher', () => {
  const low = positionAt(aMinorPentatonic, 5);
  const high = positionAt(aMinorPentatonic, 17);
  const shift = fretRows(low, 6).map(row => row.map(f => f + 12));
  assert.deepEqual(fretRows(high, 6), shift);
});

console.log('\nAltered scales keep the shape of the scale they alter');

/** The shape of position 1 of a scale on A, low string first. */
function shapeOf(scaleName, modeIndex = 0) {
  const positions = buildScalePositions({
    openMidis: E_STANDARD,
    semis: SCALES[scaleName].map(d => d[1]),
    rootSemi: A_SEMI,
    modeIndex,
  });
  return shapeRows(positions.find(p => p.isTonic), 6);
}

/** The notes of two shapes that sit at a different fret, as "string:slot". */
function shapeDiff(a, b) {
  const moved = [];
  a.forEach((row, string) => row.forEach((fret, slot) => {
    if (b[string][slot] !== fret) moved.push(`${string}:${slot}`);
  }));
  return moved;
}

test('harmonic minor is the Aeolian shape with the seventh raised', () => {
  const aeolian = shapeOf('Natural Minor (Aeolian)');
  const harmonic = shapeOf('Harmonic Minor');
  // Aeolian holds two sevenths in the shape, so exactly two dots move.
  assert.deepEqual(shapeDiff(aeolian, harmonic), ['2:0', '4:1']);
  shapeDiff(aeolian, harmonic).forEach(key => {
    const [string, slot] = key.split(':').map(Number);
    assert.equal(harmonic[string][slot] - aeolian[string][slot], 1, `${key} did not rise one fret`);
  });
});

test('melodic minor is the Aeolian shape with the sixth and the seventh raised', () => {
  const aeolian = shapeOf('Natural Minor (Aeolian)');
  const melodic = shapeOf('Melodic Minor (Asc)');
  assert.deepEqual(shapeDiff(aeolian, melodic), ['1:2', '2:0', '4:0', '4:1']);
});

test('Lydian is the Ionian shape with the fourth raised', () => {
  const ionian = shapeOf('Major (Ionian)');
  const lydian = shapeOf('Lydian');
  assert.deepEqual(shapeDiff(ionian, lydian), ['1:0', '3:1', '5:2']);
});

test('an alteration never moves a note to another string or slot', () => {
  // Each shape holds the same number of notes in the same order, so the
  // player sees one dot move and the rest of the shape stay in place.
  const pairs = [
    ['Natural Minor (Aeolian)', 'Harmonic Minor'],
    ['Major (Ionian)', 'Lydian'],
    ['Mixolydian', 'Lydian Dominant'],
    ['Phrygian', 'Phrygian Dominant'],
  ];
  pairs.forEach(([base, altered]) => {
    const a = shapeOf(base);
    const b = shapeOf(altered);
    assert.deepEqual(a.map(r => r.length), b.map(r => r.length), `${base} → ${altered}`);
  });
});

console.log('\nPosition rules');

/** Every scale, every tuning, every position. */
function everyPosition(fn) {
  for (const [scaleName, def] of Object.entries(SCALES)) {
    const semis = def.map(d => d[1]);
    for (const tuningName of Object.keys(TUNINGS)) {
      const openMidis = openMidisFor(tuningName);
      for (let rootSemi = 0; rootSemi < 12; rootSemi++) {
        for (let modeIndex = 0; modeIndex < semis.length; modeIndex++) {
          const positions = buildScalePositions({ openMidis, semis, rootSemi, modeIndex });
          positions.forEach(p => fn(p, { scaleName, tuningName, rootSemi, modeIndex, openMidis, semis }));
        }
      }
    }
  }
}

/**
 * A regular tuning keeps every pair of strings 5 semitones apart or less, so
 * the same number of notes on each string keeps the hand over one part of the
 * neck. Drop and open tunings put a wider gap under one pair of strings, and
 * the shape must then stretch to reach across it.
 */
function isRegular(openMidis) {
  for (let i = 1; i < openMidis.length; i++) {
    if (openMidis[i] - openMidis[i - 1] > 5) return false;
  }
  return true;
}

test('every selection puts at least one position on the neck', () => {
  for (const [scaleName, def] of Object.entries(SCALES)) {
    const semis = def.map(d => d[1]);
    for (const tuningName of Object.keys(TUNINGS)) {
      const openMidis = openMidisFor(tuningName);
      for (let rootSemi = 0; rootSemi < 12; rootSemi++) {
        for (let modeIndex = 0; modeIndex < semis.length; modeIndex++) {
          const positions = buildScalePositions({ openMidis, semis, rootSemi, modeIndex });
          assert.ok(positions.length,
            `${scaleName} / ${tuningName} / root ${rootSemi} / mode ${modeIndex}: no position`);
        }
      }
    }
  }
});

test('every position holds one unbroken run', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / root ${ctx.rootSemi} / position ${p.degree}`;
    const classes = new Set(ctx.semis.map(s => (((ctx.rootSemi + s) % 12) + 12) % 12));
    const midis = p.notes.map(n => n.midi);
    for (let i = 1; i < midis.length; i++) {
      assert.ok(midis[i] > midis[i - 1], `${where}: the run goes down at note ${i}`);
      // No scale pitch may sit between two notes of the run.
      for (let m = midis[i - 1] + 1; m < midis[i]; m++) {
        assert.equal(classes.has(((m % 12) + 12) % 12), false, `${where}: the run skips MIDI ${m}`);
      }
    }
  });
});

test('every note belongs to the scale', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    const classes = new Set(ctx.semis.map(s => (((ctx.rootSemi + s) % 12) + 12) % 12));
    p.notes.forEach(n => {
      assert.equal(classes.has(n.midi % 12), true, `${where}: MIDI ${n.midi} is not in the scale`);
    });
  });
});

test('every string takes the same number of notes', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    assert.ok(p.perString >= MIN_NOTES_PER_STRING && p.perString <= MAX_NOTES_PER_STRING,
      `${where}: ${p.perString} notes on each string`);
    const counts = Array.from({ length: ctx.openMidis.length }, () => 0);
    p.notes.forEach(n => { counts[n.string] += 1; });
    counts.forEach(count => assert.equal(count, p.perString, `${where}: a string has ${count} notes`));
  });
});

test('the first note is the first note of the run, on the lowest string', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    assert.equal(p.notes[0].string, 0, `${where}: the run does not start on the lowest string`);
    assert.equal(p.notes[0].fret, p.anchorFret, `${where}: the run does not start on the anchor`);
  });
});

test('a regular tuning keeps every fret at or above the first note', () => {
  everyPosition((p, ctx) => {
    if (!isRegular(ctx.openMidis)) return;
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    const reach = p.anchorFret - p.start;
    assert.ok(reach <= POSITION_REACH_BACK,
      `${where}: the shape reaches ${reach} frets below the first note`);
  });
});

test('only the pentatonic and the symmetric scales reach back at all', () => {
  const reaching = new Set();
  everyPosition((p, ctx) => {
    if (!isRegular(ctx.openMidis)) return;
    if (p.anchorFret - p.start > 0) reaching.add(ctx.scaleName);
  });
  // A plain seven-note mode never reaches below its root.
  ['Major (Ionian)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian',
    'Natural Minor (Aeolian)', 'Locrian', 'Whole Tone'].forEach(name => {
    assert.equal(reaching.has(name), false, `${name} reaches below its first note`);
  });
  ['Minor Pentatonic', 'Major Pentatonic', 'Diminished W-H'].forEach(name => {
    assert.equal(reaching.has(name), true, `${name} should need the published reach`);
  });
});

test('every position climbs the strings in order and plays each one', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    const played = new Set(p.notes.map(n => n.string));
    assert.equal(played.size, ctx.openMidis.length, `${where}: a string has no note`);
    let last = -1;
    p.notes.forEach(n => {
      assert.ok(n.string >= last, `${where}: the run goes back a string`);
      last = n.string;
    });
  });
});

test('every position stays on the neck', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    assert.ok(p.start >= 0, `${where}: fret ${p.start} is behind the nut`);
    assert.ok(p.end <= 24, `${where}: fret ${p.end} is past the neck`);
  });
});

test('position 1 starts on the tonal centre', () => {
  everyPosition((p, ctx) => {
    if (!p.isTonic) return;
    const where = `${ctx.scaleName} / ${ctx.tuningName} / mode ${ctx.modeIndex}`;
    const centre = (((ctx.rootSemi + ctx.semis[ctx.modeIndex]) % 12) + 12) % 12;
    assert.equal(p.anchorSemi, centre, `${where}: position 1 starts on the wrong note`);
    assert.equal(p.notes[0].midi % 12, centre, `${where}: the first note is not the centre`);
  });
});

test('the positions climb the neck and hold every degree', () => {
  const positions = buildScalePositions({
    openMidis: E_STANDARD,
    semis: SCALES['Natural Minor (Aeolian)'].map(d => d[1]),
    rootSemi: A_SEMI,
  });
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i].anchorFret >= positions[i - 1].anchorFret, 'positions are out of order');
  }
  const degrees = new Set(positions.map(p => p.degree));
  assert.deepEqual([...degrees].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

console.log('\nA new tonal centre and a new position are not the same move');

test('a new tonal centre moves the first note but keeps the scale', () => {
  const ionian = buildScalePositions({ openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex: 0 });
  const aeolian = buildScalePositions({ openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex: 5 });
  const pitches = p => new Set(p.notes.map(n => n.midi % 12));
  // Both hold the same seven notes, so the shapes on the neck are the same.
  const ionianPitches = [...pitches(ionian[0])].sort((a, b) => a - b);
  const aeolianPitches = [...pitches(aeolian[0])].sort((a, b) => a - b);
  assert.deepEqual(aeolianPitches, ionianPitches);
  // Position 1 of A Aeolian starts on A, not on C.
  assert.equal(aeolian.find(p => p.isTonic).anchorSemi, 9);
  assert.equal(ionian.find(p => p.isTonic).anchorSemi, 0);
});

test('position 2 of C major is the D Dorian shape but keeps C as the centre', () => {
  const cMajor = buildScalePositions({ openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex: 0 });
  const dDorian = buildScalePositions({ openMidis: E_STANDARD, semis: MAJOR, rootSemi: 0, modeIndex: 1 });

  const second = cMajor.find(p => p.degree === 2 && p.anchorFret === 10);
  const first = dDorian.find(p => p.isTonic && p.anchorFret === 10);
  // The same box on the neck, note for note.
  assert.deepEqual(fretRows(second, 6), fretRows(first, 6));

  // C major calls it position 2, and D is degree 2 of C, not the tonic.
  assert.equal(second.isTonic, false);
  assert.equal(second.degreeSemi, 2);
  // D Dorian calls the same box position 1, and D is the tonic.
  assert.equal(first.isTonic, true);
  assert.equal(first.degree, 1);
  assert.equal(first.degreeSemi, 0);
});

console.log('\nHelpers');

test('nearestPositionIndex picks the closest anchor', () => {
  assert.equal(aMinorPentatonic[nearestPositionIndex(aMinorPentatonic, 5)].anchorFret, 5);
  assert.equal(aMinorPentatonic[nearestPositionIndex(aMinorPentatonic, 11)].anchorFret, 10);
  assert.equal(nearestPositionIndex([], 5), 0);
});

test('positionNoteKeys reports the notes of the box', () => {
  const keys = positionNoteKeys(positionAt(aMinorPentatonic, 5));
  assert.equal(keys.has('0:5'), true);
  assert.equal(keys.has('0:8'), true);
  assert.equal(keys.has('0:6'), false);
  assert.equal(keys.size, 12);
  assert.equal(positionNoteKeys(null).size, 0);
});

test('bad input gives an empty list', () => {
  assert.deepEqual(buildScalePositions({ openMidis: [], semis: [0, 2], rootSemi: 0 }), []);
  assert.deepEqual(buildScalePositions({ openMidis: E_STANDARD, semis: [], rootSemi: 0 }), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
