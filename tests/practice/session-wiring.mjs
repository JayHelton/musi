/**
 * Practice session workbook wiring and snapshot restore tests.
 * Run via: node tests/practice/run.mjs
 */

import assert from 'node:assert/strict';

export function runSessionWiringTests({
  test,
  startSession,
  getSession,
  endSession,
  restoreSession,
  SESSION_STORAGE_KEY,
  resetAll,
  __setMetronomeDriverForTests,
  makeRecordingDriver,
  getSetting,
  invalidateSettingsCache,
  storage,
}) {
  const workbookItems = [
    {
      id: 'psi-e1',
      label: 'Scale run',
      targetType: 'exercise',
      targetId: 'ex-a',
      workbookId: 'wb-1',
      workbookName: 'Technique',
      entryId: 'wbe-1',
    },
    {
      id: 'psi-e2',
      label: 'Arpeggio',
      targetType: 'exercise',
      targetId: 'ex-b',
      workbookId: 'wb-1',
      workbookName: 'Technique',
      entryId: 'wbe-2',
    },
  ];

  test('startSession preserves workbook wiring sourceLabel and routineId', () => {
    resetAll();
    __setMetronomeDriverForTests(makeRecordingDriver());
    startSession({
      sourceType: 'routine-session',
      sourceId: 'rs-1',
      sourceLabel: 'Daily · Morning',
      routineId: 'rt-1',
      items: workbookItems,
    });
    const session = getSession();
    assert.equal(session.sourceLabel, 'Daily · Morning');
    assert.equal(session.routineId, 'rt-1');
    assert.equal(session.items.length, 2);
    assert.equal(session.items[0].workbookId, 'wb-1');
    assert.equal(session.items[0].workbookName, 'Technique');
    assert.equal(session.items[0].entryId, 'wbe-1');
    assert.equal(session.items[1].entryId, 'wbe-2');
    endSession();
  });

  test('restoreSession returns workbook wiring sourceLabel and routineId', () => {
    resetAll();
    __setMetronomeDriverForTests(makeRecordingDriver());
    startSession({
      sourceType: 'routine-session',
      sourceId: 'rs-seed-1',
      sourceLabel: 'Daily practice · Morning technique',
      routineId: 'rt-seed-1',
      items: workbookItems,
      metronome: { bpm: 92 },
    });
    const snap = getSetting(SESSION_STORAGE_KEY, null);
    assert.ok(snap && snap.id);
    assert.equal(snap.items[0].workbookId, 'wb-1');
    assert.equal(snap.routineId, 'rt-seed-1');
    assert.equal(snap.sourceLabel, 'Daily practice · Morning technique');

    endSession();
    invalidateSettingsCache();
    storage.store.set('musi:settings', JSON.stringify({ [SESSION_STORAGE_KEY]: snap }));
    invalidateSettingsCache();

    const restored = restoreSession();
    assert.ok(restored);
    assert.equal(restored.routineId, 'rt-seed-1');
    assert.equal(restored.sourceLabel, 'Daily practice · Morning technique');
    assert.equal(restored.items[0].workbookId, 'wb-1');
    assert.equal(restored.items[0].workbookName, 'Technique');
    assert.equal(restored.items[0].entryId, 'wbe-1');
    endSession();
  });

  test('free session item without workbook still works', () => {
    resetAll();
    __setMetronomeDriverForTests(makeRecordingDriver());
    const freeItems = [
      { id: 'item-free', label: 'Open drill', targetType: 'drill', targetId: 'scales' },
    ];
    startSession({ sourceType: 'free', items: freeItems });
    const session = getSession();
    assert.equal(session.items.length, 1);
    assert.equal(session.items[0].workbookId, '');
    assert.equal(session.items[0].workbookName, '');
    assert.equal(session.items[0].entryId, '');
    assert.equal(session.activeItemId, 'item-free');
    endSession();
  });
}
