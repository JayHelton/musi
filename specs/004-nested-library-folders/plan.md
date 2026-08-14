# Implementation Plan: Nested Library Folders

**Branch**: `cursor/nested-folders-exercises-workbooks-1f6f`

**Spec**: `specs/004-nested-library-folders/spec.md`

## Summary

Add a `parentId` field to exercise folders and to workbook folders. Add one shared,
DOM-free tree module. Then use that module in both libraries for storage repair, folder
create, folder move, folder delete, and folder rendering. Keep the storage keys and the
sync domains as they are.

## Technical context

- **Language**: plain ES modules, no build step, no framework.
- **Storage**: `localStorage` keys `musi.exercises` and `musi.workbooks`.
- **Sync**: `js/sync/syncProfile.js` merges folders by id. `js/cloud/recordMap.js` maps
  folders to the `exerciseCategories` and `workbookFolders` domains. Both carry whole
  folder objects, so no schema change is needed.
- **Tests**: zero-dependency Node runners under `tests/`.
- **Theme**: the Atomic Purple Game Boy Color system in `css/base.css` and
  `css/theme-gbc.css`. New folder rules reuse the existing tokens.

## Constitution check

- The feature stays frontend-only. It adds no backend and no dependency.
- The feature keeps the offline-first model. All state stays on the device.
- The feature reuses theme tokens, so the retro look holds.
- The feature keeps old stores readable, so no learner loses data.

## Architecture

### New module: `js/folderTree.js`

The module holds pure functions over a folder array. It has no DOM access and no storage
access, so both libraries and the Node tests can use it. `specs/004-nested-library-folders/
data-model.md` lists the exported helpers.

### Exercises: `js/exercises.js`

- `normalizeCategory` keeps `parentId`.
- `getStore` runs `sanitizeFolderTree` after it normalizes the categories.
- `addCategory(name, parentId)` and `createExerciseFolder(name, parentId)` accept a parent
  and dedupe against siblings only.
- `moveExerciseFolder(id, parentId)` validates with `canMoveFolder`.
- `deleteCategory(id)` lifts the child folders to the parent of the removed folder.
- `deleteCategoryWithContents(id)` removes the subtree of folders and the subtree items.
- `getExerciseFolderOptions()` returns depth-first rows with `depth`, `parentId`, `path`,
  and `totalCount`.
- `visibleItems()` returns the subtree items for a folder selection.
- `renderCategories()` renders an indented tree with an expand control per parent.
- `renderList()` renders nested folder sections through one recursive builder.
- `buildCategorySelect()` indents each option by depth.
- The current-folder title shows the folder path.

### Workbooks: `js/workbookModel.js` and `js/workbooks.js`

- `normalizeWorkbookFolder` keeps `parentId`.
- `getStore` runs `sanitizeFolderTree`.
- `createWorkbookFolder(name, parentId)` dedupes against siblings only.
- `moveWorkbookFolder(id, parentId)` validates with `canMoveFolder`.
- `deleteWorkbookFolder(id)` lifts the child folders one level.
- `deleteWorkbookFolderWithContents(id)` removes the subtree and its workbooks.
- `listWorkbooks({ folderId, includeDescendants })` keeps the old default of `false`.
- `renderFolders()` renders the indented tree with Rename, Move, and Delete.
- `buildFolderSelect()` indents each option by depth.

### Mobile: `js/screenUx.js`

The folder sheet reads `getExerciseFolderOptions()` and indents each row by `depth`.

### Service worker

Add `js/folderTree.js` to `PRECACHE_URLS` and bump `CACHE_VERSION`.

## Testing strategy

| Runner | Scope |
|--------|-------|
| `node tests/folder-tree/run.mjs` | Every helper in `js/folderTree.js`. |
| `node tests/exercises/run.mjs` | Nested create, move, delete, options, filter, legacy read. |
| `node tests/workbooks/run.mjs` | The same cases for workbook folders. |
| `node tests/sync/run.mjs` | A merge keeps `parentId` and repairs an orphan. |
| Browser check | Build a tree in both libraries in Chrome and record the result. |

## Risks

| Risk | Response |
|------|----------|
| A sync merge leaves an orphan parent or a cycle. | Repair on every store read. |
| An old store loses folders. | Reads never drop a folder; a bad parent only resets. |
| A caller reads the old option fields. | Keep `id`, `label`, and `count` unchanged. |
| A deep tree breaks the layout. | Cap the depth at 5 and cap the indent step in CSS. |
