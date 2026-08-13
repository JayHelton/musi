// Score layout contract checks for the GP player overhaul.
// Run: node tests/gp-player/score-layout.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuitarPro } from '../../js/tab/guitarPro.js';
import {
  fitScaleForBar,
  layoutScore,
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
        if (bar.minWidthUnits > bar.widthUnits + 0.01) {
          continue;
        }
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

// A dense bar must fit a narrow row, and minWidthUnits must stay stable.
{
  const model = denseTwoDigitSixteenthModel();
  const narrowWidthPx = 340;
  const narrow = layoutForModel(model, { widthPx: narrowWidthPx });
  const wide = layoutForModel(model, { widthPx: 1600 });
  const rowWidth = availableWidthPx(narrowWidthPx);

  for (const bar of narrow.bars) {
    assert.ok(
      bar.widthUnits <= rowWidth + 0.01,
      `bar ${bar.barIndex} width (${bar.widthUnits}) must fit row (${rowWidth})`,
    );
    assert.ok(
      bar.minWidthUnits >= bar.widthUnits,
      `bar ${bar.barIndex} minWidthUnits (${bar.minWidthUnits}) must be >= widthUnits (${bar.widthUnits})`,
    );
    assert.ok(bar.widthUnits >= 96, 'bar width must stay above MIN_BAR_UNITS');
  }

  for (const sys of narrow.systems) {
    let sum = 0;
    for (const idx of sys.barIndices) {
      sum += narrow.bars[idx].widthUnits;
    }
    assert.ok(
      sum <= sys.widthPx + 0.01,
      `system bar widths (${sum}) must fit system width (${sys.widthPx})`,
    );
  }

  assert.equal(
    narrow.bars[0].minWidthUnits,
    wide.bars[0].minWidthUnits,
    'minWidthUnits must not change when widthPx changes',
  );

  assert.ok(
    narrow.bars[0].widthUnits < wide.bars[0].widthUnits,
    'a dense bar at a narrow width must be narrower than at a wide width',
  );
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

console.log('gp-player score-layout: ok');
if (techniqueReport) {
  console.log(`technique coverage: ${techniqueReport.drawnTotal}/${techniqueReport.fileTotal} (${(techniqueReport.ratio * 100).toFixed(1)}%)`);
}
