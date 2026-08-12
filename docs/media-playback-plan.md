# Global Media Playback — Implementation Plan

**Status:** Draft — ready for implementation  
**Last updated:** 2026-08-12

## Scope

This plan covers **local HTML media playback** in Musi. Playback must continue when the user leaves the Exercises page or the Workbooks detail view. Musi must show a **persistent in-app media dock**. Video may use **browser Picture-in-Picture (PiP)** when the browser supports it.

### In scope

| Source | Module | Media type |
| ------ | ------ | ---------- |
| Uploaded exercise files | `js/exercises.js` | Local `audio/*` and `video/*` blobs from IndexedDB |
| Recorded exercise takes | `js/exerciseTakePanel.js` | Take audio blobs (`source: exercise-take`) |
| Workbook entries | `js/workbooks.js` | Workbook `audio` and `video` entries only |

### Out of scope (explicit)

Do **not** wire these into the global playback service:

| Excluded item | Where it lives | Reason |
| ------------- | -------------- | ------ |
| Guitar Pro score playback | `js/gpPlayer.js`, `mountGpPlayer` in `js/exercises.js` | Web Audio scheduler, not HTML media |
| GP mix / multi-track playback | `js/gpMixPlayer.js` | Generated audio |
| Tab Analyzer playback | Tab Analyzer tools | Generated / slot-timed audio |
| Workbook GP entries | `mountWorkbookGp` in `js/workbooks.js` | Same GP engine as above |
| YouTube / external link embeds | `exercises.js` iframe viewer | Cross-origin iframe; not a local blob |
| PDF, image, doc preview | Exercise / workbook viewers | Not time-based media |
| Metronome, drums, ear trainer, routines, etc. | Existing `showNowPlaying` callers | Separate synthetic-audio UX; unchanged |

**Decision:** GP and generated audio keep the current tool-stop behavior. Only `<audio>` and `<video>` elements backed by IndexedDB blobs join global playback.

## Goals

1. User starts local audio or video in Exercises or Workbooks. User navigates to another tool. Playback continues without a gap.
2. A global dock shows title, transport controls, progress, and stop. The dock stays visible on every screen until the user stops playback or media ends.
3. Video may enter PiP. PiP is optional. The dock remains the primary control surface.
4. Object URLs and blob references stay valid for the full session. Musi must not revoke URLs while media still plays.
5. Media Session API hooks (where supported) expose play, pause, and stop on the lock screen and in OS media overlays.

## Non-goals

- Background playback when the browser tab is fully closed or the PWA is killed by the OS.
- Playlist queue across unrelated exercises (workbook auto-advance stays inside Workbooks only).
- Syncing playback position across devices.
- Replacing or merging the existing metronome / drum `now-playing` bar behavior in v1.
- PiP for audio (browser API is video-only).

---

## Current behavior and technical cause

### Navigation stops all inactive tools

`js/main.js` registers `stopExercises` and `stopWorkbooks` in `TOOL_STOPPERS`. On every `showSection(id)` call, `stopOtherTools([id])` runs all stoppers except the active tool.

```101:105:js/main.js
function stopOtherTools(keepIds) {
  Object.keys(TOOL_STOPPERS).forEach(toolId => {
    if (!keepIds.includes(toolId)) TOOL_STOPPERS[toolId]();
  });
}
```

When the user leaves Exercises, `stopExercises()` runs even if audio or video still plays.

### Exercises viewer teardown destroys the media element

`stopExercises()` calls `closeExerciseViewer()` → `teardownPlayer()`.

```1756:1777:js/exercises.js
function teardownPlayer() {
  teardownTakePanel();
  if (viewerGpMount) {
    try { viewerGpMount.destroy(); } catch (e) { /* ignore */ }
    viewerGpMount = null;
  }
  if (viewerURL) { try { URL.revokeObjectURL(viewerURL); } catch (e) {} viewerURL = null; }
  activeExerciseId = null;
  setViewerLayoutActive(false);
  // ...
  if (playerBodyEl) {
    playerBodyEl.innerHTML = '';
    playerBodyEl.className = 'ex-player-body';
  }
}
```

