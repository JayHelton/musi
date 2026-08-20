// Draw the output of `staffLayout.js` as an SVG staff.
//
// Every primitive keeps its `role` as a class, so `css/drumtab.css` colours
// the notation with the theme tokens. The returned handle can move a playhead
// over the bar while the drum engine plays it.

import { layoutDrumStaff } from './staffLayout.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

function drawElement(parent, element) {
  const role = element.role || 'mark';
  const cls = `dsn-${role}`;
  let node = null;

  if (element.type === 'line') {
    node = svgEl('line', {
      x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2, class: cls,
    });
  } else if (element.type === 'rect') {
    node = svgEl('rect', {
      x: element.x, y: element.y, width: Math.max(0.4, element.w), height: Math.max(0.4, element.h), class: cls,
    });
  } else if (element.type === 'ellipse') {
    node = svgEl('ellipse', {
      cx: element.cx, cy: element.cy, rx: element.rx, ry: element.ry, class: cls,
    });
    if (element.rot) node.setAttribute('transform', `rotate(${element.rot} ${element.cx} ${element.cy})`);
    if (element.filled === false) node.setAttribute('class', `${cls} is-hollow`);
    if (element.width) node.setAttribute('stroke-width', String(element.width));
  } else if (element.type === 'path') {
    node = svgEl('path', { d: element.d, class: cls });
    if (element.filled === false) node.setAttribute('class', `${cls} is-hollow`);
    if (element.width) node.setAttribute('stroke-width', String(element.width));
  } else if (element.type === 'text') {
    node = svgEl('text', {
      x: element.x,
      y: element.y,
      class: cls,
      'text-anchor': element.anchor === 'middle' ? 'middle' : 'start',
      'dominant-baseline': 'middle',
      'font-size': element.size,
    });
    node.textContent = element.text;
  }

  if (node) parent.appendChild(node);
  return node;
}

/**
 * Draw one staff.
 *
 * @param {Array<object>} bars normalized bars
 * @param {object} options layout options, plus `title` for the accessible name
 * @returns {{ svg: SVGElement, layout: object, setPlayhead: (start:number|null) => void }}
 */
export function renderDrumStaff(bars, options = {}) {
  const layout = layoutDrumStaff(bars, options);
  const svg = svgEl('svg', {
    class: `dsn-staff${options.className ? ` ${options.className}` : ''}`,
    viewBox: `0 0 ${Math.ceil(layout.width)} ${Math.ceil(layout.height)}`,
    role: 'img',
    preserveAspectRatio: 'xMinYMid meet',
  });
  svg.setAttribute('aria-label', options.title || 'Drum notation');
  svg.style.setProperty('--dsn-width', String(Math.ceil(layout.width)));

  const playhead = svgEl('rect', {
    class: 'dsn-playhead',
    x: 0,
    y: layout.staffTop - layout.space * 3,
    width: layout.space * 2.4,
    height: (layout.staffBottom - layout.staffTop) + layout.space * 6,
    rx: layout.space * 0.5,
  });
  playhead.style.display = 'none';
  svg.appendChild(playhead);

  for (const element of layout.elements) drawElement(svg, element);

  const marks = [];
  const seen = new Map();
  for (const col of layout.columns) {
    if (col.rest) continue;
    if (!seen.has(col.start)) seen.set(col.start, col.x);
  }
  for (const [start, x] of seen) marks.push({ start, x });
  marks.sort((a, b) => a.start - b.start);

  function setPlayhead(start) {
    if (start == null) {
      playhead.style.display = 'none';
      return;
    }
    let best = null;
    for (const mark of marks) {
      if (mark.start <= start + 1e-6) best = mark;
    }
    if (!best) {
      playhead.style.display = 'none';
      return;
    }
    playhead.setAttribute('x', String(best.x - layout.space * 1.2));
    playhead.style.display = '';
  }

  return { svg, layout, setPlayhead };
}

/**
 * Draw one note on a short staff, for a reading chart row.
 *
 * @param {string} name notation name, e.g. `snare`
 * @param {object} options
 * @returns {SVGElement}
 */
export function renderStaffSample(name, options = {}) {
  const bars = [{
    index: 0,
    timeSig: [4, 4],
    quarters: 1,
    start: 0,
    beamUnit: 1,
    // The chart shows where a note sits, so it draws every note with the stem
    // up. Real music puts the feet under the staff with the stem down.
    voices: {
      up: [{
        start: 0, dur: 1, value: 4, dots: 0, rest: false, notes: [{ name }],
      }],
      down: [],
    },
  }];
  const { svg } = renderDrumStaff(bars, {
    space: 8,
    quarterWidth: 26,
    barLeadIn: 17,
    barTrail: 15,
    padLeft: 2,
    padRight: 2,
    padTop: 34,
    padBottom: 28,
    showClef: false,
    showTimeSig: false,
    showBarLines: false,
    stemMode: 'natural',
    className: 'dsn-staff--sample',
    title: options.title || name,
    ...options,
  });
  return svg;
}
