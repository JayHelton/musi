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
import { midiToDrumInstrument } from '../../js/tab/gpPercussion.js';
import {
  percussionToPattern,
  buildGpSectionSnippets,
  quantizePercussionToSteps,
} from '../../js/drums/gpDrumImport.js';
import { makePercussionModel } from '../../js/tab/gpPercussion.js';
import { buildFollowColumns } from '../../js/gpFollowView.js';
import { createGpMixPlayer } from '../../js/gpMixPlayer.js';
import { scheduleMetronomeClick } from '../../js/tab/metroClick.js';
import {
  beatsFromMeasureRange,
  measureIndicesForBeats,
  measureIndexAtBeat,
  normalizeBeatRange,
  scopeBounds,
  canPrevMeasure,
  canNextMeasure,
  restartTarget,
} from '../../js/gpPlayer/rangeUtils.js';
import { createPlayerState, resolveInitialBpm } from '../../js/gpPlayer/playerState.js';
import { mountTrackMixer } from '../../js/gpPlayer/trackMixer.js';
import { mountSettingsDrawer } from '../../js/gpPlayer/settingsDrawer.js';
import { mountParchmentView } from '../../js/gpPlayer/parchmentView.js';
import { mountAnnotationsDrawer } from '../../js/gpPlayer/annotationsDrawer.js';
import { createLoopSelectionController } from '../../js/gpPlayer/loopSelection.js';
import { mountGpPlayer } from '../../js/gpPlayerUI.js';

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

// ---- GPIF: single-value tempo (no unit) ----
const gpifSingleTempo = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterTrack>
    <Automations>
      <Automation>
        <Type>Tempo</Type>
        <Bar>0</Bar>
        <Position>0</Position>
        <Value>140</Value>
      </Automation>
    </Automations>
  </MasterTrack>
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
  <Tracks><Track id="0"><Name>T</Name><Staves><Staff><Properties>
    <Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property>
  </Properties></Staff></Staves></Track></Tracks>
</GPIF>`;
const singleTempo = gpifToTracks(gpifSingleTempo);
assert.equal(singleTempo.tempo, 140);
assert.equal(singleTempo.tracks[0].model.tempo, 140);

// ---- GPIF: Sixteenth NoteValue ----
const gpifSixteenth = `<?xml version="1.0" encoding="UTF-8"?>
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
  <Rhythms><Rhythm id="0"><NoteValue>Sixteenth</NoteValue></Rhythm></Rhythms>
  <Tracks><Track id="0"><Name>T</Name><Staves><Staff><Properties>
    <Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property>
  </Properties></Staff></Staves></Track></Tracks>
</GPIF>`;
const sixteenth = gpifToTracks(gpifSixteenth);
assert.equal(sixteenth.tracks[0].model.events[0].duration, 0.25);

// ---- GPIF: 3/4 measure with one quarter → padded to 3 beats ----
const gpif34Pad = `<?xml version="1.0" encoding="UTF-8"?>
<GPIF>
  <MasterBars><MasterBar><Bars>0</Bars><Time>3/4</Time></MasterBar></MasterBars>
  <Bars><Bar id="0"><Voices>0</Voices></Bar></Bars>
  <Voices><Voice id="0"><Beats>0</Beats></Voice></Voices>
  <Beats><Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat></Beats>
  <Notes><Note id="0"><Properties>
    <Property name="Fret"><Fret>0</Fret></Property>
    <Property name="String"><String>0</String></Property>
    <Property name="Midi"><Number>40</Number></Property>
  </Properties></Note></Notes>
  <Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm></Rhythms>
  <Tracks><Track id="0"><Name>T</Name><Staves><Staff><Properties>
    <Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property>
  </Properties></Staff></Staves></Track></Tracks>
