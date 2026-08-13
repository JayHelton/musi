/**
 * Development benchmark for detectPitch on 4096-sample windows.
 * Run: node tests/pitch/bench.mjs
 * Exit code is always 0.
 */

import { detectPitch } from '../../js/pitch.js';
import { midiFreq } from '../../js/audio.js';

const SAMPLE_RATE = 48000;
const WINDOW_SIZE = 4096;
const ITERATIONS = 50;
const NOTES = [
  { label: 'C2', midi: 36 },
  { label: 'C3', midi: 48 },
  { label: 'C4', midi: 60 },
  { label: 'C5', midi: 72 },
  { label: 'C6', midi: 84 },
];

function sineBuffer(freq) {
  const buf = new Float32Array(WINDOW_SIZE);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.45;
  }
  return buf;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function benchNote(label, buf) {
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    detectPitch(buf, SAMPLE_RATE, { minRms: 0.001, minClarity: 0.3 });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = percentile(times, 95);
  return { label, avg, p95 };
}

console.log(`detectPitch benchmark (${WINDOW_SIZE} samples @ ${SAMPLE_RATE} Hz, n=${ITERATIONS})`);
let anySlow = false;

for (const note of NOTES) {
  const buf = sineBuffer(midiFreq(note.midi));
  const { label, avg, p95 } = benchNote(note.label, buf);
  console.log(`${label}: avg ${avg.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`);
  if (avg > 10) anySlow = true;
}

if (anySlow) {
  console.log('');
  console.log('Note: average analysis exceeds 10 ms on this machine.');
  console.log('Measure before replacing MPM. Consider Worker offload (already used in capture).');
}

process.exit(0);
