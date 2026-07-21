// Self-contained, offline PDF -> monospaced-text extractor for the Tab Analyzer.
//
// This is deliberately INDEPENDENT from js/drums/pdfExtract.js. The drum-tab and
// guitar-tab PDF importers are kept as parallel implementations so a change to
// one can never break the other. It also means the analyzer needs no third-party
// library and no network: like the rest of Musi it stays a static, offline PWA
// (this module only relies on the platform DecompressionStream, present in
// modern browsers and Node >= 18).
//
// Scope: pull positioned text runs (fret numbers, labels) out of the classic
// `N G obj … endobj` structure with FlateDecode content streams, tracking the
// text/graphics matrices so every shown string gets an absolute (x, y). Those
// runs are then reflowed into monospaced lines the tab parser understands.
// Font programs are ignored; literal `(…)` strings decode as Latin-1 (which is
// what Guitar Pro / MuseScore / Soundslice use for numbers and text).

const CHUNK = 0x8000;

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('pdfText: expected ArrayBuffer or Uint8Array');
}

function bytesToLatin1(bytes, start = 0, end = bytes.length) {
  let out = '';
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, end)));
  }
  return out;
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(fmt);
      const resp = new Response(new Blob([bytes]).stream().pipeThrough(ds));
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) { /* try next */ }
  }
  return null;
}

// ---- object scan -----------------------------------------------------------

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
      let trimEnd = dataEnd;
      if (latin1[trimEnd - 1] === '\n') trimEnd--;
      if (latin1[trimEnd - 1] === '\r') trimEnd--;
      stream = { start: dataStart, end: trimEnd };
    }
    objs.set(num, { num, dict, stream });
  }
  return objs;
}

const hasFlate = (dict) => /\/FlateDecode/.test(dict);

async function getStreamBytes(obj, bytes) {
  if (!obj || !obj.stream) return null;
  const raw = bytes.subarray(obj.stream.start, obj.stream.end);
  return hasFlate(obj.dict) ? await inflate(raw) : raw;
}

// ---- fonts: /ToUnicode CMap decoding ---------------------------------------
// Guitar Pro / MuseScore exports frequently draw fret numbers and text as
// embedded-font glyphs (hex strings), not ASCII. Each font carries a
// /ToUnicode CMap that maps glyph codes back to Unicode; decoding it lets this
// stay fully offline (no font-name guessing, no third-party lib).

// Read a dict value: an inline << >> dict, an "N 0 R" ref, or a raw token.
function findValue(dict, key) {
  const idx = dict.indexOf(key);
  if (idx === -1) return null;
  let i = idx + key.length;
  while (i < dict.length && /\s/.test(dict[i])) i++;
  if (dict[i] === '<' && dict[i + 1] === '<') {
    let depth = 0; const start = i;
    while (i < dict.length) {
      if (dict[i] === '<' && dict[i + 1] === '<') { depth++; i += 2; continue; }
      if (dict[i] === '>' && dict[i + 1] === '>') { depth--; i += 2; if (depth === 0) break; continue; }
      i++;
    }
    return { kind: 'dict', text: dict.slice(start, i) };
  }
  const ref = dict.slice(i).match(/^(\d+)\s+\d+\s+R/);
  if (ref) return { kind: 'ref', num: Number(ref[1]) };
  const raw = dict.slice(i).match(/^\/?[^\s\/<>\[\]]+/);
  return raw ? { kind: 'raw', text: raw[0] } : null;
}

function dictTextOf(val, objs) {
  if (!val) return '';
  if (val.kind === 'dict') return val.text;
  if (val.kind === 'ref') { const o = objs.get(val.num); return o ? o.dict : ''; }
  return '';
}

// UTF-16BE hex -> string (code units are 4 hex digits each).
function hexToStr(hex) {
  if (hex.length % 4) hex = hex.padEnd(hex.length + (4 - (hex.length % 4)), '0');
  let out = '';
  for (let k = 0; k + 4 <= hex.length; k += 4) out += String.fromCharCode(parseInt(hex.substr(k, 4), 16));
  return out;
}

