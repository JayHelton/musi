// Session data layer for Musi. Handles localStorage persistence, the tool
// registry that maps drills to existing Musi views, default presets, CRUD on
// saved sessions, the active-session snapshot, and lightweight history.
//
// All storage access is defensive: localStorage may be unavailable (privacy
// mode, quota) or hold corrupted JSON. In every failure path we fall back to
// in-memory state so the rest of the app keeps working.

export const STORAGE_KEYS = {
  sessions: 'musi.sessions',
  active: 'musi.activeSession',
  history: 'musi.sessionHistory',
};

const HISTORY_LIMIT = 40;

// Maps a session drill's toolId to the existing Musi section that should render
// while that drill runs. Keys are stable, descriptive ids stored in saved
// sessions; sectionId is the DOM section the runner navigates to.
export const TOOL_REGISTRY = {
  'scale-spelling':   { name: 'Scale Spelling',          sectionId: 'scales' },
  'intervals':        { name: 'Intervals',               sectionId: 'intervals' },
  'sight-reading':    { name: 'Sight Reading',           sectionId: 'sightreading' },
  'fretboard':        { name: 'Fretboard',               sectionId: 'fretboard' },
  'ear-training':     { name: 'Ear Training',            sectionId: 'ear' },
  'pitch-detection':  { name: 'Pitch Detection',         sectionId: 'tuner' },
  'recorder':         { name: 'Recorder / Pitch Analysis', sectionId: 'recorder' },
  'chord-builder':    { name: 'Chord Builder',           sectionId: 'chords' },
  'circle-of-fifths': { name: 'Circle of Fifths',        sectionId: 'circle' },
  'metronome':        { name: 'Metronome',               sectionId: 'metronome' },
  'scale-reference':  { name: 'Scale Reference',         sectionId: 'scaleref' },
  'exercises':        { name: 'Exercises (PDF)',         sectionId: 'exercises' },
};

// Tools that work as timed drills versus reference-style tools. Reference tools
// are still allowed in sessions (per spec) but flagged so the editor can hint.
export const REFERENCE_TOOL_IDS = ['scale-reference', 'circle-of-fifths', 'chord-builder'];

export function toolName(toolId) {
  return (TOOL_REGISTRY[toolId] && TOOL_REGISTRY[toolId].name) || toolId;
}

export function toolSectionId(toolId) {
  return TOOL_REGISTRY[toolId] && TOOL_REGISTRY[toolId].sectionId;
}

export function toolExists(toolId) {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolId);
}

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
    // Quota or privacy failure — caller keeps the in-memory copy.
    return false;
  }
}

function removeKey(key) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

// In-memory mirrors so the feature still works when storage is blocked.
let sessionsCache = null;
let historyCache = null;

function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'session';
}

function nowISO() {
  return new Date().toISOString();
}

function clampDuration(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

const NOTES_LIMIT = 4000;

// Free-form session notes (reminders, curriculum/regimen requirements). Trailing
// whitespace is trimmed but internal line breaks are preserved; length capped so
// a runaway paste can't blow the localStorage quota.
function clampNotes(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+$/, '').slice(0, NOTES_LIMIT);
}

// --- Normalisation: defends against corrupted / partial saved data. --------

function normalizeDrill(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const toolId = typeof raw.toolId === 'string' ? raw.toolId : '';
  if (!toolId) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('drill'),
    toolId,
    toolName: typeof raw.toolName === 'string' && raw.toolName ? raw.toolName : toolName(toolId),
    durationMinutes: clampDuration(raw.durationMinutes),
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : undefined,
  };
}

// Attachment metadata only. The file Blob itself lives in IndexedDB keyed by
// this `id` (see attachments.js); here we keep just enough to list and play it.
function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('att');
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Audio';
  return {
    id,
    name,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    type: typeof raw.type === 'string' ? raw.type : '',
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : nowISO(),
  };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const drills = Array.isArray(raw.drills)
    ? raw.drills.map(normalizeDrill).filter(Boolean)
    : [];
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(normalizeAttachment).filter(Boolean)
    : [];
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Session';
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('session'),
    name,
    notes: clampNotes(raw.notes),
    drills,
    attachments,
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
    lastStartedAt: typeof raw.lastStartedAt === 'string' ? raw.lastStartedAt : undefined,
  };
}

// --- Default presets seeded on first run. ----------------------------------

function defaultSessions() {
  const t = nowISO();
  const mk = (id, name, drills) => ({
    id,
    name,
    createdAt: t,
    updatedAt: t,
    drills: drills.map(([toolId, durationMinutes]) => ({
      id: uid('drill'),
      toolId,
      toolName: toolName(toolId),
      durationMinutes,
    })),
  });
  return [
    mk('session-pre-gig-warmup', 'Pre-Gig Warmup', [
      ['ear-training', 3],
      ['fretboard', 3],
      ['intervals', 2],
      ['pitch-detection', 2],
    ]),
    mk('session-harmony-maintenance', 'Harmony Maintenance', [
      ['scale-spelling', 3],
      ['chord-builder', 4],
      ['intervals', 3],
      ['circle-of-fifths', 2],
    ]),
    mk('session-anywhere-silent', 'Anywhere Silent Session', [
      ['sight-reading', 3],
      ['fretboard', 3],
      ['scale-spelling', 2],
    ]),
  ];
}

