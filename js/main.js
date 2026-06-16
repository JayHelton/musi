import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem, MODS, MOD_LABELS, LETTERS_UI, CHROMATIC_NOTES } from './scaleQuiz.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
// Virtual Keyboard feature is disabled in the UI for now. Keep the module for future reactivation.
// import { buildKeyboard, toggleDrone, stopAll, QWERTY_MAP } from './keyboard.js';
import { initMetronome, stopMetronome, metro } from './metronome.js';
import { initFretboard } from './fretboardTrainer.js';
import { initTuner, stopTuner, tuner } from './vocalTrainer.js';
import { initEarTrainer, stopEarTone, ear } from './earTrainer.js';
import { initSightReading, stopSightReading } from './sightReadingTrainer.js';
// Backing Track feature is intentionally disabled in the UI for now.
// import { initBacking, stopBacking, backing } from './backingTrack.js';
// Riff Generator feature is intentionally disabled in the UI for now.
// import { initRiff, stopRiff, riffState, initComposerNotes, stopComposer, composer } from './riffGenerator.js';
import { initChordBuilder, stopChord, chordBuilder } from './chordBuilder.js';
import { initRecorder, initHoldRecordButton, stopRecorder, recorder } from './recorder.js';
import { initScaleRef } from './scaleReference.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';
import { initContextBar } from './contextBar.js';
import { initCommandPalette } from './commandPalette.js';
import { initProgressHeaders } from './progressHeader.js';
import { initHome } from './home.js';
import { initSessions } from './sessionsUI.js';

const ICONS = {
  scales:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  intervals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20V8m16 12V4M8 20v-6m4 6V6m4 6v8"/></svg>',
  sightreading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="8" cy="15" r="2.4" fill="currentColor" stroke="none"/><path d="M10.4 15V7"/></svg>',
  scaleref:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  chords:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>',
  circle:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>',
  // keyboard:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
  metronome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L6 22h12L12 2z"/><path d="M12 8v6"/><circle cx="12" cy="16" r="1.5"/></svg>',
  fretboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M4 6h16M4 10h16M4 14h16M4 18h16M9 2v20M15 2v20"/></svg>',
  tuner:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>',
  ear:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>',
  // backing:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>',
  // riff:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10a2.83 2.83 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  recorder:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>',
};

const TABS = [
  {id:'scales',    label:'Scales',     group:'Drill'},
  {id:'intervals', label:'Intervals',  group:'Drill'},
  {id:'sightreading', label:'Sight Read', group:'Drill'},
  {id:'fretboard', label:'Fretboard',  group:'Drill'},
  {id:'tuner',     label:'Pitch',      group:'Drill'},
  {id:'ear',       label:'Ear',        group:'Drill'},
  {id:'scaleref',  label:'Scales',     group:'Reference'},
  {id:'chords',    label:'Chords',     group:'Reference'},
  {id:'circle',    label:'Circle',     group:'Reference'},
  // {id:'keyboard',  label:'Keys',       group:'Tools'},
  {id:'metronome', label:'Tempo',      group:'Tools'},
  // {id:'backing',   label:'Backing',    group:'Create'},
  // {id:'riff',      label:'Riff',       group:'Create'},
  {id:'recorder',  label:'Record',     group:'Capture'},
];

const GROUPS = ['Drill','Reference','Tools','Capture'];
const GROUP_ICONS = {
  Drill:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  Reference: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  Tools:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
  Capture:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>',
};

const MOBILE_SWIPE_QUERY = '(max-width: 768px)';
const SWIPE_NAV_THRESHOLD = 70;
const SWIPE_NAV_VERTICAL_LIMIT = 80;

