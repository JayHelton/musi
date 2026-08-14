/**
 * Zero-dependency Node tests for profile snapshot export/import.
 * Run: node tests/sync/profile.mjs
 */

import assert from 'node:assert/strict';

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _store: store,
  };
  return store;
}

const store = installLocalStorageShim();
globalThis.window = globalThis;

const {
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
  SYNC_SCOPES,
  buildSnapshot,
  validateSnapshot,
  summarizeSnapshot,
  applySnapshot,
  serializeSnapshot,
  parseSnapshotJson,
  snapshotFilename,
} = await import('../../js/sync/syncProfile.js');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function seedFullProfile() {
  store.clear();
  store.set('musi:settings', JSON.stringify({
    'global.volume': 0.8,
    'context.root': 'G',
    'features.enabled': ['scale', 'ear'],
    'profile.music': { version: 1, genres: [{ id: 'rock', priority: 'primary' }], goals: [], balance: 'balanced', applications: ['fretboard'], exclusions: [], updatedAt: 1 },
    stats: { today: { day: '2026-08-09', trainedMs: 1000, attempts: 5, correct: 4, perSkill: {} }, bestStreak: 3, currentStreak: 2, lastActivityTs: 1 },
    'study.progress': { version: 1, concepts: { major_scale: { completions: 2 } }, recentStudies: [], lastPrimaryId: null, lastPrimaryAt: 0 },
    'io.mastery': { 'find|Standard|1|3': { attempts: 2, correct: 1 } },
    'io.masteryV2': { 'locate|click|standard|1|3': { attempts: 1, correct: 1 } },
    'io.sessionHistory': [{ at: 1, minutes: 3 }],
  }));
  store.set('musi.gpAutoFollow', 'true');
  store.set('musi.gpParchmentZoom', '1.1');
  store.set('musi.notes', JSON.stringify([
    { id: 'note-a', title: 'A', body: 'one', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  ]));
  store.set('musi.songs', JSON.stringify([
    { id: 'song-a', title: 'Song A', lyrics: 'la', recordings: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  store.set('musi.exercises', JSON.stringify({
    categories: [{ id: 'cat-1', name: 'Tabs' }],
    items: [{ id: 'ex-1', name: 'Exercise', attachmentId: 'att-1', addedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  store.set('musi.workbooks', JSON.stringify({
    folders: [{ id: 'wbf-1', name: 'Folder' }],
    workbooks: [{ id: 'wb-1', name: 'WB', folderId: 'wbf-1', entries: [], loopEnabled: true, activeEntryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  store.set('musi.routines', JSON.stringify({
    routines: [{ id: 'rt-1', name: 'Morning', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  store.set('musi.gpAnnotations', JSON.stringify({
    version: 1,
    byScore: { 'att:gp1': { annotations: [{ id: 'gpa-1', startBeat: 0, endBeat: 1, title: 't', text: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] } },
  }));
}

const ALL_EXPECTED_KEYS = new Set(SYNC_SCOPES.flatMap((s) => s.keys));

await test('buildSnapshot all scopes captures expected keys and omits absent ones', async () => {
  seedFullProfile();
  const snap = buildSnapshot();
  assert.equal(snap.kind, SNAPSHOT_KIND);
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.ok(snap.scopes.includes('settings'));
  assert.ok(snap.scopes.includes('progress'));
  assert.ok(snap.scopes.includes('content'));

  const dataKeys = new Set(Object.keys(snap.data));
  for (const key of dataKeys) {
    assert.ok(ALL_EXPECTED_KEYS.has(key), `unexpected key ${key}`);
  }
  assert.ok(dataKeys.has('musi.notes'));
  assert.ok(dataKeys.has('stats'));
  assert.ok(dataKeys.has('features.enabled'));
  assert.ok(dataKeys.has('musi:settings'));
  assert.ok(!dataKeys.has('musi.bootSplash.done'));

  store.clear();
  const emptySnap = buildSnapshot();
  assert.equal(Object.keys(emptySnap.data).length, 0);
});

await test('settings-only snapshot has no content keys', async () => {
  seedFullProfile();
  const snap = buildSnapshot({ scopes: ['settings'] });
  const keys = Object.keys(snap.data);
  assert.ok(keys.includes('musi:settings') || keys.includes('features.enabled'));
  assert.ok(!keys.includes('musi.notes'));
  assert.ok(!keys.includes('stats'));
  assert.ok(!keys.includes('musi.songs'));
});

await test('round trip reproduces direct localStorage values byte-for-byte', async () => {
  seedFullProfile();
  const directKeys = [
    'musi.gpAutoFollow',
    'musi.gpParchmentZoom',
    'musi.notes',
    'musi.songs',
    'musi.exercises',
    'musi.workbooks',
    'musi.routines',
    'musi.gpAnnotations',
  ];
  const originals = Object.fromEntries(directKeys.map((k) => [k, store.get(k)]));
  const snap = buildSnapshot();
  const text = serializeSnapshot(snap);
  const parsed = parseSnapshotJson(text);
  assert.equal(parsed.ok, true);

  store.clear();
  const result = await applySnapshot(parsed.snapshot, { mode: 'replace' });
  assert.equal(result.errors.length, 0);

  for (const key of directKeys) {
    assert.equal(store.get(key), originals[key], `byte mismatch for ${key}`);
  }

  const settings = JSON.parse(localStorage.getItem('musi:settings'));
  assert.equal(settings['global.volume'], 0.8);
  assert.equal(settings.stats.today.attempts, 5);
  assert.deepEqual(settings['features.enabled'], ['scale', 'ear']);
});

await test('validateSnapshot rejects bad payloads with messages', async () => {
  const good = buildSnapshot();
  assert.equal(validateSnapshot(good).ok, true);

  const nonObj = validateSnapshot(null);
  assert.equal(nonObj.ok, false);
  assert.ok(nonObj.error.length > 0);

  const wrongApp = validateSnapshot({ ...good, app: 'other' });
  assert.equal(wrongApp.ok, false);
  assert.ok(wrongApp.error.length > 0);

  const wrongKind = validateSnapshot({ ...good, kind: 'wrong' });
  assert.equal(wrongKind.ok, false);
  assert.ok(wrongKind.error.length > 0);

  const future = validateSnapshot({ ...good, version: SNAPSHOT_VERSION + 1 });
  assert.equal(future.ok, false);
  assert.ok(future.error.includes('newer version'));

  const badDataVal = validateSnapshot({ ...good, data: { 'musi.notes': { not: 'string' } } });
  assert.equal(badDataVal.ok, false);
  assert.ok(badDataVal.error.length > 0);

  const unknownKey = validateSnapshot({ ...good, data: { ...good.data, 'musi.unknown': 'x' } });
  assert.equal(unknownKey.ok, false);
  assert.ok(unknownKey.error.includes('unknown'));
});

await test('merge mode unions notes/songs with timestamp and conflict rules', async () => {
  store.clear();
  store.set('musi.notes', JSON.stringify([
    { id: 'n-local', title: 'Local', body: 'old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' },
    { id: 'n-conflict', title: 'Local wins', body: 'l', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'n-only-local', title: 'Only here', body: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  store.set('musi.songs', JSON.stringify([
    { id: 's-only-local', title: 'Local song', lyrics: '', recordings: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  store.set('musi:settings', JSON.stringify({ 'context.root': 'C', stats: { kept: true } }));

  const incoming = buildSnapshot({
    scopes: ['content'],
  });
  incoming.data['musi.notes'] = JSON.stringify([
    { id: 'n-incoming', title: 'New', body: 'new', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'n-local', title: 'Incoming newer', body: 'newer', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-10T00:00:00.000Z' },
    { id: 'n-conflict', title: 'Incoming stale', body: 'i', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]);
  incoming.data['musi.songs'] = JSON.stringify([
    { id: 's-incoming', title: 'Incoming song', lyrics: 'hi', recordings: [], createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  ]);

  const result = await applySnapshot(incoming, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);

  const notes = JSON.parse(localStorage.getItem('musi.notes'));
  const noteIds = notes.map((n) => n.id).sort();
  assert.deepEqual(noteIds, ['n-conflict', 'n-incoming', 'n-local', 'n-only-local']);
  const nLocal = notes.find((n) => n.id === 'n-local');
  assert.equal(nLocal.title, 'Incoming newer');
  const nConflict = notes.find((n) => n.id === 'n-conflict');
  assert.equal(nConflict.title, 'Local wins');

  assert.ok(result.counts['musi.notes'].conflicts >= 1);
  assert.ok(result.counts['musi.notes'].added >= 1);
  assert.ok(result.counts['musi.notes'].updated >= 1);

  const songs = JSON.parse(localStorage.getItem('musi.songs'));
  assert.equal(songs.length, 2);

  const settings = JSON.parse(localStorage.getItem('musi:settings'));
  assert.equal(settings['context.root'], 'C');
  assert.deepEqual(settings.stats, { kept: true });
});

await test('replace mode overwrites and removes in-scope keys only', async () => {
  store.clear();
  store.set('musi.notes', JSON.stringify([{ id: 'old', title: 'Old', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));
  store.set('musi.songs', JSON.stringify([{ id: 'keep-song', title: 'Stay', lyrics: '', recordings: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));
  store.set('musi:settings', JSON.stringify({ stats: { remove: true }, 'context.root': 'D' }));

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.notes': JSON.stringify([{ id: 'new', title: 'New', body: 'b', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }]),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  const notes = JSON.parse(localStorage.getItem('musi.notes'));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, 'new');
  assert.equal(localStorage.getItem('musi.songs'), null);

  const settings = JSON.parse(localStorage.getItem('musi:settings'));
  assert.deepEqual(settings.stats, { remove: true });
  assert.equal(settings['context.root'], 'D');
});

await test('malformed JSON in one key still imports others and reports error', async () => {
  store.clear();
  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.notes': 'not-json{{{',
      'musi.songs': JSON.stringify([{ id: 'ok', title: 'OK', lyrics: '', recordings: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]),
    },
  };
  const result = await applySnapshot(incoming, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].key, 'musi.notes');
  const songs = JSON.parse(localStorage.getItem('musi.songs'));
  assert.equal(songs[0].id, 'ok');
});

await test('summarizeSnapshot returns counts and tolerates corrupt values', async () => {
  seedFullProfile();
  const snap = buildSnapshot();
  const summary = summarizeSnapshot(snap);
  assert.equal(summary.keyCount, Object.keys(snap.data).length);
  assert.ok(summary.byteSize > 0);
  assert.ok(summary.items.some((i) => i.label === 'Notes' && i.count === 1));
  assert.ok(summary.items.some((i) => i.label === 'Routines' && i.count === 1));
  assert.ok(summary.items.some((i) => i.label === 'Practice stats'));

  const corrupt = summarizeSnapshot({
    createdAt: '2026-08-09T12:00:00.000Z',
    scopes: ['content'],
    data: { 'musi.notes': 'bad-json' },
  });
  assert.equal(corrupt.items.length, 0);
});

await test('snapshotFilename uses createdAt date', async () => {
  const name = snapshotFilename({ createdAt: '2026-08-09T15:00:00.000Z' });
  assert.equal(name, 'musi-profile-2026-08-09.json');
});

await test('import survives subsequent saveSetting after settings cache was warmed', async () => {
  const { getSetting, saveSetting } = await import('../../js/persistence.js');

  store.clear();
  store.set('musi:settings', JSON.stringify({
    stats: { today: { attempts: 1, correct: 0 }, bestStreak: 0, currentStreak: 0 },
  }));

  getSetting('stats', null);

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['progress'],
    data: {
      stats: JSON.stringify({
        today: { attempts: 99, correct: 88, perSkill: {} },
        bestStreak: 10,
        currentStreak: 5,
        lastActivityTs: 42,
      }),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'replace', scopes: ['progress'] });
  assert.equal(result.errors.length, 0);

  saveSetting('context.root', 'E');
  const stats = getSetting('stats', null);
  assert.equal(stats.today.attempts, 99);
  assert.equal(stats.bestStreak, 10);
  assert.equal(getSetting('context.root', null), 'E');
});

await test('musi.routines is in content scope and snapshot, not settings or progress', async () => {
  store.clear();
  store.set('musi.routines', JSON.stringify({
    routines: [{ id: 'rt-1', name: 'Routine', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  }));

  const contentScope = SYNC_SCOPES.find((s) => s.id === 'content');
  assert.ok(contentScope.keys.includes('musi.routines'));
  assert.ok(!SYNC_SCOPES.find((s) => s.id === 'settings').keys.includes('musi.routines'));
  assert.ok(!SYNC_SCOPES.find((s) => s.id === 'progress').keys.includes('musi.routines'));

  const snap = buildSnapshot({ scopes: ['content'] });
  assert.ok(snap.data['musi.routines']);
  assert.ok(!snap.data['musi:settings']);
  assert.ok(!snap.data.stats);
});

await test('validateSnapshot accepts musi.routines', async () => {
  const snap = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.routines': JSON.stringify({ routines: [{ id: 'rt-1', name: 'R', updatedAt: '2026-01-01T00:00:00.000Z' }] }),
    },
  };
  const result = validateSnapshot(snap);
  assert.equal(result.ok, true);
});

await test('merge mode unions routines with timestamp and conflict rules', async () => {
  store.clear();
  store.set('musi.routines', JSON.stringify({
    routines: [
      { id: 'rt-local', name: 'Local', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' },
      { id: 'rt-conflict', name: 'Local wins', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'rt-only-local', name: 'Only here', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  }));

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.routines': JSON.stringify({
        routines: [
          { id: 'rt-incoming', name: 'New', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
          { id: 'rt-local', name: 'Incoming newer', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-10T00:00:00.000Z' },
          { id: 'rt-conflict', name: 'Incoming stale', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);

  const routines = JSON.parse(localStorage.getItem('musi.routines'));
  const ids = routines.routines.map((r) => r.id).sort();
  assert.deepEqual(ids, ['rt-conflict', 'rt-incoming', 'rt-local', 'rt-only-local']);
  const rtLocal = routines.routines.find((r) => r.id === 'rt-local');
  assert.equal(rtLocal.name, 'Incoming newer');
  const rtConflict = routines.routines.find((r) => r.id === 'rt-conflict');
  assert.equal(rtConflict.name, 'Local wins');

  assert.ok(result.counts['musi.routines'].conflicts >= 1);
  assert.ok(result.counts['musi.routines'].added >= 1);
  assert.ok(result.counts['musi.routines'].updated >= 1);
});

await test('replace mode overwrites routines and removes when key absent', async () => {
  store.clear();
  store.set('musi.routines', JSON.stringify({
    routines: [{ id: 'rt-old', name: 'Old', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  store.set('musi.notes', JSON.stringify([{ id: 'keep-note', title: 'Stay', body: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.routines': JSON.stringify({
        routines: [{ id: 'rt-new', name: 'New', description: '', sessions: [], activeSessionId: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
      }),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'replace', scopes: ['content'] });
  assert.equal(result.errors.length, 0);
  const routines = JSON.parse(localStorage.getItem('musi.routines'));
  assert.equal(routines.routines.length, 1);
  assert.equal(routines.routines[0].id, 'rt-new');
  assert.equal(localStorage.getItem('musi.notes'), null);
});

await test('summarizeSnapshot reports routines label and count', async () => {
  const snap = {
    createdAt: '2026-08-09T12:00:00.000Z',
    scopes: ['content'],
    data: {
      'musi.routines': JSON.stringify({
        routines: [
          { id: 'rt-1', name: 'A', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'rt-2', name: 'B', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    },
  };
  const summary = summarizeSnapshot(snap);
  assert.ok(summary.items.some((i) => i.label === 'Routines' && i.count === 2));
});

await test('merge mode keeps parentId on exercise and workbook folders', async () => {
  store.clear();
  store.set('musi.exercises', JSON.stringify({
    categories: [
      { id: 'cat-parent', name: 'Guitar', parentId: '' },
      { id: 'cat-child', name: 'Scales', parentId: 'cat-parent' },
    ],
    items: [],
  }));
  store.set('musi.workbooks', JSON.stringify({
    folders: [
      { id: 'wbf-parent', name: 'Studies', parentId: '' },
      { id: 'wbf-child', name: 'Technique', parentId: 'wbf-parent' },
    ],
    workbooks: [],
  }));

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.exercises': JSON.stringify({
        categories: [
          { id: 'cat-parent', name: 'Guitar incoming', parentId: '' },
          { id: 'cat-child', name: 'Scales incoming', parentId: 'cat-parent' },
        ],
        items: [],
      }),
      'musi.workbooks': JSON.stringify({
        folders: [
          { id: 'wbf-parent', name: 'Studies incoming', parentId: '' },
          { id: 'wbf-child', name: 'Technique incoming', parentId: 'wbf-parent' },
        ],
        workbooks: [],
      }),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);

  const exercises = JSON.parse(localStorage.getItem('musi.exercises'));
  assert.equal(exercises.categories.find((c) => c.id === 'cat-child').parentId, 'cat-parent');

  const workbooks = JSON.parse(localStorage.getItem('musi.workbooks'));
  assert.equal(workbooks.folders.find((f) => f.id === 'wbf-child').parentId, 'wbf-parent');
});

await test('merge then store read repairs orphan folder parentId', async () => {
  store.clear();
  store.set('musi.exercises', JSON.stringify({
    categories: [{ id: 'cat-child', name: 'Scales', parentId: 'cat-gone' }],
    items: [],
  }));
  store.set('musi.workbooks', JSON.stringify({
    folders: [{ id: 'wbf-child', name: 'Technique', parentId: 'wbf-gone' }],
    workbooks: [],
  }));

  const incoming = {
    app: 'musi',
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    scopes: ['content'],
    data: {
      'musi.exercises': JSON.stringify({
        categories: [{ id: 'cat-child', name: 'Scales remote', parentId: 'cat-gone' }],
        items: [],
      }),
      'musi.workbooks': JSON.stringify({
        folders: [{ id: 'wbf-child', name: 'Technique remote', parentId: 'wbf-gone' }],
        workbooks: [],
      }),
    },
  };

  const result = await applySnapshot(incoming, { mode: 'merge', scopes: ['content'] });
  assert.equal(result.errors.length, 0);

  const { invalidateExercisesCache } = await import('../../js/exercises.js');
  invalidateExercisesCache?.();
  const { getCategories } = await import('../../js/exercises.js');
  assert.equal(getCategories().find((c) => c.id === 'cat-child').parentId, '');

  const { invalidateWorkbooksCache } = await import('../../js/workbookModel.js');
  invalidateWorkbooksCache?.();
  const { listWorkbookFolders } = await import('../../js/workbookModel.js');
  assert.equal(listWorkbookFolders().find((f) => f.id === 'wbf-child').parentId, '');
});

console.log(`\n${passed} tests passed`);
