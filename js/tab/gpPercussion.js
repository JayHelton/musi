// Guitar Pro percussion helpers: map kit MIDI / element values onto Musi's
// drum instrument vocabulary, and describe a PercussionModel parallel to TabModel.

/** GP5 legacy percussion values that aren't standard GM — remap like alphaTab. */
const GP5_PERC_FALLBACK = new Map([
  [27, 42], // High Q → closed hat
  [28, 60], // Slap → hi bongo-ish; map to tomHigh later via GM
  [32, 31], // Square click
]);

/**
 * Map a General MIDI / GP kit note number onto a Musi DrumInstrument.
 * Unknown values return null (ignored).
 * @param {number} midi
 * @param {{ velocity?: number }} [opts]
 * @returns {string|null}
 */
export function midiToDrumInstrument(midi, opts = {}) {
  let n = Number(midi);
  if (!Number.isFinite(n)) return null;
  if (GP5_PERC_FALLBACK.has(n)) n = GP5_PERC_FALLBACK.get(n);
  const vel = Number(opts.velocity);

  // Kick
  if (n === 35 || n === 36) return 'kick';
  // Snare family
  if (n === 37) return 'snare'; // side stick → snare click
  if (n === 38 || n === 40) {
    if (Number.isFinite(vel) && vel < 0.45) return 'snareGhost';
    return 'snare';
  }
  if (n === 39) return 'snare'; // hand clap → snare-ish
  // Toms (high → floor)
  if (n === 48 || n === 50) return 'tomHigh';
  if (n === 45 || n === 47) return 'tomMid';
  if (n === 41 || n === 43) return 'tomFloor';
  // Hats
  if (n === 42 || n === 44) return 'hihatClosed';
  if (n === 46) return 'hihatOpen';
  // Ride / crash / splash / china
  if (n === 51 || n === 53 || n === 59) return 'ride';
  if (n === 49 || n === 57 || n === 55 || n === 52) return 'crash';
  // Soft snares / ghosts sometimes encoded as low velocity on 38 already handled.
  // Extra GS / GP kit notes commonly used for hats/kicks/toms:
  if (n >= 22 && n <= 26) return 'hihatClosed';
  if (n >= 11 && n <= 20) return n >= 15 ? 'hihatOpen' : 'hihatClosed';
  if (n === 33) return 'snareGhost';
  if (n === 34) return 'kick';
  if (n === 60 || n === 61) return 'tomHigh'; // bongos → high tom
  if (n === 62 || n === 63 || n === 64) return 'tomMid';
  return null;
}

/** Normalize a GP5 percussion fret/value to a GM-ish MIDI note. */
export function normalizeGp5PercussionMidi(fret) {
  const n = Number(fret);
  if (!Number.isFinite(n)) return null;
  return GP5_PERC_FALLBACK.has(n) ? GP5_PERC_FALLBACK.get(n) : n;
}

/**
 * Velocity from GP dynamics byte / GPIF if present. Defaults to a medium hit.
 * GP dynamics: 1=ppp … 8=fff (roughly).
 */
export function dynamicsToVelocity(dyn) {
  const d = Number(dyn);
  if (!Number.isFinite(d)) return 0.78;
  if (d <= 0) return 0.78;
  // Map 1..8 → ~0.3..1.0
  if (d >= 1 && d <= 8) return Math.max(0.28, Math.min(1, 0.25 + d * 0.1));
  // Already 0..1 or 0..127
  if (d <= 1) return Math.max(0.2, Math.min(1, d));
  if (d <= 127) return Math.max(0.2, Math.min(1, d / 127));
  return 0.78;
}

/**
 * Build a PercussionModel from timed drum hits.
 * @typedef {{ slot:number, start:number, duration:number, instrument:string, velocity:number, midi:number }} PercEvent
 * @typedef {{
 *   percussion: true,
 *   name: string,
 *   tempo: number,
 *   events: PercEvent[],
 *   measures: Array<{startSlot:number,endSlot:number,startBeat:number,endBeat:number,marker:?string,timeSig?:number[]}>,
 *   slots: number,
 *   totalBeats: number,
 *   warnings: string[],
 * }} PercussionModel
 */
export function makePercussionModel({ name, tempo, events, measures, warnings = [] }) {
  const evs = (events || []).slice().sort((a, b) => (a.slot - b.slot) || (a.midi - b.midi));
  const slots = evs.length ? Math.max(...evs.map((e) => e.slot)) + 1 : (measures?.length || 0);
  const totalBeats = measures?.length
    ? measures[measures.length - 1].endBeat
    : (evs.length ? Math.max(...evs.map((e) => e.start + (e.duration || 0))) : 0);
  return {
    percussion: true,
    name: name || 'Drums',
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
    events: evs,
    measures: measures || [],
    slots,
    totalBeats,
    warnings,
  };
}
