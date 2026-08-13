/**
 * Microphone lifecycle tests (18–20). Uses stubs — no real getUserMedia in Node.
 */

import { releaseMicStream, requestMicStream, isCaptureActive, getActiveCaptureCount } from '../../js/audio.js';
import {
  openPitchMic,
  registerPitchMicStop,
  stopOtherPitchMicTools,
  unregisterPitchMicStop,
} from '../../js/pitchMic.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function makeFakeStream() {
  let stopped = 0;
  return {
    getTracks: () => [{ stop: () => { stopped += 1; } }],
    getAudioTracks: () => [{ getSettings: () => ({ channelCount: 1 }) }],
    _stoppedCount: () => stopped,
  };
}

function stubNavigator(mediaDevices) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices, audioSession: null },
    configurable: true,
    writable: true,
  });
  globalThis.window = globalThis;
}

export async function runMicTests() {
  console.log('test 18: each stopped tool releases its microphone stream');
  {
    const directFake = makeFakeStream();
    releaseMicStream(directFake);
    assert(directFake._stoppedCount() === 1, 'releaseMicStream must stop every track');

    stubNavigator({
      getSupportedConstraints: () => ({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: true,
      }),
      getUserMedia: async () => makeFakeStream(),
    });

    const stream = await requestMicStream({ audio: true });
    assert(isCaptureActive(), 'capture should be active after requestMicStream');
    assert(getActiveCaptureCount() === 1, 'capture count should be 1');
    releaseMicStream(stream);
    assert(!isCaptureActive(), 'capture should be inactive after release');
    assert(getActiveCaptureCount() === 0, 'capture count should be 0');
  }

  console.log('test 19: only one microphone tool can run at one time');
  {
    let aActive = true;
    let bStopCalled = false;
    registerPitchMicStop('tool-a', () => { aActive = false; });
    registerPitchMicStop('tool-b', () => { bStopCalled = true; });
    stopOtherPitchMicTools('tool-b');
    assert(!aActive, 'tool A must stop when tool B starts');
    assert(!bStopCalled, 'tool B stop must not run when tool B starts');
    unregisterPitchMicStop('tool-a');
    unregisterPitchMicStop('tool-b');
  }

  console.log('test 20: microphone denial leaves a recoverable state');
  {
    const denied = async () => {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    };
    const result = await openPitchMic(denied);
    assert(result.ok === false, 'denied mic must return ok:false');
    assert(result.stream === null, 'denied mic must not return a stream');
    assert(result.error === 'denied', 'denied mic must report denied error');
    assert(!isCaptureActive(), 'denied mic must not leave capture active');
  }
}
