// Session UI for Musi: home Sessions rail, the session editor, the focused
// session runner (timer + transport + auto-advance), the complete screen, and
// the resume-after-refresh prompt. Drills render by navigating to the existing
// tool section while this module owns the runner shell on top.

import {
  TOOL_REGISTRY,
  REFERENCE_TOOL_IDS,
  toolName,
  toolSectionId,
  toolExists,
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  removeAttachmentFromAllSessions,
  markSessionStarted,
  sessionTotalSeconds,
  sessionTotalMinutes,
  getActiveSession,
  saveActiveSession,
  clearActiveSession,
  getHistory,
  addHistoryItem,
  uid,
  clampDuration,
} from './sessions.js';
import { ensureAudio, audioCtx } from './audio.js';
import {
  saveAudio,
  listAudioMeta,
  getAudioBlob,
  renameAudio,
  deleteAudio,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';
import { getExercises, getExercise, openExerciseViewer } from './exercises.js';
import { setMarkdown } from './markdown.js';

// Object URLs created for inline playback, tracked so they can be revoked.
let activeAudioEl = null;
let activeAudioURL = null;

// How many library items show per page in the editor's attachment list.
const LIBRARY_PAGE_SIZE = 5;

let showSectionFn = null;
let icons = {};

// Runner runtime state (null when no session running).
let rt = null;
let tickTimer = null;

// Session-details dropdown shown from the sticky runner header. Built once per
// run and reused so attachment playback survives runner re-renders.
let detailsPanel = null;
let detailsOpen = false;
let detailsBuilt = false;

// --- small DOM helpers ------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// The name shown for a drill: its custom label if set, else the stored tool
// name, else the registry name for its toolId.
function drillDisplayName(drill) {
  if (drill && typeof drill.label === 'string' && drill.label.trim()) return drill.label.trim();
  return (drill && drill.toolName) || toolName(drill && drill.toolId);
}

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

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

// =========================================================================
// HOME: sessions rail + recent history
// =========================================================================

// Stops and releases any attachment audio playing on a card. Card <audio>
// elements are torn down whenever the grid re-renders; removing them from the
// DOM does not stop playback, so we must pause + revoke explicitly.
function stopCardAudio() {
  if (activeAudioEl) { try { activeAudioEl.pause(); } catch (e) {} }
  if (activeAudioURL) { try { URL.revokeObjectURL(activeAudioURL); } catch (e) {} }
  activeAudioEl = null;
  activeAudioURL = null;
}

export function renderHome() {
  const grid = document.getElementById('home-sessions-grid');
  const empty = document.getElementById('home-sessions-empty');
  if (!grid) return;

  stopCardAudio();
  const sessions = getSessions().filter(s => !s.programId);
  grid.innerHTML = '';

  if (sessions.length === 0) {
    if (empty) empty.style.display = '';
    grid.style.display = 'none';
  } else {
    if (empty) empty.style.display = 'none';
    grid.style.display = '';
    sessions.forEach(s => grid.appendChild(buildSessionCard(s)));
  }

  renderHistory();
}

function buildSessionCard(session) {
  const totalMin = sessionTotalMinutes(session);
  const count = session.drills.length;
  const meta = [`${totalMin} min`, `${count} drill${count === 1 ? '' : 's'}`].join(' · ');
  const last = session.lastStartedAt ? `Last played ${fmtRelativeDate(session.lastStartedAt)}` : 'Not played yet';

  const card = el('div', { class: 'session-card', 'data-id': session.id });
  card.appendChild(el('div', { class: 'session-card-name', text: session.name }));
  card.appendChild(el('div', { class: 'session-card-meta', text: meta }));
  card.appendChild(el('div', { class: 'session-card-sub', text: last }));

  if (session.notes && session.notes.trim()) {
    const notesEl = el('div', { class: 'session-card-notes', title: session.notes });
    setMarkdown(notesEl, session.notes);
    card.appendChild(notesEl);
    card.appendChild(el('button', {
      class: 'session-notes-toggle',
      type: 'button',
      'aria-expanded': 'false',
      text: 'Read notes',
      onClick: (e) => {
        e.stopPropagation();
        const expanded = card.classList.toggle('notes-expanded');
        e.currentTarget.textContent = expanded ? 'Collapse notes' : 'Read notes';
        e.currentTarget.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      },
    }));
  }

  const attachments = Array.isArray(session.attachments) ? session.attachments : [];
  if (attachments.length) card.appendChild(buildAttachmentPlayer(attachments));

  const actions = el('div', { class: 'session-card-actions' });
  actions.appendChild(el('button', {
    class: 'btn primary session-start',
    type: 'button',
    text: 'Start',
    onClick: () => startSession(session.id),
  }));
  actions.appendChild(el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'Edit',
    onClick: () => openEditor(session.id),
  }));
  actions.appendChild(el('button', {
    class: 'btn sm session-delete',
    type: 'button',
    text: 'Delete',
    onClick: () => confirmDelete(session),
  }));
  card.appendChild(actions);
  return card;
}

// Builds the clickable attachment list shown on a session card. Clicking a
// named item loads its Blob from IndexedDB and plays it in a shared inline
// audio player rendered below the list.
function buildAttachmentPlayer(attachments) {
  const wrap = el('div', { class: 'session-card-attach' });
  const player = el('audio', { class: 'session-attach-audio', controls: '', preload: 'none' });
  player.style.display = 'none';

  const list = el('div', { class: 'session-attach-list' });
  attachments.forEach(att => {
    const btn = el('button', {
      class: 'session-attach-item', type: 'button', title: att.fileName || att.name,
    }, [
      el('span', { class: 'session-attach-icon', html: '&#9654;', 'aria-hidden': 'true' }),
      el('span', { class: 'session-attach-name', text: att.name }),
    ]);
    btn.addEventListener('click', () => playAttachment(att, player, list, btn));
    list.appendChild(btn);
  });

  // Clear the highlight when playback finishes on its own.
  player.addEventListener('ended', () => {
    list.querySelectorAll('.session-attach-item.playing').forEach(b => b.classList.remove('playing'));
  });

  wrap.appendChild(list);
  wrap.appendChild(player);
  return wrap;
}

