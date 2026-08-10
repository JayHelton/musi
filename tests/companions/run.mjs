/**
 * Zero-dependency Node runner for exercise companion modules.
 * Run: node tests/companions/run.mjs
 */

await import('./types.mjs');
await import('./mount.mjs');

console.log('companions tests: ok');
