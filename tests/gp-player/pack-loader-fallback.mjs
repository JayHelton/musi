// Pack loader fallback contract tests (T041).
// Run: node tests/gp-player/pack-loader-fallback.mjs

import assert from 'node:assert/strict';
import {
  registerPack,
  __resetPackRegistryForTests,
} from '../../js/audio/samplePackRegistry.js';
import {
  loadPacksForScore,
  getPlaybackSourceState,
  __resetSampleLoaderForTests,
} from '../../js/audio/sampleLoader.js';

const PITCHED_PACK = {
  id: 'loader-test',
  version: '1',
  license: 'CC0-1.0',
  attribution: 'Test',
  sampleRate: 48000,
  instrument: 'Test guitar',
  midiProgram: 27,
  samples: [{ file: 'note.wav' }],
};

function makeAudioCtx(decodeImpl) {
  return {
  decodeAudioData: decodeImpl || (async () => ({ duration: 0.1, length: 1 })),
  };
}

async function runNoThrow(fn) {
  let threw = false;
  try {
    return await fn();
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'loadPacksForScore must not throw');
  return null;
}

// no pack → fallback, no throw
__resetPackRegistryForTests();
__resetSampleLoaderForTests();
const noPack = await runNoThrow(() =>
  loadPacksForScore({
    scoreId: 'no-pack',
    programs: [27],
    drumNotes: [],
    audioCtx: makeAudioCtx(),
  }),
);
assert.equal(noPack.status, 'fallback');
assert.equal(getPlaybackSourceState('no-pack'), 'Synth fallback');

// decode failure → fallback, no throw
__resetPackRegistryForTests();
__resetSampleLoaderForTests();
registerPack(PITCHED_PACK);
const prevFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  clone() {
    return this;
  },
  async arrayBuffer() {
    return new ArrayBuffer(8);
  },
});
const decodeFail = await runNoThrow(() =>
  loadPacksForScore({
    scoreId: 'decode-fail',
    programs: [27],
    drumNotes: [],
    audioCtx: makeAudioCtx(async () => {
      throw new Error('decode failed');
    }),
  }),
);
globalThis.fetch = prevFetch;
assert.equal(decodeFail.status, 'fallback');

// storage reject: caches.open rejects; no throw
__resetPackRegistryForTests();
__resetSampleLoaderForTests();
registerPack(PITCHED_PACK);
const prevCaches = globalThis.caches;
globalThis.caches = {
  async open() {
    throw new Error('storage rejected');
  },
};
globalThis.fetch = async () => ({
  ok: true,
  clone() {
    return this;
  },
  async arrayBuffer() {
    return new ArrayBuffer(8);
  },
});
const storageReject = await runNoThrow(() =>
  loadPacksForScore({
    scoreId: 'storage-reject',
    programs: [27],
    drumNotes: [],
    audioCtx: makeAudioCtx(),
  }),
);
globalThis.caches = prevCaches;
globalThis.fetch = prevFetch;
assert.ok(
  storageReject.status === 'ready' || storageReject.status === 'fallback',
  'storage reject must return ready or fallback',
);

console.log('pack-loader-fallback.mjs: all checks passed');
