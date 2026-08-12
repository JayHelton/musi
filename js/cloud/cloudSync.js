// Cloud sync orchestrator and public API.

import { isCloudEnabled } from './cloudConfig.js';
import {
  exchangeCodeFromUrl,
  getSession,
  getUser,
  registerDevice,
  touchDevice,
  onAuthChange,
} from './auth.js';
import { onDataChanged } from '../dataEvents.js';
import {
  collectLocalRecords,
  diffAgainstShadow,
  applyRemoteRecords,
  rebuildShadowFromLocal,
} from './reconcile.js';
import {
  getDeviceId,
  getSyncMeta,
  setSyncMeta,
  getRev,
  setRev,
  getAllShadow,
  putShadow,
  deleteShadow,
  putTombstones,
  getTombstones,
  clearTombstone,
  clearTombstones,
  clearShadow,
  resetSyncState,
  deleteShadowDatabase,
  shadowKey,
} from './shadowStore.js';
import {
  pushRows,
  pullPage,
  fetchBounds,
  countRemoteRows,
  describeTransportError,
  PULL_PAGE,
} from './transport.js';
import {
  subscribeSyncChannel,
  unsubscribeSyncChannel,
  refreshRealtimeAuth,
  realtimeState,
} from './realtimeLink.js';
import {
  syncFiles,
  downloadMissingFiles,
  countPendingFiles,
  markFileDeleted,
  isFileSyncEnabled,
} from './blobSync.js';
import { getAccessToken } from './auth.js';
import { SYNC_SCOPES } from '../sync/syncProfile.js';

export const CLOUD_STATUS_EVENT = 'musi:cloud-status';

const RECONCILE_DEBOUNCE_MS = 500;
const VISIBILITY_PULL_MS = 60_000;
const INTERVAL_PULL_MS = 5 * 60_000;

const subscribers = new Set();
let initialized = false;
let reconcileMutex = false;
let reconcileQueued = false;
let reconcileTimer = null;
let applyingRemote = false;
let massDeletePaused = false;
let pendingMassDeleteTombstones = [];
let intervalPullTimer = null;
let unsubDataChanged = null;
let unsubAuth = null;
let removeWindowListeners = null;

let status = {
  state: 'signed-out',
  signedIn: false,
  email: null,
  userId: null,
  deviceId: null,
  lastPushAt: null,
  lastPullAt: null,
  pendingUploads: 0,
  pendingDeletes: 0,
  firstSyncNeeded: false,
  firstSyncContext: null,
  massDelete: null,
  realtime: 'off',
  error: null,
  online: browserOnline(),
  files: {
    uploads: 0,
    downloads: 0,
    busy: false,
    lastError: null,
  },
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
  status = { ...status, ...patch, realtime: realtimeState() };
  publishStatus();
}

export function getSyncStatus() {
  return { ...status, realtime: realtimeState() };
}

