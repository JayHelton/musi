// Exercises library for Musi. A place to upload practice files (PDFs, images,
// audio and video) or add external lesson links, organize them into folders
// (category tags), and view/play them in a built-in viewer.
//
// Storage mirrors the rest of the app:
//   - exercise metadata + categories live in localStorage (musi.exercises)
//   - uploaded file Blobs live in IndexedDB (attachments.js) keyed by an
//     attachment id, with source 'exercise'.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage / IndexedDB are unavailable.

import {
  saveFile,
  getFileBlob,
  deleteFile,
  renameFile,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';
import { isGuitarProName, parseGuitarPro, mountGpPlayer } from './gpPlayerUI.js';
import { clampBpm } from './gpPlayer/tempoRange.js';
import { resolveScoreKey } from './gpAnnotations.js';
import {
  buildExerciseGpResult,
  filterPracticeSettingsPatch,
  gpResultFromTabModelJson,
  isSegmentExercise,
} from './gpExerciseScore.js';
import { BULK_ACCEPT_ATTR, UPLOAD_ACCEPT_ATTR, classifyUploadFile } from './exercisesBulk.js';
import { openBulkUploadDialog, closeBulkUploadDialog } from './exercisesBulkUI.js';
import { emitDataChanged } from './dataEvents.js';
import {
  MAX_FOLDER_DEPTH,
  FOLDER_PATH_SEPARATOR,
  normalizeParentId,
  sanitizeFolderTree,
  folderById,
  folderChildren,
  folderSubtreeIds,
  folderDepth,
  folderPathLabel,
  flattenFolderTree,
  canMoveFolder,
  findSiblingByName,
  nextParentAfterDelete,
} from './folderTree.js';
import { createDriveBrowser, closeDriveMenu } from './library/driveBrowser.js';
import { showAppToast } from './appToast.js';

const STORAGE_KEY = 'musi.exercises';
const NAME_LIMIT = 120;
const CAT_LIMIT = 40;
const URL_LIMIT = 2000;
const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250 MB upload guard for video.
const UPLOAD_ACCEPT_MSG = 'Only PDF, documents (doc, docx, txt, rtf, odt, md, pages, csv), images, audio, video, and Guitar Pro (.gp/.gp5) files up to 250 MB can be uploaded.';

// --- storage helpers (defensive) -------------------------------------------

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readKey(key) {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

function safeExternalUrl(value) {
  let raw = clampText(typeof value === 'string' ? value.trim() : '', URL_LIMIT);
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /^[\w.-]+\.[a-z]{2,}/i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) {
    /* invalid URL */
  }
  return '';
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || 'Exercise link';
  } catch (e) {
    return 'Exercise link';
  }
}

function extensionFromName(fileName) {
  const name = typeof fileName === 'string' ? fileName : '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function deriveInstrument(type, fileName) {
  const t = typeof type === 'string' ? type.toLowerCase() : '';
  const ext = extensionFromName(fileName);
  if (
    t === 'application/x-guitar-pro' ||
    t.includes('guitar-pro') ||
    /^(gp|gp5|gpx)$/i.test(ext) ||
    /\.musi-tab\.json$/i.test(fileName || '')
  ) {
    return 'guitar';
  }
  if (t.startsWith('audio/') || /^(mp3|m4a|aac|wav|opus|flac|ogg|oga|webm)$/.test(ext)) {
    return 'guitar';
  }
  if (t.startsWith('video/') || /^(mp4|m4v|mov|ogv)$/.test(ext)) {
    return 'guitar';
  }
  return '';
}

function deriveMaterialType(type, fileName, url) {
  if (url) return 'link';
  const t = typeof type === 'string' ? type.toLowerCase() : '';
  const ext = extensionFromName(fileName);
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    t === 'application/x-guitar-pro' ||
    t.includes('guitar-pro') ||
    /^(gp|gp5|gpx)$/i.test(ext) ||
    /\.musi-tab\.json$/i.test(fileName || '')
  ) {
    return 'tab';
  }
  if (t.startsWith('audio/') || /^(mp3|m4a|aac|wav|opus|flac|ogg|oga|webm)$/.test(ext)) {
    return 'audio';
  }
  if (t.startsWith('video/') || /^(mp4|m4v|mov|ogv)$/.test(ext)) {
    return 'video';
  }
  if (t.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) {
    return 'image';
  }
  if (
    /^(docx?|txt|rtf|odt|md|pages|csv)$/i.test(ext) ||
    t === 'application/msword' ||
    t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t === 'text/plain' ||
    t === 'text/markdown' ||
    t === 'text/csv'
  ) {
    return 'doc';
  }
  if (t === 'text/uri-list') return 'link';
  return '';
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((tag) => typeof tag === 'string' && tag.trim())
    .map((tag) => tag.trim())
    .slice(0, 50);
}

// --- normalization ---------------------------------------------------------

function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('cat');
  const name = clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Folder', CAT_LIMIT);
  const parentId = normalizeParentId(raw.parentId);
  return { id, name, parentId };
}

// The practice-take recorder is removed. Exercises saved by an older build can
// still carry a `takes` array. Drop the field and remember the audio blobs it
// referenced, so getStore() can free them once.
const legacyTakeAttachmentIds = new Set();

function collectLegacyTakes(raw) {
  if (!Array.isArray(raw)) return;
  raw.forEach((take) => {
    const id = typeof take?.attachmentId === 'string' ? take.attachmentId : '';
    if (id) legacyTakeAttachmentIds.add(id);
  });
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const attachmentId = typeof raw.attachmentId === 'string' && raw.attachmentId ? raw.attachmentId : '';
  const url = safeExternalUrl(raw.url);
  if (!attachmentId && !url) return null;
  const defaultName = url ? titleFromUrl(url) : 'Exercise';
  // null must survive as "unset" — Number(null) is 0, which would silently turn
  // an absent bar range into a zero-length one at bar 0.
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const bar = (v) => (num(v) == null ? null : Math.max(0, Math.floor(num(v))));
  const measureStart = bar(raw.measureStart);
  const measureEnd = bar(raw.measureEnd);
  const startBeat = num(raw.startBeat);
  const endBeat = num(raw.endBeat);
  const fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  const type = typeof raw.type === 'string' ? raw.type : '';
  const instrumentRaw = typeof raw.instrument === 'string' ? raw.instrument.trim() : '';
  const materialTypeRaw = typeof raw.materialType === 'string' ? raw.materialType.trim() : '';
  const core = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('ex'),
    name: clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : defaultName, NAME_LIMIT),
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '',
    attachmentId,
    url,
    fileName,
    type,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : nowISO(),
    // Guitar Pro practice settings (optional).
    preferredTrackIndex: Number.isFinite(Number(raw.preferredTrackIndex))
      ? Math.max(0, Math.floor(Number(raw.preferredTrackIndex)))
      : 0,
    measureStart,
    measureEnd,
    startBeat,
    endBeat,
    loopEnabled: raw.loopEnabled == null ? false : !!raw.loopEnabled,
    loopRestSec: Math.max(0, Math.min(30, Number(raw.loopRestSec) || 0)),
    bpm: (raw.bpm != null && Number(raw.bpm) > 0 && Number.isFinite(Number(raw.bpm)))
      ? Math.round(clampBpm(Number(raw.bpm)))
      : null,
    transpose: Number.isFinite(Number(raw.transpose)) ? Math.round(Number(raw.transpose)) : 0,
    tuning: typeof raw.tuning === 'string' && raw.tuning ? raw.tuning : null,
    retuneMode: raw.retuneMode === 'pitches' ? 'pitches' : 'fingerings',
    instrument: instrumentRaw || deriveInstrument(type, fileName),
    materialType: materialTypeRaw || deriveMaterialType(type, fileName, url),
    technique: typeof raw.technique === 'string' ? raw.technique : '',
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : '',
    tags: normalizeTags(raw.tags),
    source: typeof raw.source === 'string' ? raw.source : '',
    contentHash: typeof raw.contentHash === 'string' ? raw.contentHash : '',
    favorite: raw.favorite === true,
    sourceRef: typeof raw.sourceRef === 'string' ? raw.sourceRef : '',
  };
  const out = { ...raw };
  Object.assign(out, core);
  collectLegacyTakes(raw.takes);
  delete out.takes;
  return out;
}

