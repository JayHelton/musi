/**
 * Melody-guide timing for the pitch runner.
 *
 * The guide holds each note for the whole length of the note, so the singer
 * keeps a pitch reference under the voice from the first beat to the last. The
 * runner sends every cue out early by the output delay. These helpers hold the
 * arithmetic of that, so the tests can prove it without an AudioContext.
 */

import { ROOM_TAIL_SEC } from './pitchGuideLock.js';

/** The shortest guide tone the runner plays. A shorter tone gives no pitch. */
export const GUIDE_MIN_SEC = 0.12;

/**
 * The moment to start one guide tone, and how long the tone must sound.
 *
 * `heardStart` and `heardEnd` are the moments the player must hear the start
 * and the end of the note. The tone leaves the app early by `delaySec`, and it
 * never starts before `now`. A note that is almost over gets no tone.
 *
 * @param {{ heardStart: number, heardEnd: number, delaySec?: number, now?: number }} options
 * @returns {{ playAt: number, durSec: number }|null}
 */
export function guidePlayWindow({ heardStart, heardEnd, delaySec = 0, now = 0 }) {
  const values = [heardStart, heardEnd, delaySec, now];
  if (!values.every(v => Number.isFinite(v))) return null;
  const playAt = Math.max(heardStart - delaySec, now);
  const durSec = (heardEnd - delaySec) - playAt;
  if (durSec < GUIDE_MIN_SEC) return null;
  return { playAt, durSec };
}

/**
 * True when the melody guide sounds at `audioTime`.
 *
 * The guide holds each note, so it sounds through every note window. The tail
 * keeps the room echo of the guide out of the noise-floor picture.
 *
 * @param {Array<{ startAudioTime: number, endAudioTime: number }>} notes
 * @param {number} audioTime
 * @param {number} [tailSec]
 */
export function guideSoundsAt(notes, audioTime, tailSec = ROOM_TAIL_SEC) {
  if (!Array.isArray(notes) || !Number.isFinite(audioTime)) return false;
  const tail = Number.isFinite(tailSec) ? tailSec : 0;
  return notes.some(note => (
    audioTime >= note.startAudioTime && audioTime < note.endAudioTime + tail
  ));
}
