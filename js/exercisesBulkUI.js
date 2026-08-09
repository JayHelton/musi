// Bulk upload dialog for the Exercises library — review, split options, import.

import {
  BULK_MAX_FILE_BYTES,
  analyzeBulkFiles,
  planEntrySegments,
  describeEntryPlan,
  importBulkEntries,
} from './exercisesBulk.js';
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
  unsupported: 'Unsupported',
};

/** @param {string} tag @param {Record<string, unknown>} props @param {(Node|string|null|undefined)[]} children */
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

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function countPlannedExercises(entries, { keepWholeScore }) {
  let count = 0;
  for (const entry of entries) {
    if (!entry.include || entry.skipReason) continue;
    const segCount = Array.isArray(entry.segments) ? entry.segments.length : 0;
    if (segCount > 0) {
      count += segCount;
      if (keepWholeScore && entry.isGuitarPro) count += 1;
    } else {
      count += 1;
    }
  }
  return count;
}

let root = null;
let previousFocus = null;
let openGen = 0;
let onDoneCb = null;
let keyHandler = null;
let backdropHandler = null;

/** @type {import('./exercisesBulk.js').BulkEntry[]} */
let entries = [];
let phase = 'analyzing';
let importing = false;
let splitBySection = true;
let fallbackMode = 'whole';
let everyN = 8;
let keepWholeScore = false;
let folderPerSplitFile = true;
let folderId = '';
let importResult = null;

let titleEl = null;
let bodyEl = null;
let footEl = null;
let summaryEl = null;
let addBtn = null;
let cancelBtn = null;
let splitCheck = null;
let fallbackSelect = null;
let everyInput = null;
let keepWholeCheck = null;
let folderPerSplitCheck = null;
let folderSelect = null;
let newFolderWrap = null;
let newFolderInput = null;
let newFolderCreate = null;
let fileListEl = null;
let analyzingWrapEl = null;
let analyzingDetailEl = null;
let importingWrapEl = null;
let importingBarTrackEl = null;
let importingBarFillEl = null;
let importingLabelEl = null;

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

function destroyRoot() {
  removeListeners();
  if (root) {
    root.remove();
    root = null;
  }
  titleEl = null;
  bodyEl = null;
  footEl = null;
  summaryEl = null;
  addBtn = null;
  cancelBtn = null;
  splitCheck = null;
  fallbackSelect = null;
  everyInput = null;
  keepWholeCheck = null;
  folderPerSplitCheck = null;
  folderSelect = null;
  newFolderWrap = null;
  newFolderInput = null;
  newFolderCreate = null;
  fileListEl = null;
  analyzingWrapEl = null;
  analyzingDetailEl = null;
  importingWrapEl = null;
  importingBarTrackEl = null;
  importingBarFillEl = null;
  importingLabelEl = null;
}

/**
 * Close the bulk upload dialog if open.
 */
export function closeBulkUploadDialog() {
  if (!root) return;
  destroyRoot();
  if (previousFocus && typeof previousFocus.focus === 'function') {
    try { previousFocus.focus(); } catch (e) { /* ignore */ }
  }
  previousFocus = null;
  onDoneCb = null;
  entries = [];
  importing = false;
}

function requestClose() {
  if (!canClose()) return;
  closeBulkUploadDialog();
}

function paintFolders(folders) {
  if (!folderSelect) return;
  const prev = folderSelect.value;
  while (folderSelect.firstChild) folderSelect.removeChild(folderSelect.firstChild);
  folderSelect.appendChild(el('option', { value: '', text: 'No folder' }));
  (folders || []).forEach((f) => {
    folderSelect.appendChild(el('option', { value: f.id, text: f.name }));
  });
  folderSelect.appendChild(el('option', { value: '__new__', text: 'New folder…' }));
  const hasPrev = [...folderSelect.options].some((o) => o.value === prev);
  folderSelect.value = hasPrev ? prev : (folderId || '');
  if (folderSelect.value === '__new__' && newFolderWrap?.hidden) {
    folderSelect.value = folderId || '';
  }
  if (newFolderWrap) newFolderWrap.hidden = folderSelect.value !== '__new__';
}

