/**
 * QR Code decoder (ISO/IEC 18004) — byte mode primary, versions 1–25.
 */

const ECC_LEVELS = ['L', 'M', 'Q', 'H'];
const ECC_INDEX = { L: 0, M: 1, Q: 2, H: 3 };

const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALIGNMENT_POSITIONS = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
];

const FORMAT_INFO = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c45, 0x6972,
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f5, 0x40c2, 0x4f99, 0x4aae,
  0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b0, 0x21a7, 0x2efe, 0x2bc9,
  0x1de6, 0x18d1, 0x1718, 0x120f, 0x0cb9, 0x098e, 0x06d5, 0x03e2,
];

function getVersionInfoBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function decodeVersionBits(raw18) {
  let best = null;
  let bestDist = 99;
  for (let v = 7; v <= 25; v++) {
    const bits = getVersionInfoBits(v);
    let dist = 0;
    let x = raw18 ^ bits;
    for (let i = 0; i < 18; i++) {
      if (x & 1) dist++;
      x >>= 1;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = { version: v, dist };
    }
  }
  if (!best || best.dist > 3) return null;
  return best.version;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDiv(a, b) {
  if (b === 0) throw new Error('division by zero');
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] - GF_LOG[b] + 255) % 255];
}

function polyEval(poly, x) {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) {
    y = gfMul(y, x) ^ poly[i];
  }
  return y;
}

function getNumRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}


function hammingDistance15(a, b) {
  let x = a ^ b;
  let d = 0;
  while (x) {
    d += x & 1;
    x >>= 1;
  }
  return d;
}

function decodeFormatBits(raw15) {
  let best = null;
  let bestDist = 99;
  for (let ei = 0; ei < 4; ei++) {
    for (let mask = 0; mask < 8; mask++) {
      const bits = FORMAT_INFO[ei * 8 + mask];
      const dist = hammingDistance15(raw15, bits);
      if (dist < bestDist) {
        bestDist = dist;
        best = { ecc: ECC_LEVELS[ei], mask, dist };
      }
    }
  }
  if (!best || best.dist > 3) return null;
  return best;
}

function getMaskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return false;
  }
}

function isVersionInfoCell(size, version, row, col) {
  if (version < 7) return false;
  const base = size - 11;
  if (col >= base && col < base + 3 && row < 6) return true;
  if (row >= base && row < base + 3 && col < 6) return true;
  return false;
}

function isReserved(size, row, col, version = 0) {
  if (row < 9 && col < 9) return true;
  if (row < 9 && col >= size - 8) return true;
  if (row >= size - 8 && col < 9) return true;
  if (row === 6 || col === 6) return true;
  if (isVersionInfoCell(size, version, row, col)) return true;
  return false;
}

function readFormatFromMatrix(modules, size) {
  const readBits = (coords) => {
    let bits = 0;
    for (let i = 0; i < coords.length; i++) {
      const [r, c] = coords[i];
      bits |= (modules[r * size + c] & 1) << i;
    }
    return bits;
  };
  const coordsA = [];
  for (let i = 0; i <= 5; i++) coordsA.push([8, i]);
  coordsA.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) coordsA.push([14 - i, 8]);

  const coordsB = [];
  for (let i = 0; i < 8; i++) coordsB.push([size - 1 - i, 8]);
  for (let i = 8; i < 15; i++) coordsB.push([8, size - 15 + i]);

  const da = decodeFormatBits(readBits(coordsA));
  const db = decodeFormatBits(readBits(coordsB));
  if (da && db) return da.dist <= db.dist ? da : db;
  return da || db;
}

function readVersionFromMatrix(modules, size) {
  const readBits = (flip) => {
    let bits = 0;
    for (let i = 0; i < 18; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const r = flip ? size - 11 + col : row;
      const c = flip ? row : size - 11 + col;
      bits |= (modules[r * size + c] & 1) << i;
    }
    return bits;
  };
  return decodeVersionBits(readBits(false)) || decodeVersionBits(readBits(true));
}

function extractRawBits(modules, size, version) {
  const totalBits = Math.floor(getNumRawDataModules(version) / 8) * 8;
  const bits = [];
  let bitIdx = 0;
  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col--;
    const cols = [col, col - 1];
    const rowStart = upward ? size - 1 : 0;
    const rowEnd = upward ? -1 : size;
    const step = upward ? -1 : 1;
    for (let row = rowStart; row !== rowEnd; row += step) {
      for (const c of cols) {
        if (isReserved(size, row, c, version)) continue;
        if (bitIdx < totalBits) bits.push(modules[row * size + c] & 1);
        bitIdx++;
      }
    }
    upward = !upward;
    col -= 2;
  }
  return bits;
}

