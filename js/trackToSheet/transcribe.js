// Offline monophonic transcription for isolated tracks.
// Assumes a single pitched layer (vocal, lead guitar, bass, etc.) — no source
// separation. Pitch frames use the shared McLeod detector in dsp.js, then
// Viterbi octave correction, onset-aware segmentation, and grid quantisation.

import { NOTE_NAMES_SHARP } from '../theory.js';
import { ensureAudio, audioCtx } from '../audio.js';
import { resolveAnalysisOptions } from './analysisOptions.js';
import {
  nextPow2,
  createPitchDetector,
  removeDcInPlace,
  median,
  computeOnsetEnvelope,
  pickOnsets,
  tempoCandidatesFromEnvelope,
} from './dsp.js';

const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const REF_SAMPLE_RATE = 44100;
const MIN_BPM = 40;
const MAX_BPM = 240;
const BRIDGE_SEC = 0.03;
const ONSET_SNAP_SEC = 0.04;
const MERGE_GAP_SEC = 0.08;

/** Decode an uploaded audio File/Blob into an AudioBuffer. */
export async function decodeAudioFile(file) {
  ensureAudio();
  const ab = await file.arrayBuffer();
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

function midiToNoteFields(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES_SHARP[((rounded % 12) + 12) % 12];
  const oct = Math.floor(rounded / 12) - 1;
  return { midi: rounded, name, oct, label: `${name}${oct}` };
}

function weightedMedian(values, weights) {
  if (!values.length) return 0;
  const pairs = values.map((v, i) => ({ v, w: Math.max(0, weights[i]) }));
  pairs.sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0);
  if (total <= 0) return median(values);
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

function centeredMedian(values, radius) {
  const n = values.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - radius);
    const i1 = Math.min(n - 1, i + radius);
    const slice = [];
    for (let j = i0; j <= i1; j++) slice.push(values[j]);
    out[i] = median(slice);
  }
  return out;
}

/**
 * Copy mono, remove DC, peak-normalise to ~0.9 for stable RMS gates.
 * @returns {{ mono: Float32Array, peakLevel: number }}
 */
