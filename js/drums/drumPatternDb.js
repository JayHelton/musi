// IndexedDB-backed store for user-created drum patterns (sequencer beats and
// kept fills). Mirrors the defensive style of attachments.js: every call
// degrades to a safe no-op when IndexedDB is unavailable (privacy mode, old
// browsers), so the rest of the drum feature keeps working without persistence.

const DB_NAME = 'musi-drums';
const DB_VERSION = 1;
const STORE = 'patterns';

let dbPromise = null;

function canUseIDB() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB; }
  catch (e) { return false; }
}

function openDB() {
  if (dbPromise) return dbPromise;
  if (!canUseIDB()) { dbPromise = Promise.resolve(null); return dbPromise; }
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { resolve(null); return; }
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

function uid() {
  return `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function drumsDbSupported() { return canUseIDB(); }

// Save (insert or replace) a user pattern. Returns the stored record or null.
export async function savePattern(pattern) {
  const db = await openDB();
  if (!db || !pattern) return null;
  const rec = {
    ...pattern,
    id: pattern.id && !pattern.builtin ? pattern.id : uid(),
    builtin: false,
    updatedAt: new Date().toISOString(),
    createdAt: pattern.createdAt || new Date().toISOString(),
  };
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readwrite').put(rec);
      req.onsuccess = () => resolve(rec);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export async function listPatterns() {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readonly').getAll();
      req.onsuccess = () => {
        const all = (req.result || []);
        all.sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
        resolve(all);
      };
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

export async function getPattern(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export async function deletePattern(id) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = store(db, 'readwrite').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}
