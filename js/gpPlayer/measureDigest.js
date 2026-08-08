// Per-measure content digests for the GP exercise-import studio (DOM-free).

import { pcName } from '../analysis/pitchClass.js';
import { measureSpan } from './rangeUtils.js';

const EPS = 1e-6;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function eventBeat(event) {
  if (Number.isFinite(event?.start)) return event.start;
  if (Number.isFinite(event?.slot)) return event.slot;
  return 0;
}

function isPercussionEvent(event) {
  return event != null && typeof event.instrument === 'string' && event.instrument.length > 0;
}

function isGuitarNote(event) {
  return event != null && Number.isFinite(event.stringIndex) && !isPercussionEvent(event);
}

function normalizeTimeSig(ts) {
  if (!Array.isArray(ts) || ts.length < 2) return null;
  const num = Number(ts[0]);
  const den = Number(ts[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return null;
  return [num, den];
}

function timeSigLabel(ts) {
  const n = normalizeTimeSig(ts);
  return n ? `${n[0]}/${n[1]}` : null;
}

function measureIndexForBeat(measures, beat) {
  if (!measures?.length) return 0;
  const b = Number(beat);
  if (!Number.isFinite(b)) return 0;
  const lastIdx = measures.length - 1;
  const last = measureSpan(measures[lastIdx]);
  if (b >= last.end - EPS) return lastIdx;
  for (let i = 0; i < measures.length; i++) {
    const { start, end } = measureSpan(measures[i]);
    if (b >= start - EPS && b < end - EPS) return i;
  }
  return lastIdx;
}

function pickMeasures(guitarModel, percModel) {
  if (guitarModel?.measures?.length) return guitarModel.measures;
  if (percModel?.measures?.length) return percModel.measures;
  return [];
}

function collectEvents(guitarModel, percModel) {
  const guitar = guitarModel?.events || [];
  const perc = percModel?.events || [];
  return [...guitar, ...perc];
}

function buildSignature(guitarNotes, drumHits, timeSig, startBeat) {
  if (!guitarNotes.length && !drumHits.length) return '';
  const tokens = [];
  for (const e of guitarNotes) {
    const rel = round3(eventBeat(e) - startBeat);
    const si = Number.isFinite(e.stringIndex) ? e.stringIndex : 0;
    const fret = Number.isFinite(e.fret) ? e.fret : 0;
    tokens.push(`${rel}:${si}:${fret}`);
  }
  for (const e of drumHits) {
    const rel = round3(eventBeat(e) - startBeat);
    tokens.push(`${rel}:${e.instrument}`);
  }
  tokens.sort();
  const ts = timeSigLabel(timeSig);
  return ts ? `${ts}|${tokens.join(';')}` : tokens.join(';');
}

/**
 * Build one digest per measure. Measure list comes from `guitarModel` when it has
 * measures, else from `percModel`.
 * @param {{ guitarModel?: object|null, percModel?: object|null }} opts
 * @returns {import('./measureDigest.js').MeasureDigest[]} empty array when neither model has measures
 */
export function buildMeasureDigests({ guitarModel = null, percModel = null } = {}) {
  const measures = pickMeasures(guitarModel, percModel);
  if (!measures.length) return [];

  const allEvents = collectEvents(guitarModel, percModel);
  const eventsByMeasure = measures.map(() => ({ guitar: [], drums: [] }));

  for (const event of allEvents) {
    const beat = eventBeat(event);
    const idx = measureIndexForBeat(measures, beat);
    if (isPercussionEvent(event)) {
      eventsByMeasure[idx].drums.push(event);
    } else if (isGuitarNote(event)) {
      eventsByMeasure[idx].guitar.push(event);
    }
  }

  const digests = [];
  let prevTimeSig = null;

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const { start, end, len } = measureSpan(m);
    const beats = Math.max(0.25, end - start);
    const timeSig = normalizeTimeSig(m.timeSig);
    const timeSigChanged = timeSig
      ? (i === 0 || !prevTimeSig || timeSig[0] !== prevTimeSig[0] || timeSig[1] !== prevTimeSig[1])
      : false;
    if (timeSig) prevTimeSig = timeSig;

    const guitarNotes = eventsByMeasure[i].guitar;
    const drumHits = eventsByMeasure[i].drums;

    const frets = guitarNotes
      .map((e) => e.fret)
      .filter((f) => Number.isFinite(f));
    const fretMin = frets.length ? Math.min(...frets) : null;
    const fretMax = frets.length ? Math.max(...frets) : null;

    const stringsSet = new Set();
    for (const e of guitarNotes) {
      if (Number.isFinite(e.stringIndex)) stringsSet.add(e.stringIndex);
    }
    const stringsUsed = [...stringsSet].sort((a, b) => a - b);

    const noteNames = [];
    const noteNameSeen = new Set();
    for (const e of guitarNotes) {
      let pc = e.pc;
      if (!Number.isFinite(pc) && Number.isFinite(e.midi)) {
        pc = ((e.midi % 12) + 12) % 12;
      }
      if (!Number.isFinite(pc)) continue;
      const name = pcName(pc);
      if (!noteNameSeen.has(name)) {
        noteNameSeen.add(name);
        noteNames.push(name);
        if (noteNames.length >= 6) break;
      }
    }

    const techSet = new Set();
    for (const e of guitarNotes) {
      for (const t of e.techniques || []) {
        if (t) techSet.add(t);
      }
    }
    const techniques = [...techSet].sort();

    const drumInstruments = [];
    const drumInstSeen = new Set();
    for (const e of drumHits) {
      if (e.instrument && !drumInstSeen.has(e.instrument)) {
        drumInstSeen.add(e.instrument);
        drumInstruments.push(e.instrument);
      }
    }

    const noteCount = guitarNotes.length;
    const isEmpty = noteCount === 0 && drumHits.length === 0;
    const density = beats > 0
      ? Math.round(((noteCount + drumHits.length) / beats) * 100) / 100
      : 0;

    const cellCount = Math.max(1, Math.ceil(beats));
    const beatCells = new Array(cellCount).fill(0);
    for (const e of [...guitarNotes, ...drumHits]) {
      const rel = eventBeat(e) - start;
      const cell = Math.max(0, Math.min(cellCount - 1, Math.floor(rel)));
      beatCells[cell] += 1;
    }

    const signature = buildSignature(guitarNotes, drumHits, timeSig, start);

    digests.push({
      index: i,
      barNumber: i + 1,
      startBeat: start,
      endBeat: end,
      beats,
      marker: m.marker ?? null,
      timeSig,
      timeSigChanged,
      noteCount,
      drumHits: drumHits.length,
      fretMin,
      fretMax,
      stringsUsed,
      noteNames,
      techniques,
      drumInstruments,
      isEmpty,
      density,
      beatCells,
      signature,
      repeatOf: null,
    });
  }

  const firstBySignature = new Map();
  for (const d of digests) {
    if (!d.signature) continue;
    if (firstBySignature.has(d.signature)) {
      d.repeatOf = firstBySignature.get(d.signature);
    } else {
      firstBySignature.set(d.signature, d.index);
    }
  }

  return digests;
}

/** "Bar 3" for a single bar, "Bars 3–7" (en dash U+2013) for a range. 0-based indices in, 1-based text out. */
export function formatBarRange(startIdx, endIdx) {
  const a = Number(startIdx) || 0;
  const b = Number.isFinite(endIdx) ? endIdx : a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return `Bar ${lo + 1}`;
  return `Bars ${lo + 1}\u2013${hi + 1}`;
}

/**
 * Compact human summary of one digest, ' · ' separated.
 * @param {object} digest
 * @returns {string}
 */
export function describeMeasure(digest) {
  if (!digest) return '';
  const parts = [`Bar ${digest.barNumber}`];
  if (digest.isEmpty) {
    parts.push('rest');
    return parts.join(' \u00b7 ');
  }
  if (digest.marker) parts.push(digest.marker);
  if (digest.timeSig) parts.push(timeSigLabel(digest.timeSig));
  if (digest.noteCount > 0) {
    parts.push(digest.noteCount === 1 ? '1 note' : `${digest.noteCount} notes`);
  }
  if (digest.fretMin != null && digest.fretMax != null) {
    parts.push(`frets ${digest.fretMin}\u2013${digest.fretMax}`);
  }
  if (digest.techniques?.length) {
    parts.push(digest.techniques.join(', '));
  }
  if (digest.drumHits > 0) {
    parts.push(digest.drumHits === 1 ? '1 drum hit' : `${digest.drumHits} drum hits`);
  }
  return parts.join(' \u00b7 ');
}
