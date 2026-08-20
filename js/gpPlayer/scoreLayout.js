// Pure score layout for the GP player parchment view.
// No DOM access. No global state.

import { TECHNIQUE_LABELS } from '../tab/tabModel.js';
import { drumTabGlyph, drumHitLabel, drumLaneFor } from '../drums/notation.js';
import { measureSpan } from './rangeUtils.js';

const LANE_NAMES = ['notationStaff', 'techniqueAbove', 'tabStaff', 'rhythm', 'techniqueBelow'];

const RHYTHM_KINDS = new Set(['stem', 'flag', 'beam', 'dot', 'tupletBracket']);

const TECHNIQUE_ARIA = {
  bend: TECHNIQUE_LABELS.bend,
  slide: TECHNIQUE_LABELS.slide,
  hammer: TECHNIQUE_LABELS.hammer,
  pull: TECHNIQUE_LABELS.pull,
  vibrato: TECHNIQUE_LABELS.vibrato,
  palmMute: TECHNIQUE_LABELS.palmMute,
  harmonic: TECHNIQUE_LABELS.harmonic,
  tap: TECHNIQUE_LABELS.tap,
  slap: TECHNIQUE_LABELS.slap,
  pop: TECHNIQUE_LABELS.pop,
  trill: TECHNIQUE_LABELS.trill,
  tremolo: TECHNIQUE_LABELS.tremolo,
  dead: TECHNIQUE_LABELS.dead,
};

const TECHNIQUE_TEXT = {
  bend: 'B',
  slide: '/',
  hammer: 'H',
  pull: 'P',
  vibrato: '~',
  palmMute: 'PM',
  harmonic: '◊',
  tap: 'T',
  slap: 'S',
  pop: 'Po',
  trill: 'tr',
  tremolo: 'tm',
};

const TECHNIQUE_ABOVE = new Set(['bend', 'vibrato', 'harmonic', 'trill', 'tremolo', 'tap']);
const TECHNIQUE_BELOW = new Set(['slide', 'hammer', 'pull', 'palmMute', 'slap', 'pop']);

// The string name column sits at the left of the staff. The first note and
// the time signature must start after it, or the text runs together.
const BAR_PAD_START = 42;
const BAR_PAD_END = 10;
// A continuation row starts after a split measure. It uses a smaller pad than a
// full bar start, because the measure chrome already appeared on the first row.
const CONTINUATION_PAD_START = 12;
const CONTINUATION_PAD_END = 8;
const MIN_BAR_UNITS = 96;
const UNITS_PER_QUARTER = 20;
const MAX_MEASURES_PER_SYSTEM = 8;
const GUTTER_UNITS = 20;
const VIEWPORT_PAD = 12;
// A fret number must never touch the next one, and it must never touch a
// rhythm tick below it. Each beat column therefore keeps a clear gap after
// its widest text. Two-digit frets need this gap or the score is hard to read.
const MIN_COL_GAP_UNITS = 14;
// A phone screen holds one measure per row. Two measures on a 360 CSS pixel
// screen leave about 160 pixels for each bar, and the fret numbers then run
// into each other.
const ONE_BAR_MAX_WIDTH_PX = 700;
// Layout geometry uses this base size. The view scales a unit by
// fontPx / LAYOUT_BASE_PX when it draws.
const LAYOUT_BASE_PX = 12;
// A bar with one very short note among long ones would otherwise grow without
// a limit. The learner can scroll, but a bar must stay readable.
const MAX_BAR_CONTENT_UNITS = 4000;
const DRUM_ROW_MIN_UNITS = 14;
const ARC_STACK_LIFT_UNITS = 4;
const ARC_Y_BAND_TOLERANCE = 2;
// A slur and a tie arch over the note text by this much.
const SLUR_LIFT_UNITS = 5;
// A bend arrow rises beside the note by this much.
const BEND_RISE_UNITS = 11;
const BEND_RUN_UNITS = 5;
// A slide leaves a note at this slope when no next note follows it.
const SLIDE_RISE_UNITS = 5;
const SLIDE_RUN_UNITS = 8;

/**
 * The fret text size in layout units.
 *
 * Every glyph box uses layout units, and the view multiplies a unit by its own
 * scale when it draws. The text size therefore stays at the base size here.
 * The view applies the same scale to the text, so the box and the text always
 * match. FR-030 needs at least 12 CSS pixels at 360 CSS pixels wide, and the
 * base size meets that with a view scale of 1.
 */
function clampFontPx(widthPx, zoom, minFretFontPx) {
  void widthPx;
  return Math.max(minFretFontPx, Math.round(LAYOUT_BASE_PX * zoom * 10) / 10);
}

function defaultOptions(options = {}) {
  const widthPx = Number(options.widthPx) || 900;
  const maxPerSystem = Number(options.maxMeasuresPerSystem)
    || (widthPx <= ONE_BAR_MAX_WIDTH_PX ? 1 : MAX_MEASURES_PER_SYSTEM);
  return {
    widthPx,
    zoom: Number(options.zoom) || 1,
    showNotationStaff: Boolean(options.showNotationStaff),
    showRhythm: options.showRhythm !== false,
    drumMode: Boolean(options.drumMode),
    drumLanes: Array.isArray(options.drumLanes) ? options.drumLanes : [],
    minFretFontPx: Number(options.minFretFontPx) || 12,
    barIndex: Number.isFinite(options.barIndex) ? options.barIndex : 0,
    isFirstSystem: Boolean(options.isFirstSystem),
    prevTimeSig: options.prevTimeSig ?? null,
    tuningLabel: options.tuningLabel ?? '',
    maxMeasuresPerSystem: Math.max(1, Math.floor(maxPerSystem)),
    minContentUnits: Number(options.minContentUnits) || 0,
    maxContentUnits: Number(options.maxContentUnits) || 0,
    fixedMinWidthUnits: Number(options.fixedMinWidthUnits) || 0,
    retainOverlayRecords: Boolean(options.retainOverlayRecords),
  };
}

function pushGlyph(glyphs, glyph) {
  glyphs.push(glyph);
  return glyphs.length - 1;
}

function beatKey(beat) {
  return `${beat.measureIndex}:${beat.voiceIndex}:${beat.start}`;
}

function formatTimeSig(timeSig) {
  if (!timeSig || timeSig.length < 2) return '4/4';
  return `${timeSig[0]}/${timeSig[1]}`;
}

function formatBendAmount(bend) {
  if (!bend?.points?.length) return '0';
  const maxCents = bend.points.reduce((m, p) => Math.max(m, Number(p.cents) || 0), 0);
  if (maxCents <= 0) return '¼';
  if (maxCents <= 100) return '½';
  if (maxCents <= 200) return '1';
  return String(Math.round(maxCents / 100));
}

function arcXRange(from, to) {
  const x1 = from.x + from.w / 2;
  const x2 = to.x + to.w / 2;
  return { xMin: Math.min(x1, x2), xMax: Math.max(x1, x2) };
}

function arcYBand(kind, from, to) {
  if (kind === 'bend' || kind === 'slide') {
    return `tech:${Math.round((from.y + to.y) / 2)}`;
  }
  return `tab:${Math.round(from.y / ARC_Y_BAND_TOLERANCE)}`;
}

function arcsOverlap(a, b) {
  return a.xMin < b.xMax - 1e-6 && b.xMin < a.xMax - 1e-6;
}

/**
 * Assign a stack level to each arc so overlapping arcs in the same band lift apart.
 * @param {Array<{ kind: string, from: object, to: object }>} arcs
 * @returns {number[]}
 */
export function assignArcStackLevels(arcs) {
  const levels = new Array(arcs.length).fill(0);
  const validIndices = [];
  const validMeta = [];
  for (let i = 0; i < arcs.length; i += 1) {
    const arc = arcs[i];
    if (!arc.from || !arc.to) continue;
    validIndices.push(i);
    validMeta.push({
      ...arcXRange(arc.from, arc.to),
      yBand: arcYBand(arc.kind, arc.from, arc.to),
    });
  }
  const order = validMeta.map((_, i) => i).sort(
    (a, b) => validMeta[a].xMin - validMeta[b].xMin || validMeta[a].xMax - validMeta[b].xMax,
  );
  const placed = [];

  for (const vi of order) {
    const arc = validMeta[vi];
    let level = 0;
    while (placed.some((p) => p.yBand === arc.yBand && p.level === level && arcsOverlap(p, arc))) {
      level += 1;
    }
    levels[validIndices[vi]] = level;
    placed.push({ ...arc, level });
  }
  return levels;
}

