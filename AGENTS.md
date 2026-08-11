# AGENTS.md

## Cursor Cloud specific instructions

### Communication style (ASD-STE100 Simplified Technical English)

**All agent output must use ASD-STE100 Simplified Technical English.** This is the
controlled-language standard that ASD (AeroSpace and Defence Industries Association of
Europe) maintains.

- **Scope:** this applies to everything the agent writes: chat replies and progress
  updates, final summaries, commit messages, PR titles and descriptions, code comments,
  and any documentation or product copy added to the repo.
- **Words:** use approved words in their approved meaning only. One word carries one
  meaning and one part of speech. Prefer the simplest common word (for example "use"
  over "utilise", "start" over "commence", "fix" over "remediate").
- **Sentence length:** keep procedural sentences to 20 words or fewer. Keep descriptive
  sentences to 25 words or fewer. Write one instruction per sentence.
- **Voice and tense:** use the active voice and name the actor. Avoid the passive voice.
  Use simple verb tenses: present, past, and future. Do not use participial phrases as
  verbs (avoid "-ing" forms that stand in for a verb).
- **Articles and noun strings:** keep articles ("a", "an", "the") in place. Do not drop
  them to save space. Avoid noun clusters of more than three words. Break long noun
  strings apart with prepositions.
- **Literal writing:** avoid slang, idiom, jargon, metaphor, and humour. Write
  literally.
- **Structure:** write steps in the order the reader must do them. Keep paragraphs to six
  sentences or fewer.
- **Terminology:** pick one term for a thing and reuse it. Do not use synonyms for
  variety.
- **Exceptions:** do not reword verbatim material to fit the standard. Verbatim material
  includes quoted code, identifiers, file paths, commands, command output, error text,
  existing product copy and UI strings, and direct quotations from the user or from
  third-party documents. Technical terms specific to this project count as approved
  project vocabulary. Use them as-is. Examples are musical terms such as "interval",
  "mode", and "chord quality", and the Game Boy Color theme tokens.
- **Conflict:** when ASD-STE100 style rules conflict with technical accuracy, accuracy
  wins. Restructure the sentence instead of stating something incorrect.

### Agent workflow (Composer 2.5 sub-agents)

**Sub-agent implementation is required.** Use Composer 2.5 sub-agents for task
implementation; reserve the main agent thread for planning, coordination, and
distribution.

- **Main agent thread:** scope the work, break it into concrete subtasks, choose
  which sub-agents to run (and in what order), review results, and integrate
  changes. Do not do broad implementation directly on the main thread when a
  sub-agent can own the work.
- **Sub-agents:** perform implementation — code changes, file edits, targeted
  exploration, verification steps, and other execution work assigned by the main
  agent.
- **Distribution:** launch sub-agents in parallel when tasks are independent;
  sequence them when output from one task informs the next. Give each sub-agent a
  focused prompt with enough context to finish its slice without relying on the
  user's message or prior main-thread steps.
- **Model:** use Composer 2.5 (`composer-2.5` or `composer-2.5-fast`) for
  implementation sub-agents unless the user specifies otherwise.

### Branching and delivery (trunk-based, no PRs)

- **Trunk only:** do all work directly on `main` (the trunk; some people call it
  `master`, but this repo has no `master` branch). Do not create feature branches and
  do not open pull requests.
- **Push to main:** when the work is done, push straight to `main` with
  `git push origin main`.
- **Complete features only:** only push finished, working features. `main` is the live
  trunk — a push is a release, not a half-done checkpoint. That trade-off is what makes
  skipping review acceptable; keep commits shippable.
- **Stay current:** commit in logical units with descriptive messages. Before pushing,
  pull and rebase onto `origin/main` (`git pull --rebase origin main`) so the push is a
  fast-forward; resolve conflicts first.
