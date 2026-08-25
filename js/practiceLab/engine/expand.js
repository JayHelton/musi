// Segments to click events.
//
// The scheduler walks a plan step by step on the audio clock. This file does
// the same walk ahead of time, as a pure function, so the Node tests can count
// the clicks and measure the spacing without any audio.

import { segmentSeconds } from './timeline.js';

/**
 * The level of one click.
 * `accent` is the first click of an accented beat, `beat` is the first click of
 * any other beat, and `sub` is every other click.
 * @param {Object} seg
 * @param {number} beatIndex
 * @param {number} subIndex
 * @returns {'accent'|'beat'|'sub'}
 */
export function clickLevel(seg, beatIndex, subIndex) {
  if (subIndex !== 0) return 'sub';
  const every = Number(seg.accentEvery) || 0;
  if (every > 0 && beatIndex % every === 0) return 'accent';
  return 'beat';
}

/**
 * Expand one segment into its click events.
 * @param {Object} seg
 * @param {number} startSec seconds from the plan start
 * @returns {Object[]}
 */
export function expandSegment(seg, startSec = 0) {
  const out = [];
  if (!seg || !seg.beats || !seg.perBeat || !seg.bpm) return out;
  const clickSec = 60 / seg.bpm / seg.perBeat;
  for (let beatIndex = 0; beatIndex < seg.beats; beatIndex += 1) {
    for (let subIndex = 0; subIndex < seg.perBeat; subIndex += 1) {
      out.push({
        atSec: startSec + (beatIndex * seg.perBeat + subIndex) * clickSec,
        level: clickLevel(seg, beatIndex, subIndex),
        segmentId: seg.id,
        beatIndex,
        subIndex,
      });
    }
  }
  return out;
}

/**
 * The order the scheduler walks the segments of a plan.
 *
 * A plan that does not repeat yields each segment once. A plan that repeats
 * yields the head once, then the loop body `cycles` times.
 *
 * @param {Object} plan
 * @param {{ cycles?: number }} [options]
 * @returns {Object[]}
 */
export function segmentOrder(plan, { cycles = 1 } = {}) {
  const segments = Array.isArray(plan?.segments) ? plan.segments : [];
  if (!segments.length) return [];
  if (!plan.loop) return [...segments];

  const from = Math.max(0, Math.min(segments.length - 1, Number(plan.loopFrom) || 0));
  const head = segments.slice(0, from);
  const body = segments.slice(from);
  const out = [...head];
  for (let i = 0; i < Math.max(1, cycles); i += 1) out.push(...body);
  return out;
}

/**
 * Expand a plan into click events.
 * @param {Object} plan
 * @param {{ cycles?: number }} [options]
 * @returns {{ events: Object[], durationSec: number }}
 */
export function expandPlan(plan, options = {}) {
  const order = segmentOrder(plan, options);
  const events = [];
  let at = 0;
  for (const seg of order) {
    events.push(...expandSegment(seg, at));
    at += segmentSeconds(seg);
  }
  return { events, durationSec: at };
}
