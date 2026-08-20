// The kit map: a drum kit drawn on top of the staff.
//
// Each piece of the kit sits at the height of the note that stands for it, so
// the reader sees the map between the kit and the staff at one look. The kit
// shapes are decoration. The note heads on them are the real information, so
// the map draws them last, over everything else.

import { STAFF_LINE_COUNT, staffPositionFor } from './staffNotation.js';

const NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 790;
const SPACE = 62;
const STAFF_TOP = 104;
const FLOOR_Y = 476;

/**
 * Where each piece sits across the width, and how big it is drawn. The order
 * is back to front, so a near drum covers the drum behind it.
 */
const KIT_PIECES = [
  {
    name: 'kick', kind: 'kick', label: 'Kick drum', x: 372, r: 100, drop: 54,
  },
  {
    name: 'tomFloor', kind: 'drum', label: 'Floor tom', x: 560, rx: 66, depth: 112, legs: true,
  },
  {
    name: 'tomMid', kind: 'drum', label: 'Tom 2', x: 455, rx: 56, depth: 84,
  },
  {
    name: 'tomHigh', kind: 'drum', label: 'Tom 1', x: 345, rx: 54, depth: 78,
  },
  {
    name: 'snare', kind: 'drum', label: 'Snare drum', x: 222, rx: 62, depth: 68,
  },
  {
    name: 'hihatPedal', kind: 'pedal', label: 'Hi-hat pedal', x: 158,
  },
  {
    name: 'ride', kind: 'cymbal', label: 'Ride cymbal', x: 660, rx: 92,
  },
  {
    name: 'crash', kind: 'cymbal', label: 'Crash cymbal', x: 300, rx: 86,
  },
  {
    name: 'hihatClosed', kind: 'hihat', label: 'Hi-hat', x: 150, rx: 54,
  },
];

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

function stepY(step) {
  return STAFF_TOP + (step * SPACE) / 2;
}

function tripod(parent, x, topY) {
  parent.appendChild(el('line', {
    class: 'dkm-stand', x1: x, y1: topY, x2: x, y2: FLOOR_Y,
  }));
  parent.appendChild(el('path', {
    class: 'dkm-stand',
    d: `M ${x - 44} ${FLOOR_Y + 24} L ${x} ${FLOOR_Y - 6} L ${x + 44} ${FLOOR_Y + 24}`,
  }));
}

function drawCymbal(group, piece, y) {
  const ry = piece.rx * 0.30;
  tripod(group, piece.x, y);
  group.appendChild(el('ellipse', {
    class: 'dkm-cymbal', cx: piece.x, cy: y, rx: piece.rx, ry,
  }));
}

function drawHihat(group, piece, y) {
  const ry = piece.rx * 0.30;
  tripod(group, piece.x, y);
  group.appendChild(el('ellipse', {
    class: 'dkm-cymbal', cx: piece.x, cy: y + ry * 1.9, rx: piece.rx * 0.92, ry,
  }));
  group.appendChild(el('ellipse', {
    class: 'dkm-cymbal', cx: piece.x, cy: y, rx: piece.rx, ry,
  }));
}

function drawDrum(group, piece, y) {
  const { rx, depth } = piece;
  const ry = rx * 0.40;
  if (piece.legs) {
    for (const side of [-1, 1]) {
      group.appendChild(el('line', {
        class: 'dkm-stand',
        x1: piece.x + side * rx * 0.75,
        y1: y + depth * 0.5,
        x2: piece.x + side * rx * 1.05,
        y2: FLOOR_Y + 10,
      }));
    }
  }
  group.appendChild(el('path', {
    class: 'dkm-shell',
    d: `M ${piece.x - rx} ${y} L ${piece.x - rx} ${y + depth} `
      + `A ${rx} ${ry} 0 0 0 ${piece.x + rx} ${y + depth} `
      + `L ${piece.x + rx} ${y} Z`,
  }));
  group.appendChild(el('ellipse', {
    class: 'dkm-skin', cx: piece.x, cy: y, rx, ry,
  }));
}

