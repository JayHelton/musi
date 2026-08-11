/**
 * Train objective workspace. Today, Plans, Library, Fundamentals, and Progress.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams, openPanel } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';
import { listRoutines, setActiveRoutineSession, setRoutineSessionCompleted } from '../routineModel.js';
import { getWorkbook } from '../workbookModel.js';
import { getExercise } from '../exercises.js';
import { openWorkbookById, subscribeWorkbookEntry } from '../workbooks.js';
import { getStatsSnapshot } from '../stats.js';
import {
  listAttempts,
  dueColdTests,
  getTargetSummary,
  logAttempt,
} from '../progress/progressLog.js';
import { describeRef } from '../library/libraryService.js';
import {
  startSession,
  endSession,
  resumeSession,
  pauseSession,
  hasActiveSession,
  restoreSession,
  getSession,
  recordAttempt,
  subscribeSession,
  setActiveItem,
} from '../practice/practiceSession.js';
import { mountPracticeBar, isPracticeBarMounted } from '../ui/practiceBar.js';

export const TRAIN_SECTIONS = {
  plans: { sectionId: 'sec-routines', featureId: 'routines' },
  library: {
    exercise: { sectionId: 'sec-exercises', featureId: 'exercises' },
    workbook: { sectionId: 'sec-workbooks', featureId: 'workbooks' },
    drums: { sectionId: 'sec-drums', featureId: 'drums' },
    gp: { sectionId: 'sec-gpplayer', featureId: 'gpplayer' },
  },
  fundamentals: {
    scales: { sectionId: 'sec-scales', featureId: 'scales' },
    intervals: { sectionId: 'sec-intervals', featureId: 'intervals' },
    sightreading: { sectionId: 'sec-sightreading', featureId: 'sightreading' },
    fretboard: { sectionId: 'sec-fretboard', featureId: 'fretboard' },
    'chord-workout': { sectionId: 'sec-chordlab', featureId: 'chordlab' },
    pitch: { sectionId: 'sec-tuner', featureId: 'tuner' },
    ear: { sectionId: 'sec-ear', featureId: 'ear' },
    timing: { sectionId: 'sec-timing', featureId: 'timing' },
  },
};

const VIEW_LABELS = [
  { id: 'today', label: 'Today' },
  { id: 'plans', label: 'Plans' },
  { id: 'library', label: 'Library' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'progress', label: 'Progress' },
];

const LIBRARY_CHIPS = [
  { id: 'exercise', label: 'Exercises' },
  { id: 'workbook', label: 'Workbooks' },
  { id: 'gp', label: 'Scores' },
  { id: 'drums', label: 'Drums' },
];

const FUNDAMENTAL_GROUPS = [
  {
    label: 'Theory Recall',
    drills: [
      { id: 'scales', label: 'Scale Spelling', route: { drill: 'scales' } },
      { id: 'intervals', label: 'Intervals', route: { drill: 'intervals' } },
    ],
  },
  {
    label: 'Sight Reading',
    drills: [{ id: 'sightreading', label: 'Sight Reading', route: { drill: 'sightreading' } }],
  },
  {
    label: 'Fretboard Drill',
    drills: [{ id: 'fretboard', label: 'Fretboard', route: { drill: 'fretboard' } }],
  },
  {
    label: 'Harmony Practice',
    drills: [{ id: 'chord-workout', label: 'Chord Workout', route: { drill: 'chord-workout' } }],
  },
  {
    label: 'Ear and Pitch',
    drills: [
      { id: 'pitch', label: 'Pitch', route: { drill: 'pitch' } },
      { id: 'ear', label: 'Ear Trainer', route: { drill: 'ear' } },
    ],
  },
  {
    label: 'Rhythm',
    drills: [{ id: 'timing', label: 'Timing', route: { drill: 'timing' } }],
  },
];

const DRILL_LABELS = Object.fromEntries(
  FUNDAMENTAL_GROUPS.flatMap((g) => g.drills.map((d) => [d.id, d.label])),
);

const STATUS_LABELS = {
  red: 'Needs work',
  yellow: 'Getting there',
  green: 'Solid',
  blue: 'Mastered',
};

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];
let lastPaintedView = null;
let lastPaintedSectionId = null;
let currentRoute = null;
let lastRoutedViewKey = null;
let practicePanelRoot = null;
let practicePanelEl = null;
let practicePanelOpen = false;
let panelOpenerEl = null;
let panelKeydownHandler = null;
let panelSessionUnsub = null;
let practiceBarHost = null;
let practiceBarApi = null;
let practiceHostBoundsRaf = 0;
let practiceHostResizeObs = null;
let practiceBarResizeObs = null;
let practiceHostMutationObs = null;
let sessionUnsub = null;
let workbookEntryUnsub = null;
let syncFromSession = false;

const PRACTICE_PANEL_IDS = {
  metronome: 'sec-metronome',
  practice: 'sec-practice',
};

const PRACTICE_PANEL_FEATURES = ['metronome', 'practice'];

const METRO_LOCK_SELECTORS = [
  '#m-play',
  '#m-tap',
  '#m-bpm',
  '#m-bpm-slider',
  '#m-bpm-down',
  '#m-bpm-up',
  '#m-timer-reset',
  '.metro-bpm-preset',
  '#m-phases-toggle',
  '#m-phase-add',
  '.m-phase-del',
];

function isPracticePanelRoute(route) {
  return route?.params?.panel === 'practice';
}

function routeViewKey(route) {
  if (!route) return '';
  const view = effectiveView(route);
  const params = { ...route.params };
  delete params.panel;
  return `${view}:${JSON.stringify(params)}`;
}

function isPanelOnlyRouteChange(prev, next) {
  if (!prev || !next) return false;
  return prev.objective === next.objective && routeViewKey(prev) === routeViewKey(next);
}

function viewSectionIds() {
  return lastPaintedSectionId ? [lastPaintedSectionId] : [];
}

function sectionsToKeep(extra = []) {
  const keep = new Set(extra);
  if (isPracticePanelRoute(currentRoute)) {
    keep.add(PRACTICE_PANEL_IDS.metronome);
    keep.add(PRACTICE_PANEL_IDS.practice);
  }
  return [...keep];
}

function featuresToKeep(extra = []) {
  const keep = new Set([...activeFeatureIds, ...extra]);
  if (isPracticePanelRoute(currentRoute)) {
    PRACTICE_PANEL_FEATURES.forEach((id) => keep.add(id));
  }
  return [...keep];
}

function stopViewFeatures(keepIds = []) {
  stopFeaturesExcept(featuresToKeep(keepIds));
}

function syncPanelMetronomeLock() {
  if (!practicePanelEl) return;
  const locked = hasActiveSession();
  practicePanelEl.classList.toggle('train-utility-locked', locked);
  const note = practicePanelEl.querySelector('.train-metro-session-note');
  if (note) note.hidden = !locked;

  const metroSection = document.getElementById('sec-metronome');
  if (metroSection) {
    METRO_LOCK_SELECTORS.forEach((sel) => {
      metroSection.querySelectorAll(sel).forEach((el) => {
        if ('disabled' in el) el.disabled = locked;
      });
    });
  }

  const practiceSection = document.getElementById('sec-practice');
  if (practiceSection) {
    practiceSection.querySelectorAll('#pt-start, #pt-auto, #pt-reset, .pt-preset').forEach((el) => {
      if ('disabled' in el) el.disabled = locked;
    });
  }
}

function unbindPracticePanelSession() {
  if (panelSessionUnsub) {
    panelSessionUnsub();
    panelSessionUnsub = null;
  }
}

function bindPracticePanelSession() {
  if (panelSessionUnsub) return;
  panelSessionUnsub = subscribeSession(() => {
    syncPanelMetronomeLock();
  });
}

function closePracticePanelDom() {
  if (panelKeydownHandler) {
    document.removeEventListener('keydown', panelKeydownHandler);
    panelKeydownHandler = null;
  }
  unbindPracticePanelSession();
  if (practicePanelRoot) {
    practicePanelRoot.remove();
    practicePanelRoot = null;
    practicePanelEl = null;
  }
  practicePanelOpen = false;
  shellApi?.shell?.classList.remove('train-utility-open');
}

function closePracticePanelRoute() {
  if (!isPracticePanelRoute(currentRoute)) return;
  setParams({ panel: null });
}

function tearDownPracticePanel() {
  const opener = panelOpenerEl;
  closePracticePanelDom();
  releaseAllExcept(sectionsToKeep(viewSectionIds()));
  stopViewFeatures(activeFeatureIds);
  if (opener && document.contains(opener)) opener.focus();
  panelOpenerEl = null;
}

async function openPracticePanel() {
  if (!shellApi?.shell || practicePanelOpen) return;

  practicePanelRoot = document.createElement('div');
  practicePanelRoot.className = 'train-utility-layer';

  const backdrop = document.createElement('div');
  backdrop.className = 'train-utility-backdrop';
  backdrop.addEventListener('click', () => closePracticePanelRoute());

  practicePanelEl = document.createElement('div');
  practicePanelEl.className = 'train-utility-panel';
  practicePanelEl.setAttribute('role', 'dialog');
  practicePanelEl.setAttribute('aria-modal', 'true');
  practicePanelEl.setAttribute('aria-labelledby', 'train-utility-panel-title');

  const head = document.createElement('header');
  head.className = 'train-utility-panel-head';
  head.innerHTML = `
    <h3 id="train-utility-panel-title" class="train-utility-panel-title">Metronome &amp; Timer</h3>
    <button type="button" class="btn sm train-utility-panel-close" aria-label="Close">Close</button>
  `;

  const body = document.createElement('div');
  body.className = 'train-utility-panel-body';
  body.innerHTML = '<p class="train-metro-session-note" hidden>During a practice session, the practice bar controls the metronome.</p>';

  const sectionsHost = document.createElement('div');
  sectionsHost.className = 'train-utility-sections';
  body.appendChild(sectionsHost);

  practicePanelEl.append(head, body);
  practicePanelRoot.append(backdrop, practicePanelEl);
  shellApi.shell.appendChild(practicePanelRoot);
  shellApi.shell.classList.add('train-utility-open');
  practicePanelOpen = true;

  head.querySelector('.train-utility-panel-close')?.addEventListener('click', () => {
    closePracticePanelRoute();
  });

  adoptSection(PRACTICE_PANEL_IDS.metronome, sectionsHost);
  adoptSection(PRACTICE_PANEL_IDS.practice, sectionsHost);
  await mountFeature('metronome');
  await mountFeature('practice');
  stopViewFeatures(activeFeatureIds);
  bindPracticePanelSession();
  syncPanelMetronomeLock();

  panelKeydownHandler = (e) => {
    if (e.key === 'Escape' && isPracticePanelRoute(currentRoute)) {
      e.preventDefault();
      closePracticePanelRoute();
    }
  };
  document.addEventListener('keydown', panelKeydownHandler);

  const closeBtn = head.querySelector('.train-utility-panel-close');
  if (closeBtn) closeBtn.focus();
}

async function syncPracticePanel(route) {
  const shouldOpen = isPracticePanelRoute(route);
  if (shouldOpen && !practicePanelOpen) {
    await openPracticePanel();
    return;
  }
  if (!shouldOpen && practicePanelOpen) {
    tearDownPracticePanel();
    return;
  }
  if (shouldOpen && practicePanelOpen) {
    syncPanelMetronomeLock();
    stopViewFeatures(activeFeatureIds);
  }
}

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'train')?.defaultView || 'today';
}

function effectiveView(route) {
  return route.view || defaultView();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtClock(ms) {
  const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPct(value) {
  if (value == null) return '--';
  return `${Math.round(Number(value) * 100)}%`;
}

/**
 * Expand a routine session workbook list into ordered practice items.
 * @param {object} routine
 * @param {object} session
 * @param {{ getWorkbook?: typeof getWorkbook, getExercise?: typeof getExercise }} [deps]
 */
