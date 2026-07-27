import { parseNote, ROOTS, INTERVAL_LABELS, TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { SCALES, getScaleNotes, groupedScaleEntries, scaleStepPattern } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import {
  SWEEP_STRING_SETS,
  DIMINISHED_PRIORITY,
  getSweepLibrary,
  getSweepPattern,
  patternsForStringSet,
  inversionOptionsFor,
} from './sweepPatterns.js';

const DEGREE_ROMAN = ['I','II','III','IV','V','VI','VII'];
const TRIAD_SUFFIX = ['','m','m','','','m','dim'];
const SEVENTH_SUFFIX = ['maj7','m7','m7','maj7','7','m7','m7b5'];
const MAJOR_SCALE = 'Major (Ionian)';
const TRIAD_QUALITIES = {
  '4,7': { name: 'Major', suffix: '' },
  '3,7': { name: 'Minor', suffix: 'm' },
  '3,6': { name: 'Diminished', suffix: 'dim' },
  '4,8': { name: 'Augmented', suffix: 'aug' },
};
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
// Fretboard position inlay markers (single dots), plus a double dot at 12/24.
const REF_FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
// Width of the highlighted "box" position window, in frets (inclusive span).
const REF_BOX_SPAN = 4;
// Selectable string-set sizes for the sweep-picking library (3 / 4 / 5 string).
const SWEEP_SET_OPTIONS = [3, 4, 5];

let refRoot = 'C';
let refScale = 'Major (Ionian)';
let refTuning = 'Standard';
let refModeIndex = 0;
let refFbStart = 0;
let refFbEnd = 15;
let refBoxOnly = false;
let refSweepStringSet = 3;
let refSweepPatternId = 'maj';
let refSweepInversion = 0;
let refViewMode = 'scale'; // 'scale' | 'sweep'
let refContextSubscribed = false;
let refFbWired = false;
let refViewWired = false;

function initScaleRef() {
  const rootScroll = document.getElementById('sl-ref-root');
  // The shared musical context is the source of truth so the reference opens in
  // whatever key/mode the player picked elsewhere.
  const ctx = getContext();
  refRoot = ctx.root;
  refScale = ctx.scale;
  const tuningNames = Object.keys(TUNINGS);
  refTuning = getSetting('ref.tuning', refTuning, tuningNames);
  refModeIndex = clampModeIndex(Number(getSetting('ref.modeIndex', refModeIndex)));
  refFbStart = Number(getSetting('ref.fbStart', refFbStart));
  refFbEnd = Number(getSetting('ref.fbEnd', refFbEnd));
  refBoxOnly = getSetting('ref.boxOnly', refBoxOnly, [true, false]);
  refSweepStringSet = clampSweepSet(Number(getSetting('ref.sweepStringSet', refSweepStringSet)));
  refSweepPatternId = String(getSetting('ref.sweepPatternId', refSweepPatternId) || 'maj');
  refSweepInversion = Math.max(0, Number(getSetting('ref.sweepInversion', refSweepInversion)) || 0);
  refViewMode = getSetting('ref.viewMode', refViewMode, ['scale', 'sweep']);

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
      saveSetting('ref.root', refRoot);
      setContext({ root: refRoot }, 'scaleref');
      renderScaleRef();
    };
    rootScroll.appendChild(div);
  });
  buildScaleList();
  buildTuningList();
  wireFretboardControls();
  wireRefViewPicker();
  renderScaleRef();

  if (!refContextSubscribed) {
    refContextSubscribed = true;
    subscribeContext(c => {
      if (c.root === refRoot && c.scale === refScale) return;
      const scaleChanged = c.scale !== refScale;
      refRoot = c.root;
      refScale = c.scale;
      if (scaleChanged) refModeIndex = 0;
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

function clampSweepSet(n) {
  return SWEEP_SET_OPTIONS.includes(n) ? n : 3;
}

function wireRefViewPicker() {
  if (refViewWired) return;
  const picker = document.getElementById('ref-view-picker');
  if (!picker) return;
  refViewWired = true;
  picker.querySelectorAll('.ref-view-btn').forEach(btn => {
    btn.onclick = () => {
      refViewMode = btn.dataset.refView === 'sweep' ? 'sweep' : 'scale';
      saveSetting('ref.viewMode', refViewMode);
      renderScaleRef();
    };
  });
}

function syncRefViewPicker() {
  document.querySelectorAll('#ref-view-picker .ref-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.refView === refViewMode);
  });
  const scaleControls = document.getElementById('ref-scale-controls');
  const sweepControls = document.getElementById('ref-sweep-controls');
  const rangeLabels = document.querySelectorAll('.ref-fb-range');
  const boxOnly = document.querySelector('.ref-fb-check');
  if (scaleControls) scaleControls.hidden = refViewMode !== 'scale';
  if (sweepControls) sweepControls.hidden = refViewMode !== 'sweep';
  rangeLabels.forEach(el => { el.hidden = refViewMode === 'sweep'; });
  if (boxOnly) boxOnly.hidden = refViewMode === 'sweep';
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
      saveSetting('ref.tuning', refTuning);
      renderRefFretboard();
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
    let e = Math.max(s + 1, Math.min(24, Number(end.value) || 15));
    refFbStart = s;
    refFbEnd = e;
    start.value = s;
    end.value = e;
    saveSetting('ref.fbStart', refFbStart);
    saveSetting('ref.fbEnd', refFbEnd);
    renderRefFretboard();
  };
  start.onchange = updateRange;
  end.onchange = updateRange;
  boxOnly.onchange = () => {
    refBoxOnly = boxOnly.checked;
    saveSetting('ref.boxOnly', refBoxOnly);
    renderRefFretboard();
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

// ---------------------------------------------------------------------------
// Sweep-picking library (movable chord-tone exercises)
// ---------------------------------------------------------------------------

// Map library string labels onto a Standard 6-string neck (low → high).
const SWEEP_NECK = [
  { key: 'E', label: 'E2' },
  { key: 'A', label: 'A2' },
  { key: 'D', label: 'D3' },
  { key: 'G', label: 'G3' },
  { key: 'B', label: 'B3' },
  { key: 'e', label: 'e4' },
];

function clampSweepInversion(patternId, stringSet, inv) {
  const opts = inversionOptionsFor(patternId, stringSet);
  if (!opts.length) return 0;
  const max = opts[opts.length - 1].inv;
  if (!Number.isFinite(inv) || inv < 0) return 0;
  if (inv > max) return max;
  return Math.floor(inv);
}

function selectedSweep() {
  const qualities = patternsForStringSet(refSweepStringSet);
  if (!qualities.some(p => p.id === refSweepPatternId)) {
    refSweepPatternId = qualities[0]?.id || 'maj';
  }
  refSweepInversion = clampSweepInversion(
    refSweepPatternId,
    refSweepStringSet,
    refSweepInversion
  );
  return getSweepPattern(refRoot, refSweepStringSet, refSweepPatternId, refSweepInversion);
}

function sweepHitMap(layout) {
  const map = new Map();
  if (!layout?.strings) return map;
  layout.strings.forEach(str => {
    str.frets.forEach(f => {
      map.set(`${str.note}:${f.fret}`, f);
    });
  });
  return map;
}

function renderSweepControls() {
  const el = document.getElementById('ref-sweep-controls');
  if (!el) return;
  const set = SWEEP_STRING_SETS[refSweepStringSet];
  const qualities = patternsForStringSet(refSweepStringSet);
  const selected = selectedSweep();
  const invOpts = selected?.inversions
    || inversionOptionsFor(refSweepPatternId, refSweepStringSet, refRoot);
  const invIdx = Math.max(0, invOpts.findIndex(o => o.inv === refSweepInversion));
  const invMeta = invOpts[invIdx] || invOpts[0];
  const canPrev = invIdx > 0;
  const canNext = invIdx < invOpts.length - 1;

  let html = '';
  html += `<div class="sweep-control-row">`;
  html += `<span class="sweep-control-label">Strings</span>`;
  html += `<div class="sweep-picker" role="group" aria-label="String set">`;
  html += SWEEP_SET_OPTIONS.map(n => {
    const info = SWEEP_STRING_SETS[n];
    return `<button type="button" class="sweep-btn${n === refSweepStringSet ? ' active' : ''}" data-sweep-set="${n}" title="${info.used}">${n}-string</button>`;
  }).join('');
  html += `</div>`;
  html += `<span class="sweep-set-hint">Uses <code>${set.used}</code></span>`;
  html += `</div>`;

  html += `<div class="sweep-control-row">`;
  html += `<span class="sweep-control-label">Pattern</span>`;
  html += `<div class="sweep-quality-picker" role="listbox" aria-label="Sweep pattern">`;
  qualities.forEach(item => {
    const short = item.join === '' ? `${refRoot}${item.name}` : `${refRoot} ${item.name}`;
    html += `<button type="button" class="sweep-quality-btn${item.id === refSweepPatternId ? ' active' : ''}" data-sweep-pattern="${item.id}" title="${item.formula}">${short}</button>`;
  });
  html += `</div>`;
  html += `</div>`;

  // Inversion toggle appears after a pattern is chosen.
  html += `<div class="sweep-control-row sweep-inv-row">`;
  html += `<span class="sweep-control-label">Inversion</span>`;
  html += `<div class="sweep-inv-toggle" role="group" aria-label="Toggle inversion">`;
  html += `<button type="button" class="sweep-btn sweep-inv-step" data-sweep-inv-dir="-1"${canPrev ? '' : ' disabled'} aria-label="Previous inversion">‹</button>`;
  html += `<div class="sweep-inv-status">`;
  html += `<strong>${invMeta?.label || 'Root'}</strong>`;
  if (invMeta?.bassLabel) html += `<span>${invMeta.bassLabel}</span>`;
  html += `<span class="sweep-inv-count">${invIdx + 1} / ${invOpts.length}</span>`;
  html += `</div>`;
  html += `<button type="button" class="sweep-btn sweep-inv-step" data-sweep-inv-dir="1"${canNext ? '' : ' disabled'} aria-label="Next inversion">›</button>`;
  html += `</div>`;
  html += `</div>`;

  el.innerHTML = html;
  el.querySelectorAll('[data-sweep-set]').forEach(btn => {
    btn.onclick = () => {
      refSweepStringSet = clampSweepSet(Number(btn.dataset.sweepSet));
      // Keep the same chord quality when it exists on the new string set.
      const qualities = patternsForStringSet(refSweepStringSet);
      if (!qualities.some(p => p.id === refSweepPatternId)) {
        refSweepPatternId = qualities[0]?.id || 'maj';
        saveSetting('ref.sweepPatternId', refSweepPatternId);
      }
      refSweepInversion = 0;
      saveSetting('ref.sweepStringSet', refSweepStringSet);
      saveSetting('ref.sweepInversion', refSweepInversion);
      renderScaleRef();
    };
  });
  el.querySelectorAll('[data-sweep-pattern]').forEach(btn => {
    btn.onclick = () => {
      refSweepPatternId = btn.dataset.sweepPattern || 'maj';
      refSweepInversion = 0; // start each pattern at root position
      saveSetting('ref.sweepPatternId', refSweepPatternId);
      saveSetting('ref.sweepInversion', refSweepInversion);
      renderScaleRef();
    };
  });
  el.querySelectorAll('[data-sweep-inv-dir]').forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      const dir = Number(btn.dataset.sweepInvDir) || 0;
      const nextIdx = Math.max(0, Math.min(invOpts.length - 1, invIdx + dir));
      refSweepInversion = invOpts[nextIdx]?.inv ?? 0;
      saveSetting('ref.sweepInversion', refSweepInversion);
      renderScaleRef();
    };
  });
}

