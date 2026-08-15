// App toast host for short error and info messages. Safe in Node when document is missing.

const MAX_VISIBLE = 3;
const DEFAULT_ERROR_MSG = 'Something went wrong.';

/** @type {Map<string, { el: HTMLElement, timer: ReturnType<typeof setTimeout> }>} */
const activeByMessage = new Map();

function canUseDom() {
  return typeof document !== 'undefined' && document.body;
}

function kindClass(kind) {
  return kind === 'info' ? 'app-toast--info' : 'app-toast--error';
}

function ensureHost() {
  if (!canUseDom()) return null;
  let host = document.getElementById('app-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'app-toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function removeToast(message) {
  const entry = activeByMessage.get(message);
  if (!entry) return;
  clearTimeout(entry.timer);
  if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  activeByMessage.delete(message);
}

function scheduleRemoval(message, timeoutMs) {
  const entry = activeByMessage.get(message);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => removeToast(message), timeoutMs);
}

export function showAppToast(message, { kind = 'error', timeoutMs = 6000 } = {}) {
  try {
    if (!canUseDom()) return;
    const host = ensureHost();
    if (!host) return;

    const text = (typeof message === 'string' && message.trim())
      ? message.trim()
      : DEFAULT_ERROR_MSG;

    if (activeByMessage.has(text)) {
      const entry = activeByMessage.get(text);
      entry.el.className = `app-toast ${kindClass(kind)}`;
      scheduleRemoval(text, timeoutMs);
      return;
    }

    while (activeByMessage.size >= MAX_VISIBLE) {
      const oldest = activeByMessage.keys().next().value;
      removeToast(oldest);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `app-toast ${kindClass(kind)}`;
    toastEl.textContent = text;
    host.appendChild(toastEl);

    const timer = setTimeout(() => removeToast(text), timeoutMs);
    activeByMessage.set(text, { el: toastEl, timer });
  } catch (_) {
    /* never throw */
  }
}

export function clearAppToasts() {
  try {
    for (const message of [...activeByMessage.keys()]) {
      removeToast(message);
    }
    const host = document.getElementById('app-toast-host');
    if (host) host.innerHTML = '';
  } catch (_) {
    /* never throw */
  }
}
