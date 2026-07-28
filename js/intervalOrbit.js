/**
 * Interval Orbit — Guitar Interval-Mapping Trainer (MVP).
 * Root-centered fretboard drills + chord-tone improv over looping progressions.
 */

import { parseNote, NOTE_NAMES_SHARP, ROOTS } from './theory.js';
import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { getSetting, saveSetting } from './persistence.js';
import { recordAttempt } from './stats.js';
import { showNowPlaying, hideNowPlaying } from './nowPlaying.js';
import {
  ORBIT_LABELS,
  DEGREE_LABELS,
  STAGE_INTERVALS,
  ORBIT_DEFS,
  CHORD_FORMULAS,
  PRESET_PROGRESSIONS,
  DRILL_TYPES,
  LABEL_MODES,
  guitarTuningNames,
  resolveTuning,
  openMidisFromTuning,
  intervalClass,
  intervalLabel,
  noteLabel,
  tuningBoundaryIndices,
  crossesTuningBoundary,
  collectOrbitPositions,
  positionsMatchingInterval,
  nearestPosition,
  randomRootPosition,
  pick,
  enabledIntervalsForStage,
  formulaLabel,
  buildProgressionChords,
  parseCustomTuningText,
  masteryKey,
  summarizeWeaknesses,
  describeMasteryKey,
} from './intervalOrbitModel.js';

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const FB_DOUBLE = new Set([12, 24]);
const ADVANCE_MS = 1600;
const HISTORY_KEY = 'io.sessionHistory';
const MASTERY_KEY = 'io.mastery';
const CUSTOM_PROGS_KEY = 'io.customProgressions';

const io = {
  tuningName: 'Standard',
  customStrings: null,
  handedness: 'right',
  fretStart: 0,
  fretEnd: 12,
  orbitSize: 1,
  stage: 1,
  drill: 'find',
  labelMode: 'interval',
  octaveAs8: false,
  showShapeLines: true,
  showBoundary: true,
  hideRootAfterMs: 0,
  findMode: 'any', // any | nearest | every
  tonalCenter: 'D',
  improvPerspective: 'chord', // key | chord | both | none
  improvChallenge: 'chordTone',
  bpm: 110,
  metronomeOn: true,
  // session state
  root: null,
  orbit: null,
  openMidis: [],
  strings: [],
  question: null,
  answered: false,
  selected: [],
  right: 0,
  total: 0,
  streak: 0,
  sessionStarted: 0,
  sessionAttempts: [],
  qStart: 0,
  // improv
  progression: [],
  progIdx: 0,
  playing: false,
  _timer: null,
  _nextTime: 0,
  _activeOscs: [],
  _rootHideTimer: null,
  _advTimer: null,
  built: false,
};

function strings() {
  return resolveTuning(io.tuningName, io.customStrings);
}

function refreshOpen() {
  io.strings = strings();
  io.openMidis = openMidisFromTuning(io.strings);
}

function activeIntervals() {
  const stageInts = enabledIntervalsForStage(io.stage);
  const orbitDef = ORBIT_DEFS[io.orbitSize] || ORBIT_DEFS[1];
  return stageInts.filter((i) => orbitDef.defaultIntervals.includes(i) || i === 0);
}

function cellLabel(midi, rootMidi, chordRootMidi = null) {
  const ic = intervalClass(midi, rootMidi);
  const keyLab = io.octaveAs8 && ic === 0 && midi !== rootMidi
    ? '8'
    : (io.labelMode === 'degree' ? DEGREE_LABELS[ic] : ORBIT_LABELS[ic]);
  const note = NOTE_NAMES_SHARP[midi % 12];
  if (io.labelMode === 'hidden') return '';
  if (io.labelMode === 'note') return note;
  if (io.labelMode === 'degree') return keyLab;
  if (io.labelMode === 'both') return `${keyLab}\n${note}`;
  if (io.drill === 'improv' && io.improvPerspective !== 'key' && chordRootMidi != null) {
    const cic = intervalClass(midi, chordRootMidi);
    const cLab = ORBIT_LABELS[cic];
    if (io.improvPerspective === 'chord') return cLab;
    if (io.improvPerspective === 'both') return `${keyLab} / ${cLab}`;
    return '';
  }
  return keyLab;
}

function setFeedback(msg, ok) {
  const el = document.getElementById('io-feedback');
  if (!el) return;
  el.className = 'fb-feedback show ' + (ok ? 'correct' : 'wrong');
  el.textContent = msg;
}

function clearFeedback() {
  const el = document.getElementById('io-feedback');
  if (!el) return;
  el.className = 'fb-feedback';
  el.textContent = '';
}

function updateScore() {
  const r = document.getElementById('io-right');
  const t = document.getElementById('io-total');
  const s = document.getElementById('io-streak');
  if (r) r.textContent = io.right;
  if (t) t.textContent = io.total;
  if (s) s.textContent = io.streak;
}

function loadMastery() {
  const m = getSetting(MASTERY_KEY, {});
  return m && typeof m === 'object' ? m : {};
}

function saveMastery(m) {
  saveSetting(MASTERY_KEY, m);
}

function recordMasteryAttempt(meta, correct, ms) {
  const key = masteryKey(meta);
  const mastery = loadMastery();
  const row = mastery[key] || { attempts: 0, correct: 0, totalMs: 0 };
  row.attempts += 1;
  if (correct) row.correct += 1;
  row.totalMs += ms || 0;
  mastery[key] = row;
  saveMastery(mastery);
}

function pushSessionAttempt(entry) {
  io.sessionAttempts.push(entry);
}

function endSessionSummary() {
  const attempts = io.sessionAttempts;
  if (!attempts.length) return null;
  const correct = attempts.filter((a) => a.correct).length;
  const byType = {};
  attempts.forEach((a) => {
    byType[a.drill] = byType[a.drill] || { right: 0, total: 0 };
    byType[a.drill].total += 1;
    if (a.correct) byType[a.drill].right += 1;
  });
  const weak = summarizeWeaknesses(loadMastery(), 5).map((w) => ({
    ...w,
    label: describeMasteryKey(w.key),
  }));
  const summary = {
    at: Date.now(),
    tuning: io.tuningName,
    drill: io.drill,
    accuracy: Math.round((correct / attempts.length) * 100),
    correct,
    total: attempts.length,
    avgMs: Math.round(attempts.reduce((s, a) => s + (a.ms || 0), 0) / attempts.length),
    byType,
    weak,
    recommendation: weak[0]
      ? `Practice ${weak[0].label.split(',')[0]} for three minutes.`
      : 'Keep exploring new root strings and orbit sizes.',
  };
  const hist = getSetting(HISTORY_KEY, []);
  const list = Array.isArray(hist) ? hist : [];
  list.unshift(summary);
  saveSetting(HISTORY_KEY, list.slice(0, 30));
  return summary;
}

