// Course import engine for the Exercises library (DOM-free).
//
// A course is a folder of folders. The user picks the top folder and this
// module does two things:
//
//   1. It mirrors the folder tree into the Exercises library, and it adds every
//      supported file (video, Guitar Pro, audio, PDF, document, image) as an
//      exercise in the folder that holds it.
//   2. It mirrors the same tree into the Workbooks library. Each course folder
//      that holds files becomes one workbook with those exercises, in course
//      order.
//
// Guitar Pro scores stay whole here. The bulk upload dialog is the place that
// splits a score into sections.
//
// This module never touches the DOM and never reads the stores. The caller
// passes the store functions in, so js/exercises.js and js/workbookModel.js
// stay the owners of their data.

import {
  BULK_MAX_FILE_BYTES,
  UPLOAD_ACCEPT_ATTR,
  baseNameOf,
  classifyUploadFile,
} from './exercisesBulk.js';
import { MAX_FOLDER_DEPTH } from './folderTree.js';
import {
  attachmentsSupported as defaultAttachmentsSupported,
  ensurePersistentStorage as defaultEnsureStorage,
  saveFile as defaultSaveFile,
} from './attachments.js';

/** A course import takes the same file types as a bulk upload. */
export const COURSE_ACCEPT_ATTR = UPLOAD_ACCEPT_ATTR;
export const COURSE_MAX_FILE_BYTES = BULK_MAX_FILE_BYTES;
export const COURSE_UNSUPPORTED_MSG = 'Only PDF, documents (doc, docx, txt, rtf, odt, md, pages, csv), images, audio, video, and Guitar Pro (.gp/.gp5) files up to 250 MB can be imported.';

const NAME_LIMIT = 120;
const FOLDER_NAME_LIMIT = 40;
/** The course folder itself takes one level, so its contents get the rest. */
const COURSE_ROOT_LEVELS = 1;

