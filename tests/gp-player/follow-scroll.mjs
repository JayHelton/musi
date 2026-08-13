// Auto-follow scroll guard checks for the GP parchment player.
// Run: node tests/gp-player/follow-scroll.mjs

import assert from 'node:assert/strict';
import { createFollowScrollGuard } from '../../js/gpPlayer/followScroll.js';

let clock = 0;
const now = () => clock;

function makeGuard(opts = {}) {
  return createFollowScrollGuard({
    cooldownMs: 2500,
    ownScrollWindowMs: 200,
    now,
    ...opts,
  });
}

clock = 1000;
const guard = makeGuard();

assert.equal(guard.isPaused(), false, 'guard starts unpaused');

guard.noteOwnScroll();
assert.equal(guard.noteScroll(), false, 'own scroll then scroll returns false');
assert.equal(guard.isPaused(), false, 'own scroll does not pause auto-follow');

clock = 2000;
const userScrollGuard = makeGuard();
assert.equal(userScrollGuard.noteScroll(), true, 'scroll without own scroll returns true');
assert.equal(userScrollGuard.isPaused(), true, 'user scroll pauses auto-follow');

clock = 4500;
assert.equal(userScrollGuard.isPaused(), false, 'pause ends after cooldownMs');

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
assert.equal(gestureGuard.isPaused(), true, 'user gesture pauses even when own-scroll window is open');

clock = 8000;
const resumeGuard = makeGuard();
resumeGuard.noteScroll();
assert.equal(resumeGuard.isPaused(), true, 'scroll pauses guard before resume');
resumeGuard.resume();
assert.equal(resumeGuard.isPaused(), false, 'resume clears pause');

console.log('gp-player follow-scroll: ok');
