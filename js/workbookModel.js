// Exercise Workbook storage model for Musi. Ordered exercise lists grouped
// into folders, with per-workbook loop preference and active-entry tracking.
//
// Storage: localStorage key musi.workbooks. All access is defensive so the
// module works fully in-memory when localStorage is unavailable (Node tests).

export const WORKBOOKS_STORAGE_KEY = 'musi.workbooks';

const NAME_LIMIT = 120;
const FOLDER_LIMIT = 40;

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

// --- normalization ---------------------------------------------------------

export function normalizeWorkbookFolder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('wbf');
  const name = clampText(
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Folder',
    FOLDER_LIMIT,
  );
  return { id, name };
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const exerciseId = typeof raw.exerciseId === 'string' && raw.exerciseId ? raw.exerciseId : '';
  if (!exerciseId) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('wbe'),
    exerciseId,
  };
}

export function normalizeWorkbook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = nowISO();
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : t;
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter(Boolean)
    : [];
  let activeEntryId = raw.activeEntryId;
  if (activeEntryId != null && typeof activeEntryId !== 'string') activeEntryId = null;
  if (activeEntryId && !entries.some(e => e.id === activeEntryId)) activeEntryId = null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('wb'),
    name: clampText(
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Workbook',
      NAME_LIMIT,
    ),
    folderId: typeof raw.folderId === 'string' ? raw.folderId : '',
    entries,
    loopEnabled: raw.loopEnabled == null ? true : !!raw.loopEnabled,
    activeEntryId: activeEntryId || null,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
}

function defaultStore() {
  return { folders: [], workbooks: [] };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(WORKBOOKS_STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    persist();
    return storeCache;
  }
  try {
    const parsed = JSON.parse(raw);
    storeCache = {
      folders: Array.isArray(parsed && parsed.folders)
        ? parsed.folders.map(normalizeWorkbookFolder).filter(Boolean)
        : [],
      workbooks: Array.isArray(parsed && parsed.workbooks)
        ? parsed.workbooks.map(normalizeWorkbook).filter(Boolean)
        : [],
    };
  } catch (e) {
    storeCache = defaultStore();
  }
  return storeCache;
}

function persist() {
  if (!storeCache) return;
  writeKey(WORKBOOKS_STORAGE_KEY, JSON.stringify(storeCache));
}

function findWorkbook(id) {
  return getStore().workbooks.find(wb => wb.id === id) || null;
}

function copyEntry(entry) {
  return { id: entry.id, exerciseId: entry.exerciseId };
}

function copyWorkbook(wb) {
  return {
    id: wb.id,
    name: wb.name,
    folderId: wb.folderId,
    entries: wb.entries.map(copyEntry),
    loopEnabled: wb.loopEnabled,
    activeEntryId: wb.activeEntryId,
    createdAt: wb.createdAt,
    updatedAt: wb.updatedAt,
  };
}

function touchUpdated(wb) {
  wb.updatedAt = nowISO();
}

function resolveFolderId(folderId) {
  if (typeof folderId !== 'string' || !folderId) return '';
  return getStore().folders.some(f => f.id === folderId) ? folderId : '';
}

// --- folders ---------------------------------------------------------------

export function listWorkbookFolders() {
  return getStore().folders.map(f => ({ ...f }));
}

export function createWorkbookFolder(name) {
  const clean = clampText((name || '').trim(), FOLDER_LIMIT);
  if (!clean) return null;
  const store = getStore();
  const exists = store.folders.find(f => f.name.toLowerCase() === clean.toLowerCase());
  if (exists) return { ...exists };
  const folder = normalizeWorkbookFolder({ id: uid('wbf'), name: clean });
  store.folders.push(folder);
  persist();
  return { ...folder };
}

export function renameWorkbookFolder(id, name) {
  const clean = clampText((name || '').trim(), FOLDER_LIMIT);
  if (!clean) return false;
  const folder = getStore().folders.find(f => f.id === id);
  if (!folder) return false;
  folder.name = clean;
  persist();
  return true;
}

