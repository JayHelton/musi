/**
 * Zero-dependency Node tests for Practice Lab.
 *
 * The feature keeps its timing logic in pure functions with no audio and no
 * DOM, so this runner reads them directly. The store test uses the in-memory
 * adapter, and the scheduler test uses a fake clock and a fake click port.
 *
 * Run: node tests/practice-lab/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUBDIVISIONS,
  LIMITS,
  clampTo,
  metronomePlan,
  ratioPlan,
  speedPlan,
  speedSteps,
  segmentSeconds,
  segmentClicks,
} from '../../js/practiceLab/engine/timeline.js';
import { expandPlan, expandSegment, segmentOrder, clickLevel } from '../../js/practiceLab/engine/expand.js';
import { createScheduler } from '../../js/practiceLab/engine/scheduler.js';
import { createCountdown } from '../../js/practiceLab/engine/countdown.js';
import {
  newEntry,
  sortEntries,
  warmUpPicks,
  formatDuration,
  plural,
  ENTRY_KINDS,
} from '../../js/practiceLab/model/entries.js';
import {
  keyNotes,
  keyChords,
  chordLadder,
  compareKeys,
  qualityIndex,
  describeStack,
  buildChord,
  isHeptatonic,
} from '../../js/reference/keyChords.js';
import {
  findVoicings,
  fretsForPitchClass,
  groupByPosition,
  VOICING_DEFAULTS,
} from '../../js/reference/voicings.js';
import {
  alterationsFor,
  borrowedChords,
  secondaryDominants,
  tritoneSubs,
  leadingToneDiminished,
  outsideTones,
} from '../../js/reference/outside.js';
import { createCueRun } from '../../js/practiceLab/engine/cueRun.js';
import {
  VOCAL_SETTINGS,
  sourceFolderKey,
  registerKey,
  sourceState,
  newVocalAttempt,
  describeVocalAttempt,
  summarizeAttempts,
  strainWarning,
  withRepReports,
  SOURCE_OK,
  SOURCE_UNSET,
  SOURCE_MISSING,
  SOURCE_EMPTY,
} from '../../js/practiceLab/model/vocal.js';
import { createMemoryStore } from '../../js/practiceLab/adapters/memoryStore.js';
import { createPracticeLab } from '../../js/practiceLab/container.js';
import { portProblems, PORT_CONTRACT, PORT_NAMES } from '../../js/practiceLab/ports.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Fakes                                                               */
/* ------------------------------------------------------------------ */

/** A clock the test drives by hand. */
function fakeClock(startMs = 0) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();
  return {
    nowMs: () => now,
    setInterval(fn, ms) {
      const id = nextId; nextId += 1;
      timers.set(id, { fn, ms, nextAt: now + ms });
      return id;
    },
    clearInterval(id) { timers.delete(id); },
    /** Move the clock forward and fire every timer that comes due. */
    advance(ms) {
      const target = now + ms;
      let guard = 0;
      while (guard < 10000) {
        guard += 1;
        let soonest = null;
        for (const timer of timers.values()) {
          if (timer.nextAt <= target && (!soonest || timer.nextAt < soonest.nextAt)) soonest = timer;
        }
        if (!soonest) break;
        now = soonest.nextAt;
        soonest.nextAt = now + soonest.ms;
        soonest.fn();
      }
      now = target;
    },
    timerCount: () => timers.size,
  };
}

/** A click port on a clock the test drives by hand. */
function fakeClick(clock, { startSec = 0 } = {}) {
  const scheduled = [];
  let primed = 0;
  return {
    prime() { primed += 1; },
    now() { return startSec + clock.nowMs() / 1000; },
    schedule(atSec, level) { scheduled.push({ atSec, level }); },
    stop() {},
    scheduled,
    primeCount: () => primed,
  };
}

function fakePorts(overrides = {}) {
  const clock = overrides.clock || fakeClock();
  const click = overrides.click || fakeClick(clock);
  let counter = 0;
  return {
    clock,
    click,
    store: overrides.store || createMemoryStore(),
    audioSession: overrides.audioSession || {
      claim: () => ({ id: 'test' }),
      release: () => {},
    },
    video: overrides.video || {
      openMirror: async () => ({ stream: null }),
      startRecording: async () => {},
      stopRecording: async () => null,
      close: () => {},
      capabilities: () => ({ camera: false, recorder: false }),
    },
    ids: overrides.ids || { newId: (prefix) => { counter += 1; return `${prefix}-${counter}`; } },
    notify: overrides.notify || { toast: () => {} },
  };
}

/* ------------------------------------------------------------------ */
console.log('Ports');

await test('the contract names every port and every method', () => {
  assert.deepEqual(PORT_NAMES, ['store', 'click', 'audioSession', 'video', 'clock', 'ids', 'notify']);
  assert.deepEqual(PORT_CONTRACT.store, [
    'appendEntry', 'listEntries', 'saveClip', 'getClip', 'listClips', 'deleteClip', 'isAvailable',
  ]);
  assert.ok(PORT_CONTRACT.click.includes('schedule'));
});

await test('a missing port method is a problem', () => {
  assert.deepEqual(portProblems(fakePorts()), []);
  const broken = fakePorts();
  delete broken.click.schedule;
  const problems = portProblems(broken);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /click.*schedule/);
});

await test('the container refuses an incomplete port bag', () => {
  assert.throws(() => createPracticeLab({}), /ports are incomplete/);
});

/* ------------------------------------------------------------------ */
console.log('Entries');

await test('the entry kinds are the two things the lab keeps', () => {
  assert.deepEqual(ENTRY_KINDS, ['vocal-attempt', 'warm-up']);
});

await test('an unknown entry kind is refused', () => {
  assert.throws(
    () => newEntry({ id: 'e', at: 'x', kind: 'note' }),
    /unknown entry kind/,
  );
});

await test('an entry copies its data and carries no session', () => {
  const data = { exerciseId: 'x1' };
  const entry = newEntry({ id: 'e1', at: '2026-08-25T18:00:00.000Z', kind: 'vocal-attempt', data });
  data.exerciseId = 'changed';
  assert.equal(entry.data.exerciseId, 'x1');
  assert.equal('sessionId' in entry, false);
});

await test('entries sort oldest first', () => {
  const list = sortEntries([
    { id: 'b', at: '2026-08-25T18:05:00.000Z' },
    { id: 'a', at: '2026-08-25T18:00:00.000Z' },
    { id: 'c', at: '2026-08-25T18:05:00.000Z' },
  ]);
  assert.deepEqual(list.map(e => e.id), ['a', 'b', 'c']);
});