// Per-tool audio stoppers and initializers, shared by single-view navigation
// and split-screen so behaviour stays consistent.
const TOOL_STOPPERS = {
  metronome: () => { if (metro.playing) stopMetronome(); },
  chords: () => { if (chordBuilder.oscillators.length) stopChord(); },
  tuner: () => { if (tuner.running) stopTuner(); },
  ear: () => { if (ear._osc) stopEarTone(); },
  sightreading: () => stopSightReading(),
  recorder: () => { if (recorder.playing) stopRecorder(); },
};
const TOOL_INITS = {
  circle: drawCoF,
  metronome: initMetronome,
  scaleref: initScaleRef,
  chords: initChordBuilder,
  fretboard: initFretboard,
  tuner: initTuner,
  ear: initEarTrainer,
  sightreading: initSightReading,
  recorder: initRecorder,
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

function clearSplitPane() {
  if (!splitSecondaryId) return;
  const sec = document.getElementById('sec-' + splitSecondaryId);
  if (sec) sec.classList.remove('active', 'split-secondary');
  splitSecondaryId = null;
  document.body.classList.remove('split-mode');
  updateSplitUI();
}

function showSection(id, skipHash) {
  // Leaving the previous view collapses any split pane; audio for it is stopped
  // by stopOtherTools below.
  if (splitSecondaryId) {
    const sec = document.getElementById('sec-' + splitSecondaryId);
    if (sec) sec.classList.remove('active', 'split-secondary');
    splitSecondaryId = null;
    document.body.classList.remove('split-mode');
  }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dock-item,.dock-menu-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dock-group-trigger').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById('sec-'+id);
  sec.classList.add('active');
  document.querySelectorAll(`.dock-item[data-s="${id}"],.dock-menu-item[data-s="${id}"]`).forEach(el => el.classList.add('active'));
  const tab = TABS.find(t => t.id === id);
  if (tab) {
    const groupTrigger = document.querySelector(`.dock-group-trigger[data-group="${tab.group}"]`);
    if (groupTrigger) groupTrigger.classList.add('active');
  }

  if (!skipHash) history.replaceState(null, '', '#' + id);

  stopOtherTools([id]);
  initTool(id);
  updateSplitUI();
}
window.showSection = showSection;

function enterSplit(secondaryId) {
  const primaryId = (document.querySelector('.section.active:not(.split-secondary)')?.id || '').replace('sec-', '');
  if (isMobileSwipeNav()) return;
  if (!secondaryId || secondaryId === primaryId || primaryId === 'home' || secondaryId === 'home') return;
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
      stopOtherTools(primaryId ? [primaryId] : []);
    }
    closeSplitMenu();
    trigger.style.display = 'none';
    trigger.classList.remove('active');
    return;
  }
  trigger.style.display = currentPrimaryId() === 'home' ? 'none' : '';
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

function closeAllGroupMenus() {
  document.querySelectorAll('.dock-group').forEach(g => g.classList.remove('open'));
  document.querySelectorAll('.dock-group-menu').forEach(m => m.classList.remove('open'));
  const overlay = document.getElementById('dock-overlay');
  if (overlay) overlay.classList.remove('visible');
}

function isMobileSwipeNav() {
  return window.matchMedia(MOBILE_SWIPE_QUERY).matches;
}

function isSwipeBlockedTarget(target) {
  return Boolean(target.closest([
    'button',
    'a',
    'input',
    'select',
    'textarea',
    '[contenteditable="true"]',
    '.dock',
    '.dock-group-menu',
    '#hold-rec-btn',
    '.hold-rec-overlay',
    '.note-btn-row',
    '.note-action-row',
    '.int-picker',
    '.rec-controls',
    '.sl-scroll',
    '.piano-wrap',
    '.fb-wrap',
    '.sr-staff-wrap',
    '.guitar-tab-wrap',
    '.riff-tab-wrap',
    '.ref-table',
    '.m-bar',
    '.composer-timeline',
    '.backing-progression',
  ].join(',')));
}

