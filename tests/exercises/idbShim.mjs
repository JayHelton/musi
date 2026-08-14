// Minimal IndexedDB shim for Node tests (backs js/attachments.js and js/drums/drumPatternDb.js).

export const ATTACHMENTS_DB = 'musi-attachments';
export const ATTACHMENTS_STORE = 'files';
export const DRUMS_DB = 'musi-drums';
export const DRUMS_STORE = 'patterns';

function storageKeyForRecord(rec, keyPath) {
  if (!keyPath || keyPath === 'id') return rec.id;
  if (typeof keyPath === 'string') return rec[keyPath];
  if (Array.isArray(keyPath)) {
    return keyPath.map((k) => rec[k]).join('\u0000');
  }
  return rec.id;
}

function storageKeyForLookup(key, keyPath) {
  if (Array.isArray(key)) return key.join('\u0000');
  return key;
}

const stores = new Map();
const storeKeyPaths = new Map();

function ensureStore(storeName, keyPath = 'id') {
  if (!stores.has(storeName)) stores.set(storeName, new Map());
  if (!storeKeyPaths.has(storeName)) storeKeyPaths.set(storeName, keyPath);
  return stores.get(storeName);
}

// Empties every object store but keeps the open handles valid. Modules cache
// their database promise, so a test that only replaces `globalThis.indexedDB`
// keeps the old data. Tests that simulate a second device call this instead.
export function resetIdbShimData() {
  stores.forEach((data) => data.clear());
}

export function installIdbShim() {
  if (typeof globalThis.indexedDB !== 'undefined') return;

  globalThis.indexedDB = {
    open(name, version) {
      const req = {
        result: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      const db = {
        name,
        objectStoreNames: { contains: (n) => stores.has(n) },
        createObjectStore(storeName, options = {}) {
          const keyPath = options.keyPath || 'id';
          ensureStore(storeName, keyPath);
          return {};
        },
        transaction(storeName, mode) {
          const data = ensureStore(storeName);
          const keyPath = storeKeyPaths.get(storeName) || 'id';
          return {
            objectStore() {
              return {
                put(rec) {
                  const putReq = { onsuccess: null, onerror: null };
                  const sk = storageKeyForRecord(rec, keyPath);
                  data.set(sk, { ...rec });
                  queueMicrotask(() => putReq.onsuccess?.({ target: putReq }));
                  return putReq;
                },
                get(id) {
                  const sk = storageKeyForLookup(id, keyPath);
                  const getReq = { result: data.get(sk) || undefined, onsuccess: null, onerror: null };
                  queueMicrotask(() => getReq.onsuccess?.({ target: getReq }));
                  return getReq;
                },
                getAll() {
                  const getReq = { result: [...data.values()], onsuccess: null, onerror: null };
                  queueMicrotask(() => getReq.onsuccess?.({ target: getReq }));
                  return getReq;
                },
                delete(id) {
                  const delReq = { onsuccess: null, onerror: null };
                  const sk = storageKeyForLookup(id, keyPath);
                  data.delete(sk);
                  queueMicrotask(() => delReq.onsuccess?.({ target: delReq }));
                  return delReq;
                },
                clear() {
                  const clearReq = { onsuccess: null, onerror: null };
                  data.clear();
                  queueMicrotask(() => clearReq.onsuccess?.({ target: clearReq }));
                  return clearReq;
                },
              };
            },
          };
        },
      };
      queueMicrotask(() => {
        if (name === ATTACHMENTS_DB) {
          ensureStore(ATTACHMENTS_STORE, 'id');
        } else if (name === DRUMS_DB) {
          ensureStore(DRUMS_STORE, 'id');
        }
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
}
