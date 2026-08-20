// Chord Finder — a fretboard you tap, and every chord your taps spell.
//
// The screen has three parts. The tuning list picks the neck. The fretboard
// toggles one note per tap. The results panel names the selection, and it
// names it more than once: a set of notes usually has several true readings,
// so the panel ranks them instead of hiding all but one.
//
// Selecting a match relabels the fretboard with that chord's scale degrees,
// which is the point of the screen: you see the same shape as a C6 and as an
// Am7 without moving your fingers.

import { TUNINGS, NOTE_NAMES_SHARP, parseNote } from './theory.js';
import { resolveTuningKey } from './tunings.js';
import { matchChords, matchCaveat } from './analysis/chordMatch.js';
import { findKeys } from './analysis/chordDetect.js';
import { getScaleNotes } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext } from './musicalContext.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { escapeHtml } from './uxPrimitives.js';

const MAX_FRET = 24;
const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
/** Matches below this share of the top score stay behind the "show all" toggle. */
const CONFIDENCE_FLOOR = 55;

let cfTuning = 'Standard';
let cfStart = 0;
let cfEnd = 15;
let cfShowAll = true;
let cfExpanded = false;
let cfFocusId = null;
/** Selected cells, keyed `stringIndex:fret`. */
let cfSelected = new Set();
let cfVoices = [];
let cfPlayTimer = null;
let cfWired = false;
let cfContextSubscribed = false;

function tuningStrings(name) {
  return TUNINGS[name] || TUNINGS.Standard || [];
}

