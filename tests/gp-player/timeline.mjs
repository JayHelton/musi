// Timeline builder tests for tempo map, events, and position lookup.
// Run: node tests/gp-player/timeline.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import { buildPlayOrder } from '../../js/tab/playOrder.js';
import { buildTimeline } from '../../js/tab/scoreTimeline.js';
import { makeFixtures } from './fixtures/makeFixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');

function fixtureBytes(name) {
  return readFileSync(join(FIXTURE_DIR, name));
}

function ensureFixtures() {
  if (!existsSync(join(FIXTURE_DIR, 'tempo-change.gp5'))) {
    makeFixtures();
  }
}

function makeExampleMeasures() {
  return Array.from({ length: 8 }, (_, i) => ({
    startSlot: i,
    endSlot: i + 1,
    startBeat: i * 4,
    endBeat: (i + 1) * 4,
    repeat:
      i === 1
        ? { open: true, closeCount: null, endings: null }
        : i === 3
          ? { open: false, closeCount: 2, endings: null }
          : i === 4
            ? { open: false, closeCount: null, endings: [1] }
            : i === 5
              ? { open: false, closeCount: null, endings: [2] }
              : null,
  }));
}

function withinPct(actual, expected, pct = 1) {
  const tol = Math.abs(expected) * (pct / 100);
  return Math.abs(actual - expected) <= tol;
}

ensureFixtures();

// Empty play order yields zero duration.
const emptyTimeline = buildTimeline({
  playOrder: buildPlayOrder([]),
  tempoMap: [],
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [], drumModels: [] },
});
assert.equal(emptyTimeline.totalSec, 0);
assert.equal(emptyTimeline.events.length, 0);

// Data-model worked example — tempo segments and total seconds.
const exampleMeasures = makeExampleMeasures();
const examplePlayOrder = buildPlayOrder(exampleMeasures);
const exampleTempoMap = [
  { barIndex: 0, beat: 0, bpm: 120, linear: false },
  { barIndex: 6, beat: 0, bpm: 90, linear: false },
];
const exampleTimeline = buildTimeline({
  playOrder: examplePlayOrder,
  tempoMap: exampleTempoMap,
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [], drumModels: [] },
});
// The play order holds 11 passes and 44 quarters: bars 0 to 3, ending 1,
// bars 1 to 3, ending 2, then bars 6 and 7. Segment A runs 36 quarters at
// 120 BPM, which is 18 s. Segment B runs 8 quarters at 90 BPM, which is
// 5.333 s. The total is 23.333 s.
assert.equal(exampleTimeline.tempoSegments.length, 2, 'two tempo segments');
assert.equal(exampleTimeline.tempoSegments[0].bpm, 120);
assert.equal(exampleTimeline.tempoSegments[0].startQuarter, 0);
assert.equal(exampleTimeline.tempoSegments[1].bpm, 90);
assert.equal(exampleTimeline.tempoSegments[1].startQuarter, 36);
const refTotalSec = 36 * (60 / 120) + 8 * (60 / 90);
assert.ok(
  withinPct(exampleTimeline.totalSec, refTotalSec),
  `totalSec ${exampleTimeline.totalSec} within 1% of ${refTotalSec}`,
);
assert.equal(exampleTimeline.passes[9].startSec, 18);
assert.ok(withinPct(exampleTimeline.passes[9].endSec, 20.667, 0.5));

// Tempo at bar 6 applies on every pass — bar 6 only once here at quarter 48.
const bar6Pass = exampleTimeline.passes.find((p) => p.barIndex === 6);
assert.ok(bar6Pass);
assert.ok(withinPct(bar6Pass.endSec - bar6Pass.startSec, 2.667, 0.5));

// rate zero or negative counts as 1.
const rateTimeline = buildTimeline({
  playOrder: examplePlayOrder,
  tempoMap: exampleTempoMap,
  baseBpm: 120,
  rate: 0,
  tracks: { guitarModels: [], drumModels: [] },
});
assert.equal(rateTimeline.rate, 1);
assert.equal(rateTimeline.totalSec, exampleTimeline.totalSec);

// withRate scales playback time at current rate.
const slow = exampleTimeline.withRate(0.5);
const pos = slow.positionAtSeconds(slow.totalSec);
assert.ok(pos.sec > exampleTimeline.totalSec, 'slower rate stretches wall seconds');