Effects:

1. `playerBodyEl.innerHTML = ''` removes the `<audio>` or `<video>` node. The browser stops playback immediately.
2. `URL.revokeObjectURL(viewerURL)` invalidates the blob URL. Even a kept element would fail on seek or replay.
3. `teardownTakePanel()` calls `destroy()` on the take panel. That revokes all take object URLs and removes take `<audio>` elements.

### Workbooks detail teardown does the same

`stopWorkbooks()` → `closeWorkbookDetail()` → `teardownDetailPlayer()`.

```352:364:js/workbooks.js
function teardownDetailPlayer() {
  if (detailMountHandle) {
    try { detailMountHandle.destroy(); } catch (e) { /* ignore */ }
    detailMountHandle = null;
  }
  if (detailObjectURL) {
    try { URL.revokeObjectURL(detailObjectURL); } catch (e) { /* ignore */ }
    detailObjectURL = null;
  }
  detailMediaEl = null;
  // ...
}
```

Workbook HTML media uses the same pattern: one `detailObjectURL`, one `detailMediaEl`, both cleared on navigation.

### Take panel has its own URL map

`js/exerciseTakePanel.js` stores per-take URLs in `takeUrls`. `destroy()` calls `revokeAllTakeUrls()`. Any playing take stops when the panel tears down.

### Global now-playing bar is not wired to file media

`index.html` defines `#now-playing`. `js/nowPlaying.js` exposes `showNowPlaying(label, onStop)`. The function stores the stop callback, returns when the bar is missing, sets the label, then adds the `visible` class.

```4:11:js/nowPlaying.js
export function showNowPlaying(label, onStop) {
  currentLabel = label;
  stopCallback = onStop;
  const bar = document.getElementById('now-playing');
  if (!bar) return;
  bar.querySelector('.np-label').textContent = label;
  bar.classList.add('visible');
}
```

Metronome, drums, routines, and similar tools use this bar. Exercises and Workbooks never call it. Styles live in `css/visualizer.css` (layout, EQ animation) and `css/theme-gbc.css` (GBC shell tokens).

### IndexedDB blobs are fine; object URLs are the fragile layer

`js/attachments.js` persists blobs in `musi-attachments`. Blobs survive navigation. The bug is **session object URL lifecycle** and **DOM removal**, not blob loss.

---

## Recommended architecture

Introduce a single **Media Playback Service** (`js/mediaPlayback.js`) that owns the active HTML media session app-wide.

### Component responsibilities

| Component | File | Role |
| --------- | ---- | ---- |
| Media Playback Service | `js/mediaPlayback.js` (new) | Session registry, reparenting, URL lifecycle, Media Session, PiP helpers |
| Media dock UI | extend `js/nowPlaying.js` or new `js/mediaDock.js` | Render dock chrome, wire controls, ARIA, responsive layout |
| Dock host + media sink | `index.html` | Persistent `#media-dock` with hidden `#media-dock-sink` for the live element |
| Dock styles | `css/visualizer.css`, `css/theme-gbc.css`, optional `css/media-dock.css` | GBC pill dock, expanded controls, safe-area offsets |
| Exercises integration | `js/exercises.js` | Hand off playing HTML media before teardown; reattach on return |
| Take panel integration | `js/exerciseTakePanel.js` | Hand off playing take audio; pause inline copy when dock owns it |
| Workbooks integration | `js/workbooks.js` | Same hand off for `detailMediaEl`; exclude GP branch |
| Navigation guard | `js/main.js` | Optional: do not stop an active media session when switching tools (service survives tool stoppers) |
| Blob storage | `js/attachments.js` | Unchanged; service reads blobs by `attachmentId` when it must rebuild |

### Session model

