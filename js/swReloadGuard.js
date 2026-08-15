import { getActiveOwner, subscribe } from './audioOwner.js';

/**
 * Return true when a service-worker update reload must wait.
 * Reload while the mic is in use or a score plays tears down live audio.
 *
 * @param {{ captureActive?: boolean, scorePlaying?: boolean }} [flags]
 * @returns {boolean}
 */
export function shouldDeferServiceWorkerReload({ captureActive, scorePlaying } = {}) {
  return !!(captureActive || scorePlaying);
}

function syncScorePlaying(owner) {
  if (typeof window === 'undefined') return;
  window.__musiScorePlaying = owner?.kind === 'score';
}

/**
 * Expose score-playback and reload-defer flags for the inline SW script.
 */
export function initSwReloadGuard() {
  if (typeof window === 'undefined') return;

  window.__musiScorePlaying = false;
  window.__musiShouldDeferReload = () => shouldDeferServiceWorkerReload({
    captureActive: window.__musiCaptureActive,
    scorePlaying: window.__musiScorePlaying,
  });

  syncScorePlaying(getActiveOwner());
  subscribe(syncScorePlaying);
}
