export const ROUTE_IDS = [
  'tools',
  'scalelab',
  'fretmap',
  'chordlab',
  'pitchear',
  'metronome',
  'audiostudio',
  'songstudio',
  'library',
  'routines',
  'scoreplayer',
  'settings',
];

const ROUTE_MODE_DEFAULTS = {
  tools: 'train',
  scalelab: 'overview',
  fretmap: 'map',
  chordlab: 'reference',
  pitchear: 'tuner',
  metronome: 'metronome',
  audiostudio: 'capture',
  library: 'exercises',
  settings: 'preferences',
};

const ROUTINE_PARAM_KEYS = ['routine', 'session', 'workbook', 'exercise', 'companion'];

/** @type {Record<string, { id: string, params: Record<string, string>, notice: string | null }>} */
export const LEGACY_ROUTES = {
  scales: { id: 'scalelab', params: { mode: 'overview' }, notice: 'notice.scales-removed' },
  scaleref: { id: 'scalelab', params: { mode: 'overview' }, notice: null },
  circle: { id: 'scalelab', params: { mode: 'modes' }, notice: null },
  studylab: { id: 'scalelab', params: { mode: 'guide' }, notice: null },
  intervals: { id: 'fretmap', params: { mode: 'learn' }, notice: 'notice.intervals-removed' },
  fretboard: { id: 'fretmap', params: { mode: 'map' }, notice: 'notice.fretboard-removed' },
  intervalorbit: { id: 'fretmap', params: { mode: 'map' }, notice: null },
  intervalmap: { id: 'fretmap', params: { mode: 'map' }, notice: null },
  chordlab: { id: 'chordlab', params: { mode: 'reference' }, notice: 'notice.chordlab-removed' },
  chords: { id: 'chordlab', params: { mode: 'reference' }, notice: null },
  triads: { id: 'chordlab', params: { mode: 'triads' }, notice: null },
  tuner: { id: 'pitchear', params: { mode: 'tuner' }, notice: null },
  ear: { id: 'pitchear', params: { mode: 'ear' }, notice: null },
  timing: { id: 'metronome', params: { mode: 'metronome' }, notice: 'notice.timing-removed' },
  metronome: { id: 'metronome', params: { mode: 'metronome' }, notice: null },
  practice: { id: 'metronome', params: { mode: 'plan' }, notice: null },
  sightreading: { id: 'tools', params: { mode: 'train' }, notice: 'notice.sightreading-removed' },
  recorder: { id: 'audiostudio', params: { mode: 'capture' }, notice: null },
  tracktosheet: { id: 'audiostudio', params: { mode: 'transcribe' }, notice: null },
  songwriter: { id: 'songstudio', params: {}, notice: null },
  notes: { id: 'songstudio', params: {}, notice: 'notice.notes-removed' },
  keyboard: { id: 'tools', params: { mode: 'study' }, notice: 'notice.pitch-reference' },
  drums: { id: 'library', params: { mode: 'exercises' }, notice: 'notice.drums-removed' },
  exercises: { id: 'library', params: { mode: 'exercises' }, notice: null },
  workbooks: { id: 'library', params: { mode: 'workbooks' }, notice: null },
  routines: { id: 'routines', params: {}, notice: null },
  gpplayer: { id: 'scoreplayer', params: {}, notice: null },
  tabanalyzer: { id: 'scoreplayer', params: {}, notice: null },
  musicprefs: { id: 'settings', params: { mode: 'preferences' }, notice: null },
  home: { id: 'tools', params: {}, notice: null },
};

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isKnownRoute(id) {
  return ROUTE_IDS.includes(id);
}

/**
 * @param {string | null | undefined} noticeId
 * @param {string[] | null | undefined} noticesSeen
 * @returns {boolean}
 */
export function shouldShowNotice(noticeId, noticesSeen) {
  if (typeof noticeId !== 'string' || noticeId === '') return false;
  const seen = Array.isArray(noticesSeen) ? noticesSeen : [];
  return !seen.includes(noticeId);
}

