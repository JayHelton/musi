/**
 * Pure route data for Musi navigation: objectives, views, and legacy aliases.
 * Provides parse, format, and resolve. No DOM. Safe to import in Node.
 */

export const VIEWS = {
  home: [],
  train: ['today', 'plans', 'library', 'fundamentals', 'progress'],
  study: ['learn', 'explore', 'review'],
  create: ['projects', 'capture', 'compose'],
  settings: [],
};

export const SETTINGS_ROUTE = '#settings';

const VALID_OBJECTIVES = ['home', 'train', 'study', 'create', 'settings'];

export const OBJECTIVES = [
  {
    id: 'home',
    label: 'Home',
    route: '#home',
    views: VIEWS.home,
    defaultView: null,
  },
  {
    id: 'train',
    label: 'Train',
    route: '#train',
    views: VIEWS.train,
    defaultView: 'today',
  },
  {
    id: 'study',
    label: 'Study',
    route: '#study',
    views: VIEWS.study,
    defaultView: 'learn',
  },
  {
    id: 'create',
    label: 'Create',
    route: '#create',
    views: VIEWS.create,
    defaultView: 'projects',
  },
];

export const LEGACY_ROUTES = {
  scales: '#train/fundamentals?drill=scales',
  intervals: '#train/fundamentals?drill=intervals',
  sightreading: '#train/fundamentals?drill=sightreading',
  fretboard: '#train/fundamentals?drill=fretboard',
  intervalorbit: '#study/explore?view=fretboard',
  intervalmap: '#study/explore?view=fretboard',
  chordlab: '#train/fundamentals?drill=chord-workout',
  tuner: '#train/fundamentals?drill=pitch&panel=tuner',
  ear: '#train/fundamentals?drill=ear',
  timing: '#train/fundamentals?drill=timing',
  scaleref: '#study/explore?view=scales',
  chords: '#study/explore?view=chords',
  triads: '#study/explore?view=triads',
  circle: '#study/explore?view=circle',
  recorder: '#create/capture',
  songwriter: '#create/projects',
  notes: '#create/projects?view=notes',
  tracktosheet: '#create/compose?view=import-melody',
  keyboard: '#create/compose?panel=keyboard',
  metronome: '#train?panel=practice',
  practice: '#train?panel=practice',
  drums: '#train/library?type=drums',
  exercises: '#train/library?type=exercise',
  workbooks: '#train/library?type=workbook',
  routines: '#train/plans',
  gpplayer: '#train/library?player=gp',
  tabanalyzer: '#train/library?player=gp',
  studylab: '#study/learn',
  musicprefs: '#settings',
  'hub-train': '#train',
  'hub-reference': '#study',
  'hub-create': '#create',
  'hub-tools': '#train/library',
  home: '#home',
  '': '#home',
};

function homeRoute(extra = {}) {
  return {
    objective: 'home',
    view: null,
    params: {},
    hash: '#home',
    ...extra,
  };
}

function parseQuery(query) {
  const params = {};
  if (!query) return params;
  const search = query.startsWith('?') ? query.slice(1) : query;
  if (!search) return params;
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) {
      params[decodeURIComponent(pair)] = '';
    } else {
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return params;
}

function formatQuery(params) {
  if (!params || typeof params !== 'object') return '';
  const keys = Object.keys(params)
    .filter((k) => params[k] != null && params[k] !== '')
    .sort();
  if (keys.length === 0) return '';
  return '?' + keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
}

/**
 * @param {{ objective: string, view?: string|null, params?: Record<string, string> }} route
 * @returns {string}
 */
export function formatRoute({ objective, view, params }) {
  if (objective === 'home') return '#home';
  if (objective === 'settings') return SETTINGS_ROUTE + formatQuery(params);
  let path = objective;
  if (view) path += '/' + view;
  return '#' + path + formatQuery(params);
}

function splitPathAndQuery(raw) {
  const q = raw.indexOf('?');
  if (q === -1) return { path: raw, query: '' };
  return { path: raw.slice(0, q), query: raw.slice(q) };
}

