// Virtual keyboard feature is intentionally disabled in the UI for now.
// import { audioCtx } from './audio.js';
import { buildNoteButtons, selectItem } from './scaleQuiz.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
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
import { initRecorder, stopRecorder, recorder } from './recorder.js';
import { initScaleRef } from './scaleReference.js';
import { ROOTS } from './theory.js';
import { groupedScaleEntries } from './scales.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { getSetting, saveSetting } from './persistence.js';

const ICONS = {
  scales:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  intervals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20V8m16 12V4M8 20v-6m4 6V6m4 6v8"/></svg>',
  sightreading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="8" cy="15" r="2.4" fill="currentColor" stroke="none"/><path d="M10.4 15V7"/></svg>',
  scaleref:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  chords:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>',
  circle:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>',
  // keyboard:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
  metronome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L6 22h12L12 2z"/><path d="M12 8v6"/><circle cx="12" cy="16" r="1.5"/></svg>',
  // fretboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M4 6h16M4 10h16M4 14h16M4 18h16M9 2v20M15 2v20"/></svg>',
  tuner:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>',
  ear:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>',
  // backing:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>',
  // riff:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10a2.83 2.83 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  recorder:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 17v4M8 21h8"/></svg>',
};

const TABS = [
  {id:'scales',    label:'Scales',     group:'Quiz'},
  {id:'intervals', label:'Intervals',  group:'Quiz'},
  {id:'sightreading', label:'Sight Read', group:'Quiz'},
  {id:'scaleref',  label:'Reference',  group:'Reference'},
  {id:'chords',    label:'Chords',     group:'Reference'},
  {id:'circle',    label:'Circle',     group:'Reference'},
  // {id:'keyboard',  label:'Keys',       group:'Tools'},
  {id:'metronome', label:'Metronome',  group:'Tools'},
  // Fretboard now lives under Intervals.
  // {id:'fretboard', label:'Fretboard',  group:'Train'},
  {id:'tuner',     label:'Vocal / Record', group:'Train'},
  {id:'ear',       label:'Ear',        group:'Train'},
  // {id:'backing',   label:'Backing',    group:'Create'},
  // {id:'riff',      label:'Riff',       group:'Create'},
  // Recorder now lives under Vocal / Record.
  // {id:'recorder',  label:'Record',     group:'Create'},
];

const GROUPS = ['Quiz','Reference','Tools','Train'];
const GROUP_ICONS = {
  Quiz:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  Reference: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  Tools:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>',
  Train:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>',
  Create:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>',
};

const SECTION_ALIASES = {
  fretboard: 'intervals',
  recorder: 'tuner',
};

function normalizeSectionId(id) {
  return SECTION_ALIASES[id] || id;
}

const MOBILE_SWIPE_QUERY = '(max-width: 768px)';
const SWIPE_NAV_THRESHOLD = 70;
const SWIPE_NAV_VERTICAL_LIMIT = 80;

function showSection(id, skipHash) {
  id = normalizeSectionId(id);
  const prev = document.querySelector('.section.active');
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

  // Virtual keyboard feature is disabled in the UI for now.
  // if (id !== 'keyboard' && Object.keys(S.kb.drones).length) stopAll();
  if (id !== 'metronome' && metro.playing) stopMetronome();
  if (id !== 'chords' && chordBuilder.oscillators.length) stopChord();
  if (id !== 'tuner' && tuner.running) stopTuner();
  if (id !== 'ear' && ear._osc) stopEarTone();
  if (id !== 'sightreading') stopSightReading();
  // if (id !== 'backing' && backing.playing) stopBacking();
  // if (id !== 'riff' && riffState.playing) stopRiff();
  // if (id !== 'riff' && composer.playing) stopComposer();
  if (id !== 'tuner' && (recorder.recording || recorder.playing)) stopRecorder();
  if (id === 'circle') drawCoF();
  // if (id === 'keyboard') buildKeyboard();
  if (id === 'metronome') initMetronome();
  if (id === 'scaleref') initScaleRef();
  if (id === 'chords') initChordBuilder();
  if (id === 'intervals') initFretboard();
  if (id === 'tuner') {
    initTuner();
    initRecorder();
  }
  if (id === 'ear') initEarTrainer();
  if (id === 'sightreading') initSightReading();
  // if (id === 'backing') initBacking();
  // if (id === 'riff') { initRiff(); initComposerNotes(); }
  // if (id === 'recorder') initRecorder();
}
window.showSection = showSection;

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
    item.className = 'dock-item dock-desktop' + (t.id === 'scales' ? ' active' : '');
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
    const hasActive = groupTabs.some(t => t.id === 'scales');
    if (hasActive) trigger.classList.add('active');
    trigger.dataset.group = groupName;
    trigger.innerHTML = `<span class="dock-icon">${GROUP_ICONS[groupName]}</span><span class="dock-label">${groupName}</span>`;

    let menu = null;
    if (groupTabs.length > 1) {
      menu = document.createElement('div');
      menu.className = 'dock-group-menu';
      groupTabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'dock-menu-item' + (t.id === 'scales' ? ' active' : '');
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

  buildList('sl-scale-type',
    groupedScaleEntries(true),
    'random');
  buildList('sl-scale-root',
    [{val:'random',label:'Random'}].concat(ROOTS.map(r => ({val:r,label:r}))),
    'random');
  buildList('sl-int-diff',
    [{val:'easy',label:'Easy'},{val:'medium',label:'Medium'},{val:'hard',label:'Hard'}],
    'easy');
  buildList('sl-int-root',
    [{val:'random',label:'Random'}].concat(ROOTS.map(r => ({val:r,label:r}))),
    'random');

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
  Virtual keyboard feature is disabled in the UI for now. Keep this code for future reactivation.
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

  const hashTab = normalizeSectionId(location.hash.replace('#', ''));
  if (hashTab && TABS.some(t => t.id === hashTab)) {
    showSection(hashTab, true);
  }

  window.addEventListener('hashchange', () => {
    const id = normalizeSectionId(location.hash.replace('#', ''));
    if (id && TABS.some(t => t.id === id)) {
      showSection(id, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
