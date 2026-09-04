// Shared UX primitives: setup summary, subview tabs, compact progress,
// overflow menu, filter summary, mobile editor nav helpers.

import { getSetting, saveSetting } from './persistence.js';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Compact setup summary row with changeable chips/fields. */
export function renderSetupSummary(container, fields, { label = 'Setup', onChange } = {}) {
  if (!container) return;
  container.classList.add('setup-summary');
  container.innerHTML = `
    <div class="setup-summary-label">${escapeHtml(label)}</div>
    <div class="setup-summary-fields" role="group" aria-label="${escapeHtml(label)}"></div>
  `;
  const row = container.querySelector('.setup-summary-fields');
  fields.forEach(field => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'setup-chip';
    btn.dataset.key = field.key;
    btn.setAttribute('aria-label', `${field.label || field.key}: ${field.value}. Change`);
    btn.innerHTML = `<span class="setup-chip-value">${escapeHtml(field.value)}</span>${field.hint ? `<span class="setup-chip-hint">${escapeHtml(field.hint)}</span>` : ''}`;
    btn.onclick = () => {
      if (typeof field.onClick === 'function') field.onClick();
      else if (typeof onChange === 'function') onChange(field.key);
    };
    row.appendChild(btn);
  });
}

/**
 * Sticky segmented subview tabs. It keeps the active tab under settingsKey.
 *
 * A tool can hold five or more modes, and a phone has room for two or three.
 * The bar therefore prints the whole label of every tab and scrolls sideways.
 * It never squeezes a label into an ellipsis, because a cut label hides which
 * mode the tab opens. When the labels do not fit, a small button at the right
 * end opens a menu that names every tab, so one tap reaches any mode.
 */
export function initSubviewTabs(container, tabs, {
  settingsKey,
  defaultId,
  onChange,
  className = 'subview-tabs',
} = {}) {
  if (!container || !tabs?.length) return { get active() { return tabs[0]?.id; }, setActive() {} };

  const ids = tabs.map(t => t.id);
  let active = settingsKey
    ? getSetting(settingsKey, defaultId || ids[0], ids)
    : (defaultId || ids[0]);
  if (!ids.includes(active)) active = ids[0];

  container.className = className;
  container.removeAttribute('role');
  container.innerHTML = '';

  // The track holds the tabs and takes the sideways scroll. The bar itself
  // stays still, so the overflow button keeps its place at the right end.
  const track = document.createElement('div');
  track.className = 'subview-tabs-track';
  track.setAttribute('role', 'tablist');
  container.appendChild(track);

  const buttons = [];
  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'subview-tab' + (tab.id === active ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', tab.id === active ? 'true' : 'false');
    btn.dataset.id = tab.id;
    btn.id = `${container.id || 'sub'}-tab-${tab.id}`;
    btn.textContent = tab.label;
    btn.title = tab.label;
    btn.onclick = () => setActive(tab.id);
    track.appendChild(btn);
    buttons.push(btn);
  });

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'subview-tabs-more';
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-label', 'Show every tab');
  more.title = 'Show every tab';
  more.textContent = '▾';
  more.hidden = true;
  more.onclick = () => {
    openOverflowMenu(more, tabs.map(tab => ({
      label: tab.label,
      selected: tab.id === active,
      onClick: () => setActive(tab.id),
    })));
  };
  container.appendChild(more);

  /** Show the overflow button only while the labels do not fit. */
  function syncOverflow() {
    const room = Number(track.clientWidth) || 0;
    const width = Number(track.scrollWidth) || 0;
    const overflowing = room > 0 && width > room + 1;
    more.hidden = !overflowing;
    container.classList.toggle('has-overflow', overflowing);
  }

  /** Scroll the active tab into the middle of the track. */
  function revealActive(btn, { smooth } = {}) {
    if (!btn) return;
    const room = Number(track.clientWidth) || 0;
    const width = Number(track.scrollWidth) || 0;
    if (!room || width <= room + 1) return;
    const target = Math.max(0, Math.min(
      width - room,
      (Number(btn.offsetLeft) || 0) - (room - (Number(btn.clientWidth) || 0)) / 2,
    ));
    if (smooth && typeof track.scrollTo === 'function') {
      track.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      track.scrollLeft = target;
    }
  }

  function setActive(id, { silent } = {}) {
    if (!ids.includes(id)) return;
    active = id;
    if (settingsKey) saveSetting(settingsKey, id);
    let activeBtn = null;
    buttons.forEach(btn => {
      const on = btn.dataset.id === id;
      if (on) activeBtn = btn;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll(`[data-subview-for="${container.id}"]`).forEach(panel => {
      const show = panel.dataset.subview === id;
      panel.hidden = !show;
      panel.classList.toggle('active', show);
    });
    syncOverflow();
    revealActive(activeBtn, { smooth: !silent });
    if (!silent && typeof onChange === 'function') onChange(id);
  }

  // Initial panel visibility
  setActive(active, { silent: true });

  // The bar grows and shrinks with the screen, so the overflow button and the
  // scroll position follow it. A second call on the same bar replaces the
  // watcher of the first call, so the bar keeps one watcher.
  if (container._subviewWatch) {
    container._subviewWatch();
    container._subviewWatch = null;
  }
  const onBarResize = () => {
    syncOverflow();
    revealActive(buttons.find(btn => btn.dataset.id === active));
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(onBarResize);
    observer.observe(container);
    container._subviewWatch = () => observer.disconnect();
  } else if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', onBarResize);
    container._subviewWatch = () => window.removeEventListener('resize', onBarResize);
  }

  return {
    get active() { return active; },
    setActive,
  };
}

