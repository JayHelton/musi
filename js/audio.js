export let audioCtx = null;
export let analyserNode = null;
let compressorNode = null;
let masterGain = null;

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

export function getAnalyserDestination() {
  ensureAudio();
  return analyserNode;
}

export function midiFreq(m) { return 440 * Math.pow(2, (m-69)/12); }
