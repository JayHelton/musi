/**
 * Zero-dependency Node runner for practice session tests.
 * Run: node tests/practice/run.mjs
 */

import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';

const storage = installLocalStorageShim();
globalThis.window = globalThis;

const progressMod = await import('../../js/progress/progressLog.js');
progressMod.invalidateProgressLogCache();

const {
  SESSION_STORAGE_KEY,
  startSession,
  getSession,
  endSession,
  pauseSession,
  resumeSession,
  setActiveItem,
  nextItem,
  previousItem,
  restartItem,
  setMetronome,
  toggleMetronome,
  setLoop,
  setNotes,
  setTimerTarget,
  recordAttempt,
  subscribeSession,
  restoreSession,
  hasActiveSession,
  __setMetronomeDriverForTests,
  __setTimeSourceForTests,
  __tickSessionClockForTests,
} = await import('../../js/practice/practiceSession.js');

const {
  getMusicContext,
  getMusicContextDefaults,
  resetOverrides,
} = await import('../../js/core/musicContext.js');

const { getSetting, invalidateSettingsCache } = await import('../../js/persistence.js');
const { setContext } = await import('../../js/musicalContext.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function makeRecordingDriver(initial = {}) {
  const calls = [];
  const state = {
    bpm: initial.bpm ?? 120,
    subdivision: initial.subdivision ?? 'quarter',
    beats: initial.beats ?? 4,
    accentFirst: initial.accentFirst ?? true,
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

let fakeNow = 5000;
__setTimeSourceForTests(() => fakeNow);

function resetAll() {
  endSession();
  storage.reset();
  invalidateSettingsCache();
  progressMod.invalidateProgressLogCache();
  progressMod.clearProgressLog();
  resetOverrides();
  setContext({ root: 'C', scale: 'Major (Ionian)', tempo: 120 }, 'test-reset');
  fakeNow = 5000;
}

const sampleItems = [
  { id: 'item-a', label: 'A', targetType: 'exercise', targetId: 'ex-a' },
  { id: 'item-b', label: 'B', targetType: 'exercise', targetId: 'ex-b' },
  { id: 'item-c', label: 'C', targetType: 'exercise', targetId: 'ex-c' },
];

test('SESSION_STORAGE_KEY matches practice.session', () => {
  assert.equal(SESSION_STORAGE_KEY, 'practice.session');
});

test('lifecycle start pause resume end emits expected reasons', () => {
  resetAll();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));

  startSession({
    sourceType: 'free',
    items: sampleItems,
    metronome: { bpm: 100, playing: true },
  });
  assert.ok(reasons.includes('start'));
  pauseSession();
  assert.ok(reasons.includes('pause'));
  assert.equal(driver.isPlaying(), false);
  resumeSession();
  assert.ok(reasons.includes('resume'));
  endSession();
  assert.ok(reasons.includes('end'));
  assert.equal(hasActiveSession(), false);
});

test('second session ends first once without double metronome', () => {
  resetAll();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);

  startSession({ sourceType: 'free', metronome: { playing: true } });
  driver.start();
  const stopsBefore = driver.calls.filter((c) => c.name === 'stop').length;

  startSession({ sourceType: 'free', metronome: { playing: true } });
  const stopsAfterFirst = driver.calls.filter((c) => c.name === 'stop').length;
  assert.equal(stopsAfterFirst - stopsBefore, 1, 'exactly one stop when replacing session');
  assert.equal(driver.isPlaying(), true, 'new session metronome may start');
  endSession();
  assert.equal(driver.isPlaying(), false);
});

test('item navigation clamps and restart-item fires', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));

  startSession({ sourceType: 'workbook', sourceId: 'wb-1', items: sampleItems });
  assert.equal(getSession().activeItemId, 'item-a');

  previousItem();
  assert.equal(getSession().activeItemId, 'item-a');
  nextItem();
  assert.equal(getSession().activeItemId, 'item-b');
  nextItem();
  assert.equal(getSession().activeItemId, 'item-c');
  nextItem();
  assert.equal(getSession().activeItemId, 'item-c');

  restartItem();
  assert.ok(reasons.includes('restart-item'));
  endSession();
});

test('setActiveItem unknown id is a no-op', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  startSession({ sourceType: 'free', items: sampleItems });
  setActiveItem('missing');
  assert.equal(getSession().activeItemId, 'item-a');
  endSession();
});

test('setMetronome patch write-through and toggleMetronome', () => {
  resetAll();
  const driver = makeRecordingDriver();
  __setMetronomeDriverForTests(driver);
  startSession({ sourceType: 'free', metronome: { bpm: 100, beats: 4 } });

  setMetronome({ bpm: 132, subdivision: 'eighth', beats: 3, accentFirst: false });
  assert.equal(getSession().metronome.bpm, 132);
  assert.equal(getSession().metronome.subdivision, 'eighth');
  assert.equal(getSession().metronome.beats, 3);
  assert.equal(getSession().metronome.accentFirst, false);
  assert.ok(driver.calls.some((c) => c.name === 'setBpm' && c.arg === 132));

  toggleMetronome();
  assert.equal(getSession().metronome.playing, true);
  assert.equal(driver.isPlaying(), true);
  toggleMetronome();
  assert.equal(getSession().metronome.playing, false);
  endSession();
});

