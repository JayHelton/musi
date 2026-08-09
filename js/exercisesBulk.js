// Bulk upload engine for the Exercises library (DOM-free).

import {
  attachmentsSupported,
  ensurePersistentStorage,
  saveFile as defaultSaveFile,
} from './attachments.js';
import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import { buildMeasureDigests, formatBarRange } from './gpPlayer/measureDigest.js';
import {
  autoSplitByMarkers,
  autoSplitEveryN,
  segmentBeats,
} from './gpPlayer/exerciseSegments.js';
import {
  sliceGpResultByBeats,
  serializeExerciseScore,
  segmentExerciseFileName,
  gpResultFromTabModelJson,
} from './gpExerciseScore.js';

export const BULK_MAX_FILE_BYTES = 250 * 1024 * 1024;
export const BULK_ACCEPT_ATTR = [
  'application/pdf,.pdf',
  '.doc,.docx,.txt,.rtf,.odt,.md,.pages,.csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf,text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.apple.pages',
  'text/plain,text/markdown,text/csv',
  'image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg',
  'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm',
  'video/*,.mp4,.m4v,.mov,.webm,.ogv,.ogg',
  '.gp,.gp3,.gp4,.gp5,.gpx,application/x-guitar-pro',
  '.musi-tab.json,application/x-musi-tab-model',
].join(',');
export const BULK_UNSUPPORTED_MSG = 'Only PDF, documents (doc, docx, txt, rtf, odt, md, pages, csv), images, audio, video, and Guitar Pro (.gp/.gp5) files up to 250 MB can be uploaded.';

const NAME_LIMIT = 120;

function fileExt(item) {
  const name = (item && (item.fileName || item.name)) || '';
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isPdfProbe(probe) {
  return probe.type === 'application/pdf' || fileExt(probe) === 'pdf';
}

function isImageProbe(probe) {
  return (typeof probe.type === 'string' && probe.type.startsWith('image/'))
    || /^(png|jpe?g|gif|webp|bmp|svg)$/.test(fileExt(probe));
}

function isAudioProbe(probe) {
  return (typeof probe.type === 'string' && probe.type.startsWith('audio/'))
    || /^(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/.test(fileExt(probe));
}

function isVideoProbe(probe) {
  return (typeof probe.type === 'string' && probe.type.startsWith('video/'))
    || /^(mp4|m4v|mov|webm|ogv|ogg)$/.test(fileExt(probe));
}

function isTabModelProbe(probe) {
  const fileName = probe.fileName || probe.name || '';
  return probe.type === 'application/x-musi-tab-model'
    || /\.musi-tab\.json$/i.test(fileName)
    || (probe.type === 'application/json' && /\.musi-tab\.json$/i.test(fileName));
}

function isGpBinaryProbe(probe) {
  const fileName = probe.fileName || probe.name || '';
  return probe.type === 'application/x-guitar-pro'
    || isGuitarProName(fileName)
    || /^(gp|gp5)$/i.test(fileExt(probe));
}

function isDocProbe(probe) {
  if (/^(docx?|txt|rtf|odt|md|pages|csv)$/i.test(fileExt(probe))) return true;
  const t = probe.type || '';
  return (
    t === 'application/msword'
    || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || t === 'application/rtf' || t === 'text/rtf'
    || t === 'application/vnd.oasis.opendocument.text'
    || t === 'application/vnd.apple.pages'
    || t === 'text/plain' || t === 'text/markdown' || t === 'text/csv'
  );
}

function docMimeFromExt(ext) {
  const map = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    md: 'text/markdown',
    pages: 'application/vnd.apple.pages',
    csv: 'text/csv',
  };
  return map[(ext || '').toLowerCase()] || '';
}

function resolveMimeType(probe, kind) {
  if (probe.type) return probe.type;
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'tab-model') return 'application/x-musi-tab-model';
  if (kind === 'gp') return 'application/x-guitar-pro';
  return docMimeFromExt(fileExt(probe)) || '';
}

/**
 * Classify a file (or a {type, fileName} probe) using the same accept rules as
 * the existing Exercises upload.
 * @returns {{ kind: 'pdf'|'doc'|'image'|'audio'|'video'|'gp'|'tab-model'|'unsupported',
 *             mimeType: string, supported: boolean, isGuitarPro: boolean }}
 */
export function classifyUploadFile(fileOrProbe) {
  const probe = {
    type: fileOrProbe?.type || '',
    fileName: fileOrProbe?.fileName || fileOrProbe?.name || '',
  };

  let kind = 'unsupported';
  if (isPdfProbe(probe)) kind = 'pdf';
  else if (isDocProbe(probe)) kind = 'doc';
  else if (isImageProbe(probe)) kind = 'image';
  else if (isAudioProbe(probe)) kind = 'audio';
  else if (isVideoProbe(probe)) kind = 'video';
  else if (isTabModelProbe(probe)) kind = 'tab-model';
  else if (isGpBinaryProbe(probe)) kind = 'gp';

  const supported = kind !== 'unsupported';
  const isGuitarPro = kind === 'gp' || kind === 'tab-model';
  const mimeType = supported ? resolveMimeType(probe, kind) : '';
  return { kind, mimeType, supported, isGuitarPro };
}

