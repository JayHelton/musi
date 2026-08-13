// The metronome click must follow every tempo change in the score.
// Run: node tests/gp-player/metro-tempo-map.mjs
//
// A practice click track steps its tempo: four measures at 80 BPM, four at
// 90 BPM, four at 100 BPM, and so on. The engine used to place each click
// with one scalar tempo, so the click drifted away from the score at the
// first tempo change and never came back.
//
// This suite builds that score, collects the click times, and compares them
// against the tempo map.

import assert from 'node:assert/strict';
import { buildPlayOrder } from '../../js/tab/playOrder.js';
import { buildTimeline } from '../../js/tab/scoreTimeline.js';

const STEPS = [80, 90, 100, 110];
const BARS_PER_STEP = 4;
const BEATS_PER_BAR = 4;

function makeMeasures() {
  const measures = [];
  for (let bar = 0; bar < STEPS.length * BARS_PER_STEP; bar += 1) {
    measures.push({
      startSlot: bar * BEATS_PER_BAR,
      endSlot: bar * BEATS_PER_BAR + BEATS_PER_BAR,
      startBeat: bar * BEATS_PER_BAR,
      endBeat: bar * BEATS_PER_BAR + BEATS_PER_BAR,
      timeSig: [4, 4],
    });
  }
  return measures;
}

function makeTempoMap() {
  return STEPS.map((bpm, step) => ({
    barIndex: step * BARS_PER_STEP,
    beat: 0,
    bpm,
    linear: false,
  }));
}

const measures = makeMeasures();
const tempoMap = makeTempoMap();
const timeline = buildTimeline({
  playOrder: buildPlayOrder(measures),
  tempoMap,
  baseBpm: STEPS[0],
  rate: 1,
  tracks: { guitarModels: [], drumModels: [] },
});

// The timeline must expose the quarter to seconds mapping that the click uses.
assert.equal(typeof timeline.secondsAtQuarter, 'function', 'secondsAtQuarter exists');
assert.equal(typeof timeline.quarterAtSeconds, 'function', 'quarterAtSeconds exists');
assert.equal(typeof timeline.barStartQuarters, 'function', 'barStartQuarters exists');

// Each step holds 16 quarters. Work out the reference seconds by hand.
const quartersPerStep = BARS_PER_STEP * BEATS_PER_BAR;
let refSec = 0;
const stepStartSec = [];
for (const bpm of STEPS) {
  stepStartSec.push(refSec);
  refSec += quartersPerStep * (60 / bpm);
}

for (let step = 0; step < STEPS.length; step += 1) {
  const quarter = step * quartersPerStep;
  const actual = timeline.secondsAtQuarter(quarter);
  assert.ok(
    Math.abs(actual - stepStartSec[step]) < 1e-6,
    `step ${step + 1} starts at ${stepStartSec[step]} s, got ${actual}`,
  );
}

// Every click inside one step must be spaced by that step's beat length.
for (let step = 0; step < STEPS.length; step += 1) {
  const expectedSpacing = 60 / STEPS[step];
  for (let beat = 0; beat < quartersPerStep - 1; beat += 1) {
    const q = step * quartersPerStep + beat;
    const spacing = timeline.secondsAtQuarter(q + 1) - timeline.secondsAtQuarter(q);
    assert.ok(
      Math.abs(spacing - expectedSpacing) < 1e-6,
      `at ${STEPS[step]} BPM a beat must last ${expectedSpacing} s, got ${spacing}`,
    );
  }
}

// A scalar tempo would place the last click here. The real time is different,
// which is the drift a learner hears. Confirm the two disagree, so this suite
// fails again if the engine goes back to one scalar tempo.
const lastQuarter = STEPS.length * quartersPerStep - 1;
const scalarSec = lastQuarter * (60 / STEPS[0]);
const trueSec = timeline.secondsAtQuarter(lastQuarter);
assert.ok(
  Math.abs(scalarSec - trueSec) > 1,
  'the scalar tempo and the tempo map must differ on a stepped click track',
);

// The round trip must hold at every step boundary.
for (let step = 0; step < STEPS.length; step += 1) {
  const q = step * quartersPerStep;
  const sec = timeline.secondsAtQuarter(q);
  assert.ok(
    Math.abs(timeline.quarterAtSeconds(sec) - q) < 1e-6,
    `quarter ${q} must round trip through seconds`,
  );
}

// The practice rate scales every step by the same factor.
const slow = timeline.withRate(0.5);
for (let step = 0; step < STEPS.length; step += 1) {
  const q = step * quartersPerStep;
  assert.ok(
    Math.abs(slow.secondsAtQuarter(q) - stepStartSec[step] / 0.5) < 1e-6,
    `rate must scale step ${step + 1} by the same factor`,
  );
}

// The bar starts drive the click accent, so one entry per sounding bar.
const barStarts = timeline.barStartQuarters();
assert.equal(barStarts.length, measures.length, 'one bar start for each bar');
assert.equal(barStarts[0], 0, 'the first bar starts at quarter 0');
assert.equal(barStarts[1], BEATS_PER_BAR, 'the second bar starts one bar later');

console.log('gp-player metro tempo map: ok');
