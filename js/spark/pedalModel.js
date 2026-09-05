// The pedal-tone model of Riff Spark.
//
// A pedal riff is one low root, interrupted. The root plays on most attacks
// and gives the riff gravity. Two to four attacks in ten play another degree,
// and that degree gives the riff its character: b2 is hostile, b3 is death
// metal, b5 is ugly, b6 is dark, 7 is tension.
//
// The model takes a cadence and decides what each attack plays. It draws a
// few anchor degrees from a palette and builds the riff from those alone, so
// the idea has an identity instead of a scale run.
//
// This module is pure. It touches no screen, no clock, and no audio.

import { createRng, randomSeed, shuffle } from './rng.js';
import { meterById, barCells } from './cadenceModel.js';
import { degreeOrTritone, degreesOfScale, INTERVAL_DEGREES } from '../reference/intervalTable.js';
import { parseNote, spellNote, NOTE_NAMES_SHARP } from '../theory.js';
import { findPresetByName } from '../tunings.js';

/**
 * The palettes. Each one is a set of distances above the root, in semitones.
 * The context palette reads the shared scale instead.
 */
export const PALETTES = [
  { id: 'phrygian', label: 'Phrygian', semitones: [1, 3, 8], blurb: 'Hostile. The b2 leans on the root.' },
  { id: 'phrygian-dominant', label: 'Phrygian dominant', semitones: [1, 4, 8], blurb: 'Exotic. The major 3 against the b2.' },
  { id: 'harmonic-minor', label: 'Harmonic minor', semitones: [3, 8, 11], blurb: 'Dramatic. The 7 pulls back to the root.' },
  { id: 'brutal', label: 'Brutal', semitones: [1, 6, 8], blurb: 'Ugly. Semitone and tritone friction only.' },
  { id: 'death', label: 'Death metal', semitones: [3, 6, 10], blurb: 'Modal. The b3, the b5, and the b7.' },
  { id: 'martial', label: 'Martial', semitones: [5, 7, 10], blurb: 'Stable. Fourths and fifths, no quality.' },
  { id: 'melodic', label: 'Melodic', semitones: [3, 5, 7, 10], blurb: 'Open. A minor line over the pedal.' },
  { id: 'chromatic', label: 'Chromatic', semitones: [1, 2, 3, 6, 11], blurb: 'Every close neighbour of the root.' },
  { id: 'context', label: 'Context scale', semitones: [], blurb: 'The degrees of the shared scale.' },
];

/** The default draw settings. */
export const DEFAULT_PEDAL_SETTINGS = {
  palette: 'phrygian',
  ratio: 0.3,
  anchors: 2,
  octaveUp: true,
};

export const RATIO_MIN = 0.1;
export const RATIO_MAX = 0.6;

export function paletteById(id) {
  return PALETTES.find(p => p.id === id) || PALETTES[0];
}

/**
 * The distances a palette offers, in semitones above the root.
 * @param {string} paletteId
 * @param {string} [scaleName] the shared scale, for the context palette
 * @returns {number[]}
 */
export function paletteSemitones(paletteId, scaleName = '') {
  const palette = paletteById(paletteId);
  if (palette.id !== 'context') return palette.semitones.slice();
  const rows = degreesOfScale(scaleName);
  const out = rows.map(r => r.semitones).filter(s => s !== 0);
  return out.length ? out : [3, 7, 10];
}

/**
 * The color row of a distance above the root.
 * @param {number} semitones
 */
export function colorOf(semitones) {
  return degreeOrTritone(semitones);
}

/** Every distance the tool can name, the tritone included, in pitch order. */
export function allColors() {
  const rows = INTERVAL_DEGREES.filter(d => d.semitones !== 0).map(d => d.semitones);
  rows.push(6);
  return rows.sort((a, b) => a - b).map(colorOf);
}

function clampRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return DEFAULT_PEDAL_SETTINGS.ratio;
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, n));
}

function clampAnchors(anchors) {
  const n = Math.round(Number(anchors));
  if (!Number.isFinite(n)) return DEFAULT_PEDAL_SETTINGS.anchors;
  return Math.max(1, Math.min(4, n));
}