export function onSyncStatus(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function canUseNetwork() {
  return browserOnline();
}

async function refreshPendingCounts() {
  const tombstones = await getTombstones();
  const unpushed = tombstones.filter((t) => !t.pushed);
  const shadow = await getAllShadow();
  const { records } = await collectLocalRecords();
  const diff = await diffAgainstShadow(records, shadow);
  const fileCounts = status.signedIn && status.userId
    ? await countPendingFiles({ userId: status.userId })
    : { uploads: 0, downloads: 0 };
  setStatus({
    pendingUploads: diff.upserts.length,
    pendingDeletes: unpushed.length || diff.tombstones.length,
    files: {
      uploads: fileCounts.uploads,
      downloads: fileCounts.downloads,
      busy: status.files?.busy || false,
      lastError: status.files?.lastError || null,
    },
  });
}

async function runFileSyncPass({ downloadIds } = {}) {
  if (!status.signedIn || !status.userId || !isFileSyncEnabled()) {
    await refreshPendingCounts();
    return null;
  }
  if (!canUseNetwork()) {
    await refreshPendingCounts();
    return null;
  }

  setStatus({
    files: {
      ...status.files,
      busy: true,
    },
  });

  let result;
  try {
    if (downloadIds?.length) {
      result = await downloadMissingFiles({
        userId: status.userId,
        ids: downloadIds,
      });
    } else {
      result = await syncFiles({ userId: status.userId });
    }
  } catch (error) {
    result = {
      uploaded: 0,
      downloaded: 0,
      skipped: [],
      failed: 1,
      pendingUploads: status.files?.uploads || 0,
      pendingDownloads: status.files?.downloads || 0,
      errors: [{ attachmentId: null, phase: 'sync', ...describeTransportError(error) }],
    };
  }

  const lastError = result?.errors?.length ? result.errors[0] : null;
  setStatus({
    files: {
      uploads: result?.pendingUploads ?? 0,
      downloads: result?.pendingDownloads ?? 0,
      busy: false,
      lastError,
    },
  });
  return result;
}

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

async function runApplyRemote(rows, mode, scopes) {
  applyingRemote = true;
  try {
    const deviceId = status.deviceId || await getDeviceId();
    const filtered = (rows || []).filter((row) => row.device_id !== deviceId);
    if (!filtered.length) return { applied: [], deleted: [] };

    const result = await applyRemoteRecords(filtered, { mode, scopes });
    for (const row of filtered) {
      const domain = row.domain;
      const recordId = row.record_id || row.recordId;
      if (row.deleted) {
        await deleteShadow(domain, recordId);
      }
    }
    return result;
  } finally {
    applyingRemote = false;
  }
}

async function doPush(upserts, tombstones) {
  if (!canUseNetwork()) {
    setStatus({ state: 'offline', error: describeTransportError({ message: 'offline' }) });
    return false;
  }

  setStatus({ state: 'pushing', error: null });
  const deviceId = status.deviceId || await getDeviceId();

  const pendingTombstones = await getTombstones();
  const mergedTombstones = [...(tombstones || [])];
  const tombKeys = new Set(mergedTombstones.map((t) => shadowKey(t.domain, t.recordId)));
  pendingTombstones.forEach((t) => {
    const key = shadowKey(t.domain, t.recordId);
    if (!tombKeys.has(key)) {
      mergedTombstones.push({ domain: t.domain, recordId: t.recordId });
      tombKeys.add(key);
    }
  });

  const { acked, errors } = await pushRows({
    upserts,
    tombstones: mergedTombstones,
    deviceId,
  });

  for (const tombstone of mergedTombstones) {
    if (tombstone.domain !== 'attachmentsMeta') continue;
    const key = shadowKey(tombstone.domain, tombstone.recordId);
    if (acked.has(key)) {
      await markFileDeleted(tombstone.recordId, { userId: status.userId });
    }
  }

  for (const [key, rev] of acked) {
    const sep = key.indexOf(':');
    if (sep < 0) continue;
    const domain = key.slice(0, sep);
    const recordId = key.slice(sep + 1);

    const upsertRow = (upserts || []).find((u) => u.domain === domain && u.recordId === recordId);
    if (upsertRow) {
      await putShadow(domain, recordId, {
        contentHash: upsertRow.contentHash,
        updatedAt: upsertRow.updatedAt,
        rev,
      });
      continue;
    }

    const isTombstone = mergedTombstones.some((t) => t.domain === domain && t.recordId === recordId);
    if (isTombstone) {
      await deleteShadow(domain, recordId);
      await clearTombstone(domain, recordId);
    }
  }

  const meta = await getSyncMeta();
  await setSyncMeta({ lastPushAt: Date.now() });
  setStatus({ lastPushAt: Date.now() || meta.lastPushAt });

  if (errors.length) {
    const described = describeTransportError(errors[0]);
    setStatus({ state: 'error', error: described });
    return false;
  }

  return true;
}

async function doPull() {
  if (!canUseNetwork()) {
    setStatus({ state: 'offline', error: describeTransportError({ message: 'offline' }) });
    return false;
  }

  setStatus({ state: 'pulling', error: null });
  const deviceId = status.deviceId || await getDeviceId();
  let cursor = await getRev();

  const bounds = await fetchBounds(cursor);
  if (bounds.fullResyncRequired || (cursor > 0 && cursor <= bounds.purgedThroughRev)) {
    await clearShadow();
    cursor = 0;
    await setRev(0);
  }

  let pulledAny = false;

  while (true) {
    const { rows, error } = await pullPage({ sinceRev: cursor, limit: PULL_PAGE });
    if (error) {
      const described = describeTransportError(error);
      setStatus({ state: 'error', error: described });
      return false;
    }
    if (!rows.length) break;

    const foreign = rows.filter((row) => row.device_id !== deviceId);
    if (foreign.length) {
      applyingRemote = true;
      let pendingBlobs = [];
      try {
        const applyResult = await applyRemoteRecords(foreign, { mode: 'merge' });
        pendingBlobs = applyResult?.pendingBlobs || [];
        for (const row of foreign) {
          const domain = row.domain;
          const recordId = row.record_id;
          if (row.deleted) {
            await deleteShadow(domain, recordId);
          } else {
            await putShadow(domain, recordId, {
              contentHash: row.content_hash || '',
              updatedAt: row.updated_at,
              rev: row.rev,
            });
          }
        }
        pulledAny = true;
      } finally {
        applyingRemote = false;
      }
      if (pendingBlobs.length && isFileSyncEnabled()) {
        await runFileSyncPass({ downloadIds: pendingBlobs });
      }
    }

    cursor = rows[rows.length - 1].rev;
    await setRev(cursor);
    if (rows.length < PULL_PAGE) break;
  }

  await setSyncMeta({ lastPullAt: Date.now() });
  setStatus({ lastPullAt: Date.now() });
  await touchDevice(deviceId, { last_pulled_rev: cursor });

  if (!pulledAny && status.state === 'pulling') {
  /* idle set by caller */
  }
  return true;
}

async function reconcileInternal() {
  if (reconcileMutex) {
    reconcileQueued = true;
    return;
  }
  if (applyingRemote) return;
  if (status.firstSyncNeeded) return;
  if (massDeletePaused) return;
  if (!status.signedIn) return;

  reconcileMutex = true;
  reconcileQueued = false;

  try {
    if (!canUseNetwork()) {
      await refreshPendingCounts();
      setStatus({ state: 'offline', error: null });
      return;
    }

    setStatus({ state: 'reconciling', error: null });

    const shadow = await getAllShadow();
    const { records } = await collectLocalRecords();
    const diff = await diffAgainstShadow(records, shadow);

    if (diff.massDelete) {
      massDeletePaused = true;
      pendingMassDeleteTombstones = diff.tombstones;
      setStatus({
        state: 'paused',
        massDelete: diff.massDelete,
        pendingDeletes: diff.tombstones.length,
      });
      return;
    }

    if (diff.tombstones.length) {
      await putTombstones(diff.tombstones);
    }

    await refreshPendingCounts();

    if (diff.upserts.length || diff.tombstones.length) {
      const pushOk = await doPush(diff.upserts, diff.tombstones);
      if (!pushOk && status.state === 'error') return;
    }

    const pullOk = await doPull();
    if (!pullOk && status.state === 'error') return;

    await runFileSyncPass();

    await refreshPendingCounts();
    setStatus({ state: 'idle', massDelete: null, error: null });
  } catch (error) {
    setStatus({ state: 'error', error: describeTransportError(error) });
  } finally {
    reconcileMutex = false;
    if (reconcileQueued) {
      reconcileQueued = false;
      scheduleReconcile('queued');
    }
  }
}

export function scheduleReconcile(reason) {
  if (applyingRemote) return;
  if (!status.signedIn) return;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileInternal().catch(() => { /* ignore */ });
  }, RECONCILE_DEBOUNCE_MS);
}