```js
// Conceptual — implement in js/mediaPlayback.js
{
  id: 'session-…',
  kind: 'audio' | 'video',
  source: 'exercise' | 'exercise-take' | 'workbook',
  attachmentId: 'att-…',       // IndexedDB key
  objectUrl: 'blob:…',         // owned by service until stop
  mediaEl: HTMLMediaElement,     // reparented into #media-dock-sink
  label: 'Exercise name',
  subtitle: 'Take 2 · Workbook name', // optional
  origin: { toolId, exerciseId, workbookId, takeId }, // for "Open source"
  startedAt: ISO string,
  pipActive: false,
}
```

**Rule:** at most one global HTML media session in v1. Starting new local media stops the previous session (same as today inside one viewer).

### High-level flow

```mermaid
sequenceDiagram
  participant User
  participant Exercises
  participant Service as mediaPlayback.js
  participant Dock as #media-dock
  participant Main as main.js / showSection

  User->>Exercises: Play uploaded video
  Exercises->>Exercises: createObjectURL + video in playerBodyEl
  User->>Main: Navigate to Home
  Main->>Exercises: stopExercises()
  Exercises->>Service: handOff(mediaEl, metadata)
  Service->>Service: retain objectUrl; do not revoke
  Service->>Dock: reparent mediaEl; show dock
  Service->>Service: update Media Session metadata
  Note over Exercises: teardownPlayer clears UI only;<br/>GP mount still destroyed;<br/>HTML media skipped
  User->>Dock: Pause / PiP / Stop
  Dock->>Service: transport action
  Service->>Dock: sync UI + Media Session
```

Plain-text equivalent:

1. User plays blob media in Exercises or Workbooks.
2. User navigates away. `stopExercises` or `stopWorkbooks` runs.
3. Tool code asks the service: "Is this HTML media playing or paused with a current src?"
4. If yes, service **reparents** the element to `#media-dock-sink` and registers the session.
5. Tool teardown clears local UI but **does not** revoke the URL or pause the element.
6. Dock shows controls. User stops from dock → service pauses, revokes URL, removes session, hides dock.

---

## Media ownership and object URL lifecycle

### Ownership rules

| Asset | Owner during in-page viewing | Owner during global playback |
| ----- | ---------------------------- | ---------------------------- |
| Exercise blob URL (`viewerURL`) | `exercises.js` | Media Playback Service |
| Workbook blob URL (`detailObjectURL`) | `workbooks.js` | Media Playback Service |
| Take blob URL (`takeUrls`) | `exerciseTakePanel.js` | Media Playback Service |

### Lifecycle

1. **Create:** existing code calls `URL.createObjectURL(blob)` when the viewer opens or a take row mounts.
2. **Transfer:** on hand off, module sets its local URL pointer to `null` and sets `releasedToService: true`. Service adds URL to its session. Only the service may revoke it.
3. **Return (optional v1.1):** user reopens the same exercise while session is active. Service reparents the element back into the viewer and restores local pointer. Same URL, same `currentTime`.
4. **Stop:** service pauses, clears `src`, calls `revokeObjectURL`, drops session, hides dock.
5. **Delete attachment:** if user deletes an exercise or take while it plays, service must stop and show a short status toast. Hook `releaseAttachment` callers or listen to `musi:data-changed`.

### GP exclusion at lifecycle boundary

`teardownPlayer` must still destroy `viewerGpMount` and revoke GP-related UI. Only skip teardown for elements where `mediaKind(item)` is `audio` or `video` **and** the element is the active hand-off target. Never call `handOff` for `kind === 'gp'`.

---

## Navigation and teardown behavior

### Exercises (`stopExercises`)

Current: always `closeExerciseViewer()`.

Proposed:

