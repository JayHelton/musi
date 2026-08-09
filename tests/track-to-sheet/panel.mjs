/**
 * Headless smoke test for the analysis settings panel.
 * The panel is the only way users can recover from a bad transcription, so it
 * has to mount and round-trip its state without a browser to prove it.
 * Run: node tests/track-to-sheet/panel.mjs
 */

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';

installDomShim();

const { createAnalysisPanel } = await import('../../js/trackToSheet/analysisPanel.js');
const {
  DEFAULT_ANALYSIS_OPTIONS,
  ANALYSIS_OPTION_META,
} = await import('../../js/trackToSheet/analysisOptions.js');

function mountPoint() {
  return document.createElement('div');
}

function findControl(root, id) {
  return root.querySelector(`#${id}`);
}

// ── Mounts and renders a control for every non-derived option ──
{
  const mount = mountPoint();
  const panel = createAnalysisPanel({
    mount,
    storageKey: 'test:panel',
    idPrefix: 'tp',
    onReanalyze: () => {},
  });

  assert.ok(panel, 'panel should be created');
  assert.equal(typeof panel.getOptions, 'function');
  assert.equal(typeof panel.setOptions, 'function');
  assert.equal(typeof panel.setBusy, 'function');

  for (const [key, meta] of Object.entries(ANALYSIS_OPTION_META)) {
    if (meta.derived) continue;
    const el = findControl(mount, `tp-${key}`);
    assert.ok(el, `expected a control for "${key}"`);
  }

  const opts = panel.getOptions();
  for (const key of Object.keys(DEFAULT_ANALYSIS_OPTIONS)) {
    assert.ok(key in opts, `getOptions missing "${key}"`);
  }
  panel.destroy?.();
}

// ── Ids are namespaced so two panels can share a page ──────────
{
  const a = mountPoint();
  const b = mountPoint();
  const pa = createAnalysisPanel({ mount: a, storageKey: 'test:a', idPrefix: 'aaa', onReanalyze: () => {} });
  const pb = createAnalysisPanel({ mount: b, storageKey: 'test:b', idPrefix: 'bbb', onReanalyze: () => {} });

  assert.ok(findControl(a, 'aaa-sensitivity'), 'panel A control');
  assert.ok(findControl(b, 'bbb-sensitivity'), 'panel B control');
  assert.equal(findControl(a, 'bbb-sensitivity'), null, 'panels must not share ids');

  pa.destroy?.();
  pb.destroy?.();
}

// ── setOptions round-trips through getOptions ──────────────────
{
  const mount = mountPoint();
  const panel = createAnalysisPanel({
    mount, storageKey: 'test:rt', idPrefix: 'rt', onReanalyze: () => {},
  });

  panel.setOptions({ sensitivity: 0.8, minNoteMs: 120, quantizeGrid: '1/16' });
  const opts = panel.getOptions();
  assert.equal(opts.minNoteMs, 120);
  assert.equal(opts.quantizeGrid, '1/16');
  assert.ok(Math.abs(opts.sensitivity - 0.8) < 1e-6);

  panel.setOptions({ preset: 'strict' });
  const strict = panel.getOptions();
  assert.equal(strict.preset, 'strict');
  assert.ok(strict.minNoteMs > 0);
  panel.destroy?.();
}

// ── Re-analyze hands the current options to the callback ───────
{
  const mount = mountPoint();
  let received = null;
  const panel = createAnalysisPanel({
    mount,
    storageKey: 'test:cb',
    idPrefix: 'cb',
    onReanalyze: (o) => { received = o; },
  });

  panel.setOptions({ minNoteMs: 95 });
  const btn = mount.querySelector('.analysis-panel-reanalyze');
  assert.ok(btn, 'expected a re-analyze button');
  btn.click();

  assert.ok(received, 'onReanalyze should have fired');
  assert.equal(received.minNoteMs, 95, 'callback gets the live options');
  panel.destroy?.();
}

// ── Busy state disables the actions ────────────────────────────
{
  const mount = mountPoint();
  const panel = createAnalysisPanel({
    mount, storageKey: 'test:busy', idPrefix: 'bz', onReanalyze: () => {},
  });
  const btn = mount.querySelector('.analysis-panel-reanalyze');
  panel.setBusy(true);
  assert.equal(btn.disabled, true, 're-analyze disabled while busy');
  panel.setBusy(false);
  assert.equal(btn.disabled, false, 're-analyze re-enabled');
  panel.destroy?.();
}

console.log('analysis-panel: all tests passed');
