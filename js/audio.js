export let audioCtx = null;
export let analyserNode = null;
let compressorNode = null;
let masterGain = null;

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
    masterGain.gain.value = 0.75;

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
