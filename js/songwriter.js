// Songwriting notepad for Musi. A lightweight place to write song lyrics and
// attach a single vocal recording to each song, with full CRUD: a list of
// songs, a New button, per-song delete, and saving (manual + autosave).
//
// Like Sessions, the split mirrors the rest of the app:
//   - song text/metadata lives in localStorage (musi.songs)
//   - the recorded audio Blob lives in IndexedDB (attachments.js), referenced
//     from the song by `audioId`.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage / IndexedDB / the microphone are unavailable.

import {
  saveAudio,
  getAudioBlob,
  deleteAudio,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';

const STORAGE_KEY = 'musi.songs';
const TITLE_LIMIT = 120;
const LYRICS_LIMIT = 20000;
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

function normalizeSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: clampText(typeof raw.title === 'string' ? raw.title : '', TITLE_LIMIT),
    lyrics: clampText(typeof raw.lyrics === 'string' ? raw.lyrics : '', LYRICS_LIMIT),
    audioId: typeof raw.audioId === 'string' && raw.audioId ? raw.audioId : null,
    audioName: typeof raw.audioName === 'string' ? raw.audioName : '',
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
  const song = { id: uid(), title: '', lyrics: '', audioId: null, audioName: '', createdAt: t, updatedAt: t };
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

// Playback object URL (revoked when swapping songs / recordings).
let currentAudioURL = null;

// DOM refs (resolved in init).
let listEl, emptyEl, editorEmptyEl, editorBodyEl;
let titleInput, lyricsInput, savedIndicator;
let recToggleBtn, recStatusEl, audioEl, recDeleteBtn;

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
    if (song.audioId) {
      metaRow.appendChild(spanText('sw-list-mic', '\u25CF rec'));
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
  loadRecording(song);
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
  loadRecording(song);
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
    'This removes the song and its recording from this device.',
    'Delete',
    async () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      stopRecordingIfActive();
      if (song.audioId) { try { await deleteAudio(song.audioId); } catch (e) {} }
      deleteSong(song.id);
      currentId = null;
      revokeAudioURL();
      showEditorBody(false);
      renderList();
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
  setRecStatus('Requesting microphone\u2026');
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
  if (audioEl) audioEl.style.display = 'none';
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
    try { recStream.getTracks().forEach(t => t.stop()); } catch (e) {}
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

  const name = `${songTitleOf(song)} demo`;
  const meta = await saveAudio({ blob, name, type, source: 'songwriter' });
  if (!meta) {
    setRecStatus('Could not save the recording.', true);
    return;
  }

  // Replace any previous recording for this song.
  if (song.audioId && song.audioId !== meta.id) {
    try { await deleteAudio(song.audioId); } catch (e) {}
  }
  song.audioId = meta.id;
  song.audioName = meta.name;
  song.updatedAt = nowISO();
  persistSongs();

  // Only refresh the player if the user is still on this song.
  if (currentId === songId) loadRecording(song);
  renderList();
}

async function deleteRecording() {
  if (!currentId) return;
  const song = getSong(currentId);
  if (!song || !song.audioId) return;
  const audioId = song.audioId;
  song.audioId = null;
  song.audioName = '';
  song.updatedAt = nowISO();
  persistSongs();
  loadRecording(song);
  renderList();
  try { await deleteAudio(audioId); } catch (e) {}
}

function revokeAudioURL() {
  if (currentAudioURL) { try { URL.revokeObjectURL(currentAudioURL); } catch (e) {} currentAudioURL = null; }
}

// Loads the song's recording (if any) into the inline audio player.
async function loadRecording(song) {
  revokeAudioURL();
  if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl.removeAttribute('src'); audioEl.style.display = 'none'; }
  if (recDeleteBtn) recDeleteBtn.style.display = 'none';

  if (!attachmentsSupported()) {
    setRecStatus('Recording needs browser storage, which is unavailable here.', true);
    if (recToggleBtn) recToggleBtn.disabled = true;
    return;
  }
  if (recToggleBtn) recToggleBtn.disabled = !recordingSupported();

  if (!song || !song.audioId) {
    setRecStatus(recordingSupported() ? 'No recording yet.' : 'Recording is not supported in this browser.', !recordingSupported());
    return;
  }

  const blob = await getAudioBlob(song.audioId);
  // The user may have navigated away while the Blob was loading.
  if (currentId !== song.id) return;
  if (!blob) {
    setRecStatus('Recording is missing from storage.', true);
    return;
  }
  currentAudioURL = URL.createObjectURL(blob);
  if (audioEl) {
    audioEl.src = currentAudioURL;
    audioEl.style.display = '';
  }
  if (recDeleteBtn) recDeleteBtn.style.display = '';
  setRecStatus(`Saved recording \u00B7 ${fmtRelativeDate(song.updatedAt)}`);
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
  audioEl = document.getElementById('sw-audio');
  recDeleteBtn = document.getElementById('sw-rec-delete');

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
    if (recDeleteBtn) recDeleteBtn.onclick = deleteRecording;

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
  if (audioEl) { try { audioEl.pause(); } catch (e) {} }
}
