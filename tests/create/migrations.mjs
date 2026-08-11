/**
 * Migration idempotency and data-safety tests.
 * Run: node tests/create/migrations.mjs
 */

import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { LEGACY_SNAPSHOT } from '../characterization/fixtures.mjs';
import { PROJECTS_STORAGE_KEY } from '../../js/create/projectModel.js';
import { PROGRESS_LOG_STORAGE_KEY } from '../../js/progress/progressLog.js';

const SETTINGS_KEY = 'musi:settings';
const SONGS_KEY = 'musi.songs';
const NOTES_KEY = 'musi.notes';

function snapshotKeys(store, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = store.has(key) ? store.get(key) : null;
  }
  return out;
}

async function loadMigrations(seed = {}) {
  const { store, reset } = installLocalStorageShim(seed);
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.localStorage = globalThis.localStorage;
  const migrations = await import('../../js/migrations/index.js');
  const progress = await import('../../js/progress/progressLog.js');
  const projectModel = await import('../../js/create/projectModel.js');
  const persistence = await import('../../js/persistence.js');
  migrations; // ensure module graph
  projectModel.invalidateProjectsCache();
  progress.invalidateProgressLogCache();
  persistence.invalidateSettingsCache();
  return { store, reset, migrations, progress, projectModel, persistence };
}

function parseSettings(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function originalSettingsSlice(raw) {
  const doc = parseSettings(raw);
  return {
    stats: doc.stats,
    'practice.minutes': doc['practice.minutes'],
    'practice.automation': doc['practice.automation'],
    'practice.alarm': doc['practice.alarm'],
    'practice.schedule': doc['practice.schedule'],
    'metro.bpm': doc['metro.bpm'],
    'metro.subdiv': doc['metro.subdiv'],
    'metro.phases': doc['metro.phases'],
    'metro.phasesEnabled': doc['metro.phasesEnabled'],
  };
}

export async function runMigrationTests(test) {
  const WATCH_KEYS = [SONGS_KEY, NOTES_KEY, SETTINGS_KEY, PROJECTS_STORAGE_KEY, PROGRESS_LOG_STORAGE_KEY];

  await test('migrations are idempotent on second run', async () => {
    const { store, migrations, progress } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    const before = snapshotKeys(store, WATCH_KEYS);
    const settingsBefore = originalSettingsSlice(before[SETTINGS_KEY]);

    const first = migrations.runMigrations();
    assert.ok(first.applied.length > 0);
    assert.equal(first.errors.length, 0);
    const versionAfterFirst = migrations.getMigrationState().version;
    const logLenFirst = migrations.getMigrationState().log.length;

    const second = migrations.runMigrations();
    assert.equal(second.applied.length, 0);
    assert.ok(second.skipped.length >= 4);
    assert.equal(migrations.getMigrationState().version, versionAfterFirst);
    assert.equal(migrations.getMigrationState().log.length, logLenFirst);

    const after = snapshotKeys(store, WATCH_KEYS);
    assert.deepEqual(after[SONGS_KEY], before[SONGS_KEY]);
    assert.deepEqual(after[NOTES_KEY], before[NOTES_KEY]);
    assert.deepEqual(originalSettingsSlice(after[SETTINGS_KEY]), settingsBefore);
  });

  await test('backups written before transformation', async () => {
    const { store, migrations } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    migrations.runMigrations();
    assert.ok(store.has(`musi.backup.${SONGS_KEY}.projects-from-songs`));
    assert.ok(store.has(`musi.backup.${NOTES_KEY}.notes-inbox`));
    assert.ok(store.has(`musi.backup.${SETTINGS_KEY}.practice-defaults`));
    assert.ok(store.has(`musi.backup.${SETTINGS_KEY}.progress-seed`));
  });

  await test('original stores remain byte-identical for authoritative keys', async () => {
    const { store, migrations } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    const songsBefore = store.get(SONGS_KEY);
    const notesBefore = store.get(NOTES_KEY);
    const settingsBefore = originalSettingsSlice(store.get(SETTINGS_KEY));

    migrations.runMigrations();

    assert.equal(store.get(SONGS_KEY), songsBefore);
    assert.equal(store.get(NOTES_KEY), notesBefore);
    assert.deepEqual(originalSettingsSlice(store.get(SETTINGS_KEY)), settingsBefore);
  });

  await test('failing migration is caught, logged, and leaves originals untouched', async () => {
    const { store, migrations } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    const songsBefore = store.get(SONGS_KEY);
    const notesBefore = store.get(NOTES_KEY);

    const result = migrations.runMigrations({ failMigrationId: 'projects-from-songs' });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'projects-from-songs');
    assert.equal(store.get(SONGS_KEY), songsBefore);
    assert.equal(store.get(NOTES_KEY), notesBefore);

    const state = migrations.getMigrationState();
    const errEntry = state.log.find((e) => e.id === 'projects-from-songs' && e.result === 'error');
    assert.ok(errEntry);
  });

  await test('progress-seed invents no attempts', async () => {
    const { migrations, progress } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    const beforeLen = progress.listAttempts().length;
    migrations.runMigrations();
    const afterLen = progress.listAttempts().length;
    assert.equal(afterLen, beforeLen);

    const logRaw = globalThis.localStorage.getItem(PROGRESS_LOG_STORAGE_KEY);
    const log = JSON.parse(logRaw);
    assert.ok(log.derivedSummary);
    assert.equal(log.derivedSummary.seededFrom, 'stats');
    assert.equal(Array.isArray(log.attempts) ? log.attempts.length : 0, beforeLen);
  });

  await test('notes inbox links are additive and note bodies untouched', async () => {
    const { store, migrations, projectModel } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    const notesBefore = store.get(NOTES_KEY);
    migrations.runMigrations();

    assert.equal(store.get(NOTES_KEY), notesBefore);

    const links = projectModel.listNotesInboxLinks();
    const notes = JSON.parse(notesBefore);
    assert.equal(links.length, notes.length);
    for (const note of notes) {
      const link = links.find((l) => l.noteId === note.id);
      assert.ok(link);
      assert.equal(link.attachedTo, null);
    }

    projectModel.attachNoteToTarget('note-ideas', { type: 'project', id: 'proj-test' });
    assert.equal(store.get(NOTES_KEY), notesBefore);

    const updated = projectModel.listNotesInboxLinks().find((l) => l.noteId === 'note-ideas');
    assert.deepEqual(updated.attachedTo, { type: 'project', id: 'proj-test' });
  });

  await test('practice-defaults migration writes new settings key', async () => {
    const { migrations, persistence } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    migrations.runMigrations();
    const defaults = persistence.getSetting('practice-session.defaults', null);
    assert.ok(defaults);
    assert.equal(defaults.minutes, 25);
    assert.equal(defaults.metronome.bpm, 88);
    assert.equal(persistence.getSetting('practice.minutes', null), 25);
  });

  await test('projects-from-songs materializes song extensions only', async () => {
    const { migrations, projectModel } = await loadMigrations({ ...LEGACY_SNAPSHOT });
    migrations.runMigrations();
    const projects = projectModel.listProjects();
    assert.equal(projects.length, 2);
    const storeRaw = globalThis.localStorage.getItem(PROJECTS_STORAGE_KEY);
    const store = JSON.parse(storeRaw);
    assert.ok(store.songExtensions['song-modern']);
    assert.ok(store.songExtensions['song-legacy']);
    assert.equal(store.projects.length, 0);
  });
}