function preprocessMono(mono) {
  const work = Float32Array.from(mono);
  removeDcInPlace(work);
  let peak = 0;
  for (let i = 0; i < work.length; i++) {
    const a = Math.abs(work[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < work.length; i++) work[i] *= scale;
  }
  return { mono: work, peakLevel: peak };
}

/**
 * Scale reference-frame sizes from 44.1 kHz to the actual sample rate.
 * Window must hold at least ~2.5 periods of the lowest searchable pitch.
 */
function resolveFrameSizes(sampleRate, derived) {
  const hopSize = Math.max(1, Math.round(derived.hopSize * sampleRate / REF_SAMPLE_RATE));
  const minWindow = Math.ceil(2.5 * sampleRate / derived.minFreq);
  const refWindow = Math.round(derived.windowSize * sampleRate / REF_SAMPLE_RATE);
  const windowSize = nextPow2(Math.max(refWindow, minWindow));
  return { hopSize, windowSize, hopSec: hopSize / sampleRate };
}

/**
 * Walk a mono buffer with hop windows and return raw pitch frames.
 * `onProgress(0..1)` is optional and called periodically so the UI can update.
 */
export async function extractPitchFrames(mono, sampleRate, opts = {}) {
  const derived = opts.derived || {};
  const minFreq = opts.minFreq ?? derived.minFreq ?? 55;
  const maxFreq = opts.maxFreq ?? derived.maxFreq ?? 2000;
  const minClarity = opts.minClarity ?? derived.minClarity ?? 0.55;
  const minRms = opts.minRms ?? derived.minRms ?? 0.008;
  const onProgress = opts.onProgress || null;

  const { hopSize, windowSize, hopSec } = opts.hopSize != null
    ? {
      hopSize: opts.hopSize,
      windowSize: opts.windowSize ?? nextPow2(Math.max(
        opts.windowSize ?? 2048,
        Math.ceil(2.5 * sampleRate / minFreq),
      )),
      hopSec: opts.hopSize / sampleRate,
    }
    : resolveFrameSizes(sampleRate, {
      hopSize: derived.hopSize ?? 256,
      windowSize: derived.windowSize ?? 2048,
      minFreq,
    });

  const detector = createPitchDetector({ windowSize, sampleRate, minFreq, maxFreq });
  const frames = [];
  const total = Math.max(1, Math.floor((mono.length - windowSize) / hopSize) + 1);
  let yieldCounter = 0;
  const yieldEvery = total > 2000 ? 80 : 40;

  for (let i = 0, fi = 0; i + windowSize <= mono.length; i += hopSize, fi++) {
    const slice = mono.subarray(i, i + windowSize);
    const det = detector.detect(slice, {
      minClarity,
      minRms,
      minFreq,
      maxFreq,
      peakRatio: 0.93,
    });
    const freq = det.freq > 0 ? det.freq : -1;
    frames.push({
      t: i / sampleRate,
      freq,
      midi: freq > 0 ? Math.round(freqToMidi(freq)) : -1,
      midiFloat: freq > 0 ? freqToMidi(freq) : -1,
      clarity: det.clarity,
      rms: det.rms,
      candidates: det.candidates || [],
    });

    if (++yieldCounter >= yieldEvery) {
      yieldCounter = 0;
      if (onProgress) onProgress(fi / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(1);
  return frames;
}

/**
 * Viterbi path over per-frame NSDF candidates to fix octave errors.
 * Transition cost grows with semitone distance; a weak pull anchors to the
 * global weighted-median pitch of the take.
 */
function correctOctaveErrors(frames) {
  if (!frames.length) return frames;

  const midis = [];
  const weights = [];
  for (const f of frames) {
    const cands = f.candidates?.length ? f.candidates : (f.freq > 0 ? [{ freq: f.freq, clarity: f.clarity }] : []);
    if (!cands.length || cands[0].freq <= 0) continue;
    midis.push(freqToMidi(cands[0].freq));
    weights.push(cands[0].clarity * f.rms);
  }
  const globalMidi = midis.length ? weightedMedian(midis, weights) : 60;

  const frameCands = frames.map((f) => {
    const raw = f.candidates?.length
      ? f.candidates.slice(0, 6)
      : (f.freq > 0 ? [{ freq: f.freq, clarity: f.clarity }] : []);
    if (!raw.length) return [{ freq: -1, clarity: 0, midi: -1 }];
    return raw.map((c) => ({
      freq: c.freq,
      clarity: c.clarity,
      midi: freqToMidi(c.freq),
    }));
  });

  const n = frames.length;
  const dp = frameCands.map((cands) => new Float32Array(cands.length).fill(-Infinity));
  const back = frameCands.map((cands) => new Int16Array(cands.length).fill(-1));

  for (let j = 0; j < frameCands[0].length; j++) {
    const c = frameCands[0][j];
    dp[0][j] = emissionScore(c);
  }

  for (let t = 1; t < n; t++) {
    for (let j = 0; j < frameCands[t].length; j++) {
      const cj = frameCands[t][j];
      let best = -Infinity;
      let bestI = 0;
      for (let i = 0; i < frameCands[t - 1].length; i++) {
        const ci = frameCands[t - 1][i];
        const trans = transitionScore(ci, cj, globalMidi);
        const score = dp[t - 1][i] + trans + emissionScore(cj);
        if (score > best) {
          best = score;
          bestI = i;
        }
      }
      dp[t][j] = best;
      back[t][j] = bestI;
    }
  }

  let bestJ = 0;
  let bestScore = dp[n - 1][0];
  for (let j = 1; j < frameCands[n - 1].length; j++) {
    if (dp[n - 1][j] > bestScore) {
      bestScore = dp[n - 1][j];
      bestJ = j;
    }
  }

  const path = new Array(n);
  for (let t = n - 1; t >= 0; t--) {
    path[t] = frameCands[t][bestJ];
    bestJ = back[t][bestJ] >= 0 ? back[t][bestJ] : 0;
  }

  return frames.map((f, t) => {
    const chosen = path[t];
    if (!chosen || chosen.freq <= 0) {
      return { ...f, freq: -1, midi: -1, midiFloat: -1 };
    }
    return {
      ...f,
      freq: chosen.freq,
      midi: Math.round(chosen.midi),
      midiFloat: chosen.midi,
    };
  });
}

function emissionScore(c) {
  if (!c || c.freq <= 0) return -0.5;
  return Math.log(0.02 + c.clarity);
}

function transitionScore(ci, cj, globalMidi) {
  if (!ci || ci.freq <= 0) return cj.freq > 0 ? -0.2 : 0;
  if (!cj || cj.freq <= 0) return -0.2;
  const semi = Math.abs(12 * Math.log2(cj.freq / ci.freq));
  const jumpCost = 0.025 * semi * semi;
  const octaveCost = semi >= 11 ? 2.5 : 0;
  const globalPull = 0.04 * Math.abs(cj.midi - globalMidi);
  return -(jumpCost + octaveCost + globalPull);
}

/**
 * Short centred median on voiced frames only; gaps stay unvoiced.
 */
function smoothVoicedMidi(frames, radius = 2) {
  if (!frames.length) return frames;
  const raw = frames.map((f) => (f.midiFloat > 0 ? f.midiFloat : NaN));
  const smoothed = centeredMedian(
    raw.map((v) => (Number.isFinite(v) ? v : 0)),
    radius,
  );
  return frames.map((f, i) => {
    if (f.midiFloat <= 0) return f;
    return { ...f, midiFloat: smoothed[i], midi: Math.round(smoothed[i]) };
  });
}

function centsDiff(a, b) {
  return Math.abs(1200 * Math.log2(a / b));
}

function mergeSemitoneBlips(notes, onsets) {
  if (notes.length < 2) return notes;
  const sorted = notes.slice().sort((a, b) => a.startSec - b.startSec);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const gap = cur.startSec - (prev.startSec + prev.durationSec);
    const onsetBetween = onsets.some((o) => o.strength >= 0.45
      && o.time > prev.startSec + 0.03
      && o.time < cur.startSec - 0.03);
    const semiApart = Math.abs(cur.midi - prev.midi) === 1;
    const shortPair = prev.durationSec < 0.14 || cur.durationSec < 0.14;
    if (!onsetBetween && gap < 0.06 && semiApart && shortPair) {
      const keep = prev.clarity >= cur.clarity ? { ...prev } : { ...cur };
      keep.startSec = prev.startSec;
      keep.durationSec = cur.startSec + cur.durationSec - prev.startSec;
      keep.clarity = Math.max(prev.clarity, cur.clarity);
      keep.confidence = Math.max(prev.confidence, cur.confidence);
      out[out.length - 1] = keep;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function mergeMicroNotes(notes, onsets, maxGap = 0.04) {
  if (notes.length < 2) return notes;
  const sorted = notes.slice().sort((a, b) => a.startSec - b.startSec);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const gap = cur.startSec - (prev.startSec + prev.durationSec);
    const onsetBetween = onsets.some((o) => o.strength >= 0.4
      && o.time > prev.startSec + 0.02
      && o.time < cur.startSec - 0.02);
    const shortBlip = prev.durationSec < 0.09 || cur.durationSec < 0.09;
    if (!onsetBetween
      && gap < maxGap
      && Math.abs(cur.midi - prev.midi) <= 1
      && shortBlip) {
      prev.durationSec = cur.startSec + cur.durationSec - prev.startSec;
      prev.clarity = Math.max(prev.clarity, cur.clarity);
      prev.confidence = Math.max(prev.confidence, cur.confidence);
      if (cur.clarity > prev.clarity) {
        prev.midi = cur.midi;
        prev.name = cur.name;
        prev.oct = cur.oct;
        prev.label = cur.label;
      }
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function pruneSpuriousNotes(notes) {
  if (notes.length < 2) return notes;
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const prev = out[out.length - 1];
    const next = notes[i + 1];
    const short = n.durationSec < 0.12;
    const weak = (n.confidence ?? n.clarity) < 0.72;
    if (prev && next && prev.midi === next.midi
      && Math.abs(n.midi - prev.midi) === 1
      && n.durationSec < 0.14
      && (n.confidence ?? n.clarity) < 0.82) continue;
    if (short && weak) {
      const nearPrev = prev && Math.abs(n.midi - prev.midi) <= 1;
      const nearNext = next && Math.abs(n.midi - next.midi) <= 1;
      if (nearPrev && nearNext && prev.midi === next.midi) continue;
      if (nearPrev && nearNext) continue;
      if (nearPrev && prev.midi === (next?.midi ?? prev.midi)) continue;
    }
    out.push(n);
  }
  while (out.length >= 2) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const weak = (last.confidence ?? last.clarity) < 0.75;
    const short = last.durationSec < 0.14;
    const semiOff = Math.abs(last.midi - prev.midi) === 1;
    if (weak && short && semiOff) out.pop();
    else break;
  }
  return out;
}

function isFrameVoiced(f, derived) {
  return f.freq > 0
    && f.clarity >= derived.minClarity
    && f.rms >= derived.minRms;
}

function nearestOnsetStrength(onsets, time, maxDist = 0.05) {
  let best = 0;
  for (const o of onsets) {
    const d = Math.abs(o.time - time);
    if (d <= maxDist && o.strength > best) best = o.strength;
  }
  return best;
}

/**
 * Onset-aware note segmentation with pitch continuity and optional repeat splits.
 */
export function segmentNotes(frames, opts = {}) {
  const derived = opts.derived || {};
  const hopSec = opts.hopSec ?? derived.hopSec ?? 0.006;
  const minNoteSec = opts.minNoteSec ?? derived.minNoteSec ?? 0.08;
  const minVoicedFrames = opts.minVoicedFrames ?? derived.minVoicedFrames ?? 2;
  const pitchTolCents = opts.pitchTolCents ?? derived.pitchTolCents ?? 65;
  const minClarity = opts.minClarity ?? derived.minClarity ?? 0.5;
  const frameConfidence = opts.frameConfidence ?? derived.frameConfidence ?? 0.6;
  const onsets = opts.onsets || [];
  const splitRepeats = opts.splitRepeats !== false;
  const bridgeFrames = Math.max(1, Math.round(BRIDGE_SEC / hopSec));

  const segments = [];
  let i = 0;
  while (i < frames.length) {
    const f = frames[i];
    if (!isFrameVoiced(f, { minClarity, minRms: derived.minRms ?? 0.008 })) {
      i++;
      continue;
    }

    let j = i;
    while (j < frames.length && frames[j].clarity < frameConfidence) j++;
    if (j >= frames.length) break;

    const startIdx = j;
    let endIdx = j;
    let refMidi = frames[j].midiFloat;
    const segFrames = [frames[j]];
    let bridgeLeft = 0;

    for (let k = j + 1; k < frames.length; k++) {
      const fk = frames[k];
      const voiced = isFrameVoiced(fk, { minClarity, minRms: derived.minRms ?? 0.008 });
      const w = fk.clarity * fk.rms;
      const inTol = voiced && Math.abs(100 * (fk.midiFloat - refMidi)) <= pitchTolCents;

      if (inTol) {
        segFrames.push(fk);
        endIdx = k;
        bridgeLeft = bridgeFrames;
        const vals = segFrames.map((x) => x.midiFloat);
        const ws = segFrames.map((x) => x.clarity * x.rms);
        refMidi = weightedMedian(vals, ws);
      } else if (bridgeLeft > 0) {
        bridgeLeft--;
        if (voiced) segFrames.push(fk);
        endIdx = k;
      } else {
        break;
      }
    }

    segments.push({ startIdx, endIdx, frames: segFrames });
    i = endIdx + 1;
  }

  let notes = segments.map((seg) => buildNoteFromSegment(seg, hopSec, onsets));

  if (splitRepeats && onsets.length) {
    notes = splitNotesAtOnsets(notes, onsets, minNoteSec);
  }

  notes = pruneSpuriousNotes(notes);

  notes = notes.filter((n) => {
    if (n.durationSec < minNoteSec) return false;
    if (n.voicedFrames < minVoicedFrames) return false;
    if (n.clarity < minClarity) return false;
    return true;
  });

  notes = mergeAdjacentNotes(notes, onsets);
  notes = mergeSemitoneBlips(notes, onsets);
  notes = mergeMicroNotes(notes, onsets);

  return notes.map(({ voicedFrames, ...n }) => n);
}

function buildNoteFromSegment(seg, hopSec, onsets) {
  const { frames: segFrames, startIdx, endIdx } = seg;
  const attackSkip = Math.floor(segFrames.length * 0.28);
  const stable = segFrames.slice(attackSkip);
  const useFrames = stable.length >= 2 ? stable : segFrames;

  const vals = useFrames.map((f) => f.midiFloat);
  const ws = useFrames.map((f) => f.clarity * f.rms);
  const medianMidi = weightedMedian(vals, ws);
  const rounded = Math.round(weightedMedian(
    useFrames.map((f) => Math.round(f.midiFloat)),
    ws,
  ));
  const cents = 100 * (medianMidi - rounded);

  let startSec = segFrames[0].t;
  for (const o of onsets) {
    if (Math.abs(o.time - startSec) <= ONSET_SNAP_SEC) {
      startSec = o.time;
      break;
    }
  }

  const endSec = segFrames[segFrames.length - 1].t + hopSec;
  const clarity = segFrames.reduce((s, f) => s + f.clarity, 0) / segFrames.length;
  const rms = segFrames.reduce((s, f) => s + f.rms, 0) / segFrames.length;
  const onsetStrength = nearestOnsetStrength(onsets, startSec);

  const fields = midiToNoteFields(rounded);
  return {
    ...fields,
    startSec,
    durationSec: Math.max(hopSec, endSec - startSec),
    clarity,
    confidence: Math.min(1, clarity * 0.7 + onsetStrength * 0.3),
    cents,
    rms,
    onsetStrength,
    voicedFrames: segFrames.length,
  };
}

function splitNotesAtOnsets(notes, onsets, minNoteSec) {
  const maxStrength = onsets.reduce((m, o) => Math.max(m, o.strength), 0.01);
  const strongOnsets = onsets.filter((o) => o.strength >= maxStrength * 0.62);
  const onsetTimes = onsets.map((o) => o.time);
  const medIoi = onsetTimes.length > 1
    ? median(collectIoIs(onsetTimes))
    : minNoteSec;
  const out = [];
  for (const note of notes) {
    const end = note.startSec + note.durationSec;
    if (note.durationSec < medIoi * 0.82) {
      out.push(note);
      continue;
    }
    const interior = strongOnsets
      .filter((o) => o.strength >= 0.48
        && o.time > note.startSec + note.durationSec * 0.38
        && o.time < end - note.durationSec * 0.38)
      .sort((a, b) => a.time - b.time);
    if (!interior.length) {
      out.push(note);
      continue;
    }
    let curStart = note.startSec;
    const pieces = [...interior.map((o) => o.time), end];
    for (const splitAt of pieces) {
      const dur = splitAt - curStart;
      if (dur >= minNoteSec * 0.85) {
        out.push({
          ...note,
          startSec: curStart,
          durationSec: dur,
        });
      }
      curStart = splitAt;
    }
  }
  return out;
}

function mergeAdjacentNotes(notes, onsets) {
  if (notes.length < 2) return notes;
  const sorted = notes.slice().sort((a, b) => a.startSec - b.startSec);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const gap = cur.startSec - (prev.startSec + prev.durationSec);
    const onsetBetween = onsets.some((o) => {
      const t = o.time;
      return o.strength >= 0.38
        && t > prev.startSec + 0.01
        && t < cur.startSec - 0.01;
    });
    if (cur.midi === prev.midi && gap < MERGE_GAP_SEC && !onsetBetween) {
      prev.durationSec = cur.startSec + cur.durationSec - prev.startSec;
      prev.clarity = (prev.clarity + cur.clarity) / 2;
      prev.confidence = Math.max(prev.confidence, cur.confidence);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function collectIoIs(times, minSec = 0.05, maxSec = 4) {
  const sorted = times.slice().sort((a, b) => a - b);
  const iois = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d >= minSec && d <= maxSec) iois.push(d);
  }
  return iois;
}

function ioiHistogramPeaks(iois, binWidth = 0.02) {
  if (!iois.length) return [];
  const bins = new Map();
  for (const ioi of iois) {
    const key = Math.round(ioi / binWidth);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  return [...bins.entries()]
    .map(([k, count]) => ({ ioi: k * binWidth, count }))
    .sort((a, b) => b.count - a.count);
}

function expandTempoRelatives(bpm) {
  const out = new Set([bpm]);
  for (const mult of [0.5, 2]) {
    const v = bpm * mult;
    if (v >= MIN_BPM && v <= MAX_BPM) out.add(v);
  }
  return [...out];
}

function tempoPrior(bpm) {
  if (bpm < 50 || bpm > 210) return 0.45;
  if (bpm >= 72 && bpm <= 132) return 1;
  if (bpm < 72) return 0.65 + 0.35 * ((bpm - 50) / 22);
  return 0.65 + 0.35 * ((210 - bpm) / 78);
}

function envelopeBoost(bpm, envelopeCandidates) {
  let boost = 1;
  for (const c of envelopeCandidates) {
    for (const ratio of [1, 2, 0.5]) {
      if (Math.abs(bpm / c.bpm - ratio) < 0.05) {
        boost = Math.max(boost, 1 + c.strength * 4);
      }
    }
  }
  return boost;
}

function gaussianReward(dist, sigma) {
  return Math.exp(-0.5 * (dist / sigma) ** 2);
}

/**
 * Score BPM + phase against onsets; pick the coarsest grid division that fits.
 */
function scoreTempoWithBestGrid(bpm, phaseSec, onsetTimes, gridDivisions, weights) {
  if (!onsetTimes.length || bpm <= 0) return { score: 0, gridUnit: 0.25 };
  const beatSec = 60 / bpm;
  const sortedGrids = gridDivisions.slice().sort((a, b) => b - a);
  let bestScore = 0;
  let bestGrid = sortedGrids[sortedGrids.length - 1] || 0.25;

  for (const gridUnit of sortedGrids) {
    const sigma = Math.min(0.045, beatSec * gridUnit * 0.4);
    let total = 0;
    for (let i = 0; i < onsetTimes.length; i++) {
      const t = onsetTimes[i];
      const pos = (t - phaseSec) / beatSec;
      const nearest = Math.round(pos / gridUnit) * gridUnit;
      const err = Math.abs(pos - nearest) * beatSec;
      total += gaussianReward(err, sigma) * (weights[i] ?? 1);
    }
    const align = total / onsetTimes.length;
    const coarseBonus = gridUnit * 0.12;
    const downbeat = downbeatAlignment(bpm, phaseSec, onsetTimes) * 0.1;
    const score = align + coarseBonus + downbeat;
    if (score > bestScore) {
      bestScore = score;
      bestGrid = gridUnit;
    }
  }
  return { score: bestScore, gridUnit: bestGrid };
}

function ioiBeatCandidates(iois) {
  const cands = new Set();
  if (!iois.length) return cands;
  const med = median(iois);
  for (const n of [0.25, 0.5, 1, 2, 4, 8]) {
    const bpm = (60 * n) / med;
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) cands.add(bpm);
  }
  for (const { ioi } of ioiHistogramPeaks(iois).slice(0, 8)) {
    for (const n of [0.25, 0.5, 1, 2, 4, 8]) {
      const bpm = (60 * n) / ioi;
      if (bpm >= MIN_BPM && bpm <= MAX_BPM) cands.add(bpm);
    }
  }
  return cands;
}

function downbeatAlignment(bpm, phaseSec, onsetTimes) {
  if (!onsetTimes.length) return 0;
  const beatSec = 60 / bpm;
  let hits = 0;
  for (const t of onsetTimes) {
    const pos = (t - phaseSec) / beatSec;
    const err = Math.abs(pos - Math.round(pos)) * beatSec;
    if (err < 0.045) hits++;
  }
  return hits / onsetTimes.length;
}

function disambiguateTempoOctave(best, envelopeBpms, onsetTimes, gridUnits, weights, envelopeCandidates = []) {
  const seeds = new Map();
  seeds.set(best.bpm, best.score);
  for (const eb of envelopeBpms) {
    for (const mult of [1, 0.5, 2]) {
      const bpm = eb * mult;
      if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
      const beatSec = 60 / bpm;
      const phaseSteps = 32;
      let peak = 0;
      let peakPhase = 0;
      for (let ps = 0; ps < phaseSteps; ps++) {
        const phase = (ps / phaseSteps) * beatSec;
        const { score } = scoreTempoWithBestGrid(bpm, phase, onsetTimes, gridUnits, weights);
        const total = score * tempoPrior(bpm) * envelopeBoost(bpm, envelopeCandidates);
        if (total > peak) {
          peak = total;
          peakPhase = phase;
        }
      }
      const envBonus = Math.abs(bpm - eb) < 2 ? 0.08 : 0;
      seeds.set(bpm, Math.max(seeds.get(bpm) || 0, peak + envBonus));
      if (peak + envBonus > best.score) {
        best = { bpm, phase: peakPhase, score: peak + envBonus, gridUnit: best.gridUnit };
      }
    }
  }

  let winner = best;
  for (const [bpm, score] of seeds) {
    const beatSec = 60 / bpm;
    let peakPhase = 0;
    let peak = 0;
    for (let ps = 0; ps < 32; ps++) {
      const phase = (ps / 32) * beatSec;
      const { score: s } = scoreTempoWithBestGrid(bpm, phase, onsetTimes, gridUnits, weights);
      if (s > peak) {
        peak = s;
        peakPhase = phase;
      }
    }
    const adjusted = peak * tempoPrior(bpm) * envelopeBoost(bpm, envelopeCandidates);
    const winnerAdjusted = winner.score;
    if (adjusted >= winnerAdjusted * 0.96) {
      winner = { bpm, phase: peakPhase, score: adjusted, gridUnit: winner.gridUnit };
    }
  }
  return winner;
}

function resolveCloseEnvelopePeaks(best, envelopeCandidates, onsetTimes, gridUnits, weights) {
  if (envelopeCandidates.length < 2) return best;
  const top = envelopeCandidates.slice(0, 4);
  const maxStrength = top[0].strength;
  const close = top.filter((c) => c.strength >= maxStrength * 0.82);
  if (close.length < 2) return best;

  let winner = best;
  let bestAlign = best.align ?? 0;
  for (const env of close) {
    for (const bpm of expandTempoRelatives(env.bpm)) {
      const beatSec = 60 / bpm;
      for (let ps = 0; ps < 32; ps++) {
        const phase = (ps / 32) * beatSec;
        const { score: align, gridUnit } = scoreTempoWithBestGrid(
          bpm, phase, onsetTimes, gridUnits, weights,
        );
        if (align > bestAlign + 0.02) {
          bestAlign = align;
          winner = {
            bpm,
            phase,
            score: align * tempoPrior(bpm) * envelopeBoost(bpm, envelopeCandidates),
            gridUnit,
            align,
          };
        }
      }
    }
  }
  return winner;
}

function guessBeatsPerBar(onsetTimes, beatSec, phaseSec, pinned) {
  if (pinned != null) return pinned;
  if (!onsetTimes.length || beatSec <= 0) return 4;
  const bar3 = beatSec * 3;
  const bar4 = beatSec * 4;
  let score3 = 0;
  let score4 = 0;
  const tol = beatSec * 0.18;
  for (const t of onsetTimes) {
    const e3 = Math.abs((t - phaseSec) / bar3 - Math.round((t - phaseSec) / bar3)) * bar3;
    const e4 = Math.abs((t - phaseSec) / bar4 - Math.round((t - phaseSec) / bar4)) * bar4;
    if (e3 <= tol) score3 += 1 - e3 / tol;
    if (e4 <= tol) score4 += 1 - e4 / tol;
  }
  if (score3 > score4 * 1.3 && score3 >= 1.5) return 3;
  return 4;
}

/**
 * Estimate tempo, meter, and beat-grid phase from audio onsets and note onsets.
 * @returns {{ bpm:number, beatsPerBar:number, offsetSec:number, offsetBeats:number, confidence:number, candidates:Array }}
 */
export function estimateTempo(notes, opts = {}) {
  const fallback = {
    bpm: 120,
    beatsPerBar: opts.beatsPerBar ?? 4,
    offsetSec: 0,
    offsetBeats: 0,
    confidence: 0,
    candidates: [],
  };

  const audioOnsets = opts.onsets || [];
  const noteOnsets = (notes || []).map((n) => ({
    time: n.startSec,
    strength: n.onsetStrength ?? n.confidence ?? n.clarity ?? 0.5,
    weight: n.confidence ?? n.clarity ?? 0.5,
  }));

  const merged = [];
  const seen = new Set();
  for (const src of [audioOnsets, noteOnsets]) {
    for (const o of src) {
      const key = Math.round(o.time * 200);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        time: o.time,
        strength: o.strength ?? 0.5,
        weight: o.weight ?? o.strength ?? 0.5,
      });
    }
  }
  merged.sort((a, b) => a.time - b.time);

  if (merged.length < 2 && !opts.bpm) return fallback;

  const onsetTimes = merged.map((o) => o.time);
  const weights = merged.map((o) => o.weight);

  const candidateBpms = new Set();
  const envelopeCandidates = [];
  if (opts.envelope && opts.hopSec) {
    for (const c of tempoCandidatesFromEnvelope(opts.envelope, opts.hopSec, {
      minBpm: MIN_BPM,
      maxBpm: MAX_BPM,
    })) {
      envelopeCandidates.push(c);
      for (const b of expandTempoRelatives(c.bpm)) candidateBpms.add(b);
    }
  }

  const iois = collectIoIs(onsetTimes);
  for (const b of ioiBeatCandidates(iois)) candidateBpms.add(b);

  if (opts.bpm) candidateBpms.add(opts.bpm);
  if (!candidateBpms.size) candidateBpms.add(120);

  const gridUnits = opts.gridDivisions?.length
    ? opts.gridDivisions
    : [1, 0.5, 0.25, 1 / 3, 1 / 6];

  let best = { bpm: 120, phase: 0, score: -1, gridUnit: 0.25 };
  const scored = [];

  for (const seed of candidateBpms) {
    const lo = seed * 0.97;
    const hi = seed * 1.03;
    for (let bpm = lo; bpm <= hi; bpm += 0.1) {
      if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
      const beatSec = 60 / bpm;
      const phaseSteps = Math.max(16, Math.min(64, Math.round(beatSec / 0.008)));
      for (let ps = 0; ps < phaseSteps; ps++) {
        const phase = (ps / phaseSteps) * beatSec;
        const { score: align, gridUnit } = scoreTempoWithBestGrid(
          bpm, phase, onsetTimes, gridUnits, weights,
        );
        const score = align * tempoPrior(bpm) * envelopeBoost(bpm, envelopeCandidates);
        scored.push({ bpm, phase, score, gridUnit });
        if (score > best.score) best = { bpm, phase, score, gridUnit, align };
      }
    }
  }

  if (!opts.bpm && envelopeCandidates.length >= 2) {
    const top = envelopeCandidates.slice(0, 3);
    for (const env of top) {
      for (const bpm of expandTempoRelatives(env.bpm)) {
        const beatSec = 60 / bpm;
        for (let ps = 0; ps < 32; ps++) {
          const phase = (ps / 32) * beatSec;
          const { score: align, gridUnit } = scoreTempoWithBestGrid(
            bpm, phase, onsetTimes, gridUnits, weights,
          );
          const score = align * tempoPrior(bpm) * envelopeBoost(bpm, envelopeCandidates);
          if (score > best.score) best = { bpm, phase, score, gridUnit, align };
        }
      }
    }
  }

  if (!opts.bpm && envelopeCandidates.length) {
    best = disambiguateTempoOctave(
      best,
      envelopeCandidates.map((c) => c.bpm),
      onsetTimes,
      gridUnits,
      weights,
      envelopeCandidates,
    );
    best = resolveCloseEnvelopePeaks(
      best, envelopeCandidates, onsetTimes, gridUnits, weights,
    );
  }

  scored.sort((a, b) => b.score - a.score);
  const topCandidates = [];
  const seenBpm = new Set();
  for (const c of scored) {
    const key = Math.round(c.bpm);
    if (seenBpm.has(key)) continue;
    seenBpm.add(key);
    topCandidates.push({ bpm: Math.round(c.bpm * 10) / 10, score: c.score });
    if (topCandidates.length >= 6) break;
  }

  const bpm = opts.bpm
    ? opts.bpm
    : Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, best.bpm)));
  const beatSec = 60 / bpm;
  const offsetSec = best.phase;
  const beatsPerBar = guessBeatsPerBar(onsetTimes, beatSec, offsetSec, opts.beatsPerBar);
  const confidence = Math.max(0, Math.min(1, best.score));

  return {
    bpm,
    beatsPerBar,
    offsetSec,
    offsetBeats: offsetSec / beatSec,
    confidence,
    candidates: topCandidates,
    gridUnit: best.gridUnit,
  };
}

/** Estimate a rough tempo from inter-onset intervals (IOIs). Falls back to 120. */
export function estimateBpm(notes, opts = {}) {
  return estimateTempo(notes, opts).bpm;
}

const DURATION_VALUES = [
  { beats: 4, id: 'w' },
  { beats: 3, id: 'h.' },
  { beats: 2, id: 'h' },
  { beats: 1.5, id: 'q.' },
  { beats: 1, id: 'q' },
  { beats: 2 / 3, id: 'qt' },
  { beats: 0.75, id: 'e.' },
  { beats: 0.5, id: 'e' },
  { beats: 1 / 3, id: 'et' },
  { beats: 0.25, id: 's' },
  { beats: 1 / 6, id: 'st' },
];

const GRID_LABELS = {
  1: '1/4',
  0.5: '1/8',
  0.25: '1/16',
  0.125: '1/32',
  [1 / 3]: '1/8t',
  [1 / 6]: '1/16t',
};

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
  if (beats < 0.125) return { beats: 0.25, id: 's' };
  if (beats > 4.5) return { beats: 4, id: 'w' };
  return best;
}

