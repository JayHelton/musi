import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem } from './scaleQuiz.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
import { buildKeyboard, toggleDrone, stopAll, QWERTY_MAP } from './keyboard.js';
import { initMetronome, stopMetronome, metro } from './metronome.js';
// SIMPLIFY: Fretboard trainer hidden.
// import { initFretboard } from './fretboardTrainer.js';
// SIMPLIFY: Fretboard Interval Map hidden.
// import { initIntervalOrbit, stopIntervalOrbit } from './intervalOrbit.js';
import { initChordWorkout, stopChordWorkout } from './chordWorkout.js';
import { initTuner, stopTuner, stopContextScale, tuner } from './vocalTrainer.js';
import { initPitchTrainer, stopPitchTrainer, pt } from './pitchTrainer.js';
import { initPitchRunner, stopPitchRunner, runner } from './pitchRunner.js';
import { initEarTrainer, stopEarTone, ear } from './earTrainer.js';
// SIMPLIFY: Timing drill hidden.
// import { initTimingDrill, stopTimingDrill, timingDrill } from './timingDrill.js';
import { initSightReading, stopSightReading } from './sightReadingTrainer.js';
import { initChordBuilder, stopChord, chordBuilder } from './chordBuilder.js';
import { initChordRef, stopChordRef, chOscillators } from './chordReference.js';
import { initMovableChordCards } from './movableChordCards.js';
import { initRecorder, initHoldRecordButton, stopRecorder, recorder } from './recorder.js';
import { initSongwriter, stopSongwriter } from './songwriter.js';
import { initExercises, stopExercises } from './exercises.js';
import { initWorkbooks, stopWorkbooks } from './workbooks.js';
// SIMPLIFY: Routines and Sessions hidden.
// import { initRoutines, stopRoutines, createRoutineLayerDescriptors, setRoutineNavigator } from './routines.js';
import { initNotes, stopNotes } from './notes.js';
import { initPracticeTimer, stopPracticeTimer } from './practiceTimer.js';
// SIMPLIFY: Drums generators and builder hidden. Guitar Pro drum playback stays.
// import { initDrums, stopDrums } from './drums/drumsUI.js';
import { initGpPlayer, stopGpPlayer } from './gpPlayer.js';
import { initTrackToSheet, stopTrackToSheet } from './trackToSheet.js';
import { initScaleRef, stopScaleRef } from './scaleReference.js';
import { initTriadRef, stopTriadRef } from './triadReference.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';
import { initProgressHeaders } from './progressHeader.js';
import { renderHub } from './home.js';
import { initShellNav, setActiveNav } from './shell/nav.js';
import { initToolsHome, refreshToolsHome, recordToolVisit } from './tools/home.js';
import { initStats } from './stats.js';
import { initMusicPreferences, initGlobalVolume } from './musicPreferences.js';
// SIMPLIFY: Study Lab hidden.
// import { initStudyLab, stopStudyLab } from './studyLab.js';
import {
  CATEGORIES,
  getTabs, getTool, isHoldRecordRelevant, isFeatureEnabled,
} from './tools.js';
import { initScreenUx, syncSetupToolbars } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';
import { parseAppRoute, routeUrl } from './appRoute.js';
import { resolveRoute, shouldShowNotice, isKnownRoute, LEGACY_ROUTES } from './routeMap.js';
import { initAudioDock } from './audioDock.js';
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
import { getExercises } from './exercises.js';
import { runMigrations, createLiveContext } from './migrations/index.js';
import { ROUTINE_ROUTE_ID, buildRoutineParams } from './routineRoute.js';
import { createRoutineNavigator, createWorkbookLayerDescriptors } from './routineNav.js';
import { getRoutine } from './routineModel.js';
import { getWorkbook } from './workbookModel.js';
import { initLibraryTabs, syncLibraryTabs } from './library/libraryTabs.js';

const MOBILE_SWIPE_QUERY = '(max-width: 768px), (orientation: landscape) and (max-height: 500px)';

