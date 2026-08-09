// Self-contained DSP primitives for offline monophonic transcription.
// No DOM or Web Audio — safe to import from Node smoke tests and the browser.

const HANN_CACHE = new Map();
const DETECTOR_CACHE = new Map();

/**
 * Smallest power of two >= n.
 * @param {number} n
 * @returns {number}
 */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Build an in-place radix-2 Cooley–Tukey FFT with precomputed tables.
 * @param {number} size Power-of-two transform length.
 */
export function createFft(size) {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new RangeError('createFft: size must be a power of two >= 2');
  }

  const bits = Math.round(Math.log2(size));
  const rev = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) {
      if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    }
    rev[i] = r;
  }

  const twRe = new Float32Array(size / 2);
  const twIm = new Float32Array(size / 2);
  for (let k = 0; k < size / 2; k++) {
    const ang = (-2 * Math.PI * k) / size;
    twRe[k] = Math.cos(ang);
    twIm[k] = Math.sin(ang);
  }

  function permute(re, im) {
    for (let i = 0; i < size; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        const ti = im[i];
        re[i] = re[j];
        im[i] = im[j];
        re[j] = tr;
        im[j] = ti;
      }
    }
  }

  function butterfly(re, im, sign) {
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const wr = twRe[k];
          const wi = sign * twIm[k];
          const uRe = re[i + j];
          const uIm = im[i + j];
          const vRe = re[i + j + half] * wr - im[i + j + half] * wi;
          const vIm = re[i + j + half] * wi + im[i + j + half] * wr;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + half] = uRe - vRe;
          im[i + j + half] = uIm - vIm;
        }
      }
    }
  }

  return {
    size,
    forward(re, im) {
      permute(re, im);
      butterfly(re, im, 1);
    },
    inverse(re, im) {
      permute(re, im);
      butterfly(re, im, -1);
      const inv = 1 / size;
      for (let i = 0; i < size; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
    },
  };
}

/**
 * Cached Hann window of the given length.
 * @param {number} size
 * @returns {Float32Array}
 */
export function hannWindow(size) {
  let win = HANN_CACHE.get(size);
  if (!win) {
    win = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1 || 1)));
    }
    HANN_CACHE.set(size, win);
  }
  return win;
}

/**
 * Element-wise multiply: dst[i] = src[i] * win[i].
 * @param {Float32Array|Float64Array} dst
 * @param {Float32Array|Float64Array} src
 * @param {Float32Array} win
 */
export function applyWindow(dst, src, win) {
  for (let i = 0; i < win.length; i++) dst[i] = src[i] * win[i];
}

/**
 * Median of a numeric array.
 * @param {ArrayLike<number>} values
 * @returns {number}
 */
export function median(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Moving median filter; returns a new array the same length as the input.
 * @param {ArrayLike<number>} values
 * @param {number} radius Half-width in samples (window = 2*radius+1).
 * @returns {Float32Array}
 */
export function movingMedian(values, radius) {
  const n = values.length;
  const win = 2 * radius + 1;
  const out = new Float32Array(n);
  const buf = new Float32Array(win);
  for (let i = 0; i < n; i++) {
    const i1 = i;
    const i0 = Math.max(0, i1 - win + 1);
    let k = 0;
    for (let j = i0; j <= i1; j++) buf[k++] = values[j];
    const sorted = Array.from(buf.subarray(0, k)).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    out[i] = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return out;
}

/**
 * Divide by max absolute value in place; no-op when max is 0.
 * @param {Float32Array|Float64Array} arr
 * @returns {typeof arr}
 */
export function normalizeInPlace(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > max) max = a;
  }
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < arr.length; i++) arr[i] *= inv;
  }
  return arr;
}

/**
 * Subtract the mean in place.
 * @param {Float32Array|Float64Array} arr
 * @returns {typeof arr}
 */
export function removeDcInPlace(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  for (let i = 0; i < arr.length; i++) arr[i] -= mean;
  return arr;
}

function computeRms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function computeEnergyPrefix(buf, out) {
  let acc = 0;
  for (let i = 0; i < buf.length; i++) {
    acc += buf[i] * buf[i];
    out[i] = acc;
  }
}