function gridLabel(division) {
  return GRID_LABELS[division] || `${division}`;
}

/**
 * Pick the coarsest grid division that explains onsets, then snap note timing.
 */
export function quantizeNotes(notes, {
  bpm,
  beatsPerBar = 4,
  offsetSec = 0,
  gridDivisions = [1, 0.5, 0.25],
  quantizeStrength = 1,
  allowTriplets = true,
} = {}) {
  const beatSec = 60 / Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  const divisions = (gridDivisions || [1, 0.5, 0.25])
    .filter((d) => allowTriplets || !(Math.abs(d - 1 / 3) < 1e-6 || Math.abs(d - 1 / 6) < 1e-6))
    .slice()
    .sort((a, b) => b - a);

  const raw = (notes || []).map((n) => {
    const startBeat = (n.startSec - offsetSec) / beatSec;
    const durationBeats = n.durationSec / beatSec;
    return { n, startBeat, durationBeats };
  });

  let bestDiv = divisions[divisions.length - 1] || 0.25;
  let bestFit = -1;
  const isTripletDiv = (d) => Math.abs(d - 1 / 3) < 0.02 || Math.abs(d - 1 / 6) < 0.02;
  for (const div of divisions) {
    if (isTripletDiv(div) && !allowTriplets) continue;
    let fit = 0;
    for (const { startBeat, durationBeats } of raw) {
      const nearestStart = Math.round(startBeat / div) * div;
      const nearestDur = Math.round(durationBeats / div) * div;
      if (Math.abs(startBeat - nearestStart) < div * 0.45) fit += 1;
      if (Math.abs(durationBeats - nearestDur) < div * 0.45) fit += 0.75;
    }
    if (isTripletDiv(div)) fit *= 0.88;
    if (fit > bestFit + 0.05 || (fit > bestFit - 0.02 && !isTripletDiv(div) && isTripletDiv(bestDiv))) {
      bestFit = fit;
      bestDiv = div;
    }
  }

  const q = Math.max(0, Math.min(1, quantizeStrength));
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const { n, startBeat, durationBeats } = raw[i];
    const snappedStart = Math.round(startBeat / bestDiv) * bestDiv;
    const snappedDur = Math.max(bestDiv, Math.round(durationBeats / bestDiv) * bestDiv);
    const start = startBeat * (1 - q) + snappedStart * q;
    let duration = durationBeats * (1 - q) + snappedDur * q;
    duration = Math.max(bestDiv, duration);
    if (i + 1 < raw.length) {
      const nextStart = raw[i + 1].startBeat;
      duration = Math.min(duration, Math.max(bestDiv, nextStart - start));
    }
    out.push({
      ...n,
      startBeat: start,
      durationBeats: duration,
    });
  }

  const fitScore = raw.length ? bestFit / raw.length : 0;
  return {
    notes: out,
    gridDivision: bestDiv,
    gridLabel: gridLabel(bestDiv),
    fitScore,
  };
}

