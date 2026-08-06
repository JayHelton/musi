// Offline monophonic transcription for isolated tracks.
// Assumes a single pitched layer (vocal, lead guitar, bass, etc.) — no source
// separation. Frames are pitch-tracked with the shared McLeod detector, then
// segmented into notes with start/duration.

import { detectPitch } from '../pitch.js';
import { NOTE_NAMES_SHARP } from '../theory.js';
import { ensureAudio, audioCtx } from '../audio.js';

const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Decode an uploaded audio File/Blob into an AudioBuffer. */
export async function decodeAudioFile(file) {
  ensureAudio();
  const ab = await file.arrayBuffer();
  // decodeAudioData detaches/consumes the buffer in some browsers — copy first.
  const copy = ab.slice(0);
  return await audioCtx.decodeAudioData(copy);
}

/** Mix an AudioBuffer down to a mono Float32Array. */
export function bufferToMono(audioBuffer) {
  const n = audioBuffer.length;
  const ch = audioBuffer.numberOfChannels;
  if (ch === 1) return audioBuffer.getChannelData(0).slice(0);
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / ch;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

function freqToMidi(freq) {
  return 12 * Math.log2(freq / 440) + 69;
}

/**
 * Walk a mono buffer with hop windows and return raw pitch frames.
 * `onProgress(0..1)` is optional and called periodically so the UI can update.
 */
export async function extractPitchFrames(mono, sampleRate, opts = {}) {
  const windowSize = opts.windowSize ?? 2048;
  const hopSize = opts.hopSize ?? 1024;
  const minClarity = opts.minClarity ?? 0.55;
  const minRms = opts.minRms ?? 0.008;
  const minFreq = opts.minFreq ?? 55;
  const maxFreq = opts.maxFreq ?? 2000;
  const onProgress = opts.onProgress || null;

  const frames = [];
  const total = Math.max(1, Math.floor((mono.length - windowSize) / hopSize) + 1);
  let yieldCounter = 0;

  for (let i = 0, fi = 0; i + windowSize <= mono.length; i += hopSize, fi++) {
    const slice = mono.subarray(i, i + windowSize);
    const { freq, clarity, rms } = detectPitch(slice, sampleRate, {
      minClarity,
      minRms,
      minFreq,
      maxFreq,
    });
    frames.push({
      t: i / sampleRate,
      freq: freq > 0 ? freq : -1,
      midi: freq > 0 ? freqToMidi(freq) : -1,
      clarity,
      rms,
    });

    // Yield to the event loop so the UI stays responsive on long files.
    if (++yieldCounter >= 40) {
      yieldCounter = 0;
      if (onProgress) onProgress(fi / total);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(1);
  return frames;
}

/**
 * Segment pitch frames into notes. Consecutive frames that round to the same
 * MIDI note are merged; short blips and low-clarity islands are dropped.
 */
export function segmentNotes(frames, opts = {}) {
  const minNoteSec = opts.minNoteSec ?? 0.08;
  const silenceGapSec = opts.silenceGapSec ?? 0.09;
  const hopSec = opts.hopSec ?? 0.021;

  const notes = [];
  let cur = null; // { midi, start, end, clarities }

  function flush() {
    if (!cur) return;
    const dur = cur.end - cur.start;
    if (dur >= minNoteSec) {
      const clarity = cur.clarities.reduce((a, b) => a + b, 0) / cur.clarities.length;
      const name = NOTE_NAMES_SHARP[((cur.midi % 12) + 12) % 12];
      const oct = Math.floor(cur.midi / 12) - 1;
      notes.push({
        midi: cur.midi,
        name,
        oct,
        label: `${name}${oct}`,
        startSec: cur.start,
        durationSec: dur,
        clarity,
      });
    }
    cur = null;
  }

  for (const f of frames) {
    const voiced = f.freq > 0 && f.midi > 0;
    const midi = voiced ? Math.round(f.midi) : -1;

    if (!voiced) {
      if (cur && (f.t - cur.end) > silenceGapSec) flush();
      continue;
    }

    if (!cur) {
      cur = { midi, start: f.t, end: f.t + hopSec, clarities: [f.clarity] };
      continue;
    }

    if (midi === cur.midi) {
      cur.end = f.t + hopSec;
      cur.clarities.push(f.clarity);
    } else {
      // Allow a one-frame glitch without splitting.
      const gap = f.t - cur.end;
      if (gap <= hopSec * 1.5) {
        flush();
        cur = { midi, start: f.t, end: f.t + hopSec, clarities: [f.clarity] };
      } else {
        flush();
        cur = { midi, start: f.t, end: f.t + hopSec, clarities: [f.clarity] };
      }
    }
  }
  flush();
  return notes;
}

const MIN_BPM = 70;
const MAX_BPM = 180;

function collectOnsets(notes) {
  return notes.map((n) => n.startSec).sort((a, b) => a - b);
}

function collectIoIs(onsets, minSec = 0.05, maxSec = 4) {
  const iois = [];
  for (let i = 1; i < onsets.length; i++) {
    const d = onsets[i] - onsets[i - 1];
    if (d >= minSec && d <= maxSec) iois.push(d);
  }
  return iois;
}

/** Fold a beat period (seconds) into the 70–180 BPM window via doubling/halving. */
function normalizeBeatPeriod(periodSec) {
  if (!periodSec || periodSec <= 0) return 60 / 120;
  let p = periodSec;
  let bpm = 60 / p;
  while (bpm < MIN_BPM) { p /= 2; bpm = 60 / p; }
  while (bpm > MAX_BPM) { p *= 2; bpm = 60 / p; }
  return p;
}

function ioiHistogramPeaks(iois, binWidth = 0.025) {
  if (!iois.length) return [];
  const bins = new Map();
  for (const ioi of iois) {
    const key = Math.round(ioi / binWidth);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const peaks = [...bins.entries()]
    .map(([k, count]) => ({ ioi: k * binWidth, count }))
    .sort((a, b) => b.count - a.count);
  return peaks;
}

/** Score how well IOIs align to integer multiples of a beat period. */
function scoreIoIsAgainstPeriod(iois, beatPeriod) {
  if (!beatPeriod || beatPeriod <= 0) return 0;
  let score = 0;
  for (const ioi of iois) {
    const ratio = ioi / beatPeriod;
    const nearest = Math.round(ratio);
    if (nearest >= 1 && nearest <= 12) {
      const err = Math.abs(ratio - nearest);
      score += Math.max(0, 1 - err * 2);
    }
  }
  return score;
}

/** Autocorrelate onsets against a beat period; returns best phase alignment score. */
function onsetAutocorrScore(onsets, beatPeriod) {
  if (!onsets.length || !beatPeriod || beatPeriod <= 0) return { score: 0, phase: 0 };
  const steps = Math.max(8, Math.min(48, Math.round(beatPeriod / 0.01)));
  let bestScore = 0;
  let bestPhase = 0;
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * beatPeriod;
    let score = 0;
    const tol = Math.min(0.06, beatPeriod * 0.12);
    for (const t of onsets) {
      const pos = (t - phase) / beatPeriod;
      const nearest = Math.round(pos);
      const err = Math.abs(pos - nearest) * beatPeriod;
      if (err <= tol) score += 1 - err / tol;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return { score: bestScore, phase: bestPhase };
}

function guessBeatsPerBar(onsets, beatPeriod, phase) {
  if (!onsets.length || beatPeriod <= 0) return 4;
  const bar3 = beatPeriod * 3;
  const bar4 = beatPeriod * 4;
  let score3 = 0;
  let score4 = 0;
  const tol = beatPeriod * 0.15;
  for (const t of onsets) {
    const p3 = (t - phase) / bar3;
    const p4 = (t - phase) / bar4;
    const e3 = Math.abs(p3 - Math.round(p3)) * bar3;
    const e4 = Math.abs(p4 - Math.round(p4)) * bar4;
    if (e3 <= tol) score3 += 1 - e3 / tol;
    if (e4 <= tol) score4 += 1 - e4 / tol;
  }
  // Favor 4/4 unless 3/4 bar energy is clearly stronger.
  if (score3 > score4 * 1.35 && score3 >= 2) return 3;
  return 4;
}

/**
 * Estimate tempo, meter, and beat-grid phase from note onsets.
 * @returns {{ bpm:number, beatsPerBar:number, offsetSec:number, offsetBeats:number, confidence:number }}
 */
export function estimateTempo(notes, opts = {}) {
  const fallback = {
    bpm: 120,
    beatsPerBar: opts.beatsPerBar ?? 4,
    offsetSec: 0,
    offsetBeats: 0,
    confidence: 0,
  };
  if (!notes || notes.length < 2) return fallback;

  const onsets = collectOnsets(notes);
  const iois = collectIoIs(onsets);
  if (iois.length < 1) return fallback;

  const peaks = ioiHistogramPeaks(iois);
  const candidates = new Set();
  for (const { ioi } of peaks.slice(0, 8)) {
    for (const mult of [0.25, 0.5, 1, 2, 4]) {
      const period = normalizeBeatPeriod(ioi * mult);
      candidates.add(period);
    }
  }
  // Median IOI as a fallback candidate.
  const sorted = iois.slice().sort((a, b) => a - b);
  candidates.add(normalizeBeatPeriod(sorted[Math.floor(sorted.length / 2)]));

  let bestPeriod = 60 / 120;
  let bestScore = -1;
  let bestPhase = 0;
  let bestAutocorr = 0;

  for (const period of candidates) {
    const ioiScore = scoreIoIsAgainstPeriod(iois, period);
    const { score: acScore, phase } = onsetAutocorrScore(onsets, period);
    const combined = ioiScore * 0.45 + acScore * 0.55;
    if (combined > bestScore) {
      bestScore = combined;
      bestPeriod = period;
      bestPhase = phase;
      bestAutocorr = acScore;
    }
  }

  const bpm = Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, 60 / bestPeriod)));
  const beatSec = 60 / bpm;
  const beatsPerBar = opts.beatsPerBar ?? guessBeatsPerBar(onsets, beatSec, bestPhase);
  const offsetSec = bestPhase;
  const offsetBeats = offsetSec / beatSec;

  const maxScore = onsets.length * 1.2;
  const confidence = Math.max(0, Math.min(1, bestAutocorr / Math.max(1, maxScore)));

  return { bpm, beatsPerBar, offsetSec, offsetBeats, confidence };
}

/** Estimate a rough tempo from inter-onset intervals (IOIs). Falls back to 120. */
export function estimateBpm(notes) {
  return estimateTempo(notes).bpm;
}

const DURATION_VALUES = [
  { beats: 4, id: 'w' },
  { beats: 3, id: 'h.' }, // dotted half
  { beats: 2, id: 'h' },
  { beats: 1.5, id: 'q.' },
  { beats: 1, id: 'q' },
  { beats: 0.75, id: 'e.' },
  { beats: 0.5, id: 'e' },
  { beats: 0.25, id: 's' },
];

export function nearestDuration(beats) {
  let best = DURATION_VALUES[DURATION_VALUES.length - 1];
  let bestErr = Infinity;
  for (const d of DURATION_VALUES) {
    const err = Math.abs(d.beats - beats);
    if (err < bestErr) {
      bestErr = err;
      best = d;
    }
  }
  // Very short → sixteenth; clamp long notes to a whole.
  if (beats < 0.125) return { beats: 0.25, id: 's' };
  if (beats > 4.5) return { beats: 4, id: 'w' };
  return best;
}

function roomInBar(cursorBeat, beatsPerBar) {
  const pos = cursorBeat % beatsPerBar;
  // Floating residue at bar boundary → full bar of room.
  if (pos < 1e-6 || beatsPerBar - pos < 1e-6) return beatsPerBar;
  return beatsPerBar - pos;
}

function pushDurationEvents(events, type, totalBeats, beatsPerBar, cursorBeat, extra = {}) {
  let remaining = totalBeats;
  let beat = cursorBeat;
  let guard = 0;
  while (remaining > 0.12 && guard++ < 64) {
    const room = roomInBar(beat, beatsPerBar);
    const take = Math.min(remaining, room);
    const dur = nearestDuration(take);
    // Never emit more than remaining (nearestDuration can round up).
    const beats = Math.min(dur.beats, Math.max(0.25, remaining));
    const id = nearestDuration(beats).id;
    events.push({ type, beats, durationId: id, ...extra });
    beat += beats;
    remaining -= beats;
  }
  return beat;
}

/**
 * Quantize note starts/durations into a beat grid and insert rests for gaps.
 * Returns score events: { type:'note'|'rest', beats, durationId, midi?, label?, ... }
 */
export function quantizeToScore(notes, bpm = 120, opts = {}) {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const beatSec = 60 / Math.max(40, Math.min(240, bpm));
  const offsetSec = opts.offsetSec != null
    ? opts.offsetSec
    : (opts.offsetBeats != null ? opts.offsetBeats * beatSec : 0);
  const events = [];

  let cursorBeat = 0;
  let started = false;

  for (const n of notes) {
    const startBeat = (n.startSec - offsetSec) / beatSec;
    const endBeat = (n.startSec + n.durationSec - offsetSec) / beatSec;

    if (!started && startBeat < -1e-6) {
      cursorBeat = startBeat;
      started = true;
    }

    const gapBeats = startBeat - cursorBeat;
    if (gapBeats >= 0.25) {
      cursorBeat = pushDurationEvents(events, 'rest', gapBeats, beatsPerBar, cursorBeat);
    } else if (gapBeats > 0) {
      cursorBeat = startBeat;
    } else if (gapBeats < -1e-6) {
      cursorBeat = startBeat;
    }

    const rawBeats = Math.max(0.25, endBeat - cursorBeat);
    const noteBeats = nearestDuration(rawBeats).beats;
    cursorBeat = pushDurationEvents(events, 'note', noteBeats, beatsPerBar, cursorBeat, {
      midi: n.midi,
      name: n.name,
      oct: n.oct,
      label: n.label,
      clarity: n.clarity,
      startSec: n.startSec,
      durationSec: n.durationSec,
    });
    started = true;
  }

  return { events, bpm, beatsPerBar, offsetSec, offsetBeats: offsetSec / beatSec, cursorBeat };
}

/** Map MIDI → staff position (diatonic value) + accidental. C4 (60) = DV 28. */
export function midiToStaff(midi, preferSharps = true) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  const spelled = preferSharps ? NOTE_NAMES_SHARP[pc] : NOTE_NAMES_FLAT[pc];
  const letter = spelled[0];
  const accidental = spelled.length > 1 ? spelled.slice(1) : null;
  const letterIndex = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }[letter];
  const dv = (oct - 4) * 7 + letterIndex + 28;
  return { letter, accidental, oct, dv, spelled, midi };
}

