// Turns an extracted PDF (see pdfExtract.js) into playable DrumPatterns for the
// library. Two importers run in order:
//
//   1. ASCII drum tab — if the PDF contains monospaced text tab (rows such as
//      `HH|x-x-` or `Snare | - - o -`), it is parsed straight into full,
//      accurate multi-voice patterns via the app's own tab parser.
//
//   2. Engraved notation — for vector-drawn sheet music (Soundslice, MuseScore,
//      Guitar Pro, Drumeo-style PDFs) we reconstruct each numbered exercise from
//      geometry: the printed count row ("1 e + a 2 …") fixes the rhythmic grid,
//      the five staff-line rectangles fix the vertical drum key, and each note
//      head is snapped to the nearest count token (rhythm) and mapped by its
//      height to an instrument (voice). Hand sticking (R/L) is captured too.
//
// The voicing produced by importer #2 is a best-effort reading of standard drum
// notation and is meant to be reviewed/edited before saving — the UI makes that
// explicit. Everything here is pure and dependency-free so it runs in the
// browser and under Node for testing.

import { parseTab } from './tabParser.js';
import { renderTab } from './tabRenderer.js';
import { stepsPerBeat } from './types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const COUNT_TOKENS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', 'e', '+', '&', 'a', 'trip', 'let', 'ah', 'uh']);

function isCountToken(t) {
  return COUNT_TOKENS.has(String(t).toLowerCase());
}

// A run of text runs is a "count row" when most of its tokens are beat counts.
function looksLikeCountRow(runs) {
  const toks = runs.map((r) => r.text.trim()).filter(Boolean);
  if (toks.length < 3) return false;
  const counted = toks.filter(isCountToken).length;
  return counted >= Math.max(3, Math.ceil(toks.length * 0.7)) && toks.some((t) => t === '1');
}