function roomInBar(cursorBeat, beatsPerBar) {
  const pos = cursorBeat % beatsPerBar;
  if (pos < 1e-6 || beatsPerBar - pos < 1e-6) return beatsPerBar;
  return beatsPerBar - pos;
}

function pushDurationEvents(events, type, totalBeats, beatsPerBar, cursorBeat, extra = {}) {
  let remaining = totalBeats;
  let beat = cursorBeat;
  let guard = 0;
  while (remaining > 0.08 && guard++ < 64) {
    const room = roomInBar(beat, beatsPerBar);
    const take = Math.min(remaining, room);
    const dur = nearestDuration(take);
    const beats = Math.min(dur.beats, Math.max(0.25, remaining));
    const id = nearestDuration(beats).id;
    const tripletFallback = id === 'qt' || id === 'et' || id === 'st'
      ? nearestDuration(beats * 1.5).id
      : id;
    events.push({ type, beats, durationId: tripletFallback, ...extra });
    beat += beats;
    remaining -= beats;
  }
  return beat;
}

/**
 * Quantize note starts/durations into a beat grid and insert rests for gaps.
 * Uses startBeat/durationBeats when present; otherwise converts from seconds.
 */
export function quantizeToScore(notes, bpm = 120, opts = {}) {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const beatSec = 60 / Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  const offsetSec = opts.offsetSec != null
    ? opts.offsetSec
    : (opts.offsetBeats != null ? opts.offsetBeats * beatSec : 0);
  const events = [];

  let cursorBeat = 0;
  let started = false;

  const sorted = (notes || []).slice().sort((a, b) => {
    const sa = a.startBeat != null ? a.startBeat : (a.startSec - offsetSec) / beatSec;
    const sb = b.startBeat != null ? b.startBeat : (b.startSec - offsetSec) / beatSec;
    return sa - sb;
  });

  for (const n of sorted) {
    const startBeat = n.startBeat != null
      ? n.startBeat
      : (n.startSec - offsetSec) / beatSec;
    const durationBeats = n.durationBeats != null
      ? n.durationBeats
      : n.durationSec / beatSec;
    const endBeat = startBeat + durationBeats;

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

    const noteBeats = Math.max(0.25, endBeat - cursorBeat);
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
 * Full offline pipeline on mono PCM — no Web Audio, Node-testable.
 */
export async function analyzeMono(mono, sampleRate, options = {}) {
  const resolved = resolveAnalysisOptions(options);
  const derived = resolved.derived;
  const onProgress = options.onProgress || null;

  const { mono: processed, peakLevel } = preprocessMono(mono);
  const { hopSize, windowSize, hopSec } = resolveFrameSizes(sampleRate, derived);

  let frames = await extractPitchFrames(processed, sampleRate, {
    derived,
    hopSize,
    windowSize,
    onProgress: onProgress
      ? (p) => onProgress(p * 0.55)
      : null,
  });

  frames = correctOctaveErrors(frames);
  frames = smoothVoicedMidi(frames, 2);

  const onsetEnv = computeOnsetEnvelope(processed, sampleRate, {
    fftSize: nextPow2(Math.min(2048, Math.round(1024 * sampleRate / REF_SAMPLE_RATE))),
    hopSize: Math.max(64, Math.round(256 * sampleRate / REF_SAMPLE_RATE)),
  });
  const onsets = pickOnsets(onsetEnv.envelope, onsetEnv.hopSec, {
    delta: derived.onsetDelta,
    minSepSec: derived.onsetMinSepSec,
  });

  if (onProgress) onProgress(0.7);

  let notes = segmentNotes(frames, {
    derived,
    hopSec,
    onsets,
    splitRepeats: resolved.splitRepeats,
  });

  const tempoEst = estimateTempo(notes, {
    beatsPerBar: derived.beatsPerBar,
    bpm: derived.bpm,
    onsets,
    envelope: onsetEnv.envelope,
    hopSec: onsetEnv.hopSec,
    gridDivisions: derived.gridDivisions,
  });

  const bpm = derived.bpm ?? tempoEst.bpm;
  const beatsPerBar = derived.beatsPerBar ?? tempoEst.beatsPerBar;
  const offsetSec = tempoEst.offsetSec;
  const offsetBeats = tempoEst.offsetBeats;

  const grid = quantizeNotes(notes, {
    bpm,
    beatsPerBar,
    offsetSec,
    gridDivisions: derived.gridDivisions,
    quantizeStrength: derived.quantizeStrength,
    allowTriplets: derived.allowTriplets,
  });
  notes = grid.notes;

  const score = quantizeToScore(notes, bpm, { beatsPerBar, offsetSec });

  const voiced = frames.filter((f) => f.freq > 0 && f.clarity >= derived.minClarity);
  const clarities = voiced.map((f) => f.clarity);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;
  const medianClarity = clarities.length ? median(clarities) : 0;

  if (onProgress) onProgress(1);

  return {
    notes,
    score,
    bpm,
    beatsPerBar,
    offsetSec,
    offsetBeats,
    tempoConfidence: derived.bpm != null ? 1 : tempoEst.confidence,
    durationSec: mono.length / sampleRate,
    sampleRate,
    frameCount: frames.length,
    options: resolved,
    onsets,
    tempoCandidates: tempoEst.candidates || [],
    grid: {
      division: grid.gridDivision,
      label: grid.gridLabel,
      fitScore: grid.fitScore,
    },
    diagnostics: {
      voicedRatio,
      medianClarity,
      onsetCount: onsets.length,
      peakLevel,
      noteCount: notes.length,
      droppedNotes: 0,
    },
  };
}

/**
 * Full pipeline: AudioBuffer → notes + quantized score events.
 */
export async function transcribeBuffer(audioBuffer, options = {}) {
  const mono = bufferToMono(audioBuffer);
  const result = await analyzeMono(mono, audioBuffer.sampleRate, options);
  return {
    ...result,
    durationSec: audioBuffer.duration,
  };
}