function overlayPath(kind, from, to, stackLevel = 0) {
  const x1 = from.x + from.w / 2;
  const x2 = to.x + to.w / 2;

  // A bend rises from the note. Tab notation draws a short arrow, so the mark
  // stays beside the note. A line that reached the letter in the lane above
  // would cross the whole staff when the note sits on a low string.
  if (kind === 'bend') {
    const yStart = from.y;
    const yTop = yStart - BEND_RISE_UNITS - stackLevel * ARC_STACK_LIFT_UNITS;
    const xEnd = x1 + BEND_RUN_UNITS;
    return `M ${x1} ${yStart} Q ${xEnd} ${yStart} ${xEnd} ${yTop}`;
  }

  // A slide runs from this note to the next note, as a straight line between
  // the two frets. When no next note follows, it leaves the note at a slope.
  if (kind === 'slide') {
    const y1 = from.y + from.h / 2;
    const sameLane = to.lane === from.lane;
    const y2 = sameLane ? to.y + to.h / 2 : y1 - SLIDE_RISE_UNITS;
    const xTo = sameLane ? x2 : x1 + SLIDE_RUN_UNITS;
    const gapStart = x1 + from.w / 2;
    const gapEnd = sameLane ? Math.max(gapStart, xTo - to.w / 2) : xTo;
    return `M ${gapStart} ${y1} L ${gapEnd} ${y2}`;
  }

  const y1 = from.y;
  const y2 = to.y;
  const mx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - SLUR_LIFT_UNITS - stackLevel * ARC_STACK_LIFT_UNITS;
  return `M ${x1} ${y1} Q ${mx} ${cy} ${x2} ${y2}`;
}

/**
 * Build SVG paths for overlay records that name glyph indices.
 * @param {object[]} glyphs
 * @param {object[]} overlayRecords
 * @returns {object[]}
 */
export function buildOverlayPaths(glyphs, overlayRecords) {
  const validRecords = [];
  const arcInputs = [];
  for (const rec of overlayRecords) {
    const from = glyphs[rec.fromIndex];
    const to = glyphs[rec.toIndex];
    if (!from || !to) continue;
    validRecords.push(rec);
    arcInputs.push({ kind: rec.kind, from, to });
  }
  const levels = assignArcStackLevels(arcInputs);
  const laneName = (g) => g.lane;

  return validRecords.map((rec, i) => {
    const from = glyphs[rec.fromIndex];
    const to = glyphs[rec.toIndex];
    return {
      kind: rec.kind,
      path: overlayPath(rec.kind, from, to, levels[i]),
      fromGlyph: { lane: laneName(from), x: from.x, y: from.y },
      toGlyph: { lane: laneName(to), x: to.x, y: to.y },
    };
  });
}

function laneLayout({
  fontPx,
  stringCount,
  showNotationStaff,
  showRhythm,
  drumMode,
  drumLanes,
}) {
  // Every lane sits as close to the staff as its own glyphs allow. A tall lane
  // costs a row of screen height on every system, and the learner reads more
  // music when the staff itself holds most of the screen. fitLanesToGlyphs()
  // grows a lane again when its glyphs need more room.
  const rowCount = drumMode && drumLanes.length ? drumLanes.length : stringCount;
  const stringH = drumMode && drumLanes.length
    ? Math.max(DRUM_ROW_MIN_UNITS, fontPx * 1.05)
    : Math.max(10, fontPx * 1.2);
  const notationH = showNotationStaff ? Math.max(24, fontPx * 2.8) : 0;
  // This lane also holds the bar number and the section marker that the view
  // draws over it, so it must stay tall enough to hold that text.
  const techAboveH = Math.max(11, fontPx * 0.95);
  const tabH = Math.max(stringH, rowCount * stringH);
  const rhythmH = showRhythm ? Math.max(15, fontPx * 1.3) : 0;
  const techBelowH = Math.max(8, fontPx * 0.8);
  let y = 0;
  const lanes = [];
  if (showNotationStaff) {
    lanes.push({ name: 'notationStaff', x: 0, y, w: 0, h: notationH });
    y += notationH;
  }
  lanes.push({ name: 'techniqueAbove', x: 0, y, w: 0, h: techAboveH });
  y += techAboveH;
  lanes.push({ name: 'tabStaff', x: 0, y, w: 0, h: tabH });
  y += tabH;
  if (showRhythm) {
    lanes.push({ name: 'rhythm', x: 0, y, w: 0, h: rhythmH });
    y += rhythmH;
  }
  lanes.push({ name: 'techniqueBelow', x: 0, y, w: 0, h: techBelowH });
  y += techBelowH;
  return { lanes, totalH: y, stringH, tabH };
}

/**
 * Grow each lane so its glyphs fit, then re-stack the lanes and move the
 * glyphs of every lane that shifted.
 */
function fitLanesToGlyphs(lanes, glyphs) {
  const byLane = new Map();
  for (const g of glyphs) {
    const list = byLane.get(g.lane);
    if (list) list.push(g);
    else byLane.set(g.lane, [g]);
  }

  let y = 0;
  for (const lane of lanes) {
    const own = byLane.get(lane.name) || [];
    let needed = lane.h;
    for (const g of own) {
      needed = Math.max(needed, (g.y - lane.y) + g.h);
    }
    const shift = y - lane.y;
    if (shift !== 0) {
      for (const g of own) g.y += shift;
      lane.y = y;
    }
    lane.h = needed;
    y += lane.h;
  }
}

function totalHeightFromLanes(lanes) {
  if (!lanes.length) return 0;
  const last = lanes[lanes.length - 1];
  return last.y + last.h;
}

function maxLaneHeights(bars) {
  const maxH = new Map();
  for (const bar of bars) {
    for (const lane of bar.lanes) {
      maxH.set(lane.name, Math.max(maxH.get(lane.name) || 0, lane.h));
    }
  }
  return maxH;
}

/**
 * Re-stack lanes to shared heights and move glyphs with their lane.
 */
function restackLanesWithHeights(lanes, glyphs, heightByName) {
  const byLane = new Map();
  for (const g of glyphs) {
    const list = byLane.get(g.lane);
    if (list) list.push(g);
    else byLane.set(g.lane, [g]);
  }

  let y = 0;
  for (const lane of lanes) {
    const own = byLane.get(lane.name) || [];
    const shift = y - lane.y;
    if (shift !== 0) {
      for (const g of own) g.y += shift;
      lane.y = y;
    }
    lane.h = heightByName.get(lane.name) ?? lane.h;
    y += lane.h;
  }
}

function applySharedLaneStack(bars) {
  if (!bars.length) return { laneStack: [], totalHeightUnits: 0 };
  const heightByName = maxLaneHeights(bars);
  for (const bar of bars) {
    restackLanesWithHeights(bar.lanes, bar.glyphs, heightByName);
    bar.overlays = buildOverlayPaths(bar.glyphs, bar._overlayRecords);
    bar.totalHeightUnits = totalHeightFromLanes(bar.lanes);
  }
  const laneStack = bars[0].lanes.map((l) => ({ name: l.name, y: l.y, h: l.h }));
  return {
    laneStack,
    totalHeightUnits: totalHeightFromLanes(bars[0].lanes),
  };
}

function laneByName(lanes, name) {
  return lanes.find((l) => l.name === name) || lanes[0];
}

function deriveBeatsFromEvents(model, barIndex, start, end) {
  const starts = new Set();
  for (const ev of model.events || []) {
    const b = Number(ev.start);
    if (b >= start - 1e-6 && b < end - 1e-6) starts.add(b);
  }
  return [...starts].sort((a, b) => a - b).map((beatStart) => ({
    measureIndex: barIndex,
    voiceIndex: 0,
    start: beatStart,
    duration: 1,
    noteValue: 4,
    dots: 0,
    tuplet: null,
    rest: false,
    noteIndices: [],
  }));
}

