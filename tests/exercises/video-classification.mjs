// Video / audio MIME ambiguity tests for classifyUploadFile.
// Run: node tests/exercises/video-classification.mjs

import assert from 'node:assert/strict';
import { classifyUploadFile } from '../../js/exercisesBulk.js';

assert.deepEqual(classifyUploadFile({ type: 'audio/ogg', fileName: 'track.ogg' }), {
  kind: 'audio', mimeType: 'audio/ogg', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'video/ogg', fileName: 'clip.ogg' }), {
  kind: 'video', mimeType: 'video/ogg', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'audio/webm', fileName: 'stem.webm' }), {
  kind: 'audio', mimeType: 'audio/webm', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'video/webm', fileName: 'lesson.webm' }), {
  kind: 'video', mimeType: 'video/webm', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: 'video/mp4', fileName: 'drill.mp4' }), {
  kind: 'video', mimeType: 'video/mp4', supported: true, isGuitarPro: false,
});
assert.deepEqual(classifyUploadFile({ type: '', fileName: 'unknown.ogg' }), {
  kind: 'audio', mimeType: '', supported: true, isGuitarPro: false,
});

console.log('video-classification: ok');
console.log('\nall video-classification tests passed');
