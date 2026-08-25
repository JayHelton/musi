// The session record and the log entry of Practice Lab.
//
// The log is the source of truth. `session.totals` is a cache of the log, so
// the history list reads one record instead of every entry.
//
// Every function here is pure. The caller supplies the id and the time.

/** Every log entry kind the tool writes. */
export const ENTRY_KINDS = [
  'session-start',
  'timer-start',
  'timer-stop',
  'timer-complete',
  'metronome-start',
  'metronome-stop',
  'ratio-start',
  'ratio-stop',
  'speed-start',
  'speed-complete',
  'clip-saved',
  'note',
  'session-end',
];

const KIND_SET = new Set(ENTRY_KINDS);

/** The status of a session. */
export const SESSION_ACTIVE = 'active';
export const SESSION_ENDED = 'ended';

/**
 * Build a session record.
 * @param {{ id: string, at: string, instrument: string, technique: string, target: string }} input
 * @returns {Object}
 */
export function newSession({ id, at, instrument, technique, target }) {
  return {
    id,
    startedAt: at,
    endedAt: '',
    status: SESSION_ACTIVE,
    instrument: String(instrument || '').trim(),
    technique: String(technique || '').trim(),
    target: String(target || '').trim(),
    totals: { timerMs: 0, clips: 0, topBpm: 0 },
  };
}

/**
 * Build a log entry.
 * @param {{ id: string, sessionId: string, at: string, kind: string, data?: Object }} input
 * @returns {Object}
 */
export function newEntry({ id, sessionId, at, kind, data }) {
  if (!KIND_SET.has(kind)) throw new Error(`unknown log entry kind: ${kind}`);
  return {
    id,
    sessionId,
    at,
    kind,
    data: data && typeof data === 'object' ? { ...data } : {},
  };
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Roll the log up into the session totals.
 *
 * `timerMs` counts a finished timer block at its full length and a stopped
 * block at the time it ran. `clips` skips a clip the player deleted.
 * `topBpm` is the best speed-trainer result of the session.
 *
 * @param {Object[]} entries
 * @returns {{ timerMs: number, clips: number, topBpm: number }}
 */
export function rollUpTotals(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let timerMs = 0;
  let clips = 0;
  let topBpm = 0;
  for (const entry of list) {
    if (!entry || !entry.kind) continue;
    const data = entry.data || {};
    if (entry.kind === 'timer-complete') timerMs += num(data.minutes) * 60000;
    else if (entry.kind === 'timer-stop') timerMs += num(data.elapsedMs);
    else if (entry.kind === 'clip-saved' && data.removed !== true) clips += 1;
    else if (entry.kind === 'speed-complete') topBpm = Math.max(topBpm, num(data.topBpm));
  }
  return { timerMs: Math.round(timerMs), clips, topBpm };
}

/** Sort entries oldest first, and keep a stable order inside one millisecond. */
export function sortEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    const at = String(a?.at || '').localeCompare(String(b?.at || ''));
    if (at !== 0) return at;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
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

/** The one-line summary a log row shows for an entry. */
export function describeEntry(entry) {
  const data = entry?.data || {};
  switch (entry?.kind) {
    case 'session-start':
      return `Session started — ${data.instrument || '?'} · ${data.technique || '?'}`;
    case 'timer-start':
      return `Timer started — ${data.minutes} min`;
    case 'timer-complete':
      return `Timer finished — ${data.minutes} min`;
    case 'timer-stop':
      return `Timer stopped — ${formatDuration(data.elapsedMs)} of ${data.minutes} min`;
    case 'metronome-start':
      return `Metronome started — ${data.bpm} BPM`;
    case 'metronome-stop':
      return data.bpmStart === data.bpmEnd
        ? `Metronome stopped — ${data.bpmEnd} BPM for ${formatDuration(data.elapsedMs)}`
        : `Metronome stopped — ${data.bpmStart} to ${data.bpmEnd} BPM for ${formatDuration(data.elapsedMs)}`;
    case 'ratio-start':
      return `Ratios started — ${data.bpm} BPM, ${data.loopA} to ${data.loopB}`;
    case 'ratio-stop':
      return `Ratios stopped — ${plural(data.cycles, 'cycle')} in ${formatDuration(data.elapsedMs)}`;
    case 'speed-start':
      return `Speed started — ${data.startBpm} to ${data.endBpm} BPM, step ${data.increment}`;
    case 'speed-complete':
      return data.finished
        ? `Speed finished — top ${data.topBpm} BPM`
        : `Speed stopped — reached ${data.topBpm} BPM`;
    case 'clip-saved':
      return `Clip saved — ${formatDuration(data.durationMs)}`;
    case 'note':
      return data.text || '';
    case 'session-end':
      return `Session ended — ${formatDuration(data.timerMs)} on the clock`;
    default:
      return entry?.kind || '';
  }
}
