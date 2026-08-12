/**
 * End-to-end cloudSync.js tests with a shared in-memory Supabase double.
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function assertLibraryPresent() {
  const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes') || '[]');
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

  await test('first device is source of truth and pushes every local record', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await seedFullLibrary();
      const { records } = await collectLocalRecords();
      assert.ok(records.length >= 5);

      const cloudSync = await signInFreshDevice(client, 'first');
      const status = cloudSync.getSyncStatus();
      assert.equal(status.firstSyncNeeded, false);
      assert.equal(status.signedIn, true);

      const meta = await getSyncMeta();
      assert.equal(meta.firstSyncDone, true);
      assert.equal(store.records.size, records.length);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('cloud is source after local reset on a second device', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    let cloudSyncA;
    let cloudSyncB;
    try {
      await seedFullLibrary();
      const { records } = await collectLocalRecords();
      cloudSyncA = await signInFreshDevice(client, 'cloud-a');

      resetDeviceLocal();
      cloudSyncB = await signInFreshDevice(client, 'cloud-b');
      const status = cloudSyncB.getSyncStatus();
      assert.equal(status.firstSyncNeeded, false);

      assertLibraryPresent();
      const patterns = await listPatterns();
      assert.ok(patterns.some((p) => p.id === 'usr-sync-1'));
      assert.equal(store.records.size, records.length);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('pull on demand applies remote edits and advances shadow cursor', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await seedFullLibrary();
      const cloudSyncA = await signInFreshDevice(client, 'pull-a');

      resetDeviceLocal();
      const cloudSyncB = await signInFreshDevice(client, 'pull-b');
      const revBefore = await getRev();

      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      notes[0].title = 'Edited on A';
      notes[0].updatedAt = '2026-01-05T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));
      await cloudSyncA.syncNow();

      await cloudSyncB.pullNow();
      const onB = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      assert.equal(onB[0].title, 'Edited on A');

      const revAfter = await getRev();
      assert.ok(revAfter >= revBefore);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('delete propagates through tombstone push and pull', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await seedFullLibrary();
      const cloudSyncA = await signInFreshDevice(client, 'del-a');

      resetDeviceLocal();
      const cloudSyncB = await signInFreshDevice(client, 'del-b');

      globalThis.localStorage.setItem('musi.notes', JSON.stringify([]));
      await cloudSyncA.syncNow();

      await cloudSyncB.pullNow();
      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes') || '[]');
      assert.equal(notes.length, 0);

      const tombstone = [...store.records.values()].find(
        (row) => row.domain === 'notes' && row.record_id === 'note-sync-1' && row.deleted,
      );
      assert.ok(tombstone);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  async function runFirstSyncConflictTest(client, store, choice, assertNotes) {
    resetDeviceLocal();
    resetSharedCloud();
    seedCloudNote(store, 'dev-cloud-only', 'note-cloud', 'From cloud');
    seedLocalOnlyNote('note-local', 'From device');
    const cloudSync = await signInFreshDevice(client, `choice-${choice}`);
    const status = cloudSync.getSyncStatus();
    assert.equal(status.firstSyncNeeded, true);
    assert.ok(status.firstSyncContext?.hasLocalData);
    assert.ok(status.firstSyncContext?.hasCloudData);
    await cloudSync.resolveFirstSync(choice);
    const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes') || '[]');
    assertNotes(notes);
    await cloudSync.handleSignedOut();
  }

  await test('first sync merge keeps records from cloud and device', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await runFirstSyncConflictTest(client, store, 'merge', (notes) => {
        assert.ok(notes.some((n) => n.id === 'note-local'));
        assert.ok(notes.some((n) => n.id === 'note-cloud'));
      });
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('first sync device keeps local records and drops cloud-only rows', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await runFirstSyncConflictTest(client, store, 'device', (notes) => {
        assert.ok(notes.some((n) => n.id === 'note-local'));
        assert.equal(notes.some((n) => n.id === 'note-cloud'), false);
      });
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('first sync cloud replaces local library with cloud copy', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await runFirstSyncConflictTest(client, store, 'cloud', (notes) => {
        assert.equal(notes.some((n) => n.id === 'note-local'), false);
        assert.ok(notes.some((n) => n.id === 'note-cloud'));
      });
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('echo suppression skips rows from the local device on pull', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await seedFullLibrary();
      const cloudSync = await signInFreshDevice(client, 'echo');

      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      notes[0].title = 'Local edit kept';
      notes[0].updatedAt = '2026-01-06T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));

      await cloudSync.pullNow();
      const after = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      assert.equal(after[0].title, 'Local edit kept');
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('offline reconcile queues work and online event pushes it', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await seedFullLibrary();
      const cloudSync = await signInFreshDevice(client, 'offline');
      const countBefore = store.records.size;

      globalThis.navigator.onLine = false;
      const notes = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
      notes[0].title = 'Offline edit';
      notes[0].updatedAt = '2026-01-07T00:00:00.000Z';
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));

      await cloudSync.syncNow();
      let status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'offline');

      globalThis.navigator.onLine = true;
      globalThis.dispatchEvent(new Event('online'));
      await sleep(600);
      await cloudSync.syncNow();

      status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'idle');
      assert.ok(store.records.size >= countBefore);
      const cloudNote = [...store.records.values()].find((r) => r.record_id === 'note-sync-1');
      assert.equal(cloudNote?.payload?.title, 'Offline edit');
    } finally {
      globalThis.navigator.onLine = true;
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });

  await test('mass-delete guard pauses and resolveMassDelete restores or pushes', async () => {
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      const notes = [];
      for (let i = 0; i < 4; i += 1) {
        notes.push({
          id: `note-mass-${i}`,
          title: `Note ${i}`,
          body: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });
      }
      globalThis.localStorage.setItem('musi.notes', JSON.stringify(notes));

      const cloudSync = await signInFreshDevice(client, 'mass');
      globalThis.localStorage.setItem('musi.notes', JSON.stringify([notes[0]]));
      await cloudSync.syncNow();

      let status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'paused');
      assert.ok(status.massDelete);
      assert.equal(status.massDelete.domain, 'notes');

      await cloudSync.resolveMassDelete('cancel');
      status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'idle');
      assert.equal(status.massDelete, null);

      globalThis.localStorage.setItem('musi.notes', JSON.stringify([notes[0]]));
      await cloudSync.syncNow();
      status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'paused');

      await cloudSync.resolveMassDelete('push');
      status = cloudSync.getSyncStatus();
      assert.equal(status.state, 'idle');

      const deletedRows = [...store.records.values()].filter(
        (row) => row.domain === 'notes' && row.deleted,
      );
      assert.ok(deletedRows.length >= 3);
    } finally {
      await tearDownAllCloudInstances();
      restoreTransport();
    }
  });
}
