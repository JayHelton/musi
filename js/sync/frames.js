/**
 * Musi QR sync — payload compression, framing, and reassembly.
 *
 * Frame text grammar (ASCII, QR byte mode):
 *   MUSI1|<sid>|<seq>/<tot>|<len>|<ccrc>|<b64>
 *
 *   MUSI1  — magic literal
 *   sid    — 8 lowercase hex digits, crc32 of the full payload (session id)
 *   seq    — 1-based frame index
 *   tot    — total frame count for this transfer
 *   len    — total payload byte length (uncompressed wire bytes after encodePayload)
 *   ccrc   — 8 lowercase hex digits, crc32 of this frame's raw chunk bytes
 *   b64    — base64url (RFC 4648 §5) of the chunk, no padding
 *
 * Compression: encodePayload JSON-stringifies, UTF-8 encodes, then gzips when
 * CompressionStream('gzip') exists. decodePayload sniffs gzip magic 0x1f 0x8b
 * and gunzips; otherwise treats bytes as raw UTF-8 JSON.
 */

import { encodeQrMatrix, qrCapacityBytes } from '../qr/qrEncode.js';

export const FRAME_MAGIC = 'MUSI1';

/** Raw chunk bytes before base64; tuned for QR v15–22 at ECC M after header expansion. */
export const DEFAULT_CHUNK_BYTES = 720;

const TARGET_QR_ECC = 'M';
const TARGET_QR_MAX_VERSION = 22;
const TRANSFER_MISS_FACTOR = 1.25;

const FRAME_PREFIX = `${FRAME_MAGIC}|`;

let crcTable = null;

function hex8(n) {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function base64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = typeof atob === 'function'
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function gzipAvailable() {
  try {
    return typeof CompressionStream === 'function';
  } catch (e) {
    return false;
  }
}

function gunzipAvailable() {
  try {
    return typeof DecompressionStream === 'function';
  } catch (e) {
    return false;
  }
}

function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function formatFrameText({ sessionId, seq, total, byteLength, chunk }) {
  const ccrc = crc32(chunk);
  return `${FRAME_PREFIX}${hex8(sessionId)}|${seq}/${total}|${byteLength}|${hex8(ccrc)}|${base64urlEncode(chunk)}`;
}

function parseFrameText(text) {
  if (typeof text !== 'string' || !text.startsWith(FRAME_PREFIX)) {
    return null;
  }
  const rest = text.slice(FRAME_PREFIX.length);
  const parts = rest.split('|');
  if (parts.length !== 5) return null;

  const sidMatch = /^[0-9a-f]{8}$/.exec(parts[0]);
  if (!sidMatch) return null;

  const seqTot = /^(\d+)\/(\d+)$/.exec(parts[1]);
  if (!seqTot) return null;
  const seq = Number(seqTot[1]);
  const total = Number(seqTot[2]);
  if (!Number.isInteger(seq) || !Number.isInteger(total) || seq < 1 || total < 1 || seq > total) {
    return null;
  }

  const byteLength = Number(parts[2]);
  if (!Number.isInteger(byteLength) || byteLength < 0) return null;

  const ccrcMatch = /^[0-9a-f]{8}$/.exec(parts[3]);
  if (!ccrcMatch) return null;

  const b64 = parts[4];
  if (!b64 || !/^[A-Za-z0-9_-]+$/.test(b64)) return null;

  let chunk;
  try {
    chunk = base64urlDecode(b64);
  } catch (e) {
    return null;
  }

  return {
    sessionId: parseInt(parts[0], 16) >>> 0,
    seq,
    total,
    byteLength,
    chunkCrc: parseInt(parts[3], 16) >>> 0,
    chunk,
  };
}

function frameFitsQr(text) {
  const matrix = encodeQrMatrix(text, {
    ecc: TARGET_QR_ECC,
    minVersion: 1,
    maxVersion: TARGET_QR_MAX_VERSION,
  });
  return matrix !== null && matrix.version <= TARGET_QR_MAX_VERSION;
}

function maxChunkForFrame({ sessionId, seq, total, byteLength }) {
  const cap = qrCapacityBytes(TARGET_QR_MAX_VERSION, TARGET_QR_ECC);
  if (!cap) return DEFAULT_CHUNK_BYTES;

  let hi = Math.min(DEFAULT_CHUNK_BYTES, byteLength || DEFAULT_CHUNK_BYTES);
  let lo = 1;
  let best = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const dummy = new Uint8Array(mid);
    const text = formatFrameText({ sessionId, seq, total, byteLength, chunk: dummy });
    if (text.length <= cap && frameFitsQr(text)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best || 1;
}

function resolveChunkBytes(bytes, requested) {
  const checksum = crc32(bytes);
  let chunkBytes = requested;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const total = Math.max(1, Math.ceil(bytes.length / chunkBytes));
    let fits = true;
    for (let seq = 1; seq <= total; seq += 1) {
      const start = (seq - 1) * chunkBytes;
      const chunk = bytes.subarray(start, Math.min(start + chunkBytes, bytes.length));
      const text = formatFrameText({
        sessionId: checksum,
        seq,
        total,
        byteLength: bytes.length,
        chunk,
      });
      if (!frameFitsQr(text)) {
        fits = false;
        break;
      }
    }
    if (fits) return chunkBytes;
    chunkBytes = Math.max(1, Math.floor(chunkBytes * 0.85));
  }

  const total = Math.max(1, Math.ceil(bytes.length / chunkBytes));
  return maxChunkForFrame({
    sessionId: checksum,
    seq: total,
    total,
    byteLength: bytes.length,
  });
}

/**
 * Shared chunk sizing for buildFrames and estimateTransfer — must stay in sync.
 * @returns {{ effectiveChunk: number, total: number }}
 */
function planFrameTransfer(bytes, { chunkBytes = DEFAULT_CHUNK_BYTES } = {}) {
  const effectiveChunk = resolveChunkBytes(bytes, chunkBytes);
  const total = Math.max(1, Math.ceil(bytes.length / effectiveChunk));
  return { effectiveChunk, total };
}

export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function encodePayload(value) {
  const json = JSON.stringify(value);
  const raw = new TextEncoder().encode(json);
  if (!gzipAvailable()) return raw;

  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    return raw;
  }
}

