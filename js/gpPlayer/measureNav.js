// Compact measure navigation strip for the GP parchment player.

import { el } from './dom.js';

/**
 * @param {HTMLElement} host
 * @param {{
 *   measureCount: number,
 *   markers?: (string|null)[],
 *   onSeek?: (index:number)=>void,
 *   onLoopRange?: (startIdx:number, endIdx:number)=>void,
 * }} opts
 */
export function mountMeasureNav(host, { measureCount = 0, markers = [], onSeek, onLoopRange } = {}) {
  const noop = {
    update() {},
    setMeasureCount() {},
    setLabel() {},
    destroy() {},
  };
  if (!host) return noop;

  host.innerHTML = '';
  host.classList.add('gpp-measure-nav');

  const label = el('span', { class: 'gpp-measure-nav-label', text: '' });
  const strip = el('div', { class: 'gpp-measure-nav-strip', 'aria-label': 'Measures' });
  host.append(label, strip);

  let barBtns = [];
  let prevActive = -1;
  let prevNav = -1;
  let prevLoopEnabled = false;
  let prevLoopStart = 0;
  let prevLoopEnd = 0;
  let count = measureCount;
  let loopDrag = null;

  function setLabel(current, total) {
    const t = total ?? count;
    const c = current == null ? '—' : current + 1;
    label.textContent = t ? `Measure ${c} of ${t}` : '';
  }

  function indexFromBtn(btn) {
    return Number(btn?.dataset?.index);
  }

  function paintDragRange(startIdx, endIdx) {
    const lo = Math.max(0, Math.min(startIdx, endIdx));
    const hi = Math.min(count - 1, Math.max(startIdx, endIdx));
    for (let i = 0; i < barBtns.length; i++) {
      barBtns[i].classList.toggle('in-loop-drag', i >= lo && i <= hi);
    }
  }

  function clearDragRange() {
    for (const btn of barBtns) btn.classList.remove('in-loop-drag');
  }

  function btnFromPoint(clientX, clientY) {
    const elAt = document.elementFromPoint?.(clientX, clientY);
    return elAt?.closest?.('.gpp-measure-nav-btn');
  }

  function onStripPointerDown(e) {
    if (e.button !== 0) return;
    const btn = e.target?.closest?.('.gpp-measure-nav-btn');
    if (!btn) return;
    loopDrag = {
      anchor: indexFromBtn(btn),
      pointerId: e.pointerId,
      moved: false,
    };
    strip.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onStripPointerMove(e) {
    if (!loopDrag || loopDrag.pointerId !== e.pointerId) return;
    const btn = btnFromPoint(e.clientX, e.clientY);
    if (!btn) return;
    const idx = indexFromBtn(btn);
    if (idx !== loopDrag.anchor) loopDrag.moved = true;
    paintDragRange(loopDrag.anchor, idx);
  }

  function onStripPointerUp(e) {
    if (!loopDrag || loopDrag.pointerId !== e.pointerId) return;
    strip.releasePointerCapture?.(e.pointerId);
    const btn = btnFromPoint(e.clientX, e.clientY);
    const endIdx = btn ? indexFromBtn(btn) : loopDrag.anchor;
    if (loopDrag.moved && typeof onLoopRange === 'function') {
      const lo = Math.min(loopDrag.anchor, endIdx);
      const hi = Math.max(loopDrag.anchor, endIdx);
      onLoopRange(lo, hi);
    } else if (!loopDrag.moved && typeof onSeek === 'function') {
      onSeek(loopDrag.anchor);
    }
    clearDragRange();
    loopDrag = null;
  }

  strip.addEventListener('pointerdown', onStripPointerDown);
  strip.addEventListener('pointermove', onStripPointerMove);
  strip.addEventListener('pointerup', onStripPointerUp);
  strip.addEventListener('pointercancel', onStripPointerUp);

  function rebuild() {
    strip.innerHTML = '';
    barBtns = [];
    for (let i = 0; i < count; i++) {
      const marker = markers[i];
      const btn = el('button', {
        class: 'gpp-measure-nav-btn' + (marker ? ' has-marker' : ''),
        type: 'button',
        text: marker ? `${i + 1}\n${marker}` : String(i + 1),
        title: marker ? `${marker} · drag to loop` : `Bar ${i + 1} · drag to loop`,
        'aria-label': marker ? `Bar ${i + 1}, ${marker}` : `Bar ${i + 1}`,
      });
      btn.dataset.index = String(i);
      strip.appendChild(btn);
      barBtns.push(btn);
    }
    prevActive = -1;
    prevNav = -1;
    prevLoopEnabled = false;
    prevLoopStart = 0;
    prevLoopEnd = 0;
    setLabel(null, count);
  }

  function update({ measureIndex = null, navBar = null, loopEnabled = false, loopStart = 0, loopEnd = 0 } = {}) {
    const active = measureIndex == null ? -1 : measureIndex;
    if (active !== prevActive && barBtns[prevActive]) {
      barBtns[prevActive].classList.remove('is-active');
    }
    if (active >= 0 && barBtns[active]) {
      barBtns[active].classList.add('is-active');
      setLabel(active, count);
    }

    const nav = navBar == null ? -1 : navBar;
    if (prevNav !== nav && barBtns[prevNav]) {
      barBtns[prevNav].classList.remove('is-nav');
    }
    if (nav >= 0 && nav !== active && barBtns[nav]) {
      barBtns[nav].classList.add('is-nav');
    }
    prevNav = nav;
    prevActive = active;

    const loopChanged = loopEnabled !== prevLoopEnabled
      || loopStart !== prevLoopStart
      || loopEnd !== prevLoopEnd;
    if (loopChanged) {
      if (loopEnabled) {
        for (let i = 0; i < barBtns.length; i++) {
          barBtns[i].classList.toggle('in-loop', i >= loopStart && i <= loopEnd);
        }
      } else {
        for (const btn of barBtns) btn.classList.remove('in-loop');
      }
      prevLoopEnabled = loopEnabled;
      prevLoopStart = loopStart;
      prevLoopEnd = loopEnd;
    }
  }

  function setMeasureCount(n, nextMarkers = markers) {
    count = Math.max(0, Number(n) || 0);
    markers = nextMarkers || [];
    rebuild();
  }

  function destroy() {
    strip.removeEventListener('pointerdown', onStripPointerDown);
    strip.removeEventListener('pointermove', onStripPointerMove);
    strip.removeEventListener('pointerup', onStripPointerUp);
    strip.removeEventListener('pointercancel', onStripPointerUp);
    host.innerHTML = '';
    host.classList.remove('gpp-measure-nav');
    barBtns = [];
  }

  rebuild();

  return { update, setMeasureCount, setLabel, destroy };
}