function bitsToCodewords(bits) {
  const out = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return out;
}

function deinterleave(codewords, version, ecc) {
  const ei = ECC_INDEX[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ei][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ei][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  for (let j = 0; j < numBlocks; j++) {
    const dataLen = shortBlockLen - blockEccLen + (j < numShortBlocks ? 0 : 1);
    const blockLen = dataLen + blockEccLen + (j < numShortBlocks ? 1 : 0);
    blocks.push(new Array(blockLen).fill(0));
  }

  let idx = 0;
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i >= blocks[j].length) continue;
      if (i === shortBlockLen - blockEccLen && j < numShortBlocks) continue;
      blocks[j][i] = codewords[idx++];
    }
  }

  const dataBlocks = [];
  for (let j = 0; j < numBlocks; j++) {
    const dataLen = shortBlockLen - blockEccLen + (j < numShortBlocks ? 0 : 1);
    const data = blocks[j].slice(0, dataLen);
    const ec = blocks[j].slice(blocks[j].length - blockEccLen);
    dataBlocks.push({ data, ec, ecLen: blockEccLen });
  }
  return dataBlocks;
}

function rsGeneratorDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

const RS_GEN_CACHE = new Map();

function getRsDivisor(degree) {
  if (!RS_GEN_CACHE.has(degree)) {
    RS_GEN_CACHE.set(degree, rsGeneratorDivisor(degree));
  }
  return RS_GEN_CACHE.get(degree);
}
function rsSyndromes(block, ecLen) {
  const synd = new Uint8Array(ecLen);
  for (let i = 0; i < ecLen; i++) {
    let s = 0;
    const root = GF_EXP[i];
    for (let j = 0; j < block.length; j++) {
      s = gfMul(s, root) ^ block[j];
    }
    synd[i] = s;
  }
  return synd;
}

function berlekampMassey(synd) {
  const n = synd.length;
  const C = new Uint8Array(n + 1);
  const B = new Uint8Array(n + 1);
  C[0] = 1;
  B[0] = 1;
  let L = 0;
  let m = 1;
  let b = 1;
  for (let r = 0; r < n; r++) {
    let d = synd[r];
    for (let i = 1; i <= L; i++) {
      d ^= gfMul(C[i], synd[r - i]);
    }
    if (d === 0) {
      m++;
    } else if (2 * L <= r) {
      const T = C.slice();
      const coef = gfDiv(d, b);
      for (let i = 0; i <= n - m; i++) {
        C[i + m] ^= gfMul(coef, B[i]);
      }
      L = r + 1 - L;
      B.set(T);
      b = d;
      m = 1;
    } else {
      const coef = gfDiv(d, b);
      for (let i = 0; i <= n - m; i++) {
        C[i + m] ^= gfMul(coef, B[i]);
      }
      m++;
    }
  }
  return C.subarray(0, L + 1);
}

function chienSearch(sigma, n) {
  const positions = [];
  for (let i = 0; i < n; i++) {
    if (polyEval(sigma, GF_EXP[i]) === 0) positions.push(n - 1 - i);
  }
  return positions;
}

function solveErrorMagnitudes(synd, positions, n) {
  const e = positions.length;
  if (e === 1) return [synd[0]];
  const mat = [];
  for (let r = 0; r < e; r++) {
    const row = [];
    for (let c = 0; c < e; c++) {
      row.push(GF_EXP[(r * (n - 1 - positions[c])) % 255]);
    }
    mat.push(row);
  }
  const vec = Array.from(synd.subarray(0, e));
  for (let col = 0; col < e; col++) {
    let pivot = col;
    for (let row = col + 1; row < e; row++) {
      if (mat[row][col] !== 0) pivot = row;
    }
    [mat[col], mat[pivot]] = [mat[pivot], mat[col]];
    [vec[col], vec[pivot]] = [vec[pivot], vec[col]];
    const div = mat[col][col];
    if (div === 0) throw new Error('singular matrix');
    for (let j = col; j < e; j++) mat[col][j] = gfDiv(mat[col][j], div);
    vec[col] = gfDiv(vec[col], div);
    for (let row = 0; row < e; row++) {
      if (row === col) continue;
      const factor = mat[row][col];
      if (factor === 0) continue;
      for (let j = col; j < e; j++) mat[row][j] ^= gfMul(factor, mat[col][j]);
      vec[row] ^= gfMul(factor, vec[col]);
    }
  }
  return vec;
}

