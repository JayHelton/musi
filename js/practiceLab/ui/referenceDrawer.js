// The reference drawer of Composition Lab.
//
// Intervals, Scales, and Chords stay one tap away for the whole session. The
// drawer slides over the workspace, so the exercise underneath keeps every
// answer the player typed. Closing it puts the player back where they were.
//
// The drawer draws nothing of its own. It mounts the three shared reference
// components, the same components the Study reference pages mount.
//
// The drawer never opens on the answer to the current exercise. An exercise
// asks first. A player who wants to look something up still can.

import {
  createIntervalReference, createScaleReferenceCard, createChordReferenceCard, stopChord,
} from '../adapters/musiReference.js';
import { el, tabBar } from './dom.js';

/** The three references, in the order the control row shows them. */
export const REFERENCE_TABS = [
  { id: 'intervals', label: 'Intervals' },
  { id: 'scales', label: 'Scales' },
  { id: 'chords', label: 'Chords' },
];

/**
 * Build the reference drawer.
 * @param {{onOpenChange?: Function}} [handlers]
 * @returns {{root: HTMLElement, open: Function, close: Function, toggle: Function,
 *   render: Function, isOpen: Function, activeTab: Function, stop: Function}}
 */
export function createReferenceDrawer({ onOpenChange } = {}) {
  let openTab = '';
  let context = null;

  const intervals = createIntervalReference({ compact: true });
  const scales = createScaleReferenceCard({ compact: true });
  const chords = createChordReferenceCard({ compact: true, showNeck: true });

  const panels = {
    intervals: intervals.root,
    scales: scales.root,
    chords: chords.root,
  };

  const body = el('div', { class: 'plc-drawer-body' }, Object.values(panels));

  const closeButton = el('button', {
    type: 'button',
    class: 'plc-drawer-close',
    text: 'Close',
    on: { click: () => close() },
  });
  closeButton.setAttribute('aria-label', 'Close the reference');

  const tabs = tabBar({
    tabs: REFERENCE_TABS,
    active: 'intervals',
    ariaLabel: 'References',
    onChange: (id) => open(id),
  });
  tabs.root.querySelectorAll('.pl-tab').forEach((button, index) => {
    const id = REFERENCE_TABS[index].id;
    button.id = `plc-ref-tab-${id}`;
    button.setAttribute('aria-controls', 'plc-drawer-body');
  });
  body.id = 'plc-drawer-body';

  const sheet = el('div', { class: 'plc-drawer-sheet' }, [
    el('div', { class: 'plc-drawer-head' }, [
      el('h3', { class: 'plc-drawer-title', text: 'Reference' }),
      closeButton,
    ]),
    el('div', { class: 'plc-drawer-tabrow' }, [tabs.root]),
    body,
    el('p', {
      class: 'pl-hint plc-drawer-foot',
      text: 'Your exercise stays as you left it. Nothing here is marked as the answer.',
    }),
  ]);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');
  sheet.setAttribute('aria-label', 'Theory reference');

  const backdrop = el('div', {
    class: 'plc-drawer-backdrop',
    on: { click: () => close() },
  });

  const root = el('div', { class: 'plc-drawer', hidden: true }, [backdrop, sheet]);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  });

  function paintPanels() {
    if (!context) return;
    for (const [id, node] of Object.entries(panels)) node.hidden = id !== openTab;
    if (openTab === 'intervals') {
      intervals.render({
        tonic: context.tonic,
        strings: context.strings,
        fretStart: context.fretStart,
        fretEnd: context.fretEnd,
      });
    }
    if (openTab === 'scales') {
      scales.render({
        root: context.tonic,
        scale: context.collection,
        tuning: context.tuning,
        fretStart: context.fretStart,
        fretEnd: context.fretEnd,
      });
    }
    if (openTab === 'chords') {
      chords.render({
        root: context.tonic,
        scale: context.collection,
        tuning: context.tuning,
        fretStart: context.fretStart,
        fretEnd: context.fretEnd,
      });
    }
  }

  /**
   * Give the drawer the current context. It repaints only when it is open, so
   * a context change behind a closed drawer costs nothing.
   * @param {Object} next `tonic`, `collection`, `strings`, `fretStart`, `fretEnd`
   */
  function render(next) {
    context = next;
    if (openTab) paintPanels();
  }

  /** Open one reference. */
  function open(tabId) {
    const id = REFERENCE_TABS.some(t => t.id === tabId) ? tabId : 'intervals';
    const wasOpen = !!openTab;
    openTab = id;
    root.hidden = false;
    tabs.setActive(id);
    paintPanels();
    if (!wasOpen) onOpenChange?.(true, id);
    closeButton.focus();
  }

  /** Close the drawer. The exercise underneath does not change. */
  function close() {
    if (!openTab) return;
    openTab = '';
    root.hidden = true;
    stopChord();
    onOpenChange?.(false, '');
  }

  /** Open a reference, or close it when it is already the open one. */
  function toggle(tabId) {
    if (openTab === tabId) close();
    else open(tabId);
  }

  return {
    root,
    open,
    close,
    toggle,
    render,
    isOpen: () => !!openTab,
    activeTab: () => openTab,
    stop() {
      stopChord();
      openTab = '';
      root.hidden = true;
    },
  };
}