function replanAll() {
  for (const entry of entries) {
    planEntrySegments(entry, { splitBySection, fallbackMode, everyN });
  }
}

function paintSummary() {
  if (!summaryEl) return;
  const included = entries.filter((e) => e.include && !e.skipReason);
  const fileCount = included.length;
  const exerciseCount = countPlannedExercises(entries, { keepWholeScore });
  if (!entries.length) {
    summaryEl.textContent = 'No files selected.';
    return;
  }
  if (!fileCount) {
    summaryEl.textContent = `${entries.length} file${entries.length === 1 ? '' : 's'} · nothing to add`;
    return;
  }
  summaryEl.textContent = `${fileCount} file${fileCount === 1 ? '' : 's'} · ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} will be added`;
}

function paintAddBtn() {
  if (!addBtn) return;
  const exerciseCount = countPlannedExercises(entries, { keepWholeScore });
  const hasIncluded = entries.some((e) => e.include && !e.skipReason);
  if (phase === 'importing') {
    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';
    return;
  }
  if (phase === 'done') {
    addBtn.hidden = true;
    return;
  }
  addBtn.hidden = false;
  addBtn.disabled = !hasIncluded || exerciseCount === 0;
  addBtn.textContent = exerciseCount === 1
    ? 'Add 1 exercise'
    : `Add ${exerciseCount} exercises`;
}

function entryGetsOwnFolder(entry) {
  return folderPerSplitFile
    && !!entry?.include
    && !entry?.skipReason
    && entry.segments?.length > 0;
}

function buildFileRow(entry) {
  const disabled = !!entry.skipReason;
  const row = el('div', {
    class: 'exbulk-file' + (disabled ? ' is-disabled' : '') + (entry.parseError ? ' has-warning' : ''),
  });

  const check = el('input', {
    type: 'checkbox',
    class: 'exbulk-file-check',
    disabled: disabled ? true : false,
    'aria-label': `Include ${entry.fileName}`,
  });
  check.checked = !!entry.include && !disabled;
  check.addEventListener('change', () => {
    entry.include = check.checked;
    paintSummary();
    paintAddBtn();
  });

  const main = el('div', { class: 'exbulk-file-main' });
  const top = el('div', { class: 'exbulk-file-top' }, [
    el('span', { class: 'exbulk-file-name', text: entry.fileName || entry.baseName || 'File' }),
    el('span', { class: 'exbulk-kind', text: KIND_LABELS[entry.kind] || entry.kind || 'File' }),
    el('span', { class: 'exbulk-size', text: fmtSize(entry.size) }),
  ]);
  main.appendChild(top);

  const planRow = el('div', { class: 'exbulk-plan-row' });
  planRow.appendChild(el('span', { class: 'exbulk-plan', text: describeEntryPlan(entry) }));
  if (entryGetsOwnFolder(entry)) {
    planRow.appendChild(el('span', {
      class: 'exbulk-dest',
      text: `\u2192 ${entry.baseName}`,
    }));
  }
  main.appendChild(planRow);

  if (entry.skipReason === 'unsupported') {
    main.appendChild(el('p', {
      class: 'exbulk-skip',
      text: 'Unsupported file type — will be skipped.',
    }));
  } else if (entry.skipReason === 'too-large') {
    main.appendChild(el('p', {
      class: 'exbulk-skip',
      text: 'File is too large — will be skipped.',
    }));
  } else if (entry.skipReason) {
    main.appendChild(el('p', { class: 'exbulk-skip', text: entry.skipReason }));
  }

  if (entry.parseError) {
    main.appendChild(el('p', {
      class: 'exbulk-warn',
      text: `${entry.parseError} This file will be added whole.`,
    }));
  }

  row.append(check, main);
  return row;
}

function paintFileList() {
  if (!fileListEl) return;
  while (fileListEl.firstChild) fileListEl.removeChild(fileListEl.firstChild);
  entries.forEach((entry) => {
    fileListEl.appendChild(buildFileRow(entry));
  });
}

