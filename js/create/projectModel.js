// MusicProject storage for Musi Create. Native projects live in musi.projects;
// songs in musi.songs are adapted into projects at read time without moving or
// rewriting song records.
//
// Split-write model for song-backed projects (id proj-song-<songId>):
//   - title, lyrics, recordingIds → musi.songs (songwriter.js remains authoritative)
//   - kind, notes, scoreIds, progressionIds, drumPatternIds, linkedExerciseIds
//     → musi.projects.songExtensions[songId] (Create-only overlay)
//
// Native projects (id proj-*) store the full MusicProject in musi.projects.projects.
// Notes inbox links live in musi.projects.notesInbox; note bodies stay in musi.notes.
//
// Storage: localStorage key musi.projects. Defensive in-memory fallback when
// localStorage is unavailable (Node tests).

import { invalidateSongsCache } from '../songwriter.js';

export const PROJECTS_STORAGE_KEY = 'musi.projects';
export const SONG_PROJECT_PREFIX = 'proj-song-';

const STORE_VERSION = 1;
const TITLE_LIMIT = 120;
const LYRICS_LIMIT = 20000;
const NOTES_LIMIT = 50000;
const NAME_LIMIT = 80;

const PROJECT_KINDS = new Set(['song', 'riff', 'vocal-idea', 'exercise-idea']);
const ATTACH_TYPES = new Set([
  'recording',
  'score',
  'progression',
  'drum-pattern',
  'exercise',
  'note',
]);

const SONGS_KEY = 'musi.songs';

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

function uid(prefix = 'proj') {
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

function defaultStore() {
  return {
    version: STORE_VERSION,
    projects: [],
    songExtensions: {},
    progressions: {},
    notesInbox: { links: [] },
  };
}

let storeCache = null;

function normalizeRecording(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  if (!id) return null;
  return {
    id,
    name: clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Recording', NAME_LIMIT),
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : nowISO(),
  };
}

function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  let recordings = Array.isArray(raw.recordings)
    ? raw.recordings.map(normalizeRecording).filter(Boolean)
    : [];
  if (!recordings.length && typeof raw.audioId === 'string' && raw.audioId) {
    recordings = [{
      id: raw.audioId,
      name: clampText(typeof raw.audioName === 'string' && raw.audioName.trim() ? raw.audioName.trim() : 'Recording', NAME_LIMIT),
      addedAt: created,
    }];
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : '',
    title: clampText(typeof raw.title === 'string' ? raw.title : '', TITLE_LIMIT),
    lyrics: clampText(typeof raw.lyrics === 'string' ? raw.lyrics : '', LYRICS_LIMIT),
    recordings,
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
    audioId: typeof raw.audioId === 'string' ? raw.audioId : undefined,
    audioName: typeof raw.audioName === 'string' ? raw.audioName : undefined,
  };
}

function readSongsRaw() {
  const raw = readKey(SONGS_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function readSongs() {
  return readSongsRaw().map(normalizeSong).filter((s) => s.id);
}

function writeSongsRaw(songs) {
  writeKey(SONGS_KEY, JSON.stringify(songs));
  invalidateSongsCache();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function normalizeKind(value, fallback = 'song') {
  const kind = typeof value === 'string' ? value : fallback;
  return PROJECT_KINDS.has(kind) ? kind : fallback;
}

function normalizeExtension(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      kind: 'song',
      notes: '',
      scoreIds: [],
      progressionIds: [],
      drumPatternIds: [],
      linkedExerciseIds: [],
    };
  }
  return {
    kind: normalizeKind(raw.kind, 'song'),
    notes: clampText(typeof raw.notes === 'string' ? raw.notes : '', NOTES_LIMIT),
    scoreIds: normalizeStringArray(raw.scoreIds),
    progressionIds: normalizeStringArray(raw.progressionIds),
    drumPatternIds: normalizeStringArray(raw.drumPatternIds),
    linkedExerciseIds: normalizeStringArray(raw.linkedExerciseIds),
  };
}

function normalizeNativeProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid();
  if (id.startsWith(SONG_PROJECT_PREFIX)) return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id,
    title: clampText(typeof raw.title === 'string' ? raw.title : '', TITLE_LIMIT),
    kind: normalizeKind(raw.kind, 'riff'),
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
    lyrics: clampText(typeof raw.lyrics === 'string' ? raw.lyrics : '', LYRICS_LIMIT),
    notes: clampText(typeof raw.notes === 'string' ? raw.notes : '', NOTES_LIMIT),
    recordingIds: normalizeStringArray(raw.recordingIds),
    scoreIds: normalizeStringArray(raw.scoreIds),
    progressionIds: normalizeStringArray(raw.progressionIds),
    drumPatternIds: normalizeStringArray(raw.drumPatternIds),
    linkedExerciseIds: normalizeStringArray(raw.linkedExerciseIds),
  };
}

function normalizeNoteLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const noteId = typeof raw.noteId === 'string' && raw.noteId ? raw.noteId : '';
  if (!noteId) return null;
  let attachedTo = null;
  if (raw.attachedTo && typeof raw.attachedTo === 'object') {
    const type = typeof raw.attachedTo.type === 'string' ? raw.attachedTo.type : '';
    const id = typeof raw.attachedTo.id === 'string' ? raw.attachedTo.id : '';
    if (type && id) attachedTo = { type, id };
  }
  return { noteId, attachedTo };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultStore();
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normalizeNativeProject).filter(Boolean)
    : [];
  const songExtensions = {};
  if (raw.songExtensions && typeof raw.songExtensions === 'object' && !Array.isArray(raw.songExtensions)) {
    for (const [songId, ext] of Object.entries(raw.songExtensions)) {
      if (typeof songId === 'string' && songId) songExtensions[songId] = normalizeExtension(ext);
    }
  }
  const progressions = {};
  if (raw.progressions && typeof raw.progressions === 'object' && !Array.isArray(raw.progressions)) {
    for (const [pid, prog] of Object.entries(raw.progressions)) {
      if (!prog || typeof prog !== 'object') continue;
      const id = typeof prog.id === 'string' && prog.id ? prog.id : pid;
      progressions[id] = {
        id,
        name: clampText(typeof prog.name === 'string' ? prog.name : 'Progression', TITLE_LIMIT),
        chords: typeof prog.chords === 'string' ? prog.chords : '',
        createdAt: typeof prog.createdAt === 'string' ? prog.createdAt : nowISO(),
      };
    }
  }
  const links = raw.notesInbox?.links && Array.isArray(raw.notesInbox.links)
    ? raw.notesInbox.links.map(normalizeNoteLink).filter(Boolean)
    : [];
  return {
    version: STORE_VERSION,
    projects,
    songExtensions,
    progressions,
    notesInbox: { links },
  };
}

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(PROJECTS_STORAGE_KEY);
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
  writeKey(PROJECTS_STORAGE_KEY, JSON.stringify(storeCache));
}

export function invalidateProjectsCache() {
  storeCache = null;
}

export function songProjectId(songId) {
  return `${SONG_PROJECT_PREFIX}${songId}`;
}

export function isSongBackedProjectId(projectId) {
  return typeof projectId === 'string' && projectId.startsWith(SONG_PROJECT_PREFIX);
}

export function songIdFromProjectId(projectId) {
  if (!isSongBackedProjectId(projectId)) return null;
  return projectId.slice(SONG_PROJECT_PREFIX.length) || null;
}

/**
 * Map a musi.songs record to a merged MusicProject (read-only adapter).
 * @param {object} song
 * @param {object} [extension]
 */
export function projectFromSong(song, extension) {
  if (!song || !song.id) return null;
  const ext = normalizeExtension(extension);
  const recordingIds = Array.isArray(song.recordings)
    ? song.recordings.map((r) => r.id).filter(Boolean)
    : [];
  return {
    id: songProjectId(song.id),
    title: song.title || '',
    kind: ext.kind || 'song',
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
    lyrics: song.lyrics || '',
    notes: ext.notes || '',
    recordingIds,
    scoreIds: ext.scoreIds,
    progressionIds: ext.progressionIds,
    drumPatternIds: ext.drumPatternIds,
    linkedExerciseIds: ext.linkedExerciseIds,
    sourceSongId: song.id,
  };
}

