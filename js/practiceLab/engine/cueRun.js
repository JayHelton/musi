// The cue run player of Practice Lab.
//
// A cue run is a list of steps. The player shows one step at a time, counts
// its seconds down on the shared countdown, and moves to the next step. A
// checkpoint has no timer: the singer presses Next.
//
// The player owns no audio and no DOM. It takes the expanded step list from
// the caller, so the cue model stays in `js/cueExerciseModel.js` and the
// timing stays on the injected clock.
//
// Rest is exercise content. Nothing here shortens a step.

import { createCountdown } from './countdown.js';

/**
 * @param {{ clock: Object, tickMs?: number }} deps
 */
export function createCueRun({ clock, tickMs = 200 }) {
  const countdown = createCountdown({ clock, tickMs });

  /** @type {Array<{rep:number, reps:number, index:number, step:Object, next:Object|null}>} */
  let list = [];
  let handlers = {};
  let at = -1;
  let running = false;
  let paused = false;
  let pausedRemainingMs = 0;

  function emit(name, payload) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`practice lab cue run ${name} failed`, e);
      }
    }
  }

  function entryAt(index) {
    return list[index] || null;
  }

  function finish(completed) {
    if (!running) return;
    running = false;
    paused = false;
    at = -1;
    countdown.stop();
    const done = { completed, steps: list.length };
    emit('onEnd', done);
    handlers = {};
  }

  /** Show one step and start its timer. A checkpoint waits for `next()`. */
  function enter(index) {
    const entry = entryAt(index);
    if (!entry) {
      finish(true);
      return;
    }
    at = index;
    const seconds = entry.step.type === 'checkpoint' ? 0 : Number(entry.step.duration) || 0;
    emit('onStep', {
      entry,
      index,
      total: list.length,
      remainingMs: seconds * 1000,
      waiting: seconds <= 0,
    });
    if (seconds <= 0) return;
    startTimer(seconds * 1000);
  }

  function startTimer(ms) {
    countdown.startSeconds(ms / 1000, {
      onTick: ({ remainingMs }) => {
        if (!running || paused) return;
        emit('onTick', { remainingMs, index: at, entry: entryAt(at) });
      },
      onComplete: () => {
        if (!running || paused) return;
        enter(at + 1);
      },
    });
  }

  return {
    /**
     * Load the expanded step list. Call this before `start`.
     * @param {Array} steps the output of `expandCueSteps`
     */
    load(steps) {
      list = Array.isArray(steps) ? steps.slice() : [];
      return list.length;
    },

    /**
     * Start at the first step.
     * The handlers are `onStep`, `onTick`, and `onEnd`.
     */
    start(nextHandlers = {}) {
      if (!list.length) return false;
      if (running) this.stop();
      handlers = nextHandlers;
      running = true;
      paused = false;
      pausedRemainingMs = 0;
      enter(0);
      return true;
    },

    /** Hold the current step where it is. The remaining time survives. */
    pause() {
      if (!running || paused) return false;
      pausedRemainingMs = countdown.remainingMs();
      countdown.stop();
      paused = true;
      emit('onPause', { index: at, entry: entryAt(at), remainingMs: pausedRemainingMs });
      return true;
    },

    /** Carry on from the time the pause held. */
    resume() {
      if (!running || !paused) return false;
      paused = false;
      emit('onResume', { index: at, entry: entryAt(at), remainingMs: pausedRemainingMs });
      if (pausedRemainingMs > 0) startTimer(pausedRemainingMs);
      pausedRemainingMs = 0;
      return true;
    },

    /**
     * Move to the next step by hand. A checkpoint needs this, and a singer may
     * use it to leave a step early.
     */
    next() {
      if (!running) return false;
      countdown.stop();
      paused = false;
      pausedRemainingMs = 0;
      enter(at + 1);
      return true;
    },

    /** Stop the run. Stop stays available at every step. */
    stop() {
      if (!running) return false;
      finish(false);
      return true;
    },

    isRunning() { return running; },
    isPaused() { return paused; },
    stepCount() { return list.length; },
    index() { return at; },
    current() { return entryAt(at); },
    remainingMs() { return paused ? pausedRemainingMs : countdown.remainingMs(); },
  };
}