export async function syncNow() {
  if (!status.signedIn) return;
  if (status.firstSyncNeeded) return;
  await reconcileInternal();
}

export async function syncFilesNow() {
  if (!status.signedIn) return;
  if (status.firstSyncNeeded) return;
  await runFileSyncPass();
}

export async function pullNow() {
  if (!status.signedIn) return;
  if (!canUseNetwork()) {
    setStatus({ state: 'offline' });
    return;
  }
  setStatus({ state: 'pulling', error: null });
  await doPull();
  await refreshPendingCounts();
  if (status.state === 'pulling') setStatus({ state: 'idle' });
}

export async function pushNow() {
  if (!status.signedIn) return;
  if (!canUseNetwork()) {
    setStatus({ state: 'offline' });
    return;
  }
  const { records } = await collectLocalRecords();
  setStatus({ state: 'pushing', error: null });
  await doPush(records, []);
  await refreshPendingCounts();
  if (status.state === 'pushing') setStatus({ state: 'idle' });
}

// A new install is never empty: Musi writes default settings and seeds three
// exercise categories on the first run. Only these domains prove that the user
// built a library on this device, so only these domains can force a question.
const CONTENT_DOMAINS = new Set([
  'notes',
  'songs',
  'exercises',
  'workbooks',
  'workbookFolders',
  'routines',
  'gpAnnotations',
  'drumPatterns',
  'attachmentsMeta',
]);

function countContentRecords(records) {
  return (records || []).filter((rec) => CONTENT_DOMAINS.has(rec.domain)).length;
}

