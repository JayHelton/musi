// Per-score practice session store.
//
// When a learner opens a score tomorrow, the player must feel like a return
// to the same practice session. This module keeps one small record per score
// key in localStorage: the viewed track, the last beat, the view mode, the
// zoom, the speed ratio, the loop, and the mixer mutes and volumes.
//
// The record never holds the score bytes. A solo is a temporary state and it
// is not saved. Global preferences (follow, notation, metronome) live in
// their own keys in playerState.js and metronomeState.js.

const KEY_PREFIX = 'musi.gpSession:';
const VERSION = 1;
const MAX_RECORDS = 200;

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (e) {
    return null;
  }
}

function keyFor(scoreKey) {
  return `${KEY_PREFIX}${String(scoreKey || '')}`;
}

function finiteOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize a raw record so a bad entry cannot break the player. */
export function normalizeSession(raw = {}) {
  const out = {
    version: VERSION,
    savedAt: finiteOr(raw?.savedAt, 0),
    trackKind: raw?.trackKind === 'drum' ? 'drum' : 'guitar',
    trackIndex: Math.max(0, Math.round(finiteOr(raw?.trackIndex, 0))),
    beat: Math.max(0, finiteOr(raw?.beat, 0)),
    viewMode: ['tab', 'standard', 'both'].includes(raw?.viewMode) ? raw.viewMode : null,
    zoom: null,
    speedRatio: null,
    loop: null,
    mixer: null,
    backingActive: raw?.backingActive == null ? null : !!raw.backingActive,
  };
  const zoom = Number(raw?.zoom);
  if (Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 3) out.zoom = zoom;
  const ratio = Number(raw?.speedRatio);
  if (Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 3) out.speedRatio = ratio;
  if (raw?.loop && Number.isFinite(Number(raw.loop.startBeat))
    && Number.isFinite(Number(raw.loop.endBeat))
    && Number(raw.loop.endBeat) > Number(raw.loop.startBeat)) {
    out.loop = {
      enabled: !!raw.loop.enabled,
      startBeat: Number(raw.loop.startBeat),
      endBeat: Number(raw.loop.endBeat),
    };
  }
  if (raw?.mixer && typeof raw.mixer === 'object') {
    const arr = (v) => (Array.isArray(v) ? v : null);
    out.mixer = {
      mutedGuitars: arr(raw.mixer.mutedGuitars)?.map((x) => !!x) ?? null,
      mutedDrums: arr(raw.mixer.mutedDrums)?.map((x) => !!x) ?? null,
      volumeGuitars: arr(raw.mixer.volumeGuitars)?.map((x) => Math.max(0, Math.min(1, finiteOr(x, 1)))) ?? null,
      volumeDrums: arr(raw.mixer.volumeDrums)?.map((x) => Math.max(0, Math.min(1, finiteOr(x, 1)))) ?? null,
    };
  }
  return out;
}

/** Read the saved session for a score. Returns null when there is none. */
export function loadSession(scoreKey) {
  if (!scoreKey) return null;
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(keyFor(scoreKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeSession(parsed);
  } catch (e) {
    return null;
  }
}

/** Write the session for a score. Old records go first when the store is full. */
export function saveSession(scoreKey, session) {
  if (!scoreKey) return false;
  const st = storage();
  if (!st) return false;
  try {
    const record = normalizeSession({ ...session, savedAt: Date.now() });
    st.setItem(keyFor(scoreKey), JSON.stringify(record));
    pruneSessions(st);
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSession(scoreKey) {
  const st = storage();
  if (!st || !scoreKey) return;
  try { st.removeItem(keyFor(scoreKey)); } catch (e) { /* ignore */ }
}

function pruneSessions(st) {
  const keys = [];
  for (let i = 0; i < st.length; i += 1) {
    const k = st.key(i);
    if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
  }
  if (keys.length <= MAX_RECORDS) return;
  const dated = keys.map((k) => {
    let savedAt = 0;
    try { savedAt = Number(JSON.parse(st.getItem(k))?.savedAt) || 0; } catch (e) { /* ignore */ }
    return { k, savedAt };
  }).sort((a, b) => a.savedAt - b.savedAt);
  for (const { k } of dated.slice(0, keys.length - MAX_RECORDS)) {
    try { st.removeItem(k); } catch (e) { /* ignore */ }
  }
}

/**
 * A throttled writer. The playhead moves many times each second, and the
 * store must not write on every frame.
 */
export function createSessionWriter(scoreKey, { intervalMs = 1500, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  let pending = null;
  let timer = null;

  function flush() {
    timer = null;
    if (!pending) return;
    const record = pending;
    pending = null;
    saveSession(scoreKey, record);
  }

  return {
    /** Queue a write. The latest record wins. */
    write(record) {
      if (!scoreKey) return;
      pending = record;
      if (timer == null) timer = setTimeoutFn(flush, intervalMs);
    },
    /** Write now, for a pause, a close, or a page hide. */
    flush() {
      if (timer != null) clearTimeoutFn(timer);
      flush();
    },
    destroy() {
      if (timer != null) clearTimeoutFn(timer);
      timer = null;
      pending = null;
    },
  };
}
