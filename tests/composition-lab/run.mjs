/**
 * Zero-dependency Node tests for Composition Lab and the shared references.
 *
 * The feature keeps its rules in pure functions with no screen, no clock, and
 * no audio, so this runner reads them directly.
 *
 * Run: node tests/composition-lab/run.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTERVAL_DEGREES, DEGREE_IDS, degreeById, degreeBySemitones, degreeLabel,
  noteForDegree, pitchClassForDegree, scalesWithDegree, degreesOfScale,
  compareScaleDegrees, fretsForDegree,
} from '../../js/reference/intervalTable.js';
import { openMidisOf } from '../../js/reference/neckView.js';
import {
  INSTRUMENTS, CONTEXT_PRESETS, DEFAULT_CONTEXT, normalizeContext, applyPreset,
  describeContext, describeOptions, stringsOf, isFretted, instrumentById,
  tuningsForInstrument, resolveRoot,
} from '../../js/practiceLab/model/compositionContext.js';
import {
  GRID_SIZES, DEFAULT_SLOTS, createGrid, toggleSlot, clearGrid, copyGrid,
  randomGrid, gridStats, checkConstraints, describeGrid, describeConstraints,
  prunePitches, displaceGrid, scaleGrid, reverseGrid, isDownbeat,
} from '../../js/practiceLab/model/rhythmGrid.js';
import {
  ACTIVITIES, FOCUS_AREAS, EXERCISES, EXPLAIN_QUESTIONS, EXPLAIN_EXTRAS,
  buildExercise, eligibleDefinitions, pickExercise, guidedSession, focusSession,
  collectionFormula, isEligible,
} from '../../js/practiceLab/model/compositionExercises.js';
import {
  TRANSFORM_CARDS, TRANSFORM_GROUPS, VARIANT_SLOTS, SECTIONS, cardById,
  cardsInGroup, newMotifFamily, variantBrief, setVariantCard, setVariantNote,
  familyProgress, sectionAssignment,
} from '../../js/practiceLab/model/motifLab.js';
import {
  GUIDED_LABS, labById, SONG_STUDY_PASSES, CAPSTONE_PLAN, CAPSTONE_RUBRIC,
  RUBRIC_SCORES, rubricTotal, THESIS_OPTIONS,
} from '../../js/practiceLab/model/guidedLabs.js';
import {
  emptyState, mergeState, setAnswer, answersOf, hasAnswer, markRevealed,
  isRevealed, markCompleted, runProgress, currentExercise, completedCount,
  setLabAnswer, setLabStep, labAnswers, labStep, RUN_MODES,
} from '../../js/practiceLab/model/compositionState.js';
import { SCALES, getScaleNotes, scaleIntervalClasses } from '../../js/scales.js';
import { TUNINGS, ROOTS, parseNote } from '../../js/theory.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/** A repeatable pseudo-random source, so a failure is reproducible. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

/* ------------------------------------------------------------------ */
console.log('Interval Reference');

