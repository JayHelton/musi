import { openSelectionSheet } from '../selectionSheet.js';
import { getSetting } from '../persistence.js';
import { CATEGORY_ICONS, TOOL_ICONS, getTool } from '../tools.js';

const MORE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>';

const RAIL_ITEMS = [
  { id: 'reference', label: 'Reference', icon: CATEGORY_ICONS.reference, section: 'reference' },
  { id: 'library', label: 'Library', icon: TOOL_ICONS.exercises, section: 'library' },
  { id: 'create', label: 'Create', icon: CATEGORY_ICONS.create, section: 'create' },
  { id: 'more', label: 'More', icon: MORE_ICON, section: 'more' },
];

const BOTTOM_ITEMS = [
  { id: 'reference', label: 'Reference', icon: CATEGORY_ICONS.reference, section: 'reference' },
  { id: 'library', label: 'Library', icon: TOOL_ICONS.exercises, section: 'library' },
  { id: 'create', label: 'Create', icon: CATEGORY_ICONS.create, section: 'create' },
  { id: 'more', label: 'More', icon: MORE_ICON, section: 'more' },
];

let showSectionFn = null;
let railEl = null;
let bottomEl = null;

function navHighlightId(sectionId) {
  if (!sectionId) return null;
  if (sectionId === 'reference' || sectionId === 'hub-reference') return 'reference';
  if (sectionId === 'create' || sectionId === 'hub-create') return 'create';
  if (sectionId === 'exercises' || sectionId === 'workbooks') return 'library';

  const tool = getTool(sectionId);
  if (tool) {
    if (tool.category === 'reference') return 'reference';
    if (tool.category === 'create') return 'create';
  }

  if (
    sectionId === 'tools'
    || sectionId === 'routines'
    || sectionId === 'musicprefs'
  ) {
    return 'more';
  }

  if (tool) return 'more';
  return null;
}

function openMoreSheet() {
  openSelectionSheet({
    title: 'More',
    items: [
      { id: 'tools', label: 'Practice tools' },
      { id: 'routines', label: 'Routines' },
      { id: 'settings', label: 'Settings' },
    ],
    search: false,
    onSelect: (id) => {
      if (!showSectionFn) return;
      if (id === 'tools') showSectionFn('tools');
      else if (id === 'routines') showSectionFn('routines');
      else if (id === 'settings') showSectionFn('musicprefs');
    },
  });
}

function openLibraryNav() {
  if (!showSectionFn) return;
  const mode = getSetting('library.tab', 'exercises');
  const tab = mode === 'workbooks' ? 'workbooks' : 'exercises';
  showSectionFn('library', false, { mode: tab });
}

function wireNavAction(item) {
  if (item.section === 'more') {
    return () => openMoreSheet();
  }
  if (item.section === 'library') {
    return () => openLibraryNav();
  }
  return () => {
    if (showSectionFn) showSectionFn(item.section);
  };
}

function buildRail() {
  const rail = document.createElement('nav');
  rail.className = 'app-rail';
  rail.setAttribute('aria-label', 'Primary');

  RAIL_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-rail-item';
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="app-rail-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = wireNavAction(item);
    rail.appendChild(btn);
  });

  return rail;
}

function buildBottom() {
  const bar = document.createElement('nav');
  bar.className = 'app-bottom';
  bar.setAttribute('aria-label', 'Primary');

  BOTTOM_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-bottom-item';
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="app-bottom-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = wireNavAction(item);
    bar.appendChild(btn);
  });

  return bar;
}

export function setActiveNav(sectionId) {
  const active = navHighlightId(sectionId);

  if (railEl) {
    railEl.querySelectorAll('.app-rail-item').forEach(el => {
      el.classList.toggle('active', active && el.dataset.nav === active);
    });
  }
  if (bottomEl) {
    bottomEl.querySelectorAll('.app-bottom-item').forEach(el => {
      el.classList.toggle('active', active && el.dataset.nav === active);
    });
  }
}

export function initShellNav({ showSection, currentId } = {}) {
  showSectionFn = showSection;
  document.body.classList.add('app-shell');

  if (!railEl) {
    railEl = buildRail();
    const splash = document.getElementById('boot-splash');
    if (splash && splash.nextSibling) {
      document.body.insertBefore(railEl, splash.nextSibling);
    } else {
      document.body.insertBefore(railEl, document.body.firstChild);
    }
  }

  if (!bottomEl) {
    bottomEl = buildBottom();
    document.body.appendChild(bottomEl);
  }

  if (currentId) setActiveNav(currentId);
}
