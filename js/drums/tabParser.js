// Parses the app's readable drum-tab format into normalized PatternStep[].
//
// Input looks like:
//   Count | 1 e & a 2 e & a 3 e & a 4 e & a
//   H     | x x x x x x x x x x x x x x x x
//   S     | - - - - X - - - - - - - X - - -
//   K     | X - - - - - X - X - - - - - X -
//
// Rules: blank lines are ignored; the Count row infers the step count; row
// labels map to instruments; cell symbols map to instruments + velocities.

import { VELOCITY_BY_SYMBOL } from './types.js';

// Maps a tab row label to an instrument resolver. The hi-hat row is special:
// an `O` cell becomes an open hi-hat hit while everything else is closed.
const ROW_LABELS = {
  C: () => 'crash',
  R: () => 'ride',
  H: (sym) => (sym === 'O' || sym === 'o*' ? 'hihatOpen' : 'hihatClosed'),
  O: () => 'hihatOpen',
  K: () => 'kick',
  S: (sym) => (sym === 'g' ? 'snareGhost' : sym === 'f' ? 'snareFlam' : 'snare'),
  T1: () => 'tomHigh',
  T2: () => 'tomMid',
  FT: () => 'tomFloor',
};

function symbolVelocity(sym) {
  if (sym === 'O') return VELOCITY_BY_SYMBOL.x;
  return VELOCITY_BY_SYMBOL[sym] ?? 0.72;
}

function splitRow(line) {
  const barIdx = line.indexOf('|');
  if (barIdx === -1) return null;
  const label = line.slice(0, barIdx).trim();
  const cells = line.slice(barIdx + 1).trim().split(/\s+/).filter(Boolean);
  return { label, cells };
}

/**
 * @param {string} tabText
 * @returns {{ steps: import('./types.js').PatternStep[], stepsPerBar: number, instruments: string[] }}
 */
export function parseTab(tabText) {
  const lines = String(tabText || '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  const rows = [];
  let countCells = 0;
  for (const line of lines) {
    const row = splitRow(line);
    if (!row) continue;
    if (/^count$/i.test(row.label)) {
      countCells = row.cells.length;
      continue;
    }
    if (!ROW_LABELS[row.label]) continue;
    rows.push(row);
  }

  const stepsPerBar = Math.max(countCells, ...rows.map((r) => r.cells.length), 0);

  const steps = [];
  const instruments = new Set();
  for (const row of rows) {
    const resolve = ROW_LABELS[row.label];
    row.cells.forEach((sym, step) => {
      if (sym === '-' || sym === '.' || sym === '') return;
      const instrument = resolve(sym);
      instruments.add(instrument);
      steps.push({
        instrument,
        step,
        velocity: symbolVelocity(sym),
        probability: 1,
      });
    });
  }

  steps.sort((a, b) => a.step - b.step);
  return { steps, stepsPerBar, instruments: [...instruments] };
}
