// Durable practice-attempt log for Musi. Records per-target attempts with mastery
// status, tempo history, cold-test scheduling, and study-concept review intervals.
//
// Storage: localStorage key musi.progressLog ({ version: 1, attempts: [] }).
// All access is defensive so the module works fully in-memory when localStorage
// is unavailable (Node tests).

export const PROGRESS_LOG_STORAGE_KEY = 'musi.progressLog';
export const PROGRESS_LOG_MAX_ATTEMPTS = 5000;

const STORE_VERSION = 1;
const NOTES_LIMIT = 2000;
const BPM_MIN = 30;
const BPM_MAX = 300;
const EFFORT_MIN = 1;
const EFFORT_MAX = 5;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const COLD_48H_MS = 48 * HOUR_MS;
const COLD_7D_MS = 7 * DAY_MS;
const REVIEW_CAP_DAYS = 60;

const TARGET_TYPES = new Set([
  'exercise',
  'workbook-item',
  'routine-session',
  'drill',
  'study-concept',
  'song-section',
]);

const STATUS_VALUES = new Set(['red', 'yellow', 'green', 'blue']);

const STUDY_MISS_KINDS = new Set(['miss', 'slow-recognition']);

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

function uid() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

function clampBpm(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(n)));
}

function clampAccuracy(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function clampEffort(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < EFFORT_MIN || i > EFFORT_MAX) return null;
  return i;
}

function clampDurationMs(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function normalizeDetail(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = typeof raw.kind === 'string' && STUDY_MISS_KINDS.has(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const prompt = clampText(typeof raw.prompt === 'string' ? raw.prompt : '', 500);
  const answer = clampText(typeof raw.answer === 'string' ? raw.answer : '', 500);
  let responseMs = null;
  if (raw.responseMs != null && raw.responseMs !== '') {
    const n = Number(raw.responseMs);
    if (Number.isFinite(n)) responseMs = Math.max(0, Math.floor(n));
  }
  return { kind, prompt, answer, responseMs };
}

function normalizeStatus(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && STATUS_VALUES.has(value)) return value;
  return null;
}

function normalizeCleanTake(value) {
  if (value == null || value === '') return null;
  return !!value;
}

export function normalizeAttempt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const targetType = typeof raw.targetType === 'string' ? raw.targetType : '';
  if (!TARGET_TYPES.has(targetType)) return null;
  const targetId = typeof raw.targetId === 'string' && raw.targetId ? raw.targetId : '';
  if (!targetId) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    targetType,
    targetId,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : nowISO(),
    durationMs: clampDurationMs(raw.durationMs),
    bpm: clampBpm(raw.bpm),
    accuracy: clampAccuracy(raw.accuracy),
    cleanTake: normalizeCleanTake(raw.cleanTake),
    effort: clampEffort(raw.effort),
    status: normalizeStatus(raw.status),
    notes: clampText(typeof raw.notes === 'string' ? raw.notes : '', NOTES_LIMIT),
    detail: normalizeDetail(raw.detail),
  };
}

function defaultStore() {
  return { version: STORE_VERSION, attempts: [] };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(PROGRESS_LOG_STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    return storeCache;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      storeCache = defaultStore();
      return storeCache;
    }
    const attempts = Array.isArray(parsed.attempts)
      ? parsed.attempts.map(normalizeAttempt).filter(Boolean)
      : [];
    storeCache = { version: STORE_VERSION, attempts };
  } catch (e) {
    storeCache = defaultStore();
  }
  return storeCache;
}

function persist() {
  if (!storeCache) return;
  const capped = storeCache.attempts.length > PROGRESS_LOG_MAX_ATTEMPTS
    ? storeCache.attempts.slice(-PROGRESS_LOG_MAX_ATTEMPTS)
    : storeCache.attempts;
  storeCache.attempts = capped;
  writeKey(PROGRESS_LOG_STORAGE_KEY, JSON.stringify({
    version: STORE_VERSION,
    attempts: capped,
  }));
}

