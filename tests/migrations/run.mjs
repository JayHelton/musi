/**
 * Zero-dependency Node runner for client migration framework tests.
 * Run: node tests/migrations/run.mjs
 */

import assert from 'node:assert/strict';
import { normalizeNote } from '../../js/notes.js';
import { normalizeExerciseItem } from '../../js/exercises.js';
import { normalizeWorkbook } from '../../js/workbookModel.js';
import { MIGRATIONS, runMigrations } from '../../js/migrations/index.js';
import notesUnfiled from '../../js/migrations/notesUnfiled.js';
import exerciseMetadata from '../../js/migrations/exerciseMetadata.js';
import drumsToExercises from '../../js/migrations/drumsToExercises.js';
import { buildEmptyData } from './fixtures/emptyData.mjs';
import {
  buildNormalData,
  buildNormalNotes,
  buildDuplicateTitleNotes,
  buildPartialLegacyNote,
  buildLinkedNote,
  buildBrokenLinkNote,
  buildNormalExerciseStore,
  buildDuplicateFileNameExercises,
  buildPartialLegacyExercise,
  buildMigratedDrumExercise,
  buildNormalDrumPatterns,
} from './fixtures/normalData.mjs';
import { buildLargeData } from './fixtures/largeData.mjs';
import {
  assertNoDuplicateIds,
  assertSourceRecordsIntact,
  assertAppliedList,
  assertNotApplied,
  countExercisesForSourceRef,
} from './assertHelpers.mjs';

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedNotes(ctx) {
  return ctx.notes.readAll().map((note) => ctx.notes.normalizeNote(note)).filter(Boolean);
}

function normalizedExerciseItems(ctx) {
  const { items } = ctx.exercises.readStore();
  return items.map((item) => ctx.exercises.normalizeItem(item)).filter(Boolean);
}

function metaOf(rec) {
  if (!rec) return null;
  return {
    id: rec.id,
    name: rec.name,
    fileName: rec.fileName || '',
    type: rec.type || '',
    size: Number.isFinite(rec.size) ? rec.size : 0,
    createdAt: rec.createdAt || '',
    source: rec.source || 'upload',
  };
}

function createFakeCtx(seed = {}) {
  const settings = new Map();
  Object.entries(seed.settings || {}).forEach(([key, value]) => settings.set(key, value));

  const state = {
    notes: clone(seed.notes || []),
    songs: clone(seed.songs || []),
    exerciseStore: clone(seed.exerciseStore || { categories: [], items: [] }),
    workbookStore: clone(seed.workbookStore || { folders: [], workbooks: [] }),
    drumPatterns: clone(seed.drumPatterns || []),
    attachments: seed.attachments instanceof Map
      ? new Map([...seed.attachments.entries()])
      : new Map(),
  };

  const ctx = {
    state,
    clock: { now: () => seed.now || '2026-08-14T12:00:00.000Z' },
    log: {
      info() {},
      warn() {},
      error() {},
    },
    settings: {
      read(key, fallback) {
        return settings.has(key) ? settings.get(key) : fallback;
      },
      write(key, value) {
        settings.set(key, value);
      },
    },
    notes: {
      readAll() {
        return clone(state.notes);
      },
      writeAll(notes) {
        state.notes = clone(notes);
      },
      normalizeNote(raw) {
        return normalizeNote(raw);
      },
    },
    songs: {
      readAll() {
        return clone(state.songs);
      },
      writeAll(songs) {
        state.songs = clone(songs);
      },
    },
    exercises: {
      readStore() {
        return {
          categories: clone(state.exerciseStore.categories || []),
          items: clone(state.exerciseStore.items || []),
        };
      },
      writeStore(store) {
        state.exerciseStore = {
          categories: clone(store?.categories || []),
          items: clone(store?.items || []),
        };
      },
      normalizeItem(raw) {
        return normalizeExerciseItem(raw);
      },
    },
    workbooks: {
      readStore() {
        return {
          folders: clone(state.workbookStore.folders || []),
          workbooks: clone(state.workbookStore.workbooks || []),
        };
      },
      writeStore(store) {
        state.workbookStore = {
          folders: clone(store?.folders || []),
          workbooks: clone(store?.workbooks || []),
        };
      },
      normalizeWorkbook(raw) {
        return normalizeWorkbook(raw);
      },
    },
    attachments: {
      getMeta(id) {
        const rec = state.attachments.get(id);
        return metaOf(rec);
      },
      async putFileWithId(rec) {
        if (!rec?.id || !rec.blob) return null;
        state.attachments.set(rec.id, { ...rec });
        return metaOf(rec);
      },
      async hasFile(id) {
        return state.attachments.has(id);
      },
    },
    drumPatterns: {
      async listAll() {
        return clone(state.drumPatterns);
      },
    },
  };

  return ctx;
}

