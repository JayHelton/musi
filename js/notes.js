// Notes for Musi. A lightweight place to jot down practice notes, ideas and
// reminders as a master-detail list with autosave. Text lives in localStorage
// (musi.notes); nothing leaves the device.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage is unavailable.

const STORAGE_KEY = 'musi.notes';
const TITLE_LIMIT = 120;
const BODY_LIMIT = 50000;
const AUTOSAVE_MS = 700;

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

let notesCache = null;
let selectedId = null;
let autosaveTimer = null;
let bound = false;

function uid() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `note-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: clampText(typeof raw.title === 'string' ? raw.title : '', TITLE_LIMIT),
    body: clampText(typeof raw.body === 'string' ? raw.body : '', BODY_LIMIT),
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
  };
}

function getNotes() {
  if (notesCache) return notesCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    notesCache = [];
    return notesCache;
  }
  try {
    const parsed = JSON.parse(raw);
    notesCache = Array.isArray(parsed) ? parsed.map(normalizeNote).filter(Boolean) : [];
  } catch (e) {
    notesCache = [];
  }
  return notesCache;
}

function persistNotes() {
  if (!notesCache) return;
  writeKey(STORAGE_KEY, JSON.stringify(notesCache));
}

function sortedNotes() {
  return getNotes().slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function findNote(id) {
  return getNotes().find(n => n.id === id) || null;
}

function firstLine(body) {
  const line = (body || '').split('\n').map(s => s.trim()).find(Boolean);
  return line || '';
}

function displayTitle(note) {
  return (note.title && note.title.trim()) || firstLine(note.body) || 'Untitled note';
}

function relativeDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// --- DOM helpers -----------------------------------------------------------

function q(id) { return document.getElementById(id); }

function renderList() {
  const list = q('notes-list');
  const empty = q('notes-empty');
  if (!list) return;
  const notes = sortedNotes();
  list.innerHTML = '';
  if (empty) empty.style.display = notes.length ? 'none' : '';

  notes.forEach(note => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'notes-list-item' + (note.id === selectedId ? ' active' : '');
    item.dataset.id = note.id;
    const title = document.createElement('div');
    title.className = 'notes-list-title';
    title.textContent = displayTitle(note);
    const sub = document.createElement('div');
    sub.className = 'notes-list-sub';
    sub.textContent = firstLine(note.body) || 'No additional text';
    const meta = document.createElement('div');
    meta.className = 'notes-list-date';
    meta.textContent = relativeDate(note.updatedAt);
    item.appendChild(title);
    item.appendChild(sub);
    item.appendChild(meta);
    item.onclick = () => selectNote(note.id);
    list.appendChild(item);
  });
}

function renderEditor() {
  const emptyState = q('notes-editor-empty');
  const body = q('notes-editor-body');
  const titleInput = q('notes-title');
  const bodyInput = q('notes-body');
  if (!emptyState || !body) return;

  const note = selectedId ? findNote(selectedId) : null;
  if (!note) {
    emptyState.style.display = '';
    body.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  body.style.display = '';
  if (titleInput) titleInput.value = note.title;
  if (bodyInput) bodyInput.value = note.body;
  setSavedState('saved', 'Saved');
}

function setSavedState(cls, text) {
  const el = q('notes-saved');
  if (!el) return;
  el.className = 'notes-saved' + (cls ? ' ' + cls : '');
  el.textContent = text || '';
}

function selectNote(id) {
  flushAutosave();
  selectedId = id;
  renderList();
  renderEditor();
  const bodyInput = q('notes-body');
  if (bodyInput) setTimeout(() => bodyInput.focus(), 30);
}

function createNote() {
  flushAutosave();
  const note = normalizeNote({ id: uid(), title: '', body: '', createdAt: nowISO(), updatedAt: nowISO() });
  getNotes().unshift(note);
  persistNotes();
  selectedId = note.id;
  renderList();
  renderEditor();
  const titleInput = q('notes-title');
  if (titleInput) setTimeout(() => titleInput.focus(), 30);
}

function scheduleAutosave() {
  setSavedState('dirty', 'Saving\u2026');
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, AUTOSAVE_MS);
}

function flushAutosave() {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  if (!selectedId) return;
  const note = findNote(selectedId);
  if (!note) return;
  const titleInput = q('notes-title');
  const bodyInput = q('notes-body');
  if (!titleInput || !bodyInput) return;
  const nextTitle = clampText(titleInput.value, TITLE_LIMIT);
  const nextBody = clampText(bodyInput.value, BODY_LIMIT);
  if (nextTitle === note.title && nextBody === note.body) {
    setSavedState('saved', 'Saved');
    return;
  }
  note.title = nextTitle;
  note.body = nextBody;
  note.updatedAt = nowISO();
  persistNotes();
  setSavedState('saved', 'Saved');
  renderList();
}

// --- delete confirm (reuses shared modal styles) ---------------------------

let dialogRoot = null;

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function confirmDelete(note) {
  if (!dialogRoot) {
    dialogRoot = document.createElement('div');
    document.body.appendChild(dialogRoot);
  }
  dialogRoot.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog modal-confirm';
  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = `Delete "${displayTitle(note)}"?`;
  const bodyText = document.createElement('p');
  bodyText.className = 'modal-body';
  bodyText.textContent = 'This permanently removes the note from this device.';
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn sm';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeDialog;
  const del = document.createElement('button');
  del.className = 'btn primary';
  del.type = 'button';
  del.textContent = 'Delete';
  del.onclick = () => { closeDialog(); deleteNote(note.id); };
  actions.appendChild(cancel);
  actions.appendChild(del);
  dialog.appendChild(title);
  dialog.appendChild(bodyText);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function deleteNote(id) {
  const notes = getNotes();
  const i = notes.findIndex(n => n.id === id);
  if (i < 0) return;
  notes.splice(i, 1);
  persistNotes();
  if (selectedId === id) selectedId = null;
  renderList();
  renderEditor();
}

// --- init / teardown -------------------------------------------------------

export function initNotes() {
  if (!q('notes-list')) return;

  if (!bound) {
    bound = true;
    const newBtn = q('notes-new');
    if (newBtn) newBtn.onclick = createNote;
    const emptyNew = q('notes-empty-new');
    if (emptyNew) emptyNew.onclick = createNote;
    const titleInput = q('notes-title');
    if (titleInput) titleInput.oninput = scheduleAutosave;
    const bodyInput = q('notes-body');
    if (bodyInput) bodyInput.oninput = scheduleAutosave;
    const del = q('notes-delete');
    if (del) del.onclick = () => { const note = findNote(selectedId); if (note) confirmDelete(note); };
  }

  if (selectedId && !findNote(selectedId)) selectedId = null;
  renderList();
  renderEditor();
}

export function stopNotes() {
  flushAutosave();
}
