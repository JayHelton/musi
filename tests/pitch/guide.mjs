/**
 * Melody-guide tests for the pitch runner.
 *
 * The guide holds every note for the whole length of the note, and it must not
 * stop the pitch detection. These tests prove the timing helpers and the mic
 * constraints that keep the guide out of the score.
 */

import assert from 'node:assert/strict';
import { guidePlayWindow, guideSoundsAt, GUIDE_MIN_SEC } from '../../js/runnerGuide.js';
import { ROOM_TAIL_SEC } from '../../js/pitchGuideLock.js';
import { echoCancelledMonoAudioConstraints, micEchoCancellationOn } from '../../js/audio.js';

function stubSupportedConstraints(supported) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getSupportedConstraints: () => supported } },
    configurable: true,
    writable: true,
  });
}

export function runGuideTests() {
  console.log('guide test 1: the tone covers the whole note');
  {
    const cue = guidePlayWindow({ heardStart: 10, heardEnd: 12, delaySec: 0, now: 5 });
    assert.equal(cue.playAt, 10, 'the tone starts with the note');
    assert.equal(cue.durSec, 2, 'the tone holds for the whole note');
  }

  console.log('guide test 2: the tone leaves early by the output delay');
  {
    const cue = guidePlayWindow({ heardStart: 10, heardEnd: 12, delaySec: 0.25, now: 5 });
    assert.equal(cue.playAt, 9.75, 'the tone leaves early');
    assert.equal(cue.durSec, 2, 'the length of the tone stays the length of the note');
  }

  console.log('guide test 3: a note that already started keeps the rest of its tone');
  {
    const cue = guidePlayWindow({ heardStart: 10, heardEnd: 12, delaySec: 0, now: 11 });
    assert.equal(cue.playAt, 11, 'the tone starts now');
    assert.equal(cue.durSec, 1, 'the tone holds to the end of the note');
  }

  console.log('guide test 4: a note that is almost over gets no tone');
  {
    const cue = guidePlayWindow({ heardStart: 10, heardEnd: 12, delaySec: 0, now: 11.95 });
    assert.equal(cue, null, 'a tone shorter than the minimum does not play');
    const shortest = guidePlayWindow({ heardStart: 0, heardEnd: GUIDE_MIN_SEC, now: 0 });
    assert.equal(shortest.durSec, GUIDE_MIN_SEC, 'the shortest tone still plays');
  }

  console.log('guide test 5: bad numbers give no tone');
  {
    assert.equal(guidePlayWindow({ heardStart: NaN, heardEnd: 1 }), null);
    assert.equal(guidePlayWindow({ heardStart: 0, heardEnd: Infinity }), null);
  }

  console.log('guide test 6: the guide sounds through the whole note');
  {
    const notes = [
      { startAudioTime: 1, endAudioTime: 3 },
      { startAudioTime: 3.2, endAudioTime: 5.2 },
    ];
    assert.equal(guideSoundsAt(notes, 0.5), false, 'silent before the first note');
    assert.equal(guideSoundsAt(notes, 1), true, 'sounds at the start of the note');
    assert.equal(guideSoundsAt(notes, 2.9), true, 'sounds at the end of the note');
    assert.equal(guideSoundsAt(notes, 4), true, 'sounds through the next note');
    assert.equal(guideSoundsAt(notes, 5.3), true, 'the room tail still holds the guide');
    assert.equal(guideSoundsAt(notes, 5.2 + ROOM_TAIL_SEC + 0.01), false, 'silent after the room tail');
    assert.equal(guideSoundsAt([], 4), false, 'a run with no note is silent');
  }

  console.log('guide test 7: the mic cancels the output of the app for the guide');
  {
    stubSupportedConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: true,
    });
    const { audio } = echoCancelledMonoAudioConstraints();
    assert.equal(audio.echoCancellation, true, 'echo cancellation keeps the guide out of the mic');
    assert.equal(audio.noiseSuppression, false, 'noise suppression must not change the voice');
    assert.equal(audio.autoGainControl, false, 'auto gain control must not change the voice');
    assert.equal(audio.channelCount, 1, 'the detector reads one channel');

    stubSupportedConstraints({});
    assert.deepEqual(echoCancelledMonoAudioConstraints(), { audio: true }, 'plain request as a fallback');

    assert.equal(micEchoCancellationOn({ echoCancellation: true }), true);
    assert.equal(micEchoCancellationOn({ echoCancellation: false }), false);
    assert.equal(micEchoCancellationOn(null), false, 'no settings means no cancellation');
  }
}
