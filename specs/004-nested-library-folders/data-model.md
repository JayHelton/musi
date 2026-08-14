# Data Model: Nested Library Folders

## Exercise folder (category)

Stored in `localStorage` under `musi.exercises` in the `categories` array.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | string | `cat-<base36>-<rand>` | Unchanged. |
| `name` | string | `"Folder"` | Max 40 characters. Unique per parent. |
| `parentId` | string | `""` | New field. Empty means top level. |

## Workbook folder

Stored in `localStorage` under `musi.workbooks` in the `folders` array.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | string | `wbf-<base36>-<rand>` | Unchanged. |
| `name` | string | `"Folder"` | Max 40 characters. Unique per parent. |
| `parentId` | string | `""` | New field. Empty means top level. |

## Items

`musi.exercises.items[].categoryId` and `musi.workbooks.workbooks[].folderId` stay single
strings. An item files into one folder. Nesting lives on the folder record only.

## Invariants

1. `parentId` never equals the folder `id`.
2. The parent chain of a folder never contains that folder. No cycle exists.
3. `parentId` either is empty or matches an existing folder `id`.
4. The depth of a folder is at most `MAX_FOLDER_DEPTH` (5). A top-level folder has depth 1.

A store read repairs any broken invariant:

- An unknown `parentId` becomes `""`.
- A cycle breaks at the folder that closes the loop. That folder becomes top level.
- A folder past the depth limit stays in place. Reads never drop a folder.

## Derived values

The shared module `js/folderTree.js` computes these values. It never touches storage.

| Helper | Result |
|--------|--------|
| `sanitizeFolderTree(folders)` | A repaired folder list plus a changed flag. |
| `folderChildren(folders, parentId)` | The direct children in store order. |
| `folderDescendantIds(folders, id)` | A `Set` of every descendant id. |
| `folderSubtreeIds(folders, id)` | The folder id plus every descendant id. |
| `folderDepth(folders, id)` | 1 for a top-level folder. |
| `folderPath(folders, id)` | The folder records from the root to the folder. |
| `folderPathLabel(folders, id, sep)` | `"Guitar › Scales"`. |
| `flattenFolderTree(folders)` | Depth-first rows: `{ id, name, parentId, depth, path }`. |
| `folderSubtreeHeight(folders, id)` | 1 for a leaf folder. |
| `canMoveFolder(folders, id, nextParentId)` | `{ ok, reason }`. |
| `findSiblingByName(folders, parentId, name)` | The sibling with that name, or `null`. |
| `validDropTargets(folders, id)` | The destinations a move may use. |

`canMoveFolder` returns one of these reasons when it blocks a move: `missing`, `self`,
`descendant`, `depth`, or `parent-missing`.

## Folder options shape

`getExerciseFolderOptions()` and `getWorkbookFolderOptions()` keep their current fields and
add three. Callers that only read `id`, `label`, and `count` keep working.

| Field | Notes |
|-------|-------|
| `id` | `"all"`, `"uncategorized"`, or a folder id. |
| `label` | The folder name. Not indented. |
| `count` | The direct item count. |
| `totalCount` | The subtree item count. New field. |
| `depth` | 0 for `"all"` and `"uncategorized"`, else 1 or more. New field. |
| `parentId` | `""` for the synthetic rows. New field. |
| `path` | The path label, for example `"Guitar › Scales"`. New field. |

The rows arrive in depth-first order, so a caller can render the tree in one pass.

## Sync

`js/cloud/recordMap.js` copies whole folder objects into the `exerciseCategories` and
`workbookFolders` domains. The `parentId` field travels inside that payload, so Postgres
needs no migration. `js/sync/syncProfile.js` merges folders by id, so a merge keeps
`parentId`. A merge can still produce an unknown parent when one device deletes a parent.
The store read repairs that case.
