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
  mergeCatalog,
  seedCatalog,
  addInstrument,
  addTechnique,
  removeInstrument,
  removeTechnique,
  techniquesOf,
  normaliseLabel,
  labelToId,
} from '../../js/practiceLab/model/catalog.js';
import {
  newSession,
  newEntry,
  rollUpTotals,
  sortEntries,
  formatDuration,
  describeEntry,
  plural,
  ENTRY_KINDS,
} from '../../js/practiceLab/model/session.js';
import {
  keyNotes,
  keyChords,
  chordLadder,
  compareKeys,
  qualityIndex,
  describeStack,
  buildChord,
  isHeptatonic,
} from '../../js/practiceLab/model/theoryChords.js';
import {
  findVoicings,
  fretsForPitchClass,
  groupByPosition,
  VOICING_DEFAULTS,
} from '../../js/practiceLab/model/theoryVoicings.js';
import {
  alterationsFor,
  borrowedChords,
  secondaryDominants,
  tritoneSubs,
  leadingToneDiminished,
  outsideTones,
} from '../../js/practiceLab/model/theoryOutside.js';
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
  assert.ok(PORT_CONTRACT.store.includes('appendEntry'));
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
console.log('Catalog');

await test('the seed catalog holds five instruments', () => {
  const catalog = seedCatalog();
  assert.deepEqual(catalog.instruments.map(e => e.id),
    ['guitar', 'bass', 'piano', 'drums', 'voice']);
  assert.equal(techniquesOf(catalog, 'guitar').length, 10);
  assert.equal(techniquesOf(catalog, 'voice').length, 4);
});

await test('a label is trimmed and the id uses hyphens', () => {
  assert.equal(normaliseLabel('  Alternate   Picking  '), 'Alternate Picking');
  assert.equal(labelToId('Alternate Picking'), 'alternate-picking');
  assert.equal(labelToId('7-String Sweeps!'), '7-string-sweeps');
});

await test('a removed seed instrument goes into hidden and stays away', () => {
  let catalog = mergeCatalog(null);
  catalog = removeInstrument(catalog, 'guitar');
  assert.equal(catalog.instruments.some(e => e.id === 'guitar'), false);
  assert.deepEqual(catalog.hidden.instruments, ['guitar']);
  // A later release re-reads the record. The seed entry must not come back.
  const reread = mergeCatalog(catalog);
  assert.equal(reread.instruments.some(e => e.id === 'guitar'), false);
});

await test('a removed custom instrument leaves the array', () => {
  let catalog = mergeCatalog(null);
  catalog = addInstrument(catalog, 'Ukulele').catalog;
  assert.equal(catalog.instruments.at(-1).label, 'Ukulele');
  catalog = removeInstrument(catalog, 'ukulele');
  assert.equal(catalog.instruments.some(e => e.id === 'ukulele'), false);
  assert.equal(catalog.hidden.instruments.includes('ukulele'), false);
});

await test('a duplicate label selects the entry that exists', () => {
  let catalog = mergeCatalog(null);
  const first = addInstrument(catalog, 'Guitar');
  assert.equal(first.added, false);
  assert.equal(first.entry.id, 'guitar');
  assert.equal(first.catalog.instruments.filter(e => e.id === 'guitar').length, 1);

  catalog = addInstrument(catalog, 'Ukulele').catalog;
  const second = addInstrument(catalog, ' ukulele ');
  assert.equal(second.added, false);
  assert.equal(second.catalog.instruments.filter(e => e.id === 'ukulele').length, 1);
});

await test('a technique belongs to one instrument only', () => {
  let catalog = mergeCatalog(null);
  catalog = addTechnique(catalog, 'guitar', 'Rake').catalog;
  assert.equal(techniquesOf(catalog, 'guitar').some(e => e.id === 'rake'), true);
  assert.equal(techniquesOf(catalog, 'bass').some(e => e.id === 'rake'), false);

  catalog = removeTechnique(catalog, 'guitar', 'economy-picking');
  assert.equal(techniquesOf(catalog, 'guitar').some(e => e.id === 'economy-picking'), false);
  assert.deepEqual(catalog.hidden.techniques.guitar, ['economy-picking']);
});

