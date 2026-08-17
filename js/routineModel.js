// Practice Routine storage model for Musi. Ordered sessions with workbook
// attachments, per-session metronome config, and optional duration targets.
//
// Storage: localStorage key musi.routines. All access is defensive so the
// module works fully in-memory when localStorage is unavailable (Node tests).

import { normalizeCompanions } from './exerciseCompanions/types.js';
import { emitDataChanged } from './dataEvents.js';

export const ROUTINES_STORAGE_KEY = 'musi.routines';
export const ROUTINE_EXPORT_KIND = 'musi-routines';
export const ROUTINE_EXPORT_VERSION = 1;

export const SESSION_SUBDIVISIONS = [
  { id: 'quarter', label: '4ths', perBeat: 1 },
  { id: 'eighth', label: '8ths', perBeat: 2 },
  { id: 'triplet', label: 'Triplets', perBeat: 3 },
  { id: 'sixteenth', label: '16ths', perBeat: 4 },
];

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 500;
const NOTES_LIMIT = 20000;
const BPM_MIN = 30;
const BPM_MAX = 300;
const BEATS_MIN = 1;
const BEATS_MAX = 12;
const DURATION_MIN = 1;
const DURATION_MAX = 600;
const SUBDIV_IDS = new Set(SESSION_SUBDIVISIONS.map(s => s.id));

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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  if (i < min || i > max) return fallback;
  return i;
}

// --- normalization ---------------------------------------------------------

export function normalizeSessionMetronome(raw) {
  const defaults = {
    bpm: 100,
    beats: 4,
    subdiv: 'quarter',
    accentFirst: true,
  };
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const bpm = clampInt(raw.bpm, BPM_MIN, BPM_MAX, defaults.bpm);
  const beats = clampInt(raw.beats, BEATS_MIN, BEATS_MAX, defaults.beats);
  const subdiv = typeof raw.subdiv === 'string' && SUBDIV_IDS.has(raw.subdiv)
    ? raw.subdiv
    : defaults.subdiv;
  return {
    bpm,
    beats,
    subdiv,
    accentFirst: raw.accentFirst == null ? defaults.accentFirst : !!raw.accentFirst,
  };
}

function normalizeWorkbookIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function normalizeRoutineSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let durationMin = null;
  if (raw.durationMin != null) {
    const d = clampInt(raw.durationMin, DURATION_MIN, DURATION_MAX, null);
    durationMin = d;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('rs'),
    name: clampText(
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Session',
      NAME_LIMIT,
    ),
    notes: clampText(typeof raw.notes === 'string' ? raw.notes : '', NOTES_LIMIT),
    workbookIds: normalizeWorkbookIds(raw.workbookIds),
    durationMin,
    metronome: normalizeSessionMetronome(raw.metronome),
    completed: raw.completed === true,
  };
}

export function normalizeRoutine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = nowISO();
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : t;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(normalizeRoutineSession).filter(Boolean)
    : [];
  let activeSessionId = raw.activeSessionId;
  if (activeSessionId != null && typeof activeSessionId !== 'string') activeSessionId = null;
  if (activeSessionId && !sessions.some(s => s.id === activeSessionId)) activeSessionId = null;

  const rt = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('rt'),
    name: clampText(
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Routine',
      NAME_LIMIT,
    ),
    description: clampText(typeof raw.description === 'string' ? raw.description : '', DESCRIPTION_LIMIT),
    sessions,
    activeSessionId: activeSessionId || null,
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
  reconcileRoutineActiveSession(rt);
  return rt;
}

function defaultStore() {
  return { routines: [] };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(ROUTINES_STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    persist();
    return storeCache;
  }
  try {
    const parsed = JSON.parse(raw);
    storeCache = {
      routines: Array.isArray(parsed && parsed.routines)
        ? parsed.routines.map(normalizeRoutine).filter(Boolean)
        : [],
    };
  } catch (e) {
    storeCache = defaultStore();
  }
  return storeCache;
}

function persist() {
  if (!storeCache) return;
  if (writeKey(ROUTINES_STORAGE_KEY, JSON.stringify(storeCache))) {
    emitDataChanged('routines');
  }
}

export function invalidateRoutinesCache() {
  storeCache = null;
}

function findRoutine(id) {
  return getStore().routines.find(rt => rt.id === id) || null;
}

function copyMetronome(m) {
  return { bpm: m.bpm, beats: m.beats, subdiv: m.subdiv, accentFirst: m.accentFirst };
}

