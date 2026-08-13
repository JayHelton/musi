// Node tests for exercise score slicing and practice-settings persistence.
// Run: node tests/gp-player/exercise-slice.mjs

import assert from 'node:assert/strict';
import { sliceModelByBeats } from '../../js/tab/tabModel.js';
import {
  isSegmentExercise,
  buildExerciseGpResult,
  filterPracticeSettingsPatch,
  serializeExerciseScore,
  gpResultFromTabModelJson,
  sliceGpResultByBeats,
  segmentExerciseFileName,
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

// ---- serializeExerciseScore / gpResultFromTabModelJson round-trip ----
function makeSecondGuitarModel() {
  const model = make16BarModel();
  model.events = model.events.map((e) => ({ ...e, fret: (e.fret + 2) % 12 }));
  return model;
}

const multiGp = {
  tempo: 120,
  warnings: ['warn-b'],
  tracks: [
    {
      index: 0,
      name: 'Guitar 1',
      tuning: 'Standard',
      noteCount: fullModel.events.length,
      model: fullModel,
    },
    {
      index: 1,
      name: 'Guitar 2',
      tuning: 'Drop D',
      noteCount: makeSecondGuitarModel().events.length,
      model: makeSecondGuitarModel(),
    },
  ],
  drumTracks: [{
    index: 0,
    name: 'Drums',
    model: percModel,
  }],
};

const serialized = serializeExerciseScore(multiGp, {
  sourceFileName: 'solo.gp',
  measureStart: 4,
  measureEnd: 7,
});
const parsed = JSON.parse(serialized);
assert.equal(parsed.format, 'musi-tab-model');
assert.equal(parsed.version, 3);
assert.equal(parsed.tempo, 120);
assert.equal(parsed.tracks.length, 2);
assert.equal(parsed.drumTracks.length, 1);
assert.deepEqual(parsed.source, { fileName: 'solo.gp', measureStart: 4, measureEnd: 7 });
assert.equal(parsed.tracks[0].name, 'Guitar 1');
assert.equal(parsed.tracks[1].tuning, 'Drop D');
assert.equal(parsed.drumTracks[0].name, 'Drums');

const roundTrip = gpResultFromTabModelJson(parsed);
assert.equal(roundTrip.tempo, 120);
assert.deepEqual(roundTrip.warnings, ['warn-b']);
assert.equal(roundTrip.tracks.length, 2);
assert.equal(roundTrip.tracks[0].name, 'Guitar 1');
assert.equal(roundTrip.tracks[1].name, 'Guitar 2');
assert.equal(roundTrip.tracks[0].tuning, 'Standard');
assert.equal(roundTrip.tracks[1].tuning, 'Drop D');
assert.equal(roundTrip.tracks[0].noteCount, fullModel.events.length);
assert.equal(roundTrip.drumTracks.length, 1);
assert.equal(roundTrip.drumTracks[0].name, 'Drums');
assert.equal(roundTrip.tracks[0].model.measures.length, 16);
assert.equal(roundTrip.drumTracks[0].model.measures.length, 16);

// bars 5–8 slice: only 4 measures, no events outside window
const slicedMulti = sliceGpResultByBeats(multiGp, { startBeat: 8, endBeat: 16 });
const sliceJson = serializeExerciseScore(slicedMulti, {
  sourceFileName: 'solo.gp',
  measureStart: 4,
  measureEnd: 7,
});
const slicePayload = JSON.parse(sliceJson);
assert.equal(slicePayload.tracks[0].model.measures.length, 4);
assert.equal(slicePayload.tracks[1].model.measures.length, 4);
assert.equal(slicePayload.drumTracks[0].model.measures.length, 4);
for (const track of slicePayload.tracks) {
  assert.ok(track.model.events.every((e) => e.start >= -1e-6 && e.start < 8));
  assert.ok(!track.model.events.some((e) => e.start + 8 < 8 - 1e-6));
}
const sliceGp = gpResultFromTabModelJson(slicePayload);
assert.equal(sliceGp.tracks[0].model.measures.length, 4);
assert.equal(sliceGp.tracks[0].model.events[0].fret, 4 % 7);

// legacy single-track payload
const legacy = {
  tempo: 90,
  trackName: 'Lead',
  model: fullModel,
};
const legacyGp = gpResultFromTabModelJson(legacy);
assert.equal(legacyGp.tempo, 90);
assert.equal(legacyGp.tracks.length, 1);
assert.equal(legacyGp.tracks[0].name, 'Lead');
assert.equal(legacyGp.drumTracks.length, 0);

// bare model
const bareGp = gpResultFromTabModelJson(fullModel, { fallbackName: 'Bare' });
assert.equal(bareGp.tracks[0].name, 'Bare');

// junk throws documented error
assert.throws(
  () => gpResultFromTabModelJson({ tempo: 120 }),
  /This exercise snippet is missing tab data\./,
);
assert.throws(
  () => gpResultFromTabModelJson(null),
  /This exercise snippet is missing tab data\./,
);

// segment file names
assert.equal(segmentExerciseFileName('solo.gp', 'Bars 5-8'), 'solo - Bars 5-8.musi-tab.json');
assert.equal(segmentExerciseFileName('my/song!.gp5', 'Part A'), 'my song - Part A.musi-tab.json');
// An en dash must fold to a hyphen, not vanish — "Bars 9–12" becoming
// "Bars 912" reads like bar 912.
assert.equal(
  segmentExerciseFileName('seed.musi-tab.json', 'Bars 9\u201312'),
  'seed - Bars 9-12.musi-tab.json',
);
assert.equal(
  segmentExerciseFileName('solo.gp', 'Verse \u00b7 Bars 5\u20138'),
  'solo - Verse Bars 5-8.musi-tab.json',
);
const fnA = segmentExerciseFileName('score', 'Bars 1-4');
const fnB = segmentExerciseFileName('score', 'Bars 5-8');
assert.notEqual(fnA, fnB);
assert.ok(fnA.endsWith('.musi-tab.json'));
assert.ok(fnB.endsWith('.musi-tab.json'));

// ---- version 3 model fields through sliceModelByBeats ----
function makeExtendedModel() {
  const base = make16BarModel();
  base.tempoMap = [
    { barIndex: 0, beat: 0, bpm: 120, linear: false },
    { barIndex: 4, beat: 0, bpm: 100, linear: true },
  ];
  base.beats = [
    {
      measureIndex: 0,
      voiceIndex: 0,
      start: 0,
      duration: 1,
      noteValue: 4,
      dots: 0,
      tuplet: null,
      rest: false,
      noteIndices: [0],
    },
    {
      measureIndex: 4,
      voiceIndex: 1,
      start: 8,
      duration: 1,
      noteValue: 4,
      dots: 0,
      tuplet: null,
      rest: false,
      noteIndices: [8],
    },
  ];
  base.rests = [
    {
      measureIndex: 1,
      voiceIndex: 0,
      start: 2,
      duration: 1,
      noteValue: 4,
      dots: 0,
      tuplet: null,
    },
  ];
  base.trackInfo = {
    program: 27,
    midiChannel: 0,
    isPercussion: false,
    volume: 0.85,
    pan: -0.2,
    capo: 2,
  };
  base.voiceCount = 2;
  base.measures[0].repeat = { open: true, closeCount: null, endings: null };
  base.measures[3].repeat = { open: false, closeCount: 2, endings: null };
  base.measures[4].repeat = { open: false, closeCount: null, endings: [1] };
  base.events[0] = {
    ...base.events[0],
    voiceIndex: 0,
    beatIndex: 0,
    velocity: 0.65,
    tie: false,
    grace: true,
    graceTransition: 'slide',
    bend: { points: [{ offset: 0, cents: 100 }] },
    slideKind: 'shift',
  };
  base.events[8] = {
    ...base.events[8],
    voiceIndex: 1,
    beatIndex: 1,
    velocity: 0.9,
    tie: true,
    grace: false,
    graceTransition: null,
    bend: null,
    slideKind: 'legato',
  };
  return base;
}

const extended = makeExtendedModel();
const extendedSlice = sliceModelByBeats(extended, { startBeat: 8, endBeat: 16 });
assert.equal(extendedSlice.tempoMap.length, 1);
assert.equal(extendedSlice.tempoMap[0].barIndex, 0);
assert.equal(extendedSlice.tempoMap[0].bpm, 100);
assert.equal(extendedSlice.beats.length, 1);
assert.equal(extendedSlice.beats[0].voiceIndex, 1);
assert.equal(extendedSlice.beats[0].measureIndex, 0);
assert.equal(extendedSlice.rests.length, 0);
assert.deepEqual(extendedSlice.trackInfo, extended.trackInfo);
assert.equal(extendedSlice.voiceCount, 2);
assert.equal(extendedSlice.measures[0].repeat.endings[0], 1);
const slicedEvent = extendedSlice.events.find((e) => e.tie);
assert.ok(slicedEvent);
assert.equal(slicedEvent.voiceIndex, 1);
assert.equal(slicedEvent.beatIndex, 0);
assert.equal(slicedEvent.velocity, 0.9);
assert.equal(slicedEvent.tie, true);
assert.equal(slicedEvent.grace, false);
assert.equal(slicedEvent.graceTransition, null);
assert.equal(slicedEvent.slideKind, 'legato');
assert.equal(slicedEvent.bend, null);

// version 2 record loads without new fields (legacy behaviour)
const v2Payload = {
  format: 'musi-tab-model',
  version: 2,
  tempo: 120,
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    model: make16BarModel(),
  }],
  drumTracks: [],
  warnings: ['legacy-warn'],
};
const v2Gp = gpResultFromTabModelJson(v2Payload);
assert.equal(v2Gp.tempo, 120);
assert.deepEqual(v2Gp.warnings, ['legacy-warn']);
assert.equal(v2Gp.tracks[0].model.measures.length, 16);
assert.equal(v2Gp.tracks[0].model.tempoMap, undefined);
assert.equal(v2Gp.tracks[0].model.beats, undefined);
assert.equal(v2Gp.tracks[0].model.voiceCount, undefined);

// version 3 round-trip keeps extended fields
const extendedGp = {
  tempo: 120,
  warnings: ['ext-warn'],
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: extended.events.length,
    model: extended,
  }],
  drumTracks: [],
};
const v3Json = serializeExerciseScore(extendedGp);
const v3Payload = JSON.parse(v3Json);
assert.equal(v3Payload.version, 3);
assert.ok(v3Payload.tracks[0].model.tempoMap);
assert.ok(v3Payload.tracks[0].model.beats);
assert.ok(v3Payload.tracks[0].model.rests);
assert.ok(v3Payload.tracks[0].model.trackInfo);
assert.equal(v3Payload.tracks[0].model.voiceCount, 2);
assert.equal(v3Payload.tracks[0].model.events[0].grace, true);
const v3Gp = gpResultFromTabModelJson(v3Payload);
assert.deepEqual(v3Gp.warnings, ['ext-warn']);
assert.equal(v3Gp.tracks[0].model.events[0].bend.points[0].cents, 100);
assert.equal(v3Gp.tracks[0].model.events[0].slideKind, 'shift');

console.log('gp exercise slice: ok');
