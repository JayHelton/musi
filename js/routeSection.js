const ROUTE_SECTION_MAP = {
  reference: 'hub-reference',
  create: 'hub-create',
  tools: 'tools',
  home: 'hub-reference',
  scalelab: 'scaleref',
  chordlab: 'chords',
  circle: 'circle',
  triads: 'triads',
  pitchear: 'tuner',
  metronome: 'metronome',
  audiostudio: 'recorder',
  songstudio: 'songwriter',
  notes: 'notes',
  scoreplayer: 'gpplayer',
  settings: 'musicprefs',
};

const SECTION_ALIASES = {
  intervalmap: 'intervalorbit',
  tabanalyzer: 'gpplayer',
};

/**
 * Map a resolved route id and params to the live section id in the DOM.
 * @param {string} routeId
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function sectionIdForRoute(routeId, params = {}) {
  if (!routeId) return 'hub-reference';

  if (routeId === 'library') {
    return params.mode === 'workbooks' ? 'workbooks' : 'exercises';
  }

  if (ROUTE_SECTION_MAP[routeId]) {
    return ROUTE_SECTION_MAP[routeId];
  }

  if (SECTION_ALIASES[routeId]) {
    return SECTION_ALIASES[routeId];
  }

  return routeId;
}