function openMidis(name) {
  return tuningStrings(name).map(s => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

function cellKey(stringIndex, fret) {
  return `${stringIndex}:${fret}`;
}

/** Selected cells as `{ string, fret, midi }`, low pitch first. */
function selectedNotes() {
  const midis = openMidis(cfTuning);
  const out = [];
  for (const key of cfSelected) {
    const [s, f] = key.split(':').map(Number);
    if (!Number.isFinite(midis[s])) continue;
    out.push({ string: s, fret: f, midi: midis[s] + f });
  }
  return out.sort((a, b) => a.midi - b.midi);
}

function noteName(midi) {
  return NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
}

/* ── Selection state ─────────────────────────────────────────── */

function saveSelection() {
  saveSetting('chordfinder.selected', [...cfSelected].join(','));
}

function restoreSelection() {
  const raw = getSetting('chordfinder.selected', '');
  cfSelected = new Set();
  if (typeof raw !== 'string' || !raw) return;
  const strings = tuningStrings(cfTuning).length;
  for (const key of raw.split(',')) {
    const [s, f] = key.split(':').map(Number);
    if (!Number.isInteger(s) || !Number.isInteger(f)) continue;
    if (s < 0 || s >= strings || f < 0 || f > MAX_FRET) continue;
    cfSelected.add(cellKey(s, f));
  }
}

/** Drop selections the current tuning has no string for. */
function pruneSelection() {
  const strings = tuningStrings(cfTuning).length;
  for (const key of [...cfSelected]) {
    if (Number(key.split(':')[0]) >= strings) cfSelected.delete(key);
  }
}

function toggleCell(stringIndex, fret) {
  const key = cellKey(stringIndex, fret);
  if (cfSelected.has(key)) cfSelected.delete(key);
  else cfSelected.add(key);
  cfFocusId = null;
  saveSelection();
  renderBoard();
  renderResults();
}

function clearSelection() {
  cfSelected.clear();
  cfFocusId = null;
  saveSelection();
  renderBoard();
  renderResults();
}

/* ── Analysis ────────────────────────────────────────────────── */

function currentAnalysis() {
  return matchChords(selectedNotes().map(n => n.midi), { maxResults: 14 });
}

/** The match the fretboard labels with scale degrees, if any. */
function focusedMatch(analysis) {
  if (!cfFocusId) return null;
  return analysis.matches.find(m => m.id === cfFocusId) || null;
}

/* ── Fretboard ───────────────────────────────────────────────── */

function renderBoard() {
  const board = document.getElementById('cf-fretboard');
  if (!board) return;
  const strings = tuningStrings(cfTuning);
  const midis = openMidis(cfTuning);
  const start = Math.max(0, Math.min(MAX_FRET, cfStart));
  const end = Math.max(start + 1, Math.min(MAX_FRET, cfEnd));
  const count = end - start + 1;
  const middleString = Math.floor(strings.length / 2);

  const analysis = currentAnalysis();
  const focus = focusedMatch(analysis);
  const degreeByPc = new Map();
  if (focus) {
    for (const tone of focus.tones) {
      if (!tone.omitted) degreeByPc.set(tone.pc, tone.degree);
    }
  }

  board.style.gridTemplateColumns = `40px repeat(${count}, minmax(30px, 1fr))`;

  let html = '<div class="ref-fb-corner"></div>';
  for (let f = start; f <= end; f++) {
    html += `<div class="ref-fb-fretnum">${f}</div>`;
  }

  for (let s = strings.length - 1; s >= 0; s--) {
    html += `<div class="ref-fb-strlabel">${escapeHtml(strings[s].note)}${strings[s].oct}</div>`;
    for (let f = start; f <= end; f++) {
      const midi = midis[s] + f;
      const pc = ((midi % 12) + 12) % 12;
      const selected = cfSelected.has(cellKey(s, f));
      const cls = ['ref-fb-cell', 'cf-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && FB_DOTS.includes(f) && s === middleString) cls.push('inlay');

      const btnCls = ['cf-fret'];
      if (selected) btnCls.push('on');
      if (!selected && !cfShowAll) btnCls.push('quiet');
      const degree = degreeByPc.get(pc);
      if (selected && degree === 'R') btnCls.push('root');

      let text = '';
      if (selected) text = degree || noteName(midi);
      else if (cfShowAll) text = noteName(midi);

      const label = `${noteName(midi)}${Math.floor(midi / 12) - 1}, string ${s + 1}, fret ${f}`;
      html += `<div class="${cls.join(' ')}">` +
        `<button type="button" class="${btnCls.join(' ')}" data-string="${s}" data-fret="${f}"` +
        ` aria-pressed="${selected}" aria-label="${escapeHtml(label)}">${escapeHtml(text)}</button>` +
        `</div>`;
    }
  }
  board.innerHTML = html;

  const title = document.getElementById('cf-fb-title');
  const sub = document.getElementById('cf-fb-sub');
  if (title) title.textContent = `${cfTuning} — ${strings.length} strings`;
  if (sub) {
    const notes = selectedNotes();
    if (!notes.length) {
      sub.textContent = 'Tap frets to select notes. Two or more notes name a chord.';
    } else {
      // A narrowed fret window hides selections instead of dropping them, so
      // say how many are off-screen rather than let the count look wrong.
      const offRange = notes.filter(n => n.fret < start || n.fret > end).length;
      const parts = [
        `${notes.length} note${notes.length === 1 ? '' : 's'} selected`,
        `lowest ${noteName(notes[0].midi)}`,
      ];
      if (offRange) parts.push(`${offRange} outside frets ${start}–${end}`);
      sub.textContent = parts.join(' · ');
    }
  }
}

/* ── Results ─────────────────────────────────────────────────── */

function toneChips(match) {
  return match.tones.map(tone => {
    const cls = ['cf-tone'];
    if (tone.omitted) cls.push('missing');
    if (tone.degree === 'R') cls.push('root');
    return `<span class="${cls.join(' ')}">` +
      `<span class="cf-tone-note">${escapeHtml(tone.note)}</span>` +
      `<span class="cf-tone-deg">${escapeHtml(tone.degree)}</span></span>`;
  }).join('');
}

function matchCard(match) {
  const caveat = matchCaveat(match);
  const flags = [];
  if (match.exact && !match.inversion) flags.push('<span class="cf-flag exact">Exact</span>');
  if (match.omitted.length) flags.push(`<span class="cf-flag">${escapeHtml(match.omitted.map(d => `no ${d}`).join(' · '))}</span>`);
  if (match.inversion) flags.push(`<span class="cf-flag">${escapeHtml(match.inversion)}</span>`);

  return `<button type="button" class="cf-match${cfFocusId === match.id ? ' focused' : ''}" data-match="${escapeHtml(match.id)}">
    <span class="cf-match-head">
      <span class="cf-match-symbol">${escapeHtml(match.label)}</span>
      <span class="cf-match-confidence" title="How well this reading fits, next to the best one">${match.confidence}%</span>
    </span>
    <span class="cf-match-name">${escapeHtml(match.name)}</span>
    <span class="cf-match-tones">${toneChips(match)}</span>
    <span class="cf-match-flags">${flags.join('')}</span>
    <span class="cf-match-bar"><span class="cf-match-bar-fill" style="width:${Math.max(4, match.confidence)}%"></span></span>
    ${caveat ? `<span class="sr-only">${escapeHtml(caveat)}</span>` : ''}
  </button>`;
}

const ENHARMONIC_KEYS = {
  'C#': 'Db', Db: 'C#', 'D#': 'Eb', Eb: 'D#', 'F#': 'Gb', Gb: 'F#',
  'G#': 'Ab', Ab: 'G#', 'A#': 'Bb', Bb: 'A#',
};
const KEY_SCALES = { major: 'Major (Ionian)', minor: 'Natural Minor (Aeolian)' };

/** Total accidentals in a spelling, with double accidentals counted heavily. */
function accidentalCost(notes) {
  return notes.reduce((sum, note) => {
    const acc = note.slice(1);
    if (acc === '##' || acc === 'bb') return sum + 10;
    return sum + (acc ? 1 : 0);
  }, 0);
}

/**
 * The usual name for a key. `findKeys` answers in flats, so C# minor comes
 * back as Db minor; this picks whichever spelling writes fewer accidentals.
 */
function keyName(root, quality) {
  const scale = KEY_SCALES[quality];
  const options = [root, ENHARMONIC_KEYS[root]].filter(Boolean);
  let best = root;
  let bestCost = Infinity;
  for (const option of options) {
    const notes = getScaleNotes(option, scale);
    if (!notes) continue;
    const cost = accidentalCost(notes);
    if (cost < bestCost) { bestCost = cost; best = option; }
  }
  return `${best} ${quality}`;
}

function keyLine(pitchClasses) {
  if (pitchClasses.length < 2) return '';
  const keys = findKeys(pitchClasses);
  if (!keys.length) {
    return '<div class="cf-keys">No plain major or minor key holds all of these notes.</div>';
  }
  const list = keys.map(k => keyName(k.key, k.quality)).join(', ');
  return `<div class="cf-keys"><strong>Fits these keys:</strong> ${escapeHtml(list)}</div>`;
}

function renderResults() {
  const panel = document.getElementById('cf-results');
  if (!panel) return;
  const analysis = currentAnalysis();
  const selected = selectedNotes();

  if (selected.length === 0) {
    panel.innerHTML = '<div class="cf-empty"><strong>Pick notes on the neck.</strong>' +
      '<p>Tap a fret to select the note it plays. Tap it again to clear it. ' +
      'With two or more notes the finder names every chord those notes spell.</p></div>';
    return;
  }
  if (selected.length === 1) {
    const n = selected[0];
    panel.innerHTML = `<div class="cf-empty"><strong>${escapeHtml(noteName(n.midi))} selected.</strong>` +
      '<p>One note is not a chord. Pick at least one more.</p></div>';
    return;
  }

  const shown = cfExpanded
    ? analysis.matches
    : analysis.matches.filter(m => m.confidence >= CONFIDENCE_FLOOR);
  const visible = shown.length ? shown : analysis.matches.slice(0, 1);
  const hidden = analysis.matches.length - visible.length;

  let html = '<div class="cf-results-head">';
  html += `<h3>${analysis.matches.length ? 'Chord matches' : 'No chord name fits'}</h3>`;
  const pcNames = analysis.pitchClasses.map(pc => NOTE_NAMES_SHARP[pc]).join(' · ');
  html += `<span class="cf-pcs">${escapeHtml(pcNames)}</span>`;
  html += '</div>';

  if (analysis.interval) {
    html += `<div class="cf-interval">Two notes a <strong>${escapeHtml(analysis.interval.label)}</strong> apart. ` +
      'A dyad names an interval, so read the chords below as fragments.</div>';
  }

  if (!analysis.matches.length) {
    html += '<div class="cf-empty"><p>These notes do not spell a chord this finder knows. ' +
      'Clear a note and try again.</p></div>';
  } else {
    html += `<div class="cf-match-list">${visible.map(matchCard).join('')}</div>`;
    if (hidden > 0 || cfExpanded) {
      html += `<button type="button" class="btn sm cf-more" id="cf-more">` +
        (cfExpanded ? 'Show close matches only' : `Show ${hidden} more reading${hidden === 1 ? '' : 's'}`) +
        '</button>';
    }
  }

  html += keyLine(analysis.pitchClasses);
  panel.innerHTML = html;

  panel.querySelectorAll('.cf-match').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.match;
      cfFocusId = cfFocusId === id ? null : id;
      renderBoard();
      renderResults();
    };
  });
  const more = document.getElementById('cf-more');
  if (more) {
    more.onclick = () => {
      cfExpanded = !cfExpanded;
      renderResults();
    };
  }
}

