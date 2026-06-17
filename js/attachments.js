// IndexedDB storage for session attachments (e.g. mp3s of warmups / vocal
// notes). Session records in localStorage only hold lightweight metadata; the
// actual file Blob lives here so it persists across reloads and offline use and
// is only ever removed when the user deletes the attachment or its session.
//
// All access is defensive: IndexedDB may be unavailable (privacy mode, old
// browser) in which case every call resolves to a safe no-op / null and the
// rest of the app keeps working without attachment playback.

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

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Stores (or replaces) a file Blob under the given attachment id.
// Returns true on success, false if storage was unavailable / failed.
export async function putAttachment(id, blob, meta = {}) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const store = tx(db, 'readwrite');
      const req = store.put({ id, blob, name: meta.name, type: meta.type });
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// Returns the stored Blob for an attachment id, or null when missing.
export async function getAttachmentBlob(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob || null : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function deleteAttachment(id) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readwrite').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function deleteAttachments(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  await Promise.all(ids.map((id) => deleteAttachment(id)));
}

export function attachmentsSupported() {
  return canUseIDB();
}
