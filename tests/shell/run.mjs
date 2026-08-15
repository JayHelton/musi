/**
 * Zero-dependency Node tests for the Tools home section model.
 * Run: node tests/shell/run.mjs
 */

import assert from 'node:assert/strict';
import {
  buildHomeSections,
  normalizeRecents,
  pushRecent,
  searchTools,
} from '../../js/tools/homeModel.js';
import { TOOLS, toolsForPurpose } from '../../js/tools.js';
import {
  pushRoute,
  popRoute,
  currentOrigin,
  saveViewState,
  readViewState,
  restoreScroll,
  parentAddress,
} from '../../js/shell/navStack.js';
import {
  registerUnsaved,
  clearUnsaved,
  hasUnsaved,
  confirmLeave,
} from '../../js/shell/unsavedGuard.js';
import { runAppToastTests } from './app-toast.mjs';

let passed = 0;
let failed = 0;
const pendingAsync = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function testAsync(name, fn) {
  pendingAsync.push({ name, fn });
}

const NAV_ORIGINS = ['tools', 'library', 'workbook', 'routine', 'search', 'recent', 'direct'];

function drainNavStack() {
  while (true) {
    const prior = popRoute();
    if (prior === null && currentOrigin() === 'direct') break;
  }
}

const FAKE_TOOLS = [
  {
    id: 'alpha',
    label: 'Alpha Tool',
    short: 'Alpha',
    title: 'Alpha Tool',
    purpose: 'train',
    description: 'Only this description mentions xyzzyplugh.',
    modes: [
      { id: 'mode-a', label: 'Mode Alpha' },
    ],
    defaultMode: 'mode-a',
  },
  {
    id: 'beta',
    label: 'Beta Reader',
    short: 'Beta',
    title: 'Beta Reader',
    purpose: 'study',
    modes: [
      { id: 'overview', label: 'Overview' },
    ],
    defaultMode: 'overview',
  },
  {
    id: 'gamma',
    label: 'Gamma Studio',
    short: 'Gamma',
    title: 'Gamma Studio',
    purpose: 'create',
    modes: [],
    defaultMode: '',
  },
  {
    id: 'legacy',
    label: 'Legacy Quiz',
    short: 'Quiz',
    title: 'Legacy Quiz',
    description: 'Old quiz with no purpose.',
  },
];

function sectionIds(sections) {
  return sections.map(s => s.id);
}

function collectLabels(sections) {
  const labels = [];
  for (const section of sections) {
    if (section.label) labels.push(section.label);
    for (const item of section.items || []) {
      if (item.label) labels.push(item.label);
    }
  }
  return labels;
}

console.log('Section order and visibility');
test('section order with favorites, recents, and active routines', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['alpha', 'legacy'],
    recents: [{ id: 'alpha', mode: 'mode-a', at: '2026-08-14T10:00:00.000Z' }],
    activeRoutines: [{ id: 'r1', name: 'Morning routine' }],
    query: '',
  });

  assert.deepEqual(sectionIds(sections), [
    'purposes',
    'favorites',
    'recents',
    'continue',
    'search',
    'browse',
  ]);
  assert.equal(sections[0].activePurpose, 'train');
  assert.equal(sections[1].items.length, 1);
  assert.equal(sections[1].items[0].id, 'alpha');
  assert.equal(sections[2].items[0].source, 'recent');
  assert.equal(sections[3].label, 'Continue a routine');
  assert.equal(sections[3].items[0].label, 'Morning routine');
});

test('empty favorites, recents, and routines omit those sections', () => {
  const sections = buildHomeSections({
    purpose: 'study',
    tools: FAKE_TOOLS,
    favorites: [],
    recents: [],
    activeRoutines: [],
    query: '',
  });

  assert.deepEqual(sectionIds(sections), ['purposes', 'search', 'browse']);
});

