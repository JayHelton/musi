// Pure score layout for the GP player parchment view.
// No DOM access. No global state.

import { TECHNIQUE_LABELS } from '../tab/tabModel.js';
import { drumTabGlyph } from '../drums/notation.js';
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
const MIN_BAR_UNITS = 96;
const UNITS_PER_QUARTER = 20;
const MAX_MEASURES_PER_SYSTEM = 8;
const GUTTER_UNITS = 20;
const VIEWPORT_PAD = 12;
// A fret number must never touch the next one, and it must never touch a
// rhythm tick below it. Each beat column therefore keeps a clear gap after
// its widest text.
const MIN_COL_GAP_UNITS = 9;
// A row that cannot hold the ideal gap gives gap space up first. The floor
// still keeps a space between two fret numbers.
const MIN_COL_GAP_FLOOR_UNITS = 3;
const CHAR_WIDTH_RATIO = 0.62;
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
    minFretFontPx: Number(options.minFretFontPx) || 12,
    barIndex: Number.isFinite(options.barIndex) ? options.barIndex : 0,
    isFirstSystem: Boolean(options.isFirstSystem),
    prevTimeSig: options.prevTimeSig ?? null,
    tuningLabel: options.tuningLabel ?? '',
    maxMeasuresPerSystem: Math.max(1, Math.floor(maxPerSystem)),
    minContentUnits: Number(options.minContentUnits) || 0,
    maxContentUnits: Number(options.maxContentUnits) || 0,
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

function overlayPath(kind, from, to) {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h / 2;
  const x2 = to.x + to.w / 2;
  const y2 = to.y + to.h / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const lift = kind === 'bend' ? -8 : -5;
  const cy = Math.min(y1, y2) + lift;
  return `M ${x1} ${y1} Q ${mx} ${cy} ${x2} ${y2}`;
}

function laneLayout(fontPx, stringCount, showNotationStaff, showRhythm) {
  const stringH = Math.max(10, fontPx * 1.1);
  const notationH = showNotationStaff ? Math.max(28, fontPx * 3.2) : 0;
  const techAboveH = Math.max(12, fontPx * 1.1);
  const tabH = Math.max(stringH, stringCount * stringH);
  const rhythmH = showRhythm ? Math.max(18, fontPx * 1.6) : 0;
  const techBelowH = Math.max(10, fontPx * 0.95);
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

/** Content width for one bar at a given column gap. */
function barContentWidth(cols, measureLen, charUnits, colGapUnits, minContentUnits, minRelGap) {
  const colUnits = charUnits + colGapUnits;
  return Math.max(
    MIN_BAR_UNITS - BAR_PAD_START - BAR_PAD_END,
    measureLen * UNITS_PER_QUARTER,
    cols.reduce((w, c) => w + Math.max(c.width * UNITS_PER_QUARTER, colUnits), 0),
    cols.length * colUnits,
    minRelGap > 0 ? Math.min(colUnits / minRelGap, MAX_BAR_CONTENT_UNITS) : 0,
    minContentUnits,
  );
}

/** The smallest distance between two column starts, as a fraction of a bar. */
function smallestRelGap(cols) {
  const starts = [...new Set(cols.map((c) => c.relStart))].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < starts.length; i += 1) {
    const gap = starts[i] - starts[i - 1];
    if (gap > 1e-9 && gap < min) min = gap;
  }
  return min === Infinity ? 0 : min;
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
  let beamGroup = [];

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

  for (const col of cols) {
    const beat = col.beat;
    const x = BAR_PAD_START + col.relStart * contentW;
    const beatStart = beat.start;

    if (beat.rest) {
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
    const stemY = rhythmLane.y + rhythmLane.h * 0.15;
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
      pushGlyph(glyphs, {
        kind: 'tupletBracket',
        lane: 'rhythm',
        x: x,
        y: rhythmLane.y + 1,
        w: Math.max(10, col.width * UNITS_PER_QUARTER),
        h: Math.max(6, fontPx * 0.35),
        text: String(beat.tuplet.num),
        aria: `Tuplet ${beat.tuplet.num}`,
        beatStart,
      });
    }

    void stemIdx;
  }
  flushBeam();
}

function xForBeat(cols, beatStart, contentW, fontPx) {
  const col = cols.find((c) => Math.abs(c.beat.start - beatStart) < 1e-4);
  const rel = col ? col.relStart : 0;
  return BAR_PAD_START + rel * contentW + Math.max(4, fontPx * 0.3);
}

