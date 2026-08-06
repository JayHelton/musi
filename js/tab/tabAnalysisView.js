// Shared HTML renderer for tab analysis reports (GP Player inline panel, etc.).
// Music logic lives in js/tab/tabAnalyzer.js; this module is presentation only.

import { NOTE_NAMES_SHARP } from '../theory.js';
import { SCALES } from '../scales.js';

function midiToName(midi) {
  const n = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return n + oct;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

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

function scalePcs(rootPc, scaleName) {
  const def = SCALES[scaleName];
  if (!def) return new Set();
  return new Set(def.map(([, s]) => (rootPc + ((s % 12) + 12) % 12) % 12));
}

function renderFretboard(report, scale, model) {
  if (!scale) return '';
  const strings = report.strings;
  const pcs = scalePcs(scale.root, scale.scaleName);
  const FRETS = 15;
  const openMidis = (model?.strings || []).map((s) => s.openMidi);
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

function renderScales(report, model) {
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
      ${renderFretboard(report, top, model)}
    </div>`;
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

function measureLabel(s) {
  if (!s.measureRange) return '';
  const [a, b] = s.measureRange;
  return a === b ? `bar ${a}` : `bars ${a}–${b}`;
}

function renderStructure(report) {
  if (!report.structure || report.structure.length < 2) return '';
  const chips = report.structure
    .map((s) => `<span class="ta-struct ta-type-${esc(s.type)}">${esc(s.label)}</span>`)
    .join('<span class="ta-struct-arrow">→</span>');
  return `<div class="ta-structure">${chips}</div>`;
}

function renderSections(report) {
  if (!report.sections.length) return '';
  const cards = report.sections.map((s) => {
    const scales = s.scales.slice(0, 2).map((x) => `${x.rootName} ${x.scaleName}`).join(', ') || '—';
    const arps = s.arpeggios.map((a) => a.chord).join(', ');
    const techs = s.techniques.ordered.slice(0, 5).map((x) => `${x.label}×${x.count}`).join(', ');
    const range = s.range ? `${midiToName(s.range.lowMidi)}–${midiToName(s.range.highMidi)}` : '—';
    const chords = s.chords.slice(0, 8).map((c) => c.label).join(' ');
    const kindTag = s.kind === 'solo' ? 'lead / solo' : 'rhythm / riff';
    const bars = measureLabel(s);
    const meta = [bars, `${s.noteCount} notes`, range].filter(Boolean).join(' · ');
    return `
      <div class="ta-section ta-section-${s.kind} ta-type-${esc(s.type)}">
        <div class="ta-section-head">
          <span class="ta-section-kind">${esc(s.label)} <span class="ta-section-tag">${kindTag}</span></span>
          <span class="ta-section-range">${esc(meta)}</span></div>
        <div class="ta-section-body">
          <div><span class="ta-k">Scales</span> ${esc(scales)}</div>
          ${chords ? `<div><span class="ta-k">Chords</span> ${esc(chords)}</div>` : ''}
          ${arps ? `<div><span class="ta-k">Arpeggios</span> ${esc(arps)}</div>` : ''}
          ${techs ? `<div><span class="ta-k">Techniques</span> ${esc(techs)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
  const sub = report.sectionsLabelled
    ? 'song parts from the score'
    : 'auto-detected riff vs solo parts';
  return `
    <div class="quiz-card ta-card">
      <div class="ta-card-title">Sections <span class="ta-sub">${sub}</span></div>
      ${renderStructure(report)}
      <div class="ta-sections">${cards}</div>
    </div>`;
}

function renderSummary(report, { showPlayback = false } = {}) {
  const range = report.range ? `${midiToName(report.range.lowMidi)} – ${midiToName(report.range.highMidi)}` : '—';
  const actions = showPlayback
    ? `<div class="ta-summary-actions">
        <button class="btn" id="ta-play" type="button">▶ Play</button>
        <button class="btn" id="ta-stop" type="button">■ Stop</button>
      </div>`
    : '';
  return `
    <div class="quiz-card ta-card ta-summary">
      <div class="ta-summary-grid">
        <div><span class="ta-k">Tuning</span> ${esc(report.tuning)} (${esc(report.strings.slice().reverse().join(' '))})</div>
        <div><span class="ta-k">Notes</span> ${report.noteCount}</div>
        <div><span class="ta-k">Range</span> ${esc(range)}</div>
      </div>
      ${actions}
    </div>`;
}

function renderWarnings(report) {
  if (!report.warnings.length) return '';
  const items = report.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  return `<div class="quiz-card ta-card ta-warnings"><div class="ta-card-title">Parser notes</div><ul>${items}</ul></div>`;
}

/**
 * Render an analysis report into `host`.
 * @param {HTMLElement} host
 * @param {{ model: object, report: object }} data
 * @param {{ showPlayback?: boolean, onPlay?: () => void, onStop?: () => void }} [options]
 */
export function renderAnalysisReport(host, { model, report }, options = {}) {
  const { showPlayback = false, onPlay, onStop } = options;
  if (!host) return;
  if (!report) {
    host.innerHTML = '<div class="quiz-card"><p class="ta-muted">No analysis available.</p></div>';
    return;
  }
  if (!report.noteCount) {
    host.innerHTML = renderWarnings(report)
      || '<div class="quiz-card"><p class="ta-muted">No notes could be parsed from that input.</p></div>';
    return;
  }
  host.innerHTML =
    renderSummary(report, { showPlayback }) +
    renderKey(report) +
    renderProgression(report) +
    renderScales(report, model) +
    renderArpeggios(report) +
    renderTechniques(report) +
    renderSections(report) +
    renderWarnings(report);

  if (showPlayback) {
    const playBtn = host.querySelector('#ta-play');
    const stopBtn = host.querySelector('#ta-stop');
    if (playBtn && typeof onPlay === 'function') playBtn.onclick = onPlay;
    if (stopBtn && typeof onStop === 'function') stopBtn.onclick = onStop;
  }
}