const TOOL_STOPPERS = {
  metronome: () => { if (metro.playing) stopMetronome(); },
  keyboard: () => { if (Object.keys(S.kb.drones).length) stopAll(); },
  scaleref: () => stopScaleRef(),
  triads: () => stopTriadRef(),
  chords: () => { if (chordBuilder.oscillators.length) stopChord(); if (chOscillators.length) stopChordRef(); },
  tuner: () => { if (tuner.running) stopTuner(); if (tuner.scalePlaying) stopContextScale(); if (pt.running) stopPitchTrainer(); if (runner.running) stopPitchRunner(); },
  ear: () => { ear._seqTimers.forEach(clearTimeout); ear._seqTimers = []; if (ear._osc) stopEarTone(); },
  // SIMPLIFY: Timing drill hidden.
  // timing: () => { if (timingDrill.playing) stopTimingDrill(); },
  sightreading: () => stopSightReading(),
  chordlab: () => stopChordWorkout(),
  // SIMPLIFY: Fretboard Interval Map hidden.
  // intervalorbit: () => stopIntervalOrbit(),
  recorder: () => { if (recorder.playing) stopRecorder(); },
  songwriter: () => stopSongwriter(),
  exercises: () => stopExercises(),
  workbooks: () => stopWorkbooks(),
  // SIMPLIFY: Routines and Sessions hidden.
  // routines: () => stopRoutines(),
  notes: () => stopNotes(),
  practice: () => stopPracticeTimer(),
  // SIMPLIFY: Drums generators and builder hidden.
  // drums: () => stopDrums(),
  tracktosheet: () => stopTrackToSheet(),
  gpplayer: () => stopGpPlayer(),
  // SIMPLIFY: Study Lab hidden.
  // studylab: () => stopStudyLab(),
};
const TOOL_INITS = {
  circle: drawCoF,
  keyboard: buildKeyboard,
  metronome: initMetronome,
  scaleref: initScaleRef,
  triads: initTriadRef,
  chords: () => { initMovableChordCards(); initChordRef(); initChordBuilder(); },
  // SIMPLIFY: Fretboard trainer hidden.
  // fretboard: initFretboard,
  // SIMPLIFY: Fretboard Interval Map hidden.
  // intervalorbit: initIntervalOrbit,
  chordlab: initChordWorkout,
  tuner: () => { initTuner(); initPitchTrainer(); initPitchRunner(); },
  ear: initEarTrainer,
  // SIMPLIFY: Timing drill hidden.
  // timing: initTimingDrill,
  sightreading: initSightReading,
  recorder: initRecorder,
  songwriter: initSongwriter,
  exercises: initExercises,
  workbooks: initWorkbooks,
  // SIMPLIFY: Routines and Sessions hidden.
  // routines: initRoutines,
  notes: initNotes,
  practice: initPracticeTimer,
  // SIMPLIFY: Drums generators and builder hidden.
  // drums: initDrums,
  tracktosheet: initTrackToSheet,
  gpplayer: initGpPlayer,
  // SIMPLIFY: Study Lab hidden.
  // studylab: initStudyLab,
  musicprefs: () => initMusicPreferences({ showSection }),
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
let currentNavId = 'hub-reference';
let currentRouteId = 'reference';
let currentRouteParams = {};
/** How many in-app pushState entries sit above the boot entry (phone Back pops these). */
let navPushCount = 0;
/** True while applying a popstate/hashchange so we don't push another history entry. */
let applyingHistory = false;
/** True for one hashchange that a replaceState already handled. */
let suppressHashChange = false;

function clearSplitPane() {
  if (!splitSecondaryId) return;
  const sec = document.getElementById('sec-' + splitSecondaryId);
  if (sec) sec.classList.remove('active', 'split-secondary');
  splitSecondaryId = null;
  document.body.classList.remove('split-mode');
  updateSplitUI();
}

function isHubId(id) {
  return typeof id === 'string' && id.startsWith('hub-');
}

function hubCategory(id) {
  return id.replace(/^hub-/, '');
}

function sectionUrl(id, params = {}) {
  return routeUrl({ id: id || 'reference', params });
}

const LIVE_SECTION_BY_ROUTE = {
  reference: 'hub-reference',
  create: 'hub-create',
  tools: 'tools',
  home: 'hub-reference',
  scalelab: 'scaleref',
  // SIMPLIFY: Fretboard and Interval Map hidden.
  // fretmap: 'intervalorbit',
  chordlab: 'chords',
  circle: 'circle',
  triads: 'triads',
  // SIMPLIFY: Study Lab hidden.
  // studylab: 'studylab',
  pitchear: 'tuner',
  metronome: 'metronome',
  audiostudio: 'recorder',
  songstudio: 'songwriter',
  notes: 'notes',
  library: 'exercises',
  // SIMPLIFY: Routines and Sessions hidden.
  // routines: 'routines',
  scoreplayer: 'gpplayer',
  settings: 'musicprefs',
};

const ROOT_SECTION_IDS = new Set([
  'tools',
  'hub-reference',
  'hub-create',
  'reference',
  'create',
  'exercises',
  'workbooks',
]);

const LIBRARY_SECTION_IDS = new Set(['exercises', 'workbooks']);

function resolveSectionAlias(id) {
  if (id === 'intervalmap') return 'intervalorbit';
  if (id === 'tabanalyzer') return 'gpplayer';
  return id;
}

function liveSectionId(routeId, params = {}) {
  if (!routeId) return 'hub-reference';
  if (routeId === 'library') {
    return params.mode === 'workbooks' ? 'workbooks' : 'exercises';
  }
  if (LIVE_SECTION_BY_ROUTE[routeId]) return LIVE_SECTION_BY_ROUTE[routeId];
  return resolveSectionAlias(routeId);
}

function inferNavigationOrigin(sectionId) {
  if (sectionId === 'hub-reference') return 'reference';
  if (sectionId === 'hub-create') return 'create';
  if (sectionId === 'exercises' || sectionId === 'workbooks') return 'library';
  if (sectionId === 'tools') return 'tools';
  return currentOrigin() || 'direct';
}

function hubRouteForTool(tool) {
  if (!tool) return 'tools';
  if (tool.category === 'reference') return 'reference';
  if (tool.category === 'create') return 'create';
  return 'tools';
}

function routeResolveCtx() {
  return {
    hasDrumExercises() {
      try {
        return getExercises().some(item => item && item.instrument === 'drums');
      } catch (e) {
        return false;
      }
    },
    noticesSeen: getSetting('route.noticesSeen', []),
  };
}

function resolveIncomingRoute(id, params = {}) {
  const resolved = resolveRoute({ id: id || '', params }, routeResolveCtx());
  return {
    routeId: resolved.id,
    sectionId: liveSectionId(resolved.id, resolved.params || {}),
    params: resolved.params || {},
    notice: resolved.notice,
  };
}

function isValidSection(id) {
  if (id === '' || id === 'home') return true;
  if (
    id === 'reference'
    || id === 'create'
    || id === 'hub-reference'
    || id === 'hub-create'
    || id === 'circle'
    || id === 'triads'
    || id === 'studylab'
    || id === 'notes'
    || id === 'exercises'
    || id === 'workbooks'
  ) {
    return true;
  }
  if (isKnownRoute(id) || LEGACY_ROUTES[id]) return true;
  const sectionId = liveSectionId(id, paramsForSectionProbe(id));
  if (sectionId === ROUTINE_ROUTE_ID) return true;
  return ROOT_SECTION_IDS.has(sectionId) || getTabs().some(t => t.id === sectionId);
}

function paramsForSectionProbe(id) {
  if (id === 'workbooks') return { mode: 'workbooks' };
  if (id === 'exercises') return { mode: 'exercises' };
  return {};
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
  if (sectionId === 'tools') {
    const state = readViewState('tools') || {};
    saveViewState('tools', {
      ...state,
      scrollY: window.scrollY,
      purpose: getSetting('tools.purpose', 'train'),
    });
  }
  if (sectionId === 'exercises') {
    const state = readViewState('library:exercises') || {};
    saveViewState('library:exercises', { ...state, scrollY: window.scrollY });
  }
}

function restoreArriveViewState(sectionId) {
  if (sectionId === 'tools') {
    const state = readViewState('tools');
    const purpose = state?.purpose;
    if (purpose === 'train' || purpose === 'study' || purpose === 'create') {
      saveSetting('tools.purpose', purpose);
    }
    restoreScroll('tools');
  }
  if (sectionId === 'exercises') {
    restoreScroll('library:exercises');
  }
}

function mountToolPageIfNeeded(sectionId, sec) {
  if (sectionId !== 'metronome') return;
  if (sec.dataset.toolPage === '1') return;
  const tool = getTool(sectionId);
  if (!tool) return;
  const parentRoute = hubRouteForTool(tool);
  mountToolPage(sec, {
    id: sectionId,
    title: tool.title || tool.label,
    modes: tool.modes || [],
    defaultMode: tool.defaultMode || '',
    contextFields: ['tempo'],
    moreItems: [],
    isFavorite: (getSetting('home.favorites', []) || []).includes(sectionId),
    onBack: () => goBack(() => applyRoute({
      id: parentRoute,
      params: {},
      mode: 'replace',
      source: 'internal',
    })),
    onFavorite: (next) => {
      const favs = getSetting('home.favorites', []) || [];
      const list = Array.isArray(favs) ? [...favs] : [];
      const index = list.indexOf(sectionId);
      if (next && index < 0) list.push(sectionId);
      else if (!next && index >= 0) list.splice(index, 1);
      saveSetting('home.favorites', list);
      refreshToolsHome();
    },
  });
}

function getRoutineSession(routine, sessionId) {
  if (!routine || !sessionId) return null;
  const sessions = Array.isArray(routine.sessions) ? routine.sessions : [];
  return sessions.find(s => s && s.id === sessionId) || null;
}

function getWorkbookExercise(workbookId, exerciseId) {
  const workbook = getWorkbook(workbookId);
  if (!workbook || !exerciseId) return null;
  const entries = Array.isArray(workbook.entries) ? workbook.entries : [];
  return entries.find(e => e && (e.exerciseId === exerciseId || e.id === exerciseId)) || null;
}

function findRoutineCompanion(session, companionId) {
  if (!session || !companionId) return null;
  const workbookIds = Array.isArray(session.workbookIds) ? session.workbookIds : [];
  for (const workbookId of workbookIds) {
    const workbook = getWorkbook(workbookId);
    if (!workbook) continue;
    const companions = Array.isArray(workbook.companions) ? workbook.companions : [];
    const companion = companions.find(c => c && c.id === companionId);
    if (companion) return { workbook, companion };
  }
  return null;
}

function updateHoldRecordVisibility(id) {
  const relevant = isHoldRecordRelevant(id);
  document.body.classList.toggle('hold-rec-relevant', relevant);
}

function updateHeaderChrome(id) {
  const isRoot = ROOT_SECTION_IDS.has(id) || id === 'home';
  const isTool = id && !isRoot && !isHubId(id) && !!getTool(id);
  document.body.classList.toggle('tool-screen', !!isTool);
  setActiveNav(id);
}

function showHub(categoryId, skipHash) {
  if (categoryId === 'reference' || categoryId === 'create') {
    showSection(categoryId, skipHash);
    return;
  }
  showSection('tools', skipHash);
}

/**
 * Navigate back through in-app screen history (same as the phone Back button).
 * Falls back to category hub / home when there is nothing left to pop.
 */
async function goBack(fallback) {
  const canLeave = await guardLeave();
  if (!canLeave) return false;

  if (navPushCount > 0) {
    history.back();
    return true;
  }

  if (typeof fallback === 'function') {
    fallback();
    return false;
  }

  const origin = (currentRouteId === ROUTINE_ROUTE_ID || currentNavId === 'workbooks')
    ? 'routine'
    : currentOrigin();
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

function applySection(id, { keep = [] } = {}) {
  if (splitSecondaryId) {
    const sec = document.getElementById('sec-' + splitSecondaryId);
    if (sec) sec.classList.remove('active', 'split-secondary');
    splitSecondaryId = null;
    document.body.classList.remove('split-mode');
  }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dock-item,.dock-menu-item').forEach(t => t.classList.remove('active'));

  const sectionId = id === 'home' ? 'hub-reference' : id;
  const sec = document.getElementById('sec-' + sectionId);
  if (!sec) return;

  sec.classList.add('active');
  currentNavId = sectionId;

  document.querySelectorAll(`.dock-item[data-s="${id}"]`).forEach(el => el.classList.add('active'));

  if (sectionId === 'tools') {
    refreshToolsHome();
    stopOtherTools([]);
    updateHoldRecordVisibility(null);
    updateHeaderChrome(sectionId);
    updateSplitUI();
    return;
  }

  if (LIBRARY_SECTION_IDS.has(sectionId)) {
    const mode = sectionId === 'workbooks' ? 'workbooks' : 'exercises';
    syncLibraryTabs(mode);
    stopOtherTools([sectionId]);
    initTool(sectionId);
    updateHoldRecordVisibility(sectionId);
    updateHeaderChrome(sectionId);
    updateSplitUI();
    syncSetupToolbars();
    return;
  }

  if (isHubId(sectionId)) {
    const cat = hubCategory(sectionId);
    saveSetting('nav.lastCategory', cat);
    const hubOrigin = cat === 'reference' ? 'reference' : (cat === 'create' ? 'create' : 'tools');
    const hubShowSection = (toolId) => {
      void applyRoute({
        id: toolId,
        params: {},
        mode: 'push',
        source: 'internal',
        origin: hubOrigin,
      });
    };
    const repaintHub = () => {
      renderHub(cat, sec, {
        showSection: hubShowSection,
        onFavorite: () => { refreshToolsHome(); repaintHub(); },
      });
    };
    repaintHub();
    stopOtherTools([]);
    updateHoldRecordVisibility(null);
    updateHeaderChrome(sectionId);
    updateSplitUI();
    return;
  }

  const tool = getTool(id);
  if (tool) {
    saveSetting('nav.lastTool', id);
    saveSetting('nav.lastCategory', tool.category);
    recordToolVisit(id);
  }

  mountToolPageIfNeeded(sectionId, sec);

  const back = sec.querySelector('.tool-back:not(.tool-page-back)');
  if (back && tool && sec.dataset.toolPage !== '1') {
    const parentRoute = hubRouteForTool(tool);
    const hubLabel = CATEGORIES.find(c => c.id === tool.category)?.label || 'Back';
    back.onclick = () => goBack(() => applyRoute({
      id: parentRoute,
      params: {},
      mode: 'replace',
      source: 'internal',
    }));
    back.textContent = `← ${hubLabel}`;
  }

  stopOtherTools([id, ...keep]);
  initTool(id);
  updateHoldRecordVisibility(id);
  updateHeaderChrome(id);
  updateSplitUI();
  syncSetupToolbars();
}

function showSection(id, skipHash, params = {}) {
  const incoming = resolveIncomingRoute(id, params);
  const toolForGate = getTool(incoming.sectionId);
  if (toolForGate && !isFeatureEnabled(incoming.sectionId)) {
    showSection('reference', skipHash);
    return;
  }
  const mode = (skipHash || currentNavId === incoming.sectionId) ? 'replace' : 'push';
  void applyRoute({
    id: incoming.routeId,
    params: incoming.params,
    mode,
    source: 'internal',
  });
}

let routineNavigator = null;

const routineShell = {
  activateSection(sectionId, { keep = [] } = {}) {
    applySection(sectionId, { keep });
  },
  pushRoute(route) {
    if (applyingHistory) return;
    const params = buildRoutineParams(route);
    const url = sectionUrl(ROUTINE_ROUTE_ID, params);
    history.pushState({ musiNav: ROUTINE_ROUTE_ID, params }, '', url);
    navPushCount += 1;
  },
  replaceRoute(route) {
    const params = buildRoutineParams(route);
    const url = sectionUrl(ROUTINE_ROUTE_ID, params);
    history.replaceState({ musiNav: ROUTINE_ROUTE_ID, params }, '', url);
  },
  backToRoute(parentRoute) {
    if (navPushCount > 0) {
      history.back();
      return;
    }
    routineShell.replaceRoute(parentRoute);
    const nav = getRoutineNavigator();
    if (nav) nav.applyRoute(buildRoutineParams(parentRoute), { source: 'internal' });
  },
  goHome() {
    applySection('tools');
    history.replaceState({ musiNav: 'tools', params: {} }, '', sectionUrl('tools'));
  },
  hasInAppHistory() {
    return navPushCount > 0;
  },
};

function onEntryReplace(route) {
  routineShell.replaceRoute(route);
}

function getRoutineNavigator() {
  if (routineNavigator) return routineNavigator;
  // SIMPLIFY: Routines navigator setup hidden. Routines UI is not live.
  /*
  try {
    const root = document.getElementById('sec-routines');
    if (!root) return null;
    routineNavigator = createRoutineNavigator({
      root,
      getRoutine,
      getSession: getRoutineSession,
      getWorkbook,
      getExercise: getWorkbookExercise,
      getCompanion: findRoutineCompanion,
      shell: routineShell,
      layers: {
        ...createRoutineLayerDescriptors(),
        ...createWorkbookLayerDescriptors({
          shell: routineShell,
          onEntryReplace,
          onBack: () => { const nav = getRoutineNavigator(); if (nav) nav.back(); },
        }),
      },
      homeStatus: () => document.getElementById('home-status'),
    });
    setRoutineNavigator(routineNavigator);
    return routineNavigator;
  } catch (_) {
    return null;
  }
  */
  return null;
}

function gatedSectionId(id) {
  const toolForGate = getTool(id);
  if (toolForGate && !isFeatureEnabled(id)) return 'hub-reference';
  return id;
}

const ROUTE_NOTICE_MESSAGES = {
  'notice.scales-removed': 'Scale Spelling is hidden.',
  'notice.intervals-removed': 'The Intervals quiz moved to Fretboard & Interval Map at Learn.',
  'notice.fretboard-removed': 'The Fretboard trainer is hidden.',
  'notice.fretmap-removed': 'Fretboard and Interval Map is hidden.',
  'notice.chordlab-removed': 'This link now opens Chord Lab Reference.',
  'notice.timing-removed': 'The Timing drill is hidden.',
  'notice.sightreading-removed': 'The Sight Reading quiz moved to Train.',
  'notice.notes-removed': 'Your notes moved to Song Studio under Unfiled Notes.',
  'notice.pitch-reference': 'The keyboard is now a pitch reference in Study.',
  'notice.drums-removed': 'Drum generators and builder are hidden.',
  'notice.studylab-removed': 'Study Lab is hidden.',
  'notice.routines-removed': 'Routines and Sessions are hidden.',
};

let activeRouteNoticeId = null;
const PENDING_NOTICE_KEY = 'musi:routeNotice';

function readPendingNotice() {
  try {
    const raw = sessionStorage.getItem(PENDING_NOTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writePendingNotice(noticeId, routeId) {
  if (typeof noticeId !== 'string' || noticeId === '') return;
  try {
    sessionStorage.setItem(PENDING_NOTICE_KEY, JSON.stringify({
      id: noticeId,
      routeId: routeId || '',
    }));
  } catch (e) {
    // sessionStorage can be blocked; the live notice still shows on this pass
  }
}

function clearPendingNotice() {
  try {
    sessionStorage.removeItem(PENDING_NOTICE_KEY);
  } catch (e) {
    // ignore
  }
}

function syncRouteNoticeLayout() {
  const el = document.getElementById('route-notice');
  const visible = el && !el.hidden;
  document.body.classList.toggle('route-notice-on', visible);
  if (visible) {
    document.body.style.setProperty('--route-notice-h', `${el.offsetHeight}px`);
  } else {
    document.body.classList.remove('route-notice-on');
    document.body.style.removeProperty('--route-notice-h');
  }
}

function hideRouteNotice() {
  const el = document.getElementById('route-notice');
  if (el) el.hidden = true;
  syncRouteNoticeLayout();
}

function showRouteNotice(noticeId) {
  const el = document.getElementById('route-notice');
  const textEl = document.getElementById('route-notice-text');
  if (!el || !textEl) return;
  const message = ROUTE_NOTICE_MESSAGES[noticeId];
  if (!message) return;
  activeRouteNoticeId = noticeId;
  textEl.textContent = message;
  el.hidden = false;
  syncRouteNoticeLayout();
  requestAnimationFrame(() => syncRouteNoticeLayout());
}

function dismissRouteNotice(noticeId) {
  const seen = getSetting('route.noticesSeen', []);
  const next = Array.isArray(seen) ? [...seen] : [];
  if (!next.includes(noticeId)) next.push(noticeId);
  saveSetting('route.noticesSeen', next);
  activeRouteNoticeId = null;
  clearPendingNotice();
  hideRouteNotice();
}

function updateRouteNotice(notice, routeId) {
  if (typeof notice === 'string' && notice !== '') {
    writePendingNotice(notice, routeId);
  }
  const pending = readPendingNotice();
  const noticeId = (typeof notice === 'string' && notice !== '')
    ? notice
    : (pending && pending.routeId && pending.routeId === routeId ? pending.id : null);
  if (noticeId) {
    const seen = getSetting('route.noticesSeen', []);
    if (shouldShowNotice(noticeId, seen)) {
      showRouteNotice(noticeId);
      return;
    }
  }
  hideRouteNotice();
}

async function applyRoute({
  id,
  params = {},
  mode = 'push',
  source = 'internal',
  notice = null,
  origin = null,
}) {
  const inboundId = id;
  const incoming = resolveIncomingRoute(inboundId, params);
  let routeId = incoming.routeId;
  let sectionId = gatedSectionId(incoming.sectionId);
  const routeParams = incoming.params;
  if (notice == null) notice = incoming.notice;
  if (typeof notice === 'string' && notice !== '') {
    writePendingNotice(notice, incoming.routeId);
  }

  if (!isValidSection(inboundId)) {
    routeId = 'reference';
    sectionId = 'hub-reference';
  }

  const prevSectionId = currentNavId;
  if (sectionId !== prevSectionId) {
    const canLeave = await guardLeave({ fromPopstate: source === 'popstate' });
    if (!canLeave) return;
    saveLeaveViewState(prevSectionId);
  }

  currentRouteId = routeId;
  currentRouteParams = { ...routeParams };

  if (routeId === ROUTINE_ROUTE_ID) {
    const routineOrigin = origin || (currentOrigin() === 'direct' ? 'routine' : currentOrigin()) || 'routine';
    if (!applyingHistory && mode !== 'none') {
      const url = sectionUrl(ROUTINE_ROUTE_ID, routeParams);
      const histState = { musiNav: ROUTINE_ROUTE_ID, params: routeParams };
      if (mode === 'replace') {
        suppressHashChange = true;
        history.replaceState(histState, '', url);
      } else if (mode === 'push') {
        suppressHashChange = true;
        history.pushState(histState, '', url);
        navPushCount += 1;
      }
    }
    if (mode === 'push' || currentOrigin() === 'direct') {
      pushRoute({ id: routeId, params: routeParams }, routineOrigin);
    }
    const navigator = getRoutineNavigator();
    if (navigator) {
      navigator.applyRoute(routeParams, { source });
    } else {
      applySection(ROUTINE_ROUTE_ID);
    }
    updateRouteNotice(notice, routeId);
    focusHeading(document.getElementById('sec-' + ROUTINE_ROUTE_ID));
    return;
  }

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
      const navOrigin = origin || inferNavigationOrigin(prevSectionId);
      pushRoute({ id: routeId, params: routeParams }, navOrigin);
    }
  }

  applySection(sectionId);
  updateRouteNotice(notice, routeId);
  restoreArriveViewState(sectionId);
  focusHeading(document.getElementById('sec-' + sectionId));
}

function initRouteNoticeBanner() {
  const closeBtn = document.getElementById('route-notice-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (activeRouteNoticeId) dismissRouteNotice(activeRouteNoticeId);
    };
  }
}

window.showSection = showSection;
window.showHub = showHub;
window.goBack = goBack;

function enterSplit(secondaryId) {
  const primaryId = (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
  if (isMobileSwipeNav()) return;
  if (!secondaryId || secondaryId === primaryId || primaryId === 'home' || primaryId === 'tools' || secondaryId === 'home' || secondaryId === 'tools') return;
  if (isHubId(primaryId) || isHubId(secondaryId)) return;
  if (!getTabs().some(t => t.id === secondaryId)) return;
  splitSecondaryId = secondaryId;
  document.body.classList.add('split-mode');
  const sec = document.getElementById('sec-' + secondaryId);
  if (sec) sec.classList.add('active', 'split-secondary');
  initTool(secondaryId);
  updateSplitUI();
}

function exitSplit() {
  if (!splitSecondaryId) return;
  const primaryId = (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
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
    exit.textContent = '\u2715 Exit split view';
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
  const r = trigger.getBoundingClientRect();
  splitMenuEl.style.top = (r.bottom + 6) + 'px';
  splitMenuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  splitMenuEl.classList.add('open');
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
      stopOtherTools(primaryId && !isHubId(primaryId) && primaryId !== 'home' && primaryId !== 'tools' ? [primaryId] : []);
    }
    closeSplitMenu();
    trigger.style.display = 'none';
    trigger.classList.remove('active');
    return;
  }
  const primary = currentPrimaryId();
  trigger.style.display = (primary === 'home' || primary === 'tools' || isHubId(primary)) ? 'none' : '';
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

function initNav() {
  initShellNav({ showSection, currentId: currentNavId });
}

function rebuildNav() {
  setActiveNav(currentNavId);
  closeSplitMenu();
  if (splitSecondaryId && !isFeatureEnabled(splitSecondaryId)) {
    exitSplit();
  } else {
    updateSplitUI();
  }
}

async function init() {
  const bootHash = location.hash;
  const earlyBoot = parseAppRoute(bootHash);
  const earlyResolved = resolveRoute({ id: earlyBoot.id, params: earlyBoot.params || {} });
  if (earlyResolved.notice) writePendingNotice(earlyResolved.notice, earlyResolved.id);
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

  initNav();
  initRouteNoticeBanner();

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

  buildNoteButtons('sq-notes', 'scale');
  buildNoteButtons('iq-notes', 'interval');

  initGlobalVolume();
  initMetronome();
  initVisualizer();
  initNowPlaying();
  initAudioDock(document.getElementById('audio-dock'));
  initHoldRecordButton();
  initProgressHeaders();
  initToolsHome({
    showSection,
    openRoute: (routeId, routeParams, { origin } = {}) => applyRoute({
      id: routeId,
      params: routeParams || {},
      mode: 'push',
      source: 'internal',
      origin: origin || 'tools',
    }),
  });
  initLibraryTabs({
    openRoute: (routeId, routeParams, { replace } = {}) => applyRoute({
      id: routeId,
      params: routeParams || {},
      mode: replace ? 'replace' : 'push',
      source: 'internal',
      origin: 'library',
    }),
  });
  initStats();
  initMusicPreferences({ showSection });
  initSplitView();
  initScreenUx({ showSection, showHub });

  window.addEventListener('musi:features-changed', () => {
    rebuildNav();
    refreshToolsHome();
    if (currentNavId && getTool(currentNavId) && !isFeatureEnabled(currentNavId)) {
      showSection('reference');
    }
  });

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.title = 'Reference';
    wordmark.onclick = () => showSection('reference');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('reference'); } };
  }

  const bootRoute = parseAppRoute(bootHash);
  if (isValidSection(bootRoute.id)) {
    await applyRoute({
      id: bootRoute.id,
      params: bootRoute.params,
      mode: 'replace',
      source: 'boot',
    });
  } else {
    history.replaceState({ musiNav: 'reference', params: {} }, '', sectionUrl('reference'));
    applySection('hub-reference');
  }

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
      if (isValidSection(routeId)) {
        await applyRoute({
          id: routeId,
          params: routeParams,
          mode: 'none',
          source: 'popstate',
        });
      } else {
        await applyRoute({ id: 'reference', params: {}, mode: 'none', source: 'popstate' });
      }
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
    const parsed = parseAppRoute(location.hash);
    const incoming = resolveIncomingRoute(parsed.id, parsed.params);
    applyingHistory = true;
    try {
      if (parsed.id && isValidSection(parsed.id)) {
        if (incoming.sectionId !== currentNavId) navPushCount += 1;
        await applyRoute({
          id: parsed.id,
          params: parsed.params,
          mode: 'none',
          source: 'hashchange',
        });
      } else if (!parsed.id) {
        if (currentNavId !== 'hub-reference') navPushCount += 1;
        await applyRoute({ id: 'reference', params: {}, mode: 'none', source: 'hashchange' });
      }
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
