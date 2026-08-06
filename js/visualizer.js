import { audioCtx, analyserNode, ensureAudio } from './audio.js';
import { metro } from './metronome.js';

let canvas, ctx, animId;
let idlePhase = 0;
let pulseEnergy = 0;
let beatFlashX = 0.5;
const BAR_COUNT = 64;
const smoothed = new Float32Array(BAR_COUNT);
const DECAY = 0.88;
const RISE = 0.35;
let silentFrames = 0;
const IDLE_THRESHOLD = 30;
const PULSE_DECAY = 0.93;
const PULSE_BOOST = 0.55;
const WAVE_STEP = 5;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let onMetroBeat = null;
let onResize = null;

export function initVisualizer() {
  canvas = document.getElementById('visualizer-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  smoothed.fill(0);
  silentFrames = IDLE_THRESHOLD;
  pulseEnergy = 0;
  resize();
  onResize = resize;
  window.addEventListener('resize', onResize);
  onMetroBeat = (e) => {
    const accented = e.detail?.accented;
    pulseEnergy = accented ? 1.0 : 0.65;
    beatFlashX = 0.35 + Math.random() * 0.3;
  };
  window.addEventListener('musi:metro-beat', onMetroBeat);
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
  const motionOk = !reducedMotion.matches;
  const metroActive = metro.playing;

  if (motionOk) {
    pulseEnergy *= PULSE_DECAY;
    if (pulseEnergy < 0.002) pulseEnergy = 0;
  }

  let data = null;
  let hasSignal = false;
  if (hasAudio) {
    data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    hasSignal = data.some(v => v > 5);
  }

  if (hasSignal && !metroActive) {
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
    const blend = metroActive ? 1 : Math.min(silentFrames / IDLE_THRESHOLD, 1);
    for (let i = 0; i < BAR_COUNT; i++) {
      smoothed[i] *= DECAY;
      if (smoothed[i] < 0.002) smoothed[i] = 0;
    }
    const anyLeft = smoothed.some(v => v > 0.003);
    if (anyLeft && blend < 1 && !metroActive) {
      drawBars(w, h, barW);
    }
    if (blend > 0 || metroActive) {
      drawIdleWave(w, h, metroActive ? 1 : blend, motionOk);
    }
    if (metroActive && pulseEnergy > 0.01 && motionOk) {
      drawBeatFlash(w, h);
    }
  }
}

function drawBars(w, h, barW) {
  for (let i = 0; i < BAR_COUNT; i++) {
    const val = smoothed[i];
    if (val < 0.003) continue;
    const barH = val * h * 0.65;
    const x = i * barW;
    const t = i / BAR_COUNT;
    ctx.fillStyle = t < 0.55 ? '#ffe14a' : '#b45eff';
    ctx.globalAlpha = 0.3 + val * 0.7;
    ctx.fillRect(x + 1, h - barH, barW - 2, barH);
  }
  ctx.globalAlpha = 1;
}

const IDLE_WAVE_LAYERS = [
  { amp: 0.032, freq: 1.8, speed: 0.55, drift: 0.45, alpha: 0.62, width: 2.2 },
  { amp: 0.024, freq: 2.8, speed: -0.85, drift: 0.85, alpha: 0.48, width: 1.7 },
  { amp: 0.018, freq: 4.0, speed: 1.15, drift: 1.2, alpha: 0.36, width: 1.4 },
  { amp: 0.012, freq: 5.4, speed: -1.4, drift: 1.8, alpha: 0.26, width: 1.0 },
];

function drawIdleWave(w, h, blend, motionOk) {
  const metroActive = metro.playing;
  const bpm = metro.bpm || 120;

  if (motionOk) {
    if (metroActive) {
      idlePhase += (bpm / 60) * 0.018;
    } else {
      idlePhase += 0.01;
    }
  }

  const bottomMargin = Math.min(h * 0.14, 120);
  const baseline = h - bottomMargin;
  const pulseMul = 1 + pulseEnergy * (metroActive ? PULSE_BOOST + 0.25 : PULSE_BOOST);
  const energyMul = metroActive ? 1.35 : 1;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const layerColors = ['#ffe14a', '#b45eff', '#4da3ff', '#b45eff'];

  IDLE_WAVE_LAYERS.forEach((layer, idx) => {
    const phase = idlePhase * layer.speed;
    const amp = layer.amp * h * pulseMul * energyMul;
    ctx.strokeStyle = layerColors[idx % layerColors.length];
    ctx.beginPath();
    for (let x = 0; x <= w; x += WAVE_STEP) {
      const t = x / w;
      const envelope = 0.65 + 0.35 * Math.sin(t * Math.PI);
      const harmonic =
        Math.sin(t * Math.PI * 2 * layer.freq + phase) +
        Math.sin(t * Math.PI * 2 * layer.drift + phase * 0.5) * 0.4 +
        Math.sin(t * Math.PI * 2 * (layer.freq * 2.1) + phase * 1.3) * 0.15;
      const y = baseline + envelope * harmonic * amp * 0.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const layerAlpha = layer.alpha * blend * (metroActive ? 0.85 + pulseEnergy * 0.3 : 1);
    ctx.globalAlpha = layerAlpha;
    ctx.lineWidth = layer.width * (metroActive ? 1 + pulseEnergy * 0.2 : 1);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawBeatFlash(w, h) {
  const x = beatFlashX * w;
  const grad = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
  grad.addColorStop(0, 'rgba(255, 225, 74, 0)');
  grad.addColorStop(0.45, `rgba(255, 225, 74, ${pulseEnergy * 0.06})`);
  grad.addColorStop(0.5, `rgba(180, 94, 255, ${pulseEnergy * 0.08})`);
  grad.addColorStop(0.55, `rgba(255, 225, 74, ${pulseEnergy * 0.06})`);
  grad.addColorStop(1, 'rgba(255, 225, 74, 0)');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, w, h);
}

export function destroyVisualizer() {
  if (animId) cancelAnimationFrame(animId);
  if (onResize) window.removeEventListener('resize', onResize);
  if (onMetroBeat) window.removeEventListener('musi:metro-beat', onMetroBeat);
  onResize = null;
  onMetroBeat = null;
}
