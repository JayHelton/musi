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
  moveWorkbookFolder,
  deleteWorkbookFolder,
  deleteWorkbookFolderWithContents,
  getWorkbookFolderOptions,
  getWorkbookFolderPath,
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
  validMoveTargets,
} from './folderTree.js';
import { mountCompanions } from './exerciseCompanions/index.js';
import { mountWorkbookCompanionPanel } from './workbookCompanionPanel.js';
import { initSubviewTabs } from './uxPrimitives.js';
import { resolveWorkbookShortcutAction, WB_KEY_ACTIONS } from './workbookKeyboard.js';
import { GPP_TRANSPORT_BPM_STEP } from './gpPlayer/transportDock.js';

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
let shortcutWired = false;

let folderListEl, titleEl, statusEl, listEl, workspaceEl, detailPaneEl, detailTitleEl;
let detailActionsEl, detailBodyEl, detailBackBtn, newBtn, addFolderForm, addFolderInput;

let dialogRoot = null;

// Collapsed folder ids. Folders start expanded when absent from this set.
const collapsedFolders = new Set();

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
const workbookCompanionChangeHandlers = new Set();
let routeDrivenCompanionChange = false;

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function folderLabel(folderId) {
  if (!folderId) return 'No folder';
  const path = getWorkbookFolderPath(folderId);
  return path || 'No folder';
}

function currentTitleText() {
  if (selectedFolder === 'all') return 'All Workbooks';
  if (selectedFolder === 'uncategorized') return 'No folder';
  const opt = getWorkbookFolderOptions().find(o => o.id === selectedFolder);
  if (!opt) return 'All Workbooks';
  return opt.path || opt.label;
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
      detailCompanionsHandle?.stop?.();
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
          detailCompanionsHandle?.stop?.();
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

function notifyWorkbookEntryChange() {
  const workbookId = openWorkbookId;
  if (!workbookId) return;
  const active = getActiveWorkbookEntry(workbookId);
  if (!active) return;
  const payload = { workbookId, exerciseId: active.entry.id };
  workbookEntryChangeHandlers.forEach((handler) => {
    try { handler(payload); } catch (e) { /* ignore */ }
  });
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

function closeWorkbookDetail() {
  teardownDetailPlayer();
  teardownDetailCompanions();
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

export function onWorkbookCompanionChange(handler) {
  if (typeof handler === 'function') workbookCompanionChangeHandlers.add(handler);
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

function moveFolderBlockMessage(reason) {
  switch (reason) {
    case 'self':
      return 'A folder cannot move into itself.';
    case 'descendant':
      return 'A folder cannot move into one of its own subfolders.';
    case 'depth':
      return 'That move would exceed the folder depth limit.';
    case 'parent-missing':
      return 'The chosen parent folder no longer exists.';
    case 'missing':
      return 'That folder no longer exists.';
    default:
      return 'That move is not allowed.';
  }
}

function folderSelectIndent(depth) {
  return '\u2003'.repeat(Math.max(0, Number(depth) - 1));
}

function openFolderMoveDialog(folderId, folderName) {
  const folders = listWorkbookFolders();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const currentParent = folder.parentId || '';
  const targets = validMoveTargets(folders, folderId);

  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: `Move folder "${folderName}"` }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: 'Pick a new parent. The folder and everything inside it move together.',
  }));

  const select = el('select', { class: 'modal-input wb-folder-move-select', 'aria-label': 'Parent folder' });
  const topOpt = el('option', { value: '', text: 'Top level (no parent)' });
  if (!currentParent) topOpt.selected = true;
  select.appendChild(topOpt);
  for (const row of targets) {
    const opt = el('option', {
      value: row.id,
      text: `${folderSelectIndent(row.depth)}${row.name}`,
    });
    if (row.id === currentParent) opt.selected = true;
    select.appendChild(opt);
  }
  dialog.appendChild(select);

  const errorEl = el('div', { class: 'modal-errors' });
  dialog.appendChild(errorEl);

  const actions = el('div', { class: 'modal-actions' });
  let escapeHandler = null;
  const finish = () => {
    if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
    closeDialog();
  };
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: finish,
  }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: 'Save',
    onClick: () => {
      const result = moveWorkbookFolder(folderId, select.value);
      if (!result.ok) {
        errorEl.textContent = moveFolderBlockMessage(result.reason);
        return;
      }
      finish();
      render();
      setStatus(`Moved folder "${folderName}".`);
    },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(); });
  escapeHandler = (e) => { if (e.key === 'Escape') finish(); };
  document.addEventListener('keydown', escapeHandler);
  dialogRoot.appendChild(overlay);
  setTimeout(() => select.focus(), 40);
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
    const transportExtra = buildGpTransportExtra();
    const headerExtra = buildGpHeaderExtra(wb);
    syncGpWorkbookChrome(wb);
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
      headerExtra,
      transportExtra,
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
      enableHostKeyboard: false,
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
  notifyWorkbookEntryChange();
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
  notifyWorkbookEntryChange();
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
    notifyWorkbookEntryChange();
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

