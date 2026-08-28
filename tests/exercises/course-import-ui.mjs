// Integration tests for the Exercises course-import UI ↔ engine seam.
// Run: node tests/exercises/course-import-ui.mjs

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installIdbShim } from './idbShim.mjs';

installDomShim();
installIdbShim();

const { openCourseImportDialog, closeCourseImportDialog } = await import('../../js/courseImportUI.js');

const tick = () => new Promise((r) => setTimeout(r, 5));

async function waitForSelector(sel, { tries = 60, msg = sel } = {}) {
  for (let i = 0; i < tries; i++) {
    const hit = document.querySelector(sel);
    if (hit) return hit;
    await tick();
  }
  throw new Error(`timed out waiting for ${msg}`);
}

const waitForReview = () => waitForSelector('.excourse-row', { msg: 'review phase' });
const waitForDone = () => waitForSelector('.exbulk-done', { msg: 'done phase' });

function fakeFile({ path, type = '', size = 2048 }) {
  return {
    name: path.split('/').pop(),
    webkitRelativePath: path,
    type,
    size,
    async arrayBuffer() { return new ArrayBuffer(0); },
    async text() { return ''; },
  };
}

const courseFiles = [
  fakeFile({ path: 'Blues Course/Module 1/01 Intro.mp4', type: 'video/mp4' }),
  fakeFile({ path: 'Blues Course/Module 1/02 Shuffle.gp5' }),
  fakeFile({ path: 'Blues Course/Module 2/Lesson A/riff.mp4', type: 'video/mp4' }),
  fakeFile({ path: 'Blues Course/Welcome.pdf', type: 'application/pdf' }),
  fakeFile({ path: 'Blues Course/notes.zip', type: 'application/zip' }),
];

/** Records everything the dialog asks the stores to do. */
function makeSpy() {
  const calls = {
    exerciseFolders: [], exercises: [], workbookFolders: [], workbooks: [],
  };
  let seq = 0;
  return {
    calls,
    deps: {
      createExerciseFolder(name, parentId) {
        calls.exerciseFolders.push({ name, parentId });
        return { id: `cat-${++seq}`, name, parentId };
      },
      addGpExercise(opts) {
        calls.exercises.push(opts);
        return { id: `ex-${++seq}` };
      },
      addMediaExercise(opts) {
        calls.exercises.push(opts);
        return { id: `ex-${++seq}` };
      },
      createWorkbookFolder(name, parentId) {
        calls.workbookFolders.push({ name, parentId });
        return { id: `wbf-${++seq}`, name, parentId };
      },
      createWorkbook(opts) {
        calls.workbooks.push(opts);
        return { id: `wb-${++seq}` };
      },
    },
  };
}

function resetBody() {
  closeCourseImportDialog();
  document.body.children = [];
}

const rowNames = () => [...document.querySelectorAll('.excourse-row')]
  .map((row) => row.querySelector('.exbulk-file-name').textContent);

// ---- open → read → review ----
resetBody();
openCourseImportDialog({ files: courseFiles });
assert.ok(document.querySelector('.exbulk-root'), 'dialog root should mount on body');
await waitForReview();
assert.deepEqual(rowNames(), ['Blues Course', 'Module 1', 'Module 2', 'Lesson A']);
assert.match(
  document.querySelector('.exbulk-summary').textContent,
  /4 exercises · 4 folders · 3 workbooks will be added\. 1 file skipped\./,
);
assert.equal(document.querySelector('.excourse-name-input').value, 'Blues Course');
assert.match(document.querySelector('.exbulk-add').textContent, /Import course/);
console.log('open read review: ok');

// ---- the skipped file is named ----
assert.match(document.querySelector('.exbulk-skip').textContent, /notes\.zip/);
console.log('skipped file listed: ok');

// ---- renaming the course renames the top row ----
const nameInput = document.querySelector('.excourse-name-input');
nameInput.value = 'Blues 101';
nameInput.input();
assert.equal(rowNames()[0], 'Blues 101');
console.log('rename course: ok');

// ---- turning a folder off turns off the folders below it ----
const moduleTwoRow = [...document.querySelectorAll('.excourse-row')]
  .find((row) => row.querySelector('.exbulk-file-name').textContent === 'Module 2');
const moduleTwoCheck = moduleTwoRow.querySelector('.exbulk-file-check');
moduleTwoCheck.checked = false;
moduleTwoCheck.change();
const offRows = [...document.querySelectorAll('.excourse-row')]
  .filter((row) => (row.className || '').includes('is-off'))
  .map((row) => row.querySelector('.exbulk-file-name').textContent);
assert.deepEqual(offRows, ['Module 2', 'Lesson A']);
assert.match(
  document.querySelector('.exbulk-summary').textContent,
  /3 exercises · 2 folders · 2 workbooks/,
);
moduleTwoCheck.checked = true;
moduleTwoCheck.change();
assert.match(document.querySelector('.exbulk-summary').textContent, /4 exercises · 4 folders/);
console.log('folder toggle cascades: ok');

// ---- the workbook option drops the workbooks from the plan ----
const workbookCheck = document.querySelector('.exbulk-opt').querySelector('input');
assert.equal(workbookCheck.checked, true);
assert.ok(document.querySelector('.exbulk-dest'), 'workbook chip shows by default');
workbookCheck.checked = false;
workbookCheck.change();
assert.equal(document.querySelector('.exbulk-dest'), null);
assert.match(
  document.querySelector('.exbulk-summary').textContent,
  /4 exercises · 4 folders will be added/,
);
console.log('workbook option: ok');

// ---- import mirrors the course into both libraries ----
resetBody();
const spy = makeSpy();
openCourseImportDialog({ files: courseFiles, ...spy.deps });
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForDone();

