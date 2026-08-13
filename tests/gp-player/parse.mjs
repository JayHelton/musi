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

// Smoke: every generated score fixture must parse without error.
for (const name of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.gp5') || f.endsWith('.gp')).sort()) {
  const result = await parseGuitarPro(fixtureBytes(name));
  assertParseShape(result, name);
}

console.log('gp-player parse: ok');
