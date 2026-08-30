// Data model for a cue exercise — a timed instruction list that the Cue Runner
// plays. A cue exercise is a normal Practice Library exercise with the kind
// `cue`, the same as a pitch run is a normal exercise with the kind `runner`.
//
// A cue exercise holds a repetition count and a short step list. The runner
// shows one step at a time, counts the time down, and moves to the next step.
// It judges nothing: the singer reports the result.
//
// The step types are fixed. This is not a workflow engine.
//
//   perform     — do the sound the text names, for a length of time
//   rest        — recover, for a length of time
//   transition  — move from one register to another, for a length of time
//   phrase      — say the words the text holds, for a length of time
//   checkpoint  — no timer; the singer presses Next when ready
//
// This module holds no DOM code, so the Node test runners can import it.

export const CUE_STEP_TYPES = ['perform', 'rest', 'transition', 'phrase', 'checkpoint'];

/** The step types the runner counts down. A checkpoint waits for the singer. */
export const TIMED_CUE_STEP_TYPES = ['perform', 'rest', 'transition', 'phrase'];

export const CUE_MIN_SECONDS = 1;
export const CUE_MAX_SECONDS = 600;
export const CUE_DEFAULT_SECONDS = 5;

export const CUE_MAX_STEPS = 40;
export const CUE_MIN_REPS = 1;
export const CUE_MAX_REPS = 50;
export const CUE_DEFAULT_REPS = 5;

const TEXT_LIMIT = 160;
const DETAIL_LIMIT = 240;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function text(value, limit = TEXT_LIMIT) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, limit);
}

/** Round a step length to whole seconds and keep it in range. */
export function clampCueSeconds(value) {
  return Math.round(clampNumber(value, CUE_MIN_SECONDS, CUE_MAX_SECONDS, CUE_DEFAULT_SECONDS));
}

export function clampCueReps(value) {
  return Math.round(clampNumber(value, CUE_MIN_REPS, CUE_MAX_REPS, CUE_DEFAULT_REPS));
}

/**
 * Read one stored step back into a safe shape.
 * @returns {Object|null} null when the record names no known step type
 */
export function normalizeCueStep(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!CUE_STEP_TYPES.includes(type)) return null;

  const step = { type, text: text(raw.text), detail: text(raw.detail, DETAIL_LIMIT) };
  if (type === 'transition') {
    step.from = text(raw.from, 40);
    step.to = text(raw.to, 40);
  }
  if (type !== 'checkpoint') step.duration = clampCueSeconds(raw.duration);
  return step;
}

/**
 * Read a stored cue config back into a safe shape.
 * @returns {Object|null} null when the record holds no playable step
 */
export function normalizeCueConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = [];
  for (const entry of source) {
    if (steps.length >= CUE_MAX_STEPS) break;
    const step = normalizeCueStep(entry);
    if (step) steps.push(step);
  }
  if (!steps.length) return null;
  return {
    repetitions: clampCueReps(raw.repetitions),
    // The pause between one repetition and the next. 0 means the next
    // repetition starts at once.
    restBetweenReps: Math.round(clampNumber(raw.restBetweenReps, 0, CUE_MAX_SECONDS, 0)),
    steps,
  };
}

export function defaultCueConfig() {
  return {
    repetitions: CUE_DEFAULT_REPS,
    restBetweenReps: 0,
    steps: [
      { type: 'perform', text: 'Neutral low', detail: '', duration: 4 },
      { type: 'rest', text: '', detail: '', duration: 8 },
    ],
  };
}

/** The label one step shows in large type. */
export function cueStepTitle(step) {
  if (!step) return '';
  if (step.type === 'transition') {
    const from = step.from || '';
    const to = step.to || '';
    if (from && to) return `${from.toUpperCase()} → ${to.toUpperCase()}`;
  }
  if (step.text) return step.text;
  if (step.type === 'rest') return 'Rest';
  if (step.type === 'checkpoint') return 'Ready?';
  return step.type.toUpperCase();
}

/** The kicker above the step title: PERFORM, REST, TRANSITION, PHRASE, NEXT. */
export function cueStepKicker(step) {
  if (!step) return '';
  if (step.type === 'checkpoint') return 'CHECKPOINT';
  return step.type.toUpperCase();
}

/** The length of one step in seconds. A checkpoint has no length. */
export function cueStepSeconds(step) {
  if (!step || step.type === 'checkpoint') return 0;
  return clampCueSeconds(step.duration);
}

/** The length of one repetition, in seconds. Checkpoints count as zero. */
export function cueRepSeconds(config) {
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  return steps.reduce((total, step) => total + cueStepSeconds(step), 0);
}

