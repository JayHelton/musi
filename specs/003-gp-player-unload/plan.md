# Implementation Plan: Guitar Pro Player Unload

**Branch**: `003-gp-player-unload` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-gp-player-unload/spec.md`

## Summary

Add a Close score action to the Guitar Pro player so a learner can unload a score without
a page refresh.

The shared player in `js/gpPlayerUI.js` gains an optional `onCloseScore` callback. When
that callback is present, the player shows a Close score control in the score header and
in the player menu. A click calls the callback. Hosts without the callback stay unchanged.

The Guitar Pro Player screen in `js/gpPlayer.js` supplies the callback. The handler stops
the mount, clears the in-memory score session, and shows the drop area and the saved-score
list again. `destroy()` already stops audio, so close reuses that teardown. After close,
`remountIfNeeded()` must not remount the closed score.

See [research.md](./research.md) for the decisions.

## Technical Context

**Language/Version**: JavaScript, ES2020 modules in the browser. Node.js 18 or newer for
the test runners.

**Primary Dependencies**: None. The feature adds no package. It reuses `mountGpPlayer`,
`destroy()`, and the existing player menu.

**Storage**: No new storage key. Close clears in-memory session fields only. IndexedDB
library items stay.

**Testing**: Plain Node scripts under `tests/gp-player/` with `node:assert/strict` and
`tests/gp-player/domShim.mjs`. The suite runner is `tests/gp-player/run.mjs`.

**Target Platform**: Evergreen browsers. The Guitar Pro Player screen is the primary
surface. The shared player stays embeddable.

**Project Type**: Static frontend PWA at the repository root.

**Performance Goals**: Close score returns the empty player in under 3 seconds. Audio from
the closed score stops within 100 milliseconds.

**Constraints**: No build step. No backend. Reuse existing theme tokens. Keep
`mountGpPlayer` back-compatible. Add new behaviour through one optional option.

**Scale/Scope**: One new optional mount option, one standalone unload handler, one Node
test file, and a small CSS addition for the header control.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
| --- | --- | --- |
| I. Static-First Architecture | The feature adds no backend, no database, and no API. | PASS. Close score is a client session reset. |
| II. Shared Theory Engine | Shared logic stays in `js/`. The CLI stays zero-dependency. | PASS. No parse or theory change. The CLI is unchanged. |
| III. Atomic Purple Game Boy Color UI | New UI reuses theme tokens and the pixel font stack. | PASS. The control reuses `.btn`, `.gpp-icon-btn`, and existing player chrome. |
| IV. Verify Before Ship | Run the Node runners, serve the app over HTTP, and exercise the UI. | PASS. [quickstart.md](./quickstart.md) holds the steps. |
| V. Spec-Driven Feature Work | Spec first, then plan, then tasks, then implement. | PASS. This plan follows `spec.md` and precedes `tasks.md`. |
| Communication | Written output follows ASD-STE100 Simplified Technical English. | PASS. Identifiers, paths, and UI strings stay verbatim. |

**Post-design re-check**: PASS. The Phase 1 design adds no dependency, no backend, and no
build tool. It adds one optional callback. Embedders that omit it keep current behaviour.

## Project Structure

### Documentation (this feature)

```text
specs/003-gp-player-unload/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── close-score.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
js/gpPlayerUI.js
js/gpPlayer.js
js/gpPlayer/playerMenu.js
css/gpplayer.css
service-worker.js
tests/gp-player/unload.mjs
tests/gp-player/wiring.mjs
tests/gp-player/domShim.mjs
```

**Structure Decision**: Keep the existing static PWA layout. Do not add a new module unless
the unload handler needs a shared helper. The first design keeps the handler in
`js/gpPlayer.js` and the optional callback in `js/gpPlayerUI.js`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | | |
