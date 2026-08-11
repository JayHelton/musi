/**
 * Legacy stored-data reader characterization tests.
 * Run: node tests/characterization/legacy-data.mjs
 */

import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { installIdbShim } from '../exercises/idbShim.mjs';
import { installDomShim } from '../gp-player/domShim.mjs';
import {
  LEGACY_SNAPSHOT,
  MUSI_EXERCISES,
  MUSI_WORKBOOKS,
  MUSI_ROUTINES,
  MUSI_NOTES,
  MUSI_SONGS_EXPECTED,
  MUSI_GP_ANNOTATIONS,
  MUSI_SETTINGS,
} from './fixtures.mjs';
import { ROUTINES_STORAGE_KEY } from '../../js/routineModel.js';
import { WORKBOOKS_STORAGE_KEY } from '../../js/workbookModel.js';

function pickFields(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

function assertExerciseMatches(item, expected) {
  const keys = [
    'id', 'name', 'categoryId', 'attachmentId', 'url', 'fileName', 'type', 'size', 'addedAt',
    'preferredTrackIndex', 'measureStart', 'measureEnd', 'startBeat', 'endBeat',
    'loopEnabled', 'loopRestSec', 'bpm', 'transpose', 'tuning', 'retuneMode', 'takes',
  ];
  assert.deepEqual(pickFields(item, keys), pickFields(expected, keys));
}

async function setupLegacyStorage() {
  installLocalStorageShim({ ...LEGACY_SNAPSHOT });
  globalThis.window = globalThis;
  const { invalidateSettingsCache } = await import('../../js/persistence.js');
  invalidateSettingsCache();
}

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

await test('exercises categories, items, takes, and GP practice fields', async () => {
  await setupLegacyStorage();
  installDomShim();
  installIdbShim();

  const {
    invalidateExercisesCache,
    getCategories,
    getExercises,
    getExercise,
  } = await import('../../js/exercises.js');
  invalidateExercisesCache();

  assert.deepEqual(getCategories(), MUSI_EXERCISES.categories);

  const items = getExercises();
  assert.equal(items.length, MUSI_EXERCISES.items.length);
  for (const expected of MUSI_EXERCISES.items) {
    const actual = getExercise(expected.id);
    assert.ok(actual, `missing exercise ${expected.id}`);
    assertExerciseMatches(actual, expected);
  }
});

await test('workbooks folders, entries, companions, and activeEntryId', async () => {
  await setupLegacyStorage();

  const {
    listWorkbookFolders,
    listWorkbooks,
    getWorkbook,
  } = await import('../../js/workbookModel.js');

  assert.deepEqual(listWorkbookFolders(), MUSI_WORKBOOKS.folders);

  const workbooks = listWorkbooks();
  assert.equal(workbooks.length, MUSI_WORKBOOKS.workbooks.length);

  for (const expected of MUSI_WORKBOOKS.workbooks) {
    const actual = getWorkbook(expected.id);
    assert.ok(actual);
    assert.equal(actual.name, expected.name);
    assert.equal(actual.folderId, expected.folderId);
    assert.equal(actual.loopEnabled, expected.loopEnabled);
    assert.equal(actual.activeEntryId, expected.activeEntryId);
    assert.deepEqual(actual.entries, expected.entries);
    assert.equal(actual.companions.length, expected.companions.length);
    const companion = actual.companions[0];
    const fixtureCompanion = expected.companions[0];
    if (fixtureCompanion) {
      assert.equal(companion.type, fixtureCompanion.type);
      assert.equal(companion.root, fixtureCompanion.root);
      assert.equal(companion.scale, fixtureCompanion.scale);
      assert.equal(companion.tuning, fixtureCompanion.tuning);
      assert.equal(companion.label, fixtureCompanion.label);
    }
  }
});

await test('routines sessions ordering, activeSessionId, and metronome', async () => {
  await setupLegacyStorage();

  const { invalidateRoutinesCache, getRoutine } = await import('../../js/routineModel.js');
  invalidateRoutinesCache();

  const actual = getRoutine('rt-morning');
  const expected = MUSI_ROUTINES.routines[0];
  assert.ok(actual);
  assert.equal(actual.name, expected.name);
  assert.equal(actual.description, expected.description);
  assert.equal(actual.activeSessionId, expected.activeSessionId);
  assert.equal(actual.sessions.length, expected.sessions.length);

  for (let i = 0; i < expected.sessions.length; i++) {
    const exp = expected.sessions[i];
    const got = actual.sessions[i];
    assert.equal(got.id, exp.id);
    assert.equal(got.name, exp.name);
    assert.equal(got.notes, exp.notes);
    assert.deepEqual(got.workbookIds, exp.workbookIds);
    assert.equal(got.durationMin, exp.durationMin);
    assert.deepEqual(got.metronome, exp.metronome);
    assert.equal(got.completed, exp.completed);
  }
});

await test('notes records load with id/title/body/createdAt/updatedAt', async () => {
  await setupLegacyStorage();
  installDomShim();

  const list = document.createElement('div');
  list.id = 'notes-list';
  document.body.appendChild(list);
  const empty = document.createElement('div');
  empty.id = 'notes-empty';
  document.body.appendChild(empty);

  const { invalidateNotesCache, initNotes } = await import('../../js/notes.js');
  invalidateNotesCache();
  initNotes();

  const buttons = [...list.querySelectorAll('.notes-list-item')];
  assert.equal(buttons.length, MUSI_NOTES.length);

  const stored = JSON.parse(globalThis.localStorage.getItem('musi.notes'));
  assert.equal(stored.length, MUSI_NOTES.length);
  for (const expected of MUSI_NOTES) {
    const row = stored.find((n) => n.id === expected.id);
    assert.ok(row);
    assert.equal(row.title, expected.title);
    assert.equal(row.body, expected.body);
    assert.equal(row.createdAt, expected.createdAt);
    assert.equal(row.updatedAt, expected.updatedAt);
  }
});

await test('songs legacy audioId migrates to recordings with preserved name', async () => {
  await setupLegacyStorage();
  installDomShim();
  installIdbShim();

  const list = document.createElement('div');
  list.id = 'sw-list';
  document.body.appendChild(list);
  const empty = document.createElement('div');
  empty.id = 'sw-empty';
  document.body.appendChild(empty);
  const editorEmpty = document.createElement('div');
  editorEmpty.id = 'sw-editor-empty';
  document.body.appendChild(editorEmpty);
  const editorBody = document.createElement('div');
  editorBody.id = 'sw-editor-body';
  document.body.appendChild(editorBody);
  const titleInput = document.createElement('input');
  titleInput.id = 'sw-title';
  document.body.appendChild(titleInput);
  const lyricsInput = document.createElement('textarea');
  lyricsInput.id = 'sw-lyrics';
  document.body.appendChild(lyricsInput);
  const recList = document.createElement('div');
  recList.id = 'sw-rec-list';
  document.body.appendChild(recList);

  const { invalidateSongsCache, initSongwriter } = await import('../../js/songwriter.js');
  invalidateSongsCache();
  initSongwriter();

  const legacyItem = [...list.querySelectorAll('.sw-list-item')].find(
    (el) => el.dataset.id === 'song-legacy',
  );
  assert.ok(legacyItem);
  legacyItem.click();

  const nameInputs = [...recList.querySelectorAll('.sw-rec-name')];
  assert.equal(nameInputs.length, 1);
  assert.equal(nameInputs[0].value, 'Kitchen demo take');

  const modernItem = [...list.querySelectorAll('.sw-list-item')].find(
    (el) => el.dataset.id === 'song-modern',
  );
  assert.ok(modernItem);
  modernItem.click();
  const modernNames = [...recList.querySelectorAll('.sw-rec-name')].map((el) => el.value);
  assert.deepEqual(modernNames, ['Verse melody', 'Chorus hook']);

  for (const expected of MUSI_SONGS_EXPECTED) {
    if (expected.id !== 'song-legacy') continue;
    assert.equal(nameInputs[0].value, expected.recordings[0].name);
  }
});

await test('gp annotations versioned store and score bucket', async () => {
  await setupLegacyStorage();

  const { invalidateGpAnnotationsCache, listAnnotations } = await import('../../js/gpAnnotations.js');
  invalidateGpAnnotationsCache();

  const scoreKey = 'att:att-gp-stairway';
  const annotations = listAnnotations(scoreKey);
  const expected = MUSI_GP_ANNOTATIONS.byScore[scoreKey].annotations[0];
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].id, expected.id);
  assert.equal(annotations[0].title, expected.title);
  assert.equal(annotations[0].text, expected.text);
  assert.equal(annotations[0].startBeat, expected.startBeat);
  assert.equal(annotations[0].endBeat, expected.endBeat);
  assert.equal(annotations[0].measureStart, expected.measureStart);
  assert.equal(annotations[0].measureEnd, expected.measureEnd);
});

