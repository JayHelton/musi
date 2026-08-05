import { audioCtx, setMasterVolume, getMasterVolume } from './audio.js';
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
import { initNotes, stopNotes } from './notes.js';
import { initPracticeTimer, stopPracticeTimer } from './practiceTimer.js';
import { initDrums, stopDrums } from './drums/drumsUI.js';
import { initTabAnalyzer, stopTabAnalyzer } from './tabAnalyzer.js';
import { initTrackToSheet, stopTrackToSheet } from './trackToSheet.js';
import { initGpPlayer, stopGpPlayer } from './gpPlayer.js';
import { initScaleRef, stopScaleRef } from './scaleReference.js';
import { initTriadRef, stopTriadRef } from './triadReference.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';
import { initContextBar } from './contextBar.js';
import { initCommandPalette } from './commandPalette.js';
import { initProgressHeaders } from './progressHeader.js';
import { initHome, refreshHome, renderHub } from './home.js';
import { initStats, renderStats } from './stats.js';
import { initMusicPreferences } from './musicPreferences.js';
import { initStudyLab, stopStudyLab } from './studyLab.js';
import {
  TOOLS, CATEGORIES, CATEGORY_ICONS, TOOL_ICONS,
  asTabs, getTool, isHoldRecordRelevant,
} from './tools.js';
import { initScreenUx } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';

const ICONS = TOOL_ICONS;
const TABS = asTabs();
const MOBILE_SWIPE_QUERY = '(max-width: 768px)';

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
  notes: () => stopNotes(),
  practice: () => stopPracticeTimer(),
  drums: () => stopDrums(),
  tabanalyzer: () => stopTabAnalyzer(),
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
  notes: initNotes,
  practice: initPracticeTimer,
  drums: initDrums,
  tabanalyzer: initTabAnalyzer,
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

