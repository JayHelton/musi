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
import { mountExerciseTakePanel } from './exerciseTakePanel.js';
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
  validMoveTargets,
  nextParentAfterDelete,
} from './folderTree.js';
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

const MAX_TAKES = 50;

function normalizeTake(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const attachmentId = typeof raw.attachmentId === 'string' && raw.attachmentId ? raw.attachmentId : '';
  if (!id || !attachmentId) return null;
  return {
    id,
    attachmentId,
    name: clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Take', NAME_LIMIT),
    type: typeof raw.type === 'string' ? raw.type : '',
    durationMs: Number.isFinite(Number(raw.durationMs)) ? Math.max(0, Math.floor(Number(raw.durationMs))) : 0,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowISO(),
  };
}

function normalizeTakes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTake).filter(Boolean).slice(0, MAX_TAKES);
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
    takes: normalizeTakes(raw.takes),
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
  return storeCache;
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

export function selectExerciseFolder(id) {
  let next = 'all';
  if (id === 'all' || id === 'uncategorized'
      || getStore().categories.some(c => c.id === id)) {
    next = id;
  }
  setSelectedCategory(next);
  if (wired) render();
  return selectedCategory;
}

/** Create a folder/tag and refresh the UI. Selects the folder so mobile Delete is available. */
export function createExerciseFolder(name, parentId) {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return { ok: false, reason: 'empty' };
  let resolvedParent = parentId;
  if (resolvedParent === undefined) {
    resolvedParent = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
      ? selectedCategory : '';
  }
  resolvedParent = normalizeParentId(resolvedParent);
  if (resolvedParent && !folderById(getStore().categories, resolvedParent)) {
    resolvedParent = '';
  }
  const store = getStore();
  const exists = findSiblingByName(store.categories, resolvedParent, clean);
  if (exists) {
    setSelectedCategory(exists.id);
    if (wired) {
      setStatus(`Folder “${exists.name}” already exists.`);
      render();
    }
    return { ok: true, created: false, category: exists };
  }
  const cat = addCategory(clean, resolvedParent);
  if (!cat) {
    if (wired) {
      setStatus(`Folders can nest at most ${MAX_FOLDER_DEPTH} levels deep.`, true);
    }
    return { ok: false, reason: 'depth' };
  }
  setSelectedCategory(cat.id);
  // New folders stay collapsed until the user expands them.
  expandedFolders.delete(cat.id);
  if (wired) {
    setStatus(`Created folder “${cat.name}”. Assign exercises with the folder menu on each row.`);
    render();
  }
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
  if (wired) {
    setStatus(`Moved folder “${folder.name}”.`);
    render();
  }
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
  return getStore().items.some((it) => {
    if (it.attachmentId === attachmentId) return true;
    return (it.takes || []).some((t) => t.attachmentId === attachmentId);
  });
}

