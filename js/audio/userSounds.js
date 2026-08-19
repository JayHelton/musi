// Sounds the user installs on this device.
//
// Two kinds live here:
//
//   - `metronome`: one audio file. The metronome plays it on every click. The
//     accent plays the same file a little louder and a little higher.
//   - `instrument`: a sample pack for the score player. The pack is a ZIP with
//     a `manifest.json` in the format `js/audio/samplePackRegistry.js` reads,
//     plus the audio files the manifest names.
//
// A record keeps the file ids only. The audio bytes stay in the attachment
// store (IndexedDB), the same place exercise files use.

import { getSetting, saveSetting } from '../persistence.js';
import { saveFile, getFileBlob, deleteFile, attachmentsSupported } from '../attachments.js';
import { parsePackManifest, registerPack } from './samplePackRegistry.js';
import { registerPackFileSource, clearPackFileSource } from './sampleLoader.js';
import { readZipEntries, extractZipEntry } from '../sync/zip.js';

const STORE_KEY = 'sound.userSounds';
const NAME_LIMIT = 64;
/** One pack of samples is generous at 64 MB. A bigger one is a mistake. */
const MAX_PACK_BYTES = 64 * 1024 * 1024;
const MAX_SAMPLE_FILES = 128;

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];

/** Decoded buffers per AudioContext, keyed by `soundId` or `soundId/file`. */
const decoded = new WeakMap();

function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function clampName(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, NAME_LIMIT);
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const kind = raw.kind === 'instrument' ? 'instrument' : 'metronome';
  if (!id) return null;

  if (kind === 'metronome') {
    const attachmentId = typeof raw.attachmentId === 'string' ? raw.attachmentId : '';
    if (!attachmentId) return null;
    return {
      id,
      kind,
      name: clampName(raw.name, 'Metronome sound'),
      attachmentId,
      addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
    };
  }

  const manifest = raw.manifest && typeof raw.manifest === 'object' ? raw.manifest : null;
  const files = raw.files && typeof raw.files === 'object' ? raw.files : null;
  if (!manifest || !files) return null;
  return {
    id,
    kind,
    name: clampName(raw.name, manifest.name || 'Sound pack'),
    manifest,
    files: { ...files },
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
  };
}

function readRecords() {
  const raw = getSetting(STORE_KEY, []);
  return Array.isArray(raw) ? raw.map(normalizeRecord).filter(Boolean) : [];
}

function writeRecords(records) {
  saveSetting(STORE_KEY, records);
  return records;
}

/**
 * Every installed sound, newest first.
 * @param {'metronome'|'instrument'} [kind] limit to one kind
 */
export function listUserSounds(kind) {
  const all = readRecords();
  const list = kind ? all.filter((r) => r.kind === kind) : all;
  return list.slice().sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0));
}

export function getUserSound(id) {
  return readRecords().find((r) => r.id === id) || null;
}

/** True when this device can hold uploaded sounds at all. */
export function userSoundsSupported() {
  return attachmentsSupported();
}

function isAudioName(name) {
  const lower = String(name || '').toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Install one audio file as a metronome sound.
 * @param {File|Blob} file
 * @param {{ name?: string }} [options]
 * @returns {Promise<{ ok: true, sound: object } | { ok: false, error: string }>}
 */
export async function addMetronomeSound(file, { name } = {}) {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, error: 'Choose an audio file.' };
  }
  const fileName = file.name || 'sound';
  if (!isAudioName(fileName) && !String(file.type || '').startsWith('audio/')) {
    return { ok: false, error: 'That file is not audio. Use WAV, MP3, OGG, or M4A.' };
  }
  if (file.size > MAX_PACK_BYTES) {
    return { ok: false, error: 'That file is too large.' };
  }

  const meta = await saveFile({
    blob: file,
    name: clampName(name || fileName.replace(/\.[^.]+$/, ''), 'Metronome sound'),
    fileName,
    type: file.type || '',
    size: file.size,
    source: 'sound-pack',
  });
  if (!meta) return { ok: false, error: 'This browser could not store the file.' };

  const record = {
    id: uid('snd'),
    kind: 'metronome',
    name: clampName(name || fileName.replace(/\.[^.]+$/, ''), 'Metronome sound'),
    attachmentId: meta.id,
    addedAt: new Date().toISOString(),
  };
  writeRecords([...readRecords(), record]);
  return { ok: true, sound: record };
}

/**
 * Install a ZIP sample pack for the score player.
 * @param {File|Blob} file
 * @returns {Promise<{ ok: true, sound: object } | { ok: false, error: string }>}
 */
