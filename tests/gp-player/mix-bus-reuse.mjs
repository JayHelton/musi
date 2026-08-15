// Shared mix-bus survives player destroy and heals a cut bus on reuse.
// Run: node tests/gp-player/mix-bus-reuse.mjs

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

function makeTrackingNode(label = 'node') {
  const node = {
    _label: label,
    _connections: [],
    connect(dest) {
      this._connections.push(dest);
      return dest;
    },
    disconnect() {
      this._connections.length = 0;
    },
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
  return node;
}

function installAudioStub() {
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.destination = makeTrackingNode('destination');
    }
    get currentTime() { return this._time; }
    resume() { return Promise.resolve(); }
    createGain() { return makeTrackingNode('gain'); }
    createOscillator() { return makeTrackingNode('osc'); }
    createDynamicsCompressor() { return makeTrackingNode('compressor'); }
    createAnalyser() { return makeTrackingNode('analyser'); }
    createStereoPanner() {
      return { ...makeTrackingNode('panner'), pan: makeAudioParam(0) };
    }
    createWaveShaper() { return makeTrackingNode('waveshaper'); }
    createBiquadFilter() {
      return { ...makeTrackingNode('filter'), type: 'lowpass', Q: makeAudioParam(1) };
    }
    createPeriodicWave() { return {}; }
  }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;
}

installDomShim();
installAudioStub();
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const audioMod = await import('../../js/audio.js');
const {
  attachMixGraph,
  getTrackBus,
  isTrackBusInput,
  resetMixBuses,
} = await import('../../js/audio/mixBus.js');
const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');

function makeTinyModel() {
  return {
    tempo: 120,
    measures: [{ startBeat: 0, endBeat: 4 }],
    trackInfo: { volume: 1, pan: 0, program: 27 },
    strings: ['E', 'A', 'D', 'G', 'B', 'E'],
    events: [
      {
        slot: 0,
        start: 0,
        duration: 1,
        stringIndex: 0,
        fret: 0,
        midi: 40,
        pc: 4,
        techniques: [],
        dead: false,
      },
    ],
  };
}

function busInputConnected(inputNode) {
  return inputNode._connections.length > 0;
}

function reachesDestination(fromNode, dest, seen = new Set()) {
  if (!fromNode || seen.has(fromNode)) return false;
  seen.add(fromNode);
  if (fromNode === dest) return true;
  for (const next of fromNode._connections || []) {
    if (reachesDestination(next, dest, seen)) return true;
  }
  return false;
}

resetMixBuses();
audioMod.ensureAudio();
attachMixGraph(audioMod.audioCtx, { masterVolume: 1 });

const busInput = getTrackBus('guitar:0', { volume: 1, pan: 0 });
assert.ok(busInput, 'getTrackBus returns an input node');
assert.ok(isTrackBusInput(busInput), 'bus input is marked as shared');
assert.ok(busInputConnected(busInput), 'new bus input connects into the mix graph');

const voice = audioMod.audioCtx.createGain();
voice.connect(busInput);
assert.ok(
  reachesDestination(voice, audioMod.audioCtx.destination),
  'voice on the bus reaches the destination',
);

const player1 = createGpMixPlayer();
player1.load({
  guitarModels: [makeTinyModel()],
  drumModels: [],
  trackVolumes: { guitar: [1], drum: [] },
  trackPans: { guitar: [0], drum: [] },
  scoreId: 'mix-bus-score-1',
});
player1.play();
player1.destroy();

const busAfterDestroy = getTrackBus('guitar:0', { volume: 1, pan: 0 });
assert.equal(busAfterDestroy, busInput, 'destroy reuses the same shared bus input');
assert.ok(busInputConnected(busAfterDestroy), 'destroy does not cut the shared bus input');

const player2 = createGpMixPlayer();
player2.load({
  guitarModels: [makeTinyModel()],
  drumModels: [],
  trackVolumes: { guitar: [1], drum: [] },
  trackPans: { guitar: [0], drum: [] },
  scoreId: 'mix-bus-score-2',
});
assert.doesNotThrow(() => player2.play(), 'second player schedules on a live bus');
player2.destroy();

// Heal path: simulate an old destroy that cut the bus, then reuse repairs it.
busInput.disconnect();
assert.equal(busInput._connections.length, 0, 'simulated cut clears bus input links');
getTrackBus('guitar:0', { volume: 1, pan: 0 });
assert.ok(busInputConnected(busInput), 'getTrackBus heals a cut shared bus input');

console.log('gp-player mix-bus-reuse: ok');
