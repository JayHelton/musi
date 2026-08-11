/**
 * Zero-dependency Node runner for progress log and library facade tests.
 * Run: node tests/progress/run.mjs
 */

import assert from 'node:assert/strict';

const storage = new Map();
const localStorageShim = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};
globalThis.localStorage = localStorageShim;
globalThis.window = globalThis.window || globalThis;
globalThis.window.localStorage = localStorageShim;

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

async function loadProgressLog({ clear = true } = {}) {
  const mod = await import('../../js/progress/progressLog.js');
  mod.invalidateProgressLogCache();
  if (clear) {
    storage.delete('musi.progressLog');
    mod.invalidateProgressLogCache();
  }
  return mod;
}

function seedCorruptLog() {
  storage.set('musi.progressLog', '{not json');
}

function clearLog(mod) {
  mod.clearProgressLog();
  mod.invalidateProgressLogCache();
}

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

await test('storage key and max attempts constant', async () => {
  const mod = await loadProgressLog();
  assert.equal(mod.PROGRESS_LOG_STORAGE_KEY, 'musi.progressLog');
  assert.equal(mod.PROGRESS_LOG_MAX_ATTEMPTS, 5000);
  clearLog(mod);
});

await test('logAttempt normalizes and clamps every field', async () => {
  const { logAttempt } = await loadProgressLog();
  const record = logAttempt({
    targetType: 'exercise',
    targetId: 'ex-1',
    durationMs: -5,
    bpm: 12,
    accuracy: 1.5,
    effort: 9,
    cleanTake: true,
    status: 'green',
    notes: 'x'.repeat(2500),
    startedAt: '2026-03-01T12:00:00.000Z',
  });
  assert.match(record.id, /^att-/);
  assert.equal(record.targetType, 'exercise');
  assert.equal(record.targetId, 'ex-1');
  assert.equal(record.durationMs, 0);
  assert.equal(record.bpm, 30);
  assert.equal(record.accuracy, 1);
  assert.equal(record.effort, null);
  assert.equal(record.cleanTake, true);
  assert.equal(record.status, 'green');
  assert.equal(record.notes.length, 2000);
  assert.equal(record.startedAt, '2026-03-01T12:00:00.000Z');
});

await test('unknown targetType throws', async () => {
  const { logAttempt } = await loadProgressLog();
  assert.throws(() => logAttempt({ targetType: 'bogus', targetId: 'x' }), /Unknown targetType/);
});

await test('listAttempts newest-first with filters', async () => {
  const { logAttempt, listAttempts } = await loadProgressLog();
  logAttempt({ targetType: 'drill', targetId: 'd-1', startedAt: '2026-01-01T00:00:00.000Z' });
  logAttempt({ targetType: 'drill', targetId: 'd-1', startedAt: '2026-01-03T00:00:00.000Z' });
  logAttempt({ targetType: 'drill', targetId: 'd-2', startedAt: '2026-01-02T00:00:00.000Z' });

  const all = listAttempts({ targetType: 'drill', targetId: 'd-1' });
  assert.equal(all.length, 2);
  assert.equal(all[0].startedAt, '2026-01-03T00:00:00.000Z');
  assert.equal(all[1].startedAt, '2026-01-01T00:00:00.000Z');

  const limited = listAttempts({ targetType: 'drill', limit: 1 });
  assert.equal(limited.length, 1);
});

await test('5000 cap drops oldest attempts', async () => {
  const mod = await loadProgressLog();
  const { PROGRESS_LOG_MAX_ATTEMPTS, logAttempt, listAttempts } = mod;
  clearLog(mod);

  for (let i = 0; i < PROGRESS_LOG_MAX_ATTEMPTS + 3; i += 1) {
    logAttempt({
      targetType: 'exercise',
      targetId: `ex-cap-${i}`,
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    });
  }

  const all = listAttempts({});
  assert.equal(all.length, PROGRESS_LOG_MAX_ATTEMPTS);
  const oldest = all[all.length - 1];
  assert.equal(oldest.targetId, 'ex-cap-3');
});

