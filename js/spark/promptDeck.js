// The prompt decks of Riff Spark.
//
// A blank bar is the hardest place to start. Each deck holds one kind of
// push: a restriction to write under, an answer to "what should happen next",
// a job for a section, a density arc, a mutation, or a piece of vocabulary.
// The tool draws one card, or one full brief, and the player writes.
//
// This module is pure. It touches no screen, no clock, and no audio.

import { createRng, randomSeed, pickOne } from './rng.js';
import { allColors } from './pedalModel.js';

/**
 * @typedef {Object} PromptCard
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} [hint]
 */

export const RESTRICTION_CARDS = [
  { id: 'one-string', title: 'One string', body: 'Write for ten minutes on one string only.', hint: 'The neck shape cannot lead. The rhythm and the intervals must.' },
  { id: 'three-pitches', title: 'Three pitches', body: 'Use three pitches and nothing else. Passing tones are not allowed.', hint: 'Pick the three first. Then design the rhythm.' },
  { id: 'eighths-only', title: 'Eighth notes and rests', body: 'Only eighth notes and rests. No sixteenths.', hint: 'The rests carry the riff. Place them with care.' },
  { id: 'root-b2-b5', title: 'Root, b2, and b5', body: 'Only the root, the b2, and the b5.', hint: 'This is the ugliest palette. Make it groove anyway.' },
  { id: 'no-open-chug', title: 'No open chugs', body: 'Do not play the open low string.', hint: 'Every low note is fretted. Hear what that does to the attack.' },
  { id: 'one-sustain', title: 'One sustained note', body: 'Every phrase must hold one note for a beat or more.', hint: 'Place the sustain where the vocalist would breathe.' },
  { id: 'three-three-two', title: '3 + 3 + 2 bars', body: 'The phrase is three bars, then three bars, then two bars.', hint: 'The two-bar tail is the hook. Write it last.' },
  { id: 'displaced-half', title: 'Displaced second half', body: 'The second half of the riff is the first half, moved one eighth note later.', hint: 'Play it against a straight click, and feel the seam.' },
  { id: 'rest-after-accent', title: 'Silence after the accent', body: 'Every accent is followed by a rest of at least two sixteenths.', hint: 'Attack, absence, attack.' },
  { id: 'downbeat-free', title: 'No downbeat', body: 'Bar one has no attack on beat one.', hint: 'The band lands on one. The guitar arrives late.' },
  { id: 'pedal-only', title: 'Pedal only', body: 'Play the root on every attack. Change the rhythm and the articulation only.', hint: 'Mute, ring, slide, and harmonic are your only colors.' },
  { id: 'two-bars-one-note', title: 'Two bars, one new note', body: 'Bar one is the root only. Bar two adds one other pitch, once.', hint: 'The whole riff waits for that one note.' },
];

export const NEXT_CARDS = [
  { id: 'higher', title: 'Higher', body: 'The next event goes up. Move the final note up an octave, or take the phrase to the next string.' },
  { id: 'lower', title: 'Lower', body: 'The next event goes down. Drop to the lowest string, or end a half step under the root.' },
  { id: 'slower', title: 'Slower', body: 'Halve the attack rate. Make the same phrase in half time.' },
  { id: 'faster', title: 'Faster', body: 'Double the attack rate for two beats, then stop.' },
  { id: 'emptier', title: 'Emptier', body: 'Remove every second attack. Let the rests speak.' },
  { id: 'chromatic', title: 'More chromatic', body: 'Approach the root from a semitone above or below, twice.' },
  { id: 'melodic', title: 'More melodic', body: 'Write a four-note line: a chord tone, a passing tone, a target tone, and a rest.' },
  { id: 'repeat', title: 'Repeat', body: 'Play the bar again with no change. Let it settle.' },
  { id: 'surprise', title: 'Surprise', body: 'Break the pattern once: a rest where the attack was due, or an attack in the rest.' },
  { id: 'resolve', title: 'Resolve', body: 'End on the root, on the downbeat, and hold it.' },
  { id: 'no-resolve', title: 'Do not resolve', body: 'End on the b2 or the b5, and cut it short.' },
  { id: 'impact', title: 'Impact', body: 'One chord stab on beat one, then silence for the rest of the bar.' },
];

