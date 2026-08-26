// Sounds the user installs on this device.
//
// Two kinds live here:
//
//   - `metronome`: one audio file. The metronome plays it on every click. The
//     accent plays the same file a little louder and a little higher.
//   - `instrument`: a sample pack for the score player and the pitch tools.
//
// An instrument pack arrives in one of three formats. All three are one
// archive that holds the audio files and one description file:
//
//   - `manifest.json` — the Musi format that `js/audio/samplePackRegistry.js`
//     reads.
//   - `multisample.xml` — a `.multisample` file, the format Bitwig Studio and
//     other programs write.
//   - a `.sfz` file — the SFZ format, a text file of `<region>` blocks.
//
// The last two formats convert to a Musi manifest at import time. See
// `js/audio/packImport.js`.
//
// Every pack carries a `packKind`: `pitched` for an instrument, and
// `percussion` for a kit. The two kinds never share one setting, because a
// score plays them on different tracks.
//
// A record keeps the file ids only. The audio bytes stay in the attachment
// store (IndexedDB), the same place exercise files use.

import { getSetting, saveSetting } from '../persistence.js';
import { saveFile, getFileBlob, deleteFile, attachmentsSupported } from '../attachments.js';
import { parsePackManifest, registerPack } from './samplePackRegistry.js';
import { registerPackFileSource, clearPackFileSource } from './sampleLoader.js';
import { readZipEntries, extractZipEntry } from '../sync/zip.js';
import { buildManifestFromSfz, buildManifestFromMultisample } from './packImport.js';

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
    packKind: manifestPackKind(manifest),
    format: typeof raw.format === 'string' ? raw.format : 'manifest',
    name: clampName(raw.name, manifest.name || 'Sound pack'),
    manifest,
    files: { ...files },
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
  };
}

/**
 * `percussion` when the manifest maps note numbers onto kit sounds, and
 * `pitched` when it does not.
 * @param {object} manifest
 * @returns {'percussion'|'pitched'}
 */
export function manifestPackKind(manifest) {
  return manifest && typeof manifest.drumNoteMap === 'object' && manifest.drumNoteMap !== null
    ? 'percussion'
    : 'pitched';
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

/**
 * Every installed pack of one kind, newest first.
 * @param {'pitched'|'percussion'} packKind
 */
export function listInstrumentPacks(packKind) {
  const all = listUserSounds('instrument');
  if (packKind !== 'pitched' && packKind !== 'percussion') return all;
  return all.filter((r) => r.packKind === packKind);
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

/** Every archive extension the pack importer opens. */
export const PACK_FILE_ACCEPT = '.zip,.multisample,.sfz,application/zip';

function entryLookup(entries) {
  const byPath = new Map();
  const byBase = new Map();
  for (const entry of entries) {
    const path = String(entry.name || '').replace(/\\/g, '/');
    byPath.set(path.toLowerCase(), entry);
    const base = path.split('/').pop() || '';
    if (base && !byBase.has(base.toLowerCase())) byBase.set(base.toLowerCase(), entry);
  }
  return { byPath, byBase };
}

/**
 * Find one file in the archive. A pack folder inside the archive, a Windows
 * path separator, and a different letter case all still resolve.
 */
function findEntry(lookup, prefix, relPath) {
  const wanted = String(relPath || '').replace(/\\/g, '/').toLowerCase();
  if (!wanted) return null;
  return lookup.byPath.get(`${prefix}${wanted}`)
    || lookup.byPath.get(wanted)
    || lookup.byBase.get(wanted.split('/').pop() || '')
    || null;
}

/**
 * The description file the archive holds, and the format it names.
 * @param {Array<{name: string}>} entries
 * @returns {{ format: 'manifest'|'multisample'|'sfz', entry: object, all?: object[] }|null}
 */
export function detectPackFormat(entries) {
  const manifest = entries.find((e) => /(^|\/)manifest\.json$/i.test(e.name));
  if (manifest) return { format: 'manifest', entry: manifest };

  const multisample = entries.find((e) => /(^|\/)multisample\.xml$/i.test(e.name));
  if (multisample) return { format: 'multisample', entry: multisample };

  const sfzEntries = entries.filter((e) => /\.sfz$/i.test(e.name));
  if (sfzEntries.length) {
    // The instrument sits at the top of the archive. A deeper file is a part
    // that the top file includes.
    const shallow = sfzEntries.slice().sort((a, b) => (
      a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length
    ));
    return { format: 'sfz', entry: shallow[0], all: sfzEntries };
  }
  return null;
}

async function readEntryText(file, entry) {
  const blob = await extractZipEntry(file, entry);
  return blob.text();
}

/**
 * Read the description file of the archive and return the pack manifest.
 * @returns {Promise<{ ok: true, manifest: object, format: string, prefix: string } | { ok: false, error: string }>}
 */
async function readPackManifest(file, entries, { kind, name } = {}) {
  const source = detectPackFormat(entries);
  if (!source) {
    return {
      ok: false,
      error: 'The pack has no manifest.json, no multisample.xml, and no .sfz file.',
    };
  }

  const path = String(source.entry.name || '').replace(/\\/g, '/');
  const folder = path.slice(0, path.lastIndexOf('/') + 1);
  const label = name || path.split('/').pop() || 'Sound pack';

  if (source.format === 'manifest') {
    let json;
    try {
      json = JSON.parse(await readEntryText(file, source.entry));
    } catch (err) {
      return { ok: false, error: err?.message || 'The manifest.json could not be read.' };
    }
    const parsed = parsePackManifest(json);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, manifest: parsed.manifest, format: 'manifest', prefix: folder.toLowerCase() };
  }

  let built;
  try {
    if (source.format === 'multisample') {
      built = buildManifestFromMultisample({
        xml: await readEntryText(file, source.entry),
        name: name || file.name || label,
        kind,
        source: file.name || label,
      });
    } else {
      const includes = new Map();
      for (const entry of source.all || []) {
        if (entry === source.entry) continue;
        const rel = String(entry.name || '').replace(/\\/g, '/').slice(folder.length);
        includes.set(rel.toLowerCase(), await readEntryText(file, entry));
      }
      built = buildManifestFromSfz({
        text: await readEntryText(file, source.entry),
        name: name || label,
        kind,
        includes,
        source: file.name || label,
      });
    }
  } catch (err) {
    return { ok: false, error: err?.message || 'That file could not be read.' };
  }

  if (!built.ok) return built;
  const parsed = parsePackManifest(built.manifest);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, manifest: parsed.manifest, format: source.format, prefix: folder.toLowerCase() };
}

