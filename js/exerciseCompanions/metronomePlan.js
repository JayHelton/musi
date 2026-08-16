// DOM-free model for the metronome companion tempo plan.
//
// A workbook stores the plan with the companion, so a practice plan such as
// "60 seconds at each tempo from 80 BPM to 120 BPM" survives between sessions.
// The player never rebuilds the step list by hand.

export const METRO_MIN_BPM = 30;
export const METRO_MAX_BPM = 300;
export const METRO_MIN_STEP_BPM = 1;
export const METRO_MAX_STEP_BPM = 60;
export const METRO_MIN_STEP_SECONDS = 5;
export const METRO_MAX_STEP_SECONDS = 60 * 60;
export const METRO_MIN_ROUNDS = 1;
export const METRO_MAX_ROUNDS = 16;
export const METRO_MIN_BEATS = 1;
export const METRO_MAX_BEATS = 12;
export const METRO_MAX_STEPS = 32;

// `perBeat` is the number of equal clicks inside one beat.
export const METRO_SUBDIVISIONS = {
  quarter: { id: 'quarter', label: '4ths', perBeat: 1 },
  eighth: { id: 'eighth', label: '8ths', perBeat: 2 },
  triplet: { id: 'triplet', label: 'Triplets', perBeat: 3 },
  sixteenth: { id: 'sixteenth', label: '16ths', perBeat: 4 },
};

export const METRO_SUBDIV_IDS = Object.keys(METRO_SUBDIVISIONS);

export const METRO_PROGRESSIONS = [
  {
    id: 'steady',
    label: 'Steady tempo',
    description: 'One tempo for the whole session.',
    needs: [],
  },
  {
    id: 'ramp',
    label: 'Step up',
    description: 'Climb from the start tempo to the target tempo.',
    needs: ['targetBpm', 'stepBpm', 'stepSeconds'],
  },
  {
    id: 'pyramid',
    label: 'Up and back down',
    description: 'Climb to the target tempo, then return to the start tempo.',
    needs: ['targetBpm', 'stepBpm', 'stepSeconds'],
  },
  {
    id: 'ladder',
    label: 'Subdivision ladder',
    description: 'One tempo through 4ths, 8ths, triplets, and 16ths.',
    needs: ['stepSeconds'],
  },
  {
    id: 'burst',
    label: 'Burst intervals',
    description: 'Alternate the start tempo and the target tempo.',
    needs: ['targetBpm', 'stepSeconds', 'rounds'],
  },
  {
    id: 'custom',
    label: 'Custom steps',
    description: 'Your own list of tempo steps.',
    needs: [],
  },
];

const PROGRESSION_BY_ID = Object.fromEntries(METRO_PROGRESSIONS.map((p) => [p.id, p]));

export function normalizeMetroSubdiv(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return METRO_SUBDIVISIONS[id] ? id : 'quarter';
}

export function metroSubdivInfo(raw) {
  return METRO_SUBDIVISIONS[normalizeMetroSubdiv(raw)];
}

export function metroClicksPerBeat(raw) {
  return metroSubdivInfo(raw).perBeat;
}

export function normalizeMetroProgression(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return PROGRESSION_BY_ID[id] ? id : 'steady';
}

export function metroProgressionInfo(raw) {
  return PROGRESSION_BY_ID[normalizeMetroProgression(raw)];
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeMetroBpm(raw, fallback = 90) {
  return clampInt(raw, METRO_MIN_BPM, METRO_MAX_BPM, fallback);
}

export function normalizeMetroStepBpm(raw, fallback = 5) {
  return clampInt(raw, METRO_MIN_STEP_BPM, METRO_MAX_STEP_BPM, fallback);
}

export function normalizeMetroStepSeconds(raw, fallback = 60) {
  return clampInt(raw, METRO_MIN_STEP_SECONDS, METRO_MAX_STEP_SECONDS, fallback);
}

export function normalizeMetroRounds(raw, fallback = 4) {
  return clampInt(raw, METRO_MIN_ROUNDS, METRO_MAX_ROUNDS, fallback);
}

export function normalizeMetroBeats(raw, fallback = 4) {
  return clampInt(raw, METRO_MIN_BEATS, METRO_MAX_BEATS, fallback);
}

/** Cleans a stored custom step list. Invalid rows drop out. */
export function normalizeMetroSteps(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (out.length >= METRO_MAX_STEPS) break;
    if (!item || typeof item !== 'object') continue;
    const seconds = clampInt(item.seconds, METRO_MIN_STEP_SECONDS, METRO_MAX_STEP_SECONDS, null);
    const bpm = clampInt(item.bpm, METRO_MIN_BPM, METRO_MAX_BPM, null);
    if (seconds === null || bpm === null) continue;
    out.push({ seconds, bpm, subdiv: normalizeMetroSubdiv(item.subdiv) });
  }
  return out;
}

function step(seconds, bpm, subdiv) {
  return { seconds, bpm, subdiv: normalizeMetroSubdiv(subdiv) };
}

