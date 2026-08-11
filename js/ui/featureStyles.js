/**
 * Load feature-specific stylesheets on first mount.
 * All listed files remain in the service-worker precache for offline use.
 */

// Features that mount a Guitar Pro score need the player styles too, not just
// the Scores screen. mountGpPlayer also requests them as a safety net.
const GP_PLAYER_STYLES = ['css/gpplayer.css', 'css/gpimport.css', 'css/tabanalyzer.css'];

const FEATURE_STYLES = {
  songwriter: ['css/songwriter.css'],
  exercises: ['css/exercises.css', 'css/companions.css', ...GP_PLAYER_STYLES],
  workbooks: ['css/workbooks.css', 'css/companions.css', ...GP_PLAYER_STYLES],
  routines: ['css/routines.css'],
  drums: ['css/drums.css'],
  chordlab: ['css/chordworkout.css'],
  notes: ['css/notes.css'],
  practice: ['css/practice.css'],
  metronome: ['css/practice.css'],
  gpplayer: GP_PLAYER_STYLES,
  tracktosheet: ['css/tracktosheet.css'],
  intervalorbit: ['css/intervalorbit.css'],
  studylab: ['css/study-lab.css'],
  triads: ['css/triads.css'],
  chords: ['css/ux-chords-orbit.css'],
  musicprefs: ['css/sync.css'],
  scaleref: ['css/generators.css'],
};

const loaded = new Set();

/**
 * @param {string} featureId
 */
export function ensureFeatureStyles(featureId) {
  const sheets = FEATURE_STYLES[featureId];
  if (!sheets?.length) return;
  if (typeof document === 'undefined' || !document.head) return;
  for (const href of sheets) {
    if (loaded.has(href)) continue;
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      loaded.add(href);
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    loaded.add(href);
  }
}

/** @returns {string[]} */
export function featureStylesFor(featureId) {
  return FEATURE_STYLES[featureId] ? [...FEATURE_STYLES[featureId]] : [];
}