function folderHasChildFolders(folderId, opts) {
  return opts.some(o => o.parentId === folderId);
}

function isFolderRowVisible(opt, opts) {
  if (opt.id === 'all' || opt.id === 'uncategorized') return true;
  let parentId = opt.parentId;
  while (parentId) {
    if (collapsedFolders.has(parentId)) return false;
    const parent = opts.find(o => o.id === parentId);
    parentId = parent?.parentId || '';
  }
  return true;
}

function newFolderPlaceholder() {
  if (selectedFolder === 'all' || selectedFolder === 'uncategorized') return 'New folder';
  const opt = getWorkbookFolderOptions().find(o => o.id === selectedFolder);
  const label = opt?.label || 'folder';
  return `New folder in ${label}`;
}

function renderFolders() {
  if (!folderListEl) return;
  folderListEl.innerHTML = '';
  if (addFolderInput) addFolderInput.placeholder = newFolderPlaceholder();

  const opts = getWorkbookFolderOptions();

  const makeRow = (key, name, count, rowOpts = {}) => {
    const depth = rowOpts.depth || 0;
    const row = el('div', {
      class: 'wb-folder-item' + (selectedFolder === key ? ' is-active' : ''),
      'data-folder': key,
      'data-depth': String(depth),
      role: 'button',
      tabindex: '0',
      'aria-pressed': selectedFolder === key ? 'true' : 'false',
    });
    if (rowOpts.hasChildren) {
      const expanded = !collapsedFolders.has(key);
      const twisty = el('button', {
        class: 'wb-folder-twisty' + (expanded ? ' is-expanded' : ''),
        type: 'button',
        title: expanded ? 'Collapse folder' : 'Expand folder',
        'aria-label': expanded ? `Collapse ${name}` : `Expand ${name}`,
        'aria-expanded': expanded ? 'true' : 'false',
        html: expanded ? '&#9662;' : '&#9656;',
        onClick: (e) => {
          e.stopPropagation();
          if (collapsedFolders.has(key)) collapsedFolders.delete(key);
          else collapsedFolders.add(key);
          renderFolders();
        },
      });
      row.appendChild(twisty);
    } else if (rowOpts.editable) {
      row.appendChild(el('span', { class: 'wb-folder-twisty-spacer', 'aria-hidden': 'true' }));
    }
    // A deep row can clip the name, so the tooltip carries the full path.
    row.appendChild(el('span', { class: 'wb-folder-name', text: name, title: rowOpts.path || name }));
    row.appendChild(el('span', { class: 'wb-folder-count', text: String(count) }));
    const select = () => {
      selectedFolder = key;
      render();
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('.wb-folder-tool, .wb-folder-twisty')) return;
      select();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
    if (rowOpts.editable) {
      const tools = el('div', { class: 'wb-folder-tools' });
      tools.appendChild(el('button', {
        class: 'wb-folder-tool', type: 'button', title: 'Rename folder', 'aria-label': `Rename ${name}`,
        html: '&#9998;', onClick: (e) => { e.stopPropagation(); onRenameFolder(rowOpts.id, name); },
      }));
      tools.appendChild(el('button', {
        class: 'wb-folder-tool wb-folder-move', type: 'button', title: 'Move folder', 'aria-label': `Move ${name}`,
        html: '&#8644;', onClick: (e) => { e.stopPropagation(); openFolderMoveDialog(rowOpts.id, name); },
      }));
      tools.appendChild(el('button', {
        class: 'wb-folder-tool wb-folder-del', type: 'button', title: 'Delete folder', 'aria-label': `Delete ${name}`,
        html: '&#10005;', onClick: (e) => { e.stopPropagation(); onDeleteFolder(rowOpts.id, name); },
      }));
      row.appendChild(tools);
    }
    folderListEl.appendChild(row);
  };

  opts.forEach(opt => {
    if (!isFolderRowVisible(opt, opts)) return;
    const editable = opt.id !== 'all' && opt.id !== 'uncategorized';
    makeRow(opt.id, opt.label, opt.count, editable ? {
      editable: true,
      id: opt.id,
      depth: opt.depth,
      path: opt.path,
      hasChildren: folderHasChildFolders(opt.id, opts),
    } : { depth: opt.depth });
  });
}

