// Course import dialog for the Exercises library — review the tree, then import.
//
// The dialog shows the folder tree the import will build, lets the user rename
// the course, choose where it goes, turn folders off, and decide whether the
// import also builds the workbooks. It reuses the bulk upload dialog styling.

import {
  COURSE_MAX_FILE_BYTES,
  planCourseImport,
  summarizeCoursePlan,
  importCoursePlan,
} from './courseImport.js';
import { flattenFolderTree, folderDepth } from './folderTree.js';
import {
  saveFile,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';

const KIND_LABELS = {
  gp: 'Guitar Pro',
  pdf: 'PDF',
  doc: 'Document',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  'tab-model': 'Tab',
};

const FOLDER_NAME_LIMIT = 40;
const FILES_SHOWN_PER_FOLDER = 4;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function countLabel(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

let root = null;
let previousFocus = null;
let openGen = 0;
let onDoneCb = null;
let keyHandler = null;
let backdropHandler = null;

let plan = null;
let phase = 'reading';
let importing = false;
let makeWorkbooks = true;
let parentCategoryId = '';
let importResult = null;

/** @type {{ id: string, name: string, parentId: string }[]} */
let foldersRef = [];
let depsRef = {};

let titleEl = null;
let bodyEl = null;
let footEl = null;
let summaryEl = null;
let addBtn = null;
let cancelBtn = null;
let nameInput = null;
let folderSelect = null;
let workbookCheck = null;
let treeEl = null;
let readingDetailEl = null;
let progressTrackEl = null;
let progressFillEl = null;
let progressLabelEl = null;

function canClose() {
  return !importing;
}

function removeListeners() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (backdropHandler && root) {
    const backdrop = root.querySelector('.exbulk-backdrop');
    if (backdrop) backdrop.removeEventListener('click', backdropHandler);
    backdropHandler = null;
  }
}

function clearRefs() {
  titleEl = null;
  bodyEl = null;
  footEl = null;
  summaryEl = null;
  addBtn = null;
  cancelBtn = null;
  nameInput = null;
  folderSelect = null;
  workbookCheck = null;
  treeEl = null;
  readingDetailEl = null;
  progressTrackEl = null;
  progressFillEl = null;
  progressLabelEl = null;
}

/** Close the course import dialog if it is open. */
export function closeCourseImportDialog() {
  if (!root) return;
  removeListeners();
  root.remove();
  root = null;
  clearRefs();
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try { previousFocus.focus(); } catch (e) { /* ignore */ }
  }
  previousFocus = null;
  onDoneCb = null;
  plan = null;
  importing = false;
}

function requestClose() {
  if (!canClose()) return;
  closeCourseImportDialog();
}

function currentCourseName() {
  const typed = (nameInput?.value || '').trim();
  return typed || plan?.rootName || 'Course';
}

function paintSummary() {
  if (!summaryEl || !plan) return;
  const s = summarizeCoursePlan(plan, { makeWorkbooks });
  if (!s.exercises) {
    summaryEl.textContent = 'Nothing to import.';
    return;
  }
  const parts = [
    countLabel(s.exercises, 'exercise', 'exercises'),
    countLabel(s.folders, 'folder', 'folders'),
  ];
  if (makeWorkbooks) parts.push(countLabel(s.workbooks, 'workbook', 'workbooks'));
  let text = `${parts.join(' · ')} will be added.`;
  if (s.skipped) text += ` ${countLabel(s.skipped, 'file', 'files')} skipped.`;
  summaryEl.textContent = text;
}

function paintAddBtn() {
  if (!addBtn) return;
  if (phase === 'importing') {
    addBtn.disabled = true;
    addBtn.textContent = 'Importing…';
    return;
  }
  if (phase === 'done') {
    addBtn.hidden = false;
    addBtn.disabled = false;
    addBtn.textContent = 'Done';
    return;
  }
  const s = plan ? summarizeCoursePlan(plan, { makeWorkbooks }) : { exercises: 0 };
  addBtn.hidden = false;
  addBtn.disabled = s.exercises === 0;
  addBtn.textContent = 'Import course';
}

function nodeIsOff(node) {
  return node.include === false;
}

