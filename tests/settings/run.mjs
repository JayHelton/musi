/**
 * Settings simplification tests.
 * Run: node tests/settings/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { MUSI_SETTINGS, LEGACY_SNAPSHOT } from '../characterization/fixtures.mjs';
import { OBJECTIVES, SETTINGS_ROUTE, resolveHash } from '../../js/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

installDomShim();
const { reset: resetStorage } = installLocalStorageShim(LEGACY_SNAPSHOT);

globalThis.window = globalThis;

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function seedSettings(overrides = {}) {
  const settings = { ...MUSI_SETTINGS, ...overrides };
  resetStorage({ 'musi:settings': JSON.stringify(settings) });
}

const {
  buildSettingsModel,
} = await import('../../js/musicPreferences.js');

const {
  buildReviewSettingsModel,
} = await import('../../js/workspaces/study.js');

const {
  getMusicContext,
  setMusicContext,
  MUSIC_CONTEXT_DEFAULTS,
} = await import('../../js/core/musicContext.js');

const { getSetting, invalidateSettingsCache } = await import('../../js/persistence.js');
const { getMusicProfile, saveMusicProfile } = await import('../../js/musicProfile.js');
const { buildRecommendations } = await import('../../js/studyRecommendations.js');

test('routes and workspace loaders ignore features.enabled', () => {
  seedSettings({
    'features.enabled': ['musicprefs'],
  });
  invalidateSettingsCache();

  assert.deepEqual(OBJECTIVES.map((o) => o.id), ['home', 'train', 'study', 'create']);
  assert.equal(SETTINGS_ROUTE, '#settings');

  for (const objective of ['home', 'train', 'study', 'create', 'settings']) {
    const hash = objective === 'settings' ? '#settings' : `#${objective}`;
    const { canonicalHash, redirected } = resolveHash(hash);
    assert.equal(canonicalHash, hash);
    assert.equal(redirected, false);
  }

  const routesSource = readFileSync(join(root, 'js/routes.js'), 'utf8');
  const loaderSource = readFileSync(join(root, 'js/workspaceLoader.js'), 'utf8');
  assert.ok(!routesSource.includes('features.enabled'));
  assert.ok(!loaderSource.includes('features.enabled'));
  for (const objective of ['home', 'train', 'study', 'create', 'settings']) {
    assert.match(loaderSource, new RegExp(`${objective}:\\s*\\(\\)\\s*=>\\s*import`));
  }
});

test('buildSettingsModel reflects music context defaults', () => {
  seedSettings();
  invalidateSettingsCache();
  setMusicContext({
    instrument: 'bass',
    tuningId: 'bass-4',
    root: 'D',
    scaleId: 'Dorian',
    tempoBpm: 88,
    keySignaturePreference: 'flats',
  }, 'test');

  const model = buildSettingsModel();
  assert.equal(model.defaults.instrument, 'bass');
  assert.equal(model.defaults.tuningId, 'bass-4');
  assert.equal(model.defaults.root, 'D');
  assert.equal(model.defaults.scaleId, 'Dorian');
  assert.equal(model.defaults.tempoBpm, 88);
  assert.equal(model.defaults.keySignaturePreference, 'flats');
});

test('Settings defaults round-trip through musicContext persistence keys', () => {
  seedSettings();
  invalidateSettingsCache();
  setMusicContext({
    instrument: 'piano',
    tuningId: MUSIC_CONTEXT_DEFAULTS.tuningId,
    root: 'F',
    scaleId: 'Blues',
    tempoBpm: 132,
    keySignaturePreference: 'sharps',
  }, 'settings-test');

  invalidateSettingsCache();
  assert.equal(getSetting('context.instrument', null), 'piano');
  assert.equal(getSetting('context.root', null), 'F');
  assert.equal(getSetting('context.scale', null), 'Blues');
  assert.equal(getSetting('context.tempo', null), 132);
  assert.equal(getSetting('context.accidentals', null), 'sharps');

  const ctx = getMusicContext();
  assert.equal(ctx.root, 'F');
  assert.equal(ctx.scaleId, 'Blues');
  assert.equal(ctx.tempoBpm, 132);
});

test('buildReviewSettingsModel preserves profile.music shape for recommendations', () => {
  seedSettings();
  invalidateSettingsCache();
  const profile = getMusicProfile();
  const model = buildReviewSettingsModel({ profile });

  assert.equal(model.balance, profile.balance);
  assert.deepEqual(model.exclusions, profile.exclusions);
  assert.deepEqual(model.applications, profile.applications);
  assert.ok(model.pauseChoices.some((c) => c.id === 'modal_comparison' && c.paused));

  saveMusicProfile({
    balance: 'review',
    exclusions: ['modal_comparison', 'phrygian'],
    applications: ['improvisation', 'ear'],
  });
  invalidateSettingsCache();

  const recs = buildRecommendations({ limit: 3 });
  assert.ok(recs.primary || recs.alternates?.length);

  const saved = getMusicProfile();
  assert.equal(saved.balance, 'review');
  assert.ok(saved.exclusions.includes('phrygian'));
  assert.ok(saved.applications.includes('improvisation'));
  assert.equal(saved.version, 1);
  assert.ok(Array.isArray(saved.genres));
});

test('buildSettingsModel reads seeded profile genres and goals', () => {
  seedSettings();
  invalidateSettingsCache();
  const model = buildSettingsModel();
  assert.equal(model.profile.primaryGenre, 'rock');
  assert.equal(model.profile.primaryGoal, 'improvisation');
  assert.ok(model.profile.genreSummary.includes('Rock'));
});

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
