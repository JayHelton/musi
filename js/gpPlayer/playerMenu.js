// Player menu drawer / bottom sheet — view mode + score actions.

import { el } from './dom.js';
import { GPP_VIEW_MODES } from './viewModes.js';

const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

const ICONS = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h10M8 12h10M8 18h6"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5L20 20"/><path d="M8.5 15.5L20 4"/></svg>',
  tracks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
};

function viewLabel(mode) {
  if (mode === 'score') return 'Score';
  if (mode === 'analyze') return 'Analyze';
  return 'Both';
}

function makeMenuRow({ label, ariaLabel, icon, onClick }) {
  return el('button', {
    class: 'gpp-menu-row',
    type: 'button',
    'aria-label': ariaLabel || label,
    onClick,
  }, [
    el('span', { class: 'gpp-menu-row-icon gpp-icon-btn', html: icon }),
    el('span', { class: 'gpp-menu-row-label', text: label }),
  ]);
}

/**
 * @param {HTMLElement} host
 */
export function mountPlayerMenu(host, {
  getViewMode = () => 'score',
  onViewModeChange = null,
  onOpenFile = null,
  onOpenNotes = null,
  onOpenSplit = null,
  onOpenTracks = null,
  onOpenSettings = null,
  headerExtra = null,
} = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    sync() {},
    destroy() {},
    isOpen: () => false,
  };
  if (!host) return noop;

  let openState = false;
  let sheetMode = false;
  let extraNode = headerExtra || null;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer gpp-player-menu-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Player menu',
  });
  const sheet = el('div', {
    class: 'gpp-sheet gpp-player-menu-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Player menu',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body' });

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Menu' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close menu',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Menu' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close menu',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  const viewBtns = {};
  const viewPicker = el('div', {
    class: 'gpp-menu-view-picker',
    role: 'radiogroup',
    'aria-label': 'Player view',
  });
  GPP_VIEW_MODES.forEach((mode) => {
    const label = viewLabel(mode);
    const btn = el('button', {
      class: 'gpp-menu-view-option',
      type: 'button',
      role: 'radio',
      'aria-checked': 'false',
      'aria-label': `${label} view`,
      text: label,
      'data-view': mode,
      onClick: () => {
        onViewModeChange?.(mode);
        close();
      },
    });
    viewBtns[mode] = btn;
    viewPicker.appendChild(btn);
  });

  const actionsGroup = el('div', { class: 'gpp-menu-group gpp-menu-actions' });
  const extraSlot = el('div', { class: 'gpp-menu-extra' });

  const menuBody = el('div', { class: 'gpp-player-menu-body' }, [
    el('div', { class: 'gpp-menu-group' }, [
      el('div', { class: 'gpp-menu-group-title', text: 'View' }),
      viewPicker,
    ]),
    actionsGroup,
    extraSlot,
  ]);

  function rebuildActions() {
    actionsGroup.innerHTML = '';
    actionsGroup.appendChild(el('div', { class: 'gpp-menu-group-title', text: 'Actions' }));
    if (typeof onOpenFile === 'function') {
      actionsGroup.appendChild(makeMenuRow({
        label: 'Open file',
        ariaLabel: 'Open Guitar Pro file',
        icon: ICONS.open,
        onClick: () => {
          close();
          onOpenFile();
        },
      }));
    }
    if (typeof onOpenNotes === 'function') {
      actionsGroup.appendChild(makeMenuRow({
        label: 'Section notes',
        ariaLabel: 'Section notes',
        icon: ICONS.notes,
        onClick: () => {
          close();
          onOpenNotes();
        },
      }));
    }
    if (typeof onOpenSplit === 'function') {
      actionsGroup.appendChild(makeMenuRow({
        label: 'Split into exercises',
        ariaLabel: 'Split score into exercises',
        icon: ICONS.split,
        onClick: () => {
          close();
          onOpenSplit();
        },
      }));
    }
    if (typeof onOpenTracks === 'function') {
      actionsGroup.appendChild(makeMenuRow({
        label: 'Track mixer',
        ariaLabel: 'Track mixer',
        icon: ICONS.tracks,
        onClick: () => {
          close();
          onOpenTracks();
        },
      }));
    }
    if (typeof onOpenSettings === 'function') {
      actionsGroup.appendChild(makeMenuRow({
        label: 'Practice settings',
        ariaLabel: 'Practice settings',
        icon: ICONS.settings,
        onClick: () => {
          close();
          onOpenSettings();
        },
      }));
    }
  }

  function placeExtra() {
    extraSlot.innerHTML = '';
    if (extraNode) extraSlot.appendChild(extraNode);
  }

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (menuBody.parentElement !== target) target.appendChild(menuBody);
  }

  function syncViewPicker() {
    const mode = getViewMode();
    GPP_VIEW_MODES.forEach((m) => {
      const btn = viewBtns[m];
      if (!btn) return;
      const on = mode === m;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function sync() {
    syncViewPicker();
    rebuildActions();
    placeExtra();
  }

  // Portrait phone sheet; landscape uses side drawer (must match gpplayer.css)
  const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  const mq = window.matchMedia(SHEET_MQ);
  const onMq = () => { detectSheetMode(); if (openState) paintOpen(); };
  mq.addEventListener?.('change', onMq);

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() { detectSheetMode(); openState = true; sync(); paintOpen(); }
  function close() { openState = false; paintOpen(); }
  function toggle() { if (openState) close(); else open(); }

  backdrop.addEventListener('click', () => close());
  function onKey(e) { if (e.key === 'Escape' && openState) close(); }
  document.addEventListener('keydown', onKey);

  function setItems({ headerExtra: nextExtra } = {}) {
    if (nextExtra !== undefined) extraNode = nextExtra;
    placeExtra();
  }

  function destroy() {
    mq.removeEventListener?.('change', onMq);
    document.removeEventListener('keydown', onKey);
    if (extraNode?.parentElement) extraNode.remove();
    host.innerHTML = '';
  }

  rebuildActions();
  placeExtra();
  placeBody();
  syncViewPicker();

  return { open, close, toggle, sync, destroy, isOpen: () => openState, setItems };
}

export { GEAR_SVG };
