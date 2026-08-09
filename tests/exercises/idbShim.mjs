// Minimal IndexedDB shim for Node tests (backs js/attachments.js saveFile).

export function installIdbShim() {
  if (typeof globalThis.indexedDB !== 'undefined') return;

  const stores = new Map();
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
        createObjectStore(storeName) {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          return {};
        },
        transaction(storeName, mode) {
          if (!stores.has(storeName)) stores.set(storeName, new Map());
          const data = stores.get(storeName);
          return {
            objectStore() {
              return {
                put(rec) {
                  const putReq = { onsuccess: null, onerror: null };
                  data.set(rec.id, { ...rec });
                  queueMicrotask(() => putReq.onsuccess?.({ target: putReq }));
                  return putReq;
                },
                get(id) {
                  const getReq = { result: data.get(id) || undefined, onsuccess: null, onerror: null };
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
                  data.delete(id);
                  queueMicrotask(() => delReq.onsuccess?.({ target: delReq }));
                  return delReq;
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
