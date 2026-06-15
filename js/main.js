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

const TABS = [
  {id:'scales',label:'Scale Quiz'},
  {id:'intervals',label:'Interval Quiz'},
  {id:'scaleref',label:'Scale Reference'},
  {id:'chords',label:'Chord Builder'},
  {id:'circle',label:'Circle of Fifths'},
  {id:'keyboard',label:'Keyboard'},
  {id:'metronome',label:'Metronome'},
  {id:'fretboard',label:'Fretboard Trainer'},
  {id:'tuner',label:'Vocal Trainer'},
  {id:'ear',label:'Ear Trainer'},
  {id:'backing',label:'Backing Track'},
  {id:'riff',label:'Riff Generator'},
  {id:'curriculum',label:'Curriculum'},
];

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('sec-'+id).classList.add('active');
  document.querySelector(`.tab[data-s="${id}"]`).classList.add('active');
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
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.id === 'scales' ? ' active' : '');
    btn.dataset.s = t.id;
    btn.textContent = t.label;
    btn.onclick = () => showSection(t.id);
    nav.appendChild(btn);
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
}

document.addEventListener('DOMContentLoaded', init);
