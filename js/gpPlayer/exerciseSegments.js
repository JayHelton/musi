// Named measure-range segments for GP exercise bulk-import (DOM-free).

import { quartersToSeconds } from '../tab/tabModel.js';
import { beatsFromMeasureRange, clampMeasureIndex } from './rangeUtils.js';
import { formatBarRange } from './measureDigest.js';

/** @type {number} */
let nextSegmentId = 1;

function allocSegmentId(list) {
  for (const seg of list || []) {
    const m = /^seg-(\d+)$/.exec(seg?.id || '');
    if (m) nextSegmentId = Math.max(nextSegmentId, Number(m[1]) + 1);
  }
  const id = `seg-${nextSegmentId}`;
  nextSegmentId += 1;
  return id;
}

function markerBefore(digests, startIdx) {
  if (!digests?.length) return null;
  const idx = clampMeasureIndex(startIdx, digests.length);
  for (let i = idx; i >= 0; i--) {
    const marker = digests[i]?.marker;
    if (marker) return marker;
  }
  return null;
}

function barRangeLower(startIdx, endIdx) {
  const a = Number(startIdx) || 0;
  const b = Number.isFinite(endIdx) ? endIdx : a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return `bar ${lo + 1}`;
  return `bars ${lo + 1}\u2013${hi + 1}`;
}

/**
 * Name suggestion for a range: section marker plus bar range.
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {object[]} digests
 * @returns {string}
 */
export function defaultSegmentName(startIdx, endIdx, digests) {
  const range = barRangeLower(startIdx, endIdx);
  const marker = markerBefore(digests, startIdx);
  if (marker) return `${marker} \u00b7 ${range}`;
  const cap = formatBarRange(startIdx, endIdx);
  return cap;
}

function deriveName(seg, digests) {
  return defaultSegmentName(seg.startIdx, seg.endIdx, digests);
}

function withFreshAutoName(seg, digests) {
  if (!seg.autoName) return seg;
  return { ...seg, name: deriveName(seg, digests) };
}

function normalizeRange(startIdx, endIdx, measureCount) {
  if (!measureCount) return { startIdx: 0, endIdx: 0 };
  const a = clampMeasureIndex(startIdx, measureCount);
  const b = clampMeasureIndex(endIdx, measureCount);
  return { startIdx: Math.min(a, b), endIdx: Math.max(a, b) };
}

/**
 * Trim or remove segments that overlap [startIdx, endIdx], optionally keeping one id.
 * @param {object[]} list
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {object[]} digests
 * @param {string|null} keepId
 * @returns {object[]}
 */
function trimOverlaps(list, startIdx, endIdx, digests, keepId = null) {
  const out = [];
  for (const seg of list || []) {
    if (keepId && seg.id === keepId) {
      out.push(seg);
      continue;
    }
    const s = seg.startIdx;
    const e = seg.endIdx;
    if (e < startIdx || s > endIdx) {
      out.push(seg);
      continue;
    }
    if (s >= startIdx && e <= endIdx) {
      continue;
    }
    if (s < startIdx && e > endIdx) {
      const left = withFreshAutoName({ ...seg, startIdx: s, endIdx: startIdx - 1 }, digests);
      const right = withFreshAutoName({
        ...seg,
        id: allocSegmentId(list),
        startIdx: endIdx + 1,
        endIdx: e,
      }, digests);
      if (left.startIdx <= left.endIdx) out.push(left);
      if (right.startIdx <= right.endIdx) out.push(right);
      continue;
    }
    if (s < startIdx) {
      out.push(withFreshAutoName({ ...seg, startIdx: s, endIdx: startIdx - 1 }, digests));
    } else if (e > endIdx) {
      out.push(withFreshAutoName({ ...seg, startIdx: endIdx + 1, endIdx: e }, digests));
    }
  }
  return out;
}

/** Sorted copy: ascending startIdx, then endIdx. */
export function sortSegments(list) {
  return [...(list || [])].sort((a, b) => (
    a.startIdx - b.startIdx || a.endIdx - b.endIdx || String(a.id).localeCompare(String(b.id))
  ));
}

