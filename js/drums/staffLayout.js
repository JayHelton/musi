// Turn bars of drum music into flat drawing instructions.
//
// This file holds no DOM. It reads normalized bars from `staffNotation.js` and
// returns primitives — lines, rectangles, ellipses, paths, and text — with a
// `role` on each one. `staffSvg.js` draws them, and the stylesheet colours
// them by role. A Node test can therefore check the geometry with no browser.

import {
  STAFF_LINE_COUNT,
  STAFF_BOTTOM_STEP,
  STICKING_LABELS,
  beamCountOf,
  staffPositionFor,
  stickingOf,
} from './staffNotation.js';

/** Default sizes, in pixels. One "space" is the gap between two staff lines. */
export const STAFF_DEFAULTS = {
  space: 9,
  quarterWidth: 62,
  padLeft: 8,
  padRight: 10,
  padTop: 40,
  padBottom: 34,
  barLeadIn: 14,
  barTrail: 12,
  showClef: true,
  showTimeSig: true,
  showBarNumbers: false,
  showBarLines: true,
  showStaffLines: true,
  // How many count marks each quarter note gets under the staff. 0 draws none,
  // 2 counts "1 + 2 +", and 4 counts "1 e + a".
  countPerQuarter: 0,
  // `level` gives every stem the same end, so beams stay flat. `natural`
  // gives each stem its own length, the way a single example note reads.
  stemMode: 'level',
  // Draw the R and the L of a sticking under the staff, for the notes that
  // name a hand. A bar with no sticking draws no row and loses no height.
  showSticking: true,
};

/** How far a stem reaches above the top line, in spaces. */
const UP_STEM_TOP_SPACES = 2.6;
/** How far under the bottom line the sticking row sits, in spaces. */
const STICKING_SPACES = 4.4;
/** How far under the bottom line the count row sits, with and without a sticking. */
const COUNT_SPACES = 4.2;
const COUNT_SPACES_WITH_STICKING = 6;
/** How far a stem reaches below the bottom line, in spaces. */
const DOWN_STEM_BOTTOM_SPACES = 2.6;
/** The step a rest of each voice sits on. The two voices keep apart. */
const REST_STEP = { up: 1, down: 6.5 };

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * @param {Array<object>} bars normalized bars
 * @param {object} options
 * @returns {{ width:number, height:number, space:number, staffTop:number, staffBottom:number,
 *   elements:Array<object>, columns:Array<object>, barBoxes:Array<object> }}
 */
