// IndexedDB-backed audio library for Musi. Holds saved audio Blobs — both files
// the user uploads to a session (warmups, vocal notes) and takes saved from the
// in-app Recorder. Sessions reference library items by id; the Blob lives here
// so it persists across reloads / offline and is only ever removed when the
// user deletes it explicitly from the library.
//
// All access is defensive: IndexedDB may be unavailable (privacy mode, old
// browser) in which case calls resolve to a safe no-op / null and the rest of
// the app keeps working without saved-audio features.

const DB_NAME = 'musi-attachments';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;

function canUseIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch (e) {
    return false;
  }
}

function uid() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-${Date.now().toString(36)}-${rand}`;
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Drops the heavy Blob so list/metadata callers stay light.
function metaOf(rec) {
  if (!rec) return null;
  return {
    id: rec.id,
    name: rec.name,
    fileName: rec.fileName || '',
    type: rec.type || '',
    size: Number.isFinite(rec.size) ? rec.size : 0,
    createdAt: rec.createdAt || new Date(0).toISOString(),
    source: rec.source || 'upload',
  };
}

// Saves a new audio Blob to the library. Returns its metadata (no Blob) or null
// when storage is unavailable / the write failed.
export async function saveAudio({ blob, name, type, fileName, size, source } = {}) {
  const db = await openDB();
  if (!db || !blob) return null;
  const rec = {
    id: uid(),
    blob,
    name: (name && String(name).trim()) || 'Audio',
    fileName: fileName || '',
    type: type || blob.type || '',
    size: Number.isFinite(size) ? size : (blob.size || 0),
    createdAt: new Date().toISOString(),
    source: source || 'upload',
  };
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readwrite').put(rec);
      req.onsuccess = () => resolve(metaOf(rec));
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// Returns metadata for every library item, newest first (sorted by createdAt).
export async function listAudioMeta() {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readonly').getAll();
      req.onsuccess = () => {
        const all = (req.result || []).map(metaOf).filter(Boolean);
        all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
        resolve(all);
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

export async function getAudioMeta(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readonly').get(id);
      req.onsuccess = () => resolve(metaOf(req.result));
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function getAudioBlob(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob || null : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function renameAudio(id, name) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const s = store(db, 'readwrite');
      const getReq = s.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (!rec) { resolve(false); return; }
        rec.name = (name && String(name).trim()) || rec.name;
        const putReq = s.put(rec);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      getReq.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function deleteAudio(id) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readwrite').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export function attachmentsSupported() {
  return canUseIDB();
}
