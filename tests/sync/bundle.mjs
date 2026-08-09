/**
 * Zero-dependency Node tests for Musi library bundle export/import.
 * Run: node tests/sync/bundle.mjs
 */

import assert from 'node:assert/strict';
import { installIdbShim } from '../exercises/idbShim.mjs';

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _store: store,
  };
  return store;
}

installIdbShim();
const store = installLocalStorageShim();
globalThis.window = globalThis;

const {
  getFileBlob,
  listAudioMeta,
  deleteFile,
  putFileWithId,
} = await import('../../js/attachments.js');

const {
  collectAttachmentRefs,
  estimateBundle,
  createBundleStream,
  readBundle,
  importBundle,
  bundleFilename,
} = await import('../../js/sync/syncBundle.js');

const {
  putPatternRaw,
  listPatterns,
  deletePattern,
  getPattern,
} = await import('../../js/drums/drumPatternDb.js');

const { readZipEntries } = await import('../../js/sync/zip.js');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

async function clearAttachments() {
  const all = await listAudioMeta();
  for (const m of all) {
    await deleteFile(m.id);
  }
}

async function clearPatterns() {
  const all = await listPatterns();
  for (const p of all) {
    await deletePattern(p.id);
  }
}

function makeDrumPattern(id, overrides = {}) {
  return {
    id,
    builtin: false,
    name: 'Test beat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    stepsPerBar: 16,
    bars: 1,
    steps: [{ lane: 0, bar: 0, step: 0, on: true }],
    ...overrides,
  };
}

async function seedPattern(id, overrides = {}) {
  return putPatternRaw(makeDrumPattern(id, overrides));
}

async function streamToBlob(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new Blob(chunks);
}

async function blobBytesEqual(a, b) {
  const ab = new Uint8Array(await a.arrayBuffer());
  const bb = new Uint8Array(await b.arrayBuffer());
  if (ab.length !== bb.length) return false;
  for (let i = 0; i < ab.length; i += 1) {
    if (ab[i] !== bb[i]) return false;
  }
  return true;
}

function makeBulkGpExercises(attachmentId, count = 20) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      id: `ex-bar-${i}`,
      name: `Bars ${i * 4 + 1}-${(i + 1) * 4}`,
      attachmentId,
      addedAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return {
    categories: [{ id: 'cat-gp', name: 'Guitar Pro' }],
    items,
  };
}

async function seedAttachment(id, bytes, fileName = 'score.gp5') {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  return putFileWithId({
    id,
    blob,
    name: 'Score',
    fileName,
    type: blob.type,
    size: blob.size,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'exercise',
  });
}

await test('collectAttachmentRefs dedupes shared attachment and reports missing ids', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-shared-gp';
  const gpBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]);
  await seedAttachment(attId, gpBytes);

  store.set('musi.exercises', JSON.stringify(makeBulkGpExercises(attId, 20)));
  store.set('musi.songs', JSON.stringify([
    {
      id: 'song-1',
      title: 'Demo',
      lyrics: '',
      recordings: [{ id: 'att-rec-1', name: 'Take 1', addedAt: '2026-01-01T00:00:00.000Z' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]));
  store.set('musi.gpAnnotations', JSON.stringify({
    version: 1,
    byScore: {
      [`att:${attId}`]: { annotations: [] },
      'att:att-missing-ann': { annotations: [] },
    },
  }));

  const refs = await collectAttachmentRefs({ scopes: ['content'] });
  assert.equal(refs.ids.length, 3);
  assert.ok(refs.ids.includes(attId));
  assert.ok(refs.ids.includes('att-rec-1'));
  assert.ok(refs.ids.includes('att-missing-ann'));
  assert.deepEqual(refs.missing, ['att-rec-1', 'att-missing-ann']);
  assert.equal(refs.meta.length, 1);
  assert.equal(refs.meta[0].id, attId);
  assert.equal(refs.totalBytes, gpBytes.length);
});

await test('round trip restores byte-identical blobs under original ids', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-roundtrip';
  const gpBytes = new Uint8Array(4096);
  for (let i = 0; i < gpBytes.length; i += 1) gpBytes[i] = i & 0xff;
  await seedAttachment(attId, gpBytes);

  store.set('musi.exercises', JSON.stringify(makeBulkGpExercises(attId, 20)));

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const [zipBlob] = await Promise.all([streamToBlob(stream), done]);

  const bundle = await readBundle(zipBlob);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.manifest.fileCount, 1);
  assert.equal(bundle.manifest.attachments.length, 1);

  store.clear();
  await clearAttachments();

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.files.added, 1);

  const restored = await getFileBlob(attId);
  assert.ok(restored);
  assert.ok(await blobBytesEqual(restored, new Blob([gpBytes])));

  const exercises = JSON.parse(store.get('musi.exercises'));
  assert.equal(exercises.items.length, 20);
  assert.ok(exercises.items.every((it) => it.attachmentId === attId));
});

