import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem } from './quizShared.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
import { buildKeyboard, toggleDrone, stopAll, QWERTY_MAP } from './keyboard.js';
import { initMetronome, stopMetronome, metro } from './metronome.js';
import { initChordWorkout, stopChordWorkout } from './chordWorkout.js';
import { initTuner, stopTuner, stopContextScale, tuner } from './vocalTrainer.js';
import { initPitchTrainer, stopPitchTrainer, pt } from './pitchTrainer.js';
import { initPitchRunner, stopPitchRunner, runner } from './pitchRunner.js';
import { initEarTrainer, stopEarTone, ear } from './earTrainer.js';
import { initSightReading, stopSightReading } from './sightReadingTrainer.js';
import { initChordRef, stopChordRef, chOscillators } from './chordReference.js';
import { initMovableChordCards } from './movableChordCards.js';
import { initRecorder, initHoldRecordButton, stopRecorder, recorder } from './recorder.js';
import { initSongwriter, stopSongwriter } from './songwriter.js';
import {
  initExercises,
  stopExercises,
  closeExerciseViewer,
  openExerciseViewer,
  onExerciseViewerChange,
  onExerciseFolderChange,
  openExerciseFolderForRoute,
  currentExerciseFolderId,
} from './exercises.js';
import {
  initWorkbooks,
  stopWorkbooks,
  closeWorkbookDetail,
  openWorkbookForRoute,
  onWorkbookDetailChange,
  onWorkbookFolderChange,
  openWorkbookFolderForRoute,
  currentWorkbookFolderId,
} from './workbooks.js';
import { initNotes, stopNotes } from './notes.js';
import { initGpPlayer, stopGpPlayer } from './gpPlayer.js';
import { initTrackToSheet, stopTrackToSheet } from './trackToSheet.js';
import { initScaleRef, stopScaleRef } from './scaleReference.js';
import { initTriadRef, stopTriadRef } from './triadReference.js';
import { initChordFinder, stopChordFinder } from './chordFinder.js';
import { initDrumTabReference, stopDrumTabReference } from './drumTabReference.js';
import { initPracticeLab, stopPracticeLab } from './practiceLab/index.js';
import { initIntervalReference, stopIntervalReference } from './intervalReference.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';
import { initProgressHeaders } from './progressHeader.js';
import { renderAreaPage } from './areaPages.js';
import { initShellNav, setActiveNav } from './shell/nav.js';
import { initMusicPreferences, initGlobalVolume } from './musicPreferences.js';
import { getTabs, getTool, isHoldRecordRelevant, isPrimaryArea, toolContextFields } from './tools.js';
import { initScreenUx, syncSetupToolbars } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';
import { parseAppRoute, routeLayerDepth, routeUrl, sameRoute } from './appRoute.js';
import { resolveRoute, isKnownRoute, DEFAULT_ROUTE_ID } from './routeMap.js';
import { initAudioDock } from './audioDock.js';
import { initSwReloadGuard } from './swReloadGuard.js';
import { mountToolPage } from './shell/toolPage.js';
import {
  pushRoute,
  popRoute,
  currentOrigin,
  parentAddress,
  saveViewState,
  readViewState,
  restoreScroll,
  focusHeading,
} from './shell/navStack.js';
import { hasUnsaved, confirmLeave } from './shell/unsavedGuard.js';
import { openSelectionSheet } from './selectionSheet.js';
import { runMigrations, createLiveContext } from './migrations/index.js';
import { initLibraryTabs, syncLibraryTabs } from './library/libraryTabs.js';
import { shouldKeepLibraryPlayer, libraryRouteParams } from './library/libraryPlayerRoute.js';
import { showAppToast } from './appToast.js';

const MOBILE_SWIPE_QUERY = '(max-width: 768px), (orientation: landscape) and (max-height: 500px)';

/** Tool ids that host a library browser rather than a plain tool page. */
const LIBRARY_TOOL_IDS = new Set(['exercises', 'workbooks']);

/**
 * Tools that keep their own page chrome. The shared tool-page shell is not
 * mounted on them: they are full-screen browsers or players.
 */
