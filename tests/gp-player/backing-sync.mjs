// The backing track follower maps engine time to media time and corrects drift.
// Run: node tests/gp-player/backing-sync.mjs

import assert from 'node:assert/strict';
import {
  createBackingSync,
  driftRateFactor,
  targetMediaSec,
  ELEMENT_THRESHOLDS,
  IFRAME_THRESHOLDS,
} from '../../js/gpPlayer/backingSync.js';

// --- target time -----------------------------------------------------------

// At full speed the engine second and the score second are the same second.
assert.equal(targetMediaSec({ songSec: 10, rate: 1, anchorSec: 0, trimMs: 0 }), 10);

// Half speed doubles the engine seconds, so 10 engine seconds is 5 score
// seconds of the recording.
assert.equal(targetMediaSec({ songSec: 10, rate: 0.5, anchorSec: 0, trimMs: 0 }), 5);

// Double speed halves them.
assert.equal(targetMediaSec({ songSec: 10, rate: 2, anchorSec: 0, trimMs: 0 }), 20);

// The anchor names where bar 1 sits in the recording.
assert.equal(targetMediaSec({ songSec: 4, rate: 1, anchorSec: 3.5, trimMs: 0 }), 7.5);

// The trim shifts the recording in milliseconds.
assert.equal(
  Math.round(targetMediaSec({ songSec: 4, rate: 1, anchorSec: 0, trimMs: 250 }) * 1000),
  4250,
);

// A negative anchor is allowed, for a score that starts before the recording.
assert.equal(targetMediaSec({ songSec: 1, rate: 1, anchorSec: -3, trimMs: 0 }), -2);

// A bad rate falls back to full speed instead of producing NaN.
assert.equal(targetMediaSec({ songSec: 5, rate: 0, anchorSec: 0, trimMs: 0 }), 5);

// --- drift correction factor ----------------------------------------------

// A media that runs ahead must slow down.
assert.ok(driftRateFactor(0.05, ELEMENT_THRESHOLDS) < 1);
// A media that runs behind must speed up.
assert.ok(driftRateFactor(-0.05, ELEMENT_THRESHOLDS) > 1);
// The correction never passes the cap.
assert.ok(driftRateFactor(10, ELEMENT_THRESHOLDS) >= 1 - ELEMENT_THRESHOLDS.maxRateAdjust);
assert.ok(driftRateFactor(-10, ELEMENT_THRESHOLDS) <= 1 + ELEMENT_THRESHOLDS.maxRateAdjust);
// A source that cannot nudge its rate keeps the rate it has.
assert.equal(driftRateFactor(0.05, IFRAME_THRESHOLDS), 1);

// --- the follower ----------------------------------------------------------

function makeAdapter(overrides = {}) {
  const calls = { play: 0, pause: 0, seeks: [], rates: [] };
  const adapter = {
    calls,
    ready: true,
    error: '',
    duration: 300,
    driftThresholds: ELEMENT_THRESHOLDS,
    time: 0,
    playing: false,
    isPlaying: () => adapter.playing,
    play() { calls.play += 1; adapter.playing = true; },
    pause() { calls.pause += 1; adapter.playing = false; },
    seek(sec) { calls.seeks.push(sec); adapter.time = sec; },
    getTime: () => adapter.time,
    setRate(r) { calls.rates.push(r); },
    supportsRate: () => true,
    setVolume() {},
    destroy() {},
    ...overrides,
  };
  return adapter;
}

function makeHarness(adapterOverrides = {}, configOverrides = {}) {
  const adapter = makeAdapter(adapterOverrides);
  const clock = { songSec: 0, rate: 1, playing: true, holding: false };
  const config = { enabled: true, anchorSec: 0, trimMs: 0, ...configOverrides };
  let millis = 100000;
  const sync = createBackingSync({
    getAdapter: () => adapter,
    getConfig: () => config,
    getClock: () => clock,
    now: () => millis,
  });
  return {
    adapter,
    clock,
    config,
    sync,
    advance(ms) { millis += ms; },
  };
}

// A stopped engine leaves the media paused.
{
  const h = makeHarness();
  h.clock.playing = false;
  assert.equal(h.sync.tick(), 'idle');
  assert.equal(h.adapter.calls.play, 0);
}

