// Drum practice module UI: a pattern browser, a step-sequencer drum machine, a
// rule-based fill generator and a tempo-ramp practice mode. Everything runs in
// the browser with no backend; built-in patterns ship in code, user patterns
// persist in IndexedDB, and small UI prefs live in localStorage.

import { getSetting, saveSetting } from '../persistence.js';
import { showNowPlaying, hideNowPlaying } from '../nowPlaying.js';
import {
  INSTRUMENT_LABELS, VELOCITY_BY_SYMBOL, STYLES, stepsPerBeat, defaultVelocity,
} from './types.js';
import { BUILTIN_PATTERNS } from './builtinPatterns.js';
import { renderTab, renderMarkdown } from './tabRenderer.js';
import { generateFill, FILL_TEMPLATES } from './fillGenerator.js';
import { listPatterns, savePattern, deletePattern, drumsDbSupported } from './drumPatternDb.js';
import * as engine from './drumEngine.js';

// ---- Lane model shared by the sequencer and tab conversion ----------------
const MACHINE_LANES = [
  { key: 'crash', label: 'C', name: 'Crash', resolve: () => 'crash', cycle: ['-', 'x', 'X'] },
  { key: 'ride', label: 'R', name: 'Ride', resolve: () => 'ride', cycle: ['-', 'x', 'X'] },
  { key: 'hihat', label: 'H', name: 'Hi-Hat', resolve: (s) => (s === 'O' ? 'hihatOpen' : 'hihatClosed'), cycle: ['-', 'x', 'X', 'O'] },
  { key: 'snare', label: 'S', name: 'Snare', resolve: (s) => (s === 'g' ? 'snareGhost' : s === 'f' ? 'snareFlam' : 'snare'), cycle: ['-', 'x', 'X', 'g', 'f'] },
  { key: 'tomHigh', label: 'T1', name: 'Tom 1', resolve: () => 'tomHigh', cycle: ['-', 'x', 'X'] },
  { key: 'tomMid', label: 'T2', name: 'Tom 2', resolve: () => 'tomMid', cycle: ['-', 'x', 'X'] },
  { key: 'tomFloor', label: 'FT', name: 'Floor', resolve: () => 'tomFloor', cycle: ['-', 'x', 'X'] },
  { key: 'kick', label: 'K', name: 'Kick', resolve: () => 'kick', cycle: ['-', 'x', 'X'] },
];
const LANE_BY_KEY = Object.fromEntries(MACHINE_LANES.map((l) => [l.key, l]));

const GRID_PRESETS = {
  '8th': { subdivision: '8th', stepsPerBar: 8, meter: '4/4' },
  '16th': { subdivision: '16th', stepsPerBar: 16, meter: '4/4' },
  triplet: { subdivision: 'triplet', stepsPerBar: 12, meter: '4/4' },
  sixEight: { subdivision: 'sixEight', stepsPerBar: 6, meter: '6/8' },
  twelveEight: { subdivision: 'triplet', stepsPerBar: 12, meter: '12/8' },
};

const PRACTICE_PRESETS = [
  { title: 'Accuracy Builder', startBpm: 60, targetBpm: 100, bpmStep: 5, loopsBeforeIncrease: 4 },
  { title: 'Metal Endurance', startBpm: 100, targetBpm: 180, bpmStep: 5, loopsBeforeIncrease: 8 },
  { title: 'Fill Control', startBpm: 70, targetBpm: 130, bpmStep: 5, loopsBeforeIncrease: 4 },
];

function laneForInstrument(instrument) {
  if (instrument === 'crash') return LANE_BY_KEY.crash;
  if (instrument === 'ride') return LANE_BY_KEY.ride;
  if (instrument.startsWith('hihat')) return LANE_BY_KEY.hihat;
  if (instrument.startsWith('snare')) return LANE_BY_KEY.snare;
  if (instrument === 'tomHigh') return LANE_BY_KEY.tomHigh;
  if (instrument === 'tomMid') return LANE_BY_KEY.tomMid;
  if (instrument === 'tomFloor') return LANE_BY_KEY.tomFloor;
  if (instrument === 'kick') return LANE_BY_KEY.kick;
  return null;
}

function symbolFor(instrument, vel) {
  if (instrument === 'hihatOpen') return 'O';
  if (instrument === 'snareGhost') return 'g';
  if (instrument === 'snareFlam') return 'f';
  if (vel >= 0.9) return 'X';
  if (vel >= 0.6) return 'x';
  return 'o';
}
function symVel(sym) {
  if (sym === 'O') return VELOCITY_BY_SYMBOL.x;
  return VELOCITY_BY_SYMBOL[sym] ?? 0.72;
}
const SYM_PRIORITY = { '-': 0, o: 1, x: 2, X: 3, g: 2, O: 3, f: 4 };

// ---- Module state ---------------------------------------------------------
let built = false;
let showSectionFn = null;
let userPatterns = [];
let machine = null;          // current sequencer state
let currentView = 'library';
let velEditorEl = null;
let longPressTimer = null;
const practice = {
  running: false, startBpm: 60, targetBpm: 120, bpmStep: 5,
  loopsBeforeIncrease: 4, loopCount: 0, currentBpm: 60,
  cleanReps: 0, needsWork: false, patternId: null, timer: null, startTime: 0,
};

const $ = (id) => document.getElementById(id);

// ---- Favorites (localStorage) ---------------------------------------------
function favorites() {
  const v = getSetting('drums.favorites', []);
  return Array.isArray(v) ? v : [];
}
function isFavorite(id) { return favorites().includes(id); }
function toggleFavorite(id) {
  const list = favorites();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  saveSetting('drums.favorites', list);
}

function allPatterns() {
  return [...userPatterns, ...BUILTIN_PATTERNS];
}
function findPattern(id) {
  return allPatterns().find((p) => p.id === id) || null;
}