function rsDecodeBlock(data, ec, ecLen) {
  const block = new Uint8Array(data.length + ec.length);
  block.set(data);
  block.set(ec, data.length);
  const synd = rsSyndromes(block, ecLen);
  if (synd.every((s) => s === 0)) return data.slice();

  const sigma = berlekampMassey(synd);
  const errCount = sigma.length - 1;
  if (errCount <= 0 || errCount > ecLen / 2) throw new Error('too many errors');
  const positions = chienSearch(sigma, block.length);
  if (positions.length !== errCount) throw new Error('Chien mismatch');

  const magnitudes = solveErrorMagnitudes(synd, positions, block.length);
  const corrected = Uint8Array.from(block);
  for (let k = 0; k < positions.length; k++) {
    corrected[positions[k]] ^= magnitudes[k];
  }

  const synd2 = rsSyndromes(corrected, ecLen);
  if (!synd2.every((s) => s === 0)) throw new Error('RS verify failed');
  return corrected.subarray(0, data.length);
}

function parseDataStream(bytes, version) {
  let bitPos = 0;
  const readBits = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = 7 - (bitPos % 8);
      if (byteIdx >= bytes.length) return null;
      v = (v << 1) | ((bytes[byteIdx] >> bitIdx) & 1);
      bitPos++;
    }
    return v;
  };

  const countBitsByte = version <= 9 ? 8 : 16;
  const parts = [];
  while (bitPos / 8 < bytes.length) {
    const mode = readBits(4);
    if (mode === null || mode === 0) break;
    if (mode === 0b0100) {
      const count = readBits(countBitsByte);
      if (count === null) break;
      let s = '';
      for (let i = 0; i < count; i++) {
        const b = readBits(8);
        if (b === null) return parts.join('');
        s += String.fromCharCode(b);
      }
      parts.push(s);
    } else if (mode === 0b0001) {
      const count = readBits(version <= 9 ? 10 : 12);
      if (count === null) break;
      for (let i = 0; i < count; i += 3) {
        readBits(i + 3 <= count ? 10 : 4);
      }
    } else if (mode === 0b0010) {
      const count = readBits(version <= 9 ? 9 : 11);
      if (count === null) break;
      for (let i = 0; i < count; i++) readBits(11);
    } else if (mode === 0b0111) {
      readBits(8);
    } else {
      break;
    }
  }
  return parts.join('');
}

function unmaskModules(modules, size, mask, version) {
  const out = modules.slice();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isReserved(size, row, col, version)) continue;
      if (getMaskBit(mask, row, col)) {
        const i = row * size + col;
        out[i] ^= 1;
      }
    }
  }
  return out;
}

/**
 * Decode straight from a module matrix.
 */
export function decodeQrFromMatrix({ size, modules }) {
  try {
    if (!modules || size < 21) return null;
    const versionGuess = Math.floor((size - 17) / 4);
    if (versionGuess < 1 || versionGuess > 25) return null;

    const fmt = readFormatFromMatrix(modules, size);
    if (!fmt) return null;
    const { ecc, mask } = fmt;

    let version = versionGuess;
    if (version >= 7) {
      const v = readVersionFromMatrix(modules, size);
      if (v) version = v;
    }

    const unmasked = unmaskModules(modules, size, mask, version);
    const rawBits = extractRawBits(unmasked, size, version);
    const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
    const codewords = bitsToCodewords(rawBits.slice(0, rawCodewords * 8));

    const blocks = deinterleave(codewords, version, ecc);
    const dataBytes = [];
    for (const b of blocks) {
      const corrected = rsDecodeBlock(b.data, b.ec, b.ecLen);
      for (let i = 0; i < corrected.length; i++) dataBytes.push(corrected[i]);
    }

    const payload = parseDataStream(new Uint8Array(dataBytes), version);
    return payload || null;
  } catch (e) {
    return null;
  }
}

// --- Image pipeline ---

const BIN_BLOCK = 8;

function toGrayscale(data, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return gray;
}

