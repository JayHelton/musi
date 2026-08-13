import { detectPitch } from './pitch.js';

self.onmessage = (e) => {
  const {
    buf,
    sampleRate,
    audioTime,
    minRms,
    minClarity,
    minFreq,
    maxFreq,
    seq,
  } = e.data;

  const t0 = performance.now();
  const res = detectPitch(buf, sampleRate, {
    minRms,
    minClarity,
    minFreq,
    maxFreq,
  });
  const analysisMs = performance.now() - t0;

  self.postMessage({
    seq,
    freq: res.freq,
    clarity: res.clarity,
    rms: res.rms,
    audioTime,
    analysisMs,
  });
};
