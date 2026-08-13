// Engine scheduling checks across 20 loop passes.
// Run: node tests/gp-player/loop-scheduling.mjs
//
// This suite drives js/gpMixPlayer.js with a clock that the test controls.
// It proves two things that a listener hears at once:
//
//   1. The engine starts each note one time only. When the engine starts one
//      note more than one time, the loop boundary makes an audible flam.
//   2. The engine releases a finished voice. Without a release the audio
//      graph grows with every note, the audio thread walks more nodes on each
//      render block, and the sound breaks up during a long session.
//
// The audio context is a module singleton, so this suite must run in its own
// process. It installs the audio stub before it imports the engine.

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

installDomShim();

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

function makeAudioParam(value = 0) {
  return {
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}

// Count the gain nodes that the engine disconnects. The engine connects one
// gain node for each note. It must disconnect that node when the note ends.
const gainNodes = [];

function makeGainNode() {
  const node = makeAudioNode();
  node.disconnected = false;
  node.disconnect = () => { node.disconnected = true; };
  gainNodes.push(node);
  return node;
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

const started = [];
const oscillators = [];
let liveVoices = 0;
let releasedVoices = 0;

class DrivenOscillator {
  constructor() {
    this.frequency = makeAudioParam(440);
    this.stopAt = Infinity;
    this.ended = false;
    this.listeners = [];
  }
  connect() {}
  disconnect() {}
  start(when) {
    started.push(Number(when) || 0);
    liveVoices += 1;
  }
  stop(when) {
    this.stopAt = Math.min(this.stopAt, Number(when) || 0);
  }
  addEventListener(type, fn) {
    if (type === 'ended') this.listeners.push(fn);
  }
  fireEnded() {
    if (this.ended) return;
    this.ended = true;
    liveVoices -= 1;
    releasedVoices += 1;
    this.listeners.forEach((fn) => fn());
    if (typeof this.onended === 'function') this.onended();
  }
}

class DrivenAudioContext {
  constructor() {
    this._time = 0;
    this.state = 'running';
    this.destination = makeAudioNode();
    DrivenAudioContext.last = this;
  }
  get currentTime() { return this._time; }
  resume() { return Promise.resolve(); }
  createGain() { return makeGainNode(); }
  createOscillator() {
    const osc = new DrivenOscillator();
    oscillators.push(osc);
    return osc;
  }
  createDynamicsCompressor() { return makeAudioNode(); }
  createAnalyser() { return makeAudioNode(); }
}

globalThis.AudioContext = DrivenAudioContext;
globalThis.webkitAudioContext = DrivenAudioContext;

const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');

const strings = [
  { note: 'E', oct: 2, label: 'E', openMidi: 40 },
  { note: 'A', oct: 2, label: 'A', openMidi: 45 },
  { note: 'D', oct: 3, label: 'D', openMidi: 50 },
  { note: 'G', oct: 3, label: 'G', openMidi: 55 },
  { note: 'B', oct: 3, label: 'B', openMidi: 59 },
  { note: 'E', oct: 4, label: 'E', openMidi: 64 },
];

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
  strings,
  events,
  measures: [
    { startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 },
    { startSlot: 4, endSlot: 8, startBeat: 4, endBeat: 8 },
    { startSlot: 8, endSlot: 12, startBeat: 8, endBeat: 12 },
    { startSlot: 12, endSlot: 16, startBeat: 12, endBeat: 16 },
  ],
  tempo: 120,
  totalBeats: 16,
  slots: 16,
  techniqueCounts: {},
  warnings: [],
};

// Capture the scheduler timer so the test can step it by hand.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let pendingTimer = null;
globalThis.setTimeout = (fn) => { pendingTimer = fn; return 1; };
globalThis.clearTimeout = () => { pendingTimer = null; };

// The score view repaints inside onTick. That work must not delay the next
// audio tick, so the next tick must already be armed when onTick runs.
const tickArmed = [];
let watchTicks = false;
const player = createGpMixPlayer({
  onTick: () => { if (watchTicks) tickArmed.push(pendingTimer != null); },
});
player.load({ guitarModels: [model], drumModels: [], bpm: 120 });

// Loop bar 1. Four quarter notes at 120 BPM run for 2 seconds.
const LOOP_SEC = 2;
const PASSES = 20;
player.setLoop({ startSec: 0, endSec: LOOP_SEC, restSec: 0 });
watchTicks = true;
player.play({ fromSec: 0 });

const ctx = DrivenAudioContext.last;
assert.ok(ctx, 'the engine must build the driven audio context');

const STEP = 0.02;
const steps = Math.round((LOOP_SEC * PASSES) / STEP);
// Jump the clock at these steps, the way a long main thread stall does. The
// notes of the jump are then already in the past. The engine must still sound
// them. The old engine dropped every note whose time had passed, and a
// learner heard that as a skip.
const STALL_AT = new Set([120, 340, 560, 780]);
const STALL_SEC = 0.45;
for (let i = 0; i < steps; i += 1) {
  ctx._time += STALL_AT.has(i) ? STALL_SEC : STEP;
  for (const osc of oscillators) {
    if (!osc.ended && osc.stopAt <= ctx._time) osc.fireEnded();
  }
  if (pendingTimer) {
    const fn = pendingTimer;
    pendingTimer = null;
    fn();
  }
}

globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

assert.ok(started.length > 0, 'the engine must start notes during the loop');
assert.ok(
  started.length >= PASSES * 4 * 0.9,
  `the engine must start about ${PASSES * 4} notes; it started ${started.length}`,
);

// Every note of the fixture sits on its own beat, so no two notes may share a
// start time. A repeated start time means the engine started one note twice.
const startMs = started.map((s) => Math.round(s * 1000));
const uniqueStarts = new Set(startMs);
assert.equal(
  uniqueStarts.size,
  startMs.length,
  `each note must start one time only; ${startMs.length - uniqueStarts.size} duplicate starts`,
);

// No note may go missing. The run covers this much song time, and the score
// holds two notes each second at 120 BPM. A stall must not delete a note.
const songSec = (steps - STALL_AT.size) * STEP + STALL_AT.size * STALL_SEC;
const expectedNotes = songSec * 2;
assert.ok(
  started.length >= expectedNotes * 0.95,
  `no note may go missing; the engine started ${started.length} of about ${Math.round(expectedNotes)} notes`,
);

// The pass boundary must leave no hole. Notes fall every 0.5 s. A gap may
// reach one note spacing plus one injected stall, and no more.
const ordered = startMs.slice().sort((a, b) => a - b);
let worstGapMs = 0;
for (let i = 1; i < ordered.length; i += 1) {
  worstGapMs = Math.max(worstGapMs, ordered[i] - ordered[i - 1]);
}
assert.ok(
  worstGapMs <= 520 + STALL_SEC * 1000,
  `loop scheduling must stay gapless; worst gap ${worstGapMs} ms`,
);

// A finished voice must release. The engine connects one gain node for each
// note, so it must disconnect almost every one of them by the end of the run.
// Only the notes inside the last lookahead window may stay connected.
assert.ok(releasedVoices > 0, 'a finished oscillator must report its end');
const connectedGains = gainNodes.filter((n) => !n.disconnected).length;
const stillConnected = connectedGains - 1; // the shared track gain node stays
assert.ok(
  stillConnected <= 8,
  `the engine must disconnect a finished voice; ${stillConnected} of ${gainNodes.length} gain nodes are still connected`,
);

// The next audio tick must already be armed when onTick runs. Otherwise a
// slow repaint inside onTick pushes the audio out by that same time.
assert.ok(tickArmed.length > 5, 'the engine must report ticks during playback');
assert.ok(
  tickArmed.every(Boolean),
  `the next audio tick must be armed before onTick runs; ${tickArmed.filter((v) => !v).length} of ${tickArmed.length} ticks were not`,
);

player.destroy();

globalThis.setTimeout = realSetTimeout;
globalThis.clearTimeout = realClearTimeout;

console.log('gp-player loop scheduling: ok');
