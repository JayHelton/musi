/**
 * Zero-dependency Node tests for Practice Routine storage model.
 * Run: node tests/routines/run.mjs
 */

import assert from 'node:assert/strict';
import {
  ROUTINES_STORAGE_KEY,
  ROUTINE_EXPORT_KIND,
  ROUTINE_EXPORT_VERSION,
  SESSION_SUBDIVISIONS,
  normalizeRoutineSession,
  normalizeRoutine,
  normalizeSessionMetronome,
  invalidateRoutinesCache,
  listRoutines,
  getRoutine,
  createRoutine,
  renameRoutine,
  setRoutineDescription,
  deleteRoutine,
  duplicateRoutine,
  addRoutineSession,
  updateRoutineSession,
  deleteRoutineSession,
  moveRoutineSession,
  reorderRoutineSessions,
  setActiveRoutineSession,
  getActiveRoutineSession,
  setRoutineSessionCompleted,
  filterRoutineSessions,
  attachWorkbooksToSession,
  detachWorkbookFromSession,
  moveSessionWorkbook,
  collectAttachedWorkbookIds,
  pruneMissingWorkbooks,
  getRoutineStats,
  buildRoutineExport,
  validateRoutineExport,
  applyRoutineImport,
  serializeRoutineExport,
  routineExportFilename,
} from '../../js/routineModel.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('storage key and export constants', () => {
  assert.equal(ROUTINES_STORAGE_KEY, 'musi.routines');
  assert.equal(ROUTINE_EXPORT_KIND, 'musi-routines');
  assert.equal(ROUTINE_EXPORT_VERSION, 1);
  assert.equal(SESSION_SUBDIVISIONS.length, 4);
  assert.deepEqual(SESSION_SUBDIVISIONS.map(s => s.id), ['quarter', 'eighth', 'triplet', 'sixteenth']);
});

test('normalizers fill defaults and clamp out-of-range values', () => {
  const metro = normalizeSessionMetronome({ bpm: 999, beats: 99, subdiv: 'bogus', accentFirst: false });
  assert.equal(metro.bpm, 100);
  assert.equal(metro.beats, 4);
  assert.equal(metro.subdiv, 'quarter');
  assert.equal(metro.accentFirst, false);

  const session = normalizeRoutineSession({
    id: 'rs-1',
    name: 'Warm-up',
    notes: 'go slow',
    workbookIds: ['wb-a', 'wb-a', ''],
    durationMin: 9999,
    metronome: { bpm: 120, beats: 3, subdiv: 'eighth' },
  });
  assert.equal(session.id, 'rs-1');
  assert.equal(session.name, 'Warm-up');
  assert.equal(session.notes, 'go slow');
  assert.deepEqual(session.workbookIds, ['wb-a']);
  assert.equal(session.durationMin, null);
  assert.equal(session.metronome.bpm, 120);
  assert.equal(session.metronome.beats, 3);
  assert.equal(session.metronome.subdiv, 'eighth');
  assert.equal(session.completed, false);
});

test('normalizeRoutineSession treats missing completed as false (backward compat)', () => {
  const legacy = normalizeRoutineSession({ id: 'rs-legacy', name: 'Legacy' });
  assert.equal(legacy.completed, false);
  const done = normalizeRoutineSession({ id: 'rs-done', name: 'Done', completed: true });
  assert.equal(done.completed, true);
});

