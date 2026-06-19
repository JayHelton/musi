/* Musi service worker — offline app shell caching for PWA installs. */
const CACHE_VERSION = "v31-exercise-mobile-actions";
const CACHE_NAME = `musi-${CACHE_VERSION}`;

/* Core files that make up the installable app shell. Paths are relative to the
   service worker scope so the app works whether it is served from a domain root
   or a sub-path (e.g. GitHub Pages project sites). */
const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "css/base.css",
  "css/quiz.css",
  "css/tools.css",
  "css/trainers.css",
  "css/generators.css",
  "css/visualizer.css",
  "css/recorder.css",
  "css/mobile-ux.css",
  "css/sessions.css",
  "css/songwriter.css",
  "css/exercises.css",
  "js/main.js",
  "js/markdown.js",
  "js/attachments.js",
  "js/audio.js",
  "js/musicalContext.js",
  "js/contextBar.js",
  "js/commandPalette.js",
  "js/home.js",
  "js/progressHeader.js",
  "js/backingTrack.js",
  "js/chordBuilder.js",
  "js/circleOfFifths.js",
  "js/earTrainer.js",
  "js/fretboardTrainer.js",
  "js/intervalQuiz.js",
  "js/intervals.js",
  "js/keyboard.js",
  "js/metronome.js",
  "js/nowPlaying.js",
  "js/persistence.js",
  "js/pitch.js",
  "js/recorder.js",
  "js/recorderWorklet.js",
  "js/riffGenerator.js",
  "js/scaleQuiz.js",
  "js/scaleReference.js",
  "js/stats.js",
  "js/sessions.js",
  "js/sessionsUI.js",
  "js/songwriter.js",
  "js/exercises.js",
  "js/scales.js",
  "js/sightReadingTrainer.js",
  "js/theory.js",
  "js/visualizer.js",
  "js/vocalTrainer.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache individually so one missing asset does not abort the whole install.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let the browser deal with the rest.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // For navigations, serve the cached app shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match("index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  const isAppShellAsset =
    sameOrigin &&
    (request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "manifest" ||
      url.pathname.endsWith(".html"));

  // App shell assets must update quickly in installed PWAs; fall back to cache
  // only when offline so mobile users do not stay pinned to stale UI code.
  if (isAppShellAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const network = await fetch(new Request(request, { cache: "reload" }));
          if (network && network.ok) cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch (err) {
          return (await cache.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  // Other same-origin static assets: cache-first for instant, offline-capable loads.
  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const network = await fetch(request);
          if (network && network.ok) cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Cross-origin assets (e.g. Google Fonts): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((network) => {
          if (network && (network.ok || network.type === "opaque")) {
            cache.put(request, network.clone()).catch(() => {});
          }
          return network;
        })
        .catch(() => null);
      return cached || (await networkFetch) || Response.error();
    })()
  );
});