await test('import skips when same id and content already present', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-skip';
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await seedAttachment(attId, bytes);
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-local', name: 'Local', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  const incoming = JSON.parse(store.get('musi.exercises'));
  incoming.items.push({ id: 'ex-incoming', name: 'Incoming', attachmentId: attId, addedAt: '2026-01-02T00:00:00.000Z' });
  store.set('musi.exercises', JSON.stringify(incoming));

  const result = await importBundle(zipBlob, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.files.skipped, 1);
  assert.equal(result.files.added, 0);

  const blob = await getFileBlob(attId);
  assert.ok(await blobBytesEqual(blob, new Blob([bytes])));
});

await test('import remaps id on collision and leaves local file untouched', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-collision';
  const localBytes = new Uint8Array([9, 9, 9]);
  const incomingBytes = new Uint8Array([1, 2, 3]);
  await seedAttachment(attId, localBytes);

  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-local', name: 'Local', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const exportStore = new Map(store);
  store.clear();
  await clearAttachments();
  await seedAttachment(attId, incomingBytes);
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-remote', name: 'Remote', attachmentId: attId, addedAt: '2026-01-02T00:00:00.000Z' }],
  }));

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  store.clear();
  for (const [k, v] of exportStore) store.set(k, v);
  await clearAttachments();
  await seedAttachment(attId, localBytes);

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.files.replaced, 1);
  assert.equal(result.files.skipped, 0);

  const untouched = await getFileBlob(attId);
  assert.ok(await blobBytesEqual(untouched, new Blob([localBytes])));

  const exercises = JSON.parse(store.get('musi.exercises'));
  assert.equal(exercises.items.length, 1);
  const imported = exercises.items[0];
  assert.notEqual(imported.attachmentId, attId);
  const remapped = await getFileBlob(imported.attachmentId);
  assert.ok(await blobBytesEqual(remapped, new Blob([incomingBytes])));
});