export const SECTION_CARDS = [
  { id: 'intro', title: 'Intro', body: 'Establish the identity. One motif, stated plainly.' },
  { id: 'verse', title: 'Verse', body: 'Rhythmic aggression. Leave space for the vocal line.' },
  { id: 'pre-chorus', title: 'Pre-chorus', body: 'Increase the tension. Raise the density, or the register, or both.' },
  { id: 'chorus', title: 'Chorus', body: 'The strongest melodic idea. Make the roots move under a lead.' },
  { id: 'verse-two', title: 'Verse two', body: 'Mutate the first verse. Change one variable, not five.' },
  { id: 'bridge', title: 'Bridge', body: 'Destabilize. Change the meter, the tonal center, or the density.' },
  { id: 'breakdown', title: 'Breakdown', body: 'Physical impact. Set a rhythmic expectation, then break it.' },
  { id: 'solo', title: 'Solo', body: 'The climax and the release. Give the lead the widest register.' },
  { id: 'final-chorus', title: 'Final chorus', body: 'The thematic payoff. Bring the intro motif back under the chorus.' },
];

/** The steps a density arc can hold. */
export const DENSITY_STEPS = [
  { id: 'silence', label: 'Silence', body: 'No attacks. One bar of nothing.' },
  { id: 'sparse', label: 'Sparse', body: 'A chug, a long rest, and one chord.' },
  { id: 'medium', label: 'Medium', body: 'Chug, chug, a note, chug, a note.' },
  { id: 'dense', label: 'Dense', body: 'Pedal, a three-note run, pedal, a five-note burst.' },
  { id: 'impact', label: 'Impact', body: 'One stab on the downbeat, then the room rings.' },
];

/** Arcs that give a section a form without a change of harmony. */
export const DENSITY_ARCS = [
  ['sparse', 'medium', 'dense', 'silence', 'impact'],
  ['dense', 'dense', 'sparse', 'impact'],
  ['medium', 'sparse', 'medium', 'dense'],
  ['silence', 'impact', 'silence', 'impact', 'dense'],
  ['sparse', 'sparse', 'medium', 'medium', 'dense', 'impact'],
  ['dense', 'silence', 'dense', 'silence', 'sparse'],
];

export const MUTATION_CARDS = [
  { id: 'rhythmic', title: 'Rhythmic mutation', body: 'Keep the pitches. Move the attacks.', hint: 'Displace, expand, or compress the rhythm.' },
  { id: 'pitch', title: 'Pitch mutation', body: 'Keep the rhythm. Change one interruption to another degree.', hint: 'b2 to b5, or b6 to 7.' },
  { id: 'register', title: 'Register mutation', body: 'Move the final note up an octave.', hint: 'The same note in a new place reads as a new idea.' },
  { id: 'articulation', title: 'Articulation mutation', body: 'Turn the second half into tremolo picking.', hint: 'Or palm mute the first half and let the second ring.' },
  { id: 'harmonic', title: 'Harmonic mutation', body: 'A second guitar enters in thirds or sixths.', hint: 'Keep the low guitar as it was.' },
  { id: 'metric', title: 'Metric mutation', body: 'Remove one eighth note. The bar is now 7/8.', hint: 'Loop it against a straight drum beat.' },
  { id: 'ending', title: 'Ending mutation', body: 'Keep the first three beats. Write a new beat four.', hint: 'Question and answer in one bar.' },
];

export const VOCABULARY_CARDS = [
  { id: 'pedal-b2-octave', title: 'Pedal, b2, octave', body: 'Root chugs, one b2 accent, then the root an octave up.' },
  { id: 'pedal-tremolo-b6', title: 'Pedal into tremolo b6', body: 'Root chugs for a bar, then tremolo pick the b6 for a bar.' },
  { id: 'low-chug-stab', title: 'Low chug, upper stab', body: 'Two low chugs, then a chord stab high on the neck.' },
  { id: 'descend-5-b5-4', title: 'Descending 5, b5, 4', body: 'A three-note chromatic descent from the fifth, over the root.' },
  { id: 'root-diminished', title: 'Root plus diminished shape', body: 'Root, b3, b5. Arpeggiate it, then chug the root.' },
  { id: 'cell-332', title: '3 + 3 + 2 chug cell', body: 'Three sixteenths, three sixteenths, two sixteenths. Repeat and displace.' },
  { id: 'sustain-blast', title: 'Long sustain, then sixteenths', body: 'Hold one note for two beats, then a blast of eight sixteenths.' },
  { id: 'harmonic-sting', title: 'Harmonic sting', body: 'A pinch harmonic on the last attack of the bar, then a rest.' },
  { id: 'slide-in', title: 'Slide into the root', body: 'Slide from the b2 down into the root on beat one.' },
  { id: 'octave-answer', title: 'Octave answer', body: 'Bar one low. Bar two the same phrase an octave up.' },
];

