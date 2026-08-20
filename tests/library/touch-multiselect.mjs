// Node tests for hold-to-select in the shared Drive-style library browser.
// The Exercises library and the Workbooks library both use this browser.
// Run: node tests/library/touch-multiselect.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';

installDomShim();

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};
// The browser reads this to tell a finger from a mouse.
let coarsePointer = true;
window.matchMedia = (queryText) => ({
  matches: coarsePointer && String(queryText).includes('coarse'),
  addEventListener() {},
  removeEventListener() {},
});

const { createDriveBrowser } = await import('../../js/library/driveBrowser.js');

const HOLD_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function test(name, fn) {
  await fn();
  console.log(`ok  ${name}`);
}

function makeBrowser() {
  storage.clear();
  const opened = [];
  const els = {
    nav: document.createElement('div'),
    crumbs: document.createElement('div'),
    tools: document.createElement('div'),
    selectionBar: document.createElement('div'),
    content: document.createElement('div'),
  };
  Object.values(els).forEach((node) => document.body.appendChild(node));

  const items = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
  ];
  const browser = createDriveBrowser({
    ns: `test${Math.random().toString(36).slice(2)}`,
    rootLabel: 'My Exercises',
    els,
    listFolders: () => [],
    listItems: () => items,
    itemFolderId: () => '',
    describeItem: (item) => ({
      id: item.id,
      name: item.name,
      typeLabel: 'PDF',
      size: 100,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    }),
    openItem: (item) => opened.push(item.id),
    deleteItems: () => ({ ok: true }),
    moveItems: () => ({ ok: true }),
    createFolder: () => ({ ok: true }),
    renameFolder: () => ({ ok: true }),
    moveFolder: () => ({ ok: true }),
    toast: () => {},
  });
  browser.render();
  return { browser, els, opened };
}

function row(els, name) {
  const hit = els.content.querySelectorAll('.drv-row')
    .find((node) => node.querySelector('.drv-row-name').textContent === name);
  assert.ok(hit, `row ${name} exists`);
  return hit;
}

function tap(node) {
  node.dispatch('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
  node.dispatch('pointerup', { pointerType: 'touch', clientX: 10, clientY: 10 });
  node.dispatch('click', { clientX: 10, clientY: 10 });
}

async function hold(node) {
  node.dispatch('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
  await wait(HOLD_MS);
  node.dispatch('pointerup', { pointerType: 'touch', clientX: 10, clientY: 10 });
  node.dispatch('click', { clientX: 10, clientY: 10 });
}

await test('a tap opens a row while no selection is active', () => {
  const { els, opened } = makeBrowser();
  tap(row(els, 'Alpha'));
  assert.deepEqual(opened, ['a']);
});

await test('a hold selects the row and does not open it', async () => {
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  assert.deepEqual(opened, []);
  assert.deepEqual(browser.getSelection(), ['item:a']);
});

await test('a tap after a hold adds another row instead of opening it', async () => {
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  tap(row(els, 'Bravo'));
  tap(row(els, 'Charlie'));
  assert.deepEqual(opened, []);
  assert.deepEqual(browser.getSelection().sort(), ['item:a', 'item:b', 'item:c']);
});

await test('a tap on a selected row takes it out of the selection', async () => {
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  tap(row(els, 'Bravo'));
  tap(row(els, 'Alpha'));
  assert.deepEqual(browser.getSelection(), ['item:b']);
  assert.deepEqual(opened, []);
});

await test('the last row out ends multi-select, so the next tap opens again', async () => {
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  tap(row(els, 'Alpha'));
  assert.deepEqual(browser.getSelection(), []);
  assert.equal(els.selectionBar.hidden, true);
  tap(row(els, 'Bravo'));
  assert.deepEqual(opened, ['b']);
});

await test('a hold on a second row also adds it to the selection', async () => {
  const { browser, els } = makeBrowser();
  await hold(row(els, 'Alpha'));
  await hold(row(els, 'Charlie'));
  assert.deepEqual(browser.getSelection().sort(), ['item:a', 'item:c']);
});

await test('a press that moves is a scroll, so it does not select', async () => {
  const { browser, els, opened } = makeBrowser();
  const node = row(els, 'Alpha');
  node.dispatch('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
  node.dispatch('pointermove', { pointerType: 'touch', clientX: 10, clientY: 90 });
  await wait(HOLD_MS);
  node.dispatch('pointerup', { pointerType: 'touch', clientX: 10, clientY: 90 });
  node.dispatch('click', { clientX: 10, clientY: 90 });
  assert.deepEqual(browser.getSelection(), []);
  assert.deepEqual(opened, ['a']);
});

await test('the selection bar reports the count while multi-select runs', async () => {
  const { els } = makeBrowser();
  await hold(row(els, 'Alpha'));
  tap(row(els, 'Bravo'));
  assert.equal(els.selectionBar.hidden, false);
  assert.equal(els.selectionBar.querySelector('.drv-sel-count').textContent, '2 selected');
});

await test('clearSelection ends multi-select', async () => {
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  browser.clearSelection();
  assert.deepEqual(browser.getSelection(), []);
  tap(row(els, 'Bravo'));
  assert.deepEqual(opened, ['b']);
});

// --- mouse ------------------------------------------------------------------

await test('a mouse press that stays down does not start multi-select', async () => {
  coarsePointer = false;
  const { browser, els, opened } = makeBrowser();
  const node = row(els, 'Alpha');
  node.dispatch('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
  await wait(HOLD_MS);
  node.dispatch('pointerup', { pointerType: 'mouse', clientX: 10, clientY: 10 });
  node.dispatch('click', { clientX: 10, clientY: 10 });
  // A mouse click still selects one row, and a double click still opens it.
  assert.deepEqual(browser.getSelection(), ['item:a']);
  assert.deepEqual(opened, []);
  node.dispatch('dblclick', {});
  assert.deepEqual(opened, ['a']);
  coarsePointer = true;
});

await test('a touch screen on a desktop still holds to select and taps to add', async () => {
  coarsePointer = false;
  const { browser, els, opened } = makeBrowser();
  await hold(row(els, 'Alpha'));
  tap(row(els, 'Bravo'));
  assert.deepEqual(browser.getSelection().sort(), ['item:a', 'item:b']);
  assert.deepEqual(opened, []);
  coarsePointer = true;
});

await test('a right click still opens the row menu on a desktop', () => {
  coarsePointer = false;
  const { els } = makeBrowser();
  row(els, 'Alpha').dispatch('contextmenu', { clientX: 20, clientY: 20 });
  assert.ok(document.querySelector('.drv-menu'), 'the row menu is open');
  coarsePointer = true;
});

console.log('library touch multi-select tests: ok');
