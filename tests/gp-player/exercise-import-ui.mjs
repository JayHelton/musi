// Smoke checks for GP exercise-import panel UI.
// Run: node tests/gp-player/exercise-import-ui.mjs

import assert from 'node:assert/strict';
import { installDomShim } from './domShim.mjs';
import { mountExerciseImportPanel } from '../../js/gpPlayer/exerciseImportPanel.js';
import { formatBarRange } from '../../js/gpPlayer/measureDigest.js';
import { segmentBeats } from '../../js/gpPlayer/exerciseSegments.js';

installDomShim();

function makeDigest(i, opts = {}) {
  return {
    index: i,
    barNumber: i + 1,
    startBeat: i * 4,
    endBeat: (i + 1) * 4,
    beats: 4,
    marker: opts.marker ?? null,
    timeSig: [4, 4],
    timeSigChanged: !!opts.timeSigChanged,
    noteCount: opts.noteCount ?? 4,
    drumHits: opts.drumHits ?? 0,
    fretMin: opts.fretMin ?? 3,
    fretMax: opts.fretMax ?? 7,
    stringsUsed: [0],
    noteNames: [],
    techniques: opts.techniques ?? [],
    drumInstruments: [],
    isEmpty: !!opts.isEmpty,
    density: opts.isEmpty ? 0 : 0.5,
    beatCells: opts.beatCells ?? [2, 2, 2, 2],
    signature: opts.signature ?? `sig-${i}`,
    repeatOf: opts.repeatOf ?? null,
  };
}

function makeDigests(count) {
  return Array.from({ length: count }, (_, i) => makeDigest(i));
}

function selectBar(host, index, { shift = false } = {}) {
  const bars = host.querySelectorAll('.gpi-bar');
  const bar = bars[index];
  assert.ok(bar, `bar ${index} should exist`);
  bar.dispatch('pointerdown', { pointerId: 1, target: bar, shiftKey: shift });
  bar.dispatch('pointerup', { pointerId: 1, target: bar });
}

function selectRange(host, from, to) {
  selectBar(host, from);
  selectBar(host, to, { shift: true });
}

// ---- falsy host returns no-op API ----
const noop = mountExerciseImportPanel(null);
assert.equal(typeof noop.open, 'function');
assert.equal(typeof noop.close, 'function');
assert.equal(typeof noop.sync, 'function');
assert.equal(typeof noop.destroy, 'function');
assert.equal(noop.isOpen(), false);
noop.open();
assert.equal(noop.isOpen(), false);

// ---- open renders one chip per digest ----
const host = document.createElement('div');
document.body.appendChild(host);
const digests = makeDigests(6);
const panel = mountExerciseImportPanel(host, {
  getDigests: () => digests,
  getScoreTitle: () => 'Smoke Score',
  getTrackLabel: () => 'Lead',
  getBpm: () => 120,
});
assert.equal(panel.isOpen(), false);
panel.open();
assert.equal(panel.isOpen(), true);
assert.equal(host.querySelectorAll('.gpi-bar').length, 6);

// ---- empty state copy ----
assert.equal(host.querySelector('.gpi-import-btn').textContent, 'Add exercises');
assert.match(host.querySelector('.gpi-coverage').textContent, /No bars grouped yet/);
assert.match(host.querySelector('.gpi-coverage').textContent, /6 bars in this score/);
assert.equal(host.querySelector('.gpi-every-btn').textContent, 'Apply');

// ---- bar meta shows notes + frets on two lines ----
const metaPrimary = host.querySelector('.gpi-bar-meta-primary');
const metaSecondary = host.querySelector('.gpi-bar-meta-secondary');
assert.ok(metaPrimary, 'meta primary line should exist');
assert.match(metaPrimary.textContent, /4 notes/);
assert.ok(metaSecondary, 'meta secondary line should exist');
assert.match(metaSecondary.textContent, /frets 3/);

// ---- technique pills use honest abbreviations + titles ----
const techHost = document.createElement('div');
document.body.appendChild(techHost);
const techDigests = [makeDigest(0, { techniques: ['palmMute', 'bend', 'slide', 'hammer'] })];
const techPanel = mountExerciseImportPanel(techHost, { getDigests: () => techDigests });
techPanel.open();
const pills = [...techHost.querySelectorAll('.gpi-tech-pill')];
assert.equal(pills[0].textContent, 'PM');
assert.equal(pills[0].getAttribute('title'), 'Palm mute');
assert.equal(pills[3].textContent, '+1');
assert.match(pills[3].getAttribute('title'), /Hammer-on/);
techPanel.destroy();

// ---- sparkline cells get real height styles (not [object Object]) ----
const sparkCell = host.querySelector('.gpi-spark-cell');
assert.ok(sparkCell, 'sparkline cell should exist');
const sparkHeight = sparkCell.style.height || sparkCell.style.getPropertyValue('height');
assert.ok(sparkHeight && sparkHeight.endsWith('%'), `sparkline height should be a percentage, got "${sparkHeight}"`);
assert.ok(!String(sparkCell.getAttribute?.('style') || '').includes('object Object'));

