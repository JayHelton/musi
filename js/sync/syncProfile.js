/**
 * Profile snapshot export/import — single source of truth for what Musi data
 * is included in settings export, file import, and QR device sync.
 *
 * Snapshots capture localStorage string values (lossless). Large binary
 * attachments (Guitar Pro files, audio recordings) live in IndexedDB
 * (js/attachments.js) and are deliberately excluded.
 */

export const SNAPSHOT_KIND = 'musi-profile-snapshot';
export const SNAPSHOT_VERSION = 1;

const SETTINGS_STORE_KEY = 'musi:settings';

/** Keys inside musi:settings exported as separate snapshot entries in the settings scope. */
const SETTINGS_SUBKEYS = ['features.enabled', 'profile.music'];

/** Keys inside musi:settings exported as separate snapshot entries in the progress scope. */
const PROGRESS_SUBKEYS = [
  'stats',
  'study.progress',
  'io.sessionHistory',
  'io.mastery',
  'io.masteryV2',
];

const EXTRACTED_SUBKEYS = new Set([...SETTINGS_SUBKEYS, ...PROGRESS_SUBKEYS]);

const DIRECT_SCALAR_KEYS = ['musi.gpAutoFollow', 'musi.gpParchmentZoom'];

const CONTENT_KEYS = [
  'musi.notes',
  'musi.songs',
  'musi.exercises',
  'musi.workbooks',
  'musi.routines',
  'musi.gpAnnotations',
];

export const SYNC_SCOPES = [
  {
    id: 'settings',
    label: 'Settings',
    description: 'Preferences, enabled tools, genre profile, and player UI options.',
    keys: [
      SETTINGS_STORE_KEY,
      ...SETTINGS_SUBKEYS,
      ...DIRECT_SCALAR_KEYS,
    ],
  },
  {
    id: 'progress',
    label: 'Progress',
    description: 'Practice stats, study history, and interval-map mastery.',
    keys: [...PROGRESS_SUBKEYS],
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Notes, songs, exercises, workbooks, routines, and score annotations.',
    keys: [...CONTENT_KEYS],
  },
];

const ALL_SYNC_KEYS = new Set(
  SYNC_SCOPES.flatMap((scope) => scope.keys),
);

const ID_COLLECTION_KEYS = new Set(CONTENT_KEYS);

const SHALLOW_MERGE_KEYS = new Set([
  SETTINGS_STORE_KEY,
  ...PROGRESS_SUBKEYS,
  'profile.music',
  'stats',
  'study.progress',
]);

const INCOMING_WINS_KEYS = new Set([
  'features.enabled',
  ...DIRECT_SCALAR_KEYS,
]);

// --- storage accessor (Node-safe) -------------------------------------------

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

function storageGet(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function storageRemove(key) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// --- helpers ----------------------------------------------------------------

function defaultScopes(scopes) {
  if (scopes == null) return SYNC_SCOPES.map((s) => s.id);
  if (!Array.isArray(scopes) || scopes.length === 0) return SYNC_SCOPES.map((s) => s.id);
  return scopes.filter((id) => SYNC_SCOPES.some((s) => s.id === id));
}

function keysForScopes(scopes) {
  const ids = defaultScopes(scopes);
  const keys = [];
  for (const scope of SYNC_SCOPES) {
    if (ids.includes(scope.id)) keys.push(...scope.keys);
  }
  return keys;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonValue(text) {
  return JSON.parse(text);
}

function isJsonString(text) {
  if (typeof text !== 'string') return false;
  try {
    JSON.parse(text);
    return true;
  } catch (e) {
    return false;
  }
}

function readSettingsObject() {
  const raw = storageGet(SETTINGS_STORE_KEY);
  if (raw == null) return {};
  try {
    const parsed = parseJsonValue(raw);
    return isPlainObject(parsed) ? { ...parsed } : {};
  } catch (e) {
    return {};
  }
}

function writeSettingsObject(obj) {
  storageSet(SETTINGS_STORE_KEY, JSON.stringify(obj));
}

function remainderFromSettings(settings) {
  const remainder = {};
  Object.entries(settings).forEach(([key, value]) => {
    if (!EXTRACTED_SUBKEYS.has(key)) remainder[key] = value;
  });
  return remainder;
}

function itemTimestamp(item) {
  if (!isPlainObject(item)) return 0;
  const fields = ['updatedAt', 'modifiedAt', 'createdAt', 'addedAt'];
  for (const field of fields) {
    const v = item[field];
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function emptyCounts() {
  return { added: 0, updated: 0, conflicts: 0, removed: 0 };
}

function mergeCounts(target, source) {
  target.added += source.added || 0;
  target.updated += source.updated || 0;
  target.conflicts += source.conflicts || 0;
  target.removed += source.removed || 0;
}

function mergeById(localList, incomingList, counts = emptyCounts()) {
  const map = new Map();
  const local = Array.isArray(localList) ? localList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];

  local.forEach((item) => {
    if (!isPlainObject(item) || !item.id) return;
    map.set(item.id, item);
  });

  incoming.forEach((item) => {
    if (!isPlainObject(item) || !item.id) return;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      counts.added += 1;
      return;
    }
    const localT = itemTimestamp(existing);
    const incomingT = itemTimestamp(item);
    if (incomingT > localT) {
      map.set(item.id, item);
      counts.updated += 1;
    } else {
      counts.conflicts += 1;
    }
  });

  return { list: [...map.values()], counts };
}

function shallowMerge(localObj, incomingObj) {
  const counts = emptyCounts();
  const local = isPlainObject(localObj) ? localObj : {};
  const incoming = isPlainObject(incomingObj) ? incomingObj : {};
  const out = { ...local };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (out[key] !== value) counts.updated += 1;
    out[key] = value;
  });
  return { result: out, counts };
}

