/* Musi service worker — offline app shell caching for the installable PWA. */
const CACHE = 'musi-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './css/base.css',
  './css/quiz.css',
  './css/tools.css',
  './css/trainers.css',
  './css/generators.css',
  './css/visualizer.css',
  './css/recorder.css',
  './js/main.js',
  './js/audio.js',
  './js/backingTrack.js',
  './js/chordBuilder.js',
  './js/circleOfFifths.js',
  './js/earTrainer.js',
  './js/fretboardTrainer.js',
  './js/intervalQuiz.js',
  './js/intervals.js',
  './js/keyboard.js',
  './js/metronome.js',
  './js/nowPlaying.js',
  './js/riffGenerator.js',
  './js/scaleQuiz.js',
  './js/scaleReference.js',
  './js/scales.js',
  './js/theory.js',
  './js/visualizer.js',
  './js/vocalTrainer.js',
  './js/recorder.js',
  './js/sightReadingTrainer.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Tolerate individual misses so one bad URL doesn't fail the whole install.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigation requests: serve cached index.html when offline (SPA shell).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (sameOrigin) {
    // Cache-first for same-origin assets, with background refresh.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Cross-origin (e.g. Google Fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
