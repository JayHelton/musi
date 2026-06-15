import { parseNote, ROOTS, INTERVAL_LABELS } from './theory.js';
import { SCALES, getScaleNotes, scaleStepPattern } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';

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

function initScaleRef() {
  const rootScroll = document.getElementById('sl-ref-root');
  refRoot = getSetting('ref.root', refRoot, ROOTS);
  refScale = getSetting('ref.scale', refScale, Object.keys(SCALES));
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
      renderScaleRef();
    };
    rootScroll.appendChild(div);
  });
  buildScaleList();
  renderScaleRef();
}

function buildScaleList() {
  const container = document.getElementById('sl-ref-scale');
  container.innerHTML = '';
  Object.keys(SCALES).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === refScale ? ' active' : '');
    div.dataset.val = name;
    div.textContent = name;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      refScale = name;
      saveSetting('ref.scale', refScale);
      renderScaleRef();
    };
    container.appendChild(div);
  });
}

function compute3NPS(rootStr, scaleName) {
  const r = parseNote(rootStr);
  if (!r) return null;
  const def = SCALES[scaleName];
  if (!def) return null;

  const semis = def.map(d => d[1]);
  const allSemis = [];
  for (let oct = 0; oct < 5; oct++)
    semis.forEach(s => allSemis.push(s + oct * 12));

  const rootFret = ((r.semi - 4) % 12 + 12) % 12;
  const openStrings = [0, 5, 10, 15, 19, 24];
  const labels = ['E','A','D','G','B','e'];
  const result = [];
  let ni = 0;

  for (let s = 0; s < 6; s++) {
    const frets = [];
    for (let n = 0; n < 3; n++) {
      if (ni >= allSemis.length) break;
      frets.push(rootFret + allSemis[ni] - openStrings[s]);
      ni++;
    }
    result.push({ label: labels[s], frets });
  }
  return result;
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
}

export { initScaleRef };