function splitRowsByScope(rows) {
  const content = [];
  const rest = [];
  (rows || []).forEach((row) => {
    if (CONTENT_DOMAINS.has(row.domain) || row.domain === 'exerciseCategories') content.push(row);
    else rest.push(row);
  });
  return { content, rest };
}

async function runFirstSyncAuto() {
  const meta = await getSyncMeta();
  if (meta.firstSyncDone) return;

  const { records } = await collectLocalRecords();
  const localCount = countContentRecords(records);
  const { count: cloudCount } = await countRemoteRows();

  const ctx = {
    hasLocalData: localCount > 0,
    hasCloudData: cloudCount > 0,
    localCount,
    cloudCount,
  };

  if (!ctx.hasLocalData && !ctx.hasCloudData) {
    await setSyncMeta({ firstSyncDone: true });
    setStatus({ firstSyncNeeded: false, firstSyncContext: null, state: 'idle' });
    return;
  }

  if (!ctx.hasCloudData && ctx.hasLocalData) {
    await doPush(records, []);
    await doPull();
    await rebuildShadowFromLocal();
    const rev = await getRev();
    await setSyncMeta({ firstSyncDone: true });
    setStatus({ firstSyncNeeded: false, firstSyncContext: null, state: 'idle' });
    return;
  }

  if (ctx.hasCloudData && !ctx.hasLocalData) {
    // The cloud is the source for this device. Musi replaces the seeded content
    // so the device does not keep a second set of default categories, and it
    // merges the settings and the progress so nothing on this device is lost.
    const rows = await pullAllRemoteRows();
    const { content, rest } = splitRowsByScope(rows);
    await runApplyRemote(content, 'replace', ['content']);
    await runApplyRemote(rest, 'merge', ['settings', 'progress']);
    const maxRev = rows.length ? rows[rows.length - 1].rev : 0;
    if (maxRev) await setRev(maxRev);
    await rebuildShadowFromLocal();
    await setSyncMeta({ firstSyncDone: true });
    setStatus({ firstSyncNeeded: false, firstSyncContext: null, state: 'idle' });
    return;
  }

  setStatus({
    firstSyncNeeded: true,
    firstSyncContext: ctx,
    state: 'paused',
  });
}

export async function resolveFirstSync(choice) {
  if (!status.signedIn) return;
  const normalized = String(choice || '').toLowerCase();

  try {
    if (normalized === 'merge') {
      const rows = await pullAllRemoteRows();
      await runApplyRemote(rows, 'merge');
      await reconcileInternal();
    } else if (normalized === 'cloud') {
      try {
        await exportSafetyZip();
      } catch (error) {
        setStatus({
          state: 'error',
          error: { code: 'backup_failed', message: 'Could not create a safety backup. Sync stopped.' },
        });
        return;
      }
      const rows = await pullAllRemoteRows();
      await runApplyRemote(rows, 'replace');
      const maxRev = rows.length ? rows[rows.length - 1].rev : 0;
      await rebuildShadowFromLocal();
      if (maxRev) await setRev(maxRev);
    } else if (normalized === 'device') {
      try {
        await exportSafetyZip();
      } catch (error) {
        setStatus({
          state: 'error',
          error: { code: 'backup_failed', message: 'Could not create a safety backup. Sync stopped.' },
        });
        return;
      }
      const remoteRows = await pullAllRemoteRows();
      const { records } = await collectLocalRecords();
      const localKeys = new Set(records.map((r) => shadowKey(r.domain, r.recordId)));
      const remoteOnly = remoteRows
        .filter((row) => !row.deleted)
        .filter((row) => !localKeys.has(shadowKey(row.domain, row.record_id)))
        .map((row) => ({ domain: row.domain, recordId: row.record_id }));

      await doPush(records, remoteOnly);
      await rebuildShadowFromLocal();
    } else {
      return;
    }

    await setSyncMeta({ firstSyncDone: true });
    setStatus({ firstSyncNeeded: false, firstSyncContext: null, state: 'idle', error: null });
    await subscribeRealtime();
    await reconcileInternal();
  } catch (error) {
    setStatus({ state: 'error', error: describeTransportError(error) });
  }
}