export function buildSessionItems(routine, session, deps = {}) {
  const wbGet = deps.getWorkbook || getWorkbook;
  const exGet = deps.getExercise || getExercise;
  const items = [];
  const workbookIds = session?.workbookIds || [];
  for (const wbId of workbookIds) {
    const wb = wbGet(wbId);
    if (!wb?.entries?.length) continue;
    for (const entry of wb.entries) {
      const ex = exGet(entry.exerciseId);
      items.push({
        id: `psi-${entry.id}`,
        label: ex?.name || entry.exerciseId,
        targetType: 'exercise',
        targetId: entry.exerciseId,
        workbookId: wb.id,
        workbookName: wb.name,
        entryId: entry.id,
      });
    }
  }
  return items;
}

function sessionMetronomeFromRoutine(session) {
  const m = session?.metronome || {};
  return {
    bpm: m.bpm ?? 120,
    subdivision: m.subdiv ?? 'quarter',
    beats: m.beats ?? 4,
    accentFirst: m.accentFirst ?? true,
  };
}

function formatRoutineSourceLabel(routine, session) {
  const parts = [routine?.name, session?.name].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Routine session';
}

function beginRoutineSession(routine, session) {
  const items = buildSessionItems(routine, session);
  startSession({
    sourceType: 'routine-session',
    sourceId: session.id,
    sourceLabel: formatRoutineSourceLabel(routine, session),
    routineId: routine.id,
    items,
    timerTargetMs: session.durationMin != null ? session.durationMin * 60 * 1000 : null,
    metronome: sessionMetronomeFromRoutine(session),
  });
  setActiveRoutineSession(routine.id, session.id);
  syncPracticeBar();
}

