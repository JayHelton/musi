// Follow guard checks for the GP score viewport.
// Run: node tests/gp-player/follow-scroll.mjs

import assert from 'node:assert/strict';
import {
  createFollowScrollGuard,
  readingZoneMove,
  FOLLOW_ACTIVE,
  FOLLOW_SUSPENDED_BY_USER,
} from '../../js/gpPlayer/followScroll.js';

let clock = 0;
const now = () => clock;

function makeGuard(opts = {}) {
  return createFollowScrollGuard({ ownScrollWindowMs: 200, now, ...opts });
}

clock = 1000;
const guard = makeGuard();
assert.equal(guard.isSuspended(), false, 'guard starts active');
assert.equal(guard.getState(), FOLLOW_ACTIVE);

guard.noteOwnScroll();
assert.equal(guard.noteScroll(), false, 'own scroll then scroll returns false');
assert.equal(guard.isSuspended(), false, 'own scroll does not suspend follow');

clock = 2000;
const userScrollGuard = makeGuard();
assert.equal(userScrollGuard.noteScroll(), true, 'scroll without own scroll returns true');
assert.equal(userScrollGuard.isSuspended(), true, 'user scroll suspends follow');
assert.equal(userScrollGuard.getState(), FOLLOW_SUSPENDED_BY_USER);

// A timer never ends the suspension. GP-AC-032.
clock = 2000 + 60 * 60 * 1000;
assert.equal(userScrollGuard.isSuspended(), true, 'suspension holds until resume()');
userScrollGuard.resume();
assert.equal(userScrollGuard.isSuspended(), false, 'resume clears the suspension');

clock = 5000;
const staleGuard = makeGuard();
staleGuard.noteOwnScroll();
clock = 5300;
assert.equal(staleGuard.noteScroll(), true, 'stale own-scroll window no longer explains scroll');

clock = 6000;
const oneShotGuard = makeGuard();
oneShotGuard.noteOwnScroll();
assert.equal(oneShotGuard.noteScroll(), false, 'first scroll after own scroll returns false');
assert.equal(oneShotGuard.noteScroll(), true, 'second scroll right after returns true');

clock = 7000;
const gestureGuard = makeGuard();
gestureGuard.noteOwnScroll();
gestureGuard.noteUserGesture();
assert.equal(gestureGuard.isSuspended(), true, 'user gesture suspends even inside own-scroll window');

const changes = [];
const watched = makeGuard({ onChange: (s) => changes.push(s) });
watched.suspend();
watched.suspend();
watched.resume();
assert.deepEqual(changes, [FOLLOW_SUSPENDED_BY_USER, FOLLOW_ACTIVE], 'onChange fires once per transition');

// ---- reading zone ----
const inZone = readingZoneMove({ viewportHeight: 1000, systemTop: 200, systemBottom: 320 });
assert.equal(inZone.move, false, 'a system inside the zone does not move the sheet');

const below = readingZoneMove({ viewportHeight: 1000, systemTop: 700, systemBottom: 820 });
assert.equal(below.move, true, 'a system below the zone moves the sheet');
assert.equal(below.targetTop, 180, 'the system rests at the top of the zone');

const above = readingZoneMove({ viewportHeight: 1000, systemTop: -50, systemBottom: 60 });
assert.equal(above.move, true, 'a system above the viewport moves the sheet');

const tall = readingZoneMove({ viewportHeight: 400, systemTop: 30, systemBottom: 380 });
assert.equal(tall.move, false, 'a tall system that shows its top stays put');

console.log('gp-player follow-scroll: ok');
