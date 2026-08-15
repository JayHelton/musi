// Regression: tempo changes must not close the player or fire onPlaybackEnd.
// Run: node tests/gp-player/tempo-change-keeps-player.mjs

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
const { quartersToSeconds } = await import('../../js/tab/tabModel.js');
const { mountGpPlayer } = await import('../../js/gpPlayerUI.js');

const events = [];
for (let beat = 0; beat < 16; beat++) {
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
    { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12, marker: 'Bar 3' },
    { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16, marker: 'Bar 4' },
  ],
  tempo: 120,
  totalBeats: 16,
};

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: 16,
    model: fakeModel,
  }],
  drumTracks: [],
};

function findPlayBtn(host) {
  return [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute?.('aria-label') === 'Play',
  );
}

function clickPlay(host, mount) {
  const playBtn = findPlayBtn(host);
  assert.ok(playBtn, 'transport play button should exist');
  playBtn.click();
  assert.equal(mount.player.playing, true, 'play button should start playback');
}

// ---- 1. createGpMixPlayer setBpm keeps beat mid-score ----
{
  const player = createGpMixPlayer();
  player.load({
    guitarModels: [fakeModel],
    drumModels: [],
    bpm: 120,
    metronomeEnabled: false,
  });
  player.seek(quartersToSeconds(8, 120));
  await player.play();
  const beatBefore = player.getPosition().beatInScore;
  assert.ok(beatBefore >= 7.5, `expected mid-score beat, got ${beatBefore}`);
  player.setBpm(240);
  const beatAfter = player.getPosition().beatInScore;
  assert.ok(
    Math.abs(beatAfter - beatBefore) < 0.25,
    `setBpm must keep beat (${beatBefore} -> ${beatAfter})`,
  );
  assert.equal(player.playing, true, 'setBpm must not stop playback');
  player.destroy();
}

// ---- 2. mountGpPlayer stepBpm while playing keeps mount alive ----
{
  let playbackEndCount = 0;
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Tempo change',
    skipCountIn: true,
    onPlaybackEnd: () => { playbackEndCount += 1; },
  });
  mount.seekToBeat(8);
  clickPlay(host, mount);
  const beatBefore = mount.player.getPosition().beatInScore;
  mount.stepBpm(120);
  assert.equal(mount.getState().bpm, 240, 'stepBpm should double tempo to 240');
  assert.ok(host.classList.contains('gpp-root'), 'mount host must stay alive');
  assert.ok(host.querySelector('.gpp-practice-rail'), 'practice rail must remain mounted');
  assert.equal(playbackEndCount, 0, 'onPlaybackEnd must not fire on tempo change');
  const beatAfter = mount.player.getPosition().beatInScore;
  assert.ok(
    Math.abs(beatAfter - beatBefore) < 0.25,
    `tempo change must keep beat (${beatBefore} -> ${beatAfter})`,
  );
  assert.equal(mount.player.playing, true, 'player must keep playing after tempo change');
  mount.stop();
  mount.destroy();
}

// ---- 3. reloadModel via setLoopEnabled must not fire onPlaybackEnd ----
{
  let playbackEndCount = 0;
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Reload suppress',
    skipCountIn: true,
    initialLoopEnabled: false,
    onPlaybackEnd: () => { playbackEndCount += 1; },
  });
  mount.seekToBeat(12);
  clickPlay(host, mount);
  mount.setLoopEnabled(true);
  assert.equal(playbackEndCount, 0, 'onPlaybackEnd must not fire on reload stop');
  assert.ok(host.classList.contains('gpp-root'), 'mount must survive reloadModel');
  mount.stop();
  mount.destroy();
}

console.log('gp tempo change keeps player: ok');
