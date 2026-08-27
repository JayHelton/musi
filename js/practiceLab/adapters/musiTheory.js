// The shared music-theory engine, seen from inside Practice Lab.
//
// Musi keeps one music-theory engine in `js/`, and the web app and the CLI both
// read it. The Theory tab reads it too, but every other file of this feature
// stays inside the folder. So this adapter is the one seam: it re-exports the
// parts of the engine the tab uses, and nothing else reaches across.
//
// A micro app that mounts this feature on its own replaces this file and keeps
// the rest of the folder unchanged.

export {
  parseNote,
  spellNote,
  ROOTS,
  TUNINGS,
  INTERVAL_LABELS,
  NOTE_NAMES_SHARP,
} from '../../theory.js';

export {
  SCALES,
  getScaleNotes,
  groupedScaleEntries,
  scaleStepPattern,
  shortScaleName,
} from '../../scales.js';

export { resolveTuningKey } from '../../tunings.js';
