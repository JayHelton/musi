// Node tests for Exercises nested folder support.
// Run: node tests/exercises/nested-folders.mjs

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

function buildDepthChain(depth) {
  const categories = [];
  for (let i = 0; i < depth; i += 1) {
    categories.push({
      id: `cat-${i + 1}`,
      name: `Level ${i + 1}`,
      parentId: i === 0 ? '' : `cat-${i}`,
    });
  }
  return categories;
}

await test('legacy flat categories read with parentId empty and keep every folder', async () => {
  seedStore({
    categories: [
      { id: 'cat-a', name: 'A' },
      { id: 'cat-b', name: 'B' },
    ],
    items: [],
  });
  const { getCategories } = await loadExercises();
  const cats = getCategories();
  assert.equal(cats.length, 2);
  assert.deepEqual(cats.map((c) => c.parentId), ['', '']);
});

await test('createExerciseFolder under a parent and sibling-name dedupe rules', async () => {
  seedStore({
    categories: [
      { id: 'parent-a', name: 'Guitar', parentId: '' },
      { id: 'parent-b', name: 'Piano', parentId: '' },
    ],
    items: [],
  });
  const { createExerciseFolder, getCategories } = await loadExercises();

  const scalesA = createExerciseFolder('Scales', 'parent-a');
  assert.equal(scalesA.ok, true);
  assert.equal(scalesA.created, true);

  const scalesB = createExerciseFolder('Scales', 'parent-b');
  assert.equal(scalesB.ok, true);
  assert.equal(scalesB.created, true);

  const dup = createExerciseFolder('scales', 'parent-a');
  assert.equal(dup.ok, true);
  assert.equal(dup.created, false);
  assert.equal(dup.category.id, scalesA.category.id);

  const names = getCategories()
    .filter((c) => c.name.toLowerCase() === 'scales')
    .map((c) => c.parentId)
    .sort();
  assert.deepEqual(names, ['parent-a', 'parent-b']);
});

await test('depth limit blocks create at depth 6 with reason depth', async () => {
  seedStore({ categories: buildDepthChain(5), items: [] });
  const { createExerciseFolder, getCategories } = await loadExercises();

  const blocked = createExerciseFolder('Too Deep', 'cat-5');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'depth');
  assert.equal(getCategories().length, 5);
});

await test('moveExerciseFolder success, self, descendant, depth, and keeps items and children', async () => {
  seedStore({
    categories: [
      { id: 'root', name: 'Root', parentId: '' },
      { id: 'child', name: 'Child', parentId: 'root' },
      { id: 'grand', name: 'Grand', parentId: 'child' },
      { id: 'other', name: 'Other', parentId: '' },
    ],
    items: [
      linkItem({ id: 'ex-child', name: 'Child ex', categoryId: 'child' }),
      linkItem({ id: 'ex-grand', name: 'Grand ex', categoryId: 'grand' }),
    ],
  });
  const { moveExerciseFolder, getCategories, getExercises } = await loadExercises();

  assert.deepEqual(moveExerciseFolder('root', 'root'), { ok: false, reason: 'self' });
  assert.deepEqual(moveExerciseFolder('root', 'grand'), { ok: false, reason: 'descendant' });

  const ok = moveExerciseFolder('child', 'other');
  assert.deepEqual(ok, { ok: true, reason: '' });
  assert.equal(getCategories().find((c) => c.id === 'child').parentId, 'other');
  assert.equal(getExercises().find((it) => it.id === 'ex-child').categoryId, 'child');
  assert.equal(getCategories().find((c) => c.id === 'grand').parentId, 'child');
});

await test('moveExerciseFolder blocks depth when subtree would exceed limit', async () => {
  seedStore({
    categories: [
      { id: 'child', name: 'Child', parentId: '' },
      { id: 'grand', name: 'Grand', parentId: 'child' },
      ...buildDepthChain(4).map((c) => ({ ...c, id: `d-${c.id}`, parentId: c.parentId ? `d-${c.parentId}` : '' })),
    ],
    items: [],
  });
  const { moveExerciseFolder, getCategories } = await loadExercises();
  const deepLeaf = getCategories().find((c) => c.id === 'd-cat-4');
  assert.ok(deepLeaf, 'deep leaf folder exists');
  const deepBlocked = moveExerciseFolder('child', deepLeaf.id);
  assert.equal(deepBlocked.ok, false);
  assert.equal(deepBlocked.reason, 'depth');
});

