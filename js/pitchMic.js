import {
  requestMicStreamRaw,
  releaseMicStream,
  inspectTrackSettings,
  isCaptureActive,
} from './audio.js';

const stopHandlers = new Map();

export function registerPitchMicStop(id, stopFn) {
  stopHandlers.set(id, stopFn);
}

export function unregisterPitchMicStop(id) {
  stopHandlers.delete(id);
}

export function stopOtherPitchMicTools(exceptId) {
  for (const [id, stop] of stopHandlers) {
    if (id !== exceptId) stop();
  }
}

export async function openPitchMic(provider) {
  const request = provider || requestMicStreamRaw;
  try {
    const stream = await request();
    const settings = inspectTrackSettings(stream);
    return { ok: true, stream, settings, error: null };
  } catch (e) {
    const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
    return {
      ok: false,
      stream: null,
      settings: {},
      error: denied ? 'denied' : (e?.message || 'unavailable'),
    };
  }
}

export function createMicSessionGuard(toolId) {
  let stream = null;

  return {
    get stream() { return stream; },
    isActive: () => stream != null,
    async acquire() {
      stopOtherPitchMicTools(toolId);
      const result = await openPitchMic();
      if (result.ok) stream = result.stream;
      return result;
    },
    release() {
      if (stream) {
        releaseMicStream(stream);
        stream = null;
      }
    },
  };
}

export { isCaptureActive, inspectTrackSettings, releaseMicStream };
