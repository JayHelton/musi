// The exercise bank of Composition Lab.
//
// Six activities build one competence loop:
//
//   Recall  — say the theory before you see it.
//   Hear    — attach a sound to the name.
//   Map     — find the sound on the instrument.
//   Write   — make something under a constraint.
//   Transform — change the idea on purpose.
//   Explain — say what you decided and why.
//
// Every definition here builds a concrete exercise from the current context.
// No exercise carries a key, a tuning, or a mode of its own, so the same bank
// runs in any key and on any instrument the context allows.
//
// This module is pure. It touches no screen, no clock, and no audio.

import {
  getScaleNotes, scaleIntervalClasses, shortScaleName, orderedScaleNames,
  INTERVAL_LABELS,
} from '../adapters/musiTheory.js';
import {
  DEGREE_IDS, degreeById, degreeLabel, degreesOfScale, compareScaleDegrees,
  noteForDegree, fretsForDegree, openMidisOf,
} from '../adapters/musiReference.js';
import { stringsOf, isFretted } from './compositionContext.js';
import { pickCard, SECTIONS } from './motifLab.js';

/** The six activities of the competence loop, in order. */
export const ACTIVITIES = [
  { id: 'recall', label: 'Recall', blurb: 'Say the theory before Musi shows it.' },
  { id: 'hear', label: 'Hear', blurb: 'Attach a sound to the name.' },
  { id: 'map', label: 'Map', blurb: 'Find the sound on the instrument.' },
  { id: 'write', label: 'Write', blurb: 'Make something under a constraint.' },
  { id: 'transform', label: 'Transform', blurb: 'Change one idea on purpose.' },
  { id: 'explain', label: 'Explain', blurb: 'Say what you decided and why.' },
];

/** The focus areas a player can pick instead of the full loop. */
export const FOCUS_AREAS = [
  { id: 'intervals', label: 'Intervals' },
  { id: 'tonal-center', label: 'Tonal Center' },
  { id: 'mapping', label: 'Fretboard Mapping' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'motifs', label: 'Motifs' },
  { id: 'sections', label: 'Section Writing' },
  { id: 'modal', label: 'Modal Movement' },
  { id: 'playability', label: 'Playability' },
  { id: 'song', label: 'Song Analysis' },
];

/* --- helpers --------------------------------------------------------- */