/**
 * Install a sample pack for the score player and the pitch tools.
 *
 * The file is a ZIP, a `.multisample` file, or a ZIP of an SFZ instrument. See
 * the module comment for the three formats.
 * @param {File|Blob} file
 * @param {{ kind?: 'pitched'|'percussion', name?: string }} [options] `kind`
 *   forces the pack kind. Without it the importer reads the key layout.
 * @returns {Promise<{ ok: true, sound: object } | { ok: false, error: string }>}
 */
export async function addInstrumentPack(file, { kind, name } = {}) {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, error: 'Choose a pack file.' };
  }
  if (file.size > MAX_PACK_BYTES) {
    return { ok: false, error: 'That pack is too large.' };
  }
  if (/\.sfz$/i.test(file.name || '')) {
    return {
      ok: false,
      error: 'An SFZ file needs its samples. Put the .sfz file and its audio files in one ZIP, then add the ZIP.',
    };
  }

  let entries;
  try {
    entries = await readZipEntries(file);
  } catch (err) {
    return { ok: false, error: err?.message || 'That file is not a ZIP archive.' };
  }

  const read = await readPackManifest(file, entries, { kind, name });
  if (!read.ok) return read;
  const { manifest, format, prefix } = read;

  const wanted = new Set();
  for (const sample of manifest.samples) {
    if (typeof sample.file === 'string' && sample.file) wanted.add(sample.file);
  }
  if (!wanted.size) {
    return { ok: false, error: 'The pack names no sample files.' };
  }
  if (wanted.size > MAX_SAMPLE_FILES) {
    return { ok: false, error: 'The pack has too many sample files.' };
  }

  const lookup = entryLookup(entries);
  const files = {};
  const stored = [];
  try {
    for (const relPath of wanted) {
      const entry = findEntry(lookup, prefix, relPath);
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
    packKind: manifestPackKind(manifest),
    format,
    name: clampName(name || manifest.name || manifest.instrument || manifest.id, 'Sound pack'),
    manifest,
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