test('normalizeRoutine clears stale activeSessionId', () => {
  const rt = normalizeRoutine({
    id: 'rt-stale',
    name: 'Stale',
    description: '',
    sessions: [{ id: 'rs-real', name: 'S1' }],
    activeSessionId: 'rs-gone',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(rt.activeSessionId, null);
});

test('normalizeRoutine moves active off completed sessions on load', () => {
  const rt = normalizeRoutine({
    id: 'rt-reconcile',
    name: 'Reconcile',
    sessions: [
      { id: 'rs-done', name: 'Done', completed: true },
      { id: 'rs-next', name: 'Next' },
    ],
    activeSessionId: 'rs-done',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(rt.activeSessionId, 'rs-next');
});

test('create rename describe delete duplicate routine', () => {
  const rt = createRoutine({ name: 'Morning Practice', description: 'Daily drills' });
  assert.ok(rt.id.startsWith('rt-'));
  assert.equal(rt.name, 'Morning Practice');
  assert.equal(rt.description, 'Daily drills');
  assert.deepEqual(rt.sessions, []);
  assert.equal(rt.activeSessionId, null);

  assert.ok(renameRoutine(rt.id, 'Renamed Routine'));
  assert.equal(getRoutine(rt.id).name, 'Renamed Routine');
  assert.equal(renameRoutine(rt.id, '   '), false);

  assert.ok(setRoutineDescription(rt.id, 'Updated notes'));
  assert.equal(getRoutine(rt.id).description, 'Updated notes');

  const dup = duplicateRoutine(rt.id);
  assert.ok(dup);
  assert.equal(dup.name, 'Renamed Routine copy');
  assert.notEqual(dup.id, rt.id);
  assert.equal(dup.activeSessionId, null);

  assert.ok(deleteRoutine(rt.id));
  assert.equal(getRoutine(rt.id), null);
});

test('listRoutines sort order by updatedAt', () => {
  const older = createRoutine({ name: 'Older Routine' });
  const newer = createRoutine({ name: 'Newer Routine' });
  renameRoutine(older.id, 'Older Routine touched');
  const all = listRoutines();
  const olderIdx = all.findIndex(r => r.id === older.id);
  const newerIdx = all.findIndex(r => r.id === newer.id);
  assert.ok(olderIdx >= 0 && newerIdx >= 0);
  assert.ok(olderIdx < newerIdx, 'touched routine should sort first (newer updatedAt)');
});

test('add update delete move reorder sessions', () => {
  const rt = createRoutine({ name: 'Session CRUD' });
  const s1 = addRoutineSession(rt.id, { name: 'First', notes: 'note1', durationMin: 10 });
  const s2 = addRoutineSession(rt.id, { name: 'Second' });
  const s3 = addRoutineSession(rt.id, { name: 'Third' });
  assert.ok(s1 && s2 && s3);
  assert.equal(getRoutine(rt.id).sessions.length, 3);

  const beforeUpdate = getRoutine(rt.id).updatedAt;
  assert.ok(updateRoutineSession(rt.id, s2.id, { name: 'Second Renamed', notes: 'new note' }));
  const afterUpdate = getRoutine(rt.id);
  assert.equal(afterUpdate.sessions.find(s => s.id === s2.id).name, 'Second Renamed');
  assert.ok(afterUpdate.updatedAt >= beforeUpdate);

  assert.ok(moveRoutineSession(rt.id, s3.id, -1));
  const moved = getRoutine(rt.id).sessions.map(s => s.id);
  assert.deepEqual(moved, [s1.id, s3.id, s2.id]);

  const ids = getRoutine(rt.id).sessions.map(s => s.id);
  assert.ok(reorderRoutineSessions(rt.id, [ids[2], ids[0]]));
  assert.deepEqual(getRoutine(rt.id).sessions.map(s => s.id), [ids[2], ids[0], ids[1]]);

  setActiveRoutineSession(rt.id, s1.id);
  deleteRoutineSession(rt.id, s1.id);
  assert.equal(getRoutine(rt.id).activeSessionId, s3.id);
});

test('deleteRoutineSession active fallback to last and null', () => {
  const rt = createRoutine({ name: 'Delete Active' });
  const a = addRoutineSession(rt.id, { name: 'A' });
  const b = addRoutineSession(rt.id, { name: 'B' });
  setActiveRoutineSession(rt.id, b.id);
  deleteRoutineSession(rt.id, b.id);
  assert.equal(getRoutine(rt.id).activeSessionId, a.id);

  const solo = createRoutine({ name: 'Solo', sessions: [{ name: 'Only' }] });
  const only = getRoutine(solo.id).sessions[0];
  setActiveRoutineSession(solo.id, only.id);
  deleteRoutineSession(solo.id, only.id);
  assert.equal(getRoutine(solo.id).activeSessionId, null);
  assert.equal(getRoutine(solo.id).sessions.length, 0);
});

test('setActiveRoutineSession does not change updatedAt', () => {
  const rt = createRoutine({ name: 'Active No Touch' });
  const s = addRoutineSession(rt.id, { name: 'S' });
  const before = getRoutine(rt.id).updatedAt;
  assert.ok(setActiveRoutineSession(rt.id, s.id));
  assert.equal(getRoutine(rt.id).updatedAt, before);
  assert.equal(getRoutine(rt.id).activeSessionId, s.id);
});

test('setRoutineSessionCompleted and filterRoutineSessions', () => {
  const rt = createRoutine({
    name: 'Complete Flow',
    sessions: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
  });
  const sessions = getRoutine(rt.id).sessions;
  setActiveRoutineSession(rt.id, sessions[0].id);

  assert.ok(setRoutineSessionCompleted(rt.id, sessions[0].id, true));
  const afterFirst = getRoutine(rt.id);
  assert.equal(afterFirst.sessions[0].completed, true);
  assert.equal(afterFirst.activeSessionId, sessions[1].id);

  assert.deepEqual(
    filterRoutineSessions(afterFirst.sessions).map(s => s.id),
    [sessions[1].id, sessions[2].id],
  );
  assert.deepEqual(
    filterRoutineSessions(afterFirst.sessions, { includeCompleted: true }).map(s => s.id),
    sessions.map(s => s.id),
  );

  assert.ok(updateRoutineSession(rt.id, sessions[2].id, { completed: true }));
  assert.ok(setRoutineSessionCompleted(rt.id, sessions[1].id, true));
  assert.equal(getRoutine(rt.id).activeSessionId, null);

  assert.ok(setRoutineSessionCompleted(rt.id, sessions[1].id, false));
  assert.equal(getRoutine(rt.id).activeSessionId, sessions[1].id);
});

test('getActiveRoutineSession falls back to index 0 when no active set', () => {
  const rt = createRoutine({
    name: 'No Active',
    sessions: [{ name: 'X' }, { name: 'Y' }],
  });
  const active = getActiveRoutineSession(rt.id);
  assert.equal(active.index, 0);
  assert.equal(active.session.name, 'X');
});

test('getActiveRoutineSession prefers first incomplete session', () => {
  const rt = createRoutine({
    name: 'Active Incomplete',
    sessions: [{ name: 'Done', completed: true }, { name: 'Next' }],
  });
  const ids = getRoutine(rt.id).sessions.map(s => s.id);
  setActiveRoutineSession(rt.id, ids[0]);
  const active = getActiveRoutineSession(rt.id);
  assert.equal(active.session.name, 'Next');
  assert.equal(active.index, 1);
});

test('getActiveRoutineSession returns null when every session is complete', () => {
  const rt = createRoutine({
    name: 'All Done',
    sessions: [{ name: 'A', completed: true }, { name: 'B', completed: true }],
  });
  setActiveRoutineSession(rt.id, getRoutine(rt.id).sessions[0].id);
  assert.equal(getActiveRoutineSession(rt.id), null);
});

test('normalizeRoutine reconciles active session away from completed sessions', () => {
  const allDone = normalizeRoutine({
    id: 'rt-all-done',
    name: 'All Done',
    sessions: [
      { id: 'rs-a', name: 'A', completed: true },
      { id: 'rs-b', name: 'B', completed: true },
    ],
    activeSessionId: 'rs-a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(allDone.activeSessionId, null);
});

test('updateRoutineSession completed uses canonical active-session advancement', () => {
  const rt = createRoutine({
    name: 'Patch Complete',
    sessions: [{ name: 'A' }, { name: 'B' }],
  });
  const [a, b] = getRoutine(rt.id).sessions;
  setActiveRoutineSession(rt.id, a.id);

  assert.ok(updateRoutineSession(rt.id, a.id, { completed: true }));
  assert.equal(getRoutine(rt.id).activeSessionId, b.id);

  assert.ok(updateRoutineSession(rt.id, b.id, { name: 'B renamed', completed: true }));
  const stored = getRoutine(rt.id);
  assert.equal(stored.sessions.find(s => s.id === b.id).name, 'B renamed');
  assert.equal(stored.activeSessionId, null);
});

test('deleteRoutineSession skips completed sessions when choosing next active', () => {
  const rt = createRoutine({
    name: 'Delete Skip Done',
    sessions: [
      { name: 'Done', completed: true },
      { name: 'Current' },
      { name: 'Later' },
    ],
  });
  const ids = getRoutine(rt.id).sessions.map(s => s.id);
  setActiveRoutineSession(rt.id, ids[1]);
  assert.ok(deleteRoutineSession(rt.id, ids[1]));
  assert.equal(getRoutine(rt.id).activeSessionId, ids[2]);
});

test('setActiveRoutineSession can target a completed session while practice resolves incomplete', () => {
  const rt = createRoutine({
    name: 'Review Complete',
    sessions: [{ name: 'Done', completed: true }, { name: 'Todo' }],
  });
  const ids = getRoutine(rt.id).sessions.map(s => s.id);
  setActiveRoutineSession(rt.id, ids[0]);
  assert.equal(getRoutine(rt.id).activeSessionId, ids[0]);
  const active = getActiveRoutineSession(rt.id);
  assert.equal(active.session.name, 'Todo');
  assert.equal(active.index, 1);
});

test('metronome patch merging', () => {
  const rt = createRoutine({ name: 'Metro Patch' });
  const s = addRoutineSession(rt.id, {
    name: 'M',
    metronome: { bpm: 90, beats: 2, subdiv: 'triplet', accentFirst: false },
  });
  assert.ok(updateRoutineSession(rt.id, s.id, { metronome: { bpm: 140 } }));
  const metro = getRoutine(rt.id).sessions.find(x => x.id === s.id).metronome;
  assert.equal(metro.bpm, 140);
  assert.equal(metro.beats, 2);
  assert.equal(metro.subdiv, 'triplet');
  assert.equal(metro.accentFirst, false);

  assert.ok(updateRoutineSession(rt.id, s.id, { metronome: { bpm: 500 } }));
  assert.equal(
    getRoutine(rt.id).sessions.find(x => x.id === s.id).metronome.bpm,
    100,
  );
});

test('attach detach move session workbooks with duplicate rejection', () => {
  const rt = createRoutine({ name: 'WB Attach' });
  const s = addRoutineSession(rt.id, { name: 'S' });
  const added = attachWorkbooksToSession(rt.id, s.id, ['wb-1', 'wb-2', '', 'wb-1']);
  assert.deepEqual(added, ['wb-1', 'wb-2']);
  const again = attachWorkbooksToSession(rt.id, s.id, ['wb-1', 'wb-3']);
  assert.deepEqual(again, ['wb-3']);

  assert.ok(moveSessionWorkbook(rt.id, s.id, 'wb-3', -1));
  assert.deepEqual(
    getRoutine(rt.id).sessions[0].workbookIds,
    ['wb-1', 'wb-3', 'wb-2'],
  );
  assert.equal(moveSessionWorkbook(rt.id, s.id, 'wb-1', -1), false);

  assert.ok(detachWorkbookFromSession(rt.id, s.id, 'wb-1'));
  assert.deepEqual(getRoutine(rt.id).sessions[0].workbookIds, ['wb-3', 'wb-2']);
});

test('collectAttachedWorkbookIds returns unique attached workbook ids', () => {
  const rt1 = createRoutine({
    name: 'Attached A',
    sessions: [
      { name: 'S1', workbookIds: ['wb-att-1', 'wb-att-2'] },
      { name: 'S2', workbookIds: ['wb-att-2', 'wb-att-3'] },
    ],
  });
  const rt2 = createRoutine({ name: 'Attached B' });
  const s2 = addRoutineSession(rt2.id, { name: 'S3' });
  attachWorkbooksToSession(rt2.id, s2.id, ['wb-att-3', 'wb-att-4']);

  const attached = collectAttachedWorkbookIds();
  assert.ok(attached instanceof Set);
  for (const id of ['wb-att-1', 'wb-att-2', 'wb-att-3', 'wb-att-4']) {
    assert.ok(attached.has(id), `expected attached set to include ${id}`);
  }
  assert.ok(!attached.has('wb-unattached'));
  assert.equal(new Set(['wb-att-1', 'wb-att-2', 'wb-att-3', 'wb-att-4']).size, 4);
  assert.ok(getRoutine(rt1.id));
});

test('pruneMissingWorkbooks removes only absent ids', () => {
  const rt = createRoutine({
    name: 'Prune Unique',
    sessions: [
      { name: 'S1', workbookIds: ['prune-keep', 'prune-drop'] },
      { name: 'S2', workbookIds: ['prune-keep2', 'prune-drop2'] },
    ],
  });
  const valid = ['prune-keep', 'prune-keep2'];
  const validSet = new Set(valid);
  let expected = 0;
  for (const r of listRoutines()) {
    for (const session of r.sessions) {
      for (const wbId of session.workbookIds) {
        if (!validSet.has(wbId)) expected++;
      }
    }
  }
  const removed = pruneMissingWorkbooks(valid);
  assert.equal(removed, expected);
  const stored = getRoutine(rt.id);
  assert.deepEqual(stored.sessions[0].workbookIds, ['prune-keep']);
  assert.deepEqual(stored.sessions[1].workbookIds, ['prune-keep2']);
});

test('getRoutineStats', () => {
  const rt = createRoutine({
    name: 'Stats',
    sessions: [
      { name: 'A', workbookIds: ['w1', 'w2'], durationMin: 15 },
      { name: 'B', workbookIds: ['w2', 'w3'], durationMin: null },
      { name: 'C', workbookIds: ['w1'], durationMin: 5 },
    ],
  });
  const byObj = getRoutineStats(getRoutine(rt.id));
  assert.deepEqual(byObj, {
    sessionCount: 3,
    completedSessionCount: 0,
    pendingSessionCount: 3,
    workbookCount: 5,
    uniqueWorkbookCount: 3,
    totalMinutes: 20,
  });
  const byId = getRoutineStats(rt.id);
  assert.deepEqual(byId, byObj);

  assert.ok(updateRoutineSession(rt.id, getRoutine(rt.id).sessions[0].id, { completed: true }));
  const withDone = getRoutineStats(rt.id);
  assert.equal(withDone.completedSessionCount, 1);
  assert.equal(withDone.pendingSessionCount, 2);
});

test('buildRoutineExport embeds referenced workbooks in first-referenced order', () => {
  const rt = createRoutine({
    name: 'Export Build',
    sessions: [
      { name: 'S1', workbookIds: ['wb-b', 'wb-a'] },
      { name: 'S2', workbookIds: ['wb-c', 'wb-a'] },
    ],
  });
  const resolveCalls = [];
  const envelope = buildRoutineExport({
    routineIds: [rt.id],
    resolveWorkbook: id => {
      resolveCalls.push(id);
      if (id === 'wb-missing') return null;
      return {
        id,
        name: `Book ${id}`,
        entries: [{ exerciseId: `ex-${id}` }, { junk: true }],
        companions: [{ type: 'scale-ref', root: 'C' }, { type: 'bad', root: 'C' }],
      };
    },
  });
  assert.deepEqual(resolveCalls, ['wb-b', 'wb-a', 'wb-c']);
  assert.equal(envelope.routines.length, 1);
  assert.equal(envelope.workbooks.length, 3);
  assert.deepEqual(envelope.workbooks.map(w => w.id), ['wb-b', 'wb-a', 'wb-c']);
  assert.deepEqual(envelope.workbooks[0].entries, [{ exerciseId: 'ex-wb-b' }]);
  assert.equal(envelope.workbooks[0].companions.length, 1);
  assert.equal(envelope.workbooks[0].companions[0].type, 'scale-ref');
});

test('validateRoutineExport happy path and lenient inputs', () => {
  const envelope = {
    app: 'musi',
    kind: ROUTINE_EXPORT_KIND,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    routines: [{ id: 'rt-1', name: 'R1', sessions: [{ id: 'rs-1', name: 'S' }] }],
    workbooks: [{ id: 'wb-1', name: 'W', entries: [{ exerciseId: 'ex-1' }] }],
  };
  const ok = validateRoutineExport(envelope);
  assert.equal(ok.ok, true);
  assert.equal(ok.routines.length, 1);
  assert.equal(ok.workbooks.length, 1);

  const fromJson = validateRoutineExport(JSON.stringify(envelope));
  assert.equal(fromJson.ok, true);

  const bareArray = validateRoutineExport([{ name: 'Bare', sessions: [] }]);
  assert.equal(bareArray.ok, true);
  assert.deepEqual(bareArray.workbooks, []);

  const bareSingle = validateRoutineExport({ name: 'Single' });
  assert.equal(bareSingle.ok, true);
  assert.deepEqual(bareSingle.workbooks, []);
});

test('validateRoutineExport rejection reasons', () => {
  assert.deepEqual(validateRoutineExport(null), {
    ok: false,
    error: 'This file is not a Musi routine export.',
  });
  assert.deepEqual(validateRoutineExport('{bad json'), {
    ok: false,
    error: 'That file is not valid JSON.',
  });
  assert.deepEqual(
    validateRoutineExport({ app: 'other', kind: ROUTINE_EXPORT_KIND, routines: [{ name: 'R' }] }),
    { ok: false, error: 'This file is not a Musi routine export.' },
  );
  assert.deepEqual(
    validateRoutineExport({ app: 'musi', kind: 'wrong', routines: [{ name: 'R' }] }),
    { ok: false, error: 'This file is not a Musi routine export.' },
  );
  assert.deepEqual(
    validateRoutineExport({
      app: 'musi',
      kind: ROUTINE_EXPORT_KIND,
      version: ROUTINE_EXPORT_VERSION + 1,
      routines: [{ name: 'R' }],
    }),
    { ok: false, error: 'This export was made by a newer version of Musi.' },
  );
  assert.deepEqual(
    validateRoutineExport({ app: 'musi', kind: ROUTINE_EXPORT_KIND, routines: [] }),
    { ok: false, error: 'No routines found in this file.' },
  );
});

test('applyRoutineImport round-trip with fresh ids and preserved session data', () => {
  const rt = createRoutine({
    name: 'Round Trip',
    description: 'desc',
    sessions: [{
      name: 'Session A',
      notes: 'keep notes',
      workbookIds: ['wb-export-1'],
      durationMin: 25,
      metronome: { bpm: 88, beats: 2, subdiv: 'sixteenth', accentFirst: false },
    }],
  });
  const envelope = buildRoutineExport({
    routineIds: [rt.id],
    resolveWorkbook: id => ({
      id,
      name: 'Exported WB',
      entries: [{ exerciseId: 'ex-1' }, { exerciseId: 'ex-missing' }],
    }),
  });
  const json = serializeRoutineExport(envelope);

  const result = applyRoutineImport(json, {
    existingWorkbooks: [{ id: 'wb-export-1', name: 'Exported WB', entries: [{ exerciseId: 'ex-1' }] }],
    existingExerciseIds: ['ex-1'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.imported.length, 1);
  assert.notEqual(result.imported[0].id, rt.id);
  assert.equal(result.imported[0].description, 'desc');
  assert.equal(result.imported[0].activeSessionId, null);
  const session = result.imported[0].sessions[0];
  assert.notEqual(session.id, envelope.routines[0].sessions[0].id);
  assert.equal(session.notes, 'keep notes');
  assert.equal(session.durationMin, 25);
  assert.equal(session.completed, false);
  assert.deepEqual(session.metronome, { bpm: 88, beats: 2, subdiv: 'sixteenth', accentFirst: false });
  assert.deepEqual(session.workbookIds, ['wb-export-1']);
  assert.equal(result.workbooksLinked, 1);
  assert.equal(result.workbooksCreated, 0);
  assert.equal(result.missingExercises, 1);
});

test('export and import preserve completed sessions', () => {
  const rt = createRoutine({
    name: 'Completed Export',
    sessions: [
      { name: 'Done', completed: true },
      { name: 'Todo' },
    ],
  });
  const envelope = buildRoutineExport({
    routineIds: [rt.id],
    resolveWorkbook: () => null,
  });
  assert.equal(envelope.routines[0].sessions[0].completed, true);
  assert.equal(envelope.routines[0].sessions[1].completed, false);

  const result = applyRoutineImport(envelope);
  assert.equal(result.ok, true);
  const imported = result.imported[0];
  assert.equal(imported.sessions[0].completed, true);
  assert.equal(imported.sessions[1].completed, false);
});

test('duplicateRoutine resets completed state on new sessions', () => {
  const rt = createRoutine({
    name: 'Dup Complete',
    sessions: [{ name: 'Done', completed: true }],
  });
  const dup = duplicateRoutine(rt.id);
  assert.equal(dup.sessions.length, 1);
  assert.equal(dup.sessions[0].completed, false);
});

test('applyRoutineImport links by name and creates via callback', () => {
  const envelope = buildRoutineExport({
    routineIds: [createRoutine({
      name: 'Name Link',
      sessions: [{ name: 'S', workbookIds: ['wb-old'] }],
    }).id],
    resolveWorkbook: () => ({
      id: 'wb-old',
      name: 'Local Match',
      entries: [{ exerciseId: 'ex-a' }],
    }),
  });

  const byName = applyRoutineImport(envelope, {
    existingWorkbooks: [{ id: 'wb-local', name: 'Local Match', entries: [{ exerciseId: 'ex-a' }] }],
  });
  assert.equal(byName.ok, true);
  assert.equal(byName.workbooksLinked, 1);
  assert.deepEqual(byName.imported[0].sessions[0].workbookIds, ['wb-local']);

  const createdIds = [];
  const byCreate = applyRoutineImport(envelope, {
    createWorkbook: ({ name, exerciseIds, companions }) => {
      const id = `wb-new-${createdIds.length}`;
      createdIds.push(id);
      assert.equal(name, 'Local Match');
      assert.deepEqual(exerciseIds, ['ex-a']);
      assert.ok(Array.isArray(companions));
      return id;
    },
  });
  assert.equal(byCreate.ok, true);
  assert.equal(byCreate.workbooksCreated, 1);
  assert.deepEqual(byCreate.imported[0].sessions[0].workbookIds, ['wb-new-0']);
});

test('applyRoutineImport drops attachments without createWorkbook callback', () => {
  const envelope = buildRoutineExport({
    routineIds: [createRoutine({
      name: 'Drop',
      sessions: [{ name: 'S', workbookIds: ['wb-ghost'] }],
    }).id],
    resolveWorkbook: id => ({ id, name: 'Ghost', entries: [] }),
  });
  const result = applyRoutineImport(envelope);
  assert.equal(result.ok, true);
  assert.equal(result.missingWorkbooks, 1);
  assert.deepEqual(result.imported[0].sessions[0].workbookIds, []);
});

test('applyRoutineImport twice produces two routines', () => {
  const envelope = buildRoutineExport({
    routineIds: [createRoutine({ name: 'Twice' }).id],
    resolveWorkbook: () => null,
  });
  const first = applyRoutineImport(envelope);
  const second = applyRoutineImport(envelope);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.imported[0].id, second.imported[0].id);
  assert.ok(listRoutines().filter(r => r.name === 'Twice').length >= 2);
});

test('routineExportFilename single and multi', () => {
  const single = routineExportFilename({
    routines: [{ name: 'My Cool Routine!!' }],
  });
  assert.match(single, /^musi-routine-my-cool-routine-\d{4}-\d{2}-\d{2}\.json$/);

  const multi = routineExportFilename({
    routines: [{ name: 'A' }, { name: 'B' }],
  });
  assert.match(multi, /^musi-routines-\d{4}-\d{2}-\d{2}\.json$/);
});

test('invalidateRoutinesCache allows store re-init after cache clear', () => {
  invalidateRoutinesCache();
  const rt = createRoutine({ name: 'After invalidate' });
  assert.ok(getRoutine(rt.id));
});

console.log(`\n${passed} tests passed`);