function buildBarSlice(model, barIndex) {
  const measure = model.measures[barIndex];
  const { start, end } = measureSpan(measure);
  let beats = (model.beats || []).filter((b) => b.measureIndex === barIndex);
  if (!beats.length) {
    beats = deriveBeatsFromEvents(model, barIndex, start, end);
  }
  const rests = (model.rests || []).filter((r) => r.measureIndex === barIndex);
  const events = (model.events || [])
    .map((ev, eventIndex) => ({ ...ev, eventIndex }))
    .filter((ev) => {
      const b = Number(ev.start);
      return b >= start - 1e-6 && b < end - 1e-6;
    });
  const tuningLabel = barIndex === 0
    ? (model.tuning ? `Tuning · ${model.tuning}` : '')
    : '';
  return {
    index: barIndex,
    measure,
    beats,
    rests,
    events,
    strings: model.strings || [],
    tuningLabel,
  };
}

function noteOriginOffset(geoPx) {
  return Math.max(4, geoPx * 0.3);
}

/** Fret text width in layout units for a column. */
function fretTextWidth(maxChars, geoPx) {
  return Math.max(geoPx * 0.7, maxChars * geoPx * 0.55);
}

/** Build per-column minimum advances from events at each beat. */
function columnMinAdvances(bar, cols, geoPx) {
  return cols.map((col) => {
    const beatStart = col.beat.start;
    let maxChars = 1;
    let graceBearing = 0;
    for (const ev of bar.events) {
      if (Math.abs(Number(ev.start) - beatStart) >= 1e-4) continue;
      const label = ev.dead ? 'x' : String(ev.fret ?? '');
      maxChars = Math.max(maxChars, label.length);
      if (ev.grace) {
        const gw = fretTextWidth(label.length, geoPx);
        graceBearing = Math.max(graceBearing, gw * 0.9 + geoPx * 0.2);
      }
    }
    const textW = fretTextWidth(maxChars, geoPx);
    return {
      col,
      maxChars,
      textW,
      graceBearing,
      minAdvance: textW + MIN_COL_GAP_UNITS + graceBearing,
    };
  });
}

/**
 * Place beat columns with spring spacing. Each column keeps a readable minimum
 * advance. Extra width follows written duration.
 */
function placeSpringColumns(bar, cols, measureLen, geoPx, opts) {
  const originOffset = noteOriginOffset(geoPx);
  const minContentFloor = MIN_BAR_UNITS - BAR_PAD_START - BAR_PAD_END;
  const measureFloor = measureLen * UNITS_PER_QUARTER;
  const colAdvances = columnMinAdvances(bar, cols, geoPx);

  let sumMin = colAdvances.reduce((s, c) => s + c.minAdvance, 0);
  let scale = 1;
  if (sumMin > MAX_BAR_CONTENT_UNITS) {
    scale = MAX_BAR_CONTENT_UNITS / sumMin;
    sumMin = MAX_BAR_CONTENT_UNITS;
  }

  const idealContentW = Math.max(
    minContentFloor,
    measureFloor,
    sumMin,
    opts.minContentUnits || 0,
  );

  let contentW = idealContentW;
  if (opts.maxContentUnits > 0 && opts.maxContentUnits > contentW) {
    contentW = opts.maxContentUnits;
  }

  const scaledMins = colAdvances.map((c) => c.minAdvance * scale);
  const scaledSum = scaledMins.reduce((s, a) => s + a, 0);
  const extra = Math.max(0, contentW - scaledSum);
  const totalDuration = cols.reduce((s, c) => s + c.width, 0) || 1;

  let x = BAR_PAD_START;
  const columns = [];
  for (let i = 0; i < cols.length; i += 1) {
    const col = cols[i];
    const durationShare = extra * (col.width / totalDuration);
    const advance = scaledMins[i] + durationShare;
    const leftBearing = colAdvances[i].graceBearing * scale;
    col.xLeft = x + leftBearing;
    col.x = col.xLeft + originOffset;
    columns.push({
      beat: col.beat.start,
      x: col.x,
      xLeft: col.xLeft,
      advance,
      relStart: col.relStart,
    });
    x += advance;
  }

  return { contentW, idealContentW, columns, originOffset };
}

function beatColumns(bar, measureLen) {
  const cols = [];
  const seen = new Set();
  for (const beat of bar.beats) {
    const key = beatKey(beat);
    if (seen.has(key)) continue;
    seen.add(key);
    const rel = (beat.start - (bar.measure.startBeat ?? measureSpan(bar.measure).start)) / measureLen;
    cols.push({
      beat,
      relStart: Math.max(0, Math.min(1, rel)),
      relEnd: Math.max(0, Math.min(1, rel + beat.duration / measureLen)),
      width: beat.duration,
    });
  }
  for (const rest of bar.rests) {
    const pseudo = {
      measureIndex: rest.measureIndex,
      voiceIndex: rest.voiceIndex,
      start: rest.start,
      duration: rest.duration,
      noteValue: rest.noteValue,
      dots: rest.dots,
      tuplet: rest.tuplet,
      rest: true,
      noteIndices: [],
    };
    const key = beatKey(pseudo);
    if (seen.has(key)) continue;
    seen.add(key);
    const rel = (rest.start - (bar.measure.startBeat ?? measureSpan(bar.measure).start)) / measureLen;
    cols.push({
      beat: pseudo,
      relStart: Math.max(0, Math.min(1, rel)),
      relEnd: Math.max(0, Math.min(1, rel + rest.duration / measureLen)),
      width: rest.duration,
    });
  }
  cols.sort((a, b) => a.relStart - b.relStart);
  return cols;
}

function addRhythmGlyphs(glyphs, overlays, lanes, cols, contentW, fontPx, showRhythm) {
  if (!showRhythm) return;
  const rhythmLane = laneByName(lanes, 'rhythm');
  const stemW = Math.max(2, fontPx * 0.12);
  const stemH = Math.max(10, rhythmLane.h * 0.7);
  const stemY = rhythmLane.y + rhythmLane.h * 0.15;
  let beamGroup = [];
  let tupletGroup = null;

  function flushBeam() {
    if (beamGroup.length < 2) {
      beamGroup = [];
      return;
    }
    const first = beamGroup[0];
    const last = beamGroup[beamGroup.length - 1];
    const y = rhythmLane.y + rhythmLane.h * 0.25;
    const x = first.x;
    const w = (last.x + last.w) - x;
    pushGlyph(glyphs, {
      kind: 'beam',
      lane: 'rhythm',
      x,
      y,
      w: Math.max(stemW, w),
      h: Math.max(2, fontPx * 0.1),
      text: '',
      aria: 'Beam',
      beatStart: first.beatStart,
    });
    beamGroup = [];
  }

  function flushTupletGroup() {
    if (!tupletGroup || tupletGroup.entries.length < 1) {
      tupletGroup = null;
      return;
    }
    const first = tupletGroup.entries[0];
    const last = tupletGroup.entries[tupletGroup.entries.length - 1];
    const x = first.stemX;
    const w = (last.stemX + last.stemW) - x;
    pushGlyph(glyphs, {
      kind: 'tupletBracket',
      lane: 'rhythm',
      x,
      y: stemY + stemH + 2,
      w: Math.max(stemW, w),
      h: Math.max(6, fontPx * 0.35),
      text: String(tupletGroup.num),
      aria: `Tuplet ${tupletGroup.num}`,
      beatStart: first.beatStart,
    });
    tupletGroup = null;
  }

  for (const col of cols) {
    const beat = col.beat;
    const x = col.xLeft;
    const beatStart = beat.start;

    if (beat.rest) {
      flushTupletGroup();
      pushGlyph(glyphs, {
        kind: 'rest',
        lane: 'rhythm',
        x: x + 2,
        y: rhythmLane.y + rhythmLane.h * 0.2,
        w: Math.max(6, fontPx * 0.55),
        h: Math.max(8, fontPx * 0.7),
        text: '𝄽',
        aria: 'Rest',
        beatStart,
      });
      flushBeam();
      continue;
    }

    const stemX = x + Math.max(4, fontPx * 0.35);
    const stemIdx = pushGlyph(glyphs, {
      kind: 'stem',
      lane: 'rhythm',
      x: stemX,
      y: stemY,
      w: stemW,
      h: stemH,
      text: '',
      aria: 'Stem',
      beatStart,
    });

    if (beat.noteValue >= 8) {
      pushGlyph(glyphs, {
        kind: 'flag',
        lane: 'rhythm',
        x: stemX,
        y: stemY,
        w: Math.max(4, fontPx * 0.35),
        h: Math.max(6, fontPx * 0.45),
        text: '',
        aria: 'Flag',
        beatStart,
      });
      const entry = { x: stemX, w: stemW, beatStart };
      if (beamGroup.length && beat.noteValue >= 8) beamGroup.push(entry);
      else {
        flushBeam();
        beamGroup = [entry];
      }
    } else {
      flushBeam();
    }

    if (beat.dots > 0) {
      pushGlyph(glyphs, {
        kind: 'dot',
        lane: 'rhythm',
        x: stemX + stemW + 2,
        y: stemY + stemH * 0.55,
        w: Math.max(3, fontPx * 0.15),
        h: Math.max(3, fontPx * 0.15),
        text: '·',
        aria: 'Dot',
        beatStart,
      });
    }

    if (beat.tuplet) {
      const num = beat.tuplet.num;
      if (!tupletGroup || tupletGroup.num !== num) {
        flushTupletGroup();
        tupletGroup = { num, entries: [] };
      }
      tupletGroup.entries.push({ stemX, stemW, beatStart });
    } else {
      flushTupletGroup();
    }

    void stemIdx;
  }
  flushBeam();
  flushTupletGroup();
}

