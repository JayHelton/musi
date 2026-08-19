// Local diff, apply, and counter-merge helpers for cloud sync. No network.

import {
  buildSnapshot,
  applySnapshot,
  invalidateModuleCaches,
  SYNC_SCOPES,
} from '../sync/syncProfile.js';
import { listPatterns, deletePattern, putPatternRaw } from '../drums/drumPatternDb.js';
import {
  deleteFile,
  hasFile,
  listFilesMeta,
} from '../attachments.js';
import {
  toRecords,
  fromRecords,
  contentHash,
  isDeviceLocalSettingKey,
} from './recordMap.js';
import {
  getAllShadow,
  putShadow,
  putShadowMany,
  deleteShadow,
  shadowKey,
} from './shadowStore.js';

export const MASS_DELETE_THRESHOLD = 0.25;

const SETTINGS_STORE_KEY = 'musi:settings';

const PROGRESS_SUBKEYS = [
  'stats',
  'study.progress',
  'io.sessionHistory',
  'io.mastery',
  'io.masteryV2',
];

const PROGRESS_COUNTER_IDS = new Set([
  'progress:stats',
  'progress:study.progress',
  'progress:io.sessionHistory',
  'progress:io.mastery',
  'progress:io.masteryV2',
]);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function readSettingsObject() {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(SETTINGS_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isPlainObject(parsed) ? { ...parsed } : {};
  } catch (e) {
    return {};
  }
}

function writeSettingsObject(obj) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORE_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

