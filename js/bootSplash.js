/**
 * Boot splash — covers dynamic nav while the shell initializes.
 * Shows a retro pixel mascot, then PRESS START once ready.
 */

const MIN_VISIBLE_MS = 1100;
const AUTO_DISMISS_MS = 4200;
const LEAVE_MS = 480;

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
  if (!fill || ready) return;
  const clamped = Math.max(8, Math.min(100, pct));
  fill.style.width = `${clamped}%`;
}

function bindDismiss(root) {
  const startBtn = document.getElementById('boot-splash-start');
  const go = () => dismiss();

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

  startedAt = performance.now();
  document.body.classList.add('boot-locked');
  setTag('POWER ON');
  setProgress(12);

  // Fake progress while modules finish wiring navigation.
  let pct = 12;
  progressTimer = window.setInterval(() => {
    pct = Math.min(88, pct + (pct < 40 ? 10 : pct < 70 ? 6 : 3));
    setProgress(pct);
  }, 140);

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
  setTag('READY');

  const startBtn = document.getElementById('boot-splash-start');
  if (startBtn) {
    startBtn.hidden = false;
    // Defer focus so it doesn't fight hash/nav focus during boot.
    requestAnimationFrame(() => startBtn.focus({ preventScroll: true }));
  }

  const elapsed = performance.now() - startedAt;
  const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
  autoTimer = window.setTimeout(() => dismiss(), wait + AUTO_DISMISS_MS);
}

export function dismiss() {
  const root = el();
  if (!root || dismissed) return;
  dismissed = true;

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
