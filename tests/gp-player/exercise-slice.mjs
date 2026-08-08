// Node tests for exercise score slicing and practice-settings persistence.
// Run: node tests/gp-player/exercise-slice.mjs

import assert from 'node:assert/strict';
import { sliceModelByBeats } from '../../js/tab/tabModel.js';
import {
  isSegmentExercise,
  buildExerciseGpResult,
  filterPracticeSettingsPatch,
} from '../../js/gpExerciseScore.js';

function make16BarModel() {
  const measures = [];
  const events = [];
  for (let m = 0; m < 16; m++) {
    const startBeat = m * 2;
    const endBeat = startBeat + 2;
    measures.push({
      startSlot: m,
      endSlot: m + 1,
      startBeat,
      endBeat,
      marker: m === 4 ? 'Verse' : null,
      timeSig: [2, 4],
    });
    events.push({
      slot: m * 2,
      start: startBeat,
      duration: 1,
      stringIndex: 0,
      fret: m % 7,
      midi: 40 + (m % 7),
      pc: 4,
      techniques: [],
      dead: false,
    });
    events.push({
      slot: m * 2 + 1,
      start: startBeat + 1,
      duration: 1,
      stringIndex: 2,
      fret: (m + 3) % 9,
      midi: 50 + (m % 5),
      pc: 2,
      techniques: [],
      dead: false,
    });
  }
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    ],
    events,
    measures,
    tempo: 120,
    totalBeats: 32,
    slots: 32,
    techniqueCounts: {},
    warnings: [],
  };
}

const fullModel = make16BarModel();
const percModel = {
  events: fullModel.events.map((e) => ({
    slot: e.slot,
    start: e.start,
    duration: e.duration,
    instrument: 'kick',
    velocity: 0.9,
    midi: 36,
  })),
  measures: fullModel.measures.map((m) => ({ ...m })),
  tempo: 120,
  totalBeats: 32,
};

// bars 5–8 (0-based indices 4–7) → beats 8–16
const sliced = sliceModelByBeats(fullModel, { startBeat: 8, endBeat: 16 });
assert.equal(sliced.measures.length, 4);
assert.equal(sliced.totalBeats, 8);
assert.ok(sliced.events.length > 0);
assert.ok(sliced.events.every((e) => e.start >= -1e-6 && e.start < 8));
assert.ok(Math.abs(sliced.events[0].start) < 1e-6);
assert.ok(sliced.events.every((e) => e.start + 8 < 16 || e.start + 8 >= 8));
assert.ok(!sliced.events.some((e) => e.start + 8 < 8 - 1e-6));
assert.equal(sliced.tuning, 'Standard');
assert.deepEqual(sliced.strings.map((s) => s.note), ['E', 'A']);
assert.equal(sliced.tempo, 120);

const slicedPerc = sliceModelByBeats(percModel, { startBeat: 8, endBeat: 16 });
assert.equal(slicedPerc.measures.length, 4);
assert.equal(slicedPerc.totalBeats, 8);
assert.ok(slicedPerc.events.every((e) => e.start >= 0 && e.start < 8));

// isSegmentExercise
assert.equal(isSegmentExercise(null), false);
assert.equal(isSegmentExercise(undefined), false);
assert.equal(isSegmentExercise({ measureStart: 0, measureEnd: 0 }), false);
assert.equal(isSegmentExercise({ measureStart: 4, measureEnd: 7 }), true);

const gpResult = {
  tempo: 120,
  warnings: ['warn-a'],
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: fullModel.events.length,
    model: fullModel,
  }],
  drumTracks: [{
    index: 0,
    name: 'Drums',
    model: percModel,
  }],
};

const wholeItem = { measureStart: 0, measureEnd: 0 };
const whole = buildExerciseGpResult(gpResult, wholeItem);
assert.equal(whole.sliced, false);
assert.equal(whole.gp, gpResult);