function copyAttempt(att) {
  const out = {
    id: att.id,
    targetType: att.targetType,
    targetId: att.targetId,
    startedAt: att.startedAt,
    durationMs: att.durationMs,
    bpm: att.bpm,
    accuracy: att.accuracy,
    cleanTake: att.cleanTake,
    effort: att.effort,
    status: att.status,
    notes: att.notes,
  };
  if (att.detail) out.detail = { ...att.detail };
  return out;
}

function enforceCap(store) {
  if (store.attempts.length > PROGRESS_LOG_MAX_ATTEMPTS) {
    store.attempts = store.attempts.slice(-PROGRESS_LOG_MAX_ATTEMPTS);
  }
}

function parseTimeMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function compareNewestFirst(a, b) {
  const ta = parseTimeMs(a.startedAt);
  const tb = parseTimeMs(b.startedAt);
  if (tb !== ta) return tb - ta;
  return b.id.localeCompare(a.id);
}

function compareOldestFirst(a, b) {
  const ta = parseTimeMs(a.startedAt);
  const tb = parseTimeMs(b.startedAt);
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

// --- public API ------------------------------------------------------------

export function invalidateProgressLogCache() {
  storeCache = null;
}

export function clearProgressLog() {
  storeCache = defaultStore();
  persist();
}

export function logAttempt(partial) {
  if (!partial || typeof partial !== 'object') {
    throw new TypeError('logAttempt requires an object');
  }
  const targetType = typeof partial.targetType === 'string' ? partial.targetType : '';
  if (!TARGET_TYPES.has(targetType)) {
    throw new Error(`Unknown targetType: ${targetType}`);
  }
  const record = normalizeAttempt({
    ...partial,
    targetType,
    id: partial.id,
    startedAt: partial.startedAt != null ? partial.startedAt : nowISO(),
  });
  if (!record) {
    throw new Error('Invalid attempt record');
  }
  const store = getStore();
  store.attempts.push(record);
  enforceCap(store);
  persist();
  return copyAttempt(record);
}

export function listAttempts(filter = {}) {
  let items = getStore().attempts.slice();
  if (filter.targetType) {
    items = items.filter(a => a.targetType === filter.targetType);
  }
  if (filter.targetId) {
    items = items.filter(a => a.targetId === filter.targetId);
  }
  if (filter.since) {
    const sinceMs = parseTimeMs(filter.since);
    items = items.filter(a => parseTimeMs(a.startedAt) >= sinceMs);
  }
  if (filter.until) {
    const untilMs = parseTimeMs(filter.until);
    items = items.filter(a => parseTimeMs(a.startedAt) <= untilMs);
  }
  items.sort(compareNewestFirst);
  if (filter.limit != null && Number.isFinite(Number(filter.limit))) {
    const limit = Math.max(0, Math.floor(Number(filter.limit)));
    items = items.slice(0, limit);
  }
  return items.map(copyAttempt);
}

export function getTargetSummary(targetType, targetId) {
  const attempts = getStore().attempts
    .filter(a => a.targetType === targetType && a.targetId === targetId)
    .sort(compareOldestFirst);

  let lastAttemptAt = null;
  let bestBpm = null;
  let lastBpm = null;
  let bestAccuracy = null;
  let lastAccuracy = null;
  let cleanTakes = 0;
  let status = null;
  const tempoHistory = [];

  for (const att of attempts) {
    lastAttemptAt = att.startedAt;
    if (att.bpm != null) {
      lastBpm = att.bpm;
      tempoHistory.push({ at: att.startedAt, bpm: att.bpm });
      if (bestBpm == null || att.bpm > bestBpm) bestBpm = att.bpm;
    }
    if (att.accuracy != null) {
      lastAccuracy = att.accuracy;
      if (bestAccuracy == null || att.accuracy > bestAccuracy) bestAccuracy = att.accuracy;
    }
    if (att.cleanTake === true) cleanTakes += 1;
    if (att.status != null) status = att.status;
  }

  return {
    attempts: attempts.length,
    lastAttemptAt,
    bestBpm,
    lastBpm,
    bestAccuracy,
    lastAccuracy,
    cleanTakes,
    status,
    tempoHistory,
  };
}

function targetKey(targetType, targetId) {
  return `${targetType}\0${targetId}`;
}

export function dueColdTests(now = Date.now()) {
  const nowMs = Number(now);
  const byTarget = new Map();

  for (const att of getStore().attempts) {
    const key = targetKey(att.targetType, att.targetId);
    const existing = byTarget.get(key);
    if (!existing || parseTimeMs(att.startedAt) > parseTimeMs(existing.startedAt)) {
      byTarget.set(key, att);
    }
  }

  const due = [];
  for (const att of byTarget.values()) {
    const lastMs = parseTimeMs(att.startedAt);
    const lastStatus = att.status;
    if (lastStatus === 'green' || lastStatus === 'blue') {
      const due48Ms = lastMs + COLD_48H_MS;
      if (nowMs >= due48Ms) {
        due.push({
          targetType: att.targetType,
          targetId: att.targetId,
          kind: '48h',
          dueSince: new Date(due48Ms).toISOString(),
          lastStatus,
        });
      }
    }
    if (lastStatus === 'blue') {
      const due7dMs = lastMs + COLD_7D_MS;
      if (nowMs >= due7dMs) {
        due.push({
          targetType: att.targetType,
          targetId: att.targetId,
          kind: '7d',
          dueSince: new Date(due7dMs).toISOString(),
          lastStatus,
        });
      }
    }
  }

  due.sort((a, b) => {
    const overdueA = nowMs - parseTimeMs(a.dueSince);
    const overdueB = nowMs - parseTimeMs(b.dueSince);
    if (overdueB !== overdueA) return overdueB - overdueA;
    return a.targetId.localeCompare(b.targetId);
  });
  return due;
}

export function recordStudyMiss(conceptId, detail) {
  if (typeof conceptId !== 'string' || !conceptId) {
    throw new TypeError('recordStudyMiss requires a conceptId');
  }
  return logAttempt({
    targetType: 'study-concept',
    targetId: conceptId,
    status: 'red',
    detail,
  });
}

function isStudyMiss(att) {
  return att.targetType === 'study-concept' && att.status === 'red';
}

function isStudySuccess(att) {
  return att.targetType === 'study-concept'
    && att.status != null
    && att.status !== 'red';
}

function successIntervalDays(streak) {
  if (streak <= 0) return 1;
  const days = Math.pow(2, streak - 1);
  return Math.min(REVIEW_CAP_DAYS, days);
}

function computeConceptReviewState(attempts) {
  const sorted = attempts.slice().sort(compareOldestFirst);
  let streak = 0;
  let nextDueMs = 0;
  let lastMissMs = 0;

  for (const att of sorted) {
    const atMs = parseTimeMs(att.startedAt);
    if (isStudyMiss(att)) {
      streak = 0;
      lastMissMs = atMs;
      nextDueMs = atMs + DAY_MS;
    } else if (isStudySuccess(att)) {
      streak += 1;
      const days = successIntervalDays(streak);
      nextDueMs = atMs + days * DAY_MS;
    }
  }

  return { nextDueMs, lastMissMs };
}

export function dueStudyReviews(now = Date.now()) {
  const nowMs = Number(now);
  const byConcept = new Map();

  for (const att of getStore().attempts) {
    if (att.targetType !== 'study-concept') continue;
    const list = byConcept.get(att.targetId) || [];
    list.push(att);
    byConcept.set(att.targetId, list);
  }

  const due = [];
  for (const [conceptId, attempts] of byConcept.entries()) {
    const { nextDueMs, lastMissMs } = computeConceptReviewState(attempts);
    if (nextDueMs > 0 && nowMs >= nextDueMs) {
      due.push({
        conceptId,
        dueSince: new Date(nextDueMs).toISOString(),
        lastMissAt: lastMissMs > 0 ? new Date(lastMissMs).toISOString() : null,
      });
    }
  }

  due.sort((a, b) => {
    const missA = a.lastMissAt ? parseTimeMs(a.lastMissAt) : 0;
    const missB = b.lastMissAt ? parseTimeMs(b.lastMissAt) : 0;
    if (missB !== missA) return missB - missA;
    const overdueA = nowMs - parseTimeMs(a.dueSince);
    const overdueB = nowMs - parseTimeMs(b.dueSince);
    return overdueB - overdueA;
  });
  return due;
}
