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

/** Sticky segmented subview tabs. Persists active tab under settingsKey. */
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
  container.setAttribute('role', 'tablist');
  container.innerHTML = '';

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
    btn.onclick = () => setActive(tab.id);
    container.appendChild(btn);
    buttons.push(btn);
  });

  function setActive(id, { silent } = {}) {
    if (!ids.includes(id)) return;
    active = id;
    if (settingsKey) saveSetting(settingsKey, id);
    buttons.forEach(btn => {
      const on = btn.dataset.id === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll(`[data-subview-for="${container.id}"]`).forEach(panel => {
      const show = panel.dataset.subview === id;
      panel.hidden = !show;
      panel.classList.toggle('active', show);
    });
    if (!silent && typeof onChange === 'function') onChange(id);
  }

  // Initial panel visibility
  setActive(active, { silent: true });

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
    btn.className = 'overflow-menu-item' + (item.danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
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