/** Compact one-line progress: streak · score · accuracy */
export function renderCompactProgress(el, { streak = 0, correct = 0, total = 0, accuracy = null } = {}) {
  if (!el) return;
  el.classList.add('compact-progress');
  const acc = accuracy != null
    ? accuracy
    : (total > 0 ? Math.round((correct / total) * 100) : 0);
  el.innerHTML = `
    <span class="cp-streak"><span class="cp-streak-val">${streak}</span> streak</span>
    <span class="cp-sep" aria-hidden="true">·</span>
    <span class="cp-score">${correct} / ${total}</span>
    <span class="cp-sep" aria-hidden="true">·</span>
    <span class="cp-acc">${acc}%</span>
  `;
}

/** Overflow / kebab menu. */
let overflowMenuEl = null;
let overflowDismissBound = false;

function onOverflowDocClick(e) {
  if (overflowMenuEl && !overflowMenuEl.contains(e.target)) closeOverflowMenu();
}

function onOverflowDocKey(e) {
  if (e.key === 'Escape') closeOverflowMenu();
}

// The click that opens the menu is still bubbling, so binding the dismiss
// handler synchronously would let that same click close the menu again.
function bindOverflowDismiss() {
  if (overflowDismissBound) return;
  overflowDismissBound = true;
  setTimeout(() => {
    if (!overflowDismissBound) return;
    document.addEventListener('click', onOverflowDocClick);
    document.addEventListener('keydown', onOverflowDocKey);
  }, 0);
}

function unbindOverflowDismiss() {
  overflowDismissBound = false;
  document.removeEventListener('click', onOverflowDocClick);
  document.removeEventListener('keydown', onOverflowDocKey);
}

export function openOverflowMenu(anchorEl, items, { x, y } = {}) {
  // An empty menu would open on nothing, so the caller gets no menu at all.
  if (!Array.isArray(items) || !items.length) return;
  if (!overflowMenuEl) {
    overflowMenuEl = document.createElement('div');
    overflowMenuEl.className = 'overflow-menu';
    overflowMenuEl.setAttribute('role', 'menu');
    document.body.appendChild(overflowMenuEl);
  }

  overflowMenuEl.innerHTML = '';
  items.forEach(item => {
    if (item === '---') {
      const hr = document.createElement('div');
      hr.className = 'overflow-menu-sep';
      overflowMenuEl.appendChild(hr);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'overflow-menu-item'
      + (item.danger ? ' danger' : '')
      + (item.selected ? ' is-selected' : '');
    btn.setAttribute('role', 'menuitem');
    if (item.selected) btn.setAttribute('aria-current', 'true');
    btn.textContent = item.label;
    btn.disabled = !!item.disabled;
    btn.onclick = (e) => {
      e.stopPropagation();
      closeOverflowMenu();
      if (typeof item.onClick === 'function') item.onClick();
    };
    overflowMenuEl.appendChild(btn);
  });

  let left = x;
  let top = y;
  if (anchorEl && (left == null || top == null)) {
    const r = anchorEl.getBoundingClientRect();
    left = r.right - 180;
    top = r.bottom + 6;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - 200));
  top = Math.max(8, Math.min(top, window.innerHeight - 200));
  overflowMenuEl.style.left = left + 'px';
  overflowMenuEl.style.top = top + 'px';
  overflowMenuEl.classList.add('open');
  bindOverflowDismiss();
}

