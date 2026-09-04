// Per-score session store checks.
// Run: node tests/gp-player/session-store.mjs

import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const {
  loadSession, saveSession, clearSession, normalizeSession, createSessionWriter,
} = await import('../../js/gpPlayer/playerSessionStore.js');

assert.equal(loadSession('none'), null, 'no record returns null');
assert.equal(loadSession(''), null, 'an empty key returns null');

assert.ok(saveSession('score-a', {
  trackKind: 'guitar', trackIndex: 2, beat: 96.5, viewMode: 'both', zoom: 1.25,
  speedRatio: 0.75, loop: { enabled: true, startBeat: 96, endBeat: 112 },
  mixer: { mutedGuitars: [false, true], volumeGuitars: [1, 0.5] },
}));
const a = loadSession('score-a');
assert.equal(a.trackIndex, 2);
assert.equal(a.beat, 96.5);
assert.equal(a.viewMode, 'both');
assert.equal(a.zoom, 1.25);
assert.equal(a.speedRatio, 0.75);
assert.deepEqual(a.loop, { enabled: true, startBeat: 96, endBeat: 112 });
assert.deepEqual(a.mixer.mutedGuitars, [false, true]);
assert.deepEqual(a.mixer.volumeGuitars, [1, 0.5]);
assert.ok(a.savedAt > 0, 'savedAt is stamped');

// Bad values never reach the player.
const bad = normalizeSession({ zoom: 99, speedRatio: -1, loop: { startBeat: 5, endBeat: 5 }, viewMode: 'weird', beat: 'x' });
assert.equal(bad.zoom, null);
assert.equal(bad.speedRatio, null);
assert.equal(bad.loop, null);
assert.equal(bad.viewMode, null);
assert.equal(bad.beat, 0);

store.set('musi.gpSession:broken', '{not json');
assert.equal(loadSession('broken'), null, 'a broken record reads as no record');

clearSession('score-a');
assert.equal(loadSession('score-a'), null, 'clearSession removes the record');

// The writer coalesces writes.
let timers = [];
const writer = createSessionWriter('score-b', {
  intervalMs: 10,
  setTimeoutFn: (fn) => { timers.push(fn); return timers.length; },
  clearTimeoutFn: (id) => { timers[id - 1] = null; },
});
writer.write({ beat: 1 });
writer.write({ beat: 2 });
writer.write({ beat: 3 });
assert.equal(timers.filter(Boolean).length, 1, 'one timer for many writes');
assert.equal(loadSession('score-b'), null, 'nothing written before the timer fires');
timers[0]();
assert.equal(loadSession('score-b').beat, 3, 'the last record wins');
writer.write({ beat: 4 });
writer.flush();
assert.equal(loadSession('score-b').beat, 4, 'flush writes at once');
writer.destroy();

console.log('gp-player session-store: ok');
