/**
 * End-to-end Node tests for installing a sample pack from an archive.
 * It builds a ZIP in memory, then installs it the way the Settings screen does.
 * Run: node tests/sounds/install.mjs
 */

import assert from 'node:assert/strict';
import { installIdbShim } from '../exercises/idbShim.mjs';

function installLocalStorageShim() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

installLocalStorageShim();
globalThis.window = globalThis;
installIdbShim();

const { createZipWriter } = await import('../../js/sync/zip.js');
const {
  addInstrumentPack,
  listInstrumentPacks,
  listUserSounds,
  removeUserSound,
} = await import('../../js/audio/userSounds.js');
const { getPack, __resetPackRegistryForTests } = await import('../../js/audio/samplePackRegistry.js');
const { getFileBlob } = await import('../../js/attachments.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.stack || err.message}`);
  }
}

/** Build a ZIP file in memory. `files` maps a path onto text or bytes. */
async function makeZip(files, name) {
  const writer = createZipWriter();
  const chunks = [];
  const reader = writer.stream.getReader();
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  })();
  for (const [path, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    await writer.addFile({ name: path, data });
  }
  await writer.close();
  await pump;
  const blob = new Blob(chunks, { type: 'application/zip' });
  blob.name = name;
  return blob;
}

const KIT_XML = `<multisample name="Studio Kit">
  <layer name="Default">
    <sample file="Samples/kick.wav"><key root="36" low="36" high="36"/></sample>
    <sample file="Samples/snare.wav"><key root="38" low="38" high="38"/></sample>
    <sample file="Samples/hat.wav"><key root="42" low="42" high="42"/></sample>
    <sample file="Samples/ride.wav"><key root="51" low="51" high="51"/></sample>
  </layer>
</multisample>`;

const PIANO_SFZ = `<control>
default_path=samples/
<region>
sample=c3.wav lokey=c3 hikey=e3 pitch_keycenter=c3
<region>
sample=g3.wav lokey=f3 hikey=b3 pitch_keycenter=g3
`;

const AUDIO = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

await test('a .multisample archive installs as a percussion pack', async () => {
  const zip = await makeZip({
    'multisample.xml': KIT_XML,
    'Samples/kick.wav': AUDIO,
    'Samples/snare.wav': AUDIO,
    'Samples/hat.wav': AUDIO,
    'Samples/ride.wav': AUDIO,
  }, 'Studio Kit.multisample');

  const result = await addInstrumentPack(zip);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.sound.packKind, 'percussion');
  assert.equal(result.sound.format, 'multisample');
  assert.equal(result.sound.name, 'Studio Kit');

  // The kit shows in the percussion list only.
  assert.equal(listInstrumentPacks('percussion').length, 1);
  assert.equal(listInstrumentPacks('pitched').length, 0);

  // The pack is in the registry, and every sample file is in the store.
  const manifest = getPack(result.sound.manifest.id);
  assert.ok(manifest, 'the pack registers on install');
  assert.equal(manifest.samples.length, 4);
  for (const sample of manifest.samples) {
    const attachmentId = result.sound.files[sample.file];
    assert.ok(attachmentId, `${sample.file} has a stored file`);
    const blob = await getFileBlob(attachmentId);
    assert.ok(blob, `${sample.file} reads back from the store`);
  }
});

await test('an SFZ archive installs as a pitched pack', async () => {
  const zip = await makeZip({
    'Piano/Piano.sfz': PIANO_SFZ,
    'Piano/samples/c3.wav': AUDIO,
    'Piano/samples/g3.wav': AUDIO,
  }, 'Piano.zip');

  const result = await addInstrumentPack(zip);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.sound.packKind, 'pitched');
  assert.equal(result.sound.format, 'sfz');
  assert.equal(listInstrumentPacks('pitched').length, 1);
  assert.deepEqual(
    result.sound.manifest.samples.map((s) => s.rootMidi).sort((a, b) => a - b),
    [48, 55],
  );
});

await test('the user can install a kit as a pitched pack', async () => {
  const zip = await makeZip({
    'multisample.xml': KIT_XML,
    'Samples/kick.wav': AUDIO,
    'Samples/snare.wav': AUDIO,
    'Samples/hat.wav': AUDIO,
    'Samples/ride.wav': AUDIO,
  }, 'Kit as instrument.multisample');

  const result = await addInstrumentPack(zip, { kind: 'pitched', name: 'Kit notes' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.sound.packKind, 'pitched');
  assert.equal(result.sound.name, 'Kit notes');
});

await test('a missing sample file stops the install and stores nothing', async () => {
  const before = listUserSounds('instrument').length;
  const zip = await makeZip({
    'multisample.xml': KIT_XML,
    'Samples/kick.wav': AUDIO,
  }, 'Broken.multisample');

  const result = await addInstrumentPack(zip);
  assert.equal(result.ok, false);
  assert.match(result.error, /missing/i);
  assert.equal(listUserSounds('instrument').length, before);
});

await test('a bare .sfz file asks for the samples', async () => {
  const file = new Blob([PIANO_SFZ], { type: 'text/plain' });
  file.name = 'Piano.sfz';
  const result = await addInstrumentPack(file);
  assert.equal(result.ok, false);
  assert.match(result.error, /ZIP/);
});

await test('an archive with no description file reports every format', async () => {
  const zip = await makeZip({ 'notes.txt': 'hello' }, 'Nothing.zip');
  const result = await addInstrumentPack(zip);
  assert.equal(result.ok, false);
  assert.match(result.error, /manifest\.json/);
  assert.match(result.error, /multisample\.xml/);
  assert.match(result.error, /\.sfz/);
});

await test('removing a pack drops its files and its registry entry', async () => {
  const packs = listInstrumentPacks('percussion');
  assert.ok(packs.length, 'a kit is installed');
  const kit = packs[0];
  const attachmentIds = Object.values(kit.files);

  const result = await removeUserSound(kit.id);
  assert.equal(result.ok, true, result.error);
  assert.equal(listUserSounds('instrument').some((r) => r.id === kit.id), false);
  for (const id of attachmentIds) {
    assert.equal(await getFileBlob(id), null, 'the file is gone from the store');
  }
});

__resetPackRegistryForTests();

console.log(`\nsound install tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
