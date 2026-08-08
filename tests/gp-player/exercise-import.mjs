// Node tests for GP exercise-import digests and segment logic.
// Run: node tests/gp-player/exercise-import.mjs

import assert from 'node:assert/strict';
import {
  buildMeasureDigests,
  formatBarRange,
  describeMeasure,
} from '../../js/gpPlayer/measureDigest.js';
import {
  defaultSegmentName,
  addSegment,
  removeSegment,
  updateSegmentRange,
  renameSegment,
  sortSegments,
  assignmentMap,
  coverageStats,
  autoSplitByMarkers,
  autoSplitEveryN,
  autoSplitFromAnnotations,
  segmentBeats,
  estimateSeconds,
} from '../../js/gpPlayer/exerciseSegments.js';

// ---- hand-built models ----
const guitarModel = {
  tuning: 'Standard',
  strings: [
    { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    { note: 'A', oct: 2, label: 'A', openMidi: 45 },
  ],
  events: [
    { slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 3, midi: 43, pc: 7, techniques: ['bend'], dead: false },
    { slot: 1, start: 1, duration: 1, stringIndex: 1, fret: 5, midi: 50, pc: 2, techniques: ['slide'], dead: false },
    { slot: 4, start: 4, duration: 1, stringIndex: 0, fret: 3, midi: 43, pc: 7, techniques: ['bend'], dead: false },
    { slot: 5, start: 5, duration: 1, stringIndex: 1, fret: 5, midi: 50, pc: 2, techniques: ['slide'], dead: false },
    { slot: 8, start: 8, duration: 1, stringIndex: 0, fret: 0, midi: 40, pc: 4, techniques: [], dead: false },
  ],
  measures: [
    { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4, marker: 'Intro', timeSig: [4, 4] },
    { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8, marker: 'Verse', timeSig: [4, 4] },
    { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12, marker: null, timeSig: [3, 4] },
    { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16, marker: null, timeSig: [4, 4] },
  ],
  tempo: 120,
  totalBeats: 16,
};

const percModel = {
  events: [
    { slot: 0, start: 0, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 2, start: 2, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 4, start: 4, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 6, start: 6, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 8, start: 8, duration: 0.25, instrument: 'crash', velocity: 0.9, midi: 49 },
    { slot: 9, start: 9, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 10, start: 10, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
  ],
  measures: guitarModel.measures,
  tempo: 120,
};

const digests = buildMeasureDigests({ guitarModel, percModel });
assert.equal(digests.length, 4);
assert.equal(digests[0].marker, 'Intro');
assert.equal(digests[1].marker, 'Verse');
assert.deepEqual(digests[0].timeSig, [4, 4]);
assert.equal(digests[0].timeSigChanged, true);
assert.equal(digests[1].timeSigChanged, false);
assert.deepEqual(digests[2].timeSig, [3, 4]);
assert.equal(digests[2].timeSigChanged, true);

assert.equal(digests[0].noteCount, 2);
assert.equal(digests[0].drumHits, 2);
assert.equal(digests[0].fretMin, 3);
assert.equal(digests[0].fretMax, 5);
assert.deepEqual(digests[0].stringsUsed, [0, 1]);
assert.deepEqual(digests[0].noteNames, ['G', 'D']);
assert.deepEqual(digests[0].techniques, ['bend', 'slide']);
assert.deepEqual(digests[0].drumInstruments, ['kick', 'snare']);
assert.equal(digests[0].isEmpty, false);
assert.equal(digests[0].density, 1);
assert.equal(digests[0].beatCells.reduce((a, b) => a + b, 0), 4);
assert.equal(digests[3].isEmpty, true);
assert.equal(digests[3].signature, '');
assert.equal(digests[3].repeatOf, null);

// repeat detection: bar 2 repeats bar 1 content
assert.ok(digests[0].signature);
assert.equal(digests[1].signature, digests[0].signature);
assert.equal(digests[1].repeatOf, 0);
assert.notEqual(digests[2].signature, digests[0].signature);
assert.equal(digests[2].repeatOf, null);

// formatBarRange + describeMeasure
assert.equal(formatBarRange(2, 2), 'Bar 3');
assert.equal(formatBarRange(2, 6), 'Bars 3\u20137');
const described = describeMeasure(digests[0]);
assert.ok(described.includes('Bar 1'));
assert.ok(described.includes('Intro'));
assert.ok(described.includes('4/4'));
assert.ok(described.includes('2 notes'));
assert.ok(described.includes('frets 3\u20135'));
assert.ok(described.includes('bend, slide'));
assert.ok(described.includes('2 drum hits'));
assert.equal(describeMeasure(digests[3]), 'Bar 4 \u00b7 rest');

// ---- segments ----
let segments = [];
const snap0 = JSON.stringify(segments);

segments = addSegment(segments, 0, 4, digests);
assert.equal(segments.length, 1);
assert.equal(segments[0].autoName, true);
assert.ok(segments[0].name.includes('Intro'));

const custom = addSegment([], 1, 2, digests, { name: 'My Verse Chunk' });
assert.equal(custom[0].name, 'My Verse Chunk');
assert.equal(custom[0].autoName, false);

const renamed = renameSegment(custom, custom[0].id, 'Custom Label');
assert.equal(renamed[0].name, 'Custom Label');
assert.equal(renamed[0].autoName, false);

const resetName = renameSegment(renamed, renamed[0].id, '   ');
assert.equal(resetName[0].autoName, true);
assert.equal(resetName[0].name, formatBarRange(1, 2));

segments = addSegment([], 0, 3, digests);
const carved = addSegment(segments, 1, 2, digests, { name: 'Middle' });
assert.equal(carved.length, 3);
const left = carved.find((s) => s.endIdx === 0);
const mid = carved.find((s) => s.name === 'Middle');
const right = carved.find((s) => s.startIdx === 3);
assert.ok(left);
assert.ok(mid);
assert.ok(right);
assert.equal(mid.startIdx, 1);
assert.equal(mid.endIdx, 2);

const swallowed = addSegment([{ id: 'seg-x', startIdx: 1, endIdx: 2, name: 'Gone', autoName: false }], 0, 3, digests);
assert.equal(swallowed.length, 1);
assert.equal(swallowed[0].startIdx, 0);
assert.equal(swallowed[0].endIdx, 3);

const unsorted = [
  { id: 'b', startIdx: 5, endIdx: 7, name: 'B', autoName: false },
  { id: 'a', startIdx: 0, endIdx: 2, name: 'A', autoName: false },
];
assert.deepEqual(sortSegments(unsorted).map((s) => s.id), ['a', 'b']);

const toRemove = addSegment([], 0, 1, digests);
const removed = removeSegment(toRemove, toRemove[0].id);
assert.equal(removed.length, 0);

const forUpdate = addSegment([], 0, 3, digests);
const updated = updateSegmentRange(forUpdate, forUpdate[0].id, 1, 2, digests);
assert.equal(updated.length, 1);
assert.equal(updated[0].startIdx, 1);
assert.equal(updated[0].endIdx, 2);
assert.ok(updated[0].name.includes('Verse') || updated[0].name.includes('Bar'));

// 12-bar coverage case (0-based: 0-4, 5-6, 7-9)
const twelve = Array.from({ length: 12 }, (_, i) => ({
  index: i,
  barNumber: i + 1,
  startBeat: i * 4,
  endBeat: (i + 1) * 4,
  beats: 4,
  marker: null,
  timeSig: [4, 4],
  timeSigChanged: i === 0,
  noteCount: 0,
  drumHits: 0,
  isEmpty: true,
  signature: '',
}));
let covSegs = [];
covSegs = addSegment(covSegs, 0, 4, twelve);
covSegs = addSegment(covSegs, 5, 6, twelve);
covSegs = addSegment(covSegs, 7, 9, twelve);
const assign = assignmentMap(covSegs, 12);
assert.equal(assign[0].order, 1);
assert.equal(assign[5].order, 2);
assert.equal(assign[7].order, 3);
assert.equal(assign[10], null);
const stats = coverageStats(covSegs, 12);
assert.equal(stats.bars, 12);
assert.equal(stats.covered, 10);
assert.equal(stats.uncovered, 2);
assert.deepEqual(stats.gaps, [[10, 11]]);

// auto splits
const markerDigests = [
  { index: 0, marker: null, barNumber: 1, startBeat: 0, endBeat: 4, beats: 4 },
  { index: 1, marker: null, barNumber: 2, startBeat: 4, endBeat: 8, beats: 4 },
  { index: 2, marker: 'Verse', barNumber: 3, startBeat: 8, endBeat: 12, beats: 4 },
  { index: 3, marker: 'Chorus', barNumber: 4, startBeat: 12, endBeat: 16, beats: 4 },
  { index: 4, marker: null, barNumber: 5, startBeat: 16, endBeat: 20, beats: 4 },
];
const byMarkers = autoSplitByMarkers(markerDigests);
assert.equal(byMarkers.length, 3);
assert.equal(byMarkers[0].startIdx, 0);
assert.equal(byMarkers[0].endIdx, 1);
assert.equal(byMarkers[1].startIdx, 2);
assert.equal(byMarkers[2].startIdx, 3);
assert.equal(autoSplitByMarkers(digests.filter((d) => !d.marker)).length, 0);

const every3 = autoSplitEveryN(twelve, 3);
assert.equal(every3.length, 4);
assert.equal(every3[0].endIdx, 2);
assert.equal(every3[3].startIdx, 9);
assert.equal(every3[3].endIdx, 11);

const fromAnno = autoSplitFromAnnotations([
  { title: 'Warmup', measureStart: 0, measureEnd: 1 },
  { measureStart: 4, measureEnd: 6 },
  { title: 'Solo', measureStart: 5, measureEnd: 8 },
], twelve);
assert.equal(fromAnno.length, 3);
assert.equal(autoSplitFromAnnotations([{ title: 'No range' }], twelve).length, 0);
assert.equal(fromAnno[0].name, 'Warmup');
assert.equal(fromAnno[0].autoName, false);
const solo = fromAnno.find((s) => s.name === 'Solo');
assert.ok(solo);
assert.equal(solo.startIdx, 5);
assert.equal(solo.endIdx, 8);
const trimmedAuto = fromAnno.find((s) => s.autoName && s.startIdx === 4);
assert.ok(trimmedAuto);
assert.equal(trimmedAuto.endIdx, 4);

assert.equal(defaultSegmentName(4, 7, digests), 'Verse \u00b7 bars 5\u20138');
assert.equal(defaultSegmentName(2, 2, digests), 'Verse \u00b7 bar 3');
assert.equal(defaultSegmentName(5, 5, twelve), 'Bar 6');

const beatSeg = { startIdx: 0, endIdx: 1 };
const beats = segmentBeats(beatSeg, digests);
assert.equal(beats.startBeat, 0);
assert.equal(beats.endBeat, 8);
assert.equal(beats.beats, 8);
assert.equal(estimateSeconds(beatSeg, digests, 120), 4);

assert.deepEqual(segmentBeats(null, digests), { startBeat: 0, endBeat: 0, beats: 0 });
assert.equal(estimateSeconds(beatSeg, digests, 0), 0);

// purity
const pureList = addSegment([], 0, 1, digests);
const pureSnap = JSON.stringify(pureList);
addSegment(pureList, 2, 3, digests);
updateSegmentRange(pureList, 'missing', 0, 1, digests);
renameSegment(pureList, 'missing', 'x');
removeSegment(pureList, 'missing');
assert.equal(JSON.stringify(pureList), pureSnap);
assert.equal(snap0, '[]');

assert.equal(buildMeasureDigests({}).length, 0);

console.log('gp exercise import: ok');
