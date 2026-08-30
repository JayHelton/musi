// The longer assignments of Composition Lab.
//
// A guided lab runs over several steps and keeps the player's writing between
// them. The Capstone is a whole short piece with a rubric to score afterwards.
// The Song Study is a three-pass listening workflow that works on any song, so
// no reference track is built into the product.
//
// Every step is a list of fields. Musi holds the brief and the answers. It does
// not hold the music: the player writes that on the instrument, in a recorder,
// or in whatever editor they already use.
//
// This module is pure. It touches no screen, no clock, and no audio.

import { shortScaleName } from '../adapters/musiTheory.js';
import { degreeById, noteForDegree } from '../adapters/musiReference.js';

function field(id, label, placeholder = '', kind = 'textarea') {
  return { id, label, placeholder, kind };
}

/**
 * @typedef {Object} LabStep
 * @property {string} id
 * @property {string} title
 * @property {string} prompt
 * @property {string[]} [brief]
 * @property {Array} fields
 */

/**
 * @typedef {Object} GuidedLab
 * @property {string} id
 * @property {string} label
 * @property {string} summary
 * @property {(context: Object) => LabStep[]} steps
 */

/** The interval theses a player can build a piece around. */
export const THESIS_OPTIONS = [
  { id: 'b2-attacks', label: 'b2 repeatedly attacks the tonic', degree: 'b2' },
  { id: 'b6-falls', label: 'b6 resolves toward 5', degree: 'b6' },
  { id: '7-cadence', label: '7 only appears at the cadence', degree: '7' },
  { id: 'custom', label: 'A thesis of my own', degree: '' },
];