function drawKick(group, piece, y) {
  const cy = y + piece.drop;
  for (const side of [-1, 1]) {
    group.appendChild(el('line', {
      class: 'dkm-stand',
      x1: piece.x + side * piece.r * 0.72,
      y1: cy + piece.r * 0.62,
      x2: piece.x + side * piece.r * 1.0,
      y2: FLOOR_Y + 14,
    }));
  }
  group.appendChild(el('circle', {
    class: 'dkm-shell', cx: piece.x, cy, r: piece.r,
  }));
  group.appendChild(el('circle', {
    class: 'dkm-kick-hoop', cx: piece.x, cy, r: piece.r * 0.84,
  }));
}

function drawPedal(group, piece, y) {
  group.appendChild(el('path', {
    class: 'dkm-shell',
    d: `M ${piece.x - 54} ${y + 34} L ${piece.x + 44} ${y + 10} `
      + `L ${piece.x + 44} ${y + 30} L ${piece.x - 54} ${y + 54} Z`,
  }));
}

function addHead(parent, piece, place, y) {
  if (place.head === 'x') {
    const r = piece.kind === 'pedal' ? 17 : Math.max(17, (piece.rx || 60) * 0.24);
    parent.appendChild(el('path', {
      class: 'dkm-head-x',
      d: `M ${piece.x - r} ${y - r} L ${piece.x + r} ${y + r} `
        + `M ${piece.x + r} ${y - r} L ${piece.x - r} ${y + r}`,
    }));
    return;
  }
  const rx = 21;
  parent.appendChild(el('ellipse', {
    class: 'dkm-head',
    cx: piece.x,
    cy: y,
    rx,
    ry: rx * 0.72,
    transform: `rotate(-18 ${piece.x} ${y})`,
  }));
}

/**
 * The kit map SVG.
 * @param {{ onPick?: (name: string) => void }} options
 * @returns {SVGElement}
 */
export function renderKitMap(options = {}) {
  const height = FLOOR_Y + 44;
  const svg = el('svg', {
    class: 'dkm-map',
    viewBox: `0 0 ${VIEW_W} ${height}`,
    role: 'img',
    'aria-label': 'A drum kit drawn on the staff. Each piece sits at the height of its note.',
  });

  const shapes = el('g', { class: 'dkm-shapes' });
  const lines = el('g', { class: 'dkm-lines' });
  const heads = el('g', { class: 'dkm-heads' });
  svg.append(shapes, lines, heads);

  for (const piece of KIT_PIECES) {
    const place = staffPositionFor(piece.name);
    if (!place) continue;
    const y = stepY(place.step);
    const group = el('g', { class: `dkm-piece dkm-piece--${piece.name}` });
    const tip = el('title');
    tip.textContent = `${piece.label} — ${place.head === 'x' ? 'a cross note head' : 'a round note head'}`;
    group.appendChild(tip);

    if (piece.kind === 'hihat') drawHihat(group, piece, y);
    else if (piece.kind === 'cymbal') drawCymbal(group, piece, y);
    else if (piece.kind === 'drum') drawDrum(group, piece, y);
    else if (piece.kind === 'kick') drawKick(group, piece, y);
    else if (piece.kind === 'pedal') drawPedal(group, piece, y);

    if (options.onPick) {
      group.classList.add('is-pickable');
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', piece.label);
      const pick = () => options.onPick(piece.name);
      group.addEventListener('click', pick);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      });
    }
    shapes.appendChild(group);
    addHead(heads, piece, place, y);
  }

  for (let i = 0; i < STAFF_LINE_COUNT; i += 1) {
    lines.appendChild(el('line', {
      class: 'dkm-staff-line',
      x1: 0,
      y1: STAFF_TOP + i * SPACE,
      x2: VIEW_W,
      y2: STAFF_TOP + i * SPACE,
    }));
  }
  // The crash needs the ledger line above the staff.
  lines.appendChild(el('line', {
    class: 'dkm-staff-line dkm-ledger',
    x1: 300 - 110,
    y1: stepY(-2),
    x2: 300 + 110,
    y2: stepY(-2),
  }));

  return svg;
}

/** The pieces the map draws, in draw order. */
export const KIT_MAP_PIECES = KIT_PIECES;
