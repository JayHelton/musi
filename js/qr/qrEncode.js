/**
 * QR Code encoder (ISO/IEC 18004) — byte mode, versions 1–25, ECC L/M/Q/H.
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

function rsEncode(data, ecCount) {
  const divisor = getRsDivisor(ecCount);
  const ecc = new Array(ecCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ ecc.shift();
    ecc.push(0);
    for (let j = 0; j < divisor.length; j++) {
      ecc[j] ^= gfMul(divisor[j], factor);
    }
  }
  return Uint8Array.from(ecc);
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

function getNumDataCodewords(version, ecc) {
  const ei = ECC_INDEX[ecc];
  return Math.floor(getNumRawDataModules(version) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ei][version] * NUM_ERROR_CORRECTION_BLOCKS[ei][version];
}

function countBitsForVersion(version) {
  return version <= 9 ? 8 : 16;
}

/**
 * Max number of byte-mode data bytes at version + ECC.
 */
export function qrCapacityBytes(version, ecc) {
  if (version < 1 || version > 25) return 0;
  if (ECC_INDEX[ecc] === undefined) return 0;
  const dataCw = getNumDataCodewords(version, ecc);
  const countBits = countBitsForVersion(version);
  return Math.floor((dataCw * 8 - 4 - countBits - 4) / 8);
}

function buildBitStream(bytes, version) {
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, countBitsForVersion(version));
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
  pushBits(0, 4);
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < codewords.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i * 8 + j] || 0);
    codewords[i] = b;
  }
  return codewords;
}

function padCodewords(codewords, totalDataCw) {
  const out = new Uint8Array(totalDataCw);
  out.set(codewords.subarray(0, Math.min(codewords.length, totalDataCw)));
  let pad = 0xec;
  for (let i = codewords.length; i < totalDataCw; i++) {
    out[i] = pad;
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return out;
}

function addEccAndInterleave(data, version, ecc) {
  const ei = ECC_INDEX[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ei][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ei][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = Array.from(data.subarray(offset, offset + dataLen));
    offset += dataLen;
    const eccBytes = Array.from(rsEncode(new Uint8Array(dat), blockEccLen));
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(eccBytes));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i === shortBlockLen - blockEccLen && j < numShortBlocks) continue;
      result.push(blocks[j][i]);
    }
  }
  return result;
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

function setModule(modules, size, row, col, dark) {
  modules[row * size + col] = dark ? 1 : 0;
}

function drawFinder(modules, size, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      let dark = false;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        dark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
      setModule(modules, size, rr, cc, dark);
    }
  }
}

function drawAlignment(modules, size, centerRow, centerCol) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      setModule(modules, size, centerRow + r, centerCol + c, dark);
    }
  }
}

function placeFunctionPatterns(modules, size, version) {
  modules.fill(0);
  drawFinder(modules, size, 0, 0);
  drawFinder(modules, size, 0, size - 7);
  drawFinder(modules, size, size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(modules, size, 6, i, dark);
    setModule(modules, size, i, 6, dark);
  }

  setModule(modules, size, size - 8, 8, true);

  const positions = ALIGNMENT_POSITIONS[version];
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      const r = positions[i];
      const c = positions[j];
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) {
        continue;
      }
      drawAlignment(modules, size, r, c);
    }
  }
}

function placeFormatInfo(modules, size, formatBits) {
  const set = (row, col, bit) => {
    if (row === size - 8 && col === 8) return;
    setModule(modules, size, row, col, bit === 1);
  };
  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> i) & 1;
    if (i <= 5) set(8, i, bit);
    else if (i === 6) set(8, 7, bit);
    else if (i === 7) set(8, 8, bit);
    else if (i === 8) set(7, 8, bit);
    else set(14 - i, 8, bit);
  }
  for (let i = 0; i < 8; i++) {
    const bit = (formatBits >> i) & 1;
    set(size - 1 - i, 8, bit);
  }
  for (let i = 8; i < 15; i++) {
    const bit = (formatBits >> i) & 1;
    set(8, size - 15 + i, bit);
  }
}

function placeVersionInfo(modules, size, versionBits) {
  for (let i = 0; i < 18; i++) {
    const bit = (versionBits >> i) & 1;
    const row = Math.floor(i / 3);
    const col = i % 3;
    setModule(modules, size, row, size - 11 + col, bit === 1);
    setModule(modules, size, size - 11 + col, row, bit === 1);
  }
}

function placeDataBits(modules, size, version, codewords, mask) {
  const totalBits = Math.floor(getNumRawDataModules(version) / 8) * 8;
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
        let dark = 0;
        if (bitIdx < totalBits) {
          const byteIdx = Math.floor(bitIdx / 8);
          const bitInByte = 7 - (bitIdx % 8);
          dark = (codewords[byteIdx] >> bitInByte) & 1;
        }
        if (getMaskBit(mask, row, c)) dark ^= 1;
        setModule(modules, size, row, c, dark === 1);
        bitIdx++;
      }
    }
    upward = !upward;
    col -= 2;
  }
}