function beginFreePractice() {
  startSession({
    sourceType: 'free',
    sourceId: '',
    items: [],
    timerTargetMs: null,
    metronome: {},
  });
  syncPracticeBar();
}

function findActiveRoutineSession() {
  for (const rt of listRoutines()) {
    if (!rt.activeSessionId) continue;
    const session = rt.sessions?.find((s) => s.id === rt.activeSessionId);
    if (session && !session.completed) return { routine: rt, session };
  }
  return null;
}

function findNextRoutine() {
  for (const rt of listRoutines()) {
    const session = rt.sessions?.find((s) => !s.completed);
    if (session) return { routine: rt, session };
  }
  return null;
}

function resolveTargetLabel(targetType, targetId) {
  if (targetType === 'drill') {
    return DRILL_LABELS[targetId] || `Drill (${targetId})`;
  }
  const refType = targetType === 'workbook-item' ? 'workbook' : targetType;
  if (['exercise', 'workbook', 'routine', 'score'].includes(refType)) {
    return describeRef({ type: refType, id: targetId });
  }
  return `${targetType} (${targetId})`;
}

function openLibraryItem(item) {
  if (!item) return;
  if (item.targetType === 'exercise') {
    navigate({ objective: 'train', view: 'library', params: { type: 'exercise', id: item.targetId } });
    return;
  }
  if (item.targetType === 'score') {
    navigate({ objective: 'train', view: 'library', params: { player: 'gp', id: item.targetId } });
  }
}

function syncSessionShellClass() {
  const live = !!getSession()?.items?.length;
  shellApi?.shell?.classList.toggle('train-session-live', live);
}

function syncPracticeHostBounds() {
  cancelAnimationFrame(practiceHostBoundsRaf);
  practiceHostBoundsRaf = requestAnimationFrame(() => {
    practiceHostBoundsRaf = requestAnimationFrame(() => {
      const host = viewRegion?.querySelector('.train-practice-host.train-session-practice')
        || document.querySelector('.train-practice-host.train-session-practice');
      const bar = practiceBarHost || document.getElementById('practice-bar-host');
      if (!host || !bar || bar.hidden) {
        host?.style.removeProperty('--train-practice-host-top');
        host?.style.removeProperty('--train-practice-host-max');
        host?.style.removeProperty('max-height');
        return;
      }
      const hostTop = host.getBoundingClientRect().top;
      const barTop = bar.getBoundingClientRect().top;
      const maxH = Math.max(120, Math.floor(barTop - hostTop - 4));
      host.style.setProperty('--train-practice-host-top', `${Math.round(hostTop)}px`);
      host.style.setProperty('--train-practice-host-max', `${maxH}px`);
    });
  });
}

function schedulePracticeHostBoundsBurst() {
  syncPracticeHostBounds();
  if (typeof window === 'undefined') return;
  window.setTimeout(syncPracticeHostBounds, 50);
  window.setTimeout(syncPracticeHostBounds, 250);
  window.setTimeout(syncPracticeHostBounds, 800);
  window.setTimeout(syncPracticeHostBounds, 1600);
}

function bindPracticeHostBounds() {
  unbindPracticeHostBounds();
  const host = viewRegion?.querySelector('.train-practice-host.train-session-practice');
  if (!host || !practiceBarHost) return;
  if (typeof ResizeObserver !== 'undefined') {
    practiceHostResizeObs = new ResizeObserver(() => schedulePracticeHostBoundsBurst());
    practiceBarResizeObs = new ResizeObserver(() => schedulePracticeHostBoundsBurst());
    practiceHostResizeObs.observe(host);
    practiceBarResizeObs.observe(practiceBarHost);
  }
  if (typeof MutationObserver !== 'undefined') {
    practiceHostMutationObs = new MutationObserver(() => {
      if (host.querySelector('.gpp-root, .wb-detail-body')) schedulePracticeHostBoundsBurst();
    });
    practiceHostMutationObs.observe(host, { childList: true, subtree: true });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncPracticeHostBounds);
    window.addEventListener('musi:train-practice-layout', schedulePracticeHostBoundsBurst);
  }
  schedulePracticeHostBoundsBurst();
}

function unbindPracticeHostBounds() {
  cancelAnimationFrame(practiceHostBoundsRaf);
  practiceHostBoundsRaf = 0;
  practiceHostResizeObs?.disconnect();
  practiceBarResizeObs?.disconnect();
  practiceHostMutationObs?.disconnect();
  practiceHostResizeObs = null;
  practiceBarResizeObs = null;
  practiceHostMutationObs = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncPracticeHostBounds);
    window.removeEventListener('musi:train-practice-layout', schedulePracticeHostBoundsBurst);
  }
  const host = viewRegion?.querySelector('.train-practice-host.train-session-practice')
    || document.querySelector('.train-practice-host.train-session-practice');
  host?.style.removeProperty('--train-practice-host-top');
  host?.style.removeProperty('--train-practice-host-max');
  host?.style.removeProperty('max-height');
}

function syncPracticeBar() {
  if (!hasActiveSession()) {
    tearDownPracticeBar();
    shellApi?.shell?.classList.remove('train-has-practice-bar');
    syncSessionShellClass();
    return;
  }
  if (!practiceBarHost) {
    practiceBarHost = document.createElement('div');
    practiceBarHost.id = 'practice-bar-host';
    document.body.appendChild(practiceBarHost);
  }
  if (!practiceBarApi) {
    practiceBarApi = mountPracticeBar(practiceBarHost);
  } else {
    practiceBarApi.update();
  }
  shellApi?.shell?.classList.add('train-has-practice-bar');
  syncSessionShellClass();
  bindPracticeHostBounds();
}

