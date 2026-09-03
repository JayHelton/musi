// The harsh-vocal cheat sheet drawer.
//
// Same shape as `referenceDrawer.js`: a slide-over sheet that keeps whatever
// is running underneath — a Cue Runner mid-warm-up — exactly as it was.
// Unlike the reference drawer, this content is static: no shared musical
// context to render against, so there is no `render()` step, only tabs.
//
// Every technique card goes through `cheatCard()`. The model holds the text
// and the model holds no labels, so each card group below owns its own field
// order and its own row labels.

import { el, tabBar, notice } from './dom.js';
import {
  HARSH_CHEAT_TABS,
  WARM_UP_LADDER,
  MECHANISM_MAP,
  FALSE_CORD_REGISTERS,
  SUPRAGLOTTIC_SOURCES,
  TRUE_CORD_HIGHS,
  HYBRID_SCREAM,
  TONGUE_TONE_TABLE,
  TONGUE_RULES,
  GUTTURAL_LOWS,
  GUTTURAL_RULES,
  RED_FLAGS,
  CHEAT_SHEET_SOURCES,
} from '../model/harshCheatSheet.js';

function ladderList(steps) {
  const list = el('ol', { class: 'pl-cheat-ladder' });
  steps.forEach((row) => {
    list.appendChild(el('li', {}, [
      el('b', { class: 'pl-cheat-ladder-step', text: row.step }),
      el('span', { class: 'pl-cheat-ladder-detail', text: row.detail }),
    ]));
  });
  return list;
}

/** One list of short rules, under a table or a card group. */
function rulesList(items) {
  return el('ul', { class: 'pl-cheat-rules' }, items.map(text => el('li', { text })));
}

/** One heading that separates two card groups inside one panel. */
function groupHeading(text) {
  return el('h4', { class: 'pl-cheat-group-title', text });
}

function cheatRow(label, text, className = 'pl-cheat-row') {
  return el('p', { class: className }, [
    el('b', { class: 'pl-cheat-row-label', text: `${label}: ` }),
    text,
  ]);
}

/**
 * One technique card. Every card on the sheet has the same shape: a title, a
 * fixed ordered list of label/text rows, and an optional last row that the
 * caution colour marks.
 * @param {{ tone: string, title: string, rows: Array<[string, string]>,
 *   caution?: [string, string]|null }} options
 * @returns {HTMLElement}
 */
function cheatCard({ tone, title, rows, caution = null }) {
  return el('article', { class: `pl-cheat-card pl-cheat-card-${tone}` }, [
    el('h5', { class: 'pl-cheat-card-title', text: title }),
    ...rows.map(([label, text]) => cheatRow(label, text)),
    caution ? cheatRow(caution[0], caution[1], 'pl-cheat-row pl-cheat-caution') : null,
  ]);
}

/** Build the rows of one card from a field order and a model entry. */
function rowsOf(fields, data) {
  return fields.map(([key, label]) => [label, data[key]]);
}

function simpleTable(headers, rows) {
  const table = el('table', { class: 'pl-cheat-table' }, [
    el('thead', {}, [el('tr', {}, headers.map(text => el('th', { text })))]),
    el('tbody', {}, rows.map(cells => el('tr', {}, cells.map(text => el('td', { text }))))),
  ]);
  return el('div', { class: 'pl-cheat-table-wrap' }, [table]);
}

function mechanismTable() {
  return simpleTable(
    ['Sound', 'What vibrates', 'Where it is on this sheet'],
    MECHANISM_MAP.map(row => [row.sound, row.vibrates, row.sits]),
  );
}

function tongueTable() {
  return simpleTable(
    ['Tongue position', 'Vowel', 'Effect', 'Pairs with'],
    TONGUE_TONE_TABLE.map(row => [row.position, row.vowel, row.effect, row.pairsWith]),
  );
}

const REGISTER_FIELDS = [
  ['activation', 'Activation'],
  ['placement', 'Placement'],
  ['mouth', 'Mouth & tongue'],
  ['breath', 'Breath'],
  ['feelsLike', 'Feels like'],
];

function registerCard(register, data) {
  return cheatCard({
    tone: register,
    title: data.label,
    rows: rowsOf(REGISTER_FIELDS, data),
  });
}

const TRUE_CORD_FIELDS = [
  ['whatItIs', 'What it is'],
  ['warmIntoLast', 'Warm into this last'],
  ['activation', 'Activation'],
  ['ridingIt', 'Riding it'],
  ['placement', 'Placement'],
  ['breath', 'Breath'],
];

function trueCordCard(data) {
  return cheatCard({
    tone: 'truecord',
    title: data.label,
    rows: rowsOf(TRUE_CORD_FIELDS, data),
    caution: ['Hard stop', data.hardStop],
  });
}

const SUPRAGLOTTIC_FIELDS = [
  ['whatVibrates', 'What vibrates'],
  ['soundsLike', 'Sounds like'],
  ['findIt', 'Find it'],
  ['feelsLike', 'Feels like'],
];

function supraglotticCards() {
  return SUPRAGLOTTIC_SOURCES.map(entry => cheatCard({
    tone: entry.tone,
    title: entry.label,
    rows: rowsOf(SUPRAGLOTTIC_FIELDS, entry),
    caution: ['Watch for', entry.watchFor],
  }));
}