async function releaseAttachmentsForItem(item) {
  if (!item) return;
  const ids = new Set();
  if (item.attachmentId) ids.add(item.attachmentId);
  (item.takes || []).forEach((t) => { if (t.attachmentId) ids.add(t.attachmentId); });
  for (const attachmentId of ids) {
    try { await releaseAttachment(attachmentId); } catch (e) { /* keep releasing */ }
  }
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
    (it.takes || []).forEach((t) => { if (t.attachmentId) attachmentIds.add(t.attachmentId); });
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
let selectedCategory = 'all'; // 'all', 'uncategorized', or a category id.
// Folder sections open in the "All" grouped view. Default closed.
const expandedFolders = new Set();
// Sidebar tree rows default expanded; ids here are collapsed.
const collapsedSidebarFolders = new Set();
let selectionMode = false;
const selectedIds = new Set();

let listEl, catListEl, titleEl, statusEl, bulkBarEl, fileInput, bulkFileInput, uploadBtn, bulkUploadBtn, addLinkBtn, addCatForm, addCatInput;
let sectionEl, workspaceEl, playerPaneEl, playerBodyEl, playerTitleEl, playerActionsEl, playerBackBtn;
let activeExerciseId = null;
let viewerURL = null;
let viewerGpMount = null;
let viewerTakePanel = null;
let escapeWired = false;
let openGeneration = 0;
const exerciseViewerChangeHandlers = new Set();

// --- rendering -------------------------------------------------------------

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function visibleItems() {
  const items = getExercises();
  if (selectedCategory === 'all') return items;
  if (selectedCategory === 'uncategorized') return items.filter(it => !it.categoryId);
  const subtreeIds = folderSubtreeIds(getStore().categories, selectedCategory);
  return items.filter(it => subtreeIds.has(it.categoryId));
}

function scopedItems() {
  return visibleItems();
}

function setSelectedCategory(next) {
  if (selectedCategory === next) return false;
  selectedCategory = next;
  selectedIds.clear();
  return true;
}

function pruneSelectedIds() {
  const valid = new Set(getExercises().map(it => it.id));
  selectedIds.forEach((id) => {
    if (!valid.has(id)) selectedIds.delete(id);
  });
}

function exitSelectionMode() {
  selectionMode = false;
  selectedIds.clear();
  if (wired) render();
  else renderBulkBar();
}

function enterSelectionMode() {
  selectionMode = true;
  if (wired) render();
  else renderBulkBar();
}

function pluralExercises(count) {
  return `${count} exercise${count === 1 ? '' : 's'}`;
}

function folderKeyForItem(item) {
  if (!item.categoryId) return 'uncategorized';
  if (getStore().categories.some(c => c.id === item.categoryId)) return item.categoryId;
  return 'uncategorized';
}

function syncFolderCheckbox(groupKey) {
  if (!listEl || !selectionMode) return;
  const folder = listEl.querySelector(`.ex-folder[data-folder="${CSS.escape(groupKey)}"]`);
  if (!folder) return;
  const check = folder.querySelector('.ex-folder-check');
  if (!check) return;
  const group = groupItemsByCategory(getExercises()).find(g => g.key === groupKey);
  if (!group || !group.items.length) {
    check.checked = false;
    check.indeterminate = false;
    return;
  }
  const selected = group.items.filter(it => selectedIds.has(it.id)).length;
  check.checked = selected === group.items.length;
  check.indeterminate = selected > 0 && selected < group.items.length;
}

function syncFolderCheckboxForItem(item) {
  syncFolderCheckbox(folderKeyForItem(item));
}

function renderBulkBar() {
  if (!bulkBarEl) return;
  const scope = scopedItems();
  if (!scope.length) {
    selectionMode = false;
    selectedIds.clear();
    bulkBarEl.hidden = true;
    bulkBarEl.innerHTML = '';
    return;
  }
  bulkBarEl.hidden = false;
  bulkBarEl.innerHTML = '';

  if (!selectionMode) {
    const actions = el('div', { class: 'ex-bulk-bar-actions' });
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Select',
      onClick: () => enterSelectionMode(),
    }));
    actions.appendChild(el('button', {
      class: 'btn sm ex-bulk-del', type: 'button', text: 'Delete All',
      onClick: () => onDeleteAll(),
    }));
    bulkBarEl.appendChild(actions);
    return;
  }

  const selectedCount = selectedIds.size;
  bulkBarEl.appendChild(el('span', {
    class: 'ex-bulk-count',
    text: selectedCount ? `${selectedCount} selected` : 'No exercises selected',
  }));

  const actions = el('div', { class: 'ex-bulk-bar-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Select all',
    onClick: () => {
      scope.forEach(it => selectedIds.add(it.id));
      if (listEl) {
        listEl.querySelectorAll('.ex-item').forEach((row) => {
          const on = selectedIds.has(row.dataset.id);
          row.classList.toggle('is-selected', on);
          const check = row.querySelector('.ex-item-check');
          if (check) check.checked = on;
        });
      }
      groupItemsByCategory(getExercises()).forEach(g => syncFolderCheckbox(g.key));
      renderBulkBar();
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Clear',
    onClick: () => {
      selectedIds.clear();
      if (listEl) {
        listEl.querySelectorAll('.ex-item').forEach((row) => {
          row.classList.remove('is-selected');
          const check = row.querySelector('.ex-item-check');
          if (check) check.checked = false;
        });
      }
      groupItemsByCategory(getExercises()).forEach(g => syncFolderCheckbox(g.key));
      renderBulkBar();
    },
  }));
  const deleteLabel = selectedCount
    ? `Delete Selected (${selectedCount})`
    : 'Delete Selected';
  actions.appendChild(el('button', {
    class: 'btn sm ex-bulk-del',
    type: 'button',
    text: deleteLabel,
    disabled: selectedCount ? undefined : true,
    onClick: () => onDeleteSelected(),
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Done',
    onClick: () => exitSelectionMode(),
  }));
  bulkBarEl.appendChild(actions);
}

