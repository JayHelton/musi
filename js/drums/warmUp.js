// The warm-up picker of a drum practice session.
//
// A player who has to choose the warm-up spends the first five minutes
// choosing. The picker takes the choice away: it names one groove and one
// rudiment, and the session starts.
//
// The picker never repeats what the last three sessions warmed up with, so a
// player covers the whole library instead of falling back on the same two
// favourites. When every entry is on cooldown, the least recent one comes back
// first, and the picker still answers.
//
// Every function here is pure. The caller supplies the history and the random
// source, so a test can pin both.

import { BEATS, beatById } from './beatLibrary.js';
import { RUDIMENTS, rudimentById } from './rudimentLibrary.js';

/** How many past sessions block a repeat. */
export const WARM_UP_COOLDOWN = 3;

/**
 * @typedef {{ beatId: string, rudimentId: string }} WarmUpChoice
 */

/**
 * Read the warm-up history out of a list of session records.
 *
 * The history is newest first, because the cooldown counts back from now.
 * A session with no warm-up leaves no entry.
 *
 * @param {Object[]} sessions session records, in any order
 * @param {number} [limit] how many entries to keep
 * @returns {WarmUpChoice[]} newest first
 */
export function warmUpHistory(sessions, limit = WARM_UP_COOLDOWN) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session && session.warmUp)
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
    .slice(0, Math.max(0, limit))
    .map((session) => ({
      beatId: String(session.warmUp.beatId || ''),
      rudimentId: String(session.warmUp.rudimentId || ''),
    }));
}

/**
 * The ids the cooldown blocks, read off one history.
 * @param {WarmUpChoice[]} history newest first
 * @param {string} key `beatId` or `rudimentId`
 * @param {number} [cooldown]
 * @returns {Set<string>}
 */
export function blockedIds(history, key, cooldown = WARM_UP_COOLDOWN) {
  const out = new Set();
  const list = Array.isArray(history) ? history : [];
  for (const entry of list.slice(0, Math.max(0, cooldown))) {
    const id = entry && entry[key];
    if (id) out.add(String(id));
  }
  return out;
}

/**
 * Pick one id at random, and prefer an id the cooldown does not block.
 *
 * When every id is blocked, the one that was used longest ago wins. That keeps
 * the picker honest on a short list and it never returns nothing.
 *
 * @param {string[]} ids every id the library offers
 * @param {WarmUpChoice[]} history newest first
 * @param {string} key `beatId` or `rudimentId`
 * @param {() => number} random
 * @param {number} [cooldown]
 * @returns {string}
 */
export function pickId(ids, history, key, random, cooldown = WARM_UP_COOLDOWN) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return '';
  const blocked = blockedIds(history, key, cooldown);
  const fresh = list.filter((id) => !blocked.has(id));
  if (fresh.length) return fresh[indexOf(random, fresh.length)];

  // Every id is on cooldown. The one that appears latest in the history — or
  // not at all — has waited longest.
  const recency = new Map();
  (history || []).forEach((entry, index) => {
    const id = entry && entry[key];
    if (id && !recency.has(id)) recency.set(id, index);
  });
  let best = list[0];
  let bestAge = -1;
  for (const id of list) {
    const age = recency.has(id) ? recency.get(id) : Number.MAX_SAFE_INTEGER;
    if (age > bestAge) { best = id; bestAge = age; }
  }
  return best;
}

function indexOf(random, length) {
  const value = typeof random === 'function' ? Number(random()) : Math.random();
  const safe = Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0;
  return Math.floor(safe * length);
}

/**
 * Pick the warm-up of a new session.
 *
 * @param {{
 *   history?: WarmUpChoice[],
 *   random?: () => number,
 *   beats?: Object[],
 *   rudiments?: Object[],
 *   cooldown?: number,
 * }} [options]
 * @returns {{ beatId: string, rudimentId: string, beat: Object|null, rudiment: Object|null }}
 */
export function pickWarmUp({
  history = [],
  random = Math.random,
  beats = BEATS,
  rudiments = RUDIMENTS,
  cooldown = WARM_UP_COOLDOWN,
} = {}) {
  const beatId = pickId(beats.map((b) => b.id), history, 'beatId', random, cooldown);
  const rudimentId = pickId(rudiments.map((r) => r.id), history, 'rudimentId', random, cooldown);
  return {
    beatId,
    rudimentId,
    beat: beats.find((b) => b.id === beatId) || beatById(beatId),
    rudiment: rudiments.find((r) => r.id === rudimentId) || rudimentById(rudimentId),
  };
}

/**
 * The one-line summary a log entry and a history row show.
 * @param {WarmUpChoice} choice
 * @returns {string}
 */
export function warmUpLabel(choice) {
  const beat = beatById(choice?.beatId || '');
  const rudiment = rudimentById(choice?.rudimentId || '');
  const parts = [];
  if (beat) parts.push(`${beat.name} (${beat.genre})`);
  if (rudiment) parts.push(rudiment.name);
  return parts.join(' · ');
}