function pick(list, rng) {
  if (!list || !list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

function pickMany(list, count, rng) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < count) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/** The degrees of the current collection, or every degree when it has none. */
function collectionDegrees(context) {
  const rows = degreesOfScale(context.collection);
  return rows.length ? rows : DEGREE_IDS.map(degreeById).filter(Boolean);
}

/** The degrees the collection holds beyond the plain minor scale. */
function characteristicDegrees(context) {
  const compare = compareScaleDegrees(context.collection, 'Natural Minor (Aeolian)');
  if (compare.onlyInA.length) return compare.onlyInA;
  const major = compareScaleDegrees(context.collection, 'Major (Ionian)');
  return major.onlyInA.length ? major.onlyInA : collectionDegrees(context).slice(1, 3);
}

/** The formula line of a collection, such as "1 b2 3 4 5 b6 b7". */
export function collectionFormula(scaleName) {
  return scaleIntervalClasses(scaleName).map(degreeLabel).join(' ');
}

/** A short text of the current collection for a prompt. */
function collectionName(context) {
  return `${context.tonic} ${shortScaleName(context.collection)}`;
}

function textField(id, label, placeholder = '', kind = 'text') {
  return { id, label, placeholder, kind };
}

/* --- Recall ---------------------------------------------------------- */

const RECALL = [
  {
    id: 'recall-formula',
    focus: ['intervals', 'modal'],
    build(context) {
      return {
        title: 'Write the formula',
        prompt: `Write the formula of ${shortScaleName(context.collection)} in scale degrees.`,
        brief: ['Use degree names such as 1, b2, 3, 4, 5, b6, b7.'],
        fields: [textField('formula', 'Formula', '1 b2 3 4 …')],
        answer: `${shortScaleName(context.collection)}: ${collectionFormula(context.collection)}`,
      };
    },
  },
  {
    id: 'recall-characteristic',
    focus: ['modal', 'intervals'],
    build(context) {
      const rows = characteristicDegrees(context);
      return {
        title: 'Name the characteristic degrees',
        prompt: `Which degrees give ${shortScaleName(context.collection)} its color?`,
        brief: ['Name the degrees that separate it from a plain minor scale.'],
        fields: [textField('degrees', 'Characteristic degrees', 'b2, 3 …')],
        answer: rows.length
          ? rows.map(r => `${r.id} — ${r.character.toLowerCase()}`).join('  ·  ')
          : 'This collection matches a natural minor scale degree for degree.',
      };
    },
  },
  {
    id: 'recall-compare',
    focus: ['modal'],
    build(context, rng) {
      const others = orderedScaleNames().filter(name => name !== context.collection);
      const other = pick(others, rng) || 'Major (Ionian)';
      const diff = compareScaleDegrees(context.collection, other);
      const line = list => (list.length ? list.map(d => d.id).join(' ') : 'nothing');
      return {
        title: 'Tell two modes apart',
        prompt: `What separates ${shortScaleName(context.collection)} from ${shortScaleName(other)}?`,
        brief: ['Name the degrees one holds and the other does not.'],
        fields: [
          textField('only-a', `Only in ${shortScaleName(context.collection)}`, 'b2 …'),
          textField('only-b', `Only in ${shortScaleName(other)}`, '2 …'),
        ],
        answer: `Only in ${shortScaleName(context.collection)}: ${line(diff.onlyInA)}. `
          + `Only in ${shortScaleName(other)}: ${line(diff.onlyInB)}.`,
      };
    },
  },
  {
    id: 'recall-notes',
    focus: ['intervals', 'tonal-center'],
    build(context) {
      const notes = getScaleNotes(context.tonic, context.collection) || [];
      return {
        title: 'Map degrees to notes',
        prompt: `Write the notes of ${collectionName(context)}, tonic first.`,
        brief: ['Spell each note. Do not use a reference until you commit.'],
        fields: [textField('notes', 'Notes', 'A B C …')],
        answer: notes.length ? notes.join(' – ') : 'That root and collection do not spell.',
      };
    },
  },
  {
    id: 'recall-interval',
    focus: ['intervals'],
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('5');
      const note = noteForDegree(context.tonic, degree.id);
      return {
        title: 'Identify an interval from the tonic',
        prompt: `How far is ${degree.id} above ${context.tonic}, and which note is it?`,
        brief: ['Give the distance in semitones and the note name.'],
        fields: [
          textField('semitones', 'Semitones', '8'),
          textField('note', 'Note', note ? '' : '—'),
        ],
        answer: `${degree.id} is ${degree.semitones} semitone${degree.semitones === 1 ? '' : 's'}`
          + ` above ${context.tonic} (${INTERVAL_LABELS[degree.semitones] || degree.semitones})`
          + ` and spells ${note}.`,
      };
    },
  },
  {
    id: 'recall-frets',
    focus: ['mapping', 'intervals'],
    fretted: true,
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('5');
      const strings = stringsOf(context);
      const spots = fretsForDegree({
        tonic: context.tonic,
        degreeId: degree.id,
        openMidis: openMidisOf(strings),
        start: context.fretStart,
        end: context.fretEnd,
      });
      return {
        title: 'Map a degree to fret positions',
        prompt: `Name two places ${degree.id} sits between fret ${context.fretStart} and fret ${context.fretEnd}.`,
        brief: [`Tuning: ${context.tuning}. Count strings from the low string as string 1.`],
        fields: [
          textField('first', 'First position', 'string 6, fret 3'),
          textField('second', 'Second position', 'string 4, fret 5'),
        ],
        answer: spots.length
          ? spots.map(s => `string ${s.string + 1} fret ${s.fret}`).join('  ·  ')
          : `${degree.id} does not appear in that fret range.`,
      };
    },
  },
];

/* --- Hear ------------------------------------------------------------ */

