/* Musi pitch capture worklet.
 *
 * Keeps a 4096-sample ring buffer and posts a window copy every hop (512
 * samples at 48 kHz is ~10.7 ms). Pitch detection runs in a Worker, not here.
 */
const WINDOW_SIZE = 4096;
const HOP_SIZE = 512;

class PitchCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ring = new Float32Array(WINDOW_SIZE);
    this._writePos = 0;
    this._filled = 0;
    this._samplesSinceHop = 0;
    this._outBuf = new Float32Array(WINDOW_SIZE);
  }

  _copyWindow() {
    const start = this._writePos;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      this._outBuf[i] = this._ring[(start + i) % WINDOW_SIZE];
    }
    return this._outBuf.slice();
  }

  _postWindow() {
    if (this._filled < WINDOW_SIZE) return;
    this.port.postMessage({
      buf: this._copyWindow(),
      audioTime: currentTime,
    });
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._ring[this._writePos] = channel[i];
      this._writePos = (this._writePos + 1) % WINDOW_SIZE;
      if (this._filled < WINDOW_SIZE) this._filled++;
      this._samplesSinceHop++;
      if (this._samplesSinceHop >= HOP_SIZE) {
        this._samplesSinceHop = 0;
        this._postWindow();
      }
    }
    return true;
  }
}

registerProcessor('pitch-capture', PitchCaptureProcessor);