/** Strip the extension: 'Song.gp5' -> 'Song', 'Song.musi-tab.json' -> 'Song'. */
export function baseNameOf(fileName) {
  const name = String(fileName || '');
  if (/\.musi-tab\.json$/i.test(name)) {
    return name.replace(/\.musi-tab\.json$/i, '');
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function modelsFromGp(gp) {
  const defaultIndex = Number.isFinite(gp?.defaultIndex) ? gp.defaultIndex : 0;
  const guitarModel = gp?.tracks?.[defaultIndex >= 0 ? defaultIndex : 0]?.model
    || gp?.tracks?.[0]?.model
    || gp?.model
    || null;
  const percModel = gp?.drumTracks?.[0]?.model || null;
  return { guitarModel, percModel };
}

function countSectionMarkers(digests) {
  return (digests || []).filter((d) => d?.marker).length;
}

function collapseWholeScoreSegments(segments, measureCount) {
  if (!segments?.length) return [];
  if (segments.length > 1) return segments;
  const seg = segments[0];
  const last = Math.max(0, measureCount - 1);
  if (seg.startIdx <= 0 && seg.endIdx >= last) return [];
  return segments;
}

function computeSegments(entry, { splitBySection = true, fallbackMode = 'whole', everyN = 8 } = {}) {
  if (!entry?.isGuitarPro || !entry.gp || !entry.digests?.length) {
    return { segments: [], splitMode: 'none' };
  }

  const measureCount = entry.measureCount || entry.digests.length;
  let segments = [];
  let splitMode = 'none';

  if (splitBySection && entry.sectionCount > 0) {
    segments = autoSplitByMarkers(entry.digests);
    splitMode = 'section';
  } else if (fallbackMode === 'everyN') {
    segments = autoSplitEveryN(entry.digests, everyN);
    splitMode = 'everyN';
  }

  segments = collapseWholeScoreSegments(segments, measureCount);
  if (!segments.length) splitMode = 'none';
  return { segments, splitMode };
}

/**
 * Recompute the planned segments for an already-analyzed entry when the user changes
 * split options in the modal. Mutates and returns the entry. Never re-parses.
 */
export function planEntrySegments(entry, { splitBySection = true, fallbackMode = 'whole', everyN = 8 } = {}) {
  const { segments, splitMode } = computeSegments(entry, { splitBySection, fallbackMode, everyN });
  entry.segments = segments;
  entry.splitMode = splitMode;
  return entry;
}

/** Human-readable one-line summary of what an entry will produce, for the modal preview. */
export function describeEntryPlan(entry) {
  if (!entry?.supported) {
    if (entry?.skipReason === 'too-large') return 'Skipped — file too large';
    return 'Skipped — unsupported file type';
  }
  if (entry?.parseError) return 'Whole file — could not read sections';
  if (entry?.splitMode === 'section' && entry.segments?.length) {
    const n = entry.segments.length;
    return `${n} section${n === 1 ? '' : 's'}`;
  }
  if (entry?.splitMode === 'everyN' && entry.segments?.length) {
    const chunkBars = entry.segments[0]
      ? (entry.segments[0].endIdx - entry.segments[0].startIdx + 1)
      : 0;
    const n = entry.segments.length;
    return `${n} chunk${n === 1 ? '' : 's'} of ${chunkBars} bar${chunkBars === 1 ? '' : 's'}`;
  }
  if (entry?.isGuitarPro && entry?.gp && entry?.sectionCount === 0 && entry?.splitMode === 'none') {
    return 'Whole file — no section markers';
  }
  return 'Whole file';
}

function clampName(value, limit = NAME_LIMIT) {
  const s = String(value || '').trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit);
}

function saveDisplayName(rawName) {
  return String(rawName || '').replace(/[^\w\- ]+/g, '').trim() || 'exercise';
}

function resolveSegmentName(segment, entry, prefixSegmentNames) {
  const startIdx = segment.startIdx;
  const endIdx = segment.endIdx;
  let name = (segment.name || '').trim() || formatBarRange(startIdx, endIdx);
  const baseName = entry.baseName;
  if (prefixSegmentNames && baseName && !name.startsWith(baseName)) {
    name = `${baseName} \u2014 ${name}`;
  }
  return clampName(name);
}

async function parseScoreFile(file, parse) {
  const classified = classifyUploadFile(file);
  if (classified.kind === 'tab-model') {
    const raw = JSON.parse(await file.text());
    return gpResultFromTabModelJson(raw);
  }
  const bytes = await file.arrayBuffer();
  return parse(bytes);
}

/**
 * Read + parse each picked file and pre-compute its section split, WITHOUT saving anything.
 * @param {File[]|ArrayLike<File>} files
 * @param {object} [opts]
 * @returns {Promise<BulkEntry[]>}
 */
export async function analyzeBulkFiles(files, opts = {}) {
  const {
    splitBySection = true,
    fallbackMode = 'whole',
    everyN = 8,
    maxBytes = BULK_MAX_FILE_BYTES,
    parse = parseGuitarPro,
    onProgress,
  } = opts;

  const list = Array.from(files || []);
  const entries = [];

  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const fileName = file?.name || '';
    const classified = classifyUploadFile(file);
    const baseName = baseNameOf(fileName);

    const entry = {
      id: `bulk-${i}`,
      file,
      fileName,
      baseName,
      size: Number(file?.size) || 0,
      kind: classified.kind,
      mimeType: classified.mimeType,
      supported: classified.supported,
      include: classified.supported,
      skipReason: '',
      isGuitarPro: classified.isGuitarPro,
      gp: null,
      digests: [],
      measureCount: 0,
      sectionCount: 0,
      segments: [],
      splitMode: 'none',
      parseError: '',
    };

    if (!classified.supported) {
      entry.include = false;
      entry.skipReason = 'unsupported';
    } else if (entry.size > maxBytes) {
      entry.supported = false;
      entry.include = false;
      entry.skipReason = 'too-large';
    } else if (classified.isGuitarPro) {
      try {
        const gp = await parseScoreFile(file, parse);
        entry.gp = gp;
        const { guitarModel, percModel } = modelsFromGp(gp);
        entry.digests = buildMeasureDigests({ guitarModel, percModel });
        entry.measureCount = entry.digests.length;
        entry.sectionCount = countSectionMarkers(entry.digests);
        const planned = computeSegments(entry, { splitBySection, fallbackMode, everyN });
        entry.segments = planned.segments;
        entry.splitMode = planned.splitMode;
      } catch (err) {
        entry.parseError = err?.message || 'Could not parse score.';
        entry.segments = [];
        entry.splitMode = 'none';
      }
    }

    entries.push(entry);
    onProgress?.({ index: i, total: list.length, name: fileName });
  }

  return entries;
}