const SELF_CHROMED_TOOL_IDS = new Set(['exercises', 'workbooks', 'scoreplayer', 'settings']);

const TOOL_STOPPERS = {
  metronome: () => { if (metro.playing) stopMetronome(); },
  keyboard: () => { if (Object.keys(S.kb.drones).length) stopAll(); },
  intervalref: () => stopIntervalReference(),
  scaleref: () => stopScaleRef(),
  triads: () => stopTriadRef(),
  chordfinder: () => stopChordFinder(),
  chordref: () => { if (chOscillators.length) stopChordRef(); },
  pitchear: () => {
    if (tuner.running) stopTuner();
    if (tuner.scalePlaying) stopContextScale();
    if (pt.running) stopPitchTrainer();
    if (runner.running) stopPitchRunner();
    ear._seqTimers.forEach(clearTimeout);
    ear._seqTimers = [];
    if (ear._osc) stopEarTone();
  },
  sightreading: () => stopSightReading(),
  chordworkout: () => stopChordWorkout(),
  audiostudio: () => { if (recorder.playing) stopRecorder(); stopTrackToSheet(); },
  songstudio: () => stopSongwriter(),
  exercises: () => stopExercises(),
  workbooks: () => stopWorkbooks(),
  notes: () => stopNotes(),
  scoreplayer: () => stopGpPlayer(),
  drumtab: () => stopDrumTabReference(),
  practicelab: () => stopPracticeLab(),
};

const TOOL_INITS = {
  circle: drawCoF,
  keyboard: buildKeyboard,
  metronome: initMetronome,
  intervalref: initIntervalReference,
  scaleref: initScaleRef,
  triads: initTriadRef,
  chordfinder: initChordFinder,
  chordref: () => { initMovableChordCards(); initChordRef(); },
  chordworkout: initChordWorkout,
  pitchear: () => { initTuner(); initPitchTrainer(); initPitchRunner(); initEarTrainer(); },
  sightreading: initSightReading,
  practicelab: () => initPracticeLab({ mode: currentRouteParams.mode }),
  audiostudio: () => { initRecorder(); initTrackToSheet(); },
  songstudio: initSongwriter,
  exercises: initExercises,
  workbooks: initWorkbooks,
  notes: initNotes,
  drumtab: initDrumTabReference,
  scoreplayer: initGpPlayer,
  settings: () => initMusicPreferences({ showSection }),
};

function stopOtherTools(keepIds) {
  Object.keys(TOOL_STOPPERS).forEach(toolId => {
    if (!keepIds.includes(toolId)) TOOL_STOPPERS[toolId]();
  });
}

function initTool(id) {
  if (TOOL_INITS[id]) TOOL_INITS[id]();
}

let splitSecondaryId = null;
let currentNavId = DEFAULT_ROUTE_ID;
let currentRouteId = DEFAULT_ROUTE_ID;
let currentRouteParams = {};
/** How many in-app pushState entries sit above the boot entry (phone Back pops these). */
let navPushCount = 0;
/** True while applying a popstate/hashchange so we don't push another history entry. */
let applyingHistory = false;
/** True for one hashchange that a replaceState already handled. */
let suppressHashChange = false;
/** True while a route paints a section. The screens it opens are already in
 * the address, so they must not write to history again. */
let applyingSection = false;
/** Tool-page handles by tool id, so a route can drive the mode tabs. */
const toolPages = new Map();

function clearSplitPane() {
  if (!splitSecondaryId) return;
  const sec = document.getElementById('sec-' + splitSecondaryId);
  if (sec) sec.classList.remove('active', 'split-secondary');
  splitSecondaryId = null;
  document.body.classList.remove('split-mode');
  updateSplitUI();
}

function sectionUrl(id, params = {}) {
  return routeUrl({ id: id || DEFAULT_ROUTE_ID, params });
}

