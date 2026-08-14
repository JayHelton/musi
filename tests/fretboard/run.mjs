/**
 * Zero-dependency Node tests for fretPositions and FRET_MARKERS.
 * Run: node tests/fretboard/run.mjs
 */

import assert from 'node:assert/strict';

const {
  fretPositions,
  FRET_MARKERS,
} = await import('../../js/fretboard/renderer.js');

const { TUNING_CATALOG } = await import('../../js/tunings.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function openNotesHighToLow(model) {
  return fretPositions(model).strings.map((s) => `${s.open.note}${s.open.oct}`);
}

function noteAt(model, modelString, fret) {
  const pos = fretPositions(model);
  const row = pos.strings.find((s) => s.index === modelString);
  assert.ok(row, `missing string ${modelString}`);
  const cell = row.frets.find((f) => f.fret === fret);
  assert.ok(cell, `missing fret ${fret} on string ${modelString}`);
  return cell;
}

const E_STANDARD_OPENS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];

test('FRET_MARKERS matches contract list', () => {
  assert.deepEqual(FRET_MARKERS, [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
});

test('E Standard has 6 strings with catalog open notes', () => {
  const opens = openNotesHighToLow({ tuning: 'E Standard' });
  assert.equal(opens.length, 6);
  assert.deepEqual(opens, E_STANDARD_OPENS);
});

test('Standard legacy key matches E Standard opens', () => {
  const opens = openNotesHighToLow({ tuning: 'Standard' });
  assert.equal(opens.length, 6);
  assert.deepEqual(opens, E_STANDARD_OPENS);
});

test('Standard E alias matches E Standard opens', () => {
  const opens = openNotesHighToLow({ tuning: 'Standard E' });
  assert.equal(opens.length, 6);
  assert.deepEqual(opens, E_STANDARD_OPENS);
});

test('Drop D low string is D', () => {
  const pos = fretPositions({ tuning: 'Drop D' });
  assert.equal(pos.strings.length, 6);
  const low = pos.strings[pos.strings.length - 1];
  assert.equal(low.open.note, 'D');
  assert.equal(low.open.oct, 2);
});

test('6-drop-d id matches Drop D', () => {
  const byName = fretPositions({ tuning: 'Drop D' });
  const byId = fretPositions({ tuning: '6-drop-d' });
  assert.deepEqual(byName.strings.map((s) => s.open), byId.strings.map((s) => s.open));
});

test('7-b-std has 7 strings', () => {
  const pos = fretPositions({ tuning: '7-b-std' });
  assert.equal(pos.strings.length, 7);
  assert.equal(pos.tuningId, '7-b-std');
  assert.equal(pos.tuningName, '7-String Standard');
});

test('fretStart and fretEnd clip visible frets', () => {
  const pos = fretPositions({
    tuning: 'E Standard',
    fretStart: 3,
    fretEnd: 5,
  });
  for (const row of pos.strings) {
    assert.deepEqual(row.frets.map((f) => f.fret), [3, 4, 5]);
  }
  assert.equal(noteAt({ tuning: 'E Standard', fretStart: 3, fretEnd: 5 }, 0, 3).note, 'G');
});

test('fretPositions is pure', () => {
  const model = { tuning: 'E Standard', fretStart: 0, fretEnd: 4 };
  const a = fretPositions(model);
  const b = fretPositions(model);
  assert.deepEqual(a, b);
});

test('unknown tuning falls back to 6-string standard', () => {
  const pos = fretPositions({ tuning: 'Not A Real Tuning' });
  assert.equal(pos.strings.length, 6);
  assert.deepEqual(openNotesHighToLow({ tuning: 'Not A Real Tuning' }), E_STANDARD_OPENS);
  assert.equal(pos.tuningId, '6-e-std');
});

test('explicit pitch list resolves open notes', () => {
  const custom = [
    { note: 'D', oct: 2 },
    { note: 'A', oct: 2 },
    { note: 'D', oct: 3 },
    { note: 'G', oct: 3 },
    { note: 'B', oct: 3 },
    { note: 'E', oct: 4 },
  ];
  const opens = openNotesHighToLow({ tuning: custom });
  assert.deepEqual(opens, ['E4', 'B3', 'G3', 'D3', 'A2', 'D2']);
  const pos = fretPositions({ tuning: custom });
  assert.equal(pos.tuningName, 'Custom');
  assert.equal(pos.tuningId, null);
});

test('catalog E Standard preset matches renderer opens', () => {
  const preset = TUNING_CATALOG.find((p) => p.id === '6-e-std');
  assert.ok(preset);
  const expectedHighToLow = preset.pitches
    .slice()
    .reverse()
    .map((p) => `${p.note}${p.oct}`);
  assert.deepEqual(openNotesHighToLow({ tuning: '6-e-std' }), expectedHighToLow);
});

console.log(`\n${passed} passed`);