function parseToUnicode(text) {
  const map = new Map();
  let byteLen = 1;
  const csr = text.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
  if (csr) { const h = csr[1].match(/<([0-9a-fA-F]+)>/); if (h) byteLen = Math.max(1, Math.round(h[1].length / 2)); }

  let m;
  const bcRe = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bcRe.exec(text))) {
    const pr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let p;
    while ((p = pr.exec(m[1]))) map.set(parseInt(p[1], 16), hexToStr(p[2]));
  }
  const brRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = brRe.exec(text))) {
    const body = m[1];
    const single = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let r;
    while ((r = single.exec(body))) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16);
      let dst = parseInt(r[3], 16);
      for (let code = lo; code <= hi && code - lo < 65536; code++) map.set(code, String.fromCharCode(dst++));
    }
    const arr = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
    while ((r = arr.exec(body))) {
      const lo = parseInt(r[1], 16);
      const dsts = [...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => hexToStr(x[1]));
      for (let k = 0; k < dsts.length; k++) map.set(lo + k, dsts[k]);
    }
  }
  return { map, byteLen };
}

// Build { resourceName -> {map, byteLen} } for a page's fonts.
async function buildFontCMaps(pageObj, objs, bytes) {
  const fonts = new Map();
  const resText = dictTextOf(findValue(pageObj.dict, '/Resources'), objs);
  if (!resText) return fonts;
  const fontText = dictTextOf(findValue(resText, '/Font'), objs);
  if (!fontText) return fonts;
  const re = /\/([^\s\/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(fontText))) {
    const fontObj = objs.get(Number(m[2]));
    if (!fontObj) continue;
    const tu = findValue(fontObj.dict, '/ToUnicode');
    if (!tu || tu.kind !== 'ref') continue;
    const cmapBytes = await getStreamBytes(objs.get(tu.num), bytes);
    if (!cmapBytes) continue;
    fonts.set(m[1], parseToUnicode(bytesToLatin1(cmapBytes)));
  }
  return fonts;
}

function decodeWithCMap(hex, font) {
  if (!font || !font.map.size) return '';
  const step = Math.max(2, font.byteLen * 2);
  let out = '';
  for (let k = 0; k + step <= hex.length; k += step) {
    const code = parseInt(hex.substr(k, step), 16);
    out += font.map.get(code) || '';
  }
  return out;
}

// ---- string/number token decoding -----------------------------------------

function decodeLiteral(src, i) {
  let depth = 1, out = '';
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '\\') {
      const nx = src[i + 1];
      if (nx >= '0' && nx <= '7') {
        let oct = nx; i += 2;
        for (let k = 0; k < 2 && src[i] >= '0' && src[i] <= '7'; k++, i++) oct += src[i];
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        continue;
      }
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (nx === '\n') { i += 2; continue; }
      if (nx === '\r') { i += 2; if (src[i] === '\n') i++; continue; }
      out += map[nx] !== undefined ? map[nx] : nx;
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
  let hex = '';
  while (i < src.length && src[i] !== '>') { hex += src[i]; i++; }
  i++;
  hex = hex.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length % 2) hex += '0';
  let out = '';
  for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
  return { text: out, next: i, hex };
}

// ---- matrix helpers --------------------------------------------------------

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
const applyPoint = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function isReadable(text) {
  if (!text) return false;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) printable++;
  }
  return printable > 0 && printable >= text.length / 2;
}

