// Backing track clock follower.
//
// The score engine owns the clock. This module reads that clock and moves the
// media to match it. One loop does all of the work, so no transport handler
// can forget to move the media and let it drift.
//
// The module holds no DOM reference and reads no global clock, so a test can
// drive it with a fake adapter and a fake time source.

/** Correction limits for a media element, which reports an exact time. */
export const ELEMENT_THRESHOLDS = Object.freeze({
  softSec: 0.015,
  hardSec: 0.12,
  correctSec: 0.6,
  maxRateAdjust: 0.08,
  seekCooldownMs: 200,
});

/** Correction limits for a YouTube player, whose reported time is coarse. */
export const IFRAME_THRESHOLDS = Object.freeze({
  softSec: null,
  hardSec: 0.25,
  correctSec: 0.6,
  maxRateAdjust: 0,
  seekCooldownMs: 700,
});

const RATE_EPSILON = 0.001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * The media time that belongs to one engine position.
 *
 * Engine seconds are score-tempo seconds divided by the practice rate, so the
 * multiplication returns the score time at the written tempo. That is the same
 * time base as the recording.
 *
 * @param {{songSec:number, rate:number, anchorSec:number, trimMs:number}} args
 * @returns {number} seconds into the media
 */
export function targetMediaSec({ songSec, rate, anchorSec = 0, trimMs = 0 } = {}) {
  const r = Number(rate) > 0 ? Number(rate) : 1;
  const song = Math.max(0, Number(songSec) || 0);
  const scoreSec = song * r;
  return (Number(anchorSec) || 0) + (Number(trimMs) || 0) / 1000 + scoreSec;
}

/**
 * The rate factor that closes a drift without an audible jump.
 * A positive error means the media runs ahead, so the factor is below one.
 */
export function driftRateFactor(errorSec, thresholds) {
  const max = Number(thresholds?.maxRateAdjust) || 0;
  if (max <= 0) return 1;
  const window = Number(thresholds?.correctSec) || 0.6;
  return 1 + clamp(-errorSec / window, -max, max);
}

/**
 * @param {object} opts
 * @param {() => object|null} opts.getAdapter media source adapter
 * @param {() => object} opts.getConfig `{ enabled, anchorSec, trimMs }`
 * @param {() => {songSec:number, rate:number, playing:boolean, holding:boolean}} opts.getClock
 * @param {(status:object) => void} [opts.onStatus]
 * @param {() => number} [opts.now] milliseconds, for the seek cooldown
 */
export function createBackingSync({
  getAdapter,
  getConfig,
  getClock,
  onStatus = null,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  const state = {
    status: 'off',
    detail: '',
    errorSec: 0,
    appliedRate: 0,
    seekCooldownUntil: 0,
    destroyed: false,
    frameId: null,
  };

  function report(status, detail = '', errorSec = 0) {
    const changed = state.status !== status || state.detail !== detail;
    state.status = status;
    state.detail = detail;
    state.errorSec = errorSec;
    if (changed && typeof onStatus === 'function') {
      onStatus({ status, detail, errorSec });
    }
  }

  function applyRate(adapter, rate) {
    if (Math.abs(rate - state.appliedRate) < RATE_EPSILON) return;
    state.appliedRate = rate;
    adapter.setRate(rate);
  }

  function pauseMedia(adapter, status, detail = '') {
    if (adapter?.isPlaying?.()) adapter.pause();
    report(status, detail);
  }

  function hardSeek(adapter, target, rate, thresholds) {
    const t = now();
    if (t < state.seekCooldownUntil) return;
    state.seekCooldownUntil = t + (Number(thresholds.seekCooldownMs) || 0);
    applyRate(adapter, rate);
    adapter.seek(target);
  }

  /** One reconcile pass. Call it from an animation frame or from a test. */
  function tick() {
    if (state.destroyed) return state.status;
    const adapter = getAdapter?.();
    const config = getConfig?.() || {};

    if (!adapter) {
      report('off');
      return state.status;
    }
    if (!config.enabled) {
      pauseMedia(adapter, 'off');
      return state.status;
    }
    if (adapter.error) {
      pauseMedia(adapter, 'error', adapter.error);
      return state.status;
    }
    if (!adapter.ready) {
      report('loading');
      return state.status;
    }

    const clock = getClock?.() || {};
    const rate = Number(clock.rate) > 0 ? Number(clock.rate) : 1;

    if (typeof adapter.supportsRate === 'function' && !adapter.supportsRate(rate)) {
      pauseMedia(adapter, 'unsupported-rate', `${Math.round(rate * 100)}%`);
      return state.status;
    }

    if (!clock.playing || clock.holding) {
      pauseMedia(adapter, 'idle');
      return state.status;
    }

    const thresholds = adapter.driftThresholds || ELEMENT_THRESHOLDS;
    const target = targetMediaSec({
      songSec: clock.songSec,
      rate,
      anchorSec: config.anchorSec,
      trimMs: config.trimMs,
    });

    // The score starts before the recording does, so wait in silence.
    if (target < 0) {
      pauseMedia(adapter, 'waiting');
      return state.status;
    }
    const duration = Number(adapter.duration) || 0;
    if (duration > 0 && target >= duration) {
      pauseMedia(adapter, 'ended');
      return state.status;
    }

    if (!adapter.isPlaying()) {
      applyRate(adapter, rate);
      adapter.seek(target);
      adapter.play();
      state.seekCooldownUntil = now() + (Number(thresholds.seekCooldownMs) || 0);
      report('seeking');
      return state.status;
    }

    const mediaTime = Number(adapter.getTime());
    if (!Number.isFinite(mediaTime)) {
      report('seeking');
      return state.status;
    }
    const errorSec = mediaTime - target;
    const absError = Math.abs(errorSec);

    if (absError > thresholds.hardSec) {
      hardSeek(adapter, target, rate, thresholds);
      report('seeking', '', errorSec);
      return state.status;
    }

    const soft = thresholds.softSec;
    if (soft != null && absError > soft) {
      applyRate(adapter, rate * driftRateFactor(errorSec, thresholds));
      report('correcting', '', errorSec);
      return state.status;
    }

    applyRate(adapter, rate);
    report('sync', '', errorSec);
    return state.status;
  }

  function start() {
    if (state.destroyed || state.frameId != null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      if (state.destroyed) {
        state.frameId = null;
        return;
      }
      tick();
      state.frameId = requestAnimationFrame(step);
    };
    state.frameId = requestAnimationFrame(step);
  }

  function stop() {
    if (state.frameId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(state.frameId);
    }
    state.frameId = null;
  }

  function destroy() {
    state.destroyed = true;
    stop();
  }

  /** Forget the memos and let the next tick seek at once. */
  function clearMemos() {
    state.appliedRate = 0;
    state.seekCooldownUntil = 0;
  }

  /**
   * Line the media up again on the next tick, without a status change.
   *
   * A delay control calls this while the user drags it. A status change here
   * would make the status line flash on every drag step.
   */
  function resync() {
    clearMemos();
  }

  /** Forget the memos and the status, for example after the source changes. */
  function reset() {
    clearMemos();
    report('off');
  }

  return {
    tick,
    start,
    stop,
    reset,
    resync,
    destroy,
    get status() { return state.status; },
    get detail() { return state.detail; },
    get errorSec() { return state.errorSec; },
    get running() { return state.frameId != null; },
  };
}
