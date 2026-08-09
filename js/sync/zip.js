/**
 * Streaming ZIP read/write for Musi exercise library export/import.
 *
 * Produces standards-compliant archives with per-entry STORE (0) or DEFLATE (8),
 * UTF-8 names, streaming data descriptors (GP bit 3), and ZIP64 when any size,
 * offset, or entry count exceeds 32-bit limits.
 *
 * Default compression: DEFLATE unless the extension names an already-compressed
 * container (not merely a related format) — pass `compress` to override.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_DATA_DESC = 0x08074b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const FLAG_UTF8 = 0x0800;
const FLAG_DATA_DESC = 0x0008;

const ZIP64_EXTRA_ID = 0x0001;

const MAX_U32 = 0xffffffff;
const MAX_U16 = 0xffff;

/**
 * Extensions whose on-disk bytes are already in a compressed container — default STORE.
 * Principle: "already-compressed container" vs "raw bytes". GP5/GP4/GP3 are proprietary
 * binary (not ZIP); WAV is PCM; GPIF is XML text — those deflate well. Only GP7+ .gp
 * (ZIP) and GP6 .gpx (BCFZ) belong here among Guitar Pro formats.
 */
const NO_COMPRESS_EXTENSIONS = new Set([
  'gp', 'gpx',
  'mp3', 'mp4', 'm4a', 'ogg', 'flac', 'aac', 'wma',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
  'zip', 'gz', 'bz2', 'xz', '7z', 'rar',
  // PDF object streams are usually Flate-compressed; re-deflating rarely helps much.
  'pdf',
  'woff', 'woff2',
]);

let crcTable = null;

function getCrcTable() {
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
  return crcTable;
}

/**
 * Incremental IEEE CRC-32 (PKZIP). Pass previous result as `seed` (pre-inverted).
 * @param {Uint8Array} bytes
 * @param {number} [seed=0xffffffff]
 * @returns {number} running CRC (pre-inverted; finalize with ^ 0xffffffff)
 */