function paintOptions(folders) {
  if (splitCheck) splitCheck.checked = splitBySection;
  if (fallbackSelect) {
    fallbackSelect.value = fallbackMode;
    fallbackSelect.disabled = !splitBySection;
  }
  if (everyInput) {
    everyInput.value = String(everyN);
    everyInput.disabled = !splitBySection || fallbackMode !== 'everyN';
  }
  if (keepWholeCheck) keepWholeCheck.checked = keepWholeScore;
  if (folderPerSplitCheck) folderPerSplitCheck.checked = folderPerSplitFile;
  paintFolders(folders);
}

function renderReview(folders) {
  phase = 'review';
  if (!bodyEl || !footEl) return;

  analyzingWrapEl = null;
  analyzingDetailEl = null;
  importingWrapEl = null;
  importingBarTrackEl = null;
  importingBarFillEl = null;
  importingLabelEl = null;

  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  const options = el('div', { class: 'exbulk-options' });

  splitCheck = el('input', {
    type: 'checkbox',
  });
  splitCheck.checked = splitBySection;
  splitCheck.addEventListener('change', () => {
    splitBySection = splitCheck.checked;
    fallbackSelect.disabled = !splitBySection;
    everyInput.disabled = !splitBySection || fallbackMode !== 'everyN';
    replanAll();
    paintFileList();
    paintSummary();
    paintAddBtn();
  });

  const splitLabel = el('label', { class: 'exbulk-opt exbulk-opt-split' }, [
    splitCheck,
    el('span', { class: 'exbulk-opt-text' }, [
      el('span', { class: 'exbulk-opt-title', text: 'Split Guitar Pro files by section' }),
      el('span', {
        class: 'exbulk-opt-hint',
        text: 'Uses section markers in the score — same as the GP Player Split panel.',
      }),
    ]),
  ]);
  options.appendChild(splitLabel);

  fallbackSelect = el('select', {
    class: 'exbulk-fallback',
    'aria-label': 'When no section markers',
    disabled: !splitBySection ? true : false,
  }, [
    el('option', { value: 'whole', text: 'Add whole file' }),
    el('option', { value: 'everyN', text: 'Split every N bars' }),
  ]);
  fallbackSelect.value = fallbackMode;
  fallbackSelect.addEventListener('change', () => {
    fallbackMode = fallbackSelect.value === 'everyN' ? 'everyN' : 'whole';
    everyInput.disabled = !splitBySection || fallbackMode !== 'everyN';
    replanAll();
    paintFileList();
    paintSummary();
    paintAddBtn();
  });

  everyInput = el('input', {
    type: 'number',
    class: 'exbulk-every-input',
    min: '1',
    max: '32',
    value: String(everyN),
    'aria-label': 'Bars per chunk',
    disabled: (!splitBySection || fallbackMode !== 'everyN') ? true : false,
  });
  everyInput.addEventListener('change', () => {
    everyN = Math.max(1, Math.min(32, Number(everyInput.value) || 8));
    everyInput.value = String(everyN);
    replanAll();
    paintFileList();
    paintSummary();
    paintAddBtn();
  });

  const fallbackRow = el('div', { class: 'exbulk-fallback-row' }, [
    el('span', { class: 'exbulk-fallback-label', text: 'If no section markers:' }),
    fallbackSelect,
    el('span', { class: 'exbulk-every-wrap' }, [
      el('span', { class: 'exbulk-every-label', text: 'Every' }),
      everyInput,
      el('span', { class: 'exbulk-every-suffix', text: 'bars' }),
    ]),
  ]);
  options.appendChild(fallbackRow);

  keepWholeCheck = el('input', { type: 'checkbox' });
  keepWholeCheck.checked = keepWholeScore;
  keepWholeCheck.addEventListener('change', () => {
    keepWholeScore = keepWholeCheck.checked;
    paintSummary();
    paintAddBtn();
  });
  options.appendChild(el('label', { class: 'exbulk-opt' }, [
    keepWholeCheck,
    el('span', { class: 'exbulk-opt-text' }, [
      el('span', { class: 'exbulk-opt-title', text: 'Also keep the full score' }),
    ]),
  ]));

  folderPerSplitCheck = el('input', { type: 'checkbox' });
  folderPerSplitCheck.checked = folderPerSplitFile;
  folderPerSplitCheck.addEventListener('change', () => {
    folderPerSplitFile = folderPerSplitCheck.checked;
    paintFileList();
    paintSummary();
    paintAddBtn();
  });
  options.appendChild(el('label', { class: 'exbulk-opt exbulk-opt-folder-split' }, [
    folderPerSplitCheck,
    el('span', { class: 'exbulk-opt-text' }, [
      el('span', { class: 'exbulk-opt-title', text: 'Put each split score in its own folder' }),
      el('span', {
        class: 'exbulk-opt-hint',
        text: 'Folder is named after the file.',
      }),
    ]),
  ]));

  folderSelect = el('select', { class: 'exbulk-folder', 'aria-label': 'Folder for files that aren\'t split' });
  newFolderInput = el('input', {
    class: 'exbulk-new-folder-input',
    type: 'text',
    placeholder: 'Folder name',
    'aria-label': 'New folder name',
    maxlength: '40',
  });
  newFolderCreate = el('button', {
    class: 'btn sm primary exbulk-new-folder-create',
    type: 'button',
    text: 'Create',
  });
  newFolderWrap = el('div', { class: 'exbulk-new-folder', hidden: true }, [
    newFolderInput,
    newFolderCreate,
  ]);

  folderSelect.addEventListener('change', () => {
    const v = folderSelect.value;
    if (v === '__new__') {
      newFolderWrap.hidden = false;
      newFolderInput.focus?.();
      return;
    }
    newFolderWrap.hidden = true;
    folderId = v;
  });

  newFolderCreate.addEventListener('click', () => {
    const name = (newFolderInput.value || '').trim();
    if (!name || !createFolderRef) return;
    const created = createFolderRef(name);
    if (!created) return;
    newFolderInput.value = '';
    folderId = created.id;
    foldersRef.push(created);
    newFolderWrap.hidden = true;
    paintFolders(foldersRef);
    folderSelect.value = created.id;
  });

  const folderRow = el('div', { class: 'exbulk-folder-row' }, [
    el('span', { class: 'exbulk-folder-label' }, [
      el('span', { text: 'Folder' }),
      el('span', { class: 'exbulk-folder-hint', text: 'For files that aren\'t split into sections' }),
    ]),
    el('div', { class: 'exbulk-folder-wrap' }, [folderSelect, newFolderWrap]),
  ]);
  options.appendChild(folderRow);

  fileListEl = el('div', { class: 'exbulk-files', role: 'list' });
  bodyEl.append(options, fileListEl);

  summaryEl = el('div', { class: 'exbulk-summary', role: 'status', 'aria-live': 'polite' });
  footEl.insertBefore(summaryEl, footEl.firstChild);

  paintOptions(folders);
  paintFileList();
  paintSummary();
  paintAddBtn();
}

