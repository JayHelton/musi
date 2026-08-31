// The harsh-vocal cheat sheet drawer.
//
// Same shape as `referenceDrawer.js`: a slide-over sheet that keeps whatever
// is running underneath — a Cue Runner mid-warm-up — exactly as it was.
// Unlike the reference drawer, this content is static: no shared musical
// context to render against, so there is no `render()` step, only tabs.

import { el, tabBar, notice } from './dom.js';
import {
  HARSH_CHEAT_TABS,
  WARM_UP_LADDER,
  FALSE_CORD_REGISTERS,
  TRUE_CORD_HIGHS,
  TONGUE_TONE_TABLE,
  TONGUE_RULES,
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

function registerCard(register, data) {
  const rows = [
    ['Activation', data.activation],
    ['Placement', data.placement],
    ['Mouth & tongue', data.mouth],
    ['Breath', data.breath],
    ['Feels like', data.feelsLike],
  ];
  return el('article', { class: `pl-cheat-card pl-cheat-card-${register}` }, [
    el('h4', { class: 'pl-cheat-card-title', text: data.label }),
    ...rows.map(([label, text]) => el('p', { class: 'pl-cheat-row' }, [
      el('b', { class: 'pl-cheat-row-label', text: `${label}: ` }),
      text,
    ])),
  ]);
}

function trueCordCard(data) {
  const rows = [
    ['What it is', data.whatItIs],
    ['Warm into this last', data.warmIntoLast],
    ['Activation', data.activation],
    ['Riding it', data.ridingIt],
    ['Placement', data.placement],
    ['Breath', data.breath],
  ];
  return el('article', { class: 'pl-cheat-card pl-cheat-card-truecord' }, [
    el('h4', { class: 'pl-cheat-card-title', text: data.label }),
    ...rows.map(([label, text]) => el('p', { class: 'pl-cheat-row' }, [
      el('b', { class: 'pl-cheat-row-label', text: `${label}: ` }),
      text,
    ])),
    el('p', { class: 'pl-cheat-row pl-cheat-hardstop' }, [
      el('b', { text: 'Hard stop: ' }),
      data.hardStop,
    ]),
  ]);
}

function tongueTable() {
  const head = el('tr', {}, [
    el('th', { text: 'Tongue position' }),
    el('th', { text: 'Vowel' }),
    el('th', { text: 'Effect' }),
    el('th', { text: 'Pairs with' }),
  ]);
  const body = TONGUE_TONE_TABLE.map(row => el('tr', {}, [
    el('td', { text: row.position }),
    el('td', { text: row.vowel }),
    el('td', { text: row.effect }),
    el('td', { text: row.pairsWith }),
  ]));
  const table = el('table', { class: 'pl-cheat-table' }, [
    el('thead', {}, [head]),
    el('tbody', {}, body),
  ]);
  return el('div', { class: 'pl-cheat-table-wrap' }, [table]);
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
      registerCard('low', FALSE_CORD_REGISTERS.low),
      registerCard('mid', FALSE_CORD_REGISTERS.mid),
      registerCard('high', FALSE_CORD_REGISTERS.high),
    ]),
    truecord: el('div', { class: 'pl-cheat-panel' }, [
      trueCordCard(TRUE_CORD_HIGHS),
    ]),
    tongue: el('div', { class: 'pl-cheat-panel' }, [
      tongueTable(),
      el('ul', { class: 'pl-cheat-rules' },
        TONGUE_RULES.map(text => el('li', { text }))),
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
