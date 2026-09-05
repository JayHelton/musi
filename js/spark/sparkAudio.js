// The audio port of Riff Spark over the shared Musi audio context.
//
// This is the one file of the feature that reaches into `js/audio.js`. The
// player asks this port for the clock and for sounds, so a test can replace
// it with a fake.

import { audioCtx, ensureAudio, getAnalyserDestination } from '../audio.js';
import { schedulePulse, scheduleHit, scheduleNote } from './sparkVoice.js';

/** @returns {Object} an audio port for createSparkPlayer */
export function createSparkAudio() {
  return {
    prime() { ensureAudio(); },
    now() { return audioCtx ? audioCtx.currentTime : 0; },
    pulse(when, accent) {
      if (!audioCtx) return;
      schedulePulse(audioCtx, getAnalyserDestination(), when, accent);
    },
    hit(when, role) {
      if (!audioCtx) return;
      scheduleHit(audioCtx, getAnalyserDestination(), when, role);
    },
    note(when, midi, durSec, role) {
      if (!audioCtx) return;
      scheduleNote(audioCtx, getAnalyserDestination(), when, midi, durSec, role);
    },
  };
}

/** The wall clock the player polls with. */
export function createSparkClock() {
  return {
    setInterval(fn, ms) { return setInterval(fn, ms); },
    clearInterval(handle) { clearInterval(handle); },
  };
}
