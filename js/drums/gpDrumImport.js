// Convert Guitar Pro percussion models into Musi DrumPattern snippets,
// optionally sliced by song sections (markers / measure ranges).

import { renderTab } from './tabRenderer.js';
import { stepsPerBeat } from './types.js';
import { segmentSections } from '../analysis/segments.js';
import { sliceGuitarModel } from '../tab/tabModel.js';

export { sliceGuitarModel };

function uid(prefix = 'gp') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Infer a grid subdivision from event durations. Prefer 16th when any 0.25
 * quarter-length hits appear; else 8th; else fall back to 16th.
 */
export function inferSubdivision(events) {
  let has16 = false;
  let has8 = false;
  let hasTrip = false;
  for (const e of events || []) {
    const d = Number(e.duration) || 0;
    if (Math.abs(d - 0.25) < 0.02 || Math.abs(d - 0.125) < 0.02) has16 = true;
    if (Math.abs(d - 0.5) < 0.02) has8 = true;
    if (Math.abs(d - (1 / 3)) < 0.03 || Math.abs(d - (0.5 / 3)) < 0.03) hasTrip = true;
  }
  if (hasTrip && !has16) return 'triplet';
  if (has16) return '16th';
  if (has8) return '8th';
  return '16th';
}

function timeSigOf(model, measureIndex) {
  const m = (model.measures || [])[measureIndex];
  if (m?.timeSig) return m.timeSig;
  // Walk backward for last declared signature.
  for (let i = measureIndex; i >= 0; i--) {
    const t = model.measures?.[i]?.timeSig;
    if (t) return t;
  }
  return [4, 4];
}

/**
 * Quantize percussion events in a beat range onto a step grid.
 * @returns {{ steps: object[], stepsPerBar: number, bars: number, subdivision: string, meter: string }}
 */
export function quantizePercussionToSteps(model, {
  startBeat = 0,
  endBeat = null,
  subdivision = null,
} = {}) {
  const events = (model.events || []).filter((e) => {
    const s = Number.isFinite(e.start) ? e.start : 0;
    if (s < startBeat - 1e-6) return false;
    if (endBeat != null && s >= endBeat - 1e-6) return false;
    return !!e.instrument;
  });
  const sub = subdivision || inferSubdivision(events.length ? events : model.events);
  const spb = stepsPerBeat(sub) || 4;
  // Use first measure's time signature for meter / stepsPerBar.
  const [num, den] = timeSigOf(model, 0);
  const quartersPerBar = num * (4 / (den || 4));
  const stepsPerBar = Math.max(1, Math.round(quartersPerBar * spb));
  const span = (endBeat != null ? endBeat : (model.totalBeats || 0)) - startBeat;
  const bars = Math.max(1, Math.round(span / Math.max(0.25, quartersPerBar)));
  const totalSteps = stepsPerBar * bars;

  const steps = [];
  for (const e of events) {
    const rel = (Number.isFinite(e.start) ? e.start : 0) - startBeat;
    const step = Math.round(rel * spb);
    if (step < 0 || step >= totalSteps) continue;
    steps.push({
      instrument: e.instrument,
      step,
      velocity: Number.isFinite(e.velocity) ? e.velocity : 0.78,
    });
  }

  const meter = `${num}/${den || 4}`;
  return { steps, stepsPerBar, bars, subdivision: sub, meter };
}

/**
 * Build a DrumPattern from a percussion model (whole track or beat slice).
 */
export function percussionToPattern(model, {
  title = 'GP Drums',
  startBeat = 0,
  endBeat = null,
  subdivision = null,
  bpm = null,
  tags = [],
  category = 'beat',
  style = 'lesson',
  notes = '',
  id = null,
} = {}) {
  const q = quantizePercussionToSteps(model, { startBeat, endBeat, subdivision });
  const tempo = Number(bpm) || Number(model.tempo) || 120;
  const pattern = {
    id: id || uid('gpdrum'),
    title,
    category,
    style,
    tags: ['guitar-pro', ...tags],
    difficulty: 2,
    bpmRange: [Math.max(40, Math.round(tempo * 0.75)), Math.round(tempo * 1.15)],
    meter: q.meter,
    subdivision: q.subdivision,
    bars: q.bars,
    stepsPerBar: q.stepsPerBar,
    recommendedLoopBars: Math.min(q.bars, 4),
    notes: notes || `Imported from Guitar Pro · ${Math.round(tempo)} BPM`,
    steps: q.steps,
    tab: '',
    builtin: false,
    createdAt: new Date().toISOString(),
    source: 'guitar-pro',
  };
  pattern.tab = renderTab(pattern);
  return pattern;
}

