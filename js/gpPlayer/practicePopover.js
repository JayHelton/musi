// Practice panel for a marked range.
//
// "Practice" turns the marked range into a practice block without a change
// of screen: the range loops, the speed drops to a start value, and a tempo
// ramp can raise the speed after a number of clean loops. The player already
// owns the ramp state; this panel only gives it a plain face.

import { el } from './dom.js';
import { createPopover } from './popover.js';
import { rangeLabel } from './selectionToolbar.js';
import { clampSpeedPct } from './speedPopover.js';

const START_PRESETS = [60, 70, 80, 90, 100];

/**
 * @param {HTMLElement} overlayHost
 * @param {{
 *   getAnchor: () => HTMLElement|null,
 *   getRange: () => { measureStart:number, measureEnd:number }|null,
 *   getScoreBpm: () => number,
 *   getSpeedPct: () => number,
 *   onStart: (plan: { startPct:number, ramp: null | { stepPct:number, everyLoops:number, targetPct:number } }) => void,
 *   onSaveExercise?: () => void,
 * }} api
 */
export function mountPracticePopover(overlayHost, api = {}) {
  const pop = createPopover(overlayHost, {
    id: 'practice',
    title: 'Practice',
    getAnchor: api.getAnchor,
    align: 'center',
    placement: 'above',
    width: 320,
  });
  if (!pop.body) return pop;

  let startPct = 80;
  let rampOn = false;
  let stepPct = 5;
  let everyLoops = 3;
  let targetPct = 100;

  const rangeEl = el('div', { class: 'gpp-practice-range' });
  const startTitle = el('div', { class: 'gpp-popover-subtitle', text: 'Start speed' });
  const startRow = el('div', { class: 'gpp-speed-presets', role: 'group', 'aria-label': 'Start speed' });
  const startBtns = new Map();
  for (const pct of START_PRESETS) {
    const btn = el('button', {
      class: 'gpp-chip',
      type: 'button',
      text: `${pct}%`,
      'aria-pressed': 'false',
      'aria-label': `Start at ${pct} percent`,
      onClick: () => { startPct = pct; sync(); },
    });
    startBtns.set(pct, btn);
    startRow.appendChild(btn);
  }
  const startOut = el('div', { class: 'gpp-popover-note' });

  const rampToggle = el('input', { type: 'checkbox', 'aria-label': 'Raise the speed after clean loops' });
  rampToggle.addEventListener('change', () => { rampOn = !!rampToggle.checked; sync(); });
  const rampRow = el('label', { class: 'gpp-check gpp-practice-ramp-toggle' }, [rampToggle, 'Raise the speed as I go']);

  function numField(label, get, set, { min, max, step = 1, unit = '' }) {
    const input = el('input', {
      class: 'gpp-num gpp-num--sm',
      type: 'number',
      inputmode: 'numeric',
      min: String(min),
      max: String(max),
      step: String(step),
      'aria-label': label,
    });
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) set(Math.max(min, Math.min(max, n)));
      sync();
    });
    const row = el('div', { class: 'gpp-practice-field' }, [
      el('span', { class: 'gpp-practice-field-label', text: label }),
      input,
      unit ? el('span', { class: 'gpp-unit', text: unit }) : null,
    ]);
    return { row, input, get };
  }
  const stepField = numField('Increase by', () => stepPct, (v) => { stepPct = v; }, { min: 1, max: 25, unit: '%' });
  const everyField = numField('Every', () => everyLoops, (v) => { everyLoops = v; }, { min: 1, max: 20, unit: 'loops' });
  const targetField = numField('Target', () => targetPct, (v) => { targetPct = v; }, { min: 30, max: 200, unit: '%' });
  const rampBody = el('div', { class: 'gpp-practice-ramp-body' }, [stepField.row, everyField.row, targetField.row]);

  const startBtn = el('button', {
    class: 'gpp-btn gpp-btn--primary gpp-practice-start',
    type: 'button',
    text: 'Start',
    'aria-label': 'Start the practice loop',
    onClick: () => {
      const plan = {
        startPct: clampSpeedPct(startPct),
        ramp: rampOn
          ? { stepPct: Math.max(1, stepPct), everyLoops: Math.max(1, everyLoops), targetPct: clampSpeedPct(targetPct) }
          : null,
      };
      pop.close();
      api.onStart?.(plan);
    },
  });
  const saveBtn = el('button', {
    class: 'gpp-text-btn',
    type: 'button',
    text: 'Save as exercise',
    'aria-label': 'Save the marked range as an exercise',
    onClick: () => {
      pop.close();
      api.onSaveExercise?.();
    },
  });
  if (typeof api.onSaveExercise !== 'function') saveBtn.hidden = true;

  pop.body.append(rangeEl, startTitle, startRow, startOut, rampRow, rampBody, startBtn, saveBtn);

  function sync() {
    const range = api.getRange?.();
    rangeEl.textContent = range ? rangeLabel(range.measureStart, range.measureEnd) : '';
    const score = Math.round(Number(api.getScoreBpm?.()) || 0);
    for (const [pct, btn] of startBtns) {
      const on = pct === startPct;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    startOut.textContent = score ? `${startPct}% · ${Math.round(score * startPct / 100)} BPM` : `${startPct}%`;
    rampToggle.checked = rampOn;
    rampBody.hidden = !rampOn;
    stepField.input.value = String(stepPct);
    everyField.input.value = String(everyLoops);
    targetField.input.value = String(targetPct);
  }

  return {
    open: (opener) => {
      const cur = Number(api.getSpeedPct?.());
      if (Number.isFinite(cur) && cur < 100) startPct = START_PRESETS.includes(cur) ? cur : startPct;
      sync();
      pop.open(opener);
    },
    close: pop.close,
    isOpen: pop.isOpen,
    sync,
    detach: pop.detach,
    destroy: pop.destroy,
  };
}
