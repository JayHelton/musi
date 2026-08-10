// GP player metronome + tempo ramp logic and UI wiring.
// Run: node tests/gp-player/metronome.mjs

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

const metroOscillators = [];
const gainPeaks = [];

function installAudioStub() {
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.destination = makeAudioNode();
    }
    get currentTime() { return this._time; }
    advance(sec) { this._time += sec; }
    resume() { return Promise.resolve(); }
    createGain() {
      const node = makeAudioNode();
      const origLinear = node.gain.linearRampToValueAtTime.bind(node.gain);
      node.gain.linearRampToValueAtTime = (v, t) => {
        if (v > 0.001) {
          node.gain.peak = v;
          gainPeaks.push(v);
        }
        return origLinear(v, t);
      };
      return node;
    }
    createOscillator() {
      const node = makeAudioNode();
      node._startAt = null;
      const origStart = node.start.bind(node);
      node.start = (when = 0) => {
        node._startAt = when;
        metroOscillators.push(node);
        return origStart(when);
      };
      return node;
    }
    createBiquadFilter() { return makeAudioNode(); }
    createDynamicsCompressor() { return makeAudioNode(); }
    createAnalyser() { return makeAudioNode(); }
  }
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;
}

function installLocalStorageStub() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
}

function clearMetroOscillators() {
  metroOscillators.length = 0;
  gainPeaks.length = 0;
}

function metroClicks() {
  return metroOscillators.filter((o) => [600, 800, 1200].includes(o.frequency.value));
}

function guitarOscillators() {
  return metroOscillators.filter((o) => ![600, 800, 1200].includes(o.frequency.value));
}

function waitScheduler(ms = 60) {
  return new Promise((r) => setTimeout(r, ms));
}

function advanceAudio(sec) {
  const ctx = audioMod.audioCtx;
  if (ctx && typeof ctx.advance === 'function') ctx.advance(sec);
}

async function runScheduler(cycles = 3, advanceSec = 0.04) {
  for (let i = 0; i < cycles; i++) {
    await waitScheduler(30);
    advanceAudio(advanceSec);
  }
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

const {
  clickLevelAt,
  clickPositionsInRange,
  createTempoRampController,
  deriveBeatsPerMeasure,
  normalizeMetronomeConfig,
  snapMetroBeatToGrid,
  GPP_MIN_BPM,
  GPP_MAX_BPM,
  clampBpm,
} = await import('../../js/gpPlayer/metronomeState.js');
const { METRO_CLICK_GAIN } = await import('../../js/tab/metroClick.js');
const audioMod = await import('../../js/audio.js');
const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');
const { createPlayerState, resolveInitialBpm } = await import('../../js/gpPlayer/playerState.js');
const { mountMetronomePanel } = await import('../../js/gpPlayer/metronomePanel.js');
const { mountGpPlayer } = await import('../../js/gpPlayerUI.js');

const simpleGuitarModel = {
  tempo: 120,
  strings: [{ openMidi: 40 }],
  events: [{ start: 8, duration: 1, stringIndex: 0, fret: 0, midi: 40 }],
  measures: [{ startBeat: 0, endBeat: 4 }],
  totalBeats: 4,
};

// ---- subdivision positions ----
{
  const eighth = clickPositionsInRange(0, 2, 'eighth');
  assert.deepEqual(eighth, [0, 0.5, 1, 1.5], 'eighth notes over two beats');
  const triplet = clickPositionsInRange(0, 1, 'triplet');
  assert.ok(triplet.length === 3, 'triplet has 3 clicks per beat');
  const sixteenth = clickPositionsInRange(0, 1, 'sixteenth');
  assert.deepEqual(sixteenth, [0, 0.25, 0.5, 0.75], 'sixteenth spacing');
}

// ---- grid snap ----
{
  assert.equal(snapMetroBeatToGrid(0, 'eighth'), 0);
  assert.equal(snapMetroBeatToGrid(0.3, 'eighth'), 0.5);
  assert.equal(snapMetroBeatToGrid(0.5, 'eighth'), 0.5);
  assert.equal(snapMetroBeatToGrid(0.51, 'eighth'), 1);
}

// ---- accent pattern ----
{
  const cfg = normalizeMetronomeConfig({
    beatsPerMeasure: 4,
    accentPattern: [true, false, true, false],
  });
  assert.equal(clickLevelAt(0, 'quarter', cfg, []), 'accent');
  assert.equal(clickLevelAt(1, 'quarter', cfg, []), 'beat');
  assert.equal(clickLevelAt(2, 'quarter', cfg, []), 'accent');
  assert.equal(clickLevelAt(0.5, 'eighth', cfg, []), 'sub');
}

// ---- derive beats from time signature ----
{
  const model = {
    measures: [
      { startBeat: 0, endBeat: 6, timeSig: [6, 8] },
      { startBeat: 6, endBeat: 12, timeSig: [4, 4] },
    ],
  };
  assert.equal(deriveBeatsPerMeasure(model, 0), 3, '6/8 → 3 quarter beats');
  assert.equal(deriveBeatsPerMeasure(model, 1), 4, '4/4 → 4 beats');
}

// ---- tempo ramp: seconds ----
{
  const steps = [];
  const ramp = createTempoRampController({
    getRampConfig: () => ({
      enabled: true,
      startBpm: 80,
      targetBpm: 90,
      stepBpm: 5,
      intervalMode: 'seconds',
      intervalValue: 2,
      holdAtTarget: true,
    }),
    onStep: (bpm) => steps.push(bpm),
  });
  ramp.startSession(80);
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 0, measureIndex: 0, bpm: 80 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 2.1, measureIndex: 0, bpm: 80 });
  assert.deepEqual(steps, [85], 'one 5 BPM step after 2s');
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 4.2, measureIndex: 0, bpm: 85 });
  assert.deepEqual(steps, [85, 90], 'second step hits target');
  assert.equal(ramp.getStatus().finished, true);
}

