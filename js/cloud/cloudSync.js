// Cloud sync orchestrator and public API.
//
// Musi never syncs on its own. The user starts every pass from the Settings
// screen, and each pass is one of three whole-library operations:
//
//   getCloudCopy()   The cloud replaces this device. Musi clears the local
//                    records first, then writes the whole cloud copy.
//   sendDeviceCopy() This device replaces the cloud. Musi deletes the cloud
//                    copy first, then writes every local record.
//   mergeCopies()    Musi adds what each side is missing. It deletes nothing.
//
// Every operation ends with the device and the cloud equal, except for files
// above the upload limit of the storage bucket. Those stay on the device.

import { isCloudEnabled } from './cloudConfig.js';
import {
  exchangeCodeFromUrl,
  getSession,
  getUser,
  registerDevice,
  touchDevice,
} from './auth.js';
import {
  collectLocalRecords,
  diffAgainstShadow,
  applyRemoteRecords,
  clearLocalRecords,
  captureDeviceLocalSettings,
  restoreDeviceLocalSettings,
  rebuildShadowFromLocal,
} from './reconcile.js';
import {
  getAllShadow,
  getDeviceId,
  getSyncMeta,
  setSyncMeta,
  setRev,
  resetSyncState,
  deleteShadowDatabase,
  clearShadow,
  clearTombstones,
  shadowKey,
} from './shadowStore.js';
import {
  pushRows,
  pullPage,
  countRemoteRows,
  deleteAllRemoteRows,
  describeTransportError,
  PULL_PAGE,
} from './transport.js';
import {
  syncFiles,
  replaceCloudFiles,
  replaceLocalFiles,
  countPendingFiles,
} from './blobSync.js';
import { SYNC_SCOPES } from '../sync/syncProfile.js';

export const CLOUD_STATUS_EVENT = 'musi:cloud-status';

const FILE_PROGRESS_THROTTLE_MS = 250;

let fileProgressThrottleTimer = null;
let fileProgressFirstPending = true;

const subscribers = new Set();
let initialized = false;
let running = false;
let removeWindowListeners = null;

function emptyFiles() {
  return {
    uploads: 0,
    downloads: 0,
    busy: false,
    lastError: null,
    phase: null,
    done: 0,
    total: 0,
  };
}

let status = {
  state: 'signed-out',
  signedIn: false,
  email: null,
  userId: null,
  deviceId: null,
  lastSyncAt: null,
  lastSyncMode: null,
  localCount: 0,
  cloudCount: 0,
  pendingChanges: 0,
  countsAt: null,
  error: null,
  online: browserOnline(),
  files: emptyFiles(),
};

function browserOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

function getWindow() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.window) return globalThis.window;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function publishStatus() {
  const snapshot = getSyncStatus();
  subscribers.forEach((fn) => {
    try { fn(snapshot); } catch (_) { /* ignore */ }
  });
  const win = getWindow();
  if (win?.dispatchEvent) {
    try {
      win.dispatchEvent(new CustomEvent(CLOUD_STATUS_EVENT, { detail: snapshot }));
    } catch (_) {
      /* ignore */
    }
  }
}

function setStatus(patch) {
  status = { ...status, ...patch };
  publishStatus();
}

function resetFileProgressThrottle() {
  fileProgressFirstPending = true;
  if (fileProgressThrottleTimer) {
    clearTimeout(fileProgressThrottleTimer);
    fileProgressThrottleTimer = null;
  }
}

function publishFilesProgressThrottled(force = false) {
  const files = status.files || {};
  const isComplete = files.total > 0 && files.done >= files.total;

  if (force || fileProgressFirstPending || isComplete) {
    fileProgressFirstPending = false;
    if (fileProgressThrottleTimer) {
      clearTimeout(fileProgressThrottleTimer);
      fileProgressThrottleTimer = null;
    }
    publishStatus();
    return;
  }

  if (!fileProgressThrottleTimer) {
    fileProgressThrottleTimer = setTimeout(() => {
      fileProgressThrottleTimer = null;
      publishStatus();
    }, FILE_PROGRESS_THROTTLE_MS);
  }
}