/**
 * Record a library screen in browser history without repainting the section.
 * The library pages open their own folders, workbooks and players, so this
 * only keeps the address and the history stack in step with them.
 *
 * A screen one level deeper pushes a history entry, so the phone Back button
 * walks back through the screens the user opened. A screen one level up asks
 * the browser to go back, so the same entries come off the stack again.
 */
function syncLibraryPlayerRoute(routeId, params) {
  const nextParams = { ...params };
  if (applyingSection) return;
  if (currentRouteId !== routeId) return;
  if (sameRoute({ id: routeId, params: currentRouteParams }, { id: routeId, params: nextParams })) {
    return;
  }

  const prevDepth = routeLayerDepth(currentRouteParams);
  const nextDepth = routeLayerDepth(nextParams);

  // The user closed a layer. The history entry for it is still on the stack,
  // so step back and let the popstate handler repaint the screen below.
  if (nextDepth < prevDepth && !applyingHistory && navPushCount > 0) {
    history.back();
    return;
  }

  currentRouteId = routeId;
  currentRouteParams = { ...nextParams };
  suppressHashChange = true;
  const histState = { musiNav: routeId, params: nextParams };
  const url = sectionUrl(routeId, nextParams);

  if (nextDepth > prevDepth && !applyingHistory) {
    history.pushState(histState, '', url);
    navPushCount += 1;
    pushRoute({ id: routeId, params: nextParams }, 'library');
    return;
  }

  history.replaceState(histState, '', url);
}

function inferNavigationOrigin(screenId) {
  if (isPrimaryArea(screenId)) return screenId;
  if (LIBRARY_TOOL_IDS.has(screenId)) return 'library';
  return currentOrigin() || 'direct';
}

/** The area page a tool belongs to. Utilities fall back to the default area. */
function parentRouteForTool(tool) {
  if (!tool || tool.utility) return DEFAULT_ROUTE_ID;
  return tool.area;
}

function resolveIncomingRoute(id, params = {}) {
  const resolved = resolveRoute({ id: id || '', params });
  return {
    routeId: resolved.id,
    params: resolved.params || {},
  };
}

function isValidSection(id) {
  if (id === '' ) return true;
  return isKnownRoute(id);
}

async function promptUnsaved({ title, choices }) {
  const choiceId = await openSelectionSheet({
    title,
    items: choices.map((label) => ({ id: label, label })),
    search: false,
  });
  return choiceId;
}

async function guardLeave({ fromPopstate = false } = {}) {
  if (!hasUnsaved()) return true;
  const choice = await confirmLeave(promptUnsaved);
  if (choice === 'keep') {
    if (fromPopstate) history.forward();
    return false;
  }
  return true;
}

function saveLeaveViewState(sectionId) {
  if (isPrimaryArea(sectionId)) {
    const state = readViewState(sectionId) || {};
    saveViewState(sectionId, { ...state, scrollY: window.scrollY });
  }
  if (sectionId === 'exercises') {
    const state = readViewState('library:exercises') || {};
    saveViewState('library:exercises', { ...state, scrollY: window.scrollY });
  }
}

function restoreArriveViewState(sectionId) {
  if (isPrimaryArea(sectionId)) restoreScroll(sectionId);
  if (sectionId === 'exercises') restoreScroll('library:exercises');
}

/**
 * Mount the shared tool-page shell once per tool section. The shell owns the
 * back button, the title, the description, and the mode tabs.
 */
function mountToolPageIfNeeded(toolId, sec) {
  if (SELF_CHROMED_TOOL_IDS.has(toolId)) return;
  if (sec.dataset.toolPage === '1') return;
  const tool = getTool(toolId);
  if (!tool) return;

  const handle = mountToolPage(sec, {
    id: toolId,
    title: tool.title || tool.label,
    description: tool.description || '',
    modes: tool.modes || [],
    defaultMode: tool.defaultMode || '',
    activeMode: currentRouteId === toolId ? currentRouteParams.mode : '',
    contextFields: toolContextFields(toolId),
    moreItems: [],
    onBack: () => goBack(() => applyRoute({
      id: parentRouteForTool(tool),
      params: {},
      mode: 'replace',
      source: 'internal',
    })),
    onModeChange: (modeId) => {
      if (currentRouteId !== toolId) return;
      if (currentRouteParams.mode === modeId) return;
      void applyRoute({
        id: toolId,
        params: { ...currentRouteParams, mode: modeId },
        mode: 'replace',
        source: 'internal',
      });
    },
  });
  toolPages.set(toolId, handle);
}

