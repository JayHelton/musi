// Imported track volume and pan from GP trackInfo.
// Run: node tests/gp-player/imported-mix.mjs

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
    createStereoPanner() { return { ...makeAudioNode(), pan: makeAudioParam(0) }; }
    createWaveShaper() { return makeAudioNode(); }
    createBiquadFilter() {
      return { ...makeAudioNode(), type: 'lowpass', Q: makeAudioParam(1) };
    }
    createPeriodicWave() { return {}; }
  }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;
}

installDomShim();
installAudioStub();
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const { createPlayerState } = await import('../../js/gpPlayer/playerState.js');
const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');

function makeGpResult() {
  const measures = [{ startBeat: 0, endBeat: 4 }];
  return {
    tempo: 120,
    tracks: [
      {
        name: 'Guitar 1',
        model: {
          tempo: 120,
          measures,
          trackInfo: { volume: 0.4, pan: -1, program: 27 },
          strings: ['E', 'A', 'D', 'G', 'B', 'E'],
          events: [],
        },
      },
      {
        name: 'Guitar 2',
        model: {
          tempo: 120,
          measures,
          trackInfo: { volume: 1, pan: 1, program: 27 },
          strings: ['E', 'A', 'D', 'G', 'B', 'E'],
          events: [],
        },
      },
    ],
    drumTracks: [],
  };
}

const gpResult = makeGpResult();
const controller = createPlayerState(gpResult);

assert.equal(controller.state.trackVolumes.guitars[0], 0.4);
assert.equal(controller.state.trackVolumes.guitars[1], 1);
assert.equal(controller.state.trackPans.guitars[0], -1);
assert.equal(controller.state.trackPans.guitars[1], 1);

controller.setTrackVolume('guitar', 0, 0.5);
controller.setTrackPan('guitar', 0, 0.25);
assert.equal(controller.getTrackVolume('guitar', 0), 0.5);
assert.equal(controller.getTrackPan('guitar', 0), 0.25);

controller.resetForNewScore();
assert.equal(controller.state.trackVolumes.guitars[0], 0.4);
assert.equal(controller.state.trackPans.guitars[0], -1);

const player = createGpMixPlayer();
player.load({
  guitarModels: gpResult.tracks.map((t) => t.model),
  drumModels: [],
  trackVolumes: {
    guitar: [...controller.state.trackVolumes.guitars],
    drum: [],
  },
  trackPans: {
    guitar: [...controller.state.trackPans.guitars],
    drum: [],
  },
  scoreId: 'import-mix-test',
});
player.destroy();

// Player accepts imported mix on load and exposes pan control.
const player2 = createGpMixPlayer();
player2.load({
  guitarModels: gpResult.tracks.map((t) => t.model),
  drumModels: [],
  trackVolumes: { guitar: [0.4, 1], drum: [] },
  trackPans: { guitar: [-1, 1], drum: [] },
});
player2.setTrackVolume('guitar', 0, 0.4);
player2.setTrackPan('guitar', 0, -1);
assert.equal(typeof player2.setTrackPan, 'function');
player2.destroy();

console.log('gp-player imported-mix: ok');
