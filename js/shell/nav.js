import { openSelectionSheet } from '../selectionSheet.js';
import { CATEGORY_ICONS, TOOL_ICONS, getTool } from '../tools.js';

const MORE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>';

const RAIL_ITEMS = [
  { id: 'tools', label: 'Tools', icon: CATEGORY_ICONS.home, section: 'tools' },
  { id: 'library', label: 'Library', icon: TOOL_ICONS.exercises, section: 'exercises' },
  // SIMPLIFY: Routines dock item hidden.
  // { id: 'routines', label: 'Routines', icon: TOOL_ICONS.routines, section: 'routines' },
  { id: 'settings', label: 'Settings', icon: TOOL_ICONS.musicprefs, section: 'musicprefs' },
];

const BOTTOM_ITEMS = [
  { id: 'tools', label: 'Tools', icon: CATEGORY_ICONS.home, section: 'tools' },
  { id: 'library', label: 'Library', icon: TOOL_ICONS.exercises, section: 'exercises' },
  // SIMPLIFY: Routines dock item hidden.
  // { id: 'routines', label: 'Routines', icon: TOOL_ICONS.routines, section: 'routines' },
  { id: 'more', label: 'More', icon: MORE_ICON, section: 'more' },
];

let showSectionFn = null;
let railEl = null;
let bottomEl = null;

function navHighlightId(sectionId) {
  if (!sectionId || sectionId === 'home' || sectionId === 'tools') return 'tools';
  if (sectionId === 'exercises' || sectionId === 'workbooks') return 'library';
  if (sectionId === 'musicprefs') return 'settings';
  // SIMPLIFY: Routines dock item hidden.
  // if (sectionId === 'routines') return 'routines';
  if (getTool(sectionId)) return 'tools';
  return null;
}

function openMoreSheet() {
  openSelectionSheet({
    title: 'More',
    items: [{ id: 'settings', label: 'Settings' }],
    search: false,
    onSelect: () => {
      if (showSectionFn) showSectionFn('musicprefs');
    },
  });
}

function wireNavAction(item) {
  if (item.section === 'more') {
    return () => openMoreSheet();
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
