import { parseNote, TUNINGS } from '../theory.js';
import {
  TRIAD_QUALITIES,
  stringSetsForTuning,
  findClosedTriadVoicings,
} from '../triadReference.js';
import { createCompanionPanel } from './panel.js';
import { escapeHtml } from './diagram.js';

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

function openMidisFor(tuningName) {
  return (TUNINGS[tuningName] || TUNINGS.Standard || []).map((s) => {
    const p = parseNote(s.note);
    return p ? 12 * (s.oct + 1) + p.semi : 0;
  });
}

function chordSymbol(root, quality) {
  if (quality.id === 'diminished') return `${root}°`;
  if (quality.id === 'augmented') return `${root}+`;
  if (quality.id === 'sus4') return `${root}4`;
  return `${root}${quality.displaySym}`;
}

function renderVoicingSvg(voicing, { start, end, color, strings, set }) {
  const cellW = 26;
  const strGap = 22;
  const padY = 8;
  const labelW = 28;
  const fretCount = end - start + 1;
  const boardW = fretCount * cellW;
  const boardH = padY * 2 + strGap * 2;
  const totalW = labelW + boardW;
  const totalH = boardH + 16;

  const xForFret = (f) => labelW + (f - start + 0.5) * cellW;
  const yForString = (si) => {
    const displayRow = 2 - si;
    return 14 + padY + displayRow * strGap;
  };

  let svg = `<svg class="ec-triad-svg" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-hidden="true">`;
  for (let f = start; f <= end; f++) {
    const x = xForFret(f);
    svg += `<text class="ec-triad-fretnum" x="${x}" y="10" text-anchor="middle">${f}</text>`;
  }
  svg += `<rect class="ec-triad-board-bg" x="${labelW}" y="14" width="${boardW}" height="${boardH}" rx="4"/>`;
  for (let f = start; f <= end; f++) {
    const x = labelW + (f - start) * cellW;
    if (f === 0 || (start === 0 && f === start)) {
      svg += `<line class="ec-triad-nut" x1="${labelW + 2}" y1="18" x2="${labelW + 2}" y2="${14 + boardH - 4}"/>`;
    }
    svg += `<line class="ec-triad-fretline" x1="${x}" y1="18" x2="${x}" y2="${14 + boardH - 4}"/>`;
    if (FB_DOTS.includes(f) && f > 0) {
      svg += `<circle class="ec-triad-inlay" cx="${xForFret(f)}" cy="${14 + boardH / 2}" r="2"/>`;
    }
  }
  svg += `<line class="ec-triad-fretline" x1="${labelW + boardW}" y1="18" x2="${labelW + boardW}" y2="${14 + boardH - 4}"/>`;
  for (let si = 0; si < 3; si++) {
    const y = yForString(si);
    svg += `<line class="ec-triad-string" x1="${labelW + 4}" y1="${y}" x2="${labelW + boardW - 4}" y2="${y}"/>`;
  }
  if (set) {
    const tuningStrs = TUNINGS[strings.tuningName] || [];
    for (let si = 2; si >= 0; si--) {
      const abs = set.stringIndices[si];
      const note = tuningStrs[abs] ? tuningStrs[abs].note : '';
      svg += `<text class="ec-triad-strlabel" x="${labelW - 6}" y="${yForString(si) + 3}" text-anchor="end">${escapeHtml(note)}</text>`;
    }
  }
  const pts = voicing.notes.map((n) => `${xForFret(n.fret)},${yForString(n.string)}`).join(' ');
  svg += `<polygon class="ec-triad-shape" points="${pts}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.4"/>`;
  voicing.notes.forEach((n) => {
    const cx = xForFret(n.fret);
    const cy = yForString(n.string);
    const isRoot = n.interval === 0;
    svg += `<circle cx="${cx}" cy="${cy}" r="${isRoot ? 9 : 8}" fill="${color}"/>`;
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" class="ec-triad-note-label">${escapeHtml(n.label)}</text>`;
  });
  svg += '</svg>';
  return svg;
}

const INV_ORDER = ['R', '1st', '2nd'];
const INV_LABELS = { R: 'Root position', '1st': '1st inversion', '2nd': '2nd inversion' };

export function mountTriadRef(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);
  const quality = TRIAD_QUALITIES.find((q) => q.id === companion.quality) || TRIAD_QUALITIES[0];
  const color = `var(${quality.colorVar})`;
  const fretStart = companion.fretStart ?? 0;
  const fretEnd = companion.fretEnd ?? 15;

  const lock = document.createElement('p');
  lock.className = 'ec-sub';

  const stack = document.createElement('div');
  stack.className = 'ec-triad-stack';

  function render() {
    const rootP = parseNote(companion.root);
    const sets = stringSetsForTuning(companion.tuning);
    const set = sets.find((s) => s.index === companion.stringSet) || sets[sets.length - 1];
    stack.innerHTML = '';

    if (!rootP || !set) {
      lock.textContent = 'Invalid configuration.';
      stack.innerHTML = '<p class="ec-empty">No string set for this tuning.</p>';
      return;
    }

    lock.textContent = `Locked: ${chordSymbol(companion.root, quality)} · ${set.highFirstLabel} · ${companion.tuning} · frets ${fretStart}–${fretEnd}`;

    const allOpen = openMidisFor(companion.tuning);
    const setOpen = set.stringIndices.map((i) => allOpen[i]);
    const voicings = findClosedTriadVoicings(setOpen, rootP.semi, quality.tones, {
      minFret: fretStart,
      maxFret: fretEnd,
      maxSpan: 4,
    }).filter((v) => v.minFret >= fretStart && v.maxFret <= fretEnd);

    const byInv = Object.fromEntries(INV_ORDER.map((k) => [k, []]));
    voicings.forEach((v) => {
      if (byInv[v.inv]) byInv[v.inv].push(v);
    });

    INV_ORDER.forEach((invKey) => {
      const group = byInv[invKey];
      if (!group.length) return;
      const block = document.createElement('div');
      block.className = 'ec-triad-inv';
      block.style.setProperty('--triad-color', color);
      const title = document.createElement('div');
      title.className = 'ec-triad-inv-title';
      title.textContent = INV_LABELS[invKey] || invKey;
      block.appendChild(title);
      const row = document.createElement('div');
      row.className = 'ec-triad-inv-row';
      group.forEach((v) => {
        const card = document.createElement('div');
        card.className = 'ec-triad-mini';
        card.innerHTML = renderVoicingSvg(v, {
          start: fretStart,
          end: fretEnd,
          color,
          strings: { tuningName: companion.tuning },
          set,
        });
        row.appendChild(card);
      });
      block.appendChild(row);
      stack.appendChild(block);
    });

    if (!stack.children.length) {
      stack.innerHTML = '<p class="ec-empty">No closed voicings in this fret range.</p>';
    }
  }

  shell.body.append(lock, stack);
  render();

  return {
    refresh() { render(); },
    stop() {},
    destroy() { shell.destroy(); },
  };
}
