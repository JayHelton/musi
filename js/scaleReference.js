import { parseNote, ROOTS, INTERVAL_LABELS, TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { SCALES, getScaleNotes, groupedScaleEntries, scaleStepPattern } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { resolveTuningKey } from './tunings.js';
import { buildScalePositions, nearestPositionIndex, positionNoteKeys } from './scalePositions.js';
import { renderFretboard, MAX_FRET } from './scaleFretboard.js';
import {
  defaultMapIntervals, normaliseIntervals, intervalPickerRows,
  intervalsAbove, THIRD_LETTERS, FIFTH_LETTERS,
} from './scaleIntervals.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';

const KEY_SIGS = {
  'C':'none','G':'1#','D':'2#','A':'3#','E':'4#','B':'5#','F#':'6#','Gb':'6b',
  'Db':'5b','Ab':'4b','Eb':'3b','Bb':'2b','F':'1b',
  'C#':'7#','Cb':'7b'
};

// Short scale-degree names keyed by the number of semitones above the tonic.
// Used to label each in-key note on the fretboard relative to the modal root.
const DEGREE_LABELS = {
  0:'R', 1:'b2', 2:'2', 3:'b3', 4:'3', 5:'4',
  6:'b5', 7:'5', 8:'b6', 9:'6', 10:'b7', 11:'7'
};

let refRoot = 'C';
let refScale = 'Major (Ionian)';
let refTuning = 'Standard';
let refModeIndex = 0;
let refFbStart = 0;
let refFbEnd = 24;
let refBoxOnly = false;
// Index into the position list the engine builds for the current selection.
// A value below zero means "not chosen yet", so the box opens on position 1.
let refPositionIndex = -1;
// Positions of the current selection, low on the neck first. The slider and
// the fretboard both read this list, so one render fills it.
let refPositions = [];
let refContextSubscribed = false;
let refFbWired = false;
let refPosWired = false;
// Interval Map: which intervals the neck shows, and the note they measure from.
let refMapIntervals = [];
let refMapRefSemi = null;
let refMapBoxOnly = false;
let refMapWired = false;
let refPlayWired = false;
let refVoices = [];
let refPlayTimers = [];
let refPlaying = false;

const REF_PLAY_OCTAVE = 3;

function initScaleRef() {
  const rootScroll = document.getElementById('sl-ref-root');
  // The shared musical context is the source of truth so the reference opens in
  // whatever key/mode the player picked elsewhere.
  const ctx = getContext();
  refRoot = ctx.root;
  refScale = ctx.scale;
  // The tuning comes from the shared context too. The tool-local setting is
  // the fallback when the context holds a tuning this screen cannot draw.
  const tuningNames = Object.keys(TUNINGS);
  refTuning = resolveTuningKey(ctx.tuning) || getSetting('ref.tuning', refTuning, tuningNames);
  refModeIndex = clampModeIndex(Number(getSetting('ref.modeIndex', refModeIndex)));
  refFbStart = Number(getSetting('ref.fbStart', refFbStart));
  refFbEnd = Number(getSetting('ref.fbEnd', refFbEnd));
  refBoxOnly = getSetting('ref.boxOnly', refBoxOnly, [true, false]);
  const savedPosition = Number(getSetting('ref.positionIndex', refPositionIndex));
  refPositionIndex = Number.isFinite(savedPosition) ? savedPosition : -1;
  refMapBoxOnly = getSetting('ref.mapBoxOnly', refMapBoxOnly, [true, false]);
  refMapIntervals = normaliseIntervals(getSetting('ref.mapIntervals', null));

  rootScroll.innerHTML = '';
  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === refRoot ? ' active' : '');
    div.dataset.val = r;
    div.textContent = r;
    div.onclick = () => {
      rootScroll.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      refRoot = r;
      // A new root moves every box, so the slider goes back to position 1.
      resetRefPosition();
      saveSetting('ref.root', refRoot);
      setContext({ root: refRoot }, 'scaleref');
      renderScaleRef();
    };
    rootScroll.appendChild(div);
  });
  buildScaleList();
  buildTuningList();
  wireFretboardControls();
  wireIntervalMap();
  wirePositionSlider();
  wireRefPlay();
  renderScaleRef();

  if (!refContextSubscribed) {
    refContextSubscribed = true;
    subscribeContext(c => {
      if (c.root === refRoot && c.scale === refScale) return;
      const scaleChanged = c.scale !== refScale;
      refRoot = c.root;
      refScale = c.scale;
      if (scaleChanged) {
        refModeIndex = 0;
        resetMapIntervals();
      }
      resetRefPosition();
      syncRefSelection();
      renderScaleRef();
    });
  }
}

// The tonal-center index must stay within the current scale's degree count.
function clampModeIndex(idx) {
  const def = SCALES[refScale];
  const len = def ? def.length : 7;
  if (!Number.isFinite(idx) || idx < 0 || idx >= len) return 0;
  return Math.floor(idx);
}

