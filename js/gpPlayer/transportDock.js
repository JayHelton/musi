// Transport dock — a collapsible container over the score.
//
// Row one always shows: the tempo in BPM, one play and pause button, and
// restart. That is the set a player needs while the hands are on the
// instrument. A toggle at the end of row one opens row two.
//
// Row two holds the extra controls the host adds (the workbook puts the
// previous and next exercise buttons there), and then the practice rail:
// previous measure, next measure, the loop button, the metronome, and the
// player menu. The menu button sits outside the scrolling part of the row, so
// it keeps one place.

import { el } from './dom.js';
import { GPP_MIN_BPM, GPP_MAX_BPM } from './tempoRange.js';

export const GPP_TRANSPORT_BPM_STEP = 5;

const CHEVRON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

const EXPANDED_KEY = 'gpp:dock:expanded';

/** Read the saved open state of row two. The dock opens by default. */
function readExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw === '0') return false;
    return true;
  } catch (e) {
    return true;
  }
}

function writeExpanded(on) {
  try {
    localStorage.setItem(EXPANDED_KEY, on ? '1' : '0');
  } catch (e) { /* storage is off */ }
}

/**
 * @param {HTMLElement} host
 * @param {object} api
 */
export function mountTransportDock(host, api = {}) {
  const noop = { sync() {}, publishPad() {}, destroy() {}, isExpanded: () => false };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-transport-anchor');

  let expanded = readExpanded();

  const dock = el('div', { class: 'gpp-transport-dock' });
  host.appendChild(dock);

  const rowPrimary = el('div', { class: 'gpp-transport-row-primary' });
  const rowPractice = el('div', { class: 'gpp-transport-row-practice' });

  const playBtn = el('button', {
    class: 'gpp-transport-btn is-primary',
    type: 'button',
    text: '▶',
    'aria-label': 'Play',
    title: 'Play',
  });
  const restartBtn = el('button', {
    class: 'gpp-transport-btn',
    type: 'button',
    text: '↺',
    'aria-label': 'Restart',
    title: 'Restart from the top',
  });

  // The tempo group names its own number. A bare number in a row of buttons
  // does not say what it counts.
  const bpmDownBtn = el('button', {
    class: 'gpp-transport-btn gpp-tempo-step',
    type: 'button',
    text: '−',
    'aria-label': `Decrease tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Slower by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmInput = el('input', {
    class: 'gpp-tempo-input',
    type: 'number',
    inputmode: 'numeric',
    min: String(GPP_MIN_BPM),
    max: String(GPP_MAX_BPM),
    step: '1',
    'aria-label': 'Tempo in BPM',
  });
  const bpmUpBtn = el('button', {
    class: 'gpp-transport-btn gpp-tempo-step',
    type: 'button',
    text: '+',
    'aria-label': `Increase tempo by ${GPP_TRANSPORT_BPM_STEP} BPM`,
    title: `Faster by ${GPP_TRANSPORT_BPM_STEP} BPM`,
  });
  const bpmField = el('div', { class: 'gpp-tempo-field' }, [
    bpmInput,
    el('span', { class: 'gpp-tempo-unit', text: 'BPM', 'aria-hidden': 'true' }),
  ]);
  const tempoGroup = el('div', { class: 'gpp-transport-tempo' }, [bpmDownBtn, bpmField, bpmUpBtn]);

  const timeEl = el('span', { class: 'gpp-transport-time', text: '0:00 / 0:00' });
  const rampChip = el('span', { class: 'gpp-ramp-chip', text: '', hidden: true });

  const expandBtn = el('button', {
    class: 'gpp-transport-btn gpp-transport-expand-btn',
    type: 'button',
    'aria-label': 'More controls',
    title: 'More controls',
    'aria-expanded': 'false',
    html: CHEVRON_DOWN,
  });

  const menuBtn = el('button', {
    class: 'gpp-transport-btn gpp-transport-menu-btn',
    type: 'button',
    'aria-label': 'Player menu',
    title: 'Player menu',
    'aria-expanded': 'false',
    html: GEAR_SVG,
  });

  // The row one controls scroll sideways when they do not fit. The toggle
  // stays out of that scroller, so it keeps one place at the end of the row.
  const controlScroll = el('div', { class: 'gpp-transport-scroll' });
  controlScroll.append(restartBtn, playBtn, tempoGroup, timeEl, rampChip);
  rowPrimary.append(controlScroll, expandBtn);

  if (api.extraNode) {
    dock.classList.add('has-extra');
    const extraGroup = el('div', { class: 'gpp-transport-extra' });
    extraGroup.appendChild(api.extraNode);
    rowPractice.appendChild(extraGroup);
  }

  if (api.practiceRailNode) {
    rowPractice.appendChild(api.practiceRailNode);
  }
  // The menu button sits outside the practice rail for the same reason.
  rowPractice.appendChild(menuBtn);

  dock.append(rowPrimary, rowPractice);

  playBtn.addEventListener('click', () => api.onPlayPause?.());
  restartBtn.addEventListener('click', () => api.onRestart?.());
  bpmDownBtn.addEventListener('click', () => api.onBpmStep?.(-GPP_TRANSPORT_BPM_STEP));
  bpmUpBtn.addEventListener('click', () => api.onBpmStep?.(GPP_TRANSPORT_BPM_STEP));
  bpmInput.addEventListener('change', () => api.onBpmInput?.(bpmInput.value));
  menuBtn.addEventListener('click', () => api.onOpenMenu?.());
  expandBtn.addEventListener('click', () => setExpanded(!expanded));

  let ro = null;

  function paintExpanded() {
    dock.classList.toggle('is-expanded', expanded);
    rowPractice.hidden = !expanded;
    expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    expandBtn.classList.toggle('is-on', expanded);
    const label = expanded ? 'Fewer controls' : 'More controls';
    expandBtn.setAttribute('aria-label', label);
    expandBtn.title = label;
  }

  function setExpanded(on) {
    const want = !!on;
    if (want === expanded) return;
    expanded = want;
    writeExpanded(expanded);
    paintExpanded();
    publishPad();
    api.onExpandedChange?.(expanded);
  }

  function publishPad() {
    const root = host.closest('.gpp-root');
    if (!root) return;
    const h = Math.ceil(dock.getBoundingClientRect().height);
    const gap = 10;
    root.style.setProperty('--gpp-transport-pad', `${h + gap}px`);
  }

  function syncTempo() {
    const bpm = Math.round(Number(api.getBpm?.()) || 0);
    const scoreBpm = Math.round(Number(api.getScoreBpm?.()) || 0);
    if (typeof document !== 'undefined' && document.activeElement !== bpmInput) {
      bpmInput.value = String(bpm);
    }
    const pct = scoreBpm ? Math.round((bpm / scoreBpm) * 100) : 100;
    bpmInput.title = scoreBpm
      ? `Tempo: ${bpm} BPM · ${pct}% of the score tempo ${scoreBpm} BPM`
      : `Tempo: ${bpm} BPM`;
    tempoGroup.classList.toggle('is-changed', !!scoreBpm && bpm !== scoreBpm);
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

    const menuOpen = !!api.isMenuOpen?.();
    menuBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    menuBtn.classList.toggle('is-on', menuOpen);

    syncTempo();
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

  paintExpanded();
  sync();
  requestAnimationFrame(publishPad);

  return {
    sync,
    publishPad,
    destroy,
    isExpanded: () => expanded,
    setExpanded,
  };
}
