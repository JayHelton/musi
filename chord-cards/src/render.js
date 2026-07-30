/**
 * Render fretboard diagrams and printable chord cards.
 */
import {
  patternString,
  minRootFret,
  fretSpan,
} from './validate.js';

const STRING_COUNT = 6;

/**
 * Build SVG fretboard for a shape (root-relative).
 * @param {import('../data/shapes.js').ChordShape} shape
 * @param {{ showIntervals?: boolean, showFingering?: boolean, width?: number, height?: number, theme?: 'light'|'dark' }} opts
 */
export function renderDiagramSVG(shape, opts = {}) {
  const showIntervals = opts.showIntervals !== false;
  const showFingering = !!opts.showFingering;
  const width = opts.width || 168;
  const height = opts.height || 148;
  const dark = opts.theme === 'dark';
  const ink = dark ? '#e8e6e1' : '#111';
  const inkSoft = dark ? '#9a968c' : '#666';
  const stringStroke = dark ? '#6a665c' : '#222';
  const rootFill = dark ? 'var(--accent, #7dba4a)' : '#111';
  const rootText = dark ? '#0a0a0a' : '#fff';
  const noteFill = dark ? '#1a1a1a' : '#fff';
  const noteStroke = dark ? '#e8e6e1' : '#111';
  const noteText = dark ? '#e8e6e1' : '#111';

  const frets = shape.frets;
  const sounding = frets.filter((f) => f !== null && f !== undefined);
  const minF = Math.min(0, ...sounding);
  const maxF = Math.max(3, ...sounding);
  // Show frets from minF to maxF inclusive, plus one pad
  const start = minF;
  const end = Math.max(maxF, start + 3);
  const fretCount = end - start; // number of fret spaces

  const padL = 22;
  const padR = 10;
  const padT = showFingering ? 18 : 10;
  const padB = 16;
  const gridW = width - padL - padR;
  const gridH = height - padT - padB;

  const xAt = (stringIdx) => padL + (stringIdx / (STRING_COUNT - 1)) * gridW;
  const yAt = (relFret) => {
    // relFret is the fret LINE position; nut/root line at `start`
    return padT + ((relFret - start) / fretCount) * gridH;
  };

  let parts = [];
  parts.push(`<svg class="fb-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`);

  // Fret lines (horizontal)
  for (let f = start; f <= end; f++) {
    const y = yAt(f);
    const thick = f === start ? 2.4 : 1;
    parts.push(`<line x1="${padL}" y1="${y}" x2="${padL + gridW}" y2="${y}" stroke="${ink}" stroke-width="${thick}"/>`);
  }

  // String lines (vertical) — string 6 on the left
  for (let i = 0; i < STRING_COUNT; i++) {
    const x = xAt(i);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + gridH}" stroke="${stringStroke}" stroke-width="${i === 0 ? 1.6 : 1}"/>`);
  }

  // Mute / open markers above the diagram (open never used; only x)
  for (let i = 0; i < STRING_COUNT; i++) {
    const f = frets[i];
    const x = xAt(i);
    if (f === null || f === undefined) {
      parts.push(`<text x="${x}" y="${padT - 4}" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="${ink}" font-weight="700">×</text>`);
    }
  }

  // Note dots
  for (let i = 0; i < STRING_COUNT; i++) {
    const f = frets[i];
    if (f === null || f === undefined) continue;
    const x = xAt(i);
    // Place dot in the middle of the fret space above fret line `f`
    // For f === start (root fret line), place slightly below the nut/root line
    const yTop = yAt(f);
    const yBot = yAt(f + 1);
    const y = (yTop + yBot) / 2;
    const label = shape.intervals[i];
    const isRoot = label === 'R';
    const r = isRoot ? 9 : 8;
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${isRoot ? rootFill : noteFill}" stroke="${isRoot ? rootFill : noteStroke}" stroke-width="1.5"/>`);
    if (showIntervals) {
      const fill = isRoot ? rootText : noteText;
      const fs = label && label.length > 2 ? 7.5 : 9;
      parts.push(`<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="${fs}" font-family="IBM Plex Sans Condensed,Segoe UI,sans-serif" font-weight="700" fill="${fill}">${escapeXml(label)}</text>`);
    } else {
      // just a filled marker; roots already filled
      if (!isRoot) {
        parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="${ink}"/>`);
      }
    }
    if (showFingering && shape.fingering && shape.fingering[i] != null) {
      parts.push(`<text x="${x}" y="${height - 3}" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" fill="${inkSoft}">${escapeXml(String(shape.fingering[i]))}</text>`);
    }
  }

  // Fret offset labels on the right (R, R+1, …)
  for (let f = start; f < end; f++) {
    const yTop = yAt(f);
    const yBot = yAt(f + 1);
    const y = (yTop + yBot) / 2;
    const lab = f === 0 ? 'R' : f > 0 ? `+${f}` : `${f}`;
    parts.push(`<text x="${width - 4}" y="${y + 3}" text-anchor="end" font-size="8" font-family="ui-monospace,monospace" fill="${inkSoft}">${lab}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tuningLabel(tuningType) {
  return tuningType === 'drop' ? 'Drop (DADGBE model)' : 'Standard (EADGBE)';
}

export function rootStringLabel(n) {
  return `Root on string ${n}`;
}

/**
 * @param {import('../data/shapes.js').ChordShape} shape
 * @param {{ showIntervals?: boolean, showFingering?: boolean, diagramOnly?: boolean }} opts
 */
export function renderCardHTML(shape, opts = {}) {
  const showIntervals = opts.showIntervals !== false;
  const showFingering = opts.showFingering === true;
  const minR = minRootFret(shape.frets);
  const span = fretSpan(shape.frets);
  const pattern = patternString(shape.frets);
  const symbol = shape.symbol ? `(${shape.symbol})` : '';

  const diagram = renderDiagramSVG(shape, { showIntervals, showFingering });

  return `
<article class="chord-card" data-id="${escapeXml(shape.id)}"
  data-tuning="${shape.tuningType}"
  data-family="${shape.chordFamily}"
  data-root-string="${shape.rootString}"
  data-tag="${shape.practicalTag}"
  data-voicing="${escapeXml(shape.voicingCategory)}"
  data-type="${escapeXml(shape.chordType)}">
  <header class="card-head">
    <div class="card-title">
      <h2>${escapeXml(shape.chordType)} <span class="sym">${escapeXml(symbol)}</span></h2>
      <p class="card-meta">${tuningLabel(shape.tuningType)} · ${rootStringLabel(shape.rootString)}</p>
    </div>
    <div class="card-badges">
      <span class="badge">${escapeXml(shape.voicingCategory)}</span>
      ${shape.practicalTag === 'minimal' ? '<span class="badge badge-min">Core</span>' : '<span class="badge badge-exp">Extended</span>'}
    </div>
  </header>
  <div class="card-body">
    <div class="card-diagram">${diagram}</div>
    <div class="card-info">
      <p class="pattern"><span class="k">Pattern</span> <code>${escapeXml(pattern)}</code></p>
      ${showFingering && shape.fingering ? `<p class="fingering"><span class="k">Fingers</span> <code>${shape.fingering.map((x) => (x == null ? 'x' : x)).join(' ')}</code></p>` : ''}
      <p class="use"><span class="k">Use</span> ${escapeXml(shape.bestUse)}</p>
      <p class="play"><span class="k">Play</span> ${escapeXml(shape.playability)}</p>
      <p class="pos"><span class="k">Position</span> ${escapeXml(shape.rootPositionNote)} · practical from fret ${minR}+ (span ${span})</p>
      ${shape.notes ? `<p class="notes"><span class="k">Note</span> ${escapeXml(shape.notes)}</p>` : ''}
    </div>
  </div>
</article>`;
}

/**
 * Filter shapes by UI state.
 */
export function filterShapes(shapes, filters) {
  return shapes.filter((s) => {
    if (filters.tuning && filters.tuning !== 'all' && s.tuningType !== filters.tuning) return false;
    if (filters.family && filters.family !== 'all' && s.chordFamily !== filters.family) return false;
    if (filters.rootString && filters.rootString !== 'all' && String(s.rootString) !== String(filters.rootString)) return false;
    if (filters.tag && filters.tag !== 'all' && s.practicalTag !== filters.tag) return false;
    if (filters.voicing && filters.voicing !== 'all' && s.voicingCategory !== filters.voicing) return false;
    if (filters.deck === 'minimal' && s.practicalTag !== 'minimal') return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${s.chordType} ${s.symbol} ${s.id} ${s.bestUse}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
