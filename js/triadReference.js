import { parseNote, spellNote, ROOTS, TUNINGS } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import {
  initSweepRef,
  renderSweepRef,
  playSweepRef,
  stopSweepRef,
  syncSweepPlayButton,
} from './sweepReference.js';

// Triads Reference — maps every closed triad voicing for a selected root on a
// chosen 3-string set, across every tuning Musi supports. All qualities share
// one stacked visual (Major / Minor / Dim / Aug), each row coloured and wired
// with shape outlines like classic "triads for soloing" charts.

// Quality colors come from CSS custom properties (--triad-*) so the Atomic
// Purple / GBC theme can re-token them. JS only picks the variable name.
export const TRIAD_QUALITIES = [
  {
    id: 'major',
    name: 'Major',
    sym: '',
    displaySym: '',
    tones: [[0, 0, 'R'], [2, 4, '3'], [4, 7, '5']],
    colorVar: '--triad-major',
  },
  {
    id: 'minor',
    name: 'Minor',
    sym: 'm',
    displaySym: 'm',
    tones: [[0, 0, 'R'], [2, 3, 'b3'], [4, 7, '5']],
    colorVar: '--triad-minor',
  },
  {
    id: 'diminished',
    name: 'Diminished',
    sym: '°',
    displaySym: '°',
    tones: [[0, 0, 'R'], [2, 3, 'b3'], [4, 6, 'b5']],
    colorVar: '--triad-diminished',
  },
  {
    id: 'augmented',
    name: 'Augmented',
    sym: '+',
    displaySym: '+',
    tones: [[0, 0, 'R'], [2, 4, '3'], [4, 8, '#5']],
    colorVar: '--triad-augmented',
  },
  {
    id: 'sus2',
    name: 'Sus 2',
    sym: 'sus2',
    displaySym: 'sus2',
    tones: [[0, 0, 'R'], [1, 2, '2'], [4, 7, '5']],
    colorVar: '--triad-sus2',
    optional: true,
  },
  {
    id: 'sus4',
    name: 'Sus 4',
    sym: 'sus4',
    displaySym: '4',
    tones: [[0, 0, 'R'], [3, 5, '4'], [4, 7, '5']],
    colorVar: '--triad-sus4',
    optional: true,
  },
];

function qualityColor(q) {
  return `var(${q.colorVar})`;
}

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const MAX_FRET = 24;
const DEFAULT_MAX_SPAN = 4;

let trRoot = 'C';
let trTuning = 'Standard';
let trStringSet = 0; // index into adjacent 3-string sets (0 = lowest three)
let trFbStart = 0;
let trFbEnd = 15;
let trMaxSpan = DEFAULT_MAX_SPAN;
let trShowSus = false;
let trViewMode = 'triads'; // 'triads' | 'sweep'
let trContextSubscribed = false;
let trControlsWired = false;
let trViewWired = false;
let trOscillators = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function tuningStrings(name) {
  return TUNINGS[name] || TUNINGS.Standard || [];
}

