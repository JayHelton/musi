// Web view for the Tab Analyzer. Handles input (paste / .txt / .pdf), tuning
// selection, running the shared analysis engine, rendering the breakdown, and
// simple playback of the parsed notes. All music logic lives in js/tab/* and
// js/analysis/*; this module is presentation + wiring only.

import { TUNINGS, NOTE_NAMES_SHARP } from './theory.js';
import { SCALES } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { parseTab } from './tab/tabParser.js';
import { analyzeModel } from './tab/tabAnalyzer.js';
import { pdfToText } from './tab/pdfText.js';
import { ensureAudio, audioCtx, midiFreq, getAnalyserDestination } from './audio.js';

const ta = {
  tuning: 'Standard',
  model: null,
  report: null,
  playing: false,
  voices: [],
  timers: [],
  built: false,
};

const SAMPLE_TAB = `e|-------------------------------|
B|-------------------------------|
G|-----------------7b9--7--------|
D|-------5h7--7----------9--7-----|
A|-3-5-7-----------------------7~-|
E|-------------------------------|

e|-------------------|
B|-------------------|
G|-------------------|
D|--5-5--7-7--5-5-----|
A|--5-5--7-7--5-5-----|
E|--3-3--5-5--3-3-----|`;

function midiToName(midi) {
  const n = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return n + oct;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildTuningList() {
  const host = document.getElementById('sl-ta-tuning');
  if (!host) return;
  host.innerHTML = '';
  ta.tuning = getSetting('tab.tuning', 'Standard', Object.keys(TUNINGS));
  Object.keys(TUNINGS).forEach((name) => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === ta.tuning ? ' active' : '');
    div.textContent = name;
    div.onclick = () => {
      ta.tuning = name;
      saveSetting('tab.tuning', name);
      host.querySelectorAll('.sl-item').forEach((el) => el.classList.remove('active'));
      div.classList.add('active');
      if (document.getElementById('ta-input').value.trim()) analyze();
    };
    host.appendChild(div);
  });
}

// ---- Rendering -----------------------------------------------------------

function confidenceBadge(conf) {
  const pct = Math.round(conf * 100);
  let level = 'low';
  if (conf >= 0.66) level = 'high';
  else if (conf >= 0.4) level = 'med';
  return `<span class="ta-badge ta-badge-${level}">confidence ${pct}%</span>`;
}

function renderKey(report) {
  const k = report.key;
  const cands = k.candidates.map((c) => `<span class="ta-chip">${esc(c.label)} <em>${c.r.toFixed(2)}</em></span>`).join('');
  const chroma = k.isChromatic
    ? `<div class="ta-note ta-warn-note">Highly chromatic (${Math.round(k.chromaticism * 100)}% of the notes fall outside a single major/minor key, ${k.activePcs}/12 pitch classes in use). Reported as a tonal center rather than a strict key.</div>`
    : `<div class="ta-note">${Math.round(k.chromaticism * 100)}% out-of-key colour · ${k.activePcs}/12 pitch classes used.</div>`;
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Tonal center</div>
      <div class="ta-key-main">${esc(k.descriptor)} ${confidenceBadge(k.confidence)}</div>
      ${chroma}
      <div class="ta-chip-row">${cands}</div>
    </div>`;
}

function renderScales(report) {
  if (!report.scales.length) return '';
  const rows = report.scales.map((s, i) => {
    const out = s.outNotes.length ? ` <span class="ta-out">(+${s.outNotes.join(',')})</span>` : '';
    return `<div class="ta-scale-row${i === 0 ? ' top' : ''}">
      <span class="ta-scale-name">${esc(s.rootName)} ${esc(s.scaleName)}</span>
      <span class="ta-scale-notes">${esc(s.notes.join(' '))}${out}</span>
      <span class="ta-scale-fit">${s.matched}/${s.used}</span>
    </div>`;
  }).join('');
  const top = report.scales[0];
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Scales &amp; modes</div>
      ${rows}
      ${renderFretboard(report, top)}
    </div>`;
}

function scalePcs(rootPc, scaleName) {
  const def = SCALES[scaleName];
  if (!def) return new Set();
  return new Set(def.map(([, s]) => (rootPc + ((s % 12) + 12) % 12) % 12));
}

function renderFretboard(report, scale) {
  if (!scale) return '';
  const strings = report.strings; // low -> high labels
  const pcs = scalePcs(scale.root, scale.scaleName);
  const FRETS = 15;
  // Import open midis from the model for exact fret->note mapping.
  const openMidis = (ta.model?.strings || []).map((s) => s.openMidi);
  let html = '<div class="ta-fb-wrap"><table class="ta-fretboard"><tbody>';
  for (let li = strings.length - 1; li >= 0; li--) {
    const open = openMidis[li];
    html += '<tr><th>' + esc(strings[li]) + '</th>';
    for (let f = 0; f <= FRETS; f++) {
      const midi = open != null ? open + f : null;
      const pc = midi != null ? ((midi % 12) + 12) % 12 : null;
      const inScale = pc != null && pcs.has(pc);
      const isRoot = pc === scale.root;
      const cls = inScale ? (isRoot ? 'ta-fb-root' : 'ta-fb-in') : '';
      const lbl = inScale ? NOTE_NAMES_SHARP[pc] : '';
      html += `<td class="${cls}">${lbl}</td>`;
    }
    html += '</tr>';
  }
  html += '<tr class="ta-fb-nums"><th></th>';
  for (let f = 0; f <= FRETS; f++) html += `<td>${f}</td>`;
  html += '</tr></tbody></table></div>';
  return html;
}