/** @type {((name: string) => ({id: string, name: string}|null))|null} */
let createFolderRef = null;
/** @type {((opts: object) => object|null)|null} */
let addGpExerciseRef = null;
/** @type {((opts: object) => object|null)|null} */
let addMediaExerciseRef = null;
/** @type {{id: string, name: string}[]} */
let foldersRef = [];

function updateAnalyzingProgress(progress) {
  if (!analyzingDetailEl) return;
  if (progress) {
    analyzingDetailEl.textContent = `${progress.index + 1} of ${progress.total} — ${progress.name}`;
  } else {
    analyzingDetailEl.textContent = '';
  }
}

function renderAnalyzing(progress) {
  phase = 'analyzing';
  if (!bodyEl) return;
  if (!analyzingWrapEl) {
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    analyzingWrapEl = el('div', { class: 'exbulk-analyzing' });
    analyzingWrapEl.appendChild(el('p', { class: 'exbulk-analyzing-title', text: 'Reading files…' }));
    analyzingDetailEl = el('p', { class: 'exbulk-analyzing-detail' });
    analyzingWrapEl.appendChild(analyzingDetailEl);
    bodyEl.appendChild(analyzingWrapEl);
  }
  updateAnalyzingProgress(progress);
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.textContent = 'Add exercises';
  }
}

