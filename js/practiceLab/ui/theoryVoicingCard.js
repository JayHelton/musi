// One voicing, drawn as a small neck.
//
// The diagram is an inline SVG, so every colour comes from a theme token and
// the card follows the Atomic Purple palette without a second stylesheet.
//
// The neck runs down the page: the strings are the vertical lines, the low
// string is on the left, and the frets run across. A number on the left names
// the first fret the diagram draws.

import { el } from './dom.js';

const WIDTH = 108;
const HEIGHT = 116;
const PAD_L = 20;
const PAD_R = 12;
const PAD_T = 20;
const PAD_B = 12;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Draw one voicing.
 * @param {Object} voicing a voicing from `findVoicings`
 * @param {{stringCount:number, showLabels?:boolean}} options
 * @returns {string} the SVG source
 */
function voicingSvg(voicing, { stringCount, showLabels = true }) {
  const frets = voicing.frets;
  const fretted = frets.filter(f => f != null && f > 0);
  const first = fretted.length ? Math.max(1, Math.min(...fretted)) : 1;
  const rows = 4;
  const last = first + rows - 1;
  const openNut = first === 1;

  const gridW = WIDTH - PAD_L - PAD_R;
  const gridH = HEIGHT - PAD_T - PAD_B;
  const stepX = stringCount > 1 ? gridW / (stringCount - 1) : gridW;
  const stepY = gridH / rows;
  const xAt = (s) => PAD_L + s * stepX;
  const yLine = (fret) => PAD_T + (fret - first + 1) * stepY;
  const yDot = (fret) => PAD_T + (fret - first + 0.5) * stepY;

  const parts = [];
  parts.push(
    `<svg class="plt-voicing-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" ` +
    `aria-label="${escapeXml(describeVoicing(voicing, stringCount))}">`
  );

  // The nut is thick when the diagram starts at the first fret.
  parts.push(
    `<line x1="${xAt(0)}" y1="${PAD_T}" x2="${xAt(stringCount - 1)}" y2="${PAD_T}" ` +
    `class="plt-fb-line${openNut ? ' nut' : ''}"/>`
  );
  for (let f = first; f <= last; f++) {
    parts.push(
      `<line x1="${xAt(0)}" y1="${yLine(f)}" x2="${xAt(stringCount - 1)}" y2="${yLine(f)}" class="plt-fb-line"/>`
    );
  }
  for (let s = 0; s < stringCount; s++) {
    parts.push(`<line x1="${xAt(s)}" y1="${PAD_T}" x2="${xAt(s)}" y2="${yLine(last)}" class="plt-fb-string"/>`);
  }

  // A number on the left says where on the neck the shape sits.
  parts.push(
    `<text x="${PAD_L - 6}" y="${yDot(first) + 3}" text-anchor="end" class="plt-fb-fretnum">${first}</text>`
  );

  for (let s = 0; s < stringCount; s++) {
    const fret = frets[s];
    const x = xAt(s);
    if (fret == null) {
      parts.push(`<text x="${x}" y="${PAD_T - 5}" text-anchor="middle" class="plt-fb-mute">×</text>`);
      continue;
    }
    if (fret === 0) {
      parts.push(`<circle cx="${x}" cy="${PAD_T - 9}" r="3.4" class="plt-fb-open"/>`);
      continue;
    }
    const label = voicing.labels[s] || '';
    const isRoot = label === 'R';
    parts.push(`<circle cx="${x}" cy="${yDot(fret)}" r="7.2" class="plt-fb-dot${isRoot ? ' root' : ''}"/>`);
    if (showLabels && label) {
      parts.push(
        `<text x="${x}" y="${yDot(fret) + 2.8}" text-anchor="middle" ` +
        `class="plt-fb-dotlabel${isRoot ? ' root' : ''}" font-size="${label.length > 2 ? 5.6 : 7}">${escapeXml(label)}</text>`
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

// A spoken description of one voicing, for a screen reader and a tooltip.
function describeVoicing(voicing, stringCount) {
  const cells = [];
  for (let s = 0; s < stringCount; s++) {
    const fret = voicing.frets[s];
    cells.push(fret == null ? 'muted' : fret === 0 ? 'open' : `fret ${fret}`);
  }
  return `Low string first: ${cells.join(', ')}.`;
}

// The fret pattern as a short string, for example "x 5 7 5 6 x".
function voicingPattern(voicing) {
  return voicing.frets.map(f => (f == null ? 'x' : String(f))).join(' ');
}

/**
 * One pressable voicing card.
 * @param {Object} options
 * @param {Object} options.voicing
 * @param {number} options.stringCount
 * @param {boolean} [options.selected]
 * @param {Function} [options.onSelect]
 * @param {boolean} [options.showLabels]
 */
export function voicingCard({ voicing, stringCount, selected = false, onSelect, showLabels = true }) {
  const fingerText = voicing.fingers === 1 ? '1 finger' : `${voicing.fingers} fingers`;
  const button = el('button', {
    type: 'button',
    class: `plt-voicing${selected ? ' selected' : ''}`,
    on: { click: () => onSelect?.(voicing) },
  }, [
    el('span', { class: 'plt-voicing-neck', html: voicingSvg(voicing, { stringCount, showLabels }) }),
    el('span', { class: 'plt-voicing-meta' }, [
      el('span', { class: 'plt-voicing-pattern', text: voicingPattern(voicing) }),
      el('span', { class: 'plt-voicing-note', text: `${voicing.voices} notes · ${fingerText}` }),
    ]),
  ]);
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.title = describeVoicing(voicing, stringCount);
  return button;
}