function buildFolderSelect(wb) {
  const select = el('select', { class: 'wb-card-folder-select', 'aria-label': 'Folder' });
  select.appendChild(el('option', { value: '', text: 'No folder' }));
  getWorkbookFolderOptions().forEach(opt => {
    if (opt.id === 'all' || opt.id === 'uncategorized') return;
    const optEl = el('option', {
      value: opt.id,
      text: `${folderSelectIndent(opt.depth)}${opt.label}`,
    });
    if (opt.id === wb.folderId) optEl.selected = true;
    select.appendChild(optEl);
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

  const items = listWorkbooks({ folderId: selectedFolder, includeDescendants: true });
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
  const opts = getWorkbookFolderOptions();
  const folders = listWorkbookFolders();
  const subtreeIds = folderSubtreeIds(folders, id);
  const childFolderCount = opts.filter(o => o.parentId === id).length;
  const directCount = listWorkbooks({ folderId: id }).length;
  const subtreeWorkbookCount = listWorkbooks({ folderId: id, includeDescendants: true }).length;
  const subtreeFolderTotal = subtreeIds.size;

  if (directCount === 0 && childFolderCount === 0) {
    openConfirm(
      `Delete folder "${name}"?`,
      'This folder is empty.',
      'Delete',
      () => {
        deleteWorkbookFolder(id);
        collapsedFolders.delete(id);
        if (selectedFolder === id) selectedFolder = 'all';
        render();
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
      collapsedFolders.delete(id);
      if (selectedFolder === id) selectedFolder = 'all';
      render();
      const word = directCount === 1 ? 'workbook' : 'workbooks';
      setStatus(`Deleted folder "${name}". ${directCount} ${word} ${directCount === 1 ? 'is' : 'are'} now uncategorized. Subfolders moved up one level.`);
    },
    onDeleteAll: () => {
      const openWb = openWorkbookId ? getWorkbook(openWorkbookId) : null;
      if (openWb && subtreeIds.has(openWb.folderId)) closeWorkbookDetail();
      const { deleted } = deleteWorkbookFolderWithContents(id);
      collapsedFolders.delete(id);
      if (selectedFolder === id || subtreeIds.has(selectedFolder)) selectedFolder = 'all';
      render();
      const wbWord = deleted === 1 ? 'workbook' : 'workbooks';
      const fWord = subtreeFolderTotal === 1 ? 'folder' : 'folders';
      setStatus(`Deleted folder "${name}" and ${subtreeFolderTotal} ${fWord} with ${deleted} ${wbWord}.`);
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
      detailBackBtn.addEventListener('click', onWorkbookBackClick);
    }
    if (addFolderForm) {
      addFolderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = addFolderInput?.value || '';
        const clean = name.trim();
        if (!clean) {
          setStatus('Enter a folder name.', true);
          addFolderInput?.focus();
          return;
        }
        const parentId = createFolderIdForSelection();
        if (parentId) {
          const depth = folderDepth(listWorkbookFolders(), parentId);
          if (depth + 1 > MAX_FOLDER_DEPTH) {
            setStatus(`Folders can nest at most ${MAX_FOLDER_DEPTH} levels deep.`, true);
            addFolderInput?.focus();
            return;
          }
        }
        const existing = findSiblingByName(listWorkbookFolders(), parentId, clean);
        if (existing) {
          selectedFolder = existing.id;
          if (addFolderInput) addFolderInput.value = '';
          setStatus(`Folder "${existing.name}" already exists.`);
          render();
          return;
        }
        const folder = createWorkbookFolder(name, parentId);
        if (folder) {
          selectedFolder = folder.id;
          if (addFolderInput) addFolderInput.value = '';
          setStatus(`Created folder "${folder.name}". New workbooks land here.`);
          render();
        }
      });
    }
    wireEscape();
    wireWorkbookShortcuts();
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
