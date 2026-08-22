# Google OAuth PKCE + Drive Integration Roadmap

This document plans client-side Google sign-in (OAuth 2.0 Authorization Code
with PKCE) and Google Drive file integration for the Musi web PWA.

Musi is a **fully static, frontend-only** product (no backend, no build step).
Auth and Drive access must therefore run entirely in the browser as a public
OAuth client. The CLI companion is **out of scope**.

**Status:** Planning only — nothing implemented yet.

## Goals

1. Let users sign in with Google from the web app using **Authorization Code + PKCE**.
2. Let signed-in users **open files from Drive** and **save/export files to Drive**.
3. Stay **local-first**: IndexedDB (`js/attachments.js`) and feature
   `localStorage` keys remain the source of truth; Drive is an optional
   import/export (and later sync) layer.
4. Prefer the narrowest useful Drive scope (`drive.file`) so Musi only sees
   files it creates or that the user explicitly opens with the app.

## Non-goals (v1)

- Full two-way sync / conflict resolution across devices
- Sharing, permissions management, or collaborative editing
- CLI Drive support
- Server-side token exchange or a confidential client secret
- Replacing local storage with Drive-only storage
- Broad `drive` / `drive.readonly` scopes that expose the user’s entire Drive

## Constraints (from the product)

| Constraint | Implication |
| ---------- | ----------- |
| No backend | Public OAuth client; PKCE required; no client secret in the repo |
| No bundler / no env injection at build time | Ship a public Client ID via `js/config.js` (or equivalent), with a documented local override |
| ES modules only | Prefer `fetch` to Drive REST APIs over the legacy `gapi` client |
| Hash routing (`#recorder`, etc.) | OAuth redirect must return to a stable path (`index.html` or `/`); handle `?code=` / `#` on boot before normal hash routing |
| Service worker precache | Auth/Drive modules need precache or network-first handling; offline redirect fallback must not drop the auth code |
| PWA standalone | Popup vs full-page redirect must be validated in installed mode |
| Existing file library | Hook Drive into `attachments.js` + Create tools rather than scattering API calls |

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  UI (header account control + per-tool Open/Save actions)   │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   js/googleAuth.js    js/googleDrive.js   feature modules
   (PKCE + tokens)     (Drive REST/fetch)  (exercises, recorder…)
         │                   │                   │
         │                   └────────┬──────────┘
         │                            ▼
         │                   js/attachments.js (IndexedDB)
         │                   + feature localStorage keys
         ▼
   sessionStorage / dedicated token keys (not musi:settings)
```

### New modules (proposed)

| Module | Responsibility |
| ------ | -------------- |
| `js/config.js` | Public Google OAuth Client ID, optional app folder name, redirect URI helper |
| `js/googleAuth.js` | PKCE helpers, authorize redirect/popup, code exchange, token storage, refresh/re-auth, sign-out, `getAccessToken()` |
| `js/googleDrive.js` | Drive v3 `fetch` wrappers: list/search app files, upload (multipart/resumable), download blob, ensure app folder |
| `js/driveBrowser.js` | In-app Drive file browser UI (folder navigation, file list, select) — **not** Google Picker |

Keep Google Identity Services (GIS) as an **optional alternative** for access-token-only flows later; v1 should implement classic PKCE so the auth story is explicit and inspectable without loading Google’s script for the core path.

---

## Google Cloud Console setup (prerequisite)

Done once per deploy environment (localhost + production origin).

1. Create (or reuse) a Google Cloud project.
2. Enable **Google Drive API**.
3. Configure OAuth consent screen (External or Internal as appropriate).
   - App name, support email, logo optional.
   - Scopes: `openid`, `email`, `profile`, and
     `https://www.googleapis.com/auth/drive.file`.
4. Create OAuth client ID → type **Web application**.
   - **Authorized JavaScript origins:** e.g. `http://localhost:8080`, production origin.
   - **Authorized redirect URIs:** exact match to the app’s redirect target,
     e.g. `http://localhost:8080/`, `http://localhost:8080/index.html`, and the
     production equivalents (include GitHub Pages subpath if used).
5. Copy the **Client ID** into `js/config.js` (public; never a client secret).

No Browser API key or Google Picker setup is required for v1 — file selection uses
the in-app Drive browser against the Musi app folder (`drive.file`).

---

## OAuth PKCE flow (v1 design)

### Flow

1. User clicks **Sign in with Google**.
2. App generates `code_verifier` (high-entropy) and `code_challenge` = `BASE64URL(SHA256(verifier))`.
3. Store `code_verifier` + `state` (and optional `returnHash` for the tool to restore) in `sessionStorage`.
4. Redirect (or popup) to Google’s authorize endpoint with:
   - `client_id`
   - `redirect_uri` (exact registered URI)
   - `response_type=code`
   - `scope` (space-delimited)
   - `state`
   - `code_challenge` / `code_challenge_method=S256`
   - `access_type=online` for v1 (access token only; re-prompt when expired)