assert.deepEqual(
  spy.calls.exerciseFolders.map((c) => c.name),
  ['Blues Course', 'Module 1', 'Module 2', 'Lesson A'],
);
assert.equal(spy.calls.exerciseFolders[0].parentId, '');
// Module 1 is filed inside the course folder the import just made.
assert.equal(spy.calls.exerciseFolders[1].parentId, 'cat-1');
assert.equal(spy.calls.exercises.length, 4);
assert.deepEqual(
  spy.calls.workbooks.map((wb) => wb.name),
  ['Blues Course', 'Module 1', 'Lesson A'],
);
assert.equal(spy.calls.workbooks[1].exerciseIds.length, 2);
assert.match(
  document.querySelector('.exbulk-done-msg').textContent,
  /Imported 4 exercises into 4 folders and made 3 workbooks\. Skipped 1 file\./,
);
console.log('import mirrors the course: ok');

// ---- a renamed course renames both the folder and the workbook ----
resetBody();
const renameSpy = makeSpy();
openCourseImportDialog({ files: courseFiles, ...renameSpy.deps });
await waitForReview();
const renameInput = document.querySelector('.excourse-name-input');
renameInput.value = 'Blues 101';
renameInput.input();
document.querySelector('.exbulk-add').click();
await waitForDone();
assert.equal(renameSpy.calls.exerciseFolders[0].name, 'Blues 101');
assert.equal(renameSpy.calls.workbookFolders[0].name, 'Blues 101');
assert.equal(renameSpy.calls.workbooks[0].name, 'Blues 101');
console.log('rename reaches both libraries: ok');

// ---- the workbook option is honoured at import time ----
resetBody();
const noWbSpy = makeSpy();
openCourseImportDialog({ files: courseFiles, ...noWbSpy.deps });
await waitForReview();
const wbCheck2 = document.querySelector('.exbulk-opt').querySelector('input');
wbCheck2.checked = false;
wbCheck2.change();
document.querySelector('.exbulk-add').click();
await waitForDone();
assert.equal(noWbSpy.calls.workbooks.length, 0);
assert.equal(noWbSpy.calls.workbookFolders.length, 0);
assert.equal(noWbSpy.calls.exercises.length, 4);
console.log('import without workbooks: ok');

// ---- a folder turned off is never imported ----
resetBody();
const partialSpy = makeSpy();
openCourseImportDialog({ files: courseFiles, ...partialSpy.deps });
await waitForReview();
const modTwo = [...document.querySelectorAll('.excourse-row')]
  .find((row) => row.querySelector('.exbulk-file-name').textContent === 'Module 2')
  .querySelector('.exbulk-file-check');
modTwo.checked = false;
modTwo.change();
document.querySelector('.exbulk-add').click();
await waitForDone();
assert.deepEqual(
  partialSpy.calls.exerciseFolders.map((c) => c.name),
  ['Blues Course', 'Module 1'],
);
assert.equal(partialSpy.calls.exercises.length, 3);
console.log('excluded folder skipped: ok');

// ---- the folder picker chooses where the course lands ----
resetBody();
const nestedSpy = makeSpy();
openCourseImportDialog({
  files: courseFiles,
  folders: [{ id: 'cat-existing', name: 'Courses', parentId: '' }],
  defaultCategoryId: 'cat-existing',
  ...nestedSpy.deps,
});
await waitForReview();
assert.equal(document.querySelector('.exbulk-folder').value, 'cat-existing');
document.querySelector('.exbulk-add').click();
await waitForDone();
assert.equal(nestedSpy.calls.exerciseFolders[0].parentId, 'cat-existing');
console.log('folder picker: ok');

// ---- onDone runs once, with the result ----
resetBody();
let doneCalls = 0;
let donePayload = null;
const doneSpy = makeSpy();
openCourseImportDialog({
  files: courseFiles,
  ...doneSpy.deps,
  onDone: (res) => { doneCalls += 1; donePayload = res; },
});
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForDone();
document.querySelector('.exbulk-add').click();
assert.equal(document.querySelector('.exbulk-root'), null);
assert.equal(doneCalls, 1);
assert.equal(donePayload.ok, true);
assert.equal(donePayload.exercises, 4);
assert.equal(donePayload.workbooks, 3);
console.log('onDone contract: ok');

// ---- escape and backdrop do not close during the import ----
resetBody();
const escSpy = makeSpy();
openCourseImportDialog({ files: courseFiles, ...escSpy.deps });
await waitForReview();
document.querySelector('.exbulk-add').click();
await waitForSelector('.exbulk-importing', { msg: 'importing phase' });
document.dispatchKey('keydown', { key: 'Escape' });
assert.ok(document.querySelector('.exbulk-root'), 'escape must not close during the import');
document.querySelector('.exbulk-backdrop').click();
assert.ok(document.querySelector('.exbulk-root'), 'backdrop must not close during the import');
await waitForDone();

resetBody();
openCourseImportDialog({ files: courseFiles });
await waitForReview();
document.dispatchKey('keydown', { key: 'Escape' });
assert.equal(document.querySelector('.exbulk-root'), null);
console.log('escape backdrop phases: ok');

// ---- a folder with nothing usable stops at the done step ----
resetBody();
openCourseImportDialog({ files: [fakeFile({ path: 'C/only.zip', type: 'application/zip' })] });
await waitForDone();
assert.match(document.querySelector('.exbulk-done-msg').textContent, /No supported files/);
console.log('no supported files: ok');

resetBody();
openCourseImportDialog({ files: [] });
await waitForDone();
assert.match(document.querySelector('.exbulk-done-msg').textContent, /No folder selected/);
console.log('empty pick: ok');

resetBody();
console.log('\nall course-import-ui tests passed');