function tearDownPracticeBar() {
  unbindPracticeHostBounds();
  if (practiceBarApi) {
    practiceBarApi.destroy();
    practiceBarApi = null;
  }
  if (practiceBarHost) {
    practiceBarHost.remove();
    practiceBarHost = null;
  }
  shellApi?.shell?.classList.remove('train-has-practice-bar');
  syncSessionShellClass();
}

function sessionDisplayTitle(session) {
  if (session.sourceLabel) return session.sourceLabel;
  if (session.sourceType === 'routine-session') return 'Routine session';
  if (session.sourceType === 'free') return 'Free practice';
  return session.sourceType;
}

function activeSessionItem(session) {
  if (!session?.activeItemId) return null;
  return session.items.find((it) => it.id === session.activeItemId) || null;
}

function sessionItemIndex(session) {
  if (!session?.activeItemId) return -1;
  return session.items.findIndex((it) => it.id === session.activeItemId);
}

function buildOutlineGroups(session) {
  const groups = [];
  const seen = new Set();
  for (const item of session.items) {
    if (!item.workbookId || seen.has(item.workbookId)) continue;
    seen.add(item.workbookId);
    groups.push({
      workbookId: item.workbookId,
      workbookName: item.workbookName || item.workbookId,
      items: session.items.filter((it) => it.workbookId === item.workbookId),
    });
  }
  return groups;
}

function appendLogAttemptDetails(card, session, item, onUpdate) {
  const details = document.createElement('details');
  details.className = 'train-log-details';
  details.innerHTML = `
    <summary class="train-log-summary">Log attempt</summary>
    <div class="train-log-attempt">
      <div class="train-log-fields">
        <label class="train-log-field">BPM
          <input type="number" class="train-log-bpm" min="30" max="300" value="${session.metronome?.bpm ?? 120}">
        </label>
        <label class="train-log-field">Accuracy %
          <input type="number" class="train-log-accuracy" min="0" max="100" placeholder="optional">
        </label>
        <label class="train-log-field train-log-check">
          <input type="checkbox" class="train-log-clean"> Clean take
        </label>
        <label class="train-log-field">Effort
          <select class="train-log-effort">
            <option value="">—</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <label class="train-log-field">Status
          <select class="train-log-status">
            <option value="">—</option>
            <option value="red">Needs work</option>
            <option value="yellow">Getting there</option>
            <option value="green">Solid</option>
            <option value="blue">Mastered</option>
          </select>
        </label>
      </div>
      <button type="button" class="btn primary train-log-submit">Log attempt</button>
    </div>
  `;
  details.querySelector('.train-log-submit')?.addEventListener('click', () => {
    const bpm = Number(details.querySelector('.train-log-bpm')?.value);
    const accRaw = details.querySelector('.train-log-accuracy')?.value;
    const accuracy = accRaw === '' ? null : Number(accRaw) / 100;
    const cleanTake = !!details.querySelector('.train-log-clean')?.checked;
    const effortRaw = details.querySelector('.train-log-effort')?.value;
    const effort = effortRaw === '' ? null : Number(effortRaw);
    const status = details.querySelector('.train-log-status')?.value || null;
    const partial = {
      targetType: item.targetType,
      targetId: item.targetId,
      bpm: Number.isFinite(bpm) ? bpm : undefined,
      accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
      cleanTake: cleanTake || null,
      effort,
      status: status || null,
    };
    if (hasActiveSession()) recordAttempt(partial);
    else logAttempt(partial);
    onUpdate();
  });
  card.appendChild(details);
}

function buildSessionHeaderEl(session, host) {
  const item = activeSessionItem(session);
  const idx = sessionItemIndex(session);
  const pos = session.items.length && idx >= 0
    ? `Item ${idx + 1} of ${session.items.length}`
    : '';
  const isLastItem = session.items.length > 0 && idx === session.items.length - 1;
  const wbName = item?.workbookName || '';
  const clock = `${fmtClock(session.elapsedMs)}${
    session.timerTargetMs != null ? ` / ${fmtClock(session.timerTargetMs)}` : ''
  }`;
  const metaParts = [wbName, pos, clock].filter(Boolean);

  const card = document.createElement('article');
  card.className = 'objective-card train-session-header-card train-session-header-compact';
  card.innerHTML = `
    <h3 class="train-session-title">${escapeHtml(sessionDisplayTitle(session))}</h3>
    <p class="train-session-meta">${escapeHtml(metaParts.join(' · '))}</p>
    <div class="train-session-actions">
      <button type="button" class="btn sm primary" data-action="resume-pause">
        ${session.status === 'paused' ? 'Resume' : 'Pause'}
      </button>
      ${isLastItem ? '<button type="button" class="btn sm primary" data-action="finish-session">Finish session</button>' : ''}
      <button type="button" class="btn sm" data-action="end-session">End session</button>
    </div>
  `;

  card.querySelector('[data-action="resume-pause"]')?.addEventListener('click', () => {
    if (session.status === 'paused') resumeSession();
    else pauseSession();
    refreshTodaySessionChrome(host);
  });
  card.querySelector('[data-action="finish-session"]')?.addEventListener('click', () => {
    finishRoutineSession(session);
    renderToday(host);
  });
  card.querySelector('[data-action="end-session"]')?.addEventListener('click', () => {
    endSession();
    tearDownPracticeBar();
    releaseTodayWorkbookSurface();
    renderToday(host);
  });

  return card;
}

function buildFullOutlineGroups(session, idx, host) {
  const groups = buildOutlineGroups(session);
  const frag = document.createDocumentFragment();
  groups.forEach((group, groupIdx) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'train-outline-group';
    groupEl.innerHTML = `
      <h4 class="drill-group-title train-outline-wb-title">
        Workbook ${groupIdx + 1} of ${groups.length} · ${escapeHtml(group.workbookName)}
      </h4>
    `;
    const list = document.createElement('div');
    list.className = 'train-outline-list';
    group.items.forEach((outlineItem) => {
      const globalIdx = session.items.findIndex((it) => it.id === outlineItem.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'train-outline-item';
      if (outlineItem.id === session.activeItemId) btn.classList.add('is-current');
      else if (globalIdx >= 0 && globalIdx < idx) btn.classList.add('is-done');
      btn.innerHTML = `
        <span class="train-outline-num">${globalIdx + 1}</span>
        <span class="train-outline-label">${escapeHtml(outlineItem.label || outlineItem.targetId)}</span>
      `;
      btn.addEventListener('click', () => {
        setActiveItem(outlineItem.id);
      });
      list.appendChild(btn);
    });
    groupEl.appendChild(list);
    frag.appendChild(groupEl);
  });
  return frag;
}