function mergeProjectsList() {
  const store = getStore();
  const byId = new Map();

  for (const project of store.projects) {
    byId.set(project.id, { ...project });
  }

  for (const song of readSongs()) {
    const ext = store.songExtensions[song.id] || null;
    const adapted = projectFromSong(song, ext);
    if (adapted) byId.set(adapted.id, adapted);
  }

  return [...byId.values()].sort(
    (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title),
  );
}

export function listProjects() {
  return mergeProjectsList();
}

export function getProject(id) {
  if (!id) return null;
  const store = getStore();
  const native = store.projects.find((p) => p.id === id);
  if (native) return { ...native };

  const songId = songIdFromProjectId(id);
  if (songId) {
    const song = readSongs().find((s) => s.id === songId);
    if (!song) return null;
    return projectFromSong(song, store.songExtensions[songId]);
  }
  return null;
}

export function createProject({ title = '', kind = 'riff', lyrics = '' } = {}) {
  const store = getStore();
  const t = nowISO();
  const project = normalizeNativeProject({
    id: uid(),
    title,
    kind,
    lyrics,
    createdAt: t,
    updatedAt: t,
    notes: '',
    recordingIds: [],
    scoreIds: [],
    progressionIds: [],
    drumPatternIds: [],
    linkedExerciseIds: [],
  });
  store.projects.unshift(project);
  persistStore();
  return { ...project };
}

function updateSongFields(songId, patch) {
  const rawSongs = readSongsRaw();
  const idx = rawSongs.findIndex((s) => s && s.id === songId);
  if (idx < 0) return false;
  const current = normalizeSong(rawSongs[idx]);
  const updated = { ...rawSongs[idx] };
  if (patch.title !== undefined) updated.title = clampText(patch.title, TITLE_LIMIT);
  if (patch.lyrics !== undefined) updated.lyrics = clampText(patch.lyrics, LYRICS_LIMIT);
  if (patch.recordings !== undefined) {
    updated.recordings = patch.recordings;
    delete updated.audioId;
    delete updated.audioName;
  }
  updated.updatedAt = nowISO();
  if (patch.createdAt === undefined && !updated.createdAt) updated.createdAt = current.createdAt;
  rawSongs[idx] = updated;
  writeSongsRaw(rawSongs);
  return true;
}

function updateSongExtension(songId, patch) {
  const store = getStore();
  const current = normalizeExtension(store.songExtensions[songId]);
  const next = {
    ...current,
    ...patch,
    kind: patch.kind !== undefined ? normalizeKind(patch.kind, current.kind) : current.kind,
    notes: patch.notes !== undefined ? clampText(patch.notes, NOTES_LIMIT) : current.notes,
    scoreIds: patch.scoreIds !== undefined ? normalizeStringArray(patch.scoreIds) : current.scoreIds,
    progressionIds: patch.progressionIds !== undefined
      ? normalizeStringArray(patch.progressionIds) : current.progressionIds,
    drumPatternIds: patch.drumPatternIds !== undefined
      ? normalizeStringArray(patch.drumPatternIds) : current.drumPatternIds,
    linkedExerciseIds: patch.linkedExerciseIds !== undefined
      ? normalizeStringArray(patch.linkedExerciseIds) : current.linkedExerciseIds,
  };
  store.songExtensions[songId] = next;
  persistStore();
  return next;
}

export function updateProject(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const store = getStore();
  const songId = songIdFromProjectId(id);

  if (songId) {
    const song = readSongs().find((s) => s.id === songId);
    if (!song) return null;

    const songPatch = {};
    if (patch.title !== undefined) songPatch.title = patch.title;
    if (patch.lyrics !== undefined) songPatch.lyrics = patch.lyrics;
    if (patch.recordingIds !== undefined) {
      const existing = new Map(song.recordings.map((r) => [r.id, r]));
      songPatch.recordings = patch.recordingIds.map((rid) => {
        const hit = existing.get(rid);
        return hit || { id: rid, name: 'Recording', addedAt: nowISO() };
      });
    }
    if (Object.keys(songPatch).length) updateSongFields(songId, songPatch);

    const extPatch = {};
    if (patch.kind !== undefined) extPatch.kind = patch.kind;
    if (patch.notes !== undefined) extPatch.notes = patch.notes;
    if (patch.scoreIds !== undefined) extPatch.scoreIds = patch.scoreIds;
    if (patch.progressionIds !== undefined) extPatch.progressionIds = patch.progressionIds;
    if (patch.drumPatternIds !== undefined) extPatch.drumPatternIds = patch.drumPatternIds;
    if (patch.linkedExerciseIds !== undefined) extPatch.linkedExerciseIds = patch.linkedExerciseIds;
    if (Object.keys(extPatch).length) updateSongExtension(songId, extPatch);

    return getProject(id);
  }

  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const current = store.projects[idx];
  const next = normalizeNativeProject({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowISO(),
  });
  store.projects[idx] = next;
  persistStore();
  return { ...next };
}

