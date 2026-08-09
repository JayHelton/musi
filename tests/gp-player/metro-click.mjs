// Gain staging for score-synced metronome clicks (workbook / GP mix player).
// Run: node tests/gp-player/metro-click.mjs

import assert from 'node:assert/strict';
import { METRO_CLICK_GAIN } from '../../js/tab/metroClick.js';

// Reference peaks elsewhere in the audio graph (not imported — document staging).
const GP_GUITAR_NOTE_PEAK = 0.16;
const STANDALONE_METRO_ACCENT = 0.35;
const STANDALONE_METRO_NORMAL = 0.20;

assert.equal(typeof METRO_CLICK_GAIN.accent, 'number');
assert.equal(typeof METRO_CLICK_GAIN.normal, 'number');
assert.ok(METRO_CLICK_GAIN.accent > METRO_CLICK_GAIN.normal, 'accent louder than normal');

assert.ok(
  METRO_CLICK_GAIN.accent >= GP_GUITAR_NOTE_PEAK,
  'accent should be at least as loud as guitar note peaks so clicks cut through the mix',
);
assert.ok(
  METRO_CLICK_GAIN.normal >= GP_GUITAR_NOTE_PEAK * 0.65,
  'normal clicks should stay materially audible against guitar notes',
);

assert.ok(
  METRO_CLICK_GAIN.accent < STANDALONE_METRO_ACCENT,
  'score-synced accent should stay below standalone metronome peak',
);
assert.ok(
  METRO_CLICK_GAIN.normal < STANDALONE_METRO_NORMAL,
  'score-synced normal should stay below standalone metronome peak',
);

console.log('metro-click.mjs: all tests passed');