await test('getExerciseFolderOptions order, depth, path, count vs totalCount', async () => {
  seedStore({
    categories: [
      { id: 'guitar', name: 'Guitar', parentId: '' },
      { id: 'scales', name: 'Scales', parentId: 'guitar' },
      { id: 'piano', name: 'Piano', parentId: '' },
    ],
    items: [
      linkItem({ id: 'ex-g', name: 'G', categoryId: 'guitar' }),
      linkItem({ id: 'ex-s', name: 'S', categoryId: 'scales' }),
      linkItem({ id: 'ex-p', name: 'P', categoryId: 'piano' }),
    ],
  });
  const { getExerciseFolderOptions } = await loadExercises();
  const opts = getExerciseFolderOptions();
  assert.equal(opts[0].id, 'all');
  assert.deepEqual(opts.slice(1).map((o) => o.id), ['guitar', 'scales', 'piano']);

  const guitar = opts.find((o) => o.id === 'guitar');
  const scales = opts.find((o) => o.id === 'scales');
  assert.equal(guitar.depth, 1);
  assert.equal(scales.depth, 2);
  assert.equal(guitar.count, 1);
  assert.equal(guitar.totalCount, 2);
  assert.equal(scales.count, 1);
  assert.equal(scales.totalCount, 1);
  assert.equal(scales.path, 'Guitar \u203A Scales');
});

await test('subtree filtering exposes descendant items when parent is selected', async () => {
  seedStore({
    categories: [
      { id: 'parent', name: 'Parent', parentId: '' },
      { id: 'child', name: 'Child', parentId: 'parent' },
    ],
    items: [
      linkItem({ id: 'ex-parent', name: 'Parent ex', categoryId: 'parent' }),
      linkItem({ id: 'ex-child', name: 'Child ex', categoryId: 'child' }),
      linkItem({ id: 'ex-loose', name: 'Loose', categoryId: '' }),
    ],
  });
  const { selectExerciseFolder, getExercisesInFolder } = await loadExercises();

  selectExerciseFolder('parent');
  const subtree = getExercisesInFolder('parent', { includeDescendants: true });
  assert.deepEqual(subtree.map((it) => it.id).sort(), ['ex-child', 'ex-parent']);
  const direct = getExercisesInFolder('parent');
  assert.deepEqual(direct.map((it) => it.id), ['ex-parent']);
});

await test('delete folder only lifts child folders one level and unfiles direct items', async () => {
  seedStore({
    categories: [
      { id: 'parent', name: 'Parent', parentId: '' },
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'sibling', name: 'Sibling', parentId: '' },
    ],
    items: [
      linkItem({ id: 'ex-parent', name: 'Parent ex', categoryId: 'parent' }),
      linkItem({ id: 'ex-child', name: 'Child ex', categoryId: 'child' }),
      linkItem({ id: 'ex-sibling', name: 'Sibling ex', categoryId: 'sibling' }),
    ],
  });
  const { deleteExerciseFolder, getCategories, getExercises } = await loadExercises();

  assert.equal(deleteExerciseFolder('parent'), true);
  const cats = getCategories();
  assert.equal(cats.length, 2);
  assert.equal(cats.find((c) => c.id === 'child').parentId, '');
  assert.ok(cats.some((c) => c.id === 'sibling'));

  const items = getExercises();
  assert.equal(items.find((it) => it.id === 'ex-parent').categoryId, '');
  assert.equal(items.find((it) => it.id === 'ex-child').categoryId, 'child');
});

await test('delete folder with contents removes whole subtree of folders and exercises', async () => {
  seedStore({
    categories: [
      { id: 'parent', name: 'Parent', parentId: '' },
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'keep', name: 'Keep', parentId: '' },
    ],
    items: [
      linkItem({ id: 'ex-parent', name: 'Parent ex', categoryId: 'parent' }),
      linkItem({ id: 'ex-child', name: 'Child ex', categoryId: 'child' }),
      linkItem({ id: 'ex-keep', name: 'Keep ex', categoryId: 'keep' }),
    ],
  });
  const {
    deleteExerciseFolderWithContents,
    getCategories,
    getExercises,
  } = await loadExercises();

  const result = await deleteExerciseFolderWithContents('parent');
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2);
  assert.equal(result.foldersDeleted, 2);
  assert.equal(getCategories().length, 1);
  assert.equal(getCategories()[0].id, 'keep');
  assert.equal(getExercises().length, 1);
  assert.equal(getExercises()[0].id, 'ex-keep');
});

await test('orphan parentId and cycle both sanitize on read', async () => {
  seedStore({
    categories: [
      { id: 'a', name: 'A', parentId: 'missing' },
      { id: 'b', name: 'B', parentId: 'c' },
      { id: 'c', name: 'C', parentId: 'b' },
    ],
    items: [],
  });
  const { getCategories } = await loadExercises();
  const cats = getCategories();
  assert.equal(cats.length, 3);
  assert.equal(cats.find((c) => c.id === 'a').parentId, '');
  assert.equal(cats.find((c) => c.id === 'b').parentId, '');
  assert.equal(cats.find((c) => c.id === 'c').parentId, '');
});

console.log('\nall nested-folders tests passed');
