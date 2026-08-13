// Regression tests for loop-enabled GP player playback.
// Run: node tests/gp-player/loop-playback.mjs

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

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0,
    name: 'Guitar',
    tuning: 'Standard',
    noteCount: 16,
    model: {
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
    },
  }],
  drumTracks: [],
};

function findPlayBtn(host) {
  return [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute?.('aria-label') === 'Play',
  );
}

function teardown(mount) {
  mount.stop();
  mount.destroy();
}

function clickPlay(host, mount) {
  const playBtn = findPlayBtn(host);
  assert.ok(playBtn, 'transport play button should exist');
  playBtn.click();
  assert.equal(mount.player.playing, true, 'play button should start playback');
  assert.equal(playBtn.textContent, '⏸', 'play button glyph should flip to pause');
}

// ---- 1. core regression: loop enabled with mount null beat defaults ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Loop defaults',
    initialLoopEnabled: true,
  });
  const st = mount.getState();
  assert.ok(st.loopEndBeat > st.loopStartBeat, 'loop beats must form a positive span');
  assert.equal(st.loopStartBeat, 0, 'whole-score loop starts at beat 0');
  assert.equal(st.loopEndBeat, 16, 'whole-score loop ends at beat 16');
  assert.ok(mount.player.events.length > 0, 'loop-enabled mount must have playable events');
  assert.ok(mount.player.durationSec > 0, 'loop-enabled mount must have positive duration');
  clickPlay(host, mount);
  teardown(mount);
}

// ---- 2. explicit null beats (persisted exercise shape) ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Loop null beats',
    initialLoopEnabled: true,
    initialLoopStartBeat: null,
    initialLoopEndBeat: null,
  });
  const st = mount.getState();
  assert.ok(st.loopEndBeat > st.loopStartBeat, 'explicit null beats must resolve to a positive span');
  assert.equal(st.loopStartBeat, 0, 'null beats whole-score loop starts at beat 0');
  assert.equal(st.loopEndBeat, 16, 'null beats whole-score loop ends at beat 16');
  assert.ok(mount.player.events.length > 0, 'null-beat loop mount must have playable events');
  clickPlay(host, mount);
  teardown(mount);
}

// ---- 3. bar range without saved beats starts at loop start ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Bars 3-4',
    initialLoopEnabled: true,
    initialLoopStart: 2,
    initialLoopEnd: 3,
  });
  const st = mount.getState();
  assert.equal(st.loopStartBeat, 8, 'bars 3-4 loop starts at beat 8');
  assert.equal(st.loopEndBeat, 16, 'bars 3-4 loop ends at beat 16');
  clickPlay(host, mount);
  assert.ok(
    Math.abs(mount.player.currentSec - 4) < 0.15,
    `first play must start at loop start (~4s), got ${mount.player.currentSec}`,
  );
  teardown(mount);
}

// ---- 4. explicit valid beats are respected ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Explicit beats',
    initialLoopEnabled: true,
    initialLoopStartBeat: 8,
    initialLoopEndBeat: 16,
  });
  const st = mount.getState();
  assert.equal(st.loopStartBeat, 8, 'explicit loop start beat preserved');
  assert.equal(st.loopEndBeat, 16, 'explicit loop end beat preserved');
  clickPlay(host, mount);
  teardown(mount);
}

// ---- 5. degenerate saved range cannot kill playback ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'Degenerate beats',
    initialLoopEnabled: true,
    initialLoopStartBeat: 4,
    initialLoopEndBeat: 4,
  });
  assert.ok(mount.player.events.length > 0, 'degenerate beat range must not empty the event list');
  clickPlay(host, mount);
  teardown(mount);
}

// ---- 6. loop disabled plays from 0 with full events ----
{
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, {
    gpResult: fakeGp,
    title: 'No loop',
    initialLoopEnabled: false,
  });
  assert.ok(mount.player.events.length > 0, 'no-loop mount must have full event list');
  clickPlay(host, mount);
  assert.ok(
    Math.abs(mount.player.currentSec) < 0.15,
    `no-loop first play must start at 0, got ${mount.player.currentSec}`,
  );
  teardown(mount);
}

// The audio context is a module singleton, so a test that needs its own
// clock must run in its own process. See tests/gp-player/loop-scheduling.mjs
// for the 20 pass scheduling checks.

console.log('gp loop playback: ok');
