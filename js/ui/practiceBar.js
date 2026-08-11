// Persistent Train transport bar bound to the practice session service.
// Pure view over session state. No local metronome or timer ownership.

import {
  getSession,
  endSession,
  toggleMetronome,
  setMetronome,
  setLoop,
  setNotes,
  nextItem,
  previousItem,
  restartItem,
  recordAttempt,
  subscribeSession,
} from '../practice/practiceSession.js';
import { createSessionRecorder } from '../sessionRecorder.js';
import { saveFile } from '../attachments.js';
import { getExercise, invalidateExercisesCache } from '../exercises.js';
import { getSetting, saveSetting } from '../persistence.js';

const SUBDIVISIONS = [
  { id: 'quarter', label: '4ths' },
  { id: 'eighth', label: '8ths' },
  { id: 'triplet', label: 'Trips' },
  { id: 'sixteenth', label: '16ths' },
];

const BPM_STEP = 1;
const BPM_STEP_LARGE = 5;
const BPM_MIN = 30;
const BPM_MAX = 300;
const MAX_TAKES = 50;

let mounted = false;
let hostEl = null;
let barApi = null;
let unsubSession = null;
let recorder = null;
let recording = false;
let notesExpanded = false;
let trayExpanded = false;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function fmtClock(ms) {
  const sec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clampBpm(n) {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(Number(n) || 120)));
}

function activeItem(state) {
  if (!state?.activeItemId) return null;
  return state.items.find((it) => it.id === state.activeItemId) || null;
}

function itemSupportsLoop(item) {
  if (!item) return false;
  if (item.targetType === 'score') return true;
  if (item.targetType === 'exercise') {
    const ex = getExercise(item.targetId);
    if (!ex) return false;
    return !!(ex.loopEnabled || ex.measureStart != null || ex.measureEnd != null);
  }
  return false;
}

function appendExerciseTake(exerciseId, take) {
  const item = getExercise(exerciseId);
  if (!item || !take?.id || !take?.attachmentId) return false;
  const takes = [...(item.takes || []), take].slice(-MAX_TAKES);
  item.takes = takes;
  const store = getSetting('musi.exercises', null);
  if (!store || typeof store !== 'object' || !Array.isArray(store.items)) return false;
  const idx = store.items.findIndex((i) => i.id === exerciseId);
  if (idx < 0) return false;
  store.items[idx] = { ...store.items[idx], takes };
  saveSetting('musi.exercises', store);
  invalidateExercisesCache();
  return true;
}

function setPracticeBarHeight(px) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--practice-bar-h', px);
  }
}

function syncBarHeight() {
  if (!hostEl) return;
  const h = hostEl.offsetHeight || 0;
  setPracticeBarHeight(`${h}px`);
}

function destroyRecorder() {
  if (recorder) {
    try { recorder.destroy(); } catch (_) { /* ignore */ }
    recorder = null;
  }
  recording = false;
}

function setTrayOpen(open) {
  trayExpanded = !!open;
  if (!hostEl) return;
  hostEl.classList.toggle('is-tray-open', trayExpanded);
}

