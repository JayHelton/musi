// The clock port and the id port of Practice Lab.
//
// The clock is the wall clock of the log. The click runs on the audio clock,
// which the click port owns. The Node tests replace both with fakes.

/** @returns {Object} a ClockPort */
export function createRealClock() {
  return {
    nowMs() { return Date.now(); },
    setInterval(fn, ms) { return setInterval(fn, ms); },
    clearInterval(handle) { clearInterval(handle); },
  };
}

/**
 * The id port. The counter keeps two ids of the same millisecond apart.
 * @returns {Object} an IdPort
 */
export function createIds() {
  let counter = 0;
  return {
    newId(prefix) {
      counter += 1;
      const time = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 8);
      return `${prefix}-${time}-${counter.toString(36)}${rand}`;
    },
  };
}
