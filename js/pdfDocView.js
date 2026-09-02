// In-app PDF view.
//
// The app cannot leave a PDF to the browser. Chrome on Android has no PDF
// plugin, so an <iframe> with a PDF shows an empty box. Safari on iOS shows
// only the first page of a blob, and an installed PWA often shows nothing at
// all. The learner then has to open a new tab to read the exercise.
//
// This module draws the pages itself with pdf.js (js/vendor/pdfjs), so the
// exercise appears in the viewer on every browser. The pages scroll in one
// column. The first view fits the frame: a wide frame shows the whole page, a
// tall frame gives the page the full width. A small control zooms in and out,
// and two fingers do the same.
//
// A canvas holds no links, so the view puts a layer of its own on each page.
// The layer holds one box for each link annotation of the page. A box that
// holds a web address opens it in a new tab, and a box that points into the
// same file scrolls to that place.
//
// pdf.js loads only when the learner opens a PDF. The service worker keeps the
// files after the first use, so the view still works offline.

const PDFJS_MODULE = './vendor/pdfjs/pdf.mjs';
const PDFJS_WORKER = './vendor/pdfjs/pdf.worker.mjs';
const PDFJS_FONTS = './vendor/pdfjs/standard_fonts/';

// A page never draws more pixels than this. A phone has little memory, and a
// large page at a high device ratio can take more than it has.
const MAX_CANVAS_PIXELS = 4_000_000;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 6;
// A frame this wide, or wider, shows the whole page. A narrower frame is a
// phone in portrait, where the full width reads better.
const WIDE_FRAME_RATIO = 0.9;

// The view opens a link only with one of these protocols. A PDF can hold any
// string, and a "javascript:" link must not run in the app.
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// Annotation flags of the PDF standard. The view leaves out a link with one of
// these flags, because the page does not show it.
const FLAG_HIDDEN = 0x02;
const FLAG_NO_VIEW = 0x20;

let libPromise = null;

/** Load pdf.js once. The promise is shared by every view. */
function loadPdfLib() {
  if (libPromise) return libPromise;
  libPromise = import(PDFJS_MODULE)
    .then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(PDFJS_WORKER, import.meta.url).href;
      return lib;
    })
    .catch((err) => {
      libPromise = null;
      throw err;
    });
  return libPromise;
}

let warmed = false;

/**
 * Fetch pdf.js in the background.
 *
 * The library is large, so it loads only when it is needed. The Exercises
 * library calls this when it holds a PDF: the first PDF then opens at once,
 * and the service worker keeps the files for the next time the app is offline.
 */
export function warmPdfLib() {
  if (warmed || libPromise) return;
  warmed = true;
  const start = () => {
    loadPdfLib()
      .then(() => fetch(new URL(PDFJS_WORKER, import.meta.url).href).catch(() => null))
      .catch(() => { warmed = false; });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 6000 });
  else setTimeout(start, 3000);
}

function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'onClick') node.addEventListener('click', value);
    else node.setAttribute(key, value);
  });
  (Array.isArray(kids) ? kids : [kids]).forEach((kid) => kid && node.appendChild(kid));
  return node;
}

function pixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2, Math.max(1, dpr));
}

/**
 * Give back an address the view can open, or an empty string.
 *
 * A PDF holds the address as free text, so the view keeps only an absolute
 * address with a protocol of LINK_PROTOCOLS.
 *
 * @param {*} raw   the address pdf.js read from the annotation
 * @returns {string}
 */
export function safeLinkUrl(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : '';
  } catch (err) {
    return '';
  }
}

/** Keep a percentage in the page. */
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Read the rectangles of one link annotation.
 *
 * A link on two lines of text has one quadrilateral for each line. The view
 * uses them, because the single rectangle of the annotation also covers the
 * text between the two lines. A link without quadrilaterals gives back its
 * rectangle.
 *
 * @param {Object} item   one annotation
 * @returns {Array<Array<number>>}   rectangles in the units of the PDF
 */
function linkRects(item) {
  const quads = item.quadPoints;
  const rects = [];
  if (quads && quads.length >= 8 && quads.length % 8 === 0) {
    for (let at = 0; at < quads.length; at += 8) {
      const xs = [quads[at], quads[at + 2], quads[at + 4], quads[at + 6]];
      const ys = [quads[at + 1], quads[at + 3], quads[at + 5], quads[at + 7]];
      if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) continue;
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
  }
  if (rects.length) return rects;
  const rect = item.rect;
  if (!Array.isArray(rect) || rect.length < 4 || rect.some((v) => !Number.isFinite(v))) return [];
  return [rect];
}

