// The saved state of Riff Spark.
//
// One settings entry keeps the current cadence, the current pedal riff, the
// pedal settings, and the sound choices, so a reload lands the player where
// they were. Tempo, root, scale, and tuning come from the shared musical
// context and are not stored here.

import { getSetting, saveSetting } from '../persistence.js';
import { generateCadence, normalizeCadence, settingsOf } from './cadenceModel.js';
import { normalizePedal, DEFAULT_PEDAL_SETTINGS, paletteById, RATIO_MIN, RATIO_MAX } from './pedalModel.js';

const STATE_KEY = 'spark.state';

function normalizePedalSettings(raw) {
  const base = { ...DEFAULT_PEDAL_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;
  const ratio = Number(raw.ratio);
  const anchors = Math.round(Number(raw.anchors));
  return {
    palette: paletteById(raw.palette).id,
    ratio: Number.isFinite(ratio) ? Math.max(RATIO_MIN, Math.min(RATIO_MAX, ratio)) : base.ratio,
    anchors: Number.isFinite(anchors) ? Math.max(1, Math.min(4, anchors)) : base.anchors,
    octaveUp: raw.octaveUp !== false,
  };
}

/** The state read from storage, or a fresh one. */
export function readSparkState() {
  const saved = getSetting(STATE_KEY, null);
  const cadence = normalizeCadence(saved?.cadence);
  return {
    cadence,
    draw: { ...settingsOf(cadence), ...(saved?.draw && typeof saved.draw === 'object' ? saved.draw : {}) },
    pedal: normalizePedal(saved?.pedal),
    pedalSettings: normalizePedalSettings(saved?.pedalSettings),
    pulseOn: saved?.pulseOn !== false,
    showDegrees: saved?.showDegrees === true,
  };
}

/** Write the state. */
export function saveSparkState(state) {
  saveSetting(STATE_KEY, {
    cadence: state.cadence,
    draw: state.draw,
    pedal: state.pedal,
    pedalSettings: state.pedalSettings,
    pulseOn: state.pulseOn,
    showDegrees: state.showDegrees,
  });
}

/** A fresh cadence under the saved draw settings. */
export function freshCadence(state, seed = '') {
  return generateCadence({ ...state.draw, seed });
}