/**
 * The attacks of one bar that should carry an interruption, in the order the
 * model prefers them: pitched roles first, then slots at the end of a run or
 * away from a beat. Slot 0 of the bar stays on the root.
 */
function interruptionOrder(cells, pulse, rng) {
  const scored = [];
  cells.forEach((cell, i) => {
    if (!cell || i === 0) return;
    const followedByRest = i + 1 >= cells.length || !cells[i + 1];
    const offbeat = i % pulse !== 0;
    const score = (cell === 'note' ? 4 : 0) + (followedByRest ? 2 : 0) + (offbeat ? 1 : 0) + rng();
    scored.push({ slot: i, score });
  });
  return scored.sort((a, b) => b.score - a.score).map(s => s.slot);
}

/** Draw a degree from the anchors, and avoid the last one drawn. */
function drawAnchor(anchors, last, rng) {
  if (anchors.length === 1) return anchors[0];
  const pool = anchors.filter(a => a !== last);
  const pick = pool[Math.floor(rng() * pool.length)];
  return rng() < 0.8 ? pick : anchors[Math.floor(rng() * anchors.length)];
}

/**
 * Decide what each attack of a cadence plays.
 * @param {Object} options
 * @param {Object} options.cadence
 * @param {number[]} options.semitones the palette, as distances above the root
 * @param {number} [options.ratio] the share of attacks that leave the root
 * @param {number} [options.anchors] how many palette notes the draw may use
 * @param {boolean} [options.octaveUp] a stab plays the root an octave up
 * @param {string} [options.seed]
 * @returns {{seed: string, anchors: number[], ratio: number, octaveUp: boolean,
 *   events: Array<{slot: number, semitones: number, role: string, octave: number}>}}
 */
export function generatePedal({ cadence, semitones, ratio, anchors, octaveUp, seed } = {}) {
  const meter = meterById(cadence?.meter);
  const palette = Array.isArray(semitones) && semitones.length ? semitones : [1, 3, 8];
  const share = clampRatio(ratio ?? DEFAULT_PEDAL_SETTINGS.ratio);
  const anchorCount = Math.min(palette.length, clampAnchors(anchors ?? DEFAULT_PEDAL_SETTINGS.anchors));
  const up = octaveUp ?? DEFAULT_PEDAL_SETTINGS.octaveUp;
  const usedSeed = seed ? String(seed) : randomSeed();
  const rng = createRng(usedSeed);

  const chosen = shuffle(palette, rng).slice(0, anchorCount).sort((a, b) => a - b);

  const events = [];
  let firstBar = null;
  let firstOrder = null;
  let last = null;
  for (let b = 0; b < (cadence?.bars || 1); b += 1) {
    const cells = barCells(cadence, b);
    const attacks = cells.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
    const wanted = attacks.length >= 2 ? Math.max(1, Math.round(attacks.length * share)) : 0;
    // A later bar keeps the interruption slots of bar one where the rhythm
    // still has an attack there, so the phrase reads as one idea.
    const fresh = interruptionOrder(cells, meter.pulse, rng);
    const kept = firstOrder ? firstOrder.filter(slot => cells[slot]) : [];
    const order = kept.concat(fresh.filter(slot => !kept.includes(slot))).slice(0, wanted);
    if (!firstOrder) firstOrder = order;
    const bar = new Map();

    for (const slot of attacks) {
      const role = cells[slot];
      let distance = 0;
      if (order.includes(slot)) {
        const same = firstBar && firstBar.get(slot);
        distance = same && same.semitones ? same.semitones : drawAnchor(chosen, last, rng);
        last = distance;
      }
      bar.set(slot, { slot: b * meter.slots + slot, semitones: distance, role, octave: role === 'stab' && up ? 1 : 0 });
    }

    // Bar two answers bar one: the same notes, and a new last interruption.
    if (firstBar && order.length) {
      const lastSlot = order.slice().sort((x, y) => x - y).pop();
      const event = bar.get(lastSlot);
      const first = firstBar.get(lastSlot);
      if (event && first && first.semitones === event.semitones && chosen.length > 1) {
        event.semitones = drawAnchor(chosen, event.semitones, rng);
        last = event.semitones;
      }
    }

    if (!firstBar) firstBar = bar;
    for (const slot of attacks) events.push(bar.get(slot));
  }

  return { seed: usedSeed, anchors: chosen, ratio: share, octaveUp: up, events };
}

