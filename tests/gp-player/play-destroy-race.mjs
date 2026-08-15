// Race tests: play() overlap and destroy during audioCtx.resume().
// Run: node tests/gp-player/play-destroy-race.mjs

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
    type: 'bandpass',
    Q: makeAudioParam(8),
    threshold: makeAudioParam(-24),
    knee: makeAudioParam(30),
    ratio: makeAudioParam(12),
    attack: makeAudioParam(0.003),
    release: makeAudioParam(0.25),
    fftSize: 2048,
  };
}

let resumeResolve = null;

function installAudioStub() {
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.destination = makeAudioNode();
    }
    get currentTime() { return this._time; }
    resume() {
      if (this.state === 'running') return Promise.resolve();
      const promise = new Promise((resolve) => {
        resumeResolve = () => {
          this.state = 'running';
          resumeResolve = null;
          resolve();
        };
      });
      return promise;
    }
    createGain() { return makeAudioNode(); }
    createOscillator() { return makeAudioNode(); }
    createDynamicsCompressor() { return makeAudioNode(); }
    createAnalyser() { return makeAudioNode(); }
    createBiquadFilter() { return makeAudioNode(); }
    createStereoPanner() {
      const node = makeAudioNode();
      node.pan = makeAudioParam(0);
      return node;
    }
    createWaveShaper() { return makeAudioNode(); }
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

const _createElement = document.createElement.bind(document);
document.createElement = (tag) => {
  const el = _createElement(tag);
  if (!el.remove) {
    el.remove = function remove() {
      if (this.parentElement) this.parentElement.removeChild(this);
    };
  }
  return el;
};

const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');
const audioModule = await import('../../js/audio.js');
const { mountGpPlayer } = await import('../../js/gpPlayerUI.js');

function ensureTestAudio() {
  audioModule.ensureAudio();
  return audioModule.audioCtx;
}

const events = [];
for (let beat = 0; beat < 8; beat++) {
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

const fakeModel = {
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
    { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4, marker: 'Bar 1' },
    { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8, marker: 'Bar 2' },
  ],
  tempo: 120,
  totalBeats: 8,
};

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: 8,
    model: fakeModel,
  }],
  drumTracks: [],
};

function loadPlayer(player) {
  player.load({
    guitarModels: [fakeModel],
    drumModels: [],
    bpm: 120,
    metronomeEnabled: true,
  });
}

function resolvePendingResume() {
  if (resumeResolve) resumeResolve();
}

// ---- 1. destroy then play is a no-op ----
{
  const player = createGpMixPlayer();
  loadPlayer(player);
  player.destroy();
  await player.play();
  assert.equal(player.playing, false, 'play after destroy must not set playing');
}

// ---- 2. destroy during pending resume ----
{
  const audioCtx = ensureTestAudio();
  audioCtx.state = 'suspended';
  const player = createGpMixPlayer();
  loadPlayer(player);
  const playPromise = player.play();
  assert.equal(player.playing, false, 'play must not claim audio before resume');
  player.destroy();
  resolvePendingResume();
  await playPromise;
  assert.equal(player.playing, false, 'stale play after destroy must leave playing false');
}

// ---- 3. overlapping play calls ----
{
  const audioCtx = ensureTestAudio();
  audioCtx.state = 'running';
  const player = createGpMixPlayer();
  loadPlayer(player);
  const first = player.play({ fromSec: 0 });
  const second = player.play({ fromSec: 1 });
  resolvePendingResume();
  await first;
  await second;
  assert.equal(player.playing, true, 'overlapping play calls must finish without throw');
  player.destroy();
  assert.equal(player.playing, false, 'player must not stay playing after destroy');
}

// ---- 4. seek after destroy does not throw ----
{
  const player = createGpMixPlayer();
  loadPlayer(player);
  player.destroy();
  player.seek(1);
  player.seekToBar({ barIndex: 0 });
  assert.equal(player.playing, false);
}

// ---- 5. mountGpPlayer seekToBeat after destroy ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Destroy race',
    skipCountIn: true,
  });
  mount.seekToBeat(2);
  mount.destroy();
  mount.seekToBeat(4);
  assert.equal(mount.player.playing, false);
}

console.log('gp play-destroy race: ok');
