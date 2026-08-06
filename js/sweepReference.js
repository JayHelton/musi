import { INTERVAL_LABELS } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext } from './musicalContext.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import {
  SWEEP_STRING_SETS,
  DIMINISHED_PRIORITY,
  getSweepPattern,
  patternsForStringSet,
  inversionOptionsFor,
} from './sweepPatterns.js';

const SWEEP_SET_OPTIONS = [3, 4, 5];
const SWEEP_OPEN_MIDI = { E: 40, A: 45, D: 50, G: 55, B: 59, e: 64 };
const SWEEP_NECK = [
  { key: 'E', label: 'E2' },
  { key: 'A', label: 'A2' },
  { key: 'D', label: 'D3' },
  { key: 'G', label: 'G3' },
  { key: 'B', label: 'B3' },
  { key: 'e', label: 'e4' },
];
const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

let sweepRoot = 'C';
let sweepStringSet = 3;
let sweepPatternId = 'maj';
let sweepInversion = 0;
let sweepVoices = [];
let sweepPlayTimers = [];
let sweepPlaying = false;
let onSweepChange = null;

function clampSweepSet(n) {
  return SWEEP_SET_OPTIONS.includes(n) ? n : 3;
}

function migrateSweepSettings() {
  const legacyView = getSetting('ref.viewMode', null, ['scale', 'sweep']);
  const legacySubview = getSetting('subview.scaleref', null);
  if (legacyView === 'sweep' || legacySubview === 'sweeps') {
    saveSetting('triadref.viewMode', 'sweep');
  }
  if (getSetting('triadref.sweepStringSet', null) == null && getSetting('ref.sweepStringSet', null) != null) {
    saveSetting('triadref.sweepStringSet', getSetting('ref.sweepStringSet', 3));
  }
  if (getSetting('triadref.sweepPatternId', null) == null && getSetting('ref.sweepPatternId', null) != null) {
    saveSetting('triadref.sweepPatternId', getSetting('ref.sweepPatternId', 'maj'));
  }
  if (getSetting('triadref.sweepInversion', null) == null && getSetting('ref.sweepInversion', null) != null) {
    saveSetting('triadref.sweepInversion', getSetting('ref.sweepInversion', 0));
  }
}

function clampSweepInversion(patternId, stringSet, inv) {
  const opts = inversionOptionsFor(patternId, stringSet);
  if (!opts.length) return 0;
  const max = opts[opts.length - 1].inv;
  if (!Number.isFinite(inv) || inv < 0) return 0;
  if (inv > max) return max;
  return Math.floor(inv);
}

