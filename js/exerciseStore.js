// The exercise store — the headless data layer of the Practice Library.
//
// This module owns the `musi.exercises` record: the folders (categories), the
// exercise items, their normalization, and the reads and writes that go
// through localStorage. It draws nothing, so a Node test and a feature that
// only needs the data can import it without the library screen.
//
// `js/exercises.js` holds the library screen and re-exports the public names
// of this module, so every existing importer keeps working.
//
// Storage mirrors the rest of the app:
//   - exercise metadata + folders live in localStorage (musi.exercises)
//   - uploaded file Blobs live in IndexedDB (attachments.js) keyed by an
//     attachment id, with source 'exercise'.

import { deleteFile } from './attachments.js';
import { clampBpm } from './gpPlayer/tempoRange.js';
import { emitDataChanged } from './dataEvents.js';
import {
  MAX_FOLDER_DEPTH,
  normalizeParentId,
  sanitizeFolderTree,
  folderById,
  folderSubtreeIds,
  folderDepth,
  flattenFolderTree,
  folderPathLabel,
  findSiblingByName,
} from './folderTree.js';
import { normalizeRunnerConfig } from './runnerExerciseModel.js';
import { normalizeCueConfig } from './cueExerciseModel.js';

const STORAGE_KEY = 'musi.exercises';
const NAME_LIMIT = 120;
const CAT_LIMIT = 40;
const URL_LIMIT = 2000;
const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250 MB upload guard for video.
const BODY_LIMIT = 20000;   // characters of a written exercise
const MAX_ATTACHMENTS = 20; // extra files on a written exercise
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

function deriveMaterialType(type, fileName, url, kind) {
  if (kind === 'runner') return 'runner';
  if (kind === 'note') return 'note';
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

// Every exercise has one kind. The kind decides which player opens it and
// which form edits it.
//
//   file   — an uploaded document, image, audio, video, or Guitar Pro score
//   link   — an external lesson page
//   runner — a saved pitch-runner run
//   cue    — a timed instruction list the Cue Runner plays
//   note   — a written exercise the user typed, with optional attachments
export const EXERCISE_KINDS = ['file', 'link', 'runner', 'cue', 'note'];

function deriveKind(raw) {
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  if (EXERCISE_KINDS.includes(kind)) return kind;
  if (raw.runner && typeof raw.runner === 'object') return 'runner';
  if (raw.cue && typeof raw.cue === 'object') return 'cue';
  if (raw.url) return 'link';
  return 'file';
}

/** Extra files on a written exercise. The first file stays on attachmentId. */
function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (out.length >= MAX_ATTACHMENTS) break;
    const id = typeof entry?.attachmentId === 'string' ? entry.attachmentId : '';
    if (!id) continue;
    out.push({
      attachmentId: id,
      name: clampText(typeof entry.name === 'string' ? entry.name : '', NAME_LIMIT),
      fileName: typeof entry.fileName === 'string' ? entry.fileName : '',
      type: typeof entry.type === 'string' ? entry.type : '',
      size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : 0,
    });
  }
  return out;
}

