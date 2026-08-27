// The saved settings and the shared musical context, seen from inside
// Practice Lab.
//
// The root, the mode, and the tuning are app-wide. A player who sets B Phrygian
// in the Scale Reference must find B Phrygian in the Theory tab, and the
// reverse. `js/musicalContext.js` holds that state, and `js/persistence.js`
// holds the per-tool settings. This adapter is how the feature reaches both.

export { getSetting, saveSetting } from '../../persistence.js';
export { getContext, setContext, subscribeContext } from '../../musicalContext.js';
