// Read-only typed facade over Musi library stores (exercises, workbooks,
// routines, scores, media). Does not merge or rewrite any backing store.
//
// Synchronous APIs read localStorage only. Attachment metadata is exposed via
// async listMediaFromAttachments() (IndexedDB). Imports cleanly in Node. No DOM
// at module scope.

import { listFilesMeta } from '../attachments.js';

const EXERCISES_KEY = 'musi.exercises';
const WORKBOOKS_KEY = 'musi.workbooks';
const ROUTINES_KEY = 'musi.routines';

const LIBRARY_TYPES = new Set([
  'exercise',
  'workbook',
  'routine',
  'score',
  'audio',
  'video',
  'image',
  'pdf',
  'link',
  'project',
]);

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

function readJson(key, fallback) {
  const raw = readKey(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function fileExt(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isGuitarProName(name) {
  return /\.(gp|gpx|gp3|gp4|gp5)$/i.test(String(name || ''));
}

function isAmbiguousAvExt(ext) {
  return ext === 'ogg' || ext === 'oga' || ext === 'webm';
}

function isPdfExercise(item) {
  return item.type === 'application/pdf' || fileExt(item.fileName || item.name) === 'pdf';
}

function isImageExercise(item) {
  const t = item.type || '';
  if (t.startsWith('image/')) return true;
  return /^(png|jpe?g|gif|webp|bmp|svg)$/.test(fileExt(item.fileName || item.name));
}

function isAudioExercise(item) {
  const t = item.type || '';
  if (t.startsWith('video/')) return false;
  if (t.startsWith('audio/')) return true;
  const ext = fileExt(item.fileName || item.name);
  if (/^(mp3|m4a|aac|wav|opus|flac)$/.test(ext)) return true;
  if (isAmbiguousAvExt(ext)) return !t || t.startsWith('audio/');
  return false;
}

function isVideoExercise(item) {
  const t = item.type || '';
  if (t.startsWith('audio/')) return false;
  if (t.startsWith('video/')) return true;
  const ext = fileExt(item.fileName || item.name);
  if (/^(mp4|m4v|mov|ogv)$/.test(ext)) return true;
  if (isAmbiguousAvExt(ext)) return t.startsWith('video/');
  return false;
}

function isLinkExercise(item) {
  return !!item.url;
}

function isScoreExercise(item) {
  if (!item || item.url) return false;
  return (
    item.type === 'application/x-guitar-pro'
    || isGuitarProName(item.fileName || item.name || '')
    || /^(gp|gp5)$/i.test(fileExt(item.fileName || item.name))
  );
}

function exerciseMediaType(item) {
  if (isLinkExercise(item)) return 'link';
  if (isScoreExercise(item)) return 'score';
  if (isVideoExercise(item)) return 'video';
  if (isAudioExercise(item)) return 'audio';
  if (isImageExercise(item)) return 'image';
  if (isPdfExercise(item)) return 'pdf';
  return null;
}

function categoryName(categories, categoryId) {
  if (!categoryId) return 'No folder';
  const cat = categories.find(c => c.id === categoryId);
  return cat ? cat.name : 'No folder';
}

function folderName(folders, folderId) {
  if (!folderId) return 'No folder';
  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : 'No folder';
}

function matchesQuery(item, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;
  const title = (item.title || '').toLowerCase();
  const subtitle = (item.subtitle || '').toLowerCase();
  return title.includes(q) || subtitle.includes(q);
}

function copyExerciseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  if (!id) return null;
  const attachmentId = typeof raw.attachmentId === 'string' ? raw.attachmentId : '';
  const url = typeof raw.url === 'string' ? raw.url : '';
  if (!attachmentId && !url) return null;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : '',
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '',
    attachmentId,
    url,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    type: typeof raw.type === 'string' ? raw.type : '',
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : '',
    measureStart: raw.measureStart,
    measureEnd: raw.measureEnd,
    loopEnabled: raw.loopEnabled,
    bpm: raw.bpm,
    takes: Array.isArray(raw.takes) ? raw.takes : [],
  };
}

function readExercisesStore() {
  const parsed = readJson(EXERCISES_KEY, { categories: [], items: [] });
  const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(copyExerciseItem).filter(Boolean)
    : [];
  return { categories, items };
}

function readWorkbooksStore() {
  const parsed = readJson(WORKBOOKS_KEY, { folders: [], workbooks: [] });
  const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
  const workbooks = Array.isArray(parsed.workbooks) ? parsed.workbooks : [];
  return { folders, workbooks };
}

function readRoutinesStore() {
  const parsed = readJson(ROUTINES_KEY, { routines: [] });
  const routines = Array.isArray(parsed.routines) ? parsed.routines : [];
  return { routines };
}

let libraryCache = null;

function buildLibraryCache() {
  const exercises = readExercisesStore();
  const workbooks = readWorkbooksStore();
  const routines = readRoutinesStore();
  const items = [];

  for (const ex of exercises.items) {
    const folderLabel = categoryName(exercises.categories, ex.categoryId);
    const hasTakes = (ex.takes || []).length > 0;
    const exerciseMeta = {
      categoryId: ex.categoryId,
      fileName: ex.fileName,
      hasTakes,
      bpm: ex.bpm,
      measureStart: ex.measureStart,
      measureEnd: ex.measureEnd,
    };
    items.push({
      ref: { type: 'exercise', id: ex.id },
      title: ex.name || 'Exercise',
      subtitle: folderLabel,
      type: 'exercise',
      updatedAt: ex.addedAt || '',
      meta: exerciseMeta,
      folderId: ex.categoryId || '',
    });

    const mediaType = exerciseMediaType(ex);
    if (mediaType === 'score') {
      items.push({
        ref: { type: 'score', id: ex.id },
        title: ex.name || 'Score',
        subtitle: ex.fileName || folderLabel,
        type: 'score',
        updatedAt: ex.addedAt || '',
        meta: {
          fileName: ex.fileName,
          bpm: ex.bpm,
          measureStart: ex.measureStart,
          measureEnd: ex.measureEnd,
        },
        folderId: ex.categoryId || '',
      });
    } else if (mediaType && mediaType !== 'score') {
      items.push({
        ref: { type: mediaType, id: ex.id },
        title: ex.name || mediaType,
        subtitle: ex.fileName || ex.url || folderLabel,
        type: mediaType,
        updatedAt: ex.addedAt || '',
        meta: {
          fileName: ex.fileName,
          url: ex.url || null,
          attachmentId: ex.attachmentId || null,
        },
        folderId: ex.categoryId || '',
      });
    }
  }

  for (const wb of workbooks.workbooks) {
    if (!wb || typeof wb !== 'object') continue;
    const id = typeof wb.id === 'string' ? wb.id : '';
    if (!id) continue;
    const entryCount = Array.isArray(wb.entries) ? wb.entries.length : 0;
    items.push({
      ref: { type: 'workbook', id },
      title: typeof wb.name === 'string' ? wb.name : 'Workbook',
      subtitle: folderName(workbooks.folders, wb.folderId || ''),
      type: 'workbook',
      updatedAt: typeof wb.updatedAt === 'string' ? wb.updatedAt : (wb.createdAt || ''),
      meta: {
        folderId: typeof wb.folderId === 'string' ? wb.folderId : '',
        entryCount,
        loopEnabled: wb.loopEnabled == null ? true : !!wb.loopEnabled,
      },
      folderId: typeof wb.folderId === 'string' ? wb.folderId : '',
    });
  }

  for (const rt of routines.routines) {
    if (!rt || typeof rt !== 'object') continue;
    const id = typeof rt.id === 'string' ? rt.id : '';
    if (!id) continue;
    const sessions = Array.isArray(rt.sessions) ? rt.sessions : [];
    items.push({
      ref: { type: 'routine', id },
      title: typeof rt.name === 'string' ? rt.name : 'Routine',
      subtitle: typeof rt.description === 'string' && rt.description.trim()
        ? rt.description.trim().slice(0, 80)
        : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
      type: 'routine',
      updatedAt: typeof rt.updatedAt === 'string' ? rt.updatedAt : (rt.createdAt || ''),
      meta: {
        sessionCount: sessions.length,
        activeSessionId: rt.activeSessionId || null,
      },
      folderId: '',
    });
  }

  // EXTENSION_POINT: project items from musi.projects / projectModel.js (future).
  if (LIBRARY_TYPES.has('project')) {
    /* intentionally empty until js/create/projectModel.js lands */
  }

  return { items, exercises, workbooks, routines };
}

function getLibraryCache() {
  if (!libraryCache) libraryCache = buildLibraryCache();
  return libraryCache;
}

export function invalidateLibraryCache() {
  libraryCache = null;
}

function copyLibraryItem(item) {
  return {
    ref: { type: item.ref.type, id: item.ref.id },
    title: item.title,
    subtitle: item.subtitle,
    type: item.type,
    updatedAt: item.updatedAt,
    meta: { ...item.meta },
  };
}

export function listLibrary(filter = {}) {
  let items = getLibraryCache().items.slice();

  if (filter.type) {
    items = items.filter(it => it.type === filter.type);
  }
  if (filter.folderId) {
    const folderId = filter.folderId;
    if (folderId === 'uncategorized') {
      items = items.filter(it => !it.folderId);
    } else {
      items = items.filter(it => it.folderId === folderId);
    }
  }
  if (filter.query) {
    items = items.filter(it => matchesQuery(it, filter.query));
  }

  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title));

  if (filter.limit != null && Number.isFinite(Number(filter.limit))) {
    const limit = Math.max(0, Math.floor(Number(filter.limit)));
    items = items.slice(0, limit);
  }

  return items.map(copyLibraryItem);
}

