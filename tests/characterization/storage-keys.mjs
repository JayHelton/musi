/**
 * Characterization tests for Musi storage key contracts.
 * Run: node tests/characterization/storage-keys.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { ROUTINES_STORAGE_KEY } from '../../js/routineModel.js';
import { WORKBOOKS_STORAGE_KEY } from '../../js/workbookModel.js';
import { FEATURES_ENABLED_KEY } from '../../js/tools.js';
import { MASTERY_V2_KEY } from '../../js/interval-map/progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

function readSource(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

function assertSourceContains(relPath, literal) {
  const src = readSource(relPath);
  assert.ok(
    src.includes(literal),
    `expected ${relPath} to reference storage key ${JSON.stringify(literal)}`,
  );
}

export const DEDICATED_LOCAL_STORAGE_KEYS = Object.freeze([
  'musi:settings',
  'musi.notes',
  'musi.songs',
  'musi.exercises',
  WORKBOOKS_STORAGE_KEY,
  ROUTINES_STORAGE_KEY,
  'musi.gpAnnotations',
  'musi.gpAutoFollow',
  'musi.gpParchmentZoom',
  'musi.gpMetroPrefs',
]);

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

async function freshPersistence() {
  const shim = installLocalStorageShim();
  globalThis.window = globalThis;
  const persistence = await import('../../js/persistence.js');
  persistence.invalidateSettingsCache();
  return { ...persistence, shim };
}

// --- persistence.js (musi:settings) ----------------------------------------

await test('persistence uses single musi:settings key', async () => {
  const {
    getSetting,
    saveSetting,
    saveSettings,
    invalidateSettingsCache,
    shim,
  } = await freshPersistence();

  assert.equal(shim.store.size, 0);

  saveSetting('context.root', 'D');
  const raw = shim.store.get('musi:settings');
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed['context.root'], 'D');

  invalidateSettingsCache();
  assert.equal(getSetting('context.root', 'C'), 'D');

  saveSettings({ 'context.scale': 'Dorian', 'metro.bpm': 100 });
  assert.equal(getSetting('context.scale', ''), 'Dorian');
  assert.equal(getSetting('metro.bpm', 0), 100);
  assert.equal(getSetting('context.root', ''), 'D');

  assert.equal(getSetting('missing.key', 'fallback'), 'fallback');

  saveSetting('kb.wave', 'sawtooth');
  invalidateSettingsCache();
  assert.equal(getSetting('kb.wave', 'sine', ['sine', 'triangle']), 'sine');
  assert.equal(getSetting('kb.wave', 'sine', ['sine', 'triangle', 'square', 'sawtooth']), 'sawtooth');

  shim.store.set('musi:settings', '{not json');
  invalidateSettingsCache();
  assert.equal(getSetting('context.root', 'C'), 'C');
  assert.doesNotThrow(() => getSetting('context.root', 'C'));
});

await test('saveSetting round-trips and allowed-values validation rejects invalid values', async () => {
  const { getSetting, saveSetting, invalidateSettingsCache } = await freshPersistence();

  saveSetting('context.rootMode', 'random');
  assert.equal(getSetting('context.rootMode', 'fixed', ['fixed', 'linear', 'random']), 'random');

  saveSetting('context.rootMode', 'invalid-mode');
  invalidateSettingsCache();
  assert.equal(getSetting('context.rootMode', 'fixed', ['fixed', 'linear', 'random']), 'fixed');
});

// --- dedicated localStorage keys -------------------------------------------

await test('dedicated localStorage keys are frozen and modules still declare them', async () => {
  assert.deepEqual(DEDICATED_LOCAL_STORAGE_KEYS, [
    'musi:settings',
    'musi.notes',
    'musi.songs',
    'musi.exercises',
    'musi.workbooks',
    'musi.routines',
    'musi.gpAnnotations',
    'musi.gpAutoFollow',
    'musi.gpParchmentZoom',
    'musi.gpMetroPrefs',
  ]);
  assert.ok(Object.isFrozen(DEDICATED_LOCAL_STORAGE_KEYS));

  assert.equal(ROUTINES_STORAGE_KEY, 'musi.routines');
  assert.equal(WORKBOOKS_STORAGE_KEY, 'musi.workbooks');

  assertSourceContains('js/persistence.js', "'musi:settings'");
  assertSourceContains('js/notes.js', "'musi.notes'");
  assertSourceContains('js/songwriter.js', "'musi.songs'");
  assertSourceContains('js/exercises.js', "'musi.exercises'");
  assertSourceContains('js/gpAnnotations.js', "'musi.gpAnnotations'");
  assertSourceContains('js/gpPlayer/playerState.js', "'musi.gpAutoFollow'");
  assertSourceContains('js/gpPlayer/playerState.js', "'musi.gpParchmentZoom'");
  assertSourceContains('js/gpPlayer/metronomeState.js', "'musi.gpMetroPrefs'");
});

await test('settings subkeys used by fixtures remain wired in source', async () => {
  assert.equal(FEATURES_ENABLED_KEY, 'features.enabled');
  assert.equal(MASTERY_V2_KEY, 'io.masteryV2');
  assertSourceContains('js/musicProfile.js', "'profile.music'");
  assertSourceContains('js/studyProgress.js', "'study.progress'");
  assertSourceContains('js/stats.js', "'stats'");
  assertSourceContains('js/musicalContext.js', "'context.root'");
  assertSourceContains('js/musicalContext.js', "'context.scale'");
  assertSourceContains('js/musicalContext.js', "'context.tempo'");
  assertSourceContains('js/musicalContext.js', "'context.rootMode'");
  assertSourceContains('js/musicalContext.js', "'context.scaleMode'");
});

// --- IndexedDB names -------------------------------------------------------

await test('IndexedDB database and store names are unchanged', async () => {
  assertSourceContains('js/attachments.js', "'musi-attachments'");
  assertSourceContains('js/attachments.js', "'files'");
  assertSourceContains('js/drums/drumPatternDb.js', "'musi-drums'");
  assertSourceContains('js/drums/drumPatternDb.js', "'patterns'");
});

// --- musicalContext.js -----------------------------------------------------

await test('musicalContext persists exactly five context.* keys and documented defaults', async () => {
  const shim = installLocalStorageShim();
  globalThis.window = globalThis;
  const { invalidateSettingsCache } = await import('../../js/persistence.js');
  invalidateSettingsCache();

  const { getContext, setContext, ITERATION_MODES } = await import('../../js/musicalContext.js');

  const defaults = getContext();
  assert.equal(defaults.root, 'C');
  assert.equal(defaults.scale, 'Major (Ionian)');
  assert.equal(defaults.tempo, 120);
  assert.equal(defaults.rootMode, 'fixed');
  assert.equal(defaults.scaleMode, 'fixed');
  assert.deepEqual(ITERATION_MODES, ['fixed', 'linear', 'random']);

  setContext({
    root: 'F',
    scale: 'Dorian',
    tempo: 140,
    rootMode: 'random',
    scaleMode: 'linear',
  }, 'test');

  const stored = JSON.parse(shim.store.get('musi:settings'));
  assert.equal(stored['context.root'], 'F');
  assert.equal(stored['context.scale'], 'Dorian');
  assert.equal(stored['context.tempo'], 140);
  assert.equal(stored['context.rootMode'], 'random');
  assert.equal(stored['context.scaleMode'], 'linear');

  const contextKeys = Object.keys(stored).filter((k) => k.startsWith('context.'));
  assert.deepEqual(contextKeys.sort(), [
    'context.root',
    'context.rootMode',
    'context.scale',
    'context.scaleMode',
    'context.tempo',
  ]);
});

console.log(`\n${passed} tests passed`);
