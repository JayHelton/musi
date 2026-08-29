/**
 * The vertical pitch window of the pitch runner.
 *
 * A run can hold a very wide range of notes. If the canvas shows the whole
 * range at one time, each semitone lane gets a few pixels and the note names
 * in the left gutter print on top of each other. This module keeps the number
 * of visible lanes bounded and moves the window up and down along the pitch
 * axis, so the window follows the melody as it goes up and comes down.
 *
 * The functions here hold no DOM code and no audio code, so the Node test
 * runners can import them.
 */

/** The smallest lane height that keeps a note name readable, in pixels. */
export const MIN_LANE_PX = 17;

/** The smallest window, in semitone lanes. A small canvas still shows this. */
export const MIN_VISIBLE_LANES = 12;

/** Lanes of clearance the window keeps between a note and the top or bottom. */
export const VIEW_EDGE_LANES = 1;

/** How fast the window catches up with its target, in seconds. */
export const VIEW_TIME_CONSTANT_SEC = 0.22;

/** The window stops when it is this near the target, in semitones. */
export const VIEW_SNAP_SEMITONES = 0.01;

/** Read a finite number, or return the fallback. */
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The number of semitone lanes the window shows.
 *
 * The window never shows more lanes than the run holds. It shrinks until each
 * lane is at least `minLanePx` high, but it never goes below `minLanes`.
 *
 * @param {number} usableHeightPx the canvas height the lanes fill, in pixels
 * @param {number} contentLanes the number of lanes the whole run covers
 * @returns {number} the number of lanes to show, 1 or more
 */
export function visibleLaneSpan(usableHeightPx, contentLanes, {
  minLanePx = MIN_LANE_PX,
  minLanes = MIN_VISIBLE_LANES,
} = {}) {
  const content = Math.max(1, Math.round(num(contentLanes, 1)));
  const height = Math.max(0, num(usableHeightPx, 0));
  const lanePx = Math.max(1, num(minLanePx, MIN_LANE_PX));
  const floorLanes = Math.max(1, Math.round(num(minLanes, MIN_VISIBLE_LANES)));
  const fits = Math.floor(height / lanePx);
  return Math.min(content, Math.max(floorLanes, fits));
}

/**
 * The notes that overlap one beat window, in time order. A note keeps its
 * place while it sounds, so the note at the hit line comes first.
 */
function notesInWindow(notes, fromBeat, toBeat) {
  const out = [];
  if (!Array.isArray(notes)) return out;
  for (const note of notes) {
    if (!note || !Number.isFinite(Number(note.midi))) continue;
    const start = num(note.startBeat, 0);
    const end = start + Math.max(0, num(note.dur, 0));
    if (end >= fromBeat && start <= toBeat) out.push({ midi: num(note.midi, 0), start, end });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * The place of the note that holds the window: the note that sounds now, or
 * the note that comes next. Returns -1 for an empty list.
 */
function anchorIndex(list, playheadBeat) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].end > playheadBeat) return i;
  }
  return list.length - 1;
}

/**
 * The pitch the window must sit on for the notes near the playhead.
 *
 * The window starts on the note that sounds now. It then grows note by note,
 * forward in time first and then backward, while the notes stay inside the
 * window. A leap that is wider than the window stops the growth, so the
 * window holds the notes that sound now and slides to the far notes as they
 * come. It never shows the whole range at one time.
 *
 * @returns {number|null} the centre in MIDI numbers, or `fallbackCenter` when
 *   no note is in the window.
 */