function updateHoldRecordVisibility(id) {
  document.body.classList.toggle('hold-rec-relevant', isHoldRecordRelevant(id));
}

function updateHeaderChrome(id) {
  const isTool = !!getTool(id);
  document.body.classList.toggle('tool-screen', isTool);
  setActiveNav(id);
}

/**
 * Close one library layer when history holds no entry for it. This happens
 * after a cold start on a deep link, e.g. `#workbooks?workbook=w1&exercise=e2`.
 * Every layer the user opens in the app pushes its own entry, so Back pops
 * that entry instead of coming here.
 * @returns {Promise<boolean>} true when a layer closed and Back is done.
 */
async function stepBackInsideLibrary() {
  if (navPushCount > 0) return false;
  if (!LIBRARY_TOOL_IDS.has(currentRouteId)) return false;
  if (routeLayerDepth(currentRouteParams) === 0) return false;

  // Drop the deepest hierarchy key and stay on the screen below it.
  const params = { ...currentRouteParams };
  for (const key of ['companion', 'exercise', 'workbook', 'folder']) {
    if (params[key]) {
      delete params[key];
      break;
    }
  }
  await applyRoute({ id: currentRouteId, params, mode: 'replace', source: 'internal' });
  return true;
}

/**
 * Navigate back through in-app screen history (same as the phone Back button).
 * Falls back to the parent screen when there is nothing left to pop.
 */
async function goBack(fallback) {
  const canLeave = await guardLeave();
  if (!canLeave) return false;

  // A deep link opens a library layer with no history entry behind it. Step
  // down the Library -> Workbooks -> workbook -> exercise chain in that case.
  if (await stepBackInsideLibrary()) return false;

  if (navPushCount > 0) {
    history.back();
    return true;
  }

  if (typeof fallback === 'function') {
    fallback();
    return false;
  }

  const origin = currentOrigin();
  const parent = parentAddress(origin, { id: currentRouteId, params: currentRouteParams });
  popRoute();
  await applyRoute({
    id: parent.id,
    params: parent.params,
    mode: 'replace',
    source: 'internal',
    origin,
  });
  return false;
}

const VALID_NAV_ORIGINS = new Set([
  'train',
  'study',
  'create',
  'library',
  'utilities',
  'workbook',
  'search',
  'recent',
  'direct',
]);

function coerceNavOrigin(origin) {
  return VALID_NAV_ORIGINS.has(origin) ? origin : 'direct';
}

function applyAreaSection(areaId, sec) {
  renderAreaPage(areaId, sec, {
    openTool: (toolId) => {
      void applyRoute({
        id: toolId,
        params: {},
        mode: 'push',
        source: 'internal',
        origin: areaId,
      });
    },
  });
  stopOtherTools([]);
  updateHoldRecordVisibility(null);
  updateHeaderChrome(areaId);
  updateSplitUI();
}

/** Wire the back button of a section that keeps its own page chrome. */
function wireSelfChromedBack(sec, parentRouteId) {
  const back = sec?.querySelector('.tool-back:not(.tool-page-back)');
  if (!back) return;
  back.textContent = '← Back';
  back.onclick = () => goBack(() => applyRoute({
    id: parentRouteId,
    params: {},
    mode: 'replace',
    source: 'internal',
  }));
}

