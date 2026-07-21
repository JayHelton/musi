// Dependency-free, browser-and-Node PDF text/geometry extractor.
//
// Musi ships as a static, offline PWA with no build step and no third-party
// libraries, so we cannot pull in a heavy PDF engine like pdf.js. This module
// implements just enough of the PDF spec to pull readable text (with positions)
// and simple filled rectangles out of the vector-drawn drum notation PDFs that
// tools such as Soundslice, MuseScore and Guitar Pro export:
//
//   * classic `N 0 obj … endobj` indirect objects (no object-stream expansion),
//   * FlateDecode content streams inflated with the platform DecompressionStream,
//   * a small content-stream interpreter that tracks the text + graphics matrix
//     so every shown string and rectangle gets an absolute (x, y) on the page.
//
// It deliberately ignores font programs: literal `(…)` strings are decoded as
// Latin-1/ASCII (which is what note counts, tempos, titles and R/L sticking use)
// and hex `<…>` strings are surfaced as positioned "glyph" markers (which is how
// the music font draws note heads) without trying to name the glyph. That is
// enough for `pdfTabImport.js` to reconstruct practisable patterns, and it keeps
// the whole thing tiny and offline-safe.

// ---- low level: bytes <-> latin1 string ------------------------------------

const CHUNK = 0x8000;

function bytesToLatin1(bytes, start = 0, end = bytes.length) {
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, end)));
  }
  return out;
}

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('pdfExtract: expected ArrayBuffer or Uint8Array');
}

// Inflate a zlib/raw-deflate stream using the platform DecompressionStream.
// Available as a global in modern browsers and Node >= 18.
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('pdfExtract: DecompressionStream is not available in this environment');
  }
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(fmt);
      const resp = new Response(new Blob([bytes]).stream().pipeThrough(ds));
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    } catch (e) { /* try next format */ }
  }
  return null;
}

// ---- object scan -----------------------------------------------------------

// Locate every `N G obj … endobj` and remember where its stream data (if any)
// lives so we can slice the raw bytes later. Object streams (/ObjStm) are not
// expanded; the target PDFs keep page/content objects at the top level.
function scanObjects(latin1, bytes) {
  const objs = new Map();
  const re = /(\d+)\s+(\d+)\s+obj/g;
  let m;
  while ((m = re.exec(latin1))) {
    const num = Number(m[1]);
    const headerEnd = re.lastIndex;
    const endobj = latin1.indexOf('endobj', headerEnd);
    const bodyEnd = endobj === -1 ? latin1.length : endobj;
    const streamKw = latin1.indexOf('stream', headerEnd);
    const dictEnd = streamKw !== -1 && streamKw < bodyEnd ? streamKw : bodyEnd;
    const dict = latin1.slice(headerEnd, dictEnd);

    let stream = null;
    if (streamKw !== -1 && streamKw < bodyEnd) {
      let dataStart = streamKw + 'stream'.length;
      if (latin1[dataStart] === '\r') dataStart++;
      if (latin1[dataStart] === '\n') dataStart++;
      let dataEnd = latin1.indexOf('endstream', dataStart);
      if (dataEnd === -1) dataEnd = bodyEnd;
      // Trim a single trailing EOL that precedes `endstream`.
      let trimEnd = dataEnd;
      if (latin1[trimEnd - 1] === '\n') trimEnd--;
      if (latin1[trimEnd - 1] === '\r') trimEnd--;
      stream = { start: dataStart, end: trimEnd };
    }
    objs.set(num, { num, dict, stream, header: headerEnd });
  }
  return objs;
}

function hasFlate(dict) { return /\/FlateDecode/.test(dict); }

async function getStreamBytes(obj, bytes) {
  if (!obj || !obj.stream) return null;
  const raw = bytes.subarray(obj.stream.start, obj.stream.end);
  if (hasFlate(obj.dict)) return await inflate(raw);
  return raw;
}

// ---- content-stream tokenizer ---------------------------------------------

