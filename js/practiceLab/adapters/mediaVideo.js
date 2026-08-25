// The camera port over `getUserMedia` and `MediaRecorder`.
//
// The clip holds the video and the microphone sound, so the player hears the
// notes and the click on playback. The recorder stops itself at the duration
// cap or the size cap and saves what it holds.

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

function mediaApiAvailable() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

function recorderAvailable() {
  return typeof MediaRecorder !== 'undefined';
}

/** The reason text of a media error, in the words `js/sync/camera.js` uses. */
export function friendlyMediaError(error) {
  const name = error && error.name ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission denied. Allow camera access and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is in use by another app — close other programs using the webcam and try again.';
  }
  if (name === 'OverconstrainedError') {
    return 'Could not use the selected camera.';
  }
  if (name === 'SecurityError') {
    return 'Camera access is blocked in this context.';
  }
  return error && error.message ? error.message : 'Could not access the camera.';
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/**
 * @param {{ durationCapMs?: number, sizeCapBytes?: number }} [options]
 * @returns {Object} a VideoPort
 */
export function createMediaVideo({ durationCapMs = 5 * 60 * 1000, sizeCapBytes = 128 * 1024 * 1024 } = {}) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let bytes = 0;
  let startedMs = 0;
  let capTimer = null;
  let onCap = null;
  /** Set while a stop waits for the recorder to flush its last chunk. */
  let pendingStop = null;

  function stopTracks() {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch (e) { /* already stopped */ }
    }
    stream = null;
  }

  function clearCapTimer() {
    if (capTimer == null) return;
    clearTimeout(capTimer);
    capTimer = null;
  }

  return {
    capabilities() {
      return { camera: mediaApiAvailable(), recorder: recorderAvailable() };
    },

    /**
     * Open the mirror. The stream holds the microphone too, so a recording
     * keeps the sound of the room.
     * @returns {Promise<{ stream: MediaStream }>}
     */
    async openMirror() {
      if (!mediaApiAvailable()) {
        throw new Error('This browser has no camera support.');
      }
      if (stream) return { stream };
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'user' } },
        audio: true,
      });
      return { stream };
    },

    /**
     * Start a recording.
     * @param {{ onCapReached?: Function }} [options]
     */
    async startRecording({ onCapReached } = {}) {
      if (!stream) await this.openMirror();
      if (!recorderAvailable()) throw new Error('This browser cannot record video.');
      if (recorder) return;
      chunks = [];
      bytes = 0;
      onCap = typeof onCapReached === 'function' ? onCapReached : null;
      const mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (!event.data || !event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes >= sizeCapBytes && recorder && recorder.state === 'recording') {
          onCap?.('size');
        }
      };
      startedMs = Date.now();
      // One second slices keep the size check close to the cap.
      recorder.start(1000);
      capTimer = setTimeout(() => { onCap?.('duration'); }, durationCapMs);
    },

    /**
     * Stop the recording and return the clip.
     * @returns {Promise<{ blob: Blob, mime: string, durationMs: number, size: number }|null>}
     */
    stopRecording() {
      clearCapTimer();
      if (pendingStop) return pendingStop;
      if (!recorder) return Promise.resolve(null);
      const active = recorder;
      recorder = null;
      pendingStop = new Promise((resolve) => {
        active.onstop = () => {
          const mime = active.mimeType || 'video/webm';
          const blob = new Blob(chunks, { type: mime });
          const durationMs = Math.max(0, Date.now() - startedMs);
          chunks = [];
          resolve({ blob, mime, durationMs, size: blob.size });
        };
        try {
          if (active.state !== 'inactive') active.stop();
          else active.onstop();
        } catch (e) {
          resolve(null);
        }
      });
      return pendingStop.then((clip) => { pendingStop = null; return clip; });
    },

    /** True while a recording runs. */
    isRecording() {
      return !!recorder;
    },

    /** The milliseconds the current recording has run. */
    recordingMs() {
      return recorder ? Math.max(0, Date.now() - startedMs) : 0;
    },

    /** Stop the recorder and the camera. */
    close() {
      clearCapTimer();
      // A stop already in flight still needs its tracks. Wait for the flush,
      // or the last chunk of the clip is lost.
      if (pendingStop) {
        pendingStop.then(stopTracks, stopTracks);
        return;
      }
      if (recorder) {
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) { /* gone */ }
        recorder = null;
      }
      chunks = [];
      stopTracks();
    },
  };
}
