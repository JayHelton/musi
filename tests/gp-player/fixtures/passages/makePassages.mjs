// Build 10 fixed passages for SC-015 and SC-016 human tests.
// Run: node tests/gp-player/fixtures/passages/makePassages.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeGpZip } from '../makeFixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const GUITAR_TUNING = [64, 59, 55, 50, 45, 40];
const BASS_TUNING = [43, 38, 33, 28];

function gpifShell({ masterBars, bars, voices, beats, notes, rhythms, tracks, automations = '' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterTrack>
    <Automations>${automations}</Automations>
  </MasterTrack>
  <MasterBars>
${masterBars}
  </MasterBars>
  <Bars>
${bars}
  </Bars>
  <Voices>
${voices}
  </Voices>
  <Beats>
${beats}
  </Beats>
  <Notes>
${notes}
  </Notes>
  <Rhythms>
${rhythms}
  </Rhythms>
  <Tracks>
${tracks}
  </Tracks>
</GPIF>`;
}

function rhythmBlock() {
  return [
    '    <Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>',
    '    <Rhythm id="1"><NoteValue>Eighth</NoteValue></Rhythm>',
    '    <Rhythm id="2"><NoteValue>Half</NoteValue></Rhythm>',
    '    <Rhythm id="3"><NoteValue>Sixteenth</NoteValue></Rhythm>',
    '    <Rhythm id="4"><NoteValue>Quarter</NoteValue><AugmentationDot count="1"/></Rhythm>',
    '    <Rhythm id="5"><NoteValue>Quarter</NoteValue><PrimaryTuplet num="3" den="2"/></Rhythm>',
  ].join('\n');
}

function gpifNote(id, fret, stringIndex, midi, extra = '') {
  return `    <Note id="${id}"><Properties>
      <Property name="Fret"><Fret>${fret}</Fret></Property>
      <Property name="String"><String>${stringIndex}</String></Property>
      <Property name="Midi"><Number>${midi}</Number></Property>
      ${extra}
    </Properties></Note>`;
}

function gpifTrack(id, name, tuning, program) {
  const pitches = tuning.slice().reverse().join(' ');
  return `    <Track id="${id}">
      <Name>${name}</Name>
      <Channel>
        <Instrument>${program}</Instrument>
      </Channel>
      <Staves>
        <Staff>
          <Properties>
            <Property name="Tuning">
              <Pitches>${pitches}</Pitches>
            </Property>
          </Properties>
        </Staff>
      </Staves>
    </Track>`;
}

function buildPassage({ title, barCount = 2, guitarBeats, bassBeats }) {
  const masterBars = [];
  const bars = [];
  const voices = [];
  const beats = [];
  const notes = [];
  let beatId = 0;
  let noteId = 0;
  let voiceId = 0;

  for (let bar = 0; bar < barCount; bar += 1) {
    masterBars.push(`    <MasterBar><Bars>${bar}</Bars><Time>4/4</Time><Section><Text>${title} bar ${bar + 1}</Text></Section></MasterBar>`);
    const gVoice = voiceId++;
    const bVoice = voiceId++;
    const gBeatList = [];
    const bBeatList = [];
    const gBuilder = guitarBeats[bar] || guitarBeats[0];
    const bBuilder = bassBeats[bar] || bassBeats[0];
    for (const item of gBuilder) {
      gBeatList.push(beatId);
      const noteExtra = item.props || '';
      beats.push(`    <Beat id="${beatId}"><Rhythm ref="${item.rhythm || 0}"/><Notes>${noteId}</Notes>${item.beatExtra || ''}</Beat>`);
      notes.push(gpifNote(noteId, item.fret, item.string, item.midi, noteExtra));
      beatId += 1;
      noteId += 1;
    }
    for (const item of bBuilder) {
      bBeatList.push(beatId);
      beats.push(`    <Beat id="${beatId}"><Rhythm ref="${item.rhythm || 0}"/><Notes>${noteId}</Notes>${item.beatExtra || ''}</Beat>`);
      notes.push(gpifNote(noteId, item.fret, item.string, item.midi, item.props || ''));
      beatId += 1;
      noteId += 1;
    }
    bars.push(`    <Bar id="${bar}"><Voices>${gVoice} ${bVoice}</Voices></Bar>`);
    voices.push(`    <Voice id="${gVoice}"><Beats>${gBeatList.join(' ')}</Beats></Voice>`);
    voices.push(`    <Voice id="${bVoice}"><Beats>${bBeatList.join(' ')}</Beats></Voice>`);
  }

  return gpifShell({
    masterBars: masterBars.join('\n'),
    bars: bars.join('\n'),
    voices: voices.join('\n'),
    beats: beats.join('\n'),
    notes: notes.join('\n'),
    rhythms: rhythmBlock(),
    tracks: [
      gpifTrack(0, 'Guitar', GUITAR_TUNING, 27),
      gpifTrack(1, 'Bass', BASS_TUNING, 33),
    ].join('\n'),
    automations: `
      <Automation>
        <Type>Tempo</Type>
        <Bar>0</Bar>
        <Position>0</Position>
        <Value>100 2</Value>
      </Automation>`,
  });
}

const PASSAGES = [
  {
    file: 'passage-01-quarters.gp',
    title: 'Quarters',
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 0 },
      { fret: 2, string: 0, midi: 42, rhythm: 0 },
      { fret: 3, string: 0, midi: 43, rhythm: 0 },
      { fret: 5, string: 0, midi: 45, rhythm: 0 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
      { fret: 2, string: 0, midi: 30, rhythm: 0 },
      { fret: 3, string: 0, midi: 31, rhythm: 0 },
      { fret: 5, string: 0, midi: 33, rhythm: 0 },
    ]],
  },
  {
    file: 'passage-02-eighths.gp',
    title: 'Eighths',
    guitarBeats: [[
      { fret: 3, string: 1, midi: 48, rhythm: 1 },
      { fret: 5, string: 1, midi: 50, rhythm: 1 },
      { fret: 3, string: 1, midi: 48, rhythm: 1 },
      { fret: 5, string: 1, midi: 50, rhythm: 1 },
      { fret: 3, string: 1, midi: 48, rhythm: 1 },
      { fret: 5, string: 1, midi: 50, rhythm: 1 },
      { fret: 3, string: 1, midi: 48, rhythm: 1 },
      { fret: 5, string: 1, midi: 50, rhythm: 1 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 1 },
      { fret: 0, string: 0, midi: 28, rhythm: 1 },
      { fret: 2, string: 0, midi: 30, rhythm: 1 },
      { fret: 2, string: 0, midi: 30, rhythm: 1 },
      { fret: 3, string: 0, midi: 31, rhythm: 1 },
      { fret: 3, string: 0, midi: 31, rhythm: 1 },
      { fret: 5, string: 0, midi: 33, rhythm: 1 },
      { fret: 5, string: 0, midi: 33, rhythm: 1 },
    ]],
  },
  {
    file: 'passage-03-syncopation.gp',
    title: 'Syncopation',
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 0 },
      { fret: 3, string: 0, midi: 43, rhythm: 1 },
      { fret: 0, string: 0, midi: 40, rhythm: 1 },
      { fret: 5, string: 0, midi: 45, rhythm: 0 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 1 },
      { fret: 0, string: 0, midi: 28, rhythm: 1 },
      { fret: 3, string: 0, midi: 31, rhythm: 0 },
      { fret: 3, string: 0, midi: 31, rhythm: 1 },
    ]],
  },
  {
    file: 'passage-04-palm-mute.gp',
    title: 'Palm mute',
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
      { fret: 0, string: 0, midi: 40, rhythm: 1, beatExtra: '<Properties><Property name="PalmMuted"><Enable/></Property></Properties>' },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
    ]],
  },
  {
    file: 'passage-05-bend.gp',
    title: 'Bend',
    guitarBeats: [[
      { fret: 7, string: 0, midi: 47, rhythm: 2, props: '<Property name="Bended"><Enable/></Property>' },
      { fret: 5, string: 0, midi: 45, rhythm: 0 },
      { fret: 3, string: 0, midi: 43, rhythm: 0 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 2 },
      { fret: 2, string: 0, midi: 30, rhythm: 0 },
      { fret: 3, string: 0, midi: 31, rhythm: 0 },
    ]],
  },
  {
    file: 'passage-06-dynamics.gp',
    title: 'Dynamics',
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 0, props: '<Property name="Dynamic"><Number>1</Number></Property>' },
      { fret: 3, string: 0, midi: 43, rhythm: 0, props: '<Property name="Dynamic"><Number>5</Number></Property>' },
      { fret: 5, string: 0, midi: 45, rhythm: 0, props: '<Property name="Dynamic"><Number>9</Number></Property>' },
      { fret: 7, string: 0, midi: 47, rhythm: 0, props: '<Property name="Dynamic"><Number>3</Number></Property>' },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 0, props: '<Property name="Dynamic"><Number>2</Number></Property>' },
      { fret: 3, string: 0, midi: 31, rhythm: 0, props: '<Property name="Dynamic"><Number>8</Number></Property>' },
      { fret: 5, string: 0, midi: 33, rhythm: 0, props: '<Property name="Dynamic"><Number>6</Number></Property>' },
      { fret: 7, string: 0, midi: 35, rhythm: 0, props: '<Property name="Dynamic"><Number>4</Number></Property>' },
    ]],
  },
  {
    file: 'passage-07-two-voices.gp',
    title: 'Two voices',
    barCount: 1,
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 0 },
      { fret: 2, string: 0, midi: 42, rhythm: 0 },
      { fret: 3, string: 1, midi: 48, rhythm: 0 },
      { fret: 5, string: 1, midi: 50, rhythm: 0 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 2 },
      { fret: 5, string: 0, midi: 33, rhythm: 0 },
    ]],
  },
  {
    file: 'passage-08-triplet.gp',
    title: 'Triplet',
    guitarBeats: [[
      { fret: 3, string: 0, midi: 43, rhythm: 5 },
      { fret: 5, string: 0, midi: 45, rhythm: 5 },
      { fret: 7, string: 0, midi: 47, rhythm: 5 },
      { fret: 5, string: 0, midi: 45, rhythm: 0 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 5 },
      { fret: 2, string: 0, midi: 30, rhythm: 5 },
      { fret: 3, string: 0, midi: 31, rhythm: 5 },
      { fret: 0, string: 0, midi: 28, rhythm: 0 },
    ]],
  },
  {
    file: 'passage-09-chord-stabs.gp',
    title: 'Chord stabs',
    guitarBeats: [[
      { fret: 0, string: 0, midi: 40, rhythm: 1 },
      { fret: 0, string: 0, midi: 40, rhythm: 1 },
      { fret: 2, string: 1, midi: 47, rhythm: 0 },
      { fret: 2, string: 1, midi: 47, rhythm: 1 },
    ]],
    bassBeats: [[
      { fret: 0, string: 0, midi: 28, rhythm: 1 },
      { fret: 2, string: 0, midi: 30, rhythm: 1 },
      { fret: 3, string: 0, midi: 31, rhythm: 1 },
      { fret: 5, string: 0, midi: 33, rhythm: 1 },
    ]],
  },
  {
    file: 'passage-10-mixed-techniques.gp',
    title: 'Mixed techniques',
    barCount: 2,
    guitarBeats: [
      [
        { fret: 0, string: 0, midi: 40, rhythm: 0 },
        { fret: 2, string: 0, midi: 42, rhythm: 1 },
        { fret: 3, string: 0, midi: 43, rhythm: 1 },
        { fret: 5, string: 0, midi: 45, rhythm: 0 },
      ],
      [
        { fret: 7, string: 0, midi: 47, rhythm: 2, props: '<Property name="Bended"><Enable/></Property>' },
        { fret: 5, string: 0, midi: 45, rhythm: 0 },
      ],
    ],
    bassBeats: [
      [
        { fret: 0, string: 0, midi: 28, rhythm: 0 },
        { fret: 0, string: 0, midi: 28, rhythm: 1 },
        { fret: 2, string: 0, midi: 30, rhythm: 1 },
        { fret: 3, string: 0, midi: 31, rhythm: 0 },
      ],
      [
        { fret: 5, string: 0, midi: 33, rhythm: 2 },
        { fret: 3, string: 0, midi: 31, rhythm: 0 },
      ],
    ],
  },
];

export function writePassages() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const spec of PASSAGES) {
    const xml = buildPassage(spec);
    writeGpZip(xml, join(OUT_DIR, spec.file));
  }
  writeFileSync(join(OUT_DIR, 'README.txt'), [
    'Generated passages for SC-015 and SC-016.',
    'Run: node tests/gp-player/fixtures/passages/makePassages.mjs',
    'Do not commit the .gp files.',
  ].join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writePassages();
  console.log('gp-player passages: ok');
}
