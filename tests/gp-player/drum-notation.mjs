// Drum-tab notation module and parse-time articulation enrichment.
// Run: node tests/gp-player/drum-notation.mjs

import assert from 'node:assert/strict';
import { INSTRUMENT_ORDER } from '../../js/drums/types.js';
import {
  DRUM_TAB_LANES,
  DRUM_TAB_LEGEND,
  ACCENT_VELOCITY,
  drumLaneFor,
  drumArticulationFromMidi,
  drumTabGlyph,
  drumHitLabel,
  drumHitPriority,
  drumTabLegendFor,
} from '../../js/drums/notation.js';
import { gpifToTracks } from '../../js/tab/guitarPro.js';
import { makePercussionModel } from '../../js/tab/gpPercussion.js';

// ---- drumTabGlyph: every branch ----
assert.equal(drumTabGlyph({ instrument: 'hihatClosed', velocity: 0.5 }), 'x');
assert.equal(drumTabGlyph({ instrument: 'hihatClosed', velocity: 1 }), 'X');
assert.equal(drumTabGlyph({ instrument: 'hihatClosed', midi: 44 }), '+');
assert.equal(drumTabGlyph({ instrument: 'hihatOpen' }), 'O');
assert.equal(drumTabGlyph({ instrument: 'ride', velocity: 0.5 }), 'x');
assert.equal(drumTabGlyph({ instrument: 'ride', midi: 53 }), 'b');
assert.equal(drumTabGlyph({ instrument: 'crash', velocity: 0.5 }), 'x');
assert.equal(drumTabGlyph({ instrument: 'crash', velocity: 1 }), 'X');
assert.equal(drumTabGlyph({ instrument: 'snare', velocity: 0.5 }), 'o');
assert.equal(drumTabGlyph({ instrument: 'snare', velocity: 1 }), 'O');
assert.equal(drumTabGlyph({ instrument: 'snare', midi: 37 }), '@');
assert.equal(drumTabGlyph({ instrument: 'snareGhost' }), 'g');
assert.equal(drumTabGlyph({ instrument: 'snareFlam' }), 'f');
assert.equal(drumTabGlyph({ instrument: 'kick', velocity: 0.5 }), 'o');
assert.equal(drumTabGlyph({ instrument: 'kick', velocity: 1 }), 'O');
assert.equal(drumTabGlyph({ instrument: 'tomHigh', velocity: 0.5 }), 'o');
assert.equal(drumTabGlyph({ instrument: 'tomMid' }), 'o');
assert.equal(drumTabGlyph({ instrument: 'tomFloor' }), 'o');
assert.equal(drumTabGlyph({ instrument: 'unknown' }), 'x');
assert.equal(drumTabGlyph({ instrument: 'snare' }), 'o', 'missing velocity stays un-accented');
assert.equal(ACCENT_VELOCITY, 0.9);

// ---- explicit accent flag ----
assert.equal(drumTabGlyph({ instrument: 'snare', accent: true }), 'O');
assert.equal(drumTabGlyph({ instrument: 'hihatClosed', accent: true }), 'X');
assert.equal(drumTabGlyph({ instrument: 'snare', accent: false, velocity: 1 }), 'o');
assert.equal(drumTabGlyph({ instrument: 'snare', velocity: 1 }), 'O', 'velocity fallback when accent absent');

// ---- drumArticulationFromMidi ----
assert.equal(drumArticulationFromMidi(44), 'hihatPedal');
assert.equal(drumArticulationFromMidi(37), 'sideStick');
assert.equal(drumArticulationFromMidi(53), 'rideBell');
assert.equal(drumArticulationFromMidi(52), 'china');
assert.equal(drumArticulationFromMidi(55), 'splash');
assert.equal(drumArticulationFromMidi(38), null);
assert.equal(drumArticulationFromMidi(NaN), null);

// ---- drumLaneFor + DRUM_TAB_LANES coverage ----
assert.equal(drumLaneFor('snareGhost')?.key, 'snare');
assert.equal(drumLaneFor('hihatOpen')?.key, 'hihat');
assert.equal(drumLaneFor('nope'), null);
const laneInstruments = new Set(DRUM_TAB_LANES.flatMap((l) => l.instruments));
for (const inst of INSTRUMENT_ORDER) {
  assert.ok(laneInstruments.has(inst), `INSTRUMENT_ORDER missing from DRUM_TAB_LANES: ${inst}`);
  assert.ok(drumLaneFor(inst), `drumLaneFor should map ${inst}`);
}

// ---- drumHitPriority ----
assert.ok(drumHitPriority('snareFlam') > drumHitPriority('snare'));
assert.ok(drumHitPriority('snare') > drumHitPriority('snareGhost'));
assert.ok(drumHitPriority('hihatOpen') > drumHitPriority('hihatClosed'));

// ---- drumTabLegendFor + legend completeness ----
const representativeEvents = [
  { instrument: 'hihatClosed', velocity: 0.5 },
  { instrument: 'hihatClosed', velocity: 1 },
  { instrument: 'hihatClosed', midi: 44 },
  { instrument: 'hihatOpen' },
  { instrument: 'ride', velocity: 0.5 },
  { instrument: 'ride', midi: 53 },
  { instrument: 'crash', velocity: 0.5 },
  { instrument: 'crash', velocity: 1 },
  { instrument: 'snare', velocity: 0.5 },
  { instrument: 'snare', velocity: 1 },
  { instrument: 'snare', midi: 37 },
  { instrument: 'snareGhost' },
  { instrument: 'snareFlam' },
  { instrument: 'kick', velocity: 0.5 },
  { instrument: 'kick', velocity: 1 },
  { instrument: 'tomHigh' },
  { instrument: 'unknown' },
];
const emittedGlyphs = new Set(representativeEvents.map(drumTabGlyph));
const legendGlyphs = new Set(DRUM_TAB_LEGEND.map((r) => r.glyph));
for (const g of emittedGlyphs) {
  assert.ok(legendGlyphs.has(g), `DRUM_TAB_LEGEND missing glyph: ${g}`);
}
const filtered = drumTabLegendFor(['o', 'X', 'z']);
assert.deepEqual(filtered.map((r) => r.glyph), ['X', 'o']);
assert.deepEqual(
  drumTabLegendFor(['f', 'g', 'x']).map((r) => r.glyph),
  ['x', 'g', 'f'],
);

