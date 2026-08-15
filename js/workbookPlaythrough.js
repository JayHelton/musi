// Pure helpers for workbook GP playthrough: consecutive runs, joined scores, and boundaries.

import { concatGpResults } from './gpExerciseScore.js';

/**
 * @param {Array<{ id: string, isGp: boolean }>} entries
 * @param {number} activeIndex
 * @returns {{ startIndex: number, endIndex: number } | null}
 */
export function findConsecutiveGpRun(entries, activeIndex) {
  if (!entries || !entries.length) return null;
  if (!Number.isFinite(activeIndex) || activeIndex < 0 || activeIndex >= entries.length) {
    return null;
  }
  if (!entries[activeIndex]?.isGp) return null;

  let startIndex = activeIndex;
  let endIndex = activeIndex;

  while (startIndex > 0 && entries[startIndex - 1]?.isGp) {
    startIndex -= 1;
  }
  while (endIndex < entries.length - 1 && entries[endIndex + 1]?.isGp) {
    endIndex += 1;
  }

  return { startIndex, endIndex };
}

function referenceModel(gp) {
  for (const t of gp.tracks || []) {
    if (t?.model) return t.model;
  }
  for (const t of gp.drumTracks || []) {
    if (t?.model) return t.model;
  }
  return null;
}

function partMeasureCount(gp) {
  const model = referenceModel(gp);
  if (!model) return 0;
  return (model.measures || []).length;
}

function partTotalBeats(gp) {
  const model = referenceModel(gp);
  if (!model) return 0;
  if (Number.isFinite(model.totalBeats)) return Number(model.totalBeats);
  const measures = model.measures || [];
  if (measures.length) {
    return Number(measures[measures.length - 1].endBeat) || 0;
  }
  return 0;
}

function gpWithTempo(gp, tempo) {
  if (!(Number(tempo) > 0)) return gp;
  const t = Number(tempo);
  return {
    ...gp,
    tempo: t,
    tracks: (gp.tracks || []).map((tr) => (
      tr?.model ? { ...tr, model: { ...tr.model, tempo: t } } : tr
    )),
    drumTracks: (gp.drumTracks || []).map((tr) => (
      tr?.model ? { ...tr, model: { ...tr.model, tempo: t } } : tr
    )),
  };
}

function stampPartNames(gp, segments) {
  const trackList = [...(gp.tracks || []), ...(gp.drumTracks || [])];
  for (const seg of segments) {
    const name = seg.name;
    if (!name || String(name).trim() === '') continue;
    const idx = seg.startMeasure;
    for (const tr of trackList) {
      const measures = tr?.model?.measures;
      if (!measures || idx < 0 || idx >= measures.length) continue;
      const measure = measures[idx];
      if (measure.marker == null || measure.marker === '') {
        measure.marker = name;
      }
    }
  }
}

/**
 * @param {Array<{ entryId: string, gp: object, name?: string, tempo?: number }>} parts
 * @returns {{ gp: object, boundaries: Array<{ entryId, startBeat, endBeat, startMeasure, endMeasure }> } | null}
 */
export function buildPlaythroughScore(parts) {
  if (!parts || !parts.length) return null;

  const withGp = parts.filter((p) => p && p.gp);
  if (!withGp.length) return null;

  const segments = [];
  let runningBeat = 0;
  let runningMeasure = 0;

  for (const part of withGp) {
    const measureCount = partMeasureCount(part.gp);
    const partBeats = partTotalBeats(part.gp);

    if (measureCount === 0 && partBeats === 0) continue;

    const startBeat = runningBeat;
    const endBeat = startBeat + partBeats;
    const startMeasure = runningMeasure;
    const endMeasure = measureCount > 0 ? startMeasure + measureCount - 1 : startMeasure;

    segments.push({
      entryId: part.entryId,
      gp: gpWithTempo(part.gp, part.tempo),
      name: part.name,
      startBeat,
      endBeat,
      startMeasure,
      endMeasure,
    });

    runningBeat = endBeat;
    runningMeasure += measureCount;
  }

  if (!segments.length) return null;

  const gp = concatGpResults(segments.map((s) => s.gp));
  if (!gp) return null;

  stampPartNames(gp, segments);

  const boundaries = segments.map(({
    entryId, startBeat, endBeat, startMeasure, endMeasure,
  }) => ({
    entryId,
    startBeat,
    endBeat,
    startMeasure,
    endMeasure,
  }));

  return { gp, boundaries };
}

export function entryIdAtBeat(boundaries, beat) {
  if (!boundaries || !boundaries.length) return null;
  if (!Number.isFinite(beat)) return null;

  const first = boundaries[0];
  const last = boundaries[boundaries.length - 1];

  if (beat < first.startBeat) return first.entryId;
  if (beat === last.endBeat || beat > last.endBeat) return last.entryId;

  for (const b of boundaries) {
    if (beat >= b.startBeat && beat < b.endBeat) return b.entryId;
  }

  return last.entryId;
}

export function entryIdAtMeasure(boundaries, measureIndex) {
  if (!boundaries || !boundaries.length) return null;
  if (!Number.isFinite(measureIndex)) return null;

  const searchable = boundaries.filter((b) => b.endMeasure >= b.startMeasure);
  const list = searchable.length ? searchable : boundaries;

  const first = list[0];
  const last = list[list.length - 1];

  if (measureIndex < first.startMeasure) return first.entryId;
  if (measureIndex > last.endMeasure) return last.entryId;

  for (const b of list) {
    if (measureIndex >= b.startMeasure && measureIndex <= b.endMeasure) {
      return b.entryId;
    }
  }

  return last.entryId;
}

export function boundaryForEntry(boundaries, entryId) {
  if (!boundaries || !entryId) return null;
  return boundaries.find((b) => b.entryId === entryId) || null;
}
