/**
 * Boot splash — covers the shell until first paint is ready.
 * Stable single composition: no tag thrash, no opacity flicker loops.
 * Skipped for the rest of the session after the first successful boot.
 */

const SESSION_KEY = 'musi.bootSplash.done';
const MIN_VISIBLE_MS = 550;
const READY_HOLD_MS = 700;
const LEAVE_MS = 320;

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
  if (tag && tag.textContent !== text) tag.textContent = text;
}

function setProgress(pct) {
  const fill = document.getElementById('boot-splash-bar-fill');
  if (!fill || dismissed) return;
  const clamped = Math.max(0.08, Math.min(1, pct / 100));
  fill.style.transform = `scaleX(${clamped})`;
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

function endBootingClass() {
  document.documentElement.classList.remove('booting');
  document.body.classList.remove('boot-locked');
}

function stripSplash(root) {
  if (root) root.remove();
  endBootingClass();
}

function bindDismiss(root) {
  const startBtn = document.getElementById('boot-splash-start');
  const go = () => {
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

  document.documentElement.classList.add('booting');

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
  // HTML already says Loading — only set if somehow different
  setTag('Loading');
  setProgress(14);

  const startBtn = document.getElementById('boot-splash-start');
  if (startBtn) {
    startBtn.setAttribute('aria-hidden', 'true');
    startBtn.tabIndex = -1;
  }

  // Smooth fake progress (scaleX) while modules wire up — few large steps.
  let pct = 14;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (ready || dismissed) return;
    pct = Math.min(82, pct + 9);
    setProgress(pct);
  }, 220);

  bindDismiss(root);
}

export function markBootReady() {
  const root = el();
  if (!root || dismissed || ready) return;

  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = 0;
  }

  setProgress(100);
  ready = true;
  root.classList.add('is-ready');
  setTag('Ready');

  const startBtn = document.getElementById('boot-splash-start');
  if (startBtn) {
    startBtn.setAttribute('aria-hidden', 'false');
    startBtn.tabIndex = 0;
  }

  const elapsed = performance.now() - startedAt;
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
  if (autoTimer) clearTimeout(autoTimer);
  // Short hold on Ready, then leave — no blinking PRESS START phase.
  autoTimer = window.setTimeout(() => dismiss(), wait + READY_HOLD_MS);
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
  // Reveal shell under the fade so the handoff is one continuous dark frame
  endBootingClass();

  window.setTimeout(() => {
    if (root.isConnected) root.remove();
  }, LEAVE_MS);
}
