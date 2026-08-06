// Convert timed monophonic transcription notes into a TabModel + gpResult
// for the shared Guitar Pro practice player.

import { resolveTuning } from '../tab/tabModel.js';
import { modelToAsciiTab } from '../tab/guitarPro.js';
import { NOTE_NAMES_SHARP } from '../theory.js';
import { nearestDuration, quantizeToScore } from './transcribe.js';

/**
 * Shift whole melody by whole octaves into a guitar-playable MIDI range.
 * @returns {number} semitone shift (multiple of 12)
 */
export function chooseOctaveShift(notes, { minMidi = 40, maxMidi = 76 } = {}) {
  if (!notes?.length) return 0;
  const midis = notes.map((n) => n.midi);
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  let shift = 0;
  while (hi + shift > maxMidi) shift -= 12;
  while (lo + shift < minMidi) shift += 12;
  // Re-check upper bound after shifting up.
  while (hi + shift > maxMidi) shift -= 12;
  return shift;
}

/**
 * Pick a string/fret for a target MIDI, preferring continuity with the prior note.
 * @returns {{ stringIndex:number, fret:number, midi:number }}
 */
export function placeMidiOnStrings(midi, strings, {
  preferStringIndex = null,
  preferFretCenter = 5,
  maxFret = 12,
} = {}) {
  const target = midi;

  function collectCandidates(fretCeiling) {
    const candidates = [];
    for (let si = 0; si < strings.length; si++) {
      const open = strings[si]?.openMidi;
      if (open == null) continue;
      const fret = target - open;
      if (fret < 0 || fret > fretCeiling) continue;
      const stringDist = preferStringIndex == null ? 0 : Math.abs(si - preferStringIndex);
      const fretDist = Math.abs(fret - preferFretCenter);
      const jump = preferStringIndex == null ? fretDist : stringDist * 3 + fretDist;
      candidates.push({ stringIndex: si, fret, midi: open + fret, jump });
    }
    return candidates;
  }

  let candidates = collectCandidates(maxFret);
  let fretCeiling = maxFret;
  if (!candidates.length && maxFret < 24) {
    candidates = collectCandidates(24);
    fretCeiling = 24;
  }

  if (!candidates.length) {
    // Last resort: clamp on middle string.
    const si = preferStringIndex != null
      ? preferStringIndex
      : Math.floor(strings.length / 2);
    const open = strings[si]?.openMidi ?? 40;
    const fret = Math.max(0, Math.min(fretCeiling, target - open));
    return { stringIndex: si, fret, midi: open + fret };
  }

  candidates.sort((a, b) => a.jump - b.jump || a.fret - b.fret);
  return candidates[0];
}

function buildMeasures(totalBeats, beatsPerBar) {
  const measures = [];
  const barLen = beatsPerBar;
  let beat = 0;
  let slot = 0;
  while (beat < totalBeats - 1e-6) {
    const endBeat = Math.min(beat + barLen, totalBeats);
    measures.push({
      startSlot: slot,
      endSlot: slot + 1,
      startBeat: beat,
      endBeat,
      marker: null,
      timeSig: [beatsPerBar, 4],
    });
    beat = endBeat;
    slot += 1;
  }
  if (!measures.length) {
    measures.push({
      startSlot: 0,
      endSlot: 1,
      startBeat: 0,
      endBeat: Math.max(barLen, totalBeats),
      marker: null,
      timeSig: [beatsPerBar, 4],
    });
  }
  return measures;
}

/**
 * Build a rhythm-aware TabModel from timed transcription notes.
 */
