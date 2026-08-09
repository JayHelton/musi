// Follow-along visual for Guitar Pro practice: tab columns + drum lanes + playhead.
// Shared by the Guitar Pro Player (extracted from Song Learning).

import { DRUM_TAB_LANES, DRUM_LANE_PRIORITY, drumTabGlyph } from './drums/types.js';

const COL_BEAT = 0.25; // visual column = 16th note

function drumLaneKey(lane) {
  if (lane.instruments.includes('hihatClosed')) return 'hihat';
  return lane.instruments[0];
}

export const DRUM_LANES = DRUM_TAB_LANES.map((lane) => ({
  key: drumLaneKey(lane),
  instruments: lane.instruments,
  label: lane.label,
}));

function measureIndexAtBeat(measures, beat) {
  if (!measures?.length) return 0;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const a = Number.isFinite(m.startBeat) ? m.startBeat : 0;
    const b = Number.isFinite(m.endBeat) ? m.endBeat : a;
    if (beat >= a && beat < b) return i;
  }
  return Math.max(0, measures.length - 1);
}

/**
 * Build visual columns for a beat range (16th-note grid).
 * @returns {{ columns: object[], startBeat: number, endBeat: number, stringCount: number }}
 */
export function buildFollowColumns({
  guitarModel = null,
  percModel = null,
  startBeat = 0,
  endBeat = null,
  colBeat = COL_BEAT,
} = {}) {
  const gEnd = guitarModel
    ? (Number.isFinite(guitarModel.totalBeats) ? guitarModel.totalBeats : 0)
    : 0;
  const dEnd = percModel
    ? (Number.isFinite(percModel.totalBeats) ? percModel.totalBeats : 0)
    : 0;
  const end = endBeat != null ? endBeat : Math.max(gEnd, dEnd, startBeat + 4);
  const span = Math.max(colBeat, end - startBeat);
  const count = Math.max(1, Math.ceil(span / colBeat - 1e-9));
  const strings = guitarModel?.strings || [];
  const stringCount = strings.length;

  const columns = [];
  for (let i = 0; i < count; i++) {
    const beat = startBeat + i * colBeat;
    columns.push({
      index: i,
      beat,
      frets: new Array(stringCount).fill(null), // null | number | 'x'
      drums: {},
      barStart: false,
      marker: null,
    });
  }

  const measures = guitarModel?.measures || percModel?.measures || [];
  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];
    const ms = Number.isFinite(m.startBeat) ? m.startBeat : 0;
    if (ms < startBeat - 1e-6 || ms >= end - 1e-6) continue;
    const idx = Math.round((ms - startBeat) / colBeat);
    if (columns[idx]) {
      columns[idx].barStart = true;
      columns[idx].measureIndex = mi;
      columns[idx].barNumber = mi + 1;
      columns[idx].beatInBar = 0;
      if (m.marker) columns[idx].marker = m.marker;
    }
  }

  for (const col of columns) {
    if (col.barStart) continue;
    const frac = col.beat % 1;
    if (frac < 1e-6 || frac > 1 - 1e-6) {
      col.beatStart = true;
      const mi = measureIndexAtBeat(measures, col.beat);
      const mStart = measures[mi] && Number.isFinite(measures[mi].startBeat)
        ? measures[mi].startBeat : 0;
      col.beatInBar = col.beat - mStart;
    }
  }

  if (guitarModel) {
    for (const ev of guitarModel.events || []) {
      const b = Number.isFinite(ev.start) ? ev.start : 0;
      if (b < startBeat - 1e-6 || b >= end - 1e-6) continue;
      const idx = Math.round((b - startBeat) / colBeat);
      const col = columns[idx];
      if (!col || ev.stringIndex == null || ev.stringIndex < 0 || ev.stringIndex >= stringCount) continue;
      if (ev.dead) col.frets[ev.stringIndex] = 'x';
      else if (ev.fret != null) col.frets[ev.stringIndex] = ev.fret;
    }
  }

  if (percModel) {
    for (const ev of percModel.events || []) {
      const b = Number.isFinite(ev.start) ? ev.start : 0;
      if (b < startBeat - 1e-6 || b >= end - 1e-6) continue;
      const idx = Math.round((b - startBeat) / colBeat);
      const col = columns[idx];
      if (!col || !ev.instrument) continue;
      const lane = DRUM_LANES.find((l) => l.instruments.includes(ev.instrument));
      if (!lane) continue;
      const pri = DRUM_LANE_PRIORITY[ev.instrument] ?? 2;
      const glyph = drumTabGlyph(ev.instrument, ev.velocity ?? 0.72);
      if (!col.drums[lane.key] || pri > (col.drums[lane.key].pri || 0)) {
        col.drums[lane.key] = {
          instrument: ev.instrument,
          pri,
          glyph,
        };
      }
    }
  }

  return { columns, startBeat, endBeat: end, stringCount, strings, colBeat };
}

const FOLLOW_SIZES = new Set(['sm', 'md', 'lg']);

function snapBeatToQuarter(beat) {
  return Math.round(beat);
}

