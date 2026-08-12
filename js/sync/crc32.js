import { crc32 } from './zip.js';

/** Stream a Blob and return a CRC32 checksum as an unsigned 32-bit integer. */
export async function crc32Blob(blob) {
  if (!blob) return 0;
  let running = 0xffffffff;
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) running = crc32(value, running);
    }
    return (running ^ 0xffffffff) >>> 0;
  }
  const buf = await blob.arrayBuffer();
  return (crc32(new Uint8Array(buf), running) ^ 0xffffffff) >>> 0;
}

/** Format a CRC32 integer as 8 lowercase hex digits. */
export function crc32Hex(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}