// loopWindow uses written bar indices (first pass only).
const loop = exampleTimeline.loopWindow({ startBarIndex: 1, endBarIndex: 2 });
assert.ok(loop.startSec >= 0);
assert.ok(loop.endSec > loop.startSec);
const badLoop = exampleTimeline.loopWindow({ startBarIndex: 5, endBarIndex: 1 });
assert.deepEqual(badLoop, { startSec: 0, endSec: 0 });

// loop inside repeat does not jump to repeat target.
const loopInRepeat = exampleTimeline.loopWindow({ startBarIndex: 1, endBarIndex: 2 });
assert.ok(withinPct(loopInRepeat.endSec - loopInRepeat.startSec, 4, 1));

// positionAtSeconds and secondsAtPosition round-trip.
const midSec = exampleTimeline.secondsAtPosition({
  barIndex: 2,
  beatInBar: 0,
  passIndex: 0,
});
const midPos = exampleTimeline.positionAtSeconds(midSec);
assert.ok(withinPct(midPos.sec, midSec, 0.01));
assert.equal(midPos.barIndex, 2);
assert.equal(midPos.passIndex, 0);
assert.equal(midPos.beatInBar, 0);

// Fixture: tempo-change.gp5 — total seconds within 1%.
const tempoGp5 = await parseGuitarPro(fixtureBytes('tempo-change.gp5'));
const tempoModel = tempoGp5.tracks[0].model;
const tempoPlayOrder = buildPlayOrder(tempoModel.measures);
const tempoTimeline = buildTimeline({
  playOrder: tempoPlayOrder,
  tempoMap: tempoModel.tempoMap,
  baseBpm: tempoGp5.tempo,
  rate: 1,
  tracks: { guitarModels: [tempoModel], drumModels: [] },
});
const tempoRefSec = 8 * (60 / 90) + 8 * (60 / 140);
assert.ok(
  withinPct(tempoTimeline.totalSec, tempoRefSec),
  `tempo-change totalSec ${tempoTimeline.totalSec} within 1% of ${tempoRefSec}`,
);

// Fixture: nested-repeat.gp5 — flattened play order in timeline warnings.
const nested = await parseGuitarPro(fixtureBytes('nested-repeat.gp5'));
const nestedModel = nested.tracks[0].model;
const nestedPlayOrder = buildPlayOrder(nestedModel.measures);
const nestedTimeline = buildTimeline({
  playOrder: nestedPlayOrder,
  tempoMap: nestedModel.tempoMap,
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [nestedModel], drumModels: [] },
});
assert.equal(nestedPlayOrder.flattened, true);
assert.ok(nestedTimeline.warnings.some((w) => w.toLowerCase().includes('flatten')));

// Fixture: two-voices.gp5 — both voices schedule events.
const voicesGp5 = await parseGuitarPro(fixtureBytes('two-voices.gp5'));
const voicesModel = voicesGp5.tracks[0].model;
const voicesPlayOrder = buildPlayOrder(voicesModel.measures);
const voicesTimeline = buildTimeline({
  playOrder: voicesPlayOrder,
  tempoMap: voicesModel.tempoMap,
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [voicesModel], drumModels: [] },
});
const voiceIdx = new Set(voicesTimeline.events.map((e) => e.voiceIndex));
assert.ok(voiceIdx.has(0), 'voice 0 events');
assert.ok(voiceIdx.has(1), 'voice 1 events');
assert.equal(voicesTimeline.events.length, 4);

