const ROUTE_SECTION_MAP = {
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
  if (!routeId) return 'tools';

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