function updateImportingProgress(progress) {
  if (!importingBarFillEl || !importingBarTrackEl || !importingLabelEl) return;
  if (progress && progress.total > 0) {
    const pct = Math.round(((progress.index + 1) / progress.total) * 100);
    importingBarFillEl.style.width = `${pct}%`;
    importingBarTrackEl.setAttribute('aria-valuenow', String(pct));
    importingBarTrackEl.setAttribute('aria-valuemin', '0');
    importingBarTrackEl.setAttribute('aria-valuemax', '100');
    importingLabelEl.textContent = progress.label
      ? `${progress.index + 1} of ${progress.total} — ${progress.label}`
      : `${progress.index + 1} of ${progress.total}`;
  } else {
    importingBarFillEl.style.width = '0%';
    importingBarTrackEl.removeAttribute('aria-valuenow');
    importingLabelEl.textContent = 'Importing…';
  }
}

function renderImporting(progress) {
  phase = 'importing';
  importing = true;
  if (!bodyEl) return;
  if (!importingWrapEl) {
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    importingWrapEl = el('div', { class: 'exbulk-importing' });
    importingBarTrackEl = el('div', { class: 'exbulk-progress-track', role: 'progressbar' });
    importingBarFillEl = el('div', { class: 'exbulk-progress-fill' });
    importingBarTrackEl.appendChild(importingBarFillEl);
    importingLabelEl = el('p', { class: 'exbulk-import-label' });
    importingWrapEl.append(importingBarTrackEl, importingLabelEl);
    bodyEl.appendChild(importingWrapEl);
  }
  updateImportingProgress(progress);
  paintAddBtn();
  if (cancelBtn) cancelBtn.disabled = true;
}

function renderDone(result) {
  phase = 'done';
  importing = false;
  importResult = result;
  if (!bodyEl) return;

  analyzingWrapEl = null;
  analyzingDetailEl = null;
  importingWrapEl = null;
  importingBarTrackEl = null;
  importingBarFillEl = null;
  importingLabelEl = null;

  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  const wrap = el('div', { class: 'exbulk-done' });
  wrap.appendChild(el('p', {
    class: 'exbulk-done-msg' + (result?.ok ? '' : ' is-error'),
    text: result?.message || (result?.ok ? 'Import complete.' : 'Import failed.'),
  }));

  if (result?.errors?.length) {
    const errList = el('ul', { class: 'exbulk-errors' });
    result.errors.forEach((err) => {
      errList.appendChild(el('li', { text: `${err.name}: ${err.message}` }));
    });
    wrap.appendChild(errList);
  }

  bodyEl.appendChild(wrap);

  if (summaryEl) summaryEl.textContent = '';
  if (cancelBtn) {
    cancelBtn.hidden = true;
    cancelBtn.disabled = false;
  }
  if (addBtn) {
    addBtn.hidden = false;
    addBtn.disabled = false;
    addBtn.textContent = 'Done';
    addBtn.onclick = () => {
      const cb = onDoneCb;
      const res = importResult;
      closeBulkUploadDialog();
      if (typeof cb === 'function') cb(res);
    };
  }
}

