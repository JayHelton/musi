// The shared neck renderer, seen from inside Practice Lab.
//
// The Scale Reference and Composition Lab draw the same neck: the same strings,
// the same fret numbers, the same note markers. `js/scaleFretboard.js` owns
// that drawing, and this adapter is how the feature reaches it.

export { renderFretboard, MAX_FRET } from '../../scaleFretboard.js';
