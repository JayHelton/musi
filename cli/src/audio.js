import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SAMPLE_RATE = 44100;

export function midiFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function hasCmd(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(probe, [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

let _player = undefined;

/**
 * Detect an available command-line audio player.
 * Returns { cmd, args(file) } or null if none found.
 */
export function detectPlayer() {
  if (_player !== undefined) return _player;
  const candidates =
    process.platform === 'darwin'
      ? [{ cmd: 'afplay', args: (f) => [f] }]
      : process.platform === 'win32'
      ? [
          {
            cmd: 'powershell',
            args: (f) => [
              '-NoProfile',
              '-Command',
              `(New-Object Media.SoundPlayer '${f}').PlaySync()`,
            ],
          },
        ]
      : [
          { cmd: 'paplay', args: (f) => [f] },
          { cmd: 'aplay', args: (f) => ['-q', f] },
          { cmd: 'ffplay', args: (f) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f] },
          { cmd: 'play', args: (f) => ['-q', f] },
        ];
  _player = candidates.find((p) => hasCmd(p.cmd)) || null;
  return _player;
}

export function audioAvailable() {
  return detectPlayer() !== null;
}

/**
 * Render one sustained tone (sine + triangle blend with attack/release),
 * mirroring the timbre used in the web ear trainer.
 */
function renderTone(samples, startSample, freq, durSec) {
  const total = Math.floor(durSec * SAMPLE_RATE);
  const sustain = durSec * 0.6;
  const release = durSec * 0.35;
  const attack = 0.04;
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    let env;
    if (t < attack) env = 0.18 * (t / attack);
    else if (t < sustain) env = 0.18 - (0.03 * (t - attack)) / Math.max(sustain - attack, 1e-6);
    else {
      const rt = (t - sustain) / release;
      env = rt >= 1 ? 0 : 0.15 * Math.pow(0.001 / 0.15, rt);
    }
    const phase = 2 * Math.PI * freq * t;
    const sine = Math.sin(phase);
    const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
    const sample = env * (0.6 * sine + 0.4 * tri);
    const idx = startSample + i;
    if (idx < samples.length) samples[idx] += sample;
  }
}

function floatsToWav(samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

let _tmpFile = null;
function tmpWavPath() {
  if (!_tmpFile) {
    const dir = mkdtempSync(join(tmpdir(), 'musi-'));
    _tmpFile = join(dir, 'tone.wav');
  }
  return _tmpFile;
}

/**
 * Play a sequence of tones. Each tone: { midi, dur, gap } where gap is
 * silence (sec) inserted before the tone. Resolves when playback finishes.
 */
export function playSequence(tones) {
  const player = detectPlayer();
  if (!player) return Promise.resolve(false);

  let cursor = 0;
  const plan = tones.map((t) => {
    const gap = Math.floor((t.gap || 0) * SAMPLE_RATE);
    const start = cursor + gap;
    cursor = start + Math.floor((t.dur || 1.2) * SAMPLE_RATE) + Math.floor(0.05 * SAMPLE_RATE);
    return { ...t, start };
  });
  const samples = new Float32Array(cursor + Math.floor(0.1 * SAMPLE_RATE));
  plan.forEach((t) => renderTone(samples, t.start, midiFreq(t.midi), t.dur || 1.2));

  const file = tmpWavPath();
  writeFileSync(file, floatsToWav(samples));

  return new Promise((resolve) => {
    const child = spawn(player.cmd, player.args(file), { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(true));
  });
}
