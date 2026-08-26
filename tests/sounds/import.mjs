/**
 * Zero-dependency Node tests for the sample pack importer.
 * Run: node tests/sounds/import.mjs
 */

import assert from 'node:assert/strict';

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

const {
  parseSfz,
  parseMultisample,
  buildManifest,
  buildManifestFromSfz,
  buildManifestFromMultisample,
  detectPackKind,
  thinSampleEntries,
  keyToMidi,
  MAX_MANIFEST_SAMPLES,
} = await import('../../js/audio/packImport.js');

const { parsePackManifest, registerPack, packsForPrograms, packsForDrumMap, __resetPackRegistryForTests } =
  await import('../../js/audio/samplePackRegistry.js');

const { detectPackFormat, manifestPackKind } = await import('../../js/audio/userSounds.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.stack || err.message}`);
  }
}

const PIANO_SFZ = `
// A small instrument
<control>
default_path=samples/
<global>
volume=-6
<group>
loop_mode=no_loop
<region>
sample=Piano C3.wav lokey=c3 hikey=e3 pitch_keycenter=c3 lovel=0 hivel=100
<region>
sample=piano_c3_f.wav key=48 lovel=101 hivel=127
<region>
sample=sub\\piano_g3.wav lokey=f3 hikey=b3 pitch_keycenter=g3
`;

const KIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<multisample name="Studio Kit">
  <generator>Bitwig Studio</generator>
  <layer name="Default">
    <sample file="kick.wav" gain="0.00">
      <key root="36" low="36" high="36" track="false"/>
      <velocity low="0" high="127"/>
    </sample>
    <sample file="snare.wav" gain="-6.02"><key root="38" low="38" high="38"/></sample>
    <sample file="hat.wav"><key root="42" low="42" high="42"/></sample>
    <sample file="ride.wav"><key root="51" low="51" high="51"/></sample>
  </layer>