function xForBeat(cols, beatStart, fontPx) {
  const col = cols.find((c) => Math.abs(c.beat.start - beatStart) < 1e-4);
  const originOffset = noteOriginOffset(fontPx);
  return col ? col.xLeft + originOffset : BAR_PAD_START + originOffset;
}

function findNearestPrevEvent(events, ev, { allowGrace = false } = {}) {
  let prev = null;
  let prevStart = -Infinity;
  for (const e of events) {
    if (e.stringIndex !== ev.stringIndex) continue;
    const start = Number(e.start);
    if (start >= Number(ev.start) - 1e-4) continue;
    if (!allowGrace && e.grace) continue;
    if (start > prevStart) {
      prev = e;
      prevStart = start;
    }
  }
  return prev;
}

function findNearestNextEvent(events, ev) {
  let next = null;
  let nextStart = Infinity;
  for (const e of events) {
    if (e.stringIndex !== ev.stringIndex) continue;
    if (e.grace) continue;
    const start = Number(e.start);
    if (start <= Number(ev.start) + 1e-4) continue;
    if (start < nextStart) {
      next = e;
      nextStart = start;
    }
  }
  return next;
}

function addTabGlyphs(glyphs, lanes, bar, cols, contentW, fontPx, drumMode, strings, drumLanes, warnings) {
  const tabLane = laneByName(lanes, 'tabStaff');
  const useDrumRows = drumMode && drumLanes.length > 0;
  const rowCount = useDrumRows ? drumLanes.length : Math.max(1, strings.length);
  const stringH = tabLane.h / rowCount;

  for (const ev of bar.events) {
    const beatStart = Number(ev.start);
    let row;
    let si;
    if (useDrumRows) {
      const laneKey = drumLaneFor(ev.instrument)?.key;
      let idx = drumLanes.indexOf(laneKey);
      if (idx < 0) {
        idx = drumLanes.length - 1;
        const warning = `Unknown drum instrument: ${ev.instrument ?? 'missing'}`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
      row = idx;
      si = row;
    } else {
      si = Number(ev.stringIndex) || 0;
      row = Math.max(0, Math.min(rowCount - 1, rowCount - 1 - si));
    }
    const y = tabLane.y + row * stringH + stringH * 0.15;
    const w = Math.max(fontPx * 0.7, String(ev.fret ?? '').length * fontPx * 0.55);
    // A grace note sounds before the main note of the beat, so it must draw
    // to the left of it. Both notes share one beat position, and without
    // this shift the two numbers sit on top of each other.
    const graceShift = ev.grace ? w * 0.9 + fontPx * 0.2 : 0;
    const xCenter = xForBeat(cols, beatStart, fontPx) - graceShift;

    if (ev.dead) {
      pushGlyph(glyphs, {
        kind: 'deadNote',
        lane: 'tabStaff',
        x: xCenter - w / 2,
        y,
        w,
        h: stringH * 0.7,
        text: 'x',
        aria: TECHNIQUE_ARIA.dead,
        beatStart,
        stringIndex: si,
      });
      continue;
    }

    if (drumMode) {
      pushGlyph(glyphs, {
        kind: 'drumHit',
        lane: 'tabStaff',
        x: xCenter - w / 2,
        y,
        w,
        h: stringH * 0.7,
        text: drumTabGlyph(ev),
        aria: drumHitLabel(ev),
        beatStart,
        stringIndex: si,
        grace: !!ev.grace,
        eventRef: ev,
      });
      continue;
    }

    pushGlyph(glyphs, {
      kind: 'fret',
      lane: 'tabStaff',
      x: xCenter - w / 2,
      y,
      w,
      h: stringH * 0.7,
      text: ev.fret != null ? String(ev.fret) : '',
      aria: `Fret ${ev.fret}`,
      beatStart,
      stringIndex: si,
      grace: !!ev.grace,
      eventRef: ev,
    });
  }
}

function addTechniqueGlyphs(glyphs, overlayRecords, lanes, bar, cols, contentW, fontPx) {
  const above = laneByName(lanes, 'techniqueAbove');
  const below = laneByName(lanes, 'techniqueBelow');

  for (const ev of bar.events) {
    const techs = [...(ev.techniques || [])];
    if (ev.dead && !techs.includes('dead')) techs.push('dead');
    const beat = bar.beats.find((b) => Math.abs(b.start - Number(ev.start)) < 1e-4);
    const col = cols.find((c) => Math.abs(c.beat.start - Number(ev.start)) < 1e-4);
    const x = col ? col.xLeft : BAR_PAD_START;
    const beatStart = Number(ev.start);

    let noteIdx = -1;
    for (let i = 0; i < glyphs.length; i += 1) {
      const g = glyphs[i];
      if (g.eventRef === ev || (g.kind === 'fret' && g.beatStart === beatStart && g.stringIndex === ev.stringIndex)) {
        noteIdx = i;
        break;
      }
    }

    for (const tech of techs) {
      if (tech === 'dead') continue;
      if (!TECHNIQUE_ARIA[tech]) continue;
      const laneName = TECHNIQUE_ABOVE.has(tech) ? 'techniqueAbove' : 'techniqueBelow';
      const lane = laneName === 'techniqueAbove' ? above : below;
      const techIdx = pushGlyph(glyphs, {
        kind: 'technique',
        lane: laneName,
        x: x + 1,
        y: lane.y + lane.h * 0.1,
        w: Math.max(8, fontPx * 0.65),
        h: Math.max(8, fontPx * 0.75),
        text: TECHNIQUE_TEXT[tech] || tech,
        aria: TECHNIQUE_ARIA[tech],
        beatStart,
        techId: tech,
      });

      if (tech === 'bend' && ev.bend) {
        pushGlyph(glyphs, {
          kind: 'bendValue',
          lane: 'techniqueAbove',
          x: x + fontPx * 0.5,
          y: above.y,
          w: Math.max(8, fontPx * 0.5),
          h: Math.max(8, fontPx * 0.6),
          text: formatBendAmount(ev.bend),
          aria: `Bend amount ${formatBendAmount(ev.bend)}`,
          beatStart,
        });
        if (noteIdx >= 0) {
          overlayRecords.push({
            kind: 'bend',
            fromIndex: noteIdx,
            toIndex: techIdx,
          });
        }
      }

      if ((tech === 'hammer' || tech === 'pull') && noteIdx >= 0) {
        const prev = findNearestPrevEvent(bar.events, ev, { allowGrace: false });
        if (prev) {
          let prevIdx = -1;
          for (let i = 0; i < glyphs.length; i += 1) {
            const g = glyphs[i];
            if (g.eventRef === prev || (g.kind === 'fret' && g.stringIndex === prev.stringIndex && g.beatStart === prev.start)) {
              prevIdx = i;
              break;
            }
          }
          if (prevIdx >= 0) {
            overlayRecords.push({
              kind: 'slur',
              fromIndex: prevIdx,
              toIndex: noteIdx,
            });
          }
        }
      }
    }

    if (ev.slideKind) {
      const lane = below;
      const slideIdx = pushGlyph(glyphs, {
        kind: 'technique',
        lane: 'techniqueBelow',
        x: x + 1,
        y: lane.y + lane.h * 0.1,
        w: Math.max(8, fontPx * 0.65),
        h: Math.max(8, fontPx * 0.75),
        text: TECHNIQUE_TEXT.slide,
        aria: TECHNIQUE_ARIA.slide,
        beatStart,
        techId: 'slide',
      });
      if (noteIdx >= 0) {
        // A slide joins two frets on one string. Aim at the next note on that
        // string, and fall back to the slide letter when the bar holds none.
        const next = findNearestNextEvent(bar.events, ev);
        let nextIdx = -1;
        if (next) {
          for (let i = 0; i < glyphs.length; i += 1) {
            const g = glyphs[i];
            if (g.eventRef === next
              || (g.kind === 'fret' && g.stringIndex === next.stringIndex && g.beatStart === next.start)) {
              nextIdx = i;
              break;
            }
          }
        }
        overlayRecords.push({
          kind: 'slide',
          fromIndex: noteIdx,
          toIndex: nextIdx >= 0 ? nextIdx : slideIdx,
        });
      }
    }

    if (ev.tie && noteIdx >= 0) {
      const prev = findNearestPrevEvent(bar.events, ev, { allowGrace: true });
      if (prev) {
        let prevIdx = -1;
        for (let i = 0; i < glyphs.length; i += 1) {
          const g = glyphs[i];
          if (g.eventRef === prev) { prevIdx = i; break; }
        }
        if (prevIdx >= 0) {
          overlayRecords.push({
            kind: 'tie',
            fromIndex: prevIdx,
            toIndex: noteIdx,
          });
        }
      }
    }

    // Beat-level techniques (tap, slap, pop)
    if (beat?.techniques?.length) {
      for (const tech of beat.techniques) {
        if (!TECHNIQUE_ARIA[tech]) continue;
        pushGlyph(glyphs, {
          kind: 'technique',
          lane: TECHNIQUE_ABOVE.has(tech) ? 'techniqueAbove' : 'techniqueBelow',
          x: x + 1,
          y: (TECHNIQUE_ABOVE.has(tech) ? above : below).y,
          w: Math.max(8, fontPx * 0.65),
          h: Math.max(8, fontPx * 0.75),
          text: TECHNIQUE_TEXT[tech] || tech,
          aria: TECHNIQUE_ARIA[tech],
          beatStart,
          techId: tech,
        });
      }
    }

    void beat;
  }
}

function addNotationGlyphs(glyphs, lanes, cols, contentW, fontPx, bar, strings) {
  const lane = laneByName(lanes, 'notationStaff');
  if (!lane.h) return;

  pushGlyph(glyphs, {
    kind: 'technique',
    lane: 'notationStaff',
    x: 2,
    y: lane.y + lane.h * 0.55,
    w: Math.max(10, fontPx * 0.8),
    h: Math.max(8, fontPx * 0.6),
    text: '8vb',
    aria: 'Octave down',
    beatStart: 0,
  });

  const lineCount = 5;
  for (let i = 0; i < lineCount; i += 1) {
    pushGlyph(glyphs, {
      kind: 'beam',
      lane: 'notationStaff',
      x: BAR_PAD_START,
      y: lane.y + ((i + 1) / (lineCount + 1)) * lane.h,
      w: 0,
      h: 1,
      text: '',
      aria: 'Staff line',
      beatStart: 0,
    });
  }

  const stringCount = Math.max(1, strings.length);
  const originOffset = noteOriginOffset(fontPx);
  for (const col of cols) {
    if (col.beat.rest) continue;
    const x = col.xLeft + originOffset;
    for (const idx of col.beat.noteIndices || []) {
      const ev = bar.events[idx];
      if (!ev?.midi) continue;
      const row = Math.max(0, Math.min(stringCount - 1, stringCount - 1 - (ev.stringIndex || 0)));
      const y = lane.y + lane.h * (0.2 + (row / stringCount) * 0.6);
      pushGlyph(glyphs, {
        kind: 'fret',
        lane: 'notationStaff',
        x: x - fontPx * 0.25,
        y,
        w: Math.max(6, fontPx * 0.45),
        h: Math.max(6, fontPx * 0.45),
        text: '♪',
        aria: `Pitch ${ev.midi}`,
        beatStart: col.beat.start,
      });
    }
  }
}

function addMeasureChrome(glyphs, lanes, bar, options, contentW, fontPx) {
  pushGlyph(glyphs, {
    kind: 'barNumber',
    lane: 'techniqueAbove',
    x: 2,
    y: 0,
    w: Math.max(10, fontPx * 0.8),
    h: Math.max(8, fontPx * 0.7),
    text: String(options.barIndex + 1),
    aria: `Bar ${options.barIndex + 1}`,
    beatStart: 0,
  });

  if (bar.measure.marker) {
    pushGlyph(glyphs, {
      kind: 'marker',
      lane: 'techniqueAbove',
      x: 14,
      y: 0,
      w: Math.max(20, bar.measure.marker.length * fontPx * 0.35),
      h: Math.max(8, fontPx * 0.7),
      text: bar.measure.marker,
      aria: `Section ${bar.measure.marker}`,
      beatStart: 0,
    });
  }

  const timeSig = bar.measure.timeSig;
  const prev = options.prevTimeSig;
  const changed = options.barIndex === 0
    || (timeSig && prev && (timeSig[0] !== prev[0] || timeSig[1] !== prev[1]));
  if (changed && timeSig) {
    const rhythmLane = laneByName(lanes, 'rhythm');
    pushGlyph(glyphs, {
      kind: 'timeSig',
      lane: 'rhythm',
      x: 2,
      y: rhythmLane.y,
      w: Math.max(12, fontPx * 0.9),
      h: Math.max(14, fontPx * 1.1),
      text: formatTimeSig(timeSig),
      aria: `Time signature ${formatTimeSig(timeSig)}`,
      beatStart: 0,
    });
  }

  const repeat = bar.measure.repeat;
  if (repeat?.open) {
    pushGlyph(glyphs, {
      kind: 'repeatOpen',
      lane: 'tabStaff',
      x: 0,
      y: 0,
      w: Math.max(6, fontPx * 0.4),
      h: Math.max(12, fontPx * 0.9),
      text: '𝄆',
      aria: 'Repeat open',
      beatStart: 0,
    });
  }
  if (repeat?.closeCount != null) {
    pushGlyph(glyphs, {
      kind: 'repeatClose',
      lane: 'tabStaff',
      x: contentW + BAR_PAD_START,
      y: 0,
      w: Math.max(6, fontPx * 0.4),
      h: Math.max(12, fontPx * 0.9),
      text: `𝄇×${repeat.closeCount}`,
      aria: `Repeat close ${repeat.closeCount}`,
      beatStart: 0,
    });
  }
  if (repeat?.endings?.length) {
    const label = repeat.endings.join(',');
    pushGlyph(glyphs, {
      kind: 'volta',
      lane: 'techniqueAbove',
      x: BAR_PAD_START,
      y: 0,
      w: Math.max(16, label.length * fontPx * 0.45),
      h: Math.max(8, fontPx * 0.65),
      text: `${label}.`,
      aria: `Volta ending ${label}`,
      beatStart: 0,
    });
  }

  if (options.barIndex === 0 && options.isFirstSystem && options.tuningLabel) {
    pushGlyph(glyphs, {
      kind: 'tuning',
      lane: 'techniqueBelow',
      x: 2,
      // The glyph y counts from the top of the bar, so it must start at the
      // top of its own lane. A y of 0 put this label over the staff.
      y: laneByName(lanes, 'techniqueBelow').y,
      w: Math.max(40, options.tuningLabel.length * fontPx * 0.3),
      h: Math.max(8, fontPx * 0.65),
      text: options.tuningLabel,
      aria: options.tuningLabel,
      beatStart: 0,
    });
  }
}

/**
 * Map a beat to x in layout units for a bar layout result.
 */
export function beatXUnits(barLayout, beat) {
  const beatNum = Number(beat);
  const columns = barLayout.columns;
  const origin = barLayout.noteOriginUnits;
  const contentW = barLayout.contentWidthUnits;
  const barEnd = barLayout.beatStart + barLayout.beatSpan;
  const barEndX = origin + contentW;

  if (!columns?.length) {
    const rel = (beatNum - barLayout.beatStart) / barLayout.beatSpan;
    const clampedRel = Math.max(0, Math.min(1, rel));
    return origin + clampedRel * contentW;
  }

  const sorted = [...columns].sort((a, b) => a.beat - b.beat);

  if (beatNum <= sorted[0].beat + 1e-6) {
    return sorted[0].x;
  }

  if (beatNum >= sorted[sorted.length - 1].beat - 1e-6) {
    const last = sorted[sorted.length - 1];
    if (beatNum >= barEnd - 1e-6) return barEndX;
    const span = barEnd - last.beat;
    if (span < 1e-9) return last.x;
    const t = (beatNum - last.beat) / span;
    return last.x + t * (barEndX - last.x);
  }

  for (let i = 0; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i].beat - beatNum) < 1e-4) {
      return sorted[i].x;
    }
    if (i < sorted.length - 1
      && beatNum > sorted[i].beat + 1e-6
      && beatNum < sorted[i + 1].beat - 1e-6) {
      const span = sorted[i + 1].beat - sorted[i].beat;
      const t = (beatNum - sorted[i].beat) / span;
      return sorted[i].x + t * (sorted[i + 1].x - sorted[i].x);
    }
  }

  return barEndX;
}