export async function addInstrumentPack(file) {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, error: 'Choose a pack file.' };
  }
  if (file.size > MAX_PACK_BYTES) {
    return { ok: false, error: 'That pack is too large.' };
  }

  let entries;
  try {
    entries = await readZipEntries(file);
  } catch (err) {
    return { ok: false, error: err?.message || 'That file is not a ZIP archive.' };
  }

  const manifestEntry = entries.find((e) => /(^|\/)manifest\.json$/i.test(e.name));
  if (!manifestEntry) {
    return { ok: false, error: 'The pack has no manifest.json.' };
  }
  // Files sit next to the manifest, so a pack folder inside the ZIP still works.
  const prefix = manifestEntry.name.slice(0, manifestEntry.name.length - 'manifest.json'.length);

  let manifest;
  try {
    const blob = await extractZipEntry(file, manifestEntry);
    manifest = JSON.parse(await blob.text());
  } catch (err) {
    return { ok: false, error: err?.message || 'The manifest.json could not be read.' };
  }

  const parsed = parsePackManifest(manifest);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const wanted = new Set();
  for (const sample of parsed.manifest.samples) {
    if (typeof sample.file === 'string' && sample.file) wanted.add(sample.file);
  }
  if (!wanted.size) {
    return { ok: false, error: 'The manifest names no sample files.' };
  }
  if (wanted.size > MAX_SAMPLE_FILES) {
    return { ok: false, error: 'The pack has too many sample files.' };
  }

  const files = {};
  const stored = [];
  try {
    for (const relPath of wanted) {
      const entry = entries.find((e) => e.name === `${prefix}${relPath}` || e.name === relPath);
      if (!entry) throw new Error(`The pack is missing ${relPath}.`);
      const blob = await extractZipEntry(file, entry);
      const meta = await saveFile({
        blob,
        name: relPath,
        fileName: relPath,
        type: blob.type || '',
        size: blob.size,
        source: 'sound-pack',
      });
      if (!meta) throw new Error('This browser could not store the pack.');
      files[relPath] = meta.id;
      stored.push(meta.id);
    }
  } catch (err) {
    // Leave no half-written pack behind.
    for (const id of stored) {
      try { await deleteFile(id); } catch (e) { /* ignore */ }
    }
    return { ok: false, error: err?.message || 'The pack could not be read.' };
  }

  const record = {
    id: uid('pack'),
    kind: 'instrument',
    name: clampName(parsed.manifest.name || parsed.manifest.id, 'Sound pack'),
    manifest: parsed.manifest,
    files,
    addedAt: new Date().toISOString(),
  };
  writeRecords([...readRecords(), record]);
  registerUserPack(record);
  return { ok: true, sound: record };
}

/** Remove one installed sound and the files it owns. */
export async function removeUserSound(id) {
  const record = getUserSound(id);
  if (!record) return { ok: false, error: 'That sound is already gone.' };
  const ids = record.kind === 'metronome'
    ? [record.attachmentId]
    : Object.values(record.files || {});
  for (const attachmentId of ids) {
    try { await deleteFile(attachmentId); } catch (e) { /* ignore */ }
  }
  if (record.kind === 'instrument' && record.manifest?.id) {
    clearPackFileSource(record.manifest.id);
  }
  writeRecords(readRecords().filter((r) => r.id !== id));
  return { ok: true };
}

/** Rename one installed sound. */
export function renameUserSound(id, name) {
  const records = readRecords();
  const record = records.find((r) => r.id === id);
  if (!record) return { ok: false, error: 'That sound is already gone.' };
  record.name = clampName(name, record.name);
  writeRecords(records);
  return { ok: true, sound: record };
}

function bufferCacheFor(audioCtx) {
  let map = decoded.get(audioCtx);
  if (!map) {
    map = new Map();
    decoded.set(audioCtx, map);
  }
  return map;
}

async function decodeBlob(audioCtx, blob) {
  const bytes = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    try {
      const maybe = audioCtx.decodeAudioData(bytes, resolve, reject);
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Decode one metronome sound. Returns null when the file is gone or unreadable.
 * @returns {Promise<AudioBuffer|null>}
 */
export async function decodeMetronomeSound(id, audioCtx) {
  if (!audioCtx || typeof audioCtx.decodeAudioData !== 'function') return null;
  const cache = bufferCacheFor(audioCtx);
  if (cache.has(id)) return cache.get(id);
  const record = getUserSound(id);
  if (!record || record.kind !== 'metronome') return null;
  try {
    const blob = await getFileBlob(record.attachmentId);
    if (!blob) return null;
    const buffer = await decodeBlob(audioCtx, blob);
    cache.set(id, buffer);
    return buffer;
  } catch (err) {
    cache.set(id, null);
    return null;
  }
}

/**
 * Teach the sample loader where an installed pack keeps its files, and put the
 * manifest in the registry so the score player can choose it.
 */
export function registerUserPack(record) {
  if (!record || record.kind !== 'instrument') return false;
  const result = registerPack(record.manifest);
  if (!result.ok) return false;
  registerPackFileSource(record.manifest.id, async (file) => {
    const attachmentId = record.files?.[file];
    if (!attachmentId) return null;
    return getFileBlob(attachmentId);
  });
  return true;
}

/** Register every installed pack. Call it once before a score loads. */
export function registerUserPacks() {
  let count = 0;
  for (const record of listUserSounds('instrument')) {
    if (registerUserPack(record)) count += 1;
  }
  return count;
}

/** The pack manifest id an installed instrument sound carries. */
export function userPackManifestId(soundId) {
  const record = getUserSound(soundId);
  return record?.kind === 'instrument' ? record.manifest?.id || '' : '';
}
