// Songsterr-like vertical parchment score renderer for the GP player.

import {
  DRUM_TAB_LANES,
  drumTabGlyph,
  drumHitLabel,
  drumTabLegendFor,
} from '../drums/notation.js';
import { pinnedScrollTop } from './layoutMetrics.js';
import { snapBeat, normalizeBeatRange, measureSpan, measureIndexAtBeat } from './rangeUtils.js';

const USER_SCROLL_COOLDOWN_MS = 2500;
const LONG_PRESS_MS = 450;
const NOTE_PAD_START = 9;
const NOTE_PAD_END = 7;

function previewAnnoText(text, max = 56) {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function formatAnnoRange(anno) {
  if (anno.measureStart != null && anno.measureEnd != null) {
    const a = anno.measureStart + 1;
    const b = anno.measureEnd + 1;
    return a === b ? `Bar ${a}` : `Bars ${a}–${b}`;
  }
  return 'Section';
}

function beatPctInMeasure(beat, m) {
  const { start, len } = measureSpan(m);
  return Math.max(0, Math.min(100, ((beat - start) / len) * 100));
}

// Measures share the row width, so the divisor targets ~220px per measure at
// zoom 1; the ceiling keeps very wide screens from packing rows too densely.
function measuresPerSystem(hostWidth, zoom) {
  const base = hostWidth / (220 * zoom);
  return Math.max(1, Math.min(8, Math.round(base) || 2));
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
  onMeasureLongPress = null,
  onSelectionChange = null,
  onNoteSelectionChange = null,
  onAnnotationClick = null,
  loopSelectMode = false,
  noteSelectMode = false,
  autoFollow = true,
} = {}) {
  const noop = {
    update() {},
    setModel() {},
    setZoom() {},
    setSelection() {},
    setLoopSelectMode() {},
    setNoteSelectMode() {},
    scrollToMeasure() {},
    destroy() {},
  };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-parch-root');

  let model = guitarModel || percModel;
  let isDrum = !guitarModel && !!percModel;
  let currentZoom = zoom;
  let sel = selection ? { ...selection } : null;
  let noteSel = null;
  let annotations = [];
  let highlightedAnnoId = null;
  let selectMode = !!loopSelectMode;
  let noteMode = !!noteSelectMode;
  let follow = !!autoFollow;
  let userScrollUntil = 0;
  let destroyed = false;

  let measureEls = [];
  let systemEls = [];
  let playheadEl = null;
  let legendEl = null;
  let selOverlayEl = null;
  let noteOverlayEl = null;
  let annoSpanEls = [];
  let handleStart = null;
  let handleEnd = null;
  let lastActive = -1;
  let lastBeat = 0;
  let rafId = 0;
  let mps = 2;
  let drag = null;
  let noteDrag = null;
  let resizeDrag = null;
  let longPressTimer = null;
  let longPressTarget = null;
  let suppressClickUntil = 0;

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
    return DRUM_TAB_LANES.filter((lane) => lane.instruments.some((i) => insts.has(i)));
  }

  function drumGlyphsUsed(m) {
    if (!m?.events?.length) return new Set();
    const glyphs = new Set();
    for (const ev of m.events) {
      if (!ev.instrument) continue;
      glyphs.add(drumTabGlyph(ev));
    }
    return glyphs;
  }

  function openStringNotesLowToHigh() {
    return (model?.strings || [])
      .map((s) => s.note || s.label || '')
      .filter(Boolean);
  }

  function tuningCaptionText() {
    if (isDrum || !model?.strings?.length) return '';
    const notes = openStringNotesLowToHigh();
    if (!notes.length) return '';
    const noteList = notes.join(' ');
    const tuning = model.tuning;
    if (tuning) return `Tuning · ${tuning} (${noteList})`;
    return noteList;
  }

  function gutterTooltip() {
    return tuningCaptionText() || 'Drum kit lanes';
  }

  function renderGutter() {
    const gutter = document.createElement('div');
    gutter.className = 'gpp-parch-gutter';
    gutter.title = gutterTooltip();
    gutter.setAttribute('aria-hidden', 'true');

    const gutterStaff = document.createElement('div');
    gutterStaff.className = 'gpp-parch-gutter-staff';

    if (!isDrum && model?.strings?.length) {
      const strings = model.strings;
      for (let si = strings.length - 1; si >= 0; si--) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string gpp-parch-gutter-row';
        const s = strings[si];
        if (s.note != null && s.oct != null) row.title = `${s.note}${s.oct}`;
        const lab = document.createElement('span');
        lab.className = 'gpp-parch-gutter-label';
        lab.textContent = s.label || s.note || String(si + 1);
        row.appendChild(lab);
        gutterStaff.appendChild(row);
      }
    } else {
      const lanes = activeDrumLanes();
      if (lanes.length) {
        for (const lane of lanes) {
          const row = document.createElement('div');
          row.className = 'gpp-parch-drum-lane gpp-parch-gutter-row';
          row.title = lane.title;
          const lab = document.createElement('span');
          lab.className = 'gpp-parch-gutter-label';
          lab.textContent = lane.label;
          row.appendChild(lab);
          gutterStaff.appendChild(row);
        }
      } else {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string gpp-parch-gutter-row';
        row.textContent = ' ';
        gutterStaff.appendChild(row);
      }
    }

    gutter.appendChild(gutterStaff);
    return gutter;
  }

  function measureNotesRect(measureEl) {
    const notesBox = measureEl?.querySelector('.gpp-parch-lane-notes');
    if (notesBox) return notesBox.getBoundingClientRect();
    return measureEl?.getBoundingClientRect() ?? null;
  }

  function renderMeasure(mi, m) {
    const wrap = document.createElement('div');
    wrap.className = 'gpp-parch-measure';
    wrap.dataset.index = String(mi);

    const notesRail = document.createElement('div');
    notesRail.className = 'gpp-parch-notes-rail';
    wrap.appendChild(notesRail);

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
        const laneNotes = document.createElement('div');
        laneNotes.className = 'gpp-parch-lane-notes';
        const notes = (model.events || []).filter((ev) => {
          const b = Number(ev.start);
          return ev.stringIndex === si && b >= mStart - 1e-6 && b < mEnd - 1e-6;
        });
        for (const ev of notes) {
          const note = document.createElement('span');
          note.className = 'gpp-parch-note' + (ev.dead ? ' dead' : '');
          note.style.left = `${beatPctInMeasure(ev.start, m)}%`;
          note.textContent = ev.dead ? 'x' : (ev.fret != null ? String(ev.fret) : '');
          laneNotes.appendChild(note);
        }
        row.appendChild(laneNotes);
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
        const laneNotes = document.createElement('div');
        laneNotes.className = 'gpp-parch-lane-notes';
        for (const ev of evts) {
          if (!lane.instruments.includes(ev.instrument)) continue;
          const glyph = drumTabGlyph(ev);
          const hit = document.createElement('span');
          hit.className = 'gpp-parch-drum-hit';
          hit.style.left = `${beatPctInMeasure(ev.start, m)}%`;
          hit.textContent = glyph;
          hit.dataset.glyph = glyph;
          hit.title = drumHitLabel(ev);
          laneNotes.appendChild(hit);
        }
        row.appendChild(laneNotes);
        staff.appendChild(row);
      }
      if (!lanes.length) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string';
        const laneNotes = document.createElement('div');
        laneNotes.className = 'gpp-parch-lane-notes';
        row.appendChild(laneNotes);
        staff.appendChild(row);
      }
    }

    wrap.appendChild(staff);

    wrap.addEventListener('click', (e) => {
      if (Date.now() < suppressClickUntil) return;
      if (e.target.closest('.gpp-parch-anno-callout')) return;
      if (selectMode || resizeDrag || drag || noteDrag) return;
      if (typeof onMeasureClick === 'function') onMeasureClick(mi);
    });

    if (selectMode || noteMode) {
      wrap.style.touchAction = 'pan-y';
      wrap.addEventListener('pointerdown', onPointerDown);
    }

    if (typeof onMeasureLongPress === 'function') {
      wrap.addEventListener('pointerdown', onLongPressDown);
      wrap.addEventListener('pointerup', onLongPressUp);
      wrap.addEventListener('pointercancel', onLongPressUp);
      wrap.addEventListener('pointermove', onLongPressMove);
    }

    return wrap;
  }

  function rebuild() {
    if (destroyed) return;
    sheet.innerHTML = '';
    if (legendEl) {
      legendEl.remove();
      legendEl = null;
    }
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
    sheet.style.setProperty('--gpp-note-pad-start', `${Math.max(6, Math.round(NOTE_PAD_START * currentZoom))}px`);
    sheet.style.setProperty('--gpp-note-pad-end', `${Math.max(5, Math.round(NOTE_PAD_END * currentZoom))}px`);

    const captionText = tuningCaptionText();
    if (captionText) {
      const caption = document.createElement('div');
      caption.className = 'gpp-parch-tuning-caption';
      caption.textContent = captionText;
      sheet.appendChild(caption);
    }

    for (let i = 0; i < ms.length; i += mps) {
      const sys = document.createElement('div');
      sys.className = 'gpp-parch-system';
      sys.appendChild(renderGutter());
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

    if (isDrum && activeDrumLanes().length) {
      const legendRows = drumTabLegendFor(drumGlyphsUsed(model));
      if (legendRows.length) {
        legendEl = document.createElement('div');
        legendEl.className = 'gpp-parch-drum-legend';
        for (const row of legendRows) {
          const item = document.createElement('span');
          item.className = 'gpp-parch-legend-item';
          const glyphSpan = document.createElement('span');
          glyphSpan.className = 'gpp-parch-legend-glyph';
          glyphSpan.textContent = row.glyph;
          const textSpan = document.createElement('span');
          textSpan.className = 'gpp-parch-legend-text';
          textSpan.textContent = row.text;
          item.append(glyphSpan, textSpan);
          legendEl.appendChild(item);
        }
        viewport.appendChild(legendEl);
      }
    }

    paintSelection(sel);
    paintNoteDraft(noteSel);
    paintAnnotations(annotations, highlightedAnnoId);
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
    const rect = measureNotesRect(el);
    if (!rect || !rect.width) return null;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { start, len } = measureSpan(m);
    return snapBeat(start + frac * len);
  }

  function onLongPressDown(e) {
    if (e.button !== 0 || selectMode || noteMode || resizeDrag) return;
    if (e.target.closest('.gpp-parch-anno-callout')) return;
    clearLongPress();
    longPressTarget = e.currentTarget;
    const mi = Number(longPressTarget.dataset.index);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      suppressClickUntil = Date.now() + 400;
      if (typeof onMeasureLongPress === 'function') onMeasureLongPress(mi);
    }, LONG_PRESS_MS);
  }

  function onLongPressUp(e) {
    if (longPressTarget && e.currentTarget === longPressTarget) clearLongPress();
  }

  function onLongPressMove(e) {
    if (!longPressTimer || !longPressTarget) return;
    const rect = longPressTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) > 12) clearLongPress();
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTarget = null;
  }

  function fireSelection(selObj) {
    if (typeof onSelectionChange === 'function') onSelectionChange(selObj ? { ...selObj } : null);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const beat = beatFromPointer(e.clientX, e.clientY);
    if (beat == null) return;
    if (noteMode && !selectMode) {
      noteDrag = { anchorBeat: beat, pointerId: e.pointerId, moved: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (!selectMode) return;
    drag = { anchorBeat: beat, pointerId: e.pointerId, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (noteDrag && noteDrag.pointerId === e.pointerId) {
      const beat = beatFromPointer(e.clientX, e.clientY);
      if (beat == null) return;
      if (Math.abs(beat - noteDrag.anchorBeat) > 0.01) noteDrag.moved = true;
      const norm = normalizeBeatRange(noteDrag.anchorBeat, beat, { minSpan: 1, songEndBeat: totalBeats() });
      if (!norm) return;
      noteSel = norm;
      paintNoteDraft(noteSel);
      highlightNoteSelecting(norm);
      return;
    }
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
    if (noteDrag && noteDrag.pointerId === e.pointerId) {
      if (noteDrag.moved && noteSel && typeof onNoteSelectionChange === 'function') {
        onNoteSelectionChange({ ...noteSel });
      }
      noteDrag = null;
      clearNoteSelecting();
      return;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.moved && sel) fireSelection(sel);
    drag = null;
    clearSelecting();
  }

  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);

  function highlightNoteSelecting(norm) {
    const { startIdx, endIdx } = beatToMeasureRange(norm.startBeat, norm.endBeat);
    measureEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('note-selecting', i >= startIdx && i <= endIdx);
    });
  }

  function clearNoteSelecting() {
    measureEls.forEach((el) => el?.classList.remove('note-selecting'));
  }

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

  function removeNoteDraftDecor() {
    if (noteOverlayEl) { noteOverlayEl.remove(); noteOverlayEl = null; }
    clearNoteSelecting();
  }

  function removeAnnotationDecor() {
    measureEls.forEach((el) => {
      if (!el) return;
      el.classList.remove('in-anno-span', 'has-anno-start');
      const rail = el.querySelector('.gpp-parch-notes-rail');
      if (rail) rail.innerHTML = '';
    });
    annoSpanEls.forEach((el) => el.remove());
    annoSpanEls = [];
  }

  function paintNoteDraft(draft) {
    removeNoteDraftDecor();
    if (!draft) return;
    const { startIdx, endIdx } = beatToMeasureRange(draft.startBeat, draft.endBeat);
    const bounds = overlayBoundsForMeasureRange(startIdx, endIdx);
    if (!bounds) return;
    noteOverlayEl = document.createElement('div');
    noteOverlayEl.className = 'gpp-parch-note-draft';
    noteOverlayEl.style.left = `${bounds.left}px`;
    noteOverlayEl.style.width = `${bounds.width}px`;
    sheet.appendChild(noteOverlayEl);
    for (let i = startIdx; i <= endIdx; i++) {
      measureEls[i]?.classList.add('note-selecting');
    }
  }

  function paintAnnotations(annos, highlightId) {
    removeAnnotationDecor();
    if (!annos?.length) return;

    const byStart = new Map();
    for (const anno of annos) {
      const startMi = anno.measureStart != null
        ? anno.measureStart
        : beatToMeasureRange(anno.startBeat, anno.endBeat).startIdx;
      if (!byStart.has(startMi)) byStart.set(startMi, []);
      byStart.get(startMi).push(anno);
    }

    for (const [startMi, group] of byStart) {
      const el = measureEls[startMi];
      if (!el) continue;
      const rail = el.querySelector('.gpp-parch-notes-rail');
      if (!rail) continue;
      el.classList.add('has-anno-start');
      group.forEach((anno, slot) => {
        const callout = document.createElement('button');
        callout.type = 'button';
        callout.className = 'gpp-parch-anno-callout'
          + (anno.id === highlightId ? ' is-highlighted' : '')
          + (slot > 0 ? ' is-stacked' : '');
        callout.dataset.annoId = anno.id;
        callout.setAttribute('aria-label', `${anno.title || 'Note'}: ${formatAnnoRange(anno)}`);

        const title = document.createElement('span');
        title.className = 'gpp-parch-anno-title';
        title.textContent = anno.title || 'Note';

        const preview = document.createElement('span');
        preview.className = 'gpp-parch-anno-preview';
        preview.textContent = previewAnnoText(anno.text);

        const range = document.createElement('span');
        range.className = 'gpp-parch-anno-range';
        range.textContent = formatAnnoRange(anno);

        callout.append(title, preview, range);
        callout.addEventListener('click', (e) => {
          e.stopPropagation();
          suppressClickUntil = Date.now() + 300;
          callout.classList.toggle('is-expanded');
          if (typeof onAnnotationClick === 'function') onAnnotationClick(anno);
        });
        rail.appendChild(callout);
      });
    }

    for (const anno of annos) {
      const startMi = anno.measureStart != null
        ? anno.measureStart
        : beatToMeasureRange(anno.startBeat, anno.endBeat).startIdx;
      const endMi = anno.measureEnd != null
        ? anno.measureEnd
        : beatToMeasureRange(anno.startBeat, anno.endBeat).endIdx;
      if (endMi <= startMi) continue;

      const bounds = overlayBoundsForMeasureRange(startMi, endMi);
      if (!bounds) continue;

      for (let i = startMi + 1; i <= endMi; i++) {
        measureEls[i]?.classList.add('in-anno-span');
      }

      const spanEl = document.createElement('div');
      spanEl.className = 'gpp-parch-anno-span'
        + (anno.id === highlightId ? ' is-highlighted' : '');
      spanEl.dataset.annoId = anno.id;
      spanEl.style.left = `${bounds.left}px`;
      spanEl.style.width = `${bounds.width}px`;
      sheet.appendChild(spanEl);
      annoSpanEls.push(spanEl);
    }
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
    const rect = measureNotesRect(el);
    if (!rect || !rect.width) {
      playheadEl.hidden = true;
      return;
    }
    const m = measures()[mi];
    const pct = beatPctInMeasure(beat, m) / 100;
    const x = rect.left - sheetRect.left + viewport.scrollLeft + rect.width * pct;
    playheadEl.style.left = `${x}px`;
    playheadEl.hidden = false;
  }

  function systemForMeasure(mi) {
    const idx = Math.floor(mi / mps);
    return systemEls[idx] ?? null;
  }

  function pinSystemToViewportTop(mi, topPad) {
    const el = measureEls[mi];
    if (!el) return;
    const sys = systemForMeasure(mi);
    const target = sys || el;
    const vRect = viewport.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const next = pinnedScrollTop({
      scrollTop: viewport.scrollTop,
      viewportTop: vRect.top,
      targetTop: tRect.top,
      pad: topPad,
      maxScrollTop: maxScroll,
    });
    if (next != null) viewport.scrollTop = next;
  }

  function scrollActiveIntoView(mi) {
    pinSystemToViewportTop(mi, 16);
  }

  function scrollToMeasure(mi) {
    const el = measureEls[mi];
    if (!el) return;
    pinSystemToViewportTop(mi, 20);
    const vRect = viewport.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const hPad = 12;
    if (eRect.left < vRect.left + hPad) {
      viewport.scrollLeft += eRect.left - vRect.left - hPad;
    } else if (eRect.right > vRect.right - hPad) {
      viewport.scrollLeft += eRect.right - vRect.right + hPad;
    }
  }

  function update({
    currentSec = 0,
    bpm = 120,
    playing = false,
    measureIndex = null,
    selection: nextSel = undefined,
    noteDraft: nextNoteDraft = undefined,
    loopSelectMode: lsm = undefined,
    noteSelectMode: nsm = undefined,
    zoom: z = undefined,
    autoFollow: af = undefined,
    annotations: nextAnnos = undefined,
    highlightedAnnotationId: highlightId = undefined,
  } = {}) {
    if (destroyed) return;
    if (z != null && z !== currentZoom) {
      currentZoom = z;
      rebuild();
    }
    const modeChanged = (lsm != null && !!lsm !== selectMode)
      || (nsm != null && !!nsm !== noteMode);
    if (lsm != null) selectMode = !!lsm;
    if (nsm != null) noteMode = !!nsm;
    if (modeChanged) rebuild();
    if (nextSel !== undefined) {
      sel = nextSel ? { ...nextSel } : null;
      paintSelection(sel);
    }
    if (nextNoteDraft !== undefined) {
      noteSel = nextNoteDraft ? { ...nextNoteDraft } : null;
      paintNoteDraft(noteSel);
    }
    if (nextAnnos !== undefined || highlightId !== undefined) {
      if (nextAnnos !== undefined) annotations = nextAnnos.slice();
      if (highlightId !== undefined) highlightedAnnoId = highlightId;
      paintAnnotations(annotations, highlightedAnnoId);
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

  function setNoteSelectMode(on) {
    if (!!on === noteMode) return;
    noteMode = !!on;
    if (!noteMode) {
      noteSel = null;
      removeNoteDraftDecor();
    }
    rebuild();
  }

  function destroy() {
    destroyed = true;
    clearLongPress();
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
    setNoteSelectMode,
    scrollToMeasure,
    destroy,
  };
}
