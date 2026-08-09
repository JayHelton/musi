// Drum parsing and percussion wiring for Guitar Pro GPIF scores.
// Run: node tests/gp-player/drum-parsing.mjs

import assert from 'node:assert/strict';
import { gpifToTracks } from '../../js/tab/guitarPro.js';
import {
  normalizePercussionMidi,
  midiToDrumInstrument,
  dynamicsToVelocity,
  gp6ElementVariationToMidi,
  assignPercussionSlots,
  deriveMeasureSlotSpans,
} from '../../js/tab/gpPercussion.js';
import { createGpMixPlayer } from '../../js/gpMixPlayer.js';
import { createPlayerState } from '../../js/gpPlayer/playerState.js';
import { installDomShim } from './domShim.mjs';

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

const GPIF_SHELL = (body) => `<?xml version="1.0" encoding="UTF-8"?>
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
  ${body || ''}
</GPIF>`;

// ---- GPIF: InstrumentArticulation table ----
const gpifArticulation = GPIF_SHELL();
const artResult = gpifToTracks(gpifArticulation);
assert.equal(artResult.tracks.length, 1);
const artTrack = artResult.tracks[0];
assert.equal(artTrack.isPercussion, true);
assert.equal(artTrack.fretted, false);
assert.ok(artTrack.model?.percussion);
assert.equal(artTrack.model.events.length, 3);
assert.equal(artTrack.model.events[0].instrument, 'kick');
assert.equal(artTrack.model.events[0].start, 0);
assert.equal(artTrack.model.events[1].instrument, 'snare');
assert.equal(artTrack.model.events[1].start, 1);
assert.equal(artTrack.model.events[2].instrument, 'hihatClosed');
assert.equal(artTrack.model.events[2].start, 2);

// ---- GPIF: out-of-range articulation index falls back to GP input kit ----
const gpifOorIndex = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0</Beats></Voice></Voices>
  <Beats><Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat></Beats>
  <Notes><Note id="0"><InstrumentArticulation>91</InstrumentArticulation></Note></Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
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
        </Elements>
      </InstrumentSet>
    </Track>
  </Tracks>
</GPIF>`;
const oorResult = gpifToTracks(gpifOorIndex);
assert.equal(oorResult.tracks[0].model.events.length, 1);
assert.equal(oorResult.tracks[0].model.events[0].instrument, 'snare');
assert.equal(oorResult.tracks[0].model.events[0].midi, 38);

// ---- GPIF: GP6 Element + Variation properties ----
const gpifGp6 = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0 1 2</Beats></Voice></Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><Properties>
      <Property name="Element"><Element>0</Element></Property>
      <Property name="Variation"><Variation>0</Variation></Property>
    </Properties></Note>
    <Note id="1"><Properties>
      <Property name="Element"><Element>1</Element></Property>
      <Property name="Variation"><Variation>2</Variation></Property>
    </Properties></Note>
    <Note id="2"><Properties>
      <Property name="Element"><Element>10</Element></Property>
      <Property name="Variation"><Variation>2</Variation></Property>
    </Properties></Note>
  </Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      <InstrumentSet><Type>drumKit</Type><Elements/></InstrumentSet>
    </Track>
  </Tracks>
</GPIF>`;
const gp6Result = gpifToTracks(gpifGp6);
const gp6Events = gp6Result.tracks[0].model.events;
assert.equal(gp6Events.length, 3);
assert.equal(gp6Events[0].instrument, 'kick');
assert.equal(gp6Events[0].start, 0);
assert.equal(gp6Events[1].instrument, 'snare');
assert.equal(gp6Events[1].start, 1);
assert.equal(gp6Events[2].instrument, 'hihatOpen');
assert.equal(gp6Events[2].start, 2);

