// Sample voice picker and core pack registration tests.
// Run: node tests/gp-player/sample-voice.mjs

import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickPitchedSample, pickDrumSample } from '../../js/audio/sampleVoice.js';
import { registerCorePacks } from '../../js/audio/packCatalog.js';
import { __resetPackRegistryForTests } from '../../js/audio/samplePackRegistry.js';
import { packBufferKey } from '../../js/audio/sampleLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const PITCH_MANIFEST = {
  id: 'test-pitch',
  version: '1',
  license: 'CC0-1.0',
  attribution: 'Test',
  sampleRate: 48000,
  instrument: 'Test',
  midiProgram: 27,
  samples: [
    { file: 'n40.mp3', rootMidi: 40, velocityMin: 0, velocityMax: 1, articulation: 'sustain' },
    { file: 'n52.mp3', rootMidi: 52, velocityMin: 0, velocityMax: 1, articulation: 'sustain' },
    { file: 'n70.mp3', rootMidi: 70, velocityMin: 0, velocityMax: 1, articulation: 'sustain' },
  ],
};

const DRUM_MANIFEST = {
  id: 'test-drums',
  version: '1',
  license: 'CC0-1.0',
  attribution: 'Test',
  sampleRate: 48000,
  instrument: 'Drums',
  drumNoteMap: { 36: 'kick', 38: 'snare', 42: 'hihatClosed' },
  samples: [
    { file: 'kick.mp3', rootMidi: 36, articulation: 'kick' },
    { file: 'snare.mp3', rootMidi: 38, articulation: 'snare' },
    { file: 'hihatClosed.mp3', rootMidi: 42, articulation: 'hihatClosed' },
  ],
};

assert.equal(packBufferKey('core-guitar', 'n40.mp3'), 'core-guitar/n40.mp3');

// pickPitchedSample: nearest rootMidi
const near = pickPitchedSample(PITCH_MANIFEST, 43, 0.8);
assert.equal(near?.rootMidi, 40, 'midi 43 must pick root 40');

// pickPitchedSample: reject when farther than 7 semitones
const far = pickPitchedSample(PITCH_MANIFEST, 80, 0.8);
assert.equal(far, null, 'midi 80 must be rejected (nearest is 70, dist 10)');

// pickDrumSample: match drumNoteMap
const kick = pickDrumSample(DRUM_MANIFEST, 36);
assert.equal(kick?.articulation, 'kick', 'midi 36 must map to kick');

const snareByName = pickDrumSample(DRUM_MANIFEST, 'snare');
assert.equal(snareByName?.file, 'snare.mp3', 'articulation snare must match sample');

// registerCorePacks: must not throw when fetch is missing
__resetPackRegistryForTests();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('network unavailable');
};
let threw = false;
try {
  const result = await registerCorePacks();
  assert.equal(typeof result.ok, 'boolean');
  assert.ok(Array.isArray(result.registered));
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0, 'failed fetch must record errors');
} catch (e) {
  threw = true;
}
assert.equal(threw, false, 'registerCorePacks must not throw');
globalThis.fetch = originalFetch;

console.log('sample-voice.mjs: all checks passed');
