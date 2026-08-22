/**
 * Zero-dependency Node tests for the scale position engine.
 *
 * The first group compares the computed shapes with the published minor
 * pentatonic boxes. Those five boxes are the most documented fingerings on the
 * guitar, so they are the reference the engine must reproduce.
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
  POSITION_SPAN,
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

function positionAt(positions, anchorFret) {
  const found = positions.find(p => p.anchorFret === anchorFret);
  assert.ok(found, `no position anchored at fret ${anchorFret}`);
  return found;
}

const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const A_SEMI = 9;

const aMinorPentatonic = buildScalePositions({
  openMidis: E_STANDARD,
  semis: MINOR_PENTATONIC,
  rootSemi: A_SEMI,
});

console.log('\nPublished minor pentatonic boxes (A minor, E standard)');

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

test('the five boxes repeat one octave higher', () => {
  const low = positionAt(aMinorPentatonic, 5);
  const high = positionAt(aMinorPentatonic, 17);
  const shift = fretRows(low, 6).map(row => row.map(f => f + 12));
  assert.deepEqual(fretRows(high, 6), shift);
});

console.log('\nPublished major scale position (C major, E standard)');

// The four-fret C major box at the 8th fret. Two notes on the low string, then
// the index reaches back to fret 7 for the run to stay unbroken.
test('C major position 1 matches the four-fret box', () => {
  const positions = buildScalePositions({
    openMidis: E_STANDARD,
    semis: SCALES['Major (Ionian)'].map(d => d[1]),
    rootSemi: 0,
  });
  const box = positionAt(positions, 8);
  assert.deepEqual(fretRows(box, 6), [
    [8, 10], [7, 8, 10], [7, 9, 10], [7, 9, 10], [8, 10], [7, 8, 10],
  ]);
  assert.equal(box.degree, 1);
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
 * the hand span of 4 frets always overlaps the next string. Drop and open
 * tunings put a wider gap under one pair of strings. There the run must jump,
 * because the notes between the two strings sit outside the hand.
 */
function isRegular(openMidis) {
  for (let i = 1; i < openMidis.length; i++) {
    if (openMidis[i] - openMidis[i - 1] > 5) return false;
  }
  return true;
}

test('every position on a regular tuning holds one unbroken run', () => {
  everyPosition((p, ctx) => {
    if (!isRegular(ctx.openMidis)) return;
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

test('the run only climbs, on every tuning', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    const midis = p.notes.map(n => n.midi);
    for (let i = 1; i < midis.length; i++) {
      assert.ok(midis[i] > midis[i - 1], `${where}: the run goes down at note ${i}`);
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

test('every note stays under the hand', () => {
  everyPosition((p, ctx) => {
    const where = `${ctx.scaleName} / ${ctx.tuningName} / position ${p.degree}`;
    const lo = p.anchorFret - POSITION_REACH_BACK;
    const hi = p.anchorFret + POSITION_SPAN - 1;
    p.notes.forEach(n => {
      assert.ok(n.fret >= lo, `${where}: fret ${n.fret} is below fret ${lo}`);
      assert.ok(n.fret <= hi, `${where}: fret ${n.fret} is above fret ${hi}`);
    });
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

test('a new tonal centre moves the anchor but keeps the scale', () => {
  const semis = SCALES['Major (Ionian)'].map(d => d[1]);
  const ionian = buildScalePositions({ openMidis: E_STANDARD, semis, rootSemi: 0, modeIndex: 0 });
  const aeolian = buildScalePositions({ openMidis: E_STANDARD, semis, rootSemi: 0, modeIndex: 5 });
  const pitches = p => new Set(p.notes.map(n => n.midi % 12));
  // Both hold the same seven notes, so the shapes on the neck are the same.
  const ionianPitches = [...pitches(ionian[0])].sort((a, b) => a - b);
  const aeolianPitches = [...pitches(aeolian[0])].sort((a, b) => a - b);
  assert.deepEqual(aeolianPitches, ionianPitches);
  // Position 1 of A Aeolian starts on A, not on C.
  assert.equal(aeolian.find(p => p.isTonic).anchorSemi, 9);
  assert.equal(ionian.find(p => p.isTonic).anchorSemi, 0);
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