function clampText(value, limit) {
  const text = String(value == null ? '' : value).trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

/** The path a file carries when the user picks a folder. */
function relativePathOf(file) {
  if (!file) return '';
  const raw = file.webkitRelativePath || file.relativePath || file.path || file.name || '';
  return String(raw);
}

/** True for the files and folders an operating system adds by itself. */
function isNoiseSegment(segment) {
  if (!segment) return true;
  if (segment === '.' || segment === '..') return true;
  if (segment === '__MACOSX') return true;
  return segment.startsWith('.');
}

function splitPath(path) {
  return String(path || '')
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Sorts names the way a person reads them: "Lesson 2" before "Lesson 10". */
function naturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function joinPath(segments) {
  return segments.join('/');
}

function parentOf(path) {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? '' : path.slice(0, idx);
}

/**
 * How many folder levels the course contents can use below the course folder.
 * @param {number} baseDepth depth of the folder the course goes into (0 = root)
 */
export function courseDepthBudget(baseDepth = 0) {
  const base = Number.isFinite(Number(baseDepth)) ? Math.max(0, Number(baseDepth)) : 0;
  return Math.max(0, MAX_FOLDER_DEPTH - base - COURSE_ROOT_LEVELS);
}

function makeNode(path, name, depth) {
  return {
    path,
    name,
    parentPath: parentOf(path),
    depth,
    include: true,
    files: [],
  };
}

/**
 * Read the picked files and plan the import. Nothing is saved here.
 *
 * @param {FileList|File[]} files
 * @param {{ maxBytes?: number, baseDepth?: number, courseName?: string }} [opts]
 * @returns {{
 *   rootName: string,
 *   nodes: Array<object>,
 *   skipped: Array<{ path: string, fileName: string, reason: string }>,
 *   fileCount: number,
 *   folderCount: number,
 *   workbookCount: number,
 *   flattened: number,
 *   depthBudget: number,
 * }}
 */
export function planCourseImport(files, opts = {}) {
  const {
    maxBytes = COURSE_MAX_FILE_BYTES,
    baseDepth = 0,
    courseName = '',
  } = opts;

  const list = Array.from(files || []);
  const depthBudget = courseDepthBudget(baseDepth);
  const skipped = [];
  const nodes = new Map();
  let flattened = 0;

  // Every path a folder pick reports starts with the folder the user chose.
  // pathRoot is that segment; rootName is what the new folder gets called.
  let pathRoot = '';
  for (const file of list) {
    const segments = splitPath(relativePathOf(file));
    if (segments.length > 1) {
      pathRoot = segments[0];
      break;
    }
  }
  let rootName = clampText(courseName, FOLDER_NAME_LIMIT)
    || clampText(pathRoot, FOLDER_NAME_LIMIT)
    || 'Course';

  function ensureNode(segments) {
    const path = joinPath(segments);
    if (nodes.has(path)) return nodes.get(path);
    if (segments.length) ensureNode(segments.slice(0, -1));
    const node = makeNode(
      path,
      path ? segments[segments.length - 1] : rootName,
      segments.length + 1,
    );
    nodes.set(path, node);
    return node;
  }

  ensureNode([]);

  let index = 0;
  for (const file of list) {
    const segments = splitPath(relativePathOf(file));
    if (!segments.length) continue;

    const fileName = segments[segments.length - 1];
    let dirSegments = segments.slice(0, -1);
    // Files picked as a folder repeat the course folder in every path. Drop it.
    if (pathRoot && dirSegments.length && dirSegments[0] === pathRoot) {
      dirSegments = dirSegments.slice(1);
    }

    const displayPath = joinPath([...dirSegments, fileName]);
    if (isNoiseSegment(fileName) || dirSegments.some(isNoiseSegment)) {
      index += 1;
      continue;
    }

    const classified = classifyUploadFile(file);
    const size = Number(file?.size) || 0;
    if (!classified.supported) {
      skipped.push({ path: displayPath, fileName, reason: 'unsupported' });
      index += 1;
      continue;
    }
    if (size > maxBytes) {
      skipped.push({ path: displayPath, fileName, reason: 'too-large' });
      index += 1;
      continue;
    }

    let targetSegments = dirSegments;
    if (targetSegments.length > depthBudget) {
      targetSegments = targetSegments.slice(0, depthBudget);
      flattened += 1;
    }

    const node = ensureNode(targetSegments);
    node.files.push({
      id: `course-${index}`,
      file,
      fileName,
      name: clampText(baseNameOf(fileName), NAME_LIMIT) || 'Exercise',
      sourcePath: displayPath,
      kind: classified.kind,
      mimeType: classified.mimeType || file?.type || '',
      isGuitarPro: classified.isGuitarPro,
      size,
    });
    index += 1;
  }

  // Drop the folders that hold nothing, so an empty branch never makes a folder.
  const keep = new Set();
  for (const node of nodes.values()) {
    if (!node.files.length) continue;
    let path = node.path;
    keep.add(path);
    while (path) {
      path = parentOf(path);
      keep.add(path);
    }
  }
  for (const path of [...nodes.keys()]) {
    if (!keep.has(path)) nodes.delete(path);
  }

  for (const node of nodes.values()) {
    node.files.sort((a, b) => naturalCompare(a.fileName, b.fileName));
  }

  const ordered = [];
  const byParent = new Map();
  for (const node of nodes.values()) {
    if (!node.path) continue;
    if (!byParent.has(node.parentPath)) byParent.set(node.parentPath, []);
    byParent.get(node.parentPath).push(node);
  }
  for (const children of byParent.values()) {
    children.sort((a, b) => naturalCompare(a.name, b.name));
  }
  function walk(path) {
    const node = nodes.get(path);
    if (!node) return;
    ordered.push(node);
    for (const child of byParent.get(path) || []) walk(child.path);
  }
  walk('');

  const fileCount = ordered.reduce((sum, node) => sum + node.files.length, 0);
  const workbookCount = ordered.filter((node) => node.files.length > 0).length;

  return {
    rootName,
    nodes: ordered,
    skipped,
    fileCount,
    folderCount: ordered.length,
    workbookCount,
    flattened,
    depthBudget,
  };
}

/**
 * The folders the import will really touch, in course order. Turning a folder
 * off turns off everything below it.
 */
export function includedCourseNodes(plan) {
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const on = new Map();
  const included = [];
  // plan.nodes is depth-first, so a parent is always decided before its child.
  for (const node of nodes) {
    const parentOn = node.path ? on.get(node.parentPath) === true : true;
    const isOn = parentOn && node.include !== false;
    on.set(node.path, isOn);
    if (isOn) included.push(node);
  }
  return included;
}

/** What the plan adds right now, for the dialog summary. */
export function summarizeCoursePlan(plan, { makeWorkbooks = true } = {}) {
  const included = includedCourseNodes(plan);
  const exercises = included.reduce((sum, node) => sum + node.files.length, 0);
  const folders = included.length;
  const workbooks = makeWorkbooks
    ? included.filter((node) => node.files.length > 0).length
    : 0;
  return { exercises, folders, workbooks, skipped: plan?.skipped?.length || 0 };
}

function emptyResult(message) {
  return {
    ok: false,
    exercises: 0,
    folders: 0,
    workbooks: 0,
    workbookFolders: 0,
    skipped: 0,
    message,
    errors: [],
  };
}

/**
 * Save a planned course into the Exercises library and the Workbooks library.
 *
 * @param {object} plan a plan from planCourseImport()
 * @param {object} deps
 * @param {string} [deps.parentCategoryId] exercise folder the course goes into
 * @param {boolean} [deps.makeWorkbooks=true] also build the workbooks
 * @param {string} [deps.workbookParentFolderId] workbook folder the course goes into
 * @param {(name: string, parentId: string) => object|null} deps.createExerciseFolder
 * @param {(opts: object) => object|null} deps.addGpExercise
 * @param {(opts: object) => object|null} deps.addMediaExercise
 * @param {(name: string, parentId: string) => object|null} [deps.createWorkbookFolder]
 * @param {(opts: object) => object|null} [deps.createWorkbook]
 */
export async function importCoursePlan(plan, deps = {}) {
  const {
    parentCategoryId = '',
    makeWorkbooks = true,
    workbookParentFolderId = '',
    createExerciseFolder,
    addGpExercise,
    addMediaExercise,
    createWorkbookFolder,
    createWorkbook,
    saveFile = defaultSaveFile,
    attachmentsSupported = defaultAttachmentsSupported,
    ensurePersistentStorage = defaultEnsureStorage,
    onProgress,
  } = deps;

  if (typeof attachmentsSupported === 'function' && !attachmentsSupported()) {
    return emptyResult('Browser storage unavailable — cannot import a course.');
  }
  if (typeof createExerciseFolder !== 'function') {
    return emptyResult('Could not prepare the course folders.');
  }

  const included = includedCourseNodes(plan);
  if (!included.length || !included.some((node) => node.files.length)) {
    return emptyResult('No files to import.');
  }

  try {
    await ensurePersistentStorage();
  } catch (err) {
    return emptyResult(err?.message || 'Could not prepare storage.');
  }

  const errors = [];
  const categoryByPath = new Map();
  let folderCount = 0;

  // 1. Mirror the course folders. Parents come first, so a child always finds
  // the folder it belongs to.
  for (const node of included) {
    const parentId = node.path
      ? (categoryByPath.get(node.parentPath) ?? parentCategoryId)
      : parentCategoryId;
    const name = clampText(node.name, FOLDER_NAME_LIMIT) || 'Folder';
    let folder = null;
    try {
      folder = createExerciseFolder(name, parentId);
    } catch (err) {
      errors.push({ name, message: err?.message || 'Could not create the folder.' });
    }
    if (folder?.id) {
      categoryByPath.set(node.path, folder.id);
      folderCount += 1;
    } else {
      // Out of depth or refused: keep the files with the nearest folder above.
      categoryByPath.set(node.path, parentId);
    }
  }

  // 2. Add the files. The library shows the newest exercise first, so save the
  // list backwards to leave the course order on screen.
  const tasks = [];
  for (const node of included) {
    for (const file of node.files) tasks.push({ node, file });
  }

  const idsByPath = new Map();
  let exerciseCount = 0;

  for (let i = tasks.length - 1; i >= 0; i--) {
    const { node, file } = tasks[i];
    onProgress?.({
      index: tasks.length - 1 - i,
      total: tasks.length,
      label: file.fileName,
      added: exerciseCount,
    });

    try {
      const meta = await saveFile({
        blob: file.file,
        name: file.name || 'Exercise',
        type: file.mimeType,
        fileName: file.fileName,
        size: file.size,
        source: 'exercise',
      });
      if (!meta) {
        errors.push({ name: file.sourcePath, message: 'Could not save the file.' });
        continue;
      }
      const addFn = file.isGuitarPro ? addGpExercise : addMediaExercise;
      const item = typeof addFn === 'function'
        ? addFn({
          attachmentId: meta.id,
          name: file.name || 'Exercise',
          fileName: file.fileName,
          type: file.mimeType,
          size: file.size,
          categoryId: categoryByPath.get(node.path) || '',
          loopEnabled: false,
          loopRestSec: 0,
          preferredTrackIndex: 0,
          bpm: null,
          transpose: 0,
          tuning: null,
          retuneMode: 'fingerings',
        })
        : null;
      if (!item?.id) {
        errors.push({ name: file.sourcePath, message: 'Could not add the exercise.' });
        continue;
      }
      if (!idsByPath.has(node.path)) idsByPath.set(node.path, []);
      idsByPath.get(node.path).unshift(item.id);
      exerciseCount += 1;
    } catch (err) {
      errors.push({ name: file.sourcePath, message: err?.message || 'Import failed.' });
    }
  }

  // 3. Mirror the tree again in Workbooks. A folder with files becomes one
  // workbook, filed in the folder that mirrors the folder above it.
  let workbookCount = 0;
  let workbookFolderCount = 0;

  const canBuildWorkbooks = makeWorkbooks
    && typeof createWorkbookFolder === 'function'
    && typeof createWorkbook === 'function';

  if (canBuildWorkbooks && exerciseCount > 0) {
    const nodeByPath = new Map(included.map((node) => [node.path, node]));
    const workbookFolderByPath = new Map();

    function ensureWorkbookFolder(path) {
      if (workbookFolderByPath.has(path)) return workbookFolderByPath.get(path);
      const node = nodeByPath.get(path);
      const parentId = path
        ? ensureWorkbookFolder(node ? node.parentPath : '')
        : workbookParentFolderId;
      const name = clampText(node ? node.name : plan?.rootName, FOLDER_NAME_LIMIT) || 'Course';
      let folderId = parentId;
      try {
        const folder = createWorkbookFolder(name, parentId);
        if (folder?.id) {
          folderId = folder.id;
          workbookFolderCount += 1;
        }
      } catch (err) {
        errors.push({ name, message: err?.message || 'Could not create the workbook folder.' });
      }
      workbookFolderByPath.set(path, folderId);
      return folderId;
    }

    for (const node of included) {
      const exerciseIds = idsByPath.get(node.path) || [];
      if (!exerciseIds.length) continue;
      // The course folder itself keeps its own name; every other folder is
      // named inside the folder that mirrors its parent.
      const folderId = ensureWorkbookFolder(node.path ? node.parentPath : '');
      const name = clampText(node.name, NAME_LIMIT) || 'Workbook';
      try {
        const workbook = createWorkbook({ name, folderId, exerciseIds });
        if (workbook?.id) workbookCount += 1;
      } catch (err) {
        errors.push({ name, message: err?.message || 'Could not create the workbook.' });
      }
    }
  }

  const skippedCount = plan?.skipped?.length || 0;
  let message = '';
  if (!exerciseCount) {
    message = errors.length ? 'Could not import the course.' : 'No exercises were added.';
  } else {
    message = `Imported ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`
      + ` into ${folderCount} folder${folderCount === 1 ? '' : 's'}`;
    if (workbookCount) {
      message += ` and made ${workbookCount} workbook${workbookCount === 1 ? '' : 's'}`;
    }
    message += '.';
    if (skippedCount) {
      message += ` Skipped ${skippedCount} file${skippedCount === 1 ? '' : 's'}.`;
    }
    if (errors.length) {
      message += ` ${errors.length} file${errors.length === 1 ? '' : 's'} had errors.`;
    }
  }

  return {
    ok: exerciseCount > 0,
    exercises: exerciseCount,
    folders: folderCount,
    workbooks: workbookCount,
    workbookFolders: workbookFolderCount,
    skipped: skippedCount,
    message,
    errors,
  };
}
