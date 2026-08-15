// Songsterr-like vertical parchment score renderer for the GP player.

import {
  DRUM_TAB_LANES,
  drumTabGlyph,
  drumHitLabel,
  drumTabLegendFor,
} from '../drums/notation.js';
import { createFollowScrollGuard } from './followScroll.js';
import { pinnedScrollTop } from './layoutMetrics.js';
import {
  beatFromXUnits,
  beatXUnits,
  fitScaleForBar,
  layoutScore,
  LAYOUT_BASE_PX,
  ONE_BAR_MAX_WIDTH_PX,
  scaleThatFits,
} from './scoreLayout.js';
import { snapBeat, normalizeBeatRange, measureSpan, measureIndexAtBeat } from './rangeUtils.js';

const LONG_PRESS_MS = 450;
const NOTE_PAD_START = 9;
const NOTE_PAD_END = 7;
const BEAT_EPS = 1e-4;
const CHAR_WIDTH = 7;
const COLUMN_GAP = 4;
const NOMINAL_MEASURE_WIDTH = 220;
const MEASURE_WIDTH_FLOOR = 48;
const MAX_MEASURES_PER_SYSTEM = 8;
const VIEWPORT_PAD_H = 12;
const GUTTER_BASIS = 20;

const AUTO_SCALE_WIDTH_900 = 900;
const AUTO_SCALE_WIDTH_1200 = 1200;
const AUTO_SCALE_WIDTH_1600 = 1600;
const AUTO_SCALE_AT_900 = 1.2;
const AUTO_SCALE_AT_1200 = 1.35;
const AUTO_SCALE_AT_1600 = 1.5;
// The floor keeps the fret text at the base size.
const MIN_FIT_SCALE = 1;
// A measure border sits outside the width the flex row assigns.
const ROW_EDGE_INSET_PX = 4;

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

// Sheet-positioned overlays; viewport scroll is already in client rect deltas.
function xOffsetInSheet(clientLeft, sheetRect) {
  return clientLeft - sheetRect.left;
}

function yOffsetInSheet(clientTop, sheetRect) {
  return clientTop - sheetRect.top;
}

function autoScaleForHostWidth(hostWidth) {
  if (hostWidth >= AUTO_SCALE_WIDTH_1600) return AUTO_SCALE_AT_1600;
  if (hostWidth >= AUTO_SCALE_WIDTH_1200) return AUTO_SCALE_AT_1200;
  if (hostWidth >= AUTO_SCALE_WIDTH_900) return AUTO_SCALE_AT_900;
  return 1;
}

function effectiveScale(hostWidth, userZoom) {
  return autoScaleForHostWidth(hostWidth) * userZoom;
}

function glyphLabel(ev, isDrum) {
  if (isDrum) return drumTabGlyph(ev);
  if (ev.dead) return 'x';
  if (ev.fret != null) return String(ev.fret);
  return '';
}

function measureRhythmicInfo(m, model, isDrum) {
  const { start: mStart, end: mEnd } = measureSpan(m);
  const events = (model?.events || []).filter((ev) => {
    const b = Number(ev.start);
    return b >= mStart - BEAT_EPS && b < mEnd - BEAT_EPS;
  });
  const beatCols = [];
  let maxChars = 1;
  for (const ev of events) {
    const b = Number(ev.start);
    if (!beatCols.some((x) => Math.abs(x - b) < BEAT_EPS)) beatCols.push(b);
    const label = glyphLabel(ev, isDrum);
    if (label.length) maxChars = Math.max(maxChars, label.length);
  }
  return { columns: Math.max(1, beatCols.length), maxChars };
}

function measureWidthRequirements(info) {
  const content = info.columns * (info.maxChars * CHAR_WIDTH + COLUMN_GAP);
  const baseMin = Math.max(MEASURE_WIDTH_FLOOR, content + NOTE_PAD_START + NOTE_PAD_END);
  const baseNominal = Math.max(NOMINAL_MEASURE_WIDTH, baseMin);
  return { baseMin, baseNominal };
}

