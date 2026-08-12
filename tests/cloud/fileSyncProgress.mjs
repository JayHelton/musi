/**
 * File sync progress reporting in cloudSync.js.
 */

import assert from 'node:assert/strict';
import { putFileWithId } from '../../js/attachments.js';
import { setSyncMeta } from '../../js/cloud/shadowStore.js';
import { setFileSyncEnabled } from '../../js/cloud/blobSync.js';
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

const TEST_USER = { id: 'user-file-progress', email: 'progress@test.example' };
const TEST_SESSION = { access_token: 'tok-progress', user: TEST_USER };

let cloudImportCounter = 0;

async function loadCloudSync() {
  cloudImportCounter += 1;
  return import(`../../js/cloud/cloudSync.js?progress=${cloudImportCounter}`);
}

function resetLocalDevice() {
  globalThis.localStorage.clear();
  resetIdbShimData();
}

async function saveTestFile(id, byte) {
  const blob = new Blob([new Uint8Array([byte])], { type: 'application/octet-stream' });
  return putFileWithId({
    id,
    blob,
    name: `File ${id}`,
    fileName: `${id}.bin`,
    type: 'application/octet-stream',
    size: blob.size,
    source: 'exercise',
  });
}

async function signInForFileSync(client) {
  const cloudSync = await loadCloudSync();
  setFakeSession(client, TEST_SESSION);
  await setSyncMeta({ userId: TEST_USER.id, firstSyncDone: true });
  setFileSyncEnabled(true);
  if (!globalThis.localStorage.getItem('musi:settings')) {
    globalThis.localStorage.setItem('musi:settings', JSON.stringify({}));
  }
  await cloudSync.handleSignedIn();
  return cloudSync;
}

export async function run(test) {
  installDocumentShim();
  installNavigatorShim();

  await test('file pass reports rising done with upload phase and fixed total', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    let cloudSync;
    try {
      cloudSync = await signInForFileSync(client);

      const fileCount = 5;
      for (let i = 0; i < fileCount; i += 1) {
        await saveTestFile(`att-prog-${i}`, i + 1);
      }

      const snapshots = [];
      const unsub = cloudSync.onSyncStatus((status) => {
        if (status.files?.busy && status.files?.phase === 'upload' && status.files.total > 0) {
          snapshots.push({
            done: status.files.done,
            total: status.files.total,
            phase: status.files.phase,
          });
        }
      });

      await cloudSync.syncFilesNow();
      unsub();

      assert.ok(snapshots.length >= 2, 'expected multiple progress snapshots');
      const totals = new Set(snapshots.map((s) => s.total));
      assert.equal(totals.size, 1, 'total must stay fixed during the pass');
      assert.equal([...totals][0], fileCount);

      const doneValues = snapshots.map((s) => s.done);
      for (let i = 1; i < doneValues.length; i += 1) {
        assert.ok(doneValues[i] >= doneValues[i - 1], 'done must not decrease');
      }
      assert.ok(doneValues[doneValues.length - 1] < fileCount || doneValues.includes(fileCount));
    } finally {
      if (cloudSync?.handleSignedOut) await cloudSync.handleSignedOut();
      restoreTransport();
    }
  });

  await test('file pass resets busy, phase, done, and total when it ends', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    let cloudSync;
    try {
      cloudSync = await signInForFileSync(client);
      await saveTestFile('att-reset-1', 9);
      await cloudSync.syncFilesNow();

      const status = cloudSync.getSyncStatus();
      assert.equal(status.files.busy, false);
      assert.equal(status.files.phase, null);
      assert.equal(status.files.done, 0);
      assert.equal(status.files.total, 0);
    } finally {
      if (cloudSync?.handleSignedOut) await cloudSync.handleSignedOut();
      restoreTransport();
    }
  });

  await test('throttle keeps the final published event with done equal to total', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    let cloudSync;
    try {
      cloudSync = await signInForFileSync(client);

      const fileCount = 12;
      for (let i = 0; i < fileCount; i += 1) {
        await saveTestFile(`att-throttle-${i}`, i + 10);
      }

      const published = [];
      const unsub = cloudSync.onSyncStatus((status) => {
        if (status.files?.total > 0) {
          published.push({
            done: status.files.done,
            total: status.files.total,
            busy: status.files.busy,
          });
        }
      });

      await cloudSync.syncFilesNow();
      unsub();

      assert.ok(published.length > 0);
      assert.ok(published.length < fileCount, 'throttle must skip some intermediate events');

      const withProgress = published.filter((s) => s.total > 0);
      const last = withProgress[withProgress.length - 1];
      assert.equal(last.done, last.total);
      assert.equal(last.total, fileCount);
    } finally {
      if (cloudSync?.handleSignedOut) await cloudSync.handleSignedOut();
      restoreTransport();
    }
  });

  await test('getSyncStatus files fields match progress during an active pass', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    let cloudSync;
    try {
      cloudSync = await signInForFileSync(client);

      for (let i = 0; i < 3; i += 1) {
        await saveTestFile(`att-live-${i}`, i + 20);
      }

      let sawActive = false;
      const unsub = cloudSync.onSyncStatus(() => {
        const { files } = cloudSync.getSyncStatus();
        if (files.busy && files.phase === 'upload' && files.total === 3) {
          sawActive = true;
          assert.equal(typeof files.done, 'number');
          assert.ok(files.done >= 0 && files.done <= files.total);
        }
      });

      await cloudSync.syncFilesNow();
      unsub();

      assert.equal(sawActive, true);
      const finalStatus = cloudSync.getSyncStatus();
      assert.equal(finalStatus.files.busy, false);
      assert.equal(finalStatus.files.phase, null);
    } finally {
      if (cloudSync?.handleSignedOut) await cloudSync.handleSignedOut();
      restoreTransport();
    }
  });
}
