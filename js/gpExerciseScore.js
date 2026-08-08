// Shared helpers for mounting GP exercises with optional bar-range slicing.

import { sliceModelByBeats } from './tab/tabModel.js';
import { beatsFromMeasureRange } from './gpPlayer/rangeUtils.js';

const BAR_RANGE_KEYS = ['measureStart', 'measureEnd', 'startBeat', 'endBeat'];

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
  const gp = {
    tempo: gpResult.tempo,
    warnings: gpResult.warnings || [],
    tracks: (gpResult.tracks || []).map((t) => ({
      ...t,
      model: sliceModelByBeats(t.model, { startBeat, endBeat }),
    })),
    drumTracks: (gpResult.drumTracks || []).map((t) => ({
      ...t,
      model: sliceModelByBeats(t.model, { startBeat, endBeat }),
    })),
  };
  return { gp, sliced: true };
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