function renderHistory() {
  const el = document.getElementById('io-history');
  if (!el) return;
  const hist = getSetting(HISTORY_KEY, []);
  if (!Array.isArray(hist) || !hist.length) {
    el.innerHTML = '<p class="io-muted">No sessions yet. Complete a few drills to see history.</p>';
    return;
  }
  el.innerHTML = hist.slice(0, 8).map((s) => {
    const d = new Date(s.at);
    return `<div class="io-hist-row">
      <div><strong>${s.accuracy}%</strong> · ${s.correct}/${s.total} · ${s.drill} · ${s.tuning}</div>
      <div class="io-muted">${d.toLocaleString()} · ${s.recommendation || ''}</div>
    </div>`;
  }).join('');
}

function renderWeakPanel() {
  const el = document.getElementById('io-weak');
  if (!el) return;
  const weak = summarizeWeaknesses(loadMastery(), 5);
  if (!weak.length) {
    el.innerHTML = '<p class="io-muted">No weak relationships tracked yet.</p>';
    return;
  }
  el.innerHTML = weak.map((w) =>
    `<div class="io-weak-row"><span>${describeMasteryKey(w.key)}</span><b>${Math.round(w.acc * 100)}%</b></div>`
  ).join('');
}

/* ── Fretboard render ─────────────────────────────────────────── */

function buildBoard(opts = {}) {
  const board = document.getElementById('io-board');
  const overlay = document.getElementById('io-shape-overlay');
  if (!board) return;
  refreshOpen();
  const stringList = io.strings.slice();
  const openMidis = io.openMidis.slice();
  const { start, end } = { start: io.fretStart, end: io.fretEnd };
  const count = end - start + 1;
  const lefty = io.handedness === 'left';

  board.style.gridTemplateColumns = `28px repeat(${count}, minmax(22px, 1fr))`;
  board.style.gridTemplateRows = `16px repeat(${stringList.length}, 26px)`;
  board.innerHTML = '';
  if (overlay) overlay.innerHTML = '';

  const hdr0 = document.createElement('div');
  hdr0.className = 'fb-header';
  board.appendChild(hdr0);
  const fretOrder = [];
  for (let f = start; f <= end; f++) fretOrder.push(f);
  if (lefty) fretOrder.reverse();
  fretOrder.forEach((f) => {
    const hdr = document.createElement('div');
    hdr.className = 'fb-header';
    hdr.textContent = f;
    board.appendChild(hdr);
  });

  const bounds = new Set(tuningBoundaryIndices(openMidis));
  const rootMidi = io.root ? io.root.midi : null;
  const chordRoot = opts.chordRootMidi != null ? opts.chordRootMidi : rootMidi;
  const visibleSet = opts.visibleSet || null; // Set of "s:f"
  const highlight = opts.highlight || {};
  const interactive = opts.interactive !== false;
  const middle = Math.floor(stringList.length / 2);

  const rows = [];
  for (let s = stringList.length - 1; s >= 0; s--) rows.push(s);
  if (lefty) rows.reverse();

  rows.forEach((s, rowIdx) => {
    const label = document.createElement('div');
    label.className = 'fb-string-label';
    label.textContent = stringList[s].note + stringList[s].oct;
    if (bounds.has(s) || bounds.has(s - 1)) label.classList.add('io-boundary-string');
    board.appendChild(label);

    fretOrder.forEach((f) => {
      const cell = document.createElement('div');
      const midi = openMidis[s] + f;
      cell.className = 'fb-cell io-cell' + (f === 0 ? ' nut' : '');
      if (FB_DOTS.includes(f) && f > 0) {
        const isD = FB_DOUBLE.has(f);
        if (isD ? (s === middle - 1 || s === middle + 1) : s === middle) cell.classList.add('dot');
      }
      if (io.showBoundary && (bounds.has(s) || (bounds.has(s - 1) && s > 0))) {
        // Mark the upper string of a boundary pair
        if (bounds.has(s - 1)) cell.classList.add('io-boundary');
      }

      const key = `${s}:${f}`;
      const inOrbit = !visibleSet || visibleSet.has(key);
      const isRoot = io.root && io.root.string === s && io.root.fret === f;
      const isOct = rootMidi != null && intervalClass(midi, rootMidi) === 0 && !isRoot;
      const revealed = highlight.revealed && highlight.revealed.has(key);
      const selected = highlight.selected && highlight.selected.has(key);
      const target = highlight.target && highlight.target.has(key);
      const ghost = highlight.ghost && highlight.ghost.has(key);

      if (!inOrbit && !isRoot) {
        cell.classList.add('io-hidden');
      } else if (isRoot && !opts.rootHidden) {
        cell.classList.add('io-root');
        cell.classList.add('show-label');
        cell.textContent = 'R';
      } else if (selected) {
        cell.classList.add('selected', 'show-label');
        cell.textContent = cellLabel(midi, rootMidi, chordRoot);
      } else if (revealed) {
        cell.classList.add('reveal', 'show-label');
        cell.textContent = cellLabel(midi, rootMidi, chordRoot);
      } else if (target) {
        cell.classList.add('io-target', 'show-label');
        cell.textContent = '?';
      } else if (ghost) {
        cell.classList.add('io-ghost', 'show-label');
        cell.textContent = cellLabel(midi, rootMidi, chordRoot);
      } else if (opts.showAllLabels && inOrbit) {
        cell.classList.add('show-label');
        if (isOct) cell.classList.add('io-octave');
        cell.textContent = cellLabel(midi, rootMidi, chordRoot);
      } else if (inOrbit) {
        cell.classList.add('io-empty');
      }

      cell.dataset.string = s;
      cell.dataset.fret = f;
      cell.dataset.midi = midi;
      cell.dataset.key = key;

      if (interactive && inOrbit) {
        cell.onclick = () => onCellTap(s, f, midi, cell);
      }
      board.appendChild(cell);
    });
  });

  // Shape lines (SVG overlay)
  if (overlay && io.showShapeLines && io.root && opts.shapeTargets && !opts.hideShapes) {
    drawShapeLines(overlay, board, opts.shapeTargets);
  }

  // Boundary explainer
  const note = document.getElementById('io-boundary-note');
  if (note) {
    if (io.showBoundary && bounds.size) {
      const steps = [];
      bounds.forEach((i) => {
        const a = stringList[i];
        const b = stringList[i + 1];
        const st = openMidis[i + 1] - openMidis[i];
        const name = st === 4 ? 'major third' : st === 3 ? 'minor third' : `${st} semitones`;
        steps.push(`${a.note}→${b.note} (${name})`);
      });
      note.hidden = false;
      note.textContent = `Tuning boundary: ${steps.join(', ')}. Shapes crossing these strings shift because the open interval is not a perfect fourth.`;
    } else {
      note.hidden = true;
    }
  }

  const tuneEl = document.getElementById('io-tuning-badge');
  if (tuneEl) {
    const names = io.strings.map((s) => s.note).join(' ');
    tuneEl.textContent = `${io.tuningName}: ${names}`;
  }
}

