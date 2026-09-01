// Composition Lab.
//
// This is the workspace that replaced the Chords and Scales screen of Practice
// Lab. Chords and Scales did not go away: they moved into the reference drawer,
// and an Interval Reference joined them. The screen below is where the player
// works, and the references stay one tap from it at all times.
//
// The screen has one shape:
//
//   Header        — Composition Lab
//   Context row   — instrument, tuning, tonal center, collection
//   References    — Intervals, Scales, Chords
//   Run row       — Quick Practice, Guided Session, Focus, and the longer work
//   Exercise      — the prompt, the fields, the workspace, and the actions
//
// Everything the player types goes into the shared settings store after each
// change, so a reload lands them back where they were.

import {
  ACTIVITIES, FOCUS_AREAS, pickExercise, guidedSession, focusSession,
} from '../model/compositionExercises.js';
import { normalizeContext, stringsOf, isFretted } from '../model/compositionContext.js';
import {
  emptyState, mergeState, setAnswer, answersOf, isRevealed, markRevealed,
  markCompleted, runProgress, currentExercise, completedCount,
  setLabAnswer, setLabStep,
} from '../model/compositionState.js';
import { newMotifFamily } from '../model/motifLab.js';
import { getContext, setContext, subscribeContext, getSetting, saveSetting } from '../adapters/musiPrefs.js';
import { ROOTS, SCALES, resolveTuningKey, TUNINGS } from '../adapters/musiTheory.js';
import { stopAllTones } from '../adapters/musiDrone.js';
import { createReferenceDrawer, REFERENCE_TABS } from './referenceDrawer.js';
import { createContextRow } from './compositionContextRow.js';
import { createExercisePanel } from './exercisePanel.js';
import { createMotifPanel } from './motifPanel.js';
import { createLabPanel } from './labPanel.js';
import { el, clear, select } from './dom.js';

/** The one settings entry the lab writes. */
const STATE_KEY = 'pl.composition.state';

/** The run modes the row offers. */
const RUN_BUTTONS = [
  { id: 'quick', label: 'Quick Practice' },
  { id: 'guided', label: 'Guided Session' },
  { id: 'motif', label: 'Motif Lab' },
  { id: 'section', label: 'Section Lab' },
  { id: 'lab', label: 'Guided Labs' },
  { id: 'song', label: 'Song Study' },
  { id: 'capstone', label: 'Capstone' },
];

const SOURCE = 'practicelab-composition';

function readState() {
  const saved = getSetting(STATE_KEY, null);
  if (!saved) {
    const shared = getContext();
    const base = emptyState();
    return mergeState({
      ...base,
      context: {
        ...base.context,
        tonic: ROOTS.includes(shared.root) ? shared.root : base.context.tonic,
        collection: SCALES[shared.scale] ? shared.scale : base.context.collection,
        tuning: resolveTuningKey(shared.tuning) || base.context.tuning,
      },
    });
  }
  return mergeState(saved);
}

/**
 * Build Composition Lab.
 * @returns {{root: HTMLElement, stop: Function}}
 */