function selectedSweep() {
  const qualities = patternsForStringSet(sweepStringSet);
  if (!qualities.some(p => p.id === sweepPatternId)) {
    sweepPatternId = qualities[0]?.id || 'maj';
  }
  sweepInversion = clampSweepInversion(sweepPatternId, sweepStringSet, sweepInversion);
  return getSweepPattern(sweepRoot, sweepStringSet, sweepPatternId, sweepInversion);
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

function scheduleSweepTone(midi, startTime, duration, vol = 0.16) {
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
  sweepVoices.push(osc, osc2);
}

function playSweepSequence(midis, beat = 0.42) {
  ensureAudio();
  stopSweepRef();
  if (!midis.length) return;
  const start = audioCtx.currentTime + 0.06;
  midis.forEach((m, i) => scheduleSweepTone(m, start + i * beat, beat * 0.95));
  sweepPlaying = true;
  syncSweepPlayButton();
  const totalMs = (midis.length * beat + 0.4) * 1000;
  sweepPlayTimers.push(setTimeout(() => {
    sweepPlaying = false;
    syncSweepPlayButton();
  }, totalMs));
}

export function playSweepRef() {
  const selected = selectedSweep();
  if (!selected?.events?.length) return;
  const midis = selected.events.map(ev => {
    const open = SWEEP_OPEN_MIDI[ev.s];
    return open == null ? null : open + ev.f;
  }).filter(m => m != null);
  if (!midis.length) return;
  const sequence = midis.length > 1
    ? [...midis, ...midis.slice(0, -1).reverse()]
    : midis;
  const { tempo } = getContext();
  const beat = Math.max(0.18, Math.min(0.55, 60 / ((tempo || 90) * 1.35)));
  playSweepSequence(sequence, beat);
}

export function stopSweepRef() {
  sweepPlayTimers.forEach(id => clearTimeout(id));
  sweepPlayTimers = [];
  sweepVoices.forEach(v => {
    try { v.stop(); } catch (_) {}
  });
  sweepVoices = [];
  sweepPlaying = false;
  syncSweepPlayButton();
}

export function syncSweepPlayButton() {
  const label = 'Play sweep';
  document.querySelectorAll('#triad-fb-play, #triad-sweep-play').forEach(btn => {
    btn.setAttribute('aria-label', sweepPlaying ? 'Stop playback' : label);
    btn.innerHTML = sweepPlaying ? 'Stop' : '&#9654; Play';
    btn.classList.toggle('playing', sweepPlaying);
  });
}

function requestRender() {
  if (typeof onSweepChange === 'function') onSweepChange();
  else renderSweepRef(sweepRoot);
}

function renderSweepControls() {
  const el = document.getElementById('triad-sweep-controls');
  if (!el) return;
  const set = SWEEP_STRING_SETS[sweepStringSet];
  const qualities = patternsForStringSet(sweepStringSet);
  const selected = selectedSweep();
  const invOpts = selected?.inversions
    || inversionOptionsFor(sweepPatternId, sweepStringSet, sweepRoot);
  const invIdx = Math.max(0, invOpts.findIndex(o => o.inv === sweepInversion));
  const invMeta = invOpts[invIdx] || invOpts[0];
  const canPrev = invIdx > 0;
  const canNext = invIdx < invOpts.length - 1;

  let html = '';
  html += `<div class="sweep-control-row">`;
  html += `<span class="sweep-control-label">Strings</span>`;
  html += `<div class="sweep-picker" role="group" aria-label="String set">`;
  html += SWEEP_SET_OPTIONS.map(n => {
    const info = SWEEP_STRING_SETS[n];
    return `<button type="button" class="sweep-btn${n === sweepStringSet ? ' active' : ''}" data-sweep-set="${n}" title="${info.used}">${n}-string</button>`;
  }).join('');
  html += `</div>`;
  html += `<span class="sweep-set-hint">Uses <code>${set.used}</code> · standard 6-string neck</span>`;
  html += `</div>`;

  html += `<div class="sweep-control-row">`;
  html += `<span class="sweep-control-label">Pattern</span>`;
  html += `<div class="sweep-quality-picker" role="listbox" aria-label="Sweep pattern">`;
  qualities.forEach(item => {
    const short = item.join === '' ? `${sweepRoot}${item.name}` : `${sweepRoot} ${item.name}`;
    html += `<button type="button" class="sweep-quality-btn${item.id === sweepPatternId ? ' active' : ''}" data-sweep-pattern="${item.id}" title="${item.formula}">${short}</button>`;
  });
  html += `</div>`;
  html += `</div>`;

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
      sweepStringSet = clampSweepSet(Number(btn.dataset.sweepSet));
      const nextQualities = patternsForStringSet(sweepStringSet);
      if (!nextQualities.some(p => p.id === sweepPatternId)) {
        sweepPatternId = nextQualities[0]?.id || 'maj';
        saveSetting('triadref.sweepPatternId', sweepPatternId);
      }
      sweepInversion = 0;
      saveSetting('triadref.sweepStringSet', sweepStringSet);
      saveSetting('triadref.sweepInversion', sweepInversion);
      requestRender();
    };
  });
  el.querySelectorAll('[data-sweep-pattern]').forEach(btn => {
    btn.onclick = () => {
      sweepPatternId = btn.dataset.sweepPattern || 'maj';
      sweepInversion = 0;
      saveSetting('triadref.sweepPatternId', sweepPatternId);
      saveSetting('triadref.sweepInversion', sweepInversion);
      requestRender();
    };
  });
  el.querySelectorAll('[data-sweep-inv-dir]').forEach(btn => {
    btn.onclick = () => {
      if (btn.disabled) return;
      const dir = Number(btn.dataset.sweepInvDir) || 0;
      const nextIdx = Math.max(0, Math.min(invOpts.length - 1, invIdx + dir));
      sweepInversion = invOpts[nextIdx]?.inv ?? 0;
      saveSetting('triadref.sweepInversion', sweepInversion);
      requestRender();
    };
  });
}

