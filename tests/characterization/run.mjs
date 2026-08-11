/**
 * Characterization test orchestrator for stored-data contracts.
 * Run: node tests/characterization/run.mjs
 */

await import('./storage-keys.mjs');
await import('./routine-export.mjs');
await import('./legacy-data.mjs');
console.log('characterization tests: ok');
