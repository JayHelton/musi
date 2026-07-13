// Renders a DrumPattern back into aligned, readable drum tab and markdown.
//
// Built-in patterns keep their original hand-authored `tab` string for display,
// but generated fills and user-created sequencer patterns are rendered from
// their steps with this module so the count row and every lane stay aligned.

import { INSTRUMENT_ROW_LABEL, stepsPerBeat } from './types.js';

// Lanes are merged for display the way drummers read tab: the hi-hat row shows
// open hits as `O`, and the snare row folds in ghost (`g`) and flam (`f`).
const RENDER_LANES = [
  { label: 'C', instruments: ['crash'] },
  { label: 'R', instruments: ['ride'] },
  { label: 'H', instruments: ['hihatClosed', 'hihatOpen'] },
  { label: 'S', instruments: ['snare', 'snareGhost', 'snareFlam'] },
  { label: 'T1', instruments: ['tomHigh'] },
  { label: 'T2', instruments: ['tomMid'] },
  { label: 'FT', instruments: ['tomFloor'] },
  { label: 'K', instruments: ['kick'] },
];

function glyphFor(instrument, velocity) {
  if (instrument === 'hihatOpen') return 'O';
  if (instrument === 'snareGhost') return 'g';
  if (instrument === 'snareFlam') return 'f';
  if (velocity >= 0.9) return 'X';
  if (velocity >= 0.6) return 'x';
  return 'o';
}

// Priority when several instruments in a lane land on the same step (flam beats
// ghost beats a normal hit; an open hat beats a closed one).
const LANE_PRIORITY = {
  snareFlam: 3, snareGhost: 1, snare: 2,
  hihatOpen: 2, hihatClosed: 1,
};

function countTokens(stepsPerBar, subdivision) {
  const per = stepsPerBeat(subdivision);
  const tokens = [];
  for (let i = 0; i < stepsPerBar; i++) {
    const within = i % per;
    const beat = Math.floor(i / per) + 1;
    if (within === 0) { tokens.push(String(beat)); continue; }
    if (subdivision === '16th') tokens.push(['', 'e', '&', 'a'][within] || '+');
    else if (subdivision === 'triplet') tokens.push(within === 1 ? 't' : 'l');
    else tokens.push('&');
  }
  return tokens;
}

/**
 * Render a pattern (or raw steps + meta) to an aligned tab string.
 * @param {import('./types.js').DrumPattern} pattern
 */
export function renderTab(pattern) {
  const stepsPerBar = pattern.stepsPerBar || 16;
  const subdivision = pattern.subdivision || '16th';
  const bars = Math.max(1, pattern.bars || 1);
  const total = stepsPerBar * bars;

  // Pick the strongest hit per lane per step.
  const laneCells = RENDER_LANES.map(() => new Array(total).fill(null));
  for (const s of pattern.steps || []) {
    const laneIdx = RENDER_LANES.findIndex((l) => l.instruments.includes(s.instrument));
    if (laneIdx === -1 || s.step < 0 || s.step >= total) continue;
    const cur = laneCells[laneIdx][s.step];
    const pri = LANE_PRIORITY[s.instrument] ?? 2;
    if (!cur || pri > cur.pri) {
      laneCells[laneIdx][s.step] = { glyph: glyphFor(s.instrument, s.velocity), pri };
    }
  }

  const activeLanes = RENDER_LANES.map((lane, i) => ({ lane, cells: laneCells[i] }))
    .filter((row) => row.cells.some(Boolean));
  if (!activeLanes.length) return '';

  // Build the count row repeated for each bar.
  const baseCount = countTokens(stepsPerBar, subdivision);
  const count = [];
  for (let b = 0; b < bars; b++) count.push(...baseCount);

  // Column widths so the count row and every lane line up.
  const colWidth = new Array(total).fill(1);
  for (let i = 0; i < total; i++) colWidth[i] = Math.max(1, count[i].length);

  const labelWidth = Math.max(6, ...activeLanes.map((r) => r.lane.label.length));
  const pad = (str, w) => str + ' '.repeat(Math.max(0, w - str.length));

  const renderRow = (label, cells) => {
    const parts = cells.map((c, i) => pad(c, colWidth[i]));
    return `${pad(label, labelWidth)}| ${parts.join(' ')}`.replace(/\s+$/, '');
  };

  const lines = [renderRow('Count', count)];
  for (const { lane, cells } of activeLanes) {
    lines.push(renderRow(lane.label, cells.map((c) => (c ? c.glyph : '-'))));
  }
  return lines.join('\n');
}

/**
 * Render a pattern as a markdown snippet suitable for pasting into notes,
 * forums or chat. Uses a fenced code block to preserve monospaced alignment.
 */
export function renderMarkdown(pattern) {
  const tab = (pattern.tab && pattern.tab.trim()) || renderTab(pattern);
  const bpm = pattern.bpmRange ? `${pattern.bpmRange[0]}–${pattern.bpmRange[1]} BPM` : '';
  const meta = [
    pattern.style && cap(pattern.style),
    pattern.difficulty && `Difficulty ${pattern.difficulty}`,
    pattern.meter,
    bpm,
  ].filter(Boolean).join(' · ');
  const header = `**${pattern.title || 'Drum Pattern'}**`;
  return `${header}\n${meta ? `_${meta}_\n` : ''}\n\`\`\`\n${tab}\n\`\`\`\n`;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Used by INSTRUMENT_ROW_LABEL consumers that want the rendered label set.
export { RENDER_LANES, INSTRUMENT_ROW_LABEL };
