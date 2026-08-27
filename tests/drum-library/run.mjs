/**
 * Zero-dependency Node tests for the drum beat library, the rudiment library,
 * the pattern-to-score builder, and the warm-up picker.
 *
 * Every part under test is pure, so this runner reads the modules directly and
 * needs no browser.
 *
 * Run: node tests/drum-library/run.mjs
 */

import assert from 'node:assert/strict';

import {
  MAX_BARS,
  PATTERN_LANES,
  PATTERN_LANE_KEYS,
  STICKING_KEY,
  gpResultOf,
  patternProblems,
  percussionModelOf,
  readPattern,
  rowSteps,
} from '../../js/drums/patternScore.js';
import { BEATS, BEAT_GENRES, beatById, beatsOfGenre } from '../../js/drums/beatLibrary.js';
import {
  RUDIMENTS, RUDIMENT_FAMILIES, rudimentById, rudimentsOfFamily,
} from '../../js/drums/rudimentLibrary.js';
import {
  WARM_UP_COOLDOWN, blockedIds, pickId, pickWarmUp, warmUpHistory, warmUpLabel,
} from '../../js/drums/warmUp.js';
import { barsFromMeasures, barQuarters, stickingOf } from '../../js/drums/staffNotation.js';
import { DRUM_STAFF_POSITIONS } from '../../js/drums/staffNotation.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}`);
    console.log(`    ${error && error.message}`);
  }
}

function group(name) {
  console.log(name);
}

const ALL_PATTERNS = [...BEATS, ...RUDIMENTS];

/* ---------------- the grid ---------------- */

group('Pattern grid');

test('a group separator costs no step', () => {
  assert.equal(rowSteps('x-x-|x-x-').length, 8);
  assert.deepEqual(rowSteps('x-|x-'), ['x', '-', 'x', '-']);
});

test('a row of the wrong length is a problem', () => {
  const problems = patternProblems({ id: 't', grid: 16, bars: [{ S: 'oooo' }] });
  assert.ok(problems.some((p) => /has 4 steps/.test(p)), problems.join('; '));
});

test('an unknown lane and an unknown stroke are problems', () => {
  const problems = patternProblems({ id: 't', grid: 4, bars: [{ ZZ: 'oooo', S: 'oQoo' }] });
  assert.ok(problems.some((p) => /unknown lane "ZZ"/.test(p)), problems.join('; '));
  assert.ok(problems.some((p) => /unknown stroke "Q"/.test(p)), problems.join('; '));
});

test('an unknown hand is a problem', () => {
  const problems = patternProblems({ id: 't', grid: 4, bars: [{ S: 'oooo', LR: 'RLRX' }] });
  assert.ok(problems.some((p) => /unknown hand "X"/.test(p)), problems.join('; '));
});

test('a pattern over the bar limit is a problem', () => {
  const bars = Array.from({ length: MAX_BARS + 1 }, () => ({ S: 'oooo' }));
  const problems = patternProblems({ id: 't', grid: 4, bars });
  assert.ok(problems.some((p) => /the limit is 8/.test(p)), problems.join('; '));
});

test('a broken pattern throws instead of building a wrong score', () => {
  assert.throws(() => readPattern({ id: 'bad', grid: 4, bars: [{ S: 'oo' }] }), /drum pattern "bad"/);
});

test('every lane key the library uses is a known lane', () => {
  const known = new Set([...PATTERN_LANE_KEYS, STICKING_KEY, 'timeSig', 'label']);
  for (const pattern of ALL_PATTERNS) {
    for (const bar of pattern.bars) {
      for (const key of Object.keys(bar)) {
        assert.ok(known.has(key), `${pattern.id} writes the lane ${key}`);
      }
    }
  }
});

test('the lanes run from the cymbals down to the kick', () => {
  assert.deepEqual(PATTERN_LANES.map((lane) => lane.key), ['C', 'R', 'H', 'S', 'T1', 'T2', 'FT', 'K']);
});

/* ---------------- the score builder ---------------- */

group('Score builder');

const ROCK = beatById('rock-backbeat');

