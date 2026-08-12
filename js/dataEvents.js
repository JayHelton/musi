export const DATA_CHANGED_EVENT = 'musi:data-changed';

function getWindow() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.window) {
      return globalThis.window;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

export function emitDataChanged(domainHint) {
  const win = getWindow();
  if (!win || typeof win.dispatchEvent !== 'function') return;
  try {
    win.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, {
      detail: { domain: domainHint || '', at: Date.now() },
    }));
  } catch (e) {
    /* ignore */
  }
}

export function onDataChanged(fn) {
  const win = getWindow();
  if (!win || typeof win.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    try {
      fn(event?.detail || {});
    } catch (e) {
      /* ignore listener errors */
    }
  };
  try {
    win.addEventListener(DATA_CHANGED_EVENT, handler);
  } catch (e) {
    return () => {};
  }
  return () => {
    try {
      win.removeEventListener(DATA_CHANGED_EVENT, handler);
    } catch (e) {
      /* ignore */
    }
  };
}
