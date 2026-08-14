/**
 * Shared SVG fretboard renderer and pure fret position helper.
 */

import {
  TUNING_CATALOG,
  TUNINGS,
  findPresetByName,
  pitchToMidi,
  clonePitches,
} from '../tunings.js';
import { NOTE_NAMES_SHARP } from '../theory.js';

/** Fret inlay positions. Frets 12 and 24 use double markers. */
export const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

const FRET_DOUBLE_MARKERS = new Set([12, 24]);

const DEFAULT_FRET_END = 12;
const CELL_W = 32;
const CELL_H = 30;
const LABEL_W = 36;
const HEADER_H = 18;
const PAD_Y = 8;

/**
 * fretPositions return shape:
 * {
 *   tuningId: string | null,
 *   tuningName: string,
 *   fretStart: number,
 *   fretEnd: number,
 *   strings: [{
 *     index: number,          // 0 = highest string
 *     open: { note, oct },
 *     frets: [{ fret, note, pc, midi }]
 *   }]
 * }
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTuningKey(name) {
  return String(name || '').trim().toLowerCase();
}

function resolveTuningInput(tuning) {
  if (Array.isArray(tuning) && tuning.length) {
    return {
      pitches: clonePitches(tuning),
      id: null,
      name: 'Custom',
    };
  }

  const key = String(tuning || '').trim();
  if (!key) {
    const fallback = findPresetByName('Standard') || TUNING_CATALOG[0];
    return {
      pitches: clonePitches(fallback.pitches),
      id: fallback.id,
      name: fallback.name,
    };
  }

  const lower = normalizeTuningKey(key);
  if (lower === 'standard e') {
    const preset = findPresetByName('Standard') || TUNING_CATALOG[0];
    return {
      pitches: clonePitches(preset.pitches),
      id: preset.id,
      name: preset.name,
    };
  }

  if (TUNINGS[key]) {
    const preset = findPresetByName(key);
    return {
      pitches: clonePitches(TUNINGS[key]),
      id: preset?.id || null,
      name: preset?.name || key,
    };
  }

  const preset = findPresetByName(key);
  if (preset) {
    return {
      pitches: clonePitches(preset.pitches),
      id: preset.id,
      name: preset.name,
    };
  }

  const fallback = findPresetByName('Standard') || TUNING_CATALOG[0];
  return {
    pitches: clonePitches(fallback.pitches),
    id: fallback.id,
    name: fallback.name,
  };
}

function tuningIndexForModelString(modelString, stringCount) {
  return stringCount - 1 - modelString;
}

function noteAtMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return {
    note: NOTE_NAMES_SHARP[pc],
    pc,
    midi,
    oct,
  };
}

export function fretPositions(model = {}) {
  const fretStart = Number.isFinite(model.fretStart) ? model.fretStart : 0;
  const fretEnd = Number.isFinite(model.fretEnd) ? model.fretEnd : DEFAULT_FRET_END;
  const { pitches, id, name } = resolveTuningInput(model.tuning);
  const stringCount = pitches.length;
  const strings = [];

  for (let modelIdx = 0; modelIdx < stringCount; modelIdx++) {
    const tuningIdx = tuningIndexForModelString(modelIdx, stringCount);
    const pitch = pitches[tuningIdx];
    const openMidi = pitchToMidi(pitch);
    const frets = [];

    for (let f = fretStart; f <= fretEnd; f++) {
      const midi = openMidi + f;
      frets.push({
        fret: f,
        ...noteAtMidi(midi),
      });
    }

    strings.push({
      index: modelIdx,
      open: { note: pitch.note, oct: Number(pitch.oct) },
      frets,
    });
  }

  return {
    tuningId: id,
    tuningName: name,
    fretStart,
    fretEnd,
    strings,
  };
}

function buildAriaLabel(model, positions, options = {}) {
  if (options.ariaLabel) return options.ariaLabel;
  const title = options.title || model.title || '';
  const tuning = positions.tuningName || 'Custom';
  if (title) return `Fretboard, ${tuning}, ${title}`;
  return `Fretboard, ${tuning}`;
}

function fretOrder(fretStart, fretEnd, lefty) {
  const order = [];
  for (let f = fretStart; f <= fretEnd; f++) order.push(f);
  if (lefty) order.reverse();
  return order;
}

function layoutMetrics(model, positions) {
  const fretStart = positions.fretStart;
  const fretEnd = positions.fretEnd;
  const fretCount = fretEnd - fretStart + 1;
  const stringCount = positions.strings.length;
  const boardW = fretCount * CELL_W;
  const boardH = PAD_Y * 2 + (stringCount - 1) * CELL_H;
  const totalW = LABEL_W + boardW;
  const totalH = HEADER_H + boardH;
  return { fretStart, fretEnd, fretCount, stringCount, boardW, boardH, totalW, totalH };
}

function xForFret(f, fretStart, lefty, fretEnd) {
  const col = lefty ? fretEnd - f : f - fretStart;
  return LABEL_W + (col + 0.5) * CELL_W;
}

function yForString(modelString, stringCount) {
  return HEADER_H + PAD_Y + modelString * CELL_H;
}

function markerKey(string, fret) {
  return `${string}:${fret}`;
}

function buildMarkerMap(markers = []) {
  const map = new Map();
  for (const m of markers) {
    if (m && Number.isFinite(m.string) && Number.isFinite(m.fret)) {
      map.set(markerKey(m.string, m.fret), m);
    }
  }
  return map;
}

function renderInlays(svgParts, metrics, lefty, middleString) {
  for (let f = metrics.fretStart; f <= metrics.fretEnd; f++) {
    if (!FRET_MARKERS.includes(f) || f <= 0) continue;
    const cx = xForFret(f, metrics.fretStart, lefty, metrics.fretEnd);
    if (FRET_DOUBLE_MARKERS.has(f)) {
      const y1 = yForString(middleString - 1, metrics.stringCount);
      const y2 = yForString(middleString + 1, metrics.stringCount);
      if (middleString - 1 >= 0) {
        svgParts.push(`<circle class="fb-inlay" cx="${cx}" cy="${y1}" r="2.5"/>`);
      }
      if (middleString + 1 < metrics.stringCount) {
        svgParts.push(`<circle class="fb-inlay" cx="${cx}" cy="${y2}" r="2.5"/>`);
      }
    } else {
      const cy = yForString(middleString, metrics.stringCount);
      svgParts.push(`<circle class="fb-inlay" cx="${cx}" cy="${cy}" r="2.5"/>`);
    }
  }
}

function renderMarker(svgParts, marker, cx, cy) {
  const role = marker.role || 'scaleTone';
  const label = marker.label || '';
  const muted = marker.muted;
  const cls = `fb-marker fb-marker-${role}${muted ? ' fb-marker-muted' : ''}`;

  if (muted) {
    svgParts.push(
      `<g class="${cls}" data-string="${marker.string}" data-fret="${marker.fret}">` +
      `<line class="fb-muted-line" x1="${cx - 7}" y1="${cy - 7}" x2="${cx + 7}" y2="${cy + 7}"/>` +
      `<line class="fb-muted-line" x1="${cx + 7}" y1="${cy - 7}" x2="${cx - 7}" y2="${cy + 7}"/>` +
      `</g>`
    );
    return;
  }

  if (role === 'root') {
    svgParts.push(
      `<g class="${cls}" data-string="${marker.string}" data-fret="${marker.fret}">` +
      `<circle class="fb-marker-shape fb-marker-root" cx="${cx}" cy="${cy}" r="11"/>` +
      (label ? `<text class="fb-marker-label" x="${cx}" y="${cy + 3.5}" text-anchor="middle">${escapeHtml(label)}</text>` : '') +
      `</g>`
    );
    return;
  }

  if (role === 'chordTone') {
    svgParts.push(
      `<g class="${cls}" data-string="${marker.string}" data-fret="${marker.fret}">` +
      `<rect class="fb-marker-shape fb-marker-chord" x="${cx - 9}" y="${cy - 9}" width="18" height="18" rx="3"/>` +
      (label ? `<text class="fb-marker-label" x="${cx}" y="${cy + 3.5}" text-anchor="middle">${escapeHtml(label)}</text>` : '') +
      `</g>`
    );
    return;
  }

  if (role === 'target') {
    svgParts.push(
      `<g class="${cls}" data-string="${marker.string}" data-fret="${marker.fret}">` +
      `<polygon class="fb-marker-shape fb-marker-target" points="${cx},${cy - 11} ${cx + 11},${cy} ${cx},${cy + 11} ${cx - 11},${cy}"/>` +
      (label ? `<text class="fb-marker-label" x="${cx}" y="${cy + 3.5}" text-anchor="middle">${escapeHtml(label)}</text>` : '') +
      `</g>`
    );
    return;
  }

  svgParts.push(
    `<g class="${cls}" data-string="${marker.string}" data-fret="${marker.fret}">` +
    `<circle class="fb-marker-shape fb-marker-scale" cx="${cx}" cy="${cy}" r="10"/>` +
    (label ? `<text class="fb-marker-label" x="${cx}" y="${cy + 3.5}" text-anchor="middle">${escapeHtml(label)}</text>` : '') +
    `</g>`
  );
}

function renderOverlay(svgParts, overlay, metrics, lefty) {
  if (!overlay) return;
  const type = overlay.type || 'line';
  if (type === 'line') {
    const x1 = overlay.x1 != null ? overlay.x1 : xForFret(overlay.fret1, metrics.fretStart, lefty, metrics.fretEnd);
    const y1 = overlay.y1 != null ? overlay.y1 : yForString(overlay.string1, metrics.stringCount);
    const x2 = overlay.x2 != null ? overlay.x2 : xForFret(overlay.fret2, metrics.fretStart, lefty, metrics.fretEnd);
    const y2 = overlay.y2 != null ? overlay.y2 : yForString(overlay.string2, metrics.stringCount);
    const cls = overlay.className || 'fb-overlay-line';
    svgParts.push(`<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    return;
  }
  if (type === 'path' && overlay.d) {
    const cls = overlay.className || 'fb-overlay-path';
    svgParts.push(`<path class="${cls}" d="${escapeHtml(overlay.d)}"/>`);
  }
}

function buildSvg(model, positions, options = {}) {
  const lefty = model.orientation === 'left';
  const metrics = layoutMetrics(model, positions);
  const markerMap = buildMarkerMap(model.markers);
  const middleString = Math.floor(metrics.stringCount / 2);
  const ariaLabel = escapeHtml(buildAriaLabel(model, positions, options));
  const order = fretOrder(metrics.fretStart, metrics.fretEnd, lefty);
  const svgParts = [];

  svgParts.push(
    `<svg class="fretboard-svg" viewBox="0 0 ${metrics.totalW} ${metrics.totalH}" ` +
    `width="${metrics.totalW}" height="${metrics.totalH}" role="img" aria-label="${ariaLabel}">`
  );

  for (const f of order) {
    const x = xForFret(f, metrics.fretStart, lefty, metrics.fretEnd);
    svgParts.push(`<text class="fb-fretnum" x="${x}" y="12" text-anchor="middle">${f}</text>`);
  }

  svgParts.push(
    `<rect class="fb-board-bg" x="${LABEL_W}" y="${HEADER_H}" width="${metrics.boardW}" height="${metrics.boardH}" rx="6"/>`
  );

  if (metrics.fretStart === 0) {
    const nutX = LABEL_W + 2;
    svgParts.push(
      `<line class="fb-nut" x1="${nutX}" y1="${HEADER_H + 4}" x2="${nutX}" y2="${HEADER_H + metrics.boardH - 4}"/>`
    );
  }

  for (let col = 0; col <= metrics.fretCount; col++) {
    const x = LABEL_W + col * CELL_W;
    svgParts.push(
      `<line class="fb-fretline" x1="${x}" y1="${HEADER_H + 4}" x2="${x}" y2="${HEADER_H + metrics.boardH - 4}"/>`
    );
  }

  renderInlays(svgParts, metrics, lefty, middleString);

  for (let s = 0; s < metrics.stringCount; s++) {
    const y = yForString(s, metrics.stringCount);
    svgParts.push(
      `<line class="fb-string" x1="${LABEL_W + 4}" y1="${y}" x2="${LABEL_W + metrics.boardW - 4}" y2="${y}"/>`
    );
    const open = positions.strings[s]?.open;
    const openLabel = open ? `${open.note}${open.oct}` : '';
    svgParts.push(
      `<text class="fb-strlabel" x="${LABEL_W - 6}" y="${y + 3.5}" text-anchor="end">${escapeHtml(openLabel)}</text>`
    );
  }

  if (Array.isArray(model.overlays)) {
    for (const overlay of model.overlays) renderOverlay(svgParts, overlay, metrics, lefty);
  }

  for (const marker of markerMap.values()) {
    const cx = xForFret(marker.fret, metrics.fretStart, lefty, metrics.fretEnd);
    const cy = yForString(marker.string, metrics.stringCount);
    renderMarker(svgParts, marker, cx, cy);
  }

  svgParts.push('</svg>');
  return svgParts.join('');
}

function ensureHostStructure(hostEl) {
  hostEl.classList.add('fretboard-host');
  let scroll = hostEl.querySelector('.fretboard-scroll');
  if (!scroll) {
    scroll = document.createElement('div');
    scroll.className = 'fretboard-scroll';
    hostEl.innerHTML = '';
    hostEl.appendChild(scroll);
  }
  return scroll;
}

function paint(hostEl, model, options = {}) {
  const positions = fretPositions(model);
  const scroll = ensureHostStructure(hostEl);
  scroll.innerHTML = buildSvg(model, positions, options);
  return positions;
}

export function renderFretboard(hostEl, model = {}, options = {}) {
  if (!hostEl) {
    return {
      update() {},
      destroy() {},
    };
  }

  let currentModel = { ...model };
  let currentOptions = { ...options };
  paint(hostEl, currentModel, currentOptions);

  return {
    update(nextModel = {}, nextOptions = {}) {
      currentModel = { ...currentModel, ...nextModel };
      if (nextOptions) currentOptions = { ...currentOptions, ...nextOptions };
      paint(hostEl, currentModel, currentOptions);
    },
    destroy() {
      hostEl.innerHTML = '';
      hostEl.classList.remove('fretboard-host');
    },
  };
}