export function closeOverflowMenu() {
  unbindOverflowDismiss();
  if (overflowMenuEl) overflowMenuEl.classList.remove('open');
}

/* ---- Info tip ------------------------------------------------------------
   A screen explains itself in one long paragraph, and that paragraph pushes
   the controls off the first screen. The info tip holds that text instead. A
   small "i" button opens it, and the text closes again on the next click, on
   Escape, or on a scroll. */

let infoTipEl = null;
let infoTipAnchor = null;
let infoTipDismissBound = false;

function onInfoTipDocClick(e) {
  if (infoTipEl && !infoTipEl.contains(e.target) && e.target !== infoTipAnchor) closeInfoTip();
}

function onInfoTipDocKey(e) {
  if (e.key === 'Escape') closeInfoTip();
}

function onInfoTipScroll() {
  closeInfoTip();
}

// The click that opens the tip still bubbles, so the dismiss handler waits one
// turn. Without the wait that same click would close the tip again.
function bindInfoTipDismiss() {
  if (infoTipDismissBound) return;
  infoTipDismissBound = true;
  setTimeout(() => {
    if (!infoTipDismissBound) return;
    document.addEventListener('click', onInfoTipDocClick);
    document.addEventListener('keydown', onInfoTipDocKey);
    // The tip holds a fixed place, so a scroll would leave it behind its
    // button. It closes instead.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('scroll', onInfoTipScroll, true);
    }
  }, 0);
}

function unbindInfoTipDismiss() {
  infoTipDismissBound = false;
  document.removeEventListener('click', onInfoTipDocClick);
  document.removeEventListener('keydown', onInfoTipDocKey);
  if (typeof window !== 'undefined' && window.removeEventListener) {
    window.removeEventListener('scroll', onInfoTipScroll, true);
  }
}

export function closeInfoTip() {
  unbindInfoTipDismiss();
  if (infoTipEl) infoTipEl.classList.remove('open');
  if (infoTipAnchor) infoTipAnchor.setAttribute('aria-expanded', 'false');
  infoTipAnchor = null;
}

/** Place the open tip under its button, and keep it inside the window. */
function placeInfoTip(anchorEl) {
  if (!infoTipEl || !anchorEl?.getBoundingClientRect) return;
  const rect = anchorEl.getBoundingClientRect();
  const width = infoTipEl.offsetWidth || 280;
  const height = infoTipEl.offsetHeight || 160;
  const room = typeof window !== 'undefined' ? window.innerWidth : 360;
  const tall = typeof window !== 'undefined' ? window.innerHeight : 640;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, room - width - 8));
  let top = rect.bottom + 8;
  // The tip goes above the button when the window has no room below it.
  if (top + height > tall - 8) top = Math.max(8, rect.top - height - 8);
  infoTipEl.style.left = `${Math.round(left)}px`;
  infoTipEl.style.top = `${Math.round(top)}px`;
}

/**
 * Open one info tip.
 *
 * @param {HTMLElement} anchorEl the button the tip belongs to
 * @param {string|Node} content the help text, or a node that holds it
 */
export function openInfoTip(anchorEl, content) {
  if (!anchorEl || content == null) return;
  if (!infoTipEl) {
    infoTipEl = document.createElement('div');
    infoTipEl.className = 'info-tip-pop';
    infoTipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(infoTipEl);
  }
  infoTipEl.innerHTML = '';
  if (typeof content === 'string') {
    const text = document.createElement('p');
    text.className = 'info-tip-text';
    text.textContent = content;
    infoTipEl.appendChild(text);
  } else {
    infoTipEl.appendChild(content);
  }
  infoTipEl.classList.add('open');
  infoTipAnchor = anchorEl;
  anchorEl.setAttribute('aria-expanded', 'true');
  placeInfoTip(anchorEl);
  bindInfoTipDismiss();
}

/**
 * Build the "i" button that holds one piece of help text.
 *
 * The button carries the text, so the caller only places the button. A node
 * moves into the tip as it is, which keeps any markup the help text holds.
 *
 * @param {string|Node|(() => string|Node)} content the help, or a maker for it
 * @param {{ label?: string }} [options] `label` names the help for a reader
 * @returns {HTMLButtonElement}
 */
export function createInfoTip(content, { label = 'About this screen' } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'info-tip';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', 'false');
  btn.title = label;
  btn.textContent = 'i';
  btn.onclick = (e) => {
    // The tip closes on the next click anywhere, so this click must not reach
    // the page and close the tip it just opened.
    e?.stopPropagation?.();
    if (infoTipAnchor === btn) {
      closeInfoTip();
      return;
    }
    closeInfoTip();
    openInfoTip(btn, typeof content === 'function' ? content() : content);
  };
  return btn;
}

/**
 * Replace one help paragraph with an info tip.
 *
 * The paragraph moves into the tip, so the words stay the same and the screen
 * loses the block of text. The button lands where the caller asks, or in the
 * place the paragraph held.
 *
 * @param {HTMLElement} paragraph the help paragraph
 * @param {{ mount?: HTMLElement, label?: string }} [options]
 * @returns {HTMLButtonElement|null} null when there is no paragraph to move
 */
export function infoTipFromElement(paragraph, { mount, label } = {}) {
  if (!paragraph) return null;
  const host = mount || paragraph.parentNode;
  if (!host) return null;
  const holder = document.createElement('div');
  holder.className = 'info-tip-body';
  const btn = createInfoTip(() => {
    // The tip owns one copy of the help, so a second open finds it again.
    holder.appendChild(paragraph);
    paragraph.hidden = false;
    return holder;
  }, { label: label || 'Help' });
  if (mount) mount.appendChild(btn);
  else host.insertBefore(btn, paragraph);
  paragraph.hidden = true;
  return btn;
}

/** Compact filter summary chip that opens a filters sheet. */
export function renderFilterSummary(el, { summary, activeCount = 0, resultCount, onClick } = {}) {
  if (!el) return;
  el.classList.add('filter-summary');
  el.innerHTML = `
    <button type="button" class="filter-summary-btn">
      <span class="filter-summary-text">${escapeHtml(summary || 'Filters')}</span>
      ${activeCount > 0 ? `<span class="filter-summary-count">${activeCount}</span>` : ''}
      ${resultCount != null ? `<span class="filter-summary-results">${resultCount}</span>` : ''}
    </button>
  `;
  el.querySelector('button').onclick = () => { if (onClick) onClick(); };
}

/** Mobile list↔editor navigation helper. */
export function setEditorNavState(root, state) {
  if (!root) return;
  root.dataset.navState = state; // 'list' | 'editor'
  root.classList.toggle('nav-list', state === 'list');
  root.classList.toggle('nav-editor', state === 'editor');
}

/** Flip a section's mobile master-detail view between its list and its editor. */
export function setMasterDetailView(sectionId, state) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  const root = sec.querySelector('.mobile-master-detail') || sec;
  setEditorNavState(root, state);
}

/** Apply drill focus mode class to a section. */
export function setDrillFocus(sectionEl, focused) {
  if (!sectionEl) return;
  sectionEl.classList.toggle('drill-focus', !!focused);
}

/** Wire a "Change" / gear button that opens a setup sheet built by caller. */
export function wireSetupTrigger(btn, openFn) {
  if (!btn) return;
  btn.onclick = (e) => {
    e.preventDefault();
    openFn();
  };
}