/** Turning a folder off turns off every folder below it. */
function setNodeInclude(node, include) {
  node.include = include;
  const prefix = node.path ? `${node.path}/` : '';
  for (const other of plan.nodes) {
    if (other === node) continue;
    if (!node.path || other.path.startsWith(prefix)) other.include = include;
  }
  // Turning a folder back on needs its parents on too.
  if (include) {
    let parentPath = node.parentPath;
    while (node.path && parentPath !== undefined) {
      const parent = plan.nodes.find((n) => n.path === parentPath);
      if (!parent) break;
      parent.include = true;
      if (!parent.path) break;
      parentPath = parent.parentPath;
    }
  }
}

function fileSummaryText(node) {
  const names = node.files.map((f) => f.fileName);
  const shown = names.slice(0, FILES_SHOWN_PER_FOLDER).join(', ');
  const rest = names.length - FILES_SHOWN_PER_FOLDER;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

function kindTags(node) {
  const seen = [];
  for (const file of node.files) {
    const label = KIND_LABELS[file.kind] || 'File';
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
}

function buildTreeRow(node) {
  const off = nodeIsOff(node);
  const row = el('div', {
    class: 'excourse-row' + (off ? ' is-off' : ''),
    role: 'listitem',
    style: `--excourse-depth:${Math.max(0, node.depth - 1)}`,
  });

  const check = el('input', {
    type: 'checkbox',
    class: 'exbulk-file-check',
    'aria-label': `Include ${node.name}`,
  });
  check.checked = !off;
  check.addEventListener('change', () => {
    setNodeInclude(node, check.checked);
    paintTree();
    paintSummary();
    paintAddBtn();
  });

  const main = el('div', { class: 'exbulk-file-main' });
  const top = el('div', { class: 'exbulk-file-top' }, [
    el('span', { class: 'exbulk-file-name', text: node.path ? node.name : currentCourseName() }),
    ...kindTags(node).map((label) => el('span', { class: 'exbulk-kind', text: label })),
  ]);
  main.appendChild(top);

  if (node.files.length) {
    main.appendChild(el('div', { class: 'exbulk-plan-row' }, [
      el('span', {
        class: 'exbulk-plan',
        text: `${countLabel(node.files.length, 'exercise', 'exercises')} — ${fileSummaryText(node)}`,
      }),
      makeWorkbooks
        ? el('span', { class: 'exbulk-dest', text: `→ workbook "${node.path ? node.name : currentCourseName()}"` })
        : null,
    ]));
  } else {
    main.appendChild(el('span', { class: 'exbulk-plan', text: 'Folder only' }));
  }

  row.append(check, main);
  return row;
}

function paintTree() {
  if (!treeEl || !plan) return;
  while (treeEl.firstChild) treeEl.removeChild(treeEl.firstChild);
  plan.nodes.forEach((node) => treeEl.appendChild(buildTreeRow(node)));

  if (plan.skipped.length) {
    treeEl.appendChild(el('p', {
      class: 'exbulk-skip',
      text: `${countLabel(plan.skipped.length, 'file', 'files')} skipped: ${plan.skipped
        .slice(0, 6)
        .map((s) => s.fileName)
        .join(', ')}${plan.skipped.length > 6 ? '…' : ''}`,
    }));
  }
  if (plan.flattened) {
    treeEl.appendChild(el('p', {
      class: 'exbulk-warn',
      text: `${countLabel(plan.flattened, 'file sits', 'files sit')} deeper than folders can nest. Those files join the deepest folder that fits.`,
    }));
  }
}

function folderRows() {
  return flattenFolderTree(foldersRef);
}

function paintFolderSelect() {
  if (!folderSelect) return;
  while (folderSelect.firstChild) folderSelect.removeChild(folderSelect.firstChild);
  folderSelect.appendChild(el('option', { value: '', text: 'My Exercises (top level)' }));
  folderRows().forEach((row) => {
    folderSelect.appendChild(el('option', {
      value: row.id,
      text: `${'  '.repeat(Math.max(0, row.depth - 1))}${row.name}`,
    }));
  });
  folderSelect.value = folderRows().some((r) => r.id === parentCategoryId) ? parentCategoryId : '';
  parentCategoryId = folderSelect.value;
}

/** Re-read the picked files against the depth the chosen folder leaves. */
function replan(files) {
  const includeState = new Map((plan?.nodes || []).map((n) => [n.path, n.include !== false]));
  const courseName = nameInput ? currentCourseName() : '';
  plan = planCourseImport(files, {
    maxBytes: COURSE_MAX_FILE_BYTES,
    baseDepth: parentCategoryId ? folderDepth(foldersRef, parentCategoryId) : 0,
    courseName,
  });
  plan.nodes.forEach((node) => {
    if (includeState.has(node.path)) node.include = includeState.get(node.path);
  });
}

let pickedFiles = [];

function renderReview() {
  phase = 'review';
  if (!bodyEl || !footEl) return;
  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  const options = el('div', { class: 'exbulk-options' });

  nameInput = el('input', {
    type: 'text',
    class: 'exbulk-new-folder-input excourse-name-input',
    maxlength: String(FOLDER_NAME_LIMIT),
    'aria-label': 'Course name',
  });
  nameInput.value = plan.rootName;
  nameInput.addEventListener('input', () => {
    paintTree();
    paintSummary();
  });
  options.appendChild(el('div', { class: 'exbulk-folder-row' }, [
    el('span', { class: 'exbulk-folder-label' }, [el('span', { text: 'Course name' })]),
    el('div', { class: 'exbulk-folder-wrap' }, [nameInput]),
  ]));

  folderSelect = el('select', { class: 'exbulk-folder', 'aria-label': 'Folder for the course' });
  folderSelect.addEventListener('change', () => {
    parentCategoryId = folderSelect.value;
    replan(pickedFiles);
    paintTree();
    paintSummary();
    paintAddBtn();
  });
  options.appendChild(el('div', { class: 'exbulk-folder-row' }, [
    el('span', { class: 'exbulk-folder-label' }, [
      el('span', { text: 'Add to' }),
      el('span', { class: 'exbulk-folder-hint', text: 'The course folder goes in here' }),
    ]),
    el('div', { class: 'exbulk-folder-wrap' }, [folderSelect]),
  ]));

  workbookCheck = el('input', { type: 'checkbox' });
  workbookCheck.checked = makeWorkbooks;
  workbookCheck.addEventListener('change', () => {
    makeWorkbooks = workbookCheck.checked;
    paintTree();
    paintSummary();
    paintAddBtn();
  });
  options.appendChild(el('label', { class: 'exbulk-opt' }, [
    workbookCheck,
    el('span', { class: 'exbulk-opt-text' }, [
      el('span', { class: 'exbulk-opt-title', text: 'Also make a workbook for each folder' }),
      el('span', {
        class: 'exbulk-opt-hint',
        text: 'Workbook folders mirror the course. A folder with files becomes one workbook.',
      }),
    ]),
  ]));

  treeEl = el('div', { class: 'exbulk-files excourse-tree', role: 'list' });
  bodyEl.append(options, treeEl);

  if (!summaryEl) {
    summaryEl = el('div', { class: 'exbulk-summary', role: 'status', 'aria-live': 'polite' });
    footEl.insertBefore(summaryEl, footEl.firstChild);
  }

  paintFolderSelect();
  paintTree();
  paintSummary();
  paintAddBtn();
}

function renderReading(progress) {
  phase = 'reading';
  if (!bodyEl) return;
  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
  const wrap = el('div', { class: 'exbulk-analyzing' });
  wrap.appendChild(el('p', { class: 'exbulk-analyzing-title', text: 'Reading the course folder…' }));
  readingDetailEl = el('p', { class: 'exbulk-analyzing-detail', text: progress || '' });
  wrap.appendChild(readingDetailEl);
  bodyEl.appendChild(wrap);
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.textContent = 'Import course';
  }
}

function renderImporting(progress) {
  phase = 'importing';
  importing = true;
  if (!bodyEl) return;
  if (!progressTrackEl) {
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    const wrap = el('div', { class: 'exbulk-importing' });
    progressTrackEl = el('div', { class: 'exbulk-progress-track', role: 'progressbar' });
    progressFillEl = el('div', { class: 'exbulk-progress-fill' });
    progressTrackEl.appendChild(progressFillEl);
    progressLabelEl = el('p', { class: 'exbulk-import-label', text: 'Importing…' });
    wrap.append(progressTrackEl, progressLabelEl);
    bodyEl.appendChild(wrap);
  }
  if (progress && progress.total > 0) {
    const pct = Math.round(((progress.index + 1) / progress.total) * 100);
    progressFillEl.style.width = `${pct}%`;
    progressTrackEl.setAttribute('aria-valuenow', String(pct));
    progressTrackEl.setAttribute('aria-valuemin', '0');
    progressTrackEl.setAttribute('aria-valuemax', '100');
    progressLabelEl.textContent = `${progress.index + 1} of ${progress.total} — ${progress.label || ''}`;
  }
  paintAddBtn();
  if (cancelBtn) cancelBtn.disabled = true;
}

function renderDone(result) {
  phase = 'done';
  importing = false;
  importResult = result;
  progressTrackEl = null;
  progressFillEl = null;
  progressLabelEl = null;
  if (!bodyEl) return;
  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  const wrap = el('div', { class: 'exbulk-done' });
  wrap.appendChild(el('p', {
    class: 'exbulk-done-msg' + (result?.ok ? '' : ' is-error'),
    text: result?.message || (result?.ok ? 'Import complete.' : 'Import failed.'),
  }));
  if (result?.errors?.length) {
    const list = el('ul', { class: 'exbulk-errors' });
    result.errors.slice(0, 12).forEach((err) => {
      list.appendChild(el('li', { text: `${err.name}: ${err.message}` }));
    });
    wrap.appendChild(list);
  }
  bodyEl.appendChild(wrap);

  if (summaryEl) summaryEl.textContent = '';
  if (cancelBtn) {
    cancelBtn.hidden = true;
    cancelBtn.disabled = false;
  }
  paintAddBtn();
  if (addBtn) {
    addBtn.onclick = () => {
      const cb = onDoneCb;
      const res = importResult;
      closeCourseImportDialog();
      if (typeof cb === 'function') cb(res);
    };
  }
}

async function runImport() {
  if (importing || !plan) return;
  const courseName = currentCourseName();
  plan.rootName = courseName;
  // The top row is the course folder itself, so a rename must reach it too.
  const rootNode = plan.nodes.find((node) => !node.path);
  if (rootNode) rootNode.name = courseName;

  renderImporting(null);
  const gen = openGen;
  try {
    const result = await importCoursePlan(plan, {
      parentCategoryId,
      makeWorkbooks,
      createExerciseFolder: depsRef.createExerciseFolder,
      addGpExercise: depsRef.addGpExercise,
      addMediaExercise: depsRef.addMediaExercise,
      createWorkbookFolder: depsRef.createWorkbookFolder,
      createWorkbook: depsRef.createWorkbook,
      saveFile,
      attachmentsSupported,
      ensurePersistentStorage,
      onProgress: (progress) => {
        if (gen !== openGen) return;
        renderImporting(progress);
      },
    });
    if (gen !== openGen) return;
    renderDone(result);
  } catch (err) {
    if (gen !== openGen) return;
    renderDone({ ok: false, message: err?.message || 'Import failed.', errors: [] });
  }
}

function ensureShell() {
  if (root) return;

  root = el('div', { class: 'exbulk-root excourse-root', hidden: true });
  const backdrop = el('div', { class: 'exbulk-backdrop', 'aria-hidden': 'true' });
  const panel = el('div', {
    class: 'exbulk-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'excourse-dialog-title',
  });

  titleEl = el('h2', { class: 'exbulk-title', id: 'excourse-dialog-title', text: 'Import a course' });
  panel.appendChild(el('div', { class: 'exbulk-head' }, [
    el('div', { class: 'exbulk-head-titles' }, [
      el('span', { class: 'exbulk-kicker', text: 'Exercises' }),
      titleEl,
    ]),
    el('button', {
      class: 'btn sm exbulk-close',
      type: 'button',
      text: '✕',
      'aria-label': 'Close',
      onclick: requestClose,
    }),
  ]));

  bodyEl = el('div', { class: 'exbulk-body' });
  panel.appendChild(bodyEl);

  footEl = el('div', { class: 'exbulk-foot' });
  cancelBtn = el('button', {
    class: 'btn sm exbulk-cancel', type: 'button', text: 'Cancel', onclick: requestClose,
  });
  addBtn = el('button', {
    class: 'btn primary exbulk-add', type: 'button', text: 'Import course', disabled: true,
  });
  addBtn.onclick = () => {
    if (phase === 'done') return;
    runImport();
  };
  footEl.append(cancelBtn, addBtn);
  panel.appendChild(footEl);

  root.append(backdrop, panel);
  document.body.appendChild(root);

  keyHandler = (e) => {
    if (e.key === 'Escape' && canClose()) {
      e.preventDefault();
      requestClose();
    }
  };
  document.addEventListener('keydown', keyHandler);

  backdropHandler = (e) => {
    if (e.target === backdrop && canClose()) requestClose();
  };
  backdrop.addEventListener('click', backdropHandler);
}

function openShell() {
  ensureShell();
  root.hidden = false;
  root.classList.add('is-open');
  const backdrop = root.querySelector('.exbulk-backdrop');
  const panel = root.querySelector('.exbulk-panel');
  backdrop?.classList.add('is-open');
  panel?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const focusTarget = panel?.querySelector('input, button, select, [tabindex]');
    focusTarget?.focus?.();
  }, 40);
}

