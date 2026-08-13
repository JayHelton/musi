import assert from 'node:assert/strict';
import {
  recordAttempt,
  loadAttempts,
  summarizeAttempts,
  weakMidiSet,
} from '../../js/pitchProgress.js';

function mockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  return store;
}

export function runProgressTests() {
  console.log('test: summarizeAttempts weak note ranking');
  {
    const attempts = [
      {
        timestamp: 1,
        task: 'center',
        targetMidi: 60,
        profile: 'center',
        holdDurationMs: 1000,
        centerErrorCents: 10,
        stabilityCents: 12,
        meanAbsoluteErrorCents: 10,
        voicedCoverage: 0.9,
        inTuneCoverage: 0.8,
        settleTimeMs: 400,
        passed: false,
      },
      {
        timestamp: 2,
        task: 'center',
        targetMidi: 61,
        profile: 'center',
        holdDurationMs: 1000,
        centerErrorCents: -5,
        stabilityCents: 8,
        meanAbsoluteErrorCents: 5,
        voicedCoverage: 0.92,
        inTuneCoverage: 0.85,
        settleTimeMs: 350,
        passed: true,
      },
      {
        timestamp: 3,
        task: 'center',
        targetMidi: 60,
        profile: 'center',
        holdDurationMs: 1000,
        centerErrorCents: 15,
        stabilityCents: 15,
        meanAbsoluteErrorCents: 15,
        voicedCoverage: 0.88,
        inTuneCoverage: 0.75,
        settleTimeMs: 450,
        passed: false,
      },
    ];

    const summary = summarizeAttempts(attempts);
    assert.equal(summary.weakNotes[0].midi, 60);
    assert.equal(summary.weakNotes[0].passRate, 0);
    assert.ok(summary.weakNotes[0].absError > summary.weakNotes[1].absError);
    assert.equal(summary.avgAbsCenterError, 10);
    assert.equal(summary.biasCents, 6.666666666666667);
    assert.equal(summary.avgStability, 11.666666666666666);
    assert.equal(summary.avgSettleMs, 400);
    assert.equal(summary.passRate, 1 / 3);
    assert.deepEqual(weakMidiSet(summary), [60, 61]);

    const chest = summary.byRegister.chest;
    assert.equal(chest.n, 3);
    assert.equal(chest.avgAbsCenterError, 10);
    assert.equal(chest.passRate, 1 / 3);
  }

  console.log('test: recordAttempt persists and caps attempts');
  {
    const store = mockLocalStorage();
    store.clear();

    const base = {
      task: 'center',
      targetMidi: 62,
      profile: 'center',
      holdDurationMs: 1000,
      centerErrorCents: 4,
      stabilityCents: 6,
      meanAbsoluteErrorCents: 4,
      voicedCoverage: 0.9,
      inTuneCoverage: 0.85,
      settleTimeMs: 300,
      passed: true,
    };

    for (let i = 0; i < 3; i++) {
      recordAttempt({ ...base, timestamp: i });
    }

    const loaded = loadAttempts();
    assert.equal(loaded.length, 3);
    assert.equal(loaded[0].targetMidi, 62);
    assert.equal(loaded[2].timestamp, 2);

    for (let i = 0; i < 502; i++) {
      recordAttempt({ ...base, timestamp: 1000 + i, targetMidi: 63 });
    }
    const capped = loadAttempts();
    assert.equal(capped.length, 500);
    assert.equal(capped[0].targetMidi, 63);
    assert.equal(capped[0].timestamp, 1002);
  }

  console.log('test: attempt records have no streak field');
  {
    const store = mockLocalStorage();
    store.clear();
    recordAttempt({
      timestamp: Date.now(),
      task: 'center',
      targetMidi: 64,
      profile: 'center',
      holdDurationMs: 1000,
      centerErrorCents: 2,
      stabilityCents: 5,
      meanAbsoluteErrorCents: 2,
      voicedCoverage: 0.9,
      inTuneCoverage: 0.9,
      settleTimeMs: 280,
      passed: true,
    });
    const row = loadAttempts()[0];
    assert.equal('streak' in row, false);
    assert.equal('streakCount' in row, false);
  }
}
