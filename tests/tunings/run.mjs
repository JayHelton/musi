/**
 * Zero-dependency Node tests for tuning name resolution.
 * Run: node tests/tunings/run.mjs
 */

import assert from 'node:assert/strict';
import { TUNINGS, resolveTuningKey } from '../../js/tunings.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('resolveTuningKey maps catalog name to TUNINGS key', () => {
  const key = resolveTuningKey('E Standard');
  assert.equal(key, 'E Standard');
  assert.ok(TUNINGS[key]);
});

test('resolveTuningKey maps legacy Standard to canonical key', () => {
  const key = resolveTuningKey('Standard');
  assert.equal(key, 'E Standard');
  assert.ok(TUNINGS[key]);
});

test('resolveTuningKey maps Half Step Down legacy name', () => {
  assert.equal(resolveTuningKey('Half Step Down'), 'Eb Standard');
  assert.ok(TUNINGS['Eb Standard']);
});

test('resolveTuningKey falls back to Standard', () => {
  assert.equal(resolveTuningKey(''), 'Standard');
  assert.equal(resolveTuningKey('Not A Real Tuning'), 'Standard');
});

test('resolveTuningKey keeps Custom', () => {
  assert.equal(resolveTuningKey('Custom'), 'Custom');
});

console.log(`\n${passed} passed`);