export function targetViewCenter(notes, playheadBeat, {
  span,
  aheadBeats = 8,
  behindBeats = 1,
  edgeLanes = VIEW_EDGE_LANES,
  fallbackCenter = null,
} = {}) {
  const head = num(playheadBeat, 0);
  const ahead = Math.max(0, num(aheadBeats, 8));
  const behind = Math.max(0, num(behindBeats, 1));
  const lanes = Math.max(1, num(span, 1));
  const edge = lanes > 2 * VIEW_EDGE_LANES + 1 ? Math.max(0, num(edgeLanes, 0)) : 0;
  const room = Math.max(0, lanes - 1 - 2 * edge);

  const list = notesInWindow(notes, head - behind, head + ahead);
  const at = anchorIndex(list, head);
  if (at < 0) return fallbackCenter;

  let lo = list[at].midi;
  let hi = list[at].midi;
  // Grow forward: the notes that come next pull the window before they land.
  for (let i = at + 1; i < list.length; i++) {
    const next = list[i].midi;
    const newLo = Math.min(lo, next);
    const newHi = Math.max(hi, next);
    if (newHi - newLo > room) break;
    lo = newLo;
    hi = newHi;
  }
  // Grow backward: the note that just passed stays in view when it fits.
  for (let i = at - 1; i >= 0; i--) {
    const prev = list[i].midi;
    const newLo = Math.min(lo, prev);
    const newHi = Math.max(hi, prev);
    if (newHi - newLo > room) break;
    lo = newLo;
    hi = newHi;
  }
  return (lo + hi) / 2;
}

/**
 * Hold the window inside the range of the run. A window that is as wide as
 * the run, or wider, sits on the middle of the run and does not move.
 */
export function clampViewCenter(center, span, laneMin, laneMax) {
  const lo = num(laneMin, 0);
  const hi = num(laneMax, 0);
  const bottom = Math.min(lo, hi) - 0.5;
  const top = Math.max(lo, hi) + 0.5;
  const lanes = Math.max(1, num(span, 1));
  const middle = (bottom + top) / 2;
  if (lanes >= top - bottom) return middle;
  const value = num(center, middle);
  return Math.min(top - lanes / 2, Math.max(bottom + lanes / 2, value));
}

/**
 * Move the window one frame toward its target. The step is exponential, so
 * the window starts fast and settles softly. It snaps to the target when it
 * is very near, so it does not creep for ever.
 *
 * @param {number|null} current the centre now, or null before the first frame
 * @param {number} target the centre the window must reach
 * @param {number} dtSec the time since the last frame, in seconds
 */
export function easeViewCenter(current, target, dtSec, {
  timeConstantSec = VIEW_TIME_CONSTANT_SEC,
  snapSemitones = VIEW_SNAP_SEMITONES,
  maxDtSec = 0.1,
} = {}) {
  const goal = num(target, 0);
  if (current == null || !Number.isFinite(Number(current))) return goal;
  const from = Number(current);
  const tau = Math.max(0.001, num(timeConstantSec, VIEW_TIME_CONSTANT_SEC));
  const dt = Math.max(0, Math.min(num(maxDtSec, 0.1), num(dtSec, 0)));
  const next = goal + (from - goal) * Math.exp(-dt / tau);
  if (Math.abs(goal - next) <= Math.max(0, num(snapSemitones, 0))) return goal;
  return next;
}

/**
 * The lanes the window shows now, cut to the range of the run.
 * `lo` is the lowest lane and `hi` is the highest lane, both MIDI numbers.
 */
export function visibleLaneRange(center, span, laneMin, laneMax) {
  const lanes = Math.max(1, num(span, 1));
  const middle = num(center, 60);
  const lo = Math.max(Math.min(laneMin, laneMax), Math.ceil(middle - lanes / 2 - 0.5));
  const hi = Math.min(Math.max(laneMin, laneMax), Math.floor(middle + lanes / 2 + 0.5));
  return { lo, hi };
}

/** The lane height a note name needs for itself, in pixels. */
export const LABEL_MIN_PX = 15;

/**
 * The number of lanes between two note names in the gutter. A tall lane gets
 * its own name. Short lanes share, so no two names print on each other.
 */
export function laneLabelStep(lanePx) {
  const px = Math.max(1, num(lanePx, MIN_LANE_PX));
  if (px >= LABEL_MIN_PX) return 1;
  return Math.max(1, Math.ceil(LABEL_MIN_PX / px));
}

/**
 * True when the gutter prints the name of one lane. Every C keeps its name,
 * so the singer always sees the octave.
 */
export function shouldLabelLane(midi, { lanePx } = {}) {
  const step = laneLabelStep(lanePx);
  if (step <= 1) return true;
  const m = Math.round(num(midi, 0));
  if (((m % 12) + 12) % 12 === 0) return true;
  return ((m % step) + step) % step === 0;
}
