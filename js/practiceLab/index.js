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
import { createPracticeView } from './ui/practiceView.js';
import { createCompositionView } from './ui/compositionView.js';
import { createDrumsView } from './ui/drumsView.js';
import { createVocalView } from './ui/vocalView.js';

const SECTION_ID = 'sec-practicelab';

/** The tabs the tool page offers. They match the `modes` list in js/tools.js. */
const MODES = new Set(['practice', 'vocal', 'drums', 'composition']);

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
let labError = '';
let mounted = null;
let currentMode = 'practice';
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

function mount(view) {
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

/**
 * Build the service once. The store read runs in the background, and the
 * screens that need it wait on `lab.init()`.
 */
function ensureLab() {
  if (lab || labError) return lab;
  try {
    lab = createPracticeLab(defaultPorts());
  } catch (error) {
    labError = error.message || 'Practice Lab could not start.';
    return null;
  }
  lab.init().catch(() => {
    labError = 'Practice Lab could not read its saved takes.';
  });
  return lab;
}

function paint() {
  if (!rootEl) return;
  stopMounted();
  const service = ensureLab();
  if (!service) {
    paintFailure(labError);
    return;
  }

  // Composition Lab, the Drums tab, and the Vocal tab read the store only when
  // they need it, so they open at once.
  if (currentMode === 'composition') { mount(createCompositionView()); return; }
  if (currentMode === 'drums') { mount(createDrumsView(service)); return; }
  if (currentMode === 'vocal') { mount(createVocalView(service)); return; }

  // The Practice tab lists the saved takes, so it waits for the store once.
  if (service.isReady()) { mount(createPracticeView(service)); return; }
  paintLoading();
  const wanted = currentMode;
  service.init().then(() => {
    if (lab !== service || currentMode !== wanted || !rootEl) return;
    if (mounted) return;
    mount(createPracticeView(service));
  }).catch(() => {
    if (lab === service && currentMode === wanted && rootEl) paintFailure(labError);
  });
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
  currentMode = MODES.has(mode) ? mode : 'practice';
  paint();
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
  labError = '';
  rootEl = null;
}