1. If a global session is already active from this exercise, leave it alone.
2. Else if `playerBodyEl` contains a playing or paused HTML media element with `viewerURL`, call `mediaPlayback.handOff({ … })`.
3. Else if a take `<audio>` is playing, hand off that element and take metadata.
4. Run `teardownPlayer()` with flags:
   - **Always:** destroy GP mount, clear layout, reset selection chrome.
   - **Skip for handed-off media:** do not revoke `viewerURL`; do not remove the handed-off node from the service sink.
5. `teardownTakePanel()` must not revoke URLs that the service now owns. Pass session take ids into `destroy({ retainTakeIds })` or destroy panel UI but leave service-owned audio out of panel DOM first.

### Workbooks (`stopWorkbooks`)

Current: always `closeWorkbookDetail()`.

Proposed:

1. If `detailMediaEl` exists and `mediaKind(exercise)` is `audio` or `video`, hand off before teardown.
2. If `detailMountHandle` exists (GP), destroy it as today. GP stops on navigation.
3. Revoke `detailObjectURL` only when the service did not take ownership.

### Main navigation (`stopOtherTools`)

The service lives **outside** tool sections. Tool stoppers must cooperate; the service itself is not a tool stopper entry.

When the user stops playback from the dock, no tool stopper runs. When media ends naturally, service hides the dock.

**Conflict with synthetic now-playing:** if metronome or drums already use `#now-playing`, define priority:

- v1: HTML media dock **replaces** the simple now-playing bar while a session is active. Synthetic tools hide their bar or queue until media stops.
- Document in code: `mediaPlayback.isActive()` gate in metronome / drums `showNowPlaying` calls (follow-up patch).

---

## Persistent dock UX

### Layout

Extend `#now-playing` in `index.html` into a **media dock** (keep id for compatibility or add `#media-dock` wrapper).

Suggested structure:

```html
<div id="media-dock" class="media-dock" hidden>
  <div class="media-dock-eq" aria-hidden="true">…</div>
  <div class="media-dock-meta">
    <span class="media-dock-title"></span>
    <span class="media-dock-sub"></span>
  </div>
  <div class="media-dock-transport">
    <button type="button" id="media-dock-play" aria-label="Play">…</button>
    <input type="range" id="media-dock-seek" aria-label="Seek" />
    <span class="media-dock-time"></span>
  </div>
  <button type="button" id="media-dock-pip" aria-label="Picture in Picture" hidden>PiP</button>
  <button type="button" id="media-dock-source" aria-label="Open source">↩</button>
  <button type="button" id="media-dock-stop" aria-label="Stop">■</button>
</div>
<div id="media-dock-sink" class="media-dock-sink" aria-hidden="true"></div>
```

The sink holds the reparented `<audio>` or `<video>`. Hide native controls on the element (`controls` attribute off in dock mode). Dock controls drive playback.

### Visual design

- Reuse GBC tokens from `css/theme-gbc.css`: `--radius-pill`, purple border, `--accent` EQ bars.
- Position above the bottom nav dock (`bottom: 76px` desktop, `64px` small phones) — same as current `.now-playing`.
- Add `body.media-dock-active` if the shell needs extra bottom padding.

### Controls

| Control | Behavior |
| ------- | -------- |
| Play / Pause | Toggles `mediaEl.paused` |
| Seek range | Sets `currentTime`; update on `timeupdate` |
| Time readout | `current / duration` (VT323) |
| Stop | Ends session; revokes URL; hides dock |
| Open source | `showSection('exercises')` or `showSection('workbooks')` and reopen item |
| PiP | Video only; see below |

### Accessibility

- `role="region"` and `aria-label="Now playing"` on the dock.
- Transport buttons need `aria-pressed` for play/pause toggle state.
- Seek slider: `aria-valuenow`, `aria-valuemax` from duration.
- PiP button: hide when `!document.pictureInPictureEnabled`.
- Focus order: play → seek → PiP → open source → stop. Escape does not stop playback (avoid accidental stop). Stop is explicit.
- Announce play state changes with `aria-live="polite"` on the title line.

