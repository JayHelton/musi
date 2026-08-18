/**
 * End-to-end cloudSync.js tests with a shared in-memory Supabase double.
 * Every pass is one of the three manual operations: merge, cloud, or device.
 */

import assert from 'node:assert/strict';
import { savePattern, listPatterns } from '../../js/drums/drumPatternDb.js';
import { collectLocalRecords } from '../../js/cloud/reconcile.js';
import { getSyncMeta, getRev } from '../../js/cloud/shadowStore.js';
import { resetIdbShimData } from '../exercises/idbShim.mjs';
import {
  installDocumentShim,
  installNavigatorShim,
} from './harness.mjs';
import {
  installSharedFakeCloud,
  restoreTransport,
  setFakeSession,
  resetSharedCloud,
} from './transportFake.mjs';

const TEST_USER = { id: 'user-cloud-sync', email: 'sync@test.example' };
const TEST_SESSION = { access_token: 'fake-access-token', user: TEST_USER };

let cloudImportCounter = 0;
const activeCloudInstances = new Set();

async function loadCloudSync(suffix = '') {
  cloudImportCounter += 1;
  const tag = suffix || `n${cloudImportCounter}`;
  return import(`../../js/cloud/cloudSync.js?device=${tag}`);
}

function resetDeviceLocal() {
  globalThis.localStorage.clear();
  resetIdbShimData();
}

