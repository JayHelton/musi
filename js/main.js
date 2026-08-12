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
import { initHome, refreshHome, renderHub } from './home.js';
import { initStats } from './stats.js';
import { initMusicPreferences, initGlobalVolume } from './musicPreferences.js';
import { initStudyLab, stopStudyLab } from './studyLab.js';
import {
  TOOLS, CATEGORIES, CATEGORY_ICONS, TOOL_ICONS,
  getTabs, getTool, isHoldRecordRelevant, isFeatureEnabled,
} from './tools.js';
import { initScreenUx, syncSetupToolbars } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';
import { parseAppRoute, routeUrl } from './appRoute.js';
import { ROUTINE_ROUTE_ID, buildRoutineParams } from './routineRoute.js';
import { createRoutineNavigator, createWorkbookLayerDescriptors } from './routineNav.js';
import { getRoutine } from './routineModel.js';
import { getWorkbook } from './workbookModel.js';

const ICONS = TOOL_ICONS;
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
let currentNavId = 'home';
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
  return routeUrl({ id: id || 'home', params });
}

function resolveSectionAlias(id) {
  if (id === 'intervalmap') return 'intervalorbit';
  if (id === 'tabanalyzer') return 'gpplayer';
  return id;
}

function isValidSection(id) {
  const resolved = resolveSectionAlias(id);
  return resolved === 'home' ||
    isHubId(resolved) && CATEGORIES.some(c => c.id === hubCategory(resolved)) ||
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
  const isTool = id && id !== 'home' && !isHubId(id);
  document.body.classList.toggle('tool-screen', !!isTool);
  const tool = getTool(id);
  document.querySelectorAll('.dock-cat-btn').forEach(btn => {
    const cat = btn.dataset.cat;
    let active = false;
    if (id === 'home') active = cat === 'home';
    else if (isHubId(id)) active = cat === hubCategory(id);
    else if (tool) active = cat === tool.category;
    btn.classList.toggle('active', active);
  });
}

function showHub(categoryId, skipHash) {
  showSection('hub-' + categoryId, skipHash);
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
  if (currentNavId !== 'home') showSection('home');
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

  const sec = document.getElementById('sec-' + id);
  if (!sec) return;

  sec.classList.add('active');
  currentNavId = id;

  document.querySelectorAll(`.dock-item[data-s="${id}"]`).forEach(el => el.classList.add('active'));

  if (isHubId(id)) {
    const cat = hubCategory(id);
    saveSetting('nav.lastCategory', cat);
    renderHub(cat, sec, {
      showSection,
      onFavorite: () => { refreshHome(); renderHub(cat, sec, { showSection, onFavorite: refreshHome }); },
    });
    stopOtherTools([]);
    updateHoldRecordVisibility(null);
    updateHeaderChrome(id);
    updateSplitUI();
    return;
  }

  if (id === 'home') {
    refreshHome();
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
  }

  const back = sec.querySelector('.tool-back');
  if (back && tool) {
    const hubLabel = CATEGORIES.find(c => c.id === tool.category)?.label || 'Back';
    back.onclick = () => goBack(() => showHub(tool.category));
    back.textContent = `← ${hubLabel}`;
  }

  stopOtherTools([id, ...keep]);
  initTool(id);
  updateHoldRecordVisibility(id);
  updateHeaderChrome(id);
  updateSplitUI();
  refreshHome();
  syncSetupToolbars();
}

function showSection(id, skipHash, params = {}) {
  const toolForGate = getTool(id);
  if (toolForGate && !isFeatureEnabled(id)) {
    showSection('home', skipHash);
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
    applySection('home');
    history.replaceState({ musiNav: 'home', params: {} }, '', sectionUrl('home'));
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
  if (toolForGate && !isFeatureEnabled(id)) return 'home';
  return id;
}

function applyRoute({ id, params = {}, mode = 'push', source = 'internal' }) {
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
    return;
  }

  const targetId = resolved && isValidSection(resolved) ? gatedSectionId(resolved) : 'home';
  const routeParams = targetId === resolved ? params : {};

  if (mode === 'push') {
    showSection(targetId, false, routeParams);
    return;
  }
  if (mode === 'replace') {
    if (!applyingHistory) {
      history.replaceState({ musiNav: targetId, params: routeParams }, '', sectionUrl(targetId, routeParams));
    }
    applySection(targetId);
    return;
  }
  applySection(targetId);
}
window.showSection = showSection;
window.showHub = showHub;
window.goBack = goBack;

