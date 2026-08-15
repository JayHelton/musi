// Authoritative GP player state (no DOM).

import { emitDataChanged } from '../dataEvents.js';
import { transformModel } from '../tab/tabModel.js';
import {
  beatsFromMeasureRange,
  measureIndicesForBeats,
  clampMeasureIndex,
  normalizeBeatRange,
  scopeBounds,
} from './rangeUtils.js';
import { clampBpm } from './tempoRange.js';
import {
  defaultMetronomeConfig,
  defaultTempoRampConfig,
  normalizeMetronomeConfig,
  normalizeTempoRampConfig,
  readMetroPrefs,
  writeMetroPrefs,
} from './metronomeState.js';

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
    if (Number.isFinite(v) && v >= 0.75 && v <= 2.5) return v;
  } catch (e) { /* ignore */ }
  return 1;
}

function writeBool(key, val) {
  try {
    localStorage.setItem(key, val ? 'true' : 'false');
    emitDataChanged('settings');
  } catch (e) { /* ignore */ }
}

function writeZoom(z) {
  try {
    localStorage.setItem(PARCHMENT_ZOOM_KEY, String(z));
    emitDataChanged('settings');
  } catch (e) { /* ignore */ }
}

function clampGain(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function sourceVolume(track) {
  const v = track?.model?.trackInfo?.volume;
  return Number.isFinite(Number(v)) ? clampGain(v) : 1;
}

function sourcePan(track) {
  const p = track?.model?.trackInfo?.pan;
  if (!Number.isFinite(Number(p))) return 0;
  return Math.max(-1, Math.min(1, Number(p)));
}

function buildTrackPans(gpResult, initGuitarPans, initDrumPans) {
  const guitars = initGuitarPans?.length === gpResult.tracks.length
    ? initGuitarPans.map((p) => sourcePan({ model: { trackInfo: { pan: p } } }))
    : gpResult.tracks.map((t) => sourcePan(t));
  const drums = initDrumPans?.length === (gpResult.drumTracks || []).length
    ? initDrumPans.map((p) => sourcePan({ model: { trackInfo: { pan: p } } }))
    : (gpResult.drumTracks || []).map((t) => sourcePan(t));
  return { guitars, drums };
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
 * @param {string} [options.scoreKey] localStorage key for metronome prefs
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

  // null/'' must mean "no saved value", not bar 0 / beat 0 — Number() would
  // coerce both to 0 and silently pin a whole-score loop to the first bar.
  const isSetNumber = (n) => n != null && n !== '' && Number.isFinite(Number(n));
  const clampBar = (n, fallback) => clampMeasureIndex(
    isSetNumber(n) ? Number(n) : fallback,
    measureCount,
  );

  let generation = 1;

  const scoreKey = options.scoreKey || '';
  const savedMetro = readMetroPrefs(scoreKey);
  const metroDefaults = savedMetro?.metro || defaultMetronomeConfig();
  const rampDefaults = savedMetro?.ramp || defaultTempoRampConfig();

  const initVols = options.initialTrackVolumes;
  const initGuitars = Array.isArray(initVols?.guitars) ? initVols.guitars : null;
  const initDrums = Array.isArray(initVols?.drums) ? initVols.drums : null;
  const initPans = options.initialTrackPans;
  const initGuitarPans = Array.isArray(initPans?.guitars) ? initPans.guitars : null;
  const initDrumPans = Array.isArray(initPans?.drums) ? initPans.drums : null;

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
    trackVolumes: {
      guitars: initGuitars?.length === gpResult.tracks.length
        ? initGuitars.map((v) => clampGain(v))
        : gpResult.tracks.map((t) => sourceVolume(t)),
      drums: initDrums?.length === (gpResult.drumTracks || []).length
        ? initDrums.map((v) => clampGain(v))
        : (gpResult.drumTracks || []).map((t) => sourceVolume(t)),
    },
    trackPans: buildTrackPans(gpResult, initGuitarPans, initDrumPans),
    solo: null,
    metronomeEnabled: !!metroDefaults.enabled,
    countInEnabled: !!metroDefaults.countInEnabled,
    metro: normalizeMetronomeConfig(metroDefaults),
    tempoRamp: normalizeTempoRampConfig(rampDefaults),
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
  const measureBeats = beatsFromMeasureRange(initMeasures, state.loopStart, state.loopEnd);
  let loopStartBeat = isSetNumber(options.initialLoopStartBeat)
    ? Number(options.initialLoopStartBeat)
    : measureBeats.startBeat;
  let loopEndBeat = isSetNumber(options.initialLoopEndBeat)
    ? Number(options.initialLoopEndBeat)
    : measureBeats.endBeat;
  // A zero-length window passes every null check downstream but filters every
  // note out of the mix, so an unusable span has to mean "no beat loop" instead.
  if (!(loopEndBeat > loopStartBeat)) {
    const usable = measureBeats.endBeat > measureBeats.startBeat;
    loopStartBeat = usable ? measureBeats.startBeat : null;
    loopEndBeat = usable ? measureBeats.endBeat : null;
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

  function setTrackVolume(kind, index, gain) {
    const arr = kind === 'guitar' ? state.trackVolumes.guitars : state.trackVolumes.drums;
    if (index < 0 || index >= arr.length) return;
    arr[index] = clampGain(gain);
  }

  function getTrackVolume(kind, index) {
    const arr = kind === 'guitar' ? state.trackVolumes.guitars : state.trackVolumes.drums;
    return arr[index] ?? 1;
  }

  function setTrackPan(kind, index, pan) {
    const arr = kind === 'guitar' ? state.trackPans.guitars : state.trackPans.drums;
    if (index < 0 || index >= arr.length) return;
    arr[index] = sourcePan({ model: { trackInfo: { pan } } });
  }

  function getTrackPan(kind, index) {
    const arr = kind === 'guitar' ? state.trackPans.guitars : state.trackPans.drums;
    return arr[index] ?? 0;
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

  function persistMetroPrefs() {
    writeMetroPrefs(scoreKey, { metro: state.metro, ramp: state.tempoRamp });
  }

  function toPersistable() {
    return {
      preferredTrackIndex: state.trackIndex,
      trackVolumes: {
        guitars: [...state.trackVolumes.guitars],
        drums: [...state.trackVolumes.drums],
      },
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
    const v = Math.max(0.75, Math.min(2.5, Number(z) || 1));
    state.parchmentZoom = v;
    writeZoom(v);
  }

  function resetForNewScore(options = {}) {
    const measures = state.gp.tracks[0]?.model?.measures
      || state.gp.drumTracks?.[0]?.model?.measures
      || [];
    const mc = measures.length || measureCount;
    const hasFrettedNow = state.gp?.tracks?.length > 0;

    state.loopEnabled = false;
    state.loopStartBeat = null;
    state.loopEndBeat = null;
    state.loopStart = 0;
    state.loopEnd = Math.max(0, mc - 1);
    state.loopSelectMode = false;
    state.loopRestSec = Math.max(0, Number(options.loopRestSec) || 0);
    state.bpmUserOverride = false;
    state.transpose = 0;
    state.tuning = null;
    state.retuneMode = 'fingerings';
    state.solo = null;
    state.trackVolumes = {
      guitars: state.gp.tracks.map((t) => sourceVolume(t)),
      drums: (state.gp.drumTracks || []).map((t) => sourceVolume(t)),
    };
    state.trackPans = {
      guitars: state.gp.tracks.map((t) => sourcePan(t)),
      drums: (state.gp.drumTracks || []).map((t) => sourcePan(t)),
    };
    state.trackIndex = hasFrettedNow ? 0 : -1;
    state.viewKind = hasFrettedNow ? 'guitar' : 'drum';
    state.viewIndex = 0;
    state.navBar = null;

    if (Number.isFinite(Number(options.preferredTrackIndex)) && hasFrettedNow) {
      state.trackIndex = Math.max(
        0,
        Math.min(state.gp.tracks.length - 1, Number(options.preferredTrackIndex)),
      );
      state.viewIndex = state.trackIndex;
    }
    if (Number.isFinite(Number(options.initialTranspose))) {
      state.transpose = Math.round(Number(options.initialTranspose));
    }
    if (options.initialTuning != null && options.initialTuning !== '') {
      state.tuning = options.initialTuning;
    }
    if (options.initialRetuneMode === 'pitches' || options.initialRetuneMode === 'fingerings') {
      state.retuneMode = options.initialRetuneMode;
    }
    if (options.initialLoopEnabled) {
      state.loopEnabled = true;
      state.loopStart = clampBar(options.initialLoopStart, 0);
      state.loopEnd = clampBar(options.initialLoopEnd, Math.max(0, mc - 1));
      const beatFallback = beatsFromMeasureRange(measures, state.loopStart, state.loopEnd);
      const startBeat = isSetNumber(options.initialLoopStartBeat)
        ? Number(options.initialLoopStartBeat)
        : beatFallback.startBeat;
      const endBeat = isSetNumber(options.initialLoopEndBeat)
        ? Number(options.initialLoopEndBeat)
        : beatFallback.endBeat;
      if (endBeat > startBeat) {
        state.loopStartBeat = startBeat;
        state.loopEndBeat = endBeat;
      } else {
        state.loopStartBeat = null;
        state.loopEndBeat = null;
      }
    }

    applyTransforms();
    const resolved = resolveInitialBpm(options.initialBpm, state.scoreBpm);
    if (resolved.apply) {
      state.bpm = resolved.bpm;
      state.bpmUserOverride = resolved.bpmUserOverride;
    } else {
      state.bpm = state.scoreBpm;
      state.bpmUserOverride = false;
    }
  }

  applyTransforms();

  return {
    state,
    getEffectiveEnabled,
    enterSolo,
    leaveSolo,
    toggleSolo,
    setTrackEnabled,
    setTrackVolume,
    getTrackVolume,
    setTrackPan,
    getTrackPan,
    playAll,
    setViewTrack,
    applyTransforms,
    getScope,
    setLoopRange,
    clearLoop,
    setLoopMeasures,
    resetBpm,
    toPersistable,
    persistMetroPrefs,
    isAlive,
    destroy,
    setAutoFollow,
    setParchmentZoom,
    resetForNewScore,
  };
}
