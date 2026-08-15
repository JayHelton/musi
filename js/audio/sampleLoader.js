/**
 * Fetch and decode same-origin sample packs for the current score.
 */

import { getPack, packsForDrumMap, packsForPrograms } from './samplePackRegistry.js';

const sessions = new Map();
let activeLoadToken = 0;

/** Decoded buffers per AudioContext, keyed by pack-relative file path. */
const contextBuffers = new WeakMap();

function makeFallback(packIds, error) {
  return {
    status: 'fallback',
    packIds: packIds || [],
    progress: 1,
    buffers: {},
    error: error || null,
  };
}

function getContextBufferMap(audioCtx) {
  let map = contextBuffers.get(audioCtx);
  if (!map) {
    map = new Map();
    contextBuffers.set(audioCtx, map);
  }
  return map;
}

function isSameOriginUrl(url) {
  if (typeof globalThis !== 'undefined' && globalThis.window?.location) {
    try {
      const parsed = new URL(url, globalThis.window.location.href);
      return parsed.origin === globalThis.window.location.origin;
    } catch {
      return false;
    }
  }
  if (/^https?:\/\//i.test(url)) return false;
  return true;
}

function packBaseUrl(pack) {
  return new URL(`../../assets/audio/packs/${pack.id}/`, import.meta.url).href;
}

function resolveSampleUrl(pack, file) {
  return `${packBaseUrl(pack)}${file}`;
}

/** Unique buffer key so two packs can share a file name. */
export function packBufferKey(packId, file) {
  return `${packId}/${file}`;
}

function cacheNameForPack(pack) {
  return `musi-pack-${pack.id}-${pack.version}`;
}

async function tryCachePut(pack, url, response) {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(cacheNameForPack(pack));
    await cache.put(url, response.clone());
  } catch {
    // Cache Storage may reject the write. Playback continues without it.
  }
}