function adaptiveBinarize(gray, width, height) {
  const out = new Uint8Array(width * height);
  const blocksX = Math.ceil(width / BIN_BLOCK);
  const blocksY = Math.ceil(height / BIN_BLOCK);
  const thresholds = new Float32Array(blocksX * blocksY);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let sum = 0;
      let count = 0;
      const y0 = by * BIN_BLOCK;
      const x0 = bx * BIN_BLOCK;
      const y1 = Math.min(y0 + BIN_BLOCK, height);
      const x1 = Math.min(x0 + BIN_BLOCK, width);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += gray[y * width + x];
          count++;
        }
      }
      thresholds[by * blocksX + bx] = sum / count - 8;
    }
  }

  let globalSum = 0;
  for (let i = 0; i < gray.length; i++) globalSum += gray[i];
  const globalThr = globalSum / gray.length - 5;

  for (let y = 0; y < height; y++) {
    const by = Math.min(blocksY - 1, Math.floor(y / BIN_BLOCK));
    const fy = (y / BIN_BLOCK) - by;
    for (let x = 0; x < width; x++) {
      const bx = Math.min(blocksX - 1, Math.floor(x / BIN_BLOCK));
      const fx = (x / BIN_BLOCK) - bx;
      const t00 = thresholds[by * blocksX + bx];
      const t10 = thresholds[by * blocksX + Math.min(bx + 1, blocksX - 1)];
      const t01 = thresholds[Math.min(by + 1, blocksY - 1) * blocksX + bx];
      const t11 = thresholds[Math.min(by + 1, blocksY - 1) * blocksX + Math.min(bx + 1, blocksX - 1)];
      const thr = t00 * (1 - fx) * (1 - fy)
        + t10 * fx * (1 - fy)
        + t01 * (1 - fx) * fy
        + t11 * fx * fy;
      const v = gray[y * width + x];
      out[y * width + x] = v < (thr * 0.7 + globalThr * 0.3) ? 1 : 0;
    }
  }
  return out;
}

function scanHorizontalRuns(bin, width, y) {
  const runs = [];
  let color = bin[y * width];
  let len = 1;
  for (let x = 1; x < width; x++) {
    const c = bin[y * width + x];
    if (c === color) len++;
    else {
      runs.push({ color, len, start: x - len });
      color = c;
      len = 1;
    }
  }
  runs.push({ color, len, start: width - len });
  return runs;
}

function scanVerticalRuns(bin, width, height, x) {
  const runs = [];
  let color = bin[x];
  let len = 1;
  for (let y = 1; y < height; y++) {
    const c = bin[y * width + x];
    if (c === color) len++;
    else {
      runs.push({ color, len, start: y - len });
      color = c;
      len = 1;
    }
  }
  runs.push({ color, len, start: height - len });
  return runs;
}

function checkRatio(runs, idx) {
  if (idx < 0 || idx + 4 >= runs.length) return false;
  const total = runs[idx].len + runs[idx + 1].len + runs[idx + 2].len
    + runs[idx + 3].len + runs[idx + 4].len;
  if (total < 7) return false;
  const module = total / 7;
  const expected = [1, 1, 3, 1, 1].map((n) => n * module);
  const actual = [
    runs[idx].len, runs[idx + 1].len, runs[idx + 2].len,
    runs[idx + 3].len, runs[idx + 4].len,
  ];
  let err = 0;
  for (let i = 0; i < 5; i++) err += Math.abs(actual[i] - expected[i]);
  return err <= module * 1.5 && runs[idx].color === 1 && runs[idx + 2].color === 1;
}

function checkRatioRelaxed(runs, idx) {
  if (idx < 0 || idx + 4 >= runs.length) return false;
  const total = runs[idx].len + runs[idx + 1].len + runs[idx + 2].len
    + runs[idx + 3].len + runs[idx + 4].len;
  if (total < 7) return false;
  const module = total / 7;
  const expected = [1, 1, 3, 1, 1].map((n) => n * module);
  const actual = [
    runs[idx].len, runs[idx + 1].len, runs[idx + 2].len,
    runs[idx + 3].len, runs[idx + 4].len,
  ];
  let err = 0;
  for (let i = 0; i < 5; i++) err += Math.abs(actual[i] - expected[i]);
  return err <= module * 3.5 && runs[idx].color === 1 && runs[idx + 2].color === 1;
}

function mergeFinderCenters(centers) {
  const merged = [];
  for (const c of centers) {
    let found = false;
    for (const m of merged) {
      if (Math.abs(m.x - c.x) < 8 && Math.abs(m.y - c.y) < 8) {
        m.x = (m.x + c.x) / 2;
        m.y = (m.y + c.y) / 2;
        m.size = (m.size + c.size) / 2;
        m.count = (m.count || 1) + 1;
        found = true;
        break;
      }
    }
    if (!found) merged.push({ x: c.x, y: c.y, size: c.size, count: 1 });
  }
  return merged.sort((a, b) => (b.count || 1) - (a.count || 1));
}

