/**
 * Node tests for app toast helpers.
 * Run: node tests/shell/app-toast.mjs
 */

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { installDomShim } from '../gp-player/domShim.mjs';
import { showAppToast, clearAppToasts } from '../../js/appToast.js';

export function runAppToastTests() {
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

  console.log('appToast');

  test('showAppToast does not throw when document is missing', () => {
    const priorDocument = globalThis.document;
    const priorWindow = globalThis.window;
    delete globalThis.document;
    delete globalThis.window;
    try {
      showAppToast('Node safe');
      clearAppToasts();
    } finally {
      globalThis.document = priorDocument;
      globalThis.window = priorWindow;
    }
  });

  installDomShim();
  globalThis.window = globalThis;

  test('showAppToast creates host and shows message text', () => {
    clearAppToasts();
    const hostBefore = document.getElementById('app-toast-host');
    if (hostBefore) hostBefore.remove();

    showAppToast('Score load failed');
    const host = document.getElementById('app-toast-host');
    assert.ok(host, 'toast host should exist');
    assert.equal(host.getAttribute('role'), 'status');
    assert.equal(host.getAttribute('aria-live'), 'polite');
    const toast = host.querySelector('.app-toast');
    assert.ok(toast, 'toast element should exist');
    assert.equal(toast.textContent, 'Score load failed');
    assert.equal(toast.classList.contains('app-toast--error'), true);
    clearAppToasts();
  });

  test('duplicate message does not create a second toast', () => {
    clearAppToasts();
    showAppToast('Same error');
    showAppToast('Same error');
    const host = document.getElementById('app-toast-host');
    assert.equal(host.querySelectorAll('.app-toast').length, 1);
    clearAppToasts();
  });

  test('clearAppToasts removes visible toasts', () => {
    showAppToast('First');
    showAppToast('Second');
    const host = document.getElementById('app-toast-host');
    assert.equal(host.querySelectorAll('.app-toast').length, 2);
    clearAppToasts();
    assert.equal(host.querySelectorAll('.app-toast').length, 0);
  });

  return { passed, failed };
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const { passed, failed } = runAppToastTests();
  console.log('');
  if (failed) {
    console.error(`${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`${passed} passed, 0 failed`);
}
