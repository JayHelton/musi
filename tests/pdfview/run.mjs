/**
 * Zero-dependency Node runner for the in-app PDF view tests.
 * Run: node tests/pdfview/run.mjs
 */

await import('./link-boxes.mjs');
await import('./pdf-links.mjs');

console.log('pdfview tests: ok');
