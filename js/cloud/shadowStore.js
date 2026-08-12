// IndexedDB shadow store for cloud sync (musi-sync v1). Defensive: every call
// degrades when IndexedDB is unavailable.

export const SHADOW_SCHEMA_VERSION = 1;

const DB_NAME = 'musi-sync';
const DB_VERSION = 1;
const META_STORE = 'meta';
const SHADOW_STORE = 'shadow';
const TOMBSTONE_STORE = 'tombstones';
const BLOB_QUEUE_STORE = 'blobQueue';

const SHADOW_KEY_SEP = '\u0000';

let dbPromise = null;

function canUseIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch (e) {
    return false;
  }
}

export function shadowStoreSupported() {
  return canUseIDB();
}

export function shadowKey(domain, recordId) {
  return `${domain}${SHADOW_KEY_SEP}${recordId}`;
}

function openDB() {
  if (dbPromise) return dbPromise;
  if (!canUseIDB()) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SHADOW_STORE)) {
        db.createObjectStore(SHADOW_STORE, { keyPath: ['domain', 'recordId'] });
      }
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: ['domain', 'recordId'] });
      }
      if (!db.objectStoreNames.contains(BLOB_QUEUE_STORE)) {
        db.createObjectStore(BLOB_QUEUE_STORE, { keyPath: 'attachmentId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function objectStore(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function readMetaRow(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, META_STORE, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function writeMetaRow(row) {
  const db = await openDB();
  if (!db || !row || !row.id) return null;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, META_STORE, 'readwrite').put(row);
      req.onsuccess = () => resolve(row);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function defaultPlatform() {
  try {
    if (typeof navigator !== 'undefined' && navigator.platform) {
      return String(navigator.platform);
    }
  } catch (e) {
    /* ignore */
  }
  return '';
}

// The check runs one time for each page load. It reads and writes the meta row
// directly, because the public meta functions wait for this check first.
let schemaCheck = null;

async function ensureSchemaVersion() {
  if (schemaCheck) return schemaCheck;
  schemaCheck = (async () => {
    const row = await readMetaRow('sync');
    const version = typeof row?.schemaVersion === 'number' ? row.schemaVersion : 0;
    if (version === SHADOW_SCHEMA_VERSION) return;
    // A different version means the shadow rows no longer describe the server
    // state. Musi clears them and pulls again. Local user data stays untouched.
    await clearSyncStateRows();
    await writeMetaRow({
      ...(row || {}),
      id: 'sync',
      rev: 0,
      schemaVersion: SHADOW_SCHEMA_VERSION,
    });
  })();
  return schemaCheck;
}

export async function getDeviceId() {
  await ensureSchemaVersion();
  const device = await getDeviceRecord();
  if (device?.deviceId) return device.deviceId;
  const deviceId = `dev-${Date.now().toString(36)}-${randomSuffix()}`;
  await setDeviceRecord({
    deviceId,
    label: '',
    platform: defaultPlatform(),
    createdAt: new Date().toISOString(),
  });
  return deviceId;
}

export async function getDeviceRecord() {
  await ensureSchemaVersion();
  const row = await readMetaRow('device');
  if (!row) return null;
  return {
    deviceId: row.deviceId || '',
    label: row.label || '',
    platform: row.platform || '',
    createdAt: row.createdAt || '',
  };
}

export async function setDeviceRecord(patch) {
  await ensureSchemaVersion();
  const existing = await readMetaRow('device') || { id: 'device' };
  const merged = {
    ...existing,
    id: 'device',
    ...patch,
  };
  await writeMetaRow(merged);
  return {
    deviceId: merged.deviceId || '',
    label: merged.label || '',
    platform: merged.platform || '',
    createdAt: merged.createdAt || '',
  };
}

export async function getSyncMeta() {
  await ensureSchemaVersion();
  const row = await readMetaRow('sync');
  return {
    rev: typeof row?.rev === 'number' ? row.rev : 0,
    lastPushAt: row?.lastPushAt ?? null,
    lastPullAt: row?.lastPullAt ?? null,
    schemaVersion: typeof row?.schemaVersion === 'number' ? row.schemaVersion : 0,
    userId: row?.userId ?? null,
    firstSyncDone: row?.firstSyncDone === true,
  };
}

export async function setSyncMeta(patch) {
  await ensureSchemaVersion();
  const existing = await readMetaRow('sync') || { id: 'sync', rev: 0 };
  const merged = {
    ...existing,
    id: 'sync',
    ...patch,
  };
  await writeMetaRow(merged);
  return {
    rev: typeof merged.rev === 'number' ? merged.rev : 0,
    lastPushAt: merged.lastPushAt ?? null,
    lastPullAt: merged.lastPullAt ?? null,
    schemaVersion: typeof merged.schemaVersion === 'number' ? merged.schemaVersion : 0,
    userId: merged.userId ?? null,
    firstSyncDone: merged.firstSyncDone === true,
  };
}

export async function getRev() {
  const meta = await getSyncMeta();
  return meta.rev;
}

export async function setRev(rev) {
  const n = Number(rev);
  return setSyncMeta({ rev: Number.isFinite(n) ? n : 0 });
}

export async function getAllShadow() {
  const db = await openDB();
  if (!db) return new Map();
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, SHADOW_STORE, 'readonly').getAll();
      req.onsuccess = () => {
        const map = new Map();
        (req.result || []).forEach((row) => {
          if (!row?.domain || !row?.recordId) return;
          map.set(shadowKey(row.domain, row.recordId), row);
        });
        resolve(map);
      };
      req.onerror = () => resolve(new Map());
    } catch (e) {
      resolve(new Map());
    }
  });
}

