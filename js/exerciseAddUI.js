// The "Add exercise" flow for the Exercises library.
//
// One chooser names every kind of exercise the library holds, so the user picks
// the kind first and the form second. Four kinds start with a file, and two do
// not:
//
//   link      — an external lesson page
//   document  — a PDF, a Word file, or an image
//   media     — an audio or a video recording
//   gp        — a Guitar Pro score
//   runner    — a saved pitch-runner run (typed notes, or notes from a GP file)
//   note      — a written exercise, with any number of attached files
//
// The dialogs report back through callbacks. This module never touches the
// exercise store, so js/exercises.js stays the one owner of that data.

import { saveFile, attachmentsSupported, ensurePersistentStorage } from './attachments.js';
import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import {
  RUNNER_MAX_BEATS,
  RUNNER_MAX_BPM,
  RUNNER_MAX_REPEATS,
  RUNNER_MIN_BPM,
  clampRunnerBpm,
  defaultRunnerConfig,
  describeRunnerConfig,
  formatRunnerNotes,
  normalizeRunnerConfig,
  parseRunnerNotes,
  runnerNotesFromTabModel,
  runnerTextCount,
  runnerTrackOptions,
  suggestOctaveShift,
} from './runnerExerciseModel.js';
import {
  normalizeCueConfig,
  defaultCueConfig,
  describeCueConfig,
  parseCueSteps,
  formatCueSteps,
  CUE_MIN_REPS,
  CUE_MAX_REPS,
  CUE_MAX_SECONDS,
} from './cueExerciseModel.js';
import {
  CLEAN_REGISTERS,
  HARSH_REGISTERS,
  FOCUS_BY_MODE,
  focusLabel,
  registerLabel,
} from './vocalExerciseModel.js';

const NAME_LIMIT = 120;
const BODY_LIMIT = 20000;
const MAX_ATTACHMENTS = 20;
const MAX_FILE_BYTES = 250 * 1024 * 1024;

export const DOC_ACCEPT_ATTR = [
  'application/pdf', '.pdf',
  '.doc', '.docx', '.txt', '.rtf', '.odt', '.md', '.pages', '.csv',
  'image/*',
].join(',');

export const MEDIA_ACCEPT_ATTR = ['audio/*', 'video/*'].join(',');

export const GP_ACCEPT_ATTR = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.musi-tab.json'].join(',');

