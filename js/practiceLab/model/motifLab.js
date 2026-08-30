// Transformations, motif families, and section function.
//
// A writer who changes everything at once learns nothing. Each transformation
// card names what to preserve and what to change, so the player hears which
// part of the idea carries the identity.
//
// A motif family is one original and its descendants. The lab shows "what
// stays" and "what changes" beside every variant, because five saved riffs
// with no relation between them teach nothing.
//
// This module is pure. It touches no screen, no clock, and no audio.

/** The five families of change a writer can make. */
export const TRANSFORM_GROUPS = [
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'shape', label: 'Shape' },
  { id: 'texture', label: 'Texture' },
  { id: 'form', label: 'Form' },
];

/**
 * @typedef {Object} TransformCard
 * @property {string} id
 * @property {string} group one of TRANSFORM_GROUPS
 * @property {string} label
 * @property {string} preserve what the variant must keep
 * @property {string} change what the variant must alter
 * @property {string} how one concrete way to do it
 * @property {boolean} [grid] the card also changes the attack grid
 */

/** Every transformation card the lab offers. */
export const TRANSFORM_CARDS = [
  // --- rhythm ---
  {
    id: 'displacement',
    group: 'rhythm',
    label: 'Displacement',
    preserve: 'The pitches and their order.',
    change: 'Where the attacks fall in the bar.',
    how: 'Move every attack one or two slots later and keep the bar length.',
    grid: true,
  },
  {
    id: 'expansion-rhythm',
    group: 'rhythm',
    label: 'Expansion',
    preserve: 'The pitch sequence and the contour.',
    change: 'The gaps between attacks grow.',
    how: 'Double the distance between attacks from the first attack out.',
    grid: true,
  },
  {
    id: 'compression-rhythm',
    group: 'rhythm',
    label: 'Compression',
    preserve: 'The pitch sequence and the contour.',
    change: 'The gaps between attacks shrink.',
    how: 'Halve the distance between attacks from the first attack out.',
    grid: true,
  },
  {
    id: 'density',
    group: 'rhythm',
    label: 'Density change',
    preserve: 'The first attack and the last attack.',
    change: 'How many attacks sit between them.',
    how: 'Add or remove attacks in the middle. Do not move the ends.',
    grid: true,
  },
  // --- pitch ---
  {
    id: 'interval-substitution',
    group: 'pitch',
    label: 'Interval substitution',
    preserve: 'The rhythm, note for note.',
    change: 'One degree becomes another.',
    how: 'Swap one degree for a neighbour and leave the rest alone.',
  },
  {
    id: 'modal-recolour',
    group: 'pitch',
    label: 'Modal recoloring',
    preserve: 'The rhythm and the tonal center.',
    change: 'One characteristic degree of the collection.',
    how: 'Raise or lower the degree that names the mode, such as b6 to 6.',
  },
  {
    id: 'transpose',
    group: 'pitch',
    label: 'Transpose',
    preserve: 'Every interval inside the idea.',
    change: 'The pitch the idea starts on.',
    how: 'Move the whole idea to another degree of the same collection.',
  },
  // --- shape ---
  {
    id: 'register-transfer',
    group: 'shape',
    label: 'Register transfer',
    preserve: 'The rhythm and the degree sequence.',
    change: 'The octave one or more notes sit in.',
    how: 'Move the highest note down an octave, or the lowest note up.',
  },
  {
    id: 'contour-change',
    group: 'shape',
    label: 'Contour change',
    preserve: 'The rhythm and the pitch set.',
    change: 'The order the pitches arrive in.',
    how: 'Turn a rising line into a line that rises, then falls.',
  },
  {
    id: 'inversion',
    group: 'shape',
    label: 'Inversion',
    preserve: 'The rhythm and the size of each step.',
    change: 'Every step goes the other way.',
    how: 'Mirror each interval around the first note. Keep the result in the collection.',
  },
  // --- texture ---
  {
    id: 'to-power-chord',
    group: 'texture',
    label: 'Single note to power chord',
    preserve: 'The rhythm and the written degrees.',
    change: 'The weight of the chosen attacks.',
    how: 'Add a fifth under the attacks that begin an accent group.',
  },
  {
    id: 'pedal-to-sustain',
    group: 'texture',
    label: 'Pedal to sustained note',
    preserve: 'The tonal center.',
    change: 'A repeated tonic becomes one long tonic.',
    how: 'Replace the pedal attacks with one held note and let the line move over it.',
  },
  {
    id: 'rhythm-to-lead',
    group: 'texture',
    label: 'Rhythm to lead',
    preserve: 'The pitch material.',
    change: 'The role of the part.',
    how: 'Play the same degrees as a single line in a higher register.',
  },
  {
    id: 'lead-to-support',
    group: 'texture',
    label: 'Lead to supporting layer',
    preserve: 'The pitch material.',
    change: 'The part steps behind something else.',
    how: 'Hold the important degrees long and drop the fast notes.',
  },
  // --- form ---
  {
    id: 'fragmentation',
    group: 'form',
    label: 'Fragmentation',
    preserve: 'One recognisable piece of the idea.',
    change: 'The rest of the idea goes away.',
    how: 'Keep the first three attacks and repeat them.',
  },
  {
    id: 'expansion-form',
    group: 'form',
    label: 'Expansion',
    preserve: 'The opening of the idea.',
    change: 'The idea runs longer before it closes.',
    how: 'Add one more bar before the ending arrives.',
  },
  {
    id: 'cadential-rewrite',
    group: 'form',
    label: 'Cadential rewrite',
    preserve: 'Everything up to the last attack.',
    change: 'How the phrase ends.',
    how: 'Change the final pitch, or delay it by two slots.',
  },
  {
    id: 'call-and-response',
    group: 'form',
    label: 'Call and response',
    preserve: 'The idea as the call.',
    change: 'A second phrase answers it.',
    how: 'Write an answer with the same rhythm and a different ending.',
  },
];

