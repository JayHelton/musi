/**
 * Shell navigation refactor smoke tests.
 * Run: node tests/shell/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { runShellRegressions } from './regressions.mjs';
import { FEATURES } from '../../js/featureRegistry.js';
import {
  FEATURE_ADAPTER_IDS,
  stopFeature,
  stopFeaturesExcept,
  isFeatureLoaded,
} from '../../js/featureAdapters.js';
import { TRAIN_SECTIONS } from '../../js/workspaces/train.js';
import { STUDY_SECTIONS } from '../../js/workspaces/study.js';
import { CREATE_SECTIONS } from '../../js/workspaces/create.js';
import { SETTINGS_SECTIONS } from '../../js/workspaces/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const swSource = readFileSync(join(root, 'service-worker.js'), 'utf8');

installDomShim();
installLocalStorageShim();

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function sectionIdsFromHtml() {
  const ids = new Set();
  const re = /id="(sec-[^"]+)"/g;
  let m;
  while ((m = re.exec(indexHtml))) ids.add(m[1]);
  return ids;
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

const registryFeatureIds = FEATURES.filter((f) => f.sectionId).map((f) => f.id);

test('every registry feature with sectionId has an adapter', () => {
  for (const id of registryFeatureIds) {
    assert.ok(FEATURE_ADAPTER_IDS.includes(id), `missing adapter for ${id}`);
  }
});

test('every adapter id is a real registry feature id', () => {
  const ids = new Set(FEATURES.map((f) => f.id));
  for (const id of FEATURE_ADAPTER_IDS) {
    assert.ok(ids.has(id), `unknown adapter id ${id}`);
  }
});

test('stopFeature does not load unloaded modules', () => {
  assert.equal(isFeatureLoaded('gpplayer'), false);
  stopFeature('gpplayer');
  assert.equal(isFeatureLoaded('gpplayer'), false);
  stopFeaturesExcept([]);
  assert.equal(isFeatureLoaded('studylab'), false);
});

test('workspace section mappings exist in index.html', () => {
  const htmlSections = sectionIdsFromHtml();
  const mappings = [
    ...collectSectionMappings(TRAIN_SECTIONS),
    ...collectSectionMappings(STUDY_SECTIONS),
    ...collectSectionMappings(CREATE_SECTIONS),
    ...collectSectionMappings(SETTINGS_SECTIONS),
  ];
  assert.ok(mappings.length > 0);
  for (const { sectionId } of mappings) {
    assert.ok(htmlSections.has(sectionId), `missing ${sectionId} in index.html`);
  }
});

test('index.html shell markers', () => {
  assert.ok(indexHtml.includes('id="workspace-root"'));
  assert.ok(indexHtml.includes('id="app-menu-btn"'));
  assert.ok(indexHtml.includes('id="home-objectives"'));
  assert.ok(!indexHtml.includes('sec-hub-'));
  assert.ok(!indexHtml.includes('split-trigger'));
  assert.ok(!indexHtml.includes('home-all-panel'));
  assert.ok(!indexHtml.includes('dock-cat-btn'));
});

test('shell regressions (markup, precache, lazy graph)', () => {
  runShellRegressions();
});

const NEW_PRECACHE = [
  'css/shell.css',
  'js/routes.js',
  'js/featureRegistry.js',
  'js/featureAdapters.js',
  'js/router.js',
  'js/workspaceLoader.js',
  'js/workspaces/legacyHost.js',
  'js/workspaces/workspaceShell.js',
  'js/workspaces/home.js',
  'js/workspaces/train.js',
  'js/workspaces/study.js',
  'js/workspaces/create.js',
  'js/workspaces/settings.js',
  'js/ui/icons.js',
  'js/ui/featureStyles.js',
];

test('service-worker precaches new shell assets', () => {
  for (const path of NEW_PRECACHE) {
    assert.match(swSource, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(swSource, /v174-tsc-refactor/);
});

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
