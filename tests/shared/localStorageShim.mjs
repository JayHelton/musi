// Map-backed localStorage and sessionStorage stubs for Node tests.

function makeStorageApi(store) {
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      const keys = [...store.keys()];
      return keys[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

/**
 * Install a Map-backed localStorage on globalThis (and window when present).
 * @param {Record<string, string>} [seed] - initial key/value pairs
 * @returns {{ store: Map<string, string>, reset: (next?: Record<string, string>) => void, snapshot: () => Record<string, string> }}
 */
export function installLocalStorageShim(seed = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(seed)) {
    store.set(key, String(value));
  }

  const api = makeStorageApi(store);
  globalThis.localStorage = api;
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.localStorage = api;
  }

  function reset(next = {}) {
    store.clear();
    for (const [key, value] of Object.entries(next)) {
      store.set(key, String(value));
    }
  }

  function snapshot() {
    return Object.fromEntries(store.entries());
  }

  return { store, reset, snapshot };
}

/** Install a separate Map-backed sessionStorage stub. */
export function installSessionStorageShim(seed = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(seed)) {
    store.set(key, String(value));
  }

  const api = makeStorageApi(store);
  globalThis.sessionStorage = api;
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.sessionStorage = api;
  }

  function reset(next = {}) {
    store.clear();
    for (const [key, value] of Object.entries(next)) {
      store.set(key, String(value));
    }
  }

  function snapshot() {
    return Object.fromEntries(store.entries());
  }

  return { store, reset, snapshot };
}