function buildBar() {
  const root = el('div', { class: 'practice-bar', role: 'region', 'aria-label': 'Practice transport' });
  const tray = el('div', { class: 'practice-bar-tray' });
  const row = el('div', { class: 'practice-bar-row practice-bar-transport' });
  const primary = el('div', { class: 'practice-bar-primary' });

  const playBtn = el('button', {
    class: 'practice-bar-btn practice-bar-play',
    type: 'button',
    'aria-label': 'Play metronome',
  });
  playBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Play' }));

  const bpmDown = el('button', {
    class: 'practice-bar-btn practice-bar-bpm-step',
    type: 'button',
    'data-step': String(-BPM_STEP),
    'aria-label': 'Decrease BPM',
  });
  bpmDown.appendChild(el('span', { class: 'practice-bar-btn-label', text: '−' }));

  const bpmDownLarge = el('button', {
    class: 'practice-bar-btn practice-bar-bpm-step practice-bar-bpm-step-lg',
    type: 'button',
    'data-step': String(-BPM_STEP_LARGE),
    'aria-label': 'Decrease BPM by five',
  });
  bpmDownLarge.appendChild(el('span', { class: 'practice-bar-btn-label', text: '−5' }));

  const bpmDisplay = el('span', { class: 'practice-bar-bpm', 'aria-live': 'polite' });
  const bpmValue = el('span', { class: 'practice-bar-bpm-value' });
  const bpmUnit = el('span', { class: 'practice-bar-bpm-unit', text: 'BPM' });
  bpmDisplay.append(bpmValue, bpmUnit);

  const bpmUp = el('button', {
    class: 'practice-bar-btn practice-bar-bpm-step',
    type: 'button',
    'data-step': String(BPM_STEP),
    'aria-label': 'Increase BPM',
  });
  bpmUp.appendChild(el('span', { class: 'practice-bar-btn-label', text: '+' }));

  const bpmUpLarge = el('button', {
    class: 'practice-bar-btn practice-bar-bpm-step practice-bar-bpm-step-lg',
    type: 'button',
    'data-step': String(BPM_STEP_LARGE),
    'aria-label': 'Increase BPM by five',
  });
  bpmUpLarge.appendChild(el('span', { class: 'practice-bar-btn-label', text: '+5' }));

  const subdivSelect = el('select', { class: 'practice-bar-subdiv', 'aria-label': 'Subdivision' });
  SUBDIVISIONS.forEach((s) => {
    subdivSelect.appendChild(el('option', { value: s.id, text: s.label }));
  });

  const elapsedEl = el('span', { class: 'practice-bar-time practice-bar-elapsed', 'aria-live': 'polite' });
  elapsedEl.append(
    el('span', { class: 'practice-bar-time-label', text: 'Elapsed' }),
    el('span', { class: 'practice-bar-time-value' }),
  );

  const countdownEl = el('span', { class: 'practice-bar-time practice-bar-countdown' });
  countdownEl.append(
    el('span', { class: 'practice-bar-time-label', text: 'Left' }),
    el('span', { class: 'practice-bar-time-value' }),
  );

  const loopEl = el('span', { class: 'practice-bar-loop', hidden: 'hidden', 'aria-live': 'polite' });

  const recordBtn = el('button', {
    class: 'practice-bar-btn practice-bar-record',
    type: 'button',
    'aria-label': 'Record take',
  });
  recordBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Record' }));

  const prevBtn = el('button', {
    class: 'practice-bar-btn practice-bar-nav',
    type: 'button',
    'data-nav': 'prev',
    'aria-label': 'Previous item',
  });
  prevBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Prev' }));

  const restartBtn = el('button', {
    class: 'practice-bar-btn practice-bar-nav',
    type: 'button',
    'data-nav': 'restart',
    'aria-label': 'Restart item',
  });
  restartBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Restart' }));

  const nextBtn = el('button', {
    class: 'practice-bar-btn practice-bar-nav',
    type: 'button',
    'data-nav': 'next',
    'aria-label': 'Next item',
  });
  nextBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Next' }));

  const notesToggle = el('button', {
    class: 'practice-bar-btn practice-bar-notes-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': 'Session notes',
  });
  notesToggle.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'Notes' }));

  const endBtn = el('button', {
    class: 'practice-bar-btn practice-bar-end',
    type: 'button',
    'aria-label': 'End session',
  });
  endBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'End' }));

  const moreBtn = el('button', {
    class: 'practice-bar-btn practice-bar-more',
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': 'More practice controls',
  });
  moreBtn.appendChild(el('span', { class: 'practice-bar-btn-label', text: 'More' }));

  const timesWrap = el('div', { class: 'practice-bar-times' });
  timesWrap.append(elapsedEl, countdownEl);

  primary.append(playBtn, bpmDisplay, timesWrap, prevBtn, nextBtn, endBtn, moreBtn);
  tray.append(
    bpmDownLarge,
    bpmDown,
    bpmUp,
    bpmUpLarge,
    subdivSelect,
    loopEl,
    recordBtn,
    restartBtn,
    notesToggle,
  );
  row.append(primary);

  const notesPanel = el('div', { class: 'practice-bar-notes', hidden: 'hidden' });
  const notesArea = el('textarea', {
    class: 'practice-bar-notes-input',
    rows: '2',
    'aria-label': 'Session notes',
    placeholder: 'Session notes…',
  });
  notesPanel.appendChild(notesArea);

  root.append(tray, row, notesPanel);

  return {
    root,
    tray,
    moreBtn,
    playBtn,
    bpmValue,
    subdivSelect,
    elapsedEl,
    countdownEl,
    loopEl,
    recordBtn,
    prevBtn,
    restartBtn,
    nextBtn,
    notesToggle,
    notesPanel,
    notesArea,
    endBtn,
  };
}