/** Pick treble or bass from the average MIDI of transcribed notes. */
export function suggestClef(notes) {
  if (!notes.length) return 'Treble';
  const avg = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
  return avg < 55 ? 'Bass' : 'Treble';
}

/**
 * Full pipeline: AudioBuffer → notes + quantized score events.
 */
export async function transcribeBuffer(audioBuffer, opts = {}) {
  const mono = bufferToMono(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const hopSize = opts.hopSize ?? 1024;
  const frames = await extractPitchFrames(mono, sampleRate, {
    ...opts,
    hopSize,
    windowSize: opts.windowSize ?? 2048,
  });
  const notes = segmentNotes(frames, {
    hopSec: hopSize / sampleRate,
    minNoteSec: opts.minNoteSec,
  });
  const tempoEst = estimateTempo(notes, { beatsPerBar: opts.beatsPerBar });
  const bpm = opts.bpm || tempoEst.bpm;
  const beatsPerBar = opts.beatsPerBar ?? tempoEst.beatsPerBar;
  const beatSec = 60 / Math.max(40, Math.min(240, bpm));
  const offsetSec = opts.offsetSec ?? tempoEst.offsetSec;
  const offsetBeats = opts.offsetBeats ?? (offsetSec / beatSec);
  const tempoConfidence = (!opts.bpm && !opts.beatsPerBar)
    ? tempoEst.confidence
    : tempoEst.confidence;
  const score = quantizeToScore(notes, bpm, { beatsPerBar, offsetSec, offsetBeats });
  return {
    notes,
    score,
    bpm,
    beatsPerBar,
    offsetSec,
    offsetBeats,
    tempoConfidence,
    durationSec: audioBuffer.duration,
    sampleRate,
    frameCount: frames.length,
  };
}