const HYBRID_FIELDS = [
  ['whatItIs', 'What it is'],
  ['prerequisite', 'Learn these first'],
  ['soundsLike', 'Sounds like'],
  ['activation', 'Activation'],
  ['feelsLike', 'Feels like'],
];

function hybridCard() {
  return cheatCard({
    tone: HYBRID_SCREAM.tone,
    title: HYBRID_SCREAM.label,
    rows: rowsOf(HYBRID_FIELDS, HYBRID_SCREAM),
    caution: ['Watch for', HYBRID_SCREAM.watchFor],
  });
}

const GUTTURAL_FIELDS = [
  ['whatItIs', 'What it is'],
  ['shape', 'Shape'],
  ['activation', 'Activation'],
  ['feelsLike', 'Feels like'],
];

function lowsCards() {
  return GUTTURAL_LOWS.map(entry => cheatCard({
    tone: entry.tone,
    title: entry.label,
    rows: rowsOf(GUTTURAL_FIELDS, entry),
    caution: ['Watch for', entry.watchFor],
  }));
}

function redFlagList() {
  const list = el('ul', { class: 'pl-cheat-flags' });
  RED_FLAGS.forEach((text) => list.appendChild(el('li', { text })));
  return list;
}

function sourcesFoot() {
  const list = el('ul', { class: 'pl-cheat-sources' });
  CHEAT_SHEET_SOURCES.forEach((source) => {
    list.appendChild(el('li', {}, [
      el('a', {
        href: source.url, target: '_blank', rel: 'noopener noreferrer', text: source.label,
      }),
    ]));
  });
  return list;
}

/**
 * Build the harsh-vocal cheat sheet drawer.
 * @returns {{root: HTMLElement, open: Function, close: Function, toggle: Function,
 *   isOpen: Function, stop: Function}}
 */
export function createHarshCheatSheet() {
  let openTab = '';

  const panels = {
    warmup: el('div', { class: 'pl-cheat-panel' }, [
      notice('The order that gets you into distortion safely — hydrate, breathe, then warm up in this order.'),
      ladderList(WARM_UP_LADDER),
    ]),
    falsecord: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      notice('Every sound on this tab happens above the true vocal folds. Learn one at a time.'),
      mechanismTable(),
      groupHeading('False cord, by register'),
      registerCard('low', FALSE_CORD_REGISTERS.low),
      registerCard('mid', FALSE_CORD_REGISTERS.mid),
      registerCard('high', FALSE_CORD_REGISTERS.high),
      groupHeading('Other sources above the cords'),
      ...supraglotticCards(),
    ]),
    truecord: el('div', { class: 'pl-cheat-panel pl-cheat-panel-cards' }, [
      trueCordCard(TRUE_CORD_HIGHS),
      hybridCard(),
    ]),
    tongue: el('div', { class: 'pl-cheat-panel' }, [
      tongueTable(),
      rulesList(TONGUE_RULES),
      groupHeading('Lows and gutturals'),
      notice('Use control, not volume. That is the whole section.', 'warn'),
      ...lowsCards(),
      rulesList(GUTTURAL_RULES),
    ]),
    redflags: el('div', { class: 'pl-cheat-panel' }, [
      redFlagList(),
      notice('A practice reminder, not medical advice.', 'warn'),
    ]),
  };

  for (const [id, node] of Object.entries(panels)) {
    node.id = `pl-cheat-panel-${id}`;
    node.setAttribute('role', 'tabpanel');
    node.setAttribute('aria-labelledby', `pl-tab-${id}`);
  }

  const body = el('div', { class: 'pl-cheat-drawer-body' }, Object.values(panels));

  function paintPanels() {
    for (const [id, node] of Object.entries(panels)) node.hidden = id !== openTab;
  }

  const closeButton = el('button', {
    type: 'button',
    class: 'pl-cheat-drawer-close',
    text: 'Close',
    on: { click: () => close() },
  });
  closeButton.setAttribute('aria-label', 'Close the cheat sheet');

  const tabs = tabBar({
    tabs: HARSH_CHEAT_TABS,
    active: 'warmup',
    ariaLabel: 'Harsh vocal cheat sheet',
    panelIdPrefix: 'pl-cheat-panel-',
    onChange: (id) => open(id),
  });
  body.id = 'pl-cheat-drawer-body';

  const sheet = el('div', { class: 'pl-cheat-drawer-sheet' }, [
    el('div', { class: 'pl-cheat-drawer-head' }, [
      el('h3', { class: 'pl-cheat-drawer-title', text: 'Harsh Vocal Cheat Sheet' }),
      closeButton,
    ]),
    el('div', { class: 'pl-cheat-drawer-tabrow' }, [tabs.root]),
    body,
    el('p', {
      class: 'pl-hint pl-cheat-drawer-sources-label',
      text: 'Sources',
    }),
    sourcesFoot(),
  ]);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');
  sheet.setAttribute('aria-label', 'Harsh vocal cheat sheet');

  const backdrop = el('div', {
    class: 'pl-cheat-drawer-backdrop',
    on: { click: () => close() },
  });

  const root = el('div', { class: 'pl-cheat-drawer', hidden: true }, [backdrop, sheet]);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  });

  /** Open one tab, or the first tab when the id is unknown. */
  function open(tabId) {
    const id = HARSH_CHEAT_TABS.some(t => t.id === tabId) ? tabId : 'warmup';
    openTab = id;
    root.hidden = false;
    tabs.setActive(id);
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
    else open('warmup');
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
