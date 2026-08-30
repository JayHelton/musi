// The saved state of Composition Lab.
//
// The lab keeps the context, the current run, every answer the player typed,
// the attack grid, the motif family, the guided-lab progress, the song study,
// and the capstone rubric. The screen writes it to the shared settings store
// after every change, so a reload lands the player back where they were.
//
// This is not a practice routine and it is not a programme. It is the state of
// one workspace.
//
// This module is pure. It touches no screen, no clock, and no storage.

import { DEFAULT_CONTEXT, normalizeContext } from './compositionContext.js';
import { createGrid, prunePitches, DEFAULT_SLOTS } from './rhythmGrid.js';
import { newMotifFamily } from './motifLab.js';

/** The run modes of the lab. */
export const RUN_MODES = ['quick', 'guided', 'focus', 'lab', 'motif', 'section', 'capstone', 'song'];

/** A fresh, empty state. */
export function emptyState() {
  return {
    context: { ...DEFAULT_CONTEXT },
    mode: 'quick',
    focus: '',
    run: { exercises: [], index: 0 },
    answers: {},
    completed: [],
    grid: { slots: DEFAULT_SLOTS, cells: createGrid(), pitches: {} },
    motif: newMotifFamily(),
    labs: {},
    sections: { assignment: [], answers: {} },
    song: { title: '', answers: {} },
    capstone: { plan: {}, scores: {}, note: '' },
  };
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

/**
 * Repair a saved state.
 *
 * Anything unreadable falls back to the empty value, so a settings entry from
 * an older build never blocks the screen.
 * @param {Object} [saved]
 * @returns {Object} a complete state
 */
export function mergeState(saved) {
  const base = emptyState();
  if (!saved || typeof saved !== 'object') return base;

  const context = normalizeContext(plainObject(saved.context));
  const mode = RUN_MODES.includes(saved.mode) ? saved.mode : base.mode;

  const cells = Array.isArray(saved?.grid?.cells) && saved.grid.cells.length
    ? saved.grid.cells.map(Boolean)
    : base.grid.cells;
  const grid = {
    slots: cells.length,
    cells,
    pitches: prunePitches(cells, plainObject(saved?.grid?.pitches)),
  };

  const motifSaved = plainObject(saved.motif);
  const motif = motifSaved.variants && Array.isArray(motifSaved.variants)
    ? { ...newMotifFamily(), ...motifSaved }
    : base.motif;

  return {
    context,
    mode,
    focus: typeof saved.focus === 'string' ? saved.focus : '',
    run: {
      exercises: Array.isArray(saved?.run?.exercises)
        ? saved.run.exercises.filter(item => item && typeof item === 'object' && item.id).slice(0, 24)
        : [],
      index: Number.isFinite(Number(saved?.run?.index)) ? Math.max(0, Number(saved.run.index)) : 0,
    },
    answers: plainObject(saved.answers),
    completed: Array.isArray(saved.completed) ? saved.completed.slice(-300) : [],
    grid,
    motif,
    labs: plainObject(saved.labs),
    sections: {
      assignment: Array.isArray(saved?.sections?.assignment) ? saved.sections.assignment : [],
      answers: plainObject(saved?.sections?.answers),
    },
    song: {
      title: typeof saved?.song?.title === 'string' ? saved.song.title : '',
      answers: plainObject(saved?.song?.answers),
    },
    capstone: {
      plan: plainObject(saved?.capstone?.plan),
      scores: plainObject(saved?.capstone?.scores),
      note: typeof saved?.capstone?.note === 'string' ? saved.capstone.note : '',
    },
  };
}

/**
 * Write one field of one exercise answer.
 * @param {Object} state
 * @param {string} exerciseId
 * @param {string} fieldId
 * @param {string} value
 * @returns {Object} a new state
 */
export function setAnswer(state, exerciseId, fieldId, value) {
  const entry = plainObject(state.answers[exerciseId]);
  const fields = plainObject(entry.fields);
  fields[fieldId] = value;
  return {
    ...state,
    answers: { ...state.answers, [exerciseId]: { ...entry, fields } },
  };
}

/** The answers of one exercise. */
export function answersOf(state, exerciseId) {
  return plainObject(plainObject(state.answers[exerciseId]).fields);
}

/** True when the player typed something into any field of the exercise. */
export function hasAnswer(state, exerciseId) {
  const fields = answersOf(state, exerciseId);
  return Object.values(fields).some(value => String(value || '').trim().length > 0);
}

/** Mark the reference answer as shown. The player cannot un-see it. */
export function markRevealed(state, exerciseId) {
  const entry = plainObject(state.answers[exerciseId]);
  return {
    ...state,
    answers: { ...state.answers, [exerciseId]: { ...entry, revealed: true } },
  };
}

/** True when Musi already showed the reference answer. */
export function isRevealed(state, exerciseId) {
  return !!plainObject(state.answers[exerciseId]).revealed;
}

/**
 * Record one exercise as finished.
 * @param {Object} state
 * @param {string} exerciseId
 * @returns {Object} a new state
 */
export function markCompleted(state, exerciseId) {
  if (!exerciseId) return state;
  const completed = state.completed.includes(exerciseId)
    ? state.completed
    : [...state.completed, exerciseId];
  return { ...state, completed };
}

/**
 * How far the current run has come.
 *
 * `run.exercises` holds the built exercises themselves, not their ids, so a
 * reload brings back the same prompt and the answer the player wrote under it.
 * @param {Object} state
 * @returns {{index: number, total: number, done: number}}
 */
export function runProgress(state) {
  const total = state.run.exercises.length;
  const index = Math.min(state.run.index, Math.max(0, total - 1));
  const done = state.run.exercises.filter(item => state.completed.includes(item?.id)).length;
  return { index, total, done };
}

/** The exercise the run is on, or null. */
export function currentExercise(state) {
  const list = state.run.exercises;
  if (!list.length) return null;
  return list[Math.min(state.run.index, list.length - 1)] || null;
}

/** How many exercises the player finished, all time. */
export function completedCount(state) {
  return state.completed.length;
}

/** The answers of one guided lab step. */
export function labAnswers(state, labId) {
  return plainObject(plainObject(state.labs[labId]).answers);
}

/** The step a guided lab is on. */
export function labStep(state, labId) {
  const value = Number(plainObject(state.labs[labId]).stepIndex);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Write one field of one guided lab. Returns a new state. */
export function setLabAnswer(state, labId, fieldId, value) {
  const entry = plainObject(state.labs[labId]);
  const answers = { ...plainObject(entry.answers), [fieldId]: value };
  return { ...state, labs: { ...state.labs, [labId]: { ...entry, answers } } };
}

/** Move a guided lab to another step. Returns a new state. */
export function setLabStep(state, labId, stepIndex) {
  const entry = plainObject(state.labs[labId]);
  return {
    ...state,
    labs: { ...state.labs, [labId]: { ...entry, stepIndex: Math.max(0, stepIndex) } },
  };
}
