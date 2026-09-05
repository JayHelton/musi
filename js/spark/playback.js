// The one player of Riff Spark, and the pattern it plays.
//
// Every tab shares this player, so a tab change or a tool change stops the
// loop in one place.

import { createSparkPlayer } from './sparkPlayer.js';
import { createSparkAudio, createSparkClock } from './sparkAudio.js';
import { meterById } from './cadenceModel.js';
import { basePitchMidi, eventMidi } from './pedalModel.js';

export const player = createSparkPlayer({ audio: createSparkAudio(), clock: createSparkClock() });

/**
 * The pitch of each attack, by slot, for the player.
 * @param {Object} pedal
 * @param {string} tonic
 * @param {string} tuning
 * @returns {Map<number, {midi: number, role: string}>}
 */
export function noteMap(pedal, tonic, tuning) {
  const base = basePitchMidi(tonic, tuning);
  const map = new Map();
  for (const event of pedal?.events || []) {
    map.set(event.slot, { midi: eventMidi(event, base), role: event.role });
  }
  return map;
}

/**
 * A player pattern from a cadence.
 * @param {{cadence: Object, bpm: number, pulseOn: boolean, notes?: Map}} options
 */
export function buildPattern({ cadence, bpm, pulseOn, notes = null }) {
  const meter = meterById(cadence.meter);
  return {
    cells: cadence.cells.slice(),
    slotsPerBar: meter.slots,
    pulse: meter.pulse,
    bpm,
    pulseOn,
    voice: notes ? 'notes' : 'hits',
    notes,
  };
}