function openMidisFor(tuningName) {
  return tuningStrings(tuningName).map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

/** Adjacent 3-string sets for the active tuning, low→high string indices. */
export function stringSetsForTuning(tuningName) {
  const strings = tuningStrings(tuningName);
  const sets = [];
  for (let i = 0; i <= strings.length - 3; i++) {
    const slice = strings.slice(i, i + 3);
    const label = slice.map(s => s.note).join('–');
    // Guitar convention: "1–2–3" = highest three strings.
    const highFirst = [...slice].reverse().map(s => s.note).join('–');
    const fromHigh = strings.length - (i + 3); // 0 = highest set
    sets.push({
      index: i,
      stringIndices: [i, i + 1, i + 2],
      label,
      highFirstLabel: highFirst,
      fromHigh,
      isHighest: i === strings.length - 3,
      isLowest: i === 0,
    });
  }
  return sets;
}

/**
 * Find every closed 3-note voicing of `toneDefs` on the given open midis
 * (one tone per string, fret span ≤ maxSpan).
 */
export function findClosedTriadVoicings(setOpenMidis, rootSemi, toneDefs, {
  maxFret = 15,
  minFret = 0,
  maxSpan = DEFAULT_MAX_SPAN,
} = {}) {
  const tones = toneDefs.map(([, so, label]) => ({
    pc: (rootSemi + (so % 12) + 12) % 12,
    interval: (so % 12 + 12) % 12,
    label,
  }));
  const n = setOpenMidis.length;
  if (n !== 3 || tones.length !== 3) return [];

  const results = [];
  const seen = new Set();

  for (const perm of permutations(tones)) {
    const candidates = setOpenMidis.map((open, si) => {
      const frets = [];
      for (let f = Math.max(0, minFret); f <= maxFret; f++) {
        if ((open + f) % 12 === perm[si].pc) frets.push(f);
      }
      return frets;
    });

    const walk = (si, chosen) => {
      if (si === n) {
        const frets = chosen.map(c => c.fret);
        const span = Math.max(...frets) - Math.min(...frets);
        if (span > maxSpan) return;
        const key = frets.join(',');
        if (seen.has(key)) return;
        seen.add(key);

        const withMidi = chosen.map((c, i) => ({
          ...c,
          midi: setOpenMidis[i] + c.fret,
        }));
        const sorted = [...withMidi].sort((a, b) => a.midi - b.midi);
        const bassIv = sorted[0].interval;
        let inv = '2nd';
        if (bassIv === 0) inv = 'R';
        else if (bassIv === 2 || bassIv === 3 || bassIv === 4 || bassIv === 5) inv = '1st';

        results.push({
          notes: chosen.map(c => ({ ...c })),
          inv,
          bassIv,
          meanFret: frets.reduce((a, b) => a + b, 0) / frets.length,
          minFret: Math.min(...frets),
          maxFret: Math.max(...frets),
        });
        return;
      }
      for (const f of candidates[si]) {
        chosen.push({ string: si, fret: f, ...perm[si] });
        walk(si + 1, chosen);
        chosen.pop();
      }
    };
    walk(0, []);
  }

  results.sort((a, b) => a.meanFret - b.meanFret || a.minFret - b.minFret);
  return results;
}

function activeQualities() {
  return TRIAD_QUALITIES.filter(q => trShowSus || !q.optional);
}

function chordSymbol(root, quality) {
  if (quality.id === 'diminished') return `${root}°`;
  if (quality.id === 'augmented') return `${root}+`;
  if (quality.id === 'sus4') return `${root}4`;
  return `${root}${quality.displaySym}`;
}

function migrateTriadViewMode() {
  const saved = getSetting('triadref.viewMode', null, ['triads', 'sweep']);
  if (saved) {
    trViewMode = saved;
    return;
  }
  const legacyView = getSetting('ref.viewMode', null, ['scale', 'sweep']);
  const legacySubview = getSetting('subview.scaleref', null);
  if (legacyView === 'sweep' || legacySubview === 'sweeps') trViewMode = 'sweep';
}

function syncTriadViewUi() {
  document.querySelectorAll('#triad-view-picker .ref-view-btn').forEach(btn => {
    const mode = btn.dataset.triadView === 'sweep' ? 'sweep' : 'triads';
    btn.classList.toggle('active', mode === trViewMode);
  });
  const triadMap = document.getElementById('triad-map');
  const sweepPanel = document.getElementById('triad-sweep-panel');
  const triadOnlyOpts = document.getElementById('triad-only-opts');
  const stringSetSidebar = document.getElementById('triad-stringset-sidebar');
  if (triadMap) triadMap.hidden = trViewMode === 'sweep';
  if (sweepPanel) sweepPanel.hidden = trViewMode !== 'sweep';
  if (triadOnlyOpts) triadOnlyOpts.hidden = trViewMode === 'sweep';
  if (stringSetSidebar) stringSetSidebar.hidden = trViewMode === 'sweep';
  const nav = document.getElementById('triad-sweep-nav');
  if (nav) nav.hidden = trViewMode !== 'sweep';
}

function wireTriadViewPicker() {
  if (trViewWired) return;
  const picker = document.getElementById('triad-view-picker');
  if (!picker) return;
  trViewWired = true;
  picker.querySelectorAll('.ref-view-btn').forEach(btn => {
    btn.onclick = () => {
      trViewMode = btn.dataset.triadView === 'sweep' ? 'sweep' : 'triads';
      saveSetting('triadref.viewMode', trViewMode);
      saveSetting('subview.triadsref', trViewMode === 'sweep' ? 'sweeps' : 'triads');
      stopTriadRef();
      renderTriadRef();
    };
  });
}

function syncSelection() {
  document.querySelectorAll('#sl-triad-root .sl-item').forEach(el => {
    el.classList.toggle('active', el.dataset.val === trRoot);
  });
  document.querySelectorAll('#sl-triad-tuning .sl-item').forEach(el => {
    el.classList.toggle('active', el.dataset.val === trTuning);
  });
  document.querySelectorAll('#sl-triad-stringset .sl-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.val) === trStringSet);
  });
}