/**
 * Map x in layout units to a beat inside the bar.
 */
export function beatFromXUnits(barLayout, xUnits) {
  const columns = barLayout.columns;
  const origin = barLayout.noteOriginUnits;
  const contentW = barLayout.contentWidthUnits;
  const barEnd = barLayout.beatStart + barLayout.beatSpan;
  const barEndX = origin + contentW;

  if (!columns?.length) {
    const rel = (xUnits - origin) / contentW;
    const clampedRel = Math.max(0, Math.min(1, rel));
    return barLayout.beatStart + clampedRel * barLayout.beatSpan;
  }

  const sorted = [...columns].sort((a, b) => a.beat - b.beat);

  if (xUnits <= sorted[0].x + 1e-6) {
    return sorted[0].beat;
  }

  if (xUnits >= barEndX - 1e-6) {
    return barEnd;
  }

  if (xUnits >= sorted[sorted.length - 1].x - 1e-6) {
    const last = sorted[sorted.length - 1];
    const span = barEndX - last.x;
    if (span < 1e-9) return last.beat;
    const t = (xUnits - last.x) / span;
    return last.beat + t * (barEnd - last.beat);
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (xUnits >= sorted[i].x - 1e-6 && xUnits <= sorted[i + 1].x + 1e-6) {
      const span = sorted[i + 1].x - sorted[i].x;
      if (span < 1e-9) return sorted[i].beat;
      const t = (xUnits - sorted[i].x) / span;
      return sorted[i].beat + t * (sorted[i + 1].beat - sorted[i].beat);
    }
  }

  return barEnd;
}

