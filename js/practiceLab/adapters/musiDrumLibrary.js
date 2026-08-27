// The drum library, seen from inside Practice Lab.
//
// Musi keeps the drum beats, the rudiments, and the score builder in `js/`. The
// drum screens of this feature read them, and every other file of the folder
// stays inside it. So this adapter is the one seam.
//
// Nothing here touches the DOM, so the container and a Node test both read it.
// The screen mounts the player through `musiScoreMount.js` instead.
//
// A micro app that mounts this feature on its own replaces this file and keeps
// the rest of the folder unchanged.

export {
  BEATS,
  BEAT_GENRES,
  beatById,
  beatsOfGenre,
} from '../../drums/beatLibrary.js';

export {
  RUDIMENTS,
  RUDIMENT_FAMILIES,
  rudimentById,
  rudimentsOfFamily,
} from '../../drums/rudimentLibrary.js';

export {
  pickWarmUp,
  warmUpHistory,
  warmUpLabel,
  WARM_UP_COOLDOWN,
} from '../../drums/warmUp.js';

export { gpResultOf } from '../../drums/patternScore.js';
