/**
 * Fretboard Interval Map — browser UI controller.
 * Subviews: Map | Quiz | Play | Progress
 */

import { getSetting, saveSetting } from '../persistence.js';
import { recordAttempt } from '../stats.js';
import {
  audioCtx, ensureAudio, midiFreq, getAnalyserDestination,
  requestMicStream, releaseMicStream,
} from '../audio.js';
import { createPitchTracker } from '../pitch.js';
import { noteFromFreq, ROOTS, NOTE_NAMES_SHARP } from '../theory.js';
import { openSelectionSheet } from '../selectionSheet.js';
import { openTuningPicker, openRootPicker } from '../pickers.js';
import {
  initSubviewTabs, renderSetupSummary, renderCompactProgress, escapeHtml,
} from '../uxPrimitives.js';
import { showNowPlaying, hideNowPlaying } from '../nowPlaying.js';
import {
  TUNINGS, resolveTuningPitches, getTuningGeometry, validateTuningPitches,
  createCustomTuningDraft, parseCustomTuningText, searchTunings, TUNING_CATALOG,
} from '../tunings.js';
import {
  MAP_RANGE_DEFS, LEVEL_DEFS, INTERVAL_INFO, ALL_INTERVALS,
  makeAnchor, collectMapPositions, positionsForInterval, shapeVariantsForInterval,
  describeInterval, describeVector, noteLabel, pitchClassName, intervalClass,
  enabledIntervalsForLevel, randomRootPosition, rootsMatchingPitchClass,
  openMidisFromTuning, compareTuningShapes, getIntervalExplanation,
  guitarTuningNames, getNearestPositionsByDirection, CHORD_TONE_INTERVALS,
} from './model.js';
import { scaleIntervalClasses } from '../scales.js';
import { generateValidQuestion, QUIZ_EXERCISES, PLAY_EXERCISES } from './questions.js';
import {
  createRevealState, applyReveal, buildAttemptMeta, pickHint,
  REVEAL_LEVELS, SELF_GRADES,
} from './reveal.js';
import {
  validatePlayedPitch, createSequenceValidator, createStableNoteGate,
  DEFAULT_AUDIO_OPTS,
} from './audioAnswer.js';
import {
  HISTORY_KEY, MASTERY_KEY, MASTERY_V2_KEY, recordMasteryEntry, masteryKeyLegacy,
  aggregateIntervalMastery, aggregateShapeMastery, aggregateAnswerMethodMastery,
  aggregateTuningMastery, summarizeWeaknesses, buildRecommendedSession,
  fretRegion, tuningFamily,
} from './progress.js';
import { renderFretboard, drawShapeLines, visibleShapeLineTargets } from './fretboardView.js';
import {
  CHORD_FORMULAS, PRESET_PROGRESSIONS, QUALITY_FORMULAS, buildProgressionChords,
} from '../intervalOrbitModel.js';

// ─── State ────────────────────────────────────────────────────────────────────

const st = {
  // persisted settings
  tuningName: 'Standard',
  customStrings: null,
  handedness: 'right',
  fretStart: 0,
  fretEnd: 12,
  mapRange: 1,
  level: 2,
  labelMode: 'interval',
  octaveAs8: false,
  showShapeLines: true,
  showBoundary: true,
  exerciseType: 'locate',
  answerMethod: 'fretboard',
  registerMode: 'pitchClass',
  audioTolerance: DEFAULT_AUDIO_OPTS.toleranceCents,
  mapDisplayMode: 'interval',
  intervalFocus: null,
  anchorLocked: false,
  tonalCenter: 'D',
  improvPresetId: 'i-VI-III-VII',
  improvBpm: 100,
  audioCalibrated: false,
  minRms: DEFAULT_AUDIO_OPTS.minRms,
  // runtime
  subview: 'map',
  built: false,
  tabs: null,
  strings: [],
  openMidis: [],
  anchor: null,
  mapInterval: null,
  mapFilter: 'all',
  candidateRoots: [],
  selectingRoot: false,
  question: null,
  revealState: null,
  highlight: {},
  answered: false,
  // score
  right: 0,
  total: 0,
  streak: 0,
  qStart: 0,
  // mastery
  masteryV2: {},
  masteryLegacy: {},
  // audio / mic
  micStream: null,
  micAnalyser: null,
  pitchTracker: null,
  audioRaf: null,
  stableGate: null,
  seqValidator: null,
  guideEndsAt: 0,
  // improv
  improvPlaying: false,
  improvProgIdx: 0,
  improvProgression: [],
  improvTimer: null,
  improvOscs: [],
};

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadSettings() {
  const S = getSetting;
  st.tuningName     = S('io.tuning',        'Standard');
  st.customStrings  = S('io.customStrings',  null);
  st.handedness     = S('io.handedness',     'right',       ['right','left']);
  st.fretStart      = Number(S('io.fretStart', 0));
  st.fretEnd        = Number(S('io.fretEnd',   12));
  st.mapRange       = S('io.orbitSize',      1,             [1, 2, 3]);
  const rawStage    = S('io.stage',          2);
  st.level          = S('io.level',  Math.min(5, Math.max(1, Number(rawStage) || 2)), [1,2,3,4,5]);
  st.labelMode      = S('io.labelMode',      'interval',    ['interval','note','both','blank']);
  st.octaveAs8      = !!S('io.octaveAs8',    false);
  st.showShapeLines = !!S('io.showShapeLines', true);
  st.showBoundary   = !!S('io.showBoundary',   true);
  st.exerciseType   = S('io.exerciseType',   'locate');
  st.answerMethod   = S('io.answerMethod',   'fretboard');
  st.registerMode   = S('io.registerMode',   'pitchClass',  ['pitchClass','exact']);
  st.audioTolerance = Number(S('io.audioTolerance', DEFAULT_AUDIO_OPTS.toleranceCents));
  st.mapDisplayMode = S('io.mapDisplayMode', 'interval',    ['interval','note','both','blank']);
  st.intervalFocus  = S('io.intervalFocus',  null);
  st.anchorLocked   = !!S('io.anchorLocked', false);
  st.tonalCenter    = S('io.tonalCenter',    'D');
  st.improvPresetId = S('io.improvPreset',   'i-VI-III-VII');
  st.improvBpm      = Number(S('io.improvBpm', 100));
  st.audioCalibrated = !!S('io.audioCalibrated', false);
  st.minRms         = Number(S('io.minRms',  DEFAULT_AUDIO_OPTS.minRms));
  const rawSub      = S('subview.intervalorbit', S('io.subview', 'map'));
  const subMap      = { drill: 'quiz', improv: 'play' };
  st.subview = subMap[rawSub] || (['map','quiz','play','progress'].includes(rawSub) ? rawSub : 'map');
  const mv2 = S(MASTERY_V2_KEY, {});
  st.masteryV2    = (mv2 && typeof mv2 === 'object' && !Array.isArray(mv2)) ? mv2 : {};
  const ml  = S(MASTERY_KEY, {});
  st.masteryLegacy = (ml && typeof ml === 'object' && !Array.isArray(ml)) ? ml : {};
}

function persist(key, val) { saveSetting(key, val); }

function saveMastery() {
  persist(MASTERY_V2_KEY, st.masteryV2);
  persist(MASTERY_KEY,    st.masteryLegacy);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function g(id) { return document.getElementById(id); }

function preferredParent() {
  return document.querySelector('#sec-intervalorbit .io-main')
    || document.querySelector('#sec-intervalorbit .quiz-main')
    || document.getElementById('sec-intervalorbit')
    || document.body;
}

function getOrCreate(id, tag = 'div', parentId = 'sec-intervalorbit', cls = '') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (cls) el.className = cls;
    const parent = document.getElementById(parentId)
      || preferredParent();
    parent.appendChild(el);
  }
  return el;
}

