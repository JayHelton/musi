// Score layout contract checks for the GP player overhaul.
// Run: node tests/gp-player/score-layout.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import {
  assignArcStackLevels,
  beatFromXUnits,
  beatXUnits,
  buildOverlayPaths,
  fitScaleForBar,
  layoutScore,
  maxAtomicWidthUnits,
  ROW_CHROME_UNITS,
  scaleThatFits,
} from '../../js/gpPlayer/scoreLayout.js';
import { makeFixtures } from './fixtures/makeFixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');

const FR021_TECHNIQUES = [
  'bend', 'slide', 'hammer', 'pull', 'vibrato', 'palmMute', 'harmonic',
  'tap', 'slap', 'pop', 'trill', 'tremolo', 'dead',
];

const TECHNIQUE_ARIA_PREFIX = {
  bend: 'Bend',
  slide: 'Slide',
  hammer: 'Hammer-on',
  pull: 'Pull-off',
  vibrato: 'Vibrato',
  palmMute: 'Palm mute',
  harmonic: 'Harmonic',
  tap: 'Tap',
  slap: 'Slap',
  pop: 'Pop',
  trill: 'Trill',
  tremolo: 'Tremolo',
  dead: 'Dead note',
};

function fixtureBytes(name) {
  return readFileSync(join(FIXTURE_DIR, name));
}

function ensureFixtures() {
  if (!existsSync(join(FIXTURE_DIR, 'techniques.gp5'))) {
    makeFixtures();
  }
}

function countGlyphs(layout, kinds) {
  const set = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  let n = 0;
  for (const bar of layout.bars) {
    for (const g of bar.glyphs) {
      if (set.has(g.kind)) n += 1;
    }
  }
  return n;
}

function beatsInModel(model) {
  return (model.beats || []).filter((b) => !b.rest).length
    + (model.beats || []).filter((b) => b.rest).length
    + (model.rests || []).length;
}

function rhythmGlyphs(layout) {
  return countGlyphs(layout, ['stem', 'flag', 'beam', 'dot', 'tupletBracket']);
}

function techniqueCoverage(layout, model) {
  const fileCounts = { ...model.techniqueCounts };
  if ((model.events || []).some((e) => e.dead)) {
    fileCounts.dead = Math.max(fileCounts.dead || 0, 1);
  }
  let fileTotal = 0;
  for (const tech of FR021_TECHNIQUES) {
    fileTotal += fileCounts[tech] || 0;
  }

  const drawn = new Set();
  for (const bar of layout.bars) {
    for (const g of bar.glyphs) {
      if (g.kind === 'technique') {
        for (const [tech, prefix] of Object.entries(TECHNIQUE_ARIA_PREFIX)) {
          if (tech === 'dead') continue;
          if (g.aria?.startsWith(prefix)) drawn.add(tech);
        }
      }
      if (g.kind === 'deadNote') drawn.add('dead');
    }
  }

  let drawnTotal = 0;
  for (const tech of FR021_TECHNIQUES) {
    if (drawn.has(tech)) drawnTotal += fileCounts[tech] || (tech === 'dead' ? 1 : 0);
  }

  const ratio = fileTotal > 0 ? drawnTotal / fileTotal : 1;
  return { fileTotal, drawnTotal, ratio, drawn: [...drawn] };
}

async function layoutForFixture(name, extraOptions = {}) {
  const result = await parseGuitarPro(fixtureBytes(name));
  const model = result.tracks[0].model;
  const layout = layoutScore(model, {
    widthPx: 900,
    zoom: 1,
    showRhythm: true,
    showNotationStaff: false,
    drumMode: false,
    minFretFontPx: 12,
    ...extraOptions,
  });
  return { model, layout };
}

function availableWidthPx(widthPx) {
  return Math.max(100, widthPx - ROW_CHROME_UNITS);
}

function denseEightBarTripletModel() {
  const strings = [
    { note: 'E', oct: 4, label: 'E', openMidi: 64 },
    { note: 'B', oct: 3, label: 'B', openMidi: 59 },
    { note: 'G', oct: 3, label: 'G', openMidi: 55 },
    { note: 'D', oct: 3, label: 'D', openMidi: 50 },
    { note: 'A', oct: 2, label: 'A', openMidi: 45 },
    { note: 'E', oct: 2, label: 'E', openMidi: 40 },
  ];
  const beats = [];
  const events = [];
  const measures = [];
  const notesPerBar = 24;
  const noteDuration = 4 / notesPerBar;

  for (let bar = 0; bar < 8; bar += 1) {
    measures.push({
      startBeat: bar * 4,
      endBeat: (bar + 1) * 4,
      timeSig: [4, 4],
    });
    for (let n = 0; n < notesPerBar; n += 1) {
      const start = bar * 4 + n * noteDuration;
      const stringIndex = n % 6;
      const idx = events.length;
      events.push({
        start,
        stringIndex,
        fret: (n % 12) + 1,
        dead: false,
        duration: noteDuration,
      });
      beats.push({
        measureIndex: bar,
        voiceIndex: 0,
        start,
        duration: noteDuration,
        noteValue: 16,
        dots: 0,
        tuplet: { num: 3, den: 2 },
        rest: false,
        noteIndices: [idx],
      });
    }
  }

  return {
    tuning: 'Standard',
    strings,
    events,
    beats,
    measures,
  };
}