function sectionUrl(id) {
  if (!id || id === 'home') return location.pathname + location.search;
  return `${location.pathname}${location.search}#${id}`;
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

function showSection(id, skipHash) {
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

  const prevId = currentNavId;
  sec.classList.add('active');
  currentNavId = id;

  document.querySelectorAll(`.dock-item[data-s="${id}"]`).forEach(el => el.classList.add('active'));

  // Screen history: push on forward nav so phone Back walks Home → hub → tool.
  // skipHash / applyingHistory only sync the URL+state (boot, popstate, hashchange).
  if (!applyingHistory) {
    const url = sectionUrl(id);
    const histState = { musiNav: id };
    if (skipHash || prevId === id) {
      history.replaceState(histState, '', url);
    } else {
      history.pushState(histState, '', url);
      navPushCount += 1;
    }
  }

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
    renderStats();
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

  // Wire back button — same stack as the phone Back button
  const back = sec.querySelector('.tool-back');
  if (back && tool) {
    const hubLabel = CATEGORIES.find(c => c.id === tool.category)?.label || 'Back';
    back.onclick = () => goBack(() => showHub(tool.category));
    back.textContent = `← ${hubLabel}`;
  }

  stopOtherTools([id]);
  initTool(id);
  updateHoldRecordVisibility(id);
  updateHeaderChrome(id);
  updateSplitUI();
  refreshHome();
}
window.showSection = showSection;
window.showHub = showHub;
window.goBack = goBack;

function enterSplit(secondaryId) {
  const primaryId = (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
  if (isMobileSwipeNav()) return;
  if (!secondaryId || secondaryId === primaryId || primaryId === 'home' || secondaryId === 'home') return;
  if (isHubId(primaryId) || isHubId(secondaryId)) return;
  if (!TABS.some(t => t.id === secondaryId)) return;
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
  TABS.forEach(t => {
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

function initVolumeControl() {
  const trigger = document.getElementById('volume-trigger');
  const popover = document.getElementById('volume-popover');
  const slider = document.getElementById('volume-slider');
  const valueLabel = document.getElementById('volume-value');
  if (!trigger || !popover || !slider) return;

  const saved = Number(getSetting('global.volume', getMasterVolume()));
  const initial = Number.isNaN(saved) ? getMasterVolume() : saved;
  setMasterVolume(initial);
  const syncUI = (vol) => {
    slider.value = String(Math.round(vol * 100));
    if (valueLabel) valueLabel.textContent = Math.round(vol * 100) + '%';
  };
  syncUI(getMasterVolume());

  const openPopover = () => {
    popover.hidden = false;
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const closePopover = () => {
    popover.hidden = true;
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.onclick = (e) => {
    e.stopPropagation();
    if (popover.hidden) openPopover();
    else closePopover();
  };
  slider.oninput = (e) => {
    const vol = Number(e.target.value) / 100;
    setMasterVolume(vol);
    saveSetting('global.volume', getMasterVolume());
    if (valueLabel) valueLabel.textContent = Math.round(getMasterVolume() * 100) + '%';
  };
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
      closePopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) closePopover();
  });
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

  // Desktop: flat tool list
  TABS.forEach(t => {
    const item = document.createElement('button');
    item.className = 'dock-item dock-desktop';
    item.dataset.s = t.id;
    item.innerHTML = `<span class="dock-icon">${ICONS[t.id]}</span><span class="dock-label">${t.label}</span>`;
    item.onclick = () => showSection(t.id);
    nav.appendChild(item);
  });

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

function init() {
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

  initVolumeControl();
  initMetronome();
  initVisualizer();
  initNowPlaying();
  initHoldRecordButton();
  initContextBar();
  initCommandPalette({ showSection, tabs: TABS, icons: ICONS });
  initProgressHeaders();
  initHome({ showSection, showHub, tabs: TABS, icons: ICONS });
  initStats();
  initMusicPreferences({ showSection });
  initSplitView();
  initScreenUx({ showSection, showHub });

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.onclick = () => showSection('home');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('home'); } };
  }

  const resolveSectionAlias = (id) => (id === 'intervalmap' ? 'intervalorbit' : id);

  const isValidSection = (id) => {
    const resolved = resolveSectionAlias(id);
    return resolved === 'home' ||
      isHubId(resolved) && CATEGORIES.some(c => c.id === hubCategory(resolved)) ||
      TABS.some(t => t.id === resolved);
  };

  const hashTab = resolveSectionAlias(location.hash.replace('#', ''));
  if (hashTab && isValidSection(hashTab)) {
    showSection(hashTab, true);
  } else {
    // Seed history so popstate can restore Home cleanly.
    history.replaceState({ musiNav: 'home' }, '', sectionUrl('home'));
    updateHeaderChrome('home');
    updateHoldRecordVisibility(null);
  }

  // Phone / browser Back: walk the screen stack instead of leaving the PWA.
  window.addEventListener('popstate', (e) => {
    applyingHistory = true;
    navPushCount = Math.max(0, navPushCount - 1);
    try {
      let id = e.state?.musiNav;
      if (!id) {
        const fromHash = resolveSectionAlias(location.hash.replace('#', ''));
        id = fromHash && isValidSection(fromHash) ? fromHash : 'home';
      } else {
        id = resolveSectionAlias(id);
      }
      if (isValidSection(id)) showSection(id, true);
      else showSection('home', true);
    } finally {
      applyingHistory = false;
    }
  });

  window.addEventListener('hashchange', () => {
    // location.hash assignments (and in-page links) create a history entry;
    // treat them as forward navigation unless we're already applying popstate.
    if (applyingHistory) return;
    const id = resolveSectionAlias(location.hash.replace('#', ''));
    applyingHistory = true;
    try {
      if (id && isValidSection(id)) {
        // Hash already updated the URL; sync UI without pushing again.
        // Count this as an in-app step when it differs from the current screen.
        if (id !== currentNavId) navPushCount += 1;
        showSection(id, true);
      } else if (!id) {
        if (currentNavId !== 'home') navPushCount += 1;
        showSection('home', true);
      }
    } finally {
      applyingHistory = false;
    }
  });

  // Reveal PRESS START only after nav/hash routing has settled.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => markBootReady());
  });
}

document.addEventListener('DOMContentLoaded', init);