function applyLibrarySection(sectionId) {
  syncLibraryTabs(sectionId);
  const keepWorkbookPlayer = shouldKeepLibraryPlayer('workbooks', currentRouteParams);
  const keepExercisePlayer = shouldKeepLibraryPlayer('exercises', currentRouteParams);
  if (sectionId === 'workbooks') {
    closeExerciseViewer();
    if (!keepWorkbookPlayer) closeWorkbookDetail();
  } else {
    closeWorkbookDetail();
    if (!keepExercisePlayer) closeExerciseViewer();
  }
  stopOtherTools([sectionId]);
  initTool(sectionId);
  wireSelfChromedBack(document.getElementById('sec-' + sectionId), 'library');
  // The open folder is part of the address, so Back walks out of a folder the
  // same way it walks out of a workbook.
  if (sectionId === 'workbooks') openWorkbookFolderForRoute(currentRouteParams.folder || '');
  else openExerciseFolderForRoute(currentRouteParams.folder || '');
  if (keepWorkbookPlayer && sectionId === 'workbooks') {
    openWorkbookForRoute({
      workbookId: currentRouteParams.workbook,
      exerciseId: currentRouteParams.exercise,
      companionId: currentRouteParams.companion,
    });
  } else if (keepExercisePlayer && sectionId === 'exercises') {
    void openExerciseViewer(currentRouteParams.exercise);
  }
  updateHoldRecordVisibility(sectionId);
  updateHeaderChrome(sectionId);
  updateSplitUI();
  syncSetupToolbars();
}

function applySection(id, { keep = [] } = {}) {
  if (splitSecondaryId) {
    const sec = document.getElementById('sec-' + splitSecondaryId);
    if (sec) sec.classList.remove('active', 'split-secondary');
    splitSecondaryId = null;
    document.body.classList.remove('split-mode');
  }

  const sec = document.getElementById('sec-' + id);
  if (!sec) return;

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  sec.classList.add('active');
  currentNavId = id;

  if (isPrimaryArea(id)) {
    applyAreaSection(id, sec);
    return;
  }

  if (LIBRARY_TOOL_IDS.has(id)) {
    applyLibrarySection(id);
    return;
  }

  const tool = getTool(id);
  if (tool) saveSetting('nav.lastTool', id);

  mountToolPageIfNeeded(id, sec);
  const page = toolPages.get(id);
  if (page && currentRouteParams.mode) page.setActiveMode(currentRouteParams.mode);

  stopOtherTools([id, ...keep]);
  initTool(id);
  // Sections that keep their own chrome still need a wired back button. This
  // runs after initTool because a tool may repaint its own page head.
  if (SELF_CHROMED_TOOL_IDS.has(id)) wireSelfChromedBack(sec, parentRouteForTool(tool));
  updateHoldRecordVisibility(id);
  updateHeaderChrome(id);
  updateSplitUI();
  syncSetupToolbars();
}

function showSection(id, skipHash, params = {}) {
  const incoming = resolveIncomingRoute(id, params);
  const mode = (skipHash || currentNavId === incoming.routeId) ? 'replace' : 'push';
  void applyRoute({
    id: incoming.routeId,
    params: incoming.params,
    mode,
    source: 'internal',
  });
}

async function applyRoute({
  id,
  params = {},
  mode = 'push',
  source = 'internal',
  origin = null,
}) {
  try {
    const incoming = resolveIncomingRoute(id, params);
    const routeId = incoming.routeId;
    const routeParams = incoming.params;

    const prevSectionId = currentNavId;
    if (routeId !== prevSectionId) {
      const canLeave = await guardLeave({ fromPopstate: source === 'popstate' });
      if (!canLeave) return;
      saveLeaveViewState(prevSectionId);
    }

    currentRouteId = routeId;
    currentRouteParams = { ...routeParams };

    if (!applyingHistory && mode !== 'none') {
      const url = sectionUrl(routeId, routeParams);
      const histState = { musiNav: routeId, params: routeParams };
      if (mode === 'replace') {
        suppressHashChange = true;
        history.replaceState(histState, '', url);
      } else if (mode === 'push') {
        suppressHashChange = true;
        history.pushState(histState, '', url);
        navPushCount += 1;
        const navOrigin = coerceNavOrigin(origin || inferNavigationOrigin(prevSectionId));
        pushRoute({ id: routeId, params: routeParams }, navOrigin);
      }
    }

    applyingSection = true;
    try {
      applySection(routeId);
    } finally {
      applyingSection = false;
    }
    restoreArriveViewState(routeId);
    focusHeading(document.getElementById('sec-' + routeId));
  } catch (err) {
    console.error('applyRoute failed:', err);
    showAppToast(err?.message);
  }
}