### Responsive behavior

- **≤480px:** single-row compact dock; truncate title with `text-overflow: ellipsis`; seek bar fills remaining width (see existing `@media` in `css/visualizer.css`).
- **Landscape short height:** raise dock slightly above nav; ensure it does not cover hold-record button when that mode is active.
- **Split view:** dock spans full viewport width; z-index above section content (`z-index: 100` today).

---

## Picture-in-Picture behavior and fallback

### Supported case

Local `<video>` in `#media-dock-sink`:

1. On PiP click, call `mediaEl.requestPictureInPicture()`.
2. Listen for `enterpictureinpicture` / `leavepictureinpicture` to sync button state.
3. While in PiP, keep the in-app dock visible for stop and open-source (or collapse to mini — product choice: **keep slim dock** in v1).

### Fallback

| Condition | Behavior |
| --------- | -------- |
| Browser lacks PiP API | Hide PiP button |
| `requestPictureInPicture` rejects (iOS Safari quirks, user gesture) | Show one-line toast: "Picture in Picture is not available." |
| Audio-only session | Hide PiP button |
| User exits PiP from OS chrome | Update button; playback continues in app |

### GP / iframe exclusion

Do not offer PiP for GP canvas or YouTube iframes in this feature. Only the dock-owned local video element uses PiP.

---

## Media Session API behavior

Musi does not use Media Session today. Wire it in `mediaPlayback.js` when `navigator.mediaSession` exists.

| Event | Action |
| ----- | ------ |
| Session start | Set `metadata` (title, artist = "Musi", optional artwork for exercise thumbnail if image exists) |
| Play | `mediaSession.playbackState = 'playing'`; hook `onplay` |
| Pause | `playbackState = 'paused'` |
| Stop | Clear handlers; `playbackState = 'none'` |
| Position state | On `timeupdate`, call `setPositionState({ duration, playbackRate, position })` when supported |
| Action handlers | `play`, `pause`, `stop`; optional `seekbackward` / `seekforward` (10 s) for long tracks |

Use the same handlers as the dock buttons so lock-screen and dock stay in sync.

When the session ends, call `navigator.mediaSession.metadata = null` and remove action handlers.

---

## Integration points by file / module

| File | Change |
| ---- | ------ |
| `index.html` | Expand now-playing markup; add `#media-dock-sink` |
| `js/mediaPlayback.js` | **New.** Core service API (see below) |
| `js/nowPlaying.js` | Split: keep synthetic bar helpers; delegate to service or share dock host |
| `js/main.js` | `initMediaPlayback()` on boot; optional gating for synthetic now-playing |
| `js/exercises.js` | `handOffBeforeTeardown()` in `teardownPlayer`; GP path unchanged |
| `js/exerciseTakePanel.js` | Detect playing take; hand off; conditional URL revoke in `destroy` |
| `js/workbooks.js` | Hand off `detailMediaEl` for audio/video; GP branch still destroys handle |
| `js/attachments.js` | No schema change; optional helper `getFileBlob` already sufficient |
| `css/visualizer.css` | Dock transport, seek bar, sink (visually hidden media) |
| `css/theme-gbc.css` | Token alignment for dock shell |
| `service-worker.js` | Precache new JS/CSS; bump `CACHE_VERSION` |

### Proposed service API

```js
// js/mediaPlayback.js
export function initMediaPlayback() { … }
export function handOff({ mediaEl, objectUrl, kind, label, subtitle, source, origin, attachmentId }) { … }
export function returnToOrigin(origin) { … }  // navigate + reopen viewer
export function stopSession() { … }
export function isActive() { … }
export function getSession() { … }  // read-only for UI sync
export function attachDockListeners() { … }
```

---

## Edge cases and risks