function denseTwoDigitSixteenthModel() {
  const beats = Array.from({ length: 16 }, (_, i) => ({
    measureIndex: 0,
    voiceIndex: 0,
    start: i * 0.25,
    duration: 0.25,
    noteValue: 16,
    dots: 0,
    tuplet: null,
    rest: false,
    noteIndices: [i],
  }));
  const events = beats.map((beat, i) => ({
    start: i * 0.25,
    stringIndex: 0,
    fret: 12,
    dead: false,
    duration: 0.25,
  }));
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events,
    beats,
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

function sparseOneNotePerBarModel() {
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events: [{ start: 0, stringIndex: 0, fret: 3, dead: false, duration: 4 }],
    beats: [{
      measureIndex: 0,
      voiceIndex: 0,
      start: 0,
      duration: 4,
      noteValue: 1,
      dots: 0,
      tuplet: null,
      rest: false,
      noteIndices: [0],
    }],
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

function mixedDurationBurstModel() {
  const events = [
    { start: 0, stringIndex: 0, fret: 5, dead: false, duration: 2 },
  ];
  const beats = [{
    measureIndex: 0,
    voiceIndex: 0,
    start: 0,
    duration: 2,
    noteValue: 2,
    dots: 0,
    tuplet: null,
    rest: false,
    noteIndices: [0],
  }];
  const frets = [17, 22, 17, 22, 17, 22, 17, 22];
  let beatStart = 2;
  for (let i = 0; i < frets.length; i += 1) {
    const start = beatStart + i * 0.125;
    const idx = events.length;
    events.push({
      start,
      stringIndex: 0,
      fret: frets[i],
      dead: false,
      duration: 0.125,
      techniques: i === 2 ? ['tap'] : [],
    });
    beats.push({
      measureIndex: 0,
      voiceIndex: 0,
      start,
      duration: 0.125,
      noteValue: 32,
      dots: 0,
      tuplet: null,
      rest: false,
      noteIndices: [idx],
      techniques: i === 2 ? ['tap'] : [],
    });
  }
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events,
    beats,
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

function noteOverlapGap(bar) {
  const noteKinds = new Set(['fret', 'deadNote', 'drumHit']);
  const notes = bar.glyphs
    .filter((g) => noteKinds.has(g.kind))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  let minGap = Infinity;
  for (let i = 1; i < notes.length; i += 1) {
    if (Math.abs(notes[i].y - notes[i - 1].y) > 0.01) continue;
    const gap = notes[i].x - (notes[i - 1].x + notes[i - 1].w);
    assert.ok(gap >= 0, `bar ${bar.barIndex} note text overlaps by ${(-gap).toFixed(2)} units`);
    minGap = Math.min(minGap, gap);
  }
  return minGap === Infinity ? Infinity : minGap;
}

function layoutForModel(model, extraOptions = {}) {
  return layoutScore(model, {
    widthPx: 900,
    zoom: 1,
    showRhythm: true,
    showNotationStaff: false,
    drumMode: false,
    minFretFontPx: 12,
    ...extraOptions,
  });
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w - 1e-6
    && b.x < a.x + a.w - 1e-6
    && a.y < b.y + b.h - 1e-6
    && b.y < a.y + a.h - 1e-6;
}

function firstBarWithTuplets(layout) {
  for (const bar of layout.bars) {
    const count = bar.glyphs.filter((g) => g.kind === 'tupletBracket').length;
    if (count > 0) return bar;
  }
  return null;
}

function eighthTripletPalmMuteModel() {
  const events = [0, 0.333, 0.667].map((start, i) => ({
    start,
    stringIndex: 0,
    fret: 5 + i,
    duration: 0.333,
    techniques: ['palmMute'],
  }));
  const beats = events.map((ev, i) => ({
    measureIndex: 0,
    voiceIndex: 0,
    start: ev.start,
    duration: 0.333,
    noteValue: 8,
    dots: 0,
    tuplet: { num: 3, den: 2 },
    rest: false,
    noteIndices: [i],
  }));
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events,
    beats,
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

function hammerOnChainModel() {
  const events = [0, 1, 2, 3].map((beat, i) => ({
    start: beat,
    stringIndex: 0,
    fret: 5 + i,
    duration: 1,
    techniques: i > 0 ? ['hammer'] : [],
  }));
  const beats = events.map((ev, i) => ({
    measureIndex: 0,
    voiceIndex: 0,
    start: ev.start,
    duration: 1,
    noteValue: 4,
    dots: 0,
    tuplet: null,
    rest: false,
    noteIndices: [i],
  }));
  return {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events,
    beats,
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

function smallDrumModel() {
  const events = [
    { start: 0, instrument: 'kick', duration: 1 },
    { start: 0.5, instrument: 'snare', duration: 1 },
    { start: 1, instrument: 'hihatClosed', duration: 1 },
    { start: 1.5, instrument: 'crash', duration: 1 },
  ];
  const beats = [
    { measureIndex: 0, voiceIndex: 0, start: 0, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [0] },
    { measureIndex: 0, voiceIndex: 0, start: 1, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [2] },
    { measureIndex: 0, voiceIndex: 0, start: 2, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [3] },
  ];
  return {
    percussion: true,
    name: 'Drums',
    events,
    beats,
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
}

ensureFixtures();

// ties-rhythm.gp5 — rhythm marks and rests
{
  const { model, layout } = await layoutForFixture('ties-rhythm.gp5');
  const beatCount = model.beats.length;
  const rhythmCount = rhythmGlyphs(layout);
  assert.ok(rhythmCount >= beatCount, `rhythm glyphs (${rhythmCount}) >= beats (${beatCount})`);
  const restCount = countGlyphs(layout, 'rest');
  const restKeys = new Set([
    ...model.beats.filter((b) => b.rest).map((b) => `${b.measureIndex}:${b.start}`),
    ...(model.rests || []).map((r) => `${r.measureIndex}:${r.start}`),
  ]);
  const expectedRests = restKeys.size;
  assert.ok(restCount >= expectedRests, `rest glyphs (${restCount}) >= expected (${expectedRests})`);
  assert.ok(countGlyphs(layout, 'dot') >= 1, 'dotted note dot glyph');
  assert.ok(countGlyphs(layout, 'tupletBracket') >= 1, 'tuplet bracket glyph');
}

// ties-rhythm.gp5 — one tuplet bracket per group, below stems, no overlap
{
  const { layout } = await layoutForFixture('ties-rhythm.gp5', { widthPx: 360 });
  const bar = firstBarWithTuplets(layout);
  assert.ok(bar, 'a bar with tuplets exists');
  const tuplets = bar.glyphs.filter((g) => g.kind === 'tupletBracket');
  assert.equal(tuplets.length, 1, 'one tuplet bracket per triplet group, not one per beat');

  const rhythm = bar.lanes.find((l) => l.name === 'rhythm');
  assert.ok(rhythm, 'rhythm lane exists');
  const conflictKinds = new Set(['stem', 'flag', 'beam', 'dot', 'technique']);
  const conflicts = bar.glyphs.filter((g) => conflictKinds.has(g.kind));

  for (const tuplet of tuplets) {
    assert.ok(
      tuplet.y + tuplet.h <= rhythm.y + rhythm.h + 0.01,
      `tuplet bottom (${tuplet.y + tuplet.h}) must stay inside rhythm lane (${rhythm.y + rhythm.h})`,
    );
    for (const other of conflicts) {
      assert.ok(
        !boxesOverlap(tuplet, other),
        `tuplet overlaps ${other.kind} at beat ${other.beatStart}`,
      );
    }
  }

  const stems = bar.glyphs.filter((g) => g.kind === 'stem');
  const beams = bar.glyphs.filter((g) => g.kind === 'beam');
  const rhythmBottoms = [...stems, ...beams].map((g) => g.y + g.h);
  if (rhythmBottoms.length) {
    const lowest = Math.max(...rhythmBottoms);
    for (const tuplet of tuplets) {
      assert.ok(
        tuplet.y >= lowest - 0.01,
        `tuplet y (${tuplet.y}) must sit below stems and beams (bottom ${lowest})`,
      );
    }
  }
}

// Inline triplet model with palm mute — one bracket, clear of technique lane
{
  const layout = layoutForModel(eighthTripletPalmMuteModel(), { widthPx: 360 });
  const bar = layout.bars[0];
  const tuplets = bar.glyphs.filter((g) => g.kind === 'tupletBracket');
  assert.equal(tuplets.length, 1, 'one tuplet bracket for three triplet eighths');

  const rhythm = bar.lanes.find((l) => l.name === 'rhythm');
  const techBelow = bar.lanes.find((l) => l.name === 'techniqueBelow');
  assert.ok(rhythm && techBelow, 'rhythm and techniqueBelow lanes exist');
  assert.ok(
    techBelow.y >= rhythm.y + rhythm.h - 0.01,
    'techniqueBelow starts below the rhythm lane',
  );

  const techGlyphs = bar.glyphs.filter((g) => g.kind === 'technique');
  for (const tuplet of tuplets) {
    for (const tech of techGlyphs) {
      assert.ok(!boxesOverlap(tuplet, tech), 'tuplet must not overlap technique glyph');
    }
  }
}

// meter-change.gp5 — time signatures at first bar and at change
{
  const { layout } = await layoutForFixture('meter-change.gp5');
  const timeGlyphs = layout.bars.flatMap((b) => b.glyphs.filter((g) => g.kind === 'timeSig'));
  assert.equal(timeGlyphs.length, 2, 'time signature at bar 0 and bar 16');
  const bar0 = layout.bars[0].glyphs.find((g) => g.kind === 'timeSig');
  const bar16 = layout.bars[16].glyphs.find((g) => g.kind === 'timeSig');
  assert.ok(bar0?.text?.includes('6'), 'bar 0 time sig text');
  assert.ok(bar16?.text?.includes('4'), 'bar 16 time sig text');
}

// repeat-endings.gp5 — repeat marks and volta brackets
{
  const { layout } = await layoutForFixture('repeat-endings.gp5');
  assert.ok(countGlyphs(layout, 'repeatOpen') >= 1, 'repeat open glyph');
  assert.ok(countGlyphs(layout, 'repeatClose') >= 1, 'repeat close glyph');
  assert.ok(countGlyphs(layout, 'volta') >= 1, 'volta bracket glyph');
}

// techniques.gp5 — technique coverage and bend amounts
let techniqueReport = null;
{
  const { model, layout } = await layoutForFixture('techniques.gp5');
  techniqueReport = techniqueCoverage(layout, model);
  assert.ok(
    techniqueReport.ratio >= 0.95,
    `technique coverage ${(techniqueReport.ratio * 100).toFixed(1)}% (${techniqueReport.drawnTotal}/${techniqueReport.fileTotal})`,
  );
  assert.ok(countGlyphs(layout, 'bendValue') >= 1, 'bend amount glyph');
}

// seven-string and eight-string — every string row gets a fret lane
{
  for (const name of ['seven-string.gp5', 'eight-string.gp5']) {
    const { model, layout } = await layoutForFixture(name);
    const stringCount = model.strings.length;
    const fretGlyphs = countGlyphs(layout, 'fret');
    assert.ok(fretGlyphs >= 1, `${name}: fret glyph`);
    const tabLane = layout.bars[0].lanes.find((l) => l.name === 'tabStaff');
    assert.ok(tabLane, `${name}: tabStaff lane`);
    assert.ok(tabLane.h >= stringCount * 10, `${name}: tabStaff height fits ${stringCount} strings`);
  }
}

// odd-meter-13-16.gp5 — bar width follows 13 sixteenth notes
{
  const { model, layout } = await layoutForFixture('odd-meter-13-16.gp5');
  assert.equal(model.beats.length, 13, '13 beats in odd meter bar');
  assert.ok(layout.bars[0].widthUnits >= 13, 'bar width scales with 13 notes');
}

// FR-030 — font floor at 360 CSS pixels wide
{
  const { model } = await layoutForFixture('techniques.gp5');
  const narrow = layoutScore(model, {
    widthPx: 360,
    zoom: 1,
    showRhythm: true,
    showNotationStaff: false,
    drumMode: false,
    minFretFontPx: 12,
  });
  assert.ok(narrow.fontPx >= 12, `fontPx at 360px is ${narrow.fontPx}, need >= 12`);
  assert.ok(narrow.bars[0].fontPx >= 12, `bar fontPx at 360px is ${narrow.bars[0].fontPx}`);
}

// Optional standard notation staff lane
{
  const { layout } = await layoutForFixture('techniques.gp5', { showNotationStaff: true });
  const notationLane = layout.bars[0].lanes.find((l) => l.name === 'notationStaff');
  assert.ok(notationLane, 'notationStaff lane when enabled');
  const octaveDown = layout.bars[0].glyphs.find(
    (g) => g.lane === 'notationStaff' && g.text?.includes('8'),
  );
  assert.ok(octaveDown, 'octave-down marker on notation staff');
}

// layoutScore returns systems
{
  const { layout } = await layoutForFixture('meter-change.gp5');
  assert.ok(Array.isArray(layout.systems) && layout.systems.length >= 1, 'systems array');
  const covered = layout.systems.flatMap((s) => s.barIndices);
  assert.equal(covered.length, layout.bars.length, 'systems cover every bar');
}

// A phone row holds one measure only.
{
  const fixtures = ['large-200bar.gp5', 'meter-change.gp5', 'ties-rhythm.gp5'];
  for (const name of fixtures) {
    const { layout } = await layoutForFixture(name, { widthPx: 360 });
    for (const sys of layout.systems) {
      assert.equal(
        sys.barIndices.length,
        1,
        `${name} at 360 CSS pixels wide must hold one measure in each row`,
      );
    }
  }
  // A wide screen may hold several measures in one row.
  const wide = await layoutForFixture('large-200bar.gp5', { widthPx: 1600 });
  assert.ok(
    wide.layout.systems.some((s) => s.barIndices.length > 1),
    'a wide screen may hold several measures in one row',
  );
}

// No note text may touch the next note text on the same string, and no note
// text may reach into the rhythm lane below the tab staff.
{
  const fixtures = [
    'techniques.gp5', 'ties-rhythm.gp5', 'meter-change.gp5',
    'odd-meter-13-16.gp5', 'two-voices.gp5', 'seven-string.gp5',
  ];
  const noteKinds = new Set(['fret', 'deadNote', 'drumHit']);
  for (const name of fixtures) {
    for (const widthPx of [360, 414, 900, 1600]) {
      const { layout } = await layoutForFixture(name, { widthPx });
      for (const bar of layout.bars) {
        const notes = bar.glyphs
          .filter((g) => noteKinds.has(g.kind))
          .sort((a, b) => a.y - b.y || a.x - b.x);
        for (let i = 1; i < notes.length; i += 1) {
          if (Math.abs(notes[i].y - notes[i - 1].y) > 0.01) continue;
          const gap = notes[i].x - (notes[i - 1].x + notes[i - 1].w);
          assert.ok(
            gap >= 0,
            `${name} at ${widthPx} px: bar ${bar.barIndex} note text overlaps by ${(-gap).toFixed(2)} units`,
          );
        }
        const rhythm = bar.lanes.find((l) => l.name === 'rhythm');
        if (!rhythm) continue;
        for (const note of notes) {
          assert.ok(
            note.y + note.h <= rhythm.y + 0.01,
            `${name} at ${widthPx} px: bar ${bar.barIndex} note text reaches into the rhythm lane`,
          );
        }
      }
    }
  }
}

// A lane must hold its own glyphs, and two lanes must never overlap. When a
// glyph reaches past its lane, the rhythm ticks land on the fret numbers.
{
  const fixtures = ['techniques.gp5', 'ties-rhythm.gp5', 'meter-change.gp5', 'two-voices.gp5'];
  for (const name of fixtures) {
    for (const widthPx of [360, 900]) {
      const { layout } = await layoutForFixture(name, { widthPx });
      for (const bar of layout.bars) {
        for (let i = 1; i < bar.lanes.length; i += 1) {
          const prev = bar.lanes[i - 1];
          const lane = bar.lanes[i];
          assert.ok(
            lane.y >= prev.y + prev.h - 0.01,
            `${name} at ${widthPx} px: lane ${lane.name} starts inside lane ${prev.name}`,
          );
        }
        const laneByName = new Map(bar.lanes.map((l) => [l.name, l]));
        for (const glyph of bar.glyphs) {
          const lane = laneByName.get(glyph.lane);
          if (!lane) continue;
          assert.ok(
            glyph.y >= lane.y - 0.01 && glyph.y + glyph.h <= lane.y + lane.h + 0.01,
            `${name} at ${widthPx} px: a ${glyph.kind} glyph reaches past lane ${glyph.lane}`,
          );
        }
      }
    }
  }
}

// A dense bar wraps at column boundaries on a narrow row. minWidthUnits must stay stable.
{
  const model = denseTwoDigitSixteenthModel();
  const narrowWidthPx = 340;
  const narrow = layoutForModel(model, { widthPx: narrowWidthPx });
  const wide = layoutForModel(model, { widthPx: 1600 });
  const rowWidth = availableWidthPx(narrowWidthPx);

  for (const bar of narrow.bars) {
    assert.ok(
      bar.widthUnits >= bar.minWidthUnits - 0.01,
      `bar ${bar.barIndex} width (${bar.widthUnits}) must be >= minWidthUnits (${bar.minWidthUnits})`,
    );
    assert.ok(bar.widthUnits >= 96, 'bar width must stay above MIN_BAR_UNITS');
    noteOverlapGap(bar);
  }

  assert.ok(
    narrow.bars[0].widthUnits > rowWidth + 0.01,
    `full bar (${narrow.bars[0].widthUnits}) is still wider than the row (${rowWidth})`,
  );

  assert.ok(
    narrow.systems.length >= 2,
    `dense 16th bar must wrap onto at least 2 systems (got ${narrow.systems.length})`,
  );

  for (const sys of narrow.systems) {
    for (const part of sys.parts) {
      assert.ok(
        part.layout.widthUnits <= sys.widthPx + 0.5,
        `part width (${part.layout.widthUnits}) must not exceed system width (${sys.widthPx})`,
      );
    }
  }

  const fullFretCount = narrow.bars[0].glyphs.filter((g) => g.kind === 'fret').length;
  let partFretCount = 0;
  for (const sys of narrow.systems) {
    for (const part of sys.parts) {
      partFretCount += part.layout.glyphs.filter((g) => g.kind === 'fret').length;
    }
  }
  assert.equal(partFretCount, fullFretCount, 'every fret glyph of the full bar appears in some part');

  const firstPart = narrow.systems[0].parts[0];
  assert.ok(
    firstPart.layout.glyphs.some((g) => g.kind === 'barNumber'),
    'first part must have a barNumber glyph',
  );

  for (let si = 1; si < narrow.systems.length; si += 1) {
    const part = narrow.systems[si].parts[0];
    assert.equal(part.isContinuation, true, `system ${si} must be a continuation`);
    assert.ok(
      !part.layout.glyphs.some((g) => g.kind === 'barNumber'),
      `continuation part ${si} must not have a barNumber glyph`,
    );
  }

  assert.equal(
    narrow.bars[0].minWidthUnits,
    wide.bars[0].minWidthUnits,
    'minWidthUnits must not change when widthPx changes',
  );

  const sparse = layoutForModel(sparseOneNotePerBarModel(), { widthPx: narrowWidthPx });
  assert.ok(
    Math.abs(sparse.bars[0].widthUnits - rowWidth) <= 1,
    `a sparse bar (${sparse.bars[0].widthUnits}) must fill the row (${rowWidth})`,
  );
}

// Focused wrap test: dense two-digit 16ths at 340px.
{
  const model = denseTwoDigitSixteenthModel();
  const layout = layoutForModel(model, { widthPx: 340 });
  assert.ok(layout.systems.length > 1, 'dense bar wraps to more than one system');
  for (const sys of layout.systems) {
    assert.deepEqual(sys.barIndices, [0], 'each wrap system holds bar 0 only');
    assert.equal(sys.parts.length, 1, 'each wrap system has one part');
  }

  const colRanges = layout.systems.map((s) => {
    const p = s.parts[0];
    return { start: p.colStart, end: p.colEnd };
  });
  colRanges.sort((a, b) => a.start - b.start);
  assert.equal(colRanges[0].start, 0, 'first fragment starts at column 0');
  assert.equal(
    colRanges[colRanges.length - 1].end,
    layout.bars[0].columns.length,
    'last fragment ends at column count',
  );
  for (let i = 1; i < colRanges.length; i += 1) {
    assert.equal(
      colRanges[i].start,
      colRanges[i - 1].end,
      `column ranges must be contiguous at index ${i}`,
    );
  }

  const contPart = layout.systems[1].parts[0];
  const firstColX = contPart.layout.columns[0].x;
  assert.ok(
    firstColX < 30,
    `continuation first column x (${firstColX}) must be near the start pad, not the original large x`,
  );

  for (const sys of layout.systems) {
    const part = sys.parts[0];
    for (const g of part.layout.glyphs) {
      assert.ok(
        g.x + g.w <= part.layout.widthUnits + 0.5,
        `a ${g.kind} glyph must not extend past the fragment width`,
      );
    }
  }
}

// Mixed-duration bar: long note then a burst of two-digit 32nds.
{
  const model = mixedDurationBurstModel();
  for (const widthPx of [360, 900]) {
    const layout = layoutForModel(model, { widthPx });
    const bar = layout.bars[0];
    const minGap = noteOverlapGap(bar);
    assert.ok(
      bar.widthUnits >= bar.minWidthUnits - 0.01,
      `mixed bar at ${widthPx}px: widthUnits (${bar.widthUnits}) must be >= minWidthUnits (${bar.minWidthUnits})`,
    );
    assert.ok(
      minGap >= 6,
      `mixed bar at ${widthPx}px: closest same-string gap (${minGap}) must be at least 6 units`,
    );
  }
}

// A grace note must stay clear of the previous fret and of its main note.
{
  const model = {
    tuning: 'Standard',
    strings: [
      { note: 'E', oct: 4, label: 'E', openMidi: 64 },
      { note: 'B', oct: 3, label: 'B', openMidi: 59 },
      { note: 'G', oct: 3, label: 'G', openMidi: 55 },
      { note: 'D', oct: 3, label: 'D', openMidi: 50 },
      { note: 'A', oct: 2, label: 'A', openMidi: 45 },
      { note: 'E', oct: 2, label: 'E', openMidi: 40 },
    ],
    events: [
      { start: 0, stringIndex: 0, fret: 12, dead: false, duration: 1 },
      { start: 1, stringIndex: 0, fret: 17, dead: false, duration: 0.05, grace: true },
      { start: 1, stringIndex: 0, fret: 22, dead: false, duration: 1 },
    ],
    beats: [
      {
        measureIndex: 0, voiceIndex: 0, start: 0, duration: 1,
        noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [0],
      },
      {
        measureIndex: 0, voiceIndex: 0, start: 1, duration: 1,
        noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [1, 2],
      },
    ],
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
  const layout = layoutForModel(model, { widthPx: 360 });
  noteOverlapGap(layout.bars[0]);
}

// Two dense bars must not share one row when they do not both fit.
{
  const model = {
    ...denseTwoDigitSixteenthModel(),
    measures: [
      { startBeat: 0, endBeat: 4, timeSig: [4, 4] },
      { startBeat: 4, endBeat: 8, timeSig: [4, 4] },
    ],
    beats: [
      ...denseTwoDigitSixteenthModel().beats.map((b) => ({ ...b, measureIndex: 0 })),
      ...denseTwoDigitSixteenthModel().beats.map((b) => ({
        ...b,
        measureIndex: 1,
        start: b.start + 4,
        noteIndices: b.noteIndices.map((i) => i + 16),
      })),
    ],
    events: [
      ...denseTwoDigitSixteenthModel().events.map((e) => ({ ...e, start: e.start })),
      ...denseTwoDigitSixteenthModel().events.map((e) => ({ ...e, start: e.start + 4 })),
    ],
  };
  const narrow = layoutForModel(model, { widthPx: 900 });
  const rowWidth = availableWidthPx(900);
  const combinedMin = narrow.bars[0].minWidthUnits + narrow.bars[1].minWidthUnits;
  if (combinedMin > rowWidth + 0.01) {
    for (const sys of narrow.systems) {
      assert.equal(
        sys.barIndices.length,
        1,
        'two dense bars at 900px must not share one row when they do not fit',
      );
    }
  }

  const tight = layoutForModel(model, { widthPx: 750 });
  const tightRow = availableWidthPx(750);
  const tightCombined = tight.bars[0].minWidthUnits + tight.bars[1].minWidthUnits;
  assert.ok(
    tightCombined > tightRow + 0.01,
    `two dense bars combined min (${tightCombined}) must exceed a tight row (${tightRow})`,
  );
  for (const sys of tight.systems) {
    assert.equal(
      sys.barIndices.length,
      1,
      'two dense bars must not share one row when their combined min exceeds the row',
    );
  }

  const wide = layoutForModel(model, { widthPx: 1600 });
  const wideRow = availableWidthPx(1600);
  const wideCombined = wide.bars[0].minWidthUnits + wide.bars[1].minWidthUnits;
  if (wideCombined <= wideRow + 0.01) {
    assert.ok(
      wide.systems.some((s) => s.barIndices.length === 2),
      'two dense bars at 1600px may share one row when they fit',
    );
  }
}

// fitScaleForBar and scaleThatFits
{
  assert.equal(fitScaleForBar({ availablePx: 0, barUnits: 400 }), null);
  assert.equal(fitScaleForBar({ availablePx: 500, barUnits: 0 }), null);

  const fit = fitScaleForBar({ availablePx: 500, barUnits: 400, chromeUnits: 32 });
  assert.ok(Math.abs(fit - (500 / 432)) < 1e-9, `fitScaleForBar plain case is ${fit}, want ${500 / 432}`);

  const held = scaleThatFits({
    availablePx: 500,
    barUnits: 400,
    desiredScale: 2,
    minScale: 1,
    chromeUnits: 32,
  });
  assert.ok(held <= 2, 'scaleThatFits must not exceed desiredScale');
  assert.ok(held >= 1, 'scaleThatFits must not fall below minScale');
  assert.ok(Math.abs(held - fit) < 1e-9, 'scaleThatFits must hold a large desired scale down to fit');
}

// Zoom fit must use one column, not the full dense measure.
{
  const model = denseTwoDigitSixteenthModel();
  const layout = layoutForModel(model, { widthPx: 340 });
  const atomic = maxAtomicWidthUnits(layout);
  const rowWidth = availableWidthPx(340);
  assert.ok(atomic > 0, 'atomic width must be positive');
  assert.ok(
    atomic < layout.bars[0].minWidthUnits,
    `one column (${atomic}) must be narrower than the full bar (${layout.bars[0].minWidthUnits})`,
  );
  assert.ok(
    atomic < rowWidth,
    `one column (${atomic}) must fit a 340px row (${rowWidth})`,
  );
  assert.ok(layout.systems.length >= 2, 'the dense bar still wraps at 340px');
}

// beatXUnits must match non-grace note glyph centres.
{
  const noteKinds = new Set(['fret', 'deadNote', 'drumHit']);
  const fixtures = [
    'techniques.gp5', 'ties-rhythm.gp5', 'meter-change.gp5',
    'odd-meter-13-16.gp5', 'two-voices.gp5', 'seven-string.gp5',
  ];
  for (const name of fixtures) {
    for (const widthPx of [360, 414, 900, 1600]) {
      const { layout } = await layoutForFixture(name, { widthPx });
      for (const bar of layout.bars) {
        for (const glyph of bar.glyphs) {
          if (!noteKinds.has(glyph.kind)) continue;
          const beat = glyph.beatStart;
          const mapped = beatXUnits(bar, beat);
          const centre = glyph.x + glyph.w / 2;
          if (centre < mapped - 0.05) continue;
          assert.ok(
            Math.abs(mapped - centre) <= 0.01,
            `${name} at ${widthPx} px: beatXUnits(${beat}) is ${mapped}, glyph centre is ${centre}`,
          );
        }
      }
    }
  }
}

// beatFromXUnits must stay inside the bar beat range.
{
  const { layout } = await layoutForFixture('techniques.gp5');
  const bar = layout.bars[0];
  for (const x of [bar.noteOriginUnits, bar.noteOriginUnits + bar.contentWidthUnits * 0.5, bar.noteOriginUnits + bar.contentWidthUnits]) {
    const beat = beatFromXUnits(bar, x);
    assert.ok(beat >= bar.beatStart - 1e-6);
    assert.ok(beat <= bar.beatStart + bar.beatSpan + 1e-6);
  }
}

// Every bar must share one lane stack geometry.
{
  const { layout } = await layoutForFixture('meter-change.gp5', { widthPx: 1600 });
  assert.ok(Array.isArray(layout.laneStack) && layout.laneStack.length > 0, 'laneStack on score');
  assert.ok(layout.totalHeightUnits > 0, 'totalHeightUnits on score');
  for (const bar of layout.bars) {
    assert.equal(bar.lanes.length, layout.laneStack.length, 'lane count matches laneStack');
    for (let i = 0; i < layout.laneStack.length; i += 1) {
      assert.ok(
        Math.abs(bar.lanes[i].y - layout.laneStack[i].y) <= 0.01,
        `bar ${bar.barIndex} lane ${bar.lanes[i].name} y must match laneStack`,
      );
      assert.ok(
        Math.abs(bar.lanes[i].h - layout.laneStack[i].h) <= 0.01,
        `bar ${bar.barIndex} lane ${bar.lanes[i].name} h must match laneStack`,
      );
    }
  }
}

// assignArcStackLevels must lift overlapping slurs on the same string band apart.
{
  const arcs = [
    {
      kind: 'slur',
      from: { x: 10, y: 20, w: 8, h: 10 },
      to: { x: 50, y: 20, w: 8, h: 10 },
    },
    {
      kind: 'slur',
      from: { x: 15, y: 20, w: 8, h: 10 },
      to: { x: 55, y: 20, w: 8, h: 10 },
    },
  ];
  const levels = assignArcStackLevels(arcs);
  assert.notEqual(levels[0], levels[1], 'overlapping slurs must get different stack levels');
}

// assignArcStackLevels must skip arcs with a missing from or to endpoint.
{
  const arcs = [
    {
      kind: 'slur',
      from: { x: 10, y: 20, w: 8, h: 10 },
      to: { x: 50, y: 20, w: 8, h: 10 },
    },
    {
      kind: 'slur',
      from: null,
      to: { x: 55, y: 20, w: 8, h: 10 },
    },
    {
      kind: 'tie',
      from: { x: 20, y: 20, w: 8, h: 10 },
      to: undefined,
    },
  ];
  const levels = assignArcStackLevels(arcs);
  assert.equal(levels.length, 3, 'levels array matches input length');
  assert.equal(levels[1], 0, 'missing from keeps level 0');
  assert.equal(levels[2], 0, 'missing to keeps level 0');
}

// buildOverlayPaths must skip out-of-range glyph indices and must not throw.
{
  const glyphs = [
    { lane: 'tabStaff', x: 10, y: 20, w: 8, h: 10 },
    { lane: 'tabStaff', x: 50, y: 20, w: 8, h: 10 },
  ];
  const overlays = buildOverlayPaths(glyphs, [
    { kind: 'slur', fromIndex: 0, toIndex: 1 },
    { kind: 'tie', fromIndex: 0, toIndex: 99 },
    { kind: 'slide', fromIndex: -1, toIndex: 1 },
    { kind: 'bend', fromIndex: 1, toIndex: 0 },
  ]);
  assert.equal(overlays.length, 2, 'only valid overlay records become paths');
  assert.ok(overlays.every((o) => typeof o.path === 'string' && o.path.startsWith('M ')));
}

// layoutScore must handle an eight-bar dense 16th-triplet model.
{
  const model = denseEightBarTripletModel();
  const layout = layoutForModel(model, { widthPx: 360, maxMeasuresPerSystem: 1 });
  assert.equal(layout.bars.length, 8, 'eight bars in layout');
  assert.ok(layout.systems.length >= 8, 'one bar per row at phone width');
  assert.ok(layout.bars.every((bar) => bar.glyphs.length > 0), 'each bar has glyphs');
  for (const sys of layout.systems) {
    assert.equal(sys.barIndices.length, 1, 'dense triplets use one bar per system');
  }
}

// Hammer-on slurs must connect each note to its nearest earlier neighbour.
{
  const layout = layoutForModel(hammerOnChainModel(), { widthPx: 900 });
  const slurs = layout.bars[0].overlays.filter((o) => o.kind === 'slur');
  assert.equal(slurs.length, 3, 'three hammer-ons produce three slurs');
  const fromXs = slurs.map((s) => Math.round(s.fromGlyph.x * 100) / 100);
  const uniqueFrom = new Set(fromXs);
  assert.equal(uniqueFrom.size, 3, 'each slur must start at a different note, not all at the first');
}

// Multi-bar systems must fill their row width after the stretch pass.
{
  const { layout } = await layoutForFixture('large-200bar.gp5', { widthPx: 1600 });
  let checked = 0;
  for (const sys of layout.systems) {
    if (sys.barIndices.length <= 1) continue;
    if (!isCompleteBarSystem(sys)) continue;
    const sum = sys.parts.reduce((s, p) => s + p.widthUnits, 0);
    assert.ok(
      Math.abs(sum - sys.widthPx) <= 0.5,
      `system part widths (${sum}) must equal system width (${sys.widthPx})`,
    );
    checked += 1;
  }
  assert.ok(checked >= 1, 'at least one multi-bar system was checked');
}

function isCompleteBarSystem(sys) {
  return sys.parts.every((p) => !p.isContinuation && p.isLastFragment);
}

// Drum mode with drumLanes must place each kit lane on its own row.
{
  const drumLanes = ['crash', 'ride', 'hihat', 'snare', 'kick'];
  const layout = layoutForModel(smallDrumModel(), {
    drumMode: true,
    drumLanes,
    widthPx: 900,
  });
  const hits = layout.bars[0].glyphs.filter((g) => g.kind === 'drumHit');
  const ys = new Set(hits.map((g) => Math.round(g.y * 100) / 100));
  assert.equal(ys.size, 4, 'each used drum lane gets a distinct y');
  const tabLane = layout.bars[0].lanes.find((l) => l.name === 'tabStaff');
  assert.ok(tabLane, 'tabStaff lane exists');
  assert.ok(
    tabLane.h >= drumLanes.length * 14,
    `tabStaff height (${tabLane.h}) must fit ${drumLanes.length} drum rows`,
  );
}

// Drum staff mode draws a five-line percussion staff instead of kit rows.
{
  const staffModel = {
    percussion: true,
    name: 'Drums',
    events: [
      { start: 0, instrument: 'hihatClosed', duration: 0.5 },
      { start: 0, instrument: 'kick', duration: 1 },
      { start: 0.5, instrument: 'hihatClosed', duration: 0.5 },
      { start: 1, instrument: 'hihatClosed', duration: 0.5 },
      { start: 1, instrument: 'snare', duration: 1, accent: true },
      { start: 1.5, instrument: 'hihatClosed', duration: 0.5 },
      { start: 2, instrument: 'crash', duration: 1 },
      { start: 2, instrument: 'kick', duration: 1 },
      { start: 3, instrument: 'snare', duration: 1 },
    ],
    beats: [
      { measureIndex: 0, voiceIndex: 0, start: 0, duration: 0.5, noteValue: 8, dots: 0, tuplet: null, rest: false, noteIndices: [0, 1] },
      { measureIndex: 0, voiceIndex: 0, start: 0.5, duration: 0.5, noteValue: 8, dots: 0, tuplet: null, rest: false, noteIndices: [2] },
      { measureIndex: 0, voiceIndex: 0, start: 1, duration: 0.5, noteValue: 8, dots: 0, tuplet: null, rest: false, noteIndices: [3, 4] },
      { measureIndex: 0, voiceIndex: 0, start: 1.5, duration: 0.5, noteValue: 8, dots: 0, tuplet: null, rest: false, noteIndices: [5] },
      { measureIndex: 0, voiceIndex: 0, start: 2, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [6, 7] },
      { measureIndex: 0, voiceIndex: 0, start: 3, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [8] },
    ],
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
  const layout = layoutForModel(staffModel, {
    drumMode: true,
    drumStaff: true,
    drumLanes: ['crash', 'hihat', 'snare', 'kick'],
    widthPx: 900,
  });
  const bar = layout.bars[0];
  const kinds = (kind) => bar.glyphs.filter((g) => g.kind === kind);

  assert.equal(kinds('staffLine').length, 5, 'a drum staff draws five lines');
  assert.ok(
    bar.lanes.every((l) => l.name !== 'rhythm'),
    'the staff carries the rhythm, so the rhythm lane must go',
  );

  const hits = kinds('drumHit');
  assert.equal(hits.length, 9, 'every hit draws one note head');
  assert.ok(hits.every((g) => g.head), 'every note head names its shape');
  assert.ok(hits.every((g) => g.text === ''), 'a note head is a shape, not a letter');

  const hatHead = hits.find((g) => g.aria === 'Closed hi-hat');
  const snareHead = hits.find((g) => g.aria.startsWith('Snare drum'));
  const kickHead = hits.find((g) => g.aria === 'Kick drum');
  const crashHead = hits.find((g) => g.aria === 'Crash cymbal');
  assert.equal(hatHead.head, 'x', 'a cymbal takes a cross head');
  assert.equal(snareHead.head, 'normal', 'a drum takes a round head');
  assert.ok(hatHead.y < snareHead.y, 'the hi-hat sits above the snare');
  assert.ok(snareHead.y < kickHead.y, 'the snare sits above the kick');
  assert.ok(crashHead.y < hatHead.y, 'the crash sits above the hi-hat');
  assert.equal(hatHead.voice, 'up', 'the hands take the upper voice');
  assert.equal(kickHead.voice, 'down', 'the feet take the lower voice');

  assert.equal(kinds('ledger').length, 1, 'the crash needs a ledger line');
  assert.equal(kinds('accent').length, 1, 'the accented snare carries one mark');
  assert.equal(kinds('rest').length, 2, 'the kick rests on beats 2 and 4');
  assert.ok(kinds('beam').length >= 2, 'the eighth notes join under beams');
  assert.ok(kinds('stem').length >= 6, 'every note value under a whole note carries a stem');

  // Lane mode must still work, so nothing that reads a drum tab breaks.
  const laneLayout = layoutForModel(staffModel, {
    drumMode: true,
    drumLanes: ['crash', 'hihat', 'snare', 'kick'],
    widthPx: 900,
  });
  assert.equal(
    laneLayout.bars[0].glyphs.filter((g) => g.kind === 'staffLine').length,
    0,
    'lane mode draws no staff lines',
  );
  assert.ok(
    laneLayout.bars[0].glyphs.some((g) => g.kind === 'drumHit' && g.text === 'x'),
    'lane mode still draws tab symbols',
  );
}

// A flam draws two symbols: a small grace stroke just before the main hit.
{
  const flamModel = {
    percussion: true,
    name: 'Drums',
    events: [
      { start: 0, instrument: 'kick', duration: 1 },
      { start: 1, instrument: 'snare', duration: 1, flam: true },
      { start: 1, instrument: 'snare', duration: 0.125, grace: true, flam: true },
      { start: 2, instrument: 'hihatClosed', duration: 1 },
    ],
    beats: [
      { measureIndex: 0, voiceIndex: 0, start: 0, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [0] },
      { measureIndex: 0, voiceIndex: 0, start: 1, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [1] },
      { measureIndex: 0, voiceIndex: 0, start: 2, duration: 1, noteValue: 4, dots: 0, tuplet: null, rest: false, noteIndices: [3] },
    ],
    measures: [{ startBeat: 0, endBeat: 4, timeSig: [4, 4] }],
  };
  const layout = layoutForModel(flamModel, {
    drumMode: true,
    drumLanes: ['hihat', 'snare', 'kick'],
    widthPx: 900,
  });
  const hits = layout.bars[0].glyphs.filter((g) => g.kind === 'drumHit');
  assert.equal(hits.length, 4, 'every stroke of the flam draws its own symbol');
  const graceHits = hits.filter((g) => g.grace);
  assert.equal(graceHits.length, 1, 'the flam draws one grace stroke');
  assert.equal(graceHits[0].text, 'o', 'the grace stroke keeps the symbol of its drum');
  assert.equal(graceHits[0].aria, 'Snare (grace)');
  const mainHit = hits.find((g) => !g.grace && g.beatStart === 1);
  assert.equal(mainHit.text, 'o');
  assert.equal(mainHit.aria, 'Snare (flam)');
  assert.ok(
    graceHits[0].x < mainHit.x,
    'the grace stroke draws before the hit that it decorates',
  );
  assert.equal(graceHits[0].y, mainHit.y, 'both strokes sit on the snare row');
}

// A bar that is too wide for one row wraps into fragments. Every fragment must
// draw its own staff, or the notes after the wrap stand on nothing.
{
  const events = [];
  const beats = [];
  const measures = [];
  for (let bar = 0; bar < 2; bar += 1) {
    measures.push({ startBeat: bar * 4, endBeat: bar * 4 + 4, timeSig: [4, 4] });
    for (let i = 0; i < 32; i += 1) {
      const start = bar * 4 + i * 0.125;
      const index = events.length;
      events.push({ start, duration: 0.125, instrument: 'hihatClosed' });
      beats.push({
        measureIndex: bar,
        voiceIndex: 0,
        start,
        duration: 0.125,
        noteValue: 32,
        dots: 0,
        tuplet: null,
        rest: false,
        noteIndices: [index],
      });
    }
  }
  const wrapModel = {
    percussion: true, name: 'Drums', events, beats, measures,
  };
  const layout = layoutForModel(wrapModel, {
    drumMode: true,
    drumStaff: true,
    drumLanes: ['crash', 'hihat', 'snare', 'kick'],
    widthPx: 480,
  });
  const parts = layout.systems.flatMap((sys) => sys.parts);
  assert.ok(
    parts.some((part) => part.isContinuation),
    'the narrow row must wrap a bar, or this check proves nothing',
  );
  for (const part of parts) {
    const lines = part.layout.glyphs.filter((g) => g.kind === 'staffLine');
    assert.equal(
      lines.length,
      5,
      `bar ${part.barIndex} fragment at column ${part.colStart} draws five staff lines`,
    );
    assert.ok(
      lines.every((g) => g.x === 0),
      'a staff line starts at the left edge of the fragment that draws it',
    );
  }
}

// The notation staff draws its five lines as beams of no width. A wrapped bar
// must keep them too.
{
  const notes = [];
  const beats = [];
  const measures = [];
  for (let bar = 0; bar < 2; bar += 1) {
    measures.push({ startBeat: bar * 4, endBeat: bar * 4 + 4, timeSig: [4, 4] });
    for (let i = 0; i < 32; i += 1) {
      const index = notes.length;
      notes.push({ string: 0, fret: (i % 12) + 1, midi: 64 });
      beats.push({
        measureIndex: bar,
        voiceIndex: 0,
        start: bar * 4 + i * 0.125,
        duration: 0.125,
        noteValue: 32,
        dots: 0,
        tuplet: null,
        rest: false,
        noteIndices: [index],
      });
    }
  }
  const wrapModel = {
    measures,
    beats,
    notes,
    rests: [],
    strings: [{ midi: 64 }, { midi: 59 }, { midi: 55 }, { midi: 50 }, { midi: 45 }, { midi: 40 }],
  };
  const layout = layoutForModel(wrapModel, { showNotationStaff: true, widthPx: 480 });
  const parts = layout.systems.flatMap((sys) => sys.parts);
  assert.ok(
    parts.some((part) => part.isContinuation),
    'the narrow row must wrap a bar, or this check proves nothing',
  );
  for (const part of parts) {
    const lines = part.layout.glyphs.filter(
      (g) => g.kind === 'beam' && g.lane === 'notationStaff' && g.h <= 1,
    );
    assert.equal(
      lines.length,
      5,
      `bar ${part.barIndex} fragment at column ${part.colStart} keeps the notation staff`,
    );
  }
}

console.log('gp-player score-layout: ok');
if (techniqueReport) {
  console.log(`technique coverage: ${techniqueReport.drawnTotal}/${techniqueReport.fileTotal} (${(techniqueReport.ratio * 100).toFixed(1)}%)`);
}
