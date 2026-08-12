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

const tick = () => new Promise((r) => setTimeout(r, 0));

function dialogButtonLabels() {
  const root = document.getElementById('ex-dialog-root');
  assert.ok(root, 'ex-dialog-root exists');
  return root.querySelectorAll('button').map((b) => b.textContent);
}

function clickDialogButton(label) {
  const root = document.getElementById('ex-dialog-root');
  const btn = root.querySelectorAll('button').find((b) => b.textContent === label);
  assert.ok(btn, `dialog button "${label}"`);
  btn.click();
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

await test('requestExerciseFolderDelete guard inputs open no dialog', async () => {
  seedStore({
    categories: [{ id: 'cat-real', name: 'Real Folder' }],
    items: [
      linkItem({ id: 'ex-in', name: 'In folder', categoryId: 'cat-real' }),
      linkItem({ id: 'ex-loose', name: 'Loose', categoryId: '' }),
    ],
  });
  const { getCategories, getExercises, requestExerciseFolderDelete } = await loadExercises();

  const catsBefore = getCategories();
  const itemsBefore = getExercises();

  assert.equal(requestExerciseFolderDelete('all'), false);
  assert.equal(requestExerciseFolderDelete('uncategorized'), false);
  assert.equal(requestExerciseFolderDelete(''), false);
  assert.equal(requestExerciseFolderDelete(), false);
  assert.equal(requestExerciseFolderDelete('cat-missing'), false);

  assert.deepEqual(getCategories(), catsBefore);
  assert.deepEqual(getExercises(), itemsBefore);

  const root = document.getElementById('ex-dialog-root');
  assert.ok(!root || root.children.length === 0);
});

await test('requestExerciseFolderDelete opens three-button dialog for folder with exercises', async () => {
  seedStore({
    categories: [{ id: 'cat-x', name: 'Folder X' }],
    items: [
      linkItem({ id: 'ex-1', name: 'One', categoryId: 'cat-x' }),
      linkItem({ id: 'ex-2', name: 'Two', categoryId: 'cat-x' }),
    ],
  });
  const { getCategories, getExercises, requestExerciseFolderDelete } = await loadExercises();

  assert.equal(requestExerciseFolderDelete('cat-x'), true);

  assert.equal(getCategories().length, 1);
  assert.equal(getCategories()[0].id, 'cat-x');
  assert.equal(getExercises().length, 2);

  const labels = dialogButtonLabels();
  assert.equal(labels.length, 3);
  assert.ok(labels.includes('Cancel'));
  assert.ok(labels.includes('Delete folder only'));
  assert.ok(labels.includes('Delete folder + 2 exercises'));
});

await test('requestExerciseFolderDelete Delete folder only removes folder and unfiles exercises', async () => {
  seedStore({
    categories: [
      { id: 'cat-del', name: 'Delete Me' },
      { id: 'cat-keep', name: 'Keep' },
    ],
    items: [
      linkItem({ id: 'ex-del', name: 'Target', categoryId: 'cat-del' }),
      linkItem({ id: 'ex-keep', name: 'Safe', categoryId: 'cat-keep' }),
    ],
  });
  const { getCategories, getExercises, requestExerciseFolderDelete } = await loadExercises();

  assert.equal(requestExerciseFolderDelete('cat-del'), true);
  clickDialogButton('Delete folder only');

  assert.equal(getCategories().length, 1);
  assert.equal(getCategories()[0].id, 'cat-keep');

  const items = getExercises();
  assert.equal(items.length, 2);
  const unfiled = items.find((it) => it.id === 'ex-del');
  assert.ok(unfiled);
  assert.equal(unfiled.categoryId, '');
  assert.ok(items.find((it) => it.id === 'ex-keep' && it.categoryId === 'cat-keep'));
});

await test('requestExerciseFolderDelete Delete folder + exercises removes folder and contents', async () => {
  seedStore({
    categories: [
      { id: 'cat-a', name: 'Folder A' },
      { id: 'cat-b', name: 'Folder B' },
    ],
    items: [
      linkItem({ id: 'ex-a1', name: 'A1', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-a2', name: 'A2', categoryId: 'cat-a' }),
      linkItem({ id: 'ex-b1', name: 'B1', categoryId: 'cat-b' }),
    ],
  });
  const { getCategories, getExercises, requestExerciseFolderDelete } = await loadExercises();

  assert.equal(requestExerciseFolderDelete('cat-a'), true);
  clickDialogButton('Delete folder + 2 exercises');
  await tick();

  const cats = getCategories();
  assert.equal(cats.length, 1);
  assert.equal(cats[0].id, 'cat-b');

  const items = getExercises();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'ex-b1');
  assert.equal(items[0].categoryId, 'cat-b');
});

await test('requestExerciseFolderDelete empty folder uses plain confirm dialog', async () => {
  seedStore({
    categories: [
      { id: 'cat-empty', name: 'Empty' },
      { id: 'cat-other', name: 'Other' },
    ],
    items: [linkItem({ id: 'ex-other', name: 'Other ex', categoryId: 'cat-other' })],
  });
  const { getCategories, getExercises, requestExerciseFolderDelete } = await loadExercises();

  assert.equal(requestExerciseFolderDelete('cat-empty'), true);
  assert.equal(getCategories().length, 2);

  const labels = dialogButtonLabels();
  assert.equal(labels.length, 2);
  assert.ok(labels.includes('Cancel'));
  assert.ok(labels.includes('Delete'));

  clickDialogButton('Delete');

  assert.equal(getCategories().length, 1);
  assert.equal(getCategories()[0].id, 'cat-other');
  assert.equal(getExercises().length, 1);
  assert.equal(getExercises()[0].id, 'ex-other');
});

console.log('\nall folder-delete tests passed');
