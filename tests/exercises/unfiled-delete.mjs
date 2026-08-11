// Node tests for deleting exercises without a folder (categoryId empty).
// Run: node tests/exercises/unfiled-delete.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';

installDomShim();
installIdbShim();

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

function linkItem({ id, name, categoryId = '' }) {
  return {
    id,
    name,
    categoryId,
    attachmentId: '',
    url: `https://example.com/${id}`,
    fileName: '',
    type: 'text/uri-list',
    size: 0,
    addedAt: '2026-01-01T00:00:00.000Z',
  };
}

function seedStore({ categories = [], items = [] } = {}) {
  storage.clear();
  storage.set('musi.exercises', JSON.stringify({ categories, items }));
}

async function loadExercises() {
  const mod = await import('../../js/exercises.js');
  mod.invalidateExercisesCache?.();
  return mod;
}

async function test(name, fn) {
  await fn();
  console.log(`ok  ${name}`);
}

await test('getExercisesWithoutFolder lists only items with empty categoryId', async () => {
  seedStore({
    categories: [{ id: 'cat-a', name: 'Folder A' }],
    items: [
      linkItem({ id: 'ex-filed', name: 'Filed', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-loose-1', name: 'Loose 1', categoryId: '' }),
      linkItem({ id: 'ex-loose-2', name: 'Loose 2', categoryId: '' }),
    ],
  });
  const { getExercisesWithoutFolder } = await loadExercises();

  const unfiled = getExercisesWithoutFolder();
  assert.equal(unfiled.length, 2);
  assert.ok(unfiled.every(it => !it.categoryId));
  assert.deepEqual(unfiled.map(it => it.id).sort(), ['ex-loose-1', 'ex-loose-2']);
});

await test('deleteExercisesWithoutFolder removes only unfiled exercises', async () => {
  seedStore({
    categories: [
      { id: 'cat-a', name: 'Folder A' },
      { id: 'cat-b', name: 'Folder B' },
    ],
    items: [
      linkItem({ id: 'ex-filed-a', name: 'A1', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-filed-b', name: 'B1', categoryId: 'cat-b' }),
      linkItem({ id: 'ex-loose-1', name: 'Loose 1', categoryId: '' }),
      linkItem({ id: 'ex-loose-2', name: 'Loose 2', categoryId: '' }),
    ],
  });
  const {
    getExercises,
    getExercisesWithoutFolder,
    deleteExercisesWithoutFolder,
  } = await loadExercises();

  assert.equal(getExercisesWithoutFolder().length, 2);

  const deleted = await deleteExercisesWithoutFolder();
  assert.equal(deleted, 2);

  const items = getExercises();
  assert.equal(items.length, 2);
  assert.ok(items.some(it => it.id === 'ex-filed-a' && it.categoryId === 'cat-a'));
  assert.ok(items.some(it => it.id === 'ex-filed-b' && it.categoryId === 'cat-b'));
  assert.ok(!items.some(it => it.id === 'ex-loose-1'));
  assert.ok(!items.some(it => it.id === 'ex-loose-2'));
});

await test('deleteExercisesWithoutFolder prunes workbook entries for removed exercises', async () => {
  seedStore({
    categories: [{ id: 'cat-a', name: 'Folder A' }],
    items: [
      linkItem({ id: 'ex-filed', name: 'Filed', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-loose', name: 'Loose', categoryId: '' }),
    ],
  });
  const {
    getExercises,
    deleteExercisesWithoutFolder,
  } = await loadExercises();
  const {
    createWorkbook,
    getWorkbook,
    pruneMissingExercisesAll,
  } = await import('../../js/workbookModel.js');

  const wb = createWorkbook({
    name: 'Mixed',
    exerciseIds: ['ex-filed', 'ex-loose'],
  });
  assert.equal(getWorkbook(wb.id).entries.length, 2);

  const deleted = await deleteExercisesWithoutFolder();
  assert.equal(deleted, 1);
  assert.equal(getExercises().length, 1);

  const pruned = pruneMissingExercisesAll(getExercises().map(it => it.id));
  assert.equal(pruned, 1);
  assert.deepEqual(getWorkbook(wb.id).entries.map(e => e.exerciseId), ['ex-filed']);
});

console.log('\nall unfiled-delete tests passed');