/**
 * Builds the tempo run from the start tempo toward the target tempo. The final
 * step always lands on the target tempo, even when the increment overshoots it.
 */
function rampBpmValues(startBpm, targetBpm, stepBpm, limit) {
  const values = [startBpm];
  if (startBpm === targetBpm || limit <= 1) return values;
  const dir = targetBpm > startBpm ? 1 : -1;
  let bpm = startBpm;
  while (values.length < limit) {
    bpm += dir * stepBpm;
    if ((dir === 1 && bpm >= targetBpm) || (dir === -1 && bpm <= targetBpm)) {
      values.push(targetBpm);
      break;
    }
    values.push(bpm);
  }
  if (values[values.length - 1] !== targetBpm && values.length < limit) {
    values.push(targetBpm);
  }
  return values;
}

/**
 * Resolves a metronome companion into the list of timed steps to play.
 * An empty list means "hold one tempo with no plan" — the caller stays on
 * `companion.startBpm` until the player stops it.
 *
 * @returns {{ seconds: number, bpm: number, subdiv: string }[]}
 */
export function metronomePlanSteps(companion) {
  if (!companion || typeof companion !== 'object') return [];
  const progression = normalizeMetroProgression(companion.progression);
  const startBpm = normalizeMetroBpm(companion.startBpm);
  const targetBpm = normalizeMetroBpm(companion.targetBpm, 120);
  const stepBpm = normalizeMetroStepBpm(companion.stepBpm);
  const seconds = normalizeMetroStepSeconds(companion.stepSeconds);
  const subdiv = normalizeMetroSubdiv(companion.subdiv);

  if (progression === 'steady') return [];

  if (progression === 'custom') return normalizeMetroSteps(companion.steps);

  if (progression === 'ladder') {
    return METRO_SUBDIV_IDS.map((id) => step(seconds, startBpm, id));
  }

  if (progression === 'burst') {
    const rounds = normalizeMetroRounds(companion.rounds);
    const out = [];
    for (let i = 0; i < rounds && out.length < METRO_MAX_STEPS - 1; i += 1) {
      out.push(step(seconds, startBpm, subdiv));
      out.push(step(seconds, targetBpm, subdiv));
    }
    return out;
  }

  if (progression === 'ramp') {
    return rampBpmValues(startBpm, targetBpm, stepBpm, METRO_MAX_STEPS)
      .map((bpm) => step(seconds, bpm, subdiv));
  }

  // pyramid: climb to the target tempo, then come back down. The peak plays
  // once, and the descent stops before it repeats the start tempo twice.
  const up = rampBpmValues(startBpm, targetBpm, stepBpm, Math.ceil(METRO_MAX_STEPS / 2));
  const down = up.slice(0, -1).reverse();
  return up.concat(down).slice(0, METRO_MAX_STEPS).map((bpm) => step(seconds, bpm, subdiv));
}

export function metronomePlanTotalSeconds(steps) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((sum, s) => sum + (Number(s?.seconds) || 0), 0);
}

/**
 * Finds the step that covers `elapsedSec`. Returns null once a non-looping
 * plan runs out.
 */
export function metronomeStepAt(steps, elapsedSec, { loop = false } = {}) {
  if (!Array.isArray(steps) || !steps.length) return null;
  const total = metronomePlanTotalSeconds(steps);
  if (total <= 0) return null;
  let elapsed = Number(elapsedSec);
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;
  if (elapsed >= total) {
    if (!loop) return null;
    elapsed %= total;
  }
  let acc = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const next = acc + steps[i].seconds;
    if (elapsed < next) {
      return {
        index: i,
        step: steps[i],
        startedAt: acc,
        remaining: next - elapsed,
      };
    }
    acc = next;
  }
  const last = steps.length - 1;
  return {
    index: last,
    step: steps[last],
    startedAt: acc - steps[last].seconds,
    remaining: 0,
  };
}

export function formatMetroDuration(totalSeconds) {
  const secs = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** Short one-line summary of the plan, for panel headings and pickers. */
export function describeMetronomePlan(companion) {
  if (!companion || typeof companion !== 'object') return '';
  const progression = normalizeMetroProgression(companion.progression);
  const info = metroProgressionInfo(progression);
  const startBpm = normalizeMetroBpm(companion.startBpm);
  const steps = metronomePlanSteps(companion);

  if (progression === 'steady' || !steps.length) {
    return `${info.label} · ${startBpm} BPM · ${metroSubdivInfo(companion.subdiv).label}`;
  }

  const bpms = steps.map((s) => s.bpm);
  const low = Math.min(...bpms);
  const high = Math.max(...bpms);
  const range = low === high ? `${low} BPM` : `${low}–${high} BPM`;
  const total = formatMetroDuration(metronomePlanTotalSeconds(steps));
  return `${info.label} · ${range} · ${steps.length} steps · ${total}`;
}
