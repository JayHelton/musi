// The IndexedDB adapter of the PracticeStore port.
//
// This file is the only one that opens the database `musi-practice-lab`. It is
// defensive, in the manner of `js/attachments.js`: when IndexedDB is blocked,
// every call resolves to a safe empty result and `isAvailable()` returns false,
// so the user interface can show a notice.
//
// The blobs live in their own store, so a log read never loads video.

const DB_NAME = 'musi-practice-lab';
const DB_VERSION = 1;

const STORE_SESSIONS = 'sessions';
const STORE_ENTRIES = 'entries';
const STORE_CLIPS = 'clips';
const STORE_CATALOG = 'catalog';

const ALL_STORES = [STORE_SESSIONS, STORE_ENTRIES, STORE_CLIPS, STORE_CATALOG];

function canUseIDB() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch (e) {
    return false;
  }
}

// A browser MAY evict IndexedDB under storage pressure. A practice log and its
// clips are worth keeping, so ask once for persistent storage on the first
// write. Best-effort and idempotent.
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
  if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
    const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
    store.createIndex('startedAt', 'startedAt');
    store.createIndex('status', 'status');
  }
  if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
    const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
    store.createIndex('sessionId', 'sessionId');
    store.createIndex('sessionAt', ['sessionId', 'at']);
  }
  if (!db.objectStoreNames.contains(STORE_CLIPS)) {
    const store = db.createObjectStore(STORE_CLIPS, { keyPath: 'id' });
    store.createIndex('sessionId', 'sessionId');
  }
  if (!db.objectStoreNames.contains(STORE_CATALOG)) {
    db.createObjectStore(STORE_CATALOG, { keyPath: 'id' });
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

  function allByIndex(storeName, indexName, key) {
    return run(storeName, 'readonly', (tx, done) => {
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const req = source.getAll(key);
      req.onsuccess = () => done(req.result || []);
    });
  }

  return {
    isAvailable() { return available; },

    async getCatalog() {
      return get(STORE_CATALOG, 'catalog');
    },
    async saveCatalog(record) {
      ensurePersistentStorage();
      return put(STORE_CATALOG, record);
    },

    async createSession(session) {
      ensurePersistentStorage();
      return put(STORE_SESSIONS, session);
    },
    async endSession(id, patch) {
      return run(STORE_SESSIONS, 'readwrite', (tx, done) => {
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.get(id);
        req.onsuccess = () => {
          const found = req.result;
          if (!found) return;
          const next = { ...found, ...patch };
          store.put(next);
          done(next);
        };
      });
    },
    async getSession(id) {
      return get(STORE_SESSIONS, id);
    },
    async listSessions({ status = '' } = {}) {
      const all = await allByIndex(STORE_SESSIONS, null, undefined);
      const list = Array.isArray(all) ? all : [];
      return list
        .filter(s => !status || s.status === status)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    },
    async deleteSession(id) {
      const done = await run(ALL_STORES, 'readwrite', (tx, resolve) => {
        tx.objectStore(STORE_SESSIONS).delete(id);
        const entryIndex = tx.objectStore(STORE_ENTRIES).index('sessionId');
        const entryReq = entryIndex.getAllKeys(id);
        entryReq.onsuccess = () => {
          for (const key of entryReq.result || []) tx.objectStore(STORE_ENTRIES).delete(key);
        };
        const clipIndex = tx.objectStore(STORE_CLIPS).index('sessionId');
        const clipReq = clipIndex.getAllKeys(id);
        clipReq.onsuccess = () => {
          for (const key of clipReq.result || []) tx.objectStore(STORE_CLIPS).delete(key);
        };
        resolve(true);
      });
      return done === true;
    },

    async appendEntry(entry) {
      return put(STORE_ENTRIES, entry);
    },
    async listEntries(sessionId) {
      const all = await allByIndex(STORE_ENTRIES, 'sessionId', sessionId);
      const list = Array.isArray(all) ? all : [];
      return list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    },
    async updateEntry(id, patch) {
      return run(STORE_ENTRIES, 'readwrite', (tx, done) => {
        const store = tx.objectStore(STORE_ENTRIES);
        const req = store.get(id);
        req.onsuccess = () => {
          const found = req.result;
          if (!found) return;
          const next = { ...found, data: { ...found.data, ...patch } };
          store.put(next);
          done(next);
        };
      });
    },

    async saveClip(clip) {
      ensurePersistentStorage();
      return put(STORE_CLIPS, clip);
    },
    async getClip(id) {
      return get(STORE_CLIPS, id);
    },
    async listClips(sessionId) {
      const all = await allByIndex(STORE_CLIPS, 'sessionId', sessionId);
      const list = Array.isArray(all) ? all : [];
      return list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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
