# Supabase Integration Plan — Auth, Sync Backend & Infra-as-Code

This document plans how to add **accounts (auth)** and a **cloud backend** to
Musi using [Supabase](https://supabase.com), so saved sessions, stats, and
preferences sync across devices and a foundation exists for future
collaborative "workbench" features — while keeping Musi's offline-first,
no-build, static-PWA character intact.

It also plans how to stand up Supabase **as code** (Terraform + SQL migrations)
so the backend never has to be configured by hand. Starter scaffolding for that
already lives in this repo:

- [`infra/terraform/`](../infra/terraform) — provisions the project + auth/API settings.
- [`supabase/migrations/`](../supabase/migrations) — schema, triggers, and RLS.

> Status: **planning + validated scaffolding.** The IaC and SQL below are written
> and verified (`terraform validate`; migrations applied and RLS-tested against a
> local Postgres 16). The frontend wiring is specified here as code samples but is
> intentionally **not yet merged into the live app**, so the static build keeps
> working with zero network dependencies until the backend is actually
> provisioned.

---

## 1. Goals & non-goals

### Goals
- **Auth:** let a user sign in (email magic-link first; OAuth later) and have an
  identity Musi can attach data to.
- **Cloud sync:** persist and sync the things currently trapped in `localStorage`
  — saved sessions, session history, training stats, and the musical context /
  tool preferences — across a user's devices.
- **Foundation for the workbench:** a schema + auth model that future features
  (sharing routines, collaboration, cloud recordings, cross-device resume) can
  build on without re-architecting.
- **Infra as code:** create and evolve the Supabase project, auth config, schema,
  and security policies with Terraform + migrations — no manual dashboard setup.

### Non-goals (for the first iteration)
- Forcing login. Musi must stay fully usable **signed-out and offline**; the
  cloud is an enhancement, not a gate.
- Moving the music-theory engine server-side. All theory/audio stays client-side.
- Real-time multiplayer. Realtime is sketched as a later phase, not built first.
- Replacing the CLI's local behavior (CLI auth is a later, optional phase).

---

## 2. Where Musi is today (what we're integrating with)

Musi is a static PWA with **no backend**; all state is browser-local through two
small, well-isolated modules:

| Concern | Module | Storage key(s) |
| --- | --- | --- |
| Settings, musical context, **stats** | `js/persistence.js` (`getSetting`/`saveSetting`) | `musi:settings` |
| Saved sessions, active run, history | `js/sessions.js` (`STORAGE_KEYS`) | `musi.sessions`, `musi.activeSession`, `musi.sessionHistory` |
| Musical context (key/scale/tempo) | `js/musicalContext.js` | persisted via `persistence.js` under `context.*` |
| Per-skill training stats | `js/stats.js` | persisted via `persistence.js` under `stats` |

This is the key enabler: **persistence is already centralized.** Both stores are
defensive (in-memory fallback when storage is blocked) and expose narrow APIs.
That means cloud sync can be layered *under* these APIs without rewriting every
feature. The session data model (`normalizeSession`/`normalizeDrill`) is already
JSON-clean and maps almost 1:1 onto Postgres rows.

Constraints to respect (from `AGENTS.md`):
- No build step, no framework, no bundler — ES modules served over HTTP.
- A service worker (`service-worker.js`) precaches the app shell; new network
  dependencies need deliberate handling.

---

## 3. Guiding principles

1. **Offline-first, local-first.** `localStorage` stays the source of truth for
   the running app. Supabase is a **sync mirror**. Signed-out users are unaffected.
2. **Additive & reversible.** Introduce a thin sync layer behind the existing
   `persistence.js` / `sessions.js` APIs. If the backend is down or disabled, the
   app behaves exactly as it does today.
3. **No build step.** Load `@supabase/supabase-js` as an ES module (pinned CDN or
   vendored into `js/vendor/`). No bundler is introduced.
4. **Everything as code.** Project, auth settings, schema, and policies are all in
   version control and applied by tooling.
5. **Least privilege.** Row Level Security from day one; the anon key is the only
   credential the frontend ever holds (it's safe to embed).

---

## 4. Target architecture

```
                         Browser (static PWA, offline-first)
  ┌───────────────────────────────────────────────────────────────────┐
  │  feature modules (scaleQuiz, sessionsUI, stats, musicalContext...)  │
  │             │ unchanged public APIs (getSetting/getSessions/...)    │
  │             ▼                                                        │
  │   persistence.js / sessions.js   ◄── localStorage (source of truth) │
  │             │  emit change events                                    │
  │             ▼                                                        │
  │        js/sync.js  ──────────────►  outbound queue (localStorage)   │
  │             │                                                        │
  │        js/auth.js  ── session ──►  js/supabaseClient.js (lazy)      │
  └─────────────┼──────────────────────────────────┼───────────────────┘
                │ HTTPS (anon key + user JWT)        │
                ▼                                     ▼
        Supabase Auth (GoTrue)            Supabase Postgres (PostgREST)
                                          public.{profiles,user_settings,
                                          sessions,session_history}
                                          + RLS (auth.uid() = user_id)
```

- **Signed out:** `js/sync.js` is dormant; app == today.
- **Signed in + online:** local writes enqueue and flush to Supabase; remote
  changes pull down and merge into `localStorage`, then re-render.
- **Signed in + offline:** writes queue locally and flush on reconnect.

---

## 5. Infrastructure as code

Yes — Supabase can be fully managed as code, and this repo already contains the
scaffolding. The clean division of labor is:

| Layer | Tool | Lives in | Why |
| --- | --- | --- | --- |
| Project, region, auth & API settings | **Terraform** (`supabase/supabase` provider) | `infra/terraform/` | Declarative, drift-detected project-level config. |
| Schema, triggers, RLS policies | **Supabase CLI migrations** (SQL) | `supabase/migrations/` | SQL is the reviewable, idiomatic way to evolve Postgres + RLS; the provider does not manage arbitrary DDL. |
| Local dev stack | **Supabase CLI** (`supabase start`) | `supabase/config.toml` | Full Postgres+Auth+Studio in Docker for testing. |

### 5.1 Terraform (project + settings)
`infra/terraform/` provisions `supabase_project` and `supabase_settings`
(site URL, redirect allow-list, signups, exposed schemas). Secrets come from env
vars (`SUPABASE_ACCESS_TOKEN`, `TF_VAR_database_password`). See its
[README](../infra/terraform/README.md). Validated with `terraform validate`.

```bash
cd infra/terraform
export SUPABASE_ACCESS_TOKEN=sbp_xxx
export TF_VAR_database_password="$(openssl rand -base64 24)"
terraform init && terraform apply
terraform output api_url      # -> SUPABASE_URL for the frontend
```

### 5.2 Migrations (schema + RLS)
`supabase/migrations/` holds the schema (`0001_init.sql`) and policies
(`0002_policies.sql`), applied with `supabase db push` after linking to the
Terraform-created project. See the [supabase README](../supabase/README.md).

### 5.3 CI (optional but recommended)
A GitHub Actions workflow can run `terraform plan` on PRs and, on merge to
`main`, `terraform apply` + `supabase db push`. The anon key + project URL get
written into the frontend config (see §6.1) at deploy time. Alternative if you
prefer not to adopt Terraform: the **Supabase Management API** or the
`supabase projects create` CLI command can create the project, and migrations
still carry the schema — the migrations are tool-agnostic.

---

## 6. Data model

Four owner-scoped tables mirror the existing local stores (full DDL in
`supabase/migrations/0001_init.sql`):

| Table | Mirrors | Notes |
| --- | --- | --- |
| `public.profiles` | — | 1:1 with `auth.users`; auto-created by a `handle_new_user` trigger. |
| `public.user_settings` | `musi:settings` | single `jsonb` blob (context, prefs, stats). |
| `public.sessions` | `musi.sessions` | one row per saved routine; `drills jsonb`; `is_public`+`share_slug` for future sharing; `deleted_at` tombstone. |
| `public.session_history` | `musi.sessionHistory` | one row per completed run. |

Why a JSON blob for settings but real rows for sessions: settings are read/written
as a whole and never queried by field, so a blob is simplest; sessions benefit
from per-row sync, sharing, and tombstones.

### RLS
Every table has Row Level Security enabled and owner-scoped policies
(`auth.uid() = user_id`), plus a read-only exception for `is_public` sessions
(full policies in `supabase/migrations/0002_policies.sql`). This was verified
against a local Postgres: owners see only their rows + public sessions, and
cross-user updates/inserts are rejected.

---

## 7. Frontend integration (planned — code samples)

The following modules are **new and additive**; existing feature code keeps
calling the same `persistence.js` / `sessions.js` APIs.

### 7.1 Config (anon key is public)
The anon key is designed to be shipped in client code; RLS is what protects data.

```js
// js/config.js  (values come from `terraform output`, injected at deploy)
export const SUPABASE_URL = "https://<project-ref>.supabase.co";
export const SUPABASE_ANON_KEY = "<anon-public-key>";
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
```

### 7.2 Lazy client (keeps offline path zero-dependency)
```js
// js/supabaseClient.js
import { SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_ENABLED } from "./config.js";

let clientPromise = null;
export function getSupabase() {
  if (!CLOUD_ENABLED) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true },
        }));
  }
  return clientPromise;
}
```
The dynamic `import()` means signed-out/offline users never fetch the SDK. For
strict offline support, **vendor** the SDK into `js/vendor/` and add it to the
service-worker precache instead of using the CDN.

### 7.3 Auth (magic-link first)
```js
// js/auth.js (sketch)
import { getSupabase } from "./supabaseClient.js";
export async function signInWithEmail(email) {
  const sb = await getSupabase();
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
}
export async function onAuthChange(cb) {
  const sb = await getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  cb(data.session);
  sb.auth.onAuthStateChange((_e, session) => cb(session));
}
```
UI: a small account control in the `<header>` of `index.html` (next to the
context pill) — "Sign in" → email field → "Check your email". When signed in,
show the user and a "Sync on/off" toggle.

### 7.4 Sync engine (the only real glue)
`js/sync.js` is the one non-trivial new piece. To wire it with minimal churn,
add a lightweight change-notification to the two storage modules (they already
funnel all writes through `writeSettings` / `persistSessions`), e.g. a
`subscribe(listener)` like `musicalContext.js` already implements.

Responsibilities:
1. **On sign-in:** pull remote rows, merge into local stores (last-write-wins by
   `updated_at`), re-render Home/sessions/stats.
2. **On local change:** enqueue an outbound op in a `musi.syncQueue`
   localStorage list; debounce-flush to Supabase when online.
3. **On reconnect (`online` event):** flush the queue.
4. **Conflict policy:** last-write-wins per record using `updated_at`; deletes
   are tombstones (`deleted_at`) so they win over stale edits.
5. **Realtime (later):** subscribe to `postgres_changes` for the user's rows to
   get live multi-device updates.

This keeps the merge logic in exactly one file and leaves feature modules
untouched.

---

## 8. PWA / service-worker considerations
- **Do not cache** Supabase Auth/REST responses. In `service-worker.js`, bypass
  (network-only, no `respondWith`) any request whose origin is the Supabase
  project URL, so the SW never serves stale API data or auth tokens.
- If the SDK is vendored, add `js/vendor/...` to `PRECACHE_URLS` and bump
  `CACHE_VERSION`. If loaded from CDN, leave it network-fetched (it won't work
  fully offline until first cached, hence the vendoring recommendation).
- Auth tokens live in `localStorage` via the SDK (`persistSession: true`); that's
  fine for this app and survives SW updates.

---

## 9. Future workbench features this unlocks
The schema/auth foundation is chosen so these become incremental, not rewrites:
- **Share a routine:** `sessions.is_public` + `share_slug` already exist; add a
  public read page that loads a session by slug (RLS already allows public read).
- **Cloud recordings:** add a Supabase **Storage** bucket (owner-scoped) for the
  recorder's WAV/Opus output; store metadata in a `recordings` table.
- **Cross-device resume:** sync `musi.activeSession` so a session started on
  phone can resume on desktop.
- **Collaboration / shared sessions:** a `session_members` join table + policies.
- **Leaderboards / social:** opt-in aggregate tables with carefully scoped RLS.
- **CLI sign-in:** the `cli/` companion can authenticate (device-code or PAT) to
  the same project and read/write the same sessions — shared engine, shared data.

---

## 10. Phased rollout

| Phase | Scope | Outcome |
| --- | --- | --- |
| **0 — Infra** *(scaffolded)* | Terraform project + settings; migrations + RLS; local `supabase start`. | Backend provisionable from code. |
| **1 — Auth** | `config.js`, `supabaseClient.js`, `auth.js`; header sign-in UI; profile auto-created. | Users can sign in; nothing else changes. |
| **2 — Settings/stats sync** | `sync.js` for `user_settings` (musical context + prefs + stats blob). | Preferences & stats follow the user. |
| **3 — Sessions sync** | Sync `sessions` + `session_history` with tombstones + queue. | Saved routines & history sync across devices. |
| **4 — Realtime + active session** | `postgres_changes` subscription; sync `activeSession`. | Live multi-device + cross-device resume. |
| **5 — Workbench** | Sharing, cloud recordings (Storage), collaboration, CLI auth. | New product surface area. |

Phases 1–3 are the core. Each is independently shippable and safe to ship
behind `CLOUD_ENABLED` so the static app is never blocked on the backend.

---

## 11. Security considerations
- **Anon key** is public by design; **RLS** is the actual access control — enabled
  on every table from migration `0002`.
- **Never** ship the service-role key or DB password to the client; those stay in
  Terraform/CI secrets only.
- `handle_new_user` is `security definer` with a pinned `search_path` (safe
  pattern) so profile creation works under the auth trigger.
- Set the auth **redirect allow-list** precisely (done in Terraform `auth` block)
  to prevent open-redirect on magic links.
- Public sharing is strictly read-only and opt-in (`is_public` must be set by the
  owner; default `false`).

---

## 12. Testing strategy
- **Infra:** `terraform validate` / `terraform plan` in CI (no apply on PRs).
- **Schema/RLS:** apply migrations to a local Postgres (or `supabase start`) and
  run policy tests — owner isolation, public-read, tombstones. *(Already done for
  the current migrations against Postgres 16.)*
- **Frontend:** because Musi has no test framework, verify in a browser served
  over HTTP (`python3 -m http.server 8080`): sign in (magic link via local
  `supabase start` mailbox), make a change on one browser profile, confirm it
  appears in another; toggle offline and confirm the queue flushes on reconnect.
- **Regression:** confirm the **signed-out** experience is byte-for-byte the same
  as today (the most important guardrail).

---

## 13. Open questions
- **Auth method first:** magic-link only, or add Google/GitHub OAuth in Phase 1?
- **SDK delivery:** pin a CDN import (simplest) vs vendor for true offline?
- **Stats granularity:** keep the single daily blob, or move to per-day rows for
  history/streaks across devices?
- **Hosting:** where is Musi deployed (GitHub Pages / Netlify / custom)? That
  sets `site_url` and the redirect allow-list, and whether CI can inject config.
