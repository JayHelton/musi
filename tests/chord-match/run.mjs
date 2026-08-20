/**
 * Zero-dependency Node tests for multi-answer chord identification.
 * Run: node tests/chord-match/run.mjs
 */

import assert from 'node:assert/strict';
import { matchChords, spellQuality, CHORD_QUALITIES, matchCaveat } from '../../js/analysis/chordMatch.js';

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

/** Note names to MIDI numbers in the octave above middle C, bass first. */
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** Stack the named notes upward from C3 so the first one is the bass. */
function voicing(names) {
  let last = 47;
  return names.map((n) => {
    let midi = 48 + PC[n];
    while (midi <= last) midi += 12;
    last = midi;
    return midi;
  });
}

function labels(names, opts) {
  return matchChords(voicing(names), opts).matches.map(m => m.label);
}

console.log('Catalogue');
test('every quality spells cleanly on every root', () => {
  for (const quality of CHORD_QUALITIES) {
    for (let pc = 0; pc < 12; pc++) {
      const spelled = spellQuality(pc, quality);
      assert.ok(spelled, `${quality.id} has no spelling on pc ${pc}`);
      assert.equal(spelled.tones.length, quality.tones.length);
    }
  }
});

test('no two qualities share a pitch-class set', () => {
  const seen = new Map();
  for (const quality of CHORD_QUALITIES) {
    const key = [...new Set(quality.tones.map(([, s]) => ((s % 12) + 12) % 12))]
      .sort((a, b) => a - b).join(',');
    assert.equal(seen.has(key), false,
      `${quality.id} duplicates ${seen.get(key)} (${key})`);
    seen.set(key, quality.id);
  }
});

console.log('Triads');
test('a major triad is named, and named first', () => {
  assert.equal(labels(['B', 'D#', 'F#'])[0], 'B');
  assert.equal(labels(['C', 'E', 'G'])[0], 'C');
  assert.equal(labels(['A', 'C', 'E'])[0], 'Am');
});

test('an inversion reads as a slash chord', () => {
  const found = labels(['E', 'G', 'C']);
  assert.equal(found[0], 'C/E');
  const second = labels(['G', 'C', 'E']);
  assert.equal(second[0], 'C/G');
});

test('a suspended triad names both of its readings', () => {
  const found = labels(['C', 'F', 'G']);
  assert.ok(found.includes('Csus4'), found.join(', '));
  assert.ok(found.includes('Fsus2/C'), found.join(', '));
});

console.log('Enharmonic spelling');
test('the spelling with the fewest accidentals wins', () => {
  // A# C# E needs one accidental fewer than Bb Db Fb.
  assert.equal(labels(['A#', 'C#', 'E'])[0], 'A#dim');
  // Db F Ab beats C# E# G#.
  assert.equal(labels(['Db', 'F', 'Ab'])[0], 'Db');
  // C# E G# beats Db Fb Ab.
  assert.equal(labels(['C#', 'E', 'G#'])[0], 'C#m');
  // Bb Db F beats A# C# E#.
  assert.equal(labels(['A#', 'C#', 'F'])[0], 'Bbm');
});

test('a root is never spelled B#, Cb, E#, or Fb', () => {
  for (let pc = 0; pc < 12; pc++) {
    for (const quality of CHORD_QUALITIES) {
      const root = spellQuality(pc, quality).root;
      assert.equal(['B#', 'Cb', 'E#', 'Fb'].includes(root), false,
        `${quality.id} on pc ${pc} spelled its root ${root}`);
    }
  }
});

test('a diminished 7th keeps its double-flat 7th', () => {
  const match = matchChords(voicing(['C', 'Eb', 'Gb', 'A'])).matches[0];
  assert.equal(match.label, 'Cdim7');
  assert.deepEqual(match.notes, ['C', 'Eb', 'Gb', 'Bbb']);
});

console.log('More than one true answer');
test('C E G A is both C6 and Am7', () => {
  const found = labels(['C', 'E', 'G', 'A']);
  assert.equal(found[0], 'C6');
  assert.ok(found.includes('Am7/C'), found.join(', '));
});

test('the same notes over a different bass reorder the answers', () => {
  const found = labels(['A', 'C', 'E', 'G']);
  assert.equal(found[0], 'Am7');
  assert.ok(found.includes('C6/A'), found.join(', '));
});

test('a diminished 7th is named on all four of its notes', () => {
  const found = labels(['C', 'Eb', 'Gb', 'A']);
  for (const name of ['Cdim7', 'Adim7/C', 'F#dim7/C', 'D#dim7/C']) {
    assert.ok(found.includes(name), `${name} missing from ${found.join(', ')}`);
  }
});