function ensurePanel(id, subview) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('data-subview-for', 'io-tabs');
    el.setAttribute('data-subview', subview);
    const host = document.getElementById('sec-intervalorbit');
    const setupEl = document.getElementById('io-setup');
    if (host) {
      if (setupEl) host.insertBefore(el, setupEl.nextSibling);
      else host.appendChild(el);
    }
  }
  return el;
}

function ensureBoardStructure() {
  if (g('io-board')) return;
  const sec = g('sec-intervalorbit');
  if (!sec) return;
  const wrap = document.createElement('div');
  wrap.className = 'io-board-wrap';
  const fbWrap = document.createElement('div');
  fbWrap.className = 'fb-wrap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'io-shape-overlay');
  svg.id = 'io-shape-overlay';
  svg.setAttribute('aria-hidden', 'true');
  const board = document.createElement('div');
  board.className = 'fretboard io-fretboard';
  board.id = 'io-board';
  fbWrap.appendChild(svg);
  fbWrap.appendChild(board);
  wrap.appendChild(fbWrap);
  sec.appendChild(wrap);
}

// ─── Tuning ───────────────────────────────────────────────────────────────────

function refreshTuning() {
  st.strings   = resolveTuningPitches(st.tuningName, st.customStrings);
  st.openMidis = openMidisFromTuning(st.strings);
}

async function openCustomTuningEditor() {
  const draft = st.customStrings
    ? st.customStrings.map((p) => ({ note: p.note, oct: Number(p.oct) }))
    : createCustomTuningDraft(st.strings?.length || 6, st.tuningName === 'Custom' ? 'Standard' : st.tuningName);

  const host = getOrCreate('io-custom-editor', 'div', 'sec-intervalorbit', 'io-custom-editor');
  host.hidden = false;

  function paint() {
    const geometry = getTuningGeometry(draft);
    const validation = validateTuningPitches(draft);
    host.innerHTML = `
      <div class="io-custom-editor-card" role="dialog" aria-label="Custom tuning editor">
        <div class="io-card-title">Custom tuning</div>
        <label class="io-full-label">Strings
          <select id="io-custom-string-count">
            ${[4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === draft.length ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <div class="io-custom-string-rows">
          ${draft.map((p, i) => `
            <div class="io-custom-string-row">
              <span class="io-muted">S${i + 1}</span>
              <input data-i="${i}" data-f="note" value="${escapeHtml(p.note)}" aria-label="String ${i + 1} note" spellcheck="false">
              <input data-i="${i}" data-f="oct" type="number" min="0" max="6" value="${p.oct}" aria-label="String ${i + 1} octave" inputmode="numeric">
            </div>`).join('')}
        </div>
        <p class="io-muted">Adjacent intervals: ${geometry.adjacent.map((a) => a.name).join(' · ')}</p>
        <p class="io-err" ${validation.ok ? 'hidden' : ''}>${escapeHtml((validation.errors || []).join(' '))}</p>
        <div class="io-actions">
          <button type="button" class="btn" id="io-custom-dup">Duplicate current</button>
          <button type="button" class="btn" id="io-custom-cancel">Cancel</button>
          <button type="button" class="btn primary" id="io-custom-save" ${validation.ok ? '' : 'disabled'}>Save</button>
        </div>
      </div>`;

    host.querySelector('#io-custom-string-count').onchange = (e) => {
      const n = Number(e.target.value);
      const next = createCustomTuningDraft(n, 'Standard');
      for (let i = 0; i < Math.min(n, draft.length); i++) next[i] = { ...draft[i] };
      draft.length = 0;
      next.forEach((p) => draft.push(p));
      paint();
    };
    host.querySelectorAll('input[data-i]').forEach((input) => {
      input.onchange = input.oninput = () => {
        const i = Number(input.dataset.i);
        const f = input.dataset.f;
        if (f === 'note') draft[i].note = input.value.trim();
        else draft[i].oct = Number(input.value);
        paint();
      };
    });
    host.querySelector('#io-custom-dup').onclick = () => {
      const base = resolveTuningPitches(st.tuningName === 'Custom' ? 'Standard' : st.tuningName);
      draft.length = 0;
      base.forEach((p) => draft.push({ note: p.note, oct: p.oct }));
      paint();
    };
    host.querySelector('#io-custom-cancel').onclick = () => { host.hidden = true; host.innerHTML = ''; };
    host.querySelector('#io-custom-save').onclick = () => {
      const v = validateTuningPitches(draft);
      if (!v.ok) return;
      st.customStrings = draft.map((p) => ({ note: p.note, oct: Number(p.oct) }));
      st.tuningName = 'Custom';
      persist('io.tuning', 'Custom');
      persist('io.customStrings', st.customStrings);
      refreshTuning();
      host.hidden = true;
      host.innerHTML = '';
      renderSetup();
      onSubviewChange(st.subview);
    };
  }

  paint();
}

// ─── Board render ─────────────────────────────────────────────────────────────

function renderBoard({
  positions = [],
  highlight = {},
  answersHidden = false,
  revealedKeys = null,
  interactive = true,
  emphasizeInterval = null,
  dimOthers = false,
  nearestOnly = false,
  nearestKeys = null,
  onCellClick = null,
} = {}) {
  const board = g('io-board');
  if (!board || !st.strings.length) return;

  renderFretboard(board, {
    strings:          st.strings,
    openMidis:        st.openMidis,
    fretStart:        st.fretStart,
    fretEnd:          st.fretEnd,
    handedness:       st.handedness,
    anchor:           st.anchor,
    positions,
    highlight,
    labelMode:        st.labelMode,
    octaveAs8:        st.octaveAs8,
    showBoundary:     st.showBoundary,
    interactive,
    answersHidden,
    revealedKeys,
    onCellClick,
    emphasizeInterval,
    dimOthers,
    nearestOnly,
    nearestKeys,
  });

  const overlay = g('io-shape-overlay');
  if (overlay) {
    const lineTargets = st.showShapeLines && st.anchor
      ? visibleShapeLineTargets(positions, { answersHidden, revealedKeys, highlight })
      : [];
    if (lineTargets.length) {
      drawShapeLines(overlay, board, st.anchor, lineTargets, st.handedness);
    } else {
      overlay.innerHTML = '';
    }
  }
}

// ─── Setup summary ────────────────────────────────────────────────────────────