| Edge case | Risk | Mitigation |
| --------- | ---- | ---------- |
| User opens second local media while dock plays | Two sessions fight | `handOff` stops previous session first |
| User deletes playing attachment | Revoked blob mid-play | Listen for delete events; `stopSession()` with message |
| Autoplay policy on hand off | Unexpected pause | Hand off preserves state; do not call `play()` unless already playing |
| Workbook auto-advance while user is away | Next entry should not hijack dock | Auto-advance runs only when Workbooks detail is open; disable advance when session is global |
| Take panel re-render while take plays in dock | Duplicate audio elements | Panel skips creating `<audio>` for take id owned by service |
| GP exercise open during dock video | Two audio sources | Allowed; GP is local to Exercises. User hears both unless GP stopped — document as known overlap; GP still stops on leave |
| IndexedDB evicted | Blob missing | Existing missing-file UI; service stops with error label |
| iOS low-power / background tab | OS may suspend media | Document platform limit; Media Session helps but does not guarantee background play |
| Service worker update mid-playback | Old JS keeps running until reload | Bump cache on release; playback survives until user reloads |
| Synthetic + media dock both visible | Cluttered UI | `isActive()` hides synthetic bar |

---

## Phased implementation

### Phase 1 — Service skeleton and dock shell

**Dependencies:** none

1. Add `js/mediaPlayback.js` with session state, `handOff`, `stopSession`, `isActive`.
2. Expand `index.html` dock markup and `#media-dock-sink`.
3. Add CSS in `css/visualizer.css` / `css/theme-gbc.css`.
4. Call `initMediaPlayback()` from `js/main.js`.
5. Manual test: inject a dummy audio element, hand off, navigate home, confirm audio continues.

**Deliverable:** empty hand off works; stop revokes URL.

### Phase 2 — Exercises uploaded audio / video

**Dependencies:** Phase 1

1. In `teardownPlayer`, detect `audio` / `video` kind and playing or paused media with src.
2. Call `handOff` before clearing `playerBodyEl`.
3. Skip `revokeObjectURL(viewerURL)` when service owns URL.
4. Wire dock transport and time sync.
5. "Open source" returns to Exercises and reopens `activeExerciseId`.

**Deliverable:** uploaded MP4 / MP3 continues on navigation.

### Phase 3 — Exercise takes

**Dependencies:** Phase 2

1. In `exerciseTakePanel.js`, export playing element detection.
2. Hand off take audio on exercise teardown.
3. Adjust `destroy()` URL revoke rules.

**Deliverable:** recorded take keeps playing after leaving Exercises.

### Phase 4 — Workbooks audio / video

**Dependencies:** Phase 2

1. Mirror hand off in `teardownDetailPlayer` for non-GP media.
2. Open source navigates to Workbooks and restores detail view.
3. Confirm GP entries still stop on leave.

**Deliverable:** workbook MP3 / MP4 survives navigation.

### Phase 5 — Media Session + PiP

**Dependencies:** Phase 2

1. Media Session metadata and action handlers.
2. PiP button for video; fallbacks wired.
3. Browser matrix verification (below).

**Deliverable:** lock-screen controls and PiP on supported desktops / Android.

### Phase 6 — Polish and conflicts

**Dependencies:** Phases 1–5

1. Gate metronome / drums `showNowPlaying` when `mediaPlayback.isActive()`.
2. Handle attachment delete during playback.
3. Bump `service-worker.js` cache version; add new assets to `PRECACHE_URLS`.
4. Optional: reparent media back when user reopens the same source without stopping.

---

## Browser verification matrix

| Browser | Exercises audio | Exercises video | Take audio | Workbook media | Dock UI | Media Session | PiP |
| ------- | ----------------- | --------------- | ---------- | -------------- | ------- | ------------- | --- |
| Chrome desktop (latest) | Required | Required | Required | Required | Required | Required | Required |
| Firefox desktop (latest) | Required | Required | Required | Required | Required | Optional | Optional |
| Safari macOS (latest) | Required | Required | Required | Required | Required | Optional | Optional |
| Chrome Android | Required | Required | Required | Required | Required | Required | Optional |
| Safari iOS | Required | Required | Required | Required | Required | Optional | Hide PiP if unsupported |
| Installed PWA (one platform) | Required | Required | Smoke | Smoke | Required | Smoke | Smoke |