// ---- Pattern <-> machine-state conversion ---------------------------------
function patternToState(p) {
  const stepsPerBar = p.stepsPerBar || 16;
  const bars = p.bars || 1;
  const total = stepsPerBar * bars;
  const grid = {}; const vel = {}; const prob = {};
  MACHINE_LANES.forEach((l) => { grid[l.key] = new Array(total).fill('-'); vel[l.key] = {}; prob[l.key] = {}; });
  for (const s of (p.steps || [])) {
    const lane = laneForInstrument(s.instrument);
    if (!lane || s.step < 0 || s.step >= total) continue;
    const sym = symbolFor(s.instrument, s.velocity ?? 0.72);
    if (SYM_PRIORITY[sym] >= SYM_PRIORITY[grid[lane.key][s.step]]) grid[lane.key][s.step] = sym;
    vel[lane.key][s.step] = s.velocity ?? 0.72;
    if (s.probability != null && s.probability < 1) prob[lane.key][s.step] = s.probability;
  }
  return {
    title: p.title || 'Untitled Beat',
    category: p.category || 'beat',
    style: p.style || 'rock',
    difficulty: p.difficulty || 2,
    subdivision: p.subdivision || '16th',
    stepsPerBar, bars, total, grid, vel, prob,
    meter: p.meter || '4/4',
    bpmRange: p.bpmRange || [60, 160],
    bpm: clamp(Math.round((p.bpmRange?.[0] + p.bpmRange?.[1]) / 2) || 110, 30, 300),
    swing: 0, humanizeTime: 0, humanizeVel: 0,
    laneVolume: {}, muted: new Set(), soloed: new Set(),
    loopStart: 0, loopEnd: total - 1, looping: true,
    countIn: false, metronome: false, crashOnLoopStart: false,
    sourceId: p.id || null,
  };
}

function emptyState() {
  const base = {
    id: null, title: 'New Beat', category: 'beat', style: 'rock', difficulty: 2,
    subdivision: '16th', stepsPerBar: 16, bars: 1, meter: '4/4', bpmRange: [70, 140], steps: [],
  };
  return patternToState(base);
}

function hasPlayableMachinePattern(state = machine) {
  if (!state) return false;
  return MACHINE_LANES.some((lane) => state.grid[lane.key]?.some((sym) => sym !== '-'));
}

function stateToPattern(state) {
  const steps = [];
  MACHINE_LANES.forEach((l) => {
    state.grid[l.key].forEach((sym, step) => {
      if (sym === '-') return;
      steps.push({
        instrument: l.resolve(sym),
        step,
        velocity: state.vel[l.key][step] ?? symVel(sym),
        probability: state.prob[l.key][step] != null ? state.prob[l.key][step] : 1,
      });
    });
  });
  steps.sort((a, b) => a.step - b.step);
  const pattern = {
    id: state.sourceId,
    title: state.title,
    category: state.category,
    style: state.style,
    difficulty: state.difficulty,
    bpmRange: state.bpmRange,
    meter: state.meter,
    subdivision: state.subdivision,
    bars: state.bars,
    stepsPerBar: state.stepsPerBar,
    beatsPerBar: state.stepsPerBar / stepsPerBeat(state.subdivision),
    steps,
    builtin: false,
  };
  pattern.tab = renderTab(pattern);
  return pattern;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- Transport helpers -----------------------------------------------------
function syncEngineFromState() {
  const pattern = stateToPattern(machine);
  engine.schedulePattern(pattern, { loopStart: machine.loopStart, loopEnd: machine.loopEnd });
  engine.setBpm(machine.bpm);
  engine.setEngineOptions({
    swing: machine.swing,
    humanizeTime: machine.humanizeTime,
    humanizeVel: machine.humanizeVel,
    looping: machine.looping,
    metronome: machine.metronome,
    countIn: machine.countIn,
    crashOnLoopStart: machine.crashOnLoopStart,
  });
  engine.clearMuteSolo();
  machine.muted.forEach((k) => MACHINE_LANES.filter((l) => l.key === k).forEach((l) => muteLane(l)));
  // re-apply mute/solo by lane key
  MACHINE_LANES.forEach((l) => {
    const insts = laneInstruments(l);
    insts.forEach((inst) => {
      engine.setMuted(inst, machine.muted.has(l.key));
      engine.setSoloed(inst, machine.soloed.has(l.key));
    });
    const vol = machine.laneVolume[l.key];
    if (vol != null) insts.forEach((inst) => engine.setLaneVolume(inst, vol));
  });
}
function muteLane() {}

function laneInstruments(lane) {
  if (lane.key === 'hihat') return ['hihatClosed', 'hihatOpen'];
  if (lane.key === 'snare') return ['snare', 'snareGhost', 'snareFlam'];
  return [lane.resolve('x')];
}

function playMachine() {
  engine.initEngine();
  syncEngineFromState();
  engine.setCallbacks({ onStep: highlightStep, onLoop: null });
  engine.start();
  showNowPlaying(`Drum Machine — ${machine.bpm} BPM`, stopDrums);
  updateTransportButtons();
}
function stopMachine() {
  engine.stop();
  hideNowPlaying();
  highlightStep(-1);
  updateTransportButtons();
}

// ---- View shell ------------------------------------------------------------
const VIEWS = [
  { id: 'library', label: 'Library' },
  { id: 'machine', label: 'Drum Machine' },
  { id: 'fills', label: 'Fill Generator' },
  { id: 'practice', label: 'Practice' },
];

function setView(id) {
  currentView = id;
  document.querySelectorAll('.drums-subnav .dr-tab').forEach((b) => b.classList.toggle('active', b.dataset.v === id));
  document.querySelectorAll('.drums-view').forEach((v) => v.classList.toggle('active', v.id === 'drums-view-' + id));
  if (id === 'library') renderLibrary();
  if (id === 'machine') renderMachine();
  if (id === 'fills') renderFills();
  if (id === 'practice') renderPractice();
}

function buildShell() {
  const subnav = $('drums-subnav');
  subnav.innerHTML = '';
  VIEWS.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'dr-tab';
    b.dataset.v = v.id;
    b.textContent = v.label;
    b.onclick = () => setView(v.id);
    subnav.appendChild(b);
  });
}

// ===========================================================================
// LIBRARY
// ===========================================================================
const libFilters = { category: 'all', style: 'all', difficulty: 'all', search: '', favOnly: false };

