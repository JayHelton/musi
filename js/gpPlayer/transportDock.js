// Transport dock — two rows: transport controls and the practice rail.

import { el } from './dom.js';

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

  const rowPrimary = el('div', { class: 'gpp-transport-row-primary' });
  const rowPractice = el('div', { class: 'gpp-transport-row-practice' });

  if (api.extraNode) {
    dock.classList.add('has-extra');
    const extraGroup = el('div', { class: 'gpp-transport-extra' });
    extraGroup.appendChild(api.extraNode);
    rowPrimary.appendChild(extraGroup);
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

  const timeEl = el('span', { class: 'gpp-transport-time', text: '0:00 / 0:00' });
  const rampChip = el('span', { class: 'gpp-ramp-chip', text: '', hidden: true });

  // The transport buttons scroll sideways on a narrow screen. The menu button
  // stays out of that scroller, so the gear is always in the same place.
  const controlScroll = el('div', { class: 'gpp-transport-scroll' });
  controlScroll.append(prevBtn, playBtn, stopBtn, restartBtn, nextBtn, timeEl, rampChip);

  rowPrimary.append(controlScroll, menuBtn);

  if (api.practiceRailNode) {
    rowPractice.appendChild(api.practiceRailNode);
  }

  dock.append(rowPrimary, rowPractice);

  prevBtn.addEventListener('click', () => api.onPrev?.());
  nextBtn.addEventListener('click', () => api.onNext?.());
  playBtn.addEventListener('click', () => api.onPlayPause?.());
  stopBtn.addEventListener('click', () => api.onStop?.());
  restartBtn.addEventListener('click', () => api.onRestart?.());
  menuBtn.addEventListener('click', () => api.onOpenMenu?.());

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

    timeEl.textContent = api.getTimeLabel?.() || '0:00 / 0:00';

    const rampTxt = api.getRampStatusLabel?.();
    if (rampTxt) {
      rampChip.textContent = rampTxt;
      rampChip.hidden = false;
    } else {
      rampChip.textContent = '';
      rampChip.hidden = true;
    }

    prevBtn.disabled = api.canPrev?.() === false;
    nextBtn.disabled = api.canNext?.() === false;

    const menuOpen = !!api.isMenuOpen?.();
    menuBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    menuBtn.classList.toggle('is-on', menuOpen);

    api.syncPracticeRail?.();
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
