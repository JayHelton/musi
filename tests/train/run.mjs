/**
 * Train workspace and practice bar tests.
 * Run: node tests/train/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { runPracticeBarTests } from './practice-bar.mjs';
import { runBuildSessionItemsTests } from './build-session-items.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

installDomShim();
const storage = installLocalStorageShim();
globalThis.window = globalThis;

const progressMod = await import('../../js/progress/progressLog.js');
progressMod.invalidateProgressLogCache();

const {
  TRAIN_SECTIONS,
  buildSessionItems,
  buildProgressModel,
} = await import('../../js/workspaces/train.js');

let passed = 0;

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    });
  }
  passed += 1;
  console.log(`ok  ${name}`);
}

function collectSectionMappings(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (obj.sectionId && obj.featureId) {
    out.push({ sectionId: obj.sectionId, featureId: obj.featureId });
    return out;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectSectionMappings(value, out);
  }
  return out;
}

function sectionIdsFromHtml() {
  const ids = new Set();
  const re = /id="(sec-[^"]+)"/g;
  let m;
  while ((m = re.exec(indexHtml))) ids.add(m[1]);
  return ids;
}

function makeRecordingDriver(initial = {}) {
  const calls = [];
  const state = {
    bpm: initial.bpm ?? 120,
    subdivision: initial.subdivision ?? 'quarter',
    beats: initial.beats ?? 4,
    accentFirst: initial.accentFirst ?? true,
    playing: false,
  };
  const log = (name, arg) => calls.push({ name, arg });
  return {
    calls,
    readState() { return { ...state }; },
    setBpm(bpm) { state.bpm = bpm; log('setBpm', bpm); },
    setSubdiv(subdiv) { state.subdivision = subdiv; log('setSubdiv', subdiv); },
    setBeats(beats) { state.beats = beats; log('setBeats', beats); },
    setAccentFirst(v) { state.accentFirst = v; log('setAccentFirst', v); },
    start() { state.playing = true; log('start', null); },
    stop() { state.playing = false; log('stop', null); },
    isPlaying() { return state.playing; },
    applyConfig(patch) {
      log('applyConfig', { ...patch });
      if (patch.bpm != null) state.bpm = patch.bpm;
      if (patch.subdivision != null) state.subdivision = patch.subdivision;
      if (patch.subdiv != null) state.subdivision = patch.subdiv;
      if (patch.beats != null) state.beats = patch.beats;
      if (patch.accentFirst != null) state.accentFirst = patch.accentFirst;
      if (patch.playing === true) state.playing = true;
      if (patch.playing === false) state.playing = false;
    },
    syncFrom(patch) { this.applyConfig(patch); },
  };
}

await test('TRAIN_SECTIONS maps every view param to a sec-* id in index.html', () => {
  const htmlSections = sectionIdsFromHtml();
  const mappings = collectSectionMappings(TRAIN_SECTIONS);
  assert.ok(mappings.length >= 10);
  for (const { sectionId } of mappings) {
    assert.ok(htmlSections.has(sectionId), `missing ${sectionId}`);
  }
});

runBuildSessionItemsTests({ test, buildSessionItems });

await test('buildProgressModel returns summaries due cold tests and weak areas', () => {
  progressMod.clearProgressLog();
  progressMod.invalidateProgressLogCache();
  const now = Date.parse('2026-03-10T12:00:00.000Z');
  progressMod.logAttempt({
    targetType: 'drill',
    targetId: 'scales',
    startedAt: '2026-03-08T12:00:00.000Z',
    accuracy: 0.9,
    status: 'green',
    bpm: 100,
  });
  progressMod.logAttempt({
    targetType: 'drill',
    targetId: 'intervals',
    startedAt: '2026-03-09T12:00:00.000Z',
    accuracy: 0.4,
    status: 'red',
    bpm: 80,
  });
  progressMod.logAttempt({
    targetType: 'drill',
    targetId: 'intervals',
    startedAt: '2026-03-09T14:00:00.000Z',
    accuracy: 0.35,
    status: 'yellow',
    bpm: 82,
  });
  progressMod.logAttempt({
    targetType: 'exercise',
    targetId: 'ex-master',
    startedAt: '2026-03-01T12:00:00.000Z',
    accuracy: 1,
    status: 'blue',
    bpm: 120,
  });

  const model = buildProgressModel(now);
  assert.ok(model.today);
  assert.equal(model.recent.length, 4);
  assert.ok(model.recent[0].label);
  assert.ok(model.dueColdTests.length >= 1);
  assert.ok(model.weakAreas.length >= 1);
  assert.equal(model.weakAreas[0].targetId, 'intervals');
});

await test('buildProgressModel empty state is intentional', () => {
  progressMod.clearProgressLog();
  progressMod.invalidateProgressLogCache();
  const model = buildProgressModel();
  assert.equal(model.recent.length, 0);
  assert.equal(model.dueColdTests.length, 0);
  assert.equal(model.weakAreas.length, 0);
  assert.equal(model.hasData, false);
});

await runPracticeBarTests({
  test,
  installDomShim,
  installLocalStorageShim: () => storage,
  makeRecordingDriver,
  progressMod,
});

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
