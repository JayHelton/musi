// Riff Spark — the mount point.
//
// `js/main.js` uses `initSpark` and `stopSpark` and nothing else. This file
// reads the saved state, paints the tab the route asks for, and stops the
// loop when the player leaves.

import { readSparkState, saveSparkState } from './sparkState.js';
import { createCadenceView } from './cadenceView.js';
import { createPedalView } from './pedalView.js';
import { createPromptsView } from './promptsView.js';
import { createBankView } from './bankView.js';
import { player } from './playback.js';
import { clear } from './dom.js';

const SECTION_ID = 'sec-spark';

/** The tabs the tool page offers. They match the `modes` list in js/tools.js. */
const MODES = new Set(['cadence', 'pedal', 'prompts', 'bank']);

let state = null;
let mounted = null;
let rootEl = null;

function hostElement() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return null;
  return section.querySelector('#spark-body') || section;
}

function save() {
  if (state) saveSparkState(state);
}

function stopMounted() {
  if (mounted && typeof mounted.stop === 'function') mounted.stop();
  mounted = null;
}

/**
 * Open the tool. `js/main.js` calls this on every route that lands on
 * `#spark`, including a tab change.
 * @param {{ mode?: string }} [options]
 */
export function initSpark({ mode } = {}) {
  const host = hostElement();
  if (!host) return;
  rootEl = host;
  if (!state) state = readSparkState();
  stopMounted();
  clear(rootEl);
  const current = MODES.has(mode) ? mode : 'cadence';
  const deps = { state, save };
  if (current === 'pedal') mounted = createPedalView(deps);
  else if (current === 'prompts') mounted = createPromptsView();
  else if (current === 'bank') mounted = createBankView(deps);
  else mounted = createCadenceView(deps);
  rootEl.appendChild(mounted.root);
}

/** Leave the tool. The loop stops. */
export function stopSpark() {
  stopMounted();
  player.stop();
}
