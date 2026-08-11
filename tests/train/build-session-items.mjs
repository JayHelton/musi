/**
 * buildSessionItems regression tests for Train workspace.
 * Run via: node tests/train/run.mjs
 */

import assert from 'node:assert/strict';

export function runBuildSessionItemsTests({ test, buildSessionItems }) {
  test('buildSessionItems carries workbookId workbookName and entryId', () => {
    const routine = { id: 'rt-1', name: 'Daily' };
    const session = {
      id: 'rs-1',
      workbookIds: ['wb-a', 'wb-b'],
    };
    const workbooks = {
      'wb-a': {
        id: 'wb-a',
        name: 'Block A',
        entries: [
          { id: 'e1', exerciseId: 'ex-1' },
          { id: 'e2', exerciseId: 'ex-2' },
        ],
      },
      'wb-b': {
        id: 'wb-b',
        name: 'Block B',
        entries: [{ id: 'e3', exerciseId: 'ex-3' }],
      },
    };
    const exercises = {
      'ex-1': { id: 'ex-1', name: 'First' },
      'ex-2': { id: 'ex-2', name: 'Second' },
      'ex-3': { id: 'ex-3', name: 'Third' },
    };
    const items = buildSessionItems(routine, session, {
      getWorkbook: (id) => workbooks[id] || null,
      getExercise: (id) => exercises[id] || null,
    });
    assert.equal(items.length, 3);
    assert.equal(items[0].targetId, 'ex-1');
    assert.equal(items[0].workbookId, 'wb-a');
    assert.equal(items[0].workbookName, 'Block A');
    assert.equal(items[0].entryId, 'e1');
    assert.equal(items[1].workbookId, 'wb-a');
    assert.equal(items[1].entryId, 'e2');
    assert.equal(items[2].workbookId, 'wb-b');
    assert.equal(items[2].workbookName, 'Block B');
    assert.equal(items[2].entryId, 'e3');
    assert.equal(items[0].label, 'First');
    assert.equal(items[0].targetType, 'exercise');
  });

  test('buildSessionItems skips missing workbooks and empty entry lists', () => {
    const routine = { id: 'rt-2', name: 'Test' };
    const session = {
      id: 'rs-2',
      workbookIds: ['wb-missing', 'wb-empty', 'wb-ok'],
    };
    const workbooks = {
      'wb-empty': { id: 'wb-empty', name: 'Empty', entries: [] },
      'wb-ok': {
        id: 'wb-ok',
        name: 'OK',
        entries: [{ id: 'e1', exerciseId: 'ex-1' }],
      },
    };
    const items = buildSessionItems(routine, session, {
      getWorkbook: (id) => workbooks[id] || null,
      getExercise: (id) => ({ id: 'ex-1', name: 'Only' }),
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].workbookId, 'wb-ok');
    assert.equal(items[0].label, 'Only');
  });

  test('buildSessionItems uses exerciseId as label when exercise is missing', () => {
    const routine = { id: 'rt-3', name: 'Test' };
    const session = { id: 'rs-3', workbookIds: ['wb-1'] };
    const workbooks = {
      'wb-1': {
        id: 'wb-1',
        name: 'Solo',
        entries: [{ id: 'e1', exerciseId: 'ex-gone' }],
      },
    };
    const items = buildSessionItems(routine, session, {
      getWorkbook: (id) => workbooks[id] || null,
      getExercise: () => null,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].label, 'ex-gone');
    assert.equal(items[0].targetId, 'ex-gone');
    assert.equal(items[0].workbookName, 'Solo');
  });
}
