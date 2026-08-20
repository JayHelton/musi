// Backing track settings for the Score Player. One record for each score:
// the media source, the alignment values, and the volume. Persisted locally
// (musi.gpBackingTracks); nothing leaves the device.
//
// The audio blob itself lives in IndexedDB through js/attachments.js under the
// source 'backing'. This module holds the small metadata only.
//
// All storage access is defensive, so the feature degrades gracefully when
// localStorage is unavailable.

import { emitDataChanged } from './dataEvents.js';

const STORAGE_KEY = 'musi.gpBackingTracks';
const NAME_LIMIT = 120;

/** The widest offset the user can set for the start of the song, in seconds. */
export const MAX_ANCHOR_SEC = 3600;
/** The widest fine trim, in milliseconds. */
export const MAX_TRIM_MS = 2000;

// --- storage helpers (defensive) -------------------------------------------

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readKey(key) {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function nowISO() {
  return new Date().toISOString();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

// --- YouTube URL parsing ---------------------------------------------------

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Read the video id and the start time out of a YouTube link.
 *
 * Accepts a watch link, a short youtu.be link, an embed link, a Shorts link,
 * and a bare 11-character id.
 * @returns {{ videoId: string, startSec: number } | null}
 */
export function parseYouTubeUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return null;
  if (YT_ID.test(raw)) return { videoId: raw, startSec: 0 };

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch (e) {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let id = '';
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') id = parts[1] || '';
    }
  }
  if (!YT_ID.test(id)) return null;
  return { videoId: id, startSec: parseYouTubeStart(url) };
}

function parseYouTubeStart(url) {
  const raw = url.searchParams.get('t') || url.searchParams.get('start') || '';
  if (!raw) return 0;
  const plain = Number(raw);
  if (Number.isFinite(plain)) return Math.max(0, plain);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!match) return 0;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return h * 3600 + m * 60 + s;
}

// --- normalization ---------------------------------------------------------

export function defaultConfig() {
  return {
    kind: '',
    attachmentId: '',
    videoId: '',
    startSec: 0,
    name: '',
    sizeBytes: 0,
    anchorSec: 0,
    trimMs: 0,
    volume: 0.9,
    enabled: false,
    updatedAt: '',
  };
}

/**
 * Force one stored record into a known shape. A record without a usable source
 * becomes null, so a half-written entry can never turn the feature on.
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'file' || raw.kind === 'youtube' ? raw.kind : '';
  if (!kind) return null;
  const attachmentId = typeof raw.attachmentId === 'string' ? raw.attachmentId.trim() : '';
  const videoId = typeof raw.videoId === 'string' && YT_ID.test(raw.videoId.trim())
    ? raw.videoId.trim()
    : '';
  if (kind === 'file' && !attachmentId) return null;
  if (kind === 'youtube' && !videoId) return null;
  const created = typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO();
  return {
    ...defaultConfig(),
    kind,
    attachmentId: kind === 'file' ? attachmentId : '',
    videoId: kind === 'youtube' ? videoId : '',
    startSec: clampNumber(raw.startSec, 0, MAX_ANCHOR_SEC, 0),
    name: clampText(raw.name, NAME_LIMIT),
    sizeBytes: Math.max(0, Math.round(clampNumber(raw.sizeBytes, 0, Number.MAX_SAFE_INTEGER, 0))),
    anchorSec: clampNumber(raw.anchorSec, -MAX_ANCHOR_SEC, MAX_ANCHOR_SEC, 0),
    trimMs: Math.round(clampNumber(raw.trimMs, -MAX_TRIM_MS, MAX_TRIM_MS, 0)),
    volume: clampNumber(raw.volume, 0, 1, 0.9),
    enabled: !!raw.enabled,
    updatedAt: created,
  };
}

function defaultStore() {
  return { version: 1, byScore: {} };
}

function normalizeStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== 'object') return base;
  const byScore = {};
  if (raw.byScore && typeof raw.byScore === 'object') {
    Object.entries(raw.byScore).forEach(([key, val]) => {
      if (typeof key !== 'string' || !key) return;
      const config = normalizeConfig(val);
      if (config) byScore[key] = config;
    });
  }
  return { version: 1, byScore };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    return storeCache;
  }
  try {
    storeCache = normalizeStore(JSON.parse(raw));
  } catch (e) {
    storeCache = defaultStore();
  }
  return storeCache;
}

function persistStore() {
  if (!storeCache) return;
  if (writeKey(STORAGE_KEY, JSON.stringify(storeCache))) {
    emitDataChanged('gpBackingTracks');
  }
}

export function invalidateGpBackingTrackCache() {
  storeCache = null;
}

function normalizeKey(scoreKey) {
  return typeof scoreKey === 'string' ? scoreKey.trim() : '';
}

// --- public API ------------------------------------------------------------

/** @returns {object|null} the stored record, or null when the score has none. */
export function getBackingTrack(scoreKey) {
  const key = normalizeKey(scoreKey);
  if (!key) return null;
  const found = getStore().byScore[key];
  return found ? { ...found } : null;
}

/**
 * Merge fields into the record for one score and save it.
 * @returns {object|null} the saved record, or null when it cannot be stored.
 */
export function saveBackingTrack(scoreKey, patch = {}) {
  const key = normalizeKey(scoreKey);
  if (!key) return null;
  const store = getStore();
  const merged = normalizeConfig({ ...(store.byScore[key] || {}), ...patch, updatedAt: nowISO() });
  if (!merged) return null;
  store.byScore[key] = merged;
  persistStore();
  return { ...merged };
}

/** Remove the record for one score. Returns the attachment id it referenced. */
export function removeBackingTrack(scoreKey) {
  const key = normalizeKey(scoreKey);
  if (!key) return '';
  const store = getStore();
  const found = store.byScore[key];
  if (!found) return '';
  delete store.byScore[key];
  persistStore();
  return found.attachmentId || '';
}

/** Every attachment id that a stored record still points at. */
export function usedAttachmentIds() {
  const store = getStore();
  const ids = new Set();
  Object.values(store.byScore).forEach((cfg) => {
    if (cfg.attachmentId) ids.add(cfg.attachmentId);
  });
  return [...ids];
}

/** Move a record to a new score key, for example after an import. */
export function migrateBackingTrack(fromKey, toKey) {
  const from = normalizeKey(fromKey);
  const to = normalizeKey(toKey);
  if (!from || !to || from === to) return null;
  const store = getStore();
  const found = store.byScore[from];
  if (!found) return null;
  delete store.byScore[from];
  store.byScore[to] = found;
  persistStore();
  return { ...found };
}
