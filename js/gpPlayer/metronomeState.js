// DOM-free GP player metronome + tempo-ramp state.

import { clampBpm, GPP_MIN_BPM, GPP_MAX_BPM } from './tempoRange.js';

const SUBDIV_BY_ID = {
  quarter: { id: 'quarter', label: '4ths', perBeat: 1 },
  eighth: { id: 'eighth', label: '8ths', perBeat: 2 },
  triplet: { id: 'triplet', label: 'Triplets', perBeat: 3 },
  sixteenth: { id: 'sixteenth', label: '16ths', perBeat: 4 },
};

export const GPP_METRO_SUBDIVISIONS = [
  SUBDIV_BY_ID.quarter,
  SUBDIV_BY_ID.eighth,
  SUBDIV_BY_ID.triplet,
  SUBDIV_BY_ID.sixteenth,
];

export const GPP_RAMP_INTERVAL_MODES = ['seconds', 'loops', 'measures'];

const METRO_PREFS_KEY = 'musi.gpMetroPrefs';

function normalizeSubdiv(id) {
  return SUBDIV_BY_ID[id] ? id : 'quarter';
}

export function subdivisionsPerBeat(subdiv) {
  return SUBDIV_BY_ID[normalizeSubdiv(subdiv)].perBeat;
}

/** Snap a beat cursor forward onto the subdivision grid (at or after `beat`). */
export function snapMetroBeatToGrid(beat, subdiv) {
  const perBeat = subdivisionsPerBeat(subdiv);
  const epsilon = 1e-9;
  return Math.max(0, Math.ceil(beat * perBeat - epsilon) / perBeat);
}

export function defaultMetronomeConfig() {
  return {
    enabled: false,
    volume: 1,
    subdiv: 'quarter',
    beatsPerMeasure: 4,
    beatsPerMeasureOverride: false,
    accentPattern: [true, false, false, false],
    countInEnabled: false,
    countInBeats: 4,
    countInUseBars: false,
  };
}

export function defaultTempoRampConfig() {
  return {
    enabled: false,
    startBpm: null,
    targetBpm: 140,
    stepBpm: 5,
    intervalMode: 'loops',
    intervalValue: 4,
    holdAtTarget: true,
  };
}

function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function clampBeatsPerMeasure(n, fallback = 4) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(12, v);
}

function normalizeAccentPattern(pattern, beats) {
  const b = clampBeatsPerMeasure(beats);
  const src = Array.isArray(pattern) ? pattern : [];
  const out = [];
  for (let i = 0; i < b; i++) out.push(!!(src[i] ?? (i === 0)));
  return out;
}

export function normalizeMetronomeConfig(raw = {}) {
  const base = defaultMetronomeConfig();
  const beats = clampBeatsPerMeasure(
    raw.beatsPerMeasureOverride ? raw.beatsPerMeasure : (raw.beatsPerMeasure ?? base.beatsPerMeasure),
    base.beatsPerMeasure,
  );
  return {
    enabled: !!raw.enabled,
    volume: clampVolume(raw.volume ?? base.volume),
    subdiv: normalizeSubdiv(raw.subdiv),
    beatsPerMeasure: beats,
    beatsPerMeasureOverride: !!raw.beatsPerMeasureOverride,
    accentPattern: normalizeAccentPattern(raw.accentPattern, beats),
    countInEnabled: !!raw.countInEnabled,
    countInBeats: Math.max(1, Math.min(32, Math.round(Number(raw.countInBeats) || base.countInBeats))),
    countInUseBars: !!raw.countInUseBars,
  };
}

export function normalizeTempoRampConfig(raw = {}) {
  const base = defaultTempoRampConfig();
  const mode = GPP_RAMP_INTERVAL_MODES.includes(raw.intervalMode) ? raw.intervalMode : base.intervalMode;
  const step = Math.round(Number(raw.stepBpm));
  return {
    enabled: !!raw.enabled,
    startBpm: Number.isFinite(Number(raw.startBpm)) && Number(raw.startBpm) > 0
      ? clampBpm(raw.startBpm)
      : null,
    targetBpm: clampBpm(raw.targetBpm ?? base.targetBpm),
    stepBpm: Number.isFinite(step) && step !== 0 ? step : base.stepBpm,
    intervalMode: mode,
    intervalValue: Math.max(1, Math.round(Number(raw.intervalValue) || base.intervalValue)),
    holdAtTarget: raw.holdAtTarget !== false,
  };
}

/** Derive beats-per-measure from score time signature at a bar. */
export function deriveBeatsPerMeasure(model, measureIndex = 0) {
  const measures = model?.measures || [];
  const m = measures[measureIndex] || measures[0];
  if (m?.timeSig && m.timeSig.length >= 2) {
    const num = Number(m.timeSig[0]) || 4;
    const den = Number(m.timeSig[1]) || 4;
    return Math.max(1, Math.round(num * (4 / den)));
  }
  if (m && Number.isFinite(m.startBeat) && Number.isFinite(m.endBeat)) {
    const span = m.endBeat - m.startBeat;
    if (span > 0) return Math.max(1, Math.round(span));
  }
  return 4;
}

