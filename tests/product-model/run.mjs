/**
 * Zero-dependency Node tests for the Musi product model:
 * Train, Study, Create, Library, and the subordinate Utilities.
 *
 * These tests read the shipped source files, so they fail if a removed tool
 * comes back or a stale id survives in active code.
 *
 * Run: node tests/product-model/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOLS,
  AREAS,
  UTILITY_AREA,
  CONTEXT_FIELDS,
  getArea,
  getTool,
  isPrimaryArea,
  isUtility,
  toolsInArea,
  utilityTools,
  toolContextFields,
} from '../../js/tools.js';
import { PRIMARY_NAV_ITEMS, utilityNavItems, navHighlightId } from '../../js/shell/nav.js';
import { isKnownRoute } from '../../js/routeMap.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function ids(list) {
  return list.map(t => t.id);
}

/** Every source file the browser loads, plus the tests, minus vendored code. */
function sourceFiles() {
  const out = [];
  const skipDirs = new Set(['.git', 'node_modules', 'vendor', 'specs', '.specify', '.minispec', '.cursor']);
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (skipDirs.has(entry)) continue;
        walk(full);
        continue;
      }
      if (/\.(js|mjs|html|css)$/.test(entry)) out.push(full);
    }
  })(join(ROOT, 'js'));
  for (const extra of ['index.html', 'service-worker.js']) {
    out.push(join(ROOT, extra));
  }
  (function walkCss(dir) {
    for (const entry of readdirSync(dir)) out.push(join(dir, entry));
  })(join(ROOT, 'css'));
  return out;
}

const SOURCES = sourceFiles().map(path => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
}));

console.log('Areas');
test('there are exactly four primary areas', () => {
  assert.deepEqual(ids(AREAS), ['train', 'study', 'create', 'library']);
});

test('Reference is not a primary area', () => {
  assert.equal(isPrimaryArea('reference'), false);
  assert.equal(getArea('reference'), null);
  assert.equal(TOOLS.some(t => t.area === 'reference'), false);
});

test('Utilities are not a primary area', () => {
  assert.equal(isPrimaryArea(UTILITY_AREA.id), false);
  assert.equal(getArea(UTILITY_AREA.id), UTILITY_AREA);
});

console.log('Tool classification');
test('Train holds the four drills and the Practice Lab', () => {
  assert.deepEqual(ids(toolsInArea('train')),
    ['intervals', 'sightreading', 'chordworkout', 'pitchear', 'practicelab']);
});

test('Study holds the references', () => {
  assert.deepEqual(ids(toolsInArea('study')),
    ['scaleref', 'chordref', 'chordfinder', 'triads', 'circle', 'drumtab']);
});

test('Create holds the three writing tools', () => {
  assert.deepEqual(ids(toolsInArea('create')),
    ['audiostudio', 'songstudio', 'notes']);
});

test('Library holds Exercises and Workbooks', () => {
  assert.deepEqual(ids(toolsInArea('library')), ['exercises', 'workbooks']);
});

test('Utilities hold the four supporting tools', () => {
  assert.deepEqual(ids(utilityTools()),
    ['metronome', 'keyboard', 'scoreplayer', 'settings']);
  for (const tool of utilityTools()) {
    assert.equal(isUtility(tool.id), true);
    assert.equal(tool.area, 'utility');
  }
});

test('one classification field only: no category and no purpose', () => {
  for (const tool of TOOLS) {
    assert.equal('category' in tool, false, `${tool.id} keeps category`);
    assert.equal('purpose' in tool, false, `${tool.id} keeps purpose`);
    assert.equal(typeof tool.area, 'string');
  }
});

console.log('Consolidated tools');
test('Ear lives inside Pitch & Ear', () => {
  assert.equal(getTool('ear'), null);
  const modes = getTool('pitchear').modes.map(m => m.id);
  assert.deepEqual(modes, ['tuner', 'tone', 'match', 'runner', 'ear']);
});

test('the tempo plan lives inside the Metronome', () => {
  assert.equal(getTool('practice'), null);
  assert.deepEqual(getTool('metronome').modes.map(m => m.id), ['metronome', 'plan']);
});

test('the Practice Lab holds a session mode, a theory mode, and a history mode', () => {
  assert.deepEqual(getTool('practicelab').modes.map(m => m.id), ['session', 'theory', 'history']);
  assert.equal(getTool('practicelab').defaultMode, 'session');
});

test('transcription lives inside Audio Studio', () => {
  assert.equal(getTool('tracktosheet'), null);
  assert.deepEqual(getTool('audiostudio').modes.map(m => m.id),
    ['capture', 'analyze', 'transcribe']);
});

console.log('Navigation');
test('primary navigation exposes Train, Study, Create, and Library', () => {
  assert.deepEqual(PRIMARY_NAV_ITEMS.map(item => item.id),
    ['train', 'study', 'create', 'library']);
  for (const item of PRIMARY_NAV_ITEMS) {
    assert.ok(item.label, `${item.id} has no label`);
    assert.ok(item.icon, `${item.id} has no icon`);
  }
});

test('utilities stay reachable from a secondary menu', () => {
  assert.deepEqual(utilityNavItems().map(item => item.id),
    ['metronome', 'keyboard', 'scoreplayer', 'settings']);
});

test('a tool highlights its area; a utility highlights nothing', () => {
  assert.equal(navHighlightId('triads'), 'study');
  assert.equal(navHighlightId('workbooks'), 'library');
  assert.equal(navHighlightId('train'), 'train');
  assert.equal(navHighlightId('metronome'), null);
  assert.equal(navHighlightId('settings'), null);
  assert.equal(navHighlightId(''), null);
});

