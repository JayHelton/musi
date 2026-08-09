/**
 * Zero-dependency Node tests for QR encode/decode.
 * Run: node tests/qr/run.mjs
 */

import assert from 'node:assert/strict';
import {
  encodeQrMatrix,
  qrCapacityBytes,
  drawQrToCanvas,
} from '../../js/qr/qrEncode.js';
import {
  decodeQrFromMatrix,
  decodeQrFromImageData,
  decodeQrFromImageDataAffine,
} from '../../js/qr/qrDecode.js';

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function mulberry32(seed) {
  return function next() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomPayload(rng, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += B64URL[Math.floor(rng() * B64URL.length)];
  }
  return s;
}

test('qrCapacityBytes matches spec values', () => {
  assert.equal(qrCapacityBytes(1, 'L'), 17);
  assert.equal(qrCapacityBytes(1, 'H'), 7);
  assert.equal(qrCapacityBytes(10, 'L'), 271);
  assert.equal(qrCapacityBytes(10, 'M'), 213);
  assert.equal(qrCapacityBytes(25, 'L'), 1273);
});

test('matrix structure: size, finders, dark module', () => {
  const m = encodeQrMatrix('hello', { ecc: 'M', minVersion: 1 });
  assert.ok(m);
  assert.equal(m.size, m.version * 4 + 17);
  const { size, modules } = m;
  const isDark = (r, c) => modules[r * size + c] === 1;
  assert.ok(isDark(0, 0) && isDark(0, 6) && isDark(6, 0));
  assert.ok(isDark(0, size - 7) && isDark(0, size - 1) && isDark(6, size - 7));
  assert.ok(isDark(size - 7, 0) && isDark(size - 1, 0) && isDark(size - 7, 6));
  assert.ok(isDark(size - 8, 8));
});

const ECC_LEVELS = ['L', 'M', 'Q', 'H'];
const VERSION_SAMPLES = [1, 2, 3, 5, 7, 10, 14, 18, 22, 25];

test('round-trip matrix decode for ECC levels and versions', () => {
  const rng = mulberry32(42);
  for (const ecc of ECC_LEVELS) {
    for (const version of VERSION_SAMPLES) {
      const cap = qrCapacityBytes(version, ecc);
      const sizes = [1, Math.min(3, cap), cap];
      for (const len of sizes) {
        if (len < 1 || len > cap) continue;
        const text = randomPayload(rng, len);
        const matrix = encodeQrMatrix(text, { ecc, minVersion: version, maxVersion: version });
        assert.ok(matrix, `encode failed v${version} ${ecc} len=${len}`);
        const decoded = decodeQrFromMatrix(matrix);
        assert.equal(decoded, text, `v${version} ${ecc} len=${len}`);
      }
    }
  }
});

test('Reed-Solomon corrects flipped data modules', () => {
  const text = randomPayload(mulberry32(99), 40);
  const matrix = encodeQrMatrix(text, { ecc: 'H', minVersion: 5, maxVersion: 5 });
  assert.ok(matrix);
  const { size, modules } = matrix;
  const flipped = modules.slice();
  let flips = 0;
  const budget = 8;
  for (let row = 9; row < size - 9 && flips < budget; row++) {
    for (let col = 9; col < size - 9 && flips < budget; col++) {
      if (row === 6 || col === 6) continue;
      const i = row * size + col;
      flipped[i] ^= 1;
      flips++;
    }
  }
  const decoded = decodeQrFromMatrix({ size, modules: flipped });
  assert.equal(decoded, text);
});

