// Basic multi-note staff SVG renderer for Track → Sheet.
// Intentionally minimal: clef, 5-line staff, noteheads, stems, accidentals,
// rests, barlines. No beams, ties, key signatures, or dynamics.

import { midiToStaff } from './transcribe.js';

const CLEFS = {
  Treble: { glyph: '\uD834\uDD1E', refDV: 38, glyphSize: 5.4, anchorLine: 3, lineToBaseline: 0.3373 },
  Bass:   { glyph: '\uD834\uDD22', refDV: 26, glyphSize: 3.4, anchorLine: 1, lineToBaseline: 0.5 },
};

const TOP_Y = 48;
const LINE_GAP = 12;
const HALF_GAP = LINE_GAP / 2;
const STAFF_H = TOP_Y + LINE_GAP * 4 + 48;
const LEFT_PAD = 16;
const CLEF_W = 42;
const BAR_PAD = 10;

const ACCIDENTAL_GLYPH = {
  '#': '\u266F',
  'b': '\u266D',
  '##': '\uD834\uDD2A',
  'bb': '\uD834\uDD2B',
};

function yForDV(d, refDV) {
  return TOP_Y + (refDV - d) * HALF_GAP;
}

function yForStaffLine(lineIndex) {
  return TOP_Y + lineIndex * LINE_GAP;
}

function yForClef(clef) {
  const fontSize = clef.glyphSize * LINE_GAP;
  return yForStaffLine(clef.anchorLine) + fontSize * clef.lineToBaseline;
}

function widthForDuration(beats) {
  // Rough proportional spacing — readable, not engraving-accurate.
  return Math.max(22, Math.min(72, 18 + beats * 22));
}

function isOpenHead(durationId) {
  return durationId === 'w' || durationId === 'h' || durationId === 'h.';
}

function hasStem(durationId) {
  return durationId !== 'w';
}

function flagCount(durationId) {
  if (durationId === 'e' || durationId === 'e.') return 1;
  if (durationId === 's') return 2;
  return 0;
}

function isDotted(durationId) {
  return durationId.endsWith('.');
}

function restGlyph(durationId) {
  // Musical Symbol rests (Unicode).
  if (durationId === 'w') return '\uD834\uDD3B'; // whole
  if (durationId === 'h' || durationId === 'h.') return '\uD834\uDD3C';
  if (durationId === 'q' || durationId === 'q.') return '\uD834\uDD3D';
  if (durationId === 'e' || durationId === 'e.') return '\uD834\uDD3E';
  return '\uD834\uDD3F'; // sixteenth
}

function ledgerLines(noteDV, refDV, x) {
  const bottomDV = refDV - 8;
  const parts = [];
  if (noteDV > refDV) {
    for (let k = refDV + 2; k <= noteDV; k += 2) {
      const y = yForDV(k, refDV);
      parts.push(`<line class="tts-ledger" x1="${x - 12}" y1="${y}" x2="${x + 12}" y2="${y}"/>`);
    }
  } else if (noteDV < bottomDV) {
    for (let k = bottomDV - 2; k >= noteDV; k -= 2) {
      const y = yForDV(k, refDV);
      parts.push(`<line class="tts-ledger" x1="${x - 12}" y1="${y}" x2="${x + 12}" y2="${y}"/>`);
    }
  }
  return parts.join('');
}

function renderNote(event, x, refDV, midY, preferSharps) {
  const staff = midiToStaff(event.midi, preferSharps);
  const y = yForDV(staff.dv, refDV);
  const open = isOpenHead(event.durationId);
  const parts = [ledgerLines(staff.dv, refDV, x)];

  if (staff.accidental) {
    const g = ACCIDENTAL_GLYPH[staff.accidental] || staff.accidental;
    parts.push(`<text class="tts-accidental" x="${x - 16}" y="${y + 4}" text-anchor="middle">${g}</text>`);
  }

  const headClass = open ? 'tts-note-head open' : 'tts-note-head';
  parts.push(`<g transform="rotate(-20 ${x} ${y})"><ellipse class="${headClass}" cx="${x}" cy="${y}" rx="7.5" ry="5.5"/></g>`);

  if (hasStem(event.durationId)) {
    const stemUp = y > midY;
    const stemX = stemUp ? x + 7 : x - 7;
    const stemY2 = stemUp ? y - LINE_GAP * 3.2 : y + LINE_GAP * 3.2;
    parts.push(`<line class="tts-stem" x1="${stemX}" y1="${y}" x2="${stemX}" y2="${stemY2}"/>`);

    const flags = flagCount(event.durationId);
    for (let f = 0; f < flags; f++) {
      const fy = stemUp ? stemY2 + f * 7 : stemY2 - f * 7;
      const fx2 = stemUp ? stemX + 10 : stemX - 10;
      const fy2 = stemUp ? fy + 10 : fy - 10;
      parts.push(`<path class="tts-flag" d="M${stemX} ${fy} Q${fx2} ${(fy + fy2) / 2} ${stemX} ${fy2}"/>`);
    }
  }

  if (isDotted(event.durationId)) {
    parts.push(`<circle class="tts-dot" cx="${x + 14}" cy="${y - 1}" r="2.2"/>`);
  }

  return parts.join('');
}

function renderRest(event, x, refDV) {
  const y = yForStaffLine(2); // middle staff area
  const g = restGlyph(event.durationId);
  const parts = [`<text class="tts-rest" x="${x}" y="${y + 6}" text-anchor="middle">${g}</text>`];
  if (isDotted(event.durationId)) {
    parts.push(`<circle class="tts-dot" cx="${x + 12}" cy="${y - 2}" r="2.2"/>`);
  }
  return parts.join('');
}