export function layoutDrumStaff(bars, options = {}) {
  const opt = { ...STAFF_DEFAULTS, ...options };
  const space = num(opt.space, STAFF_DEFAULTS.space);
  const quarterWidth = num(opt.quarterWidth, STAFF_DEFAULTS.quarterWidth);
  const staffTop = opt.padTop;
  const staffBottom = staffTop + (STAFF_LINE_COUNT - 1) * space;
  const stemTopY = staffTop - UP_STEM_TOP_SPACES * space;
  const stemBottomY = staffBottom + DOWN_STEM_BOTTOM_SPACES * space;
  const list = bars || [];

  const elements = [];
  const columns = [];
  const barBoxes = [];

  const stepY = (step) => staffTop + (step * space) / 2;
  const headRx = space * 0.58;
  const headRy = space * 0.40;
  const stemW = Math.max(1.1, space * 0.13);

  // The clef and the time signature sit before the first bar.
  // The opening bar line stands at padLeft, so the clef starts clear of it.
  let x = opt.padLeft + (opt.showBarLines ? space * 1.1 : 0);
  if (opt.showClef) {
    const barW = Math.max(1.6, space * 0.34);
    const gap = space * 0.42;
    const top = stepY(2);
    const height = stepY(6) - top;
    elements.push({ type: 'rect', role: 'clef', x, y: top, w: barW, h: height });
    elements.push({ type: 'rect', role: 'clef', x: x + barW + gap, y: top, w: barW, h: height });
    x += barW * 2 + gap + space * 1.1;
  }
  if (opt.showTimeSig && list.length) {
    const sig = list[0].timeSig || [4, 4];
    const size = space * 2.1;
    elements.push({
      type: 'text', role: 'timeSig', x, y: stepY(2), text: String(sig[0]), size, anchor: 'start',
    });
    elements.push({
      type: 'text', role: 'timeSig', x, y: stepY(6), text: String(sig[1]), size, anchor: 'start',
    });
    x += size * 0.78 + space * 0.9;
  }

  const staffStartX = opt.padLeft;
  let cursor = x;
  // Every bar keeps the count row at the same height, so the row is only
  // pushed down when some bar of this staff carries a sticking.
  const anySticking = opt.showSticking !== false && list.some(barHasSticking);
  const stickingY = staffBottom + space * STICKING_SPACES;
  const countY = staffBottom
    + space * (anySticking ? COUNT_SPACES_WITH_STICKING : COUNT_SPACES);
  // The lowest ink of the staff, so a sticking row or a count row is never cut
  // off by the bottom padding.
  let inkBottom = staffBottom;

  for (const bar of list) {
    const barX = cursor;
    const barW = opt.barLeadIn + bar.quarters * quarterWidth + opt.barTrail;
    barBoxes.push({ index: bar.index, x: barX, w: barW });

    if (opt.showBarNumbers) {
      elements.push({
        type: 'text',
        role: 'barNumber',
        x: barX + 2,
        y: staffTop - space * 3.4,
        text: String(bar.index + 1),
        size: space * 1.1,
        anchor: 'start',
      });
    }

    const noteX = (start) => barX + opt.barLeadIn + start * quarterWidth;

    for (const voice of ['up', 'down']) {
      layoutVoice({
        entries: bar.voices[voice] || [],
        voice,
        bar,
        elements,
        columns,
        noteX,
        stepY,
        space,
        headRx,
        headRy,
        stemW,
        stemTopY,
        stemBottomY,
        staffTop,
        staffBottom,
        stemMode: opt.stemMode,
      });
    }

    if (anySticking) {
      const size = space * 1.5;
      for (const { start, hand } of barSticking(bar)) {
        elements.push({
          type: 'text',
          role: 'sticking',
          x: noteX(start),
          y: stickingY,
          text: hand,
          size,
          anchor: 'middle',
          title: STICKING_LABELS[hand],
        });
      }
      inkBottom = Math.max(inkBottom, stickingY + size * 0.7);
    }

    if (opt.countPerQuarter > 0) {
      const per = opt.countPerQuarter;
      const marks = per === 4 ? ['e', '+', 'a'] : (per === 3 ? ['trip', 'let'] : ['+']);
      const beats = Math.round(bar.quarters);
      const size = space * 1.35;
      for (let beat = 0; beat < beats; beat += 1) {
        for (let sub = 0; sub < per; sub += 1) {
          const text = sub === 0 ? String((beat % 9) + 1) : marks[sub - 1];
          if (!text) continue;
          elements.push({
            type: 'text',
            role: sub === 0 ? 'countBeat' : 'countSub',
            x: noteX(beat + sub / per),
            y: countY,
            text,
            size,
            anchor: 'middle',
          });
        }
      }
      inkBottom = Math.max(inkBottom, countY + size * 0.7);
    }

    if (opt.showBarLines) {
      const lineX = barX + barW;
      elements.push({
        type: 'line', role: 'barLine', x1: lineX, y1: staffTop, x2: lineX, y2: staffBottom,
      });
    }
    cursor = barX + barW;
  }

  const staffEndX = Math.max(cursor, staffStartX + space * 4);
  if (opt.showStaffLines) {
    for (let i = 0; i < STAFF_LINE_COUNT; i += 1) {
      const y = staffTop + i * space;
      elements.push({
        type: 'line', role: 'staffLine', x1: staffStartX, y1: y, x2: staffEndX, y2: y,
      });
    }
  }
  if (opt.showBarLines) {
    // The staff opens with a line of its own, so the first bar reads as a bar.
    elements.push({
      type: 'line', role: 'barLine', x1: staffStartX, y1: staffTop, x2: staffStartX, y2: staffBottom,
    });
  }

  columns.sort((a, b) => a.start - b.start);

  return {
    width: staffEndX + opt.padRight,
    height: Math.max(staffBottom + opt.padBottom, inkBottom + space * 0.6),
    space,
    staffTop,
    staffBottom,
    stemTopY,
    stemBottomY,
    elements,
    columns,
    barBoxes,
  };
}

