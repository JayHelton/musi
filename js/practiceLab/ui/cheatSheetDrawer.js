// The shared parts of a technique cheat sheet.
//
// Two sheets use this: the harsh-vocal sheet and the clean-vocal sheet. Both
// are a slide-over drawer with tabs, both draw the same card, table, and list
// shapes, and both keep whatever runs underneath exactly as it was. Only the
// content differs, so only the content lives in the two view files.
//
// Every id this module writes carries the caller's `idPrefix`. The Vocal view
// holds both sheets at the same time, so two drawers with the same tab ids
// would collide without it.

import { el, tabBar } from './dom.js';

/**
 * One label/text row of a card. When the value is an array, the row becomes a
 * label and a list under it. Activation cues come in sets, and a set reads
 * better as a list than as one long sentence.
 */
function cheatRow(label, value, className = 'pl-cheat-row') {
  if (Array.isArray(value)) {
    return el('div', { class: `${className} pl-cheat-row-list` }, [
      el('b', { class: 'pl-cheat-row-label', text: `${label}:` }),
      el('ul', { class: 'pl-cheat-cues' }, value.map(text => el('li', { text }))),
    ]);
  }
  return el('p', { class: className }, [
    el('b', { class: 'pl-cheat-row-label', text: `${label}: ` }),
    value,
  ]);
}

/**
 * One technique card: a title, a fixed ordered list of label/value rows, and an
 * optional last row that the caution colour marks. A row value is a string, or
 * an array of strings that renders as a list.
 * @param {{ tone: string, title: string, rows: Array<[string, string|string[]]>,
 *   caution?: [string, string]|null }} options
 * @returns {HTMLElement}
 */
export function cheatCard({ tone, title, rows, caution = null }) {
  return el('article', { class: `pl-cheat-card pl-cheat-card-${tone}` }, [
    el('h5', { class: 'pl-cheat-card-title', text: title }),
    ...rows.map(([label, text]) => cheatRow(label, text)),
    caution ? cheatRow(caution[0], caution[1], 'pl-cheat-row pl-cheat-caution') : null,
  ]);
}

/**
 * Build the rows of one card from a field order and a model entry. A field the
 * entry does not carry is left out, so one field order serves cards that answer
 * a different number of questions.
 * @param {Array<[string, string]>} fields Pairs of model key and row label.
 * @param {Object} data
 * @returns {Array<[string, string]>}
 */
export function rowsOf(fields, data) {
  return fields
    .filter(([key]) => {
      const value = data[key];
      return Array.isArray(value) ? value.length > 0 : !!value;
    })
    .map(([key, label]) => [label, data[key]]);
}

/** One heading that separates two card groups inside one panel. */
export function groupHeading(text) {
  return el('h4', { class: 'pl-cheat-group-title', text });
}

/** One list of short rules, under a table or a card group. */
export function rulesList(items) {
  return el('ul', { class: 'pl-cheat-rules' }, items.map(text => el('li', { text })));
}

/** One numbered ladder of steps, each with a name and a detail. */
export function ladderList(steps) {
  return el('ol', { class: 'pl-cheat-ladder' }, steps.map(row => el('li', {}, [
    el('b', { class: 'pl-cheat-ladder-step', text: row.step }),
    el('span', { class: 'pl-cheat-ladder-detail', text: row.detail }),
  ])));
}

/** One list of stop-now signs. */
export function flagList(items) {
  return el('ul', { class: 'pl-cheat-flags' }, items.map(text => el('li', { text })));
}

/**
 * One reference table. The wrapper scrolls sideways, so a long row never
 * crushes the columns next to it.
 * @param {Array<string>} headers
 * @param {Array<Array<string>>} rows
 * @returns {HTMLElement}
 */
export function simpleTable(headers, rows) {
  const table = el('table', { class: 'pl-cheat-table' }, [
    el('thead', {}, [el('tr', {}, headers.map(text => el('th', { text })))]),
    el('tbody', {}, rows.map(cells => el('tr', {}, cells.map(text => el('td', { text }))))),
  ]);
  return el('div', { class: 'pl-cheat-table-wrap' }, [table]);
}

function sourcesFoot(sources) {
  return el('ul', { class: 'pl-cheat-sources' }, sources.map(source => el('li', {}, [
    el('a', {
      href: source.url, target: '_blank', rel: 'noopener noreferrer', text: source.label,
    }),
  ])));
}

/**
 * Build one cheat sheet drawer.
 * @param {{ idPrefix: string, title: string, tabs: Array<{id: string, label: string}>,
 *   panels: Object<string, HTMLElement>, sources: Array<{label: string, url: string}> }} options
 * @returns {{root: HTMLElement, open: Function, close: Function, toggle: Function,
 *   isOpen: Function, stop: Function}}
 */
export function createCheatDrawer({ idPrefix, title, tabs, panels, sources }) {
  const firstTab = tabs[0].id;
  const panelId = id => `pl-cheat-${idPrefix}-panel-${id}`;
  const tabId = id => `pl-cheat-${idPrefix}-tab-${id}`;
  let openTab = '';

  for (const [id, node] of Object.entries(panels)) {
    node.id = panelId(id);
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', tabId(id));
  }

  const body = el('div', { class: 'pl-cheat-drawer-body' }, Object.values(panels));
  body.id = `pl-cheat-${idPrefix}-drawer-body`;

  const closeButton = el('button', {
    type: 'button',
    class: 'pl-cheat-drawer-close',
    text: 'Close',
    on: { click: () => close() },
  });
  closeButton.setAttribute('aria-label', `Close the ${title.toLowerCase()}`);

  const tabRow = tabBar({
    tabs,
    active: firstTab,
    ariaLabel: title,
    panelIdPrefix: `pl-cheat-${idPrefix}-panel-`,
    tabIdPrefix: `pl-cheat-${idPrefix}-tab-`,
    onChange: id => open(id),
  });

  const sheet = el('div', { class: 'pl-cheat-drawer-sheet' }, [
    el('div', { class: 'pl-cheat-drawer-head' }, [
      el('h3', { class: 'pl-cheat-drawer-title', text: title }),
      closeButton,
    ]),
    el('div', { class: 'pl-cheat-drawer-tabrow' }, [tabRow.root]),
    body,
    el('p', { class: 'pl-hint pl-cheat-drawer-sources-label', text: 'Sources' }),
    sourcesFoot(sources),
  ]);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');
  sheet.setAttribute('aria-label', title);

  const backdrop = el('div', {
    class: 'pl-cheat-drawer-backdrop',
    on: { click: () => close() },
  });

  const root = el('div', { class: 'pl-cheat-drawer', hidden: true }, [backdrop, sheet]);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  });

  function paintPanels() {
    for (const [id, node] of Object.entries(panels)) node.hidden = id !== openTab;
  }

  /** Open one tab, or the first tab when the id is unknown. */
  function open(wanted) {
    const id = tabs.some(t => t.id === wanted) ? wanted : firstTab;
    openTab = id;
    root.hidden = false;
    tabRow.setActive(id);
    paintPanels();
    closeButton.focus();
  }

  /** Close the drawer. Whatever is running underneath is untouched. */
  function close() {
    if (!openTab) return;
    openTab = '';
    root.hidden = true;
  }

  /** Open the sheet, or close it when it is already open. */
  function toggle() {
    if (openTab) close();
    else open(firstTab);
  }

  return {
    root,
    open,
    close,
    toggle,
    isOpen: () => !!openTab,
    stop() {
      openTab = '';
      root.hidden = true;
    },
  };
}