export const ADD_EXERCISE_TYPES = [
  {
    id: 'link',
    label: 'Link',
    hint: 'A YouTube lesson or any web page.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  },
  {
    id: 'document',
    label: 'Document',
    hint: 'A PDF, a Word file, or a picture of a page.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>',
  },
  {
    id: 'media',
    label: 'Audio or video',
    hint: 'Play along with a recording.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>',
  },
  {
    id: 'gp',
    label: 'Guitar Pro file',
    hint: 'A .gp or .gp5 score for the tab player.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6l5-3-5-3z"/><path d="M15 9h2M15 12h3M15 15h1"/></svg>',
  },
  {
    id: 'runner',
    label: 'Pitch run',
    hint: 'Sing a run of notes. Type them, or read them from a Guitar Pro file.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h4l3-9 3 13 3-8h5"/></svg>',
  },
  {
    id: 'cue',
    label: 'Cue exercise',
    hint: 'Timed instructions and rest for harsh vocals. The Cue Runner plays them.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  },
  {
    id: 'note',
    label: 'Written exercise',
    hint: 'Type the exercise yourself. Attach files if you want to.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  },
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// --- dialog scaffold --------------------------------------------------------

let dialogRoot = null;
let escapeHandler = null;

function ensureDialogRoot() {
  if (dialogRoot && dialogRoot.isConnected) return dialogRoot;
  dialogRoot = document.getElementById('ex-add-dialog-root');
  if (!dialogRoot) {
    dialogRoot = el('div', { id: 'ex-add-dialog-root' });
    document.body.appendChild(dialogRoot);
  }
  return dialogRoot;
}

export function closeAddExerciseDialog() {
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openDialog(dialog) {
  ensureDialogRoot();
  closeAddExerciseDialog();
  const overlay = el('div', { class: 'modal-overlay' }, [dialog]);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAddExerciseDialog(); });
  escapeHandler = (e) => { if (e.key === 'Escape') closeAddExerciseDialog(); };
  document.addEventListener('keydown', escapeHandler);
  dialogRoot.appendChild(overlay);
}

function labelledField(labelText, control, hintText) {
  return el('label', { class: 'ex-form-field' }, [
    el('span', { class: 'ex-form-label', text: labelText }),
    control,
    hintText ? el('span', { class: 'ex-form-hint', text: hintText }) : null,
  ]);
}

function numberInput({ value, min, max, step = 1, ariaLabel }) {
  return el('input', {
    type: 'number',
    class: 'modal-input ex-form-number',
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
    'aria-label': ariaLabel,
  });
}

// --- the chooser ------------------------------------------------------------

/**
 * Ask which kind of exercise to add.
 * @param {{ folderLabel?: string, onPick: (typeId: string) => void,
 *           onBulkUpload?: () => void, onImportCourse?: () => void }} options
 */
export function openAddExerciseChooser({
  folderLabel = '',
  onPick,
  onBulkUpload,
  onImportCourse,
} = {}) {
  const dialog = el('div', { class: 'modal-dialog ex-add-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: 'Add an exercise' }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: folderLabel
      ? `The new exercise goes into "${folderLabel}".`
      : 'Pick the kind of exercise you want to add.',
  }));

  const grid = el('div', { class: 'ex-add-grid', role: 'list' });
  ADD_EXERCISE_TYPES.forEach((type) => {
    const card = el('button', {
      class: 'ex-add-card',
      type: 'button',
      role: 'listitem',
      onClick: () => {
        closeAddExerciseDialog();
        if (typeof onPick === 'function') onPick(type.id);
      },
    }, [
      el('span', { class: 'ex-add-card-icon', 'aria-hidden': 'true', html: type.icon }),
      el('span', { class: 'ex-add-card-label', text: type.label }),
      el('span', { class: 'ex-add-card-hint', text: type.hint }),
    ]);
    grid.appendChild(card);
  });
  dialog.appendChild(grid);

  const actions = el('div', { class: 'modal-actions' });
  if (typeof onImportCourse === 'function') {
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Import course',
      title: 'Pick a course folder. Musi mirrors the folders and makes a workbook for each one.',
      onClick: () => { closeAddExerciseDialog(); onImportCourse(); },
    }));
  }
  if (typeof onBulkUpload === 'function') {
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Bulk upload',
      onClick: () => { closeAddExerciseDialog(); onBulkUpload(); },
    }));
  }
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeAddExerciseDialog,
  }));
  dialog.appendChild(actions);

  openDialog(dialog);
}

// --- the vocal metadata fieldset -------------------------------------------

/**
 * The vocal tags of an exercise: the style, the registers, and the focus.
 *
 * Practice Lab reads these tags to decide which exercises fit a vocal mode.
 * The tags live on the exercise, so the library stays the source of truth.
 *
 * @param {{ style?: string, registers?: string[], focus?: string[], lockStyle?: boolean }} options
 * @returns {{ root: HTMLElement, value: () => { style: string, registers: string[], focus: string[] } }}
 */