5. On return, `index.html` / `main.js` boot detects `?code=` + `state`, validates
   `state`, exchanges the code at `https://oauth2.googleapis.com/token` with
   `code_verifier`, clears the query from the URL, restores the previous hash.
6. Persist tokens in a **dedicated** storage key (e.g. `musi:googleAuth`), not
   inside `musi:settings`.
7. Subsequent Drive calls send `Authorization: Bearer <access_token>`.

### Token lifetime

- Access tokens are short-lived (~1 hour).
- **v1:** on 401, clear the access token and prompt **Sign in again** (or silent
  re-auth if a popup path is available). Prefer simplicity over offline refresh.
- **Later:** evaluate `access_type=offline` + refresh token for installed PWAs;
  Google’s policies for public SPA clients are stricter — document any consent
  UX and storage risks before enabling.

### Redirect vs popup

| Mode | Pros | Cons |
| ---- | ---- | ---- |
| Full-page redirect | Reliable in browsers and many PWAs; simple | Interrupts in-progress tools (mic, ear trainer) |
| Popup + `postMessage` | Keeps the tool session alive | Blocked popups; standalone PWA quirks |

**Recommendation:** implement redirect first; add popup as an enhancement once
redirect works. Honor existing capture-session guards (`__musiCaptureActive`) so
auth does not reload mid-recording when avoidable — surface “finish recording
before signing in” if needed.

### Service worker notes

- Navigations are network-first with offline fallback to cached `index.html`.
  A failed network during the OAuth redirect could serve a shell **without** the
  `?code=` query. Mitigations:
  - Prefer handling the callback only when `code` is present on the live URL.
  - Consider excluding the OAuth callback URL pattern from offline fallback, or
  showing an explicit “complete sign-in while online” message.
- Do not precache Google API responses.
- Add new local modules to `PRECACHE_URLS` in `service-worker.js` (and bump the
  cache name) when they ship.
- Token POSTs to Google are not intercepted by the GET-oriented SW logic.

---

## Drive integration design

### Scope: `drive.file`

With `drive.file`, Musi can:

- Create files/folders in Drive (app-owned).
- Read/update/delete files the user opened with the app or that the app created.

It cannot browse the user’s entire Drive. The in-app browser only lists files
and folders under the Musi app folder (plus files Musi created). That matches
“import from my Musi library / backup my practice files” without overreaching.

### App folder convention

On first successful Drive use, ensure a folder such as **Musi** (or
`Musi Library`) exists; cache its Drive `fileId` next to auth state.

Suggested layout (v1, keep shallow):

```
Musi/
  Exercises/
  Recordings/
  Notes/
  Songs/
  Exports/
```

Folders are created lazily when a feature first saves.

### API style

Use Drive REST v3 via `fetch`:

- `GET https://www.googleapis.com/drive/v3/files` — list/search within app folder
- `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media` — download bytes
- `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` — small uploads
- Resumable upload for large exercise media (Exercises already allow up to 250 MB)

Map downloaded blobs into `saveFile` / `saveAudio` in `js/attachments.js` so the
rest of the app keeps working offline after import.

### Metadata linking (local ↔ Drive)

Extend attachment (and optionally exercise/song) metadata with optional fields:

```js
{
  driveFileId: '…',      // set after upload or open-from-Drive
  driveModifiedTime: '…',
  driveMd5Checksum: '…'  // optional, for cheap change detection later
}
```

IndexedDB schema today is version `1` with a free-form record; adding optional
fields is backward compatible. Bump `DB_VERSION` only if indexes are required.

Do **not** put OAuth tokens in attachment records.

---

## UX placement

### Global account control

Add a compact control in the header actions (near volume / musical context):

- Signed out: **Google Drive** / **Sign in**
- Signed in: avatar or email initial + menu: **Open from Drive…**, **Sign out**

Keep branding consistent with the existing shell (`css/ux-shell.css`,
`css/base.css`) — no separate “dashboard” chrome.

### Per-feature actions (where files already exist)

| Feature | Open from Drive | Save / export to Drive |
| ------- | --------------- | ---------------------- |
| **Exercises** | Import PDF/image/audio/video into library | Upload exercise media + optional metadata JSON |
| **Recorder** | Import audio into library | Upload saved take |
| **Songwriter** | (later) attach media / import lyrics doc | Export song JSON + recordings |
| **Notes** | Import text/markdown | Export note as `.md` / `.txt` |
| **Drums** | Import PDF packs / pattern JSON | Export user patterns |
| **Tab Analyzer** | Open `.gp` / `.gp5` / text / PDF for analysis | Optional export of analysis text |