await test('the warm-up picks read newest first and skip the other kinds', () => {
  const picks = warmUpPicks([
    { id: 'a', at: '2026-08-25T18:00:00.000Z', kind: 'warm-up', data: { beatId: 'b1', rudimentId: 'r1' } },
    { id: 'v', at: '2026-08-25T18:01:00.000Z', kind: 'vocal-attempt', data: { exerciseId: 'x' } },
    { id: 'b', at: '2026-08-25T18:02:00.000Z', kind: 'warm-up', data: { beatId: 'b2', rudimentId: 'r2' } },
    { id: 'c', at: '2026-08-25T18:03:00.000Z', kind: 'warm-up', data: { beatId: 'b3', rudimentId: 'r3' } },
    { id: 'd', at: '2026-08-25T18:04:00.000Z', kind: 'warm-up', data: { beatId: 'b4', rudimentId: 'r4' } },
  ], 3);
  assert.deepEqual(picks.map(p => p.beatId), ['b4', 'b3', 'b2']);
  assert.deepEqual(picks.map(p => p.rudimentId), ['r4', 'r3', 'r2']);
});

await test('a duration reads as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(63000), '1:03');
  assert.equal(formatDuration(3723000), '1:02:03');
});

await test('a count and its word agree', () => {
  assert.equal(plural(0, 'take'), '0 takes');
  assert.equal(plural(1, 'take'), '1 take');
  assert.equal(plural(2, 'cycle'), '2 cycles');
});

/* ------------------------------------------------------------------ */
console.log('Click plans');

await test('the subdivisions are the four of the data model', () => {
  assert.deepEqual(SUBDIVISIONS.map(s => s.id), ['quarter', 'eighth', 'triplet', 'sixteenth']);
  assert.deepEqual(SUBDIVISIONS.map(s => s.perBeat), [1, 2, 3, 4]);
});

await test('a setting clamps into its range', () => {
  assert.equal(clampTo(LIMITS.bpm, 5), 30);
  assert.equal(clampTo(LIMITS.bpm, 900), 300);
  assert.equal(clampTo(LIMITS.bpm, 'nonsense'), 80);
});

await test('the metronome plan is one segment that repeats', () => {
  const plan = metronomePlan({ bpm: 80, beatsPerBar: 4 });
  assert.equal(plan.kind, 'metronome');
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.loop, true);
  assert.equal(plan.loopFrom, 0);
  assert.equal(segmentSeconds(plan.segments[0]), 3);
});

await test('the ratio plan alternates the two loops around a count-in', () => {
  const plan = ratioPlan({
    bpm: 80, beats: 4, loopA: 'eighth', loopB: 'sixteenth',
    countIn: true, initialCountIn: 4, repeatCountIn: 4,
  });
  assert.deepEqual(plan.segments.map(s => s.phase),
    ['count-in', 'loop-a', 'count-in', 'loop-b', 'count-in']);
  assert.equal(plan.loop, true);
  assert.equal(plan.loopFrom, 1);
});

await test('the ratio segments hold the right click count', () => {
  const plan = ratioPlan({ bpm: 80, beats: 4, loopA: 'eighth', loopB: 'sixteenth' });
  const [countIn, loopA, , loopB] = plan.segments;
  assert.equal(segmentClicks(countIn), 4);
  assert.equal(segmentClicks(loopA), 8);
  assert.equal(segmentClicks(loopB), 16);
});

await test('the ratio cycle is A, count-in, B, count-in, A', () => {
  const plan = ratioPlan({ bpm: 80, beats: 4 });
  const order = segmentOrder(plan, { cycles: 2 });
  assert.deepEqual(order.map(s => s.phase), [
    'count-in',
    'loop-a', 'count-in', 'loop-b', 'count-in',
    'loop-a', 'count-in', 'loop-b', 'count-in',
  ]);
});

await test('the count-in off case is two segments that repeat from the start', () => {
  const plan = ratioPlan({ bpm: 80, beats: 4, countIn: false });
  assert.deepEqual(plan.segments.map(s => s.phase), ['loop-a', 'loop-b']);
  assert.equal(plan.loopFrom, 0);
  const order = segmentOrder(plan, { cycles: 2 });
  assert.deepEqual(order.map(s => s.phase), ['loop-a', 'loop-b', 'loop-a', 'loop-b']);
});

await test('a triplet segment holds three clicks in each beat', () => {
  const plan = ratioPlan({ bpm: 120, beats: 2, loopA: 'triplet', loopB: 'quarter', countIn: false });
  const events = expandSegment(plan.segments[0], 0);
  assert.equal(events.length, 6);
  assert.deepEqual(events.map(e => e.level), ['accent', 'sub', 'sub', 'accent', 'sub', 'sub']);
  // 120 BPM, three clicks in a beat: one sixth of a second each.
  assert.ok(Math.abs(events[1].atSec - 1 / 6) < 1e-9);
});

await test('every count-in click is an accent', () => {
  const plan = ratioPlan({ bpm: 90, beats: 4, initialCountIn: 3 });
  const events = expandSegment(plan.segments[0], 0);
  assert.equal(events.length, 3);
  assert.ok(events.every(e => e.level === 'accent'));
});

await test('the accent lands on the first beat of a bar', () => {
  const plan = metronomePlan({ bpm: 60, beatsPerBar: 4 });
  const { events } = expandPlan(plan, { cycles: 1 });
  assert.deepEqual(events.map(e => e.level), ['accent', 'beat', 'beat', 'beat']);
  assert.deepEqual(events.map(e => e.atSec), [0, 1, 2, 3]);
  assert.equal(clickLevel({ accentEvery: 0 }, 0, 0), 'beat');
});

await test('the speed ladder climbs by the increment and clamps to the end', () => {
  assert.deepEqual(speedSteps({ startBpm: 80, endBpm: 100, increment: 5 }), [80, 85, 90, 95, 100]);
  assert.deepEqual(speedSteps({ startBpm: 80, endBpm: 100, increment: 7 }), [80, 87, 94, 100]);
  assert.deepEqual(speedSteps({ startBpm: 90, endBpm: 90, increment: 5 }), [90]);
});

await test('the speed plan holds one step for each tempo', () => {
  const plan = speedPlan({
    timeSig: 4, startBpm: 80, endBpm: 100, increment: 5,
    barsPerLoop: 4, loopsPerStep: 2, countIn: true, initialCountIn: 4, stepCountIn: 4,
  });
  const steps = plan.segments.filter(s => s.phase === 'step');
  assert.deepEqual(steps.map(s => s.bpm), [80, 85, 90, 95, 100]);
  // Four bars for each loop, two loops, four beats in a bar.
  assert.ok(steps.every(s => s.beats === 32));
  assert.equal(plan.loop, false);
  assert.equal(plan.topBpm, 100);
  // Every step carries its own count-in.
  assert.equal(plan.segments.filter(s => s.phase === 'count-in').length, 5);
});

await test('the speed plan honours the time signature', () => {
  const plan = speedPlan({
    timeSig: 3, startBpm: 90, endBpm: 90, increment: 5,
    barsPerLoop: 2, loopsPerStep: 1, countIn: false,
  });
  const [step] = plan.segments;
  assert.equal(step.beats, 6);
  assert.equal(step.accentEvery, 3);
});