function readJsonKey(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeJsonKey(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function removeKey(key) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

function normalizeServerRow(row) {
  return {
    domain: row.domain,
    recordId: row.record_id || row.recordId,
    payload: row.payload,
    deleted: row.deleted === true,
    updatedAt: row.updated_at || row.updatedAt || null,
    rev: row.rev,
    deviceId: row.device_id || row.deviceId,
    contentHash: row.content_hash || row.contentHash || '',
  };
}

function maxNum(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const va = Number.isFinite(na) ? na : 0;
  const vb = Number.isFinite(nb) ? nb : 0;
  return Math.max(va, vb);
}

function mergePerSkill(local, remote) {
  const out = { ...local };
  Object.entries(remote || {}).forEach(([skillId, remoteRow]) => {
    if (!isPlainObject(remoteRow)) return;
    const localRow = isPlainObject(out[skillId]) ? out[skillId] : { attempts: 0, correct: 0 };
    out[skillId] = {
      attempts: maxNum(localRow.attempts, 0) + maxNum(remoteRow.attempts, 0),
      correct: maxNum(localRow.correct, 0) + maxNum(remoteRow.correct, 0),
    };
  });
  return out;
}

function mergeTodayBucket(localToday, remoteToday) {
  const lt = isPlainObject(localToday) ? localToday : {};
  const rt = isPlainObject(remoteToday) ? remoteToday : {};
  if (lt.day && rt.day && lt.day === rt.day) {
    return {
      day: lt.day,
      trainedMs: maxNum(lt.trainedMs, 0) + maxNum(rt.trainedMs, 0),
      attempts: maxNum(lt.attempts, 0) + maxNum(rt.attempts, 0),
      correct: maxNum(lt.correct, 0) + maxNum(rt.correct, 0),
      perSkill: mergePerSkill(lt.perSkill, rt.perSkill),
    };
  }
  const ltScore = maxNum(lt.attempts, 0) + maxNum(lt.trainedMs, 0);
  const rtScore = maxNum(rt.attempts, 0) + maxNum(rt.trainedMs, 0);
  return rtScore >= ltScore ? { ...rt, perSkill: { ...(rt.perSkill || {}) } } : { ...lt, perSkill: { ...(lt.perSkill || {}) } };
}

function mergeMasteryStore(local, remote) {
  const out = { ...(isPlainObject(local) ? local : {}) };
  Object.entries(isPlainObject(remote) ? remote : {}).forEach(([key, remoteRow]) => {
    if (!isPlainObject(remoteRow)) return;
    const localRow = isPlainObject(out[key]) ? out[key] : {};
    const merged = { ...localRow };
    Object.keys(remoteRow).forEach((field) => {
      if (typeof remoteRow[field] === 'number') {
        merged[field] = maxNum(localRow[field], remoteRow[field]);
      } else {
        merged[field] = remoteRow[field];
      }
    });
    out[key] = merged;
  });
  return out;
}

function mergeStudyProgress(local, remote) {
  const l = isPlainObject(local) ? local : {};
  const r = isPlainObject(remote) ? remote : {};
  const concepts = { ...(isPlainObject(l.concepts) ? l.concepts : {}) };
  Object.entries(isPlainObject(r.concepts) ? r.concepts : {}).forEach(([conceptId, remoteRow]) => {
    if (!isPlainObject(remoteRow)) return;
    const localRow = isPlainObject(concepts[conceptId]) ? concepts[conceptId] : {
      lastReviewedAt: 0,
      completions: 0,
      misses: 0,
      hintHeavy: 0,
    };
    const newest = maxNum(localRow.lastReviewedAt, remoteRow.lastReviewedAt);
    concepts[conceptId] = {
      ...localRow,
      ...remoteRow,
      lastReviewedAt: newest,
      completions: maxNum(localRow.completions, 0) + maxNum(remoteRow.completions, 0),
      misses: maxNum(localRow.misses, 0) + maxNum(remoteRow.misses, 0),
    };
  });
  return {
    ...l,
    ...r,
    version: r.version || l.version || 1,
    concepts,
    recentStudies: Array.isArray(r.recentStudies) ? r.recentStudies : (l.recentStudies || []),
    lastPrimaryId: r.lastPrimaryId ?? l.lastPrimaryId,
    lastPrimaryAt: maxNum(l.lastPrimaryAt, r.lastPrimaryAt),
  };
}

function mergeSessionHistory(local, remote) {
  const localList = Array.isArray(local) ? local : (isPlainObject(local) && Array.isArray(local.value) ? local.value : []);
  const remoteList = Array.isArray(remote) ? remote : (isPlainObject(remote) && Array.isArray(remote.value) ? remote.value : []);
  const byAt = new Map();
  localList.forEach((entry) => {
    if (!isPlainObject(entry) || entry.at == null) return;
    byAt.set(entry.at, entry);
  });
  remoteList.forEach((entry) => {
    if (!isPlainObject(entry) || entry.at == null) return;
    byAt.set(entry.at, entry);
  });
  return [...byAt.values()].sort((a, b) => maxNum(a.at, 0) - maxNum(b.at, 0));
}

export function mergeCounterPayload(recordId, localValue, remoteValue) {
  if (recordId === 'progress:stats') {
    const l = isPlainObject(localValue) ? localValue : {};
    const r = isPlainObject(remoteValue) ? remoteValue : {};
    return {
      ...l,
      ...r,
      bestStreak: maxNum(l.bestStreak, r.bestStreak),
      currentStreak: maxNum(l.currentStreak, r.currentStreak),
      lastActivityTs: maxNum(l.lastActivityTs, r.lastActivityTs),
      today: mergeTodayBucket(l.today, r.today),
    };
  }

  if (recordId === 'progress:io.mastery' || recordId === 'progress:io.masteryV2') {
    return mergeMasteryStore(localValue, remoteValue);
  }

  if (recordId === 'progress:study.progress') {
    return mergeStudyProgress(localValue, remoteValue);
  }

  if (recordId === 'progress:io.sessionHistory') {
    return mergeSessionHistory(localValue, remoteValue);
  }

  return remoteValue;
}

export async function collectLocalRecords() {
  const snapshot = buildSnapshot();
  const drumPatterns = await listPatterns();
  const attachmentsMeta = await listFilesMeta();
  const records = toRecords(snapshot, { drumPatterns, attachmentsMeta });
  const withHash = [];
  for (const rec of records) {
    const hash = await contentHash(rec.payload);
    withHash.push({ ...rec, contentHash: hash });
  }
  return { snapshot, records: withHash };
}

export async function diffAgainstShadow(records, shadow) {
  const upserts = [];
  const tombstones = [];
  const localKeys = new Set();

  for (const rec of records) {
    localKeys.add(shadowKey(rec.domain, rec.recordId));
    const prev = shadow.get(shadowKey(rec.domain, rec.recordId));
    const hash = rec.contentHash || await contentHash(rec.payload);
    if (!prev || prev.contentHash !== hash) {
      upserts.push({ ...rec, contentHash: hash });
    }
  }

  for (const [key, prev] of shadow) {
    if (!prev?.domain || !prev?.recordId) continue;
    if (prev.domain === 'attachmentsMeta') continue;
    if (!localKeys.has(key)) {
      tombstones.push({ domain: prev.domain, recordId: prev.recordId });
    }
  }

  let massDelete = null;
  const domainTotals = await countShadowByDomainFromMap(shadow);
  const tombByDomain = new Map();
  tombstones.forEach((t) => {
    tombByDomain.set(t.domain, (tombByDomain.get(t.domain) || 0) + 1);
  });

  for (const [domain, count] of tombByDomain) {
    const total = domainTotals.get(domain) || 0;
    if (total < 4) continue;
    const ratio = count / total;
    if (ratio > MASS_DELETE_THRESHOLD) {
      massDelete = { domain, count, total, ratio };
      break;
    }
  }

  return { upserts, tombstones, massDelete };
}

async function countShadowByDomainFromMap(shadow) {
  const counts = new Map();
  for (const row of shadow.values()) {
    if (!row?.domain) continue;
    counts.set(row.domain, (counts.get(row.domain) || 0) + 1);
  }
  return counts;
}

function counterMergeProgressInEnvelope(envelope, mode) {
  if (mode === 'replace') return envelope;
  const data = envelope?.data || {};
  PROGRESS_COUNTER_IDS.forEach((recordId) => {
    const subkey = recordId.slice('progress:'.length);
    const remoteRaw = data[subkey];
    if (remoteRaw == null) return;
    let remoteVal;
    try {
      remoteVal = JSON.parse(remoteRaw);
    } catch (e) {
      return;
    }
    const localVal = readSettingsObject()[subkey];
    const merged = mergeCounterPayload(recordId, localVal, remoteVal);
    data[subkey] = JSON.stringify(merged);
  });
  return { ...envelope, data };
}

/**
 * Writes server rows to the local stores.
 * `scopes` limits the write to the given snapshot scopes. A first pull uses it
 * to replace the content of a new device but to merge its settings.
 */
export async function applyRemoteRecords(rows, { mode = 'merge', scopes } = {}) {
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeServerRow);
  const clientRows = normalized.map((row) => ({
    domain: row.domain,
    recordId: row.recordId,
    payload: row.payload,
    deleted: row.deleted,
  }));

  const { data, drumPatterns, attachmentsMeta, deletes } = fromRecords(clientRows);
  const envelope = counterMergeProgressInEnvelope({
    app: 'musi',
    kind: 'musi-profile-snapshot',
    version: 1,
    createdAt: new Date().toISOString(),
    scopes: ['settings', 'progress', 'content'],
    data,
  }, mode);

  const applyResult = await applySnapshot(envelope, { mode, scopes });
  const counts = { ...(applyResult.counts || {}) };
  const errors = [...(applyResult.errors || [])];
  const applied = [...(applyResult.applied || [])];
  const deleted = [];
  const pendingBlobs = [];

  for (const pattern of drumPatterns) {
    try {
      const stored = await putPatternRaw(pattern);
      if (stored) applied.push(`drumPatterns:${pattern.id}`);
    } catch (e) {
      errors.push({ key: `drumPatterns:${pattern.id}`, message: e?.message || 'Drum pattern apply failed.' });
    }
  }

  for (const meta of attachmentsMeta) {
    try {
      const exists = await hasFile(meta.id);
      if (exists) continue;
      pendingBlobs.push(meta.id);
    } catch (e) {
      errors.push({ key: `attachmentsMeta:${meta.id}`, message: e?.message || 'Attachment check failed.' });
    }
  }

  if (deletes.length > 0) {
    const delResult = await deleteLocalRecords(deletes);
    deleted.push(...(delResult.deleted || []));
    errors.push(...(delResult.errors || []));
  }

  for (const row of normalized) {
    if (row.deleted) continue;
    await putShadow(row.domain, row.recordId, {
      contentHash: row.contentHash,
      updatedAt: row.updatedAt,
      rev: row.rev,
    });
  }

  return {
    applied,
    counts,
    deleted,
    errors,
    pendingBlobs,
  };
}

export async function deleteLocalRecords(list) {
  const deleted = [];
  const errors = [];
  const entries = Array.isArray(list) ? list : [];

  for (const entry of entries) {
    const domain = entry?.domain;
    const recordId = entry?.recordId;
    if (!domain || !recordId) continue;

    try {
      if (domain === 'notes') {
        const notes = readJsonKey('musi.notes');
        if (Array.isArray(notes)) {
          const filtered = notes.filter((n) => n?.id !== recordId);
          writeJsonKey('musi.notes', filtered);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'songs') {
        const songs = readJsonKey('musi.songs');
        if (Array.isArray(songs)) {
          writeJsonKey('musi.songs', songs.filter((s) => s?.id !== recordId));
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'exercises') {
        const ex = readJsonKey('musi.exercises');
        if (isPlainObject(ex) && Array.isArray(ex.items)) {
          ex.items = ex.items.filter((item) => item?.id !== recordId);
          writeJsonKey('musi.exercises', ex);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'exerciseCategories') {
        const ex = readJsonKey('musi.exercises');
        if (isPlainObject(ex) && Array.isArray(ex.categories)) {
          ex.categories = ex.categories.filter((cat) => cat?.id !== recordId);
          writeJsonKey('musi.exercises', ex);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'workbooks') {
        const wb = readJsonKey('musi.workbooks');
        if (isPlainObject(wb) && Array.isArray(wb.workbooks)) {
          wb.workbooks = wb.workbooks.filter((book) => book?.id !== recordId);
          writeJsonKey('musi.workbooks', wb);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'workbookFolders') {
        const wb = readJsonKey('musi.workbooks');
        if (isPlainObject(wb) && Array.isArray(wb.folders)) {
          wb.folders = wb.folders.filter((folder) => folder?.id !== recordId);
          writeJsonKey('musi.workbooks', wb);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'gpAnnotations' && recordId.startsWith('gpAnnotations:')) {
        const scoreKey = recordId.slice('gpAnnotations:'.length);
        const gp = readJsonKey('musi.gpAnnotations');
        if (isPlainObject(gp) && isPlainObject(gp.byScore) && scoreKey in gp.byScore) {
          delete gp.byScore[scoreKey];
          writeJsonKey('musi.gpAnnotations', gp);
          deleted.push({ domain, recordId });
        }
        continue;
      }

      if (domain === 'drumPatterns') {
        const ok = await deletePattern(recordId);
        if (ok) deleted.push({ domain, recordId });
        continue;
      }

      if (domain === 'attachmentsMeta') {
        const ok = await deleteFile(recordId);
        if (ok) deleted.push({ domain, recordId });
        continue;
      }

      if (domain === 'settings' && recordId.startsWith('settings:')) {
        const key = recordId.slice('settings:'.length);
        if (key === 'musi.gpAutoFollow' || key === 'musi.gpParchmentZoom') {
          removeKey(key);
          deleted.push({ domain, recordId });
        } else if (key === 'features.enabled' || key === 'profile.music' || PROGRESS_SUBKEYS.includes(key)) {
          const settings = readSettingsObject();
          if (settings[key] !== undefined) {
            delete settings[key];
            writeSettingsObject(settings);
            deleted.push({ domain, recordId });
          }
        } else if (key) {
          const settings = readSettingsObject();
          if (settings[key] !== undefined) {
            delete settings[key];
            writeSettingsObject(settings);
            deleted.push({ domain, recordId });
          }
        }
        continue;
      }

      if (domain === 'progress' && recordId.startsWith('progress:')) {
        const subkey = recordId.slice('progress:'.length);
        const settings = readSettingsObject();
        if (settings[subkey] !== undefined) {
          delete settings[subkey];
          writeSettingsObject(settings);
          deleted.push({ domain, recordId });
        }
      }
    } catch (e) {
      errors.push({ key: `${domain}:${recordId}`, message: e?.message || 'Delete failed.' });
    }
  }

  await invalidateModuleCaches();
  return { deleted, errors };
}

/**
 * Read the settings that stay on this device and never reach the cloud.
 * A replace pass drops them, so the caller restores them after the write.
 * @returns {Record<string, unknown>}
 */
export function captureDeviceLocalSettings() {
  const settings = readSettingsObject();
  const saved = {};
  Object.entries(settings).forEach(([key, value]) => {
    if (isDeviceLocalSettingKey(key)) saved[key] = value;
  });
  return saved;
}

/** Write back the settings that captureDeviceLocalSettings read. */
export function restoreDeviceLocalSettings(saved) {
  if (!isPlainObject(saved) || !Object.keys(saved).length) return;
  const settings = readSettingsObject();
  Object.entries(saved).forEach(([key, value]) => {
    settings[key] = value;
  });
  writeSettingsObject(settings);
}

/**
 * Remove every record that cloud sync owns on this device. Musi calls this
 * before it writes the cloud copy, so the device keeps no extra record.
 * Local files stay: `replaceLocalFiles` in blobSync.js handles the bytes.
 * @returns {{ patterns: number }}
 */
export async function clearLocalRecords() {
  const empty = {
    app: 'musi',
    kind: 'musi-profile-snapshot',
    version: 1,
    createdAt: new Date().toISOString(),
    scopes: SYNC_SCOPES.map((scope) => scope.id),
    data: {},
  };
  await applySnapshot(empty, { mode: 'replace' });

  let patterns = 0;
  const stored = await listPatterns();
  for (const pattern of stored) {
    if (pattern?.builtin) continue;
    const ok = await deletePattern(pattern.id);
    if (ok) patterns += 1;
  }

  await invalidateModuleCaches();
  return { patterns };
}

export async function rebuildShadowFromLocal(revByKey = new Map()) {
  const { records } = await collectLocalRecords();
  const rows = [];
  for (const rec of records) {
    const key = shadowKey(rec.domain, rec.recordId);
    const rev = revByKey.get(key) ?? revByKey.get(`${rec.domain}:${rec.recordId}`) ?? null;
    rows.push({
      domain: rec.domain,
      recordId: rec.recordId,
      contentHash: rec.contentHash,
      updatedAt: rec.updatedAt,
      rev,
    });
  }
  await putShadowMany(rows);
  return rows.length;
}
