// Integration tests for Exercises bulk-upload UI ↔ engine seam.
// Run: node tests/exercises/bulk-upload-ui.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';
import { serializeExerciseScore } from '../../js/gpExerciseScore.js';
import { buildMeasureDigests } from '../../js/gpPlayer/measureDigest.js';
import { autoSplitByMarkers } from '../../js/gpPlayer/exerciseSegments.js';
import { analyzeBulkFiles } from '../../js/exercisesBulk.js';

installDomShim();
installIdbShim();

const { openBulkUploadDialog, closeBulkUploadDialog } = await import('../../js/exercisesBulkUI.js');

const tick = () => new Promise((r) => setTimeout(r, 0));

async function waitForSelector(sel, { tries = 50, msg = sel } = {}) {
  for (let i = 0; i < tries; i++) {
    const hit = document.querySelector(sel);
    if (hit) return hit;
    await tick();
  }
  throw new Error(`timed out waiting for ${msg}`);
}

async function waitForReview() {
  await waitForSelector('.exbulk-file', { msg: 'review phase (.exbulk-file)' });
}

async function waitForDone() {
  await waitForSelector('.exbulk-done', { msg: 'done phase (.exbulk-done)' });
}

function fakeFile({ name, type = '', size = 0, text = null }) {
  const body = text ?? '';
  return {
    name,
    type,
    size: size || body.length,
    async arrayBuffer() {
      return new TextEncoder().encode(body).buffer;
    },
    async text() {
      return body;
    },
  };
}

function makeGpModel({ measures, events = [] }) {
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    ],
    events,
    measures,
    tempo: 120,
    totalBeats: measures.length ? measures[measures.length - 1].endBeat : 0,
    slots: measures.length ? measures[measures.length - 1].endSlot : 0,
    techniqueCounts: {},
    warnings: [],
  };
}

function makeGpResult(model) {
  return {
    format: 'gp5',
    tracks: [{ name: 'Guitar', model }],
    drumTracks: [],
    parts: [],
    defaultIndex: 0,
    model,
    ascii: '',
    meta: {},
  };
}

function makeMarkedScore() {
  const measures = [];
  const events = [];
  for (let i = 0; i < 12; i++) {
    const startBeat = i * 4;
    const endBeat = startBeat + 4;
    const marker = i === 2 ? 'Verse' : i === 5 ? 'Chorus' : i === 8 ? 'Bridge' : null;
    measures.push({
      startSlot: i * 4,
      endSlot: (i + 1) * 4,
      startBeat,
      endBeat,
      marker,
      timeSig: [4, 4],
    });
    events.push({
      slot: startBeat,
      start: startBeat,
      duration: 1,
      stringIndex: 0,
      fret: i % 5,
      midi: 40 + (i % 5),
      pc: 4,
      techniques: [],
      dead: false,
    });
  }
  return makeGpResult(makeGpModel({ measures, events }));
}

function makeUnmarkedScore(barCount = 16) {
  const measures = [];
  const events = [];
  for (let i = 0; i < barCount; i++) {
    const startBeat = i * 4;
    const endBeat = startBeat + 4;
    measures.push({
      startSlot: i * 4,
      endSlot: (i + 1) * 4,
      startBeat,
      endBeat,
      marker: null,
      timeSig: [4, 4],
    });
    events.push({
      slot: startBeat,
      start: 0,
      duration: 1,
      stringIndex: 0,
      fret: 0,
      midi: 40,
      pc: 4,
      techniques: [],
      dead: false,
    });
  }
  return makeGpResult(makeGpModel({ measures, events }));
}

function tabFileFromGp(gp, baseName) {
  const json = serializeExerciseScore(gp);
  return fakeFile({
    name: `${baseName}.musi-tab.json`,
    type: 'application/x-musi-tab-model',
    text: json,
  });
}

function resetBody() {
  closeBulkUploadDialog();
  document.body.children = [];
}

// ---- .musi-tab.json fixture round-trip ----
const markedGp = makeMarkedScore();
const markedTab = tabFileFromGp(markedGp, 'Marked');
const roundTrip = await analyzeBulkFiles([markedTab]);
const expectedSegments = autoSplitByMarkers(
  buildMeasureDigests({ guitarModel: markedGp.tracks[0].model, percModel: null }),
);
assert.equal(roundTrip[0].sectionCount, 3);
assert.equal(roundTrip[0].segments.length, expectedSegments.length);
assert.equal(expectedSegments.length, 4);
console.log('musi-tab.json fixture: ok');

// ---- open → analyze → review ----
resetBody();
openBulkUploadDialog({ files: [markedTab, fakeFile({ name: 'notes.pdf', type: 'application/pdf', size: 12 })] });
assert.ok(document.querySelector('.exbulk-root'), 'dialog root should mount on body');
await waitForReview();
assert.equal(document.querySelectorAll('.exbulk-file').length, 2);
console.log('open analyze review: ok');