/**
 * The note name of a distance above a tonic.
 * @param {string} tonic such as "A"
 * @param {number} semitones
 * @returns {string}
 */
export function noteAbove(tonic, semitones) {
  const parsed = parseNote(String(tonic || 'A'));
  if (!parsed) return '';
  const row = colorOf(semitones);
  const spelled = spellNote(parsed.li, parsed.semi, row.letterStep, row.semitones);
  return spelled || NOTE_NAMES_SHARP[(parsed.semi + row.semitones) % 12];
}

/**
 * The lowest MIDI note the tonic can take on the tuning. The pedal sits on
 * the lowest string, or as close above it as the tonic allows.
 * @param {string} tonic
 * @param {string} [tuningName]
 * @returns {number}
 */
export function basePitchMidi(tonic, tuningName = '') {
  const preset = findPresetByName(tuningName);
  let low = 40;
  if (preset && preset.pitches && preset.pitches.length) {
    const p = preset.pitches[0];
    const parsedLow = parseNote(p.note);
    if (parsedLow) low = (p.oct + 1) * 12 + parsedLow.semi;
  }
  const parsed = parseNote(String(tonic || 'E'));
  const semi = parsed ? parsed.semi : 4;
  let midi = semi;
  while (midi < low) midi += 12;
  return midi;
}

/** The MIDI note of one event. */
export function eventMidi(event, baseMidi) {
  return baseMidi + (event.semitones || 0) + 12 * (event.octave || 0);
}

function eventsBySlot(pedal) {
  const map = new Map();
  for (const event of pedal?.events || []) map.set(event.slot, event);
  return map;
}

/**
 * The note line of a pedal riff, such as "A - Bb A | C - - A".
 * @param {Object} cadence
 * @param {Object} pedal
 * @param {string} tonic
 * @param {{degrees?: boolean}} [options] print degrees instead of notes
 * @returns {string}
 */
export function describePedal(cadence, pedal, tonic, { degrees = false } = {}) {
  const meter = meterById(cadence?.meter);
  const bySlot = eventsBySlot(pedal);
  const bars = [];
  for (let b = 0; b < (cadence?.bars || 1); b += 1) {
    const groups = [];
    for (let i = 0; i < meter.slots; i += meter.pulse) {
      const group = [];
      for (let k = i; k < Math.min(i + meter.pulse, meter.slots); k += 1) {
        const event = bySlot.get(b * meter.slots + k);
        if (!event) { group.push('-'); continue; }
        let name = degrees ? colorOf(event.semitones).id : noteAbove(tonic, event.semitones);
        if (event.octave) name += "'";
        group.push(name);
      }
      groups.push(group.join(' '));
    }
    bars.push(groups.join(' | '));
  }
  return bars.join('  ||  ');
}

/** The attacks only, such as "A A Bb A C A". */
export function attackLine(pedal, tonic, { degrees = false } = {}) {
  return (pedal?.events || []).map((event) => {
    const name = degrees ? colorOf(event.semitones).id : noteAbove(tonic, event.semitones);
    return event.octave ? `${name}'` : name;
  }).join(' ');
}

/**
 * A pedal read back from storage.
 * @param {*} raw
 * @returns {Object|null}
 */
export function normalizePedal(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) return null;
  const events = raw.events
    .filter(e => e && Number.isFinite(Number(e.slot)))
    .map(e => ({
      slot: Math.max(0, Math.round(Number(e.slot))),
      semitones: ((Math.round(Number(e.semitones) || 0) % 12) + 12) % 12,
      role: ['chug', 'note', 'stab'].includes(e.role) ? e.role : 'chug',
      octave: e.octave ? 1 : 0,
    }));
  return {
    seed: typeof raw.seed === 'string' ? raw.seed : randomSeed(),
    anchors: Array.isArray(raw.anchors) ? raw.anchors.map(Number).filter(Number.isFinite) : [],
    ratio: clampRatio(raw.ratio),
    octaveUp: raw.octaveUp !== false,
    events,
  };
}
