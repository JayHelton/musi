// Transport — one stable row of the controls a musician touches every
// session.
//
// Left: restart, previous bar, play, next bar, and the position. Right: speed,
// loop, metronome, and the mixer, then the overflow menu. Nothing sits in a
// collapsible second row. Speed opens a panel with presets and a slider. The
// loop button toggles the marked range. A long press on the metronome opens
// its settings. On a compact screen the row wraps into two lines, and every
// control keeps a 44 pixel target.

import { el, fmtTime } from './dom.js';
import { icon } from './icons.js';
import { mountSpeedPopover, speedPctFor } from './speedPopover.js';
import { mountGoToPopover } from './goToPopover.js';
import { createPopover } from './popover.js';

const LONG_PRESS_MS = 500;

/** The BPM step a host uses for its own tempo buttons. */
export const GPP_TRANSPORT_BPM_STEP = 5;

function iconButton({ cls = '', name, label, title = label, pressed = null }) {
  const btn = el('button', {
    class: `gpp-tbtn${cls ? ` ${cls}` : ''}`,
    type: 'button',
    'aria-label': label,
    title,
    html: icon(name),
  });
  if (pressed != null) btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  return btn;
}

/**
 * Attach a long press to a button. A long press or a right click opens a
 * secondary action, and a plain tap keeps its normal click.
 */
function attachLongPress(btn, onLong) {
  let timer = null;
  let fired = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    fired = false;
    clear();
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      onLong();
    }, LONG_PRESS_MS);
  });
  btn.addEventListener('pointerup', clear);
  btn.addEventListener('pointerleave', clear);
  btn.addEventListener('pointercancel', clear);
  btn.addEventListener('click', (e) => {
    if (fired) {
      fired = false;
      e.stopImmediatePropagation?.();
      e.preventDefault?.();
    }
  }, true);
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault?.();
    onLong();
  });
}

/**
 * @param {HTMLElement} host
 * @param {object} api
 */
