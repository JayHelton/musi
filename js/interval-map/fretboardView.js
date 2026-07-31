/**
 * Accessible fretboard renderer for Interval Map.
 */

import {
  noteLabel,
  intervalLabel,
  intervalClass,
  boundaryTypeBetweenStrings,
  BOUNDARY_LABELS,
} from './model.js';

const FB_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const FB_DOUBLE = new Set([12, 24]);

export function renderFretboard(boardEl, {
  strings,
  openMidis,
  fretStart = 0,
  fretEnd = 12,
  handedness = 'right',
  anchor = null,
  positions = [],
  highlight = {},
  labelMode = 'interval',
  octaveAs8 = false,
  showBoundary = true,
  interactive = true,
  answersHidden = false,
  revealedKeys = null,
  onCellClick = null,
  emphasizeInterval = null,
  dimOthers = false,
  nearestOnly = false,
  nearestKeys = null,
} = {}) {
  if (!boardEl) return { cells: new Map() };
  const overlay = boardEl.parentElement?.querySelector('.io-shape-overlay');
  const count = fretEnd - fretStart + 1;
  const lefty = handedness === 'left';
  const cellMap = new Map();

  boardEl.style.gridTemplateColumns = `32px repeat(${count}, minmax(28px, 1fr))`;
  boardEl.style.gridTemplateRows = `18px repeat(${strings.length}, minmax(28px, 32px))`;
  boardEl.innerHTML = '';
  if (overlay) overlay.innerHTML = '';

  const hdr0 = document.createElement('div');
  hdr0.className = 'fb-header';
  boardEl.appendChild(hdr0);

  const fretOrder = [];
  for (let f = fretStart; f <= fretEnd; f++) fretOrder.push(f);
  if (lefty) fretOrder.reverse();
  fretOrder.forEach((f) => {
    const hdr = document.createElement('div');
    hdr.className = 'fb-header';
    hdr.textContent = String(f);
    boardEl.appendChild(hdr);
  });

  const posByKey = new Map(positions.map((p) => [`${p.string}:${p.fret}`, p]));
  const middle = Math.floor(strings.length / 2);

  const rows = [];
  for (let s = strings.length - 1; s >= 0; s--) rows.push(s);
  if (lefty) rows.reverse();

  rows.forEach((s) => {
    const label = document.createElement('div');
    label.className = 'fb-string-label';
    label.textContent = `${strings[s].note}${strings[s].oct}`;
    const boundBelow = showBoundary ? boundaryTypeBetweenStrings(s, openMidis) : null;
    const boundAbove = showBoundary && s > 0 ? boundaryTypeBetweenStrings(s - 1, openMidis) : null;
    const bound = (boundBelow && boundBelow.type !== 'fourth') ? boundBelow
      : (boundAbove && boundAbove.type !== 'fourth') ? boundAbove
        : null;
    if (bound) {
      label.classList.add('io-boundary-string', `io-bound-${bound.type}`);
      label.title = bound.label;
    }
    boardEl.appendChild(label);

    fretOrder.forEach((f) => {
      const key = `${s}:${f}`;
      const midi = openMidis[s] + f;
      const pos = posByKey.get(key);
      const cell = document.createElement('div');
      cell.className = 'fb-cell io-cell';
      cell.dataset.string = String(s);
      cell.dataset.fret = String(f);
      cell.dataset.midi = String(midi);
      if (f === 0) cell.classList.add('nut');
      if (FB_DOTS.includes(f) && f > 0) {
        const isD = FB_DOUBLE.has(f);
        if (isD ? (s === middle - 1 || s === middle + 1) : s === middle) cell.classList.add('dot');
      }

      if (boundBelow && boundBelow.type !== 'fourth' && showBoundary) {
        cell.classList.add('io-boundary', `io-bound-${boundBelow.type}`);
      }

      const isAnchor = anchor && anchor.string === s && anchor.fret === f;
      const hl = highlight[key] || {};

      if (pos) {
        cell.classList.add('io-in-map');
        if (nearestOnly && nearestKeys && !nearestKeys.has(key) && !isAnchor) {
          cell.classList.add('io-dim');
        }
        if (dimOthers && emphasizeInterval != null && pos.intervalClass !== emphasizeInterval && !isAnchor) {
          cell.classList.add('io-dim');
        }
        if (emphasizeInterval != null && pos.intervalClass === emphasizeInterval) {
          cell.classList.add('io-emphasis');
        }
      } else if (!isAnchor) {
        cell.classList.add('io-out');
      }

      if (isAnchor || hl.anchor) cell.classList.add('io-root');
      if (hl.target) cell.classList.add('io-target');
      if (hl.selected) cell.classList.add('selected');
      if (hl.correct) cell.classList.add('correct');
      if (hl.wrong) cell.classList.add('wrong');
      if (hl.reveal) cell.classList.add('reveal', 'io-revealed');
      if (hl.hint) cell.classList.add('io-hint');
      if (hl.detected) cell.classList.add('io-detected');
      if (hl.shown) cell.classList.add('io-shown');
      if (hl.ghost) cell.classList.add('io-ghost');
      if (hl.slot) cell.classList.add('io-slot');
      if (pos?.isOctave) cell.classList.add('io-octave');
      if (hl.candidateRoot) cell.classList.add('io-candidate-root');

      const hideLabel = answersHidden && !isAnchor && !(revealedKeys && revealedKeys.has(key)) && !hl.reveal && !hl.shown && !hl.correct;
      let text = '';
      if (!hideLabel && (pos || isAnchor || hl.forceLabel)) {
        const rootMidi = anchor ? anchor.midi : midi;
        const ic = intervalClass(midi, rootMidi);
        const lab = intervalLabel(ic, { octaveAs8, convention: 'degree' });
        const note = NOTE_NAME(midi);
        if (labelMode === 'note') text = note;
        else if (labelMode === 'both') text = `${isAnchor ? 'R' : lab}\n${note}`;
        else if (labelMode === 'blank' || labelMode === 'hidden') text = isAnchor ? 'R' : '';
        else text = isAnchor ? 'R' : lab;
      }
      if (isAnchor && !text) text = 'R';
      cell.textContent = text;
      if (text.includes('\n')) cell.classList.add('io-two-line');

      // Accessibility: never leak answers when hidden
      const displayString = s + 1; // 1-based for musicians (low string = 1? Actually guitarists often number high E as 1)
      // Use low→high index+1 with explicit "String N (low→high)" in longer description
      const stringNo = s + 1;
      let aria;
      if (hideLabel && !isAnchor) {
        aria = `String ${stringNo}, fret ${f}, unrevealed position`;
      } else {
        const note = noteLabel(midi);
        const rel = anchor
          ? (isAnchor ? 'anchor root' : `${describeIc(intervalClass(midi, anchor.midi))} from ${anchor.label}`)
          : note;
        aria = `String ${stringNo}, fret ${f}, ${note}, ${rel}`;
      }
      cell.setAttribute('role', interactive ? 'button' : 'gridcell');
      cell.setAttribute('aria-label', aria);
      cell.tabIndex = interactive ? 0 : -1;

      if (interactive && typeof onCellClick === 'function') {
        const activate = (e) => {
          e.preventDefault();
          onCellClick({ string: s, fret: f, midi, pos, key, cell });
        };
        cell.addEventListener('click', activate);
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') activate(e);
        });
      }

      boardEl.appendChild(cell);
      cellMap.set(key, cell);
    });
  });

  return { cells: cellMap, lefty };
}

