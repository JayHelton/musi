// Pack loader fallback, cancellation, and audio module size budget.
// Run: node tests/gp-player/pack-loader.mjs

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const AUDIO_DIR = join(ROOT, 'js/audio');
const MAX_AUDIO_BYTES = 153600;

function audioModuleBytes() {
  let total = 0;
  for (const name of readdirSync(AUDIO_DIR)) {
    if (!name.endsWith('.js')) continue;
    total += statSync(join(AUDIO_DIR, name)).size;
  }
  return total;
}

function makeAudioCtx() {
  return {
    decodeAudioData: async () => ({ duration: 0.01, numberOfChannels: 1, length: 1 }),
  };
}

const {
  loadPacksForScore,
  cancelLoad,
  getLoadState,
  __resetSampleLoaderForTests,
} = await import('../../js/audio/sampleLoader.js');
const { registerPack, __resetPackRegistryForTests } = await import('../../js/audio/samplePackRegistry.js');

function resetAll() {
  __resetSampleLoaderForTests();
  __resetPackRegistryForTests();
  globalThis.fetch = undefined;
  globalThis.caches = undefined;
}

// T043: js/audio/*.js must stay within 150 KiB.
const audioBytes = audioModuleBytes();
assert.ok(
  audioBytes <= MAX_AUDIO_BYTES,
  `js/audio/*.js is ${audioBytes} bytes; limit is ${MAX_AUDIO_BYTES}`,
);

resetAll();

// Missing pack / no registered pack -> fallback, no throw.
{
  const result = await loadPacksForScore({
    scoreId: 'score-a',
    programs: [27],
    drumNotes: [],
    audioCtx: makeAudioCtx(),
  });
  assert.equal(result.status, 'fallback');
  assert.equal(getLoadState('score-a').status, 'fallback');
}

resetAll();

// Score replace: delayed load for A, then load B cancels A.
{
  registerPack({
    id: 'delay-pack',
    version: '1',
    license: 'CC0-1.0',
    attribution: 'Test',
    sampleRate: 48000,
    instrument: 'Guitar',
    midiProgram: 27,
    samples: [{ file: 'a.wav' }, { file: 'b.wav' }],
  });

  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    await new Promise((r) => setTimeout(r, 30));
    return {
      ok: true,
      async arrayBuffer() {
        return new ArrayBuffer(8);
      },
      clone() {
        return this;
      },
    };
  };

  const ctx = makeAudioCtx();
  const loadA = loadPacksForScore({
    scoreId: 'score-a',
    programs: [27],
    drumNotes: [],
    audioCtx: ctx,
  });

  await new Promise((r) => setTimeout(r, 5));
  assert.equal(getLoadState('score-a').status, 'loading');

  const loadB = await loadPacksForScore({
    scoreId: 'score-b',
    programs: [27],
    drumNotes: [],
    audioCtx: ctx,
  });

  const resultA = await loadA;
  assert.equal(resultA.status, 'cancelled');
  assert.equal(getLoadState('score-a').status, 'cancelled');
  assert.equal(loadB.status, 'ready');
  assert.ok(Object.keys(loadB.buffers).length > 0);
  assert.equal(getLoadState('score-b').status, 'ready');
  assert.ok(fetchCount >= 2);
}

resetAll();

// cancelLoad(score A) cancels an in-flight session.
{
  registerPack({
    id: 'delay-pack-2',
    version: '1',
    license: 'CC0-1.0',
    attribution: 'Test',
    sampleRate: 48000,
    instrument: 'Guitar',
    midiProgram: 27,
    samples: [{ file: 'one.wav' }],
  });

  globalThis.fetch = async () => {
    await new Promise((r) => setTimeout(r, 50));
    return {
      ok: true,
      async arrayBuffer() {
        return new ArrayBuffer(8);
      },
      clone() {
        return this;
      },
    };
  };

  const ctx = makeAudioCtx();
  const pending = loadPacksForScore({
    scoreId: 'score-a',
    programs: [27],
    drumNotes: [],
    audioCtx: ctx,
  });

  await new Promise((r) => setTimeout(r, 5));
  cancelLoad('score-a');
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(getLoadState('score-a').status, 'cancelled');
}

console.log('gp-player pack-loader: ok');