/**
 * The sticking of one bar: one letter for each column that names a hand.
 *
 * The letters share a single row under the staff, so a column takes only one
 * letter. The hands play the upper voice, so that voice answers first.
 *
 * @param {object} bar normalized bar
 * @returns {Array<{ start:number, hand:string }>}
 */
function barSticking(bar) {
  const byStart = new Map();
  for (const voice of ['up', 'down']) {
    for (const entry of bar.voices?.[voice] || []) {
      if (entry.rest) continue;
      if (byStart.has(entry.start)) continue;
      const note = entry.notes.find((item) => stickingOf(item));
      if (note) byStart.set(entry.start, stickingOf(note));
    }
  }
  return [...byStart.entries()]
    .map(([start, hand]) => ({ start, hand }))
    .sort((a, b) => a.start - b.start);
}

/** True when a bar names the hand of at least one note. */
function barHasSticking(bar) {
  return barSticking(bar).length > 0;
}

/** Split the entries of one voice into beam groups. */
function beamGroups(entries, beamUnit) {
  const groups = [];
  let current = null;
  for (const entry of entries) {
    const beams = entry.rest ? 0 : beamCountOf(entry.value);
    if (!beams) {
      current = null;
      continue;
    }
    const unit = Math.floor(entry.start / beamUnit + 1e-6);
    if (current && current.unit === unit && current.end + 1e-6 >= entry.start) {
      current.entries.push(entry);
      current.end = entry.start + entry.dur;
    } else {
      current = { unit, entries: [entry], end: entry.start + entry.dur };
      groups.push(current);
    }
  }
  return groups;
}

function layoutVoice(ctx) {
  const {
    entries, voice, bar, elements, columns, noteX, stepY, space,
    headRx, stemW, stemTopY, stemBottomY, stemMode,
  } = ctx;
  const up = voice === 'up';
  const levelStems = stemMode !== 'natural';
  const stemEndY = up ? stemTopY : stemBottomY;
  const groups = beamGroups(entries, bar.beamUnit);
  const beamed = new Set();
  for (const group of groups) {
    if (group.entries.length > 1) for (const e of group.entries) beamed.add(e);
  }

  for (const entry of entries) {
    const x = noteX(entry.start);
    columns.push({
      barIndex: bar.index,
      voice,
      start: bar.start + entry.start,
      x,
      rest: entry.rest,
    });

    if (entry.rest) {
      addRest(elements, x, stepY(REST_STEP[voice]), space, entry.value, entry.dots, voice);
      continue;
    }

    const steps = [];
    for (const note of entry.notes) {
      const place = staffPositionFor(note.name);
      if (!place) continue;
      steps.push(place.step);
      addNotehead(ctx, { x, note, place, entry, up });
    }
    if (!steps.length) continue;

    // A whole note carries no stem.
    if (entry.value >= 2) {
      const stemX = up ? x + headRx - stemW / 2 : x - headRx + stemW / 2;
      const anchorStep = up ? Math.max(...steps) : Math.min(...steps);
      const anchorY = stepY(anchorStep);
      const farStep = up ? Math.min(...steps) : Math.max(...steps);
      const naturalEndY = stepY(farStep) + (up ? -1 : 1) * space * 3.5;
      const endY = levelStems
        ? stemEndY
        : (up ? Math.min(naturalEndY, stemEndY) : Math.max(naturalEndY, stemEndY));
      elements.push({
        type: 'rect',
        role: 'stem',
        x: stemX - stemW / 2,
        y: Math.min(anchorY, endY),
        w: stemW,
        h: Math.abs(endY - anchorY),
      });

      const beams = beamCountOf(entry.value);
      if (beams && !beamed.has(entry)) {
        addFlag(elements, stemX, endY, space, beams, up);
      }
    }

    if (entry.dots > 0) {
      const dotStep = up ? Math.max(...steps) : Math.min(...steps);
      const y = stepY(dotStep % 2 === 0 ? dotStep - 1 : dotStep);
      for (let d = 0; d < entry.dots; d += 1) {
        elements.push({
          type: 'ellipse',
          role: 'dot',
          cx: x + headRx + space * (0.5 + d * 0.45),
          cy: y,
          rx: space * 0.16,
          ry: space * 0.16,
          filled: true,
        });
      }
    }

    if (entry.notes.some((n) => n.accent)) {
      addAccent(elements, x, up ? stemTopY - space * 0.9 : stemBottomY + space * 0.9, space, up);
    }
  }

  for (const group of groups) {
    if (group.entries.length < 2) continue;
    addBeams(elements, group.entries, { noteX, headRx, stemW, stemEndY, space, up });
  }
}