const HEAR = [
  {
    id: 'hear-sing',
    focus: ['intervals'],
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('b6');
      return {
        title: 'Sing the degree',
        prompt: `Musi holds a ${context.tonic} drone. Sing ${degree.id}, then check.`,
        brief: [
          'Sing it before you press Check.',
          'Musi plays the pitch only after your attempt.',
        ],
        workspace: 'hear',
        workspaceConfig: { mode: 'sing', degreeId: degree.id },
        fields: [textField('felt', 'What did the degree feel like?', degree.character, 'textarea')],
        answer: `${degree.id} above ${context.tonic} is ${noteForDegree(context.tonic, degree.id)}`
          + ` — ${degree.semitones} semitones. ${degree.character}.`,
      };
    },
  },
  {
    id: 'hear-identify',
    focus: ['intervals'],
    build(context, rng) {
      const pool = collectionDegrees(context).slice(1);
      const degree = pick(pool, rng) || degreeById('5');
      const choices = pickMany(pool.filter(d => d.id !== degree.id), 3, rng)
        .concat([degree])
        .map(d => d.id)
        .sort();
      return {
        title: 'Name the degree you hear',
        prompt: `Musi plays a ${context.tonic} drone and then one degree of the collection. Name it.`,
        workspace: 'hear',
        workspaceConfig: { mode: 'identify', degreeId: degree.id, choices },
        fields: [],
        answer: `${degree.id} — ${noteForDegree(context.tonic, degree.id)}.`,
      };
    },
  },
  {
    id: 'hear-pair',
    focus: ['intervals', 'modal'],
    build(context, rng) {
      const pairs = [['b2', '2'], ['b3', '3'], ['b6', '6'], ['b7', '7']];
      const pair = pick(pairs, rng);
      const answer = pick(pair, rng);
      return {
        title: `Tell ${pair[0]} from ${pair[1]}`,
        prompt: `Musi plays a ${context.tonic} drone and one of ${pair[0]} or ${pair[1]}. Which one?`,
        brief: ['One semitone separates them. Listen to how hard the note leans on the tonic.'],
        workspace: 'hear',
        workspaceConfig: { mode: 'identify', degreeId: answer, choices: pair },
        fields: [],
        answer: `${answer} — ${noteForDegree(context.tonic, answer)}.`,
      };
    },
  },
  {
    id: 'hear-center',
    focus: ['tonal-center'],
    build(context, rng) {
      const degrees = collectionDegrees(context);
      const other = pick(degrees.slice(2), rng) || degreeById('5');
      const otherNote = noteForDegree(context.tonic, other.id);
      return {
        title: 'Hear which pitch is home',
        prompt: `Musi holds one of two drones under ${collectionName(context)}: ${context.tonic} or ${otherNote}. Which one is home?`,
        brief: ['The collection does not change. Only the drone changes.'],
        workspace: 'hear',
        workspaceConfig: {
          mode: 'center',
          degreeId: pick(['1', other.id], rng),
          choices: ['1', other.id],
          altNote: otherNote,
        },
        fields: [textField('why', 'What told you?', 'Which note felt like the resting point?', 'textarea')],
        answer: `A pitch collection has no home of its own. The drone, the long notes, and the `
          + `phrase endings decide it. Over ${otherNote} the same notes read as a mode on ${otherNote}.`,
      };
    },
  },
  {
    id: 'hear-two-drones',
    focus: ['tonal-center', 'modal'],
    build(context) {
      const second = context.secondTonic || noteForDegree(context.tonic, '4') || context.tonic;
      return {
        title: 'One collection, two drones',
        prompt: `Play the same short line over a ${context.tonic} drone and then over a ${second} drone.`,
        brief: [
          'Use only the notes of the current collection.',
          'Change nothing in the line between the two runs.',
        ],
        workspace: 'hear',
        workspaceConfig: { mode: 'compare', degreeId: '1', altNote: second },
        fields: [
          textField('over-a', `Over ${context.tonic}`, 'What did it sound like?', 'textarea'),
          textField('over-b', `Over ${second}`, 'What changed?', 'textarea'),
        ],
        answer: 'The pitch classes stayed the same. The drone moved the center, so every degree '
          + 'took a new job. That is modal gravity.',
      };
    },
  },
];

/* --- Map ------------------------------------------------------------- */