export function crc32(bytes, seed) {
  const table = getCrcTable();
  let crc = seed !== undefined ? (seed >>> 0) : 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  if (seed !== undefined) {
    return crc >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function finalizeCrc(running) {
  return (running ^ 0xffffffff) >>> 0;
}

function u16le(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32le(n) {
  const b = new Uint8Array(4);
  const v = n >>> 0;
  b[0] = v & 0xff;
  b[1] = (v >>> 8) & 0xff;
  b[2] = (v >>> 16) & 0xff;
  b[3] = (v >>> 24) & 0xff;
  return b;
}

function u64le(n) {
  const b = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 0; i < 8; i += 1) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

function readU16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function readU32(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function readU64(buf, off) {
  const lo = BigInt(readU32(buf, off));
  const hi = BigInt(readU32(buf, off + 4));
  return (hi << 32n) | lo;
}

function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function defaultCompress(name) {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return true;
  const ext = name.slice(dot + 1).toLowerCase();
  return !NO_COMPRESS_EXTENSIONS.has(ext);
}

/**
 * Validate and normalize a ZIP entry path. Rejects absolute paths and `..`.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeEntryName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('ZIP entry name is required');
  }
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error('ZIP entry path must be relative');
  }
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') {
      throw new Error('ZIP entry path must not contain ".." segments');
    }
    if (part === '' && parts.length > 1) {
      throw new Error('ZIP entry path must not contain empty segments');
    }
  }
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('ZIP entry name is required');
  }
  return normalized;
}

function toDosDateTime(ms) {
  const d = new Date(ms);
  const year = d.getFullYear();
  if (year < 1980) {
    return { time: 0, date: 0 };
  }
  const time = ((d.getHours() & 0x1f) << 11)
    | ((d.getMinutes() & 0x3f) << 5)
    | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((year - 1980) & 0x7f) << 9)
    | (((d.getMonth() + 1) & 0x0f) << 5)
    | (d.getDate() & 0x1f);
  return { time, date };
}

function dataToStream(data) {
  if (data instanceof ReadableStream) return data;
  if (data instanceof Blob) return data.stream();
  if (data instanceof ArrayBuffer) return new Blob([data]).stream();
  if (ArrayBuffer.isView(data)) return new Blob([data]).stream();
  throw new Error('ZIP entry data must be a Blob, ArrayBuffer, Uint8Array, or ReadableStream');
}

async function readSlice(source, offset, length) {
  const slice = source.slice(offset, offset + length);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

function needsZip64ForEntry(uncompressedSize, compressedSize) {
  return uncompressedSize > MAX_U32 || compressedSize > MAX_U32;
}

function buildLocalExtraZip64(uncompressedSize, compressedSize) {
  const fields = [];
  if (uncompressedSize > MAX_U32) fields.push(u64le(uncompressedSize));
  if (compressedSize > MAX_U32) fields.push(u64le(compressedSize));
  if (fields.length === 0) return new Uint8Array(0);
  const payload = concat(...fields);
  return concat(u16le(ZIP64_EXTRA_ID), u16le(payload.length), payload);
}

function buildCentralExtraZip64(uncompressedSize, compressedSize, localHeaderOffset) {
  const fields = [];
  if (uncompressedSize > MAX_U32) fields.push(u64le(uncompressedSize));
  if (compressedSize > MAX_U32) fields.push(u64le(compressedSize));
  if (localHeaderOffset > MAX_U32) fields.push(u64le(localHeaderOffset));
  if (fields.length === 0) return new Uint8Array(0);
  const payload = concat(...fields);
  return concat(u16le(ZIP64_EXTRA_ID), u16le(payload.length), payload);
}

function buildLocalHeader({
  nameBytes, method, flags, dosTime, dosDate, entryZip64,
}) {
  const extra = entryZip64
    ? buildLocalExtraZip64(MAX_U32 + 1, MAX_U32 + 1)
    : new Uint8Array(0);
  return concat(
    u32le(SIG_LOCAL),
    u16le(entryZip64 ? 45 : 20),
    u16le(flags),
    u16le(method),
    u16le(dosTime),
    u16le(dosDate),
    u32le(0),
    u32le(entryZip64 ? MAX_U32 : 0),
    u32le(entryZip64 ? MAX_U32 : 0),
    u16le(nameBytes.length),
    u16le(extra.length),
    nameBytes,
    extra,
  );
}

function buildDataDescriptor(crc, compressedSize, uncompressedSize, entryZip64) {
  if (entryZip64) {
    return concat(
      u32le(SIG_DATA_DESC),
      u32le(crc),
      u64le(compressedSize),
      u64le(uncompressedSize),
    );
  }
  return concat(
    u32le(SIG_DATA_DESC),
    u32le(crc),
    u32le(compressedSize),
    u32le(uncompressedSize),
  );
}

function buildCentralHeader({
  nameBytes, method, flags, dosTime, dosDate,
  crc, compressedSize, uncompressedSize, localHeaderOffset, entryZip64, archiveZip64,
}) {
  const extra = (entryZip64 || archiveZip64)
    ? buildCentralExtraZip64(
      entryZip64 ? uncompressedSize : 0,
      entryZip64 ? compressedSize : 0,
      archiveZip64 ? localHeaderOffset : 0,
    )
    : new Uint8Array(0);

  const crcVal = crc >>> 0;
  const comp32 = entryZip64 ? MAX_U32 : (compressedSize >>> 0);
  const uncomp32 = entryZip64 ? MAX_U32 : (uncompressedSize >>> 0);
  const offset32 = archiveZip64 ? MAX_U32 : (localHeaderOffset >>> 0);

  return concat(
    u32le(SIG_CENTRAL),
    u16le(45),
    u16le(entryZip64 ? 45 : 20),
    u16le(flags),
    u16le(method),
    u16le(dosTime),
    u16le(dosDate),
    u32le(crcVal),
    u32le(comp32),
    u32le(uncomp32),
    u16le(nameBytes.length),
    u16le(extra.length),
    u16le(0),
    u16le(0),
    u16le(0),
    u32le(0),
    u32le(offset32),
    nameBytes,
    extra,
  );
}

/**
 * Create a streaming ZIP writer.
 * @returns {{ stream: ReadableStream<Uint8Array>, addFile: Function, close: Function }}
 */
export function createZipWriter() {
  const entries = [];
  let offset = 0;
  let closed = false;
  let streamController = null;
  const pendingChunks = [];
  let streamWaiting = false;
  let streamError = null;

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
      flushPending();
    },
    pull() {
      flushPending();
    },
    cancel() {
      closed = true;
    },
  });

  function flushPending() {
    if (!streamController || streamError) return;
    while (pendingChunks.length > 0) {
      streamController.enqueue(pendingChunks.shift());
    }
    if (streamWaiting && pendingChunks.length === 0) {
      streamWaiting = false;
      if (resolveDrain) resolveDrain();
      resolveDrain = null;
    }
  }

  let resolveDrain = null;

  function waitForDrain() {
    return new Promise((resolve) => {
      if (pendingChunks.length === 0) {
        resolve();
        return;
      }
      streamWaiting = true;
      resolveDrain = resolve;
      flushPending();
    });
  }

  function emit(bytes) {
    pendingChunks.push(bytes);
    offset += bytes.length;
    flushPending();
  }

  async function processEntryData(data, compress) {
    const sourceStream = dataToStream(data);
    let runningCrc = 0xffffffff;
    let uncompressedSize = 0;
    let compressedSize = 0;

    if (compress) {
      const deflater = new CompressionStream('deflate-raw');
      const writer = deflater.writable.getWriter();
      const reader = deflater.readable.getReader();
      const sourceReader = sourceStream.getReader();

      const pumpIn = (async () => {
        try {
          while (true) {
            const { done, value } = await sourceReader.read();
            if (done) break;
            runningCrc = crc32(value, runningCrc);
            uncompressedSize += value.length;
            await writer.write(value);
          }
        } finally {
          sourceReader.releaseLock();
          await writer.close();
        }
      })();

      const pumpOut = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            compressedSize += value.length;
            emit(value);
            if (pendingChunks.length > 16) {
              await waitForDrain();
            }
          }
        } finally {
          reader.releaseLock();
        }
      })();

      await Promise.all([pumpIn, pumpOut]);
    } else {
      const sourceReader = sourceStream.getReader();
      try {
        while (true) {
          const { done, value } = await sourceReader.read();
          if (done) break;
          runningCrc = crc32(value, runningCrc);
          uncompressedSize += value.length;
          compressedSize += value.length;
          emit(value);
          if (pendingChunks.length > 16) {
            await waitForDrain();
          }
        }
      } finally {
        sourceReader.releaseLock();
      }
    }

    return {
      crc: finalizeCrc(runningCrc),
      uncompressedSize,
      compressedSize,
    };
  }

  async function addFile({ name, data, lastModified = Date.now(), compress }) {
    if (closed) throw new Error('ZIP writer is already closed');
    if (data == null) throw new Error('ZIP entry data is required');

    const safeName = sanitizeEntryName(name);
    const useCompress = compress !== undefined ? Boolean(compress) : defaultCompress(safeName);
    const method = useCompress ? METHOD_DEFLATE : METHOD_STORE;
    const nameBytes = new TextEncoder().encode(safeName);
    const { time: dosTime, date: dosDate } = toDosDateTime(lastModified);
    const flags = FLAG_UTF8 | FLAG_DATA_DESC;

    const localHeaderOffset = offset;
    const header = buildLocalHeader({
      nameBytes,
      method,
      flags,
      dosTime,
      dosDate,
      entryZip64: false,
    });
    emit(header);

    const sizes = await processEntryData(data, useCompress);
    const entryZip64 = needsZip64ForEntry(sizes.uncompressedSize, sizes.compressedSize);
    const desc = buildDataDescriptor(
      sizes.crc,
      sizes.compressedSize,
      sizes.uncompressedSize,
      entryZip64,
    );
    emit(desc);

    entries.push({
      name: safeName,
      nameBytes,
      method,
      flags,
      dosTime,
      dosDate,
      crc: sizes.crc,
      compressedSize: sizes.compressedSize,
      uncompressedSize: sizes.uncompressedSize,
      localHeaderOffset,
      entryZip64,
    });

    return {
      name: safeName,
      method,
      compressedSize: sizes.compressedSize,
      uncompressedSize: sizes.uncompressedSize,
      crc32: sizes.crc,
    };
  }

  async function close() {
    if (closed) throw new Error('ZIP writer is already closed');
    closed = true;

    const centralDirOffset = offset;
    let centralDirSize = 0;
    const totalEntries = entries.length;
    const archiveZip64 = centralDirOffset > MAX_U32
      || totalEntries > MAX_U16
      || entries.some((e) => e.entryZip64);

    for (const entry of entries) {
      const cd = buildCentralHeader({
        nameBytes: entry.nameBytes,
        method: entry.method,
        flags: entry.flags,
        dosTime: entry.dosTime,
        dosDate: entry.dosDate,
        crc: entry.crc,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        localHeaderOffset: entry.localHeaderOffset,
        entryZip64: entry.entryZip64,
        archiveZip64,
      });
      emit(cd);
      centralDirSize += cd.length;
    }

    const needsZip64Eocd = archiveZip64 || centralDirSize > MAX_U32;

    if (needsZip64Eocd) {
      const zip64EocdOffset = offset;
      const zip64Eocd = concat(
        u32le(SIG_ZIP64_EOCD),
        u64le(44),
        u16le(45),
        u16le(45),
        u32le(0),
        u32le(0),
        u64le(totalEntries),
        u64le(totalEntries),
        u64le(centralDirSize),
        u64le(centralDirOffset),
      );
      emit(zip64Eocd);

      const locator = concat(
        u32le(SIG_ZIP64_LOCATOR),
        u32le(0),
        u64le(zip64EocdOffset),
        u32le(1),
      );
      emit(locator);
    }

    const eocd = concat(
      u32le(SIG_EOCD),
      u16le(0),
      u16le(0),
      u16le(needsZip64Eocd ? MAX_U16 : totalEntries),
      u16le(needsZip64Eocd ? MAX_U16 : totalEntries),
      u32le(needsZip64Eocd ? MAX_U32 : centralDirSize),
      u32le(needsZip64Eocd ? MAX_U32 : centralDirOffset),
      u16le(0),
    );
    emit(eocd);

    flushPending();
    if (streamController && !streamError) {
      streamController.close();
    }
  }

  return { stream, addFile, close };
}

