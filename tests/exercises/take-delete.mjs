// Take blob release on exercise / folder delete, including shared attachments.
// Run: node tests/exercises/take-delete.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';
import { saveFile, hasFile } from '../../js/attachments.js';

installDomShim();
installIdbShim();

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

function fileItem({ id, attachmentId, takes = [], categoryId = '' }) {
  return {
    id,
    name: id,
    categoryId,
    attachmentId,
    url: '',
    fileName: 'file.bin',
    type: 'application/octet-stream',
    size: 10,
    addedAt: '2026-01-01T00:00:00.000Z',
    takes,
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

await test('deleting exercise releases take blobs', async () => {
  const blob = new Blob(['take-a'], { type: 'audio/webm' });
  const takeMeta = await saveFile({
    blob, name: 'Take 1', type: 'audio/webm', fileName: 'take1.webm', size: blob.size, source: 'exercise-take',
  });
  const mainMeta = await saveFile({
    blob: new Blob(['main'], { type: 'audio/mpeg' }),
    name: 'Main', type: 'audio/mpeg', fileName: 'main.mp3', size: 4, source: 'exercise',
  });
  seedStore({
    items: [fileItem({
      id: 'ex-a',
      attachmentId: mainMeta.id,
      takes: [{
        id: 'take-1', attachmentId: takeMeta.id, name: 'Take 1', type: 'audio/webm', durationMs: 1000,
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    })],
  });
  const { deleteExerciseItem } = await loadExercises();
  await deleteExerciseItem('ex-a');
  assert.equal(await hasFile(mainMeta.id), false);
  assert.equal(await hasFile(takeMeta.id), false);
});

await test('shared take blob survives while another exercise references it', async () => {
  const sharedBlob = new Blob(['shared'], { type: 'audio/webm' });
  const sharedMeta = await saveFile({
    blob: sharedBlob, name: 'Shared', type: 'audio/webm', fileName: 'shared.webm', size: sharedBlob.size, source: 'exercise-take',
  });
  const take = {
    id: 'take-shared', attachmentId: sharedMeta.id, name: 'Shared', type: 'audio/webm', durationMs: 500,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  seedStore({
    items: [
      fileItem({ id: 'ex-1', attachmentId: 'att-only-1', takes: [take] }),
      fileItem({ id: 'ex-2', attachmentId: 'att-only-2', takes: [take] }),
    ],
  });
  const { deleteExerciseItem } = await loadExercises();
  await deleteExerciseItem('ex-1');
  assert.equal(await hasFile(sharedMeta.id), true);
  await deleteExerciseItem('ex-2');
  assert.equal(await hasFile(sharedMeta.id), false);
});

await test('folder delete with contents releases take blobs', async () => {
  const takeMeta = await saveFile({
    blob: new Blob(['take-b'], { type: 'audio/wav' }),
    name: 'Take B', type: 'audio/wav', fileName: 'b.wav', size: 5, source: 'exercise-take',
  });
  seedStore({
    categories: [{ id: 'cat-x', name: 'Folder X' }],
    items: [fileItem({
      id: 'ex-folder',
      attachmentId: 'att-main-x',
      categoryId: 'cat-x',
      takes: [{
        id: 'take-b', attachmentId: takeMeta.id, name: 'Take B', type: 'audio/wav', durationMs: 800,
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    })],
  });
  const { deleteExerciseFolderWithContents } = await loadExercises();
  const result = await deleteExerciseFolderWithContents('cat-x');
  assert.equal(result.deleted, 1);
  assert.equal(await hasFile(takeMeta.id), false);
});

console.log('\nall take-delete tests passed');
