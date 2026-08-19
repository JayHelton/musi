// The practice rail — row two of the transport dock.
//
// It holds the controls a player reaches for between takes: step one measure
// back or forward, and the loop button. Every control carries a word, because
// a bare glyph does not say what it does.
//
// The loop button steps through three modes with each press:
//   1. "Range"  — loop a span of measures. Drag the two markers on the score,
//                 or drag across the measure strip, to move the span.
//   2. "Song"   — loop the whole score.
//   3. "Off"    — no loop. The next press starts at step one again.

import { el } from './dom.js';

const LOOP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
const PREV_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const NEXT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const METRO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l4 18H5L9 3Z"/><path d="m17 9-9 8"/></svg>';

/** Build a rail button with an icon and a word. */
function railButton({ cls = '', icon, label, ariaLabel, title }) {
  return el('button', {
    class: `gpp-practice-btn${cls ? ` ${cls}` : ''}`,
    type: 'button',
    'aria-label': ariaLabel || label,
    title: title || label,
  }, [
    el('span', { class: 'gpp-practice-icon', html: icon, 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-practice-label', text: label }),
  ]);
}

/** The word the loop button shows for a mode. */
export function loopButtonLabel(mode, rangeText = '') {
  if (mode === 'song') return 'Loop song';
  if (mode === 'range') return rangeText ? `Loop ${rangeText}` : 'Loop range';
  return 'Loop off';
}

/**
 * @param {HTMLElement} host
 * @param {object} api
 */
export function mountPracticeRail(host, api = {}) {
  const noop = { sync() {}, destroy() {} };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-practice-rail');

  const prevBtn = railButton({
    cls: 'gpp-practice-prev',
    icon: PREV_ICON,
    label: 'Prev bar',
    ariaLabel: 'Previous measure',
    title: 'Go to the previous measure',
  });
  const nextBtn = railButton({
    cls: 'gpp-practice-next',
    icon: NEXT_ICON,
    label: 'Next bar',
    ariaLabel: 'Next measure',
    title: 'Go to the next measure',
  });
  const loopBtn = railButton({
    cls: 'gpp-practice-loop-btn',
    icon: LOOP_ICON,
    label: 'Loop off',
    ariaLabel: 'Loop',
    title: 'Loop',
  });
  loopBtn.setAttribute('aria-pressed', 'false');
  const metroBtn = railButton({
    cls: 'gpp-practice-metro-btn',
    icon: METRO_ICON,
    label: 'Click',
    ariaLabel: 'Metronome',
    title: 'Metronome click',
  });
  metroBtn.setAttribute('aria-pressed', 'false');

  const loopLabelEl = loopBtn.querySelector('.gpp-practice-label');
  const hintEl = el('span', { class: 'gpp-practice-hint', text: '', hidden: true });
  const overlayEl = el('span', { class: 'gpp-practice-overlay', text: '', hidden: true });

  host.append(prevBtn, nextBtn, loopBtn, metroBtn, hintEl, overlayEl);

  prevBtn.addEventListener('click', () => api.onPrev?.());
  nextBtn.addEventListener('click', () => api.onNext?.());
  loopBtn.addEventListener('click', () => api.onLoopCycle?.());
  metroBtn.addEventListener('click', () => api.onMetroToggle?.());

  function syncLoop() {
    const mode = api.getLoopMode?.() || 'off';
    const rangeTxt = api.getLoopRangeLabel?.() || '';
    const on = mode !== 'off';

    loopLabelEl.textContent = loopButtonLabel(mode, rangeTxt);
    loopBtn.classList.toggle('is-on', on);
    loopBtn.dataset.loopMode = mode;
    loopBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (mode === 'range') {
      loopBtn.title = 'Loop a range. Press again to loop the whole song.';
    } else if (mode === 'song') {
      loopBtn.title = 'Loop the whole song. Press again to turn the loop off.';
    } else {
      loopBtn.title = 'Loop off. Press to loop a range of measures.';
    }

    // The markers only make sense while the range mode holds the score.
    const showHint = mode === 'range';
    hintEl.textContent = showHint ? 'Drag the markers to set the range' : '';
    hintEl.hidden = !showHint;
  }

  function sync() {
    syncLoop();

    prevBtn.disabled = api.canPrev?.() === false;
    nextBtn.disabled = api.canNext?.() === false;

    const metroOn = !!api.getMetroEnabled?.();
    metroBtn.classList.toggle('is-on', metroOn);
    metroBtn.setAttribute('aria-pressed', metroOn ? 'true' : 'false');
    metroBtn.title = metroOn ? 'Metronome click on' : 'Metronome click off';

    const overlayTxt = api.getOverlayLabel?.() || '';
    if (overlayTxt) {
      overlayEl.textContent = overlayTxt;
      overlayEl.hidden = false;
    } else {
      overlayEl.textContent = '';
      overlayEl.hidden = true;
    }
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('gpp-practice-rail');
  }

  sync();

  return { sync, destroy };
}