/**
 * Layout one written bar.
 * @param {object} bar - bar slice from layoutScore
 * @param {object} options
 * @returns {import('./scoreLayout.js').BarLayout}
 */
export function layoutBar(bar, options = {}) {
  const opts = defaultOptions(options);
  const warnings = [];
  const fontPx = clampFontPx(opts.widthPx, opts.zoom, opts.minFretFontPx);
  // Every glyph box, every lane, and every bar width uses layout units. The
  // view multiplies a unit by fontPx / LAYOUT_BASE_PX when it draws. Geometry
  // must therefore use the base size, not fontPx. When geometry used fontPx,
  // a wide screen made each glyph box grow twice and the fret numbers ran
  // into each other.
  const geoPx = LAYOUT_BASE_PX;
  const stringCount = Math.max(1, (bar.strings || []).length);
  const { lanes, stringH } = laneLayout({
    fontPx: geoPx,
    stringCount,
    showNotationStaff: opts.showNotationStaff,
    showRhythm: opts.showRhythm,
    drumMode: opts.drumMode,
    drumLanes: opts.drumLanes,
  });

  // A bar can hold more written time than its time signature names. The
  // layout must span the real content, or every late note clamps to the bar
  // end and the notes pile up away from their rhythm marks.
  const { len: nominalLen, start: barStart } = measureSpan(bar.measure);
  let contentLen = nominalLen;
  for (const beat of bar.beats) {
    contentLen = Math.max(contentLen, beat.start - barStart + (beat.duration || 0));
  }
  for (const rest of bar.rests) {
    contentLen = Math.max(contentLen, rest.start - barStart + (rest.duration || 0));
  }
  for (const ev of bar.events) {
    if (!Number.isFinite(ev.start)) continue;
    contentLen = Math.max(contentLen, ev.start - barStart + (ev.duration || 0));
  }
  const measureLen = Math.max(0.25, contentLen);
  const cols = beatColumns(bar, measureLen);
  const {
    contentW,
    idealContentW,
    columns,
    originOffset,
  } = placeSpringColumns(bar, cols, measureLen, geoPx, opts);
  const widthUnits = BAR_PAD_START + contentW + BAR_PAD_END;
  const minWidthUnits = opts.fixedMinWidthUnits > 0
    ? opts.fixedMinWidthUnits
    : BAR_PAD_START + idealContentW + BAR_PAD_END;
  const noteOriginUnits = BAR_PAD_START + originOffset;

  for (const lane of lanes) lane.w = widthUnits;

  const glyphs = [];
  const overlayRecords = [];

  addMeasureChrome(glyphs, lanes, bar, opts, contentW, geoPx);
  addRhythmGlyphs(glyphs, overlayRecords, lanes, cols, contentW, geoPx, opts.showRhythm);
  addTabGlyphs(glyphs, lanes, bar, cols, contentW, geoPx, opts.drumMode, bar.strings || [], opts.drumLanes, warnings);
  addTechniqueGlyphs(glyphs, overlayRecords, lanes, bar, cols, contentW, geoPx);

  if (opts.showNotationStaff) {
    addNotationGlyphs(glyphs, lanes, cols, contentW, geoPx, bar, bar.strings || []);
  }

  // Grow a lane that its own glyphs outgrow, then push the later lanes down.
  // Without this step a tall glyph reaches past its lane, and the rhythm
  // ticks then sit on top of the fret numbers above them.
  fitLanesToGlyphs(lanes, glyphs);

  const overlays = buildOverlayPaths(glyphs, overlayRecords);

  // Strip internal refs before return.
  for (const g of glyphs) {
    delete g.eventRef;
    if (g.techId && !TECHNIQUE_ARIA[g.techId]) {
      warnings.push(`Unknown technique id: ${g.techId}`);
    }
  }

  void stringH;

  const result = {
    barIndex: opts.barIndex,
    widthUnits,
    minWidthUnits,
    fontPx,
    lanes,
    glyphs,
    overlays,
    warnings,
    beatStart: barStart,
    beatSpan: measureLen,
    noteOriginUnits,
    contentWidthUnits: contentW,
    columns,
    totalHeightUnits: totalHeightFromLanes(lanes),
    // The first and the last beat column of the bar. A caller that moves a
    // cursor needs these, because the bar holds padding at each end that no
    // column stands in.
    firstColumnBeat: cols.length ? barStart + cols[0].relStart * measureLen : barStart,
    lastColumnBeat: cols.length
      ? barStart + cols[cols.length - 1].relStart * measureLen
      : barStart,
  };
  if (opts.retainOverlayRecords) {
    result._overlayRecords = overlayRecords;
  }
  return result;
}