/**
 * Save the planned entries into the Exercises library.
 * @param {BulkEntry[]} entries
 * @param {object} deps
 * @param {string} [deps.categoryId] — folder for whole (non-split) files
 * @param {boolean} [deps.folderPerSplitFile=true] — auto-folder per split score (named after file)
 * @param {boolean} [deps.prefixSegmentNames=true] — prefix segment titles with score name when no auto-folder
 * @param {boolean} [deps.keepWholeScore=false] — also import the full score alongside sections
 * @returns {Promise<{ ok: boolean, added: number, segments: number, files: number,
 *                     skipped: number, folders: number, message: string,
 *                     errors: Array<{ name: string, message: string }> }>}
 */
export async function importBulkEntries(entries, deps) {
  const {
    categoryId = '',
    folderPerSplitFile = true,
    prefixSegmentNames = true,
    keepWholeScore = false,
    createFolder,
    addGpExercise,
    addMediaExercise,
    saveFile = defaultSaveFile,
    attachmentsSupported: checkAttachments = attachmentsSupported,
    ensurePersistentStorage: ensureStorage = ensurePersistentStorage,
    onProgress,
  } = deps || {};

  const emptyResult = (message) => ({
    ok: false,
    added: 0,
    segments: 0,
    files: 0,
    skipped: 0,
    folders: 0,
    message,
    errors: [],
  });

  if (!checkAttachments()) {
    return emptyResult('Browser storage unavailable — cannot save exercises.');
  }

  const list = Array.isArray(entries) ? entries : [];
  const included = list.filter((e) => e?.include);
  const skipped = list.length - included.length;
  const errors = [];
  let added = 0;
  let segmentCount = 0;
  let fileCount = 0;
  const folderIds = new Set();
  const sourceFileIds = new Set();

  try {
    await ensureStorage();
  } catch (err) {
    return emptyResult(err?.message || 'Could not prepare storage.');
  }

  const total = included.length;
  for (let i = 0; i < included.length; i++) {
    const entry = included[included.length - 1 - i];
    const progressIndex = included.length - 1 - i;
    onProgress?.({
      index: progressIndex,
      total,
      label: entry.fileName || entry.baseName || 'file',
      added,
    });

    try {
      let targetCategoryId = categoryId;
      let entryGotOwnFolder = false;
      const willAddSegments = entry.segments?.length > 0;
      const willAddWhole = !willAddSegments || keepWholeScore;

      if (folderPerSplitFile && willAddSegments && typeof createFolder === 'function') {
        const folder = createFolder(entry.baseName);
        if (folder?.id) {
          targetCategoryId = folder.id;
          entryGotOwnFolder = true;
          folderIds.add(folder.id);
        }
      }

      const effectivePrefixSegmentNames = prefixSegmentNames && !entryGotOwnFolder;

      if (willAddSegments) {
        for (const segment of [...entry.segments].reverse()) {
          const rawStart = Number(segment?.startIdx);
          const rawEnd = Number(segment?.endIdx);
          if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;

          const measureCount = entry.measureCount || entry.digests?.length || 1;
          const startIdx = Math.max(0, Math.min(measureCount - 1, Math.floor(Math.min(rawStart, rawEnd))));
          const endIdx = Math.max(startIdx, Math.min(measureCount - 1, Math.floor(Math.max(rawStart, rawEnd))));

          const beatInfo = segmentBeats(segment, entry.digests);
          const startBeat = Number.isFinite(segment.startBeat) ? segment.startBeat : beatInfo.startBeat;
          const endBeat = Number.isFinite(segment.endBeat) ? segment.endBeat : beatInfo.endBeat;
          const name = resolveSegmentName(segment, entry, effectivePrefixSegmentNames);
          const slicedGp = sliceGpResultByBeats(entry.gp, { startBeat, endBeat });
          const json = serializeExerciseScore(slicedGp, {
            sourceFileName: entry.fileName,
            measureStart: startIdx,
            measureEnd: endIdx,
          });
          const blob = new Blob([json], { type: 'application/x-musi-tab-model' });
          const segFileName = segmentExerciseFileName(entry.baseName, name);
          const meta = await saveFile({
            blob,
            name: saveDisplayName(name),
            type: 'application/x-musi-tab-model',
            fileName: segFileName,
            size: blob.size,
            source: 'exercise',
          });
          if (!meta) continue;
          const item = addGpExercise({
            attachmentId: meta.id,
            name,
            fileName: segFileName,
            type: 'application/x-musi-tab-model',
            size: blob.size,
            categoryId: targetCategoryId,
            loopEnabled: true,
            loopRestSec: 0,
            preferredTrackIndex: 0,
            bpm: null,
            transpose: 0,
            tuning: null,
            retuneMode: 'fingerings',
          });
          if (item) {
            added += 1;
            segmentCount += 1;
            sourceFileIds.add(entry.id);
          }
        }
      }

      if (willAddWhole) {
        const file = entry.file;
        const meta = await saveFile({
          blob: file,
          name: entry.baseName || 'Exercise',
          type: entry.mimeType,
          fileName: entry.fileName,
          size: entry.size,
          source: 'exercise',
        });
        if (meta) {
          const addFn = entry.isGuitarPro ? addGpExercise : addMediaExercise;
          const item = addFn({
            attachmentId: meta.id,
            name: entry.baseName || 'Exercise',
            fileName: entry.fileName,
            type: entry.mimeType,
            size: entry.size,
            categoryId: targetCategoryId,
            loopEnabled: false,
            loopRestSec: 0,
            preferredTrackIndex: 0,
            bpm: null,
            transpose: 0,
            tuning: null,
            retuneMode: 'fingerings',
          });
          if (item) {
            added += 1;
            fileCount += 1;
            sourceFileIds.add(entry.id);
          }
        }
      }
    } catch (err) {
      errors.push({
        name: entry.fileName || entry.baseName || 'file',
        message: err?.message || 'Import failed.',
      });
    }
  }

  const sourceFiles = sourceFileIds.size;
  let message = '';
  if (!added) {
    message = errors.length
      ? 'Could not add any exercises.'
      : 'No exercises were added.';
  } else {
    const sectionPart = segmentCount
      ? ` (${segmentCount} section${segmentCount === 1 ? '' : 's'})`
      : '';
    const folderPart = folderIds.size
      ? ` in ${folderIds.size} folder${folderIds.size === 1 ? '' : 's'}`
      : '';
    message = `Added ${added} exercise${added === 1 ? '' : 's'} from ${sourceFiles} file${sourceFiles === 1 ? '' : 's'}${sectionPart}${folderPart}.`;
    if (skipped) {
      message += ` Skipped ${skipped} file${skipped === 1 ? '' : 's'}.`;
    }
    if (errors.length) {
      message += ` ${errors.length} file${errors.length === 1 ? '' : 's'} had errors.`;
    }
  }

  return {
    ok: added > 0 || (included.length === 0 && !errors.length),
    added,
    segments: segmentCount,
    files: fileCount,
    skipped,
    folders: folderIds.size,
    message,
    errors,
  };
}