function measureStartForBeat(beat, measureStarts) {
  let start = 0;
  for (const ms of measureStarts) {
    if (beat >= ms - 1e-5) start = ms;
    else break;
  }
  return start;
}

/** Click level for a quarter-note beat position (integer or fractional). */
export function clickLevelAt(beat, subdiv, config, measureStarts = []) {
  const perBeat = subdivisionsPerBeat(subdiv);
  const measureStart = measureStarts.length
    ? measureStartForBeat(beat, measureStarts)
    : Math.floor(beat / config.beatsPerMeasure) * config.beatsPerMeasure;
  const beatInMeasure = beat - measureStart;
  const beatIndex = ((Math.floor(beatInMeasure + 1e-9) % config.beatsPerMeasure) + config.beatsPerMeasure)
    % config.beatsPerMeasure;
  const subIndex = Math.round((beatInMeasure - Math.floor(beatInMeasure)) * perBeat + 1e-9) % perBeat;
  if (subIndex !== 0) return 'sub';
  if (config.accentPattern[beatIndex]) return 'accent';
  return 'beat';
}

/** Advance to the next click beat position. */
export function nextClickBeat(beat, subdiv) {
  const step = 1 / subdivisionsPerBeat(subdiv);
  return beat + step;
}

/** Positions (quarter-note beats) for clicks in [startBeat, endBeat). */
export function clickPositionsInRange(startBeat, endBeat, subdiv) {
  const step = 1 / subdivisionsPerBeat(subdiv);
  const out = [];
  let b = startBeat;
  while (b < endBeat - 1e-9) {
    out.push(b);
    b = nextClickBeat(b, subdiv);
  }
  return out;
}

export function countInBeatCount(config, model, measureIndex = 0) {
  if (config.countInUseBars) {
    const bpm = deriveBeatsPerMeasure(model, measureIndex);
    return Math.max(1, config.countInBeats * bpm);
  }
  return Math.max(1, config.countInBeats);
}

/** Label for the on-screen count-in overlay. */
export function countInOverlayLabel(remaining, total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const r = Math.max(0, Math.round(Number(remaining) || 0));
  if (!t || r <= 0) return '';
  return String(r);
}

/** Label for the loop rest countdown overlay. */
export function loopRestOverlayLabel(remainingSec) {
  const sec = Number(remainingSec);
  if (!Number.isFinite(sec) || sec <= 0) return '';
  return String(Math.ceil(sec));
}

/**
 * Track count-in beats during playback start.
 * @returns {{ start:(total:number)=>void, tick:()=>string, clear:()=>void }}
 */
export function createCountInDisplay() {
  let total = 0;
  let remaining = 0;
  return {
    start(beats) {
      total = Math.max(1, Math.round(Number(beats) || 1));
      remaining = total;
    },
    tick() {
      const label = countInOverlayLabel(remaining, total);
      if (remaining > 0) remaining -= 1;
      return label;
    },
    clear() {
      total = 0;
      remaining = 0;
    },
    get remaining() {
      return remaining;
    },
  };
}

function prefsStorageKey(scoreKey) {
  return scoreKey ? `${METRO_PREFS_KEY}.${scoreKey}` : METRO_PREFS_KEY;
}

