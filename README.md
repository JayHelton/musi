# Musi

Music theory tools, quizzes, and training — scales, intervals, chords, ear
training, fretboard, metronome, backing tracks, a riff composer, a tuner, and a
voice recorder with pitch/key detection.

Musi is a self-contained, client-side web app (vanilla HTML/CSS/JS, ES modules,
no build step). It can run in three ways:

- **In the browser** — open `index.html` (ideally via a local web server).
- **As an installable desktop app** — packaged with [Electron](https://www.electronjs.org/) for Windows, macOS, and Linux.
- **As an installable mobile app** — installed from the browser as a PWA (Progressive Web App) on Android/iOS.

---

## Run in the browser

Because the app uses ES modules, serve it over HTTP rather than opening the file
directly:

```bash
# any static server works, e.g.
npx serve .
# or
python3 -m http.server 8080
```

Then visit the printed URL.

---

## Desktop app (Electron)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm

### Develop / run

```bash
npm install
npm start
```

This launches the app in an Electron window. The app is served through a custom
`app://` scheme (rather than `file://`) so that ES module imports load correctly,
and microphone access is granted for the tuner, ear trainer, and voice recorder.

### Build installers

[`electron-builder`](https://www.electron.build/) produces native installers. The
app icon is generated from `build/icon.png`.

```bash
npm run dist          # build for the current platform
npm run dist:win      # Windows: NSIS installer + portable .exe
npm run dist:mac      # macOS: .dmg + .zip
npm run dist:linux    # Linux: AppImage + .deb
```

Outputs are written to `dist/`.

> Note: building installers for a given OS is generally done **on that OS**
> (e.g. build the macOS `.dmg` on macOS). `npm run pack` produces an unpacked
> build for quick local testing without creating an installer.

---

## Mobile app (PWA)

Electron targets desktop only, so mobile installability is provided via PWA
support: a [web app manifest](manifest.webmanifest) and an offline
[service worker](service-worker.js).

1. Host the folder over **HTTPS** (PWAs require a secure context). Any static
   host works — GitHub Pages, Netlify, Vercel, etc.
2. Open the site in a mobile browser.
3. Use **"Add to Home Screen"** (Android Chrome shows an install prompt; on iOS
   use Share → Add to Home Screen).

Once installed, the app launches full-screen, uses the Musi icon, and works
offline thanks to the cached app shell.

---

## Project layout

```
index.html             App markup
css/                   Styles
js/                    App logic (ES modules)
favicon.png            Source artwork
icons/                 Generated PWA icons (192/512/maskable)
build/icon.png         Master icon for electron-builder
electron/main.js       Electron main process (custom protocol + permissions)
electron/preload.js    Context-isolated preload bridge
manifest.webmanifest   PWA manifest
service-worker.js      Offline caching for the PWA
```