function renderProgression(report) {
  if (!report.progression.length) {
    return `<div class="quiz-card ta-card"><div class="ta-card-title">Chords</div>
      <p class="ta-muted">No stacked chords/dyads detected — this passage is mostly single-note lines.</p></div>`;
  }
  const chips = report.progression.map((p) => {
    const cls = p.isPower ? 'ta-prog-power' : (p.diatonic ? 'ta-prog-diatonic' : 'ta-prog-borrowed');
    return `<span class="ta-prog ${cls}"><span class="ta-prog-name">${esc(p.label)}</span><span class="ta-prog-num">${esc(p.numeral)}${p.diatonic ? '' : ' ♦'}</span></span>`;
  }).join('<span class="ta-prog-arrow">→</span>');
  const loop = report.loop
    ? `<div class="ta-note">Repeating loop: <strong>${report.loop.chords.map(esc).join(' – ')}</strong> ×${report.loop.repeats}</div>`
    : '';
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Chords &amp; progression <span class="ta-sub">relative to ${esc(report.key.tonic)} ${esc(report.key.mode)}</span></div>
      <div class="ta-prog-row">${chips}</div>
      ${loop}
      <div class="ta-note ta-muted">♦ = borrowed / chromatic chord (outside the key)</div>
    </div>`;
}

function renderArpeggios(report) {
  if (!report.arpeggios.length) return '';
  const chips = report.arpeggios.map((a) => {
    const tags = [];
    if (a.sweep) tags.push('sweep');
    if (a.tapped) tags.push('tapped');
    const t = tags.length ? ` <em>${tags.join(', ')}</em>` : '';
    return `<span class="ta-chip">${esc(a.chord)}${t}</span>`;
  }).join('');
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Arpeggios <span class="ta-sub">chord-outlining runs</span></div>
      <div class="ta-chip-row">${chips}</div>
    </div>`;
}