v1 UI should appear first on **Exercises** and **Recorder**, then expand.

Quizzes, ear/pitch trainers, metronome, circle of fifths, etc. get little value
from Drive beyond optional settings backup — skip for v1.

---

## Phased delivery

### Phase 0 — Prerequisites & config scaffolding

**Goal:** project can authenticate against a real Google client ID in localhost.

- Add `js/config.js` exporting `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` helper,
  and Drive folder name constants. Document how to set the Client ID for local
  and production hosts in `README.md` (short subsection).
- Document Google Cloud Console steps (this roadmap is the source of truth).
- No user-facing UI yet beyond a hidden/dev smoke path if useful.

**Exit criteria:** Client ID configured; authorize URL can be constructed; redirect
URI registered for `http://localhost:8080`.

### Phase 1 — PKCE auth module + account UI

**Goal:** sign in / sign out works; access token available to the rest of the app.

Deliverables:

- `js/googleAuth.js`: PKCE generate/challenge, `startLogin()`, `handleRedirectCallback()`,
  `getAccessToken()`, `getUserProfile()`, `signOut()`, session restore.
- Boot hook in `js/main.js` (early): process OAuth callback query params, then
  continue normal hash routing.
- Header Sign in / Sign out control in `index.html` + minimal CSS.
- Store tokens under `musi:googleAuth`; never log tokens.
- Update `service-worker.js` precache + cache name for new modules.
- Graceful degradation when Client ID is empty (hide/disable Drive UI).

**Exit criteria:** User can complete Google consent on localhost, return to the
app, see signed-in state, and sign out. Expired token surfaces a clear re-auth
path.

**Manual verification:**

- Desktop browser redirect round-trip
- Mobile viewport
- Installed PWA (standalone) if available
- Mid-tool navigation: start from `#exercises`, sign in, land back on Exercises
- Offline during callback: no silent false “signed in”; show recoverable error

### Phase 2 — Open files from Drive (Exercises first)

**Goal:** import Drive files into the existing Exercises library via an **in-app
Drive browser** (decision locked: not Google Picker).

Deliverables:

- `js/googleDrive.js`: `downloadFile(fileId)`, `listChildren(folderId)`,
  `ensureAppFolder()`, optional name search within the Musi tree.
- `js/driveBrowser.js` + light CSS: modal/sheet that browses the Musi Drive
  folder tree. Reuse existing modal patterns (`modal-overlay` / `modal-dialog`
  as in Notes/Songwriter).
- Exercises UI: **Open from Drive** next to the existing file input upload path
  (`#ex-file-input` flow in `js/exercises.js`).

#### Drive browser UX (v1)

- Opens rooted at the Musi app folder (created in Phase 2/3 via `ensureAppFolder`).
- Shows folders and files; tap folder to navigate; breadcrumb or “Up” to go back.
- File rows: name, mime/type hint, size, modified time.
- Optional filter chips or accept-list by feature (Exercises: PDF / image / audio /
  video only — same rules as local upload).
- Single-select for v1; confirm button **Add to library** (or double-tap/row action).
- Empty state: “Nothing in Musi on Drive yet — save a file from the app, or add
  files into the Musi folder in Drive.”
- Loading / error / signed-out states; **Sign in** CTA if needed.
- Mobile: full-height sheet; desktop: centered dialog. Keyboard: Escape closes;
  Enter confirms selection when a file is focused.

#### Import path

- On select: download blob → `saveFile({…, source: 'exercise'})` → create exercise
  metadata as today’s upload path does (reuse size/type guards, 250 MB limit).
- Store `driveFileId` on the exercise/attachment metadata when imported.

**Exit criteria:** A PDF (or audio) placed under the Musi Drive folder can be
browsed in-app, opened into Exercises, and used offline afterward from IndexedDB.

**Out of scope for v1:** Google Picker, browsing the user’s whole Drive, multi-select,
move/rename/delete inside the browser (manage in Drive or later).

### Phase 3 — Save / export to Drive (Exercises + Recorder)

**Goal:** push local library items up to the Musi Drive folder.

Deliverables:

- `uploadFile({ name, mimeType, blob, parentId })` with multipart for small files
  and resumable for large media.
- Exercises: **Save to Drive** on an item (or bulk “backup category”).
- Recorder library: **Save to Drive** on a saved take (mirror today’s download
  affordance).
- If `driveFileId` already exists, update the file (or create a new revision)
  instead of duplicating — define a simple policy and document it in the UI
  (“Updated on Drive” vs “Saved a copy”).
- Status/error toasts consistent with Exercises’ existing status line patterns.

**Exit criteria:** Round-trip: record or upload locally → save to Drive → wipe
local item (or use another browser profile) → open from Drive → content matches.