export function normalizeExerciseItem(raw) {
  return normalizeItem(raw);
}

function defaultStore() {
  const t = nowISO();
  return {
    categories: [
      { id: uid('cat'), name: 'Tabs', parentId: '' },
      { id: uid('cat'), name: 'Etudes', parentId: '' },
      { id: uid('cat'), name: 'Warm-ups', parentId: '' },
    ],
    items: [],
    seededAt: t,
  };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    persist();
    return storeCache;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed && parsed.categories)
      ? parsed.categories.map(normalizeCategory).filter(Boolean)
      : [];
    const { folders } = sanitizeFolderTree(normalized);
    storeCache = {
      categories: folders,
      items: Array.isArray(parsed && parsed.items)
        ? parsed.items.map(normalizeItem).filter(Boolean)
        : [],
    };
  } catch (e) {
    storeCache = { categories: [], items: [] };
  }
  purgeLegacyTakes();
  return storeCache;
}

// Free the audio blobs of practice takes that an older build recorded. The
// takes are already out of storeCache, so the write below also removes the
// `takes` field from storage.
function purgeLegacyTakes() {
  if (!legacyTakeAttachmentIds.size) return;
  const ids = [...legacyTakeAttachmentIds];
  legacyTakeAttachmentIds.clear();
  persist();
  (async () => {
    for (const attachmentId of ids) {
      try { await releaseAttachment(attachmentId); } catch (e) { /* keep releasing */ }
    }
  })();
}

function persist() {
  if (!storeCache) return;
  if (writeKey(STORAGE_KEY, JSON.stringify(storeCache))) {
    emitDataChanged('exercises');
  }
}

export function invalidateExercisesCache() {
  storeCache = null;
}

// --- public data API (synchronous metadata; Blobs fetched on demand) -------

export function getCategories() {
  return getStore().categories.slice();
}

export function getExercises() {
  return getStore().items.slice();
}

export function getExercise(id) {
  return getStore().items.find(it => it.id === id) || null;
}

function categoryName(categoryId) {
  if (!categoryId) return 'No folder';
  const cat = getStore().categories.find(c => c.id === categoryId);
  return cat ? cat.name : 'No folder';
}

export function addCategory(name, parentId = '') {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return null;
  const store = getStore();
  let resolvedParent = normalizeParentId(parentId);
  if (resolvedParent && !folderById(store.categories, resolvedParent)) {
    resolvedParent = '';
  }
  const exists = findSiblingByName(store.categories, resolvedParent, clean);
  if (exists) return exists;
  if (resolvedParent && folderDepth(store.categories, resolvedParent) >= MAX_FOLDER_DEPTH) {
    return null;
  }
  const cat = { id: uid('cat'), name: clean, parentId: resolvedParent };
  store.categories.push(cat);
  persist();
  return cat;
}

/** Options for the folder / tag picker (sidebar + mobile sheet). */
export function getExerciseFolderOptions() {
  const store = getStore();
  const items = getExercises();
  const uncategorizedCount = items.filter(it => !it.categoryId).length;
  const opts = [
    {
      id: 'all',
      label: 'All Exercises',
      count: items.length,
      totalCount: items.length,
      depth: 0,
      parentId: '',
      path: '',
    },
  ];
  flattenFolderTree(store.categories).forEach((row) => {
    const subtreeIds = folderSubtreeIds(store.categories, row.id);
    opts.push({
      id: row.id,
      label: row.name,
      count: items.filter(it => it.categoryId === row.id).length,
      totalCount: items.filter(it => subtreeIds.has(it.categoryId)).length,
      depth: row.depth,
      parentId: row.parentId,
      path: row.path,
    });
  });
  if (uncategorizedCount > 0) {
    opts.push({
      id: 'uncategorized',
      label: 'No folder',
      count: uncategorizedCount,
      totalCount: uncategorizedCount,
      depth: 0,
      parentId: '',
      path: '',
    });
  }
  return opts;
}

export function getSelectedExerciseFolder() {
  return selectedCategory;
}

export function getSelectedExerciseFolderLabel() {
  return currentTitleText();
}

/** Opens a folder in the browser. Legacy ids map to the library root. */
export function selectExerciseFolder(id) {
  const next = (id === 'all' || id === 'uncategorized') ? '' : id;
  if (browser) {
    browser.navigateTo(next);
    return browser.getFolderId();
  }
  setSelectedCategory(next);
  return selectedCategory;
}

/**
 * Creates a folder. The browser stays where it is, the same as Google Drive:
 * the new folder appears in the list instead of taking over the view.
 */
export function createExerciseFolder(name, parentId) {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return { ok: false, reason: 'empty' };
  let resolvedParent = parentId === undefined ? selectedCategory : parentId;
  resolvedParent = normalizeParentId(resolvedParent);
  if (resolvedParent && !folderById(getStore().categories, resolvedParent)) {
    resolvedParent = '';
  }
  const store = getStore();
  const exists = findSiblingByName(store.categories, resolvedParent, clean);
  if (exists) {
    if (wired) setStatus(`Folder “${exists.name}” already exists here.`);
    return { ok: true, created: false, category: exists };
  }
  const cat = addCategory(clean, resolvedParent);
  if (!cat) {
    if (wired) setStatus(`Folders can nest at most ${MAX_FOLDER_DEPTH} levels deep.`, true);
    return { ok: false, reason: 'depth' };
  }
  if (wired) setStatus(`Created folder “${cat.name}”.`);
  return { ok: true, created: true, category: cat };
}

