/**
 * Feature metadata registry: ownership, routes, section ids, and capabilities.
 * Imports only from js/routes.js. Safe to import in Node.
 */

import {
  LEGACY_ROUTES,
  parseRoute,
  VIEWS,
} from './routes.js';

const VALID_OWNERS = ['train', 'study', 'create', 'app', 'utility'];
const VALID_KINDS = ['screen', 'drill', 'renderer', 'panel', 'utility'];

export const FEATURES = [
  {
    id: 'scales',
    owner: 'train',
    kind: 'drill',
    label: 'Scale Spelling',
    sectionId: 'sec-scales',
    canonicalRoute: '#train/fundamentals?drill=scales',
    legacyRoutes: ['#scales'],
    capabilities: ['music-context', 'practice-action', 'study-concept'],
  },
  {
    id: 'intervals',
    owner: 'train',
    kind: 'drill',
    label: 'Intervals',
    sectionId: 'sec-intervals',
    canonicalRoute: '#train/fundamentals?drill=intervals',
    legacyRoutes: ['#intervals'],
    capabilities: ['music-context', 'practice-action', 'study-concept'],
  },
  {
    id: 'sightreading',
    owner: 'train',
    kind: 'drill',
    label: 'Sight Reading',
    sectionId: 'sec-sightreading',
    canonicalRoute: '#train/fundamentals?drill=sightreading',
    legacyRoutes: ['#sightreading'],
    capabilities: ['practice-action', 'study-concept'],
  },
  {
    id: 'fretboard',
    owner: 'train',
    kind: 'drill',
    label: 'Fretboard',
    sectionId: 'sec-fretboard',
    canonicalRoute: '#train/fundamentals?drill=fretboard',
    legacyRoutes: ['#fretboard'],
    capabilities: ['music-context', 'practice-action', 'practice-session', 'audio'],
  },
  {
    id: 'intervalorbit',
    owner: 'study',
    kind: 'screen',
    label: 'Interval Map',
    sectionId: 'sec-intervalorbit',
    canonicalRoute: '#study/explore?view=fretboard',
    legacyRoutes: ['#intervalorbit', '#intervalmap'],
    capabilities: ['music-context', 'practice-action', 'audio', 'study-concept'],
  },
  {
    id: 'chordlab',
    owner: 'train',
    kind: 'drill',
    label: 'Chord Workout',
    sectionId: 'sec-chordlab',
    canonicalRoute: '#train/fundamentals?drill=chord-workout',
    legacyRoutes: ['#chordlab'],
    capabilities: ['music-context', 'practice-action', 'practice-session', 'audio'],
  },
  {
    id: 'tuner',
    owner: 'train',
    kind: 'drill',
    label: 'Pitch',
    sectionId: 'sec-tuner',
    canonicalRoute: '#train/fundamentals?drill=pitch&panel=tuner',
    legacyRoutes: ['#tuner'],
    capabilities: ['audio', 'microphone', 'practice-action'],
  },
  {
    id: 'ear',
    owner: 'train',
    kind: 'drill',
    label: 'Ear',
    sectionId: 'sec-ear',
    canonicalRoute: '#train/fundamentals?drill=ear',
    legacyRoutes: ['#ear'],
    capabilities: ['audio', 'practice-action'],
  },
  {
    id: 'timing',
    owner: 'train',
    kind: 'drill',
    label: 'Timing',
    sectionId: 'sec-timing',
    canonicalRoute: '#train/fundamentals?drill=timing',
    legacyRoutes: ['#timing'],
    capabilities: ['audio', 'practice-action', 'practice-session'],
  },
  {
    id: 'scaleref',
    owner: 'study',
    kind: 'renderer',
    label: 'Scale Reference',
    sectionId: 'sec-scaleref',
    canonicalRoute: '#study/explore?view=scales',
    legacyRoutes: ['#scaleref'],
    capabilities: ['music-context', 'study-concept', 'audio'],
  },
  {
    id: 'chords',
    owner: 'study',
    secondaryOwners: ['create'],
    kind: 'renderer',
    label: 'Chords',
    sectionId: 'sec-chords',
    canonicalRoute: '#study/explore?view=chords',
    legacyRoutes: ['#chords'],
    capabilities: ['music-context', 'study-concept', 'audio'],
  },
  {
    id: 'triads',
    owner: 'study',
    kind: 'renderer',
    label: 'Triads Reference',
    sectionId: 'sec-triads',
    canonicalRoute: '#study/explore?view=triads',
    legacyRoutes: ['#triads'],
    capabilities: ['music-context', 'study-concept', 'audio'],
  },
  {
    id: 'circle',
    owner: 'study',
    kind: 'renderer',
    label: 'Circle of Fifths',
    sectionId: 'sec-circle',
    canonicalRoute: '#study/explore?view=circle',
    legacyRoutes: ['#circle'],
    capabilities: ['music-context', 'study-concept'],
  },
  {
    id: 'recorder',
    owner: 'create',
    kind: 'screen',
    label: 'Recorder',
    sectionId: 'sec-recorder',
    canonicalRoute: '#create/capture',
    legacyRoutes: ['#recorder'],
    capabilities: ['audio', 'microphone', 'recording'],
  },
  {
    id: 'songwriter',
    owner: 'create',
    kind: 'screen',
    label: 'Songwriting',
    sectionId: 'sec-songwriter',
    canonicalRoute: '#create/projects',
    legacyRoutes: ['#songwriter'],
    capabilities: ['library', 'recording'],
  },
  {
    id: 'notes',
    owner: 'utility',
    kind: 'panel',
    label: 'Notes',
    sectionId: 'sec-notes',
    canonicalRoute: '#create/projects?view=notes',
    legacyRoutes: ['#notes'],
    capabilities: ['library'],
  },
  {
    id: 'tracktosheet',
    owner: 'create',
    kind: 'screen',
    label: 'Track → Sheet',
    sectionId: 'sec-tracktosheet',
    canonicalRoute: '#create/compose?view=import-melody',
    legacyRoutes: ['#tracktosheet'],
    capabilities: ['audio', 'recording'],
  },
  {
    id: 'keyboard',
    owner: 'utility',
    kind: 'panel',
    label: 'Keyboard',
    sectionId: 'sec-keyboard',
    canonicalRoute: '#create/compose?panel=keyboard',
    legacyRoutes: ['#keyboard'],
    capabilities: ['audio', 'music-context'],
  },
  {
    id: 'metronome',
    owner: 'utility',
    kind: 'panel',
    label: 'Metronome',
    sectionId: 'sec-metronome',
    canonicalRoute: '#train?panel=practice',
    legacyRoutes: ['#metronome'],
    capabilities: ['audio', 'practice-session'],
  },
  {
    id: 'practice',
    owner: 'utility',
    kind: 'panel',
    label: 'Practice Timer',
    sectionId: 'sec-practice',
    canonicalRoute: '#train?panel=practice',
    legacyRoutes: ['#practice'],
    capabilities: ['audio', 'practice-session'],
  },
  {
    id: 'drums',
    owner: 'train',
    secondaryOwners: ['create'],
    kind: 'screen',
    label: 'Drums',
    sectionId: 'sec-drums',
    canonicalRoute: '#train/library?type=drums',
    legacyRoutes: ['#drums'],
    capabilities: ['audio', 'library'],
  },
  {
    id: 'exercises',
    owner: 'train',
    kind: 'screen',
    label: 'Exercises',
    sectionId: 'sec-exercises',
    canonicalRoute: '#train/library?type=exercise',
    legacyRoutes: ['#exercises'],
    capabilities: ['library', 'practice-action'],
  },
  {
    id: 'workbooks',
    owner: 'train',
    kind: 'screen',
    label: 'Workbooks',
    sectionId: 'sec-workbooks',
    canonicalRoute: '#train/library?type=workbook',
    legacyRoutes: ['#workbooks'],
    capabilities: ['library', 'practice-session'],
  },
  {
    id: 'routines',
    owner: 'train',
    kind: 'screen',
    label: 'Routines',
    sectionId: 'sec-routines',
    canonicalRoute: '#train/plans',
    legacyRoutes: ['#routines'],
    capabilities: ['library', 'practice-session'],
  },
  {
    id: 'gpplayer',
    owner: 'train',
    kind: 'renderer',
    label: 'Guitar Pro Player',
    sectionId: 'sec-gpplayer',
    canonicalRoute: '#train/library?player=gp',
    legacyRoutes: ['#gpplayer', '#tabanalyzer'],
    capabilities: ['library', 'audio', 'practice-action'],
  },
  {
    id: 'studylab',
    owner: 'study',
    kind: 'screen',
    label: 'Study Lab',
    sectionId: 'sec-studylab',
    canonicalRoute: '#study/learn',
    legacyRoutes: ['#studylab'],
    capabilities: ['audio', 'microphone', 'music-context', 'study-concept', 'practice-action'],
  },
  {
    id: 'musicprefs',
    owner: 'app',
    kind: 'utility',
    label: 'Settings & Preferences',
    sectionId: 'sec-musicprefs',
    canonicalRoute: '#settings',
    legacyRoutes: ['#musicprefs'],
    capabilities: [],
  },
];