// --- Sessions CRUD ---------------------------------------------------------

export function getSessions() {
  if (sessionsCache) return sessionsCache;

  const raw = readKey(STORAGE_KEYS.sessions);
  if (raw === null) {
    // First run (or storage blocked): seed defaults and persist them.
    sessionsCache = defaultSessions();
    persistSessions();
    return sessionsCache;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    sessionsCache = parsed.map(normalizeSession).filter(Boolean);
  } catch (e) {
    // Corrupted data: reset to an empty list rather than crash the app.
    sessionsCache = [];
    persistSessions();
  }
  return sessionsCache;
}

function persistSessions() {
  if (!sessionsCache) return;
  writeKey(STORAGE_KEYS.sessions, JSON.stringify(sessionsCache));
}

export function getSession(id) {
  return getSessions().find(s => s.id === id) || null;
}

// Sanitises an editor payload into a stored session, returning { ok, errors,
// session }. Enforces: name required, >= 1 drill, every duration > 0.
export function validateSessionInput(input) {
  const errors = [];
  const name = (input && typeof input.name === 'string' ? input.name : '').trim();
  if (!name) errors.push('Session needs a name.');

  const rawDrills = Array.isArray(input && input.drills) ? input.drills : [];
  const drills = rawDrills.map(normalizeDrill).filter(Boolean);
  if (drills.length === 0) errors.push('Add at least one drill.');

  const rawAttachments = Array.isArray(input && input.attachments) ? input.attachments : [];
  const attachments = rawAttachments.map(normalizeAttachment).filter(Boolean);

  const notes = clampNotes(input && input.notes);

  return { ok: errors.length === 0, errors, name, notes, drills, attachments };
}

export function createSession(input) {
  const { ok, errors, name, notes, drills, attachments } = validateSessionInput(input);
  if (!ok) return { ok: false, errors };

  const sessions = getSessions();
  const t = nowISO();
  const session = {
    id: uid(`session-${slug(name)}`),
    name,
    notes,
    drills,
    attachments,
    createdAt: t,
    updatedAt: t,
  };
  sessions.unshift(session);
  persistSessions();
  return { ok: true, session };
}

export function updateSession(id, input) {
  const { ok, errors, name, notes, drills, attachments } = validateSessionInput(input);
  if (!ok) return { ok: false, errors };

  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return { ok: false, errors: ['Session not found.'] };

  sessions[idx] = {
    ...sessions[idx],
    name,
    notes,
    drills,
    attachments,
    updatedAt: nowISO(),
  };
  persistSessions();
  return { ok: true, session: sessions[idx] };
}

export function deleteSession(id) {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  sessions.splice(idx, 1);
  persistSessions();
  return true;
}

// Strips a (now-deleted) library attachment id from every saved session so no
// card is left pointing at audio that no longer exists.
export function removeAttachmentFromAllSessions(attId) {
  const sessions = getSessions();
  let changed = false;
  sessions.forEach(s => {
    if (Array.isArray(s.attachments) && s.attachments.some(a => a.id === attId)) {
      s.attachments = s.attachments.filter(a => a.id !== attId);
      s.updatedAt = nowISO();
      changed = true;
    }
  });
  if (changed) persistSessions();
  return changed;
}

export function markSessionStarted(id) {
  const session = getSession(id);
  if (!session) return;
  session.lastStartedAt = nowISO();
  persistSessions();
}

// --- Derived helpers -------------------------------------------------------

export function sessionTotalSeconds(session) {
  if (!session || !Array.isArray(session.drills)) return 0;
  return session.drills.reduce((sum, d) => sum + clampDuration(d.durationMinutes) * 60, 0);
}

export function sessionTotalMinutes(session) {
  return Math.round(sessionTotalSeconds(session) / 60);
}

// --- Active session snapshot ----------------------------------------------

export function getActiveSession() {
  const raw = readKey(STORAGE_KEYS.active);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sessionId !== 'string') return null;
    return parsed;
  } catch (e) {
    removeKey(STORAGE_KEYS.active);
    return null;
  }
}

export function saveActiveSession(state) {
  if (!state) return;
  writeKey(STORAGE_KEYS.active, JSON.stringify(state));
}

export function clearActiveSession() {
  removeKey(STORAGE_KEYS.active);
}

// --- History (private/local only) ------------------------------------------

export function getHistory() {
  if (historyCache) return historyCache;
  const raw = readKey(STORAGE_KEYS.history);
  if (!raw) {
    historyCache = [];
    return historyCache;
  }
  try {
    const parsed = JSON.parse(raw);
    historyCache = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    historyCache = [];
    removeKey(STORAGE_KEYS.history);
  }
  return historyCache;
}

export function addHistoryItem(item) {
  const history = getHistory();
  history.unshift({ id: uid('hist'), ...item });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  writeKey(STORAGE_KEYS.history, JSON.stringify(history));
  return history;
}

export { uid, clampDuration };