const MAP = [
  {
    id: 'map-degree-positions',
    focus: ['mapping', 'intervals'],
    fretted: true,
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('5');
      return {
        title: 'Find one degree in every position',
        prompt: `Tap every ${degree.id} between fret ${context.fretStart} and fret ${context.fretEnd}.`,
        brief: ['Do not open the references first. Find them, then check.'],
        workspace: 'fretboard',
        workspaceConfig: { targets: [degree.id], mode: 'find' },
        fields: [],
        answer: `${degree.id} is ${noteForDegree(context.tonic, degree.id)} in ${collectionName(context)}.`,
      };
    },
  },
  {
    id: 'map-cell',
    focus: ['mapping'],
    fretted: true,
    build(context, rng) {
      const degrees = collectionDegrees(context);
      const chosen = pickMany(degrees, Math.min(4, degrees.length), rng).map(d => d.id);
      const end = Math.min(context.fretEnd, context.fretStart + 5);
      return {
        title: 'Build a four-note cell',
        prompt: `Build a four-note cell using ${chosen.join(', ')} between fret ${context.fretStart} and fret ${end}.`,
        brief: [
          'Keep the hand in one place.',
          'Tap the four frets you would really use.',
        ],
        workspace: 'fretboard',
        workspaceConfig: { targets: chosen, mode: 'build', maxTaps: 4, fretEnd: end },
        fields: [textField('order', 'The order you play them', '1 b2 5 b6', 'text')],
        answer: `Any four frets that carry ${chosen.join(', ')} inside that range work. `
          + 'Check that your hand does not shift position to reach them.',
      };
    },
  },
  {
    id: 'map-one-string',
    focus: ['mapping', 'playability'],
    fretted: true,
    build(context) {
      const degrees = collectionDegrees(context).map(d => d.id);
      return {
        title: 'Find a horizontal route',
        prompt: `Walk ${collectionName(context)} along one string, low to high.`,
        brief: [
          'Stay on one string for the whole run.',
          'This is how a line moves along the neck instead of across it.',
        ],
        workspace: 'fretboard',
        workspaceConfig: { targets: degrees, mode: 'build', oneString: true },
        fields: [textField('string', 'Which string did you use?', 'string 5', 'text')],
        answer: 'Every degree of the collection appears on each string once per octave. '
          + 'A route along one string keeps the left hand out of position changes.',
      };
    },
  },
  {
    id: 'map-same-interval',
    focus: ['mapping', 'intervals'],
    fretted: true,
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('b6');
      return {
        title: 'The same interval on more than one string',
        prompt: `Find ${degree.id} on at least three different strings inside the range.`,
        brief: ['The same color has a different feel on a different string.'],
        workspace: 'fretboard',
        workspaceConfig: { targets: [degree.id], mode: 'find', minStrings: 3 },
        fields: [],
        answer: `${degree.id} is ${noteForDegree(context.tonic, degree.id)}. `
          + 'It repeats on every string that reaches that pitch class.',
      };
    },
  },
  {
    id: 'map-registers',
    focus: ['mapping', 'intervals'],
    build(context, rng) {
      const degree = pick(collectionDegrees(context).slice(1), rng) || degreeById('5');
      const note = noteForDegree(context.tonic, degree.id);
      return {
        title: 'Find the degree in three registers',
        prompt: `Play ${degree.id} (${note}) in three different octaves on your instrument.`,
        brief: [
          'Low, middle, and high.',
          'The same degree changes weight when the register changes.',
        ],
        fields: [
          textField('low', 'Low register', 'Where did you play it?'),
          textField('high', 'High register', 'Where did you play it?'),
          textField('effect', 'What changed?', 'Did the color hold up low?', 'textarea'),
        ],
        selfCheck: true,
        answer: `${degree.id} is ${note} above ${context.tonic}. A close interval low on the `
          + 'range turns muddy, and the same interval high reads clearly. Register is part of the writing.',
      };
    },
  },
  {
    id: 'map-characteristic',
    focus: ['mapping', 'modal'],
    fretted: true,
    build(context) {
      const rows = characteristicDegrees(context);
      const targets = rows.length ? rows.map(r => r.id) : ['1', '5'];
      return {
        title: 'Find the characteristic degrees',
        prompt: `Tap every ${targets.join(' and ')} inside the range.`,
        brief: [`These degrees are what make ${shortScaleName(context.collection)} sound like itself.`],
        workspace: 'fretboard',
        workspaceConfig: { targets, mode: 'find' },
        fields: [],
        answer: rows.length
          ? rows.map(r => `${r.id} — ${r.functions}`).join('  ·  ')
          : 'This collection has no degree that separates it from a plain minor scale.',
      };
    },
  },
];

/* --- Write ----------------------------------------------------------- */