test('the table holds the eleven degrees of the guide, in pitch order', () => {
  assert.equal(INTERVAL_DEGREES.length, 11);
  assert.deepEqual(DEGREE_IDS, ['1', 'b2', '2', 'b3', '3', '4', '5', 'b6', '6', 'b7', '7']);
  const semis = INTERVAL_DEGREES.map(d => d.semitones);
  assert.deepEqual(semis, [...semis].sort((a, b) => a - b));
  assert.deepEqual(semis, [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
});

test('every degree carries a character, a function, and examples', () => {
  for (const degree of INTERVAL_DEGREES) {
    assert.ok(degree.character.length > 3, `${degree.id} has no character`);
    assert.ok(degree.functions.length > 3, `${degree.id} has no function`);
    assert.ok(degree.examples.length >= 2, `${degree.id} has fewer than two examples`);
    assert.ok(degree.name.length > 1, `${degree.id} has no interval name`);
  }
});

test('the character words match the guide', () => {
  assert.equal(degreeById('1').character, 'Home, weight, finality');
  assert.equal(degreeById('b2').character, 'Strong friction');
  assert.equal(degreeById('b6').character, 'Heavy downward gravity');
  assert.equal(degreeById('7').functions, 'Leading-tone cadences');
});

test('the tritone has no row but still has a label', () => {
  assert.equal(degreeBySemitones(6), null);
  assert.equal(degreeLabel(6), 'b5');
  assert.equal(degreeLabel(8), 'b6');
  assert.equal(degreeLabel(20), 'b6');
});

test('a degree spells against any tonic', () => {
  assert.equal(noteForDegree('C', 'b6'), 'Ab');
  assert.equal(noteForDegree('Bb', 'b2'), 'Cb');
  assert.equal(noteForDegree('F#', '3'), 'A#');
  assert.equal(noteForDegree('E', '7'), 'D#');
  for (const root of ROOTS) {
    for (const id of DEGREE_IDS) {
      const note = noteForDegree(root, id);
      assert.ok(note, `${root} ${id} does not spell`);
      const parsed = parseNote(note);
      assert.equal(parsed.semi, pitchClassForDegree(root, id), `${root} ${id} spells the wrong pitch`);
    }
  }
});

test('a bad tonic gives no note and no pitch class', () => {
  assert.equal(noteForDegree('H', '5'), '');
  assert.equal(pitchClassForDegree('', '5'), -1);
  assert.equal(degreeById('b9'), null);
});

test('the scales that hold a degree come from the shared catalog', () => {
  const withB2 = scalesWithDegree('b2').map(s => s.name);
  assert.ok(withB2.includes('Phrygian'));
  assert.ok(withB2.includes('Phrygian Dominant'));
  assert.ok(!withB2.includes('Major (Ionian)'));
  for (const entry of scalesWithDegree('5')) {
    assert.ok(scaleIntervalClasses(entry.name).includes(7), `${entry.name} has no 5`);
  }
});

test('the degrees of a scale follow its own definition', () => {
  assert.deepEqual(degreesOfScale('Phrygian Dominant').map(d => d.id),
    ['1', 'b2', '3', '4', '5', 'b6', 'b7']);
  assert.deepEqual(degreesOfScale('Major (Ionian)').map(d => d.id),
    ['1', '2', '3', '4', '5', '6', '7']);
});

test('comparing two modes names the degree that separates them', () => {
  const diff = compareScaleDegrees('Phrygian Dominant', 'Phrygian');
  assert.deepEqual(diff.onlyInA.map(d => d.id), ['3']);
  assert.deepEqual(diff.onlyInB.map(d => d.id), ['b3']);
  assert.ok(diff.shared.some(d => d.id === 'b2'));
});

test('a degree lands on the neck of any tuning', () => {
  const strings = TUNINGS['Drop Bb / A#'];
  const spots = fretsForDegree({
    tonic: 'Bb', degreeId: '1', openMidis: openMidisOf(strings), start: 0, end: 12,
  });
  assert.ok(spots.length > 0);
  for (const spot of spots) {
    assert.equal(((spot.midi % 12) + 12) % 12, pitchClassForDegree('Bb', '1'));
    assert.ok(spot.fret >= 0 && spot.fret <= 12);
    assert.ok(spot.string >= 0 && spot.string < strings.length);
  }
  // The lowest string of Drop Bb is the tonic itself, so fret 0 is a hit.
  assert.ok(spots.some(s => s.string === 0 && s.fret === 0));
});

test('a fret range with no room gives no positions', () => {
  assert.deepEqual(fretsForDegree({ tonic: 'C', degreeId: '1', openMidis: [] }), []);
});

/* ------------------------------------------------------------------ */
console.log('Composition Lab context');

test('a context fills in and corrects itself', () => {
  const context = normalizeContext({});
  assert.deepEqual(Object.keys(context).sort(), Object.keys(DEFAULT_CONTEXT).sort());
  assert.ok(ROOTS.includes(context.tonic));
  assert.ok(SCALES[context.collection]);
});

test('a root arrives in the spelling this app uses', () => {
  assert.equal(resolveRoot('A#'), 'Bb');
  assert.equal(resolveRoot('Bb'), 'Bb');
  assert.equal(resolveRoot('E#'), 'F');
  assert.equal(resolveRoot('nonsense'), '');
  assert.equal(normalizeContext({ tonic: 'A#' }).tonic, 'Bb');
});

test('a tuning always fits the instrument it sits on', () => {
  for (const instrument of INSTRUMENTS) {
    const context = normalizeContext({ instrument: instrument.id, tuning: 'Standard' });
    if (!instrument.fretted) {
      assert.equal(context.tuning, '', `${instrument.id} kept a tuning`);
      assert.deepEqual(stringsOf(context), []);
      continue;
    }
    assert.equal(stringsOf(context).length, instrument.strings,
      `${instrument.id} has the wrong string count`);
  }
});

test('a nonsense tuning falls back instead of breaking the neck', () => {
  const context = normalizeContext({ instrument: 'guitar7', tuning: 'not a tuning' });
  assert.equal(stringsOf(context).length, 7);
  assert.ok(tuningsForInstrument('guitar7').length > 0);
});

test('a fret range always holds at least one fret', () => {
  const context = normalizeContext({ fretStart: 9, fretEnd: 2 });
  assert.ok(context.fretEnd > context.fretStart);
  const wide = normalizeContext({ fretStart: -4, fretEnd: 90 });
  assert.equal(wide.fretStart, 0);
  assert.equal(wide.fretEnd, 24);
});

test('the Drop A# row is one preset and not a rule', () => {
  const preset = CONTEXT_PRESETS.find(p => p.id === 'drop-asharp-phrygian-dominant');
  assert.ok(preset, 'the Drop A# preset is missing');
  const context = applyPreset(preset.id);
  assert.equal(context.tonic, 'Bb');
  assert.equal(context.collection, 'Phrygian Dominant');
  assert.equal(stringsOf(context).length, 6);
  assert.ok(CONTEXT_PRESETS.length >= 4, 'there is only one preset');
  assert.ok(CONTEXT_PRESETS.some(p => !p.context.tuning), 'no preset covers a non-fretted instrument');
  assert.equal(applyPreset('no-such-preset'), null);
});

test('the context row reads as one line', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  assert.equal(describeContext(context), 'Guitar · Drop Bb / A# · Bb · Phrygian Dominant');
  const options = describeOptions(context);
  assert.ok(options.some(line => line.startsWith('Target color: b2')));
  assert.equal(describeContext(normalizeContext({ instrument: 'keys', tonic: 'C' })),
    'Keys · C · Minor');
});

test('a fretted instrument answers the fretboard question', () => {
  assert.equal(isFretted(normalizeContext({ instrument: 'guitar' })), true);
  assert.equal(isFretted(normalizeContext({ instrument: 'voice' })), false);
  assert.equal(instrumentById('nothing').id, 'guitar');
});

/* ------------------------------------------------------------------ */
console.log('The rhythm grid');

test('a grid is one bar of sixteenth notes by default', () => {
  const grid = createGrid();
  assert.equal(grid.length, DEFAULT_SLOTS);
  assert.equal(grid.filter(Boolean).length, 0);
  assert.ok(GRID_SIZES.includes(DEFAULT_SLOTS));
  assert.equal(createGrid(99).length, DEFAULT_SLOTS);
});

test('a tap flips one slot and leaves the rest alone', () => {
  const first = toggleSlot(createGrid(), 3);
  assert.equal(first[3], true);
  assert.equal(first.filter(Boolean).length, 1);
  assert.equal(toggleSlot(first, 3)[3], false);
  assert.equal(toggleSlot(first, 99).filter(Boolean).length, 1);
});

test('the grid picture groups the slots into beats', () => {
  const grid = createGrid();
  grid[0] = true; grid[3] = true; grid[4] = true;
  assert.equal(describeGrid(grid), '■ □ □ ■ | ■ □ □ □ | □ □ □ □ | □ □ □ □');
  assert.equal(describeGrid([]), '');
  assert.equal(isDownbeat(0), true);
  assert.equal(isDownbeat(3), false);
  assert.equal(isDownbeat(4), true);
});

test('the stats read the grid the way the brief does', () => {
  const grid = createGrid();
  [0, 1, 6, 14].forEach(i => { grid[i] = true; });
  const stats = gridStats(grid);
  assert.equal(stats.attacks, 4);
  assert.equal(stats.adjacentPairs, 1);
  assert.equal(stats.offbeats, 3);
  assert.equal(stats.longestRest, 7);
  assert.equal(stats.firstAttack, 0);
  assert.equal(stats.lastAttack, 14);
  assert.deepEqual(stats.attackSlots, [0, 1, 6, 14]);
});

test('a brief that is not met names every problem', () => {
  const result = checkConstraints(createGrid(), {
    attacks: 6, minRest: 3, requireOffbeat: true, requireAdjacentPair: true, requireDownbeat: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 4, result.problems.join(' / '));
  assert.ok(describeConstraints({ attacks: 6, minRest: 3 }).length === 2);
});

test('the randomiser meets the brief of the guide', () => {
  const constraints = { attacks: 6, minRest: 3, requireAdjacentPair: true, requireOffbeat: true };
  for (let seed = 1; seed <= 25; seed += 1) {
    const { grid, ok } = randomGrid({ constraints, rng: seeded(seed) });
    assert.equal(ok, true, `seed ${seed} met no brief`);
    assert.equal(checkConstraints(grid, constraints).ok, true, `seed ${seed} fails its own check`);
  }
});

test('a brief that cannot be met still returns a grid', () => {
  const result = randomGrid({
    slots: 8,
    constraints: { attacks: 8, minRest: 4 },
    rng: seeded(3),
    tries: 40,
  });
  assert.equal(result.ok, false);
  assert.equal(result.grid.length, 8);
  assert.ok(result.problems.length > 0);
});

test('the pitch assignment follows the attacks and nothing else', () => {
  const grid = createGrid();
  grid[2] = true; grid[7] = true;
  const pitches = prunePitches(grid, { 2: 'b2', 5: '5', 7: '1' });
  assert.deepEqual(pitches, { 2: 'b2', 7: '1' });
  grid[7] = false;
  assert.deepEqual(prunePitches(grid, pitches), { 2: 'b2' });
});

test('a transformation keeps the bar length', () => {
  const grid = createGrid();
  [0, 4, 6].forEach(i => { grid[i] = true; });
  for (const next of [displaceGrid(grid, 2), scaleGrid(grid, 2), scaleGrid(grid, 0.5), reverseGrid(grid)]) {
    assert.equal(next.length, grid.length);
    assert.ok(next.some(Boolean), 'a transformation emptied the bar');
  }
  assert.deepEqual(gridStats(displaceGrid(grid, 2)).attackSlots, [2, 6, 8]);
  assert.deepEqual(gridStats(displaceGrid(grid, -1)).attackSlots, [3, 5, 15]);
  assert.deepEqual(gridStats(scaleGrid(grid, 2)).attackSlots, [0, 8, 12]);
  assert.notEqual(copyGrid(grid), grid);
  assert.equal(clearGrid(grid).filter(Boolean).length, 0);
});

/* ------------------------------------------------------------------ */
console.log('The competence loop');

test('the loop runs Recall, Hear, Map, Write, Transform, and Explain', () => {
  assert.deepEqual(ACTIVITIES.map(a => a.id),
    ['recall', 'hear', 'map', 'write', 'transform', 'explain']);
});

test('every activity has at least one exercise on a fretted instrument', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  for (const activity of ACTIVITIES) {
    assert.ok(eligibleDefinitions(context, { activity: activity.id }).length > 0,
      `no ${activity.id} exercise`);
  }
});

test('every activity still has an exercise without a neck', () => {
  for (const instrument of ['keys', 'voice']) {
    const context = normalizeContext({ instrument });
    for (const activity of ACTIVITIES) {
      assert.ok(eligibleDefinitions(context, { activity: activity.id }).length > 0,
        `${instrument} has no ${activity.id} exercise`);
    }
  }
});

test('a guided session walks the six activities in order', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  for (let seed = 1; seed <= 12; seed += 1) {
    const run = guidedSession(context, { rng: seeded(seed) });
    assert.deepEqual(run.map(e => e.activity), ACTIVITIES.map(a => a.id), `seed ${seed}`);
  }
});

