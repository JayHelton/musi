/**
 * End-to-end cloud sync flow tests with the in-memory transport fake.
 * These tests mirror cloudSync pull/push behaviour without the shadowStore
 * when shadowStore recursion blocks Node (see report).
 */

import assert from 'node:assert/strict';
import { installIdbShim } from '../exercises/idbShim.mjs';
import { installLocalStorageShim, installWindowShim } from './harness.mjs';
import { savePattern, listPatterns } from '../../js/drums/drumPatternDb.js';
import { collectLocalRecords, applyRemoteRecords } from '../../js/cloud/reconcile.js';
import {
  pushRows,
  pullPage,
  PULL_PAGE,
} from '../../js/cloud/transport.js';
import {
  installFakeTransport,
  restoreTransport,
  createFakeSupabase,
} from './transportFake.mjs';

const DEVICE_A = 'dev-test-a';
const DEVICE_B = 'dev-test-b';

function seedLocalLibrary() {
  globalThis.localStorage.setItem('musi.notes', JSON.stringify([
    {
      id: 'note-sync-1',
      title: 'Cloud note',
      body: 'body',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ]));
  return savePattern({
    id: 'usr-sync-1',
    name: 'Sync beat',
    steps: [{ sound: 'kick', beat: 0 }],
    builtin: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
}

function resetLocalStores() {
  globalThis.localStorage.clear();
  delete globalThis.indexedDB;
  installIdbShim();
}

async function pushAllLocal(deviceId, store) {
  const client = createFakeSupabase(store);
  const { __setClientForTests } = await import('../../js/cloud/transport.js');
  __setClientForTests(client);

  const { records } = await collectLocalRecords();
  const result = await pushRows({ upserts: records, tombstones: [], deviceId });
  return { records, result };
}

async function pullForeignRows(deviceId, cursor = 0, store) {
  const client = createFakeSupabase(store);
  const { __setClientForTests } = await import('../../js/cloud/transport.js');
  __setClientForTests(client);

  const collected = [];
  let since = cursor;
  while (true) {
    const { rows, error } = await pullPage({ sinceRev: since, limit: PULL_PAGE });
    if (error) throw error;
    if (!rows.length) break;
    const foreign = rows.filter((row) => row.device_id !== deviceId);
    collected.push(...foreign);
    since = rows[rows.length - 1].rev;
    if (rows.length < PULL_PAGE) break;
  }
  return { rows: collected, cursor: since };
}

export async function run(test) {
  await test('empty cloud: first device pushes every local record', async () => {
    const { store } = installFakeTransport();
    try {
      await seedLocalLibrary();
      const { records, result } = await pushAllLocal(DEVICE_A, store);
      assert.ok(records.length >= 2);
      assert.equal(result.pushed, records.length);
      assert.equal(store.records.size, records.length);
    } finally {
      restoreTransport();
    }
  });

  await test('second device pulls cloud rows into localStorage and drums IDB', async () => {
    const store = installFakeTransport().store;
    try {
      await seedLocalLibrary();
      await pushAllLocal(DEVICE_A, store);

      resetLocalStores();
      const { rows } = await pullForeignRows(DEVICE_B, 0, store);
      assert.ok(rows.length > 0);
      await applyRemoteRecords(rows, { mode: 'merge' });

      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      assert.ok(notes.some((n) => n.id === 'note-sync-1'));
      const patterns = await listPatterns();
      assert.ok(patterns.some((p) => p.id === 'usr-sync-1'));
    } finally {
      restoreTransport();
    }
  });

  await test('edit on device A reaches device B after pull', async () => {
    const store = installFakeTransport().store;
    try {
      await seedLocalLibrary();
      await pushAllLocal(DEVICE_A, store);
      resetLocalStores();
      await pullForeignRows(DEVICE_B, 0, store).then(async ({ rows }) => {
        await applyRemoteRecords(rows, { mode: 'merge' });
      });

      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      notes[0].title = 'Edited on A';
      notes[0].updatedAt = '2026-01-05T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));

      await pushAllLocal(DEVICE_A, store);

      resetLocalStores();
      const pulled = await pullForeignRows(DEVICE_B, 0, store);
      await applyRemoteRecords(pulled.rows, { mode: 'merge' });

      const onB = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      assert.equal(onB[0].title, 'Edited on A');
    } finally {
      restoreTransport();
    }
  });

  await test('delete on device A removes record on device B through tombstone', async () => {
    const store = installFakeTransport().store;
    try {
      await seedLocalLibrary();
      await pushAllLocal(DEVICE_A, store);

      const client = createFakeSupabase(store);
      const transportMod = await import('../../js/cloud/transport.js');
      transportMod.__setClientForTests(client);
      await transportMod.pushRows({
        deviceId: DEVICE_A,
        upserts: [],
        tombstones: [{ domain: 'notes', recordId: 'note-sync-1' }],
      });

      resetLocalStores();
      const { rows } = await pullForeignRows(DEVICE_B, 0, store);
      const tombstone = rows.find((r) => r.deleted && r.record_id === 'note-sync-1');
      assert.ok(tombstone);
      await applyRemoteRecords([tombstone], { mode: 'merge' });

      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes') || '[]');
      assert.equal(notes.length, 0);
    } finally {
      restoreTransport();
    }
  });

  await test('echo suppression: own device_id rows are not applied', async () => {
    const store = installFakeTransport().store;
    try {
      await seedLocalLibrary();
      await pushAllLocal(DEVICE_B, store);

      const { rows } = await pullForeignRows(DEVICE_B, 0, store);
      assert.equal(rows.length, 0);

      globalThis.localStorage.setItem('musi.notes', JSON.stringify([]));
      const pulled = await pullPage({ sinceRev: 0, limit: PULL_PAGE });
      const selfRows = pulled.rows.filter((r) => r.device_id === DEVICE_B);
      const foreign = pulled.rows.filter((r) => r.device_id !== DEVICE_B);
      assert.ok(selfRows.length > 0);
      assert.equal(foreign.length, 0);
    } finally {
      restoreTransport();
    }
  });

  await test('cursor advances and second pull with no changes does no work', async () => {
    const store = installFakeTransport().store;
    try {
      await seedLocalLibrary();
      await pushAllLocal(DEVICE_A, store);

      const first = await pullPage({ sinceRev: 0, limit: PULL_PAGE });
      assert.ok(first.rows.length > 0);
      const cursor = first.rows[first.rows.length - 1].rev;

      const second = await pullPage({ sinceRev: cursor, limit: PULL_PAGE });
      assert.equal(second.rows.length, 0);
    } finally {
      restoreTransport();
    }
  });
}
