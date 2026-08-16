import assert from 'node:assert/strict';
import {
  METRO_MAX_STEPS,
  METRO_PROGRESSIONS,
  describeMetronomePlan,
  formatMetroDuration,
  metroClicksPerBeat,
  metronomePlanSteps,
  metronomePlanTotalSeconds,
  metronomeStepAt,
  normalizeMetroBeats,
  normalizeMetroBpm,
  normalizeMetroProgression,
  normalizeMetroStepSeconds,
  normalizeMetroSteps,
  normalizeMetroSubdiv,
} from '../../js/exerciseCompanions/metronomePlan.js';

// --- normalization ---------------------------------------------------------

assert.deepEqual(
  METRO_PROGRESSIONS.map((p) => p.id),
  ['steady', 'ramp', 'pyramid', 'ladder', 'burst', 'custom'],
);

assert.equal(normalizeMetroProgression('ramp'), 'ramp');
assert.equal(normalizeMetroProgression('nope'), 'steady');
assert.equal(normalizeMetroProgression(undefined), 'steady');

assert.equal(normalizeMetroSubdiv('triplet'), 'triplet');
assert.equal(normalizeMetroSubdiv('half'), 'quarter');
assert.equal(metroClicksPerBeat('sixteenth'), 4);
assert.equal(metroClicksPerBeat('bad'), 1);

assert.equal(normalizeMetroBpm(500), 300);
assert.equal(normalizeMetroBpm(2), 30);
assert.equal(normalizeMetroBpm('118'), 118);
assert.equal(normalizeMetroBpm('abc'), 90);
assert.equal(normalizeMetroStepSeconds(1), 5);
assert.equal(normalizeMetroStepSeconds(99999), 3600);
assert.equal(normalizeMetroBeats(0), 1);
assert.equal(normalizeMetroBeats(99), 12);

const cleanedSteps = normalizeMetroSteps([
  { seconds: 30, bpm: 80, subdiv: 'eighth' },
  { seconds: 'x', bpm: 90 },
  null,
  { seconds: 45, bpm: 4000, subdiv: 'nope' },
]);
assert.equal(cleanedSteps.length, 2);
assert.deepEqual(cleanedSteps[0], { seconds: 30, bpm: 80, subdiv: 'eighth' });
assert.deepEqual(cleanedSteps[1], { seconds: 45, bpm: 300, subdiv: 'quarter' });
assert.equal(normalizeMetroSteps('not a list').length, 0);

// --- steady ----------------------------------------------------------------

assert.deepEqual(metronomePlanSteps({ progression: 'steady', startBpm: 100 }), []);

// --- ramp ------------------------------------------------------------------

const ramp = metronomePlanSteps({
  progression: 'ramp',
  startBpm: 80,
  targetBpm: 100,
  stepBpm: 5,
  stepSeconds: 60,
  subdiv: 'quarter',
});
assert.deepEqual(ramp.map((s) => s.bpm), [80, 85, 90, 95, 100]);
assert.ok(ramp.every((s) => s.seconds === 60 && s.subdiv === 'quarter'));
assert.equal(metronomePlanTotalSeconds(ramp), 300);

// An increment that overshoots still finishes exactly on the target tempo.
const rampOvershoot = metronomePlanSteps({
  progression: 'ramp',
  startBpm: 80,
  targetBpm: 100,
  stepBpm: 15,
  stepSeconds: 30,
});
assert.deepEqual(rampOvershoot.map((s) => s.bpm), [80, 95, 100]);

// Ramps run downward too.
const rampDown = metronomePlanSteps({
  progression: 'ramp',
  startBpm: 120,
  targetBpm: 100,
  stepBpm: 10,
  stepSeconds: 30,
});
assert.deepEqual(rampDown.map((s) => s.bpm), [120, 110, 100]);

// Equal start and target collapse to one step.
const rampFlat = metronomePlanSteps({
  progression: 'ramp',
  startBpm: 90,
  targetBpm: 90,
  stepBpm: 5,
  stepSeconds: 30,
});
assert.deepEqual(rampFlat.map((s) => s.bpm), [90]);

