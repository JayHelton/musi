// Songsterr-like vertical parchment score renderer for the GP player.

import { DRUM_LANES } from '../gpFollowView.js';
import { snapBeat, normalizeBeatRange, measureSpan, measureIndexAtBeat } from './rangeUtils.js';

const USER_SCROLL_COOLDOWN_MS = 2500;

function beatPctInMeasure(beat, m) {
  const { start, len } = measureSpan(m);
  return Math.max(0, Math.min(100, ((beat - start) / len) * 100));
}

function measuresPerSystem(hostWidth, zoom) {
  const base = hostWidth / (220 * zoom);
  return Math.max(1, Math.min(4, Math.round(base) || 2));
}

/**
 * @param {HTMLElement} host
 */
export function mountParchmentView(host, {
  guitarModel = null,
  percModel = null,
  zoom = 1,
  selection = null,
  onMeasureClick = null,
  onSelectionChange = null,
  loopSelectMode = false,
  autoFollow = true,
} = {}) {
  const noop = {
    update() {},
    setModel() {},
    setZoom() {},
    setSelection() {},
    setLoopSelectMode() {},
    destroy() {},
  };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-parch-root');

  let model = guitarModel || percModel;
  let isDrum = !guitarModel && !!percModel;
  let currentZoom = zoom;
  let sel = selection ? { ...selection } : null;
  let selectMode = !!loopSelectMode;
  let follow = !!autoFollow;
  let userScrollUntil = 0;
  let destroyed = false;

  let measureEls = [];
  let systemEls = [];
  let playheadEl = null;
  let selOverlayEl = null;
  let handleStart = null;
  let handleEnd = null;
  let lastActive = -1;
  let lastBeat = 0;
  let rafId = 0;
  let mps = 2;
  let drag = null;
  let resizeDrag = null;

  const viewport = document.createElement('div');
  viewport.className = 'gpp-parch-viewport';
  const sheet = document.createElement('div');
  sheet.className = 'gpp-parch-sheet';
  viewport.appendChild(sheet);
  host.appendChild(viewport);

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => rebuild())
    : null;
  if (ro) ro.observe(host);

  viewport.addEventListener('scroll', () => {
    userScrollUntil = Date.now() + USER_SCROLL_COOLDOWN_MS;
  }, { passive: true });

  function measures() {
    return model?.measures || [];
  }

  function totalBeats() {
    return model?.totalBeats
      ?? measures().slice(-1)[0]?.endBeat
      ?? 0;
  }

  function activeDrumLanes() {
    if (!percModel && !isDrum) return [];
    const m = isDrum ? model : percModel;
    const insts = new Set((m?.events || []).map((e) => e.instrument).filter(Boolean));
    return DRUM_LANES.filter((lane) => lane.instruments.some((i) => insts.has(i)));
  }

  function renderMeasure(mi, m) {
    const wrap = document.createElement('div');
    wrap.className = 'gpp-parch-measure';
    wrap.dataset.index = String(mi);

    const barNum = document.createElement('div');
    barNum.className = 'gpp-parch-bar-num';
    barNum.textContent = String(mi + 1);
    wrap.appendChild(barNum);

    if (m.marker) {
      const mk = document.createElement('div');
      mk.className = 'gpp-parch-marker';
      mk.textContent = m.marker;
      wrap.appendChild(mk);
    }

    const staff = document.createElement('div');
    staff.className = 'gpp-parch-staff';
    const { start: mStart, end: mEnd } = measureSpan(m);

    if (!isDrum && model?.strings?.length) {
      const strings = model.strings;
      for (let si = strings.length - 1; si >= 0; si--) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string';
        row.dataset.string = String(si);
        const notes = (model.events || []).filter((ev) => {
          const b = Number(ev.start);
          return ev.stringIndex === si && b >= mStart - 1e-6 && b < mEnd - 1e-6;
        });
        for (const ev of notes) {
          const note = document.createElement('span');
          note.className = 'gpp-parch-note' + (ev.dead ? ' dead' : '');
          note.style.left = `${beatPctInMeasure(ev.start, m)}%`;
          note.textContent = ev.dead ? 'x' : (ev.fret != null ? String(ev.fret) : '');
          row.appendChild(note);
        }
        staff.appendChild(row);
      }
    } else {
      const lanes = activeDrumLanes();
      const evts = (model?.events || []).filter((ev) => {
        const b = Number(ev.start);
        return b >= mStart - 1e-6 && b < mEnd - 1e-6;
      });
      for (const lane of lanes) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-drum-lane';
        const lab = document.createElement('span');
        lab.className = 'gpp-parch-lane-label';
        lab.textContent = lane.label;
        row.appendChild(lab);
        for (const ev of evts) {
          if (!lane.instruments.includes(ev.instrument)) continue;
          const hit = document.createElement('span');
          hit.className = 'gpp-parch-drum-hit';
          hit.style.left = `${beatPctInMeasure(ev.start, m)}%`;
          hit.textContent = ev.instrument === 'hihatOpen' ? 'O'
            : ev.instrument === 'snareGhost' ? 'g'
              : ev.instrument === 'snareFlam' ? 'f' : '●';
          row.appendChild(hit);
        }
        staff.appendChild(row);
      }
      if (!lanes.length) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string';
        row.textContent = ' ';
        staff.appendChild(row);
      }
    }

    wrap.appendChild(staff);

    wrap.addEventListener('click', (e) => {
      if (selectMode || resizeDrag || drag) return;
      if (typeof onMeasureClick === 'function') onMeasureClick(mi);
    });

    if (selectMode) {
      wrap.style.touchAction = 'pan-y';
      wrap.addEventListener('pointerdown', onPointerDown);
    }

    return wrap;
  }

  function rebuild() {
    if (destroyed) return;
    sheet.innerHTML = '';
    measureEls = [];
    systemEls = [];
    playheadEl = null;
    selOverlayEl = null;
    handleStart = null;
    handleEnd = null;

    const ms = measures();
    if (!ms.length) return;

    mps = measuresPerSystem(host.clientWidth || 600, currentZoom);
    sheet.style.fontSize = `${Math.round(12 * currentZoom)}px`;

    for (let i = 0; i < ms.length; i += mps) {
      const sys = document.createElement('div');
      sys.className = 'gpp-parch-system';
      sys.style.gap = `${Math.round(4 * currentZoom)}px`;
      const chunk = ms.slice(i, i + mps);
      chunk.forEach((m, j) => {
        const el = renderMeasure(i + j, m);
        sys.appendChild(el);
        measureEls[i + j] = el;
      });
      sheet.appendChild(sys);
      systemEls.push(sys);
    }

    playheadEl = document.createElement('div');
    playheadEl.className = 'gpp-parch-playhead';
    playheadEl.hidden = true;
    sheet.appendChild(playheadEl);

    paintSelection(sel);
    paintActive(lastActive, false);
  }

  function measureIndexAtBeatLocal(beat) {
    return measureIndexAtBeat(measures(), beat);
  }

  function beatFromPointer(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY)?.closest?.('.gpp-parch-measure');
    if (!el) return null;
    const mi = Number(el.dataset.index);
    const m = measures()[mi];
    if (!m) return null;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { start, len } = measureSpan(m);
    return snapBeat(start + frac * len);
  }

  function fireSelection(selObj) {
    if (typeof onSelectionChange === 'function') onSelectionChange(selObj ? { ...selObj } : null);
  }

  function onPointerDown(e) {
    if (!selectMode || e.button !== 0) return;
    const beat = beatFromPointer(e.clientX, e.clientY);
    if (beat == null) return;
    drag = { anchorBeat: beat, pointerId: e.pointerId, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const beat = beatFromPointer(e.clientX, e.clientY);
    if (beat == null) return;
    if (Math.abs(beat - drag.anchorBeat) > 0.01) drag.moved = true;
    const norm = normalizeBeatRange(drag.anchorBeat, beat, { minSpan: 1, songEndBeat: totalBeats() });
    if (!norm) return;
    sel = norm;
    paintSelection(sel);
    highlightSelecting(norm);
  }

  function onPointerUp(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.moved && sel) fireSelection(sel);
    drag = null;
    clearSelecting();
  }

  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);

  function highlightSelecting(norm) {
    const { startIdx, endIdx } = beatToMeasureRange(norm.startBeat, norm.endBeat);
    measureEls.forEach((el, i) => {
      if (!el) return;
      const inRange = i >= startIdx && i <= endIdx;
      el.classList.toggle('selecting', inRange);
    });
  }

  function clearSelecting() {
    measureEls.forEach((el) => {
      el?.classList.remove('selecting');
    });
  }

  function beatToMeasureRange(startBeat, endBeat) {
    let startIdx = 0;
    let endIdx = measures().length - 1;
    const ms = measures();
    for (let i = 0; i < ms.length; i++) {
      const { start, end } = measureSpan(ms[i]);
      if (start <= startBeat + 1e-6) startIdx = i;
      if (start < endBeat - 1e-6) endIdx = i;
    }
    return { startIdx, endIdx };
  }

  function removeSelectionDecor() {
    if (selOverlayEl) { selOverlayEl.remove(); selOverlayEl = null; }
    if (handleStart) { handleStart.remove(); handleStart = null; }
    if (handleEnd) { handleEnd.remove(); handleEnd = null; }
    measureEls.forEach((el) => el?.classList.remove('in-loop'));
  }

  function overlayBoundsForMeasureRange(startIdx, endIdx) {
    let firstEl = null;
    let lastEl = null;
    for (let i = startIdx; i <= endIdx; i++) {
      const el = measureEls[i];
      if (!el) continue;
      if (!firstEl) firstEl = el;
      lastEl = el;
    }
    if (!firstEl || !sheet) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const a = firstEl.getBoundingClientRect();
    const b = (lastEl || firstEl).getBoundingClientRect();
    const left = a.left - sheetRect.left + viewport.scrollLeft;
    const right = b.right - sheetRect.left + viewport.scrollLeft;
    return { left, width: Math.max(8, right - left), right };
  }

  function paintSelection(nextSel) {
    removeSelectionDecor();
    if (!nextSel) return;
    const { startIdx, endIdx } = beatToMeasureRange(nextSel.startBeat, nextSel.endBeat);
    let firstEl = null;
    let lastEl = null;
    for (let i = startIdx; i <= endIdx; i++) {
      const el = measureEls[i];
      if (!el) continue;
      el.classList.add('in-loop');
      if (!firstEl) firstEl = el;
      lastEl = el;
    }
    if (!firstEl || !sheet) return;

    const bounds = overlayBoundsForMeasureRange(startIdx, endIdx);
    if (!bounds) return;

    selOverlayEl = document.createElement('div');
    selOverlayEl.className = 'gpp-parch-sel-overlay';
    selOverlayEl.style.left = `${bounds.left}px`;
    selOverlayEl.style.width = `${bounds.width}px`;
    sheet.appendChild(selOverlayEl);

    const left = bounds.left;
    const right = bounds.right;

    if (selectMode) {
      handleStart = document.createElement('div');
      handleStart.className = 'gpp-parch-handle start';
      handleStart.style.left = `${left}px`;
      handleEnd = document.createElement('div');
      handleEnd.className = 'gpp-parch-handle end';
      handleEnd.style.left = `${right - 8}px`;
      attachResizeHandle(handleStart, 'start');
      attachResizeHandle(handleEnd, 'end');
      sheet.appendChild(handleStart);
      sheet.appendChild(handleEnd);
    }
  }

  function attachResizeHandle(handle, edge) {
    handle.addEventListener('pointerdown', (e) => {
      if (!selectMode || !sel) return;
      e.stopPropagation();
      resizeDrag = { edge, pointerId: e.pointerId };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!resizeDrag || resizeDrag.pointerId !== e.pointerId || !sel) return;
      const beat = beatFromPointer(e.clientX, e.clientY);
      if (beat == null) return;
      let start = sel.startBeat;
      let end = sel.endBeat;
      if (resizeDrag.edge === 'start') start = beat;
      else end = beat;
      const norm = normalizeBeatRange(start, end, { minSpan: 1, songEndBeat: totalBeats() });
      if (!norm) return;
      sel = norm;
      paintSelection(sel);
    });
    handle.addEventListener('pointerup', (e) => {
      if (!resizeDrag || resizeDrag.pointerId !== e.pointerId) return;
      resizeDrag = null;
      fireSelection(sel);
    });
  }

  function paintActive(mi) {
    measureEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('is-active', i === mi);
    });
  }

  function positionPlayhead(beat, mi) {
    if (!playheadEl) return;
    const el = measureEls[mi];
    if (!el) {
      playheadEl.hidden = true;
      return;
    }
    const sheetRect = sheet.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const m = measures()[mi];
    const pct = beatPctInMeasure(beat, m) / 100;
    const x = rect.left - sheetRect.left + viewport.scrollLeft + rect.width * pct;
    playheadEl.style.left = `${x}px`;
    playheadEl.hidden = false;
  }

  function scrollActiveIntoView(mi) {
    const el = measureEls[mi];
    if (!el) return;
    const vRect = viewport.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const pad = 24;
    if (eRect.top < vRect.top + pad) {
      viewport.scrollTop += eRect.top - vRect.top - pad;
    } else if (eRect.bottom > vRect.bottom - pad) {
      viewport.scrollTop += eRect.bottom - vRect.bottom + pad;
    }
  }

  function update({
    currentSec = 0,
    bpm = 120,
    playing = false,
    measureIndex = null,
    selection: nextSel = undefined,
    loopSelectMode: lsm = undefined,
    zoom: z = undefined,
    autoFollow: af = undefined,
  } = {}) {
    if (destroyed) return;
    if (z != null && z !== currentZoom) {
      currentZoom = z;
      rebuild();
    }
    if (lsm != null && !!lsm !== selectMode) {
      selectMode = !!lsm;
      rebuild();
    }
    if (nextSel !== undefined) {
      sel = nextSel ? { ...nextSel } : null;
      paintSelection(sel);
    }
    if (af != null) follow = !!af;

    const beat = (Number(currentSec) || 0) * (Number(bpm) || 120) / 60;
    lastBeat = beat;
    const mi = measureIndex != null ? measureIndex : measureIndexAtBeatLocal(beat);

    if (mi !== lastActive) {
      paintActive(mi);
      lastActive = mi;
    } else {
      paintActive(mi);
    }
    positionPlayhead(beat, mi);

    if (playing && follow && Date.now() > userScrollUntil) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => scrollActiveIntoView(mi));
    }
  }

  function setModel(guitar, perc) {
    guitarModel = guitar;
    percModel = perc;
    model = guitar || perc;
    isDrum = !guitar && !!perc;
    rebuild();
  }

  function setZoom(z) {
    currentZoom = z;
    rebuild();
  }

  function setSelection(next) {
    sel = next ? { ...next } : null;
    paintSelection(sel);
  }

  function setLoopSelectMode(on) {
    if (!!on === selectMode) return;
    selectMode = !!on;
    rebuild();
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(rafId);
    if (ro) ro.disconnect();
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('pointercancel', onPointerUp);
    host.innerHTML = '';
    host.classList.remove('gpp-parch-root');
  }

  rebuild();

  return {
    update,
    setModel,
    setZoom,
    setSelection,
    setLoopSelectMode,
    destroy,
  };
}
