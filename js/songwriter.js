// Songwriting notepad for Musi. A lightweight place to write song lyrics and
// attach one or more named vocal recordings to each song, with full CRUD: a
// list of songs, a New button, per-song delete, and saving (manual + autosave).
//
// Like Sessions, the split mirrors the rest of the app:
//   - song text/metadata lives in localStorage (musi.songs)
//   - recorded audio Blobs live in IndexedDB (attachments.js), referenced from
//     the song by an ordered `recordings` list of { id, name, addedAt }.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage / IndexedDB / the microphone are unavailable.

import {
  saveAudio,
  getAudioBlob,
  deleteAudio,
  renameAudio,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';
import { requestMicStream, releaseMicStream } from './audio.js';

const STORAGE_KEY = 'musi.songs';
const TITLE_LIMIT = 120;
const LYRICS_LIMIT = 20000;
const NAME_LIMIT = 80;
const AUTOSAVE_MS = 800;

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

let songsCache = null;

function uid() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `song-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

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
  // Migrate legacy single-recording shape ({ audioId, audioName }).
  if (!recordings.length && typeof raw.audioId === 'string' && raw.audioId) {
    recordings = [{
      id: raw.audioId,
      name: clampText(typeof raw.audioName === 'string' && raw.audioName.trim() ? raw.audioName.trim() : 'Recording', NAME_LIMIT),
      addedAt: created,
    }];
  }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: clampText(typeof raw.title === 'string' ? raw.title : '', TITLE_LIMIT),
    lyrics: clampText(typeof raw.lyrics === 'string' ? raw.lyrics : '', LYRICS_LIMIT),
    recordings,
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
  };
}

function getSongs() {
  if (songsCache) return songsCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    songsCache = [];
    return songsCache;
  }
  try {
    const parsed = JSON.parse(raw);
    songsCache = Array.isArray(parsed) ? parsed.map(normalizeSong).filter(Boolean) : [];
  } catch (e) {
    songsCache = [];
  }
  return songsCache;
}

function persistSongs() {
  if (!songsCache) return;
  writeKey(STORAGE_KEY, JSON.stringify(songsCache));
}

function getSong(id) {
  return getSongs().find(s => s.id === id) || null;
}

function createSong() {
  const songs = getSongs();
  const t = nowISO();
  const song = { id: uid(), title: '', lyrics: '', recordings: [], createdAt: t, updatedAt: t };
  songs.unshift(song);
  persistSongs();
  return song;
}

function deleteSong(id) {
  const songs = getSongs();
  const idx = songs.findIndex(s => s.id === id);
  if (idx < 0) return false;
  songs.splice(idx, 1);
  persistSongs();
  return true;
}

// --- date formatting --------------------------------------------------------

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

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function songTitleOf(song) {
  return (song.title && song.title.trim()) || 'Untitled Song';
}

// --- module state -----------------------------------------------------------

let wired = false;
let currentId = null;
let saveTimer = null;

// Recording state.
let mediaRecorder = null;
let recStream = null;
let recChunks = [];
let recording = false;
let recTickTimer = null;
let recStart = 0;

// Object URLs created for the recording players; revoked when re-rendering.
let recURLs = [];

// DOM refs (resolved in init).
let listEl, emptyEl, editorEmptyEl, editorBodyEl;
let titleInput, lyricsInput, savedIndicator;
let recToggleBtn, recStatusEl, recListEl;

// --- list rendering ---------------------------------------------------------

function renderList() {
  if (!listEl) return;
  const songs = getSongs();
  listEl.innerHTML = '';

  if (songs.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    listEl.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = '';

  songs.forEach(song => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'sw-list-item' + (song.id === currentId ? ' active' : '');
    item.dataset.id = song.id;

    const title = document.createElement('div');
    title.className = 'sw-list-title';
    title.textContent = songTitleOf(song);
    item.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'sw-list-sub';
    const snippet = (song.lyrics || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    sub.textContent = snippet || 'No lyrics yet';
    item.appendChild(sub);

    const metaRow = document.createElement('div');
    metaRow.className = 'sw-list-meta';
    metaRow.appendChild(spanText('sw-list-date', `Edited ${fmtRelativeDate(song.updatedAt)}`));
    const recCount = (song.recordings || []).length;
    if (recCount) {
      metaRow.appendChild(spanText('sw-list-mic', `\u25CF ${recCount}`));
    }
    item.appendChild(metaRow);

    item.onclick = () => selectSong(song.id);
    listEl.appendChild(item);
  });
}

function spanText(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

// --- editor -----------------------------------------------------------------

function showEditorBody(show) {
  if (editorBodyEl) editorBodyEl.style.display = show ? '' : 'none';
  if (editorEmptyEl) editorEmptyEl.style.display = show ? 'none' : '';
}

function selectSong(id) {
  // Commit any pending edits to the previously open song first.
  flushSave();
  stopRecordingIfActive();

  const song = getSong(id);
  if (!song) { currentId = null; showEditorBody(false); renderList(); return; }

  currentId = song.id;
  titleInput.value = song.title;
  lyricsInput.value = song.lyrics;
  setSavedIndicator('saved');
  showEditorBody(true);
  renderRecordings(song);
  renderList();
}

function newSong() {
  flushSave();
  stopRecordingIfActive();
  const song = createSong();
  currentId = song.id;
  titleInput.value = '';
  lyricsInput.value = '';
  setSavedIndicator('saved');
  showEditorBody(true);
  renderRecordings(song);
  renderList();
  setTimeout(() => titleInput.focus(), 30);
}

function setSavedIndicator(state) {
  if (!savedIndicator) return;
  if (state === 'saved') {
    savedIndicator.textContent = 'All changes saved';
    savedIndicator.className = 'sw-saved saved';
  } else if (state === 'saving') {
    savedIndicator.textContent = 'Saving\u2026';
    savedIndicator.className = 'sw-saved';
  } else {
    savedIndicator.textContent = 'Unsaved changes';
    savedIndicator.className = 'sw-saved dirty';
  }
}

function onEdit() {
  if (!currentId) return;
  setSavedIndicator('dirty');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrent(), AUTOSAVE_MS);
}

// Persist title/lyrics from the inputs into the current song.
function saveCurrent() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!currentId) return;
  const song = getSong(currentId);
  if (!song) return;
  song.title = clampText(titleInput.value, TITLE_LIMIT);
  song.lyrics = clampText(lyricsInput.value, LYRICS_LIMIT);
  song.updatedAt = nowISO();
  persistSongs();
  setSavedIndicator('saved');
  renderList();
}

// Save immediately without waiting for the debounce (used when switching songs).
function flushSave() {
  if (saveTimer) saveCurrent();
}

function confirmDeleteSong() {
  if (!currentId) return;
  const song = getSong(currentId);
  if (!song) return;
  openConfirm(
    `Delete \u201C${songTitleOf(song)}\u201D?`,
    'This removes the song and its recordings from this device.',
    'Delete',
    async () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      stopRecordingIfActive();
      const ids = (song.recordings || []).map(r => r.id);
      deleteSong(song.id);
      currentId = null;
      revokeRecURLs();
      showEditorBody(false);
      renderList();
      for (const id of ids) { try { await deleteAudio(id); } catch (e) {} }
    },
  );
}

// --- recording --------------------------------------------------------------

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function recordingSupported() {
  return typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined';
}

async function toggleRecord() {
  if (recording) {
    stopRecording();
    return;
  }
  await startRecording();
}

async function startRecording() {
  if (!currentId) return;
  if (!recordingSupported()) {
    setRecStatus('Recording is not supported in this browser.', true);
    return;
  }
  if (!attachmentsSupported()) {
    setRecStatus('Recording needs browser storage, which is unavailable here.', true);
    return;
  }
  setRecStatus('Requesting microphone\u2026');
  try {
    recStream = await requestMicStream({ audio: true });
  } catch (e) {
    setRecStatus('Microphone access was denied.', true);
    return;
  }

  const mimeType = pickMimeType();
  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(recStream, { mimeType })
      : new MediaRecorder(recStream);
  } catch (e) {
    setRecStatus('Could not start recording.', true);
    stopStream();
    return;
  }

  recChunks = [];
  mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) recChunks.push(ev.data); };
  mediaRecorder.onstop = () => finalizeRecording();

  try {
    mediaRecorder.start();
  } catch (e) {
    setRecStatus('Could not start recording.', true);
    stopStream();
    return;
  }

  recording = true;
  recStart = Date.now();
  recToggleBtn.classList.add('recording');
  recToggleBtn.innerHTML = '\u25A0 Stop';
  startRecTick();
}

function startRecTick() {
  stopRecTick();
  setRecStatus(`Recording\u2026 ${fmtClock(0)}`);
  recTickTimer = setInterval(() => {
    setRecStatus(`Recording\u2026 ${fmtClock((Date.now() - recStart) / 1000)}`);
  }, 250);
}

function stopRecTick() {
  if (recTickTimer) { clearInterval(recTickTimer); recTickTimer = null; }
}

function stopRecording() {
  if (!recording || !mediaRecorder) return;
  try {
    mediaRecorder.stop();
  } catch (e) {
    finalizeRecording();
  }
  recording = false;
  stopRecTick();
  recToggleBtn.classList.remove('recording');
  recToggleBtn.innerHTML = '\u25CF Record';
}

// Called when navigating away or switching songs: abort an in-progress take
// without saving it.
function stopRecordingIfActive() {
  if (!recording || !mediaRecorder) { stopStream(); return; }
  recording = false;
  stopRecTick();
  // Drop the handler so the captured chunks are discarded instead of saved.
  mediaRecorder.onstop = null;
  try { mediaRecorder.stop(); } catch (e) {}
  mediaRecorder = null;
  recChunks = [];
  stopStream();
  if (recToggleBtn) {
    recToggleBtn.classList.remove('recording');
    recToggleBtn.innerHTML = '\u25CF Record';
  }
}

function stopStream() {
  if (recStream) {
    releaseMicStream(recStream);
    recStream = null;
  }
}

async function finalizeRecording() {
  stopStream();
  const songId = currentId;
  const type = (mediaRecorder && mediaRecorder.mimeType) || (recChunks[0] && recChunks[0].type) || 'audio/webm';
  mediaRecorder = null;
  const blob = recChunks.length ? new Blob(recChunks, { type }) : null;
  recChunks = [];
  if (!blob || !blob.size) {
    setRecStatus('Nothing was recorded.', true);
    return;
  }
  if (!songId) return;

  const song = getSong(songId);
  if (!song) return;

  const takeName = `Take ${(song.recordings || []).length + 1}`;
  const meta = await saveAudio({ blob, name: takeName, type, source: 'songwriter' });
  if (!meta) {
    setRecStatus('Could not save the recording.', true);
    return;
  }

  if (!Array.isArray(song.recordings)) song.recordings = [];
  song.recordings.push({ id: meta.id, name: takeName, addedAt: nowISO() });
  song.updatedAt = nowISO();
  persistSongs();
  setRecStatus(`Added \u201C${takeName}\u201D`);

  // Only refresh the players if the user is still on this song.
  if (currentId === songId) renderRecordings(song);
  renderList();
}

async function deleteRecording(recId) {
  if (!currentId) return;
  const song = getSong(currentId);
  if (!song) return;
  song.recordings = (song.recordings || []).filter(r => r.id !== recId);
  song.updatedAt = nowISO();
  persistSongs();
  renderRecordings(song);
  renderList();
  try { await deleteAudio(recId); } catch (e) {}
}

function renameRecording(recId, name) {
  if (!currentId) return;
  const song = getSong(currentId);
  if (!song) return;
  const rec = (song.recordings || []).find(r => r.id === recId);
  if (!rec) return;
  const clean = clampText((name || '').trim(), NAME_LIMIT) || rec.name;
  rec.name = clean;
  song.updatedAt = nowISO();
  persistSongs();
  renameAudio(recId, clean).catch(() => {});
  return clean;
}

function revokeRecURLs() {
  recURLs.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  recURLs = [];
}

// Builds the list of attached recordings: each row has an editable name, an
// inline audio player and a delete button.
async function renderRecordings(song) {
  if (!recListEl) return;
  revokeRecURLs();
  recListEl.innerHTML = '';

  if (!recordingSupported()) {
    setRecStatus('Recording is not supported in this browser.', true);
    if (recToggleBtn) recToggleBtn.disabled = true;
  } else if (!attachmentsSupported()) {
    setRecStatus('Recording needs browser storage, which is unavailable here.', true);
    if (recToggleBtn) recToggleBtn.disabled = true;
  } else {
    if (recToggleBtn) recToggleBtn.disabled = false;
  }

  const recordings = (song && Array.isArray(song.recordings)) ? song.recordings : [];
  if (!recordings.length) {
    if (recordingSupported() && attachmentsSupported()) {
      setRecStatus('No recordings yet. Press Record to add one.');
    }
    const empty = document.createElement('div');
    empty.className = 'sw-rec-empty';
    empty.textContent = 'No recordings attached yet.';
    recListEl.appendChild(empty);
    return;
  }

  setRecStatus(`${recordings.length} recording${recordings.length === 1 ? '' : 's'} attached`);

  const songId = song.id;
  for (const rec of recordings) {
    const row = document.createElement('div');
    row.className = 'sw-rec-item';
    row.dataset.id = rec.id;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sw-rec-name';
    nameInput.value = rec.name;
    nameInput.maxLength = NAME_LIMIT;
    nameInput.setAttribute('aria-label', 'Recording name');
    nameInput.addEventListener('change', () => {
      const clean = renameRecording(rec.id, nameInput.value);
      if (clean) nameInput.value = clean;
      renderList();
    });
    row.appendChild(nameInput);

    const audio = document.createElement('audio');
    audio.className = 'sw-rec-audio';
    audio.controls = true;
    audio.preload = 'none';
    row.appendChild(audio);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn sm sw-rec-item-delete';
    del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete recording ${rec.name}`);
    del.onclick = () => deleteRecording(rec.id);
    row.appendChild(del);

    recListEl.appendChild(row);

    // Load the Blob lazily into the player; the user may have navigated away.
    getAudioBlob(rec.id).then(blob => {
      if (currentId !== songId) return;
      if (!blob) { row.classList.add('missing'); nameInput.disabled = true; audio.replaceWith(spanText('sw-rec-missing', 'File missing from storage')); return; }
      const url = URL.createObjectURL(blob);
      recURLs.push(url);
      audio.src = url;
    }).catch(() => {});
  }
}

