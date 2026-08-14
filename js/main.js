import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem } from './scaleQuiz.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
import { buildKeyboard, toggleDrone, stopAll, QWERTY_MAP } from './keyboard.js';
import { initMetronome, stopMetronome, metro } from './metronome.js';
import { initFretboard } from './fretboardTrainer.js';
import { initIntervalOrbit, stopIntervalOrbit } from './intervalOrbit.js';
import { initChordWorkout, stopChordWorkout } from './chordWorkout.js';
import { initTuner, stopTuner, stopContextScale, tuner } from './vocalTrainer.js';
import { initPitchTrainer, stopPitchTrainer, pt } from './pitchTrainer.js';
import { initPitchRunner, stopPitchRunner, runner } from './pitchRunner.js';
import { initEarTrainer, stopEarTone, ear } from './earTrainer.js';
import { initTimingDrill, stopTimingDrill, timingDrill } from './timingDrill.js';
import { initSightReading, stopSightReading } from './sightReadingTrainer.js';
import { initChordBuilder, stopChord, chordBuilder } from './chordBuilder.js';
import { initChordRef, stopChordRef, chOscillators } from './chordReference.js';
import { initMovableChordCards } from './movableChordCards.js';
import { initRecorder, initHoldRecordButton, stopRecorder, recorder } from './recorder.js';
import { initSongwriter, stopSongwriter } from './songwriter.js';
import { initExercises, stopExercises } from './exercises.js';
import { initWorkbooks, stopWorkbooks } from './workbooks.js';
import { initRoutines, stopRoutines, createRoutineLayerDescriptors, setRoutineNavigator } from './routines.js';
import { initNotes, stopNotes } from './notes.js';
import { initPracticeTimer, stopPracticeTimer } from './practiceTimer.js';
import { initDrums, stopDrums } from './drums/drumsUI.js';
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
import { initStudyLab, stopStudyLab } from './studyLab.js';
import {
  CATEGORIES,
  getTabs, getTool, isHoldRecordRelevant, isFeatureEnabled,
} from './tools.js';
import { initScreenUx, syncSetupToolbars } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';
import { parseAppRoute, routeUrl } from './appRoute.js';
import { shouldShowNotice } from './routeMap.js';
import { runMigrations, createLiveContext } from './migrations/index.js';
import { ROUTINE_ROUTE_ID, buildRoutineParams } from './routineRoute.js';
import { createRoutineNavigator, createWorkbookLayerDescriptors } from './routineNav.js';
import { getRoutine } from './routineModel.js';
import { getWorkbook } from './workbookModel.js';

const MOBILE_SWIPE_QUERY = '(max-width: 768px), (orientation: landscape) and (max-height: 500px)';

const TOOL_STOPPERS = {
  metronome: () => { if (metro.playing) stopMetronome(); },
  keyboard: () => { if (Object.keys(S.kb.drones).length) stopAll(); },
  scaleref: () => stopScaleRef(),
  triads: () => stopTriadRef(),
  chords: () => { if (chordBuilder.oscillators.length) stopChord(); if (chOscillators.length) stopChordRef(); },
  tuner: () => { if (tuner.running) stopTuner(); if (tuner.scalePlaying) stopContextScale(); if (pt.running) stopPitchTrainer(); if (runner.running) stopPitchRunner(); },
  ear: () => { ear._seqTimers.forEach(clearTimeout); ear._seqTimers = []; if (ear._osc) stopEarTone(); },
  timing: () => { if (timingDrill.playing) stopTimingDrill(); },
  sightreading: () => stopSightReading(),
  chordlab: () => stopChordWorkout(),
  intervalorbit: () => stopIntervalOrbit(),
  recorder: () => { if (recorder.playing) stopRecorder(); },
  songwriter: () => stopSongwriter(),
  exercises: () => stopExercises(),
  workbooks: () => stopWorkbooks(),
  routines: () => stopRoutines(),
  notes: () => stopNotes(),
  practice: () => stopPracticeTimer(),
  drums: () => stopDrums(),
  tracktosheet: () => stopTrackToSheet(),
  gpplayer: () => stopGpPlayer(),
  studylab: () => stopStudyLab(),
};
const TOOL_INITS = {
  circle: drawCoF,
  keyboard: buildKeyboard,
  metronome: initMetronome,
  scaleref: initScaleRef,
  triads: initTriadRef,
  chords: () => { initMovableChordCards(); initChordRef(); initChordBuilder(); },
  fretboard: initFretboard,
  intervalorbit: initIntervalOrbit,
  chordlab: initChordWorkout,
  tuner: () => { initTuner(); initPitchTrainer(); initPitchRunner(); },
  ear: initEarTrainer,
  timing: initTimingDrill,
  sightreading: initSightReading,
  recorder: initRecorder,
  songwriter: initSongwriter,
  exercises: initExercises,
  workbooks: initWorkbooks,
  routines: initRoutines,
  notes: initNotes,
  practice: initPracticeTimer,
  drums: initDrums,
  tracktosheet: initTrackToSheet,
  gpplayer: initGpPlayer,
  studylab: initStudyLab,
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
let currentNavId = 'tools';
/** How many in-app pushState entries sit above the boot entry (phone Back pops these). */
let navPushCount = 0;
/** True while applying a popstate/hashchange so we don't push another history entry. */
let applyingHistory = false;

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
  return routeUrl({ id: id || 'tools', params });
}

