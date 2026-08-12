// Maps buildSnapshot data bags to flat sync_records rows and back. Pure
// functions only — no IndexedDB, no network.

const SETTINGS_STORE_KEY = 'musi:settings';

const SETTINGS_SUBKEYS = ['features.enabled', 'profile.music'];

const PROGRESS_SUBKEYS = [
  'stats',
  'study.progress',
  'io.sessionHistory',
  'io.mastery',
  'io.masteryV2',
];

const EXTRACTED_SUBKEYS = new Set([...SETTINGS_SUBKEYS, ...PROGRESS_SUBKEYS]);

const DIRECT_SCALAR_KEYS = ['musi.gpAutoFollow', 'musi.gpParchmentZoom'];

const CONTENT_KEY_NOTES = 'musi.notes';
const CONTENT_KEY_SONGS = 'musi.songs';
const CONTENT_KEY_EXERCISES = 'musi.exercises';
const CONTENT_KEY_WORKBOOKS = 'musi.workbooks';
const CONTENT_KEY_ROUTINES = 'musi.routines';
const CONTENT_KEY_GP_ANNOTATIONS = 'musi.gpAnnotations';

export const SYNC_DOMAINS = Object.freeze([
  'settings',
  'progress',
  'notes',
  'songs',
  'exercises',
  'exerciseCategories',
  'workbooks',
  'workbookFolders',
  'routines',
  'gpAnnotations',
  'drumPatterns',
  'attachmentsMeta',
]);

export const DEVICE_LOCAL_SETTINGS_KEYS = Object.freeze([
  'nav.lastTool',
  'nav.lastCategory',
  'io.audioCalibrated',
  'io.minRms',
  'musi.bootSplash.done',
]);