// ---- section split default + plan counts ----
const markedRow = [...document.querySelectorAll('.exbulk-file')].find((row) =>
  row.querySelector('.exbulk-file-name')?.textContent === 'Marked.musi-tab.json',
);
assert.ok(markedRow);
assert.match(markedRow.querySelector('.exbulk-plan').textContent, /4 sections/);
const splitCheck = document.querySelector('.exbulk-opt-split')?.querySelector('input');
assert.ok(splitCheck);
assert.equal(splitCheck.checked, true);
const addBtn = document.querySelector('.exbulk-add');
assert.match(addBtn.textContent, /Add 5 exercises/);
const markedDest = markedRow.querySelector('.exbulk-dest');
assert.ok(markedDest, 'split score should show destination folder');
assert.equal(markedDest.textContent, '\u2192 Marked');
const folderPerSplitCheck = document.querySelector('.exbulk-opt-folder-split')?.querySelector('input');
assert.ok(folderPerSplitCheck);
assert.equal(folderPerSplitCheck.checked, true);
const perFileOption = [...document.querySelector('.exbulk-folder').options]
  .find((o) => o.value === '__perfile__');
assert.equal(perFileOption, undefined, 'per-file folder option removed');
console.log('section split default: ok');

// ---- toggle split off re-plans without re-parse ----
splitCheck.checked = false;
splitCheck.change();
const markedRowAfter = () => [...document.querySelectorAll('.exbulk-file')].find((row) =>
  row.querySelector('.exbulk-file-name')?.textContent === 'Marked.musi-tab.json',
);
const markedPlan = () => markedRowAfter()?.querySelector('.exbulk-plan');
assert.match(markedPlan().textContent, /Whole file/);
assert.equal(markedRowAfter()?.querySelector('.exbulk-dest'), null, 'no dest chip when not split');
assert.match(addBtn.textContent, /Add 2 exercises/);
splitCheck.checked = true;
splitCheck.change();
assert.match(markedPlan().textContent, /4 sections/);
assert.ok(markedRowAfter()?.querySelector('.exbulk-dest'));
console.log('toggle split off: ok');

// ---- destination chip toggles with folder-per-split checkbox ----
resetBody();
openBulkUploadDialog({ files: [markedTab] });
await waitForReview();
const destCheck = document.querySelector('.exbulk-opt-folder-split')?.querySelector('input');
assert.ok(destCheck?.checked);
assert.ok(document.querySelector('.exbulk-dest'));
destCheck.checked = false;
destCheck.change();
assert.equal(document.querySelector('.exbulk-dest'), null);
destCheck.checked = true;
destCheck.change();
assert.ok(document.querySelector('.exbulk-dest'));
console.log('folder per split checkbox: ok');

// ---- fallback every N bars ----
resetBody();
const unmarkedTab = tabFileFromGp(makeUnmarkedScore(16), 'Plain');
openBulkUploadDialog({ files: [unmarkedTab] });
await waitForReview();
const fallbackSelect = document.querySelector('.exbulk-fallback');
const everyInput = document.querySelector('.exbulk-every-input');
assert.ok(fallbackSelect);
assert.ok(everyInput);
assert.equal(everyInput.disabled, true);
fallbackSelect.value = 'everyN';
fallbackSelect.change();
assert.equal(everyInput.disabled, false);
assert.match(document.querySelector('.exbulk-plan').textContent, /2 chunks of 8 bars/);
assert.match(document.querySelector('.exbulk-add').textContent, /Add 2 exercises/);
everyInput.value = '4';
everyInput.change();
assert.match(document.querySelector('.exbulk-plan').textContent, /4 chunks of 4 bars/);
assert.match(document.querySelector('.exbulk-add').textContent, /Add 4 exercises/);
fallbackSelect.value = 'whole';
fallbackSelect.change();
assert.equal(everyInput.disabled, true);
console.log('fallback every N bars: ok');

// ---- exclude row from import ----
resetBody();
openBulkUploadDialog({ files: [markedTab, fakeFile({ name: 'extra.pdf', type: 'application/pdf', size: 8 })] });
await waitForReview();
const rows = [...document.querySelectorAll('.exbulk-file')];
const pdfRow = rows.find((row) => row.querySelector('.exbulk-file-name')?.textContent === 'extra.pdf');
assert.ok(pdfRow);
const pdfCheck = pdfRow.querySelector('.exbulk-file-check');
pdfCheck.checked = false;
pdfCheck.change();
assert.match(document.querySelector('.exbulk-summary').textContent, /1 file · 4 exercises/);
assert.match(document.querySelector('.exbulk-add').textContent, /Add 4 exercises/);
const gpAdds = [];
openBulkUploadDialog({
  files: [markedTab, fakeFile({ name: 'extra.pdf', type: 'application/pdf', size: 8 })],
  addGpExercise: (opts) => { gpAdds.push(opts); return { id: `ex-${gpAdds.length}` }; },
  addMediaExercise: () => null,
});
await waitForReview();
const pdfRow2 = [...document.querySelectorAll('.exbulk-file')].find((row) =>
  row.querySelector('.exbulk-file-name')?.textContent === 'extra.pdf',
);
pdfRow2.querySelector('.exbulk-file-check').checked = false;
pdfRow2.querySelector('.exbulk-file-check').change();
document.querySelector('.exbulk-add').click();
await waitForDone();
assert.equal(gpAdds.length, 4);
console.log('exclude row: ok');