function mergeNotes(localRaw, incomingRaw) {
  const local = tryParseArray(localRaw);
  const incoming = tryParseArray(incomingRaw);
  const merged = mergeById(local, incoming);
  return { result: merged.list, counts: merged.counts };
}

function mergeSongs(localRaw, incomingRaw) {
  const local = tryParseArray(localRaw);
  const incoming = tryParseArray(incomingRaw);
  const merged = mergeById(local, incoming);
  return { result: merged.list, counts: merged.counts };
}

function tryParseArray(raw) {
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? parseJsonValue(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function tryParseObject(raw) {
  if (raw == null) return {};
  try {
    const parsed = typeof raw === 'string' ? parseJsonValue(raw) : raw;
    return isPlainObject(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function mergeExercises(localRaw, incomingRaw) {
  const counts = emptyCounts();
  const local = tryParseObject(localRaw);
  const incoming = tryParseObject(incomingRaw);
  const catMerge = mergeById(local.categories, incoming.categories, emptyCounts());
  const itemMerge = mergeById(local.items, incoming.items, emptyCounts());
  mergeCounts(counts, catMerge.counts);
  mergeCounts(counts, itemMerge.counts);
  const out = {
    categories: catMerge.list,
    items: itemMerge.list,
  };
  if (incoming.seededAt) out.seededAt = incoming.seededAt;
  else if (local.seededAt) out.seededAt = local.seededAt;
  return { result: out, counts };
}

function mergeWorkbooks(localRaw, incomingRaw) {
  const counts = emptyCounts();
  const local = tryParseObject(localRaw);
  const incoming = tryParseObject(incomingRaw);
  const folderMerge = mergeById(local.folders, incoming.folders, emptyCounts());
  const wbMerge = mergeById(local.workbooks, incoming.workbooks, emptyCounts());
  mergeCounts(counts, folderMerge.counts);
  mergeCounts(counts, wbMerge.counts);
  return {
    result: { folders: folderMerge.list, workbooks: wbMerge.list },
    counts,
  };
}

function mergeRoutines(localRaw, incomingRaw) {
  const counts = emptyCounts();
  const local = tryParseObject(localRaw);
  const incoming = tryParseObject(incomingRaw);
  const rtMerge = mergeById(local.routines, incoming.routines, emptyCounts());
  mergeCounts(counts, rtMerge.counts);
  return {
    result: { routines: rtMerge.list },
    counts,
  };
}

function mergeGpAnnotations(localRaw, incomingRaw) {
  const counts = emptyCounts();
  const local = tryParseObject(localRaw);
  const incoming = tryParseObject(incomingRaw);
  const localByScore = isPlainObject(local.byScore) ? local.byScore : {};
  const incomingByScore = isPlainObject(incoming.byScore) ? incoming.byScore : {};
  const scoreKeys = new Set([...Object.keys(localByScore), ...Object.keys(incomingByScore)]);
  const byScore = {};

  scoreKeys.forEach((scoreKey) => {
    const localBucket = localByScore[scoreKey];
    const incomingBucket = incomingByScore[scoreKey];
    const localAnns = Array.isArray(localBucket?.annotations) ? localBucket.annotations : [];
    const incomingAnns = Array.isArray(incomingBucket?.annotations) ? incomingBucket.annotations : [];
    if (!localAnns.length && !incomingAnns.length) return;
    const merged = mergeById(localAnns, incomingAnns, emptyCounts());
    mergeCounts(counts, merged.counts);
    byScore[scoreKey] = { annotations: merged.list };
  });

  return {
    result: { version: incoming.version || local.version || 1, byScore },
    counts,
  };
}

function mergeCollectionKey(key, localRaw, incomingRaw) {
  switch (key) {
    case 'musi.notes':
      return mergeNotes(localRaw, incomingRaw);
    case 'musi.songs':
      return mergeSongs(localRaw, incomingRaw);
    case 'musi.exercises':
      const ex = mergeExercises(localRaw, incomingRaw);
      return { result: ex.result, counts: ex.counts };
    case 'musi.workbooks':
      const wb = mergeWorkbooks(localRaw, incomingRaw);
      return { result: wb.result, counts: wb.counts };
    case 'musi.routines':
      const rt = mergeRoutines(localRaw, incomingRaw);
      return { result: rt.result, counts: rt.counts };
    case 'musi.gpAnnotations':
      const gp = mergeGpAnnotations(localRaw, incomingRaw);
      return { result: gp.result, counts: gp.counts };
    default:
      return { result: incomingRaw, counts: emptyCounts() };
  }
}

function dispatchAppEvents(scopeIds) {
  try {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || typeof win.dispatchEvent !== 'function') return;
    if (scopeIds.includes('settings')) {
      win.dispatchEvent(new CustomEvent('musi:profile-changed'));
      win.dispatchEvent(new CustomEvent('musi:features-changed'));
    }
  } catch (e) {
    /* ignore in Node */
  }
}

async function invalidateModuleCaches() {
  const specs = [
    { path: '../persistence.js', fn: 'invalidateSettingsCache' },
    { path: '../notes.js', fn: 'invalidateNotesCache' },
    { path: '../songwriter.js', fn: 'invalidateSongsCache' },
    { path: '../exercises.js', fn: 'invalidateExercisesCache' },
    { path: '../routineModel.js', fn: 'invalidateRoutinesCache' },
    { path: '../gpAnnotations.js', fn: 'invalidateGpAnnotationsCache' },
  ];
  for (const spec of specs) {
    try {
      const mod = await import(spec.path);
      const invalidate = mod[spec.fn];
      if (typeof invalidate === 'function') invalidate();
    } catch (e) {
      /* ignore missing or browser-only modules in Node */
    }
  }
}

function countCollectionItems(key, raw) {
  if (raw == null) return null;
  try {
    const parsed = typeof raw === 'string' ? parseJsonValue(raw) : raw;
    if (key === 'musi.notes' || key === 'musi.songs') {
      return Array.isArray(parsed) ? parsed.length : null;
    }
    if (key === 'musi.exercises') {
      if (!isPlainObject(parsed)) return null;
      const items = Array.isArray(parsed.items) ? parsed.items.length : 0;
      return items;
    }
    if (key === 'musi.workbooks') {
      if (!isPlainObject(parsed)) return null;
      return Array.isArray(parsed.workbooks) ? parsed.workbooks.length : 0;
    }
    if (key === 'musi.routines') {
      if (!isPlainObject(parsed)) return null;
      return Array.isArray(parsed.routines) ? parsed.routines.length : 0;
    }
    if (key === 'musi.gpAnnotations') {
      if (!isPlainObject(parsed) || !isPlainObject(parsed.byScore)) return 0;
      let total = 0;
      Object.values(parsed.byScore).forEach((bucket) => {
        if (Array.isArray(bucket?.annotations)) total += bucket.annotations.length;
      });
      return total;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// --- public API -------------------------------------------------------------

export function buildSnapshot({ scopes } = {}) {
  const scopeIds = defaultScopes(scopes);
  const activeKeys = keysForScopes(scopeIds);
  const data = {};
  const settings = readSettingsObject();
  const remainder = remainderFromSettings(settings);

  activeKeys.forEach((key) => {
    if (key === SETTINGS_STORE_KEY) {
      const filtered = scopeIds.includes('settings') ? remainder : {};
      if (Object.keys(filtered).length > 0) {
        data[key] = JSON.stringify(filtered);
      }
      return;
    }

    if (SETTINGS_SUBKEYS.includes(key) || PROGRESS_SUBKEYS.includes(key)) {
      if (settings[key] !== undefined) {
        data[key] = JSON.stringify(settings[key]);
      }
      return;
    }

    const raw = storageGet(key);
    if (raw == null) return;
    if (!isJsonString(raw)) return;
    data[key] = raw;
  });

  return {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: scopeIds,
    data,
  };
}

export function validateSnapshot(value) {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'Snapshot is not a valid object.', snapshot: null };
  }
  if (value.app !== 'musi') {
    return { ok: false, error: 'This file is not a Musi profile snapshot.', snapshot: null };
  }
  if (value.kind !== SNAPSHOT_KIND) {
    return { ok: false, error: 'Unrecognized snapshot type.', snapshot: null };
  }
  if (typeof value.version !== 'number' || !Number.isFinite(value.version)) {
    return { ok: false, error: 'Snapshot version is missing or invalid.', snapshot: null };
  }
  if (value.version > SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: 'This snapshot was made by a newer version of Musi.',
      snapshot: null,
    };
  }
  if (!isPlainObject(value.data)) {
    return { ok: false, error: 'Snapshot data is missing or invalid.', snapshot: null };
  }

  for (const [key, val] of Object.entries(value.data)) {
    if (!ALL_SYNC_KEYS.has(key)) {
      return { ok: false, error: `Snapshot contains unknown data key: ${key}`, snapshot: null };
    }
    if (typeof val !== 'string') {
      return { ok: false, error: `Snapshot value for "${key}" must be a string.`, snapshot: null };
    }
  }

  return { ok: true, error: null, snapshot: value };
}

export function summarizeSnapshot(snapshot) {
  const base = {
    createdAt: snapshot?.createdAt || null,
    appVersion: snapshot?.appVersion || null,
    scopes: Array.isArray(snapshot?.scopes) ? snapshot.scopes : [],
    keyCount: 0,
    byteSize: 0,
    items: [],
  };

  if (!isPlainObject(snapshot?.data)) return base;

  const data = snapshot.data;
  base.keyCount = Object.keys(data).length;
  base.byteSize = Object.values(data).reduce((sum, s) => sum + (typeof s === 'string' ? s.length : 0), 0);

  const labelMap = {
    'musi:settings': 'App settings',
    'features.enabled': 'Enabled tools',
    'profile.music': 'Genre profile',
    'musi.gpAutoFollow': 'Score auto-follow',
    'musi.gpParchmentZoom': 'Score zoom',
    stats: 'Practice stats',
    'study.progress': 'Study progress',
    'io.sessionHistory': 'Interval map sessions',
    'io.mastery': 'Interval map mastery (legacy)',
    'io.masteryV2': 'Interval map mastery',
    'musi.notes': 'Notes',
    'musi.songs': 'Songs',
    'musi.exercises': 'Exercises',
    'musi.workbooks': 'Workbooks',
    'musi.routines': 'Routines',
    'musi.gpAnnotations': 'Score annotations',
  };

  for (const [key, raw] of Object.entries(data)) {
    const label = labelMap[key] || key;
    if (ID_COLLECTION_KEYS.has(key)) {
      const count = countCollectionItems(key, raw);
      if (count != null) base.items.push({ label, count });
      continue;
    }
    if (SETTINGS_SUBKEYS.includes(key) || PROGRESS_SUBKEYS.includes(key) || key === SETTINGS_STORE_KEY) {
      try {
        const parsed = parseJsonValue(raw);
        if (key === 'profile.music' && isPlainObject(parsed)) {
          base.items.push({ label, count: parsed.genres?.length || 0 });
        } else if (key === 'stats' && isPlainObject(parsed)) {
          base.items.push({ label, count: 1 });
        } else if (key === 'study.progress' && isPlainObject(parsed)) {
          const n = Object.keys(parsed.concepts || {}).length;
          base.items.push({ label, count: n });
        } else if (key.startsWith('io.') && isPlainObject(parsed)) {
          base.items.push({ label, count: Object.keys(parsed).length });
        } else if (key === SETTINGS_STORE_KEY && isPlainObject(parsed)) {
          base.items.push({ label, count: Object.keys(parsed).length });
        } else if (key === 'features.enabled' && Array.isArray(parsed)) {
          base.items.push({ label, count: parsed.length });
        }
      } catch (e) {
        /* omit corrupt entry */
      }
      continue;
    }
    if (DIRECT_SCALAR_KEYS.includes(key)) {
      base.items.push({ label, count: 1 });
    }
  }

  return base;
}

export async function applySnapshot(snapshot, { mode = 'merge', scopes } = {}) {
  const validation = validateSnapshot(snapshot);
  if (!validation.ok) {
    return {
      applied: [],
      skipped: [],
      errors: [{ key: '', message: validation.error }],
      counts: {},
    };
  }

  const scopeIds = defaultScopes(scopes);
  const activeKeys = keysForScopes(scopeIds);
  const data = snapshot.data || {};
  const applied = [];
  const skipped = [];
  const errors = [];
  const counts = {};
  const replace = mode === 'replace';

  function trackCounts(key, c) {
    counts[key] = { ...c };
  }

  function parseDataKey(key) {
    const raw = data[key];
    if (raw == null) return { ok: true, value: null };
    if (!isJsonString(raw)) {
      return { ok: false, message: `Value for "${key}" is not valid JSON.` };
    }
    try {
      return { ok: true, value: parseJsonValue(raw) };
    } catch (e) {
      return { ok: false, message: `Could not parse "${key}".` };
    }
  }

  // --- musi:settings remainder + subkeys ------------------------------------

  const touchesSettingsStore = activeKeys.some((k) =>
    k === SETTINGS_STORE_KEY || SETTINGS_SUBKEYS.includes(k) || PROGRESS_SUBKEYS.includes(k),
  );

  if (touchesSettingsStore) {
    try {
      const settings = readSettingsObject();
      let settingsChanged = false;
      const settingsCounts = emptyCounts();

      if (activeKeys.includes(SETTINGS_STORE_KEY)) {
        if (replace) {
          const remainderKeys = Object.keys(remainderFromSettings(settings));
          remainderKeys.forEach((k) => {
            if (!data[SETTINGS_STORE_KEY]) {
              delete settings[k];
              settingsCounts.removed += 1;
              settingsChanged = true;
            }
          });
        }
        if (data[SETTINGS_STORE_KEY] != null) {
          const parsed = parseDataKey(SETTINGS_STORE_KEY);
          if (!parsed.ok) {
            errors.push({ key: SETTINGS_STORE_KEY, message: parsed.message });
          } else if (replace) {
            const incomingRemainder = isPlainObject(parsed.value) ? parsed.value : {};
            const localRemainder = remainderFromSettings(settings);
            Object.keys(localRemainder).forEach((k) => {
              if (!(k in incomingRemainder)) {
                delete settings[k];
                settingsCounts.removed += 1;
              }
            });
            Object.assign(settings, incomingRemainder);
            settingsChanged = true;
            applied.push(SETTINGS_STORE_KEY);
          } else {
            const merged = shallowMerge(remainderFromSettings(settings), parsed.value);
            Object.keys(remainderFromSettings(settings)).forEach((k) => delete settings[k]);
            Object.assign(settings, merged.result);
            mergeCounts(settingsCounts, merged.counts);
            settingsChanged = true;
            applied.push(SETTINGS_STORE_KEY);
          }
        } else if (replace) {
          skipped.push(SETTINGS_STORE_KEY);
        }
      }

      SETTINGS_SUBKEYS.forEach((subkey) => {
        if (!activeKeys.includes(subkey)) return;
        if (data[subkey] == null) {
          if (replace && settings[subkey] !== undefined) {
            delete settings[subkey];
            settingsCounts.removed += 1;
            settingsChanged = true;
          } else {
            skipped.push(subkey);
          }
          return;
        }
        const parsed = parseDataKey(subkey);
        if (!parsed.ok) {
          errors.push({ key: subkey, message: parsed.message });
          return;
        }
        if (INCOMING_WINS_KEYS.has(subkey) || replace) {
          if (settings[subkey] !== parsed.value) settingsCounts.updated += 1;
          settings[subkey] = parsed.value;
          settingsChanged = true;
          applied.push(subkey);
        } else if (SHALLOW_MERGE_KEYS.has(subkey)) {
          const merged = shallowMerge(settings[subkey], parsed.value);
          settings[subkey] = merged.result;
          mergeCounts(settingsCounts, merged.counts);
          settingsChanged = true;
          applied.push(subkey);
        }
      });

      PROGRESS_SUBKEYS.forEach((subkey) => {
        if (!activeKeys.includes(subkey)) return;
        if (data[subkey] == null) {
          if (replace && settings[subkey] !== undefined) {
            delete settings[subkey];
            settingsCounts.removed += 1;
            settingsChanged = true;
          } else {
            skipped.push(subkey);
          }
          return;
        }
        const parsed = parseDataKey(subkey);
        if (!parsed.ok) {
          errors.push({ key: subkey, message: parsed.message });
          return;
        }
        if (replace) {
          settings[subkey] = parsed.value;
          settingsCounts.updated += 1;
          settingsChanged = true;
          applied.push(subkey);
        } else {
          const merged = shallowMerge(settings[subkey], parsed.value);
          settings[subkey] = merged.result;
          mergeCounts(settingsCounts, merged.counts);
          settingsChanged = true;
          applied.push(subkey);
        }
      });

      if (settingsChanged) {
        writeSettingsObject(settings);
        trackCounts(SETTINGS_STORE_KEY, settingsCounts);
      }
    } catch (e) {
      errors.push({ key: SETTINGS_STORE_KEY, message: e?.message || 'Failed to apply settings.' });
    }
  }

  // --- direct scalar keys ---------------------------------------------------

  DIRECT_SCALAR_KEYS.forEach((key) => {
    if (!activeKeys.includes(key)) return;
    try {
      if (data[key] == null) {
        if (replace) {
          storageRemove(key);
          trackCounts(key, { added: 0, updated: 0, conflicts: 0, removed: 1 });
          applied.push(key);
        } else {
          skipped.push(key);
        }
        return;
      }
      const local = storageGet(key);
      storageSet(key, data[key]);
      const c = emptyCounts();
      if (local !== data[key]) c.updated = 1;
      trackCounts(key, c);
      applied.push(key);
    } catch (e) {
      errors.push({ key, message: e?.message || `Failed to apply ${key}.` });
    }
  });

  // --- content collections --------------------------------------------------

  CONTENT_KEYS.forEach((key) => {
    if (!activeKeys.includes(key)) return;
    try {
      if (data[key] == null) {
        if (replace) {
          storageRemove(key);
          trackCounts(key, { added: 0, updated: 0, conflicts: 0, removed: 1 });
          applied.push(key);
        } else {
          skipped.push(key);
        }
        return;
      }

      const parsed = parseDataKey(key);
      if (!parsed.ok) {
        errors.push({ key, message: parsed.message });
        return;
      }

      if (replace) {
        storageSet(key, data[key]);
        trackCounts(key, { added: 0, updated: 1, conflicts: 0, removed: 0 });
        applied.push(key);
        return;
      }

      const localRaw = storageGet(key);
      const merged = mergeCollectionKey(key, localRaw, data[key]);
      storageSet(key, JSON.stringify(merged.result));
      trackCounts(key, merged.counts);
      applied.push(key);
    } catch (e) {
      errors.push({ key, message: e?.message || `Failed to apply ${key}.` });
    }
  });

  await invalidateModuleCaches();
  dispatchAppEvents(scopeIds);

  return { applied, skipped, errors, counts };
}

export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function parseSnapshotJson(text) {
  try {
    const snapshot = JSON.parse(text);
    return { ok: true, error: null, snapshot };
  } catch (e) {
    return { ok: false, error: 'Invalid JSON in profile file.', snapshot: null };
  }
}

export function snapshotFilename(snapshot) {
  const created = snapshot?.createdAt;
  let datePart = 'unknown-date';
  if (typeof created === 'string') {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) {
      datePart = d.toISOString().slice(0, 10);
    }
  }
  return `musi-profile-${datePart}.json`;
}