function wireRefPlay() {
  if (refPlayWired) return;
  const btn = document.getElementById('ref-play');
  if (!btn) return;
  refPlayWired = true;
  btn.onclick = () => {
    if (refPlaying) {
      stopScaleRef();
      return;
    }
    playScaleRef();
  };
}

function syncRefPlayButton() {
  const label = 'Play scale';
  document.querySelectorAll('#ref-play, #scale-ref-play').forEach(btn => {
    btn.setAttribute('aria-label', refPlaying ? 'Stop playback' : label);
    btn.innerHTML = refPlaying ? 'Stop' : '&#9654; Play';
    btn.classList.toggle('playing', refPlaying);
  });
}

function scheduleRefTone(midi, startTime, duration, vol = 0.16) {
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 3.5, 4500);
  filter.Q.value = 0.5;

  const sustain = duration * 0.55;
  const release = duration * 0.4;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
  gain.gain.setValueAtTime(vol * 0.8, startTime + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + sustain + release);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const stopAt = startTime + sustain + release + 0.05;
  osc.start(startTime); osc.stop(stopAt);
  osc2.start(startTime); osc2.stop(stopAt);
  refVoices.push(osc, osc2);
}

function playRefSequence(midis, beat = 0.42) {
  ensureAudio();
  stopScaleRef();
  if (!midis.length) return;
  const start = audioCtx.currentTime + 0.06;
  midis.forEach((m, i) => scheduleRefTone(m, start + i * beat, beat * 0.95));
  refPlaying = true;
  syncRefPlayButton();
  const totalMs = (midis.length * beat + 0.4) * 1000;
  refPlayTimers.push(setTimeout(() => {
    refPlaying = false;
    syncRefPlayButton();
  }, totalMs));
}

/** Ascending one-octave scale (plus octave tonic) for the selected root/scale. */
function playScaleRef() {
  const rootP = parseNote(refRoot);
  const def = SCALES[refScale];
  if (!rootP || !def) return;
  const { tempo } = getContext();
  const beat = Math.max(0.22, Math.min(0.7, 60 / (tempo || 90)));
  const rootMidi = 12 * (REF_PLAY_OCTAVE + 1) + rootP.semi;
  const midis = def.map(([, so]) => rootMidi + so);
  midis.push(rootMidi + 12);
  playRefSequence(midis, beat);
}

function stopScaleRef() {
  refPlayTimers.forEach(id => clearTimeout(id));
  refPlayTimers = [];
  refVoices.forEach(v => {
    try { v.stop(); } catch (_) {}
  });
  refVoices = [];
  refPlaying = false;
  syncRefPlayButton();
}

function buildTuningList() {
  const container = document.getElementById('sl-ref-tuning');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(TUNINGS).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === refTuning ? ' active' : '');
    div.dataset.val = name;
    const strings = TUNINGS[name];
    div.innerHTML = `<span>${name}</span><span class="sl-item-sub">${strings.length}-string</span>`;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      refTuning = name;
      // The boxes are tuning specific, so the slider goes back to position 1.
      resetRefPosition();
      saveSetting('ref.tuning', refTuning);
      // The tuning is shared, so every compatible tool follows this pick.
      setContext({ tuning: name }, 'scaleref');
      renderRefBoards();
    };
    container.appendChild(div);
  });
}

function wireFretboardControls() {
  const start = document.getElementById('ref-fb-start');
  const end = document.getElementById('ref-fb-end');
  const boxOnly = document.getElementById('ref-fb-boxonly');
  if (!start || refFbWired) return;
  refFbWired = true;
  start.value = refFbStart;
  end.value = refFbEnd;
  boxOnly.checked = refBoxOnly;

  const updateRange = () => {
    let s = Math.max(0, Math.min(24, Number(start.value) || 0));
    let e = Math.max(s + 1, Math.min(24, Number(end.value) || 24));
    refFbStart = s;
    refFbEnd = e;
    start.value = s;
    end.value = e;
    saveSetting('ref.fbStart', refFbStart);
    saveSetting('ref.fbEnd', refFbEnd);
    renderRefBoards();
  };
  start.onchange = updateRange;
  end.onchange = updateRange;
  boxOnly.onchange = () => {
    refBoxOnly = boxOnly.checked;
    saveSetting('ref.boxOnly', refBoxOnly);
    renderRefBoards();
  };
}

