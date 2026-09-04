// The Pitch Runner pane of the Audio Studio.
//
// The Audio Studio detects the pitches of a take. This pane turns those
// pitches into a run of the shared pitch-runner game, so the singer plays the
// take back with the microphone. One pane serves both sources: a take from the
// recorder, and an audio stem from the import panel.
//
// The runner engine in js/pitchRunner.js owns the microphone, so only one
// stage plays at a time. This pane mounts one stage and releases it again.

import { mountRunnerExercise } from './runnerExerciseView.js';
import { runner as pitchRunnerEngine } from './pitchRunner.js';
import { runnerConfigFromTranscription } from './runnerExerciseModel.js';
import { addRunnerExercise } from './exercises.js';
import { showAppToast } from './appToast.js';
import { buildAppRoute } from './appRoute.js';

/** The passes the run plays. 0 means the run repeats until the singer stops. */
const PASS_CHOICES = [
  { value: '1', label: '1 pass' },
  { value: '2', label: '2 passes' },
  { value: '4', label: '4 passes' },
  { value: '0', label: 'Endless' },
];

const state = {
  /** The last transcription the Audio Studio sent here. */
  result: null,
  /** The name of the take the notes came from. */
  name: '',
  /** 'record' or 'import'. It names the tab the take came from. */
  origin: '',
  config: null,
  repeats: 1,
  mount: null,
  savedId: null,
  bound: false,
};

function $(id) {
  return document.getElementById(id);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) { /* skip */ }
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

/** Release the runner stage, so the microphone and the timeline go free. */
function unmountStage() {
  if (state.mount) {
    state.mount.destroy();
    state.mount = null;
  }
  const stage = $('as-runner-stage');
  if (stage) stage.innerHTML = '';
}

function setStatus(message, kind = '') {
  const box = $('as-runner-status');
  if (!box) return;
  box.textContent = message || '';
  box.dataset.kind = kind;
  box.hidden = !message;
}

/** The name of the tab that made the run. */
function originLabel() {
  if (state.origin === 'record') return 'from your recording';
  if (state.origin === 'import') return 'from an imported stem';
  return '';
}

/**
 * Name the take above the stage. The runner stage prints the note count, the
 * range, and the tempo below it, so this line names only the take.
 */
function renderSummary() {
  const sourceEl = $('as-runner-source');
  if (!sourceEl) return;
  const where = originLabel();
  sourceEl.textContent = where
    ? `${state.name || 'This take'} · ${where}`
    : (state.name || 'This take');
}

function syncSaveButton() {
  const btn = $('as-runner-save');
  if (!btn) return;
  btn.disabled = !state.config || !!state.savedId;
  btn.textContent = state.savedId ? 'In library' : 'Save to Exercises';
}

/** Show the empty pane while there is no run, and the run when there is one. */
function syncPane() {
  const empty = $('as-runner-empty');
  const body = $('as-runner-body');
  const hasRun = !!state.config;
  if (empty) empty.hidden = hasRun;
  if (body) body.hidden = !hasRun;
  syncSaveButton();
  renderSummary();
}

/**
 * True while the runner engine drives the stage of this pane.
 *
 * Another tool can take the engine, because only one stage plays at a time.
 * The stage of this pane then holds a canvas the engine no longer draws on.
 */
function stageIsBound() {
  const canvas = $('as-runner-stage')?.querySelector('canvas');
  return !!canvas && pitchRunnerEngine.dom?.['pr-canvas'] === canvas;
}

/** Build the run again and mount a fresh stage for it. */
function rebuild({ keepSaved = false } = {}) {
  unmountStage();
  state.config = null;
  if (!keepSaved) state.savedId = null;

  if (!state.result) {
    syncPane();
    setStatus('');
    return;
  }

  const built = runnerConfigFromTranscription(state.result, {
    fileName: state.name,
    repeats: state.repeats,
  });
  if (!built.ok) {
    syncPane();
    setStatus(built.error || 'This take holds no playable notes.', 'err');
    return;
  }

  state.config = built.config;
  syncPane();

  const stage = $('as-runner-stage');
  if (stage) {
    state.mount = mountRunnerExercise(stage, state.config, {
      onFinish: (summary) => {
        const accuracy = Math.round(Number(summary?.accuracy) || 0);
        const score = Math.round(Number(summary?.score) || 0);
        setStatus(`Run done — ${accuracy}% accuracy, ${score} points.`, 'ok');
      },
    });
  }

  const skipped = built.skipped
    ? ` Musi left out ${built.skipped} very short or out-of-range note${built.skipped === 1 ? '' : 's'}.`
    : '';
  setStatus(`Ready to sing ${state.config.notes.length} notes.${skipped}`, 'ok');
}

function onSave() {
  if (!state.config || state.savedId) return;
  const item = addRunnerExercise({
    name: state.name || 'Audio Studio run',
    config: state.config,
  });
  if (!item) {
    setStatus('Could not save this run.', 'err');
    return;
  }
  state.savedId = item.id;
  syncSaveButton();
  setStatus(`Saved “${item.name}” to Exercises.`, 'ok');
  showAppToast('Pitch run saved to Exercises.', { kind: 'info', timeoutMs: 4000 });
}

function onClear() {
  state.result = null;
  state.name = '';
  state.origin = '';
  rebuild();
}

function bind() {
  if (state.bound) return;
  const pass = $('as-runner-passes');
  if (!pass) return;
  state.bound = true;

  pass.innerHTML = '';
  PASS_CHOICES.forEach((choice) => {
    pass.appendChild(el('option', { value: choice.value, text: choice.label }));
  });
  pass.value = String(state.repeats);
  pass.addEventListener('change', () => {
    state.repeats = Math.max(0, Math.round(Number(pass.value) || 0));
    // The run changes, so the library copy of it no longer matches.
    if (state.result) rebuild();
  });

  $('as-runner-save')?.addEventListener('click', onSave);
  $('as-runner-clear')?.addEventListener('click', onClear);
  $('as-runner-go-record')?.addEventListener('click', () => openMode('capture'));
  $('as-runner-go-import')?.addEventListener('click', () => openMode('transcribe'));
}

/**
 * Point the pane at a new take.
 *
 * @param {object|null} result a transcribeBuffer result, or null to clear
 * @param {{ name?: string, origin?: string }} [options]
 * @returns {boolean} true when the take gave the runner a playable run
 */
export function setAudioStudioRun(result, { name = '', origin = '' } = {}) {
  bind();
  state.result = result && Array.isArray(result.notes) && result.notes.length ? result : null;
  state.name = name || 'Audio Studio take';
  state.origin = origin;
  rebuild();
  return !!state.config;
}

/**
 * Open one tab of the Audio Studio.
 *
 * The tab bar reads the address, so a change of the address moves the tab.
 * This keeps the route as the one way to name a tab.
 */
function openMode(mode) {
  if (typeof location === 'undefined') return;
  const next = `#${buildAppRoute({ id: 'audiostudio', params: { mode } })}`;
  if (location.hash === next) return;
  location.hash = next;
}

/** Open the Pitch Runner tab of the Audio Studio. */
export function openAudioStudioRunner() {
  openMode('run');
}

export function initAudioStudioRunner() {
  bind();
  // The Pitch & Ear runner and the exercise player share one engine. One of
  // them can take it while this pane waits in the background, so this mounts
  // the stage again when the engine left it.
  if (state.config && !stageIsBound()) rebuild({ keepSaved: true });
  else syncPane();
}

/** Stop the game, but keep the run. The section calls this when it closes. */
export function stopAudioStudioRunner() {
  state.mount?.stop();
}
