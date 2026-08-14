/**
 * Zero-dependency Node tests for picker scope writes.
 * Run: node tests/pickers/run.mjs
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
globalThis.document = {
  getElementById() {
    return null;
  },
  createElement() {
    return {
      classList: { add() {}, toggle() {}, remove() {} },
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      innerHTML: '',
      style: {},
    };
  },
  body: {
    appendChild() {},
  },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

store.set('musi:settings', JSON.stringify({
  'context.root': 'C',
  'context.scale': 'Major (Ionian)',
  'context.tempo': 120,
  'context.tuning': 'Standard E',
  'context.meter': '4/4',
}));

const {
  writePickerValue,
  openTempoPicker,
  openMeterPicker,
} = await import('../../js/pickers.js');

const {
  openScope,
  getEffective,
  getContext,
} = await import('../../js/musicalContext.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('openTempoPicker and openMeterPicker are functions', () => {
  assert.equal(typeof openTempoPicker, 'function');
  assert.equal(typeof openMeterPicker, 'function');
});

test('writePickerValue routes to setLocal when scopeId is set', () => {
  const before = getContext();
  const scopeId = openScope({ toolId: 'test', origin: 'tools' });
  writePickerValue(scopeId, { tempo: 88, meter: '3/4' }, 'picker-test');
  assert.equal(getEffective(scopeId).tempo, 88);
  assert.equal(getEffective(scopeId).meter, '3/4');
  assert.deepEqual(getContext(), before);
});

test('writePickerValue routes to setContext when scopeId is absent', () => {
  writePickerValue('', { tempo: 132 }, 'picker-test');
  assert.equal(getContext().tempo, 132);
});

console.log(`pickers tests: ${passed} passed`);
