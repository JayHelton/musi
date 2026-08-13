// End-to-end parseGuitarPro checks for GP player fixtures.
// Run: node tests/gp-player/parse.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import { makeFixtures } from './fixtures/makeFixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');

const REJECT_GPX = 'This is a Guitar Pro 6 (.gpx) file. Open it in Guitar Pro and re-export as “.gp” (Guitar Pro 7/8) or “.gp5” to analyze it.';
const REJECT_LEGACY = (fmt) => `This is an older binary Guitar Pro file (${fmt}). Open it in Guitar Pro and re-save as “.gp” (7/8) or “.gp5” to analyze it.`;
const REJECT_UNKNOWN = 'Unrecognized file — expected a Guitar Pro “.gp” (7/8) or “.gp5” file.';

function fixtureBytes(name) {
  return readFileSync(join(FIXTURE_DIR, name));
}

function ensureFixtures() {
  const needed = [
    'tempo-change.gp5',
    'tempo-change.gp',
    'corrupt.bin',
    'legacy.gpx',
    'legacy.gp3',
    'legacy.gp4',
  ];
  if (needed.some((name) => !existsSync(join(FIXTURE_DIR, name)))) {
    makeFixtures();
  }
}

function assertParseShape(result, label) {
  assert.ok(Array.isArray(result.tracks), `${label}: tracks array`);
  assert.ok(Array.isArray(result.drumTracks), `${label}: drumTracks array`);
  assert.ok(Array.isArray(result.parts), `${label}: parts array`);
  assert.ok(result.tracks.length + result.drumTracks.length > 0, `${label}: at least one playable track`);
  const model = result.tracks[0]?.model || result.drumTracks[0]?.model;
  assert.ok(model, `${label}: model present`);
  assert.ok(Array.isArray(model.measures), `${label}: measures array`);
  assert.ok(model.measures.length > 0, `${label}: at least one measure`);
  const eventCount = (result.tracks[0]?.model?.events?.length || 0)
    + (result.drumTracks[0]?.model?.events?.length || 0);
  assert.ok(eventCount > 0, `${label}: playable events`);
}

async function assertRejects(name, expectedMessage) {
  const bytes = fixtureBytes(name);
  await assert.rejects(
    () => parseGuitarPro(bytes),
    (err) => {
      assert.equal(err.message, expectedMessage, `${name} reject message`);
      return true;
    },
  );
}

ensureFixtures();

const gp5Result = await parseGuitarPro(fixtureBytes('tempo-change.gp5'));
assertParseShape(gp5Result, 'tempo-change.gp5');
assert.equal(gp5Result.format, 'gp5');
assert.equal(gp5Result.tracks.length, 1);
assert.equal(gp5Result.tracks[0].model.measures.length, 16);
assert.equal(gp5Result.tempo, 90);

const gpResult = await parseGuitarPro(fixtureBytes('tempo-change.gp'));
assertParseShape(gpResult, 'tempo-change.gp');
assert.equal(gpResult.format, 'gp7');
assert.equal(gpResult.tracks.length, 1);
assert.equal(gpResult.tracks[0].model.measures.length, 16);

await assertRejects('legacy.gpx', REJECT_GPX);
await assertRejects('legacy.gp3', REJECT_LEGACY('gp3'));
await assertRejects('legacy.gp4', REJECT_LEGACY('gp4'));
await assertRejects('corrupt.bin', REJECT_UNKNOWN);

function assertTempoMap(model, label, expected) {
  assert.ok(Array.isArray(model.tempoMap), `${label}: tempoMap array`);
  assert.deepEqual(
    model.tempoMap.map((t) => ({ barIndex: t.barIndex, beat: t.beat, bpm: t.bpm, linear: t.linear })),
    expected,
    `${label}: tempoMap values`,
  );
}