async function playAttachment(att, player, list, btn) {
  // Revoke any URL from a previously played attachment (any card).
  if (activeAudioURL) { try { URL.revokeObjectURL(activeAudioURL); } catch (e) {} activeAudioURL = null; }
  if (activeAudioEl && activeAudioEl !== player) {
    // Pause and hide the other card's player so only one is ever shown.
    try { activeAudioEl.pause(); } catch (e) {}
    activeAudioEl.style.display = 'none';
  }

  // Clear the "playing" highlight on every card, not just this one.
  document.querySelectorAll('.session-attach-item.playing').forEach(b => b.classList.remove('playing'));

  const blob = await getAudioBlob(att.id);
  if (!blob) {
    btn.classList.add('missing');
    btn.title = 'File missing from storage';
    return;
  }
  const url = URL.createObjectURL(blob);
  activeAudioURL = url;
  activeAudioEl = player;
  player.src = url;
  player.style.display = '';
  btn.classList.add('playing');
  player.play().catch(() => { /* autoplay may need a gesture; controls remain */ });
}

function renderHistory() {
  const wrap = document.getElementById('home-sessions-history');
  const list = document.getElementById('home-sessions-history-list');
  if (!wrap || !list) return;

  const history = getHistory();
  if (history.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  list.innerHTML = '';
  history.slice(0, 5).forEach(item => {
    const status = item.completed
      ? 'completed'
      : `${item.completedDrills} of ${item.totalDrills} drills`;
    const when = fmtRelativeDate(item.endedAt || item.startedAt);
    list.appendChild(el('div', { class: 'session-history-item' }, [
      el('span', { class: 'session-history-name', text: item.sessionName }),
      el('span', { class: 'session-history-status', text: `${status} · ${when}` }),
    ]));
  });
}

function confirmDelete(session) {
  openConfirm(
    `Delete “${session.name}”?`,
    'This removes the saved session from this device.',
    'Delete',
    () => {
      // Ending an active session if it is the one being deleted. Saved audio in
      // the library is intentionally kept — it persists until deleted manually.
      if (rt && rt.session && rt.session.id === session.id) endSession(false);
      deleteSession(session.id);
      renderHome();
    },
  );
}

// =========================================================================
// MODAL SCAFFOLD
// =========================================================================

let modalRoot = null;

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = el('div', { id: 'session-modal-root' });
  document.body.appendChild(modalRoot);
  return modalRoot;
}

function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
  document.body.classList.remove('session-modal-open');
  // Stop the editor's library-preview audio if it was playing.
  if (editorPreviewAudio) { try { editorPreviewAudio.pause(); } catch (e) {} }
}

function openModal(contentNode, { onClose } = {}) {
  ensureModalRoot();
  modalRoot.innerHTML = '';
  const overlay = el('div', { class: 'session-overlay' });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      closeModal();
      if (onClose) onClose();
    }
  });
  overlay.appendChild(contentNode);
  modalRoot.appendChild(overlay);
  document.body.classList.add('session-modal-open');
}

