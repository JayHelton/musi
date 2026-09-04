// A small anchored panel for the player.
//
// On a wide screen the panel opens beside its opener. On a compact screen the
// same panel opens as a bottom sheet. One popover is open at a time; the
// player's panel manager closes the others. The panel manages focus: it moves
// focus inside on open, closes on Escape and on an outside pointer, and gives
// focus back to the opener on close.

import { el } from './dom.js';
import { icon } from './icons.js';

export const GPP_COMPACT_MQ = '(max-width: 599px)';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function matchesCompact() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return !!window.matchMedia(GPP_COMPACT_MQ).matches;
  } catch (e) {
    return false;
  }
}

/**
 * @param {HTMLElement} host the overlay host the panel mounts in
 * @param {{
 *   id: string,
 *   title?: string,
 *   ariaLabel?: string,
 *   className?: string,
 *   getAnchor?: () => HTMLElement|null,
 *   align?: 'start'|'center'|'end',
 *   placement?: 'above'|'below',
 *   width?: number,
 *   onOpen?: () => void,
 *   onClose?: () => void,
 *   closeOnOutside?: boolean,
 * }} opts
 */
export function createPopover(host, {
  id = 'popover',
  title = '',
  ariaLabel = title || id,
  className = '',
  getAnchor = null,
  align = 'center',
  placement = 'above',
  width = 300,
  onOpen = null,
  onClose = null,
  closeOnOutside = true,
} = {}) {
  const noop = {
    open() {}, close() {}, toggle() {}, isOpen: () => false, destroy() {}, detach() {},
    body: null, setTitle() {}, reposition() {},
  };
  if (!host) return noop;

  let openState = false;
  let opener = null;
  let keyHandler = null;
  let outsideHandler = null;
  let resizeHandler = null;

  const root = el('div', {
    class: `gpp-popover-root gpp-popover-root--${id}${className ? ` ${className}` : ''}`,
    'data-popover': id,
  });
  const backdrop = el('div', { class: 'gpp-popover-backdrop', 'aria-hidden': 'true' });
  const panel = el('div', {
    class: 'gpp-popover',
    role: 'dialog',
    'aria-label': ariaLabel,
    'aria-modal': 'false',
    tabindex: '-1',
  });
  const handle = el('div', { class: 'gpp-popover-handle', 'aria-hidden': 'true' });
  const titleEl = el('div', { class: 'gpp-popover-title', text: title });
  const closeBtn = el('button', {
    class: 'gpp-icon-btn gpp-popover-close',
    type: 'button',
    'aria-label': `Close ${title || 'panel'}`,
    title: 'Close',
    html: icon('close'),
    onClick: () => close(),
  });
  const head = el('div', { class: 'gpp-popover-head' }, [titleEl, closeBtn]);
  if (!title) head.classList.add('is-untitled');
  const body = el('div', { class: 'gpp-popover-body' });
  panel.append(handle, head, body);
  root.append(backdrop, panel);
  root.hidden = true;
  host.appendChild(root);

  function firstFocusable() {
    const list = panel.querySelectorAll?.(FOCUSABLE) || [];
    for (const node of list) {
      if (node !== closeBtn) return node;
    }
    return closeBtn;
  }

  function reposition() {
    if (!openState) return;
    const compact = matchesCompact();
    root.classList.toggle('is-sheet', compact);
    if (compact) {
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
      panel.style.removeProperty('bottom');
      panel.style.removeProperty('width');
      return;
    }
    const anchor = typeof getAnchor === 'function' ? getAnchor() : opener;
    const hostRect = host.getBoundingClientRect?.();
    if (!anchor?.getBoundingClientRect || !hostRect) return;
    const a = anchor.getBoundingClientRect();
    const hostW = hostRect.width || 0;
    const hostH = hostRect.height || 0;
    const w = Math.min(width, Math.max(200, hostW - 16));
    let left;
    if (align === 'start') left = a.left - hostRect.left;
    else if (align === 'end') left = a.right - hostRect.left - w;
    else left = a.left - hostRect.left + a.width / 2 - w / 2;
    left = Math.max(8, Math.min(hostW - w - 8, left));
    panel.style.width = `${w}px`;
    panel.style.left = `${Math.round(left)}px`;
    if (placement === 'below') {
      panel.style.top = `${Math.round(a.bottom - hostRect.top + 6)}px`;
      panel.style.removeProperty('bottom');
    } else {
      panel.style.bottom = `${Math.round(hostH - (a.top - hostRect.top) + 6)}px`;
      panel.style.removeProperty('top');
    }
  }

  function attach() {
    if (keyHandler) return;
    keyHandler = (e) => {
      if (e.key === 'Escape' && openState) {
        e.stopPropagation?.();
        e.preventDefault?.();
        close();
      }
    };
    document.addEventListener('keydown', keyHandler, true);
    if (closeOnOutside) {
      outsideHandler = (e) => {
        if (!openState) return;
        const t = e.target;
        if (panel.contains?.(t)) return;
        if (opener && (opener === t || opener.contains?.(t))) return;
        close();
      };
      document.addEventListener('pointerdown', outsideHandler, true);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      resizeHandler = () => reposition();
      window.addEventListener('resize', resizeHandler);
    }
  }

  function detach() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (outsideHandler) {
      document.removeEventListener('pointerdown', outsideHandler, true);
      outsideHandler = null;
    }
    if (resizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  }

  function open(openerEl = null) {
    if (openState) {
      reposition();
      return;
    }
    openState = true;
    opener = openerEl || (typeof getAnchor === 'function' ? getAnchor() : null);
    root.hidden = false;
    root.classList.add('is-open');
    opener?.setAttribute?.('aria-expanded', 'true');
    reposition();
    attach();
    onOpen?.();
    const target = firstFocusable();
    try { target?.focus?.({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function close() {
    if (!openState) return;
    openState = false;
    root.classList.remove('is-open');
    root.hidden = true;
    detach();
    const back = opener;
    opener?.setAttribute?.('aria-expanded', 'false');
    opener = null;
    onClose?.();
    try { back?.focus?.({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function toggle(openerEl = null) {
    if (openState) close();
    else open(openerEl);
  }

  function setTitle(text) {
    titleEl.textContent = text || '';
    head.classList.toggle('is-untitled', !text);
  }

  backdrop.addEventListener('click', () => close());

  return {
    open,
    close,
    toggle,
    isOpen: () => openState,
    detach,
    destroy() {
      detach();
      root.remove?.();
      if (root.parentElement) root.parentElement.removeChild(root);
    },
    body,
    panel,
    root,
    setTitle,
    reposition,
  };
}