export function moveExerciseFolder(id, parentId) {
  const store = getStore();
  const nextParent = normalizeParentId(parentId);
  const check = canMoveFolder(store.categories, id, nextParent);
  if (!check.ok) return { ok: false, reason: check.reason };
  const folder = folderById(store.categories, id);
  if (!folder) return { ok: false, reason: 'missing' };
  folder.parentId = nextParent;
  persist();
  if (wired) setStatus(`Moved folder “${folder.name}”.`);
  return { ok: true, reason: '' };
}

export function getExercisesInFolder(id, { includeDescendants = false } = {}) {
  const items = getExercises();
  if (!id || id === 'uncategorized') return items.filter(it => !it.categoryId);
  if (id === 'all') return items;
  if (includeDescendants) {
    const subtreeIds = folderSubtreeIds(getStore().categories, id);
    return items.filter(it => subtreeIds.has(it.categoryId));
  }
  return items.filter(it => it.categoryId === id);
}

function renameCategory(id, name) {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return false;
  const cat = getStore().categories.find(c => c.id === id);
  if (!cat) return false;
  cat.name = clean;
  persist();
  return true;
}

// deleteCategory lifts child folders and unfiles direct exercises only.
function countExercisesInCategory(id) {
  return getStore().items.filter(it => it.categoryId === id).length;
}

function countExercisesInCategorySubtree(id) {
  const subtreeIds = folderSubtreeIds(getStore().categories, id);
  return getStore().items.filter(it => subtreeIds.has(it.categoryId)).length;
}

function deleteCategory(id) {
  const store = getStore();
  const idx = store.categories.findIndex(c => c.id === id);
  if (idx < 0) return false;
  const nextParent = nextParentAfterDelete(store.categories, id);
  store.categories.forEach((cat) => {
    if (normalizeParentId(cat.parentId) === id) {
      cat.parentId = nextParent;
    }
  });
  store.items.forEach((it) => {
    if (it.categoryId === id) it.categoryId = '';
  });
  store.categories.splice(idx, 1);
  persist();
  return true;
}

async function deleteCategoryWithContents(id) {
  const store = getStore();
  if (!folderById(store.categories, id)) return { ok: false, deleted: 0 };
  const subtreeIds = folderSubtreeIds(store.categories, id);
  const itemIds = store.items.filter(it => subtreeIds.has(it.categoryId)).map(it => it.id);
  const deleted = await deleteExercises(itemIds);
  store.categories = store.categories.filter(cat => !subtreeIds.has(cat.id));
  persist();
  return { ok: true, deleted, foldersDeleted: subtreeIds.size };
}

function renameExercise(id, name) {
  const item = getExercise(id);
  if (!item) return null;
  const clean = clampText((name || '').trim(), NAME_LIMIT) || item.name;
  item.name = clean;
  persist();
  if (item.attachmentId) renameFile(item.attachmentId, clean).catch(() => {});
  if (wired) render();
  return clean;
}

function moveExercise(id, categoryId) {
  const item = getExercise(id);
  if (!item) return false;
  item.categoryId = typeof categoryId === 'string' ? categoryId : '';
  persist();
  return true;
}

function attachmentStillReferenced(attachmentId) {
  if (!attachmentId) return false;
  return getStore().items.some((it) => it.attachmentId === attachmentId);
}

async function releaseAttachmentsForItem(item) {
  if (!item?.attachmentId) return;
  try { await releaseAttachment(item.attachmentId); } catch (e) { /* ignore */ }
}

async function releaseAttachment(attachmentId) {
  if (!attachmentId || attachmentStillReferenced(attachmentId)) return;
  // Shared score blobs are referenced by multiple bar-range exercises; delete only when none remain.
  try { await deleteFile(attachmentId); } catch (e) {}
}

async function deleteExercise(id) {
  const store = getStore();
  const idx = store.items.findIndex(it => it.id === id);
  if (idx < 0) return false;
  const [removed] = store.items.splice(idx, 1);
  persist();
  if (removed) {
    await releaseAttachmentsForItem(removed);
  }
  if (wired) render();
  return true;
}

async function deleteExercises(ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return 0;
  const store = getStore();
  const removed = [];
  store.items = store.items.filter((it) => {
    if (idSet.has(it.id)) {
      removed.push(it);
      return false;
    }
    return true;
  });
  if (!removed.length) return 0;
  persist();
  const attachmentIds = new Set();
  removed.forEach((it) => {
    if (it.attachmentId) attachmentIds.add(it.attachmentId);
  });
  for (const attachmentId of attachmentIds) {
    try {
      await releaseAttachment(attachmentId);
    } catch (e) {
      /* keep releasing the rest */
    }
  }
  if (wired) render();
  return removed.length;
}

// --- formatting helpers ----------------------------------------------------

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fileExt(item) {
  const name = (item && (item.fileName || item.name)) || '';
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isPdfItem(item) {
  return !!item && (
    item.type === 'application/pdf' ||
    fileExt(item) === 'pdf'
  );
}

function isImageItem(item) {
  return !!item && (
    (typeof item.type === 'string' && item.type.startsWith('image/')) ||
    /^(png|jpe?g|gif|webp|bmp|svg)$/.test(fileExt(item))
  );
}

function isAmbiguousAvExt(ext) {
  return ext === 'ogg' || ext === 'oga' || ext === 'webm';
}

function isAudioItem(item) {
  if (!item) return false;
  const t = item.type || '';
  if (t.startsWith('video/')) return false;
  if (t.startsWith('audio/')) return true;
  const ext = fileExt(item);
  if (/^(mp3|m4a|aac|wav|opus|flac)$/.test(ext)) return true;
  if (isAmbiguousAvExt(ext)) return !t || t.startsWith('audio/');
  return false;
}

function isVideoItem(item) {
  if (!item) return false;
  const t = item.type || '';
  if (t.startsWith('audio/')) return false;
  if (t.startsWith('video/')) return true;
  const ext = fileExt(item);
  if (/^(mp4|m4v|mov|ogv)$/.test(ext)) return true;
  if (isAmbiguousAvExt(ext)) return t.startsWith('video/');
  return false;
}

export function isTabModelItem(item) {
  return !!item && (
    item.type === 'application/x-musi-tab-model' ||
    /\.musi-tab\.json$/i.test(item.fileName || '') ||
    (item.type === 'application/json' && /\.musi-tab\.json$/i.test(item.fileName || ''))
  );
}

function isGpItem(item) {
  return !!item && (
    item.type === 'application/x-guitar-pro' ||
    isGuitarProName(item.fileName || item.name || '') ||
    /^(gp|gp5)$/i.test(fileExt(item)) ||
    isTabModelItem(item)
  );
}

function isDocItem(item) {
  if (!item) return false;
  if (/^(docx?|txt|rtf|odt|md|pages|csv)$/i.test(fileExt(item))) return true;
  const t = item.type || '';
  return (
    t === 'application/msword' ||
    t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t === 'application/rtf' || t === 'text/rtf' ||
    t === 'application/vnd.oasis.opendocument.text' ||
    t === 'application/vnd.apple.pages' ||
    t === 'text/plain' || t === 'text/markdown' || t === 'text/csv'
  );
}

function isInlineDocItem(item) {
  return isDocItem(item) && /^(txt|md|csv)$/i.test(fileExt(item));
}

function docMimeFromExt(ext) {
  const map = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    md: 'text/markdown',
    pages: 'application/vnd.apple.pages',
    csv: 'text/csv',
  };
  return map[(ext || '').toLowerCase()] || '';
}