function openConfirm(title, body, confirmLabel, onConfirm) {
  const dialog = el('div', { class: 'session-dialog session-confirm' }, [
    el('h3', { class: 'session-dialog-title', text: title }),
    body ? el('p', { class: 'session-dialog-body', text: body }) : null,
  ]);
  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: () => closeModal() }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { closeModal(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  openModal(dialog);
}

// =========================================================================
// EDITOR
// =========================================================================

// Working copy of the drills being edited.
let editorState = null;

function openEditor(sessionId) {
  // Editing must not disturb a running session of the same id.
  if (sessionId && rt && rt.session && rt.session.id === sessionId) {
    openConfirm(
      'Session is running',
      'End the active session before editing it.',
      'End & Edit',
      () => { endSession(false); openEditor(sessionId); },
    );
    return;
  }

  const existing = sessionId ? getSession(sessionId) : null;
  editorState = {
    id: existing ? existing.id : null,
    name: existing ? existing.name : '',
    notes: existing && typeof existing.notes === 'string' ? existing.notes : '',
    drills: existing
      ? existing.drills.map(d => ({ ...d }))
      : [],
    // Library ids attached to this session, in display order.
    attachedIds: existing && Array.isArray(existing.attachments)
      ? existing.attachments.map(a => a.id)
      : [],
    // Loaded asynchronously from the IndexedDB library; drives the paginated list.
    library: [],
    libraryPage: 0,
  };

  const dialog = el('div', { class: 'session-dialog session-editor' });
  dialog.appendChild(el('div', { class: 'session-dialog-head' }, [
    el('h3', { class: 'session-dialog-title', text: existing ? 'Edit Session' : 'Create Session' }),
    el('button', { class: 'session-dialog-close', type: 'button', 'aria-label': 'Close', html: '&#10005;', onClick: () => closeModal() }),
  ]));

  const nameField = el('input', {
    type: 'text', class: 'session-name-input', id: 'session-name-input',
    placeholder: 'Session name (e.g. Pre-Gig Warmup)', value: editorState.name, maxlength: '60',
  });
  nameField.addEventListener('input', () => { editorState.name = nameField.value; });
  dialog.appendChild(el('label', { class: 'session-field-label', text: 'Session name' }));
  dialog.appendChild(nameField);

  const notesField = el('textarea', {
    class: 'session-notes-input', id: 'session-notes-input', rows: '3', maxlength: '4000',
    placeholder: 'Reminders, curriculum or regimen requirements, goals for this session…',
  });
  notesField.value = editorState.notes;
  notesField.addEventListener('input', () => { editorState.notes = notesField.value; });
  dialog.appendChild(el('label', { class: 'session-field-label', text: 'Notes' }));
  dialog.appendChild(notesField);

  dialog.appendChild(el('div', { class: 'session-field-label session-drills-label' }, [
    el('span', { text: 'Drills' }),
    el('span', { class: 'session-total-pill', id: 'editor-total' }),
  ]));

  const drillList = el('div', { class: 'session-drill-list', id: 'editor-drill-list' });
  dialog.appendChild(drillList);

  // Add-drill control
  const addRow = el('div', { class: 'session-add-row' });
  const select = el('select', { class: 'session-add-select', id: 'editor-add-select' });
  select.appendChild(el('option', { value: '', text: 'Add a drill…' }));
  Object.keys(TOOL_REGISTRY).forEach(toolId => {
    const isRef = REFERENCE_TOOL_IDS.includes(toolId);
    select.appendChild(el('option', {
      value: toolId,
      text: toolName(toolId) + (isRef ? ' (reference)' : ''),
    }));
  });
  select.addEventListener('change', () => {
    const toolId = select.value;
    if (!toolId) return;
    editorState.drills.push({
      id: uid('drill'),
      toolId,
      toolName: toolName(toolId),
      label: '',
      notes: '',
      durationMinutes: 3,
    });
    select.value = '';
    renderDrillList();
  });
  addRow.appendChild(select);
  dialog.appendChild(addRow);

  // --- Attachments: a paginated, date-sorted library of saved audio (uploads
  // and recordings). Toggle which items are attached to this session. ---
  dialog.appendChild(el('div', { class: 'session-field-label session-drills-label' }, [
    el('span', { text: 'Attachments' }),
    el('span', { class: 'session-total-pill', id: 'editor-attach-count' }),
  ]));

  if (attachmentsSupported()) {
    const fileInput = el('input', {
      type: 'file', accept: 'audio/*', multiple: '', id: 'editor-attach-file',
    });
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => onUploadFiles(fileInput));
    const addAttachBtn = el('button', {
      class: 'btn sm session-attach-add', type: 'button', text: '+ Upload audio',
      onClick: () => fileInput.click(),
    });
    dialog.appendChild(addAttachBtn);
    dialog.appendChild(fileInput);

    dialog.appendChild(el('div', { class: 'session-attach-edit-list', id: 'editor-attach-list' }));
    dialog.appendChild(el('div', { class: 'session-attach-pager', id: 'editor-attach-pager' }));
  } else {
    dialog.appendChild(el('div', {
      class: 'session-attach-unsupported',
      text: 'Attachments need browser storage (IndexedDB), which is unavailable here.',
    }));
  }

  const errors = el('div', { class: 'session-errors', id: 'editor-errors' });
  dialog.appendChild(errors);

  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: () => closeModal() }));
  actions.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'Save Session', onClick: saveEditor }));
  dialog.appendChild(actions);

  openModal(dialog);
  renderDrillList();
  if (attachmentsSupported()) refreshLibrary();
  setTimeout(() => nameField.focus(), 50);
}

// Loads the audio library from IndexedDB (newest first) and re-renders the list.
async function refreshLibrary() {
    // Exercise files live in the same store but are managed in the Exercises view;
  // keep them out of the session audio attachment list.
  editorState.library = (await listAudioMeta()).filter(m => m.source !== 'exercise');
  const pages = Math.max(1, Math.ceil(editorState.library.length / LIBRARY_PAGE_SIZE));
  if (editorState.libraryPage >= pages) editorState.libraryPage = pages - 1;
  renderAttachList();
}

async function onUploadFiles(fileInput) {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const meta = await saveAudio({
      blob: file, name: base || 'Audio', type: file.type, fileName: file.name,
      size: file.size, source: 'upload',
    });
    // Newly uploaded audio is auto-attached to the session being edited.
    if (meta && !editorState.attachedIds.includes(meta.id)) editorState.attachedIds.push(meta.id);
  }
  editorState.libraryPage = 0;
  await refreshLibrary();
}

function renderAttachList() {
  const list = document.getElementById('editor-attach-list');
  const count = document.getElementById('editor-attach-count');
  if (!list) return;
  list.innerHTML = '';

  if (count) {
    const n = editorState.attachedIds.length;
    count.textContent = `${n} attached`;
  }

  const lib = editorState.library;
  if (lib.length === 0) {
    list.appendChild(el('div', {
      class: 'session-attach-empty',
      text: 'No saved audio yet. Upload mp3s of warmups / vocal notes, or save a take from the Recorder.',
    }));
    renderAttachPager();
    return;
  }

  const start = editorState.libraryPage * LIBRARY_PAGE_SIZE;
  const pageItems = lib.slice(start, start + LIBRARY_PAGE_SIZE);

  pageItems.forEach(item => {
    const attached = editorState.attachedIds.includes(item.id);
    const row = el('div', { class: 'session-attach-edit-row' + (attached ? ' attached' : '') });

    const toggle = el('input', {
      type: 'checkbox', class: 'session-attach-check', 'aria-label': 'Attach to this session',
    });
    toggle.checked = attached;
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        if (!editorState.attachedIds.includes(item.id)) editorState.attachedIds.push(item.id);
      } else {
        editorState.attachedIds = editorState.attachedIds.filter(id => id !== item.id);
      }
      row.classList.toggle('attached', toggle.checked);
      renderAttachCount();
    });
    row.appendChild(toggle);

    const nameInput = el('input', {
      type: 'text', class: 'session-attach-name-input', value: item.name,
      placeholder: 'Name', maxlength: '60', 'aria-label': 'Attachment name',
    });
    nameInput.addEventListener('change', async () => {
      const newName = nameInput.value.trim() || item.name;
      nameInput.value = newName;
      item.name = newName;
      await renameAudio(item.id, newName);
    });

    const sub = `${item.source === 'recording' ? 'Recording' : 'Upload'} · ${fmtRelativeDate(item.createdAt)}`;
    const info = el('div', { class: 'session-attach-edit-info' }, [
      nameInput,
      el('div', { class: 'session-attach-edit-file', text: sub }),
    ]);
    row.appendChild(info);

    row.appendChild(el('button', {
      class: 'session-icon-btn session-attach-preview', type: 'button',
      'aria-label': 'Preview', html: '&#9654;',
      onClick: () => previewLibraryItem(item),
    }));

    row.appendChild(el('button', {
      class: 'session-icon-btn session-drill-remove', type: 'button',
      'aria-label': 'Delete from library', html: '&#10005;',
      onClick: () => confirmDeleteLibraryItem(item),
    }));

    list.appendChild(row);
  });

  renderAttachPager();
}

