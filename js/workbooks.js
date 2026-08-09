// Exercise Workbooks for Musi. Ordered exercise lists grouped into folders,
// with per-workbook loop preference and inline Guitar Pro practice.

import {
  getExercises,
  getExercise,
  getCategories,
  updateExercisePracticeSettings,
  mediaKind,
  mediaKindLabel,
  isTabModelItem,
  exerciseIconSvg,
} from './exercises.js';
import { getFileBlob } from './attachments.js';
import { parseGuitarPro, mountGpPlayer } from './gpPlayerUI.js';
import { resolveScoreKey } from './gpAnnotations.js';
import {
  buildExerciseGpResult,
  filterPracticeSettingsPatch,
  gpResultFromTabModelJson,
  isSegmentExercise,
} from './gpExerciseScore.js';
import { formatBarRange } from './gpPlayer/measureDigest.js';
import {
  createWorkbookFolder,
  renameWorkbookFolder,
  deleteWorkbookFolder,
  deleteWorkbookFolderWithContents,
  getWorkbookFolderOptions,
  listWorkbookFolders,
  listWorkbooks,
  getWorkbook,
  createWorkbook,
  renameWorkbook,
  deleteWorkbook,
  setWorkbookFolder,
  setWorkbookLoop,
  addExercisesToWorkbook,
  removeWorkbookEntry,
  moveWorkbookEntry,
  reorderWorkbookEntries,
  setActiveWorkbookEntry,
  getActiveWorkbookEntry,
  nextWorkbookEntry,
  prevWorkbookEntry,
  pruneMissingExercises,
} from './workbookModel.js';

const NAME_LIMIT = 120;
const FOLDER_LIMIT = 40;

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
let pendingWorkbookOpenId = null;
let selectedFolder = 'all';
let openWorkbookId = null;
let escapeWired = false;

let folderListEl, titleEl, statusEl, listEl, workspaceEl, detailPaneEl, detailTitleEl;
let detailActionsEl, detailBodyEl, detailBackBtn, newBtn, addFolderForm, addFolderInput;

let dialogRoot = null;

// Detail view / player state
let detailRenderedWorkbookId = null;
let detailLoadToken = 0;
let detailMountHandle = null;
let detailObjectURL = null;
let detailMediaEl = null;
let detailDragEntryId = null;

let detailPlayerNameEl = null;
let detailPlayerKindEl = null;
let detailPositionEl = null;
let detailPrevBtn = null;
let detailNextBtn = null;
let detailLoopInput = null;
let detailGpMountEl = null;
let detailEntryListEl = null;

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function folderLabel(folderId) {
  if (!folderId) return 'No folder';
  const folder = listWorkbookFolders().find(f => f.id === folderId);
  return folder ? folder.name : 'No folder';
}

function currentTitleText() {
  const opt = getWorkbookFolderOptions().find(o => o.id === selectedFolder);
  return opt ? opt.label : 'All Workbooks';
}

function createFolderIdForSelection() {
  if (selectedFolder === 'all' || selectedFolder === 'uncategorized') return '';
  return selectedFolder;
}

function pluralExercises(count) {
  return `${count} exercise${count === 1 ? '' : 's'}`;
}

function isWorkbooksSectionActive() {
  const sec = document.getElementById('sec-workbooks');
  return sec && sec.classList.contains('active');
}

function syncPracticeMode() {
  const sec = document.getElementById('sec-workbooks');
  if (!sec) return;
  const practicing = !!openWorkbookId;
  sec.classList.toggle('wb-practicing', practicing);
  if (practicing) {
    installWbPracticeMetrics(sec);
    practiceMetricsHandle?.refresh();
  } else {
    destroyWbPracticeMetrics();
  }
}

const WB_PRACTICE_GUTTER_PX = 8;
let practiceMetricsHandle = null;

function installWbPracticeMetrics(section) {
  destroyWbPracticeMetrics();
  let raf = 0;

  function measure() {
    if (!section?.isConnected || !openWorkbookId) return;
    const top = Math.max(0, Math.round(section.getBoundingClientRect().top));
    section.style.setProperty('--wb-practice-top', `${top}px`);
    section.style.setProperty('--wb-practice-gutter', `${WB_PRACTICE_GUTTER_PX}px`);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(measure);
    });
  }

  schedule();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  practiceMetricsHandle = {
    refresh: schedule,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      section.style.removeProperty('--wb-practice-top');
      section.style.removeProperty('--wb-practice-gutter');
      practiceMetricsHandle = null;
    },
  };
}

function destroyWbPracticeMetrics() {
  practiceMetricsHandle?.destroy();
}

function refreshPracticeMetrics() {
  practiceMetricsHandle?.refresh();
}

function isDetailLoadStale(token, workbookId) {
  return token !== detailLoadToken
    || workbookId !== openWorkbookId
    || !isWorkbooksSectionActive();
}

function teardownDetailPlayer() {
  if (detailMountHandle) {
    try { detailMountHandle.destroy(); } catch (e) { /* ignore */ }
    detailMountHandle = null;
  }
  if (detailObjectURL) {
    try { URL.revokeObjectURL(detailObjectURL); } catch (e) { /* ignore */ }
    detailObjectURL = null;
  }
  detailMediaEl = null;
  if (detailGpMountEl) detailGpMountEl.innerHTML = '';
  setDetailGpChrome(false);
}

