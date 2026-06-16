import { parseNote, ROOTS, INTERVAL_LABELS } from './theory.js';
import { SCALES, getScaleNotes, groupedScaleEntries, scaleStepPattern } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';

const DEGREE_ROMAN = ['I','II','III','IV','V','VI','VII'];
const TRIAD_SUFFIX = ['','m','m','','','m','dim'];
const SEVENTH_SUFFIX = ['maj7','m7','m7','maj7','7','m7','m7b5'];
const KEY_SIGS = {
  'C':'none','G':'1#','D':'2#','A':'3#','E':'4#','B':'5#','F#':'6#','Gb':'6b',
  'Db':'5b','Ab':'4b','Eb':'3b','Bb':'2b','F':'1b',
  'C#':'7#','Cb':'7b'
};

let refRoot = 'C';
let refScale = 'Major (Ionian)';
let refContextSubscribed = false;

function initScaleRef() {
  const rootScroll = document.getElementById('sl-ref-root');
  // The shared musical context is the source of truth so the reference opens in
  // whatever key/mode the player picked elsewhere.
  const ctx = getContext();
  refRoot = ctx.root;
  refScale = ctx.scale;
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
  renderScaleRef();

  if (!refContextSubscribed) {
    refContextSubscribed = true;
    subscribeContext(c => {
      if (c.root === refRoot && c.scale === refScale) return;
      refRoot = c.root;
      refScale = c.scale;
      syncRefSelection();
      renderScaleRef();
    });
  }
}

function syncRefSelection() {
  document.querySelectorAll('#sl-ref-root .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === refRoot));
  document.querySelectorAll('#sl-ref-scale .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === refScale));
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
      saveSetting('ref.scale', refScale);
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

function compute3NPS(rootStr, scaleName) {
  const def = SCALES[scaleName];
  if (!def) return null;
  const pattern = compute3NPSFromSemis(rootStr, def.map(d => d[1]));
  if (!pattern) return null;
  return pattern.map(s => ({ label: s.label, frets: s.frets.map(f => f.fret) }));
}

function render3NPSTab(rootStr, scaleName) {
  const pattern = compute3NPS(rootStr, scaleName);
  if (!pattern) return '';
  const reversed = [...pattern].reverse();
  let tab = '';
  reversed.forEach(s => {
    const fretStr = s.frets.map(f => String(f).padStart(2, '-')).join('---');
    tab += s.label + '|---' + fretStr + '---|\n';
  });
  return tab;
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

  if (refScale === 'Major (Ionian)' && notes.length === 7) {
    html += `<div class="chord-row"><strong>Diatonic Triads:</strong> <span>`;
    html += notes.map((n, i) => DEGREE_ROMAN[i] + ': ' + n + TRIAD_SUFFIX[i]).join('  ');
    html += `</span></div>`;
    html += `<div class="chord-row"><strong>Diatonic 7ths:</strong> <span>`;
    html += notes.map((n, i) => DEGREE_ROMAN[i] + ': ' + n + SEVENTH_SUFFIX[i]).join('  ');
    html += `</span></div>`;
  }

  const tabStr = render3NPSTab(refRoot, refScale);
  if (tabStr) {
    const rootP = parseNote(refRoot);
    const startFret = ((rootP.semi - 4) % 12 + 12) % 12;
    html += `<div class="guitar-tab-wrap">`;
    html += `<div class="tab-title">3-Notes-Per-String Pattern (root at fret ${startFret} on low E)</div>`;
    html += `<pre>${tabStr}</pre>`;
    html += `</div>`;
  }

  card.innerHTML = html;
  renderRefModes();
}

export { initScaleRef };