function renderAttachCount() {
  const count = document.getElementById('editor-attach-count');
  if (count) count.textContent = `${editorState.attachedIds.length} attached`;
}

function renderAttachPager() {
  const pager = document.getElementById('editor-attach-pager');
  if (!pager) return;
  pager.innerHTML = '';
  const total = editorState.library.length;
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  if (pages <= 1) return;

  const page = editorState.libraryPage;
  pager.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Prev', disabled: page === 0 ? '' : null,
    onClick: () => { if (editorState.libraryPage > 0) { editorState.libraryPage--; renderAttachList(); } },
  }));
  pager.appendChild(el('span', { class: 'session-attach-page-label', text: `Page ${page + 1} of ${pages}` }));
  pager.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Next', disabled: page >= pages - 1 ? '' : null,
    onClick: () => { if (editorState.libraryPage < pages - 1) { editorState.libraryPage++; renderAttachList(); } },
  }));
}

let editorPreviewAudio = null;
let editorPreviewURL = null;
async function previewLibraryItem(item) {
  const blob = await getAudioBlob(item.id);
  if (!blob) return;
  if (!editorPreviewAudio) editorPreviewAudio = new Audio();
  if (editorPreviewURL) { try { URL.revokeObjectURL(editorPreviewURL); } catch (e) {} }
  editorPreviewURL = URL.createObjectURL(blob);
  editorPreviewAudio.src = editorPreviewURL;
  editorPreviewAudio.play().catch(() => {});
}

function confirmDeleteLibraryItem(item) {
  // A nested confirm stacked above the editor so the editor stays intact.
  openNestedConfirm(
    `Delete “${item.name}”?`,
    'This permanently removes the audio from this device and any sessions using it.',
    'Delete',
    async () => {
      await deleteAudio(item.id);
      editorState.attachedIds = editorState.attachedIds.filter(id => id !== item.id);
      // Purge the dangling reference from every saved session so no card is
      // left pointing at audio that no longer exists.
      removeAttachmentFromAllSessions(item.id);
      renderHome();
      await refreshLibrary();
    },
  );
}

// Lightweight confirm rendered in its own overlay (not the shared modal root),
// so it can appear on top of the editor dialog without replacing it.
function openNestedConfirm(title, body, confirmLabel, onConfirm) {
  const overlay = el('div', { class: 'session-overlay session-overlay-nested' });
  const dialog = el('div', { class: 'session-dialog session-confirm' }, [
    el('h3', { class: 'session-dialog-title', text: title }),
    body ? el('p', { class: 'session-dialog-body', text: body }) : null,
  ]);
  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: close }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { close(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}

function renderDrillList() {
  const list = document.getElementById('editor-drill-list');
  const totalPill = document.getElementById('editor-total');
  if (!list) return;
  list.innerHTML = '';

  if (editorState.drills.length === 0) {
    list.appendChild(el('div', { class: 'session-drill-empty', text: 'No drills yet. Add one below to build your routine.' }));
  }

  editorState.drills.forEach((drill, index) => {
    const known = toolExists(drill.toolId);
    const row = el('div', { class: 'session-drill-row' + (known ? '' : ' unknown') });

    const reorder = el('div', { class: 'session-drill-reorder' });
    reorder.appendChild(el('button', {
      class: 'session-icon-btn', type: 'button', 'aria-label': 'Move up', html: '&#9650;',
      disabled: index === 0 ? '' : null,
      onClick: () => moveDrill(index, -1),
    }));
    reorder.appendChild(el('button', {
      class: 'session-icon-btn', type: 'button', 'aria-label': 'Move down', html: '&#9660;',
      disabled: index === editorState.drills.length - 1 ? '' : null,
      onClick: () => moveDrill(index, 1),
    }));
    row.appendChild(reorder);

    const info = el('div', { class: 'session-drill-info' });

    const labelInput = el('input', {
      type: 'text', class: 'session-drill-label-input', maxlength: '80',
      value: drill.label || '', placeholder: drill.toolName || toolName(drill.toolId),
      'aria-label': 'Drill name',
    });
    labelInput.addEventListener('input', () => { drill.label = labelInput.value; });
    info.appendChild(labelInput);

    info.appendChild(el('div', { class: 'session-drill-tool', text: known ? '' : 'Tool unavailable' }));

    const notesInput = el('textarea', {
      class: 'session-drill-notes-input', rows: '2', maxlength: '2000',
      placeholder: 'Notes for this section (markdown supported)', 'aria-label': 'Drill notes',
    });
    notesInput.value = drill.notes || '';
    notesInput.addEventListener('input', () => { drill.notes = notesInput.value; });
    info.appendChild(notesInput);

    // Exercises drills can target a specific saved exercise, which the runner opens
    // automatically when the drill starts.
    if (drill.toolId === 'exercises') info.appendChild(buildExercisePicker(drill));
    row.appendChild(info);

    const durWrap = el('div', { class: 'session-dur' });
    const dur = el('input', {
      type: 'number', class: 'session-dur-input', min: '1', max: '60', step: '1',
      value: String(drill.durationMinutes), inputmode: 'numeric', 'aria-label': 'Duration in minutes',
    });
    dur.addEventListener('change', () => {
      drill.durationMinutes = clampDuration(dur.value);
      dur.value = String(drill.durationMinutes);
      updateEditorTotal();
    });
    durWrap.appendChild(dur);
    durWrap.appendChild(el('span', { class: 'session-dur-unit', text: 'min' }));
    row.appendChild(durWrap);

    row.appendChild(el('button', {
      class: 'session-icon-btn session-drill-remove', type: 'button', 'aria-label': 'Remove drill', html: '&#10005;',
      onClick: () => { editorState.drills.splice(index, 1); renderDrillList(); },
    }));

    list.appendChild(row);
  });

  updateEditorTotal();
}

// A dropdown of uploaded exercises for an "Exercises" drill. The choice is
// stored in drill.settings so the runner can auto-open it.
function buildExercisePicker(drill) {
  const exercises = getExercises();
  const wrap = el('div', { class: 'session-drill-exercise' });
  const select = el('select', { class: 'session-add-select session-exercise-select', 'aria-label': 'Exercise media' });
  select.appendChild(el('option', { value: '', text: exercises.length ? 'Open library (no specific exercise)' : 'No exercises saved yet' }));
  exercises.forEach(ex => {
    const opt = el('option', { value: ex.id, text: ex.name });
    if (drill.settings && drill.settings.exerciseId === ex.id) opt.selected = true;
    select.appendChild(opt);
  });
  select.value = (drill.settings && drill.settings.exerciseId) || '';
  select.addEventListener('change', () => {
    const id = select.value;
    if (!id) { drill.settings = undefined; return; }
    const ex = getExercise(id);
    drill.settings = { exerciseId: id, exerciseName: ex ? ex.name : '' };
  });
  wrap.appendChild(select);
  return wrap;
}

function updateEditorTotal() {
  const totalPill = document.getElementById('editor-total');
  if (!totalPill) return;
  const totalMin = editorState.drills.reduce((sum, d) => sum + clampDuration(d.durationMinutes), 0);
  totalPill.textContent = `${totalMin} min total`;
}

function moveDrill(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= editorState.drills.length) return;
  const arr = editorState.drills;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  renderDrillList();
}