function drawShapeLines(overlay, board, targets) {
  const rootCell = board.querySelector(`.io-cell.io-root`);
  if (!rootCell) return;
  const boardRect = board.getBoundingClientRect();
  overlay.setAttribute('width', board.offsetWidth);
  overlay.setAttribute('height', board.offsetHeight);
  overlay.style.width = board.offsetWidth + 'px';
  overlay.style.height = board.offsetHeight + 'px';

  const r = rootCell.getBoundingClientRect();
  const x1 = r.left - boardRect.left + r.width / 2;
  const y1 = r.top - boardRect.top + r.height / 2;

  targets.forEach(({ string, fret, interval }) => {
    const cell = board.querySelector(`.io-cell[data-string="${string}"][data-fret="${fret}"]`);
    if (!cell) return;
    const c = cell.getBoundingClientRect();
    const x2 = c.left - boardRect.left + c.width / 2;
    const y2 = c.top - boardRect.top + c.height / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'io-shape-line');
    line.dataset.interval = interval;
    overlay.appendChild(line);
  });
}

function orbitVisibleSet() {
  if (!io.root) return null;
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: io.orbitSize,
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: activeIntervals(),
  });
  io.orbit = positions;
  const set = new Set(positions.map((p) => `${p.string}:${p.fret}`));
  set.add(`${io.root.string}:${io.root.fret}`);
  return set;
}

function placeRandomRoot() {
  refreshOpen();
  const root = randomRootPosition(io.openMidis, Math.max(io.fretStart, 1), Math.max(io.fretEnd - 1, io.fretStart + 1));
  io.root = root;
  return root;
}

/* ── Drill: Find ──────────────────────────────────────────────── */

function startFindQuestion() {
  placeRandomRoot();
  const ints = activeIntervals().filter((i) => i !== 0);
  const targetInt = pick(ints.length ? ints : [5, 7, 3, 4]);
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: io.orbitSize,
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: activeIntervals(),
  });
  io.orbit = positions;
  const matches = positionsMatchingInterval(positions, targetInt);
  if (!matches.length) return startFindQuestion();
  const nearest = nearestPosition(positions, targetInt, io.root);
  io.question = {
    type: 'find',
    targetInt,
    matches,
    nearest,
    found: new Set(),
    need: io.findMode === 'every' ? matches.length : 1,
  };
  io.selected = [];
  io.answered = false;
  io.qStart = performance.now();
  const lab = intervalLabel(targetInt, { octaveAs8: io.octaveAs8 });
  const modeHint = io.findMode === 'nearest'
    ? ' (nearest only)'
    : io.findMode === 'every'
      ? ` (all ${matches.length})`
      : '';
  document.getElementById('io-question').innerHTML =
    `Find <span class="highlight">${lab}</span> from the root${modeHint}`;
  clearFeedback();
  const vis = new Set(positions.map((p) => `${p.string}:${p.fret}`));
  vis.add(`${io.root.string}:${io.root.fret}`);
  const shapeTargets = [5, 7, 3, 4, 10].includes(targetInt) && nearest
    ? [{ string: nearest.string, fret: nearest.fret, interval: targetInt }]
    : (io.showShapeLines ? positions.filter((p) => [5, 7, 3, 4].includes(p.interval) && !p.isAnchor).slice(0, 4) : []);
  buildBoard({
    visibleSet: vis,
    interactive: true,
    showAllLabels: false,
    shapeTargets,
    hideShapes: !io.showShapeLines,
    rootHidden: false,
  });
  scheduleRootHide();
}

function scheduleRootHide() {
  if (io._rootHideTimer) clearTimeout(io._rootHideTimer);
  if (!io.hideRootAfterMs) return;
  io._rootHideTimer = setTimeout(() => {
    const cell = document.querySelector('#io-board .io-root');
    if (cell && !io.answered) {
      cell.classList.remove('io-root', 'show-label');
      cell.classList.add('io-empty');
      cell.textContent = '';
    }
  }, io.hideRootAfterMs);
}

function onCellTap(s, f, midi, cell) {
  if (io.answered) return;
  if (io.drill === 'improv') {
    onImprovTap(s, f, midi, cell);
    return;
  }
  if (io.drill === 'identify') return;
  if (io.drill === 'complete') {
    onCompleteTap(s, f, midi, cell);
    return;
  }
  if (io.drill === 'formula') {
    onFormulaTap(s, f, midi, cell);
    return;
  }
  if (io.drill === 'find') {
    onFindTap(s, f, midi, cell);
  }
}

function onFindTap(s, f, midi, cell) {
  const q = io.question;
  if (!q || q.type !== 'find') return;
  const key = `${s}:${f}`;
  const isMatch = q.matches.some((p) => p.string === s && p.fret === f);
  const isNearest = q.nearest && q.nearest.string === s && q.nearest.fret === f;
  let ok = false;
  if (io.findMode === 'nearest') ok = isNearest;
  else if (io.findMode === 'every') {
    if (isMatch && !q.found.has(key)) {
      q.found.add(key);
      cell.classList.add('correct', 'show-label');
      cell.textContent = intervalLabel(q.targetInt);
      ok = q.found.size >= q.need;
      if (!ok) {
        setFeedback(`Found ${q.found.size}/${q.need}…`, true);
        return;
      }
    } else {
      ok = false;
    }
  } else {
    ok = isMatch;
  }

  const ms = performance.now() - io.qStart;
  finishAnswer(ok, {
    expectedInterval: q.targetInt,
    selectedString: s,
    selectedFret: f,
    nearestOk: isNearest,
    crossed: crossesTuningBoundary(io.root.string, s, io.openMidis),
    ms,
  }, () => {
    if (ok) {
      cell.classList.add('correct');
      cell.textContent = intervalLabel(q.targetInt);
      setFeedback(`Correct — ${intervalLabel(q.targetInt)} (${Math.round(ms)} ms)`, true);
      // reveal other matches
      q.matches.forEach((p) => {
        const c = document.querySelector(`#io-board .io-cell[data-string="${p.string}"][data-fret="${p.fret}"]`);
        if (c && c !== cell) c.classList.add('reveal');
      });
    } else {
      cell.classList.add('wrong');
      if (q.nearest) {
        const c = document.querySelector(`#io-board .io-cell[data-string="${q.nearest.string}"][data-fret="${q.nearest.fret}"]`);
        if (c) {
          c.classList.add('reveal', 'show-label');
          c.textContent = intervalLabel(q.targetInt);
        }
      }
      const xb = crossesTuningBoundary(io.root.string, s, io.openMidis);
      let msg = `Not a ${intervalLabel(q.targetInt)}.`;
      if (xb) msg += ' Check the tuning-boundary shift — open strings here are not a perfect fourth apart.';
      setFeedback(msg, false);
    }
  });
}

/* ── Drill: Identify ──────────────────────────────────────────── */

