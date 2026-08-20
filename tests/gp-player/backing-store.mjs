// The backing track store keeps one record per score and reads YouTube links.
// Run: node tests/gp-player/backing-store.mjs

import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};

const {
  MAX_TRIM_MS,
  getBackingTrack,
  invalidateGpBackingTrackCache,
  migrateBackingTrack,
  normalizeConfig,
  parseYouTubeUrl,
  removeBackingTrack,
  saveBackingTrack,
  usedAttachmentIds,
} = await import('../../js/gpBackingTrack.js');

// --- YouTube links ---------------------------------------------------------

assert.deepEqual(
  parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  { videoId: 'dQw4w9WgXcQ', startSec: 0 },
);
assert.deepEqual(
  parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=90'),
  { videoId: 'dQw4w9WgXcQ', startSec: 90 },
);
assert.deepEqual(
  parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'),
  { videoId: 'dQw4w9WgXcQ', startSec: 0 },
);
assert.deepEqual(
  parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
  { videoId: 'dQw4w9WgXcQ', startSec: 0 },
);
// A clock-style start time.
assert.equal(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.startSec, 90);
// A bare id.
assert.deepEqual(parseYouTubeUrl('dQw4w9WgXcQ'), { videoId: 'dQw4w9WgXcQ', startSec: 0 });
// Anything else is not a link.
assert.equal(parseYouTubeUrl('https://vimeo.com/12345'), null);
assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v=tooshort'), null);
assert.equal(parseYouTubeUrl(''), null);
assert.equal(parseYouTubeUrl(null), null);

// --- normalization ---------------------------------------------------------

// A record with no usable source can never turn the feature on.
assert.equal(normalizeConfig({ kind: 'file' }), null);
assert.equal(normalizeConfig({ kind: 'youtube' }), null);
assert.equal(normalizeConfig({ enabled: true }), null);
assert.equal(normalizeConfig(null), null);

// The trim cannot leave its range.
assert.equal(normalizeConfig({ kind: 'file', attachmentId: 'a1', trimMs: 99999 }).trimMs, MAX_TRIM_MS);
assert.equal(normalizeConfig({ kind: 'file', attachmentId: 'a1', trimMs: -99999 }).trimMs, -MAX_TRIM_MS);
// A bad number falls back instead of storing NaN.
assert.equal(normalizeConfig({ kind: 'file', attachmentId: 'a1', trimMs: 'x' }).trimMs, 0);
assert.equal(normalizeConfig({ kind: 'file', attachmentId: 'a1', volume: 5 }).volume, 1);

// One kind never keeps the other kind's id.
const asFile = normalizeConfig({ kind: 'file', attachmentId: 'a1', videoId: 'dQw4w9WgXcQ' });
assert.equal(asFile.videoId, '');
const asYt = normalizeConfig({ kind: 'youtube', videoId: 'dQw4w9WgXcQ', attachmentId: 'a1' });
assert.equal(asYt.attachmentId, '');

// --- the store -------------------------------------------------------------

assert.equal(getBackingTrack('score-a'), null);
// A save with no source stores nothing.
assert.equal(saveBackingTrack('score-a', { anchorSec: 3 }), null);
// A save with no key stores nothing.
assert.equal(saveBackingTrack('', { kind: 'file', attachmentId: 'a1' }), null);

const saved = saveBackingTrack('score-a', { kind: 'file', attachmentId: 'a1', name: 'Song.mp3' });
assert.equal(saved.kind, 'file');
assert.equal(saved.attachmentId, 'a1');
assert.equal(saved.enabled, false);

// A patch merges into the record it already holds.
const patched = saveBackingTrack('score-a', { anchorSec: 4.25, enabled: true });
assert.equal(patched.attachmentId, 'a1', 'a patch must keep the source');
assert.equal(patched.anchorSec, 4.25);
assert.equal(patched.enabled, true);

// Each score keeps its own record.
saveBackingTrack('score-b', { kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
assert.equal(getBackingTrack('score-a').kind, 'file');
assert.equal(getBackingTrack('score-b').kind, 'youtube');

// The record survives a reload.
invalidateGpBackingTrackCache();
assert.equal(getBackingTrack('score-a').anchorSec, 4.25);

// The attachment list names every file a record still points at.
assert.deepEqual(usedAttachmentIds(), ['a1']);

// A move carries the record to the new key.
migrateBackingTrack('score-a', 'score-c');
assert.equal(getBackingTrack('score-a'), null);
assert.equal(getBackingTrack('score-c').attachmentId, 'a1');

// Removal reports the file that is now free.
assert.equal(removeBackingTrack('score-c'), 'a1');
assert.equal(getBackingTrack('score-c'), null);
assert.deepEqual(usedAttachmentIds(), []);

// Damaged storage never throws.
store.set('musi.gpBackingTracks', '{not json');
invalidateGpBackingTrackCache();
assert.equal(getBackingTrack('score-a'), null);

console.log('backing-store: ok');