/**
 * The length of the whole exercise, in seconds. A checkpoint waits for the
 * singer, so the total is a floor and not a promise.
 */
export function cueRunSeconds(config) {
  const cfg = normalizeCueConfig(config);
  if (!cfg) return 0;
  const body = cueRepSeconds(cfg) * cfg.repetitions;
  const gaps = cfg.restBetweenReps * Math.max(0, cfg.repetitions - 1);
  return body + gaps;
}

/** True when the exercise asks the singer to press Next at least once. */
export function cueHasCheckpoint(config) {
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  return steps.some((step) => step && step.type === 'checkpoint');
}

/**
 * The step list of the whole exercise, one entry per step of every repetition.
 * The Cue Runner walks this list, so the rest steps stay where the author put
 * them and nothing shortens them.
 *
 * @param {Object} config
 * @returns {Array<{rep:number, reps:number, index:number, step:Object, next:Object|null}>}
 */
export function expandCueSteps(config) {
  const cfg = normalizeCueConfig(config);
  if (!cfg) return [];
  const out = [];
  for (let rep = 1; rep <= cfg.repetitions; rep += 1) {
    cfg.steps.forEach((step, index) => {
      out.push({ rep, reps: cfg.repetitions, index, step, next: null });
    });
    if (cfg.restBetweenReps > 0 && rep < cfg.repetitions) {
      out.push({
        rep,
        reps: cfg.repetitions,
        index: cfg.steps.length,
        step: { type: 'rest', text: 'Between repetitions', detail: '', duration: cfg.restBetweenReps },
        next: null,
      });
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i].next = i + 1 < out.length ? out[i + 1].step : null;
  }
  return out;
}

/** `2:05` or `0:45`. */
export function formatCueClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** One line that tells the singer what a cue exercise holds. */
export function describeCueConfig(config) {
  const cfg = normalizeCueConfig(config);
  if (!cfg) return 'No steps yet';
  const steps = `${cfg.steps.length} step${cfg.steps.length === 1 ? '' : 's'}`;
  const reps = `${cfg.repetitions} rep${cfg.repetitions === 1 ? '' : 's'}`;
  const line = `${steps} · ${reps} · about ${formatCueClock(cueRunSeconds(cfg))}`;
  return cueHasCheckpoint(cfg) ? `${line} · has a checkpoint` : line;
}

// --- the typed step list ---------------------------------------------------
//
// The add form takes one step per line. The first word is the step type, the
// second is the length in seconds, and the rest is the text:
//
//   perform 4 Neutral false-cord low
//   rest 8
//   transition 3 low > high
//   phrase 6 Bite the wire
//   checkpoint Take a breath and set the placement

/**
 * Read a typed step list.
 * @param {string} raw
 * @returns {{ ok: boolean, steps: Object[], errors: string[] }}
 */
export function parseCueSteps(raw) {
  const lines = String(raw || '')
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const steps = [];
  const errors = [];

  for (const line of lines) {
    if (steps.length >= CUE_MAX_STEPS) {
      errors.push(`An exercise holds at most ${CUE_MAX_STEPS} steps.`);
      break;
    }
    const parts = line.split(/\s+/);
    const type = (parts.shift() || '').toLowerCase();
    if (!CUE_STEP_TYPES.includes(type)) {
      errors.push(`"${line}" does not start with a step type. Use ${CUE_STEP_TYPES.join(', ')}.`);
      continue;
    }
    if (type === 'checkpoint') {
      steps.push(normalizeCueStep({ type, text: parts.join(' ') }));
      continue;
    }
    const seconds = Number(parts[0]);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      errors.push(`"${line}" has no length. Write the seconds after the step type, such as "${type} 4".`);
      continue;
    }
    parts.shift();
    const rest = parts.join(' ');
    if (type === 'transition') {
      const [from, to] = rest.split(/\s*(?:>|->|→|to)\s*/i);
      if (!from || !to) {
        errors.push(`"${line}" needs two registers, such as "transition 3 low > high".`);
        continue;
      }
      steps.push(normalizeCueStep({ type, duration: seconds, from, to }));
      continue;
    }
    steps.push(normalizeCueStep({ type, duration: seconds, text: rest }));
  }

  return { ok: steps.length > 0 && errors.length === 0, steps, errors };
}

/** Write a step list back to the typed form, so the author can edit it again. */
export function formatCueSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map((raw) => {
      const step = normalizeCueStep(raw);
      if (!step) return '';
      if (step.type === 'checkpoint') return `checkpoint ${step.text}`.trim();
      if (step.type === 'transition') {
        return `transition ${step.duration} ${step.from} > ${step.to}`.trim();
      }
      return `${step.type} ${step.duration} ${step.text}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}