// ---- GPIF: two-voice bar merges kick from voice 1 ----
const gpifTwoVoice = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0 1</Voices></Bar></Bars>
  <Voices>
    <Voice id="0"><Beats>0 1 2 3</Beats></Voice>
    <Voice id="1"><Beats>4 5</Beats></Voice>
  </Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="1"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="1"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="1"/><Notes>2</Notes></Beat>
    <Beat id="3"><Rhythm ref="1"/><Notes>3</Notes></Beat>
    <Beat id="4"><Rhythm ref="0"/><Notes>4</Notes></Beat>
    <Beat id="5"><Rhythm ref="0"/><Notes>5</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><InstrumentArticulation>2</InstrumentArticulation></Note>
    <Note id="1"><InstrumentArticulation>1</InstrumentArticulation></Note>
    <Note id="2"><InstrumentArticulation>2</InstrumentArticulation></Note>
    <Note id="3"><InstrumentArticulation>2</InstrumentArticulation></Note>
    <Note id="4"><InstrumentArticulation>0</InstrumentArticulation></Note>
    <Note id="5"><InstrumentArticulation>0</InstrumentArticulation></Note>
  </Notes>
  <Rhythms>
    <Rhythm id="0"><NoteValue>Half</NoteValue></Rhythm>
    <Rhythm id="1"><NoteValue>Eighth</NoteValue></Rhythm>
  </Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>
  </Tracks>
</GPIF>`;
const twoVoiceResult = gpifToTracks(gpifTwoVoice);
const twoVoiceModel = twoVoiceResult.tracks[0].model;
const kickStarts = twoVoiceModel.events
  .filter((e) => e.instrument === 'kick')
  .map((e) => e.start)
  .sort((a, b) => a - b);
assert.deepEqual(kickStarts, [0, 2], 'kick hits from voice 1 must survive on beats 0 and 2');
assert.ok(twoVoiceModel.events.some((e) => e.instrument === 'snare' && e.start === 0.5));
assert.ok(twoVoiceModel.events.some((e) => e.instrument === 'hihatClosed'));
assert.equal(twoVoiceModel.measures.length, 1);
assert.equal(twoVoiceModel.measures[0].endBeat, 4, 'merged measure spans one 4/4 bar, not two');

// ---- GPIF: beat Dynamic + ghost snare ----
const gpifDynamics = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0 1 2</Beats></Voice></Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Dynamic>MF</Dynamic><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Dynamic>F</Dynamic><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="0"/><Dynamic>F</Dynamic><Notes>2</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><InstrumentArticulation>1</InstrumentArticulation></Note>
    <Note id="1"><InstrumentArticulation>1</InstrumentArticulation></Note>
    <Note id="2">
      <InstrumentArticulation>1</InstrumentArticulation>
      <AntiAccent>normal</AntiAccent>
    </Note>
  </Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>
  </Tracks>
</GPIF>`;
const dynResult = gpifToTracks(gpifDynamics);
const dynEvents = dynResult.tracks[0].model.events;
const mfSnare = dynEvents.find((e) => e.start === 0);
const fSnare = dynEvents.find((e) => e.start === 1);
const ghostSnare = dynEvents.find((e) => e.start === 2);
assert.ok(mfSnare && fSnare && ghostSnare);
assert.ok(fSnare.velocity > mfSnare.velocity, 'F beat should be louder than MF');
assert.equal(ghostSnare.instrument, 'snareGhost');
assert.equal(mfSnare.accent, false);
assert.equal(fSnare.accent, false);
assert.equal(ghostSnare.accent, false);
for (const ev of dynEvents) {
  assert.equal(ev.accent, false, 'GPIF drum events default accent to false');
}

// ---- GPIF: pitched track must not be classified as percussion ----
const gpifPitched = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0</Beats></Voice></Voices>
  <Beats><Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat></Beats>
  <Notes><Note id="0"><Properties>
    <Property name="Fret"><Fret>0</Fret></Property>
    <Property name="String"><String>0</String></Property>
    <Property name="Midi"><Number>40</Number></Property>
  </Properties></Note></Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Guitar</Name>
      <InstrumentSet>
        <Type>pitched</Type>
        <Elements>
          <Element>
            <Pitched>Pitched</Pitched>
            <Articulations>
              <Articulation>
                <OutputMidiNumber>0</OutputMidiNumber>
              </Articulation>
            </Articulations>
          </Element>
        </Elements>
      </InstrumentSet>
      <Staves>
        <Staff>
          <Properties>
            <Property name="Tuning">
              <Pitches>40 45 50 55 59 64</Pitches>
            </Property>
          </Properties>
        </Staff>
      </Staves>
    </Track>
  </Tracks>