function addNotehead(ctx, { x, note, place, entry, up }) {
  const {
    elements, stepY, space, headRx, headRy,
  } = ctx;
  const y = stepY(place.step);
  const hollow = entry.value <= 2;

  // Ledger lines carry a note that sits off the staff.
  if (place.step <= -2) {
    for (let s = -2; s >= place.step; s -= 2) {
      elements.push({
        type: 'line',
        role: 'ledger',
        x1: x - headRx * 1.75,
        y1: stepY(s),
        x2: x + headRx * 1.75,
        y2: stepY(s),
      });
    }
  } else if (place.step >= STAFF_BOTTOM_STEP + 2) {
    for (let s = STAFF_BOTTOM_STEP + 2; s <= place.step; s += 2) {
      elements.push({
        type: 'line',
        role: 'ledger',
        x1: x - headRx * 1.75,
        y1: stepY(s),
        x2: x + headRx * 1.75,
        y2: stepY(s),
      });
    }
  }

  addHeadShape(elements, {
    x, y, space, headRx, headRy, head: place.head, hollow, ghost: note.ghost || place.ghost,
  });

  if (place.open) {
    elements.push({
      type: 'ellipse',
      role: 'openRing',
      cx: x,
      cy: y,
      rx: headRx * 1.15,
      ry: headRx * 1.15,
      filled: false,
    });
  }

  if (note.ghost || place.ghost) {
    const rx = headRx * 1.7;
    elements.push({
      type: 'path',
      role: 'ghostParen',
      d: `M ${fmt(x - rx * 0.62)} ${fmt(y - headRy * 1.9)} `
        + `Q ${fmt(x - rx)} ${fmt(y)} ${fmt(x - rx * 0.62)} ${fmt(y + headRy * 1.9)}`,
      filled: false,
    });
    elements.push({
      type: 'path',
      role: 'ghostParen',
      d: `M ${fmt(x + rx * 0.62)} ${fmt(y - headRy * 1.9)} `
        + `Q ${fmt(x + rx)} ${fmt(y)} ${fmt(x + rx * 0.62)} ${fmt(y + headRy * 1.9)}`,
      filled: false,
    });
  }

  if (note.flam || place.flam) {
    addGraceNote(elements, {
      x: x - headRx * 3.4, y, space, headRx, headRy, up,
    });
  }
}

function addHeadShape(elements, {
  x, y, space, headRx, headRy, head, hollow,
}) {
  if (head === 'x') {
    const r = headRx * 0.98;
    elements.push({
      type: 'path',
      role: 'headX',
      d: `M ${fmt(x - r)} ${fmt(y - r)} L ${fmt(x + r)} ${fmt(y + r)} `
        + `M ${fmt(x + r)} ${fmt(y - r)} L ${fmt(x - r)} ${fmt(y + r)}`,
      filled: false,
      width: space * 0.19,
    });
    return;
  }
  if (head === 'cross') {
    const r = headRx * 1.05;
    elements.push({
      type: 'ellipse', role: 'head', cx: x, cy: y, rx: headRx, ry: headRy, filled: true,
    });
    elements.push({
      type: 'path',
      role: 'headX',
      d: `M ${fmt(x - r)} ${fmt(y - r)} L ${fmt(x + r)} ${fmt(y + r)}`,
      filled: false,
      width: space * 0.16,
    });
    return;
  }
  if (head === 'diamond') {
    const rx = headRx * 1.05;
    const ry = headRy * 1.45;
    elements.push({
      type: 'path',
      role: 'headDiamond',
      d: `M ${fmt(x)} ${fmt(y - ry)} L ${fmt(x + rx)} ${fmt(y)} `
        + `L ${fmt(x)} ${fmt(y + ry)} L ${fmt(x - rx)} ${fmt(y)} Z`,
      filled: false,
      width: space * 0.16,
    });
    return;
  }
  elements.push({
    type: 'ellipse',
    role: 'head',
    cx: x,
    cy: y,
    rx: headRx,
    ry: headRy,
    rot: -18,
    filled: !hollow,
    width: space * 0.17,
  });
}