await test('getTargetSummary aggregates tempoHistory and status recency', async () => {
  const { logAttempt, getTargetSummary } = await loadProgressLog();
  logAttempt({
    targetType: 'exercise',
    targetId: 'ex-sum',
    startedAt: '2026-01-01T00:00:00.000Z',
    bpm: 80,
    accuracy: 0.7,
    cleanTake: false,
    status: 'yellow',
  });
  logAttempt({
    targetType: 'exercise',
    targetId: 'ex-sum',
    startedAt: '2026-01-02T00:00:00.000Z',
    bpm: 100,
    accuracy: 0.9,
    cleanTake: true,
    status: 'green',
  });
  logAttempt({
    targetType: 'exercise',
    targetId: 'ex-sum',
    startedAt: '2026-01-03T00:00:00.000Z',
    status: null,
  });

  const summary = getTargetSummary('exercise', 'ex-sum');
  assert.equal(summary.attempts, 3);
  assert.equal(summary.lastAttemptAt, '2026-01-03T00:00:00.000Z');
  assert.equal(summary.bestBpm, 100);
  assert.equal(summary.lastBpm, 100);
  assert.equal(summary.bestAccuracy, 0.9);
  assert.equal(summary.lastAccuracy, 0.9);
  assert.equal(summary.cleanTakes, 1);
  assert.equal(summary.status, 'green');
  assert.deepEqual(summary.tempoHistory, [
    { at: '2026-01-01T00:00:00.000Z', bpm: 80 },
    { at: '2026-01-02T00:00:00.000Z', bpm: 100 },
  ]);
});

await test('dueColdTests 48h boundaries with injected now', async () => {
  const { logAttempt, dueColdTests } = await loadProgressLog();
  const base = Date.UTC(2026, 0, 10, 12, 0, 0);
  logAttempt({
    targetType: 'exercise',
    targetId: 'ex-cold',
    startedAt: new Date(base).toISOString(),
    status: 'green',
  });

  const at47h = dueColdTests(base + 47 * HOUR_MS);
  assert.equal(at47h.length, 0);

  const at48h = dueColdTests(base + 48 * HOUR_MS);
  assert.equal(at48h.length, 1);
  assert.equal(at48h[0].kind, '48h');
  assert.equal(at48h[0].targetId, 'ex-cold');

  const at49h = dueColdTests(base + 49 * HOUR_MS);
  assert.equal(at49h.length, 1);
  assert.equal(at49h[0].kind, '48h');
});

await test('dueColdTests 7d blue gate', async () => {
  const { logAttempt, dueColdTests } = await loadProgressLog();
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  logAttempt({
    targetType: 'workbook-item',
    targetId: 'wbe-blue',
    startedAt: new Date(base).toISOString(),
    status: 'blue',
  });

  const before7d = dueColdTests(base + 6 * DAY_MS);
  const kindsBefore = before7d.filter(d => d.targetId === 'wbe-blue').map(d => d.kind);
  assert.ok(kindsBefore.includes('48h'));
  assert.ok(!kindsBefore.includes('7d'));

  const at7d = dueColdTests(base + 7 * DAY_MS);
  const blueDue = at7d.filter(d => d.targetId === 'wbe-blue');
  assert.ok(blueDue.some(d => d.kind === '48h'));
  assert.ok(blueDue.some(d => d.kind === '7d'));
});

await test('recordStudyMiss stores detail on miss attempts', async () => {
  const { recordStudyMiss, listAttempts } = await loadProgressLog();
  recordStudyMiss('concept-detail', {
    kind: 'slow-recognition',
    prompt: 'Name it',
    answer: 'M3',
    responseMs: 800,
  });
  const row = listAttempts({ targetType: 'study-concept', targetId: 'concept-detail', limit: 1 })[0];
  assert.equal(row.status, 'red');
  assert.equal(row.detail.kind, 'slow-recognition');
  assert.equal(row.detail.prompt, 'Name it');
});

