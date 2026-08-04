// Smoke checks for Guitar Pro rhythm mapping + transpose/retune helpers.
// Run: node tests/gp-player/smoke.mjs

import assert from 'node:assert/strict';
import {
  noteValueToQuarters,
  gp5DurationToQuarters,
  transposeModel,
  retuneModel,
  transformModel,
  modelHasRhythm,
  quartersToSeconds,
} from '../../js/tab/tabModel.js';
import { gpifToTracks } from '../../js/tab/guitarPro.js';
import { buildTimedNotes } from '../../js/tab/tabPlayer.js';

// ---- duration math ----
assert.equal(noteValueToQuarters(4), 1);
assert.equal(noteValueToQuarters(8), 0.5);
assert.equal(noteValueToQuarters(4, 1), 1.5);
assert.equal(noteValueToQuarters(8, 0, 3, 2), (0.5 * 2) / 3);
assert.equal(gp5DurationToQuarters(0), 1);
assert.equal(gp5DurationToQuarters(-1), 2);
assert.equal(gp5DurationToQuarters(1), 0.5);
assert.equal(gp5DurationToQuarters(0, 3, false), 2 / 3);

assert.equal(quartersToSeconds(4, 120), 2);

// ---- minimal GPIF ----
const gpif = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <Score/>
  <MasterTrack>
    <Automations>
      <Automation>
        <Type>Tempo</Type>
        <Linear>false</Linear>
        <Bar>0</Bar>
        <Position>0</Position>
        <Visible>true</Visible>
        <Value>140 2</Value>
      </Automation>
    </Automations>
  </MasterTrack>
  <MasterBars>
    <MasterBar>
      <Bars>0</Bars>
      <Time>4/4</Time>
      <Section><Text>Intro</Text></Section>
    </MasterBar>
    <MasterBar>
      <Bars>1</Bars>
      <Time>4/4</Time>
    </MasterBar>
  </MasterBars>
  <Bars>
    <Bar id="0"><Voices>0</Voices></Bar>
    <Bar id="1"><Voices>1</Voices></Bar>
  </Bars>
  <Voices>
    <Voice id="0"><Beats>0 1</Beats></Voice>
    <Voice id="1"><Beats>2 3</Beats></Voice>
  </Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="1"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="0"/><Notes>2</Notes></Beat>
    <Beat id="3"><Rhythm ref="0"/><Notes>3</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><Properties>
      <Property name="Fret"><Fret>0</Fret></Property>
      <Property name="String"><String>0</String></Property>
      <Property name="Midi"><Number>40</Number></Property>
    </Properties></Note>
    <Note id="1"><Properties>
      <Property name="Fret"><Fret>2</Fret></Property>
      <Property name="String"><String>0</String></Property>
      <Property name="Midi"><Number>42</Number></Property>
    </Properties></Note>
    <Note id="2"><Properties>
      <Property name="Fret"><Fret>3</Fret></Property>
      <Property name="String"><String>0</String></Property>
      <Property name="Midi"><Number>43</Number></Property>
    </Properties></Note>
    <Note id="3"><Properties>
      <Property name="Fret"><Fret>5</Fret></Property>
      <Property name="String"><String>0</String></Property>
      <Property name="Midi"><Number>45</Number></Property>
    </Properties></Note>
  </Notes>
  <Rhythms>
    <Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>
    <Rhythm id="1"><NoteValue>Eighth</NoteValue></Rhythm>
  </Rhythms>
  <Tracks>
    <Track id="0">
      <Name>Lead</Name>
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

const { tracks, tempo } = gpifToTracks(gpif);
assert.equal(tempo, 140);
assert.equal(tracks.length, 1);
const model = tracks[0].model;
assert.ok(model);
assert.equal(model.tempo, 140);
assert.ok(modelHasRhythm(model));
assert.equal(model.events[0].duration, 1);
assert.equal(model.events[1].duration, 0.5);
assert.equal(model.events[1].start, 1);
assert.equal(model.measures[0].marker, 'Intro');
assert.ok(model.totalBeats > 2);

const timed = buildTimedNotes(model, { bpm: 140 });
assert.ok(timed.length >= 4);
assert.ok(Math.abs(timed[0].startSec - 0) < 1e-9);
assert.ok(Math.abs(timed[1].startSec - (60 / 140)) < 1e-9);

// ---- transpose ----
const up = transposeModel(model, 2);
assert.equal(up.events[0].midi, 42);
assert.equal(up.events[0].fret, 2);

// ---- retune preserve pitch ----
const retuned = retuneModel(model, 'Half Step Down', { preservePitch: true });
assert.equal(retuned.events[0].midi, 40);
assert.notEqual(retuned.strings[0].openMidi, model.strings[0].openMidi);

// ---- transform chain ----
const transformed = transformModel(model, { transpose: 1, tuning: 'D Standard', preservePitch: true });
assert.equal(transformed.events[0].midi, 41);

console.log('gp-player smoke: ok');