function saveEditor() {
  const errorsEl = document.getElementById('editor-errors');

  // Resolve attached library ids to metadata snapshots (name shown on the card).
  // Blobs already live in IndexedDB; nothing to commit here.
  const libById = new Map(editorState.library.map(m => [m.id, m]));
  const attachments = editorState.attachedIds
    .map(id => {
      const m = libById.get(id);
      return m ? { id: m.id, name: m.name, fileName: m.fileName, type: m.type, size: m.size, addedAt: m.createdAt } : null;
    })
    .filter(Boolean);

  const input = { name: editorState.name, notes: editorState.notes, drills: editorState.drills, attachments };

  const result = editorState.id ? updateSession(editorState.id, input) : createSession(input);
  if (!result.ok) {
    if (errorsEl) errorsEl.textContent = result.errors.join(' ');
    return;
  }
  closeModal();
  renderHome();
}

// =========================================================================
// RUNNER
// =========================================================================

let runnerBar = null;

function ensureRunnerBar() {
  if (runnerBar) return runnerBar;
  runnerBar = el('div', { id: 'session-runner', class: 'session-runner', role: 'region', 'aria-label': 'Session runner' });
  document.body.appendChild(runnerBar);
  return runnerBar;
}

function startSession(sessionId, resumeState) {
  const session = getSession(sessionId);
  if (!session || session.drills.length === 0) {
    openConfirm('Cannot start', 'This session has no drills. Edit it to add at least one.', 'Edit', () => openEditor(sessionId));
    return;
  }

  // Snapshot the session so live edits/deletes do not disturb the run.
  rt = {
    session: JSON.parse(JSON.stringify(session)),
    startedAt: resumeState ? resumeState.startedAt : new Date().toISOString(),
    currentDrillIndex: 0,
    anchor: Date.now(),
    effectiveTotal: 0,
    remainingSeconds: 0,
    isPaused: false,
    completedDrillIds: resumeState ? (resumeState.completedDrillIds || []) : [],
    secondsCompleted: 0,
  };

  markSessionStarted(sessionId);

  ensureRunnerBar();
  document.body.classList.add('session-running');
  resetDetails();
  closeModal();

  if (resumeState) {
    const idx = Math.min(Math.max(0, resumeState.currentDrillIndex | 0), rt.session.drills.length - 1);
    rt.currentDrillIndex = idx;
    const drill = rt.session.drills[idx];
    rt.effectiveTotal = clampDuration(drill.durationMinutes) * 60;
    rt.remainingSeconds = Math.min(rt.effectiveTotal, Math.max(0, resumeState.remainingSeconds | 0));
    rt.isPaused = !!resumeState.isPaused;
    rt.anchor = Date.now();
    if (rt.isPaused) {
      // keep remainingSeconds frozen
    } else {
      rt.effectiveTotal = rt.remainingSeconds;
    }
    navigateToDrill(drill);
    persistActive();
    renderRunner();
    startTick();
  } else {
    startDrill(0);
  }
  renderHome();
}

function startDrill(index) {
  const drill = rt.session.drills[index];
  rt.currentDrillIndex = index;
  rt.effectiveTotal = clampDuration(drill.durationMinutes) * 60;
  rt.remainingSeconds = rt.effectiveTotal;
  rt.anchor = Date.now();
  rt.isPaused = false;

  navigateToDrill(drill);
  persistActive();
  renderRunner();
  startTick();
}