test('a guided session on keys never asks for a fret', () => {
  const context = normalizeContext({ instrument: 'keys' });
  for (let seed = 1; seed <= 12; seed += 1) {
    for (const exercise of guidedSession(context, { rng: seeded(seed) })) {
      assert.notEqual(exercise.workspace, 'fretboard', `${exercise.id} draws a neck on keys`);
    }
  }
});

test('a song-study pass waits for the song focus', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  for (let seed = 1; seed <= 12; seed += 1) {
    for (const exercise of guidedSession(context, { rng: seeded(seed) })) {
      assert.equal(exercise.id.startsWith('song-'), false, `${exercise.id} arrived unasked`);
    }
  }
  const songRun = focusSession('song', context, { rng: seeded(4) });
  assert.ok(songRun.length >= 3);
  assert.ok(songRun.every(e => e.focus.includes('song')));
});

test('every focus area returns a run', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  for (const area of FOCUS_AREAS) {
    const run = focusSession(area.id, context, { rng: seeded(7) });
    assert.ok(run.length > 0, `${area.id} gives no exercise`);
    for (const exercise of run) {
      assert.ok(exercise.title && exercise.prompt, `${area.id} built an empty exercise`);
    }
  }
});

test('every exercise builds in every key, tuning, and collection', () => {
  const collections = ['Major (Ionian)', 'Natural Minor (Aeolian)', 'Phrygian Dominant',
    'Minor Pentatonic', 'Blues', 'Whole Tone', 'Hirajoshi'];
  const tunings = ['Standard', 'Drop D', 'Drop Bb / A#', '7-String Standard'];
  const rng = seeded(11);
  for (const tonic of ROOTS) {
    for (const collection of collections) {
      const tuning = tunings[(ROOTS.indexOf(tonic) + collections.indexOf(collection)) % tunings.length];
      const instrument = tuning.startsWith('7-String') ? 'guitar7' : 'guitar';
      const context = normalizeContext({ instrument, tuning, tonic, collection });
      for (const definition of EXERCISES) {
        if (!isEligible(definition, context, { focus: 'song' })) continue;
        const exercise = buildExercise(definition, context, rng);
        assert.ok(exercise.title, `${definition.id} has no title in ${tonic} ${collection}`);
        assert.ok(exercise.prompt, `${definition.id} has no prompt in ${tonic} ${collection}`);
        assert.ok(exercise.answer, `${definition.id} has no answer in ${tonic} ${collection}`);
        assert.ok(!/undefined|NaN|\[object/.test(exercise.prompt),
          `${definition.id} prompt is broken in ${tonic} ${collection}: ${exercise.prompt}`);
        assert.ok(!/undefined|NaN|\[object/.test(exercise.answer),
          `${definition.id} answer is broken in ${tonic} ${collection}: ${exercise.answer}`);
        for (const field of exercise.fields) {
          assert.ok(field.id && field.label, `${definition.id} has a nameless field`);
        }
      }
    }
  }
});

test('an exercise names the tuning it was built for', () => {
  const context = normalizeContext({ tuning: 'Drop D', tonic: 'D', collection: 'Dorian' });
  const exercise = buildExercise(EXERCISES.find(d => d.id === 'recall-frets'), context, seeded(2));
  assert.ok(exercise.brief.some(line => line.includes('Drop D')), exercise.brief.join(' '));
});

test('the formula of a collection reads in degrees', () => {
  assert.equal(collectionFormula('Phrygian Dominant'), '1 b2 3 4 5 b6 b7');
  assert.equal(collectionFormula('Major (Ionian)'), '1 2 3 4 5 6 7');
});

test('the rhythm work separates the attacks from the pitches', () => {
  const context = normalizeContext({});
  const definition = EXERCISES.find(d => d.id === 'write-attacks-first');
  const exercise = buildExercise(definition, context, seeded(6));
  assert.equal(exercise.workspace, 'rhythm');
  assert.equal(exercise.workspaceConfig.assignAfter, true);
  assert.ok(exercise.workspaceConfig.constraints.attacks >= 4);
  assert.ok(/before you pick any pitch/.test(exercise.prompt));
});

test('a tonal-center exercise keeps one collection and moves the home note', () => {
  const context = normalizeContext({ tonic: 'E', collection: 'Phrygian', secondTonic: 'A' });
  const exercise = buildExercise(EXERCISES.find(d => d.id === 'center-same-notes'), context, seeded(1));
  assert.ok(exercise.prompt.includes('E'));
  assert.ok(exercise.prompt.includes('A'));
  assert.ok(exercise.brief.some(line => /no new pitch class/i.test(line)), exercise.brief.join(' / '));
});

test('the Explain step asks the five questions of the guide', () => {
  assert.deepEqual(EXPLAIN_QUESTIONS.map(q => q.label), [
    'Where is home?',
    'What is the important interval or color?',
    'What gives the idea its rhythmic identity?',
    'What part of the motif must survive?',
    'How does the phrase resolve, evade, or redirect?',
  ]);
  assert.deepEqual(EXPLAIN_EXTRAS.map(f => f.id),
    ['center', 'collection', 'characteristic', 'motif', 'cadence', 'section', 'playability']);
});

test('picking twice avoids the exercise just seen', () => {
  const context = applyPreset('drop-asharp-phrygian-dominant');
  const first = pickExercise(context, { rng: seeded(9) });
  const second = pickExercise(context, { rng: seeded(9), avoid: first.id });
  assert.notEqual(second.id, first.id);
});

/* ------------------------------------------------------------------ */
console.log('Motifs, transformations, and sections');

test('every transformation card names what stays and what changes', () => {
  assert.ok(TRANSFORM_CARDS.length >= 15);
  const groups = new Set(TRANSFORM_GROUPS.map(g => g.id));
  for (const card of TRANSFORM_CARDS) {
    assert.ok(groups.has(card.group), `${card.id} has no group`);
    assert.ok(card.preserve.length > 5, `${card.id} preserves nothing`);
    assert.ok(card.change.length > 5, `${card.id} changes nothing`);
    assert.ok(card.how.length > 5, `${card.id} says nothing about how`);
  }
  for (const group of TRANSFORM_GROUPS) {
    assert.ok(cardsInGroup(group.id).length >= 3, `${group.id} has fewer than three cards`);
  }
});

test('the five families of change are rhythm, pitch, shape, texture, and form', () => {
  assert.deepEqual(TRANSFORM_GROUPS.map(g => g.id),
    ['rhythm', 'pitch', 'shape', 'texture', 'form']);
});

test('a motif family holds one original and five descendants', () => {
  const family = newMotifFamily({ identity: 'the b2 on the downbeat' });
  assert.equal(family.variants.length, 5);
  assert.deepEqual(family.variants.map(v => v.id), VARIANT_SLOTS.map(s => s.id));
  for (const variant of family.variants) {
    const brief = variantBrief(family, variant.id);
    assert.ok(brief.stays.includes('the b2 on the downbeat'), `${variant.id} loses the identity`);
    assert.ok(brief.changes.length > 5, `${variant.id} changes nothing`);
  }
  assert.equal(variantBrief(family, 'Z'), null);
});

test('a variant records its own card and its own note', () => {
  let family = newMotifFamily();
  family = setVariantCard(family, 'A', 'inversion');
  assert.equal(family.variants[0].cardId, 'inversion');
  family = setVariantCard(family, 'A', 'no-such-card');
  assert.equal(family.variants[0].cardId, 'inversion');
  assert.equal(familyProgress(family).done, 0);
  family = setVariantNote(family, 'A', 'I mirrored every step.');
  assert.equal(family.variants[0].done, true);
  assert.equal(familyProgress(family).done, 1);
  assert.equal(familyProgress(family).total, 5);
  assert.ok(cardById('inversion'));
  assert.equal(cardById('nothing'), null);
});

test('the sections carry a purpose of their own', () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ['opening', 'verse', 'chorus']);
  for (const section of SECTIONS) {
    assert.ok(section.purpose.length >= 3, `${section.id} has no purpose`);
    assert.ok(section.groups.length >= 2, `${section.id} draws from too few groups`);
  }
});

