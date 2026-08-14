/**
 * Zero-dependency Node runner for Exercises bulk-upload tests.
 * Run: node tests/exercises/run.mjs
 */

await import('./bulk-import.mjs');
await import('./bulk-upload-ui.mjs');
await import('./video-classification.mjs');
await import('./normalize-takes.mjs');
await import('./folder-delete.mjs');
await import('./nested-folders.mjs');
await import('./unfiled-delete.mjs');
await import('./take-delete.mjs');
await import('./upload-accept.mjs');

console.log('exercises tests: ok');
