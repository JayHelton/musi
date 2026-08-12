// Transport dock — play/pause, stop, restart, prev/next measure, time + loop chip + tempo.

import { el } from './dom.js';
import { GPP_MIN_BPM, GPP_MAX_BPM } from './tempoRange.js';

export const GPP_TRANSPORT_BPM_STEP = 5;

/**
 * @param {HTMLElement} host
 * @param {object} api
 */
export function mountTransportDock(host, api = {}) {
  const noop = { sync() {}, publishPad() {}, destroy() {} };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-transport-anchor');

  const dock = el('div', { class: 'gpp-transport-dock' });
  host.appendChild(dock);

  const primary = el('div', { class: 'gpp-transport-primary' });
  const secondary = el('div', { class: 'gpp-transport-secondary' });

  if (api.extraNode) {
    dock.classList.add('has-extra');
    const extraGroup = el('div', { class: 'gpp-transport-extra' });
    extraGroup.appendChild(api.extraNode);
    primary.appendChild(extraGroup);
  }

  const prevBtn = el('button', {
    class: 'gpp-transport-btn',
    type: 'button',
    text: '‹',
    'aria-label': 'Previous measure',
    title: 'Previous measure',
  });
  const playBtn = el('button', {
    class: 'gpp-transport-btn is-primary',
    type: 'button',
    text: '▶',
    'aria-label': 'Play',
    title: 'Play',
  });
  const stopBtn = el('button', {
    class: 'gpp-transport-btn',
    type: 'button',
    text: '■',
    'aria-label': 'Stop',
    title: 'Stop',
  });
  const restartBtn = el('button', {
    class: 'gpp-transport-btn',
    type: 'button',
    text: '↺',
    'aria-label': 'Restart',
    title: 'Restart',
  });
  const nextBtn = el('button', {
    class: 'gpp-transport-btn',
    type: 'button',
    text: '›',
    'aria-label': 'Next measure',
    title: 'Next measure',
  });
  const menuBtn = el('button', {
    class: 'gpp-transport-btn gpp-transport-menu-btn',
    type: 'button',
    'aria-label': 'Player menu',
    title: 'Player menu',
    'aria-expanded': 'false',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  });
  const metroBtn = el('button', {
    class: 'gpp-transport-btn gpp-transport-metro-btn',
    type: 'button',
    text: '♩',
    'aria-label': 'Metronome click',
    title: 'Metronome click',
    'aria-pressed': 'false',
  });

  primary.append(prevBtn, playBtn, stopBtn, restartBtn, nextBtn, metroBtn, menuBtn);

  const tempoGroup = el('div', { class: 'gpp-transport-tempo' });
  const bpmDownBtn = el('button', {
    class: 'gpp-transport-tempo-btn',
    type: 'button',
    text: '−',
    'aria-label': `Decrease tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Decrease tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmInput = el('input', {
    class: 'gpp-transport-bpm-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(GPP_MIN_BPM),
    max: String(GPP_MAX_BPM),
    step: '1',
    'aria-label': 'Tempo BPM',
    title: 'Tempo BPM',
  });
  const bpmUnit = el('span', { class: 'gpp-transport-bpm-unit', text: 'BPM' });
  const bpmUpBtn = el('button', {
    class: 'gpp-transport-tempo-btn',
    type: 'button',
    text: '+',
    'aria-label': `Increase tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Increase tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmResetBtn = el('button', {
    class: 'gpp-transport-tempo-btn gpp-transport-tempo-reset',
    type: 'button',
    text: '↺',
    'aria-label': 'Reset tempo to score BPM',
    title: 'Reset to score tempo',
  });
  tempoGroup.append(bpmDownBtn, bpmInput, bpmUnit, bpmUpBtn, bpmResetBtn);

  const measureEl = el('span', { class: 'gpp-transport-measure', text: '' });
  const timeEl = el('span', { class: 'gpp-transport-time', text: '0:00 / 0:00' });
  const loopChip = el('span', { class: 'gpp-loop-chip is-off', text: 'Loop off' });
  const rampChip = el('span', { class: 'gpp-ramp-chip', text: '', hidden: true });

  secondary.append(tempoGroup, rampChip, measureEl, timeEl, loopChip);
  dock.append(primary, secondary);

  prevBtn.addEventListener('click', () => api.onPrev?.());
  nextBtn.addEventListener('click', () => api.onNext?.());
  playBtn.addEventListener('click', () => api.onPlayPause?.());
  stopBtn.addEventListener('click', () => api.onStop?.());
  restartBtn.addEventListener('click', () => api.onRestart?.());
  bpmDownBtn.addEventListener('click', () => api.onBpmStep?.(-GPP_TRANSPORT_BPM_STEP));
  bpmUpBtn.addEventListener('click', () => api.onBpmStep?.(GPP_TRANSPORT_BPM_STEP));
  bpmInput.addEventListener('change', () => api.onBpmInput?.(bpmInput.value));
  bpmResetBtn.addEventListener('click', () => api.onBpmReset?.());
  menuBtn.addEventListener('click', () => api.onOpenMenu?.());
  metroBtn.addEventListener('click', () => api.onMetroToggle?.());

  let ro = null;

  function syncTempoControls() {
    const bpm = Math.round(Number(api.getBpm?.()) || 0);
    const scoreBpm = Math.round(Number(api.getScoreBpm?.()) || 0);
    const pct = scoreBpm ? Math.round((bpm / scoreBpm) * 100) : 100;
    const canReset = api.canResetBpm?.() !== false;

    if (typeof document !== 'undefined' && document.activeElement !== bpmInput) {
      bpmInput.value = String(bpm);
    }
    bpmInput.title = scoreBpm
      ? `Tempo: ${bpm} BPM · ${pct}% of score tempo ${scoreBpm}`
      : `Tempo: ${bpm} BPM`;

    bpmResetBtn.disabled = !canReset;
    bpmResetBtn.title = canReset && scoreBpm
      ? `Reset to score tempo (${scoreBpm} BPM)`
      : 'Already at score tempo';
  }

  function publishPad() {
    const root = host.closest('.gpp-root');
    if (!root) return;
    const h = Math.ceil(dock.getBoundingClientRect().height);
    const gap = 10;
    root.style.setProperty('--gpp-transport-pad', `${h + gap}px`);
  }

  function sync() {
    const playing = !!api.getPlaying?.();
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.title = playing ? 'Pause' : 'Play';

    measureEl.textContent = api.getMeasureLabel?.() || '';
    timeEl.textContent = api.getTimeLabel?.() || '0:00 / 0:00';

    const loopTxt = api.getLoopStatus?.();
    if (loopTxt) {
      loopChip.textContent = loopTxt;
      loopChip.classList.remove('is-off');
    } else {
      loopChip.textContent = 'Loop off';
      loopChip.classList.add('is-off');
    }

    const rampTxt = api.getRampStatusLabel?.();
    if (rampTxt) {
      rampChip.textContent = rampTxt;
      rampChip.hidden = false;
    } else {
      rampChip.textContent = '';
      rampChip.hidden = true;
    }

    const metroOn = !!api.getMetroEnabled?.();
    metroBtn.classList.toggle('is-on', metroOn);
    metroBtn.setAttribute('aria-pressed', metroOn ? 'true' : 'false');
    metroBtn.title = metroOn ? 'Metronome on' : 'Metronome off';

    prevBtn.disabled = api.canPrev?.() === false;
    nextBtn.disabled = api.canNext?.() === false;

    const menuOpen = !!api.isMenuOpen?.();
    menuBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    menuBtn.classList.toggle('is-on', menuOpen);

    syncTempoControls();
    publishPad();
  }

  function destroy() {
    ro?.disconnect();
    ro = null;
    const root = host.closest('.gpp-root');
    root?.style.removeProperty('--gpp-transport-pad');
    host.innerHTML = '';
    host.classList.remove('gpp-transport-anchor');
  }

  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => publishPad());
    ro.observe(dock);
  }

  sync();
  requestAnimationFrame(publishPad);

  return { sync, publishPad, destroy };
}
