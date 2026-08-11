import { parseNote } from '../theory.js';
import { resolveTuningPitches } from '../tunings.js';
import { ensureAudio, midiFreq, getAnalyserDestination, audioCtx } from '../audio.js';
import {
  MAP_RANGE_DEFS,
  LEVEL_DEFS,
  openMidisFromTuning,
  makeAnchor,
  rootsMatchingPitchClass,
  collectMapPositions,
  enabledIntervalsForLevel,
  intervalLabel,
  describeInterval,
  noteLabel,
} from '../interval-map/model.js';
import { generateLocate } from '../interval-map/questions.js';
import { createCompanionPanel } from './panel.js';

export const LOCATE_MISS_THRESHOLD = 3;

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const FB_DOUBLE = new Set([12, 24]);

export function cellKey(string, fret) {
  return `${string}:${fret}`;
}

export function pickAnchor(openMidis, rootPc, fretStart, fretEnd) {
  const roots = rootsMatchingPitchClass(openMidis, rootPc, fretStart, fretEnd);
  if (!roots.length) {
    return makeAnchor({ string: 0, fret: fretStart, openMidis });
  }
  roots.sort((a, b) => a.string - b.string || a.fret - b.fret);
  return roots[0];
}

export function buildOrbitContext(companion) {
  const rootP = parseNote(companion.root);
  if (!rootP) return null;
  const pitches = resolveTuningPitches(companion.tuning);
  const openMidis = openMidisFromTuning(pitches);
  const strings = pitches.map((p) => ({
    note: p.note,
    oct: p.oct,
    label: `${p.note}${p.oct}`,
  }));
  const fretStart = companion.fretStart ?? 0;
  const fretEnd = companion.fretEnd ?? 12;
  const mapRange = companion.mapRange ?? 1;
  const level = companion.level ?? 2;
  const anchor = pickAnchor(openMidis, rootP.semi, fretStart, fretEnd);
  const enabledIntervals = enabledIntervalsForLevel(level);
  return {
    companion,
    rootP,
    strings,
    openMidis,
    fretStart,
    fretEnd,
    mapRange,
    level,
    anchor,
    enabledIntervals,
    tuningName: companion.tuning,
  };
}

export function isLocateAnswer(question, string, fret) {
  if (!question?.answers?.length) return false;
  return question.answers.some((a) => a.string === string && a.fret === fret);
}

export function evaluateLocateTap(question, string, fret, state = {}) {
  const attempts = (state.attempts || 0) + 1;
  const correct = isLocateAnswer(question, string, fret);
  if (correct) {
    return {
      correct: true,
      attempts,
      revealed: !!state.revealed,
      resolved: true,
      correctCount: (state.correctCount || 0) + 1,
      totalAttempts: (state.totalAttempts || 0) + 1,
      message: 'Correct!',
    };
  }
  const revealed = state.revealed || attempts >= LOCATE_MISS_THRESHOLD;
  return {
    correct: false,
    attempts,
    revealed,
    resolved: revealed,
    correctCount: state.correctCount || 0,
    totalAttempts: (state.totalAttempts || 0) + 1,
    message: revealed
      ? 'Not quite — answers revealed.'
      : `Try again (${attempts}/${LOCATE_MISS_THRESHOLD}).`,
  };
}

export function generateLocateQuestion(ctx, overrides = {}) {
  const qCtx = {
    openMidis: ctx.openMidis,
    fretStart: ctx.fretStart,
    fretEnd: ctx.fretEnd,
    mapRange: ctx.mapRange,
    level: ctx.level,
    tuningName: ctx.tuningName,
    anchor: ctx.anchor,
    locateMode: 'any',
    ...overrides,
  };
  return generateLocate(qCtx);
}