export function getItem(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const type = typeof ref.type === 'string' ? ref.type : '';
  const id = typeof ref.id === 'string' ? ref.id : '';
  if (!type || !id || !LIBRARY_TYPES.has(type)) return null;
  const hit = getLibraryCache().items.find(it => it.ref.type === type && it.ref.id === id);
  return hit ? copyLibraryItem(hit) : null;
}

export function resolveRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  for (const ref of refs) {
    const item = getItem(ref);
    if (item) out.push(item);
  }
  return out;
}

export function describeRef(ref) {
  if (!ref || typeof ref !== 'object') return 'Unknown item';
  const type = typeof ref.type === 'string' ? ref.type : '';
  const id = typeof ref.id === 'string' ? ref.id : '';
  if (!type || !id) return 'Unknown item';
  const item = getItem(ref);
  if (item) return item.title;
  const labels = {
    exercise: 'Exercise',
    workbook: 'Workbook',
    routine: 'Routine',
    score: 'Score',
    audio: 'Audio',
    video: 'Video',
    image: 'Image',
    pdf: 'PDF',
    link: 'Link',
    project: 'Project',
  };
  const label = labels[type] || type;
  return `${label} (${id})`;
}

export function libraryCounts() {
  const counts = {
    exercise: 0,
    workbook: 0,
    routine: 0,
    score: 0,
    audio: 0,
    video: 0,
    image: 0,
    pdf: 0,
    link: 0,
    project: 0,
  };
  for (const item of getLibraryCache().items) {
    if (counts[item.type] != null) counts[item.type] += 1;
  }
  return counts;
}

export async function listMediaFromAttachments() {
  const metas = await listFilesMeta();
  return metas.map(meta => ({
    ref: { type: 'audio', id: meta.id },
    title: meta.name || 'Attachment',
    subtitle: meta.fileName || meta.type || '',
    type: inferAttachmentMediaType(meta),
    updatedAt: meta.createdAt || '',
    meta: {
      fileName: meta.fileName || '',
      attachmentId: meta.id,
      source: meta.source || '',
      size: meta.size || 0,
    },
  }));
}

function inferAttachmentMediaType(meta) {
  const t = meta.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('audio/')) return 'audio';
  const ext = fileExt(meta.fileName || meta.name);
  if (/^(mp3|m4a|aac|wav|opus|flac)$/.test(ext)) return 'audio';
  if (/^(mp4|m4v|mov|ogv)$/.test(ext)) return 'video';
  if (/^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'audio';
}