function renderState(refs, state) {
  if (!state) {
    refs.root.hidden = true;
    return;
  }
  refs.root.hidden = false;

  const playing = !!state.metronome?.playing;
  refs.playBtn.querySelector('.practice-bar-btn-label').textContent = playing ? 'Pause' : 'Play';
  refs.playBtn.setAttribute('aria-label', playing ? 'Pause metronome' : 'Play metronome');
  refs.playBtn.classList.toggle('is-playing', playing);

  refs.bpmValue.textContent = String(state.metronome?.bpm ?? 120);
  refs.subdivSelect.value = state.metronome?.subdivision || 'quarter';

  const elapsedText = fmtClock(state.elapsedMs);
  refs.elapsedEl.querySelector('.practice-bar-time-value').textContent = elapsedText;
  refs.elapsedEl.setAttribute('aria-label', `Elapsed ${elapsedText}`);
  if (state.timerTargetMs != null) {
    const remain = Math.max(0, state.timerTargetMs - state.elapsedMs);
    const remainText = fmtClock(remain);
    refs.countdownEl.querySelector('.practice-bar-time-value').textContent = remainText;
    refs.countdownEl.setAttribute('aria-label', `Left ${remainText}`);
    refs.countdownEl.hidden = false;
  } else {
    refs.countdownEl.querySelector('.practice-bar-time-value').textContent = '';
    refs.countdownEl.removeAttribute('aria-label');
    refs.countdownEl.hidden = true;
  }

  const item = activeItem(state);
  const loopSupported = itemSupportsLoop(item);
  if (loopSupported) {
    refs.loopEl.hidden = false;
    const on = !!(state.loop?.enabled ?? state.loop);
    refs.loopEl.textContent = on ? 'Loop on' : 'Loop off';
    refs.loopEl.classList.toggle('is-on', on);
  } else {
    refs.loopEl.hidden = true;
  }

  const exerciseBacked = item?.targetType === 'exercise';
  refs.recordBtn.disabled = !exerciseBacked || recording;
  refs.recordBtn.classList.toggle('is-recording', recording);
  refs.recordBtn.querySelector('.practice-bar-btn-label').textContent = recording ? 'Stop' : 'Record';
  if (!exerciseBacked) {
    refs.recordBtn.title = 'Recording is only available for exercise items';
  } else {
    refs.recordBtn.title = recording ? 'Stop recording' : 'Record a practice take';
  }

  const idx = state.activeItemId
    ? state.items.findIndex((it) => it.id === state.activeItemId)
    : -1;
  refs.prevBtn.disabled = idx <= 0;
  refs.nextBtn.disabled = idx < 0 || idx >= state.items.length - 1;
  refs.restartBtn.disabled = !state.activeItemId;

  if (refs.notesArea.value !== (state.notes || '')) {
    refs.notesArea.value = state.notes || '';
  }

  syncBarHeight();
}

async function handleRecord(refs, state) {
  const item = activeItem(state);
  if (!item || item.targetType !== 'exercise') return;

  if (recording && recorder) {
    const result = await recorder.stop();
    recording = false;
    refs.recordBtn.querySelector('.practice-bar-btn-label').textContent = 'Record';
    if (!result?.blob?.size) return;

    const takes = getExercise(item.targetId)?.takes || [];
    const takeNum = takes.length + 1;
    const name = `Take ${takeNum}`;
    const meta = await saveFile({
      blob: result.blob,
      name,
      type: result.mimeType,
      fileName: `${name}.${result.extension}`,
      size: result.blob.size,
      source: 'exercise-take',
    });
    if (!meta) return;

    const take = {
      id: `take-${Date.now().toString(36)}`,
      attachmentId: meta.id,
      name,
      type: result.mimeType,
      durationMs: result.durationMs,
      createdAt: meta.createdAt,
    };
    appendExerciseTake(item.targetId, take);
    try {
      recordAttempt({
        targetType: 'exercise',
        targetId: item.targetId,
        durationMs: result.durationMs,
        cleanTake: true,
      });
    } catch (_) { /* no session */ }
    renderState(refs, getSession());
    return;
  }

  if (!recorder) recorder = createSessionRecorder();
  else {
    recorder.destroy();
    recorder = createSessionRecorder();
  }
  const ok = await recorder.start();
  if (!ok) return;
  recording = true;
  renderState(refs, getSession());
}