function patchFiles(filesPatch, { forcePublish = false } = {}) {
  status = { ...status, files: { ...status.files, ...filesPatch } };
  publishFilesProgressThrottled(forcePublish);
}

export function getSyncStatus() {
  return { ...status };
}

export function onSyncStatus(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function canUseNetwork() {
  return browserOnline();
}

// --- counts -----------------------------------------------------------------

/**
 * Count the records on this device and the rows in the cloud. The UI shows
 * both so the user can pick a direction before a pass runs. It also counts
 * the local records that changed after the last pass.
 */
export async function refreshCounts() {
  if (!status.signedIn) return getSyncStatus();

  let localCount = status.localCount;
  let pendingChanges = status.pendingChanges;
  try {
    const { records } = await collectLocalRecords();
    localCount = records.length;
    const shadow = await getAllShadow();
    const diff = await diffAgainstShadow(records, shadow);
    pendingChanges = diff.upserts.length + diff.tombstones.length;
  } catch (_) {
    /* keep the last count */
  }

  let cloudCount = status.cloudCount;
  let fileCounts = { uploads: 0, downloads: 0 };
  if (canUseNetwork()) {
    try {
      const { count, error } = await countRemoteRows();
      if (!error) cloudCount = count;
    } catch (_) {
      /* keep the last count */
    }
    try {
      fileCounts = await countPendingFiles({ userId: status.userId });
    } catch (_) {
      fileCounts = { uploads: 0, downloads: 0 };
    }
  }

  setStatus({
    localCount,
    cloudCount,
    pendingChanges,
    countsAt: Date.now(),
    files: {
      ...status.files,
      uploads: fileCounts.uploads,
      downloads: fileCounts.downloads,
    },
  });
  return getSyncStatus();
}

// --- shared pieces ----------------------------------------------------------

async function pullAllRemoteRows() {
  const rows = [];
  let cursor = 0;
  while (true) {
    const { rows: page, error } = await pullPage({ sinceRev: cursor, limit: PULL_PAGE });
    if (error) throw error;
    if (!page.length) break;
    rows.push(...page);
    cursor = page[page.length - 1].rev;
    if (page.length < PULL_PAGE) break;
  }
  return rows;
}

function liveRows(rows) {
  return (rows || []).filter((row) => row.deleted !== true);
}

function maxRevOf(rows) {
  let max = 0;
  (rows || []).forEach((row) => {
    const rev = Number(row.rev) || 0;
    if (rev > max) max = rev;
  });
  return max;
}

/** Download a ZIP of the library before a pass replaces the local copy. */
async function exportSafetyZip() {
  const { createBundleStream, bundleFilename } = await import('../sync/syncBundle.js');
  const scopes = SYNC_SCOPES.map((s) => s.id);
  const exportResult = await createBundleStream({ scopes });
  const reader = exportResult.stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await exportResult.done;

  const filename = exportResult.filename || bundleFilename();
  const blob = new Blob(chunks, { type: 'application/zip' });

  if (typeof document !== 'undefined' && document.body) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  }

  return { ok: true, filename, bytes: blob.size };
}

function onFileProgress({ phase, done, total }) {
  patchFiles({ phase, done, total });
}

/** Run one file pass and report its progress through the status. */
async function runFilePass(pass) {
  resetFileProgressThrottle();
  setStatus({
    files: { ...status.files, busy: true, phase: null, done: 0, total: 0 },
  });

  let result = null;
  let lastError = null;
  try {
    result = await pass({ userId: status.userId, onProgress: onFileProgress });
    lastError = result?.errors?.length ? result.errors[0] : null;
  } catch (error) {
    lastError = { attachmentId: null, phase: 'sync', ...describeTransportError(error) };
  }

  const lastTotal = status.files?.total || 0;
  if (lastTotal > 0) {
    patchFiles({ done: lastTotal, total: lastTotal }, { forcePublish: true });
  }
  resetFileProgressThrottle();
  setStatus({
    files: {
      uploads: result?.pendingUploads ?? 0,
      downloads: result?.pendingDownloads ?? 0,
      busy: false,
      lastError,
      phase: null,
      done: 0,
      total: 0,
    },
  });
  return result;
}