// Fixture: ties-rhythm.gp5 — tie merge and rests add no events.
const tiesGp5 = await parseGuitarPro(fixtureBytes('ties-rhythm.gp5'));
const tiesModel = tiesGp5.tracks[0].model;
const tiesPlayOrder = buildPlayOrder(tiesModel.measures);
const tiesTimeline = buildTimeline({
  playOrder: tiesPlayOrder,
  tempoMap: tiesModel.tempoMap,
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [tiesModel], drumModels: [] },
});
// Bar 1 holds a half note, three eighth triplets, and a quarter note that ties
// into bar 2. Bar 2 holds the tied tail, a dotted quarter, and two rests.
// Six notes sound. The tied tail adds no event of its own.
assert.equal(tiesTimeline.events.length, 6, 'tie chain merges to six sounding events');
assert.equal(tiesModel.events.filter((e) => e.tie).length, 1, 'one tied tail in the model');
// The tie joins a quarter and a quarter, so the note holds two quarters.
const tiedEvent = tiesTimeline.events.find((e) => e.barIndex === 0 && e.midi === 43);
assert.ok(tiedEvent, 'tied event present');
assert.ok(withinPct(tiedEvent.durSec, 1, 0.01), `tied length ${tiedEvent.durSec} is two quarters`);
// The dotted quarter holds 1.5 quarters, which is 0.75 s at 120 BPM.
const dotted = tiesTimeline.events.find((e) => e.barIndex === 1);
assert.ok(withinPct(dotted.durSec, 0.75, 0.01), `dotted length ${dotted.durSec}`);
// The triplet eighths each hold one third of a quarter.
const triplets = tiesTimeline.events.filter((e) => withinPct(e.durSec, 1 / 6, 1));
assert.equal(triplets.length, 3, 'three triplet eighths');
// The two rests add no event, and the score still runs the full 8 quarters.
assert.equal(tiesModel.rests.length, 2, 'two written rests');
assert.ok(withinPct(tiesTimeline.totalSec, 4, 0.01), 'rests keep their written length');

// Grace note sounds before main note (techniques.gp5).
const techGp5 = await parseGuitarPro(fixtureBytes('techniques.gp5'));
const techModel = techGp5.tracks[0].model;
const techPlayOrder = buildPlayOrder(techModel.measures);
const techTimeline = buildTimeline({
  playOrder: techPlayOrder,
  tempoMap: techModel.tempoMap,
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [techModel], drumModels: [] },
});
const graceEv = techTimeline.events.find((e) => e.midi === 59);
const mainEv = techTimeline.events.find((e) => e.midi === 60);
assert.ok(graceEv && mainEv, 'grace and main events');
assert.ok(graceEv.startSec < mainEv.startSec, 'grace before main');

// tempoMap past score end — skip with warning.
const pastPlayOrder = buildPlayOrder([
  { startSlot: 0, endSlot: 1, startBeat: 0, endBeat: 4 },
]);
const pastTimeline = buildTimeline({
  playOrder: pastPlayOrder,
  tempoMap: [{ barIndex: 9, beat: 0, bpm: 100, linear: false }],
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [], drumModels: [] },
});
assert.ok(
  pastTimeline.warnings.some((w) => w.toLowerCase().includes('bar 9')),
  'past score end warning',
);

// events[] fallback when beats absent.
const legacyModel = {
  tuning: 'Standard',
  strings: [{ note: 'E', oct: 2, label: 'E', openMidi: 40 }],
  events: [{
    slot: 0,
    stringIndex: 0,
    fret: 0,
    midi: 40,
    pc: 4,
    dead: false,
    start: 0,
    duration: 1,
    techniques: [],
  }],
  measures: [{ startSlot: 0, endSlot: 1, startBeat: 0, endBeat: 4 }],
  tempo: 120,
  totalBeats: 4,
  slots: 1,
  techniqueCounts: {},
  warnings: [],
};
const legacyTimeline = buildTimeline({
  playOrder: buildPlayOrder(legacyModel.measures),
  tempoMap: [],
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [legacyModel], drumModels: [] },
});
assert.equal(legacyTimeline.events.length, 1);
assert.equal(legacyTimeline.warnings.filter((w) => w.includes('beats')).length, 0);

// Beats without noteIndices fall back to model.events.
const beatFallbackModel = {
  percussion: true,
  beats: [{
    measureIndex: 0,
    voiceIndex: 0,
    start: 0,
    duration: 1,
    rest: false,
    noteIndices: [],
    techniques: [],
  }],
  events: [{
    start: 0,
    duration: 1,
    midi: 36,
    velocity: 0.8,
    instrument: 'kick',
    dead: false,
  }],
  measures: [{ startSlot: 0, endSlot: 1, startBeat: 0, endBeat: 4 }],
  tempo: 120,
  totalBeats: 4,
  slots: 1,
  warnings: [],
};
const beatFallbackTimeline = buildTimeline({
  playOrder: buildPlayOrder(beatFallbackModel.measures),
  tempoMap: [],
  baseBpm: 120,
  rate: 1,
  tracks: { guitarModels: [], drumModels: [beatFallbackModel] },
});
assert.equal(beatFallbackTimeline.events.length, 1);
assert.equal(beatFallbackTimeline.events[0].instrument, 'kick');

console.log('gp-player timeline: ok');