test('each section gets a different transformation constraint', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const rows = sectionAssignment(seeded(seed));
    assert.equal(rows.length, 3, `seed ${seed}`);
    const cards = rows.map(r => r.card.id);
    assert.equal(new Set(cards).size, 3, `seed ${seed} repeats a card: ${cards.join(', ')}`);
  }
});

/* ------------------------------------------------------------------ */
console.log('Guided labs and the capstone');

test('the four guided labs of the guide are present', () => {
  assert.deepEqual(GUIDED_LABS.map(l => l.id),
    ['one-interval-thesis', 'ambiguous-harmony', 'two-homes', 'independent-axes']);
  assert.equal(labById('two-homes').label, 'Same Collection, Two Homes');
  assert.equal(labById('nothing'), null);
});

test('every lab step builds in any context', () => {
  const contexts = [
    applyPreset('drop-asharp-phrygian-dominant'),
    normalizeContext({ instrument: 'keys', tonic: 'F#', collection: 'Lydian' }),
    normalizeContext({ instrument: 'bass', tonic: 'G', collection: 'Minor Pentatonic' }),
  ];
  for (const context of contexts) {
    for (const lab of GUIDED_LABS) {
      const steps = lab.steps(context);
      assert.ok(steps.length >= 4, `${lab.id} is too short`);
      for (const step of steps) {
        assert.ok(step.title && step.prompt, `${lab.id} has an empty step`);
        assert.ok(step.fields.length > 0, `${lab.id} step ${step.id} asks nothing`);
        assert.ok(!/undefined|\[object/.test(step.prompt), `${lab.id}: ${step.prompt}`);
      }
    }
  }
});

test('the interval theses cover the three the guide names, plus a custom one', () => {
  assert.deepEqual(THESIS_OPTIONS.map(t => t.id),
    ['b2-attacks', 'b6-falls', '7-cadence', 'custom']);
});

test('the song study runs three passes and a response', () => {
  assert.deepEqual(SONG_STUDY_PASSES.map(p => p.id),
    ['observe', 'hypothesize', 'challenge', 'response']);
  const observe = SONG_STUDY_PASSES[0];
  assert.ok(/no theory labels/i.test(observe.prompt));
  for (const pass of SONG_STUDY_PASSES) {
    assert.ok(pass.fields.length >= 3, `${pass.id} asks too little`);
  }
});

test('the capstone plans the piece and then scores it', () => {
  assert.equal(CAPSTONE_PLAN.length, 9);
  assert.deepEqual(CAPSTONE_RUBRIC.map(r => r.id),
    ['center', 'interval', 'motif', 'contrast', 'cadence', 'playability', 'original']);
  assert.deepEqual(RUBRIC_SCORES.map(s => s.value), [0, 1, 2, 3]);
  const empty = rubricTotal({});
  assert.equal(empty.total, 0);
  assert.equal(empty.max, 21);
  assert.equal(empty.weakest.length, 7);
  const full = rubricTotal(Object.fromEntries(CAPSTONE_RUBRIC.map(r => [r.id, 3])));
  assert.equal(full.total, 21);
  assert.equal(full.weakest.length, 0);
  assert.equal(rubricTotal({ center: 99 }).total, 3);
});

/* ------------------------------------------------------------------ */
console.log('Saved state');

test('an empty state is complete', () => {
  const state = emptyState();
  assert.ok(RUN_MODES.includes(state.mode));
  assert.equal(state.grid.cells.length, DEFAULT_SLOTS);
  assert.equal(state.motif.variants.length, 5);
  assert.deepEqual(state.completed, []);
});

test('a broken saved state repairs itself', () => {
  for (const bad of [null, undefined, 'text', 42, [], { mode: 'nonsense' }]) {
    const state = mergeState(bad);
    assert.ok(RUN_MODES.includes(state.mode));
    assert.ok(ROOTS.includes(state.context.tonic));
    assert.equal(Array.isArray(state.completed), true);
  }
  const state = mergeState({ grid: { cells: [1, 0, 1], pitches: { 0: '1', 1: '5' } } });
  assert.deepEqual(state.grid.cells, [true, false, true]);
  assert.deepEqual(state.grid.pitches, { 0: '1' });
});

test('a run keeps the exercise it built, not only its name', () => {
  const context = normalizeContext({});
  const run = guidedSession(context, { rng: seeded(5) });
  const state = mergeState({ ...emptyState(), run: { exercises: run, index: 2 } });
  assert.equal(state.run.exercises.length, 6);
  assert.equal(currentExercise(state).activity, 'map');
  assert.equal(runProgress(state).total, 6);
  assert.equal(runProgress(state).index, 2);
  const dropped = mergeState({ run: { exercises: ['just-an-id', null], index: 0 } });
  assert.deepEqual(dropped.run.exercises, []);
  assert.equal(currentExercise(dropped), null);
});

test('an answer is written, read back, and marked', () => {
  let state = emptyState();
  assert.equal(hasAnswer(state, 'x'), false);
  state = setAnswer(state, 'x', 'formula', '1 b2 3');
  assert.deepEqual(answersOf(state, 'x'), { formula: '1 b2 3' });
  assert.equal(hasAnswer(state, 'x'), true);
  state = setAnswer(state, 'x', 'formula', '   ');
  assert.equal(hasAnswer(state, 'x'), false);
  assert.equal(isRevealed(state, 'x'), false);
  state = markRevealed(state, 'x');
  assert.equal(isRevealed(state, 'x'), true);
  assert.deepEqual(answersOf(state, 'x'), { formula: '   ' });
});

test('a finished exercise is counted once', () => {
  let state = emptyState();
  state = markCompleted(state, 'a');
  state = markCompleted(state, 'a');
  state = markCompleted(state, 'b');
  state = markCompleted(state, '');
  assert.deepEqual(state.completed, ['a', 'b']);
  assert.equal(completedCount(state), 2);
});

test('a guided lab keeps its step and its answers', () => {
  let state = emptyState();
  assert.equal(labStep(state, 'two-homes'), 0);
  state = setLabStep(state, 'two-homes', 2);
  state = setLabAnswer(state, 'two-homes', 'section-a', 'the first section');
  assert.equal(labStep(state, 'two-homes'), 2);
  assert.deepEqual(labAnswers(state, 'two-homes'), { 'section-a': 'the first section' });
  assert.equal(setLabStep(state, 'two-homes', -5).labs['two-homes'].stepIndex, 0);
  const round = mergeState(JSON.parse(JSON.stringify(state)));
  assert.equal(labStep(round, 'two-homes'), 2);
  assert.deepEqual(labAnswers(round, 'two-homes'), { 'section-a': 'the first section' });
});

/* ------------------------------------------------------------------ */
console.log('One theory source of truth');

function filesUnder(dir) {
  const out = [];
  (function walk(current) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (full.endsWith('.js')) out.push(full);
    }
  })(join(ROOT, dir));
  return out.map(path => ({
    path: relative(ROOT, path).split('\\').join('/'),
    text: readFileSync(path, 'utf8'),
  }));
}

