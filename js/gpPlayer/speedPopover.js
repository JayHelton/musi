// Playback speed panel.
//
// Speed reads as a percentage of the score tempo. The panel offers presets,
// a slider, and the BPM the percentage maps to. The ratio derives from the
// score tempo, so there is one tempo value and it cannot drift.

import { el } from './dom.js';
import { createPopover } from './popover.js';
import { GPP_MIN_BPM, GPP_MAX_BPM, clampBpm } from './tempoRange.js';

export const GPP_SPEED_PRESETS = [50, 75, 90, 100, 110, 125];
export const GPP_SPEED_MIN_PCT = 25;
export const GPP_SPEED_MAX_PCT = 200;

export function clampSpeedPct(pct) {
  const n = Math.round(Number(pct));
  if (!Number.isFinite(n)) return 100;
  return Math.max(GPP_SPEED_MIN_PCT, Math.min(GPP_SPEED_MAX_PCT, n));
}

/** The percent a BPM maps to for one score tempo. */
export function speedPctFor(bpm, scoreBpm) {
  const score = Number(scoreBpm) || 0;
  if (score <= 0) return 100;
  return Math.round(((Number(bpm) || score) / score) * 100);
}

/**
 * @param {HTMLElement} overlayHost
 * @param {{
 *   getAnchor: () => HTMLElement|null,
 *   getBpm: () => number,
 *   getScoreBpm: () => number,
 *   onSpeedPct: (pct:number) => void,
 *   onBpm: (bpm:number) => void,
 *   onReset: () => void,
 *   onOpenRamp?: () => void,
 *   getRampLabel?: () => string,
 * }} api
 */
export function mountSpeedPopover(overlayHost, api = {}) {
  const pop = createPopover(overlayHost, {
    id: 'speed',
    title: 'Playback speed',
    getAnchor: api.getAnchor,
    align: 'center',
    placement: 'above',
    width: 320,
  });
  if (!pop.body) return pop;

  const presetRow = el('div', { class: 'gpp-speed-presets', role: 'group', 'aria-label': 'Speed presets' });
  const presetBtns = new Map();
  for (const pct of GPP_SPEED_PRESETS) {
    const btn = el('button', {
      class: 'gpp-chip',
      type: 'button',
      text: `${pct}%`,
      'aria-label': `${pct} percent of the score tempo`,
      'aria-pressed': 'false',
      onClick: () => api.onSpeedPct?.(pct),
    });
    presetBtns.set(pct, btn);
    presetRow.appendChild(btn);
  }

  const slider = el('input', {
    class: 'gpp-slider gpp-speed-slider',
    type: 'range',
    min: String(GPP_SPEED_MIN_PCT),
    max: String(GPP_SPEED_MAX_PCT),
    step: '1',
    value: '100',
    'aria-label': 'Playback speed in percent',
  });
  slider.addEventListener('input', () => api.onSpeedPct?.(clampSpeedPct(slider.value)));
  const sliderRow = el('div', { class: 'gpp-speed-slider-row' }, [
    el('span', { class: 'gpp-speed-bound', text: `${GPP_SPEED_MIN_PCT}%` }),
    slider,
    el('span', { class: 'gpp-speed-bound', text: `${GPP_SPEED_MAX_PCT}%` }),
  ]);

  const pctOut = el('div', { class: 'gpp-speed-readout', 'aria-live': 'polite' });

  const bpmDown = el('button', {
    class: 'gpp-icon-btn gpp-step-btn',
    type: 'button',
    text: '−',
    'aria-label': 'Slower by 1 BPM',
    onClick: () => api.onBpm?.(clampBpm((Number(api.getBpm?.()) || 120) - 1)),
  });
  const bpmInput = el('input', {
    class: 'gpp-num gpp-bpm-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(GPP_MIN_BPM),
    max: String(GPP_MAX_BPM),
    step: '1',
    'aria-label': 'Tempo in BPM',
  });
  bpmInput.addEventListener('change', () => {
    const n = Number(bpmInput.value);
    if (Number.isFinite(n)) api.onBpm?.(clampBpm(n));
  });
  const bpmUp = el('button', {
    class: 'gpp-icon-btn gpp-step-btn',
    type: 'button',
    text: '+',
    'aria-label': 'Faster by 1 BPM',
    onClick: () => api.onBpm?.(clampBpm((Number(api.getBpm?.()) || 120) + 1)),
  });
  const bpmRow = el('div', { class: 'gpp-speed-bpm-row' }, [
    bpmDown,
    el('label', { class: 'gpp-speed-bpm-field' }, [bpmInput, el('span', { class: 'gpp-unit', text: 'BPM' })]),
    bpmUp,
  ]);

  const scoreNote = el('div', { class: 'gpp-popover-note' });
  const resetBtn = el('button', {
    class: 'gpp-text-btn',
    type: 'button',
    text: 'Reset to score tempo',
    onClick: () => api.onReset?.(),
  });
  const rampBtn = el('button', {
    class: 'gpp-row-btn',
    type: 'button',
    'aria-label': 'Tempo ramp settings',
    onClick: () => {
      pop.close();
      api.onOpenRamp?.();
    },
  }, [
    el('span', { class: 'gpp-row-btn-label', text: 'Tempo ramp' }),
    el('span', { class: 'gpp-row-btn-value gpp-ramp-value', text: 'Off' }),
    el('span', { class: 'gpp-row-btn-chevron', text: '›', 'aria-hidden': 'true' }),
  ]);
  if (typeof api.onOpenRamp !== 'function') rampBtn.hidden = true;

  pop.body.append(presetRow, sliderRow, pctOut, bpmRow, scoreNote, resetBtn, rampBtn);

  function sync() {
    const bpm = Math.round(Number(api.getBpm?.()) || 0);
    const score = Math.round(Number(api.getScoreBpm?.()) || 0);
    const pct = speedPctFor(bpm, score);
    for (const [preset, btn] of presetBtns) {
      const on = preset === pct;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (typeof document === 'undefined' || document.activeElement !== slider) {
      slider.value = String(clampSpeedPct(pct));
    }
    pctOut.textContent = `${pct}% · ${bpm} BPM`;
    if (typeof document === 'undefined' || document.activeElement !== bpmInput) {
      bpmInput.value = String(bpm);
    }
    scoreNote.textContent = score ? `Score tempo ${score} BPM` : '';
    resetBtn.hidden = !score || bpm === score;
    const rampTxt = api.getRampLabel?.() || '';
    const rampVal = rampBtn.querySelector('.gpp-ramp-value');
    if (rampVal) rampVal.textContent = rampTxt || 'Off';
  }

  return {
    open: (opener) => { sync(); pop.open(opener); },
    close: pop.close,
    toggle: (opener) => { sync(); pop.toggle(opener); },
    isOpen: pop.isOpen,
    sync,
    detach: pop.detach,
    destroy: pop.destroy,
  };
}
