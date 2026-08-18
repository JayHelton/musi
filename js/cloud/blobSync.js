// Attachment byte sync — Supabase Storage + sync_blobs metadata rows.

import { getClient } from './client.js';
import { describeTransportError } from './transport.js';
import {
  listFilesMeta,
  getFileBlob,
  hasFile,
  putFileWithId,
  deleteFile,
} from '../attachments.js';
import { crc32Blob, crc32Hex } from '../sync/crc32.js';
import {
  enqueueBlob,
  listBlobQueue,
  dequeueBlob,
  getSyncMeta,
} from './shadowStore.js';

/**
 * The upload limit of the Storage bucket, not the local limit of the app.
 * Musi keeps a file of up to 250 MB on the device, but the bucket in
 * `supabase/config.toml` accepts 50 MiB, which is the limit of a free Supabase
 * plan. A larger file stays on the device and Musi reports it. Raise both
 * values together if you move to a paid plan.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const STORAGE_BUCKET = 'attachments';

let fileSyncMutex = false;

function storagePath(userId, attachmentId) {
  return `${userId}/${attachmentId}`;
}

function mapBlobError(error) {
  const msg = String(error?.message || error?.code || '');
  if (msg.toLowerCase().includes('sync_storage_cap_exceeded')) {
    return { code: 'sync_storage_cap_exceeded', message: 'Cloud file storage is full.' };
  }
  return describeTransportError(error);
}

function emptyResult() {
  return {
    uploaded: 0,
    downloaded: 0,
    cloudDeleted: 0,
    localDeleted: 0,
    skipped: [],
    failed: 0,
    pendingUploads: 0,
    pendingDownloads: 0,
    errors: [],
  };
}

async function resolveUserId(userId) {
  if (userId) return userId;
  const meta = await getSyncMeta();
  return meta.userId || null;
}

async function fetchLiveCloudBlobs(client) {
  const { data, error } = await client
    .from('sync_blobs')
    .select('attachment_id, crc32, size_bytes, mime_type, storage_path, deleted, updated_at, rev')
    .eq('deleted', false);
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((row) => {
    if (!row?.attachment_id) return;
    map.set(row.attachment_id, row);
  });
  return map;
}

async function localChecksum(attachmentId) {
  const blob = await getFileBlob(attachmentId);
  if (!blob) return null;
  const crc = await crc32Blob(blob);
  return {
    blob,
    crc32: crc32Hex(crc),
    size: blob.size,
    mimeType: blob.type || '',
  };
}

function needsUpload(localMeta, checksum, cloudRow) {
  if (!checksum) return false;
  if (!cloudRow) return true;
  return cloudRow.crc32 !== checksum.crc32
    || Number(cloudRow.size_bytes) !== Number(checksum.size);
}

async function upsertCloudBlobRow(client, {
  attachmentId,
  crc32Value,
  sizeBytes,
  mimeType,
  path,
}) {
  const { error } = await client
    .from('sync_blobs')
    .upsert({
      attachment_id: attachmentId,
      crc32: crc32Value,
      size_bytes: sizeBytes,
      mime_type: mimeType || null,
      storage_path: path,
      deleted: false,
    }, { onConflict: 'user_id,attachment_id' });
  if (error) throw error;
}

async function uploadOneFile(client, userId, localMeta, checksum, onProgress, done, total) {
  const attachmentId = localMeta.id;
  const path = storagePath(userId, attachmentId);

  if (checksum.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      skipped: {
        attachmentId,
        reason: 'The file is too large for cloud storage. It stays on this device.',
      },
    };
  }

  await enqueueBlob({
    attachmentId,
    direction: 'upload',
    crc32: checksum.crc32,
    size: checksum.size,
  });

  if (onProgress) {
    onProgress({ phase: 'upload', attachmentId, done, total });
  }

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, checksum.blob, {
      upsert: true,
      contentType: localMeta.type || checksum.mimeType || 'application/octet-stream',
    });
  if (uploadError) throw uploadError;

  await upsertCloudBlobRow(client, {
    attachmentId,
    crc32Value: checksum.crc32,
    sizeBytes: checksum.size,
    mimeType: localMeta.type || checksum.mimeType,
    path,
  });

  await dequeueBlob(attachmentId);
  return { ok: true };
}

async function downloadOneFile(client, userId, cloudRow, localMetaById, onProgress, done, total) {
  const attachmentId = cloudRow.attachment_id;
  const path = cloudRow.storage_path || storagePath(userId, attachmentId);

  await enqueueBlob({
    attachmentId,
    direction: 'download',
    crc32: cloudRow.crc32 || '',
    size: Number(cloudRow.size_bytes) || 0,
  });

  if (onProgress) {
    onProgress({ phase: 'download', attachmentId, done, total });
  }

  const { data: blob, error: downloadError } = await client.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (downloadError) throw downloadError;
  if (!blob) throw new Error('Download returned no data.');

  const localMeta = localMetaById.get(attachmentId);
  const saved = await putFileWithId({
    id: attachmentId,
    blob,
    name: localMeta?.name || attachmentId,
    fileName: localMeta?.fileName || '',
    type: localMeta?.type || cloudRow.mime_type || blob.type || '',
    size: Number(cloudRow.size_bytes) || blob.size,
    createdAt: localMeta?.createdAt,
    source: localMeta?.source || 'upload',
  });
  if (!saved) throw new Error('Could not save the file on this device.');

  const crc = await crc32Blob(blob);
  const hex = crc32Hex(crc);
  if (hex !== cloudRow.crc32 || Number(blob.size) !== Number(cloudRow.size_bytes)) {
    await deleteFile(attachmentId);
    throw new Error('Download checksum did not match. The file was discarded.');
  }

  await dequeueBlob(attachmentId);
  return { ok: true };
}

async function drainBlobQueue(client, userId, localMetaById, cloudById, result, onProgress) {
  const queue = await listBlobQueue();
  const uploads = queue.filter((entry) => entry.direction === 'upload');
  const downloads = queue.filter((entry) => entry.direction === 'download');
  const ordered = [...uploads, ...downloads];
  for (const entry of ordered) {
    if (!entry?.attachmentId) continue;
    try {
      if (entry.direction === 'upload') {
        const meta = localMetaById.get(entry.attachmentId);
        if (!meta) {
          await dequeueBlob(entry.attachmentId);
          continue;
        }
        const checksum = await localChecksum(entry.attachmentId);
        if (!checksum) {
          await dequeueBlob(entry.attachmentId);
          continue;
        }
        const uploadResult = await uploadOneFile(
          client,
          userId,
          meta,
          checksum,
          onProgress,
          result.uploaded,
          ordered.length,
        );
        if (uploadResult.skipped) {
          result.skipped.push(uploadResult.skipped);
          await dequeueBlob(entry.attachmentId);
          continue;
        }
        result.uploaded += 1;
      } else if (entry.direction === 'download') {
        const cloudRow = cloudById.get(entry.attachmentId);
        if (!cloudRow) {
          await dequeueBlob(entry.attachmentId);
          continue;
        }
        await downloadOneFile(
          client,
          userId,
          cloudRow,
          localMetaById,
          onProgress,
          result.downloaded,
          ordered.length,
        );
        result.downloaded += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        attachmentId: entry.attachmentId,
        phase: entry.direction,
        ...mapBlobError(error),
      });
    }
  }
}

async function runFilePass({
  userId,
  uploadOnly,
  downloadOnly,
  deleteCloudExtras,
  onProgress,
} = {}) {
  if (fileSyncMutex) {
    const counts = await countPendingFiles({ userId });
    return { ...emptyResult(), pendingUploads: counts.uploads, pendingDownloads: counts.downloads };
  }

  fileSyncMutex = true;
  const result = emptyResult();

  try {
    const resolvedUserId = await resolveUserId(userId);
    const client = await getClient();
    if (!client || !resolvedUserId) {
      return result;
    }

    const localList = await listFilesMeta();
    const localMetaById = new Map(localList.map((meta) => [meta.id, meta]));
    const cloudById = await fetchLiveCloudBlobs(client);

    await drainBlobQueue(client, resolvedUserId, localMetaById, cloudById, result, onProgress);

    if (deleteCloudExtras) {
      const extras = [];
      cloudById.forEach((_row, attachmentId) => {
        if (!localMetaById.has(attachmentId)) extras.push(attachmentId);
      });
      for (const attachmentId of extras) {
        try {
          await removeCloudFile(client, resolvedUserId, attachmentId);
          cloudById.delete(attachmentId);
          result.cloudDeleted += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            attachmentId,
            phase: 'delete',
            ...mapBlobError(error),
          });
        }
      }
    }

    if (!downloadOnly) {
      const uploadTargets = [];
      for (const meta of localList) {
        let checksum;
        try {
          checksum = await localChecksum(meta.id);
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            attachmentId: meta.id,
            phase: 'upload',
            ...mapBlobError(error),
          });
          continue;
        }
        if (!checksum) continue;
        if (checksum.size > MAX_UPLOAD_BYTES) {
          result.skipped.push({
            attachmentId: meta.id,
            reason: 'The file is too large for cloud storage. It stays on this device.',
          });
          continue;
        }
        const cloudRow = cloudById.get(meta.id);
        if (!needsUpload(meta, checksum, cloudRow)) continue;
        uploadTargets.push({ meta, checksum });
      }

      for (let i = 0; i < uploadTargets.length; i += 1) {
        const { meta, checksum } = uploadTargets[i];
        try {
          const uploadResult = await uploadOneFile(
            client,
            resolvedUserId,
            meta,
            checksum,
            onProgress,
            result.uploaded,
            uploadTargets.length,
          );
          if (uploadResult.skipped) {
            result.skipped.push(uploadResult.skipped);
            continue;
          }
          result.uploaded += 1;
          cloudById.set(meta.id, {
            attachment_id: meta.id,
            crc32: checksum.crc32,
            size_bytes: checksum.size,
            mime_type: meta.type || checksum.mimeType,
            storage_path: storagePath(resolvedUserId, meta.id),
            deleted: false,
          });
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            attachmentId: meta.id,
            phase: 'upload',
            ...mapBlobError(error),
          });
        }
      }
    }

    if (!uploadOnly) {
      const downloadTargets = [...cloudById.values()];

      for (let i = 0; i < downloadTargets.length; i += 1) {
        const row = downloadTargets[i];
        const attachmentId = row.attachment_id;
        try {
          const exists = await hasFile(attachmentId);
          if (exists) continue;

          await downloadOneFile(
            client,
            resolvedUserId,
            row,
            localMetaById,
            onProgress,
            result.downloaded,
            downloadTargets.length,
          );
          result.downloaded += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            attachmentId,
            phase: 'download',
            ...mapBlobError(error),
          });
        }
      }
    }

    const pending = await countPendingFiles({ userId: resolvedUserId });
    result.pendingUploads = pending.uploads;
    result.pendingDownloads = pending.downloads;
    return result;
  } catch (error) {
    result.errors.push({
      attachmentId: null,
      phase: 'sync',
      ...mapBlobError(error),
    });
    try {
      const pending = await countPendingFiles({ userId });
      result.pendingUploads = pending.uploads;
      result.pendingDownloads = pending.downloads;
    } catch (_) {
      /* ignore */
    }
    return result;
  } finally {
    fileSyncMutex = false;
  }
}

