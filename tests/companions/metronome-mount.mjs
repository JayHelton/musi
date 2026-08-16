// The metronome companion plays its saved BPM progression: it switches tempo
// on each step boundary and stops when a non-looping plan runs out.
// Run: node tests/companions/metronome-mount.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';

// --- virtual clock ---------------------------------------------------------
// The companion schedules clicks ahead of time with setTimeout, so the test
// drives both the timer queue and the audio clock from one virtual "now".

let now = 0;
let seq = 0;
const timers = new Map();

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

globalThis.setTimeout = (fn, delay = 0) => {
  const id = ++seq;
  timers.set(id, { fn, due: now + Math.max(0, delay), every: 0 });
  return id;
};
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.setInterval = (fn, delay = 0) => {
  const id = ++seq;
  const every = Math.max(1, delay);
  timers.set(id, { fn, due: now + every, every });
  return id;
};
globalThis.clearInterval = (id) => { timers.delete(id); };

/** Runs every timer due within `ms`, moving the clock forward as it goes. */
function advance(ms) {
  const target = now + ms;
  let guard = 0;
  for (;;) {
    let nextId = null;
    let next = null;
    for (const [id, timer] of timers) {
      if (timer.due > target) continue;
      if (!next || timer.due < next.due || (timer.due === next.due && id < nextId)) {
        next = timer;
        nextId = id;
      }
    }
    if (!next) break;
    if (++guard > 100000) throw new Error('virtual clock did not settle');
    now = next.due;
    if (next.every) next.due = now + next.every;
    else timers.delete(nextId);
    next.fn();
  }
  now = target;
}

// --- audio stub ------------------------------------------------------------

const clicks = [];

function audioParam(value = 0) {
  return {
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}

function node(label) {
  return {
    _label: label,
    connect(dest) { return dest; },
    disconnect() {},
    start() {},
    stop() {},
    frequency: audioParam(440),
    gain: audioParam(1),
    threshold: audioParam(-24),
    knee: audioParam(30),
    ratio: audioParam(12),
    attack: audioParam(0.003),
    release: audioParam(0.25),
    Q: audioParam(1),
    fftSize: 2048,
    type: 'sine',
  };
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = node('destination');
    this.sampleRate = 48000;
  }

  // The audio clock and the timer queue share the virtual clock.
  get currentTime() { return now / 1000; }

  resume() { return Promise.resolve(); }
  createGain() { return node('gain'); }
  createOscillator() {
    const osc = node('osc');
    // The click tone records its start time; that is the audible grid.
    osc.start = (time) => { clicks.push(time); };
    return osc;
  }
  createDynamicsCompressor() { return node('compressor'); }
  createAnalyser() { return node('analyser'); }
  createStereoPanner() { return { ...node('panner'), pan: audioParam(0) }; }
  createWaveShaper() { return node('waveshaper'); }
  createBiquadFilter() { return node('filter'); }
  createPeriodicWave() { return {}; }
}

installDomShim();
globalThis.AudioContext = FakeAudioContext;
globalThis.webkitAudioContext = FakeAudioContext;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const { defaultCompanion, mountCompanion } = await import('../../js/exerciseCompanions/index.js');
const { getAudioOwner } = await import('../../js/audio/audioOwner.js');

/** Beats per minute implied by the gap between two clicks. */
function bpmAt(index, perBeat = 1) {
  const gap = clicks[index + 1] - clicks[index];
  return Math.round(60 / (gap * perBeat));
}

// --- mount -----------------------------------------------------------------

const host = document.createElement('div');
document.body.appendChild(host);

const companion = defaultCompanion('metronome');
companion.progression = 'ramp';
companion.startBpm = 60;
companion.targetBpm = 120;
companion.stepBpm = 30;
companion.stepSeconds = 10;
companion.beatsPerBar = 4;
companion.collapsed = false;

const handle = mountCompanion(host, companion);

assert.ok(host.querySelector('.ec-panel'), 'metronome panel');
assert.equal(clicks.length, 0, 'mount must not schedule audio');
assert.equal(host.querySelectorAll('.ec-metro-beat').length, 4, 'one dot per beat');

// The idle panel already shows the saved plan, so the player sees it before
// pressing Start.
const planLine = host.querySelector('.ec-metro-plan');
assert.match(planLine.textContent, /Step up · 60–120 BPM · 3 steps · 0:30/);
assert.equal(host.querySelectorAll('.ec-metro-step').length, 3, 'plan steps listed');

const startBtn = host.querySelector('.ec-btn-start');
const stopBtn = host.querySelector('.ec-btn-stop');
assert.ok(startBtn && stopBtn);
assert.equal(stopBtn.disabled, true, 'stop disabled while idle');

// --- run the plan ----------------------------------------------------------