// Decode a PDF literal string `(…)`, honouring backslash escapes and octal.
function decodeLiteral(src, i) {
  // i points just after the opening '('
  let depth = 1;
  let out = '';
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n >= '0' && n <= '7') {
        let oct = n; i += 2;
        for (let k = 0; k < 2 && src[i] >= '0' && src[i] <= '7'; k++, i++) oct += src[i];
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        continue;
      }
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (n === '\n') { i += 2; continue; }
      if (n === '\r') { i += 2; if (src[i] === '\n') i++; continue; }
      out += map[n] !== undefined ? map[n] : n;
      i += 2;
      continue;
    }
    if (c === '(') { depth++; out += c; i++; continue; }
    if (c === ')') { depth--; if (depth === 0) { i++; break; } out += c; i++; continue; }
    out += c; i++;
  }
  return { text: out, next: i };
}

function decodeHex(src, i) {
  // i points just after '<'
  let hex = '';
  while (i < src.length && src[i] !== '>') { hex += src[i]; i++; }
  i++; // skip '>'
  hex = hex.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length % 2) hex += '0';
  let out = '';
  for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
  return { text: out, next: i, hex };
}

const MAT_ID = [1, 0, 0, 1, 0, 0];
function matMul(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}
function applyPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Whether decoded literal text is meaningful readable text (vs a control run).
function isReadable(text) {
  if (!text) return false;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) printable++;
  }
  return printable > 0 && printable >= text.length / 2;
}

