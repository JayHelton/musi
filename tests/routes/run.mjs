/**
 * Node tests for canonical routes, legacy aliases, and the feature registry.
 * Run: node tests/routes/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OBJECTIVES,
  VIEWS,
  SETTINGS_ROUTE,
  LEGACY_ROUTES,
  parseRoute,
  formatRoute,
  resolveHash,
  isSameView,
  withParams,
} from '../../js/routes.js';
import {
  FEATURES,
  getFeature,
  featuresByOwner,
  getFeatureByLegacyRoute,
  validateRegistry,
} from '../../js/featureRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, '../../index.html'), 'utf8');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const LEGACY_FIXTURE = [
  ['scales', '#train/fundamentals?drill=scales'],
  ['intervals', '#train/fundamentals?drill=intervals'],
  ['sightreading', '#train/fundamentals?drill=sightreading'],
  ['fretboard', '#train/fundamentals?drill=fretboard'],
  ['intervalorbit', '#study/explore?view=fretboard'],
  ['intervalmap', '#study/explore?view=fretboard'],
  ['chordlab', '#train/fundamentals?drill=chord-workout'],
  ['tuner', '#train/fundamentals?drill=pitch&panel=tuner'],
  ['ear', '#train/fundamentals?drill=ear'],
  ['timing', '#train/fundamentals?drill=timing'],
  ['scaleref', '#study/explore?view=scales'],
  ['chords', '#study/explore?view=chords'],
  ['triads', '#study/explore?view=triads'],
  ['circle', '#study/explore?view=circle'],
  ['recorder', '#create/capture'],
  ['songwriter', '#create/projects'],
  ['notes', '#create/projects?view=notes'],
  ['tracktosheet', '#create/compose?view=import-melody'],
  ['keyboard', '#create/compose?panel=keyboard'],
  ['metronome', '#train?panel=practice'],
  ['practice', '#train?panel=practice'],
  ['drums', '#train/library?type=drums'],
  ['exercises', '#train/library?type=exercise'],
  ['workbooks', '#train/library?type=workbook'],
  ['routines', '#train/plans'],
  ['gpplayer', '#train/library?player=gp'],
  ['tabanalyzer', '#train/library?player=gp'],
  ['studylab', '#study/learn'],
  ['musicprefs', '#settings'],
  ['hub-train', '#train'],
  ['hub-reference', '#study'],
  ['hub-create', '#create'],
  ['hub-tools', '#train/library'],
  ['home', '#home'],
  ['', '#home'],
];

test('OBJECTIVES order and SETTINGS_ROUTE', () => {
  assert.deepEqual(OBJECTIVES.map((o) => o.id), ['home', 'train', 'study', 'create']);
  assert.equal(SETTINGS_ROUTE, '#settings');
  assert.equal(OBJECTIVES.find((o) => o.id === 'train').defaultView, 'today');
  assert.equal(OBJECTIVES.find((o) => o.id === 'study').defaultView, 'learn');
  assert.equal(OBJECTIVES.find((o) => o.id === 'create').defaultView, 'projects');
  assert.equal(OBJECTIVES.find((o) => o.id === 'home').defaultView, null);
});

test('VIEWS shape', () => {
  assert.deepEqual(VIEWS.train, ['today', 'plans', 'library', 'fundamentals', 'progress']);
  assert.deepEqual(VIEWS.study, ['learn', 'explore', 'review']);
  assert.deepEqual(VIEWS.create, ['projects', 'capture', 'compose']);
  assert.deepEqual(VIEWS.settings, []);
});

test('every LEGACY_ROUTES entry resolves with redirected true', () => {
  for (const [legacyKey, canonical] of LEGACY_FIXTURE) {
    const input = legacyKey.startsWith('hub-') || legacyKey === 'home' || legacyKey === ''
      ? legacyKey
      : `#${legacyKey}`;
    const fromBare = resolveHash(legacyKey);
    const fromHash = legacyKey === '' ? resolveHash('') : resolveHash(input);
    assert.equal(fromBare.canonicalHash, canonical, `bare ${legacyKey}`);
    assert.equal(fromBare.redirected, true, `bare ${legacyKey} redirected`);
    if (legacyKey !== '') {
      assert.equal(fromHash.canonicalHash, canonical, `hash ${legacyKey}`);
      assert.equal(fromHash.redirected, true, `hash ${legacyKey} redirected`);
    }
  }
});

test('canonical hashes resolve to themselves with redirected false', () => {
  const canonicalHashes = [
    '#home',
    '#train',
    '#train/today',
    '#train/plans',
    '#train/library',
    '#train/fundamentals',
    '#train/progress',
    '#study',
    '#study/learn',
    '#study/explore',
    '#study/review',
    '#create',
    '#create/projects',
    '#create/capture',
    '#create/compose',
    '#settings',
    ...LEGACY_FIXTURE.map(([, c]) => c),
  ];
  for (const hash of canonicalHashes) {
    const { canonicalHash, redirected } = resolveHash(hash);
    assert.equal(canonicalHash, hash, hash);
    assert.equal(redirected, false, hash);
  }
});

test('parseRoute totality', () => {
  const home = parseRoute('');
  assert.equal(home.objective, 'home');
  assert.equal(home.view, null);
  assert.equal(home.hash, '#home');
  assert.equal(home.unknown, undefined);

  assert.deepEqual(parseRoute('#'), home);
  assert.deepEqual(parseRoute(null), home);
  assert.deepEqual(parseRoute(undefined), home);

  const unknownObj = parseRoute('#nope');
  assert.equal(unknownObj.objective, 'home');
  assert.equal(unknownObj.unknown, true);
  assert.equal(unknownObj.requested, '#nope');

  const unknownView = parseRoute('#train/nope');
  assert.equal(unknownView.objective, 'home');
  assert.equal(unknownView.unknown, true);

  const encoded = parseRoute('#train/library?type=workbook&id=a%20b');
  assert.equal(encoded.objective, 'train');
  assert.equal(encoded.view, 'library');
  assert.deepEqual(encoded.params, { type: 'workbook', id: 'a b' });

  const decoded = parseRoute('train/library?type=workbook&id=a b');
  assert.deepEqual(decoded.params, { type: 'workbook', id: 'a b' });
});

test('known objective without view keeps view null', () => {
  const route = parseRoute('#train');
  assert.equal(route.objective, 'train');
  assert.equal(route.view, null);
  assert.equal(route.hash, '#train');

  const withParams = parseRoute('#train?panel=practice');
  assert.equal(withParams.view, null);
  assert.deepEqual(withParams.params, { panel: 'practice' });
  assert.equal(withParams.hash, '#train?panel=practice');
});

test('settings route parses and formats', () => {
  const route = parseRoute('#settings');
  assert.equal(route.objective, 'settings');
  assert.equal(route.view, null);
  assert.equal(route.hash, '#settings');
  assert.equal(formatRoute(route), '#settings');
});

test('formatRoute round-trip for canonical routes', () => {
  const routes = [
    { objective: 'home', view: null, params: {} },
    { objective: 'train', view: null, params: {} },
    { objective: 'train', view: 'library', params: { type: 'workbook', id: 'abc' } },
    { objective: 'train', view: null, params: { panel: 'practice' } },
    { objective: 'study', view: 'explore', params: { view: 'fretboard' } },
    { objective: 'create', view: 'compose', params: { panel: 'keyboard' } },
    { objective: 'settings', view: null, params: {} },
  ];
  for (const r of routes) {
    const hash = formatRoute(r);
    const parsed = parseRoute(hash);
    assert.equal(parsed.hash, hash, hash);
    assert.equal(parsed.objective, r.objective);
    assert.equal(parsed.view, r.view);
    assert.deepEqual(parsed.params, r.params);
  }
});

test('formatRoute round-trip for every legacy target', () => {
  for (const [, canonical] of LEGACY_FIXTURE) {
    const parsed = parseRoute(canonical);
    assert.equal(formatRoute(parsed), canonical, canonical);
    assert.equal(parsed.hash, canonical, canonical);
  }
});

test('param encode/decode round-trip with special characters', () => {
  const value = 'a&b=c d#e';
  const route = {
    objective: 'train',
    view: 'library',
    params: { q: value },
  };
  const hash = formatRoute(route);
  assert.ok(hash.includes('%26'));
  assert.ok(hash.includes('%3D'));
  assert.ok(hash.includes('%20'));
  assert.ok(hash.includes('%23'));
  const parsed = parseRoute(hash);
  assert.equal(parsed.params.q, value);
  assert.equal(formatRoute(parsed), hash);
});

test('withParams add override delete without mutating original', () => {
  const base = parseRoute('#train/library?type=workbook&id=1');
  const added = withParams(base, { foo: 'bar' });
  assert.deepEqual(added.params, { type: 'workbook', id: '1', foo: 'bar' });
  assert.notEqual(added, base);
  assert.deepEqual(base.params, { type: 'workbook', id: '1' });

  const overridden = withParams(base, { id: '2' });
  assert.equal(overridden.params.id, '2');

  const deleted = withParams(overridden, { id: null, foo: undefined, type: '' });
  assert.deepEqual(deleted.params, {});
  assert.equal(deleted.hash, '#train/library');
});

test('isSameView null-safe and param-agnostic', () => {
  const a = parseRoute('#train/library?type=workbook');
  const b = parseRoute('#train/library?type=exercise');
  assert.equal(isSameView(a, b), true);
  assert.equal(isSameView(a, parseRoute('#train/plans')), false);
  assert.equal(isSameView(null, a), false);
  assert.equal(isSameView(a, null), false);
  assert.equal(isSameView(null, null), false);
  assert.equal(isSameView(parseRoute('#train'), parseRoute('#train?panel=practice')), true);
});

test('validateRegistry returns empty array', () => {
  const problems = validateRegistry();
  assert.deepEqual(problems, []);
});

test('every FEATURES sectionId exists in index.html', () => {
  for (const feature of FEATURES) {
    assert.ok(
      indexHtml.includes(`id="${feature.sectionId}"`),
      `missing section ${feature.sectionId} for ${feature.id}`,
    );
  }
});

test('every objective in registry is allowed', () => {
  const allowed = new Set(['train', 'study', 'create', 'app', 'utility']);
  for (const feature of FEATURES) {
    assert.ok(allowed.has(feature.owner), feature.id);
    if (feature.secondaryOwners) {
      for (const o of feature.secondaryOwners) {
        assert.ok(allowed.has(o), `${feature.id} secondary ${o}`);
      }
    }
  }
});

test('FEATURES count and registry helpers', () => {
  assert.equal(FEATURES.length, 27);
  assert.equal(getFeature('scales').id, 'scales');
  assert.equal(getFeature('missing'), null);
  assert.ok(featuresByOwner('train').some((f) => f.id === 'scales'));
  assert.ok(featuresByOwner('create').some((f) => f.id === 'chords'));
  assert.equal(getFeatureByLegacyRoute('#intervalmap').id, 'intervalorbit');
  assert.equal(getFeatureByLegacyRoute('tabanalyzer').id, 'gpplayer');
});

console.log(`\n${passed} tests passed`);