/** Autocorrelation of a real signal via FFT (length = bufLen). */
function fftAutocorr(fft, buf, bufLen, fftSize, re, im, scratch) {
  for (let i = 0; i < bufLen; i++) re[i] = buf[i];
  for (let i = bufLen; i < fftSize; i++) re[i] = 0;
  im.fill(0);

  fft.forward(re, im);

  const half = fftSize >> 1;
  for (let k = 0; k <= half; k++) {
    const r = re[k];
    const ii = im[k];
    const p = r * r + ii * ii;
    re[k] = p;
    im[k] = 0;
  }
  for (let k = 1; k < half; k++) {
    re[fftSize - k] = re[k];
    im[fftSize - k] = 0;
  }

  fft.inverse(re, im);
  for (let tau = 0; tau < bufLen; tau++) scratch[tau] = re[tau];
}

function buildWindowAcf(win, fft, fftSize, re, im, acfOut) {
  const n = win.length;
  fftAutocorr(fft, win, n, fftSize, re, im, acfOut);
  // Normalise so acf[0] == 1 for stable division.
  const norm = acfOut[0] > 0 ? acfOut[0] : 1;
  for (let i = 0; i < n; i++) acfOut[i] /= norm;
}

function parabolicPeak(y0, y1, y2, x1) {
  const denom = y0 + y2 - 2 * y1;
  return denom !== 0 ? x1 - (0.5 * (y2 - y0)) / denom : x1;
}

function collectNsdfPeaks(nsdf, scanStart, maxLag) {
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
        peaks.push({ lag: lobeMaxLag, clarity: lobeMaxVal });
        if (lobeMaxVal > globalMax) globalMax = lobeMaxVal;
        inLobe = false;
      }
    }
  }
  if (inLobe && lobeMaxLag >= 0) {
    peaks.push({ lag: lobeMaxLag, clarity: lobeMaxVal });
    if (lobeMaxVal > globalMax) globalMax = lobeMaxVal;
  }

  return { peaks, globalMax };
}

/**
 * Fast McLeod pitch detector backed by FFT autocorrelation.
 * @param {{ windowSize: number, sampleRate: number, minFreq?: number, maxFreq?: number }} cfg
 */
