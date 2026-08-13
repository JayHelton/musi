import assert from 'node:assert/strict';
import { createPitchMatcher } from '../../js/pitchMatch.js';
import {
  lockoutUntil,
  isScoringWindowClear,
  analysisWindowSec,
  ROOM_TAIL_SEC,
} from '../../js/pitchGuideLock.js';
import { samplesForTone } from './helpers.mjs';

const TARGET_MIDI = 69;

function feedMatcher(matcher, samples, count = true) {
  let last = null;
  for (const s of samples) {
    last = matcher.update(s, s.timestampMs, count);
  }
  return last;
}

export function runLockoutTests() {
  console.log('lockout test 1: window overlapping lockUntil is not clear');
  {
    const cap = { sampleRate: 48000, windowSize: 4096 };
    const windowSec = analysisWindowSec(cap);
    assert.ok(Math.abs(windowSec - 0.085333) < 0.0001, 'windowSec');
    const audibleEnd = 1.0;
    const lockUntil = lockoutUntil(audibleEnd);
    assert.equal(lockUntil, 1.6);
    assert.equal(isScoringWindowClear(1.65, lockUntil, cap), false);
    assert.equal(isScoringWindowClear(1.70, lockUntil, cap), true);
  }

  console.log('lockout test 2: lockoutUntil does not include analysis window');
  {
    const audibleEnd = 2.5;
    assert.equal(lockoutUntil(audibleEnd), audibleEnd + ROOM_TAIL_SEC);
  }

  console.log('lockout test 3: Infinity lock is never clear');
  {
    const cap = { sampleRate: 48000, windowSize: 4096 };
    assert.equal(isScoringWindowClear(10, Infinity, cap), false);
  }

  console.log('lockout test 4: matcher progress stays 0 during lockout overlap');
  {
    const m = createPitchMatcher({ profileId: 'center', holdMs: 1000 });
    m.setTarget(TARGET_MIDI);
    const cap = { sampleRate: 48000, windowSize: 4096 };
    const audibleEnd = 1.0;
    const lockUntil = lockoutUntil(audibleEnd);

    const lockoutSamples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 0 });
    for (const s of lockoutSamples) {
      const audioTime = audibleEnd + (s.timestampMs / 1000);
      if (!isScoringWindowClear(audioTime, lockUntil, cap)) {
        feedMatcher(m, [s], false);
      }
    }

    const clearAudioTime = lockUntil + analysisWindowSec(cap) + 0.01;
    const clearMs = clearAudioTime * 1000;
    const firstScoring = m.update(
      { ...lockoutSamples[0], timestampMs: clearMs },
      clearMs,
      true,
    );
    assert.equal(firstScoring.progress, 0, 'progress after lockout starts at 0');
    assert.equal(firstScoring.heldMs ?? 0, 0, 'heldMs after lockout starts at 0');

    const after = feedMatcher(
      m,
      samplesForTone({ fps: 60, durationMs: 1500, centsOff: 0, startMs: clearMs }),
      true,
    );
    assert.equal(after.matched, true, 'pass after lockout with 1500 ms hold');
  }
}