/* ── Playback ────────────────────────────────────────────────── */

function scheduleTone(midi, startTime, duration, vol = 0.14) {
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

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const stopAt = startTime + duration + 0.05;
  osc.start(startTime); osc.stop(stopAt);
  osc2.start(startTime); osc2.stop(stopAt);
  cfVoices.push(osc, osc2);
}

/** Strum the selection low to high, then let it ring. */
function playSelection() {
  const notes = selectedNotes();
  if (!notes.length) return;
  ensureAudio();
  stopChordFinder();
  const start = audioCtx.currentTime + 0.05;
  notes.forEach((n, i) => scheduleTone(n.midi, start + i * 0.055, 2.0));
  cfPlayTimer = setTimeout(() => { cfVoices = []; cfPlayTimer = null; }, 2400);
}

export function stopChordFinder() {
  if (cfPlayTimer) { clearTimeout(cfPlayTimer); cfPlayTimer = null; }
  cfVoices.forEach(v => { try { v.stop(); } catch (_) { /* already stopped */ } });
  cfVoices = [];
}

/* ── Wiring ──────────────────────────────────────────────────── */

function buildTuningList() {
  const container = document.getElementById('sl-cf-tuning');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(TUNINGS).forEach(name => {
    const div = document.createElement('div');
    div.className = 'sl-item' + (name === cfTuning ? ' active' : '');
    div.dataset.val = name;
    div.innerHTML = `<span>${escapeHtml(name)}</span>` +
      `<span class="sl-item-sub">${TUNINGS[name].length}-string</span>`;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      cfTuning = name;
      saveSetting('chordfinder.tuning', cfTuning);
      // The tuning is shared, so every compatible tool follows this pick.
      setContext({ tuning: name }, 'chordfinder');
      pruneSelection();
      saveSelection();
      cfFocusId = null;
      renderBoard();
      renderResults();
    };
    container.appendChild(div);
  });
}