await test('the speed trainer refuses an end tempo below the start tempo', () => {
  assert.equal(speedPlan({ startBpm: 120, endBpm: 100, increment: 5 }), null);
  assert.deepEqual(speedSteps({ startBpm: 120, endBpm: 100, increment: 5 }), []);
});

await test('a short ladder stops at the end tempo', () => {
  const plan = speedPlan({
    timeSig: 4, startBpm: 80, endBpm: 90, increment: 5,
    barsPerLoop: 1, loopsPerStep: 1, countIn: false,
  });
  assert.equal(plan.topBpm, 90);
  assert.equal(plan.segments.at(-1).bpm, 90);
  const { durationSec } = expandPlan(plan);
  // Four beats at 80, 85, and 90 BPM.
  const expected = (4 * 60) / 80 + (4 * 60) / 85 + (4 * 60) / 90;
  assert.ok(Math.abs(durationSec - expected) < 1e-9);
});

/* ------------------------------------------------------------------ */
console.log('Scheduler');

await test('the scheduler books every click of a finite plan', () => {
  const clock = fakeClock();
  const click = fakeClick(clock);
  const scheduler = createScheduler({ click, clock });
  const plan = speedPlan({
    timeSig: 4, startBpm: 120, endBpm: 120, increment: 5,
    barsPerLoop: 1, loopsPerStep: 1, countIn: false,
  });
  const ends = [];
  scheduler.start(plan, { onEnd: (result) => ends.push(result) });
  // Four beats at 120 BPM is two seconds.
  clock.advance(4000);
  assert.equal(click.scheduled.length, 4);
  assert.deepEqual(click.scheduled.map(c => c.level), ['accent', 'beat', 'beat', 'beat']);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].completed, true);
  assert.equal(scheduler.isRunning(), false);
  assert.equal(clock.timerCount(), 0);
});

await test('the scheduler repeats a looping plan and counts the cycles', () => {
  const clock = fakeClock();
  const click = fakeClick(clock);
  const scheduler = createScheduler({ click, clock });
  scheduler.start(metronomePlan({ bpm: 120, beatsPerBar: 4 }));
  clock.advance(4000);
  // Two seconds for each bar. Two bars land inside four seconds.
  assert.ok(click.scheduled.length >= 8);
  assert.ok(scheduler.cycleCount() >= 1);
  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
});

await test('a tempo change takes effect without a restart', () => {
  const clock = fakeClock();
  const click = fakeClick(clock);
  const scheduler = createScheduler({ click, clock });
  scheduler.start(metronomePlan({ bpm: 60, beatsPerBar: 4 }));
  clock.advance(2000);
  const beforeGap = click.scheduled.at(-1).atSec - click.scheduled.at(-2).atSec;
  assert.ok(Math.abs(beforeGap - 1) < 1e-9, `gap ${beforeGap} at 60 BPM`);

  scheduler.setBpm(240);
  // The click already booked keeps its place. The ones after it move.
  clock.advance(3000);
  const afterGap = click.scheduled.at(-1).atSec - click.scheduled.at(-2).atSec;
  assert.ok(Math.abs(afterGap - 0.25) < 1e-9, `gap ${afterGap} at 240 BPM`);
  assert.equal(scheduler.isRunning(), true);
  scheduler.stop();
});

await test('the scheduler reports each beat after its click sounds', () => {
  const clock = fakeClock();
  const click = fakeClick(clock);
  const scheduler = createScheduler({ click, clock });
  const beats = [];
  scheduler.start(metronomePlan({ bpm: 120, beatsPerBar: 4 }), {
    onBeat: (beat) => beats.push(beat),
  });
  clock.advance(1000);
  assert.ok(beats.length >= 1);
  for (const beat of beats) assert.ok(beat.atSec <= click.now());
  assert.equal(beats[0].level, 'accent');
  scheduler.stop();
});

await test('a stopped plan reports completed false', () => {
  const clock = fakeClock();
  const click = fakeClick(clock);
  const scheduler = createScheduler({ click, clock });
  const ends = [];
  scheduler.start(metronomePlan({ bpm: 60 }), { onEnd: (r) => ends.push(r) });
  clock.advance(500);
  scheduler.stop();
  assert.equal(ends.length, 1);
  assert.equal(ends[0].completed, false);
});

/* ------------------------------------------------------------------ */
console.log('Countdown');

await test('the countdown runs to zero and reports once', () => {
  const clock = fakeClock();
  const countdown = createCountdown({ clock });
  const ticks = [];
  let completed = null;
  countdown.start(1, {
    onTick: (t) => ticks.push(t.remainingMs),
    onComplete: (c) => { completed = c; },
  });
  assert.equal(countdown.isRunning(), true);
  clock.advance(30000);
  assert.equal(countdown.isRunning(), true);
  assert.equal(countdown.remainingMs(), 30000);
  clock.advance(30000);
  assert.equal(countdown.isRunning(), false);
  assert.deepEqual(completed, { minutes: 1, totalMs: 60000 });
  assert.equal(ticks[0], 60000);
  assert.equal(clock.timerCount(), 0);
});

await test('a stopped countdown reports the time it ran', () => {
  const clock = fakeClock();
  const countdown = createCountdown({ clock });
  let stopped = null;
  countdown.start(5, { onStop: (s) => { stopped = s; } });
  clock.advance(42000);
  countdown.stop();
  assert.deepEqual(stopped, { minutes: 5, elapsedMs: 42000, totalMs: 300000 });
  assert.equal(countdown.isRunning(), false);
});

await test('the countdown refuses a length of zero', () => {
  const clock = fakeClock();
  const countdown = createCountdown({ clock });
  assert.equal(countdown.start(0), false);
  assert.equal(countdown.isRunning(), false);
});

/* ------------------------------------------------------------------ */
console.log('Store and container');

await test('the memory store keeps entries and takes apart', async () => {
  const store = createMemoryStore();
  await store.appendEntry({ id: 'e1', at: '2026-08-25T10:01:00.000Z', kind: 'vocal-attempt', data: {} });
  await store.appendEntry({ id: 'e2', at: '2026-08-25T10:00:00.000Z', kind: 'warm-up', data: {} });
  await store.appendEntry({ id: 'e3', at: '2026-08-25T10:02:00.000Z', kind: 'warm-up', data: {} });
  await store.saveClip({ id: 'c1', createdAt: '2026-08-25T10:02:00.000Z', blob: null });

  assert.deepEqual((await store.listEntries()).map(e => e.id), ['e2', 'e1', 'e3']);
  assert.deepEqual((await store.listEntries({ kind: 'warm-up' })).map(e => e.id), ['e2', 'e3']);
  assert.deepEqual((await store.listEntries({ kind: 'warm-up', limit: 1 })).map(e => e.id), ['e3']);
  assert.deepEqual((await store.listClips()).map(c => c.id), ['c1']);

  await store.deleteClip('c1');
  assert.deepEqual(await store.listClips(), []);
});

