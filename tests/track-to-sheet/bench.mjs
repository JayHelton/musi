// Throughput sanity check for the offline transcription pipeline.
// Not part of the accuracy suite — run manually:
//   node tests/track-to-sheet/bench.mjs
import { analyzeMono } from '../../js/trackToSheet/transcribe.js';

const SR = 44100;

function synth(seconds, bpm) {
  const beatSec = 60 / bpm;
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  let i = 0;
  for (let t = 0; t + beatSec * 0.5 < seconds; t += beatSec * 0.5, i++) {
    const midi = scale[i % scale.length];
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const i0 = Math.floor(t * SR);
    const i1 = Math.min(n, Math.floor((t + beatSec * 0.42) * SR));
    for (let k = i0; k < i1; k++) {
      const dt = (k - i0) / SR;
      const env = Math.min(1, dt * 60, (beatSec * 0.42 - dt) * 60);
      out[k] += 0.35 * Math.max(0, env)
        * (Math.sin(2 * Math.PI * f * dt) + 0.4 * Math.sin(4 * Math.PI * f * dt));
    }
  }
  return out;
}

for (const seconds of [5, 15, 30, 60]) {
  const mono = synth(seconds, 110);
  const t0 = Date.now();
  const res = await analyzeMono(mono, SR, { preset: 'balanced' });
  const ms = Date.now() - t0;
  console.log(
    `${String(seconds).padStart(3)}s audio → ${String(ms).padStart(6)} ms`
    + ` (${(ms / seconds / 1000).toFixed(2)}x realtime)`
    + ` · ${res.notes.length} notes · ${res.bpm} bpm · grid ${res.grid.label}`,
  );
}
