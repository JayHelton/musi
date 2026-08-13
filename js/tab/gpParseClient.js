// Worker client for Guitar Pro parse with progress and a main-thread fallback.
import { parseGuitarPro } from './guitarPro.js';

const WORKER_URL = new URL('./gpParseWorker.js', import.meta.url);

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function yieldToEventLoop() {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') setTimeout(resolve, 0);
    else resolve();
  });
}

function abortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Aborted', 'AbortError');
  }
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function reportProgress(onProgress, ratio) {
  if (typeof onProgress !== 'function') return;
  if (!Number.isFinite(ratio)) return;
  onProgress(Math.max(0, Math.min(1, ratio)));
}

function parseWithWorker(bytes, { onProgress, signal } = {}) {
  const worker = new Worker(WORKER_URL, { type: 'module' });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener?.('abort', onAbort);
    };

    const onAbort = () => {
      finish(reject, abortError());
    };

    if (signal?.aborted) {
      worker.terminate();
      reject(abortError());
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });

    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        reportProgress(onProgress, msg.ratio);
        return;
      }
      if (msg.type === 'result') {
        finish(resolve, msg.gp);
        return;
      }
      if (msg.type === 'error') {
        finish(reject, new Error(msg.message || 'Parse failed in worker.'));
      }
    };

    worker.onerror = (event) => {
      finish(reject, event.error || new Error('Parse worker failed.'));
    };

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    worker.postMessage({ id, bytes: buffer }, [buffer]);
  });
}

async function parseOnMainThreadChunked(bytes, { onProgress, signal } = {}) {
  reportProgress(onProgress, 0);
  await yieldToEventLoop();
  if (signal?.aborted) throw abortError();

  const gp = await parseGuitarPro(bytes);

  const trackCount = (gp.tracks?.length || 0) + (gp.drumTracks?.length || 0);
  const steps = Math.max(1, trackCount);
  for (let i = 0; i < steps; i += 1) {
    reportProgress(onProgress, (i + 1) / steps);
    if (i < steps - 1) {
      await yieldToEventLoop();
      if (signal?.aborted) throw abortError();
    }
  }

  return gp;
}

/**
 * Parse Guitar Pro bytes off the main thread when a worker is available.
 * @param {ArrayBuffer|Uint8Array} input
 * @param {{ onProgress?:(ratio:number)=>void, signal?:AbortSignal }} [options]
 */
export async function parseGuitarProWithProgress(input, options = {}) {
  const bytes = toUint8(input);
  const { onProgress, signal } = options;

  if (typeof Worker !== 'undefined') {
    try {
      return await parseWithWorker(bytes, { onProgress, signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // Fall back when the worker cannot start or parse.
    }
  }

  return parseOnMainThreadChunked(bytes, { onProgress, signal });
}
