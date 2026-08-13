# Contract: tool shell

**Owner modules**: `js/shell/nav.js`, `js/shell/navStack.js`, `js/shell/toolPage.js`,
`js/shell/unsavedGuard.js`

**Consumers**: `js/main.js`, `js/tools/home.js`, `js/library/library.js`,
`js/routineNav.js`, every tool section that adopts the shell

**Requirements**: FR-014 to FR-020, FR-026 to FR-031, FR-099, FR-100

One implementation owns the fixed app bar, the primary navigation chrome, the standard
tool page layout, the navigation stack, and the unsaved-work guard. This contract fixes
the module layout, the interfaces, the Back agreement, focus rules, and test hooks.

## 1. Purpose

The tool shell gives every retained tool the same page order, the same navigation
behavior, and the same Back result across Tools, Library, Search, Recents, workbooks,
and routines (FR-014 to FR-020, FR-026 to FR-031). The shell also enforces keyboard
focus rules after navigation and after a dialog closes (FR-099, FR-100).

## 2. Module layout

The new directory `js/shell/` holds four modules:

| Module | Role |
| --- | --- |
| `js/shell/nav.js` | Fixed app bar, desktop left rail, mobile bottom bar |
| `js/shell/navStack.js` | Route origin, view state, scroll, focus |
| `js/shell/toolPage.js` | Standard tool page mount and descriptor |
| `js/shell/unsavedGuard.js` | Unsaved-work registry and leave prompt |

## 3. `js/shell/nav.js`

`nav.js` renders the fixed app bar, the desktop left rail with Tools, Library,
Routines, and Settings, and the mobile bottom bar with Tools, Library, Routines, and
More. More opens a sheet through the existing `openSelectionSheet` in
`js/selectionSheet.js`. More does not list individual tools (decision D9).

`nav.js` replaces:

| Removed surface | Location today |
| --- | --- |
| `rebuildDesktopDock` | `js/main.js` |
| Five mobile category buttons | `js/main.js` |
| Four `hub-<categoryId>` routes | `hub-train`, `hub-reference`, `hub-create`, `hub-tools` |

Primary navigation lists no individual tool (FR-005). The rail and the bottom bar show
only Tools, Library, Routines, and Settings or More.

## 4. `js/shell/toolPage.js` interface

```javascript
export function mountToolPage(sectionEl, descriptor) // -> { workspace, setContextRow, setModes, destroy }
```

### 4.1 Descriptor shape

```javascript
descriptor = {
  id: string,              // tool id, for example 'metronome'
  title: string,           // visible page title
  modes: ModeTab[],        // mode tab list for initSubviewTabs
  defaultMode: string,     // mode id when params carry no mode
  contextFields: string[], // fields the context row shows, for example ['root', 'scale', 'tuning']
  moreItems: MenuItem[],   // overflow menu entries for openOverflowMenu
  isFavorite: boolean,     // current favorite state for the header control
}
```

```javascript
ModeTab = { id: string, label: string }
MenuItem = { id: string, label: string, destructive?: boolean, onSelect: () => void }
```

### 4.2 Fixed render order

The shell renders controls in this order (FR-014 to FR-016):

1. Header with Back, title, favorite, and More in that order (FR-014).
2. Context row for root, scale, tuning, tempo, or meter when the tool needs it
   (FR-015).
3. Mode tabs (FR-016).
4. Main workspace element. The tool mounts its feature markup inside this slot.
5. Primary controls (FR-016).
6. Advanced-options drawer (FR-016).

The shell reuses `initSubviewTabs` from `js/uxPrimitives.js` for the mode tabs. The
shell reuses `openOverflowMenu` from `js/uxPrimitives.js` for the More menu. The shell
reuses `openSelectionSheet` from `js/selectionSheet.js` for a searchable option set,
including tuning lists (FR-018).

### 4.3 Primary action rule

The shell shows one primary action at a time (FR-017). The shell puts destructive
actions and secondary actions in More or in the advanced-options drawer (FR-017).

### 4.4 Return value

| Field | Type | Meaning |
| --- | --- | --- |
| `workspace` | `Element` | The main workspace slot inside the shell |
| `setContextRow` | `(fields) => void` | Update the visible context row fields |
| `setModes` | `(modes, activeId) => void` | Replace the mode tab list |
| `destroy` | `() => void` | Unmount shell chrome and release listeners |

A tool change inside the shell must preserve compatible context when the player changes
mode (FR-019). The shell shows no quiz interface outside Pitch & Ear (FR-020).

### 4.5 Incremental adoption

Per decision D14, a tool adopts the shell one at a time. WP-03 introduces the shell and
converts two tools. WP-04 to WP-07 convert the rest. An unconverted tool keeps its
current markup inside the workspace slot, so the app stays runnable between packages.

## 5. `js/shell/navStack.js` interface

```javascript
export function pushRoute(route, origin)
export function popRoute()
export function currentOrigin()
export function saveViewState(routeKey, state)
export function readViewState(routeKey)
export function restoreScroll(routeKey)
export function focusHeading(sectionEl)
```

### 5.1 Origin values