await test('merge versus replace metadata semantics follow applySnapshot', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-meta';
  await seedAttachment(attId, new Uint8Array([7, 7]));
  store.set('musi.notes', JSON.stringify([
    { id: 'note-in', title: 'Incoming', body: 'y', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  ]));
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-in', name: 'Incoming ex', attachmentId: attId, addedAt: '2026-01-02T00:00:00.000Z' }],
  }));

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  store.clear();
  await clearAttachments();
  store.set('musi.notes', JSON.stringify([
    { id: 'note-local', title: 'Keep', body: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-local', name: 'Local ex', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  await seedAttachment(attId, new Uint8Array([7, 7]));

  const mergeResult = await importBundle(zipBlob, { mode: 'merge', scopes: ['content'] });
  assert.equal(mergeResult.errors.length, 0);
  const mergedNotes = JSON.parse(store.get('musi.notes'));
  assert.equal(mergedNotes.length, 2);
  const mergedEx = JSON.parse(store.get('musi.exercises'));
  assert.equal(mergedEx.items.length, 2);

  store.clear();
  await clearAttachments();
  store.set('musi.notes', JSON.stringify([
    { id: 'note-local', title: 'Keep', body: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-local', name: 'Local ex', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  await seedAttachment(attId, new Uint8Array([7, 7]));

  const replaceResult = await importBundle(zipBlob, { mode: 'replace', scopes: ['content'] });
  assert.equal(replaceResult.errors.length, 0);
  const replacedNotes = JSON.parse(store.get('musi.notes'));
  assert.equal(replacedNotes.length, 1);
  assert.equal(replacedNotes[0].id, 'note-in');
  const replacedEx = JSON.parse(store.get('musi.exercises'));
  assert.equal(replacedEx.items.length, 1);
  assert.equal(replacedEx.items[0].id, 'ex-in');
});

await test('corrupt or non-Musi zip returns ok false with friendly error', async () => {
  const garbage = new Blob([new Uint8Array([0, 1, 2, 3])]);
  const bad = await readBundle(garbage);
  assert.equal(bad.ok, false);
  assert.ok(bad.error.length > 0);

  const { createZipWriter } = await import('../../js/sync/zip.js');
  const writer = createZipWriter();
  await writer.addFile({ name: 'readme.txt', data: new Blob(['hello']) });
  await writer.close();
  const otherZip = await streamToBlob(writer.stream);
  const foreign = await readBundle(otherZip);
  assert.equal(foreign.ok, false);
  assert.ok(foreign.error.includes('manifest') || foreign.error.includes('Musi'));
});

await test('estimateBundle totals match archive contents', async () => {
  store.clear();
  await clearAttachments();
  await clearPatterns();

  const attId = 'att-estimate';
  const bytes = new Uint8Array(2048);
  await seedAttachment(attId, bytes);
  store.set('musi.exercises', JSON.stringify(makeBulkGpExercises(attId, 5)));

  const estimate = await estimateBundle({ scopes: ['content'] });
  assert.equal(estimate.fileCount, 1);
  assert.equal(estimate.missing.length, 0);

  const { stream, done, totalBytes: archiveTotal } = await createBundleStream({ scopes: ['content'] });
  assert.equal(estimate.totalBytes, archiveTotal);

  const zipBlob = await streamToBlob(stream);
  await done;

  const entries = await readZipEntries(zipBlob);
  const snapshotEntry = entries.find((e) => e.name === 'snapshot.json');
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  const fileEntry = entries.find((e) => e.name.startsWith('files/'));

  assert.equal(estimate.snapshotBytes, snapshotEntry.size);
  assert.equal(fileEntry.size, bytes.length);
});

await test('progress callbacks fire monotonically and reach total', async () => {
  store.clear();
  await clearAttachments();

  const attId = 'att-progress';
  await seedAttachment(attId, new Uint8Array(128));
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-1', name: 'One', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const events = [];
  const { stream, done } = await createBundleStream({
    scopes: ['content'],
    onProgress(ev) {
      events.push({ ...ev });
    },
  });
  const zipBlob = await streamToBlob(stream);
  await done;

  assert.ok(events.length >= 3);
  let prevDone = 0;
  for (const ev of events) {
    assert.ok(ev.done >= prevDone);
    prevDone = ev.done;
  }
  const last = events[events.length - 1];
  assert.equal(last.done, last.total);
  assert.equal(last.done, 3);

  store.clear();
  await clearAttachments();

  const importEvents = [];
  await importBundle(zipBlob, {
    mode: 'replace',
    scopes: ['content'],
    onProgress(ev) {
      importEvents.push({ ...ev });
    },
  });
  assert.equal(importEvents.length, 1);
  assert.equal(importEvents[0].done, importEvents[0].total);
});

await test('bundleFilename uses ISO date', async () => {
  assert.equal(bundleFilename(new Date('2026-08-09T15:00:00.000Z')), 'musi-library-2026-08-09.zip');
});

await test('drum patterns round trip preserves ids and timestamps', async () => {
  store.clear();
  await clearAttachments();
  await clearPatterns();

  const patId = 'usr-roundtrip-abc';
  await seedPattern(patId, {
    name: 'Rock fill',
    createdAt: '2025-06-15T10:00:00.000Z',
    updatedAt: '2025-07-20T14:30:00.000Z',
  });

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  const entries = await readZipEntries(zipBlob);
  const patternsEntry = entries.find((e) => e.name === 'drums/patterns.json');
  assert.ok(patternsEntry);

  const bundle = await readBundle(zipBlob);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.manifest.patternCount, 1);

  store.clear();
  await clearPatterns();

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.patterns.added, 1);

  const restored = await getPattern(patId);
  assert.ok(restored);
  assert.equal(restored.id, patId);
  assert.equal(restored.createdAt, '2025-06-15T10:00:00.000Z');
  assert.equal(restored.updatedAt, '2025-07-20T14:30:00.000Z');
  assert.equal(restored.name, 'Rock fill');
});

await test('import skips drum pattern when same id and identical content', async () => {
  store.clear();
  await clearPatterns();

  const patId = 'usr-skip-ident';
  await seedPattern(patId, { steps: [{ lane: 1, bar: 0, step: 4, on: true }] });

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  const result = await importBundle(zipBlob, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.patterns.skipped, 1);
  assert.equal(result.patterns.added, 0);
});

await test('import remaps drum pattern id on collision and rewrites drums.favorites', async () => {
  store.clear();
  await clearPatterns();

  const patId = 'usr-collision-drum';
  const localSteps = [{ lane: 0, bar: 0, step: 0, on: true }];
  const incomingSteps = [{ lane: 2, bar: 0, step: 8, on: true }];
  await seedPattern(patId, { steps: localSteps, name: 'Local beat' });

  store.set('musi:settings', JSON.stringify({ 'drums.favorites': [patId] }));

  const exportStore = new Map(store);
  store.clear();
  await clearPatterns();
  await seedPattern(patId, { steps: incomingSteps, name: 'Remote beat' });
  store.set('musi:settings', JSON.stringify({ 'drums.favorites': [patId] }));

  const { stream, done } = await createBundleStream({ scopes: ['content', 'settings'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  store.clear();
  for (const [k, v] of exportStore) store.set(k, v);
  await clearPatterns();
  await seedPattern(patId, { steps: localSteps, name: 'Local beat' });
  store.set('musi:settings', JSON.stringify({ 'drums.favorites': [patId] }));

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['content', 'settings'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.patterns.replaced, 1);
  assert.equal(result.patterns.skipped, 0);

  const untouched = await getPattern(patId);
  assert.ok(untouched);
  assert.equal(untouched.name, 'Local beat');
  assert.deepEqual(untouched.steps, localSteps);

  const settings = JSON.parse(store.get('musi:settings'));
  const fav = settings['drums.favorites'];
  assert.ok(Array.isArray(fav));
  assert.equal(fav.length, 1);
  assert.notEqual(fav[0], patId);
  const remapped = await getPattern(fav[0]);
  assert.ok(remapped);
  assert.equal(remapped.name, 'Remote beat');
  assert.deepEqual(remapped.steps, incomingSteps);
});

await test('drum patterns excluded when content scope is not selected', async () => {
  store.clear();
  await clearPatterns();

  await seedPattern('usr-no-content-scope');

  const { stream, done } = await createBundleStream({ scopes: ['content', 'settings'] });
  const zipBlob = await streamToBlob(stream);
  await done;

  await clearPatterns();

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['settings'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.patterns.added, 0);
  assert.equal((await listPatterns()).length, 0);
});

await test('estimateBundle totals include drum patterns entry', async () => {
  store.clear();
  await clearAttachments();
  await clearPatterns();

  const attId = 'att-est-patterns';
  const bytes = new Uint8Array(512);
  await seedAttachment(attId, bytes);
  store.set('musi.exercises', JSON.stringify(makeBulkGpExercises(attId, 2)));
  await seedPattern('usr-est-1');
  await seedPattern('usr-est-2');

  const estimate = await estimateBundle({ scopes: ['content'] });
  assert.equal(estimate.fileCount, 1);
  assert.equal(estimate.patternCount, 2);

  const { stream, done, totalBytes: archiveTotal } = await createBundleStream({ scopes: ['content'] });
  assert.equal(estimate.totalBytes, archiveTotal);

  const zipBlob = await streamToBlob(stream);
  await done;

  const entries = await readZipEntries(zipBlob);
  const snapshotEntry = entries.find((e) => e.name === 'snapshot.json');
  const fileEntry = entries.find((e) => e.name.startsWith('files/'));
  const patternsEntry = entries.find((e) => e.name === 'drums/patterns.json');

  assert.ok(patternsEntry);
  assert.equal(estimate.snapshotBytes, snapshotEntry.size);
  assert.equal(fileEntry.size, bytes.length);
});

await test('bundle without drum patterns entry imports cleanly', async () => {
  store.clear();
  await clearAttachments();
  await clearPatterns();

  const attId = 'att-legacy';
  await seedAttachment(attId, new Uint8Array([4, 5, 6]));
  store.set('musi.exercises', JSON.stringify({
    categories: [],
    items: [{ id: 'ex-legacy', name: 'Legacy', attachmentId: attId, addedAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const { stream, done } = await createBundleStream({ scopes: ['content'] });
  let zipBlob = await streamToBlob(stream);
  await done;

  const entries = await readZipEntries(zipBlob);
  assert.ok(!entries.some((e) => e.name === 'drums/patterns.json'));

  store.clear();
  await clearAttachments();

  const result = await importBundle(zipBlob, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  assert.equal(result.files.added, 1);
  assert.equal(result.patterns.added, 0);
});

console.log(`\n${passed} tests passed`);