function copySession(session) {
  return {
    id: session.id,
    name: session.name,
    notes: session.notes,
    workbookIds: session.workbookIds.slice(),
    durationMin: session.durationMin,
    metronome: copyMetronome(session.metronome),
    completed: !!session.completed,
  };
}

function copyRoutine(rt) {
  return {
    id: rt.id,
    name: rt.name,
    description: rt.description,
    sessions: rt.sessions.map(copySession),
    activeSessionId: rt.activeSessionId,
    createdAt: rt.createdAt,
    updatedAt: rt.updatedAt,
  };
}

function touchUpdated(rt) {
  rt.updatedAt = nowISO();
}

function firstIncompleteSessionId(sessions, { afterIndex = -1 } = {}) {
  if (!Array.isArray(sessions) || !sessions.length) return null;
  const after = sessions.slice(afterIndex + 1).find(s => !s.completed);
  if (after) return after.id;
  const before = sessions.slice(0, afterIndex + 1).find(s => !s.completed);
  return before ? before.id : null;
}

/** Keep activeSessionId on an incomplete session, or null when every session is done. */
export function reconcileRoutineActiveSession(rt) {
  if (!rt || !Array.isArray(rt.sessions)) return;
  if (!rt.sessions.length) {
    rt.activeSessionId = null;
    return;
  }
  const active = rt.activeSessionId
    ? rt.sessions.find(s => s.id === rt.activeSessionId)
    : null;
  if (!active) {
    rt.activeSessionId = null;
    return;
  }
  if (!active.completed) return;
  rt.activeSessionId = firstIncompleteSessionId(rt.sessions);
}

/** Canonical completion mutation; callers persist when appropriate. */
function mutateSessionCompletion(rt, sessionId, completed) {
  const session = rt.sessions.find(s => s.id === sessionId);
  if (!session) return false;
  const nextCompleted = !!completed;
  if (session.completed === nextCompleted) return true;

  session.completed = nextCompleted;
  if (nextCompleted) {
    if (rt.activeSessionId === sessionId) {
      const currentIdx = rt.sessions.findIndex(s => s.id === sessionId);
      rt.activeSessionId = firstIncompleteSessionId(rt.sessions, { afterIndex: currentIdx - 1 });
    }
  } else if (
    !rt.activeSessionId
    || !rt.sessions.some(s => s.id === rt.activeSessionId && !s.completed)
  ) {
    rt.activeSessionId = sessionId;
  }
  return true;
}

// --- routines --------------------------------------------------------------

/** Returns routines sorted by updatedAt descending (newest first). */
export function listRoutines() {
  const items = getStore().routines.slice();
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return items.map(copyRoutine);
}

export function getRoutine(id) {
  const rt = findRoutine(id);
  return rt ? copyRoutine(rt) : null;
}

export function createRoutine({ name, description, sessions } = {}) {
  const store = getStore();
  const t = nowISO();
  const rt = normalizeRoutine({
    id: uid('rt'),
    name: (name || '').trim() || 'Routine',
    description: typeof description === 'string' ? description : '',
    sessions: Array.isArray(sessions)
      ? sessions.map(s => normalizeRoutineSession({ ...s, id: uid('rs') }))
      : [],
    activeSessionId: null,
    createdAt: t,
    updatedAt: t,
  });
  store.routines.push(rt);
  persist();
  return copyRoutine(rt);
}

export function renameRoutine(id, name) {
  const rt = findRoutine(id);
  if (!rt) return false;
  const clean = clampText((name || '').trim(), NAME_LIMIT);
  if (!clean) return false;
  rt.name = clean;
  touchUpdated(rt);
  persist();
  return true;
}

export function setRoutineDescription(id, description) {
  const rt = findRoutine(id);
  if (!rt) return false;
  rt.description = clampText(typeof description === 'string' ? description : '', DESCRIPTION_LIMIT);
  touchUpdated(rt);
  persist();
  return true;
}

export function deleteRoutine(id) {
  const store = getStore();
  const idx = store.routines.findIndex(rt => rt.id === id);
  if (idx < 0) return false;
  store.routines.splice(idx, 1);
  persist();
  return true;
}