const WRITE = [
  {
    id: 'write-three-degrees',
    focus: ['intervals', 'rhythm'],
    build(context, rng) {
      const degrees = collectionDegrees(context);
      const chosen = pickMany(degrees, Math.min(3, degrees.length), rng).map(d => d.id);
      return {
        title: 'Write with three degrees',
        prompt: `Write a one to two bar idea using only ${chosen.join(', ')}.`,
        brief: ['Design the rhythm first. Assign the degrees after.'],
        workspace: 'rhythm',
        workspaceConfig: { allowed: chosen },
        fields: [textField('idea', 'What did you write?', 'Describe the line, or paste tab.', 'textarea')],
        selfCheck: true,
        answer: 'Read your line back. Does one of the three degrees carry the phrase, '
          + 'or do all three take an equal share? An idea usually needs one leader.',
      };
    },
  },
  {
    id: 'write-attacks-first',
    focus: ['rhythm'],
    build(context, rng) {
      const attacks = 4 + Math.floor(rng() * 5);
      return {
        title: 'Attacks before pitches',
        prompt: `Place ${attacks} attacks across sixteen sixteenth-note slots before you pick any pitch.`,
        brief: [
          `${attacks} attacks.`,
          'At least one rest of three slots.',
          'At least one pair of attacks side by side.',
          'At least one attack away from a beat.',
        ],
        workspace: 'rhythm',
        workspaceConfig: {
          constraints: {
            attacks,
            minRest: 3,
            requireAdjacentPair: true,
            requireOffbeat: true,
          },
          assignAfter: true,
        },
        fields: [textField('idea', 'What did you write?', 'Notes on the finished idea.', 'textarea')],
        selfCheck: true,
        answer: 'Musi checks the grid against the brief. The pitches are yours to judge.',
      };
    },
  },
  {
    id: 'write-cadence-only',
    focus: ['intervals', 'sections'],
    build(context) {
      const has7 = scaleIntervalClasses(context.collection).includes(11);
      const degree = has7 ? '7' : 'b7';
      return {
        title: 'Save the leading tone',
        prompt: `Write a phrase where ${degree} appears only as the final cadential event.`,
        brief: [
          `Use ${degree} once and nowhere else.`,
          'Everything before the ending must avoid it.',
        ],
        workspace: 'rhythm',
        workspaceConfig: { highlight: [degree] },
        fields: [
          textField('idea', 'The phrase', 'Describe it, or paste tab.', 'textarea'),
          textField('cadence', 'How does it close?', 'Where does the ending land?'),
        ],
        selfCheck: true,
        answer: `Holding ${degree} back keeps its pull intact. A degree that appears everywhere `
          + 'stops signalling anything.',
      };
    },
  },
  {
    id: 'write-falling-degree',
    focus: ['intervals'],
    build(context) {
      const classes = scaleIntervalClasses(context.collection);
      const from = classes.includes(8) ? 'b6' : (classes.includes(9) ? '6' : '4');
      const to = classes.includes(7) ? '5' : '1';
      return {
        title: 'Make a degree fall',
        prompt: `Create a phrase where ${from} falls into ${to}.`,
        brief: [
          `Put ${from} on a strong slot and ${to} straight after it.`,
          'Do the fall at least twice so the ear learns it.',
        ],
        workspace: 'rhythm',
        workspaceConfig: { highlight: [from, to] },
        fields: [textField('idea', 'The phrase', '', 'textarea')],
        selfCheck: true,
        answer: `${from} carries downward gravity toward ${to}. Give it a long value before `
          + 'the fall and the ear waits for the resolution.',
      };
    },
  },
  {
    id: 'write-function-first',
    focus: ['intervals', 'sections'],
    build(context, rng) {
      const degrees = collectionDegrees(context);
      const chosen = pickMany(degrees, Math.min(4, degrees.length), rng).map(d => d.id);
      return {
        title: 'Function before fingering',
        prompt: 'Choose four scale degrees and give each a purpose before you play them.',
        brief: [`The collection offers ${chosen.join(', ')} among others. Any four degrees work.`],
        fields: [
          textField('anchor', 'Anchor', 'The degree the idea rests on'),
          textField('color', 'Color', 'The degree that gives the idea its character'),
          textField('connector', 'Connector', 'The degree that carries motion'),
          textField('cadence', 'Cadence', 'The degree that closes the phrase'),
        ],
        selfCheck: true,
        answer: 'A degree with no job becomes a passing note by accident. Naming the job first '
          + 'means the phrase has a plan before the hand moves.',
      };
    },
  },
];

/* --- Transform ------------------------------------------------------- */