function vocalFieldset({ style = '', registers = [], focus = [], lockStyle = false } = {}) {
  let currentStyle = lockStyle ? style : (style || '');
  const chosenRegisters = new Set(registers);
  const chosenFocus = new Set(focus);

  const registerRow = el('div', { class: 'ex-form-chips' });
  const focusRow = el('div', { class: 'ex-form-chips' });

  function registerList() {
    if (currentStyle === 'harsh') return HARSH_REGISTERS;
    if (currentStyle === 'clean') return CLEAN_REGISTERS;
    return [];
  }

  function focusList() {
    const out = [];
    for (const register of registerList()) {
      for (const id of (FOCUS_BY_MODE[`${currentStyle}:${register}`] || [])) {
        if (!out.includes(id)) out.push(id);
      }
    }
    return out;
  }

  function toggle(row, set, id, label, paint) {
    const btn = el('button', {
      type: 'button',
      class: `ex-form-chip${set.has(id) ? ' on' : ''}`,
      text: label,
      'aria-pressed': set.has(id) ? 'true' : 'false',
      onClick: () => {
        if (set.has(id)) set.delete(id);
        else set.add(id);
        paint();
      },
    });
    row.appendChild(btn);
  }

  function paint() {
    registerRow.innerHTML = '';
    focusRow.innerHTML = '';
    for (const id of registerList()) {
      toggle(registerRow, chosenRegisters, id, registerLabel(id), paint);
    }
    for (const id of focusList()) {
      toggle(focusRow, chosenFocus, id, focusLabel(id), paint);
    }
    wrap.hidden = !currentStyle;
  }

  const styleSelect = el('select', { class: 'modal-input', 'aria-label': 'Vocal style' }, [
    el('option', { value: '', text: 'Not a vocal exercise' }),
    el('option', { value: 'clean', text: 'Clean vocal' }),
  ]);
  styleSelect.value = currentStyle === 'clean' ? 'clean' : '';
  styleSelect.addEventListener('change', () => {
    currentStyle = styleSelect.value;
    chosenRegisters.clear();
    chosenFocus.clear();
    paint();
  });

  const wrap = el('div', { class: 'ex-form-vocal' }, [
    labelledField('Registers', registerRow, 'Pick every register this exercise trains.'),
    labelledField('Focus', focusRow, 'Practice Lab shows these under the exercise name.'),
  ]);

  const root = el('div', {}, lockStyle ? [wrap] : [
    labelledField('Vocal practice', styleSelect,
      'A clean vocal exercise appears in the Vocal tab of Practice Lab.'),
    wrap,
  ]);

  paint();

  return {
    root,
    value() {
      return {
        style: currentStyle,
        registers: [...chosenRegisters],
        focus: [...chosenFocus],
      };
    },
  };
}

// --- the cue-exercise form -------------------------------------------------

/**
 * Create or edit a cue exercise.
 *
 * A cue exercise is a step list the Cue Runner plays: what to do, for how
 * long, and when to rest. Musi judges none of it.
 *
 * @param {{ title?: string, confirmLabel?: string, name?: string, config?: object,
 *           vocal?: object,
 *           onSave: (result: { name: string, config: object, vocal: object }) => void }} options
 */