function NOTE_NAME(midi) {
  return noteLabel(midi).replace(/\d+$/, '');
}

function describeIc(ic) {
  const names = ['root', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];
  return names[ic] || 'interval';
}

export function drawShapeLines(overlayEl, boardEl, anchor, targets, handedness = 'right') {
  if (!overlayEl || !boardEl || !anchor) return;
  overlayEl.innerHTML = '';
  const aCell = boardEl.querySelector(`[data-string="${anchor.string}"][data-fret="${anchor.fret}"]`);
  if (!aCell) return;
  const boardRect = boardEl.getBoundingClientRect();
  const aRect = aCell.getBoundingClientRect();
  const ax = aRect.left - boardRect.left + aRect.width / 2;
  const ay = aRect.top - boardRect.top + aRect.height / 2;
  overlayEl.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  overlayEl.setAttribute('width', String(boardRect.width));
  overlayEl.setAttribute('height', String(boardRect.height));

  for (const t of targets || []) {
    const tCell = boardEl.querySelector(`[data-string="${t.string}"][data-fret="${t.fret}"]`);
    if (!tCell) continue;
    const tRect = tCell.getBoundingClientRect();
    const tx = tRect.left - boardRect.left + tRect.width / 2;
    const ty = tRect.top - boardRect.top + tRect.height / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(ax));
    line.setAttribute('y1', String(ay));
    line.setAttribute('x2', String(tx));
    line.setAttribute('y2', String(ty));
    line.setAttribute('class', 'io-shape-line' + (t.crossesBoundary ? ' io-shape-boundary' : ''));
    overlayEl.appendChild(line);
  }
  void handedness;
}

export { BOUNDARY_LABELS };