function renderTechniques(report) {
  const t = report.techniques;
  if (!t.ordered.length) {
    return `<div class="quiz-card ta-card"><div class="ta-card-title">Techniques</div><p class="ta-muted">No notated techniques detected.</p></div>`;
  }
  const chips = t.ordered.map((o) => `<span class="ta-chip">${esc(o.label)} <em>${o.count}</em></span>`).join('');
  const insights = t.insights.map((i) => `<li>${esc(i)}</li>`).join('');
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Techniques</div>
      <div class="ta-chip-row">${chips}</div>
      ${insights ? `<ul class="ta-insights">${insights}</ul>` : ''}
    </div>`;
}

function renderSections(report) {
  if (!report.sections.length) return '';
  const cards = report.sections.map((s, i) => {
    const scales = s.scales.slice(0, 2).map((x) => `${x.rootName} ${x.scaleName}`).join(', ') || '—';
    const arps = s.arpeggios.map((a) => a.chord).join(', ');
    const techs = s.techniques.ordered.slice(0, 5).map((x) => `${x.label}×${x.count}`).join(', ');
    const range = s.range ? `${midiToName(s.range.lowMidi)}–${midiToName(s.range.highMidi)}` : '—';
    const chords = s.chords.slice(0, 8).map((c) => c.label).join(' ');
    return `
      <div class="ta-section ta-section-${s.kind}">
        <div class="ta-section-head"><span class="ta-section-kind">${s.kind === 'solo' ? 'Solo / lead' : 'Riff / rhythm'}</span>
          <span class="ta-section-range">${s.noteCount} notes · ${esc(range)}</span></div>
        <div class="ta-section-body">
          <div><span class="ta-k">Scales</span> ${esc(scales)}</div>
          ${chords ? `<div><span class="ta-k">Chords</span> ${esc(chords)}</div>` : ''}
          ${arps ? `<div><span class="ta-k">Arpeggios</span> ${esc(arps)}</div>` : ''}
          ${techs ? `<div><span class="ta-k">Techniques</span> ${esc(techs)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Sections <span class="ta-sub">riff vs solo breakdown</span></div>
      <div class="ta-sections">${cards}</div>
    </div>`;
}

function renderSummary(report) {
  const range = report.range ? `${midiToName(report.range.lowMidi)} – ${midiToName(report.range.highMidi)}` : '—';
  return `
    <div class="quiz-card ta-card ta-summary">
      <div class="ta-summary-grid">
        <div><span class="ta-k">Tuning</span> ${esc(report.tuning)} (${esc(report.strings.slice().reverse().join(' '))})</div>
        <div><span class="ta-k">Notes</span> ${report.noteCount}</div>
        <div><span class="ta-k">Range</span> ${esc(range)}</div>
      </div>
      <div class="ta-summary-actions">
        <button class="btn" id="ta-play" type="button">▶ Play</button>
        <button class="btn" id="ta-stop" type="button">■ Stop</button>
      </div>
    </div>`;
}

function renderWarnings(report) {
  if (!report.warnings.length) return '';
  const items = report.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  return `<div class="quiz-card ta-card ta-warnings"><div class="ta-card-title">Parser notes</div><ul>${items}</ul></div>`;
}

function render() {
  const host = document.getElementById('ta-results');
  if (!host) return;
  const report = ta.report;
  if (!report) {
    host.innerHTML = '<div class="quiz-card"><p class="ta-muted">Paste a tab and hit Analyze.</p></div>';
    return;
  }
  if (!report.noteCount) {
    host.innerHTML = renderWarnings(report) ||
      '<div class="quiz-card"><p class="ta-muted">No notes could be parsed from that input.</p></div>';
    return;
  }
  host.innerHTML =
    renderSummary(report) +
    renderKey(report) +
    renderProgression(report) +
    renderScales(report) +
    renderArpeggios(report) +
    renderTechniques(report) +
    renderSections(report) +
    renderWarnings(report);

  const playBtn = document.getElementById('ta-play');
  const stopBtn = document.getElementById('ta-stop');
  if (playBtn) playBtn.onclick = play;
  if (stopBtn) stopBtn.onclick = stopPlayback;
}

// ---- Analyze -------------------------------------------------------------

function analyze() {
  const text = document.getElementById('ta-input').value;
  saveSetting('tab.lastInput', text.slice(0, 20000));
  ta.model = parseTab(text, ta.tuning);
  ta.report = analyzeModel(ta.model);
  render();
}

// ---- Playback ------------------------------------------------------------

function stopPlayback() {
  ta.timers.forEach((t) => clearTimeout(t));
  ta.timers = [];
  ta.voices.forEach((v) => { try { v.osc.stop(); } catch (e) {} });
  ta.voices = [];
  ta.playing = false;
}

function play() {
  stopPlayback();
  if (!ta.model || !ta.model.events.length) return;
  ensureAudio();
  const pitched = ta.model.events.filter((e) => e.midi != null);
  if (!pitched.length) return;
  ta.playing = true;
  const slots = [...new Set(pitched.map((e) => e.slot))].sort((a, b) => a - b);
  const slotIndex = new Map(slots.map((s, i) => [s, i]));
  const step = 0.16;
  const now = audioCtx.currentTime + 0.05;
  pitched.forEach((e) => {
    const t = now + slotIndex.get(e.slot) * step;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiFreq(e.midi);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.6);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(t);
    osc.stop(t + step * 1.8);
    ta.voices.push({ osc, gain });
  });
  const total = slots.length * step * 1000 + 400;
  ta.timers.push(setTimeout(() => { ta.playing = false; }, total));
}

// ---- PDF ingestion (best-effort, offline) --------------------------------
// Uses the analyzer's own offline extractor (js/tab/pdfText.js), kept parallel
// to and independent from the drum PDF importer so they can't break each other.

async function handleFile(file) {
  const note = document.getElementById('ta-file-note');
  const input = document.getElementById('ta-input');
  if (!file) return;
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  try {
    if (isPdf) {
      if (note) note.textContent = 'Extracting text from PDF…';
      const buf = await file.arrayBuffer();
      const text = await pdfToText(buf);
      input.value = text;
      if (note) note.textContent = `Loaded ${file.name}. PDF text is best-effort — fix any misaligned rows, then Analyze.`;
    } else {
      const text = await file.text();
      input.value = text;
      if (note) note.textContent = `Loaded ${file.name}.`;
    }
    analyze();
  } catch (err) {
    if (note) note.textContent = 'Could not read that file' + (isPdf ? ' — this PDF may use an unsupported layout. Paste the tab text instead.' : '.');
  }
}

// ---- Lifecycle -----------------------------------------------------------

export function initTabAnalyzer() {
  buildTuningList();

  const input = document.getElementById('ta-input');
  if (input && !input.value) {
    const saved = getSetting('tab.lastInput', '');
    if (saved) input.value = saved;
  }

  if (ta.built) { if (ta.report) render(); return; }
  ta.built = true;

  document.getElementById('ta-analyze').onclick = analyze;
  document.getElementById('ta-sample').onclick = () => {
    document.getElementById('ta-input').value = SAMPLE_TAB;
    analyze();
  };
  const fileInput = document.getElementById('ta-file');
  if (fileInput) fileInput.onchange = (e) => handleFile(e.target.files[0]);
}

export function stopTabAnalyzer() {
  stopPlayback();
}