function enterSplit(secondaryId) {
  const primaryId = (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
  if (isMobileSwipeNav()) return;
  if (!secondaryId || secondaryId === primaryId || primaryId === 'home' || secondaryId === 'home') return;
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
      stopOtherTools(primaryId && !isHubId(primaryId) && primaryId !== 'home' ? [primaryId] : []);
    }
    closeSplitMenu();
    trigger.style.display = 'none';
    trigger.classList.remove('active');
    return;
  }
  const primary = currentPrimaryId();
  trigger.style.display = (primary === 'home' || isHubId(primary)) ? 'none' : '';
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
  const nav = document.getElementById('nav');
  if (!nav) return;

  rebuildDesktopDock(nav);

  // Mobile: 5 persistent destinations
  const mobileCats = document.createElement('div');
  mobileCats.className = 'dock-mobile-cats';
  const destinations = [
    { id: 'home', label: 'Home', icon: CATEGORY_ICONS.home, action: () => showSection('home') },
    ...CATEGORIES.map(cat => ({
      id: cat.id,
      label: cat.short,
      icon: CATEGORY_ICONS[cat.id],
      action: () => {
        // If already on a tool in this category, go to hub; else hub
        const tool = getTool(currentNavId);
        if (currentNavId === 'hub-' + cat.id) return;
        if (tool && tool.category === cat.id && currentNavId === tool.id) {
          showHub(cat.id);
        } else {
          showHub(cat.id);
        }
      },
    })),
  ];
  destinations.forEach(dest => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-cat-btn';
    btn.dataset.cat = dest.id;
    btn.innerHTML = `<span class="dock-icon">${dest.icon}</span><span class="dock-label">${dest.label}</span>`;
    btn.onclick = dest.action;
    mobileCats.appendChild(btn);
  });
  nav.appendChild(mobileCats);
}

function rebuildDesktopDock(navEl) {
  const nav = navEl || document.getElementById('nav');
  if (!nav) return;
  nav.querySelectorAll('.dock-item.dock-desktop').forEach(el => el.remove());
  const mobileCats = nav.querySelector('.dock-mobile-cats');
  getTabs().forEach(t => {
    const item = document.createElement('button');
    item.className = 'dock-item dock-desktop';
    item.dataset.s = t.id;
    item.innerHTML = `<span class="dock-icon">${ICONS[t.id]}</span><span class="dock-label">${t.label}</span>`;
    item.onclick = () => showSection(t.id);
    if (mobileCats) nav.insertBefore(item, mobileCats);
    else nav.appendChild(item);
  });
  if (currentNavId) {
    document.querySelectorAll(`.dock-item[data-s="${currentNavId}"]`).forEach(el => el.classList.add('active'));
  }
}

function rebuildNav() {
  rebuildDesktopDock();
  closeSplitMenu();
  if (splitSecondaryId && !isFeatureEnabled(splitSecondaryId)) {
    exitSplit();
  } else {
    updateSplitUI();
  }
}

function init() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  initBootSplash();
  initNav();

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
  initHome({
    showSection,
    showHub,
    openRoute: (id, params) => applyRoute({ id, params, mode: 'push', source: 'internal' }),
  });
  initStats();
  initMusicPreferences({ showSection });
  initSplitView();
  initScreenUx({ showSection, showHub });

  window.addEventListener('musi:features-changed', () => {
    rebuildNav();
    refreshHome();
    if (currentNavId && getTool(currentNavId) && !isFeatureEnabled(currentNavId)) {
      showSection('home');
    }
  });

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.onclick = () => showSection('home');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('home'); } };
  }

  const bootRoute = parseAppRoute(location.hash);
  const bootId = resolveSectionAlias(bootRoute.id);
  if (bootId && isValidSection(bootId)) {
    applyRoute({ id: bootId, params: bootRoute.params, mode: 'replace', source: 'boot' });
  } else {
    history.replaceState({ musiNav: 'home', params: {} }, '', sectionUrl('home'));
    updateHeaderChrome('home');
    updateHoldRecordVisibility(null);
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
      else applyRoute({ id: 'home', params: {}, mode: 'none', source: 'popstate' });
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
        if (currentNavId !== 'home') navPushCount += 1;
        applyRoute({ id: 'home', params: {}, mode: 'none', source: 'hashchange' });
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
