// Song Learning library storage.
// Metadata in localStorage (musi.songLearn); original GP blobs in IndexedDB
// via attachments.js (source: 'song-learn'). Section snippets (guitar models +
// drum patterns) are embedded in the metadata so practice works offline even
// if the source file is later removed.

import {
  saveFile,
  getFileBlob,
  deleteFile,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';

const STORAGE_KEY = 'musi.songLearn';
const NAME_LIMIT = 120;

function canUseStorage() {
  try { return typeof window !== 'undefined' && !!window.localStorage; }
  catch (e) { return false; }
}

function readKey() {
  if (!canUseStorage()) return null;
  try { return window.localStorage.getItem(STORAGE_KEY); }
  catch (e) { return null; }
}

function writeKey(value) {
  if (!canUseStorage()) return false;
  try { window.localStorage.setItem(STORAGE_KEY, value); return true; }
  catch (e) { return false; }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() { return new Date().toISOString(); }

function clamp(s, n) {
  return typeof s === 'string' ? s.slice(0, n) : '';
}

function normalizeSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('sec'),
    label: clamp(raw.label || 'Section', 80),
    type: typeof raw.type === 'string' ? raw.type : 'section',
    measureStart: Number(raw.measureStart) || 0,
    measureEnd: Number(raw.measureEnd) || 0,
    startBeat: Number(raw.startBeat) || 0,
    endBeat: Number(raw.endBeat) || 0,
    tempo: Number(raw.tempo) || 120,
    guitarTrackName: raw.guitarTrackName || null,
    drumTrackName: raw.drumTrackName || null,
    hasGuitar: !!raw.hasGuitar,
    hasDrums: !!raw.hasDrums,
    guitar: raw.guitar && typeof raw.guitar === 'object' ? raw.guitar : null,
    drums: raw.drums && typeof raw.drums === 'object' ? raw.drums : null,
    drumPatternId: typeof raw.drumPatternId === 'string' ? raw.drumPatternId : null,
  };
}

function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map(normalizeSection).filter(Boolean)
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('song'),
    title: clamp(raw.title || 'Untitled song', NAME_LIMIT),
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    attachmentId: typeof raw.attachmentId === 'string' ? raw.attachmentId : '',
    tempo: Number(raw.tempo) || 120,
    guitarTrackName: raw.guitarTrackName || null,
    drumTrackName: raw.drumTrackName || null,
    // Full tracks for synced full-song playback + follow visual.
    fullGuitar: raw.fullGuitar && typeof raw.fullGuitar === 'object' ? raw.fullGuitar : null,
    // Extra fretted tracks mixed in for "full song" playback (rhythm/lead/bass…).
    fullGuitars: Array.isArray(raw.fullGuitars)
      ? raw.fullGuitars.filter((m) => m && typeof m === 'object')
      : (raw.fullGuitar && typeof raw.fullGuitar === 'object' ? [raw.fullGuitar] : []),
    fullDrums: raw.fullDrums && typeof raw.fullDrums === 'object' ? raw.fullDrums : null,
    sections,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowISO(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO(),
  };
}

let cache = null;

function getStore() {
  if (cache) return cache;
  const raw = readKey();
  if (raw == null) {
    cache = { songs: [] };
    persist();
    return cache;
  }
  try {
    const parsed = JSON.parse(raw);
    cache = {
      songs: Array.isArray(parsed?.songs)
        ? parsed.songs.map(normalizeSong).filter(Boolean)
        : [],
    };
  } catch (e) {
    cache = { songs: [] };
  }
  return cache;
}

function persist() {
  if (!cache) return;
  writeKey(JSON.stringify(cache));
}

export function listSongs() {
  return getStore().songs.slice().sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
}

export function getSong(id) {
  return getStore().songs.find((s) => s.id === id) || null;
}

export function saveSong(song) {
  const store = getStore();
  const rec = normalizeSong({ ...song, updatedAt: nowISO() });
  if (!rec) return null;
  const idx = store.songs.findIndex((s) => s.id === rec.id);
  if (idx >= 0) store.songs[idx] = rec;
  else store.songs.unshift(rec);
  persist();
  return rec;
}

export async function deleteSong(id) {
  const store = getStore();
  const idx = store.songs.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  const [removed] = store.songs.splice(idx, 1);
  persist();
  if (removed?.attachmentId) {
    try { await deleteFile(removed.attachmentId); } catch (e) { /* ignore */ }
  }
  return true;
}

export function renameSong(id, title) {
  const song = getSong(id);
  if (!song) return null;
  song.title = clamp(title || song.title, NAME_LIMIT) || song.title;
  song.updatedAt = nowISO();
  persist();
  return song;
}

export function removeSection(songId, sectionId) {
  const song = getSong(songId);
  if (!song) return null;
  song.sections = song.sections.filter((s) => s.id !== sectionId);
  song.updatedAt = nowISO();
  persist();
  return song;
}

/**
 * Persist a GP blob and create a Song Learning entry from the full score.
 * Sections are not auto-detected — the user picks measure ranges in the
 * Guitar Pro Player and saves those as Exercises.
 * @param {{ file: Blob|File, fileName: string, title?: string, tempo?: number,
 *   guitarTrackName?: string, drumTrackName?: string,
 *   fullGuitar?: object|null, fullGuitars?: object[], fullDrums?: object|null }} opts
 */
export async function createSongFromGp(opts) {
  const {
    file, fileName, title, tempo = 120,
    guitarTrackName = null, drumTrackName = null,
    fullGuitar = null,
    fullGuitars = null,
    fullDrums = null,
  } = opts || {};

  if (!fullGuitar && !(fullGuitars || []).length && !fullDrums) {
    throw new Error('No guitar or drum parts to save.');
  }

  let attachmentId = '';
  if (file && attachmentsSupported()) {
    await ensurePersistentStorage();
    const base = (title || fileName || 'song').replace(/\.(gp|gp5)$/i, '');
    const meta = await saveFile({
      blob: file,
      name: base,
      type: 'application/x-guitar-pro',
      fileName: fileName || 'score.gp',
      size: file.size || 0,
      source: 'song-learn',
    });
    if (meta) attachmentId = meta.id;
  }

  return saveSong({
    id: uid('song'),
    title: clamp(title || (fileName || 'Song').replace(/\.(gp|gp5)$/i, ''), NAME_LIMIT),
    fileName: fileName || '',
    attachmentId,
    tempo,
    guitarTrackName,
    drumTrackName,
    fullGuitar,
    fullGuitars: Array.isArray(fullGuitars) && fullGuitars.length
      ? fullGuitars
      : (fullGuitar ? [fullGuitar] : []),
    fullDrums,
    sections: [],
    createdAt: nowISO(),
  });
}

/**
 * Persist a GP blob and create a Song Learning entry from section snippets.
 * Prefer createSongFromGp + measure selection in the player for new imports.
 * @param {{ file: Blob|File, fileName: string, title?: string, tempo?: number,
 *   guitarTrackName?: string, drumTrackName?: string, snippets: object[],
 *   fullGuitar?: object|null, fullGuitars?: object[], fullDrums?: object|null,
 *   saveDrumsToLibrary?: boolean }} opts
 */
export async function createSongFromGpSnippets(opts) {
  const {
    file, fileName, title, tempo = 120,
    guitarTrackName = null, drumTrackName = null,
    snippets = [],
    fullGuitar = null,
    fullGuitars = null,
    fullDrums = null,
    saveDrumsToLibrary = false,
  } = opts || {};

  if (!snippets.length) throw new Error('No sections selected to save.');

  let attachmentId = '';
  if (file && attachmentsSupported()) {
    await ensurePersistentStorage();
    const base = (title || fileName || 'song').replace(/\.(gp|gp5)$/i, '');
    const meta = await saveFile({
      blob: file,
      name: base,
      type: 'application/x-guitar-pro',
      fileName: fileName || 'score.gp',
      size: file.size || 0,
      source: 'song-learn',
    });
    if (meta) attachmentId = meta.id;
  }

  let savePattern = null;
  if (saveDrumsToLibrary) {
    try {
      ({ savePattern } = await import('./drums/drumPatternDb.js'));
    } catch (e) { /* drums DB optional */ }
  }

  const sections = [];
  for (const snip of snippets) {
    let drumPatternId = null;
    let drums = snip.drums || null;
    if (drums && saveDrumsToLibrary && savePattern) {
      const songTitle = title || fileName || 'Song';
      const saved = await savePattern({
        ...drums,
        id: null,
        title: `${songTitle} · ${snip.label}`,
        tags: [...(drums.tags || []), 'song-learn'],
      });
      if (saved) {
        drumPatternId = saved.id;
        drums = { ...drums, id: saved.id };
      }
    }
    sections.push(normalizeSection({
      id: snip.id || uid('sec'),
      label: snip.label,
      type: snip.type,
      measureStart: snip.measureStart,
      measureEnd: snip.measureEnd,
      startBeat: snip.startBeat,
      endBeat: snip.endBeat,
      tempo: snip.tempo || tempo,
      guitarTrackName: snip.guitarTrackName || guitarTrackName,
      drumTrackName: snip.drumTrackName || drumTrackName,
      hasGuitar: !!snip.hasGuitar,
      hasDrums: !!snip.hasDrums,
      guitar: snip.guitar,
      drums,
      drumPatternId,
    }));
  }

  const song = saveSong({
    id: uid('song'),
    title: clamp(title || (fileName || 'Song').replace(/\.(gp|gp5)$/i, ''), NAME_LIMIT),
    fileName: fileName || '',
    attachmentId,
    tempo,
    guitarTrackName,
    drumTrackName,
    fullGuitar,
    fullGuitars: Array.isArray(fullGuitars) && fullGuitars.length
      ? fullGuitars
      : (fullGuitar ? [fullGuitar] : []),
    fullDrums,
    sections,
    createdAt: nowISO(),
  });
  return song;
}

export async function getSongSourceBlob(song) {
  if (!song?.attachmentId) return null;
  return getFileBlob(song.attachmentId);
}

export { attachmentsSupported };
