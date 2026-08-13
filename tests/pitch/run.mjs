/**
 * Stage 1 pitch scoring and detector tests.
 * Run: node tests/pitch/run.mjs
 */

import { runDetectorTests } from './detector.mjs';
import { runMetricsTests } from './metrics.mjs';
import { runRangeTests } from './range.mjs';
import { runTaskTests } from './tasks.mjs';

runMetricsTests();
runDetectorTests();
runRangeTests();
runTaskTests();

console.log('pitch tests: ok');
