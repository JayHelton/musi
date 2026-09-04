// The Vocal tab of Practice Lab.
//
// Vocal practice is a practice type of Practice Lab, next to the instrument
// session. It has two styles and three registers each:
//
//   Clean — Chest, Mix, Head   → the shared Pitch Runner plays the exercise
//   Harsh — Low, Mid, High     → the Cue Runner shows timed instructions
//
// Every exercise comes from the Practice Library. Each style keeps its own
// source folder, saved by folder id, so a rename of the folder changes
// nothing. A missing folder never falls back to the whole library.

import { el, clear, chip, pressable, notice, select, panel } from './dom.js';
import { createCueRunnerView } from './cueRunnerView.js';
import { createAttemptForm } from './vocalAttemptForm.js';
import { createHarshCheatSheet } from './harshCheatSheetView.js';
import { createCleanCheatSheet } from './cleanCheatSheetView.js';
import {
  VOCAL_SETTINGS,
  sourceFolderKey,
  registerKey,
  sourceState,
  newVocalAttempt,
  summarizeAttempts,
  strainWarning,
  SOURCE_UNSET,
  SOURCE_MISSING,
  SOURCE_EMPTY,
} from '../model/vocal.js';
import { getSetting, saveSetting } from '../adapters/musiPrefs.js';
import { mountPitchRunner } from '../adapters/musiPitchRunner.js';
import {
  VOCAL_STYLES,
  STYLE_LABELS,
  registersOfStyle,
  registerLabel,
  focusOf,
  libraryFolders,
  libraryFolderExists,
  libraryFolderPath,
  listVocalExercises,
  readExercise,
  exerciseFitsMode,
  addVocalStarters,
  describeVocalExercise,
  describeCueConfig,
  describeRunnerConfig,
  outcomeSetOf,
  outcomeLabel,
} from '../adapters/musiExerciseLibrary.js';

const FOLDER_INDENT = '  ';

/**
 * @param {Object} lab the Practice Lab service
 * @returns {{ root: HTMLElement, stop: Function }}
 */