export async function decodePayload(bytes) {
  let payload = bytes;
  if (isGzip(bytes) && gunzipAvailable()) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const buf = await new Response(stream).arrayBuffer();
      payload = new Uint8Array(buf);
    } catch (e) {
      throw new Error('Failed to decompress payload');
    }
  }
  const text = new TextDecoder().decode(payload);
  return JSON.parse(text);
}

export function buildFrames(bytes, { chunkBytes = DEFAULT_CHUNK_BYTES } = {}) {
  const checksum = crc32(bytes);
  const { effectiveChunk, total } = planFrameTransfer(bytes, { chunkBytes });
  const frames = [];

  for (let seq = 1; seq <= total; seq += 1) {
    const start = (seq - 1) * effectiveChunk;
    const chunk = bytes.subarray(start, Math.min(start + effectiveChunk, bytes.length));
    frames.push(formatFrameText({
      sessionId: checksum,
      seq,
      total,
      byteLength: bytes.length,
      chunk,
    }));
  }

  return {
    frames,
    total,
    byteLength: bytes.length,
    checksum,
  };
}

export function createFrameCollector() {
  let sessionId = null;
  let total = 0;
  let byteLength = 0;
  const chunks = new Map();

  function progressFields() {
    const have = chunks.size;
    return {
      have,
      total,
      byteLength,
      ratio: total > 0 ? have / total : 0,
      sessionId,
    };
  }

  return {
    accept(text) {
      const parsed = parseFrameText(text);
      if (!parsed) {
        return {
          ok: false,
          accepted: false,
          done: false,
          seq: null,
          have: chunks.size,
          total,
          error: null,
        };
      }

      if (sessionId === null) {
        sessionId = parsed.sessionId;
        total = parsed.total;
        byteLength = parsed.byteLength;
      } else if (parsed.sessionId !== sessionId) {
        return {
          ok: false,
          accepted: false,
          done: false,
          seq: parsed.seq,
          have: chunks.size,
          total,
          error: 'Different transfer session — restart the sender and scan from frame 1.',
        };
      } else if (parsed.total !== total || parsed.byteLength !== byteLength) {
        return {
          ok: false,
          accepted: false,
          done: false,
          seq: parsed.seq,
          have: chunks.size,
          total,
          error: 'Inconsistent frame metadata for this session.',
        };
      }

      if (crc32(parsed.chunk) !== parsed.chunkCrc) {
        return {
          ok: false,
          accepted: false,
          done: false,
          seq: parsed.seq,
          have: chunks.size,
          total,
          error: 'Chunk checksum failed — rescan this frame.',
        };
      }

      const already = chunks.has(parsed.seq);
      if (!already) {
        chunks.set(parsed.seq, parsed.chunk);
      }

      const done = chunks.size === total;
      return {
        ok: true,
        accepted: !already,
        done,
        seq: parsed.seq,
        have: chunks.size,
        total,
        error: null,
      };
    },

    progress() {
      return progressFields();
    },

    result() {
      if (total === 0 || chunks.size !== total) return null;

      const parts = [];
      let length = 0;
      for (let seq = 1; seq <= total; seq += 1) {
        const chunk = chunks.get(seq);
        if (!chunk) return null;
        parts.push(chunk);
        length += chunk.length;
      }

      if (length !== byteLength) return null;

      const out = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }

      if (crc32(out) !== sessionId) return null;
      return out;
    },

    reset() {
      sessionId = null;
      total = 0;
      byteLength = 0;
      chunks.clear();
    },

    missing() {
      if (total === 0) return [];
      const out = [];
      for (let seq = 1; seq <= total; seq += 1) {
        if (!chunks.has(seq)) out.push(seq);
      }
      return out;
    },
  };
}

/**
 * Pre-flight transfer estimate. Pass the compressed byte length from encodePayload
 * (not the raw JSON size) so frame counts match the real beam.
 *
 * frames and chunkBytes are exact — same planFrameTransfer path as buildFrames.
 * seconds includes TRANSFER_MISS_FACTOR (1.25) as passes: receivers often miss
 * frames and must re-scan, so wall clock ≈ (frames / fps) × passes.
 */
export function estimateTransfer(byteLength, { chunkBytes = DEFAULT_CHUNK_BYTES, fps = 10 } = {}) {
  const nbytes = Math.max(0, byteLength | 0);
  const bytes = new Uint8Array(nbytes);
  const { effectiveChunk, total } = planFrameTransfer(bytes, { chunkBytes });
  const effectiveFps = fps > 0 ? fps : 10;
  const passes = TRANSFER_MISS_FACTOR;
  const seconds = (total / effectiveFps) * passes;
  return {
    frames: total,
    seconds,
    chunkBytes: effectiveChunk,
    passes,
  };
}
