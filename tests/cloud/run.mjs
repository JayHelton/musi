/**
 * Cloud sync Phase 1 node tests.
 * Run: node tests/cloud/run.mjs
 */

import { installIdbShim } from '../exercises/idbShim.mjs';
import {
  installLocalStorageShim,
  installWindowShim,
  resetHarness,
} from './harness.mjs';
import { runRecordMapTests } from './recordMap.mjs';
import { runContentHashTests } from './contentHash.mjs';
import { runShadowDiffTests } from './shadowDiff.mjs';
import { runMergeRulesTests } from './mergeRules.mjs';
import { runReconcileTests } from './reconcile.mjs';
import { run as runTransportFakeTests } from './transportFake.mjs';
import { run as runSyncFlowTests } from './syncFlow.mjs';
import { run as runCloudSyncFlowTests } from './cloudSyncFlow.mjs';
import { run as runFileSyncTests } from './fileSync.mjs';
import { run as runGoogleAuthTests } from './googleAuth.mjs';

const store = installLocalStorageShim();
const listeners = installWindowShim();
installIdbShim();

let passed = 0;

async function test(name, fn) {
  resetHarness(store, listeners);
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

await runRecordMapTests(test);
await runContentHashTests(test);
await runShadowDiffTests(test);
await runMergeRulesTests(test);
await runReconcileTests(test);
await runTransportFakeTests(test);
await runSyncFlowTests(test);
await runCloudSyncFlowTests(test);
await runFileSyncTests(test);
await runGoogleAuthTests(test);

console.log(`\n${passed} passed`);
process.exit(0);