// Paint the selected sweep onto the main full-neck fretboard (frets 0–24).
function renderSweepOnMainBoard() {
  const board = document.getElementById('ref-fretboard');
  if (!board) return;
  const selected = selectedSweep();
  const hits = sweepHitMap(selected?.layout);
  const start = 0;
  const end = 24;
  const count = end - start + 1;
  const middle = Math.floor(SWEEP_NECK.length / 2);

  board.style.gridTemplateColumns = `34px repeat(${count}, minmax(30px, 1fr))`;

  let html = '<div class="ref-fb-corner"></div>';
  for (let f = start; f <= end; f++) html += `<div class="ref-fb-fretnum">${f}</div>`;

  for (let s = SWEEP_NECK.length - 1; s >= 0; s--) {
    const { key, label } = SWEEP_NECK[s];
    html += `<div class="ref-fb-strlabel">${label}</div>`;
    for (let f = start; f <= end; f++) {
      const hit = hits.get(`${key}:${f}`);
      const cls = ['ref-fb-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && REF_FB_DOTS.includes(f) && s === middle) cls.push('inlay');
      let inner = '';
      if (hit) {
        const noteCls = ['ref-note', `deg-${hit.interval}`];
        if (hit.isRoot) noteCls.push('root');
        const tech = hit.tech ? ` · ${hit.tech}` : '';
        const title = `${hit.noteName} · ${INTERVAL_LABELS[hit.interval] || hit.interval}${tech} · step ${hit.order + 1}`;
        inner = `<span class="${noteCls.join(' ')}" title="${title}">${DEGREE_LABELS[hit.interval]}</span>`;
      }
      html += `<div class="${cls.join(' ')}">${inner}</div>`;
    }
  }
  board.innerHTML = html;

  const title = document.getElementById('ref-fb-title');
  const sub = document.getElementById('ref-fb-sub');
  const set = SWEEP_STRING_SETS[refSweepStringSet];
  if (title) title.textContent = selected
    ? `${selected.title} — ${selected.formula}`
    : `${refRoot} Sweep`;
  if (sub) {
    const inv = selected?.inversions?.find(o => o.inv === selected.inversion);
    sub.innerHTML = selected
      ? `<strong>${set.label}</strong> · <code>${set.used}</code> · <strong>${inv?.label || 'Root'}</strong>${inv?.bassLabel ? ` — ${inv.bassLabel}` : ''} · full neck 0–24`
      : 'Pick a sweep pattern';
  }

  const legend = document.getElementById('ref-fb-legend');
  if (legend && selected?.layout) {
    const seen = new Map();
    selected.layout.strings.forEach(str => str.frets.forEach(f => {
      if (!seen.has(f.interval)) seen.set(f.interval, f);
    }));
    const intervals = [...seen.keys()].sort((a, b) => a - b);
    legend.innerHTML = intervals.map(iv =>
      `<span class="ref-leg-item${iv === 0 ? ' root' : ''}">` +
      `<span class="ref-leg-swatch deg-${iv}"></span>` +
      `${DEGREE_LABELS[iv]} · ${INTERVAL_LABELS[iv] || iv}</span>`
    ).join('');
  } else if (legend) {
    legend.innerHTML = '';
  }
}

// Card body for sweep mode: tab + diminished guidance (fretboard lives above).
function renderSweepSection() {
  const selected = selectedSweep();
  const wh = DIMINISHED_PRIORITY.wholeHalf;
  const hw = DIMINISHED_PRIORITY.halfWhole;
  const seq = DIMINISHED_PRIORITY.sequence;

  let html = `<div class="sweep-section">`;
  html += `<div class="sweep-title">${refRoot}-Centered Sweep-Picking Library</div>`;
  html += `<p class="sweep-sub">321 authored close-position sweeps (3/4/5-string) with every chord-tone inversion. Pick a pattern on the fretboard above, then step through inversions. Shapes move with the Root tonal center.</p>`;

  if (selected) {
    const inv = selected.inversions.find(o => o.inv === selected.inversion);
    html += `<div class="sweep-card-title">${selected.title} <span class="sweep-formula">— ${selected.formula}</span></div>`;
    if (inv?.bassLabel) {
      html += `<div class="sweep-bass-line">${inv.label} — ${inv.bassLabel}</div>`;
    }
    html += `<div class="guitar-tab-wrap sweep-tab"><div class="tab-title">Sweep tab (h = hammer-on, p = pull-off)</div><pre>${selected.tab}</pre></div>`;
  }

  html += `<div class="sweep-dim-priority">`;
  html += `<h4>Diminished-scale priority patterns</h4>`;
  html += `<div class="sweep-dim-grid">`;
  html += `<div class="sweep-dim-block">`;
  html += `<div class="sweep-dim-kicker">For <strong>${refRoot} whole-half diminished</strong> riffs</div>`;
  html += `<pre class="sweep-dim-scale">${wh.scaleHint(refRoot)}</pre>`;
  html += `<div class="sweep-dim-label">Prioritize</div>`;
  html += `<ul>${wh.prioritizeLabels(refRoot).map(x => `<li>${x}</li>`).join('')}</ul>`;
  html += `</div>`;
  html += `<div class="sweep-dim-block">`;
  html += `<div class="sweep-dim-kicker">For <strong>${refRoot} half-whole diminished</strong> dominant riffs</div>`;
  html += `<pre class="sweep-dim-scale">${hw.scaleHint(refRoot)}</pre>`;
  html += `<div class="sweep-dim-label">Prioritize</div>`;
  html += `<ul>${hw.prioritizeLabels(refRoot).map(x => `<li>${x}</li>`).join('')}</ul>`;
  html += `</div>`;
  html += `</div>`;
  html += `<div class="sweep-dim-seq">`;
  html += `<div class="sweep-dim-label">${seq.title}</div>`;
  html += `<pre class="sweep-dim-scale">${seq.describe(refRoot)}</pre>`;
  html += `<p>${seq.note}</p>`;
  html += `</div>`;
  html += `</div>`;

  html += `</div>`;
  return html;
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

function noteSemi(note) {
  const p = parseNote(note);
  return p ? p.semi : null;
}

function triadQuality(notes) {
  const root = noteSemi(notes[0]);
  const third = noteSemi(notes[1]);
  const fifth = noteSemi(notes[2]);
  if (root == null || third == null || fifth == null) return { name: 'Unknown', suffix: '' };

  const thirdIv = (third - root + 12) % 12;
  const fifthIv = (fifth - root + 12) % 12;
  return TRIAD_QUALITIES[`${thirdIv},${fifthIv}`] || {
    name: `${INTERVAL_LABELS[thirdIv] || thirdIv} + ${INTERVAL_LABELS[fifthIv] || fifthIv}`,
    suffix: '',
  };
}

function diatonicTriadsForNotes(notes) {
  if (!notes || notes.length !== 7) return [];
  return notes.map((root, i) => {
    const tones = [root, notes[(i + 2) % 7], notes[(i + 4) % 7]];
    const quality = triadQuality(tones);
    const rootSemi = noteSemi(tones[0]);
    const formula = tones.map((tone, toneIndex) => {
      if (toneIndex === 0 || rootSemi == null) return 'R';
      const semi = noteSemi(tone);
      if (semi == null) return '?';
      const interval = (semi - rootSemi + 12) % 12;
      return DEGREE_LABELS[interval] || INTERVAL_LABELS[interval] || String(interval);
    });
    return {
      degree: DEGREE_ROMAN[i],
      root,
      tones,
      quality: quality.name,
      suffix: quality.suffix,
      formula,
      display: `${root} ${quality.name}`,
      symbol: `${root}${quality.suffix}`,
    };
  });
}

function modeAlterations(scaleName) {
  const major = SCALES[MAJOR_SCALE];
  const current = SCALES[scaleName];
  if (!major || !current || current.length !== 7) return [];

  return current.map((d, i) => {
    const diff = d[1] - major[i][1];
    if (!diff) return null;
    const degree = i + 1;
    if (diff === 1) return `#${degree}`;
    if (diff === -1) return `b${degree}`;
    if (diff === 2) return `##${degree}`;
    if (diff === -2) return `bb${degree}`;
    return `${diff > 0 ? '+' : ''}${diff} on ${degree}`;
  }).filter(Boolean);
}

function renderModalChordVisualizer() {
  const currentDef = SCALES[refScale];
  const modalNotes = getScaleNotes(refRoot, refScale);
  const majorNotes = getScaleNotes(refRoot, MAJOR_SCALE);
  if (!currentDef || currentDef.length !== 7 || !modalNotes || !majorNotes) return '';

  const majorTriads = diatonicTriadsForNotes(majorNotes);
  const modalTriads = diatonicTriadsForNotes(modalNotes);
  const alterations = modeAlterations(refScale);
  const changedRows = modalTriads
    .map((chord, i) => ({ chord, base: majorTriads[i] }))
    .filter(({ chord, base }) => chord.display !== base.display || chord.tones.join(',') !== base.tones.join(','));

  const modeLabel = refScale.replace(/\s*\(.*\)/, '');
  const alterationText = alterations.length ? alterations.join(', ') : 'no scale-degree changes';

  let html = `<div class="modal-chord-viz">`;
  html += `<div class="modal-chord-head">`;
  html += `<div>`;
  html += `<div class="modal-chord-kicker">Chords in this key/mode</div>`;
  html += `<h3>All triads in ${refRoot} ${modeLabel}</h3>`;
  html += `<p>Every chord below is built from the selected scale by stacking 1-3-5 from each interval. This is the full chord set for <strong>${refRoot} ${modeLabel}</strong>.</p>`;
  html += `</div>`;
  html += `<div class="modal-chord-count">7 triads</div>`;
  html += `</div>`;
  html += `<div class="modal-scale-flow">`;
  html += `<div><span>Selected scale</span><strong>${modalNotes.join(' ')}</strong></div>`;
  html += `<div><span>Compared with Major</span><strong>${alterationText}</strong></div>`;
  html += `</div>`;
  html += `<div class="modal-chord-grid">`;
  modalTriads.forEach((chord, i) => {
    const base = majorTriads[i];
    const changed = chord.display !== base.display || chord.tones.join(',') !== base.tones.join(',');
    const toneHtml = chord.tones.map((tone, toneIndex) => {
      const toneChanged = tone !== base.tones[toneIndex];
      return `<span class="modal-tone${toneChanged ? ' changed' : ''}">${tone}</span>`;
    }).join('');
    html += `<div class="modal-chord-card${changed ? ' changed' : ''}">`;
    html += `<div class="modal-card-top"><span class="modal-degree">${chord.degree}</span><span class="modal-card-interval">${INTERVAL_LABELS[currentDef[i][1]] || DEGREE_LABELS[currentDef[i][1]] || currentDef[i][1]}</span></div>`;
    html += `<div class="modal-card-note">${modalNotes[i]}</div>`;
    html += `<div class="modal-card-chord">${chord.display}</div>`;
    html += `<div class="modal-symbol">${chord.symbol}</div>`;
    html += `<div class="modal-card-label">notes</div>`;
    html += `<div class="modal-tones">${toneHtml}</div>`;
    html += `<div class="modal-card-label">formula</div>`;
    html += `<div class="modal-tones">${chord.formula.join(' - ')}</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  html += `<div class="modal-chord-scroll"><table class="modal-chord-table">`;
  html += `<tr><th>Interval</th><th>Scale degree</th><th>Chord triad</th><th>Notes in chord</th><th>Formula</th></tr>`;
  modalTriads.forEach((chord, i) => {
    const base = majorTriads[i];
    const changed = chord.display !== base.display || chord.tones.join(',') !== base.tones.join(',');
    const toneHtml = chord.tones.map((tone, toneIndex) => {
      const toneChanged = tone !== base.tones[toneIndex];
      return `<span class="modal-tone${toneChanged ? ' changed' : ''}">${tone}</span>`;
    }).join('');
    html += `<tr class="${changed ? 'changed' : ''}">`;
    html += `<td><span class="modal-degree">${chord.degree}</span></td>`;
    html += `<td><strong>${modalNotes[i]}</strong><span class="modal-tones">${INTERVAL_LABELS[currentDef[i][1]] || DEGREE_LABELS[currentDef[i][1]] || currentDef[i][1]}</span></td>`;
    html += `<td><strong>${chord.display}</strong><span class="modal-symbol">${chord.symbol}</span></td>`;
    html += `<td><span class="modal-tones">${toneHtml}</span></td>`;
    html += `<td><span class="modal-tones">${chord.formula.join(' - ')}</span></td>`;
    html += `</tr>`;
  });
  html += `</table></div>`;

  if (changedRows.length) {
    html += `<div class="modal-chord-summary">`;
    html += `Compared with ${refRoot} Major, modal-color triads are: ${changedRows.map(({ chord, base }) => `<strong>${chord.display}</strong> instead of ${base.display}`).join(' · ')}`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
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

// The initial "box" position for a modal root: a fret window anchored to the
// lowest occurrence of that root on the lowest string. Guitarists learn scales
// as movable box shapes, so this gives the player a concrete starting shape.
function computeRefBox(openMidis, modalRootSemi) {
  const lowOpen = openMidis[0];
  let rootFret = 0;
  while (((lowOpen + rootFret) % 12) !== modalRootSemi && rootFret < 12) rootFret++;
  return { start: rootFret, end: rootFret + REF_BOX_SPAN };
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
// In Sweep view, the same board shows the selected sweep shape instead.
function renderRefFretboard() {
  syncRefViewPicker();
  if (refViewMode === 'sweep') {
    renderSweepControls();
    renderSweepOnMainBoard();
    return;
  }

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
  const box = computeRefBox(openMidis, modalRootSemi);

  const start = Math.max(0, Math.min(24, refFbStart));
  const end = Math.max(start + 1, Math.min(24, refFbEnd));
  const count = end - start + 1;
  const middleString = Math.floor(strings.length / 2);

  board.style.gridTemplateColumns = `34px repeat(${count}, minmax(30px, 1fr))`;

  let html = '<div class="ref-fb-corner"></div>';
  for (let f = start; f <= end; f++) {
    html += `<div class="ref-fb-fretnum">${f}</div>`;
  }

  for (let s = strings.length - 1; s >= 0; s--) {
    const isTop = s === strings.length - 1;
    const isBottom = s === 0;
    html += `<div class="ref-fb-strlabel">${strings[s].note}${strings[s].oct}</div>`;
    for (let f = start; f <= end; f++) {
      const midi = openMidis[s] + f;
      const pc = midi % 12;
      const inScale = pcSet.has(pc);
      const interval = (pc - modalRootSemi + 12) % 12;
      const inBox = inScale && f >= box.start && f <= box.end;

      const cls = ['ref-fb-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && REF_FB_DOTS.includes(f) && s === middleString) cls.push('inlay');
      // Box band outline drawn with edge classes so the whole position reads as
      // one rectangle across every string.
      if (f >= box.start && f <= box.end) {
        cls.push('in-band');
        if (f === box.start) cls.push('band-l');
        if (f === box.end) cls.push('band-r');
        if (isTop) cls.push('band-t');
        if (isBottom) cls.push('band-b');
      }

      let inner = '';
      if (inScale && !(refBoxOnly && !inBox)) {
        const noteCls = ['ref-note', `deg-${interval}`];
        if (interval === 0) noteCls.push('root');
        if (!inBox) noteCls.push('dim');
        inner = `<span class="${noteCls.join(' ')}" title="${pcToNote[pc]} · ${INTERVAL_LABELS[interval] || interval}">${DEGREE_LABELS[interval]}</span>`;
      }
      html += `<div class="${cls.join(' ')}">${inner}</div>`;
    }
  }
  board.innerHTML = html;

  const choices = refModeChoices();
  const active = choices[refModeIndex] || {};
  const modeName = active.name ? active.name.replace(/\s*\(.*\)/, '') : `degree ${refModeIndex + 1}`;
  const sub = document.getElementById('ref-fb-sub');
  const title = document.getElementById('ref-fb-title');
  if (title) title.textContent = `${refRoot} ${refScale} — ${refTuning}`;
  if (sub) {
    sub.innerHTML = `Tonal centre <strong>${active.note || refRoot} ${modeName}</strong> · ` +
      `box at frets ${box.start}–${box.end} · every in-key note coloured by interval`;
  }
  renderRefLegend(pcSet, modalRootSemi);
}

function renderScaleRef() {
  const card = document.getElementById('ref-card');
  const notes = getScaleNotes(refRoot, refScale);
  if (!notes) { card.innerHTML = '<p style="color:var(--err)">Could not compute scale</p>'; return; }

  const def = SCALES[refScale];
  const stepPat = scaleStepPattern(refScale);

  let html = `<h3 style="margin-bottom:12px;color:var(--accent)">${refRoot} ${refScale}</h3>`;
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

  if (refScale === MAJOR_SCALE && notes.length === 7) {
    html += `<div class="chord-row"><strong>Diatonic Triads:</strong> <span>`;
    html += notes.map((n, i) => DEGREE_ROMAN[i] + ': ' + n + TRIAD_SUFFIX[i]).join('  ');
    html += `</span></div>`;
    html += `<div class="chord-row"><strong>Diatonic 7ths:</strong> <span>`;
    html += notes.map((n, i) => DEGREE_ROMAN[i] + ': ' + n + SEVENTH_SUFFIX[i]).join('  ');
    html += `</span></div>`;
  }

  if (refViewMode === 'scale') {
    html += renderModalChordVisualizer();
  } else {
    html += renderSweepSection();
  }

  card.innerHTML = html;
  renderRefFretboard();
  renderRefModes();
}

export { initScaleRef };