const segmentItem = {
  measureStart: 4,
  measureEnd: 7,
  startBeat: 8,
  endBeat: 16,
};
const segment = buildExerciseGpResult(gpResult, segmentItem);
assert.equal(segment.sliced, true);
assert.notEqual(segment.gp, gpResult);
assert.equal(segment.gp.tempo, 120);
assert.deepEqual(segment.gp.warnings, ['warn-a']);
assert.equal(segment.gp.tracks[0].name, 'Guitar');
assert.equal(segment.gp.tracks[0].index, 0);
assert.equal(segment.gp.tracks[0].tuning, 'Standard');
assert.equal(segment.gp.tracks[0].model.measures.length, 4);
assert.equal(segment.gp.tracks[0].model.totalBeats, 8);
assert.equal(segment.gp.drumTracks[0].name, 'Drums');
assert.equal(segment.gp.drumTracks[0].model.measures.length, 4);
assert.equal(segment.gp.drumTracks[0].model.totalBeats, 8);

// derive beats from measure indices when startBeat/endBeat absent
const derived = buildExerciseGpResult(gpResult, { measureStart: 4, measureEnd: 7 });
assert.equal(derived.gp.tracks[0].model.totalBeats, 8);

// A range spanning every bar is not a segment — slicing it would be a no-op,
// and an empty/zero-length beat window must never produce an empty score.
const spanning = buildExerciseGpResult(gpResult, { measureStart: 0, measureEnd: 15 });
assert.equal(spanning.sliced, false, 'full-span range is not sliced');
assert.equal(spanning.gp, gpResult);

const degenerate = buildExerciseGpResult(gpResult, {
  measureStart: 0, measureEnd: 15, startBeat: 0, endBeat: 0,
});
assert.equal(degenerate.sliced, false, 'zero-length beat window is not sliced');
assert.equal(degenerate.gp.tracks[0].model.measures.length, 16);

// filterPracticeSettingsPatch
const fullPatch = {
  preferredTrackIndex: 1,
  loopEnabled: true,
  measureStart: 0,
  measureEnd: 3,
  startBeat: 0,
  endBeat: 8,
  loopRestSec: 2,
  bpm: 100,
  transpose: 2,
  tuning: 'Drop D',
  retuneMode: 'preserve',
};

assert.deepEqual(filterPracticeSettingsPatch(fullPatch, { sliced: false }), fullPatch);

const stripped = filterPracticeSettingsPatch(fullPatch, { sliced: true });
assert.equal(stripped.preferredTrackIndex, 1);
assert.equal(stripped.loopEnabled, true);
assert.equal(stripped.loopRestSec, 2);
assert.equal(stripped.bpm, 100);
assert.equal(stripped.transpose, 2);
assert.equal(stripped.tuning, 'Drop D');
assert.equal(stripped.retuneMode, 'preserve');
assert.equal('measureStart' in stripped, false);
assert.equal('measureEnd' in stripped, false);
assert.equal('startBeat' in stripped, false);
assert.equal('endBeat' in stripped, false);

// An absent bar range must persist as null, not collapse to bar 0 — a stored
// {0,0} window would slice a whole-score exercise down to nothing.
const { addGpExerciseFromAttachment } = await import('../../js/exercises.js');
const wholeStored = addGpExerciseFromAttachment({
  attachmentId: 'att-whole', name: 'Whole', fileName: 'whole.gp',
  type: 'application/x-guitar-pro', size: 10,
});
assert.equal(wholeStored.measureStart, null);
assert.equal(wholeStored.measureEnd, null);
assert.equal(wholeStored.startBeat, null);
assert.equal(wholeStored.endBeat, null);
assert.equal(isSegmentExercise(wholeStored), false);

const segmentStored = addGpExerciseFromAttachment({
  attachmentId: 'att-seg', name: 'Bars 5-8', fileName: 'seg.gp',
  type: 'application/x-guitar-pro', size: 10,
  measureStart: 4, measureEnd: 7, startBeat: 8, endBeat: 16,
});
assert.equal(segmentStored.measureStart, 4);
assert.equal(segmentStored.measureEnd, 7);
assert.equal(segmentStored.startBeat, 8);
assert.equal(segmentStored.endBeat, 16);
assert.equal(isSegmentExercise(segmentStored), true);

console.log('gp exercise slice: ok');