/**
 * New sorted array with the segment added; overlapped existing segments are trimmed/removed.
 * @param {object[]} list
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {object[]} digests
 * @param {{ name?: string }} [opts]
 * @returns {object[]}
 */
export function addSegment(list, startIdx, endIdx, digests, { name = '' } = {}) {
  const measureCount = digests?.length || 0;
  if (!measureCount) return sortSegments(list || []);

  const range = normalizeRange(startIdx, endIdx, measureCount);
  const trimmed = trimOverlaps(list || [], range.startIdx, range.endIdx, digests);
  const customName = String(name || '').trim();
  const autoName = !customName;
  const seg = {
    id: allocSegmentId(trimmed),
    startIdx: range.startIdx,
    endIdx: range.endIdx,
    name: customName || defaultSegmentName(range.startIdx, range.endIdx, digests),
    autoName,
  };
  return sortSegments([...trimmed, seg]);
}

/** New array without `id`. */
export function removeSegment(list, id) {
  return (list || []).filter((s) => s.id !== id);
}

/**
 * New sorted array with `id`'s range changed; trims/removes others it now overlaps.
 * @param {object[]} list
 * @param {string} id
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {object[]} digests
 * @returns {object[]}
 */
export function updateSegmentRange(list, id, startIdx, endIdx, digests) {
  const measureCount = digests?.length || 0;
  const existing = (list || []).find((s) => s.id === id);
  if (!existing || !measureCount) return sortSegments(list || []);

  const range = normalizeRange(startIdx, endIdx, measureCount);
  const others = trimOverlaps(
    (list || []).filter((s) => s.id !== id),
    range.startIdx,
    range.endIdx,
    digests,
  );
  let updated = {
    ...existing,
    startIdx: range.startIdx,
    endIdx: range.endIdx,
  };
  if (updated.autoName) {
    updated = { ...updated, name: deriveName(updated, digests) };
  }
  return sortSegments([...others, updated]);
}

/**
 * New array with `id` renamed. Blank name re-derives auto name.
 * @param {object[]} list
 * @param {string} id
 * @param {string} name
 * @returns {object[]}
 */
/**
 * New array with `id` renamed. Empty/blank name resets to bar-range auto label.
 * @param {object[]} list
 * @param {string} id
 * @param {string} name
 * @returns {object[]}
 */
export function renameSegment(list, id, name) {
  const trimmed = String(name || '').trim();
  return (list || []).map((seg) => {
    if (seg.id !== id) return seg;
    if (!trimmed) {
      return {
        ...seg,
        autoName: true,
        name: formatBarRange(seg.startIdx, seg.endIdx),
      };
    }
    return { ...seg, autoName: false, name: trimmed };
  });
}

/**
 * Per-measure ownership lookup.
 * @param {object[]} list
 * @param {number} measureCount
 * @returns {Array<null|{ id: string, order: number, name: string }>}
 */
export function assignmentMap(list, measureCount) {
  const sorted = sortSegments(list);
  const map = new Array(Math.max(0, measureCount)).fill(null);
  sorted.forEach((seg, i) => {
    const order = i + 1;
    const entry = { id: seg.id, order, name: seg.name };
    for (let m = seg.startIdx; m <= seg.endIdx && m < measureCount; m++) {
      map[m] = entry;
    }
  });
  return map;
}

/**
 * @param {object[]} list
 * @param {number} measureCount
 * @returns {{ count:number, covered:number, uncovered:number, bars:number, gaps:Array<[number,number]> }}
 */
export function coverageStats(list, measureCount) {
  const bars = Math.max(0, Number(measureCount) || 0);
  const map = assignmentMap(list, bars);
  let covered = 0;
  for (let i = 0; i < bars; i++) {
    if (map[i]) covered += 1;
  }
  const gaps = [];
  let gapStart = null;
  for (let i = 0; i < bars; i++) {
    if (!map[i]) {
      if (gapStart == null) gapStart = i;
    } else if (gapStart != null) {
      gaps.push([gapStart, i - 1]);
      gapStart = null;
    }
  }
  if (gapStart != null) gaps.push([gapStart, bars - 1]);
  return {
    count: (list || []).length,
    covered,
    uncovered: bars - covered,
    bars,
    gaps,
  };
}