/**
 * Open the course import dialog.
 * @param {object} opts
 * @param {FileList|File[]} [opts.files] every file inside the picked folder
 * @param {{id: string, name: string, parentId: string}[]} [opts.folders] exercise folders
 * @param {string} [opts.defaultCategoryId] folder the library has open
 * @param {(name: string, parentId: string) => object|null} [opts.createExerciseFolder]
 * @param {(opts: object) => object|null} [opts.addGpExercise]
 * @param {(opts: object) => object|null} [opts.addMediaExercise]
 * @param {(name: string, parentId: string) => object|null} [opts.createWorkbookFolder]
 * @param {(opts: object) => object|null} [opts.createWorkbook]
 * @param {(result: object) => void} [opts.onDone]
 */
export function openCourseImportDialog({
  files,
  folders = [],
  defaultCategoryId = '',
  createExerciseFolder,
  addGpExercise,
  addMediaExercise,
  createWorkbookFolder,
  createWorkbook,
  onDone,
} = {}) {
  closeCourseImportDialog();

  previousFocus = document.activeElement;
  onDoneCb = onDone;
  foldersRef = Array.isArray(folders) ? folders.slice() : [];
  depsRef = {
    createExerciseFolder,
    addGpExercise,
    addMediaExercise,
    createWorkbookFolder,
    createWorkbook,
  };
  parentCategoryId = defaultCategoryId || '';
  makeWorkbooks = true;
  importing = false;
  importResult = null;
  plan = null;
  pickedFiles = Array.from(files || []);

  openGen += 1;

  ensureShell();
  if (cancelBtn) {
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
  }
  if (addBtn) {
    addBtn.hidden = false;
    addBtn.disabled = true;
    addBtn.textContent = 'Import course';
    addBtn.onclick = () => {
      if (phase === 'done') return;
      runImport();
    };
  }
  if (footEl) {
    const oldSummary = footEl.querySelector('.exbulk-summary');
    if (oldSummary) oldSummary.remove();
    summaryEl = null;
  }

  openShell();

  if (!pickedFiles.length) {
    renderDone({ ok: false, message: 'No folder selected.', errors: [] });
    return;
  }

  renderReading(`${countLabel(pickedFiles.length, 'file', 'files')} found`);
  if (attachmentsSupported()) ensurePersistentStorage();

  // Planning only reads names and sizes, so it is quick. Give the dialog one
  // frame first so the "Reading" step paints.
  setTimeout(() => {
    replan(pickedFiles);
    if (!plan.fileCount) {
      renderDone({
        ok: false,
        message: plan.skipped.length
          ? 'No supported files in that folder.'
          : 'That folder holds no files to import.',
        errors: [],
      });
      return;
    }
    renderReview();
  }, 16);
}