</GPIF>`;
const pitchedResult = gpifToTracks(gpifPitched);
assert.equal(pitchedResult.tracks[0].fretted, true);
assert.equal(pitchedResult.tracks[0].isPercussion, false);
assert.equal(pitchedResult.tracks[0].model.events.length, 1);
assert.equal(pitchedResult.tracks[0].model.events[0].midi, 40);

// ---- GPIF: channel 9 drum detection without drumKit Type ----
const gpifChannel9 = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>4/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0</Beats></Voice></Voices>
  <Beats><Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat></Beats>
  <Notes><Note id="0"><Properties>
    <Property name="Midi"><Number>36</Number></Property>
  </Properties></Note></Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Drums</Name>
      <MidiConnection><PrimaryChannel>9</PrimaryChannel></MidiConnection>
    </Track>
  </Tracks>
</GPIF>`;
const ch9Result = gpifToTracks(gpifChannel9);
assert.equal(ch9Result.tracks[0].isPercussion, true);
assert.equal(ch9Result.tracks[0].fretted, false);
assert.equal(ch9Result.tracks[0].model.events[0].instrument, 'kick');

// ---- GPIF: fretted + drum tracks align measure beats ----
const gpifMixed = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars>
    <MasterBar><Bars>0 0</Bars><Time>4/4</Time></MasterBar>
    <MasterBar><Bars>1 1</Bars><Time>4/4</Time></MasterBar>
  </MasterBars>
  <Bars>
    <Bar id="0"><Voices>0</Voices></Bar>
    <Bar id="1"><Voices>1</Voices></Bar>
  </Bars>
  <Voices>
    <Voice id="0"><Beats>0</Beats></Voice>
    <Voice id="1"><Beats>1</Beats></Voice>
  </Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><Properties>
      <Property name="Fret"><Fret>0</Fret></Property>
      <Property name="String"><String>0</String></Property>
      <Property name="Midi"><Number>40</Number></Property>
    </Properties></Note>
    <Note id="1"><InstrumentArticulation>0</InstrumentArticulation></Note>
  </Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Whole</NoteValue></Rhythm></Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Guitar</Name>
      <Staves>
        <Staff>
          <Properties>
            <Property name="Tuning">
              <Pitches>40 45 50 55 59 64</Pitches>
            </Property>
          </Properties>
        </Staff>
      </Staves>
    </Track>
    <Track id="1">
      <Name>Drums</Name>
      ${DRUM_ARTICULATION_SET}
    </Track>
  </Tracks>