function youtubeEmbedUrl(url) {
  const safe = safeExternalUrl(url);
  if (!safe) return '';
  try {
    const u = new URL(safe);
    const host = u.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/').filter(Boolean)[1] || '';
      }
    }
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return '';
    return `https://www.youtube.com/embed/${id}`;
  } catch (e) {
    return '';
  }
}

export function mediaKind(item) {
  if (item && item.url) return youtubeEmbedUrl(item.url) ? 'youtube' : 'link';
  if (isGpItem(item)) return 'gp';
  if (isVideoItem(item)) return 'video';
  if (isAudioItem(item)) return 'audio';
  if (isImageItem(item)) return 'image';
  if (isPdfItem(item)) return 'pdf';
  if (isDocItem(item)) return 'doc';
  return 'file';
}

export function mediaKindLabel(item) {
  const labels = {
    pdf: 'PDF',
    doc: 'Doc',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    youtube: 'YouTube',
    link: 'Link',
    gp: 'Guitar Pro',
    file: 'File',
  };
  return labels[mediaKind(item)] || 'File';
}

// --- small DOM helper ------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// --- module state ----------------------------------------------------------

let wired = false;
// The open folder. An empty string is the root of the library, the same place
// Google Drive calls "My Drive". Unfiled exercises live there.
let selectedCategory = '';
// The shared Drive-style browser. Workbooks builds an identical one.
let browser = null;

let listEl, catListEl, crumbsEl, toolsEl, statusEl, bulkBarEl, fileInput, bulkFileInput;
let sectionEl, workspaceEl, playerPaneEl, playerBodyEl, playerTitleEl, playerActionsEl, playerBackBtn;
let activeExerciseId = null;
let viewerURL = null;
let viewerGpMount = null;
let escapeWired = false;
let openGeneration = 0;
const exerciseViewerChangeHandlers = new Set();
const exerciseFolderChangeHandlers = new Set();
// True while a route opens a folder, so the route does not hear its own move.
let routeDrivenFolder = false;

// --- rendering -------------------------------------------------------------
//
// The library browser itself lives in js/library/driveBrowser.js. This section
// only adapts the exercise store to the browser: it describes a row, and it
// answers the browser when the user creates, renames, moves, or deletes.

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function setSelectedCategory(next) {
  const target = next && folderById(getStore().categories, next) ? next : '';
  if (selectedCategory === target) return false;
  selectedCategory = target;
  return true;
}

function pluralExercises(count) {
  return `${count} exercise${count === 1 ? '' : 's'}`;
}

// The Node test shim implements only part of the DOM, so check before dispatch.
function emitFoldersChanged() {
  if (typeof CustomEvent !== 'function' || typeof document.dispatchEvent !== 'function') return;
  document.dispatchEvent(new CustomEvent('musi:exercise-folders-change'));
}

function currentTitleText() {
  if (!selectedCategory) return 'My Exercises';
  return folderPathLabel(getStore().categories, selectedCategory, FOLDER_PATH_SEPARATOR)
    || categoryName(selectedCategory);
}

/** Wraps the modal prompt so the browser can await a name. */
function promptForName({ title, value, confirmLabel }) {
  return new Promise((resolve) => {
    openPrompt(title, value, confirmLabel, (name) => resolve(name), { onCancel: () => resolve(null) });
  });
}

function describeExerciseRow(item) {
  return {
    id: item.id,
    name: item.name,
    typeLabel: mediaKindLabel(item),
    size: item.url ? null : (Number(item.size) || null),
    modifiedAt: item.addedAt,
    iconHtml: exerciseIconSvg(item),
  };
}

function exerciseRowMenuExtras(item) {
  if (!item || !item.url) return [];
  return [{
    label: 'Open link in a new tab',
    onClick: () => {
      try {
        window.open(item.url, '_blank', 'noopener');
      } catch (e) {
        /* popup blocked */
      }
    },
  }];
}

function newMenuExtrasForExercises() {
  const entries = [];
  if (fileInput && attachmentsSupported()) {
    entries.push({ label: 'Upload file', onClick: () => fileInput.click() });
    entries.push({ label: 'Bulk upload', onClick: () => (bulkFileInput || fileInput).click() });
  }
  entries.push({ label: 'Add link', onClick: () => openLinkDialog() });
  return entries;
}

function buildBrowser() {
  if (!listEl) return null;
  return createDriveBrowser({
    ns: 'exercises',
    rootLabel: 'My Exercises',
    itemNoun: { one: 'exercise', many: 'exercises' },
    els: {
      nav: catListEl,
      crumbs: crumbsEl,
      tools: toolsEl,
      selectionBar: bulkBarEl,
      content: listEl,
    },
    listFolders: () => getStore().categories,
    listItems: () => getExercises(),
    itemFolderId: (item) => item.categoryId,
    describeItem: describeExerciseRow,
    isItemOpen: (item) => item.id === activeExerciseId,
    openItem: (item) => {
      if (item.id === activeExerciseId) closeExerciseViewer();
      else openExerciseViewer(item.id);
    },
    itemMenuExtras: exerciseRowMenuExtras,
    renameItem: (id, name) => !!renameExercise(id, name),
    deleteItems: (ids) => deleteExercises(ids),
    moveItems: (ids, folderId) => {
      ids.forEach((id) => moveExercise(id, folderId));
    },
    createFolder: (name, parentId) => {
      const result = createExerciseFolder(name, parentId || '');
      return { ok: !!result.ok, id: result.category?.id || '', reason: result.reason || '' };
    },
    renameFolder: (id, name) => renameCategory(id, name),
    moveFolder: (id, parentId) => moveExerciseFolder(id, parentId),
    requestDeleteFolder: (id, name) => onDeleteCategory(id, name),
    newMenuExtras: newMenuExtrasForExercises,
    onExternalFiles: (files, folderId) => uploadFiles(files, folderId),
    emptyRootTitle: 'No exercises yet',
    emptyHint: 'Use + New to upload a file or add a lesson link. You can also drop files straight onto this pane.',
    prompt: promptForName,
    toast: setStatus,
    onNavigate: (folderId) => {
      selectedCategory = folderId;
      emitFoldersChanged();
      if (routeDrivenFolder) return;
      exerciseFolderChangeHandlers.forEach((handler) => {
        try { handler({ folderId }); } catch (e) { /* ignore */ }
      });
    },
  });
}

