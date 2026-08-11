/**
 * Study workspace Phase 4 tests.
 * Run: node tests/study-workspace/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomShim } from '../gp-player/domShim.mjs';
import { installLocalStorageShim } from '../shared/localStorageShim.mjs';
import { runInspectorTests } from './inspector.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

installDomShim();
const { reset: resetStorage } = installLocalStorageShim();
globalThis.window = globalThis;

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function sectionIdsFromHtml() {
  const ids = new Set();
  const re = /id="(sec-[^"]+)"/g;
  let m;
  while ((m = re.exec(indexHtml))) ids.add(m[1]);
  return ids;
}

const {
  STUDY_SECTIONS,
  HARMONY_EXPLORE_VIEWS,
  harmonySectionForView,
  buildReviewQueue,
  buildLearnModel,
} = await import('../../js/workspaces/study.js');

const { dueStudyReviews, logAttempt, recordStudyMiss, clearProgressLog, invalidateProgressLogCache } = await import('../../js/progress/progressLog.js');
const { STUDY_CATALOG } = await import('../../js/studyCatalog.js');

test('STUDY_SECTIONS maps every explore view to a sec-* id in index.html', () => {
  const htmlSections = sectionIdsFromHtml();
  assert.ok(htmlSections.has(STUDY_SECTIONS.learn.sectionId));
  Object.entries(STUDY_SECTIONS.explore).forEach(([view, mapping]) => {
    assert.ok(mapping.sectionId, `missing section for ${view}`);
    assert.ok(htmlSections.has(mapping.sectionId), `${mapping.sectionId} not in index.html for view=${view}`);
    assert.ok(mapping.featureId);
  });
});

test('Harmony chip row resolves chords, triads, circle to correct sections', () => {
  assert.deepEqual(HARMONY_EXPLORE_VIEWS, ['chords', 'triads', 'circle']);
  assert.equal(harmonySectionForView('chords').sectionId, 'sec-chords');
  assert.equal(harmonySectionForView('triads').sectionId, 'sec-triads');
  assert.equal(harmonySectionForView('circle').sectionId, 'sec-circle');
  assert.equal(harmonySectionForView('bogus').sectionId, 'sec-chords');
});

test('buildLearnModel picker puts Major-Scale Construction first and recommends next', () => {
  const model = buildLearnModel({
    progress: {
      version: 1,
      concepts: {},
      recentStudies: [],
      lastPrimaryId: null,
      lastPrimaryAt: 0,
    },
    recommendations: {
      primary: { id: 'interval-locations', title: 'Interval Location Drill' },
      alternates: [],
    },
  });
  assert.equal(model.mode, 'picker');
  assert.equal(model.paths[0].id, 'major-scale-construction');
  assert.equal(model.recommendedNext.id, 'interval-locations');
});

test('buildLearnModel active path reports position and next recommendation', () => {
  const model = buildLearnModel({
    progress: {
      version: 1,
      concepts: {},
      recentStudies: [{ id: 'major-scale-construction', at: Date.now() }],
      lastPrimaryId: 'major-scale-construction',
      lastPrimaryAt: Date.now(),
    },
    recommendations: {
      primary: { id: 'major-scale-construction', title: 'Major-Scale Construction' },
      alternates: [{ id: 'interval-locations', title: 'Interval Location Drill' }],
    },
  });
  assert.equal(model.mode, 'active');
  assert.equal(model.activePath.id, 'major-scale-construction');
  assert.equal(model.position, 1);
  assert.equal(model.recommendedNext.id, 'interval-locations');
});

test('buildReviewQueue orders due concepts first and returns empty state', () => {
  resetStorage();
  clearProgressLog();
  invalidateProgressLogCache();

  const base = Date.UTC(2026, 4, 1, 12, 0, 0);
  recordStudyMiss('major_scale', { kind: 'miss', prompt: 'Spell C major', answer: 'C D E', responseMs: 3000 });

  const due = dueStudyReviews(base + 86400000);
  const queue = buildReviewQueue(base + 86400000, {
    due,
    progress: {
      version: 1,
      concepts: {
        major_scale: { lastReviewedAt: base, completions: 1, misses: 2, hintHeavy: 0 },
        interval_locations: { lastReviewedAt: base, completions: 3, misses: 0, hintHeavy: 3 },
      },
      recentStudies: [],
      lastPrimaryId: null,
      lastPrimaryAt: 0,
    },
  });

  assert.ok(!queue.empty);
  assert.equal(queue.items[0].conceptId, 'major_scale');
  assert.ok(queue.items.some((i) => i.conceptId === 'interval_locations'));
  assert.ok(queue.items[0].prompt);

  logAttempt({
    targetType: 'study-concept',
    targetId: 'major_scale',
    startedAt: new Date(base + 86400000).toISOString(),
    status: 'green',
  });
  const afterSuccess = dueStudyReviews(base + 2 * 86400000);
  assert.ok(!afterSuccess.some((d) => d.conceptId === 'major_scale'));

  recordStudyMiss('major_scale', { kind: 'miss', prompt: 'p', answer: 'a', responseMs: 1 });
  const afterMiss = buildReviewQueue(base + 3 * 86400000, {
    due: dueStudyReviews(base + 3 * 86400000),
    progress: {
      version: 1,
      concepts: { major_scale: { misses: 3, completions: 1, hintHeavy: 0, lastReviewedAt: base } },
      recentStudies: [],
      lastPrimaryId: null,
      lastPrimaryAt: 0,
    },
  });
  assert.ok(afterMiss.items.some((i) => i.conceptId === 'major_scale'));

  const empty = buildReviewQueue(base, { due: [], progress: { version: 1, concepts: {}, recentStudies: [], lastPrimaryId: null, lastPrimaryAt: 0 } });
  assert.equal(empty.empty, true);
  assert.equal(empty.items.length, 0);
});

runInspectorTests(test);

console.log(`\n# tests ${passed}`);
console.log(`# pass ${passed}`);
console.log(`# fail 0`);
