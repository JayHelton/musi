/**
 * Routine import and export characterization tests.
 * Run: node tests/characterization/routine-export.mjs
 */

import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import {
  ROUTINE_EXPORT_KIND,
  ROUTINE_EXPORT_VERSION,
  ROUTINES_STORAGE_KEY,
  invalidateRoutinesCache,
  buildRoutineExport,
  validateRoutineExport,
  applyRoutineImport,
} from '../../js/routineModel.js';
import { MUSI_ROUTINES, MUSI_WORKBOOKS } from './fixtures.mjs';

function workbookById(id) {
  return MUSI_WORKBOOKS.workbooks.find((wb) => wb.id === id) || null;
}

function normalizeExport(exported) {
  const routines = (exported.routines || []).map((rt) => ({
    name: rt.name,
    description: rt.description,
    sessions: rt.sessions.map((s) => ({
      name: s.name,
      notes: s.notes,
      workbookIds: s.workbookIds.slice(),
      durationMin: s.durationMin,
      metronome: { ...s.metronome },
      completed: s.completed,
    })),
  }));
  const workbooks = (exported.workbooks || []).map((wb) => ({
    name: wb.name,
    entries: wb.entries.map((e) => ({ exerciseId: e.exerciseId })),
    companions: wb.companions.map((c) => ({
      type: c.type,
      root: c.root,
      scale: c.scale,
      tuning: c.tuning,
      label: c.label,
    })),
  }));
  return {
    app: exported.app,
    kind: exported.kind,
    version: exported.version,
    routines,
    workbooks,
  };
}

function assertRoutinePayloadMatchesFixture(exported) {
  assert.equal(exported.app, 'musi');
  assert.equal(exported.kind, ROUTINE_EXPORT_KIND);
  assert.equal(exported.version, ROUTINE_EXPORT_VERSION);
  assert.equal(typeof exported.createdAt, 'string');
  assert.ok(exported.createdAt.includes('T'));

  assert.equal(Object.keys(exported).sort().join(','), 'app,createdAt,kind,routines,version,workbooks');

  const fixture = MUSI_ROUTINES.routines[0];
  assert.equal(exported.routines.length, 1);
  const rt = exported.routines[0];
  assert.equal(rt.name, fixture.name);
  assert.equal(rt.description, fixture.description);
  assert.equal(rt.activeSessionId, fixture.activeSessionId);
  assert.equal(rt.sessions.length, fixture.sessions.length);

  for (let i = 0; i < fixture.sessions.length; i++) {
    const expected = fixture.sessions[i];
    const actual = rt.sessions[i];
    assert.equal(actual.name, expected.name);
    assert.equal(actual.notes, expected.notes);
    assert.deepEqual(actual.workbookIds, expected.workbookIds);
    assert.equal(actual.durationMin, expected.durationMin);
    assert.deepEqual(actual.metronome, expected.metronome);
    assert.equal(actual.completed, expected.completed);
  }

  const workbookIds = [];
  for (const session of rt.sessions) {
    for (const wbId of session.workbookIds) {
      if (!workbookIds.includes(wbId)) workbookIds.push(wbId);
    }
  }
  assert.deepEqual(exported.workbooks.map((wb) => wb.id), workbookIds);
  for (const wb of exported.workbooks) {
    const source = workbookById(wb.id);
    assert.ok(source, `missing fixture workbook ${wb.id}`);
    assert.equal(wb.name, source.name);
    assert.deepEqual(wb.entries, source.entries.map((e) => ({ exerciseId: e.exerciseId })));
    assert.equal(wb.companions.length, source.companions.length);
    assert.equal(wb.companions[0]?.type, source.companions[0]?.type);
    assert.equal(wb.companions[0]?.root, source.companions[0]?.root);
  }
}

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('export constants', () => {
  assert.equal(ROUTINE_EXPORT_KIND, 'musi-routines');
  assert.equal(ROUTINE_EXPORT_VERSION, 1);
});

test('buildRoutineExport preserves routine and session fields from fixture', () => {
  const shim = installLocalStorageShim({
    [ROUTINES_STORAGE_KEY]: JSON.stringify(MUSI_ROUTINES),
  });
  globalThis.window = globalThis;
  invalidateRoutinesCache();

  const exported = buildRoutineExport({
    routineIds: ['rt-morning'],
    resolveWorkbook: workbookById,
  });

  assertRoutinePayloadMatchesFixture(exported);
  assert.ok(shim.store.has(ROUTINES_STORAGE_KEY));
});

test('export round-trip is stable after normalizing ids and timestamps', () => {
  installLocalStorageShim({
    [ROUTINES_STORAGE_KEY]: JSON.stringify(MUSI_ROUTINES),
  });
  globalThis.window = globalThis;
  invalidateRoutinesCache();

  const first = buildRoutineExport({
    routineIds: ['rt-morning'],
    resolveWorkbook: workbookById,
  });

  const validated = validateRoutineExport(first);
  assert.equal(validated.ok, true);

  installLocalStorageShim();
  globalThis.window = globalThis;
  invalidateRoutinesCache();

  const imported = applyRoutineImport(first, {
    existingWorkbooks: MUSI_WORKBOOKS.workbooks,
    existingExerciseIds: ['ex-gp-stairway', 'ex-audio-drill', 'ex-lesson-link'],
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.imported.length, 1);

  const second = buildRoutineExport({
    routineIds: [imported.imported[0].id],
    resolveWorkbook: workbookById,
  });

  assert.deepEqual(normalizeExport(first), normalizeExport(second));
});

test('validateRoutineExport rejects bad app/kind/version and accepts shorthands', () => {
  const good = buildRoutineExport({
    routineIds: ['rt-morning'],
    resolveWorkbook: workbookById,
  });

  assert.equal(validateRoutineExport({ ...good, app: 'other' }).ok, false);
  assert.equal(validateRoutineExport({ ...good, kind: 'wrong-kind' }).ok, false);
  assert.equal(validateRoutineExport({ ...good, version: 2 }).ok, false);

  const bareArray = validateRoutineExport([{
    name: 'Bare routine',
    sessions: [{ name: 'Only session' }],
  }]);
  assert.equal(bareArray.ok, true);
  assert.deepEqual(bareArray.workbooks, []);

  const bareSingle = validateRoutineExport({
    name: 'Single routine',
    sessions: [{ name: 'Solo session' }],
  });
  assert.equal(bareSingle.ok, true);
  assert.deepEqual(bareSingle.workbooks, []);
});

console.log(`\n${passed} tests passed`);