function extractHashFragment(input) {
  const s = String(input).trim();
  const hashIdx = s.indexOf('#');
  if (hashIdx >= 0) return s.slice(hashIdx);
  const first = s.split(/[/?]/)[0];
  if (VALID_OBJECTIVES.includes(first)) return '#' + s;
  return s.startsWith('#') ? s : null;
}

function legacyLookupKey(input) {
  const fragment = extractHashFragment(input);
  if (fragment == null) {
    const trimmed = String(input).trim();
    if (trimmed in LEGACY_ROUTES) return trimmed;
    return splitPathAndQuery(trimmed).path;
  }
  let bare = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!bare) return '';
  return splitPathAndQuery(bare).path;
}

/**
 * @param {string|null|undefined} hash
 * @returns {{ objective: string, view: string|null, params: Record<string, string>, hash: string, unknown?: boolean, requested?: string }}
 */
export function parseRoute(hash) {
  const requested = hash == null ? '' : String(hash);

  if (requested.trim() === '' || requested.trim() === '#') {
    return homeRoute();
  }

  const fragment = extractHashFragment(requested);
  if (fragment == null) {
    return homeRoute({ unknown: true, requested });
  }

  let bare = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!bare) return homeRoute();

  const { path, query } = splitPathAndQuery(bare);
  const segments = path.split('/').filter(Boolean);
  const objective = segments[0] || 'home';

  if (!VALID_OBJECTIVES.includes(objective)) {
    return homeRoute({ unknown: true, requested });
  }

  if (objective === 'home') {
    return {
      objective: 'home',
      view: null,
      params: parseQuery(query),
      hash: '#home',
    };
  }

  if (objective === 'settings') {
    const route = {
      objective: 'settings',
      view: null,
      params: parseQuery(query),
    };
    route.hash = formatRoute(route);
    return route;
  }

  const view = segments.length > 1 ? segments[1] : null;
  const allowedViews = VIEWS[objective] || [];

  if (view != null && !allowedViews.includes(view)) {
    return homeRoute({ unknown: true, requested });
  }

  const route = {
    objective,
    view,
    params: parseQuery(query),
  };
  route.hash = formatRoute(route);
  return route;
}

/**
 * @param {string|null|undefined} hash
 * @returns {{ route: object, canonicalHash: string, redirected: boolean }}
 */
export function resolveHash(hash) {
  const requested = hash == null ? '' : String(hash);
  const trimmed = requested.trim();

  const lookupKey = legacyLookupKey(trimmed);
  let targetInput = trimmed;
  let redirected = false;

  if (lookupKey in LEGACY_ROUTES) {
    const legacyCanonical = LEGACY_ROUTES[lookupKey];
    targetInput = legacyCanonical;
    const fragment = extractHashFragment(trimmed);
    const parsedInput = parseRoute(fragment != null ? fragment : trimmed);
    redirected = parsedInput.hash !== legacyCanonical || trimmed !== legacyCanonical;
  } else {
    const fragment = extractHashFragment(trimmed);
    if (fragment != null) {
      const parsed = parseRoute(fragment);
      if (parsed.unknown) {
        redirected = true;
      } else {
        redirected = fragment !== parsed.hash;
      }
    } else if (trimmed !== '' && trimmed !== '#') {
      redirected = true;
    }
  }

  const route = parseRoute(targetInput);
  const canonicalHash = route.hash;

  return { route, canonicalHash, redirected };
}

/**
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @returns {boolean}
 */
export function isSameView(a, b) {
  if (!a || !b) return false;
  return a.objective === b.objective && a.view === b.view;
}

/**
 * @param {object} route
 * @param {Record<string, string|null|undefined>} patch
 * @returns {object}
 */
export function withParams(route, patch) {
  const params = { ...route.params };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === '') {
      delete params[key];
    } else {
      params[key] = String(value);
    }
  }
  const next = {
    objective: route.objective,
    view: route.view,
    params,
  };
  next.hash = formatRoute(next);
  return next;
}
