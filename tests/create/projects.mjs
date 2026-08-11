/**
 * Project model and songwriter adapter tests.
 * Run: node tests/create/projects.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { installDomShim } from '../gp-player/domShim.mjs';
import {
  MUSI_SONGS_RAW,
  MUSI_SONGS_EXPECTED,
} from '../characterization/fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, '../../index.html'), 'utf8');

function sectionIdsFromHtml() {
  const ids = new Set();
  const re = /id="(sec-[^"]+)"/g;
  let m;
  while ((m = re.exec(indexHtml))) ids.add(m[1]);
  return ids;
}

function collectSectionMappings(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (obj.sectionId && obj.featureId) {
    out.push({ sectionId: obj.sectionId, featureId: obj.featureId });
    return out;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectSectionMappings(value, out);
  }
  return out;
}

async function loadProjectModel({ seed = {}, clearProjects = true } = {}) {
  const { reset } = installLocalStorageShim(seed);
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.localStorage = globalThis.localStorage;
  if (clearProjects) {
    globalThis.localStorage.removeItem('musi.projects');
  }
  const mod = await import('../../js/create/projectModel.js');
  mod.invalidateProjectsCache();
  const songwriter = await import('../../js/songwriter.js');
  songwriter.invalidateSongsCache();
  return { mod, reset, songwriter };
}

export async function runProjectTests(test) {
  const htmlSections = sectionIdsFromHtml();
  const { CREATE_SECTIONS } = await import('../../js/workspaces/create.js');

  await test('CREATE_SECTIONS maps every view/param to a sec-* id in index.html', async () => {
    const mappings = collectSectionMappings(CREATE_SECTIONS);
    assert.ok(mappings.length >= 6);
    for (const { sectionId } of mappings) {
      assert.ok(htmlSections.has(sectionId), `missing ${sectionId}`);
    }
  });

  await test('project CRUD and normalization with proj- ids', async () => {
    const { mod } = await loadProjectModel();
    const created = mod.createProject({ title: 'Test riff', kind: 'riff', lyrics: 'la la' });
    assert.match(created.id, /^proj-/);
    assert.equal(created.kind, 'riff');
    assert.equal(created.lyrics, 'la la');

    const updated = mod.updateProject(created.id, { title: 'Renamed', notes: 'memo' });
    assert.equal(updated.title, 'Renamed');
    assert.equal(updated.notes, 'memo');

    const listed = mod.listProjects();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);

    assert.equal(mod.deleteProject(created.id), true);
    assert.equal(mod.listProjects().length, 0);
  });

  await test('defensive in-memory operation without localStorage', async () => {
    installLocalStorageShim({});
    const mod = await import('../../js/create/projectModel.js');
    mod.invalidateProjectsCache();

    const prev = globalThis.localStorage;
    globalThis.localStorage = undefined;
    if (globalThis.window) globalThis.window.localStorage = undefined;
    mod.invalidateProjectsCache();

    const p = mod.createProject({ title: 'Memory only' });
    assert.ok(p.id);
    assert.equal(mod.listProjects().length, 1);

    globalThis.localStorage = prev;
    if (globalThis.window) globalThis.window.localStorage = prev;
    mod.invalidateProjectsCache();
  });

  await test('songwriter adapter preserves modern and legacy song fixtures', async () => {
    const { mod } = await loadProjectModel({
      seed: { 'musi.songs': JSON.stringify(MUSI_SONGS_RAW) },
    });

    const projects = mod.listProjects();
    assert.equal(projects.length, MUSI_SONGS_RAW.length);

    const modern = projects.find((p) => p.id === mod.songProjectId('song-modern'));
    assert.ok(modern);
    const expectedModern = MUSI_SONGS_EXPECTED.find((s) => s.id === 'song-modern');
    assert.equal(modern.title, expectedModern.title);
    assert.equal(modern.lyrics, expectedModern.lyrics);
    assert.deepEqual(modern.recordingIds, expectedModern.recordings.map((r) => r.id));
    assert.equal(modern.kind, 'song');

    const legacy = projects.find((p) => p.id === mod.songProjectId('song-legacy'));
    assert.ok(legacy);
    const expectedLegacy = MUSI_SONGS_EXPECTED.find((s) => s.id === 'song-legacy');
    assert.equal(legacy.title, expectedLegacy.title);
    assert.equal(legacy.lyrics, expectedLegacy.lyrics);
    assert.deepEqual(legacy.recordingIds, expectedLegacy.recordings.map((r) => r.id));
  });

  await test('adapting songs twice yields one project per song', async () => {
    const { mod } = await loadProjectModel({
      seed: { 'musi.songs': JSON.stringify(MUSI_SONGS_RAW) },
    });
    const first = mod.listProjects();
    const second = mod.listProjects();
    assert.equal(first.length, second.length);
    const ids = new Set(second.map((p) => p.id));
    assert.equal(ids.size, second.length);
  });

  await test('writing title/lyrics/recordings through song-backed project updates musi.songs', async () => {
    const { mod, songwriter } = await loadProjectModel({
      seed: { 'musi.songs': JSON.stringify(MUSI_SONGS_RAW) },
    });
    const projectId = mod.songProjectId('song-modern');
    mod.updateProject(projectId, {
      title: 'Neon Skyline (edit)',
      lyrics: 'Updated lyrics',
      recordingIds: ['rec-v1', 'rec-ch', 'rec-new'],
    });
    mod.updateProject(projectId, { kind: 'song', notes: 'Create overlay', scoreIds: ['score-1'] });

    songwriter.invalidateSongsCache();
    const raw = JSON.parse(globalThis.localStorage.getItem('musi.songs'));
    const song = raw.find((s) => s.id === 'song-modern');
    assert.equal(song.title, 'Neon Skyline (edit)');
    assert.equal(song.lyrics, 'Updated lyrics');
    assert.equal(song.recordings.length, 3);
    assert.equal(song.recordings[2].id, 'rec-new');

    installDomShim();
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

    songwriter.initSongwriter();
    const item = [...list.querySelectorAll('.sw-list-item')].find((el) => el.dataset.id === 'song-modern');
    assert.ok(item);
    item.click();
    assert.equal(titleInput.value, 'Neon Skyline (edit)');
    assert.equal(lyricsInput.value, 'Updated lyrics');

    const overlay = mod.getProject(projectId);
    assert.equal(overlay.notes, 'Create overlay');
    assert.deepEqual(overlay.scoreIds, ['score-1']);
  });

  await test('Create-only fields persist separately from musi.songs', async () => {
    const { mod } = await loadProjectModel({
      seed: { 'musi.songs': JSON.stringify(MUSI_SONGS_RAW) },
    });
    const projectId = mod.songProjectId('song-legacy');
    mod.updateProject(projectId, {
      kind: 'vocal-idea',
      notes: 'Idea memo',
      drumPatternIds: ['pat-1'],
      linkedExerciseIds: ['ex-gp-stairway'],
    });

    const songsRaw = globalThis.localStorage.getItem('musi.songs');
    assert.ok(songsRaw.includes('audioId'));
    assert.ok(songsRaw.includes('rec-legacy-audio'));

    const project = mod.getProject(projectId);
    assert.equal(project.kind, 'vocal-idea');
    assert.equal(project.notes, 'Idea memo');
    assert.deepEqual(project.drumPatternIds, ['pat-1']);
    assert.deepEqual(project.linkedExerciseIds, ['ex-gp-stairway']);
  });

  await test('listProjectLibraryItems returns LibraryItem-shaped rows', async () => {
    const { mod } = await loadProjectModel({
      seed: { 'musi.songs': JSON.stringify(MUSI_SONGS_RAW) },
    });
    mod.createProject({ title: 'Native', kind: 'riff' });
    const items = mod.listProjectLibraryItems();
    assert.ok(items.length >= 3);
    for (const item of items) {
      assert.equal(item.ref.type, 'project');
      assert.equal(item.type, 'project');
      assert.ok(typeof item.title === 'string');
      assert.ok(item.meta && typeof item.meta.kind === 'string');
    }
  });
}
