// The records Practice Lab keeps between visits.
//
// The lab keeps no session and no log. It keeps two kinds of entry: a vocal
// attempt, so the Vocal tab can count the last ten reps of an exercise, and a
// warm-up pick, so the Drums tab never offers what the last three picks gave.
// A camera take lives in its own store and is not an entry.
//
// Every function here is pure. The caller supplies the id and the time.

/** Every entry kind the tool writes. */
export const ENTRY_KINDS = [
  'vocal-attempt',
  'warm-up',
];

const KIND_SET = new Set(ENTRY_KINDS);

/**
 * Build one entry.
 * @param {{ id: string, at: string, kind: string, data?: Object }} input
 * @returns {Object}
 */
export function newEntry({ id, at, kind, data }) {
  if (!KIND_SET.has(kind)) throw new Error(`unknown entry kind: ${kind}`);
  return {
    id,
    at,
    kind,
    data: data && typeof data === 'object' ? { ...data } : {},
  };
}

/** Sort entries oldest first, and keep a stable order inside one millisecond. */
export function sortEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    const at = String(a?.at || '').localeCompare(String(b?.at || ''));
    if (at !== 0) return at;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/**
 * The warm-up history, newest first, read off the warm-up entries.
 * @param {Object[]} entries entries of any kind, in any order
 * @param {number} limit how many picks to keep
 * @returns {Array<{ beatId: string, rudimentId: string }>}
 */
export function warmUpPicks(entries, limit = 3) {
  return sortEntries(entries)
    .filter(entry => entry && entry.kind === 'warm-up')
    .reverse()
    .slice(0, Math.max(0, limit))
    .map(entry => ({
      beatId: String(entry.data?.beatId || ''),
      rudimentId: String(entry.data?.rudimentId || ''),
    }));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** `1:04:03`, `4:03`, or `0:03`. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(num(ms) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** `1 clip`, `2 clips`. The count and the word agree. */
export function plural(count, word, many = '') {
  const n = num(count);
  return `${n} ${n === 1 ? word : (many || `${word}s`)}`;
}
