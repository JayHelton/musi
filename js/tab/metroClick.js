// Short Web Audio metronome click for score-synced playback.

import { audioCtx, getAnalyserDestination } from '../audio.js';

// Gain staging for score-synced clicks (GP mix player, tab player, count-in).
// Kept below the standalone Metronome tool (0.35 / 0.20 in metronome.js) but
// above guitar note peaks (~0.16 in gpMixPlayer) so clicks cut through a mix.
export const METRO_CLICK_GAIN = {
  accent: 0.24,
  beat: 0.14,
  sub: 0.08,
  // Legacy alias — tests and older call sites use .normal for beat-level clicks.
  normal: 0.14,
};

function resolveLevel(level) {
  if (level === true || level === 'accent') return 'accent';
  if (level === false || level === 'beat' || level === 'normal') return 'beat';
  if (level === 'sub') return 'sub';
  return 'beat';
}

/**
 * Schedule a metronome click at an absolute AudioContext time.
 * @param {number} when
 * @param {'accent'|'beat'|'sub'|boolean} [level]
 * @param {number} [volume] 0–1 multiplier on staged peak gain
 */
export function scheduleMetronomeClick(when, level = 'beat', volume = 1) {
  const ctx = audioCtx;
  if (!ctx) return;
  const resolved = resolveLevel(level);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  osc.type = 'triangle';
  let freq;
  if (resolved === 'accent') freq = 1200;
  else if (resolved === 'beat') freq = 800;
  else freq = 600;
  osc.frequency.value = freq;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 8;
  const vol = Math.max(0, Math.min(1, Number(volume) || 0));
  const peak = (METRO_CLICK_GAIN[resolved] ?? METRO_CLICK_GAIN.beat) * vol;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(bp);
  bp.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(when);
  osc.stop(when + 0.05);
}