function setRecStatus(text, isError) {
  if (!recStatusEl) return;
  recStatusEl.textContent = text;
  recStatusEl.classList.toggle('error', !!isError);
}

// --- lightweight confirm modal (reuses session-* modal styles) -------------

let confirmRoot = null;

function openConfirm(title, body, confirmLabel, onConfirm) {
  if (!confirmRoot) {
    confirmRoot = document.createElement('div');
    document.body.appendChild(confirmRoot);
  }
  confirmRoot.innerHTML = '';

  const overlay = document.createElement('div');
  overlay.className = 'session-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'session-dialog session-confirm';
  dialog.innerHTML = `
    <h3 class="session-dialog-title">${escapeHtml(title)}</h3>
    ${body ? `<p class="session-dialog-body">${escapeHtml(body)}</p>` : ''}
  `;

  const actions = document.createElement('div');
  actions.className = 'session-dialog-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn sm';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeConfirm;

  const confirm = document.createElement('button');
  confirm.className = 'btn primary';
  confirm.type = 'button';
  confirm.textContent = confirmLabel;
  confirm.onclick = () => { closeConfirm(); onConfirm(); };

  actions.appendChild(cancel);
  actions.appendChild(confirm);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeConfirm(); });
  confirmRoot.appendChild(overlay);
}