const featureById = new Map(FEATURES.map((f) => [f.id, f]));

/**
 * @param {string} id
 * @returns {object|null}
 */
export function getFeature(id) {
  return featureById.get(id) || null;
}

/**
 * @param {string} owner
 * @returns {object[]}
 */
export function featuresByOwner(owner) {
  return FEATURES.filter(
    (f) => f.owner === owner || (f.secondaryOwners && f.secondaryOwners.includes(owner)),
  );
}

function legacyRouteKey(hash) {
  const bare = hash.startsWith('#') ? hash.slice(1) : hash;
  return bare.split('?')[0];
}

/**
 * @param {string} hash
 * @returns {object|null}
 */
export function getFeatureByLegacyRoute(hash) {
  const key = legacyRouteKey(hash);
  for (const feature of FEATURES) {
    if (feature.legacyRoutes.some((lr) => legacyRouteKey(lr) === key)) {
      return feature;
    }
  }
  if (key in LEGACY_ROUTES) {
    const canonical = LEGACY_ROUTES[key];
    return FEATURES.find((f) => f.canonicalRoute === canonical) || null;
  }
  return null;
}

function isKnownObjectiveView(objective, view) {
  if (objective === 'home') return view == null;
  if (objective === 'settings') return view == null;
  const views = VIEWS[objective];
  if (!views) return false;
  if (view == null) return true;
  return views.includes(view);
}