// Join text runs on one line, inserting a space only where a real horizontal
// gap exists. Engravers split kerned words into several show operations, so a
// naive join-with-spaces mangles titles ("5-Stroke" -> "5-S trok e").
function joinRuns(runs) {
  let out = '';
  let prev = null;
  for (const r of runs) {
    const t = r.text;
    if (!prev) { out = t; prev = r; continue; }
    const expectedEnd = prev.x + prev.size * prev.text.length * 0.5;
    const gap = r.x - expectedEnd;
    const needSpace = gap > prev.size * 0.28 && !/\s$/.test(out) && !/^\s/.test(t);
    out += (needSpace ? ' ' : '') + t;
    prev = r;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Importer #1: ASCII drum tab
// ---------------------------------------------------------------------------

const TAB_ROW_LABELS = /^(C|R|H|O|K|B|S|SN|HH|CC|RD|FT|T1|T2|T3|hi-?hat|hihat|snare|kick|bass|crash|ride|tom|floor)$/i;

// Normalise a variety of common tab row labels onto the ones tabParser knows.
const LABEL_ALIASES = {
  hh: 'H', 'hi-hat': 'H', hihat: 'H', cc: 'C', crash: 'C', rd: 'R', ride: 'R',
  sn: 'S', snare: 'S', b: 'K', bass: 'K', kick: 'K', ft: 'FT', floor: 'FT',
  t1: 'T1', t2: 'T2', t3: 'FT', tom: 'T1',
};

function normaliseTabLabel(label) {
  const key = label.trim().toLowerCase();
  if (LABEL_ALIASES[key]) return LABEL_ALIASES[key];
  return label.trim().toUpperCase();
}

// Detect and parse contiguous ASCII tab blocks out of grouped text lines.
function importAsciiTab(lines, meta) {
  const patterns = [];
  let block = [];
  const flush = () => {
    if (block.length >= 2) {
      const pat = asciiBlockToPattern(block, meta, patterns.length);
      if (pat) patterns.push(pat);
    }
    block = [];
  };
  for (const line of lines) {
    const raw = line.text;
    const barIdx = raw.indexOf('|');
    const label = barIdx > 0 ? raw.slice(0, barIdx).trim() : '';
    const looksTab = barIdx > 0 && TAB_ROW_LABELS.test(label) && /[xXoO0\-.]/.test(raw.slice(barIdx + 1));
    if (looksTab) block.push(raw);
    else flush();
  }
  flush();
  return patterns;
}

function asciiBlockToPattern(block, meta, idx) {
  const normalised = block
    .map((line) => {
      const barIdx = line.indexOf('|');
      const label = normaliseTabLabel(line.slice(0, barIdx));
      return `${label} |${line.slice(barIdx + 1)}`;
    })
    .join('\n');
  const parsed = parseTab(normalised);
  if (!parsed.steps.length) return null;
  const stepsPerBar = parsed.stepsPerBar || 16;
  const subdivision = stepsPerBar % 3 === 0 && stepsPerBar % 4 !== 0 ? 'triplet' : (stepsPerBar <= 8 ? '8th' : '16th');
  const pattern = buildPattern({
    title: meta.sourceName ? `${meta.sourceName} — Tab ${idx + 1}` : `Imported Tab ${idx + 1}`,
    steps: parsed.steps,
    stepsPerBar,
    bars: 1,
    subdivision,
    meta,
    parseMethod: 'ascii-tab',
  });
  return pattern;
}

// ---------------------------------------------------------------------------
// Importer #2: engraved notation
// ---------------------------------------------------------------------------

// Detect staff systems from the thin, wide horizontal rectangles that engravers
// use for staff lines. Returns systems ordered top-to-bottom, each with its five
// (or so) line y-positions and a representative line spacing.
function detectSystems(rects, pageWidth) {
  const lineRects = rects.filter((r) => r.h <= 2 && r.w >= pageWidth * 0.25);
  const ys = lineRects.map((r) => r.y).sort((a, b) => a - b);
  const systems = [];
  let group = [];
  for (const y of ys) {
    if (group.length && y - group[group.length - 1] > 16) {
      systems.push(group);
      group = [];
    }
    // Collapse duplicate/near-identical line positions.
    if (!group.length || Math.abs(y - group[group.length - 1]) > 1.5) group.push(y);
  }
  if (group.length) systems.push(group);

  return systems
    .filter((g) => g.length >= 3)
    .map((g) => {
      const gaps = [];
      for (let i = 1; i < g.length; i++) gaps.push(g[i] - g[i - 1]);
      const spacing = median(gaps) || 6.5;
      return { lines: g, top: g[0], bottom: g[g.length - 1], spacing };
    });
}

// Map a note head's absolute y to a drum voice using the standard 5-line drum
// key, expressed as staff positions relative to the top line (0 = top line,
// grows downward by one per line/space step).
function instrumentForPosition(pos, isX) {
  if (pos <= -1.7) return 'crash';
  if (pos <= -0.35) return isX ? 'hihatClosed' : 'crash';
  if (pos <= 0.85) return 'tomHigh';
  if (pos <= 2.1) return isX ? 'ride' : 'snare';
  if (pos <= 2.9) return 'tomMid';
  if (pos <= 4.2) return 'kick';
  return 'tomFloor';
}

// Parse a count row's text runs into ordered tokens carrying their bar index and
// metric position (in beats from the bar start), plus the inferred subdivision.
function parseCountTokens(runs) {
  const toks = runs
    .map((r) => ({ label: r.text.trim().toLowerCase(), x: r.x }))
    .filter((t) => t.label);

  let bar = -1;
  let beat = 0;
  let sawFirst = false;
  let has16 = false;
  let hasTriplet = false;
  const out = [];
  for (const t of toks) {
    const l = t.label;
    if (/^[1-8]$/.test(l)) {
      const d = Number(l);
      if (d === 1 || !sawFirst || d <= beat) bar++;
      beat = d;
      out.push({ x: t.x, bar, pos: (beat - 1) });
      sawFirst = true;
    } else if (l === 'e' || l === 'a') {
      has16 = true;
      out.push({ x: t.x, bar: Math.max(0, bar), pos: (beat - 1) + (l === 'e' ? 0.25 : 0.75) });
    } else if (l === '+' || l === '&') {
      out.push({ x: t.x, bar: Math.max(0, bar), pos: (beat - 1) + 0.5 });
    } else if (l === 'trip' || l === 'let') {
      hasTriplet = true;
      out.push({ x: t.x, bar: Math.max(0, bar), pos: (beat - 1) + (l === 'trip' ? 1 / 3 : 2 / 3) });
    }
  }
  const bars = Math.max(1, bar + 1);
  const beatsPerBar = Math.max(4, ...out.map((o) => Math.floor(o.pos) + 1));
  const subdivision = has16 ? '16th' : hasTriplet ? 'triplet' : '8th';
  return { tokens: out.filter((t) => t.bar >= 0), bars, beatsPerBar, subdivision };
}

// Title heuristic: a short left-aligned line that is not a count row, tempo,
// bare number or a single sticking letter.
function looksLikeTitle(line) {
  const t = line.text.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return false;
  if (/=\s*\d+/.test(t)) return false;
  if (/^[RL]([\s,]+[RL])*$/i.test(t)) return false;
  if (isCountRowText(t)) return false;
  return t.length >= 2 && /[A-Za-z]/.test(t);
}

function isCountRowText(text) {
  const toks = text.split(/\s+/).filter(Boolean);
  if (toks.length < 3) return false;
  return toks.filter(isCountToken).length >= Math.ceil(toks.length * 0.7);
}

function parseTempo(text) {
  const m = text.match(/=\s*(\d{2,3})/);
  return m ? Number(m[1]) : null;
}

// Reconstruct patterns from one page's engraved notation.
function importNotationPage(page, meta, startIndex) {
  const { runs, rects, width } = page;
  const systems = detectSystems(rects, width);
  if (!systems.length) return [];

  // Group text into lines once for section metadata.
  const textLines = groupTextLines(runs);
  const countLines = textLines.filter((l) => looksLikeCountRow(l.runs));
  const noteGlyphs = runs.filter((r) => r.kind === 'glyph');

  const sections = [];
  for (const system of systems) {
    // The count row for this system is the closest count line just above it.
    const cl = countLines
      .filter((l) => l.y < system.top && system.top - l.y < system.spacing * 12)
      .sort((a, b) => b.y - a.y)[0];
    if (!cl) continue;
    const count = parseCountTokens(cl.runs);
    if (!count.tokens.length) continue;

    const title = nearestTitle(textLines, cl.y);
    const tempo = nearestTempo(textLines, cl.y);
    const sticking = nearestSticking(textLines, system);

    // Note heads that belong to this system: within the vertical band and
    // tightly aligned under a count token horizontally.
    const bandTop = system.top - system.spacing * 3.2;
    const bandBottom = system.bottom + system.spacing * 3.2;
    const bandGlyphs = noteGlyphs.filter((g) => g.y >= bandTop && g.y <= bandBottom);
    const spacings = [];
    for (let i = 1; i < count.tokens.length; i++) {
      const d = count.tokens[i].x - count.tokens[i - 1].x;
      if (d > 2) spacings.push(d);
    }
    const tol = Math.max(4, median(spacings) * 0.22);
    const spb = stepsPerBeat(count.subdivision);
    const stepsPerBar = count.beatsPerBar * spb;

    const stepSet = new Map();
    for (const g of bandGlyphs) {
      let best = null;
      let bestDx = Infinity;
      for (const tk of count.tokens) {
        const dx = Math.abs(tk.x - g.x);
        if (dx < bestDx) { bestDx = dx; best = tk; }
      }
      if (!best || bestDx > tol) continue;
      const pos = (g.y - system.top) / system.spacing;
      const isX = pos <= -0.35 || (pos > 1.0 && pos <= 2.1 && g.y < system.top + system.spacing * 1.3);
      const instrument = instrumentForPosition(pos, isX);
      const step = best.bar * stepsPerBar + Math.round(best.pos * spb);
      const key = `${instrument}@${step}`;
      if (!stepSet.has(key)) stepSet.set(key, { instrument, step });
    }
    if (!stepSet.size) continue;

    sections.push({
      title, tempo, sticking,
      bars: count.bars,
      stepsPerBar,
      subdivision: count.subdivision,
      steps: [...stepSet.values()],
      hasTitle: !!title,
    });
  }

  // Merge systems that continue an untitled section into the previous one.
  const merged = [];
  for (const sec of sections) {
    if (!sec.hasTitle && merged.length) {
      const prev = merged[merged.length - 1];
      if (prev.subdivision === sec.subdivision && prev.stepsPerBar === sec.stepsPerBar) {
        const offset = prev.bars * prev.stepsPerBar;
        sec.steps.forEach((s) => prev.steps.push({ instrument: s.instrument, step: s.step + offset }));
        prev.bars += sec.bars;
        continue;
      }
    }
    merged.push(sec);
  }

  return merged.map((sec, i) => sectionToPattern(sec, meta, startIndex + i));
}

function sectionToPattern(sec, meta, idx) {
  const notesParts = [];
  if (sec.sticking) notesParts.push(`Sticking: ${sec.sticking}`);
  notesParts.push('Auto-extracted from PDF notation — please review the voicing.');
  const title = sec.title
    ? (meta.sourceName ? `${sec.title}` : sec.title)
    : `${meta.sourceName || 'PDF'} — Exercise ${idx + 1}`;

  const steps = sec.steps.map((s) => ({
    instrument: s.instrument,
    step: s.step,
    velocity: s.instrument === 'hihatClosed' || s.instrument === 'ride' ? 0.72 : 0.95,
    probability: 1,
  }));

  const bpm = sec.tempo || meta.tempo || null;
  const bpmRange = bpm ? [Math.max(30, bpm - 10), Math.min(300, bpm + 10)] : [70, 140];

  return buildPattern({
    title,
    steps,
    stepsPerBar: sec.stepsPerBar,
    bars: sec.bars,
    subdivision: sec.subdivision,
    bpmRange,
    notes: notesParts.join(' '),
    meta,
    parseMethod: 'count-row',
    category: guessCategory(title, meta.sourceName),
  });
}

function guessCategory(title, sourceName) {
  const hay = `${title} ${sourceName || ''}`.toLowerCase();
  if (/fill/.test(hay)) return 'fill';
  if (/(groove|beat|pattern)/.test(hay)) return 'beat';
  if (/(rudiment|exercise|warm|accent|roll|stroke|paradiddle)/.test(hay)) return 'exercise';
  return 'exercise';
}

// ---------------------------------------------------------------------------
// Metadata lookups
// ---------------------------------------------------------------------------

function groupTextLines(runs, yTol = 3) {
  const text = runs.filter((r) => r.kind === 'text' && r.text.trim());
  const sorted = text.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const run of sorted) {
    let line = lines.find((l) => Math.abs(l.y - run.y) <= yTol);
    if (!line) { line = { y: run.y, runs: [] }; lines.push(line); }
    line.runs.push(run);
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.text = joinRuns(line.runs);
    line.x = line.runs[0].x;
    line.size = median(line.runs.map((r) => r.size));
  }
  lines.sort((a, b) => a.y - b.y);
  return lines;
}

function nearestTitle(lines, countY) {
  return (lines
    .filter((l) => l.y < countY && countY - l.y < 60 && looksLikeTitle(l))
    .sort((a, b) => b.y - a.y)[0] || {}).text || null;
}

function nearestTempo(lines, countY) {
  const l = lines
    .filter((line) => line.y < countY && countY - line.y < 80 && /=\s*\d{2,3}/.test(line.text))
    .sort((a, b) => b.y - a.y)[0];
  return l ? parseTempo(l.text) : null;
}

function nearestSticking(lines, system) {
  const parts = lines
    .filter((l) => l.y > system.top && l.y < system.bottom + system.spacing * 8 && /^[RL]([\s,]+[RL])*$/i.test(l.text))
    .sort((a, b) => a.x - b.x)
    .map((l) => l.text);
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  return joined || null;
}

// ---------------------------------------------------------------------------
// Pattern assembly
// ---------------------------------------------------------------------------

function buildPattern(opts) {
  const {
    title, steps, stepsPerBar, bars, subdivision, meta,
    parseMethod, notes, category, bpmRange,
  } = opts;
  const meter = subdivision === 'sixEight' ? '6/8' : '4/4';
  const pattern = {
    id: null,
    title,
    category: category || 'exercise',
    style: 'lesson',
    difficulty: 3,
    bpmRange: bpmRange || [70, 140],
    meter,
    subdivision,
    bars,
    stepsPerBar,
    beatsPerBar: stepsPerBar / stepsPerBeat(subdivision),
    steps: steps.slice().sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)),
    notes: notes || `Imported from ${meta.sourceName || 'PDF'}.`,
    sourcePdf: meta.sourceName || null,
    sourcePage: meta.page != null ? meta.page + 1 : null,
    parseMethod,
    builtin: false,
    tags: ['pdf-import'],
  };
  pattern.tab = renderTab(pattern) || '';
  return pattern;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an extracted PDF into importable drum patterns.
 * @param {{pages:Array}} extracted  result of extractPdf()
 * @param {{sourceName?:string}} [options]
 * @returns {{ patterns: Array, warnings: string[], method: string }}
 */