/**
 * @param {string} routeId
 * @param {Record<string, string>} params
 * @returns {Record<string, string>}
 */
function normalizeMode(routeId, params) {
  const defaultMode = ROUTE_MODE_DEFAULTS[routeId];
  if (!defaultMode) return { ...params };
  if (params.mode) return { ...params };
  return { ...params, mode: defaultMode };
}

/**
 * @param {Record<string, string>} params
 * @returns {Record<string, string>}
 */
function passRoutineParams(params) {
  const out = {};
  for (const key of ROUTINE_PARAM_KEYS) {
    if (params[key]) out[key] = params[key];
  }
  return out;
}

/**
 * @param {Record<string, string>} base
 * @param {Record<string, string>} input
 * @param {string} routeId
 * @returns {Record<string, string>}
 */
function mergeLegacyParams(base, input, routeId) {
  if (routeId === 'routines') {
    return { ...base, ...passRoutineParams(input) };
  }
  return { ...base };
}

/**
 * @param {{ hasDrumExercises?: () => boolean } | null | undefined} ctx
 * @returns {{ id: string, params: Record<string, string>, notice: string }}
 */
function resolveDrums(ctx) {
  const hasDrums = ctx && typeof ctx.hasDrumExercises === 'function'
    ? ctx.hasDrumExercises()
    : false;
  const params = { mode: 'exercises' };
  if (hasDrums) params.instrument = 'drums';
  return { id: 'library', params, notice: 'notice.drums-removed' };
}

/**
 * @param {{ id: string, params?: Record<string, string> }} route
 * @param {{ hasDrumExercises?: () => boolean, noticesSeen?: string[] } | null | undefined} [ctx]
 * @returns {{ id: string, params: Record<string, string>, notice: string | null }}
 */
export function resolveRoute(route, ctx) {
  const inputParams = route.params || {};

  if (route.id === '') {
    return {
      id: 'tools',
      params: normalizeMode('tools', {}),
      notice: null,
    };
  }

  const legacy = LEGACY_ROUTES[route.id];
  if (legacy) {
    if (route.id === 'drums') {
      return resolveDrums(ctx);
    }
    const merged = mergeLegacyParams(legacy.params, inputParams, legacy.id);
    return {
      id: legacy.id,
      params: normalizeMode(legacy.id, merged),
      notice: legacy.notice,
    };
  }

  if (isKnownRoute(route.id)) {
    return {
      id: route.id,
      params: normalizeMode(route.id, { ...inputParams }),
      notice: null,
    };
  }

  return {
    id: route.id,
    params: { ...inputParams },
    notice: null,
  };
}

const LIVE_SECTION_BY_ROUTE = {
  tools: 'tools',
  home: 'tools',
  scalelab: 'scaleref',
  fretmap: 'intervalorbit',
  chordlab: 'chords',
  pitchear: 'tuner',
  metronome: 'metronome',
  audiostudio: 'recorder',
  songstudio: 'songwriter',
  routines: 'routines',
  scoreplayer: 'gpplayer',
  settings: 'musicprefs',
};

/**
 * @param {string} id
 * @returns {string}
 */
function resolveSectionAlias(id) {
  if (id === 'intervalmap') return 'intervalorbit';
  if (id === 'tabanalyzer') return 'gpplayer';
  return id;
}

/**
 * Map a resolved route id and params to the live DOM section id.
 *
 * @param {string} routeId
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function liveSectionForRoute(routeId, params = {}) {
  if (!routeId) return 'tools';
  if (routeId === 'library') {
    return params.mode === 'workbooks' ? 'workbooks' : 'exercises';
  }
  if (LIVE_SECTION_BY_ROUTE[routeId]) return LIVE_SECTION_BY_ROUTE[routeId];
  return resolveSectionAlias(routeId);
}