function renderSweepFretboard() {
  const board = document.getElementById('triad-sweep-fretboard');
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
      if (f > 0 && FB_DOTS.includes(f) && s === middle) cls.push('inlay');
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

  const title = document.getElementById('triad-fb-title');
  const sub = document.getElementById('triad-fb-sub');
  const set = SWEEP_STRING_SETS[sweepStringSet];
  if (title) {
    title.textContent = selected
      ? `${selected.title} — ${selected.formula}`
      : `${sweepRoot} Sweep`;
  }
  if (sub) {
    const inv = selected?.inversions?.find(o => o.inv === selected.inversion);
    sub.innerHTML = selected
      ? `<strong>${set.label}</strong> · <code>${set.used}</code> · <strong>${inv?.label || 'Root'}</strong>${inv?.bassLabel ? ` — ${inv.bassLabel}` : ''} · full neck 0–24 · standard tuning`
      : 'Pick a sweep pattern';
  }

  const legend = document.getElementById('triad-sweep-legend');
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

function renderSweepCard() {
  const card = document.getElementById('triad-info-card');
  if (!card) return;
  const selected = selectedSweep();
  const wh = DIMINISHED_PRIORITY.wholeHalf;
  const hw = DIMINISHED_PRIORITY.halfWhole;
  const seq = DIMINISHED_PRIORITY.sequence;

  let html = `<div class="sweep-section">`;
  html += `<div class="sweep-title">${sweepRoot}-Centered Sweep-Picking Library</div>`;
  html += `<p class="sweep-sub">321 authored close-position sweeps (3/4/5-string) with every chord-tone inversion. Pick a pattern on the fretboard above, then step through inversions. Shapes move with the Root tonal center.</p>`;

  if (selected) {
    const inv = selected.inversions.find(o => o.inv === selected.inversion);
    html += `<div class="chord-ref-head sweep-card-head">`;
    html += `<div class="sweep-card-title">${selected.title} <span class="sweep-formula">— ${selected.formula}</span></div>`;
    html += `<button class="btn sm chord-ref-play" id="triad-sweep-play" type="button">&#9654; Play</button>`;
    html += `</div>`;
    if (inv?.bassLabel) {
      html += `<div class="sweep-bass-line">${inv.label} — ${inv.bassLabel}</div>`;
    }
    html += `<div class="guitar-tab-wrap sweep-tab"><div class="tab-title">Sweep tab (h = hammer-on, p = pull-off)</div><pre>${selected.tab}</pre></div>`;
  }

  html += `<div class="sweep-dim-priority">`;
  html += `<h4>Diminished-scale priority patterns</h4>`;
  html += `<div class="sweep-dim-grid">`;
  html += `<div class="sweep-dim-block">`;
  html += `<div class="sweep-dim-kicker">For <strong>${sweepRoot} whole-half diminished</strong> riffs</div>`;
  html += `<pre class="sweep-dim-scale">${wh.scaleHint(sweepRoot)}</pre>`;
  html += `<div class="sweep-dim-label">Prioritize</div>`;
  html += `<ul>${wh.prioritizeLabels(sweepRoot).map(x => `<li>${x}</li>`).join('')}</ul>`;
  html += `</div>`;
  html += `<div class="sweep-dim-block">`;
  html += `<div class="sweep-dim-kicker">For <strong>${sweepRoot} half-whole diminished</strong> dominant riffs</div>`;
  html += `<pre class="sweep-dim-scale">${hw.scaleHint(sweepRoot)}</pre>`;
  html += `<div class="sweep-dim-label">Prioritize</div>`;
  html += `<ul>${hw.prioritizeLabels(sweepRoot).map(x => `<li>${x}</li>`).join('')}</ul>`;
  html += `</div>`;
  html += `</div>`;
  html += `<div class="sweep-dim-seq">`;
  html += `<div class="sweep-dim-label">${seq.title}</div>`;
  html += `<pre class="sweep-dim-scale">${seq.describe(sweepRoot)}</pre>`;
  html += `<p>${seq.note}</p>`;
  html += `</div>`;
  html += `</div>`;
  html += `</div>`;
  card.innerHTML = html;

  const sweepPlay = document.getElementById('triad-sweep-play');
  if (sweepPlay) {
    sweepPlay.onclick = () => {
      if (sweepPlaying) stopSweepRef();
      else playSweepRef();
    };
  }
}

export function renderSweepRef(root) {
  stopSweepRef();
  sweepRoot = root;
  renderSweepControls();
  renderSweepFretboard();
  renderSweepCard();
  syncSweepPlayButton();
}

export function initSweepRef(options = {}) {
  migrateSweepSettings();
  onSweepChange = options.onChange || null;
  sweepStringSet = clampSweepSet(Number(getSetting('triadref.sweepStringSet', sweepStringSet)));
  sweepPatternId = String(getSetting('triadref.sweepPatternId', sweepPatternId) || 'maj');
  sweepInversion = Math.max(0, Number(getSetting('triadref.sweepInversion', sweepInversion)) || 0);
}
