// Practice Lab — the mount point.
//
// `js/main.js` uses `initPracticeLab` and `stopPracticeLab` and nothing else.
// This file supplies the default adapters and paints the screen the current
// mode asks for. A micro app replaces `defaultPorts()` and mounts the same
// container.

import { createPracticeLab, CLIP_CAPS } from './container.js';
import { createIdbStore } from './adapters/idbStore.js';
import { createMemoryStore } from './adapters/memoryStore.js';
import { createMusiClick } from './adapters/musiClick.js';
import { createMusiAudioSession } from './adapters/musiAudioSession.js';
import { createMediaVideo } from './adapters/mediaVideo.js';
import { createRealClock, createIds } from './adapters/realClock.js';
import { createMusiToast } from './adapters/musiToast.js';
import { el, clear, notice } from './ui/dom.js';
import { createSetupView } from './ui/setupView.js';
import { createSessionView } from './ui/sessionView.js';
import { createHistoryView } from './ui/historyView.js';
import { createTheoryView } from './ui/theoryView.js';

const SECTION_ID = 'sec-practicelab';

/** The tabs the tool page offers. They match the `modes` list in js/tools.js. */
const MODES = new Set(['session', 'history', 'theory']);

/**
 * The default ports of the web app.
 * @returns {Object} a complete port bag
 */
export function defaultPorts() {
  const idb = createIdbStore();
  const store = idb.isAvailable() ? idb : createMemoryStore();
  return {
    store,
    click: createMusiClick(),
    audioSession: createMusiAudioSession(),
    video: createMediaVideo({ durationCapMs: CLIP_CAPS.durationMs, sizeCapBytes: CLIP_CAPS.bytes }),
    clock: createRealClock(),
    ids: createIds(),
    notify: createMusiToast(),
  };
}

let lab = null;
let mounted = null;
let currentMode = 'session';
let rootEl = null;

function hostElement() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return null;
  // The shared tool page moves the section children into its workspace, so
  // find the host by id instead of by position.
  return section.querySelector('#practicelab-body') || section;
}

function stopMounted() {
  if (mounted && typeof mounted.stop === 'function') mounted.stop();
  mounted = null;
}

function paintSetup() {
  const view = createSetupView(lab, {
    onStarted: () => paint(),
  });
  clear(rootEl);
  rootEl.appendChild(view.root);
  mounted = view;
}

function paintSession() {
  const view = createSessionView(lab, {
    onEnded: () => paint(),
  });
  clear(rootEl);
  rootEl.appendChild(view.root);
  mounted = view;
}

function paintHistory() {
  const view = createHistoryView(lab);
  clear(rootEl);
  rootEl.appendChild(view.root);
  mounted = view;
}

// The Theory tab is a reference screen. It keeps no session and needs no port,
// so it mounts on its own and never waits for the store.
function paintTheory() {
  const view = createTheoryView();
  clear(rootEl);
  rootEl.appendChild(view.root);
  mounted = view;
}

function paintLoading() {
  clear(rootEl);
  rootEl.appendChild(el('p', { class: 'pl-loading', text: 'Loading…' }));
}

function paintFailure(message) {
  clear(rootEl);
  rootEl.appendChild(notice(message, 'warn'));
}

function paint() {
  if (!rootEl || !lab) return;
  stopMounted();
  if (currentMode === 'theory') {
    paintTheory();
    return;
  }
  if (currentMode === 'history') {
    paintHistory();
    return;
  }
  if (lab.hasOpenSession()) paintSession();
  else paintSetup();
}

/**
 * Open the tool. `js/main.js` calls this on every route that lands on
 * `#practicelab`, including a mode change.
 * @param {{ mode?: string }} [options]
 */
export function initPracticeLab({ mode } = {}) {
  const host = hostElement();
  if (!host) return;
  rootEl = host;
  currentMode = MODES.has(mode) ? mode : 'session';

  // The Theory tab reads no saved session, so it opens at once even when the
  // store is still loading or blocked.
  if (currentMode === 'theory') {
    stopMounted();
    paintTheory();
    if (!lab) startLab({ paintAfter: false });
    return;
  }

  if (lab) {
    paint();
    return;
  }

  paintLoading();
  startLab({ paintAfter: true });
}

/**
 * Build the service and read its saved sessions.
 * @param {{paintAfter: boolean}} options paint the screen once the store answers
 */
function startLab({ paintAfter }) {
  const ports = defaultPorts();
  let created;
  try {
    created = createPracticeLab(ports);
  } catch (error) {
    if (paintAfter) paintFailure(error.message || 'Practice Lab could not start.');
    return;
  }
  lab = created;
  lab.init().then(() => {
    if (paintAfter) paint();
  }).catch(() => {
    if (paintAfter) paintFailure('Practice Lab could not read its saved sessions.');
  });
}

/** Leave the tool. The click, the timer, the camera, and the recorder stop. */
export function stopPracticeLab() {
  stopMounted();
  if (lab) lab.stopAll();
}

/** Drop the whole feature. The tests and a hot reload use this. */
export function resetPracticeLab() {
  stopPracticeLab();
  lab = null;
  rootEl = null;
}