export function deleteProject(id) {
  if (!id) return false;
  const store = getStore();
  const songId = songIdFromProjectId(id);
  if (songId) {
    if (store.songExtensions[songId]) {
      delete store.songExtensions[songId];
      persistStore();
    }
    return true;
  }
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  store.projects.splice(idx, 1);
  persistStore();
  return true;
}

export function attachToProject(projectId, { type, id }) {
  if (!projectId || !type || !id) return null;
  if (!ATTACH_TYPES.has(type)) return null;
  const project = getProject(projectId);
  if (!project) return null;

  const fieldMap = {
    recording: 'recordingIds',
    score: 'scoreIds',
    progression: 'progressionIds',
    'drum-pattern': 'drumPatternIds',
    exercise: 'linkedExerciseIds',
  };
  const field = fieldMap[type];
  if (!field) return null;
  const ids = [...project[field]];
  if (!ids.includes(id)) ids.push(id);
  return updateProject(projectId, { [field]: ids });
}

export function detachFromProject(projectId, { type, id }) {
  if (!projectId || !type || !id) return null;
  const project = getProject(projectId);
  if (!project) return null;
  const fieldMap = {
    recording: 'recordingIds',
    score: 'scoreIds',
    progression: 'progressionIds',
    'drum-pattern': 'drumPatternIds',
    exercise: 'linkedExerciseIds',
  };
  const field = fieldMap[type];
  if (!field) return null;
  return updateProject(projectId, { [field]: project[field].filter((x) => x !== id) });
}

export function createProgression({ name = 'Progression', chords = '' } = {}) {
  const store = getStore();
  const id = uid('prog');
  const record = {
    id,
    name: clampText(name, TITLE_LIMIT),
    chords: typeof chords === 'string' ? chords : '',
    createdAt: nowISO(),
  };
  store.progressions[id] = record;
  persistStore();
  return { ...record };
}

export function getProgression(id) {
  const store = getStore();
  const hit = store.progressions[id];
  return hit ? { ...hit } : null;
}

export function listProgressions(ids) {
  const store = getStore();
  if (!Array.isArray(ids)) return Object.values(store.progressions).map((p) => ({ ...p }));
  return ids.map((id) => store.progressions[id]).filter(Boolean).map((p) => ({ ...p }));
}

export function listNotesInboxLinks() {
  return getStore().notesInbox.links.map((l) => ({ ...l, attachedTo: l.attachedTo ? { ...l.attachedTo } : null }));
}

export function attachNoteToTarget(noteId, attachedTo) {
  if (!noteId) return null;
  const store = getStore();
  const links = store.notesInbox.links.filter((l) => l.noteId !== noteId);
  const entry = {
    noteId,
    attachedTo: attachedTo && attachedTo.type && attachedTo.id
      ? { type: String(attachedTo.type), id: String(attachedTo.id) }
      : null,
  };
  links.push(entry);
  store.notesInbox.links = links;
  persistStore();
  return { ...entry };
}

export function getNoteAttachment(noteId) {
  const hit = getStore().notesInbox.links.find((l) => l.noteId === noteId);
  return hit ? { ...hit, attachedTo: hit.attachedTo ? { ...hit.attachedTo } : null } : null;
}

/**
 * LibraryItem-shaped rows for a future libraryService extension point.
 */
export function listProjectLibraryItems() {
  return listProjects().map((project) => ({
    ref: { type: 'project', id: project.id },
    title: project.title || 'Untitled project',
    subtitle: project.kind.replace('-', ' '),
    type: 'project',
    updatedAt: project.updatedAt || project.createdAt || '',
    meta: {
      kind: project.kind,
      recordingCount: project.recordingIds.length,
      sourceSongId: project.sourceSongId || null,
    },
    folderId: '',
  }));
}
