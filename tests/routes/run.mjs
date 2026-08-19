/**
 * Zero-dependency Node tests for route resolution.
 * Run: node tests/routes/run.mjs
 */

import assert from 'node:assert/strict';
import {
  resolveRoute,
  isKnownRoute,
  defaultModeFor,
  ROUTE_IDS,
  AREA_ROUTE_IDS,
  TOOL_ROUTE_IDS,
  DEFAULT_ROUTE_ID,
} from '../../js/routeMap.js';
import { TOOLS, AREAS, getTool, sectionIdForTool } from '../../js/tools.js';
import { shouldKeepLibraryPlayer, libraryRouteParams } from '../../js/library/libraryPlayerRoute.js';
import { parseAppRoute, buildAppRoute, routeUrl, sameRoute, routeLayerDepth } from '../../js/appRoute.js';

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

console.log('Route catalogue');
test('routes are the four areas plus every tool', () => {
  assert.deepEqual(AREA_ROUTE_IDS, ['train', 'study', 'create', 'library']);
  assert.deepEqual(TOOL_ROUTE_IDS, TOOLS.map(t => t.id));
  assert.deepEqual(ROUTE_IDS, [...AREA_ROUTE_IDS, ...TOOL_ROUTE_IDS]);
});

test('a route id is also a tool id and a DOM section id', () => {
  for (const tool of TOOLS) {
    assert.equal(isKnownRoute(tool.id), true, `${tool.id} is not a route`);
    assert.equal(sectionIdForTool(tool.id), `sec-${tool.id}`);
  }
});

test('removed tools have no route', () => {
  for (const id of ['ear', 'practice', 'tracktosheet', 'scales', 'fretboard',
                    'intervalorbit', 'intervalmap', 'fretmap', 'timing', 'drums',
                    'routines', 'studylab', 'tools', 'reference', 'home',
                    'tuner', 'recorder', 'songwriter', 'gpplayer', 'musicprefs',
                    'scalelab', 'tabanalyzer', 'chords']) {
    assert.equal(isKnownRoute(id), false, `${id} should not be a route`);
  }
});

console.log('Resolution');
test('an empty hash opens the default area', () => {
  assert.deepEqual(resolveRoute({ id: '', params: {} }), { id: DEFAULT_ROUTE_ID, params: {} });
  assert.equal(DEFAULT_ROUTE_ID, 'train');
});

test('an unknown hash opens the default area and adds no notice', () => {
  const result = resolveRoute({ id: 'no-such-screen', params: { mode: 'x' } });
  assert.deepEqual(result, { id: DEFAULT_ROUTE_ID, params: {} });
  assert.equal('notice' in result, false);
});

test('an area route keeps its params and gains no mode', () => {
  for (const area of AREAS) {
    assert.deepEqual(resolveRoute({ id: area.id, params: {} }), { id: area.id, params: {} });
  }
});

test('a tool with modes gains its default mode', () => {
  assert.deepEqual(resolveRoute({ id: 'pitchear', params: {} }), {
    id: 'pitchear',
    params: { mode: 'tuner' },
  });
  assert.deepEqual(resolveRoute({ id: 'metronome', params: {} }), {
    id: 'metronome',
    params: { mode: 'metronome' },
  });
  assert.deepEqual(resolveRoute({ id: 'audiostudio', params: {} }), {
    id: 'audiostudio',
    params: { mode: 'capture' },
  });
});

test('a tool with modes keeps a mode it owns', () => {
  assert.deepEqual(resolveRoute({ id: 'pitchear', params: { mode: 'ear' } }), {
    id: 'pitchear',
    params: { mode: 'ear' },
  });
  assert.deepEqual(resolveRoute({ id: 'metronome', params: { mode: 'plan' } }), {
    id: 'metronome',
    params: { mode: 'plan' },
  });
  assert.deepEqual(resolveRoute({ id: 'audiostudio', params: { mode: 'transcribe' } }), {
    id: 'audiostudio',
    params: { mode: 'transcribe' },
  });
});

test('a mode the tool does not own falls back to the default mode', () => {
  assert.deepEqual(resolveRoute({ id: 'metronome', params: { mode: 'nope' } }), {
    id: 'metronome',
    params: { mode: 'metronome' },
  });
});

