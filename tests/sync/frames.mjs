/**
 * Zero-dependency Node tests for Musi QR sync framing.
 * Run: node tests/sync/frames.mjs
 */

import assert from 'node:assert/strict';
import {
  FRAME_MAGIC,
  DEFAULT_CHUNK_BYTES,
  crc32,
  encodePayload,
  decodePayload,
  buildFrames,
  createFrameCollector,
  estimateTransfer,
} from '../../js/sync/frames.js';

let passed = 0;

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    });
  }
  passed += 1;
  console.log(`ok  ${name}`);
  return Promise.resolve();
}

function makeLargeObject(targetBytes) {
  const rows = [];
  let size = 0;
  let i = 0;
  while (size < targetBytes) {
    const row = {
      id: `ex-${i}`,
      title: `Exercise ${i}`,
      tags: ['technique', 'scales', 'warmup'],
      notes: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      meta: { bpm: 120 + (i % 40), key: 'C', mode: 'major' },
    };
    rows.push(row);
    size += JSON.stringify(row).length;
    i += 1;
  }
  return { version: 1, exportedAt: '2026-08-09T00:00:00.000Z', exercises: rows };
}

async function run() {
  await test('crc32 known vector', () => {
    const bytes = new TextEncoder().encode('123456789');
    assert.equal(crc32(bytes), 0xcbf43926);
  });

  await test('encodePayload/decodePayload small object round trip', async () => {
    const value = { theme: 'gbc', tempo: 96, tracks: ['lead', 'rhythm'] };
    const bytes = await encodePayload(value);
    const out = await decodePayload(bytes);
    assert.deepEqual(out, value);
  });

  await test('encodePayload/decodePayload large object compresses', async () => {
    const value = makeLargeObject(300 * 1024);
    const raw = new TextEncoder().encode(JSON.stringify(value));
    const bytes = await encodePayload(value);
    assert.ok(bytes.length < raw.length * 0.5, 'gzip should shrink JSON by at least 2x');
    const out = await decodePayload(bytes);
    assert.equal(out.version, value.version);
    assert.equal(out.exercises.length, value.exercises.length);
  });

  await test('encodePayload/decodePayload non-ASCII and emoji', async () => {
    const value = { label: 'Niño', chord: 'CΔ7', note: '𝄞', mood: '🎸🔥' };
    const bytes = await encodePayload(value);
    const out = await decodePayload(bytes);
    assert.deepEqual(out, value);
  });

  await test('buildFrames collector reproduces exact bytes in order', async () => {
    const payload = await encodePayload({ hello: 'sync', n: 42, items: [1, 2, 3] });
    const { frames } = buildFrames(payload);
    const collector = createFrameCollector();

    for (let i = 0; i < frames.length - 1; i += 1) {
      const res = collector.accept(frames[i]);
      assert.equal(res.ok, true);
      assert.equal(res.done, false);
      assert.equal(collector.result(), null);
    }

    const last = collector.accept(frames[frames.length - 1]);
    assert.equal(last.ok, true);
    assert.equal(last.done, true);
    const rebuilt = collector.result();
    assert.ok(rebuilt);
    assert.deepEqual(Array.from(rebuilt), Array.from(payload));
  });

  await test('out-of-order and duplicate delivery reassembles', async () => {
    const payload = await encodePayload(makeLargeObject(40 * 1024));
    const { frames } = buildFrames(payload);
    const collector = createFrameCollector();

    const order = [...frames.keys()].sort((a, b) => ((a % 2) - (b % 2)) || (b - a));
    for (const idx of order) {
      collector.accept(frames[idx]);
      collector.accept(frames[idx]);
    }

    assert.equal(collector.progress().have, frames.length);
    assert.deepEqual(Array.from(collector.result()), Array.from(payload));
  });

  await test('different session id is rejected with error', async () => {
    const a = await encodePayload({ ...makeLargeObject(12 * 1024), salt: 'session-a' });
    const b = await encodePayload({ ...makeLargeObject(12 * 1024), salt: 'session-b' });
    const fa = buildFrames(a);
    const fb = buildFrames(b);
    assert.ok(fa.total > 1 && fb.total > 1);
    assert.notEqual(fa.checksum, fb.checksum);

    const collector = createFrameCollector();
    assert.equal(collector.accept(fa.frames[0]).ok, true);
    const clash = collector.accept(fb.frames[0]);
    assert.equal(clash.ok, false);
    assert.match(clash.error, /session/i);
    assert.equal(collector.progress().have, 1);

    for (let i = 1; i < fa.frames.length; i += 1) {
      collector.accept(fa.frames[i]);
    }
    assert.deepEqual(Array.from(collector.result()), Array.from(a));
  });

  await test('corrupted chunk CRC is rejected', async () => {
    const payload = await encodePayload({ corrupt: true, data: 'x'.repeat(2000) });
    const { frames } = buildFrames(payload);
    const bad = frames[0].replace(/\|[0-9a-f]{8}\|([A-Za-z0-9_-]+)$/, '|00000000|$1');
    const collector = createFrameCollector();
    const res = collector.accept(bad);
    assert.equal(res.ok, false);
    assert.match(res.error, /checksum/i);
  });

  await test('foreign text is ignored quietly', () => {
    const collector = createFrameCollector();
    for (const text of ['https://example.com', '', 'NOTOURS|1/1|1|deadbeef|AAAA']) {
      const res = collector.accept(text);
      assert.equal(res.ok, false);
      assert.equal(res.error, null);
      assert.equal(res.accepted, false);
    }
  });

  await test('missing() reports withheld sequence numbers', async () => {
    const payload = await encodePayload(makeLargeObject(8 * 1024));
    const { frames, total } = buildFrames(payload);
    const collector = createFrameCollector();
    collector.accept(frames[0]);
    if (total > 2) collector.accept(frames[total - 1]);

    const missing = collector.missing();
    assert.ok(missing.includes(2));
    assert.ok(!missing.includes(1));
    if (total > 2) assert.ok(!missing.includes(total));
    assert.equal(missing.length, total - (total > 2 ? 2 : 1));
  });

  await test('single-frame payload works', async () => {
    const payload = await encodePayload({ tiny: true });
    const { frames, total } = buildFrames(payload);
    assert.equal(total, 1);
    const collector = createFrameCollector();
    const res = collector.accept(frames[0]);
    assert.equal(res.done, true);
    assert.deepEqual(Array.from(collector.result()), Array.from(payload));
  });

  await test('payload on exact chunk boundary works', async () => {
    const seed = new Uint8Array(DEFAULT_CHUNK_BYTES * 2);
    const chunkBytes = Math.ceil(seed.length / buildFrames(seed).total);
    const raw = new Uint8Array(chunkBytes * 2);
    for (let i = 0; i < raw.length; i += 1) raw[i] = i & 0xff;
    const { frames, total } = buildFrames(raw, { chunkBytes });
    assert.equal(total, 2);
    const collector = createFrameCollector();
    for (const frame of frames) collector.accept(frame);
    assert.deepEqual(Array.from(collector.result()), Array.from(raw));
  });

  await test('every frame encodes within QR version budget', async () => {
    let encodeQrMatrix;
    try {
      ({ encodeQrMatrix } = await import('../../js/qr/qrEncode.js'));
    } catch (e) {
      console.log('skip  every frame encodes within QR version budget (qr encoder unavailable)');
      return;
    }

    const payload = await encodePayload(makeLargeObject(250 * 1024));
    const { frames } = buildFrames(payload);
    assert.ok(frames.length > 5, 'expected multiple frames for large payload');

    for (const frame of frames) {
      assert.ok(frame.startsWith(`${FRAME_MAGIC}|`));
      const matrix = encodeQrMatrix(frame, { ecc: 'M', maxVersion: 25 });
      assert.ok(matrix, `frame should fit in QR: len=${frame.length}`);
      assert.ok(matrix.version >= 1 && matrix.version <= 22, `version ${matrix.version} out of range`);
    }
  });

  await test('estimateTransfer frames match buildFrames for compressed payloads', async () => {
    const sizes = [
      { label: 'single frame', bytes: await encodePayload({ tiny: true }) },
      { label: 'few frames', bytes: await encodePayload(makeLargeObject(50 * 1024)) },
      { label: 'many frames', bytes: await encodePayload(makeLargeObject(250 * 1024)) },
      { label: 'mid size', bytes: await encodePayload(makeLargeObject(8 * 1024)) },
      { label: 'raw boundary', bytes: new Uint8Array(DEFAULT_CHUNK_BYTES * 3) },
    ];

    for (const { label, bytes } of sizes) {
      const built = buildFrames(bytes);
      const est = estimateTransfer(bytes.length, { fps: 10 });
      assert.equal(est.frames, built.total, `${label}: frame count must match`);
      assert.ok(est.chunkBytes >= 1);
      assert.ok(est.frames >= 1);
      assert.equal(est.passes, 1.25);
      assert.equal(est.seconds, (est.frames / 10) * est.passes);
    }
  });

  await test('estimateTransfer reports realistic compressed figures', async () => {
    const examples = [
      { label: '5 KB JSON', obj: makeLargeObject(5 * 1024) },
      { label: '50 KB JSON', obj: makeLargeObject(50 * 1024) },
      { label: '250 KB JSON', obj: makeLargeObject(250 * 1024) },
    ];

    for (const { label, obj } of examples) {
      const compressed = await encodePayload(obj);
      const built = buildFrames(compressed);
      const est = estimateTransfer(compressed.length, { fps: 10 });
      assert.equal(est.frames, built.total);
      console.log(`    ${label}: ${compressed.length} B compressed -> ${est.frames} frames, chunk ${est.chunkBytes} B, ~${est.seconds.toFixed(1)}s (${est.passes} passes)`);
    }
  });

  console.log(`\n${passed} tests passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