function renderLibrary() {
  const root = $('drums-view-library');
  root.innerHTML = `
    <div class="dr-filters">
      <input type="search" id="dr-search" class="dr-search" placeholder="Search patterns…" value="${escapeAttr(libFilters.search)}">
      <select id="dr-f-cat">
        <option value="all">All categories</option>
        <option value="beat">Beats</option>
        <option value="fill">Fills</option>
        <option value="exercise">Exercises</option>
      </select>
      <select id="dr-f-style">
        <option value="all">All styles</option>
        ${STYLES.map((s) => `<option value="${s}">${cap(s)}</option>`).join('')}
      </select>
      <select id="dr-f-diff">
        <option value="all">All levels</option>
        ${[1, 2, 3, 4, 5].map((d) => `<option value="${d}">Difficulty ${d}</option>`).join('')}
      </select>
      <button class="btn sm dr-fav-toggle ${libFilters.favOnly ? 'active' : ''}" id="dr-fav-only">★ Favorites</button>
    </div>
    <div class="dr-lib-count" id="dr-lib-count"></div>
    <div class="dr-cards" id="dr-cards"></div>`;

  $('dr-search').oninput = (e) => { libFilters.search = e.target.value; renderCards(); };
  $('dr-f-cat').value = libFilters.category;
  $('dr-f-cat').onchange = (e) => { libFilters.category = e.target.value; renderCards(); };
  $('dr-f-style').value = libFilters.style;
  $('dr-f-style').onchange = (e) => { libFilters.style = e.target.value; renderCards(); };
  $('dr-f-diff').value = libFilters.difficulty;
  $('dr-f-diff').onchange = (e) => { libFilters.difficulty = e.target.value; renderCards(); };
  $('dr-fav-only').onclick = () => {
    libFilters.favOnly = !libFilters.favOnly;
    $('dr-fav-only').classList.toggle('active', libFilters.favOnly);
    renderCards();
  };
  renderCards();
}