function addGraceNote(elements, {
  x, y, space, headRx, headRy, up,
}) {
  const rx = headRx * 0.62;
  const ry = headRy * 0.62;
  const stemW = Math.max(0.9, space * 0.1);
  const stemH = space * 2.1;
  const stemX = up ? x + rx - stemW / 2 : x - rx + stemW / 2;
  const stemTop = up ? y - stemH : y;
  elements.push({
    type: 'ellipse', role: 'graceHead', cx: x, cy: y, rx, ry, rot: -18, filled: true,
  });
  elements.push({
    type: 'rect', role: 'graceStem', x: stemX - stemW / 2, y: stemTop, w: stemW, h: stemH,
  });
  const slashY = up ? y - stemH * 0.72 : y + stemH * 0.72;
  elements.push({
    type: 'path',
    role: 'graceSlash',
    d: `M ${fmt(stemX - rx * 1.4)} ${fmt(slashY + ry * 1.5)} `
      + `L ${fmt(stemX + rx * 1.6)} ${fmt(slashY - ry * 1.5)}`,
    filled: false,
    width: space * 0.13,
  });
  // The grace note leans on the main note.
  elements.push({
    type: 'path',
    role: 'graceTie',
    d: `M ${fmt(x + rx * 0.6)} ${fmt(y + ry * 1.6)} Q ${fmt(x + rx * 2.4)} ${fmt(y + ry * 3.2)} `
      + `${fmt(x + rx * 4.2)} ${fmt(y + ry * 1.6)}`,
    filled: false,
  });
}

function addFlag(elements, stemX, stemEndY, space, beams, up) {
  const dir = up ? 1 : -1;
  for (let i = 0; i < beams; i += 1) {
    const y = stemEndY + dir * i * space * 0.72;
    elements.push({
      type: 'path',
      role: 'flag',
      d: `M ${fmt(stemX)} ${fmt(y)} `
        + `C ${fmt(stemX + space * 1.15)} ${fmt(y + dir * space * 0.5)} `
        + `${fmt(stemX + space * 1.05)} ${fmt(y + dir * space * 1.35)} `
        + `${fmt(stemX + space * 0.28)} ${fmt(y + dir * space * 2.0)} `
        + `C ${fmt(stemX + space * 0.95)} ${fmt(y + dir * space * 1.25)} `
        + `${fmt(stemX + space * 0.72)} ${fmt(y + dir * space * 0.6)} `
        + `${fmt(stemX)} ${fmt(y + dir * space * 0.62)} Z`,
      filled: true,
    });
  }
}

function addBeams(elements, entries, {
  noteX, headRx, stemW, stemEndY, space, up,
}) {
  const stemXOf = (entry) => {
    const x = noteX(entry.start);
    return up ? x + headRx - stemW / 2 : x - headRx + stemW / 2;
  };
  const thickness = space * 0.48;
  const gap = space * 0.34;
  const dir = up ? 1 : -1;
  const maxBeams = Math.max(...entries.map((e) => beamCountOf(e.value)));

  for (let level = 1; level <= maxBeams; level += 1) {
    const y = stemEndY + dir * (level - 1) * (thickness + gap);
    let runStart = -1;
    for (let i = 0; i <= entries.length; i += 1) {
      const has = i < entries.length && beamCountOf(entries[i].value) >= level;
      if (has && runStart < 0) runStart = i;
      if (!has && runStart >= 0) {
        const from = entries[runStart];
        const to = entries[i - 1];
        let x1 = stemXOf(from) - stemW / 2;
        let x2 = stemXOf(to) + stemW / 2;
        if (from === to) {
          // A lone short note gets a stub that points into the group.
          const stub = space * 1.1;
          if (runStart > 0) x1 = x2 - stub;
          else x2 = x1 + stub;
        }
        elements.push({
          type: 'rect',
          role: 'beam',
          x: x1,
          y: Math.min(y, y + dir * thickness),
          w: Math.max(stemW, x2 - x1),
          h: thickness,
        });
        runStart = -1;
      }
    }
  }
}