function renderOrbitBoard(boardEl, {
  strings,
  openMidis,
  fretStart,
  fretEnd,
  anchor,
  positions = [],
  highlight = {},
  emphasizeInterval = null,
  dimOthers = false,
  answersHidden = false,
  revealedKeys = null,
  interactive = true,
  onCellClick = null,
} = {}) {
  if (!boardEl) return { cells: new Map() };
  const count = fretEnd - fretStart + 1;
  const cellMap = new Map();
  boardEl.style.gridTemplateColumns = `2.4rem repeat(${count}, minmax(1.6rem, 1fr))`;
  boardEl.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'ec-orbit-fb-corner';
  boardEl.appendChild(corner);

  for (let f = fretStart; f <= fretEnd; f++) {
    const hdr = document.createElement('div');
    hdr.className = 'ec-orbit-fb-fretnum';
    hdr.textContent = String(f);
    boardEl.appendChild(hdr);
  }

  const posByKey = new Map(positions.map((p) => [cellKey(p.string, p.fret), p]));
  const middle = Math.floor(strings.length / 2);

  for (let s = strings.length - 1; s >= 0; s--) {
    const strLabel = document.createElement('div');
    strLabel.className = 'ec-orbit-fb-strlabel';
    strLabel.textContent = strings[s].label;
    boardEl.appendChild(strLabel);

    for (let f = fretStart; f <= fretEnd; f++) {
      const key = cellKey(s, f);
      const midi = openMidis[s] + f;
      const pos = posByKey.get(key);
      const cell = document.createElement('div');
      cell.className = 'ec-orbit-fb-cell';
      cell.dataset.string = String(s);
      cell.dataset.fret = String(f);
      if (f === 0) cell.classList.add('ec-orbit-nut');
      if (f > 0 && FB_DOTS.includes(f)) {
        const isD = FB_DOUBLE.has(f);
        if (isD ? (s === middle - 1 || s === middle + 1) : s === middle) {
          cell.classList.add('ec-orbit-inlay');
        }
      }

      const isAnchor = anchor && anchor.string === s && anchor.fret === f;
      const hl = highlight[key] || {};

      if (pos) cell.classList.add('ec-orbit-in-map');
      else if (!isAnchor) cell.classList.add('ec-orbit-out');

      if (dimOthers && emphasizeInterval != null && pos && pos.intervalClass !== emphasizeInterval && !isAnchor) {
        cell.classList.add('ec-orbit-dim');
      }
      if (emphasizeInterval != null && pos && pos.intervalClass === emphasizeInterval) {
        cell.classList.add('ec-orbit-emphasis');
      }
      if (pos?.isOctave) cell.classList.add('ec-orbit-octave');
      if (isAnchor || hl.anchor) cell.classList.add('ec-orbit-root');
      if (hl.correct) cell.classList.add('ec-orbit-correct');
      if (hl.wrong) cell.classList.add('ec-orbit-wrong');
      if (hl.reveal) cell.classList.add('ec-orbit-reveal');

      const hideLabel = answersHidden && !isAnchor
        && !(revealedKeys && revealedKeys.has(key))
        && !hl.reveal && !hl.correct;
      let text = '';
      if (!hideLabel && (pos || isAnchor)) {
        const lab = isAnchor ? 'R' : intervalLabel(pos.intervalClass, { octaveAs8: false, convention: 'degree' });
        text = lab;
      }
      cell.textContent = text;

      const stringNo = s + 1;
      const ariaNote = noteLabel(midi);
      let aria;
      if (hideLabel && !isAnchor) {
        aria = `String ${stringNo}, fret ${f}, unrevealed`;
      } else if (isAnchor) {
        aria = `String ${stringNo}, fret ${f}, ${ariaNote}, anchor root`;
      } else if (pos) {
        aria = `String ${stringNo}, fret ${f}, ${ariaNote}, ${describeInterval(pos.intervalClass).name}`;
      } else {
        aria = `String ${stringNo}, fret ${f}, ${ariaNote}`;
      }
      cell.setAttribute('role', interactive ? 'button' : 'gridcell');
      cell.setAttribute('aria-label', aria);
      if (interactive) cell.tabIndex = 0;

      if (interactive && typeof onCellClick === 'function') {
        const activate = (e) => {
          e.preventDefault();
          onCellClick({ string: s, fret: f, midi, pos, key, cell });
        };
        cell.addEventListener('click', activate);
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') activate(e);
        });
      }

      boardEl.appendChild(cell);
      cellMap.set(key, cell);
    }
  }

  return { cells: cellMap };
}