/** Repaints the list so the open exercise carries its badge. */
function applyActiveRowHighlight() {
  if (browser) browser.render();
}

function render() {
  if (selectedCategory && !folderById(getStore().categories, selectedCategory)) {
    selectedCategory = '';
  }
  if (activeExerciseId && !getExercise(activeExerciseId)) {
    closeExerciseViewer();
    return;
  }
  if (!attachmentsSupported() && listEl && !getExercises().length) {
    setStatus('File uploads need browser storage (IndexedDB), which is unavailable here. You can still add exercise links.', true);
  }
  if (browser) {
    browser.render();
    selectedCategory = browser.getFolderId();
  }
  emitFoldersChanged();
}

export function exerciseIconSvg(item) {
  const kind = mediaKind(item);
  if (kind === 'image') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  if (kind === 'audio') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  if (kind === 'video' || kind === 'youtube') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';
  if (kind === 'link') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>';
  if (kind === 'gp') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6l5-3-5-3z"/><path d="M15 9h2M15 12h3M15 15h1"/></svg>';
  if (kind === 'doc' || kind === 'pdf') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
}

// --- upload ----------------------------------------------------------------

async function onUploadFiles() {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  await uploadFiles(files, selectedCategory);
}

/** Saves files into a folder. The file picker and a drag-and-drop both use this. */
async function uploadFiles(files, folderId) {
  if (!files || !files.length) return;

  if (!attachmentsSupported()) {
    setStatus('Uploading needs browser storage, which is unavailable here.', true);
    return;
  }

  const targetCategory = folderId && folderById(getStore().categories, folderId) ? folderId : '';

  let added = 0;
  let rejected = 0;
  for (const file of files) {
    const classified = classifyUploadFile(file);
    if (!classified.supported) { rejected++; continue; }
    if (file.size > MAX_FILE_BYTES) { rejected++; continue; }

    setStatus(`Uploading "${file.name}"\u2026`);
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const fileType = classified.mimeType || file.type || '';
    const meta = await saveFile({
      blob: file, name: base || 'Exercise', type: fileType,
      fileName: file.name, size: file.size, source: 'exercise',
    });
    if (!meta) { rejected++; continue; }

    const store = getStore();
    store.items.unshift({
      id: uid('ex'),
      name: clampText(base || 'Exercise', NAME_LIMIT),
      categoryId: targetCategory,
      attachmentId: meta.id,
      fileName: file.name,
      type: fileType,
      size: file.size,
      addedAt: nowISO(),
    });
    persist();
    added++;
  }

  render();
  if (added && rejected) setStatus(`Added ${added} file${added === 1 ? '' : 's'}. Skipped ${rejected} unsupported or oversized file${rejected === 1 ? '' : 's'}.`, true);
  else if (added) setStatus(`Added ${added} file${added === 1 ? '' : 's'}.`);
  else if (rejected) setStatus(UPLOAD_ACCEPT_MSG, true);
}

async function onBulkUploadFiles() {
  const files = Array.from(bulkFileInput?.files || []);
  if (bulkFileInput) bulkFileInput.value = '';
  if (!files.length) return;

  if (!attachmentsSupported()) {
    setStatus('Uploading needs browser storage, which is unavailable here.', true);
    return;
  }

  const defaultCategoryId = selectedCategory || '';

  openBulkUploadDialog({
    files,
    folders: getCategories(),
    defaultCategoryId,
    createFolder: addCategory,
    addGpExercise: addGpExerciseFromAttachment,
    addMediaExercise: addExerciseFromAttachment,
    onDone: (result) => {
      render();
      setStatus(result.message, !result.ok);
    },
  });
}

/**
 * Add any file-backed exercise from an already-saved attachment
 * (GP Player, Track → Sheet, etc.).
 */
export function addExerciseFromAttachment({
  attachmentId,
  name,
  fileName,
  type,
  size,
  categoryId = '',
  preferredTrackIndex = 0,
  measureStart = null,
  measureEnd = null,
  startBeat = null,
  endBeat = null,
  loopEnabled = null,
  loopRestSec = 0,
  bpm = null,
  transpose = 0,
  tuning = null,
  retuneMode = 'fingerings',
} = {}) {
  if (!attachmentId) return null;
  const store = getStore();
  const defaultName = isGuitarProName(fileName || name || '')
    ? 'Guitar Pro'
    : (fileName || name || 'Exercise');
  const item = normalizeItem({
    id: uid('ex'),
    name: clampText(name || defaultName, NAME_LIMIT),
    categoryId: typeof categoryId === 'string' ? categoryId : '',
    attachmentId,
    url: '',
    fileName: fileName || '',
    type: type || '',
    size: Number.isFinite(Number(size)) ? Number(size) : 0,
    addedAt: nowISO(),
    preferredTrackIndex,
    measureStart,
    measureEnd,
    startBeat,
    endBeat,
    loopEnabled: loopEnabled == null ? false : !!loopEnabled,
    loopRestSec,
    bpm,
    transpose,
    tuning,
    retuneMode,
  });
  if (!item) return null;
  store.items.unshift(item);
  persist();
  if (wired) render();
  return item;
}

/** Add a Guitar Pro exercise from an already-saved attachment (e.g. GP Player). */
export function addGpExerciseFromAttachment(opts = {}) {
  return addExerciseFromAttachment({
    ...opts,
    type: opts.type || 'application/x-guitar-pro',
    name: opts.name || 'Guitar Pro',
  });
}

/** Guitar Pro / tab-model items in the Exercises library. */
export function listGpExercises() {
  return getExercises().filter(isGpItem);
}

/** Audio stem items in the Exercises library (Track → Sheet, etc.). */
export function listAudioExercises() {
  return getExercises().filter(isAudioItem);
}

export function renameExerciseItem(id, name) {
  return renameExercise(id, name);
}

export async function deleteExerciseItem(id) {
  return deleteExercise(id);
}

export async function deleteExerciseItems(ids) {
  return deleteExercises(ids);
}

export function getExercisesWithoutFolder() {
  return getExercises().filter(it => !it.categoryId);
}

export async function deleteExercisesWithoutFolder() {
  const ids = getExercisesWithoutFolder().map(it => it.id);
  return deleteExerciseItems(ids);
}

export function deleteExerciseFolder(id) {
  return deleteCategory(id);
}

export async function deleteExerciseFolderWithContents(id) {
  return deleteCategoryWithContents(id);
}

/** Opens the folder delete dialog for a folder id. The mobile folder bar uses this. */
export function requestExerciseFolderDelete(id) {
  if (!id || id === 'all' || id === 'uncategorized') return false;
  const cat = getStore().categories.find(c => c.id === id);
  if (!cat) return false;
  onDeleteCategory(id, cat.name);
  return true;
}