function findFinderCenters(bin, width, height, relaxed = false) {
  const ratioFn = relaxed ? checkRatioRelaxed : checkRatio;
  const centers = [];
  const seen = new Set();

  for (let y = 0; y < height; y++) {
    const runs = scanHorizontalRuns(bin, width, y);
    for (let i = 0; i + 4 < runs.length; i++) {
      if (!ratioFn(runs, i)) continue;
      const cx = runs[i].start + (runs[i].len + runs[i + 1].len + runs[i + 2].len
        + runs[i + 3].len + runs[i + 4].len) / 2;
      const cy = y;
      const key = `${Math.round(cx / 6)}|${Math.round(cy / 6)}`;
      if (seen.has(key)) continue;
      const vr = scanVerticalRuns(bin, width, height, Math.round(cx));
      let foundV = false;
      let vcy = cy;
      const vTol = relaxed ? 12 : 6;
      for (let j = 0; j + 4 < vr.length; j++) {
        if (ratioFn(vr, j)) {
          const vy = vr[j].start + (vr[j].len + vr[j + 1].len + vr[j + 2].len
            + vr[j + 3].len + vr[j + 4].len) / 2;
          if (Math.abs(vy - cy) <= vTol) {
            foundV = true;
            vcy = vy;
            break;
          }
        }
      }
      if (!foundV) continue;
      const total = runs[i].len + runs[i + 1].len + runs[i + 2].len
        + runs[i + 3].len + runs[i + 4].len;
      centers.push({ x: cx, y: (cy + vcy) / 2, size: total / 7 });
      seen.add(key);
    }
  }
  return mergeFinderCenters(centers);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickFinderTriple(centers) {
  if (centers.length < 3) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      for (let k = j + 1; k < centers.length; k++) {
        const c = [centers[i], centers[j], centers[k]];
        const sizes = c.map((p) => p.size);
        const avgSize = (sizes[0] + sizes[1] + sizes[2]) / 3;
        if (Math.max(...sizes) - Math.min(...sizes) > avgSize * 0.5) continue;

        for (let ti = 0; ti < 3; ti++) {
          const tl = c[ti];
          const others = c.filter((_, idx) => idx !== ti);
          const p1 = others[0];
          const p2 = others[1];
          const vA = { x: p1.x - tl.x, y: p1.y - tl.y };
          const vB = { x: p2.x - tl.x, y: p2.y - tl.y };
          const lenA = dist(tl, p1);
          const lenB = dist(tl, p2);
          if (lenA < 1 || lenB < 1) continue;
          const cosAngle = (vA.x * vB.x + vA.y * vB.y) / (lenA * lenB);
          if (Math.abs(cosAngle) > 0.35) continue;

          const d12 = dist(p1, p2);
          const rightErr = Math.abs(d12 * d12 - (lenA * lenA + lenB * lenB));
          if (rightErr > d12 * d12 * 0.25) continue;

          const area = lenA * lenB * 0.5;
          const count = (tl.count || 1) + (p1.count || 1) + (p2.count || 1);
          const cr = vA.x * vB.y - vA.y * vB.x;
          let tr = p1;
          let bl = p2;
          if (cr <= 0) {
            tr = p2;
            bl = p1;
          }

          const score = area * 2 - rightErr - Math.abs(lenA - lenB) * 5
            + count * 800 - Math.abs(cosAngle) * area;
          if (score > bestScore) {
            bestScore = score;
            best = {
              tl,
              tr,
              bl,
              moduleSize: (c[0].size + c[1].size + c[2].size) / 3,
            };
          }
        }
      }
    }
  }
  return best;
}

function estimateVersion(moduleSize, tl, tr, bl) {
  const avgDist = (dist(tl, tr) + dist(tl, bl)) / 2;
  const size = Math.round(avgDist / moduleSize + 7);
  return Math.max(1, Math.min(25, Math.round((size - 17) / 4)));
}

function estimateVersionCandidates(moduleSize, tl, tr, bl) {
  const guesses = new Set();
  const add = (v) => {
    if (v >= 1 && v <= 25) guesses.add(v);
  };
  add(estimateVersion(moduleSize, tl, tr, bl));
  const dHoriz = dist(tl, tr);
  const dVert = dist(tl, bl);
  for (const d of [dHoriz, dVert, (dHoriz + dVert) / 2]) {
    const size = Math.round(d / moduleSize + 7);
    add(Math.round((size - 17) / 4));
  }
  const seed = estimateVersion(moduleSize, tl, tr, bl);
  for (let dv = -3; dv <= 3; dv++) add(seed + dv);
  return [...guesses].sort((a, b) => Math.abs(a - seed) - Math.abs(b - seed));
}

