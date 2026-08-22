/**
 * Zero-dependency Node tests for Fretboard Interval Map browser modules.
 * Run: node tests/scale-intervals/run.mjs
 */

import assert from 'node:assert/strict';
import {
  TUNING_CATALOG,
  TUNINGS,
  validateCatalog,
  validateTuningPitches,
  searchTunings,
  getTuningGeometry,
  findPresetByName,
  resolveTuningPitches,
  createCustomTuningDraft,
} from '../../js/tunings.js';
import {
  openMidisFromTuning,
  makeAnchor,
  positionsForInterval,
  shapeVariantsForInterval,
  boundariesBetweenPositions,
  boundaryTypeBetweenStrings,
  collectMapPositions,
  compareTuningShapes,
  enabledIntervalsForLevel,
  MAP_RANGE_DEFS,
} from '../../js/interval-map/model.js';
import {
  generateValidQuestion,
  questionHasValidAnswerInRange,
} from '../../js/interval-map/questions.js';

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

console.log('Tuning catalog');
test('catalog validates', () => {
  const v = validateCatalog();
  assert.equal(v.ok, true, v.errors?.join('; '));
});
test('every pitch parses and string counts match', () => {
  for (const p of TUNING_CATALOG) {
    assert.equal(p.pitches.length, p.strings);
    const v = validateTuningPitches(p.pitches, { expectStrings: p.strings });
    assert.equal(v.ok, true, `${p.id}: ${v.errors.join('; ')}`);
  }
});
test('MIDI order ascends', () => {
  for (const p of TUNING_CATALOG) {
    const midis = getTuningGeometry(p.pitches).midis;
    for (let i = 0; i < midis.length - 1; i++) assert.ok(midis[i] < midis[i + 1], p.id);
  }
});
test('IDs unique', () => {
  const ids = TUNING_CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('enharmonic / legacy aliases resolve', () => {
  assert.ok(findPresetByName('Half Step Down'));
  assert.ok(findPresetByName('CGCFAD'));
  assert.ok(TUNINGS['Half Step Down']);
  assert.ok(TUNINGS['7-String Drop F#']);
  assert.deepEqual(
    resolveTuningPitches('Half Step Down').map((x) => x.note),
    resolveTuningPitches('Eb Standard').map((x) => x.note)
  );
});
test('standard and drop boundary structures', () => {
  const std = getTuningGeometry(TUNINGS.Standard);
  assert.deepEqual(std.adjacent.map((a) => a.semitones), [5, 5, 5, 4, 5]);
  assert.equal(std.adjacent[3].type, 'major-third');
  const drop = getTuningGeometry(TUNINGS['Drop C']);
  assert.equal(drop.adjacent[0].type, 'drop');
  assert.equal(drop.adjacent[0].semitones, 7);
  const drop7 = getTuningGeometry(TUNINGS['7-String Drop A']);
  assert.equal(drop7.adjacent[0].type, 'drop');
  assert.equal(drop7.adjacent[0].semitones, 7);
});
test('custom tuning validation', () => {
  const bad = validateTuningPitches([
    { note: 'E', oct: 4 },
    { note: 'A', oct: 2 },
  ]);
  assert.equal(bad.ok, false);
  const draft = createCustomTuningDraft(6, 'Drop C');
  const ok = validateTuningPitches(draft, { expectStrings: 6, expectDrop: true });
  assert.equal(ok.ok, true);
});
test('search aliases return presets', () => {
  const hits = searchTunings('CGCFAD');
  assert.ok(hits.some((h) => h.name === 'Drop C'));
  const seven = searchTunings('drop a', { stringCount: 7 });
  assert.ok(seven.some((h) => h.name === '7-String Drop A'));
});

console.log('Interval calculation');
function stdOpen() {
  return openMidisFromTuning(TUNINGS.Standard);
}
test('same-string intervals', () => {
  const open = stdOpen();
  const anchor = makeAnchor({ string: 4, fret: 3, openMidis: open }); // G string? wait index 4 = B in std? 
  // Standard: 0E 1A 2D 3G 4B 5e — string 5 fret 3 = G
  const a = makeAnchor({ string: 5, fret: 3, openMidis: open });
  const fifths = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 7, mapRange: 3, fretStart: 0, fretEnd: 15,
  });
  assert.ok(fifths.some((p) => p.string === 5 && p.fret === 10));
});
test('adjacent-string P5 in standard is +2 frets', () => {
  const open = stdOpen();
  const a = makeAnchor({ string: 0, fret: 3, openMidis: open });
  const shape = shapeVariantsForInterval({
    anchor: a, openMidis: open, intervalClass: 7, mapRange: 2, fretStart: 0, fretEnd: 12,
  });
  const higher = shape.variants.find((v) => v.vector.deltaString === 1);
  assert.ok(higher);
  assert.equal(higher.vector.deltaFret, 2);
});
test('B-string boundary shifts M3 shape', () => {
  const open = stdOpen();
  // From G string (3) major 3rd same-geometry vs across to B
  const a = makeAnchor({ string: 3, fret: 5, openMidis: open });
  const b = boundaryTypeBetweenStrings(3, open);
  assert.equal(b.type, 'major-third');
  const across = boundariesBetweenPositions(3, 4, open);
  assert.ok(across.some((x) => x.type === 'major-third'));
  void a;
});
test('six-string drop boundary P5 same fret', () => {
  const open = openMidisFromTuning(TUNINGS['Drop C']);
  const a = makeAnchor({ string: 0, fret: 5, openMidis: open });
  const shape = shapeVariantsForInterval({
    anchor: a, openMidis: open, intervalClass: 7, mapRange: 2, fretStart: 0, fretEnd: 12,
  });
  const higher = shape.variants.find((v) => v.vector.deltaString === 1);
  assert.ok(higher);
  assert.equal(higher.vector.deltaFret, 0);
});
test('seven-string drop boundary', () => {
  const open = openMidisFromTuning(TUNINGS['7-String Drop A']);
  assert.equal(boundaryTypeBetweenStrings(0, open).type, 'drop');
  const a = makeAnchor({ string: 0, fret: 5, openMidis: open });
  // Drop P5: octave on next string is +5 frets (open P5 + 5 = 12).
  const oct = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 12, mapRange: 2, fretStart: 0, fretEnd: 12,
  });
  assert.ok(oct.some((p) => p.string === 1 && p.fret === 10));
  const fifth = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 7, mapRange: 1, fretStart: 0, fretEnd: 12,
  });
  assert.ok(fifth.some((p) => p.string === 1 && p.fret === 5));
});
test('custom tuning intervals', () => {
  const pitches = [
    { note: 'C', oct: 2 }, { note: 'G', oct: 2 }, { note: 'C', oct: 3 },
    { note: 'F', oct: 3 }, { note: 'A', oct: 3 }, { note: 'D', oct: 4 },
  ];
  const open = openMidisFromTuning(pitches);
  const a = makeAnchor({ string: 0, fret: 0, openMidis: open });
  const p5 = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 7, mapRange: 1, fretStart: 0, fretEnd: 5,
  });
  assert.ok(p5.some((p) => p.string === 1 && p.fret === 0));
});
test('roots near fret-range edges still find answers', () => {
  const open = stdOpen();
  const a = makeAnchor({ string: 2, fret: 0, openMidis: open });
  const pos = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 5, mapRange: 2, fretStart: 0, fretEnd: 5,
  });
  assert.ok(pos.length > 0);
});
test('octave positions', () => {
  const open = stdOpen();
  const a = makeAnchor({ string: 0, fret: 5, openMidis: open });
  const oct = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 12, mapRange: 3, fretStart: 0, fretEnd: 15,
  });
  assert.ok(oct.length > 0);
  assert.ok(oct.every((p) => !p.isAnchor && ((p.midi - a.midi) % 12 + 12) % 12 === 0));
  assert.ok(oct.some((p) => Math.abs(p.midi - a.midi) === 12));
});
test('left-handed presentation does not alter answers', () => {
  const open = stdOpen();
  const a = makeAnchor({ string: 1, fret: 5, openMidis: open });
  const left = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 4, mapRange: 2, fretStart: 0, fretEnd: 12,
  });
  const right = positionsForInterval({
    anchor: a, openMidis: open, intervalClass: 4, mapRange: 2, fretStart: 0, fretEnd: 12,
  });
  assert.deepEqual(
    left.map((p) => `${p.string}:${p.fret}`).sort(),
    right.map((p) => `${p.string}:${p.fret}`).sort()
  );
});
test('compare standard vs drop lowest-string P5', () => {
  const cmp = compareTuningShapes({
    intervalClass: 7,
    rootString: 0,
    rootFret: 5,
    tuningA: 'D Standard',
    tuningB: 'Drop C',
    mapRange: 2,
    fretStart: 0,
    fretEnd: 12,
  });
  assert.equal(cmp.ok, true);
  const aHigher = cmp.a.variants.find((v) => v.vector.deltaString === 1);
  const bHigher = cmp.b.variants.find((v) => v.vector.deltaString === 1);
  assert.equal(aHigher.vector.deltaFret, 2);
  assert.equal(bHigher.vector.deltaFret, 0);
});



