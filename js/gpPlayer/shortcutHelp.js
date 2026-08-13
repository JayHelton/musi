// Single shortcut table and help panel for the GP player.

import { el } from './dom.js';

/** @type {{ action: string, keys: string }[]} */
export const GPP_SHORTCUTS = [
  { action: 'Play or pause', keys: 'Space' },
  { action: 'Stop', keys: 'Escape' },
  { action: 'Restart', keys: 'Home' },
  { action: 'Previous bar', keys: '←' },
  { action: 'Next bar', keys: '→' },
  { action: 'Decrease speed', keys: '[' },
  { action: 'Increase speed', keys: ']' },
  { action: 'Decrease tempo by 5 BPM', keys: 'Shift + [' },
  { action: 'Increase tempo by 5 BPM', keys: 'Shift + ]' },
  { action: 'Toggle loop', keys: 'L' },
  { action: 'Clear loop', keys: 'Shift + L' },
  { action: 'Toggle metronome', keys: 'M' },
  { action: 'Toggle count-in', keys: 'C' },
  { action: 'Select track 1–9', keys: '1 – 9' },
  { action: 'Open help', keys: '?' },
  { action: 'Open menu', keys: 'Shift + M' },
];

/**
 * @param {HTMLElement} host
 */
export function mountShortcutHelp(host, { onClose } = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    destroy() {},
    isOpen: () => false,
    detach() {},
  };
  if (!host) return noop;

  let openState = false;
  let sheetMode = false;
  let keyHandler = null;
  let mq = null;
  let onMq = null;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer gpp-help-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Keyboard shortcuts',
  });
  const sheet = el('div', {
    class: 'gpp-sheet gpp-help-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Keyboard shortcuts',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body' });

  const table = el('table', { class: 'gpp-shortcut-table' });
  const tbody = el('tbody');
  for (const row of GPP_SHORTCUTS) {
    tbody.appendChild(el('tr', {}, [
      el('th', { scope: 'row', text: row.action }),
      el('td', {}, [el('kbd', { text: row.keys })]),
    ]));
  }
  table.appendChild(tbody);

  const helpBody = el('div', { class: 'gpp-help-body' }, [table]);

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Keyboard shortcuts' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close help',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Keyboard shortcuts' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        text: '✕',
        'aria-label': 'Close help',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';

  function detectSheetMode() {
    sheetMode = typeof window !== 'undefined' && window.matchMedia(SHEET_MQ).matches;
  }

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (helpBody.parentElement !== target) target.appendChild(helpBody);
  }

  function attachListeners() {
    if (keyHandler) return;
    keyHandler = (e) => {
      if (e.key === 'Escape' && openState) close();
    };
    document.addEventListener('keydown', keyHandler);
    if (typeof window !== 'undefined') {
      mq = window.matchMedia(SHEET_MQ);
      onMq = () => { detectSheetMode(); if (openState) paintOpen(); };
      mq.addEventListener?.('change', onMq);
    }
    backdrop.addEventListener('click', onBackdropClick);
  }

  function onBackdropClick() {
    close();
  }

  function detachListeners() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (mq && onMq) {
      mq.removeEventListener?.('change', onMq);
      mq = null;
      onMq = null;
    }
    backdrop.removeEventListener('click', onBackdropClick);
  }

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() {
    detectSheetMode();
    openState = true;
    attachListeners();
    paintOpen();
  }

  function close() {
    if (!openState) return;
    openState = false;
    paintOpen();
    detachListeners();
    onClose?.();
  }

  function toggle() {
    if (openState) close();
    else open();
  }

  function destroy() {
    detachListeners();
    host.innerHTML = '';
  }

  placeBody();

  return { open, close, toggle, destroy, isOpen: () => openState, detach: detachListeners };
}
