# Desktop app (Electron)

Musi runs as a native desktop application on Windows, macOS, and Linux via
Electron, and is packaged into installers with `electron-builder`.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer (includes npm)
- Platform build tooling is only needed if you build installers:
  - **Windows installers**: build on Windows (or Wine on Linux/macOS).
  - **macOS installers (.dmg)**: build on macOS (code signing/notarization needs Apple tooling).
  - **Linux installers (AppImage/.deb)**: build on Linux.

## Install dependencies

```bash
npm install
```

This installs `electron` and `electron-builder` (declared as `devDependencies`).

## Run in development

```bash
npm start
# or
npm run dev
```

This launches Musi in an Electron window.

### How it runs internally

- The app is served through a custom **`app://` scheme** (registered in
  `electron/main.js`) instead of `file://`. This is required because Chromium
  blocks `<script type="module">` ES imports loaded over `file://` due to its
  CORS policy. The custom scheme is registered as `standard` + `secure` so module
  loading, `fetch`, and a secure context all work.
- **Microphone access** is granted via a permission handler so the Tuner, Ear
  Trainer, and Voice Recorder features work.
- `electron/preload.js` exposes a tiny, context-isolated `window.musi` object;
  `contextIsolation` is on and `nodeIntegration` is off (sandboxed) for security.
- A single-instance lock prevents multiple windows; external `http(s)` links open
  in the system browser.

## Package installers

`electron-builder` reads its configuration from the `build` block in
`package.json`. The application icon is generated from `build/icon.png`
(1024×1024).

| Command | Output |
| --- | --- |
| `npm run pack` | Unpacked app in `dist/` (fast, for local testing — no installer) |
| `npm run dist` | Installer(s) for the **current** OS |
| `npm run dist:win` | Windows: NSIS installer + portable `.exe` |
| `npm run dist:mac` | macOS: `.dmg` + `.zip` |
| `npm run dist:linux` | Linux: `AppImage` + `.deb` |
| `npm run dist:all` | macOS + Windows + Linux (requires the right host/tooling) |

All artifacts are written to the `dist/` directory (git-ignored).

### Example

```bash
# On Linux
npm run dist:linux
ls dist/
# Musi-1.0.0.AppImage
# musi_1.0.0_amd64.deb
```

## Versioning

The app version comes from the `version` field in `package.json`. Bump it before
building a release (e.g. `npm version patch`).

## Code signing & notarization (optional, for distribution)

- **macOS**: set up an Apple Developer ID certificate and notarization. See the
  [electron-builder code signing docs](https://www.electron.build/code-signing).
- **Windows**: provide a code-signing certificate to avoid SmartScreen warnings.

For local/internal use you can skip signing entirely.

## Troubleshooting

- **Blank window / module errors**: ensure you launch via `npm start` (which uses
  the `app://` scheme). Opening `index.html` directly with `file://` will fail to
  load ES modules — that's expected; use a web server or the Electron app.
- **No microphone in the app**: grant the OS-level microphone permission to the
  Musi app (macOS: System Settings → Privacy & Security → Microphone).
- **GPU/`viz_main` errors in headless/CI environments**: harmless; run under
  `xvfb-run` and pass `--no-sandbox` if needed.