await test('the lab opens with every tool ready and nothing to start', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  assert.equal(lab.isReady(), false);
  await lab.init();
  assert.equal(lab.isReady(), true);
  assert.equal(lab.state.canSave, true);
  assert.equal(lab.activeTrainer(), '');
  assert.deepEqual(lab.clips(), []);
  assert.equal(lab.warmUp(), null);
  // No session record, no catalog, no log.
  for (const gone of ['startSession', 'endSession', 'hasOpenSession', 'addNote', 'listSessions', 'instruments']) {
    assert.equal(typeof lab[gone], 'undefined', `${gone} is gone`);
  }
});

await test('a second init waits on the same read', async () => {
  const lab = createPracticeLab(fakePorts());
  const first = lab.init();
  const second = lab.init();
  assert.equal(first, second);
  await first;
});

await test('a vocal attempt is kept without a session and survives a reload', async () => {
  const store = createMemoryStore();
  const first = createPracticeLab(fakePorts({ store }));
  await first.init();
  await first.logVocalAttempt({ exerciseId: 'x1', exerciseName: 'Lip trill', outcome: 'clean' });
  await first.logVocalAttempt({ exerciseId: 'x2', exerciseName: 'Siren', outcome: 'unstable' });
  await first.logVocalAttempt({ exerciseId: 'x1', exerciseName: 'Lip trill', outcome: 'stopped' });

  // A new mount reads the same store, as a reload does.
  const second = createPracticeLab(fakePorts({ store }));
  await second.init();
  const all = await second.vocalAttempts();
  assert.equal(all.length, 3);
  assert.equal('sessionId' in all[0], false);
  const one = await second.vocalAttempts({ exerciseId: 'x1' });
  assert.deepEqual(one.map(e => e.data.outcome), ['clean', 'stopped']);
  const last = await second.vocalAttempts({ exerciseId: 'x1', limit: 1 });
  assert.deepEqual(last.map(e => e.data.outcome), ['stopped']);
});

await test('the warm-up pick names a groove and a rudiment and goes on record', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();

  const picked = await lab.rollWarmUp({ random: () => 0 });
  assert.ok(picked.beatId, 'the picker names a groove');
  assert.ok(picked.rudimentId, 'the picker names a rudiment');
  assert.equal(lab.warmUp().beatId, picked.beatId);

  const entries = await ports.store.listEntries({ kind: 'warm-up' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].data.beatId, picked.beatId);
  assert.equal(entries[0].data.rudimentId, picked.rudimentId);
  assert.ok(entries[0].data.label, 'the record names the pair');

  // The pick on offer holds until the next roll.
  const same = await lab.ensureWarmUp();
  assert.equal(same.beatId, picked.beatId);
  assert.equal((await ports.store.listEntries({ kind: 'warm-up' })).length, 1);
});

await test('the picker skips what the last three picks gave, across reloads', async () => {
  const store = createMemoryStore();
  const seen = [];
  let idCount = 0;
  for (let round = 0; round < 6; round += 1) {
    // Each round is its own mount, with its own hour and its own id prefix, so
    // the saved picks sort the way real ones do.
    const lab = createPracticeLab(fakePorts({
      store,
      clock: fakeClock(round * 3600000),
      ids: { newId: (prefix) => `${prefix}-r${round}-${(idCount += 1)}` },
    }));
    await lab.init();
    const picked = await lab.rollWarmUp();
    for (const before of seen.slice(-3)) {
      assert.notEqual(picked.beatId, before.beatId, `round ${round} repeats a groove`);
      assert.notEqual(picked.rudimentId, before.rudimentId, `round ${round} repeats a rudiment`);
    }
    seen.push(picked);
  }
});

await test('one trainer runs at a time', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();

  lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 100 }), label: 'a' });
  assert.equal(lab.activeTrainer(), 'metronome');
  lab.startTrainer({ kind: 'ratio', plan: ratioPlan({ bpm: 100, beats: 4 }), label: 'b' });
  assert.equal(lab.activeTrainer(), 'ratio');
  lab.stopTrainer();
  assert.equal(lab.activeTrainer(), '');
});

await test('a trainer runs before the store answers', () => {
  const lab = createPracticeLab(fakePorts());
  const started = lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 100 }), label: 'a' });
  assert.equal(started, true);
  assert.equal(lab.activeTrainer(), 'metronome');
  lab.stopAll();
  assert.equal(lab.activeTrainer(), '');
});

await test('another tool taking the audio stops the lab click', async () => {
  let ownerStop = null;
  const ports = fakePorts({
    audioSession: {
      claim: ({ onStop }) => { ownerStop = onStop; return { id: 'lab' }; },
      release: () => { ownerStop = null; },
    },
  });
  const lab = createPracticeLab(ports);
  await lab.init();
  lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 100 }), label: 'a' });
  assert.equal(lab.activeTrainer(), 'metronome');

  // The Metronome tool claims the slot. The owner calls back.
  ownerStop();
  assert.equal(lab.activeTrainer(), '');
  assert.equal(lab.scheduler.isRunning(), false);
});

await test('a refused audio claim leaves no trainer running', async () => {
  const toasts = [];
  const ports = fakePorts({
    audioSession: { claim: () => null, release: () => {} },
    notify: { toast: (m) => toasts.push(m) },
  });
  const lab = createPracticeLab(ports);
  await lab.init();
  const started = lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 90 }), label: 'a' });
  assert.equal(started, false);
  assert.equal(lab.activeTrainer(), '');
  assert.equal(toasts.length, 1);
});

await test('a take is kept without a session, listed without its video, and deleted', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  const seen = [];
  lab.on('clips', (clips) => seen.push(clips.length));

  const blob = { size: 4210331, type: 'video/webm' };
  const clip = await lab.saveClip({ blob, mime: 'video/webm', durationMs: 30120, size: 4210331 });
  assert.ok(clip.id.startsWith('pl-clip'));
  assert.equal('sessionId' in clip, false);
  assert.equal('blob' in clip, false);
  assert.equal(lab.clips().length, 1);
  assert.equal(lab.clips()[0].durationMs, 30120);

  // The video comes back on request only.
  const full = await lab.getClip(clip.id);
  assert.equal(full.blob, blob);

  // A reload lists the same take.
  const again = createPracticeLab(fakePorts({ store: ports.store }));
  await again.init();
  assert.deepEqual(again.clips().map(c => c.id), [clip.id]);

  await lab.deleteClip(clip.id);
  assert.deepEqual(lab.clips(), []);
  assert.deepEqual(await ports.store.listClips(), []);
  assert.deepEqual(seen, [1, 0]);
});

await test('an empty take is refused', async () => {
  const lab = createPracticeLab(fakePorts());
  await lab.init();
  assert.equal(await lab.saveClip({ blob: null }), null);
  assert.deepEqual(lab.clips(), []);
});