export function duplicateRoutine(id) {
  const rt = findRoutine(id);
  if (!rt) return null;
  const store = getStore();
  const t = nowISO();
  const copy = normalizeRoutine({
    id: uid('rt'),
    name: `${rt.name} copy`,
    description: rt.description,
    sessions: rt.sessions.map(s => normalizeRoutineSession({
      ...s,
      id: uid('rs'),
      completed: false,
      metronome: { ...s.metronome },
      workbookIds: s.workbookIds.slice(),
    })),
    activeSessionId: null,
    createdAt: t,
    updatedAt: t,
  });
  store.routines.push(copy);
  persist();
  return copyRoutine(copy);
}

// --- sessions --------------------------------------------------------------

export function addRoutineSession(routineId, { name, notes, workbookIds, durationMin, metronome } = {}) {
  const rt = findRoutine(routineId);
  if (!rt) return null;
  const session = normalizeRoutineSession({
    id: uid('rs'),
    name,
    notes,
    workbookIds,
    durationMin,
    metronome,
  });
  rt.sessions.push(session);
  touchUpdated(rt);
  persist();
  return copySession(session);
}

export function updateRoutineSession(routineId, sessionId, patch) {
  const rt = findRoutine(routineId);
  if (!rt || !patch || typeof patch !== 'object') return false;
  const session = rt.sessions.find(s => s.id === sessionId);
  if (!session) return false;

  const patchKeys = Object.keys(patch);
  const keys = ['name', 'notes', 'durationMin', 'metronome', 'workbookIds', 'completed'];
  const hasKnown = keys.some(k => k in patch);
  if (!hasKnown) return false;

  if ('completed' in patch && patchKeys.length === 1) {
    return setRoutineSessionCompleted(routineId, sessionId, patch.completed);
  }

  if ('name' in patch) {
    session.name = clampText(
      typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : 'Session',
      NAME_LIMIT,
    );
  }
  if ('notes' in patch) {
    session.notes = clampText(typeof patch.notes === 'string' ? patch.notes : '', NOTES_LIMIT);
  }
  if ('durationMin' in patch) {
    if (patch.durationMin == null) {
      session.durationMin = null;
    } else {
      session.durationMin = clampInt(patch.durationMin, DURATION_MIN, DURATION_MAX, null);
    }
  }
  if ('metronome' in patch && patch.metronome && typeof patch.metronome === 'object') {
    const current = session.metronome;
    const merged = { ...current, ...patch.metronome };
    session.metronome = normalizeSessionMetronome(merged);
  }
  if ('workbookIds' in patch) {
    session.workbookIds = normalizeWorkbookIds(patch.workbookIds);
  }
  if ('completed' in patch && !mutateSessionCompletion(rt, sessionId, patch.completed)) {
    return false;
  }

  touchUpdated(rt);
  persist();
  return true;
}

/** Mark a session complete or incomplete; advances active session when completing the current one. */
export function setRoutineSessionCompleted(routineId, sessionId, completed) {
  const rt = findRoutine(routineId);
  if (!rt) return false;
  if (!mutateSessionCompletion(rt, sessionId, completed)) return false;
  touchUpdated(rt);
  persist();
  return true;
}

/** Sessions for display; completed ones are omitted unless includeCompleted is true. */
export function filterRoutineSessions(sessions, { includeCompleted = false } = {}) {
  if (!Array.isArray(sessions)) return [];
  if (includeCompleted) return sessions.slice();
  return sessions.filter(s => !s.completed);
}

export function deleteRoutineSession(routineId, sessionId) {
  const rt = findRoutine(routineId);
  if (!rt) return false;
  const idx = rt.sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return false;
  const wasActive = rt.activeSessionId === sessionId;
  rt.sessions.splice(idx, 1);
  if (wasActive) {
    if (!rt.sessions.length) {
      rt.activeSessionId = null;
    } else {
      rt.activeSessionId = firstIncompleteSessionId(rt.sessions, { afterIndex: idx - 1 });
    }
  } else {
    reconcileRoutineActiveSession(rt);
  }
  touchUpdated(rt);
  persist();
  return true;
}