// A disabled backing track never plays, even while the engine runs.
{
  const h = makeHarness({}, { enabled: false });
  assert.equal(h.sync.tick(), 'off');
  assert.equal(h.adapter.calls.play, 0);
}

// The first tick of a playing engine lines the media up and starts it.
{
  const h = makeHarness();
  h.clock.songSec = 12;
  h.config.anchorSec = 2;
  assert.equal(h.sync.tick(), 'seeking');
  assert.deepEqual(h.adapter.calls.seeks, [14]);
  assert.equal(h.adapter.calls.play, 1);
}

// A media inside the soft window is left alone.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  h.advance(1000);
  h.adapter.time = 5.005;
  assert.equal(h.sync.tick(), 'sync');
  assert.equal(h.adapter.calls.seeks.length, 1);
}

// A small drift is corrected with the rate, not with a jump.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  h.advance(1000);
  h.adapter.time = 5.05;
  assert.equal(h.sync.tick(), 'correcting');
  assert.equal(h.adapter.calls.seeks.length, 1);
  // Ahead of the score, so the last rate command is below full speed.
  assert.ok(h.adapter.calls.rates[h.adapter.calls.rates.length - 1] < 1);
}

// A large drift makes one seek.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  h.advance(1000);
  h.adapter.time = 9;
  assert.equal(h.sync.tick(), 'seeking');
  assert.equal(h.adapter.calls.seeks.length, 2);
  assert.equal(h.adapter.calls.seeks[1], 5);
}

// The cooldown stops a burst of seeks while the media settles.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  h.advance(1000);
  h.adapter.time = 9;
  h.sync.tick();
  const after = h.adapter.calls.seeks.length;
  h.advance(10);
  h.sync.tick();
  assert.equal(h.adapter.calls.seeks.length, after);
}

// A loop rest holds the score, so the media waits with it.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  h.clock.holding = true;
  assert.equal(h.sync.tick(), 'idle');
  assert.equal(h.adapter.calls.pause, 1);
  // The next pass starts the media again, at the loop start.
  h.clock.holding = false;
  h.clock.songSec = 2;
  h.advance(1000);
  assert.equal(h.sync.tick(), 'seeking');
  assert.equal(h.adapter.calls.seeks[h.adapter.calls.seeks.length - 1], 2);
}

// The score can start before the recording does. Wait in silence.
{
  const h = makeHarness({}, { anchorSec: -10 });
  h.clock.songSec = 1;
  assert.equal(h.sync.tick(), 'waiting');
  assert.equal(h.adapter.calls.play, 0);
}

// Past the end of the recording the media stops instead of looping.
{
  const h = makeHarness({ duration: 20 });
  h.clock.songSec = 30;
  assert.equal(h.sync.tick(), 'ended');
  assert.equal(h.adapter.calls.play, 0);
}

// A speed the source cannot play gives the notes back to the synth.
{
  const h = makeHarness({ supportsRate: (r) => r === 1 });
  h.clock.rate = 0.7;
  assert.equal(h.sync.tick(), 'unsupported-rate');
  assert.equal(h.adapter.calls.play, 0);
}

// A source that is still loading reports it and touches nothing.
{
  const h = makeHarness({ ready: false });
  assert.equal(h.sync.tick(), 'loading');
  assert.equal(h.adapter.calls.play, 0);
}

// A broken source reports the error instead of playing.
{
  const h = makeHarness({ error: 'no file' });
  assert.equal(h.sync.tick(), 'error');
  assert.equal(h.adapter.calls.play, 0);
}

// The practice rate reaches the media.
{
  const h = makeHarness();
  h.clock.rate = 0.5;
  h.clock.songSec = 10;
  h.sync.tick();
  assert.equal(h.adapter.calls.rates[0], 0.5);
  assert.equal(h.adapter.calls.seeks[0], 5);
}

// The rate is only sent when it changes.
{
  const h = makeHarness();
  h.clock.songSec = 5;
  h.sync.tick();
  const sent = h.adapter.calls.rates.length;
  h.advance(1000);
  h.adapter.time = 5.001;
  h.sync.tick();
  h.sync.tick();
  assert.equal(h.adapter.calls.rates.length, sent);
}

console.log('backing-sync: ok');