console.log('Recents');
test('normalizeRecents caps at five, one entry per tool, newest first', () => {
  const list = [];
  for (let i = 0; i < 7; i += 1) {
    list.push({
      id: `tool-${i}`,
      mode: '',
      at: `2026-08-14T0${i}:00:00.000Z`,
    });
  }

  const normalized = normalizeRecents(list, 5);
  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].id, 'tool-6');
  assert.equal(normalized[4].id, 'tool-2');
});

test('normalizeRecents keeps one row per tool id with the newest timestamp', () => {
  const normalized = normalizeRecents([
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T08:00:00.000Z' },
    { id: 'beta', mode: '', at: '2026-08-14T09:00:00.000Z' },
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T10:00:00.000Z' },
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'alpha');
  assert.equal(normalized[0].at, '2026-08-14T10:00:00.000Z');
});

test('pushRecent replaces the prior row for the same tool and does not mutate input', () => {
  const input = [
    { id: 'alpha', mode: 'mode-a', at: '2026-08-14T08:00:00.000Z' },
    { id: 'beta', mode: '', at: '2026-08-14T09:00:00.000Z' },
  ];
  const snapshot = JSON.stringify(input);

  const next = pushRecent(input, {
    id: 'alpha',
    mode: 'mode-a',
    at: '2026-08-14T11:00:00.000Z',
  });

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'alpha');
  assert.equal(next[0].at, '2026-08-14T11:00:00.000Z');
  assert.equal(next[1].id, 'beta');
});

console.log('Search');
test('search matches a tool name', () => {
  const matches = searchTools(FAKE_TOOLS, 'beta');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'beta');
});

test('search matches a mode label', () => {
  const matches = searchTools(FAKE_TOOLS, 'mode alpha');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'alpha');
  assert.equal(matches[0].matchedMode, 'mode-a');
});

test('search does not match description-only text', () => {
  const matches = searchTools(FAKE_TOOLS, 'xyzzyplugh');
  assert.equal(matches.length, 0);
});

test('empty search query returns no rows', () => {
  assert.deepEqual(searchTools(FAKE_TOOLS, ''), []);
  assert.deepEqual(searchTools(FAKE_TOOLS, '   '), []);
});

console.log('Browse and favorites');
test('browse lists only tools for the active purpose', () => {
  const sections = buildHomeSections({
    purpose: 'study',
    tools: FAKE_TOOLS,
    query: '',
  });
  const browse = sections.find(s => s.id === 'browse');
  assert.deepEqual(browse.items.map(item => item.id), ['beta']);
});

test('favorites skip tools without purpose', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['legacy', 'alpha'],
    query: '',
  });
  const favorites = sections.find(s => s.id === 'favorites');
  assert.deepEqual(favorites.items.map(item => item.id), ['alpha']);
});

console.log('Copy guardrails');
test('no section or item label equals "No routines yet"', () => {
  const sections = buildHomeSections({
    purpose: 'train',
    tools: FAKE_TOOLS,
    favorites: ['alpha'],
    recents: [{ id: 'alpha', mode: '', at: '2026-08-14T10:00:00.000Z' }],
    activeRoutines: [{ id: 'r1', name: 'Morning routine' }],
    query: 'alpha',
  });

  const labels = collectLabels(sections);
  assert.equal(labels.includes('No routines yet'), false);
});

console.log('navStack origins');
for (const origin of NAV_ORIGINS) {
  test(`pushRoute and currentOrigin track ${origin}`, () => {
    drainNavStack();
    const route = { id: 'metronome', params: { mode: 'plan' } };
    pushRoute(route, origin);
    assert.equal(currentOrigin(), origin);
    drainNavStack();
  });
}

test('popRoute returns the prior stack entry', () => {
  drainNavStack();
  const first = { id: 'tools', params: {} };
  const second = { id: 'metronome', params: {} };
  pushRoute(first, 'tools');
  pushRoute(second, 'library');
  assert.deepEqual(popRoute(), { route: first, origin: 'tools' });
  assert.equal(currentOrigin(), 'tools');
  assert.equal(popRoute(), null);
  assert.equal(currentOrigin(), 'direct');
});

