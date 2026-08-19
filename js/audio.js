import {
  attachMixGraph,
  getMixInput,
  getMasterGainNode,
  getSafetyStage,
} from './audio/mixBus.js';

export let audioCtx = null;
export let analyserNode = null;
let compressorNode = null;
let masterGain = null;
let micSessionDepth = 0;
let previousAudioSessionType = null;

// Global output level applied at the master bus. Musi was too quiet, so the
// default sits above unity and the slider reaches 300%. The master gain node
// comes before the safety limiter, so a high level makes the mix louder and
// the limiter still holds the peak at -1 dBFS. The value lives here so it
// survives before the AudioContext exists, and Musi re-applies it the moment
// the master gain node is ready.
export const MAX_MASTER_VOLUME = 3.0;
export const DEFAULT_MASTER_VOLUME = 1.8;
let masterVolume = DEFAULT_MASTER_VOLUME;

export function getMasterVolume() {
  return masterVolume;
}

export function setMasterVolume(v) {
  const vol = Math.max(0, Math.min(MAX_MASTER_VOLUME, Number(v)));
  if (Number.isNaN(vol)) return masterVolume;
  masterVolume = vol;
  const gainNode = masterGain || getMasterGainNode();
  if (gainNode && audioCtx) {
    const now = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(masterVolume, now + 0.05);
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

    const graph = attachMixGraph(audioCtx, { masterVolume });
    compressorNode = graph.compressorNode;
    masterGain = graph.masterGainNode;

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    const { output } = getSafetyStage();
    if (output) {
      output.connect(analyserNode);
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  warmClickVoice();
}

// The metronome click can be a file the user uploaded. Decoding it needs an
// AudioContext, so warm it as soon as there is one. The call is cheap after
// the first decode, and a failure leaves the built-in click in place.
function warmClickVoice() {
  if (!audioCtx) return;
  import('./audio/clickSynth.js')
    .then((mod) => mod.prepareClickVoice(audioCtx))
    .catch(() => { /* the built-in click still plays */ });
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

export function getActiveCaptureCount() {
  return activeCaptureCount;
}

export function rawMonoAudioConstraints() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getSupportedConstraints) {
    return { audio: true };
  }
  const supported = navigator.mediaDevices.getSupportedConstraints();
  const audio = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  if (supported.channelCount) audio.channelCount = 1;
  return Object.keys(audio).length ? { audio } : { audio: true };
}

export async function requestMicStreamRaw() {
  try {
    return await requestMicStream(rawMonoAudioConstraints());
  } catch (e) {
    return requestMicStream({ audio: true });
  }
}

export function inspectTrackSettings(stream) {
  const tracks = stream?.getAudioTracks?.();
  if (!tracks?.length) return {};
  const settings = tracks[0].getSettings?.();
  return settings && typeof settings === 'object' ? { ...settings } : {};
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
  return getMixInput();
}

/** Mix bus input before the shared dynamics compressor. */
export function getMixDestination() {
  ensureAudio();
  return getMixInput();
}

export function getCompressorNode() {
  ensureAudio();
  return compressorNode;
}

export function midiFreq(m) { return 440 * Math.pow(2, (m-69)/12); }
