/**
 * Zero-dependency Node tests for musical context scope API.
 * Run: node tests/context/run.mjs
 */

import assert from 'node:assert/strict';

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

const store = installLocalStorageShim();
globalThis.window = globalThis;

const {
  openScope,
  getEffective,
  setLocal,
  setAsDefault,
  closeScope,
  resolveValue,
  getContext,
  setContext,
} = await import('../../js/musicalContext.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function seedDefaults() {
  store.clear();
  store.set('musi:settings', JSON.stringify({
    'context.root': 'C',
    'context.scale': 'Major (Ionian)',
    'context.tempo': 120,
    'context.tuning': 'Standard E',
    'context.meter': '4/4',
    'context.rootMode': 'fixed',
    'context.scaleMode': 'fixed',
    'global.volume': 0.75,
  }));
  setContext({
    root: 'C',
    scale: 'Major (Ionian)',
    tempo: 120,
    tuning: 'Standard E',
    meter: '4/4',
  }, 'test-reset');
}

test('local beats origin beats defaults', () => {
  seedDefaults();
  const scopeId = openScope({
    toolId: 'fretboard',
    origin: 'workbook',
    originContext: { root: 'G', tempo: 90, tuning: 'Drop D' },
  });

  let effective = getEffective(scopeId);
  assert.equal(effective.root, 'G');
  assert.equal(effective.tempo, 90);
  assert.equal(effective.tuning, 'Drop D');
  assert.equal(effective.scale, 'Major (Ionian)');

  setLocal(scopeId, { root: 'D', tempo: 140 });
  effective = getEffective(scopeId);
  assert.equal(effective.root, 'D');
  assert.equal(effective.tempo, 140);
  assert.equal(effective.tuning, 'Drop D');
});

test('setLocal does not change getContext saved defaults', () => {
  seedDefaults();
  const before = getContext();
  const scopeId = openScope({
    toolId: 'scale',
    origin: 'tools',
    originContext: { root: 'F' },
  });

  setLocal(scopeId, { root: 'Bb', tempo: 200, tuning: 'Drop C' });
  const after = getContext();

  assert.deepEqual(after, before);
  assert.equal(getEffective(scopeId).root, 'Bb');
});

test('setAsDefault changes saved defaults', () => {
  seedDefaults();
  const scopeId = openScope({
    toolId: 'triad',
    origin: 'library',
    originContext: { root: 'E' },
  });

  setLocal(scopeId, { root: 'A', tempo: 100, meter: '3/4' });
  setAsDefault(scopeId, ['root', 'tempo', 'meter']);

  const saved = getContext();
  assert.equal(saved.root, 'A');
  assert.equal(saved.tempo, 100);
  assert.equal(saved.meter, '3/4');
  assert.equal(saved.scale, 'Major (Ionian)');
});

test('closeScope falls back to origin then defaults', () => {
  seedDefaults();
  setContext({ root: 'C', tempo: 120 }, 'test-reset');
  const scopeId = openScope({
    toolId: 'sweep',
    origin: 'routine',
    originContext: { root: 'G', tempo: 80 },
  });

  setLocal(scopeId, { root: 'D' });
  assert.equal(getEffective(scopeId).root, 'D');

  closeScope(scopeId);
  const effective = getEffective(scopeId);
  assert.equal(effective.root, 'G');
  assert.equal(effective.tempo, 80);

  closeScope(scopeId);
  setLocal(scopeId, { tempo: 999 });
  closeScope(scopeId);
  assert.equal(getEffective(scopeId).tempo, 80);
});

test('resolveValue returns incompatible tuning reason', () => {
  const sixStringOnly = {
    allowed: ['E Standard', 'Drop D', 'Standard E'],
    compatible: (value) => value !== '7-String Standard',
  };

  const ok = resolveValue('tuning', 'Drop D', sixStringOnly);
  assert.equal(ok.value, 'Drop D');
  assert.equal(ok.fallbackFrom, null);
  assert.equal(ok.reason, null);

  const bad = resolveValue('tuning', '7-String Standard', sixStringOnly);
  assert.equal(bad.value, 'E Standard');
  assert.equal(bad.fallbackFrom, '7-String Standard');
  assert.equal(bad.reason, 'incompatible-tuning');
});

test('getEffective applies capabilities into fallbacks', () => {
  seedDefaults();
  const scopeId = openScope({
    toolId: 'neck',
    origin: 'direct',
    originContext: { tuning: '7-String Standard' },
  });

  const effective = getEffective(scopeId, {
    tuning: {
      allowed: ['E Standard', 'Standard E'],
      compatible: (value) => value !== '7-String Standard',
    },
  });

  assert.equal(effective.tuning, 'E Standard');
  assert.equal(effective.fallbacks.tuning.reason, 'incompatible-tuning');
  assert.equal(effective.fallbacks.tuning.fallbackFrom, '7-String Standard');
});

console.log(`context tests: ${passed} passed`);