function renderSetup() {
  const el = getOrCreate('io-setup');
  const rangeName = (MAP_RANGE_DEFS[st.mapRange] || MAP_RANGE_DEFS[1]).name;
  const levelDef  = LEVEL_DEFS[st.level] || LEVEL_DEFS[1];

  renderSetupSummary(el, [
    {
      key: 'tuning',
      value: st.tuningName,
      hint: 'Tuning',
      onClick: async () => {
        const id = await openTuningPicker({
          value: st.tuningName,
          includeCustom: true,
          onCustom: () => openCustomTuningEditor(),
        });
        if (!id) return;
        if (id === 'Custom') {
          await openCustomTuningEditor();
          return;
        }
        st.tuningName = id;
        st.customStrings = null;
        persist('io.tuning', id);
        persist('io.customStrings', null);
        refreshTuning();
        renderSetup();
        onSubviewChange(st.subview);
      },
    },
    {
      key: 'range',
      value: rangeName,
      hint: 'Range',
      onClick: () => openSelectionSheet({
        title: 'Map Range',
        items: Object.entries(MAP_RANGE_DEFS).map(([k, v]) => ({
          id: String(k), label: v.name,
          sub: k === '1' ? 'Up to 2 strings, 4 frets' : k === '2' ? 'Up to 3 strings, 7 frets' : 'Entire neck',
        })),
        value: String(st.mapRange),
        onSelect: (id) => {
          st.mapRange = Number(id);
          persist('io.orbitSize', st.mapRange);
          renderSetup();
          onSubviewChange(st.subview);
        },
      }),
    },
    {
      key: 'level',
      value: levelDef.short,
      hint: 'Level',
      onClick: () => openSelectionSheet({
        title: 'Curriculum Level',
        items: Object.entries(LEVEL_DEFS).map(([k, v]) => ({
          id: String(k), label: `${v.short}: ${v.name}`, sub: v.lesson,
        })),
        value: String(st.level),
        onSelect: (id) => {
          st.level = Number(id);
          persist('io.level', st.level);
          persist('io.stage', st.level);
          renderSetup();
        },
      }),
    },
    {
      key: 'frets',
      value: `${st.fretStart}–${st.fretEnd}`,
      hint: 'Frets',
      onClick: () => openSelectionSheet({
        title: 'Fret Range',
        items: [
          { id: '0:5',  label: 'Frets 0–5',  sub: 'Nut region' },
          { id: '0:7',  label: 'Frets 0–7',  sub: 'Lower position' },
          { id: '0:12', label: 'Frets 0–12', sub: 'Standard (default)' },
          { id: '3:9',  label: 'Frets 3–9',  sub: 'Mid-neck' },
          { id: '5:12', label: 'Frets 5–12', sub: 'Upper position' },
          { id: '7:15', label: 'Frets 7–15', sub: 'High position' },
          { id: '0:15', label: 'Frets 0–15', sub: 'Extended' },
        ],
        value: `${st.fretStart}:${st.fretEnd}`,
        onSelect: (id) => {
          const [a, b] = id.split(':').map(Number);
          st.fretStart = a; st.fretEnd = b;
          persist('io.fretStart', a); persist('io.fretEnd', b);
          renderSetup();
          onSubviewChange(st.subview);
        },
      }),
    },
    {
      key: 'labels',
      value: st.labelMode,
      hint: 'Labels',
      onClick: () => openSelectionSheet({
        title: 'Label Mode',
        items: [
          { id: 'interval', label: 'Interval (degree)' },
          { id: 'note',     label: 'Note names' },
          { id: 'both',     label: 'Both' },
          { id: 'blank',    label: 'Blank' },
        ],
        value: st.labelMode,
        onSelect: (id) => {
          st.labelMode = id;
          persist('io.labelMode', id);
          renderSetup();
          onSubviewChange(st.subview);
        },
      }),
    },
    {
      key: 'hand',
      value: st.handedness === 'left' ? 'Left-handed' : 'Right-handed',
      hint: 'Hand',
      onClick: () => {
        st.handedness = st.handedness === 'left' ? 'right' : 'left';
        persist('io.handedness', st.handedness);
        renderSetup();
        onSubviewChange(st.subview);
      },
    },
  ]);
}

// ─── Subview extras ───────────────────────────────────────────────────────────

function setVis(id, show) {
  const el = document.getElementById(id);
  if (el) el.hidden = !show;
}