await test('stats and study.progress read back with version markers intact', async () => {
  await setupLegacyStorage();

  const { getStatsSnapshot } = await import('../../js/stats.js');
  const { getStudyProgress } = await import('../../js/studyProgress.js');
  const { getSetting } = await import('../../js/persistence.js');

  const statsRaw = getSetting('stats', null);
  assert.equal(statsRaw.today.day, MUSI_SETTINGS.stats.today.day);
  assert.equal(statsRaw.bestStreak, MUSI_SETTINGS.stats.bestStreak);
  assert.equal(statsRaw.currentStreak, MUSI_SETTINGS.stats.currentStreak);

  const snap = getStatsSnapshot();
  assert.equal(snap.minutesToday, 18);
  assert.equal(snap.accuracy, 79);
  assert.equal(snap.currentStreak, 3);
  assert.equal(snap.bestStreak, 7);

  const progress = getStudyProgress();
  assert.equal(progress.version, 1);
  assert.deepEqual(progress.concepts.major_scale, MUSI_SETTINGS['study.progress'].concepts.major_scale);
  assert.deepEqual(progress.recentStudies, MUSI_SETTINGS['study.progress'].recentStudies);
  assert.equal(progress.lastPrimaryId, MUSI_SETTINGS['study.progress'].lastPrimaryId);
});