const CARD_BY_ID = new Map(TRANSFORM_CARDS.map(c => [c.id, c]));

/** One transformation card by id. */
export function cardById(id) {
  return CARD_BY_ID.get(id) || null;
}

/** The cards of one group. */
export function cardsInGroup(groupId) {
  return TRANSFORM_CARDS.filter(card => card.group === groupId);
}

/** One card at random, out of a group or out of all of them. */
export function pickCard(rng = Math.random, groupId = '') {
  const pool = groupId ? cardsInGroup(groupId) : TRANSFORM_CARDS;
  if (!pool.length) return TRANSFORM_CARDS[0];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/* --- motif family ---------------------------------------------------- */

/** The five descendants a family holds, each with a default card. */
export const VARIANT_SLOTS = [
  { id: 'A', label: 'Variant A', card: 'displacement' },
  { id: 'B', label: 'Variant B', card: 'interval-substitution' },
  { id: 'C', label: 'Variant C', card: 'expansion-rhythm' },
  { id: 'D', label: 'Variant D', card: 'register-transfer' },
  { id: 'E', label: 'Variant E', card: 'cadential-rewrite' },
];

/**
 * A new motif family.
 * @param {Object} [seed]
 * @param {string} [seed.name]
 * @param {boolean[]} [seed.grid] the attack grid of the original
 * @param {Record<number,string>} [seed.pitches] the degree of each attack
 * @param {string} [seed.identity] the part that must survive
 * @returns {Object} the family
 */
export function newMotifFamily(seed = {}) {
  return {
    name: seed.name || 'Motif 1',
    identity: seed.identity || '',
    original: {
      grid: Array.isArray(seed.grid) ? seed.grid.slice() : [],
      pitches: { ...(seed.pitches || {}) },
      note: seed.note || '',
    },
    variants: VARIANT_SLOTS.map(slot => ({
      id: slot.id,
      label: slot.label,
      cardId: slot.card,
      note: '',
      grid: [],
      pitches: {},
      done: false,
    })),
  };
}

/**
 * The "what stays / what changes" pair for one variant.
 * @param {Object} family
 * @param {string} variantId
 * @returns {{stays: string, changes: string, how: string, label: string}|null}
 */
export function variantBrief(family, variantId) {
  const variant = (family?.variants || []).find(v => v.id === variantId);
  if (!variant) return null;
  const card = cardById(variant.cardId) || TRANSFORM_CARDS[0];
  const identity = family.identity ? ` The family keeps: ${family.identity}` : '';
  return {
    label: `${variant.label} — ${card.label}`,
    stays: `${card.preserve}${identity}`,
    changes: card.change,
    how: card.how,
  };
}

/** Replace the card of one variant. Returns a new family. */
export function setVariantCard(family, variantId, cardId) {
  if (!cardById(cardId)) return family;
  return {
    ...family,
    variants: (family.variants || []).map(v => (
      v.id === variantId ? { ...v, cardId } : v
    )),
  };
}

/** Write the player's note on one variant. Returns a new family. */
export function setVariantNote(family, variantId, note, done) {
  return {
    ...family,
    variants: (family.variants || []).map(v => (
      v.id === variantId
        ? { ...v, note, done: done == null ? !!String(note || '').trim() : !!done }
        : v
    )),
  };
}

/** How many variants carry a written note. */
export function familyProgress(family) {
  const variants = family?.variants || [];
  const done = variants.filter(v => v.done).length;
  return { done, total: variants.length };
}

/* --- section function ------------------------------------------------ */

/** What each section of a piece has to do. */
export const SECTIONS = [
  {
    id: 'opening',
    label: 'Opening',
    purpose: [
      'Establish the identity of the idea.',
      'Establish the tonal center.',
      'Establish the signature rhythm or interval.',
    ],
    groups: ['pitch', 'texture'],
  },
  {
    id: 'verse',
    label: 'Verse',
    purpose: [
      'Create movement.',
      'Fragment the idea.',
      'Change the density.',
      'Displace the rhythm.',
      'Do not repeat the opening.',
    ],
    groups: ['rhythm', 'form'],
  },
  {
    id: 'chorus',
    label: 'Chorus',
    purpose: [
      'Broaden the idea.',
      'Clarify it.',
      'Add structural weight.',
      'Use longer values and root movement.',
      'Strengthen the cadence.',
    ],
    groups: ['texture', 'shape', 'form'],
  },
];

/** One section by id. */
export function sectionById(id) {
  return SECTIONS.find(s => s.id === id) || null;
}

/**
 * A transformation constraint for each section, drawn from that section's
 * own groups, so the three sections never get the same brief.
 * @param {Function} [rng]
 * @returns {{sectionId: string, label: string, card: TransformCard}[]}
 */
export function sectionAssignment(rng = Math.random) {
  const used = new Set();
  return SECTIONS.map((section) => {
    let card = null;
    for (let attempt = 0; attempt < 12 && !card; attempt += 1) {
      const group = section.groups[Math.floor(rng() * section.groups.length) % section.groups.length];
      const pick = pickCard(rng, group);
      if (!used.has(pick.id)) card = pick;
    }
    if (!card) card = TRANSFORM_CARDS.find(c => !used.has(c.id)) || TRANSFORM_CARDS[0];
    used.add(card.id);
    return { sectionId: section.id, label: section.label, card };
  });
}