function tryHomographyDecodes(
  bin, width, height, tl, tr, bl, size, modCol, modRow, fourthPoints,
) {
  const srcPts = [
    [3.5, 3.5],
    [size - 3.5, 3.5],
    [3.5, size - 3.5],
    [modCol, modRow],
  ];
  const baseDst = [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]];
  for (const fourth of fourthPoints) {
    const dstPts = [...baseDst, fourth];
    const H = solveHomography(srcPts, dstPts);
    if (!H) continue;
    const modules = sampleMatrixHomography(bin, width, height, H, size);
    const decoded = decodeQrFromMatrix({ size, modules });
    if (decoded) return decoded;
  }
  return null;
}

function estimateAlignmentImagePos(tl, tr, bl, size, modCol, modRow) {
  const { vXx, vXy, vYx, vYy, ox, oy } = affineVectors(tl, tr, bl, size);
  const affine = affineMapPoint(ox, oy, vXx, vXy, vYx, vYy, modCol, modRow);
  const fu = (modCol - 3.5) / (size - 7);
  const fv = (modRow - 3.5) / (size - 7);
  const dirH = { x: tr.x - tl.x, y: tr.y - tl.y };
  const dirV = { x: bl.x - tl.x, y: bl.y - tl.y };
  const brGuess = lineIntersect(
    bl, { x: bl.x + dirH.x, y: bl.y + dirH.y },
    tr, { x: tr.x + dirV.x, y: tr.y + dirV.y },
  ) || affine;
  const top = { x: tl.x + fu * dirH.x, y: tl.y + fu * dirH.y };
  const bot = { x: bl.x + fu * (brGuess.x - bl.x), y: bl.y + fu * (brGuess.y - bl.y) };
  const bilinear = { x: top.x + fv * (bot.x - top.x), y: top.y + fv * (bot.y - top.y) };
  return { affine, bilinear };
}

function lineIntersect(a, b, c, d) {
  const x1 = a.x; const y1 = a.y; const x2 = b.x; const y2 = b.y;
  const x3 = c.x; const y3 = c.y; const x4 = d.x; const y4 = d.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
  const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
  return { x: px, y: py };
}

function refineFourthPointGrid(
  bin, width, height, tl, tr, bl, version, modCol, modRow, moduleSize,
) {
  const size = version * 4 + 17;
  const { affine, bilinear } = estimateAlignmentImagePos(tl, tr, bl, size, modCol, modRow);
  const span = Math.max(dist(tl, tr), dist(tl, bl));
  const centers = [affine, bilinear];
  const passes = [
    { radius: Math.max(moduleSize * 4, span * 0.28), step: Math.max(moduleSize * 1.0, 2) },
    { radius: Math.max(moduleSize * 3, span * 0.08), step: Math.max(moduleSize * 0.35, 1) },
  ];
  for (const center of centers) {
    for (const { radius, step } of passes) {
      const points = [];
      for (let dy = -radius; dy <= radius; dy += step) {
        for (let dx = -radius; dx <= radius; dx += step) {
          points.push([center.x + dx, center.y + dy]);
        }
      }
      const decoded = tryHomographyDecodes(
        bin, width, height, tl, tr, bl, size, modCol, modRow, points,
      );
      if (decoded) return decoded;
    }
  }
  return null;
}

function tryDecodeSampled(bin, width, height, tl, tr, bl, version) {
  const size = version * 4 + 17;
  const { vXx, vXy, vYx, vYy, ox, oy } = affineVectors(tl, tr, bl, size);
  const positions = ALIGNMENT_POSITIONS[version];
  if (positions && positions.length > 0) {
    const p = positions[positions.length - 1];
    const modCol = p + 0.5;
    const modRow = p + 0.5;
    const est = affineMapPoint(ox, oy, vXx, vXy, vYx, vYy, modCol, modRow);
    const { bilinear } = estimateAlignmentImagePos(tl, tr, bl, size, modCol, modRow);
    const moduleSize = (dist(tl, tr) + dist(tl, bl)) / (2 * (size - 7));
    const align = searchAlignmentNear(
      bin, width, height, tl, tr, bl, size,
      est.x, est.y, modCol, modRow, moduleSize,
    );
    const fourthPoints = [];
    if (align) fourthPoints.push([align.x, align.y]);
    fourthPoints.push([bilinear.x, bilinear.y]);
    fourthPoints.push([est.x, est.y]);
    const decoded = tryHomographyDecodes(
      bin, width, height, tl, tr, bl, size, modCol, modRow, fourthPoints,
    );
    if (decoded) return decoded;
  }
  const modules = sampleMatrixAffine(bin, width, height, tl, tr, bl, size);
  return decodeQrFromMatrix({ size, modules });
}

