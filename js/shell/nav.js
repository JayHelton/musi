// App shell navigation.
//
// The primary bar holds the four product areas: Train, Study, Create, and
// Library. Utilities are subordinate: they live behind one compact button
// that opens a small menu. The same item list drives the desktop rail and
// the phone bottom bar.

import { AREAS, AREA_ICONS, TOOL_ICONS, getTool, utilityTools } from '../tools.js';
import { openOverflowMenu } from '../uxPrimitives.js';
import { initContextQuick, syncContextQuick } from './contextQuick.js';

const SPLIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';

/** The four primary areas, in product order. */
export const PRIMARY_NAV_ITEMS = AREAS.map(area => ({
  id: area.id,
  label: area.label,
  icon: AREA_ICONS[area.icon] || '',
}));

/** Utilities never appear as a primary item. */
export function utilityNavItems() {
  return utilityTools().map(tool => ({ id: tool.id, label: tool.label }));
}

// The gear shows on every screen except Settings itself.
const SETTINGS_GEAR_HIDDEN_SECTIONS = new Set(['settings']);

let showSectionFn = null;
let railEl = null;
let bottomEl = null;
let settingsEl = null;
let actionsEl = null;

/**
 * The primary nav item to highlight for a screen.
 * @param {string} screenId an area id or a tool id
 * @returns {string|null}
 */
export function navHighlightId(screenId) {
  if (!screenId) return null;
  if (PRIMARY_NAV_ITEMS.some(item => item.id === screenId)) return screenId;

  const tool = getTool(screenId);
  if (!tool) return null;
  // Utilities are subordinate, so they light up no primary item.
  if (tool.utility) return null;
  return tool.area;
}

function openUtilityMenu(trigger) {
  openOverflowMenu(trigger, utilityNavItems().map(item => ({
    label: item.label,
    onClick: () => { if (showSectionFn) showSectionFn(item.id); },
  })));
}

function buildUtilityButton(className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.dataset.nav = 'utilities';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-label', 'Utilities');
  btn.title = 'Utilities';
  btn.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${AREA_ICONS.utility}</span><span class="app-nav-util-label">Tools</span>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    openUtilityMenu(btn);
  };
  return btn;
}

function buildRail() {
  const rail = document.createElement('nav');
  rail.className = 'app-rail';
  rail.setAttribute('aria-label', 'Primary');

  PRIMARY_NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-rail-item';
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="app-rail-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = () => { if (showSectionFn) showSectionFn(item.id); };
    rail.appendChild(btn);
  });

  const foot = document.createElement('div');
  foot.className = 'app-rail-foot';
  foot.appendChild(buildUtilityButton('rail-icon-btn app-rail-util'));

  // The split-view control lives at the foot of the rail. js/main.js wires the
  // click and controls the visibility.
  const split = document.createElement('button');
  split.type = 'button';
  split.id = 'split-trigger';
  split.className = 'rail-icon-btn split-trigger';
  split.setAttribute('aria-label', 'Split view');
  split.title = 'Split view';
  split.innerHTML = SPLIT_ICON;
  foot.appendChild(split);
  rail.appendChild(foot);

  return rail;
}

function buildBottom() {
  const bar = document.createElement('nav');
  bar.className = 'app-bottom';
  bar.setAttribute('aria-label', 'Primary');

  PRIMARY_NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-bottom-item';
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="app-bottom-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = () => { if (showSectionFn) showSectionFn(item.id); };
    bar.appendChild(btn);
  });

  bar.appendChild(buildUtilityButton('app-bottom-util'));
  return bar;
}

// The gear sits at the right end of the head action row. A click opens
// Settings.
function buildSettingsGear() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'settings-trigger';
  btn.className = 'shell-settings-btn';
  btn.setAttribute('aria-label', 'Settings');
  btn.title = 'Settings';
  btn.innerHTML = TOOL_ICONS.settings;
  btn.onclick = () => {
    if (showSectionFn) showSectionFn('settings');
  };
  return btn;
}

// The head actions hold the quick context button and the settings gear. The
// row keeps the top right corner of the content column on every screen.
function buildHeadActions() {
  const row = document.createElement('div');
  row.className = 'shell-head-actions';
  return row;
}

// Publish the height of the action band. The content column adds that height
// to its top padding, so the screen starts below the row. The gear then keeps
// one place in the top right corner and never touches the corner of a panel.
// A hidden row measures as zero, which gives the content the full height back.
function syncActionsHeight() {
  if (!actionsEl || typeof actionsEl.getBoundingClientRect !== 'function') return;
  const rect = actionsEl.getBoundingClientRect();
  const height = Math.ceil(rect.height || 0);
  document.body.style.setProperty('--shell-actions-h', height ? `${height + 12}px` : '0px');
}

function syncHeadActions(sectionId) {
  const showGear = !!sectionId && !SETTINGS_GEAR_HIDDEN_SECTIONS.has(sectionId);
  if (settingsEl) settingsEl.hidden = !showGear;

  const showContext = syncContextQuick(sectionId);
  const show = showGear || showContext;
  if (actionsEl) actionsEl.hidden = !show;
  document.body.classList.toggle('shell-gear-on', show);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncActionsHeight);
  else syncActionsHeight();
}

export function setActiveNav(sectionId) {
  const active = navHighlightId(sectionId);
  syncHeadActions(sectionId);

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

  if (!actionsEl) {
    actionsEl = buildHeadActions();
    actionsEl.hidden = true;
    settingsEl = buildSettingsGear();
    settingsEl.hidden = true;
    actionsEl.append(initContextQuick({ showSection }), settingsEl);
    const main = document.querySelector('.app-main');
    if (main) main.appendChild(actionsEl);
    else document.body.appendChild(actionsEl);
    window.addEventListener('resize', syncActionsHeight);
    // A screen can hide the row after the fact. The Score Player does that
    // when a score fills the view. The observer gives the height back to the
    // content column at that moment.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => syncActionsHeight()).observe(actionsEl);
    }
  }

  if (currentId) setActiveNav(currentId);
}