// Interpret a single page content stream into positioned runs + rectangles.
function interpretContent(src, pageHeight) {
  const runs = [];
  const rects = [];

  let ctm = MAT_ID.slice();
  const ctmStack = [];
  let tm = MAT_ID.slice();
  let tlm = MAT_ID.slice();
  let fontSize = 0;
  let fontRes = '';
  let leading = 0;
  let charSpace = 0;
  let wordSpace = 0;

  // Operand stack of primitive tokens.
  const ops = [];
  let i = 0;
  const n = src.length;

  const num = (v) => (typeof v === 'number' ? v : parseFloat(v));

  const emitText = (text, isGlyph, hex) => {
    if (!text) return;
    const eff = matMul(tm, ctm);
    const [x, y] = applyPoint(eff, 0, 0);
    const size = Math.hypot(eff[0], eff[1]) || Math.abs(fontSize) || 1;
    const readable = !isGlyph && isReadable(text);
    runs.push({
      text: readable ? text : '',
      x,
      y: pageHeight != null ? pageHeight - y : y,
      rawY: y,
      size,
      font: fontRes,
      kind: readable ? 'text' : 'glyph',
      hex: hex || null,
    });
    // Advance the text matrix roughly by the glyph run so following TJ pieces
    // on the same line do not stack. Width is approximated from the font size.
    const adv = size * text.length * 0.5;
    tm = matMul([1, 0, 0, 1, adv / (size || 1), 0], tm);
  };

  const showArray = (arr) => {
    for (const item of arr) {
      if (typeof item === 'number') {
        const shift = (-item / 1000) * (fontSize || 1);
        tm = matMul([1, 0, 0, 1, shift, 0], tm);
      } else {
        emitText(item.text, item.glyph, item.hex);
      }
    }
  };

  while (i < n) {
    const c = src[i];
    if (c === '%') { // comment to EOL
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
    if (c === '(') {
      const r = decodeLiteral(src, i + 1);
      ops.push({ str: true, text: r.text, glyph: false });
      i = r.next;
      continue;
    }
    if (c === '<' && src[i + 1] !== '<') {
      const r = decodeHex(src, i + 1);
      ops.push({ str: true, text: r.text, glyph: true, hex: r.hex });
      i = r.next;
      continue;
    }
    if (c === '<' && src[i + 1] === '<') { // skip inline dict
      let depth = 0;
      while (i < n) {
        if (src[i] === '<' && src[i + 1] === '<') { depth++; i += 2; continue; }
        if (src[i] === '>' && src[i + 1] === '>') { depth--; i += 2; if (depth === 0) break; continue; }
        i++;
      }
      continue;
    }
    if (c === '[') {
      // Parse an array of strings/numbers (used by TJ).
      const arr = [];
      i++;
      while (i < n && src[i] !== ']') {
        const cc = src[i];
        if (cc === ' ' || cc === '\n' || cc === '\r' || cc === '\t') { i++; continue; }
        if (cc === '(') { const r = decodeLiteral(src, i + 1); arr.push({ text: r.text, glyph: false }); i = r.next; continue; }
        if (cc === '<') { const r = decodeHex(src, i + 1); arr.push({ text: r.text, glyph: true, hex: r.hex }); i = r.next; continue; }
        // number
        let numStr = '';
        while (i < n && /[-+.\d]/.test(src[i])) { numStr += src[i]; i++; }
        if (numStr) arr.push(parseFloat(numStr));
        else i++;
      }
      i++; // skip ']'
      ops.push({ array: arr });
      continue;
    }
    if (c === '/') { // name token
      let name = '/';
      i++;
      while (i < n && !/[\s()<>\[\]{}\/%]/.test(src[i])) { name += src[i]; i++; }
      ops.push(name);
      continue;
    }
    if (/[-+.\d]/.test(c)) {
      let numStr = '';
      while (i < n && /[-+.\deE]/.test(src[i])) { numStr += src[i]; i++; }
      ops.push(parseFloat(numStr));
      continue;
    }
    // Operator token (letters + a few symbols like ').
    let op = '';
    while (i < n && !/[\s()<>\[\]{}\/%]/.test(src[i]) && !/[-+.\d]/.test(src[i])) { op += src[i]; i++; }
    if (!op) { i++; continue; }

    switch (op) {
      case 'q': ctmStack.push(ctm.slice()); break;
      case 'Q': ctm = ctmStack.pop() || MAT_ID.slice(); break;
      case 'cm': {
        const a = ops.slice(-6).map(num);
        if (a.length === 6) ctm = matMul(a, ctm);
        break;
      }
      case 'BT': tm = MAT_ID.slice(); tlm = MAT_ID.slice(); break;
      case 'ET': break;
      case 'Tf': fontSize = num(ops[ops.length - 1]); fontRes = String(ops[ops.length - 2] || ''); break;
      case 'TL': leading = num(ops[ops.length - 1]); break;
      case 'Tc': charSpace = num(ops[ops.length - 1]); break;
      case 'Tw': wordSpace = num(ops[ops.length - 1]); break;
      case 'Td': {
        const tx = num(ops[ops.length - 2]); const ty = num(ops[ops.length - 1]);
        tlm = matMul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice();
        break;
      }
      case 'TD': {
        const tx = num(ops[ops.length - 2]); const ty = num(ops[ops.length - 1]);
        leading = -ty;
        tlm = matMul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice();
        break;
      }
      case 'Tm': {
        const a = ops.slice(-6).map(num);
        if (a.length === 6) { tlm = a.slice(); tm = a.slice(); }
        break;
      }
      case 'T*': tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); break;
      case 'Tj': { const s = ops[ops.length - 1]; if (s && s.str) emitText(s.text, s.glyph, s.hex); break; }
      case 'TJ': { const a = ops[ops.length - 1]; if (a && a.array) showArray(a.array); break; }
      case "'": {
        tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice();
        const s = ops[ops.length - 1]; if (s && s.str) emitText(s.text, s.glyph, s.hex);
        break;
      }
      case '"': {
        wordSpace = num(ops[ops.length - 3]); charSpace = num(ops[ops.length - 2]);
        tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice();
        const s = ops[ops.length - 1]; if (s && s.str) emitText(s.text, s.glyph, s.hex);
        break;
      }
      case 're': {
        const a = ops.slice(-4).map(num);
        if (a.length === 4) {
          const [rx, ry, rw, rh] = a;
          const [x0, y0] = applyPoint(ctm, rx, ry);
          const [x1, y1] = applyPoint(ctm, rx + rw, ry + rh);
          const xMin = Math.min(x0, x1); const xMax = Math.max(x0, x1);
          const yMin = Math.min(y0, y1); const yMax = Math.max(y0, y1);
          rects.push({
            x: xMin,
            y: pageHeight != null ? pageHeight - yMax : yMin,
            w: xMax - xMin,
            h: yMax - yMin,
          });
        }
        break;
      }
      default: break;
    }
    ops.length = 0;
  }

  return { runs, rects };
}