test('a bar holds the beats its time signature names', () => {
  const model = percussionModelOf(ROCK);
  assert.equal(model.measures.length, 4);
  assert.equal(model.totalBeats, 16);
  for (const measure of model.measures) {
    assert.equal(measure.endBeat - measure.startBeat, barQuarters(measure.timeSig));
  }
});

test('a step lands on its own place in the bar', () => {
  const model = percussionModelOf({
    id: 't', name: 'T', bpm: 100, grid: 16, timeSig: [4, 4],
    bars: [{ S: 'o---|o---|o---|o---' }],
  });
  assert.deepEqual(model.events.map((e) => e.start), [0, 1, 2, 3]);
});

test('a compound bar counts its own quarters', () => {
  const model = percussionModelOf({
    id: 't', name: 'T', bpm: 180, grid: 12, timeSig: [12, 8],
    bars: [{ R: 'x--|x--|x--|x--' }],
  });
  assert.equal(model.totalBeats, 6);
  assert.deepEqual(model.events.map((e) => e.start), [0, 1.5, 3, 4.5]);
});

test('every main stroke belongs to exactly one written beat', () => {
  for (const pattern of ALL_PATTERNS) {
    const model = percussionModelOf(pattern);
    const owned = new Set();
    for (const beat of model.beats) {
      for (const index of beat.noteIndices) {
        assert.ok(!owned.has(index), `${pattern.id}: note ${index} sits in two beats`);
        owned.add(index);
      }
    }
    model.events.forEach((event, index) => {
      if (event.grace) assert.ok(!owned.has(index), `${pattern.id}: a grace stroke joined a beat`);
      else assert.ok(owned.has(index), `${pattern.id}: a stroke belongs to no beat`);
    });
  }
});

test('a grace stroke names the beat it leans on and sounds before it', () => {
  const model = percussionModelOf({
    id: 't', name: 'T', bpm: 80, grid: 4, timeSig: [4, 4],
    bars: [{ S: 'f-d-', LR: 'R-L-' }],
  });
  const graces = model.events.filter((e) => e.grace);
  assert.equal(graces.length, 3, 'a flam adds one grace stroke and a drag adds two');
  for (const grace of graces) {
    const beat = model.beats[grace.beatIndex];
    assert.ok(beat, 'the grace stroke names a beat');
    assert.equal(beat.start, grace.start);
    assert.ok(grace.duration > 0, 'the grace stroke carries its lead-in');
  }
  const drag = graces.filter((g) => g.start === 2).map((g) => g.duration);
  assert.equal(new Set(drag).size, 2, 'the two strokes of a drag do not sound together');
});

test('a hit reads as a note that stops at the end of its beat', () => {
  const model = percussionModelOf({
    id: 't', name: 'T', bpm: 100, grid: 16, timeSig: [4, 4],
    bars: [{ K: 'o---|----|----|----' }],
  });
  const [bar] = barsFromMeasures(model.measures, model.events);
  const written = bar.voices.down.map((entry) => `${entry.rest ? 'rest' : 'kick'}/${entry.value}`);
  assert.deepEqual(written, ['kick/4', 'rest/2', 'rest/4']);
});

test('the hands take the upper voice and the feet take the lower one', () => {
  const model = percussionModelOf(ROCK);
  const [bar] = barsFromMeasures(model.measures, model.events);
  const up = new Set(bar.voices.up.flatMap((e) => e.notes.map((n) => n.name)));
  const down = new Set(bar.voices.down.flatMap((e) => e.notes.map((n) => n.name)));
  assert.ok(up.has('hihatClosed'));
  assert.ok(down.has('kick'));
  assert.ok(!down.has('hihatClosed'));
});

test('a sticking letter reaches the note a hand plays', () => {
  const model = percussionModelOf({
    id: 't', name: 'T', bpm: 100, grid: 4, timeSig: [4, 4],
    bars: [{ S: 'oooo', K: 'o---', LR: 'RLRL' }],
  });
  const snare = model.events.filter((e) => e.instrument === 'snare');
  assert.deepEqual(snare.map((e) => e.hand), ['R', 'L', 'R', 'L']);
  const kick = model.events.find((e) => e.instrument === 'kick');
  assert.equal(kick.hand, undefined, 'a foot takes no hand');
});

