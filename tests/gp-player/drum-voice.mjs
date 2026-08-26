// The percussion tracks answer to their own voice setting.
// A kit the user picks plays its samples; the modeled kit plays instead when
// the user asks for it, and the pitched voice never changes either choice.
// Run: node tests/gp-player/drum-voice.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';

// The score holds percussion only and the metronome is off, so an oscillator
// can come from the modeled kit alone.
const counts = { packHits: 0, oscillators: 0 };

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

function makeAudioNode(extra = {}) {
  return {
    // The drum model chains `connect(a).connect(b)`, so a connect returns the
    // node it feeds.
    connect(target) { return target; },
    disconnect() {},
    start() {},
    stop() {},
    frequency: makeAudioParam(440),
    detune: makeAudioParam(0),
    Q: makeAudioParam(1),
    pan: makeAudioParam(0),
    gain: makeAudioParam(1),
    playbackRate: makeAudioParam(1),
    threshold: makeAudioParam(-24),
    knee: makeAudioParam(30),
    ratio: makeAudioParam(12),
    attack: makeAudioParam(0.003),
    release: makeAudioParam(0.25),
    fftSize: 2048,
    ...extra,
  };
}

/** A buffer that a pack decoded, so a hit that plays it is a sample hit. */
const PACK_BUFFER = { duration: 0.2, numberOfChannels: 1, length: 8, __pack: true };

function installAudioStub() {
  class FakeAudioContext {
    constructor() {
      this._time = 0;
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = makeAudioNode();
    }
    get currentTime() { return this._time; }
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
    createBuffer(channels, length, sampleRate) {
      return {
        duration: length / sampleRate,
        numberOfChannels: channels,
        length,
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      const node = makeAudioNode();
      let held = null;
      Object.defineProperty(node, 'buffer', {
        get: () => held,
        set: (value) => {
          held = value;
          if (value && value.__pack) counts.packHits += 1;
        },
      });
      return node;
    }
    decodeAudioData() { return Promise.resolve(PACK_BUFFER); }
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
// A destructured import copies the value, and `audioCtx` is null until
// `ensureAudio` runs. Keep the namespace so the context reads live.
const audioMod = await import('../../js/audio.js');
const { registerPack, __resetPackRegistryForTests } = await import('../../js/audio/samplePackRegistry.js');
const { loadPacksForScore, registerPackFileSource, __resetSampleLoaderForTests } =
  await import('../../js/audio/sampleLoader.js');
const {
  setScoreVoice, setDrumVoice, getDrumVoice, getScoreVoice, userVoiceId,
} = await import('../../js/audio/soundPrefs.js');

const KIT_PACK_ID = 'user-test-kit';

/** The kit manifest an import writes: single keys mapped onto Musi lanes. */
const KIT_MANIFEST = {
  id: KIT_PACK_ID,
  version: '1',
  license: 'Not stated',
  attribution: 'Imported on this device',
  sampleRate: 44100,
  instrument: 'Test kit',
  midiProgram: null,
  pickOnly: true,
  drumNoteMap: { 36: 'kick', 38: 'snare', 42: 'hihatClosed' },
  samples: [
    { file: 'kick.wav', rootMidi: 36, articulation: 'kick', gainTrim: 1 },
    { file: 'snare.wav', rootMidi: 38, articulation: 'snare', gainTrim: 1 },
    { file: 'hat.wav', rootMidi: 42, articulation: 'hihatClosed', gainTrim: 1 },
  ],
};

// The kit sits on this device, so it reads its files from a local source.
registerPackFileSource(KIT_PACK_ID, async () => new Blob([new Uint8Array([1, 2, 3, 4])]));
assert.equal(registerPack(KIT_MANIFEST).ok, true);

const drumModel = {
  events: [
    { start: 0, duration: 1, midi: 36, instrument: 'kick', velocity: 0.9 },
    { start: 1, duration: 1, midi: 38, instrument: 'snare', velocity: 0.8 },
    { start: 2, duration: 1, midi: 42, instrument: 'hihatClosed', velocity: 0.6 },
    { start: 3, duration: 1, midi: 38, instrument: 'snare', velocity: 0.8 },
  ],
  measures: [{ startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 4 }],
  tempo: 120,
  totalBeats: 4,
};

const SCORE_ID = 'drum-voice-score';

async function loadKitSamples() {
  const result = await loadPacksForScore({
    scoreId: SCORE_ID,
    programs: [],
    drumNotes: [],
    audioCtx: audioMod.audioCtx,
    extraPackIds: [KIT_PACK_ID],
  });
  assert.equal(result.status, 'ready', `pack load: ${result.error}`);
}

function loadPlayer() {
  const player = createGpMixPlayer();
  player.load({
    guitarModels: [],
    drumModels: [drumModel],
    bpm: 120,
    metronomeEnabled: false,
    scoreId: SCORE_ID,
  });
  return player;
}

audioMod.ensureAudio();
await loadKitSamples();

// The user picks the imported kit for the percussion tracks.
{
  // Stand in for the Settings choice: the pack id the sound record names.
  const { saveSetting } = await import('../../js/persistence.js');
  const sounds = await import('../../js/audio/userSounds.js');
  saveSetting('sound.userSounds', [{
    id: 'snd-kit', kind: 'instrument', packKind: 'percussion', format: 'multisample',
    name: 'Test kit', manifest: KIT_MANIFEST, files: {}, addedAt: new Date().toISOString(),
  }]);
  assert.equal(sounds.userPackManifestId('snd-kit'), KIT_PACK_ID, 'the record names its pack');

  setDrumVoice(userVoiceId('snd-kit'));
  setScoreVoice('synth');
  counts.packHits = 0;
  counts.oscillators = 0;
  const player = loadPlayer();
  await player.play({ fromSec: 0 });
  assert.equal(player.drumSource, 'pack', 'the percussion tracks play the pack');
  assert.equal(player.playbackSource, 'synth', 'the pitched tracks still play the model');
  // The player schedules a lookahead window, so the first hits are enough to
  // show which kit sounds.
  assert.ok(counts.packHits > 0, 'a hit plays a pack sample');
  assert.equal(counts.oscillators, 0, `the sample kit runs no modeled voice; got ${counts.oscillators}`);
  player.destroy();
}

// The modeled kit plays no sample, whatever the pitched voice is.
{
  setDrumVoice('synth');
  setScoreVoice('packs');
  counts.packHits = 0;
  counts.oscillators = 0;
  const player = loadPlayer();
  await player.play({ fromSec: 0 });
  assert.equal(player.drumSource, 'synth', 'the percussion tracks play the model');
  assert.equal(counts.packHits, 0, `the modeled kit plays no sample; got ${counts.packHits}`);
  assert.ok(counts.oscillators > 0, 'the modeled kit still sounds');
  player.destroy();
}

// The pitched voice never moves the percussion choice.
{
  setDrumVoice(userVoiceId('snd-kit'));
  setScoreVoice('wave-square');
  assert.equal(getDrumVoice(), 'user:snd-kit');
  assert.equal(getScoreVoice(), 'wave-square');
}

__resetSampleLoaderForTests();
__resetPackRegistryForTests();

console.log('gp-player drum voice: ok');
