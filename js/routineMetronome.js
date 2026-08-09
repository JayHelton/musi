// Instance-based metronome for routine practice sessions. Separate from
// js/metronome.js so each session owns its own BPM/subdivision state without
// DOM coupling or fighting the global Metronome tool singleton.

import { audioCtx, ensureAudio, getAnalyserDestination } from './audio.js';

const SCHEDULE_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.12;
const BPM_MIN = 30;
const BPM_MAX = 300;
const BEATS_MIN = 1;
const BEATS_MAX = 12;

const SUBDIV_BY_ID = {
  quarter: { id: 'quarter', label: '4ths', perBeat: 1 },
  eighth: { id: 'eighth', label: '8ths', perBeat: 2 },
  triplet: { id: 'triplet', label: 'Triplets', perBeat: 3 },
  sixteenth: { id: 'sixteenth', label: '16ths', perBeat: 4 },
};

export const ROUTINE_METRONOME_SUBDIVISIONS = [
  SUBDIV_BY_ID.quarter,
  SUBDIV_BY_ID.eighth,
  SUBDIV_BY_ID.triplet,
  SUBDIV_BY_ID.sixteenth,
];

function normalizeSubdiv(id) {
  return SUBDIV_BY_ID[id] ? id : 'quarter';
}

function subdivPerBeat(id) {
  return SUBDIV_BY_ID[normalizeSubdiv(id)].perBeat;
}

function clampBpm(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(n)));
}

function clampBeats(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(n)));
}

export function createRoutineMetronome(options = {}) {
  let bpm = clampBpm(options.bpm, 100);
  let beats = clampBeats(options.beats, 4);
  let subdiv = normalizeSubdiv(options.subdiv);
  let accentFirst = options.accentFirst !== false;

  let onBeat = typeof options.onBeat === 'function' ? options.onBeat : null;
  let onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;

  let playing = false;
  let timer = null;
  let nextClickTime = 0;
  let beat = 0;
  let sub = 0;
  let bar = 0;
  const pendingVisuals = [];

  function getCtx() {
    return audioCtx;
  }

  function scheduleClick(when, level) {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    osc.type = 'triangle';

    let freq;
    let peak;
    if (level === 'accent') {
      freq = 1200;
      peak = 0.12;
    } else if (level === 'beat') {
      freq = 800;
      peak = 0.08;
    } else {
      freq = 600;
      peak = 0.05;
    }

    osc.frequency.value = freq;
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 8;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    osc.connect(bp);
    bp.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(when);
    osc.stop(when + 0.05);
  }

  function clearPendingVisuals() {
    while (pendingVisuals.length) clearTimeout(pendingVisuals.pop());
  }

  function fireOnBeat(detail) {
    if (!playing || !onBeat) return;
    try {
      onBeat(detail);
    } catch (e) { /* UI callbacks must not kill the scheduler */ }
  }

  function scheduleBeatCallback(when, detail) {
    if (!onBeat) return;
    const ctx = getCtx();
    const delay = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
    const id = setTimeout(() => fireOnBeat(detail), delay);
    pendingVisuals.push(id);
  }

  function clampBeatInBar() {
    if (beat >= beats) beat = Math.max(0, beats - 1);
  }

  function clickLevelForPosition() {
    if (sub === 0 && beat === 0 && accentFirst) return 'accent';
    if (sub === 0) return 'beat';
    return 'sub';
  }

  function beatDetail() {
    const level = clickLevelForPosition();
    return {
      beat,
      sub,
      bar,
      accented: level === 'accent',
      isDownbeat: beat === 0 && sub === 0,
    };
  }

  function advancePosition() {
    sub += 1;
    const perBeat = subdivPerBeat(subdiv);
    if (sub >= perBeat) {
      sub = 0;
      beat += 1;
      if (beat >= beats) {
        beat = 0;
        bar += 1;
      }
    }
  }

  function secondsPerSubClick() {
    return (60 / bpm) / subdivPerBeat(subdiv);
  }

  function scheduler() {
    if (!playing) return;

    const ctx = getCtx();
    if (!ctx) {
      timer = setTimeout(scheduler, SCHEDULE_INTERVAL_MS);
      return;
    }

    // Tab backgrounding can throttle timers; jump forward instead of stacking
    // missed clicks in the past.
    if (nextClickTime < ctx.currentTime) {
      nextClickTime = ctx.currentTime;
    }

    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SEC;
    while (nextClickTime < horizon) {
      const when = nextClickTime;
      const level = clickLevelForPosition();
      scheduleClick(when, level);
      scheduleBeatCallback(when, beatDetail());
      advancePosition();
      nextClickTime += secondsPerSubClick();
    }

    timer = setTimeout(scheduler, SCHEDULE_INTERVAL_MS);
  }

  function notifyState(nextPlaying) {
    if (!onStateChange) return;
    try {
      onStateChange(nextPlaying);
    } catch (e) { /* noop */ }
  }

  function start() {
    if (playing) return;
    try {
      ensureAudio();
    } catch (e) { /* no Web Audio in this environment */ }

    playing = true;
    beat = 0;
    sub = 0;
    bar = 0;
    clampBeatInBar();

    const ctx = getCtx();
    nextClickTime = ctx ? ctx.currentTime + 0.05 : performance.now() / 1000 + 0.05;

    notifyState(true);
    scheduler();
  }

  function stop() {
    if (!playing) return;
    playing = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    clearPendingVisuals();
    notifyState(false);
  }

  function toggle() {
    if (playing) stop();
    else start();
    return playing;
  }

  function isPlaying() {
    return playing;
  }

  function setBpm(value) {
    bpm = clampBpm(value, bpm);
    return bpm;
  }

  function setBeats(value) {
    beats = clampBeats(value, beats);
    clampBeatInBar();
    return beats;
  }

  function setSubdiv(id) {
    subdiv = normalizeSubdiv(id);
    return subdiv;
  }

  function setAccentFirst(value) {
    accentFirst = !!value;
    return accentFirst;
  }

  function setConfig(partial = {}) {
    if (partial.bpm !== undefined) setBpm(partial.bpm);
    if (partial.beats !== undefined) setBeats(partial.beats);
    if (partial.subdiv !== undefined) setSubdiv(partial.subdiv);
    if (partial.accentFirst !== undefined) setAccentFirst(partial.accentFirst);
    return getConfig();
  }

  function getConfig() {
    return { bpm, beats, subdiv, accentFirst };
  }

  function destroy() {
    stop();
    onBeat = null;
    onStateChange = null;
  }

  return {
    start,
    stop,
    toggle,
    isPlaying,
    setBpm,
    setBeats,
    setSubdiv,
    setAccentFirst,
    setConfig,
    getConfig,
    destroy,
  };
}
