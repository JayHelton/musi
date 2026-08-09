// Short Web Audio metronome click for score-synced playback.

import { audioCtx, getAnalyserDestination } from '../audio.js';

// Gain staging for score-synced clicks (GP mix player, tab player, count-in).
// Kept below the standalone Metronome tool (0.35 / 0.20 in metronome.js) but
// above guitar note peaks (~0.16 in gpMixPlayer) so clicks cut through a mix.
export const METRO_CLICK_GAIN = {
  accent: 0.24,
  normal: 0.14,
};

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
  const peak = accented ? METRO_CLICK_GAIN.accent : METRO_CLICK_GAIN.normal;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(bp);
  bp.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(when);
  osc.stop(when + 0.05);
}