function buildRootList() {
  const rootScroll = document.getElementById('sl-triad-root');
  if (!rootScroll) return;
  rootScroll.innerHTML = '';
  ROOTS.forEach(r => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (r === trRoot ? ' active' : '');
    div.dataset.val = r;
    div.textContent = r;
    div.onclick = () => {
      trRoot = r;
      saveSetting('triadref.root', trRoot);
      setContext({ root: trRoot }, 'triadref');
      syncSelection();
      renderTriadRef();
    };
    rootScroll.appendChild(div);
  });
}

function buildTuningList() {
  const container = document.getElementById('sl-triad-tuning');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(TUNINGS).forEach(name => {
    const strings = TUNINGS[name] || [];
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === trTuning ? ' active' : '');
    div.dataset.val = name;
    div.innerHTML = `<span>${escapeHtml(name)}</span><span class="sl-item-sub">${strings.length}str</span>`;
    div.onclick = () => {
      trTuning = name;
      saveSetting('triadref.tuning', trTuning);
      // Keep highest string set when possible after retune.
      const sets = stringSetsForTuning(trTuning);
      const preferHigh = sets.find(s => s.isHighest);
      trStringSet = preferHigh ? preferHigh.index : 0;
      saveSetting('triadref.stringSet', trStringSet);
      buildStringSetList();
      syncSelection();
      renderTriadRef();
    };
    container.appendChild(div);
  });
}

function buildStringSetList() {
  const container = document.getElementById('sl-triad-stringset');
  if (!container) return;
  const sets = stringSetsForTuning(trTuning);
  if (!sets.some(s => s.index === trStringSet)) {
    const high = sets.find(s => s.isHighest);
    trStringSet = high ? high.index : 0;
  }
  container.innerHTML = '';
  // Present highest-first (soloing string sets first), matching the reference image.
  [...sets].reverse().forEach(set => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (set.index === trStringSet ? ' active' : '');
    div.dataset.val = String(set.index);
    const tag = set.isHighest ? 'top' : set.isLowest ? 'low' : '';
    div.innerHTML = `<span>${escapeHtml(set.highFirstLabel)}</span>` +
      (tag ? `<span class="sl-item-sub">${tag}</span>` : '');
    div.onclick = () => {
      trStringSet = set.index;
      saveSetting('triadref.stringSet', trStringSet);
      syncSelection();
      renderTriadRef();
    };
    container.appendChild(div);
  });
}

