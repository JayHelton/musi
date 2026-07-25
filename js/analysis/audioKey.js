// Offline key / tonal-center analysis for decoded AudioBuffers.
//
// Walks a mono mix of the buffer with the shared McLeod pitch detector, builds
// a 12-bin pitch-class histogram weighted by clarity × RMS, then hands the
// profile to tonalCenterReport (Krumhansl-Schmuckler + chromatic layer).
//
// Used by Song Sections so uploaded tracks (and trimmed loops) can be analysed
// without a live microphone session.

import { detectPitch } from '../pitch.js';
import { noteFromFreq } from '../theory.js';
import { tonalCenterReport, keyLabel } from './keyDetect.js';

function mixToMono(buffer) {
  const n = buffer.length;
  const ch = buffer.numberOfChannels;
  if (ch === 1) return buffer.getChannelData(0);
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / ch;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

function sliceFrame(src, start, size) {
  const frame = new Float32Array(size);
  const end = Math.min(src.length, start + size);
  const count = Math.max(0, end - start);
  if (count > 0) frame.set(src.subarray(start, start + count));
  return frame;
}

/**
 * Analyse a time range of an AudioBuffer for key / tonal center.
 *
 * @param {AudioBuffer} buffer
 * @param {{
 *   startSec?: number,
 *   endSec?: number,
 *   frameSize?: number,
 *   hopSec?: number,
 *   minClarity?: number,
 *   onProgress?: (frac:number) => void,
 * }} [opts]
 * @returns {Promise<{
 *   weights: Float32Array,
 *   report: ReturnType<typeof tonalCenterReport>,
 *   pitchedFrames: number,
 *   durationSec: number,
 *   label: string,
 * }>}
 */
export async function analyzeAudioKey(buffer, opts = {}) {
  const sampleRate = buffer.sampleRate;
  const startSec = Math.max(0, opts.startSec ?? 0);
  const endSec = Math.min(buffer.duration, opts.endSec ?? buffer.duration);
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.max(startSample + 1, Math.floor(endSec * sampleRate));
  const frameSize = opts.frameSize ?? 2048;
  const hop = Math.max(256, Math.floor((opts.hopSec ?? 0.046) * sampleRate));
  const minClarity = opts.minClarity ?? 0.55;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  const mono = mixToMono(buffer);
  const weights = new Float32Array(12);
  let pitchedFrames = 0;
  let processed = 0;
  const span = Math.max(1, endSample - startSample);

  for (let i = startSample; i + frameSize <= endSample; i += hop) {
    const frame = sliceFrame(mono, i, frameSize);
    const { freq, clarity, rms } = detectPitch(frame, sampleRate, {
      minClarity,
      minRms: 0.01,
      minFreq: 55,
      maxFreq: 2000,
    });
    if (freq > 0 && clarity >= minClarity) {
      const info = noteFromFreq(freq);
      const pc = ((info.midi % 12) + 12) % 12;
      // Weight by how tonal and how loud the frame is so quiet noise does not
      // drag the histogram around.
      weights[pc] += clarity * Math.min(1, rms * 8);
      pitchedFrames++;
    }
    processed += hop;
    if (onProgress && (processed % (hop * 40) < hop)) {
      onProgress(Math.min(1, processed / span));
      // Yield so the UI can paint while long tracks analyse.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(1);

  const report = tonalCenterReport(weights);
  return {
    weights,
    report,
    pitchedFrames,
    durationSec: Math.max(0, endSec - startSec),
    label: report.descriptor || keyLabel(report.best),
  };
}

/** Compact, serialisable summary for persistence. */
export function summarizeKeyAnalysis(result) {
  if (!result || !result.report) return null;
  const r = result.report;
  return {
    descriptor: r.descriptor,
    confidence: r.confidence,
    chromaticism: r.chromaticism,
    isChromatic: r.isChromatic,
    tonicPc: r.tonicPc,
    best: r.best ? { tonic: r.best.tonic, mode: r.best.mode, r: r.best.r, label: r.best.label } : null,
    candidates: (r.candidates || []).slice(0, 3).map((c) => ({
      tonic: c.tonic, mode: c.mode, r: c.r, label: c.label,
    })),
    pitchedFrames: result.pitchedFrames,
    durationSec: result.durationSec,
  };
}
