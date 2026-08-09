// Practice Routines UI for Musi. Ordered sessions with workbook attachments,
// per-session metronome, notes, and JSON export/import.

import {
  listRoutines,
  getRoutine,
  createRoutine,
  renameRoutine,
  setRoutineDescription,
  deleteRoutine,
  duplicateRoutine,
  addRoutineSession,
  updateRoutineSession,
  deleteRoutineSession,
  moveRoutineSession,
  setActiveRoutineSession,
  attachWorkbooksToSession,
  detachWorkbookFromSession,
  moveSessionWorkbook,
  pruneMissingWorkbooks,
  getRoutineStats,
  buildRoutineExport,
  applyRoutineImport,
  serializeRoutineExport,
  routineExportFilename,
  SESSION_SUBDIVISIONS,
} from './routineModel.js';
import {
  createRoutineMetronome,
  ROUTINE_METRONOME_SUBDIVISIONS,
} from './routineMetronome.js';
import {
  listWorkbooks,
  getWorkbook,
  createWorkbook,
} from './workbookModel.js';
import { requestWorkbookOpen } from './workbooks.js';
import { getExercises } from './exercises.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import { metro, stopMetronome } from './metronome.js';

const NAME_LIMIT = 120;
const AUTOSAVE_MS = 700;
const BPM_MIN = 30;
const BPM_MAX = 300;

const SUBDIV_LABEL = new Map(SESSION_SUBDIVISIONS.map(s => [s.id, s.label]));

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

let bound = false;
let escapeWired = false;
let selectedRoutineId = null;
let openSessionId = null;

let routineListEl, titleEl, toolbarActionsEl, statusEl, workspaceEl;
let overviewEl, sessionListEl;
let sessionPaneEl, sessionTitleEl, sessionActionsEl, sessionBodyEl, sessionBackBtn;
let newBtn, importBtn, exportAllBtn, importFileEl;

let dialogRoot = null;
let sessionMetronome = null;
let sessionMetronomeKey = null;
let routineNowPlaying = false;
let lastBeatDetail = null;
let beatDotsEl = null;
let tapTimes = [];

let descAutosaveTimer = null;
let notesAutosaveTimer = null;
let descSavedEl = null;
let notesSavedEl = null;
let descRoutineId = null;
let notesSessionKey = null;

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function isRoutinesSectionActive() {
  const sec = document.getElementById('sec-routines');
  return sec && sec.classList.contains('active');
}