function wireControls() {
  if (trControlsWired) return;
  trControlsWired = true;

  const startEl = document.getElementById('triad-fb-start');
  const endEl = document.getElementById('triad-fb-end');
  const spanEl = document.getElementById('triad-fb-span');
  const susEl = document.getElementById('triad-show-sus');
  const playEl = document.getElementById('triad-fb-play');

  if (startEl) {
    startEl.value = String(trFbStart);
    startEl.onchange = () => {
      trFbStart = Math.max(0, Math.min(MAX_FRET, Number(startEl.value) || 0));
      if (trFbEnd <= trFbStart) trFbEnd = Math.min(MAX_FRET, trFbStart + 1);
      saveSetting('triadref.fbStart', trFbStart);
      saveSetting('triadref.fbEnd', trFbEnd);
      if (endEl) endEl.value = String(trFbEnd);
      renderTriadRef();
    };
  }
  if (endEl) {
    endEl.value = String(trFbEnd);
    endEl.onchange = () => {
      trFbEnd = Math.max(1, Math.min(MAX_FRET, Number(endEl.value) || 15));
      if (trFbEnd <= trFbStart) trFbStart = Math.max(0, trFbEnd - 1);
      saveSetting('triadref.fbStart', trFbStart);
      saveSetting('triadref.fbEnd', trFbEnd);
      if (startEl) startEl.value = String(trFbStart);
      renderTriadRef();
    };
  }
  if (spanEl) {
    spanEl.value = String(trMaxSpan);
    spanEl.onchange = () => {
      trMaxSpan = Math.max(2, Math.min(7, Number(spanEl.value) || DEFAULT_MAX_SPAN));
      saveSetting('triadref.maxSpan', trMaxSpan);
      renderTriadRef();
    };
  }
  if (susEl) {
    susEl.checked = trShowSus;
    susEl.onchange = () => {
      trShowSus = !!susEl.checked;
      saveSetting('triadref.showSus', trShowSus);
      renderTriadRef();
    };
  }
  if (playEl) {
    playEl.onclick = () => {
      if (trViewMode === 'sweep') {
        const playing = playEl.classList.contains('playing');
        if (playing) stopSweepRef();
        else playSweepRef();
        return;
      }
      playAllTriads();
    };
  }
}