export function deleteWorkbookFolder(id) {
  const store = getStore();
  const idx = store.folders.findIndex(f => f.id === id);
  if (idx < 0) return false;
  store.folders.splice(idx, 1);
  store.workbooks.forEach(wb => {
    if (wb.folderId === id) wb.folderId = '';
  });
  persist();
  return true;
}

export function getWorkbookFolderOptions() {
  const workbooks = getStore().workbooks;
  const uncategorizedCount = workbooks.filter(wb => !wb.folderId).length;
  const opts = [
    { id: 'all', label: 'All Workbooks', count: workbooks.length },
  ];
  getStore().folders.forEach(folder => {
    opts.push({
      id: folder.id,
      label: folder.name,
      count: workbooks.filter(wb => wb.folderId === folder.id).length,
    });
  });
  if (uncategorizedCount > 0) {
    opts.push({ id: 'uncategorized', label: 'No folder', count: uncategorizedCount });
  }
  return opts;
}

// --- workbooks -------------------------------------------------------------

/** Returns workbooks sorted by updatedAt descending (newest first). */
export function listWorkbooks({ folderId } = {}) {
  let items = getStore().workbooks.slice();
  if (folderId && folderId !== 'all') {
    if (folderId === 'uncategorized') {
      items = items.filter(wb => !wb.folderId);
    } else {
      items = items.filter(wb => wb.folderId === folderId);
    }
  }
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items.map(copyWorkbook);
}

export function getWorkbook(id) {
  const wb = findWorkbook(id);
  return wb ? copyWorkbook(wb) : null;
}

export function createWorkbook({ name, folderId, exerciseIds } = {}) {
  const store = getStore();
  const t = nowISO();
  const wb = normalizeWorkbook({
    id: uid('wb'),
    name: (name || '').trim() || 'Workbook',
    folderId: resolveFolderId(folderId),
    entries: [],
    loopEnabled: true,
    activeEntryId: null,
    createdAt: t,
    updatedAt: t,
  });
  if (Array.isArray(exerciseIds)) {
    wb.entries = exerciseIds
      .filter(id => typeof id === 'string' && id)
      .map(exerciseId => ({ id: uid('wbe'), exerciseId }));
  }
  store.workbooks.push(wb);
  persist();
  return copyWorkbook(wb);
}

export function renameWorkbook(id, name) {
  const wb = findWorkbook(id);
  if (!wb) return false;
  const clean = clampText((name || '').trim(), NAME_LIMIT);
  if (!clean) return false;
  wb.name = clean;
  touchUpdated(wb);
  persist();
  return true;
}

export function deleteWorkbook(id) {
  const store = getStore();
  const idx = store.workbooks.findIndex(wb => wb.id === id);
  if (idx < 0) return false;
  store.workbooks.splice(idx, 1);
  persist();
  return true;
}

export function setWorkbookFolder(id, folderId) {
  const wb = findWorkbook(id);
  if (!wb) return false;
  wb.folderId = resolveFolderId(folderId);
  touchUpdated(wb);
  persist();
  return true;
}

export function setWorkbookLoop(id, enabled) {
  const wb = findWorkbook(id);
  if (!wb) return false;
  wb.loopEnabled = !!enabled;
  touchUpdated(wb);
  persist();
  return true;
}

// --- entries ---------------------------------------------------------------

export function addExercisesToWorkbook(workbookId, exerciseIds) {
  const wb = findWorkbook(workbookId);
  if (!wb || !Array.isArray(exerciseIds)) return [];
  const created = [];
  for (const exerciseId of exerciseIds) {
    if (typeof exerciseId !== 'string' || !exerciseId) continue;
    const entry = { id: uid('wbe'), exerciseId };
    wb.entries.push(entry);
    created.push(copyEntry(entry));
  }
  if (created.length) {
    touchUpdated(wb);
    persist();
  }
  return created;
}

export function removeWorkbookEntry(workbookId, entryId) {
  const wb = findWorkbook(workbookId);
  if (!wb) return false;
  const idx = wb.entries.findIndex(e => e.id === entryId);
  if (idx < 0) return false;
  const wasActive = wb.activeEntryId === entryId;
  wb.entries.splice(idx, 1);
  if (wasActive) {
    if (!wb.entries.length) {
      wb.activeEntryId = null;
    } else if (idx < wb.entries.length) {
      wb.activeEntryId = wb.entries[idx].id;
    } else {
      wb.activeEntryId = wb.entries[wb.entries.length - 1].id;
    }
  }
  touchUpdated(wb);
  persist();
  return true;
}

