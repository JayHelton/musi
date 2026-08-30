// The Pitch Runner, seen from inside Practice Lab.
//
// Clean vocal practice reuses the runner Musi already ships: the same
// microphone, the same pitch engine, the same stage. Practice Lab adds no
// pitch analysis of its own, so this adapter is the one seam.
//
// `mountRunnerExercise` builds the runner stage inside a host element and
// attaches the shared engine to it. The handle stops the engine and releases
// the microphone again.

import { mountRunnerExercise } from '../../runnerExerciseView.js';

/**
 * Mount the shared Pitch Runner on one exercise.
 *
 * @param {HTMLElement} host
 * @param {Object} runnerConfig the stored runner config of the exercise
 * @param {{ onFinish?: (summary: Object) => void }} [options]
 * @returns {{ stop: () => void, destroy: () => void }}
 */
export function mountPitchRunner(host, runnerConfig, { onFinish } = {}) {
  return mountRunnerExercise(host, runnerConfig, { onFinish });
}