export function openCueDialog({
  title = 'New cue exercise',
  confirmLabel = 'Save exercise',
  name = '',
  config = null,
  vocal = null,
  onSave,
} = {}) {
  const start = normalizeCueConfig(config) || defaultCueConfig();

  const dialog = el('div', { class: 'modal-dialog ex-form-dialog ex-cue-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: 'One step per line: the step type, the seconds, then the text.',
  }));

  const nameInput = el('input', {
    type: 'text', class: 'modal-input', value: name,
    maxlength: String(NAME_LIMIT), placeholder: 'Immediate Low Activation',
    'aria-label': 'Exercise name',
  });
  dialog.appendChild(labelledField('Name', nameInput));

  const repsInput = numberInput({
    value: start.repetitions, min: CUE_MIN_REPS, max: CUE_MAX_REPS, ariaLabel: 'Repetitions',
  });
  dialog.appendChild(labelledField('Repetitions', repsInput));

  const gapInput = numberInput({
    value: start.restBetweenReps, min: 0, max: CUE_MAX_SECONDS,
    ariaLabel: 'Rest between repetitions in seconds',
  });
  dialog.appendChild(labelledField('Rest between reps (seconds)', gapInput,
    'Zero starts the next repetition at once.'));

  const stepsInput = el('textarea', {
    class: 'modal-input ex-form-textarea', rows: '8',
    'aria-label': 'The steps of the exercise',
    placeholder: 'perform 4 Neutral false-cord low\nrest 8',
  });
  stepsInput.value = formatCueSteps(start.steps);
  dialog.appendChild(labelledField('Steps', stepsInput,
    'perform, rest, transition, phrase, checkpoint. A checkpoint waits for Next.'));

  const summary = el('p', { class: 'ex-form-hint ex-cue-summary-line' });
  dialog.appendChild(summary);

  const meta = vocalFieldset({
    style: 'harsh',
    lockStyle: true,
    registers: Array.isArray(vocal?.registers) ? vocal.registers : [],
    focus: Array.isArray(vocal?.focus) ? vocal.focus : [],
  });
  dialog.appendChild(meta.root);

  const errors = el('div', { class: 'modal-errors' });
  dialog.appendChild(errors);

  function read() {
    const parsed = parseCueSteps(stepsInput.value);
    const normalized = normalizeCueConfig({
      repetitions: Number(repsInput.value),
      restBetweenReps: Number(gapInput.value),
      steps: parsed.steps,
    });
    return { parsed, normalized };
  }

  function syncSummary() {
    const { parsed, normalized } = read();
    errors.textContent = parsed.errors.length ? parsed.errors[0] : '';
    summary.textContent = normalized ? describeCueConfig(normalized) : 'No steps yet';
  }

  stepsInput.addEventListener('input', syncSummary);
  repsInput.addEventListener('input', syncSummary);
  gapInput.addEventListener('input', syncSummary);

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeAddExerciseDialog,
  }));
  const saveBtn = el('button', { class: 'btn primary', type: 'button', text: confirmLabel });
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);

  saveBtn.addEventListener('click', () => {
    const { parsed, normalized } = read();
    if (parsed.errors.length) {
      errors.textContent = parsed.errors[0];
      return;
    }
    if (!normalized) {
      errors.textContent = 'Write at least one step.';
      return;
    }
    closeAddExerciseDialog();
    if (typeof onSave === 'function') {
      onSave({ name: nameInput.value.trim(), config: normalized, vocal: meta.value() });
    }
  });

  openDialog(dialog);
  syncSummary();
  setTimeout(() => nameInput.focus(), 40);
}

// --- the pitch-run form -----------------------------------------------------

/**
 * Create or edit a pitch run.
 * @param {{ title?: string, confirmLabel?: string, name?: string, config?: object,
 *           vocal?: object,
 *           onSave: (result: { name: string, config: object, vocal: object }) => void }} options
 */
