// Pure helpers over folder records { id, name, parentId }. Shared by the
// Exercises and Workbooks libraries. No DOM access and no storage access.

export const MAX_FOLDER_DEPTH = 5;
export const FOLDER_PATH_SEPARATOR = ' \u203A ';

export function normalizeParentId(raw) {
  return typeof raw === 'string' ? raw : '';
}

function folderIdSet(folders) {
  const ids = new Set();
  for (const folder of folders) {
    if (folder && typeof folder.id === 'string' && folder.id) {
      ids.add(folder.id);
    }
  }
  return ids;
}

function cycleBreakIds(folders) {
  const byId = new Map();
  for (const folder of folders) {
    if (folder && typeof folder.id === 'string' && folder.id) {
      byId.set(folder.id, folder);
    }
  }

  const breaks = new Set();
  for (const folder of folders) {
    if (!folder || typeof folder.id !== 'string' || !folder.id) continue;

    const visited = new Set();
    let current = folder.id;
    while (current && byId.has(current)) {
      if (visited.has(current)) break;
      visited.add(current);
      const parentId = normalizeParentId(byId.get(current).parentId);
      if (!parentId) break;
      if (visited.has(parentId)) {
        breaks.add(current);
        break;
      }
      if (!byId.has(parentId)) break;
      current = parentId;
    }
  }
  return breaks;
}

export function sanitizeFolderTree(folders) {
  const source = Array.isArray(folders) ? folders : [];
  const ids = folderIdSet(source);
  const breaks = cycleBreakIds(source);
  let changed = false;

  const repaired = source.map((folder) => {
    if (!folder || typeof folder !== 'object') {
      return folder;
    }

    const id = typeof folder.id === 'string' ? folder.id : '';
    let parentId = normalizeParentId(folder.parentId);

    if (parentId === id || (parentId && !ids.has(parentId)) || breaks.has(id)) {
      parentId = '';
    }

    if (normalizeParentId(folder.parentId) !== parentId) {
      changed = true;
    }

    return { ...folder, parentId };
  });

  return { folders: repaired, changed };
}

export function folderById(folders, id) {
  if (!id || typeof id !== 'string') return null;
  for (const folder of folders) {
    if (folder && folder.id === id) return folder;
  }
  return null;
}

export function folderChildren(folders, parentId) {
  const normalizedParent = normalizeParentId(parentId);
  const children = [];
  for (const folder of folders) {
    if (!folder) continue;
    if (normalizeParentId(folder.parentId) === normalizedParent) {
      children.push(folder);
    }
  }
  return children;
}

export function folderDescendantIds(folders, id) {
  const descendants = new Set();
  if (!id) return descendants;

  const queue = folderChildren(folders, id).map((f) => f.id);
  while (queue.length) {
    const childId = queue.shift();
    if (!childId || descendants.has(childId)) continue;
    descendants.add(childId);
    for (const child of folderChildren(folders, childId)) {
      queue.push(child.id);
    }
  }
  return descendants;
}

export function folderSubtreeIds(folders, id) {
  const subtree = new Set();
  if (!id) return subtree;
  subtree.add(id);
  for (const descendantId of folderDescendantIds(folders, id)) {
    subtree.add(descendantId);
  }
  return subtree;
}

export function folderDepth(folders, id) {
  if (!id || typeof id !== 'string') return 0;
  if (!folderById(folders, id)) return 0;

  const limit = folders.length + 1;
  let depth = 0;
  let current = id;
  const visited = new Set();

  while (current && depth < limit) {
    if (visited.has(current)) break;
    visited.add(current);
    const folder = folderById(folders, current);
    if (!folder) break;
    depth += 1;
    const parentId = normalizeParentId(folder.parentId);
    if (!parentId) break;
    current = parentId;
  }

  return depth;
}

