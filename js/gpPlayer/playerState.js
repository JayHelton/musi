// Authoritative GP player state (no DOM).

import { transformModel } from '../tab/tabModel.js';
import {
  beatsFromMeasureRange,
  measureIndicesForBeats,
  clampMeasureIndex,
  normalizeBeatRange,
  scopeBounds,
} from './rangeUtils.js';
import { clampBpm } from './tempoRange.js';

const AUTO_FOLLOW_KEY = 'musi.gpAutoFollow';
const PARCHMENT_ZOOM_KEY = 'musi.gpParchmentZoom';

function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch (e) { /* ignore */ }
  return fallback;
}

function readZoom() {
  try {
    const v = parseFloat(localStorage.getItem(PARCHMENT_ZOOM_KEY));
    if (Number.isFinite(v) && v >= 0.75 && v <= 1.5) return v;
  } catch (e) { /* ignore */ }
  return 1;
}

function writeBool(key, val) {
  try { localStorage.setItem(key, val ? 'true' : 'false'); } catch (e) { /* ignore */ }
}

function writeZoom(z) {
  try { localStorage.setItem(PARCHMENT_ZOOM_KEY, String(z)); } catch (e) { /* ignore */ }
}

/**
 * Apply an exercise-saved BPM only when it is a real positive finite value.
 * @returns {{ apply: false } | { apply: true, bpm: number, bpmUserOverride: boolean }}
 */
export function resolveInitialBpm(initialBpm, scoreBpm) {
  const n = Number(initialBpm);
  if (!Number.isFinite(n) || n <= 0) return { apply: false };
  const bpm = clampBpm(n);
  const rounded = Math.round(bpm);
  const scoreRounded = Math.round(Number(scoreBpm) || 0);
  return {
    apply: true,
    bpm,
    bpmUserOverride: rounded !== scoreRounded,
  };
}

/**
 * @param {object} gpResult parseGuitarPro output
 * @param {object} [options]
 */