function addTabGlyphs(glyphs, lanes, bar, cols, contentW, fontPx, drumMode, strings) {
  const tabLane = laneByName(lanes, 'tabStaff');
  const stringCount = Math.max(1, strings.length);
  const stringH = tabLane.h / stringCount;

  for (const ev of bar.events) {
    const beatStart = Number(ev.start);
      const si = Number(ev.stringIndex) || 0;
      const row = Math.max(0, Math.min(stringCount - 1, stringCount - 1 - si));
      const y = tabLane.y + row * stringH + stringH * 0.15;
      const w = Math.max(fontPx * 0.7, String(ev.fret ?? '').length * fontPx * 0.55);
      // A grace note sounds before the main note of the beat, so it must draw
      // to the left of it. Both notes share one beat position, and without
      // this shift the two numbers sit on top of each other.
      const graceShift = ev.grace ? w * 0.9 + fontPx * 0.2 : 0;
      const xCenter = xForBeat(cols, beatStart, contentW, fontPx) - graceShift;

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
          aria: 'Drum hit',
          beatStart,
          stringIndex: si,
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
        eventRef: ev,
      });
  }
}

function addTechniqueGlyphs(glyphs, overlays, lanes, bar, cols, contentW, fontPx) {
  const above = laneByName(lanes, 'techniqueAbove');
  const below = laneByName(lanes, 'techniqueBelow');
  const tabLane = laneByName(lanes, 'tabStaff');

  for (const ev of bar.events) {
    const techs = [...(ev.techniques || [])];
    if (ev.dead && !techs.includes('dead')) techs.push('dead');
    const beat = bar.beats.find((b) => Math.abs(b.start - Number(ev.start)) < 1e-4);
    const col = cols.find((c) => Math.abs(c.beat.start - Number(ev.start)) < 1e-4);
    const x = col
      ? BAR_PAD_START + col.relStart * contentW
      : BAR_PAD_START;
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
          overlays.push({
            kind: 'bend',
            path: overlayPath('bend', glyphs[noteIdx], glyphs[techIdx]),
            fromGlyph: { lane: 'tabStaff', x: glyphs[noteIdx].x, y: glyphs[noteIdx].y },
            toGlyph: { lane: laneName, x: glyphs[techIdx].x, y: glyphs[techIdx].y },
          });
        }
      }

      if ((tech === 'hammer' || tech === 'pull') && noteIdx >= 0) {
        const prev = bar.events.find(
          (e) => e.stringIndex === ev.stringIndex
            && Number(e.start) < Number(ev.start) - 1e-4
            && !e.grace,
        );
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
            overlays.push({
              kind: 'slur',
              path: overlayPath('slur', glyphs[prevIdx], glyphs[noteIdx]),
              fromGlyph: { lane: 'tabStaff', x: glyphs[prevIdx].x, y: glyphs[prevIdx].y },
              toGlyph: { lane: 'tabStaff', x: glyphs[noteIdx].x, y: glyphs[noteIdx].y },
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
        overlays.push({
          kind: 'slide',
          path: overlayPath('slide', glyphs[noteIdx], glyphs[slideIdx]),
          fromGlyph: { lane: 'tabStaff', x: glyphs[noteIdx].x, y: glyphs[noteIdx].y },
          toGlyph: { lane: 'techniqueBelow', x: glyphs[slideIdx].x, y: glyphs[slideIdx].y },
        });
      }
    }

    if (ev.tie && noteIdx >= 0) {
      const prev = bar.events.find(
        (e) => e.stringIndex === ev.stringIndex && Number(e.start) < Number(ev.start) - 1e-4,
      );
      if (prev) {
        let prevIdx = -1;
        for (let i = 0; i < glyphs.length; i += 1) {
          const g = glyphs[i];
          if (g.eventRef === prev) { prevIdx = i; break; }
        }
        if (prevIdx >= 0) {
          overlays.push({
            kind: 'tie',
            path: overlayPath('tie', glyphs[prevIdx], glyphs[noteIdx]),
            fromGlyph: { lane: 'tabStaff', x: glyphs[prevIdx].x, y: tabLane.y },
            toGlyph: { lane: 'tabStaff', x: glyphs[noteIdx].x, y: tabLane.y },
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
  for (const col of cols) {
    if (col.beat.rest) continue;
    const x = BAR_PAD_START + col.relStart * contentW + Math.max(4, fontPx * 0.3);
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
  const { lanes, totalH, stringH } = laneLayout(
    geoPx,
    stringCount,
    opts.showNotationStaff,
    opts.showRhythm,
  );

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
  let maxChars = 1;
  for (const ev of bar.events) {
    const label = ev.dead ? 'x' : String(ev.fret ?? '');
    maxChars = Math.max(maxChars, label.length);
  }
  // Each beat column needs room for its widest fret text plus a clear gap.
  // Without that gap a two digit fret runs into the next one, and the tail of
  // the number sits on top of the rhythm tick below it.
  const charUnits = maxChars * (geoPx * CHAR_WIDTH_RATIO);
  // The glyphs sit at a position that follows the written time, so the
  // closest pair of columns decides the width. A bar with a triplet needs
  // more room than the note count alone suggests.
  const minRelGap = smallestRelGap(cols);
  const colCount = Math.max(1, cols.length);
  let colGapUnits = MIN_COL_GAP_UNITS;
  if (opts.maxContentUnits > 0) {
    const thatFitGap = opts.maxContentUnits / colCount - charUnits;
    colGapUnits = Math.max(
      MIN_COL_GAP_FLOOR_UNITS,
      Math.min(MIN_COL_GAP_UNITS, thatFitGap),
    );
  }
  const idealContentW = barContentWidth(
    cols,
    measureLen,
    charUnits,
    MIN_COL_GAP_UNITS,
    0,
    minRelGap,
  );
  let contentW = barContentWidth(
    cols,
    measureLen,
    charUnits,
    colGapUnits,
    opts.minContentUnits,
    minRelGap,
  );
  if (opts.maxContentUnits > 0) {
    contentW = Math.max(
      MIN_BAR_UNITS - BAR_PAD_START - BAR_PAD_END,
      Math.min(contentW, opts.maxContentUnits),
    );
  }
  const widthUnits = BAR_PAD_START + contentW + BAR_PAD_END;
  const minWidthUnits = BAR_PAD_START + idealContentW + BAR_PAD_END;

  for (const lane of lanes) lane.w = widthUnits;

  const glyphs = [];
  const overlays = [];

  addMeasureChrome(glyphs, lanes, bar, opts, contentW, geoPx);
  addRhythmGlyphs(glyphs, overlays, lanes, cols, contentW, geoPx, opts.showRhythm);
  addTabGlyphs(glyphs, lanes, bar, cols, contentW, geoPx, opts.drumMode, bar.strings || []);
  addTechniqueGlyphs(glyphs, overlays, lanes, bar, cols, contentW, geoPx);

  if (opts.showNotationStaff) {
    addNotationGlyphs(glyphs, lanes, cols, contentW, geoPx, bar, bar.strings || []);
  }

  // Grow a lane that its own glyphs outgrow, then push the later lanes down.
  // Without this step a tall glyph reaches past its lane, and the rhythm
  // ticks then sit on top of the fret numbers above them.
  fitLanesToGlyphs(lanes, glyphs);

  // Strip internal refs before return.
  for (const g of glyphs) {
    delete g.eventRef;
    if (g.techId && !TECHNIQUE_ARIA[g.techId]) {
      warnings.push(`Unknown technique id: ${g.techId}`);
    }
  }

  void totalH;
  void stringH;

  return {
    barIndex: opts.barIndex,
    widthUnits,
    minWidthUnits,
    fontPx,
    lanes,
    glyphs,
    overlays,
    warnings,
  };
}

// The caller passes the width it has, measured in layout units. Geometry and
// width therefore share one space, and no value needs a second scale here.
function availableWidthPx(widthPx) {
  return Math.max(100, widthPx - VIEWPORT_PAD - GUTTER_UNITS);
}

function packSystems(bars, widthPx, maxPerSystem) {
  const unitScale = 1;
  const available = availableWidthPx(widthPx);
  const systems = [];
  let i = 0;
  while (i < bars.length) {
    const row = [];
    let sum = 0;
    while (i < bars.length && row.length < maxPerSystem) {
      const w = bars[i].widthUnits * unitScale;
      if (row.length > 0 && sum + w > available) break;
      row.push(i);
      sum += w;
      i += 1;
    }
    if (!row.length) {
      row.push(i);
      i += 1;
    }
    systems.push({ barIndices: row, widthPx: available });
  }
  return systems;
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
    return { bars: [], systems: [], fontPx, warnings };
  }

  // With one measure per row the bar must fill the row. A narrow bar in a
  // wide row wastes the space that the fret numbers need.
  const minContentUnits = opts.maxMeasuresPerSystem === 1
    ? Math.max(0, availableWidthPx(opts.widthPx) - BAR_PAD_START - BAR_PAD_END)
    : opts.minContentUnits;
  const maxContentUnits = Math.max(
    0,
    availableWidthPx(opts.widthPx) - BAR_PAD_START - BAR_PAD_END,
  );

  const bars = [];
  let prevTimeSig = null;
  for (let i = 0; i < model.measures.length; i += 1) {
    const slice = buildBarSlice(model, i);
    const barLayout = layoutBar(slice, {
      ...opts,
      minContentUnits,
      maxContentUnits,
      barIndex: i,
      prevTimeSig,
      tuningLabel: slice.tuningLabel,
      isFirstSystem: i === 0,
    });
    bars.push(barLayout);
    warnings.push(...barLayout.warnings);
    if (slice.measure.timeSig) prevTimeSig = slice.measure.timeSig;
  }

  const systems = packSystems(bars, opts.widthPx, opts.maxMeasuresPerSystem);
  return { bars, systems, fontPx, warnings };
}

export const ROW_CHROME_UNITS = VIEWPORT_PAD + GUTTER_UNITS;

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
