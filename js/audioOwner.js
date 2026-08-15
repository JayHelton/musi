/**
 * Compatibility entry for Feature 005 consumers.
 * The owner registry lives in js/audio/audioOwner.js.
 */

export {
  claimAudio,
  releaseAudio,
  getAudioOwner,
  getActiveOwner,
  subscribe,
  stopActive,
} from './audio/audioOwner.js';