function addAccent(elements, x, y, space, up) {
  const w = space * 0.95;
  const h = space * 0.55;
  elements.push({
    type: 'path',
    role: 'accent',
    d: `M ${fmt(x - w)} ${fmt(y - h)} L ${fmt(x + w * 0.8)} ${fmt(y)} `
      + `L ${fmt(x - w)} ${fmt(y + h)}`,
    filled: false,
    width: space * 0.17,
  });
  void up;
}

function addRest(elements, x, y, space, value, dots, voice = 'up') {
  const solid = voice === 'down' ? 'restDown' : 'rest';
  const stroke = voice === 'down' ? 'restDownStroke' : 'restStroke';
  if (value <= 1) {
    elements.push({
      type: 'rect', role: solid, x: x - space * 0.55, y: y - space * 0.5, w: space * 1.1, h: space * 0.5,
    });
  } else if (value === 2) {
    elements.push({
      type: 'rect', role: solid, x: x - space * 0.55, y, w: space * 1.1, h: space * 0.5,
    });
  } else if (value === 4) {
    elements.push({
      type: 'path',
      role: stroke,
      d: `M ${fmt(x - space * 0.34)} ${fmt(y - space * 1.05)} `
        + `L ${fmt(x + space * 0.30)} ${fmt(y - space * 0.28)} `
        + `L ${fmt(x - space * 0.30)} ${fmt(y + space * 0.36)} `
        + `L ${fmt(x + space * 0.36)} ${fmt(y + space * 1.10)}`,
      filled: false,
      width: space * 0.26,
    });
    elements.push({
      type: 'path',
      role: stroke,
      d: `M ${fmt(x + space * 0.36)} ${fmt(y + space * 1.10)} `
        + `C ${fmt(x - space * 0.10)} ${fmt(y + space * 0.72)} `
        + `${fmt(x - space * 0.34)} ${fmt(y + space * 1.05)} `
        + `${fmt(x - space * 0.06)} ${fmt(y + space * 1.46)}`,
      filled: false,
      width: space * 0.18,
    });
  } else {
    const hooks = value >= 16 ? 2 : 1;
    const top = y - space * (0.5 + hooks * 0.35);
    const bottom = y + space * 1.05;
    elements.push({
      type: 'path',
      role: stroke,
      d: `M ${fmt(x + space * 0.34)} ${fmt(top)} L ${fmt(x - space * 0.30)} ${fmt(bottom)}`,
      filled: false,
      width: space * 0.15,
    });
    for (let i = 0; i < hooks; i += 1) {
      const hy = top + i * space * 0.70;
      elements.push({
        type: 'ellipse',
        role: solid,
        cx: x + space * 0.28,
        cy: hy + space * 0.1,
        rx: space * 0.21,
        ry: space * 0.21,
        filled: true,
      });
      elements.push({
        type: 'path',
        role: stroke,
        d: `M ${fmt(x + space * 0.28)} ${fmt(hy + space * 0.1)} `
          + `Q ${fmt(x + space * 0.66)} ${fmt(hy - space * 0.02)} `
          + `${fmt(x + space * 0.60)} ${fmt(hy - space * 0.42)}`,
        filled: false,
        width: space * 0.13,
      });
    }
  }

  for (let d = 0; d < (dots || 0); d += 1) {
    elements.push({
      type: 'ellipse',
      role: 'dot',
      cx: x + space * (0.85 + d * 0.42),
      cy: y - space * 0.5,
      rx: space * 0.16,
      ry: space * 0.16,
      filled: true,
    });
  }
}

function fmt(value) {
  return Math.round(value * 100) / 100;
}
