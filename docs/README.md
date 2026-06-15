# Musi Documentation

How to run, package, and distribute Musi across platforms.

Musi is a self-contained client-side web app (vanilla HTML/CSS/JS, ES modules,
no build step). It ships in three forms from the same source:

| Target | Technology | Guide |
| --- | --- | --- |
| Desktop (Windows / macOS / Linux) | [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) | [desktop-electron.md](desktop-electron.md) |
| Mobile install (Android / iOS, from the browser) | PWA (manifest + service worker) | [mobile-pwa.md](mobile-pwa.md) |
| Google Play Store (Android) | PWA wrapped as a Trusted Web Activity (TWA) | [android-play-store.md](android-play-store.md) |
| Flutter hybrid app (keeping `index.html` as source) | WebView shell + JS↔native bridge | [flutter-migration.md](flutter-migration.md) |

## Quick start

```bash
# Run in the browser (any static server)
npx serve .

# Run the desktop app
npm install
npm start

# Build a desktop installer for the current OS
npm run dist
```

> **Why can't Electron publish to the Android/Play Store directly?**
> Electron only targets desktop operating systems (Windows, macOS, Linux). It has
> no Android runtime. To put Musi on the Google Play Store we reuse the same web
> app and wrap it as an Android app using a **Trusted Web Activity (TWA)** — see
> [android-play-store.md](android-play-store.md). The iOS App Store has a similar
> story (PWAs can be wrapped, but the simplest mobile install path is the browser
> "Add to Home Screen" flow documented in [mobile-pwa.md](mobile-pwa.md)).