function resolveSectionAlias(id) {
  if (id === 'intervalmap') return 'intervalorbit';
  if (id === 'tabanalyzer') return 'gpplayer';
  return id;
}

function isValidSection(id) {
  const resolved = resolveSectionAlias(id);
  return resolved === 'home' ||
    resolved === 'tools' ||
    getTabs().some(t => t.id === resolved);
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
  const isRoot = id === 'home' || id === 'tools';
  const isTool = id && !isRoot && !isHubId(id) && !!getTool(id);
  document.body.classList.toggle('tool-screen', !!isTool);
  setActiveNav(id);
}

function showHub(_categoryId, skipHash) {
  showSection('tools', skipHash);
}

/**
 * Navigate back through in-app screen history (same as the phone Back button).
 * Falls back to category hub / home when there is nothing left to pop.
 */
function goBack(fallback) {
  if (navPushCount > 0) {
    history.back();
    return true;
  }
  if (typeof fallback === 'function') {
    fallback();
    return false;
  }
  if (currentNavId !== 'tools') showSection('tools');
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

  const sectionId = id === 'home' ? 'tools' : id;
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

  if (isHubId(id)) {
    const cat = hubCategory(id);
    saveSetting('nav.lastCategory', cat);
    renderHub(cat, sec, {
      showSection,
      onFavorite: () => { refreshToolsHome(); renderHub(cat, sec, { showSection, onFavorite: refreshToolsHome }); },
    });
    stopOtherTools([]);
    updateHoldRecordVisibility(null);
    updateHeaderChrome(id);
    updateSplitUI();
    return;
  }

  const tool = getTool(id);
  if (tool) {
    saveSetting('nav.lastTool', id);
    saveSetting('nav.lastCategory', tool.category);
    recordToolVisit(id);
  }

  const back = sec.querySelector('.tool-back');
  if (back && tool) {
    const hubLabel = CATEGORIES.find(c => c.id === tool.category)?.label || 'Back';
    back.onclick = () => goBack(() => showSection('tools'));
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
  const toolForGate = getTool(id);
  if (toolForGate && !isFeatureEnabled(id)) {
    showSection('tools', skipHash);
    return;
  }

  const prevId = currentNavId;

  if (!applyingHistory) {
    const url = sectionUrl(id, params);
    const histState = { musiNav: id, params };
    if (skipHash || prevId === id) {
      history.replaceState(histState, '', url);
    } else {
      history.pushState(histState, '', url);
      navPushCount += 1;
    }
  }

  applySection(id);
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
}

function gatedSectionId(id) {
  const toolForGate = getTool(id);
  if (toolForGate && !isFeatureEnabled(id)) return 'tools';
  return id;
}

const ROUTE_NOTICE_MESSAGES = {
  'notice.scales-removed': 'The Scales screen moved to Scale Lab.',
  'notice.intervals-removed': 'The Intervals quiz moved to Fretboard & Interval Map at Learn.',
  'notice.fretboard-removed': 'The Fretboard trainer moved to Fretboard & Interval Map.',
  'notice.chordlab-removed': 'This link now opens Chord Lab Reference.',
  'notice.timing-removed': 'The Timing drill moved to Metronome.',
  'notice.sightreading-removed': 'The Sight Reading quiz moved to Train.',
  'notice.notes-removed': 'Your notes moved to Song Studio under Unfiled Notes.',
  'notice.pitch-reference': 'The keyboard is now a pitch reference in Study.',
  'notice.drums-removed': 'Drum patterns moved to exercises in Library.',
};

let activeRouteNoticeId = null;

function hideRouteNotice() {
  const el = document.getElementById('route-notice');
  if (el) el.hidden = true;
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
}

function dismissRouteNotice(noticeId) {
  const seen = getSetting('route.noticesSeen', []);
  const next = Array.isArray(seen) ? [...seen] : [];
  if (!next.includes(noticeId)) next.push(noticeId);
  saveSetting('route.noticesSeen', next);
  activeRouteNoticeId = null;
  hideRouteNotice();
}

function updateRouteNotice(notice) {
  if (typeof notice === 'string' && notice !== '') {
    const seen = getSetting('route.noticesSeen', []);
    if (shouldShowNotice(notice, seen)) {
      showRouteNotice(notice);
      return;
    }
  }
  hideRouteNotice();
}

function initRouteNoticeBanner() {
  const closeBtn = document.getElementById('route-notice-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (activeRouteNoticeId) dismissRouteNotice(activeRouteNoticeId);
    };
  }
}