export function pdfToPatterns(extracted, options = {}) {
  const sourceName = (options.sourceName || '').replace(/\.pdf$/i, '').trim();
  const warnings = [];
  const patterns = [];

  // Page-1 title line often names the whole pack; use it if no explicit source.
  let packName = sourceName;
  let docTempo = null;
  const firstPage = extracted.pages[0];
  if (firstPage) {
    const lines = groupTextLines(firstPage.runs);
    const heading = lines.find((l) => l.y < 120 && l.text.length > 3 && /[A-Za-z]/.test(l.text));
    if (heading && !packName) packName = heading.text;
  }
  // A single tempo marking ("♩ = 90") usually governs the whole sheet; capture
  // the first one as a fallback for sections that don't restate it.
  for (const page of extracted.pages) {
    for (const line of groupTextLines(page.runs)) {
      const t = parseTempo(line.text);
      if (t) { docTempo = t; break; }
    }
    if (docTempo) break;
  }

  // Try ASCII tab first (whole document).
  let asciiCount = 0;
  extracted.pages.forEach((page) => {
    const lines = groupTextLines(page.runs);
    const found = importAsciiTab(lines, { sourceName: packName, page: page.index });
    found.forEach((p) => patterns.push(p));
    asciiCount += found.length;
  });

  let method = 'ascii-tab';
  if (!asciiCount) {
    method = 'notation';
    extracted.pages.forEach((page) => {
      const found = importNotationPage(page, { sourceName: packName, page: page.index, tempo: docTempo }, patterns.length);
      found.forEach((p) => patterns.push(p));
    });
  }

  const usable = patterns.filter((p) => p.steps.length && p.tab);
  if (!usable.length) {
    warnings.push('No drum tab or notation could be recognised in this PDF. It may be a scan/image, or use an unsupported layout.');
  } else if (method === 'notation') {
    warnings.push('Voicing was read from standard drum notation and may need small edits (e.g. tom vs. snare). Review each pattern before saving.');
  }

  return { patterns: usable, warnings, method, packName };
}
