// Single-file upload input should share the bulk accept list.
// Run: node tests/exercises/upload-accept.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';
import { UPLOAD_ACCEPT_ATTR, BULK_ACCEPT_ATTR } from '../../js/exercisesBulk.js';

installDomShim();
installIdbShim();

assert.equal(BULK_ACCEPT_ATTR, UPLOAD_ACCEPT_ATTR);
assert.ok(UPLOAD_ACCEPT_ATTR.includes('video/*'));
assert.ok(UPLOAD_ACCEPT_ATTR.includes('.mp4'));

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

function mount(id, tag = 'div') {
  const node = document.createElement(tag);
  node.id = id;
  document.body.appendChild(node);
  return node;
}

mount('sec-exercises');
mount('ex-list');
mount('ex-category-list');
mount('ex-current-title');
mount('ex-status');
mount('ex-bulk-bar');
mount('ex-file-input', 'input');
mount('ex-bulk-file-input', 'input');
mount('ex-upload-btn', 'button');
mount('ex-bulk-upload-btn', 'button');
mount('ex-add-link-btn', 'button');
const addCatForm = mount('ex-add-cat-form', 'form');
const addCatInput = document.createElement('input');
addCatInput.id = 'ex-add-cat-input';
addCatForm.appendChild(addCatInput);
mount('ex-workspace');
const playerPane = mount('ex-player-pane');
mount('ex-player-back', 'button');
mount('ex-player-title');
mount('ex-player-actions');
mount('ex-player-body');
playerPane.hidden = true;

const { initExercises, invalidateExercisesCache } = await import('../../js/exercises.js');
invalidateExercisesCache?.();
initExercises();

const fileInput = document.getElementById('ex-file-input');
const bulkInput = document.getElementById('ex-bulk-file-input');
assert.equal(fileInput.getAttribute('accept'), UPLOAD_ACCEPT_ATTR);
assert.equal(bulkInput.getAttribute('accept'), BULK_ACCEPT_ATTR);

console.log('upload-accept: ok');
console.log('\nall upload-accept tests passed');