- **Verify before push:** there is no CI. Follow the Gotchas definition of verifying
  (run the CLI, exercise the web UI in a browser) and run any relevant ad-hoc Node test
  runners under `tests/` (e.g. `node tests/workbooks/run.mjs`,
  `node tests/exercises/run.mjs`).
- **Harness override:** a cloud-agent harness may still force branch-and-PR delivery. If
  so, say so explicitly — do not silently open a PR against this rule.

Musi is a **fully static, frontend-only** product — there is no backend, database, or
API. It ships as two deliverables that share the same music-theory engine in `js/`:

- **Web app (PWA):** plain HTML/CSS/ES modules at the repo root (`index.html`, `js/`,
  `css/`, `service-worker.js`, `manifest.webmanifest`). No build step or framework.
- **CLI companion:** `cli/` — a zero-dependency Node.js (>=18) program.

### Visual design (Atomic Purple Game Boy Color)

The web UI is a **retro Game Boy Color** aesthetic — specifically an “Atomic Purple”
handheld look. New UI work must respect this system rather than introducing a generic
dark/modern dashboard style.

- **Theme source of truth:** `css/base.css` (palette tokens) + `css/theme-gbc.css`
  (shell ambient, hero, type hierarchy, screen-tile panels, dock chrome).
- **Palette:** deep navy screen surfaces (`--bg` / `--bg2` / `--card`), translucent
  purple shell gradients, punchy yellow accent (`--accent` / `--on-accent`), purple
  secondary (`--accent2` / `--shell-bright`), ABXY-inspired button hues (`--btn-a/b/x`).
- **Typography:** pixel stack — Press Start 2P for brand/kickers (`--font-pixel`),
  Pixelify Sans for body/controls (`--font-body`), VT323 for dense readouts/tabs
  (`--font-ui`). Prefer these over Inter/Roboto/system or Courier New.
- **Surfaces:** panels read as LCD “screen tiles” (soft inset highlight + purple border),
  not flat black cards. Prefer `var(--radius-screen)` / `var(--radius-pill)` and theme
  tokens over hard-coded `#0a0a0a` / `#0d0d0d` / pure-black backgrounds.
- **Motion:** keep ambient GBC motion (grid drift, soft hero blobs) intact; feature UI
  motion should stay subtle and purposeful.
- **Do not** restyle toward purple-on-white SaaS, cream/terracotta editorial, or
  broadsheet newspaper layouts. When adding feature CSS (`css/<feature>.css`), reuse
  existing tokens/fonts so Exercises, Drums, etc. stay on-theme.

### Running the services

- **Web app:** serve the repo root over HTTP, e.g. `python3 -m http.server 8080`, then
  open `http://localhost:8080`. It must be served over HTTP — opening `index.html`
  directly breaks ES modules and the service worker.
- **CLI:** `cd cli && node bin/musi.js` for the interactive menu. Non-interactive
  activities are handy for smoke tests, e.g.
  `node bin/musi.js reference --root C --type "Major (Ionian)"` or
  `node bin/musi.js --help`. See `cli/README.md` for all activities/flags.

### Gotchas

- There is **no lint, test, or build tooling** in this repo (no ESLint/Prettier, no
  test framework, no bundler). "Verifying" means running the CLI and exercising the web
  UI in a browser.
- `npm install` in `cli/` is effectively a no-op (no dependencies, no lockfile).
- The static server caches via the service worker; after editing JS/CSS, do a hard
  reload (or update the cache name in `service-worker.js`) to pick up changes reliably.
- Audio/mic features (vocal trainer, voice recorder, ear trainer) need a browser with
  Web Audio + microphone access and can't be fully validated headlessly. Non-audio
  features (quizzes, references, circle of fifths, etc.) verify fine in a browser.
- The CLI ear trainer optionally uses a system audio player (`afplay`/`paplay`/`aplay`/
  `ffplay`/`play`); it degrades gracefully if none is present. `NO_COLOR=1` disables CLI colors.
