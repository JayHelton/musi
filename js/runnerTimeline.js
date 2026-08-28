/**
 * Pass planning for the pitch runner.
 *
 * A run plays one phrase again and again. One play of the phrase is a pass.
 * Preview mode doubles every pass: the app plays the phrase first, and then
 * the singer sings the same phrase. A musician who does not sing much can
 * hear the target notes before the game listens.
 *
 * The timeline names each note by one index that counts up from 0. These
 * helpers turn that index into a place in the run. They hold no DOM code and
 * no audio code, so the Node test runners can import them.
 */

/** The beat grid of the runner. The runner draws and clicks in 4/4. */
export const RUNNER_BEATS_PER_MEASURE = 4;

/**
 * The shortest silence between a preview pass and the pass that follows it.
 * The gap grows to the next bar line, so both passes start on a downbeat.
 */
export const PASS_GAP_MIN_BEATS = 0.5;

/** Read a note count of 1 or more, or 0 when the phrase holds no notes. */
function safeLength(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The place one timeline index holds in the run.
 *
 * @param {number} index the position on the timeline, from 0
 * @param {number} passLength the number of notes in one pass
 * @param {boolean} previewOn true when preview mode plays each pass twice
 * @returns {{ step: number, pass: number, preview: boolean, passStart: boolean }|null}
 *   `step` is the position in the phrase. `pass` counts the passes played so
 *   far. `preview` is true when the app plays this note for the singer.
 *   Returns null when the phrase holds no notes.
 */
export function runnerPassPosition(index, passLength, previewOn = false) {
  const len = safeLength(passLength);
  if (!len) return null;
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const pass = Math.floor(i / len);
  const step = i % len;
  return {
    step,
    pass,
    // The first pass of every pair is the preview, so even passes preview.
    preview: previewOn ? pass % 2 === 0 : false,
    passStart: step === 0,
  };
}

/**
 * The number of notes the whole run puts on the timeline, preview notes
 * included. Returns 0 for an endless run.
 */
export function runnerStepBudget(passLength, repeats, previewOn = false) {
  const scored = runnerScoredBudget(passLength, repeats);
  if (!scored) return 0;
  return previewOn ? scored * 2 : scored;
}

/**
 * The number of notes the run scores. Preview notes do not count, so this is
 * the number the score and the finish test use. Returns 0 for an endless run.
 */
export function runnerScoredBudget(passLength, repeats) {
  const len = safeLength(passLength);
  const times = Math.floor(Number(repeats) || 0);
  if (!len || times <= 0) return 0;
  return len * times;
}

/**
 * The beat a new pass starts on. The pass waits at least `minGapBeats` and
 * then starts on the next bar line, so the preview and the answer both start
 * on a downbeat.
 */
export function nextPassStartBeat(beat, {
  beatsPerMeasure = RUNNER_BEATS_PER_MEASURE,
  minGapBeats = PASS_GAP_MIN_BEATS,
} = {}) {
  const from = Number(beat);
  if (!Number.isFinite(from)) return 0;
  const bar = Number(beatsPerMeasure) > 0 ? Number(beatsPerMeasure) : RUNNER_BEATS_PER_MEASURE;
  const gap = Math.max(0, Number(minGapBeats) || 0);
  const earliest = from + gap;
  const bars = Math.ceil(earliest / bar - 1e-9);
  return bars * bar;
}