function startIdentifyQuestion() {
  placeRandomRoot();
  const ints = activeIntervals().filter((i) => i !== 0);
  const targetInt = pick(ints.length ? ints : [3, 4, 5, 7]);
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: io.orbitSize,
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: activeIntervals(),
  });
  const matches = positionsMatchingInterval(positions, targetInt);
  if (!matches.length) return startIdentifyQuestion();
  const target = pick(matches);
  io.orbit = positions;
  io.question = { type: 'identify', targetInt, target };
  io.answered = false;
  io.qStart = performance.now();
  document.getElementById('io-question').innerHTML =
    `What interval is the highlighted fret relative to the root?`;
  clearFeedback();
  const vis = new Set(positions.map((p) => `${p.string}:${p.fret}`));
  vis.add(`${io.root.string}:${io.root.fret}`);
  const targetSet = new Set([`${target.string}:${target.fret}`]);
  buildBoard({
    visibleSet: vis,
    interactive: false,
    highlight: { target: targetSet },
    hideShapes: true,
  });
  buildIntervalPicker(activeIntervals(), (semi) => {
    if (io.answered) return;
    const ok = semi === targetInt;
    const ms = performance.now() - io.qStart;
    finishAnswer(ok, {
      expectedInterval: targetInt,
      selectedString: target.string,
      selectedFret: target.fret,
      crossed: target.crossesBoundary,
      ms,
    }, () => {
      setFeedback(ok
        ? `Yes — ${intervalLabel(targetInt)}`
        : `It was ${intervalLabel(targetInt)}`, ok);
      document.querySelectorAll('#io-picker .int-btn').forEach((b) => {
        const v = Number(b.dataset.semi);
        if (v === targetInt) b.classList.add('correct');
        else if (v === semi && !ok) b.classList.add('wrong');
      });
    });
  });
  scheduleRootHide();
}

function buildIntervalPicker(intervals, onPick) {
  const box = document.getElementById('io-picker');
  const label = document.getElementById('io-picker-label');
  if (!box) return;
  box.hidden = false;
  if (label) label.hidden = false;
  box.innerHTML = '';
  intervals.forEach((semi) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'int-btn';
    btn.dataset.semi = semi;
    btn.textContent = intervalLabel(semi, { octaveAs8: io.octaveAs8 });
    btn.onclick = () => onPick(semi);
    box.appendChild(btn);
  });
}

function hidePicker() {
  const box = document.getElementById('io-picker');
  const label = document.getElementById('io-picker-label');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  if (label) label.hidden = true;
}

/* ── Drill: Complete the Orbit ────────────────────────────────── */

function startCompleteQuestion() {
  placeRandomRoot();
  const ints = activeIntervals();
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: Math.min(io.orbitSize, 2),
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: ints,
  });
  // Pick one empty slot per interval (prefer nearest)
  const slots = [];
  ints.filter((i) => i !== 0).forEach((iv) => {
    const n = nearestPosition(positions, iv, io.root);
    if (n) slots.push(n);
  });
  if (slots.length < 3) return startCompleteQuestion();
  const subset = slots.slice(0, Math.min(6, slots.length));
  io.orbit = positions;
  io.question = {
    type: 'complete',
    slots: subset,
    remaining: new Set(subset.map((p) => `${p.string}:${p.fret}`)),
    placed: {},
    activeLabel: null,
  };
  io.answered = false;
  io.qStart = performance.now();
  document.getElementById('io-question').innerHTML =
    `Place interval labels on the empty orbit positions. Select a label, then tap a fret.`;
  clearFeedback();
  const vis = new Set(positions.map((p) => `${p.string}:${p.fret}`));
  vis.add(`${io.root.string}:${io.root.fret}`);
  const ghost = new Set(subset.map((p) => `${p.string}:${p.fret}`));
  buildBoard({
    visibleSet: vis,
    interactive: true,
    highlight: { ghost },
    hideShapes: true,
  });
  // Make ghost cells empty-looking but selectable
  subset.forEach((p) => {
    const c = document.querySelector(`#io-board .io-cell[data-string="${p.string}"][data-fret="${p.fret}"]`);
    if (c) {
      c.classList.remove('io-ghost', 'show-label');
      c.classList.add('io-slot');
      c.textContent = '';
    }
  });
  buildIntervalPicker(subset.map((p) => p.interval).filter((v, i, a) => a.indexOf(v) === i), (semi) => {
    io.question.activeLabel = semi;
    document.querySelectorAll('#io-picker .int-btn').forEach((b) => {
      b.classList.toggle('selected', Number(b.dataset.semi) === semi);
    });
  });
}

function onCompleteTap(s, f, midi, cell) {
  const q = io.question;
  if (!q || q.type !== 'complete' || q.activeLabel == null) {
    setFeedback('Select an interval label first.', false);
    return;
  }
  const key = `${s}:${f}`;
  if (!q.remaining.has(key)) return;
  const slot = q.slots.find((p) => p.string === s && p.fret === f);
  const ok = slot && slot.interval === q.activeLabel;
  if (ok) {
    q.remaining.delete(key);
    q.placed[key] = q.activeLabel;
    cell.classList.add('correct', 'show-label');
    cell.textContent = intervalLabel(q.activeLabel);
    if (!q.remaining.size) {
      const ms = performance.now() - io.qStart;
      finishAnswer(true, {
        expectedInterval: -1,
        selectedString: s,
        selectedFret: f,
        ms,
      }, () => setFeedback('Orbit complete!', true));
    } else {
      setFeedback(`${q.remaining.size} left…`, true);
    }
  } else {
    cell.classList.add('wrong');
    setTimeout(() => cell.classList.remove('wrong'), 400);
    setFeedback(`Not ${intervalLabel(q.activeLabel)} there.`, false);
    const ms = performance.now() - io.qStart;
    // record partial miss without ending
    recordMasteryAttempt({
      interval: slot ? slot.interval : q.activeLabel,
      rootString: io.root.string,
      targetString: s,
      fretDir: f > io.root.fret ? 'ahead' : f < io.root.fret ? 'behind' : 'same',
      stringDist: Math.abs(s - io.root.string),
      crossesBoundary: crossesTuningBoundary(io.root.string, s, io.openMidis),
      tuning: io.tuningName,
      orbitSize: io.orbitSize,
      drillType: 'complete',
    }, false, ms);
  }
}

/* ── Drill: Formula Builder ───────────────────────────────────── */

function startFormulaQuestion() {
  placeRandomRoot();
  const names = Object.keys(CHORD_FORMULAS);
  const name = pick(names);
  const formula = CHORD_FORMULAS[name];
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: Math.max(io.orbitSize, 2),
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: formula,
  });
  io.orbit = positions;
  io.question = {
    type: 'formula',
    name,
    formula,
    needed: new Set(formula.filter((i) => i !== 0)),
    found: new Set(),
    foundKeys: new Set(),
  };
  io.answered = false;
  io.qStart = performance.now();
  document.getElementById('io-question').innerHTML =
    `Build <span class="highlight">${name}</span>: ${formulaLabel(formula)}`;
  clearFeedback();
  hidePicker();
  const vis = new Set(positions.map((p) => `${p.string}:${p.fret}`));
  vis.add(`${io.root.string}:${io.root.fret}`);
  buildBoard({
    visibleSet: vis,
    interactive: true,
    showAllLabels: false,
    hideShapes: true,
  });
}

