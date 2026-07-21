// Tuning-aware parser: ASCII guitar/bass tab text -> structured TabModel.
//
// This is intentionally forgiving. Real-world tabs vary wildly (labels or not,
// single- or multi-digit frets, inline technique glyphs, bar lines, repeats,
// chord names and lyrics interleaved). The parser groups consecutive
// "string rows" into blocks, treats each character column as a time slot,
// coalesces multi-digit frets, tokenizes technique glyphs, maps rows to the
// chosen tuning, and converts frets to MIDI / pitch classes.
//
// It never throws on messy input: unparseable lines are ignored and anomalies
// are collected in `warnings` so the UI can surface them.

import { resolveTuning } from './tabModel.js';

// A line is treated as a tab "string row" when, after stripping an optional
// leading note-name label and pipe, it is dominated by tab characters and
// carries at least a few dashes.
const TAB_BODY_CHARS = /[-0-9hpbrsxtvHPBRSXTV/\\~^*().=|]/g;

function stripLabel(line) {
  // Optional leading label like "e|", "B |", "Bb|", or a bare leading "|".
  const m = line.match(/^\s*([A-Ga-g][#b]?)?\s*\|/);
  if (m) return { contentStart: m[0].length, hadPipe: true, label: (m[1] || '').trim() };
  return { contentStart: 0, hadPipe: false, label: '' };
}

function looksLikeTabLine(line) {
  if (!line || !line.includes('-')) return false;
  const { contentStart } = stripLabel(line);
  const body = line.slice(contentStart);
  const dashes = (body.match(/-/g) || []).length;
  if (dashes < 3) return false;
  const bodyChars = body.replace(/\s/g, '');
  if (!bodyChars.length) return false;
  const tabChars = (body.match(TAB_BODY_CHARS) || []).length;
  return tabChars / bodyChars.length >= 0.8;
}

// Split the text into blocks of consecutive string rows. Each block also keeps
// the per-line content-start offset so columns line up across the block.
function findBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (looksLikeTabLine(line)) {
      if (!cur) cur = [];
      cur.push(line);
    } else if (cur) {
      blocks.push(cur);
      cur = null;
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

const CONNECTORS = {
  h: 'hammer', H: 'hammer',
  p: 'pull', P: 'pull',
  b: 'bend', B: 'bend',
  r: 'release', R: 'release',
  '/': 'slideUp',
  '\\': 'slideDown',
  s: 'slide', S: 'slide',
  t: 'tap', T: 'tap',
};

const PRE_CONNECTORS = new Set(['tap']); // sit *before* their target note

function addTech(note, tech) {
  if (note && tech && !note.techniques.includes(tech)) note.techniques.push(tech);
}

// Tokenize one string row's content into note tokens with attached techniques.
function parseRow(content) {
  const notes = [];
  const barlines = [];
  let pending = null;   // connector waiting for the next fret (e.g. hammer, bend)
  let palmActive = false;
  let harmonicNext = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < content.length && content[j] >= '0' && content[j] <= '9') j++;
      const fret = parseInt(content.slice(i, j), 10);
      const note = { col: i, fret, techniques: [] };
      if (pending) {
        addTech(note, pending);
        if (!PRE_CONNECTORS.has(pending) && notes.length) addTech(notes[notes.length - 1], pending);
        pending = null;
      }
      if (palmActive) addTech(note, 'palmMute');
      if (harmonicNext) { addTech(note, 'harmonic'); harmonicNext = false; }
      notes.push(note);
      i = j;
      continue;
    }
    if (ch === '~') { addTech(notes[notes.length - 1], 'vibrato'); i++; continue; }
    if (ch === 'v' || ch === 'V') { addTech(notes[notes.length - 1], 'vibrato'); i++; continue; }
    if (ch === '*') { addTech(notes[notes.length - 1], 'harmonic'); i++; continue; }
    if (ch === '<' || ch === '[') { harmonicNext = true; i++; continue; }
    if (ch === '>' || ch === ']') { i++; continue; }
    if (ch === 'x' || ch === 'X') { notes.push({ col: i, fret: null, dead: true, techniques: ['dead'] }); i++; continue; }
    if ((ch === 'P' || ch === 'p') && content[i + 1] === 'M') { palmActive = true; i += 2; continue; }
    if (ch === '|') { barlines.push(i); i++; continue; }
    if (CONNECTORS[ch] !== undefined) {
      const tech = CONNECTORS[ch];
      pending = tech;
      if (!PRE_CONNECTORS.has(tech) && notes.length) addTech(notes[notes.length - 1], tech);
      i++;
      continue;
    }
    // Whitespace and separators end any palm-mute run.
    if (ch === ' ' || ch === '\t') palmActive = false;
    i++;
  }
  return { notes, barlines };
}

// Detect tremolo picking: dense repeated same-fret notes on one string within a
// short column window get tagged (only when clearly repeated, to avoid noise).
function tagTremolo(rowNotes) {
  const real = rowNotes.filter((n) => n.fret != null);
  for (let i = 0; i + 2 < real.length; i++) {
    const a = real[i], b = real[i + 1], c = real[i + 2];
    if (a.fret === b.fret && b.fret === c.fret &&
        b.col - a.col <= 3 && c.col - b.col <= 3) {
      addTech(a, 'tremolo'); addTech(b, 'tremolo'); addTech(c, 'tremolo');
    }
  }
}

/**
 * Parse tab text against a tuning.
 * @param {string} text raw tab text.
 * @param {string|Array} tuning tuning name (TUNINGS key) or custom string array.
 * @returns {import('./tabModel.js').TabModel}
 */
export function parseTab(text, tuning = 'Standard') {
  const { name, strings } = resolveTuning(tuning);
  const warnings = [];
  const events = [];
  const measures = [];
  const techniqueCounts = {};
  const boundaries = new Set([0]);

  const rawLines = String(text || '').split('\n');
  const blocks = findBlocks(rawLines);

  if (!blocks.length) {
    warnings.push('No tab blocks detected. Paste monospaced tab with string rows like "e|--3--5--|".');
    return { tuning: name, strings, events: [], slots: 0, measures: [], techniqueCounts, warnings };
  }

  let slotOffset = 0;

  for (const block of blocks) {
    const m = block.length;
    if (m < 1 || m > 8) {
      warnings.push(`Skipped a ${m}-row block (expected 1–8 string rows).`);
      continue;
    }
    if (m !== strings.length) {
      warnings.push(`A block has ${m} rows but the tuning has ${strings.length} strings; mapping from the lowest string up.`);
    }

    // Parse each row; anchor columns after each row's own leading label/pipe.
    const parsedRows = block.map((line) => {
      const { contentStart } = stripLabel(line);
      const content = line.slice(contentStart);
      return { content, ...parseRow(content) };
    });

    // Warn on badly misaligned rows (very different content widths).
    const widths = parsedRows.map((r) => r.content.length);
    if (Math.max(...widths) - Math.min(...widths) > 4) {
      warnings.push('Rows in a block are not the same width; column alignment may be approximate.');
    }

    let maxCol = 0;
    parsedRows.forEach((row, lineIdx) => {
      tagTremolo(row.notes);
      // Bottom row (last line) is the lowest string -> tuning index 0.
      const fromBottom = m - 1 - lineIdx;
      const str = strings[fromBottom];
      row.barlines.forEach((col) => boundaries.add(slotOffset + col));
      for (const n of row.notes) {
        maxCol = Math.max(maxCol, n.col);
        const slot = slotOffset + n.col;
        for (const t of n.techniques) techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;
        if (n.fret == null || !str || str.openMidi == null) {
          events.push({ slot, stringIndex: fromBottom, fret: null, midi: null, pc: null, techniques: n.techniques, dead: !!n.dead });
          continue;
        }
        const midi = str.openMidi + n.fret;
        events.push({
          slot, stringIndex: fromBottom, fret: n.fret,
          midi, pc: ((midi % 12) + 12) % 12,
          techniques: n.techniques, dead: false,
        });
      }
    });

    slotOffset += maxCol + 2; // gap so the next block follows in time
    boundaries.add(slotOffset - 1);
  }

  events.sort((a, b) => (a.slot - b.slot) || (a.stringIndex - b.stringIndex));

  // Build measures from collected bar-line / block boundaries.
  const bs = [...boundaries].sort((a, b) => a - b);
  for (let i = 0; i + 1 < bs.length; i++) {
    if (bs[i + 1] - bs[i] >= 2) measures.push({ startSlot: bs[i], endSlot: bs[i + 1] });
  }

  const slots = events.length ? Math.max(...events.map((e) => e.slot)) + 1 : slotOffset;
  if (!events.some((e) => e.fret != null)) {
    warnings.push('Tab blocks were found but no fret numbers were parsed.');
  }

  return { tuning: name, strings, events, slots, measures, techniqueCounts, warnings };
}