export function mountTransportDock(host, api = {}) {
  const noop = {
    sync() {}, publishPad() {}, destroy() {}, closePopovers() {},
    isPopoverOpen: () => false, openSpeed() {}, openLoop() {}, openGoTo() {},
  };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-transport-anchor');
  const overlayHost = api.overlayHost || host;

  const dock = el('div', { class: 'gpp-transport', role: 'toolbar', 'aria-label': 'Transport' });
  host.appendChild(dock);

  // ---- main group ----
  const restartBtn = iconButton({ name: 'restart', label: 'Restart', title: 'Restart (Home)' });
  const prevBtn = iconButton({ name: 'prevBar', label: 'Previous bar', title: 'Previous bar (Shift + ←)' });
  const playBtn = iconButton({ cls: 'gpp-tbtn--play', name: 'play', label: 'Play', title: 'Play (Space)' });
  const nextBtn = iconButton({ name: 'nextBar', label: 'Next bar', title: 'Next bar (Shift + →)' });

  const timeEl = el('span', { class: 'gpp-transport-time', text: '0:00 / 0:00' });
  const barEl = el('span', { class: 'gpp-transport-bar', text: 'Bar 1' });
  const positionBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--position',
    type: 'button',
    'aria-label': 'Position. Go to a bar or a section',
    title: 'Go to bar or section',
    'aria-expanded': 'false',
  }, [barEl, timeEl]);

  const overlayEl = el('span', { class: 'gpp-transport-overlay', role: 'status', hidden: true });

  const main = el('div', { class: 'gpp-transport-main' }, [
    restartBtn, prevBtn, playBtn, nextBtn, positionBtn, overlayEl,
  ]);

  // ---- tools group ----
  const speedBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--speed',
    type: 'button',
    'aria-label': 'Playback speed',
    title: 'Playback speed (S)',
    'aria-expanded': 'false',
  }, [
    el('span', { class: 'gpp-speed-pct', text: '100%' }),
    el('span', { class: 'gpp-speed-bpm', text: '' }),
  ]);
  const loopBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--toggle gpp-tbtn--loop',
    type: 'button',
    'aria-label': 'Loop',
    title: 'Loop the marked range (L). Long press for loop options',
    'aria-pressed': 'false',
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('loop'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text gpp-loop-label', text: 'Loop' }),
  ]);
  const metroBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--toggle gpp-tbtn--metro',
    type: 'button',
    'aria-label': 'Metronome',
    title: 'Metronome (N). Long press for settings',
    'aria-pressed': 'false',
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('metronome'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Metro' }),
  ]);
  const countBadge = el('span', { class: 'gpp-count-badge', text: 'Count', hidden: true, title: 'Count-in on (C)' });
  const backingBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--toggle gpp-tbtn--backing',
    type: 'button',
    'aria-label': 'Play the original recording instead of the synth',
    title: 'Original recording',
    'aria-pressed': 'false',
    hidden: true,
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('backing'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Original' }),
  ]);
  const mixBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--mix',
    type: 'button',
    'aria-label': 'Mixer',
    title: 'Mixer (X)',
    'aria-expanded': 'false',
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('mixer'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Mix' }),
  ]);
  const menuBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--more gpp-transport-menu-btn',
    type: 'button',
    'aria-label': 'Player menu',
    title: 'More',
    'aria-expanded': 'false',
    html: icon('more'),
  });
  const rampChip = el('span', { class: 'gpp-ramp-chip', text: '', hidden: true });

  const tools = el('div', { class: 'gpp-transport-tools' }, [
    speedBtn, loopBtn, metroBtn, countBadge, backingBtn, mixBtn, rampChip, menuBtn,
  ]);

  if (api.extraNode) {
    dock.classList.add('has-extra');
    const extraGroup = el('div', { class: 'gpp-transport-extra' });
    extraGroup.appendChild(api.extraNode);
    main.insertBefore(extraGroup, restartBtn);
  }

  dock.append(main, tools);

  // ---- popovers ----
  const speedPop = mountSpeedPopover(overlayHost, {
    getAnchor: () => speedBtn,
    getBpm: () => api.getBpm?.(),
    getScoreBpm: () => api.getScoreBpm?.(),
    onSpeedPct: (pct) => { api.onSpeedPct?.(pct); sync(); },
    onBpm: (bpm) => { api.onBpmInput?.(bpm); sync(); },
    onReset: () => { api.onTempoReset?.(); sync(); },
    onOpenRamp: typeof api.onOpenTempoRamp === 'function' ? () => api.onOpenTempoRamp() : null,
    getRampLabel: () => api.getRampStatusLabel?.() || '',
  });

  const goToPop = mountGoToPopover(overlayHost, {
    getAnchor: () => positionBtn,
    getMeasureCount: () => api.getMeasureCount?.() || 0,
    getCurrentBar: () => api.getCurrentBar?.() || 0,
    getSections: () => api.getSections?.() || [],
    onGoTo: (i) => api.onGoToBar?.(i),
  });

  const loopPop = createPopover(overlayHost, {
    id: 'loop',
    title: 'Loop',
    getAnchor: () => loopBtn,
    align: 'center',
    placement: 'above',
    width: 300,
  });
  const loopStatus = el('div', { class: 'gpp-popover-note gpp-loop-status' });
  const loopRangeBtn = el('button', {
    class: 'gpp-row-btn',
    type: 'button',
    'aria-label': 'Loop the marked range',
    onClick: () => { api.onLoopRange?.(); sync(); },
  }, [el('span', { class: 'gpp-row-btn-label', text: 'Loop marked range' })]);
  const loopSongBtn = el('button', {
    class: 'gpp-row-btn',
    type: 'button',
    'aria-label': 'Repeat the whole song',
    onClick: () => { api.onLoopSong?.(); sync(); },
  }, [el('span', { class: 'gpp-row-btn-label', text: 'Repeat whole song' })]);
  const loopOffBtn = el('button', {
    class: 'gpp-row-btn',
    type: 'button',
    'aria-label': 'Turn the loop off',
    onClick: () => { api.onLoopOff?.(); sync(); loopPop.close(); },
  }, [el('span', { class: 'gpp-row-btn-label', text: 'Loop off' })]);
  const loopHint = el('div', { class: 'gpp-popover-note', text: 'Drag across the score to mark a range. On a phone, press and hold.' });
  loopPop.body?.append(loopStatus, loopRangeBtn, loopSongBtn, loopOffBtn, loopHint);

  // ---- events ----
  playBtn.addEventListener('click', () => api.onPlayPause?.());
  restartBtn.addEventListener('click', () => api.onRestart?.());
  prevBtn.addEventListener('click', () => api.onPrevBar?.());
  nextBtn.addEventListener('click', () => api.onNextBar?.());
  positionBtn.addEventListener('click', () => {
    closePopovers('goto');
    goToPop.toggle(positionBtn);
    sync();
  });
  speedBtn.addEventListener('click', () => {
    closePopovers('speed');
    speedPop.toggle(speedBtn);
    sync();
  });
  loopBtn.addEventListener('click', () => {
    api.onLoopToggle?.();
    sync();
  });
  attachLongPress(loopBtn, () => {
    closePopovers('loop');
    loopPop.toggle(loopBtn);
    sync();
  });
  metroBtn.addEventListener('click', () => {
    api.onMetroToggle?.();
    sync();
  });
  attachLongPress(metroBtn, () => api.onOpenMetronome?.());
  backingBtn.addEventListener('click', () => {
    api.onBackingToggle?.();
    sync();
  });
  mixBtn.addEventListener('click', () => api.onOpenMixer?.());
  menuBtn.addEventListener('click', () => api.onOpenMenu?.());

  let ro = null;

  function closePopovers(except = null) {
    if (except !== 'speed') speedPop.close();
    if (except !== 'goto') goToPop.close();
    if (except !== 'loop') loopPop.close();
  }

  function isPopoverOpen() {
    return speedPop.isOpen() || goToPop.isOpen() || loopPop.isOpen();
  }

  function publishPad() {
    const root = host.closest('.gpp-root');
    if (!root) return;
    const h = Math.ceil(dock.getBoundingClientRect().height);
    root.style.setProperty('--gpp-transport-pad', `${h + 8}px`);
  }

  function syncSpeed() {
    const bpm = Math.round(Number(api.getBpm?.()) || 0);
    const score = Math.round(Number(api.getScoreBpm?.()) || 0);
    const pct = speedPctFor(bpm, score);
    speedBtn.querySelector('.gpp-speed-pct').textContent = `${pct}%`;
    speedBtn.querySelector('.gpp-speed-bpm').textContent = bpm ? `${bpm} BPM` : '';
    speedBtn.title = score
      ? `Speed ${pct}% · ${bpm} BPM of ${score} (S)`
      : `Tempo ${bpm} BPM (S)`;
    speedBtn.classList.toggle('is-changed', !!score && bpm !== score);
    speedBtn.setAttribute('aria-expanded', speedPop.isOpen() ? 'true' : 'false');
    speedPop.sync();
  }

  function syncLoop() {
    const mode = api.getLoopMode?.() || 'off';
    const on = mode !== 'off';
    const label = api.getLoopRangeLabel?.() || '';
    const textEl = loopBtn.querySelector('.gpp-loop-label');
    if (mode === 'song') textEl.textContent = 'Song';
    else textEl.textContent = on && label ? label : 'Loop';
    loopBtn.classList.toggle('is-on', on);
    loopBtn.dataset.loopMode = mode;
    loopBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    loopBtn.setAttribute('aria-label', mode === 'song'
      ? 'Loop: whole song. Press to turn off'
      : (on ? `Loop bars ${label}. Press to turn off` : 'Loop the marked range'));
    const hasRange = !!api.hasLoopRange?.();
    loopStatus.textContent = mode === 'song'
      ? 'The whole song repeats.'
      : (on ? `Bars ${label} repeat.` : (hasRange ? `Range ${label} marked.` : 'No range marked.'));
    loopRangeBtn.disabled = !hasRange;
    loopRangeBtn.classList.toggle('is-on', mode === 'range');
    loopSongBtn.classList.toggle('is-on', mode === 'song');
    loopOffBtn.disabled = !on;
  }

  function syncMetro() {
    const metroOn = !!api.getMetroEnabled?.();
    metroBtn.classList.toggle('is-on', metroOn);
    metroBtn.setAttribute('aria-pressed', metroOn ? 'true' : 'false');
    const countOn = !!api.getCountInEnabled?.();
    countBadge.hidden = !countOn;
  }

  function syncBacking() {
    const hasBacking = !!api.getBackingAvailable?.();
    backingBtn.hidden = !hasBacking;
    if (!hasBacking) return;
    const on = !!api.getBackingActive?.();
    backingBtn.classList.toggle('is-on', on);
    backingBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    backingBtn.title = on ? 'The original recording plays. Press for the synth.' : 'Play the original recording';
  }

  function sync() {
    const playing = !!api.getPlaying?.();
    const pending = !!api.getPending?.();
    playBtn.innerHTML = icon(playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
    playBtn.classList.toggle('is-playing', playing);
    playBtn.classList.toggle('is-pending', pending);
    playBtn.disabled = api.getPlayReady?.() === false;

    prevBtn.disabled = api.canPrev?.() === false;
    nextBtn.disabled = api.canNext?.() === false;

    timeEl.textContent = api.getTimeLabel?.() || '0:00 / 0:00';
    const bar = Number(api.getCurrentBar?.());
    const count = Number(api.getMeasureCount?.()) || 0;
    barEl.textContent = Number.isFinite(bar) ? `Bar ${bar + 1}${count ? ` / ${count}` : ''}` : '';
    positionBtn.setAttribute('aria-expanded', goToPop.isOpen() ? 'true' : 'false');

    const overlayTxt = api.getOverlayLabel?.() || '';
    overlayEl.textContent = overlayTxt;
    overlayEl.hidden = !overlayTxt;

    const rampTxt = api.getRampStatusLabel?.() || '';
    rampChip.textContent = rampTxt;
    rampChip.hidden = !rampTxt;

    const mixOpen = !!api.isMixerOpen?.();
    mixBtn.setAttribute('aria-expanded', mixOpen ? 'true' : 'false');
    mixBtn.classList.toggle('is-open', mixOpen);
    const menuOpen = !!api.isMenuOpen?.();
    menuBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    menuBtn.classList.toggle('is-open', menuOpen);

    syncSpeed();
    syncLoop();
    syncMetro();
    syncBacking();
    publishPad();
  }

  function destroy() {
    ro?.disconnect();
    ro = null;
    speedPop.destroy();
    goToPop.destroy();
    loopPop.destroy();
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
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(publishPad);

  return {
    sync,
    publishPad,
    destroy,
    closePopovers,
    isPopoverOpen,
    openSpeed: () => { closePopovers('speed'); speedPop.toggle(speedBtn); sync(); },
    openLoop: () => { closePopovers('loop'); loopPop.toggle(loopBtn); sync(); },
    openGoTo: () => { closePopovers('goto'); goToPop.toggle(positionBtn); sync(); },
    elements: { playBtn, loopBtn, metroBtn, speedBtn, mixBtn, menuBtn, positionBtn },
  };
}

export { fmtTime };