await test('an instrument with every technique removed keeps an empty list', () => {
  let catalog = mergeCatalog(null);
  for (const entry of [...techniquesOf(catalog, 'voice')]) {
    catalog = removeTechnique(catalog, 'voice', entry.id);
  }
  assert.deepEqual(techniquesOf(catalog, 'voice'), []);
  const added = addTechnique(catalog, 'voice', 'Falsetto');
  assert.equal(added.added, true);
  assert.equal(techniquesOf(added.catalog, 'voice').length, 1);
});

/* ------------------------------------------------------------------ */
console.log('Session log model');

await test('the log entry kinds match the data model', () => {
  assert.deepEqual(ENTRY_KINDS, [
    'session-start', 'timer-start', 'timer-stop', 'timer-complete',
    'metronome-start', 'metronome-stop', 'ratio-start', 'ratio-stop',
    'speed-start', 'speed-complete', 'clip-saved', 'note', 'warm-up-done',
    'session-end',
  ]);
});

await test('an unknown entry kind is refused', () => {
  assert.throws(
    () => newEntry({ id: 'e', sessionId: 's', at: 'x', kind: 'nonsense' }),
    /unknown log entry kind/,
  );
});

await test('a session is active until it ends', () => {
  const session = newSession({
    id: 'pl-sess-1', at: '2026-08-25T18:00:00.000Z',
    instrument: 'Guitar', technique: 'Alternate Picking', target: 'Clean 16ths',
  });
  assert.equal(session.status, 'active');
  assert.equal(session.endedAt, '');
  assert.deepEqual(session.totals, { timerMs: 0, clips: 0, topBpm: 0 });
});

await test('the totals roll up from the log', () => {
  const entries = [
    { kind: 'timer-complete', data: { minutes: 5 } },
    { kind: 'timer-complete', data: { minutes: 3 } },
    { kind: 'timer-stop', data: { minutes: 5, elapsedMs: 42000 } },
    { kind: 'clip-saved', data: { clipId: 'a' } },
    { kind: 'clip-saved', data: { clipId: 'b', removed: true } },
    { kind: 'speed-complete', data: { topBpm: 110, finished: true } },
    { kind: 'speed-complete', data: { topBpm: 95, finished: false } },
    { kind: 'note', data: { text: 'sloppy on the low string' } },
  ];
  assert.deepEqual(rollUpTotals(entries), { timerMs: 8 * 60000 + 42000, clips: 1, topBpm: 110 });
});

await test('entries sort oldest first', () => {
  const list = sortEntries([
    { id: 'b', at: '2026-08-25T18:05:00.000Z' },
    { id: 'a', at: '2026-08-25T18:00:00.000Z' },
    { id: 'c', at: '2026-08-25T18:05:00.000Z' },
  ]);
  assert.deepEqual(list.map(e => e.id), ['a', 'b', 'c']);
});

await test('a duration reads as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(63000), '1:03');
  assert.equal(formatDuration(3723000), '1:02:03');
});

await test('a count and its word agree', () => {
  assert.equal(plural(0, 'clip'), '0 clips');
  assert.equal(plural(1, 'clip'), '1 clip');
  assert.equal(plural(2, 'cycle'), '2 cycles');
});