test('setLoop set and clear', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));
  startSession({ sourceType: 'free' });
  setLoop({ startMs: 0, endMs: 4000, enabled: true });
  assert.deepEqual(getSession().loop, { enabled: true, startMs: 0, endMs: 4000 });
  assert.ok(reasons.includes('loop'));
  setLoop(null);
  assert.equal(getSession().loop, null);
  endSession();
});

test('setNotes updates session notes', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));
  startSession({ sourceType: 'free' });
  setNotes('focus on dynamics');
  assert.equal(getSession().notes, 'focus on dynamics');
  assert.ok(reasons.includes('notes'));
  endSession();
});

test('recordAttempt fills defaults and appends attemptIds', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  startSession({
    sourceType: 'free',
    items: sampleItems,
    metronome: { bpm: 110 },
  });
  fakeNow += 1500;
  __tickSessionClockForTests('tick');

  const attempt = recordAttempt({ status: 'green' });
  assert.equal(attempt.targetType, 'exercise');
  assert.equal(attempt.targetId, 'ex-a');
  assert.equal(attempt.bpm, 110);
  assert.equal(attempt.durationMs, 1500);
  assert.equal(getSession().attemptIds.includes(attempt.id), true);

  const listed = progressMod.listAttempts({ targetId: 'ex-a' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, attempt.id);
  endSession();
});

test('music context override pushed on start and popped on end', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const defaultsBefore = getMusicContextDefaults();

  startSession({
    sourceType: 'routine-session',
    sourceId: 'rs-1',
    metronome: { bpm: 95 },
  });
  assert.equal(getMusicContext().tempoBpm, 95);
  assert.equal(getMusicContextDefaults().tempoBpm, defaultsBefore.tempoBpm);

  endSession();
  assert.equal(getMusicContext().tempoBpm, defaultsBefore.tempoBpm);
});

test('snapshot persistence and restoreSession returns paused session', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  startSession({
    sourceType: 'workbook',
    sourceId: 'wb-2',
    items: sampleItems,
    notes: 'saved',
    metronome: { bpm: 88 },
  });
  fakeNow += 800;
  pauseSession();

  const snap = getSetting(SESSION_STORAGE_KEY, null);
  assert.ok(snap && snap.id);
  assert.equal(snap.status, 'paused');
  assert.equal(snap.notes, 'saved');

  endSession();
  invalidateSettingsCache();
  storage.store.set('musi:settings', JSON.stringify({ [SESSION_STORAGE_KEY]: snap }));
  invalidateSettingsCache();

  const restored = restoreSession();
  assert.ok(restored);
  assert.equal(restored.status, 'paused');
  assert.equal(restored.sourceType, 'workbook');
  assert.equal(restored.metronome.bpm, 88);
  assert.equal(restored.metronome.playing, false);
  assert.equal(restored.activeItemId, 'item-a');
  endSession();
});

test('stale snapshot older than 12h is discarded', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const stale = {
    id: 'ps-stale',
    sourceType: 'free',
    sourceId: '',
    startedAt: new Date().toISOString(),
    elapsedMs: 100,
    timerTargetMs: null,
    metronome: { bpm: 120, subdivision: 'quarter', beats: 4, accentFirst: true, playing: false },
    activeItemId: null,
    items: [],
    notes: '',
    status: 'paused',
    savedAt: new Date(Date.now() - 13 * 3600000).toISOString(),
  };
  storage.store.set('musi:settings', JSON.stringify({ [SESSION_STORAGE_KEY]: stale }));
  invalidateSettingsCache();

  const restored = restoreSession();
  assert.equal(restored, null);
  assert.equal(getSetting(SESSION_STORAGE_KEY, null), null);
});

test('subscriber isolation and unsubscribe during notification', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  let secondCalled = false;
  const unsub = subscribeSession(() => {
    unsub();
    secondCalled = true;
  });
  subscribeSession(() => {
    throw new Error('boom');
  });
  startSession({ sourceType: 'free' });
  assert.equal(secondCalled, true);
  endSession();
});

test('setTimerTarget resets countdown baseline', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  const reasons = [];
  subscribeSession((_s, meta) => reasons.push(meta.reason));
  startSession({ sourceType: 'free', timerTargetMs: 5000 });
  fakeNow += 2000;
  __tickSessionClockForTests('tick');
  setTimerTarget(1000);
  fakeNow += 900;
  __tickSessionClockForTests('tick');
  assert.ok(!reasons.includes('timer-complete'));
  fakeNow += 200;
  __tickSessionClockForTests('tick');
  assert.ok(reasons.includes('timer-complete'));
  endSession();
});

test('endSession clears timers so process can exit', () => {
  resetAll();
  __setMetronomeDriverForTests(makeRecordingDriver());
  startSession({ sourceType: 'free', metronome: { playing: true } });
  endSession();
  assert.equal(hasActiveSession(), false);
});

const { runSessionWiringTests } = await import('./session-wiring.mjs');
runSessionWiringTests({
  test,
  startSession,
  getSession,
  endSession,
  restoreSession,
  SESSION_STORAGE_KEY,
  resetAll,
  __setMetronomeDriverForTests,
  makeRecordingDriver,
  getSetting,
  invalidateSettingsCache,
  storage,
});

await import('./session-clock.mjs');

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