/** Write every local record to the cloud. Returns the acked revs by key. */
async function pushAllLocalRecords(records) {
  const deviceId = status.deviceId || await getDeviceId();
  const { acked, errors } = await pushRows({
    upserts: records,
    tombstones: [],
    deviceId,
  });
  if (errors.length) {
    const described = describeTransportError(errors[0]);
    throw Object.assign(new Error(described.message), described);
  }
  return acked;
}

async function markSynced(mode) {
  const now = Date.now();
  await setSyncMeta({ lastSyncAt: now, lastSyncMode: mode });
  setStatus({ lastSyncAt: now, lastSyncMode: mode, state: 'idle', error: null });
}

/**
 * Guard every operation: one at a time, signed in, and online.
 * @returns {{ ok: boolean }}
 */
function beginOperation(state) {
  if (!status.signedIn) return { ok: false };
  if (running) return { ok: false };
  if (!canUseNetwork()) {
    setStatus({ state: 'offline', error: describeTransportError({ message: 'offline' }) });
    return { ok: false };
  }
  running = true;
  setStatus({ state, error: null });
  return { ok: true };
}

function failOperation(error) {
  setStatus({ state: 'error', error: describeTransportError(error) });
}

// --- the three operations ---------------------------------------------------

/**
 * Replace this device with the cloud copy.
 * Musi reads the whole cloud copy first, then clears the local records, so a
 * network failure leaves the device as it was.
 */
export async function getCloudCopy() {
  if (!beginOperation('pulling').ok) return getSyncStatus();

  try {
    try {
      await exportSafetyZip();
    } catch (_) {
      setStatus({
        state: 'error',
        error: { code: 'backup_failed', message: 'Could not make a safety backup. Sync stopped.' },
      });
      return getSyncStatus();
    }

    const rows = await pullAllRemoteRows();
    const live = liveRows(rows);

    const deviceLocal = captureDeviceLocalSettings();
    await clearLocalRecords();
    await clearShadow();
    await clearTombstones();
    await applyRemoteRecords(live, { mode: 'replace' });
    restoreDeviceLocalSettings(deviceLocal);

    await runFilePass(replaceLocalFiles);

    await rebuildShadowFromLocal();
    await setRev(maxRevOf(rows));
    const deviceId = status.deviceId || await getDeviceId();
    await touchDevice(deviceId, { last_pulled_rev: maxRevOf(rows) });

    await markSynced('cloud');
    await refreshCounts();
  } catch (error) {
    failOperation(error);
  } finally {
    running = false;
  }
  return getSyncStatus();
}

/**
 * Replace the cloud copy with this device.
 * Musi deletes the cloud rows and the cloud files that this device does not
 * hold, then writes every local record and file.
 */
export async function sendDeviceCopy() {
  if (!beginOperation('pushing').ok) return getSyncStatus();

  try {
    const { records } = await collectLocalRecords();

    const { ok, error } = await deleteAllRemoteRows();
    if (!ok) throw error || new Error('Could not clear the cloud copy.');

    const acked = await pushAllLocalRecords(records);

    await runFilePass(replaceCloudFiles);

    const revByKey = new Map();
    acked.forEach((rev, key) => revByKey.set(key, rev));
    await clearShadow();
    await clearTombstones();
    await rebuildShadowFromLocal(revByKey);
    let maxRev = 0;
    acked.forEach((rev) => {
      if (Number(rev) > maxRev) maxRev = Number(rev);
    });
    await setRev(maxRev);

    await markSynced('device');
    await refreshCounts();
  } catch (error) {
    failOperation(error);
  } finally {
    running = false;
  }
  return getSyncStatus();
}

/**
 * Add to each side what the other side holds. Musi deletes nothing.
 * A record that both sides hold keeps the copy with the newer timestamp.
 * Musi writes the merged library back to the cloud, so both sides match.
 */