/** Persist practice-player settings back onto an exercise (tempo loop, rest, track). */
export function updateExercisePracticeSettings(id, patch = {}) {
  const store = getStore();
  const idx = store.items.findIndex((it) => it.id === id);
  if (idx < 0) return null;
  const next = normalizeItem({ ...store.items[idx], ...patch });
  if (!next) return null;
  store.items[idx] = next;
  persist();
  return next;
}

// --- URL exercise creation --------------------------------------------------

function addLinkExercise(name, url) {
  const safe = safeExternalUrl(url);
  if (!safe) {
    setStatus('Enter a valid http(s) link.', true);
    return false;
  }
  const targetCategory = selectedCategory || '';
  const store = getStore();
  store.items.unshift({
    id: uid('ex'),
    name: clampText((name || '').trim() || titleFromUrl(safe), NAME_LIMIT),
    categoryId: targetCategory,
    attachmentId: '',
    url: safe,
    fileName: '',
    type: 'text/uri-list',
    size: 0,
    addedAt: nowISO(),
  });
  persist();
  render();
  setStatus('Added link.');
  return true;
}

// --- inline player ---------------------------------------------------------

function ensurePlayerElements() {
  sectionEl = sectionEl || document.getElementById('sec-exercises');
  workspaceEl = workspaceEl || document.getElementById('ex-workspace');
  playerPaneEl = playerPaneEl || document.getElementById('ex-player-pane');
  playerBodyEl = playerBodyEl || document.getElementById('ex-player-body');
  playerTitleEl = playerTitleEl || document.getElementById('ex-player-title');
  playerActionsEl = playerActionsEl || document.getElementById('ex-player-actions');
  playerBackBtn = playerBackBtn || document.getElementById('ex-player-back');
  return !!(workspaceEl && playerPaneEl && playerBodyEl && playerTitleEl && playerActionsEl);
}

function setViewerLayoutActive(on) {
  if (sectionEl) sectionEl.classList.toggle('ex-viewing', on);
}

// Overlays that own Escape themselves; closing the whole viewer underneath them
// would throw away the user's place in the exercise.
const VIEWER_OVERLAY_SELECTOR = [
  '.gpp-drawer.is-open',
  '.gpp-sheet.is-open',
  '.gpi-mount.is-open',
  '.modal-overlay',
].join(',');

function viewerOverlayOpen() {
  if (document.body?.classList.contains('sel-sheet-open')) return true;
  return !!document.querySelector(VIEWER_OVERLAY_SELECTOR);
}

function wirePlayerControls() {
  if (!playerBackBtn || playerBackBtn.dataset.wired) return;
  playerBackBtn.dataset.wired = '1';
  playerBackBtn.addEventListener('click', closeExerciseViewer);
  if (escapeWired) return;
  escapeWired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activeExerciseId) return;
    const sec = document.getElementById('sec-exercises');
    if (!sec || !sec.classList.contains('active')) return;
    if (viewerOverlayOpen()) return;
    closeExerciseViewer();
  });
}

function fillPlayerHead(item, kind, blob) {
  playerTitleEl.textContent = item.name;
  playerTitleEl.title = item.fileName || item.name;
  playerActionsEl.innerHTML = '';

  if (item.url) {
    playerActionsEl.appendChild(el('a', {
      class: 'btn sm', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open link',
    }));
  }
  if (blob) {
    viewerURL = URL.createObjectURL(blob);
    if (kind !== 'gp') {
      playerActionsEl.appendChild(el('a', {
        class: 'btn sm', href: viewerURL, target: '_blank', rel: 'noopener', text: 'Open in tab',
      }));
    }
    const ext = fileExt(item) || (kind === 'pdf' ? 'pdf' : (kind === 'gp' ? 'gp' : ''));
    const downloadName = item.fileName || (ext ? `${item.name}.${ext}` : item.name);
    playerActionsEl.appendChild(el('a', {
      class: 'btn sm', href: viewerURL, download: downloadName, text: 'Download',
    }));
  }
}

function mountDocFallbackCard(item) {
  const card = el('div', { class: 'ex-player-doc-card' });
  card.appendChild(el('div', {
    class: 'ex-player-doc-icon', html: exerciseIconSvg(item), 'aria-hidden': 'true',
  }));
  card.appendChild(el('div', {
    class: 'ex-player-doc-name', text: item.fileName || item.name,
  }));
  card.appendChild(el('div', {
    class: 'ex-player-doc-meta',
    text: `${mediaKindLabel(item)} · ${fmtSize(item.size)}`,
  }));
  card.appendChild(el('p', {
    class: 'ex-player-doc-note',
    text: 'This document cannot be previewed here. Open or download it to view.',
  }));
  const actions = el('div', { class: 'ex-player-doc-actions' });
  if (viewerURL) {
    const downloadName = item.fileName || item.name;
    actions.appendChild(el('a', {
      class: 'btn primary', href: viewerURL, target: '_blank', rel: 'noopener', text: 'Open in tab',
    }));
    actions.appendChild(el('a', {
      class: 'btn', href: viewerURL, download: downloadName, text: 'Download',
    }));
  }
  card.appendChild(actions);
  playerBodyEl.appendChild(el('div', { class: 'ex-player-doc-fallback' }, card));
}

function mountPlayerBody(item, kind, blob) {
  playerBodyEl.className = `ex-player-body ex-player-body-${kind}`;
  playerBodyEl.innerHTML = '';

  if (item.url) {
    const embedUrl = youtubeEmbedUrl(item.url) || item.url;
    playerBodyEl.appendChild(el('iframe', {
      class: 'ex-player-frame ex-player-link-frame',
      src: embedUrl,
      title: item.name,
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    }));
    if (!youtubeEmbedUrl(item.url)) {
      playerBodyEl.appendChild(el('div', {
        class: 'ex-player-link-note',
        text: 'If this site blocks embedding, use Open link.',
      }));
    }
    return;
  }

  if (blob && kind === 'gp') {
    const mountHost = el('div', { class: 'ex-gp-mount' });
    playerBodyEl.appendChild(mountHost);
    return mountHost;
  }

  if (blob) {
    if (kind === 'image') {
      playerBodyEl.appendChild(el('img', {
        class: 'ex-player-image', src: viewerURL, alt: item.name,
      }));
    } else if (kind === 'audio') {
      playerBodyEl.appendChild(el('audio', {
        class: 'ex-player-media', src: viewerURL, controls: '', preload: 'metadata',
      }));
    } else if (kind === 'video') {
      playerBodyEl.appendChild(el('video', {
        class: 'ex-player-media ex-player-video',
        src: viewerURL,
        controls: '',
        playsinline: '',
        'webkit-playsinline': '',
        preload: 'metadata',
      }));
    } else if (kind === 'doc' && !isInlineDocItem(item)) {
      mountDocFallbackCard(item);
    } else {
      playerBodyEl.appendChild(el('iframe', {
        class: 'ex-player-frame', src: viewerURL, title: item.name,
      }));
    }
    return null;
  }

  playerBodyEl.appendChild(el('div', {
    class: 'ex-player-missing',
    text: 'This file is missing from storage. It may have been cleared by the browser.',
  }));
  return null;
}

