// The Practice Library, seen from inside Practice Lab.
//
// Practice Lab runs exercises. It never stores one. The Practice Library owns
// every exercise record, so this adapter is the one seam between the two.
//
// It reads the headless exercise store (`js/exerciseStore.js`), not the
// library screen, so no user-interface module of another feature comes with
// it. Nothing here touches the DOM.

import {
  getExercise,
  getExercisesInFolder,
  exerciseFolderExists,
  exerciseFolderPath,
  listExerciseFolders,
  createExercise,
} from '../../exerciseStore.js';
import {
  filterVocalExercises,
  matchesVocalMode,
  readVocalMeta,
} from '../../vocalExerciseModel.js';
import { starterExerciseRecords } from '../../vocalStarters.js';

// The vocal vocabulary the screens read. It lives in `js/` because the
// Practice Library writes the same tags, so both sides share one list.
export {
  VOCAL_STYLES,
  STYLE_LABELS,
  CLEAN_REGISTERS,
  HARSH_REGISTERS,
  REGISTER_LABELS,
  EFFORT_LEVELS,
  EFFORT_LABELS,
  ACTIVATION_OUTCOMES,
  QUALITY_OUTCOMES,
  OUTCOME_LABELS,
  registersOfStyle,
  registerLabel,
  focusLabel,
  focusOf,
  readVocalMeta,
  describeVocalExercise,
  outcomeSetOf,
  outcomeLabel,
  issueTagsOfStyle,
  issueLabel,
  effortLabel,
} from '../../vocalExerciseModel.js';

export {
  expandCueSteps,
  cueStepTitle,
  cueStepKicker,
  cueStepSeconds,
  cueRunSeconds,
  describeCueConfig,
  formatCueClock,
} from '../../cueExerciseModel.js';

export { describeRunnerConfig } from '../../runnerExerciseModel.js';

/**
 * Every folder of the Practice Library, in tree order.
 * @returns {Array<{id:string, name:string, depth:number, path:string}>}
 */
export function libraryFolders() {
  return listExerciseFolders();
}

/** True when the saved folder id still names a folder. */
export function libraryFolderExists(id) {
  return exerciseFolderExists(id);
}

/** The full path of one folder, for example `Vocal › Harsh`. */
export function libraryFolderPath(id) {
  return exerciseFolderPath(id);
}

/**
 * The compatible exercises of one vocal mode inside one source folder.
 *
 * The search covers the folder and every folder inside it. An empty folder id
 * returns nothing: a missing source never falls back to the whole library.
 *
 * @param {{ folderId: string, style: string, register?: string, search?: string }} query
 * @returns {Object[]}
 */
export function listVocalExercises({ folderId, style, register = '', search = '' } = {}) {
  if (!folderId || !exerciseFolderExists(folderId)) return [];
  const items = getExercisesInFolder(folderId, { includeDescendants: true });
  return filterVocalExercises(items, { style, register, search });
}

/** One exercise by id, or null when the library no longer holds it. */
export function readExercise(id) {
  return getExercise(id);
}

/** True when this exercise still fits the mode the screen shows. */
export function exerciseFitsMode(item, mode) {
  return matchesVocalMode(item, mode);
}

/** The vocal metadata of one exercise, or null when it carries none. */
export function vocalMetaOf(item) {
  return readVocalMeta(item);
}

/**
 * Write the starter exercises of one style into one library folder.
 *
 * The records become normal Practice Library exercises. A starter that is
 * already in the folder under the same name is left alone, so a second press
 * adds nothing.
 *
 * @param {{ folderId: string, style: string }} target
 * @returns {{ created: number, skipped: number }}
 */
export function addVocalStarters({ folderId, style } = {}) {
  if (!folderId || !exerciseFolderExists(folderId)) return { created: 0, skipped: 0 };
  const existing = new Set(
    getExercisesInFolder(folderId, { includeDescendants: true })
      .map(item => String(item.name || '').trim().toLowerCase()),
  );
  let created = 0;
  let skipped = 0;
  for (const record of starterExerciseRecords({ style, folderId })) {
    if (existing.has(String(record.name).trim().toLowerCase())) { skipped += 1; continue; }
    if (createExercise(record)) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}
