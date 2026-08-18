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
  replaceCloudFiles,
  replaceLocalFiles,
  MAX_UPLOAD_BYTES,
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
  await setSyncMeta({ userId: TEST_USER.id });
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
      await setSyncMeta({ userId: TEST_USER.id });

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
      await setSyncMeta({ userId: TEST_USER.id });

      const result = await syncFiles({ userId: TEST_USER.id });
      assert.equal(result.downloaded, 0);
      assert.ok(result.errors.length >= 1);
      assert.equal(await hasFile('att-bad-1'), false);
    } finally {
      restoreTransport();
    }
  });

  await test('replaceCloudFiles removes the cloud files this device does not hold', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-keep-1', new Uint8Array([1, 1, 1]));
      await saveTestFile('att-drop-1', new Uint8Array([2, 2, 2]));
      await syncFiles({ userId: TEST_USER.id });
      assert.equal(store.syncBlobs.size, 2);

      await deleteFile('att-drop-1');
      const result = await replaceCloudFiles({ userId: TEST_USER.id });
      assert.equal(result.cloudDeleted, 1);
      assert.equal(store.syncBlobs.get('att-drop-1').deleted, true);
      assert.equal(store.syncBlobs.get('att-keep-1').deleted, false);
      assert.equal(store.storageObjects.has(`attachments:${TEST_USER.id}/att-drop-1`), false);
    } finally {
      restoreTransport();
    }
  });

  await test('replaceLocalFiles removes the local files the cloud does not hold', async () => {
    resetLocalDevice();
    const store = resetSharedCloud();
    const { client } = installSharedFakeCloud({ store, fresh: false });
    try {
      await prepareBlobSync(client);
      await saveTestFile('att-cloud-1', new Uint8Array([3, 3, 3]));
      await syncFiles({ userId: TEST_USER.id });

      await saveTestFile('att-local-only', new Uint8Array([9, 9, 9]));
      const result = await replaceLocalFiles({ userId: TEST_USER.id });
      assert.equal(result.localDeleted, 1);
      assert.equal(await hasFile('att-local-only'), false);
      assert.equal(await hasFile('att-cloud-1'), true);
    } finally {
      restoreTransport();
    }
  });
}