// ---- select + group creates a segment row ----
selectRange(host, 1, 3);
const groupBtn = host.querySelector('.gpi-group-btn');
assert.ok(groupBtn);
assert.equal(groupBtn.disabled, false);
assert.match(groupBtn.textContent, /Group Bars 2/);
groupBtn.click();
const segRows = host.querySelectorAll('.gpi-seg');
assert.equal(segRows.length, 1);
const assignedChip = [...host.querySelectorAll('.gpi-bar')].find((b) => b.classList.contains('is-assigned'));
assert.ok(assignedChip, 'grouped bars should be tinted');
assert.ok(
  assignedChip.style.getPropertyValue('--seg-color'),
  'assigned chip should have --seg-color via setProperty',
);
assert.ok(!assignedChip.querySelector('.gpi-bar-seg-name'), 'assigned chip should not show truncated name');
assert.match(assignedChip.getAttribute('aria-label') || '', /Exercise 1:/);
const nameInput = host.querySelector('.gpi-seg-name');
assert.ok(nameInput);
assert.ok(nameInput.value.length > 0, 'segment should have an auto name');

// ---- typing renames the segment ----
nameInput.value = 'Verse chunk';
nameInput.input();
assert.equal(nameInput.value, 'Verse chunk');

// ---- import button label + onImport payload shape ----
let imported = null;
const importHost = document.createElement('div');
document.body.appendChild(importHost);
const importDigests = makeDigests(4);
const importPanel = mountExerciseImportPanel(importHost, {
  getDigests: () => importDigests,
  getBpm: () => 120,
  onImport: async (segments, opts) => {
    imported = { segments, opts };
    return { ok: true, count: segments.length, message: `Added ${segments.length} exercises to Exercises.` };
  },
});
importPanel.open();
selectRange(importHost, 0, 1);
importHost.querySelector('.gpi-group-btn').click();
const importBtn = importHost.querySelector('.gpi-import-btn');
assert.equal(importBtn.textContent, 'Add 1 exercise');
importBtn.click();
await new Promise((r) => setTimeout(r, 0));
assert.ok(imported);
assert.equal(imported.segments.length, 1);
const seg = imported.segments[0];
assert.equal(seg.startIdx, 0);
assert.equal(seg.endIdx, 1);
assert.equal(seg.bars, 2);
assert.equal(seg.name, formatBarRange(0, 1));
const beats = segmentBeats({ startIdx: 0, endIdx: 1 }, importDigests);
assert.equal(seg.startBeat, beats.startBeat);
assert.equal(seg.endBeat, beats.endBeat);
const statusOk = importHost.querySelector('.gpi-status');
assert.ok(statusOk);
assert.match(statusOk.textContent, /Added 1 exercises/);
assert.equal(importBtn.textContent, 'Added ✓');
assert.equal(importBtn.disabled, true);
importBtn.click();
await new Promise((r) => setTimeout(r, 0));
assert.equal(imported.segments.length, 1, 'double import should be blocked');

// ---- editing after import re-enables the button ----
const renameInput = importHost.querySelector('.gpi-seg-name');
renameInput.value = 'Renamed chunk';
renameInput.input();
assert.equal(importBtn.disabled, false);
assert.equal(importBtn.textContent, 'Add 1 exercise');

// ---- failed onImport shows error in status ----
const failHost = document.createElement('div');
document.body.appendChild(failHost);
const failPanel = mountExerciseImportPanel(failHost, {
  getDigests: () => makeDigests(2),
  onImport: async () => ({ ok: false, message: 'Disk full.' }),
});
failPanel.open();
selectBar(failHost, 0);
failHost.querySelector('.gpi-group-btn').click();
failHost.querySelector('.gpi-import-btn').click();
await new Promise((r) => setTimeout(r, 0));
const failStatus = failHost.querySelector('.gpi-status');
assert.ok(failStatus.classList.contains('is-error'));
assert.equal(failStatus.textContent, 'Disk full.');

// ---- auto-split every 4 bars ----
const splitHost = document.createElement('div');
document.body.appendChild(splitHost);
const splitDigests = makeDigests(10);
const splitPanel = mountExerciseImportPanel(splitHost, {
  getDigests: () => splitDigests,
});
splitPanel.open();
const everyInput = splitHost.querySelector('.gpi-every-input');
everyInput.value = '4';
splitHost.querySelector('.gpi-every-btn').click();
assert.equal(splitHost.querySelectorAll('.gpi-seg').length, 3);

// ---- destroy empties host ----
panel.destroy();
assert.equal(host.innerHTML, '');
importPanel.destroy();
failPanel.destroy();
splitPanel.destroy();

console.log('gp exercise import ui: ok');