await test('every entry kind has a log line', () => {
  for (const kind of ENTRY_KINDS) {
    const text = describeEntry({ kind, data: { minutes: 1, text: 'a note', topBpm: 90 } });
    assert.equal(typeof text, 'string');
    assert.notEqual(text, '');
  }
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

await test('the memory store keeps a session, its log, and its clips apart', async () => {
  const store = createMemoryStore();
  await store.createSession({ id: 's1', startedAt: '2026-08-25T10:00:00.000Z', status: 'active' });
  await store.createSession({ id: 's2', startedAt: '2026-08-25T11:00:00.000Z', status: 'ended' });
  await store.appendEntry({ id: 'e1', sessionId: 's1', at: '2026-08-25T10:01:00.000Z', kind: 'note', data: {} });
  await store.appendEntry({ id: 'e2', sessionId: 's2', at: '2026-08-25T11:01:00.000Z', kind: 'note', data: {} });
  await store.saveClip({ id: 'c1', sessionId: 's1', createdAt: '2026-08-25T10:02:00.000Z', blob: null });

  assert.deepEqual((await store.listEntries('s1')).map(e => e.id), ['e1']);
  assert.deepEqual((await store.listClips('s1')).map(c => c.id), ['c1']);
  // Newest first.
  assert.deepEqual((await store.listSessions()).map(s => s.id), ['s2', 's1']);
  assert.deepEqual((await store.listSessions({ status: 'active' })).map(s => s.id), ['s1']);

  await store.deleteSession('s1');
  assert.deepEqual(await store.listEntries('s1'), []);
  assert.deepEqual(await store.listClips('s1'), []);
});

await test('the session record is written at the start, not at the end', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  await lab.startSession({ instrument: 'Guitar', technique: 'Legato', target: 'Even trills' });

  const open = await ports.store.listSessions({ status: 'active' });
  assert.equal(open.length, 1);
  assert.equal(open[0].instrument, 'Guitar');
  // The start writes its own log line.
  const entries = await ports.store.listEntries(open[0].id);
  assert.deepEqual(entries.map(e => e.kind), ['session-start']);
});

await test('a session log survives a reload', async () => {
  const store = createMemoryStore();
  const first = createPracticeLab(fakePorts({ store }));
  await first.init();
  await first.startSession({ instrument: 'Bass', technique: 'Slap', target: 'Even thumb' });
  await first.appendEntry('timer-complete', { minutes: 5 });
  await first.addNote('left hand tight');

  // A new mount reads the same store, as a reload does.
  const second = createPracticeLab(fakePorts({ store }));
  await second.init();
  assert.equal(second.hasOpenSession(), true);
  assert.deepEqual(second.entries().map(e => e.kind),
    ['session-start', 'timer-complete', 'note']);
  assert.equal(second.session().totals.timerMs, 300000);
  // The tool offers to continue the session, so the screen can say so.
  assert.equal(second.state.resumed, true);
  assert.equal(first.state.resumed, false);
});

await test('ending a session closes it and writes the totals', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  const started = await lab.startSession({ instrument: 'Piano', technique: 'Scales', target: 'C major' });
  await lab.appendEntry('timer-complete', { minutes: 3 });
  await lab.appendEntry('speed-complete', { topBpm: 132, elapsedMs: 1000, finished: true });
  const ended = await lab.endSession();

  assert.equal(ended.status, 'ended');
  assert.notEqual(ended.endedAt, '');
  assert.deepEqual(ended.totals, { timerMs: 180000, clips: 0, topBpm: 132 });
  assert.equal(lab.hasOpenSession(), false);

  const stored = await ports.store.getSession(started.id);
  assert.equal(stored.status, 'ended');
  const entries = await ports.store.listEntries(started.id);
  assert.equal(entries.at(-1).kind, 'session-end');
});

await test('a drum session carries its warm-up onto the record and into the log', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();

  const picked = await lab.rollWarmUp({ random: () => 0 });
  assert.ok(picked.beatId, 'the picker names a groove');
  assert.ok(picked.rudimentId, 'the picker names a rudiment');
  assert.equal(lab.warmUp().beatId, picked.beatId);

  const started = await lab.startSession({
    instrument: 'Drums',
    technique: 'Paradiddles',
    target: 'Clean at 90 BPM',
    warmUp: picked,
  });
  assert.deepEqual(started.warmUp, { beatId: picked.beatId, rudimentId: picked.rudimentId });
  // The offer is spent, so the next session picks again.
  assert.equal(lab.warmUp(), null);

  await lab.completeWarmUp();
  const entries = await ports.store.listEntries(started.id);
  assert.deepEqual(entries.map(e => e.kind), ['session-start', 'warm-up-done']);
  assert.equal(entries[1].data.beatId, picked.beatId);
  assert.ok(entries[0].data.warmUp, 'the start line names the warm-up');
});

await test('a session with no warm-up keeps no warm-up field', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  const started = await lab.startSession({
    instrument: 'Guitar', technique: 'Legato', target: 'Even trills',
  });
  assert.equal('warmUp' in started, false);
  assert.equal(await lab.completeWarmUp(), null);
});

await test('the picker skips what the last three sessions warmed up with', async () => {
  const store = createMemoryStore();
  const seen = [];
  let idCount = 0;
  for (let round = 0; round < 6; round += 1) {
    // Each round is its own mount, with its own hour and its own id prefix, so
    // the saved sessions sort the way real ones do.
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
    await lab.startSession({
      instrument: 'Drums', technique: 'Paradiddles', target: `round ${round}`, warmUp: picked,
    });
    await lab.endSession();
    seen.push(picked);
  }
});