/** The four longer labs. */
export const GUIDED_LABS = [
  {
    id: 'one-interval-thesis',
    label: 'One Interval Thesis',
    summary: 'Build a whole piece around one interval relationship.',
    steps(context) {
      return [
        {
          id: 'thesis',
          title: 'Choose the thesis',
          prompt: 'Name the one interval relationship the piece is about.',
          brief: THESIS_OPTIONS.filter(t => t.degree).map((t) => {
            const degree = degreeById(t.degree);
            const note = noteForDegree(context.tonic, t.degree);
            return `${t.label} — ${t.degree} is ${note}${degree ? `, ${degree.character.toLowerCase()}` : ''}.`;
          }),
          fields: [
            field('thesis', 'The thesis', 'One sentence.', 'text'),
            field('why', 'Why this one?', 'What does it do to a listener?'),
          ],
        },
        {
          id: 'opening',
          title: 'Opening',
          prompt: 'Write an opening that states the thesis at once.',
          brief: [
            'Establish the tonal center.',
            'Establish the signature rhythm.',
            'Make the thesis interval unmistakable.',
          ],
          fields: [field('opening', 'What you wrote', '')],
        },
        {
          id: 'verse',
          title: 'Verse',
          prompt: 'Keep the thesis and change how it arrives.',
          brief: ['Fragment, displace, or change the density.', 'Do not repeat the opening.'],
          fields: [field('verse', 'What you wrote', '')],
        },
        {
          id: 'chorus',
          title: 'Chorus',
          prompt: 'Broaden the thesis and give it structural weight.',
          brief: ['Longer values.', 'Root movement.', 'A stronger cadence.'],
          fields: [field('chorus', 'What you wrote', '')],
        },
        {
          id: 'review',
          title: 'Review',
          prompt: 'Read the three sections back.',
          fields: [
            field('holds', 'Does the thesis hold in all three?', ''),
            field('weakest', 'Which section is weakest, and why?', ''),
          ],
        },
      ];
    },
  },
  {
    id: 'ambiguous-harmony',
    label: 'Ambiguous Harmony',
    summary: 'One progression without thirds, two melodies that read it differently.',
    steps(context) {
      return [
        {
          id: 'progression',
          title: 'Write the progression',
          prompt: `Write a power-chord progression in ${context.tonic}. Use no thirds.`,
          brief: [
            'A root and a fifth carry no quality.',
            'Three or four chords is enough.',
          ],
          fields: [field('progression', 'The progression', 'Roots in scale degrees.', 'text')],
        },
        {
          id: 'melody-a',
          title: 'Melody A',
          prompt: 'Write a melody that makes the progression read one way.',
          brief: ['The melody supplies the quality the chords withhold.'],
          fields: [
            field('melody-a', 'The melody', ''),
            field('reading-a', 'Which mode does it imply?', '', 'text'),
          ],
        },
        {
          id: 'melody-b',
          title: 'Melody B',
          prompt: 'Write a second melody over the same progression with a different reading.',
          brief: ['Change no chord. Change only the melody.'],
          fields: [
            field('melody-b', 'The melody', ''),
            field('reading-b', 'Which mode does it imply now?', '', 'text'),
          ],
        },
        {
          id: 'compare',
          title: 'Compare',
          prompt: 'Say which notes did the work.',
          fields: [field('degrees', 'The degrees that changed the reading', '', 'text')],
        },
      ];
    },
  },
  {
    id: 'two-homes',
    label: 'Same Collection, Two Homes',
    summary: 'One pitch collection, two sections, two centers, no new pitch classes.',
    steps(context) {
      const second = context.secondTonic || noteForDegree(context.tonic, '4') || context.tonic;
      return [
        {
          id: 'collection',
          title: 'Fix the collection',
          prompt: `Lock the pitch collection to ${context.tonic} ${shortScaleName(context.collection)}.`,
          brief: ['You may not add a pitch class in either section.'],
          fields: [field('notes', 'Write the notes out', '', 'text')],
        },
        {
          id: 'section-a',
          title: `Section A — home on ${context.tonic}`,
          prompt: `Write a section that makes ${context.tonic} feel like home.`,
          brief: [
            'Put the center in the bass.',
            'Give it the longest notes and the downbeats.',
            'End phrases on it.',
          ],
          fields: [field('section-a', 'What you wrote', '')],
        },
        {
          id: 'section-b',
          title: `Section B — home on ${second}`,
          prompt: `Write a section that makes ${second} feel like home.`,
          brief: ['Same notes. New emphasis, new endings, new bass.'],
          fields: [field('section-b', 'What you wrote', '')],
        },
        {
          id: 'devices',
          title: 'Name the devices',
          prompt: 'List what you changed to move the center.',
          fields: [field('devices', 'Devices used', 'Bass, length, downbeat, cadence …')],
        },
      ];
    },
  },
  {
    id: 'independent-axes',
    label: 'Independent Axes',
    summary: 'Choose pitch, rhythm, contour, and texture apart, then change exactly two.',
    steps() {
      return [
        {
          id: 'axes',
          title: 'Choose the four axes',
          prompt: 'Pick a constraint for each axis on its own.',
          brief: ['Do not let one choice decide another. That is the whole exercise.'],
          fields: [
            field('pitch', 'Pitch constraint', 'Which degrees may appear?', 'text'),
            field('rhythm', 'Rhythm constraint', 'How many attacks, and where?', 'text'),
            field('contour', 'Contour constraint', 'Rising, falling, arch, static?', 'text'),
            field('texture', 'Texture constraint', 'Single note, power chord, pedal?', 'text'),
          ],
        },
        {
          id: 'idea',
          title: 'Write the idea',
          prompt: 'Write one idea that respects all four constraints.',
          fields: [field('idea', 'The idea', '')],
        },
        {
          id: 'change-two',
          title: 'Change exactly two',
          prompt: 'Change two axes and hold the other two fixed.',
          fields: [
            field('changed', 'The two you changed', '', 'text'),
            field('result', 'The new idea', ''),
          ],
        },
        {
          id: 'judge',
          title: 'Judge it',
          prompt: 'Is the second idea a variation or a new idea?',
          fields: [field('judgement', 'Your reading', '')],
        },
      ];
    },
  },
];

/** One guided lab by id. */
export function labById(id) {
  return GUIDED_LABS.find(lab => lab.id === id) || null;
}

/* --- Song Study ------------------------------------------------------ */

