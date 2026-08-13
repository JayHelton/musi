/** Shared guide-tone lockout for Pitch Trainer and Pitch Runner. */

export const ROOM_TAIL_SEC = 0.6;
export const DEFAULT_WINDOW_SIZE = 4096;
export const DEFAULT_SAMPLE_RATE = 48000;

export function analysisWindowSec(capture) {
  const sr = Number(capture?.sampleRate) > 0 ? capture.sampleRate : DEFAULT_SAMPLE_RATE;
  const win = Number(capture?.windowSize) > 0 ? capture.windowSize : DEFAULT_WINDOW_SIZE;
  return win / sr;
}

/** Quiet-room time: last audible sample plus room tail. Do NOT add the analysis window here. */
export function lockoutUntil(audibleEndAudioTime, _capture) {
  if (!Number.isFinite(audibleEndAudioTime)) return 0;
  return audibleEndAudioTime + ROOM_TAIL_SEC;
}

/** audioTime is the analysis window END. Score only when the whole window is after lockUntil. */
export function isScoringWindowClear(audioTime, lockUntil, capture) {
  if (lockUntil === Infinity) return false;
  if (!Number.isFinite(lockUntil) || lockUntil <= 0) return true;
  if (!Number.isFinite(audioTime)) return false;
  const windowStart = audioTime - analysisWindowSec(capture);
  return windowStart >= lockUntil;
}
