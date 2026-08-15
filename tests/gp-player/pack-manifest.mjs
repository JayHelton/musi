// Pack manifest contract tests (T038, T042, T043).
// Run: node tests/gp-player/pack-manifest.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePackManifest,
  registerPack,
  packsForPrograms,
  __resetPackRegistryForTests,
} from '../../js/audio/samplePackRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const FIXTURE = join(ROOT, 'tests/gp-player/fixtures/packs/empty-core/manifest.json');

const BASE_MANIFEST = {
  id: 'test-pack',
  version: '1',
  license: 'CC0-1.0',
  attribution: 'Test',
  sampleRate: 48000,
  instrument: 'Test',
  midiProgram: 27,
  samples: [],
};

// T038: valid empty samples from fixture
const fixtureJson = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const valid = parsePackManifest(fixtureJson);
assert.equal(valid.ok, true, 'valid empty samples must parse');
assert.equal(valid.manifest.id, 'empty-core');

// T038: missing id
const missingId = parsePackManifest({ ...BASE_MANIFEST, id: '' });
assert.equal(missingId.ok, false, 'missing id must fail');

// T038: foreign file URL
const foreignUrl = parsePackManifest({
  ...BASE_MANIFEST,
  samples: [{ file: 'https://evil.example/kick.wav' }],
});
assert.equal(foreignUrl.ok, false, 'foreign file URL must fail');

// T038: path escape
const pathEscape = parsePackManifest({
  ...BASE_MANIFEST,
  samples: [{ file: '../secret.wav' }],
});
assert.equal(pathEscape.ok, false, 'path escape must fail');

// T038: packsForPrograms with no packs
__resetPackRegistryForTests();
assert.deepEqual(packsForPrograms([27]), [], 'no packs must return empty list');

// T038: packsForPrograms after registerPack
const reg = registerPack({ ...BASE_MANIFEST, id: 'pitched-27' });
assert.equal(reg.ok, true);
const ids = packsForPrograms([27]);
assert.ok(ids.includes('pitched-27'), 'registered pack must cover program 27');

// T042: cache name pattern in sampleLoader source
const loaderSource = readFileSync(join(ROOT, 'js/audio/sampleLoader.js'), 'utf8');
assert.ok(loaderSource.includes('musi-pack-'), 'loader must use musi-pack- cache prefix');
assert.ok(
  loaderSource.includes('musi-pack-${pack.id}-${pack.version}') ||
    loaderSource.includes('`musi-pack-${pack.id}-${pack.version}`'),
  'cache name must be musi-pack- + id + - + version',
);
assert.ok(!loaderSource.includes('PRECACHE_URLS'), 'loader must not write PRECACHE_URLS');

// T043: sound-engine size budget (150 KiB before compression)
const AUDIO_DIR = join(ROOT, 'js/audio');
const MAX_BYTES = 153600;
let totalBytes = 0;
for (const name of readdirSync(AUDIO_DIR)) {
  if (!name.endsWith('.js')) continue;
  totalBytes += statSync(join(AUDIO_DIR, name)).size;
}
assert.ok(
  totalBytes <= MAX_BYTES,
  `js/audio/*.js is ${totalBytes} bytes; limit is ${MAX_BYTES}`,
);

console.log('pack-manifest.mjs: all checks passed');