function packMeasuresIntoSystems(specs, availableWidth, scale) {
  const systems = [];
  const nominalTolerance = (NOMINAL_MEASURE_WIDTH / 2) * scale;
  let i = 0;
  while (i < specs.length) {
    const row = [];
    let sumMin = 0;
    let sumNominal = 0;
    while (i < specs.length && row.length < MAX_MEASURES_PER_SYSTEM) {
      const spec = specs[i];
      const nextMin = sumMin + spec.minWidth;
      const nextNominal = sumNominal + spec.nominalWidth;
      if (row.length > 0) {
        if (nextMin > availableWidth) break;
        if (nextNominal > availableWidth + nominalTolerance) break;
      }
      row.push(spec);
      sumMin = nextMin;
      sumNominal = nextNominal;
      i++;
    }
    if (!row.length) {
      row.push(specs[i]);
      i++;
    }
    systems.push(row);
  }
  return systems;
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
  onZoomLimit = null,
} = {}) {
  const noop = {
    update() {},
    setModel() {},
    setZoom() {},
    setSelection() {},
    setLoopSelectMode() {},
    setNoteSelectMode() {},
    scrollToMeasure() {},
    setShowStandardNotation() {},
    setActivePosition() {},
    resumeAutoFollow() {},
    getZoomLimit() { return 1; },
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
  let showNotation = false;
  let showRhythm = true;
  let activePosition = null;
  let lastActiveBeatKey = '';
  let scoreLayout = null;
  let unitPx = 1;
  const followGuard = createFollowScrollGuard({ cooldownMs: 2500 });
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
  let measureSystemIndex = [];
  let measureGeom = [];
  let drag = null;
  let noteDrag = null;
  let resizeDrag = null;
  let longPressTimer = null;
  let longPressTarget = null;
  let suppressClickUntil = 0;
  let zoomLimit = Infinity;
  let reportedZoomLimit = null;
  let lastBuildLayoutWidthPx = 0;
  let lastBuildHostW = 0;
  let rebuilding = false;
  let resizeQuietRaf = 0;

  const viewport = document.createElement('div');
  viewport.className = 'gpp-parch-viewport';
  const sheet = document.createElement('div');
  sheet.className = 'gpp-parch-sheet';
  viewport.appendChild(sheet);
  host.appendChild(viewport);

  function measureLayoutWidthPx() {
    const raw = viewport?.clientWidth;
    if (typeof getComputedStyle === 'function' && viewport && raw > 0) {
      const style = getComputedStyle(viewport);
      const padL = parseFloat(style.paddingLeft) || 0;
      const padR = parseFloat(style.paddingRight) || 0;
      const w = raw - padL - padR;
      if (Number.isFinite(w) && w > 20) return w;
    }
    return host.clientWidth || 600;
  }

  function reportZoomLimitIfChanged(limit) {
    const rounded = limit === Infinity ? Infinity : Math.round(limit * 100) / 100;
    zoomLimit = rounded;
    if (typeof onZoomLimit === 'function' && rounded !== reportedZoomLimit) {
      reportedZoomLimit = rounded;
      onZoomLimit(rounded);
    }
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (rebuilding || resizeQuietRaf) return;
      // The sheet can reflow without a width change, for example when a web
      // font arrives late. The cached measure boxes are then wrong, so drop
      // them even when the view keeps the layout it has.
      measureGeom = [];
      const hostWNow = host.clientWidth || 0;
      const layoutWNow = measureLayoutWidthPx();
      if (
        Math.abs(hostWNow - lastBuildHostW) <= 1
        && Math.abs(layoutWNow - lastBuildLayoutWidthPx) <= 1
      ) {
        return;
      }
      rebuild();
    })
    : null;
  if (ro) {
    ro.observe(host);
    ro.observe(viewport);
  }

  function onViewportScroll() {
    followGuard.noteScroll();
  }

  function onUserScrollGesture() {
    followGuard.noteUserGesture();
  }

  function onViewportKeydown(e) {
    const key = e.key;
    if (
      key === 'ArrowUp' || key === 'ArrowDown'
      || key === 'PageUp' || key === 'PageDown'
      || key === 'Home' || key === 'End'
      || key === ' ' || key === 'Space'
    ) {
      followGuard.noteUserGesture();
    }
  }

  viewport.addEventListener('scroll', onViewportScroll, { passive: true });
  viewport.addEventListener('wheel', onUserScrollGesture, { passive: true });
  viewport.addEventListener('touchstart', onUserScrollGesture, { passive: true });
  viewport.addEventListener('touchmove', onUserScrollGesture, { passive: true });
  viewport.addEventListener('keydown', onViewportKeydown);

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

  function tabStaffRowCount() {
    if (isDrum) return Math.max(1, activeDrumLanes().length);
    return Math.max(1, model?.strings?.length || 1);
  }

  function renderGutter() {
    const gutter = document.createElement('div');
    gutter.className = 'gpp-parch-gutter';
    gutter.title = gutterTooltip();
    gutter.setAttribute('aria-hidden', 'true');

    const gutterStaff = document.createElement('div');
    gutterStaff.className = 'gpp-parch-gutter-staff';

    const tabStaffLane = scoreLayout?.laneStack?.find((l) => l.name === 'tabStaff');
    const totalH = (scoreLayout?.totalHeightUnits ?? 0) * unitPx;
    const rowCount = tabStaffRowCount();
    const rowH = tabStaffLane && rowCount > 0
      ? (tabStaffLane.h / rowCount) * unitPx
      : 0;

    if (totalH > 0) gutterStaff.style.height = `${totalH}px`;

    if (tabStaffLane) {
      const topSpacer = document.createElement('div');
      topSpacer.className = 'gpp-parch-gutter-spacer';
      topSpacer.setAttribute('aria-hidden', 'true');
      topSpacer.style.height = `${tabStaffLane.y * unitPx}px`;
      gutterStaff.appendChild(topSpacer);
    }

    if (!isDrum && model?.strings?.length) {
      const strings = model.strings;
      for (let si = strings.length - 1; si >= 0; si--) {
        const row = document.createElement('div');
        row.className = 'gpp-parch-string gpp-parch-gutter-row';
        if (rowH > 0) {
          row.style.setProperty('--gpp-row-h', `${rowH}px`);
          row.style.height = `${rowH}px`;
        }
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
          if (rowH > 0) {
            row.style.setProperty('--gpp-row-h', `${rowH}px`);
            row.style.height = `${rowH}px`;
          }
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

    if (tabStaffLane && scoreLayout?.totalHeightUnits != null) {
      const bottomH = (scoreLayout.totalHeightUnits - tabStaffLane.y - tabStaffLane.h) * unitPx;
      const bottomSpacer = document.createElement('div');
      bottomSpacer.className = 'gpp-parch-gutter-spacer';
      bottomSpacer.setAttribute('aria-hidden', 'true');
      bottomSpacer.style.height = `${Math.max(0, bottomH)}px`;
      gutterStaff.appendChild(bottomSpacer);
    }

    gutter.appendChild(gutterStaff);
    return gutter;
  }

  function measureNotesRect(measureEl) {
    const tabLane = measureEl?.querySelector('.gpp-parch-lane-tabStaff');
    const notesBox = tabLane?.querySelector('.gpp-parch-lane-notes')
      || measureEl?.querySelector('.gpp-parch-lane-notes');
    if (notesBox) return notesBox.getBoundingClientRect();
    return measureEl?.getBoundingClientRect() ?? null;
  }

  function glyphClassName(kind, lane) {
    const laneClass = lane ? ` gpp-glyph-lane--${lane}` : '';
    return `gpp-glyph gpp-glyph--${kind}${laneClass}`;
  }

  /**
   * Draw one glyph inside its lane element.
   *
   * The layout gives every glyph a y that counts from the top of the bar. The
   * lane element already sits at the top of its own lane, so the glyph must
   * drop the lane offset. Without that step each lane pushes its glyphs down
   * by its own height, and the rhythm ticks land under the staff.
   */
  function appendGlyph(parent, glyph, scaleUnit, evForDrum = null, laneY = 0) {
    const top = (glyph.y - laneY) * scaleUnit;
    if (glyph.kind === 'beam' && glyph.lane === 'notationStaff' && glyph.h <= 1) {
      const line = document.createElement('div');
      line.className = 'gpp-parch-notation-line';
      line.style.left = `${glyph.x * scaleUnit}px`;
      line.style.top = `${top}px`;
      line.style.width = `calc(100% - ${glyph.x * scaleUnit}px)`;
      parent.appendChild(line);
      return line;
    }
    const el = document.createElement('span');
    const legacy = glyph.kind === 'fret' || glyph.kind === 'deadNote'
      ? ` gpp-parch-note${glyph.kind === 'deadNote' ? ' dead' : ''}`
      : (glyph.kind === 'drumHit' ? ' gpp-parch-drum-hit' : '');
    el.className = `${glyphClassName(glyph.kind, glyph.lane)}${legacy}`;
    el.style.left = `${glyph.x * scaleUnit}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.max(1, glyph.w * scaleUnit)}px`;
    el.style.height = `${Math.max(1, glyph.h * scaleUnit)}px`;
    if (glyph.text) el.textContent = glyph.text;
    if (glyph.aria) el.setAttribute('aria-label', glyph.aria);
    if (glyph.beatStart != null) el.dataset.beatStart = String(glyph.beatStart);
    if (glyph.kind === 'fret' || glyph.kind === 'deadNote' || glyph.kind === 'drumHit') {
      el.dataset.note = '1';
    }
    if (glyph.kind === 'drumHit' && evForDrum) {
      el.dataset.glyph = glyph.text || drumTabGlyph(evForDrum);
      el.title = drumHitLabel(evForDrum);
    }
    parent.appendChild(el);
    return el;
  }

  function renderStringRows(staffEl, stringCount, laneH) {
    for (let si = stringCount - 1; si >= 0; si -= 1) {
      const row = document.createElement('div');
      row.className = isDrum ? 'gpp-parch-drum-lane' : 'gpp-parch-string';
      row.style.height = `${laneH / stringCount}px`;
      row.dataset.string = String(si);
      staffEl.appendChild(row);
    }
  }

  function createSvgElement(tag) {
    if (typeof document.createElementNS === 'function') {
      return document.createElementNS('http://www.w3.org/2000/svg', tag);
    }
    const el = document.createElement(tag);
    el.setAttribute('data-svg', tag);
    return el;
  }

  function renderMeasure(mi, barLayout) {
    const wrap = document.createElement('div');
    wrap.className = 'gpp-parch-measure';
    wrap.dataset.index = String(mi);
    const barW = barLayout.widthUnits * unitPx;
    wrap.style.minWidth = `${barW}px`;
    wrap.style.width = `${barW}px`;
    wrap.style.flex = '0 0 auto';

    const notesRail = document.createElement('div');
    notesRail.className = 'gpp-parch-notes-rail';
    wrap.appendChild(notesRail);

    const barNumGlyph = barLayout.glyphs.find((g) => g.kind === 'barNumber');
    const barNum = document.createElement('div');
    barNum.className = 'gpp-parch-bar-num';
    barNum.textContent = barNumGlyph?.text || String(mi + 1);
    wrap.appendChild(barNum);

    const markerGlyph = barLayout.glyphs.find((g) => g.kind === 'marker');
    if (markerGlyph?.text) {
      const mk = document.createElement('div');
      mk.className = 'gpp-parch-marker';
      mk.textContent = markerGlyph.text;
      wrap.appendChild(mk);
    }

    const staff = document.createElement('div');
    staff.className = 'gpp-parch-staff';
    staff.style.minHeight = `${(barLayout.totalHeightUnits ?? barLayout.lanes.reduce((h, l) => h + l.h, 0)) * unitPx}px`;

    const laneEls = new Map();
    const m = measures()[mi];
    const { start: mStart, end: mEnd } = measureSpan(m);
    const eventsAtBar = (model?.events || []).filter((ev) => {
      const b = Number(ev.start);
      return b >= mStart - BEAT_EPS && b < mEnd - BEAT_EPS;
    });

    const laneTops = new Map();
    for (const lane of barLayout.lanes) {
      laneTops.set(lane.name, lane.y);
      const laneEl = document.createElement('div');
      laneEl.className = `gpp-parch-lane gpp-parch-lane-${lane.name}`;
      laneEl.dataset.lane = lane.name;
      laneEl.style.height = `${lane.h * unitPx}px`;
      const content = document.createElement('div');
      content.className = 'gpp-parch-lane-content';
      if (lane.name === 'tabStaff') {
        const laneNotes = document.createElement('div');
        laneNotes.className = 'gpp-parch-lane-notes';
        content.appendChild(laneNotes);
        const stringCount = tabStaffRowCount();
        renderStringRows(laneNotes, stringCount, lane.h * unitPx);
        laneEls.set(lane.name, { content: laneNotes, laneNotes });
      } else {
        laneEls.set(lane.name, { content, laneNotes: content });
      }
      laneEl.appendChild(content);
      staff.appendChild(laneEl);
    }

    for (const glyph of barLayout.glyphs) {
      if (glyph.kind === 'barNumber' || glyph.kind === 'marker') continue;
      // The tuning already shows in the caption above the first system.
      if (glyph.kind === 'tuning') continue;
      const laneRef = laneEls.get(glyph.lane);
      if (!laneRef) continue;
      const parent = (glyph.kind === 'fret' || glyph.kind === 'deadNote' || glyph.kind === 'drumHit')
        ? laneRef.laneNotes
        : laneRef.content;
      const evForDrum = glyph.kind === 'drumHit'
        ? eventsAtBar.find((ev) => Math.abs(Number(ev.start) - Number(glyph.beatStart)) < BEAT_EPS)
        : null;
      appendGlyph(parent, glyph, unitPx, evForDrum, laneTops.get(glyph.lane) || 0);
    }

    const svg = createSvgElement('svg');
    svg.classList.add('gpp-parch-overlays');
    svg.setAttribute('aria-hidden', 'true');
    const overlayW = barLayout.widthUnits;
    const overlayH = barLayout.totalHeightUnits ?? barLayout.lanes.reduce((h, l) => h + l.h, 0);
    svg.setAttribute('width', String(overlayW));
    svg.setAttribute('height', String(overlayH));
    svg.style.width = `${overlayW}px`;
    svg.style.height = `${overlayH}px`;
    svg.style.transform = `scale(${unitPx})`;
    svg.style.transformOrigin = '0 0';
    for (const overlay of barLayout.overlays) {
      const path = createSvgElement('path');
      path.setAttribute('d', overlay.path || '');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.classList.add('gpp-parch-overlay', `gpp-parch-overlay--${overlay.kind}`);
      svg.appendChild(path);
    }
    staff.appendChild(svg);
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

    if (typeof onSelectionChange === 'function') {
      wrap.addEventListener('pointerdown', onLongPressDown);
      wrap.addEventListener('pointerup', onLongPressUp);
      wrap.addEventListener('pointercancel', onLongPressUp);
      wrap.addEventListener('pointermove', onLongPressMove);
    }

    return wrap;
  }

  function scheduleResizeQuiet() {
    if (resizeQuietRaf) cancelAnimationFrame(resizeQuietRaf);
    resizeQuietRaf = requestAnimationFrame(() => {
      resizeQuietRaf = 0;
    });
  }

  function rebuild() {
    if (destroyed || rebuilding) return;
    rebuilding = true;

    const hadContent = sheet.children.length > 0;
    let layoutPlan = null;

    try {
      const ms = measures();
      const hostW = host.clientWidth || 600;
      const layoutWidthRawPx = measureLayoutWidthPx();
      const layoutWidthPx = layoutWidthRawPx - ROW_EDGE_INSET_PX;

      if (!ms.length) {
        reportZoomLimitIfChanged(Infinity);
        sheet.innerHTML = '';
        if (legendEl) {
          legendEl.remove();
          legendEl = null;
        }
        measureEls = [];
        systemEls = [];
        measureSystemIndex = [];
        measureGeom = [];
        playheadEl = null;
        selOverlayEl = null;
        handleStart = null;
        handleEnd = null;
        lastActiveBeatKey = '';
        scoreLayout = null;
        lastBuildHostW = hostW;
        lastBuildLayoutWidthPx = layoutWidthRawPx;
        scheduleResizeQuiet();
        return;
      }

      const desired = effectiveScale(hostW, currentZoom);

      // The one measure per row rule follows the real screen, not the measured
      // host and not the zoom. A container can report a width that does not
      // match the device, and the learner still holds a phone.
      const viewportW = (typeof window !== 'undefined' && window.innerWidth)
        ? window.innerWidth
        : hostW;
      const onePerRow = Math.min(viewportW, hostW) <= ONE_BAR_MAX_WIDTH_PX;

      // The layout works in units. One unit becomes `scale` pixels on screen.
      // Pass the width in units, so the layout can fill the row exactly, and
      // draw the text at the same scale as the glyph boxes. When the two used
      // different scales, the fret numbers grew past their boxes and ran into
      // each other and into the rhythm ticks.
      function buildLayoutAtScale(scale) {
        return layoutScore(model, {
          widthPx: layoutWidthPx / scale,
          zoom: 1,
          showNotationStaff: showNotation,
          showRhythm,
          drumMode: isDrum,
          drumLanes: isDrum ? activeDrumLanes().map((lane) => lane.key) : [],
          minFretFontPx: LAYOUT_BASE_PX,
          maxMeasuresPerSystem: onePerRow ? 1 : undefined,
        });
      }

      let scale = desired;
      let nextScoreLayout = buildLayoutAtScale(scale);

      let widestMinUnits = 0;
      for (const bar of nextScoreLayout.bars) {
        const minUnits = bar.minWidthUnits ?? bar.widthUnits;
        if (minUnits > widestMinUnits) widestMinUnits = minUnits;
      }

      const fittedScale = scaleThatFits({
        availablePx: layoutWidthPx,
        barUnits: widestMinUnits,
        desiredScale: desired,
        minScale: MIN_FIT_SCALE,
      });
      if (fittedScale !== scale) {
        scale = fittedScale;
        nextScoreLayout = buildLayoutAtScale(scale);
      }

      const fit = widestMinUnits > 0
        ? fitScaleForBar({ availablePx: layoutWidthPx, barUnits: widestMinUnits })
        : null;
      const limit = fit == null
        ? Infinity
        : Math.max(MIN_FIT_SCALE, fit) / autoScaleForHostWidth(hostW);

      layoutPlan = {
        hostW,
        layoutWidthRawPx,
        scale,
        nextScoreLayout,
        limit,
      };
    } catch (err) {
      if (!hadContent) {
        sheet.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'gpp-parch-error';
        errEl.textContent = 'Could not draw this score.';
        sheet.appendChild(errEl);
      }
      console.error(err);
      return;
    } finally {
      rebuilding = false;
    }

    rebuilding = true;
    try {
      if (legendEl) {
        legendEl.remove();
        legendEl = null;
      }
      measureEls = [];
      systemEls = [];
      measureSystemIndex = [];
      measureGeom = [];
      playheadEl = null;
      selOverlayEl = null;
      handleStart = null;
      handleEnd = null;
      lastActiveBeatKey = '';

      const {
        hostW,
        layoutWidthRawPx,
        scale,
        nextScoreLayout,
        limit,
      } = layoutPlan;

      lastBuildHostW = hostW;
      lastBuildLayoutWidthPx = layoutWidthRawPx;
      scoreLayout = nextScoreLayout;
      reportZoomLimitIfChanged(limit);

      sheet.innerHTML = '';
      sheet.style.setProperty('--gpp-scale', String(scale));
      const layoutFontPx = Math.max(12, Math.round(LAYOUT_BASE_PX * scale));
      sheet.style.setProperty('--gpp-note-pad-start', `${Math.max(6, Math.round(NOTE_PAD_START * scale))}px`);
      sheet.style.setProperty('--gpp-note-pad-end', `${Math.max(5, Math.round(NOTE_PAD_END * scale))}px`);

      unitPx = scale;
      sheet.style.fontSize = `${Math.max(12, Math.round(scoreLayout.fontPx * scale))}px`;
      void layoutFontPx;

      const captionText = tuningCaptionText();
      if (captionText) {
        const caption = document.createElement('div');
        caption.className = 'gpp-parch-tuning-caption';
        caption.textContent = captionText;
        sheet.appendChild(caption);
      }

      scoreLayout.systems.forEach((sys) => {
        const system = document.createElement('div');
        system.className = 'gpp-parch-system';
        system.appendChild(renderGutter());
        sys.barIndices.forEach((bi) => {
          const el = renderMeasure(bi, scoreLayout.bars[bi]);
          system.appendChild(el);
          measureEls[bi] = el;
          measureSystemIndex[bi] = systemEls.length;
        });
        sheet.appendChild(system);
        systemEls.push(system);
      });

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
      paintActive(lastActive);
      paintActiveBeat(activePosition);
      scheduleResizeQuiet();
    } catch (err) {
      if (!hadContent) {
        sheet.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'gpp-parch-error';
        errEl.textContent = 'Could not draw this score.';
        sheet.appendChild(errEl);
      }
      console.error(err);
    } finally {
      rebuilding = false;
    }
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
    const notesRect = measureNotesRect(el);
    if (!notesRect) return null;
    const bar = scoreLayout?.bars?.[mi];
    if (bar && unitPx > 0) {
      const xUnits = (clientX - notesRect.left) / unitPx;
      return snapBeat(beatFromXUnits(bar, xUnits));
    }
    if (!notesRect.width) return null;
    const frac = Math.max(0, Math.min(1, (clientX - notesRect.left) / notesRect.width));
    const { start, len } = measureSpan(m);
    return snapBeat(start + frac * len);
  }

  function onLongPressDown(e) {
    if (e.button !== 0 || selectMode || noteMode || resizeDrag || drag) return;
    if (e.target.closest('.gpp-parch-anno-callout')) return;
    clearLongPress();
    longPressTarget = e.currentTarget;
    const startEvent = e;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      suppressClickUntil = Date.now() + 400;
      const beat = beatFromPointer(startEvent.clientX, startEvent.clientY);
      if (beat == null) return;
      drag = { anchorBeat: beat, pointerId: startEvent.pointerId, moved: false };
      startEvent.currentTarget.setPointerCapture?.(startEvent.pointerId);
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
    // A callout sits above the staff and pushes it down, so the cached staff
    // boxes no longer hold.
    measureGeom = [];
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
    const left = xOffsetInSheet(a.left, sheetRect);
    const right = xOffsetInSheet(b.right, sheetRect);
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

  /** True when two beat spans name the same range. */
  function sameSpan(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.startBeat === b.startBeat && a.endBeat === b.endBeat;
  }

  /** True when two annotation lists hold the same items in the same order. */
  function sameAnnotations(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      if (a[i]?.id !== b[i]?.id) return false;
      if (a[i]?.startBeat !== b[i]?.startBeat) return false;
      if (a[i]?.endBeat !== b[i]?.endBeat) return false;
      if (a[i]?.title !== b[i]?.title) return false;
      if (a[i]?.text !== b[i]?.text) return false;
    }
    return true;
  }

  function paintActive(mi) {
    measureEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('is-active', i === mi);
    });
  }

  function paintActiveBeat(pos) {
    const key = pos
      ? `${pos.barIndex}:${pos.beatInBar ?? 0}:${pos.passIndex ?? 0}`
      : '';
    if (key === lastActiveBeatKey) return;
    lastActiveBeatKey = key;
    measureEls.forEach((el) => {
      el?.querySelectorAll('.gpp-glyph.is-sounding').forEach((n) => n.classList.remove('is-sounding'));
    });
    if (!pos || pos.barIndex == null) return;
    const el = measureEls[pos.barIndex];
    if (!el) return;
    const m = measures()[pos.barIndex];
    if (!m) return;
    const { start } = measureSpan(m);
    const beatStart = start + (Number(pos.beatInBar) || 0);
    const hits = el.querySelectorAll(`[data-beat-start="${beatStart}"]`);
    hits.forEach((n) => n.classList.add('is-sounding'));
    if (!hits.length) {
      const notes = el.querySelectorAll('[data-note="1"]');
      if (notes.length) notes[0].classList.add('is-sounding');
    }
  }

  /**
   * The sheet-relative box of one measure staff, and the x origin of its notes.
   *
   * The playhead runs on every animation frame. A rect read that follows a
   * style write forces the browser to lay the page out again inside the frame,
   * and that work delays the audio scheduler on the same thread. These values
   * only change when the sheet reflows, so the view measures each measure once
   * and keeps the result. Every value counts from the sheet, not from the
   * viewport, so a scroll does not make it stale.
   */
  function measureGeomFor(mi) {
    const cached = measureGeom[mi];
    if (cached) return cached;
    const el = measureEls[mi];
    if (!el) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const notesRect = measureNotesRect(el);
    if (!notesRect) return null;
    const staffEl = el.querySelector('.gpp-parch-staff');
    const staffRect = staffEl ? staffEl.getBoundingClientRect() : null;
    const geom = {
      notesLeft: xOffsetInSheet(notesRect.left, sheetRect),
      notesWidth: notesRect.width || 0,
      staffTop: staffRect ? yOffsetInSheet(staffRect.top, sheetRect) : null,
      staffHeight: staffRect ? staffRect.height || 0 : null,
    };
    measureGeom[mi] = geom;
    return geom;
  }

  /**
   * The sheet x of the playhead for one beat inside one measure.
   *
   * A bar holds padding at its left end for the time signature and the repeat
   * marks, and no beat column stands in it. A plain map from beat to x would
   * therefore jump across that padding at every bar line. The line instead
   * runs from the last column of this bar to the first column of the next bar,
   * across the bar line. The line still stands on every column at the exact
   * beat of that column.
   */
  function playheadSheetX(bar, geom, beat, mi) {
    const xAt = (b) => geom.notesLeft + beatXUnits(bar, b) * unitPx;
    const tailStart = Number.isFinite(bar.lastColumnBeat) ? bar.lastColumnBeat : null;
    const barEnd = bar.beatStart + bar.beatSpan;
    if (tailStart == null || beat <= tailStart || barEnd <= tailStart) return xAt(beat);

    const next = scoreLayout?.bars?.[mi + 1];
    const sameRow = measureSystemIndex[mi + 1] != null
      && measureSystemIndex[mi + 1] === measureSystemIndex[mi];
    const nextGeom = next && sameRow ? measureGeomFor(mi + 1) : null;
    const from = xAt(tailStart);
    const to = nextGeom
      ? nextGeom.notesLeft + next.noteOriginUnits * unitPx
      : geom.notesLeft + (bar.noteOriginUnits + bar.contentWidthUnits) * unitPx;
    const t = Math.max(0, Math.min(1, (beat - tailStart) / (barEnd - tailStart)));
    return from + (to - from) * t;
  }

  function positionPlayhead(beat, mi) {
    if (!playheadEl) return;
    const geom = measureGeomFor(mi);
    if (!geom) {
      playheadEl.hidden = true;
      return;
    }
    const bar = scoreLayout?.bars?.[mi];
    let x;
    if (bar && unitPx > 0) {
      x = playheadSheetX(bar, geom, beat, mi);
    } else if (geom.notesWidth) {
      const pct = beatPctInMeasure(beat, measures()[mi]) / 100;
      x = geom.notesLeft + geom.notesWidth * pct;
    } else {
      playheadEl.hidden = true;
      return;
    }
    playheadEl.style.left = `${x}px`;
    // The line must only cover the measure it is in, not the whole sheet.
    if (geom.staffTop != null) {
      playheadEl.style.top = `${geom.staffTop}px`;
      playheadEl.style.height = `${geom.staffHeight}px`;
    }
    playheadEl.hidden = false;
  }

  function systemForMeasure(mi) {
    const idx = measureSystemIndex[mi];
    return idx != null ? systemEls[idx] ?? null : null;
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
    if (next != null) {
      followGuard.noteOwnScroll();
      viewport.scrollTop = next;
    }
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
      followGuard.noteOwnScroll();
      viewport.scrollLeft += eRect.left - vRect.left - hPad;
    } else if (eRect.right > vRect.right - hPad) {
      followGuard.noteOwnScroll();
      viewport.scrollLeft += eRect.right - vRect.right + hPad;
    }
  }

  function update({
    currentSec = 0,
    bpm = 120,
    beatInScore = undefined,
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
    // The playhead calls update() on every animation frame. Each paint below
    // removes and rebuilds DOM nodes, and the playhead then reads a layout
    // value. That write and read pair forces a layout on every frame, which
    // starves the audio scheduler on the same thread. Paint only what changed.
    if (nextSel !== undefined && !sameSpan(sel, nextSel)) {
      sel = nextSel ? { ...nextSel } : null;
      paintSelection(sel);
    }
    if (nextNoteDraft !== undefined && !sameSpan(noteSel, nextNoteDraft)) {
      noteSel = nextNoteDraft ? { ...nextNoteDraft } : null;
      paintNoteDraft(noteSel);
    }
    if (nextAnnos !== undefined || highlightId !== undefined) {
      const annosChanged = nextAnnos !== undefined && !sameAnnotations(annotations, nextAnnos);
      const highlightChanged = highlightId !== undefined && highlightId !== highlightedAnnoId;
      if (annosChanged) annotations = nextAnnos.slice();
      if (highlightChanged) highlightedAnnoId = highlightId;
      if (annosChanged || highlightChanged) {
        paintAnnotations(annotations, highlightedAnnoId);
      }
    }
    if (af != null) follow = !!af;

    const beat = Number.isFinite(beatInScore)
      ? beatInScore
      : (Number(currentSec) || 0) * (Number(bpm) || 120) / 60;
    lastBeat = beat;
    const mi = measureIndex != null ? measureIndex : measureIndexAtBeatLocal(beat);

    if (mi !== lastActive) {
      paintActive(mi);
      lastActive = mi;
    }
    positionPlayhead(beat, mi);

    if (playing && follow && !followGuard.isPaused()) {
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

  function setShowStandardNotation(on) {
    const next = !!on;
    if (next === showNotation) return;
    showNotation = next;
    rebuild();
  }

  function setActivePosition(pos) {
    activePosition = pos ? { ...pos } : null;
    paintActiveBeat(activePosition);
    if (activePosition?.barIndex != null && activePosition.barIndex !== lastActive) {
      paintActive(activePosition.barIndex);
      lastActive = activePosition.barIndex;
    }
  }

  function resumeAutoFollow() {
    followGuard.resume();
    follow = true;
  }

  function getZoomLimit() {
    return zoomLimit;
  }

  function destroy() {
    destroyed = true;
    clearLongPress();
    cancelAnimationFrame(rafId);
    if (resizeQuietRaf) cancelAnimationFrame(resizeQuietRaf);
    if (ro) ro.disconnect();
    viewport.removeEventListener('scroll', onViewportScroll);
    viewport.removeEventListener('wheel', onUserScrollGesture);
    viewport.removeEventListener('touchstart', onUserScrollGesture);
    viewport.removeEventListener('touchmove', onUserScrollGesture);
    viewport.removeEventListener('keydown', onViewportKeydown);
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
    setShowStandardNotation,
    setActivePosition,
    resumeAutoFollow,
    getZoomLimit,
    destroy,
  };
}
