// Guitar Pro section annotations for Musi. Free-text notes tied to a beat /
// measure range on a score. Persisted locally (musi.gpAnnotations); nothing
// leaves the device.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage is unavailable.

const STORAGE_KEY = 'musi.gpAnnotations';
const TITLE_LIMIT = 80;
const TEXT_LIMIT = 20000;

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

function uid() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `gpa-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

function firstLine(text) {
  const line = (text || '').split('\n').map(s => s.trim()).find(Boolean);
  return line || '';
}

function normMeasure(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function validBeatRange(startBeat, endBeat) {
  const start = Number(startBeat);
  const end = Number(endBeat);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

// --- score keys ------------------------------------------------------------

export function scoreKeyFromAttachmentId(attachmentId) {
  const id = typeof attachmentId === 'string' ? attachmentId.trim() : '';
  return id ? `att:${id}` : '';
}

export function scoreKeyFromSession({ fileName, byteLength } = {}) {
  const name = typeof fileName === 'string' ? fileName.trim() : '';
  const len = Number(byteLength);
  if (!name || !Number.isFinite(len) || len < 0) return '';
  return `sess:${name}:${len}`;
}

export function resolveScoreKey({ attachmentId, fileName, byteLength } = {}) {
  const att = scoreKeyFromAttachmentId(attachmentId);
  if (att) return att;
  return scoreKeyFromSession({ fileName, byteLength });
}

// --- normalization ---------------------------------------------------------

function normalizeAnnotation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startBeat = Number(raw.startBeat);
  const endBeat = Number(raw.endBeat);
  if (!validBeatRange(startBeat, endBeat)) return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  const text = clampText(typeof raw.text === 'string' ? raw.text : '', TEXT_LIMIT);
  const titleRaw = typeof raw.title === 'string' ? raw.title.trim() : '';
  const title = clampText(titleRaw || firstLine(text), TITLE_LIMIT);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    startBeat,
    endBeat,
    measureStart: normMeasure(raw.measureStart),
    measureEnd: normMeasure(raw.measureEnd),
    title,
    text,
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
  };
}

function defaultStore() {
  return { version: 1, byScore: {} };
}

function normalizeStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== 'object') return base;
  const byScore = {};
  if (raw.byScore && typeof raw.byScore === 'object') {
    Object.entries(raw.byScore).forEach(([key, val]) => {
      if (typeof key !== 'string' || !key) return;
      const annotations = Array.isArray(val?.annotations)
        ? val.annotations.map(normalizeAnnotation).filter(Boolean)
        : [];
      byScore[key] = { annotations };
    });
  }
  return { version: 1, byScore };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    return storeCache;
  }
  try {
    storeCache = normalizeStore(JSON.parse(raw));
  } catch (e) {
    storeCache = defaultStore();
  }
  return storeCache;
}

function persistStore() {
  if (!storeCache) return;
  writeKey(STORAGE_KEY, JSON.stringify(storeCache));
}

export function invalidateGpAnnotationsCache() {
  storeCache = null;
}

function scoreBucket(scoreKey, create) {
  const key = typeof scoreKey === 'string' ? scoreKey.trim() : '';
  if (!key) return null;
  const store = getStore();
  if (!store.byScore[key]) {
    if (!create) return null;
    store.byScore[key] = { annotations: [] };
  }
  return store.byScore[key];
}

function sortedAnnotations(annotations) {
  return annotations.slice().sort((a, b) => {
    const beatDiff = a.startBeat - b.startBeat;
    if (beatDiff !== 0) return beatDiff;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

// --- public API ------------------------------------------------------------

export function listAnnotations(scoreKey) {
  const bucket = scoreBucket(scoreKey, false);
  if (!bucket || !Array.isArray(bucket.annotations)) return [];
  return sortedAnnotations(bucket.annotations);
}

export function getAnnotation(scoreKey, id) {
  if (typeof id !== 'string' || !id) return null;
  const bucket = scoreBucket(scoreKey, false);
  if (!bucket) return null;
  return bucket.annotations.find(a => a.id === id) || null;
}

export function addAnnotation(scoreKey, fields = {}) {
  const bucket = scoreBucket(scoreKey, true);
  if (!bucket) return null;
  const text = clampText(typeof fields.text === 'string' ? fields.text : '', TEXT_LIMIT);
  const titleRaw = typeof fields.title === 'string' ? fields.title.trim() : '';
  const annotation = normalizeAnnotation({
    id: uid(),
    startBeat: fields.startBeat,
    endBeat: fields.endBeat,
    measureStart: fields.measureStart,
    measureEnd: fields.measureEnd,
    title: titleRaw || firstLine(text),
    text,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  if (!annotation) return null;
  bucket.annotations.push(annotation);
  persistStore();
  return annotation;
}

export function updateAnnotation(scoreKey, id, patch = {}) {
  if (typeof id !== 'string' || !id) return null;
  const bucket = scoreBucket(scoreKey, false);
  if (!bucket) return null;
  const i = bucket.annotations.findIndex(a => a.id === id);
  if (i < 0) return null;
  const current = bucket.annotations[i];
  const nextStart = patch.startBeat != null ? patch.startBeat : current.startBeat;
  const nextEnd = patch.endBeat != null ? patch.endBeat : current.endBeat;
  if (!validBeatRange(nextStart, nextEnd)) return null;
  const nextText = patch.text != null
    ? clampText(typeof patch.text === 'string' ? patch.text : '', TEXT_LIMIT)
    : current.text;
  const nextTitle = patch.title != null
    ? clampText(typeof patch.title === 'string' ? patch.title.trim() : '', TITLE_LIMIT)
    : current.title;
  const updated = normalizeAnnotation({
    ...current,
    startBeat: nextStart,
    endBeat: nextEnd,
    measureStart: patch.measureStart !== undefined ? patch.measureStart : current.measureStart,
    measureEnd: patch.measureEnd !== undefined ? patch.measureEnd : current.measureEnd,
    title: nextTitle || firstLine(nextText),
    text: nextText,
    updatedAt: nowISO(),
  });
  if (!updated) return null;
  bucket.annotations[i] = updated;
  persistStore();
  return updated;
}

export function removeAnnotation(scoreKey, id) {
  if (typeof id !== 'string' || !id) return false;
  const bucket = scoreBucket(scoreKey, false);
  if (!bucket) return false;
  const i = bucket.annotations.findIndex(a => a.id === id);
  if (i < 0) return false;
  bucket.annotations.splice(i, 1);
  persistStore();
  return true;
}

export function clearAnnotations(scoreKey) {
  const bucket = scoreBucket(scoreKey, false);
  if (!bucket || !bucket.annotations.length) return;
  bucket.annotations = [];
  persistStore();
}

function annotationTimestamp(anno) {
  return anno?.updatedAt || anno?.createdAt || '';
}

function mergeAnnotationLists(targetList, sourceList) {
  const byId = new Map();
  (targetList || []).forEach((anno) => byId.set(anno.id, anno));
  (sourceList || []).forEach((anno) => {
    const existing = byId.get(anno.id);
    if (!existing) {
      byId.set(anno.id, anno);
      return;
    }
    if (annotationTimestamp(anno) >= annotationTimestamp(existing)) {
      byId.set(anno.id, anno);
    }
  });
  return sortedAnnotations(Array.from(byId.values()));
}

function mergeScoreBuckets(fromKey, toKey, { deleteSource }) {
  const from = typeof fromKey === 'string' ? fromKey.trim() : '';
  const to = typeof toKey === 'string' ? toKey.trim() : '';
  if (!from || !to || from === to) return;

  const fromBucket = scoreBucket(from, false);
  const toBucket = scoreBucket(to, true);
  if (!toBucket) return;

  if (fromBucket?.annotations?.length) {
    toBucket.annotations = mergeAnnotationLists(toBucket.annotations, fromBucket.annotations);
  }

  if (deleteSource) {
    const store = getStore();
    if (store.byScore[from]) delete store.byScore[from];
  }

  persistStore();
}

/** Merge annotations into toKey; delete the fromKey bucket. */
export function migrateAnnotations(fromKey, toKey) {
  mergeScoreBuckets(fromKey, toKey, { deleteSource: true });
}

/** Merge annotations into toKey without removing the fromKey bucket. */
export function copyAnnotations(fromKey, toKey) {
  mergeScoreBuckets(fromKey, toKey, { deleteSource: false });
}