console.log('Shared musical context');
test('the context fields are root, scale, tempo, and tuning', () => {
  assert.deepEqual(CONTEXT_FIELDS, ['root', 'scale', 'tempo', 'tuning']);
});

test('each tool declares the context fields it reads', () => {
  assert.deepEqual(toolContextFields('scaleref'), ['root', 'scale', 'tuning']);
  assert.deepEqual(toolContextFields('triads'), ['root', 'scale', 'tempo', 'tuning']);
  assert.deepEqual(toolContextFields('pitchear'), ['root', 'scale', 'tempo', 'tuning']);
  assert.deepEqual(toolContextFields('chordfinder'), ['tuning']);
  assert.deepEqual(toolContextFields('metronome'), ['tempo']);
  assert.deepEqual(toolContextFields('notes'), []);
  assert.deepEqual(toolContextFields('practicelab'), ['root', 'scale', 'tuning']);
});

test('no tool depends on every context field by default', () => {
  const all = TOOLS.filter(t => t.context.length === CONTEXT_FIELDS.length);
  assert.ok(all.length < TOOLS.length, 'every tool reads the whole context');
});

console.log('Every tool page exists in the DOM');
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
test('index.html has one section per tool and one per area', () => {
  for (const tool of TOOLS) {
    assert.ok(indexHtml.includes(`id="sec-${tool.id}"`), `no section for ${tool.id}`);
  }
  for (const area of AREAS) {
    assert.ok(indexHtml.includes(`id="sec-${area.id}"`), `no section for ${area.id}`);
  }
});

console.log('No legacy layer and no dead references');
const REMOVED_MODULES = [
  'js/routines.js', 'js/routineModel.js', 'js/routineNav.js', 'js/routineRoute.js',
  'js/routineDashboardModel.js', 'js/studyLab.js', 'js/studyLabMic.js',
  'js/studyLabModel.js', 'js/studyCatalog.js', 'js/studyProgress.js',
  'js/curriculum.js', 'js/fretboardTrainer.js', 'js/timingDrill.js',
  'js/intervalOrbit.js', 'js/practiceTimer.js', 'js/scaleQuiz.js',
  'js/routeSection.js', 'js/home.js', 'js/tools/home.js', 'js/tools/homeModel.js',
  'js/drums/drumsUI.js', 'js/interval-map/ui.js', 'js/riffGenerator.js',
  'js/backingTrack.js',
];

test('deprecated modules are deleted, not commented out', () => {
  for (const path of REMOVED_MODULES) {
    assert.equal(existsSync(join(ROOT, path)), false, `${path} still exists`);
  }
});

// Names that belong to a removed feature and to nothing else. A same-named
// file in another folder (js/exerciseCompanions/intervalOrbit.js is a live
// workbook companion) is not on this list.
const REMOVED_FEATURE_NAMES = [
  'routineModel', 'routineNav', 'routineRoute', 'routineDashboardModel',
  'studyLab', 'studyCatalog', 'studyProgress',
  'fretboardTrainer', 'timingDrill', 'practiceTimer', 'scaleQuiz',
  'routeSection', 'homeModel', 'drumsUI', 'riffGenerator', 'backingTrack',
  'LEGACY_ROUTES', 'SIMPLIFY:',
];

test('no source file names a removed feature', () => {
  for (const { path, text } of SOURCES) {
    for (const name of REMOVED_FEATURE_NAMES) {
      assert.equal(text.includes(name), false, `${path} names ${name}`);
    }
  }
});

const REMOVED_SECTION_IDS = [
  'sec-ear', 'sec-practice', 'sec-tracktosheet', 'sec-scales', 'sec-fretboard',
  'sec-intervalorbit', 'sec-timing', 'sec-drums', 'sec-routines', 'sec-studylab',
  'sec-tools', 'sec-home', 'sec-hub-train', 'sec-hub-reference', 'sec-hub-create',
  'sec-hub-tools', 'sec-tuner', 'sec-recorder', 'sec-songwriter', 'sec-gpplayer',
  'sec-musicprefs', 'sec-chords', 'sec-chordlab', 'sec-backing', 'sec-riff',
];

test('no source file references a removed section id', () => {
  for (const { path, text } of SOURCES) {
    for (const id of REMOVED_SECTION_IDS) {
      const hit = new RegExp(`\\b${id}\\b`).test(text);
      assert.equal(hit, false, `${path} references ${id}`);
    }
  }
});

test('every navigation call names a route that exists', () => {
  // Catches a call left on an old id, which would silently land on the
  // default screen instead of the tool the caller wanted.
  const callPattern = /(?:showSection|showSectionFn|openSectionFn)\??\.?\(\s*'([a-z-]+)'/g;
  for (const { path, text } of SOURCES) {
    if (!path.endsWith('.js')) continue;
    for (const match of text.matchAll(callPattern)) {
      assert.equal(isKnownRoute(match[1]), true, `${path} navigates to ${match[1]}`);
    }
  }
});

test('there is no legacy route table, redirect map, or route notice', () => {
  const routeMap = readFileSync(join(ROOT, 'js/routeMap.js'), 'utf8');
  for (const banned of ['LEGACY_ROUTES', 'legacyGroupToCategory', 'notice.', 'SECTION_ALIASES']) {
    assert.equal(routeMap.includes(banned), false, `routeMap still has ${banned}`);
  }
  assert.equal(indexHtml.includes('route-notice'), false, 'index.html still has the notice banner');
  assert.equal(existsSync(join(ROOT, 'css/route-notice.css')), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