function applyRoute({ id, params = {}, mode = 'push', source = 'internal', notice = null }) {
  const resolved = resolveSectionAlias(id);

  if (resolved === ROUTINE_ROUTE_ID) {
    if (!applyingHistory && mode !== 'none') {
      const url = sectionUrl(ROUTINE_ROUTE_ID, params);
      const histState = { musiNav: ROUTINE_ROUTE_ID, params };
      if (mode === 'replace') {
        history.replaceState(histState, '', url);
      } else if (mode === 'push') {
        history.pushState(histState, '', url);
        navPushCount += 1;
      }
    }
    const navigator = getRoutineNavigator();
    if (navigator) {
      navigator.applyRoute(params, { source });
    } else {
      applySection(ROUTINE_ROUTE_ID);
    }
    updateRouteNotice(notice);
    return;
  }

  const targetId = resolved && isValidSection(resolved) ? gatedSectionId(resolved) : 'tools';
  const routeParams = targetId === resolved ? params : {};

  if (mode === 'push') {
    showSection(targetId, false, routeParams);
    updateRouteNotice(notice);
    return;
  }
  if (mode === 'replace') {
    if (!applyingHistory) {
      history.replaceState({ musiNav: targetId, params: routeParams }, '', sectionUrl(targetId, routeParams));
    }
    applySection(targetId);
    updateRouteNotice(notice);
    return;
  }
  applySection(targetId);
  updateRouteNotice(notice);
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
  initHoldRecordButton();
  initProgressHeaders();
  initToolsHome({
    showSection,
    openRoute: (id, params) => applyRoute({ id, params, mode: 'push', source: 'internal' }),
  });
  initStats();
  initMusicPreferences({ showSection });
  initSplitView();
  initScreenUx({ showSection, showHub });

  window.addEventListener('musi:features-changed', () => {
    rebuildNav();
    refreshToolsHome();
    if (currentNavId && getTool(currentNavId) && !isFeatureEnabled(currentNavId)) {
      showSection('tools');
    }
  });

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.onclick = () => showSection('tools');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('tools'); } };
  }

  const bootRoute = parseAppRoute(location.hash);
  const bootId = resolveSectionAlias(bootRoute.id);
  if (bootId && isValidSection(bootId)) {
    applyRoute({ id: bootId, params: bootRoute.params, mode: 'replace', source: 'boot' });
  } else {
    history.replaceState({ musiNav: 'tools', params: {} }, '', sectionUrl('tools'));
    applySection('tools');
  }

  // Phone / browser Back: walk the screen stack instead of leaving the PWA.
  window.addEventListener('popstate', (e) => {
    applyingHistory = true;
    navPushCount = Math.max(0, navPushCount - 1);
    try {
      let id = e.state?.musiNav;
      let params = e.state?.params || {};
      if (!id) {
        const parsed = parseAppRoute(location.hash);
        id = parsed.id;
        params = parsed.params;
      }
      id = resolveSectionAlias(id);
      if (isValidSection(id)) applyRoute({ id, params, mode: 'none', source: 'popstate' });
      else applyRoute({ id: 'tools', params: {}, mode: 'none', source: 'popstate' });
    } finally {
      applyingHistory = false;
    }
  });

  window.addEventListener('hashchange', () => {
    if (applyingHistory) return;
    const parsed = parseAppRoute(location.hash);
    const id = resolveSectionAlias(parsed.id);
    applyingHistory = true;
    try {
      if (id && isValidSection(id)) {
        if (id !== currentNavId) navPushCount += 1;
        applyRoute({ id, params: parsed.params, mode: 'none', source: 'hashchange' });
      } else if (!id) {
        if (currentNavId !== 'tools') navPushCount += 1;
        applyRoute({ id: 'tools', params: {}, mode: 'none', source: 'hashchange' });
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