</GPIF>`;
const mixedResult = gpifToTracks(gpifMixed);
assert.equal(mixedResult.tracks.length, 2);
const guitarTrack = mixedResult.tracks.find((t) => t.name === 'Guitar');
const drumTrack = mixedResult.tracks.find((t) => t.name === 'Drums');
assert.equal(guitarTrack.fretted, true);
assert.equal(guitarTrack.isPercussion, false);
assert.equal(drumTrack.isPercussion, true);
assert.equal(drumTrack.fretted, false);
assert.equal(guitarTrack.model.measures.length, 2);
assert.equal(drumTrack.model.measures.length, 2);
for (let i = 0; i < 2; i += 1) {
  assert.equal(
    guitarTrack.model.measures[i].startBeat,
    drumTrack.model.measures[i].startBeat,
    `measure ${i} startBeat should match`,
  );
  assert.equal(
    guitarTrack.model.measures[i].endBeat,
    drumTrack.model.measures[i].endBeat,
    `measure ${i} endBeat should match`,
  );
}

// ---- normalizePercussionMidi ----
assert.equal(normalizePercussionMidi(91), 38);
assert.equal(normalizePercussionMidi(92), 46);
assert.equal(normalizePercussionMidi(99), 56);
assert.equal(normalizePercussionMidi(127), 59);
assert.equal(normalizePercussionMidi(38), 38);
assert.equal(normalizePercussionMidi(NaN), null);
assert.equal(normalizePercussionMidi('oops'), null);

// ---- midiToDrumInstrument ----
assert.equal(midiToDrumInstrument(36), 'kick');
assert.equal(midiToDrumInstrument(38), 'snare');
assert.equal(midiToDrumInstrument(42), 'hihatClosed');
assert.equal(midiToDrumInstrument(46), 'hihatOpen');
assert.equal(midiToDrumInstrument(51), 'ride');
assert.equal(midiToDrumInstrument(49), 'crash');
assert.equal(midiToDrumInstrument(48), 'tomHigh');
assert.equal(midiToDrumInstrument(45), 'tomMid');
assert.equal(midiToDrumInstrument(43), 'tomFloor');
assert.equal(midiToDrumInstrument(38, { ghost: true }), 'snareGhost');
assert.equal(midiToDrumInstrument(38, { velocity: 0.3 }), 'snareGhost');
assert.equal(midiToDrumInstrument(56), 'hihatClosed');
assert.equal(midiToDrumInstrument(54), 'hihatClosed');
assert.equal(midiToDrumInstrument(1), null);

// ---- dynamicsToVelocity ----
assert.ok(dynamicsToVelocity('PPP') < dynamicsToVelocity('MF'));
assert.ok(dynamicsToVelocity('MF') < dynamicsToVelocity('FFF'));
assert.equal(dynamicsToVelocity(3), 0.55);
assert.equal(dynamicsToVelocity('unknown'), 0.78);
assert.equal(dynamicsToVelocity(null), 0.78);

// ---- gp6ElementVariationToMidi ----
assert.equal(gp6ElementVariationToMidi(10, 0), 42);
assert.equal(gp6ElementVariationToMidi(10, 1), 92);
assert.equal(gp6ElementVariationToMidi(10, 2), 46);
assert.equal(gp6ElementVariationToMidi(99, 0), null);
assert.equal(gp6ElementVariationToMidi(10, 9), 42);

// ---- assignPercussionSlots ----
const slotInput = [
  { start: 1, instrument: 'snare' },
  { start: 0, instrument: 'kick' },
  { start: 0, instrument: 'hihatClosed' },
  { start: 1 + Number.EPSILON, instrument: 'snare' },
];
const slotSnapshot = JSON.parse(JSON.stringify(slotInput));
const slotted = assignPercussionSlots(slotInput);
assert.notEqual(slotted, slotInput);
assert.deepEqual(slotInput, slotSnapshot, 'assignPercussionSlots must not mutate input');
const atZero = slotted.filter((e) => e.start === 0);
assert.equal(atZero.length, 2);
assert.equal(atZero[0].slot, atZero[1].slot, 'hits on the same beat share a slot');
assert.equal(atZero[0].slot, 0, 'the earliest beat is slot 0');
assert.equal(slotted.find((e) => e.start === 1).slot, slotted.find((e) => e.start === 1 + Number.EPSILON).slot);
assert.ok(slotted.find((e) => e.start === 1).slot > slotted.find((e) => e.start === 0).slot);

// ---- deriveMeasureSlotSpans ----
const spanMeasures = [
  { startBeat: 0, endBeat: 4 },
  { startBeat: 4, endBeat: 8 },
];
const spanEvents = [
  { slot: 0, start: 0 },
  { slot: 2, start: 2 },
  { slot: 4, start: 5 },
];
const spanned = deriveMeasureSlotSpans(spanMeasures, spanEvents);
assert.equal(spanned[0].startSlot, 0);
assert.equal(spanned[0].endSlot, 3);
assert.equal(spanned[1].startSlot, 4);
assert.equal(spanned[1].endSlot, 5);
const emptySpanned = deriveMeasureSlotSpans(
  [{ startBeat: 0, endBeat: 4 }],
  [],
);
assert.equal(emptySpanned[0].startSlot, 0);
assert.equal(emptySpanned[0].endSlot, 1);

// ---- mix player: drums-only score ----
installDomShim();
const drumModel = artTrack.model;
const drumOnlyPlayer = createGpMixPlayer();
drumOnlyPlayer.load({ drumModels: [drumModel], bpm: 120 });
assert.equal(drumOnlyPlayer.events.length, drumModel.events.length);
assert.ok(drumOnlyPlayer.events.every((e) => e.kind === 'drum'));
assert.ok(drumOnlyPlayer.events.every((e) => Number.isFinite(e.startSec) && e.startSec >= 0));
assert.ok(Math.abs(drumOnlyPlayer.events[1].startSec - 0.5) < 1e-9);

// ---- playerState: drum-only gpResult ----
const drumOnlyGp = {
  tempo: 120,
  tracks: [],
  drumTracks: [{
    index: 0,
    name: 'Drums',
    model: drumModel,
    hitCount: drumModel.events.length,
    tempo: 120,
  }],
};
const psDrum = createPlayerState(drumOnlyGp);
assert.equal(psDrum.state.viewKind, 'drum');
assert.equal(psDrum.state.trackIndex, -1);
psDrum.applyTransforms();
assert.ok(psDrum.state.viewModel);
assert.equal(psDrum.state.viewModel.percussion, true);
assert.equal(psDrum.state.viewModel.events.length, drumModel.events.length);
psDrum.destroy();

console.log('gp-player drum parsing: ok');