export function mountIntervalOrbit(host, companion, options = {}) {
  const panelOptions = { ...options };
  const userCollapsedChange = options.onCollapsedChange;
  let stopRef = () => {};
  panelOptions.onCollapsedChange = (id, collapsed) => {
    if (collapsed) stopRef();
    userCollapsedChange?.(id, collapsed);
  };

  const shell = createCompanionPanel(host, companion, panelOptions);
  let ctx = buildOrbitContext(companion);
  let toneOscs = [];

  function stopTones() {
    toneOscs.forEach(({ osc, gain }) => {
      try { osc.stop(); } catch (e) { /* noop */ }
      try { gain?.disconnect(); } catch (e) { /* noop */ }
    });
    toneOscs = [];
  }

  function playMidi(midi) {
    if (midi == null) return;
    try {
      ensureAudio();
      stopTones();
      const start = audioCtx.currentTime;
      const freq = midiFreq(midi);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(getAnalyserDestination());
      osc.start(start);
      osc.stop(start + 0.4);
      toneOscs.push({ osc, gain });
      osc.onended = () => {
        toneOscs = toneOscs.filter((x) => x.osc !== osc);
      };
    } catch (e) { /* silent-safe */ }
  }

  const lock = document.createElement('p');
  lock.className = 'ec-sub';

  const chipsRow = document.createElement('div');
  chipsRow.className = 'ec-orbit-chips';
  chipsRow.setAttribute('role', 'group');
  chipsRow.setAttribute('aria-label', 'Interval filter');

  const meta = document.createElement('div');
  meta.className = 'ec-orbit-meta';
  meta.hidden = true;

  const prompt = document.createElement('p');
  prompt.className = 'ec-orbit-prompt';
  prompt.setAttribute('role', 'status');
  prompt.setAttribute('aria-live', 'polite');

  const status = document.createElement('p');
  status.className = 'ec-orbit-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const progress = document.createElement('p');
  progress.className = 'ec-orbit-progress';

  const boardScroll = document.createElement('div');
  boardScroll.className = 'ec-orbit-board-scroll';
  const board = document.createElement('div');
  board.className = 'ec-orbit-board';
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Interval orbit fretboard');
  boardScroll.appendChild(board);

  const controls = document.createElement('div');
  controls.className = 'ec-orbit-controls';
  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'ec-btn ec-orbit-reveal-btn';
  revealBtn.textContent = 'Reveal';
  revealBtn.hidden = true;
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'ec-btn ec-orbit-next-btn';
  nextBtn.textContent = 'Next question';
  nextBtn.hidden = true;
  controls.append(revealBtn, nextBtn);

  shell.body.append(lock, chipsRow, meta, prompt, status, progress, boardScroll, controls);

  let userInteracted = false;
  let selectedInterval = null;
  let locateState = {
    question: null,
    attempts: 0,
    revealed: false,
    resolved: false,
    correctCount: 0,
    totalAttempts: 0,
    wrongKeys: new Set(),
    correctKey: null,
  };

  function lockSummary() {
    if (!ctx) {
      lock.textContent = 'Invalid configuration.';
      return;
    }
    const range = MAP_RANGE_DEFS[ctx.mapRange]?.name || 'Local';
    const lvl = LEVEL_DEFS[ctx.level]?.short || `Level ${ctx.level}`;
    const mode = companion.mode === 'map' ? 'Map' : 'Locate drill';
    lock.textContent = `Locked: ${companion.root} · ${companion.tuning} · frets ${ctx.fretStart}–${ctx.fretEnd} · ${range} · ${lvl} · ${mode}`;
  }

  function markUserInteraction() {
    userInteracted = true;
  }

  function renderChips() {
    chipsRow.innerHTML = '';
    if (!ctx || companion.mode !== 'map') {
      chipsRow.hidden = true;
      return;
    }
    chipsRow.hidden = false;
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'ec-orbit-chip';
    allBtn.textContent = 'All';
    allBtn.setAttribute('aria-pressed', selectedInterval == null ? 'true' : 'false');
    allBtn.addEventListener('click', () => {
      markUserInteraction();
      selectedInterval = null;
      meta.hidden = true;
      renderBoard();
      renderChips();
    });
    chipsRow.appendChild(allBtn);

    for (const ic of ctx.enabledIntervals) {
      const info = describeInterval(ic);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ec-orbit-chip';
      btn.textContent = intervalLabel(ic, { convention: 'degree' });
      btn.title = info.name;
      btn.setAttribute('aria-pressed', selectedInterval === ic ? 'true' : 'false');
      btn.addEventListener('click', () => {
        markUserInteraction();
        selectedInterval = selectedInterval === ic ? null : ic;
        if (selectedInterval != null) {
          meta.hidden = false;
          meta.textContent = '';
          const strong = document.createElement('strong');
          strong.textContent = info.name;
          meta.append(strong, document.createTextNode(` · ${info.compact}`));
        } else {
          meta.hidden = true;
        }
        renderBoard();
        renderChips();
      });
      chipsRow.appendChild(btn);
    }
  }

  function mapPositions() {
    if (!ctx) return [];
    return collectMapPositions({
      anchor: ctx.anchor,
      openMidis: ctx.openMidis,
      mapRange: ctx.mapRange,
      fretStart: ctx.fretStart,
      fretEnd: ctx.fretEnd,
      enabledIntervals: ctx.enabledIntervals,
    });
  }

  function renderBoard() {
    if (!ctx) {
      board.innerHTML = '<p class="ec-empty">Invalid root or tuning.</p>';
      return;
    }

    if (companion.mode === 'map') {
      const positions = mapPositions();
      renderOrbitBoard(board, {
        strings: ctx.strings,
        openMidis: ctx.openMidis,
        fretStart: ctx.fretStart,
        fretEnd: ctx.fretEnd,
        anchor: ctx.anchor,
        positions,
        emphasizeInterval: selectedInterval,
        dimOthers: selectedInterval != null,
        onCellClick: ({ midi, pos }) => {
          markUserInteraction();
          if (userInteracted && (pos || midi != null)) playMidi(midi);
        },
      });
      return;
    }

    const highlight = {};
    const revealedKeys = new Set();
    if (locateState.question?.anchor) {
      const ak = cellKey(locateState.question.anchor.string, locateState.question.anchor.fret);
      highlight[ak] = { anchor: true };
    }
    if (locateState.revealed && locateState.question?.answers) {
      for (const a of locateState.question.answers) {
        const k = cellKey(a.string, a.fret);
        highlight[k] = { reveal: true };
        revealedKeys.add(k);
      }
    }
    for (const k of locateState.wrongKeys) {
      highlight[k] = { ...(highlight[k] || {}), wrong: true };
    }
    if (locateState.correctKey) {
      highlight[locateState.correctKey] = { ...(highlight[locateState.correctKey] || {}), correct: true };
    }

    const positions = locateState.revealed && locateState.question
      ? locateState.question.allAnswers || locateState.question.answers || []
      : [];

    renderOrbitBoard(board, {
      strings: ctx.strings,
      openMidis: ctx.openMidis,
      fretStart: ctx.fretStart,
      fretEnd: ctx.fretEnd,
      anchor: locateState.question?.anchor || ctx.anchor,
      positions,
      highlight,
      answersHidden: !locateState.revealed,
      revealedKeys,
      onCellClick: ({ string, fret, key }) => {
        markUserInteraction();
        if (!locateState.question || locateState.resolved) return;
        const result = evaluateLocateTap(locateState.question, string, fret, locateState);
        locateState.attempts = result.attempts;
        locateState.revealed = result.revealed;
        locateState.resolved = result.resolved;
        locateState.correctCount = result.correctCount;
        locateState.totalAttempts = result.totalAttempts;
        if (result.correct) {
          locateState.correctKey = key;
        } else if (!result.revealed) {
          locateState.wrongKeys.add(key);
        }
        status.textContent = result.message;
        progress.textContent = `${locateState.correctCount} correct · ${locateState.totalAttempts} attempts`;
        revealBtn.hidden = locateState.resolved;
        nextBtn.hidden = !locateState.resolved;
        renderBoard();
      },
    });
  }

  function newLocateQuestion(overrides = {}) {
    if (!ctx) return;
    locateState.question = generateLocateQuestion(ctx, overrides);
    locateState.attempts = 0;
    locateState.revealed = false;
    locateState.resolved = false;
    locateState.wrongKeys = new Set();
    locateState.correctKey = null;
    const info = locateState.question?.intervalInfo;
    prompt.textContent = locateState.question?.prompt
      || (info ? `Find a ${info.name.toLowerCase()} from the anchor root.` : 'Locate the interval.');
    status.textContent = 'Tap the target on the board.';
    revealBtn.hidden = false;
    nextBtn.hidden = true;
    renderBoard();
  }

  function renderMode() {
    lockSummary();
    prompt.hidden = companion.mode !== 'locate';
    progress.hidden = companion.mode !== 'locate';
    controls.hidden = companion.mode !== 'locate';
    status.hidden = companion.mode !== 'locate';
    if (companion.mode === 'map') {
      renderChips();
      renderBoard();
    } else {
      chipsRow.hidden = true;
      meta.hidden = true;
      newLocateQuestion(options.locateOverrides);
    }
  }

  revealBtn.addEventListener('click', onReveal);
  nextBtn.addEventListener('click', onNext);

  function onReveal() {
    markUserInteraction();
    if (!locateState.question || locateState.resolved) return;
    locateState.revealed = true;
    locateState.resolved = true;
    status.textContent = 'Answers revealed.';
    revealBtn.hidden = true;
    nextBtn.hidden = false;
    renderBoard();
  }

  function onNext() {
    markUserInteraction();
    newLocateQuestion(options.locateOverrides);
  }

  function stop() {
    stopTones();
  }
  stopRef = stop;

  renderMode();

  return {
    refresh() {
      ctx = buildOrbitContext(companion);
      selectedInterval = null;
      locateState = {
        question: null,
        attempts: 0,
        revealed: false,
        resolved: false,
        correctCount: locateState.correctCount,
        totalAttempts: locateState.totalAttempts,
        wrongKeys: new Set(),
        correctKey: null,
      };
      renderMode();
    },
    stop,
    destroy() {
      stop();
      revealBtn.removeEventListener('click', onReveal);
      nextBtn.removeEventListener('click', onNext);
      shell.destroy();
    },
  };
}
