// The plan player of Practice Lab.
//
// The scheduler walks a plan on the audio clock. It looks 100 ms ahead and
// polls every 25 ms, the same shape the standalone metronome uses, but written
// for this feature and driven by the injected ports.
//
// The scheduler owns no audio and no DOM. It calls `click.schedule()` for each
// event inside the lookahead window, and it reports the beat to the user
// interface after the click sounds.

import { clickLevel } from './expand.js';

const LOOKAHEAD_SEC = 0.1;
const POLL_MS = 25;

/**
 * @param {{ click: Object, clock: Object, lookaheadSec?: number, pollMs?: number }} deps
 */
export function createScheduler({ click, clock, lookaheadSec = LOOKAHEAD_SEC, pollMs = POLL_MS }) {
  let plan = null;
  let handlers = {};
  let timer = null;
  let running = false;

  let segIndex = 0;
  let beatIndex = 0;
  let subIndex = 0;
  let nextTimeSec = 0;
  let cycles = 0;
  let endAtSec = 0;
  let startedAtSec = 0;

  /** Beats already scheduled, waiting for their moment to reach the display. */
  let pending = [];

  function currentSegment() {
    if (!plan) return null;
    return plan.segments[segIndex] || null;
  }

  function emit(name, payload) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`practice lab scheduler ${name} failed`, e);
      }
    }
  }

  function advance(seg) {
    nextTimeSec += 60 / seg.bpm / seg.perBeat;
    subIndex += 1;
    if (subIndex < seg.perBeat) return true;
    subIndex = 0;
    beatIndex += 1;
    if (beatIndex < seg.beats) return true;
    beatIndex = 0;
    segIndex += 1;
    if (segIndex < plan.segments.length) {
      emit('onSegment', { segment: plan.segments[segIndex], index: segIndex, cycles });
      return true;
    }
    if (plan.loop) {
      segIndex = Math.max(0, Math.min(plan.segments.length - 1, plan.loopFrom || 0));
      cycles += 1;
      emit('onSegment', { segment: plan.segments[segIndex], index: segIndex, cycles });
      return true;
    }
    // A plan that does not repeat is finished. The last click still sounds.
    endAtSec = nextTimeSec;
    return false;
  }

  function drain(nowSec) {
    if (!pending.length) return;
    let cut = 0;
    while (cut < pending.length && pending[cut].atSec <= nowSec) cut += 1;
    if (!cut) return;
    const due = pending.slice(0, cut);
    pending = pending.slice(cut);
    for (const beat of due) emit('onBeat', beat);
  }

  function tick() {
    if (!running || !plan) return;
    const nowSec = click.now();

    while (!endAtSec && nextTimeSec < nowSec + lookaheadSec) {
      const seg = currentSegment();
      if (!seg) { endAtSec = nextTimeSec; break; }
      const level = clickLevel(seg, beatIndex, subIndex);
      click.schedule(nextTimeSec, level);
      pending.push({
        atSec: nextTimeSec,
        level,
        segment: seg,
        segmentIndex: segIndex,
        beatIndex,
        subIndex,
        bpm: seg.bpm,
        cycles,
      });
      if (!advance(seg)) break;
    }

    drain(nowSec);

    if (endAtSec && nowSec >= endAtSec) {
      finish(true);
      return;
    }
    emit('onPoll', { elapsedSec: Math.max(0, nowSec - startedAtSec), cycles });
  }

  function clearTimer() {
    if (timer == null) return;
    clock.clearInterval(timer);
    timer = null;
  }

  function finish(completed) {
    if (!running) return;
    running = false;
    clearTimer();
    const elapsedSec = Math.max(0, click.now() - startedAtSec);
    const donePlan = plan;
    const doneCycles = cycles;
    pending = [];
    plan = null;
    emit('onEnd', { completed, plan: donePlan, cycles: doneCycles, elapsedSec });
    handlers = {};
  }

  return {
    /**
     * Start a plan. The handlers are `onBeat`, `onSegment`, `onPoll`, and
     * `onEnd`.
     * @param {Object} nextPlan
     * @param {Object} [nextHandlers]
     */
    start(nextPlan, nextHandlers = {}) {
      if (!nextPlan || !Array.isArray(nextPlan.segments) || !nextPlan.segments.length) {
        return false;
      }
      if (running) this.stop();
      plan = nextPlan;
      handlers = nextHandlers;
      segIndex = 0;
      beatIndex = 0;
      subIndex = 0;
      cycles = 0;
      endAtSec = 0;
      pending = [];
      running = true;
      startedAtSec = click.now();
      // A short offset keeps the first click clear of the schedule call.
      nextTimeSec = startedAtSec + 0.06;
      emit('onSegment', { segment: plan.segments[0], index: 0, cycles: 0 });
      tick();
      timer = clock.setInterval(tick, pollMs);
      return true;
    },

    /** Stop the plan now. The scheduler reports `completed: false`. */
    stop() {
      if (!running) return;
      click.stop();
      finish(false);
    },

    /**
     * Change the tempo of a running metronome plan. The change takes effect on
     * the next click, with no restart.
     * @param {number} bpm
     */
    setBpm(bpm) {
      if (!plan || plan.kind !== 'metronome') return;
      const tempo = Math.round(Number(bpm));
      if (!Number.isFinite(tempo) || tempo <= 0) return;
      for (const seg of plan.segments) {
        seg.bpm = tempo;
        seg.label = `${tempo} BPM`;
      }
    },

    /** True while a plan runs. */
    isRunning() {
      return running;
    },

    /** The plan that runs now, or null. */
    currentPlan() {
      return plan;
    },

    /** The completed loop bodies of the running plan. */
    cycleCount() {
      return cycles;
    },

    /** The tick, for a test that drives the clock by hand. */
    __tick: tick,
  };
}