await test('a blocked database leaves the tools running with a notice flag', async () => {
  const store = createMemoryStore();
  store.isAvailable = () => false;
  const lab = createPracticeLab(fakePorts({ store }));
  await lab.init();
  assert.equal(lab.state.canSave, false);
  assert.equal(lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 90 }), label: 'a' }), true);
  lab.stopAll();
});


/* ------------------------------------------------------------------ */
console.log('Theory — the chords of a key');

/** Open-string MIDI notes of E standard, low string first. */
const E_STANDARD = [40, 45, 50, 55, 59, 64];

function symbols(chords) {
  return chords.map(c => c.symbol);
}

await test('a major key stacks the seven triads every player knows', () => {
  assert.deepEqual(
    symbols(keyChords('C', 'Major (Ionian)', 3)),
    ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
  );
  assert.deepEqual(
    keyChords('C', 'Major (Ionian)', 3).map(c => c.roman),
    ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  );
});

await test('a major key stacks the seven 7th chords', () => {
  assert.deepEqual(
    symbols(keyChords('C', 'Major (Ionian)', 4)),
    ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'],
  );
});

await test('harmonic minor gives the augmented III and the diminished 7', () => {
  assert.deepEqual(
    symbols(keyChords('A', 'Harmonic Minor', 4)),
    ['AmMaj7', 'Bm7b5', 'Cmaj7#5', 'Dm7', 'E7', 'Fmaj7', 'G#dim7'],
  );
});

await test('melodic minor gives two half-diminished chords and two dominants', () => {
  assert.deepEqual(
    symbols(keyChords('A', 'Melodic Minor (Asc)', 4)),
    ['AmMaj7', 'Bm7', 'Cmaj7#5', 'D7', 'E7', 'F#m7b5', 'G#m7b5'],
  );
});

await test('an altered extension never folds into the stacked symbol', () => {
  // The 9th of E in C major is F, a flat ninth. The chord must not read "Em9".
  const chords = keyChords('C', 'Major (Ionian)', 5);
  assert.equal(chords[2].symbol, 'Em7(b9)');
  assert.equal(chords[0].symbol, 'Cmaj9');
});

await test('a #11 with no ninth under it stays an alteration', () => {
  const chord = buildChord('C', [
    { slot: 0, semi: 0 }, { slot: 1, semi: 4 }, { slot: 2, semi: 7 },
    { slot: 3, semi: 11 }, { slot: 5, semi: 6 },
  ]);
  assert.equal(chord.symbol, 'Cmaj7(#11)');
});

await test('a suspension spells its tone as a second or a fourth', () => {
  const sus4 = buildChord('C', [{ slot: 0, semi: 0 }, { slot: 1, semi: 5 }, { slot: 2, semi: 7 }]);
  const sus2 = buildChord('C', [{ slot: 0, semi: 0 }, { slot: 1, semi: 2 }, { slot: 2, semi: 7 }]);
  assert.deepEqual(sus4.notes, ['C', 'F', 'G']);
  assert.deepEqual(sus2.notes, ['C', 'D', 'G']);
});

await test('a stack with no third and no fifth is named an interval', () => {
  assert.equal(describeStack([{ slot: 0, semi: 0, label: 'R' }]).name, 'Interval');
});

await test('the ladder stacks one degree from the triad to the 13th', () => {
  assert.deepEqual(
    symbols(chordLadder('C', 'Major (Ionian)', 0)),
    ['C', 'Cmaj7', 'Cmaj9', 'Cmaj11', 'Cmaj13'],
  );
});

await test('a scale that is not seven notes builds no chord set', () => {
  assert.equal(isHeptatonic('Minor Pentatonic'), false);
  assert.deepEqual(keyChords('C', 'Minor Pentatonic', 4), []);
  assert.deepEqual(chordLadder('C', 'Blues', 0), []);
  // The notes still read, so the neck can still draw the scale.
  assert.equal(keyNotes('C', 'Minor Pentatonic').size, 5);
});

await test('an unknown root or scale returns nothing instead of throwing', () => {
  assert.equal(keyNotes('H', 'Major (Ionian)'), null);
  assert.equal(keyNotes('C', 'No Such Scale'), null);
  assert.deepEqual(keyChords('H', 'Major (Ionian)'), []);
});

/* ------------------------------------------------------------------ */
console.log('Theory — comparing two modes');

await test('natural minor and harmonic minor differ on four chords', () => {
  const result = compareKeys('A', 'Natural Minor (Aeolian)', 'Harmonic Minor', 4);
  assert.equal(result.changed, 4);
  const moved = result.rows.filter(r => r.changed).map(r => `${r.left.symbol}>${r.right.symbol}`);
  assert.deepEqual(moved, ['Am7>AmMaj7', 'Cmaj7>Cmaj7#5', 'Em7>E7', 'G7>G#dim7']);
});

await test('the compare rows mark the tone that moves', () => {
  const result = compareKeys('A', 'Natural Minor (Aeolian)', 'Harmonic Minor', 4);
  // The i chord keeps its root, third, and fifth, and moves only its seventh.
  assert.deepEqual(result.rows[0].changedTones, [false, false, false, true]);
});

await test('a comparison needs two seven-note modes', () => {
  assert.equal(compareKeys('A', 'Minor Pentatonic', 'Harmonic Minor', 4), null);
});

await test('the quality index finds every chord of one quality', () => {
  const groups = qualityIndex('A', 'Harmonic Minor', [3, 4]);
  const dim7 = groups.find(g => g.quality === 'dim7');
  assert.deepEqual(symbols(dim7.chords), ['G#dim7']);
  const major7 = groups.find(g => g.quality === 'major7');
  assert.deepEqual(symbols(major7.chords), ['Fmaj7']);
});

/* ------------------------------------------------------------------ */
console.log('Theory — voicings on the neck');

await test('a pitch class repeats every twelve frets on one string', () => {
  // The low E string sounds A at fret 5 and again at fret 17.
  assert.deepEqual(fretsForPitchClass(40, 9, 0, 20), [5, 17]);
  assert.deepEqual(fretsForPitchClass(40, 4, 0, 15), [0, 12]);
});

await test('every chord of a key has at least one shape in standard tuning', () => {
  for (const scale of ['Major (Ionian)', 'Natural Minor (Aeolian)', 'Harmonic Minor', 'Melodic Minor (Asc)']) {
    for (const chord of keyChords('A', scale, 4)) {
      const found = findVoicings({ openMidis: E_STANDARD, tones: chord.tones });
      assert.ok(found.length > 0, `${chord.symbol} of ${scale} has no shape`);
    }
  }
});

await test('a voicing stays inside the hand it claims', () => {
  const chord = keyChords('A', 'Harmonic Minor', 4)[6];
  for (const voicing of findVoicings({ openMidis: E_STANDARD, tones: chord.tones })) {
    assert.ok(voicing.span <= VOICING_DEFAULTS.maxSpan, `span ${voicing.span}`);
    assert.ok(voicing.fingers <= VOICING_DEFAULTS.maxFingers, `fingers ${voicing.fingers}`);
    assert.ok(voicing.voices >= VOICING_DEFAULTS.minVoices, `voices ${voicing.voices}`);
    assert.ok(voicing.innerMutes <= VOICING_DEFAULTS.maxInnerMutes, `mutes ${voicing.innerMutes}`);
  }
});