async function mountGpExercise(item, mountHost, blob) {
  if (!blob) return null;
  try {
    let gp;
    if (isTabModelItem(item)) {
      const raw = JSON.parse(await blob.text());
      gp = gpResultFromTabModelJson(raw, { fallbackName: item.name || 'Exercise' });
    } else {
      const buf = await blob.arrayBuffer();
      gp = await parseGuitarPro(buf);
    }
    const { gp: exerciseGp, sliced } = buildExerciseGpResult(gp, item);
    const segment = isSegmentExercise(item);
    const loopRange = segment && !sliced ? {
      initialLoopStart: item.measureStart,
      initialLoopEnd: item.measureEnd,
      initialLoopStartBeat: item.startBeat,
      initialLoopEndBeat: item.endBeat,
    } : {};
    return mountGpPlayer(mountHost, {
      gpResult: exerciseGp,
      title: item.name,
      fileName: item.fileName || item.name,
      hideTitle: true,
      preferredTrackIndex: Number.isFinite(item.preferredTrackIndex) ? item.preferredTrackIndex : 0,
      initialLoopEnabled: !!item.loopEnabled,
      ...loopRange,
      loopRestSec: item.loopRestSec || 0,
      initialBpm: item.bpm,
      initialTranspose: item.transpose,
      initialTuning: item.tuning,
      initialRetuneMode: item.retuneMode,
      exerciseScope: segment && !sliced,
      onPracticeSettingsChange: (settings) => {
        updateExercisePracticeSettings(
          item.id,
          filterPracticeSettingsPatch(settings, { sliced }),
        );
      },
      scoreKey: sliced ? undefined : resolveScoreKey({
        attachmentId: item.attachmentId,
        fileName: item.fileName || item.name,
      }),
    });
  } catch (err) {
    showAppToast(err?.message);
    mountHost.appendChild(el('div', {
      class: 'ex-player-missing',
      text: err?.message || 'Could not open this Guitar Pro file.',
    }));
    return null;
  }
}

function teardownPlayer() {
  if (viewerGpMount) {
    try { viewerGpMount.destroy(); } catch (e) { /* ignore */ }
    viewerGpMount = null;
  }
  if (viewerURL) { try { URL.revokeObjectURL(viewerURL); } catch (e) {} viewerURL = null; }
  activeExerciseId = null;
  setViewerLayoutActive(false);
  if (workspaceEl) workspaceEl.classList.remove('is-open');
  if (playerPaneEl) playerPaneEl.hidden = true;
  if (playerTitleEl) {
    playerTitleEl.textContent = '';
    playerTitleEl.removeAttribute('title');
  }
  if (playerActionsEl) playerActionsEl.innerHTML = '';
  if (playerBodyEl) {
    playerBodyEl.innerHTML = '';
    playerBodyEl.className = 'ex-player-body';
  }
  applyActiveRowHighlight();
}

export async function openExerciseViewer(id) {
  const item = getExercise(id);
  if (!item || !ensurePlayerElements()) return;

  try {
  wirePlayerControls();

  const gen = ++openGeneration;
  teardownPlayer();

  const blob = item.attachmentId ? await getFileBlob(item.attachmentId) : null;
  if (gen !== openGeneration) return;

  const kind = mediaKind(item);

  activeExerciseId = id;
  workspaceEl.classList.add('is-open');
  setViewerLayoutActive(true);
  playerPaneEl.hidden = false;
  fillPlayerHead(item, kind, blob);
  const gpMount = mountPlayerBody(item, kind, blob);
  applyActiveRowHighlight();
  exerciseViewerChangeHandlers.forEach((handler) => {
    try { handler({ open: true, exerciseId: id }); } catch (e) { /* ignore */ }
  });

  if (gpMount) {
    const mounted = await mountGpExercise(item, gpMount, blob);
    if (gen !== openGeneration) {
      if (mounted) {
        try { mounted.destroy(); } catch (e) { /* ignore */ }
      }
      return;
    }
    viewerGpMount = mounted;
  }

  playerPaneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showAppToast(err?.message);
  }
}

export function closeExerciseViewer() {
  openGeneration += 1;
  teardownPlayer();
  exerciseViewerChangeHandlers.forEach((handler) => {
    try { handler({ open: false, exerciseId: null }); } catch (e) { /* ignore */ }
  });
}

export function onExerciseViewerChange(handler) {
  if (typeof handler === 'function') exerciseViewerChangeHandlers.add(handler);
}

export function onExerciseFolderChange(handler) {
  if (typeof handler === 'function') exerciseFolderChangeHandlers.add(handler);
}

/** The open folder, so a route can name the screen the user is on. */
export function currentExerciseFolderId() {
  return browser ? browser.getFolderId() : selectedCategory;
}

/** Open the folder a route names. Silent: it never reports back as a move. */
export function openExerciseFolderForRoute(folderId) {
  const target = typeof folderId === 'string' ? folderId : '';
  if (!browser) {
    setSelectedCategory(target);
    return;
  }
  if (browser.getFolderId() === target) return;
  routeDrivenFolder = true;
  try {
    browser.navigateTo(target);
  } finally {
    routeDrivenFolder = false;
  }
}

// --- confirm / prompt modals (reuse shared modal styles) -------------------

let dialogRoot = null;

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = el('div', { id: 'ex-dialog-root' });
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openConfirm(title, body, confirmLabel, onConfirm, { danger = false } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: title }),
    body ? el('p', { class: 'modal-body', text: body }) : null,
  ]);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', {
    class: danger ? 'btn modal-danger' : 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { closeDialog(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function openFolderDeleteDialog({
  name,
  directCount,
  childFolderCount,
  subtreeExerciseCount,
  subtreeFolderCount,
  onDeleteFolderOnly,
  onDeleteAll,
}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const exerciseWord = subtreeExerciseCount === 1 ? 'exercise' : 'exercises';
  const folderWord = subtreeFolderCount === 1 ? 'folder' : 'folders';
  let bodyText = `"${name}" holds ${directCount} direct ${directCount === 1 ? 'exercise' : 'exercises'}.`;
  if (childFolderCount > 0) {
    bodyText += ` It also holds ${childFolderCount} child ${childFolderCount === 1 ? 'folder' : 'folders'}. Delete the folder only and child folders move up one level while direct exercises become unfiled, or delete the folder and its whole subtree from this device.`;
  } else {
    bodyText += ` Delete the folder only and keep them unfiled, or delete the folder and its ${subtreeExerciseCount} ${exerciseWord} from this device.`;
  }
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: `Delete folder "${name}"?` }),
    el('p', { class: 'modal-body', text: bodyText }),
  ]);
  const actions = el('div', { class: 'modal-actions' });
  let escapeHandler = null;
  const finish = (fn) => {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    closeDialog();
    fn();
  };
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel',
    onClick: () => finish(() => {}),
  }));
  const folderOnlyLabel = childFolderCount > 0
    ? 'Delete folder only (move subfolders up)'
    : 'Delete folder only';
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: folderOnlyLabel,
    onClick: () => finish(onDeleteFolderOnly),
  }));
  const deleteAllLabel = subtreeFolderCount > 1
    ? `Delete folder + ${subtreeFolderCount} ${folderWord} + ${subtreeExerciseCount} ${exerciseWord}`
    : `Delete folder + ${subtreeExerciseCount} ${exerciseWord}`;
  actions.appendChild(el('button', {
    class: 'btn modal-danger', type: 'button', text: deleteAllLabel,
    onClick: () => finish(onDeleteAll),
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(() => {}); });
  escapeHandler = (e) => { if (e.key === 'Escape') finish(() => {}); };
  document.addEventListener('keydown', escapeHandler);
  dialogRoot.appendChild(overlay);
}