export function moveRoutineSession(routineId, sessionId, delta) {
  const rt = findRoutine(routineId);
  if (!rt || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false;
  const idx = rt.sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return false;
  const newIdx = idx + Number(delta);
  if (newIdx < 0 || newIdx >= rt.sessions.length) return false;
  const [session] = rt.sessions.splice(idx, 1);
  rt.sessions.splice(newIdx, 0, session);
  touchUpdated(rt);
  persist();
  return true;
}

export function reorderRoutineSessions(routineId, orderedSessionIds) {
  const rt = findRoutine(routineId);
  if (!rt || !Array.isArray(orderedSessionIds)) return false;
  const byId = new Map(rt.sessions.map(s => [s.id, s]));
  const used = new Set();
  const next = [];
  for (const id of orderedSessionIds) {
    if (typeof id !== 'string' || !id || used.has(id)) continue;
    const session = byId.get(id);
    if (session) {
      next.push(session);
      used.add(id);
    }
  }
  for (const session of rt.sessions) {
    if (!used.has(session.id)) next.push(session);
  }
  rt.sessions = next;
  touchUpdated(rt);
  persist();
  return true;
}

// Moving through a routine is practice position, not an edit, so it does not
// bump updatedAt — otherwise playing a routine would reshuffle the library.
export function setActiveRoutineSession(routineId, sessionId) {
  const rt = findRoutine(routineId);
  if (!rt) return false;
  if (!rt.sessions.some(s => s.id === sessionId)) return false;
  rt.activeSessionId = sessionId;
  persist();
  return true;
}

export function getActiveRoutineSession(routineId) {
  const rt = findRoutine(routineId);
  if (!rt || !rt.sessions.length) return null;
  let activeId = rt.activeSessionId;
  const active = activeId ? rt.sessions.find(s => s.id === activeId) : null;
  if (!active || active.completed) {
    activeId = firstIncompleteSessionId(rt.sessions);
  }
  if (!activeId) return null;
  const idx = rt.sessions.findIndex(s => s.id === activeId);
  if (idx < 0) return null;
  return { session: copySession(rt.sessions[idx]), index: idx };
}

// --- session workbook attachments ------------------------------------------

export function attachWorkbooksToSession(routineId, sessionId, workbookIds) {
  const rt = findRoutine(routineId);
  if (!rt || !Array.isArray(workbookIds)) return [];
  const session = rt.sessions.find(s => s.id === sessionId);
  if (!session) return [];
  const added = [];
  for (const id of workbookIds) {
    if (typeof id !== 'string' || !id) continue;
    if (session.workbookIds.includes(id)) continue;
    session.workbookIds.push(id);
    added.push(id);
  }
  if (added.length) {
    touchUpdated(rt);
    persist();
  }
  return added.slice();
}

export function detachWorkbookFromSession(routineId, sessionId, workbookId) {
  const rt = findRoutine(routineId);
  if (!rt) return false;
  const session = rt.sessions.find(s => s.id === sessionId);
  if (!session) return false;
  const idx = session.workbookIds.indexOf(workbookId);
  if (idx < 0) return false;
  session.workbookIds.splice(idx, 1);
  touchUpdated(rt);
  persist();
  return true;
}

export function moveSessionWorkbook(routineId, sessionId, workbookId, delta) {
  const rt = findRoutine(routineId);
  if (!rt || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false;
  const session = rt.sessions.find(s => s.id === sessionId);
  if (!session) return false;
  const idx = session.workbookIds.indexOf(workbookId);
  if (idx < 0) return false;
  const newIdx = idx + Number(delta);
  if (newIdx < 0 || newIdx >= session.workbookIds.length) return false;
  const [id] = session.workbookIds.splice(idx, 1);
  session.workbookIds.splice(newIdx, 0, id);
  touchUpdated(rt);
  persist();
  return true;
}

export function collectAttachedWorkbookIds() {
  const ids = new Set();
  for (const rt of getStore().routines) {
    for (const session of rt.sessions) {
      for (const id of session.workbookIds) {
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
  }
  return ids;
}

export function pruneMissingWorkbooks(existingWorkbookIds) {
  const valid = new Set(
    existingWorkbookIds instanceof Set
      ? [...existingWorkbookIds].filter(id => typeof id === 'string' && id)
      : Array.isArray(existingWorkbookIds)
        ? existingWorkbookIds.filter(id => typeof id === 'string' && id)
        : [],
  );
  let totalRemoved = 0;
  for (const rt of getStore().routines) {
    let changed = false;
    for (const session of rt.sessions) {
      const before = session.workbookIds.length;
      session.workbookIds = session.workbookIds.filter(id => valid.has(id));
      const removed = before - session.workbookIds.length;
      if (removed) {
        totalRemoved += removed;
        changed = true;
      }
    }
    if (changed) {
      touchUpdated(rt);
    }
  }
  if (totalRemoved) persist();
  return totalRemoved;
}

// --- stats -----------------------------------------------------------------

export function getRoutineStats(routineOrId) {
  let rt = routineOrId;
  if (typeof routineOrId === 'string') {
    rt = findRoutine(routineOrId);
  }
  if (!rt || typeof rt !== 'object') {
    return {
      sessionCount: 0,
      completedSessionCount: 0,
      pendingSessionCount: 0,
      workbookCount: 0,
      uniqueWorkbookCount: 0,
      totalMinutes: 0,
    };
  }
  const sessions = Array.isArray(rt.sessions) ? rt.sessions : [];
  const allIds = [];
  let totalMinutes = 0;
  let completedSessionCount = 0;
  for (const session of sessions) {
    if (session.completed) completedSessionCount += 1;
    if (Array.isArray(session.workbookIds)) {
      allIds.push(...session.workbookIds);
    }
    if (session.durationMin != null && Number.isFinite(session.durationMin)) {
      totalMinutes += session.durationMin;
    }
  }
  const unique = new Set(allIds);
  return {
    sessionCount: sessions.length,
    completedSessionCount,
    pendingSessionCount: sessions.length - completedSessionCount,
    workbookCount: allIds.length,
    uniqueWorkbookCount: unique.size,
    totalMinutes,
  };
}

// --- export / import -------------------------------------------------------

function normalizeExportWorkbook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  if (!id) return null;
  const name = clampText(
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Workbook',
    NAME_LIMIT,
  );
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map(e => {
          if (!e || typeof e !== 'object') return null;
          const exerciseId = typeof e.exerciseId === 'string' && e.exerciseId ? e.exerciseId : '';
          return exerciseId ? { exerciseId } : null;
        })
        .filter(Boolean)
    : [];
  const notes = clampText(typeof raw.notes === 'string' ? raw.notes : '', NOTES_LIMIT);
  return { id, name, notes, entries, companions: normalizeCompanions(raw.companions) };
}

export function buildRoutineExport({ routineIds, resolveWorkbook } = {}) {
  const store = getStore();
  let routines;
  if (routineIds == null) {
    routines = store.routines.map(copyRoutine);
  } else if (Array.isArray(routineIds)) {
    const idSet = new Set(routineIds.filter(id => typeof id === 'string' && id));
    routines = store.routines
      .filter(rt => idSet.has(rt.id))
      .map(copyRoutine);
  } else {
    routines = [];
  }

  const workbookIdOrder = [];
  const seenWb = new Set();
  for (const rt of routines) {
    for (const session of rt.sessions) {
      for (const wbId of session.workbookIds) {
        if (!seenWb.has(wbId)) {
          seenWb.add(wbId);
          workbookIdOrder.push(wbId);
        }
      }
    }
  }

  const workbooks = [];
  if (typeof resolveWorkbook === 'function') {
    for (const wbId of workbookIdOrder) {
      const resolved = resolveWorkbook(wbId);
      const normalized = normalizeExportWorkbook(resolved);
      if (normalized) workbooks.push(normalized);
    }
  }

  return {
    app: 'musi',
    kind: ROUTINE_EXPORT_KIND,
    version: ROUTINE_EXPORT_VERSION,
    createdAt: nowISO(),
    routines,
    workbooks,
  };
}

export function validateRoutineExport(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'This file is not a Musi routine export.' };
  }

  let routinesRaw;
  let workbooksRaw = [];

  if (Array.isArray(data)) {
    routinesRaw = data;
  } else if (data.kind === ROUTINE_EXPORT_KIND || data.app === 'musi' || data.version != null) {
    if (data.app != null && data.app !== 'musi') {
      return { ok: false, error: 'This file is not a Musi routine export.' };
    }
    if (data.kind != null && data.kind !== ROUTINE_EXPORT_KIND) {
      return { ok: false, error: 'This file is not a Musi routine export.' };
    }
    if (data.version != null && Number(data.version) > ROUTINE_EXPORT_VERSION) {
      return { ok: false, error: 'This export was made by a newer version of Musi.' };
    }
    routinesRaw = data.routines;
    workbooksRaw = data.workbooks;
  } else if (
    typeof data.name === 'string' ||
    Array.isArray(data.sessions)
  ) {
    routinesRaw = [data];
  } else {
    return { ok: false, error: 'This file is not a Musi routine export.' };
  }

  const routines = Array.isArray(routinesRaw)
    ? routinesRaw.map(normalizeRoutine).filter(Boolean)
    : [];
  if (!routines.length) {
    return { ok: false, error: 'No routines found in this file.' };
  }

  const workbooks = Array.isArray(workbooksRaw)
    ? workbooksRaw.map(normalizeExportWorkbook).filter(Boolean)
    : [];

  return { ok: true, routines, workbooks };
}

export function applyRoutineImport(raw, { existingWorkbooks = [], createWorkbook = null, existingExerciseIds = null } = {}) {
  const validated = validateRoutineExport(raw);
  if (!validated.ok) return validated;

  const { routines: importRoutines, workbooks: importWorkbooks } = validated;

  const localById = new Map();
  const localByName = new Map();
  for (const wb of existingWorkbooks) {
    const norm = normalizeExportWorkbook(wb);
    if (!norm) continue;
    localById.set(norm.id, norm);
    const key = norm.name.toLowerCase();
    if (!localByName.has(key)) localByName.set(key, norm);
  }

  const idMap = new Map();
  let workbooksCreated = 0;
  let workbooksLinked = 0;
  let missingWorkbooks = 0;

  for (const wb of importWorkbooks) {
    if (localById.has(wb.id)) {
      idMap.set(wb.id, wb.id);
      workbooksLinked++;
    } else if (localByName.has(wb.name.toLowerCase())) {
      idMap.set(wb.id, localByName.get(wb.name.toLowerCase()).id);
      workbooksLinked++;
    } else if (typeof createWorkbook === 'function') {
      const exerciseIds = wb.entries.map(e => e.exerciseId);
      const newId = createWorkbook({
        name: wb.name,
        notes: wb.notes,
        exerciseIds,
        companions: wb.companions,
      });
      if (newId && typeof newId === 'string') {
        idMap.set(wb.id, newId);
        workbooksCreated++;
        const created = { id: newId, name: wb.name, entries: wb.entries };
        localById.set(newId, created);
        localByName.set(wb.name.toLowerCase(), created);
      }
    }
  }

  const bundledIds = new Set(importWorkbooks.map(wb => wb.id));

  let missingExercises = 0;
  if (existingExerciseIds != null) {
    const validExercises = new Set(
      existingExerciseIds instanceof Set
        ? [...existingExerciseIds].filter(id => typeof id === 'string' && id)
        : Array.isArray(existingExerciseIds)
          ? existingExerciseIds.filter(id => typeof id === 'string' && id)
          : [],
    );
    const referenced = new Set();
    for (const wb of importWorkbooks) {
      for (const entry of wb.entries) {
        if (entry.exerciseId) referenced.add(entry.exerciseId);
      }
    }
    for (const exId of referenced) {
      if (!validExercises.has(exId)) missingExercises++;
    }
  }

  const store = getStore();
  const imported = [];
  const t = nowISO();

  for (const src of importRoutines) {
    const sessions = src.sessions.map(session => {
      const remappedIds = [];
      for (const wbId of session.workbookIds) {
        if (bundledIds.has(wbId)) {
          if (idMap.has(wbId)) {
            remappedIds.push(idMap.get(wbId));
          } else {
            missingWorkbooks++;
          }
        } else if (localById.has(wbId)) {
          remappedIds.push(wbId);
        } else {
          missingWorkbooks++;
        }
      }
      return normalizeRoutineSession({
        id: uid('rs'),
        name: session.name,
        notes: session.notes,
        workbookIds: remappedIds,
        durationMin: session.durationMin,
        metronome: session.metronome,
        completed: session.completed,
      });
    });

    const rt = normalizeRoutine({
      id: uid('rt'),
      name: src.name,
      description: src.description,
      sessions,
      activeSessionId: null,
      createdAt: t,
      updatedAt: t,
    });
    store.routines.push(rt);
    imported.push(copyRoutine(rt));
  }

  persist();
  return {
    ok: true,
    imported,
    workbooksCreated,
    workbooksLinked,
    missingExercises,
    missingWorkbooks,
  };
}

export function serializeRoutineExport(envelope) {
  return JSON.stringify(envelope, null, 2);
}

export function routineExportFilename(envelope) {
  const date = new Date().toISOString().slice(0, 10);
  const routines = envelope && Array.isArray(envelope.routines) ? envelope.routines : [];
  if (routines.length === 1) {
    let slug = (routines[0].name || 'routine').toLowerCase();
    slug = slug.replace(/[^a-z0-9]+/g, '-');
    slug = slug.replace(/^-+|-+$/g, '');
    if (slug.length > 40) slug = slug.slice(0, 40).replace(/-+$/g, '');
    if (!slug) slug = 'routine';
    return `musi-routine-${slug}-${date}.json`;
  }
  return `musi-routines-${date}.json`;
}