export function createPlayerState(gpResult, options = {}) {
  const hasFretted = gpResult?.tracks?.length > 0;
  const hasDrums = gpResult?.drumTracks?.length > 0;
  if (!gpResult || (!hasFretted && !hasDrums)) {
    throw new Error('createPlayerState: no playable tracks');
  }

  const measureCount = gpResult.tracks[0]?.model?.measures?.length
    || gpResult.drumTracks?.[0]?.model?.measures?.length
    || 1;

  const clampBar = (n, fallback) => clampMeasureIndex(
    Number.isFinite(Number(n)) ? Number(n) : fallback,
    measureCount,
  );

  let generation = 1;

  const state = {
    gp: gpResult,
    trackIndex: hasFretted
      ? Math.max(0, Math.min(gpResult.tracks.length - 1, options.preferredTrackIndex || 0))
      : -1,
    viewKind: hasFretted ? 'guitar' : 'drum',
    viewIndex: hasFretted
      ? Math.max(0, Math.min(gpResult.tracks.length - 1, options.preferredTrackIndex || 0))
      : 0,
    navBar: null,
    enabledGuitars: gpResult.tracks.map(() => true),
    enabledDrums: (gpResult.drumTracks || []).map(() => true),
    solo: null,
    metronomeEnabled: false,
    countInEnabled: false,
    scoreBpm: Number(gpResult.tempo)
      || Number(gpResult.tracks[0]?.model?.tempo)
      || Number(gpResult.drumTracks?.[0]?.model?.tempo)
      || 120,
    bpm: Number(gpResult.tempo)
      || Number(gpResult.tracks[0]?.model?.tempo)
      || Number(gpResult.drumTracks?.[0]?.model?.tempo)
      || 120,
    bpmUserOverride: false,
    transpose: 0,
    tuning: null,
    retuneMode: 'fingerings',
    loopStart: clampBar(options.initialLoopStart, 0),
    loopEnd: clampBar(options.initialLoopEnd, Math.max(0, measureCount - 1)),
    loopEnabled: !!options.initialLoopEnabled,
    loopRestSec: Math.max(0, Number(options.loopRestSec) || 0),
    loopSelectMode: false,
    exerciseScope: !!options.exerciseScope,
    autoFollow: readBool(AUTO_FOLLOW_KEY, true),
    parchmentZoom: readZoom(),
    baseModel: null,
    viewModel: null,
    destroyed: false,
    generation,
  };

  if (state.loopEnd < state.loopStart) state.loopEnd = state.loopStart;

  if (Number.isFinite(Number(options.initialTranspose))) {
    state.transpose = Math.round(Number(options.initialTranspose));
  }
  if (options.initialTuning != null && options.initialTuning !== '') {
    state.tuning = options.initialTuning;
  }
  if (options.initialRetuneMode === 'pitches' || options.initialRetuneMode === 'fingerings') {
    state.retuneMode = options.initialRetuneMode;
  }

  const initMeasures = gpResult.tracks[0]?.model?.measures
    || gpResult.drumTracks?.[0]?.model?.measures
    || [];
  let loopStartBeat = Number.isFinite(Number(options.initialLoopStartBeat))
    ? Number(options.initialLoopStartBeat)
    : null;
  let loopEndBeat = Number.isFinite(Number(options.initialLoopEndBeat))
    ? Number(options.initialLoopEndBeat)
    : null;
  if (loopStartBeat == null || loopEndBeat == null) {
    const initBeats = beatsFromMeasureRange(initMeasures, state.loopStart, state.loopEnd);
    if (loopStartBeat == null) loopStartBeat = initBeats.startBeat;
    if (loopEndBeat == null) loopEndBeat = initBeats.endBeat;
  }
  state.loopStartBeat = loopStartBeat;
  state.loopEndBeat = loopEndBeat;

  function currentTrack() {
    if (state.trackIndex < 0) return null;
    return state.gp.tracks[state.trackIndex];
  }

  function getEffectiveEnabled() {
    if (!state.solo) {
      return {
        enabledGuitars: [...state.enabledGuitars],
        enabledDrums: [...state.enabledDrums],
      };
    }
    const guitars = state.enabledGuitars.map(() => false);
    const drums = state.enabledDrums.map(() => false);
    if (state.solo.kind === 'guitar') guitars[state.solo.index] = true;
    else drums[state.solo.index] = true;
    return { enabledGuitars: guitars, enabledDrums: drums };
  }

  function enterSolo(kind, index) {
    if (!state.solo) {
      state.solo = {
        kind,
        index,
        savedGuitars: [...state.enabledGuitars],
        savedDrums: [...state.enabledDrums],
      };
    } else {
      state.solo.kind = kind;
      state.solo.index = index;
    }
  }

  function leaveSolo() {
    if (!state.solo) return;
    state.enabledGuitars = [...state.solo.savedGuitars];
    state.enabledDrums = [...state.solo.savedDrums];
    state.solo = null;
  }

  function toggleSolo(kind, index) {
    if (state.solo?.kind === kind && state.solo.index === index) leaveSolo();
    else enterSolo(kind, index);
  }

  function setTrackEnabled(kind, index, on) {
    if (state.solo) {
      if (kind === 'guitar') state.solo.savedGuitars[index] = !!on;
      else state.solo.savedDrums[index] = !!on;
      if (state.solo.kind === kind && state.solo.index === index && !on) leaveSolo();
    }
    if (kind === 'guitar') state.enabledGuitars[index] = !!on;
    else state.enabledDrums[index] = !!on;
  }

  function playAll() {
    state.solo = null;
    state.enabledGuitars = state.enabledGuitars.map(() => true);
    state.enabledDrums = state.enabledDrums.map(() => true);
  }

  function setViewTrack(kind, index) {
    state.viewKind = kind;
    state.viewIndex = index;
    if (kind === 'guitar') state.trackIndex = index;
  }

  function applyTransforms() {
    if (state.viewKind === 'drum') {
      state.baseModel = null;
      state.viewModel = state.gp.drumTracks?.[state.viewIndex]?.model || null;
      if (state.viewModel) {
        state.scoreBpm = Number(state.viewModel.tempo) || Number(state.gp.tempo) || state.scoreBpm;
      }
      if (!state.bpmUserOverride) state.bpm = state.scoreBpm;
      return state.viewModel;
    }
    const track = currentTrack();
    state.baseModel = track?.model || null;
    if (!state.baseModel) {
      state.viewModel = state.gp.drumTracks?.[0]?.model || null;
      if (state.viewModel) {
        state.scoreBpm = Number(state.viewModel.tempo) || Number(state.gp.tempo) || state.scoreBpm;
      }
      if (!state.bpmUserOverride) state.bpm = state.scoreBpm;
      return state.viewModel;
    }
    const tuning = state.tuning && state.tuning !== '__file__' ? state.tuning : null;
    state.viewModel = transformModel(state.baseModel, {
      transpose: state.transpose,
      tuning,
      preservePitch: state.retuneMode === 'pitches',
    });
    if (state.viewModel) {
      state.scoreBpm = Number(state.viewModel.tempo) || Number(state.gp.tempo) || state.scoreBpm;
    }
    if (!state.bpmUserOverride) state.bpm = state.scoreBpm;
    return state.viewModel;
  }

  function getScope() {
    const measures = state.viewModel?.measures || [];
    return scopeBounds({
      exerciseScope: state.exerciseScope,
      loopEnabled: state.loopEnabled,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      measureCount: measures.length || measureCount,
    });
  }

  function setLoopRange(startBeat, endBeat) {
    const measures = state.viewModel?.measures || initMeasures;
    const songEnd = state.viewModel?.totalBeats
      ?? measures[measures.length - 1]?.endBeat
      ?? endBeat;
    const norm = normalizeBeatRange(startBeat, endBeat, { minSpan: 1, songEndBeat: songEnd });
    if (!norm) return false;
    state.loopStartBeat = norm.startBeat;
    state.loopEndBeat = norm.endBeat;
    const { startIdx, endIdx } = measureIndicesForBeats(measures, norm.startBeat, norm.endBeat);
    state.loopStart = startIdx;
    state.loopEnd = endIdx;
    return true;
  }

  function clearLoop() {
    state.loopEnabled = false;
    state.loopStartBeat = null;
    state.loopEndBeat = null;
    state.loopStart = 0;
    state.loopEnd = Math.max(0, measureCount - 1);
  }

  function setLoopMeasures(a, b) {
    const measures = state.viewModel?.measures || initMeasures;
    const startIdx = clampMeasureIndex(a, measures.length || measureCount);
    const endIdx = clampMeasureIndex(b, measures.length || measureCount);
    state.loopStart = Math.min(startIdx, endIdx);
    state.loopEnd = Math.max(startIdx, endIdx);
    const beats = beatsFromMeasureRange(measures, state.loopStart, state.loopEnd);
    state.loopStartBeat = beats.startBeat;
    state.loopEndBeat = beats.endBeat;
  }

  function resetBpm() {
    state.bpmUserOverride = false;
    state.bpm = state.scoreBpm;
  }

  function toPersistable() {
    return {
      preferredTrackIndex: state.trackIndex,
      loopEnabled: state.loopEnabled,
      measureStart: state.loopStart,
      measureEnd: state.loopEnd,
      startBeat: state.loopEnabled ? state.loopStartBeat : null,
      endBeat: state.loopEnabled ? state.loopEndBeat : null,
      loopRestSec: state.loopRestSec,
      bpm: state.bpmUserOverride ? state.bpm : null,
      transpose: state.transpose,
      tuning: state.tuning,
      retuneMode: state.retuneMode,
    };
  }

  function isAlive(_gen) {
    return !state.destroyed;
  }

  function destroy() {
    state.destroyed = true;
    generation += 1;
    state.generation = generation;
  }

  function setAutoFollow(on) {
    state.autoFollow = !!on;
    writeBool(AUTO_FOLLOW_KEY, state.autoFollow);
  }

  function setParchmentZoom(z) {
    const v = Math.max(0.75, Math.min(1.5, Number(z) || 1));
    state.parchmentZoom = v;
    writeZoom(v);
  }

  applyTransforms();

  return {
    state,
    getEffectiveEnabled,
    enterSolo,
    leaveSolo,
    toggleSolo,
    setTrackEnabled,
    playAll,
    setViewTrack,
    applyTransforms,
    getScope,
    setLoopRange,
    clearLoop,
    setLoopMeasures,
    resetBpm,
    toPersistable,
    isAlive,
    destroy,
    setAutoFollow,
    setParchmentZoom,
  };
}