startBtn.click();
assert.equal(startBtn.disabled, true, 'start disabled while running');
assert.equal(stopBtn.disabled, false, 'stop enabled while running');
assert.equal(getAudioOwner()?.kind, 'metronome', 'metronome claims audio');

// Step 1 covers 0-10s at 60 BPM.
advance(5000);
assert.ok(clicks.length >= 4, `expected clicks in the first step, got ${clicks.length}`);
assert.equal(bpmAt(1), 60, 'first step runs at the start tempo');

// Step 2 covers 10-20s at 90 BPM, step 3 covers 20-30s at 120 BPM.
advance(7000);
const inStep2 = clicks.findIndex((t) => t >= 10.5);
assert.ok(inStep2 > 0, 'clicks reach the second step');
assert.equal(bpmAt(inStep2), 90, 'second step steps the tempo up');

advance(10000);
const inStep3 = clicks.findIndex((t) => t >= 20.5);
assert.ok(inStep3 > 0, 'clicks reach the third step');
assert.equal(bpmAt(inStep3), 120, 'third step reaches the target tempo');

const readout = host.querySelector('.ec-metro-bpm-value');
assert.equal(readout.textContent, '120', 'readout follows the active step');

// --- the plan ends on its own ---------------------------------------------

advance(15000);
assert.equal(startBtn.disabled, false, 'start re-enabled once the plan ends');
assert.equal(stopBtn.disabled, true, 'stop disabled once the plan ends');
assert.equal(getAudioOwner(), null, 'audio released at the end of the plan');
assert.match(host.querySelector('.ec-metro-status').textContent, /complete/i);

const lastClick = clicks[clicks.length - 1];
assert.ok(lastClick <= 30.01, `plan must not click past its end, last click ${lastClick}`);

// No click lands late: every gap matches one of the plan tempos.
const gaps = clicks.slice(1).map((t, i) => Number((t - clicks[i]).toFixed(4)));
const allowed = new Set([1, Number((60 / 90).toFixed(4)), 0.5]);
assert.ok(gaps.every((g) => allowed.has(g)), `unexpected click gaps: ${[...new Set(gaps)].join(', ')}`);

// --- stopping mid-plan releases everything ---------------------------------

clicks.length = 0;
startBtn.click();
advance(3000);
const beforeStop = clicks.length;
assert.ok(beforeStop > 0, 'second run schedules clicks');
stopBtn.click();
assert.equal(getAudioOwner(), null, 'stop releases audio');
advance(4000);
assert.equal(clicks.length, beforeStop, 'no clicks scheduled after stop');

handle.destroy();
assert.equal(host.querySelectorAll('.ec-panel').length, 0, 'destroy removes the panel');
assert.equal(getAudioOwner(), null, 'destroy releases audio');

// --- a steady plan with a count-in ----------------------------------------

clicks.length = 0;
const steady = defaultCompanion('metronome');
steady.progression = 'steady';
steady.startBpm = 120;
steady.subdiv = 'eighth';
steady.beatsPerBar = 4;
steady.countIn = true;
steady.collapsed = false;

const steadyHost = document.createElement('div');
document.body.appendChild(steadyHost);
const steadyHandle = mountCompanion(steadyHost, steady);
assert.match(steadyHost.querySelector('.ec-metro-plan').textContent, /Steady tempo · 120 BPM · 8ths/);
assert.equal(steadyHost.querySelectorAll('.ec-metro-step').length, 0, 'a steady plan lists no steps');

steadyHost.querySelector('.ec-btn-start').click();
advance(4000);
// The count-in is one bar of quarter notes at 120 BPM (0.5s apart); the plan
// then runs eighths (0.25s apart) and never ends on its own.
assert.ok(clicks.length >= 12, `count-in bar then eighths, got ${clicks.length}`);
const steadyGaps = clicks.slice(1).map((t, i) => Number((t - clicks[i]).toFixed(4)));
assert.deepEqual(steadyGaps.slice(0, 4), [0.5, 0.5, 0.5, 0.5], 'count-in bar clicks quarters');
assert.ok(steadyGaps.slice(4).every((g) => g === 0.25), 'the plan clicks eighths');
assert.equal(getAudioOwner()?.kind, 'metronome', 'a steady plan keeps running');

// Hiding the tools pane must not silence the click track — the player is
// working on the exercise next to it.
steadyHandle.stop('pane-hidden');
assert.equal(getAudioOwner()?.kind, 'metronome', 'a hidden pane leaves the metronome running');
const beforeHidden = clicks.length;
advance(1000);
assert.ok(clicks.length > beforeHidden, 'the metronome keeps clicking while the pane is hidden');

steadyHandle.stop();
assert.equal(getAudioOwner(), null, 'an unqualified stop releases audio');
steadyHandle.destroy();

globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;
globalThis.setInterval = realSetInterval;
globalThis.clearInterval = realClearInterval;

console.log('companions metronome mount: ok');