// The caller passes the width it has, measured in layout units. Geometry and
// width therefore share one space, and no value needs a second scale here.
function availableWidthPx(widthPx) {
  return Math.max(100, widthPx - VIEWPORT_PAD - GUTTER_UNITS);
}

const FIRST_FRAGMENT_ONLY_KINDS = new Set([
  'barNumber', 'marker', 'timeSig', 'repeatOpen', 'volta', 'tuning',
]);
const LAST_FRAGMENT_ONLY_KINDS = new Set(['repeatClose']);
const SPANNING_GLYPH_KINDS = new Set(['beam', 'tupletBracket']);

/**
 * Width of a column-range fragment before stretch.
 */
function fragmentWidthUnits(bar, colStart, colEnd, isContinuation, isLastFragment) {
  const cols = bar.columns || [];
  if (!cols.length) return bar.widthUnits;

  const startPad = isContinuation ? CONTINUATION_PAD_START : BAR_PAD_START;
  const endPad = isLastFragment ? BAR_PAD_END : CONTINUATION_PAD_END;
  const firstCol = cols[colStart];
  const lastCol = cols[colEnd - 1];
  const contentW = (lastCol.xLeft + lastCol.advance) - firstCol.xLeft;
  return startPad + contentW + endPad;
}

/**
 * Slice a full bar layout to a column-range fragment ready to draw.
 */
function sliceBarLayout(bar, { colStart, colEnd, isContinuation, isLastFragment }) {
  const cols = bar.columns || [];
  const sliceCols = cols.slice(colStart, colEnd);

  const startPad = isContinuation ? CONTINUATION_PAD_START : BAR_PAD_START;
  const endPad = isLastFragment ? BAR_PAD_END : CONTINUATION_PAD_END;

  if (!sliceCols.length) {
    return {
      ...bar,
      widthUnits: bar.widthUnits,
      contentWidthUnits: bar.contentWidthUnits,
      noteOriginUnits: bar.noteOriginUnits,
      columns: [],
      glyphs: [...bar.glyphs],
      overlays: [...bar.overlays],
      lanes: bar.lanes.map((l) => ({ ...l, w: bar.widthUnits })),
      isContinuation,
      fragmentColStart: colStart,
      fragmentColEnd: colEnd,
      firstColumnBeat: bar.firstColumnBeat,
      lastColumnBeat: bar.lastColumnBeat,
    };
  }

  const firstCol = sliceCols[0];
  const lastCol = sliceCols[sliceCols.length - 1];
  const xShift = firstCol.xLeft - startPad;
  const contentW = (lastCol.xLeft + lastCol.advance) - firstCol.xLeft;
  const widthUnits = startPad + contentW + endPad;
  const noteOriginUnits = startPad + (firstCol.x - firstCol.xLeft);

  const firstBeat = firstCol.beat;
  const lastBeat = lastCol.beat;

  const shiftX = (x) => x - xShift;

  const newColumns = sliceCols.map((c) => ({
    beat: c.beat,
    x: shiftX(c.x),
    xLeft: shiftX(c.xLeft),
    advance: c.advance,
    relStart: c.relStart,
  }));

  const newGlyphs = [];
  const oldToNew = new Map();

  for (let i = 0; i < bar.glyphs.length; i += 1) {
    const g = bar.glyphs[i];
    const beatStart = g.beatStart;

    if (FIRST_FRAGMENT_ONLY_KINDS.has(g.kind)) {
      if (!isContinuation) {
        oldToNew.set(i, newGlyphs.length);
        newGlyphs.push({ ...g, x: shiftX(g.x) });
      }
      continue;
    }
    if (LAST_FRAGMENT_ONLY_KINDS.has(g.kind)) {
      if (isLastFragment) {
        oldToNew.set(i, newGlyphs.length);
        newGlyphs.push({ ...g, x: shiftX(g.x) });
      }
      continue;
    }

    if (SPANNING_GLYPH_KINDS.has(g.kind)) {
      const nx = shiftX(g.x);
      const right = nx + g.w;
      if (right < 0 || nx > widthUnits) continue;
      const cx = Math.max(0, nx);
      const cw = Math.min(widthUnits, right) - cx;
      if (cw <= 0) continue;
      oldToNew.set(i, newGlyphs.length);
      newGlyphs.push({ ...g, x: cx, w: cw });
      continue;
    }

    if (beatStart != null) {
      if (FIRST_FRAGMENT_ONLY_KINDS.has(g.kind) || LAST_FRAGMENT_ONLY_KINDS.has(g.kind)) {
        // Handled above.
      } else if (beatStart < firstBeat - 1e-4 || beatStart > lastBeat + 1e-4) {
        continue;
      }
    }

    oldToNew.set(i, newGlyphs.length);
    newGlyphs.push({ ...g, x: shiftX(g.x) });
  }

  const overlayRecords = (bar._overlayRecords || [])
    .map((rec) => {
      const fromIndex = oldToNew.get(rec.fromIndex);
      const toIndex = oldToNew.get(rec.toIndex);
      if (fromIndex == null || toIndex == null) return null;
      return { ...rec, fromIndex, toIndex };
    })
    .filter(Boolean);

  const overlays = buildOverlayPaths(newGlyphs, overlayRecords);
  const lanes = bar.lanes.map((l) => ({ ...l, w: widthUnits }));

  return {
    barIndex: bar.barIndex,
    widthUnits,
    minWidthUnits: bar.minWidthUnits,
    fontPx: bar.fontPx,
    lanes,
    glyphs: newGlyphs,
    overlays,
    warnings: bar.warnings,
    beatStart: bar.beatStart,
    beatSpan: bar.beatSpan,
    noteOriginUnits,
    contentWidthUnits: contentW,
    columns: newColumns,
    totalHeightUnits: bar.totalHeightUnits,
    firstColumnBeat: firstBeat,
    lastColumnBeat: lastBeat,
    isContinuation,
    fragmentColStart: colStart,
    fragmentColEnd: colEnd,
  };
}

/**
 * Split a bar that is wider than one row into column-range parts.
 * @returns {object[]} part descriptors (no layout yet)
 */
function splitBarIntoParts(barIndex, bar, available) {
  const cols = bar.columns || [];
  if (!cols.length) {
    return [{
      barIndex,
      colStart: 0,
      colEnd: 0,
      isContinuation: false,
      isLastFragment: true,
      widthUnits: bar.widthUnits,
    }];
  }

  const parts = [];
  let colStart = 0;
  let isContinuation = false;

  while (colStart < cols.length) {
    let colEnd = colStart + 1;
    const isLastPossible = () => colEnd >= cols.length;

    while (!isLastPossible()) {
      const nextEnd = colEnd + 1;
      const isLast = nextEnd >= cols.length;
      const w = fragmentWidthUnits(bar, colStart, nextEnd, isContinuation, isLast);
      if (w > available + 1e-6) break;
      colEnd = nextEnd;
    }

    const isLastFragment = colEnd >= cols.length;
    const widthUnits = fragmentWidthUnits(bar, colStart, colEnd, isContinuation, isLastFragment);
    parts.push({
      barIndex,
      colStart,
      colEnd,
      isContinuation,
      isLastFragment,
      widthUnits,
    });
    colStart = colEnd;
    isContinuation = true;
  }

  return parts;
}

function makeWholeBarPart(barIndex, bar) {
  const colCount = bar.columns?.length || 0;
  return {
    barIndex,
    colStart: 0,
    colEnd: colCount,
    isContinuation: false,
    isLastFragment: true,
    widthUnits: bar.widthUnits,
  };
}