// Interpret one page's content stream into positioned, readable text runs.
// `fonts` maps resource names -> ToUnicode CMap so glyph strings decode offline.
function interpretText(src, pageHeight, fonts = new Map()) {
  const runs = [];
  let ctm = MAT_ID.slice();
  const ctmStack = [];
  let tm = MAT_ID.slice();
  let tlm = MAT_ID.slice();
  let fontSize = 0, leading = 0;
  let currentFont = null;
  const ops = [];
  let i = 0;
  const n = src.length;
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v));

  const advance = (len) => {
    const eff0 = matMul(tm, ctm);
    const size0 = Math.hypot(eff0[0], eff0[1]) || Math.abs(fontSize) || 1;
    tm = matMul([1, 0, 0, 1, (size0 * len * 0.5) / (size0 || 1), 0], tm);
  };

  const emit = (text, isGlyph, hex) => {
    let outText = text;
    if (isGlyph) {
      outText = currentFont && hex ? decodeWithCMap(hex, currentFont) : '';
      if (!outText) { if (text) advance(text.length); return; }
    } else if (!text || !isReadable(text)) {
      if (text) advance(text.length);
      return;
    }
    const eff = matMul(tm, ctm);
    const [x, y] = applyPoint(eff, 0, 0);
    const size = Math.hypot(eff[0], eff[1]) || Math.abs(fontSize) || 1;
    runs.push({ text: outText, x, y: pageHeight != null ? pageHeight - y : y, size });
    advance(outText.length);
  };

  const showArray = (arr) => {
    for (const item of arr) {
      if (typeof item === 'number') {
        tm = matMul([1, 0, 0, 1, (-item / 1000) * (fontSize || 1), 0], tm);
      } else {
        emit(item.text, item.glyph, item.hex);
      }
    }
  };

  while (i < n) {
    const c = src[i];
    if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
    if (c === '(') { const r = decodeLiteral(src, i + 1); ops.push({ str: true, text: r.text, glyph: false }); i = r.next; continue; }
    if (c === '<' && src[i + 1] !== '<') { const r = decodeHex(src, i + 1); ops.push({ str: true, text: r.text, glyph: true, hex: r.hex }); i = r.next; continue; }
    if (c === '<' && src[i + 1] === '<') {
      let depth = 0;
      while (i < n) {
        if (src[i] === '<' && src[i + 1] === '<') { depth++; i += 2; continue; }
        if (src[i] === '>' && src[i + 1] === '>') { depth--; i += 2; if (depth === 0) break; continue; }
        i++;
      }
      continue;
    }
    if (c === '[') {
      const arr = [];
      i++;
      while (i < n && src[i] !== ']') {
        const cc = src[i];
        if (cc === ' ' || cc === '\n' || cc === '\r' || cc === '\t') { i++; continue; }
        if (cc === '(') { const r = decodeLiteral(src, i + 1); arr.push({ text: r.text, glyph: false }); i = r.next; continue; }
        if (cc === '<') { const r = decodeHex(src, i + 1); arr.push({ text: r.text, glyph: true, hex: r.hex }); i = r.next; continue; }
        let s = '';
        while (i < n && /[-+.\d]/.test(src[i])) { s += src[i]; i++; }
        if (s) arr.push(parseFloat(s)); else i++;
      }
      i++;
      ops.push({ array: arr });
      continue;
    }
    if (c === '/') { let name = '/'; i++; while (i < n && !/[\s()<>\[\]{}\/%]/.test(src[i])) { name += src[i]; i++; } ops.push(name); continue; }
    if (/[-+.\d]/.test(c)) { let s = ''; while (i < n && /[-+.\deE]/.test(src[i])) { s += src[i]; i++; } ops.push(parseFloat(s)); continue; }
    let op = '';
    while (i < n && !/[\s()<>\[\]{}\/%]/.test(src[i]) && !/[-+.\d]/.test(src[i])) { op += src[i]; i++; }
    if (!op) { i++; continue; }

    switch (op) {
      case 'q': ctmStack.push(ctm.slice()); break;
      case 'Q': ctm = ctmStack.pop() || MAT_ID.slice(); break;
      case 'cm': { const a = ops.slice(-6).map(num); if (a.length === 6) ctm = matMul(a, ctm); break; }
      case 'BT': tm = MAT_ID.slice(); tlm = MAT_ID.slice(); break;
      case 'Tf': {
        fontSize = num(ops[ops.length - 1]);
        const nm = String(ops[ops.length - 2] || '').replace(/^\//, '');
        currentFont = fonts.get(nm) || null;
        break;
      }
      case 'TL': leading = num(ops[ops.length - 1]); break;
      case 'Td': { const tx = num(ops[ops.length - 2]); const ty = num(ops[ops.length - 1]); tlm = matMul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); break; }
      case 'TD': { const tx = num(ops[ops.length - 2]); const ty = num(ops[ops.length - 1]); leading = -ty; tlm = matMul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); break; }
      case 'Tm': { const a = ops.slice(-6).map(num); if (a.length === 6) { tlm = a.slice(); tm = a.slice(); } break; }
      case 'T*': tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); break;
      case 'Tj': { const s = ops[ops.length - 1]; if (s && s.str) emit(s.text, s.glyph, s.hex); break; }
      case 'TJ': { const a = ops[ops.length - 1]; if (a && a.array) showArray(a.array); break; }
      case "'": { tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); const s = ops[ops.length - 1]; if (s && s.str) emit(s.text, s.glyph, s.hex); break; }
      case '"': { tlm = matMul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); const s = ops[ops.length - 1]; if (s && s.str) emit(s.text, s.glyph, s.hex); break; }
      default: break;
    }
    ops.length = 0;
  }
  return runs;
}

