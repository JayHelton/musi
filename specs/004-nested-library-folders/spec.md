# Feature Specification: Nested Library Folders

**Feature Branch**: `cursor/nested-folders-exercises-workbooks-1f6f`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Add nested folder support for exercises and workbooks"

## User Scenarios & Testing *(mandatory)*

The Exercises library and the Workbooks library both hold folders. Today a folder cannot
hold another folder. A learner with many files gets one long folder list. This feature
lets a folder hold child folders in both libraries. The learner builds a small tree, for
example "Guitar" with "Scales" and "Songs" inside it.

### User Story 1 - Create a folder inside a folder (Priority: P1)

A learner opens the Exercises screen. The learner selects the folder "Guitar". The learner
types a name in the new-folder field and submits it. Musi creates the new folder inside
"Guitar". The sidebar shows the new folder one level in from "Guitar".

**Why this priority**: Creation is the entry point. Without it, no other nested behaviour
can happen.

**Independent Test**: Select a folder. Create a folder. Confirm the new folder sits inside
the selected folder.

**Acceptance Scenarios**:

1. **Given** the learner selects the folder "Guitar", **When** the learner creates the
   folder "Scales", **Then** "Scales" becomes a child of "Guitar".
2. **Given** the learner selects "All Exercises", **When** the learner creates a folder,
   **Then** that folder sits at the top level.
3. **Given** a folder that already holds a child folder named "Scales", **When** the
   learner creates "Scales" in the same parent again, **Then** Musi keeps the existing
   folder and does not create a duplicate.
4. **Given** two different parents, **When** the learner creates "Scales" in each parent,
   **Then** both folders exist, because names are unique per parent only.
5. **Given** the same steps on the Workbooks screen, **When** the learner creates a folder
   in a selected folder, **Then** the workbook folder tree behaves the same way.

---

### User Story 2 - Browse the folder tree (Priority: P1)

A learner opens the Exercises screen. The sidebar shows the folder tree. Child folders sit
one level in from their parent. A parent folder shows an expand control. The learner
collapses a parent and its children leave the view. The learner selects a folder and the
list shows the exercises in that folder plus nested sections for its child folders.

**Why this priority**: A tree that the learner cannot read or fold is not usable.

**Independent Test**: Build a two-level tree. Collapse the parent. Confirm the children
disappear. Expand the parent. Confirm the children return.

**Acceptance Scenarios**:

1. **Given** a folder with child folders, **When** the sidebar renders, **Then** each child
   row shows an indent for its depth.
2. **Given** a folder with child folders, **When** the learner collapses the parent row,
   **Then** the child rows leave the sidebar.
3. **Given** a selected parent folder, **When** the list renders, **Then** the list shows
   the direct exercises of that folder and a section for each child folder.
4. **Given** a selected parent folder, **When** the title renders, **Then** the title shows
   the folder path, for example "Guitar › Scales".
5. **Given** a selected parent folder on the Workbooks screen, **When** the list renders,
   **Then** the list shows the workbooks of that folder and of its child folders.

---

### User Story 3 - Move a folder to another parent (Priority: P2)

A learner opens the folder tools on a folder row. The learner chooses Move. A dialog lists
the valid destinations. The learner picks a new parent and saves. The folder and everything
inside it move together.

**Why this priority**: A tree without a move action forces delete and rebuild.

**Independent Test**: Move a folder into another folder. Confirm the moved folder keeps its
child folders and its files.

**Acceptance Scenarios**:

1. **Given** a folder, **When** the learner moves it into another folder, **Then** the
   folder becomes a child of that folder.
2. **Given** a folder, **When** the learner moves it to the top level, **Then** the folder
   has no parent.
3. **Given** a folder, **When** the move dialog opens, **Then** the destination list omits
   the folder itself and all of its descendants.
4. **Given** a folder whose subtree is deep, **When** a move would push a descendant past
   the depth limit, **Then** Musi blocks the move and states the limit.
5. **Given** a moved folder, **When** the move completes, **Then** the exercises or
   workbooks inside it keep their folder.

---

### User Story 4 - Delete a folder that holds child folders (Priority: P2)

A learner deletes a folder. Musi states what the delete removes. The learner picks one of
two results. The first result keeps the content. The second result removes the whole
subtree.

**Why this priority**: A delete that silently drops nested content loses learner work.

**Independent Test**: Delete a parent folder with the keep option. Confirm the child
folders survive one level up.

**Acceptance Scenarios**:

1. **Given** a folder that holds child folders, **When** the learner deletes the folder
   only, **Then** the child folders move up to the parent of the deleted folder.