/** SVG fretboard row for one quality — notes + connecting shape polygons. */
function renderQualityRowSvg(quality, voicings, {
  start, end, label,
}) {
  const color = qualityColor(quality);
  const fretCount = end - start + 1;
  const labelW = 44;
  const nameW = 72;
  const cellW = 36;
  const padX = 10;
  const padY = 14;
  const strGap = 28;
  const boardW = fretCount * cellW;
  const boardH = padY * 2 + strGap * 2;
  const totalW = labelW + boardW + nameW;
  const totalH = boardH + 18; // fret numbers

  const xForFret = (f) => labelW + (f - start + 0.5) * cellW;
  const yForString = (si) => {
    // Display high→low (top of SVG = highest string in the set = index 2)
    const displayRow = 2 - si;
    return 18 + padY + displayRow * strGap;
  };

  let svg = `<svg class="triad-row-svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" role="img" aria-label="${escapeHtml(label)} triad patterns">`;

  // Fret numbers
  for (let f = start; f <= end; f++) {
    const x = xForFret(f);
    svg += `<text class="triad-fretnum" x="${x}" y="11" text-anchor="middle">${f}</text>`;
  }

  // Board background
  svg += `<rect class="triad-board-bg" x="${labelW}" y="18" width="${boardW}" height="${boardH}" rx="6"/>`;

  // Fret lines + inlays
  for (let f = start; f <= end; f++) {
    const x = labelW + (f - start) * cellW;
    if (f === 0 || (start === 0 && f === start)) {
      svg += `<line class="triad-nut" x1="${labelW + 2}" y1="22" x2="${labelW + 2}" y2="${18 + boardH - 4}"/>`;
    }
    svg += `<line class="triad-fretline" x1="${x}" y1="22" x2="${x}" y2="${18 + boardH - 4}"/>`;
    if (FB_DOTS.includes(f) && f > 0) {
      const cx = xForFret(f);
      svg += `<circle class="triad-inlay" cx="${cx}" cy="${18 + boardH / 2}" r="2.5"/>`;
    }
  }
  // trailing fret line
  svg += `<line class="triad-fretline" x1="${labelW + boardW}" y1="22" x2="${labelW + boardW}" y2="${18 + boardH - 4}"/>`;

  // Strings
  for (let si = 0; si < 3; si++) {
    const y = yForString(si);
    svg += `<line class="triad-string" x1="${labelW + 4}" y1="${y}" x2="${labelW + boardW - 4}" y2="${y}"/>`;
  }

  // String labels (high→low on the left)
  const sets = stringSetsForTuning(trTuning);
  const set = sets.find(s => s.index === trStringSet) || sets[0];
  const strings = tuningStrings(trTuning);
  if (set) {
    for (let si = 2; si >= 0; si--) {
      const abs = set.stringIndices[si];
      const note = strings[abs] ? `${strings[abs].note}` : '';
      const y = yForString(si);
      svg += `<text class="triad-strlabel" x="${labelW - 8}" y="${y + 3.5}" text-anchor="end">${escapeHtml(note)}</text>`;
    }
  }

  // Shape polygons + edges (behind notes). Clickable per-voicing.
  voicings.forEach((v, vi) => {
    const pts = v.notes.map(n => `${xForFret(n.fret)},${yForString(n.string)}`).join(' ');
    svg += `<polygon class="triad-shape" data-vi="${vi}" points="${pts}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
    const ordered = [...v.notes].sort((a, b) => a.string - b.string);
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % ordered.length];
      svg += `<line class="triad-shape-edge" x1="${xForFret(a.fret)}" y1="${yForString(a.string)}" x2="${xForFret(b.fret)}" y2="${yForString(b.string)}" stroke="${color}" stroke-width="1.55" stroke-opacity="0.9"/>`;
    }
  });

  // Unique note dots (shared across overlapping shapes)
  const noteMap = new Map();
  voicings.forEach(v => {
    v.notes.forEach(n => {
      const key = `${n.string}:${n.fret}`;
      if (!noteMap.has(key)) noteMap.set(key, n);
    });
  });
  for (const n of noteMap.values()) {
    const cx = xForFret(n.fret);
    const cy = yForString(n.string);
    const isRoot = n.interval === 0;
    const r = isRoot ? 11 : 10;
    svg += `<g class="triad-note${isRoot ? ' root' : ''}" data-fret="${n.fret}" data-string="${n.string}">`;
    svg += `<circle class="triad-note-dot" cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    svg += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" class="triad-note-label">${escapeHtml(n.label)}</text>`;
    svg += `</g>`;
  }

  // Quality name on the right
  svg += `<text class="triad-row-name" x="${labelW + boardW + 14}" y="${18 + boardH / 2 + 4}" fill="${color}">${escapeHtml(label)}</text>`;

  svg += `</svg>`;
  return svg;
}

function renderTriadMap() {
  const host = document.getElementById('triad-map');
  if (!host) return;

  const rootP = parseNote(trRoot);
  if (!rootP) {
    host.innerHTML = '<p class="triad-empty">Pick a root.</p>';
    return;
  }

  const sets = stringSetsForTuning(trTuning);
  const set = sets.find(s => s.index === trStringSet) || sets[sets.length - 1];
  if (!set) {
    host.innerHTML = '<p class="triad-empty">This tuning needs at least 3 strings.</p>';
    return;
  }

  const allOpen = openMidisFor(trTuning);
  const setOpen = set.stringIndices.map(i => allOpen[i]);
  const start = Math.max(0, Math.min(MAX_FRET, trFbStart));
  const end = Math.max(start + 1, Math.min(MAX_FRET, trFbEnd));
  const qualities = activeQualities();

  let html = `<div class="triad-map-stack">`;
  qualities.forEach(q => {
    const voicings = findClosedTriadVoicings(setOpen, rootP.semi, q.tones, {
      minFret: start,
      maxFret: end,
      maxSpan: trMaxSpan,
    }).filter(v => v.minFret >= start && v.maxFret <= end);

    const label = chordSymbol(trRoot, q);
    html += `<div class="triad-row" data-quality="${q.id}" style="--triad-color:${qualityColor(q)}">`;
    html += `<div class="triad-row-scroll">`;
    html += renderQualityRowSvg(q, voicings, { start, end, label });
    html += `</div>`;
    html += `<div class="triad-row-meta">`;
    html += `<button type="button" class="btn sm triad-row-play" data-quality="${q.id}" aria-label="Play ${escapeHtml(label)}">▶</button>`;
    html += `<span class="triad-row-count">${voicings.length} shape${voicings.length === 1 ? '' : 's'}</span>`;
    html += `</div>`;
    html += `</div>`;
  });
  html += `</div>`;

  host.innerHTML = html;

  host.querySelectorAll('.triad-row-play').forEach(btn => {
    btn.onclick = () => {
      const q = TRIAD_QUALITIES.find(x => x.id === btn.dataset.quality);
      if (q) playTriadQuality(q);
    };
  });

  // Click a shape polygon to play that voicing
  host.querySelectorAll('.triad-shape').forEach(poly => {
    poly.style.cursor = 'pointer';
    poly.onclick = () => {
      const row = poly.closest('.triad-row');
      const q = TRIAD_QUALITIES.find(x => x.id === row?.dataset.quality);
      const vi = Number(poly.dataset.vi);
      if (!q) return;
      const voicings = findClosedTriadVoicings(setOpen, rootP.semi, q.tones, {
        minFret: start, maxFret: end, maxSpan: trMaxSpan,
      }).filter(v => v.minFret >= start && v.maxFret <= end);
      const v = voicings[vi];
      if (v) playVoicing(setOpen, v);
    };
  });
}

function renderTriadInfo() {
  const card = document.getElementById('triad-info-card');
  if (!card) return;
  const rootP = parseNote(trRoot);
  const sets = stringSetsForTuning(trTuning);
  const set = sets.find(s => s.index === trStringSet) || sets[sets.length - 1];
  if (!rootP || !set) {
    card.innerHTML = '<p style="color:var(--muted)">Pick a root &amp; tuning.</p>';
    return;
  }

  const allOpen = openMidisFor(trTuning);
  const setOpen = set.stringIndices.map(i => allOpen[i]);
  const start = Math.max(0, Math.min(MAX_FRET, trFbStart));
  const end = Math.max(start + 1, Math.min(MAX_FRET, trFbEnd));

  let html = `<div class="triad-info-head">`;
  html += `<h3>${escapeHtml(trRoot)} triads</h3>`;
  html += `<p>Closed voicings on <strong>${escapeHtml(set.highFirstLabel)}</strong> · ${escapeHtml(trTuning)}</p>`;
  html += `</div>`;
  html += `<p class="triad-info-blurb">Every shape is one note per string spanning at most ${trMaxSpan} frets — the classic movable triad patterns used for soloing and comping. Click a shape to hear it.</p>`;

  html += `<table class="ref-table triad-info-table"><tr><th>Quality</th><th>Symbol</th><th>Notes</th><th>Formula</th><th>Shapes</th></tr>`;
  activeQualities().forEach(q => {
    const notes = q.tones.map(([lo, so]) => spellNote(rootP.li, rootP.semi, lo, so % 12));
    const formula = q.tones.map(([, , label]) => label).join(' – ');
    const count = findClosedTriadVoicings(setOpen, rootP.semi, q.tones, {
      minFret: start, maxFret: end, maxSpan: trMaxSpan,
    }).filter(v => v.minFret >= start && v.maxFret <= end).length;
    html += `<tr data-quality="${q.id}" style="--triad-color:${qualityColor(q)}">`;
    html += `<td><span class="triad-swatch"></span>${escapeHtml(q.name)}</td>`;
    html += `<td class="triad-symbol">${escapeHtml(chordSymbol(trRoot, q))}</td>`;
    html += `<td>${notes.map(n => `<strong>${escapeHtml(n)}</strong>`).join(' · ')}</td>`;
    html += `<td>${escapeHtml(formula)}</td>`;
    html += `<td>${count}</td>`;
    html += `</tr>`;
  });
  html += `</table>`;

  card.innerHTML = html;
}

function renderHeader() {
  const title = document.getElementById('triad-fb-title');
  const sub = document.getElementById('triad-fb-sub');
  const sets = stringSetsForTuning(trTuning);
  const set = sets.find(s => s.index === trStringSet) || sets[sets.length - 1];
  if (title) title.textContent = `${trRoot} triad patterns`;
  if (sub) {
    const setLabel = set ? set.highFirstLabel : '—';
    sub.innerHTML = `<strong>${escapeHtml(trTuning)}</strong> · strings ${escapeHtml(setLabel)} · frets ${trFbStart}–${trFbEnd}`;
  }
}

function renderTriadRef() {
  syncTriadViewUi();
  if (trViewMode === 'sweep') {
    renderSweepRef(trRoot);
    syncSweepPlayButton();
  } else {
    renderHeader();
    renderTriadMap();
    renderTriadInfo();
    const playEl = document.getElementById('triad-fb-play');
    if (playEl) {
      playEl.setAttribute('aria-label', 'Play all triad qualities');
      playEl.innerHTML = '&#9654; Play';
      playEl.classList.remove('playing');
    }
  }
  document.dispatchEvent(new CustomEvent('musi:triadref-change', {
    detail: { root: trRoot, tuning: trTuning, stringSet: trStringSet, viewMode: trViewMode },
  }));
}

function stopTriadAudio() {
  trOscillators.forEach(o => { try { o.stop(); } catch (_) {} });
  trOscillators = [];
}

function playMidiNotes(midis, { stagger = 0.08, hold = 1.4 } = {}) {
  stopTriadAudio();
  ensureAudio();
  const now = audioCtx.currentTime;
  const vol = 0.16 / Math.max(1, midis.length);
  midis.forEach((midi, i) => {
    const t0 = now + i * stagger;
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(midi);
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 5, 5000), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2, 2500), t0 + 0.8);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    gain.gain.setValueAtTime(vol * 0.75, t0 + hold);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + hold + 0.5);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(t0);
    osc2.start(t0);
    osc.stop(t0 + hold + 0.55);
    osc2.stop(t0 + hold + 0.55);
    trOscillators.push(osc, osc2);
  });
}