</GPIF>`;
const pad34 = gpifToTracks(gpif34Pad);
assert.equal(pad34.tracks[0].model.measures[0].endBeat, 3);
assert.equal(pad34.tracks[0].model.totalBeats, 3);

// ---- transpose ----
const up = transposeModel(model, 2);
assert.equal(up.events[0].midi, 42);
assert.equal(up.events[0].fret, 2);

// ---- retune preserve pitch ----
const retuned = retuneModel(model, 'Half Step Down', { preservePitch: true });
assert.equal(retuned.events[0].midi, 40);
assert.notEqual(retuned.strings[0].openMidi, model.strings[0].openMidi);

// ---- retune keep fingerings (preservePitch false) ----
const fingered = retuneModel(model, 'Half Step Down', { preservePitch: false });
assert.equal(fingered.events[0].fret, model.events[0].fret);
assert.equal(fingered.events[0].stringIndex, model.events[0].stringIndex);
assert.notEqual(fingered.events[0].midi, model.events[0].midi);

// ---- transform chain ----
const transformed = transformModel(model, { transpose: 1, tuning: 'D Standard', preservePitch: true });
assert.equal(transformed.events[0].midi, 41);

// ---- percussion mapping ----
assert.equal(midiToDrumInstrument(36), 'kick');
assert.equal(midiToDrumInstrument(38), 'snare');
assert.equal(midiToDrumInstrument(42), 'hihatClosed');
assert.equal(midiToDrumInstrument(46), 'hihatOpen');
assert.equal(midiToDrumInstrument(49), 'crash');
assert.equal(midiToDrumInstrument(38, { velocity: 0.3 }), 'snareGhost');

const perc = makePercussionModel({
  name: 'Kit',
  tempo: 120,
  events: [
    { slot: 0, start: 0, duration: 0.25, instrument: 'kick', velocity: 0.9, midi: 36 },
    { slot: 0, start: 0, duration: 0.25, instrument: 'hihatClosed', velocity: 0.7, midi: 42 },
    { slot: 1, start: 0.25, duration: 0.25, instrument: 'hihatClosed', velocity: 0.7, midi: 42 },
    { slot: 2, start: 0.5, duration: 0.25, instrument: 'snare', velocity: 0.9, midi: 38 },
    { slot: 2, start: 0.5, duration: 0.25, instrument: 'hihatClosed', velocity: 0.7, midi: 42 },
    { slot: 3, start: 0.75, duration: 0.25, instrument: 'hihatClosed', velocity: 0.7, midi: 42 },
  ],
  measures: [{ startSlot: 0, endSlot: 4, startBeat: 0, endBeat: 1, marker: 'Verse' }],
});
const q = quantizePercussionToSteps(perc, { startBeat: 0, endBeat: 1 });
assert.equal(q.subdivision, '16th');
assert.ok(q.steps.some((s) => s.instrument === 'kick' && s.step === 0));
assert.ok(q.steps.some((s) => s.instrument === 'snare' && s.step === 2));

const pat = percussionToPattern(perc, { title: 'Verse groove', bpm: 120 });
assert.ok(pat.tab.length > 0);
assert.ok(pat.tags.includes('guitar-pro'));

const fakeGp = {
  tempo: 120,
  tracks: [{
    index: 0, name: 'Guitar', tuning: 'Standard', noteCount: 2,
    model: {
      tuning: 'Standard',
      strings: [
        { note: 'E', oct: 2, label: 'E', openMidi: 40 },
        { note: 'A', oct: 2, label: 'A', openMidi: 45 },
        { note: 'D', oct: 3, label: 'D', openMidi: 50 },
        { note: 'G', oct: 3, label: 'G', openMidi: 55 },
        { note: 'B', oct: 3, label: 'B', openMidi: 59 },
        { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      ],
      events: [
        { slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 0, midi: 40, pc: 4, techniques: [], dead: false },
        { slot: 1, start: 1, duration: 1, stringIndex: 0, fret: 3, midi: 43, pc: 7, techniques: [], dead: false },
      ],
      measures: [
        { startSlot: 0, endSlot: 1, startBeat: 0, endBeat: 1, marker: 'Intro' },
        { startSlot: 1, endSlot: 2, startBeat: 1, endBeat: 2, marker: 'Verse' },
      ],
      tempo: 120,
      totalBeats: 2,
    },
  }],
  drumTracks: [{ index: 0, name: 'Drums', model: perc, hitCount: perc.events.length, tempo: 120 }],
};
const psTempo = createPlayerState({ ...fakeGp, tempo: 140, tracks: [{
  ...fakeGp.tracks[0],
  model: { ...fakeGp.tracks[0].model, tempo: 140 },
}] }, { preferredTrackIndex: 0 });
assert.equal(psTempo.state.scoreBpm, 140);
assert.equal(psTempo.state.bpm, 140);
assert.equal(psTempo.state.bpmUserOverride, false);
psTempo.state.bpmUserOverride = true;
psTempo.state.bpm = 100;
psTempo.resetBpm();
assert.equal(psTempo.state.bpm, 140);
assert.equal(psTempo.state.bpmUserOverride, false);
const persistedTempo = psTempo.toPersistable();
assert.equal(persistedTempo.bpm, null);
psTempo.state.bpmUserOverride = true;
psTempo.state.bpm = 100;
assert.equal(psTempo.toPersistable().bpm, 100);
psTempo.destroy();

assert.deepEqual(resolveInitialBpm(null, 140), { apply: false });
assert.deepEqual(resolveInitialBpm(undefined, 140), { apply: false });
assert.deepEqual(resolveInitialBpm(0, 140), { apply: false });
assert.deepEqual(resolveInitialBpm(160, 140), { apply: true, bpm: 160, bpmUserOverride: true });
assert.deepEqual(resolveInitialBpm(140, 140), { apply: true, bpm: 140, bpmUserOverride: false });
assert.deepEqual(resolveInitialBpm(140.4, 140), { apply: true, bpm: 140.4, bpmUserOverride: false });

const snips = buildGpSectionSnippets(fakeGp);
assert.ok(snips.length >= 2);
assert.ok(snips.some((s) => s.hasGuitar && s.hasDrums));

// ---- follow columns ----
const layout = buildFollowColumns({
  guitarModel: fakeGp.tracks[0].model,
  percModel: perc,
  startBeat: 0,
  endBeat: 2,
});
assert.ok(layout.columns.length >= 4);
assert.ok(layout.columns.some((c) => c.frets.some((f) => f != null)));
assert.ok(layout.columns.some((c) => Object.keys(c.drums).length));
assert.ok(layout.columns.some((c) => c.barStart && c.marker === 'Intro'));
const introCol = layout.columns.find((c) => c.barStart && c.marker === 'Intro');
assert.equal(introCol.barNumber, 1);
assert.equal(introCol.measureIndex, 0);
assert.equal(introCol.beatInBar, 0);
const verseCol = layout.columns.find((c) => c.barStart && c.marker === 'Verse');
assert.equal(verseCol?.barNumber, 2);

// ---- loop rest API on mix player ----
const mixLoop = createGpMixPlayer();
mixLoop.load({
  guitarModels: [fakeGp.tracks[0].model],
  drumModels: [perc],
  bpm: 120,
  loopBeats: { startBeat: 0, endBeat: 2 },
  loopRestSec: 2.5,
});
assert.equal(mixLoop.durationSec, 1); // 2 beats at 120 BPM
mixLoop.setLoopRestSec(1);
assert.ok(!mixLoop.playing);

// ---- multi-track mix player: per-track enable + metronome flag ----
const guitarB = {
  tuning: 'Standard',
  strings: fakeGp.tracks[0].model.strings,
  events: [
    { slot: 0, start: 0, duration: 1, stringIndex: 0, fret: 5, midi: 45, pc: 9, techniques: [], dead: false },
  ],
  measures: fakeGp.tracks[0].model.measures,
  tempo: 120,
  totalBeats: 2,
};
const mix = createGpMixPlayer();
mix.load({
  guitarModels: [fakeGp.tracks[0].model, guitarB],
  drumModels: [perc],
  bpm: 120,
  enabledGuitars: [true, false],
  enabledDrums: [true],
  metronomeEnabled: true,
});
assert.equal(mix.enabledGuitars.length, 2);
assert.equal(mix.enabledDrums.length, 1);
assert.equal(mix.metronomeEnabled, true);
assert.ok(mix.events.length >= 4); // first guitar + drums, second guitar muted
mix.setTrackEnabled('guitar', 1, true);
assert.ok(mix.events.length >= 5);
mix.setTrackEnabled('guitar', 0, false);
assert.ok(mix.events.length >= 1);
mix.setMetronomeEnabled(false);
assert.equal(mix.metronomeEnabled, false);
assert.ok(typeof scheduleMetronomeClick === 'function');

// ---- rangeUtils ----
const rangeMeasures = [
  { startBeat: 0, endBeat: 4 },
  { startBeat: 4, endBeat: 8 },
  { startBeat: 8, endBeat: 12 },
];
const beatRange = beatsFromMeasureRange(rangeMeasures, 1, 2);
assert.equal(beatRange.startBeat, 4);
assert.equal(beatRange.endBeat, 12);
const idxRange = measureIndicesForBeats(rangeMeasures, 5, 9);
assert.equal(idxRange.startIdx, 1);
assert.equal(idxRange.endIdx, 2);

const fullScope = scopeBounds({ measureCount: 8 });
assert.deepEqual(fullScope, { start: 0, end: 7 });
const loopScope = scopeBounds({ loopEnabled: true, loopStart: 2, loopEnd: 5, measureCount: 8 });
assert.deepEqual(loopScope, { start: 2, end: 5 });
const exScope = scopeBounds({ exerciseScope: true, loopStart: 1, loopEnd: 3, measureCount: 8 });
assert.deepEqual(exScope, { start: 1, end: 3 });

assert.equal(restartTarget({ measureCount: 8 }), 0);
assert.equal(restartTarget({ loopEnabled: true, loopStart: 2, measureCount: 8 }), 2);
assert.equal(restartTarget({ exerciseScope: true, loopStart: 1, measureCount: 8 }), 1);

const loopNavScope = { start: 2, end: 5 };
assert.equal(canPrevMeasure(2, loopNavScope), false);
assert.equal(canPrevMeasure(3, loopNavScope), true);
assert.equal(canNextMeasure(5, loopNavScope), false);
assert.equal(canNextMeasure(4, loopNavScope), true);

const normOk = normalizeBeatRange(2.2, 5.7, { minSpan: 1, songEndBeat: 12 });
assert.ok(normOk);
assert.equal(normOk.startBeat, 2);
assert.equal(normOk.endBeat, 6);
const normTiny = normalizeBeatRange(5, 5, { minSpan: 1 });
assert.deepEqual(normTiny, { startBeat: 5, endBeat: 6 });
assert.equal(normalizeBeatRange(1, 0, { minSpan: 1, songEndBeat: 0 }), null);

// ---- measureIndexAtBeat (pre-start / in-range / past-end) ----
assert.equal(measureIndexAtBeat(rangeMeasures, -0.1), 0);
assert.equal(measureIndexAtBeat(rangeMeasures, 5), 1);
assert.equal(measureIndexAtBeat(rangeMeasures, 99), 2);

// ---- playerState solo / view / playAll ----
const ps = createPlayerState(fakeGp, { preferredTrackIndex: 0 });
const origGuitars = [...ps.state.enabledGuitars];
const origDrums = [...ps.state.enabledDrums];
ps.setTrackEnabled('guitar', 0, false);
ps.setTrackEnabled('drum', 0, false);
ps.enterSolo('guitar', 0);
const soloMix = ps.getEffectiveEnabled();
assert.equal(soloMix.enabledGuitars.filter(Boolean).length, 1);
assert.equal(soloMix.enabledGuitars[0], true);
assert.equal(soloMix.enabledDrums.filter(Boolean).length, 0);
ps.playAll();
assert.ok(ps.state.enabledGuitars.every(Boolean));
assert.ok(ps.state.enabledDrums.every(Boolean));
assert.equal(ps.state.solo, null);
ps.setViewTrack('drum', 0);
assert.deepEqual(ps.state.enabledGuitars, origGuitars.map(() => true));
assert.deepEqual(ps.state.enabledDrums, origDrums.map(() => true));
ps.setTrackEnabled('guitar', 0, false);
ps.setTrackEnabled('drum', 0, false);
ps.enterSolo('guitar', 0);
ps.leaveSolo();
assert.deepEqual(ps.state.enabledGuitars, [false]);
assert.deepEqual(ps.state.enabledDrums, [false]);
ps.destroy();
assert.ok(ps.state.destroyed);
assert.equal(ps.isAlive(1), false);

const psPersist = createPlayerState(fakeGp, { preferredTrackIndex: 0 });
const persisted = psPersist.toPersistable();
assert.equal(persisted.retuneMode, 'fingerings');
psPersist.destroy();

const psInit = createPlayerState(fakeGp, {
  preferredTrackIndex: 0,
  initialTranspose: 3,
  initialRetuneMode: 'pitches',
});
assert.equal(psInit.state.transpose, 3);
assert.equal(psInit.state.retuneMode, 'pitches');
psInit.destroy();

// ---- trackMixer mount + mix load regression (no AudioContext) ----
function installDomShim() {
  if (typeof document !== 'undefined' && document.querySelector) return;

  function matchesSelector(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith('.')) {
      return (el.className || '').split(/\s+/).filter(Boolean).includes(sel.slice(1));
    }
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('[id$=')) {
      const suffix = sel.match(/^\[id\$=\"([^\"]+)\"\]$/)?.[1];
      return suffix ? String(el.id || '').endsWith(suffix) : false;
    }
    if (sel.startsWith('[aria-label=')) {
      const label = sel.match(/^\[aria-label=\"([^\"]+)\"\]$/)?.[1];
      return label ? el.getAttribute?.('aria-label') === label : false;
    }
    return el.tagName?.toLowerCase() === sel.toLowerCase();
  }

  function querySelector(root, sel) {
    if (matchesSelector(root, sel)) return root;
    for (const child of root.children || []) {
      const hit = querySelector(child, sel);
      if (hit) return hit;
    }
    return null;
  }

  function querySelectorAll(root, sel) {
    const out = [];
    function walk(node) {
      if (matchesSelector(node, sel)) out.push(node);
      for (const child of node.children || []) walk(child);
    }
    walk(root);
    return out;
  }

  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      style: {},
      dataset: {},
      children: [],
      attributes: {},
      parentElement: null,
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      hidden: false,
      clientWidth: 600,
      tabIndex: -1,
      classList: {
        _classes: new Set(),
        add(...c) { c.forEach((x) => this._classes.add(x)); el.className = [...this._classes].join(' '); },
        remove(...c) { c.forEach((x) => this._classes.delete(x)); el.className = [...this._classes].join(' '); },
        toggle(c, force) {
          if (force === true) { this.add(c); return true; }
          if (force === false) { this.remove(c); return false; }
          if (this.contains(c)) { this.remove(c); return false; }
          this.add(c);
          return true;
        },
        contains(c) { return this._classes.has(c); },
      },
      set className(v) {
        this._className = v || '';
        this.classList._classes = new Set(this._className.split(/\s+/).filter(Boolean));
      },
      get className() {
        return this._className || '';
      },
      setAttribute(k, v) {
        this.attributes[k] = v;
        if (k === 'hidden') this.hidden = true;
        if (k === 'id') {
          this.id = v;
          document._byId.set(v, this);
        }
        if (k === 'class') this.className = v;
      },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(c) {
        if (!c) return c;
        this.children.push(c);
        c.parentElement = this;
        if (c.id) document._byId.set(c.id, c);
        return c;
      },
      append(...nodes) { nodes.flat().forEach((n) => this.appendChild(n)); },
      insertBefore(c, ref) {
        const i = this.children.indexOf(ref);
        if (i >= 0) this.children.splice(i, 0, c);
        else this.children.push(c);
        c.parentElement = this;
        return c;
      },
      removeChild(c) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);
        c.parentElement = null;
        return c;
      },
      querySelector(sel) { return querySelector(this, sel); },
      querySelectorAll(sel) { return querySelectorAll(this, sel); },
      closest(sel) {
        let node = this;
        while (node) {
          if (matchesSelector(node, sel)) return node;
          node = node.parentElement;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 };
      },
      contains(node) {
        let cur = node;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      addEventListener(type, fn) {
        if (!el._listeners) el._listeners = {};
        if (!el._listeners[type]) el._listeners[type] = [];
        el._listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (!el._listeners?.[type]) return;
        el._listeners[type] = el._listeners[type].filter((h) => h !== fn);
      },
      dispatch(type, event = {}) {
        for (const fn of el._listeners?.[type] || []) fn.call(el, event);
      },
      click() { this.dispatch('click'); },
      change() { this.dispatch('change'); },
    };
    if (String(tag).toLowerCase() === 'details') {
      Object.defineProperty(el, 'open', {
        get() { return !!el._open; },
        set(v) { el._open = !!v; },
        configurable: true,
      });
    }
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._innerHTML || ''; },
      set(v) {
        el._innerHTML = v;
        el.children = [];
      },
    });
    return el;
  }

  const head = makeEl('head');
  const body = makeEl('body');
  const root = {
    head,
    body,
    _byId: new Map(),
    createElement: makeEl,
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    getElementById(id) { return this._byId.get(id) || null; },
    querySelector(sel) { return querySelector(body, sel) || querySelector(head, sel); },
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.document = root;
  globalThis.window = globalThis.window || globalThis;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {}
    disconnect() {}
  };
  window.requestAnimationFrame = window.requestAnimationFrame || (() => 0);
  window.cancelAnimationFrame = window.cancelAnimationFrame || (() => {});
}

installDomShim();

const psMix = createPlayerState(fakeGp, { preferredTrackIndex: 0 });
const mixState = psMix.state;
psMix.applyTransforms();
const mixPlayer = createGpMixPlayer();
const mixLoadOpts = {
  guitarModels: mixState.gp.tracks.map((t, i) => (
    i === mixState.trackIndex && mixState.viewModel?.strings ? mixState.viewModel : t.model
  )),
  drumModels: (mixState.gp.drumTracks || []).map((d) => d.model),
  bpm: mixState.bpm,
  loopRestSec: mixState.loopRestSec,
  ...psMix.getEffectiveEnabled(),
  metronomeEnabled: !!mixState.metronomeEnabled,
  referenceModel: mixState.viewModel || mixState.gp.drumTracks?.[0]?.model || null,
};
mixPlayer.load(mixLoadOpts);
assert.ok(mixPlayer.events.length > 0, 'mix player should have events after load');

const mixerHost = document.createElement('div');
const mixer = mountTrackMixer(mixerHost, { stateController: psMix });
assert.ok(typeof mixer.sync === 'function');
assert.ok(mixerHost.children.length > 0);
mixer.destroy();
psMix.destroy();

// ---- settingsDrawer: single shared body + collapsible sections ----
const psSet = createPlayerState(fakeGp, { preferredTrackIndex: 0 });
const settingsHost = document.createElement('div');
const settings = mountSettingsDrawer(settingsHost, {
  stateController: psSet,
  uidPrefix: 'smoke-set',
});
assert.ok(typeof settings.sync === 'function');
const settingsSections = settingsHost.querySelectorAll('.gpp-settings-section');
assert.ok(settingsSections.length >= 4, 'settings should have collapsible sections');
const settingsBodies = settingsHost.querySelectorAll('.gpp-settings-body');
assert.equal(settingsBodies.length, 1, 'drawer and sheet should share one control body');
const bpmInput = settingsHost.querySelector('[id$="-bpm"]');
assert.ok(bpmInput, 'tempo input should exist');
assert.ok(!settingsHost.querySelector('.gpp-analysis-results'), 'settings drawer must not host analysis');
settings.sync();
settings.destroy();
psSet.destroy();

// ---- mountGpPlayer: tempo defaults + inline analysis outside chrome ----
const gpHost = document.createElement('div');
const mounted = mountGpPlayer(gpHost, { gpResult: fakeGp, title: 'Smoke GP' });
assert.equal(mounted.getState().bpm, 120);
assert.equal(mounted.getState().scoreBpm, 120);
assert.equal(mounted.getState().bpmUserOverride, false);
assert.ok(gpHost.querySelector('.gpp-chrome'), 'player should wrap chrome');
const analysisPanel = gpHost.querySelector('.gpp-analysis');
assert.ok(analysisPanel, 'inline analysis details should exist');
assert.ok(!gpHost.querySelector('.gpp-chrome .gpp-analysis'), 'analysis must sit outside chrome');
const analyzeHeaderBtn = [...gpHost.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Analyze score',
);
assert.ok(analyzeHeaderBtn, 'header Analyze button should exist');
mounted.destroy();

const mountedNullBpm = mountGpPlayer(gpHost, { gpResult: fakeGp, title: 'Smoke GP', initialBpm: null });
assert.equal(mountedNullBpm.getState().bpm, 120);
assert.equal(mountedNullBpm.getState().bpmUserOverride, false);
mountedNullBpm.destroy();

const mounted140 = mountGpPlayer(gpHost, {
  gpResult: { ...fakeGp, tempo: 140, tracks: [{ ...fakeGp.tracks[0], model: { ...fakeGp.tracks[0].model, tempo: 140 } }] },
  title: 'Smoke GP 140',
});
assert.equal(mounted140.getState().bpm, 140);
assert.equal(mounted140.getState().bpmUserOverride, false);
mounted140.destroy();

// ---- parchment mount: viewport + measures ----
const parchHost = document.createElement('div');
const parchment = mountParchmentView(parchHost, {
  guitarModel: fakeGp.tracks[0].model,
  percModel: perc,
});
assert.ok(parchHost.querySelector('.gpp-parch-viewport'), 'parchment viewport should mount');
assert.ok(parchHost.querySelectorAll('.gpp-parch-measure').length >= 1, 'parchment should render measures');
assert.ok(parchHost.querySelector('.gpp-parch-sheet'), 'parchment sheet should exist');
assert.ok(parchHost.querySelector('.gpp-parch-system'), 'parchment system row should exist');
assert.equal(document.getElementById('gpp-parch-styles'), null, 'parchment should not inject inline styles');
parchment.destroy();

// ---- loopSelection: syncFromState gates on loopEnabled ----
const loopParchment = {
  selection: undefined,
  loopSelectMode: undefined,
  setSelection(sel) { this.selection = sel; },
  setLoopSelectMode(on) { this.loopSelectMode = on; },
};
const loopCtrlOff = createLoopSelectionController({
  getState: () => ({
    loopEnabled: false,
    loopSelectMode: false,
    loopStartBeat: 0,
    loopEndBeat: 8,
  }),
  parchment: loopParchment,
});
loopCtrlOff.syncFromState();
assert.equal(loopParchment.selection, null, 'loop disabled should clear parchment selection');

const loopCtrlOn = createLoopSelectionController({
  getState: () => ({
    loopEnabled: true,
    loopSelectMode: true,
    loopStartBeat: 0,
    loopEndBeat: 8,
  }),
  parchment: loopParchment,
});
loopCtrlOn.syncFromState();
assert.deepEqual(loopParchment.selection, { startBeat: 0, endBeat: 8 }, 'loop enabled should paint selection');
assert.equal(loopParchment.loopSelectMode, true, 'loop select mode should sync from state');

// ---- settingsDrawer: bar dropdown enables loop ----
const psLoopDrop = createPlayerState(fakeGp, { preferredTrackIndex: 0 });
psLoopDrop.state.loopEnabled = false;
const loopDropHost = document.createElement('div');
const loopDropDrawer = mountSettingsDrawer(loopDropHost, {
  stateController: psLoopDrop,
  uidPrefix: 'smoke-loop-drop',
});
const loopStartSel = loopDropHost.querySelector('[id$="-loop-start"]');
const loopEndSel = loopDropHost.querySelector('[id$="-loop-end"]');
assert.ok(loopStartSel && loopEndSel, 'loop bar selects should exist');
assert.equal(psLoopDrop.state.loopStart, 0, 'default loop start should be first bar');
assert.equal(psLoopDrop.state.loopEnd, 1, 'fakeGp has two bars (indices 0–1)');
loopEndSel.value = '0';
loopEndSel.change();
assert.equal(psLoopDrop.state.loopEnabled, true, 'changing loop end bar should enable loop');
assert.equal(psLoopDrop.state.loopStart, 0);
assert.equal(psLoopDrop.state.loopEnd, 0, 'bar 1 only range');
assert.equal(psLoopDrop.state.loopStartBeat, 0);
assert.equal(psLoopDrop.state.loopEndBeat, 1);
loopDropDrawer.destroy();
psLoopDrop.destroy();

// ---- annotationsDrawer: Add note hints ----
const annoHost = document.createElement('div');
let currentSelection = null;
const annoDrawer = mountAnnotationsDrawer(annoHost, {
  getScoreKey: () => 'smoke-score',
  getAnnotations: () => [],
  getCurrentSelection: () => currentSelection,
});
const addBtn = annoHost.querySelector('.gpp-anno-add-btn');
const selectHintEl = annoHost.querySelector('.gpp-anno-select-hint');
const emptyHintEl = [...annoHost.querySelectorAll('.gpp-anno-hint')].find(
  (n) => !n.className.includes('gpp-anno-select-hint') && !n.className.includes('gpp-anno-no-key'),
);
assert.ok(addBtn && selectHintEl && emptyHintEl, 'annotations drawer hints should mount');
assert.equal(selectHintEl.hidden, true);
assert.equal(emptyHintEl.hidden, false);
addBtn.click();
assert.equal(selectHintEl.hidden, false, 'no selection should show select hint');
assert.equal(emptyHintEl.hidden, true, 'generic empty hint should hide when select hint shows');
assert.equal(selectHintEl.getAttribute('role'), 'status');
assert.equal(selectHintEl.getAttribute('aria-live'), 'polite');
currentSelection = {
  startBeat: 0,
  endBeat: 1,
  measureStart: 0,
  measureEnd: 0,
};
addBtn.click();
assert.equal(selectHintEl.hidden, true, 'selection should clear select hint');
assert.ok(annoHost.querySelector('.gpp-anno-editor')?.hidden === false, 'editor should open with selection');
annoDrawer.destroy();

// ---- mountGpPlayer: exercise scope supplies note selection without loop ----
const exHost = document.createElement('div');
const exPlayer = mountGpPlayer(exHost, {
  gpResult: fakeGp,
  title: 'Exercise scope',
  exerciseScope: true,
  initialLoopEnabled: false,
  initialLoopStart: 1,
  initialLoopEnd: 1,
  scoreKey: 'smoke-exercise',
});
assert.equal(exPlayer.getState().loopEnabled, false);
assert.equal(exPlayer.getState().exerciseScope, true);
assert.equal(exPlayer.getState().loopStart, 1);
const exNotesBtn = [...exHost.querySelectorAll('button')].find(
  (b) => b.getAttribute?.('aria-label') === 'Section notes',
);
assert.ok(exNotesBtn, 'section notes button should exist');
exNotesBtn.click();
const exAddBtn = exHost.querySelector('.gpp-anno-add-btn');
assert.ok(exAddBtn, 'Add note button should mount in annotations drawer');
exAddBtn.click();
const exEditorMeta = exHost.querySelector('.gpp-anno-editor-meta');
assert.equal(exEditorMeta?.textContent, 'Bar 2', 'exercise scope bar 2 should seed editor metadata');
assert.ok(exHost.querySelector('.gpp-anno-editor')?.hidden === false, 'editor should open with exercise scope selection');
exPlayer.destroy();

console.log('gp-player smoke: ok');
