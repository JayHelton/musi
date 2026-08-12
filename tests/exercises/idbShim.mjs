// Minimal IndexedDB shim for Node tests (backs js/attachments.js saveFile).

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
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          const keyPath = options.keyPath || 'id';
          storeKeyPaths.set(storeName, keyPath);
          return {};
        },
        transaction(storeName, mode) {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          const data = stores.get(storeName);
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
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
}
