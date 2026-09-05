// The loop player of Riff Spark.
//
// The player walks the slots of a cadence on the audio clock. It looks 100 ms
// ahead and polls every 25 ms, the same shape the metronome uses. Each slot
// can sound a pulse click, a hit, or a pitched note, and the player reports
// the slot to the screen when the sound reaches the ear.
//
// The pattern is read on every step, so the screen can change a slot, the
// tempo, or the pitches while the loop runs, with no restart.
//
// The player owns no audio and no DOM. It calls the audio port only.

const LOOKAHEAD_SEC = 0.1;
const POLL_MS = 25;

/**
 * @typedef {Object} SparkPattern
 * @property {string[]} cells one entry per slot; '' is a rest
 * @property {number} slotsPerBar
 * @property {number} pulse slots between pulse clicks
 * @property {number} bpm quarter notes per minute
 * @property {boolean} [pulseOn] sound the pulse click
 * @property {'hits'|'notes'} [voice] unpitched hits, or pitched notes
 * @property {Map<number, {midi: number, role: string}>} [notes] pitch per slot
 */

/**
 * @param {{ audio: Object, clock: Object, lookaheadSec?: number, pollMs?: number }} deps
 */
export function createSparkPlayer({ audio, clock, lookaheadSec = LOOKAHEAD_SEC, pollMs = POLL_MS }) {
  let pattern = null;
  let handlers = {};
  let timer = null;
  let running = false;
  let step = 0;
  let nextSec = 0;
  let loops = 0;
  let pending = [];

  function emit(name, payload) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn(`spark player ${name} failed`, e);
    }
  }

  function slotSec() {
    return 60 / Math.max(20, pattern.bpm) / 4;
  }

  /** Slots until the next attack after `index`, wrapping once. */
  function gapAfter(index) {
    const total = pattern.cells.length;
    for (let k = 1; k <= total; k += 1) {
      if (pattern.cells[(index + k) % total]) return k;
    }
    return total;
  }

  function scheduleSlot(index, when) {
    const cell = pattern.cells[index];
    if (pattern.pulseOn && index % pattern.pulse === 0) {
      audio.pulse(when, index % pattern.slotsPerBar === 0);
    }
    if (!cell) return;
    const note = pattern.voice === 'notes' && pattern.notes ? pattern.notes.get(index) : null;
    if (note) {
      audio.note(when, note.midi, gapAfter(index) * slotSec(), note.role || cell);
      return;
    }
    audio.hit(when, cell);
  }

  function drain(nowSec) {
    let cut = 0;
    while (cut < pending.length && pending[cut].atSec <= nowSec) cut += 1;
    if (!cut) return;
    const due = pending.slice(0, cut);
    pending = pending.slice(cut);
    for (const item of due) emit('onStep', item);
  }

  function tick() {
    if (!running || !pattern) return;
    const nowSec = audio.now();
    const total = pattern.cells.length;
    if (!total) return;
    while (nextSec < nowSec + lookaheadSec) {
      const index = step % total;
      if (index === 0 && step > 0) loops += 1;
      scheduleSlot(index, nextSec);
      pending.push({ index, atSec: nextSec, loops, bar: Math.floor(index / pattern.slotsPerBar) });
      step += 1;
      nextSec += slotSec();
    }
    drain(nowSec);
  }

  function clearTimer() {
    if (timer == null) return;
    clock.clearInterval(timer);
    timer = null;
  }

  return {
    /**
     * Start a pattern. The handlers are `onStep` and `onStop`.
     * @param {SparkPattern} nextPattern
     * @param {Object} [nextHandlers]
     */
    start(nextPattern, nextHandlers = {}) {
      if (!nextPattern || !Array.isArray(nextPattern.cells) || !nextPattern.cells.length) return false;
      if (running) this.stop();
      if (typeof audio.prime === 'function') audio.prime();
      pattern = { ...nextPattern };
      handlers = nextHandlers;
      step = 0;
      loops = 0;
      pending = [];
      running = true;
      nextSec = audio.now() + 0.06;
      tick();
      timer = clock.setInterval(tick, pollMs);
      return true;
    },

    /** Stop the loop now. */
    stop() {
      if (!running) return;
      running = false;
      clearTimer();
      pending = [];
      const done = pattern;
      pattern = null;
      emit('onStop', { pattern: done, loops });
      handlers = {};
    },

    /**
     * Change the running pattern. Unset fields keep their value. A new cell
     * list of another length restarts the walk at slot 0.
     * @param {Partial<SparkPattern>} patch
     */
    update(patch = {}) {
      if (!pattern) return;
      const next = { ...pattern, ...patch };
      if (Array.isArray(patch.cells) && patch.cells.length !== pattern.cells.length) {
        step = 0;
      }
      pattern = next;
    },

    setBpm(bpm) {
      if (!pattern) return;
      const tempo = Math.round(Number(bpm));
      if (Number.isFinite(tempo) && tempo > 0) pattern.bpm = tempo;
    },

    isRunning() { return running; },
    currentPattern() { return pattern; },
    loopCount() { return loops; },

    /** The tick, for a test that drives the clock by hand. */
    __tick: tick,
  };
}