await test('a voicing sounds only the notes of its chord', () => {
  const chord = keyChords('C', 'Major (Ionian)', 4)[4];
  const wanted = new Set(chord.pcs);
  for (const voicing of findVoicings({ openMidis: E_STANDARD, tones: chord.tones })) {
    voicing.midis.forEach((midi) => {
      if (midi == null) return;
      assert.ok(wanted.has(((midi % 12) + 12) % 12), `${voicing.id} sounds a note outside ${chord.symbol}`);
    });
  }
});

await test('a voicing carries the root, the third, and the seventh', () => {
  const chord = keyChords('C', 'Major (Ionian)', 4)[1];
  for (const voicing of findVoicings({ openMidis: E_STANDARD, tones: chord.tones })) {
    const labels = new Set(voicing.labels.filter(Boolean));
    assert.ok(labels.has('R') && labels.has('b3') && labels.has('b7'), voicing.id);
  }
});

await test('the root sits in the bass unless the search allows an inversion', () => {
  const chord = keyChords('C', 'Major (Ionian)', 0 + 4)[0];
  const rooted = findVoicings({ openMidis: E_STANDARD, tones: chord.tones });
  assert.ok(rooted.every(v => v.bassLabel === 'R'));
  // The search ranks a root in the bass first, so read the whole list.
  const inverted = findVoicings({
    openMidis: E_STANDARD, tones: chord.tones, limits: { rootInBass: false, limit: 500 },
  });
  assert.ok(inverted.some(v => v.bassLabel !== 'R'));
});

await test('turning open strings off leaves only movable shapes', () => {
  const chord = keyChords('E', 'Major (Ionian)', 4)[0];
  const found = findVoicings({ openMidis: E_STANDARD, tones: chord.tones, limits: { allowOpen: false } });
  assert.ok(found.length > 0);
  assert.ok(found.every(v => v.frets.every(f => f == null || f > 0)));
});

await test('a seven-string tuning finds shapes of its own', () => {
  const dropC7 = [36, 43, 48, 53, 58, 62, 67];
  const chord = keyChords('C', 'Natural Minor (Aeolian)', 4)[0];
  const found = findVoicings({ openMidis: dropC7, tones: chord.tones });
  assert.ok(found.length > 0);
  assert.ok(found.every(v => v.frets.length === 7));
});

await test('the voicings group into regions of the neck', () => {
  const chord = keyChords('C', 'Major (Ionian)', 4)[0];
  const groups = groupByPosition(findVoicings({ openMidis: E_STANDARD, tones: chord.tones }));
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.ok(group.voicings.every(v => v.lowFret >= group.from && v.lowFret <= group.to));
  }
});

/* ------------------------------------------------------------------ */
console.log('Theory — the ways out of a key');

await test('a secondary dominant sits a fifth over its target', () => {
  const list = secondaryDominants('C', 'Major (Ionian)');
  const roles = list.map(c => `${c.role} ${c.symbol}`);
  assert.deepEqual(roles, ['V7/ii A7', 'V7/iii B7', 'V7/IV C7', 'V7/V D7', 'V7/vi E7']);
  // The V7 of the tonic is the plain V of a major key, so it is not a way out.
  assert.ok(!roles.some(r => r.startsWith('V7/I ')));
});

await test('a tritone substitute sits a semitone over its target', () => {
  const list = tritoneSubs('C', 'Major (Ionian)');
  const sub = list.find(c => c.target === 'Dm7');
  assert.equal(sub.symbol, 'Eb7');
});

await test('a leading-tone diminished 7 sits a semitone under its target', () => {
  const list = leadingToneDiminished('C', 'Major (Ionian)');
  const chord = list.find(c => c.target === 'Dm7');
  assert.equal(chord.symbol, 'C#dim7');
  assert.deepEqual(chord.notes, ['C#', 'E', 'G', 'Bb']);
  assert.deepEqual(chord.outsideNotes, ['C#', 'Bb']);
});

await test('a borrowed chord names the note it borrows', () => {
  const groups = borrowedChords('C', 'Major (Ionian)');
  const minor = groups.find(g => g.source === 'Natural Minor (Aeolian)');
  const four = minor.chords.find(c => c.root === 'F');
  assert.equal(four.symbol, 'Fm7');
  assert.deepEqual(four.outsideNotes, ['Ab', 'Eb']);
});

await test('a borrowed list holds no chord the key already has', () => {
  const inKey = new Set(keyChords('C', 'Major (Ionian)', 4).map(c => c.pcs.slice().sort((a, b) => a - b).join('.')));
  for (const group of borrowedChords('C', 'Major (Ionian)')) {
    for (const chord of group.chords) {
      assert.ok(chord.outside.length > 0, `${chord.symbol} borrows nothing`);
      assert.ok(!inKey.has(chord.pcs.slice().sort((a, b) => a - b).join('.')), chord.symbol);
    }
  }
});

await test('bending a chord names the new chord and the tone that left', () => {
  const key = keyNotes('C', 'Major (Ionian)');
  const moves = alterationsFor(keyChords('C', 'Major (Ionian)', 4)[0], key.pcs);
  const byMove = new Map(moves.map(m => [m.move, m]));
  assert.equal(byMove.get('aug5').symbol, 'Cmaj7#5');
  assert.deepEqual(byMove.get('aug5').outsideNotes, ['G#']);
  assert.equal(byMove.get('dim7').symbol, 'Cdim7');
  // A 6th chord on the tonic of a major key borrows nothing.
  assert.equal(byMove.get('sixth').symbol, 'C6');
  assert.deepEqual(byMove.get('sixth').outsideNotes, []);
});

await test('two moves that land on one chord appear once', () => {
  const key = keyNotes('A', 'Natural Minor (Aeolian)');
  const moves = alterationsFor(keyChords('A', 'Natural Minor (Aeolian)', 4)[0], key.pcs);
  const seen = moves.map(m => m.symbol);
  assert.equal(new Set(seen).size, seen.length, `repeated chord in ${seen.join(', ')}`);
  assert.ok(seen.includes('A7'));
});

await test('a chord of the key reports no outside tone', () => {
  const key = keyNotes('C', 'Major (Ionian)');
  const tonic = keyChords('C', 'Major (Ionian)', 4)[0];
  assert.deepEqual(outsideTones(tonic, key.pcs), []);
});

await test('the out-of-key moves need a seven-note mode', () => {
  assert.deepEqual(secondaryDominants('C', 'Blues'), []);
  assert.deepEqual(borrowedChords('C', 'Blues'), []);
  assert.deepEqual(alterationsFor(null, []), []);
});