async function seedFullLibrary() {
  globalThis.localStorage.setItem('musi:settings', JSON.stringify({
    'global.volume': 0.75,
    stats: {
      today: { day: '2026-08-09', trainedMs: 500, attempts: 2, correct: 2, perSkill: {} },
      bestStreak: 4,
      currentStreak: 1,
      lastActivityTs: 100,
    },
  }));
  globalThis.localStorage.setItem('musi.notes', JSON.stringify([
    {
      id: 'note-sync-1',
      title: 'Cloud note',
      body: 'body',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ]));
  globalThis.localStorage.setItem('musi.songs', JSON.stringify([
    {
      id: 'song-sync-1',
      title: 'Cloud song',
      lyrics: 'la',
      recordings: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ]));
  globalThis.localStorage.setItem('musi.exercises', JSON.stringify({
    categories: [{ id: 'cat-sync-1', name: 'Tabs' }],
    items: [{
      id: 'ex-sync-1',
      name: 'Sync exercise',
      attachmentId: 'att-sync-1',
      addedAt: '2026-01-01T00:00:00.000Z',
    }],
  }));
  await savePattern({
    id: 'usr-sync-1',
    name: 'Sync beat',
    steps: [{ sound: 'kick', beat: 0 }],
    builtin: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
}

function seedLocalOnlyNote(id, title) {
  globalThis.localStorage.setItem('musi.notes', JSON.stringify([
    {
      id,
      title,
      body: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ]));
}

function seedCloudNote(store, deviceId, id, title) {
  const payload = {
    id,
    title,
    body: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  };
  store.revCounter += 1;
  const rev = store.revCounter;
  store.records.set(`notes:${id}`, {
    domain: 'notes',
    record_id: id,
    payload,
    deleted: false,
    device_id: deviceId,
    content_hash: 'cloud-hash',
    updated_at: '2026-01-03T00:00:00.000Z',
    rev,
  });
  store.maxRev = rev;
}

async function signInFreshDevice(client, suffix = '') {
  const cloudSync = await loadCloudSync(suffix);
  setFakeSession(client, TEST_SESSION);
  await cloudSync.handleSignedIn();
  activeCloudInstances.add(cloudSync);
  return cloudSync;
}

async function tearDownCloudSync(cloudSync) {
  if (cloudSync?.handleSignedOut) {
    await cloudSync.handleSignedOut();
    activeCloudInstances.delete(cloudSync);
  }
}

async function tearDownAllCloudInstances() {
  const pending = [...activeCloudInstances];
  activeCloudInstances.clear();
  for (const cloudSync of pending) {
    await tearDownCloudSync(cloudSync);
  }
}

function readNotes() {
  return JSON.parse(globalThis.localStorage.getItem('musi.notes') || '[]');
}

function assertLibraryPresent() {
  const notes = readNotes();
  assert.ok(notes.some((n) => n.id === 'note-sync-1'));
  const songs = JSON.parse(globalThis.localStorage.getItem('musi.songs') || '[]');
  assert.ok(songs.some((s) => s.id === 'song-sync-1'));
  const exercises = JSON.parse(globalThis.localStorage.getItem('musi.exercises') || '{}');
  assert.ok((exercises.items || []).some((e) => e.id === 'ex-sync-1'));
  const settings = JSON.parse(globalThis.localStorage.getItem('musi:settings') || '{}');
  assert.equal(settings.stats?.bestStreak, 4);
}

export async function run(test) {
  installDocumentShim();
  installNavigatorShim();

  await test('sign-in moves no data and reports both counts', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const { records } = await collectLocalRecords();

      const cloudSync = await signInFreshDevice(client, 'idle');
      const status = cloudSync.getSyncStatus();
      assert.equal(status.signedIn, true);
      assert.equal(status.state, 'idle');
      assert.equal(status.lastSyncAt, null);
      assert.equal(status.localCount, records.length);
      assert.equal(status.cloudCount, 0);
      assert.equal(store.records.size, 0, 'sign-in must not push anything');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('send this device writes every local record to the cloud', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const { records } = await collectLocalRecords();
      assert.ok(records.length >= 5);

      const cloudSync = await signInFreshDevice(client, 'send');
      await cloudSync.sendDeviceCopy();

      const status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'idle');
      assert.equal(status.lastSyncMode, 'device');
      assert.ok(status.lastSyncAt > 0);
      assert.equal(store.records.size, records.length);

      const meta = await getSyncMeta();
      assert.equal(meta.lastSyncMode, 'device');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('send this device deletes the cloud rows this device does not hold', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      seedCloudNote(store, 'dev-other', 'note-cloud-only', 'Only in the cloud');
      seedLocalOnlyNote('note-local', 'On this device');

      const cloudSync = await signInFreshDevice(client, 'send-replace');
      await cloudSync.sendDeviceCopy();

      const rows = [...store.records.values()];
      assert.equal(rows.some((r) => r.record_id === 'note-cloud-only'), false);
      assert.ok(rows.some((r) => r.record_id === 'note-local'));
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('get the cloud copy clears the device and writes the cloud library', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSyncA = await signInFreshDevice(client, 'get-a');
      await cloudSyncA.sendDeviceCopy();
      const { records } = await collectLocalRecords();

      resetDeviceLocal();
      seedLocalOnlyNote('note-stale', 'Not in the cloud');
      const cloudSyncB = await signInFreshDevice(client, 'get-b');
      await cloudSyncB.getCloudCopy();

      const status = cloudSyncB.getSyncStatus();
      assert.equal(status.state, 'idle');
      assert.equal(status.lastSyncMode, 'cloud');

      assertLibraryPresent();
      assert.equal(readNotes().some((n) => n.id === 'note-stale'), false);
      const patterns = await listPatterns();
      assert.ok(patterns.some((p) => p.id === 'usr-sync-1'));
      assert.equal(store.records.size, records.length);

      const rev = await getRev();
      assert.ok(rev > 0);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('merge keeps the records of both sides and writes them back', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      seedCloudNote(store, 'dev-cloud-only', 'note-cloud', 'From cloud');
      seedLocalOnlyNote('note-local', 'From device');

      const cloudSync = await signInFreshDevice(client, 'merge');
      await cloudSync.mergeCopies();

      const notes = readNotes();
      assert.ok(notes.some((n) => n.id === 'note-local'));
      assert.ok(notes.some((n) => n.id === 'note-cloud'));

      const rows = [...store.records.values()].filter((r) => r.domain === 'notes' && !r.deleted);
      assert.ok(rows.some((r) => r.record_id === 'note-local'));
      assert.ok(rows.some((r) => r.record_id === 'note-cloud'));

      const status = cloudSync.getSyncStatus();
      assert.equal(status.lastSyncMode, 'merge');
      assert.equal(status.state, 'idle');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('merge deletes nothing and keeps the newer copy of a shared record', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSyncA = await signInFreshDevice(client, 'merge-a');
      await cloudSyncA.sendDeviceCopy();

      // The device drops the note; a merge must bring it back, not delete it.
      const notes = readNotes();
      globalThis.localStorage.setItem('musi.notes', JSON.stringify([]));
      await cloudSyncA.mergeCopies();
      assert.ok(readNotes().some((n) => n.id === notes[0].id));

      // A newer local edit wins over the cloud copy.
      const edited = readNotes();
      edited[0].title = 'Newer on this device';
      edited[0].updatedAt = '2026-06-01T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(edited));
      await cloudSyncA.mergeCopies();
      assert.equal(readNotes()[0].title, 'Newer on this device');

      const cloudNote = [...store.records.values()].find((r) => r.record_id === notes[0].id);
      assert.equal(cloudNote.payload.title, 'Newer on this device');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('merge carries an edit from one device to another', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSyncA = await signInFreshDevice(client, 'carry-a');
      await cloudSyncA.sendDeviceCopy();

      resetDeviceLocal();
      const cloudSyncB = await signInFreshDevice(client, 'carry-b');
      await cloudSyncB.getCloudCopy();

      const notes = readNotes();
      notes[0].title = 'Edited on B';
      notes[0].updatedAt = '2026-01-05T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));
      await cloudSyncB.mergeCopies();

      const cloudNote = [...store.records.values()].find((r) => r.record_id === 'note-sync-1');
      assert.equal(cloudNote.payload.title, 'Edited on B');
      assert.equal(store.records.size > 0, true);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('offline stops every operation and reports the offline state', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSync = await signInFreshDevice(client, 'offline');

      globalThis.navigator.onLine = false;
      await cloudSync.mergeCopies();
      assert.equal(cloudSync.getSyncStatus().state, 'offline');
      assert.equal(store.records.size, 0);

      globalThis.navigator.onLine = true;
      globalThis.dispatchEvent(new Event('online'));
      assert.equal(store.records.size, 0, 'the online event must not start a pass');

      await cloudSync.mergeCopies();
      assert.equal(cloudSync.getSyncStatus().state, 'idle');
      assert.ok(store.records.size > 0);
    } finally {
      globalThis.navigator.onLine = true;
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('a local edit alone never reaches the cloud', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSync = await signInFreshDevice(client, 'no-auto');
      await cloudSync.sendDeviceCopy();
      const sizeAfterPush = store.records.size;

      const notes = readNotes();
      notes[0].title = 'Quiet edit';
      notes[0].updatedAt = '2026-01-09T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));
      await new Promise((resolve) => { setTimeout(resolve, 800); });

      const cloudNote = [...store.records.values()].find((r) => r.record_id === 'note-sync-1');
      assert.equal(cloudNote.payload.title, 'Cloud note');
      assert.equal(store.records.size, sizeAfterPush);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('runSync starts the operation the button names', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      resetDeviceLocal();
      await seedFullLibrary();
      const cloudSync = await signInFreshDevice(client, 'run-sync');

      await cloudSync.runSync('device');
      assert.equal(cloudSync.getSyncStatus().lastSyncMode, 'device');

      await cloudSync.runSync('merge');
      assert.equal(cloudSync.getSyncStatus().lastSyncMode, 'merge');

      await cloudSync.runSync('cloud');
      assert.equal(cloudSync.getSyncStatus().lastSyncMode, 'cloud');

      await cloudSync.runSync('nonsense');
      assert.equal(cloudSync.getSyncStatus().lastSyncMode, 'cloud');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });
}