function onDeleteAll() {
  const scope = scopedItems();
  const count = scope.length;
  if (!count) {
    setStatus('No exercises to delete in this view.');
    return;
  }
  let title;
  let body;
  if (selectedCategory === 'all') {
    title = `Delete all ${pluralExercises(count)}?`;
    body = 'This permanently removes every exercise file and link in your library from this device. This cannot be undone.';
  } else {
    const folderName = currentTitleText();
    title = `Delete all ${pluralExercises(count)} in "${folderName}"?`;
    body = 'This removes exercises in this folder and in its subfolders. The folders stay. This cannot be undone.';
  }
  openConfirm(title, body, 'Delete All', async () => {
    selectionMode = false;
    selectedIds.clear();
    const removed = await deleteExercises(scope.map(it => it.id));
    if (!removed || !wired) {
      if (wired) render();
      else renderBulkBar();
    }
    setStatus(`Deleted ${pluralExercises(removed)}.`);
  });
}

function onDeleteSelected() {
  const count = selectedIds.size;
  if (!count) {
    setStatus('Select one or more exercises to delete.');
    return;
  }
  const ids = [...selectedIds];
  openConfirm(
    `Delete ${count} selected exercise${count === 1 ? '' : 's'}?`,
    'This permanently removes the selected exercise files and links from this device. This cannot be undone.',
    'Delete',
    async () => {
      selectionMode = false;
      selectedIds.clear();
      const removed = await deleteExercises(ids);
      if (!removed || !wired) {
        if (wired) render();
        else renderBulkBar();
      }
      setStatus(`Deleted ${pluralExercises(removed)}.`);
    },
  );
}

function syncFolderChipLabel() {
  const label = document.getElementById('ex-folder-label');
  if (label) label.textContent = currentTitleText();
}

// The Node test shim implements only part of the DOM, so check before dispatch.
function emitFoldersChanged() {
  if (typeof CustomEvent !== 'function' || typeof document.dispatchEvent !== 'function') return;
  document.dispatchEvent(new CustomEvent('musi:exercise-folders-change'));
}

function folderOptionIndent(depth) {
  if (!depth || depth < 1) return '';
  return '\u2003'.repeat(Math.min(depth - 1, 4));
}

function categoryHasChildFolders(categoryId) {
  return folderChildren(getStore().categories, categoryId).length > 0;
}

function isSidebarFolderVisible(opt) {
  if (opt.id === 'all' || opt.id === 'uncategorized') return true;
  let parentId = normalizeParentId(opt.parentId);
  while (parentId) {
    if (collapsedSidebarFolders.has(parentId)) return false;
    const parent = folderById(getStore().categories, parentId);
    parentId = parent ? normalizeParentId(parent.parentId) : '';
  }
  return true;
}

function selectedFolderParentLabel() {
  if (selectedCategory === 'all' || selectedCategory === 'uncategorized') return '';
  const cat = folderById(getStore().categories, selectedCategory);
  return cat ? cat.name : '';
}

function moveBlockMessage(reason) {
  const messages = {
    self: 'A folder cannot move into itself.',
    descendant: 'A folder cannot move into its own descendant.',
    depth: `This move would exceed the depth limit of ${MAX_FOLDER_DEPTH} levels.`,
    'parent-missing': 'The chosen parent folder no longer exists.',
    missing: 'This folder no longer exists.',
  };
  return messages[reason] || 'This move is not allowed.';
}

