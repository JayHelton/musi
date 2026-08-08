// Transport dock — play/pause, stop, restart, prev/next measure, time + loop chip.

import { el } from './dom.js';

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

  primary.append(prevBtn, playBtn, stopBtn, restartBtn, nextBtn);

  const measureEl = el('span', { class: 'gpp-transport-measure', text: '' });
  const timeEl = el('span', { class: 'gpp-transport-time', text: '0:00 / 0:00' });
  const loopChip = el('span', { class: 'gpp-loop-chip is-off', text: 'Loop off' });

  secondary.append(measureEl, timeEl, loopChip);
  dock.append(primary, secondary);

  prevBtn.addEventListener('click', () => api.onPrev?.());
  nextBtn.addEventListener('click', () => api.onNext?.());
  playBtn.addEventListener('click', () => api.onPlayPause?.());
  stopBtn.addEventListener('click', () => api.onStop?.());
  restartBtn.addEventListener('click', () => api.onRestart?.());

  let ro = null;

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

    prevBtn.disabled = api.canPrev?.() === false;
    nextBtn.disabled = api.canNext?.() === false;
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
