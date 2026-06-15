export let audioCtx = null;
export let analyserNode = null;

export function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function getAnalyserDestination() {
  ensureAudio();
  return analyserNode;
}

export function midiFreq(m) { return 440 * Math.pow(2, (m-69)/12); }
