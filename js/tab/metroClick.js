// Short Web Audio metronome click for score-synced playback.

import { audioCtx, getAnalyserDestination } from '../audio.js';
import { CLICK_TONE, scheduleClickSound } from '../audio/clickSynth.js';

// Gain staging for score-synced clicks (GP mix player, tab player, count-in).
// Kept below the standalone Metronome tool (STANDALONE_CLICK_GAIN in
// audio/clickSynth.js) but above guitar note peaks (~0.16 in gpMixPlayer) so
// clicks cut through a mix.
export const METRO_CLICK_GAIN = {
  accent: 0.36,
  beat: 0.24,
  sub: 0.14,
  // Legacy alias — tests and older call sites use .normal for beat-level clicks.
  normal: 0.24,
};

const CLICK_DECAY = {
  accent: 0.042,
  beat: 0.036,
  sub: 0.026,
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
  const vol = Math.max(0, Math.min(1, Number(volume) || 0));
  scheduleClickSound(ctx, getAnalyserDestination(), when, {
    tone: CLICK_TONE[resolved] ?? CLICK_TONE.beat,
    peak: (METRO_CLICK_GAIN[resolved] ?? METRO_CLICK_GAIN.beat) * vol,
    decay: CLICK_DECAY[resolved] ?? CLICK_DECAY.beat,
  });
}