/* ------------------------------------------------------------------ */
console.log('Vocal — the source folder');

await test('each style keeps its own settings key', () => {
  assert.equal(sourceFolderKey('clean'), VOCAL_SETTINGS.cleanFolderId);
  assert.equal(sourceFolderKey('harsh'), VOCAL_SETTINGS.harshFolderId);
  assert.notEqual(sourceFolderKey('clean'), sourceFolderKey('harsh'));
  assert.equal(registerKey('harsh'), VOCAL_SETTINGS.harshRegister);
});

await test('a folder that is not set asks for one', () => {
  assert.equal(sourceState({ folderId: '', exists: false, count: 0 }), SOURCE_UNSET);
});

await test('a folder that is gone never falls back to the whole library', () => {
  assert.equal(sourceState({ folderId: 'f1', exists: false, count: 0 }), SOURCE_MISSING);
});

await test('a folder with no compatible exercise says so', () => {
  assert.equal(sourceState({ folderId: 'f1', exists: true, count: 0 }), SOURCE_EMPTY);
});

await test('a folder with exercises is ready', () => {
  assert.equal(sourceState({ folderId: 'f1', exists: true, count: 3 }), SOURCE_OK);
});

/* ------------------------------------------------------------------ */
console.log('Vocal — the attempt');

await test('an attempt names the exercise and never copies it', () => {
  const data = newVocalAttempt({
    exerciseId: 'ex-1',
    exerciseName: 'Immediate Low Activation',
    exerciseSourceFolderId: 'cat-9',
    vocalStyle: 'Harsh',
    register: 'Low',
    focus: ['activation', 'Activation', 'consistency'],
    reps: 1,
    completed: true,
    outcome: 'Immediate',
  });
  assert.equal(data.practiceType, 'vocal');
  assert.equal(data.vocalStyle, 'harsh');
  assert.equal(data.register, 'low');
  assert.equal(data.exerciseId, 'ex-1');
  assert.equal(data.exerciseSourceFolderId, 'cat-9');
  assert.deepEqual(data.focus, ['activation', 'consistency']);
  assert.equal(data.outcome, 'immediate');
  assert.equal(data.cue, undefined);
  assert.equal(data.runner, undefined);
});

await test('the optional fields stay out when the singer skips them', () => {
  const data = newVocalAttempt({ exerciseId: 'ex-1', vocalStyle: 'clean', register: 'mix' });
  assert.equal('effort' in data, false);
  assert.equal('issues' in data, false);
  assert.equal('notes' in data, false);
  assert.equal('outcome' in data, false);
  assert.equal('pitch' in data, false);
});

await test('a clean attempt carries the pitch result of the runner', () => {
  const data = newVocalAttempt({
    exerciseId: 'ex-2',
    vocalStyle: 'clean',
    register: 'mix',
    pitch: { score: 120, accuracy: 88, bestCombo: 6, judged: 12 },
  });
  assert.deepEqual(data.pitch, { score: 120, accuracy: 88, bestCombo: 6, judged: 12 });
});

await test('the log line reads the attempt', () => {
  const line = describeVocalAttempt({
    exerciseName: 'Low Sustain', vocalStyle: 'harsh', register: 'low',
    outcome: 'clean', reps: 1, effort: 'working',
  });
  assert.match(line, /Low Sustain/);
  assert.match(line, /harsh · low/);
  assert.match(line, /clean/);
});

await test('the summary counts the recent reps and shows no percentage', () => {
  const entries = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, kind: 'vocal-attempt', data: { exerciseId: 'ex-1', outcome: 'immediate' } })),
    { id: 'b1', kind: 'vocal-attempt', data: { exerciseId: 'ex-1', outcome: 'searched' } },
    { id: 'b2', kind: 'vocal-attempt', data: { exerciseId: 'ex-1', outcome: 'searched' } },
    { id: 'c1', kind: 'vocal-attempt', data: { exerciseId: 'ex-1', outcome: 'missed' } },
    { id: 'd1', kind: 'vocal-attempt', data: { exerciseId: 'ex-2', outcome: 'missed' } },
    { id: 'e1', kind: 'note', data: {} },
  ];
  const summary = summarizeAttempts(entries, {
    exerciseId: 'ex-1', limit: 10, order: ['immediate', 'searched', 'missed'],
  });
  assert.equal(summary.total, 10);
  assert.deepEqual(summary.counts, [
    { id: 'immediate', count: 7 },
    { id: 'searched', count: 2 },
    { id: 'missed', count: 1 },
  ]);
});

await test('an attempt with no reported result stays out of the summary', () => {
  const entries = [
    { id: 'a', kind: 'vocal-attempt', data: { exerciseId: 'ex-1', effort: 'easy' } },
    { id: 'b', kind: 'vocal-attempt', data: { exerciseId: 'ex-1', outcome: 'clean' } },
  ];
  const summary = summarizeAttempts(entries, { exerciseId: 'ex-1', order: ['clean'] });
  assert.equal(summary.total, 1);
});

await test('strain is recorded and raises a rest note, never a reward', () => {
  const strained = kind => ({ id: Math.random().toString(), kind: 'vocal-attempt', data: { effort: kind } });
  assert.equal(strainWarning([strained('working'), strained('easy')]), false);
  assert.equal(strainWarning([strained('strained')]), false);
  assert.equal(strainWarning([strained('strained'), strained('easy'), strained('strained')]), true);
});

await test('a report step closes every repetition', () => {
  const steps = withRepReports([
    { rep: 1, reps: 2, index: 0, step: { type: 'perform', duration: 4 }, next: null },
    { rep: 1, reps: 2, index: 1, step: { type: 'rest', duration: 8 }, next: null },
    { rep: 2, reps: 2, index: 0, step: { type: 'perform', duration: 4 }, next: null },
    { rep: 2, reps: 2, index: 1, step: { type: 'rest', duration: 8 }, next: null },
  ]);
  assert.deepEqual(steps.map(s => s.step.type),
    ['perform', 'rest', 'checkpoint', 'perform', 'rest', 'checkpoint']);
  assert.equal(steps[2].step.report, true);
  assert.equal(steps[2].rep, 1);
  assert.equal(steps[0].next.type, 'rest');
  assert.equal(steps[5].next, null);
});

/* ------------------------------------------------------------------ */
console.log('Cue run');

function cueSteps() {
  return [
    { rep: 1, reps: 2, index: 0, step: { type: 'perform', duration: 4, text: 'Low' }, next: null },
    { rep: 1, reps: 2, index: 1, step: { type: 'rest', duration: 8 }, next: null },
    { rep: 2, reps: 2, index: 0, step: { type: 'checkpoint', text: 'Ready' }, next: null },
    { rep: 2, reps: 2, index: 1, step: { type: 'perform', duration: 4, text: 'Low' }, next: null },
  ];
}