// ---- tempo ramp: loop passes ----
{
  const steps = [];
  const ramp = createTempoRampController({
    getRampConfig: () => ({
      enabled: true,
      startBpm: 100,
      targetBpm: 110,
      stepBpm: 5,
      intervalMode: 'loops',
      intervalValue: 2,
      holdAtTarget: true,
    }),
    onStep: (bpm) => steps.push(bpm),
  });
  ramp.startSession(100);
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 0, measureIndex: 0, loopRestart: false, bpm: 100 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 4, measureIndex: 0, loopRestart: true, bpm: 100 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 8, measureIndex: 0, loopRestart: true, bpm: 100 });
  assert.deepEqual(steps, [105], 'step after 2 loop restarts');
}

// ---- ramp clamping ----
{
  const steps = [];
  const ramp = createTempoRampController({
    getRampConfig: () => ({
      enabled: true,
      startBpm: GPP_MAX_BPM - 2,
      targetBpm: GPP_MAX_BPM + 50,
      stepBpm: 5,
      intervalMode: 'seconds',
      intervalValue: 1,
      holdAtTarget: true,
    }),
    onStep: (bpm) => steps.push(bpm),
    clamp: clampBpm,
  });
  ramp.startSession(GPP_MAX_BPM - 2);
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 0, measureIndex: 0, bpm: GPP_MAX_BPM - 2 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 1.1, measureIndex: 0, bpm: GPP_MAX_BPM - 2 });
  assert.ok(steps.every((b) => b <= GPP_MAX_BPM), 'never exceeds GPP_MAX_BPM');
  assert.equal(steps[steps.length - 1], GPP_MAX_BPM);
}

// ---- ramp pause / resume ----
{
  const steps = [];
  const ramp = createTempoRampController({
    getRampConfig: () => ({
      enabled: true,
      startBpm: 60,
      targetBpm: 80,
      stepBpm: 10,
      intervalMode: 'seconds',
      intervalValue: 1,
      holdAtTarget: true,
    }),
    onStep: (bpm) => steps.push(bpm),
  });
  ramp.startSession(60);
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 0, measureIndex: 0, bpm: 60 });
  ramp.pauseSession();
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 5, measureIndex: 0, bpm: 60 });
  assert.deepEqual(steps, [], 'paused ramp does not advance timer');
  ramp.resumeSession();
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 5, measureIndex: 0, bpm: 60 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 6.1, measureIndex: 0, bpm: 60 });
  assert.deepEqual(steps, [70], 'resumed ramp steps after interval');
}

