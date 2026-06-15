import { audioCtx, analyserNode, ensureAudio } from './audio.js';

let canvas, ctx, animId;
let idlePhase = 0;
const BAR_COUNT = 64;
const smoothed = new Float32Array(BAR_COUNT);
const DECAY = 0.88;
const RISE = 0.35;
let silentFrames = 0;
const IDLE_THRESHOLD = 30;

export function initVisualizer() {
  canvas = document.getElementById('visualizer-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  smoothed.fill(0);
  silentFrames = IDLE_THRESHOLD;
  resize();
  window.addEventListener('resize', resize);
  draw();
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function draw() {
  if (!canvas || !ctx) return;
  animId = requestAnimationFrame(draw);

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const barW = w / BAR_COUNT;
  const hasAudio = analyserNode && audioCtx && audioCtx.state === 'running';

  let data = null;
  let hasSignal = false;
  if (hasAudio) {
    data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    hasSignal = data.some(v => v > 5);
  }

  if (hasSignal) {
    silentFrames = 0;
    const step = Math.floor(data.length / BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      const raw = data[i * step] / 255;
      if (raw > smoothed[i]) {
        smoothed[i] += (raw - smoothed[i]) * RISE;
      } else {
        smoothed[i] *= DECAY;
      }
      if (smoothed[i] < 0.002) smoothed[i] = 0;
    }
    drawBars(w, h, barW);
  } else {
    silentFrames++;
    const blend = Math.min(silentFrames / IDLE_THRESHOLD, 1);
    for (let i = 0; i < BAR_COUNT; i++) {
      smoothed[i] *= DECAY;
      if (smoothed[i] < 0.002) smoothed[i] = 0;
    }
    const anyLeft = smoothed.some(v => v > 0.003);
    if (anyLeft && blend < 1) {
      drawBars(w, h, barW);
    }
    if (blend > 0) {
      drawIdleWave(w, h, blend);
    }
  }
}

function drawBars(w, h, barW) {
  ctx.fillStyle = '#ff6b35';
  for (let i = 0; i < BAR_COUNT; i++) {
    const val = smoothed[i];
    if (val < 0.003) continue;
    const barH = val * h * 0.65;
    const x = i * barW;
    ctx.globalAlpha = 0.3 + val * 0.7;
    ctx.fillRect(x + 1, h - barH, barW - 2, barH);
  }
  ctx.globalAlpha = 1;
}

// Gentle, smooth flowing sound-wave drawn when no tones are playing.
const IDLE_WAVE_LAYERS = [
  { amp: 0.05, freq: 1.4, speed: 0.6, drift: 0.4, alpha: 0.55, width: 2.2 },
  { amp: 0.035, freq: 2.1, speed: -0.9, drift: 0.7, alpha: 0.4, width: 1.6 },
  { amp: 0.025, freq: 3.0, speed: 1.3, drift: 1.1, alpha: 0.28, width: 1.2 },
];
const IDLE_WAVE_STEP = 6;

function drawIdleWave(w, h, blend) {
  idlePhase += 0.01;
  const mid = h * 0.5;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ff6b35';

  for (const layer of IDLE_WAVE_LAYERS) {
    const phase = idlePhase * layer.speed;
    const amp = layer.amp * h;
    ctx.beginPath();
    for (let x = 0; x <= w; x += IDLE_WAVE_STEP) {
      const t = x / w;
      // Envelope tapers the wave toward the screen edges so it fades in gently.
      const envelope = Math.sin(t * Math.PI);
      const y =
        mid +
        envelope *
          (Math.sin(t * Math.PI * 2 * layer.freq + phase) * amp +
            Math.sin(t * Math.PI * 2 * layer.drift + phase * 0.5) * amp * 0.4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = layer.alpha * blend;
    ctx.lineWidth = layer.width;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function destroyVisualizer() {
  if (animId) cancelAnimationFrame(animId);
}