await test('one trainer runs at a time', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  await lab.startSession({ instrument: 'Drums', technique: 'Paradiddles', target: 'Clean' });

  lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 100 }), label: 'a' });
  assert.equal(lab.activeTrainer(), 'metronome');
  lab.startTrainer({ kind: 'ratio', plan: ratioPlan({ bpm: 100, beats: 4 }), label: 'b' });
  assert.equal(lab.activeTrainer(), 'ratio');
  lab.stopTrainer();
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
  await lab.startSession({ instrument: 'Guitar', technique: 'Tapping', target: 'Clean' });
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
  await lab.startSession({ instrument: 'Voice', technique: 'Range', target: 'Top C' });
  const started = lab.startTrainer({ kind: 'metronome', plan: metronomePlan({ bpm: 90 }), label: 'a' });
  assert.equal(started, false);
  assert.equal(lab.activeTrainer(), '');
  assert.equal(toasts.length, 1);
});

await test('a clip attaches to the session and a delete marks its log line', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  await lab.startSession({ instrument: 'Guitar', technique: 'Vibrato', target: 'Wide and even' });

  const clip = await lab.saveClip({
    blob: { size: 4210331, type: 'video/webm' },
    mime: 'video/webm', durationMs: 30120, size: 4210331,
  });
  assert.ok(clip.id.startsWith('pl-clip'));
  assert.equal(lab.session().totals.clips, 1);
  const saved = await ports.store.listClips(lab.session().id);
  assert.equal(saved.length, 1);

  await lab.deleteClip(clip.id);
  assert.equal(lab.session().totals.clips, 0);
  const entry = lab.entries().find(e => e.kind === 'clip-saved');
  assert.equal(entry.data.removed, true);
  assert.deepEqual(await ports.store.listClips(lab.session().id), []);
});

await test('a blocked database leaves the session in memory with a notice flag', async () => {
  const store = createMemoryStore();
  store.isAvailable = () => false;
  const lab = createPracticeLab(fakePorts({ store }));
  await lab.init();
  assert.equal(lab.state.canSave, false);
  await lab.startSession({ instrument: 'Guitar', technique: 'Bending', target: 'In tune' });
  assert.equal(lab.hasOpenSession(), true);
});

await test('deleting a clip of a past session rolls up that session again', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  const past = await lab.startSession({ instrument: 'Guitar', technique: 'Tapping', target: 'Clean' });
  const clip = await lab.saveClip({ blob: { size: 100, type: 'video/webm' }, durationMs: 1000, size: 100 });
  await lab.endSession();
  assert.equal((await ports.store.getSession(past.id)).totals.clips, 1);

  // A new session is open. The delete must reach the past session anyway.
  await lab.startSession({ instrument: 'Bass', technique: 'Slap', target: 'B' });
  await lab.deleteClip(clip.id);
  assert.equal((await ports.store.getSession(past.id)).totals.clips, 0);
  assert.deepEqual(await ports.store.listClips(past.id), []);
  const entry = (await ports.store.listEntries(past.id)).find(e => e.kind === 'clip-saved');
  assert.equal(entry.data.removed, true);
});

await test('the history reads one session with its log and its clips', async () => {
  const ports = fakePorts();
  const lab = createPracticeLab(ports);
  await lab.init();
  const one = await lab.startSession({ instrument: 'Guitar', technique: 'Legato', target: 'A' });
  await lab.appendEntry('timer-complete', { minutes: 2 });
  await lab.endSession();
  const two = await lab.startSession({ instrument: 'Bass', technique: 'Slap', target: 'B' });
  await lab.appendEntry('timer-complete', { minutes: 4 });
  await lab.endSession();

  const list = await lab.listSessions();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(s => s.totals.timerMs).sort((a, b) => a - b), [120000, 240000]);

  const record = await lab.readSession(one.id);
  assert.equal(record.session.id, one.id);
  assert.equal(record.entries[0].kind, 'session-start');

  await lab.deleteSession(two.id);
  assert.equal((await lab.listSessions()).length, 1);
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
  assert.ok(names.some(n => n.startsWith('js/practiceLab/engine/')));
  assert.ok(names.some(n => n.startsWith('js/practiceLab/ui/')));
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