/**
 * Turn the link annotations of a page into boxes.
 *
 * Each box gives its place in percent of the page, so the box stays on its
 * text at every zoom step. A box holds a web address, or the destination of a
 * link into the same file.
 *
 * @param {Array<Object>} annotations   what pdfPage.getAnnotations gave back
 * @param {{width: number, height: number, convertToViewportRectangle: Function}} viewport
 *        the page at scale 1
 * @returns {Array<{left: number, top: number, width: number, height: number,
 *                  url: string, dest: *}>}
 */
export function linkBoxesFromAnnotations(annotations, viewport) {
  if (!Array.isArray(annotations)) return [];
  if (!(viewport?.width > 0) || !(viewport?.height > 0)) return [];
  if (typeof viewport.convertToViewportRectangle !== 'function') return [];
  const boxes = [];
  for (const item of annotations) {
    if (!item || item.subtype !== 'Link') continue;
    const flags = Number(item.annotationFlags) || 0;
    if (item.hidden || (flags & FLAG_HIDDEN) || (flags & FLAG_NO_VIEW)) continue;
    const url = safeLinkUrl(item.url);
    const dest = url ? null : (item.dest ?? null);
    if (!url && dest == null) continue;
    for (const rect of linkRects(item)) {
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
      const left = clampPercent((Math.min(x1, x2) / viewport.width) * 100);
      const right = clampPercent((Math.max(x1, x2) / viewport.width) * 100);
      const top = clampPercent((Math.min(y1, y2) / viewport.height) * 100);
      const bottom = clampPercent((Math.max(y1, y2) / viewport.height) * 100);
      const width = right - left;
      const height = bottom - top;
      // A box of no size holds no text, and a box off the page shows nothing.
      if (width <= 0 || height <= 0) continue;
      boxes.push({ left, top, width, height, url, dest });
    }
  }
  return boxes;
}

/**
 * Draw a PDF in a host element.
 *
 * @param {HTMLElement} host   the box the view fills
 * @param {Blob} blob          the PDF file
 * @returns {Promise<{pageCount: number, destroy: Function}>}
 */