export function openRunnerDialog({
  title = 'New pitch run',
  confirmLabel = 'Save exercise',
  name = '',
  config = null,
  vocal = null,
  onSave,
} = {}) {
  const start = normalizeRunnerConfig(config) || defaultRunnerConfig();
  const state = {
    source: start.source,
    notes: start.notes.slice(),
    bpm: start.bpm,
    noteBeats: start.noteBeats,
    restBeats: start.restBeats,
    repeats: start.repeats,
    countInBeats: start.countInBeats,
    metronome: start.metronome,
    guide: start.guide,
    preview: start.preview,
    attachmentId: start.attachmentId,
    fileName: start.fileName,
    fileSize: start.fileSize,
    trackIndex: start.trackIndex,
    octaveShift: start.octaveShift,
    gpFile: null,
    gpResult: null,
  };

  const dialog = el('div', { class: 'modal-dialog ex-form-dialog ex-runner-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));

  const nameInput = el('input', {
    type: 'text', class: 'modal-input', value: name,
    maxlength: String(NAME_LIMIT), placeholder: 'Warm-up run',
    'aria-label': 'Exercise name',
  });
  dialog.appendChild(labelledField('Name', nameInput));

  // Source switch.
  const sourceRow = el('div', { class: 'ex-seg', role: 'radiogroup', 'aria-label': 'Where the notes come from' });
  const sourceButtons = {};
  [
    { id: 'manual', label: 'Type the notes' },
    { id: 'gp', label: 'From a Guitar Pro file' },
  ].forEach((option) => {
    const button = el('button', {
      class: 'ex-seg-btn', type: 'button', role: 'radio',
      text: option.label,
      onClick: () => { state.source = option.id; syncSource(); },
    });
    sourceButtons[option.id] = button;
    sourceRow.appendChild(button);
  });
  dialog.appendChild(labelledField('Notes come from', sourceRow));

  // Manual pane.
  const notesInput = el('textarea', {
    class: 'modal-input ex-form-textarea',
    rows: '3',
    placeholder: 'C4 2, D4 2, E4 4, D4 2, C4 4',
    'aria-label': 'Notes and hold lengths',
  });
  notesInput.value = formatRunnerNotes(state.notes);
  const manualPane = el('div', { class: 'ex-form-pane' }, [
    labelledField(
      'Notes',
      notesInput,
      'One entry per note: the note name, then the beats to hold it. Separate entries with a comma or a new line.',
    ),
  ]);

  // Guitar Pro pane.
  const gpInput = el('input', {
    type: 'file', accept: GP_ACCEPT_ATTR, class: 'ex-form-file',
    'aria-label': 'Guitar Pro file',
  });
  const trackSelect = el('select', { class: 'modal-input', 'aria-label': 'Track' });
  const octaveSelect = el('select', { class: 'modal-input', 'aria-label': 'Octave shift' });
  [-3, -2, -1, 0, 1, 2, 3].forEach((shift) => {
    octaveSelect.appendChild(el('option', {
      value: String(shift),
      text: shift === 0 ? 'Keep the written octave' : `${shift > 0 ? '+' : ''}${shift} octave${Math.abs(shift) === 1 ? '' : 's'}`,
    }));
  });
  octaveSelect.value = String(state.octaveShift);
  const gpStatus = el('p', { class: 'ex-form-hint ex-form-status' });
  const gpPane = el('div', { class: 'ex-form-pane' }, [
    labelledField('Guitar Pro file', gpInput, 'The highest note of every chord becomes one note of the run.'),
    labelledField('Track', trackSelect),
    labelledField('Octave', octaveSelect, 'A guitar part usually sits below a singing voice. Shift it up to reach it.'),
    gpStatus,
  ]);
  if (state.fileName) gpStatus.textContent = `Saved from ${state.fileName}.`;

  dialog.appendChild(manualPane);
  dialog.appendChild(gpPane);

  // Play options.
  const bpmInput = numberInput({
    value: state.bpm, min: RUNNER_MIN_BPM, max: RUNNER_MAX_BPM, ariaLabel: 'Tempo in BPM',
  });
  const noteLengthInput = numberInput({
    value: state.noteBeats, min: 0, max: RUNNER_MAX_BEATS, step: 0.25, ariaLabel: 'Note length in beats',
  });
  const restInput = numberInput({
    value: state.restBeats, min: 0, max: 8, step: 0.25, ariaLabel: 'Rest between notes',
  });
  const repeatInput = numberInput({
    value: state.repeats, min: 0, max: RUNNER_MAX_REPEATS, ariaLabel: 'Times to repeat the run',
  });
  const countInInput = numberInput({
    value: state.countInBeats, min: 0, max: 8, ariaLabel: 'Count-in beats',
  });
  dialog.appendChild(el('div', { class: 'ex-form-grid' }, [
    labelledField('Tempo (BPM)', bpmInput),
    labelledField('Note length', noteLengthInput, 'In beats. 0 holds each note as long as it is written.'),
    labelledField('Rest between notes', restInput, 'In beats.'),
    labelledField('Repeat', repeatInput, '0 runs until you stop it.'),
    labelledField('Count-in', countInInput, 'In beats.'),
  ]));

  const metronomeChk = el('input', { type: 'checkbox' });
  const guideChk = el('input', { type: 'checkbox' });
  const previewChk = el('input', { type: 'checkbox' });
  metronomeChk.checked = state.metronome;
  guideChk.checked = state.guide;
  previewChk.checked = state.preview;
  dialog.appendChild(el('div', { class: 'pr-toggles ex-form-toggles' }, [
    el('label', { class: 'pr-check' }, [metronomeChk, el('span', { text: 'Metronome click' })]),
    el('label', { class: 'pr-check' }, [guideChk, el('span', { text: 'Play melody guide' })]),
    el('label', { class: 'pr-check' }, [previewChk, el('span', { text: 'Preview each pass' })]),
  ]));

  const preview = el('p', { class: 'ex-form-preview' });
  dialog.appendChild(preview);

  // A clean vocal run needs its vocal tags, or the Vocal tab of Practice Lab
  // cannot tell which register it trains.
  const vocalMeta = vocalFieldset({
    style: vocal?.style === 'clean' ? 'clean' : '',
    registers: Array.isArray(vocal?.registers) ? vocal.registers : [],
    focus: Array.isArray(vocal?.focus) ? vocal.focus : [],
  });
  dialog.appendChild(vocalMeta.root);

  const errors = el('div', { class: 'modal-errors' });
  dialog.appendChild(errors);

  function readManualNotes() {
    return parseRunnerNotes(notesInput.value);
  }

  function currentConfig() {
    return {
      source: state.source,
      notes: state.source === 'manual' ? readManualNotes().notes : state.notes,
      bpm: Number(bpmInput.value),
      noteBeats: Number(noteLengthInput.value),
      restBeats: Number(restInput.value),
      repeats: Number(repeatInput.value),
      countInBeats: Number(countInInput.value),
      metronome: metronomeChk.checked,
      guide: guideChk.checked,
      preview: previewChk.checked,
      attachmentId: state.attachmentId,
      fileName: state.fileName,
      fileSize: state.fileSize,
      trackIndex: state.trackIndex,
      octaveShift: Number(octaveSelect.value),
    };
  }

  function syncPreview() {
    const normalized = normalizeRunnerConfig(currentConfig());
    preview.textContent = normalized
      ? describeRunnerConfig(normalized)
      : 'Add at least one note to save this run.';
  }

  function syncSource() {
    Object.entries(sourceButtons).forEach(([id, button]) => {
      const on = id === state.source;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    manualPane.hidden = state.source !== 'manual';
    gpPane.hidden = state.source !== 'gp';
    syncPreview();
  }

  function fillTrackSelect(options) {
    trackSelect.innerHTML = '';
    options.forEach((option) => {
      trackSelect.appendChild(el('option', {
        value: String(option.index),
        text: `${option.name} · ${option.noteCount} notes`,
      }));
    });
    const wanted = String(state.trackIndex);
    trackSelect.value = options.some((o) => String(o.index) === wanted)
      ? wanted
      : String(options[0]?.index ?? 0);
    state.trackIndex = Number(trackSelect.value) || 0;
  }

  function importFromTrack() {
    if (!state.gpResult) return;
    const model = state.gpResult.tracks?.[state.trackIndex]?.model;
    const result = runnerNotesFromTabModel(model, { octaveShift: Number(octaveSelect.value) });
    if (!result.ok) {
      state.notes = [];
      gpStatus.textContent = result.error;
      syncPreview();
      return;
    }
    state.notes = result.notes;
    state.bpm = result.bpm;
    bpmInput.value = String(clampRunnerBpm(result.bpm));
    const skipped = result.skipped ? ` ${result.skipped} note${result.skipped === 1 ? '' : 's'} did not fit.` : '';
    // The file can write a vowel or an exercise over a note. The runner prints
    // that text, so the status line says how many notes carry it.
    const withText = runnerTextCount({ notes: result.notes });
    const texts = withText ? ` ${withText} note${withText === 1 ? '' : 's'} carry text from the score.` : '';
    gpStatus.textContent = `Read ${result.notes.length} notes from ${state.fileName}.${skipped}${texts}`;
    syncPreview();
  }

  gpInput.addEventListener('change', async () => {
    const file = gpInput.files && gpInput.files[0];
    if (!file) return;
    if (!isGuitarProName(file.name)) {
      gpStatus.textContent = 'Pick a Guitar Pro file (.gp, .gp3, .gp4, .gp5, or .gpx).';
      return;
    }
    gpStatus.textContent = `Reading ${file.name}…`;
    try {
      const buffer = await file.arrayBuffer();
      const gp = await parseGuitarPro(buffer);
      const options = runnerTrackOptions(gp);
      if (!options.length) {
        gpStatus.textContent = 'This file holds no pitched track.';
        return;
      }
      state.gpFile = file;
      state.gpResult = gp;
      state.fileName = file.name;
      // The byte length names the same score as the GP player does when it
      // read the file without the library, so both share the section notes.
      state.fileSize = file.size;
      state.trackIndex = options[0].index;
      fillTrackSelect(options);
      // A guitar part sits below a singer, so start at a shift that fits.
      const first = runnerNotesFromTabModel(gp.tracks[state.trackIndex]?.model, { octaveShift: 0 });
      if (first.ok) octaveSelect.value = String(suggestOctaveShift(first.notes));
      state.octaveShift = Number(octaveSelect.value);
      importFromTrack();
    } catch (err) {
      gpStatus.textContent = err?.message || 'Could not read that Guitar Pro file.';
    }
  });

  trackSelect.addEventListener('change', () => {
    state.trackIndex = Number(trackSelect.value) || 0;
    importFromTrack();
  });
  octaveSelect.addEventListener('change', () => {
    state.octaveShift = Number(octaveSelect.value);
    importFromTrack();
  });
  notesInput.addEventListener('input', syncPreview);
  [bpmInput, noteLengthInput, restInput, repeatInput, countInInput].forEach((input) => {
    input.addEventListener('input', syncPreview);
  });
  [metronomeChk, guideChk, previewChk].forEach((box) => box.addEventListener('change', syncPreview));

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeAddExerciseDialog,
  }));
  const saveBtn = el('button', { class: 'btn primary', type: 'button', text: confirmLabel });
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);

  saveBtn.addEventListener('click', async () => {
    errors.textContent = '';
    if (state.source === 'manual') {
      const parsed = readManualNotes();
      if (parsed.errors.length) {
        errors.textContent = parsed.errors[0];
        return;
      }
      if (!parsed.notes.length) {
        errors.textContent = 'Type at least one note, for example C4 2.';
        return;
      }
      state.notes = parsed.notes;
    }
    const normalized = normalizeRunnerConfig(currentConfig());
    if (!normalized) {
      errors.textContent = 'This run holds no notes yet.';
      return;
    }
    // Keep the Guitar Pro file with the run, so the user can read it again.
    if (state.gpFile && attachmentsSupported()) {
      saveBtn.disabled = true;
      errors.textContent = '';
      try {
        await ensurePersistentStorage();
        const meta = await saveFile({
          blob: state.gpFile,
          name: state.fileName || 'Guitar Pro',
          type: 'application/x-guitar-pro',
          fileName: state.fileName || 'score.gp',
          size: state.gpFile.size,
          source: 'exercise',
        });
        if (meta) normalized.attachmentId = meta.id;
      } catch (e) {
        /* the run still plays without the source file */
      }
      saveBtn.disabled = false;
    }
    closeAddExerciseDialog();
    if (typeof onSave === 'function') {
      onSave({ name: nameInput.value.trim(), config: normalized, vocal: vocalMeta.value() });
    }
  });

  openDialog(dialog);
  syncSource();
  syncPreview();
  if (state.source === 'gp' && !state.gpResult && state.notes.length) {
    gpStatus.textContent = state.fileName
      ? `${state.notes.length} notes saved from ${state.fileName}. Pick a file again to read it fresh.`
      : `${state.notes.length} notes saved.`;
  }
  setTimeout(() => nameInput.focus(), 40);
}