// ---- ramp reset on stop does not corrupt persisted BPM ----
{
  const fakeGp = {
    tempo: 120,
    tracks: [{
      index: 0,
      name: 'Guitar',
      tuning: 'Standard',
      noteCount: 1,
      model: {
        tuning: 'Standard',
        strings: [{ note: 'E', oct: 2, openMidi: 40 }],
        events: [{ slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40 }],
        measures: [{ startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 }],
        tempo: 120,
        totalBeats: 4,
      },
    }],
    drumTracks: [],
  };
  const ctrl = createPlayerState(fakeGp, { scoreKey: 'test-bpm' });
  ctrl.state.bpm = 120;
  ctrl.state.bpmUserOverride = false;
  const before = ctrl.toPersistable();
  assert.equal(before.bpm, null, 'score BPM is not persisted as override');

  const steps = [];
  const ramp = createTempoRampController({
    getRampConfig: () => ({
      enabled: true,
      startBpm: 100,
      targetBpm: 110,
      stepBpm: 5,
      intervalMode: 'seconds',
      intervalValue: 1,
      holdAtTarget: true,
    }),
    onStep: (bpm) => {
      ctrl.state.bpm = bpm;
      steps.push(bpm);
    },
  });
  ramp.startSession(100);
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 0, measureIndex: 0, bpm: 100 });
  ramp.onPlaybackTick({ playing: true, resting: false, currentSec: 1.1, measureIndex: 0, bpm: 105 });
  assert.ok(ctrl.state.bpm > 100, 'ramp raised live BPM');
  ramp.stopSession();
  ctrl.state.bpm = 100;
  const after = ctrl.toPersistable();
  assert.equal(after.bpm, null, 'ramp steps do not set bpmUserOverride / persisted BPM');
}

// ---- score-synced metronome clicks via gpMixPlayer ----
{
  clearMetroOscillators();
  const player = createGpMixPlayer();
  player.load({
    guitarModels: [simpleGuitarModel],
    bpm: 120,
    metronomeEnabled: true,
    referenceModel: { measures: [{ startBeat: 0, endBeat: 4 }] },
  });
  player.setMetronomeConfig({
    subdiv: 'eighth',
    accentPattern: [true, false, false, false],
    beatsPerMeasure: 4,
    volume: 1,
  });
  player.play({ fromSec: 0 });
  assert.equal(player.playing, true);
  await runScheduler(15, 0.04);

  const clicks = metroClicks().sort((a, b) => a._startAt - b._startAt);
  assert.ok(clicks.length >= 3, `schedules metronome clicks (got ${clicks.length})`);
  const freqs = clicks.slice(0, 4).map((o) => o.frequency.value);
  assert.deepEqual(freqs.slice(0, 3), [1200, 600, 800], 'accent then sub then beat');
  if (freqs.length >= 4) assert.equal(freqs[3], 600, 'fourth click is sub');

  // volume scales peak gain
  {
    clearMetroOscillators();
    const volPlayer = createGpMixPlayer();
    volPlayer.load({
      guitarModels: [simpleGuitarModel],
      bpm: 120,
      metronomeEnabled: true,
      referenceModel: { measures: [{ startBeat: 0, endBeat: 4 }] },
    });
    volPlayer.setMetronomeConfig({ subdiv: 'quarter', accentPattern: [true, false, false, false], volume: 0.5 });
    volPlayer.play({ fromSec: 0 });
    await runScheduler(4, 0.04);
    const halfVolPeak = gainPeaks.find((p) => p > 0.05) ?? null;
    clearMetroOscillators();
    volPlayer.stop();
    volPlayer.setMetronomeConfig({ volume: 1 });
    volPlayer.play({ fromSec: 0 });
    await runScheduler(4, 0.04);
    const fullVolPeak = gainPeaks.find((p) => p > 0.05) ?? null;
    assert.ok(halfVolPeak > 0 && fullVolPeak > halfVolPeak, `volume scales click gain (${halfVolPeak} vs ${fullVolPeak})`);
    assert.ok(
      Math.abs(halfVolPeak - fullVolPeak * 0.5) < 0.001,
      'half volume ≈ half peak',
    );
    volPlayer.stop();
  }

  // seek to fractional beat snaps clicks to subdivision grid
  {
    clearMetroOscillators();
    const seekPlayer = createGpMixPlayer();
    seekPlayer.load({
      guitarModels: [simpleGuitarModel],
      bpm: 120,
      metronomeEnabled: true,
      referenceModel: { measures: [{ startBeat: 0, endBeat: 4 }] },
    });
    seekPlayer.setMetronomeConfig({ subdiv: 'eighth', volume: 1, accentPattern: [true, false, false, false] });
    seekPlayer.play({ fromSec: 0 });
    await waitScheduler(30);
    const quarterSec = 0.5;
    const seekSec = 0.3 * quarterSec; // beat 0.3 → next grid at beat 0.5
    const nowAtSeek = audioMod.audioCtx.currentTime;
    clearMetroOscillators();
    seekPlayer.seek(seekSec);
    await runScheduler(4, 0.04);
    const afterSeek = metroClicks().sort((a, b) => a._startAt - b._startAt);
    assert.ok(afterSeek.length >= 1, 'clicks scheduled after seek');
    const firstBeatSec = 0.5 * quarterSec;
    const expectedWhen = nowAtSeek + 0.06 + (firstBeatSec - seekSec);
    const firstWhen = afterSeek[0]._startAt;
    assert.ok(
      Math.abs(firstWhen - expectedWhen) < 0.02,
      `first post-seek click on grid (got ${firstWhen}, want ~${expectedWhen})`,
    );
    seekPlayer.stop();
  }

  // setMetronomeConfig while playing does not restart note scheduling
  clearMetroOscillators();
  player.stop();
  const noteModel = {
    tempo: 120,
    strings: [{ openMidi: 40 }],
    events: [
      { start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40 },
      { start: 2, duration: 1, stringIndex: 0, fret: 0, midi: 42 },
    ],
    measures: [{ startBeat: 0, endBeat: 4 }],
  };
  player.load({
    guitarModels: [noteModel],
    bpm: 120,
    metronomeEnabled: true,
    referenceModel: { measures: [{ startBeat: 0, endBeat: 4 }] },
  });
  player.play({ fromSec: 0 });
  await runScheduler(4, 0.05);
  const secBefore = player.currentSec;
  const guitarBefore = guitarOscillators().length;
  assert.ok(guitarBefore >= 1, 'first note scheduled');
  player.setMetronomeConfig({ volume: 0.25, subdiv: 'quarter' });
  await runScheduler(4, 0.05);
  assert.equal(player.playing, true, 'still playing after config change');
  assert.ok(player.currentSec >= secBefore, 'playback position keeps advancing');
  assert.equal(guitarOscillators().length, guitarBefore, 'note voices not re-scheduled');

  player.stop();
}