function playVoicing(setOpen, voicing) {
  const midis = voicing.notes
    .map(n => setOpen[n.string] + n.fret)
    .sort((a, b) => a - b);
  playMidiNotes(midis, { stagger: 0.05, hold: 1.2 });
}

function playTriadQuality(quality) {
  const rootP = parseNote(trRoot);
  if (!rootP) return;
  const baseMidi = 12 * (3 + 1) + rootP.semi;
  const midis = quality.tones.map(([, so]) => baseMidi + (so % 12));
  playMidiNotes(midis, { stagger: 0.1, hold: 1.6 });
}

function playAllTriads() {
  const qualities = activeQualities();
  stopTriadAudio();
  ensureAudio();
  const rootP = parseNote(trRoot);
  if (!rootP) return;
  const baseMidi = 12 * (3 + 1) + rootP.semi;
  const now = audioCtx.currentTime;
  let t = now;
  qualities.forEach(q => {
    const midis = q.tones.map(([, so]) => baseMidi + (so % 12));
    const vol = 0.14 / midis.length;
    midis.forEach((midi, i) => {
      const t0 = t + i * 0.04;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiFreq(midi);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      osc.connect(gain);
      gain.connect(getAnalyserDestination());
      osc.start(t0);
      osc.stop(t0 + 1);
      trOscillators.push(osc);
    });
    t += 1.05;
  });
}