test('popRoute does not call history', () => {
  drainNavStack();
  const historyLog = [];
  const priorHistory = globalThis.history;
  globalThis.history = {
    pushState(...args) { historyLog.push(['pushState', ...args]); },
    replaceState(...args) { historyLog.push(['replaceState', ...args]); },
    back() { historyLog.push(['back']); },
    go(...args) { historyLog.push(['go', ...args]); },
  };
  try {
    pushRoute({ id: 'tools', params: {} }, 'tools');
    pushRoute({ id: 'metronome', params: {} }, 'search');
    popRoute();
    popRoute();
    assert.equal(historyLog.length, 0);
  } finally {
    globalThis.history = priorHistory;
  }
});

console.log('navStack view state');
test('saveViewState and readViewState round-trip Library filter shape', () => {
  const routeKey = 'library:exercises';
  const state = {
    query: 'scale',
    filters: {
      instrument: 'guitar',
      materialType: 'exercise',
      technique: 'alternate',
      tuning: 'standard',
      difficulty: 'easy',
      tags: ['warmup', 'scales'],
      source: 'local',
      favorite: true,
    },
    sort: 'name-asc',
    selectedId: 'ex-42',
    scrollY: 240,
  };
  saveViewState(routeKey, state);
  assert.deepEqual(readViewState(routeKey), state);
  assert.equal(restoreScroll(routeKey), 240);
});

console.log('navStack parentAddress');
test('parentAddress for tools, library, search, recent, and direct', () => {
  assert.deepEqual(parentAddress('tools', { id: 'metronome', params: {} }), {
    id: 'tools',
    params: {},
  });
  assert.deepEqual(parentAddress('library', { id: 'scalelab', params: { mode: 'overview' } }), {
    id: 'library',
    params: { mode: 'exercises' },
  });
  assert.deepEqual(parentAddress('search', { id: 'fretmap', params: {} }), {
    id: 'tools',
    params: {},
  });
  assert.deepEqual(parentAddress('recent', { id: 'chordlab', params: {} }), {
    id: 'tools',
    params: {},
  });
  assert.deepEqual(parentAddress('direct', { id: 'pitchear', params: { mode: 'tuner' } }), {
    id: 'tools',
    params: {},
  });
});

test('parentAddress for routine peels exercise, workbook, session, routine, then tools', () => {
  const full = {
    id: 'routines',
    params: { routine: 'r1', session: 's1', workbook: 'w1', exercise: 'e1' },
  };
  assert.deepEqual(parentAddress('routine', full), {
    id: 'routines',
    params: { routine: 'r1', session: 's1', workbook: 'w1' },
  });
  assert.deepEqual(parentAddress('routine', {
    id: 'routines',
    params: { routine: 'r1', session: 's1', workbook: 'w1' },
  }), {
    id: 'routines',
    params: { routine: 'r1', session: 's1' },
  });
  assert.deepEqual(parentAddress('routine', {
    id: 'routines',
    params: { routine: 'r1', session: 's1' },
  }), {
    id: 'routines',
    params: { routine: 'r1' },
  });
  assert.deepEqual(parentAddress('routine', {
    id: 'routines',
    params: { routine: 'r1' },
  }), {
    id: 'tools',
    params: {},
  });
});

console.log('unsavedGuard');
test('registerUnsaved sets hasUnsaved', () => {
  clearUnsaved('scope-a');
  assert.equal(hasUnsaved(), false);
  registerUnsaved('scope-a', {
    describe: () => 'Draft recording',
    save: () => {},
    discard: () => {},
  });
  assert.equal(hasUnsaved(), true);
  clearUnsaved('scope-a');
  assert.equal(hasUnsaved(), false);
});