async function fetchSample(pack, file) {
  const url = resolveSampleUrl(pack, file);
  if (!isSameOriginUrl(url)) {
    throw new Error('Foreign sample URL rejected.');
  }

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(cacheNameForPack(pack));
      const cached = await cache.match(url);
      if (cached) return cached;
    } catch {
      // Continue with a network fetch.
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${file}.`);
  }
  await tryCachePut(pack, url, response);
  return response;
}

function setSession(scoreId, patch) {
  const prev = sessions.get(scoreId) || { scoreId, status: 'idle', packIds: [], progress: 0, buffers: {}, error: null };
  const next = { ...prev, ...patch };
  sessions.set(scoreId, next);
  return next;
}

function cancelOtherSessions(scoreId) {
  for (const [id, session] of sessions.entries()) {
    if (id !== scoreId && session.status === 'loading') {
      sessions.set(id, { ...session, status: 'cancelled', progress: session.progress || 0 });
    }
  }
}

/**
 * Load packs required by the score programs and drum notes.
 * Never throws to the caller.
 */
export async function loadPacksForScore({ scoreId, programs, drumNotes, audioCtx, onProgress }) {
  try {
    const token = ++activeLoadToken;
    cancelOtherSessions(scoreId);

    const programPacks = packsForPrograms(programs || []);
    const drumPacks = packsForDrumMap(drumNotes || []);
    const packIds = [...new Set([...programPacks, ...drumPacks])];

    if (!packIds.length) {
      setSession(scoreId, { status: 'fallback', packIds: [], progress: 1, buffers: {}, error: 'No registered pack.' });
      return makeFallback([], 'No registered pack.');
    }

    const packs = packIds.map((id) => getPack(id)).filter(Boolean);
    const files = [];
    for (const pack of packs) {
      for (const sample of pack.samples || []) {
        if (sample?.file) files.push({ pack, file: sample.file });
      }
    }

    if (!files.length) {
      setSession(scoreId, { status: 'fallback', packIds, progress: 1, buffers: {}, error: 'Pack has no sample files.' });
      return makeFallback(packIds, 'Pack has no sample files.');
    }

    setSession(scoreId, { status: 'loading', packIds, progress: 0, buffers: {}, error: null });

    const bufferMap = getContextBufferMap(audioCtx);
    const buffers = {};
    const total = files.length;
    let loaded = 0;

    const report = (label) => {
      const fraction = total > 0 ? loaded / total : 1;
      setSession(scoreId, { progress: fraction });
      if (typeof onProgress === 'function') {
        onProgress({ loaded, total, fraction, label });
      }
    };

    report('Loading guitar sounds');

    for (const { pack, file } of files) {
      if (token !== activeLoadToken) {
        setSession(scoreId, { status: 'cancelled', progress: loaded / total });
        return { status: 'cancelled', packIds, progress: loaded / total, buffers: {}, error: 'Load cancelled.' };
      }

      const session = sessions.get(scoreId);
      if (!session || session.status === 'cancelled') {
        return { status: 'cancelled', packIds, progress: loaded / total, buffers: {}, error: 'Load cancelled.' };
      }

      try {
        const key = packBufferKey(pack.id, file);
        let buffer = bufferMap.get(key);
        if (!buffer) {
          const response = await fetchSample(pack, file);
          const arrayBuffer = await response.arrayBuffer();
          buffer = await audioCtx.decodeAudioData(arrayBuffer);
          bufferMap.set(key, buffer);
        }
        buffers[key] = buffer;
        loaded += 1;
        report('Loading guitar sounds');
        const afterFetch = sessions.get(scoreId);
        if (!afterFetch || afterFetch.status === 'cancelled') {
          return { status: 'cancelled', packIds, progress: loaded / total, buffers: {}, error: 'Load cancelled.' };
        }
      } catch (e) {
        const msg = e?.message || String(e);
        setSession(scoreId, { status: 'fallback', packIds, progress: 1, buffers: {}, error: msg });
        return makeFallback(packIds, msg);
      }
    }

    if (token !== activeLoadToken) {
      setSession(scoreId, { status: 'cancelled', progress: 1 });
      return { status: 'cancelled', packIds, progress: 1, buffers: {}, error: 'Load cancelled.' };
    }

    const finalSession = sessions.get(scoreId);
    if (!finalSession || finalSession.status === 'cancelled') {
      return { status: 'cancelled', packIds, progress: loaded / total, buffers: {}, error: 'Load cancelled.' };
    }

    setSession(scoreId, { status: 'ready', packIds, progress: 1, buffers, error: null });
    return { status: 'ready', packIds, progress: 1, buffers, error: null };
  } catch (e) {
    const msg = e?.message || String(e);
    setSession(scoreId, { status: 'fallback', packIds: [], progress: 1, buffers: {}, error: msg });
    return makeFallback([], msg);
  }
}

/** Return the load session for one score. */
export function getLoadState(scoreId) {
  const session = sessions.get(scoreId);
  if (!session) {
    return { scoreId, status: 'idle', packIds: [], progress: 0, buffers: {}, error: null };
  }
  return { ...session };
}

/** Cancel an in-progress load for one score. */
export function cancelLoad(scoreId) {
  const session = sessions.get(scoreId);
  if (session) {
    sessions.set(scoreId, { ...session, status: 'cancelled' });
  } else {
    sessions.set(scoreId, { scoreId, status: 'cancelled', packIds: [], progress: 0, buffers: {}, error: null });
  }
}

/** Learner-facing playback source label. */
export function getPlaybackSourceState(scoreId) {
  const session = sessions.get(scoreId);
  if (!session || session.status === 'idle') return 'Synth fallback';
  if (session.status === 'loading') return 'Loading guitar sounds';
  if (session.status === 'ready') return 'Studio ready';
  return 'Synth fallback';
}

/** True only when the pack load finished with status ready. */
export function canUsePackOnNextStart(scoreId) {
  const session = sessions.get(scoreId);
  return session?.status === 'ready';
}

/** Clear sessions for Node tests. */
export function __resetSampleLoaderForTests() {
  sessions.clear();
  activeLoadToken = 0;
}