function wireHandlers(refs) {
  refs.playBtn.addEventListener('click', () => toggleMetronome());

  refs.root.querySelectorAll('.practice-bar-bpm-step').forEach((btn) => {
    btn.addEventListener('click', () => {
      const session = getSession();
      if (!session) return;
      const step = Number(btn.getAttribute('data-step')) || 0;
      setMetronome({ bpm: clampBpm((session.metronome?.bpm ?? 120) + step) });
    });
  });

  refs.subdivSelect.addEventListener('change', () => {
    setMetronome({ subdivision: refs.subdivSelect.value });
  });

  refs.recordBtn.addEventListener('click', () => {
    handleRecord(refs, getSession()).catch(() => {});
  });

  refs.prevBtn.addEventListener('click', () => previousItem());
  refs.restartBtn.addEventListener('click', () => restartItem());
  refs.nextBtn.addEventListener('click', () => nextItem());

  refs.moreBtn.addEventListener('click', () => {
    const open = !trayExpanded;
    setTrayOpen(open);
    refs.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    refs.moreBtn.querySelector('.practice-bar-btn-label').textContent = open ? 'Less' : 'More';
    syncBarHeight();
  });

  refs.notesToggle.addEventListener('click', () => {
    notesExpanded = !notesExpanded;
    refs.notesPanel.hidden = !notesExpanded;
    refs.notesToggle.setAttribute('aria-expanded', notesExpanded ? 'true' : 'false');
    syncBarHeight();
    if (notesExpanded) refs.notesArea.focus();
  });

  let notesTimer = null;
  refs.notesArea.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => setNotes(refs.notesArea.value), 200);
  });

  refs.loopEl.addEventListener('click', () => {
    const session = getSession();
    if (!session) return;
    const item = activeItem(session);
    if (!itemSupportsLoop(item)) return;
    const on = !!(session.loop?.enabled ?? session.loop);
    setLoop({ enabled: !on });
  });

  refs.endBtn.addEventListener('click', () => {
    destroyRecorder();
    endSession();
  });
}

/**
 * @param {Element} host
 * @returns {{ destroy: () => void, update: () => void }}
 */
export function mountPracticeBar(host) {
  if (!host) throw new TypeError('mountPracticeBar requires a host element');
  if (mounted && barApi) barApi.destroy();

  hostEl = host;
  hostEl.className = 'practice-bar-host';
  hostEl.innerHTML = '';

  const refs = buildBar();
  hostEl.appendChild(refs.root);
  setTrayOpen(false);
  wireHandlers(refs);

  const onSession = (state, meta) => {
    if (!state || meta?.reason === 'end') {
      destroyRecorder();
      hostEl.innerHTML = '';
      hostEl.hidden = true;
      setPracticeBarHeight('0px');
      setTrayOpen(false);
      return;
    }
    hostEl.hidden = false;
    renderState(refs, state);
  };

  unsubSession = subscribeSession(onSession);
  const initial = getSession();
  if (initial) {
    hostEl.hidden = false;
    renderState(refs, initial);
  } else {
    hostEl.hidden = true;
    setPracticeBarHeight('0px');
  }

  const onResize = () => syncBarHeight();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize);
  }

  mounted = true;
  barApi = {
    update() {
      renderState(refs, getSession());
    },
    destroy() {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', onResize);
      }
      if (unsubSession) {
        unsubSession();
        unsubSession = null;
      }
      destroyRecorder();
      if (hostEl) {
        hostEl.innerHTML = '';
        hostEl.hidden = true;
      }
      setPracticeBarHeight('0px');
      mounted = false;
      hostEl = null;
      barApi = null;
      notesExpanded = false;
      trayExpanded = false;
    },
  };
  return barApi;
}

export function isPracticeBarMounted() {
  return mounted;
}
