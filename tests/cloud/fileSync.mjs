/**
 * Attachment byte sync tests with the in-memory Supabase double.
 */

import assert from 'node:assert/strict';
import {
  putFileWithId,
  getFileBlob,
  hasFile,
  deleteFile,
} from '../../js/attachments.js';
import { setSyncMeta } from '../../js/cloud/shadowStore.js';
import { crc32Blob, crc32Hex } from '../../js/sync/crc32.js';
import {
  syncFiles,
  markFileDeleted,
  countPendingFiles,
  setFileSyncEnabled,
  isFileSyncEnabled,
  MAX_UPLOAD_BYTES,
  FILE_SYNC_SETTING_KEY,
} from '../../js/cloud/blobSync.js';
import { resetIdbShimData } from '../exercises/idbShim.mjs';
import { installNavigatorShim } from './harness.mjs';
import {
  installSharedFakeCloud,
  restoreTransport,
  setFakeSession,
  resetSharedCloud,
} from './transportFake.mjs';

const TEST_USER = { id: 'user-file-sync', email: 'files@test.example' };

async function prepareBlobSync(client) {
  setFakeSession(client, { access_token: 'tok', user: TEST_USER });
  await setSyncMeta({ userId: TEST_USER.id, firstSyncDone: true });
  setFileSyncEnabled(true);
}

async function saveTestFile(id, bytes, meta = {}) {
  const blob = new Blob([bytes], { type: meta.type || 'application/octet-stream' });
  return putFileWithId({
    id,
    blob,
    name: meta.name || 'Test file',
    fileName: meta.fileName || 'test.bin',
    type: meta.type || 'application/octet-stream',
    size: blob.size,
    source: meta.source || 'exercise',
  });
}

function resetLocalDevice() {
  globalThis.localStorage.clear();
  resetIdbShimData();
}

export async function run(test) {
  installNavigatorShim();

  await test('local file uploads once and second pass uploads nothing', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-upload-1', new Uint8Array([1, 2, 3, 4]));

      const first = await syncFiles({ userId: TEST_USER.id });
      assert.equal(first.uploaded, 1);
      assert.equal(first.failed, 0);
      assert.equal(store.syncBlobs.size, 1);
      assert.equal(store.storageObjects.size, 1);

      const second = await syncFiles({ userId: TEST_USER.id });
      assert.equal(second.uploaded, 0);
      assert.equal(second.pendingUploads, 0);
    } finally {
      restoreTransport();
    }
  });

  await test('second device downloads the file and bytes match', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      const bytes = new Uint8Array([10, 20, 30, 40, 50]);
      await saveTestFile('att-dl-1', bytes, { name: 'Score', fileName: 'score.gp' });

      await syncFiles({ userId: TEST_USER.id });

      resetLocalDevice();
      await setSyncMeta({ userId: TEST_USER.id, firstSyncDone: true });
      setFileSyncEnabled(true);

      const pending = await countPendingFiles({ userId: TEST_USER.id });
      assert.equal(pending.downloads, 1);

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.downloaded, 1);
      assert.equal(await hasFile('att-dl-1'), true);

      const blob = await getFileBlob('att-dl-1');
      const buf = new Uint8Array(await blob.arrayBuffer());
      assert.deepEqual(buf, bytes);
    } finally {
      restoreTransport();
    }
  });

  await test('changed file re-uploads', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-change-1', new Uint8Array([1, 1, 1]));
      await syncFiles({ userId: TEST_USER.id });

      await saveTestFile('att-change-1', new Uint8Array([2, 2, 2, 2]));
      const pending = await countPendingFiles({ userId: TEST_USER.id });
      assert.equal(pending.uploads, 1);

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.uploaded, 1);

      const row = store.syncBlobs.get('att-change-1');
      const blob = await getFileBlob('att-change-1');
      const crc = crc32Hex(await crc32Blob(blob));
      assert.equal(row.crc32, crc);
      assert.equal(Number(row.size_bytes), blob.size);
    } finally {
      restoreTransport();
    }
  });

  await test('file above MAX_UPLOAD_BYTES is skipped and reported', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
      await saveTestFile('att-big-1', big);

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.uploaded, 0);
      assert.equal(result.skipped.length, 1);
      assert.equal(result.skipped[0].attachmentId, 'att-big-1');
      assert.equal(store.syncBlobs.size, 0);
    } finally {
      restoreTransport();
    }
  });

  await test('deleted attachment tombstones sync_blobs and removes storage object', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-del-1', new Uint8Array([9, 8, 7]));
      await syncFiles({ userId: TEST_USER.id });

      const path = `${TEST_USER.id}/att-del-1`;
      assert.ok(store.storageObjects.has(`attachments:${path}`));

      const deleted = await markFileDeleted('att-del-1', { userId: TEST_USER.id });
      assert.equal(deleted.ok, true);

      const row = store.syncBlobs.get('att-del-1');
      assert.equal(row.deleted, true);
      assert.equal(store.storageObjects.has(`attachments:${path}`), false);
    } finally {
      restoreTransport();
    }
  });

  await test('corrupt download is discarded instead of stored', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      const goodBytes = new Uint8Array([5, 6, 7, 8]);
      await saveTestFile('att-bad-1', goodBytes);
      await syncFiles({ userId: TEST_USER.id });

      const path = `${TEST_USER.id}/att-bad-1`;
      store.storageObjects.set(`attachments:${path}`, {
        blob: new Blob([new Uint8Array([0, 0, 0])]),
        contentType: 'application/octet-stream',
      });

      resetLocalDevice();
      await setSyncMeta({ userId: TEST_USER.id, firstSyncDone: true });
      setFileSyncEnabled(true);

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.downloaded, 0);
      assert.ok(result.errors.length >= 1);
      assert.equal(await hasFile('att-bad-1'), false);
    } finally {
      restoreTransport();
    }
  });

  await test('with file sync off no upload and no download happens', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-off-1', new Uint8Array([4, 4, 4]));

      setFileSyncEnabled(false);
      assert.equal(isFileSyncEnabled(), false);
      assert.equal(globalThis.localStorage.getItem(FILE_SYNC_SETTING_KEY), 'false');

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.uploaded, 0);
      assert.equal(result.downloaded, 0);
      assert.equal(store.syncBlobs.size, 0);
      assert.equal(store.storageObjects.size, 0);

      const pending = await countPendingFiles({ userId: TEST_USER.id });
      assert.equal(pending.uploads, 0);
      assert.equal(pending.downloads, 0);
    } finally {
      restoreTransport();
    }
  });
}