function openPrompt(title, initialValue, confirmLabel, onConfirm, { onCancel, maxlength = NAME_LIMIT } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  const input = el('input', {
    type: 'text', class: 'modal-input', value: initialValue || '', maxlength: String(maxlength),
  });
  dialog.appendChild(input);

  let settled = false;
  const cancel = () => {
    closeDialog();
    if (settled) return;
    settled = true;
    if (typeof onCancel === 'function') onCancel();
  };
  const submit = () => {
    const value = input.value;
    closeDialog();
    if (settled) return;
    settled = true;
    onConfirm(value);
  };

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: cancel }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel, onClick: submit,
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') cancel();
  });
  dialogRoot.appendChild(overlay);
  setTimeout(() => { input.focus(); input.select(); }, 40);
}

function openLinkDialog() {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog ex-link-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: 'Add exercise link' }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: 'Paste a YouTube lesson or any http(s) page. Musi will embed it when the site allows iframes.',
  }));

  const urlInput = el('input', {
    type: 'url', class: 'modal-input', placeholder: 'https://youtu.be/...',
    maxlength: String(URL_LIMIT), 'aria-label': 'Exercise link URL',
  });
  const nameInput = el('input', {
    type: 'text', class: 'modal-input ex-link-name-input', placeholder: 'Optional title',
    maxlength: String(NAME_LIMIT), 'aria-label': 'Exercise link title',
  });
  const error = el('div', { class: 'modal-errors' });
  dialog.appendChild(urlInput);
  dialog.appendChild(nameInput);
  dialog.appendChild(error);

  const save = () => {
    const safe = safeExternalUrl(urlInput.value);
    if (!safe) {
      error.textContent = 'Enter a valid http(s) link.';
      urlInput.focus();
      return;
    }
    closeDialog();
    addLinkExercise(nameInput.value, safe);
  };

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'Add Link', onClick: save }));
  dialog.appendChild(actions);

  [urlInput, nameInput].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') save();
    });
  });
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
  setTimeout(() => urlInput.focus(), 40);
}

function onRenameCategory(id, current) {
  openPrompt('Rename folder', current, 'Save', (name) => {
    if (renameCategory(id, name)) render();
  });
}

function onDeleteCategory(id, name) {
  const directCount = countExercisesInCategory(id);
  const childFolderCount = folderChildren(getStore().categories, id).length;
  const subtreeExerciseCount = countExercisesInCategorySubtree(id);
  const subtreeFolderCount = folderSubtreeIds(getStore().categories, id).size;
  // Read the parent before the delete, while the folder still exists.
  const parentId = nextParentAfterDelete(getStore().categories, id);
  const insideDeleted = selectedCategory === id
    || folderSubtreeIds(getStore().categories, id).has(selectedCategory);
  const afterDelete = () => {
    // Deleting the open folder sends the browser back to the parent folder.
    if (insideDeleted) {
      selectExerciseFolder(parentId);
      return;
    }
    render();
  };
  if (directCount === 0 && childFolderCount === 0) {
    openConfirm(
      `Delete folder "${name}"?`,
      'This folder is empty.',
      'Delete',
      () => {
        deleteCategory(id);
        afterDelete();
      },
      { danger: true },
    );
    return;
  }
  openFolderDeleteDialog({
    name,
    directCount,
    childFolderCount,
    subtreeExerciseCount,
    subtreeFolderCount,
    onDeleteFolderOnly: () => {
      deleteCategory(id);
      setStatus(`Deleted folder "${name}". ${pluralExercises(directCount)} ${directCount === 1 ? 'is' : 'are'} now unfiled.`);
      afterDelete();
    },
    onDeleteAll: async () => {
      const result = await deleteCategoryWithContents(id);
      if (result.ok) {
        const folderPart = result.foldersDeleted > 1
          ? `${result.foldersDeleted} folders and `
          : '';
        setStatus(`Deleted folder "${name}" and ${folderPart}${pluralExercises(result.deleted)}.`);
      }
      afterDelete();
    },
  });
}

// --- init / teardown -------------------------------------------------------

export function initExercises() {
  listEl = document.getElementById('ex-list');
  catListEl = document.getElementById('ex-category-list');
  crumbsEl = document.getElementById('ex-crumbs');
  toolsEl = document.getElementById('ex-tools');
  statusEl = document.getElementById('ex-status');
  bulkBarEl = document.getElementById('ex-bulk-bar');
  fileInput = document.getElementById('ex-file-input');
  bulkFileInput = document.getElementById('ex-bulk-file-input');
  sectionEl = document.getElementById('sec-exercises');
  workspaceEl = document.getElementById('ex-workspace');
  playerPaneEl = document.getElementById('ex-player-pane');
  playerBodyEl = document.getElementById('ex-player-body');
  playerTitleEl = document.getElementById('ex-player-title');
  playerActionsEl = document.getElementById('ex-player-actions');
  playerBackBtn = document.getElementById('ex-player-back');

  if (!listEl) return;

  if (!wired) {
    wired = true;
    if (fileInput) {
      fileInput.setAttribute('accept', UPLOAD_ACCEPT_ATTR);
      fileInput.addEventListener('change', onUploadFiles);
    }
    if (bulkFileInput) {
      bulkFileInput.setAttribute('accept', BULK_ACCEPT_ATTR);
      bulkFileInput.addEventListener('change', onBulkUploadFiles);
    }
    if (attachmentsSupported()) ensurePersistentStorage();
    wirePlayerControls();
    browser = buildBrowser();
    selectedCategory = browser ? browser.getFolderId() : '';
  }

  setStatus('');
  render();
}

// Close the viewer when navigating away from the Exercises section.
export function stopExercises() {
  closeBulkUploadDialog();
  closeExerciseViewer();
  closeDriveMenu();
  if (browser) browser.clearSelection();
}
