// Compact measure navigation strip for the GP parchment player.

import { el } from './dom.js';

/**
 * @param {HTMLElement} host
 * @param {{ measureCount: number, markers?: (string|null)[], onSeek?: (index:number)=>void }} opts
 */
export function mountMeasureNav(host, { measureCount = 0, markers = [], onSeek } = {}) {
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
  let count = measureCount;

  function setLabel(current, total) {
    const t = total ?? count;
    const c = current == null ? '—' : current + 1;
    label.textContent = t ? `Measure ${c} of ${t}` : '';
  }

  function rebuild() {
    strip.innerHTML = '';
    barBtns = [];
    for (let i = 0; i < count; i++) {
      const marker = markers[i];
      const btn = el('button', {
        class: 'gpp-measure-nav-btn' + (marker ? ' has-marker' : ''),
        type: 'button',
        text: marker ? `${i + 1}\n${marker}` : String(i + 1),
        title: marker ? `${marker} · click to jump` : `Bar ${i + 1} · click to jump`,
      });
      btn.dataset.index = String(i);
      btn.addEventListener('click', () => {
        if (typeof onSeek === 'function') onSeek(i);
      });
      strip.appendChild(btn);
      barBtns.push(btn);
    }
    prevActive = -1;
    prevNav = -1;
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

    if (loopEnabled) {
      for (let i = 0; i < barBtns.length; i++) {
        barBtns[i].classList.toggle('in-loop', i >= loopStart && i <= loopEnd);
      }
    } else {
      for (const btn of barBtns) btn.classList.remove('in-loop');
    }
  }

  function setMeasureCount(n, nextMarkers = markers) {
    count = Math.max(0, Number(n) || 0);
    markers = nextMarkers || [];
    rebuild();
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('gpp-measure-nav');
    barBtns = [];
  }

  rebuild();

  return { update, setMeasureCount, setLabel, destroy };
}