function parseZip64Extra(extra, needsUncomp, needsComp, needsOffset) {
  let off = 0;
  let uncompressedSize = null;
  let compressedSize = null;
  let localHeaderOffset = null;

  while (off + 4 <= extra.length) {
    const id = readU16(extra, off);
    const size = readU16(extra, off + 2);
    off += 4;
    if (off + size > extra.length) break;
    if (id === ZIP64_EXTRA_ID) {
      let fieldOff = off;
      if (needsUncomp) {
        if (fieldOff + 8 > off + size) throw new Error('This archive is incomplete or corrupt');
        uncompressedSize = readU64(extra, fieldOff);
        fieldOff += 8;
      }
      if (needsComp) {
        if (fieldOff + 8 > off + size) throw new Error('This archive is incomplete or corrupt');
        compressedSize = readU64(extra, fieldOff);
        fieldOff += 8;
      }
      if (needsOffset) {
        if (fieldOff + 8 > off + size) throw new Error('This archive is incomplete or corrupt');
        localHeaderOffset = readU64(extra, fieldOff);
      }
    }
    off += size;
  }

  return { uncompressedSize, compressedSize, localHeaderOffset };
}

function dosToMs(dosTime, dosDate) {
  const second = (dosTime & 0x1f) * 2;
  const minute = (dosTime >> 5) & 0x3f;
  const hour = (dosTime >> 11) & 0x1f;
  const day = dosDate & 0x1f;
  const month = ((dosDate >> 5) & 0x0f) - 1;
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  return new Date(year, month, day, hour, minute, second).getTime();
}

