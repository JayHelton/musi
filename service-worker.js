/* Musi service worker — offline app shell caching for PWA installs. */
const CACHE_VERSION = "v210-tool-first-wp03-back";
const CACHE_NAME = `musi-${CACHE_VERSION}`;

/* Core files that make up the installable app shell. Paths are relative to the
   service worker scope so the app works whether it is served from a domain root
   or a sub-path (e.g. GitHub Pages project sites). */
const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "favicon.png",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-maskable-192.png",
  "icons/apple-touch-icon-180.png",
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
  "css/modals.css",
  "css/songwriter.css",
  "css/exercises.css",
  "css/companions.css",
  "css/workbooks.css",
  "css/routines.css",
  "css/drums.css",
  "css/chordworkout.css",
  "css/notes.css",
  "css/practice.css",
  "css/tabanalyzer.css",
  "css/tracktosheet.css",
  "css/gpplayer.css",
  "css/gpimport.css",
  "css/intervalorbit.css",
  "css/selection-sheet.css",
  "css/ux-shell.css",
  "css/ux-chords-orbit.css",
  "css/triads.css",
  "css/settings.css",
  "css/study-lab.css",
  "css/sync.css",
  "css/theme-gbc.css",
  "css/landscape.css",
  "css/boot-splash.css",
  "css/route-notice.css",
  "css/shell.css",
  "css/tools-home.css",
  "chord-cards/",
  "chord-cards/index.html",
  "chord-cards/css/cards.css",
  "chord-cards/src/app.js",
  "chord-cards/src/render.js",
  "chord-cards/src/validate.js",
  "chord-cards/data/shapes.js",
  "js/movableChordCards.js",
  "js/main.js",
  "js/bootSplash.js",
  "js/tools.js",
  "js/recents.js",
  "js/selectionSheet.js",
  "js/uxPrimitives.js",
  "js/pickers.js",
  "js/screenUx.js",
  "js/attachments.js",
  "js/audio.js",
  "js/musicalContext.js",
  "js/home.js",
  "js/tools/homeModel.js",
  "js/tools/home.js",
  "js/shell/nav.js",
  "js/shell/navStack.js",
  "js/shell/unsavedGuard.js",
  "js/shell/toolPage.js",
  "js/audioDock.js",
  "css/tool-page.css",
  "css/audio-dock.css",
  "js/audioOwner.js",
  "js/appRoute.js",
  "js/routeMap.js",
  "js/routineRoute.js",
  "js/routineDashboardModel.js",
  "js/routineNav.js",
  "js/studyCatalog.js",
  "js/studyProgress.js",
  "js/studyLabModel.js",
  "js/studyLabMic.js",
  "js/studyLab.js",
  "js/musicPreferences.js",
  "js/sync/syncProfile.js",
  "js/sync/frames.js",
  "js/sync/camera.js",
  "js/sync/zip.js",
  "js/sync/syncBundle.js",
  "js/sync/syncUI.js",
  "js/dataEvents.js",
  "js/cloud/cloudConfig.js",
  "js/cloud/client.js",
  "js/cloud/auth.js",
  "js/cloud/recordMap.js",
  "js/cloud/shadowStore.js",
  "js/cloud/reconcile.js",
  "js/cloud/transport.js",
  "js/cloud/blobSync.js",
  "js/sync/crc32.js",
  "js/cloud/realtimeLink.js",
  "js/cloud/cloudSync.js",
  "js/cloud/cloudUI.js",
  "js/vendor/supabase-js.esm.js",
  "css/cloud.css",
  "js/qr/qrEncode.js",
  "js/qr/qrDecode.js",
  "js/progressHeader.js",
  "js/backingTrack.js",
  "js/chordBuilder.js",
  "js/chordReference.js",
  "js/chordWorkout.js",
  "js/chords.js",
  "js/circleOfFifths.js",
  "js/earTrainer.js",
  "js/fretboardTrainer.js",
  "js/tunings.js",
  "js/intervalOrbit.js",
  "js/intervalOrbitModel.js",
  "js/interval-map/model.js",
  "js/interval-map/questions.js",
  "js/interval-map/reveal.js",
  "js/interval-map/audioAnswer.js",
  "js/interval-map/progress.js",
  "js/interval-map/fretboardView.js",
  "js/interval-map/ui.js",
  "js/intervalQuiz.js",
  "js/intervals.js",
  "js/keyboard.js",
  "js/metronome.js",
  "js/notes.js",
  "js/nowPlaying.js",
  "js/persistence.js",
  "js/migrations/index.js",
  "js/migrations/notesUnfiled.js",
  "js/migrations/exerciseMetadata.js",
  "js/migrations/drumsToExercises.js",
  "js/practiceTimer.js",
  "js/pitch.js",
  "js/pitchMetrics.js",
  "js/pitchMatch.js",
  "js/pitchExercises.js",
  "js/pitchProgress.js",
  "js/pitchGuideLock.js",
  "js/pitchCapture.js",
  "js/pitchCaptureWorklet.js",
  "js/pitchDetectWorker.js",
  "js/pitchMic.js",
  "js/pitchTrainer.js",
  "js/pitchRunner.js",
  "js/recorder.js",
  "js/recorderWorklet.js",
  "js/riffGenerator.js",
  "js/routineMetronome.js",
  "js/routineModel.js",
  "js/routines.js",
  "js/scaleQuiz.js",
  "js/scaleReference.js",
  "js/triadReference.js",
  "js/sweepReference.js",
  "js/sweepPatterns.js",
  "js/data/sweepLibrary.js",
  "js/tab/tabAnalyzer.js",
  "js/tab/tabAnalysisView.js",
  "js/trackToSheet.js",
  "js/trackToSheet/analysisOptions.js",
  "js/trackToSheet/analysisPanel.js",
  "js/trackToSheet/dsp.js",
  "js/trackToSheet/transcribe.js",
  "js/trackToSheet/toTabModel.js",
  "js/trackToSheet/score.js",
  "js/gpPlayer.js",
  "js/gpPlayerUI.js",
  "js/gpPlayer/dom.js",
  "js/gpPlayer/rangeUtils.js",
  "js/gpPlayer/tempoRange.js",
  "js/gpPlayer/playerState.js",
  "js/gpPlayer/parchmentView.js",
  "js/gpPlayer/followScroll.js",
  "js/gpPlayer/loopSelection.js",
  "js/gpPlayer/measureNav.js",
  "js/gpPlayer/transportDock.js",
  "js/gpPlayer/practiceRail.js",
  "js/gpPlayer/trackTabs.js",
  "js/gpPlayer/panelManager.js",
  "js/gpPlayer/shortcutHelp.js",
  "js/gpPlayer/trackMixer.js",
  "js/gpPlayer/settingsDrawer.js",
  "js/gpPlayer/playerMenu.js",
  "js/gpPlayer/metronomeState.js",
  "js/gpPlayer/metronomePanel.js",
  "js/gpPlayer/annotationsDrawer.js",
  "js/gpPlayer/exerciseImportPanel.js",
  "js/gpPlayer/measureDigest.js",
  "js/gpPlayer/exerciseSegments.js",
  "js/gpPlayer/index.js",
  "js/gpPlayer/instrumentVoices.js",
  "js/gpPlayer/layoutMetrics.js",
  "js/gpPlayer/scoreLayout.js",
  "js/gpPlayer/viewModes.js",
  "js/gpAnnotations.js",
  "js/gpExerciseScore.js",
  "js/gpMixPlayer.js",
  "js/tab/tabModel.js",
  "js/tab/tabParser.js",
  "js/tab/tabPlayer.js",
  "js/tab/metroClick.js",
  "js/tab/gpPercussion.js",
  "js/tab/gpParseWorker.js",
  "js/tab/gpParseClient.js",
  "js/tab/playOrder.js",
  "js/tab/scoreTimeline.js",
  "js/tab/pdfText.js",
  "js/tab/guitarPro.js",
  "js/tab/gp5.js",
  "js/drums/gpDrumImport.js",
  "js/analysis/keyDetect.js",
  "js/analysis/chordDetect.js",
  "js/analysis/pitchClass.js",
  "js/analysis/scaleDetect.js",
  "js/analysis/arpeggios.js",
  "js/analysis/techniques.js",
  "js/analysis/segments.js",
  "js/stats.js",
  "js/songwriter.js",
  "js/folderTree.js",
  "js/exercises.js",
  "js/exerciseCompanions/types.js",
  "js/exerciseCompanions/panel.js",
  "js/exerciseCompanions/diagram.js",
  "js/exerciseCompanions/scaleRef.js",
  "js/exerciseCompanions/triadRef.js",
  "js/exerciseCompanions/sweepRef.js",
  "js/exerciseCompanions/pitchTrain.js",
  "js/exerciseCompanions/earTrain.js",
  "js/exerciseCompanions/intervalOrbit.js",
  "js/exerciseCompanions/index.js",
  "js/exercisesBulk.js",
  "js/exercisesBulkUI.js",
  "js/sessionRecorder.js",
  "js/exerciseTakePanel.js",
  "js/workbookModel.js",
  "js/workbookKeyboard.js",
  "js/workbookCompanionPanel.js",
  "js/workbooks.js",
  "js/scales.js",
  "js/sightReadingTrainer.js",
  "js/theory.js",
  "js/timingDrill.js",
  "js/visualizer.js",
  "js/vocalTrainer.js",
  "js/drums/types.js",
  "js/drums/notation.js",
  "js/drums/tabParser.js",
  "js/drums/pdfExtract.js",
  "js/drums/pdfTabImport.js",
  "js/drums/tabRenderer.js",
  "js/drums/builtinPatterns.js",
  "js/drums/drumEngine.js",
  "js/drums/fillGenerator.js",
  "js/drums/drumPatternDb.js",
  "js/drums/drumsUI.js",
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

// Self-hosters: add your Supabase origin here (must match cloud-config.json).
const EXTRA_SYNC_ORIGINS = [
  // 'https://supabase.example.com',
];

// Every Supabase API lives under one of these path prefixes. The app has no
// build step, so the worker cannot read cloud-config.json. The path shape
// covers a hosted project, a self-hosted origin, and a local stack alike.
const SUPABASE_API_PREFIXES = [
  "/auth/v1/",
  "/rest/v1/",
  "/storage/v1/",
  "/realtime/v1/",
  "/functions/v1/",
];

function isSupabaseSyncRequest(url) {
  if (url.hostname.endsWith(".supabase.co")) return true;
  if (url.hostname.endsWith(".supabase.in")) return true;
  if (EXTRA_SYNC_ORIGINS.includes(url.origin)) return true;
  if (url.origin === self.location.origin) return false;
  return SUPABASE_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let the browser deal with the rest.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache Supabase auth, REST, Storage, or Realtime traffic. Without this
  // check the cross-origin branch below would serve stale sync data.
  if (isSupabaseSyncRequest(url)) return;

  // Runtime cloud-config.json must always come from the network.
  if (url.pathname.endsWith("cloud-config.json")) return;

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