export async function mergeCopies() {
  if (!beginOperation('merging').ok) return getSyncStatus();

  try {
    const rows = await pullAllRemoteRows();
    const live = liveRows(rows);
    if (live.length) {
      await applyRemoteRecords(live, { mode: 'merge' });
    }

    const { records } = await collectLocalRecords();
    const acked = await pushAllLocalRecords(records);

    await runFilePass(syncFiles);

    const revByKey = new Map();
    acked.forEach((rev, key) => revByKey.set(key, rev));
    live.forEach((row) => {
      const key = shadowKey(row.domain, row.record_id);
      if (!revByKey.has(key)) revByKey.set(key, row.rev);
    });
    await clearTombstones();
    await rebuildShadowFromLocal(revByKey);
    let maxRev = maxRevOf(rows);
    acked.forEach((rev) => {
      if (Number(rev) > maxRev) maxRev = Number(rev);
    });
    await setRev(maxRev);
    const deviceId = status.deviceId || await getDeviceId();
    await touchDevice(deviceId, { last_pulled_rev: maxRev });

    await markSynced('merge');
    await refreshCounts();
  } catch (error) {
    failOperation(error);
  } finally {
    running = false;
  }
  return getSyncStatus();
}

/**
 * Start one operation by name. The UI passes the mode of the button.
 * @param {'merge'|'cloud'|'device'} mode
 */
export async function runSync(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'merge') return mergeCopies();
  if (normalized === 'cloud') return getCloudCopy();
  if (normalized === 'device') return sendDeviceCopy();
  return getSyncStatus();
}

// --- session ----------------------------------------------------------------

function attachWindowListeners() {
  const win = getWindow();
  if (!win) return () => {};

  const onOnline = () => {
    setStatus({
      online: true,
      state: status.state === 'offline' ? 'idle' : status.state,
      error: null,
    });
  };

  const onOffline = () => {
    setStatus({ online: false, state: 'offline' });
  };

  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);

  return () => {
    win.removeEventListener('online', onOnline);
    win.removeEventListener('offline', onOffline);
  };
}

export async function handleSignedIn() {
  const session = await getSession();
  const user = await getUser();
  if (!session || !user) {
    setStatus({ state: 'signed-out', signedIn: false });
    return;
  }

  const deviceId = await getDeviceId();
  await registerDevice(deviceId);

  const meta = await getSyncMeta();
  if (meta.userId && meta.userId !== user.id) {
    await resetSyncState();
  }
  await setSyncMeta({ userId: user.id });

  setStatus({
    signedIn: true,
    email: user.email || null,
    userId: user.id,
    deviceId,
    online: browserOnline(),
    state: 'idle',
    error: null,
    lastSyncAt: meta.lastSyncAt || null,
    lastSyncMode: meta.lastSyncMode || null,
  });

  if (!removeWindowListeners) {
    removeWindowListeners = attachWindowListeners();
  }

  await refreshCounts();
}

export async function handleSignedOut({ eraseLocal = false } = {}) {
  if (removeWindowListeners) {
    removeWindowListeners();
    removeWindowListeners = null;
  }
  resetFileProgressThrottle();

  if (eraseLocal) {
    await clearLocalRecords();
    await deleteShadowDatabase();
  }

  running = false;
  setStatus({
    state: 'signed-out',
    signedIn: false,
    email: null,
    userId: null,
    deviceId: null,
    lastSyncAt: null,
    lastSyncMode: null,
    localCount: 0,
    cloudCount: 0,
    pendingChanges: 0,
    countsAt: null,
    error: null,
    online: browserOnline(),
    files: emptyFiles(),
  });
}

export async function initCloudSync() {
  if (!isCloudEnabled()) return;
  if (initialized) return;
  initialized = true;

  await exchangeCodeFromUrl();

  const session = await getSession();
  if (!session) {
    setStatus({ state: 'signed-out', signedIn: false });
    return;
  }

  await handleSignedIn();
}