function onFormulaTap(s, f, midi, cell) {
  const q = io.question;
  if (!q || q.type !== 'formula') return;
  const key = `${s}:${f}`;
  if (s === io.root.string && f === io.root.fret) return;
  const ic = intervalClass(midi, io.root.midi);
  if (q.foundKeys.has(key)) return;
  if (q.needed.has(ic) && !q.found.has(ic)) {
    q.found.add(ic);
    q.foundKeys.add(key);
    cell.classList.add('correct', 'show-label');
    cell.textContent = intervalLabel(ic);
    if (q.found.size >= q.needed.size) {
      const ms = performance.now() - io.qStart;
      finishAnswer(true, {
        expectedInterval: ic,
        selectedString: s,
        selectedFret: f,
        ms,
      }, () => setFeedback(`${q.name} complete!`, true));
    } else {
      setFeedback(`${q.found.size}/${q.needed.size} intervals…`, true);
    }
  } else {
    cell.classList.add('wrong');
    setTimeout(() => cell.classList.remove('wrong'), 400);
    setFeedback(`${intervalLabel(ic)} is not needed for ${q.name}.`, false);
  }
}

/* ── Improv Mode ──────────────────────────────────────────────── */

function loadProgressionFromUI() {
  const presetId = document.getElementById('io-prog-preset')?.value;
  const custom = document.getElementById('io-prog-custom')?.value?.trim();
  const center = document.getElementById('io-tonal-center')?.value || io.tonalCenter;
  io.tonalCenter = center;
  const beats = Number(document.getElementById('io-beats')?.value) || 4;

  if (custom) {
    const events = parseCustomProgression(custom, center, beats);
    if (events) {
      io.progression = events;
      return;
    }
  }
  const preset = PRESET_PROGRESSIONS.find((p) => p.id === presetId) || PRESET_PROGRESSIONS[0];
  io.progression = buildProgressionChords(center, preset.degrees, beats);
  renderProgStrip();
}

