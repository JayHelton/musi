import { audioCtx, analyserNode, ensureAudio } from './audio.js';

let canvas, ctx, animId;
let idlePhase = 0;
const BAR_COUNT = 64;

export function initVisualizer() {
  canvas = document.getElementById('visualizer-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
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

  if (hasAudio) {
    const data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);

    const hasSignal = data.some(v => v > 5);

    if (hasSignal) {
      drawBars(w, h, barW, data);
      return;
    }
  }

  drawIdleBars(w, h, barW);
}

function drawBars(w, h, barW, data) {
  const step = Math.floor(data.length / BAR_COUNT);
  ctx.fillStyle = '#b491ff';
  for (let i = 0; i < BAR_COUNT; i++) {
    const val = data[i * step] / 255;
    const barH = val * h * 0.7;
    const x = i * barW;
    ctx.globalAlpha = 0.4 + val * 0.6;
    ctx.fillRect(x + 1, h - barH, barW - 2, barH);
  }
  ctx.globalAlpha = 1;
}

function drawIdleBars(w, h, barW) {
  idlePhase += 0.015;
  ctx.fillStyle = '#b491ff';
  for (let i = 0; i < BAR_COUNT; i++) {
    const wave = Math.sin(idlePhase + i * 0.2) * 0.5 + 0.5;
    const wave2 = Math.sin(idlePhase * 0.7 + i * 0.15) * 0.3 + 0.3;
    const val = wave * 0.15 + wave2 * 0.1;
    const barH = val * h;
    const x = i * barW;
    ctx.globalAlpha = 0.3 + val;
    ctx.fillRect(x + 1, h - barH, barW - 2, barH);
  }
  ctx.globalAlpha = 1;
}

export function destroyVisualizer() {
  if (animId) cancelAnimationFrame(animId);
}