export function moveWorkbookEntry(workbookId, entryId, delta) {
  const wb = findWorkbook(workbookId);
  if (!wb || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false;
  const idx = wb.entries.findIndex(e => e.id === entryId);
  if (idx < 0) return false;
  const newIdx = idx + Number(delta);
  if (newIdx < 0 || newIdx >= wb.entries.length) return false;
  const [entry] = wb.entries.splice(idx, 1);
  wb.entries.splice(newIdx, 0, entry);
  touchUpdated(wb);
  persist();
  return true;
}

export function reorderWorkbookEntries(workbookId, orderedEntryIds) {
  const wb = findWorkbook(workbookId);
  if (!wb || !Array.isArray(orderedEntryIds)) return false;
  const byId = new Map(wb.entries.map(e => [e.id, e]));
  const used = new Set();
  const next = [];
  for (const id of orderedEntryIds) {
    if (typeof id !== 'string' || !id || used.has(id)) continue;
    const entry = byId.get(id);
    if (entry) {
      next.push(entry);
      used.add(id);
    }
  }
  for (const entry of wb.entries) {
    if (!used.has(entry.id)) next.push(entry);
  }
  wb.entries = next;
  touchUpdated(wb);
  persist();
  return true;
}

// Moving through a workbook is practice position, not an edit, so it does not
// bump updatedAt — otherwise playing a workbook would reshuffle the library.
export function setActiveWorkbookEntry(workbookId, entryId) {
  const wb = findWorkbook(workbookId);
  if (!wb) return false;
  if (!wb.entries.some(e => e.id === entryId)) return false;
  wb.activeEntryId = entryId;
  persist();
  return true;
}

export function getActiveWorkbookEntry(workbookId) {
  const wb = findWorkbook(workbookId);
  if (!wb || !wb.entries.length) return null;
  let idx = wb.entries.findIndex(e => e.id === wb.activeEntryId);
  if (idx < 0) idx = 0;
  return { entry: copyEntry(wb.entries[idx]), index: idx };
}

export function nextWorkbookEntry(workbookId, { wrap = true } = {}) {
  const wb = findWorkbook(workbookId);
  if (!wb || !wb.entries.length) return null;
  const current = getActiveWorkbookEntry(workbookId);
  const idx = current ? current.index : -1;
  let nextIdx = idx + 1;
  if (nextIdx >= wb.entries.length) {
    if (!wrap) return null;
    nextIdx = 0;
  }
  const entry = wb.entries[nextIdx];
  wb.activeEntryId = entry.id;
  persist();
  return copyEntry(entry);
}

export function prevWorkbookEntry(workbookId, { wrap = true } = {}) {
  const wb = findWorkbook(workbookId);
  if (!wb || !wb.entries.length) return null;
  const current = getActiveWorkbookEntry(workbookId);
  const idx = current ? current.index : 0;
  let prevIdx = idx - 1;
  if (prevIdx < 0) {
    if (!wrap) return null;
    prevIdx = wb.entries.length - 1;
  }
  const entry = wb.entries[prevIdx];
  wb.activeEntryId = entry.id;
  persist();
  return copyEntry(entry);
}

export function pruneMissingExercises(workbookId, existingExerciseIds) {
  const wb = findWorkbook(workbookId);
  if (!wb) return 0;
  const valid = new Set(
    Array.isArray(existingExerciseIds)
      ? existingExerciseIds.filter(id => typeof id === 'string' && id)
      : [],
  );
  const before = wb.entries.length;
  wb.entries = wb.entries.filter(e => valid.has(e.exerciseId));
  const removed = before - wb.entries.length;
  if (!removed) return 0;
  if (wb.activeEntryId && !wb.entries.some(e => e.id === wb.activeEntryId)) {
    wb.activeEntryId = wb.entries.length ? wb.entries[0].id : null;
  }
  touchUpdated(wb);
  persist();
  return removed;
}
