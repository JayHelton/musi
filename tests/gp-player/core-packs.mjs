// Core pack manifest validation against assets on disk.
// Run: node tests/gp-player/core-packs.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackManifest } from '../../js/audio/samplePackRegistry.js';
import { CORE_PACK_IDS } from '../../js/audio/packCatalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const PACKS_DIR = join(ROOT, 'assets/audio/packs');

function isForeignFileUrl(file) {
  if (typeof file !== 'string' || !file) return true;
  if (file.includes('..')) return true;
  if (file.startsWith('/') || /^[a-zA-Z]:/.test(file)) return true;
  if (/^https?:\/\//i.test(file)) return true;
  return false;
}

function mp3Count(packDir) {
  if (!existsSync(packDir)) return 0;
  return readdirSync(packDir).filter((n) => n.endsWith('.mp3')).length;
}

for (const packId of CORE_PACK_IDS) {
  const packDir = join(PACKS_DIR, packId);
  const manifestPath = join(packDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.log(`core-packs: skip ${packId} (no manifest yet)`);
    continue;
  }

  const json = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const parsed = parsePackManifest(json);
  assert.equal(parsed.ok, true, `${packId} manifest must parse`);

  for (const sample of parsed.manifest.samples || []) {
    if (sample.file) {
      assert.equal(isForeignFileUrl(sample.file), false, `${packId} sample path must be same-origin`);
    }
  }

  const mp3s = mp3Count(packDir);
  if (mp3s > 0) {
    assert.ok(
      parsed.manifest.samples.length > 0,
      `${packId} has mp3 files but samples array is empty`,
    );
    for (const sample of parsed.manifest.samples) {
      if (!sample.file) continue;
      assert.equal(
        existsSync(join(packDir, sample.file)),
        true,
        `${packId} missing sample file ${sample.file}`,
      );
    }
  }
}

console.log('core-packs.mjs: all checks passed');
