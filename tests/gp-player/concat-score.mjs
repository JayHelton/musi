// Node tests for score concatenation helpers.
// Run: node tests/gp-player/concat-score.mjs

import assert from 'node:assert/strict';
import { concatModels } from '../../js/tab/tabModel.js';
import { concatGpResults } from '../../js/gpExerciseScore.js';

function make4BarModel({ tempo = 120, startFret = 0, warnings = [] } = {}) {
  const measures = [];
  const events = [];
  for (let m = 0; m < 4; m++) {
    const startBeat = m * 4;
    const endBeat = startBeat + 4;
    measures.push({
      startSlot: m,
      endSlot: m + 1,
      startBeat,
      endBeat,
      timeSig: [4, 4],
    });
    events.push({
      slot: m,
      start: startBeat,
      duration: 1,
      stringIndex: 0,
      fret: startFret + m,
      midi: 40 + m,
      pc: 4,
      techniques: [],
      dead: false,
    });
  }
  return {
    tuning: 'Standard',
    strings: [{ note: 'E', oct: 2, label: 'E', openMidi: 40 }],
    events,
    measures,
    tempo,
    totalBeats: 16,
    slots: 4,
    techniqueCounts: {},
    warnings: warnings.slice(),
  };
}

const first = make4BarModel({ startFret: 0 });
const second = make4BarModel({ startFret: 5 });

// ---- concatModels: two 4-bar models ----
const joined = concatModels([first, second]);
assert.equal(joined.totalBeats, 32);
assert.equal(joined.measures.length, 8);
assert.equal(joined.events.length, 8);

const secondPartEvents = joined.events.filter((e) => e.start >= 16);
assert.equal(secondPartEvents.length, 4);
assert.ok(secondPartEvents.every((e) => e.start >= 16));
assert.equal(secondPartEvents[0].start, 16);
assert.equal(secondPartEvents[0].fret, 5);

// inputs are not mutated
const firstSnap = JSON.stringify(first);
const secondSnap = JSON.stringify(second);
concatModels([first, second]);
assert.equal(JSON.stringify(first), firstSnap);
assert.equal(JSON.stringify(second), secondSnap);

// empty / null list
assert.equal(concatModels(null), null);
assert.equal(concatModels([]), null);
assert.equal(concatModels([null, undefined]), null);

// tempo map boundary when tempos differ (120 then 90)
const slow = make4BarModel({ tempo: 90 });
const tempoJoined = concatModels([first, slow]);
assert.ok(tempoJoined.tempoMap);
const boundary = tempoJoined.tempoMap.find(
  (t) => t.barIndex === 4 && t.beat === 0,
);
assert.ok(boundary);
assert.equal(boundary.bpm, 90);
assert.equal(boundary.linear, false);

// ---- concatGpResults: two one-track results ----
const gpA = {
  tempo: 120,
  warnings: ['warn-a'],
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: first.events.length,
    model: first,
  }],
  drumTracks: [],
};

const gpB = {
  tempo: 120,
  warnings: ['warn-b'],
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: second.events.length,
    model: second,
  }],
  drumTracks: [],
};

const gpJoined = concatGpResults([gpA, gpB]);
assert.equal(gpJoined.tempo, 120);
assert.equal(gpJoined.tracks.length, 1);
assert.equal(gpJoined.tracks[0].model.totalBeats, 32);
assert.equal(gpJoined.tracks[0].model.measures.length, 8);
assert.equal(gpJoined.tracks[0].name, 'Guitar');
assert.equal(gpJoined.tracks[0].noteCount, 8);
assert.deepEqual(gpJoined.warnings, ['warn-a', 'warn-b']);

// ---- concatGpResults: pad missing second guitar track ----
const twoTrackModel = make4BarModel({ startFret: 2 });
const guitar2Model = make4BarModel({ startFret: 7 });

const gpTwoTracks = {
  tempo: 120,
  warnings: [],
  tracks: [
    {
      index: 0,
      name: 'Guitar 1',
      tuning: 'Standard',
      noteCount: twoTrackModel.events.length,
      model: twoTrackModel,
    },
    {
      index: 1,
      name: 'Guitar 2',
      tuning: 'Drop D',
      noteCount: guitar2Model.events.length,
      model: guitar2Model,
    },
  ],
  drumTracks: [],
};

const gpOneTrack = {
  tempo: 120,
  warnings: [],
  tracks: [{
    index: 0,
    name: 'Lead',
    tuning: 'Standard',
    noteCount: first.events.length,
    model: first,
  }],
  drumTracks: [],
};

const padded = concatGpResults([gpTwoTracks, gpOneTrack]);
assert.equal(padded.tracks.length, 2);
assert.equal(padded.tracks[0].model.totalBeats, 32);
assert.equal(padded.tracks[0].model.measures.length, 8);
assert.equal(padded.tracks[1].model.totalBeats, 32);
assert.equal(padded.tracks[1].model.measures.length, 8);
assert.equal(padded.tracks[1].name, 'Guitar 2');
assert.equal(padded.tracks[1].tuning, 'Drop D');
// second part had no guitar 2 — pad track stays empty for that half
const g2SecondHalf = padded.tracks[1].model.events.filter((e) => e.start >= 16);
assert.equal(g2SecondHalf.length, 0);

// ---- single-result concatGpResults returns a usable copy ----
const single = concatGpResults([gpA]);
assert.notEqual(single, gpA);
assert.notEqual(single.tracks, gpA.tracks);
assert.notEqual(single.tracks[0], gpA.tracks[0]);
assert.equal(single.tracks[0].model, gpA.tracks[0].model);
assert.equal(single.tempo, 120);
assert.deepEqual(single.warnings, ['warn-a']);
assert.equal(single.tracks[0].name, 'Guitar');

assert.equal(concatGpResults(null), null);
assert.equal(concatGpResults([]), null);

console.log('gp concat score: ok');
