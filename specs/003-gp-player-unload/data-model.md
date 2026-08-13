# Data Model: Guitar Pro Player Unload

**Feature**: `003-gp-player-unload` | **Date**: 2026-08-13 | **Plan**: [plan.md](./plan.md)

## Overview

This feature adds no stored entity. It defines the in-memory loaded score session and the
empty-player state that Close score must produce.

## Entities

### Loaded score session

Owner: `js/gpPlayer.js` module state. Status: existing fields, new clear path. Does not
persist as a whole object.

| Field | Type | Required | Meaning after a successful load |
| --- | --- | --- | --- |
| `gp` | object or null | Yes | Parsed score from `parseGuitarPro` or a tab-model import. |
| `bytes` | `Uint8Array` or null | Yes | Source Guitar Pro bytes when the load had a `.gp` or `.gp5` file. |
| `title` | string | Yes | Display title. Empty string when the file name supplies the title. |
| `fileName` | string | Yes | Source file name. |
| `exerciseId` | string or null | Yes | Library item id when the score came from the library. |
| `attachmentId` | string or null | Yes | Attachment id for the source bytes. |
| `mount` | object or null | Yes | `mountGpPlayer` handle. |
| `loading` | boolean | Yes | True while a file read is in progress. |

Validation:

- A session is loaded when `gp` is a truthy object.
- Close score must set `gp` to `null`, `bytes` to `null`, `title` to `''`, `fileName` to
  `''`, `exerciseId` to `null`, `attachmentId` to `null`, and `mount` to `null`.
- Close score must not change `loading` except to `false` when a read is no longer active.

### Empty player

Derived view. Not stored.

| Condition | Meaning |
| --- | --- |
| `state.gp` is null | No score session. |
| `#gpp-stage` is hidden | Score chrome is not on screen. |
| `#gpp-drop` is visible | The learner can drop or choose a file. |
| `#gpp-library` is visible | Saved scores remain listed. |
| `#sec-gpplayer` does not have `gpp-score-loaded` | Full-screen score layout is off. |

`destroy()` on the mount already removes `gpp-score-loaded`. Close score must still hide
the stage and show the drop area.

## State transitions

```text
empty player --load file or library item--> loaded session
loaded session --Close score--> empty player
loaded session --Open file / new drop--> loaded session (replacement)
loaded session --leave section--> mount destroyed, session still held
return with session held --initGpPlayer--> remount loaded session
return after Close score --initGpPlayer--> empty player
```

## Persistence

Close score writes nothing. It does not delete IndexedDB attachments. It does not edit
`musi.exercises`. Annotation keys for a score stay in local storage for a later open.
