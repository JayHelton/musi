// Loop bounds must rescale when tempo changes via setBpm / setRate.
// Run: node tests/gp-player/tempo-rate-loop.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

function makeAudioParam(value = 0) {
  return {
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}

function makeAudioNode() {
  return {
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    frequency: makeAudioParam(440),
    gain: makeAudioParam(1),
    threshold: makeAudioParam(-24),
    knee: makeAudioParam(30),
    ratio: makeAudioParam(12),
    attack: makeAudioParam(0.003),
    release: makeAudioParam(0.25),
    fftSize: 2048,
  };
}

function installAudioStub() {
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.destination = makeAudioNode();
    }
    get currentTime() { return this._time; }
    resume() { return Promise.resolve(); }
    createGain() { return makeAudioNode(); }
    createOscillator() { return makeAudioNode(); }
    createDynamicsCompressor() { return makeAudioNode(); }
    createAnalyser() { return makeAudioNode(); }
  }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;
}

function installLocalStorageStub() {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

installDomShim();
installAudioStub();
installLocalStorageStub();

const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');
const { quartersToSeconds } = await import('../../js/tab/tabModel.js');

const events = [];
for (let beat = 0; beat < 16; beat += 1) {
  events.push({
    slot: beat,
    start: beat,
    duration: 1,
    stringIndex: 0,
    fret: beat % 5,
    midi: 40 + (beat % 5),
    pc: 4,
    techniques: [],
    dead: false,
  });
}

const model = {
  tuning: 'Standard',
  strings: [
    { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    { note: 'D', oct: 3, label: 'D', openMidi: 50 },
    { note: 'G', oct: 3, label: 'G', openMidi: 55 },
    { note: 'B', oct: 3, label: 'B', openMidi: 59 },
    { note: 'E', oct: 4, label: 'E', openMidi: 64 },
  ],
  events,
  measures: [
    { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 },
    { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8 },
    { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12 },
    { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16 },
  ],
  tempo: 120,
  totalBeats: 16,
};

const TOL = 0.05;
const lastBar = model.measures.length - 1;

const player = createGpMixPlayer();
player.load({
  guitarModels: [model],
  drumModels: [],
  bpm: 120,
  loopMeasures: [0, lastBar],
  metronomeEnabled: false,
});

const originalDuration = player.durationSec;
const midSec = quartersToSeconds(8, 120);
assert.ok(
  Math.abs(originalDuration - quartersToSeconds(16, 120)) < TOL,
  `full-score loop duration should be 8 s at 120 BPM; got ${originalDuration}`,
);

await player.play({ fromSec: midSec });
assert.equal(player.playing, true, 'playback must start at mid score');

const secBefore = player.currentSec;
assert.ok(
  Math.abs(secBefore - midSec) < TOL,
  `song time should start near ${midSec} s; got ${secBefore}`,
);

player.setBpm(240);
assert.equal(player.playing, true, 'setBpm must keep playback running');

const halfDuration = player.durationSec;
assert.ok(
  Math.abs(halfDuration - originalDuration / 2) < TOL,
  `loop end must halve at 240 BPM (${originalDuration} -> ${halfDuration})`,
);

const secAfter = player.currentSec;
assert.ok(
  Math.abs(secAfter - midSec / 2) < TOL,
  `song time must halve to keep beat (${midSec} -> ${secAfter})`,
);

player.setBpm(120);
assert.equal(player.playing, true, 'setBpm back to 120 must keep playback running');
assert.ok(
  Math.abs(player.durationSec - originalDuration) < TOL,
  `loop duration must restore at 120 BPM; got ${player.durationSec}`,
);
assert.ok(
  Math.abs(player.currentSec - midSec) < TOL,
  `song time must restore at 120 BPM (${player.currentSec} vs ${midSec})`,
);

player.destroy();

console.log('gp-player tempo rate loop: ok');
