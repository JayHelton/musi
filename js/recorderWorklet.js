/* Musi recorder PCM capture worklet.
 *
 * Buffers the (mono) input signal into ~4096-sample blocks and posts the raw
 * Float32 samples back to the main thread so the recorder can encode a
 * lossless WAV. Batching keeps the main-thread message rate low compared with
 * posting every 128-sample render quantum. */
const BATCH_SIZE = 4096;

class RecorderCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(BATCH_SIZE);
    this._offset = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') this._flush();
    };
  }

  _flush() {
    if (this._offset > 0) {
      this.port.postMessage(this._buffer.slice(0, this._offset));
      this._offset = 0;
    }
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset === BATCH_SIZE) {
        this.port.postMessage(this._buffer);
        this._buffer = new Float32Array(BATCH_SIZE);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('recorder-capture', RecorderCaptureProcessor);