### Phase 4 — Expand to Notes, Songwriter, Drums, Tab

**Goal:** same open/save primitives on other Create / file tools.

- **Notes:** export/import `.md` / `.txt`; map to `musi.notes`.
- **Songwriter:** export song JSON; optional upload of attached recording blobs.
- **Drums:** export/import user pattern JSON; open PDF packs via existing
  `pdfTabImport` pipeline.
- **Tab Analyzer:** open tab files from Drive into the existing analyzer
  (ephemeral is fine; optional save of analysis output under `Exports/`).

Reuse `googleDrive.js`; avoid per-feature OAuth logic.

### Phase 5 — Optional library backup bundle (stretch)

**Goal:** one-click backup/restore of Musi user content as a Drive JSON + files
bundle (not continuous sync).

- Export manifest (exercises, songs, notes metadata) + referenced attachment
  files into `Musi/Backups/<timestamp>/`.
- Import manifest restores localStorage keys + rehydrates IndexedDB blobs.
- Explicit user action only; no background sync; conflict policy = “replace local
  from backup” with a confirm dialog.

Defer automatic sync, md5-based differential sync, and multi-device CRDT-style
merge.

---

## Security & privacy checklist

- Public Client ID only; **no** client secret in the repo or SW cache.
- Prefer `drive.file` over full Drive access.
- Store tokens outside `musi:settings`; clear on sign-out.
- Never put tokens in URL hash after exchange; strip `code` / `state` from the
  address bar after handling.
- Do not log Authorization headers or tokens.
- Treat Drive downloads like local uploads: same MIME allowlists and size caps
  in Exercises.
- Document that sign-in is optional; all core trainers work signed out.
- Consent screen / privacy: Musi reads/writes only practice files the user
  chooses to open or save.

---

## Testing strategy

There is no automated test harness in this repo. Verification is manual:

| Check | How |
| ----- | --- |
| Auth happy path | `python3 -m http.server 8080` → Sign in → consent → signed-in header |
| Auth deny / cancel | Cancel consent → app remains usable signed out |
| State mismatch | Tamper `state` → reject callback, show error |
| Token expiry | Force-expire access token → next Drive action prompts re-auth |
| Exercises open/save | Round-trip PDF and a >5 MB audio file |
| SW after deploy | Bump cache name; hard reload; auth modules load |
| PWA standalone | Install app; complete login; open/save one file |
| Signed-out baseline | All existing tools still work with Drive UI hidden/disabled |

CLI smoke tests are unchanged and unrelated.

---

## Implementation sketch (Phase 1–2 file touch list)

| File | Change |
| ---- | ------ |
| `js/config.js` | **New** — Client ID + constants |
| `js/googleAuth.js` | **New** — PKCE + token lifecycle |
| `js/googleDrive.js` | **New** — Drive REST helpers |
| `js/driveBrowser.js` | **New** — in-app Musi-folder file browser |
| `css/drive-browser.css` (or ux-shell) | Browser modal/sheet styles |
| `js/main.js` | Callback handling on boot; wire account control |
| `index.html` | Header account control markup; module is already via `main.js` |
| `css/ux-shell.css` (or small new sheet) | Account button / menu styles |
| `js/exercises.js` | Open from Drive / Save to Drive actions |
| `js/attachments.js` | Optional `driveFileId` (and friends) on records |
| `service-worker.js` | Precache new modules; bump cache name |
| `README.md` | Short “Google Drive (optional)” setup notes |
| `docs/google-drive-oauth-roadmap.md` | This plan; update status as phases ship |

---

## Decisions

| Topic | Decision |
| ----- | -------- |
| File selection UI | **In-app Drive browser** over the Musi app folder (`js/driveBrowser.js`). Google Picker is deferred / out of scope for v1. |

## Open decisions

Resolve before or during Phase 1–2 implementation:

1. **Redirect URI canonical form** — trailing `/` vs `/index.html` (register both if unsure; pick one in `config.js`).
2. **Popup login** — defer until redirect is solid, or required for mic-heavy sessions.
3. **Production Client ID** — single Client ID with multiple origins vs separate
   localhost/prod clients (either works; multiple origins on one client is fine).
4. **Whether Phase 5 backup is worth building** before broader Phase 4 coverage.

---

## Status summary

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Google Cloud setup + `js/config.js` scaffolding | Planned |
| 1 | PKCE auth module + header account UI | Planned |
| 2 | Open from Drive via in-app browser → Exercises | Planned |
| 3 | Save to Drive (Exercises + Recorder) | Planned |
| 4 | Notes / Songwriter / Drums / Tab open-save | Planned |
| 5 | Optional full library backup bundle | Stretch |

When a phase ships, flip its status to **Implemented** and note any deviations
from this plan in a short changelog section at the bottom of this file.
