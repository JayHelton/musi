/**
 * Boot splash — covers dynamic nav while the shell initializes.
 * One clear sequence: loading progress → READY → dismiss (tap or short auto).
 * Skipped for the rest of the session after the first successful boot.
 */

const SESSION_KEY = 'musi.bootSplash.done';
const MIN_VISIBLE_MS = 700;
const AUTO_DISMISS_MS = 1600;
const LEAVE_MS = 380;

let startedAt = 0;
let ready = false;
let dismissed = false;
let autoTimer = 0;
let progressTimer = 0;

function el() {
  return document.getElementById('boot-splash');
}

function setTag(text) {
  const tag = document.getElementById('boot-splash-tag');
  if (tag) tag.textContent = text;
}

function setProgress(pct) {
  const fill = document.getElementById('boot-splash-bar-fill');
  if (!fill || ready || dismissed) return;
  const clamped = Math.max(8, Math.min(96, pct));
  fill.style.width = `${clamped}%`;
}

function alreadyBootedThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function markSessionBooted() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch (e) { /* private mode */ }
}

function stripSplash(root) {
  if (root) root.remove();
  document.body.classList.remove('boot-locked');
}

function bindDismiss(root) {
  const startBtn = document.getElementById('boot-splash-start');
  const go = () => {
    // Only dismiss once the shell is ready — avoids flash/half-boot exits.
    if (!ready || dismissed) return;
    dismiss();
  };

  root.addEventListener('click', go);
  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      go();
    });
  }

  const onKey = (e) => {
    if (dismissed || !ready) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      go();
    }
  };
  window.addEventListener('keydown', onKey, { once: false });
  root._bootKeyHandler = onKey;
}

export function initBootSplash() {
  const root = el();
  if (!root || dismissed) return;

  // Soft navigations / SW reclaim: don't replay the splash every time.
  if (alreadyBootedThisSession()) {
    dismissed = true;
    ready = true;
    stripSplash(root);
    return;
  }

  startedAt = performance.now();
  ready = false;
  document.body.classList.add('boot-locked');
  root.classList.remove('is-ready', 'is-leaving');
  root.setAttribute('aria-busy', 'true');
  root.setAttribute('aria-hidden', 'false');
  setTag('Loading');
  setProgress(12);

  const startBtn = document.getElementById('boot-splash-start');
  if (startBtn) startBtn.hidden = true;

  // Fake progress while modules finish wiring navigation.
  let pct = 12;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (ready || dismissed) return;
    pct = Math.min(88, pct + (pct < 40 ? 8 : pct < 70 ? 5 : 2));
    setProgress(pct);
  }, 160);

  bindDismiss(root);
}

export function markBootReady() {
  const root = el();
  if (!root || dismissed || ready) return;

  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = 0;
  }

  const fill = document.getElementById('boot-splash-bar-fill');
  if (fill) fill.style.width = '100%';

  ready = true;
  root.classList.add('is-ready');
  setTag('Ready');

  const startBtn = document.getElementById('boot-splash-start');
  if (startBtn) {
    startBtn.hidden = false;
    requestAnimationFrame(() => startBtn.focus({ preventScroll: true }));
  }

  const elapsed = performance.now() - startedAt;
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => dismiss(), wait + AUTO_DISMISS_MS);
}

export function dismiss() {
  const root = el();
  if (!root || dismissed) return;
  dismissed = true;
  markSessionBooted();

  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = 0;
  }
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = 0;
  }
  if (root._bootKeyHandler) {
    window.removeEventListener('keydown', root._bootKeyHandler);
    root._bootKeyHandler = null;
  }

  root.classList.add('is-leaving');
  root.setAttribute('aria-busy', 'false');
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('boot-locked');

  window.setTimeout(() => {
    root.remove();
  }, LEAVE_MS);
}
