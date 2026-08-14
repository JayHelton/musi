# Tasks: Nested Library Folders

**Spec**: `specs/004-nested-library-folders/spec.md`

**Plan**: `specs/004-nested-library-folders/plan.md`

## Phase 1 - Shared tree module

- [x] T001 Add `js/folderTree.js` with the pure helpers from the data model.
- [x] T002 Add `tests/folder-tree/run.mjs` and cover sanitize, depth, path, flatten,
      descendants, move validation, and sibling name lookup.

## Phase 2 - Exercises (depends on Phase 1)

- [x] T003 Keep `parentId` in `normalizeCategory` and repair the tree in `getStore`.
- [x] T004 Accept a parent in `addCategory` and `createExerciseFolder`, and dedupe per
      parent.
- [x] T005 Add `moveExerciseFolder` and export it.
- [x] T006 Lift child folders in `deleteCategory` and remove the subtree in
      `deleteCategoryWithContents`.
- [x] T007 Return `depth`, `parentId`, `path`, and `totalCount` from
      `getExerciseFolderOptions`.
- [x] T008 Filter the subtree in `visibleItems`.
- [x] T009 Render the sidebar tree with an expand control, Rename, Move, and Delete.
- [x] T010 Render nested folder sections in `renderList`.
- [x] T011 Indent the row folder menu options by depth.
- [x] T012 Show the folder path in the current-folder title and in the delete dialog text.
- [x] T013 Add the nested folder CSS to `css/exercises.css`.
- [x] T014 Add `tests/exercises/nested-folders.mjs` and register it in
      `tests/exercises/run.mjs`.

## Phase 3 - Workbooks (depends on Phase 1)

- [x] T015 Keep `parentId` in `normalizeWorkbookFolder` and repair the tree in `getStore`.
- [x] T016 Accept a parent in `createWorkbookFolder` and dedupe per parent.
- [x] T017 Add `moveWorkbookFolder`.
- [x] T018 Lift child folders in `deleteWorkbookFolder` and remove the subtree in
      `deleteWorkbookFolderWithContents`.
- [x] T019 Return `depth`, `parentId`, `path`, and `totalCount` from
      `getWorkbookFolderOptions`.
- [x] T020 Add `includeDescendants` to `listWorkbooks`.
- [x] T021 Render the sidebar tree with an expand control, Rename, Move, and Delete.
- [x] T022 Indent the card folder menu options and show the folder path in the title.
- [x] T023 Add the nested folder CSS to `css/workbooks.css`.
- [x] T024 Extend `tests/workbooks/run.mjs` with the nested folder cases.

## Phase 4 - Shell and sync (depends on Phase 2 and Phase 3)

- [x] T025 Indent the mobile folder sheet rows in `js/screenUx.js`.
- [x] T026 Add `js/folderTree.js` to `PRECACHE_URLS` and bump `CACHE_VERSION`.
- [x] T027 Add a sync test for `parentId` and for an orphan parent repair.
- [x] T028 Note the `parentId` field in `docs/supabase-sync-client.md`.

## Phase 5 - Verification

- [x] T029 Run every affected Node runner.
- [x] T030 Build a nested tree in Chrome in both libraries and record the result.
