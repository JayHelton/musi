/**
 * Zero-dependency Node tests for route map resolution.
 * Run: node tests/routes/run.mjs
 */

import assert from 'node:assert/strict';
import {
  resolveRoute,
  isKnownRoute,
  shouldShowNotice,
  ROUTE_IDS,
  LEGACY_ROUTES,
} from '../../js/routeMap.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

const LEGACY_CASES = [
  { hash: 'scales', id: 'scalelab', params: { mode: 'overview' }, notice: 'notice.scales-removed' },
  { hash: 'scaleref', id: 'scalelab', params: { mode: 'overview' }, notice: null },
  { hash: 'circle', id: 'scalelab', params: { mode: 'modes' }, notice: null },
  { hash: 'studylab', id: 'scalelab', params: { mode: 'overview' }, notice: 'notice.studylab-removed' },
  { hash: 'intervals', id: 'tools', params: { mode: 'train' }, notice: 'notice.intervals-removed' },
  { hash: 'fretboard', id: 'tools', params: { mode: 'train' }, notice: 'notice.fretboard-removed' },
  { hash: 'intervalorbit', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'intervalmap', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'fretmap', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'chordlab', id: 'chordlab', params: { mode: 'reference' }, notice: 'notice.chordlab-removed' },
  { hash: 'chords', id: 'chordlab', params: { mode: 'reference' }, notice: null },
  { hash: 'triads', id: 'chordlab', params: { mode: 'triads' }, notice: null },
  { hash: 'tuner', id: 'pitchear', params: { mode: 'tuner' }, notice: null },
  { hash: 'ear', id: 'pitchear', params: { mode: 'ear' }, notice: null },
  { hash: 'timing', id: 'metronome', params: { mode: 'metronome' }, notice: 'notice.timing-removed' },
  { hash: 'metronome', id: 'metronome', params: { mode: 'metronome' }, notice: null },
  { hash: 'practice', id: 'metronome', params: { mode: 'plan' }, notice: null },
  { hash: 'sightreading', id: 'tools', params: { mode: 'train' }, notice: 'notice.sightreading-removed' },
  { hash: 'recorder', id: 'audiostudio', params: { mode: 'capture' }, notice: null },
  { hash: 'tracktosheet', id: 'audiostudio', params: { mode: 'transcribe' }, notice: null },
  { hash: 'songwriter', id: 'songstudio', params: {}, notice: null },
  { hash: 'notes', id: 'songstudio', params: {}, notice: 'notice.notes-removed' },
  { hash: 'keyboard', id: 'tools', params: { mode: 'study' }, notice: 'notice.pitch-reference' },
  { hash: 'exercises', id: 'library', params: { mode: 'exercises' }, notice: null },
  { hash: 'workbooks', id: 'library', params: { mode: 'workbooks' }, notice: null },
  { hash: 'routines', id: 'tools', params: { mode: 'train' }, notice: 'notice.routines-removed' },
  { hash: 'gpplayer', id: 'scoreplayer', params: {}, notice: null },
  { hash: 'tabanalyzer', id: 'scoreplayer', params: {}, notice: null },
  { hash: 'musicprefs', id: 'settings', params: { mode: 'preferences' }, notice: null },
  { hash: 'home', id: 'tools', params: { mode: 'train' }, notice: null },
];

function assertResolved(route, expected, ctx) {
  const result = resolveRoute(route, ctx);
  assert.equal(result.id, expected.id, `id for #${route.id || '(empty)'}`);
  assert.deepEqual(result.params, expected.params, `params for #${route.id || '(empty)'}`);
  assert.equal(result.notice, expected.notice, `notice for #${route.id || '(empty)'}`);
}

console.log('Legacy route table (section 4)');
for (const row of LEGACY_CASES) {
  test(`#${row.hash} -> ${row.id}`, () => {
    assertResolved({ id: row.hash, params: {} }, row);
  });
}

