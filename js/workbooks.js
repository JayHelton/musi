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
import { ensureAudio } from './audio.js';
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
  moveWorkbookFolder,
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
  pruneMissingExercises,
  addCompanionToWorkbook,
  updateWorkbookCompanion,
  removeWorkbookCompanion,
  moveWorkbookCompanion,
  reorderWorkbookCompanions,
  setWorkbookCompanionCollapsed,
} from './workbookModel.js';
import {
  MAX_FOLDER_DEPTH,
  findSiblingByName,
  folderDepth,
  folderSubtreeIds,
  nextParentAfterDelete,
} from './folderTree.js';
import { createDriveBrowser, closeDriveMenu } from './library/driveBrowser.js';
import { mountCompanions } from './exerciseCompanions/index.js';
import { mountWorkbookCompanionPanel } from './workbookCompanionPanel.js';
import { initSubviewTabs } from './uxPrimitives.js';
import { resolveWorkbookShortcutAction, WB_KEY_ACTIONS } from './workbookKeyboard.js';
import { GPP_TRANSPORT_BPM_STEP } from './gpPlayer/transportDock.js';
import {
  findConsecutiveGpRun,
  buildPlaythroughScore,
  entryIdAtBeat,
  entryIdAtMeasure,
  boundaryForEntry,
} from './workbookPlaythrough.js';
import { showAppToast } from './appToast.js';

const NAME_LIMIT = 120;
const FOLDER_LIMIT = 40;

// A stack of ordered pages: the row icon for a workbook in the library.
const WORKBOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l1.5 1.5H19a1 1 0 0 1 1 1V8"/><rect x="4" y="8" width="16" height="12" rx="1.5"/><path d="M8 12h8M8 16h5"/></svg>';

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
// The open folder. An empty string is the library root, where unfiled
// workbooks live. Google Drive calls the same place "My Drive".
let selectedFolder = '';
let openWorkbookId = null;
let escapeWired = false;
let shortcutWired = false;

let folderListEl, crumbsEl, toolsEl, bulkBarEl, statusEl, listEl, workspaceEl, detailPaneEl, detailTitleEl;
let detailActionsEl, detailBodyEl, detailBackBtn;
// The shared Drive-style browser. Exercises builds an identical one.
let browser = null;

let dialogRoot = null;

// Detail view / player state
let detailRenderedWorkbookId = null;
let detailLoadToken = 0;
let detailMountHandle = null;
let detailPlaythrough = null;
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
let detailCompanionsMountEl = null;
let detailCompanionsHandle = null;
let detailTabsEl = null;
let detailPanesEl = null;
let detailTabsApi = null;
let detailHadCompanions = false;
let companionPanel = null;
let detailEntryListEl = null;

let workbookBackTarget = null;
const workbookEntryChangeHandlers = new Set();
const workbookDetailChangeHandlers = new Set();
const workbookCompanionChangeHandlers = new Set();
let routeDrivenCompanionChange = false;

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
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

const URL_LIMIT = 2048;

function safeExternalUrl(value) {
  let raw = (typeof value === 'string' ? value.trim() : '').slice(0, URL_LIMIT);
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /^[\w.-]+\.[a-z]{2,}/i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) { /* invalid */ }
  return '';
}

function youtubeEmbedUrl(url) {
  const safe = safeExternalUrl(url);
  if (!safe) return '';
  try {
    const u = new URL(safe);
    const host = u.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/').filter(Boolean)[1] || '';
      }
    }
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return '';
    return `https://www.youtube.com/embed/${id}`;
  } catch (e) {
    return '';
  }
}

