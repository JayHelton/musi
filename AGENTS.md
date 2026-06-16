# AGENTS.md

## Cursor Cloud specific instructions

Musi is a **fully static, frontend-only** product — there is no backend, database, or
API. It ships as two deliverables that share the same music-theory engine in `js/`:

- **Web app (PWA):** plain HTML/CSS/ES modules at the repo root (`index.html`, `js/`,
  `css/`, `service-worker.js`, `manifest.webmanifest`). No build step or framework.
- **CLI companion:** `cli/` — a zero-dependency Node.js (>=18) program.

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