export function readMetroPrefs(scoreKey = '') {
  try {
    const raw = localStorage.getItem(prefsStorageKey(scoreKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      metro: normalizeMetronomeConfig(parsed.metro || parsed),
      ramp: normalizeTempoRampConfig(parsed.ramp || {}),
    };
  } catch (e) { /* ignore */ }
  return null;
}

export function writeMetroPrefs(scoreKey, { metro, ramp } = {}) {
  try {
    const payload = {
      metro: normalizeMetronomeConfig(metro),
      ramp: normalizeTempoRampConfig(ramp),
    };
    localStorage.setItem(prefsStorageKey(scoreKey), JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

/**
 * Tempo ramp controller — drives playback BPM on a timer / loop / measure basis.
 * Does not mutate persisted BPM; callers apply steps via onStep without bpmUserOverride.
 */
export function createTempoRampController({
  getRampConfig,
  onStep,
  onFinish,
  clamp = clampBpm,
} = {}) {
  let session = null;

  function cfg() {
    return normalizeTempoRampConfig(typeof getRampConfig === 'function' ? getRampConfig() : {});
  }

  function resetSession() {
    session = null;
  }

  function startSession(currentBpm) {
    const c = cfg();
    if (!c.enabled) {
      resetSession();
      return;
    }
    const start = c.startBpm != null ? clamp(c.startBpm) : clamp(currentBpm);
    const target = clamp(c.targetBpm);
    const step = c.stepBpm;
    const ascending = step > 0 ? target >= start : target <= start;
    session = {
      startBpm: start,
      targetBpm: target,
      stepBpm: step,
      ascending,
      active: true,
      finished: false,
      playing: true,
      elapsedSec: 0,
      loopPasses: 0,
      measuresSeen: 0,
      lastMeasureIndex: null,
      sinceLastStepSec: 0,
      sinceLastStepLoops: 0,
      sinceLastStepMeasures: 0,
      currentBpm: start,
      stepsTaken: 0,
      lastTickSec: null,
    };
    if (start !== currentBpm) onStep?.(start, { initial: true });
  }

  function pauseSession() {
    if (!session) return;
    session.playing = false;
    session.lastTickSec = null;
  }

  function resumeSession() {
    if (!session || session.finished) return;
    session.playing = true;
  }

  function atTarget(bpm) {
    const c = cfg();
    const target = clamp(c.targetBpm);
    if (c.stepBpm > 0) return bpm >= target;
    if (c.stepBpm < 0) return bpm <= target;
    return true;
  }

  function nextBpm(current) {
    const c = cfg();
    const step = c.stepBpm;
    const target = clamp(c.targetBpm);
    let next = current + step;
    if (step > 0) next = Math.min(next, target);
    else next = Math.max(next, target);
    return clamp(next);
  }

  function applyStep() {
    if (!session || session.finished) return;
    const c = cfg();
    const next = nextBpm(session.currentBpm);
    if (next === session.currentBpm) {
      session.finished = true;
      if (!c.holdAtTarget) onFinish?.();
      return;
    }
    session.currentBpm = next;
    session.stepsTaken += 1;
    session.sinceLastStepSec = 0;
    session.sinceLastStepLoops = 0;
    session.sinceLastStepMeasures = 0;
    onStep?.(next, { stepped: true });
    if (atTarget(next)) {
      session.finished = true;
      if (!c.holdAtTarget) onFinish?.();
    }
  }

  function shouldStep() {
    if (!session || !session.playing || session.finished) return false;
    const c = cfg();
    if (atTarget(session.currentBpm)) {
      session.finished = true;
      if (!c.holdAtTarget) onFinish?.();
      return false;
    }
    const iv = c.intervalValue;
    if (c.intervalMode === 'seconds') return session.sinceLastStepSec >= iv;
    if (c.intervalMode === 'loops') return session.sinceLastStepLoops >= iv;
    if (c.intervalMode === 'measures') return session.sinceLastStepMeasures >= iv;
    return false;
  }

  function onPlaybackTick({
    playing,
    resting,
    currentSec,
    measureIndex,
    loopRestart,
    bpm,
  } = {}) {
    if (!session) return;
    if (!playing || resting) {
      session.lastTickSec = null;
      return;
    }
    const sec = Number(currentSec) || 0;
    if (session.lastTickSec != null) {
      const dt = Math.max(0, sec - session.lastTickSec);
      session.elapsedSec += dt;
      session.sinceLastStepSec += dt;
    }
    session.lastTickSec = sec;

    if (loopRestart) {
      session.loopPasses += 1;
      session.sinceLastStepLoops += 1;
    }
    if (Number.isFinite(measureIndex)) {
      if (session.lastMeasureIndex != null && measureIndex !== session.lastMeasureIndex) {
        session.measuresSeen += 1;
        session.sinceLastStepMeasures += 1;
      }
      session.lastMeasureIndex = measureIndex;
    }
    if (Number.isFinite(bpm)) session.currentBpm = clamp(bpm);

    if (shouldStep()) applyStep();
  }

  function getStatus() {
    const c = cfg();
    if (!c.enabled) {
      return { active: false, enabled: false, finished: false };
    }
    const s = session;
    if (!s) {
      return {
        active: false,
        enabled: true,
        finished: false,
        targetBpm: c.targetBpm,
        stepBpm: c.stepBpm,
      };
    }
    const remaining = s.ascending
      ? Math.max(0, c.targetBpm - s.currentBpm)
      : Math.max(0, s.currentBpm - c.targetBpm);
    const stepsLeft = c.stepBpm !== 0
      ? Math.ceil(remaining / Math.abs(c.stepBpm))
      : 0;
    let nextIn = '';
    if (!s.finished) {
      const iv = c.intervalValue;
      if (c.intervalMode === 'seconds') {
        const left = Math.max(0, iv - s.sinceLastStepSec);
        nextIn = `${left.toFixed(1)}s`;
      } else if (c.intervalMode === 'loops') {
        nextIn = `${Math.max(0, iv - s.sinceLastStepLoops)} loops`;
      } else {
        nextIn = `${Math.max(0, iv - s.sinceLastStepMeasures)} bars`;
      }
    }
    return {
      active: s.active && !s.finished,
      enabled: true,
      finished: s.finished,
      currentBpm: s.currentBpm,
      startBpm: s.startBpm,
      targetBpm: c.targetBpm,
      stepBpm: c.stepBpm,
      stepsTaken: s.stepsTaken,
      stepsLeft,
      nextIn,
      intervalMode: c.intervalMode,
    };
  }

  return {
    startSession,
    pauseSession,
    resumeSession,
    stopSession() {
      const startBpm = session?.startBpm ?? null;
      resetSession();
      return startBpm;
    },
    onPlaybackTick,
    getStatus,
    isActive: () => !!(session?.active && !session.finished),
  };
}

export { GPP_MIN_BPM, GPP_MAX_BPM, clampBpm };
