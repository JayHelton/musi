/**
 * Zero-dependency Node tests for the sound preferences.
 * Run: node tests/sounds/run.mjs
 */

import assert from 'node:assert/strict';

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
  METRO_VOICES,
  BASIC_WAVES,
  DEFAULT_SCORE_VOICE,
  DEFAULT_METRO_VOICE,
  getScoreVoice,
  setScoreVoice,
  getMetroVoice,
  setMetroVoice,
  normalizeScoreVoice,
  normalizeMetroVoice,
  scoreVoiceUsesPacks,
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

console.log(`\nsounds tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
