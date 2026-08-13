/**
 * Stage 1 pitch scoring and detector tests.
 * Run: node tests/pitch/run.mjs
 */

import { runDetectorTests } from './detector.mjs';
import { runMetricsTests } from './metrics.mjs';

runMetricsTests();
runDetectorTests();

console.log('pitch tests: ok');
