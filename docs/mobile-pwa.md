# Mobile install (PWA)

Musi is a Progressive Web App, so it can be installed straight from the browser
on Android and iOS — no app store required. This is the foundation that the
Google Play build (see [android-play-store.md](android-play-store.md)) is built
on.

## What makes it installable

- `manifest.webmanifest` — name, icons (192/512/maskable), `standalone` display,
  theme/background colors.
- `service-worker.js` — caches the app shell so it loads offline.
- `index.html` — links the manifest, adds mobile web-app meta tags, and registers
  the service worker (only when served over `http`/`https`).

## Requirement: serve over HTTPS

PWAs require a **secure context**. Host the project folder on any static HTTPS
host:

- [GitHub Pages](https://pages.github.com/)
- [Netlify](https://www.netlify.com/) / [Vercel](https://vercel.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/)
- or any web server with TLS

Serve the repository root (the folder containing `index.html`,
`manifest.webmanifest`, and `service-worker.js`).

### Local testing

`localhost` counts as a secure context, so you can test installability locally:

```bash
npx serve .
# open the printed http://localhost:... URL in Chrome
```

Use Chrome DevTools → **Application** tab to inspect the manifest and service
worker, and **Lighthouse** → "Installable" to verify PWA readiness.

## Install on a device

- **Android (Chrome)**: open the site → an "Install app" prompt appears, or use
  the ⋮ menu → **Install app / Add to Home screen**.
- **iOS (Safari)**: Share button → **Add to Home Screen**.

Once installed, Musi launches full-screen with its own icon and works offline.

## Updating

When you deploy new files, the service worker (`musi-v1`) revalidates same-origin
assets in the background. To force clients onto a fresh cache after a significant
change, bump the `CACHE` constant in `service-worker.js` (e.g. `musi-v2`).
