// The practice timer of Practice Lab.
//
// The timer is one tool inside the session. It never ends the session, and a
// session accepts any number of timer blocks. The clock arrives through a
// port, so the Node tests drive it by hand.

const TICK_MS = 200;

/**
 * @param {{ clock: Object, tickMs?: number }} deps
 */
export function createCountdown({ clock, tickMs = TICK_MS }) {
  let handlers = {};
  let timer = null;
  let running = false;
  let minutes = 0;
  let totalMs = 0;
  let startedMs = 0;

  function emit(name, payload) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`practice lab countdown ${name} failed`, e);
      }
    }
  }

  function clearTimer() {
    if (timer == null) return;
    clock.clearInterval(timer);
    timer = null;
  }

  function elapsedMs() {
    if (!running) return 0;
    return Math.max(0, clock.nowMs() - startedMs);
  }

  function remainingMs() {
    if (!running) return 0;
    return Math.max(0, totalMs - elapsedMs());
  }

  function tick() {
    if (!running) return;
    const left = remainingMs();
    emit('onTick', { remainingMs: left, totalMs, minutes });
    if (left > 0) return;
    running = false;
    clearTimer();
    const done = { minutes, totalMs };
    handlers.__done = true;
    emit('onComplete', done);
    handlers = {};
  }

  return {
    /**
     * Start a countdown of `mins` minutes.
     * The handlers are `onTick`, `onComplete`, and `onStop`.
     */
    start(mins, nextHandlers = {}) {
      const value = Math.round(Number(mins));
      if (!Number.isFinite(value) || value <= 0) return false;
      if (running) this.stop();
      handlers = nextHandlers;
      minutes = value;
      totalMs = value * 60000;
      startedMs = clock.nowMs();
      running = true;
      emit('onTick', { remainingMs: totalMs, totalMs, minutes });
      timer = clock.setInterval(tick, tickMs);
      return true;
    },

    /** Stop the countdown before zero. */
    stop() {
      if (!running) return null;
      const ran = elapsedMs();
      running = false;
      clearTimer();
      const stopped = { minutes, elapsedMs: Math.round(ran), totalMs };
      emit('onStop', stopped);
      handlers = {};
      return stopped;
    },

    isRunning() { return running; },
    remainingMs,
    elapsedMs,
    minutes() { return minutes; },
  };
}
