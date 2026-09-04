// Follow guard for the score viewport.
//
// The guard has two states: ACTIVE and SUSPENDED_BY_USER. A scroll gesture by
// the user suspends follow. A timer never resumes it. Follow comes back only
// when the player calls resume(): the user taps Follow, presses the follow
// shortcut, seeks to a new position, or restarts playback.
//
// The guard also separates the scroll writes of the player from the scroll
// events of the user. A scroll event that arrives inside the own-scroll window
// belongs to the player, so it does not suspend follow.

export const FOLLOW_ACTIVE = 'ACTIVE';
export const FOLLOW_SUSPENDED_BY_USER = 'SUSPENDED_BY_USER';

/**
 * @param {{ ownScrollWindowMs?: number, now?: () => number, onChange?: (state:string)=>void }} opts
 */
export function createFollowScrollGuard({
  ownScrollWindowMs = 200,
  now = () => Date.now(),
  onChange = null,
} = {}) {
  let state = FOLLOW_ACTIVE;
  let ownScrollUntil = 0;

  function setState(next) {
    if (next === state) return;
    state = next;
    if (typeof onChange === 'function') onChange(state);
  }

  return {
    /** The player is about to move the viewport itself. */
    noteOwnScroll() {
      ownScrollUntil = now() + ownScrollWindowMs;
    },

    /**
     * A scroll event arrived. Returns true when the scroll came from the user,
     * and the guard then suspends follow.
     */
    noteScroll() {
      const t = now();
      if (t < ownScrollUntil) {
        ownScrollUntil = 0;
        return false;
      }
      setState(FOLLOW_SUSPENDED_BY_USER);
      return true;
    },

    /** A wheel, touch, or key gesture that scrolls. Suspends follow. */
    noteUserGesture() {
      ownScrollUntil = 0;
      setState(FOLLOW_SUSPENDED_BY_USER);
    },

    suspend() {
      ownScrollUntil = 0;
      setState(FOLLOW_SUSPENDED_BY_USER);
    },

    resume() {
      ownScrollUntil = 0;
      setState(FOLLOW_ACTIVE);
    },

    isSuspended() {
      return state === FOLLOW_SUSPENDED_BY_USER;
    },

    /** Kept for callers that read the old name. */
    isPaused() {
      return state === FOLLOW_SUSPENDED_BY_USER;
    },

    getState() {
      return state;
    },
  };
}

/**
 * Decide whether the viewport must move so the playhead stays in the reading
 * zone. The zone is a band in the upper-middle of the viewport. The score
 * moves only when the active system leaves that band, so the sheet moves
 * rarely and the playhead moves constantly.
 *
 * All values are pixels relative to the viewport top.
 *
 * @param {{
 *   viewportHeight: number,
 *   systemTop: number,
 *   systemBottom: number,
 *   zoneStart?: number,
 *   zoneEnd?: number,
 *   restTop?: number,
 * }} opts
 * @returns {{ move: boolean, targetTop: number }} the offset the system top
 *   should sit at after the move.
 */
export function readingZoneMove({
  viewportHeight,
  systemTop,
  systemBottom,
  zoneStart = 0.08,
  zoneEnd = 0.6,
  restTop = 0.18,
}) {
  const h = Math.max(1, Number(viewportHeight) || 1);
  const top = Number(systemTop) || 0;
  const bottom = Number.isFinite(systemBottom) ? systemBottom : top;
  const zoneTop = h * zoneStart;
  const zoneBottom = h * zoneEnd;
  const target = Math.round(h * restTop);
  // The whole system sits inside the zone: nothing to do.
  if (top >= zoneTop && bottom <= zoneBottom) return { move: false, targetTop: top };
  // A system that fills more than the zone: keep its top in view.
  if (bottom - top > zoneBottom - zoneTop) {
    if (top >= 0 && top <= zoneBottom) return { move: false, targetTop: top };
    return { move: true, targetTop: Math.max(0, Math.min(target, zoneTop)) };
  }
  return { move: true, targetTop: target };
}