export function folderPath(folders, id) {
  if (!id || !folderById(folders, id)) return [];

  const path = [];
  const limit = folders.length + 1;
  let current = id;
  const visited = new Set();

  while (current && path.length < limit) {
    if (visited.has(current)) break;
    visited.add(current);
    const folder = folderById(folders, current);
    if (!folder) break;
    path.unshift(folder);
    const parentId = normalizeParentId(folder.parentId);
    if (!parentId) break;
    current = parentId;
  }

  return path;
}

export function folderPathLabel(folders, id, separator) {
  const path = folderPath(folders, id);
  if (!path.length) return '';
  const sep = typeof separator === 'string' ? separator : FOLDER_PATH_SEPARATOR;
  return path.map((folder) => folder.name).join(sep);
}

function effectiveParentId(folders, folder, ids) {
  const parentId = normalizeParentId(folder.parentId);
  if (!parentId || parentId === folder.id || !ids.has(parentId)) {
    return '';
  }
  return parentId;
}

export function flattenFolderTree(folders) {
  const source = Array.isArray(folders) ? folders : [];
  const ids = folderIdSet(source);
  const rows = [];
  const visited = new Set();

  function walk(parentId, depth) {
    for (const folder of source) {
      if (!folder || typeof folder.id !== 'string' || !folder.id) continue;
      if (visited.has(folder.id)) continue;
      if (effectiveParentId(source, folder, ids) !== parentId) continue;

      visited.add(folder.id);
      rows.push({
        id: folder.id,
        name: folder.name,
        parentId: normalizeParentId(folder.parentId),
        depth,
        path: folderPathLabel(source, folder.id),
      });
      walk(folder.id, depth + 1);
    }
  }

  walk('', 1);
  return rows;
}

export function folderSubtreeHeight(folders, id) {
  if (!id || !folderById(folders, id)) return 0;

  const children = folderChildren(folders, id);
  if (!children.length) return 1;

  let maxChild = 0;
  for (const child of children) {
    maxChild = Math.max(maxChild, folderSubtreeHeight(folders, child.id));
  }
  return maxChild + 1;
}

export function canMoveFolder(folders, id, nextParentId) {
  const folder = folderById(folders, id);
  if (!folder) {
    return { ok: false, reason: 'missing' };
  }

  const targetParent = normalizeParentId(nextParentId);
  if (targetParent === id) {
    return { ok: false, reason: 'self' };
  }

  if (targetParent && !folderById(folders, targetParent)) {
    return { ok: false, reason: 'parent-missing' };
  }

  if (targetParent && folderDescendantIds(folders, id).has(targetParent)) {
    return { ok: false, reason: 'descendant' };
  }

  const parentDepth = targetParent ? folderDepth(folders, targetParent) : 0;
  const subtreeHeight = folderSubtreeHeight(folders, id);
  if (parentDepth + subtreeHeight > MAX_FOLDER_DEPTH) {
    return { ok: false, reason: 'depth' };
  }

  return { ok: true, reason: '' };
}

export function findSiblingByName(folders, parentId, name) {
  const normalizedParent = normalizeParentId(parentId);
  const needle = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!needle) return null;

  for (const folder of folders) {
    if (!folder) continue;
    if (normalizeParentId(folder.parentId) !== normalizedParent) continue;
    const siblingName = typeof folder.name === 'string' ? folder.name.trim().toLowerCase() : '';
    if (siblingName === needle) return folder;
  }
  return null;
}

export function validMoveTargets(folders, id) {
  const rows = flattenFolderTree(folders);
  const targets = [];
  for (const row of rows) {
    if (canMoveFolder(folders, id, row.id).ok) {
      targets.push(row);
    }
  }
  return targets;
}

export function nextParentAfterDelete(folders, id) {
  const folder = folderById(folders, id);
  if (!folder) return '';
  const parentId = normalizeParentId(folder.parentId);
  if (!parentId || !folderById(folders, parentId)) return '';
  return parentId;
}