function penaltyN1(modules, size) {
  let score = 0;
  for (let row = 0; row < size; row++) {
    let runColor = modules[row * size];
    let runLen = 1;
    for (let col = 1; col < size; col++) {
      const color = modules[row * size + col];
      if (color === runColor) runLen++;
      else {
        if (runLen >= 5) score += runLen - 2;
        runColor = color;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen - 2;
  }
  for (let col = 0; col < size; col++) {
    let runColor = modules[col];
    let runLen = 1;
    for (let row = 1; row < size; row++) {
      const color = modules[row * size + col];
      if (color === runColor) runLen++;
      else {
        if (runLen >= 5) score += runLen - 2;
        runColor = color;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += runLen - 2;
  }
  return score;
}

function penaltyN2(modules, size) {
  let score = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const i = row * size + col;
      const c = modules[i];
      if (c === modules[i + 1] && c === modules[i + size] && c === modules[i + size + 1]) score += 3;
    }
  }
  return score;
}

function penaltyN3(modules, size) {
  let score = 0;
  const pattern = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size - 11; col++) {
      let match = true;
      for (let k = 0; k < 11; k++) {
        if (modules[row * size + col + k] !== pattern[k]) { match = false; break; }
      }
      if (match) score += 40;
    }
  }
  for (let col = 0; col < size; col++) {
    for (let row = 0; row <= size - 11; row++) {
      let match = true;
      for (let k = 0; k < 11; k++) {
        if (modules[row * size + col + k * size] !== pattern[k]) { match = false; break; }
      }
      if (match) score += 40;
    }
  }
  return score;
}

function penaltyN4(modules, size) {
  let dark = 0;
  for (let i = 0; i < size * size; i++) dark += modules[i];
  const total = size * size;
  const percent = Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total);
  return percent * 10;
}

function maskPenalty(modules, size) {
  return penaltyN1(modules, size) * 3
    + penaltyN2(modules, size) * 3
    + penaltyN3(modules, size) * 40
    + penaltyN4(modules, size) * 10;
}

function getFormatBits(ecc, mask) {
  return FORMAT_INFO[ECC_INDEX[ecc] * 8 + mask];
}

function buildMatrix(version, ecc, dataCw) {
  const size = version * 4 + 17;
  const interleaved = addEccAndInterleave(dataCw, version, ecc);

  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = null;

  for (let mask = 0; mask < 8; mask++) {
    const modules = new Uint8Array(size * size);
    placeFunctionPatterns(modules, size, version);
    placeFormatInfo(modules, size, getFormatBits(ecc, mask));
    setModule(modules, size, size - 8, 8, true);
    if (version >= 7) placeVersionInfo(modules, size, getVersionInfoBits(version));
    placeDataBits(modules, size, version, interleaved, mask);
    const pen = maskPenalty(modules, size);
    if (pen < bestPenalty) {
      bestPenalty = pen;
      bestMask = mask;
      bestModules = modules;
    }
  }

  return { size, version, ecc, mask: bestMask, modules: bestModules };
}

/**
 * Encode text into a QR symbol. Returns null if text cannot fit in maxVersion.
 */
export function encodeQrMatrix(text, { ecc = 'M', minVersion = 1, maxVersion = 25 } = {}) {
  if (typeof text !== 'string') return null;
  if (!ECC_INDEX.hasOwnProperty(ecc)) throw new Error(`Unknown ECC level: ${ecc}`);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) throw new Error(`Non-byte character at index ${i}: U+${code.toString(16)}`);
    bytes[i] = code;
  }

  for (let version = minVersion; version <= maxVersion; version++) {
    const cap = qrCapacityBytes(version, ecc);
    if (bytes.length > cap) continue;
    const totalDataCw = getNumDataCodewords(version, ecc);
    const payload = buildBitStream(bytes, version);
    const dataCw = padCodewords(payload, totalDataCw);
    return buildMatrix(version, ecc, dataCw);
  }
  return null;
}

/**
 * Render a QR matrix onto a canvas element.
 */
export function drawQrToCanvas(canvas, matrix, {
  moduleSize = 0,
  quietZone = 4,
  dark = '#000000',
  light = '#ffffff',
} = {}) {
  if (!canvas || !matrix || !matrix.modules) return;
  const { size, modules } = matrix;
  const totalModules = size + quietZone * 2;
  if (!moduleSize || moduleSize <= 0) {
    const w = canvas.width || canvas.clientWidth || 256;
    moduleSize = Math.max(1, Math.floor(w / totalModules));
  }
  const px = totalModules * moduleSize;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules[row * size + col]) {
        ctx.fillRect(
          (col + quietZone) * moduleSize,
          (row + quietZone) * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }
}