export async function countShadowByDomain() {
  const all = await getAllShadow();
  const counts = new Map();
  for (const row of all.values()) {
    const d = row.domain;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return counts;
}

export async function putShadow(domain, recordId, fields) {
  const db = await openDB();
  if (!db || !domain || !recordId) return null;
  const row = {
    domain,
    recordId,
    contentHash: fields?.contentHash || '',
    updatedAt: fields?.updatedAt || null,
    rev: fields?.rev ?? null,
  };
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, SHADOW_STORE, 'readwrite').put(row);
      req.onsuccess = () => resolve(row);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function putShadowMany(rows) {
  const db = await openDB();
  if (!db || !Array.isArray(rows)) return 0;
  let count = 0;
  for (const entry of rows) {
    if (!entry?.domain || !entry?.recordId) continue;
    const row = await putShadow(entry.domain, entry.recordId, {
      contentHash: entry.contentHash,
      updatedAt: entry.updatedAt,
      rev: entry.rev,
    });
    if (row) count += 1;
  }
  return count;
}

export async function getShadow(domain, recordId) {
  const db = await openDB();
  if (!db || !domain || !recordId) return null;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, SHADOW_STORE, 'readonly').get([domain, recordId]);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function deleteShadow(domain, recordId) {
  const db = await openDB();
  if (!db || !domain || !recordId) return false;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, SHADOW_STORE, 'readwrite').delete([domain, recordId]);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function clearShadow() {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, SHADOW_STORE, 'readwrite').clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function putTombstones(list) {
  const db = await openDB();
  if (!db || !Array.isArray(list)) return 0;
  let count = 0;
  for (const entry of list) {
    if (!entry?.domain || !entry?.recordId) continue;
    const row = {
      domain: entry.domain,
      recordId: entry.recordId,
      deletedAt: entry.deletedAt || new Date().toISOString(),
      pushed: false,
    };
    const ok = await new Promise((resolve) => {
      try {
        const req = objectStore(db, TOMBSTONE_STORE, 'readwrite').put(row);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
    if (ok) count += 1;
  }
  return count;
}

export async function getTombstones() {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, TOMBSTONE_STORE, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

export async function clearTombstone(domain, recordId) {
  const db = await openDB();
  if (!db || !domain || !recordId) return false;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, TOMBSTONE_STORE, 'readwrite').delete([domain, recordId]);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function clearTombstones() {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, TOMBSTONE_STORE, 'readwrite').clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function enqueueBlob(entry) {
  const db = await openDB();
  if (!db || !entry?.attachmentId) return null;
  const row = {
    attachmentId: entry.attachmentId,
    direction: entry.direction || 'upload',
    crc32: entry.crc32 || '',
    size: Number.isFinite(entry.size) ? entry.size : 0,
    enqueuedAt: entry.enqueuedAt || Date.now(),
  };
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, BLOB_QUEUE_STORE, 'readwrite').put(row);
      req.onsuccess = () => resolve(row);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function listBlobQueue() {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, BLOB_QUEUE_STORE, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

export async function dequeueBlob(attachmentId) {
  const db = await openDB();
  if (!db || !attachmentId) return false;
  return new Promise((resolve) => {
    try {
      const req = objectStore(db, BLOB_QUEUE_STORE, 'readwrite').delete(attachmentId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

async function clearSyncStateRows() {
  await clearShadow();
  await clearTombstones();
  const db = await openDB();
  if (db) {
    await new Promise((resolve) => {
      try {
        const req = objectStore(db, BLOB_QUEUE_STORE, 'readwrite').clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }
  return true;
}

export async function resetSyncState() {
  await ensureSchemaVersion();
  await clearSyncStateRows();
  await setSyncMeta({ rev: 0 });
  return true;
}

export async function deleteShadowDatabase() {
  if (!canUseIDB()) return false;
  dbPromise = null;
  schemaCheck = null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}