/**
 * List entries from a ZIP archive (central directory only).
 * @param {Blob|File} source
 * @returns {Promise<Array<{name,size,compressedSize,crc32,method,offset,lastModified}>>}
 */
export async function readZipEntries(source) {
  if (!source || typeof source.size !== 'number') {
    throw new Error('ZIP source must be a Blob or File');
  }
  if (source.size < 22) {
    throw new Error('This archive is incomplete or corrupt');
  }

  const tailLen = Math.min(source.size, 0xffff + 22);
  const tail = await readSlice(source, source.size - tailLen, tailLen);

  let eocdIdx = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (readU32(tail, i) === SIG_EOCD) {
      eocdIdx = i;
      break;
    }
  }
  if (eocdIdx < 0) {
    throw new Error('This archive is incomplete or corrupt');
  }

  const eocd = tail.subarray(eocdIdx);
  const diskEntries = readU16(eocd, 8);
  const totalEntries = readU16(eocd, 10);
  let centralDirSize = readU32(eocd, 12);
  let centralDirOffset = readU32(eocd, 16);
  const commentLen = readU16(eocd, 20);
  const eocdAbsOffset = source.size - tailLen + eocdIdx;

  if (eocdAbsOffset + 22 + commentLen > source.size) {
    throw new Error('This archive is incomplete or corrupt');
  }

  let entryCount = totalEntries;

  if (diskEntries === MAX_U16 || totalEntries === MAX_U16
    || centralDirSize === MAX_U32 || centralDirOffset === MAX_U32) {
    if (eocdAbsOffset < 20) {
      throw new Error('This archive is incomplete or corrupt');
    }
    const locator = await readSlice(source, eocdAbsOffset - 20, 20);
    if (readU32(locator, 0) !== SIG_ZIP64_LOCATOR) {
      throw new Error('This archive is incomplete or corrupt');
    }
    const zip64EocdOffset = readU64(locator, 8);
    const zip64Eocd = await readSlice(source, Number(zip64EocdOffset), 56);
    if (readU32(zip64Eocd, 0) !== SIG_ZIP64_EOCD) {
      throw new Error('This archive is incomplete or corrupt');
    }
    entryCount = Number(readU64(zip64Eocd, 32));
    centralDirSize = Number(readU64(zip64Eocd, 40));
    centralDirOffset = Number(readU64(zip64Eocd, 48));
  }

  if (entryCount < 0 || centralDirSize < 0 || centralDirOffset < 0
    || centralDirOffset + centralDirSize > source.size) {
    throw new Error('This archive is incomplete or corrupt');
  }

  const centralDir = await readSlice(source, centralDirOffset, centralDirSize);
  const entries = [];
  let off = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (off + 46 > centralDir.length) {
      throw new Error('This archive is incomplete or corrupt');
    }
    if (readU32(centralDir, off) !== SIG_CENTRAL) {
      throw new Error('This archive is incomplete or corrupt');
    }

    const versionNeeded = readU16(centralDir, off + 6);
    const flags = readU16(centralDir, off + 8);
    const method = readU16(centralDir, off + 10);
    const dosTime = readU16(centralDir, off + 12);
    const dosDate = readU16(centralDir, off + 14);
    let crc = readU32(centralDir, off + 16);
    let compressedSize = readU32(centralDir, off + 20);
    let uncompressedSize = readU32(centralDir, off + 24);
    const nameLen = readU16(centralDir, off + 28);
    const extraLen = readU16(centralDir, off + 30);
    const commentLen = readU16(centralDir, off + 32);
    let localHeaderOffset = readU32(centralDir, off + 42);

    if (off + 46 + nameLen + extraLen + commentLen > centralDir.length) {
      throw new Error('This archive is incomplete or corrupt');
    }

    const nameBytes = centralDir.subarray(off + 46, off + 46 + nameLen);
    const extra = centralDir.subarray(off + 46 + nameLen, off + 46 + nameLen + extraLen);
    const name = new TextDecoder().decode(nameBytes);

    try {
      sanitizeEntryName(name);
    } catch (e) {
      throw new Error('This archive contains unsafe entry paths');
    }

    const needsUncomp = uncompressedSize === MAX_U32;
    const needsComp = compressedSize === MAX_U32;
    const needsOffset = localHeaderOffset === MAX_U32;
    if (needsUncomp || needsComp || needsOffset || versionNeeded >= 45) {
      const zip64 = parseZip64Extra(extra, needsUncomp, needsComp, needsOffset);
      if (needsUncomp && zip64.uncompressedSize != null) uncompressedSize = Number(zip64.uncompressedSize);
      if (needsComp && zip64.compressedSize != null) compressedSize = Number(zip64.compressedSize);
      if (needsOffset && zip64.localHeaderOffset != null) localHeaderOffset = Number(zip64.localHeaderOffset);
    }

    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      throw new Error(`This archive uses unsupported compression (method ${method})`);
    }

    entries.push({
      name,
      size: uncompressedSize,
      compressedSize,
      crc32: crc,
      method,
      offset: localHeaderOffset,
      lastModified: dosToMs(dosTime, dosDate),
      flags,
    });

    off += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function readLocalHeader(source, entry) {
  const fixed = await readSlice(source, entry.offset, 30);
  if (readU32(fixed, 0) !== SIG_LOCAL) {
    throw new Error('This archive is incomplete or corrupt');
  }
  const flags = readU16(fixed, 6);
  const nameLen = readU16(fixed, 26);
  const extraLen = readU16(fixed, 28);
  const headerSize = 30 + nameLen + extraLen;
  if (entry.offset + headerSize > source.size) {
    throw new Error('This archive is incomplete or corrupt');
  }
  return { flags, dataOffset: entry.offset + headerSize };
}