function fileExt(item) {
  const name = item?.fileName || item?.name || '';
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function isInlineDocExercise(item) {
  return mediaKind(item) === 'doc' && /^(txt|md|csv)$/i.test(fileExt(item));
}

function isOfficeDocExercise(item) {
  return mediaKind(item) === 'doc' && !isInlineDocExercise(item);
}

function isWorkbookShortcutDialogOpen() {
  if (dialogRoot?.children.length) return true;
  if (playlistDrawerEl && !playlistDrawerEl.hidden) return true;
  if (companionPanel?.isOpen()) return true;
  if (detailGpMountEl?.querySelector('.gpp-drawer.is-open, .gpp-sheet.is-open')) return true;
  return false;
}

function toggleDetailPlayback() {
  if (detailMountHandle?.togglePlayPause) {
    try { detailMountHandle.togglePlayPause(); } catch (e) { /* ignore */ }
    return;
  }
  if (detailMediaEl) {
    if (detailMediaEl.paused || detailMediaEl.ended) {
      detailMediaEl.play().catch(() => {});
    } else {
      detailMediaEl.pause();
    }
  }
}

function stepDetailBpm(delta) {
  if (!detailMountHandle?.stepBpm) return;
  try { detailMountHandle.stepBpm(delta); } catch (e) { /* ignore */ }
}

function onWorkbookShortcutKeydown(e) {
  const action = resolveWorkbookShortcutAction(e, {
    openWorkbookId,
    sectionActive: isWorkbooksSectionActive(),
    dialogOpen: isWorkbookShortcutDialogOpen(),
  });
  if (!action) return;

  const wb = getWorkbook(openWorkbookId);
  if ((action === WB_KEY_ACTIONS.PREV || action === WB_KEY_ACTIONS.NEXT)
      && (!wb || !wb.entries.length)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  switch (action) {
    case WB_KEY_ACTIONS.PREV:
      goPrev();
      break;
    case WB_KEY_ACTIONS.NEXT:
      advance();
      break;
    case WB_KEY_ACTIONS.TOGGLE_PLAY:
      toggleDetailPlayback();
      break;
    case WB_KEY_ACTIONS.BPM_UP:
      stepDetailBpm(GPP_TRANSPORT_BPM_STEP);
      break;
    case WB_KEY_ACTIONS.BPM_DOWN:
      stepDetailBpm(-GPP_TRANSPORT_BPM_STEP);
      break;
    default:
      break;
  }
}

function wireWorkbookShortcuts() {
  if (shortcutWired) return;
  shortcutWired = true;
  document.addEventListener('keydown', onWorkbookShortcutKeydown, true);
}

function teardownDetailCompanions() {
  if (detailCompanionsHandle) {
    try { detailCompanionsHandle.destroy(); } catch (e) { /* ignore */ }
    detailCompanionsHandle = null;
  }
  if (companionPanel) {
    try { companionPanel.destroy(); } catch (e) { /* ignore */ }
    companionPanel = null;
  }
  detailCompanionsMountEl = null;
  detailTabsEl = null;
  detailPanesEl = null;
  detailTabsApi = null;
  detailHadCompanions = false;
}

function teardownDetailPlayer() {
  if (detailMountHandle) {
    try { detailMountHandle.destroy(); } catch (e) { /* ignore */ }
    detailMountHandle = null;
  }
  detailPlaythrough = null;
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
      if (typeof detailMountHandle.isPendingPlayback === 'function'
        && detailMountHandle.isPendingPlayback()) {
        return true;
      }
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

function closeCompanionPanel() {
  companionPanel?.close();
}

function syncCompanionGearButtons() {
  const open = !!companionPanel?.isOpen?.();
  detailBodyEl?.querySelectorAll('.wb-cmp-gear').forEach((btn) => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
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
  closeCompanionPanel();
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
  tools: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
};

function headIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HEAD_ICONS[name]}</svg>`;
}

function buildCompanionGearButton() {
  const btn = el('button', {
    class: 'gpp-icon-btn has-label wb-cmp-gear',
    type: 'button',
    'aria-label': 'Workbook tools',
    title: 'Workbook tools',
    'aria-expanded': 'false',
    html: `${headIcon('tools')}<span class="gpp-btn-label">Tools</span>`,
    onClick: (e) => {
      e.stopPropagation();
      closePlaylistDrawer();
      companionPanel?.toggle();
      syncCompanionGearButtons();
    },
  });
  return btn;
}

function syncDetailTabs(wb) {
  if (!detailTabsEl || !detailGpMountEl || !detailCompanionsMountEl) return;
  const fresh = wb || getWorkbook(openWorkbookId);
  const hasCompanions = (fresh?.companions || []).length > 0;
  const player = detailPanesEl?.parentElement;

  detailTabsEl.hidden = !hasCompanions;
  if (player) player.classList.toggle('wb-has-companions', hasCompanions);

  if (!hasCompanions) {
    if (detailTabsApi?.active === 'tools') {
      detailCompanionsHandle?.stop?.('pane-hidden');
    }
    detailGpMountEl.hidden = false;
    detailGpMountEl.classList.add('active');
    detailCompanionsMountEl.hidden = true;
    detailCompanionsMountEl.classList.remove('active');
    detailHadCompanions = false;
    return;
  }

  const justGotFirst = !detailHadCompanions;
  detailHadCompanions = true;

  if (!detailTabsApi) {
    detailTabsApi = initSubviewTabs(detailTabsEl, [
      { id: 'exercise', label: 'Exercise' },
      { id: 'tools', label: 'Tools' },
    ], {
      settingsKey: 'wb.detailTab',
      defaultId: 'exercise',
      className: 'subview-tabs wb-detail-tabs',
      onChange: (id) => {
        if (id === 'exercise') {
          detailCompanionsHandle?.stop?.('pane-hidden');
        } else {
          detailCompanionsHandle?.refresh?.();
        }
      },
    });
  }

  if (justGotFirst) {
    // Stay on Exercise when the first companion is added.
    detailTabsApi.setActive('exercise', { silent: true });
  } else {
    // Re-apply the active tab so pane visibility matches after remounts.
    detailTabsApi.setActive(detailTabsApi.active, { silent: true });
  }
}

function refreshDetailCompanions(wb) {
  if (!detailCompanionsMountEl) return;
  if (detailCompanionsHandle) {
    try { detailCompanionsHandle.destroy(); } catch (e) { /* ignore */ }
    detailCompanionsHandle = null;
  }
  const fresh = wb || getWorkbook(openWorkbookId);
  if (!fresh) return;
  const companions = fresh.companions || [];
  detailCompanionsHandle = mountCompanions(detailCompanionsMountEl, companions, {
    onCollapsedChange: (companionId, collapsed) => {
      if (openWorkbookId) setWorkbookCompanionCollapsed(openWorkbookId, companionId, collapsed);
      if (routeDrivenCompanionChange) return;
      const workbookId = openWorkbookId;
      if (!workbookId) return;
      const payload = { workbookId, companionId, collapsed };
      workbookCompanionChangeHandlers.forEach((handler) => {
        try { handler(payload); } catch (e) { /* ignore */ }
      });
    },
  });
  companionPanel?.sync();
  syncDetailTabs(fresh);
}

function mountDetailCompanionUi(wb) {
  if (!detailBodyEl || !wb) return;
  companionPanel = mountWorkbookCompanionPanel(detailBodyEl, {
    workbookId: wb.id,
    getWorkbook: () => getWorkbook(wb.id),
    onAdd: (type) => { addCompanionToWorkbook(wb.id, type); },
    onUpdate: (companionId, patch) => { updateWorkbookCompanion(wb.id, companionId, patch); },
    onRemove: (companionId) => { removeWorkbookCompanion(wb.id, companionId); },
    onMove: (companionId, delta) => { moveWorkbookCompanion(wb.id, companionId, delta); },
    onReorder: (orderedIds) => { reorderWorkbookCompanions(wb.id, orderedIds); },
    onChanged: () => {
      refreshDetailCompanions(getWorkbook(wb.id));
    },
    onOpenChange: syncCompanionGearButtons,
  });
  refreshDetailCompanions(wb);
}

function buildGpTransportExtra() {
  const wrap = el('div', { class: 'wb-gpp-transport-extra' });

  detailPrevBtn = el('button', {
    class: 'gpp-transport-btn wb-gpp-transport-btn',
    type: 'button',
    'aria-label': 'Previous exercise',
    title: 'Previous exercise',
    html: headIcon('prev'),
    onClick: (e) => { e.stopPropagation(); goPrev(); },
  });

  detailPositionEl = el('span', { class: 'wb-head-position', 'aria-live': 'polite' });

  detailNextBtn = el('button', {
    class: 'gpp-transport-btn wb-gpp-transport-btn',
    type: 'button',
    'aria-label': 'Next exercise',
    title: 'Next exercise',
    html: headIcon('next'),
    onClick: (e) => { e.stopPropagation(); advance(); },
  });

  wrap.append(detailPrevBtn, detailPositionEl, detailNextBtn);
  return wrap;
}

function syncGpWorkbookChrome(wb) {
  syncPositionReadout(wb);
  syncLoopToggle(wb);
  syncTransportDisabled(wb);
  syncPlaylistLabel(wb);
}

function workbookBackShortLabel() {
  const label = workbookBackTarget?.label ?? '← Workbooks';
  return label.replace(/^←\s*/, '') || 'Workbooks';
}

function onWorkbookBackClick(e) {
  e?.stopPropagation?.();
  if (workbookBackTarget) {
    workbookBackTarget.onBack();
    return;
  }
  closeWorkbookDetail();
  render();
}

function syncWorkbookBackControls() {
  const label = workbookBackTarget?.label ?? '← Workbooks';
  const shortLabel = workbookBackShortLabel();
  if (detailBackBtn) detailBackBtn.textContent = label;
  const gpBack = detailBodyEl?.querySelector('.wb-head-back');
  if (gpBack) {
    gpBack.setAttribute('aria-label', `Back to ${shortLabel.toLowerCase()}`);
    gpBack.title = `Back to ${shortLabel.toLowerCase()}`;
    const lbl = gpBack.querySelector('.gpp-btn-label');
    if (lbl) lbl.textContent = shortLabel;
  }
}

function resolveWorkbookEntry(wb, routeExerciseId) {
  if (!wb || !routeExerciseId) return null;
  let entry = wb.entries.find(e => e.id === routeExerciseId);
  if (!entry) entry = wb.entries.find(e => e.exerciseId === routeExerciseId);
  return entry || null;
}

function notifyWorkbookDetailChange(payload) {
  workbookDetailChangeHandlers.forEach((handler) => {
    try { handler(payload); } catch (e) { /* ignore */ }
  });
}

function notifyWorkbookDetailOpen() {
  const workbookId = openWorkbookId;
  if (!workbookId) {
    notifyWorkbookDetailChange({ open: false, workbookId: null, exerciseId: null });
    return;
  }
  const active = getActiveWorkbookEntry(workbookId);
  notifyWorkbookDetailChange({
    open: true,
    workbookId,
    exerciseId: active ? active.entry.id : null,
  });
}

function notifyWorkbookEntryChange() {
  const workbookId = openWorkbookId;
  if (!workbookId) return;
  const active = getActiveWorkbookEntry(workbookId);
  if (!active) return;
  const payload = { workbookId, exerciseId: active.entry.id };
  workbookEntryChangeHandlers.forEach((handler) => {
    try { handler(payload); } catch (e) { /* ignore */ }
  });
  notifyWorkbookDetailOpen();
}

function activateCompanionSubview(workbookId, companionId) {
  const wb = getWorkbook(workbookId);
  if (!wb) return;
  closePlaylistDrawer();
  setWorkbookCompanionCollapsed(workbookId, companionId, false);
  syncDetailTabs(wb);
  if (detailTabsApi) {
    detailTabsApi.setActive('tools');
    detailCompanionsHandle?.refresh?.();
  }
}

function buildGpHeaderExtra(wb) {
  const wrap = el('div', { class: 'wb-gpp-head-extra' });
  const shortLabel = workbookBackShortLabel();

  wrap.appendChild(el('button', {
    class: 'gpp-icon-btn has-label wb-head-back',
    type: 'button',
    'aria-label': `Back to ${shortLabel.toLowerCase()}`,
    title: `Back to ${shortLabel.toLowerCase()}`,
    html: `${headIcon('back')}<span class="gpp-btn-label">${shortLabel}</span>`,
    onClick: onWorkbookBackClick,
  }));

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
    loopLabel,
    detailPlaylistBtn,
    buildCompanionGearButton(),
    detailAddBtnHeader,
  );

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

export function closeWorkbookDetail() {
  teardownDetailPlayer();
  teardownDetailCompanions();
  detailLoadToken += 1;
  detailRenderedWorkbookId = null;
  openWorkbookId = null;
  if (workspaceEl) workspaceEl.classList.remove('is-open');
  if (detailPaneEl) detailPaneEl.hidden = true;
  syncPracticeMode();
  notifyWorkbookDetailChange({ open: false, workbookId: null, exerciseId: null });
}

export function requestWorkbookOpen(id) {
  if (typeof id === 'string' && id) pendingWorkbookOpenId = id;
}

export function openWorkbookForRoute({ workbookId, exerciseId, companionId } = {}) {
  if (typeof workbookId !== 'string' || !workbookId || !getWorkbook(workbookId)) {
    return { ok: false, reason: 'workbook-missing' };
  }

  let wb = getWorkbook(workbookId);
  let targetEntry = null;
  if (exerciseId) {
    targetEntry = resolveWorkbookEntry(wb, exerciseId);
    if (!targetEntry) return { ok: false, reason: 'exercise-missing' };
  }

  if (companionId) {
    const hasCompanion = (wb.companions || []).some(c => c.id === companionId);
    if (!hasCompanion) return { ok: false, reason: 'companion-missing' };
  }

  const sameWorkbook = openWorkbookId === workbookId;

  if (!sameWorkbook) {
    openWorkbookDetail(workbookId);
  } else {
    openWorkbookId = workbookId;
    if (workspaceEl) workspaceEl.classList.add('is-open');
    if (detailPaneEl) detailPaneEl.hidden = false;
    syncPracticeMode();
    syncWorkbookBackControls();
  }

  wb = getWorkbook(workbookId);

  if (companionId) {
    routeDrivenCompanionChange = true;
    try {
      activateCompanionSubview(workbookId, companionId);
    } finally {
      routeDrivenCompanionChange = false;
    }
    return { ok: true };
  }

  if (exerciseId && targetEntry) {
    const active = getActiveWorkbookEntry(workbookId);
    if (!active || active.entry.id !== targetEntry.id) {
      setActiveWorkbookEntry(workbookId, targetEntry.id);
      const fresh = getWorkbook(workbookId);
      syncEntryHighlights(fresh);
      syncPositionReadout(fresh);
      syncPlayerHead(fresh);
      closePlaylistDrawer();
      loadCurrentExercise({ autoPlay: false });
    } else {
      closePlaylistDrawer();
    }
    return { ok: true };
  }

  teardownDetailPlayer();
  openPlaylistDrawer(wb);
  syncEntryHighlights(wb);
  syncPositionReadout(wb);
  syncPlayerHead(wb);
  return { ok: true };
}

export function closeWorkbookLayer() {
  closeWorkbookDetail();
  closePlaylistDrawer();
  workbookBackTarget = null;
}

export function setWorkbookBackTarget(target) {
  if (target && typeof target.onBack === 'function') {
    workbookBackTarget = { label: target.label ?? '← Back', onBack: target.onBack };
  } else {
    workbookBackTarget = null;
  }
  syncWorkbookBackControls();
}

export function onWorkbookEntryChange(handler) {
  if (typeof handler === 'function') workbookEntryChangeHandlers.add(handler);
}

export function onWorkbookDetailChange(handler) {
  if (typeof handler === 'function') workbookDetailChangeHandlers.add(handler);
}

export function onWorkbookCompanionChange(handler) {
  if (typeof handler === 'function') workbookCompanionChangeHandlers.add(handler);
}

function openWorkbookDetail(id) {
  openWorkbookId = id;
  if (workspaceEl) workspaceEl.classList.add('is-open');
  if (detailPaneEl) detailPaneEl.hidden = false;
  syncPracticeMode();
  render();
  notifyWorkbookDetailOpen();
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
    class: danger ? 'btn modal-danger' : 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { closeDialog(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function openFolderDeleteDialog({
  name,
  directCount,
  childFolderCount,
  subtreeWorkbookCount,
  subtreeFolderCount,
  onDeleteFolderOnly,
  onDeleteAll,
}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const workbookWord = subtreeWorkbookCount === 1 ? 'workbook' : 'workbooks';
  const folderWord = subtreeFolderCount === 1 ? 'folder' : 'folders';
  let bodyText = `"${name}" holds `;
  if (childFolderCount > 0 && directCount > 0) {
    bodyText += `${childFolderCount} nested ${childFolderCount === 1 ? 'folder' : 'folders'} and ${directCount} ${directCount === 1 ? 'workbook' : 'workbooks'} directly. `;
  } else if (childFolderCount > 0) {
    bodyText += `${childFolderCount} nested ${childFolderCount === 1 ? 'folder' : 'folders'}. `;
  } else {
    bodyText += `${directCount} ${directCount === 1 ? 'workbook' : 'workbooks'}. `;
  }
  bodyText += 'Delete the folder only and subfolders move up one level while workbooks in this folder become uncategorized, or delete the folder and its whole subtree from this device.';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: `Delete folder "${name}"?` }),
    el('p', { class: 'modal-body', text: bodyText }),
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
    class: 'btn modal-danger',
    type: 'button',
    text: subtreeFolderCount > 1
      ? `Delete folder + ${subtreeFolderCount} ${folderWord} + ${subtreeWorkbookCount} ${workbookWord}`
      : `Delete folder + ${subtreeWorkbookCount} ${workbookWord}`,
    onClick: () => finish(onDeleteAll),
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(() => {}); });
  escapeHandler = (e) => { if (e.key === 'Escape') finish(() => {}); };
  document.addEventListener('keydown', escapeHandler);
  dialogRoot.appendChild(overlay);
}

function openPrompt(title, initialValue, confirmLabel, onConfirm, { maxlength = NAME_LIMIT, onCancel } = {}) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  const input = el('input', {
    type: 'text', class: 'modal-input', value: initialValue || '', maxlength: String(maxlength),
  });
  dialog.appendChild(input);

  let settled = false;
  const cancel = () => {
    closeDialog();
    if (settled) return;
    settled = true;
    if (typeof onCancel === 'function') onCancel();
  };
  const submit = () => {
    const value = input.value;
    closeDialog();
    if (settled) return;
    settled = true;
    onConfirm(value);
  };

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: cancel }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel, onClick: submit,
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') cancel();
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

function mountInlineArtifact(item, host, objectUrl) {
  const kind = mediaKind(item);
  if (item.url) {
    const embedUrl = youtubeEmbedUrl(item.url) || safeExternalUrl(item.url);
    if (!embedUrl) {
      mountNonAdvanceCard(item, host);
      return;
    }
    host.appendChild(el('iframe', {
      class: 'wb-player-frame wb-player-link-frame',
      src: embedUrl,
      title: item.name,
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    }));
    if (!youtubeEmbedUrl(item.url)) {
      host.appendChild(el('div', {
        class: 'wb-player-link-note',
        text: 'If this site blocks embedding, use Open in Exercises.',
      }));
    }
    return;
  }
  if (!objectUrl) {
    host.appendChild(el('div', {
      class: 'wb-player-missing',
      text: 'This file is missing from storage. It may have been cleared by the browser.',
    }));
    return;
  }
  if (kind === 'image') {
    host.appendChild(el('img', {
      class: 'wb-player-image', src: objectUrl, alt: item.name,
    }));
  } else if (kind === 'pdf' || isInlineDocExercise(item)) {
    host.appendChild(el('iframe', {
      class: 'wb-player-frame', src: objectUrl, title: item.name,
    }));
  } else if (isOfficeDocExercise(item)) {
    mountNonAdvanceCard(item, host);
  } else {
    mountNonAdvanceCard(item, host);
  }
}

async function parseGpFromBlob(item, blob, loadToken, workbookId) {
  if (!blob) return { missing: true };
  try {
    let gp;
    if (isTabModelItem(item)) {
      const raw = JSON.parse(await blob.text());
      if (isDetailLoadStale(loadToken, workbookId)) return { stale: true };
      gp = gpResultFromTabModelJson(raw, { fallbackName: item.name || 'Exercise' });
    } else {
      const buf = await blob.arrayBuffer();
      if (isDetailLoadStale(loadToken, workbookId)) return { stale: true };
      gp = await parseGuitarPro(buf);
      if (isDetailLoadStale(loadToken, workbookId)) return { stale: true };
    }
    return { gp };
  } catch (err) {
    return { error: err };
  }
}

function onDetailGpPracticeSettingsChange(wb, item, sliced, settings) {
  const patch = filterPracticeSettingsPatch(settings, { sliced });
  updateExercisePracticeSettings(item.id, patch);
  if (patch.loopEnabled == null) return;
  const enabled = !!patch.loopEnabled;
  const current = getWorkbook(wb.id);
  const loopChanged = !!current?.loopEnabled !== enabled;
  setWorkbookLoop(wb.id, enabled);
  if (detailLoopInput) detailLoopInput.checked = enabled;
  // Remount only when Loop actually changes. A mount emit also sends loopEnabled.
  if (loopChanged) {
    loadCurrentExercise({ autoPlay: getDetailPlayingState() });
  }
}

function mountDetailGpPlayer(host, wb, item, {
  gpResult,
  sliced = false,
  onPlaybackEnd,
  onPlaybackTick = null,
  autoPlay = false,
  initialLoopEnabled = null,
  loopRange = {},
  loopRestSec = 0,
  initialBpm = undefined,
  scoreKey = undefined,
  exerciseScope = false,
  onPracticeSettingsChange = null,
}) {
  const transportExtra = buildGpTransportExtra();
  const headerExtra = buildGpHeaderExtra(wb);
  syncGpWorkbookChrome(wb);
  const resolvedScoreKey = scoreKey !== undefined
    ? scoreKey
    : (sliced ? undefined : resolveScoreKey({
      attachmentId: item.attachmentId,
      fileName: item.fileName || item.name,
    }));
  return mountGpPlayer(host, {
    gpResult,
    title: item.name,
    fileName: item.fileName || item.name,
    hideTitle: true,
    preferredTrackIndex: Number.isFinite(item.preferredTrackIndex) ? item.preferredTrackIndex : 0,
    initialLoopEnabled: initialLoopEnabled ?? wb.loopEnabled,
    ...loopRange,
    loopRestSec,
    initialBpm,
    initialTranspose: item.transpose,
    initialTuning: item.tuning,
    initialRetuneMode: item.retuneMode,
    exerciseScope,
    headerExtra,
    transportExtra,
    onPracticeSettingsChange: onPracticeSettingsChange || ((settings) => {
      onDetailGpPracticeSettingsChange(wb, item, sliced, settings);
    }),
    scoreKey: resolvedScoreKey,
    onPlaybackEnd,
    onPlaybackTick,
    autoPlay,
    enableHostKeyboard: false,
  });
}

function syncPlaythroughPosition(info) {
  if (!detailPlaythrough?.boundaries) return;
  const beat = Number(info?.beat);
  const entryId = Number.isFinite(beat)
    ? entryIdAtBeat(detailPlaythrough.boundaries, beat)
    : entryIdAtMeasure(detailPlaythrough.boundaries, info?.measureIndex);
  if (!entryId) return;
  const wb = getWorkbook(openWorkbookId);
  if (!wb || wb.activeEntryId === entryId) return;
  setActiveWorkbookEntry(wb.id, entryId);
  const fresh = getWorkbook(wb.id);
  syncEntryHighlights(fresh);
  syncPositionReadout(fresh);
  syncPlayerHead(fresh);
  notifyWorkbookEntryChange();
}

function onPlaythroughEnd() {
  const wb = getWorkbook(openWorkbookId);
  if (!wb || !wb.entries.length) return;
  const boundaries = detailPlaythrough?.boundaries;
  let nextIndex = 0;
  if (boundaries?.length) {
    const lastBoundary = boundaries[boundaries.length - 1];
    const lastIdx = wb.entries.findIndex((entry) => entry.id === lastBoundary.entryId);
    if (lastIdx >= 0) {
      nextIndex = (lastIdx + 1) % wb.entries.length;
    } else {
      const active = getActiveWorkbookEntry(wb.id);
      nextIndex = active ? (active.index + 1) % wb.entries.length : 0;
    }
  } else {
    const active = getActiveWorkbookEntry(wb.id);
    nextIndex = active ? (active.index + 1) % wb.entries.length : 0;
  }
  moveToWorkbookEntry(wb.entries[nextIndex].id, { autoPlay: true });
}

function moveToWorkbookEntry(entryId, { autoPlay } = {}) {
  const wb = getWorkbook(openWorkbookId);
  if (!wb) return;
  const wasPlaying = autoPlay === undefined ? getDetailPlayingState() : !!autoPlay;
  if (wasPlaying) ensureAudio();

  if (detailPlaythrough?.boundaries) {
    const boundary = boundaryForEntry(detailPlaythrough.boundaries, entryId);
    if (boundary) {
      setActiveWorkbookEntry(wb.id, entryId);
      const fresh = getWorkbook(wb.id);
      syncEntryHighlights(fresh);
      syncPositionReadout(fresh);
      syncPlayerHead(fresh);
      notifyWorkbookEntryChange();
      if (detailMountHandle?.seekToBeat) {
        try {
          detailMountHandle.seekToBeat(boundary.startBeat, { autoplay: wasPlaying });
        } catch (err) {
          showAppToast(err?.message);
        }
      } else if (detailMountHandle?.seekToBar) {
        try {
          detailMountHandle.seekToBar(boundary.startMeasure, { autoplay: wasPlaying });
        } catch (err) {
          showAppToast(err?.message);
        }
      }
      return;
    }
  }

  setActiveWorkbookEntry(wb.id, entryId);
  const fresh = getWorkbook(wb.id);
  syncEntryHighlights(fresh);
  syncPositionReadout(fresh);
  syncPlayerHead(fresh);
  notifyWorkbookEntryChange();
  loadCurrentExercise({ autoPlay: wasPlaying });
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
    const parsed = await parseGpFromBlob(item, blob, loadToken, wb.id);
    if (parsed.stale) return null;
    if (parsed.missing || parsed.error || !parsed.gp) {
      if (!isDetailLoadStale(loadToken, wb.id)) {
        host.appendChild(el('div', {
          class: 'wb-player-missing',
          text: parsed.error?.message || 'Could not open this Guitar Pro file.',
        }));
      }
      return null;
    }
    if (isDetailLoadStale(loadToken, wb.id)) return null;
    const { gp: exerciseGp, sliced } = buildExerciseGpResult(parsed.gp, item);
    const segment = isSegmentExercise(item);
    const loopRange = segment && !sliced ? {
      initialLoopStart: item.measureStart,
      initialLoopEnd: item.measureEnd,
      initialLoopStartBeat: item.startBeat,
      initialLoopEndBeat: item.endBeat,
    } : {};
    return mountDetailGpPlayer(host, wb, item, {
      gpResult: exerciseGp,
      sliced,
      onPlaybackEnd,
      autoPlay,
      loopRange,
      loopRestSec: item.loopRestSec || 0,
      initialBpm: item.bpm,
      exerciseScope: segment && !sliced,
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

async function mountWorkbookGpPlaythrough(wb, active, host, loadToken, autoPlay) {
  const classified = wb.entries.map((entry) => {
    const exercise = getExercise(entry.exerciseId);
    return { id: entry.id, isGp: exercise ? mediaKind(exercise) === 'gp' : false };
  });

  const run = findConsecutiveGpRun(classified, active.index);
  if (!run) return false;

  const parts = [];
  const slicedByEntry = new Map();

  for (let i = run.startIndex; i <= run.endIndex; i += 1) {
    const entry = wb.entries[i];
    const item = getExercise(entry.exerciseId);
    if (!item || mediaKind(item) !== 'gp') continue;

    const blob = item.attachmentId ? await getFileBlob(item.attachmentId) : null;
    if (isDetailLoadStale(loadToken, wb.id)) return true;

    if (!blob) {
      if (entry.id === active.entry.id) {
        host.appendChild(el('div', {
          class: 'wb-player-missing',
          text: 'This file is missing from storage. It may have been cleared by the browser.',
        }));
        return true;
      }
      continue;
    }

    const parsed = await parseGpFromBlob(item, blob, loadToken, wb.id);
    if (parsed.stale) return true;
    if (parsed.missing || parsed.error || !parsed.gp) {
      if (entry.id === active.entry.id) {
        host.appendChild(el('div', {
          class: 'wb-player-missing',
          text: parsed.error?.message || 'Could not open this Guitar Pro file.',
        }));
        return true;
      }
      continue;
    }

    const { gp: exerciseGp, sliced } = buildExerciseGpResult(parsed.gp, item);
    slicedByEntry.set(entry.id, sliced);
    parts.push({
      entryId: entry.id,
      gp: exerciseGp,
      name: item.name,
      tempo: Number(item.bpm) > 0 ? Number(item.bpm) : undefined,
      item,
    });
  }

  if (isDetailLoadStale(loadToken, wb.id)) return true;

  if (!parts.some((part) => part.entryId === active.entry.id)) {
    if (!host.querySelector('.wb-player-missing')) {
      host.appendChild(el('div', {
        class: 'wb-player-missing',
        text: 'This file is missing from storage. It may have been cleared by the browser.',
      }));
    }
    return true;
  }

  const built = buildPlaythroughScore(parts);
  if (!built) return false;

  const activePart = parts.find((part) => part.entryId === active.entry.id);
  const activeItem = activePart?.item || getExercise(active.entry.exerciseId);
  if (!activeItem) return false;

  const singlePart = parts.length === 1;
  const activeSliced = slicedByEntry.get(active.entry.id) || false;

  const handle = mountDetailGpPlayer(host, wb, activeItem, {
    gpResult: built.gp,
    sliced: activeSliced,
    onPlaybackEnd: onPlaythroughEnd,
    onPlaybackTick: syncPlaythroughPosition,
    autoPlay: false,
    initialLoopEnabled: false,
    loopRestSec: 0,
    initialBpm: singlePart ? activeItem.bpm : undefined,
    scoreKey: singlePart && !activeSliced
      ? resolveScoreKey({
        attachmentId: activeItem.attachmentId,
        fileName: activeItem.fileName || activeItem.name,
      })
      : undefined,
    exerciseScope: false,
    onPracticeSettingsChange: (settings) => {
      const freshWb = getWorkbook(wb.id);
      const activeNow = freshWb ? getActiveWorkbookEntry(freshWb.id) : null;
      const practiceItem = activeNow ? getExercise(activeNow.entry.exerciseId) : null;
      if (!practiceItem) return;
      onDetailGpPracticeSettingsChange(freshWb, practiceItem, false, settings);
    },
  });

  if (isDetailLoadStale(loadToken, wb.id)) {
    if (handle) try { handle.destroy(); } catch (e) { /* ignore */ }
    return true;
  }

  detailMountHandle = handle;
  detailPlaythrough = { boundaries: built.boundaries };
  setDetailGpChrome(true);

  const boundary = boundaryForEntry(built.boundaries, active.entry.id);
  if (boundary && handle) {
    if (handle.seekToBeat) {
      handle.seekToBeat(boundary.startBeat, { autoplay: autoPlay });
    } else if (handle.seekToBar) {
      handle.seekToBar(boundary.startMeasure, { autoplay: autoPlay });
    }
  }

  return true;
}

// `autoPlay` is explicit for auto-advance: playback has already stopped by the
// time the end-of-score callback runs, so the playing state cannot be inferred.
function advance({ autoPlay } = {}) {
  const wb = getWorkbook(openWorkbookId);
  if (!wb || !wb.entries.length) return;
  const active = getActiveWorkbookEntry(wb.id);
  if (!active) return;
  const nextIndex = (active.index + 1) % wb.entries.length;
  moveToWorkbookEntry(wb.entries[nextIndex].id, { autoPlay });
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

    if (kind === 'gp') {
      detailGpMountEl.innerHTML = '';
      if (!wb.loopEnabled) {
        const playthroughMounted = await mountWorkbookGpPlaythrough(
          wb, active, detailGpMountEl, loadToken, autoPlay,
        );
        if (isDetailLoadStale(loadToken, workbookId)) return;
        if (playthroughMounted) return;
      }
      const blob = exercise.attachmentId ? await getFileBlob(exercise.attachmentId) : null;
      if (isDetailLoadStale(loadToken, workbookId)) return;
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
        playsinline: '',
        'webkit-playsinline': '',
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
    if (exercise.attachmentId || exercise.url) {
      if (kind === 'audio' || kind === 'video') {
        // handled above — should not reach here
      } else {
        let blob = null;
        if (exercise.attachmentId) {
          blob = await getFileBlob(exercise.attachmentId);
          if (isDetailLoadStale(loadToken, workbookId)) return;
        }
        if (blob) detailObjectURL = URL.createObjectURL(blob);
        mountInlineArtifact(exercise, detailGpMountEl, detailObjectURL);
        return;
      }
    }
    mountNonAdvanceCard(exercise, detailGpMountEl);
  } catch (err) {
    if (!isDetailLoadStale(loadToken, workbookId)) {
      setStatus(err?.message || 'Could not load this exercise.', true);
      showAppToast(err?.message);
      if (detailGpMountEl) {
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
  const active = getActiveWorkbookEntry(wb.id);
  if (!active) return;
  const prevIndex = (active.index - 1 + wb.entries.length) % wb.entries.length;
  moveToWorkbookEntry(wb.entries[prevIndex].id);
}

function onLoopToggleChange(enabled) {
  const wb = getWorkbook(openWorkbookId);
  if (!wb) return;
  setWorkbookLoop(wb.id, enabled);
  if (detailMediaEl) detailMediaEl.loop = enabled;
  if (detailMountHandle) {
    loadCurrentExercise({ autoPlay: getDetailPlayingState() });
  }
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
    closePlaylistDrawer();
    moveToWorkbookEntry(entry.id, { autoPlay: false });
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
  const transportTools = el('div', { class: 'wb-transport-tools' });
  transportTools.appendChild(buildCompanionGearButton());
  transport.appendChild(transportTools);
  controls.appendChild(transport);
  player.appendChild(controls);

  detailTabsEl = el('div', {
    id: 'wb-detail-tabs',
    class: 'subview-tabs wb-detail-tabs',
    hidden: true,
  });

  detailPanesEl = el('div', { class: 'wb-detail-panes' });

  detailGpMountEl = el('div', {
    class: 'wb-gp-mount subview-panel active',
    'data-subview-for': 'wb-detail-tabs',
    'data-subview': 'exercise',
  });
  detailCompanionsMountEl = el('div', {
    class: 'wb-companions-mount subview-panel',
    'aria-label': 'Workbook tools',
    'data-subview-for': 'wb-detail-tabs',
    'data-subview': 'tools',
    hidden: true,
  });

  detailPanesEl.appendChild(detailGpMountEl);
  detailPanesEl.appendChild(detailCompanionsMountEl);
  player.appendChild(detailTabsEl);
  player.appendChild(detailPanesEl);

  detailTabsApi = null;
  detailHadCompanions = false;

  mountDetailCompanionUi(wb);
  syncDetailTabs(wb);

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

// --- library browser ---------------------------------------------------------
//
// The browser itself lives in js/library/driveBrowser.js. Exercises builds the
// same browser with its own data, so both libraries navigate the same way.

/** Wraps the modal prompt so the browser can await a name. */
function promptForName({ title, value, confirmLabel }) {
  return new Promise((resolve) => {
    openPrompt(title, value, confirmLabel, (name) => resolve(name), {
      maxlength: FOLDER_LIMIT,
      onCancel: () => resolve(null),
    });
  });
}

function describeWorkbookRow(wb) {
  const entryCount = wb.entries.length;
  return {
    id: wb.id,
    name: wb.name,
    typeLabel: 'Workbook',
    // The third column counts exercises here, so a sort on it is useful.
    size: entryCount,
    sizeText: pluralExercises(entryCount),
    modifiedAt: wb.updatedAt || wb.createdAt || '',
    iconHtml: WORKBOOK_ICON,
  };
}

function workbookRowMenuExtras(wb) {
  return [{
    label: wb.loopEnabled ? 'Turn loop off' : 'Turn loop on',
    onClick: () => {
      setWorkbookLoop(wb.id, !wb.loopEnabled);
      render();
    },
  }];
}

function buildBrowser() {
  if (!listEl) return null;
  return createDriveBrowser({
    ns: 'workbooks',
    rootLabel: 'My Workbooks',
    itemNoun: { one: 'workbook', many: 'workbooks' },
    sizeLabel: 'Exercises',
    els: {
      nav: folderListEl,
      crumbs: crumbsEl,
      tools: toolsEl,
      selectionBar: bulkBarEl,
      content: listEl,
    },
    listFolders: () => listWorkbookFolders(),
    listItems: () => listWorkbooks({}),
    itemFolderId: (wb) => wb.folderId,
    describeItem: describeWorkbookRow,
    isItemOpen: (wb) => wb.id === openWorkbookId,
    openItem: (wb) => openWorkbookDetail(wb.id),
    itemMenuExtras: workbookRowMenuExtras,
    renameItem: (id, name) => renameWorkbook(id, name),
    deleteItems: (ids) => {
      let removed = 0;
      ids.forEach((id) => {
        if (openWorkbookId === id) closeWorkbookDetail();
        if (deleteWorkbook(id)) removed += 1;
      });
      return removed;
    },
    moveItems: (ids, folderId) => {
      ids.forEach((id) => setWorkbookFolder(id, folderId));
    },
    createFolder: (name, parentId) => onCreateFolder(name, parentId),
    renameFolder: (id, name) => renameWorkbookFolder(id, name),
    moveFolder: (id, parentId) => moveWorkbookFolder(id, parentId),
    requestDeleteFolder: (id, name) => onDeleteFolder(id, name),
    newMenuExtras: (folderId) => ([{
      label: 'New workbook',
      onClick: () => onNewWorkbook(folderId),
    }]),
    emptyRootTitle: 'No workbooks yet',
    emptyHint: 'Use + New to make a workbook, then add exercises to it from your library.',
    prompt: promptForName,
    toast: setStatus,
    onNavigate: (folderId) => {
      selectedFolder = folderId;
    },
  });
}

/** Creates a folder next to its siblings and reports the outcome to the browser. */
function onCreateFolder(name, parentId) {
  const clean = (name || '').trim();
  if (!clean) return { ok: false, reason: 'empty' };

  const folders = listWorkbookFolders();
  const parent = parentId && folders.some(f => f.id === parentId) ? parentId : '';
  if (parent && folderDepth(folders, parent) + 1 > MAX_FOLDER_DEPTH) {
    return { ok: false, reason: 'depth' };
  }

  const existing = findSiblingByName(folders, parent, clean);
  if (existing) {
    setStatus(`Folder "${existing.name}" already exists here.`);
    return { ok: true, id: existing.id, reason: '' };
  }

  const folder = createWorkbookFolder(clean, parent);
  if (!folder) return { ok: false, reason: 'depth' };
  setStatus(`Created folder "${folder.name}".`);
  return { ok: true, id: folder.id, reason: '' };
}

function renderList() {
  if (browser) {
    browser.render();
    selectedFolder = browser.getFolderId();
  }
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
    teardownDetailCompanions();
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
  syncWorkbookBackControls();
  refreshPracticeMetrics();
}

function render() {
  if (selectedFolder && !listWorkbookFolders().some(f => f.id === selectedFolder)) {
    selectedFolder = '';
  }
  if (openWorkbookId && !getWorkbook(openWorkbookId)) {
    closeWorkbookDetail();
  }
  renderList();
  renderDetail();
}

function onRenameFolder(id, current) {
  openPrompt('Rename folder', current, 'Save', (name) => {
    if (renameWorkbookFolder(id, name)) render();
  }, { maxlength: FOLDER_LIMIT });
}

function onDeleteFolder(id, name) {
  const opts = getWorkbookFolderOptions();
  const folders = listWorkbookFolders();
  const subtreeIds = folderSubtreeIds(folders, id);
  const childFolderCount = opts.filter(o => o.parentId === id).length;
  const directCount = listWorkbooks({ folderId: id }).length;
  const subtreeWorkbookCount = listWorkbooks({ folderId: id, includeDescendants: true }).length;
  const subtreeFolderTotal = subtreeIds.size;
  // Read the parent before the delete, while the folder still exists.
  const parentId = nextParentAfterDelete(folders, id);
  const insideDeleted = subtreeIds.has(selectedFolder);
  const leaveDeletedFolder = () => {
    if (!insideDeleted) {
      render();
      return;
    }
    if (browser) browser.navigateTo(parentId);
    else { selectedFolder = parentId; render(); }
  };

  if (directCount === 0 && childFolderCount === 0) {
    openConfirm(
      `Delete folder "${name}"?`,
      'This folder is empty.',
      'Delete',
      () => {
        deleteWorkbookFolder(id);
        leaveDeletedFolder();
      },
      { danger: true },
    );
    return;
  }
  openFolderDeleteDialog({
    name,
    directCount,
    childFolderCount,
    subtreeWorkbookCount,
    subtreeFolderCount: subtreeFolderTotal,
    onDeleteFolderOnly: () => {
      deleteWorkbookFolder(id);
      leaveDeletedFolder();
      const word = directCount === 1 ? 'workbook' : 'workbooks';
      setStatus(`Deleted folder "${name}". ${directCount} ${word} ${directCount === 1 ? 'is' : 'are'} now uncategorized. Subfolders moved up one level.`);
    },
    onDeleteAll: () => {
      const openWb = openWorkbookId ? getWorkbook(openWorkbookId) : null;
      if (openWb && subtreeIds.has(openWb.folderId)) closeWorkbookDetail();
      const { deleted } = deleteWorkbookFolderWithContents(id);
      leaveDeletedFolder();
      const wbWord = deleted === 1 ? 'workbook' : 'workbooks';
      const fWord = subtreeFolderTotal === 1 ? 'folder' : 'folders';
      setStatus(`Deleted folder "${name}" and ${subtreeFolderTotal} ${fWord} with ${deleted} ${wbWord}.`);
    },
  });
}

function onNewWorkbook(folderId) {
  const target = folderId === undefined ? selectedFolder : folderId;
  openPrompt('New workbook', '', 'Create', (name) => {
    const clean = (name || '').trim();
    if (!clean) {
      setStatus('Enter a workbook name.', true);
      return;
    }
    const wb = createWorkbook({ name: clean, folderId: target || '' });
    openWorkbookDetail(wb.id);
    setStatus('Workbook created.');
  }, { maxlength: NAME_LIMIT });
}

function wireEscape() {
  if (escapeWired) return;
  escapeWired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dialogRoot && dialogRoot.children.length) return;
    if (companionPanel?.isOpen()) {
      companionPanel.close();
      return;
    }
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
  crumbsEl = document.getElementById('wb-crumbs');
  toolsEl = document.getElementById('wb-tools');
  bulkBarEl = document.getElementById('wb-bulk-bar');
  statusEl = document.getElementById('wb-status');
  listEl = document.getElementById('wb-list');
  workspaceEl = document.getElementById('wb-workspace');
  detailPaneEl = document.getElementById('wb-detail-pane');
  detailTitleEl = document.getElementById('wb-detail-title');
  detailActionsEl = document.getElementById('wb-detail-actions');
  detailBodyEl = document.getElementById('wb-detail-body');
  detailBackBtn = document.getElementById('wb-detail-back');

  if (!listEl) return;

  if (!bound) {
    bound = true;
    if (detailBackBtn) {
      detailBackBtn.addEventListener('click', onWorkbookBackClick);
    }
    wireEscape();
    wireWorkbookShortcuts();
    browser = buildBrowser();
    selectedFolder = browser ? browser.getFolderId() : '';
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
  closeDriveMenu();
  closeWorkbookDetail();
  if (browser) browser.clearSelection();
}