test('the score the player reads holds one drum track and no string track', () => {
  const result = gpResultOf(ROCK);
  assert.equal(result.tracks.length, 0);
  assert.equal(result.drumTracks.length, 1);
  assert.equal(result.tempo, ROCK.bpm);
  assert.equal(result.drumTracks[0].model.percussion, true);
  assert.equal(result.drumTracks[0].hitCount, result.drumTracks[0].model.events.length);
});

/* ---------------- the beat library ---------------- */

group('Beat library');

test('every beat builds a score', () => {
  for (const beat of BEATS) {
    assert.deepEqual(patternProblems(beat), [], beat.id);
    assert.ok(percussionModelOf(beat).events.length > 0, beat.id);
  }
});

test('every beat id is unique', () => {
  const ids = BEATS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('no beat runs longer than eight bars', () => {
  for (const beat of BEATS) assert.ok(beat.bars.length <= MAX_BARS, beat.id);
});

test('every beat ends with a fill, and the fill differs from the groove', () => {
  for (const beat of BEATS) {
    assert.ok(beat.fill, `${beat.id} names no fill`);
    const groove = JSON.stringify(beat.bars[beat.bars.length - 2]);
    const fill = JSON.stringify(beat.bars[beat.bars.length - 1]);
    assert.notEqual(fill, groove, `${beat.id} repeats the groove instead of filling`);
  }
});

test('a fill names the hand of every drum it strikes', () => {
  for (const beat of BEATS) {
    const last = beat.bars[beat.bars.length - 1];
    assert.ok(last[STICKING_KEY], `${beat.id} writes a fill with no sticking`);
  }
});

test('every genre carries at least one beat, and every beat carries a known genre', () => {
  for (const genre of BEAT_GENRES) {
    assert.ok(beatsOfGenre(genre).length > 0, `${genre} has no beat`);
  }
  const known = new Set(BEAT_GENRES);
  for (const beat of BEATS) assert.ok(known.has(beat.genre), `${beat.id} names ${beat.genre}`);
});

test('the library covers the genres the player asked for', () => {
  for (const genre of ['Jazz', 'Rock', 'Metal', 'Punk']) {
    assert.ok(beatsOfGenre(genre).length >= 3, `${genre} needs more beats`);
  }
});

test('every beat carries a tempo a player can set', () => {
  for (const beat of BEATS) {
    assert.ok(beat.bpm >= 40 && beat.bpm <= 320, `${beat.id} sits at ${beat.bpm} BPM`);
  }
});

test('every beat teaches something in words', () => {
  for (const beat of BEATS) {
    assert.ok(beat.about && beat.focus && beat.feel, beat.id);
  }
});

test('a swing beat is written in a compound meter and names its felt beat', () => {
  const swung = BEATS.filter((b) => /swing|shuffle|triplet/i.test(b.feel));
  assert.ok(swung.length >= 5);
  for (const beat of swung) {
    assert.equal(beat.timeSig[1], 8, `${beat.id} writes a swing feel in a simple meter`);
    assert.ok(beat.pulse > 0, `${beat.id} names no felt beat`);
  }
});

test('the linear funk groove never lands two limbs together', () => {
  const model = percussionModelOf(beatById('funk-linear'));
  const starts = model.events.filter((e) => !e.grace).map((e) => e.start);
  assert.equal(new Set(starts).size, starts.length);
});

/* ---------------- the rudiment library ---------------- */

group('Rudiment library');

test('the library holds more than ten rudiments', () => {
  assert.ok(RUDIMENTS.length > 10, `only ${RUDIMENTS.length} rudiments`);
});

test('no rudiment is a single-stroke pattern', () => {
  for (const rudiment of RUDIMENTS) {
    assert.ok(!/single stroke/i.test(rudiment.name), rudiment.id);
    const hands = rudiment.bars
      .map((bar) => rowSteps(bar.LR || '').filter((c) => c === 'R' || c === 'L').join(''))
      .join('');
    const alternates = [...hands].every((hand, index) => index === 0 || hand !== hands[index - 1]);
    const ornamented = rudiment.bars.some((bar) => /[fFdD]/.test(bar.S || ''));
    assert.ok(!alternates || ornamented, `${rudiment.id} is a plain alternation`);
  }
});

test('the flam family and the diddle family are both covered', () => {
  for (const family of RUDIMENT_FAMILIES) {
    assert.ok(rudimentsOfFamily(family).length >= 4, `${family} needs more rudiments`);
  }
  assert.ok(rudimentsOfFamily('Flam').some((r) => /flam/i.test(r.name)));
  assert.ok(rudimentsOfFamily('Diddle').some((r) => /paradiddle/i.test(r.name)));
});

test('every rudiment builds a score', () => {
  for (const rudiment of RUDIMENTS) {
    assert.deepEqual(patternProblems(rudiment), [], rudiment.id);
    assert.ok(percussionModelOf(rudiment).events.length > 0, rudiment.id);
  }
});

test('every rudiment stroke names its hand', () => {
  for (const rudiment of RUDIMENTS) {
    const model = percussionModelOf(rudiment);
    for (const event of model.events) {
      if (event.grace) continue;
      assert.ok(stickingOf(event), `${rudiment.id} leaves a stroke with no hand`);
    }
  }
});

test('the second bar of a rudiment leads with the other hand', () => {
  for (const rudiment of RUDIMENTS) {
    assert.equal(rudiment.bars.length, 2, rudiment.id);
    const lead = (bar) => rowSteps(bar.LR).find((c) => c === 'R' || c === 'L');
    if (lead(rudiment.bars[0]) === lead(rudiment.bars[1])) {
      // A pattern that alternates inside one bar already covers both hands.
      const hands = rowSteps(rudiment.bars[0].LR).filter((c) => c === 'R' || c === 'L');
      assert.ok(
        hands.includes('R') && hands.includes('L'),
        `${rudiment.id} never leads with the left hand`,
      );
    }
  }
});

test('every rudiment plays on the snare drum alone', () => {
  for (const rudiment of RUDIMENTS) {
    for (const bar of rudiment.bars) {
      const lanes = Object.keys(bar).filter((k) => k !== STICKING_KEY);
      assert.deepEqual(lanes, ['S'], rudiment.id);
    }
    const model = percussionModelOf(rudiment);
    for (const event of model.events) {
      assert.equal(DRUM_STAFF_POSITIONS[event.instrument]?.voice, 'up', rudiment.id);
    }
  }
});

test('every rudiment spells its sticking in words as well as in notes', () => {
  for (const rudiment of RUDIMENTS) {
    assert.ok(rudiment.sticking, rudiment.id);
    assert.ok(rudiment.about && rudiment.focus, rudiment.id);
  }
});

test('a flam carries one grace stroke and a drag carries two', () => {
  const flam = percussionModelOf(rudimentById('flam'));
  const drag = percussionModelOf(rudimentById('drag'));
  const graceCount = (model) => model.events.filter((e) => e.grace).length;
  const mainCount = (model) => model.events.filter((e) => !e.grace).length;
  assert.equal(graceCount(flam), mainCount(flam));
  assert.equal(graceCount(drag), mainCount(drag) * 2);
});

test('the staff draws one grace head for each grace stroke', () => {
  const model = percussionModelOf(rudimentById('drag'));
  const [bar] = barsFromMeasures(model.measures, model.events);
  for (const entry of bar.voices.up) {
    if (entry.rest) continue;
    for (const note of entry.notes) {
      assert.equal(note.flam, true);
      assert.equal(note.graces, 2);
    }
  }
});

/* ---------------- the warm-up picker ---------------- */

group('Warm-up picker');

test('the cooldown is three sessions', () => {
  assert.equal(WARM_UP_COOLDOWN, 3);
});

test('the history reads newest first and skips a session with no warm-up', () => {
  const history = warmUpHistory([
    { startedAt: '2026-01-01T10:00:00.000Z', warmUp: { beatId: 'a', rudimentId: 'x' } },
    { startedAt: '2026-01-04T10:00:00.000Z' },
    { startedAt: '2026-01-03T10:00:00.000Z', warmUp: { beatId: 'c', rudimentId: 'z' } },
    { startedAt: '2026-01-02T10:00:00.000Z', warmUp: { beatId: 'b', rudimentId: 'y' } },
  ]);
  assert.deepEqual(history.map((h) => h.beatId), ['c', 'b', 'a']);
});

test('the history reads no more entries than the cooldown counts', () => {
  const sessions = Array.from({ length: 9 }, (_, i) => ({
    startedAt: `2026-01-0${i + 1}T10:00:00.000Z`,
    warmUp: { beatId: `b${i}`, rudimentId: `r${i}` },
  }));
  assert.equal(warmUpHistory(sessions).length, WARM_UP_COOLDOWN);
});

test('the last three sessions block their own ids', () => {
  const history = [
    { beatId: 'a', rudimentId: 'x' },
    { beatId: 'b', rudimentId: 'y' },
    { beatId: 'c', rudimentId: 'z' },
    { beatId: 'd', rudimentId: 'w' },
  ];
  assert.deepEqual([...blockedIds(history, 'beatId')], ['a', 'b', 'c']);
  assert.deepEqual([...blockedIds(history, 'rudimentId')], ['x', 'y', 'z']);
});

test('a blocked id never comes back inside the cooldown', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const history = [{ beatId: 'a' }, { beatId: 'b' }, { beatId: 'c' }];
  for (let step = 0; step < 20; step += 1) {
    const value = step / 20;
    assert.equal(pickId(ids, history, 'beatId', () => value), 'd');
  }
});

test('a short list falls back to the entry that waited longest', () => {
  const ids = ['a', 'b', 'c'];
  const history = [{ beatId: 'c' }, { beatId: 'b' }, { beatId: 'a' }];
  assert.equal(pickId(ids, history, 'beatId', () => 0.5), 'a');
});

test('an empty list answers with nothing instead of throwing', () => {
  assert.equal(pickId([], [], 'beatId', () => 0.5), '');
});

test('a random source at its limits still lands inside the list', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(pickId(ids, [], 'beatId', () => 0), 'a');
  assert.equal(pickId(ids, [], 'beatId', () => 0.999999), 'c');
  assert.equal(pickId(ids, [], 'beatId', () => 1), 'c');
  assert.ok(ids.includes(pickId(ids, [], 'beatId', () => NaN)));
});

