export const ROUTE_IDS = [
  'reference',
  'create',
  'tools',
  'scalelab',
  // SIMPLIFY: fretmap hidden. Keep this id to restore later.
  // 'fretmap',
  'chordlab',
  'circle',
  'triads',
  // SIMPLIFY: studylab hidden. Keep this id to restore later.
  // 'studylab',
  'pitchear',
  'metronome',
  'audiostudio',
  'songstudio',
  'notes',
  'library',
  // SIMPLIFY: routines hidden. Keep this id to restore later.
  // 'routines',
  'scoreplayer',
  'settings',
];

const ROUTE_MODE_DEFAULTS = {
  fretmap: 'map',
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
  scaleref: { id: 'scalelab', params: {}, notice: null },
  circle: { id: 'circle', params: {}, notice: null },
  studylab: { id: 'scalelab', params: {}, notice: 'notice.studylab-removed' },
  intervals: { id: 'tools', params: { mode: 'train' }, notice: 'notice.intervals-removed' },
  fretboard: { id: 'tools', params: { mode: 'train' }, notice: 'notice.fretboard-removed' },
  intervalorbit: { id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  intervalmap: { id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  // SIMPLIFY: fretmap live route hidden. Keep this row to restore later.
  fretmap: { id: 'tools', params: { mode: 'study' }, notice: 'notice.fretmap-removed' },
  chordlab: { id: 'chordlab', params: { mode: 'reference' }, notice: 'notice.chordlab-removed' },
  chords: { id: 'chordlab', params: {}, notice: null },
  triads: { id: 'triads', params: {}, notice: null },
  tuner: { id: 'pitchear', params: { mode: 'tuner' }, notice: null },
  ear: { id: 'pitchear', params: { mode: 'ear' }, notice: null },
  timing: { id: 'metronome', params: { mode: 'metronome' }, notice: 'notice.timing-removed' },
  metronome: { id: 'metronome', params: { mode: 'metronome' }, notice: null },
  practice: { id: 'metronome', params: { mode: 'plan' }, notice: null },
  sightreading: { id: 'tools', params: { mode: 'train' }, notice: 'notice.sightreading-removed' },
  recorder: { id: 'audiostudio', params: { mode: 'capture' }, notice: null },
  tracktosheet: { id: 'audiostudio', params: { mode: 'transcribe' }, notice: null },
  songwriter: { id: 'songstudio', params: {}, notice: null },
  notes: { id: 'notes', params: {}, notice: null },
  keyboard: { id: 'tools', params: { mode: 'study' }, notice: 'notice.pitch-reference' },
  drums: { id: 'library', params: { mode: 'exercises' }, notice: 'notice.drums-removed' },
  exercises: { id: 'library', params: { mode: 'exercises' }, notice: null },
  workbooks: { id: 'library', params: { mode: 'workbooks' }, notice: null },
  routines: { id: 'tools', params: { mode: 'train' }, notice: 'notice.routines-removed' },
  gpplayer: { id: 'scoreplayer', params: {}, notice: null },
  tabanalyzer: { id: 'scoreplayer', params: {}, notice: null },
  musicprefs: { id: 'settings', params: { mode: 'preferences' }, notice: null },
  home: { id: 'reference', params: {}, notice: null },
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
  // SIMPLIFY: routines route hidden. Keep this branch to restore later.
  /*
  if (routeId === 'routines') {
    return { ...base, ...passRoutineParams(input) };
  }
  */
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
      id: 'reference',
      params: {},
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