function renderCategories() {
  if (!catListEl) return;
  catListEl.innerHTML = '';

  const makeRow = (key, name, count, opts = {}) => {
    const depth = opts.depth || 0;
    // Use a div, not a button, so tool buttons are not nested inside a button.
    const row = el('div', {
      class: 'ex-cat-item' + (selectedCategory === key ? ' active' : ''),
      'data-cat': key,
      'data-depth': depth ? String(depth) : undefined,
      role: 'button',
      tabindex: '0',
      'aria-pressed': selectedCategory === key ? 'true' : 'false',
    });
    if (opts.hasChildren) {
      const expanded = !collapsedSidebarFolders.has(key);
      const twisty = el('button', {
        class: 'ex-cat-twisty' + (expanded ? ' is-expanded' : ' is-collapsed'),
        type: 'button',
        title: expanded ? 'Collapse folder' : 'Expand folder',
        'aria-label': expanded ? `Collapse ${name}` : `Expand ${name}`,
        'aria-expanded': expanded ? 'true' : 'false',
        html: expanded ? '&#9662;' : '&#9656;',
        onClick: (e) => {
          e.stopPropagation();
          if (collapsedSidebarFolders.has(key)) collapsedSidebarFolders.delete(key);
          else collapsedSidebarFolders.add(key);
          renderCategories();
        },
      });
      row.appendChild(twisty);
    } else if (opts.editable) {
      row.appendChild(el('span', { class: 'ex-cat-twisty-spacer', 'aria-hidden': 'true' }));
    }
    // A deep row can clip the name, so the tooltip carries the full path.
    row.appendChild(el('span', { class: 'ex-cat-name', text: name, title: opts.path || name }));
    row.appendChild(el('span', { class: 'ex-cat-count', text: String(count) }));
    const select = () => {
      setSelectedCategory(key);
      render();
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ex-cat-tool') || e.target.closest('.ex-cat-twisty')) return;
      select();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
    if (opts.editable) {
      const tools = el('div', { class: 'ex-cat-tools' });
      tools.appendChild(el('button', {
        class: 'ex-cat-tool', type: 'button', title: 'Rename folder', 'aria-label': `Rename ${name}`,
        html: '&#9998;', onClick: (e) => { e.stopPropagation(); onRenameCategory(opts.id, name); },
      }));
      tools.appendChild(el('button', {
        class: 'ex-cat-tool', type: 'button', title: 'Move folder', 'aria-label': `Move ${name}`,
        html: '&#8644;', onClick: (e) => { e.stopPropagation(); onMoveCategory(opts.id, name); },
      }));
      tools.appendChild(el('button', {
        class: 'ex-cat-tool ex-cat-del', type: 'button', title: 'Delete folder', 'aria-label': `Delete ${name}`,
        html: '&#10005;', onClick: (e) => { e.stopPropagation(); onDeleteCategory(opts.id, name); },
      }));
      row.appendChild(tools);
    }
    catListEl.appendChild(row);
  };

  getExerciseFolderOptions().forEach((opt) => {
    if (!isSidebarFolderVisible(opt)) return;
    const editable = opt.id !== 'all' && opt.id !== 'uncategorized';
    makeRow(opt.id, opt.label, opt.count, editable ? {
      editable: true,
      id: opt.id,
      depth: opt.depth,
      path: opt.path,
      hasChildren: categoryHasChildFolders(opt.id),
    } : { depth: opt.depth });
  });

  if (addCatInput) {
    const parentName = selectedFolderParentLabel();
    addCatInput.placeholder = parentName ? `New folder in ${parentName}` : 'New folder';
  }
  syncFolderChipLabel();
  emitFoldersChanged();
}

function currentTitleText() {
  if (selectedCategory === 'all') return 'All Exercises';
  if (selectedCategory === 'uncategorized') return 'No folder';
  return folderPathLabel(getStore().categories, selectedCategory, FOLDER_PATH_SEPARATOR) || categoryName(selectedCategory);
}

function buildCategorySelect(item) {
  const select = el('select', { class: 'ex-item-cat-select', 'aria-label': 'Folder' });
  select.appendChild(el('option', { value: '', text: 'No folder' }));
  getExerciseFolderOptions().forEach((opt) => {
    if (opt.id === 'all' || opt.id === 'uncategorized') return;
    const optEl = el('option', {
      value: opt.id,
      text: `${folderOptionIndent(opt.depth)}${opt.label}`,
    });
    if (opt.id === item.categoryId) optEl.selected = true;
    select.appendChild(optEl);
  });
  if (!item.categoryId) select.value = '';
  select.addEventListener('change', () => {
    moveExercise(item.id, select.value);
    // Re-render updates counts and drops the row out of a filtered view.
    render();
  });
  return select;
}

function folderIconSvg(open) {
  if (open) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z"/><path d="M3 10h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
}

function openActionLabel(item) {
  const kind = mediaKind(item);
  if (kind === 'gp' || kind === 'audio' || kind === 'video' || kind === 'youtube') return 'Play';
  return 'Open';
}

function buildExerciseRow(item, opts = {}) {
  const isSelected = selectedIds.has(item.id);
  const row = el('div', {
    class: 'ex-item'
      + (item.id === activeExerciseId ? ' is-active is-playing' : '')
      + (selectionMode && isSelected ? ' is-selected' : ''),
    'data-id': item.id,
  });

  if (selectionMode) {
    const check = el('input', {
      type: 'checkbox',
      class: 'ex-item-check',
      'aria-label': `Select ${item.name}`,
      checked: isSelected ? true : undefined,
    });
    check.addEventListener('change', () => {
      if (check.checked) selectedIds.add(item.id);
      else selectedIds.delete(item.id);
      row.classList.toggle('is-selected', check.checked);
      syncFolderCheckboxForItem(item);
      renderBulkBar();
    });
    row.appendChild(check);
    row.addEventListener('click', (e) => {
      if (!selectionMode) return;
      if (e.target.closest('input.ex-item-name, select, button, a, input.ex-item-check')) return;
      check.checked = !check.checked;
      check.dispatchEvent(new Event('change'));
    });
  }

  const icon = el('div', { class: 'ex-item-icon', html: exerciseIconSvg(item), 'aria-hidden': 'true' });
  row.appendChild(icon);

  const body = el('div', { class: 'ex-item-body' });
  const nameInput = el('input', {
    type: 'text', class: 'ex-item-name', value: item.name, maxlength: String(NAME_LIMIT),
    'aria-label': 'Exercise name',
  });
  nameInput.addEventListener('change', () => {
    const clean = renameExercise(item.id, nameInput.value);
    if (clean) nameInput.value = clean;
  });
  body.appendChild(nameInput);

  const sizeOrSource = item.url ? titleFromUrl(item.url) : fmtSize(item.size);
  const catPart = opts.hideCategory ? '' : `${categoryName(item.categoryId)} · `;
  const meta = `${catPart}${mediaKindLabel(item)} · ${sizeOrSource} · ${fmtRelativeDate(item.addedAt)}`;
  body.appendChild(el('div', { class: 'ex-item-meta', text: meta }));
  row.appendChild(body);

  const actions = el('div', { class: 'ex-item-actions' });
  actions.appendChild(buildCategorySelect(item));
  actions.appendChild(el('button', {
    class: 'btn sm primary ex-item-open', type: 'button', text: openActionLabel(item),
    onClick: () => {
      if (item.id === activeExerciseId) closeExerciseViewer();
      else openExerciseViewer(item.id);
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm ex-item-del', type: 'button', text: 'Delete',
    'aria-label': `Delete ${item.name}`,
    onClick: () => onDeleteExercise(item),
  }));
  row.appendChild(actions);
  return row;
}

// Group items into folder sections by category tag. Empty/missing tags stay
// ungrouped at the end (or under an Uncategorized folder when mixed in).
function groupItemsByCategory(items) {
  const store = getStore();
  const byId = new Map();
  store.categories.forEach(cat => byId.set(cat.id, []));
  const uncategorized = [];

  items.forEach(item => {
    if (item.categoryId && byId.has(item.categoryId)) {
      byId.get(item.categoryId).push(item);
    } else if (item.categoryId) {
      // Orphaned category id — treat as uncategorized for display.
      uncategorized.push(item);
    } else {
      uncategorized.push(item);
    }
  });

  const groups = [];
  // Include empty folders so newly created tags are visible in All.
  store.categories.forEach(cat => {
    const list = byId.get(cat.id) || [];
    groups.push({ key: cat.id, name: cat.name, items: list });
  });
  if (uncategorized.length) {
    groups.push({ key: 'uncategorized', name: 'Uncategorized', items: uncategorized });
  }
  return groups;
}

function folderCountLabel(directCount, totalCount) {
  const direct = `${directCount} exercise${directCount === 1 ? '' : 's'}`;
  if (totalCount > directCount) return `${direct} · ${totalCount} total`;
  return direct;
}

function buildFolder(group, opts = {}) {
  const depth = opts.depth || 1;
  const nestedChildren = opts.nestedChildren || [];
  const totalCount = opts.totalCount != null ? opts.totalCount : group.items.length;
  const open = expandedFolders.has(group.key);
  const folder = el('div', {
    class: 'ex-folder' + (open ? ' is-open' : ''),
    'data-folder': group.key,
    'data-depth': String(depth),
  });

  const head = el('button', {
    class: 'ex-folder-head',
    type: 'button',
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': `ex-folder-body-${group.key}`,
  });
  head.appendChild(el('span', {
    class: 'ex-folder-chevron', 'aria-hidden': 'true', html: open ? '&#9662;' : '&#9656;',
  }));
  head.appendChild(el('span', {
    class: 'ex-folder-icon', 'aria-hidden': 'true', html: folderIconSvg(open),
  }));
  head.appendChild(el('span', { class: 'ex-folder-name', text: group.name }));
  head.appendChild(el('span', {
    class: 'ex-folder-count',
    text: folderCountLabel(group.items.length, totalCount),
  }));
  head.addEventListener('click', () => {
    if (expandedFolders.has(group.key)) expandedFolders.delete(group.key);
    else expandedFolders.add(group.key);
    renderList();
  });

  if (selectionMode && group.items.length) {
    const selected = group.items.filter(it => selectedIds.has(it.id)).length;
    const folderCheck = el('input', {
      type: 'checkbox',
      class: 'ex-folder-check',
      'aria-label': `Select all in ${group.name}`,
      checked: selected === group.items.length ? true : undefined,
    });
    folderCheck.indeterminate = selected > 0 && selected < group.items.length;
    folderCheck.addEventListener('change', () => {
      group.items.forEach((it) => {
        if (folderCheck.checked) selectedIds.add(it.id);
        else selectedIds.delete(it.id);
      });
      group.items.forEach((it) => {
        const row = listEl && listEl.querySelector(`.ex-item[data-id="${CSS.escape(it.id)}"]`);
        if (!row) return;
        const on = selectedIds.has(it.id);
        row.classList.toggle('is-selected', on);
        const itemCheck = row.querySelector('.ex-item-check');
        if (itemCheck) itemCheck.checked = on;
      });
      folderCheck.indeterminate = false;
      renderBulkBar();
    });
    folderCheck.addEventListener('click', (e) => e.stopPropagation());
    const headRow = el('div', { class: 'ex-folder-headrow' }, [folderCheck, head]);
    folder.appendChild(headRow);
  } else {
    folder.appendChild(head);
  }

  const body = el('div', {
    class: 'ex-folder-body',
    id: `ex-folder-body-${group.key}`,
    hidden: open ? undefined : true,
  });
  if (open) {
    const appendChildren = () => {
      nestedChildren.forEach((child) => body.appendChild(child));
    };
    const appendItems = () => {
      if (group.items.length) {
        group.items.forEach(item => body.appendChild(buildExerciseRow(item, { hideCategory: true })));
      }
    };
    appendChildren();
    appendItems();
    if (!group.items.length && !nestedChildren.length) {
      body.appendChild(el('div', {
        class: 'ex-folder-empty',
        text: 'Empty folder — move exercises here with the folder menu on each row.',
      }));
    }
  }
  folder.appendChild(body);
  return folder;
}

function buildNestedFolderSection(folderId, depth) {
  const store = getStore();
  const folder = folderById(store.categories, folderId);
  if (!folder) return null;
  const directItems = getExercises().filter(it => it.categoryId === folderId);
  const childSections = folderChildren(store.categories, folderId)
    .map(child => buildNestedFolderSection(child.id, depth + 1))
    .filter(Boolean);
  const subtreeIds = folderSubtreeIds(store.categories, folderId);
  const totalCount = getExercises().filter(it => subtreeIds.has(it.categoryId)).length;
  return buildFolder({
    key: folderId,
    name: folder.name,
    items: directItems,
  }, {
    depth,
    nestedChildren: childSections,
    totalCount,
  });
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const allItems = getExercises();
  if (!attachmentsSupported()) {
    if (uploadBtn) uploadBtn.disabled = true;
    if (allItems.length === 0) {
      listEl.appendChild(el('div', {
        class: 'ex-empty',
        text: 'File uploads need browser storage (IndexedDB), which is unavailable here. You can still add exercise links.',
      }));
      return;
    }
  } else if (uploadBtn) {
    uploadBtn.disabled = false;
  }

  if (selectedCategory === 'all') {
    // Top-level folder sections nest their children; unfiled items stay in a flat block at the end.
    const groups = groupItemsByCategory(allItems);
    const untagged = groups.find(g => g.key === 'uncategorized');
    const topLevel = folderChildren(getStore().categories, '');

    if (topLevel.length === 0 && !untagged) {
      listEl.appendChild(el('div', {
        class: 'ex-empty',
        text: 'No exercises yet. Upload PDFs, images, audio, video, or add lesson links to practice from.',
      }));
      return;
    }

    if (topLevel.length === 0 && untagged) {
      untagged.items.forEach(item => listEl.appendChild(buildExerciseRow(item)));
      return;
    }

    topLevel.forEach((folder) => {
      const section = buildNestedFolderSection(folder.id, 1);
      if (section) listEl.appendChild(section);
    });
    if (untagged) {
      const loose = el('div', { class: 'ex-ungrouped' });
      loose.appendChild(el('div', { class: 'ex-ungrouped-label', text: 'No folder' }));
      untagged.items.forEach(item => loose.appendChild(buildExerciseRow(item)));
      listEl.appendChild(loose);
    }
    return;
  }

  if (selectedCategory === 'uncategorized') {
    const items = visibleItems();
    if (!items.length) {
      listEl.appendChild(el('div', {
        class: 'ex-empty',
        text: allItems.length === 0
          ? 'No exercises yet. Upload PDFs, images, audio, video, or add lesson links to practice from.'
          : 'No exercises without a folder.',
      }));
      return;
    }
    items.forEach(item => listEl.appendChild(buildExerciseRow(item)));
    return;
  }

  const directItems = getExercises().filter(it => it.categoryId === selectedCategory);
  const childFolders = folderChildren(getStore().categories, selectedCategory);
  if (!directItems.length && !childFolders.length) {
    listEl.appendChild(el('div', {
      class: 'ex-empty',
      text: allItems.length === 0
        ? 'No exercises yet. Upload PDFs, images, audio, video, or add lesson links to practice from.'
        : 'No exercises in this folder yet. Open All Exercises and move items here, or upload while this folder is selected.',
    }));
    return;
  }

  directItems.forEach(item => listEl.appendChild(buildExerciseRow(item)));
  const parentDepth = folderDepth(getStore().categories, selectedCategory) || 1;
  childFolders.forEach((child) => {
    const section = buildNestedFolderSection(child.id, parentDepth + 1);
    if (section) listEl.appendChild(section);
  });
}

function applyActiveRowHighlight() {
  if (!listEl || !activeExerciseId) return;
  listEl.querySelectorAll('.ex-item').forEach((row) => {
    const on = row.dataset.id === activeExerciseId;
    row.classList.toggle('is-active', on);
    row.classList.toggle('is-playing', on);
  });
}

function render() {
  // Selected category may have been deleted; fall back to 'all'.
  if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized'
      && !getStore().categories.some(c => c.id === selectedCategory)) {
    setSelectedCategory('all');
  }
  pruneSelectedIds();
  if (titleEl) titleEl.textContent = currentTitleText();
  renderCategories();
  if (activeExerciseId && !getExercise(activeExerciseId)) {
    closeExerciseViewer();
  }
  renderBulkBar();
  renderList();
  applyActiveRowHighlight();
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
  if (!files.length) return;

  if (!attachmentsSupported()) {
    setStatus('Uploading needs browser storage, which is unavailable here.', true);
    return;
  }

  const targetCategory = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
    ? selectedCategory : '';

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
      takes: [],
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

  const defaultCategoryId = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
    ? selectedCategory : '';

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
  const targetCategory = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
    ? selectedCategory : '';
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
  '.ex-take-drawer.is-open',
  '.ex-take-sheet.is-open',
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

function persistExerciseTakes(exerciseId, takes) {
  const item = getExercise(exerciseId);
  if (!item) return false;
  item.takes = normalizeTakes(takes);
  persist();
  return true;
}

async function addExerciseTake(exerciseId, take) {
  const item = getExercise(exerciseId);
  if (!item || !take) return false;
  const next = normalizeTakes([...(item.takes || []), take]);
  return persistExerciseTakes(exerciseId, next);
}

async function deleteExerciseTake(exerciseId, takeId) {
  const item = getExercise(exerciseId);
  if (!item) return false;
  const removed = (item.takes || []).find((t) => t.id === takeId);
  const next = (item.takes || []).filter((t) => t.id !== takeId);
  if (!persistExerciseTakes(exerciseId, next)) return false;
  if (removed?.attachmentId) await releaseAttachment(removed.attachmentId);
  return true;
}

async function renameExerciseTake(exerciseId, takeId, name) {
  const item = getExercise(exerciseId);
  if (!item) return false;
  const clean = clampText((name || '').trim(), NAME_LIMIT) || 'Take';
  const next = (item.takes || []).map((t) => (t.id === takeId ? { ...t, name: clean } : t));
  if (!persistExerciseTakes(exerciseId, next)) return false;
  const take = next.find((t) => t.id === takeId);
  if (take?.attachmentId) renameFile(take.attachmentId, clean).catch(() => {});
  return true;
}

function teardownTakePanel() {
  if (viewerTakePanel) {
    try { viewerTakePanel.destroy(); } catch (e) { /* ignore */ }
    viewerTakePanel = null;
  }
}

function mountTakePanel(item) {
  teardownTakePanel();
  if (!playerPaneEl || !item) return;
  viewerTakePanel = mountExerciseTakePanel(playerPaneEl, {
    exerciseId: item.id,
    getTakes: () => getExercise(item.id)?.takes || [],
    onSaveTake: (take) => addExerciseTake(item.id, take),
    onDeleteTake: (takeId) => deleteExerciseTake(item.id, takeId),
    onRenameTake: (takeId, name) => renameExerciseTake(item.id, takeId, name),
  });
}

function teardownPlayer() {
  teardownTakePanel();
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
  mountTakePanel(item);
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

function openFolderMoveDialog(id, name) {
  const store = getStore();
  const folder = folderById(store.categories, id);
  if (!folder) return;
  const targets = validMoveTargets(store.categories, id);
  const currentParent = normalizeParentId(folder.parentId);

  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog ex-move-folder-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: `Move folder "${name}"` }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: 'Choose a new parent folder. The folder and everything inside it move together.',
  }));

  const select = el('select', { class: 'modal-input ex-move-folder-select', 'aria-label': 'New parent folder' });
  const topOpt = el('option', { value: '', text: 'Top level (no parent)' });
  if (!currentParent) topOpt.selected = true;
  select.appendChild(topOpt);
  targets.forEach((row) => {
    const opt = el('option', {
      value: row.id,
      text: `${folderOptionIndent(row.depth)}${row.name}`,
    });
    if (row.id === currentParent) opt.selected = true;
    select.appendChild(opt);
  });
  dialog.appendChild(select);

  const error = el('div', { class: 'modal-errors' });
  dialog.appendChild(error);

  const actions = el('div', { class: 'modal-actions' });
  let escapeHandler = null;
  const finish = () => {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    closeDialog();
  };
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: finish,
  }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: 'Move',
    onClick: () => {
      const result = moveExerciseFolder(id, select.value);
      if (result.ok) {
        finish();
        return;
      }
      error.textContent = moveBlockMessage(result.reason);
      setStatus(moveBlockMessage(result.reason), true);
    },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  escapeHandler = (e) => { if (e.key === 'Escape') finish(); };
  document.addEventListener('keydown', escapeHandler);
  dialogRoot.appendChild(overlay);
}