test('the picker names one beat and one rudiment of the library', () => {
  const pick = pickWarmUp({ history: [], random: () => 0.5 });
  assert.ok(beatById(pick.beatId), pick.beatId);
  assert.ok(rudimentById(pick.rudimentId), pick.rudimentId);
  assert.equal(pick.beat.id, pick.beatId);
  assert.equal(pick.rudiment.id, pick.rudimentId);
});

test('twenty sessions in a row never repeat inside the cooldown', () => {
  // A pinned generator, so a failure repeats.
  let seed = 1;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let history = [];
  for (let round = 0; round < 20; round += 1) {
    const pick = pickWarmUp({ history, random });
    const recent = history.slice(0, WARM_UP_COOLDOWN);
    assert.ok(!recent.some((h) => h.beatId === pick.beatId), `round ${round} repeats a beat`);
    assert.ok(!recent.some((h) => h.rudimentId === pick.rudimentId), `round ${round} repeats a rudiment`);
    history = [{ beatId: pick.beatId, rudimentId: pick.rudimentId }, ...history];
  }
});

test('the label names the groove, its genre, and the rudiment', () => {
  const label = warmUpLabel({ beatId: 'rock-backbeat', rudimentId: 'single-paradiddle' });
  assert.equal(label, 'Rock Backbeat (Rock) · Single Paradiddle');
  assert.equal(warmUpLabel({ beatId: 'nope', rudimentId: 'nope' }), '');
});

/* ---------------- report ---------------- */

console.log('');
if (failures.length) {
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.log(`\n${failure.name}`);
    console.log(failure.error?.stack || failure.error);
  }
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
