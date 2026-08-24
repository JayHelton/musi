/**
 * Musi library bundle export/import — ZIP archive pairing profile snapshot
 * metadata (localStorage) with attachment Blobs (IndexedDB).
 */

import {
  getFileBlob,
  getAudioMeta,
  hasFile,
  listAudioMeta,
  putFileWithId,
} from '../attachments.js';
import {
  listPatterns,
  getPattern,
  hasPattern,
  putPatternRaw,
} from '../drums/drumPatternDb.js';
import {
  buildSnapshot,
  validateSnapshot,
  applySnapshot,
  SYNC_SCOPES,
} from './syncProfile.js';
import {
  createZipWriter,
  readZipEntries,
  extractZipEntry,
} from './zip.js';
import { crc32Blob, crc32Hex } from './crc32.js';

export const BUNDLE_KIND = 'musi-library-bundle';
export const BUNDLE_VERSION = 1;

const MANIFEST_NAME = 'manifest.json';
const SNAPSHOT_NAME = 'snapshot.json';
const FILES_PREFIX = 'files/';
const DRUMS_PATTERNS_NAME = 'drums/patterns.json';
const SETTINGS_STORE_KEY = 'musi:settings';

const NO_COMPRESS_EXT = new Set([
  '.gp', '.gpx', '.gp5', '.mp3', '.mp4', '.m4a', '.png', '.jpg', '.jpeg', '.webp',
]);

const NO_COMPRESS_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'video/mp4',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
]);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function defaultScopes(scopes) {
  if (scopes == null) return SYNC_SCOPES.map((s) => s.id);
  if (!Array.isArray(scopes) || scopes.length === 0) return SYNC_SCOPES.map((s) => s.id);
  return scopes.filter((id) => SYNC_SCOPES.some((s) => s.id === id));
}

function extensionFromFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName) return '';
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot).toLowerCase();
}

function shouldCompress({ fileName, type }) {
  const ext = extensionFromFileName(fileName);
  if (ext && NO_COMPRESS_EXT.has(ext)) return false;
  const mime = typeof type === 'string' ? type.toLowerCase() : '';
  if (mime && NO_COMPRESS_TYPES.has(mime)) return false;
  return true;
}

function zipEntryNameForAttachment(att) {
  const ext = extensionFromFileName(att.fileName);
  return `${FILES_PREFIX}${att.id}${ext}`;
}

