// Node tests for the Exercises course-import engine.
// Run: node tests/exercises/course-import.mjs

import assert from 'node:assert/strict';
import {
  COURSE_MAX_FILE_BYTES,
  courseDepthBudget,
  planCourseImport,
  includedCourseNodes,
  summarizeCoursePlan,
  importCoursePlan,
} from '../../js/courseImport.js';
import { MAX_FOLDER_DEPTH } from '../../js/folderTree.js';

function fakeFile({ path, type = '', size = 1024 }) {
  const name = path.split('/').pop();
  return {
    name,
    webkitRelativePath: path,
    type,
    size,
    async arrayBuffer() { return new ArrayBuffer(0); },
    async text() { return ''; },
  };
}

/** A tiny in-memory stand-in for the two stores the import writes to. */
function makeStores() {
  const categories = [];
  const items = [];
  const workbookFolders = [];
  const workbooks = [];
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${++seq}`;

  function depthOf(folders, id) {
    let depth = 0;
    let current = id;
    while (current) {
      const folder = folders.find((f) => f.id === current);
      if (!folder) break;
      depth += 1;
      current = folder.parentId;
    }
    return depth;
  }

  return {
    categories,
    items,
    workbookFolders,
    workbooks,
    createExerciseFolder(name, parentId = '') {
      const existing = categories.find(
        (c) => c.parentId === (parentId || '') && c.name === name,
      );
      if (existing) return existing;
      if (depthOf(categories, parentId) + 1 > MAX_FOLDER_DEPTH) return null;
      const folder = { id: nextId('cat'), name, parentId: parentId || '' };
      categories.push(folder);
      return folder;
    },
    addExercise(opts) {
      const item = { id: nextId('ex'), ...opts };
      items.unshift(item);
      return item;
    },
    createWorkbookFolder(name, parentId = '') {
      const existing = workbookFolders.find(
        (f) => f.parentId === (parentId || '') && f.name === name,
      );
      if (existing) return existing;
      if (depthOf(workbookFolders, parentId) + 1 > MAX_FOLDER_DEPTH) return null;
      const folder = { id: nextId('wbf'), name, parentId: parentId || '' };
      workbookFolders.push(folder);
      return folder;
    },
    createWorkbook({ name, folderId, exerciseIds }) {
      const wb = { id: nextId('wb'), name, folderId: folderId || '', exerciseIds: [...exerciseIds] };
      workbooks.push(wb);
      return wb;
    },
    saveFile({ fileName, size, type }) {
      return Promise.resolve({ id: nextId('att'), fileName, size, type });
    },
  };
}

function importDeps(stores, extra = {}) {
  return {
    createExerciseFolder: stores.createExerciseFolder,
    addGpExercise: stores.addExercise,
    addMediaExercise: stores.addExercise,
    createWorkbookFolder: stores.createWorkbookFolder,
    createWorkbook: stores.createWorkbook,
    saveFile: stores.saveFile,
    attachmentsSupported: () => true,
    ensurePersistentStorage: async () => true,
    ...extra,
  };
}

const courseFiles = [
  fakeFile({ path: 'Blues Course/Module 1/01 Intro.mp4', type: 'video/mp4' }),
  fakeFile({ path: 'Blues Course/Module 1/02 Shuffle.gp5' }),
  fakeFile({ path: 'Blues Course/Module 2/Lesson A/riff.mp4', type: 'video/mp4' }),
  fakeFile({ path: 'Blues Course/Module 2/Lesson A/riff.gp' }),
  fakeFile({ path: 'Blues Course/Welcome.pdf', type: 'application/pdf' }),
];

// --- planning ---------------------------------------------------------------

{
  const plan = planCourseImport(courseFiles);
  assert.equal(plan.rootName, 'Blues Course');
  assert.equal(plan.fileCount, 5);
  // Course root + Module 1 + Module 2 + Module 2/Lesson A.
  assert.equal(plan.folderCount, 4);
  // Module 2 holds only a subfolder, so it gets no workbook.
  assert.equal(plan.workbookCount, 3);
  assert.equal(plan.skipped.length, 0);

  const paths = plan.nodes.map((n) => n.path);
  assert.deepEqual(paths, ['', 'Module 1', 'Module 2', 'Module 2/Lesson A']);

  const moduleOne = plan.nodes.find((n) => n.path === 'Module 1');
  assert.deepEqual(moduleOne.files.map((f) => f.fileName), ['01 Intro.mp4', '02 Shuffle.gp5']);
  assert.equal(moduleOne.files[1].isGuitarPro, true);
  assert.equal(moduleOne.files[0].name, '01 Intro');
  console.log('course-import: mirrors the folder tree — ok');
}

{
  const plan = planCourseImport([
    fakeFile({ path: 'C/Lesson 10/a.mp4', type: 'video/mp4' }),
    fakeFile({ path: 'C/Lesson 2/b.mp4', type: 'video/mp4' }),
    fakeFile({ path: 'C/Lesson 2/10 take.mp4', type: 'video/mp4' }),
    fakeFile({ path: 'C/Lesson 2/2 take.mp4', type: 'video/mp4' }),
  ]);
  assert.deepEqual(plan.nodes.map((n) => n.name), ['C', 'Lesson 2', 'Lesson 10']);
  const lessonTwo = plan.nodes.find((n) => n.path === 'Lesson 2');
  assert.deepEqual(lessonTwo.files.map((f) => f.fileName), ['2 take.mp4', '10 take.mp4', 'b.mp4']);
  console.log('course-import: sorts folders and files the way a reader counts — ok');
}

{
  const plan = planCourseImport([
    fakeFile({ path: 'C/notes.txt', type: 'text/plain' }),
    fakeFile({ path: 'C/archive.zip', type: 'application/zip' }),
    fakeFile({ path: 'C/huge.mp4', type: 'video/mp4', size: COURSE_MAX_FILE_BYTES + 1 }),
    fakeFile({ path: 'C/.DS_Store' }),
    fakeFile({ path: 'C/__MACOSX/junk.mp4', type: 'video/mp4' }),
  ]);
  assert.equal(plan.fileCount, 1);
  assert.deepEqual(
    plan.skipped.map((s) => [s.fileName, s.reason]),
    [['archive.zip', 'unsupported'], ['huge.mp4', 'too-large']],
  );
  console.log('course-import: skips unsupported, oversized, and system files — ok');
}

{
  // Empty branches never become folders.
  const plan = planCourseImport([
    fakeFile({ path: 'C/Empty/readme.zip', type: 'application/zip' }),
    fakeFile({ path: 'C/Full/a.mp4', type: 'video/mp4' }),
  ]);
  assert.deepEqual(plan.nodes.map((n) => n.path), ['', 'Full']);
  console.log('course-import: drops folders with nothing to add — ok');
}

{
  assert.equal(courseDepthBudget(0), MAX_FOLDER_DEPTH - 1);
  assert.equal(courseDepthBudget(2), MAX_FOLDER_DEPTH - 3);
  assert.equal(courseDepthBudget(MAX_FOLDER_DEPTH), 0);

  const deepPath = 'C/' + ['a', 'b', 'c', 'd', 'e', 'f'].join('/') + '/deep.mp4';
  const plan = planCourseImport([fakeFile({ path: deepPath, type: 'video/mp4' })]);
  assert.equal(plan.flattened, 1);
  const deepest = plan.nodes[plan.nodes.length - 1];
  assert.equal(deepest.depth, MAX_FOLDER_DEPTH);
  assert.equal(deepest.files.length, 1);
  console.log('course-import: keeps folders inside the depth limit — ok');
}

// --- include toggles --------------------------------------------------------

{
  const plan = planCourseImport(courseFiles);
  plan.nodes.find((n) => n.path === 'Module 2').include = false;
  const included = includedCourseNodes(plan);
  assert.deepEqual(included.map((n) => n.path), ['', 'Module 1']);

  const summary = summarizeCoursePlan(plan, { makeWorkbooks: true });
  assert.equal(summary.exercises, 3);
  assert.equal(summary.folders, 2);
  assert.equal(summary.workbooks, 2);

  const noWorkbooks = summarizeCoursePlan(plan, { makeWorkbooks: false });
  assert.equal(noWorkbooks.workbooks, 0);
  console.log('course-import: turning a folder off turns off the folders below — ok');
}

// --- import -----------------------------------------------------------------

{
  const stores = makeStores();
  const plan = planCourseImport(courseFiles);
  const result = await importCoursePlan(plan, importDeps(stores));

  assert.equal(result.ok, true);
  assert.equal(result.exercises, 5);
  assert.equal(result.folders, 4);
  assert.equal(result.workbooks, 3);
  assert.deepEqual(result.errors, []);

  const root = stores.categories.find((c) => c.name === 'Blues Course');
  assert.equal(root.parentId, '');
  const moduleOne = stores.categories.find((c) => c.name === 'Module 1');
  assert.equal(moduleOne.parentId, root.id);
  const lessonA = stores.categories.find((c) => c.name === 'Lesson A');
  const moduleTwo = stores.categories.find((c) => c.name === 'Module 2');
  assert.equal(lessonA.parentId, moduleTwo.id);

  // The library shows the newest first, so the saved order runs backwards.
  assert.deepEqual(
    stores.items.map((it) => it.fileName),
    ['Welcome.pdf', '01 Intro.mp4', '02 Shuffle.gp5', 'riff.gp', 'riff.mp4'],
  );
  const intro = stores.items.find((it) => it.fileName === '01 Intro.mp4');
  assert.equal(intro.categoryId, moduleOne.id);
  assert.equal(intro.name, '01 Intro');

  const names = stores.workbooks.map((wb) => wb.name).sort();
  assert.deepEqual(names, ['Blues Course', 'Lesson A', 'Module 1']);

  const wbModuleOne = stores.workbooks.find((wb) => wb.name === 'Module 1');
  assert.equal(wbModuleOne.exerciseIds.length, 2);
  const wbRootFolder = stores.workbookFolders.find((f) => f.name === 'Blues Course');
  assert.equal(wbRootFolder.parentId, '');
  assert.equal(wbModuleOne.folderId, wbRootFolder.id);

  const wbLessonA = stores.workbooks.find((wb) => wb.name === 'Lesson A');
  const wbModuleTwoFolder = stores.workbookFolders.find((f) => f.name === 'Module 2');
  assert.equal(wbModuleTwoFolder.parentId, wbRootFolder.id);
  assert.equal(wbLessonA.folderId, wbModuleTwoFolder.id);

  // A workbook lists its folder in course order.
  const moduleOneItems = wbModuleOne.exerciseIds.map(
    (id) => stores.items.find((it) => it.id === id).fileName,
  );
  assert.deepEqual(moduleOneItems, ['01 Intro.mp4', '02 Shuffle.gp5']);
  console.log('course-import: mirrors the course into exercises and workbooks — ok');
}

{
  const stores = makeStores();
  const plan = planCourseImport(courseFiles);
  const result = await importCoursePlan(plan, importDeps(stores, { makeWorkbooks: false }));
  assert.equal(result.exercises, 5);
  assert.equal(result.workbooks, 0);
  assert.equal(stores.workbooks.length, 0);
  assert.equal(stores.workbookFolders.length, 0);
  console.log('course-import: can import the exercises without workbooks — ok');
}

{
  const stores = makeStores();
  const parent = stores.createExerciseFolder('Courses', '');
  const plan = planCourseImport(courseFiles, { baseDepth: 1 });
  const result = await importCoursePlan(plan, importDeps(stores, {
    parentCategoryId: parent.id,
  }));
  assert.equal(result.ok, true);
  const root = stores.categories.find((c) => c.name === 'Blues Course');
  assert.equal(root.parentId, parent.id);
  console.log('course-import: files the course under the folder that is open — ok');
}

{
  const stores = makeStores();
  const plan = planCourseImport(courseFiles);
  const result = await importCoursePlan(plan, importDeps(stores, {
    attachmentsSupported: () => false,
  }));
  assert.equal(result.ok, false);
  assert.equal(stores.items.length, 0);
  assert.match(result.message, /storage/i);
  console.log('course-import: stops when browser storage is unavailable — ok');
}

{
  const stores = makeStores();
  const plan = planCourseImport([
    fakeFile({ path: 'C/only.zip', type: 'application/zip' }),
  ]);
  const result = await importCoursePlan(plan, importDeps(stores));
  assert.equal(result.ok, false);
  assert.equal(result.message, 'No files to import.');
  console.log('course-import: reports a course with nothing to add — ok');
}

{
  // One bad file must not stop the rest of the course.
  const stores = makeStores();
  let calls = 0;
  const plan = planCourseImport(courseFiles);
  const result = await importCoursePlan(plan, importDeps(stores, {
    saveFile(opts) {
      calls += 1;
      if (opts.fileName === 'riff.gp') throw new Error('disk full');
      return Promise.resolve({ id: `att-x-${calls}` });
    },
  }));
  assert.equal(result.exercises, 4);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /disk full/);
  assert.match(result.message, /1 file had errors/);
  console.log('course-import: keeps going when one file fails — ok');
}

console.log('course-import tests: ok');
