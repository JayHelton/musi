/**
 * The Interval Reference tool page.
 *
 * Study holds three references: Interval Reference, Scale Reference, and Chord
 * Reference. This page is the first of them. It mounts the shared interval
 * component from `js/reference/`, the same component Composition Lab opens in
 * its reference drawer, so the two screens never drift apart.
 *
 * The page follows the shared musical context, so the root and the tuning
 * arrive from whichever screen the player came from.
 */

import { createIntervalReference } from './reference/index.js';
import { TUNINGS, ROOTS } from './theory.js';
import { resolveTuningKey } from './tunings.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { getSetting, saveSetting } from './persistence.js';

const SECTION_ID = 'sec-intervalref';
const SOURCE = 'intervalref';
const SETTINGS = { fbStart: 'intervalref.fbStart', fbEnd: 'intervalref.fbEnd' };

let view = null;
let host = null;
let unsubscribe = null;

function readState() {
  const context = getContext();
  const tuning = resolveTuningKey(context.tuning) || 'Standard';
  return {
    tonic: ROOTS.includes(context.root) ? context.root : 'C',
    tuning: TUNINGS[tuning] ? tuning : 'Standard',
    fretStart: Number(getSetting(SETTINGS.fbStart, 0)) || 0,
    fretEnd: Number(getSetting(SETTINGS.fbEnd, 12)) || 12,
  };
}

function paint() {
  if (!view) return;
  const state = readState();
  view.render({
    tonic: state.tonic,
    strings: TUNINGS[state.tuning] || TUNINGS.Standard,
    fretStart: state.fretStart,
    fretEnd: state.fretEnd,
  });
}

function buildControls(state) {
  const row = document.createElement('div');
  row.className = 'mref-controls';

  const rootLabel = document.createElement('label');
  rootLabel.className = 'mref-field';
  const rootName = document.createElement('span');
  rootName.className = 'mref-field-label';
  rootName.textContent = 'Tonal center';
  const rootSelect = document.createElement('select');
  rootSelect.className = 'pl-select';
  rootSelect.setAttribute('aria-label', 'Tonal center');
  for (const note of ROOTS) {
    const option = document.createElement('option');
    option.value = note;
    option.textContent = note;
    rootSelect.appendChild(option);
  }
  rootSelect.value = state.tonic;
  rootSelect.addEventListener('change', () => {
    setContext({ root: rootSelect.value }, SOURCE);
    paint();
  });
  rootLabel.append(rootName, rootSelect);

  const tuningLabel = document.createElement('label');
  tuningLabel.className = 'mref-field';
  const tuningName = document.createElement('span');
  tuningName.className = 'mref-field-label';
  tuningName.textContent = 'Tuning';
  const tuningSelect = document.createElement('select');
  tuningSelect.className = 'pl-select';
  tuningSelect.setAttribute('aria-label', 'Tuning');
  for (const name of Object.keys(TUNINGS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    tuningSelect.appendChild(option);
  }
  tuningSelect.value = state.tuning;
  tuningSelect.addEventListener('change', () => {
    setContext({ tuning: tuningSelect.value }, SOURCE);
    paint();
  });
  tuningLabel.append(tuningName, tuningSelect);

  const rangeLabel = document.createElement('label');
  rangeLabel.className = 'mref-field';
  const rangeName = document.createElement('span');
  rangeName.className = 'mref-field-label';
  rangeName.textContent = 'Last fret';
  const rangeInput = document.createElement('input');
  rangeInput.type = 'number';
  rangeInput.className = 'pl-text';
  rangeInput.min = '1';
  rangeInput.max = '24';
  rangeInput.value = String(state.fretEnd);
  rangeInput.setAttribute('aria-label', 'Last fret');
  rangeInput.addEventListener('change', () => {
    const value = Math.max(1, Math.min(24, Number(rangeInput.value) || 12));
    rangeInput.value = String(value);
    saveSetting(SETTINGS.fbEnd, value);
    paint();
  });
  rangeLabel.append(rangeName, rangeInput);

  row.append(rootLabel, tuningLabel, rangeLabel);
  return row;
}

/** Open the tool page. `js/main.js` calls this on every visit. */
export function initIntervalReference() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return;
  host = section.querySelector('#intervalref-body') || section;

  if (view) { paint(); return; }

  const state = readState();
  view = createIntervalReference({});
  host.textContent = '';
  host.append(buildControls(state), view.root);
  paint();

  unsubscribe = subscribeContext((next, source) => {
    if (source === SOURCE) return;
    paint();
    const rootSelect = host.querySelector('select[aria-label="Tonal center"]');
    const tuningSelect = host.querySelector('select[aria-label="Tuning"]');
    if (rootSelect && ROOTS.includes(next.root)) rootSelect.value = next.root;
    const tuning = resolveTuningKey(next.tuning);
    if (tuningSelect && tuning && TUNINGS[tuning]) tuningSelect.value = tuning;
  });
}

/** Leave the tool page. The reference holds no sound and no timer. */
export function stopIntervalReference() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