const unsavedPromptCases = [
  { label: 'Save', result: 'save', handler: 'save' },
  { label: 'Discard', result: 'discard', handler: 'discard' },
  { label: 'Keep editing', result: 'keep', handler: null },
];

for (const { label, result, handler } of unsavedPromptCases) {
  testAsync(`confirmLeave maps "${label}" to ${result}`, async () => {
    const scopeId = `scope-prompt-${result}`;
    clearUnsaved(scopeId);
    let saveCalls = 0;
    let discardCalls = 0;
    registerUnsaved(scopeId, {
      describe: () => 'Unsaved take',
      save: () => { saveCalls += 1; },
      discard: () => { discardCalls += 1; },
    });

    const promptCalls = [];
    const choice = await confirmLeave(({ title, choices }) => {
      promptCalls.push({ title, choices });
      return label;
    });

    assert.equal(choice, result);
    assert.equal(promptCalls.length, 1);
    assert.deepEqual(promptCalls[0].choices, ['Save', 'Discard', 'Keep editing']);

    if (handler === 'save') {
      assert.equal(saveCalls, 1);
      assert.equal(discardCalls, 0);
      assert.equal(hasUnsaved(), false);
    } else if (handler === 'discard') {
      assert.equal(saveCalls, 0);
      assert.equal(discardCalls, 1);
      assert.equal(hasUnsaved(), false);
    } else {
      assert.equal(saveCalls, 0);
      assert.equal(discardCalls, 0);
      assert.equal(hasUnsaved(), true);
      clearUnsaved(scopeId);
    }
  });
}

console.log('Live catalog');
test('Train, Study, and Create each list the expected tools', () => {
  const trainIds = toolsForPurpose('train').map(t => t.id);
  const studyIds = toolsForPurpose('study').map(t => t.id);
  const createIds = toolsForPurpose('create').map(t => t.id);

  for (const id of ['tuner', 'metronome', 'practice', 'exercises', 'workbooks', 'gpplayer']) {
    assert.equal(trainIds.includes(id), true, `train missing ${id}`);
  }
  for (const id of ['scaleref', 'intervalorbit', 'chords']) {
    assert.equal(studyIds.includes(id), true, `study missing ${id}`);
  }
  for (const id of ['songwriter', 'recorder', 'tracktosheet']) {
    assert.equal(createIds.includes(id), true, `create missing ${id}`);
  }

  for (const id of ['scales', 'drums', 'musicprefs']) {
    const tool = TOOLS.find(t => t.id === id);
    assert.ok(tool, `${id} missing from TOOLS`);
    assert.equal(tool.purpose, undefined, `${id} should have no purpose`);
  }
});

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  return store;
}

function makeDescriptor(overrides = {}) {
  return {
    id: 'metronome',
    title: 'Metronome',
    modes: [{ id: 'plan', label: 'Plan' }, { id: 'play', label: 'Play' }],
    defaultMode: 'plan',
    contextFields: [],
    moreItems: [],
    isFavorite: false,
    ...overrides,
  };
}

console.log('toolPage');
testAsync('toolPage: mountToolPage returns workspace, setContextRow, setModes, destroy', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const handle = mountToolPage(section, makeDescriptor());
  assert.equal(typeof handle.workspace, 'object');
  assert.equal(typeof handle.setContextRow, 'function');
  assert.equal(typeof handle.setModes, 'function');
  assert.equal(typeof handle.destroy, 'function');
  handle.destroy();
});

testAsync('toolPage: header child order is Back, title, favorite, More', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const { destroy } = mountToolPage(section, makeDescriptor({ title: 'Tuner' }));
  const header = section.querySelector('.tool-page-header');
  const classes = [...header.children].map((el) => el.className);
  assert.deepEqual(classes, [
    'tool-page-back tool-back',
    '',
    'tool-page-favorite',
    'tool-page-more',
  ]);
  assert.equal(header.children[1].dataset.pageHeading, '');
  assert.equal(header.children[1].textContent, 'Tuner');
  destroy();
});