async function runRegistry(ctx, registry) {
  const report = {
    applied: [],
    skipped: [],
    failed: [],
    details: [],
  };
  let appliedList = ctx.settings.read('migrations.applied', []);
  if (!Array.isArray(appliedList)) appliedList = [];

  for (const migration of registry) {
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

await test('registry order matches contract section 6', async () => {
  assert.deepEqual(
    MIGRATIONS.map((migration) => migration.id),
    ['notes-unfiled.v1', 'exercise-metadata.v1', 'drums-to-exercises.v1'],
  );
});

await test('empty stores: all migrations detect, verify, and record ids', async () => {
  const ctx = createFakeCtx(buildEmptyData());
  const report = await runMigrations(ctx);
  assert.ok(report.failed.length === 0);
  assertAppliedList(ctx.settings.read, [
    'notes-unfiled.v1',
    'exercise-metadata.v1',
    'drums-to-exercises.v1',
  ]);
  ['notes-unfiled.v1', 'exercise-metadata.v1'].forEach((id) => {
    const detail = report.details.find((row) => row.id === id);
    assert.ok(detail, `missing detail for ${id}`);
    assert.equal(detail.detect.needed, true, `${id} detect must be needed on first run`);
    assert.notEqual(detail.apply, null, `${id} apply must run`);
    assert.notEqual(detail.verify, null, `${id} verify must run`);
    assert.equal(detail.verify.ok, true, `${id} verify must pass`);
  });
  const drumsDetail = report.details.find((row) => row.id === 'drums-to-exercises.v1');
  assert.ok(drumsDetail);
  assert.equal(drumsDetail.detect.needed, false);
});

await test('notes detect reports needed for empty store and legacy records', async () => {
  const emptyCtx = createFakeCtx(buildEmptyData());
  const emptyDetect = await notesUnfiled.detect(emptyCtx);
  assert.equal(emptyDetect.needed, true);
  assert.equal(emptyDetect.count, 0);

  const legacyCtx = createFakeCtx({ notes: buildNormalNotes(), settings: {} });
  const legacyDetect = await notesUnfiled.detect(legacyCtx);
  assert.equal(legacyDetect.needed, true);
  assert.equal(legacyDetect.count, buildNormalNotes().length);
});

await test('exercise metadata detect reports needed for empty store and legacy records', async () => {
  const emptyCtx = createFakeCtx(buildEmptyData());
  const emptyDetect = await exerciseMetadata.detect(emptyCtx);
  assert.equal(emptyDetect.needed, true);
  assert.equal(emptyDetect.count, 0);

  const legacyCtx = createFakeCtx({
    exerciseStore: buildNormalExerciseStore(),
    settings: {},
  });
  const legacyDetect = await exerciseMetadata.detect(legacyCtx);
  assert.equal(legacyDetect.needed, true);
  assert.equal(legacyDetect.count, buildNormalExerciseStore().items.length);
});

await test('first run report details include apply and verify for read-time migrations', async () => {
  const ctx = createFakeCtx({
    notes: buildNormalNotes(),
    exerciseStore: buildNormalExerciseStore(),
    settings: {},
    attachments: new Map(),
  });
  const report = await runMigrations(ctx);
  ['notes-unfiled.v1', 'exercise-metadata.v1'].forEach((id) => {
    const detail = report.details.find((row) => row.id === id);
    assert.ok(detail, `missing detail for ${id}`);
    assert.equal(detail.detect.needed, true);
    assert.notEqual(detail.apply, null);
    assert.notEqual(detail.verify, null);
    assert.equal(detail.verify.ok, true);
  });
});

await test('normal notes: legacy fields default and ids stay stable', async () => {
  const notes = buildNormalNotes();
  const ctx = createFakeCtx({ ...buildNormalData(), notes });
  const before = clone(notes);
  await runMigrations(ctx);
  assert.deepEqual(ctx.state.notes, before);
  const after = normalizedNotes(ctx);
  assert.equal(after.length, before.length);
  after.forEach((note) => {
    assert.equal(note.linkedType, '');
    assert.equal(note.linkedId, '');
  });
});

await test('legacy notes verify passes without apply writes', async () => {
  const notes = buildNormalNotes();
  const ctx = createFakeCtx({ notes, settings: {} });
  const detect = await notesUnfiled.detect(ctx);
  assert.equal(detect.needed, true);
  const apply = await notesUnfiled.apply(ctx);
  assert.equal(apply.skipped, notes.length);
  const verify = await notesUnfiled.verify(ctx);
  assert.equal(verify.ok, true);
  assert.deepEqual(ctx.state.notes, notes);
});

await test('duplicate note titles: both notes remain unfiled', async () => {
  const notes = buildDuplicateTitleNotes();
  const ctx = createFakeCtx({ notes, settings: {} });
  await runMigrations(ctx);
  const after = normalizedNotes(ctx);
  assert.equal(after.length, 2);
  assert.equal(after.filter((n) => n.linkedId === '').length, 2);
});

await test('partial legacy note: updatedAt fills from createdAt', async () => {
  const note = buildPartialLegacyNote();
  const ctx = createFakeCtx({ notes: [note], settings: {} });
  await runMigrations(ctx);
  const normalized = normalizedNotes(ctx)[0];
  assert.equal(normalized.updatedAt, note.createdAt);
  assert.equal(normalized.linkedId, '');
});

await test('already-linked note: link fields stay intact', async () => {
  const note = buildLinkedNote();
  const ctx = createFakeCtx({ notes: [note], settings: {} });
  await runMigrations(ctx);
  const normalized = normalizedNotes(ctx)[0];
  assert.equal(normalized.linkedType, 'exercise');
  assert.equal(normalized.linkedId, 'ex-normal-001');
  assert.equal(ctx.state.notes[0].linkedId, 'ex-normal-001');
});

await test('broken note link: note is not deleted', async () => {
  const note = buildBrokenLinkNote();
  const ctx = createFakeCtx({ notes: [note], settings: {} });
  await runMigrations(ctx);
  assert.equal(ctx.notes.readAll().length, 1);
  assert.equal(ctx.notes.readAll()[0].id, note.id);
});

await test('legacy exercises verify passes without apply writes', async () => {
  const store = buildNormalExerciseStore();
  const ctx = createFakeCtx({ exerciseStore: store, settings: {} });
  const detect = await exerciseMetadata.detect(ctx);
  assert.equal(detect.needed, true);
  const apply = await exerciseMetadata.apply(ctx);
  assert.equal(apply.skipped, store.items.length);
  const verify = await exerciseMetadata.verify(ctx);
  assert.equal(verify.ok, true);
  assert.deepEqual(ctx.state.exerciseStore, store);
});

await test('repeated notes migration run creates no new notes', async () => {
  const ctx = createFakeCtx({ notes: buildNormalNotes(), settings: {} });
  await runMigrations(ctx);
  const countAfterFirst = normalizedNotes(ctx).length;
  await runMigrations(ctx);
  assert.equal(normalizedNotes(ctx).length, countAfterFirst);
});

await test('normal exercises: metadata defaults and ids stay stable', async () => {
  const store = buildNormalExerciseStore();
  const ctx = createFakeCtx({
    exerciseStore: store,
    settings: {},
    attachments: new Map(),
  });
  const beforeIds = store.items.map((item) => item.id);
  await runMigrations(ctx);
  const items = normalizedExerciseItems(ctx);
  assert.deepEqual(items.map((item) => item.id).sort(), beforeIds.sort());
  const pdf = items.find((item) => item.id === 'ex-normal-pdf');
  assert.equal(pdf.materialType, 'pdf');
  const gp = items.find((item) => item.id === 'ex-normal-gp');
  assert.equal(gp.instrument, 'guitar');
  assert.equal(gp.materialType, 'tab');
  const url = items.find((item) => item.id === 'ex-normal-url');
  assert.equal(url.materialType, 'link');
});

await test('duplicate fileName exercises: both items remain', async () => {
  const ctx = createFakeCtx({
    exerciseStore: buildDuplicateFileNameExercises(),
    settings: {},
  });
  await runMigrations(ctx);
  assert.equal(normalizedExerciseItems(ctx).length, 2);
});

await test('partial legacy exercise: metadata fields fill in', async () => {
  const ctx = createFakeCtx({
    exerciseStore: buildPartialLegacyExercise(),
    settings: {},
  });
  await runMigrations(ctx);
  const item = normalizedExerciseItems(ctx)[0];
  assert.equal(item.instrument, '');
  assert.equal(item.materialType, 'pdf');
});

await test('already-migrated exercise instrument is not overwritten', async () => {
  const ctx = createFakeCtx({
    exerciseStore: buildNormalExerciseStore(),
    settings: {},
    attachments: new Map(),
  });
  await runMigrations(ctx);
  const item = normalizedExerciseItems(ctx).find((row) => row.id === 'ex-normal-instrument');
  assert.equal(item.instrument, 'bass');
  assert.equal(ctx.state.exerciseStore.items.find((row) => row.id === 'ex-normal-instrument').instrument, 'bass');
});

await test('broken exercise attachment: item is not deleted', async () => {
  const ctx = createFakeCtx({
    exerciseStore: buildNormalExerciseStore(),
    settings: {},
    attachments: new Map(),
  });
  await runMigrations(ctx);
  assert.ok(normalizedExerciseItems(ctx).some((item) => item.id === 'ex-broken-att'));
});

await test('drums empty inbox: apply creates no exercises', async () => {
  const ctx = createFakeCtx(buildEmptyData());
  await runMigrations(ctx);
  assert.equal(ctx.exercises.readStore().items.length, 0);
});

await test('drums normal data: one exercise per eligible pattern', async () => {
  const patterns = buildNormalDrumPatterns();
  const ctx = createFakeCtx({
    settings: { 'drums.favorites': ['builtin-rock-groove-01'] },
    drumPatterns: patterns,
    exerciseStore: { categories: [], items: [] },
    attachments: new Map(),
  });
  const patternsBefore = clone(patterns);
  await runMigrations(ctx);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-normal-beat-001'), 1);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-normal-fill-001'), 1);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'builtin-rock-groove-01'), 1);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-partial-tags'), 1);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-broken-steps'), 1);
  assertSourceRecordsIntact(patternsBefore, ctx.state.drumPatterns);
});

