export let audioCtx = null;
export let analyserNode = null;
let compressorNode = null;
let masterGain = null;
let micSessionDepth = 0;
let previousAudioSessionType = null;

// Global output level applied at the master bus. Defaults louder than the old
// fixed 0.75 because users found the app too quiet; adjustable up to 1.5 for
// extra headroom. The value lives here so it survives before the AudioContext
// is created and is re-applied the moment the master gain node exists.
const MAX_MASTER_VOLUME = 1.5;
let masterVolume = 1.0;

export function getMasterVolume() {
  return masterVolume;
}

export function setMasterVolume(v) {
  const vol = Math.max(0, Math.min(MAX_MASTER_VOLUME, Number(v)));
  if (Number.isNaN(vol)) return masterVolume;
  masterVolume = vol;
  if (masterGain && audioCtx) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(masterVolume, now + 0.05);
  }
  return masterVolume;
}

export function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    // Prefer a 48 kHz context so mic capture and lossless WAV export run at a
    // consistent, high-quality rate. Fall back to the default rate if the
    // browser/hardware rejects the hint.
    try {
      audioCtx = new Ctx({ sampleRate: 48000 });
    } catch (e) {
      audioCtx = new Ctx();
    }

    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;

    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.value = -24;
    compressorNode.knee.value = 12;
    compressorNode.ratio.value = 6;
    compressorNode.attack.value = 0.003;
    compressorNode.release.value = 0.15;

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    analyserNode.connect(compressorNode);
    compressorNode.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function getAudioSession() {
  if (typeof navigator === 'undefined') return null;
  const session = navigator.audioSession;
  return session && typeof session.type === 'string' ? session : null;
}

function setAudioSessionType(type) {
  const session = getAudioSession();
  if (!session) return false;
  try {
    session.type = type;
    return true;
  } catch (e) {
    return false;
  }
}

// Number of live microphone captures. Tracked independently of the iOS-only
// audio-session bookkeeping above so it is reliable on every platform.
let activeCaptureCount = 0;

// Expose whether any microphone capture is currently active so app-level code
// (e.g. the service-worker update handler) can avoid disruptive actions like a
// full page reload that would yank the mic out from under a live session.
function updateCaptureFlag() {
  if (typeof window !== 'undefined') {
    window.__musiCaptureActive = activeCaptureCount > 0;
  }
}

export function isCaptureActive() {
  return activeCaptureCount > 0;
}

function beginMicAudioSession() {
  const session = getAudioSession();
  if (!session) return;
  if (micSessionDepth === 0) {
    previousAudioSessionType = session.type || 'auto';
    // Reset before getUserMedia; iOS is more reliable when the recording
    // session is asserted after the microphone stream has actually opened.
    setAudioSessionType('auto');
  }
  micSessionDepth += 1;
}

function activateMicAudioSession() {
  if (micSessionDepth > 0) setAudioSessionType('play-and-record');
}

function endMicAudioSession() {
  if (micSessionDepth <= 0) return;
  micSessionDepth -= 1;
  if (micSessionDepth > 0) return;
  const restoreType = previousAudioSessionType || 'auto';
  previousAudioSessionType = null;
  // Kick iOS out of the lower-quality recording route before restoring the
  // page's prior mode, which keeps Bluetooth and wired output selected.
  setAudioSessionType('playback');
  setAudioSessionType(restoreType);
}

export async function requestMicStream(constraints) {
  beginMicAudioSession();
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    activateMicAudioSession();
    activeCaptureCount += 1;
    updateCaptureFlag();
    return stream;
  } catch (e) {
    endMicAudioSession();
    throw e;
  }
}

export function releaseMicStream(stream) {
  if (stream) {
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* noop */ }
    activeCaptureCount = Math.max(0, activeCaptureCount - 1);
    updateCaptureFlag();
  }
  endMicAudioSession();
}

export function getAnalyserDestination() {
  ensureAudio();
  return analyserNode;
}

export function midiFreq(m) { return 440 * Math.pow(2, (m-69)/12); }