function init() {
  const nav = document.getElementById('nav');

  TABS.forEach(t => {
    const item = document.createElement('button');
    item.className = 'dock-item dock-desktop';
    item.dataset.s = t.id;
    item.innerHTML = `<span class="dock-icon">${ICONS[t.id]}</span><span class="dock-label">${t.label}</span>`;
    item.onclick = () => showSection(t.id);
    nav.appendChild(item);
  });

  const mobileWrap = document.createElement('div');
  mobileWrap.className = 'dock-mobile';

  const overlay = document.createElement('div');
  overlay.id = 'dock-overlay';
  overlay.className = 'dock-overlay';
  overlay.onclick = closeAllGroupMenus;
  document.body.appendChild(overlay);

  GROUPS.forEach(groupName => {
    const groupTabs = TABS.filter(t => t.group === groupName);
    const group = document.createElement('div');
    group.className = 'dock-group';

    const trigger = document.createElement('button');
    trigger.className = 'dock-group-trigger';
    trigger.dataset.group = groupName;
    trigger.innerHTML = `<span class="dock-icon">${GROUP_ICONS[groupName]}</span><span class="dock-label">${groupName}</span>`;

    let menu = null;
    if (groupTabs.length > 1) {
      menu = document.createElement('div');
      menu.className = 'dock-group-menu';
      groupTabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'dock-menu-item';
        btn.dataset.s = t.id;
        btn.innerHTML = `<span class="dock-icon">${ICONS[t.id]}</span><span>${t.label}</span>`;
        btn.onclick = (e) => {
          e.stopPropagation();
          showSection(t.id);
          closeAllGroupMenus();
          mobileWrap.querySelectorAll('.dock-group-trigger').forEach(tr => tr.classList.remove('active'));
          trigger.classList.add('active');
          mobileWrap.querySelectorAll('.dock-menu-item').forEach(mi => mi.classList.remove('active'));
          btn.classList.add('active');
        };
        menu.appendChild(btn);
      });
      document.body.appendChild(menu);
    }

    trigger.onclick = (e) => {
      e.stopPropagation();
      if (groupTabs.length === 1) {
        showSection(groupTabs[0].id);
        closeAllGroupMenus();
        return;
      }
      const isOpen = group.classList.contains('open');
      closeAllGroupMenus();
      if (!isOpen) {
        group.classList.add('open');
        overlay.classList.add('visible');
        if (menu) {
          const rect = trigger.getBoundingClientRect();
          menu.style.left = (rect.left + rect.width / 2) + 'px';
          menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
          menu.classList.add('open');
        }
      }
    };
    group.appendChild(trigger);
    mobileWrap.appendChild(group);
  });

  nav.appendChild(mobileWrap);

  function buildList(containerId, items, defaultVal) {
    const container = document.getElementById(containerId);
    const validValues = items.filter(item => item.type !== 'label').map(item => item.val);
    const activeVal = getSetting(containerId, defaultVal, validValues);
    items.forEach(({type, val, label}) => {
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

  // Scale Spelling and Intervals drills inherit their key/scale from the shared
  // musical context, so only the interval difficulty list is built here.
  buildList('sl-int-diff',
    [{val:'easy',label:'Diatonic'},{val:'medium',label:'Extended'},{val:'hard',label:'Chromatic'}],
    'easy');

  const activeSection = () => document.querySelector('.section.active')?.id;
  let swipeStart = null;

  function showAdjacentSection(direction) {
    const currentId = activeSection()?.replace('sec-', '');
    const currentIndex = TABS.findIndex(t => t.id === currentId);
    if (currentIndex < 0) return;

    // TABS is the visible feature order: top-to-bottom by group, left-to-right inside each group.
    const nextIndex = (currentIndex + direction + TABS.length) % TABS.length;
    closeAllGroupMenus();
    showSection(TABS[nextIndex].id);
  }

  document.addEventListener('touchstart', (e) => {
    if (!isMobileSwipeNav() || e.touches.length !== 1 || isSwipeBlockedTarget(e.target)) {
      swipeStart = null;
      return;
    }

    const touch = e.touches[0];
    swipeStart = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!swipeStart || !isMobileSwipeNav() || !e.changedTouches.length) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.abs(dx) < SWIPE_NAV_THRESHOLD) return;
    if (Math.abs(dy) > SWIPE_NAV_VERTICAL_LIMIT) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.35) return;

    showAdjacentSection(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });

  /*
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
    S.kb.wave = getSetting('kb.wave', S.kb.wave, ['sine','triangle','sawtooth','square']);
    btn.classList.toggle('active', btn.dataset.w === S.kb.wave);
    btn.onclick = () => {
      document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.kb.wave = btn.dataset.w;
      saveSetting('kb.wave', S.kb.wave);
    };
  });

  const kbVol = document.getElementById('kb-vol');
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
  */

  buildNoteButtons('sq-notes','scale');
  buildNoteButtons('iq-notes','interval');

  initMetronome();
  initVisualizer();
  initNowPlaying();
  initHoldRecordButton();
  initContextBar();
  initCommandPalette({ showSection, tabs: TABS, icons: ICONS });
  initProgressHeaders();
  initHome({ showSection, tabs: TABS, icons: ICONS });
  initSessions({ showSection, tabs: TABS, icons: ICONS });
  initSplitView();

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.onclick = () => showSection('home');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection('home'); } };
  }

  const isValidSection = (id) => id === 'home' || TABS.some(t => t.id === id);

  const hashTab = location.hash.replace('#', '');
  if (hashTab && isValidSection(hashTab)) {
    showSection(hashTab, true);
  }

  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && isValidSection(id)) {
      showSection(id, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
