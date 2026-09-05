// The IndexedDB adapter of the PracticeStore port.
//
// This file is the only one that opens the database `musi-practice-lab`. It is
// defensive, in the manner of `js/attachments.js`: when IndexedDB is blocked,
// every call resolves to a safe empty result and `isAvailable()` returns false,
// so the user interface can show a notice.
//
// The blobs live in their own store, so an entry read never loads video. An
// older version of this database also holds a `sessions` store and a
// `catalog` store. The tool no longer reads them, and it leaves them alone.

const DB_NAME = 'musi-practice-lab';
const DB_VERSION = 1;

const STORE_ENTRIES = 'entries';
const STORE_CLIPS = 'clips';

function canUseIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch (e) {
    return false;
  }
}

// A browser MAY evict IndexedDB under storage pressure. A take is worth
// keeping, so ask once for persistent storage on the first write. Best-effort
// and idempotent.
let persistenceRequested = false;
async function ensurePersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return;
    }
    if (typeof navigator.storage.persist === 'function') await navigator.storage.persist();
  } catch (e) {
    /* the storage manager is missing; IndexedDB still works */
  }
}

function upgrade(db) {
  if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
    const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
    store.createIndex('at', 'at');
  }
  if (!db.objectStoreNames.contains(STORE_CLIPS)) {
    db.createObjectStore(STORE_CLIPS, { keyPath: 'id' });
  }
}

/**
 * Build the IndexedDB store adapter.
 * @returns {Object} a PracticeStore
 */
export function createIdbStore() {
  let dbPromise = null;
  let available = canUseIDB();

  function openDB() {
    if (dbPromise) return dbPromise;
    if (!canUseIDB()) {
      available = false;
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        available = false;
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { available = false; resolve(null); };
      req.onblocked = () => { available = false; resolve(null); };
    });
    return dbPromise;
  }

  function run(storeNames, mode, work) {
    return openDB().then((db) => {
      if (!db) return null;
      return new Promise((resolve) => {
        let tx;
        try {
          tx = db.transaction(storeNames, mode);
        } catch (e) {
          resolve(null);
          return;
        }
        let result = null;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
        try {
          work(tx, (value) => { result = value; });
        } catch (e) {
          try { tx.abort(); } catch (abortError) { /* already gone */ }
          resolve(null);
        }
      });
    });
  }

  function get(storeName, key) {
    return run(storeName, 'readonly', (tx, done) => {
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => done(req.result || null);
    });
  }

  function put(storeName, record) {
    return run(storeName, 'readwrite', (tx, done) => {
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => done(record);
    });
  }

  function all(storeName) {
    return run(storeName, 'readonly', (tx, done) => {
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => done(req.result || []);
    });
  }

  return {
    isAvailable() { return available; },

    async appendEntry(entry) {
      return put(STORE_ENTRIES, entry);
    },
    async listEntries({ kind = '', limit = 0 } = {}) {
      const found = await all(STORE_ENTRIES);
      const list = (Array.isArray(found) ? found : [])
        .filter(entry => !kind || entry.kind === kind)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)));
      return limit > 0 ? list.slice(-Math.round(limit)) : list;
    },

    async saveClip(clip) {
      ensurePersistentStorage();
      return put(STORE_CLIPS, clip);
    },
    async getClip(id) {
      return get(STORE_CLIPS, id);
    },
    async listClips() {
      const found = await all(STORE_CLIPS);
      return (Array.isArray(found) ? found : [])
        .map(({ blob, ...rest }) => rest)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },
    async deleteClip(id) {
      const done = await run(STORE_CLIPS, 'readwrite', (tx, resolve) => {
        tx.objectStore(STORE_CLIPS).delete(id);
        resolve(true);
      });
      return done === true;
    },
  };
}