/** The three passes and the response, for any song the player chooses. */
export const SONG_STUDY_PASSES = [
  {
    id: 'observe',
    title: 'Pass 1 — Observe',
    prompt: 'Listen and record events. Use no theory labels yet.',
    fields: [
      field('anchors', 'Repeated anchor notes', ''),
      field('endings', 'Phrase endings', ''),
      field('longest', 'Longest notes', ''),
      field('rests', 'Rests', ''),
      field('density', 'Density changes', ''),
      field('sections', 'Section changes', ''),
      field('texture', 'Articulations and textures', ''),
    ],
  },
  {
    id: 'hypothesize',
    title: 'Pass 2 — Hypothesize',
    prompt: 'Now propose a reading, with evidence for each claim.',
    fields: [
      field('center', 'Proposed tonal center', '', 'text'),
      field('evidence', 'Evidence', ''),
      field('degrees', 'Important degrees', '', 'text'),
      field('intervals', 'Characteristic intervals', '', 'text'),
      field('invariants', 'Motif invariants', ''),
      field('transformations', 'Transformations you can hear', ''),
    ],
  },
  {
    id: 'challenge',
    title: 'Pass 3 — Challenge',
    prompt: 'Argue against your own reading.',
    fields: [
      field('against', 'Contradictory evidence', ''),
      field('revised', 'Revised reading', ''),
      field('confidence', 'Confidence', 'low / medium / high', 'text'),
    ],
  },
  {
    id: 'response',
    title: 'Composition response',
    prompt: 'Steal the device, not the notes.',
    fields: [
      field('device', 'The abstract device you learned', ''),
      field('pitch', 'How your pitch will differ', ''),
      field('rhythm', 'How your rhythm will differ', ''),
      field('contour', 'How your contour will differ', ''),
      field('texture', 'How your texture will differ', ''),
      field('wrote', 'What you wrote', ''),
      field('revise', 'What you should revise', ''),
    ],
  },
];

/**
 * Example songs to study. These are prompts, not data the feature needs.
 * The workflow runs on any song the player types in.
 */
export const SONG_STUDY_EXAMPLES = [
  'A song with a riff you cannot stop hearing.',
  'A song whose chorus feels wider than its verse.',
  'A song that stays on one chord for a long time.',
  'A song where the bass note moves and the melody does not.',
  'A song in a tuning you already use.',
];

/* --- Capstone -------------------------------------------------------- */

/** What the player defines before writing the capstone piece. */
export const CAPSTONE_PLAN = [
  field('center', 'Tonal center', '', 'text'),
  field('collections', 'Collection or collections', '', 'text'),
  field('thesis', 'Interval thesis', '', 'text'),
  field('motif', 'Motif identity', 'What must survive every variation?'),
  field('opening', 'Opening function', ''),
  field('verse', 'Verse transformation', ''),
  field('chorus', 'Chorus expansion', ''),
  field('cadence', 'Cadence plan', ''),
  field('playability', 'Playability rule', 'For example: one position shift per bar.', 'text'),
];

/**
 * The self-review rubric. Each row scores 0 to 3.
 * Musi guides the analysis. It does not grade the music.
 */
export const CAPSTONE_RUBRIC = [
  { id: 'center', label: 'Tonal center', ask: 'Is home clear without a chord symbol?' },
  { id: 'interval', label: 'Interval control', ask: 'Does the thesis interval carry the piece?' },
  { id: 'motif', label: 'Motif continuity', ask: 'Can a listener hear one idea across the sections?' },
  { id: 'contrast', label: 'Section contrast', ask: 'Does each section do a different job?' },
  { id: 'cadence', label: 'Cadence', ask: 'Do the phrases close, evade, or redirect on purpose?' },
  { id: 'playability', label: 'Playability', ask: 'Can you play it clean five times in a row?' },
  { id: 'original', label: 'Independent construction', ask: 'Did you make the decisions, or copy them?' },
];

/** The score words, low to high. */
export const RUBRIC_SCORES = [
  { value: 0, label: 'Not yet' },
  { value: 1, label: 'Started' },
  { value: 2, label: 'Works' },
  { value: 3, label: 'Strong' },
];

/**
 * Total a rubric result.
 * @param {Record<string, number>} scores
 * @returns {{total: number, max: number, weakest: string[]}}
 */
export function rubricTotal(scores = {}) {
  const max = CAPSTONE_RUBRIC.length * 3;
  let total = 0;
  const weakest = [];
  for (const row of CAPSTONE_RUBRIC) {
    const value = Number(scores[row.id]);
    const score = Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 0;
    total += score;
    if (score <= 1) weakest.push(row.label);
  }
  return { total, max, weakest };
}