export function notesToTabModel(notes, {
  bpm = 120,
  beatsPerBar = 4,
  offsetSec = 0,
  tuning = 'Standard',
  maxFret = 12,
  octaveShift = null,
} = {}) {
  const warnings = [];
  const { name: tuningName, strings } = resolveTuning(tuning);
  const beatSec = 60 / Math.max(40, Math.min(240, bpm));

  const shift = octaveShift != null ? octaveShift : chooseOctaveShift(notes);
  const shifted = (notes || []).map((n) => ({
    ...n,
    midi: n.midi + shift,
    oct: Math.floor((n.midi + shift) / 12) - 1,
    name: NOTE_NAMES_SHARP[(((n.midi + shift) % 12) + 12) % 12],
    label: `${NOTE_NAMES_SHARP[(((n.midi + shift) % 12) + 12) % 12]}${Math.floor((n.midi + shift) / 12) - 1}`,
  }));

  const timed = shifted.map((n) => {
    const rawStart = (n.startSec - offsetSec) / beatSec;
    const rawDur = Math.max(0.25, n.durationSec / beatSec);
    return { n, start: Math.round(rawStart * 4) / 4, rawDur };
  });
  timed.sort((a, b) => a.start - b.start || a.n.startSec - b.n.startSec);

  for (let i = 1; i < timed.length; i++) {
    if (timed[i].start <= timed[i - 1].start) {
      timed[i].start = timed[i - 1].start + 0.25;
    }
  }

  for (let i = 0; i < timed.length; i++) {
    let duration = nearestDuration(timed[i].rawDur).beats;
    if (i + 1 < timed.length) {
      const gap = timed[i + 1].start - timed[i].start;
      duration = Math.min(duration, Math.max(0.25, gap));
    }
    timed[i].duration = Math.max(0.25, duration);
  }

  const minStart = timed.length ? Math.min(...timed.map((t) => t.start)) : 0;
  if (minStart < 0) {
    for (const t of timed) t.start -= minStart;
  }

  const events = [];
  let preferString = null;
  let slot = 0;
  let totalBeats = 0;

  for (const { n, start, duration } of timed) {
    const placed = placeMidiOnStrings(n.midi, strings, {
      preferStringIndex: preferString,
      preferFretCenter: 5,
      maxFret,
    });
    preferString = placed.stringIndex;

    events.push({
      slot,
      stringIndex: placed.stringIndex,
      fret: placed.fret,
      midi: placed.midi,
      pc: ((placed.midi % 12) + 12) % 12,
      techniques: [],
      dead: false,
      start,
      duration,
    });
    slot += 1;
    totalBeats = Math.max(totalBeats, start + duration);
  }

  // Pad to full bar.
  const paddedTotal = Math.ceil(totalBeats / beatsPerBar) * beatsPerBar || beatsPerBar;
  const measures = buildMeasures(paddedTotal, beatsPerBar);

  if (!events.length) {
    warnings.push('No notes to place on the tab.');
  }

  return {
    tuning: tuningName,
    strings,
    events,
    slots: events.length,
    measures,
    tempo: bpm,
    totalBeats: paddedTotal,
    techniqueCounts: {},
    warnings,
  };
}

/**
 * Shape a TabModel into the gpResult structure expected by mountGpPlayer.
 */
export function tabModelToGpResult(model, { name = 'Vocal riff', format = 'transcription' } = {}) {
  const tuningPitches = (model.strings || []).map((s) => s.openMidi);
  const noteCount = (model.events || []).filter((e) => e.fret != null && !e.dead).length;
  const ascii = modelToAsciiTab(model);
  const track = {
    index: 0,
    sourceIndex: 0,
    name,
    tuning: model.tuning,
    tuningPitches,
    model,
    ascii,
    noteCount,
  };
  return {
    format,
    tempo: model.tempo,
    tracks: [track],
    drumTracks: [],
    parts: [{
      name,
      sourceIndex: 0,
      analyzable: true,
      analyzableIndex: 0,
      isPercussion: false,
      drumIndex: -1,
      tuning: model.tuning,
      noteCount,
      reason: null,
    }],
    defaultIndex: 0,
    model,
    ascii,
    meta: {
      format,
      tracks: 1,
      frettedTracks: 1,
      drumTracks: 0,
      trackName: name,
      tuningPitches,
    },
  };
}

/** Convenience: transcription payload → gpResult. */
export function transcriptionToGpResult(transcription, opts = {}) {
  const {
    bpm = transcription.bpm ?? 120,
    beatsPerBar = transcription.beatsPerBar ?? 4,
    offsetSec = transcription.offsetSec ?? 0,
    ...rest
  } = opts;
  const model = notesToTabModel(transcription.notes, {
    bpm,
    beatsPerBar,
    offsetSec,
    ...rest,
  });
  return tabModelToGpResult(model, {
    name: opts.name ?? 'Vocal riff',
    format: opts.format ?? 'transcription',
  });
}

/** Re-quantize score + rebuild TabModel at a fixed tempo. */
export function requantizeTranscription(notes, { bpm, beatsPerBar, offsetSec = 0 }) {
  const score = quantizeToScore(notes, bpm, { beatsPerBar, offsetSec });
  const model = notesToTabModel(notes, { bpm, beatsPerBar, offsetSec });
  return { score, model };
}