test('#drums without drum exercises', () => {
  assertResolved(
    { id: 'drums', params: {} },
    { id: 'library', params: { mode: 'exercises' }, notice: 'notice.drums-removed' },
  );
});

test('#drums with drum exercises', () => {
  assertResolved(
    { id: 'drums', params: {} },
    { id: 'library', params: { mode: 'exercises', instrument: 'drums' }, notice: 'notice.drums-removed' },
    { hasDrumExercises: () => true },
  );
});

console.log('Section 9 cases');
test('empty hash -> tools train', () => {
  assertResolved(
    { id: '', params: {} },
    { id: 'tools', params: { mode: 'train' }, notice: null },
  );
});

test('#intervalmap alias matches #intervalorbit', () => {
  const orbit = resolveRoute({ id: 'intervalorbit', params: {} });
  const map = resolveRoute({ id: 'intervalmap', params: {} });
  assert.deepEqual(map, orbit);
});

test('#tabanalyzer alias matches #gpplayer', () => {
  const gp = resolveRoute({ id: 'gpplayer', params: {} });
  const tab = resolveRoute({ id: 'tabanalyzer', params: {} });
  assert.deepEqual(tab, gp);
});

test('scalelab without mode defaults to overview', () => {
  assertResolved(
    { id: 'scalelab', params: {} },
    { id: 'scalelab', params: { mode: 'overview' }, notice: null },
  );
});

test("isKnownRoute('tools') is true", () => {
  assert.equal(isKnownRoute('tools'), true);
});

test("isKnownRoute('scales') is false", () => {
  assert.equal(isKnownRoute('scales'), false);
});

test("isKnownRoute('fretmap') is false", () => {
  assert.equal(isKnownRoute('fretmap'), false);
});

test("isKnownRoute('routines') is false", () => {
  assert.equal(isKnownRoute('routines'), false);
});

test('resolver returns notice id even when seen; helper hides banner', () => {
  const resolved = resolveRoute({ id: 'scales', params: {} });
  assert.equal(resolved.notice, 'notice.scales-removed');
  assert.equal(
    shouldShowNotice(resolved.notice, ['notice.scales-removed']),
    false,
  );
  assert.equal(shouldShowNotice(resolved.notice, []), true);
});

test('shouldShowNotice rejects empty notice id', () => {
  assert.equal(shouldShowNotice(null, []), false);
  assert.equal(shouldShowNotice('', []), false);
});

console.log('Catalogue integrity');
test('ROUTE_IDS lists every contract section 3 id', () => {
  const expected = [
    'tools',
    'scalelab',
    'chordlab',
    'pitchear',
    'metronome',
    'audiostudio',
    'songstudio',
    'library',
    'scoreplayer',
    'settings',
  ];
  assert.deepEqual([...ROUTE_IDS].sort(), [...expected].sort());
});

test('every LEGACY_ROUTES destination id is a known route', () => {
  for (const [hash, entry] of Object.entries(LEGACY_ROUTES)) {
    if (hash === 'drums') {
      assert.equal(entry.id, 'library');
    }
    assert.ok(isKnownRoute(entry.id), `legacy #${hash} -> ${entry.id}`);
  }
});

test('LEGACY_ROUTES has one row per section 4 hash', () => {
  const expectedHashes = [
    ...LEGACY_CASES.map((row) => row.hash),
    'drums',
  ];
  assert.equal(Object.keys(LEGACY_ROUTES).length, expectedHashes.length);
  for (const hash of expectedHashes) {
    assert.ok(hash in LEGACY_ROUTES, `missing LEGACY_ROUTES row for #${hash}`);
  }
});

test('legacy routines resolves to tools train with notice', () => {
  const params = {
    routine: 'r1',
    session: 's1',
    workbook: 'w1',
    exercise: 'e1',
    companion: 'c1',
  };
  const result = resolveRoute({ id: 'routines', params });
  assert.deepEqual(result.params, { mode: 'train' });
  assert.equal(result.notice, 'notice.routines-removed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