/** Upload local files, then download cloud files that are missing on this device. */
export async function syncFiles({ userId, onProgress } = {}) {
  return runFilePass({ userId, onProgress });
}

/**
 * Make the cloud files equal to the files on this device. Musi removes each
 * cloud file that this device does not hold, then uploads the local files.
 */
export async function replaceCloudFiles({ userId, onProgress } = {}) {
  return runFilePass({ userId, onProgress, uploadOnly: true, deleteCloudExtras: true });
}

/**
 * Make the files on this device equal to the cloud files. Musi removes each
 * local file that the cloud does not hold, then downloads the cloud files.
 */
export async function replaceLocalFiles({ userId, onProgress } = {}) {
  const result = emptyResult();
  try {
    const resolvedUserId = await resolveUserId(userId);
    const client = await getClient();
    if (!client || !resolvedUserId) return result;

    const cloudById = await fetchLiveCloudBlobs(client);
    const localList = await listFilesMeta();
    for (const meta of localList) {
      if (cloudById.has(meta.id)) continue;
      try {
        const removed = await deleteFile(meta.id);
        if (removed) result.localDeleted += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          attachmentId: meta.id,
          phase: 'delete',
          ...mapBlobError(error),
        });
      }
    }
  } catch (error) {
    result.errors.push({ attachmentId: null, phase: 'sync', ...mapBlobError(error) });
    return result;
  }

  const pass = await runFilePass({ userId, onProgress, downloadOnly: true });
  return {
    ...pass,
    localDeleted: result.localDeleted,
    failed: pass.failed + result.failed,
    errors: [...result.errors, ...pass.errors],
  };
}

