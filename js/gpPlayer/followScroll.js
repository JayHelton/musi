// Auto-follow scroll guard for the GP parchment viewport.

/**
 * Factory for a guard that separates player scroll writes from user scroll gestures.
 * @param {{ cooldownMs?: number, ownScrollWindowMs?: number, now?: () => number }} opts
 */
export function createFollowScrollGuard({
  cooldownMs = 2500,
  ownScrollWindowMs = 200,
  now = () => Date.now(),
} = {}) {
  let pausedUntil = 0;
  let ownScrollUntil = 0;

  return {
    noteOwnScroll() {
      ownScrollUntil = now() + ownScrollWindowMs;
    },

    noteScroll() {
      const t = now();
      if (t < ownScrollUntil) {
        ownScrollUntil = 0;
        return false;
      }
      pausedUntil = t + cooldownMs;
      return true;
    },

    noteUserGesture() {
      ownScrollUntil = 0;
      pausedUntil = now() + cooldownMs;
    },

    isPaused() {
      return now() < pausedUntil;
    },

    resume() {
      pausedUntil = 0;
      ownScrollUntil = 0;
    },
  };
}