function closeConfirm() {
  if (confirmRoot) confirmRoot.innerHTML = '';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// --- init / teardown --------------------------------------------------------

export function initSongwriter() {
  listEl = document.getElementById('sw-list');
  emptyEl = document.getElementById('sw-empty');
  editorEmptyEl = document.getElementById('sw-editor-empty');
  editorBodyEl = document.getElementById('sw-editor-body');
  titleInput = document.getElementById('sw-title');
  lyricsInput = document.getElementById('sw-lyrics');
  savedIndicator = document.getElementById('sw-saved');
  recToggleBtn = document.getElementById('sw-rec-toggle');
  recStatusEl = document.getElementById('sw-rec-status');
  recListEl = document.getElementById('sw-rec-list');

  if (!listEl) return;

  if (!wired) {
    wired = true;

    const newBtn = document.getElementById('sw-new');
    if (newBtn) newBtn.onclick = newSong;
    const emptyNew = document.getElementById('sw-empty-new');
    if (emptyNew) emptyNew.onclick = newSong;

    if (titleInput) titleInput.addEventListener('input', onEdit);
    if (lyricsInput) lyricsInput.addEventListener('input', onEdit);

    const saveBtn = document.getElementById('sw-save');
    if (saveBtn) saveBtn.onclick = () => saveCurrent();

    const deleteBtn = document.getElementById('sw-delete');
    if (deleteBtn) deleteBtn.onclick = confirmDeleteSong;

    if (recToggleBtn) recToggleBtn.onclick = toggleRecord;

    if (attachmentsSupported()) ensurePersistentStorage();
  }

  // Re-select the current song (or fall back to the first / empty state) so the
  // editor reflects the latest data when the section is shown.
  const songs = getSongs();
  if (currentId && getSong(currentId)) {
    selectSong(currentId);
  } else if (songs.length) {
    selectSong(songs[0].id);
  } else {
    currentId = null;
    showEditorBody(false);
    renderList();
  }
}

// Stop the mic / drop an in-progress take and pause playback when leaving.
export function stopSongwriter() {
  flushSave();
  stopRecordingIfActive();
  if (recListEl) {
    recListEl.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch (e) {} });
  }
}