function newAttachmentId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-${Date.now().toString(36)}-${rand}`;
}

function newPatternId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `usr-${Date.now().toString(36)}-${rand}`;
}

function includesContentScope(scopeIds) {
  return Array.isArray(scopeIds) && scopeIds.includes('content');
}

function patternRecordsEqual(a, b) {
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function remapPatternIdsInSettingsRemainder(remainder, idMap) {
  if (!idMap || idMap.size === 0 || !isPlainObject(remainder)) return remainder;
  const fav = remainder['drums.favorites'];
  if (!Array.isArray(fav)) return remainder;
  const remapped = fav.map((id) => (typeof id === 'string' && idMap.has(id) ? idMap.get(id) : id));
  return { ...remainder, 'drums.favorites': remapped };
}

function remapPatternIdsInSnapshot(snapshot, idMap) {
  if (!idMap || idMap.size === 0) return snapshot;
  const data = { ...snapshot.data };

  if (data[SETTINGS_STORE_KEY] != null) {
    const remainder = parseJsonKey(data[SETTINGS_STORE_KEY]);
    if (isPlainObject(remainder)) {
      data[SETTINGS_STORE_KEY] = JSON.stringify(remapPatternIdsInSettingsRemainder(remainder, idMap));
    }
  }

  return { ...snapshot, data };
}

function textToBytes(text) {
  return new TextEncoder().encode(text);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException('Import cancelled.', 'AbortError');
  }
}

function parseJsonKey(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Every attachment id one exercise record holds. An exercise keeps its main
 * file on `attachmentId`; a pitch run keeps its Guitar Pro source file, and a
 * written exercise keeps a list of extra files.
 */
function exerciseAttachmentIds(item) {
  const ids = [];
  if (!isPlainObject(item)) return ids;
  if (typeof item.attachmentId === 'string' && item.attachmentId) ids.push(item.attachmentId);
  if (isPlainObject(item.runner)
    && typeof item.runner.attachmentId === 'string'
    && item.runner.attachmentId) {
    ids.push(item.runner.attachmentId);
  }
  if (Array.isArray(item.attachments)) {
    item.attachments.forEach((entry) => {
      if (isPlainObject(entry) && typeof entry.attachmentId === 'string' && entry.attachmentId) {
        ids.push(entry.attachmentId);
      }
    });
  }
  return ids;
}

/** Rewrite every attachment id of one exercise record through the id map. */
function remapExerciseItem(item, idMap) {
  if (!isPlainObject(item)) return item;
  let next = item;
  const mainId = typeof item.attachmentId === 'string' ? idMap.get(item.attachmentId) : null;
  if (mainId) next = { ...next, attachmentId: mainId };
  if (isPlainObject(item.runner) && typeof item.runner.attachmentId === 'string') {
    const runnerId = idMap.get(item.runner.attachmentId);
    if (runnerId) next = { ...next, runner: { ...item.runner, attachmentId: runnerId } };
  }
  if (Array.isArray(item.attachments) && item.attachments.length) {
    let changed = false;
    const attachments = item.attachments.map((entry) => {
      if (!isPlainObject(entry) || typeof entry.attachmentId !== 'string') return entry;
      const mapped = idMap.get(entry.attachmentId);
      if (!mapped) return entry;
      changed = true;
      return { ...entry, attachmentId: mapped };
    });
    if (changed) next = { ...next, attachments };
  }
  return next;
}

function collectAttachmentIdsFromSnapshotData(data) {
  const ids = new Set();
  if (!isPlainObject(data)) return ids;

  const exercisesRaw = data['musi.exercises'];
  if (exercisesRaw != null) {
    const exercises = parseJsonKey(exercisesRaw);
    if (isPlainObject(exercises) && Array.isArray(exercises.items)) {
      exercises.items.forEach((item) => {
        exerciseAttachmentIds(item).forEach((id) => ids.add(id));
      });
    }
  }

  const songsRaw = data['musi.songs'];
  if (songsRaw != null) {
    const songs = parseJsonKey(songsRaw);
    if (Array.isArray(songs)) {
      songs.forEach((song) => {
        if (!isPlainObject(song)) return;
        if (typeof song.audioId === 'string' && song.audioId) ids.add(song.audioId);
        if (Array.isArray(song.recordings)) {
          song.recordings.forEach((rec) => {
            if (isPlainObject(rec) && typeof rec.id === 'string' && rec.id) ids.add(rec.id);
          });
        }
      });
    }
  }

  const gpRaw = data['musi.gpAnnotations'];
  if (gpRaw != null) {
    const gp = parseJsonKey(gpRaw);
    if (isPlainObject(gp) && isPlainObject(gp.byScore)) {
      Object.keys(gp.byScore).forEach((scoreKey) => {
        if (typeof scoreKey === 'string' && scoreKey.startsWith('att:')) {
          const id = scoreKey.slice(4).trim();
          if (id) ids.add(id);
        }
      });
    }
  }

  return ids;
}

function remapAttachmentIdsInSnapshot(snapshot, idMap) {
  if (!idMap || idMap.size === 0) return snapshot;
  const data = { ...snapshot.data };

  if (data['musi.exercises'] != null) {
    const exercises = parseJsonKey(data['musi.exercises']);
    if (isPlainObject(exercises) && Array.isArray(exercises.items)) {
      exercises.items = exercises.items.map((item) => remapExerciseItem(item, idMap));
      data['musi.exercises'] = JSON.stringify(exercises);
    }
  }

  if (data['musi.songs'] != null) {
    const songs = parseJsonKey(data['musi.songs']);
    if (Array.isArray(songs)) {
      data['musi.songs'] = JSON.stringify(songs.map((song) => {
        if (!isPlainObject(song)) return song;
        const out = { ...song };
        if (out.audioId && idMap.has(out.audioId)) {
          out.audioId = idMap.get(out.audioId);
        }
        if (Array.isArray(out.recordings)) {
          out.recordings = out.recordings.map((rec) => {
            if (!isPlainObject(rec) || !rec.id) return rec;
            const mapped = idMap.get(rec.id);
            return mapped ? { ...rec, id: mapped } : rec;
          });
        }
        return out;
      }));
    }
  }

  if (data['musi.gpAnnotations'] != null) {
    const gp = parseJsonKey(data['musi.gpAnnotations']);
    if (isPlainObject(gp) && isPlainObject(gp.byScore)) {
      const byScore = {};
      Object.entries(gp.byScore).forEach(([scoreKey, bucket]) => {
        if (scoreKey.startsWith('att:')) {
          const oldId = scoreKey.slice(4);
          const newId = idMap.get(oldId);
          const nextKey = newId ? `att:${newId}` : scoreKey;
          byScore[nextKey] = bucket;
        } else {
          byScore[scoreKey] = bucket;
        }
      });
      gp.byScore = byScore;
      data['musi.gpAnnotations'] = JSON.stringify(gp);
    }
  }

  return { ...snapshot, data };
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) {
    return { ok: false, error: 'Bundle manifest is missing or invalid.' };
  }
  if (manifest.app !== 'musi') {
    return { ok: false, error: 'This archive is not a Musi library bundle.' };
  }
  if (manifest.kind !== BUNDLE_KIND) {
    return { ok: false, error: 'Unrecognized bundle type.' };
  }
  if (typeof manifest.version !== 'number' || !Number.isFinite(manifest.version)) {
    return { ok: false, error: 'Bundle version is missing or invalid.' };
  }
  if (manifest.version > BUNDLE_VERSION) {
    return { ok: false, error: 'This bundle was made by a newer version of Musi.' };
  }
  if (!Array.isArray(manifest.attachments)) {
    return { ok: false, error: 'Bundle attachment list is missing or invalid.' };
  }
  return { ok: true, error: null, manifest };
}

function summarizeManifest(manifest) {
  return {
    createdAt: manifest?.createdAt || null,
    scopes: Array.isArray(manifest?.scopes) ? manifest.scopes : [],
    fileCount: manifest?.fileCount ?? (manifest?.attachments?.length || 0),
    patternCount: manifest?.patternCount ?? manifest?.patterns?.count ?? 0,
    totalBytes: manifest?.totalBytes ?? 0,
    snapshotBytes: manifest?.snapshotBytes ?? 0,
    attachments: Array.isArray(manifest?.attachments) ? manifest.attachments.length : 0,
  };
}

async function buildDrumInventory(scopeIds) {
  if (!includesContentScope(scopeIds)) {
    return { patterns: [], patternsText: '', patternsBytes: 0 };
  }
  const patterns = await listPatterns();
  const patternsText = JSON.stringify(patterns, null, 2);
  return {
    patterns,
    patternsText,
    patternsBytes: patternsText.length,
  };
}

async function buildAttachmentInventory(scopeIds) {
  const snapshot = buildSnapshot({ scopes: scopeIds });
  const idSet = collectAttachmentIdsFromSnapshotData(snapshot.data);
  const ids = [...idSet];
  const allMeta = await listAudioMeta();
  const metaById = new Map(allMeta.map((m) => [m.id, m]));

  const meta = [];
  const missing = [];
  let totalBytes = 0;

  ids.forEach((id) => {
    const m = metaById.get(id);
    if (!m) {
      missing.push(id);
      return;
    }
    meta.push(m);
    totalBytes += m.size || 0;
  });

  return { snapshot, ids, missing, meta, totalBytes };
}

export async function collectAttachmentRefs({ scopes } = {}) {
  const scopeIds = defaultScopes(scopes);
  const { ids, missing, meta, totalBytes } = await buildAttachmentInventory(scopeIds);
  return { ids, missing, meta, totalBytes };
}

export async function estimateBundle({ scopes } = {}) {
  const scopeIds = defaultScopes(scopes);
  const { snapshot, missing, meta, totalBytes } = await buildAttachmentInventory(scopeIds);
  const { patterns, patternsBytes } = await buildDrumInventory(scopeIds);
  const snapshotText = JSON.stringify(snapshot, null, 2);
  const snapshotBytes = snapshotText.length;

  const attachmentRows = [];
  for (const m of meta) {
    const blob = await getFileBlob(m.id);
    const crc = blob ? await crc32Blob(blob) : 0;
    attachmentRows.push({
      id: m.id,
      name: m.name,
      fileName: m.fileName,
      type: m.type,
      size: m.size,
      crc32: crc32Hex(crc),
      source: m.source,
      zipName: zipEntryNameForAttachment(m),
    });
  }

  const manifest = {
    app: 'musi',
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    createdAt: snapshot.createdAt,
    scopes: scopeIds,
    fileCount: meta.length,
    patternCount: patterns.length,
    totalBytes: totalBytes + snapshotBytes + patternsBytes,
    snapshotBytes,
    attachments: attachmentRows,
    patterns: {
      count: patterns.length,
      zipName: DRUMS_PATTERNS_NAME,
      bytes: patternsBytes,
    },
  };
  const manifestBytes = JSON.stringify(manifest, null, 2).length;

  return {
    fileCount: meta.length,
    patternCount: patterns.length,
    totalBytes: totalBytes + snapshotBytes + patternsBytes + manifestBytes,
    snapshotBytes,
    missing,
  };
}

export function bundleFilename(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  let datePart = 'unknown-date';
  if (!Number.isNaN(d.getTime())) {
    datePart = d.toISOString().slice(0, 10);
  }
  return `musi-library-${datePart}.zip`;
}

export async function createBundleStream({ scopes, onProgress } = {}) {
  const scopeIds = defaultScopes(scopes);
  const { snapshot, meta, totalBytes: attachmentBytes } = await buildAttachmentInventory(scopeIds);
  const { patterns, patternsText, patternsBytes } = await buildDrumInventory(scopeIds);
  const snapshotText = JSON.stringify(snapshot, null, 2);
  const snapshotBytes = snapshotText.length;

  const attachmentRows = [];
  for (const m of meta) {
    const blob = await getFileBlob(m.id);
    const crc = blob ? await crc32Blob(blob) : 0;
    attachmentRows.push({
      id: m.id,
      name: m.name,
      fileName: m.fileName,
      type: m.type,
      size: m.size,
      crc32: crc32Hex(crc),
      source: m.source,
      zipName: zipEntryNameForAttachment(m),
    });
  }

  const manifest = {
    app: 'musi',
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    createdAt: snapshot.createdAt,
    scopes: scopeIds,
    fileCount: meta.length,
    patternCount: patterns.length,
    totalBytes: attachmentBytes + snapshotBytes + patternsBytes,
    snapshotBytes,
    attachments: attachmentRows,
    patterns: {
      count: patterns.length,
      zipName: DRUMS_PATTERNS_NAME,
      bytes: patternsBytes,
    },
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const manifestBytes = manifestText.length;

  const includePatterns = includesContentScope(scopeIds) && patterns.length > 0;
  const totalItems = 2 + meta.length + (includePatterns ? 1 : 0);
  const totalArchiveBytes = attachmentBytes + snapshotBytes + patternsBytes + manifestBytes;
  let done = 0;
  let bytesReported = 0;

  const report = (name, byteCount = 0) => {
    done += 1;
    bytesReported += byteCount;
    if (typeof onProgress === 'function') {
      onProgress({
        done,
        total: totalItems,
        bytes: bytesReported,
        name,
      });
    }
  };

  const writer = createZipWriter();
  const { stream, addFile, close } = writer;
  const now = Date.now();

  const buildTask = (async () => {
    await addFile({
      name: MANIFEST_NAME,
      data: textToBytes(manifestText),
      lastModified: now,
      compress: true,
    });
    report(MANIFEST_NAME, manifestBytes);

    await addFile({
      name: SNAPSHOT_NAME,
      data: textToBytes(snapshotText),
      lastModified: now,
      compress: true,
    });
    report(SNAPSHOT_NAME, snapshotBytes);

    if (includePatterns) {
      await addFile({
        name: DRUMS_PATTERNS_NAME,
        data: textToBytes(patternsText),
        lastModified: now,
        compress: true,
      });
      report(DRUMS_PATTERNS_NAME, patternsBytes);
    }

    for (const row of attachmentRows) {
      const blob = await getFileBlob(row.id);
      await addFile({
        name: row.zipName,
        data: blob || new Blob(),
        lastModified: now,
        compress: shouldCompress({ fileName: row.fileName, type: row.type }),
      });
      report(row.zipName, row.size || 0);
    }

    await close();
  })();

  return {
    stream,
    filename: bundleFilename(snapshot.createdAt),
    totalBytes: totalArchiveBytes,
    done: buildTask,
  };
}

export async function readBundle(file) {
  try {
    const entries = await readZipEntries(file);
    const manifestEntry = entries.find((e) => e.name === MANIFEST_NAME);
    const snapshotEntry = entries.find((e) => e.name === SNAPSHOT_NAME);

    if (!manifestEntry) {
      return {
        ok: false,
        error: 'This archive is missing a Musi bundle manifest.',
        manifest: null,
        snapshot: null,
        entries,
        summary: null,
      };
    }

    const manifestBlob = await extractZipEntry(file, manifestEntry);
    let manifest;
    try {
      manifest = JSON.parse(await manifestBlob.text());
    } catch (e) {
      return {
        ok: false,
        error: 'Bundle manifest is not valid JSON.',
        manifest: null,
        snapshot: null,
        entries,
        summary: null,
      };
    }

    const manifestCheck = validateManifest(manifest);
    if (!manifestCheck.ok) {
      return {
        ok: false,
        error: manifestCheck.error,
        manifest: null,
        snapshot: null,
        entries,
        summary: null,
      };
    }

    if (!snapshotEntry) {
      return {
        ok: false,
        error: 'This archive is missing the profile snapshot.',
        manifest,
        snapshot: null,
        entries,
        summary: summarizeManifest(manifest),
      };
    }

    const snapshotBlob = await extractZipEntry(file, snapshotEntry);
    let snapshot;
    try {
      snapshot = JSON.parse(await snapshotBlob.text());
    } catch (e) {
      return {
        ok: false,
        error: 'Bundle snapshot is not valid JSON.',
        manifest,
        snapshot: null,
        entries,
        summary: summarizeManifest(manifest),
      };
    }

    const snapshotCheck = validateSnapshot(snapshot);
    if (!snapshotCheck.ok) {
      return {
        ok: false,
        error: snapshotCheck.error,
        manifest,
        snapshot: null,
        entries,
        summary: summarizeManifest(manifest),
      };
    }

    return {
      ok: true,
      error: null,
      manifest,
      snapshot: snapshotCheck.snapshot,
      entries,
      summary: summarizeManifest(manifest),
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || 'Could not read this archive.',
      manifest: null,
      snapshot: null,
      entries: [],
      summary: null,
    };
  }
}

function findZipEntryForAttachment(entries, att) {
  const exact = entries.find((e) => e.name === att.zipName);
  if (exact) return exact;
  const prefix = `${FILES_PREFIX}${att.id}`;
  return entries.find((e) => e.name === prefix || e.name.startsWith(`${prefix}.`));
}

export async function importBundle(file, { mode = 'merge', scopes, onProgress, signal } = {}) {
  const files = { added: 0, replaced: 0, skipped: 0, failed: 0 };
  const patterns = { added: 0, replaced: 0, skipped: 0, failed: 0 };
  const errors = [];

  const bundle = await readBundle(file);
  if (!bundle.ok) {
    return {
      snapshotOutcome: null,
      files,
      patterns,
      errors: [{ message: bundle.error }],
    };
  }

  const { manifest, snapshot, entries } = bundle;
  const scopeIds = defaultScopes(scopes);
  const attachments = Array.isArray(manifest.attachments) ? manifest.attachments : [];
  const patternsEntry = entries.find((e) => e.name === DRUMS_PATTERNS_NAME);
  const importPatternsStep = includesContentScope(scopeIds) && patternsEntry != null;
  const total = attachments.length + (importPatternsStep ? 1 : 0);
  let done = 0;
  let bytesReported = 0;
  const attachmentIdMap = new Map();
  const patternIdMap = new Map();

  const report = (name, byteCount = 0) => {
    done += 1;
    bytesReported += byteCount;
    if (typeof onProgress === 'function') {
      onProgress({ done, total, bytes: bytesReported, name });
    }
  };

  try {
    for (const att of attachments) {
      throwIfAborted(signal);

      const entry = findZipEntryForAttachment(entries, att);
      if (!entry) {
        files.failed += 1;
        errors.push({ id: att.id, message: `Missing file entry for ${att.id}.` });
        report(att.id, 0);
        continue;
      }

      let blob;
      try {
        blob = await extractZipEntry(file, entry);
      } catch (e) {
        files.failed += 1;
        errors.push({ id: att.id, message: e?.message || 'Could not extract file.' });
        report(att.id, 0);
        continue;
      }

      const incomingCrc = await crc32Blob(blob);
      const incomingCrcHex = crc32Hex(incomingCrc);
      if (att.crc32 && incomingCrcHex !== att.crc32) {
        files.failed += 1;
        errors.push({ id: att.id, message: 'File checksum does not match manifest.' });
        report(att.id, att.size || 0);
        continue;
      }

      const exists = await hasFile(att.id);
      if (exists) {
        const localBlob = await getFileBlob(att.id);
        const localCrc = localBlob ? await crc32Blob(localBlob) : 0;
        const localSize = localBlob ? localBlob.size : 0;
        if (localSize === (att.size || blob.size) && crc32Hex(localCrc) === incomingCrcHex) {
          files.skipped += 1;
          report(att.id, att.size || 0);
          continue;
        }

        const newId = newAttachmentId();
        const stored = await putFileWithId({
          id: newId,
          blob,
          name: att.name,
          fileName: att.fileName,
          type: att.type,
          size: att.size || blob.size,
          createdAt: manifest.createdAt,
          source: att.source,
        });
        if (!stored) {
          files.failed += 1;
          errors.push({ id: att.id, message: 'Could not store remapped attachment.' });
          report(att.id, att.size || 0);
          continue;
        }
        attachmentIdMap.set(att.id, newId);
        files.replaced += 1;
        report(att.id, att.size || 0);
        continue;
      }

      const stored = await putFileWithId({
        id: att.id,
        blob,
        name: att.name,
        fileName: att.fileName,
        type: att.type,
        size: att.size || blob.size,
        createdAt: manifest.createdAt,
        source: att.source,
      });
      if (!stored) {
        files.failed += 1;
        errors.push({ id: att.id, message: 'Could not store attachment.' });
        report(att.id, att.size || 0);
        continue;
      }
      files.added += 1;
      report(att.id, att.size || 0);
    }

    throwIfAborted(signal);

    if (importPatternsStep) {
      const patternBytes = manifest.patterns?.bytes || patternsEntry.size || 0;
      try {
        const patternsBlob = await extractZipEntry(file, patternsEntry);
        let incomingList = null;
        let parseOk = true;
        try {
          incomingList = JSON.parse(await patternsBlob.text());
        } catch (e) {
          parseOk = false;
          patterns.failed += 1;
          errors.push({ message: 'Drum patterns entry is not valid JSON.' });
        }

        if (parseOk) {
          if (!Array.isArray(incomingList)) {
            patterns.failed += 1;
            errors.push({ message: 'Drum patterns entry is not a JSON array.' });
          } else if (incomingList.length > 0) {
            for (const rec of incomingList) {
              throwIfAborted(signal);
              if (!isPlainObject(rec) || !rec.id) continue;

              const existsPat = await hasPattern(rec.id);
              if (existsPat) {
                const localPat = await getPattern(rec.id);
                if (localPat && patternRecordsEqual(localPat, rec)) {
                  patterns.skipped += 1;
                  continue;
                }

                const newId = newPatternId();
                const remapped = { ...rec, id: newId };
                const stored = await putPatternRaw(remapped);
                if (!stored) {
                  patterns.failed += 1;
                  errors.push({ id: rec.id, message: 'Could not store remapped drum pattern.' });
                  continue;
                }
                patternIdMap.set(rec.id, newId);
                patterns.replaced += 1;
                continue;
              }

              const stored = await putPatternRaw(rec);
              if (!stored) {
                patterns.failed += 1;
                errors.push({ id: rec.id, message: 'Could not store drum pattern.' });
                continue;
              }
              patterns.added += 1;
            }
          }
        }
        report(DRUMS_PATTERNS_NAME, patternBytes);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          patterns.failed += 1;
          errors.push({ message: e?.message || 'Could not import drum patterns.' });
          report(DRUMS_PATTERNS_NAME, patternBytes);
        } else {
          throw e;
        }
      }
    }

    throwIfAborted(signal);

    let remappedSnapshot = remapAttachmentIdsInSnapshot(snapshot, attachmentIdMap);
    remappedSnapshot = remapPatternIdsInSnapshot(remappedSnapshot, patternIdMap);
    const snapshotOutcome = await applySnapshot(remappedSnapshot, { mode, scopes });

    return { snapshotOutcome, files, patterns, errors };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return {
        snapshotOutcome: null,
        files,
        patterns,
        errors: [...errors, { message: 'Import cancelled before metadata was applied.' }],
        aborted: true,
      };
    }
    return {
      snapshotOutcome: null,
      files,
      patterns,
      errors: [...errors, { message: e?.message || 'Import failed.' }],
    };
  }
}
