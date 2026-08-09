/**
 * Zero-dependency Node tests for Musi streaming ZIP export/import.
 * Run: node tests/sync/zip.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  crc32,
  createZipWriter,
  readZipEntries,
  extractZipEntry,
  sanitizeEntryName,
} from '../../js/sync/zip.js';

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

function toolAvailable(cmd) {
  return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

async function streamToUint8Array(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function buildArchive(files) {
  const writer = createZipWriter();
  const collecting = streamToUint8Array(writer.stream);
  for (const file of files) {
    await writer.addFile(file);
  }
  await writer.close();
  const bytes = await collecting;
  return new Blob([bytes], { type: 'application/zip' });
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = (i * 1103515245 + 12345) & 0xff;
  }
  return out;
}

function makeGp5LikeBytes(size) {
  const out = new Uint8Array(size);
  const header = new TextEncoder().encode('FICHIER GUITAR PRO v5.10');
  out.set(header, 0);
  let off = header.length;
  while (off + 8 <= size) {
    out[off] = 0x00;
    out[off + 1] = 0x01;
    out[off + 2] = 0x00;
    out[off + 3] = 0x00;
    out[off + 4] = 0x7f;
    out[off + 5] = 0x00;
    out[off + 6] = 0x00;
    out[off + 7] = 0x00;
    off += 8;
  }
  const trackName = new TextEncoder().encode('Track 1\x00Lead\x00Rhythm\x00');
  for (let i = off; i < size; i += trackName.length) {
    const n = Math.min(trackName.length, size - i);
    out.set(trackName.subarray(0, n), i);
  }
  return out;
}

function makeWavLikePcmBytes(size) {
  const out = new Uint8Array(size);
  let i = 0;
  while (i < size) {
    const section = (Math.floor(i / 4096) % 5);
    if (section === 0 || section === 2) {
      const run = Math.min(4096, size - i);
      i += run;
      continue;
    }
    const tone = 800 + (section * 37);
    while (i + 1 < size && (Math.floor(i / 4096) % 5) === section) {
      const sample = Math.floor(4000 * Math.sin((i / 2) / tone));
      out[i] = sample & 0xff;
      out[i + 1] = (sample >> 8) & 0xff;
      i += 2;
    }
  }
  return out;
}

async function methodForExtension(blob, filename) {
  const entries = await readZipEntries(blob);
  return entries.find((e) => e.name === filename).method;
}

async function runExternalValidation(blob, expectedEntries) {
  const dir = mkdtempSync(join(tmpdir(), 'musi-zip-'));
  const zipPath = join(dir, 'test.zip');
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    writeFileSync(zipPath, bytes);

    if (toolAvailable('unzip')) {
      const out = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
      assert.match(out, /No errors detected|no errors detected/i);
    } else {
      console.log('skip  external unzip -t (unzip not found)');
    }

    if (toolAvailable('zipinfo')) {
      const out = execFileSync('zipinfo', ['-t', zipPath], { encoding: 'utf8' });
      const countMatch = out.match(/(\d+)\s+files?/i);
      assert.ok(countMatch, 'zipinfo should report file count');
      assert.equal(Number(countMatch[1]), expectedEntries.length);
    } else {
      console.log('skip  external zipinfo (zipinfo not found)');
    }

    if (toolAvailable('python3')) {
      const manifest = expectedEntries.map((e) => ({
        name: e.name,
        bytes: Array.from(e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data)),
      }));
      const py = `
import json, sys, zipfile
manifest = json.loads(sys.argv[1])
path = sys.argv[2]
with zipfile.ZipFile(path, 'r') as zf:
    err = zf.testzip()
    assert err is None, f'testzip failed on {err!r}'
    names = zf.namelist()
    assert len(names) == len(manifest), f'expected {len(manifest)} entries, got {len(names)}'
    for item in manifest[:2]:
        data = zf.read(item['name'])
        assert list(data) == item['bytes'], f"content mismatch for {item['name']}"
print('ok')
`;
      execFileSync('python3', ['-c', py, JSON.stringify(manifest), zipPath], { encoding: 'utf8' });
    } else {
      console.log('skip  external python zipfile (python3 not found)');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function run() {
  await test('crc32 known vector', () => {
    const bytes = new TextEncoder().encode('123456789');
    assert.equal(crc32(bytes), 0xcbf43926);
  });

  await test('crc32 incremental matches one-shot', () => {
    const a = new TextEncoder().encode('hello ');
    const b = new TextEncoder().encode('world');
    const combined = new TextEncoder().encode('hello world');
    const running = crc32(a, 0xffffffff);
    const finalRunning = crc32(b, running);
    assert.equal(finalRunning ^ 0xffffffff, crc32(combined));
  });

  await test('round trip several entries', async () => {
    const files = [
      { name: 'readme.txt', data: new TextEncoder().encode('Hello Musi!'), compress: true },
      { name: 'data/config.json', data: new TextEncoder().encode('{"v":1}'), compress: true },
      { name: 'assets/logo.png', data: randomBytes(256), compress: false },
    ];
    const blob = await buildArchive(files);
    const entries = await readZipEntries(blob);
    assert.equal(entries.length, files.length);
    for (const spec of files) {
      const entry = entries.find((e) => e.name === spec.name);
      assert.ok(entry, `missing ${spec.name}`);
      const out = await extractZipEntry(blob, entry);
      const got = new Uint8Array(await out.arrayBuffer());
      const want = spec.data instanceof Uint8Array ? spec.data : new Uint8Array(spec.data);
      assert.deepEqual(got, want);
    }
  });

  await test('DEFLATE shrinks compressible text; STORE keeps random bytes size', async () => {
    const text = new TextEncoder().encode('zip '.repeat(4000));
    const random = randomBytes(4096);
    const blob = await buildArchive([
      { name: 'compressible.txt', data: text, compress: true },
      { name: 'random.bin', data: random, compress: false },
    ]);
    const entries = await readZipEntries(blob);
    const textEntry = entries.find((e) => e.name === 'compressible.txt');
    const randomEntry = entries.find((e) => e.name === 'random.bin');
    assert.ok(textEntry.compressedSize < textEntry.size * 0.5);
    assert.equal(randomEntry.method, 0);
    assert.equal(randomEntry.compressedSize, randomEntry.size);
  });

  await test('empty entry and UTF-8 name', async () => {
    const blob = await buildArchive([
      { name: 'empty.dat', data: new Uint8Array(0), compress: false },
      { name: 'música/ñoño.txt', data: new TextEncoder().encode('café'), compress: true },
    ]);
    const entries = await readZipEntries(blob);
    assert.equal(entries.length, 2);
    const empty = entries.find((e) => e.name === 'empty.dat');
    const utf = entries.find((e) => e.name === 'música/ñoño.txt');
    assert.equal(empty.size, 0);
    const emptyOut = await extractZipEntry(blob, empty);
    assert.equal(emptyOut.size, 0);
    const utfOut = await extractZipEntry(blob, utf);
    assert.equal(new TextDecoder().decode(await utfOut.arrayBuffer()), 'café');
  });

  await test('many entries (500) central directory', async () => {
    const files = [];
    for (let i = 0; i < 500; i += 1) {
      files.push({
        name: `bulk/file-${String(i).padStart(4, '0')}.txt`,
        data: new TextEncoder().encode(`entry ${i}`),
        compress: true,
      });
    }
    const blob = await buildArchive(files);
    const entries = await readZipEntries(blob);
    assert.equal(entries.length, 500);
    const sample = entries.find((e) => e.name === 'bulk/file-0420.txt');
    const out = await extractZipEntry(blob, sample);
    assert.equal(new TextDecoder().decode(await out.arrayBuffer()), 'entry 420');
  });

  await test('large entry streams from Blob without single huge buffer', async () => {
    const chunkSize = 64 * 1024;
    const chunkCount = 12 * 16;
    let readCalls = 0;
    function makeSourceStream() {
      readCalls = 0;
      return new ReadableStream({
        pull(controller) {
          if (readCalls >= chunkCount) {
            controller.close();
            return;
          }
          const chunk = new Uint8Array(chunkSize);
          for (let i = 0; i < chunkSize; i += 1) {
            chunk[i] = (readCalls + i) & 0xff;
          }
          readCalls += 1;
          controller.enqueue(chunk);
        },
      });
    }
    const writer = createZipWriter();
    const collecting = streamToUint8Array(writer.stream);
    await writer.addFile({ name: 'large/streamed.bin', data: makeSourceStream(), compress: false });
    await writer.close();
    const zipBlob = new Blob([await collecting], { type: 'application/zip' });
    const entries = await readZipEntries(zipBlob);
    const entry = entries.find((e) => e.name === 'large/streamed.bin');
    assert.equal(entry.size, chunkSize * chunkCount);
    assert.equal(readCalls, chunkCount, 'source stream should be consumed in chunks');
    const out = await extractZipEntry(zipBlob, entry);
    assert.equal(out.size, chunkSize * chunkCount);
  });

  await test('default compress classifies extensions by container vs raw bytes', async () => {
    const blob = await buildArchive([
      { name: 'score.gp', data: randomBytes(64) },
      { name: 'score.gpx', data: randomBytes(64) },
      { name: 'song.mp3', data: randomBytes(64) },
      { name: 'cover.png', data: randomBytes(64) },
      { name: 'sheet.pdf', data: randomBytes(64) },
      { name: 'font.woff2', data: randomBytes(64) },
      { name: 'exercise.gp5', data: randomBytes(64) },
      { name: 'exercise.gp4', data: randomBytes(64) },
      { name: 'exercise.gp3', data: randomBytes(64) },
      { name: 'score.gpif', data: randomBytes(64) },
      { name: 'take.wav', data: randomBytes(64) },
      { name: 'icon.bmp', data: randomBytes(64) },
      { name: 'favicon.ico', data: randomBytes(64) },
      { name: 'text.ttf', data: randomBytes(64) },
      { name: 'text.otf', data: randomBytes(64) },
      { name: 'notes.txt', data: randomBytes(64) },
    ]);
    const store = [
      'score.gp', 'score.gpx', 'song.mp3', 'cover.png', 'sheet.pdf', 'font.woff2',
    ];
    const deflate = [
      'exercise.gp5', 'exercise.gp4', 'exercise.gp3', 'score.gpif',
      'take.wav', 'icon.bmp', 'favicon.ico', 'text.ttf', 'text.otf', 'notes.txt',
    ];
    for (const name of store) {
      assert.equal(await methodForExtension(blob, name), 0, `${name} should STORE`);
    }
    for (const name of deflate) {
      assert.equal(await methodForExtension(blob, name), 8, `${name} should DEFLATE`);
    }
  });

  await test('default compress shrinks GP5-like binary and WAV-like PCM', async () => {
    const gp5Data = makeGp5LikeBytes(48 * 1024);
    const wavData = makeWavLikePcmBytes(64 * 1024);
    const blob = await buildArchive([
      { name: 'licks.gp5', data: gp5Data },
      { name: 'recording.wav', data: wavData },
    ]);
    const entries = await readZipEntries(blob);
    const gp5Entry = entries.find((e) => e.name === 'licks.gp5');
    const wavEntry = entries.find((e) => e.name === 'recording.wav');
    assert.equal(gp5Entry.method, 8);
    assert.equal(wavEntry.method, 8);
    assert.ok(gp5Entry.compressedSize < gp5Entry.size, 'GP5-like data should deflate');
    assert.ok(wavEntry.compressedSize < wavEntry.size, 'WAV-like PCM should deflate');
    const gp5Ratio = gp5Entry.compressedSize / gp5Entry.size;
    const wavRatio = wavEntry.compressedSize / wavEntry.size;
    assert.ok(gp5Ratio < 0.5, `GP5-like ratio ${gp5Ratio.toFixed(3)} should be well under 1`);
    assert.ok(wavRatio < 1, `WAV-like ratio ${wavRatio.toFixed(3)} should shrink`);
    assert.ok(wavRatio < 0.75, `WAV-like ratio ${wavRatio.toFixed(3)} should shrink by at least a quarter`);
    console.log(`    GP5-like: ${gp5Entry.size} B -> ${gp5Entry.compressedSize} B (${(gp5Ratio * 100).toFixed(1)}%)`);
    console.log(`    WAV-like: ${wavEntry.size} B -> ${wavEntry.compressedSize} B (${(wavRatio * 100).toFixed(1)}%)`);
  });

  await test('path safety on write', () => {
    assert.throws(() => sanitizeEntryName('../evil.txt'), /must not contain "\.\."/);
    assert.throws(() => sanitizeEntryName('/etc/passwd'), /must be relative/);
    assert.throws(() => sanitizeEntryName('C:\\Windows\\system.ini'), /must be relative/);
  });

  await test('path safety on read rejects crafted central directory', async () => {
    const good = await buildArchive([
      { name: 'safe.txt', data: new TextEncoder().encode('ok'), compress: false },
    ]);
    const bytes = new Uint8Array(await good.arrayBuffer());
    const safeName = new TextEncoder().encode('safe.txt');
    const evilName = new TextEncoder().encode('../../ok');
    assert.equal(safeName.length, evilName.length);
    let replaced = false;
    for (let i = bytes.length - safeName.length; i >= 0; i -= 1) {
      let match = true;
      for (let j = 0; j < safeName.length; j += 1) {
        if (bytes[i + j] !== safeName[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        bytes.set(evilName, i);
        replaced = true;
        break;
      }
    }
    assert.ok(replaced, 'expected to patch central-directory entry name');
    const corrupt = new Blob([bytes], { type: 'application/zip' });
    await assert.rejects(
      () => readZipEntries(corrupt),
      (err) => /unsafe entry paths|incomplete or corrupt/i.test(err.message),
    );
  });

  await test('truncated archive throws clear error', async () => {
    const blob = await buildArchive([
      { name: 'a.txt', data: new TextEncoder().encode('abc'), compress: true },
    ]);
    const full = new Uint8Array(await blob.arrayBuffer());
    const truncated = new Blob([full.subarray(0, Math.floor(full.length / 2))], { type: 'application/zip' });
    await assert.rejects(
      () => readZipEntries(truncated),
      (err) => /incomplete or corrupt/i.test(err.message),
    );
  });

  await test('payload corruption fails CRC on extract', async () => {
    const blob = await buildArchive([
      { name: 'payload.bin', data: randomBytes(512), compress: false },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entries = await readZipEntries(blob);
    const entry = entries[0];
    const { dataOffset } = { dataOffset: entry.offset + 30 + entry.name.length };
    const local = await readSlice(blob, entry.offset, 30);
    const nameLen = local[26] | (local[27] << 8);
    const extraLen = local[28] | (local[29] << 8);
    const payloadStart = entry.offset + 30 + nameLen + extraLen;
    bytes[payloadStart + 10] ^= 0xff;
    const tampered = new Blob([bytes], { type: 'application/zip' });
    const tamperedEntries = await readZipEntries(tampered);
    await assert.rejects(
      () => extractZipEntry(tampered, tamperedEntries[0]),
      (err) => /checksum mismatch|incomplete or corrupt/i.test(err.message),
    );
  });

  await test('external unzip, zipinfo, and python zipfile accept output', async () => {
    const files = [
      { name: 'hello.txt', data: new TextEncoder().encode('zip validation'), compress: true },
      { name: 'raw.bin', data: randomBytes(1024), compress: false },
      { name: 'nested/a/b.json', data: new TextEncoder().encode('{"ok":true}'), compress: true },
    ];
    const blob = await buildArchive(files);
    await runExternalValidation(blob, files);
  });

  console.log(`\n${passed} tests passed`);
}

async function readSlice(blob, offset, length) {
  const buf = await blob.slice(offset, offset + length).arrayBuffer();
  return new Uint8Array(buf);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
