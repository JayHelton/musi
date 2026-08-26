/**
 * Zero-dependency Node tests for the sound preferences.
 * It also runs the importer tests in `import.mjs` and the archive install
 * tests in `install.mjs`.
 * Run: node tests/sounds/run.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  return store;
}

installLocalStorageShim();
globalThis.window = globalThis;

const {
  SCORE_VOICES,
  DRUM_VOICES,
  PITCH_VOICES,
  METRO_VOICES,
  BASIC_WAVES,
  DEFAULT_SCORE_VOICE,
  DEFAULT_DRUM_VOICE,
  DEFAULT_PITCH_VOICE,
  DEFAULT_METRO_VOICE,
  getScoreVoice,
  setScoreVoice,
  getDrumVoice,
  setDrumVoice,
  getPitchVoice,
  setPitchVoice,
  getMetroVoice,
  setMetroVoice,
  normalizeScoreVoice,
  normalizeDrumVoice,
  normalizePitchVoice,
  normalizeMetroVoice,
  scoreVoiceUsesPacks,
  drumVoiceUsesPacks,
  pitchVoiceUsesPacks,
  voiceWave,
  voiceUserSoundId,
  userVoiceId,
} = await import('../../js/audio/soundPrefs.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}

test('the default voices are the sample packs and the wood block', () => {
  assert.equal(DEFAULT_SCORE_VOICE, 'packs');
  assert.equal(DEFAULT_METRO_VOICE, 'woodblock');
  assert.equal(getScoreVoice(), 'packs');
  assert.equal(getMetroVoice(), 'woodblock');
});

test('every list offers the four basic waves', () => {
  for (const list of [SCORE_VOICES, METRO_VOICES]) {
    for (const wave of BASIC_WAVES) {
      assert.ok(
        list.some((v) => v.id === `wave-${wave.id}`),
        `${wave.id} is missing`,
      );
    }
  }
});

test('an unknown id falls back to the default', () => {
  assert.equal(normalizeScoreVoice('nope'), 'packs');
  assert.equal(normalizeScoreVoice(''), 'packs');
  assert.equal(normalizeScoreVoice(null), 'packs');
  assert.equal(normalizeMetroVoice('nope'), 'woodblock');
  // A metronome voice is not a score voice and the other way round.
  assert.equal(normalizeScoreVoice('cowbell'), 'packs');
  assert.equal(normalizeMetroVoice('synth'), 'woodblock');
});

test('a saved voice survives a read', () => {
  setScoreVoice('wave-square');
  assert.equal(getScoreVoice(), 'wave-square');
  setMetroVoice('cowbell');
  assert.equal(getMetroVoice(), 'cowbell');
});

test('a voice names a wave, an installed sound, or neither', () => {
  assert.equal(voiceWave('wave-sawtooth'), 'sawtooth');
  assert.equal(voiceWave('wave-nope'), null);
  assert.equal(voiceWave('packs'), null);
  assert.equal(voiceUserSoundId('user:snd-1'), 'snd-1');
  assert.equal(voiceUserSoundId('user:'), null);
  assert.equal(voiceUserSoundId('packs'), null);
  assert.equal(userVoiceId('snd-1'), 'user:snd-1');
});

test('only the sample voices need a pack download', () => {
  assert.equal(scoreVoiceUsesPacks('packs'), true);
  assert.equal(scoreVoiceUsesPacks('user:pack-1'), true);
  assert.equal(scoreVoiceUsesPacks('synth'), false);
  assert.equal(scoreVoiceUsesPacks('wave-sine'), false);
});

test('an installed sound id stays valid after a round trip', () => {
  const id = userVoiceId('snd-abc');
  setMetroVoice(id);
  assert.equal(getMetroVoice(), id);
  setScoreVoice(userVoiceId('pack-abc'));
  assert.equal(getScoreVoice(), 'user:pack-abc');
});

test('the percussion voice and the pitch voice have their own defaults', () => {
  assert.equal(DEFAULT_DRUM_VOICE, 'packs');
  assert.equal(DEFAULT_PITCH_VOICE, 'tone');
  assert.equal(getDrumVoice(), 'packs');
  assert.equal(getPitchVoice(), 'tone');
});

test('the four surfaces keep four separate settings', () => {
  setScoreVoice('synth');
  setDrumVoice('synth');
  setPitchVoice('wave-square');
  setMetroVoice('cowbell');
  assert.equal(getScoreVoice(), 'synth');
  assert.equal(getDrumVoice(), 'synth');
  assert.equal(getPitchVoice(), 'wave-square');
  assert.equal(getMetroVoice(), 'cowbell');

  // One choice never moves another.
  setScoreVoice('packs');
  assert.equal(getDrumVoice(), 'synth');
  assert.equal(getPitchVoice(), 'wave-square');
});

test('a voice of one surface is not a voice of another', () => {
  // The percussion list has no wave and no trainer tone.
  assert.equal(normalizeDrumVoice('wave-sine'), 'packs');
  assert.equal(normalizeDrumVoice('tone'), 'packs');
  // The pitch list has no metronome click.
  assert.equal(normalizePitchVoice('cowbell'), 'tone');
  // The score list has no trainer tone.
  assert.equal(normalizeScoreVoice('tone'), 'packs');
});

test('the percussion list offers a sample kit and a modeled kit', () => {
  assert.deepEqual(DRUM_VOICES.map((v) => v.id), ['packs', 'synth']);
});

test('the pitch list offers the trainer tone, the samples, and the waves', () => {
  assert.equal(PITCH_VOICES[0].id, 'tone');
  assert.ok(PITCH_VOICES.some((v) => v.id === 'packs'));
  for (const wave of BASIC_WAVES) {
    assert.ok(PITCH_VOICES.some((v) => v.id === `wave-${wave.id}`), `${wave.id} is missing`);
  }
});

test('each surface downloads samples only for its own sample voices', () => {
  assert.equal(drumVoiceUsesPacks('packs'), true);
  assert.equal(drumVoiceUsesPacks('user:pack-1'), true);
  assert.equal(drumVoiceUsesPacks('synth'), false);
  assert.equal(pitchVoiceUsesPacks('packs'), true);
  assert.equal(pitchVoiceUsesPacks('user:pack-1'), true);
  assert.equal(pitchVoiceUsesPacks('tone'), false);
  assert.equal(pitchVoiceUsesPacks('wave-sine'), false);
});

console.log(`\nsounds tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);

let childFailed = false;
for (const file of ['import.mjs', 'install.mjs']) {
  const child = spawnSync(process.execPath, [join(__dirname, file)], { stdio: 'inherit' });
  if (child.status !== 0) childFailed = true;
}
if (failed || childFailed) process.exit(1);