// ---- page discovery --------------------------------------------------------

function parseMediaBox(dict) {
  const m = dict.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
}

function refsFromContents(dict) {
  const m = dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
  if (!m) return [];
  const body = m[1];
  const refs = [];
  const re = /(\d+)\s+\d+\s+R/g;
  let r;
  while ((r = re.exec(body))) refs.push(Number(r[1]));
  return refs;
}

function collectPageObjects(objs) {
  const pages = [];
  for (const obj of objs.values()) {
    if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.dict)) pages.push(obj);
  }
  // Fallback: some writers omit /Type /Page; treat objects with /Contents +
  // /MediaBox as pages.
  if (!pages.length) {
    for (const obj of objs.values()) {
      if (/\/Contents/.test(obj.dict) && /\/MediaBox/.test(obj.dict)) pages.push(obj);
    }
  }
  return pages;
}

// Inherit MediaBox from the parent Pages tree when a page omits it.
function resolveMediaBox(pageObj, objs) {
  let cur = pageObj;
  let guard = 0;
  while (cur && guard++ < 32) {
    const box = parseMediaBox(cur.dict);
    if (box) return box;
    const pm = cur.dict.match(/\/Parent\s+(\d+)\s+\d+\s+R/);
    if (!pm) break;
    cur = objs.get(Number(pm[1]));
  }
  return [0, 0, 612, 792];
}

/**
 * Extract positioned text runs and rectangles from a PDF.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<{ pages: Array<{ index:number, width:number, height:number, runs:Array, rects:Array }> }>}
 */
export async function extractPdf(input) {
  const bytes = toUint8(input);
  const latin1 = bytesToLatin1(bytes);
  if (!latin1.startsWith('%PDF')) throw new Error('pdfExtract: not a PDF file');

  const objs = scanObjects(latin1, bytes);
  const pageObjs = collectPageObjects(objs);

  const pages = [];
  let pageIndex = 0;
  for (const pageObj of pageObjs) {
    const box = resolveMediaBox(pageObj, objs);
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    const contentRefs = refsFromContents(pageObj.dict);
    let combined = '';
    for (const ref of contentRefs) {
      const sbytes = await getStreamBytes(objs.get(ref), bytes);
      if (sbytes) combined += bytesToLatin1(sbytes) + '\n';
    }
    if (!combined) { pageIndex++; continue; }
    const { runs, rects } = interpretContent(combined, height);
    pages.push({ index: pageIndex, width, height, runs, rects });
    pageIndex++;
  }

  // Absolute last resort: no page objects found (unusual). Inflate every content
  // stream and interpret it as one page.
  if (!pages.length) {
    let combined = '';
    for (const obj of objs.values()) {
      if (!obj.stream || !hasFlate(obj.dict)) continue;
      const sbytes = await getStreamBytes(obj, bytes);
      if (!sbytes) continue;
      const txt = bytesToLatin1(sbytes);
      if (/\bBT\b|\bTj\b|\bTJ\b/.test(txt)) combined += txt + '\n';
    }
    if (combined) {
      const { runs, rects } = interpretContent(combined, null);
      pages.push({ index: 0, width: 612, height: 792, runs, rects });
    }
  }

  return { pages };
}

// Group a page's text runs into visual lines (rows) sorted top-to-bottom and
// left-to-right. Coordinates use a top-left origin (y grows downward).
export function groupLines(runs, yTolerance = 3) {
  const text = runs.filter((r) => r.kind === 'text' && r.text.trim());
  const sorted = text.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const run of sorted) {
    let line = lines.find((l) => Math.abs(l.y - run.y) <= yTolerance);
    if (!line) { line = { y: run.y, runs: [] }; lines.push(line); }
    line.runs.push(run);
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.text = line.runs.map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim();
    line.x = line.runs[0].x;
  }
  lines.sort((a, b) => a.y - b.y);
  return lines;
}
