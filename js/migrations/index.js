// Versioned, idempotent, non-destructive data migrations for Musi.
// State: musi:settings keys migrations.version and migrations.log.
// Backups: musi.backup.<storageKey>.<migrationId> before any transformation.
// Never throws. Failures are recorded and originals remain untouched.

import { getSetting, saveSettings, invalidateSettingsCache } from '../persistence.js';
import { PROJECTS_STORAGE_KEY, invalidateProjectsCache } from '../create/projectModel.js';
import { PROGRESS_LOG_STORAGE_KEY } from '../progress/progressLog.js';

export const MIGRATION_VERSION = 4;

const SETTINGS_KEY = 'musi:settings';
const SONGS_KEY = 'musi.songs';
const NOTES_KEY = 'musi.notes';
const PRACTICE_DEFAULTS_KEY = 'practice-session.defaults';
const DERIVED_SUMMARY_KEY = 'derivedSummary';

const MIGRATIONS = [
  {
    id: 'projects-from-songs',
    version: 1,
    backupKeys: [SONGS_KEY, PROJECTS_STORAGE_KEY],
    run(ctx) {
      const songsRaw = ctx.read(SONGS_KEY);
      if (!songsRaw) return { detail: 'no songs to migrate' };
      let songs;
      try {
        songs = JSON.parse(songsRaw);
      } catch (e) {
        return { detail: 'songs parse skipped' };
      }
      if (!Array.isArray(songs) || !songs.length) return { detail: 'empty songs array' };

      const store = ctx.readJson(PROJECTS_STORAGE_KEY, {
        version: 1,
        projects: [],
        songExtensions: {},
        progressions: {},
        notesInbox: { links: [] },
      });
      if (!store.songExtensions || typeof store.songExtensions !== 'object') {
        store.songExtensions = {};
      }
      let added = 0;
      for (const raw of songs) {
        if (!raw || typeof raw !== 'object') continue;
        const songId = typeof raw.id === 'string' ? raw.id : '';
        if (!songId || store.songExtensions[songId]) continue;
        store.songExtensions[songId] = {
          kind: 'song',
          notes: '',
          scoreIds: [],
          progressionIds: [],
          drumPatternIds: [],
          linkedExerciseIds: [],
        };
        added += 1;
      }
      if (added > 0) ctx.write(PROJECTS_STORAGE_KEY, JSON.stringify(store));
      return { detail: `materialized ${added} song extension(s)` };
    },
  },
  {
    id: 'notes-inbox',
    version: 2,
    backupKeys: [NOTES_KEY, PROJECTS_STORAGE_KEY],
    run(ctx) {
      const notesRaw = ctx.read(NOTES_KEY);
      if (!notesRaw) return { detail: 'no notes to index' };
      let notes;
      try {
        notes = JSON.parse(notesRaw);
      } catch (e) {
        return { detail: 'notes parse skipped' };
      }
      if (!Array.isArray(notes)) return { detail: 'notes not an array' };

      const store = ctx.readJson(PROJECTS_STORAGE_KEY, {
        version: 1,
        projects: [],
        songExtensions: {},
        progressions: {},
        notesInbox: { links: [] },
      });
      if (!store.notesInbox || typeof store.notesInbox !== 'object') {
        store.notesInbox = { links: [] };
      }
      if (!Array.isArray(store.notesInbox.links)) store.notesInbox.links = [];

      const existing = new Set(store.notesInbox.links.map((l) => l?.noteId).filter(Boolean));
      let added = 0;
      for (const note of notes) {
        if (!note || typeof note !== 'object') continue;
        const noteId = typeof note.id === 'string' ? note.id : '';
        if (!noteId || existing.has(noteId)) continue;
        store.notesInbox.links.push({ noteId, attachedTo: null });
        existing.add(noteId);
        added += 1;
      }
      if (added > 0) ctx.write(PROJECTS_STORAGE_KEY, JSON.stringify(store));
      return { detail: `indexed ${added} inbox note(s)` };
    },
  },
  {
    id: 'practice-defaults',
    version: 3,
    backupKeys: [SETTINGS_KEY],
    run(ctx) {
      const settings = ctx.readJson(SETTINGS_KEY, {});
      if (settings[PRACTICE_DEFAULTS_KEY]) {
        return { detail: 'practice-session.defaults already present' };
      }
      const defaults = {
        minutes: settings['practice.minutes'] ?? 15,
        automation: settings['practice.automation'] ?? false,
        alarm: settings['practice.alarm'] ?? false,
        schedule: Array.isArray(settings['practice.schedule']) ? settings['practice.schedule'] : [],
        metronome: {
          bpm: settings['metro.bpm'] ?? 80,
          subdiv: settings['metro.subdiv'] ?? 'quarter',
          phases: Array.isArray(settings['metro.phases']) ? settings['metro.phases'] : [],
          phasesEnabled: settings['metro.phasesEnabled'] ?? false,
        },
        migratedAt: new Date().toISOString(),
      };
      settings[PRACTICE_DEFAULTS_KEY] = defaults;
      ctx.write(SETTINGS_KEY, JSON.stringify(settings));
      return { detail: 'wrote practice-session.defaults' };
    },
  },
  {
    id: 'progress-seed',
    version: 4,
    backupKeys: [SETTINGS_KEY, PROGRESS_LOG_STORAGE_KEY],
    run(ctx) {
      const log = ctx.readJson(PROGRESS_LOG_STORAGE_KEY, { version: 1, attempts: [] });
      if (log[DERIVED_SUMMARY_KEY]) {
        return { detail: 'derivedSummary already present' };
      }
      const settings = ctx.readJson(SETTINGS_KEY, {});
      const stats = settings.stats;
      if (!stats || typeof stats !== 'object') {
        return { detail: 'no stats to seed from' };
      }
      const today = stats.today && typeof stats.today === 'object' ? stats.today : {};
      const attempts = Number(today.attempts) || 0;
      const correct = Number(today.correct) || 0;
      log[DERIVED_SUMMARY_KEY] = {
        seededFrom: 'stats',
        at: new Date().toISOString(),
        bestStreak: Number(stats.bestStreak) || 0,
        currentStreak: Number(stats.currentStreak) || 0,
        todayAttempts: attempts,
        todayCorrect: correct,
        accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
        lastActivityTs: stats.lastActivityTs ?? null,
      };
      ctx.write(PROGRESS_LOG_STORAGE_KEY, JSON.stringify(log));
      return { detail: 'seeded derivedSummary from stats' };
    },
  },
];

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readRaw(key) {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeRaw(key, value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function backupKey(storageKey, migrationId) {
  return `musi.backup.${storageKey}.${migrationId}`;
}

function readSettingsDoc() {
  const raw = readRaw(SETTINGS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeSettingsDoc(doc) {
  writeRaw(SETTINGS_KEY, JSON.stringify(doc));
  invalidateSettingsCache();
}

export function getMigrationState() {
  const settings = readSettingsDoc();
  return {
    version: Number(settings['migrations.version']) || 0,
    log: Array.isArray(settings['migrations.log']) ? [...settings['migrations.log']] : [],
  };
}

export function listMigrations() {
  return MIGRATIONS.map((m) => ({ id: m.id, version: m.version }));
}

function appendLogEntry(entry) {
  const settings = readSettingsDoc();
  const log = Array.isArray(settings['migrations.log']) ? settings['migrations.log'] : [];
  log.push(entry);
  settings['migrations.log'] = log;
  writeSettingsDoc(settings);
}

function setVersion(version) {
  const settings = readSettingsDoc();
  settings['migrations.version'] = version;
  writeSettingsDoc(settings);
}

function makeContext() {
  return {
    read(key) {
      return readRaw(key);
    },
    readJson(key, fallback) {
      const raw = readRaw(key);
      if (raw === null) return fallback;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
      } catch (e) {
        return fallback;
      }
    },
    write(key, value) {
      writeRaw(key, value);
      if (key === PROJECTS_STORAGE_KEY) invalidateProjectsCache();
      if (key === SETTINGS_KEY) invalidateSettingsCache();
    },
    backup(storageKey, migrationId) {
      const raw = readRaw(storageKey);
      if (raw !== null) {
        writeRaw(backupKey(storageKey, migrationId), raw);
      }
    },
  };
}

/**
 * @param {{ failMigrationId?: string }} [options] - test hook to simulate failure
 */
export function runMigrations(options = {}) {
  const applied = [];
  const skipped = [];
  const errors = [];
  const ctx = makeContext();
  const state = getMigrationState();
  let currentVersion = state.version;

  for (const migration of MIGRATIONS) {
    if (currentVersion >= migration.version) {
      skipped.push(migration.id);
      continue;
    }

    try {
      for (const key of migration.backupKeys) {
        ctx.backup(key, migration.id);
      }

      if (options.failMigrationId === migration.id) {
        throw new Error(`deliberate test failure for ${migration.id}`);
      }

      const result = migration.run(ctx);
      currentVersion = migration.version;
      setVersion(currentVersion);
      appendLogEntry({
        id: migration.id,
        at: new Date().toISOString(),
        result: 'ok',
        detail: result?.detail || '',
      });
      applied.push(migration.id);
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      appendLogEntry({
        id: migration.id,
        at: new Date().toISOString(),
        result: 'error',
        detail: message,
      });
      errors.push({ id: migration.id, message });
      break;
    }
  }

  return {
    version: getMigrationState().version,
    applied,
    skipped,
    errors,
  };
}