function renderSyntheticImage(matrix, {
  modulePx = 6,
  quietZone = 4,
  noise = 12,
  gradient = true,
  rotate = 0,
} = {}) {
  const { size, modules } = matrix;
  const total = size + quietZone * 2;
  const w = total * modulePx;
  const h = total * modulePx;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const grad = gradient ? (x / w) * 40 + (y / h) * 20 : 0;
      const mx = Math.floor(x / modulePx) - quietZone;
      const my = Math.floor(y / modulePx) - quietZone;
      let dark = 0;
      if (mx >= 0 && my >= 0 && mx < size && my < size) {
        dark = modules[my * size + mx];
      }
      const base = dark ? 30 : 220;
      const n = (Math.random() - 0.5) * noise;
      const v = Math.max(0, Math.min(255, base + grad + n));
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  if (rotate === 0) return { width: w, height: h, data };
  const rotW = rotate % 180 === 0 ? w : h;
  const rotH = rotate % 180 === 0 ? h : w;
  const out = new Uint8ClampedArray(rotW * rotH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx; let ny;
      if (rotate === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (rotate === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else if (rotate === 270) {
        nx = y;
        ny = w - 1 - x;
      } else {
        nx = x;
        ny = y;
      }
      const si = (y * w + x) * 4;
      const di = (ny * rotW + nx) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = 255;
    }
  }
  return { width: rotW, height: rotH, data: out };
}

function renderFlatQrImage(matrix, {
  modulePx = 6,
  quietZone = 4,
  noise = 8,
  gradient = false,
} = {}) {
  const { size, modules } = matrix;
  const total = size + quietZone * 2;
  const w = total * modulePx;
  const h = total * modulePx;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const grad = gradient ? (x / w) * 40 + (y / h) * 20 : 0;
      const mx = Math.floor(x / modulePx) - quietZone;
      const my = Math.floor(y / modulePx) - quietZone;
      let dark = 0;
      if (mx >= 0 && my >= 0 && mx < size && my < size) {
        dark = modules[my * size + mx];
      }
      const base = dark ? 30 : 220;
      const n = (Math.random() - 0.5) * noise;
      const v = Math.max(0, Math.min(255, base + grad + n));
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function solveHomographyTest(srcPts, dstPts) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = srcPts[i];
    const [x, y] = dstPts[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const n = 8;
  const m = A.map((row) => row.slice());
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(m[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(m[row][col]);
      if (v > best) {
        best = v;
        pivot = row;
      }
    }
    if (best < 1e-12) return null;
    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [x[col], x[pivot]] = [x[pivot], x[col]];
    }
    const div = m[col][col];
    for (let j = col; j < n; j++) m[col][j] /= div;
    x[col] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (factor === 0) continue;
      for (let j = col; j < n; j++) m[row][j] -= factor * m[col][j];
      x[row] -= factor * x[col];
    }
  }
  x.push(1);
  return x;
}

function invertHomography(H) {
  const a = H[0]; const b = H[1]; const c = H[2];
  const d = H[3]; const e = H[4]; const f = H[5];
  const g = H[6]; const h = H[7]; const i = H[8];
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, Hh / det, I / det];
}