function syncRefSelection() {
  document.querySelectorAll('#sl-ref-root .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === refRoot));
  document.querySelectorAll('#sl-ref-scale .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === refScale));
  document.querySelectorAll('#sl-ref-tuning .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === refTuning));
}

function buildScaleList() {
  const container = document.getElementById('sl-ref-scale');
  container.innerHTML = '';
  groupedScaleEntries(false).forEach(({ type, val, label }) => {
    if (type === 'label') {
      const group = document.createElement('div');
      group.className = 'sl-group-label';
      group.textContent = label;
      container.appendChild(group);
      return;
    }

    const div = document.createElement('div');
    div.className = 'sl-item' + (val === refScale ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      refScale = val;
      refModeIndex = 0;
      resetRefPosition();
      resetMapIntervals();
      saveSetting('ref.scale', refScale);
      saveSetting('ref.modeIndex', refModeIndex);
      setContext({ scale: refScale }, 'scaleref');
      renderScaleRef();
    };
    container.appendChild(div);
  });
}

// Computes a 3-notes-per-string layout from an explicit semitone pattern
// (semitones from the supplied root). Each fret entry carries the scale-degree
// index so callers can highlight the root note of the shape.
function compute3NPSFromSemis(rootStr, semis) {
  const r = parseNote(rootStr);
  if (!r) return null;
  if (!Array.isArray(semis) || !semis.length) return null;

  const allSemis = [];
  for (let oct = 0; oct < 5; oct++)
    semis.forEach((s, i) => allSemis.push({ semi: s + oct * 12, degree: i }));

  const rootFret = ((r.semi - 4) % 12 + 12) % 12;
  const openStrings = [0, 5, 10, 15, 19, 24];
  const labels = ['E','A','D','G','B','e'];
  const result = [];
  let ni = 0;

  for (let s = 0; s < 6; s++) {
    const frets = [];
    for (let n = 0; n < 3; n++) {
      if (ni >= allSemis.length) break;
      frets.push({ fret: rootFret + allSemis[ni].semi - openStrings[s], degree: allSemis[ni].degree });
      ni++;
    }
    result.push({ label: labels[s], frets });
  }
  return result;
}

// Finds a SCALES entry whose semitone pattern matches the given list, so each
// rotated mode can be labelled with its proper name when one exists.
function findScaleNameBySemis(semis) {
  const target = semis.join(',');
  for (const [name, def] of Object.entries(SCALES)) {
    if (def.length === semis.length && def.map(d => d[1]).join(',') === target) return name;
  }
  return null;
}

// The 7 diatonic modes of a 7-note scale: each rotation shares the same notes
// but starts on a different scale degree. Returns null for non-7-note scales.
function scaleModes(rootStr, scaleName) {
  const notes = getScaleNotes(rootStr, scaleName);
  const def = SCALES[scaleName];
  if (!notes || !def || def.length !== 7) return null;

  const semis = def.map(d => d[1]);
  const modes = [];
  for (let i = 0; i < 7; i++) {
    const rotated = [];
    for (let k = 0; k < 7; k++)
      rotated.push(((semis[(i + k) % 7] - semis[i]) % 12 + 12) % 12);
    modes.push({
      root: notes[i],
      semis: rotated,
      name: findScaleNameBySemis(rotated) || `Mode ${i + 1}`,
    });
  }

  // Display in conventional modal order starting from Ionian (the parent major
  // scale) when the scale is diatonic; otherwise keep scale-degree order.
  const MAJOR = '0,2,4,5,7,9,11';
  const ionianIdx = modes.findIndex(m => m.semis.join(',') === MAJOR);
  const ordered = ionianIdx > 0
    ? modes.slice(ionianIdx).concat(modes.slice(0, ionianIdx))
    : modes;
  ordered.forEach((m, i) => { m.degree = i + 1; });
  return ordered;
}

// Renders a single mode's 3-NPS shape as a dot diagram (no fret numbers). The
// fret window is derived from the shape itself with one fret of padding.
function renderModeFretboard(pattern) {
  let min = Infinity, max = -Infinity;
  pattern.forEach(s => s.frets.forEach(f => {
    if (f.fret < min) min = f.fret;
    if (f.fret > max) max = f.fret;
  }));
  if (min === Infinity) return '';

  const startFret = Math.max(0, min - 1);
  const endFret = max + 1;
  const count = endFret - startFret + 1;
  const reversed = [...pattern].reverse();

  let html = `<div class="mode-fretboard" style="grid-template-columns:auto repeat(${count},minmax(14px,1fr))">`;
  reversed.forEach(s => {
    html += `<div class="mfb-label">${s.label}</div>`;
    for (let f = startFret; f <= endFret; f++) {
      const hit = s.frets.find(x => x.fret === f);
      let cls = 'mfb-cell';
      if (hit) cls += hit.degree === 0 ? ' root' : ' note';
      html += `<div class="${cls}"></div>`;
    }
  });
  html += `</div>`;
  return html;
}

function renderRefModes() {
  const wrap = document.getElementById('ref-modes');
  if (!wrap) return;
  const modes = scaleModes(refRoot, refScale);
  if (!modes) { wrap.innerHTML = ''; return; }

  let html = `<div class="ref-modes-head">`;
  html += `<h3>Modes of ${refRoot} ${refScale} — 3-Notes-Per-String shapes</h3>`;
  html += `<p class="ref-modes-sub">All seven modal positions across the neck. Pattern shapes only — the highlighted dot is each mode's root.</p>`;
  html += `</div>`;
  html += `<div class="mode-grid">`;
  modes.forEach(m => {
    const pattern = compute3NPSFromSemis(m.root, m.semis);
    if (!pattern) return;
    html += `<div class="mode-card">`;
    html += `<div class="mode-card-title"><span class="mode-deg">${m.degree}</span><span>${m.root} ${m.name}</span></div>`;
    html += renderModeFretboard(pattern);
    html += `</div>`;
  });
  html += `</div>`;
  wrap.innerHTML = html;
}

// MIDI note numbers of each open string for the active tuning (low → high).
function refOpenMidis() {
  const strings = TUNINGS[refTuning] || TUNINGS['Standard'];
  return strings.map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

// Each degree of the current scale as a potential tonal center. For 7-note
// scales we also resolve the conventional mode name (Dorian, Phrygian, …).
function refModeChoices() {
  const def = SCALES[refScale];
  const notes = getScaleNotes(refRoot, refScale);
  const rootP = parseNote(refRoot);
  if (!def || !rootP) return [];
  const semis = def.map(d => d[1]);
  return def.map((d, i) => {
    let name = null;
    if (def.length === 7) {
      const rotated = [];
      for (let k = 0; k < def.length; k++)
        rotated.push(((semis[(i + k) % def.length] - semis[i]) % 12 + 12) % 12);
      name = findScaleNameBySemis(rotated);
    }
    const note = notes ? notes[i] : NOTE_NAMES_SHARP[(rootP.semi + d[1]) % 12];
    return { index: i, note, name };
  });
}

// Every playable position of the current selection, low on the neck first.
// Each position is a four-fret box that starts on the next degree of the
// scale. The scale does not change from one box to the next, so a minor scale
// stays minor: only the note under the index finger moves.
function refBuildPositions(openMidis) {
  const def = SCALES[refScale];
  const rootP = parseNote(refRoot);
  if (!def || !rootP) return [];
  return buildScalePositions({
    openMidis,
    semis: def.map(d => d[1]),
    rootSemi: rootP.semi,
    modeIndex: refModeIndex,
    maxFret: 24,
  });
}

/** Index of the box that starts on the tonal centre, lowest on the neck. */
function refTonicPositionIndex(positions) {
  const found = positions.findIndex(p => p.isTonic);
  return found < 0 ? 0 : found;
}

/**
 * Puts the box back on the tonal centre, and the Interval Map with it.
 * Root, scale, mode and tuning changes all do this.
 */
function resetRefPosition() {
  refPositionIndex = -1;
  refMapRefSemi = null;
}

/** Moves the box `step` positions along the neck and redraws. */
function slideRefPosition(step) {
  if (!refPositions.length) return;
  const next = Math.max(0, Math.min(refPositions.length - 1, refPositionIndex + step));
  if (next === refPositionIndex) return;
  refPositionIndex = next;
  saveSetting('ref.positionIndex', refPositionIndex);
  renderRefBoards();
}

// Both tabs carry a slider and both drive the one box, so each is wired by
// the prefix of its element ids.
const POSITION_SLIDERS = ['ref-pos', 'ivmap-pos'];

function wirePositionSlider() {
  if (refPosWired) return;
  refPosWired = true;
  POSITION_SLIDERS.forEach(wireOnePositionSlider);
}

function wireOnePositionSlider(prefix) {
  const range = document.getElementById(`${prefix}-range`);
  const prev = document.getElementById(`${prefix}-prev`);
  const next = document.getElementById(`${prefix}-next`);
  if (!range) return;
  range.oninput = () => {
    const value = Math.max(0, Math.min(refPositions.length - 1, Number(range.value) || 0));
    if (value === refPositionIndex) return;
    refPositionIndex = value;
    saveSetting('ref.positionIndex', refPositionIndex);
    renderRefBoards();
  };
  if (prev) prev.onclick = () => slideRefPosition(-1);
  if (next) next.onclick = () => slideRefPosition(1);
}

// Keeps every slider, its buttons and its readout in step with the drawn box.
function syncPositionSlider(position) {
  POSITION_SLIDERS.forEach(prefix => syncOnePositionSlider(prefix, position));
}

function syncOnePositionSlider(prefix, position) {
  const range = document.getElementById(`${prefix}-range`);
  const prev = document.getElementById(`${prefix}-prev`);
  const next = document.getElementById(`${prefix}-next`);
  const readout = document.getElementById(`${prefix}-readout`);
  const wrap = document.getElementById(`${prefix}-slider`);
  const total = refPositions.length;
  if (wrap) wrap.classList.toggle('empty', total < 2);
  if (range) {
    range.max = String(Math.max(0, total - 1));
    range.value = String(refPositionIndex);
    range.disabled = total < 2;
  }
  if (prev) prev.disabled = refPositionIndex <= 0;
  if (next) next.disabled = refPositionIndex >= total - 1;
  if (!readout) return;
  if (!position) { readout.innerHTML = ''; return; }

  const centre = refModeChoices()[refModeIndex] || {};
  const modeName = centre.name ? centre.name.replace(/\s*\(.*\)/, '') : refScale;
  const anchor = NOTE_NAMES_SHARP[position.anchorSemi];
  const degreeSemi = position.degreeSemi;
  const degreeLabel = DEGREE_LABELS[degreeSemi] || String(degreeSemi);
  const firstTonic = refTonicPositionIndex(refPositions);
  const octaveUp = position.isTonic && refPositionIndex > firstTonic;

  const centreName = `${centre.note || refRoot} ${modeName}`;
  const degreeText = position.isTonic
    ? `the tonic of ${centreName}`
    : `scale degree ${degreeLabel} of ${centreName}`;

  readout.innerHTML =
    `<span class="ref-pos-badge${position.isTonic ? ' tonic' : ''}">Position ${position.degree}</span>` +
    `<span class="ref-pos-note">starts on <strong>${anchor}</strong> · ${degreeText}</span>` +
    `<span class="ref-pos-frets">frets ${position.start}–${position.end}` +
    `<span class="ref-pos-sep">·</span>box ${refPositionIndex + 1} of ${total} on the neck</span>` +
    `<span class="ref-pos-hold">Still ${centreName} — the same notes, a new hand position.` +
    (octaveUp ? ' Position 1 comes back here, one octave along the neck.' : '') +
    `</span>`;
}

function renderRefModeRow() {
  const row = document.getElementById('ref-mode-row');
  if (!row) return;
  const choices = refModeChoices();
  row.innerHTML = '';
  choices.forEach(({ index, note, name }) => {
    const btn = document.createElement('button');
    btn.className = 'ref-mode-btn' + (index === refModeIndex ? ' active' : '');
    btn.dataset.index = index;
    btn.innerHTML = `<span class="rm-deg">${index + 1}</span>` +
      `<span class="rm-note">${note}</span>` +
      (name ? `<span class="rm-name">${name.replace(/\s*\(.*\)/, '')}</span>` : '');
    btn.onclick = () => {
      refModeIndex = index;
      // A new tonal centre renumbers the boxes, so start again at position 1.
      resetRefPosition();
      saveSetting('ref.modeIndex', refModeIndex);
      renderScaleRef();
    };
    row.appendChild(btn);
  });
}

function renderRefLegend(pcSet, modalRootSemi) {
  const el = document.getElementById('ref-fb-legend');
  if (!el) return;
  const intervals = [...pcSet]
    .map(pc => (pc - modalRootSemi + 12) % 12)
    .sort((a, b) => a - b);
  el.innerHTML = intervals.map(iv =>
    `<span class="ref-leg-item${iv === 0 ? ' root' : ''}">` +
    `<span class="ref-leg-swatch deg-${iv}"></span>` +
    `${DEGREE_LABELS[iv]} · ${INTERVAL_LABELS[iv] || iv}</span>`
  ).join('');
}

// Renders the full neck for the active tuning: every in-key note is shown and
// colour-coded by its interval above the selected modal root. The selected
// mode's initial box position is emphasised while the rest is dimmed.
function renderRefFretboard() {
  const board = document.getElementById('ref-fretboard');
  if (!board) return;
  const rootP = parseNote(refRoot);
  const def = SCALES[refScale];
  if (!rootP || !def) { board.innerHTML = ''; return; }
  refModeIndex = clampModeIndex(refModeIndex);

  renderRefModeRow();

  const strings = TUNINGS[refTuning] || TUNINGS['Standard'];
  const openMidis = refOpenMidis();
  const notes = getScaleNotes(refRoot, refScale);
  const rootSemi = rootP.semi;

  const pcSet = new Set();
  const pcToNote = {};
  def.forEach((d, i) => {
    const pc = (rootSemi + d[1]) % 12;
    pcSet.add(pc);
    pcToNote[pc] = notes ? notes[i] : NOTE_NAMES_SHARP[pc];
  });

  const modalRootSemi = (rootSemi + def[refModeIndex][1]) % 12;

  refPositions = refBuildPositions(openMidis);
  if (refPositionIndex < 0 || refPositionIndex >= refPositions.length) {
    refPositionIndex = refTonicPositionIndex(refPositions);
    saveSetting('ref.positionIndex', refPositionIndex);
  }
  const position = refPositions[refPositionIndex] || null;
  const posKeys = positionNoteKeys(position);
  const box = position ? { start: position.start, end: position.end } : { start: 0, end: -1 };

  renderFretboard({
    board,
    strings,
    openMidis,
    start: refFbStart,
    end: refFbEnd,
    box: position && { start: box.start, end: box.end, anchorFret: position.anchorFret },
    noteFor: ({ string, fret, pc }) => {
      if (!pcSet.has(pc)) return null;
      const inBox = posKeys.has(`${string}:${fret}`);
      if (refBoxOnly && !inBox) return null;
      const interval = (pc - modalRootSemi + 12) % 12;
      const classes = [`deg-${interval}`];
      if (interval === 0) classes.push('root');
      classes.push(inBox ? 'in-pos' : 'dim');
      if (inBox && fret === position.anchorFret && string === 0) classes.push('anchor');
      return {
        label: DEGREE_LABELS[interval],
        classes,
        title: `${pcToNote[pc]} · ${INTERVAL_LABELS[interval] || interval}`,
      };
    },
  });

  const choices = refModeChoices();
  const active = choices[refModeIndex] || {};
  // A pentatonic or a symmetric scale has no modal name for each degree, so
  // name the scale itself, and say which degree the player made the centre.
  const modeName = active.name
    ? active.name.replace(/\s*\(.*\)/, '')
    : (refModeIndex === 0 ? refScale : `${refScale}, degree ${refModeIndex + 1}`);
  const sub = document.getElementById('ref-fb-sub');
  const title = document.getElementById('ref-fb-title');
  if (title) title.textContent = `${refRoot} ${refScale} — ${refTuning}`;
  if (sub) {
    const where = position
      ? `position ${position.degree} at frets ${box.start}–${box.end}`
      : 'no position box on this neck';
    sub.innerHTML = `Tonal centre <strong>${active.note || refRoot} ${modeName}</strong> · ` +
      `${where} · every in-key note coloured by interval`;
  }
  syncPositionSlider(position);
  renderRefLegend(pcSet, modalRootSemi);
}

/* ── Interval Map ─────────────────────────────────────────────
 * The same neck as the Fretboard tab, and the same yellow position box, but
 * the notes it lights up are chosen by interval instead of by scale. The map
 * measures from a reference note, and the player moves that note by clicking
 * any note on the neck.
 */

/** Semitone class the map measures from. The tonal centre until moved. */
function refMapReference() {
  if (refMapRefSemi != null) return refMapRefSemi;
  return refModalRootSemi();
}

/** Semitone class of the current tonal centre. */
function refModalRootSemi() {
  const rootP = parseNote(refRoot);
  const def = SCALES[refScale];
  if (!rootP || !def) return 0;
  return (rootP.semi + def[clampModeIndex(refModeIndex)][1]) % 12;
}

/**
 * The intervals the map shows. Until the player picks, these are the third and
 * the fifth the key puts above the reference note.
 */
function refMapSelection() {
  const def = SCALES[refScale];
  const rootP = parseNote(refRoot);
  if (!def || !rootP) return [];
  if (refMapIntervals.length) return refMapIntervals;
  return defaultMapIntervals(def, rootP.semi, refMapReference());
}

function saveMapIntervals(list) {
  refMapIntervals = normaliseIntervals(list);
  saveSetting('ref.mapIntervals', refMapIntervals);
}

/** Puts the map back on the thirds and fifths of the scale. */
function resetMapIntervals() {
  refMapIntervals = [];
  saveSetting('ref.mapIntervals', []);
}

function toggleMapInterval(semi) {
  const current = new Set(refMapSelection());
  if (current.has(semi)) current.delete(semi);
  else current.add(semi);
  saveMapIntervals([...current]);
  renderIntervalMap();
}

function wireIntervalMap() {
  if (refMapWired) return;
  const board = document.getElementById('ivmap-fretboard');
  if (!board) return;
  refMapWired = true;

  const row = document.getElementById('ivmap-row');
  if (row) {
    row.onclick = (e) => {
      const btn = e.target.closest('[data-interval]');
      if (!btn) return;
      toggleMapInterval(Number(btn.dataset.interval));
    };
  }

  // Clicking a note moves the reference, so the player reads the interval
  // shape from any note on the neck, not only from the tonic.
  board.onclick = (e) => {
    const cell = e.target.closest('.ref-fb-cell');
    if (!cell || cell.dataset.fret == null) return;
    const strings = TUNINGS[refTuning] || TUNINGS['Standard'];
    const openMidis = refOpenMidis();
    const s = Number(cell.dataset.string);
    const f = Number(cell.dataset.fret);
    if (!Number.isFinite(s) || !Number.isFinite(f) || !strings[s]) return;
    const semi = (openMidis[s] + f) % 12;
    // Clicking the reference again hands it back to the tonal centre.
    refMapRefSemi = semi === refMapReference() ? null : semi;
    renderIntervalMap();
  };

  const reset = document.getElementById('ivmap-reset');
  if (reset) reset.onclick = () => { resetMapIntervals(); renderIntervalMap(); };

  const all = document.getElementById('ivmap-all');
  if (all) {
    all.onclick = () => {
      const def = SCALES[refScale];
      if (!def) return;
      const ref = refMapReference();
      // Every note of the key, measured from the reference note.
      saveMapIntervals(def.map(([, semi]) => {
        const rootP = parseNote(refRoot);
        return ((rootP.semi + semi - ref) % 12 + 12) % 12;
      }));
      renderIntervalMap();
    };
  }

  const boxOnly = document.getElementById('ivmap-boxonly');
  if (boxOnly) {
    boxOnly.checked = refMapBoxOnly;
    boxOnly.onchange = () => {
      refMapBoxOnly = boxOnly.checked;
      saveSetting('ref.mapBoxOnly', refMapBoxOnly);
      renderIntervalMap();
    };
  }
}

/** The row of interval buttons. Each says what it is and how the key uses it. */
function renderIntervalRow(def, rootSemi, refSemi, selected) {
  const row = document.getElementById('ivmap-row');
  if (!row) return;
  const rows = intervalPickerRows(def, rootSemi, refSemi, selected);
  row.innerHTML = rows.map(item => {
    const cls = ['ivmap-chip'];
    if (item.selected) cls.push('on');
    if (item.inKey) cls.push('in-key');
    const name = INTERVAL_LABELS[item.semi] || `${item.semi} st`;
    return `<button type="button" class="${cls.join(' ')}" data-interval="${item.semi}" ` +
      `aria-pressed="${item.selected}" title="${name}${item.inKey ? ' · in key' : ' · outside the key'}">` +
      `<span class="ivmap-chip-swatch deg-${item.semi}"></span>` +
      `<span class="ivmap-chip-deg">${item.label}</span>` +
      `<span class="ivmap-chip-name">${name}</span>` +
      `<span class="ivmap-chip-role">${item.role || (item.inKey ? 'in key' : '—')}</span>` +
      `</button>`;
  }).join('');
}

function renderIntervalLegend(selected, refSemi) {
  const el = document.getElementById('ivmap-legend');
  if (!el) return;
  const pcToNote = refScaleSpelling();
  const refName = pcToNote[refSemi] || NOTE_NAMES_SHARP[refSemi];
  let html = `<span class="ref-leg-item root">` +
    `<span class="ref-leg-swatch deg-0"></span>R · ${refName} (reference)</span>`;
  html += selected.map(semi => {
    const pc = (refSemi + semi) % 12;
    const name = pcToNote[pc] || NOTE_NAMES_SHARP[pc];
    return `<span class="ref-leg-item">` +
      `<span class="ref-leg-swatch deg-${semi}"></span>` +
      `${DEGREE_LABELS[semi]} · ${INTERVAL_LABELS[semi] || semi} · ${name}</span>`;
  }).join('');
  el.innerHTML = html;
}

/** Note spelling for each semitone class the scale uses. */
function refScaleSpelling() {
  const rootP = parseNote(refRoot);
  const def = SCALES[refScale];
  const notes = getScaleNotes(refRoot, refScale);
  const map = {};
  if (!rootP || !def) return map;
  def.forEach((d, i) => {
    const pc = (rootP.semi + d[1]) % 12;
    map[pc] = notes ? notes[i] : NOTE_NAMES_SHARP[pc];
  });
  return map;
}

function renderIntervalMap() {
  const board = document.getElementById('ivmap-fretboard');
  if (!board) return;
  const def = SCALES[refScale];
  const rootP = parseNote(refRoot);
  if (!def || !rootP) { board.innerHTML = ''; return; }

  const strings = TUNINGS[refTuning] || TUNINGS['Standard'];
  const openMidis = refOpenMidis();
  const refSemi = refMapReference();
  const selected = refMapSelection();
  const selectedSet = new Set(selected);
  const pcToNote = refScaleSpelling();
  const scalePcs = new Set(Object.keys(pcToNote).map(Number));

  // The box comes from the same position engine, so both tabs agree on it.
  const position = refPositions[refPositionIndex] || null;
  const posKeys = positionNoteKeys(position);

  renderIntervalRow(def, rootP.semi, refSemi, selected);

  renderFretboard({
    board,
    strings,
    openMidis,
    start: refFbStart,
    end: refFbEnd,
    box: position && { start: position.start, end: position.end, anchorFret: position.anchorFret },
    noteFor: ({ string, fret, pc }) => {
      const interval = (pc - refSemi + 12) % 12;
      if (interval !== 0 && !selectedSet.has(interval)) return null;
      const inBox = posKeys.has(`${string}:${fret}`);
      if (refMapBoxOnly && !inBox) return null;
      const classes = [`deg-${interval}`];
      if (interval === 0) classes.push('root');
      classes.push(inBox ? 'in-pos' : 'dim');
      // An interval can land outside the key. Saying so is the point of the
      // map, so the note stays on the neck and wears a marker instead.
      if (!scalePcs.has(pc)) classes.push('out-of-key');
      const name = pcToNote[pc] || NOTE_NAMES_SHARP[pc];
      const role = interval === 0 ? 'reference note' : (INTERVAL_LABELS[interval] || interval);
      return {
        label: DEGREE_LABELS[interval],
        classes,
        title: `${name} · ${role}${scalePcs.has(pc) ? '' : ' · outside the key'}`,
      };
    },
  });

  const refName = pcToNote[refSemi] || NOTE_NAMES_SHARP[refSemi];
  const isCentre = refMapRefSemi == null;
  const third = intervalsAbove(def, rootP.semi, refSemi, THIRD_LETTERS)
    .map(v => DEGREE_LABELS[v]).join(' or ');
  const fifth = intervalsAbove(def, rootP.semi, refSemi, FIFTH_LETTERS)
    .map(v => DEGREE_LABELS[v]).join(' or ');

  const title = document.getElementById('ivmap-title');
  const sub = document.getElementById('ivmap-sub');
  if (title) title.textContent = `Intervals from ${refName}`;
  if (sub) {
    const shape = third && fifth
      ? `In ${refRoot} ${refScale} the third above ${refName} is a <strong>${third}</strong> ` +
        `and the fifth is a <strong>${fifth}</strong>.`
      : `${refName} is outside ${refRoot} ${refScale}, so the key puts no third or fifth above it.`;
    sub.innerHTML =
      `${selected.length} interval${selected.length === 1 ? '' : 's'} on the neck · ` +
      `reference <strong>${refName}</strong>${isCentre ? ' (the tonal centre)' : ''} · ` +
      `tap any note to measure from it<br>${shape}`;
  }
  renderIntervalLegend(selected, refSemi);
  syncPositionSlider(position);
}

/** Draws the neck on both tabs from one set of positions. */
function renderRefBoards() {
  renderRefFretboard();
  renderIntervalMap();
}

// The chords of the key live in the Triads tool now. This takes the player
// there and opens the tab that holds them.
function openTriadsInKey() {
  if (typeof window !== 'undefined' && typeof window.showSection === 'function') {
    window.showSection('triads');
  }
  document.dispatchEvent(new CustomEvent('musi:open-triads-inkey'));
}

function renderScaleRef() {
  // Changing root/scale/pattern re-renders; cut any in-flight preview so it
  // can't keep sounding against a different selection.
  stopScaleRef();
  const card = document.getElementById('ref-card');
  const notes = getScaleNotes(refRoot, refScale);
  if (!notes) { card.innerHTML = '<p style="color:var(--err)">Could not compute scale</p>'; return; }

  const def = SCALES[refScale];
  const stepPat = scaleStepPattern(refScale);

  let html = `<div class="chord-ref-head">`;
  html += `<h3 class="chord-ref-name" style="margin:0">${refRoot} ${refScale}</h3>`;
  html += `<button class="btn sm chord-ref-play" id="scale-ref-play" type="button">&#9654; Play</button>`;
  html += `</div>`;
  html += `<div class="ref-info">Step pattern: <strong>${stepPat}</strong></div>`;

  if (KEY_SIGS[refRoot] && refScale === 'Major (Ionian)') {
    html += `<div class="ref-info">Key signature: <strong>${KEY_SIGS[refRoot]}</strong></div>`;
  }

  html += `<table class="ref-table"><tr><th>Degree</th><th>Note</th><th>Interval</th><th>Semitones</th></tr>`;
  notes.forEach((note, i) => {
    const semi = def[i][1];
    const intLabel = INTERVAL_LABELS[semi % 12] || (semi + 'st');
    html += `<tr><td>${i + 1}</td><td style="color:var(--accent);font-weight:600">${note}</td><td>${intLabel}</td><td>${semi}</td></tr>`;
  });
  html += `</table>`;

  // The chords of the key live in the Triads tool, on its "In key" tab.
  html += `<p class="ref-xref">Looking for the chords of this key? They are in ` +
    `<button type="button" class="ref-xref-link" id="ref-goto-triads">Triads → In key</button>.</p>`;

  card.innerHTML = html;
  const gotoTriads = document.getElementById('ref-goto-triads');
  if (gotoTriads) gotoTriads.onclick = () => openTriadsInKey();
  const scalePlay = document.getElementById('scale-ref-play');
  if (scalePlay) {
    scalePlay.onclick = () => {
      if (refPlaying) stopScaleRef();
      else playScaleRef();
    };
  }
  renderRefBoards();
  renderRefModes();
  syncRefPlayButton();
}

/** Apply setup-chip picks: update state, persist, sync sidebar, re-render. */
export function applyScaleRefSelection({ root, scale, tuning } = {}) {
  let changed = false;

  if (root && ROOTS.includes(root) && root !== refRoot) {
    refRoot = root;
    resetRefPosition();
    saveSetting('ref.root', refRoot);
    setContext({ root: refRoot }, 'scaleref');
    changed = true;
  }

  if (scale && SCALES[scale] && scale !== refScale) {
    refScale = scale;
    refModeIndex = 0;
    resetRefPosition();
    resetMapIntervals();
    saveSetting('ref.scale', refScale);
    saveSetting('ref.modeIndex', refModeIndex);
    setContext({ scale: refScale }, 'scaleref');
    changed = true;
  }

  if (tuning) {
    const key = resolveTuningKey(tuning);
    if (key !== refTuning) {
      refTuning = key;
      resetRefPosition();
      saveSetting('ref.tuning', refTuning);
      setContext({ tuning: key }, 'scaleref');
      changed = true;
    }
  }

  syncRefSelection();
  if (changed) renderScaleRef();
}

export { initScaleRef, stopScaleRef };