await test('dueStudyReviews interval expansion and cap', async () => {
  const { logAttempt, dueStudyReviews } = await loadProgressLog();
  const base = Date.UTC(2026, 2, 1, 0, 0, 0);

  logAttempt({
    targetType: 'study-concept',
    targetId: 'concept-a',
    startedAt: new Date(base).toISOString(),
    status: 'red',
    detail: { kind: 'miss', prompt: 'What interval?', answer: 'minor 3rd', responseMs: 4200 },
  });

  const dueAfterMiss = dueStudyReviews(base + DAY_MS);
  assert.ok(dueAfterMiss.some(d => d.conceptId === 'concept-a'));

  logAttempt({
    targetType: 'study-concept',
    targetId: 'concept-a',
    startedAt: new Date(base + DAY_MS).toISOString(),
    status: 'green',
  });
  const due1 = dueStudyReviews(base + DAY_MS + 1);
  assert.ok(!due1.some(d => d.conceptId === 'concept-a'));

  logAttempt({
    targetType: 'study-concept',
    targetId: 'concept-a',
    startedAt: new Date(base + 2 * DAY_MS).toISOString(),
    status: 'green',
  });
  const due2 = dueStudyReviews(base + 2 * DAY_MS + DAY_MS);
  assert.ok(!due2.some(d => d.conceptId === 'concept-a'));
  const due2Over = dueStudyReviews(base + 2 * DAY_MS + 2 * DAY_MS);
  assert.ok(due2Over.some(d => d.conceptId === 'concept-a'));

  for (let i = 0; i < 7; i += 1) {
    logAttempt({
      targetType: 'study-concept',
      targetId: 'concept-b',
      startedAt: new Date(base + i * DAY_MS).toISOString(),
      status: 'green',
    });
  }
  const beforeCap = dueStudyReviews(base + 65 * DAY_MS);
  assert.ok(!beforeCap.some(d => d.conceptId === 'concept-b'));
  const atCap = dueStudyReviews(base + 66 * DAY_MS);
  assert.ok(atCap.some(d => d.conceptId === 'concept-b'));

  logAttempt({
    targetType: 'study-concept',
    targetId: 'concept-b',
    startedAt: new Date(base + 66 * DAY_MS).toISOString(),
    status: 'red',
    detail: { kind: 'miss', prompt: 'p', answer: 'a', responseMs: 100 },
  });
  const resetDue = dueStudyReviews(base + 67 * DAY_MS);
  assert.ok(resetDue.some(d => d.conceptId === 'concept-b'));
});

await test('corrupt JSON yields empty log without throwing', async () => {
  seedCorruptLog();
  const mod = await loadProgressLog();
  assert.equal(mod.listAttempts({}).length, 0);
  mod.logAttempt({ targetType: 'drill', targetId: 'd-safe' });
  assert.equal(mod.listAttempts({ targetId: 'd-safe' }).length, 1);
});

await test('persistence round-trip across invalidateProgressLogCache', async () => {
  const mod = await loadProgressLog();
  mod.clearProgressLog();
  mod.logAttempt({ targetType: 'routine-session', targetId: 'rs-1', status: 'yellow' });
  mod.invalidateProgressLogCache();

  const reloaded = await loadProgressLog({ clear: false });
  const items = reloaded.listAttempts({ targetType: 'routine-session' });
  assert.equal(items.length, 1);
  assert.equal(items[0].targetId, 'rs-1');
  assert.equal(items[0].status, 'yellow');
  assert.ok(storage.has('musi.progressLog'));
});

console.log(`\n${passed} progress tests passed`);

await import('./library.mjs');

console.log('progress tests: ok');