export function initTriadRef() {
  const rootScroll = document.getElementById('sl-triad-root');
  if (!rootScroll) return;

  migrateTriadViewMode();
  initSweepRef({ onChange: () => renderTriadRef() });

  const ctx = getContext();
  trRoot = ROOTS.includes(ctx.root) ? ctx.root : getSetting('triadref.root', trRoot, ROOTS);
  const tuningNames = Object.keys(TUNINGS);
  trTuning = getSetting('triadref.tuning', trTuning, tuningNames);
  trFbStart = Number(getSetting('triadref.fbStart', trFbStart));
  trFbEnd = Number(getSetting('triadref.fbEnd', trFbEnd));
  trMaxSpan = Number(getSetting('triadref.maxSpan', trMaxSpan));
  trShowSus = getSetting('triadref.showSus', trShowSus, [true, false]);

  const sets = stringSetsForTuning(trTuning);
  const savedSet = Number(getSetting('triadref.stringSet', NaN));
  if (sets.some(s => s.index === savedSet)) {
    trStringSet = savedSet;
  } else {
    const high = sets.find(s => s.isHighest);
    trStringSet = high ? high.index : 0;
  }

  buildRootList();
  buildTuningList();
  buildStringSetList();
  wireControls();
  wireTriadViewPicker();
  syncSelection();
  renderTriadRef();

  if (!trContextSubscribed) {
    trContextSubscribed = true;
    subscribeContext(c => {
      if (c.root === trRoot) return;
      trRoot = c.root;
      syncSelection();
      renderTriadRef();
    });
  }
}

export function stopTriadRef() {
  stopTriadAudio();
  stopSweepRef();
}