/**
 * Split events into systems (rows) that fit a target pixel width.
 */
function layoutSystems(events, beatsPerBar, maxWidth) {
  const systems = [];
  let x = LEFT_PAD + CLEF_W;
  let beat = 0;
  let current = [];
  let systemStart = true;

  function pushSystem() {
    if (!current.length && !systemStart) return;
    systems.push({ events: current, width: Math.max(x + BAR_PAD, 280) });
    current = [];
    x = LEFT_PAD + CLEF_W;
    systemStart = true;
  }

  for (const ev of events) {
    const w = widthForDuration(ev.beats);
    if (!systemStart && x + w > maxWidth) pushSystem();

    const posInBar = beat % beatsPerBar;
    current.push({ event: ev, x, barlineBefore: posInBar < 0.001 && beat > 0 && !systemStart });
    x += w;
    beat += ev.beats;
    systemStart = false;

    // Barline after completing a bar — drawn before next event via flag, or at end.
    const newPos = beat % beatsPerBar;
    if (newPos < 0.001) {
      current.push({ barlineAt: x });
      x += 8;
    }
  }
  if (current.length) pushSystem();
  return systems;
}

/**
 * Render a full score SVG (possibly multi-system) from quantized events.
 *
 * @param {object} opts
 * @param {Array} opts.events
 * @param {string} [opts.clef='Treble']
 * @param {number} [opts.beatsPerBar=4]
 * @param {number} [opts.bpm=120]
 * @param {boolean} [opts.preferSharps=true]
 * @param {number} [opts.maxWidth=720]
 */
export function renderScoreSVG(opts = {}) {
  const events = opts.events || [];
  const clefName = opts.clef || 'Treble';
  const clef = CLEFS[clefName] || CLEFS.Treble;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const bpm = opts.bpm ?? 120;
  const preferSharps = opts.preferSharps !== false;
  const maxWidth = opts.maxWidth ?? 720;
  const refDV = clef.refDV;
  const midY = TOP_Y + LINE_GAP * 2;

  if (!events.length) {
    return `<div class="tts-empty">No pitched notes detected. Try a clearer isolated track, or lower the sensitivity gate.</div>`;
  }

  const systems = layoutSystems(events, beatsPerBar, maxWidth);
  const systemGap = 28;
  const totalH = systems.length * (STAFF_H + systemGap) - systemGap + 8;
  const totalW = Math.max(...systems.map(s => s.width), 320);

  const parts = [];
  parts.push(`<svg class="tts-score" viewBox="0 0 ${totalW} ${totalH}" width="100%" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Transcribed sheet music">`);

  systems.forEach((sys, si) => {
    const yOff = si * (STAFF_H + systemGap);

    // Staff lines
    for (let i = 0; i < 5; i++) {
      const y = yOff + yForStaffLine(i);
      parts.push(`<line class="tts-staff-line" x1="${LEFT_PAD}" y1="${y}" x2="${sys.width - 8}" y2="${y}"/>`);
    }

    // Clef
    const glyphY = yOff + yForClef(clef);
    parts.push(`<text class="tts-clef" x="${LEFT_PAD + 6}" y="${glyphY}" font-size="${clef.glyphSize * LINE_GAP}">${clef.glyph}</text>`);

    // Time signature on first system
    if (si === 0) {
      const tsX = LEFT_PAD + CLEF_W - 8;
      parts.push(`<text class="tts-timesig" x="${tsX}" y="${yOff + yForStaffLine(1) + 4}" text-anchor="middle">${beatsPerBar}</text>`);
      parts.push(`<text class="tts-timesig" x="${tsX}" y="${yOff + yForStaffLine(3) + 4}" text-anchor="middle">4</text>`);
    }

    for (const item of sys.events) {
      if (item.barlineAt != null) {
        const x = item.barlineAt;
        parts.push(`<line class="tts-barline" x1="${x}" y1="${yOff + TOP_Y}" x2="${x}" y2="${yOff + TOP_Y + LINE_GAP * 4}"/>`);
        continue;
      }
      if (item.barlineBefore) {
        parts.push(`<line class="tts-barline" x1="${item.x - 6}" y1="${yOff + TOP_Y}" x2="${item.x - 6}" y2="${yOff + TOP_Y + LINE_GAP * 4}"/>`);
      }
      parts.push(`<g transform="translate(0 ${yOff})">`);
      if (item.event.type === 'rest') {
        parts.push(renderRest(item.event, item.x, refDV));
      } else {
        parts.push(renderNote(item.event, item.x, refDV, midY, preferSharps));
      }
      parts.push(`</g>`);
    }

    // Final barline
    parts.push(`<line class="tts-barline thick" x1="${sys.width - 10}" y1="${yOff + TOP_Y}" x2="${sys.width - 10}" y2="${yOff + TOP_Y + LINE_GAP * 4}"/>`);
  });

  parts.push(`</svg>`);
  parts.push(`<div class="tts-score-meta">${events.filter(e => e.type === 'note').length} notes · ${bpm} BPM · ${clefName} clef · ${beatsPerBar}/4</div>`);
  return parts.join('');
}

/** Plain-text note list for copy/export. */
export function notesToText(notes) {
  if (!notes.length) return '';
  return notes.map(n => {
    const start = n.startSec.toFixed(2);
    const dur = n.durationSec.toFixed(2);
    return `${n.label.padEnd(4)}  ${start}s  (${dur}s)`;
  }).join('\n');
}