`origin` is one of: `tools`, `library`, `workbook`, `routine`, `search`, `recent`, or
`direct`. Navigation preserves origin for every tool and library entry (FR-026).

### 5.2 Back result by origin

| Origin | Back result | Requirement |
| --- | --- | --- |
| `tools` | Return to the prior purpose directory at the prior scroll position | FR-027 |
| `library` | Restore the prior query, filters, sort, selection, and scroll on the Library list | FR-028 |
| `workbook` | Restore the prior workbook entry and scroll position | FR-029 |
| `routine` | Return through workbook, session, and routine layers as appropriate | FR-029 |
| `search` | Restore the prior search state | FR-030 |
| `recent` | Return to Tools home at the prior Recents scroll position | FR-030 |
| `direct` | Replace the address with the calculated parent address when no in-app history exists | FR-031 |

### 5.3 Library view state shape

When `routeKey` names a Library tab, `saveViewState` stores:

```javascript
{
  query: string,           // free-text search term
  filters: {
    instrument: string | null,
    materialType: string | null,
    technique: string | null,
    tuning: string | null,
    difficulty: string | null,
    tags: string[],
    source: string | null,
    favorite: boolean | null,
  },
  sort: string,            // sort mode id
  selectedId: string | null,
  scrollY: number,
}
```

The eight filter fields match FR-045. `readViewState` returns the stored object or
`null`. `restoreScroll` applies the stored `scrollY` after the parent render finishes.

### 5.4 Focus

`focusHeading(sectionEl)` sets `tabindex="-1"` on the page heading inside
`sectionEl`, then calls `focus({ preventScroll: true })`. The navigator calls it after
every navigation that mounts a new page (FR-100).

## 6. Back agreement

The browser Back control, the device Back control, and the in-app Back control give
the same result for the same screen (FR-031).

One handler achieves this agreement. `js/main.js` already listens for `popstate` and
`hashchange`. `js/main.js` already owns `goBack`, `navPushCount`, and
`applyingHistory`. Every path ends in the same handler, so one code path renders the
result.

`js/routineNav.js` keeps the routine layer stack. It delegates its scroll and focus
work to `js/shell/navStack.js` (decision D15). `saveScrollForRoute` and
`restoreScroll` in `js/routineNav.js` are the working precedent that the new module
generalises.

## 7. Focus rules

1. Keyboard focus follows visual order (FR-099).
2. After navigation focus moves to the new page heading (FR-100). `navStack.focusHeading`
   and `toolPage` supply the heading element.
3. After a dialog closes focus returns to the invoking control (FR-100). The unsaved
   guard and `openSelectionSheet` both follow this rule.

## 8. `js/shell/unsavedGuard.js` interface

```javascript
export function registerUnsaved(scopeId, handlers) // handlers: { describe, save, discard }
export function clearUnsaved(scopeId)
export function hasUnsaved()
export async function confirmLeave() // -> 'save' | 'discard' | 'keep'
```

When the player leaves unsaved work, the guard offers three choices with these labels
exactly (FR-059):

- Save
- Discard
- Keep editing

`confirmLeave` returns `save`, `discard`, or `keep` to match the chosen label.
`navStack` consults the guard before every navigation. A `beforeunload` handler covers a
tab close (decision D17).

### 8.1 Verified current gap

No guard exists today. `stopRecorder()` does not clear the blob. The recording survives
navigation in memory.

## 9. Guarantees

1. Every adopted tool page renders the header, context row, mode tabs, workspace,
   primary controls, and advanced-options drawer in the fixed order (FR-014 to FR-016).
2. The shell shows one primary action at a time. Destructive actions live in More or in
   the advanced-options drawer (FR-017).
3. Large option sets, including tuning lists, open through `openSelectionSheet`
   (FR-018).
4. Primary navigation lists no individual tool (FR-005).
5. Navigation preserves origin for every tool and library entry (FR-026).
6. Back from each origin restores the state listed in section 5.2 (FR-027 to FR-030).
7. The browser Back control, the device Back control, and the in-app Back control agree
   (FR-031).
8. Keyboard focus follows visual order (FR-099).
9. After navigation focus moves to the new page heading (FR-100).
10. After a dialog closes focus returns to the invoking control (FR-100).
11. The guard blocks navigation until the player chooses Save, Discard, or Keep editing
    when unsaved work exists (FR-059).
12. An unconverted tool keeps its current markup inside the workspace slot until its
    work package converts it (decision D14).

## 10. Test hooks

Suite: `tests/shell/run.mjs`

| Area | Test environment |
| --- | --- |
| `navStack` origin table, view state read and write, Back parent calculation | Pure Node. No DOM. |
| `unsavedGuard` registry and `confirmLeave` result mapping | Pure Node with a fake dialog |
| `toolPage` descriptor validation and render order | `tests/gp-player/domShim.mjs` |
| `nav.js` rail labels and More sheet open | `tests/gp-player/domShim.mjs` |
| `focusHeading` and scroll restore timing | `tests/gp-player/domShim.mjs` |

The suite must assert that `tools`, `library`, `search`, and `recent` origins restore
the state listed in section 5.2, and that `popRoute` writes no extra history entry.
