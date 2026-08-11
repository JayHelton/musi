/**
 * Create workspace, project model, and migration tests.
 * Run: node tests/create/run.mjs
 */

import { runProjectTests } from './projects.mjs';
import { runMigrationTests } from './migrations.mjs';

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

await runProjectTests(test);
await runMigrationTests(test);

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
