// Assert every GP player module sits in service-worker.js PRECACHE_URLS.
// Run: node tests/gp-player/offline-manifest.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function walkJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkJsFiles(full));
    } else if (name.endsWith('.js')) {
      out.push(relative(ROOT, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function collectRequiredModules() {
  const files = new Set();

  for (const f of walkJsFiles(join(ROOT, 'js/gpPlayer'))) {
    files.add(f);
  }

  for (const name of readdirSync(join(ROOT, 'js'))) {
    if (name.endsWith('.js') && /^gp/i.test(name)) {
      files.add(`js/${name}`);
    }
  }

  const tabPattern = /^(gp|guitarPro|tabModel|tabPlayer|metroClick|playOrder|scoreTimeline|tabAnalyzer|tabAnalysisView)/;
  for (const name of readdirSync(join(ROOT, 'js/tab'))) {
    if (!name.endsWith('.js')) continue;
    const base = name.slice(0, -3);
    if (tabPattern.test(base)) {
      files.add(`js/tab/${name}`);
    }
  }

  files.add('css/gpplayer.css');
  files.add('js/audio.js');
  files.add('js/drums/drumEngine.js');

  // Inventory files that were missing from an earlier precache list.
  files.add('js/gpPlayer/layoutMetrics.js');
  files.add('js/gpPlayer/viewModes.js');
  files.add('js/gpExerciseScore.js');

  return [...files].sort();
}

function extractPrecacheUrls(swText) {
  const block = swText.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE_URLS array in service-worker.js');
  const urls = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(block[1])) !== null) {
    urls.push(m[1]);
  }
  return new Set(urls);
}

const swText = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
const precache = extractPrecacheUrls(swText);
const required = collectRequiredModules();
const missing = required.filter((path) => !precache.has(path));

if (missing.length > 0) {
  console.error('Missing from PRECACHE_URLS:');
  for (const path of missing) {
    console.error(`  ${path}`);
  }
  process.exit(1);
}

console.log('gp-player offline-manifest: ok');