// ---- page discovery --------------------------------------------------------

function parseMediaBox(dict) {
  const m = dict.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])] : null;
}

function refsFromContents(dict) {
  const m = dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
  if (!m) return [];
  const refs = [];
  const re = /(\d+)\s+\d+\s+R/g;
  let r;
  while ((r = re.exec(m[1]))) refs.push(Number(r[1]));
  return refs;
}

function collectPageObjects(objs) {
  const pages = [];
  for (const obj of objs.values()) if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.dict)) pages.push(obj);
  if (!pages.length) {
    for (const obj of objs.values()) if (/\/Contents/.test(obj.dict) && /\/MediaBox/.test(obj.dict)) pages.push(obj);
  }
  return pages;
}

function resolveMediaBox(pageObj, objs) {
  let cur = pageObj, guard = 0;
  while (cur && guard++ < 32) {
    const box = parseMediaBox(cur.dict);
    if (box) return box;
    const pm = cur.dict.match(/\/Parent\s+(\d+)\s+\d+\s+R/);
    if (!pm) break;
    cur = objs.get(Number(pm[1]));
  }
  return [0, 0, 612, 792];
}

// ---- reflow runs -> monospaced lines ---------------------------------------

// Place positioned runs onto a character grid so column alignment (essential
// for tab) survives. Character width is estimated from font size.
function runsToLines(runs) {
  if (!runs.length) return [];
  const rows = new Map();
  for (const r of runs) {
    const y = Math.round(r.y);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(r);
  }
  // Estimate the character cell width from the tightest inter-glyph gaps on each
  // row (i.e. the spacing between adjacent digits of a fret number), so
  // multi-digit frets stay joined and note gaps scale sensibly.
  const gaps = [];
  for (const list of rows.values()) {
    const xs = list.map((r) => r.x).sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) { const d = xs[k] - xs[k - 1]; if (d > 1) gaps.push(d); }
  }
  gaps.sort((a, b) => a - b);
  const cw = gaps.length ? Math.max(2, gaps[Math.floor(gaps.length * 0.15)]) : ((runs[0].size || 6) * 0.5);
  const ys = [...rows.keys()].sort((a, b) => a - b); // top-left origin: small y = top
  const lines = [];
  for (const y of ys) {
    const items = rows.get(y).sort((a, b) => a.x - b.x);
    const minX = items[0].x;
    const chars = [];
    for (const it of items) {
      const col = Math.max(0, Math.round((it.x - minX) / cw));
      for (let k = 0; k < it.text.length; k++) chars[col + k] = it.text[k];
    }
    let line = '';
    for (let k = 0; k < chars.length; k++) line += chars[k] || ' ';
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

/**
 * Extract PDF content as reflowed monospaced text (best-effort).
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<string>}
 */
export async function pdfToText(input) {
  const bytes = toUint8(input);
  const latin1 = bytesToLatin1(bytes);
  if (!latin1.startsWith('%PDF')) throw new Error('pdfText: not a PDF file');

  const objs = scanObjects(latin1, bytes);
  const pageObjs = collectPageObjects(objs);
  const out = [];

  for (const pageObj of pageObjs) {
    const box = resolveMediaBox(pageObj, objs);
    const height = box[3] - box[1];
    const fonts = await buildFontCMaps(pageObj, objs, bytes);
    let combined = '';
    for (const ref of refsFromContents(pageObj.dict)) {
      const sbytes = await getStreamBytes(objs.get(ref), bytes);
      if (sbytes) combined += bytesToLatin1(sbytes) + '\n';
    }
    if (!combined) continue;
    out.push(...runsToLines(interpretText(combined, height, fonts)), '');
  }

  // Fallback: no page objects — interpret every text-bearing content stream.
  if (!out.length) {
    let combined = '';
    for (const obj of objs.values()) {
      if (!obj.stream || !hasFlate(obj.dict)) continue;
      const sbytes = await getStreamBytes(obj, bytes);
      if (!sbytes) continue;
      const txt = bytesToLatin1(sbytes);
      if (/\bBT\b|\bTj\b|\bTJ\b/.test(txt)) combined += txt + '\n';
    }
    if (combined) out.push(...runsToLines(interpretText(combined, null)));
  }

  return out.join('\n');
}