function navigateToDrill(drill) {
  const sectionId = toolSectionId(drill.toolId);
  if (sectionId && typeof showSectionFn === 'function') {
    showSectionFn(sectionId);
  }
  // For an Exercises drill that targets a specific item, pop the viewer open so
  // the player can read the tab/etude right away.
  if (drill.toolId === 'exercises' && drill.settings && drill.settings.exerciseId) {
    const exId = drill.settings.exerciseId;
    setTimeout(() => { try { openExerciseViewer(exId); } catch (e) {} }, 60);
  }
}

function liveRemaining() {
  if (!rt) return 0;
  if (rt.isPaused) return rt.remainingSeconds;
  const elapsed = Math.floor((Date.now() - rt.anchor) / 1000);
  return Math.max(0, rt.effectiveTotal - elapsed);
}

function startTick() {
  stopTick();
  tickTimer = setInterval(onTick, 250);
}
function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function onTick() {
  if (!rt) return;
  const remaining = liveRemaining();
  rt.remainingSeconds = remaining;
  updateRunnerTimer(remaining);
  if (!rt.isPaused && remaining <= 0) {
    advanceDrill(true);
  }
}

// completed=true marks the current drill as fully done (timer expired or
// natural finish); false is a skip.
function advanceDrill(completed) {
  if (!rt) return;
  const drill = rt.session.drills[rt.currentDrillIndex];
  const elapsed = Math.min(rt.effectiveTotal, rt.effectiveTotal - liveRemaining());
  rt.secondsCompleted += completed
    ? clampDuration(drill.durationMinutes) * 60
    : Math.max(0, elapsed);
  if (completed && drill && !rt.completedDrillIds.includes(drill.id)) {
    rt.completedDrillIds.push(drill.id);
  }

  if (rt.currentDrillIndex >= rt.session.drills.length - 1) {
    finishSession();
    return;
  }
  transitionCue();
  startDrill(rt.currentDrillIndex + 1);
}

function pauseResume() {
  if (!rt) return;
  if (rt.isPaused) {
    // Resume: re-anchor and count down from the frozen remaining value.
    rt.effectiveTotal = rt.remainingSeconds;
    rt.anchor = Date.now();
    rt.isPaused = false;
  } else {
    rt.remainingSeconds = liveRemaining();
    rt.isPaused = true;
  }
  persistActive();
  renderRunner();
}

function skipDrill() {
  if (!rt) return;
  advanceDrill(false);
}

function endSession(showSummary) {
  if (!rt) return;
  // Account for the in-progress drill's elapsed time.
  const elapsed = Math.max(0, rt.effectiveTotal - liveRemaining());
  rt.secondsCompleted += Math.min(rt.effectiveTotal, elapsed);
  finishSession({ early: true, showSummary });
}

function finishSession(opts = {}) {
  const { early = false, showSummary = true } = opts;
  if (!rt) return;

  stopTick();
  const session = rt.session;
  const completedDrills = rt.completedDrillIds.length;
  const totalDrills = session.drills.length;
  const completed = !early && completedDrills >= totalDrills && totalDrills > 0;

  addHistoryItem({
    sessionId: session.id,
    sessionName: session.name,
    startedAt: rt.startedAt,
    endedAt: new Date().toISOString(),
    completed,
    completedDrills,
    totalDrills,
    totalSecondsPlanned: sessionTotalSeconds(session),
    totalSecondsCompleted: Math.round(rt.secondsCompleted),
  });

  const summary = {
    name: session.name,
    sessionId: session.id,
    completed,
    completedDrills,
    totalDrills,
    secondsCompleted: Math.round(rt.secondsCompleted),
  };

  rt = null;
  clearActiveSession();
  resetDetails();
  document.body.classList.remove('session-running');
  if (runnerBar) runnerBar.innerHTML = '';

  renderHome();

  if (showSummary) showComplete(summary);
}

function persistActive() {
  if (!rt) return;
  saveActiveSession({
    sessionId: rt.session.id,
    startedAt: rt.startedAt,
    currentDrillIndex: rt.currentDrillIndex,
    currentDrillStartedAt: new Date(rt.anchor).toISOString(),
    remainingSeconds: liveRemaining(),
    isPaused: rt.isPaused,
    completedDrillIds: rt.completedDrillIds.slice(),
  });
}

// --- Runner rendering -------------------------------------------------------

