/**
 * Stage 1 pitch scoring and detector tests.
 * Run: node tests/pitch/run.mjs
 */

import { runDetectorTests } from './detector.mjs';
import { runHarmonyTests } from './harmony.mjs';
import { runMetricsTests } from './metrics.mjs';
import { runOctaveTests } from './octave.mjs';
import { runRangeTests } from './range.mjs';
import { runRunnerTests } from './runner.mjs';
import { runTimelineTests } from './timeline.mjs';
import { runViewTests } from './view.mjs';
import { runTaskTests } from './tasks.mjs';
import { runProgressTests } from './progress.mjs';
import { runMicTests } from './mic.mjs';
import { runLockoutTests } from './lockout.mjs';

runMetricsTests();
runDetectorTests();
runRangeTests();
runTaskTests();
runRunnerTests();
runHarmonyTests();
runOctaveTests();
runTimelineTests();
runViewTests();
runProgressTests();
runLockoutTests();
await runMicTests();

console.log('pitch tests: ok');