testAsync('toolPage: wrapper child order is header, context, modes, workspace, primary, advanced', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const { destroy } = mountToolPage(section, makeDescriptor());
  const page = section.querySelector('.tool-page');
  const classes = [...page.children].map((el) => el.className);
  assert.deepEqual(classes, [
    'tool-page-header',
    'tool-page-context',
    'tool-page-modes subview-tabs',
    'tool-page-workspace',
    'tool-page-primary',
    'adv-options tool-page-advanced',
  ]);
  destroy();
});

testAsync('toolPage: existing section children move into workspace', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const legacy = document.createElement('div');
  legacy.className = 'legacy-tool-body';
  legacy.textContent = 'Keep me';
  section.appendChild(legacy);

  const { workspace, destroy } = mountToolPage(section, makeDescriptor());
  assert.equal(section.children.length, 1);
  assert.equal(section.firstChild.className, 'tool-page');
  assert.equal(workspace.children.length, 1);
  assert.equal(workspace.firstChild.className, 'legacy-tool-body');
  assert.equal(workspace.firstChild.textContent, 'Keep me');
  destroy();
});

testAsync('toolPage: setContextRow shows labels, values, and fallback reason', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const { setContextRow, destroy } = mountToolPage(section, makeDescriptor());
  setContextRow([
    {
      key: 'root',
      label: 'Root',
      value: 'G',
      fallbackReason: 'Workbook uses G',
      onClick() {},
    },
  ]);

  const context = section.querySelector('.tool-page-context');
  assert.equal(context.hidden, false);
  assert.equal(context.querySelector('.tool-page-context-label').textContent, 'Root');
  assert.equal(context.querySelector('.setup-chip-value').textContent, 'G');
  assert.equal(context.querySelector('.tool-page-context-fallback').textContent, 'Workbook uses G');
  destroy();
});

testAsync('toolPage: destroy restores children to the section', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const legacy = document.createElement('p');
  legacy.className = 'legacy-markup';
  legacy.textContent = 'Restored';
  section.appendChild(legacy);

  const { destroy } = mountToolPage(section, makeDescriptor());
  assert.equal(section.dataset.toolPage, '1');
  destroy();

  assert.equal(section.dataset.toolPage, undefined);
  assert.equal(section.children.length, 1);
  assert.equal(section.firstChild.className, 'legacy-markup');
  assert.equal(section.firstChild.textContent, 'Restored');
});

testAsync('toolPage: section-head stays hidden; leftover back removed; destroy restores workspace only', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const head = document.createElement('div');
  head.className = 'section-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'tool-back';
  back.textContent = '← Back';
  head.appendChild(back);
  const legacy = document.createElement('div');
  legacy.className = 'legacy-body';
  legacy.textContent = 'Body';
  section.append(head, legacy);

  const { workspace, destroy } = mountToolPage(section, makeDescriptor());
  assert.equal(section.querySelector('.tool-page') !== null, true);
  const leftoverHead = [...section.children].find((child) => child.classList?.contains('section-head'));
  assert.equal(leftoverHead !== null, true);
  assert.equal(leftoverHead.hidden, true);
  assert.equal(section.querySelector('.tool-back:not(.tool-page-back)'), null);
  assert.equal(workspace.children.length, 1);
  assert.equal(workspace.firstChild.className, 'legacy-body');

  destroy();
  assert.equal(section.querySelector('.tool-page'), null);
  assert.equal([...section.children].some((child) => child.classList?.contains('section-head')), true);
  assert.equal(section.querySelector('.legacy-body') !== null, true);
  assert.equal(section.querySelector('.legacy-body').parentElement, section);
});

for (const { name, fn } of pendingAsync) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('');
const toastResult = runAppToastTests();
passed += toastResult.passed;
failed += toastResult.failed;

async function run() {
  console.log('');
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed, 0 failed`);
}

await run();