function assertRepeatMarks(model, label) {
  assert.equal(model.measures[0].repeat.open, true, `${label}: repeat open bar 0`);
  assert.equal(model.measures[3].repeat.closeCount, 2, `${label}: repeat close count bar 3`);
  assert.deepEqual(model.measures[4].repeat.endings, [1], `${label}: ending 1 bar 4`);
  assert.deepEqual(model.measures[5].repeat.endings, [2], `${label}: ending 2 bar 5`);
}

function assertTiesAndRests(model, label) {
  const tied = model.events.filter((e) => e.tie);
  assert.ok(tied.length >= 1, `${label}: at least one tied event`);
  assert.equal(tied[0].tie, true, `${label}: tie flag`);
  assert.ok(Array.isArray(model.rests) && model.rests.length > 0, `${label}: rests array`);
  assert.equal(model.rests[0].noteValue, 4, `${label}: rest note value`);
}

function assertTwoVoices(model, label) {
  assert.equal(model.voiceCount, 2, `${label}: voiceCount`);
  const voice0 = model.beats.filter((b) => b.voiceIndex === 0 && !b.rest);
  const voice1 = model.beats.filter((b) => b.voiceIndex === 1 && !b.rest);
  assert.ok(voice0.length >= 1, `${label}: beats in voice 0`);
  assert.ok(voice1.length >= 1, `${label}: beats in voice 1`);
}

function assertTechniques(model, label) {
  const bendEvent = model.events.find((e) => e.bend?.points?.length);
  assert.ok(bendEvent, `${label}: bend event`);
  assert.ok(bendEvent.bend.points.length >= 1, `${label}: bend points`);
  const slideEvent = model.events.find((e) => e.slideKind);
  assert.ok(slideEvent, `${label}: slide event`);
  assert.equal(slideEvent.slideKind, 'shift', `${label}: slideKind shift`);
  const withVelocity = model.events.find((e) => Number.isFinite(e.velocity));
  assert.ok(withVelocity, `${label}: velocity on event`);
  assert.equal(withVelocity.velocity, 0.78, `${label}: default velocity`);
}

function assertTrackMixer(result, label, guitarProgram, bassProgram) {
  assert.ok(Array.isArray(result.warnings), `${label}: top-level warnings array`);
  const guitar = result.tracks.find((t) => t.name === 'Guitar');
  const bass = result.tracks.find((t) => t.name === 'Bass');
  assert.ok(guitar, `${label}: guitar track`);
  assert.ok(bass, `${label}: bass track`);
  assert.equal(guitar.program, guitarProgram, `${label}: guitar program`);
  assert.equal(bass.program, bassProgram, `${label}: bass program`);
  assert.equal(guitar.volume, 1, `${label}: guitar volume`);
  assert.equal(bass.volume, 1, `${label}: bass volume`);
  assert.equal(guitar.pan, 0, `${label}: guitar pan`);
  assert.equal(bass.pan, 0, `${label}: bass pan`);
  assert.equal(guitar.model.trackInfo.program, guitarProgram, `${label}: guitar trackInfo program`);
  assert.equal(bass.model.trackInfo.program, bassProgram, `${label}: bass trackInfo program`);
  assert.equal(guitar.model.trackInfo.volume, 1, `${label}: guitar trackInfo volume`);
  assert.equal(bass.model.trackInfo.pan, 0, `${label}: guitar trackInfo pan`);
}

// tempo-change.gp5 — binary reader path
const tempoGp5 = await parseGuitarPro(fixtureBytes('tempo-change.gp5'));
assert.ok(Array.isArray(tempoGp5.warnings), 'tempo-change.gp5: warnings array');
assertTempoMap(tempoGp5.tracks[0].model, 'tempo-change.gp5', [
  { barIndex: 0, beat: 0, bpm: 90, linear: false },
  { barIndex: 8, beat: 0, bpm: 140, linear: false },
]);
assert.ok(tempoGp5.tracks[0].model.beats.length >= 1, 'tempo-change.gp5: beats');