const TRANSFORM = [
  {
    id: 'transform-card',
    focus: ['motifs'],
    build(context, rng) {
      const card = pickCard(rng);
      return {
        title: `Transform: ${card.label}`,
        prompt: 'Take one idea you already wrote and apply this transformation.',
        brief: [`Preserve: ${card.preserve}`, `Change: ${card.change}`, `How: ${card.how}`],
        workspace: 'transform',
        workspaceConfig: { cardId: card.id },
        fields: [
          textField('before', 'The idea before', '', 'textarea'),
          textField('after', 'The idea after', '', 'textarea'),
          textField('kept', 'What survived?', 'The part that made it recognisable'),
        ],
        selfCheck: true,
        answer: `A listener should still recognise the idea. If they cannot, you changed more `
          + `than ${card.change.toLowerCase()}`,
      };
    },
  },
  {
    id: 'transform-two-axes',
    focus: ['motifs', 'rhythm'],
    build(context, rng) {
      const axes = ['pitch', 'rhythm', 'contour', 'texture'];
      const chosen = pickMany(axes, 2, rng);
      return {
        title: 'Change exactly two axes',
        prompt: `Change ${chosen[0]} and ${chosen[1]}. Leave the other two axes alone.`,
        brief: [
          'Pitch, rhythm, contour, and texture are independent.',
          'Changing all four at once makes a new idea, not a variation.',
        ],
        workspace: 'transform',
        workspaceConfig: { axes: chosen },
        fields: [
          textField('changed', `What you did to ${chosen[0]} and ${chosen[1]}`, '', 'textarea'),
          textField('held', 'What you held fixed', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'Two axes is enough for a section to feel different and still related. '
          + 'This is where an original writing process starts.',
      };
    },
  },
  {
    id: 'transform-section',
    focus: ['sections'],
    build(context, rng) {
      const section = pick(SECTIONS.slice(1), rng) || SECTIONS[1];
      const card = pickCard(rng, pick(section.groups, rng) || 'rhythm');
      return {
        title: `Write the ${section.label.toLowerCase()}`,
        prompt: `Turn your opening idea into a ${section.label.toLowerCase()} with this transformation.`,
        brief: [`Purpose: ${section.purpose.join(' ')}`, `Preserve: ${card.preserve}`, `Change: ${card.change}`],
        workspace: 'transform',
        workspaceConfig: { cardId: card.id, sectionId: section.id },
        fields: [textField('result', 'What you wrote', '', 'textarea')],
        selfCheck: true,
        answer: `A ${section.label.toLowerCase()} earns its place by doing a different job, `
          + 'not by holding different notes.',
      };
    },
  },
  {
    id: 'transform-playability',
    focus: ['playability'],
    fretted: true,
    build(context) {
      return {
        title: 'Horizontal refactor',
        prompt: 'Refinger one idea so most attacks stay on one or two strings.',
        brief: [
          'Maximum one position shift per bar.',
          'Rewrite the music when the fingering fights the idea.',
        ],
        workspace: 'transform',
        workspaceConfig: { playability: true },
        fields: [
          textField('before', 'The fingering before', 'Which strings and positions?'),
          textField('after', 'The fingering after', 'Which strings and positions?'),
          textField('rewrite', 'What did you change in the music?', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'A line that lives on one string keeps its tone even. A line that jumps strings '
          + 'changes tone at every jump, whether you wanted that or not.',
      };
    },
  },
];

/* --- Explain --------------------------------------------------------- */

/** The five questions every composition exercise can close with. */
export const EXPLAIN_QUESTIONS = [
  { id: 'home', label: 'Where is home?' },
  { id: 'color', label: 'What is the important interval or color?' },
  { id: 'rhythm', label: 'What gives the idea its rhythmic identity?' },
  { id: 'survive', label: 'What part of the motif must survive?' },
  { id: 'resolve', label: 'How does the phrase resolve, evade, or redirect?' },
];

/** The extra analysis fields a player can fill in. */
export const EXPLAIN_EXTRAS = [
  { id: 'center', label: 'Tonal center' },
  { id: 'collection', label: 'Pitch collection' },
  { id: 'characteristic', label: 'Characteristic degrees' },
  { id: 'motif', label: 'Motif identity' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'section', label: 'Section function' },
  { id: 'playability', label: 'Playability issues' },
];

const EXPLAIN = [
  {
    id: 'explain-five',
    focus: ['intervals', 'tonal-center', 'motifs', 'sections'],
    build(context) {
      return {
        title: 'Explain the idea',
        prompt: 'Answer five questions about what you just wrote.',
        brief: ['Short answers. One line each is enough.'],
        fields: EXPLAIN_QUESTIONS.map(q => textField(q.id, q.label, '', 'textarea')),
        selfCheck: true,
        answer: 'A label such as "Phrygian Dominant" is not an explanation. The five answers above '
          + 'are the decisions. Keep them beside the idea.',
      };
    },
  },
  {
    id: 'explain-full',
    focus: ['sections', 'playability'],
    build(context) {
      return {
        title: 'Full analysis',
        prompt: `Record the analysis of the idea you wrote in ${collectionName(context)}.`,
        fields: EXPLAIN_EXTRAS.map(f => textField(f.id, f.label, '')),
        selfCheck: true,
        answer: 'Read the rows back. Any row you cannot fill in is a decision you have not made yet.',
      };
    },
  },
];

/* --- tonal center family --------------------------------------------- */

const TONAL_CENTER = [
  {
    id: 'center-same-notes',
    activity: 'write',
    focus: ['tonal-center'],
    build(context) {
      const second = context.secondTonic || noteForDegree(context.tonic, '4') || context.tonic;
      return {
        title: 'Same notes, different home',
        prompt: `Write phrase A centered on ${context.tonic} and phrase B centered on ${second}.`,
        brief: [
          `Use only the notes of ${collectionName(context)}.`,
          'Introduce no new pitch class in either phrase.',
          'Change the bass emphasis, the longest notes, the downbeats, and the phrase endings.',
        ],
        workspace: 'rhythm',
        workspaceConfig: { twoPhrases: true },
        fields: [
          textField('phrase-a', `Phrase A — home on ${context.tonic}`, '', 'textarea'),
          textField('phrase-b', `Phrase B — home on ${second}`, '', 'textarea'),
          textField('devices', 'What did you change to move the center?', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'A pitch collection is not a key. Emphasis, length, downbeat placement, and the '
          + 'final note decide the center. The notes stayed the same in both phrases.',
      };
    },
  },
  {
    id: 'center-by-ending',
    activity: 'write',
    focus: ['tonal-center'],
    build(context, rng) {
      const degrees = collectionDegrees(context).slice(1);
      const other = pick(degrees, rng) || degreeById('5');
      return {
        title: 'Center by ending',
        prompt: `Write one opening. End it on ${context.tonic} once, and on `
          + `${noteForDegree(context.tonic, other.id)} once.`,
        brief: ['Change nothing but the final note.'],
        fields: [
          textField('version-a', `Version A — ends on ${context.tonic}`, '', 'textarea'),
          textField('version-b', `Version B — ends on ${noteForDegree(context.tonic, other.id)}`, '', 'textarea'),
          textField('effect', 'What changed for the listener?', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'The last note of a phrase carries more weight than any note inside it. '
          + 'That is the cheapest way to move a center.',
      };
    },
  },
];

/* --- song analysis --------------------------------------------------- */

const SONG = [
  {
    id: 'song-observe',
    activity: 'explain',
    focus: ['song'],
    focusOnly: true,
    build() {
      return {
        title: 'Study a song — first pass',
        prompt: 'Listen once and record what you hear. Use no theory labels yet.',
        brief: ['Name the events, not the names for them.'],
        fields: [
          textField('anchors', 'Repeated anchor notes', '', 'textarea'),
          textField('endings', 'Phrase endings', '', 'textarea'),
          textField('long', 'Longest notes', '', 'textarea'),
          textField('rests', 'Rests', '', 'textarea'),
          textField('density', 'Density changes', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'Observation before labelling stops you from hearing what the label predicts. '
          + 'The full three-pass workflow is in Guided Labs.',
      };
    },
  },
];

const SONG_EXTRA = [
  {
    id: 'song-hypothesize',
    activity: 'recall',
    focus: ['song'],
    focusOnly: true,
    build() {
      return {
        title: 'Study a song — second pass',
        prompt: 'Now propose a reading. Give evidence for every claim.',
        brief: ['A claim with no evidence is a guess. Write the evidence beside it.'],
        fields: [
          textField('center', 'Proposed tonal center', ''),
          textField('evidence', 'Evidence', 'What in the music says so?', 'textarea'),
          textField('degrees', 'Important degrees', ''),
          textField('intervals', 'Characteristic intervals', ''),
          textField('invariants', 'Motif invariants', 'What repeats without changing?', 'textarea'),
        ],
        selfCheck: true,
        answer: 'A center you cannot defend with a long note, a downbeat, or a phrase ending '
          + 'is a center you assumed from the key signature.',
      };
    },
  },
  {
    id: 'song-challenge',
    activity: 'transform',
    focus: ['song'],
    focusOnly: true,
    build() {
      return {
        title: 'Study a song — third pass',
        prompt: 'Argue against your own reading, then write down what you will steal.',
        fields: [
          textField('against', 'Contradictory evidence', '', 'textarea'),
          textField('revised', 'Revised reading', '', 'textarea'),
          textField('confidence', 'Confidence', 'low / medium / high'),
          textField('device', 'The abstract device you learned', '', 'textarea'),
        ],
        selfCheck: true,
        answer: 'Copy the device, not the notes. A device transfers to another key, another '
          + 'tuning, and another tempo. The notes do not.',
      };
    },
  },
];

/* --- the bank -------------------------------------------------------- */

function tag(list, activity) {
  return list.map(def => ({ ...def, activity: def.activity || activity }));
}

/** Every exercise definition of the bank. */
export const EXERCISES = [
  ...tag(RECALL, 'recall'),
  ...tag(HEAR, 'hear'),
  ...tag(MAP, 'map'),
  ...tag(WRITE, 'write'),
  ...tag(TRANSFORM, 'transform'),
  ...tag(EXPLAIN, 'explain'),
  ...tag(TONAL_CENTER, 'write'),
  ...tag(SONG, 'explain'),
  ...tag(SONG_EXTRA, 'explain'),
];

/**
 * True when the context can run this definition.
 *
 * A fretted exercise needs a fretted instrument. A focus-only exercise, such as
 * one pass of a song study, waits until the player asks for that focus area, so
 * a plain guided session never opens a pass of a song the player has not chosen.
 * @param {Object} definition
 * @param {Object} context
 * @param {{focus?: string}} [options]
 * @returns {boolean}
 */
export function isEligible(definition, context, { focus = '' } = {}) {
  if (definition.fretted && !isFretted(context)) return false;
  if (definition.focusOnly && !focus) return false;
  return true;
}

/**
 * Build one concrete exercise from a definition.
 * @param {Object} definition an entry of EXERCISES
 * @param {Object} context the lab context
 * @param {Function} [rng]
 * @returns {Object} a concrete exercise
 */
export function buildExercise(definition, context, rng = Math.random) {
  const built = definition.build(context, rng) || {};
  return {
    id: definition.id,
    activity: definition.activity,
    focus: definition.focus || [],
    workspace: built.workspace || 'none',
    workspaceConfig: built.workspaceConfig || {},
    brief: built.brief || [],
    fields: built.fields || [],
    selfCheck: !!built.selfCheck,
    hint: built.hint || '',
    ...built,
  };
}

/** The definitions the context can run, filtered by activity and focus. */
export function eligibleDefinitions(context, { activity = '', focus = '' } = {}) {
  return EXERCISES.filter((definition) => {
    if (!isEligible(definition, context, { focus })) return false;
    if (activity && definition.activity !== activity) return false;
    if (focus && !(definition.focus || []).includes(focus)) return false;
    return true;
  });
}

/**
 * One exercise, chosen at random.
 * @param {Object} context
 * @param {{activity?: string, focus?: string, rng?: Function, avoid?: string}} [options]
 * @returns {Object|null}
 */
export function pickExercise(context, { activity = '', focus = '', rng = Math.random, avoid = '' } = {}) {
  let pool = eligibleDefinitions(context, { activity, focus });
  if (pool.length > 1 && avoid) pool = pool.filter(d => d.id !== avoid);
  if (!pool.length) pool = eligibleDefinitions(context, { activity });
  if (!pool.length) pool = eligibleDefinitions(context, {});
  const definition = pick(pool, rng);
  return definition ? buildExercise(definition, context, rng) : null;
}

/**
 * The guided session: one exercise per activity, in loop order.
 * @param {Object} context
 * @param {{rng?: Function, focus?: string}} [options]
 * @returns {Object[]} six exercises, or fewer when the context blocks one
 */
export function guidedSession(context, { rng = Math.random, focus = '' } = {}) {
  return ACTIVITIES.map((activity) => {
    let exercise = pickExercise(context, { activity: activity.id, focus, rng });
    if (!exercise) exercise = pickExercise(context, { activity: activity.id, rng });
    return exercise;
  }).filter(Boolean);
}

/**
 * A short run for one focus area, in loop order where the area allows it.
 * @param {string} focusId
 * @param {Object} context
 * @param {{rng?: Function, length?: number}} [options]
 * @returns {Object[]}
 */
export function focusSession(focusId, context, { rng = Math.random, length = 4 } = {}) {
  const pool = eligibleDefinitions(context, { focus: focusId });
  if (!pool.length) return guidedSession(context, { rng });
  const order = new Map(ACTIVITIES.map((a, i) => [a.id, i]));
  const sorted = pool.slice().sort((a, b) => (order.get(a.activity) ?? 9) - (order.get(b.activity) ?? 9));
  const chosen = [];
  const seenActivity = new Set();
  for (const definition of sorted) {
    if (chosen.length >= length) break;
    if (seenActivity.has(definition.activity) && chosen.length + 1 < pool.length) continue;
    seenActivity.add(definition.activity);
    chosen.push(definition);
  }
  for (const definition of sorted) {
    if (chosen.length >= length) break;
    if (!chosen.includes(definition)) chosen.push(definition);
  }
  return chosen.map(definition => buildExercise(definition, context, rng));
}