function packSystems(bars, widthPx, maxPerSystem) {
  const available = availableWidthPx(widthPx);
  const systems = [];
  let i = 0;

  while (i < bars.length) {
    const row = [];
    let sum = 0;

    while (i < bars.length && row.length < maxPerSystem) {
      const bar = bars[i];
      if (row.length > 0 && sum + bar.widthUnits > available + 1e-6) break;
      if (row.length === 0 && bar.widthUnits > available + 1e-6) break;
      row.push(i);
      sum += bar.widthUnits;
      i += 1;
    }

    if (row.length > 0) {
      const parts = row.map((idx) => makeWholeBarPart(idx, bars[idx]));
      systems.push({
        barIndices: [...row],
        widthPx: available,
        parts,
      });
      continue;
    }

    // One measure is wider than the row. Split it across systems.
    const barIndex = i;
    const bar = bars[barIndex];
    const barParts = splitBarIntoParts(barIndex, bar, available);
    for (const part of barParts) {
      systems.push({
        barIndices: [barIndex],
        widthPx: available,
        parts: [part],
      });
    }
    i += 1;
  }

  return systems;
}

function isCompleteBarPart(part, bar) {
  const colCount = bar.columns?.length || 0;
  return !part.isContinuation
    && part.isLastFragment
    && part.colStart === 0
    && part.colEnd === colCount;
}

function isCompleteBarSystem(system, bars) {
  return system.parts.every((p) => isCompleteBarPart(p, bars[p.barIndex]));
}

// The view draws a bar at the width the layout reports, and it draws every
// glyph at a fixed unit position inside that bar. A row must therefore fill
// its width here, in the layout. When CSS grew the bar instead, the bar line
// moved but the notes stayed, and the playhead could not match either one.
function stretchSystemsToWidth(model, bars, systems, opts, barMeta) {
  for (const system of systems) {
    if (!isCompleteBarSystem(system, bars)) continue;

    const indices = system.barIndices;
    const sumWidth = indices.reduce((s, i) => s + bars[i].widthUnits, 0);
    const leftover = system.widthPx - sumWidth;
    if (leftover <= 1e-6) continue;

    const totalContent = indices.reduce((s, i) => s + bars[i].contentWidthUnits, 0);
    for (const idx of indices) {
      const bar = bars[idx];
      const share = totalContent > 0
        ? bar.contentWidthUnits / totalContent
        : 1 / indices.length;
      const targetContent = bar.contentWidthUnits + leftover * share;
      const slice = buildBarSlice(model, idx);
      const meta = barMeta[idx];
      const newBar = layoutBar(slice, {
        ...opts,
        minContentUnits: targetContent,
        maxContentUnits: targetContent,
        barIndex: idx,
        prevTimeSig: meta.prevTimeSig,
        tuningLabel: meta.tuningLabel,
        isFirstSystem: meta.isFirstSystem,
        fixedMinWidthUnits: meta.minWidthUnits,
        retainOverlayRecords: true,
      });
      bars[idx] = newBar;
    }

    for (const part of system.parts) {
      const bar = bars[part.barIndex];
      part.widthUnits = bar.widthUnits;
    }
  }
}

/**
 * Grow split-fragment systems so each row fills its width. Notes do not move.
 */
function stretchFragmentSystems(systems, bars) {
  for (const system of systems) {
    if (isCompleteBarSystem(system, bars)) continue;

    const sumWidth = system.parts.reduce((s, p) => s + p.widthUnits, 0);
    const leftover = system.widthPx - sumWidth;
    if (leftover <= 1e-6) continue;

    for (const part of system.parts) {
      const share = sumWidth > 0 ? part.widthUnits / sumWidth : 1 / system.parts.length;
      const extra = leftover * share;
      part.widthUnits += extra;
      if (part.layout) {
        part.layout.widthUnits += extra;
        part.layout.contentWidthUnits += extra;
        for (const lane of part.layout.lanes) {
          lane.w = part.layout.widthUnits;
        }
      }
    }
  }
}

/**
 * Build part.layout from full bars (slice or alias).
 */
function buildPartLayouts(systems, bars) {
  for (const system of systems) {
    for (const part of system.parts) {
      const bar = bars[part.barIndex];
      if (isCompleteBarPart(part, bar)) {
        part.layout = bar;
        part.widthUnits = bar.widthUnits;
      } else {
        part.layout = sliceBarLayout(bar, part);
        part.widthUnits = part.layout.widthUnits;
      }
    }
  }
}

/**
 * Layout a full track model.
 * @param {object} model
 * @param {object} options
 */
export function layoutScore(model, options = {}) {
  const opts = defaultOptions(options);
  const warnings = [];
  const fontPx = clampFontPx(opts.widthPx, opts.zoom, opts.minFretFontPx);

  if (!model?.measures?.length) {
    return { bars: [], systems: [], fontPx, warnings, laneStack: [], totalHeightUnits: 0 };
  }

  // With one measure per row the bar must fill the row. A narrow bar in a
  // wide row wastes the space that the fret numbers need.
  const minContentUnits = opts.maxMeasuresPerSystem === 1
    ? Math.max(0, availableWidthPx(opts.widthPx) - BAR_PAD_START - BAR_PAD_END)
    : opts.minContentUnits;

  const bars = [];
  const barMeta = [];
  let prevTimeSig = null;
  for (let i = 0; i < model.measures.length; i += 1) {
    const slice = buildBarSlice(model, i);
    const barLayout = layoutBar(slice, {
      ...opts,
      minContentUnits,
      maxContentUnits: opts.maxContentUnits || 0,
      barIndex: i,
      prevTimeSig,
      tuningLabel: slice.tuningLabel,
      isFirstSystem: i === 0,
      retainOverlayRecords: true,
    });
    barMeta.push({
      prevTimeSig,
      tuningLabel: slice.tuningLabel,
      isFirstSystem: i === 0,
      minWidthUnits: barLayout.minWidthUnits,
    });
    bars.push(barLayout);
    warnings.push(...barLayout.warnings);
    if (slice.measure.timeSig) prevTimeSig = slice.measure.timeSig;
  }

  const systems = packSystems(bars, opts.widthPx, opts.maxMeasuresPerSystem);

  const { laneStack, totalHeightUnits } = applySharedLaneStack(bars);

  stretchSystemsToWidth(model, bars, systems, {
    ...opts,
    minContentUnits: 0,
    maxContentUnits: 0,
  }, barMeta);

  buildPartLayouts(systems, bars);
  stretchFragmentSystems(systems, bars);

  for (const bar of bars) {
    delete bar._overlayRecords;
  }

  return { bars, systems, fontPx, warnings, laneStack, totalHeightUnits };
}

export const ROW_CHROME_UNITS = VIEWPORT_PAD + GUTTER_UNITS;

/**
 * The widest one-column fragment in a layout. Wrap can split a measure, so
 * the view must fit this width, not the full measure.
 */
export function maxAtomicWidthUnits(scoreLayout) {
  let widest = 0;
  for (const bar of scoreLayout?.bars || []) {
    const cols = bar.columns || [];
    if (!cols.length) {
      widest = Math.max(widest, bar.minWidthUnits ?? bar.widthUnits ?? 0);
      continue;
    }
    for (const col of cols) {
      const w = BAR_PAD_START + (Number(col.advance) || 0) + BAR_PAD_END;
      if (w > widest) widest = w;
    }
  }
  return widest;
}

/**
 * The largest view scale at which a bar of `barUnits` fits `availablePx`.
 * @returns {number|null} null when the inputs cannot give an answer
 */
export function fitScaleForBar({ availablePx, barUnits, chromeUnits = ROW_CHROME_UNITS }) {
  if (!Number.isFinite(availablePx) || availablePx <= 0) return null;
  if (!Number.isFinite(barUnits) || barUnits <= 0) return null;
  return availablePx / (barUnits + chromeUnits);
}

/**
 * The scale the view must use: the scale it wants, held down to the scale that
 * fits, and never below `minScale`.
 */
export function scaleThatFits({
  availablePx,
  barUnits,
  desiredScale,
  minScale = 1,
  chromeUnits = ROW_CHROME_UNITS,
}) {
  const fit = fitScaleForBar({ availablePx, barUnits, chromeUnits });
  if (fit === null) return desiredScale;
  return Math.min(desiredScale, Math.max(minScale, fit));
}

export {
  RHYTHM_KINDS,
  LANE_NAMES,
  TECHNIQUE_ARIA,
  LAYOUT_BASE_PX,
  ONE_BAR_MAX_WIDTH_PX,
};