// A very wide ramp stays inside the step cap.
const rampCapped = metronomePlanSteps({
  progression: 'ramp',
  startBpm: 30,
  targetBpm: 300,
  stepBpm: 1,
  stepSeconds: 30,
});
assert.equal(rampCapped.length, METRO_MAX_STEPS);

// --- pyramid ---------------------------------------------------------------

const pyramid = metronomePlanSteps({
  progression: 'pyramid',
  startBpm: 80,
  targetBpm: 95,
  stepBpm: 5,
  stepSeconds: 30,
});
assert.deepEqual(pyramid.map((s) => s.bpm), [80, 85, 90, 95, 90, 85, 80]);

// --- ladder ----------------------------------------------------------------

const ladder = metronomePlanSteps({
  progression: 'ladder',
  startBpm: 70,
  stepSeconds: 45,
});
assert.deepEqual(ladder.map((s) => s.subdiv), ['quarter', 'eighth', 'triplet', 'sixteenth']);
assert.ok(ladder.every((s) => s.bpm === 70 && s.seconds === 45));

// --- burst -----------------------------------------------------------------

const burst = metronomePlanSteps({
  progression: 'burst',
  startBpm: 90,
  targetBpm: 130,
  stepSeconds: 20,
  rounds: 3,
  subdiv: 'eighth',
});
assert.deepEqual(burst.map((s) => s.bpm), [90, 130, 90, 130, 90, 130]);
assert.ok(burst.every((s) => s.subdiv === 'eighth'));

// --- custom ----------------------------------------------------------------

const custom = metronomePlanSteps({
  progression: 'custom',
  steps: [
    { seconds: 60, bpm: 70, subdiv: 'quarter' },
    { seconds: 90, bpm: 85, subdiv: 'triplet' },
    { seconds: 10, bpm: 0 },
  ],
});
assert.equal(custom.length, 3);
assert.equal(custom[2].bpm, 30);
assert.equal(metronomePlanTotalSeconds(custom), 160);

// --- step lookup -----------------------------------------------------------

const lookupSteps = [
  { seconds: 10, bpm: 80, subdiv: 'quarter' },
  { seconds: 20, bpm: 90, subdiv: 'eighth' },
];
assert.equal(metronomeStepAt(lookupSteps, 0).index, 0);
assert.equal(metronomeStepAt(lookupSteps, 9.5).index, 0);
assert.equal(metronomeStepAt(lookupSteps, 10).index, 1);
assert.equal(metronomeStepAt(lookupSteps, 10).startedAt, 10);
assert.equal(metronomeStepAt(lookupSteps, 15).remaining, 15);
assert.equal(metronomeStepAt(lookupSteps, 29.9).index, 1);
// A finished plan reports null unless it loops.
assert.equal(metronomeStepAt(lookupSteps, 30), null);
assert.equal(metronomeStepAt(lookupSteps, 65), null);
assert.equal(metronomeStepAt(lookupSteps, 30, { loop: true }).index, 0);
assert.equal(metronomeStepAt(lookupSteps, 45, { loop: true }).index, 1);
assert.equal(metronomeStepAt([], 5), null);
assert.equal(metronomeStepAt(lookupSteps, -3).index, 0);

// --- formatting ------------------------------------------------------------

assert.equal(formatMetroDuration(0), '0:00');
assert.equal(formatMetroDuration(9), '0:09');
assert.equal(formatMetroDuration(60), '1:00');
assert.equal(formatMetroDuration(605), '10:05');
assert.equal(formatMetroDuration(3661), '1:01:01');

assert.match(
  describeMetronomePlan({ progression: 'steady', startBpm: 100, subdiv: 'eighth' }),
  /Steady tempo · 100 BPM · 8ths/,
);
assert.match(
  describeMetronomePlan({
    progression: 'ramp',
    startBpm: 80,
    targetBpm: 100,
    stepBpm: 5,
    stepSeconds: 60,
  }),
  /Step up · 80–100 BPM · 5 steps · 5:00/,
);
// A custom plan with no steps reads as a held tempo, not an empty plan.
assert.match(
  describeMetronomePlan({ progression: 'custom', startBpm: 95, steps: [] }),
  /95 BPM/,
);

console.log('companions metronome plan: ok');
