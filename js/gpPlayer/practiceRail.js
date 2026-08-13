// Main-screen practice controls: speed, loop, metronome, count-in.

import { el } from './dom.js';
import {
  GPP_MIN_BPM,
  GPP_MAX_BPM,
  GPP_MIN_TEMPO_PCT,
  GPP_MAX_TEMPO_PCT,
  clampBpm,
  clampTempoPct,
} from './tempoRange.js';
import { GPP_TRANSPORT_BPM_STEP } from './transportDock.js';

/**
 * @param {HTMLElement} host
 * @param {object} api
 */
export function mountPracticeRail(host, api = {}) {
  const noop = { sync() {}, destroy() {} };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-practice-rail');

  const speedGroup = el('div', { class: 'gpp-practice-speed' });
  const pctDownBtn = el('button', {
    class: 'gpp-practice-btn',
    type: 'button',
    text: '−',
    'aria-label': 'Decrease speed',
    title: 'Decrease speed',
  });
  const pctInput = el('input', {
    class: 'gpp-practice-pct-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(GPP_MIN_TEMPO_PCT),
    max: String(GPP_MAX_TEMPO_PCT),
    step: '1',
    'aria-label': 'Playback speed',
    title: 'Playback speed percent',
  });
  const pctUnit = el('span', { class: 'gpp-practice-pct-unit', text: '%' });
  const pctUpBtn = el('button', {
    class: 'gpp-practice-btn',
    type: 'button',
    text: '+',
    'aria-label': 'Increase speed',
    title: 'Increase speed',
  });
  const bpmDownBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-bpm-step',
    type: 'button',
    text: '−',
    'aria-label': `Decrease tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Decrease tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmInput = el('input', {
    class: 'gpp-practice-bpm-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(GPP_MIN_BPM),
    max: String(GPP_MAX_BPM),
    step: '1',
    'aria-label': 'Tempo BPM',
    title: 'Tempo BPM',
  });
  const bpmUnit = el('span', { class: 'gpp-practice-bpm-unit', text: 'BPM' });
  const bpmUpBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-bpm-step',
    type: 'button',
    text: '+',
    'aria-label': `Increase tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Increase tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmResetBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-bpm-reset',
    type: 'button',
    text: '↺',
    'aria-label': 'Reset tempo to score BPM',
    title: 'Reset to score tempo',
  });
  speedGroup.append(pctDownBtn, pctInput, pctUnit, pctUpBtn, bpmDownBtn, bpmInput, bpmUnit, bpmUpBtn, bpmResetBtn);

  const loopBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-loop-btn',
    type: 'button',
    text: '↻',
    'aria-label': 'Loop',
    title: 'Toggle loop',
    'aria-pressed': 'false',
  });
  const loopRangeEl = el('span', { class: 'gpp-practice-loop-range', text: '' });
  const clearLoopBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-clear-loop',
    type: 'button',
    text: '✕',
    'aria-label': 'Clear loop',
    title: 'Clear loop',
  });
  const metroBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-metro-btn',
    type: 'button',
    text: '♩',
    'aria-label': 'Metronome',
    title: 'Metronome',
    'aria-pressed': 'false',
  });
  const countInBtn = el('button', {
    class: 'gpp-practice-btn gpp-practice-countin-btn',
    type: 'button',
    text: '1',
    'aria-label': 'Count-in',
    title: 'Count-in',
    'aria-pressed': 'false',
  });
  const overlayEl = el('span', { class: 'gpp-practice-overlay', text: '', hidden: true });

  host.append(speedGroup, loopBtn, loopRangeEl, clearLoopBtn, metroBtn, countInBtn, overlayEl);

  pctDownBtn.addEventListener('click', () => api.onSpeedStep?.(-5));
  pctUpBtn.addEventListener('click', () => api.onSpeedStep?.(5));
  pctInput.addEventListener('change', () => api.onSpeedInput?.(pctInput.value));
  bpmDownBtn.addEventListener('click', () => api.onBpmStep?.(-GPP_TRANSPORT_BPM_STEP));
  bpmUpBtn.addEventListener('click', () => api.onBpmStep?.(GPP_TRANSPORT_BPM_STEP));
  bpmInput.addEventListener('change', () => api.onBpmInput?.(bpmInput.value));
  bpmResetBtn.addEventListener('click', () => api.onBpmReset?.());
  loopBtn.addEventListener('click', () => api.onLoopToggle?.());
  clearLoopBtn.addEventListener('click', () => api.onClearLoop?.());
  metroBtn.addEventListener('click', () => api.onMetroToggle?.());
  countInBtn.addEventListener('click', () => api.onCountInToggle?.());

  function syncSpeedControls() {
    const bpm = Math.round(Number(api.getBpm?.()) || 0);
    const scoreBpm = Math.round(Number(api.getScoreBpm?.()) || 0);
    const pct = scoreBpm ? Math.round((bpm / scoreBpm) * 100) : 100;
    const canReset = api.canResetBpm?.() !== false;

    if (typeof document !== 'undefined' && document.activeElement !== bpmInput) {
      bpmInput.value = String(bpm);
    }
    if (typeof document !== 'undefined' && document.activeElement !== pctInput) {
      pctInput.value = String(clampTempoPct(pct));
    }
    bpmInput.title = scoreBpm
      ? `Tempo: ${bpm} BPM · ${pct}% of score tempo ${scoreBpm}`
      : `Tempo: ${bpm} BPM`;
    pctInput.title = `Speed: ${pct}%`;

    bpmResetBtn.disabled = !canReset;
    bpmResetBtn.title = canReset && scoreBpm
      ? `Reset to score tempo (${scoreBpm} BPM)`
      : 'Already at score tempo';
  }

  function sync() {
    const loopOn = !!api.getLoopEnabled?.();
    loopBtn.classList.toggle('is-on', loopOn);
    loopBtn.setAttribute('aria-pressed', loopOn ? 'true' : 'false');
    loopBtn.title = loopOn ? 'Loop on' : 'Loop off';

    const rangeTxt = api.getLoopRangeLabel?.() || '';
    loopRangeEl.textContent = rangeTxt;
    loopRangeEl.hidden = !rangeTxt;
    clearLoopBtn.hidden = !loopOn && !rangeTxt;

    const metroOn = !!api.getMetroEnabled?.();
    metroBtn.classList.toggle('is-on', metroOn);
    metroBtn.setAttribute('aria-pressed', metroOn ? 'true' : 'false');
    metroBtn.title = metroOn ? 'Metronome on' : 'Metronome off';

    const countInOn = !!api.getCountInEnabled?.();
    countInBtn.classList.toggle('is-on', countInOn);
    countInBtn.setAttribute('aria-pressed', countInOn ? 'true' : 'false');
    countInBtn.title = countInOn ? 'Count-in on' : 'Count-in off';

    const overlayTxt = api.getOverlayLabel?.() || '';
    if (overlayTxt) {
      overlayEl.textContent = overlayTxt;
      overlayEl.hidden = false;
    } else {
      overlayEl.textContent = '';
      overlayEl.hidden = true;
    }

    syncSpeedControls();
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('gpp-practice-rail');
  }

  sync();

  return { sync, destroy };
}