/** Mark one cloud file deleted and remove its storage object. */
async function removeCloudFile(client, userId, attachmentId) {
  const path = storagePath(userId, attachmentId);
  const { error: updateError } = await client
    .from('sync_blobs')
    .update({ deleted: true })
    .eq('attachment_id', attachmentId);
  if (updateError) throw updateError;

  const { error: removeError } = await client.storage
    .from(STORAGE_BUCKET)
    .remove([path]);
  if (removeError && !String(removeError.message || '').toLowerCase().includes('not found')) {
    throw removeError;
  }

  await dequeueBlob(attachmentId);
}

export async function markFileDeleted(attachmentId, { userId } = {}) {
  if (!attachmentId) return { ok: false, error: { message: 'Missing attachment id.' } };
  try {
    const resolvedUserId = await resolveUserId(userId);
    const client = await getClient();
    if (!client || !resolvedUserId) {
      return { ok: false, error: { message: 'Cloud sync is not ready.' } };
    }

    await removeCloudFile(client, resolvedUserId, attachmentId);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: mapBlobError(error) };
  }
}

export async function countPendingFiles({ userId } = {}) {
  try {
    const resolvedUserId = await resolveUserId(userId);
    const client = await getClient();
    if (!client || !resolvedUserId) {
      return { uploads: 0, downloads: 0 };
    }

    const localList = await listFilesMeta();
    const cloudById = await fetchLiveCloudBlobs(client);

    let uploads = 0;
    for (const meta of localList) {
      const checksum = await localChecksum(meta.id);
      if (!checksum) continue;
      if (checksum.size > MAX_UPLOAD_BYTES) continue;
      const cloudRow = cloudById.get(meta.id);
      if (needsUpload(meta, checksum, cloudRow)) uploads += 1;
    }

    let downloads = 0;
    for (const row of cloudById.values()) {
      const exists = await hasFile(row.attachment_id);
      if (!exists) downloads += 1;
    }

    return { uploads, downloads };
  } catch (_) {
    return { uploads: 0, downloads: 0 };
  }
}

/** Tests can read whether a file pass is active. */
export function __isFileSyncBusyForTests() {
  return fileSyncMutex;
}