function renderRunner() {
  if (!rt) return;
  ensureRunnerBar();
  const drill = rt.session.drills[rt.currentDrillIndex];
  const next = rt.session.drills[rt.currentDrillIndex + 1];
  const total = rt.session.drills.length;
  const known = toolExists(drill.toolId);

  runnerBar.innerHTML = '';
  const inner = el('div', { class: 'session-runner-inner' });

  // Left: identity + drill
  const main = el('div', { class: 'session-runner-main' });
  main.appendChild(el('div', { class: 'session-runner-session', text: rt.session.name }));
  main.appendChild(el('div', { class: 'session-runner-drill' }, [
    el('span', { class: 'session-runner-drill-name', text: drillDisplayName(drill) }),
    el('span', { class: 'session-runner-index', text: `Drill ${rt.currentDrillIndex + 1} of ${total}` }),
  ]));
  if (!known) {
    main.appendChild(el('div', { class: 'session-runner-warn', text: 'This tool is unavailable — skip to continue.' }));
  }
  if (next) {
    main.appendChild(el('div', { class: 'session-runner-next', text: `Next: ${drillDisplayName(next)}` }));
  } else {
    main.appendChild(el('div', { class: 'session-runner-next', text: 'Final drill' }));
  }
  if (rt.session.notes && rt.session.notes.trim()) {
    const runnerNotes = el('div', { class: 'session-runner-notes', title: rt.session.notes });
    setMarkdown(runnerNotes, rt.session.notes);
    main.appendChild(runnerNotes);
  }
  inner.appendChild(main);

  // Center: timer
  const timer = el('div', { class: 'session-runner-timer' + (rt.isPaused ? ' paused' : ''), id: 'session-timer', text: fmtClock(liveRemaining()) });
  inner.appendChild(timer);

  // Right: controls
  const controls = el('div', { class: 'session-runner-controls' });
  controls.appendChild(el('button', {
    class: 'btn sm session-details-btn', type: 'button', id: 'session-details-btn',
    'aria-haspopup': 'true', 'aria-expanded': detailsOpen ? 'true' : 'false',
    onClick: toggleDetails,
  }, [
    el('span', { text: 'Details' }),
    el('span', { class: 'session-details-caret', html: '&#9662;', 'aria-hidden': 'true' }),
  ]));
  controls.appendChild(el('button', {
    class: 'btn sm', type: 'button', id: 'session-pause',
    text: rt.isPaused ? 'Resume' : 'Pause', onClick: pauseResume,
  }));
  controls.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Skip', onClick: skipDrill }));
  controls.appendChild(el('button', {
    class: 'btn sm session-end', type: 'button', text: 'End',
    onClick: () => openConfirm('End session?', 'You can restart it any time from Home.', 'End Session', () => endSession(true)),
  }));
  inner.appendChild(controls);

  // Segmented progress across the whole session (one segment per drill) so the
  // player can read how far they are at a glance. The numeric "Drill X of Y"
  // above stays as supplemental detail.
  const segWrap = el('div', { class: 'session-runner-segments', id: 'session-segments', 'aria-hidden': 'true' });
  for (let i = 0; i < total; i++) {
    segWrap.appendChild(el('div', { class: 'session-seg' }, [el('div', { class: 'session-seg-fill' })]));
  }
  runnerBar.appendChild(inner);
  runnerBar.appendChild(segWrap);

  updateRunnerTimer(liveRemaining());
  syncRunnerOffset();
  updateDetailsDrills();
}

function updateRunnerTimer(remaining) {
  const timerEl = document.getElementById('session-timer');
  if (timerEl) {
    timerEl.textContent = fmtClock(remaining);
    timerEl.classList.toggle('paused', !!(rt && rt.isPaused));
    timerEl.classList.toggle('ending', remaining <= 5 && remaining > 0 && rt && !rt.isPaused);
  }
  const segWrap = document.getElementById('session-segments');
  if (segWrap && rt) {
    const drillFrac = rt.effectiveTotal > 0 ? (rt.effectiveTotal - remaining) / rt.effectiveTotal : 0;
    const current = rt.currentDrillIndex;
    segWrap.querySelectorAll('.session-seg-fill').forEach((segFill, i) => {
      let pct = 0;
      if (i < current) pct = 100;
      else if (i === current) pct = Math.min(100, Math.max(0, drillFrac * 100));
      segFill.style.width = `${pct}%`;
    });
  }
}

// Keep main content clear of the fixed runner bar.
function syncRunnerOffset() {
  if (!runnerBar) return;
  const h = runnerBar.offsetHeight || 0;
  document.documentElement.style.setProperty('--session-bar-h', `${h}px`);
}

// --- Session details dropdown ----------------------------------------------
// A panel anchored under the runner header that exposes the full notes, the
// complete drill list, and (the gap this fills) playback of attached
// recordings while a session is running. It is mounted on <body> outside the
// runner's re-rendered subtree so the audio player keeps playing across
// pause/resume/skip re-renders.

function ensureDetailsPanel() {
  if (detailsPanel) return detailsPanel;
  detailsPanel = el('div', {
    id: 'session-details-panel', class: 'session-details-panel',
    role: 'dialog', 'aria-label': 'Session details',
  });
  document.body.appendChild(detailsPanel);

  // Close when clicking outside the panel and its trigger.
  document.addEventListener('click', e => {
    if (!detailsOpen) return;
    if (detailsPanel.contains(e.target)) return;
    const trigger = document.getElementById('session-details-btn');
    if (trigger && trigger.contains(e.target)) return;
    closeDetails();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && detailsOpen) closeDetails();
  });
  return detailsPanel;
}

function buildDetails() {
  ensureDetailsPanel();
  detailsPanel.innerHTML = '';
  if (!rt) return;

  detailsPanel.appendChild(el('div', { class: 'session-details-head' }, [
    el('h3', { class: 'session-details-title', text: rt.session.name }),
    el('button', {
      class: 'session-dialog-close', type: 'button', 'aria-label': 'Close details',
      html: '&#10005;', onClick: closeDetails,
    }),
  ]));

  // Drills
  detailsPanel.appendChild(el('div', { class: 'session-details-label', text: 'Drills' }));
  const drillList = el('div', { class: 'session-details-drills', id: 'session-details-drills' });
  rt.session.drills.forEach((drill, i) => {
    const row = el('div', { class: 'session-details-drill-row', 'data-index': String(i) }, [
      el('span', { class: 'session-details-drill-marker', 'aria-hidden': 'true' }),
      el('span', { class: 'session-details-drill-name', text: drillDisplayName(drill) }),
      el('span', { class: 'session-details-drill-dur', text: `${clampDuration(drill.durationMinutes)} min` }),
    ]);
    drillList.appendChild(row);

    // Per-drill note (markdown), shown indented under its row.
    if (drill.notes && drill.notes.trim()) {
      const note = el('div', { class: 'session-details-drill-note' });
      setMarkdown(note, drill.notes);
      drillList.appendChild(note);
    }
  });
  detailsPanel.appendChild(drillList);

  // Notes (full, not clamped)
  if (rt.session.notes && rt.session.notes.trim()) {
    detailsPanel.appendChild(el('div', { class: 'session-details-label', text: 'Notes' }));
    const detailsNotes = el('div', { class: 'session-details-notes' });
    setMarkdown(detailsNotes, rt.session.notes);
    detailsPanel.appendChild(detailsNotes);
  }

  // Recordings / attachments with inline playback.
  detailsPanel.appendChild(el('div', { class: 'session-details-label', text: 'Recordings' }));
  const attachments = Array.isArray(rt.session.attachments) ? rt.session.attachments : [];
  if (attachments.length) {
    detailsPanel.appendChild(buildAttachmentPlayer(attachments));
  } else {
    detailsPanel.appendChild(el('div', {
      class: 'session-details-empty',
      text: 'No recordings attached. Add audio to this session from the editor.',
    }));
  }

  detailsBuilt = true;
  updateDetailsDrills();
}