/** Segments from GP section markers; [] when no markers. */
export function autoSplitByMarkers(digests) {
  if (!digests?.length) return [];
  const markerIndices = digests
    .map((d, i) => (d.marker ? i : -1))
    .filter((i) => i >= 0);
  if (!markerIndices.length) return [];

  const segments = [];
  const measureCount = digests.length;

  if (markerIndices[0] > 0) {
    segments.push({
      id: allocSegmentId(segments),
      startIdx: 0,
      endIdx: markerIndices[0] - 1,
      name: defaultSegmentName(0, markerIndices[0] - 1, digests),
      autoName: true,
    });
  }

  for (let m = 0; m < markerIndices.length; m++) {
    const startIdx = markerIndices[m];
    const endIdx = m + 1 < markerIndices.length
      ? markerIndices[m + 1] - 1
      : measureCount - 1;
    segments.push({
      id: allocSegmentId(segments),
      startIdx,
      endIdx,
      name: defaultSegmentName(startIdx, endIdx, digests),
      autoName: true,
    });
  }

  return sortSegments(segments);
}

/** Segments of n bars each; final segment may be shorter. */
export function autoSplitEveryN(digests, n) {
  const size = Math.max(1, Math.floor(Number(n) || 1));
  if (!digests?.length) return [];
  const segments = [];
  for (let start = 0; start < digests.length; start += size) {
    const end = Math.min(digests.length - 1, start + size - 1);
    segments.push({
      id: allocSegmentId(segments),
      startIdx: start,
      endIdx: end,
      name: defaultSegmentName(start, end, digests),
      autoName: true,
    });
  }
  return segments;
}

/**
 * Segments from saved section notes.
 * @param {Array<{ title?: string, text?: string, measureStart?: number, measureEnd?: number }>} annotations
 * @param {object[]} digests
 * @returns {object[]}
 */
export function autoSplitFromAnnotations(annotations, digests) {
  const measureCount = digests?.length || 0;
  if (!measureCount || !annotations?.length) return [];

  let list = [];
  for (const note of annotations) {
    const ms = note?.measureStart;
    const me = note?.measureEnd;
    if (!Number.isFinite(ms) || !Number.isFinite(me)) continue;
    const range = normalizeRange(ms, me, measureCount);
    const title = String(note?.title || '').trim();
    list = trimOverlaps(list, range.startIdx, range.endIdx, digests);
    list.push({
      id: allocSegmentId(list),
      startIdx: range.startIdx,
      endIdx: range.endIdx,
      name: title || defaultSegmentName(range.startIdx, range.endIdx, digests),
      autoName: !title,
    });
  }
  return sortSegments(list);
}

/**
 * Beat span for a segment from digests.
 * @param {object} segment
 * @param {object[]} digests
 * @returns {{ startBeat: number, endBeat: number, beats: number }}
 */
export function segmentBeats(segment, digests) {
  if (!segment || !digests?.length) {
    return { startBeat: 0, endBeat: 0, beats: 0 };
  }
  const measures = digests.map((d) => ({
    startBeat: d.startBeat,
    endBeat: d.endBeat,
    startSlot: d.startBeat,
    endSlot: d.endBeat,
  }));
  const { startBeat, endBeat } = beatsFromMeasureRange(
    measures,
    segment.startIdx,
    segment.endIdx,
  );
  const beats = Math.max(0, endBeat - startBeat);
  return { startBeat, endBeat, beats };
}

/**
 * Playback length in seconds at quarter-note BPM.
 * @param {object} segment
 * @param {object[]} digests
 * @param {number} bpm
 * @returns {number}
 */
export function estimateSeconds(segment, digests, bpm) {
  const { beats } = segmentBeats(segment, digests);
  if (!beats || !Number.isFinite(bpm) || bpm <= 0) return 0;
  return quartersToSeconds(beats, bpm);
}
