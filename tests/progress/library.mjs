// Node tests for libraryService read facade.
// Run via tests/progress/run.mjs

import assert from 'node:assert/strict';
import {
  listLibrary,
  getItem,
  resolveRefs,
  describeRef,
  libraryCounts,
  invalidateLibraryCache,
} from '../../js/library/libraryService.js';

const storage = globalThis.localStorage;

function seedLibraryFixtures() {
  storage.clear();
  storage.setItem('musi.exercises', JSON.stringify({
    categories: [{ id: 'cat-tabs', name: 'Tabs' }],
    items: [
      {
        id: 'ex-gp5',
        name: 'Etude GP5',
        categoryId: 'cat-tabs',
        attachmentId: 'att-gp5',
        url: '',
        fileName: 'piece.gp5',
        type: 'application/x-guitar-pro',
        size: 1200,
        addedAt: '2026-02-01T10:00:00.000Z',
        bpm: 96,
        measureStart: 1,
        measureEnd: 8,
        loopEnabled: true,
        takes: [{ id: 'take-1', attachmentId: 'att-take' }],
      },
      {
        id: 'ex-gpx',
        name: 'GPX Score',
        categoryId: 'cat-tabs',
        attachmentId: 'att-gpx',
        url: '',
        fileName: 'song.gpx',
        type: 'application/x-guitar-pro',
        size: 2400,
        addedAt: '2026-02-02T10:00:00.000Z',
      },
      {
        id: 'ex-mp3',
        name: 'Backing Track',
        categoryId: '',
        attachmentId: 'att-mp3',
        url: '',
        fileName: 'track.mp3',
        type: 'audio/mpeg',
        size: 5000,
        addedAt: '2026-02-03T10:00:00.000Z',
      },
      {
        id: 'ex-link',
        name: 'Lesson Link',
        categoryId: '',
        attachmentId: '',
        url: 'https://example.com/lesson',
        fileName: '',
        type: 'text/uri-list',
        size: 0,
        addedAt: '2026-02-04T10:00:00.000Z',
      },
    ],
  }));
  storage.setItem('musi.workbooks', JSON.stringify({
    folders: [{ id: 'wbf-1', name: 'Daily' }],
    workbooks: [
      {
        id: 'wb-1',
        name: 'Morning Routine',
        folderId: 'wbf-1',
        entries: [{ id: 'wbe-1', exerciseId: 'ex-gp5' }, { id: 'wbe-2', exerciseId: 'ex-mp3' }],
        loopEnabled: false,
        activeEntryId: 'wbe-1',
        createdAt: '2026-01-15T00:00:00.000Z',
        updatedAt: '2026-02-05T12:00:00.000Z',
      },
    ],
  }));
  storage.setItem('musi.routines', JSON.stringify({
    routines: [
      {
        id: 'rt-1',
        name: 'Week Plan',
        description: 'Practice block',
        sessions: [
          { id: 'rs-1', name: 'Warm-up', workbookIds: ['wb-1'], completed: false },
          { id: 'rs-2', name: 'Main', workbookIds: [], completed: false },
        ],
        activeSessionId: 'rs-1',
        createdAt: '2026-01-10T00:00:00.000Z',
        updatedAt: '2026-02-06T08:00:00.000Z',
      },
    ],
  }));
  invalidateLibraryCache();
}

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

test('listLibrary filters by each library type', () => {
  seedLibraryFixtures();
  const exercises = listLibrary({ type: 'exercise' });
  assert.equal(exercises.length, 4);
  assert.ok(exercises.every(it => it.type === 'exercise'));

  const workbooks = listLibrary({ type: 'workbook' });
  assert.equal(workbooks.length, 1);
  assert.equal(workbooks[0].ref.id, 'wb-1');

  const routines = listLibrary({ type: 'routine' });
  assert.equal(routines.length, 1);
  assert.equal(routines[0].ref.id, 'rt-1');

  const scores = listLibrary({ type: 'score' });
  assert.equal(scores.length, 2);
  assert.deepEqual(scores.map(s => s.ref.id).sort(), ['ex-gp5', 'ex-gpx']);

  const audio = listLibrary({ type: 'audio' });
  assert.equal(audio.length, 1);
  assert.equal(audio[0].ref.id, 'ex-mp3');

  const links = listLibrary({ type: 'link' });
  assert.equal(links.length, 1);
  assert.equal(links[0].ref.id, 'ex-link');

  const projects = listLibrary({ type: 'project' });
  assert.equal(projects.length, 0);
});

test('listLibrary query and folderId filters', () => {
  seedLibraryFixtures();
  const hits = listLibrary({ type: 'exercise', query: 'backing' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ref.id, 'ex-mp3');

  const foldered = listLibrary({ type: 'exercise', folderId: 'cat-tabs' });
  assert.equal(foldered.length, 2);
  assert.deepEqual(foldered.map(it => it.ref.id).sort(), ['ex-gp5', 'ex-gpx']);

  const uncategorized = listLibrary({ type: 'exercise', folderId: 'uncategorized' });
  assert.equal(uncategorized.length, 2);
});

test('getItem hit and miss', () => {
  seedLibraryFixtures();
  const hit = getItem({ type: 'workbook', id: 'wb-1' });
  assert.ok(hit);
  assert.equal(hit.title, 'Morning Routine');
  assert.equal(hit.meta.entryCount, 2);
  assert.equal(hit.meta.loopEnabled, false);

  const miss = getItem({ type: 'workbook', id: 'wb-missing' });
  assert.equal(miss, null);
});

test('resolveRefs preserves order and drops missing', () => {
  seedLibraryFixtures();
  const refs = [
    { type: 'score', id: 'ex-gpx' },
    { type: 'routine', id: 'rt-missing' },
    { type: 'audio', id: 'ex-mp3' },
  ];
  const resolved = resolveRefs(refs);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].ref.id, 'ex-gpx');
  assert.equal(resolved[1].ref.id, 'ex-mp3');
});

test('describeRef for missing target is safe', () => {
  seedLibraryFixtures();
  assert.equal(describeRef({ type: 'exercise', id: 'ex-gp5' }), 'Etude GP5');
  assert.equal(describeRef({ type: 'score', id: 'ex-nope' }), 'Score (ex-nope)');
  assert.equal(describeRef(null), 'Unknown item');
});

test('libraryCounts tallies derived types', () => {
  seedLibraryFixtures();
  const counts = libraryCounts();
  assert.equal(counts.exercise, 4);
  assert.equal(counts.workbook, 1);
  assert.equal(counts.routine, 1);
  assert.equal(counts.score, 2);
  assert.equal(counts.audio, 1);
  assert.equal(counts.link, 1);
  assert.equal(counts.project, 0);
});

test('GP score classification: gp5/gpx vs mp3 and link', () => {
  seedLibraryFixtures();
  const scoreIds = listLibrary({ type: 'score' }).map(s => s.ref.id);
  assert.ok(scoreIds.includes('ex-gp5'));
  assert.ok(scoreIds.includes('ex-gpx'));
  assert.ok(!scoreIds.includes('ex-mp3'));
  assert.ok(!scoreIds.includes('ex-link'));

  const mp3AsScore = getItem({ type: 'score', id: 'ex-mp3' });
  assert.equal(mp3AsScore, null);

  const gp5Exercise = getItem({ type: 'exercise', id: 'ex-gp5' });
  assert.ok(gp5Exercise);
  assert.equal(gp5Exercise.meta.hasTakes, true);
  assert.equal(gp5Exercise.meta.bpm, 96);
});
