// Shared helpers for mounting GP exercises with optional bar-range slicing.

import { sliceModelByBeats } from './tab/tabModel.js';
import { beatsFromMeasureRange } from './gpPlayer/rangeUtils.js';

const BAR_RANGE_KEYS = ['measureStart', 'measureEnd', 'startBeat', 'endBeat'];
const MISSING_TAB = 'This exercise snippet is missing tab data.';

/** True when the exercise targets a strict sub-range of bars (not whole score). */
export function isSegmentExercise(item) {
  if (!item) return false;
  const start = item.measureStart;
  const end = item.measureEnd;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return end > start;
}

function referenceMeasures(gpResult) {
  return gpResult.tracks?.[0]?.model?.measures
    || gpResult.drumTracks?.[0]?.model?.measures
    || [];
}

function resolveBeatWindow(gpResult, item) {
  if (Number.isFinite(item.startBeat)
    && Number.isFinite(item.endBeat)
    && item.endBeat > item.startBeat) {
    return { startBeat: item.startBeat, endBeat: item.endBeat };
  }
  return beatsFromMeasureRange(
    referenceMeasures(gpResult),
    item.measureStart,
    item.measureEnd,
  );
}

/** True when the range already covers every bar, so slicing would be a no-op. */
function coversWholeScore(gpResult, item) {
  const count = referenceMeasures(gpResult).length;
  if (!count) return true;
  return item.measureStart <= 0 && item.measureEnd >= count - 1;
}

function countTrackNotes(model) {
  return (model?.events || []).filter((e) => e.fret != null || e.dead).length;
}

/** Slice every track/drum model in a gpResult to a beat window. */
export function sliceGpResultByBeats(gpResult, { startBeat, endBeat }) {
  return {
    tempo: gpResult.tempo,
    warnings: gpResult.warnings || [],
    tracks: (gpResult.tracks || []).map((t) => {
      const model = sliceModelByBeats(t.model, { startBeat, endBeat });
      return { ...t, model, noteCount: countTrackNotes(model) };
    }),
    drumTracks: (gpResult.drumTracks || []).map((t) => {
      const model = sliceModelByBeats(t.model, { startBeat, endBeat });
      return { ...t, model, hitCount: (model.events || []).length };
    }),
  };
}

/**
 * When `item` is a segment exercise, return a gpResult whose track models are
 * sliced to that bar window; otherwise return the input unchanged.
 */
export function buildExerciseGpResult(gpResult, item) {
  if (!isSegmentExercise(item) || coversWholeScore(gpResult, item)) {
    return { gp: gpResult, sliced: false };
  }
  const { startBeat, endBeat } = resolveBeatWindow(gpResult, item);
  if (!(endBeat > startBeat)) {
    return { gp: gpResult, sliced: false };
  }
  return { gp: sliceGpResultByBeats(gpResult, { startBeat, endBeat }), sliced: true };
}

/**
 * Strip bar-range keys from a practice-settings patch when the mounted score
 * is already sliced — otherwise persisted ranges would be rebased to 0..n.
 */
export function filterPracticeSettingsPatch(patch, { sliced } = {}) {
  if (!sliced || !patch) return patch;
  const out = { ...patch };
  for (const k of BAR_RANGE_KEYS) delete out[k];
  return out;
}

// Dashes carry meaning in segment names ("Bars 9–12"); dropping them outright
// would leave "Bars 912", so fold them to a plain hyphen before stripping.
function safeFileNamePart(value, fallback) {
  return String(value || '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^\w\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

/** Build a safe `.musi-tab.json` file name for a split segment. */
export function segmentExerciseFileName(sourceBaseName, segmentName) {
  const base = safeFileNamePart(
    String(sourceBaseName || 'score').replace(/\.(gp|gp5|gp3|gp4|gpx|musi-tab\.json)$/i, ''),
    'score',
  );
  const seg = safeFileNamePart(segmentName, 'segment');
  return `${base} - ${seg}.musi-tab.json`;
}

/**
 * Serialize a gpResult (typically already sliced) to the v3 musi-tab-model JSON
 * format. `source` is provenance only — loaders must not re-slice from it.
 */
export function serializeExerciseScore(gpResult, {
  sourceFileName,
  measureStart,
  measureEnd,
} = {}) {
  const tempo = Number(gpResult.tempo)
    || Number(gpResult.tracks?.[0]?.model?.tempo)
    || Number(gpResult.drumTracks?.[0]?.model?.tempo)
    || 120;
  const payload = {
    format: 'musi-tab-model',
    version: 3,
    tempo,
    tracks: (gpResult.tracks || []).map((t, i) => ({
      index: Number.isFinite(t.index) ? t.index : i,
      name: t.name || `Track ${i + 1}`,
      tuning: t.tuning || t.model?.tuning || 'Standard',
      model: t.model,
    })),
    drumTracks: (gpResult.drumTracks || []).map((t, i) => ({
      index: Number.isFinite(t.index) ? t.index : i,
      name: t.name || `Drums ${i + 1}`,
      model: t.model,
    })),
    warnings: gpResult.warnings || [],
  };
  if (sourceFileName != null && Number.isFinite(measureStart) && Number.isFinite(measureEnd)) {
    payload.source = { fileName: sourceFileName, measureStart, measureEnd };
  }
  return JSON.stringify(payload);
}

/**
 * Build a gpResult from a musi-tab-model JSON payload (v3 or v2 multi-track,
 * legacy single-track, or bare model). Throws MISSING_TAB when unusable.
 */
export function gpResultFromTabModelJson(raw, { fallbackName = 'Exercise' } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error(MISSING_TAB);

  if (raw.format === 'musi-tab-model' && Array.isArray(raw.tracks)) {
    const version = Number(raw.version);
    if (Number.isFinite(version) && version !== 2 && version !== 3) {
      throw new Error(MISSING_TAB);
    }
    const tracks = raw.tracks.map((t, i) => {
      const model = t.model;
      if (!model?.events) throw new Error(MISSING_TAB);
      return {
        index: Number.isFinite(t.index) ? t.index : i,
        name: t.name || `Track ${i + 1}`,
        tuning: t.tuning || model.tuning || 'Standard',
        noteCount: countTrackNotes(model),
        model,
      };
    });
    const drumTracks = (raw.drumTracks || []).map((t, i) => {
      const model = t.model;
      if (!model?.events) throw new Error(MISSING_TAB);
      return {
        index: Number.isFinite(t.index) ? t.index : i,
        name: t.name || `Drums ${i + 1}`,
        model,
        hitCount: (model.events || []).length,
      };
    });
    if (!tracks.length && !drumTracks.length) throw new Error(MISSING_TAB);
    return {
      tempo: Number(raw.tempo) || Number(tracks[0]?.model?.tempo) || 120,
      tracks,
      drumTracks,
      warnings: raw.warnings || [],
    };
  }

  const model = raw.model || raw;
  if (!model?.events) throw new Error(MISSING_TAB);
  return {
    tempo: Number(raw.tempo) || Number(model.tempo) || 120,
    tracks: [{
      index: 0,
      name: raw.trackName || fallbackName,
      tuning: model.tuning || 'Standard',
      noteCount: countTrackNotes(model),
      model,
    }],
    drumTracks: [],
    warnings: [],
  };
}