function beatToColIndex(beat, startBeat, colBeat) {
  return Math.round((beat - startBeat) / colBeat);
}

/**
 * Mount a follow-along visual into `host` and return an updater.
 * @param {object} [options]
 * @param {'sm'|'md'|'lg'} [options.size='md']
 * @param {{ startBeat: number, endBeat: number }|null} [options.selection]
 * @param {(sel: { startBeat: number, endBeat: number }|null) => void} [options.onSelectionChange]
 */
export function mountFollowView(host, layout, options = {}) {
  const noop = {
    update() {},
    destroy() {},
    setSize() {},
    setSelection() {},
    getSelection() { return null; },
  };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('sln-follow');

  let size = FOLLOW_SIZES.has(options.size) ? options.size : 'md';
  host.classList.add(`size-${size}`);

  const { columns, stringCount, strings, colBeat, startBeat } = layout;
  const activeDrumLanes = DRUM_LANES.filter((lane) =>
    columns.some((c) => c.drums[lane.key])
  );

  const head = document.createElement('div');
  head.className = 'sln-follow-meta';
  const metaLeft = document.createElement('span');
  metaLeft.className = 'sln-follow-pos';
  metaLeft.textContent = 'Ready';
  const metaRight = document.createElement('span');
  metaRight.className = 'sln-follow-time';
  head.append(metaLeft, metaRight);
  host.appendChild(head);

  const stage = document.createElement('div');
  stage.className = 'sln-follow-stage';

  const labels = document.createElement('div');
  labels.className = 'sln-follow-labels';
  // Guitar strings high → low (visual top = high E)
  for (let si = stringCount - 1; si >= 0; si--) {
    const lab = document.createElement('div');
    lab.className = 'sln-follow-label';
    lab.textContent = strings[si]?.label || strings[si]?.note || String(si + 1);
    labels.appendChild(lab);
  }
  if (stringCount && activeDrumLanes.length) {
    const gap = document.createElement('div');
    gap.className = 'sln-follow-label sln-follow-gap';
    gap.textContent = '';
    labels.appendChild(gap);
  }
  activeDrumLanes.forEach((lane) => {
    const lab = document.createElement('div');
    lab.className = 'sln-follow-label drum';
    lab.textContent = lane.label;
    labels.appendChild(lab);
  });
  stage.appendChild(labels);

  const viewport = document.createElement('div');
  viewport.className = 'sln-follow-viewport';
  const playhead = document.createElement('div');
  playhead.className = 'sln-follow-playhead';
  viewport.appendChild(playhead);

  const scroller = document.createElement('div');
  scroller.className = 'sln-follow-scroll';

  const grid = document.createElement('div');
  grid.className = 'sln-follow-grid';
  const colEls = [];

  columns.forEach((col, i) => {
    const colEl = document.createElement('div');
    let colClass = 'sln-follow-col';
    if (col.barStart) colClass += ' bar-start';
    if (col.beatStart) colClass += ' beat-start';
    colEl.className = colClass;
    colEl.dataset.index = String(i);
    colEl.dataset.beat = String(col.beat);
    if (col.barStart && col.barNumber != null) {
      const bn = document.createElement('div');
      bn.className = 'sln-follow-bar-num';
      bn.textContent = String(col.barNumber);
      colEl.appendChild(bn);
    }
    if (col.marker) {
      const m = document.createElement('div');
      m.className = 'sln-follow-marker';
      m.textContent = col.marker;
      colEl.appendChild(m);
    }
    for (let si = stringCount - 1; si >= 0; si--) {
      const cell = document.createElement('div');
      cell.className = 'sln-follow-cell guitar';
      const v = col.frets[si];
      cell.textContent = v == null ? '' : String(v);
      if (v != null) cell.classList.add('hit');
      colEl.appendChild(cell);
    }
    if (stringCount && activeDrumLanes.length) {
      const gap = document.createElement('div');
      gap.className = 'sln-follow-cell gap';
      colEl.appendChild(gap);
    }
    activeDrumLanes.forEach((lane) => {
      const cell = document.createElement('div');
      cell.className = 'sln-follow-cell drum';
      const hit = col.drums[lane.key];
      if (hit) {
        cell.textContent = hit.glyph;
        cell.classList.add('hit', hit.instrument);
      }
      colEl.appendChild(cell);
    });
    grid.appendChild(colEl);
    colEls.push(colEl);
  });

  scroller.appendChild(grid);
  viewport.appendChild(scroller);
  stage.appendChild(viewport);
  host.appendChild(stage);

  let lastActive = -1;
  let isPlaying = false;
  let userScrolled = false;
  let selection = null; // { startBeat, endBeat } end exclusive
  let dragSel = null; // { anchorIdx, currentIdx }

  function colIndexForBeat(beat) {
    return Math.max(0, Math.min(columns.length - 1, beatToColIndex(beat, startBeat, colBeat)));
  }

  function beatForColIndex(idx) {
    return startBeat + idx * colBeat;
  }

  function snapColIndex(idx) {
    const colsPerBeat = Math.round(1 / colBeat);
    return Math.max(0, Math.min(columns.length - 1, Math.round(idx / colsPerBeat) * colsPerBeat));
  }

  function paintSelection(sel) {
    colEls.forEach((el) => el.classList.remove('in-selection'));
    if (!sel) return;
    const a = colIndexForBeat(sel.startBeat);
    const b = colIndexForBeat(sel.endBeat - colBeat * 0.5);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = lo; i <= hi; i++) {
      if (colEls[i]) colEls[i].classList.add('in-selection');
    }
  }

  function setSelection(sel, { fire = false } = {}) {
    selection = sel
      ? {
        startBeat: snapBeatToQuarter(sel.startBeat),
        endBeat: snapBeatToQuarter(sel.endBeat),
      }
      : null;
    if (selection && selection.endBeat <= selection.startBeat) {
      selection.endBeat = selection.startBeat + 1;
    }
    paintSelection(selection);
    if (fire && typeof options.onSelectionChange === 'function') {
      options.onSelectionChange(selection ? { ...selection } : null);
    }
  }

  function getSelection() {
    return selection ? { ...selection } : null;
  }

  function setSize(next) {
    if (!FOLLOW_SIZES.has(next)) return;
    host.classList.remove(`size-${size}`);
    size = next;
    host.classList.add(`size-${size}`);
  }

  function scrollToColumn(idx) {
    const colEl = colEls[idx];
    if (!colEl) return;
    const viewW = viewport.clientWidth || 1;
    const target = colEl.offsetLeft - viewW * 0.28;
    viewport.scrollLeft = Math.max(0, target);
  }

  viewport.addEventListener('scroll', () => {
    if (!isPlaying) userScrolled = true;
  }, { passive: true });

  viewport.addEventListener('wheel', () => {
    if (!isPlaying) userScrolled = true;
  }, { passive: true });

  function selectionFromDrag(anchorIdx, currentIdx) {
    const lo = Math.min(anchorIdx, currentIdx);
    const hi = Math.max(anchorIdx, currentIdx);
    const startBeat = beatForColIndex(snapColIndex(lo));
    const endBeat = beatForColIndex(snapColIndex(hi)) + 1;
    return { startBeat, endBeat };
  }

  function onPointerDown(e) {
    if (isPlaying) return;
    const col = e.target.closest('.sln-follow-col');
    if (!col) return;
    e.preventDefault();
    const idx = Number(col.dataset.index);
    if (!Number.isFinite(idx)) return;
    dragSel = { anchorIdx: snapColIndex(idx), currentIdx: snapColIndex(idx) };
    const sel = selectionFromDrag(dragSel.anchorIdx, dragSel.currentIdx);
    setSelection(sel, { fire: false });
    grid.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragSel) return;
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sln-follow-col');
    if (!col) return;
    const idx = Number(col.dataset.index);
    if (!Number.isFinite(idx)) return;
    dragSel.currentIdx = snapColIndex(idx);
    const sel = selectionFromDrag(dragSel.anchorIdx, dragSel.currentIdx);
    setSelection(sel, { fire: false });
  }

  function onPointerUp(e) {
    if (!dragSel) return;
    const sel = selectionFromDrag(dragSel.anchorIdx, dragSel.currentIdx);
    dragSel = null;
    try { grid.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setSelection(sel, { fire: true });
  }

  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', onPointerUp);

  if (options.selection) {
    setSelection(options.selection, { fire: false });
  }

  function update({ currentSec = 0, bpm = 120, playing = false, durationSec = 0 } = {}) {
    isPlaying = !!playing;
    if (playing) userScrolled = false;

    const beat = (currentSec / 60) * (Number(bpm) || 120);
    const rel = beat - startBeat;
    const idx = Math.max(0, Math.min(columns.length - 1, Math.floor(rel / colBeat + 1e-6)));
    if (idx !== lastActive) {
      if (lastActive >= 0 && colEls[lastActive]) colEls[lastActive].classList.remove('active');
      if (colEls[idx]) colEls[idx].classList.add('active');
      lastActive = idx;
    }
    if (playing || !userScrolled) {
      scrollToColumn(idx);
    }
    const activeCol = columns[idx];
    const barNum = activeCol?.barNumber ?? (activeCol ? Math.floor(activeCol.beat / 4) + 1 : 1);
    metaLeft.textContent = playing
      ? `Bar ${barNum} · beat ${activeCol ? activeCol.beat.toFixed(2) : '—'}`
      : (currentSec > 0.02 ? 'Paused' : 'Ready');
    const fmt = (s) => {
      const n = Math.max(0, Math.floor(s || 0));
      return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    };
    metaRight.textContent = `${fmt(currentSec)} / ${fmt(durationSec)}`;
  }

  return {
    update,
    destroy() {
      grid.removeEventListener('pointerdown', onPointerDown);
      grid.removeEventListener('pointermove', onPointerMove);
      grid.removeEventListener('pointerup', onPointerUp);
      grid.removeEventListener('pointercancel', onPointerUp);
      host.innerHTML = '';
      host.classList.remove('sln-follow', `size-${size}`);
    },
    setSize,
    setSelection: (sel) => setSelection(sel, { fire: false }),
    getSelection,
  };
}
