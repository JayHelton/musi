// Node tests for the Previous/Next buttons in the Exercises player.
// The buttons step through the exercises of the open folder, in the order the
// library list shows them.
// Run: node tests/exercises/player-step.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';

installDomShim();
installIdbShim();

// The viewer measures the pane against the window, so give it these hooks.
window.addEventListener = window.addEventListener || (() => {});
window.removeEventListener = window.removeEventListener || (() => {});

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

// The parts of index.html that the Exercises library reads.
function buildDom() {
  document.body.children = [];
  document._byId.clear();
  const ids = [
    'sec-exercises', 'ex-workspace', 'ex-list', 'ex-category-list', 'ex-crumbs',
    'ex-tools', 'ex-status', 'ex-bulk-bar', 'ex-player-pane', 'ex-player-body',
    'ex-player-title', 'ex-player-actions', 'ex-player-back', 'ex-player-step',
    'ex-player-prev', 'ex-player-next', 'ex-player-pos',
  ];
  for (const id of ids) {
    const node = document.createElement(id.startsWith('ex-player-p') || id.endsWith('back') ? 'button' : 'div');
    node.setAttribute('id', id);
    document.body.appendChild(node);
  }
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

function els() {
  return {
    step: document.getElementById('ex-player-step'),
    prev: document.getElementById('ex-player-prev'),
    next: document.getElementById('ex-player-next'),
    pos: document.getElementById('ex-player-pos'),
    title: document.getElementById('ex-player-title'),
  };
}

await test('the step buttons walk the open folder in name order', async () => {
  seedStore({
    categories: [{ id: 'scales', name: 'Scales', parentId: '' }],
    items: [
      linkItem({ id: 'ex-c', name: 'Charlie', categoryId: 'scales' }),
      linkItem({ id: 'ex-a', name: 'Alpha', categoryId: 'scales' }),
      linkItem({ id: 'ex-b', name: 'Bravo', categoryId: 'scales' }),
    ],
  });
  buildDom();
  const mod = await loadExercises();
  mod.initExercises();
  mod.openExerciseFolderForRoute('scales');

  await mod.openExerciseViewer('ex-a');
  const view = els();
  assert.equal(view.step.hidden, false);
  assert.equal(view.pos.textContent, '1 of 3');
  // The first exercise has nothing before it.
  assert.equal(view.prev.disabled, true);
  assert.equal(view.next.disabled, false);

  view.next.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(view.title.textContent, 'Bravo');
  assert.equal(view.pos.textContent, '2 of 3');
  assert.equal(view.prev.disabled, false);
  assert.equal(view.next.disabled, false);

  view.next.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(view.title.textContent, 'Charlie');
  assert.equal(view.pos.textContent, '3 of 3');
  // The last exercise has nothing after it.
  assert.equal(view.next.disabled, true);

  view.prev.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(view.title.textContent, 'Bravo');

  mod.closeExerciseViewer();
  assert.equal(view.step.hidden, true);
});

await test('the step buttons stay away when the folder holds one exercise', async () => {
  seedStore({
    categories: [{ id: 'solo', name: 'Solo', parentId: '' }],
    items: [linkItem({ id: 'ex-only', name: 'Only', categoryId: 'solo' })],
  });
  buildDom();
  const mod = await loadExercises();
  mod.initExercises();
  mod.openExerciseFolderForRoute('solo');

  await mod.openExerciseViewer('ex-only');
  assert.equal(els().step.hidden, true);
  mod.closeExerciseViewer();
});

await test('an exercise of another folder steps through that folder', async () => {
  seedStore({
    categories: [
      { id: 'a', name: 'A', parentId: '' },
      { id: 'b', name: 'B', parentId: '' },
    ],
    items: [
      linkItem({ id: 'ex-a1', name: 'A one', categoryId: 'a' }),
      linkItem({ id: 'ex-b1', name: 'B one', categoryId: 'b' }),
      linkItem({ id: 'ex-b2', name: 'B two', categoryId: 'b' }),
    ],
  });
  buildDom();
  const mod = await loadExercises();
  mod.initExercises();
  // The browser stands in folder A, but the route opens an exercise of folder B.
  mod.openExerciseFolderForRoute('a');

  await mod.openExerciseViewer('ex-b1');
  const view = els();
  assert.equal(view.pos.textContent, '1 of 2');
  view.next.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(view.title.textContent, 'B two');
  mod.closeExerciseViewer();
});

console.log('exercises player step tests: ok');
