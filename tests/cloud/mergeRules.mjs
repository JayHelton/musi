import assert from 'node:assert/strict';
import { mergeCounterPayload } from '../../js/cloud/reconcile.js';

export async function runMergeRulesTests(test) {
  await test('mergeCounterPayload progress:stats bestStreak max and per-day sums', () => {
    const local = {
      today: { day: '2026-08-09', trainedMs: 100, attempts: 2, correct: 1, perSkill: { scale: { attempts: 2, correct: 1 } } },
      bestStreak: 3,
      currentStreak: 1,
      lastActivityTs: 50,
    };
    const remote = {
      today: { day: '2026-08-09', trainedMs: 200, attempts: 3, correct: 2, perSkill: { scale: { attempts: 1, correct: 1 } } },
      bestStreak: 5,
      currentStreak: 2,
      lastActivityTs: 80,
    };
    const merged = mergeCounterPayload('progress:stats', local, remote);
    assert.equal(merged.bestStreak, 5);
    assert.equal(merged.today.trainedMs, 300);
    assert.equal(merged.today.attempts, 5);
    assert.equal(merged.today.correct, 3);
    assert.equal(merged.today.perSkill.scale.attempts, 3);
    assert.equal(merged.today.perSkill.scale.correct, 2);
  });

  await test('mergeCounterPayload io.masteryV2 per-key max counters', () => {
    const local = { 'k1': { attempts: 3, correct: 2, totalMs: 100 } };
    const remote = { 'k1': { attempts: 5, correct: 1, totalMs: 200 } };
    const merged = mergeCounterPayload('progress:io.masteryV2', local, remote);
    assert.equal(merged.k1.attempts, 5);
    assert.equal(merged.k1.correct, 2);
    assert.equal(merged.k1.totalMs, 200);
  });

  await test('mergeCounterPayload study.progress newest lastReviewedAt and summed counters', () => {
    const local = {
      version: 1,
      concepts: { major_scale: { lastReviewedAt: 100, completions: 2, misses: 1, hintHeavy: 0 } },
      recentStudies: [],
      lastPrimaryId: null,
      lastPrimaryAt: 0,
    };
    const remote = {
      version: 1,
      concepts: { major_scale: { lastReviewedAt: 200, completions: 1, misses: 2, hintHeavy: 1 } },
      recentStudies: [],
      lastPrimaryId: null,
      lastPrimaryAt: 0,
    };
    const merged = mergeCounterPayload('progress:study.progress', local, remote);
    assert.equal(merged.concepts.major_scale.lastReviewedAt, 200);
    assert.equal(merged.concepts.major_scale.completions, 3);
    assert.equal(merged.concepts.major_scale.misses, 3);
  });

  await test('mergeCounterPayload io.sessionHistory dedupes by at', () => {
    const local = [{ at: 10, minutes: 1 }, { at: 20, minutes: 2 }];
    const remote = [{ at: 20, minutes: 5 }, { at: 30, minutes: 3 }];
    const merged = mergeCounterPayload('progress:io.sessionHistory', local, remote);
    assert.equal(merged.length, 3);
    assert.deepEqual(merged.map((e) => e.at), [10, 20, 30]);
    assert.equal(merged.find((e) => e.at === 20).minutes, 5);
  });
}