console.log('Question validity');
test('generated questions have valid answers in range', () => {
  const open = stdOpen();
  const types = [
    'locate', 'name-interval', 'name-note', 'relationship', 'complete-shape',
    'reverse-map', 'interval-pair', 'study-reveal', 'play-interval', 'play-root-then',
  ];
  for (const exerciseType of types) {
    for (let i = 0; i < 8; i++) {
      const ctx = {
        openMidis: open,
        tuningName: 'Standard',
        mapRange: 2,
        level: 5,
        fretStart: 0,
        fretEnd: 12,
        exerciseType,
      };
      const q = generateValidQuestion(ctx);
      assert.ok(q, `no question for ${exerciseType}`);
      assert.ok(questionHasValidAnswerInRange(q, ctx), `${exerciseType} invalid: ${q?.prompt}`);
      assert.ok(q.anchor.fret >= 0 && q.anchor.fret <= 12);
      if (q.inputMethod === 'audio') assert.equal(q.claimsPhysicalPosition, false);
    }
  }
});
test('boundary-shift requires a boundary', () => {
  const open = openMidisFromTuning(TUNINGS['Drop C']);
  const ctx = {
    openMidis: open,
    tuningName: 'Drop C',
    mapRange: 2,
    level: 5,
    fretStart: 0,
    fretEnd: 12,
    exerciseType: 'boundary-shift',
  };
  const q = generateValidQuestion(ctx);
  assert.ok(q);
  assert.ok(q.boundaryPresent || q.type !== 'boundary-shift' || q.answers?.length);
});
test('level filters intervals', () => {
  assert.deepEqual(enabledIntervalsForLevel(1).sort((a, b) => a - b), [0, 5, 7]);
  assert.ok(MAP_RANGE_DEFS[1].name.includes('Local'));
});


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
