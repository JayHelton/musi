import { getSetting } from '../persistence.js';
import { CATEGORY_ICONS, TOOL_ICONS, getTool } from '../tools.js';

const SPLIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';

// A wrench. CATEGORY_ICONS.tools is a keyboard, so the bar uses its own icon.
const TOOLS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5a5.5 5.5 0 0 0-5 7.7L3.7 18a2.1 2.1 0 0 0 3 3l6.8-6.8a5.5 5.5 0 0 0 6.6-7.6l-3 3-2.7-2.7 3-3a5.5 5.5 0 0 0-1.9-.4z"/></svg>';

const NAV_ITEMS = [
  { id: 'reference', label: 'Reference', icon: CATEGORY_ICONS.reference, section: 'reference' },
  { id: 'library', label: 'Library', icon: TOOL_ICONS.exercises, section: 'library' },
  { id: 'create', label: 'Create', icon: CATEGORY_ICONS.create, section: 'create' },
  { id: 'tools', label: 'Tools', icon: TOOLS_ICON, section: 'tools' },
];

// The gear shows on the browse pages only. A tool page keeps its own header
// controls in that corner.
const SETTINGS_GEAR_SECTIONS = new Set([
  'tools',
  'hub-reference',
  'hub-create',
  'reference',
  'create',
  'exercises',
  'workbooks',
]);

let showSectionFn = null;
let railEl = null;
let bottomEl = null;
let settingsEl = null;

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

  // Settings has its own gear in the page head. It highlights no bar item.
  if (sectionId === 'musicprefs') return null;

  if (sectionId === 'tools') return 'tools';

  if (tool) return 'tools';
  return null;
}

function openLibraryNav() {
  if (!showSectionFn) return;
  const mode = getSetting('library.tab', 'exercises');
  const tab = mode === 'workbooks' ? 'workbooks' : 'exercises';
  showSectionFn('library', false, { mode: tab });
}

function wireNavAction(item) {
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

  NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-rail-item';
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="app-rail-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = wireNavAction(item);
    rail.appendChild(btn);
  });

  // The split-view control lives at the foot of the rail. js/main.js wires the
  // click and controls the visibility.
  const split = document.createElement('button');
  split.type = 'button';
  split.id = 'split-trigger';
  split.className = 'rail-icon-btn split-trigger';
  split.setAttribute('aria-label', 'Split view');
  split.title = 'Split view';
  split.innerHTML = SPLIT_ICON;
  rail.appendChild(split);

  return rail;
}

function buildBottom() {
  const bar = document.createElement('nav');
  bar.className = 'app-bottom';
  bar.setAttribute('aria-label', 'Primary');

  NAV_ITEMS.forEach(item => {
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

// The gear sits at the top right of the content column, in line with the
// category heading. A click opens Settings.
function buildSettingsGear() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'settings-trigger';
  btn.className = 'shell-settings-btn';
  btn.setAttribute('aria-label', 'Settings');
  btn.title = 'Settings';
  btn.innerHTML = TOOL_ICONS.musicprefs;
  btn.onclick = () => {
    if (showSectionFn) showSectionFn('musicprefs');
  };
  return btn;
}

function syncSettingsGear(sectionId) {
  if (!settingsEl) return;
  const show = SETTINGS_GEAR_SECTIONS.has(sectionId);
  settingsEl.hidden = !show;
  // The body class keeps the heading clear of the gear.
  document.body.classList.toggle('shell-gear-on', show);
}

export function setActiveNav(sectionId) {
  const active = navHighlightId(sectionId);
  syncSettingsGear(sectionId);

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

  if (!settingsEl) {
    settingsEl = buildSettingsGear();
    settingsEl.hidden = true;
    const main = document.querySelector('.app-main');
    if (main) main.appendChild(settingsEl);
    else document.body.appendChild(settingsEl);
  }

  if (currentId) setActiveNav(currentId);
}