// ---- metronome panel mounts with sections ----
{
  const fakeGp = {
    tempo: 120,
    tracks: [{
      index: 0,
      name: 'Guitar',
      tuning: 'Standard',
      noteCount: 1,
      model: {
        tuning: 'Standard',
        strings: [{ note: 'E', oct: 2, openMidi: 40 }],
        events: [{ slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40 }],
        measures: [{ startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 }],
        tempo: 120,
        totalBeats: 4,
      },
    }],
    drumTracks: [],
  };
  const ctrl = createPlayerState(fakeGp);
  const host = document.createElement('div');
  const panel = mountMetronomePanel(host, {
    stateController: ctrl,
    getRampStatus: () => ({}),
    onChange: () => {},
  });
  panel.open();
  const titles = [...host.querySelectorAll('.gpp-settings-section-title')].map((n) => n.textContent);
  assert.ok(titles.includes('Click'), 'click section present');
  assert.ok(titles.includes('Count-in'), 'count-in section present');
  assert.ok(titles.includes('Tempo ramp'), 'ramp section present');
  panel.destroy();
}

// ---- transport metro toggle + menu entry wired in mountGpPlayer ----
{
  const fakeGp = {
    tempo: 120,
    tracks: [{
      index: 0,
      name: 'Guitar',
      tuning: 'Standard',
      noteCount: 4,
      model: {
        tuning: 'Standard',
        strings: [{ note: 'E', oct: 2, openMidi: 40 }],
        events: [
          { slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40 },
        ],
        measures: [{ startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 }],
        tempo: 120,
        totalBeats: 4,
      },
    }],
    drumTracks: [],
  };
  const host = document.createElement('div');
  const mount = mountGpPlayer(host, { gpResult: fakeGp, title: 'Metro wiring' });
  const metroBtn = [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === 'Metronome click',
  );
  assert.ok(metroBtn, 'transport metronome toggle exists');
  assert.equal(metroBtn.getAttribute('aria-pressed'), 'false');
  metroBtn.click();
  assert.equal(mount.getState().metronomeEnabled, true);
  assert.equal(mount.getState().metro.enabled, true);
  assert.equal(metroBtn.getAttribute('aria-pressed'), 'true');

  const menuBtn = [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === 'Player menu',
  );
  assert.ok(menuBtn, 'player menu button exists');
  menuBtn.click();
  const metroRow = [...host.querySelectorAll('.gpp-menu-row')].find(
    (b) => b.getAttribute('aria-label') === 'Metronome and tempo ramp',
  );
  assert.ok(metroRow, 'menu metronome entry exists');
  mount.destroy();
}

console.log('gp-player metronome: ok');