function syncControls() {
  const start = document.getElementById('cf-fb-start');
  const end = document.getElementById('cf-fb-end');
  const showAll = document.getElementById('cf-show-all');
  if (start) start.value = cfStart;
  if (end) end.value = cfEnd;
  if (showAll) showAll.checked = cfShowAll;
  document.querySelectorAll('#sl-cf-tuning .sl-item').forEach(el =>
    el.classList.toggle('active', el.dataset.val === cfTuning));
}

function wireControls() {
  if (cfWired) return;
  const board = document.getElementById('cf-fretboard');
  if (!board) return;
  cfWired = true;

  board.addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-fret');
    if (!btn) return;
    toggleCell(Number(btn.dataset.string), Number(btn.dataset.fret));
  });

  const start = document.getElementById('cf-fb-start');
  const end = document.getElementById('cf-fb-end');
  const updateRange = () => {
    const s = Math.max(0, Math.min(MAX_FRET, Number(start.value) || 0));
    const e = Math.max(s + 1, Math.min(MAX_FRET, Number(end.value) || MAX_FRET));
    cfStart = s;
    cfEnd = e;
    start.value = s;
    end.value = e;
    saveSetting('chordfinder.fbStart', cfStart);
    saveSetting('chordfinder.fbEnd', cfEnd);
    renderBoard();
  };
  if (start) start.onchange = updateRange;
  if (end) end.onchange = updateRange;

  const showAll = document.getElementById('cf-show-all');
  if (showAll) {
    showAll.onchange = () => {
      cfShowAll = showAll.checked;
      saveSetting('chordfinder.showAll', cfShowAll);
      renderBoard();
    };
  }

  const clear = document.getElementById('cf-clear');
  if (clear) clear.onclick = () => clearSelection();

  const play = document.getElementById('cf-play');
  if (play) play.onclick = () => playSelection();
}

export function initChordFinder() {
  const ctx = getContext();
  const tuningNames = Object.keys(TUNINGS);
  cfTuning = resolveTuningKey(ctx.tuning)
    || getSetting('chordfinder.tuning', cfTuning, tuningNames);
  cfStart = Number(getSetting('chordfinder.fbStart', cfStart)) || 0;
  cfEnd = Number(getSetting('chordfinder.fbEnd', cfEnd)) || 15;
  cfShowAll = getSetting('chordfinder.showAll', cfShowAll, [true, false]);
  restoreSelection();
  pruneSelection();

  buildTuningList();
  wireControls();
  syncControls();
  renderBoard();
  renderResults();

  if (!cfContextSubscribed) {
    cfContextSubscribed = true;
    subscribeContext(c => {
      const key = resolveTuningKey(c.tuning);
      if (!key || key === cfTuning) return;
      cfTuning = key;
      pruneSelection();
      saveSelection();
      cfFocusId = null;
      syncControls();
      renderBoard();
      renderResults();
    });
  }
}
