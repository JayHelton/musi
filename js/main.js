import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem, getSelected, MODS, MOD_LABELS, LETTERS_UI, CHROMATIC_NOTES } from './scaleQuiz.js';
import './intervalQuiz.js';
import { drawCoF } from './circleOfFifths.js';
import { buildKeyboard, toggleDrone, stopAll, QWERTY_MAP } from './keyboard.js';
import { initMetronome, stopMetronome, metro } from './metronome.js';
import { initFretboard } from './fretboardTrainer.js';
import { initTuner, stopTuner, tuner } from './vocalTrainer.js';
import { initEarTrainer, stopEarTone, ear } from './earTrainer.js';
import { initBacking, stopBacking, backing } from './backingTrack.js';
import { initRiff, stopRiff, riffState } from './riffGenerator.js';
import { initChordBuilder, stopChord, chordBuilder } from './chordBuilder.js';
import { initScaleRef } from './scaleReference.js';
import { initCurriculum } from './curriculum.js';
import { ROOTS } from './theory.js';
import { SCALES } from './scales.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';

const TABS = [
  {id:'scales',    label:'Scales',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'},
  {id:'intervals', label:'Intervals',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20V8m16 12V4M8 20v-6m4 6V6m4 6v8"/></svg>'},
  {id:'scaleref',  label:'Reference',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>'},
  {id:'chords',    label:'Chords',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>'},
  {id:'circle',    label:'Circle',     icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>'},
  {id:'keyboard',  label:'Keys',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v10m4-10v10m4-10v10m4-10v10"/></svg>'},
  {id:'metronome', label:'Tempo',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L6 22h12L12 2z"/><path d="M12 8v6"/><circle cx="12" cy="16" r="1.5"/></svg>'},
  {id:'fretboard', label:'Fretboard',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M4 6h16M4 10h16M4 14h16M4 18h16M9 2v20M15 2v20"/></svg>'},
  {id:'tuner',     label:'Vocal',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v4m-4 0h8"/></svg>'},
  {id:'ear',       label:'Ear',        icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>'},
  {id:'backing',   label:'Backing',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>'},
  {id:'riff',      label:'Riff',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10a2.83 2.83 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>'},
  {id:'curriculum',label:'Learn',      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>'},
];

function showSection(id) {
  const prev = document.querySelector('.section.active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dock-item').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById('sec-'+id);
  sec.classList.add('active');
  const dockItem = document.querySelector(`.dock-item[data-s="${id}"]`);
  if (dockItem) dockItem.classList.add('active');

  if (id !== 'keyboard' && Object.keys(S.kb.drones).length) stopAll();
  if (id !== 'metronome' && metro.playing) stopMetronome();
  if (id !== 'chords' && chordBuilder.oscillators.length) stopChord();
  if (id !== 'tuner' && tuner.running) stopTuner();
  if (id !== 'ear' && ear._osc) stopEarTone();
  if (id !== 'backing' && backing.playing) stopBacking();
  if (id !== 'riff' && riffState.playing) stopRiff();
  if (id === 'circle') drawCoF();
  if (id === 'keyboard') buildKeyboard();
  if (id === 'metronome') initMetronome();
  if (id === 'curriculum') initCurriculum();
  if (id === 'scaleref') initScaleRef();
  if (id === 'chords') initChordBuilder();
  if (id === 'fretboard') initFretboard();
  if (id === 'tuner') initTuner();
  if (id === 'ear') initEarTrainer();
  if (id === 'backing') initBacking();
  if (id === 'riff') initRiff();
}
window.showSection = showSection;

function init() {
  const nav = document.getElementById('nav');
  TABS.forEach(t => {
    const item = document.createElement('button');
    item.className = 'dock-item' + (t.id === 'scales' ? ' active' : '');
    item.dataset.s = t.id;
    item.innerHTML = `<span class="dock-icon">${t.icon}</span><span class="dock-label">${t.label}</span>`;
    item.onclick = () => showSection(t.id);
    nav.appendChild(item);
  });

  function buildList(containerId, items, defaultVal) {
    const container = document.getElementById(containerId);
    items.forEach(({val, label}) => {
      const div = document.createElement('div');
      div.className = 'sl-item' + (val === defaultVal ? ' active' : '');
      div.dataset.val = val;
      div.textContent = label;
      div.onclick = () => selectItem(containerId, val);
      container.appendChild(div);
    });
  }

  buildList('sl-scale-type',
    [{val:'random',label:'Random'}].concat(Object.keys(SCALES).map(n => ({val:n,label:n}))),
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
    btn.onclick = () => {
      document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.kb.wave = btn.dataset.w;
    };
  });

  document.getElementById('kb-vol').oninput = (e) => {
    S.kb.vol = e.target.value / 100;
    Object.values(S.kb.drones).forEach(dr => {
      if (typeof audioCtx !== 'undefined' && audioCtx) {
        dr.gain.gain.setValueAtTime(S.kb.vol, audioCtx.currentTime);
      }
    });
  };

  buildNoteButtons('sq-notes','scale');
  buildNoteButtons('iq-notes','interval');

  initMetronome();
  initVisualizer();
  initNowPlaying();
}

document.addEventListener('DOMContentLoaded', init);