// --- the written-exercise form ---------------------------------------------

/**
 * Create or edit a written exercise.
 * @param {{ title?: string, confirmLabel?: string, name?: string, body?: string,
 *           attachments?: object[],
 *           onSave: (result: { name: string, body: string, attachments: object[] }) => void }} options
 */
export function openNoteDialog({
  title = 'New written exercise',
  confirmLabel = 'Save exercise',
  name = '',
  body = '',
  attachments = [],
  onSave,
} = {}) {
  const files = (Array.isArray(attachments) ? attachments : []).slice(0, MAX_ATTACHMENTS);
  const pending = []; // Files chosen now; they reach IndexedDB on save.

  const dialog = el('div', { class: 'modal-dialog ex-form-dialog ex-note-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));

  const nameInput = el('input', {
    type: 'text', class: 'modal-input', value: name,
    maxlength: String(NAME_LIMIT), placeholder: 'Left-hand stretch drill',
    'aria-label': 'Exercise name',
  });
  dialog.appendChild(labelledField('Name', nameInput));

  const bodyInput = el('textarea', {
    class: 'modal-input ex-form-textarea',
    rows: '8',
    maxlength: String(BODY_LIMIT),
    placeholder: 'Write the exercise here. Steps, tempos, what to watch for.',
    'aria-label': 'Exercise text',
  });
  bodyInput.value = typeof body === 'string' ? body : '';
  dialog.appendChild(labelledField('The exercise', bodyInput));

  const fileList = el('ul', { class: 'ex-form-files' });
  const fileInput = el('input', {
    type: 'file', multiple: '', class: 'ex-form-file', 'aria-label': 'Files to attach',
  });
  const fileHint = el('p', { class: 'ex-form-hint' });

  function syncFiles() {
    fileList.innerHTML = '';
    const rows = [
      ...files.map((file, index) => ({ file, index, saved: true })),
      ...pending.map((file, index) => ({ file, index, saved: false })),
    ];
    rows.forEach((row) => {
      const label = row.saved
        ? (row.file.name || row.file.fileName || 'Attachment')
        : row.file.name;
      const item = el('li', { class: 'ex-form-file-row' }, [
        el('span', { class: 'ex-form-file-name', text: label }),
        el('span', { class: 'ex-form-file-meta', text: `${fmtSize(row.file.size)}${row.saved ? '' : ' · new'}` }),
        el('button', {
          class: 'btn sm', type: 'button', text: 'Remove',
          onClick: () => {
            if (row.saved) files.splice(row.index, 1);
            else pending.splice(row.index, 1);
            syncFiles();
          },
        }),
      ]);
      fileList.appendChild(item);
    });
    const total = files.length + pending.length;
    fileHint.textContent = attachmentsSupported()
      ? `${total} of ${MAX_ATTACHMENTS} files attached.`
      : 'This browser has no file storage, so attachments are unavailable.';
  }

  fileInput.addEventListener('change', () => {
    const chosen = Array.from(fileInput.files || []);
    fileInput.value = '';
    for (const file of chosen) {
      if (files.length + pending.length >= MAX_ATTACHMENTS) break;
      if (file.size > MAX_FILE_BYTES) continue;
      pending.push(file);
    }
    syncFiles();
  });

  dialog.appendChild(labelledField('Attachments', fileInput));
  dialog.appendChild(fileList);
  dialog.appendChild(fileHint);

  const errors = el('div', { class: 'modal-errors' });
  dialog.appendChild(errors);

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', {
    class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeAddExerciseDialog,
  }));
  const saveBtn = el('button', { class: 'btn primary', type: 'button', text: confirmLabel });
  actions.appendChild(saveBtn);
  dialog.appendChild(actions);

  saveBtn.addEventListener('click', async () => {
    errors.textContent = '';
    const exerciseName = nameInput.value.trim();
    const text = bodyInput.value;
    if (!exerciseName && !text.trim() && !files.length && !pending.length) {
      errors.textContent = 'Give the exercise a name or some text.';
      return;
    }
    saveBtn.disabled = true;
    const saved = files.slice();
    if (pending.length && attachmentsSupported()) {
      try {
        await ensurePersistentStorage();
        for (const file of pending) {
          const dot = file.name.lastIndexOf('.');
          const base = dot > 0 ? file.name.slice(0, dot) : file.name;
          const meta = await saveFile({
            blob: file,
            name: base || 'Attachment',
            type: file.type || '',
            fileName: file.name,
            size: file.size,
            source: 'exercise',
          });
          if (!meta) continue;
          saved.push({
            attachmentId: meta.id,
            name: base || file.name,
            fileName: file.name,
            type: file.type || '',
            size: file.size,
          });
        }
      } catch (e) {
        errors.textContent = 'Some files could not be saved.';
      }
    }
    saveBtn.disabled = false;
    closeAddExerciseDialog();
    if (typeof onSave === 'function') {
      onSave({ name: exerciseName, body: text, attachments: saved });
    }
  });

  openDialog(dialog);
  syncFiles();
  setTimeout(() => nameInput.focus(), 40);
}
