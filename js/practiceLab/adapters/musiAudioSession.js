// The audio-session port over the shared audio owner.
//
// One click source plays at a time across the whole app. The lab claims the
// slot with the kind `metronome`, so starting the Metronome tool stops the lab
// click, and the reverse.

import { claimAudio, releaseAudio } from '../../audio/audioOwner.js';

const OWNER_ID = 'practicelab-click';

/** @returns {Object} an AudioSessionPort */
export function createMusiAudioSession() {
  let handle = null;

  return {
    /**
     * Claim the slot.
     * @param {{ label: string, onStop: Function }} options
     * @returns {Object|null} the handle, or null when another owner refuses
     */
    claim({ label, onStop }) {
      const claimed = claimAudio({
        id: OWNER_ID,
        label: label || 'Practice Lab',
        kind: 'metronome',
        onStop: () => {
          handle = null;
          onStop?.();
        },
      });
      // A pending claim resolves to a promise when an unsaved recording holds
      // the slot. The lab does not prompt, so it treats that as a refusal.
      if (!claimed || typeof claimed.then === 'function') return null;
      handle = claimed;
      return handle;
    },

    release() {
      if (!handle) return;
      releaseAudio(handle);
      handle = null;
    },
  };
}
