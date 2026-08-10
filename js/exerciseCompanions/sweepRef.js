import { INTERVAL_LABELS } from '../theory.js';
import {
  SWEEP_STRING_SETS,
  lookupPattern,
  patternTitle,
  buildSweepLayout,
} from '../sweepPatterns.js';
import { createCompanionPanel } from './panel.js';
import { renderFretboardGrid, renderLegend, DEGREE_LABELS } from './diagram.js';

const SWEEP_NECK = [
  { key: 'E', label: 'E' },
  { key: 'A', label: 'A' },
  { key: 'D', label: 'D' },
  { key: 'G', label: 'G' },
  { key: 'B', label: 'B' },
  { key: 'e', label: 'e' },
];

const STRING_TO_INDEX = Object.fromEntries(SWEEP_NECK.map((s, i) => [s.key, i]));

function sweepHitMap(layout) {
  const hits = new Map();
  if (!layout?.strings) return hits;
  layout.strings.forEach((str) => {
    const sIdx = STRING_TO_INDEX[str.note];
    if (sIdx == null) return;
    str.frets.forEach((f) => {
      const existing = hits.get(`${sIdx}:${f.fret}`);
      const order = f.order;
      if (!existing || order < existing.order) {
        hits.set(`${sIdx}:${f.fret}`, {
          label: DEGREE_LABELS[f.interval] || String(f.interval),
          isRoot: f.isRoot,
          interval: f.interval,
          order,
          title: `${f.noteName} · step ${order + 1}${f.tech ? ` · ${f.tech}` : ''}`,
        });
      }
    });
  });
  return hits;
}

export function mountSweepRef(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);
  const stringSet = companion.stringSet ?? 3;
  const setInfo = SWEEP_STRING_SETS[stringSet];

  const lock = document.createElement('p');
  lock.className = 'ec-sub';

  const diagramHost = document.createElement('div');
  diagramHost.className = 'ec-diagram-host';

  const meta = document.createElement('div');
  meta.className = 'ec-sweep-meta';

  function render() {
    diagramHost.innerHTML = '';
    meta.innerHTML = '';

    const pattern = lookupPattern(companion.patternId, stringSet, companion.inversion ?? 0);
    if (!pattern) {
      lock.textContent = `Locked: ${companion.root} · no pattern for this combination`;
      diagramHost.innerHTML = '<p class="ec-empty">No pattern for this combination.</p>';
      return;
    }

    const title = patternTitle(companion.root, pattern, pattern.inversion || 0);
    lock.textContent = `Locked: ${title} · ${setInfo?.label || `${stringSet}-string`}`;

    const layout = buildSweepLayout(companion.root, pattern);
    if (!layout) {
      diagramHost.innerHTML = '<p class="ec-empty">Could not build sweep layout.</p>';
      return;
    }

    const hits = sweepHitMap(layout);
    const intervalsSeen = new Set();
    hits.forEach((h) => intervalsSeen.add(h.interval));

    const board = renderFretboardGrid({
      strings: SWEEP_NECK,
      fretStart: 0,
      fretEnd: 24,
      hits,
      className: 'ec-fretboard ec-sweep-board',
    });
    diagramHost.appendChild(board);

    if (intervalsSeen.size) {
      diagramHost.appendChild(renderLegend(
        [...intervalsSeen].sort((a, b) => a - b).map((iv) => ({
          interval: iv,
          isRoot: iv === 0,
          text: `${DEGREE_LABELS[iv] || iv} · ${INTERVAL_LABELS[iv] || iv}`,
        })),
      ));
    }

    const orderNote = document.createElement('p');
    orderNote.className = 'ec-hint';
    orderNote.textContent = 'Numbers show pick-stroke order.';
    meta.appendChild(orderNote);

    if (layout.bassLabel) {
      const bass = document.createElement('p');
      bass.className = 'ec-hint';
      bass.textContent = layout.bassLabel;
      meta.appendChild(bass);
    }

    if (layout.tab) {
      const tabWrap = document.createElement('div');
      tabWrap.className = 'ec-tab-wrap';
      const pre = document.createElement('pre');
      pre.className = 'ec-tab';
      pre.textContent = layout.tab;
      tabWrap.appendChild(pre);
      meta.appendChild(tabWrap);
    }
  }

  shell.body.append(lock, diagramHost, meta);
  render();

  return {
    refresh() { render(); },
    stop() {},
    destroy() { shell.destroy(); },
  };
}
