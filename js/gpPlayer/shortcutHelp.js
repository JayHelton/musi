// Single shortcut table and help panel for the GP player.

import { el } from './dom.js';
import { icon } from './icons.js';

/** @type {{ action: string, keys: string }[]} */
export const GPP_SHORTCUTS = [
  { action: 'Play or pause', keys: 'Space' },
  { action: 'Go to the beginning', keys: 'Home / Backspace' },
  { action: 'Previous or next beat', keys: '← / →' },
  { action: 'Previous or next bar', keys: 'Shift + ← / →' },
  { action: 'Tracks', keys: 'T' },
  { action: 'Speed', keys: 'S' },
  { action: 'Loop the marked range on or off', keys: 'L' },
  { action: 'Mute the viewed track', keys: 'M' },
  { action: 'Solo the viewed track', keys: 'Alt + M' },
  { action: 'Count-in on or off', keys: 'C' },
  { action: 'Metronome on or off', keys: 'N' },
  { action: 'Mixer', keys: 'X' },
  { action: 'Follow the playhead / focus mode', keys: 'F' },
  { action: 'Select track 1–9', keys: '1 – 9' },
  { action: 'Close a panel or clear the range', keys: 'Esc' },
  { action: 'This help', keys: '?' },
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

  const helpBody = el('div', { class: 'gpp-help-body' }, [
    el('p', { class: 'gpp-popover-note', text: 'Click a beat to move there. Double-click a beat to play from it. Drag across the score to mark a range.' }),
    table,
  ]);

  function makeHead() {
    return el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Keyboard shortcuts' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close help',
        title: 'Close',
        onClick: () => close(),
      }),
    ]);
  }

  drawer.append(makeHead(), drawerBody);
  sheet.append(makeHead(), sheetBody);
  host.append(backdrop, drawer, sheet);

  const SHEET_MQ = '(max-width: 599px)';

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
