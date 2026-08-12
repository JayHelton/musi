/**
 * Shared harness for cloud sync node tests.
 */

import { resetIdbShimData } from '../exercises/idbShim.mjs';

export function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
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
    _store: store,
  };
  return store;
}

export function installWindowShim() {
  const listeners = new Map();
  globalThis.window = globalThis;
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const set = listeners.get(type);
    if (set) set.delete(fn);
  };
  globalThis.dispatchEvent = (event) => {
    const set = listeners.get(event.type);
    if (!set) return true;
    set.forEach((fn) => fn(event));
    return true;
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  return listeners;
}

export function resetHarness(store, listeners) {
  store.clear();
  listeners.clear();
  resetIdbShimData();
  if (globalThis.navigator) {
    globalThis.navigator.onLine = true;
  }
}

export function installDocumentShim() {
  if (typeof globalThis.document !== 'undefined') return;
  globalThis.document = {
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement() {
      return {
        click() {},
        remove() {},
        href: '',
        download: '',
      };
    },
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
  };
  if (typeof globalThis.URL === 'undefined') {
    globalThis.URL = {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => {},
    };
  }
  if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = class Blob {
      constructor(parts = []) {
        this.size = parts.reduce((sum, part) => sum + (part?.length || part?.byteLength || 0), 0);
      }
    };
  }
}

export function installNavigatorShim() {
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
    return;
  }
  if (globalThis.navigator.onLine === undefined) {
    globalThis.navigator.onLine = true;
  }
}