await test('musicalContext and music profile settings survive fixture load', async () => {
  await setupLegacyStorage();

  const { getMusicProfile } = await import('../../js/musicProfile.js');
  const { getSetting, invalidateSettingsCache } = await import('../../js/persistence.js');
  invalidateSettingsCache();

  // musicalContext caches values at first module load; persisted settings remain authoritative.
  assert.equal(getSetting('context.root', ''), MUSI_SETTINGS['context.root']);
  assert.equal(getSetting('context.scale', ''), MUSI_SETTINGS['context.scale']);
  assert.equal(getSetting('context.tempo', 0), MUSI_SETTINGS['context.tempo']);
  assert.equal(getSetting('context.rootMode', ''), MUSI_SETTINGS['context.rootMode']);
  assert.equal(getSetting('context.scaleMode', ''), MUSI_SETTINGS['context.scaleMode']);

  const profile = getMusicProfile();
  assert.equal(profile.version, 1);
  assert.deepEqual(profile.genres, MUSI_SETTINGS['profile.music'].genres);
  assert.deepEqual(profile.goals, MUSI_SETTINGS['profile.music'].goals);
  assert.equal(profile.balance, MUSI_SETTINGS['profile.music'].balance);

  assert.deepEqual(getSetting('home.favorites', []), MUSI_SETTINGS['home.favorites']);
  assert.equal(getSetting('nav.lastTool', null), MUSI_SETTINGS['nav.lastTool']);
  assert.equal(getSetting('practice.minutes', 0), MUSI_SETTINGS['practice.minutes']);
  assert.equal(getSetting('metro.bpm', 0), MUSI_SETTINGS['metro.bpm']);
  assert.equal(getSetting('global.volume', 0), MUSI_SETTINGS['global.volume']);
  assert.equal(getSetting('kb.wave', ''), MUSI_SETTINGS['kb.wave']);
  assert.equal(getSetting('picker.lastTuning', ''), MUSI_SETTINGS['picker.lastTuning']);
  assert.ok(getSetting('io.masteryV2', null));
});

console.log(`\n${passed} tests passed`);

// Silence unused import lint in some runners.
void WORKBOOKS_STORAGE_KEY;
void ROUTINES_STORAGE_KEY;