function showSubviewExtras(subview) {
  const isMap = subview === 'map';
  const isQuiz = subview === 'quiz';
  const isPlay = subview === 'play';
  const isProg = subview === 'progress';
  const sec = g('sec-intervalorbit');
  if (sec) {
    sec.classList.toggle('io-mode-progress', isProg);
    sec.classList.toggle('io-mode-play', isPlay);
    sec.classList.toggle('io-mode-quiz', isQuiz);
    sec.classList.toggle('io-mode-map', isMap);
  }
  setVis('io-panel-map',        isMap);
  setVis('io-panel-quiz',       isQuiz);
  setVis('io-panel-play',       isPlay);
  setVis('io-panel-progress',   isProg);
  setVis('io-interval-picker',  isMap);
  setVis('io-anchor-display',   isMap);
  setVis('io-shape-compare',    isMap);
  setVis('io-answer-picker',    isQuiz);
  setVis('io-improv-panel',     isPlay);
  setVis('io-progress-body',    isProg);
  setVis('io-compact-progress', isQuiz || isPlay);
  setVis('io-pitch-live',       isPlay);
  setVis('io-interval-meta',    isMap || isQuiz);
  setVis('io-challenge',        !isProg);
  setVis('io-feedback',         !isProg);
  setVis('io-actions',          !isProg);
  setVis('io-workbench',        !isProg);
  setVis('io-setup',            !isProg);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function renderChallenge(html = '') {
  const el = g('io-challenge');
  if (el) el.innerHTML = html;
}

function renderFeedback(msg = '', ok = null) {
  const el = g('io-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'fb-feedback' + (ok === true ? ' correct' : ok === false ? ' wrong' : '');
}

function renderPitchLive(info) {
  const el = g('io-pitch-live');
  if (!el) return;
  if (!info) { el.textContent = ''; return; }
  const cents = info.cents >= 0 ? `+${info.cents}¢` : `${info.cents}¢`;
  el.textContent = `${info.name}${info.oct} · ${cents}`;
}

function renderCompactScore() {
  const el = g('io-compact-progress');
  if (!el) return;
  const acc = st.total > 0 ? Math.round((st.right / st.total) * 100) : 0;
  renderCompactProgress(el, { streak: st.streak, correct: st.right, total: st.total, accuracy: acc });
}

function renderActions(buttons = []) {
  const el = getOrCreate('io-actions', 'div', 'sec-intervalorbit', 'io-actions');
  el.innerHTML = '';
  buttons.forEach(({ label, id, cls = 'btn', onClick, disabled = false }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (id) btn.id = id;
    btn.className = cls;
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.style.minHeight = '44px';
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
  });
}

// ─── MAP SUBVIEW ──────────────────────────────────────────────────────────────

function mapFilterIntervals() {
  const levInts = new Set(enabledIntervalsForLevel(st.level));
  switch (st.mapFilter) {
    case 'chord': return CHORD_TONE_INTERVALS.filter(i => levInts.has(i) || i === 0);
    case 'scale': return scaleIntervalClasses('Major (Ionian)').filter(i => levInts.has(i) || i === 0);
    case 'one':   return st.mapInterval != null ? [st.mapInterval] : [...levInts];
    default:      return [...levInts];
  }
}

function renderMapView() {
  renderFeedback('');
  renderChallenge('');
  if (!st.anchor) {
    st.anchor = randomRootPosition(st.openMidis, st.fretStart, st.fretEnd);
  }
  renderMapIntervalPicker();
  renderMapBoard();
  renderAnchorDisplay();
  renderMapActions();
}

function renderMapBoard() {
  if (!st.anchor) return;
  const enabledInts = mapFilterIntervals();
  const positions = collectMapPositions({
    anchor: st.anchor,
    openMidis: st.openMidis,
    mapRange: st.mapRange,
    fretStart: st.fretStart,
    fretEnd: st.fretEnd,
    enabledIntervals: enabledInts,
  });

  const hl = {};
  if (st.selectingRoot && st.candidateRoots.length) {
    st.candidateRoots.forEach(p => {
      hl[`${p.string}:${p.fret}`] = { candidateRoot: true };
    });
  }

  renderBoard({
    positions,
    highlight: hl,
    interactive: true,
    emphasizeInterval: st.mapFilter === 'one' ? st.mapInterval : null,
    dimOthers: st.mapFilter === 'one' && st.mapInterval != null,
    onCellClick: handleMapCellClick,
  });

  renderIntervalMeta(st.mapInterval);
}

function handleMapCellClick({ string, fret }) {
  if (st.selectingRoot && st.candidateRoots.length) {
    const match = st.candidateRoots.find(p => p.string === string && p.fret === fret);
    if (match) {
      st.anchor = match;
      st.selectingRoot = false;
      st.candidateRoots = [];
      renderMapBoard();
      renderAnchorDisplay();
      renderFeedback('');
      return;
    }
  }
  st.anchor = makeAnchor({ string, fret, openMidis: st.openMidis });
  st.selectingRoot = false;
  st.candidateRoots = [];
  renderMapBoard();
  renderAnchorDisplay();
}

function navigateAnchor(dir) {
  if (!st.anchor) return;
  const all = rootsMatchingPitchClass(
    st.openMidis, st.anchor.pitchClass, st.fretStart, st.fretEnd
  );
  if (!all.length) return;
  if (dir === 'random') {
    let next = all[Math.floor(Math.random() * all.length)];
    for (let i = 0; i < 6 && next.string === st.anchor.string && next.fret === st.anchor.fret; i++) {
      next = all[Math.floor(Math.random() * all.length)];
    }
    st.anchor = next;
  } else {
    const idx = all.findIndex(p => p.string === st.anchor.string && p.fret === st.anchor.fret);
    st.anchor = all[(idx + (dir === 'next' ? 1 : -1) + all.length) % all.length];
  }
  renderMapBoard();
  renderAnchorDisplay();
}

function renderAnchorDisplay() {
  const el = getOrCreate('io-anchor-display');
  if (!st.anchor) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="io-anchor-info">Anchor: <b>${escapeHtml(noteLabel(st.anchor.midi))}</b>`
    + ` · String ${st.anchor.string + 1} · Fret ${st.anchor.fret}</span>`;
}

function renderMapIntervalPicker() {
  const el = getOrCreate('io-interval-picker');
  const levInts = new Set(enabledIntervalsForLevel(st.level));
  const intList = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const filterBtns = [
    ['all','All'], ['one','One'], ['scale','Scale'], ['chord','Chord tones'],
  ];

  let html = '<div class="int-picker">';
  html += '<div class="io-filter-row" role="group" aria-label="Map filter">';
  filterBtns.forEach(([fid, flabel]) => {
    html += `<button type="button" class="btn io-filter-btn${st.mapFilter === fid ? ' selected' : ''}"
      data-filter="${fid}">${escapeHtml(flabel)}</button>`;
  });
  html += '</div><div class="io-int-chips" role="group" aria-label="Interval selector">';
  intList.forEach(ic => {
    const info = INTERVAL_INFO[ic] || INTERVAL_INFO[ic % 12];
    if (!info) return;
    const enabled = ic === 0 || ic === 12 || levInts.has(ic);
    const sel = st.mapInterval === ic;
    html += `<button type="button" class="int-btn${sel ? ' selected' : ''}${!enabled ? ' io-dim' : ''}"
      data-ic="${ic}" title="${escapeHtml(info.name)}"
      aria-label="${escapeHtml(info.name)}${sel ? ', selected' : ''}"
      aria-pressed="${sel ? 'true' : 'false'}"
      >${escapeHtml(info.quality)}</button>`;
  });
  html += '</div></div>';
  el.innerHTML = html;

  el.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      st.mapFilter = btn.dataset.filter;
      renderMapIntervalPicker();
      renderMapBoard();
    });
  });
  el.querySelectorAll('[data-ic]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ic = Number(btn.dataset.ic);
      st.mapInterval = (st.mapInterval === ic) ? null : ic;
      if (st.mapInterval != null) st.mapFilter = 'one';
      renderMapIntervalPicker();
      renderMapBoard();
    });
  });
}

function renderIntervalMeta(ic) {
  const el = g('io-interval-meta');
  if (!el) return;
  if (ic == null || !st.anchor) { el.innerHTML = ''; return; }
  const info = describeInterval(ic);
  const targetPc = ((st.anchor.pitchClass + (ic === 12 ? 0 : ic)) % 12 + 12) % 12;
  const targetName = NOTE_NAMES_SHARP[targetPc];
  const shapes = shapeVariantsForInterval({
    anchor: st.anchor, openMidis: st.openMidis,
    intervalClass: ic === 12 ? 12 : ic,
    mapRange: st.mapRange, fretStart: st.fretStart, fretEnd: st.fretEnd,
  });
  const varHtml = shapes.variants.slice(0, 3)
    .map(v => `<li>${escapeHtml(v.label)}${v.crossesBoundary
      ? ' <span class="io-bound-badge" style="color:var(--warn);font-size:.7em">⚠ boundary</span>'
      : ''}</li>`)
    .join('');
  el.innerHTML = `<div class="io-interval-meta-card">
    <b>${escapeHtml(info.name)}</b> · ${escapeHtml(info.quality)} · ${escapeHtml(info.degree)} · ${info.semis} st
    · target: <b>${escapeHtml(targetName)}</b>
    <div class="io-muted" style="margin-top:4px;font-size:.8rem">${escapeHtml(info.sound || '')}</div>
    ${varHtml ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:.8rem">${varHtml}</ul>` : ''}
  </div>`;
}

function renderShapeCompare() {
  const el = getOrCreate('io-shape-compare');
  if (!st.anchor || st.mapInterval == null) {
    el.innerHTML = '<p class="io-muted" style="font-size:.82rem">Select an interval chip to see shape explanation.</p>';
    return;
  }
  const positions = positionsForInterval({
    anchor: st.anchor, openMidis: st.openMidis,
    intervalClass: st.mapInterval === 12 ? 12 : st.mapInterval,
    mapRange: 2, fretStart: st.fretStart, fretEnd: st.fretEnd,
  }).filter(p => !p.isAnchor);
  const pos = positions[0] || {
    string: st.anchor.string,
    fret: Math.min(st.fretEnd, st.anchor.fret + (st.mapInterval || 1)),
    midi: st.anchor.midi + (st.mapInterval || 1),
  };
  const exp = getIntervalExplanation({
    anchor: st.anchor, position: pos,
    openMidis: st.openMidis, tuningName: st.tuningName,
  });
  el.innerHTML = `<div class="io-explanation-card" style="font-size:.82rem;margin-top:8px;padding:8px;background:var(--bg2);border-radius:10px">
    <b>${escapeHtml(exp.interval.name)}</b> · ${escapeHtml(exp.vectorLabel)}<br>
    <span class="io-muted">${escapeHtml(exp.boundaryText)}</span>
  </div>`;
}

function renderMapActions() {
  renderActions([
    { label: '← Prev',  cls: 'btn', onClick: () => navigateAnchor('prev') },
    { label: 'Next →',  cls: 'btn', onClick: () => navigateAnchor('next') },
    { label: 'Random',  cls: 'btn', onClick: () => navigateAnchor('random') },
    {
      label: st.anchorLocked ? '🔒 Locked' : '🔓 Lock',
      cls: 'btn',
      onClick: () => {
        st.anchorLocked = !st.anchorLocked;
        persist('io.anchorLocked', st.anchorLocked);
        renderMapActions();
      },
    },
    {
      label: 'Choose root',
      cls: 'btn',
      onClick: async () => {
        const rootNote = await openRootPicker({ value: st.anchor ? pitchClassName(st.anchor.midi) : 'C' });
        if (!rootNote) return;
        const pc = NOTE_NAMES_SHARP.indexOf(rootNote);
        if (pc === -1) return;
        const cands = rootsMatchingPitchClass(st.openMidis, pc, st.fretStart, st.fretEnd);
        if (!cands.length) {
          renderFeedback(`No ${rootNote} in fret range.`, false);
          return;
        }
        st.candidateRoots = cands;
        st.selectingRoot = true;
        renderMapBoard();
        renderFeedback(`Tap a highlighted ${rootNote} to set anchor.`);
      },
    },
    {
      label: 'Explain',
      cls: 'btn',
      onClick: () => renderShapeCompare(),
    },
  ]);
}

// ─── QUIZ SUBVIEW ─────────────────────────────────────────────────────────────

function makeQuizCtx() {
  return {
    openMidis:    st.openMidis,
    tuningName:   st.tuningName,
    mapRange:     st.mapRange,
    level:        st.level,
    fretStart:    st.fretStart,
    fretEnd:      st.fretEnd,
    exerciseType: st.exerciseType,
    anchor:       st.anchorLocked ? st.anchor : null,
    registerMode: st.registerMode,
  };
}

function newQuestion() {
  st.question    = generateValidQuestion(makeQuizCtx());
  st.revealState = createRevealState(st.question);
  st.highlight   = {};
  st.answered    = false;
  st.qStart      = performance.now();
  if (st.question?.anchor) st.anchor = st.question.anchor;
  renderQuestion();
}

function renderQuestion() {
  const q = st.question;
  if (!q) {
    renderChallenge('<em>Press Start to begin.</em>');
    renderActions([{
      label: 'Start',
      cls: 'btn primary',
      onClick: () => newQuestion(),
    }]);
    return;
  }

  renderChallenge(`<span class="fb-q-text">${escapeHtml(q.prompt || '')}</span>`);
  renderFeedback('');

  const positions = quizPositions(q);
  // Mark intentionally shown positions so labels/lines are not treated as hidden answers.
  if (q.shown?.length) {
    for (const p of q.shown) {
      const key = `${p.string}:${p.fret}`;
      st.highlight[key] = { ...(st.highlight[key] || {}), shown: true };
    }
  }
  renderBoard({
    positions,
    highlight: st.highlight,
    answersHidden: shouldHideAnswers(q),
    revealedKeys: buildRevealedKeys(),
    interactive: ['fretboard', 'mixed'].includes(q.inputMethod),
    onCellClick: handleQuizCellClick,
  });

  renderQuizAnswerPicker(q);
  renderQuizActions();
  renderCompactScore();
}

function shouldHideAnswers(q) {
  if (!st.revealState) return false;
  if (st.revealState.revealedAll) return false;
  return q.hideAnswers !== false;
}

function quizPositions(q) {
  if (!q) return [];
  const seen = new Set();
  const out  = [];
  const add = p => {
    if (!p) return;
    const k = `${p.string}:${p.fret}`;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  };
  if (q.shown) q.shown.forEach(add);
  if (q.answers) q.answers.forEach(add);
  return out;
}

function buildRevealedKeys() {
  const rs = st.revealState;
  if (!rs) return null;
  if (rs.revealedAll) return null;
  const keys = new Set();
  if (rs.revealedOne && rs.oneAnswer) {
    keys.add(`${rs.oneAnswer.string}:${rs.oneAnswer.fret}`);
  }
  if (rs.revealedHint && st.question?.nearest) {
    keys.add(`${st.question.nearest.string}:${st.question.nearest.fret}`);
  }
  return keys.size ? keys : null;
}

function handleQuizCellClick({ string, fret }) {
  const q = st.question;
  if (!q || st.answered) return;
  if (['fretboard', 'mixed'].indexOf(q.inputMethod) === -1) return;
  if (q.anchor && string === q.anchor.string && fret === q.anchor.fret) return;

  const key = `${string}:${fret}`;
  const isAnswer = (q.answers || []).some(a => a.string === string && a.fret === fret);

  if (isAnswer) {
    st.highlight[key] = { correct: true };
    const allDone = q.scoring !== 'every' ||
      (q.answers || []).every(a => st.highlight[`${a.string}:${a.fret}`]?.correct);
    if (allDone) finishAnswer(true);
    else { renderFeedback(`${(q.answers || []).filter(a => !st.highlight[`${a.string}:${a.fret}`]?.correct).length} more…`); renderQuestion(); }
  } else {
    st.highlight[key] = { wrong: true };
    renderQuestion();
    setTimeout(() => {
      if (st.highlight[key]?.wrong) {
        delete st.highlight[key];
        renderQuestion();
      }
    }, 600);
    finishAnswer(false);
  }
}

function handleIntervalAnswer(ic) {
  if (st.answered) return;
  finishAnswer(ic === st.question?.intervalClass);
}

function handleNoteAnswer(note) {
  if (st.answered) return;
  const q = st.question;
  finishAnswer(note === q?.correctNote || note === q?.targetNote);
}

function handleChoiceAnswer(choiceId) {
  if (st.answered) return;
  finishAnswer(choiceId === st.question?.correctChoice);
}

function finishAnswer(correct) {
  if (st.answered) return;
  st.answered = true;
  const ms   = performance.now() - st.qStart;
  const meta = buildAttemptMeta(st.revealState, {
    correct, automatic: true,
    inputMethod: st.question?.inputMethod || 'click',
  });
  if (meta.countsAsIndependentAttempt) {
    st.total += 1;
    if (correct) { st.right += 1; st.streak += 1; }
    else st.streak = 0;
    recordAttempt('intervalorbit', correct);
  }
  recordMasteryForQuestion(st.question, correct, ms, st.revealState);
  renderFeedback(correct ? 'Correct!' : 'Not quite.', correct);
  renderQuizActions();
  renderCompactScore();
}

function recordMasteryForQuestion(q, correct, ms, revealState) {
  if (!q?.anchor) return;
  const nearest = q.nearest || q.answers?.[0];
  const rv = revealState?.revealLevel || REVEAL_LEVELS.none;
  const meta = {
    exerciseType:   q.type,
    inputMethod:    q.inputMethod || 'click',
    tuningName:     st.tuningName,
    mapRange:       st.mapRange,
    intervalClass:  q.intervalClass ?? 0,
    rootFret:       q.anchor.fret,
    rootString:     q.anchor.string,
    targetString:   nearest?.string ?? q.anchor.string,
    deltaString:    nearest ? nearest.string - q.anchor.string : 0,
    deltaFret:      nearest ? nearest.fret - q.anchor.fret : 0,
    direction:      nearest
      ? (nearest.fret > q.anchor.fret ? 'ahead' : nearest.fret < q.anchor.fret ? 'behind' : 'same')
      : 'same',
    sameString:     nearest ? nearest.string === q.anchor.string : true,
    crossesBoundary: nearest?.crossesBoundary || false,
    boundaryTypes:  nearest?.boundaryTypes || [],
    revealUsage:    rv,
    registerMode:   st.registerMode,
  };
  const unaided = !revealState || (revealState.revealLevel === REVEAL_LEVELS.none && !revealState.revealedHint);
  recordMasteryEntry(st.masteryV2, meta, {
    correct, ms,
    selfGrade: revealState?.selfGrade,
    unaided,
  });
  const lk = masteryKeyLegacy(meta);
  const row = st.masteryLegacy[lk] || { attempts: 0, correct: 0, totalMs: 0 };
  row.attempts += 1;
  if (correct) row.correct += 1;
  row.totalMs += ms;
  st.masteryLegacy[lk] = row;
  saveMastery();
}

function applyRevealAction(action, payload = {}) {
  if (!st.revealState) return;
  if (action === 'reveal-one') {
    const ans = st.question?.answers?.[0];
    if (ans) payload.position = ans;
  }
  if (action === 'reveal-hint' && st.question) {
    const hint = pickHint(st.question);
    renderFeedback(`Hint: ${hint.text}`);
    payload.kind = hint.kind;
  }
  st.revealState = applyReveal(st.revealState, action, payload);
  renderQuestion();
}

function handleSelfGrade(grade) {
  if (!st.revealState) return;
  st.revealState = applyReveal(st.revealState, 'self-grade', { grade });
  const correct = grade === SELF_GRADES.knew;
  const ms = performance.now() - st.qStart;
  if (correct) { st.right += 1; st.streak += 1; } else st.streak = 0;
  st.total += 1;
  recordAttempt('intervalorbit', correct);
  recordMasteryForQuestion(st.question, correct, ms, st.revealState);
  st.answered = true;
  renderQuizActions();
  renderCompactScore();
  renderFeedback(correct ? 'Great — marked correct.' : 'Noted — keep practicing.', correct);
}

function renderQuizAnswerPicker(q) {
  const el = getOrCreate('io-answer-picker');
  if (!q) { el.innerHTML = ''; return; }

  if (q.inputMethod === 'interval') {
    const levInts = enabledIntervalsForLevel(st.level);
    el.innerHTML = '<div class="int-picker" role="group" aria-label="Interval answer">' +
      levInts.map(ic => {
        const info = INTERVAL_INFO[ic] || {};
        return `<button type="button" class="int-btn" data-ic="${ic}"
          aria-label="${escapeHtml(info.name || String(ic))}"
          >${escapeHtml(info.quality || String(ic))}</button>`;
      }).join('') + '</div>';
    el.querySelectorAll('[data-ic]').forEach(b =>
      b.addEventListener('click', () => handleIntervalAnswer(Number(b.dataset.ic))));

  } else if (q.inputMethod === 'note') {
    el.innerHTML = '<div class="int-picker" role="group" aria-label="Note name answer">' +
      NOTE_NAMES_SHARP.map(n =>
        `<button type="button" class="int-btn" data-note="${n}" aria-label="${n}">${n}</button>`
      ).join('') + '</div>';
    el.querySelectorAll('[data-note]').forEach(b =>
      b.addEventListener('click', () => handleNoteAnswer(b.dataset.note)));

  } else if (q.inputMethod === 'choice' && q.choices?.length) {
    el.innerHTML = '<div class="io-choice-row">' +
      q.choices.map(c =>
        `<button type="button" class="btn" data-choice="${escapeHtml(c.id)}"
          style="min-height:44px">${escapeHtml(c.label)}</button>`
      ).join('') + '</div>';
    el.querySelectorAll('[data-choice]').forEach(b =>
      b.addEventListener('click', () => handleChoiceAnswer(b.dataset.choice)));

  } else {
    el.innerHTML = '';
  }
}

function renderQuizActions() {
  const q  = st.question;
  const rs = st.revealState;
  const btns = [];

  if (!q) {
    btns.push({ label: 'Start', cls: 'btn primary', onClick: () => newQuestion() });
  } else if (st.answered || rs?.graded) {
    btns.push({ label: 'Next →', cls: 'btn primary', id: 'io-next-q', onClick: () => newQuestion() });
  } else {
    if (!rs?.revealedAll) {
      if (!rs?.revealedHint)
        btns.push({ label: 'Hint', cls: 'btn', onClick: () => applyRevealAction('reveal-hint') });
      if (!rs?.revealedOne)
        btns.push({ label: 'Show One', cls: 'btn', onClick: () => applyRevealAction('reveal-one') });
      btns.push({ label: 'Show All', cls: 'btn', onClick: () => applyRevealAction('reveal-all') });
    }
    if (rs?.revealedAll && q.inputMethod === 'self' && !rs.graded) {
      btns.push({ label: 'I knew it',       cls: 'btn primary', onClick: () => handleSelfGrade(SELF_GRADES.knew)        });
      btns.push({ label: 'Almost',          cls: 'btn',         onClick: () => handleSelfGrade(SELF_GRADES.almost)       });
      btns.push({ label: 'Need practice',   cls: 'btn',         onClick: () => handleSelfGrade(SELF_GRADES.needPractice) });
    }
    if (rs?.revealedAll || rs?.revealedOne) {
      btns.push({ label: 'Hide again', cls: 'btn', onClick: () => applyRevealAction('hide-again') });
    }
    btns.push({ label: 'Skip', cls: 'btn', onClick: () => newQuestion() });
  }

  const exLabel = QUIZ_EXERCISES.find(e => e.id === st.exerciseType)?.label || st.exerciseType;
  btns.push({
    label: exLabel,
    cls: 'btn setup-chip',
    onClick: () => openSelectionSheet({
      title: 'Exercise Type',
      items: QUIZ_EXERCISES.map(e => ({ id: e.id, label: e.label })),
      value: st.exerciseType,
      onSelect: (id) => {
        st.exerciseType = id;
        persist('io.exerciseType', id);
        newQuestion();
      },
    }),
  });

  renderActions(btns);
}

function renderQuizView() {
  renderFeedback('');
  renderChallenge('<em>Press Start to begin the quiz.</em>');
  const ap = g('io-answer-picker');
  if (ap) ap.innerHTML = '';
  renderQuizActions();
  renderCompactScore();
  renderBoard({ positions: [], interactive: false });
}

// ─── PLAY SUBVIEW ─────────────────────────────────────────────────────────────

function renderPlayView() {
  renderFeedback('');
  renderChallenge('');
  renderImprovPanel();
  renderPlayActions();
}

async function setupMic() {
  if (st.micStream) return true;
  try {
    ensureAudio();
    const stream = await requestMicStream({ audio: true, video: false });
    st.micStream = stream;
    const src     = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    src.connect(analyser);
    st.micAnalyser = analyser;
    st.pitchTracker = createPitchTracker({ sampleRate: audioCtx.sampleRate, minRms: st.minRms });
    st.stableGate   = createStableNoteGate({
      stableMs: DEFAULT_AUDIO_OPTS.stableMs,
      toleranceCents: st.audioTolerance,
    });
    startAudioLoop();
    return true;
  } catch (e) {
    renderFeedback('Mic access denied or unavailable.', false);
    return false;
  }
}

function teardownMic() {
  stopAudioLoop();
  if (st.micStream) { releaseMicStream(st.micStream); st.micStream = null; }
  st.micAnalyser = null;
  st.pitchTracker = null;
  st.stableGate   = null;
  renderPitchLive(null);
}

function startAudioLoop() {
  stopAudioLoop();
  const loop = () => {
    if (!st.micAnalyser || !st.pitchTracker) return;
    const buf = new Float32Array(st.micAnalyser.fftSize);
    st.micAnalyser.getFloatTimeDomainData(buf);
    const { info } = st.pitchTracker.process(buf);
    if (info?.midi != null) {
      renderPitchLive(info);
      handlePlayedPitch(info);
    } else {
      renderPitchLive(null);
    }
    st.audioRaf = requestAnimationFrame(loop);
  };
  st.audioRaf = requestAnimationFrame(loop);
}

function stopAudioLoop() {
  if (st.audioRaf) { cancelAnimationFrame(st.audioRaf); st.audioRaf = null; }
}

function startPlayQuestion() {
  const playTypes = new Set(PLAY_EXERCISES.map(e => e.id));
  const exType    = playTypes.has(st.exerciseType) ? st.exerciseType : 'play-interval';
  st.question = generateValidQuestion({ ...makeQuizCtx(), exerciseType: exType });
  if (st.question?.anchor) st.anchor = st.question.anchor;
  st.revealState = createRevealState(st.question);
  st.seqValidator = st.question?.sequence
    ? createSequenceValidator(st.question.sequence, {
        toleranceCents: st.audioTolerance,
        registerMode: st.registerMode,
      })
    : null;
  st.highlight = {};
  st.answered  = false;
  st.qStart    = performance.now();
  renderQuestion();
  renderPlayActions(true);
}

function handlePlayedPitch(info) {
  const q = st.question;
  if (!q || q.inputMethod !== 'audio' || st.answered) return;
  const nowMs = performance.now();
  const scoring = nowMs > st.guideEndsAt;
  const gate = st.stableGate?.update(info.midi, info.cents ?? 0, nowMs, { scoring }) || {};
  if (!gate.stable || !gate.released) return;
  const played = gate.released;

  if (st.seqValidator) {
    const res = st.seqValidator.ingest({ midi: played.midi, cents: played.cents ?? 0, nowMs, scoring });
    if (res.complete) {
      finishAnswer(true);
      renderPlayActions(true);
    } else if (res.ok) {
      renderFeedback(`Step ${res.progress}/${res.total} ✓`, true);
    } else if (!res.debounced && res.result?.message) {
      renderFeedback(res.result.message, false);
    }
  } else {
    const result = validatePlayedPitch({
      playedMidi: played.midi,
      playedCents: played.cents ?? 0,
      targetMidi: q.targetMidi,
      anchorMidi: q.anchor?.midi,
      registerMode: q.registerMode || st.registerMode,
      directionMode: 'any',
      toleranceCents: st.audioTolerance,
      intervalClass: q.intervalClass,
    });
    renderFeedback(result.message, result.ok);
    if (result.ok) {
      finishAnswer(true);
      renderPlayActions(true);
    }
  }
}

function playRefTone(midi, durationSec = 0.6) {
  if (!audioCtx) return 0;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = midiFreq(midi);
  gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + durationSec);
  osc.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start();
  osc.stop(audioCtx.currentTime + durationSec + 0.05);
  return audioCtx.currentTime + durationSec;
}

function renderPlayActions(active = false) {
  const hasMic = !!st.micStream;
  const btns   = [];

  if (!hasMic) {
    btns.push({
      label: 'Activate Mic', cls: 'btn primary',
      onClick: async () => {
        const ok = await setupMic();
        if (ok) renderPlayActions(false);
      },
    });
  } else {
    btns.push({
      label: 'Stop Mic', cls: 'btn',
      onClick: () => { teardownMic(); renderPlayActions(false); },
    });
    if (!active) {
      btns.push({ label: 'Start', cls: 'btn primary', onClick: () => startPlayQuestion() });
    } else {
      btns.push({ label: 'Next', cls: 'btn primary', onClick: () => startPlayQuestion() });
      if (st.question?.anchor) {
        btns.push({
          label: 'Play root', cls: 'btn',
          onClick: () => {
            ensureAudio();
            if (!st.question?.anchor) return;
            const ends = playRefTone(st.question.anchor.midi, 0.8);
            if (ends && audioCtx) {
              st.guideEndsAt = performance.now() + (ends - audioCtx.currentTime) * 1000 + 50;
            }
          },
        });
      }
    }
    const exLabel = PLAY_EXERCISES.find(e => e.id === st.exerciseType)?.label || st.exerciseType;
    btns.push({
      label: exLabel, cls: 'btn setup-chip',
      onClick: () => openSelectionSheet({
        title: 'Play Exercise',
        items: PLAY_EXERCISES.map(e => ({ id: e.id, label: e.label })),
        value: st.exerciseType,
        onSelect: (id) => { st.exerciseType = id; persist('io.exerciseType', id); renderPlayActions(false); },
      }),
    });
  }

  btns.push({
    label: st.improvPlaying ? 'Stop Improv' : 'Chord-Tone Improv',
    cls: 'btn',
    onClick: () => st.improvPlaying ? stopImprov() : startImprov(),
  });

  renderActions(btns);
}

// ─── IMPROV ───────────────────────────────────────────────────────────────────

function renderImprovPanel() {
  const el = getOrCreate('io-improv-panel');
  const presets = PRESET_PROGRESSIONS.slice(0, 10);
  el.innerHTML = `
    <div class="io-improv-panel" style="padding:10px 0">
      <div class="io-card-title">Chord-Tone Improv</div>
      <div class="io-improv-controls">
        <label>Progression
          <select id="io-prog-preset">${presets.map(p =>
            `<option value="${escapeHtml(p.id)}"${p.id === st.improvPresetId ? ' selected' : ''
            }>${escapeHtml(p.name)}</option>`).join('')}</select>
        </label>
        <label>Root
          <select id="io-tonal-center">${NOTE_NAMES_SHARP.map(n =>
            `<option${n === st.tonalCenter ? ' selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <label>BPM
          <input type="number" id="io-improv-bpm" min="40" max="240" value="${st.improvBpm}">
        </label>
      </div>
      ${(() => { const p = presets.find(x => x.id === st.improvPresetId); return p?.tip ? `<p class="io-improv-tip">${escapeHtml(p.tip)}</p>` : ''; })()}
      <div class="io-prog-strip" id="io-prog-strip"></div>
      <div class="io-improv-transport">
        <button type="button" class="btn primary" id="io-improv-toggle" style="min-height:44px">
          ${st.improvPlaying ? 'Stop Improv' : 'Play Improv'}
        </button>
      </div>
    </div>`;

  g('io-prog-preset')?.addEventListener('change', e => {
    st.improvPresetId = e.target.value;
    persist('io.improvPreset', st.improvPresetId);
    if (st.improvPlaying) { stopImprov(); startImprov(); }
    else renderImprovPanel();
  });
  g('io-tonal-center')?.addEventListener('change', e => {
    st.tonalCenter = e.target.value;
    if (st.improvPlaying) { stopImprov(); startImprov(); }
  });
  g('io-improv-bpm')?.addEventListener('change', e => {
    st.improvBpm = Math.max(40, Math.min(240, Number(e.target.value) || 100));
    persist('io.improvBpm', st.improvBpm);
  });
  g('io-improv-toggle')?.addEventListener('click', () =>
    st.improvPlaying ? stopImprov() : startImprov()
  );

  renderProgStrip();
}

function buildImprovProgression() {
  const preset = PRESET_PROGRESSIONS.find(p => p.id === st.improvPresetId) || PRESET_PROGRESSIONS[0];
  st.improvProgression = buildProgressionChords(st.tonalCenter, preset.degrees, 4);
}

function renderProgStrip() {
  const el = g('io-prog-strip');
  if (!el) return;
  if (!st.improvProgression.length) { el.innerHTML = ''; return; }
  el.innerHTML = st.improvProgression.map((c, i) =>
    `<span class="io-prog-chord${i === st.improvProgIdx ? ' active' : ''}">${escapeHtml(c.name)}</span>`
    + (i < st.improvProgression.length - 1 ? '<span class="io-prog-sep"> → </span>' : '')
  ).join('');
}

function startImprov() {
  ensureAudio();
  buildImprovProgression();
  st.improvPlaying  = true;
  st.improvProgIdx  = 0;
  showNowPlaying('Interval Map — Improv', stopImprov);
  improvTick();
  renderImprovPanel();
  renderPlayActions(false);
}

function stopImprov() {
  st.improvPlaying = false;
  clearTimeout(st.improvTimer);
  stopImprovOscs();
  hideNowPlaying();
  renderImprovPanel();
  renderPlayActions(false);
}

function stopImprovOscs() {
  st.improvOscs.forEach(o => { try { o.stop(); } catch (_) { /* noop */ } });
  st.improvOscs = [];
}

function improvTick() {
  if (!st.improvPlaying) return;
  const chord = st.improvProgression[st.improvProgIdx];
  if (!chord) { st.improvProgIdx = 0; improvTick(); return; }

  const msPerBeat  = (60 / Math.max(40, st.improvBpm)) * 1000;
  const chordMs    = (chord.duration || 4) * msPerBeat;

  playImprovChord(chord, chordMs / 1000);
  renderProgStrip();
  updateImprovBoard(chord);

  st.improvProgIdx = (st.improvProgIdx + 1) % st.improvProgression.length;
  st.improvTimer   = setTimeout(() => improvTick(), chordMs);
}

function playImprovChord(chord, durSec) {
  if (!audioCtx) return;
  stopImprovOscs();
  const fadeDur = durSec * 0.9;
  const rootMidi = 48 + (chord.rootPitchClass || 0);
  (chord.chordFormula || [0, 4, 7]).forEach(semi => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiFreq(rootMidi + semi);
    gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeDur);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start();
    osc.stop(audioCtx.currentTime + fadeDur + 0.05);
    st.improvOscs.push(osc);
  });
}

function updateImprovBoard(chord) {
  if (!st.anchor) return;
  const formula = chord.chordFormula || [0, 4, 7];
  const positions = collectMapPositions({
    anchor: st.anchor, openMidis: st.openMidis,
    mapRange: st.mapRange, fretStart: st.fretStart, fretEnd: st.fretEnd,
    enabledIntervals: formula,
  });
  renderBoard({ positions, interactive: false });
  renderChallenge(`<b>${escapeHtml(chord.name)}</b> — chord tones highlighted`);
}

// ─── PROGRESS SUBVIEW ─────────────────────────────────────────────────────────

function renderProgressView() {
  const el = getOrCreate('io-progress-body');
  el.innerHTML = '';

  const intervalRows = aggregateIntervalMastery(st.masteryV2);
  const shapeRows    = aggregateShapeMastery(st.masteryV2).filter(r => r.attempts > 0);
  const methodRows   = aggregateAnswerMethodMastery(st.masteryV2);
  const tuningRows   = aggregateTuningMastery(st.masteryV2);
  const weaknesses   = summarizeWeaknesses(st.masteryV2);
  const rec          = buildRecommendedSession(st.masteryV2, {
    tuningName: st.tuningName, level: st.level, mapRange: st.mapRange,
  });

  if (!intervalRows.length) {
    el.appendChild(makeEl('p', 'io-muted', 'Complete some quizzes to see progress data here.'));
  }

  appendMasterySection(el, 'Interval Mastery', intervalRows);
  appendMasterySection(el, 'Shape Mastery',    shapeRows);
  appendMasterySection(el, 'Answer Method',    methodRows);
  appendMasterySection(el, 'Tuning Family',    tuningRows);

  if (weaknesses.length) {
    const div = makeEl('div', 'io-stats-card');
    div.innerHTML = '<div class="io-card-title" style="margin-top:12px">Weaknesses</div>';
    weaknesses.forEach(w => {
      const row = makeEl('div', 'io-weak-row');
      row.innerHTML = `<span>${escapeHtml(w.label)}</span>
        <b>${Math.round((w.accuracy ?? 0) * 100)}% (${w.attempts}×)</b>`;
      div.appendChild(row);
    });
    el.appendChild(div);
  }

  if (rec) {
    const recDiv = makeEl('div', 'io-stats-card');
    recDiv.style.marginTop = '12px';
    recDiv.innerHTML = `<div class="io-card-title">Recommended Session</div>
      <div class="io-muted" style="white-space:pre-line;margin-bottom:8px">${escapeHtml(rec.summaryText)}</div>`;
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn primary';
    startBtn.textContent = 'Start Session';
    startBtn.style.minHeight = '44px';
    startBtn.addEventListener('click', () => startRecommendedSession(rec));
    recDiv.appendChild(startBtn);
    el.appendChild(recDiv);
  }

  const resetDiv = makeEl('div', '');
  resetDiv.style.marginTop = '16px';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn';
  resetBtn.textContent = 'Reset progress data';
  resetBtn.style.minHeight = '44px';
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all Interval Map progress data?')) return;
    st.masteryV2 = {}; st.masteryLegacy = {};
    saveMastery();
    renderProgressView();
  });
  resetDiv.appendChild(resetBtn);
  el.appendChild(resetDiv);
}

function makeEl(tag, cls, text = '') {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function appendMasterySection(parent, title, rows) {
  if (!rows.length) return;
  const sec = makeEl('div', 'io-stats-card');
  sec.innerHTML = `<div class="io-card-title">${escapeHtml(title)}</div>`;
  rows.forEach(r => {
    const pct  = r.accuracy != null ? Math.round(r.accuracy * 100) : null;
    const barW = pct != null ? Math.max(0, Math.min(60, pct * 0.6)) : 0;
    const row  = makeEl('div', 'io-hist-row');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px';
    row.innerHTML = `<span>${escapeHtml(r.label)}</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="display:inline-block;width:${barW}px;height:4px;background:var(--accent);border-radius:2px"></span>
        <b>${pct != null ? pct + '%' : '—'}</b>
        <span class="io-muted">(${r.attempts}×)</span>
      </span>`;
    sec.appendChild(row);
  });
  parent.appendChild(sec);
}

function startRecommendedSession(rec) {
  if (rec.tuningName && TUNINGS[rec.tuningName]) {
    st.tuningName = rec.tuningName;
    persist('io.tuning', rec.tuningName);
    refreshTuning();
  }
  if (rec.level)     { st.level    = rec.level;    persist('io.level', st.level);       }
  if (rec.mapRange)  { st.mapRange = rec.mapRange; persist('io.orbitSize', st.mapRange); }
  if (rec.exerciseType) { st.exerciseType = rec.exerciseType; persist('io.exerciseType', st.exerciseType); }
  renderSetup();
  const target = rec.subview || 'quiz';
  if (st.tabs) st.tabs.setActive(target);
  else onSubviewChange(target);
}

// ─── SUBVIEW ROUTING ──────────────────────────────────────────────────────────

function onSubviewChange(id) {
  st.subview = id;
  persist('io.subview', id);
  showSubviewExtras(id);
  renderFeedback('');

  switch (id) {
    case 'map':      refreshTuning(); renderMapView();      break;
    case 'quiz':     refreshTuning(); renderQuizView();     break;
    case 'play':     refreshTuning(); renderPlayView();     break;
    case 'progress': renderProgressView();                  break;
  }
}

// ─── INIT / STOP ──────────────────────────────────────────────────────────────

export function initIntervalMap() {
  if (st.built) {
    refreshTuning();
    onSubviewChange(st.subview);
    return;
  }

  loadSettings();
  refreshTuning();

  // Ensure all required DOM nodes exist
  getOrCreate('io-tabs');
  getOrCreate('io-setup');
  getOrCreate('io-compact-progress');
  ensurePanel('io-panel-map',      'map');
  ensurePanel('io-panel-quiz',     'quiz');
  ensurePanel('io-panel-play',     'play');
  ensurePanel('io-panel-progress', 'progress');
  ensureBoardStructure();
  getOrCreate('io-challenge',     'div', 'sec-intervalorbit', 'fb-question');
  getOrCreate('io-interval-meta', 'div', 'sec-intervalorbit', '');
  getOrCreate('io-actions',       'div', 'sec-intervalorbit', 'io-actions');
  getOrCreate('io-feedback',      'div', 'sec-intervalorbit', 'fb-feedback');
  getOrCreate('io-pitch-live',    'div', 'sec-intervalorbit', 'io-pitch-live');
  getOrCreate('io-interval-picker');
  getOrCreate('io-anchor-display');
  getOrCreate('io-shape-compare');
  getOrCreate('io-answer-picker');
  getOrCreate('io-improv-panel');
  getOrCreate('io-progress-body');

  // Panel hints
  ['quiz', 'play', 'progress'].forEach(sv => {
    const panel = g(`io-panel-${sv}`);
    if (panel && !panel.dataset.wired) {
      panel.dataset.wired = '1';
      // Panels are intentionally left empty — subview content lives in shared area
    }
  });

  renderSetup();

  const tabs = initSubviewTabs(g('io-tabs'), [
    { id: 'map',      label: 'Map'      },
    { id: 'quiz',     label: 'Quiz'     },
    { id: 'play',     label: 'Play'     },
    { id: 'progress', label: 'Progress' },
  ], {
    settingsKey: 'subview.intervalorbit',
    defaultId:   st.subview,
    onChange:    onSubviewChange,
  });
  st.tabs = tabs;

  // Globals for HTML onclick compat
  window.newIoQuestion = () => {
    if (st.subview === 'quiz') newQuestion();
    else if (st.subview === 'play') startPlayQuestion();
  };
  window.resetIoScore = () => {
    st.right = 0; st.total = 0; st.streak = 0;
    renderCompactScore();
  };
  window.toggleImprovPlayback = () => {
    st.improvPlaying ? stopImprov() : startImprov();
  };

  st.built = true;
  onSubviewChange(st.subview);
}

export function stopIntervalMap() {
  teardownMic();
  if (st.improvPlaying) stopImprov();
  stopAudioLoop();
  clearTimeout(st.improvTimer);
  hideNowPlaying();
}