/**
 * Extract one entry, verifying CRC-32 and uncompressed size.
 * @param {Blob|File} source
 * @param {{ name, size, compressedSize, crc32, method, offset }} entry
 * @returns {Promise<Blob>}
 */
export async function extractZipEntry(source, entry) {
  if (!source || !entry) {
    throw new Error('ZIP source and entry are required');
  }

  const { dataOffset } = await readLocalHeader(source, entry);
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > source.size) {
    throw new Error('This archive is incomplete or corrupt');
  }

  const compressedSlice = source.slice(dataOffset, dataEnd);
  let runningCrc = 0xffffffff;
  let totalBytes = 0;

  if (entry.method === METHOD_STORE) {
    const stream = compressedSlice.stream();
    const reader = stream.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        runningCrc = crc32(value, runningCrc);
        totalBytes += value.length;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const finalCrc = finalizeCrc(runningCrc);
    if (totalBytes !== entry.size) {
      throw new Error('This archive is incomplete or corrupt (size mismatch)');
    }
    if (finalCrc !== entry.crc32) {
      throw new Error('This archive is incomplete or corrupt (checksum mismatch)');
    }
    return new Blob(chunks, { type: 'application/octet-stream' });
  }

  if (entry.method === METHOD_DEFLATE) {
    const inflater = new DecompressionStream('deflate-raw');
    const outStream = compressedSlice.stream().pipeThrough(inflater);
    const reader = outStream.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        runningCrc = crc32(value, runningCrc);
        totalBytes += value.length;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const finalCrc = finalizeCrc(runningCrc);
    if (totalBytes !== entry.size) {
      throw new Error('This archive is incomplete or corrupt (size mismatch)');
    }
    if (finalCrc !== entry.crc32) {
      throw new Error('This archive is incomplete or corrupt (checksum mismatch)');
    }
    return new Blob(chunks, { type: 'application/octet-stream' });
  }

  throw new Error(`This archive uses unsupported compression (method ${entry.method})`);
}
