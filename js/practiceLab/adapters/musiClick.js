// The click port over the shared Musi click voice.
//
// This is one of the four files that reach outside `js/practiceLab/`. It uses
// the audio context of `js/audio.js` and the click voice of
// `js/audio/clickSynth.js`, so the lab click sounds like every other click in
// the app and follows the voice the player picked in Settings.

import { audioCtx, ensureAudio, getAnalyserDestination } from '../../audio.js';
import { CLICK_TONE, STANDALONE_CLICK_GAIN, scheduleClickSound } from '../../audio/clickSynth.js';

/** The tone and the level of each click level. */
const LEVELS = {
  accent: { tone: CLICK_TONE.accent, peak: STANDALONE_CLICK_GAIN.accent, decay: 0.042 },
  beat: { tone: CLICK_TONE.beat, peak: STANDALONE_CLICK_GAIN.beat, decay: 0.036 },
  sub: { tone: CLICK_TONE.sub, peak: STANDALONE_CLICK_GAIN.beat * 0.62, decay: 0.03 },
};

/** @returns {Object} a ClickPort */
export function createMusiClick() {
  return {
    /** Open the audio context and warm the click voice. */
    prime() {
      ensureAudio();
    },

    /** The audio clock, in seconds. */
    now() {
      return audioCtx ? audioCtx.currentTime : 0;
    },

    /** Schedule one click at an absolute audio-clock time. */
    schedule(atSec, level) {
      if (!audioCtx) return;
      const shape = LEVELS[level] || LEVELS.beat;
      scheduleClickSound(audioCtx, getAnalyserDestination(), atSec, shape);
    },

    /**
     * The clicks are short one-shot voices. They finish on their own, so there
     * is nothing to tear down; the scheduler simply stops booking new ones.
     */
    stop() {},
  };
}