function buildSessionOutlineEl(session, host) {
  const idx = sessionItemIndex(session);
  const item = activeSessionItem(session);
  const wbName = item?.workbookName || 'Session outline';

  const section = document.createElement('section');
  section.className = 'train-session-nav';

  const strip = document.createElement('div');
  strip.className = 'train-step-strip';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Session items');
  session.items.forEach((outlineItem, globalIdx) => {
    const label = outlineItem.label || outlineItem.targetId;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'train-step-pill';
    btn.setAttribute('role', 'tab');
    btn.textContent = String(globalIdx + 1);
    btn.title = label;
    btn.setAttribute('aria-label', `${globalIdx + 1}. ${label}`);
    btn.setAttribute('aria-selected', outlineItem.id === session.activeItemId ? 'true' : 'false');
    if (outlineItem.id === session.activeItemId) btn.classList.add('is-current');
    else if (globalIdx < idx) btn.classList.add('is-done');
    btn.addEventListener('click', () => {
      setActiveItem(outlineItem.id);
    });
    strip.appendChild(btn);
  });
  section.appendChild(strip);

  const details = document.createElement('details');
  details.className = 'train-outline-details';
  const summary = document.createElement('summary');
  summary.className = 'train-outline-summary';
  summary.textContent = wbName;
  details.appendChild(summary);

  const expanded = document.createElement('div');
  expanded.className = 'train-outline-expanded';
  expanded.appendChild(buildFullOutlineGroups(session, idx, host));

  if (item) {
    appendLogAttemptDetails(expanded, session, item, () => refreshTodaySessionChrome(host));
    const libLink = document.createElement('a');
    libLink.className = 'btn sm train-open-library-link';
    libLink.href = `#train/library?type=workbook&id=${encodeURIComponent(item.workbookId)}`;
    libLink.textContent = 'Open in library';
    expanded.appendChild(libLink);
  }

  details.appendChild(expanded);
  section.appendChild(details);

  return section;
}

function refreshTodaySessionChrome(host) {
  const region = host || viewRegion;
  if (!region) return;
  const session = getSession();
  if (!session?.items?.length) return;
  const wrap = region.querySelector('.train-today-live');
  if (!wrap) return;
  const outlineOpen = wrap.querySelector('.train-outline-details')?.open;
  const logOpen = wrap.querySelector('.train-log-details')?.open;
  const header = wrap.querySelector('.train-session-header-card');
  const outline = wrap.querySelector('.train-session-nav');
  const freshHeader = buildSessionHeaderEl(session, region);
  const freshOutline = buildSessionOutlineEl(session, region);
  if (outlineOpen) freshOutline.querySelector('.train-outline-details')?.setAttribute('open', '');
  if (logOpen) freshOutline.querySelector('.train-log-details')?.setAttribute('open', '');
  if (header) header.replaceWith(freshHeader);
  else wrap.prepend(freshHeader);
  if (outline) outline.replaceWith(freshOutline);
  else {
    const featureHost = wrap.querySelector('.train-practice-host');
    if (featureHost) wrap.insertBefore(freshOutline, featureHost);
    else wrap.appendChild(freshOutline);
  }
  schedulePracticeHostBoundsBurst();
}

function finishRoutineSession(session) {
  if (session.routineId && session.sourceId) {
    setRoutineSessionCompleted(session.routineId, session.sourceId, true);
  }
  endSession();
  tearDownPracticeBar();
  releaseTodayWorkbookSurface();
}

function releaseTodayWorkbookSurface() {
  shellApi?.shell?.classList.remove('train-session-live');
  releaseAllExcept(sectionsToKeep([]));
  stopViewFeatures([]);
  activeFeatureIds = [];
  lastPaintedSectionId = null;
}

function syncWorkbookToItem(item) {
  if (!item?.workbookId) return;
  syncFromSession = true;
  openWorkbookById(item.workbookId, { entryId: item.entryId || null });
  syncFromSession = false;
}

function handleWorkbookEntryChange(payload) {
  if (syncFromSession) return;
  const session = getSession();
  if (!session?.items?.length || !payload.workbookId) return;

  const activeItem = activeSessionItem(session);
  // Workbook loop-wrap at end of a block: advance session to the next workbook instead.
  if (payload.index === 0 && activeItem && payload.workbookId === activeItem.workbookId) {
    const wbItems = session.items.filter((it) => it.workbookId === activeItem.workbookId);
    const lastInWb = wbItems[wbItems.length - 1];
    if (activeItem.id === lastInWb?.id) {
      const sessionIdx = session.items.findIndex((it) => it.id === activeItem.id);
      const nextSessionItem = session.items[sessionIdx + 1];
      if (nextSessionItem && nextSessionItem.workbookId !== activeItem.workbookId) {
        syncFromSession = true;
        setActiveItem(nextSessionItem.id);
        openWorkbookById(nextSessionItem.workbookId, { entryId: nextSessionItem.entryId || null });
        syncFromSession = false;
        refreshTodaySessionChrome();
        return;
      }
      if (!nextSessionItem) {
        syncFromSession = true;
        openWorkbookById(activeItem.workbookId, { entryId: activeItem.entryId || null });
        syncFromSession = false;
        refreshTodaySessionChrome();
        return;
      }
    }
  }

  const match = session.items.find(
    (it) => it.workbookId === payload.workbookId && it.entryId === payload.entryId,
  );
  if (match && match.id !== session.activeItemId) {
    syncFromSession = true;
    setActiveItem(match.id);
    syncFromSession = false;
  }
  refreshTodaySessionChrome();
}

async function renderTodaySessionPlayer(host, session) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'train-today-live';
  wrap.appendChild(buildSessionHeaderEl(session, host));
  wrap.appendChild(buildSessionOutlineEl(session, host));

  const featureHost = document.createElement('div');
  featureHost.className = 'workspace-feature-host train-practice-host train-session-practice';
  wrap.appendChild(featureHost);
  host.appendChild(wrap);

  syncPracticeBar();
  syncPracticeHostBounds();

  adoptSection('sec-workbooks', featureHost);
  activeFeatureIds = ['workbooks'];
  await mountFeature('workbooks');
  stopViewFeatures(activeFeatureIds);
  lastPaintedSectionId = 'sec-workbooks';

  const item = activeSessionItem(session);
  if (item) syncWorkbookToItem(item);
  schedulePracticeHostBoundsBurst();
}