function importsOf(text) {
  const out = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+[^;]*?from\s+'([^']+)'|import\s*\(\s*'([^']+)'\s*\)/g;
  for (const match of text.matchAll(pattern)) out.push(match[1] || match[2]);
  return out;
}

const REFERENCE_FILES = filesUnder('js/reference');

test('the shared reference folder holds the three references', () => {
  const names = REFERENCE_FILES.map(f => f.path);
  for (const path of [
    'js/reference/index.js',
    'js/reference/intervalTable.js',
    'js/reference/intervalReferenceView.js',
    'js/reference/scaleReferenceView.js',
    'js/reference/chordReferenceView.js',
  ]) {
    assert.ok(names.includes(path), `${path} is missing`);
  }
});

test('the references never reach into a feature folder', () => {
  const banned = ['practiceLab', 'exercises.js', 'workbooks.js', 'gpPlayer', 'main.js',
    'shell/', 'areaPages.js', 'screenUx.js', 'tools.js'];
  for (const { path, text } of REFERENCE_FILES) {
    for (const spec of importsOf(text)) {
      for (const name of banned) {
        assert.equal(spec.includes(name), false, `${path} imports ${spec}`);
      }
    }
  }
});

test('no scale, chord, or tuning table lives twice', () => {
  // The catalogs live in js/scales.js, js/chords.js, and js/tunings.js. A copy
  // inside the reference folder or inside Practice Lab would drift.
  const suspects = filesUnder('js/reference').concat(filesUnder('js/practiceLab'));
  for (const { path, text } of suspects) {
    if (path.endsWith('js/scales.js') || path.endsWith('js/chords.js')) continue;
    assert.equal(/export const SCALES\s*=/.test(text), false, `${path} redefines SCALES`);
    assert.equal(/export const CHORDS\s*=/.test(text), false, `${path} redefines CHORDS`);
    assert.equal(/export const TUNINGS\s*=/.test(text), false, `${path} redefines TUNINGS`);
  }
});