function parseCustomProgression(text, center, beats) {
  // Supports "Dm | Bb | F | C" or "i | VI | III | VII"
  const parts = text.split(/[|/,]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const centerP = parseNote(center);
  const centerSemi = centerP ? centerP.semi : 0;

  const romanMap = {
    i: [0, 'minor'], I: [0, 'major'],
    ii: [2, 'minor'], II: [2, 'major'],
    iii: [4, 'minor'], III: [4, 'major'],
    iv: [5, 'minor'], IV: [5, 'major'],
    v: [7, 'minor'], V: [7, 'major'],
    vi: [9, 'minor'], VI: [9, 'major'],
    vii: [11, 'minor'], VII: [11, 'major'],
    '♭ii': [1, 'minor'], 'bii': [1, 'minor'], '♭II': [1, 'major'], bII: [1, 'major'],
    '♭iii': [3, 'minor'], biii: [3, 'minor'], '♭III': [3, 'major'], bIII: [3, 'major'],
    '♭vi': [8, 'minor'], bvi: [8, 'minor'], '♭VI': [8, 'major'], bVI: [8, 'major'],
    '♭vii': [10, 'minor'], bvii: [10, 'minor'], '♭VII': [10, 'major'], bVII: [10, 'major'],
  };

  const events = [];
  for (const part of parts) {
    if (romanMap[part]) {
      const [deg, quality] = romanMap[part];
      events.push(...buildProgressionChords(center, [{ deg, quality }], beats));
      continue;
    }
    const m = part.match(/^([A-Ga-g](?:#|b)?)(.*)$/);
    if (!m) return null;
    const rootStr = m[1][0].toUpperCase() + m[1].slice(1);
    const p = parseNote(rootStr);
    if (!p) return null;
    const rest = (m[2] || '').toLowerCase();
    let quality = 'major';
    if (rest.includes('madd9') || rest.includes('m(add9)')) quality = 'madd9';
    else if (rest.includes('add9')) quality = 'add9';
    else if (rest.includes('maj7') || rest === 'Δ') quality = 'maj7';
    else if (rest === 'm7' || rest === 'min7') quality = 'min7';
    else if (rest === '7') quality = 'dom7';
    else if (rest === 'm' || rest === 'min') quality = 'minor';
    else if (rest === '5' || rest === 'power') quality = 'power';
    else if (rest === 'dim' || rest === '°') quality = 'dim';
    else if (rest === 'aug' || rest === '+') quality = 'aug';
    else if (rest === 'sus2') quality = 'sus2';
    else if (rest === 'sus4') quality = 'sus4';
    const deg = (p.semi - centerSemi + 12) % 12;
    events.push(...buildProgressionChords(center, [{ deg, quality }], beats));
  }
  return events.length ? events : null;
}

function renderProgStrip() {
  const el = document.getElementById('io-prog-strip');
  if (!el) return;
  el.innerHTML = io.progression.map((c, i) =>
    `<span class="io-prog-chord${i === io.progIdx && io.playing ? ' active' : ''}" data-i="${i}">${c.name}</span>`
  ).join('<span class="io-prog-sep">→</span>');
}

function startImprov() {
  stopImprovPlayback();
  loadProgressionFromUI();
  if (!io.progression.length) return;
  placeRandomRoot();
  // For improv, root is tonal center on a comfortable fret
  const centerP = parseNote(io.tonalCenter);
  const want = centerP ? centerP.semi : 0;
  let best = null;
  let bestD = Infinity;
  for (let s = 0; s < io.openMidis.length; s++) {
    for (let f = io.fretStart; f <= io.fretEnd; f++) {
      const midi = io.openMidis[s] + f;
      if (midi % 12 === want) {
        const d = Math.abs(f - 5) + Math.abs(s - 2);
        if (d < bestD) { bestD = d; best = { string: s, fret: f, midi }; }
      }
    }
  }
  if (best) io.root = best;
  io.progIdx = 0;
  io.answered = false;
  document.getElementById('io-question').innerHTML =
    `Improv · <span class="highlight">chord tones</span> · tap targets as the loop plays`;
  clearFeedback();
  hidePicker();
  renderImprovBoard();
  const tip = document.getElementById('io-improv-tip');
  if (tip) {
    tip.hidden = false;
    tip.textContent = 'Allowed: current chord tones. Preview of the next chord appears shortly before the change.';
  }
}

function currentChord() {
  return io.progression[io.progIdx] || null;
}

function renderImprovBoard() {
  const chord = currentChord();
  if (!chord || !io.root) return;
  const keyRoot = io.root.midi;
  const formula = chord.chordFormula || [0, 3, 7];
  const { positions } = collectOrbitPositions({
    rootString: io.root.string,
    rootFret: io.root.fret,
    openMidis: io.openMidis,
    orbitSize: io.orbitSize,
    fretStart: io.fretStart,
    fretEnd: io.fretEnd,
    enabledIntervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  });
  // Highlight chord tones relative to current chord root
  const chordToneKeys = new Set();
  const previewKeys = new Set();
  for (let s = 0; s < io.openMidis.length; s++) {
    for (let f = io.fretStart; f <= io.fretEnd; f++) {
      const midi = io.openMidis[s] + f;
      const ic = ((midi % 12) - chord.rootPitchClass + 12) % 12;
      if (formula.includes(ic)) chordToneKeys.add(`${s}:${f}`);
    }
  }
  const next = io.progression[(io.progIdx + 1) % io.progression.length];
  if (next && io.playing) {
    for (let s = 0; s < io.openMidis.length; s++) {
      for (let f = io.fretStart; f <= io.fretEnd; f++) {
        const midi = io.openMidis[s] + f;
        const ic = ((midi % 12) - next.rootPitchClass + 12) % 12;
        if ((next.chordFormula || []).includes(ic) && !chordToneKeys.has(`${s}:${f}`)) {
          previewKeys.add(`${s}:${f}`);
        }
      }
    }
  }

  const vis = io.orbitSize === 3
    ? null
    : new Set(positions.map((p) => `${p.string}:${p.fret}`));
  if (vis) {
    chordToneKeys.forEach((k) => vis.add(k));
    vis.add(`${io.root.string}:${io.root.fret}`);
  }

  buildBoard({
    visibleSet: vis,
    interactive: true,
    showAllLabels: io.improvPerspective !== 'none',
    chordRootMidi: 60 + chord.rootPitchClass, // only %12 matters for labels
    highlight: {
      revealed: chordToneKeys,
      ghost: previewKeys,
    },
    hideShapes: true,
  });
  // Restyle chord tones
  chordToneKeys.forEach((key) => {
    const [s, f] = key.split(':');
    const c = document.querySelector(`#io-board .io-cell[data-string="${s}"][data-fret="${f}"]`);
    if (c) {
      c.classList.add('io-chord-tone');
      const midi = Number(c.dataset.midi);
      c.textContent = cellLabel(midi, keyRoot, 60 + chord.rootPitchClass);
      c.classList.add('show-label');
    }
  });
  renderProgStrip();
}

function onImprovTap(s, f, midi, cell) {
  const chord = currentChord();
  if (!chord) return;
  const ic = ((midi % 12) - chord.rootPitchClass + 12) % 12;
  const ok = (chord.chordFormula || []).includes(ic);
  cell.classList.add(ok ? 'correct' : 'wrong');
  setTimeout(() => cell.classList.remove('correct', 'wrong'), 350);
  if (!ok) {
    setFeedback(`${intervalLabel(ic)} is outside the active chord-tone set for ${chord.name}.`, false);
  } else {
    clearFeedback();
  }
  // Soft tracking — not a scored quiz answer unless desired
  io.sessionAttempts.push({
    drill: 'improv',
    correct: ok,
    ms: 0,
    interval: ic,
  });
}

/* ── Playback ─────────────────────────────────────────────────── */

function playPadChord(time, chord, beats) {
  const chordDur = (60 / io.bpm) * beats;
  const formula = chord.chordFormula || [0, 4, 7];
  const base = 48 + chord.rootPitchClass; // ~C3 area
  const midis = formula.map((iv, i) => {
    let m = base + iv;
    while (i > 0 && m <= base) m += 12;
    return m;
  });
  // bass
  const bassMidi = 36 + chord.rootPitchClass;
  const voices = [...midis, bassMidi];
  const vol = 0.1 / Math.max(voices.length, 1);
  voices.forEach((midi, idx) => {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(midi);
    osc1.type = idx === voices.length - 1 ? 'triangle' : 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * (idx === voices.length - 1 ? 1 : 1.002);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 3, 3500), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.4, 1800), time + chordDur * 0.5);
    const v = idx === voices.length - 1 ? vol * 1.3 : vol;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(v, time + 0.04);
    gain.gain.setValueAtTime(v, time + chordDur * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.001, time + chordDur);
    osc1.connect(filter); osc2.connect(filter);
    filter.connect(gain); gain.connect(getAnalyserDestination());
    osc1.start(time); osc1.stop(time + chordDur + 0.05);
    osc2.start(time); osc2.stop(time + chordDur + 0.05);
    io._activeOscs.push({ osc: osc1, gain }, { osc: osc2, gain });
  });
  if (io.metronomeOn) {
    for (let b = 0; b < beats; b++) {
      const t = time + b * (60 / io.bpm);
      const click = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      click.frequency.value = b === 0 ? 1200 : 800;
      click.type = 'square';
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      click.connect(g); g.connect(getAnalyserDestination());
      click.start(t); click.stop(t + 0.05);
      io._activeOscs.push({ osc: click, gain: g });
    }
  }
}

function improvScheduler() {
  if (!io.playing) return;
  const ahead = 0.15;
  while (io._nextTime < audioCtx.currentTime + ahead) {
    const chord = io.progression[io.progIdx];
    if (!chord) break;
    playPadChord(io._nextTime, chord, chord.duration || 4);
    const dur = (60 / io.bpm) * (chord.duration || 4);
    io._nextTime += dur;
    io.progIdx = (io.progIdx + 1) % io.progression.length;
    // schedule board refresh slightly before next chord for preview
    const idx = io.progIdx;
    const refreshAt = (io._nextTime - audioCtx.currentTime - 0.35) * 1000;
    setTimeout(() => {
      if (!io.playing) return;
      // progIdx already advanced; render current (which is the one about to play / playing)
      renderImprovBoard();
    }, Math.max(0, refreshAt));
  }
  io._timer = setTimeout(improvScheduler, 40);
}

async function toggleImprovPlayback() {
  if (io.playing) {
    stopImprovPlayback();
    return;
  }
  if (io.drill !== 'improv') {
    io.drill = 'improv';
    selectSidebarDrill('improv');
  }
  startImprov();
  await ensureAudio();
  io.playing = true;
  io.progIdx = 0;
  io._nextTime = audioCtx.currentTime + 0.08;
  showNowPlaying(`Interval Orbit — ${io.tonalCenter} · ${io.bpm} BPM`, stopImprovPlayback);
  const btn = document.getElementById('io-play');
  if (btn) { btn.textContent = 'Pause'; btn.classList.add('playing'); }
  improvScheduler();
  renderImprovBoard();
}

function stopImprovPlayback() {
  io.playing = false;
  if (io._timer) { clearTimeout(io._timer); io._timer = null; }
  if (audioCtx) {
    io._activeOscs.forEach(({ osc, gain }) => {
      try { gain.gain.cancelScheduledValues(audioCtx.currentTime); } catch (_) {}
      try { gain.gain.setValueAtTime(0.001, audioCtx.currentTime); } catch (_) {}
      try { osc.stop(audioCtx.currentTime + 0.05); } catch (_) {}
    });
  }
  io._activeOscs = [];
  hideNowPlaying();
  const btn = document.getElementById('io-play');
  if (btn) { btn.textContent = 'Play Loop'; btn.classList.remove('playing'); }
  renderProgStrip();
}

/* ── Answer bookkeeping ───────────────────────────────────────── */

function finishAnswer(ok, meta, ui) {
  io.answered = true;
  io.total += 1;
  if (ok) { io.right += 1; io.streak += 1; }
  else io.streak = 0;
  updateScore();
  recordAttempt('intervalorbit', ok);
  const fretDir = meta.selectedFret > io.root.fret ? 'ahead'
    : meta.selectedFret < io.root.fret ? 'behind' : 'same';
  recordMasteryAttempt({
    interval: meta.expectedInterval,
    rootString: io.root.string,
    targetString: meta.selectedString,
    fretDir,
    stringDist: Math.abs(meta.selectedString - io.root.string),
    crossesBoundary: !!meta.crossed,
    tuning: io.tuningName,
    orbitSize: io.orbitSize,
    drillType: io.drill,
  }, ok, meta.ms);
  pushSessionAttempt({
    drill: io.drill,
    correct: ok,
    ms: meta.ms,
    interval: meta.expectedInterval,
    nearestOk: meta.nearestOk,
  });
  if (ui) ui();
  renderWeakPanel();
  if (io._advTimer) clearTimeout(io._advTimer);
  io._advTimer = setTimeout(() => {
    if (io.drill !== 'improv') newIoQuestion();
  }, ADVANCE_MS);
}

/* ── Question router ──────────────────────────────────────────── */

function newIoQuestion() {
  if (io._advTimer) { clearTimeout(io._advTimer); io._advTimer = null; }
  if (io._rootHideTimer) { clearTimeout(io._rootHideTimer); io._rootHideTimer = null; }
  hidePicker();
  clearFeedback();
  const tip = document.getElementById('io-improv-tip');
  if (tip) tip.hidden = true;
  if (io.drill === 'improv') {
    startImprov();
    return;
  }
  stopImprovPlayback();
  if (io.drill === 'identify') startIdentifyQuestion();
  else if (io.drill === 'complete') startCompleteQuestion();
  else if (io.drill === 'formula') startFormulaQuestion();
  else startFindQuestion();
}

function resetIoScore() {
  const summary = endSessionSummary();
  io.right = 0; io.total = 0; io.streak = 0;
  io.sessionAttempts = [];
  io.sessionStarted = Date.now();
  updateScore();
  renderHistory();
  if (summary) {
    setFeedback(`Session saved — ${summary.accuracy}% · ${summary.recommendation}`, true);
  }
}

/* ── Sidebar / options ────────────────────────────────────────── */

function selectSidebarDrill(id) {
  const box = document.getElementById('sl-io-drill');
  if (!box) return;
  box.querySelectorAll('.sl-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.val === id);
  });
}