</multisample>`;

test('a key reads as a number or as a note name', () => {
  assert.equal(keyToMidi('60'), 60);
  assert.equal(keyToMidi(60), 60);
  assert.equal(keyToMidi('c4'), 60);
  assert.equal(keyToMidi('C-1'), 0);
  assert.equal(keyToMidi('f#3'), 54);
  assert.equal(keyToMidi('db4'), 61);
  assert.equal(keyToMidi('nope'), null);
});

test('an SFZ region inherits the global, master, and group opcodes', () => {
  const { control, regions } = parseSfz(PIANO_SFZ);
  assert.equal(control.default_path, 'samples/');
  assert.equal(regions.length, 3);
  for (const region of regions) {
    assert.equal(region.volume, '-6');
    assert.equal(region.loop_mode, 'no_loop');
  }
  // A sample path may hold a space.
  assert.equal(regions[0].sample, 'Piano C3.wav');
});

test('the SFZ comment, the default path, and the backslash all resolve', () => {
  const built = buildManifestFromSfz({ text: PIANO_SFZ, name: 'My Piano.sfz' });
  assert.equal(built.ok, true);
  assert.deepEqual(built.files, [
    'samples/Piano C3.wav',
    'samples/piano_c3_f.wav',
    'samples/sub/piano_g3.wav',
  ]);
  assert.equal(built.kind, 'pitched');
  assert.equal(built.manifest.instrument, 'My Piano');
});

test('the SFZ key range sets the root note and the velocity layers', () => {
  const built = buildManifestFromSfz({ text: PIANO_SFZ, name: 'Piano' });
  const [soft, loud, g3] = built.manifest.samples;
  assert.equal(soft.rootMidi, 48);
  assert.equal(loud.rootMidi, 48);
  assert.equal(g3.rootMidi, 55);
  assert.ok(soft.velocityMax < 1, 'the soft layer stops below the top velocity');
  assert.equal(loud.velocityMax, 1);
  // volume=-6 dB is about half the amplitude.
  assert.ok(Math.abs(soft.gainTrim - 0.5) < 0.02, `gainTrim ${soft.gainTrim}`);
});

test('an SFZ file with no region reports a clear error', () => {
  const built = buildManifestFromSfz({ text: '<global>\nvolume=0\n', name: 'Empty' });
  assert.equal(built.ok, false);
  assert.match(built.error, /no region/i);
});

test('an SFZ sample path never leaves the pack folder', () => {
  const built = buildManifestFromSfz({
    text: '<region>\nsample=../../etc/passwd\n<region>\nsample=ok.wav key=60\n',
    name: 'Escape',
  });
  assert.equal(built.ok, true);
  assert.deepEqual(built.files, ['ok.wav']);
});

test('an SFZ #include reads the file next to it', () => {
  const includes = new Map([['parts/keys.sfz', '<region>\nsample=a.wav key=60\n']]);
  const built = buildManifestFromSfz({
    text: '#include "parts/keys.sfz"\n',
    includes,
    name: 'Included',
  });
  assert.equal(built.ok, true);
  assert.deepEqual(built.files, ['a.wav']);
});

test('a .multisample file reads its name, keys, and gain', () => {
  const parsed = parseMultisample(KIT_XML);
  assert.equal(parsed.name, 'Studio Kit');
  assert.equal(parsed.samples.length, 4);
  assert.equal(parsed.samples[0].rootMidi, 36);
  assert.ok(Math.abs(parsed.samples[1].gainTrim - 0.5) < 0.02);
});

test('a kit of single keys imports as percussion with a note map', () => {
  const built = buildManifestFromMultisample({ xml: KIT_XML });
  assert.equal(built.ok, true);
  assert.equal(built.kind, 'percussion');
  assert.equal(built.manifest.midiProgram, null);
  assert.deepEqual(built.manifest.drumNoteMap, {
    36: 'kick', 38: 'snare', 42: 'hihatClosed', 51: 'ride',
  });
  assert.equal(built.manifest.samples[0].articulation, 'kick');
});

test('the user can force the kind the importer reads', () => {
  const asPitched = buildManifestFromMultisample({ xml: KIT_XML, kind: 'pitched' });
  assert.equal(asPitched.kind, 'pitched');
  assert.equal(asPitched.manifest.drumNoteMap, undefined);
  assert.deepEqual(asPitched.manifest.midiProgram, []);

  const asKit = buildManifestFromSfz({ text: PIANO_SFZ, name: 'Piano', kind: 'percussion' });
  assert.equal(asKit.kind, 'percussion');
  assert.ok(asKit.manifest.drumNoteMap);
});

test('a wide key range reads as pitched, and single keys read as a kit', () => {
  const pitched = [
    { rootMidi: 40, lowMidi: 38, highMidi: 43 },
    { rootMidi: 46, lowMidi: 44, highMidi: 49 },
    { rootMidi: 52, lowMidi: 50, highMidi: 55 },
  ];
  assert.equal(detectPackKind(pitched), 'pitched');

  const kit = [
    { rootMidi: 36, lowMidi: 36, highMidi: 36 },
    { rootMidi: 38, lowMidi: 38, highMidi: 38 },
    { rootMidi: 42, lowMidi: 42, highMidi: 42 },
    { rootMidi: 46, lowMidi: 46, highMidi: 46 },
  ];
  assert.equal(detectPackKind(kit), 'percussion');

  // One sample for each key over a full range is a pitched instrument.
  const chromatic = [];
  for (let midi = 24; midi <= 96; midi += 1) {
    chromatic.push({ rootMidi: midi, lowMidi: midi, highMidi: midi });
  }
  assert.equal(detectPackKind(chromatic), 'pitched');
});

test('a round robin past the first one never reaches the manifest', () => {
  const entries = [
    { file: 'a1.wav', rootMidi: 60, velocityMin: 0, velocityMax: 1, seq: 1 },
    { file: 'a2.wav', rootMidi: 60, velocityMin: 0, velocityMax: 1, seq: 2 },
    { file: 'a3.wav', rootMidi: 60, velocityMin: 0, velocityMax: 1, seq: 3 },
  ];
  const kept = thinSampleEntries(entries);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].file, 'a1.wav');
});

test('a big library thins down to the file limit', () => {
  const entries = [];
  for (let midi = 21; midi <= 108; midi += 1) {
    for (const [lo, hi] of [[0, 0.5], [0.51, 1]]) {
      entries.push({
        file: `n${midi}_v${lo}.wav`, rootMidi: midi, velocityMin: lo, velocityMax: hi, seq: 1,
      });
    }
  }
  const kept = thinSampleEntries(entries);
  assert.ok(kept.length <= MAX_MANIFEST_SAMPLES, `kept ${kept.length}`);
  assert.ok(kept.length > 0);
  // The spread still covers the whole keyboard.
  assert.ok(kept[0].rootMidi <= 24);
  assert.ok(kept[kept.length - 1].rootMidi >= 100);
});

test('an imported manifest passes the pack manifest rules', () => {
  for (const built of [
    buildManifestFromSfz({ text: PIANO_SFZ, name: 'Piano' }),
    buildManifestFromMultisample({ xml: KIT_XML }),
  ]) {
    const parsed = parsePackManifest(built.manifest);
    assert.equal(parsed.ok, true, parsed.error);
  }
});

test('an imported pack plays only when the user names it', () => {
  __resetPackRegistryForTests();
  const piano = buildManifestFromSfz({ text: PIANO_SFZ, name: 'Piano' });
  const kit = buildManifestFromMultisample({ xml: KIT_XML });
  assert.equal(registerPack(piano.manifest).ok, true);
  assert.equal(registerPack(kit.manifest).ok, true);
  // No track program and no drum note pulls an imported pack in by itself.
  assert.deepEqual(packsForPrograms([0, 24, 27, 30]), []);
  assert.deepEqual(packsForDrumMap([36, 38, 42]), []);
  __resetPackRegistryForTests();
});

test('an empty entry list reports a clear error', () => {
  const built = buildManifest([], { name: 'Nothing' });
  assert.equal(built.ok, false);
  assert.match(built.error, /no samples/i);
});

test('the archive reader names the format it found', () => {
  assert.equal(detectPackFormat([{ name: 'pack/manifest.json' }]).format, 'manifest');
  assert.equal(detectPackFormat([{ name: 'Kit/multisample.xml' }]).format, 'multisample');
  const sfz = detectPackFormat([
    { name: 'Piano/parts/keys.sfz' },
    { name: 'Piano/Piano.sfz' },
  ]);
  assert.equal(sfz.format, 'sfz');
  // The instrument sits above its parts.
  assert.equal(sfz.entry.name, 'Piano/Piano.sfz');
  assert.equal(sfz.all.length, 2);
  assert.equal(detectPackFormat([{ name: 'readme.txt' }]), null);
});

test('the pack kind of a manifest follows the drum note map', () => {
  assert.equal(manifestPackKind({ drumNoteMap: { 36: 'kick' } }), 'percussion');
  assert.equal(manifestPackKind({ midiProgram: [24] }), 'pitched');
  assert.equal(manifestPackKind(null), 'pitched');
});

console.log(`\nsound import tests: ${passed} passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