/**
 * Section descriptors from a percussion (or fretted) model.
 * Uses GP markers when present; otherwise one section per N bars or whole file.
 */
export function sectionRangesFromModel(model, { maxBarsPerChunk = 8 } = {}) {
  const measures = model.measures || [];
  if (!measures.length) {
    return [{
      label: 'Full track',
      type: 'section',
      measureStart: 0,
      measureEnd: 0,
      startBeat: 0,
      endBeat: model.totalBeats || 0,
      source: 'full',
    }];
  }

  // Prefer marker-based sections via fretted segmenter shape when markers exist.
  const hasMarkers = measures.some((m) => m.marker);
  if (hasMarkers) {
    // Build a minimal model for segmentSections (slot-based).
    const proxy = {
      measures,
      events: (model.events || []).map((e) => ({
        slot: e.slot,
        stringIndex: 0,
        fret: 0,
        midi: 60,
        techniques: [],
      })),
      slots: model.slots || measures.length,
    };
    const segs = segmentSections(proxy);
    if (segs?.length) {
      return segs.map((s) => {
        const m0 = Math.max(0, (s.measureRange?.[0] || 1) - 1);
        const m1 = Math.min(measures.length, s.measureRange?.[1] || measures.length);
        return {
          label: s.label,
          type: s.type || 'section',
          measureStart: m0,
          measureEnd: m1,
          startBeat: measures[m0]?.startBeat ?? 0,
          endBeat: measures[Math.max(m0, m1 - 1)]?.endBeat ?? model.totalBeats,
          source: s.source || 'marker',
        };
      });
    }
  }

  // Chunk evenly.
  const out = [];
  for (let i = 0; i < measures.length; i += maxBarsPerChunk) {
    const end = Math.min(measures.length, i + maxBarsPerChunk);
    out.push({
      label: measures.length <= maxBarsPerChunk
        ? 'Full track'
        : `Bars ${i + 1}–${end}`,
      type: 'section',
      measureStart: i,
      measureEnd: end,
      startBeat: measures[i].startBeat,
      endBeat: measures[end - 1].endBeat,
      source: 'chunk',
    });
  }
  return out;
}

/**
 * From a parseGuitarPro result, build candidate section snippets for drums
 * and/or guitar suitable for review/save UIs.
 */
export function buildGpSectionSnippets(gpResult, {
  guitarTrackIndex = 0,
  drumTrackIndex = 0,
  includeGuitar = true,
  includeDrums = true,
} = {}) {
  const tempo = gpResult.tempo
    || gpResult.tracks?.[0]?.model?.tempo
    || gpResult.drumTracks?.[0]?.model?.tempo
    || 120;
  const guitarTrack = includeGuitar ? (gpResult.tracks?.[guitarTrackIndex] || null) : null;
  const drumTrack = includeDrums ? (gpResult.drumTracks?.[drumTrackIndex] || null) : null;

  // Prefer sections from whichever model has markers; fall back to the other.
  const sectionSource = (guitarTrack?.model?.measures || []).some((m) => m.marker)
    ? guitarTrack.model
    : (drumTrack?.model || guitarTrack?.model);
  const ranges = sectionSource
    ? sectionRangesFromModel(sectionSource)
    : [{ label: 'Full', type: 'section', measureStart: 0, measureEnd: 0, startBeat: 0, endBeat: 0, source: 'full' }];

  return ranges.map((range, i) => {
    const guitar = guitarTrack?.model
      ? sliceGuitarModel(guitarTrack.model, {
        startBeat: range.startBeat,
        endBeat: range.endBeat,
        label: range.label,
      })
      : null;
    const drums = drumTrack?.model
      ? percussionToPattern(drumTrack.model, {
        title: `${range.label}`,
        startBeat: range.startBeat,
        endBeat: range.endBeat,
        bpm: tempo,
        tags: [range.type, 'snippet'].filter(Boolean),
        notes: `Section “${range.label}” · ${drumTrack.name}`,
      })
      : null;
    if (drums) {
      drums.title = range.label;
    }
    return {
      id: uid('snip'),
      index: i,
      label: range.label,
      type: range.type,
      measureStart: range.measureStart,
      measureEnd: range.measureEnd,
      startBeat: range.startBeat,
      endBeat: range.endBeat,
      source: range.source,
      tempo,
      guitarTrackName: guitarTrack?.name || null,
      drumTrackName: drumTrack?.name || null,
      guitar,
      drums,
      hasGuitar: !!(guitar && guitar.events?.length),
      hasDrums: !!(drums && drums.steps?.length),
    };
  });
}