2. **Given** a folder that holds exercises directly, **When** the learner deletes the
   folder only, **Then** those exercises become unfiled.
3. **Given** a folder that holds a subtree, **When** the learner deletes the folder with
   its contents, **Then** Musi removes every folder in the subtree and every exercise in
   the subtree.
4. **Given** the delete dialog for a folder with a subtree, **When** the dialog renders,
   **Then** the counts include the nested content.
5. **Given** the same steps on the Workbooks screen, **When** the learner deletes a folder,
   **Then** the workbook folder tree behaves the same way.

---

### User Story 5 - File an item into a nested folder (Priority: P3)

A learner uses the folder menu on an exercise row. The menu lists every folder. Child
folders appear with an indent under their parent. The learner picks a child folder and the
exercise moves there.

**Why this priority**: Nested folders are useless if items cannot reach them.

**Acceptance Scenarios**:

1. **Given** a nested folder tree, **When** the folder menu on a row opens, **Then** the
   options show one indent step per depth level.
2. **Given** an exercise, **When** the learner picks a child folder, **Then** the exercise
   moves into that child folder.
3. **Given** a workbook card, **When** the learner picks a child folder, **Then** the
   workbook moves into that child folder.

---

### Edge Cases

- A stored folder points to a parent that no longer exists. Musi treats that folder as a
  top-level folder.
- A stored folder chain forms a cycle after a device sync merge. Musi breaks the cycle and
  moves the affected folder to the top level.
- A folder tries to become its own parent or the child of its own descendant. Musi rejects
  the move.
- A tree reaches the depth limit. Musi blocks a create or a move that would go deeper.
- An old store holds folders without a parent field. Musi reads them as top-level folders.
- A remote device deletes a parent folder. The local child folders become top-level
  folders on the next read.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An exercise folder record MUST hold a `parentId` string. An empty string
  means the folder sits at the top level.
- **FR-002**: A workbook folder record MUST hold a `parentId` string with the same meaning.
- **FR-003**: Musi MUST support a folder depth of up to 5 levels in both libraries.
- **FR-004**: Musi MUST reject a folder move that targets the folder itself or a
  descendant of that folder.
- **FR-005**: Musi MUST reject a create or a move that would push any folder past the
  depth limit.
- **FR-006**: Folder names MUST be unique per parent, not unique across the whole library.
- **FR-007**: A read of the store MUST repair a broken tree. Musi MUST move a folder with
  an unknown parent to the top level. Musi MUST break a cycle.
- **FR-008**: The new-folder field MUST create the folder inside the selected folder. It
  MUST create a top-level folder when the selection is "All" or "No folder".
- **FR-009**: The folder sidebar MUST show depth with an indent, and MUST let the learner
  expand and collapse a folder that holds child folders.
- **FR-010**: A folder view MUST show the direct items of the folder and a section for each
  child folder.
- **FR-011**: The current-folder title MUST show the folder path with "›" between names.
- **FR-012**: A folder row MUST offer Rename, Move, and Delete.
- **FR-013**: A delete of a folder only MUST move the child folders up one level and MUST
  unfile the items that sat directly in the deleted folder.
- **FR-014**: A delete of a folder with contents MUST remove the whole subtree of folders
  and every item in that subtree.
- **FR-015**: A folder picker on an item row MUST list every folder with an indent per
  depth level.
- **FR-016**: The Workbooks list for a selected folder MUST include the workbooks of the
  child folders.
- **FR-017**: The mobile folder sheet MUST show the same tree with an indent per depth
  level.
- **FR-018**: Device sync and cloud sync MUST carry `parentId` without a schema migration.

### Key Entities

- **Exercise folder (category)**: `{ id, name, parentId }` in `musi.exercises.categories`.
- **Workbook folder**: `{ id, name, parentId }` in `musi.workbooks.folders`.
- **Exercise item**: keeps one `categoryId`. The item files into one folder only.
- **Workbook**: keeps one `folderId`. The workbook files into one folder only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner creates a folder inside a folder in both libraries.
- **SC-002**: A learner reaches depth 5 and gets a clear message at the limit.
- **SC-003**: A learner moves a folder with content and loses nothing.
- **SC-004**: An old store with flat folders opens without an error and keeps every folder.
- **SC-005**: `node tests/exercises/run.mjs`, `node tests/workbooks/run.mjs`,
  `node tests/folder-tree/run.mjs`, and `node tests/sync/run.mjs` pass.

## Assumptions

- An item files into one folder only. This feature does not add multi-folder filing.
- The item order inside a folder stays the current order. This feature does not add manual
  sort.
- Drag and drop is out of scope. The Move dialog covers the same need.
