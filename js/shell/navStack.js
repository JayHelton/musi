const VALID_ORIGINS = new Set([
  'tools',
  'library',
  'workbook',
  'routine',
  'search',
  'recent',
  'direct',
]);

const ROUTINE_PEEL_ORDER = ['exercise', 'companion', 'workbook', 'session', 'routine'];
const ROUTINE_PARAM_KEYS = ['routine', 'session', 'workbook', 'exercise', 'companion'];

const stack = [];
const viewStates = new Map();

function isLibraryRouteKey(routeKey) {
  return typeof routeKey === 'string' && routeKey.startsWith('library:');
}

function normalizeLibraryViewState(state) {
  const filters = state?.filters ?? {};
  return {
    query: typeof state?.query === 'string' ? state.query : '',
    filters: {
      instrument: filters.instrument ?? null,
      materialType: filters.materialType ?? null,
      technique: filters.technique ?? null,
      tuning: filters.tuning ?? null,
      difficulty: filters.difficulty ?? null,
      tags: Array.isArray(filters.tags) ? [...filters.tags] : [],
      source: filters.source ?? null,
      favorite: filters.favorite ?? null,
    },
    sort: typeof state?.sort === 'string' ? state.sort : '',
    selectedId: state?.selectedId ?? null,
    scrollY: typeof state?.scrollY === 'number' ? state.scrollY : 0,
  };
}

function copyRoutineParams(params = {}) {
  const next = {};
  for (const key of ROUTINE_PARAM_KEYS) {
    if (params[key]) next[key] = params[key];
  }
  return next;
}

function peelRoutineParams(params) {
  for (const key of ROUTINE_PEEL_ORDER) {
    if (!params[key]) continue;
    const next = { ...params };
    delete next[key];
    if (key === 'workbook' || key === 'companion') {
      delete next.exercise;
      if (key === 'companion') delete next.workbook;
    }
    if (key === 'session') {
      delete next.workbook;
      delete next.exercise;
      delete next.companion;
    }
    if (key === 'routine') {
      return { id: 'tools', params: {} };
    }
    return { id: 'routines', params: next };
  }
  return { id: 'tools', params: {} };
}

export function pushRoute(route, origin) {
  if (!VALID_ORIGINS.has(origin)) {
    throw new Error(`Invalid navigation origin: ${origin}`);
  }
  stack.push({ route, origin });
}

export function popRoute() {
  if (stack.length === 0) return null;
  stack.pop();
  if (stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function currentOrigin() {
  if (stack.length === 0) return 'direct';
  return stack[stack.length - 1].origin;
}

export function saveViewState(routeKey, state) {
  const stored = isLibraryRouteKey(routeKey)
    ? normalizeLibraryViewState(state)
    : state;
  viewStates.set(routeKey, stored);
}

export function readViewState(routeKey) {
  const stored = viewStates.get(routeKey);
  if (stored === undefined) return null;
  if (isLibraryRouteKey(routeKey)) {
    return normalizeLibraryViewState(stored);
  }
  return stored;
}

export function restoreScroll(routeKey) {
  const state = readViewState(routeKey);
  const scrollY = state && typeof state.scrollY === 'number' ? state.scrollY : 0;
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo(0, scrollY);
  }
  return scrollY;
}

export function focusHeading(sectionEl) {
  if (!sectionEl) return;
  const heading = sectionEl.querySelector?.('h1, h2, [data-page-heading]')
    ?? (sectionEl.matches?.('h1, h2, [data-page-heading]') ? sectionEl : null);
  if (!heading) return;
  heading.setAttribute('tabindex', '-1');
  if (typeof heading.focus === 'function') {
    heading.focus({ preventScroll: true });
  }
}

export function parentAddress(origin, route) {
  const params = route?.params ?? {};

  switch (origin) {
    case 'tools':
      return { id: 'tools', params: {} };
    case 'library':
      return { id: 'library', params: { mode: 'exercises' } };
    case 'workbook':
      return { id: 'routines', params: copyRoutineParams(params) };
    case 'routine':
      return peelRoutineParams(copyRoutineParams(params));
    case 'search':
    case 'recent':
    case 'direct':
      return { id: 'tools', params: {} };
    default:
      return { id: 'tools', params: {} };
  }
}
