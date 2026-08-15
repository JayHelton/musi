/**
 * Node tests for workbook GP playthrough helpers.
 * Run: node tests/workbooks/playthrough.mjs
 */

import assert from 'node:assert/strict';
import {
  findConsecutiveGpRun,
  buildPlaythroughScore,
  entryIdAtBeat,
  entryIdAtMeasure,
  boundaryForEntry,
} from '../../js/workbookPlaythrough.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function makeGp(bars, { tempo = 120, name = 'T' } = {}) {
  const measures = [];
  const events = [];
  for (let i = 0; i < bars; i++) {
    measures.push({
      startSlot: i,
      endSlot: i + 1,
      startBeat: i * 4,
      endBeat: (i + 1) * 4,
      timeSig: [4, 4],
      marker: null,
    });
    events.push({
      slot: i,
      start: i * 4,
      duration: 1,
      stringIndex: 0,
      fret: i,
      midi: 40 + i,
      techniques: [],
      dead: false,
    });
  }
  const model = {
    tuning: 'Standard',
    strings: [{ note: 'E', oct: 2, label: 'E', openMidi: 40 }],
    events,
    measures,
    tempo,
    totalBeats: bars * 4,
    slots: bars,
    techniqueCounts: {},
    warnings: [],
  };
  return {
    tempo,
    tracks: [{
      index: 0,
      name,
      tuning: 'Standard',
      noteCount: events.length,
      model,
    }],
    drumTracks: [],
    warnings: [],
  };
}

test('findConsecutiveGpRun: middle of mixed run', () => {
  const entries = [
    { id: 'a', isGp: false },
    { id: 'b', isGp: true },
    { id: 'c', isGp: true },
    { id: 'd', isGp: true },
    { id: 'e', isGp: false },
  ];
  assert.deepEqual(findConsecutiveGpRun(entries, 2), { startIndex: 1, endIndex: 3 });
});

test('findConsecutiveGpRun: active entry is not GP', () => {
  const entries = [
    { id: 'a', isGp: false },
    { id: 'b', isGp: true },
  ];
  assert.equal(findConsecutiveGpRun(entries, 0), null);
});

test('findConsecutiveGpRun: all GP entries', () => {
  const entries = [
    { id: 'a', isGp: true },
    { id: 'b', isGp: true },
    { id: 'c', isGp: true },
  ];
  assert.deepEqual(findConsecutiveGpRun(entries, 1), { startIndex: 0, endIndex: 2 });
});

test('buildPlaythroughScore: two 2-bar parts', () => {
  const gp1 = makeGp(2, { name: 'Part A' });
  const gp2 = makeGp(2, { name: 'Part B' });
  const result = buildPlaythroughScore([
    { entryId: 'e1', gp: gp1 },
    { entryId: 'e2', gp: gp2 },
  ]);
  assert.ok(result);
  const model = result.gp.tracks[0].model;
  assert.equal(model.totalBeats, 16);
  assert.equal(model.measures.length, 4);
  assert.deepEqual(result.boundaries, [
    { entryId: 'e1', startBeat: 0, endBeat: 8, startMeasure: 0, endMeasure: 1 },
    { entryId: 'e2', startBeat: 8, endBeat: 16, startMeasure: 2, endMeasure: 3 },
  ]);
});

test('entryIdAtBeat: boundary beat belongs to later part', () => {
  const boundaries = [
    { entryId: 'e1', startBeat: 0, endBeat: 8, startMeasure: 0, endMeasure: 1 },
    { entryId: 'e2', startBeat: 8, endBeat: 16, startMeasure: 2, endMeasure: 3 },
  ];
  assert.equal(entryIdAtBeat(boundaries, 8), 'e2');
  assert.equal(entryIdAtBeat(boundaries, 7.9), 'e1');
});

test('entryIdAtMeasure: second part measure index', () => {
  const boundaries = [
    { entryId: 'e1', startBeat: 0, endBeat: 8, startMeasure: 0, endMeasure: 1 },
    { entryId: 'e2', startBeat: 8, endBeat: 16, startMeasure: 2, endMeasure: 3 },
  ];
  assert.equal(entryIdAtMeasure(boundaries, 2), 'e2');
});

test('boundaryForEntry: returns matching boundary', () => {
  const boundaries = [
    { entryId: 'e1', startBeat: 0, endBeat: 8, startMeasure: 0, endMeasure: 1 },
    { entryId: 'e2', startBeat: 8, endBeat: 16, startMeasure: 2, endMeasure: 3 },
  ];
  const b = boundaryForEntry(boundaries, 'e2');
  assert.ok(b);
  assert.equal(b.startBeat, 8);
  assert.equal(boundaryForEntry(boundaries, 'missing'), null);
});

test('buildPlaythroughScore: stamps name on second part first measure', () => {
  const gp1 = makeGp(2);
  const gp2 = makeGp(2);
  const result = buildPlaythroughScore([
    { entryId: 'e1', gp: gp1 },
    { entryId: 'e2', gp: gp2, name: 'Section B' },
  ]);
  assert.ok(result);
  const measures = result.gp.tracks[0].model.measures;
  assert.equal(measures[2].marker, 'Section B');
});

test('buildPlaythroughScore: tempo change produces tempoMap boundary', () => {
  const gp1 = makeGp(2, { tempo: 120 });
  const gp2 = makeGp(2, { tempo: 90 });
  const result = buildPlaythroughScore([
    { entryId: 'e1', gp: gp1, tempo: 120 },
    { entryId: 'e2', gp: gp2, tempo: 90 },
  ]);
  assert.ok(result);
  const tempoMap = result.gp.tracks[0].model.tempoMap;
  assert.ok(tempoMap);
  const boundary = tempoMap.find((t) => t.barIndex === 2 && t.beat === 0);
  assert.ok(boundary);
  assert.equal(boundary.bpm, 90);
  assert.equal(boundary.linear, false);
});

test('buildPlaythroughScore: empty parts returns null', () => {
  assert.equal(buildPlaythroughScore(null), null);
  assert.equal(buildPlaythroughScore([]), null);
  assert.equal(buildPlaythroughScore([{ entryId: 'e1' }]), null);
});

console.log(`\n${passed} tests passed`);