// ---- import happy path ----
resetBody();
const happyAdds = [];
openBulkUploadDialog({
  files: [markedTab],
  addGpExercise: (opts) => { happyAdds.push(opts); return { id: `ex-${happyAdds.length}` }; },
  addMediaExercise: () => { throw new Error('addMediaExercise should not run'); },
  createFolder: () => null,
});
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForDone();
const doneMsg = document.querySelector('.exbulk-done-msg');
assert.ok(doneMsg);
assert.match(doneMsg.textContent, /Added 4 exercises from 1 file/);
assert.equal(happyAdds.length, 4);
assert.ok(happyAdds.every((c) => c.type === 'application/x-musi-tab-model' && c.loopEnabled === true));
console.log('import happy path: ok');

// ---- onDone contract ----
let doneCalls = 0;
let donePayload = null;
openBulkUploadDialog({
  files: [markedTab],
  addGpExercise: () => ({ id: 'ex-done' }),
  addMediaExercise: () => null,
  onDone: (res) => {
    doneCalls += 1;
    donePayload = res;
  },
});
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForDone();
document.querySelector('.exbulk-add').click();
assert.equal(document.querySelector('.exbulk-root'), null);
assert.equal(doneCalls, 1);
assert.ok(donePayload?.ok);
assert.match(donePayload?.message, /Added 4 exercises/);
console.log('onDone contract: ok');

// ---- escape / backdrop ignored while importing ----
resetBody();
openBulkUploadDialog({
  files: [markedTab],
  addGpExercise: () => ({ id: 'ex-esc' }),
  addMediaExercise: () => null,
});
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForSelector('.exbulk-importing', { msg: 'importing phase' });
document.dispatchKey('keydown', { key: 'Escape' });
assert.ok(document.querySelector('.exbulk-root'), 'escape should not close while importing');
const backdrop = document.querySelector('.exbulk-backdrop');
backdrop.click();
assert.ok(document.querySelector('.exbulk-root'), 'backdrop should not close while importing');
await waitForDone();
resetBody();
openBulkUploadDialog({ files: [markedTab] });
await waitForReview();
document.dispatchKey('keydown', { key: 'Escape' });
assert.equal(document.querySelector('.exbulk-root'), null);
resetBody();
openBulkUploadDialog({ files: [markedTab] });
await waitForReview();
document.querySelector('.exbulk-backdrop').click();
assert.equal(document.querySelector('.exbulk-root'), null);
console.log('escape backdrop phases: ok');

// ---- reopen resets state ----
resetBody();
openBulkUploadDialog({ files: [markedTab] });
await waitForReview();
const split = document.querySelector('.exbulk-opt-split')?.querySelector('input');
split.checked = false;
split.change();
assert.match(document.querySelector('.exbulk-add').textContent, /Add 1 exercise/);
closeBulkUploadDialog();
openBulkUploadDialog({ files: [unmarkedTab] });
await waitForReview();
assert.equal(document.querySelectorAll('.exbulk-file').length, 1);
assert.equal(document.querySelector('.exbulk-file-name').textContent, 'Plain.musi-tab.json');
assert.equal(document.querySelector('.exbulk-opt-split')?.querySelector('input')?.checked, true);
assert.match(document.querySelector('.exbulk-plan').textContent, /Whole file — no section markers/);
console.log('reopen resets state: ok');

// ---- zero usable files ----
resetBody();
const blockedAdds = [];
openBulkUploadDialog({
  files: [fakeFile({ name: 'bad.exe', size: 10 }), fakeFile({ name: 'worse.bin', size: 5 })],
  addGpExercise: (opts) => { blockedAdds.push(opts); return { id: 'x' }; },
  addMediaExercise: () => null,
});
await waitForReview();
const blockedBtn = document.querySelector('.exbulk-add');
assert.equal(blockedBtn.disabled, true);
blockedBtn.click();
await tick();
assert.equal(blockedAdds.length, 0);
assert.ok(document.querySelector('.exbulk-root'));
console.log('zero usable files: ok');

resetBody();
console.log('\nall bulk-upload-ui tests passed');