function appendTodayQuickLinks(host) {
  if (getSession()?.items?.length) return;
  host.querySelector('.workspace-quick-links')?.remove();
  const links = document.createElement('div');
  links.className = 'workspace-quick-links';
  links.innerHTML = `
    <button type="button" class="btn" data-link="plans">Plans</button>
    <button type="button" class="btn" data-link="library">Library</button>
  `;
  links.querySelector('[data-link="plans"]')?.addEventListener('click', () => navigate('#train/plans'));
  links.querySelector('[data-link="library"]')?.addEventListener('click', () => navigate('#train/library'));
  host.appendChild(links);
}

async function renderToday(host) {
  host.innerHTML = '';
  const session = getSession();

  if (session?.items?.length) {
    await renderTodaySessionPlayer(host, session);
    syncPracticeBar();
    appendTodayQuickLinks(host);
    return;
  }

  if (session) {
    const card = document.createElement('article');
    card.className = 'objective-card train-session-header-card';
    card.innerHTML = `
      <div class="objective-card-kicker">Live session</div>
      <h3 class="objective-card-title">${escapeHtml(sessionDisplayTitle(session))}</h3>
      <p class="train-session-meta">${fmtClock(session.elapsedMs)}${
        session.timerTargetMs != null ? ` / ${fmtClock(session.timerTargetMs)}` : ''
      }</p>
      <div class="train-session-actions">
        <button type="button" class="btn primary" data-action="resume-pause">
          ${session.status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button type="button" class="btn" data-action="end-session">End session</button>
      </div>
    `;
    card.querySelector('[data-action="resume-pause"]')?.addEventListener('click', () => {
      if (session.status === 'paused') resumeSession();
      else pauseSession();
      renderToday(host);
    });
    card.querySelector('[data-action="end-session"]')?.addEventListener('click', () => {
      endSession();
      tearDownPracticeBar();
      renderToday(host);
    });
    host.appendChild(card);
    syncPracticeBar();
    appendTodayQuickLinks(host);
    return;
  }

  const active = findActiveRoutineSession();
  const next = active ? null : findNextRoutine();
  const card = document.createElement('article');
  card.className = 'objective-card';

  if (active) {
    card.innerHTML = `
      <div class="objective-card-kicker">Active routine</div>
      <h3 class="objective-card-title">${escapeHtml(active.routine.name)}</h3>
      <p class="objective-card-body">Session: ${escapeHtml(active.session.name || 'In progress')}</p>
      <button type="button" class="btn primary" data-action="start-session">Start session</button>
    `;
    card.querySelector('[data-action="start-session"]')?.addEventListener('click', async () => {
      beginRoutineSession(active.routine, active.session);
      await renderTodaySessionPlayer(host, getSession());
      syncPracticeBar();
      appendTodayQuickLinks(host);
    });
  } else if (next) {
    card.innerHTML = `
      <div class="objective-card-kicker">Next up</div>
      <h3 class="objective-card-title">${escapeHtml(next.routine.name)}</h3>
      <p class="objective-card-body">${escapeHtml(next.session.name || 'Next session')}</p>
      <button type="button" class="btn primary" data-action="start-session">Start session</button>
      <button type="button" class="btn" data-action="plans">View plans</button>
    `;
    card.querySelector('[data-action="start-session"]')?.addEventListener('click', async () => {
      beginRoutineSession(next.routine, next.session);
      await renderTodaySessionPlayer(host, getSession());
      syncPracticeBar();
      appendTodayQuickLinks(host);
    });
    card.querySelector('[data-action="plans"]')?.addEventListener('click', () => {
      navigate('#train/plans');
    });
  } else {
    card.innerHTML = `
      <div class="objective-card-kicker">Free practice</div>
      <h3 class="objective-card-title">Start free practice</h3>
      <p class="objective-card-body">Pick a drill or open your library.</p>
      <button type="button" class="btn primary" data-action="free">Start free practice</button>
    `;
    card.querySelector('[data-action="free"]')?.addEventListener('click', () => {
      beginFreePractice();
      renderToday(host);
    });
  }
  host.appendChild(card);
  appendTodayQuickLinks(host);
}

/**
 * @param {number} [now]
 */
export function buildProgressModel(now = Date.now()) {
  const stats = getStatsSnapshot();
  const recent = listAttempts({ limit: 8 });
  const due = dueColdTests(now);

  const recentRows = recent.map((att) => {
    const summary = getTargetSummary(att.targetType, att.targetId);
    return {
      id: att.id,
      label: resolveTargetLabel(att.targetType, att.targetId),
      bpm: att.bpm,
      accuracy: att.accuracy,
      status: att.status,
      statusLabel: STATUS_LABELS[att.status] || null,
      startedAt: att.startedAt,
      tempoHistory: summary.tempoHistory.slice(-5),
    };
  });

  const dueRows = due.map((d) => ({
    ...d,
    label: resolveTargetLabel(d.targetType, d.targetId),
    kindLabel: d.kind === '7d' ? '7-day cold test' : '48-hour check',
  }));

  const targetMap = new Map();
  for (const att of listAttempts({})) {
    const key = `${att.targetType}\0${att.targetId}`;
    if (!targetMap.has(key)) {
      const summary = getTargetSummary(att.targetType, att.targetId);
      targetMap.set(key, {
        targetType: att.targetType,
        targetId: att.targetId,
        label: resolveTargetLabel(att.targetType, att.targetId),
        lastAccuracy: summary.lastAccuracy,
        attempts: summary.attempts,
      });
    }
  }
  const weakAreas = [...targetMap.values()]
    .filter((t) => t.lastAccuracy != null && t.attempts >= 2)
    .sort((a, b) => a.lastAccuracy - b.lastAccuracy)
    .slice(0, 5);

  return {
    today: {
      minutes: stats.minutesToday,
      accuracy: stats.accuracy,
      streak: stats.currentStreak,
    },
    recent: recentRows,
    dueColdTests: dueRows,
    weakAreas,
    hasData: recent.length > 0 || due.length > 0 || weakAreas.length > 0,
  };
}

