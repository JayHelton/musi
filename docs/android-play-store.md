# Publishing to the Google Play Store (Android)

> **Important:** Electron cannot build Android apps — it only targets desktop
> (Windows/macOS/Linux). To ship Musi on the Google Play Store we reuse the exact
> same web app and package it as an Android app using a **Trusted Web Activity
> (TWA)**. A TWA is a thin Android wrapper that runs your PWA full-screen in
> Chrome with no browser UI. Because Musi is already a PWA
> (see [mobile-pwa.md](mobile-pwa.md)), it's ready to be wrapped.

There are two common ways to produce the Android app bundle:

- **Bubblewrap CLI** — Google's official command-line tool (full control, CI-friendly).
- **PWABuilder** — a website that generates a signed Android package from a URL (easiest).

Both produce an Android App Bundle (`.aab`) that you upload to the Play Console.

---

## Prerequisites

1. **A live HTTPS deployment of Musi.** The TWA loads your hosted PWA, so it must
   be deployed first (see [mobile-pwa.md](mobile-pwa.md)). Note the public URL,
   e.g. `https://musi.example.com`.
2. **A Google Play Developer account** (one-time US$25 registration) at
   <https://play.google.com/console>.
3. **The PWA passes installability checks** (valid manifest, service worker,
   icons — verify with Chrome DevTools → Lighthouse).

For the Bubblewrap path you also need:

- [Node.js](https://nodejs.org/) 18+
- A JDK (17+) and the Android SDK (Bubblewrap can install/manage the JDK and SDK
  for you on first run).

---

## Option A — Bubblewrap CLI (recommended for repeatable builds)

### 1. Install Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

### 2. Initialize the project from the deployed manifest

Run this **outside** the repo (e.g. `../musi-android/`) so the generated Android
project stays separate from the web source:

```bash
bubblewrap init --manifest https://musi.example.com/manifest.webmanifest
```

Bubblewrap reads the manifest and prompts for:

- **Application ID** — a reverse-DNS package name, e.g. `dev.jayhelton.musi`
  (use the same id as `appId` in `package.json` for consistency).
- **App name / launcher name** — "Musi".
- **Display mode** — `standalone`.
- **Orientation, theme color, background color, icons** — prefilled from the
  manifest; accept the defaults.
- **Signing key** — let Bubblewrap create a new keystore, or point it at an
  existing one. **Back this keystore up securely** — you need the same key to ship
  every future update.

### 3. Build the app bundle

```bash
bubblewrap build
```

This produces:

- `app-release-bundle.aab` — upload this to the Play Console.
- `app-release-signed.apk` — for local testing on a device.

### 4. Test on a device

```bash
bubblewrap install        # installs the APK on a connected device/emulator
```

### 5. Verify Digital Asset Links (removes the browser address bar)

A TWA only runs full-screen (no Chrome URL bar) if your website proves it owns
the app. Bubblewrap prints an `assetlinks.json` snippet during init/build.

1. Get the SHA-256 fingerprint of your signing key:
   ```bash
   bubblewrap fingerprint
   ```
2. Create `assetlinks.json` and host it at:
   ```
   https://musi.example.com/.well-known/assetlinks.json
   ```
   with contents like:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "dev.jayhelton.musi",
         "sha256_cert_fingerprints": ["<YOUR_SHA256_FINGERPRINT>"]
       }
     }
   ]
   ```
   > If you enable **Play App Signing** (recommended), also add the SHA-256
   > fingerprint that Google shows in the Play Console under
   > *Setup → App integrity*.
3. Confirm it's reachable and served as JSON before publishing.

### Updating the app later

Bump `versionCode`/`versionName` and rebuild:

```bash
bubblewrap update      # picks up manifest changes
bubblewrap build
```

Sign with the **same keystore** and upload the new `.aab`.

---

## Option B — PWABuilder (no local tooling)

1. Go to <https://www.pwabuilder.com> and enter your deployed URL
   (`https://musi.example.com`).
2. Review the PWA report and fix any flagged issues.
3. Choose **Android → Generate Package**. Set the package id (e.g.
   `dev.jayhelton.musi`) and options.
4. Download the zip — it contains the `.aab`, a signing key, and a ready-made
   `assetlinks.json`.
5. Host the provided `assetlinks.json` at
   `https://musi.example.com/.well-known/assetlinks.json`.
6. **Keep the generated signing key safe** — it's required for all future updates.

---

## Submitting in the Google Play Console

1. Open <https://play.google.com/console> → **Create app**.
   - App name: **Musi**
   - Default language, app/game = App, free/paid.
2. Complete the required setup tasks:
   - **App content**: privacy policy URL, data safety form, content rating
     questionnaire, target audience, ads declaration.
   - **Store listing**: short & full description, app icon (512×512), feature
     graphic (1024×500), and phone screenshots.
3. **Create a release**: Production (or start with Internal testing) → upload your
   `.aab`.
4. Roll out to a testing track first, confirm the app opens full-screen (proving
   Asset Links is correct), then promote to Production.
5. Submit for review.

### Store listing assets quick reference

| Asset | Size | Source |
| --- | --- | --- |
| App icon | 512×512 PNG | derive from `icons/icon-512.png` |
| Feature graphic | 1024×500 PNG | create a banner |
| Phone screenshots | min 2, 16:9 or 9:16 | capture the running app |

---

## Troubleshooting

- **Browser URL bar still shows in the app** → Digital Asset Links isn't valid.
  Recheck the SHA-256 fingerprint(s) and that
  `/.well-known/assetlinks.json` is reachable and returns `application/json`.
  If using Play App Signing, include Google's fingerprint too.
- **"App not installable" in PWABuilder/Lighthouse** → verify the manifest, that
  the service worker registers over HTTPS, and that 192/512 icons exist.
- **Upload rejected for signing** → every update must use the original keystore.
  Losing it means you can't update the app (unless enrolled in Play App Signing
  with a recoverable upload key).
- **Offline behavior** → the bundled service worker caches the app shell; after a
  deploy, bump `CACHE` in `service-worker.js` to push updates to installed users.