export async function mountPdfDoc(host, blob) {
  const lib = await loadPdfLib();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = lib.getDocument({
    data,
    standardFontDataUrl: new URL(PDFJS_FONTS, import.meta.url).href,
    isEvalSupported: false,
  });
  const doc = await task.promise;

  host.classList.add('pdfv-host');
  const scroller = el('div', { class: 'pdfv-scroll', tabindex: '0' });
  const column = el('div', { class: 'pdfv-column' });
  scroller.appendChild(column);
  host.appendChild(scroller);

  const pages = [];
  let baseScale = 1;
  let zoom = 1;
  let destroyed = false;
  let resizeTimer = 0;
  let firstViewport = null;

  const status = el('div', { class: 'pdfv-status', text: `Page 1 of ${doc.numPages}` });
  // One page has no count to keep, and the pill would cover the page.
  status.hidden = doc.numPages < 2;
  host.appendChild(status);

  /** The scale that fits page one in the frame. */
  function fitScale() {
    if (!firstViewport) return 1;
    const boxW = Math.max(120, scroller.clientWidth - 12);
    const boxH = Math.max(120, scroller.clientHeight - 12);
    const byWidth = boxW / firstViewport.width;
    const byHeight = boxH / firstViewport.height;
    const wide = boxW / boxH > WIDE_FRAME_RATIO;
    return wide ? Math.min(byWidth, byHeight) : byWidth;
  }

  /** Give every page a box of the right shape, so the column keeps its height. */
  function layoutPages() {
    const scale = baseScale * zoom;
    pages.forEach((page) => {
      const width = Math.round(page.width * scale);
      const height = Math.round(page.height * scale);
      page.holder.style.width = `${width}px`;
      page.holder.style.height = `${height}px`;
      if (page.canvas) {
        page.canvas.style.width = `${width}px`;
        page.canvas.style.height = `${height}px`;
      }
      // The drawn page no longer matches its box, so it must draw again.
      if (page.drawnScale && Math.abs(page.drawnScale - scale) > 0.01) page.stale = true;
    });
  }

  /**
   * Scroll to the place a link points at.
   *
   * A destination names a page, and it can also name a height on that page.
   * The view keeps the top of the page when it finds no height.
   */
  async function goToDest(dest) {
    try {
      const target = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (destroyed || !Array.isArray(target) || !target.length) return;
      const ref = target[0];
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      const page = pages[index];
      if (destroyed || !page) return;
      const kind = target[1]?.name;
      // "XYZ" gives a corner, and "FitH" and "FitBH" give a height only.
      const y = kind === 'XYZ' ? target[3] : target[2];
      let offset = 0;
      if ((kind === 'XYZ' || kind === 'FitH' || kind === 'FitBH') && Number.isFinite(y)) {
        const pdfPage = page.pdfPage || (page.pdfPage = await doc.getPage(page.number));
        if (destroyed) return;
        const view = pdfPage.getViewport({ scale: baseScale * zoom });
        offset = Math.max(0, view.convertToViewportPoint(0, y)[1]);
      }
      scroller.scrollTop = Math.max(0, page.holder.offsetTop + offset - 6);
      drawVisible();
      reportPosition();
    } catch (err) { /* the file has no such place */ }
  }

  /** Build the element of one link box. */
  function linkNode(box) {
    const style = `left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%`;
    if (box.url) {
      // The app stays open in its own tab, so every address opens a new one.
      return el('a', {
        class: 'pdfv-link',
        href: box.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: box.url,
        'aria-label': `Open ${box.url}`,
        style,
      });
    }
    return el('button', {
      class: 'pdfv-link',
      type: 'button',
      title: 'Go to this place in the file',
      'aria-label': 'Go to this place in the file',
      style,
      onClick: () => { void goToDest(box.dest); },
    });
  }

  /**
   * Put the links of a page over the canvas.
   *
   * The layer is built one time for each page. A page that gives no links, or
   * that fails, keeps its canvas and shows no link.
   */
  async function ensureLinks(page) {
    if (destroyed || page.linksDone) return;
    page.linksDone = true;
    try {
      const pdfPage = page.pdfPage || (page.pdfPage = await doc.getPage(page.number));
      if (destroyed) return;
      const annotations = await pdfPage.getAnnotations({ intent: 'display' });
      if (destroyed) return;
      const boxes = linkBoxesFromAnnotations(annotations, pdfPage.getViewport({ scale: 1 }));
      if (!boxes.length) return;
      const layer = el('div', { class: 'pdfv-links' });
      boxes.forEach((box) => layer.appendChild(linkNode(box)));
      page.holder.appendChild(layer);
    } catch (err) { /* the page keeps its canvas without links */ }
  }

  async function drawPage(page) {
    if (destroyed) return;
    void ensureLinks(page);
    if (page.busy) return;
    const scale = baseScale * zoom;
    if (page.drawnScale && !page.stale) return;
    page.busy = true;
    try {
      const pdfPage = page.pdfPage || (page.pdfPage = await doc.getPage(page.number));
      if (destroyed) return;
      const viewport = pdfPage.getViewport({ scale });
      let ratio = pixelRatio();
      const pixels = viewport.width * viewport.height * ratio * ratio;
      if (pixels > MAX_CANVAS_PIXELS) {
        ratio = Math.max(1, ratio * Math.sqrt(MAX_CANVAS_PIXELS / pixels));
      }
      const canvas = page.canvas || el('canvas', { class: 'pdfv-canvas' });
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;
      if (!page.canvas) {
        page.canvas = canvas;
        page.holder.appendChild(canvas);
        page.holder.classList.add('is-drawn');
      }
      if (page.render) {
        try { page.render.cancel(); } catch (e) { /* the last draw is gone */ }
      }
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      page.render = pdfPage.render({ canvasContext: ctx, viewport });
      await page.render.promise;
      page.render = null;
      page.drawnScale = scale;
      page.stale = false;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') page.holder.classList.add('is-failed');
    } finally {
      page.busy = false;
    }
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const page = pages[Number(entry.target.dataset.page) - 1];
        if (!page) return;
        page.near = entry.isIntersecting;
        if (entry.isIntersecting) void drawPage(page);
      });
      reportPosition();
    }, { root: scroller, rootMargin: '150% 0px' })
    : null;

  function reportPosition() {
    const middle = scroller.scrollTop + scroller.clientHeight / 2;
    let current = 1;
    for (const page of pages) {
      if (page.holder.offsetTop <= middle) current = page.number;
    }
    status.textContent = `Page ${current} of ${doc.numPages}`;
  }

  function drawVisible() {
    pages.forEach((page) => { if (page.near || page.number === 1) void drawPage(page); });
  }

  function applyZoom(next, anchor = null) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (Math.abs(clamped - zoom) < 0.001) return;
    const before = scroller.scrollTop + (anchor == null ? scroller.clientHeight / 2 : anchor);
    const ratio = clamped / zoom;
    zoom = clamped;
    layoutPages();
    const after = before * ratio - (anchor == null ? scroller.clientHeight / 2 : anchor);
    scroller.scrollTop = Math.max(0, after);
    drawVisible();
  }

  // ---- controls ----------------------------------------------------------
  const zoomOutBtn = el('button', {
    class: 'pdfv-zoom-btn', type: 'button', title: 'Smaller', 'aria-label': 'Smaller',
    text: '−', onClick: () => applyZoom(zoom / 1.25),
  });
  const zoomInBtn = el('button', {
    class: 'pdfv-zoom-btn', type: 'button', title: 'Larger', 'aria-label': 'Larger',
    text: '+', onClick: () => applyZoom(zoom * 1.25),
  });
  const fitBtn = el('button', {
    class: 'pdfv-zoom-btn pdfv-zoom-fit', type: 'button', title: 'Fit the page',
    'aria-label': 'Fit the page', text: '⤢', onClick: () => applyZoom(1),
  });
  host.appendChild(el('div', { class: 'pdfv-zoom' }, [zoomOutBtn, fitBtn, zoomInBtn]));

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    applyZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientY - scroller.getBoundingClientRect().top);
  }
  scroller.addEventListener('wheel', onWheel, { passive: false });

  // Two fingers zoom the page, the way they do in a reader.
  let pinchStart = 0;
  let pinchZoom = 1;
  function touchGap(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(e) {
    if (e.touches.length !== 2) return;
    pinchStart = touchGap(e.touches);
    pinchZoom = zoom;
  }
  function onTouchMove(e) {
    if (e.touches.length !== 2 || !pinchStart) return;
    e.preventDefault();
    const box = scroller.getBoundingClientRect();
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - box.top;
    applyZoom(pinchZoom * (touchGap(e.touches) / pinchStart), midY);
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) pinchStart = 0;
  }
  scroller.addEventListener('touchstart', onTouchStart, { passive: true });
  scroller.addEventListener('touchmove', onTouchMove, { passive: false });
  scroller.addEventListener('touchend', onTouchEnd, { passive: true });
  scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });

  scroller.addEventListener('scroll', () => {
    if (!observer) drawVisible();
    reportPosition();
  }, { passive: true });

  // ---- build the column --------------------------------------------------
  const firstPage = await doc.getPage(1);
  firstViewport = firstPage.getViewport({ scale: 1 });
  baseScale = fitScale();

  for (let number = 1; number <= doc.numPages; number += 1) {
    const holder = el('div', { class: 'pdfv-page' });
    holder.dataset.page = String(number);
    column.appendChild(holder);
    pages.push({
      number,
      holder,
      width: firstViewport.width,
      height: firstViewport.height,
      canvas: null,
      pdfPage: number === 1 ? firstPage : null,
      drawnScale: 0,
      stale: false,
      near: number <= 2,
      busy: false,
      render: null,
      linksDone: false,
    });
    observer?.observe(holder);
  }
  layoutPages();
  drawVisible();

  // A page of another size keeps its own shape once it draws. The column
  // measures the first page, because that is the one the learner sees first.
  (async () => {
    for (const page of pages.slice(1)) {
      if (destroyed) return;
      try {
        page.pdfPage = page.pdfPage || await doc.getPage(page.number);
        const view = page.pdfPage.getViewport({ scale: 1 });
        if (Math.abs(view.width - page.width) > 1 || Math.abs(view.height - page.height) > 1) {
          page.width = view.width;
          page.height = view.height;
          page.stale = true;
          layoutPages();
          if (page.near) void drawPage(page);
        }
      } catch (e) { /* the page draws with the size of page one */ }
    }
  })();

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (destroyed) return;
        const next = fitScale();
        if (Math.abs(next - baseScale) < 0.005) return;
        baseScale = next;
        layoutPages();
        drawVisible();
      }, 120);
    })
    : null;
  resizeObserver?.observe(scroller);

  return {
    pageCount: doc.numPages,
    destroy() {
      destroyed = true;
      clearTimeout(resizeTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      scroller.removeEventListener('wheel', onWheel);
      pages.forEach((page) => {
        try { page.render?.cancel(); } catch (e) { /* the draw is gone */ }
        try { page.pdfPage?.cleanup(); } catch (e) { /* the page is gone */ }
        if (page.canvas) {
          page.canvas.width = 0;
          page.canvas.height = 0;
        }
      });
      try { doc.cleanup(); } catch (e) { /* the document is gone */ }
      try { doc.destroy(); } catch (e) { /* the document is gone */ }
      host.classList.remove('pdfv-host');
      host.innerHTML = '';
    },
  };
}
