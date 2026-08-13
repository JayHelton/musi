import { midiFreq } from '../../js/audio.js';

export function samplesForTone({ fps, durationMs, centsOff, targetMidi = 69, clarity = 0.9, rms = 0.1, startMs = 0 }) {
  const frameMs = 1000 / fps;
  const count = Math.ceil(durationMs / frameMs);
  const baseFreq = midiFreq(targetMidi) * Math.pow(2, centsOff / 1200);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const timestampMs = startMs + i * frameMs;
    samples.push({
      timestampMs,
      frequencyHz: baseFreq,
      centsFromTarget: centsOff,
      clarity,
      rms,
      voiced: true,
    });
  }
  return samples;
}

export function heldDisplaySilence({ fps, durationMs, frequencyHz, centsOff = 0, clarity = 0.05, rms = 0.005, startMs = 0 }) {
  const frameMs = 1000 / fps;
  const count = Math.ceil(durationMs / frameMs);
  const samples = [];
  for (let i = 0; i < count; i++) {
    samples.push({
      timestampMs: startMs + i * frameMs,
      frequencyHz,
      centsFromTarget: centsOff,
      clarity,
      rms,
      voiced: false,
    });
  }
  return samples;
}