function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : (pluralWord || `${singular}s`)}`;
}

function formatRoutineMeta(stats) {
  const parts = [
    plural(stats.sessionCount, 'session'),
    plural(stats.uniqueWorkbookCount, 'workbook'),
  ];
  if (stats.totalMinutes > 0) parts.push(`${stats.totalMinutes} min`);
  return parts.join(' · ');
}

function subdivLabel(id) {
  return SUBDIV_LABEL.get(id) || '4ths';
}

function formatSessionMeta(session) {
  const parts = [];
  const wbCount = session.workbookIds?.length || 0;
  parts.push(plural(wbCount, 'workbook'));
  if (session.durationMin != null) parts.push(`${session.durationMin} min`);
  const m = session.metronome || {};
  parts.push(`${m.bpm || 100} BPM · ${m.beats || 4}/4 · ${subdivLabel(m.subdiv)}`);
  return parts.join(' · ');
}

function sessionKey(routineId, sessionId) {
  return `${routineId}:${sessionId}`;
}

function destroySessionMetronome() {
  if (sessionMetronome) {
    sessionMetronome.stop();
    sessionMetronome.destroy();
    sessionMetronome = null;
    sessionMetronomeKey = null;
  }
  beatDotsEl = null;
  lastBeatDetail = null;
  tapTimes = [];
  if (routineNowPlaying) {
    hideNowPlaying();
    routineNowPlaying = false;
  }
}

// Subdivision clicks land between beats; letting them move the marker would
// blink it off mid-beat, so only the beat itself advances the dots.
function updateBeatDots(detail) {
  if (detail && detail.sub !== 0) return;
  lastBeatDetail = detail;
  if (!beatDotsEl) return;
  beatDotsEl.querySelectorAll('.rt-beat-dot').forEach((dot, i) => {
    dot.classList.toggle('current', !!detail && detail.beat === i);
  });
}

function markAccentDot(accentFirst) {
  if (!beatDotsEl) return;
  beatDotsEl.querySelectorAll('.rt-beat-dot').forEach((dot, i) => {
    dot.classList.toggle('accent', accentFirst && i === 0);
  });
}

function ensureSessionMetronome(routineId, sessionId, config, sessionName) {
  const key = sessionKey(routineId, sessionId);
  if (sessionMetronome && sessionMetronomeKey !== key) {
    destroySessionMetronome();
  }
  if (!sessionMetronome) {
    sessionMetronome = createRoutineMetronome({
      ...config,
      onBeat: (detail) => {
        if (!isRoutinesSectionActive()) return;
        updateBeatDots(detail);
      },
      onStateChange: (playing) => {
        if (!isRoutinesSectionActive()) return;
        syncPlayButton(playing);
        if (playing) return;
        updateBeatDots(null);
        if (routineNowPlaying) {
          hideNowPlaying();
          routineNowPlaying = false;
        }
      },
    });
    sessionMetronomeKey = key;
    routineNowPlaying = false;
  } else {
    sessionMetronome.setConfig(config);
  }
  return sessionMetronome;
}

let playBtnRef = null;

function syncPlayButton(playing) {
  if (!playBtnRef) return;
  playBtnRef.textContent = playing ? 'Stop' : 'Play';
  playBtnRef.classList.toggle('primary', !playing);
}

function navigateToWorkbooks() {
  if (typeof window.showSection === 'function') window.showSection('workbooks');
  else location.hash = '#workbooks';
}

function downloadRoutineExport(envelope) {
  const text = serializeRoutineExport(envelope);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = routineExportFilename(envelope);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- modals ------------------------------------------------------------------

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = el('div', { id: 'rt-dialog-root' });
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openConfirm(title, body, confirmLabel, onConfirm, { danger = false } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: title }),
    body ? el('p', { class: 'modal-body', text: body }) : null,
  ]);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', {
    class: danger ? 'btn modal-danger' : 'btn primary',
    type: 'button',
    text: confirmLabel,
    onClick: () => { closeDialog(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function openPrompt(title, initialValue, confirmLabel, onConfirm, { maxlength = NAME_LIMIT } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  const input = el('input', {
    type: 'text', class: 'modal-input', value: initialValue || '', maxlength: String(maxlength),
  });
  dialog.appendChild(input);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { const v = input.value; closeDialog(); onConfirm(v); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  // Keep Enter/Escape inside the dialog — the section-level Escape handler
  // would otherwise also close the open session pane behind it.
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.stopPropagation();
    const v = input.value;
    closeDialog();
    if (e.key === 'Enter') onConfirm(v);
  });
  dialogRoot.appendChild(overlay);
  setTimeout(() => { input.focus(); input.select(); }, 40);
}

function openSheet(title, contentNode, { onClose } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  let escHandler = null;
  const finish = () => {
    if (escHandler) document.removeEventListener('keydown', escHandler);
    closeDialog();
    onClose?.();
  };
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog rt-picker-sheet' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  dialog.appendChild(contentNode);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  escHandler = (e) => {
    if (e.key === 'Escape') finish();
  };
  document.addEventListener('keydown', escHandler);
  dialogRoot.appendChild(overlay);
  return { close: finish };
}

// --- autosave ----------------------------------------------------------------

function setDescSavedState(cls, text) {
  if (!descSavedEl) return;
  descSavedEl.className = 'rt-saved' + (cls ? ` ${cls}` : '');
  descSavedEl.textContent = text || '';
}

function setNotesSavedState(cls, text) {
  if (!notesSavedEl) return;
  notesSavedEl.className = 'rt-saved' + (cls ? ` ${cls}` : '');
  notesSavedEl.textContent = text || '';
}

function flushDescAutosave() {
  if (descAutosaveTimer) { clearTimeout(descAutosaveTimer); descAutosaveTimer = null; }
  if (!descRoutineId || !overviewEl) return;
  const textarea = overviewEl.querySelector('.rt-overview-desc');
  if (!textarea) return;
  const rt = getRoutine(descRoutineId);
  if (!rt) return;
  const next = textarea.value;
  if (next === rt.description) {
    setDescSavedState('saved', 'Saved');
    return;
  }
  setRoutineDescription(descRoutineId, next);
  setDescSavedState('saved', 'Saved');
}

function flushNotesAutosave() {
  if (notesAutosaveTimer) { clearTimeout(notesAutosaveTimer); notesAutosaveTimer = null; }
  if (!notesSessionKey || !sessionBodyEl) return;
  const [routineId, sessionId] = notesSessionKey.split(':');
  const textarea = sessionBodyEl.querySelector('.rt-notes');
  if (!textarea) return;
  const rt = getRoutine(routineId);
  const session = rt?.sessions.find(s => s.id === sessionId);
  if (!session) return;
  const next = textarea.value;
  if (next === session.notes) {
    setNotesSavedState('saved', 'Saved');
    return;
  }
  updateRoutineSession(routineId, sessionId, { notes: next });
  setNotesSavedState('saved', 'Saved');
}

function scheduleDescAutosave() {
  setDescSavedState('dirty', 'Saving\u2026');
  if (descAutosaveTimer) clearTimeout(descAutosaveTimer);
  descAutosaveTimer = setTimeout(flushDescAutosave, AUTOSAVE_MS);
}

function scheduleNotesAutosave() {
  setNotesSavedState('dirty', 'Saving\u2026');
  if (notesAutosaveTimer) clearTimeout(notesAutosaveTimer);
  notesAutosaveTimer = setTimeout(flushNotesAutosave, AUTOSAVE_MS);
}

// --- session pane lifecycle --------------------------------------------------

function closeSessionPane() {
  flushNotesAutosave();
  destroySessionMetronome();
  openSessionId = null;
  if (sessionPaneEl) sessionPaneEl.hidden = true;
  if (workspaceEl) workspaceEl.classList.remove('is-open');
}

function openSession(routineId, sessionId) {
  flushNotesAutosave();
  const rt = getRoutine(routineId);
  const session = rt?.sessions.find(s => s.id === sessionId);
  if (!rt || !session) {
    openSessionId = null;
    return;
  }
  if (openSessionId !== sessionId) destroySessionMetronome();
  openSessionId = sessionId;
  selectedRoutineId = routineId;
  setActiveRoutineSession(routineId, sessionId);
  if (sessionPaneEl) sessionPaneEl.hidden = false;
  if (workspaceEl) workspaceEl.classList.add('is-open');
  render();
}

function validateSelection() {
  if (selectedRoutineId && !getRoutine(selectedRoutineId)) {
    selectedRoutineId = null;
    openSessionId = null;
  }
  if (selectedRoutineId && openSessionId) {
    const rt = getRoutine(selectedRoutineId);
    if (!rt || !rt.sessions.some(s => s.id === openSessionId)) {
      openSessionId = null;
      if (sessionPaneEl) sessionPaneEl.hidden = true;
      if (workspaceEl) workspaceEl.classList.remove('is-open');
    }
  }
}

function tapTempo(onBpm) {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
  tapTimes.push(now);
  if (tapTimes.length > 5) tapTimes.shift();
  if (tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
    const recent = intervals.slice(-4);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    onBpm(Math.round(60000 / avg));
  }
}

function persistMetronome(routineId, sessionId, patch) {
  const rt = getRoutine(routineId);
  const session = rt?.sessions.find(s => s.id === sessionId);
  if (!session) return;
  const merged = { ...session.metronome, ...patch };
  updateRoutineSession(routineId, sessionId, { metronome: merged });
  if (sessionMetronome && sessionMetronomeKey === sessionKey(routineId, sessionId)) {
    sessionMetronome.setConfig(merged);
  }
}

// --- render: sidebar ---------------------------------------------------------

function renderSidebar() {
  if (!routineListEl) return;
  routineListEl.innerHTML = '';
  const routines = listRoutines();
  if (!routines.length) {
    routineListEl.appendChild(el('div', {
      class: 'rt-empty',
      text: 'No routines yet. Create your first practice plan.',
    }));
    return;
  }
  routines.forEach(rt => {
    const stats = getRoutineStats(rt);
    const row = el('button', {
      type: 'button',
      class: 'rt-routine-item' + (selectedRoutineId === rt.id ? ' is-active' : ''),
      'aria-pressed': selectedRoutineId === rt.id ? 'true' : 'false',
      onClick: () => {
        if (selectedRoutineId !== rt.id) {
          flushDescAutosave();
          flushNotesAutosave();
          closeSessionPane();
        }
        selectedRoutineId = rt.id;
        render();
      },
    });
    row.appendChild(el('span', { class: 'rt-routine-name', text: rt.name }));
    row.appendChild(el('span', { class: 'rt-routine-meta', text: formatRoutineMeta(stats) }));
    routineListEl.appendChild(row);
  });
}

// --- render: toolbar ---------------------------------------------------------

function renderToolbar() {
  if (titleEl) {
    const rt = selectedRoutineId ? getRoutine(selectedRoutineId) : null;
    titleEl.textContent = rt ? rt.name : 'Routines';
  }
  if (!toolbarActionsEl) return;
  toolbarActionsEl.innerHTML = '';
  const rt = selectedRoutineId ? getRoutine(selectedRoutineId) : null;
  if (!rt) return;

  toolbarActionsEl.appendChild(el('button', {
    class: 'btn sm primary', type: 'button', text: '+ Add Session',
    onClick: () => {
      const n = rt.sessions.length + 1;
      const session = addRoutineSession(rt.id, { name: `Session ${n}` });
      if (session) {
        openSession(rt.id, session.id);
        setStatus('Session added.');
      }
    },
  }));
  toolbarActionsEl.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Rename',
    onClick: () => {
      openPrompt('Rename routine', rt.name, 'Save', (name) => {
        if (renameRoutine(rt.id, name)) {
          setStatus('Routine renamed.');
          render();
        }
      });
    },
  }));
  toolbarActionsEl.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Export',
    onClick: () => {
      const envelope = buildRoutineExport({
        routineIds: [rt.id],
        resolveWorkbook: (id) => getWorkbook(id),
      });
      downloadRoutineExport(envelope);
      setStatus('Routine exported.');
    },
  }));
  toolbarActionsEl.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Duplicate',
    onClick: () => {
      const copy = duplicateRoutine(rt.id);
      if (copy) {
        selectedRoutineId = copy.id;
        closeSessionPane();
        setStatus('Routine duplicated.');
        render();
      }
    },
  }));
  toolbarActionsEl.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Delete',
    onClick: () => {
      openConfirm(
        `Delete "${rt.name}"?`,
        'This removes the routine and all its sessions from this device.',
        'Delete',
        () => {
          if (openSessionId) closeSessionPane();
          if (selectedRoutineId === rt.id) selectedRoutineId = null;
          deleteRoutine(rt.id);
          setStatus('Routine deleted.');
          render();
        },
        { danger: true },
      );
    },
  }));
}

// --- render: overview --------------------------------------------------------

function renderOverview() {
  if (!overviewEl || !sessionListEl) return;
  flushDescAutosave();
  overviewEl.innerHTML = '';
  sessionListEl.innerHTML = '';

  const rt = selectedRoutineId ? getRoutine(selectedRoutineId) : null;
  if (!rt) {
    const empty = el('div', { class: 'rt-empty' });
    empty.appendChild(document.createTextNode('Select a routine or create one to plan your practice sessions.'));
    empty.appendChild(el('button', {
      class: 'btn sm primary', type: 'button', text: '+ New Routine',
      onClick: onNewRoutine,
    }));
    overviewEl.appendChild(empty);
    return;
  }

  const stats = getRoutineStats(rt);
  overviewEl.appendChild(el('div', { class: 'rt-overview-name', text: rt.name }));

  const descWrap = el('div', { class: 'rt-overview-desc-wrap' });
  descRoutineId = rt.id;
  const descArea = el('textarea', {
    class: 'rt-overview-desc',
    'aria-label': 'Routine description',
    placeholder: 'Describe this routine\u2026',
  });
  descArea.value = rt.description || '';
  descArea.addEventListener('input', scheduleDescAutosave);
  descWrap.appendChild(descArea);
  descSavedEl = el('span', { class: 'rt-saved saved', text: 'Saved' });
  descWrap.appendChild(descSavedEl);
  overviewEl.appendChild(descWrap);

  const chips = el('div', { class: 'rt-stats' });
  chips.appendChild(el('span', { class: 'rt-stat-chip', text: plural(stats.sessionCount, 'session') }));
  chips.appendChild(el('span', { class: 'rt-stat-chip', text: plural(stats.uniqueWorkbookCount, 'workbook') }));
  if (stats.totalMinutes > 0) {
    chips.appendChild(el('span', { class: 'rt-stat-chip', text: `${stats.totalMinutes} min total` }));
  }
  overviewEl.appendChild(chips);

  if (!rt.sessions.length) {
    sessionListEl.appendChild(el('div', {
      class: 'rt-empty',
      text: 'No sessions yet. Add your first session from the toolbar.',
    }));
    return;
  }

  rt.sessions.forEach((session, idx) => {
    sessionListEl.appendChild(buildSessionCard(rt, session, idx));
  });
}

function buildSessionCard(rt, session, idx) {
  const card = el('div', { class: 'rt-session-card' });
  card.appendChild(el('span', { class: 'rt-session-step', text: String(idx + 1) }));

  const body = el('div', {
    class: 'rt-session-card-body',
    onClick: () => openSession(rt.id, session.id),
  });
  body.appendChild(el('span', { class: 'rt-session-card-name', text: session.name }));
  body.appendChild(el('span', { class: 'rt-session-card-meta', text: formatSessionMeta(session) }));
  card.appendChild(body);

  const actions = el('div', { class: 'rt-session-card-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: '\u2191', 'aria-label': 'Move session up', title: 'Move up',
    disabled: idx === 0 ? 'true' : undefined,
    onClick: (e) => {
      e.stopPropagation();
      if (moveRoutineSession(rt.id, session.id, -1)) render();
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: '\u2193', 'aria-label': 'Move session down', title: 'Move down',
    disabled: idx === rt.sessions.length - 1 ? 'true' : undefined,
    onClick: (e) => {
      e.stopPropagation();
      if (moveRoutineSession(rt.id, session.id, 1)) render();
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm primary', type: 'button', text: 'Open',
    onClick: (e) => { e.stopPropagation(); openSession(rt.id, session.id); },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Delete', 'aria-label': `Delete ${session.name}`,
    onClick: (e) => {
      e.stopPropagation();
      openConfirm(
        `Delete "${session.name}"?`,
        'This session and its settings will be removed.',
        'Delete',
        () => {
          if (openSessionId === session.id) closeSessionPane();
          deleteRoutineSession(rt.id, session.id);
          setStatus('Session deleted.');
          render();
        },
        { danger: true },
      );
    },
  }));
  card.appendChild(actions);
  return card;
}

// --- render: session pane ----------------------------------------------------

function renderSessionPane() {
  if (!sessionPaneEl || !sessionBodyEl) return;
  // Rebuilding the body replaces the notes textarea, so commit any pending edit first.
  flushNotesAutosave();
  if (!openSessionId || !selectedRoutineId) {
    sessionPaneEl.hidden = true;
    if (workspaceEl) workspaceEl.classList.remove('is-open');
    return;
  }

  const rt = getRoutine(selectedRoutineId);
  const session = rt?.sessions.find(s => s.id === openSessionId);
  if (!rt || !session) {
    closeSessionPane();
    return;
  }

  sessionPaneEl.hidden = false;
  if (workspaceEl) workspaceEl.classList.add('is-open');

  const idx = rt.sessions.findIndex(s => s.id === session.id);
  if (sessionTitleEl) {
    sessionTitleEl.textContent = `Step ${idx + 1} \u00b7 ${session.name}`;
  }

  if (sessionActionsEl) {
    sessionActionsEl.innerHTML = '';
    sessionActionsEl.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Rename',
      onClick: () => {
        openPrompt('Rename session', session.name, 'Save', (name) => {
          if (updateRoutineSession(rt.id, session.id, { name })) {
            setStatus('Session renamed.');
            render();
          }
        });
      },
    }));
    sessionActionsEl.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Delete',
      onClick: () => {
        openConfirm(
          `Delete "${session.name}"?`,
          'This session and its settings will be removed.',
          'Delete',
          () => {
            closeSessionPane();
            deleteRoutineSession(rt.id, session.id);
            setStatus('Session deleted.');
            render();
          },
          { danger: true },
        );
      },
    }));
  }

  sessionBodyEl.innerHTML = '';
  sessionBodyEl.appendChild(renderMetronomeCard(rt, session));
  sessionBodyEl.appendChild(renderWorkbooksCard(rt, session));
  sessionBodyEl.appendChild(renderNotesCard(rt, session));
}

function renderMetronomeCard(rt, session) {
  const card = el('div', { class: 'rt-card' });
  card.appendChild(el('div', { class: 'rt-card-title', text: 'Metronome' }));
  const m = session.metronome || {};

  const bpmRow = el('div', { class: 'rt-metro-bpm-row' });
  const readout = el('span', { class: 'rt-metro-bpm-readout', text: String(m.bpm || 100) });
  bpmRow.appendChild(readout);

  const bpmInput = el('input', {
    type: 'number', class: 'rt-metro-bpm-input', min: String(BPM_MIN), max: String(BPM_MAX),
    value: String(m.bpm || 100), 'aria-label': 'BPM',
  });
  const slider = el('input', {
    type: 'range', class: 'rt-metro-slider', min: String(BPM_MIN), max: String(BPM_MAX),
    value: String(m.bpm || 100), 'aria-label': 'BPM slider',
  });

  // Dragging the slider fires continuously, so the library meta only refreshes
  // once the value settles.
  function applyBpm(val, { refreshMeta = true } = {}) {
    const n = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(Number(val) || m.bpm)));
    bpmInput.value = String(n);
    slider.value = String(n);
    readout.textContent = String(n);
    persistMetronome(rt.id, session.id, { bpm: n });
    if (refreshMeta) refreshLibraryMeta();
  }

  bpmInput.addEventListener('change', () => applyBpm(bpmInput.value));
  slider.addEventListener('input', () => applyBpm(slider.value, { refreshMeta: false }));
  slider.addEventListener('change', () => applyBpm(slider.value));

  const stepBtns = el('div', { class: 'rt-metro-step-btns' });
  stepBtns.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: '\u2212', 'aria-label': 'Decrease BPM',
    onClick: () => applyBpm((Number(bpmInput.value) || m.bpm) - 1),
  }));
  stepBtns.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: '+', 'aria-label': 'Increase BPM',
    onClick: () => applyBpm((Number(bpmInput.value) || m.bpm) + 1),
  }));

  bpmRow.appendChild(bpmInput);
  bpmRow.appendChild(slider);
  bpmRow.appendChild(stepBtns);
  card.appendChild(bpmRow);

  card.appendChild(el('button', {
    class: 'btn sm rt-metro-tap', type: 'button', text: 'Tap tempo',
    onClick: () => tapTempo(applyBpm),
  }));

  const beatsField = el('div', { class: 'rt-metro-seg metro-seg-field' });
  beatsField.appendChild(el('span', { class: 'metro-seg-label', text: 'Beats per bar' }));
  const beatsRow = el('div', { class: 'seg-row metro-seg' });
  for (let b = 1; b <= 12; b++) {
    beatsRow.appendChild(el('button', {
      type: 'button',
      class: 'seg-btn' + ((m.beats || 4) === b ? ' active' : ''),
      text: String(b),
      onClick: () => {
        persistMetronome(rt.id, session.id, { beats: b });
        renderSessionPane();
        refreshLibraryMeta();
      },
    }));
  }
  beatsField.appendChild(beatsRow);
  card.appendChild(beatsField);

  const subdivField = el('div', { class: 'rt-metro-seg metro-seg-field' });
  subdivField.appendChild(el('span', { class: 'metro-seg-label', text: 'Subdivision' }));
  const subdivRow = el('div', { class: 'seg-row metro-seg' });
  ROUTINE_METRONOME_SUBDIVISIONS.forEach(opt => {
    subdivRow.appendChild(el('button', {
      type: 'button',
      class: 'seg-btn' + ((m.subdiv || 'quarter') === opt.id ? ' active' : ''),
      text: opt.label,
      onClick: () => {
        persistMetronome(rt.id, session.id, { subdiv: opt.id });
        renderSessionPane();
        refreshLibraryMeta();
      },
    }));
  });
  subdivField.appendChild(subdivRow);
  card.appendChild(subdivField);

  const accentLabel = el('label', { class: 'rt-metro-accent' });
  const accentCb = el('input', { type: 'checkbox' });
  accentCb.checked = m.accentFirst !== false;
  accentCb.addEventListener('change', () => {
    persistMetronome(rt.id, session.id, { accentFirst: accentCb.checked });
    markAccentDot(accentCb.checked);
  });
  accentLabel.appendChild(accentCb);
  accentLabel.appendChild(document.createTextNode('Accent first beat'));
  card.appendChild(accentLabel);

  const playRow = el('div', { class: 'rt-metro-play-row' });
  const engine = ensureSessionMetronome(rt.id, session.id, m, session.name);
  const playing = engine.isPlaying();
  playBtnRef = el('button', {
    class: 'btn sm' + (playing ? '' : ' primary'),
    type: 'button',
    text: playing ? 'Stop' : 'Play',
    onClick: () => {
      if (engine.isPlaying()) {
        engine.stop();
      } else {
        if (metro.playing) stopMetronome();
        showNowPlaying(`Routine \u2014 ${session.name}`, () => engine.stop());
        routineNowPlaying = true;
        engine.start();
      }
    },
  });
  playRow.appendChild(playBtnRef);

  const durationWrap = el('div', { class: 'rt-metro-duration' });
  durationWrap.appendChild(document.createTextNode('Target duration (min)'));
  const durationInput = el('input', {
    type: 'number', min: '1', max: '600', placeholder: 'None',
    'aria-label': 'Target duration in minutes',
    value: session.durationMin != null ? String(session.durationMin) : '',
  });
  durationInput.addEventListener('change', () => {
    const raw = durationInput.value.trim();
    updateRoutineSession(rt.id, session.id, {
      durationMin: raw ? Number(raw) : null,
    });
    refreshLibraryMeta();
  });
  durationWrap.appendChild(durationInput);
  playRow.appendChild(durationWrap);
  card.appendChild(playRow);

  beatDotsEl = el('div', { class: 'rt-beat-dots', 'aria-label': 'Beat indicator' });
  const beats = m.beats || 4;
  for (let i = 0; i < beats; i++) {
    beatDotsEl.appendChild(el('span', {
      class: 'rt-beat-dot' + (i === 0 && m.accentFirst !== false ? ' accent' : ''),
    }));
  }
  if (lastBeatDetail && sessionMetronomeKey === sessionKey(rt.id, session.id)) {
    updateBeatDots(lastBeatDetail);
  }
  card.appendChild(beatDotsEl);

  return card;
}

function renderWorkbooksCard(rt, session) {
  const card = el('div', { class: 'rt-card' });
  card.appendChild(el('div', { class: 'rt-card-title', text: 'Workbooks' }));

  const list = el('div', { class: 'rt-wb-list' });
  const ids = session.workbookIds || [];

  if (!ids.length) {
    const empty = el('div', { class: 'rt-wb-empty' });
    if (!listWorkbooks().length) {
      empty.appendChild(document.createTextNode('No workbooks yet. '));
      empty.appendChild(el('a', { href: '#workbooks', text: 'Open Workbooks' }));
      empty.appendChild(document.createTextNode(' to create one.'));
    } else {
      empty.textContent = 'No workbooks attached. Add one below.';
    }
    list.appendChild(empty);
  } else {
    ids.forEach((wbId, idx) => {
      const wb = getWorkbook(wbId);
      const row = el('div', { class: 'rt-wb-row' + (wb ? '' : ' missing') });
      const body = el('div', { class: 'rt-wb-row-body' });
      if (wb) {
        body.appendChild(el('span', { class: 'rt-wb-row-name', text: wb.name }));
        body.appendChild(el('span', {
          class: 'rt-wb-row-meta',
          text: plural(wb.entries?.length || 0, 'exercise'),
        }));
      } else {
        body.appendChild(el('span', { class: 'rt-wb-row-name', text: 'Missing workbook' }));
        body.appendChild(el('span', { class: 'rt-wb-row-meta', text: 'No longer on this device' }));
      }
      row.appendChild(body);

      const actions = el('div', { class: 'rt-wb-row-actions' });
      if (wb) {
        actions.appendChild(el('button', {
          class: 'btn sm', type: 'button', text: '\u2191', 'aria-label': 'Move up', title: 'Move up',
          disabled: idx === 0 ? 'true' : undefined,
          onClick: () => {
            if (moveSessionWorkbook(rt.id, session.id, wbId, -1)) renderSessionPane();
          },
        }));
        actions.appendChild(el('button', {
          class: 'btn sm', type: 'button', text: '\u2193', 'aria-label': 'Move down', title: 'Move down',
          disabled: idx === ids.length - 1 ? 'true' : undefined,
          onClick: () => {
            if (moveSessionWorkbook(rt.id, session.id, wbId, 1)) renderSessionPane();
          },
        }));
        actions.appendChild(el('button', {
          class: 'btn sm primary', type: 'button', text: 'Practice',
          onClick: () => {
            requestWorkbookOpen(wbId);
            navigateToWorkbooks();
          },
        }));
      }
      actions.appendChild(el('button', {
        class: 'btn sm', type: 'button', text: 'Remove',
        onClick: () => {
          detachWorkbookFromSession(rt.id, session.id, wbId);
          render();
        },
      }));
      row.appendChild(actions);
      list.appendChild(row);
    });
  }
  card.appendChild(list);

  card.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: '+ Add workbooks',
    onClick: () => openWorkbookPicker(rt, session),
  }));

  return card;
}

function openWorkbookPicker(rt, session) {
  const all = listWorkbooks();
  const attached = new Set(session.workbookIds || []);
  const rowCheckboxes = new Map();

  const picker = el('div', { class: 'rt-picker' });
  const listHost = el('div', { class: 'rt-picker-list' });
  picker.appendChild(listHost);

  const foot = el('div', { class: 'rt-picker-foot' });
  const countLabel = el('span', { class: 'rt-picker-count', text: `${attached.size} selected` });
  const confirmBtn = el('button', { class: 'btn primary', type: 'button', text: 'Apply' });
  foot.appendChild(countLabel);
  foot.appendChild(confirmBtn);
  picker.appendChild(foot);

  function updateCount() {
    let n = 0;
    rowCheckboxes.forEach(cb => { if (cb.checked) n++; });
    countLabel.textContent = `${n} selected`;
  }

  function renderList() {
    listHost.innerHTML = '';
    if (!all.length) {
      const empty = el('div', { class: 'rt-picker-empty' });
      empty.appendChild(document.createTextNode('No workbooks yet. '));
      empty.appendChild(el('a', { href: '#workbooks', text: 'Open Workbooks' }));
      empty.appendChild(document.createTextNode(' to create one.'));
      listHost.appendChild(empty);
      return;
    }
    all.forEach(wb => {
      const row = el('label', { class: 'rt-picker-row' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = attached.has(wb.id);
      cb.addEventListener('change', updateCount);
      rowCheckboxes.set(wb.id, cb);
      row.appendChild(cb);
      const body = el('div', { class: 'rt-picker-row-body' });
      body.appendChild(el('span', { class: 'rt-picker-row-name', text: wb.name }));
      body.appendChild(el('span', {
        class: 'rt-picker-row-meta',
        text: plural(wb.entries?.length || 0, 'exercise'),
      }));
      row.appendChild(body);
      listHost.appendChild(row);
    });
  }

  renderList();

  confirmBtn.addEventListener('click', () => {
    const next = new Set();
    rowCheckboxes.forEach((cb, id) => { if (cb.checked) next.add(id); });
    const current = new Set(session.workbookIds || []);
    const toAdd = [...next].filter(id => !current.has(id));
    const toRemove = [...current].filter(id => !next.has(id));
    if (toAdd.length) attachWorkbooksToSession(rt.id, session.id, toAdd);
    toRemove.forEach(id => detachWorkbookFromSession(rt.id, session.id, id));
    sheet.close();
    render();
    if (toAdd.length || toRemove.length) setStatus('Workbooks updated.');
  });

  const sheet = openSheet('Add workbooks', picker);
}

function renderNotesCard(rt, session) {
  const card = el('div', { class: 'rt-card' });
  card.appendChild(el('div', { class: 'rt-card-title', text: 'Notes' }));
  notesSessionKey = sessionKey(rt.id, session.id);
  const notesArea = el('textarea', {
    class: 'rt-notes',
    'aria-label': 'Session notes',
    placeholder: 'Practice notes for this session\u2026',
  });
  notesArea.value = session.notes || '';
  notesArea.addEventListener('input', scheduleNotesAutosave);
  card.appendChild(notesArea);
  notesSavedEl = el('span', { class: 'rt-saved saved', text: 'Saved' });
  card.appendChild(notesSavedEl);
  return card;
}

// --- actions -----------------------------------------------------------------

function onNewRoutine() {
  openPrompt('New routine', '', 'Create', (name) => {
    const clean = (name || '').trim();
    if (!clean) {
      setStatus('Enter a routine name.', true);
      return;
    }
    const rt = createRoutine({ name: clean });
    selectedRoutineId = rt.id;
    closeSessionPane();
    setStatus('Routine created.');
    render();
  });
}

async function onImportFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const result = applyRoutineImport(text, {
      existingWorkbooks: listWorkbooks(),
      createWorkbook: ({ name, exerciseIds }) => {
        const wb = createWorkbook({ name, exerciseIds });
        return wb?.id || null;
      },
      existingExerciseIds: getExercises().map(ex => ex.id),
    });
    if (!result.ok) {
      setStatus(result.error || 'Import failed.', true);
      return;
    }
    if (result.imported?.length) selectedRoutineId = result.imported[0].id;
    closeSessionPane();
    render();
    const parts = [`Imported ${result.imported.length} routine${result.imported.length === 1 ? '' : 's'}`];
    if (result.workbooksCreated) parts.push(`${result.workbooksCreated} workbook${result.workbooksCreated === 1 ? '' : 's'} created`);
    if (result.workbooksLinked) parts.push(`${result.workbooksLinked} linked`);
    if (result.missingExercises) {
      parts.push(`${result.missingExercises} exercise${result.missingExercises === 1 ? '' : 's'} missing — upload them in Exercises (media does not travel in the JSON)`);
    }
    setStatus(parts.join('. ') + '.');
  } catch (e) {
    setStatus('Could not read that file.', true);
  }
}

function wireEscape() {
  if (escapeWired) return;
  escapeWired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dialogRoot && dialogRoot.children.length) {
      closeDialog();
      return;
    }
    if (!openSessionId) return;
    if (!isRoutinesSectionActive()) return;
    closeSessionPane();
    render();
  });
}

function render() {
  validateSelection();
  renderSidebar();
  renderToolbar();
  renderOverview();
  renderSessionPane();
  if (exportAllBtn) exportAllBtn.disabled = !listRoutines().length;
}

/** Repaints the routine list and overview meta without disturbing the open session pane. */
function refreshLibraryMeta() {
  renderSidebar();
  renderOverview();
}

// --- lifecycle ---------------------------------------------------------------

export function initRoutines() {
  routineListEl = document.getElementById('rt-routine-list');
  titleEl = document.getElementById('rt-current-title');
  toolbarActionsEl = document.getElementById('rt-toolbar-actions');
  statusEl = document.getElementById('rt-status');
  workspaceEl = document.getElementById('rt-workspace');
  overviewEl = document.getElementById('rt-overview');
  sessionListEl = document.getElementById('rt-session-list');
  sessionPaneEl = document.getElementById('rt-session-pane');
  sessionTitleEl = document.getElementById('rt-session-title');
  sessionActionsEl = document.getElementById('rt-session-actions');
  sessionBodyEl = document.getElementById('rt-session-body');
  sessionBackBtn = document.getElementById('rt-session-back');
  newBtn = document.getElementById('rt-new-btn');
  importBtn = document.getElementById('rt-import-btn');
  exportAllBtn = document.getElementById('rt-export-all-btn');
  importFileEl = document.getElementById('rt-import-file');

  if (!routineListEl) return;

  if (!bound) {
    bound = true;
    if (newBtn) newBtn.addEventListener('click', onNewRoutine);
    if (importBtn && importFileEl) {
      importBtn.addEventListener('click', () => importFileEl.click());
      importFileEl.addEventListener('change', () => {
        const file = importFileEl.files?.[0];
        onImportFile(file);
        importFileEl.value = '';
      });
    }
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', () => {
        const routines = listRoutines();
        if (!routines.length) {
          setStatus('No routines to export.', true);
          return;
        }
        const envelope = buildRoutineExport({
          resolveWorkbook: (id) => getWorkbook(id),
        });
        downloadRoutineExport(envelope);
        setStatus(`Exported ${routines.length} routine${routines.length === 1 ? '' : 's'}.`);
      });
    }
    if (sessionBackBtn) {
      sessionBackBtn.addEventListener('click', () => {
        closeSessionPane();
        render();
      });
    }
    wireEscape();
  }

  const wbIds = listWorkbooks().map(wb => wb.id);
  pruneMissingWorkbooks(wbIds);
  setStatus('');
  render();
}

export function stopRoutines() {
  flushDescAutosave();
  flushNotesAutosave();
  destroySessionMetronome();
  closeDialog();
}
