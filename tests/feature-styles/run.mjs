/**
 * Feature stylesheet regression tests.
 * Run: node tests/feature-styles/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { featureStylesFor } from '../../js/ui/featureStyles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

function extractPrecacheUrls(swSource) {
  const block = swSource.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE_URLS block missing');
  const urls = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  return urls;
}

function featureIdsFromSource() {
  const src = readFileSync(join(root, 'js/ui/featureStyles.js'), 'utf8');
  const ids = [];
  const re = /^\s+(\w+):\s+\[/gm;
  let m;
  while ((m = re.exec(src))) ids.push(m[1]);
  return ids;
}

const GP_SCORE_FEATURES = ['gpplayer', 'workbooks', 'exercises'];

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('GP score features declare css/gpplayer.css', () => {
  for (const featureId of GP_SCORE_FEATURES) {
    const styles = featureStylesFor(featureId);
    assert.ok(
      styles.includes('css/gpplayer.css'),
      `${featureId} must list css/gpplayer.css, got ${styles.join(', ')}`,
    );
  }
});

test('every feature stylesheet is in service-worker precache', () => {
  const swSource = readFileSync(join(root, 'service-worker.js'), 'utf8');
  const precache = new Set(extractPrecacheUrls(swSource));
  const featureIds = featureIdsFromSource();
  assert.ok(featureIds.length >= 10);
  for (const featureId of featureIds) {
    for (const sheet of featureStylesFor(featureId)) {
      const normalized = sheet.replace(/^\.\//, '');
      assert.ok(
        precache.has(normalized) || precache.has(`./${normalized}`),
        `${sheet} from ${featureId} must be precached`,
      );
    }
  }
});

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
