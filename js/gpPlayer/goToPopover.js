// "Go to" panel: jump to a bar number or a section marker.
//
// This replaces the strip that showed a button for every measure. The strip
// cost a row of score height and it added noise. The transport position shows
// the bar, and this panel opens from it.

import { el } from './dom.js';
import { createPopover } from './popover.js';

/**
 * Build the section list from measure markers.
 * @param {(string|null|undefined)[]} markers
 * @returns {{ index: number, label: string }[]}
 */
export function sectionsFromMarkers(markers = []) {
  const out = [];
  (markers || []).forEach((m, i) => {
    const label = typeof m === 'string' ? m.trim() : '';
    if (label) out.push({ index: i, label });
  });
  return out;
}

/**
 * @param {HTMLElement} overlayHost
 * @param {{
 *   getAnchor: () => HTMLElement|null,
 *   getMeasureCount: () => number,
 *   getCurrentBar: () => number,
 *   getSections: () => { index:number, label:string }[],
 *   onGoTo: (index:number) => void,
 * }} api
 */
export function mountGoToPopover(overlayHost, api = {}) {
  const pop = createPopover(overlayHost, {
    id: 'goto',
    title: 'Go to',
    getAnchor: api.getAnchor,
    align: 'start',
    placement: 'above',
    width: 300,
  });
  if (!pop.body) return pop;

  const barInput = el('input', {
    class: 'gpp-num gpp-goto-input',
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    step: '1',
    'aria-label': 'Bar number',
  });
  const goBtn = el('button', {
    class: 'gpp-btn gpp-btn--primary',
    type: 'button',
    text: 'Go',
    'aria-label': 'Go to bar',
  });
  function submit() {
    const n = Math.round(Number(barInput.value));
    const count = Number(api.getMeasureCount?.()) || 0;
    if (!Number.isFinite(n) || n < 1) return;
    const idx = Math.max(0, Math.min(Math.max(0, count - 1), n - 1));
    api.onGoTo?.(idx);
    pop.close();
  }
  goBtn.addEventListener('click', submit);
  barInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault?.();
      submit();
    }
  });
  const barRow = el('div', { class: 'gpp-goto-row' }, [
    el('label', { class: 'gpp-goto-label', text: 'Bar' }),
    barInput,
    el('span', { class: 'gpp-goto-total' }),
    goBtn,
  ]);

  const sectionTitle = el('div', { class: 'gpp-popover-subtitle', text: 'Sections' });
  const sectionList = el('div', { class: 'gpp-goto-sections', role: 'list' });

  pop.body.append(barRow, sectionTitle, sectionList);

  function sync() {
    const count = Number(api.getMeasureCount?.()) || 0;
    const cur = Number(api.getCurrentBar?.()) || 0;
    barInput.max = String(Math.max(1, count));
    if (typeof document === 'undefined' || document.activeElement !== barInput) {
      barInput.value = String(cur + 1);
    }
    barRow.querySelector('.gpp-goto-total').textContent = count ? `of ${count}` : '';
    sectionList.innerHTML = '';
    const sections = api.getSections?.() || [];
    sectionTitle.hidden = !sections.length;
    sectionList.hidden = !sections.length;
    let active = null;
    for (const s of sections) {
      if (s.index <= cur) active = s;
    }
    for (const s of sections) {
      const row = el('button', {
        class: `gpp-goto-section${active === s ? ' is-current' : ''}`,
        type: 'button',
        role: 'listitem',
        'aria-label': `${s.label}, bar ${s.index + 1}`,
        onClick: () => {
          api.onGoTo?.(s.index);
          pop.close();
        },
      }, [
        el('span', { class: 'gpp-goto-section-label', text: s.label }),
        el('span', { class: 'gpp-goto-section-bar', text: String(s.index + 1) }),
      ]);
      sectionList.appendChild(row);
    }
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
