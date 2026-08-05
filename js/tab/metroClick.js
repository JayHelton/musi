// Short Web Audio metronome click for score-synced playback.

import { audioCtx, getAnalyserDestination } from '../audio.js';

/**
 * Schedule a metronome click at an absolute AudioContext time.
 * @param {number} when
 * @param {boolean} [accented]
 */
export function scheduleMetronomeClick(when, accented = false) {
  const ctx = audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  osc.type = 'triangle';
  const freq = accented ? 1200 : 800;
  osc.frequency.value = freq;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 8;
  const peak = accented ? 0.12 : 0.08;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(bp);
  bp.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(when);
  osc.stop(when + 0.05);
}
