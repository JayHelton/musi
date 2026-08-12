/**
 * Source guard: genre modules and profile.music usage stay removed.
 * Run: node tests/genre-removal/run.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const JS_ROOT = join(REPO_ROOT, 'js');

const DELETED_MODULES = [
  'js/genreProfiles.js',
  'js/musicProfile.js',
  'js/studyRecommendations.js',
];

const PROFILE_MUSIC_ALLOWLIST = new Set([
  'sync/syncProfile.js',
  'sync/syncUI.js',
  'cloud/recordMap.js',
  'cloud/reconcile.js',
]);

const MODULE_IMPORT_RES = [
  /from\s+['"][^'"]*\bgenreProfiles(?:\.js)?['"]/,
  /import\s*\(\s*['"][^'"]*\bgenreProfiles(?:\.js)?['"]/,
  /from\s+['"][^'"]*\bmusicProfile(?:\.js)?['"]/,
  /import\s*\(\s*['"][^'"]*\bmusicProfile(?:\.js)?['"]/,
  /from\s+['"][^'"]*\bstudyRecommendations(?:\.js)?['"]/,
  /import\s*\(\s*['"][^'"]*\bstudyRecommendations(?:\.js)?['"]/,
];

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function walkJsFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walkJsFiles(full));
      continue;
    }
    if (name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function relJsPath(absPath) {
  return relative(JS_ROOT, absPath).replace(/\\/g, '/');
}

function findModuleImports() {
  const hits = [];
  for (const file of walkJsFiles(JS_ROOT)) {
    const content = readFileSync(file, 'utf8');
    for (const re of MODULE_IMPORT_RES) {
      if (re.test(content)) {
        hits.push(relJsPath(file));
        break;
      }
    }
  }
  return hits;
}

function findProfileMusicUsage() {
  const hits = [];
  for (const file of walkJsFiles(JS_ROOT)) {
    const rel = relJsPath(file);
    if (PROFILE_MUSIC_ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, 'utf8');
    if (content.includes('profile.music')) {
      hits.push(rel);
    }
  }
  return hits;
}

test('genre module files are deleted', () => {
  const present = DELETED_MODULES.filter(path => existsSync(join(REPO_ROOT, path)));
  assert.deepEqual(
    present,
    [],
    `expected these files to be absent: ${present.join(', ')}`,
  );
});

test('no js file imports genreProfiles, musicProfile, or studyRecommendations', () => {
  const importers = findModuleImports();
  assert.deepEqual(
    importers,
    [],
    `unexpected imports in: ${importers.join(', ')}`,
  );
});

test('profile.music is only referenced in sync passthrough allowlist', () => {
  const offenders = findProfileMusicUsage();
  assert.deepEqual(
    offenders,
    [],
    `profile.music outside allowlist in: ${offenders.join(', ')}`,
  );
});

test('index.html does not link css/study-recs.css', () => {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  assert.ok(
    !html.includes('css/study-recs.css'),
    'index.html still links css/study-recs.css',
  );
});

console.log(`\n${passed} tests passed`);