function renderProgress(host) {
  const model = buildProgressModel();
  host.innerHTML = '';

  const statsCard = document.createElement('article');
  statsCard.className = 'objective-card';
  const acc = model.today.accuracy == null ? '--' : `${model.today.accuracy}%`;
  statsCard.innerHTML = `
    <div class="objective-card-kicker">Today</div>
    <h3 class="objective-card-title">${model.today.minutes} min trained</h3>
    <p class="objective-card-body">Accuracy ${acc} · Streak ${model.today.streak}</p>
  `;
  host.appendChild(statsCard);

  const recentSection = document.createElement('section');
  recentSection.className = 'train-progress-section';
  recentSection.innerHTML = '<h3 class="drill-group-title">Recent attempts</h3>';
  if (!model.recent.length) {
    recentSection.innerHTML += '<p class="train-empty">No attempts logged yet — your history will appear here.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.recent) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      const chip = row.status
        ? `<span class="train-status-chip status-${row.status}">${escapeHtml(row.statusLabel || row.status)}</span>`
        : '';
      const tempo = row.tempoHistory.length
        ? `<span class="train-tempo-hist">${row.tempoHistory.map((t) => t.bpm).join(' → ')} BPM</span>`
        : '';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
          ${chip}
        </div>
        <div class="train-attempt-meta">
          ${row.bpm != null ? `${row.bpm} BPM` : ''}
          ${row.accuracy != null ? ` · ${fmtPct(row.accuracy)}` : ''}
        </div>
        ${tempo}
      `;
      list.appendChild(item);
    }
    recentSection.appendChild(list);
  }
  host.appendChild(recentSection);

  const dueSection = document.createElement('section');
  dueSection.className = 'train-progress-section';
  dueSection.innerHTML = '<h3 class="drill-group-title">Due cold tests</h3>';
  if (!model.dueColdTests.length) {
    dueSection.innerHTML += '<p class="train-empty">No cold tests due — keep practicing to build retention checks.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.dueColdTests) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
          <span class="train-status-chip status-${row.lastStatus}">${escapeHtml(row.kindLabel)}</span>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sm train-due-action';
      btn.textContent = 'Open target';
      btn.addEventListener('click', () => {
        if (row.targetType === 'drill') {
          navigate({ objective: 'train', view: 'fundamentals', params: { drill: row.targetId } });
        } else if (row.targetType === 'exercise') {
          navigate({ objective: 'train', view: 'library', params: { type: 'exercise', id: row.targetId } });
        }
      });
      item.appendChild(btn);
      list.appendChild(item);
    }
    dueSection.appendChild(list);
  }
  host.appendChild(dueSection);

  const weakSection = document.createElement('section');
  weakSection.className = 'train-progress-section';
  weakSection.innerHTML = '<h3 class="drill-group-title">Weak areas</h3>';
  if (!model.weakAreas.length) {
    weakSection.innerHTML += '<p class="train-empty">Not enough data yet — log a few attempts to surface weak spots.</p>';
  } else {
    const list = document.createElement('div');
    list.className = 'train-attempt-list';
    for (const row of model.weakAreas) {
      const item = document.createElement('article');
      item.className = 'train-attempt-row';
      item.innerHTML = `
        <div class="train-attempt-head">
          <span class="train-attempt-label">${escapeHtml(row.label)}</span>
        </div>
        <div class="train-attempt-meta">${fmtPct(row.lastAccuracy)} accuracy · ${row.attempts} attempts</div>
      `;
      list.appendChild(item);
    }
    weakSection.appendChild(list);
  }
  host.appendChild(weakSection);
}

function renderFundamentalsGrid(host) {
  host.innerHTML = '';
  FUNDAMENTAL_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'drill-group';
    section.innerHTML = `<h3 class="drill-group-title">${escapeHtml(group.label)}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'drill-grid';
    group.drills.forEach((drill) => {
      const summary = getTargetSummary('drill', drill.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drill-card';
      let summaryHtml = '';
      if (summary.attempts > 0) {
        const parts = [];
        if (summary.lastBpm != null) parts.push(`${summary.lastBpm} BPM`);
        if (summary.lastAccuracy != null) parts.push(fmtPct(summary.lastAccuracy));
        if (summary.status) parts.push(STATUS_LABELS[summary.status] || summary.status);
        summaryHtml = `<span class="drill-card-summary">${escapeHtml(parts.join(' · '))}</span>`;
      }
      btn.innerHTML = `
        <span class="drill-card-title">${escapeHtml(drill.label)}</span>
        ${summaryHtml}
      `;
      btn.onclick = () => setParams({ drill: drill.route.drill });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    host.appendChild(section);
  });
}

function renderPlansHeader(host, route) {
  const active = findActiveRoutineSession() || findNextRoutine();
  const header = document.createElement('div');
  header.className = 'train-plans-header';
  if (active) {
    header.innerHTML = `
      <div class="train-plans-header-text">
        <span class="objective-card-kicker">${active === findActiveRoutineSession() ? 'Active' : 'Next'}</span>
        <strong>${escapeHtml(active.routine.name)}</strong>
        <span class="train-plans-session">${escapeHtml(active.session.name || 'Session')}</span>
      </div>
      <button type="button" class="btn primary train-plans-start">Start session</button>
    `;
    header.querySelector('.train-plans-start')?.addEventListener('click', () => {
      beginRoutineSession(active.routine, active.session);
      navigate('#train/today');
    });
  } else {
    header.innerHTML = `
      <p class="train-empty">No routines yet — create one below or start free practice.</p>
      <button type="button" class="btn primary train-plans-start">Start free practice</button>
    `;
    header.querySelector('.train-plans-start')?.addEventListener('click', () => {
      beginFreePractice();
      navigate('#train/today');
    });
  }
  host.appendChild(header);
}

function resolveLibrary(route) {
  if (route.params?.player === 'gp') return TRAIN_SECTIONS.library.gp;
  const type = route.params?.type || 'exercise';
  if (type === 'workbook') return TRAIN_SECTIONS.library.workbook;
  if (type === 'drums') return TRAIN_SECTIONS.library.drums;
  return TRAIN_SECTIONS.library.exercise;
}

function resolveFundamentals(route) {
  const drill = route.params?.drill;
  if (!drill) return null;
  return TRAIN_SECTIONS.fundamentals[drill] || null;
}

function updateLibraryChipActive(activeId) {
  if (!viewRegion) return;
  const row = viewRegion.querySelector('.workspace-chips');
  if (!row) return;
  row.querySelectorAll('.workspace-chip').forEach((btn, index) => {
    const chipId = LIBRARY_CHIPS[index]?.id;
    const active = chipId === activeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

async function applyLibraryItemId(route) {
  const id = route.params?.id;
  if (!id) return;
  if (route.params?.player === 'gp') {
    const { requestGpScore } = await import('../gpPlayer.js');
    requestGpScore(id);
    return;
  }
  if (route.params?.type === 'workbook') {
    const { openWorkbookById } = await import('../workbooks.js');
    openWorkbookById(id);
    return;
  }
  if ((route.params?.type || 'exercise') === 'exercise') {
    const { requestExerciseOpen } = await import('../exercises.js');
    requestExerciseOpen(id);
  }
}

async function paintView(route) {
  const view = effectiveView(route);
  shellApi?.updateTabs(view);

  if (view === 'library') {
    const mapping = resolveLibrary(route);
    const sectionId = mapping?.sectionId || null;
    const libType = route.params?.player === 'gp' ? 'gp' : (route.params?.type || 'exercise');
    const sameLibraryShell = lastPaintedView === 'library'
      && lastPaintedSectionId === sectionId
      && sectionId != null
      && viewRegion?.querySelector('.workspace-feature-host');

    if (sameLibraryShell) {
      updateLibraryChipActive(libType);
      await applyLibraryItemId(route);
      syncPracticeBar();
      return;
    }

    lastPaintedView = 'library';
    lastPaintedSectionId = sectionId;
    releaseAllExcept(sectionsToKeep([]));
    activeFeatureIds = [];
    viewRegion.innerHTML = '';
    renderChipRow(viewRegion, LIBRARY_CHIPS, libType, (id) => {
      if (id === 'gp') setParams({ player: 'gp', type: null });
      else setParams({ type: id, player: null });
    });
    if (mapping) {
      const featureHost = document.createElement('div');
      featureHost.className = 'workspace-feature-host';
      viewRegion.appendChild(featureHost);
      adoptSection(mapping.sectionId, featureHost);
      activeFeatureIds = [mapping.featureId];
      await mountFeature(mapping.featureId);
      stopViewFeatures(activeFeatureIds);
      await applyLibraryItemId(route);
    } else {
      stopViewFeatures([]);
    }
    syncPracticeBar();
    return;
  }

  if (view === 'today') {
    lastPaintedView = 'today';
    const session = getSession();
    const hasRoutineItems = session?.items?.length > 0;
    const sameTodayShell = hasRoutineItems
      && viewRegion?.querySelector('.train-today-live .train-practice-host');

    if (hasRoutineItems) {
      if (sameTodayShell) {
        refreshTodaySessionChrome();
        const item = activeSessionItem(session);
        if (item) syncWorkbookToItem(item);
        schedulePracticeHostBoundsBurst();
      } else {
        releaseAllExcept(sectionsToKeep([]));
        activeFeatureIds = [];
        viewRegion.innerHTML = '';
        await renderTodaySessionPlayer(viewRegion, session);
      }
      appendTodayQuickLinks(viewRegion);
      stopViewFeatures(['workbooks']);
      syncPracticeBar();
      return;
    }

    lastPaintedSectionId = null;
    releaseAllExcept(sectionsToKeep([]));
    activeFeatureIds = [];
    viewRegion.innerHTML = '';
    renderToday(viewRegion);
    stopViewFeatures([]);
    syncPracticeBar();
    return;
  }

  lastPaintedView = view;
  lastPaintedSectionId = null;
  releaseAllExcept(sectionsToKeep([]));
  activeFeatureIds = [];
  viewRegion.innerHTML = '';

  if (view === 'progress') {
    renderProgress(viewRegion);
    stopViewFeatures([]);
    syncPracticeBar();
    return;
  }

  if (view === 'fundamentals') {
    const mapping = resolveFundamentals(route);
    if (!mapping) {
      renderFundamentalsGrid(viewRegion);
      stopViewFeatures([]);
      syncPracticeBar();
      return;
    }
    lastPaintedSectionId = mapping.sectionId;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopViewFeatures(activeFeatureIds);
    syncPracticeBar();
    return;
  }

  if (view === 'plans') {
    renderPlansHeader(viewRegion, route);
    const mapping = TRAIN_SECTIONS.plans;
    lastPaintedSectionId = mapping.sectionId;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopViewFeatures(activeFeatureIds);
    syncPracticeBar();
  }
}

function bindSessionRefresh() {
  if (sessionUnsub) return;
  sessionUnsub = subscribeSession((state, meta) => {
    if (meta?.reason === 'end') {
      tearDownPracticeBar();
      releaseTodayWorkbookSurface();
    } else {
      syncPracticeBar();
    }
    if (meta?.reason === 'item' && state?.items?.length) {
      const item = state.items.find((it) => it.id === state.activeItemId);
      if (item?.workbookId) syncWorkbookToItem(item);
    }
    if (viewRegion && shellApi?.currentView === 'today') {
      if (meta?.reason === 'tick' || meta?.reason === 'item' || meta?.reason === 'pause'
        || meta?.reason === 'resume' || meta?.reason === 'attempt') {
        refreshTodaySessionChrome();
      }
    }
  });
}

function bindWorkbookEntrySync() {
  if (workbookEntryUnsub) return;
  workbookEntryUnsub = subscribeWorkbookEntry(handleWorkbookEntryChange);
}

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  restoreSession();
  currentRoute = route;
  lastRoutedViewKey = routeViewKey(route);
  const view = effectiveView(route);
  shellApi = createWorkspaceShell(container, {
    label: 'Train',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'train', view: id, params: {} }),
    headerActions: (host) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-utility-btn';
      btn.textContent = 'Metronome';
      btn.addEventListener('click', () => {
        panelOpenerEl = btn;
        openPanel('practice');
      });
      host.appendChild(btn);
    },
  });
  shellApi.currentView = view;
  viewRegion = shellApi.viewRegion;
  bindSessionRefresh();
  bindWorkbookEntrySync();
  await paintView(route);
  await syncPracticePanel(route);
}

/**
 * @param {object} route
 */
export async function update(route) {
  const prev = currentRoute;
  currentRoute = route;
  shellApi.currentView = effectiveView(route);
  const panelOnly = isPanelOnlyRouteChange(prev, route);
  if (!panelOnly) {
    lastRoutedViewKey = routeViewKey(route);
    await paintView(route);
  }
  await syncPracticePanel(route);
}

export function unmount() {
  if (sessionUnsub) {
    sessionUnsub();
    sessionUnsub = null;
  }
  if (workbookEntryUnsub) {
    workbookEntryUnsub();
    workbookEntryUnsub = null;
  }
  syncFromSession = false;
  tearDownPracticeBar();
  closePracticePanelDom();
  releaseAllExcept([]);
  stopFeaturesExcept([]);
  shellApi = null;
  viewRegion = null;
  activeFeatureIds = [];
  lastPaintedView = null;
  lastPaintedSectionId = null;
  currentRoute = null;
  lastRoutedViewKey = null;
  panelOpenerEl = null;
}
