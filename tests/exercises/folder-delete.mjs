// Node tests for Exercises folder delete (folder-only vs folder + contents).
// Run: node tests/exercises/folder-delete.mjs

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

await test('delete folder with contents removes folder and its exercises only', async () => {
  seedStore({
    categories: [
      { id: 'cat-a', name: 'Folder A' },
      { id: 'cat-b', name: 'Folder B' },
    ],
    items: [
      linkItem({ id: 'ex-a1', name: 'A1', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-a2', name: 'A2', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-b1', name: 'B1', categoryId: 'cat-b' }),
      linkItem({ id: 'ex-loose', name: 'Loose', categoryId: '' }),
    ],
  });
  const {
    getCategories,
    getExercises,
    deleteExerciseFolderWithContents,
  } = await loadExercises();

  const result = await deleteExerciseFolderWithContents('cat-a');
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2);

  const cats = getCategories();
  assert.equal(cats.length, 1);
  assert.equal(cats[0].id, 'cat-b');

  const items = getExercises();
  assert.equal(items.length, 2);
  assert.ok(items.some(it => it.id === 'ex-b1' && it.categoryId === 'cat-b'));
  assert.ok(items.some(it => it.id === 'ex-loose' && it.categoryId === ''));
  assert.ok(!items.some(it => it.categoryId === 'cat-a'));
});

await test('delete folder with contents on empty folder still removes folder', async () => {
  seedStore({
    categories: [{ id: 'cat-empty', name: 'Empty' }],
    items: [linkItem({ id: 'ex-other', name: 'Other', categoryId: '' })],
  });
  const {
    getCategories,
    getExercises,
    deleteExerciseFolderWithContents,
  } = await loadExercises();

  const result = await deleteExerciseFolderWithContents('cat-empty');
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  assert.equal(getCategories().length, 0);
  assert.equal(getExercises().length, 1);
});

await test('folder-only delete unfiles exercises in that folder', async () => {
  seedStore({
    categories: [
      { id: 'cat-del', name: 'Delete Me' },
      { id: 'cat-keep', name: 'Keep' },
    ],
    items: [
      linkItem({ id: 'ex-del', name: 'Target', categoryId: 'cat-del' }),
      linkItem({ id: 'ex-keep', name: 'Safe', categoryId: 'cat-keep' }),
      linkItem({ id: 'ex-loose', name: 'Loose', categoryId: '' }),
    ],
  });
  const {
    getCategories,
    getExercises,
    deleteExerciseFolder,
  } = await loadExercises();

  assert.equal(deleteExerciseFolder('cat-del'), true);

  assert.equal(getCategories().length, 1);
  assert.equal(getCategories()[0].id, 'cat-keep');

  const items = getExercises();
  assert.equal(items.length, 3);
  const unfiled = items.find(it => it.id === 'ex-del');
  assert.ok(unfiled);
  assert.equal(unfiled.categoryId, '');
  assert.ok(items.find(it => it.id === 'ex-keep' && it.categoryId === 'cat-keep'));
  assert.ok(items.find(it => it.id === 'ex-loose' && it.categoryId === ''));
});

console.log('\nall folder-delete tests passed');
