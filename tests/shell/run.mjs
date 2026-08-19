/**
 * Zero-dependency Node tests for the app shell: navigation stack, shared
 * musical context wiring, the unsaved guard, and the shared tool page.
 * Run: node tests/shell/run.mjs
 */

import assert from 'node:assert/strict';
import { TOOLS, CONTEXT_FIELDS, toolContextFields } from '../../js/tools.js';
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
import { runSwReloadGuardTests } from './sw-reload-guard.mjs';

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

const NAV_ORIGINS = ['train', 'study', 'create', 'library', 'utilities', 'workbook', 'search', 'recent', 'direct'];

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

console.log('Shared musical context');
test('toolContextFields lists fields in root, scale, tempo, tuning order', () => {
  assert.deepEqual(toolContextFields('pitchear'), ['root', 'scale', 'tempo', 'tuning']);
  assert.deepEqual(toolContextFields('scaleref'), ['root', 'scale', 'tuning']);
  assert.deepEqual(toolContextFields('metronome'), ['tempo']);
});

test('toolContextFields returns no field for other tools and unknown ids', () => {
  assert.deepEqual(toolContextFields('notes'), []);
  assert.deepEqual(toolContextFields('exercises'), []);
  assert.deepEqual(toolContextFields('no-such-tool'), []);
  assert.deepEqual(toolContextFields(''), []);
});

test('every tool declares its context fields, and every field is known', () => {
  for (const tool of TOOLS) {
    assert.equal(Array.isArray(tool.context), true, `${tool.id} has no context list`);
    for (const field of tool.context) {
      assert.equal(CONTEXT_FIELDS.includes(field), true, `${tool.id} uses ${field}`);
    }
  }
});

testAsync('contextButtonText labels key, scale, and tempo', async () => {
  const { contextButtonText } = await import('../../js/shell/contextQuick.js');
  const ctx = { root: 'G', scale: 'Natural Minor (Aeolian)', tempo: 96 };

  const full = contextButtonText(ctx, ['root', 'scale', 'tempo']);
  assert.equal(full.key, 'G Minor');
  assert.equal(full.tempo, '96');
  assert.equal(full.label, 'Musical context: G Natural Minor (Aeolian), 96 BPM');

  const tempoOnly = contextButtonText(ctx, ['tempo']);
  assert.equal(tempoOnly.key, '');
  assert.equal(tempoOnly.tempo, '96');
  assert.equal(tempoOnly.label, 'Musical context: 96 BPM');

  const rootOnly = contextButtonText(ctx, ['root']);
  assert.equal(rootOnly.key, 'G');
  assert.equal(rootOnly.tempo, '');
  assert.equal(rootOnly.label, 'Musical context: Key G');
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
  const first = { id: 'train', params: {} };
  const second = { id: 'metronome', params: {} };
  pushRoute(first, 'train');
  pushRoute(second, 'library');
  assert.deepEqual(popRoute(), { route: first, origin: 'train' });
  assert.equal(currentOrigin(), 'train');
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
    pushRoute({ id: 'train', params: {} }, 'train');
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
test('parentAddress returns the area a tool was opened from', () => {
  assert.deepEqual(parentAddress('train', { id: 'pitchear', params: { mode: 'ear' } }), {
    id: 'train',
    params: {},
  });
  assert.deepEqual(parentAddress('study', { id: 'circle', params: {} }), {
    id: 'study',
    params: {},
  });
  assert.deepEqual(parentAddress('create', { id: 'audiostudio', params: {} }), {
    id: 'create',
    params: {},
  });
  assert.deepEqual(parentAddress('library', { id: 'workbooks', params: {} }), {
    id: 'library',
    params: {},
  });
});

test('parentAddress sends a workbook screen back to Workbooks', () => {
  assert.deepEqual(parentAddress('workbook', { id: 'workbooks', params: { workbook: 'w1' } }), {
    id: 'workbooks',
    params: {},
  });
});

test('parentAddress falls back to the area that owns the tool', () => {
  assert.deepEqual(parentAddress('direct', { id: 'triads', params: {} }), {
    id: 'study',
    params: {},
  });
  assert.deepEqual(parentAddress('search', { id: 'notes', params: {} }), {
    id: 'create',
    params: {},
  });
});

test('parentAddress falls back to Train for a utility, which has no landing page', () => {
  assert.deepEqual(parentAddress('utilities', { id: 'metronome', params: {} }), {
    id: 'train',
    params: {},
  });
  assert.deepEqual(parentAddress('direct', { id: 'settings', params: {} }), {
    id: 'train',
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
test('every tool sits in one canonical area', () => {
  const areas = new Set(['train', 'study', 'create', 'library', 'utility']);
  for (const tool of TOOLS) {
    assert.equal(areas.has(tool.area), true, `${tool.id} has area ${tool.area}`);
    assert.equal('category' in tool, false, `${tool.id} still carries category`);
    assert.equal('purpose' in tool, false, `${tool.id} still carries purpose`);
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
    description: 'Tempo, meter, tap tempo, and a tempo plan.',
    modes: [{ id: 'plan', label: 'Plan' }, { id: 'play', label: 'Play' }],
    defaultMode: 'plan',
    contextFields: [],
    moreItems: [],
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

testAsync('toolPage: header shows Back and title, and hides More with no menu items', async () => {
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
  ]);
  assert.equal(header.children[1].dataset.pageHeading, '');
  assert.equal(header.children[1].textContent, 'Tuner');
  destroy();
});

testAsync('toolPage: header shows More when the menu has items', async () => {
  const { installDomShim } = await import('../gp-player/domShim.mjs');
  installDomShim();
  installLocalStorageShim();
  globalThis.window = globalThis;
  const { mountToolPage } = await import('../../js/shell/toolPage.js');

  const section = document.createElement('section');
  const { destroy } = mountToolPage(section, makeDescriptor({
    moreItems: [{ label: 'Reset', onSelect: () => {} }],
  }));
  const header = section.querySelector('.tool-page-header');
  const classes = [...header.children].map((el) => el.className);
  assert.deepEqual(classes, [
    'tool-page-back tool-back',
    '',
    'tool-page-more',
  ]);
  destroy();
});

testAsync('toolPage: wrapper child order is header, description, context, modes, workspace, primary, advanced', async () => {
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
    'tool-page-description',
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

const swReloadResult = runSwReloadGuardTests();
passed += swReloadResult.passed;
failed += swReloadResult.failed;

async function run() {
  console.log('');
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed, 0 failed`);
}

await run();