function buildSidebars() {
  const tuneBox = document.getElementById('sl-io-tuning');
  const drillBox = document.getElementById('sl-io-drill');
  const orbitBox = document.getElementById('sl-io-orbit');
  if (!tuneBox || tuneBox.dataset.built) return;

  const tunings = [...guitarTuningNames(), 'Custom'];
  tunings.forEach((name) => {
    const el = document.createElement('div');
    el.className = 'sl-item' + (name === io.tuningName ? ' active' : '');
    el.textContent = name;
    el.dataset.val = name;
    el.onclick = () => {
      tuneBox.querySelectorAll('.sl-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      io.tuningName = name;
      saveSetting('io.tuning', name);
      const customRow = document.getElementById('io-custom-tuning-row');
      if (customRow) customRow.hidden = name !== 'Custom';
      if (name !== 'Custom') newIoQuestion();
    };
    tuneBox.appendChild(el);
  });

  DRILL_TYPES.forEach((d) => {
    const el = document.createElement('div');
    el.className = 'sl-item' + (d.id === io.drill ? ' active' : '');
    el.textContent = d.label;
    el.dataset.val = d.id;
    el.onclick = () => {
      drillBox.querySelectorAll('.sl-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      io.drill = d.id;
      saveSetting('io.drill', d.id);
      document.getElementById('io-improv-panel').hidden = d.id !== 'improv';
      newIoQuestion();
    };
    drillBox.appendChild(el);
  });

  [1, 2, 3].forEach((n) => {
    const el = document.createElement('div');
    el.className = 'sl-item' + (n === io.orbitSize ? ' active' : '');
    el.textContent = ORBIT_DEFS[n].name;
    el.dataset.val = String(n);
    el.onclick = () => {
      orbitBox.querySelectorAll('.sl-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      io.orbitSize = n;
      saveSetting('io.orbitSize', n);
      newIoQuestion();
    };
    orbitBox.appendChild(el);
  });

  tuneBox.dataset.built = '1';
  drillBox.dataset.built = '1';
  orbitBox.dataset.built = '1';
}

function fillSelect(id, options, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  options.forEach((o) => {
    const opt = document.createElement('option');
    if (typeof o === 'string') {
      opt.value = o; opt.textContent = o;
    } else {
      opt.value = o.id || o.value;
      opt.textContent = o.label || o.name;
    }
    el.appendChild(opt);
  });
  if (value != null) el.value = value;
}

function wireOptions() {
  fillSelect('io-stage', Object.entries(STAGE_INTERVALS).map(([k, v]) => ({
    id: k, label: `Stage ${k}: ${v.name}`,
  })), String(io.stage));
  fillSelect('io-label-mode', LABEL_MODES.map((m) => ({ id: m.id, label: m.label })), io.labelMode);
  fillSelect('io-find-mode', [
    { id: 'any', label: 'Any correct answer' },
    { id: 'nearest', label: 'Nearest only' },
    { id: 'every', label: 'Find every occurrence' },
  ], io.findMode);
  fillSelect('io-handedness', [
    { id: 'right', label: 'Right-handed' },
    { id: 'left', label: 'Left-handed' },
  ], io.handedness);
  fillSelect('io-tonal-center', ROOTS, io.tonalCenter);
  fillSelect('io-prog-preset', PRESET_PROGRESSIONS.map((p) => ({
    id: p.id, label: `${p.group}: ${p.name}`,
  })), PRESET_PROGRESSIONS[0].id);
  fillSelect('io-improv-perspective', [
    { id: 'chord', label: 'Chord-relative' },
    { id: 'key', label: 'Key-relative' },
    { id: 'both', label: 'Both (♭3 / 5)' },
    { id: 'none', label: 'No labels' },
  ], io.improvPerspective);

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onchange = fn;
  };

  bind('io-stage', (e) => {
    io.stage = Number(e.target.value) || 1;
    saveSetting('io.stage', io.stage);
    newIoQuestion();
  });
  bind('io-label-mode', (e) => {
    io.labelMode = e.target.value;
    saveSetting('io.labelMode', io.labelMode);
    newIoQuestion();
  });
  bind('io-find-mode', (e) => {
    io.findMode = e.target.value;
    saveSetting('io.findMode', io.findMode);
    if (io.drill === 'find') newIoQuestion();
  });
  bind('io-handedness', (e) => {
    io.handedness = e.target.value;
    saveSetting('io.handedness', io.handedness);
    newIoQuestion();
  });
  bind('io-fret-start', (e) => {
    io.fretStart = Math.max(0, Math.min(24, Number(e.target.value) || 0));
    saveSetting('io.fretStart', io.fretStart);
    newIoQuestion();
  });
  bind('io-fret-end', (e) => {
    io.fretEnd = Math.max(io.fretStart + 1, Math.min(24, Number(e.target.value) || 12));
    saveSetting('io.fretEnd', io.fretEnd);
    newIoQuestion();
  });
  bind('io-octave-8', (e) => {
    io.octaveAs8 = e.target.checked;
    saveSetting('io.octaveAs8', io.octaveAs8);
  });
  bind('io-shape-lines', (e) => {
    io.showShapeLines = e.target.checked;
    saveSetting('io.showShapeLines', io.showShapeLines);
  });
  bind('io-show-boundary', (e) => {
    io.showBoundary = e.target.checked;
    saveSetting('io.showBoundary', io.showBoundary);
    newIoQuestion();
  });
  bind('io-hide-root', (e) => {
    io.hideRootAfterMs = e.target.checked ? 1200 : 0;
    saveSetting('io.hideRootAfterMs', io.hideRootAfterMs);
  });
  bind('io-custom-tuning', (e) => {
    const parsed = parseCustomTuningText(e.target.value);
    const err = document.getElementById('io-custom-tuning-err');
    if (!parsed) {
      if (err) { err.hidden = false; err.textContent = 'Use note+octave list, e.g. C2 G2 C3 F3 A3 D4 (4–8 strings)'; }
      return;
    }
    if (err) err.hidden = true;
    io.customStrings = parsed;
    saveSetting('io.customStrings', parsed);
    newIoQuestion();
  });
  bind('io-tonal-center', (e) => {
    io.tonalCenter = e.target.value;
    saveSetting('io.tonalCenter', io.tonalCenter);
    if (io.drill === 'improv') startImprov();
  });
  bind('io-prog-preset', () => {
    if (io.drill === 'improv') startImprov();
  });
  bind('io-prog-custom', () => {
    const customs = getSetting(CUSTOM_PROGS_KEY, []);
    const val = document.getElementById('io-prog-custom').value.trim();
    if (val) {
      const list = Array.isArray(customs) ? customs : [];
      if (!list.includes(val)) {
        list.unshift(val);
        saveSetting(CUSTOM_PROGS_KEY, list.slice(0, 20));
      }
    }
    if (io.drill === 'improv') startImprov();
  });
  bind('io-improv-perspective', (e) => {
    io.improvPerspective = e.target.value;
    saveSetting('io.improvPerspective', io.improvPerspective);
    if (io.drill === 'improv') renderImprovBoard();
  });
  bind('io-bpm', (e) => {
    io.bpm = Math.max(40, Math.min(220, Number(e.target.value) || 110));
    saveSetting('io.bpm', io.bpm);
  });
  bind('io-metro', (e) => {
    io.metronomeOn = e.target.checked;
    saveSetting('io.metronomeOn', io.metronomeOn);
  });
  bind('io-beats', () => {
    if (io.drill === 'improv') startImprov();
  });

  const play = document.getElementById('io-play');
  if (play) play.onclick = () => toggleImprovPlayback();
}

function loadSettings() {
  io.tuningName = getSetting('io.tuning', 'Standard');
  io.customStrings = getSetting('io.customStrings', null);
  io.handedness = getSetting('io.handedness', 'right');
  io.fretStart = Number(getSetting('io.fretStart', 0)) || 0;
  io.fretEnd = Number(getSetting('io.fretEnd', 12)) || 12;
  io.orbitSize = Number(getSetting('io.orbitSize', 1)) || 1;
  io.stage = Number(getSetting('io.stage', 1)) || 1;
  io.drill = getSetting('io.drill', 'find');
  io.labelMode = getSetting('io.labelMode', 'interval');
  io.octaveAs8 = !!getSetting('io.octaveAs8', false);
  io.showShapeLines = getSetting('io.showShapeLines', true) !== false;
  io.showBoundary = getSetting('io.showBoundary', true) !== false;
  io.hideRootAfterMs = Number(getSetting('io.hideRootAfterMs', 0)) || 0;
  io.findMode = getSetting('io.findMode', 'any');
  io.tonalCenter = getSetting('io.tonalCenter', 'D');
  io.improvPerspective = getSetting('io.improvPerspective', 'chord');
  io.bpm = Number(getSetting('io.bpm', 110)) || 110;
  io.metronomeOn = getSetting('io.metronomeOn', true) !== false;
}

export function initIntervalOrbit() {
  loadSettings();
  buildSidebars();
  if (!io.built) {
    wireOptions();
    // sync option inputs
    const fs = document.getElementById('io-fret-start');
    const fe = document.getElementById('io-fret-end');
    const bpm = document.getElementById('io-bpm');
    const o8 = document.getElementById('io-octave-8');
    const sl = document.getElementById('io-shape-lines');
    const sb = document.getElementById('io-show-boundary');
    const hr = document.getElementById('io-hide-root');
    const metro = document.getElementById('io-metro');
    if (fs) fs.value = io.fretStart;
    if (fe) fe.value = io.fretEnd;
    if (bpm) bpm.value = io.bpm;
    if (o8) o8.checked = io.octaveAs8;
    if (sl) sl.checked = io.showShapeLines;
    if (sb) sb.checked = io.showBoundary;
    if (hr) hr.checked = !!io.hideRootAfterMs;
    if (metro) metro.checked = io.metronomeOn;
    const customRow = document.getElementById('io-custom-tuning-row');
    if (customRow) customRow.hidden = io.tuningName !== 'Custom';
    if (io.customStrings) {
      const ct = document.getElementById('io-custom-tuning');
      if (ct) ct.value = io.customStrings.map((s) => s.note + s.oct).join(' ');
    }
    document.getElementById('io-improv-panel').hidden = io.drill !== 'improv';
    io.built = true;
    io.sessionStarted = Date.now();
  }
  updateScore();
  renderHistory();
  renderWeakPanel();
  newIoQuestion();
}

export function stopIntervalOrbit() {
  stopImprovPlayback();
  if (io._advTimer) { clearTimeout(io._advTimer); io._advTimer = null; }
  if (io._rootHideTimer) { clearTimeout(io._rootHideTimer); io._rootHideTimer = null; }
}

window.newIoQuestion = newIoQuestion;
window.resetIoScore = resetIoScore;
window.toggleImprovPlayback = toggleImprovPlayback;