await test('drums duplicate titles with different ids create distinct sourceRef values', async () => {
  const patterns = [
    {
      id: 'usr-dup-title-a',
      title: 'Same title',
      category: 'beat',
      style: 'rock',
      tags: ['rock'],
      difficulty: 1,
      bpmRange: [80, 100],
      meter: '4/4',
      subdivision: 'eighth',
      bars: 1,
      stepsPerBar: 8,
      steps: [{ instrument: 'kick', step: 0, velocity: 100 }],
      tab: 'K o | | |\n',
      builtin: false,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'usr-dup-title-b',
      title: 'Same title',
      category: 'beat',
      style: 'rock',
      tags: ['rock'],
      difficulty: 1,
      bpmRange: [80, 100],
      meter: '4/4',
      subdivision: 'eighth',
      bars: 1,
      stepsPerBar: 8,
      steps: [{ instrument: 'kick', step: 0, velocity: 100 }],
      tab: 'K o | | |\n',
      builtin: false,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
  ];
  const ctx = createFakeCtx({
    settings: {},
    drumPatterns: patterns,
    exerciseStore: { categories: [], items: [] },
    attachments: new Map(),
  });
  await runMigrations(ctx);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-dup-title-a'), 1);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, 'usr-dup-title-b'), 1);
});

await test('drums already-migrated pattern is skipped', async () => {
  const patternId = 'usr-normal-beat-001';
  const pattern = buildNormalDrumPatterns().find((row) => row.id === patternId);
  const ctx = createFakeCtx({
    settings: {},
    drumPatterns: [pattern],
    exerciseStore: {
      categories: [],
      items: [buildMigratedDrumExercise(patternId)],
    },
    attachments: new Map(),
  });
  const before = ctx.exercises.readStore().items.length;
  await runMigrations(ctx);
  assert.equal(ctx.exercises.readStore().items.length, before);
  assert.equal(countExercisesForSourceRef(ctx.exercises.readStore().items, patternId), 1);
});

await test('drums repeated run creates no duplicate exercises', async () => {
  const ctx = createFakeCtx({
    settings: { 'drums.favorites': ['builtin-rock-groove-01'] },
    drumPatterns: buildNormalDrumPatterns(),
    exerciseStore: { categories: [], items: [] },
    attachments: new Map(),
  });
  await runMigrations(ctx);
  const countAfterFirst = ctx.exercises.readStore().items.length;
  await runMigrations(ctx);
  assert.equal(ctx.exercises.readStore().items.length, countAfterFirst);
});

await test('large data set: migrations finish without duplicate ids', async () => {
  const ctx = createFakeCtx(buildLargeData());
  await runMigrations(ctx);
  assertNoDuplicateIds(normalizedNotes(ctx));
  assertNoDuplicateIds(normalizedExerciseItems(ctx));
});

await test('failed verify leaves id out of migrations.applied', async () => {
  const failMigration = {
    id: 'test-fail-verify.v1',
    version: 1,
    describe: () => 'Forced verify failure for runner test.',
    async detect() {
      return { needed: true, count: 1, reason: 'test' };
    },
    async apply() {
      return { created: 0, updated: 0, skipped: 0 };
    },
    async verify() {
      return { ok: false, problems: ['forced failure'] };
    },
  };
  const ctx = createFakeCtx(buildEmptyData());
  const report = await runRegistry(ctx, [failMigration]);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].stage, 'verify');
  assertNotApplied(ctx.settings.read, 'test-fail-verify.v1');
});