Test navigation paths: Exercises → Home, Exercises → Metronome, Exercises → Workbooks, Workbooks detail → Home, split view primary swap.

---

## Acceptance criteria

1. User plays an uploaded exercise video. User taps Home. Video audio continues without restart. Dock shows title and controls.
2. User stops from dock. Playback ends. Dock hides. Object URL is revoked (verify in DevTools: no dangling blob URLs after 5 s).
3. User plays exercise audio. User opens Metronome. Exercise audio still plays. Dock remains usable.
4. User plays a take. User leaves Exercises. Take audio continues.
5. User plays workbook entry video (non-GP). User leaves Workbooks. Video continues in dock.
6. User plays GP exercise. User leaves Exercises. GP playback **stops** (unchanged). No GP entry appears in dock.
7. PiP: on Chrome desktop, user enters PiP from dock. Video visible in OS window. Stop from dock ends PiP and session.
8. Media Session: on Chrome Android, lock-screen pause stops audio; play resumes from lock screen.
9. Keyboard: dock controls are focusable; screen reader reads title and play state.
10. Mobile width 375px: dock does not cover nav; title truncates cleanly.

---

## Service worker and cache notes

- Add `js/mediaPlayback.js` (and optional `css/media-dock.css`) to `PRECACHE_URLS` in `service-worker.js`.
- Bump `CACHE_VERSION` when shipping so installed PWAs fetch new assets.
- The service worker must **not** cache `blob:` URLs or IndexedDB content. Only app shell files change.
- After deploy, developers must hard-reload once (existing Musi gotcha) to pick up the new worker.
- Active media playback survives a silent worker update until the user reloads. Document this limit.

---

## Explicit decisions that keep Guitar Pro out of scope

1. **Kind gate:** only `mediaKind(item) === 'audio' || mediaKind(item) === 'video'` may call `mediaPlayback.handOff`. Never hand off when kind is `gp`.
2. **Teardown gate:** `viewerGpMount.destroy()` and `detailMountHandle.destroy()` always run on navigation. Do not extend GP player lifetime.
3. **No Web Audio bridge:** the service manipulates `HTMLMediaElement` only. Do not connect GP oscillators or `gpMixPlayer` output to the dock.
4. **Workbook transport:** `loadCurrentExercise` auto-advance on `ended` applies to inline `detailMediaEl` only. GP `onPlaybackEnd` stays inside Workbooks. Global session does not auto-advance workbook queue.
5. **Module boundary:** do not import `gpPlayer.js`, `gpMixPlayer.js`, or tab playback modules from `mediaPlayback.js`.
6. **UI boundary:** dock shows blob-backed media labels only. No GP tempo, loop, or track picker in the dock.
7. **Testing boundary:** acceptance tests exclude GP files. GP regressions use existing GP exercise tests only.

---

## Related files (reference)

| Path | Relevance |
| ---- | --------- |
| `js/main.js` | `TOOL_STOPPERS`, `showSection`, `stopOtherTools` |
| `js/exercises.js` | `viewerURL`, `teardownPlayer`, `stopExercises`, `mountPlayerBody` |
| `js/exerciseTakePanel.js` | Take `<audio>`, `takeUrls`, `destroy` |
| `js/workbooks.js` | `detailObjectURL`, `detailMediaEl`, `teardownDetailPlayer`, `stopWorkbooks` |
| `js/attachments.js` | IndexedDB blob storage |
| `js/nowPlaying.js` | Current global bar API |
| `index.html` | `#now-playing` markup |
| `css/visualizer.css` | Now-playing layout |
| `css/theme-gbc.css` | GBC dock styling |
| `service-worker.js` | PWA precache list |
