// The Guitar Pro player, seen from inside Practice Lab.
//
// The player owns a large amount of the DOM, so it sits behind its own adapter.
// A drum card is the only screen of this feature that mounts a score, and a
// micro app can replace this file with its own renderer.

export { mountGpPlayer } from '../../gpPlayerUI.js';