async function runImport() {
  if (importing) return;
  const included = entries.filter((e) => e.include && !e.skipReason);
  if (!included.length) return;

  let categoryId = '';
  const folderChoice = folderSelect?.value ?? folderId;

  if (folderChoice === '__new__') {
    const name = (newFolderInput?.value || '').trim();
    if (!name) {
      newFolderWrap.hidden = false;
      newFolderInput?.focus();
      return;
    }
    const created = createFolderRef?.(name);
    if (!created) return;
    categoryId = created.id;
  } else {
    categoryId = folderChoice || '';
  }

  renderImporting(null);

  const gen = openGen;
  try {
    const result = await importBulkEntries(included, {
      categoryId,
      folderPerSplitFile,
      prefixSegmentNames: true,
      keepWholeScore,
      createFolder: createFolderRef,
      addGpExercise: addGpExerciseRef,
      addMediaExercise: addMediaExerciseRef,
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
    renderDone({
      ok: false,
      message: err?.message || 'Import failed.',
      errors: [],
    });
  }
}

async function startAnalyze(files, gen) {
  renderAnalyzing(null);
  try {
    const analyzed = await analyzeBulkFiles(files, {
      splitBySection: true,
      fallbackMode: 'whole',
      everyN: 8,
      maxBytes: BULK_MAX_FILE_BYTES,
      onProgress: (progress) => {
        if (gen !== openGen) return;
        renderAnalyzing(progress);
      },
    });
    if (gen !== openGen) return;
    entries = analyzed;
    if (!entries.length) {
      renderDone({ ok: false, message: 'No files to import.', errors: [] });
      return;
    }
    renderReview(foldersRef);
  } catch (err) {
    if (gen !== openGen) return;
    renderDone({
      ok: false,
      message: err?.message || 'Could not read files.',
      errors: [],
    });
  }
}

function ensureShell() {
  if (root) return;

  root = el('div', { class: 'exbulk-root', hidden: true });
  const backdrop = el('div', { class: 'exbulk-backdrop', 'aria-hidden': 'true' });
  const panel = el('div', {
    class: 'exbulk-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'exbulk-dialog-title',
  });

  titleEl = el('h2', { class: 'exbulk-title', id: 'exbulk-dialog-title', text: 'Bulk upload' });
  const closeBtn = el('button', {
    class: 'btn sm exbulk-close',
    type: 'button',
    text: '✕',
    'aria-label': 'Close',
    onclick: requestClose,
  });

  panel.appendChild(el('div', { class: 'exbulk-head' }, [
    el('div', { class: 'exbulk-head-titles' }, [
      el('span', { class: 'exbulk-kicker', text: 'Exercises' }),
      titleEl,
    ]),
    closeBtn,
  ]));

  bodyEl = el('div', { class: 'exbulk-body' });
  panel.appendChild(bodyEl);

  footEl = el('div', { class: 'exbulk-foot' });
  cancelBtn = el('button', {
    class: 'btn sm exbulk-cancel',
    type: 'button',
    text: 'Cancel',
    onclick: requestClose,
  });
  addBtn = el('button', {
    class: 'btn primary exbulk-add',
    type: 'button',
    text: 'Add exercises',
    disabled: true,
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
    const focusTarget = panel?.querySelector('button, input, select, [tabindex]');
    focusTarget?.focus?.();
  }, 40);
}

/**
 * Open the bulk upload review/import dialog. Guitar Pro scores that split into
 * sections are filed into a folder named after the source file by default; turn
 * that off in the dialog to use the folder picker for those files too.
 * @param {object} opts
 * @param {FileList|File[]} [opts.files]
 * @param {{id: string, name: string}[]} [opts.folders]
 * @param {string} [opts.defaultCategoryId]
 * @param {(name: string) => ({id: string, name: string}|null)} [opts.createFolder]
 * @param {(opts: object) => object|null} [opts.addGpExercise]
 * @param {(opts: object) => object|null} [opts.addMediaExercise]
 * @param {(result: object) => void} [opts.onDone]
 */
export function openBulkUploadDialog({
  files,
  folders = [],
  defaultCategoryId = '',
  createFolder,
  addGpExercise,
  addMediaExercise,
  onDone,
} = {}) {
  closeBulkUploadDialog();

  previousFocus = document.activeElement;
  onDoneCb = onDone;
  createFolderRef = createFolder;
  addGpExerciseRef = addGpExercise;
  addMediaExerciseRef = addMediaExercise;
  foldersRef = folders.slice();
  folderId = defaultCategoryId || '';
  splitBySection = true;
  fallbackMode = 'whole';
  everyN = 8;
  keepWholeScore = false;
  folderPerSplitFile = true;
  importing = false;
  importResult = null;
  entries = [];

  const fileList = Array.from(files || []);
  openGen += 1;
  const gen = openGen;

  ensureShell();
  if (titleEl) titleEl.textContent = 'Bulk upload';
  if (cancelBtn) {
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
  }
  if (addBtn) {
    addBtn.hidden = false;
    addBtn.disabled = true;
    addBtn.textContent = 'Add exercises';
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
  if (bodyEl) while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  openShell();

  if (!fileList.length) {
    renderDone({ ok: false, message: 'No files selected.', errors: [] });
    return;
  }

  if (attachmentsSupported()) ensurePersistentStorage();
  startAnalyze(fileList, gen);
}
