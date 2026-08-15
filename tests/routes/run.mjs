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
import { sectionIdForRoute } from '../../js/routeSection.js';
import { shouldKeepLibraryPlayer } from '../../js/library/libraryPlayerRoute.js';
import { parseAppRoute, buildAppRoute } from '../../js/appRoute.js';

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
  { hash: 'scaleref', id: 'scalelab', params: {}, notice: null },
  { hash: 'circle', id: 'circle', params: {}, notice: null },
  { hash: 'studylab', id: 'scalelab', params: {}, notice: 'notice.studylab-removed' },
  { hash: 'intervals', id: 'tools', params: { mode: 'train' }, notice: 'notice.intervals-removed' },
  { hash: 'fretboard', id: 'tools', params: { mode: 'train' }, notice: 'notice.fretboard-removed' },
  { hash: 'intervalorbit', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'intervalmap', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'fretmap', id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  { hash: 'chordlab', id: 'chordlab', params: { mode: 'reference' }, notice: 'notice.chordlab-removed' },
  { hash: 'chords', id: 'chordlab', params: {}, notice: null },
  { hash: 'triads', id: 'triads', params: {}, notice: null },
  { hash: 'tuner', id: 'pitchear', params: { mode: 'tuner' }, notice: null },
  { hash: 'ear', id: 'pitchear', params: { mode: 'ear' }, notice: null },
  { hash: 'timing', id: 'metronome', params: { mode: 'metronome' }, notice: 'notice.timing-removed' },
  { hash: 'metronome', id: 'metronome', params: { mode: 'metronome' }, notice: null },
  { hash: 'practice', id: 'metronome', params: { mode: 'plan' }, notice: null },
  { hash: 'sightreading', id: 'tools', params: { mode: 'train' }, notice: 'notice.sightreading-removed' },
  { hash: 'recorder', id: 'audiostudio', params: { mode: 'capture' }, notice: null },
  { hash: 'tracktosheet', id: 'audiostudio', params: { mode: 'transcribe' }, notice: null },
  { hash: 'songwriter', id: 'songstudio', params: {}, notice: null },
  { hash: 'notes', id: 'notes', params: {}, notice: null },
  { hash: 'keyboard', id: 'tools', params: { mode: 'study' }, notice: 'notice.pitch-reference' },
  { hash: 'exercises', id: 'library', params: { mode: 'exercises' }, notice: null },
  { hash: 'workbooks', id: 'library', params: { mode: 'workbooks' }, notice: null },
  { hash: 'routines', id: 'tools', params: { mode: 'train' }, notice: 'notice.routines-removed' },
  { hash: 'gpplayer', id: 'scoreplayer', params: {}, notice: null },
  { hash: 'tabanalyzer', id: 'scoreplayer', params: {}, notice: null },
  { hash: 'musicprefs', id: 'settings', params: { mode: 'preferences' }, notice: null },
  { hash: 'home', id: 'reference', params: {}, notice: null },
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
test('empty hash -> reference', () => {
  assertResolved(
    { id: '', params: {} },
    { id: 'reference', params: {}, notice: null },
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

test('scalelab without mode keeps empty params', () => {
  assertResolved(
    { id: 'scalelab', params: {} },
    { id: 'scalelab', params: {}, notice: null },
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
    'reference',
    'create',
    'tools',
    'scalelab',
    'chordlab',
    'circle',
    'triads',
    'pitchear',
    'metronome',
    'audiostudio',
    'songstudio',
    'notes',
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

console.log('sectionIdForRoute');
test('sectionIdForRoute maps library workbooks mode to workbooks', () => {
  assert.equal(sectionIdForRoute('library', { mode: 'workbooks' }), 'workbooks');
});

test('sectionIdForRoute maps library exercises mode to exercises', () => {
  assert.equal(sectionIdForRoute('library', { mode: 'exercises' }), 'exercises');
});

test('sectionIdForRoute maps library without mode to exercises', () => {
  assert.equal(sectionIdForRoute('library', {}), 'exercises');
  assert.equal(sectionIdForRoute('library'), 'exercises');
});

test('sectionIdForRoute keeps intervalmap and tabanalyzer aliases', () => {
  assert.equal(sectionIdForRoute('intervalmap'), 'intervalorbit');
  assert.equal(sectionIdForRoute('tabanalyzer'), 'gpplayer');
});

console.log('Library player route');
test('shouldKeepLibraryPlayer keeps workbooks player when workbook param is set', () => {
  assert.equal(shouldKeepLibraryPlayer('workbooks', { workbook: 'wb-1' }), true);
});

test('shouldKeepLibraryPlayer drops workbooks player when workbook param is missing', () => {
  assert.equal(shouldKeepLibraryPlayer('workbooks', { mode: 'workbooks' }), false);
});

test('shouldKeepLibraryPlayer keeps exercises player when exercise param is set', () => {
  assert.equal(shouldKeepLibraryPlayer('exercises', { exercise: 'ex-1' }), true);
});

test('shouldKeepLibraryPlayer drops exercises player when exercise param is missing', () => {
  assert.equal(shouldKeepLibraryPlayer('exercises', {}), false);
});

test('parseAppRoute and buildAppRoute round-trip library player hash', () => {
  const params = { mode: 'workbooks', workbook: 'wb-1', exercise: 'wbe-1' };
  const parsed = parseAppRoute('#library?mode=workbooks&workbook=wb-1&exercise=wbe-1');
  assert.equal(parsed.id, 'library');
  assert.deepEqual(parsed.params, params);
  const built = buildAppRoute({ id: 'library', params });
  const roundTrip = parseAppRoute(`#${built}`);
  assert.equal(roundTrip.id, 'library');
  assert.deepEqual(roundTrip.params, params);
});

test('resolveRoute library with workbook keeps workbook param', () => {
  const result = resolveRoute({ id: 'library', params: { mode: 'workbooks', workbook: 'wb-1' } });
  assert.equal(result.id, 'library');
  assert.equal(result.params.mode, 'workbooks');
  assert.equal(result.params.workbook, 'wb-1');
  assert.equal(result.notice, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