/** Every attachment id one exercise holds, including its extra files. */
function itemAttachmentIds(item) {
  const ids = [];
  if (item?.attachmentId) ids.push(item.attachmentId);
  if (item?.runner?.attachmentId) ids.push(item.runner.attachmentId);
  (Array.isArray(item?.attachments) ? item.attachments : []).forEach((entry) => {
    if (entry?.attachmentId) ids.push(entry.attachmentId);
  });
  return [...new Set(ids)];
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const attachmentId = typeof raw.attachmentId === 'string' && raw.attachmentId ? raw.attachmentId : '';
  const url = safeExternalUrl(raw.url);
  const kind = deriveKind(raw);
  const runnerConfig = kind === 'runner' ? normalizeRunnerConfig(raw.runner) : null;
  const cueConfig = kind === 'cue' ? normalizeCueConfig(raw.cue) : null;
  // A run with no notes cannot play, a cue exercise with no step shows
  // nothing, and a file or link record with neither a file nor a link points
  // at nothing. All three are dropped.
  if (kind === 'runner' && !runnerConfig) return null;
  if (kind === 'cue' && !cueConfig) return null;
  if (kind !== 'runner' && kind !== 'cue' && kind !== 'note' && !attachmentId && !url) return null;
  const defaultName = kind === 'runner'
    ? 'Pitch run'
    : kind === 'cue'
      ? 'Cue exercise'
      : kind === 'note'
        ? 'Written exercise'
        : (url ? titleFromUrl(url) : 'Exercise');
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
    kind,
    runner: runnerConfig,
    cue: cueConfig,
    body: kind === 'note' ? clampText(typeof raw.body === 'string' ? raw.body : '', BODY_LIMIT) : '',
    attachments: normalizeAttachments(raw.attachments),
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
    materialType: materialTypeRaw || deriveMaterialType(type, fileName, url, kind),
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

function attachmentStillReferenced(attachmentId) {
  if (!attachmentId) return false;
  return getStore().items.some((it) => itemAttachmentIds(it).includes(attachmentId));
}

async function releaseAttachmentsForItem(item) {
  for (const attachmentId of itemAttachmentIds(item)) {
    try { await releaseAttachment(attachmentId); } catch (e) { /* keep releasing */ }
  }
}

async function releaseAttachment(attachmentId) {
  if (!attachmentId || attachmentStillReferenced(attachmentId)) return;
  // Shared score blobs are referenced by multiple bar-range exercises; delete only when none remain.
  try { await deleteFile(attachmentId); } catch (e) {}
}

export {
  STORAGE_KEY,
  NAME_LIMIT,
  CAT_LIMIT,
  URL_LIMIT,
  MAX_FILE_BYTES,
  BODY_LIMIT,
  MAX_ATTACHMENTS,
  UPLOAD_ACCEPT_MSG,
  canUseStorage,
  readKey,
  writeKey,
  uid,
  nowISO,
  clampText,
  safeExternalUrl,
  titleFromUrl,
  extensionFromName,
  deriveInstrument,
  deriveMaterialType,
  normalizeTags,
  normalizeAttachments,
  itemAttachmentIds,
  normalizeItem,
  getStore,
  persist,
  categoryName,
  attachmentStillReferenced,
  releaseAttachmentsForItem,
  releaseAttachment,
};

// --- writes ----------------------------------------------------------------

/**
 * Add one exercise to the library.
 *
 * The record goes through the same normalization as a stored one, so a caller
 * cannot write a shape the library cannot read back.
 *
 * @param {Object} raw
 * @returns {Object|null} the stored item, or null when the record is unplayable
 */
export function createExercise(raw) {
  const item = normalizeItem({ ...raw, addedAt: (raw && raw.addedAt) || nowISO() });
  if (!item) return null;
  const store = getStore();
  store.items.push(item);
  persist();
  return item;
}

/**
 * Change one exercise. The patch merges into the stored record and the result
 * goes through normalization again.
 * @returns {Object|null} the stored item, or null when the id is unknown
 */
export function updateExercise(id, patch) {
  const store = getStore();
  const index = store.items.findIndex(it => it.id === id);
  if (index < 0) return null;
  const next = normalizeItem({ ...store.items[index], ...patch, id });
  if (!next) return null;
  store.items[index] = next;
  persist();
  return next;
}

// --- folder reads ----------------------------------------------------------

/** True when the folder id names a folder that exists now. */
export function exerciseFolderExists(id) {
  if (!id || typeof id !== 'string') return false;
  return !!folderById(getStore().categories, id);
}

/**
 * Every folder of the library, in tree order.
 * @returns {Array<{id:string, name:string, parentId:string, depth:number, path:string}>}
 */
export function listExerciseFolders() {
  return flattenFolderTree(getStore().categories);
}

/** The full path of one folder, for example `Vocal › Harsh`. */
export function exerciseFolderPath(id) {
  return folderPathLabel(getStore().categories, id);
}
