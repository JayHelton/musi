/**
 * Zero-dependency Node tests for routine route parsing and repair.
 * Run: node tests/routine-nav/run.mjs
 */

import assert from 'node:assert/strict';
import {
  installWindowShim,
  installDocumentShim,
} from '../cloud/harness.mjs';
import {
  parseAppRoute,
  buildAppRoute,
  routeUrl,
  sameRoute,
} from '../../js/appRoute.js';
import {
  ROUTINE_ROUTE_ID,
  ROUTINE_PARAM_KEYS,
  parseRoutineRoute,
  buildRoutineParams,
  routeLayer,
  parentRoute,
  routeDepth,
  resolveRoutineRoute,
} from '../../js/routineRoute.js';

installWindowShim();
installDocumentShim();
globalThis.window.scrollY = 0;
globalThis.window.scrollTo = () => {};
globalThis.requestAnimationFrame = (fn) => {
  fn();
  return 0;
};

const hostElements = new Map();
globalThis.document.getElementById = (id) => {
  if (!hostElements.has(id)) {
    hostElements.set(id, { textContent: '', scrollTop: 0, setAttribute() {}, focus() {} });
  }
  return hostElements.get(id);
};

const { createRoutineNavigator } = await import('../../js/routineNav.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const FAKE_LOCATION = { pathname: '/app/', search: '?view=1' };

function makeFindCompanion(workbooksById) {
  return (session, companionId) => {
    const ids = Array.isArray(session.workbookIds) ? session.workbookIds : [];
    for (const workbookId of ids) {
      const workbook = workbooksById[workbookId];
      if (!workbook) continue;
      const companions = Array.isArray(workbook.companions) ? workbook.companions : [];
      const companion = companions.find(item => item && item.id === companionId);
      if (companion) return { workbook, companion };
    }
    return null;
  };
}

test('parseAppRoute accepts a value without a leading hash', () => {
  assert.deepEqual(parseAppRoute('routines'), { id: 'routines', params: {} });
});

test('parseAppRoute accepts a value with a leading hash', () => {
  assert.deepEqual(parseAppRoute('#routines?routine=r1&session=s1'), {
    id: 'routines',
    params: { routine: 'r1', session: 's1' },
  });
});

test('parseAppRoute returns an empty route for an empty value', () => {
  assert.deepEqual(parseAppRoute(''), { id: '', params: {} });
  assert.deepEqual(parseAppRoute('#'), { id: '', params: {} });
});

test('parseAppRoute decodes a percent-encoded id', () => {
  assert.deepEqual(parseAppRoute('routines?routine=rt%2Dguitar'), {
    id: 'routines',
    params: { routine: 'rt-guitar' },
  });
});

test('parseAppRoute keeps the last value when a key repeats', () => {
  assert.deepEqual(parseAppRoute('routines?routine=r1&routine=r2'), {
    id: 'routines',
    params: { routine: 'r2' },
  });
});

test('parseAppRoute drops a pair with an empty key or an empty value', () => {
  assert.deepEqual(parseAppRoute('routines?=bad&key=&routine=r1&session='), {
    id: 'routines',
    params: { routine: 'r1' },
  });
});

test('buildAppRoute omits the query part for an empty parameter set', () => {
  assert.equal(buildAppRoute({ id: 'routines', params: {} }), 'routines');
});

test('buildAppRoute writes routine keys in the fixed order', () => {
  const built = buildAppRoute({
    id: 'routines',
    params: {
      companion: 'cmp-1',
      routine: 'r1',
      exercise: 'ex-1',
      session: 's1',
      workbook: 'wb-1',
    },
  });
  assert.equal(
    built,
    'routines?routine=r1&session=s1&workbook=wb-1&exercise=ex-1&companion=cmp-1',
  );
});

test('buildAppRoute writes extra keys in alphabetical order after the fixed keys', () => {
  const built = buildAppRoute({
    id: 'routines',
    params: {
      routine: 'r1',
      zebra: 'z1',
      alpha: 'a1',
    },
  });
  assert.equal(built, 'routines?routine=r1&alpha=a1&zebra=z1');
});

test('buildAppRoute then parseAppRoute returns the same route', () => {
  const route = {
    id: 'routines',
    params: {
      routine: 'rt-1',
      session: 'rs-1',
      workbook: 'wb-1',
      exercise: 'ex-2',
      extra: 'note',
    },
  };
  const roundTrip = parseAppRoute(`#${buildAppRoute(route)}`);
  assert.equal(roundTrip.id, route.id);
  assert.deepEqual(roundTrip.params, route.params);
});

test('routeUrl returns the base path for home', () => {
  assert.equal(
    routeUrl({ id: 'home', params: { routine: 'r1' } }, FAKE_LOCATION),
    '/app/?view=1',
  );
});

test('routeUrl returns the base path for an empty id', () => {
  assert.equal(routeUrl({ id: '', params: {} }, FAKE_LOCATION), '/app/?view=1');
});

test('routeUrl appends a hash fragment for another id', () => {
  assert.equal(
    routeUrl({ id: 'routines', params: { routine: 'r1' } }, FAKE_LOCATION),
    '/app/?view=1#routines?routine=r1',
  );
});

test('sameRoute treats equal routes with different key order as equal', () => {
  const a = { id: 'routines', params: { routine: 'r1', session: 's1' } };
  const b = { id: 'routines', params: { session: 's1', routine: 'r1' } };
  assert.equal(sameRoute(a, b), true);
});

test('sameRoute returns false for different routes', () => {
  const a = { id: 'routines', params: { routine: 'r1' } };
  const b = { id: 'routines', params: { routine: 'r2' } };
  assert.equal(sameRoute(a, b), false);
});

test('routeLayer returns list for no routine', () => {
  assert.equal(routeLayer({ routine: null, session: null, workbook: null, exercise: null, companion: null }), 'list');
});

test('routeLayer returns routine for routine only', () => {
  assert.equal(routeLayer({ routine: 'r1', session: null, workbook: null, exercise: null, companion: null }), 'routine');
});

test('routeLayer returns session for routine and session', () => {
  assert.equal(routeLayer({ routine: 'r1', session: 's1', workbook: null, exercise: null, companion: null }), 'session');
});

test('routeLayer returns workbook for routine session and workbook', () => {
  assert.equal(routeLayer({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: null, companion: null }), 'workbook');
});

test('routeLayer returns companion for routine session and companion', () => {
  assert.equal(routeLayer({ routine: 'r1', session: 's1', workbook: null, exercise: null, companion: 'cmp-1' }), 'companion');
});

test('routeLayer returns exercise for routine session workbook and exercise', () => {
  assert.equal(routeLayer({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: 'ex-1', companion: null }), 'exercise');
});

test('parentRoute returns null for the list layer', () => {
  assert.equal(parentRoute({ routine: null, session: null, workbook: null, exercise: null, companion: null }), null);
});

test('parentRoute returns the list route for the routine layer', () => {
  assert.deepEqual(
    parentRoute({ routine: 'r1', session: null, workbook: null, exercise: null, companion: null }),
    { routine: null, session: null, workbook: null, exercise: null, companion: null },
  );
});

test('parentRoute removes session for the session layer', () => {
  assert.deepEqual(
    parentRoute({ routine: 'r1', session: 's1', workbook: null, exercise: null, companion: null }),
    { routine: 'r1', session: null, workbook: null, exercise: null, companion: null },
  );
});

test('parentRoute removes workbook for the workbook layer', () => {
  assert.deepEqual(
    parentRoute({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: null, companion: null }),
    { routine: 'r1', session: 's1', workbook: null, exercise: null, companion: null },
  );
});

test('parentRoute removes companion and workbook for the companion layer', () => {
  assert.deepEqual(
    parentRoute({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: null, companion: 'cmp-1' }),
    { routine: 'r1', session: 's1', workbook: null, exercise: null, companion: null },
  );
});

test('parentRoute removes exercise for the exercise layer', () => {
  assert.deepEqual(
    parentRoute({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: 'ex-1', companion: null }),
    { routine: 'r1', session: 's1', workbook: 'wb-1', exercise: null, companion: null },
  );
});

test('routeDepth returns 0 through 4 across the layer stack', () => {
  assert.equal(routeDepth({ routine: null, session: null, workbook: null, exercise: null, companion: null }), 0);
  assert.equal(routeDepth({ routine: 'r1', session: null, workbook: null, exercise: null, companion: null }), 1);
  assert.equal(routeDepth({ routine: 'r1', session: 's1', workbook: null, exercise: null, companion: null }), 2);
  assert.equal(routeDepth({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: null, companion: null }), 3);
  assert.equal(routeDepth({ routine: 'r1', session: 's1', workbook: null, exercise: null, companion: 'cmp-1' }), 3);
  assert.equal(routeDepth({ routine: 'r1', session: 's1', workbook: 'wb-1', exercise: 'ex-1', companion: null }), 4);
});

test('parseRoutineRoute drops session when routine is absent', () => {
  assert.deepEqual(parseRoutineRoute({ session: 's1' }), {
    routine: null,
    session: null,
    workbook: null,
    exercise: null,
    companion: null,
  });
});

test('parseRoutineRoute keeps exercise and drops companion when both appear', () => {
  assert.deepEqual(parseRoutineRoute({
    routine: 'r1',
    session: 's1',
    workbook: 'wb-1',
    exercise: 'ex-1',
    companion: 'cmp-1',
  }), {
    routine: 'r1',
    session: 's1',
    workbook: 'wb-1',
    exercise: 'ex-1',
    companion: null,
  });
});

test('resolveRoutineRoute returns an empty route for a missing routine', () => {
  const route = parseRoutineRoute({
    routine: 'rt-missing',
    session: 'rs-1',
    workbook: 'wb-1',
  });
  const result = resolveRoutineRoute(route, {
    getRoutine: () => null,
    getSession: () => null,
    getWorkbook: () => null,
    findCompanion: () => null,
  });
  assert.deepEqual(result.route, {
    routine: null,
    session: null,
    workbook: null,
    exercise: null,
    companion: null,
  });
  assert.deepEqual(result.dropped, ['routine', 'session', 'workbook']);
  assert.equal(result.reason, 'routine-missing');
});

test('resolveRoutineRoute returns the routine route for a missing session', () => {
  const route = parseRoutineRoute({
    routine: 'rt-1',
    session: 'rs-missing',
    workbook: 'wb-1',
    exercise: 'ex-1',
  });
  const result = resolveRoutineRoute(route, {
    getRoutine: id => ({ id, sessions: [{ id: 'rs-1' }] }),
    getSession: () => null,
    getWorkbook: () => ({ id: 'wb-1', entries: [] }),
    findCompanion: () => null,
  });
  assert.deepEqual(result.route, {
    routine: 'rt-1',
    session: null,
    workbook: null,
    exercise: null,
    companion: null,
  });
  assert.deepEqual(result.dropped, ['session', 'workbook', 'exercise']);
  assert.equal(result.reason, 'session-missing');
});

test('resolveRoutineRoute returns the session route for a missing workbook', () => {
  const route = parseRoutineRoute({
    routine: 'rt-1',
    session: 'rs-1',
    workbook: 'wb-missing',
    exercise: 'ex-1',
  });
  const result = resolveRoutineRoute(route, {
    getRoutine: id => ({ id, sessions: [{ id: 'rs-1' }] }),
    getSession: (routine, sessionId) => routine.sessions.find(s => s.id === sessionId),
    getWorkbook: () => null,
    findCompanion: () => null,
  });
  assert.deepEqual(result.route, {
    routine: 'rt-1',
    session: 'rs-1',
    workbook: null,
    exercise: null,
    companion: null,
  });
  assert.deepEqual(result.dropped, ['workbook', 'exercise']);
  assert.equal(result.reason, 'workbook-missing');
});

test('resolveRoutineRoute returns the workbook route for a missing exercise', () => {
  const route = parseRoutineRoute({
    routine: 'rt-1',
    session: 'rs-1',
    workbook: 'wb-1',
    exercise: 'ex-missing',
  });
  const workbook = {
    id: 'wb-1',
    entries: [
      { id: 'wbe-1', exerciseId: 'ex-1' },
      { id: 'wbe-2', exerciseId: 'ex-2' },
    ],
  };
  const result = resolveRoutineRoute(route, {
    getRoutine: id => ({ id, sessions: [{ id: 'rs-1' }] }),
    getSession: (routine, sessionId) => routine.sessions.find(s => s.id === sessionId),
    getWorkbook: id => (id === workbook.id ? workbook : null),
    findCompanion: () => null,
  });
  assert.deepEqual(result.route, {
    routine: 'rt-1',
    session: 'rs-1',
    workbook: 'wb-1',
    exercise: null,
    companion: null,
  });
  assert.deepEqual(result.dropped, ['exercise']);
  assert.equal(result.reason, 'exercise-missing');
});

test('resolveRoutineRoute returns the session route for a missing companion', () => {
  const route = parseRoutineRoute({
    routine: 'rt-1',
    session: 'rs-1',
    workbook: 'wb-1',
    companion: 'cmp-missing',
  });
  const session = { id: 'rs-1', workbookIds: ['wb-1'] };
  const workbook = {
    id: 'wb-1',
    entries: [],
    companions: [{ id: 'cmp-1', type: 'scale-ref' }],
  };
  const result = resolveRoutineRoute(route, {
    getRoutine: id => ({ id, sessions: [session] }),
    getSession: (routine, sessionId) => routine.sessions.find(s => s.id === sessionId),
    getWorkbook: id => (id === workbook.id ? workbook : null),
    findCompanion: makeFindCompanion({ [workbook.id]: workbook }),
  });
  assert.deepEqual(result.route, {
    routine: 'rt-1',
    session: 'rs-1',
    workbook: null,
    exercise: null,
    companion: null,
  });
  assert.deepEqual(result.dropped, ['companion', 'workbook']);
  assert.equal(result.reason, 'companion-missing');
});

test('findCompanion returns a companion from the second attached workbook', () => {
  const session = { id: 'rs-1', workbookIds: ['wb-1', 'wb-2'] };
  const wb1 = { id: 'wb-1', entries: [], companions: [] };
  const wb2 = {
    id: 'wb-2',
    entries: [],
    companions: [{ id: 'cmp-2', type: 'scale-ref' }],
  };
  const findCompanion = makeFindCompanion({ 'wb-1': wb1, 'wb-2': wb2 });
  const found = findCompanion(session, 'cmp-2');
  assert.ok(found);
  assert.equal(found.workbook.id, 'wb-2');
  assert.equal(found.companion.id, 'cmp-2');

  const route = parseRoutineRoute({
    routine: 'rt-1',
    session: 'rs-1',
    companion: 'cmp-2',
  });
  const result = resolveRoutineRoute(route, {
    getRoutine: id => ({ id, sessions: [session] }),
    getSession: (routine, sessionId) => routine.sessions.find(s => s.id === sessionId),
    getWorkbook: id => ({ 'wb-1': wb1, 'wb-2': wb2 }[id] || null),
    findCompanion,
  });
  assert.equal(result.reason, null);
  assert.deepEqual(result.dropped, []);
  assert.equal(result.route.companion, 'cmp-2');
});

test('ROUTINE_ROUTE_ID and ROUTINE_PARAM_KEYS match the contract', () => {
  assert.equal(ROUTINE_ROUTE_ID, 'routines');
  assert.deepEqual(ROUTINE_PARAM_KEYS, ['routine', 'session', 'workbook', 'exercise', 'companion']);
});

test('buildRoutineParams writes only present keys', () => {
  assert.deepEqual(
    buildRoutineParams({
      routine: 'r1',
      session: 's1',
      workbook: null,
      exercise: null,
      companion: null,
    }),
    { routine: 'r1', session: 's1' },
  );
});

function makeCallRecorder() {
  const calls = [];
  return {
    calls,
    record(type, ...args) {
      calls.push({ type, args });
    },
    clear() {
      calls.length = 0;
    },
    count(type) {
      return calls.filter((entry) => entry.type === type).length;
    },
  };
}

function makeFakeElement() {
  return {
    textContent: '',
    scrollTop: 0,
    setAttribute() {},
    focus() {},
  };
}

function makeFakeShell(recorder) {
  return {
    activateSection(sectionId, options) {
      recorder.record('activateSection', sectionId, options);
    },
    pushRoute(route) {
      recorder.record('pushRoute', route);
    },
    replaceRoute(route) {
      recorder.record('replaceRoute', route);
    },
    backToRoute(parentRoute) {
      recorder.record('backToRoute', parentRoute);
    },
    goHome() {
      recorder.record('goHome');
    },
    hasInAppHistory() {
      return false;
    },
  };
}

function makeFakeLayer(name, recorder, hostId) {
  const headingEl = makeFakeElement();
  const statusEl = makeFakeElement();
  return {
    host: () => hostId || name,
    mount(ctx) {
      recorder.record(`${name}.mount`, ctx);
    },
    unmount(ctx) {
      recorder.record(`${name}.unmount`, ctx);
    },
    heading: () => headingEl,
    status: () => statusEl,
    headingEl,
    statusEl,
  };
}

function makeNavigator(overrides = {}) {
  const recorder = overrides.recorder || makeCallRecorder();
  const routine = { id: 'rt-1', sessions: [{ id: 'rs-1', workbookIds: ['wb-1'] }] };
  const workbook = {
    id: 'wb-1',
    entries: [{ id: 'wbe-1', exerciseId: 'ex-1' }],
  };

  const layers = {
    routine: makeFakeLayer('routine', recorder, 'routines'),
    session: makeFakeLayer('session', recorder, 'routines'),
    workbook: makeFakeLayer('workbook', recorder, 'workbooks'),
    exercise: makeFakeLayer('exercise', recorder, 'workbooks'),
    companion: makeFakeLayer('companion', recorder, 'workbooks'),
  };

  const navigator = createRoutineNavigator({
    root: makeFakeElement(),
    getRoutine: overrides.getRoutine || ((id) => (id === 'rt-1' ? routine : null)),
    getSession:
      overrides.getSession
      || ((routineValue, sessionId) => routineValue.sessions.find((item) => item.id === sessionId) || null),
    getWorkbook: overrides.getWorkbook || ((id) => (id === 'wb-1' ? workbook : null)),
    getExercise:
      overrides.getExercise
      || ((workbookId, exerciseId) => {
        if (workbookId === 'wb-1' && exerciseId === 'ex-1') {
          return { id: 'ex-1' };
        }
        return null;
      }),
    getCompanion: overrides.getCompanion || (() => null),
    shell: makeFakeShell(recorder),
    layers,
    ...overrides.config,
  });

  return { navigator, layers, recorder };
}

test('navigator open calls pushRoute once and mounts one layer', () => {
  const recorder = makeCallRecorder();
  const { navigator } = makeNavigator({ recorder });

  navigator.applyRoute({ routine: 'rt-1' }, { source: 'boot' });
  recorder.clear();

  navigator.open({ session: 'rs-1' });

  assert.equal(recorder.count('pushRoute'), 1);
  assert.equal(recorder.count('session.mount'), 1);
});

test('navigator back calls backToRoute once and unmounts one layer', () => {
  const recorder = makeCallRecorder();
  const { navigator } = makeNavigator({ recorder });

  navigator.applyRoute(
    { routine: 'rt-1', session: 'rs-1', workbook: 'wb-1' },
    { source: 'boot' },
  );
  recorder.clear();

  navigator.back();

  assert.equal(recorder.count('backToRoute'), 1);

  navigator.applyRoute({ routine: 'rt-1', session: 'rs-1' }, { source: 'popstate' });

  assert.equal(recorder.count('workbook.unmount'), 1);
  assert.equal(recorder.count('session.unmount'), 0);
  assert.equal(recorder.count('routine.unmount'), 0);
});

test('navigator applyRoute with popstate source writes no history', () => {
  const recorder = makeCallRecorder();
  const { navigator } = makeNavigator({ recorder });

  navigator.applyRoute(
    { routine: 'rt-1', session: 'rs-1', workbook: 'wb-1' },
    { source: 'boot' },
  );
  recorder.clear();

  navigator.applyRoute({ routine: 'rt-1', session: 'rs-1' }, { source: 'popstate' });

  assert.equal(recorder.count('pushRoute'), 0);
  assert.equal(recorder.count('replaceRoute'), 0);
});

test('navigator repair writes exactly one replace and shows one message', () => {
  const recorder = makeCallRecorder();
  const { navigator, layers } = makeNavigator({ recorder });

  navigator.applyRoute(
    { routine: 'rt-1', session: 'rs-1', workbook: 'wb-1' },
    { source: 'boot' },
  );
  recorder.clear();

  navigator.applyRoute(
    {
      routine: 'rt-1',
      session: 'rs-1',
      workbook: 'wb-1',
      exercise: 'ex-missing',
    },
    { source: 'boot' },
  );

  assert.equal(recorder.count('replaceRoute'), 1);
  assert.equal(layers.workbook.statusEl.textContent, 'Item not found');
});

test('navigator parent layer receives no unmount while a child mounts', () => {
  const recorder = makeCallRecorder();
  const { navigator } = makeNavigator({ recorder });

  navigator.applyRoute({ routine: 'rt-1' }, { source: 'boot' });
  recorder.clear();

  navigator.open({ session: 'rs-1' });

  assert.equal(recorder.count('session.mount'), 1);
  assert.equal(recorder.count('routine.unmount'), 0);
});

console.log(`\n${passed} tests passed`);