function renderProjectiveQrImage(matrix, {
  modulePx = 8,
  quietZone = 6,
  noise = 6,
  pitchDeg = 0,
  yawDeg = 0,
  focal = 1200,
} = {}) {
  const { size, modules } = matrix;
  const total = size + quietZone * 2;
  const w = total * modulePx;
  const h = total * modulePx;
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;

  const rotate = (x, y, z) => {
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const y1 = y * cosP - z * sinP;
    const z1 = y * sinP + z * cosP;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;
    return { x: x2, y: y1, z: z2 };
  };

  const project = (sx, sy) => {
    const p = rotate(sx - cx, sy - cy, 0);
    const camZ = focal + p.z;
    if (camZ <= 1) return null;
    return {
      x: (focal * p.x) / camZ + cx,
      y: (focal * p.y) / camZ + cy,
    };
  };

  const srcCorners = [[0, 0], [w, 0], [0, h], [w, h]];
  const dstCorners = srcCorners.map(([sx, sy]) => {
    const p = project(sx, sy);
    return p ? [p.x, p.y] : [sx, sy];
  });
  const Hinv = invertHomography(solveHomographyTest(srcCorners, dstCorners));
  if (!Hinv) return renderFlatQrImage(matrix, { modulePx, quietZone, noise });

  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const denom = Hinv[6] * x + Hinv[7] * y + Hinv[8];
      if (Math.abs(denom) < 1e-9) {
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
        data[p + 3] = 255;
        continue;
      }
      const sx = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / denom;
      const sy = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / denom;
      const mx = Math.floor(sx / modulePx) - quietZone;
      const my = Math.floor(sy / modulePx) - quietZone;
      let dark = 0;
      if (mx >= 0 && my >= 0 && mx < size && my < size) {
        dark = modules[my * size + mx];
      }
      const base = dark ? 30 : 220;
      const n = (Math.random() - 0.5) * noise;
      const v = Math.max(0, Math.min(255, base + n));
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

test('projective warp decode (homography) on version 10+', () => {
  const text = randomPayload(mulberry32(2026), 120);
  const matrix = encodeQrMatrix(text, { ecc: 'M', minVersion: 10, maxVersion: 10 });
  assert.ok(matrix);
  const cases = [
    { pitchDeg: 12, yawDeg: 0, label: 'mild pitch (~12°)' },
    { pitchDeg: 0, yawDeg: 12, label: 'mild yaw (~12°)' },
    { pitchDeg: 30, yawDeg: 0, label: 'aggressive pitch (~30°)' },
    { pitchDeg: 12, yawDeg: 12, label: 'combined tilt' },
  ];
  for (const c of cases) {
    const image = renderProjectiveQrImage(matrix, {
      pitchDeg: c.pitchDeg,
      yawDeg: c.yawDeg,
      noise: 5,
    });
    const decoded = decodeQrFromImageData(image);
    assert.equal(decoded, text, c.label);
  }
});

test('homography beats affine on strong perspective warp', () => {
  const text = randomPayload(mulberry32(3030), 100);
  const matrix = encodeQrMatrix(text, { ecc: 'M', minVersion: 10, maxVersion: 10 });
  assert.ok(matrix);
  const warped = renderProjectiveQrImage(matrix, { pitchDeg: 30, yawDeg: 0, noise: 4 });
  const hom = decodeQrFromImageData(warped);
  const aff = decodeQrFromImageDataAffine(warped);
  assert.equal(hom, text, 'homography should decode strong pitch warp');
  assert.equal(aff, null, 'affine-only should fail on strong pitch warp');
});

test('version 1 still decodes with affine fallback (no alignment pattern)', () => {
  const text = 'v1-fallback';
  const matrix = encodeQrMatrix(text, { ecc: 'L', minVersion: 1, maxVersion: 1 });
  const image = renderProjectiveQrImage(matrix, { pitchDeg: 12, yawDeg: 8, noise: 4 });
  const decoded = decodeQrFromImageData(image);
  assert.equal(decoded, text);
});

test('image pipeline with noise, gradient, and rotations', () => {
  const text = 'sync-payload-abc123XYZ';
  const matrix = encodeQrMatrix(text, { ecc: 'M', minVersion: 4, maxVersion: 4 });
  assert.ok(matrix);
  for (const rot of [0, 90, 180, 270]) {
    const image = renderSyntheticImage(matrix, { rotate: rot });
    const decoded = decodeQrFromImageData(image);
    assert.equal(decoded, text, `rotation ${rot}`);
  }
});

test('decodeQrFromImageData rejects blank noise image', () => {
  const w = 200;
  const h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    const v = 128 + Math.floor(Math.random() * 40 - 20);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  const result = decodeQrFromImageData({ width: w, height: h, data });
  assert.equal(result, null);
});

test('drawQrToCanvas sets canvas dimensions', () => {
  const matrix = encodeQrMatrix('x', { ecc: 'L' });
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 200,
    getContext() {
      const calls = [];
      return {
        fillStyle: '#000',
        fillRect(x, y, w, h) { calls.push({ x, y, w, h }); },
      };
    },
  };
  drawQrToCanvas(canvas, matrix, { moduleSize: 4, quietZone: 4 });
  const expected = (matrix.size + 8) * 4;
  assert.equal(canvas.width, expected);
  assert.equal(canvas.height, expected);
});

// Benchmark rough decode time
const benchMatrix = encodeQrMatrix(randomPayload(mulberry32(7), 80), { ecc: 'M', minVersion: 8 });
const benchImage = renderSyntheticImage(benchMatrix, { modulePx: 5, quietZone: 4, noise: 10 });
const t0 = performance.now();
const ITERS = 30;
for (let i = 0; i < ITERS; i++) decodeQrFromImageData(benchImage);
const perFrame = (performance.now() - t0) / ITERS;

console.log(`\n${passed} tests passed`);
console.log(`approx decode: ${perFrame.toFixed(2)} ms/frame (${benchImage.width}x${benchImage.height})`);