window.showSection = showSection;
window.goBack = goBack;

function enterSplit(secondaryId) {
  const primaryId = currentPrimaryId();
  if (isMobileSwipeNav()) return;
  if (!secondaryId || secondaryId === primaryId) return;
  if (isPrimaryArea(primaryId) || isPrimaryArea(secondaryId)) return;
  if (!getTabs().some(t => t.id === secondaryId)) return;
  splitSecondaryId = secondaryId;
  document.body.classList.add('split-mode');
  const sec = document.getElementById('sec-' + secondaryId);
  if (sec) sec.classList.add('active', 'split-secondary');
  mountToolPageIfNeeded(secondaryId, sec);
  initTool(secondaryId);
  updateSplitUI();
}

function exitSplit() {
  if (!splitSecondaryId) return;
  const primaryId = currentPrimaryId();
  stopOtherTools(primaryId ? [primaryId] : []);
  clearSplitPane();
}

let splitMenuEl = null;

function currentPrimaryId() {
  return (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
}

function buildSplitMenu() {
  if (!splitMenuEl) return;
  const primaryId = currentPrimaryId();
  splitMenuEl.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'split-menu-title';
  title.textContent = splitSecondaryId ? 'Second tool' : 'Add a second tool';
  splitMenuEl.appendChild(title);
  getTabs().forEach(t => {
    if (t.id === primaryId) return;
    const btn = document.createElement('button');
    btn.className = 'tc-menu-item' + (t.id === splitSecondaryId ? ' active' : '');
    btn.textContent = t.label;
    btn.onclick = (e) => { e.stopPropagation(); enterSplit(t.id); closeSplitMenu(); };
    splitMenuEl.appendChild(btn);
  });
  if (splitSecondaryId) {
    const exit = document.createElement('button');
    exit.className = 'tc-menu-item split-exit';
    exit.textContent = '✕ Exit split view';
    exit.onclick = (e) => { e.stopPropagation(); exitSplit(); closeSplitMenu(); };
    splitMenuEl.appendChild(exit);
  }
}

function openSplitMenu() {
  if (!splitMenuEl) return;
  if (isMobileSwipeNav()) {
    closeSplitMenu();
    return;
  }
  buildSplitMenu();
  const trigger = document.getElementById('split-trigger');
  if (!trigger) return;
  // The trigger sits at the foot of the left rail, so the menu opens beside it.
  splitMenuEl.classList.add('open');
  const r = trigger.getBoundingClientRect();
  splitMenuEl.style.right = 'auto';
  splitMenuEl.style.left = (r.right + 8) + 'px';
  const maxTop = window.innerHeight - splitMenuEl.offsetHeight - 8;
  splitMenuEl.style.top = Math.max(8, Math.min(r.top - 8, maxTop)) + 'px';
}

function closeSplitMenu() { if (splitMenuEl) splitMenuEl.classList.remove('open'); }

function updateSplitUI() {
  const trigger = document.getElementById('split-trigger');
  if (!trigger) return;
  if (isMobileSwipeNav()) {
    if (splitSecondaryId) {
      const primaryId = currentPrimaryId();
      const sec = document.getElementById('sec-' + splitSecondaryId);
      if (sec) sec.classList.remove('active', 'split-secondary');
      splitSecondaryId = null;
      document.body.classList.remove('split-mode');
      stopOtherTools(primaryId && !isPrimaryArea(primaryId) ? [primaryId] : []);
    }
    closeSplitMenu();
    trigger.style.display = 'none';
    trigger.classList.remove('active');
    return;
  }
  const primary = currentPrimaryId();
  trigger.style.display = isPrimaryArea(primary) ? 'none' : '';
  trigger.classList.toggle('active', !!splitSecondaryId);
}

function initSplitView() {
  splitMenuEl = document.createElement('div');
  splitMenuEl.className = 'tc-menu split-menu';
  document.body.appendChild(splitMenuEl);

  const trigger = document.getElementById('split-trigger');
  if (trigger) {
    trigger.onclick = (e) => {
      e.stopPropagation();
      if (splitMenuEl.classList.contains('open')) closeSplitMenu();
      else openSplitMenu();
    };
  }
  document.addEventListener('click', (e) => {
    if (splitMenuEl && !splitMenuEl.contains(e.target) && e.target.id !== 'split-trigger') closeSplitMenu();
  });
  window.addEventListener('resize', () => {
    closeSplitMenu();
    updateSplitUI();
  });
  updateSplitUI();
}

function isMobileSwipeNav() {
  return window.matchMedia(MOBILE_SWIPE_QUERY).matches;
}

async function init() {
  const bootHash = location.hash;
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  initBootSplash();

  try {
    const report = await runMigrations(createLiveContext());
    if (report.failed?.length) {
      for (const failure of report.failed) {
        console.warn(`Migration ${failure.id} failed at ${failure.stage}: ${failure.error}`);
      }
    }
  } catch (err) {
    console.warn('Migration runner failed:', err);
  }

  initShellNav({ showSection, currentId: currentNavId });

  window.addEventListener('error', (event) => {
    if (!event?.error) return;
    const msg = event.error.message || event.message || '';
    if (!msg) return;
    showAppToast(msg);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = reason?.message || (typeof reason === 'string' ? reason : '');
    if (msg) showAppToast(msg);
    event.preventDefault();
  });

  function buildList(containerId, items, defaultVal) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const validValues = items.filter(item => item.type !== 'label').map(item => item.val);
    const activeVal = getSetting(containerId, defaultVal, validValues);
    items.forEach(({ type, val, label }) => {
      if (type === 'label') {
        const group = document.createElement('div');
        group.className = 'sl-group-label';
        group.textContent = label;
        container.appendChild(group);
        return;
      }
      const div = document.createElement('div');
      div.className = 'sl-item' + (val === activeVal ? ' active' : '');
      div.dataset.val = val;
      div.textContent = label;
      div.onclick = () => selectItem(containerId, val);
      container.appendChild(div);
    });
  }

  buildList('sl-int-diff',
    [{ val: 'easy', label: 'Diatonic' }, { val: 'medium', label: 'Extended' }, { val: 'hard', label: 'Chromatic' }],
    'easy');

  const activeSection = () => document.querySelector('.section.active')?.id;

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (activeSection() !== 'sec-keyboard') return;
    const midi = QWERTY_MAP[e.key.toLowerCase()];
    if (midi !== undefined) { e.preventDefault(); if (!S.kb.drones[midi]) toggleDrone(midi); }
  });
  document.addEventListener('keyup', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (activeSection() !== 'sec-keyboard') return;
    const midi = QWERTY_MAP[e.key.toLowerCase()];
    if (midi !== undefined && S.kb.drones[midi]) toggleDrone(midi);
  });

  document.querySelectorAll('.wave-btn').forEach(btn => {
    S.kb.wave = getSetting('kb.wave', S.kb.wave, ['sine', 'triangle', 'sawtooth', 'square']);
    btn.classList.toggle('active', btn.dataset.w === S.kb.wave);
    btn.onclick = () => {
      document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.kb.wave = btn.dataset.w;
      saveSetting('kb.wave', S.kb.wave);
    };
  });

  const kbVol = document.getElementById('kb-vol');
  if (kbVol) {
    const savedKbVol = Number(getSetting('kb.vol', Number(kbVol.value) / 100));
    if (!Number.isNaN(savedKbVol)) {
      S.kb.vol = Math.max(0, Math.min(1, savedKbVol));
      kbVol.value = Math.round(S.kb.vol * 100);
    }
    kbVol.oninput = (e) => {
      S.kb.vol = e.target.value / 100;
      saveSetting('kb.vol', S.kb.vol);
      Object.values(S.kb.drones).forEach(dr => {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
          dr.gain.gain.setValueAtTime(S.kb.vol, audioCtx.currentTime);
        }
      });
    };
  }

  buildNoteButtons('iq-notes');

  initGlobalVolume();
  initMetronome();
  initVisualizer();
  initNowPlaying();
  initAudioDock(document.getElementById('audio-dock'));
  initSwReloadGuard();
  initHoldRecordButton();
  initProgressHeaders();
  initLibraryTabs({
    openRoute: (routeId, routeParams, { replace } = {}) => applyRoute({
      id: routeId,
      params: routeParams || {},
      mode: replace ? 'replace' : 'push',
      source: 'internal',
      origin: 'library',
    }),
  });
  onWorkbookDetailChange(({ open, workbookId, exerciseId }) => {
    if (currentRouteId !== 'workbooks') return;
    syncLibraryPlayerRoute('workbooks', libraryRouteParams({
      folder: currentWorkbookFolderId(),
      workbook: open ? workbookId : '',
      exercise: open ? exerciseId : '',
    }));
  });
  onWorkbookFolderChange(({ folderId }) => {
    if (currentRouteId !== 'workbooks') return;
    syncLibraryPlayerRoute('workbooks', libraryRouteParams({ folder: folderId }));
  });
  onExerciseViewerChange(({ open, exerciseId }) => {
    if (currentRouteId !== 'exercises') return;
    syncLibraryPlayerRoute('exercises', libraryRouteParams({
      folder: currentExerciseFolderId(),
      exercise: open ? exerciseId : '',
    }));
  });
  onExerciseFolderChange(({ folderId }) => {
    if (currentRouteId !== 'exercises') return;
    syncLibraryPlayerRoute('exercises', libraryRouteParams({ folder: folderId }));
  });
  initMusicPreferences({ showSection });
  initSplitView();
  initScreenUx({ showSection });

  const bootRoute = parseAppRoute(bootHash);
  await applyRoute({
    id: bootRoute.id,
    params: bootRoute.params,
    mode: 'replace',
    source: 'boot',
  });

  // Phone / browser Back: walk the screen stack instead of leaving the PWA.
  window.addEventListener('popstate', async (e) => {
    applyingHistory = true;
    navPushCount = Math.max(0, navPushCount - 1);
    popRoute();
    try {
      let routeId = e.state?.musiNav;
      let routeParams = e.state?.params || {};
      if (!routeId) {
        const parsed = parseAppRoute(location.hash);
        routeId = parsed.id;
        routeParams = parsed.params;
      }
      await applyRoute({
        id: routeId,
        params: routeParams,
        mode: 'none',
        source: 'popstate',
      });
    } catch (err) {
      console.error('popstate handler failed:', err);
    } finally {
      applyingHistory = false;
    }
  });

  window.addEventListener('hashchange', async () => {
    if (suppressHashChange) {
      suppressHashChange = false;
      return;
    }
    if (applyingHistory) return;
    applyingHistory = true;
    try {
      const parsed = parseAppRoute(location.hash);
      const incoming = resolveIncomingRoute(parsed.id, parsed.params);
      if (incoming.routeId !== currentNavId) navPushCount += 1;
      await applyRoute({
        id: parsed.id,
        params: parsed.params,
        mode: 'none',
        source: 'hashchange',
      });
    } catch (err) {
      console.error('hashchange handler failed:', err);
    } finally {
      applyingHistory = false;
    }
  });

  // Reveal PRESS START only after nav/hash routing has settled.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => markBootReady());
  });

  // Optional cloud sync: gated so empty config never loads Supabase or blocks boot.
  (async () => {
    try {
      const { loadCloudConfig, isCloudEnabled } = await import('./cloud/cloudConfig.js');
      await loadCloudConfig();
      if (isCloudEnabled()) {
        const { initCloudSync } = await import('./cloud/cloudSync.js');
        await initCloudSync();
      }
    } catch (_) { /* cloud sync is optional */ }
  })();
}

document.addEventListener('DOMContentLoaded', init);