const DEVICE_LOCAL_PREFIXES = ['subview.', 'sync.', 'cloud.'];

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function isDeviceLocalSettingKey(key) {
  if (typeof key !== 'string' || !key) return false;
  if (DEVICE_LOCAL_SETTINGS_KEYS.includes(key)) return true;
  for (const prefix of DEVICE_LOCAL_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${parts.join(',')}}`;
}

function fnv1a64Hex(str) {
  let hash = 0xcbf29ce484222325;
  const prime = 0x100000001b3;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, prime);
  }
  const hi = (hash >>> 0).toString(16).padStart(8, '0');
  const lo = (Math.imul(hash, prime) >>> 0).toString(16).padStart(8, '0');
  return `${hi}${lo}`;
}

async function sha256Hex(str) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return null;
  try {
    const data = new TextEncoder().encode(str);
    const buf = await subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return null;
  }
}

export async function contentHash(payload) {
  const text = stableStringify(payload);
  const sha = await sha256Hex(text);
  if (sha) return `sha256:${sha}`;
  return `fnv1a:${fnv1a64Hex(text)}`;
}

function parseJsonString(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function isoFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toISOString();
  } catch (e) {
    return null;
  }
}

export function recordTimestamp(domain, recordId, payload) {
  if (!isPlainObject(payload)) return null;

  if (domain === 'settings' && recordId === 'settings:profile.music') {
    const t = payload.updatedAt;
    if (typeof t === 'number' && Number.isFinite(t)) return isoFromMs(t);
    return null;
  }

  if (domain === 'progress' && recordId === 'progress:stats') {
    if (typeof payload.lastActivityTs === 'number' && payload.lastActivityTs > 0) {
      return isoFromMs(payload.lastActivityTs);
    }
    const today = payload.today;
    if (isPlainObject(today) && typeof today.day === 'string' && today.day) {
      return `${today.day}T23:59:59.999Z`;
    }
    return null;
  }

  if (domain === 'progress' && recordId === 'progress:study.progress') {
    const concepts = payload.concepts;
    if (!isPlainObject(concepts)) return null;
    let max = 0;
    Object.values(concepts).forEach((row) => {
      if (!isPlainObject(row)) return;
      const t = row.lastReviewedAt;
      if (typeof t === 'number' && t > max) max = t;
    });
    return max > 0 ? isoFromMs(max) : null;
  }

  if (domain === 'progress' && recordId === 'progress:io.sessionHistory') {
    const list = Array.isArray(payload.value) ? payload.value : (Array.isArray(payload) ? payload : []);
    let maxAt = 0;
    list.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      const at = entry.at;
      if (typeof at === 'number' && at > maxAt) maxAt = at;
    });
    return maxAt > 0 ? isoFromMs(maxAt) : null;
  }

  if (domain === 'notes' || domain === 'songs' || domain === 'workbooks' || domain === 'routines') {
    const t = payload.updatedAt;
    return typeof t === 'string' && t ? t : null;
  }

  if (domain === 'exercises') {
    const t = payload.addedAt;
    return typeof t === 'string' && t ? t : null;
  }

  if (domain === 'gpAnnotations') {
    const anns = payload.annotations;
    if (!Array.isArray(anns)) return null;
    let max = '';
    anns.forEach((ann) => {
      if (!isPlainObject(ann)) return;
      const t = ann.updatedAt || ann.createdAt;
      if (typeof t === 'string' && t > max) max = t;
    });
    return max || null;
  }

  if (domain === 'drumPatterns') {
    const t = payload.updatedAt;
    return typeof t === 'string' && t ? t : null;
  }

  if (domain === 'attachmentsMeta') {
    const t = payload.createdAt;
    return typeof t === 'string' && t ? t : null;
  }

  return null;
}

function pushRecord(records, domain, recordId, payload, updatedAt) {
  if (!domain || !recordId || payload == null) return;
  records.push({
    domain,
    recordId,
    payload,
    updatedAt: updatedAt || null,
  });
}

function progressPayloadForStore(subkey, value) {
  if (Array.isArray(value)) return { value };
  return value;
}

function unwrapProgressPayload(subkey, payload) {
  if (subkey === 'io.sessionHistory' && isPlainObject(payload) && Array.isArray(payload.value)) {
    return payload.value;
  }
  return payload;
}

/**
 * One settings row per top-level key (not a single bag) so merges stay granular.
 */
export function toRecords(snapshot, extras = {}) {
  const records = [];
  const data = snapshot?.data || {};

  const remainderRaw = data[SETTINGS_STORE_KEY];
  if (remainderRaw != null) {
    const remainder = parseJsonString(remainderRaw);
    if (isPlainObject(remainder)) {
      Object.entries(remainder).forEach(([key, value]) => {
        if (EXTRACTED_SUBKEYS.has(key) || isDeviceLocalSettingKey(key)) return;
        pushRecord(
          records,
          'settings',
          `settings:${key}`,
          { key, value },
          null,
        );
      });
    }
  }

  SETTINGS_SUBKEYS.forEach((subkey) => {
    const raw = data[subkey];
    if (raw == null) return;
    const parsed = parseJsonString(raw);
    if (parsed == null) return;
    if (subkey === 'features.enabled') {
      pushRecord(records, 'settings', 'settings:features.enabled', { value: parsed }, null);
      return;
    }
    if (subkey === 'profile.music') {
      pushRecord(records, 'settings', 'settings:profile.music', parsed, recordTimestamp('settings', 'settings:profile.music', parsed));
      return;
    }
  });

  DIRECT_SCALAR_KEYS.forEach((scalarKey) => {
    const raw = data[scalarKey];
    if (raw == null) return;
    pushRecord(records, 'settings', `settings:${scalarKey}`, { value: raw }, null);
  });

  PROGRESS_SUBKEYS.forEach((subkey) => {
    const raw = data[subkey];
    if (raw == null) return;
    const parsed = parseJsonString(raw);
    if (parsed == null) return;
    const payload = progressPayloadForStore(subkey, parsed);
    pushRecord(
      records,
      'progress',
      `progress:${subkey}`,
      payload,
      recordTimestamp('progress', `progress:${subkey}`, payload),
    );
  });

  const notesRaw = data[CONTENT_KEY_NOTES];
  if (notesRaw != null) {
    const list = parseJsonString(notesRaw);
    if (Array.isArray(list)) {
      list.forEach((note) => {
        if (!isPlainObject(note) || !note.id) return;
        pushRecord(records, 'notes', note.id, note, recordTimestamp('notes', note.id, note));
      });
    }
  }

  const songsRaw = data[CONTENT_KEY_SONGS];
  if (songsRaw != null) {
    const list = parseJsonString(songsRaw);
    if (Array.isArray(list)) {
      list.forEach((song) => {
        if (!isPlainObject(song) || !song.id) return;
        pushRecord(records, 'songs', song.id, song, recordTimestamp('songs', song.id, song));
      });
    }
  }

  const exercisesRaw = data[CONTENT_KEY_EXERCISES];
  if (exercisesRaw != null) {
    const ex = parseJsonString(exercisesRaw);
    if (isPlainObject(ex)) {
      const categories = Array.isArray(ex.categories) ? ex.categories : [];
      const items = Array.isArray(ex.items) ? ex.items : [];
      categories.forEach((cat) => {
        if (!isPlainObject(cat) || !cat.id) return;
        pushRecord(records, 'exerciseCategories', cat.id, cat, null);
      });
      items.forEach((item) => {
        if (!isPlainObject(item) || !item.id) return;
        pushRecord(records, 'exercises', item.id, item, recordTimestamp('exercises', item.id, item));
      });
    }
  }

  const workbooksRaw = data[CONTENT_KEY_WORKBOOKS];
  if (workbooksRaw != null) {
    const wb = parseJsonString(workbooksRaw);
    if (isPlainObject(wb)) {
      const folders = Array.isArray(wb.folders) ? wb.folders : [];
      const workbooks = Array.isArray(wb.workbooks) ? wb.workbooks : [];
      folders.forEach((folder) => {
        if (!isPlainObject(folder) || !folder.id) return;
        pushRecord(records, 'workbookFolders', folder.id, folder, null);
      });
      workbooks.forEach((book) => {
        if (!isPlainObject(book) || !book.id) return;
        pushRecord(records, 'workbooks', book.id, book, recordTimestamp('workbooks', book.id, book));
      });
    }
  }

  const routinesRaw = data[CONTENT_KEY_ROUTINES];
  if (routinesRaw != null) {
    const rt = parseJsonString(routinesRaw);
    if (isPlainObject(rt) && Array.isArray(rt.routines)) {
      rt.routines.forEach((routine) => {
        if (!isPlainObject(routine) || !routine.id) return;
        pushRecord(records, 'routines', routine.id, routine, recordTimestamp('routines', routine.id, routine));
      });
    }
  }

  const gpRaw = data[CONTENT_KEY_GP_ANNOTATIONS];
  if (gpRaw != null) {
    const gp = parseJsonString(gpRaw);
    if (isPlainObject(gp) && isPlainObject(gp.byScore)) {
      Object.entries(gp.byScore).forEach(([scoreKey, bucket]) => {
        const anns = Array.isArray(bucket?.annotations) ? bucket.annotations : [];
        if (!anns.length) return;
        const payload = { annotations: anns };
        pushRecord(
          records,
          'gpAnnotations',
          `gpAnnotations:${scoreKey}`,
          payload,
          recordTimestamp('gpAnnotations', `gpAnnotations:${scoreKey}`, payload),
        );
      });
    }
  }

  const drumPatterns = Array.isArray(extras.drumPatterns) ? extras.drumPatterns : [];
  drumPatterns.forEach((pattern) => {
    if (!isPlainObject(pattern) || !pattern.id || pattern.builtin === true) return;
    pushRecord(records, 'drumPatterns', pattern.id, pattern, recordTimestamp('drumPatterns', pattern.id, pattern));
  });

  const attachmentsMeta = Array.isArray(extras.attachmentsMeta) ? extras.attachmentsMeta : [];
  attachmentsMeta.forEach((meta) => {
    if (!isPlainObject(meta) || !meta.id) return;
    pushRecord(records, 'attachmentsMeta', meta.id, meta, recordTimestamp('attachmentsMeta', meta.id, meta));
  });

  return records;
}

export function fromRecords(records) {
  const data = {};
  const drumPatterns = [];
  const attachmentsMeta = [];
  const deletes = [];

  const remainder = {};
  let featuresEnabled = null;
  let profileMusic = null;
  const progressValues = {};
  const notes = [];
  const songs = [];
  const exerciseCategories = [];
  const exercises = [];
  let exercisesSeededAt = null;
  const workbookFolders = [];
  const workbooks = [];
  const routines = [];
  const gpByScore = {};
  let gpVersion = 1;

  const list = Array.isArray(records) ? records : [];

  list.forEach((row) => {
    if (!row || !row.domain || !row.recordId) return;
    if (row.deleted === true) {
      deletes.push({ domain: row.domain, recordId: row.recordId });
      return;
    }

    const payload = row.payload;
    const domain = row.domain;
    const recordId = row.recordId;

    if (domain === 'settings') {
      if (recordId === 'settings:features.enabled' && isPlainObject(payload)) {
        featuresEnabled = payload.value;
        return;
      }
      if (recordId === 'settings:profile.music' && isPlainObject(payload)) {
        profileMusic = payload;
        return;
      }
      if (recordId.startsWith('settings:musi.gpAutoFollow') || recordId.startsWith('settings:musi.gpParchmentZoom')) {
        const scalarKey = recordId.slice('settings:'.length);
        if (isPlainObject(payload) && payload.value != null) {
          data[scalarKey] = String(payload.value);
        }
        return;
      }
      if (recordId.startsWith('settings:')) {
        const key = recordId.slice('settings:'.length);
        if (!key) return;
        if (isPlainObject(payload) && 'key' in payload) {
          remainder[payload.key || key] = payload.value;
        } else if (isPlainObject(payload) && 'value' in payload && Object.keys(payload).length === 1) {
          remainder[key] = payload.value;
        } else {
          remainder[key] = payload;
        }
      }
      return;
    }

    if (domain === 'progress' && recordId.startsWith('progress:')) {
      const subkey = recordId.slice('progress:'.length);
      if (!subkey) return;
      progressValues[subkey] = unwrapProgressPayload(subkey, payload);
      return;
    }

    if (domain === 'notes' && isPlainObject(payload)) {
      notes.push(payload);
      return;
    }

    if (domain === 'songs' && isPlainObject(payload)) {
      songs.push(payload);
      return;
    }

    if (domain === 'exerciseCategories' && isPlainObject(payload)) {
      exerciseCategories.push(payload);
      return;
    }

    if (domain === 'exercises' && isPlainObject(payload)) {
      exercises.push(payload);
      if (payload.seededAt) exercisesSeededAt = payload.seededAt;
      return;
    }

    if (domain === 'workbookFolders' && isPlainObject(payload)) {
      workbookFolders.push(payload);
      return;
    }

    if (domain === 'workbooks' && isPlainObject(payload)) {
      workbooks.push(payload);
      return;
    }

    if (domain === 'routines' && isPlainObject(payload)) {
      routines.push(payload);
      return;
    }

    if (domain === 'gpAnnotations' && recordId.startsWith('gpAnnotations:')) {
      const scoreKey = recordId.slice('gpAnnotations:'.length);
      if (!scoreKey) return;
      const anns = Array.isArray(payload?.annotations) ? payload.annotations : [];
      if (anns.length) gpByScore[scoreKey] = { annotations: anns };
      return;
    }

    if (domain === 'drumPatterns' && isPlainObject(payload)) {
      drumPatterns.push(payload);
      return;
    }

    if (domain === 'attachmentsMeta' && isPlainObject(payload)) {
      attachmentsMeta.push(payload);
    }
  });

  if (Object.keys(remainder).length > 0) {
    data[SETTINGS_STORE_KEY] = JSON.stringify(remainder);
  }

  if (featuresEnabled != null) {
    data['features.enabled'] = JSON.stringify(featuresEnabled);
  }

  if (profileMusic != null) {
    data['profile.music'] = JSON.stringify(profileMusic);
  }

  PROGRESS_SUBKEYS.forEach((subkey) => {
    if (progressValues[subkey] !== undefined) {
      data[subkey] = JSON.stringify(progressValues[subkey]);
    }
  });

  if (notes.length > 0) {
    data[CONTENT_KEY_NOTES] = JSON.stringify(notes);
  }

  if (songs.length > 0) {
    data[CONTENT_KEY_SONGS] = JSON.stringify(songs);
  }

  if (exerciseCategories.length > 0 || exercises.length > 0 || exercisesSeededAt) {
    const exObj = { categories: exerciseCategories, items: exercises };
    if (exercisesSeededAt) exObj.seededAt = exercisesSeededAt;
    data[CONTENT_KEY_EXERCISES] = JSON.stringify(exObj);
  }

  if (workbookFolders.length > 0 || workbooks.length > 0) {
    data[CONTENT_KEY_WORKBOOKS] = JSON.stringify({ folders: workbookFolders, workbooks });
  }

  if (routines.length > 0) {
    data[CONTENT_KEY_ROUTINES] = JSON.stringify({ routines });
  }

  if (Object.keys(gpByScore).length > 0) {
    data[CONTENT_KEY_GP_ANNOTATIONS] = JSON.stringify({ version: gpVersion, byScore: gpByScore });
  }

  return { data, drumPatterns, attachmentsMeta, deletes };
}
