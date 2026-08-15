/**
 * Node tests for service-worker reload defer helpers.
 * Run: node tests/shell/sw-reload-guard.mjs
 */

import assert from 'node:assert/strict';
import { shouldDeferServiceWorkerReload } from '../../js/swReloadGuard.js';

export function runSwReloadGuardTests() {
  let passed = 0;
  let failed = 0;

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

  console.log('swReloadGuard');

  test('shouldDeferServiceWorkerReload is false when both flags are off', () => {
    assert.equal(shouldDeferServiceWorkerReload({ captureActive: false, scorePlaying: false }), false);
    assert.equal(shouldDeferServiceWorkerReload(), false);
  });

  test('shouldDeferServiceWorkerReload is true when capture is active', () => {
    assert.equal(shouldDeferServiceWorkerReload({ captureActive: true, scorePlaying: false }), true);
  });

  test('shouldDeferServiceWorkerReload is true when score playback is active', () => {
    assert.equal(shouldDeferServiceWorkerReload({ captureActive: false, scorePlaying: true }), true);
  });

  test('shouldDeferServiceWorkerReload is true when both flags are on', () => {
    assert.equal(shouldDeferServiceWorkerReload({ captureActive: true, scorePlaying: true }), true);
  });

  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { passed, failed } = runSwReloadGuardTests();
  console.log('');
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed, 0 failed`);
}
