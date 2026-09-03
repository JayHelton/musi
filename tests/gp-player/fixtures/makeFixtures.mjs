// Node-only fixture builder for Guitar Pro player tests.
// Run: node tests/gp-player/fixtures/makeFixtures.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../../js/sync/zip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

// ---- ZIP (.gp container) ----------------------------------------------------

function u16le(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32le(n) {
  const b = new Uint8Array(4);
  const v = n >>> 0;
  b[0] = v & 0xff;
  b[1] = (v >>> 8) & 0xff;
  b[2] = (v >>> 16) & 0xff;
  b[3] = (v >>> 24) & 0xff;
  return b;
}

function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Write a `.gp` ZIP archive with one entry at `Content/score.gpif`.
 * @param {string} gpifXml
 * @param {string} outPath
 */
export function writeGpZip(gpifXml, outPath) {
  const entryName = 'Content/score.gpif';
  const raw = new TextEncoder().encode(gpifXml);
  const compressed = deflateRawSync(raw);
  const nameBytes = new TextEncoder().encode(entryName);
  const checksum = crc32(raw);
  const localHeader = concat(
    u32le(0x04034b50),
    u16le(20),
    u16le(0x0800),
    u16le(8),
    u16le(0),
    u16le(0),
    u32le(checksum),
    u32le(compressed.length),
    u32le(raw.length),
    u16le(nameBytes.length),
    u16le(0),
    nameBytes,
  );
  const localOffset = 0;
  const central = concat(
    u32le(0x02014b50),
    u16le(20),
    u16le(20),
    u16le(0x0800),
    u16le(8),
    u16le(0),
    u16le(0),
    u32le(checksum),
    u32le(compressed.length),
    u32le(raw.length),
    u16le(nameBytes.length),
    u16le(0),
    u16le(0),
    u16le(0),
    u16le(0),
    u32le(0),
    u32le(localOffset),
    nameBytes,
  );
  const centralOffset = localHeader.length + compressed.length;
  const centralSize = central.length;
  const eocd = concat(
    u32le(0x06054b50),
    u16le(0),
    u16le(0),
    u16le(1),
    u16le(1),
    u32le(centralSize),
    u32le(centralOffset),
    u16le(0),
  );
  writeFileSync(outPath, concat(localHeader, compressed, central, eocd));
}

// ---- GP5 binary writer -------------------------------------------------------

const STD_TUNING_6 = [64, 59, 55, 50, 45, 40];
const STD_TUNING_7 = [64, 59, 55, 50, 45, 40, 35];
const STD_TUNING_8 = [64, 59, 55, 50, 45, 40, 35, 30];
const STD_TUNING_4 = [43, 38, 33, 28];

class Gp5Writer {
  constructor() {
    /** @type {number[]} */
    this.buf = [];
    this.view = new DataView(new ArrayBuffer(8));
  }

  u8(v) { this.buf.push(v & 0xff); }
  i8(v) { this.u8(v < 0 ? v + 256 : v); }
  bool(v) { this.u8(v ? 1 : 0); }
  i16(v) {
    this.view.setInt16(0, v, true);
    this.buf.push(this.view.getUint8(0), this.view.getUint8(1));
  }
  i32(v) {
    this.view.setInt32(0, v, true);
    for (let i = 0; i < 4; i += 1) this.buf.push(this.view.getUint8(i));
  }
  f64(v) {
    this.view.setFloat64(0, v, false);
    for (let i = 0; i < 8; i += 1) this.buf.push(this.view.getUint8(i));
  }
  bytes(arr) { for (const b of arr) this.u8(b); }
  skip(n) { for (let i = 0; i < n; i += 1) this.u8(0); }

  byteSizeString(str, fixed) {
    const raw = new TextEncoder().encode(str);
    this.u8(raw.length);
    for (let i = 0; i < fixed; i += 1) this.u8(i < raw.length ? raw[i] : 0);
  }

  intSizeString(str = '') {
    const raw = new TextEncoder().encode(str);
    this.i32(raw.length);
    for (const b of raw) this.u8(b);
  }

  intByteSizeString(str = '') {
    const raw = new TextEncoder().encode(str);
    this.i32(raw.length + 1);
    this.u8(raw.length);
    for (const b of raw) this.u8(b);
  }

  toUint8() {
    return new Uint8Array(this.buf);
  }
}

function writeColor(w) {
  w.skip(4);
}

function writeMarker(w, text) {
  w.intByteSizeString(text);
  writeColor(w);
}

// Write the 64 GP5 MIDI channel slots. A real file sets a program, a full
// volume of 127, and a centre balance of 64. The parse layer maps those raw
// values onto trackInfo.volume 0 to 1 and trackInfo.pan -1 to 1.
function writeMidiChannels(w, programs = {}) {
  for (let i = 0; i < 64; i += 1) {
    w.i32(i === 9 ? 0 : (programs[i] != null ? programs[i] : 27));
    w.u8(127);
    w.u8(64);
    w.skip(4);
    w.skip(2);
  }
}

function writeDirections(w) {
  for (let i = 0; i < 19; i += 1) w.i16(-1);
}

function writeRSEInstrument(w) {
  w.i32(-1);
  w.i32(0);
  w.i32(0);
  w.i32(-1);
}

function writeRSEInstrumentEffect(w) {
  w.intByteSizeString('');
  w.intByteSizeString('');
}

function writeMeasureHeader(w, header, isFirst) {
  if (!isFirst) w.u8(0);
  let flags = 0;
  const timeSig = header.timeSig || [4, 4];
  if (header.timeSig !== false) flags |= 0x03;
  if (header.repeatOpen) flags |= 0x04;
  if (header.repeatClose != null) flags |= 0x08;
  if (header.marker) flags |= 0x20;
  if (header.keySig !== false) flags |= 0x40;
  if (header.alternateEndings != null) flags |= 0x10;
  w.u8(flags);
  if (flags & 0x01) w.i8(timeSig[0]);
  if (flags & 0x02) w.i8(timeSig[1]);
  if (flags & 0x08) w.i8(header.repeatClose);
  if (flags & 0x20) writeMarker(w, header.marker);
  if (flags & 0x40) { w.i8(0); w.i8(0); }
  if (flags & 0x10) w.u8(header.alternateEndings);
  if (flags & 0x03) w.skip(4);
  if ((flags & 0x10) === 0) w.u8(0);
  w.u8(header.tripletFeel || 0);
}

function writeTrackHeader(w, track, trackNumber) {
  if (trackNumber === 1) w.u8(0);
  let flags1 = 0;
  if (track.isPercussion) flags1 |= 0x01;
  w.u8(flags1);
  w.byteSizeString(track.name || 'Guitar', 40);
  const tuning = track.tuning || STD_TUNING_6;
  w.i32(tuning.length);
  for (let i = 0; i < 7; i += 1) w.i32(i < tuning.length ? tuning[i] : 0);
  w.i32(0);
  const channel = track.channel != null ? track.channel : (track.isPercussion ? 10 : 1);
  w.i32(channel);
  w.i32(track.isPercussion ? 10 : 1);
  w.i32(24);
  w.i32(0);
  writeColor(w);
  w.i16(0);
  w.u8(0);
  w.u8(0);
  w.u8(0);
  w.i32(0);
  w.i32(0);
  w.i32(-1);
  w.skip(12);
  writeRSEInstrument(w);
  w.skip(4);
  writeRSEInstrumentEffect(w);
}

function writeBend(w) {
  w.i8(1);
  w.i32(100);
  w.i32(1);
  w.i32(0);
  w.i32(0);
  w.bool(false);
}

function writeGrace(w, fret = 0) {
  w.i8(fret);
  w.i8(100);
  w.i8(0);
  w.i8(1);
  w.i8(0);
}

function writeHarmonic(w, type = 1) {
  w.i8(type);
  if (type === 2) { w.u8(0); w.i8(0); w.i8(0); }
  else if (type === 3) w.u8(0);
}

function writeTrill(w) {
  w.i8(0);
  w.i8(16);
}

function writeNoteEffects(w, effects = {}) {
  let flags1 = 0;
  let flags2 = 0;
  if (effects.bend) flags1 |= 0x01;
  if (effects.hopo) flags1 |= 0x02;
  if (effects.grace) flags1 |= 0x10;
  if (effects.palmMute) flags2 |= 0x02;
  if (effects.vibrato) flags2 |= 0x40;
  if (effects.tremolo) flags2 |= 0x04;
  if (effects.slide) flags2 |= 0x08;
  if (effects.harmonic) flags2 |= 0x10;
  if (effects.trill) flags2 |= 0x20;
  w.i8(flags1);
  w.i8(flags2);
  if (flags1 & 0x01) writeBend(w);
  if (flags1 & 0x10) writeGrace(w, effects.graceFret || 0);
  if (flags2 & 0x04) w.i8(8);
  if (flags2 & 0x08) w.u8(1);
  if (flags2 & 0x10) writeHarmonic(w, effects.harmonicType || 1);
  if (flags2 & 0x20) writeTrill(w);
}

function writeBeatEffects(w, effects = {}) {
  let flags1 = 0;
  let flags2 = 0;
  if (effects.vibrato) flags1 |= 0x02;
  if (effects.tap) { flags1 |= 0x20; }
  if (effects.slap) { flags1 |= 0x20; }
  if (effects.pop) { flags1 |= 0x20; }
  w.i8(flags1);
  w.i8(flags2);
  if (flags1 & 0x20) {
    const slap = effects.tap ? 1 : effects.slap ? 2 : effects.pop ? 3 : 0;
    w.i8(slap);
  }
}

function writeMixTableChange(w, { tempo } = {}) {
  w.i8(-1);
  writeRSEInstrument(w);
  w.i8(-1);
  w.i8(-1);
  w.i8(-1);
  w.i8(-1);
  w.i8(-1);
  w.i8(-1);
  w.intByteSizeString('');
  w.i32(tempo != null ? tempo : -1);
  if (tempo != null) { w.i8(0); w.bool(false); }
  w.i8(0);
  w.i8(0);
  writeRSEInstrumentEffect(w);
}

function writeNote(w, track, note) {
  let flags = 0x20;
  // Flag 0x20 tells the reader that a note type byte and a fret byte follow.
  // A tie note and a dead note keep both bytes, then the trailing flags byte.
  if (note.tie || note.dead) {
    w.u8(flags);
    w.u8(note.tie ? 2 : 3);
    w.i8(note.fret != null ? note.fret : 0);
    w.u8(0);
    return;
  }
  if (note.dynamics != null) flags |= 0x10;
  if (note.effects) flags |= 0x08;
  if (note.hopo) flags |= 0x08;
  w.u8(flags);
  w.u8(1);
  if (flags & 0x10) w.i8(note.dynamics != null ? note.dynamics : 5);
  w.i8(note.fret != null ? note.fret : 0);
  w.u8(0);
  if (flags & 0x08) {
    writeNoteEffects(w, {
      ...(note.effects || {}),
      hopo: note.hopo,
    });
  }
}

function writeBeat(w, track, beat) {
  let flags = 0;
  if (beat.dotted) flags |= 0x01;
  if (beat.text) flags |= 0x04;
  if (beat.tuplet) flags |= 0x20;
  if (beat.empty || beat.rest) flags |= 0x40;
  if (beat.beatEffects) flags |= 0x08;
  if (beat.mixTable) flags |= 0x10;
  w.u8(flags);
  if (flags & 0x40) w.u8(beat.rest ? 2 : 0);
  w.i8(beat.duration != null ? beat.duration : 0);
  if (flags & 0x20) w.i32(beat.tuplet);
  // The free text a writer puts over the beat, for example a vowel to sing.
  if (flags & 0x04) w.intByteSizeString(beat.text);
  if (flags & 0x08) writeBeatEffects(w, beat.beatEffects);
  if (flags & 0x10) writeMixTableChange(w, beat.mixTable || {});
  const notes = beat.notes || [];
  let stringFlags = 0;
  for (const n of notes) {
    const num = n.string != null ? n.string : 6;
    stringFlags |= 1 << (7 - num);
  }
  w.u8(stringFlags);
  for (let idx = 0; idx < track.stringCount; idx += 1) {
    const number = idx + 1;
    if (!(stringFlags & (1 << (7 - number)))) continue;
    const note = notes.find((n) => (n.string != null ? n.string : 6) === number) || notes[0];
    writeNote(w, track, note);
  }
  w.i16(0);
}

function writeMeasure(w, track, measure) {
  const voices = measure.voices || [[{ duration: 0, notes: [{ string: 6, fret: 0 }] }], []];
  for (let v = 0; v < 2; v += 1) {
    const beats = voices[v] || [];
    w.i32(beats.length);
    for (const beat of beats) writeBeat(w, track, beat);
  }
  w.u8(0);
}

function buildGp5Bytes(score) {
  const w = new Gp5Writer();
  const version = score.version || 'FICHIER GUITAR PRO v5.10';
  w.byteSizeString(version, 30);

  for (let i = 0; i < 9; i += 1) w.intByteSizeString('');
  w.i32(0);

  w.i32(0);
  for (let i = 0; i < 5; i += 1) { w.i32(0); w.intSizeString(''); }

  w.i32(-1);
  w.i32(-1);
  w.skip(11);

  w.skip(8);
  w.skip(16);
  w.i32(100);
  w.i16(0);
  for (let i = 0; i < 10; i += 1) w.intByteSizeString('');

  w.intByteSizeString(score.tempoName || '');
  w.i32(score.tempo != null ? score.tempo : 120);
  w.bool(false);
  w.i8(0);
  w.i32(0);

  const measureHeaders = score.measureHeaders || [{ timeSig: [4, 4] }];
  let nextChannel = 1;
  const tracks = score.tracks.map((t) => {
    let channel = t.channel;
    if (channel == null) {
      if (t.isPercussion) {
        channel = 10;
      } else {
        if (nextChannel === 10) nextChannel = 11;
        channel = nextChannel;
        nextChannel += 1;
      }
    }
    return {
      ...t,
      channel,
      stringCount: (t.tuning || STD_TUNING_6).length,
      tuning: t.tuning || STD_TUNING_6,
    };
  });
  const programs = {};
  for (const t of tracks) {
    if (t.isPercussion) continue;
    programs[t.channel - 1] = t.program != null ? t.program : 27;
  }

  writeMidiChannels(w, programs);
  writeDirections(w);
  w.i32(0);

  w.i32(measureHeaders.length);
  w.i32(tracks.length);

  for (let i = 0; i < measureHeaders.length; i += 1) {
    writeMeasureHeader(w, measureHeaders[i], i === 0);
  }
  for (let i = 0; i < tracks.length; i += 1) {
    writeTrackHeader(w, tracks[i], i + 1);
  }
  w.u8(0);

  for (let m = 0; m < measureHeaders.length; m += 1) {
    for (let t = 0; t < tracks.length; t += 1) {
      const measure = tracks[t].measures?.[m] || { voices: [[], []] };
      writeMeasure(w, tracks[t], measure);
    }
  }

  return w.toUint8();
}

function writeGp5(score, outPath) {
  writeFileSync(outPath, buildGp5Bytes(score));
}

// ---- GPIF XML builder -------------------------------------------------------

const DRUM_ARTICULATION_SET = `
      <InstrumentSet>
        <Type>drumKit</Type>
        <Elements>
          <Element>
            <Type>kick</Type>
            <Articulations>
              <Articulation>
                <InputMidiNumbers>35</InputMidiNumbers>
                <OutputMidiNumber>36</OutputMidiNumber>
              </Articulation>
            </Articulations>
          </Element>
          <Element>
            <Type>snare</Type>
            <Articulations>
              <Articulation>
                <InputMidiNumbers>38</InputMidiNumbers>
                <OutputMidiNumber>38</OutputMidiNumber>
              </Articulation>
            </Articulations>
          </Element>
          <Element>
            <Type>hihat</Type>
            <Articulations>
              <Articulation>
                <InputMidiNumbers>42</InputMidiNumbers>
                <OutputMidiNumber>42</OutputMidiNumber>
              </Articulation>
            </Articulations>
          </Element>
        </Elements>
      </InstrumentSet>`;

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

function gpifRhythm(id, noteValue, dots = 0, tuplet = null) {
  const dotXml = dots ? `<AugmentationDot count="${dots}"/>` : '';
  const tupletXml = tuplet
    ? `<PrimaryTuplet num="${tuplet.num}" den="${tuplet.den}"/>`
    : '';
  return `    <Rhythm id="${id}"><NoteValue>${noteValue}</NoteValue>${dotXml}${tupletXml}</Rhythm>`;
}

function gpifNote(id, { fret, stringIndex, props = '', articulation = null, extra = '' }) {
  if (articulation != null) {
    return `    <Note id="${id}"><InstrumentArticulation>${articulation}</InstrumentArticulation>${extra}</Note>`;
  }
  return `    <Note id="${id}"><Properties>
      <Property name="Fret"><Fret>${fret}</Fret></Property>
      <Property name="String"><String>${stringIndex}</String></Property>
      ${props}
    </Properties>${extra}</Note>`;
}

function gpifGuitarTrack(id, name, tuning = STD_TUNING_6.slice().reverse()) {
  const pitches = tuning.slice().reverse().join(' ');
  return `    <Track id="${id}">
      <Name>${name}</Name>
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

function gpifDrumTrack(id, name) {
  return `    <Track id="${id}">
      <Name>${name}</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>`;
}

function buildSimpleGpif({
  barCount = 1,
  timeSig = '4/4',
  trackName = 'Guitar',
  tuning = STD_TUNING_6,
  noteFret = 0,
  noteString = 0,
  tempoAutomations = '',
  masterBarExtras = () => '',
  beatText = () => '',
  barVoiceBuilder = null,
}) {
  const rhythms = [
    gpifRhythm(0, 'Quarter'),
    gpifRhythm(1, 'Half'),
    gpifRhythm(2, 'Eighth'),
    gpifRhythm(3, 'Whole'),
    gpifRhythm(4, '16th'),
  ].join('\n');

  const masterBars = [];
  const bars = [];
  const voices = [];
  const beats = [];
  const notes = [];
  let beatId = 0;
  let noteId = 0;
  let voiceId = 0;

  for (let b = 0; b < barCount; b += 1) {
    const extras = masterBarExtras(b) || '';
    masterBars.push(`    <MasterBar><Bars>${b}</Bars><Time>${timeSig}</Time>${extras}</MasterBar>`);
    if (barVoiceBuilder) {
      const built = barVoiceBuilder(b, { beatId, noteId, voiceId });
      bars.push(built.bar);
      voices.push(...built.voices);
      beats.push(...built.beats);
      notes.push(...built.notes);
      beatId = built.nextBeatId;
      noteId = built.nextNoteId;
      voiceId = built.nextVoiceId;
      continue;
    }
    const vId = voiceId;
    voiceId += 1;
    bars.push(`    <Bar id="${b}"><Voices>${vId}</Voices></Bar>`);
    voices.push(`    <Voice id="${vId}"><Beats>${beatId}</Beats></Voice>`);
    const free = beatText(b);
    const freeText = free ? `<FreeText>${free}</FreeText>` : '';
    beats.push(`    <Beat id="${beatId}"><Rhythm ref="0"/>${freeText}<Notes>${noteId}</Notes></Beat>`);
    notes.push(gpifNote(noteId, { fret: noteFret, stringIndex: noteString }));
    beatId += 1;
    noteId += 1;
  }

  const tracks = gpifGuitarTrack(0, trackName, tuning);
  return gpifShell({
    masterBars: masterBars.join('\n'),
    bars: bars.join('\n'),
    voices: voices.join('\n'),
    beats: beats.join('\n'),
    notes: notes.join('\n'),
    rhythms,
    tracks,
    automations: tempoAutomations,
  });
}

// ---- Fixture definitions -----------------------------------------------------

function quarterBeat(stringNum, fret, extras = {}) {
  return {
    duration: 0,
    notes: [{ string: stringNum, fret, ...extras }],
  };
}

function restBeat(duration = 0) {
  return { duration, empty: true, rest: true, notes: [] };
}

function writeAllFixtures() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Feature: tempo changes from 90 to 140 at bar 9.
  writeGp5({
    tempo: 90,
    measureHeaders: Array.from({ length: 16 }, (_, i) => ({
      timeSig: [4, 4],
      ...(i === 8 ? { mixAtBeat: 140 } : {}),
    })),
    tracks: [{
      name: 'Guitar',
      measures: Array.from({ length: 16 }, (_, i) => ({
        voices: [[
          i === 8
            ? { duration: 0, mixTable: { tempo: 140 }, notes: [{ string: 6, fret: 0 }] }
            : quarterBeat(6, 0),
        ], []],
      })),
    }],
  }, join(OUT_DIR, 'tempo-change.gp5'));

  // Feature: 8 bar section with a repeat mark.
  writeGp5({
    measureHeaders: [
      { timeSig: [4, 4], repeatOpen: true },
      ...Array.from({ length: 6 }, () => ({ timeSig: [4, 4] })),
      { timeSig: [4, 4], repeatClose: 2 },
    ],
    tracks: [{
      name: 'Guitar',
      measures: Array.from({ length: 8 }, () => ({
        voices: [[quarterBeat(6, 0), quarterBeat(6, 2), quarterBeat(6, 3), quarterBeat(6, 5)], []],
      })),
    }],
  }, join(OUT_DIR, 'repeat-8bar.gp5'));

  // Feature: repeat with two alternate endings. Guitar Pro puts the repeat
  // close mark on the last bar of the first ending, so bar 3 carries both the
  // ending 1 mark and the close mark. Bar 4 carries the ending 2 mark.
  writeGp5({
    measureHeaders: [
      { timeSig: [4, 4], repeatOpen: true },
      ...Array.from({ length: 2 }, () => ({ timeSig: [4, 4] })),
      { timeSig: [4, 4], alternateEndings: 1, repeatClose: 2 },
      { timeSig: [4, 4], alternateEndings: 2 },
    ],
    tracks: [{
      name: 'Guitar',
      measures: Array.from({ length: 5 }, () => ({
        voices: [[quarterBeat(6, 0), quarterBeat(6, 2), quarterBeat(6, 3), quarterBeat(6, 5)], []],
      })),
    }],
  }, join(OUT_DIR, 'repeat-endings.gp5'));

  // Feature: nested repeat inside another repeat.
  writeGp5({
    measureHeaders: [
      { timeSig: [4, 4], repeatOpen: true },
      { timeSig: [4, 4] },
      { timeSig: [4, 4], repeatOpen: true },
      { timeSig: [4, 4], repeatClose: 2 },
      { timeSig: [4, 4], repeatClose: 2 },
    ],
    tracks: [{
      name: 'Guitar',
      measures: Array.from({ length: 5 }, () => ({
        voices: [[quarterBeat(6, 0), quarterBeat(6, 2)], []],
      })),
    }],
  }, join(OUT_DIR, 'nested-repeat.gp5'));

  // Feature: ties, rests, dotted notes, and tuplets.
  writeGp5({
    measureHeaders: [
      { timeSig: [4, 4] },
      { timeSig: [4, 4] },
    ],
    tracks: [{
      name: 'Guitar',
      measures: [
        // Bar 1 holds 4 quarters: a half note, an eighth triplet group, and a
        // quarter note that ties over the bar line.
        {
          voices: [[
            { duration: -1, notes: [{ string: 6, fret: 0 }] },
            { duration: 1, tuplet: 3, notes: [{ string: 4, fret: 0 }] },
            { duration: 1, tuplet: 3, notes: [{ string: 4, fret: 2 }] },
            { duration: 1, tuplet: 3, notes: [{ string: 4, fret: 3 }] },
            { duration: 0, notes: [{ string: 6, fret: 3 }] },
          ], []],
        },
        // Bar 2 holds 4 quarters: the tied tail, a dotted quarter, a quarter
        // rest, and an eighth rest.
        {
          voices: [[
            { duration: 0, notes: [{ string: 6, fret: 3, tie: true }] },
            { duration: 0, dotted: true, notes: [{ string: 5, fret: 0 }] },
            restBeat(0),
            restBeat(1),
          ], []],
        },
      ],
    }],
  }, join(OUT_DIR, 'ties-rhythm.gp5'));

  // Feature: two voices in one bar.
  writeGp5({
    tracks: [{
      name: 'Guitar',
      measures: [{
        voices: [
          [quarterBeat(6, 0), quarterBeat(6, 2)],
          [quarterBeat(1, 0), quarterBeat(1, 3)],
        ],
      }],
    }],
  }, join(OUT_DIR, 'two-voices.gp5'));

  // Feature: all 13 techniques from FR-021.
  writeGp5({
    tracks: [{
      name: 'Guitar',
      measures: [{
        voices: [[
          { duration: 0, notes: [{ string: 6, fret: 0, effects: { bend: true } }] },
          { duration: 0, notes: [{ string: 6, fret: 2, effects: { slide: true } }] },
          { duration: 0, notes: [{ string: 6, fret: 0, hopo: true }] },
          { duration: 0, notes: [{ string: 6, fret: 2 }] },
          { duration: 0, notes: [{ string: 6, fret: 5, hopo: true }] },
          { duration: 0, notes: [{ string: 6, fret: 3 }] },
          { duration: 0, notes: [{ string: 5, fret: 0, effects: { vibrato: true } }] },
          { duration: 0, notes: [{ string: 5, fret: 2, effects: { palmMute: true } }] },
          { duration: 0, notes: [{ string: 5, fret: 3, effects: { harmonic: true, harmonicType: 1 } }] },
          { duration: 0, beatEffects: { tap: true }, notes: [{ string: 4, fret: 0 }] },
          { duration: 0, beatEffects: { slap: true }, notes: [{ string: 4, fret: 2 }] },
          { duration: 0, beatEffects: { pop: true }, notes: [{ string: 4, fret: 3 }] },
          { duration: 0, notes: [{ string: 3, fret: 0, effects: { trill: true } }] },
          { duration: 0, notes: [{ string: 3, fret: 2, effects: { tremolo: true } }] },
          { duration: 0, notes: [{ string: 3, fret: 3, dead: true }] },
          // A grace note before the main note. FR-007 needs this content.
          { duration: 0, notes: [{ string: 3, fret: 5, effects: { grace: true, graceFret: 4 } }] },
        ], []],
      }],
    }],
  }, join(OUT_DIR, 'techniques.gp5'));

  // Feature: meter change from 6/8 to 4/4 at bar 17.
  writeGp5({
    measureHeaders: [
      ...Array.from({ length: 16 }, () => ({ timeSig: [6, 8] })),
      { timeSig: [4, 4] },
    ],
    tracks: [{
      name: 'Guitar',
      measures: Array.from({ length: 17 }, () => ({
        voices: [[quarterBeat(6, 0), quarterBeat(6, 2)], []],
      })),
    }],
  }, join(OUT_DIR, 'meter-change.gp5'));

  // Feature: 200 bar multi-track score (compact repetition).
  writeGp5({
    measureHeaders: Array.from({ length: 200 }, () => ({ timeSig: [4, 4] })),
    tracks: [
      {
        name: 'Guitar',
        program: 27,
        measures: Array.from({ length: 200 }, () => ({
          voices: [[quarterBeat(6, 0)], []],
        })),
      },
      {
        name: 'Bass',
        program: 33,
        tuning: STD_TUNING_4,
        measures: Array.from({ length: 200 }, () => ({
          voices: [[quarterBeat(4, 0)], []],
        })),
      },
    ],
  }, join(OUT_DIR, 'large-200bar.gp5'));

  // Feature: 7 string tuning.
  writeGp5({
    tracks: [{
      name: '7-String',
      tuning: STD_TUNING_7,
      measures: [{ voices: [[quarterBeat(7, 0)], []] }],
    }],
  }, join(OUT_DIR, 'seven-string.gp5'));

  // Feature: 8 string tuning (note on string 7; GP5 string flags hold 7 bits).
  writeGp5({
    tracks: [{
      name: '8-String',
      tuning: STD_TUNING_8,
      measures: [{ voices: [[quarterBeat(7, 0)], []] }],
    }],
  }, join(OUT_DIR, 'eight-string.gp5'));

  // Feature: one bar in 13/16.
  writeGp5({
    measureHeaders: [{ timeSig: [13, 16] }],
    tracks: [{
      name: 'Guitar',
      measures: [{
        voices: [[
          ...Array.from({ length: 13 }, () => ({ duration: 2, notes: [{ string: 6, fret: 0 }] })),
        ], []],
      }],
    }],
  }, join(OUT_DIR, 'odd-meter-13-16.gp5'));

  // Feature: 24 tracks.
  writeGp5({
    tracks: Array.from({ length: 24 }, (_, i) => ({
      name: `Track ${i + 1}`,
      measures: [{ voices: [[quarterBeat(6, i % 5)], []] }],
    })),
  }, join(OUT_DIR, 'many-tracks.gp5'));

  // Feature: drum track only.
  writeGp5({
    tracks: [{
      name: 'Drums',
      isPercussion: true,
      tuning: [0, 0, 0, 0, 0, 0],
      measures: [{
        voices: [[
          quarterBeat(1, 36),
          quarterBeat(2, 38),
          quarterBeat(3, 42),
          quarterBeat(4, 38),
        ], []],
      }],
    }],
  }, join(OUT_DIR, 'drums-only.gp5'));

  // Feature: drum track with a flam. The snare on beat 2 carries a grace hit.
  writeGp5({
    tracks: [{
      name: 'Drums',
      isPercussion: true,
      tuning: [0, 0, 0, 0, 0, 0],
      measures: [{
        voices: [[
          quarterBeat(1, 36),
          quarterBeat(2, 38, { effects: { grace: true, graceFret: 38 } }),
          quarterBeat(3, 42),
          quarterBeat(4, 38),
        ], []],
      }],
    }],
  }, join(OUT_DIR, 'drums-flam.gp5'));

  // Feature: one bar score.
  writeGp5({
    tracks: [{
      name: 'Guitar',
      measures: [{ voices: [[quarterBeat(6, 0)], []] }],
    }],
  }, join(OUT_DIR, 'one-bar.gp5'));

  // Feature: empty trailing bar.
  writeGp5({
    measureHeaders: [{ timeSig: [4, 4] }, { timeSig: [4, 4] }],
    tracks: [{
      name: 'Guitar',
      measures: [
        { voices: [[quarterBeat(6, 0), quarterBeat(6, 2), quarterBeat(6, 3), quarterBeat(6, 5)], []] },
        { voices: [[], []] },
      ],
    }],
  }, join(OUT_DIR, 'empty-trailing-bar.gp5'));

  // Feature: track with no notes.
  writeGp5({
    tracks: [
      {
        name: 'Guitar',
        measures: [{ voices: [[quarterBeat(6, 0)], []] }],
      },
      {
        name: 'Empty',
        measures: [{ voices: [[], []] }],
      },
    ],
  }, join(OUT_DIR, 'empty-track.gp5'));

  // Reject fixtures.
  writeFileSync(join(OUT_DIR, 'corrupt.bin'), Buffer.from('not a guitar pro file'));
  writeFileSync(join(OUT_DIR, 'legacy.gpx'), Buffer.from('BCFS' + '\0'.repeat(60)));
  writeFileSync(join(OUT_DIR, 'legacy.gp3'), Buffer.from('FICHIER GUITAR PRO v3.00' + '\0'.repeat(40)));
  writeFileSync(join(OUT_DIR, 'legacy.gp4'), Buffer.from('FICHIER GUITAR PRO v4.06' + '\0'.repeat(40)));

  // GPIF `.gp` copies.
  const tempoGpif = buildSimpleGpif({
    barCount: 16,
    tempoAutomations: `
      <Automation><Type>Tempo</Type><Bar>0</Bar><Position>0</Position><Value>90 2</Value></Automation>
      <Automation><Type>Tempo</Type><Bar>8</Bar><Position>0</Position><Value>140 2</Value></Automation>`,
  });
  writeGpZip(tempoGpif, join(OUT_DIR, 'tempo-change.gp'));

  const repeatEndingsGpif = buildSimpleGpif({
    barCount: 5,
    masterBarExtras: (b) => {
      if (b === 0) return '<Repeat start="true"/>';
      if (b === 3) return '<Repeat count="2"/><AlternateEndings>1</AlternateEndings>';
      if (b === 4) return '<AlternateEndings>2</AlternateEndings>';
      return '';
    },
  });
  writeGpZip(repeatEndingsGpif, join(OUT_DIR, 'repeat-endings.gp'));

  const tiesGpif = buildSimpleGpif({
    barCount: 2,
    barVoiceBuilder: (b, ids) => {
      if (b === 0) {
        const vId = ids.voiceId;
        const b0 = ids.beatId;
        const b1 = ids.beatId + 1;
        const n0 = ids.noteId;
        const n1 = ids.noteId + 1;
        return {
          bar: `    <Bar id="0"><Voices>${vId}</Voices></Bar>`,
          voices: [`    <Voice id="${vId}"><Beats>${b0} ${b1}</Beats></Voice>`],
          beats: [
            `    <Beat id="${b0}"><Rhythm ref="1"/><Notes>${n0}</Notes></Beat>`,
            `    <Beat id="${b1}"><Rhythm ref="0"/><Notes>${n1}</Notes></Beat>`,
          ],
          notes: [
            gpifNote(n0, { fret: 0, stringIndex: 5 }),
            gpifNote(n1, { fret: 0, stringIndex: 5, props: '<Property name="Tie"><Enable>true</Enable></Property>' }),
          ],
          nextBeatId: ids.beatId + 2,
          nextNoteId: ids.noteId + 2,
          nextVoiceId: ids.voiceId + 1,
        };
      }
      const vId = ids.voiceId;
      const b0 = ids.beatId;
      return {
        bar: `    <Bar id="1"><Voices>${vId}</Voices></Bar>`,
        voices: [`    <Voice id="${vId}"><Beats>${b0} ${b0 + 1} ${b0 + 2} ${b0 + 3}</Beats></Voice>`],
        beats: Array.from({ length: 4 }, (_, i) => `    <Beat id="${b0 + i}"><Rhythm ref="0"/><Notes/></Beat>`),
        notes: [],
        nextBeatId: ids.beatId + 4,
        nextNoteId: ids.noteId,
        nextVoiceId: ids.voiceId + 1,
      };
    },
  });
  writeGpZip(tiesGpif, join(OUT_DIR, 'ties-rhythm.gp'));

  const twoVoicesGpif = buildSimpleGpif({
    barCount: 1,
    barVoiceBuilder: (_b, ids) => ({
      bar: '    <Bar id="0"><Voices>0 1</Voices></Bar>',
      voices: [
        '    <Voice id="0"><Beats>0 1</Beats></Voice>',
        '    <Voice id="1"><Beats>2 3</Beats></Voice>',
      ],
      beats: [
        '    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>',
        '    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>',
        '    <Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>',
        '    <Beat id="3"><Rhythm ref="0"/><Notes>3</Notes></Beat>',
      ],
      notes: [
        gpifNote(0, { fret: 0, stringIndex: 5 }),
        gpifNote(1, { fret: 2, stringIndex: 5 }),
        gpifNote(2, { fret: 0, stringIndex: 0 }),
        gpifNote(3, { fret: 3, stringIndex: 0 }),
      ],
      nextBeatId: 4,
      nextNoteId: 4,
      nextVoiceId: 2,
    }),
  });
  writeGpZip(twoVoicesGpif, join(OUT_DIR, 'two-voices.gp'));

  const techniquesGpif = buildSimpleGpif({
    barCount: 1,
    barVoiceBuilder: (_b, ids) => {
      const techniques = [
        { props: '<Property name="Bended"><Enable>true</Enable></Property>' },
        { props: '<Property name="Slide"><Enable>true</Enable></Property>' },
        { props: '<Property name="HopoOrigin"><Enable>true</Enable></Property>' },
        { props: '' },
        { extra: '<Vibrato/>' },
        { props: '<Property name="PalmMuted"><Enable>true</Enable></Property>' },
        { props: '<Property name="HarmonicType"><Number>1</Number></Property>' },
        { props: '<Property name="LeftHandTapped"><Enable>true</Enable></Property>' },
        { beat: '<Property name="Slapped"><Enable>true</Enable></Property>' },
        { beat: '<Property name="Popped"><Enable>true</Enable></Property>' },
        { extra: '<Trill><Speed>16</Speed></Trill>' },
        { beatTremolo: '<Tremolo><Speed>16</Speed></Tremolo>' },
        { props: '<Property name="Muted"><Enable>true</Enable></Property>' },
      ];
      const beats = [];
      const notes = [];
      const beatIds = [];
      for (let i = 0; i < techniques.length; i += 1) {
        const beatId = ids.beatId + i;
        const noteId = ids.noteId + i;
        beatIds.push(beatId);
        const t = techniques[i];
        const beatExtra = t.beat ? `<Properties>${t.beat}</Properties>` : '';
        const beatTremolo = t.beatTremolo || '';
        beats.push(`    <Beat id="${beatId}"><Rhythm ref="0"/>${beatTremolo}${beatExtra}<Notes>${noteId}</Notes></Beat>`);
        notes.push(gpifNote(noteId, {
          fret: i,
          stringIndex: i % 6,
          props: t.props || '',
          extra: t.extra || '',
        }));
      }
      return {
        bar: '    <Bar id="0"><Voices>0</Voices></Bar>',
        voices: [`    <Voice id="0"><Beats>${beatIds.join(' ')}</Beats></Voice>`],
        beats,
        notes,
        nextBeatId: ids.beatId + techniques.length,
        nextNoteId: ids.noteId + techniques.length,
        nextVoiceId: 1,
      };
    },
  });
  writeGpZip(techniquesGpif, join(OUT_DIR, 'techniques.gp'));

  // Feature: a vocal warm-up. Each beat carries the vowel to sing. Bar 4 holds
  // no beat text, and it opens a section that names the exercise instead.
  const VOWELS = ['mee', 'may', 'mah', ''];
  writeGp5({
    tempo: 80,
    measureHeaders: [
      { timeSig: [4, 4] },
      { timeSig: [4, 4] },
      { timeSig: [4, 4] },
      { timeSig: [4, 4], marker: 'Lip trills' },
    ],
    tracks: [{
      name: 'Voice',
      measures: VOWELS.map((vowel, i) => ({
        voices: [[{ ...quarterBeat(6, i), text: vowel }], []],
      })),
    }],
  }, join(OUT_DIR, 'vocal-text.gp5'));

  const vocalTextGpif = buildSimpleGpif({
    barCount: 4,
    trackName: 'Voice',
    beatText: (b) => VOWELS[b] || '',
    masterBarExtras: (b) => (b === 3 ? '<Section><Text>Lip trills</Text></Section>' : ''),
  });
  writeGpZip(vocalTextGpif, join(OUT_DIR, 'vocal-text.gp'));
}

export function makeFixtures() {
  writeAllFixtures();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeAllFixtures();
  console.log('gp-player fixtures: ok');
}
