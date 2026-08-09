import { decodeQrFromImageData } from '../qr/qrDecode.js';

const DEFAULT_NATIVE_FPS = 10;
const DEFAULT_FALLBACK_FPS = 6;
const FALLBACK_MAX_EDGE = 640;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function nativeQrSupported() {
  if (!isBrowser() || typeof BarcodeDetector === 'undefined') {
    return false;
  }
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    return Array.isArray(formats) && formats.includes('qr_code');
  } catch (e) {
    return false;
  }
}

function cameraApiAvailable() {
  return isBrowser()
    && typeof navigator !== 'undefined'
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

function friendlyMediaError(error) {
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

function statusStateForError(error) {
  const name = error && error.name ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-camera';
  return 'error';
}

function inferFacing(label) {
  const lower = (label || '').toLowerCase();
  if (/back|rear|environment/.test(lower)) return 'environment';
  if (/front|user|face/.test(lower)) return 'user';
  return 'unknown';
}

function buildConstraintAttempts({ deviceId, facingMode }) {
  const base = {};
  if (deviceId) base.deviceId = { exact: deviceId };
  const facing = facingMode || 'environment';

  return [
    { video: { ...base, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: facing } } },
    { video: { ...base, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { ...base, facingMode: { ideal: facing } } },
    { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } } },
    { video: true },
  ];
}

async function acquireStream(options) {
  const attempts = buildConstraintAttempts(options);
  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('Could not access the camera.');
}

function waitForVideoReady(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video failed to start.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onError);
  });
}

export async function scannerSupport() {
  if (!cameraApiAvailable()) {
    return { camera: false, native: false, reason: 'Camera API unavailable in this environment.' };
  }
  const native = await nativeQrSupported();
  return { camera: true, native, reason: null };
}

export async function listVideoInputs() {
  if (!cameraApiAvailable()) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '',
        facing: inferFacing(d.label),
      }));
  } catch (e) {
    return [];
  }
}

export async function startScanner({
  video,
  deviceId = null,
  facingMode = 'environment',
  onText = () => {},
  onStatus = () => {},
  onError = () => {},
  fps,
} = {}) {
  if (!isBrowser() || !video) {
    throw new Error('A video element is required.');
  }

  const useNative = await nativeQrSupported();
  const targetFps = fps ?? (useNative ? DEFAULT_NATIVE_FPS : DEFAULT_FALLBACK_FPS);
  const frameIntervalMs = 1000 / Math.max(1, targetFps);

  let stream = null;
  let currentDeviceId = deviceId || null;
  let stopped = false;
  let timerId = null;
  let lastText = null;
  let detector = null;
  let canvas = null;
  let ctx = null;
  let imageData = null;

  const emitStatus = (state, message = null) => {
    try {
      onStatus({ state, message });
    } catch (e) {
      // ignore callback failures
    }
  };

  const releaseStream = () => {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (e) {
        // ignore
      }
    }
    stream = null;
    try {
      video.srcObject = null;
    } catch (e) {
      // ignore
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    releaseStream();
    emitStatus('stopped');
  };

  const decodeFrame = async () => {
    if (stopped || !stream) return;

    try {
      if (useNative) {
        if (!detector) detector = new BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(video);
        for (const code of codes) {
          const text = code && code.rawValue;
          if (typeof text === 'string' && text.length > 0 && text !== lastText) {
            lastText = text;
            onText(text);
          }
        }
      } else {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return;

        if (!canvas) {
          canvas = document.createElement('canvas');
          ctx = canvas.getContext('2d', { willReadFrequently: true });
        }

        const scale = FALLBACK_MAX_EDGE / Math.max(vw, vh);
        const dw = scale < 1 ? Math.round(vw * scale) : vw;
        const dh = scale < 1 ? Math.round(vh * scale) : vh;
        if (canvas.width !== dw || canvas.height !== dh) {
          canvas.width = dw;
          canvas.height = dh;
          imageData = null;
        }

        ctx.drawImage(video, 0, 0, dw, dh);
        imageData = ctx.getImageData(0, 0, dw, dh);

        const text = decodeQrFromImageData(imageData);
        if (typeof text === 'string' && text.length > 0 && text !== lastText) {
          lastText = text;
          onText(text);
        }
      }
    } catch (e) {
      try {
        onError(e);
      } catch (err) {
        // ignore
      }
    }
  };

  const scheduleLoop = () => {
    if (stopped) return;
    timerId = setTimeout(async () => {
      await decodeFrame();
      scheduleLoop();
    }, frameIntervalMs);
  };

  const attachStream = async (nextDeviceId) => {
    releaseStream();
    currentDeviceId = nextDeviceId || null;
    lastText = null;

    emitStatus('requesting', 'Requesting camera…');
    stream = await acquireStream({ deviceId: currentDeviceId, facingMode });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;

    await waitForVideoReady(video);
    await video.play();
    emitStatus('scanning');
  };

  try {
    await attachStream(currentDeviceId);
    scheduleLoop();
  } catch (e) {
    releaseStream();
    const message = friendlyMediaError(e);
    emitStatus(statusStateForError(e), message);
    try {
      onError(Object.assign(new Error(message), { name: e && e.name }));
    } catch (err) {
      // ignore
    }
    return {
      stop,
      switchCamera: async () => {},
      currentDeviceId: () => currentDeviceId,
      usingNative: () => useNative,
    };
  }

  return {
    stop,
    async switchCamera(nextDeviceId) {
      if (stopped || !nextDeviceId) return;
      try {
        await attachStream(nextDeviceId);
      } catch (e) {
        const message = friendlyMediaError(e);
        emitStatus(statusStateForError(e), message);
        onError(Object.assign(new Error(message), { name: e && e.name }));
      }
    },
    currentDeviceId: () => currentDeviceId,
    usingNative: () => useNative,
  };
}