await test('thrown apply does not stop later migrations', async () => {
  const throwMigration = {
    id: 'test-throw-apply.v1',
    version: 1,
    describe: () => 'Forced apply throw for runner test.',
    async detect() {
      return { needed: true, count: 1, reason: 'test' };
    },
    async apply() {
      throw new Error('apply boom');
    },
    async verify() {
      return { ok: true, problems: [] };
    },
  };
  const okMigration = {
    id: 'test-ok-after-throw.v1',
    version: 1,
    describe: () => 'Runs after a thrown apply.',
    async detect() {
      return { needed: false, count: 0, reason: 'ok' };
    },
    async apply() {
      return { created: 0, updated: 0, skipped: 0 };
    },
    async verify() {
      return { ok: true, problems: [] };
    },
  };
  const ctx = createFakeCtx(buildEmptyData());
  const report = await runRegistry(ctx, [throwMigration, okMigration]);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].stage, 'apply');
  assertAppliedList(ctx.settings.read, ['test-ok-after-throw.v1']);
  assertNotApplied(ctx.settings.read, 'test-throw-apply.v1');
});

await test('runner never deletes drum pattern source records', async () => {
  const patterns = buildNormalDrumPatterns();
  const ctx = createFakeCtx({
    settings: { 'drums.favorites': ['builtin-rock-groove-01'] },
    drumPatterns: patterns,
    exerciseStore: { categories: [], items: [] },
    attachments: new Map(),
  });
  const before = clone(patterns);
  await runMigrations(ctx);
  assert.deepEqual(ctx.state.drumPatterns, before);
});

await test('per-migration verify passes on normal fixture rows', async () => {
  const ctx = createFakeCtx(buildNormalData());
  const notesResult = await notesUnfiled.verify(ctx);
  assert.equal(notesResult.ok, true);
  const exerciseResult = await exerciseMetadata.verify(ctx);
  assert.equal(exerciseResult.ok, true);
  await drumsToExercises.apply(ctx);
  const drumsResult = await drumsToExercises.verify(ctx);
  assert.equal(drumsResult.ok, true);
});

console.log(`migrations tests: ${passed} passed`);