function openPrompt(title, initialValue, confirmLabel, onConfirm) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  const input = el('input', {
    type: 'text', class: 'modal-input', value: initialValue || '', maxlength: String(CAT_LIMIT),
  });
  dialog.appendChild(input);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  const confirm = el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { const v = input.value; closeDialog(); onConfirm(v); },
  });
  actions.appendChild(confirm);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = input.value; closeDialog(); onConfirm(v); } });
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

function onMoveCategory(id, name) {
  openFolderMoveDialog(id, name);
}

function onDeleteCategory(id, name) {
  const directCount = countExercisesInCategory(id);
  const childFolderCount = folderChildren(getStore().categories, id).length;
  const subtreeExerciseCount = countExercisesInCategorySubtree(id);
  const subtreeFolderCount = folderSubtreeIds(getStore().categories, id).size;
  const afterDelete = () => {
    if (selectedCategory === id) setSelectedCategory('all');
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

function onDeleteExercise(item) {
  openConfirm(
    `Delete "${item.name}"?`,
    item.url
      ? 'This removes the exercise link from this device.'
      : 'This permanently removes the exercise file from this device.',
    'Delete',
    async () => {
      await deleteExercise(item.id);
      render();
    },
    { danger: true },
  );
}

// --- init / teardown -------------------------------------------------------

export function initExercises() {
  listEl = document.getElementById('ex-list');
  catListEl = document.getElementById('ex-category-list');
  titleEl = document.getElementById('ex-current-title');
  statusEl = document.getElementById('ex-status');
  bulkBarEl = document.getElementById('ex-bulk-bar');
  fileInput = document.getElementById('ex-file-input');
  bulkFileInput = document.getElementById('ex-bulk-file-input');
  uploadBtn = document.getElementById('ex-upload-btn');
  bulkUploadBtn = document.getElementById('ex-bulk-upload-btn');
  addLinkBtn = document.getElementById('ex-add-link-btn');
  addCatForm = document.getElementById('ex-add-cat-form');
  addCatInput = document.getElementById('ex-add-cat-input');
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
    if (uploadBtn && fileInput) uploadBtn.onclick = () => fileInput.click();
    if (bulkUploadBtn && bulkFileInput) {
      bulkFileInput.setAttribute('accept', BULK_ACCEPT_ATTR);
      bulkUploadBtn.onclick = () => bulkFileInput.click();
      bulkFileInput.addEventListener('change', onBulkUploadFiles);
    }
    if (addLinkBtn) addLinkBtn.onclick = openLinkDialog;
    if (fileInput) {
      fileInput.setAttribute('accept', UPLOAD_ACCEPT_ATTR);
      fileInput.addEventListener('change', onUploadFiles);
    }
    if (addCatForm) {
      addCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = addCatInput?.value || '';
        const result = createExerciseFolder(name);
        if (result.ok) {
          if (addCatInput) addCatInput.value = '';
        } else if (result.reason === 'empty') {
          setStatus('Enter a folder name.', true);
          addCatInput?.focus();
        } else if (result.reason === 'depth') {
          setStatus(`Folders can nest at most ${MAX_FOLDER_DEPTH} levels deep.`, true);
          addCatInput?.focus();
        }
      });
    }
    if (attachmentsSupported()) ensurePersistentStorage();
    wirePlayerControls();
  }

  setStatus('');
  render();
}

// Close the viewer when navigating away from the Exercises section.
export function stopExercises() {
  closeBulkUploadDialog();
  closeExerciseViewer();
  exitSelectionMode();
}
