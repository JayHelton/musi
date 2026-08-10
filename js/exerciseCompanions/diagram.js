import { INTERVAL_LABELS } from '../theory.js';

export const DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const FB_DOUBLE = new Set([12, 24]);

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compact scrollable fretboard grid. `hits` is Map of "stringIndex:fret" -> { label, isRoot, ... }.
 */
export function renderFretboardGrid({
  strings,
  fretStart,
  fretEnd,
  hits = new Map(),
  className = 'ec-fretboard',
  onCellClick = null,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'ec-fretboard-scroll';

  const board = document.createElement('div');
  board.className = className;
  const count = fretEnd - fretStart + 1;
  board.style.gridTemplateColumns = `2.4rem repeat(${count}, minmax(1.6rem, 1fr))`;
  const middle = Math.floor(strings.length / 2);

  const corner = document.createElement('div');
  corner.className = 'ec-fb-corner';
  board.appendChild(corner);

  for (let f = fretStart; f <= fretEnd; f++) {
    const hdr = document.createElement('div');
    hdr.className = 'ec-fb-fretnum';
    hdr.textContent = String(f);
    board.appendChild(hdr);
  }

  for (let s = strings.length - 1; s >= 0; s--) {
    const strLabel = document.createElement('div');
    strLabel.className = 'ec-fb-strlabel';
    strLabel.textContent = strings[s].label || `${strings[s].note}${strings[s].oct ?? ''}`;
    board.appendChild(strLabel);

    for (let f = fretStart; f <= fretEnd; f++) {
      const cell = document.createElement('div');
      cell.className = 'ec-fb-cell';
      if (f === 0) cell.classList.add('ec-nut');
      if (f > 0 && FB_DOTS.includes(f)) {
        const isD = FB_DOUBLE.has(f);
        if (isD ? (s === middle - 1 || s === middle + 1) : s === middle) {
          cell.classList.add('ec-inlay');
        }
      }

      const hit = hits.get(`${s}:${f}`);
      if (hit) {
        const note = document.createElement('span');
        note.className = 'ec-note';
        if (hit.isRoot) note.classList.add('ec-root');
        if (hit.order != null) note.classList.add('ec-order');
        note.textContent = hit.order != null ? String(hit.order + 1) : (hit.label || '');
        if (hit.title) note.title = hit.title;
        cell.appendChild(note);
        if (onCellClick) {
          cell.classList.add('ec-clickable');
          cell.addEventListener('click', () => onCellClick(hit, s, f));
        }
      }
      board.appendChild(cell);
    }
  }

  wrap.appendChild(board);
  return wrap;
}

export function renderLegend(items, className = 'ec-legend') {
  const legend = document.createElement('div');
  legend.className = className;
  items.forEach((item) => {
    const row = document.createElement('span');
    row.className = 'ec-leg-item';
    if (item.isRoot) row.classList.add('ec-root');
    const swatch = document.createElement('span');
    swatch.className = 'ec-leg-swatch';
    if (item.color) swatch.style.background = item.color;
    if (item.interval != null) swatch.classList.add(`ec-deg-${item.interval}`);
    row.append(swatch, document.createTextNode(item.text));
    legend.appendChild(row);
  });
  return legend;
}

export function degreeLegendFromIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a - b);
  return sorted.map((iv) => ({
    interval: iv,
    isRoot: iv === 0,
    text: `${DEGREE_LABELS[iv] || iv} · ${INTERVAL_LABELS[iv] || iv}`,
  }));
}