test('a tool without modes carries no mode param', () => {
  assert.deepEqual(resolveRoute({ id: 'circle', params: { mode: 'x' } }), {
    id: 'circle',
    params: {},
  });
  assert.equal(defaultModeFor('circle'), '');
});

test('every declared default mode is one of the tool modes', () => {
  for (const tool of TOOLS) {
    if (!Array.isArray(tool.modes) || !tool.modes.length) continue;
    const ids = tool.modes.map(m => m.id);
    assert.ok(ids.includes(tool.defaultMode), `${tool.id} default ${tool.defaultMode}`);
  }
});

console.log('Library routes');
test('Exercises and Workbooks are their own routes under Library', () => {
  assert.equal(getTool('exercises').area, 'library');
  assert.equal(getTool('workbooks').area, 'library');
  assert.deepEqual(resolveRoute({ id: 'workbooks', params: { workbook: 'wb-1' } }), {
    id: 'workbooks',
    params: { workbook: 'wb-1' },
  });
});

test('shouldKeepLibraryPlayer follows the workbook and exercise params', () => {
  assert.equal(shouldKeepLibraryPlayer('workbooks', { workbook: 'wb-1' }), true);
  assert.equal(shouldKeepLibraryPlayer('workbooks', {}), false);
  assert.equal(shouldKeepLibraryPlayer('exercises', { exercise: 'ex-1' }), true);
  assert.equal(shouldKeepLibraryPlayer('exercises', {}), false);
});

test('libraryRouteParams keeps only the hierarchy params that are set', () => {
  assert.deepEqual(libraryRouteParams({ workbook: 'wb-1', exercise: 'ex-1' }), {
    workbook: 'wb-1',
    exercise: 'ex-1',
  });
  assert.deepEqual(libraryRouteParams({}), {});
});

console.log('Hash round trip');
test('parseAppRoute and buildAppRoute round-trip a workbook player hash', () => {
  const params = { workbook: 'wb-1', exercise: 'wbe-1' };
  const parsed = parseAppRoute('#workbooks?workbook=wb-1&exercise=wbe-1');
  assert.equal(parsed.id, 'workbooks');
  assert.deepEqual(parsed.params, params);
  const built = buildAppRoute({ id: 'workbooks', params });
  const roundTrip = parseAppRoute(`#${built}`);
  assert.equal(roundTrip.id, 'workbooks');
  assert.deepEqual(roundTrip.params, params);
});

test('routeUrl writes a hash for every screen and the base path for none', () => {
  const loc = { pathname: '/app/', search: '?view=1' };
  assert.equal(routeUrl({ id: '', params: {} }, loc), '/app/?view=1');
  assert.equal(routeUrl({ id: 'train', params: {} }, loc), '/app/?view=1#train');
  assert.equal(
    routeUrl({ id: 'pitchear', params: { mode: 'ear' } }, loc),
    '/app/?view=1#pitchear?mode=ear',
  );
});

test('sameRoute ignores key order', () => {
  assert.equal(sameRoute(
    { id: 'workbooks', params: { workbook: 'w', exercise: 'e' } },
    { id: 'workbooks', params: { exercise: 'e', workbook: 'w' } },
  ), true);
  assert.equal(sameRoute({ id: 'train', params: {} }, { id: 'study', params: {} }), false);
});

console.log('Library layer depth');
test('routeLayerDepth counts the library screens below the landing page', () => {
  assert.equal(routeLayerDepth({}), 0);
  assert.equal(routeLayerDepth({ mode: 'plan' }), 0);
  assert.equal(routeLayerDepth({ folder: 'cat1' }), 1);
  assert.equal(routeLayerDepth({ folder: 'cat1', exercise: 'ex1' }), 2);
  assert.equal(routeLayerDepth({ workbook: 'wb1', exercise: 'e1', companion: 'c1' }), 3);
});

test('a folder is part of a library address', () => {
  assert.deepEqual(libraryRouteParams({ folder: 'cat1' }), { folder: 'cat1' });
  assert.deepEqual(
    libraryRouteParams({ folder: 'cat1', exercise: 'ex1' }),
    { folder: 'cat1', exercise: 'ex1' },
  );
  assert.equal(buildAppRoute({ id: 'exercises', params: { exercise: 'ex1', folder: 'cat1' } }),
    'exercises?folder=cat1&exercise=ex1');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