export function createCompositionView() {
  let state = readState();
  /** Per-exercise workspace state that lives only for this visit. */
  let workspaceState = {};

  function save() {
    saveSetting(STATE_KEY, state);
  }

  function setState(next, { persist = true } = {}) {
    state = next;
    if (persist) save();
  }

  /* --- references ---------------------------------------------------- */

  const drawer = createReferenceDrawer({
    onOpenChange: () => paintReferenceRow(),
  });

  const referenceRow = el('div', { class: 'plc-reference-row' });

  function paintReferenceRow() {
    clear(referenceRow);
    referenceRow.appendChild(el('span', { class: 'pl-field-label', text: 'References' }));
    for (const tab of REFERENCE_TABS) {
      const on = drawer.activeTab() === tab.id;
      const button = el('button', {
        type: 'button',
        class: `plc-ref-button${on ? ' active' : ''}`,
        text: tab.label,
        on: { click: () => { drawer.render(referenceContext()); drawer.toggle(tab.id); } },
      });
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      referenceRow.appendChild(button);
    }
    referenceRow.appendChild(el('span', {
      class: 'pl-hint plc-reference-hint',
      text: 'Open one at any time. Your exercise keeps its state.',
    }));
  }

  function referenceContext() {
    return {
      tonic: state.context.tonic,
      collection: state.context.collection,
      tuning: state.context.tuning || 'Standard',
      strings: stringsOf(state.context),
      fretStart: state.context.fretStart,
      fretEnd: state.context.fretEnd,
    };
  }

  /* --- context ------------------------------------------------------- */

  const contextRow = createContextRow({
    onChange: (next) => {
      setState({ ...state, context: normalizeContext(next) });
      // Keep the app-wide key in step, so the Scale Reference follows.
      setContext({
        root: state.context.tonic,
        scale: state.context.collection,
        ...(state.context.tuning ? { tuning: state.context.tuning } : {}),
      }, SOURCE);
      drawer.render(referenceContext());
      paintBody();
    },
  });

  /* --- run row ------------------------------------------------------- */

  const runRow = el('div', { class: 'plc-run-row' });
  const focusSelect = select({
    label: 'Focus',
    value: state.focus || '',
    options: [{ id: '', label: 'Pick a focus area' }]
      .concat(FOCUS_AREAS.map(f => ({ id: f.id, label: f.label }))),
    onChange: (value) => {
      if (!value) {
        setState({ ...state, focus: '' });
        return;
      }
      startFocus(value);
    },
  });

  function paintRunRow() {
    clear(runRow);
    for (const button of RUN_BUTTONS) {
      const on = state.mode === button.id;
      const node = el('button', {
        type: 'button',
        class: `plc-run-button${on ? ' active' : ''}`,
        text: button.label,
        on: { click: () => startMode(button.id) },
      });
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      runRow.appendChild(node);
    }
    runRow.appendChild(focusSelect.root);
  }

  /* --- panels -------------------------------------------------------- */

  const exercisePanel = createExercisePanel({
    onField: (fieldId, value) => {
      const exercise = currentExercise(state);
      if (!exercise) return;
      setState(setAnswer(state, exercise.id, fieldId, value));
    },
    onReveal: () => {
      const exercise = currentExercise(state);
      if (!exercise) return;
      setState(markCompleted(markRevealed(state, exercise.id), exercise.id));
      paintProgress();
    },
    onNext: () => nextExercise(),
    onGrid: ({ cells, pitches }) => {
      workspaceState = { ...workspaceState, cells, pitches };
      setState({ ...state, grid: { slots: cells.length, cells, pitches } });
    },
    onWorkspaceState: (partial) => {
      workspaceState = { ...workspaceState, ...partial };
    },
  });

  const motifPanel = createMotifPanel({
    onChange: (family) => {
      setState({ ...state, motif: family });
      motifPanel.render({ family: state.motif, grid: state.grid.cells });
    },
  });

  const labPanel = createLabPanel({
    onLabField: (labId, fieldId, value) => setState(setLabAnswer(state, labId, fieldId, value)),
    onLabStep: (labId, stepIndex) => {
      setState(setLabStep(state, labId, stepIndex));
      paintBody();
    },
    onSong: (fieldId, value) => {
      if (fieldId === '__title') {
        setState({ ...state, song: { ...state.song, title: value } });
        return;
      }
      setState({
        ...state,
        song: { ...state.song, answers: { ...state.song.answers, [fieldId]: value } },
      });
    },
    onCapstonePlan: (fieldId, value) => setState({
      ...state,
      capstone: { ...state.capstone, plan: { ...state.capstone.plan, [fieldId]: value } },
    }),
    onCapstoneScore: (rowId, score) => {
      setState({
        ...state,
        capstone: { ...state.capstone, scores: { ...state.capstone.scores, [rowId]: score } },
      });
      paintBody();
    },
    onSections: (assignment) => {
      setState({ ...state, sections: { ...state.sections, assignment } });
      paintBody();
    },
    onSectionField: (sectionId, value) => setState({
      ...state,
      sections: { ...state.sections, answers: { ...state.sections.answers, [sectionId]: value } },
    }),
  });

  const body = el('div', { class: 'plc-body' });
  const progressLine = el('p', { class: 'pl-hint plc-progress' });
  const loopRow = el('div', { class: 'plc-loop-row' });

  function paintLoopRow() {
    clear(loopRow);
    const run = state.run.exercises;
    if (state.mode !== 'guided' || !run.length) { loopRow.hidden = true; return; }
    loopRow.hidden = false;
    run.forEach((exercise, index) => {
      const activity = ACTIVITIES.find(a => a.id === exercise.activity);
      const on = index === state.run.index;
      const done = state.completed.includes(exercise.id);
      const node = el('button', {
        type: 'button',
        class: `plc-loop-step${on ? ' active' : ''}${done ? ' done' : ''}`,
        text: activity ? activity.label : exercise.activity,
        on: {
          click: () => {
            setState({ ...state, run: { ...state.run, index } });
            workspaceState = {};
            paintBody();
          },
        },
      });
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      loopRow.appendChild(node);
    });
  }

  function paintProgress() {
    const run = runProgress(state);
    const parts = [];
    if (run.total) parts.push(`Step ${run.index + 1} of ${run.total}`);
    parts.push(`${completedCount(state)} exercises finished on this device`);
    progressLine.textContent = parts.join(' · ');
  }

  function paintBody() {
    clear(body);
    contextRow.render(state.context);
    paintRunRow();
    paintReferenceRow();
    paintLoopRow();
    paintProgress();
    drawer.render(referenceContext());

    if (state.mode === 'motif') {
      motifPanel.render({ family: state.motif, grid: state.grid.cells });
      body.appendChild(motifPanel.root);
      return;
    }
    if (state.mode === 'lab' || state.mode === 'song' || state.mode === 'capstone' || state.mode === 'section') {
      labPanel.render({ state, mode: state.mode });
      body.appendChild(labPanel.root);
      return;
    }

    const exercise = currentExercise(state);
    const run = runProgress(state);
    exercisePanel.render({
      exercise,
      context: state.context,
      answers: exercise ? answersOf(state, exercise.id) : {},
      revealed: exercise ? isRevealed(state, exercise.id) : false,
      workspaceState: {
        cells: state.grid.cells,
        pitches: state.grid.pitches,
        ...workspaceState,
      },
      progress: run.total > 1 ? `step ${run.index + 1} of ${run.total}` : '',
    });
    body.appendChild(exercisePanel.root);
  }

  /* --- run control --------------------------------------------------- */

  function startMode(mode) {
    stopAllTones();
    workspaceState = {};
    if (mode === 'quick') {
      const previous = currentExercise(state);
      const exercise = pickExercise(state.context, { avoid: previous ? previous.id : '' });
      setState({
        ...state,
        mode,
        focus: '',
        run: { exercises: exercise ? [exercise] : [], index: 0 },
      });
      paintBody();
      return;
    }
    if (mode === 'guided') {
      const exercises = guidedSession(state.context);
      setState({ ...state, mode, focus: '', run: { exercises, index: 0 } });
      paintBody();
      return;
    }
    if (mode === 'motif' && !state.motif.variants) {
      setState({ ...state, mode, motif: newMotifFamily() });
      paintBody();
      return;
    }
    setState({ ...state, mode });
    paintBody();
  }

  function startFocus(focusId) {
    stopAllTones();
    workspaceState = {};
    const exercises = focusSession(focusId, state.context);
    setState({ ...state, mode: 'focus', focus: focusId, run: { exercises, index: 0 } });
    paintBody();
  }

  function nextExercise() {
    stopAllTones();
    workspaceState = {};
    const run = state.run;
    if (run.index + 1 < run.exercises.length) {
      setState({ ...state, run: { ...run, index: run.index + 1 } });
      paintBody();
      return;
    }
    if (state.mode === 'guided') {
      setState({ ...state, run: { exercises: guidedSession(state.context), index: 0 } });
      paintBody();
      return;
    }
    if (state.mode === 'focus' && state.focus) {
      setState({
        ...state,
        run: { exercises: focusSession(state.focus, state.context), index: 0 },
      });
      paintBody();
      return;
    }
    const previous = currentExercise(state);
    const exercise = pickExercise(state.context, {
      focus: state.focus,
      avoid: previous ? previous.id : '',
    });
    setState({ ...state, run: { exercises: exercise ? [exercise] : [], index: 0 } });
    paintBody();
  }

  /* --- assembly ------------------------------------------------------ */

  const head = el('div', { class: 'plc-head' }, [
    el('div', { class: 'plc-head-text' }, [
      el('h2', { class: 'plc-title', text: 'Composition Lab' }),
      el('p', {
        class: 'plc-blurb',
        text: 'Hear it, name it, find it, write it, change it, explain it. '
          + 'The references stay open to you the whole way.',
      }),
    ]),
  ]);

  const root = el('div', { class: 'plc-root' }, [
    head,
    contextRow.root,
    referenceRow,
    runRow,
    loopRow,
    progressLine,
    body,
    drawer.root,
  ]);

  // Nothing is chosen yet on a first visit, so open one exercise at once.
  if (!state.run.exercises.length && (state.mode === 'quick' || state.mode === 'focus' || state.mode === 'guided')) {
    const exercise = pickExercise(state.context);
    state = { ...state, run: { exercises: exercise ? [exercise] : [], index: 0 } };
  }

  paintBody();

  const unsubscribe = subscribeContext((next, source) => {
    if (source === SOURCE) return;
    const patch = {};
    if (ROOTS.includes(next.root) && next.root !== state.context.tonic) patch.tonic = next.root;
    if (SCALES[next.scale] && next.scale !== state.context.collection) patch.collection = next.scale;
    const tuning = resolveTuningKey(next.tuning);
    if (tuning && TUNINGS[tuning] && tuning !== state.context.tuning && isFretted(state.context)) {
      patch.tuning = tuning;
    }
    if (!Object.keys(patch).length) return;
    setState({ ...state, context: normalizeContext({ ...state.context, ...patch }) });
    paintBody();
  });

  return {
    root,
    stop() {
      stopAllTones();
      exercisePanel.stop();
      drawer.stop();
      unsubscribe();
      save();
    },
  };
}