// ---- flams: each stroke keeps the symbol of its drum ----
assert.equal(drumTabGlyph({ instrument: 'snare', flam: true }), 'o');
assert.equal(drumTabGlyph({ instrument: 'snare', grace: true, flam: true }), 'o');
assert.equal(
  drumTabGlyph({ instrument: 'snare', flam: true, accent: true }),
  'O',
  'an accented flam keeps the accent symbol',
);
assert.equal(
  drumTabGlyph({ instrument: 'snare', flam: true, midi: 37 }),
  '@',
  'a flam keeps the articulation symbol',
);
assert.equal(drumTabGlyph({ instrument: 'snareFlam' }), 'f', 'the drum-tab tool keeps its f');

// ---- drumHitLabel ----
assert.equal(drumHitLabel({ instrument: 'snare', velocity: 0.5 }), 'Snare');
assert.equal(drumHitLabel({ instrument: 'snare', velocity: 1 }), 'Snare (accent)');
assert.equal(drumHitLabel({ instrument: 'snare', accent: true }), 'Snare (accent)');
assert.equal(drumHitLabel({ instrument: 'hihatClosed', midi: 44 }), 'Hi-Hat (foot)');
assert.equal(drumHitLabel({ instrument: 'ride', midi: 53 }), 'Ride (bell)');
assert.equal(drumHitLabel({ instrument: 'snare', midi: 37 }), 'Snare (side stick)');
assert.equal(drumHitLabel({ instrument: 'snareFlam', velocity: 0.95 }), 'Flam');
assert.equal(drumHitLabel({ instrument: 'snareGhost' }), 'Ghost');
assert.equal(drumHitLabel({ instrument: 'snare', flam: true }), 'Snare (flam)');
assert.equal(drumHitLabel({ instrument: 'tomFloor', flam: true }), 'Floor (flam)');
assert.equal(drumHitLabel({ instrument: 'snare', grace: true, flam: true }), 'Snare (grace)');

// ---- parse-time articulation enrichment (GPIF) ----
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

const GPIF_SHELL = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars>
    <MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar>
  </MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0 1 2</Beats></Voice></Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><InstrumentArticulation>0</InstrumentArticulation></Note>
    <Note id="1"><InstrumentArticulation>1</InstrumentArticulation></Note>
    <Note id="2"><InstrumentArticulation>2</InstrumentArticulation></Note>
  </Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>
  </Tracks>
</GPIF>`;

const gpifResult = gpifToTracks(GPIF_SHELL);
const gpifEvents = gpifResult.tracks[0].model.events;
assert.equal(gpifEvents.length, 3);
for (const ev of gpifEvents) {
  assert.ok('articulation' in ev, 'every parsed event must carry articulation');
}
assert.equal(gpifEvents[0].articulation, null);
assert.equal(gpifEvents[1].articulation, null);
assert.equal(gpifEvents[2].articulation, null);

const pedalModel = makePercussionModel({
  name: 'Test',
  tempo: 120,
  events: [{ start: 0, duration: 0.25, instrument: 'hihatClosed', velocity: 0.78, midi: 44 }],
  measures: [{ startBeat: 0, endBeat: 4 }],
});
assert.equal(pedalModel.events[0].articulation, 'hihatPedal');

const preserved = makePercussionModel({
  name: 'Test',
  tempo: 120,
  events: [{
    start: 0,
    duration: 0.25,
    instrument: 'crash',
    velocity: 0.78,
    midi: 49,
    articulation: 'splash',
  }],
  measures: [{ startBeat: 0, endBeat: 4 }],
});
assert.equal(preserved.events[0].articulation, 'splash');

// ---- GPIF: explicit accent bitfield on drum notes ----
const gpifAccent = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars>
    <MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar>
  </MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0 1 2 3</Beats></Voice></Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>
    <Beat id="3"><Rhythm ref="0"/><Notes>3</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><InstrumentArticulation>1</InstrumentArticulation><Accent>4</Accent></Note>
    <Note id="1"><InstrumentArticulation>1</InstrumentArticulation><Accent>8</Accent></Note>
    <Note id="2"><InstrumentArticulation>1</InstrumentArticulation></Note>
    <Note id="3"><InstrumentArticulation>1</InstrumentArticulation><Accent>1</Accent></Note>
  </Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>
  </Tracks>
</GPIF>`;
const accentResult = gpifToTracks(gpifAccent);
const accentEvents = accentResult.tracks[0].model.events;
assert.equal(accentEvents.length, 4);
assert.equal(accentEvents[0].accent, true, 'Accent bit 0x04');
assert.equal(accentEvents[1].accent, true, 'Accent bit 0x08');
assert.equal(accentEvents[2].accent, false, 'no Accent element');
assert.equal(accentEvents[3].accent, false, 'unrelated Accent bit');

console.log('gp-player drum notation: ok');