function getDetailPlayingState() {
  if (detailMountHandle) {
    try {
      if (detailMountHandle.player?.playing) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  if (detailMediaEl) return !detailMediaEl.paused && !detailMediaEl.ended;
  return false;
}

function buildEntryMeta(exercise) {
  if (!exercise) return '';
  const parts = [mediaKindLabel(exercise)];
  // Whole-score exercises are saved with measureStart/End of 0, so only a real
  // span means the exercise is a bar-range segment worth labelling.
  if (exercise.measureEnd > exercise.measureStart) {
    parts.push(formatBarRange(exercise.measureStart, exercise.measureEnd));
  }
  if (exercise.bpm != null && Number(exercise.bpm) > 0) {
    parts.push(`${Math.round(Number(exercise.bpm))} BPM`);
  }
  return parts.join(' · ');
}

let detailPlaylistBtn = null;
let detailAddBtnHeader = null;
let playlistDrawerEl = null;
let playlistDrawerEsc = null;

function setDetailGpChrome(active) {
  if (detailPaneEl) detailPaneEl.classList.toggle('wb-has-gp', !!active);
  if (detailBodyEl) detailBodyEl.classList.toggle('wb-has-gp', !!active);
  if (!active) closePlaylistDrawer();
}

function closePlaylistDrawer() {
  if (!playlistDrawerEl) return;
  playlistDrawerEl.hidden = true;
  playlistDrawerEl.classList.remove('is-open');
  if (playlistDrawerEsc) {
    document.removeEventListener('keydown', playlistDrawerEsc);
    playlistDrawerEsc = null;
  }
}

function openPlaylistDrawer(wb) {
  if (!playlistDrawerEl || !wb) return;
  renderEntryList(wb);
  syncEntryHighlights(wb);
  playlistDrawerEl.hidden = false;
  playlistDrawerEl.classList.add('is-open');
  if (!playlistDrawerEsc) {
    playlistDrawerEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (dialogRoot?.children.length) return;
      closePlaylistDrawer();
    };
    document.addEventListener('keydown', playlistDrawerEsc);
  }
}

function syncPlaylistLabel(wb) {
  if (!detailPlaylistBtn) return;
  const label = detailPlaylistBtn.querySelector('.gpp-btn-label') || detailPlaylistBtn;
  if (!wb || !wb.entries.length) {
    label.textContent = 'Playlist';
    detailPlaylistBtn.setAttribute('aria-label', 'Open playlist');
    detailPlaylistBtn.title = 'Open playlist';
    return;
  }
  const active = getActiveWorkbookEntry(wb.id);
  const idx = active ? active.index + 1 : 1;
  const text = `Playlist ${idx}/${wb.entries.length}`;
  label.textContent = text;
  detailPlaylistBtn.setAttribute('aria-label', text);
  detailPlaylistBtn.title = text;
}

// Header controls carry an icon as well as a label: narrow screens hide the
// label, and a label-only button would collapse to an empty square.
const HEAD_ICONS = {
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  prev: '<path d="M19 20 9 12l10-8z"/><path d="M5 19V5"/>',
  next: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  playlist: '<path d="M8 6h13M8 12h13M8 18h9"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
};

function headIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HEAD_ICONS[name]}</svg>`;
}

function buildGpHeaderExtra(wb) {
  const wrap = el('div', { class: 'wb-gpp-head-extra' });

  wrap.appendChild(el('button', {
    class: 'gpp-icon-btn has-label wb-head-back',
    type: 'button',
    'aria-label': 'Back to workbooks',
    title: 'Back to workbooks',
    html: `${headIcon('back')}<span class="gpp-btn-label">Workbooks</span>`,
    onClick: (e) => {
      e.stopPropagation();
      closeWorkbookDetail();
      render();
    },
  }));

  detailPositionEl = el('span', { class: 'wb-head-position', 'aria-live': 'polite' });

  detailPrevBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Previous exercise',
    title: 'Previous exercise',
    html: `${headIcon('prev')}<span class="gpp-btn-label">Prev</span>`,
    onClick: (e) => { e.stopPropagation(); goPrev(); },
  });

  detailNextBtn = el('button', {
    class: 'gpp-icon-btn has-label',
    type: 'button',
    'aria-label': 'Next exercise',
    title: 'Next exercise',
    html: `${headIcon('next')}<span class="gpp-btn-label">Next</span>`,
    onClick: (e) => { e.stopPropagation(); advance(); },
  });

  const loopHint = 'Loop on repeats the current exercise; loop off advances to the next one automatically.';
  const loopLabel = el('label', {
    class: 'wb-head-loop gpp-icon-btn has-label', title: loopHint, 'aria-label': 'Loop exercise',
  });
  detailLoopInput = el('input', { type: 'checkbox' });
  detailLoopInput.checked = !!wb.loopEnabled;
  detailLoopInput.addEventListener('change', () => onLoopToggleChange(detailLoopInput.checked));
  loopLabel.appendChild(detailLoopInput);
  loopLabel.appendChild(el('span', { class: 'gpp-btn-label', text: 'Loop' }));

  detailPlaylistBtn = el('button', {
    class: 'gpp-icon-btn has-label wb-head-playlist',
    type: 'button',
    'aria-label': 'Open playlist',
    title: 'Open playlist',
    html: `${headIcon('playlist')}<span class="gpp-btn-label">Playlist</span>`,
    onClick: (e) => {
      e.stopPropagation();
      const fresh = getWorkbook(openWorkbookId);
      if (fresh) openPlaylistDrawer(fresh);
    },
  });

  detailAddBtnHeader = el('button', {
    class: 'gpp-icon-btn has-label wb-head-add',
    type: 'button',
    'aria-label': 'Add exercises',
    title: 'Add exercises',
    html: `${headIcon('add')}<span class="gpp-btn-label">Add</span>`,
    onClick: (e) => {
      e.stopPropagation();
      openAddExercisesPicker(wb);
    },
  });

  wrap.append(
    detailPositionEl,
    detailPrevBtn,
    detailNextBtn,
    loopLabel,
    detailPlaylistBtn,
    detailAddBtnHeader,
  );

  syncPositionReadout(wb);
  syncLoopToggle(wb);
  syncTransportDisabled(wb);
  syncPlaylistLabel(wb);
  return wrap;
}

function syncPositionReadout(wb) {
  if (!detailPositionEl) return;
  if (!wb || !wb.entries.length) {
    detailPositionEl.textContent = '';
    syncPlaylistLabel(wb);
    return;
  }
  const active = getActiveWorkbookEntry(wb.id);
  if (!active) {
    detailPositionEl.textContent = '';
    syncPlaylistLabel(wb);
    return;
  }
  detailPositionEl.textContent = `${active.index + 1} / ${wb.entries.length}`;
  syncPlaylistLabel(wb);
}

function syncEntryHighlights(wb) {
  if (!detailEntryListEl || !wb) return;
  const active = getActiveWorkbookEntry(wb.id);
  const activeId = active ? active.entry.id : null;
  detailEntryListEl.querySelectorAll('.wb-entry').forEach(row => {
    row.classList.toggle('is-current', row.dataset.entryId === activeId);
  });
}

function syncLoopToggle(wb) {
  if (!detailLoopInput || !wb) return;
  detailLoopInput.checked = !!wb.loopEnabled;
}

function syncPlayerHead(wb) {
  if (!detailPlayerNameEl || !detailPlayerKindEl) return;
  if (!wb || !wb.entries.length) {
    detailPlayerNameEl.textContent = 'No exercises yet';
    detailPlayerKindEl.textContent = '';
    return;
  }
  const active = getActiveWorkbookEntry(wb.id);
  if (!active) return;
  const exercise = getExercise(active.entry.exerciseId);
  detailPlayerNameEl.textContent = exercise ? exercise.name : 'Missing exercise';
  detailPlayerKindEl.textContent = exercise ? mediaKindLabel(exercise) : '';
}

function syncTransportDisabled(wb) {
  const disabled = !wb || !wb.entries.length;
  if (detailPrevBtn) detailPrevBtn.disabled = disabled;
  if (detailNextBtn) detailNextBtn.disabled = disabled;
  if (detailLoopInput) detailLoopInput.disabled = disabled;
}

function closeWorkbookDetail() {
  teardownDetailPlayer();
  detailLoadToken += 1;
  detailRenderedWorkbookId = null;
  openWorkbookId = null;
  if (workspaceEl) workspaceEl.classList.remove('is-open');
  if (detailPaneEl) detailPaneEl.hidden = true;
  syncPracticeMode();
}

export function requestWorkbookOpen(id) {
  if (typeof id === 'string' && id) pendingWorkbookOpenId = id;
}

function openWorkbookDetail(id) {
  openWorkbookId = id;
  if (workspaceEl) workspaceEl.classList.add('is-open');
  if (detailPaneEl) detailPaneEl.hidden = false;
  syncPracticeMode();
  render();
}

// --- modals (shared modal-* styles) ----------------------------------------

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = el('div', { id: 'wb-dialog-root' });
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openConfirm(title, body, confirmLabel, onConfirm) {
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
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { closeDialog(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function openFolderDeleteDialog({ name, count, onDeleteFolderOnly, onDeleteAll }) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const workbookWord = count === 1 ? 'workbook' : 'workbooks';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: `Delete folder "${name}"?` }),
    el('p', {
      class: 'modal-body',
      text: `"${name}" holds ${count} ${workbookWord}. Delete the folder only and keep them uncategorized, or delete the folder and its ${count} ${workbookWord} from this device.`,
    }),
  ]);
  const actions = el('div', { class: 'modal-actions' });
  let escapeHandler = null;
  const finish = (fn) => {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    closeDialog();
    fn();
  };
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel',
    onClick: () => finish(() => {}),
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Delete folder only',
    onClick: () => finish(onDeleteFolderOnly),
  }));
  actions.appendChild(el('button', {
    class: 'btn modal-danger', type: 'button', text: `Delete folder + ${count} ${workbookWord}`,
    onClick: () => finish(onDeleteAll),
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(() => {}); });
  escapeHandler = (e) => { if (e.key === 'Escape') finish(() => {}); };
  document.addEventListener('keydown', escapeHandler);
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
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = input.value; closeDialog(); onConfirm(v); }
    if (e.key === 'Escape') closeDialog();
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
  const dialog = el('div', { class: 'modal-dialog wb-picker-sheet' });
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

// --- detail player -----------------------------------------------------------

function mountNonAdvanceCard(item, host) {
  const card = el('div', { class: 'wb-player-fallback' });
  card.appendChild(el('div', {
    class: 'wb-entry-icon', html: exerciseIconSvg(item), 'aria-hidden': 'true',
  }));
  card.appendChild(el('div', { class: 'wb-player-fallback-name', text: item.name }));
  card.appendChild(el('div', { class: 'wb-player-fallback-meta', text: mediaKindLabel(item) }));
  card.appendChild(el('p', {
    class: 'wb-player-fallback-note',
    text: 'This type cannot auto-advance during playback. Use Next or open it in Exercises.',
  }));
  card.appendChild(el('a', { class: 'btn sm', href: '#exercises', text: 'Open in Exercises' }));
  host.appendChild(card);
}

async function mountWorkbookGp(item, host, blob, wb, { onPlaybackEnd, autoPlay, loadToken }) {
  if (!blob) {
    host.appendChild(el('div', {
      class: 'wb-player-missing',
      text: 'This file is missing from storage. It may have been cleared by the browser.',
    }));
    return null;
  }
  try {
    let gp;
    if (isTabModelItem(item)) {
      const raw = JSON.parse(await blob.text());
      if (isDetailLoadStale(loadToken, wb.id)) return null;
      gp = gpResultFromTabModelJson(raw, { fallbackName: item.name || 'Exercise' });
    } else {
      const buf = await blob.arrayBuffer();
      if (isDetailLoadStale(loadToken, wb.id)) return null;
      gp = await parseGuitarPro(buf);
      if (isDetailLoadStale(loadToken, wb.id)) return null;
    }
    if (isDetailLoadStale(loadToken, wb.id)) return null;
    const { gp: exerciseGp, sliced } = buildExerciseGpResult(gp, item);
    const segment = isSegmentExercise(item);
    const loopRange = segment && !sliced ? {
      initialLoopStart: item.measureStart,
      initialLoopEnd: item.measureEnd,
      initialLoopStartBeat: item.startBeat,
      initialLoopEndBeat: item.endBeat,
    } : {};
    return mountGpPlayer(host, {
      gpResult: exerciseGp,
      title: item.name,
      fileName: item.fileName || item.name,
      hideTitle: true,
      preferredTrackIndex: Number.isFinite(item.preferredTrackIndex) ? item.preferredTrackIndex : 0,
      initialLoopEnabled: wb.loopEnabled,
      ...loopRange,
      loopRestSec: item.loopRestSec || 0,
      initialBpm: item.bpm,
      initialTranspose: item.transpose,
      initialTuning: item.tuning,
      initialRetuneMode: item.retuneMode,
      exerciseScope: segment && !sliced,
      headerExtra: buildGpHeaderExtra(wb),
      onPracticeSettingsChange: (settings) => {
        const patch = filterPracticeSettingsPatch(settings, { sliced });
        updateExercisePracticeSettings(item.id, patch);
        if (patch.loopEnabled != null) {
          const enabled = !!patch.loopEnabled;
          setWorkbookLoop(wb.id, enabled);
          if (detailLoopInput) detailLoopInput.checked = enabled;
        }
      },
      scoreKey: sliced ? undefined : resolveScoreKey({
        attachmentId: item.attachmentId,
        fileName: item.fileName || item.name,
      }),
      onPlaybackEnd,
      autoPlay,
    });
  } catch (err) {
    if (!isDetailLoadStale(loadToken, wb.id)) {
      host.appendChild(el('div', {
        class: 'wb-player-missing',
        text: err?.message || 'Could not open this Guitar Pro file.',
      }));
    }
    return null;
  }
}

// `autoPlay` is explicit for auto-advance: playback has already stopped by the
// time the end-of-score callback runs, so the playing state cannot be inferred.
function advance({ autoPlay } = {}) {
  const wb = getWorkbook(openWorkbookId);
  if (!wb || !wb.entries.length) return;
  const wasPlaying = autoPlay === undefined ? getDetailPlayingState() : !!autoPlay;
  nextWorkbookEntry(wb.id, { wrap: true });
  const fresh = getWorkbook(wb.id);
  syncEntryHighlights(fresh);
  syncPositionReadout(fresh);
  syncPlayerHead(fresh);
  loadCurrentExercise({ autoPlay: wasPlaying });
}

async function loadCurrentExercise({ autoPlay = false } = {}) {
  const workbookId = openWorkbookId;
  if (!workbookId || !detailGpMountEl) return;

  const loadToken = ++detailLoadToken;
  teardownDetailPlayer();

  try {
  const wb = getWorkbook(workbookId);
  if (!wb || isDetailLoadStale(loadToken, workbookId)) return;

  syncTransportDisabled(wb);

  if (!wb.entries.length) {
    detailGpMountEl.innerHTML = '';
    detailGpMountEl.appendChild(el('div', {
      class: 'wb-player-empty',
      text: 'Add exercises to start practicing. Use + Add exercises to pick from your library.',
    }));
    syncPlayerHead(wb);
    syncPositionReadout(wb);
    return;
  }

  const active = getActiveWorkbookEntry(wb.id);
  if (!active || isDetailLoadStale(loadToken, workbookId)) return;

  const exercise = getExercise(active.entry.exerciseId);
  syncPlayerHead(wb);
  syncPositionReadout(wb);
  syncEntryHighlights(wb);

  if (!exercise) {
    detailGpMountEl.innerHTML = '';
    detailGpMountEl.appendChild(el('div', {
      class: 'wb-player-missing',
      text: 'This exercise was removed from your library.',
    }));
    return;
  }

  const kind = mediaKind(exercise);
  const onPlaybackEnd = () => advance({ autoPlay: true });

  try {
    if (kind === 'gp') {
      const blob = exercise.attachmentId ? await getFileBlob(exercise.attachmentId) : null;
      if (isDetailLoadStale(loadToken, workbookId)) return;
      detailGpMountEl.innerHTML = '';
      const handle = await mountWorkbookGp(exercise, detailGpMountEl, blob, wb, {
        onPlaybackEnd,
        autoPlay,
        loadToken,
      });
      if (isDetailLoadStale(loadToken, workbookId)) {
        if (handle) try { handle.destroy(); } catch (e) { /* ignore */ }
        return;
      }
      detailMountHandle = handle;
      setDetailGpChrome(true);
      return;
    }

    setDetailGpChrome(false);

    if (kind === 'audio' || kind === 'video') {
      const blob = exercise.attachmentId ? await getFileBlob(exercise.attachmentId) : null;
      if (isDetailLoadStale(loadToken, workbookId)) return;
      detailGpMountEl.innerHTML = '';
      if (!blob) {
        detailGpMountEl.appendChild(el('div', {
          class: 'wb-player-missing',
          text: 'This file is missing from storage. It may have been cleared by the browser.',
        }));
        return;
      }
      detailObjectURL = URL.createObjectURL(blob);
      const mediaEl = el(kind === 'audio' ? 'audio' : 'video', {
        class: 'wb-player-media',
        src: detailObjectURL,
        controls: '',
        preload: 'metadata',
      });
      mediaEl.loop = wb.loopEnabled;
      mediaEl.addEventListener('ended', () => {
        if (!mediaEl.loop) advance({ autoPlay: true });
      });
      detailGpMountEl.appendChild(mediaEl);
      detailMediaEl = mediaEl;
      if (autoPlay) {
        try { await mediaEl.play(); } catch (e) { /* autoplay may be blocked */ }
      }
      return;
    }

    if (isDetailLoadStale(loadToken, workbookId)) return;
    detailGpMountEl.innerHTML = '';
    mountNonAdvanceCard(exercise, detailGpMountEl);
  } catch (err) {
    if (!isDetailLoadStale(loadToken, workbookId)) {
      setStatus(err?.message || 'Could not load this exercise.', true);
      detailGpMountEl.innerHTML = '';
      detailGpMountEl.appendChild(el('div', {
        class: 'wb-player-missing',
        text: err?.message || 'Could not load this exercise.',
      }));
    }
  }
  } finally {
    refreshPracticeMetrics();
  }
}

function goPrev() {
  const wb = getWorkbook(openWorkbookId);
  if (!wb || !wb.entries.length) return;
  const wasPlaying = getDetailPlayingState();
  prevWorkbookEntry(wb.id, { wrap: true });
  const fresh = getWorkbook(wb.id);
  syncEntryHighlights(fresh);
  syncPositionReadout(fresh);
  syncPlayerHead(fresh);
  loadCurrentExercise({ autoPlay: wasPlaying });
}

function onLoopToggleChange(enabled) {
  const wb = getWorkbook(openWorkbookId);
  if (!wb) return;
  setWorkbookLoop(wb.id, enabled);
  if (detailMountHandle) {
    try { detailMountHandle.setLoopEnabled(enabled); } catch (e) { /* ignore */ }
  }
  if (detailMediaEl) detailMediaEl.loop = enabled;
}

function buildEntryRow(wb, entry, index) {
  const exercise = getExercise(entry.exerciseId);
  const active = getActiveWorkbookEntry(wb.id);
  const isCurrent = active && active.entry.id === entry.id;

  const row = el('div', {
    class: 'wb-entry' + (isCurrent ? ' is-current' : ''),
    'data-entry-id': entry.id,
    draggable: 'true',
  });

  row.appendChild(el('span', { class: 'wb-entry-index', text: String(index + 1) }));

  if (exercise) {
    row.appendChild(el('div', {
      class: 'wb-entry-icon', html: exerciseIconSvg(exercise), 'aria-hidden': 'true',
    }));
  } else {
    row.appendChild(el('div', { class: 'wb-entry-icon wb-entry-icon-missing', text: '?' }));
  }

  row.appendChild(el('div', {
    class: 'wb-entry-name' + (!exercise ? ' is-missing' : ''),
    text: exercise ? exercise.name : 'Missing exercise',
  }));

  const metaText = exercise ? buildEntryMeta(exercise) : '';
  if (metaText) row.appendChild(el('div', { class: 'wb-entry-meta', text: metaText }));

  const actions = el('div', { class: 'wb-entry-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm wb-entry-move', type: 'button', title: 'Move up', 'aria-label': 'Move up', text: '↑',
    onClick: (e) => {
      e.stopPropagation();
      if (moveWorkbookEntry(wb.id, entry.id, -1)) {
        const fresh = getWorkbook(wb.id);
        renderEntryList(fresh);
        syncPositionReadout(fresh);
      }
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm wb-entry-move', type: 'button', title: 'Move down', 'aria-label': 'Move down', text: '↓',
    onClick: (e) => {
      e.stopPropagation();
      if (moveWorkbookEntry(wb.id, entry.id, 1)) {
        const fresh = getWorkbook(wb.id);
        renderEntryList(fresh);
        syncPositionReadout(fresh);
      }
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm wb-entry-remove', type: 'button', text: 'Remove',
    onClick: (e) => {
      e.stopPropagation();
      const wasPlaying = getDetailPlayingState();
      removeWorkbookEntry(wb.id, entry.id);
      const fresh = getWorkbook(wb.id);
      renderEntryList(fresh);
      syncPositionReadout(fresh);
      syncTransportDisabled(fresh);
      loadCurrentExercise({ autoPlay: wasPlaying });
    },
  }));
  row.appendChild(actions);

  row.addEventListener('click', () => {
    setActiveWorkbookEntry(wb.id, entry.id);
    const fresh = getWorkbook(wb.id);
    syncEntryHighlights(fresh);
    syncPositionReadout(fresh);
    syncPlayerHead(fresh);
    closePlaylistDrawer();
    loadCurrentExercise({ autoPlay: false });
  });

  row.addEventListener('dragstart', (e) => {
    detailDragEntryId = entry.id;
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', entry.id); } catch (err) { /* ignore */ }
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('is-drop-target');
  });
  row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('is-drop-target');
    const fromId = detailDragEntryId || e.dataTransfer.getData('text/plain');
    if (!fromId || fromId === entry.id) return;
    const current = getWorkbook(wb.id);
    const ids = current.entries.map(en => en.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(entry.id);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    reorderWorkbookEntries(wb.id, ids);
    const fresh = getWorkbook(wb.id);
    renderEntryList(fresh);
    syncPositionReadout(fresh);
  });
  row.addEventListener('dragend', () => {
    detailDragEntryId = null;
    row.classList.remove('is-dragging');
    if (detailEntryListEl) {
      detailEntryListEl.querySelectorAll('.wb-entry.is-drop-target').forEach(n => {
        n.classList.remove('is-drop-target');
      });
    }
  });

  return row;
}

function renderEntryList(wb) {
  if (!detailEntryListEl) return;
  detailEntryListEl.innerHTML = '';
  if (!wb.entries.length) {
    detailEntryListEl.appendChild(el('div', {
      class: 'wb-entry-empty',
      text: 'No exercises in this workbook yet.',
    }));
    return;
  }
  wb.entries.forEach((entry, index) => {
    detailEntryListEl.appendChild(buildEntryRow(wb, entry, index));
  });
}

function buildDetailShell(wb) {
  const player = el('div', { class: 'wb-player' });
  const controls = el('div', { class: 'wb-player-controls' });

  const head = el('div', { class: 'wb-player-head' });
  detailPlayerNameEl = el('div', { class: 'wb-player-name', text: '' });
  detailPlayerKindEl = el('div', { class: 'wb-player-kind', text: '' });
  detailPositionEl = el('div', { class: 'wb-position', text: '' });
  head.appendChild(detailPlayerNameEl);
  head.appendChild(detailPlayerKindEl);
  head.appendChild(detailPositionEl);
  controls.appendChild(head);

  const transport = el('div', { class: 'wb-transport' });
  detailPrevBtn = el('button', {
    class: 'btn sm', type: 'button', text: 'Prev', onClick: () => goPrev(),
  });
  detailNextBtn = el('button', {
    class: 'btn sm', type: 'button', text: 'Next', onClick: () => advance(),
  });
  transport.appendChild(detailPrevBtn);
  transport.appendChild(detailNextBtn);

  const loopHint = 'Loop on repeats the current exercise; loop off advances to the next one automatically.';
  const loopLabel = el('label', { class: 'wb-loop-toggle', title: loopHint });
  detailLoopInput = el('input', { type: 'checkbox' });
  detailLoopInput.checked = !!wb.loopEnabled;
  detailLoopInput.addEventListener('change', () => onLoopToggleChange(detailLoopInput.checked));
  loopLabel.appendChild(detailLoopInput);
  loopLabel.appendChild(document.createTextNode(' Loop'));
  loopLabel.appendChild(el('span', { class: 'wb-label-tail', text: ' exercise' }));
  transport.appendChild(loopLabel);
  transport.appendChild(el('span', {
    class: 'wb-loop-hint',
    text: 'On: repeat · Off: auto-advance',
    title: loopHint,
  }));
  controls.appendChild(transport);
  player.appendChild(controls);

  detailGpMountEl = el('div', { class: 'wb-gp-mount' });
  player.appendChild(detailGpMountEl);

  detailBodyEl.appendChild(player);

  playlistDrawerEl = el('div', { class: 'wb-playlist-drawer', hidden: true });
  const backdrop = el('div', { class: 'wb-playlist-backdrop' });
  backdrop.addEventListener('click', closePlaylistDrawer);
  const panel = el('div', { class: 'wb-playlist-panel' });
  const panelHead = el('div', { class: 'wb-playlist-panel-head' });
  panelHead.appendChild(el('h3', { class: 'wb-playlist-panel-title', text: 'Playlist' }));
  panelHead.appendChild(el('button', {
    class: 'btn sm wb-playlist-close', type: 'button', 'aria-label': 'Close playlist', text: '×',
    onClick: closePlaylistDrawer,
  }));
  panel.appendChild(panelHead);
  detailEntryListEl = el('div', { class: 'wb-entry-list' });
  panel.appendChild(detailEntryListEl);
  playlistDrawerEl.append(backdrop, panel);
  detailBodyEl.appendChild(playlistDrawerEl);

  renderEntryList(wb);
  syncTransportDisabled(wb);
  syncPositionReadout(wb);
  syncPlayerHead(wb);
}

function renderDetailActions(wb) {
  if (!detailActionsEl) return;
  detailActionsEl.innerHTML = '';
  const addBtn = el('button', {
    class: 'btn sm primary wb-detail-add-btn', type: 'button',
    title: 'Add exercises', 'aria-label': 'Add exercises',
    onClick: () => openAddExercisesPicker(wb),
  });
  addBtn.appendChild(document.createTextNode('+ Add'));
  addBtn.appendChild(el('span', { class: 'wb-label-tail', text: ' exercises' }));
  detailActionsEl.appendChild(addBtn);
  detailActionsEl.appendChild(el('button', {
    class: 'btn sm wb-detail-rename-btn', type: 'button', text: 'Rename',
    title: 'Rename workbook',
    onClick: () => {
      openPrompt('Rename workbook', wb.name, 'Save', (name) => {
        if (renameWorkbook(wb.id, name)) {
          if (detailTitleEl) detailTitleEl.textContent = getWorkbook(wb.id).name;
          render();
        }
      });
    },
  }));
}

function openAddExercisesPicker(wb) {
  const allExercises = getExercises();
  const selectedOrder = [];
  const rowCheckboxes = new Map();

  const picker = el('div', { class: 'wb-picker' });
  const filterInput = el('input', {
    type: 'search',
    class: 'wb-picker-filter modal-input',
    placeholder: 'Filter exercises…',
    'aria-label': 'Filter exercises',
    autocomplete: 'off',
  });
  picker.appendChild(filterInput);

  const listHost = el('div', { class: 'wb-picker-list' });
  picker.appendChild(listHost);

  const foot = el('div', { class: 'wb-picker-foot' });
  const countLabel = el('span', { class: 'wb-picker-count', text: '0 selected' });
  const addBtn = el('button', {
    class: 'btn primary', type: 'button', text: 'Add 0 exercises', disabled: 'true',
  });
  foot.appendChild(countLabel);
  foot.appendChild(addBtn);
  picker.appendChild(foot);

  function updateFooter() {
    const n = selectedOrder.length;
    countLabel.textContent = `${n} selected`;
    addBtn.textContent = `Add ${n} exercise${n === 1 ? '' : 's'}`;
    if (n > 0) addBtn.removeAttribute('disabled');
    else addBtn.setAttribute('disabled', 'true');
  }

  function toggleSelection(id, checked) {
    if (checked) {
      if (!selectedOrder.includes(id)) selectedOrder.push(id);
    } else {
      const idx = selectedOrder.indexOf(id);
      if (idx >= 0) selectedOrder.splice(idx, 1);
    }
    updateFooter();
  }

  function folderSelectAll(items, on) {
    items.forEach(ex => {
      const cb = rowCheckboxes.get(ex.id);
      if (!cb) return;
      cb.checked = on;
      toggleSelection(ex.id, on);
    });
  }

  function renderPickerList() {
    const query = (filterInput.value || '').trim().toLowerCase();
    listHost.innerHTML = '';
    rowCheckboxes.clear();

    if (allExercises.length === 0) {
      const empty = el('div', { class: 'wb-picker-empty' });
      empty.appendChild(document.createTextNode('No exercises in your library yet. '));
      empty.appendChild(el('a', { href: '#exercises', text: 'Open Exercises' }));
      empty.appendChild(document.createTextNode(' to upload or add some.'));
      listHost.appendChild(empty);
      return;
    }

    const categories = getCategories();
    const groups = categories.map(cat => ({
      id: cat.id,
      label: cat.name,
      items: allExercises.filter(ex => ex.categoryId === cat.id),
    }));
    const uncategorized = allExercises.filter(ex => !ex.categoryId);
    if (uncategorized.length) {
      groups.push({ id: '', label: 'No folder', items: uncategorized });
    }

    groups.forEach(group => {
      const filtered = group.items.filter(ex => {
        if (!query) return true;
        const name = (ex.name || '').toLowerCase();
        const kind = mediaKindLabel(ex).toLowerCase();
        return name.includes(query) || kind.includes(query);
      });
      if (!filtered.length) return;

      const section = el('div', { class: 'wb-picker-section' });
      const sectionHead = el('div', { class: 'wb-picker-section-head' });
      sectionHead.appendChild(el('span', { class: 'wb-picker-section-title', text: group.label }));
      const sectionTools = el('div', { class: 'wb-picker-section-tools' });
      sectionTools.appendChild(el('button', {
        class: 'btn sm', type: 'button', text: 'All',
        onClick: () => folderSelectAll(filtered, true),
      }));
      sectionTools.appendChild(el('button', {
        class: 'btn sm', type: 'button', text: 'None',
        onClick: () => folderSelectAll(filtered, false),
      }));
      sectionHead.appendChild(sectionTools);
      section.appendChild(sectionHead);

      filtered.forEach(ex => {
        const row = el('label', { class: 'wb-picker-row' });
        const cb = el('input', { type: 'checkbox' });
        cb.checked = selectedOrder.includes(ex.id);
        cb.addEventListener('change', () => toggleSelection(ex.id, cb.checked));
        rowCheckboxes.set(ex.id, cb);
        row.appendChild(cb);
        row.appendChild(el('div', {
          class: 'wb-entry-icon', html: exerciseIconSvg(ex), 'aria-hidden': 'true',
        }));
        const body = el('div', { class: 'wb-picker-row-body' });
        body.appendChild(el('span', { class: 'wb-picker-row-name', text: ex.name }));
        body.appendChild(el('span', { class: 'wb-picker-row-kind', text: mediaKindLabel(ex) }));
        row.appendChild(body);
        section.appendChild(row);
      });
      listHost.appendChild(section);
    });

    if (!listHost.children.length) {
      listHost.appendChild(el('div', {
        class: 'wb-picker-empty',
        text: 'No exercises match your filter.',
      }));
    }
  }

  filterInput.addEventListener('input', () => renderPickerList());
  renderPickerList();
  updateFooter();

  addBtn.addEventListener('click', () => {
    if (!selectedOrder.length) return;
    const prevCount = wb.entries.length;
    const created = addExercisesToWorkbook(wb.id, selectedOrder);
    sheet.close();
    render();
    if (prevCount === 0) {
      loadCurrentExercise({ autoPlay: false });
    }
    setStatus(`Added ${created.length} exercise${created.length === 1 ? '' : 's'}.`);
  });

  const sheet = openSheet('Add exercises', picker);
  setTimeout(() => filterInput.focus(), 40);
}

// --- library rendering -------------------------------------------------------

function renderFolders() {
  if (!folderListEl) return;
  folderListEl.innerHTML = '';

  const makeRow = (key, name, count, opts = {}) => {
    const row = el('div', {
      class: 'wb-folder-item' + (selectedFolder === key ? ' is-active' : ''),
      'data-folder': key,
      role: 'button',
      tabindex: '0',
      'aria-pressed': selectedFolder === key ? 'true' : 'false',
    });
    row.appendChild(el('span', { class: 'wb-folder-name', text: name }));
    row.appendChild(el('span', { class: 'wb-folder-count', text: String(count) }));
    const select = () => {
      selectedFolder = key;
      render();
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('.wb-folder-tool')) return;
      select();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
    if (opts.editable) {
      const tools = el('div', { class: 'wb-folder-tools' });
      tools.appendChild(el('button', {
        class: 'wb-folder-tool', type: 'button', title: 'Rename folder', 'aria-label': `Rename ${name}`,
        html: '&#9998;', onClick: (e) => { e.stopPropagation(); onRenameFolder(opts.id, name); },
      }));
      tools.appendChild(el('button', {
        class: 'wb-folder-tool wb-folder-del', type: 'button', title: 'Delete folder', 'aria-label': `Delete ${name}`,
        html: '&#10005;', onClick: (e) => { e.stopPropagation(); onDeleteFolder(opts.id, name); },
      }));
      row.appendChild(tools);
    }
    folderListEl.appendChild(row);
  };

  getWorkbookFolderOptions().forEach(opt => {
    const editable = opt.id !== 'all' && opt.id !== 'uncategorized';
    makeRow(opt.id, opt.label, opt.count, editable ? { editable: true, id: opt.id } : {});
  });
}

function buildFolderSelect(wb) {
  const select = el('select', { class: 'wb-card-folder-select', 'aria-label': 'Folder' });
  select.appendChild(el('option', { value: '', text: 'No folder' }));
  listWorkbookFolders().forEach(folder => {
    const opt = el('option', { value: folder.id, text: folder.name });
    if (folder.id === wb.folderId) opt.selected = true;
    select.appendChild(opt);
  });
  if (!wb.folderId) select.value = '';
  select.addEventListener('change', () => {
    setWorkbookFolder(wb.id, select.value);
    render();
  });
  return select;
}

function buildWorkbookCard(wb) {
  const card = el('div', {
    class: 'wb-card' + (wb.id === openWorkbookId ? ' is-active' : ''),
    'data-id': wb.id,
  });

  const body = el('div', { class: 'wb-card-body' });
  body.appendChild(el('div', { class: 'wb-card-name', text: wb.name }));
  const loopLabel = wb.loopEnabled ? 'Loop on' : 'Loop off';
  const meta = `${pluralExercises(wb.entries.length)} · ${folderLabel(wb.folderId)} · ${loopLabel}`;
  body.appendChild(el('div', { class: 'wb-card-meta', text: meta }));
  card.appendChild(body);

  const actions = el('div', { class: 'wb-card-actions' });
  actions.appendChild(buildFolderSelect(wb));
  actions.appendChild(el('button', {
    class: 'btn sm primary', type: 'button', text: 'Open',
    onClick: () => openWorkbookDetail(wb.id),
  }));
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Rename',
    onClick: () => {
      openPrompt('Rename workbook', wb.name, 'Save', (name) => {
        if (renameWorkbook(wb.id, name)) render();
      });
    },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm wb-card-del', type: 'button', text: 'Delete',
    'aria-label': `Delete ${wb.name}`,
    onClick: () => {
      openConfirm(
        `Delete "${wb.name}"?`,
        'This removes the workbook and its exercise order from this device.',
        'Delete',
        () => {
          if (openWorkbookId === wb.id) closeWorkbookDetail();
          deleteWorkbook(wb.id);
          render();
        },
      );
    },
  }));
  card.appendChild(actions);
  return card;
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const items = listWorkbooks({ folderId: selectedFolder });
  if (items.length === 0) {
    listEl.appendChild(el('div', {
      class: 'wb-empty',
      text: 'No workbooks yet. Tap + New Workbook above to create one and add exercises from your library.',
    }));
    return;
  }

  items.forEach(wb => listEl.appendChild(buildWorkbookCard(wb)));
}

function renderDetail() {
  if (!detailPaneEl || !detailBodyEl) return;

  if (!openWorkbookId) {
    detailPaneEl.hidden = true;
    if (workspaceEl) workspaceEl.classList.remove('is-open');
    if (detailTitleEl) detailTitleEl.textContent = '';
    if (detailActionsEl) detailActionsEl.innerHTML = '';
    detailBodyEl.innerHTML = '';
    detailRenderedWorkbookId = null;
    return;
  }

  pruneMissingExercises(openWorkbookId, getExercises().map(ex => ex.id));

  const wb = getWorkbook(openWorkbookId);
  if (!wb) {
    closeWorkbookDetail();
    render();
    return;
  }

  detailPaneEl.hidden = false;
  if (workspaceEl) workspaceEl.classList.add('is-open');
  if (detailTitleEl) detailTitleEl.textContent = wb.name;
  renderDetailActions(wb);

  const needsShell = detailRenderedWorkbookId !== wb.id || !detailBodyEl.querySelector('.wb-player');
  if (needsShell) {
    teardownDetailPlayer();
    detailBodyEl.innerHTML = '';
    buildDetailShell(wb);
    detailRenderedWorkbookId = wb.id;
    loadCurrentExercise({ autoPlay: false });
  } else {
    const fresh = getWorkbook(wb.id);
    renderEntryList(fresh);
    syncPositionReadout(fresh);
    syncLoopToggle(fresh);
    syncPlayerHead(fresh);
    syncTransportDisabled(fresh);
  }
  refreshPracticeMetrics();
}

function render() {
  if (selectedFolder !== 'all' && selectedFolder !== 'uncategorized'
      && !listWorkbookFolders().some(f => f.id === selectedFolder)) {
    selectedFolder = 'all';
  }
  if (openWorkbookId && !getWorkbook(openWorkbookId)) {
    closeWorkbookDetail();
  }
  if (titleEl) titleEl.textContent = currentTitleText();
  renderFolders();
  renderList();
  renderDetail();
}

function onRenameFolder(id, current) {
  openPrompt('Rename folder', current, 'Save', (name) => {
    if (renameWorkbookFolder(id, name)) render();
  }, { maxlength: FOLDER_LIMIT });
}

function onDeleteFolder(id, name) {
  const count = listWorkbooks({ folderId: id }).length;
  if (count === 0) {
    openConfirm(
      `Delete folder "${name}"?`,
      'This folder is empty.',
      'Delete',
      () => {
        deleteWorkbookFolder(id);
        if (selectedFolder === id) selectedFolder = 'all';
        render();
      },
    );
    return;
  }
  openFolderDeleteDialog({
    name,
    count,
    onDeleteFolderOnly: () => {
      deleteWorkbookFolder(id);
      if (selectedFolder === id) selectedFolder = 'all';
      render();
      const word = count === 1 ? 'workbook' : 'workbooks';
      setStatus(`Deleted folder "${name}". ${count} ${word} ${count === 1 ? 'is' : 'are'} now uncategorized.`);
    },
    onDeleteAll: () => {
      const openWb = openWorkbookId ? getWorkbook(openWorkbookId) : null;
      if (openWb && openWb.folderId === id) closeWorkbookDetail();
      const { deleted } = deleteWorkbookFolderWithContents(id);
      if (selectedFolder === id) selectedFolder = 'all';
      render();
      const word = deleted === 1 ? 'workbook' : 'workbooks';
      setStatus(`Deleted folder "${name}" and ${deleted} ${word}.`);
    },
  });
}

function onNewWorkbook() {
  openPrompt('New workbook', '', 'Create', (name) => {
    const clean = (name || '').trim();
    if (!clean) {
      setStatus('Enter a workbook name.', true);
      return;
    }
    const wb = createWorkbook({ name: clean, folderId: createFolderIdForSelection() });
    openWorkbookDetail(wb.id);
    setStatus('Workbook created.');
  });
}

function wireEscape() {
  if (escapeWired) return;
  escapeWired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dialogRoot && dialogRoot.children.length) return;
    if (playlistDrawerEl && !playlistDrawerEl.hidden) {
      closePlaylistDrawer();
      return;
    }
    // The player's own drawers close themselves on Escape; leaving the workbook
    // in the same keypress would dismiss both at once.
    if (detailGpMountEl?.querySelector('.is-open')) return;
    if (!openWorkbookId) return;
    const sec = document.getElementById('sec-workbooks');
    if (!sec || !sec.classList.contains('active')) return;
    closeWorkbookDetail();
    render();
  });
}

// --- init / teardown ---------------------------------------------------------

export function initWorkbooks() {
  folderListEl = document.getElementById('wb-folder-list');
  titleEl = document.getElementById('wb-current-title');
  statusEl = document.getElementById('wb-status');
  listEl = document.getElementById('wb-list');
  workspaceEl = document.getElementById('wb-workspace');
  detailPaneEl = document.getElementById('wb-detail-pane');
  detailTitleEl = document.getElementById('wb-detail-title');
  detailActionsEl = document.getElementById('wb-detail-actions');
  detailBodyEl = document.getElementById('wb-detail-body');
  detailBackBtn = document.getElementById('wb-detail-back');
  newBtn = document.getElementById('wb-new-btn');
  addFolderForm = document.getElementById('wb-add-folder-form');
  addFolderInput = document.getElementById('wb-add-folder-input');

  if (!listEl) return;

  if (!bound) {
    bound = true;
    if (newBtn) newBtn.addEventListener('click', onNewWorkbook);
    if (detailBackBtn) {
      detailBackBtn.addEventListener('click', () => {
        closeWorkbookDetail();
        render();
      });
    }
    if (addFolderForm) {
      addFolderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = addFolderInput?.value || '';
        const folder = createWorkbookFolder(name);
        if (folder) {
          if (addFolderInput) addFolderInput.value = '';
          render();
        } else {
          setStatus('Enter a folder name.', true);
          addFolderInput?.focus();
        }
      });
    }
    wireEscape();
  }

  setStatus('');
  if (pendingWorkbookOpenId) {
    const pendingId = pendingWorkbookOpenId;
    pendingWorkbookOpenId = null;
    if (getWorkbook(pendingId)) {
      openWorkbookDetail(pendingId);
      return;
    }
  }
  render();
}

export function stopWorkbooks() {
  closeDialog();
  closeWorkbookDetail();
}