function tryDecodeSampledWithGrid(bin, width, height, tl, tr, bl, version) {
  const decoded = tryDecodeSampled(bin, width, height, tl, tr, bl, version);
  if (decoded) return decoded;
  const size = version * 4 + 17;
  const positions = ALIGNMENT_POSITIONS[version];
  if (!positions || positions.length === 0) return null;
  const { vXx, vXy, vYx, vYy, ox, oy } = affineVectors(tl, tr, bl, size);
  const p = positions[positions.length - 1];
  const modCol = p + 0.5;
  const modRow = p + 0.5;
  const est = affineMapPoint(ox, oy, vXx, vXy, vYx, vYy, modCol, modRow);
  const moduleSize = (dist(tl, tr) + dist(tl, bl)) / (2 * (size - 7));
  return refineFourthPointGrid(
    bin, width, height, tl, tr, bl, version, modCol, modRow, moduleSize,
  );
}

function affineVectors(tl, tr, bl, size) {
  const vXx = (tr.x - tl.x) / (size - 7);
  const vXy = (tr.y - tl.y) / (size - 7);
  const vYx = (bl.x - tl.x) / (size - 7);
  const vYy = (bl.y - tl.y) / (size - 7);
  const ox = tl.x - 3.5 * vXx - 3.5 * vYx;
  const oy = tl.y - 3.5 * vXy - 3.5 * vYy;
  return { vXx, vXy, vYx, vYy, ox, oy };
}

function affineMapPoint(ox, oy, vXx, vXy, vYx, vYy, u, v) {
  return {
    x: ox + u * vXx + v * vYx,
    y: oy + u * vXy + v * vYy,
  };
}

function gaussianSolve8(A, b) {
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
  return x;
}

/** Solve homography mapping module (u,v) -> image (x,y); h[8] normalized to 1. */
function solveHomography(srcPts, dstPts) {
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
  const h = gaussianSolve8(A, b);
  if (!h) return null;
  h.push(1);
  return h;
}

function transformPoint(H, u, v) {
  const denom = H[6] * u + H[7] * v + H[8];
  if (Math.abs(denom) < 1e-12) return null;
  return {
    x: (H[0] * u + H[1] * v + H[2]) / denom,
    y: (H[3] * u + H[4] * v + H[5]) / denom,
  };
}

function alignmentPatternDark(dr, dc) {
  return Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
}

function sampleBinAt(bin, width, height, x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return null;
  return bin[iy * width + ix];
}

function scoreAlignmentWithHomography(
  bin, width, height, tl, tr, bl, size, candX, candY, alignCol, alignRow,
) {
  const H = solveHomography(
    [
      [3.5, 3.5],
      [size - 3.5, 3.5],
      [3.5, size - 3.5],
      [alignCol, alignRow],
    ],
    [
      [tl.x, tl.y],
      [tr.x, tr.y],
      [bl.x, bl.y],
      [candX, candY],
    ],
  );
  if (!H) return -1;
  let matches = 0;
  let total = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const pt = transformPoint(H, alignCol + dc, alignRow + dr);
      if (!pt) continue;
      const bit = sampleBinAt(bin, width, height, pt.x, pt.y);
      if (bit === null) continue;
      const expect = alignmentPatternDark(dr, dc) ? 1 : 0;
      if (bit === expect) matches++;
      total++;
    }
  }
  if (total < 20) return -1;
  return matches / total;
}

function searchAlignmentNear(
  bin, width, height, tl, tr, bl, size, estX, estY, alignCol, alignRow, moduleSize,
) {
  const radius = Math.max(moduleSize * 4, 14);
  const step = Math.max(moduleSize * 0.3, 1);
  let bestScore = -1;
  let best = null;
  let bestDist = Infinity;
  const consider = (cx, cy, score) => {
    if (score < 0) return;
    const d = (cx - estX) ** 2 + (cy - estY) ** 2;
    if (score > bestScore + 0.02 || (Math.abs(score - bestScore) <= 0.02 && d < bestDist)) {
      bestScore = score;
      bestDist = d;
      best = { x: cx, y: cy };
    }
  };
  consider(estX, estY, scoreAlignmentWithHomography(
    bin, width, height, tl, tr, bl, size, estX, estY, alignCol, alignRow,
  ));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const cx = estX + dx;
      const cy = estY + dy;
      const score = scoreAlignmentWithHomography(
        bin, width, height, tl, tr, bl, size, cx, cy, alignCol, alignRow,
      );
      consider(cx, cy, score);
    }
  }
  if (!best || bestScore < 0.35) return null;
  let cx = best.x;
  let cy = best.y;
  const fineStep = Math.max(moduleSize * 0.1, 0.5);
  for (let pass = 0; pass < 2; pass++) {
    for (let dy = -fineStep * 2; dy <= fineStep * 2; dy += fineStep) {
      for (let dx = -fineStep * 2; dx <= fineStep * 2; dx += fineStep) {
        const score = scoreAlignmentWithHomography(
          bin, width, height, tl, tr, bl, size, cx + dx, cy + dy, alignCol, alignRow,
        );
        consider(cx + dx, cy + dy, score);
      }
    }
    cx = best.x;
    cy = best.y;
  }
  if (bestScore < 0.35) return null;
  return { x: best.x, y: best.y, col: alignCol, row: alignRow };
}