function filteredPatterns() {
  const q = libFilters.search.trim().toLowerCase();
  const favs = favorites();
  return allPatterns().filter((p) => {
    if (libFilters.category !== 'all' && p.category !== libFilters.category) return false;
    if (libFilters.style !== 'all' && p.style !== libFilters.style) return false;
    if (libFilters.difficulty !== 'all' && String(p.difficulty) !== libFilters.difficulty) return false;
    if (libFilters.favOnly && !favs.includes(p.id)) return false;
    if (q && !(`${p.title} ${p.style} ${p.category}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderCards() {
  const wrap = $('dr-cards');
  if (!wrap) return;
  const list = filteredPatterns();
  $('dr-lib-count').textContent = `${list.length} pattern${list.length === 1 ? '' : 's'}`;
  wrap.innerHTML = '';
  if (!list.length) {
    wrap.innerHTML = '<div class="dr-empty">No patterns match your filters.</div>';
    return;
  }
  list.forEach((p) => wrap.appendChild(buildPatternCard(p)));
}

function buildPatternCard(p) {
  const card = document.createElement('div');
  card.className = 'dr-card';
  const fav = isFavorite(p.id);
  card.innerHTML = `
    <div class="dr-card-head">
      <div>
        <div class="dr-card-title">${escapeHtml(p.title)}</div>
        <div class="dr-card-meta">
          <span class="dr-badge cat-${p.category}">${p.category}</span>
          <span class="dr-badge">${cap(p.style)}</span>
          <span class="dr-badge">D${p.difficulty}</span>
          <span class="dr-badge">${p.meter}</span>
          <span class="dr-badge">${p.bpmRange[0]}–${p.bpmRange[1]} BPM</span>
          ${p.builtin ? '' : '<span class="dr-badge user">Mine</span>'}
        </div>
      </div>
      <button class="dr-fav ${fav ? 'on' : ''}" title="Favorite" aria-label="Favorite">${fav ? '★' : '☆'}</button>
    </div>
    <div class="dr-tab-pre-wrap"><pre class="dr-tab-pre">${escapeHtml(p.tab)}</pre></div>
    ${p.notes ? `<div class="dr-card-notes">${escapeHtml(p.notes)}</div>` : ''}
    <div class="dr-card-actions">
      <button class="btn sm primary dr-a-play">▶ Play</button>
      <button class="btn sm dr-a-load">Load in Machine</button>
      <button class="btn sm dr-a-copy">Copy Tab</button>
      <button class="btn sm dr-a-practice">Start Practice</button>
      ${p.builtin ? '' : '<button class="btn sm dr-a-delete">Delete</button>'}
    </div>`;

  card.querySelector('.dr-fav').onclick = () => { toggleFavorite(p.id); renderCards(); };
  card.querySelector('.dr-a-play').onclick = (e) => auditionPattern(p, e.currentTarget);
  card.querySelector('.dr-a-load').onclick = () => { loadIntoMachine(p); setView('machine'); };
  card.querySelector('.dr-a-copy').onclick = (e) => copyText(p.tab, e.currentTarget);
  card.querySelector('.dr-a-practice').onclick = () => { startPracticeWith(p); setView('practice'); };
  const del = card.querySelector('.dr-a-delete');
  if (del) del.onclick = async () => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await deletePattern(p.id);
    await refreshUserPatterns();
    renderCards();
  };
  return card;
}

let auditionId = null;
function auditionPattern(p, btn) {
  if (auditionId === p.id && engine.isPlaying()) {
    stopMachine();
    auditionId = null;
    document.querySelectorAll('.dr-a-play').forEach((b) => (b.textContent = '▶ Play'));
    return;
  }
  loadIntoMachine(p);
  playMachine();
  auditionId = p.id;
  document.querySelectorAll('.dr-a-play').forEach((b) => (b.textContent = '▶ Play'));
  if (btn) btn.textContent = '■ Stop';
}

// ===========================================================================
// DRUM MACHINE
// ===========================================================================
function loadIntoMachine(p) {
  machine = patternToState(p);
  practice.patternId = p.id || null;
  if (currentView === 'machine') renderMachine();
  if (currentView === 'practice') renderPractice();
}

function renderMachine() {
  if (!machine) machine = emptyState();
  const root = $('drums-view-machine');
  root.innerHTML = `
    <div class="dr-machine-top">
      <input type="text" id="dr-m-title" class="dr-title-input" value="${escapeAttr(machine.title)}" aria-label="Pattern title">
      <div class="dr-transport">
        <button class="btn primary" id="dr-play">▶ Play</button>
        <label class="dr-ctl">BPM
          <input type="number" id="dr-bpm" min="30" max="300" value="${machine.bpm}">
        </label>
        <input type="range" id="dr-bpm-slider" min="30" max="300" value="${machine.bpm}" class="dr-bpm-slider">
        <label class="dr-ctl">Grid
          <select id="dr-grid">
            <option value="8th">8th</option>
            <option value="16th">16th</option>
            <option value="triplet">Triplet</option>
            <option value="sixEight">6/8</option>
            <option value="twelveEight">12/8</option>
          </select>
        </label>
        <label class="dr-ctl">Bars
          <select id="dr-bars">
            <option value="1">1</option><option value="2">2</option><option value="4">4</option>
          </select>
        </label>
      </div>
      <div class="dr-toggle-row">
        <label class="dr-chk"><input type="checkbox" id="dr-loop" ${machine.looping ? 'checked' : ''}> Loop</label>
        <label class="dr-chk"><input type="checkbox" id="dr-metro" ${machine.metronome ? 'checked' : ''}> Metronome</label>
        <label class="dr-chk"><input type="checkbox" id="dr-countin" ${machine.countIn ? 'checked' : ''}> Count-in</label>
        <label class="dr-chk"><input type="checkbox" id="dr-crashloop" ${machine.crashOnLoopStart ? 'checked' : ''}> Crash on loop</label>
      </div>
      <div class="dr-knob-row">
        <label class="dr-knob">Swing <input type="range" id="dr-swing" min="0" max="100" value="${Math.round(machine.swing * 100)}"><span id="dr-swing-v">${Math.round(machine.swing * 100)}%</span></label>
        <label class="dr-knob">Humanize time <input type="range" id="dr-htime" min="0" max="100" value="${Math.round(machine.humanizeTime * 100)}"><span id="dr-htime-v">${Math.round(machine.humanizeTime * 100)}%</span></label>
        <label class="dr-knob">Humanize vel <input type="range" id="dr-hvel" min="0" max="100" value="${Math.round(machine.humanizeVel * 100)}"><span id="dr-hvel-v">${Math.round(machine.humanizeVel * 100)}%</span></label>
      </div>
    </div>
    <div class="dr-grid-wrap"><div class="dr-grid" id="dr-grid-el"></div></div>
    <div class="dr-machine-actions">
      <button class="btn sm" id="dr-save">Save</button>
      <button class="btn sm" id="dr-dupe">Duplicate</button>
      <button class="btn sm" id="dr-clear">Clear</button>
      <button class="btn sm" id="dr-copy-md">Copy Markdown</button>
      <button class="btn sm" id="dr-copy-tab">Copy Tab</button>
      <button class="btn sm" id="dr-export">Export JSON</button>
      <button class="btn sm" id="dr-import">Import JSON</button>
      <input type="file" id="dr-import-file" accept="application/json,.json" hidden>
    </div>
    <div class="dr-machine-status" id="dr-m-status"></div>`;

  // grid selector reflect current
  const gridKey = currentGridKey();
  $('dr-grid').value = gridKey;
  $('dr-bars').value = String(machine.bars);

  wireMachineControls();
  renderGrid();
  updateTransportButtons();
}

function currentGridKey() {
  if (machine.subdivision === 'sixEight') return 'sixEight';
  if (machine.subdivision === 'triplet') return machine.meter === '12/8' ? 'twelveEight' : 'triplet';
  return machine.subdivision;
}

function wireMachineControls() {
  $('dr-m-title').oninput = (e) => { machine.title = e.target.value; };
  $('dr-play').onclick = () => { engine.isPlaying() ? stopMachine() : playMachine(); };
  const bpmIn = $('dr-bpm'); const bpmSl = $('dr-bpm-slider');
  const setBpm = (v) => {
    machine.bpm = clamp(parseInt(v, 10) || 110, 30, 300);
    bpmIn.value = machine.bpm; bpmSl.value = machine.bpm;
    engine.setBpm(machine.bpm);
    if (engine.isPlaying()) showNowPlaying(`Drum Machine — ${machine.bpm} BPM`, stopDrums);
  };
  bpmIn.oninput = (e) => setBpm(e.target.value);
  bpmSl.oninput = (e) => setBpm(e.target.value);

  $('dr-grid').onchange = (e) => changeGrid(e.target.value);
  $('dr-bars').onchange = (e) => changeBars(parseInt(e.target.value, 10));

  $('dr-loop').onchange = (e) => { machine.looping = e.target.checked; engine.setEngineOptions({ looping: machine.looping }); };
  $('dr-metro').onchange = (e) => { machine.metronome = e.target.checked; engine.setEngineOptions({ metronome: machine.metronome }); };
  $('dr-countin').onchange = (e) => { machine.countIn = e.target.checked; engine.setEngineOptions({ countIn: machine.countIn }); };
  $('dr-crashloop').onchange = (e) => { machine.crashOnLoopStart = e.target.checked; engine.setEngineOptions({ crashOnLoopStart: machine.crashOnLoopStart }); };

  const knob = (id, key, label) => {
    $(id).oninput = (e) => {
      machine[key] = Number(e.target.value) / 100;
      $(label).textContent = e.target.value + '%';
      engine.setEngineOptions({ [key]: machine[key] });
    };
  };
  knob('dr-swing', 'swing', 'dr-swing-v');
  knob('dr-htime', 'humanizeTime', 'dr-htime-v');
  knob('dr-hvel', 'humanizeVel', 'dr-hvel-v');

  $('dr-save').onclick = saveMachinePattern;
  $('dr-dupe').onclick = duplicateMachinePattern;
  $('dr-clear').onclick = clearMachinePattern;
  $('dr-copy-md').onclick = (e) => copyText(renderMarkdown(stateToPattern(machine)), e.currentTarget);
  $('dr-copy-tab').onclick = (e) => copyText(stateToPattern(machine).tab, e.currentTarget);
  $('dr-export').onclick = exportMachinePattern;
  $('dr-import').onclick = () => $('dr-import-file').click();
  $('dr-import-file').onchange = importMachinePattern;
}

function changeGrid(key) {
  const preset = GRID_PRESETS[key];
  if (!preset) return;
  const old = machine;
  machine.subdivision = preset.subdivision;
  machine.stepsPerBar = preset.stepsPerBar;
  machine.meter = preset.meter;
  resizeGrid();
  if (engine.isPlaying()) syncEngineFromState();
  renderMachine();
}
function changeBars(bars) {
  machine.bars = clamp(bars, 1, 4);
  resizeGrid();
  if (engine.isPlaying()) syncEngineFromState();
  renderMachine();
}
function resizeGrid() {
  const total = machine.stepsPerBar * machine.bars;
  MACHINE_LANES.forEach((l) => {
    const old = machine.grid[l.key] || [];
    const next = new Array(total).fill('-');
    for (let i = 0; i < Math.min(total, old.length); i++) next[i] = old[i];
    machine.grid[l.key] = next;
    // trim vel/prob overrides beyond range
    [machine.vel, machine.prob].forEach((m) => {
      Object.keys(m[l.key] || {}).forEach((k) => { if (Number(k) >= total) delete m[l.key][k]; });
    });
  });
  machine.total = total;
  machine.loopStart = clamp(machine.loopStart, 0, total - 1);
  machine.loopEnd = total - 1;
}

function renderGrid() {
  const el = $('dr-grid-el');
  if (!el) return;
  const per = stepsPerBeat(machine.subdivision);
  const total = machine.stepsPerBar * machine.bars;
  el.style.setProperty('--steps', total);
  el.innerHTML = '';
  MACHINE_LANES.forEach((lane) => {
    const row = document.createElement('div');
    row.className = 'dr-lane';
    const muted = machine.muted.has(lane.key);
    const soloed = machine.soloed.has(lane.key);
    const vol = machine.laneVolume[lane.key] ?? 1;
    row.innerHTML = `
      <div class="dr-lane-ctl">
        <span class="dr-lane-name" data-key="${lane.key}" title="Preview">${lane.name}</span>
        <div class="dr-lane-btns">
          <button class="dr-mini ${muted ? 'on' : ''}" data-act="mute" title="Mute">M</button>
          <button class="dr-mini ${soloed ? 'on solo' : ''}" data-act="solo" title="Solo">S</button>
          <button class="dr-mini" data-act="rand" title="Randomize lane">⚂</button>
        </div>
        <input type="range" class="dr-lane-vol" min="0" max="140" value="${Math.round(vol * 100)}" title="Lane volume" data-key="${lane.key}">
      </div>
      <div class="dr-cells" data-lane="${lane.key}"></div>`;
    const cells = row.querySelector('.dr-cells');
    for (let i = 0; i < total; i++) {
      const sym = machine.grid[lane.key][i];
      const cell = document.createElement('button');
      cell.className = 'dr-cell sym-' + symClass(sym);
      if (i % per === 0) cell.classList.add('beat-start');
      if (machine.prob[lane.key][i] != null && machine.prob[lane.key][i] < 1) cell.classList.add('has-prob');
      cell.dataset.lane = lane.key;
      cell.dataset.step = i;
      cell.textContent = sym === '-' ? '' : sym;
      attachCellHandlers(cell, lane, i);
      cells.appendChild(cell);
    }
    // lane control handlers
    row.querySelector('[data-act="mute"]').onclick = () => toggleLaneFlag(lane, 'muted');
    row.querySelector('[data-act="solo"]').onclick = () => toggleLaneFlag(lane, 'soloed');
    row.querySelector('[data-act="rand"]').onclick = () => randomizeLane(lane);
    row.querySelector('.dr-lane-name').onclick = () => engine.trigger(lane.resolve('x'), 0.9);
    row.querySelector('.dr-lane-vol').oninput = (e) => {
      const v = Number(e.target.value) / 100;
      machine.laneVolume[lane.key] = v;
      laneInstruments(lane).forEach((inst) => engine.setLaneVolume(inst, v));
    };
    el.appendChild(row);
  });
}

function symClass(sym) {
  return { '-': 'rest', x: 'norm', X: 'accent', o: 'soft', O: 'open', g: 'ghost', f: 'flam' }[sym] || 'rest';
}

function attachCellHandlers(cell, lane, step) {
  cell.onclick = () => {
    const cur = machine.grid[lane.key][step];
    const idx = lane.cycle.indexOf(cur);
    const next = lane.cycle[(idx + 1) % lane.cycle.length];
    machine.grid[lane.key][step] = next;
    // reset overrides when turning off
    if (next === '-') { delete machine.vel[lane.key][step]; delete machine.prob[lane.key][step]; }
    refreshCell(cell, lane.key, step);
    if (next !== '-') engine.trigger(lane.resolve(next), symVel(next));
    if (engine.isPlaying()) syncEngineFromState();
  };
  // secondary click / long-press -> velocity & probability editor
  cell.oncontextmenu = (e) => { e.preventDefault(); openVelEditor(lane, step, cell); };
  cell.addEventListener('touchstart', () => {
    longPressTimer = setTimeout(() => openVelEditor(lane, step, cell), 480);
  }, { passive: true });
  const cancel = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  cell.addEventListener('touchend', cancel);
  cell.addEventListener('touchmove', cancel, { passive: true });
}

function refreshCell(cell, laneKey, step) {
  const sym = machine.grid[laneKey][step];
  cell.className = 'dr-cell sym-' + symClass(sym);
  const per = stepsPerBeat(machine.subdivision);
  if (step % per === 0) cell.classList.add('beat-start');
  if (machine.prob[laneKey][step] != null && machine.prob[laneKey][step] < 1) cell.classList.add('has-prob');
  cell.textContent = sym === '-' ? '' : sym;
}

function toggleLaneFlag(lane, flag) {
  const set = machine[flag];
  if (set.has(lane.key)) set.delete(lane.key); else set.add(lane.key);
  syncEngineFromState();
  renderGrid();
}

function randomizeLane(lane) {
  const total = machine.stepsPerBar * machine.bars;
  const per = stepsPerBeat(machine.subdivision);
  const onCycle = lane.cycle.filter((s) => s !== '-');
  for (let i = 0; i < total; i++) {
    const onBeat = i % per === 0;
    const p = onBeat ? 0.6 : 0.3;
    if (Math.random() < p) {
      machine.grid[lane.key][i] = onBeat && onCycle.includes('X') ? 'X' : onCycle[Math.floor(Math.random() * onCycle.length)];
    } else {
      machine.grid[lane.key][i] = '-';
    }
    delete machine.vel[lane.key][i]; delete machine.prob[lane.key][i];
  }
  if (engine.isPlaying()) syncEngineFromState();
  renderGrid();
}

let highlightCol = -1;
function highlightStep(step) {
  document.querySelectorAll('.dr-cell.playing').forEach((c) => c.classList.remove('playing'));
  highlightCol = step;
  if (step < 0) return;
  document.querySelectorAll(`.dr-cell[data-step="${step}"]`).forEach((c) => c.classList.add('playing'));
}

function updateTransportButtons() {
  const btn = $('dr-play');
  if (btn) {
    const playing = engine.isPlaying();
    btn.textContent = playing ? '■ Stop' : '▶ Play';
    btn.classList.toggle('playing', playing);
  }
}

// ---- Velocity / probability editor ----------------------------------------
function openVelEditor(lane, step, cell) {
  if (machine.grid[lane.key][step] === '-') return;
  if (!velEditorEl) {
    velEditorEl = document.createElement('div');
    velEditorEl.className = 'dr-vel-editor';
    document.body.appendChild(velEditorEl);
    document.addEventListener('click', (e) => {
      if (velEditorEl && !velEditorEl.contains(e.target) && !e.target.classList.contains('dr-cell')) closeVelEditor();
    });
  }
  const sym = machine.grid[lane.key][step];
  const vel = Math.round((machine.vel[lane.key][step] ?? symVel(sym)) * 100);
  const prob = Math.round((machine.prob[lane.key][step] ?? 1) * 100);
  velEditorEl.innerHTML = `
    <div class="dr-vel-title">${lane.name} · step ${step + 1}</div>
    <label class="dr-knob">Velocity <input type="range" id="dr-ve-vel" min="5" max="130" value="${vel}"><span id="dr-ve-vel-v">${vel}%</span></label>
    <label class="dr-knob">Probability <input type="range" id="dr-ve-prob" min="0" max="100" value="${prob}"><span id="dr-ve-prob-v">${prob}%</span></label>
    <button class="btn sm" id="dr-ve-close">Done</button>`;
  const r = cell.getBoundingClientRect();
  velEditorEl.style.left = clamp(r.left, 8, window.innerWidth - 230) + 'px';
  velEditorEl.style.top = (r.bottom + window.scrollY + 6) + 'px';
  velEditorEl.classList.add('open');
  $('dr-ve-vel').oninput = (e) => {
    machine.vel[lane.key][step] = Number(e.target.value) / 100;
    $('dr-ve-vel-v').textContent = e.target.value + '%';
    if (engine.isPlaying()) syncEngineFromState();
  };
  $('dr-ve-prob').oninput = (e) => {
    machine.prob[lane.key][step] = Number(e.target.value) / 100;
    $('dr-ve-prob-v').textContent = e.target.value + '%';
    refreshCell(cell, lane.key, step);
    if (engine.isPlaying()) syncEngineFromState();
  };
  $('dr-ve-close').onclick = closeVelEditor;
}
function closeVelEditor() { if (velEditorEl) velEditorEl.classList.remove('open'); }

// ---- Machine actions -------------------------------------------------------
function machineStatus(msg) {
  const el = $('dr-m-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function saveMachinePattern() {
  const pattern = stateToPattern(machine);
  pattern.id = machine.sourceId && !findBuiltin(machine.sourceId) ? machine.sourceId : null;
  pattern.title = machine.title || 'My Beat';
  const saved = await savePattern(pattern);
  if (!saved) { machineStatus('Could not save (storage unavailable).'); return; }
  machine.sourceId = saved.id;
  await refreshUserPatterns();
  machineStatus(`Saved “${saved.title}”.`);
}
function findBuiltin(id) { return BUILTIN_PATTERNS.some((p) => p.id === id); }

async function duplicateMachinePattern() {
  machine.sourceId = null;
  machine.title = (machine.title || 'My Beat') + ' (copy)';
  $('dr-m-title').value = machine.title;
  await saveMachinePattern();
}

function clearMachinePattern() {
  const total = machine.stepsPerBar * machine.bars;
  MACHINE_LANES.forEach((l) => { machine.grid[l.key] = new Array(total).fill('-'); machine.vel[l.key] = {}; machine.prob[l.key] = {}; });
  if (engine.isPlaying()) syncEngineFromState();
  renderGrid();
  machineStatus('Cleared.');
}

function exportMachinePattern() {
  const pattern = stateToPattern(machine);
  const blob = new Blob([JSON.stringify(pattern, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (machine.title || 'beat').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  machineStatus('Exported JSON.');
}

function importMachinePattern(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const pattern = normalizeImported(obj);
      loadIntoMachine(pattern);
      machine.sourceId = null;
      renderMachine();
      machineStatus(`Imported “${pattern.title}”.`);
    } catch (err) {
      machineStatus('Import failed: invalid JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function normalizeImported(obj) {
  if (!obj || !Array.isArray(obj.steps)) throw new Error('bad');
  return {
    id: null,
    title: obj.title || 'Imported Beat',
    category: obj.category || 'beat',
    style: obj.style || 'rock',
    difficulty: obj.difficulty || 2,
    bpmRange: Array.isArray(obj.bpmRange) ? obj.bpmRange : [60, 160],
    meter: obj.meter || '4/4',
    subdivision: obj.subdivision || '16th',
    bars: obj.bars || 1,
    stepsPerBar: obj.stepsPerBar || 16,
    steps: obj.steps.filter((s) => s && s.instrument && Number.isFinite(s.step)),
    tab: obj.tab || '',
    builtin: false,
  };
}

// ===========================================================================
// FILL GENERATOR
// ===========================================================================
const fillInput = {
  style: 'rock', difficulty: 3, length: '1-bar', subdivision: '16th', density: 3,
  includeKick: true, includeFlams: false, includeGhosts: false, resolveWithCrash: true, seed: '',
};
let lastFill = null;

function renderFills() {
  const root = $('drums-view-fills');
  root.innerHTML = `
    <div class="dr-fill-panel">
      <div class="dr-fill-form">
        <label class="dr-ctl">Style
          <select id="fg-style">${Object.keys(FILL_TEMPLATES).map((s) => `<option value="${s}">${cap(s)}</option>`).join('')}</select>
        </label>
        <label class="dr-ctl">Difficulty
          <select id="fg-diff">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
        </label>
        <label class="dr-ctl">Length
          <select id="fg-len"><option value="2-beat">2-beat</option><option value="1-bar">1-bar</option><option value="2-bar">2-bar</option></select>
        </label>
        <label class="dr-ctl">Subdivision
          <select id="fg-sub"><option value="8th">8th</option><option value="16th">16th</option><option value="triplet">Triplet</option></select>
        </label>
        <label class="dr-ctl">Density
          <select id="fg-dens">${[1, 2, 3, 4, 5].map((d) => `<option value="${d}">${d}</option>`).join('')}</select>
        </label>
        <label class="dr-ctl">Seed
          <input type="text" id="fg-seed" placeholder="random" value="${escapeAttr(fillInput.seed)}">
        </label>
      </div>
      <div class="dr-fill-toggles">
        <label class="dr-chk"><input type="checkbox" id="fg-kick" ${fillInput.includeKick ? 'checked' : ''}> Kick</label>
        <label class="dr-chk"><input type="checkbox" id="fg-flam" ${fillInput.includeFlams ? 'checked' : ''}> Flams</label>
        <label class="dr-chk"><input type="checkbox" id="fg-ghost" ${fillInput.includeGhosts ? 'checked' : ''}> Ghosts</label>
        <label class="dr-chk"><input type="checkbox" id="fg-resolve" ${fillInput.resolveWithCrash ? 'checked' : ''}> Resolve with crash</label>
      </div>
      <div class="dr-fill-actions">
        <button class="btn primary" id="fg-gen">Generate</button>
        <button class="btn" id="fg-regen">Regenerate</button>
        <button class="btn" id="fg-play">▶ Play</button>
        <button class="btn" id="fg-use">Use This Fill</button>
        <button class="btn sm" id="fg-copy">Copy Tab</button>
        <button class="btn sm" id="fg-save">Save</button>
      </div>
    </div>
    <div class="dr-fill-output" id="fg-output"><div class="dr-empty">Generate a fill to see its tab, grid and practice notes.</div></div>`;

  $('fg-style').value = fillInput.style;
  $('fg-diff').value = String(fillInput.difficulty);
  $('fg-len').value = fillInput.length;
  $('fg-sub').value = fillInput.subdivision;
  $('fg-dens').value = String(fillInput.density);

  const sync = () => {
    fillInput.style = $('fg-style').value;
    fillInput.difficulty = Number($('fg-diff').value);
    fillInput.length = $('fg-len').value;
    fillInput.subdivision = $('fg-sub').value;
    fillInput.density = Number($('fg-dens').value);
    fillInput.seed = $('fg-seed').value.trim();
    fillInput.includeKick = $('fg-kick').checked;
    fillInput.includeFlams = $('fg-flam').checked;
    fillInput.includeGhosts = $('fg-ghost').checked;
    fillInput.resolveWithCrash = $('fg-resolve').checked;
  };
  ['fg-style', 'fg-diff', 'fg-len', 'fg-sub', 'fg-dens', 'fg-seed', 'fg-kick', 'fg-flam', 'fg-ghost', 'fg-resolve']
    .forEach((id) => { const el = $(id); el.addEventListener('change', sync); });

  $('fg-gen').onclick = () => { sync(); doGenerate(false); };
  $('fg-regen').onclick = () => { sync(); doGenerate(true); };
  $('fg-play').onclick = (e) => { if (!lastFill) doGenerate(false); auditionPattern(lastFill, e.currentTarget); };
  $('fg-use').onclick = () => { if (!lastFill) doGenerate(false); loadIntoMachine(lastFill); setView('machine'); };
  $('fg-copy').onclick = (e) => { if (lastFill) copyText(lastFill.tab, e.currentTarget); };
  $('fg-save').onclick = async () => {
    if (!lastFill) return;
    const saved = await savePattern({ ...lastFill, id: null });
    if (saved) { await refreshUserPatterns(); machineStatusFill(`Saved “${saved.title}”.`); }
    else machineStatusFill('Could not save (storage unavailable).');
  };

  if (lastFill) renderFillOutput(lastFill);
}

function doGenerate(regenerate) {
  if (regenerate || !fillInput.seed) {
    // Regenerate / random: use a fresh seed unless the user pinned one.
    fillInput._activeSeed = fillInput.seed || Math.random().toString(36).slice(2, 10);
    if (regenerate && !fillInput.seed) fillInput._activeSeed = Math.random().toString(36).slice(2, 10);
  } else {
    fillInput._activeSeed = fillInput.seed;
  }
  lastFill = generateFill({ ...fillInput, seed: fillInput._activeSeed });
  renderFillOutput(lastFill);
}

function renderFillOutput(fill) {
  const out = $('fg-output');
  if (!out) return;
  out.innerHTML = `
    <div class="dr-card-meta">
      <span class="dr-badge cat-fill">fill</span>
      <span class="dr-badge">${cap(fill.style)}</span>
      <span class="dr-badge">D${fill.difficulty}</span>
      <span class="dr-badge">${fill.meter}</span>
      <span class="dr-badge">${fill.bpmRange[0]}–${fill.bpmRange[1]} BPM</span>
      <span class="dr-badge">${fill.template || ''}</span>
      <span class="dr-badge">seed: ${escapeHtml(fill.seed || '')}</span>
    </div>
    <div class="dr-tab-pre-wrap"><pre class="dr-tab-pre">${escapeHtml(fill.tab)}</pre></div>
    <div class="dr-fill-mini-grid" id="fg-mini"></div>
    ${fill.notes ? `<div class="dr-card-notes">${escapeHtml(fill.notes)}</div>` : ''}
    <div class="dr-fill-status" id="fg-status"></div>`;
  renderMiniGrid($('fg-mini'), fill);
}

function renderMiniGrid(container, pattern) {
  if (!container) return;
  const per = stepsPerBeat(pattern.subdivision);
  const total = pattern.stepsPerBar * pattern.bars;
  const state = patternToState(pattern);
  container.style.setProperty('--steps', total);
  container.innerHTML = '';
  MACHINE_LANES.forEach((lane) => {
    if (!state.grid[lane.key].some((s) => s !== '-')) return;
    const row = document.createElement('div');
    row.className = 'dr-mini-lane';
    row.innerHTML = `<span class="dr-mini-label">${lane.label}</span>`;
    const cells = document.createElement('div');
    cells.className = 'dr-mini-cells';
    for (let i = 0; i < total; i++) {
      const sym = state.grid[lane.key][i];
      const c = document.createElement('span');
      c.className = 'dr-mini-cell sym-' + symClass(sym) + (i % per === 0 ? ' beat-start' : '');
      c.textContent = sym === '-' ? '' : sym;
      cells.appendChild(c);
    }
    row.appendChild(cells);
    container.appendChild(row);
  });
}

function machineStatusFill(msg) {
  const el = $('fg-status');
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

// ===========================================================================
// PRACTICE MODE
// ===========================================================================
function startPracticeWith(pattern) {
  loadIntoMachine(pattern);
}

function renderPractice() {
  const root = $('drums-view-practice');
  const hasPattern = hasPlayableMachinePattern();
  const loaded = hasPattern && machine ? machine.title : 'Metronome only';
  const practiceNote = hasPattern
    ? 'Practice plays the loaded beat with quarter-note metronome clicks.'
    : 'No drum loop loaded. Practice will run as a metronome-only tempo ramp.';
  root.innerHTML = `
    <div class="dr-practice">
      <div class="dr-practice-presets" id="dr-pp"></div>
      <div class="dr-practice-form">
        <div class="dr-practice-loaded ${hasPattern ? '' : 'empty'}">Practice source: <strong>${escapeHtml(loaded)}</strong></div>
        <div class="dr-practice-note">${practiceNote}</div>
        <label class="dr-ctl">Start BPM <input type="number" id="pr-start" min="30" max="300" value="${practice.startBpm}"></label>
        <label class="dr-ctl">Target BPM <input type="number" id="pr-target" min="30" max="300" value="${practice.targetBpm}"></label>
        <label class="dr-ctl">BPM step <input type="number" id="pr-step" min="1" max="40" value="${practice.bpmStep}"></label>
        <label class="dr-ctl">Loops before increase <input type="number" id="pr-loops" min="1" max="64" value="${practice.loopsBeforeIncrease}"></label>
      </div>
      <div class="dr-practice-readout">
        <div class="dr-pr-stat"><span class="dr-pr-val" id="pr-bpm-val">${practice.startBpm}</span><span class="dr-pr-lbl">Current BPM</span></div>
        <div class="dr-pr-stat"><span class="dr-pr-val" id="pr-loop-val">0</span><span class="dr-pr-lbl">Loops</span></div>
        <div class="dr-pr-stat"><span class="dr-pr-val" id="pr-time-val">0:00</span><span class="dr-pr-lbl">Time</span></div>
        <div class="dr-pr-stat"><span class="dr-pr-val" id="pr-clean-val">${practice.cleanReps}</span><span class="dr-pr-lbl">Clean reps</span></div>
      </div>
      <div class="dr-practice-actions">
        <button class="btn primary" id="pr-toggle">▶ Start Practice</button>
        <button class="btn sm" id="pr-clean-plus">+ Clean rep</button>
        <button class="btn sm" id="pr-clean-minus">− Clean rep</button>
        <button class="btn sm dr-needs-work ${practice.needsWork ? 'on' : ''}" id="pr-needs">⚑ Needs work</button>
      </div>
    </div>`;

  const pp = $('dr-pp');
  PRACTICE_PRESETS.forEach((preset) => {
    const b = document.createElement('button');
    b.className = 'btn sm dr-preset';
    b.textContent = preset.title;
    b.onclick = () => {
      practice.startBpm = preset.startBpm; practice.targetBpm = preset.targetBpm;
      practice.bpmStep = preset.bpmStep; practice.loopsBeforeIncrease = preset.loopsBeforeIncrease;
      renderPractice();
    };
    pp.appendChild(b);
  });

  $('pr-start').onchange = (e) => { practice.startBpm = clamp(parseInt(e.target.value, 10) || 60, 30, 300); };
  $('pr-target').onchange = (e) => { practice.targetBpm = clamp(parseInt(e.target.value, 10) || 120, 30, 300); };
  $('pr-step').onchange = (e) => { practice.bpmStep = clamp(parseInt(e.target.value, 10) || 5, 1, 40); };
  $('pr-loops').onchange = (e) => { practice.loopsBeforeIncrease = clamp(parseInt(e.target.value, 10) || 4, 1, 64); };
  $('pr-toggle').onclick = () => { practice.running ? stopPractice() : startPractice(); };
  $('pr-clean-plus').onclick = () => { practice.cleanReps++; $('pr-clean-val').textContent = practice.cleanReps; };
  $('pr-clean-minus').onclick = () => { practice.cleanReps = Math.max(0, practice.cleanReps - 1); $('pr-clean-val').textContent = practice.cleanReps; };
  $('pr-needs').onclick = () => { practice.needsWork = !practice.needsWork; $('pr-needs').classList.toggle('on', practice.needsWork); };
  updatePracticeToggle();
}

function startPractice() {
  if (!machine) machine = emptyState();
  engine.initEngine();
  practice.running = true;
  practice.loopCount = 0;
  practice.currentBpm = practice.startBpm;
  machine.bpm = practice.startBpm;
  machine.looping = true;
  practice.startTime = Date.now();
  syncEngineFromState();
  engine.setBpm(practice.currentBpm);
  engine.setEngineOptions({ looping: true, metronome: true });
  engine.setCallbacks({ onStep: highlightStep, onLoop: onPracticeLoop });
  engine.start();
  showNowPlaying(`Practice — ${practice.currentBpm} BPM`, stopDrums);
  practice.timer = setInterval(updatePracticeTime, 250);
  updatePracticeReadout();
  updatePracticeToggle();
}

function onPracticeLoop() {
  practice.loopCount++;
  if (practice.loopCount % practice.loopsBeforeIncrease === 0 && practice.currentBpm < practice.targetBpm) {
    practice.currentBpm = Math.min(practice.targetBpm, practice.currentBpm + practice.bpmStep);
    machine.bpm = practice.currentBpm;
    engine.setBpm(practice.currentBpm);
    showNowPlaying(`Practice — ${practice.currentBpm} BPM`, stopDrums);
  }
  updatePracticeReadout();
}

function stopPractice() {
  practice.running = false;
  engine.stop();
  hideNowPlaying();
  highlightStep(-1);
  if (practice.timer) { clearInterval(practice.timer); practice.timer = null; }
  updatePracticeToggle();
}

function updatePracticeReadout() {
  const bpm = $('pr-bpm-val'); if (bpm) bpm.textContent = practice.currentBpm;
  const loop = $('pr-loop-val'); if (loop) loop.textContent = practice.loopCount;
}
function updatePracticeTime() {
  const el = $('pr-time-val');
  if (!el) return;
  const s = Math.floor((Date.now() - practice.startTime) / 1000);
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function updatePracticeToggle() {
  const btn = $('pr-toggle');
  if (btn) {
    btn.textContent = practice.running ? '■ Stop Practice' : '▶ Start Practice';
    btn.classList.toggle('playing', practice.running);
    btn.disabled = false;
  }
}

// ===========================================================================
// Shared utilities
// ===========================================================================
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function copyText(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = o), 1200); } };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* noop */ }
  ta.remove(); done();
}

async function refreshUserPatterns() {
  userPatterns = await listPatterns();
  if (currentView === 'library') renderCards();
}

// ===========================================================================
// Lifecycle
// ===========================================================================
export function initDrums() {
  if (!built) {
    buildShell();
    machine = emptyState();
    built = true;
  }
  refreshUserPatterns();
  if (!document.querySelector('.drums-view.active')) setView('library');
  else setView(currentView);
}

export function stopDrums() {
  if (engine.isPlaying()) engine.stop();
  hideNowPlaying();
  if (practice.running) { practice.running = false; if (practice.timer) { clearInterval(practice.timer); practice.timer = null; } updatePracticeToggle(); }
  auditionId = null;
  closeVelEditor();
}