await test('the run walks the steps on the clock', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  assert.equal(run.load(cueSteps()), 4);
  const seen = [];
  run.start({ onStep: ({ entry }) => seen.push(entry.step.type) });
  assert.deepEqual(seen, ['perform']);
  clock.advance(4000);
  assert.deepEqual(seen, ['perform', 'rest']);
});

await test('a rest step keeps its whole length', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  run.load(cueSteps());
  const seen = [];
  run.start({ onStep: ({ entry }) => seen.push(entry.step.type) });
  clock.advance(4000);
  clock.advance(7800);
  assert.deepEqual(seen, ['perform', 'rest']);
  clock.advance(400);
  assert.deepEqual(seen, ['perform', 'rest', 'checkpoint']);
});

await test('a checkpoint waits for the singer', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  run.load(cueSteps());
  const seen = [];
  run.start({ onStep: ({ entry }) => seen.push(entry.step.type) });
  clock.advance(12000);
  assert.deepEqual(seen, ['perform', 'rest', 'checkpoint']);
  clock.advance(60000);
  assert.deepEqual(seen, ['perform', 'rest', 'checkpoint']);
  run.next();
  assert.deepEqual(seen, ['perform', 'rest', 'checkpoint', 'perform']);
});

await test('the run ends after the last step', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  run.load(cueSteps());
  let ended = null;
  run.start({ onEnd: (result) => { ended = result; } });
  clock.advance(12000);
  run.next();
  clock.advance(4000);
  assert.deepEqual(ended, { completed: true, steps: 4 });
  assert.equal(run.isRunning(), false);
});

await test('a pause holds the time and a resume carries on', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  run.load(cueSteps());
  const seen = [];
  run.start({ onStep: ({ entry }) => seen.push(entry.step.type) });
  clock.advance(1000);
  run.pause();
  assert.equal(run.isPaused(), true);
  clock.advance(30000);
  assert.deepEqual(seen, ['perform']);
  run.resume();
  assert.equal(run.isPaused(), false);
  clock.advance(2900);
  assert.deepEqual(seen, ['perform']);
  clock.advance(200);
  assert.deepEqual(seen, ['perform', 'rest']);
});

await test('stop ends the run and reports that it did not finish', () => {
  const clock = fakeClock();
  const run = createCueRun({ clock });
  run.load(cueSteps());
  let ended = null;
  run.start({ onEnd: (result) => { ended = result; } });
  clock.advance(1000);
  run.stop();
  assert.deepEqual(ended, { completed: false, steps: 4 });
  assert.equal(run.isRunning(), false);
  assert.equal(clock.timerCount(), 0);
});

await test('a run with no step does not start', () => {
  const run = createCueRun({ clock: fakeClock() });
  assert.equal(run.load([]), 0);
  assert.equal(run.start({}), false);
});

await test('the countdown also counts seconds, so the cue run needs no second timer', () => {
  const clock = fakeClock();
  const countdown = createCountdown({ clock });
  let done = false;
  assert.equal(countdown.startSeconds(4, { onComplete: () => { done = true; } }), true);
  clock.advance(3800);
  assert.equal(done, false);
  clock.advance(400);
  assert.equal(done, true);
});

/* ------------------------------------------------------------------ */
console.log('Folder boundary');

function featureFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (full.endsWith('.js')) out.push(full);
    }
  })(join(ROOT, 'js/practiceLab'));
  return out.map(path => ({
    path: relative(ROOT, path).split('\\').join('/'),
    text: readFileSync(path, 'utf8'),
  }));
}

const FEATURE_FILES = featureFiles();

function importsOf(text) {
  const out = [];
  const pattern = /(?:^|\n)\s*import\s+[^;]*?from\s+'([^']+)'|import\s*\(\s*'([^']+)'\s*\)/g;
  for (const match of text.matchAll(pattern)) out.push(match[1] || match[2]);
  return out;
}

await test('the feature folder holds every file of the feature', () => {
  const names = FEATURE_FILES.map(f => f.path);
  assert.ok(names.includes('js/practiceLab/index.js'));
  assert.ok(names.includes('js/practiceLab/container.js'));
  assert.ok(names.includes('js/practiceLab/ui/practiceView.js'));
  assert.ok(names.some(n => n.startsWith('js/practiceLab/engine/')));
  assert.ok(names.some(n => n.startsWith('js/practiceLab/ui/')));
});

await test('the session screens, the log, the catalog, and the history are gone', () => {
  const names = FEATURE_FILES.map(f => f.path);
  for (const gone of [
    'js/practiceLab/ui/setupView.js', 'js/practiceLab/ui/sessionView.js',
    'js/practiceLab/ui/logPanel.js', 'js/practiceLab/ui/historyView.js',
    'js/practiceLab/model/session.js', 'js/practiceLab/model/catalog.js',
  ]) {
    assert.equal(names.includes(gone), false, `${gone} still exists`);
  }
  for (const { path, text } of FEATURE_FILES) {
    assert.equal(/\bstartSession\b|\bendSession\b|\bappendEntry\('(timer|metronome|ratio|speed)/.test(text), false,
      `${path} still writes a session or a log line`);
  }
});

await test('only the adapters import from outside the folder', () => {
  for (const { path, text } of FEATURE_FILES) {
    const outside = importsOf(text).filter(spec => spec.startsWith('.') && spec.includes('../../'));
    if (path.startsWith('js/practiceLab/adapters/')) continue;
    assert.deepEqual(outside, [], `${path} imports outside the folder: ${outside.join(', ')}`);
  }
});

await test('no file imports a user-interface module of another feature', () => {
  // The adapters may reach the shared audio and storage services. They must
  // not reach a screen of another feature.
  const bannedFragments = [
    'metronome.js', 'earTrainer.js', 'exercises.js', 'workbooks.js', 'gpPlayer',
    'uxPrimitives.js', 'shell/', 'pickers.js', 'selectionSheet.js', 'areaPages.js',
    'screenUx.js', 'tools.js', 'main.js',
  ];
  for (const { path, text } of FEATURE_FILES) {
    for (const spec of importsOf(text)) {
      for (const banned of bannedFragments) {
        assert.equal(spec.includes(banned), false, `${path} imports ${spec}`);
      }
    }
  }
});

await test('no engine or model file touches the DOM or the audio context', () => {
  for (const { path, text } of FEATURE_FILES) {
    if (!/js\/practiceLab\/(engine|model)\//.test(path)) continue;
    for (const banned of ['document.', 'window.', 'AudioContext', 'indexedDB']) {
      assert.equal(text.includes(banned), false, `${path} uses ${banned}`);
    }
  }
});

await test('the tool id is practicelab and no symbol uses a banned name', () => {
  for (const { path, text } of FEATURE_FILES) {
    assert.equal(text.includes('sec-practice"'), false, `${path} names sec-practice`);
    assert.equal(/\bpracticeTimer\b/.test(text), false, `${path} names practiceTimer`);
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('id="sec-practicelab"'));
  assert.ok(html.includes('id="practicelab-body"'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