export function createVocalView(lab) {
  let style = getSetting(VOCAL_SETTINGS.style, 'clean', VOCAL_STYLES);
  let register = readRegister(style);
  let exerciseId = '';
  let search = '';
  let stage = null;

  function readRegister(forStyle) {
    const list = registersOfStyle(forStyle);
    return getSetting(registerKey(forStyle), list[0], list);
  }

  function folderId() {
    return getSetting(sourceFolderKey(style), '');
  }

  function setFolderId(id) {
    // The source folder is saved configuration. It persists at once.
    saveSetting(sourceFolderKey(style), id || '');
    exerciseId = '';
    paint();
  }

  function compatible() {
    return listVocalExercises({ folderId: folderId(), style, register, search });
  }

  function currentExercise() {
    if (!exerciseId) return null;
    const item = readExercise(exerciseId);
    if (!item || !exerciseFitsMode(item, { style, register })) return null;
    return item;
  }

  /* ---- the mode rows ---- */

  const styleRow = el('div', { class: 'pl-chip-row pl-vocal-styles' });
  const registerRow = el('div', { class: 'pl-chip-row pl-vocal-registers' });

  function paintStyles() {
    clear(styleRow);
    for (const id of VOCAL_STYLES) {
      styleRow.appendChild(chip({
        label: STYLE_LABELS[id].toUpperCase(),
        selected: id === style,
        onSelect: () => {
          if (id === style) return;
          style = id;
          saveSetting(VOCAL_SETTINGS.style, style);
          register = readRegister(style);
          exerciseId = '';
          search = '';
          closeCheatSheets();
          paint();
        },
      }));
    }
  }

  function paintRegisters() {
    clear(registerRow);
    for (const id of registersOfStyle(style)) {
      registerRow.appendChild(chip({
        label: registerLabel(id).toUpperCase(),
        selected: id === register,
        onSelect: () => {
          if (id === register) return;
          register = id;
          saveSetting(registerKey(style), register);
          exerciseId = '';
          paint();
        },
      }));
    }
  }

  /* ---- the cheat sheet ---- */

  // Each style has its own technique reminder, one tap away for the whole
  // session. The harsh sheet covers distortion and its injury risk. The clean
  // sheet covers the registers, resonance, and the myths that keep singers
  // stuck. Only the sheet of the current style opens.
  const cheatSheets = {
    harsh: createHarshCheatSheet(),
    clean: createCleanCheatSheet(),
  };
  const cheatButtonWrap = el('div', { class: 'pl-vocal-cheat-row' });

  /** Close both sheets. The style switch and the view stop both use this. */
  function closeCheatSheets() {
    for (const sheet of Object.values(cheatSheets)) sheet.close();
  }

  function paintCheatButton() {
    clear(cheatButtonWrap);
    const sheet = cheatSheets[style];
    cheatButtonWrap.hidden = !sheet;
    if (!sheet) return;
    cheatButtonWrap.appendChild(pressable({
      label: 'Cheat Sheet',
      className: 'small',
      ariaLabel: `Open the ${STYLE_LABELS[style].toLowerCase()} vocal cheat sheet`,
      onPress: () => sheet.toggle(),
    }));
  }

  /* ---- the exercise source ---- */

  const sourceBody = el('div', { class: 'pl-vocal-source' });

  function folderOptions() {
    const rows = libraryFolders().map(row => ({
      id: row.id,
      label: `${FOLDER_INDENT.repeat(Math.max(0, row.depth - 1))}${row.name}`,
    }));
    return [{ id: '', label: 'Choose a folder…' }, ...rows];
  }

  function openLibrary() {
    try {
      if (typeof window !== 'undefined') window.location.hash = '#exercises';
    } catch (e) {
      /* the shell owns the route; nothing else to do here */
    }
  }

  function addStarters() {
    const result = addVocalStarters({ folderId: folderId(), style });
    if (result.created) {
      lab.ports.notify.toast(
        `Added ${result.created} starter exercise${result.created === 1 ? '' : 's'} to the folder.`,
        'info',
      );
    } else {
      lab.ports.notify.toast('The folder already holds the starter exercises.', 'info');
    }
    paint();
  }

  function paintSource() {
    clear(sourceBody);
    const id = folderId();
    const exists = !!id && libraryFolderExists(id);
    const list = exists ? compatible() : [];
    const state = sourceState({ folderId: id, exists, count: list.length });

    const picker = select({
      label: 'Exercise Source',
      value: exists ? id : '',
      options: folderOptions(),
      onChange: value => setFolderId(value),
    });
    sourceBody.appendChild(picker.root);

    if (exists) {
      sourceBody.appendChild(el('p', {
        class: 'pl-hint',
        text: `${libraryFolderPath(id)} — folders inside it count too.`,
      }));
    }

    if (state === SOURCE_UNSET) {
      sourceBody.appendChild(notice(
        `Pick the Practice Library folder that holds your ${STYLE_LABELS[style].toLowerCase()} vocal exercises.`,
      ));
    }
    if (state === SOURCE_MISSING) {
      sourceBody.appendChild(notice('Exercise source unavailable', 'warn'));
      sourceBody.appendChild(el('div', { class: 'pl-vocal-source-actions' }, [
        pressable({ label: 'Choose Folder', onPress: () => picker.root.querySelector('select')?.focus() }),
      ]));
    }
    if (state === SOURCE_EMPTY) {
      sourceBody.appendChild(notice('No compatible exercises found.', 'warn'));
      sourceBody.appendChild(el('div', { class: 'pl-vocal-source-actions' }, [
        pressable({ label: 'Choose Folder', onPress: () => picker.root.querySelector('select')?.focus() }),
        pressable({ label: 'Open Library', onPress: openLibrary }),
        pressable({
          label: 'Add starter exercises',
          className: 'primary',
          onPress: addStarters,
        }),
      ]));
    }
    return list;
  }

  /* ---- the exercise picker ---- */

  const pickerBody = el('div', { class: 'pl-vocal-picker' });
  const metaBody = el('div', { class: 'pl-vocal-meta' });

  /** The focus line and the length line of the exercise the picker holds. */
  function paintMeta() {
    clear(metaBody);
    const item = currentExercise();
    if (!item) return;
    const focus = describeVocalExercise(item);
    if (focus) metaBody.appendChild(el('p', { class: 'pl-hint', text: focus }));
    metaBody.appendChild(el('p', {
      class: 'pl-hint',
      text: item.kind === 'cue' ? describeCueConfig(item.cue) : describeRunnerConfig(item.runner),
    }));
    if (item.technique) {
      metaBody.appendChild(el('p', { class: 'pl-vocal-note', text: item.technique }));
    }
  }

  function paintPicker(list) {
    clear(pickerBody);
    clear(metaBody);
    if (!list.length) return;

    if (list.length > 6) {
      const field = el('input', {
        type: 'text', class: 'pl-text', value: search,
        placeholder: 'Search this folder',
        attrs: { 'aria-label': 'Search the compatible exercises' },
      });
      field.addEventListener('input', () => {
        search = field.value;
        paintPicker(compatible());
        const again = pickerBody.querySelector('input');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        paintStage();
        paintRecent();
      });
      pickerBody.appendChild(field);
    }

    if (!list.some(item => item.id === exerciseId)) exerciseId = list[0].id;

    const picker = select({
      label: 'Exercise',
      value: exerciseId,
      options: list.map(item => ({ id: item.id, label: item.name })),
      onChange: (value) => {
        exerciseId = value;
        paintMeta();
        paintStage();
        paintRecent();
      },
    });
    pickerBody.appendChild(picker.root);
    paintMeta();
  }

  /* ---- the stage ---- */

  const stageBody = el('div', { class: 'pl-vocal-stage' });
  const formBody = el('div', { class: 'pl-vocal-form-wrap' });
  formBody.hidden = true;

  function stopStage() {
    if (stage && typeof stage.stop === 'function') stage.stop();
    if (stage && typeof stage.destroy === 'function') stage.destroy();
    stage = null;
  }

  function sessionLabels(item) {
    return {
      instrument: 'Voice',
      technique: `${STYLE_LABELS[style]} · ${registerLabel(register)}`,
      target: item ? item.name : 'Vocal practice',
    };
  }

  async function saveAttempt(item, extra) {
    const data = newVocalAttempt({
      exerciseId: item.id,
      exerciseName: item.name,
      exerciseSourceFolderId: folderId(),
      vocalStyle: style,
      register,
      focus: focusOf(item),
      ...extra,
    });
    await lab.logVocalAttempt(data, sessionLabels(item));
    paintRecent();
  }

  function showForm(item, { reps, completed, pitch }) {
    clear(formBody);
    const form = createAttemptForm({
      style,
      saveLabel: 'Save attempt',
      onSave: async (value) => {
        formBody.hidden = true;
        await saveAttempt(item, { ...value, reps, completed, pitch });
      },
      onSkip: () => { formBody.hidden = true; },
    });
    formBody.appendChild(el('span', {
      class: 'pl-field-label',
      text: completed ? 'Run complete' : 'Run stopped',
    }));
    formBody.appendChild(form.root);
    formBody.hidden = false;
  }

  function paintStage() {
    stopStage();
    clear(stageBody);
    formBody.hidden = true;
    const item = currentExercise();
    if (!item) {
      stageBody.appendChild(notice('Pick an exercise to practise.'));
      return;
    }
    if (item.kind === 'cue') {
      const view = createCueRunnerView({
        exercise: item,
        clock: lab.ports.clock,
        onRepResult: (outcome, rep) => {
          saveAttempt(item, { outcome, reps: 1, completed: true, repIndex: rep });
        },
        onEnd: ({ completed, reps }) => showForm(item, { reps, completed, pitch: null }),
      });
      stageBody.appendChild(view.root);
      stage = view;
      return;
    }
    // Clean vocals run on the Pitch Runner Musi already ships.
    stage = mountPitchRunner(stageBody, item.runner, {
      onFinish: (summary) => {
        showForm(item, {
          reps: item.runner?.repeats || 0,
          completed: true,
          pitch: summary ? { ...summary } : null,
        });
      },
    });
  }

  /* ---- the recent results ---- */

  const recentBody = el('div', { class: 'pl-vocal-recent' });

  async function paintRecent() {
    const item = currentExercise();
    clear(recentBody);
    if (!item) return;
    const entries = await lab.vocalAttempts({ exerciseId: item.id, limit: 10 });
    const summary = summarizeAttempts(entries, {
      exerciseId: item.id,
      limit: 10,
      order: outcomeSetOf(item),
    });
    if (!summary.total) {
      recentBody.appendChild(el('p', { class: 'pl-hint', text: 'No reported reps yet.' }));
      return;
    }
    recentBody.appendChild(el('span', {
      class: 'pl-field-label',
      text: `Last ${summary.total} rep${summary.total === 1 ? '' : 's'}`,
    }));
    const rows = el('ul', { class: 'pl-vocal-tally' });
    for (const row of summary.counts) {
      rows.appendChild(el('li', {}, [
        el('span', { class: 'pl-vocal-tally-label', text: outcomeLabel(row.id) }),
        el('span', { class: 'pl-vocal-tally-count', text: String(row.count) }),
      ]));
    }
    recentBody.appendChild(rows);
    if (strainWarning(entries)) {
      recentBody.appendChild(notice(
        'Several recent reps were strained. Take a longer rest before the next one.',
        'warn',
      ));
    }
  }

  /* ---- the layout ---- */

  function paint() {
    paintStyles();
    paintRegisters();
    paintCheatButton();
    const list = paintSource();
    paintPicker(list);
    paintStage();
    paintRecent();
  }

  const modePanel = panel('Vocal', 'pl-vocal-modes');
  modePanel.body.append(
    el('span', { class: 'pl-field-label', text: 'Style' }),
    styleRow,
    el('span', { class: 'pl-field-label', text: 'Register' }),
    registerRow,
    cheatButtonWrap,
    sourceBody,
    pickerBody,
    metaBody,
  );

  const runPanel = panel('Runner', 'pl-vocal-run');
  runPanel.body.append(stageBody, formBody, recentBody);

  const root = el('div', { class: 'pl-vocal' }, [
    el('p', { class: 'pl-vocal-kicker', text: 'PRACTICE LAB · VOCAL' }),
    modePanel.root,
    runPanel.root,
    cheatSheets.harsh.root,
    cheatSheets.clean.root,
  ]);

  paint();

  return {
    root,
    /** Stop the runner, release the microphone, and close both cheat sheets. */
    stop() { stopStage(); for (const sheet of Object.values(cheatSheets)) sheet.stop(); },
  };
}