test('an augmented triad is named on all three of its notes', () => {
  const found = labels(['C', 'E', 'G#']);
  assert.equal(found.filter(l => l.includes('aug')).length, 3, found.join(', '));
});

console.log('Missing chord tones');
test('a seventh chord may lose its fifth', () => {
  const match = matchChords(voicing(['C', 'E', 'Bb'])).matches[0];
  assert.equal(match.label, 'C7');
  assert.deepEqual(match.omitted, ['5']);
  assert.equal(matchCaveat(match), 'no 5');
});

test('a triad may not lose a tone', () => {
  // C and E are a third, not a rootless C major with something implied.
  const found = labels(['C', 'E']);
  assert.equal(found.includes('C'), false, found.join(', '));
  assert.equal(found[0], 'C(3)');
});

test('nothing loses more than one tone', () => {
  for (const midis of [voicing(['C', 'E']), voicing(['C', 'E', 'G']), voicing(['C', 'D', 'E', 'G'])]) {
    for (const match of matchChords(midis).matches) {
      assert.ok(match.omitted.length <= 1, `${match.label} drops ${match.omitted.length} tones`);
    }
  }
});

console.log('Rules that keep an answer true');
test('every match accounts for every selected note', () => {
  const sets = [
    ['C', 'E', 'G', 'A'], ['C', 'Eb', 'Gb', 'A'], ['C', 'D', 'E', 'G'],
    ['D', 'F', 'A', 'C', 'E', 'G'], ['G', 'B', 'D', 'F', 'A', 'C', 'E'],
  ];
  for (const names of sets) {
    const result = matchChords(voicing(names));
    for (const match of result.matches) {
      const sounding = new Set(match.tones.filter(t => !t.omitted).map(t => t.pc));
      assert.deepEqual([...sounding].sort((a, b) => a - b), result.pitchClasses,
        `${match.label} does not account for ${names.join(' ')}`);
    }
  }
});

test('every match is rooted on a selected note', () => {
  const result = matchChords(voicing(['C', 'E', 'G', 'B', 'D']));
  for (const match of result.matches) {
    assert.ok(result.pitchClasses.includes(match.rootPc),
      `${match.label} is rooted on a note that is not selected`);
  }
});

test('matches come back best first', () => {
  const scores = matchChords(voicing(['C', 'Eb', 'Gb', 'A'])).matches.map(m => m.score);
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] <= scores[i - 1], 'matches are out of order');
  }
});

console.log('Extensions');
test('a ninth, an eleventh, and a thirteenth are all named', () => {
  assert.equal(labels(['C', 'E', 'G', 'B', 'D'])[0], 'Cmaj9');
  assert.equal(labels(['D', 'F', 'A', 'C', 'E', 'G'])[0], 'Dm11');
  assert.equal(labels(['G', 'B', 'D', 'F', 'A', 'E'])[0], 'G13');
});

test('a full seven-note stack still gets a name', () => {
  assert.equal(labels(['G', 'B', 'D', 'F', 'A', 'C', 'E'])[0], 'G13');
});

console.log('Dyads and edge cases');
test('one note is not a chord', () => {
  const result = matchChords(voicing(['C']));
  assert.deepEqual(result.matches, []);
  assert.equal(result.interval, null);
});

test('no notes returns an empty answer', () => {
  const result = matchChords([]);
  assert.deepEqual(result.matches, []);
  assert.equal(result.bassPc, null);
});

test('two notes report their interval and read as a power chord', () => {
  const result = matchChords(voicing(['C', 'G']));
  assert.equal(result.interval.label, 'P5');
  assert.equal(result.matches[0].label, 'C5');
  assert.equal(result.matches[0].dyad, true);
});

test('a doubled note changes nothing', () => {
  const plain = matchChords(voicing(['C', 'E', 'G'])).matches.map(m => m.label);
  const doubled = matchChords([48, 52, 55, 64, 67]).matches.map(m => m.label);
  assert.deepEqual(doubled, plain);
});

test('the bass is the lowest note, whatever order it arrives in', () => {
  const a = matchChords([64, 55, 48]).matches[0];
  const b = matchChords([48, 55, 64]).matches[0];
  assert.equal(a.label, b.label);
  assert.equal(a.label, 'C');
});

test('confidence is a share of the best score, and the best is 100', () => {
  const matches = matchChords(voicing(['C', 'E', 'G', 'A'])).matches;
  assert.equal(matches[0].confidence, 100);
  for (const match of matches) {
    assert.ok(match.confidence > 0 && match.confidence <= 100, `${match.label} scored ${match.confidence}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
