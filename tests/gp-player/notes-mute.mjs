// setNotesMuted silences the synth notes only. The transport, the position,
// the metronome, and the track mixer must all survive it.
// Run: node tests/gp-player/notes-mute.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

const counts = { oscillators: 0 };

function makeAudioParam(value = 0) {
  return {
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
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
    detune: makeAudioParam(0),
    Q: makeAudioParam(1),
    pan: makeAudioParam(0),
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
  // The stub has no createBuffer, so every voice takes the plain-tone path and
  // each sounding note costs exactly one oscillator. That makes the count a
  // reliable stand-in for "a note sounded".
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = makeAudioNode();
    }
    get currentTime() { return this._time; }
    advance(sec) { this._time += sec; }
    resume() { return Promise.resolve(); }
    createGain() { return makeAudioNode(); }
    createOscillator() {
      counts.oscillators += 1;
      return makeAudioNode();
    }
    createBiquadFilter() { return makeAudioNode(); }
    createStereoPanner() { return makeAudioNode(); }
    createWaveShaper() { return makeAudioNode(); }
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

installDomShim();
installAudioStub();
installLocalStorageStub();

const { createGpMixPlayer } = await import('../../js/gpMixPlayer.js');
const { ensureAudio } = await import('../../js/audio.js');

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

function loadPlayer() {
  const player = createGpMixPlayer();
  player.load({
    guitarModels: [model],
    drumModels: [],
    bpm: 120,
    metronomeEnabled: false,
  });
  return player;
}

// A fresh player is not muted.
{
  const player = loadPlayer();
  assert.equal(player.notesMuted, false, 'a new player must sound its notes');
  player.destroy();
}

// With the notes audible, playing schedules voices.
let audibleCount = 0;
{
  const player = loadPlayer();
  counts.oscillators = 0;
  await player.play({ fromSec: 0 });
  audibleCount = counts.oscillators;
  assert.ok(audibleCount > 0, `notes must sound when nothing is muted; got ${audibleCount}`);
  player.destroy();
}

// With the notes muted, the same run schedules none.
{
  const player = loadPlayer();
  player.setNotesMuted(true);
  assert.equal(player.notesMuted, true);
  counts.oscillators = 0;
  await player.play({ fromSec: 0 });
  assert.equal(counts.oscillators, 0, 'a muted player must schedule no note voice');
  player.destroy();
}

// The mute leaves the transport, the position, and the mixer alone.
{
  const player = loadPlayer();
  await player.play({ fromSec: 2 });
  const eventsBefore = player.events.length;
  const enabledBefore = [...player.enabledGuitars];
  const secBefore = player.currentSec;

  player.setNotesMuted(true);

  assert.equal(player.playing, true, 'the mute must not stop playback');
  assert.equal(player.events.length, eventsBefore, 'the mute must not rebuild the events');
  assert.deepEqual(player.enabledGuitars, enabledBefore, 'the mute must not touch the track mixer');
  assert.ok(
    Math.abs(player.currentSec - secBefore) < 0.05,
    'the mute must not move the position',
  );
  player.destroy();
}

// Unmuting brings the notes back.
{
  const player = loadPlayer();
  player.setNotesMuted(true);
  player.setNotesMuted(false);
  assert.equal(player.notesMuted, false);
  counts.oscillators = 0;
  await player.play({ fromSec: 0 });
  assert.ok(counts.oscillators > 0, 'the notes must sound again after unmuting');
  player.destroy();
}

// The metronome keeps the beat while the notes are muted, so a count-in and a
// click still work against a backing track.
{
  ensureAudio();
  const player = createGpMixPlayer();
  player.load({
    guitarModels: [model],
    drumModels: [],
    bpm: 120,
    metronomeEnabled: true,
  });
  player.setNotesMuted(true);
  counts.oscillators = 0;
  await player.play({ fromSec: 0 });
  assert.ok(
    counts.oscillators > 0,
    'the metronome must still schedule clicks while the notes are muted',
  );
  player.destroy();
}

console.log('notes-mute: ok');
