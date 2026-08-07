// Pure beat/measure range helpers for the GP parchment player.

/** Beat span for one measure (robust fallbacks for missing endBeat). */
export function measureSpan(m) {
  const start = Number.isFinite(m.startBeat)
    ? m.startBeat
    : (Number.isFinite(m.startSlot) ? m.startSlot : 0);
  const end = Number.isFinite(m.endBeat)
    ? m.endBeat
    : (Number.isFinite(m.endSlot) ? m.endSlot : start + 4);
  return { start, end, len: Math.max(0.25, end - start) };
}

/**
 * Map a beat position to a measure index.
 * Pre-start beats → 0; past end → last index (never "no match → last" for negative beats).
 */
export function measureIndexAtBeat(measures, beat) {
  if (!measures?.length) return 0;
  const b = Number(beat);
  if (!Number.isFinite(b)) return 0;
  const eps = 1e-6;
  const first = measureSpan(measures[0]);
  if (b < first.start - eps) return 0;
  const lastIdx = measures.length - 1;
  const last = measureSpan(measures[lastIdx]);
  if (b >= last.end - eps) return lastIdx;
  for (let i = 0; i < measures.length; i++) {
    const { start, end } = measureSpan(measures[i]);
    if (b >= start - eps && b < end - eps) return i;
  }
  return lastIdx;
}

export function beatsFromMeasureRange(measures, startIdx, endIdx) {
  if (!measures?.length) return { startBeat: 0, endBeat: 4 };
  const a = Math.max(0, Math.min(measures.length - 1, startIdx));
  const b = Math.max(a, Math.min(measures.length - 1, endIdx));
  const startBeat = Number.isFinite(measures[a].startBeat)
    ? measures[a].startBeat
    : measures[a].startSlot ?? 0;
  const endBeat = Number.isFinite(measures[b].endBeat)
    ? measures[b].endBeat
    : startBeat + 4;
  return { startBeat, endBeat };
}

export function measureIndicesForBeats(measures, startBeat, endBeat) {
  if (!measures?.length) return { startIdx: 0, endIdx: 0 };
  let startIdx = 0;
  let endIdx = measures.length - 1;
  for (let i = 0; i < measures.length; i++) {
    const ms = Number.isFinite(measures[i].startBeat)
      ? measures[i].startBeat
      : measures[i].startSlot ?? 0;
    if (ms <= startBeat + 1e-6) startIdx = i;
    if (ms < endBeat - 1e-6) endIdx = i;
  }
  return { startIdx, endIdx };
}

export function clampMeasureIndex(i, count) {
  const n = Number(i);
  if (!Number.isFinite(n) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(n)));
}

export function snapBeat(beat, grid = 1) {
  const b = Number(beat);
  const g = Number(grid) || 1;
  if (!Number.isFinite(b)) return 0;
  return Math.round(b / g) * g;
}

/**
 * Normalize a beat selection: snap, enforce min span, clamp to song end.
 * Returns null when the span is invalid after normalization.
 */
export function normalizeBeatRange(startBeat, endBeat, { minSpan = 1, songEndBeat } = {}) {
  let start = snapBeat(startBeat);
  let end = snapBeat(endBeat);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = start + minSpan;
  if (end < start) [start, end] = [end, start];
  if (end - start < minSpan) end = start + minSpan;
  if (Number.isFinite(songEndBeat) && end > songEndBeat) {
    end = songEndBeat;
    if (end - start < minSpan) start = Math.max(0, end - minSpan);
  }
  if (end <= start) return null;
  return { startBeat: start, endBeat: end };
}

/**
 * Active navigation scope (measure indices, inclusive).
 */
export function scopeBounds({
  exerciseScope = false,
  loopEnabled = false,
  loopStart = 0,
  loopEnd = 0,
  measureCount = 1,
} = {}) {
  const last = Math.max(0, measureCount - 1);
  if (exerciseScope) {
    return {
      start: clampMeasureIndex(loopStart, measureCount),
      end: clampMeasureIndex(loopEnd, measureCount),
    };
  }
  if (loopEnabled) {
    return {
      start: clampMeasureIndex(loopStart, measureCount),
      end: clampMeasureIndex(Math.max(loopStart, loopEnd), measureCount),
    };
  }
  return { start: 0, end: last };
}

export function canPrevMeasure(navBar, scope) {
  const cur = navBar == null ? scope.start : navBar;
  return cur > scope.start;
}

export function canNextMeasure(navBar, scope) {
  const cur = navBar == null ? scope.start : navBar;
  return cur < scope.end;
}

/** Measure index to jump to on restart. */
export function restartTarget({
  loopEnabled = false,
  loopStart = 0,
  exerciseScope = false,
  measureCount = 1,
} = {}) {
  if (exerciseScope || loopEnabled) {
    return clampMeasureIndex(loopStart, measureCount);
  }
  return 0;
}
