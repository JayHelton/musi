// The vocal practice model of Practice Lab.
//
// Practice Lab keeps one attempt model. A vocal attempt is one saved entry.
// It holds the exercise id and never a copy of the exercise itself.
//
// Every function here is pure. The caller supplies the time and the ids.

/** The saved settings of the vocal shell. A folder id is saved configuration. */
export const VOCAL_SETTINGS = {
  cleanFolderId: 'pl.vocal.cleanFolderId',
  harshFolderId: 'pl.vocal.harshFolderId',
  style: 'pl.vocal.style',
  cleanRegister: 'pl.vocal.cleanRegister',
  harshRegister: 'pl.vocal.harshRegister',
};

/** The settings key that holds the source folder of one style. */
export function sourceFolderKey(style) {
  return style === 'harsh' ? VOCAL_SETTINGS.harshFolderId : VOCAL_SETTINGS.cleanFolderId;
}

/** The settings key that holds the last register of one style. */
export function registerKey(style) {
  return style === 'harsh' ? VOCAL_SETTINGS.harshRegister : VOCAL_SETTINGS.cleanRegister;
}

/** The state of a configured source folder. */
export const SOURCE_OK = 'ok';
export const SOURCE_UNSET = 'unset';
export const SOURCE_MISSING = 'missing';
export const SOURCE_EMPTY = 'empty';

/**
 * Read the state of the configured source folder.
 *
 * A missing folder never falls back to the whole library: the screen asks for
 * a folder instead.
 *
 * @param {{ folderId: string, exists: boolean, count: number }} input
 * @returns {string} one of SOURCE_UNSET, SOURCE_MISSING, SOURCE_EMPTY, SOURCE_OK
 */
export function sourceState({ folderId, exists, count }) {
  if (!folderId) return SOURCE_UNSET;
  if (!exists) return SOURCE_MISSING;
  if (!Number(count)) return SOURCE_EMPTY;
  return SOURCE_OK;
}

function cleanList(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const text = String(entry || '').trim().toLowerCase();
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function cleanText(value, limit = 240) {
  return String(value || '').trim().slice(0, limit);
}

/**
 * Build the data of one vocal attempt log entry.
 *
 * The entry names the exercise, the mode, and what the singer reported. A
 * clean attempt also carries the result the Pitch Runner returned. Nothing
 * here scores a harsh attempt.
 *
 * @param {Object} input
 * @returns {Object} the `data` bag of a `vocal-attempt` entry
 */
export function newVocalAttempt({
  exerciseId,
  exerciseName = '',
  exerciseSourceFolderId = '',
  vocalStyle,
  register = '',
  focus = [],
  reps = 0,
  completed = false,
  outcome = '',
  effort = '',
  issues = [],
  notes = '',
  pitch = null,
} = {}) {
  const data = {
    practiceType: 'vocal',
    vocalStyle: String(vocalStyle || '').trim().toLowerCase(),
    register: String(register || '').trim().toLowerCase(),
    exerciseId: String(exerciseId || ''),
    exerciseName: cleanText(exerciseName, 120),
    exerciseSourceFolderId: String(exerciseSourceFolderId || ''),
    focus: cleanList(focus),
    reps: Math.max(0, Math.round(Number(reps) || 0)),
    completed: !!completed,
  };
  const result = String(outcome || '').trim().toLowerCase();
  if (result) data.outcome = result;
  const level = String(effort || '').trim().toLowerCase();
  if (level) data.effort = level;
  const tags = cleanList(issues);
  if (tags.length) data.issues = tags;
  const text = cleanText(notes);
  if (text) data.notes = text;
  if (pitch && typeof pitch === 'object') data.pitch = { ...pitch };
  return data;
}

/** The one-line summary a log row shows for a vocal attempt. */
export function describeVocalAttempt(data = {}) {
  const mode = [data.vocalStyle, data.register].filter(Boolean).join(' · ');
  const head = `${data.exerciseName || 'Vocal exercise'}${mode ? ` — ${mode}` : ''}`;
  const parts = [];
  if (data.outcome) parts.push(data.outcome);
  if (data.reps) parts.push(`${data.reps} rep${data.reps === 1 ? '' : 's'}`);
  if (data.effort) parts.push(data.effort);
  if (Array.isArray(data.issues) && data.issues.length) parts.push(data.issues.join(', '));
  return parts.length ? `${head} — ${parts.join(' · ')}` : head;
}

/**
 * Count the reported results of the most recent attempts.
 *
 * The summary is a count, never a percentage: Musi shows no false precision
 * for a sound it does not measure.
 *
 * @param {Object[]} entries log entries, oldest first
 * @param {{ exerciseId?: string, limit?: number, order?: string[] }} [options]
 * @returns {{ total: number, counts: Array<{id: string, count: number}> }}
 */
export function summarizeAttempts(entries, { exerciseId = '', limit = 10, order = [] } = {}) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry && entry.kind === 'vocal-attempt')
    .filter(entry => !exerciseId || entry.data?.exerciseId === exerciseId)
    .filter(entry => !!entry.data?.outcome);
  const recent = list.slice(-Math.max(1, Math.round(limit)));
  const counts = new Map();
  const ids = [...order];
  for (const entry of recent) {
    const id = entry.data.outcome;
    if (!ids.includes(id)) ids.push(id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return {
    total: recent.length,
    counts: ids.map(id => ({ id, count: counts.get(id) || 0 })),
  };
}

/**
 * True when the recent attempts ask the singer to stop pushing.
 *
 * Musi records a strained attempt and never celebrates it. Two strained
 * reports in the last five attempts raise a rest note.
 */
export function strainWarning(entries, { limit = 5, threshold = 2 } = {}) {
  const recent = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry && entry.kind === 'vocal-attempt')
    .slice(-Math.max(1, Math.round(limit)));
  const strained = recent.filter(entry => entry.data?.effort === 'strained').length;
  return strained >= threshold;
}

/**
 * Add a report step at the end of every repetition.
 *
 * The Cue Runner asks for the result of the repetition that just ended. A
 * report step is a checkpoint, so the runner already knows how to hold on it
 * and the singer decides when to carry on.
 *
 * @param {Array} steps the output of `expandCueSteps`
 * @returns {Array} the same list, with one report checkpoint per repetition
 */
export function withRepReports(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const out = [];
  list.forEach((entry, index) => {
    out.push(entry);
    const following = list[index + 1];
    if (following && following.rep === entry.rep) return;
    out.push({
      rep: entry.rep,
      reps: entry.reps,
      index: entry.index + 1,
      report: true,
      step: { type: 'checkpoint', text: 'Report the rep', detail: '', report: true },
      next: null,
    });
  });
  for (let i = 0; i < out.length; i += 1) {
    out[i] = { ...out[i], next: i + 1 < out.length ? out[i + 1].step : null };
  }
  return out;
}
