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
      drawIdleBars(w, h, barW, blend);
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

function drawIdleBars(w, h, barW, blend) {
  idlePhase += 0.012;
  ctx.fillStyle = '#ff6b35';
  for (let i = 0; i < BAR_COUNT; i++) {
    const wave = Math.sin(idlePhase + i * 0.2) * 0.5 + 0.5;
    const wave2 = Math.sin(idlePhase * 0.7 + i * 0.15) * 0.3 + 0.3;
    const val = (wave * 0.08 + wave2 * 0.05) * blend;
    const barH = val * h;
    const x = i * barW;
    ctx.globalAlpha = (0.15 + val * 0.5) * blend;
    ctx.fillRect(x + 1, h - barH, barW - 2, barH);
  }
  ctx.globalAlpha = 1;
}

export function destroyVisualizer() {
  if (animId) cancelAnimationFrame(animId);
}