test('Study and the Practice Lab mount the same interval component', () => {
  const studyPage = readFileSync(join(ROOT, 'js/intervalReference.js'), 'utf8');
  const drawer = readFileSync(join(ROOT, 'js/practiceLab/ui/referenceDrawer.js'), 'utf8');
  assert.ok(studyPage.includes('createIntervalReference'));
  assert.ok(drawer.includes('createIntervalReference'));
  assert.ok(studyPage.includes("from './reference/index.js'"));
  assert.ok(drawer.includes("from '../adapters/musiReference.js'"));
  const adapter = readFileSync(join(ROOT, 'js/practiceLab/adapters/musiReference.js'), 'utf8');
  assert.ok(adapter.includes("from '../../reference/index.js'"));
});

test('the old Chords and Scales tab is gone, not commented out', () => {
  for (const path of [
    'js/practiceLab/ui/theoryView.js',
    'js/practiceLab/ui/theoryChordsView.js',
    'js/practiceLab/model/theoryChords.js',
  ]) {
    assert.equal(existsSync(join(ROOT, path)), false, `${path} still exists`);
  }
});

test('the composition files stay inside the feature folder', () => {
  const feature = filesUnder('js/practiceLab');
  for (const { path, text } of feature) {
    if (path.startsWith('js/practiceLab/adapters/')) continue;
    const outside = importsOf(text).filter(spec => spec.startsWith('.') && spec.includes('../../'));
    assert.deepEqual(outside, [], `${path} imports outside the folder`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