// tempo-change.gp — GPIF reader path
const tempoGp = await parseGuitarPro(fixtureBytes('tempo-change.gp'));
assert.ok(Array.isArray(tempoGp.warnings), 'tempo-change.gp: warnings array');
assertTempoMap(tempoGp.tracks[0].model, 'tempo-change.gp', [
  { barIndex: 0, beat: 0, bpm: 90, linear: false },
  { barIndex: 8, beat: 0, bpm: 140, linear: false },
]);

// repeat-endings — both parse paths
const repeatGp5 = await parseGuitarPro(fixtureBytes('repeat-endings.gp5'));
assertRepeatMarks(repeatGp5.tracks[0].model, 'repeat-endings.gp5');
assert.ok(repeatGp5.tracks[0].model.beats.length >= 1, 'repeat-endings.gp5: beats');

const repeatGp = await parseGuitarPro(fixtureBytes('repeat-endings.gp'));
assertRepeatMarks(repeatGp.tracks[0].model, 'repeat-endings.gp');

// two-voices — both parse paths
const voicesGp5 = await parseGuitarPro(fixtureBytes('two-voices.gp5'));
assertTwoVoices(voicesGp5.tracks[0].model, 'two-voices.gp5');

const voicesGp = await parseGuitarPro(fixtureBytes('two-voices.gp'));
assertTwoVoices(voicesGp.tracks[0].model, 'two-voices.gp');

// ties-rhythm — both parse paths
const tiesGp5 = await parseGuitarPro(fixtureBytes('ties-rhythm.gp5'));
assertTiesAndRests(tiesGp5.tracks[0].model, 'ties-rhythm.gp5');
assert.ok(tiesGp5.tracks[0].model.beats.length >= 1, 'ties-rhythm.gp5: beats');

const tiesGp = await parseGuitarPro(fixtureBytes('ties-rhythm.gp'));
assertTiesAndRests(tiesGp.tracks[0].model, 'ties-rhythm.gp');

// techniques — both parse paths (bend, slide, velocity)
const techGp5 = await parseGuitarPro(fixtureBytes('techniques.gp5'));
assertTechniques(techGp5.tracks[0].model, 'techniques.gp5');

const techGp = await parseGuitarPro(fixtureBytes('techniques.gp'));
assertTechniques(techGp.tracks[0].model, 'techniques.gp');

// large-200bar.gp5 — multi-track mixer metadata
const largeGp5 = await parseGuitarPro(fixtureBytes('large-200bar.gp5'));
assertTrackMixer(largeGp5, 'large-200bar.gp5', 27, 33);
assert.equal(largeGp5.tracks[0].model.beats.length, 200, 'large-200bar.gp5: beat count');

// Grace notes: techniques.gp5 holds one grace note before its main note.
const graceEvents = techGp5.tracks[0].model.events.filter((e) => e.grace);
assert.equal(graceEvents.length, 1, 'techniques.gp5: one grace event');
assert.equal(graceEvents[0].fret, 4, 'techniques.gp5: grace fret');
assert.ok(Number.isFinite(graceEvents[0].midi), 'techniques.gp5: grace midi');
const graceMain = techGp5.tracks[0].model.events.find(
  (e) => !e.grace && e.beatIndex === graceEvents[0].beatIndex,
);
assert.ok(graceMain, 'techniques.gp5: main note on the grace beat');
assert.equal(graceMain.fret, 5, 'techniques.gp5: main note fret');

// techniques.gp5 must carry every one of the 13 techniques from FR-021.
const FR021_TECHNIQUES = [
  'bend', 'slide', 'hammer', 'pull', 'vibrato', 'palmMute', 'harmonic',
  'tap', 'slap', 'pop', 'trill', 'tremolo', 'dead',
];
for (const tech of FR021_TECHNIQUES) {
  assert.ok(
    (techGp5.tracks[0].model.techniqueCounts?.[tech] || 0) >= 1,
    `techniques.gp5: technique ${tech}`,
  );
}

// Smoke: every generated score fixture must parse without error.
for (const name of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.gp5') || f.endsWith('.gp')).sort()) {
  const result = await parseGuitarPro(fixtureBytes(name));
  assertParseShape(result, name);
}

console.log('gp-player parse: ok');
