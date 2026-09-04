// Contextual range toolbar.
//
// A drag on the score marks a range. This bar appears near the range and
// offers one action for each next step: loop it, practice it, add a note, or
// clear it. The bar sits just above the transport, so it never covers the
// notation of the marked bars.

import { el } from './dom.js';
import { icon } from './icons.js';

/** The label for a range of bars: "Bar 32" or "Bars 32–35". */
export function rangeLabel(measureStart, measureEnd) {
  const a = Number(measureStart) + 1;
  const b = Number(measureEnd) + 1;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return a === b ? `Bar ${a}` : `Bars ${a}–${b}`;
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   onLoop: () => void,
 *   onPractice?: () => void,
 *   onNote?: () => void,
 *   onClear: () => void,
 * }} api
 */
export function mountSelectionToolbar(host, api = {}) {
  const noop = { show() {}, hide() {}, isVisible: () => false, destroy() {}, sync() {} };
  if (!host) return noop;

  const bar = el('div', {
    class: 'gpp-selection-toolbar',
    role: 'toolbar',
    'aria-label': 'Marked range',
    hidden: true,
  });
  const label = el('span', { class: 'gpp-selection-label', 'aria-live': 'polite' });
  const loopBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--pill gpp-selection-loop',
    type: 'button',
    'aria-label': 'Loop the marked range',
    title: 'Loop (L)',
    onClick: () => api.onLoop?.(),
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('loop'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Loop' }),
  ]);
  const practiceBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--pill gpp-selection-practice',
    type: 'button',
    'aria-label': 'Practice the marked range',
    title: 'Practice',
    onClick: () => api.onPractice?.(),
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('target'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Practice' }),
  ]);
  if (typeof api.onPractice !== 'function') practiceBtn.hidden = true;
  const noteBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--pill gpp-selection-note',
    type: 'button',
    'aria-label': 'Add a note to the marked range',
    title: 'Add note',
    onClick: () => api.onNote?.(),
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('note'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Note' }),
  ]);
  if (typeof api.onNote !== 'function') noteBtn.hidden = true;
  const clearBtn = el('button', {
    class: 'gpp-tbtn gpp-tbtn--pill gpp-selection-clear',
    type: 'button',
    'aria-label': 'Clear the marked range',
    title: 'Clear (Esc)',
    onClick: () => api.onClear?.(),
  }, [
    el('span', { class: 'gpp-tbtn-icon', html: icon('close'), 'aria-hidden': 'true' }),
    el('span', { class: 'gpp-tbtn-text', text: 'Clear' }),
  ]);
  bar.append(label, loopBtn, practiceBtn, noteBtn, clearBtn);
  host.appendChild(bar);

  let visible = false;

  function show({ measureStart, measureEnd } = {}) {
    label.textContent = rangeLabel(measureStart, measureEnd);
    visible = true;
    bar.hidden = false;
  }

  function hide() {
    if (!visible) return;
    visible = false;
    bar.hidden = true;
  }

  return {
    show,
    hide,
    sync(range) {
      if (range && Number.isFinite(range.measureStart)) show(range);
      else hide();
    },
    isVisible: () => visible,
    element: bar,
    destroy() {
      bar.remove?.();
      if (bar.parentElement) bar.parentElement.removeChild(bar);
    },
  };
}