/**
 * @returns {string[]}
 */
export function validateRegistry() {
  const problems = [];
  const ids = new Set();
  const sectionIds = new Set();

  for (const feature of FEATURES) {
    if (ids.has(feature.id)) {
      problems.push(`duplicate feature id: ${feature.id}`);
    }
    ids.add(feature.id);

    if (!VALID_OWNERS.includes(feature.owner)) {
      problems.push(`invalid owner for ${feature.id}: ${feature.owner}`);
    }

    if (!VALID_KINDS.includes(feature.kind)) {
      problems.push(`invalid kind for ${feature.id}: ${feature.kind}`);
    }

    if (!feature.sectionId) {
      problems.push(`empty sectionId for ${feature.id}`);
    } else if (sectionIds.has(feature.sectionId)) {
      problems.push(`duplicate sectionId: ${feature.sectionId}`);
    }
    sectionIds.add(feature.sectionId);

    const parsed = parseRoute(feature.canonicalRoute);
    if (parsed.unknown || !isKnownObjectiveView(parsed.objective, parsed.view)) {
      problems.push(`canonicalRoute for ${feature.id} does not resolve to a known objective+view`);
    }
    if (parsed.hash !== feature.canonicalRoute) {
      problems.push(`canonicalRoute for ${feature.id} is not canonical: ${feature.canonicalRoute} vs ${parsed.hash}`);
    }

    for (const legacy of feature.legacyRoutes) {
      const key = legacyRouteKey(legacy);
      if (!(key in LEGACY_ROUTES)) {
        problems.push(`legacy route ${legacy} for ${feature.id} missing from LEGACY_ROUTES`);
        continue;
      }
      if (LEGACY_ROUTES[key] !== feature.canonicalRoute) {
        problems.push(
          `legacy route ${legacy} maps to ${LEGACY_ROUTES[key]}, expected ${feature.canonicalRoute}`,
        );
      }
    }
  }

  return problems;
}
