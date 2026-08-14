import { getActiveOwner, subscribe, stopActive } from './audioOwner.js';

let root = null;
let labelEl = null;
let stateEl = null;
let elapsedEl = null;
let stopBtn = null;
let elapsedInterval = null;
let shownAt = 0;
let lastOwnerId = null;

/**
 * Map an owner record to dock display fields.
 * @param {object|null} owner
 * @returns {{ visible: boolean, label: string, state: string, showElapsed: boolean }}
 */
export function dockStateFromOwner(owner) {
  if (!owner) {
    return { visible: false, label: '', state: '', showElapsed: false };
  }

  const { kind, label, state, listening } = owner;
  let displayState = 'Playing';
  let showElapsed = false;

  if (kind === 'metronome' || kind === 'tone') {
    displayState = 'Playing';
    showElapsed = false;
  } else if (kind === 'score' || kind === 'media') {
    displayState = state === 'paused' ? 'Paused' : 'Playing';
    showElapsed = true;
  } else if (kind === 'recording') {
    if (listening === true) {
      displayState = 'Listening';
      showElapsed = false;
    } else {
      displayState = 'Recording';
      showElapsed = true;
    }
  }

  return {
    visible: true,
    label: label || '',
    state: displayState,
    showElapsed,
  };
}

/**
 * Format seconds as m:ss or h:mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
export function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

function clearElapsedInterval() {
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
}

function updateElapsedDisplay() {
  if (!elapsedEl || !shownAt) return;
  const seconds = (Date.now() - shownAt) / 1000;
  elapsedEl.textContent = formatElapsed(seconds);
}

function startElapsedInterval() {
  clearElapsedInterval();
  updateElapsedDisplay();
  elapsedInterval = setInterval(updateElapsedDisplay, 1000);
}

function ensureMarkup(host) {
  if (host.querySelector('.audio-dock-label')) return;

  host.id = 'audio-dock';
  host.className = 'audio-dock';
  host.hidden = true;

  const label = document.createElement('span');
  label.className = 'audio-dock-label';
  host.appendChild(label);

  const state = document.createElement('span');
  state.className = 'audio-dock-state';
  host.appendChild(state);

  const elapsed = document.createElement('span');
  elapsed.className = 'audio-dock-elapsed';
  elapsed.hidden = true;
  host.appendChild(elapsed);

  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'audio-dock-stop';
  stop.textContent = 'Stop';
  host.appendChild(stop);
}

function wireElements() {
  labelEl = root.querySelector('.audio-dock-label');
  stateEl = root.querySelector('.audio-dock-state');
  elapsedEl = root.querySelector('.audio-dock-elapsed');
  stopBtn = root.querySelector('.audio-dock-stop');
}

/**
 * Re-read the active owner and update the dock DOM.
 */
export function refreshAudioDock() {
  if (!root) return;

  const owner = getActiveOwner();
  const dockState = dockStateFromOwner(owner);

  if (!dockState.visible) {
    root.hidden = true;
    clearElapsedInterval();
    lastOwnerId = null;
    shownAt = 0;
    return;
  }

  root.hidden = false;

  if (owner.id !== lastOwnerId) {
    shownAt = Date.now();
    lastOwnerId = owner.id;
  }

  if (labelEl) labelEl.textContent = dockState.label;
  if (stateEl) stateEl.textContent = dockState.state;

  if (dockState.showElapsed) {
    if (elapsedEl) elapsedEl.hidden = false;
    startElapsedInterval();
  } else {
    if (elapsedEl) elapsedEl.hidden = true;
    clearElapsedInterval();
  }
}

/**
 * Mount the audio dock and subscribe to owner changes.
 * @param {HTMLElement} [rootEl]
 */
export function initAudioDock(rootEl) {
  if (rootEl) {
    root = rootEl;
  } else {
    const existing = document.getElementById('audio-dock');
    if (existing) {
      root = existing;
    } else {
      root = document.createElement('div');
      document.body.appendChild(root);
    }
  }

  ensureMarkup(root);
  wireElements();

  if (stopBtn) {
    stopBtn.onclick = () => stopActive('dock');
  }

  subscribe(() => refreshAudioDock());
  refreshAudioDock();
}