export async function resolveMassDelete(choice) {
  const normalized = String(choice || '').toLowerCase();
  if (!massDeletePaused) return;

  if (normalized === 'cancel') {
    await clearTombstones();
    await rebuildShadowFromLocal();
    massDeletePaused = false;
    pendingMassDeleteTombstones = [];
    setStatus({ state: 'idle', massDelete: null });
    await refreshPendingCounts();
    return;
  }

  if (normalized === 'push') {
    massDeletePaused = false;
    const tombstones = pendingMassDeleteTombstones;
    pendingMassDeleteTombstones = [];
    setStatus({ state: 'reconciling', massDelete: null });
    await putTombstones(tombstones);
    const shadow = await getAllShadow();
    const { records } = await collectLocalRecords();
    const diff = await diffAgainstShadow(records, shadow);
    await doPush(diff.upserts, tombstones);
    await doPull();
    await refreshPendingCounts();
    setStatus({ state: 'idle' });
  }
}

async function subscribeRealtime() {
  const userId = status.userId;
  const deviceId = status.deviceId || await getDeviceId();
  const token = await getAccessToken();
  if (token) await refreshRealtimeAuth(token);
  await subscribeSyncChannel({
    userId,
    deviceId,
    onRemoteChange: () => {
      if (!status.firstSyncNeeded && !massDeletePaused) {
        scheduleReconcile('realtime');
      }
    },
  });
  setStatus({ realtime: realtimeState() });
}

function attachWindowListeners() {
  const win = getWindow();
  if (!win) return () => {};

  const onOnline = () => {
    setStatus({ online: true, state: status.signedIn ? 'idle' : status.state, error: null });
    if (status.signedIn && !status.firstSyncNeeded) {
      scheduleReconcile('online');
    }
  };

  const onOffline = () => {
    setStatus({ online: false, state: 'offline' });
  };

  const onVisibility = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const lastPull = status.lastPullAt || 0;
    if (Date.now() - lastPull > VISIBILITY_PULL_MS && status.signedIn && !status.firstSyncNeeded) {
      pullNow().catch(() => { /* ignore */ });
    }
  };

  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  if (intervalPullTimer) clearInterval(intervalPullTimer);
  intervalPullTimer = setInterval(() => {
    if (status.signedIn && !status.firstSyncNeeded && canUseNetwork()) {
      pullNow().catch(() => { /* ignore */ });
    }
  }, INTERVAL_PULL_MS);

  return () => {
    win.removeEventListener('online', onOnline);
    win.removeEventListener('offline', onOffline);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (intervalPullTimer) {
      clearInterval(intervalPullTimer);
      intervalPullTimer = null;
    }
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
  });

  if (!unsubDataChanged) {
    unsubDataChanged = onDataChanged(() => {
      if (!applyingRemote) scheduleReconcile('data-changed');
    });
  }
  if (!removeWindowListeners) {
    removeWindowListeners = attachWindowListeners();
  }
  if (!unsubAuth) {
    unsubAuth = onAuthChange(async (event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        await handleSignedOut({ eraseLocal: false });
        return;
      }
      if (event === 'TOKEN_REFRESHED' && nextSession?.access_token) {
        await refreshRealtimeAuth(nextSession.access_token);
        setStatus({ realtime: realtimeState() });
      }
    });
  }

  await runFirstSyncAuto();

  if (!status.firstSyncNeeded) {
    await subscribeRealtime();
    await reconcileInternal();
  }

  await refreshPendingCounts();
}

export async function handleSignedOut({ eraseLocal = false } = {}) {
  await unsubscribeSyncChannel();

  if (removeWindowListeners) {
    removeWindowListeners();
    removeWindowListeners = null;
  }
  if (unsubDataChanged) {
    unsubDataChanged();
    unsubDataChanged = null;
  }
  if (unsubAuth) {
    unsubAuth();
    unsubAuth = null;
  }
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }

  if (eraseLocal) {
    const { applySnapshot } = await import('../sync/syncProfile.js');
    const empty = {
      app: 'musi',
      kind: 'musi-profile-snapshot',
      version: 1,
      createdAt: new Date().toISOString(),
      scopes: SYNC_SCOPES.map((s) => s.id),
      data: {},
    };
    await applySnapshot(empty, { mode: 'replace' });
    await deleteShadowDatabase();
  }

  massDeletePaused = false;
  pendingMassDeleteTombstones = [];

  setStatus({
    state: 'signed-out',
    signedIn: false,
    email: null,
    userId: null,
    deviceId: null,
    lastPushAt: null,
    lastPullAt: null,
    pendingUploads: 0,
    pendingDeletes: 0,
    firstSyncNeeded: false,
    firstSyncContext: null,
    massDelete: null,
    realtime: 'off',
    error: null,
    online: browserOnline(),
    files: {
      uploads: 0,
      downloads: 0,
      busy: false,
      lastError: null,
    },
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
