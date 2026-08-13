import { midiFreq } from './audio.js';
import { NOTE_NAMES_SHARP } from './theory.js';

// Shared pitch-detection utilities for the mic-driven tools (vocal trainer and
// recorder). The goal here is to confidently lock onto a sung/played pitch and
// reject background noise, instead of flickering between notes on tiny
// variations.
//
// Two layers are provided:
//   1. `detectPitch` - a single-frame estimator built on the McLeod Pitch
//      Method (Normalized Square Difference Function). It returns a `clarity`
//      score in 0..1 that quantifies how tonal/periodic the frame is, which is
//      a far better noise gate than raw RMS alone.
//   2. `createPitchTracker` - a stateful smoother that applies confidence
//      gating, median filtering, and note hysteresis so the reported note stays
//      stable while a voice wavers around a pitch.

// Detect the fundamental frequency of a time-domain buffer.
//
// Returns `{ freq, clarity, rms }`. `freq` is -1 when no confident pitch was
// found. `clarity` is the NSDF peak height (0..1): clean tonal input lands near
// 0.9+, while noise/breath sits low.
export function detectPitch(buf, sampleRate, opts = {}) {
  const minRms = opts.minRms ?? 0.012;
  const minClarity = opts.minClarity ?? 0.5;
  const minFreq = opts.minFreq ?? 55;
  const maxFreq = opts.maxFreq ?? 2000;
  // Fraction of the strongest NSDF peak used to choose the *first* strong peak
  // (the fundamental) rather than a louder harmonic. Standard MPM uses ~0.9.
  const peakRatio = opts.peakRatio ?? 0.9;

  const size = buf.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < minRms) return { freq: -1, clarity: 0, rms };

  const maxLag = Math.min(size - 1, Math.floor(sampleRate / minFreq));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (maxLag <= minLag) return { freq: -1, clarity: 0, rms };

  // Normalized Square Difference Function via autocorrelation + running energy.
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i + tau < size; i++) {
      const a = buf[i];
      const b = buf[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Skip the main lobe at tau=0 by starting only after the NSDF first dips
  // below zero. Without this, low notes (whose main lobe is wide) yield a
  // spurious high-frequency peak near tau=0.
  let firstNeg = -1;
  for (let tau = 1; tau <= maxLag; tau++) {
    if (nsdf[tau] < 0) { firstNeg = tau; break; }
  }
  if (firstNeg < 0) return { freq: -1, clarity: 0, rms };
  const scanStart = Math.max(minLag, firstNeg + 1);

  // Collect the maximum within each positive "lobe" between zero crossings.
  let globalMax = 0;
  const peaks = [];
  let inLobe = false;
  let lobeMaxLag = -1;
  let lobeMaxVal = -Infinity;
  for (let tau = scanStart; tau <= maxLag; tau++) {
    const v = nsdf[tau];
    if (!inLobe) {
      if (v > 0) {
        inLobe = true;
        lobeMaxLag = tau;
        lobeMaxVal = v;
      }
    } else {
      if (v > lobeMaxVal) {
        lobeMaxVal = v;
        lobeMaxLag = tau;
      }
      if (v <= 0) {
        peaks.push([lobeMaxLag, lobeMaxVal]);
        if (lobeMaxVal > globalMax) globalMax = lobeMaxVal;
        inLobe = false;
      }
    }
  }
  if (inLobe && lobeMaxLag >= 0) {
    peaks.push([lobeMaxLag, lobeMaxVal]);
    if (lobeMaxVal > globalMax) globalMax = lobeMaxVal;
  }
  if (!peaks.length || globalMax <= 0) return { freq: -1, clarity: 0, rms };

  // Pick the first peak that clears the relative threshold: this favours the
  // true fundamental over stronger upper-harmonic peaks.
  const threshold = peakRatio * globalMax;
  let chosenLag = peaks[0][0];
  let chosenVal = peaks[0][1];
  for (const [lag, val] of peaks) {
    if (val >= threshold) {
      chosenLag = lag;
      chosenVal = val;
      break;
    }
  }

  if (chosenVal < minClarity) return { freq: -1, clarity: chosenVal, rms };

  // Parabolic interpolation around the chosen lag for sub-sample accuracy.
  const x0 = nsdf[chosenLag - 1];
  const x1 = nsdf[chosenLag];
  const x2 = nsdf[chosenLag + 1];
  const denom = x0 + x2 - 2 * x1;
  const betterLag = denom !== 0 ? chosenLag - (0.5 * (x2 - x0)) / denom : chosenLag;

  const freq = sampleRate / betterLag;
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) {
    return { freq: -1, clarity: chosenVal, rms };
  }
  return { freq, clarity: chosenVal, rms };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function freqToMidiFloat(freq) {
  return 12 * Math.log2(freq / 440) + 69;
}

function centsBetween(freq, midi) {
  return 1200 * Math.log2(freq / midiFreq(midi));
}

function infoForMidi(midi, freq) {
  const cents = Math.max(-50, Math.min(50, Math.round(centsBetween(freq, midi))));
  const name = NOTE_NAMES_SHARP[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return { midi, name, oct, cents, freq };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Median smoothing and note hysteresis without running MPM. Used by the main
// thread when pitch detection runs in a Worker.
export function createPitchSmoother(opts = {}) {
  const medianSize = opts.medianSize ?? 5;
  const hysteresisCents = opts.hysteresisCents ?? 18;
  const switchFrames = opts.switchFrames ?? 2;
  const releaseFrames = opts.releaseFrames ?? 5;

  let freqs = [];
  let heldMidi = null;
  let candidateMidi = null;
  let candidateCount = 0;
  let silence = 0;
  let lastInfo = null;

  function reset() {
    freqs = [];
    heldMidi = null;
    candidateMidi = null;
    candidateCount = 0;
    silence = 0;
    lastInfo = null;
  }

  function voicedResult(smooth, clarity, rms) {
    lastInfo = infoForMidi(heldMidi, smooth);
    return {
      freq: smooth,
      frequencyHz: smooth,
      displayFrequencyHz: smooth,
      voiced: true,
      clarity,
      rms,
      info: lastInfo,
      noteInfo: lastInfo,
    };
  }

  function unvoicedResult(clarity, rms) {
    silence++;
    candidateMidi = null;
    candidateCount = 0;
    if (silence >= releaseFrames) {
      reset();
      return {
        freq: -1,
        frequencyHz: -1,
        displayFrequencyHz: -1,
        voiced: false,
        clarity,
        rms,
        info: null,
        noteInfo: null,
      };
    }
    const heldFreq = lastInfo ? lastInfo.freq : -1;
    return {
      freq: heldFreq,
      frequencyHz: -1,
      displayFrequencyHz: heldFreq,
      voiced: false,
      clarity,
      rms,
      info: lastInfo,
      noteInfo: lastInfo,
    };
  }

  function acceptFrequency(freq, clarity, rms) {
    if (freq <= 0) return unvoicedResult(clarity, rms);

    silence = 0;
    freqs.push(freq);
    if (freqs.length > medianSize) freqs.shift();
    const smooth = median(freqs);

    if (heldMidi === null) {
      heldMidi = Math.round(freqToMidiFloat(smooth));
    } else {
      const drift = centsBetween(smooth, heldMidi);
      if (Math.abs(drift) > 50 + hysteresisCents) {
        const target = Math.round(freqToMidiFloat(smooth));
        if (target !== heldMidi) {
          if (candidateMidi === target) {
            candidateCount++;
          } else {
            candidateMidi = target;
            candidateCount = 1;
          }
          if (candidateCount >= switchFrames) {
            heldMidi = target;
            candidateMidi = null;
            candidateCount = 0;
          }
        } else {
          candidateMidi = null;
          candidateCount = 0;
        }
      } else {
        candidateMidi = null;
        candidateCount = 0;
      }
    }

    return voicedResult(smooth, clarity, rms);
  }

  function ingest({ freq, clarity, rms }) {
    return acceptFrequency(freq, clarity, rms);
  }

  return { ingest, reset };
}

// Measure ambient RMS for ~300 ms, then raise the active gate above that floor.
export function createAdaptiveNoiseFloor(baseMinRms = 0.003) {
  const COLLECT_MS = 300;
  let collecting = false;
  let collectStartMs = 0;
  let rmsSamples = [];
  let activeMinRms = baseMinRms;

  function startCollection() {
    collecting = true;
    collectStartMs = typeof performance !== 'undefined' ? performance.now() : 0;
    rmsSamples = [];
  }

  function finishIfReady() {
    if (!collecting) return;
    const now = typeof performance !== 'undefined' ? performance.now() : collectStartMs + COLLECT_MS;
    if (now - collectStartMs < COLLECT_MS) return;
    const floor = rmsSamples.length ? median(rmsSamples) : 0;
    activeMinRms = clamp(Math.max(baseMinRms, floor * 2.5), 0.002, 0.04);
    collecting = false;
  }

  function ingest(rms) {
    if (collecting && typeof rms === 'number' && Number.isFinite(rms)) {
      rmsSamples.push(rms);
      finishIfReady();
    }
    return activeMinRms;
  }

  function getMinRms() {
    finishIfReady();
    return activeMinRms;
  }

  function setBaseMinRms(next) {
    activeMinRms = next;
  }

  return { startCollection, ingest, getMinRms, setBaseMinRms };
}

// Build a stateful tracker that turns the per-frame `detectPitch` output into a
// stable note reading. It:
//   - requires a minimum clarity/RMS before accepting a frame (noise gate),
//   - median-filters recent frequencies to kill octave jumps and jitter,
//   - holds the displayed note via cents hysteresis so small wavers near a
//     semitone boundary don't cause the note to flip back and forth,
//   - tolerates brief dropouts before declaring silence.
export function createPitchTracker(opts = {}) {
  const sampleRate = opts.sampleRate || 48000;
  const minClarity = opts.minClarity ?? 0.6;
  let minRms = opts.minRms ?? 0.012;
  const minFreq = opts.minFreq ?? 55;
  const maxFreq = opts.maxFreq ?? 2000;

  const smoother = createPitchSmoother(opts);

  function reset() {
    smoother.reset();
  }

  function setMinRms(next) {
    minRms = next;
  }

  function process(buf) {
    const res = detectPitch(buf, sampleRate, { minClarity, minRms, minFreq, maxFreq });
    return smoother.ingest(res);
  }

  return { process, reset, setMinRms };
}
