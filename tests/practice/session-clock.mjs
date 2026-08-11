// Deterministic session clock and tempo-phase tests for practiceSession.
// Run via: node tests/practice/run.mjs

import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';

const storage = installLocalStorageShim();

const {
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  getSession,
  subscribeSession,
  __setMetronomeDriverForTests,
  __setTimeSourceForTests,
  __tickSessionClockForTests,
} = await import('../../js/practice/practiceSession.js');

function makeRecordingDriver() {
  const calls = [];
  const state = {
    bpm: 120,
    subdivision: 'quarter',
    beats: 4,
    accentFirst: true,
    playing: false,
  };
  const log = (name, arg) => calls.push({ name, arg });
  const driver = {
    calls,
    readState() { return { ...state }; },
    setBpm(bpm) { state.bpm = bpm; log('setBpm', bpm); },
    setSubdiv(subdiv) { state.subdivision = subdiv; log('setSubdiv', subdiv); },
    setBeats(beats) { state.beats = beats; log('setBeats', beats); },
    setAccentFirst(v) { state.accentFirst = v; log('setAccentFirst', v); },
    start() { state.playing = true; log('start', null); },
    stop() { state.playing = false; log('stop', null); },
    isPlaying() { return state.playing; },
    applyConfig(patch) {
      log('applyConfig', { ...patch });
      if (patch.bpm != null) driver.setBpm(patch.bpm);
      if (patch.subdivision != null) driver.setSubdiv(patch.subdivision);
      if (patch.beats != null) driver.setBeats(patch.beats);
      if (patch.accentFirst != null) driver.setAccentFirst(patch.accentFirst);
      if (patch.playing === true) driver.start();
      if (patch.playing === false) driver.stop();
    },
    syncFrom(patch) { driver.applyConfig(patch); },
  };
  return driver;
}

let now = 1000;
__setTimeSourceForTests(() => now);

function resetSession() {
  endSession();
  storage.reset();
  now = 1000;
}

function advance(ms) {
  now += ms;
}

function tick() {
  __tickSessionClockForTests('tick');
}

// elapsed accumulates only while running
{
  resetSession();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  startSession({ sourceType: 'free' });
  advance(500);
  tick();
  assert.equal(getSession().elapsedMs, 500);
  advance(300);
  tick();
  assert.equal(getSession().elapsedMs, 800);
  endSession();
}

// pause freezes and resume continues without a jump
{
  resetSession();
  __setMetronomeDriverForTests(makeRecordingDriver());
  startSession({ sourceType: 'free' });
  advance(1000);
  tick();
  pauseSession();
  const pausedAt = getSession().elapsedMs;
  assert.equal(pausedAt, 1000);
  advance(5000);
  tick();
  assert.equal(getSession().elapsedMs, pausedAt, 'paused clock does not advance');
  resumeSession();
  advance(250);
  tick();
  assert.equal(getSession().elapsedMs, 1250);
  endSession();
}

// timerTargetMs countdown reaching zero emits timer-complete exactly once
{
  resetSession();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));
  startSession({ sourceType: 'free', timerTargetMs: 2000 });
  advance(1500);
  tick();
  assert.ok(!reasons.includes('timer-complete'));
  advance(600);
  tick();
  assert.equal(reasons.filter((r) => r === 'timer-complete').length, 1);
  advance(500);
  tick();
  assert.equal(reasons.filter((r) => r === 'timer-complete').length, 1);
  assert.equal(getSession().status, 'running', 'session stays running after timer-complete');
  endSession();
}

// tempo phases advance at elapsed boundaries and apply bpm/subdivision through driver
{
  resetSession();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  startSession({
    sourceType: 'free',
    metronome: {
      bpm: 80,
      subdivision: 'quarter',
      playing: true,
      tempoPlan: {
        phases: [
          { seconds: 2, bpm: 80, subdiv: 'quarter' },
          { seconds: 2, bpm: 100, subdiv: 'eighth' },
        ],
        loop: false,
      },
    },
  });
  assert.equal(driver.readState().bpm, 80);
  assert.equal(driver.readState().subdivision, 'quarter');
  advance(2500);
  tick();
  assert.equal(getSession().metronome.bpm, 100);
  assert.equal(getSession().metronome.subdivision, 'eighth');
  assert.ok(driver.calls.some((c) => c.name === 'setBpm' && c.arg === 100));
  assert.ok(driver.calls.some((c) => c.name === 'setSubdiv' && c.arg === 'eighth'));
  endSession();
}

// non-looping exhausted plan stops the metronome
{
  resetSession();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));
  startSession({
    sourceType: 'free',
    metronome: {
      playing: true,
      tempoPlan: {
        phases: [{ seconds: 1, bpm: 90, subdiv: 'quarter' }],
        loop: false,
      },
    },
  });
  driver.start();
  assert.equal(driver.isPlaying(), true);
  advance(1100);
  tick();
  assert.equal(driver.isPlaying(), false);
  assert.equal(getSession().metronome.playing, false);
  assert.ok(reasons.includes('metronome'));
  endSession();
}

// looping plan wraps
{
  resetSession();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  startSession({
    sourceType: 'free',
    metronome: {
      playing: true,
      tempoPlan: {
        phases: [
          { seconds: 2, bpm: 70, subdiv: 'quarter' },
          { seconds: 2, bpm: 90, subdiv: 'eighth' },
        ],
        loop: true,
      },
    },
  });
  driver.start();
  advance(2500);
  tick();
  assert.equal(getSession().metronome.bpm, 90);
  advance(2000);
  tick();
  assert.equal(getSession().metronome.bpm, 70, 'loop wraps to first phase');
  assert.equal(driver.isPlaying(), true, 'metronome still running when plan loops');
  endSession();
}

console.log('practice session-clock: ok');
