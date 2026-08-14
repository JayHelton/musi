import { getSetting, saveSetting } from '../persistence.js';
import { normalizeNote } from '../notes.js';
import { normalizeExerciseItem } from '../exercises.js';
import { normalizeWorkbook } from '../workbookModel.js';
import { normalizeRoutine } from '../routineModel.js';
import { getAudioMeta, putFileWithId, hasFile } from '../attachments.js';
import { listPatterns } from '../drums/drumPatternDb.js';
import { readDrumPatternsInbox, mergeDrumPatternLists } from '../cloud/recordMap.js';
import notesUnfiled from './notesUnfiled.js';
import exerciseMetadata from './exerciseMetadata.js';
import drumsToExercises from './drumsToExercises.js';

const NOTES_KEY = 'musi.notes';
const SONGS_KEY = 'musi.songs';
const EXERCISES_KEY = 'musi.exercises';
const WORKBOOKS_KEY = 'musi.workbooks';
const ROUTINES_KEY = 'musi.routines';

export const MIGRATIONS = Object.freeze([
  notesUnfiled,
  exerciseMetadata,
  drumsToExercises,
]);

function readJsonArray(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeJson(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function readExerciseStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { categories: [], items: [] };
    }
    const raw = window.localStorage.getItem(EXERCISES_KEY);
    if (!raw) return { categories: [], items: [] };
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    };
  } catch (e) {
    return { categories: [], items: [] };
  }
}

function readWorkbookStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { folders: [], workbooks: [] };
    }
    const raw = window.localStorage.getItem(WORKBOOKS_KEY);
    if (!raw) return { folders: [], workbooks: [] };
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      workbooks: Array.isArray(parsed?.workbooks) ? parsed.workbooks : [],
    };
  } catch (e) {
    return { folders: [], workbooks: [] };
  }
}

function readRoutineStore() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(ROUTINES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.routines) ? parsed.routines : [];
  } catch (e) {
    return [];
  }
}

export function createLiveContext() {
  return {
    clock: { now: () => new Date().toISOString() },
    log: {
      info(msg) { console.log(msg); },
      warn(msg) { console.warn(msg); },
      error(msg) { console.error(msg); },
    },
    settings: {
      read(key, fallback) {
        return getSetting(key, fallback);
      },
      write(key, value) {
        saveSetting(key, value);
      },
    },
    notes: {
      readAll() {
        return readJsonArray(NOTES_KEY).map(normalizeNote).filter(Boolean);
      },
      writeAll(notes) {
        writeJson(NOTES_KEY, notes);
      },
    },
    songs: {
      readAll() {
        return readJsonArray(SONGS_KEY);
      },
      writeAll(songs) {
        writeJson(SONGS_KEY, songs);
      },
    },
    exercises: {
      readStore() {
        const store = readExerciseStore();
        return {
          categories: store.categories,
          items: store.items.map(normalizeExerciseItem).filter(Boolean),
        };
      },
      writeStore(store) {
        writeJson(EXERCISES_KEY, {
          categories: Array.isArray(store?.categories) ? store.categories : [],
          items: Array.isArray(store?.items) ? store.items : [],
        });
      },
      normalizeItem(raw) {
        return normalizeExerciseItem(raw);
      },
    },
    workbooks: {
      readStore() {
        const store = readWorkbookStore();
        return {
          folders: store.folders,
          workbooks: store.workbooks.map(normalizeWorkbook).filter(Boolean),
        };
      },
      writeStore(store) {
        writeJson(WORKBOOKS_KEY, {
          folders: Array.isArray(store?.folders) ? store.folders : [],
          workbooks: Array.isArray(store?.workbooks) ? store.workbooks : [],
        });
      },
      normalizeWorkbook(raw) {
        return normalizeWorkbook(raw);
      },
    },
    routines: {
      readAll() {
        return readRoutineStore().map(normalizeRoutine).filter(Boolean);
      },
      writeAll(routines) {
        writeJson(ROUTINES_KEY, { routines: Array.isArray(routines) ? routines : [] });
      },
    },
    attachments: {
      getMeta(id) {
        return getAudioMeta(id);
      },
      putFileWithId(rec) {
        return putFileWithId(rec);
      },
      hasFile(id) {
        return hasFile(id);
      },
    },
    drumPatterns: {
      async listAll() {
        const idbPatterns = await listPatterns();
        const inboxPatterns = readDrumPatternsInbox();
        return mergeDrumPatternLists(idbPatterns, inboxPatterns);
      },
    },
  };
}

export async function runMigrations(ctx) {
  const report = {
    applied: [],
    skipped: [],
    failed: [],
    details: [],
  };

  let appliedList = ctx.settings.read('migrations.applied', []);
  if (!Array.isArray(appliedList)) appliedList = [];

  for (const migration of MIGRATIONS) {
    const id = migration.id;
    const detail = { id, detect: null, apply: null, verify: null };

    if (appliedList.includes(id)) {
      report.skipped.push(id);
      report.details.push(detail);
      continue;
    }

    try {
      detail.detect = await migration.detect(ctx);
    } catch (error) {
      report.failed.push({ id, stage: 'detect', error: String(error?.message || error) });
      report.details.push(detail);
      continue;
    }

    if (!detail.detect.needed) {
      const nextList = [...appliedList, id];
      ctx.settings.write('migrations.applied', nextList);
      appliedList = nextList;
      report.applied.push(id);
      report.details.push(detail);
      continue;
    }

    try {
      detail.apply = await migration.apply(ctx);
    } catch (error) {
      report.failed.push({ id, stage: 'apply', error: String(error?.message || error) });
      report.details.push(detail);
      continue;
    }

    try {
      detail.verify = await migration.verify(ctx);
    } catch (error) {
      report.failed.push({ id, stage: 'verify', error: String(error?.message || error) });
      report.details.push(detail);
      continue;
    }

    if (!detail.verify.ok) {
      const problems = detail.verify.problems || [];
      report.failed.push({
        id,
        stage: 'verify',
        error: problems.join('; ') || 'verify failed',
      });
      report.details.push(detail);
      continue;
    }

    const nextList = [...appliedList, id];
    ctx.settings.write('migrations.applied', nextList);
    appliedList = nextList;
    report.applied.push(id);
    report.details.push(detail);
  }

  return report;
}