// Reflects the current/completed drill state onto the already-built list.
function updateDetailsDrills() {
  if (!detailsBuilt || !detailsPanel || !rt) return;
  const rows = detailsPanel.querySelectorAll('.session-details-drill-row');
  rows.forEach(row => {
    const i = Number(row.getAttribute('data-index'));
    const drill = rt.session.drills[i];
    const done = drill && rt.completedDrillIds.includes(drill.id);
    row.classList.toggle('current', i === rt.currentDrillIndex);
    row.classList.toggle('done', !!done && i !== rt.currentDrillIndex);
  });
}

function openDetails() {
  ensureDetailsPanel();
  if (!detailsBuilt) buildDetails();
  detailsOpen = true;
  detailsPanel.classList.add('open');
  const trigger = document.getElementById('session-details-btn');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeDetails() {
  detailsOpen = false;
  if (detailsPanel) detailsPanel.classList.remove('open');
  const trigger = document.getElementById('session-details-btn');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function toggleDetails() {
  if (detailsOpen) closeDetails();
  else openDetails();
}

// Tear down the panel + any playing attachment audio when a run ends.
function resetDetails() {
  closeDetails();
  detailsBuilt = false;
  stopCardAudio();
  if (detailsPanel) detailsPanel.innerHTML = '';
}

function transitionCue() {
  // Subtle two-note chime to signal the drill change.
  try {
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch (e) {
    /* audio is best-effort */
  }
  if (runnerBar) {
    runnerBar.classList.remove('session-flash');
    // reflow to restart the animation
    void runnerBar.offsetWidth;
    runnerBar.classList.add('session-flash');
  }
}

// =========================================================================
// COMPLETE SCREEN
// =========================================================================

function showComplete(summary) {
  const dialog = el('div', { class: 'session-dialog session-complete' });
  dialog.appendChild(el('div', { class: 'session-complete-badge', html: summary.completed ? '&#10003;' : '&#9209;' }));
  dialog.appendChild(el('h3', { class: 'session-dialog-title', text: summary.completed ? 'Session complete' : 'Session ended' }));
  dialog.appendChild(el('p', { class: 'session-dialog-body', text: summary.name }));

  const stats = el('div', { class: 'session-complete-stats' }, [
    el('div', { class: 'session-stat' }, [
      el('div', { class: 'session-stat-val', text: fmtClock(summary.secondsCompleted) }),
      el('div', { class: 'session-stat-label', text: 'Time completed' }),
    ]),
    el('div', { class: 'session-stat' }, [
      el('div', { class: 'session-stat-val', text: `${summary.completedDrills} / ${summary.totalDrills}` }),
      el('div', { class: 'session-stat-label', text: 'Drills completed' }),
    ]),
  ]);
  dialog.appendChild(stats);

  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Back Home',
    onClick: () => { closeModal(); if (typeof showSectionFn === 'function') showSectionFn('home'); },
  }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: 'Restart Session',
    onClick: () => { closeModal(); startSession(summary.sessionId); },
  }));
  dialog.appendChild(actions);

  openModal(dialog, { onClose: () => { if (typeof showSectionFn === 'function') showSectionFn('home'); } });
}

// =========================================================================
// RESUME PROMPT (after refresh)
// =========================================================================

function maybeResume() {
  const active = getActiveSession();
  if (!active) return;
  const session = getSession(active.sessionId);
  if (!session || session.drills.length === 0) {
    clearActiveSession();
    return;
  }

  const dialog = el('div', { class: 'session-dialog session-resume' });
  dialog.appendChild(el('h3', { class: 'session-dialog-title', text: 'Resume session?' }));
  dialog.appendChild(el('p', {
    class: 'session-dialog-body',
    text: `“${session.name}” was still running. Pick up where you left off?`,
  }));
  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Discard',
    onClick: () => { clearActiveSession(); closeModal(); renderHome(); },
  }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: 'Resume',
    onClick: () => { closeModal(); startSession(active.sessionId, active); },
  }));
  dialog.appendChild(actions);
  openModal(dialog);
}

// =========================================================================
// VISIBILITY: keep the timer truthful when the tab was backgrounded.
// =========================================================================

function onVisibility() {
  if (document.visibilityState === 'visible' && rt) {
    onTick();
  }
}

// =========================================================================
// INIT
// =========================================================================

export function initSessions(config) {
  showSectionFn = config.showSection;
  icons = config.icons || {};

  // Allow the Exercises view to refresh session cards after an exercise is deleted.
  window.musiRefreshSessions = renderHome;

  // Wire the home Create button + persist active timer through tab churn.
  const createBtn = document.getElementById('home-sessions-create');
  if (createBtn) createBtn.onclick = () => openEditor(null);

  const emptyCreate = document.getElementById('home-sessions-empty-create');
  if (emptyCreate) emptyCreate.onclick = () => openEditor(null);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => { if (rt) persistActive(); });

  // Ask the browser to keep saved-audio (IndexedDB) durable across PWA/browser
  // sessions so it isn't evicted under storage pressure. Best-effort.
  if (attachmentsSupported()) ensurePersistentStorage();

  renderHome();
  maybeResume();
}

export { startSession, openEditor };