function sampleMatrixHomography(bin, width, height, H, size) {
  const modules = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let dark = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const u = col + 0.5 + dx * 0.35;
          const v = row + 0.5 + dy * 0.35;
          const pt = transformPoint(H, u, v);
          if (!pt) continue;
          const x = Math.round(pt.x);
          const y = Math.round(pt.y);
          if (x >= 0 && x < width && y >= 0 && y < height) {
            dark += bin[y * width + x];
            total++;
          }
        }
      }
      modules[row * size + col] = total > 0 && dark * 2 >= total ? 1 : 0;
    }
  }
  return modules;
}

function sampleMatrixAffine(bin, width, height, tl, tr, bl, size) {
  const { vXx, vXy, vYx, vYy, ox, oy } = affineVectors(tl, tr, bl, size);
  const modules = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let dark = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const fx = col + 0.5 + dx * 0.35;
          const fy = row + 0.5 + dy * 0.35;
          const ix = ox + fx * vXx + fy * vYx;
          const iy = oy + fx * vXy + fy * vYy;
          const x = Math.round(ix);
          const y = Math.round(iy);
          if (x >= 0 && x < width && y >= 0 && y < height) {
            dark += bin[y * width + x];
            total++;
          }
        }
      }
      modules[row * size + col] = total > 0 && dark * 2 >= total ? 1 : 0;
    }
  }
  return modules;
}

function decodeFromBinary(bin, width, height) {
  for (const relaxed of [false, true]) {
    const centers = findFinderCenters(bin, width, height, relaxed);
    const triple = pickFinderTriple(centers);
    if (!triple) continue;

    const { tl, tr, bl, moduleSize } = triple;
    const primary = estimateVersionCandidates(moduleSize, tl, tr, bl);
    for (const version of primary.slice(0, 4)) {
      const decoded = tryDecodeSampled(bin, width, height, tl, tr, bl, version);
      if (decoded) return decoded;
    }
    for (const version of primary.slice(0, 2)) {
      const decoded = tryDecodeSampledWithGrid(bin, width, height, tl, tr, bl, version);
      if (decoded) return decoded;
    }
    const versions = [...primary];
    for (let v = 1; v <= 25; v++) {
      if (!versions.includes(v)) versions.push(v);
    }
    for (const version of versions) {
      if (primary.slice(0, 2).includes(version)) continue;
      const decoded = tryDecodeSampled(bin, width, height, tl, tr, bl, version);
      if (decoded) return decoded;
    }
  }
  return null;
}

/**
 * Decode the first QR code found in raw image pixels.
 */
export function decodeQrFromImageData(imageData) {
  try {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
    const { width, height, data } = imageData;
    if (width < 21 || height < 21) return null;
    const gray = toGrayscale(data, width, height);
    const bin = adaptiveBinarize(gray, width, height);
    return decodeFromBinary(bin, width, height);
  } catch (e) {
    return null;
  }
}

/**
 * Test hook: image decode using affine sampling only (no homography).
 */
export function decodeQrFromImageDataAffine(imageData) {
  try {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
    const { width, height, data } = imageData;
    if (width < 21 || height < 21) return null;
    const gray = toGrayscale(data, width, height);
    const bin = adaptiveBinarize(gray, width, height);
    const centers = findFinderCenters(bin, width, height);
    const triple = pickFinderTriple(centers);
    if (!triple) return null;
    const { tl, tr, bl, moduleSize } = triple;
    const primary = estimateVersionCandidates(moduleSize, tl, tr, bl);
    const versions = [...primary];
    for (let v = 1; v <= 25; v++) {
      if (!versions.includes(v)) versions.push(v);
    }
    for (const version of versions) {
      const size = version * 4 + 17;
      const modules = sampleMatrixAffine(bin, width, height, tl, tr, bl, size);
      const decoded = decodeQrFromMatrix({ size, modules });
      if (decoded) return decoded;
    }
    return null;
  } catch (e) {
    return null;
  }
}