/** The interval color deck, from the shared interval table. */
export function intervalCards() {
  return allColors().map(row => ({
    id: `interval-${row.id}`,
    title: `${row.id} — ${row.name}`,
    body: `${row.character}. ${row.functions}.`,
    hint: row.examples && row.examples.length ? row.examples[0] : '',
  }));
}

export const DECKS = [
  { id: 'restriction', label: 'Restriction game', blurb: 'A rule to write under for ten minutes.' },
  { id: 'next', label: 'What happens next', blurb: 'The simplest event that answers the question.' },
  { id: 'interval', label: 'Interval color', blurb: 'One degree against the root, and what it does.' },
  { id: 'density', label: 'Density arc', blurb: 'A form for a section with no change of harmony.' },
  { id: 'mutation', label: 'Mutation', blurb: 'One change to a riff you already have.' },
  { id: 'section', label: 'Section job', blurb: 'What this part of the song must do.' },
  { id: 'vocabulary', label: 'Vocabulary', blurb: 'One piece from the riff notebook.' },
];

export function deckById(id) {
  return DECKS.find(d => d.id === id) || DECKS[0];
}

function densityCard(arc) {
  const steps = arc.map(id => DENSITY_STEPS.find(s => s.id === id)).filter(Boolean);
  return {
    id: `density-${arc.join('-')}`,
    title: steps.map(s => s.label).join(' → '),
    body: steps.map(s => s.body).join(' '),
    hint: 'One bar or two per step. The harmony can stay still.',
  };
}

/**
 * The cards of one deck.
 * @param {string} deckId
 * @returns {PromptCard[]}
 */
export function cardsOf(deckId) {
  switch (deckById(deckId).id) {
    case 'restriction': return RESTRICTION_CARDS;
    case 'next': return NEXT_CARDS;
    case 'interval': return intervalCards();
    case 'density': return DENSITY_ARCS.map(densityCard);
    case 'mutation': return MUTATION_CARDS;
    case 'section': return SECTION_CARDS;
    case 'vocabulary': return VOCABULARY_CARDS;
    default: return RESTRICTION_CARDS;
  }
}

/**
 * Draw one card from a deck. The last card drawn does not come back at once.
 * @param {string} deckId
 * @param {{rng?: Function, exclude?: string}} [options]
 * @returns {PromptCard}
 */
export function drawCard(deckId, { rng = Math.random, exclude = '' } = {}) {
  const cards = cardsOf(deckId);
  const pool = cards.length > 1 ? cards.filter(c => c.id !== exclude) : cards;
  return pickOne(pool, rng);
}

/**
 * A full brief: a color, a restriction, an arc, and a next step, from one seed.
 * @param {string} [seed]
 * @returns {{seed: string, cards: Array<{deck: string, card: PromptCard}>}}
 */
export function drawBrief(seed = '') {
  const usedSeed = seed || randomSeed();
  const rng = createRng(usedSeed);
  const decks = ['interval', 'restriction', 'density', 'next'];
  return {
    seed: usedSeed,
    cards: decks.map(deck => ({ deck, card: drawCard(deck, { rng }) })),
  };
}

/** The twenty-minute drill, step by step. */
export const DRILL_STEPS = [
  { id: 'color', minutes: 2, title: 'Pick one tonal color', body: 'Choose a palette and three degrees. Write them down. Nothing else changes for the drill.' },
  { id: 'rhythms', minutes: 5, title: 'Write five rhythms', body: 'Muted strings only. Draw a cadence, play it, keep it or draw again. Five kept rhythms.' },
  { id: 'pedal', minutes: 5, title: 'Apply the pedal vocabulary', body: 'Take the best rhythm. Alternate root and b2, root and 3, root and 5. Keep the version that hits.' },
  { id: 'mutations', minutes: 5, title: 'Make three mutations', body: 'Change the rhythm, then the ending, then the register. One change each time.' },
  { id: 'contrast', minutes: 5, title: 'Write a contrasting section', body: 'If riff one is busy, riff two is sparse. If riff one is chromatic, riff two is harmonic.' },
  { id: 'melody', minutes: 5, title: 'Add one melodic idea', body: 'A chord tone, a passing tone, a target tone. Not a scale run.' },
];

export function drillTotalMinutes() {
  return DRILL_STEPS.reduce((sum, step) => sum + step.minutes, 0);
}