export function createPitchDetector({ windowSize, sampleRate, minFreq = 55, maxFreq = 2000 }) {
  const fftSize = nextPow2(2 * windowSize);
  const fft = createFft(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const acf = new Float32Array(windowSize);
  const nsdf = new Float32Array(windowSize);
  const energyPrefix = new Float32Array(windowSize);
  const frameWin = new Float32Array(windowSize);
  const hann = hannWindow(windowSize);
  const winAcf = new Float32Array(windowSize);
  buildWindowAcf(hann, fft, fftSize, re, im, winAcf);

  /**
   * Analyse one frame and return pitch + candidate peaks.
   * @param {Float32Array} buf windowSize samples
   * @param {object} [opts]
   * @returns {{ freq: number, clarity: number, rms: number, candidates: Array<{freq:number, clarity:number}> }}
   */
  function detect(buf, opts = {}) {
    const minRms = opts.minRms ?? 0.012;
    const minClarity = opts.minClarity ?? 0.5;
    const minF = opts.minFreq ?? minFreq;
    const maxF = opts.maxFreq ?? maxFreq;
    const peakRatio = opts.peakRatio ?? 0.9;
    const useWindow = opts.window !== false;

    const rms = computeRms(buf);
    if (rms < minRms) return { freq: -1, clarity: 0, rms, candidates: [] };

    const maxLag = Math.min(windowSize - 1, Math.floor(sampleRate / minF));
    const minLag = Math.max(2, Math.floor(sampleRate / maxF));
    if (maxLag <= minLag) return { freq: -1, clarity: 0, rms, candidates: [] };

    let analysis;
    let energySrc;
    if (useWindow) {
      applyWindow(frameWin, buf, hann);
      analysis = frameWin;
      energySrc = frameWin;
    } else {
      analysis = buf;
      energySrc = buf;
    }

    fftAutocorr(fft, analysis, windowSize, fftSize, re, im, acf);

    computeEnergyPrefix(energySrc, energyPrefix);
    const totalEnergy = energyPrefix[windowSize - 1];

    for (let tau = 0; tau <= maxLag; tau++) {
      const sumFirst = energyPrefix[windowSize - 1 - tau];
      const sumSecond = totalEnergy - (tau > 0 ? energyPrefix[tau - 1] : 0);
      const m = sumFirst + sumSecond;
      nsdf[tau] = m > 0 ? (2 * acf[tau]) / m : 0;
    }

    let firstNeg = -1;
    for (let tau = 1; tau <= maxLag; tau++) {
      if (nsdf[tau] < 0) {
        firstNeg = tau;
        break;
      }
    }
    if (firstNeg < 0) return { freq: -1, clarity: 0, rms, candidates: [] };

    const scanStart = Math.max(minLag, firstNeg + 1);
    const { peaks, globalMax } = collectNsdfPeaks(nsdf, scanStart, maxLag);
    if (!peaks.length || globalMax <= 0) return { freq: -1, clarity: 0, rms, candidates: [] };

    peaks.sort((a, b) => a.lag - b.lag);
    const candidates = peaks.slice(0, 6).map((p) => ({
      freq: sampleRate / p.lag,
      clarity: p.clarity,
    }));

    const threshold = peakRatio * globalMax;
    const qualifying = peaks.filter((p) => p.clarity >= threshold);
    let chosen;
    if (qualifying.length) {
      qualifying.sort((a, b) => b.clarity - a.clarity || a.lag - b.lag);
      let best = qualifying[0];
      for (const p of qualifying) {
        if (p.clarity > best.clarity * 1.08) best = p;
      }
      const close = qualifying.filter((p) => p.clarity >= best.clarity * 0.92);
      const preferHigh = close.some((p) => sampleRate / p.lag > 700);
      chosen = close.reduce((a, b) => {
        if (preferHigh) return a.lag < b.lag ? a : b;
        return a.clarity >= b.clarity ? a : b;
      });
    } else {
      chosen = peaks[0];
    }

    if (chosen.clarity < minClarity) {
      return { freq: -1, clarity: chosen.clarity, rms, candidates };
    }

    let lag = chosen.lag;

    // Hann taper shifts ACF peaks to shorter lags; compensate r(tau) by the window
    // self-correlation and refine the chosen lag locally. Full-frame compensated
    // NSDF can favour sub-harmonics, so only the lag is corrected here.
    if (useWindow) {
      const MIN_WIN_CORR = 0.05;
      const radius = Math.max(8, Math.ceil(sampleRate / minF / 32));
      const lo = Math.max(scanStart, lag - radius);
      const hi = Math.min(maxLag, lag + radius);
      let bestLag = lag;
      let bestAcf = -Infinity;
      for (let tau = lo; tau <= hi; tau++) {
        const corr = Math.max(winAcf[tau], MIN_WIN_CORR);
        const corrected = acf[tau] / corr;
        if (corrected > bestAcf) {
          bestAcf = corrected;
          bestLag = tau;
        }
      }
      lag = bestLag;
    }

    let betterLag;
    if (useWindow && lag > 0 && lag < maxLag) {
      const c0 = Math.max(winAcf[lag - 1], 0.05);
      const c1 = Math.max(winAcf[lag], 0.05);
      const c2 = Math.max(winAcf[lag + 1], 0.05);
      betterLag = parabolicPeak(acf[lag - 1] / c0, acf[lag] / c1, acf[lag + 1] / c2, lag);
    } else if (lag > 0 && lag < maxLag) {
      betterLag = parabolicPeak(nsdf[lag - 1], nsdf[lag], nsdf[lag + 1], lag);
    } else {
      betterLag = lag;
    }

    const freq = sampleRate / betterLag;
    if (!Number.isFinite(freq) || freq < minF || freq > maxF) {
      return { freq: -1, clarity: chosen.clarity, rms, candidates };
    }

    return { freq, clarity: chosen.clarity, rms, candidates };
  }

  return { windowSize, sampleRate, detect };
}

/**
 * One-shot pitch detection; reuses cached detectors keyed by buffer length + rate.
 * @param {Float32Array} buf
 * @param {number} sampleRate
 * @param {object} [opts]
 */
export function detectPitchFast(buf, sampleRate, opts = {}) {
  const key = `${buf.length}:${sampleRate}`;
  let det = DETECTOR_CACHE.get(key);
  if (!det) {
    det = createPitchDetector({ windowSize: buf.length, sampleRate });
    DETECTOR_CACHE.set(key, det);
  }
  return det.detect(buf, opts);
}

/**
 * Half-wave-rectified log spectral-flux onset envelope via STFT.
 * @param {Float32Array} mono
 * @param {number} sampleRate
 * @param {object} [opts]
 */
export function computeOnsetEnvelope(mono, sampleRate, opts = {}) {
  let fftSize = opts.fftSize ?? 1024;
  let hopSize = opts.hopSize ?? 256;
  const maxFreq = opts.maxFreq ?? 8000;
  const gamma = 20;

  hopSize = Math.max(1, Math.min(hopSize, Math.floor(fftSize / 2)));
  const frameCount = Math.max(0, Math.floor((mono.length - fftSize) / hopSize) + 1);
  const envelope = new Float32Array(frameCount);
  const times = new Float32Array(frameCount);
  const hopSec = hopSize / sampleRate;
  const frameRate = sampleRate / hopSize;

  if (frameCount === 0) {
    return { envelope, times, hopSec, frameRate, fftSize, hopSize };
  }

  const fft = createFft(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const frame = new Float32Array(fftSize);
  const win = hannWindow(fftSize);
  const mag = new Float32Array((fftSize >> 1) + 1);
  const logMag = new Float32Array(mag.length);
  const prevLogMag = new Float32Array(mag.length);
  let prevFrameEnergy = 0;

  const maxBin = Math.min(mag.length - 1, Math.floor((maxFreq * fftSize) / sampleRate));
  const minFreqBin = opts.minFreqBin ?? 1;
  const binStart = Math.max(1, minFreqBin);

  for (let fi = 0; fi < frameCount; fi++) {
    const offset = fi * hopSize;
    times[fi] = offset / sampleRate;
    applyWindow(frame, mono.subarray(offset, offset + fftSize), win);

    re.set(frame);
    im.fill(0);
    fft.forward(re, im);

    for (let k = 0; k < mag.length; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      logMag[k] = Math.log(1 + gamma * mag[k]);
    }

    let flux = 0;
    let frameEnergy = 0;
    for (let k = binStart; k <= maxBin; k++) {
      frameEnergy += mag[k] * mag[k];
      const d = logMag[k] - prevLogMag[k];
      if (d > 0) flux += d;
    }
    // Gate flux to frames where broadband energy rises (attack, not offset).
    if (frameEnergy <= prevFrameEnergy) flux = 0;
    prevFrameEnergy = frameEnergy;
    envelope[fi] = flux;
    prevLogMag.set(logMag);
  }

  // Light smoothing before normalisation (reduces double-peaks from offset flux).
  if (frameCount >= 5) {
    const tmp = envelope.slice();
    for (let i = 2; i < frameCount - 2; i++) {
      envelope[i] = (tmp[i - 2] + tmp[i - 1] + tmp[i] + tmp[i + 1] + tmp[i + 2]) / 5;
    }
    for (let i = 1; i < frameCount - 1; i++) {
      if (i < 2 || i >= frameCount - 2) {
        envelope[i] = (tmp[i - 1] + tmp[i] + tmp[i + 1]) / 3;
      }
    }
  } else if (frameCount >= 3) {
    const tmp = envelope.slice();
    for (let i = 1; i < frameCount - 1; i++) {
      envelope[i] = (tmp[i - 1] + tmp[i] + tmp[i + 1]) / 3;
    }
  }

  normalizeInPlace(envelope);
  return { envelope, times, hopSec, frameRate, fftSize, hopSize };
}

/**
 * Adaptive-threshold onset peak picker (Dixon 2006 style).
 * @param {Float32Array} envelope Normalised onset strength per frame.
 * @param {number} hopSec Seconds between frames.
 * @param {object} [opts]
 * @returns {Array<{ time: number, strength: number }>}
 */
export function pickOnsets(envelope, hopSec, opts = {}) {
  const delta = opts.delta ?? 0.06;
  const preMax = opts.preMax ?? 3;
  const postMax = opts.postMax ?? 3;
  const preAvg = opts.preAvg ?? 12;
  const postAvg = opts.postAvg ?? 6;
  const minSepSec = opts.minSepSec ?? 0.045;

  const n = envelope.length;
  const onsets = [];
  let lastTime = -Infinity;

  for (let i = 0; i < n; i++) {
    const v = envelope[i];

    // Prefer attack transients over offset flux (rising edge only).
    if (i > 0 && v <= envelope[i - 1]) continue;

    let isLocalMax = true;
    for (let j = Math.max(0, i - preMax); j <= Math.min(n - 1, i + postMax); j++) {
      if (envelope[j] > v) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    let sum = 0;
    let count = 0;
    const avgStart = Math.max(0, i - preAvg);
    const avgEnd = Math.min(n - 1, i + postAvg);
    for (let j = avgStart; j <= avgEnd; j++) {
      if (j !== i) {
        sum += envelope[j];
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    if (v < mean + delta) continue;

    const time = i * hopSec;
    if (time - lastTime < minSepSec) continue;

    onsets.push({ time, strength: v });
    lastTime = time;
  }

  // Collapse closely spaced peaks (attack + offset flux) — keep the earlier one.
  if (onsets.length > 1) {
    const merged = [onsets[0]];
    for (let i = 1; i < onsets.length; i++) {
      const prev = merged[merged.length - 1];
      if (onsets[i].time - prev.time < minSepSec * 2) {
        if (onsets[i].strength > prev.strength * 1.25) merged[merged.length - 1] = onsets[i];
      } else {
        merged.push(onsets[i]);
      }
    }
    return merged;
  }

  return onsets;
}

/**
 * Tempo hypotheses from an onset envelope via lag autocorrelation + log-normal prior.
 * @param {Float32Array} envelope
 * @param {number} hopSec
 * @param {object} [opts]
 * @returns {Array<{ bpm: number, strength: number }>}
 */
export function tempoCandidatesFromEnvelope(envelope, hopSec, opts = {}) {
  const minBpm = opts.minBpm ?? 40;
  const maxBpm = opts.maxBpm ?? 240;
  const priorBpm = opts.priorBpm ?? 120;
  const priorWidth = opts.priorWidth ?? 0.9;

  const n = envelope.length;
  if (n < 4 || hopSec <= 0) return [];

  const work = Float32Array.from(envelope);
  removeDcInPlace(work);

  const minLag = Math.max(1, Math.floor((60 / maxBpm) / hopSec));
  const maxLag = Math.min(n - 2, Math.ceil((60 / minBpm) / hopSec));
  if (maxLag <= minLag) return [];

  const ac = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let norm = 0;
    for (let i = 0; i + lag < n; i++) {
      sum += work[i] * work[i + lag];
      norm++;
    }
    ac[lag] = norm > 0 ? sum / norm : 0;
  }

  const logPriorCenter = Math.log2(priorBpm);
  const weighted = new Float32Array(maxLag + 1);
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSec);
    const logDiff = Math.log2(bpm) - logPriorCenter;
    const prior = Math.exp(-0.5 * (logDiff / priorWidth) ** 2);
    const w = ac[lag] * prior;
    weighted[lag] = w;
    if (w > best) best = w;
  }

  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const v = weighted[lag];
    if (v > weighted[lag - 1] && v >= weighted[lag + 1] && v > 0) {
      const betterLag = parabolicPeak(weighted[lag - 1], v, weighted[lag + 1], lag);
      const bpm = 60 / (betterLag * hopSec);
      peaks.push({ lag: betterLag, bpm, strength: v });
    }
  }

  peaks.sort((a, b) => b.strength - a.strength);

  const out = [];
  const seen = new Set();
  for (const p of peaks) {
    const rounded = Math.round(p.bpm);
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    out.push({ bpm: p.bpm, strength: p.strength });
    if (out.length >= 8) break;
  }

  return out;
}
