/* Musi service worker — offline app shell caching for PWA installs. */
const CACHE_VERSION = "v266-exercise-step";
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
  "css/boot-splash.css",
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
  "css/library.css",
  "css/library-drive.css",
  "css/companions.css",
  "css/workbooks.css",
  "css/chordworkout.css",
  "css/notes.css",
  "css/tabanalyzer.css",
  "css/tracktosheet.css",
  "css/gpplayer.css",
  "css/gpimport.css",
  "css/selection-sheet.css",
  "css/ux-shell.css",
  "css/chordref.css",
  "css/triads.css",
  "css/chordfinder.css",
  "css/drumtab.css",
  "css/settings.css",
  "css/sync.css",
  "css/cloud.css",
  "css/theme-gbc.css",
  "css/app-toast.css",
  "css/shell.css",
  "css/context-quick.css",
  "css/tool-page.css",
  "css/audio-dock.css",
  "css/landscape.css",
  "chord-cards/",
  "chord-cards/index.html",
  "chord-cards/css/cards.css",
  "chord-cards/src/app.js",
  "chord-cards/src/render.js",
  "chord-cards/src/validate.js",
  "chord-cards/data/shapes.js",
  "chord-cards/data/shapes.js",
  "chord-cards/src/render.js",
  "chord-cards/src/validate.js",
  "js/analysis/arpeggios.js",
  "js/analysis/chordDetect.js",
  "js/analysis/chordMatch.js",
  "js/analysis/keyDetect.js",
  "js/analysis/pitchClass.js",
  "js/analysis/scaleDetect.js",
  "js/analysis/segments.js",
  "js/analysis/techniques.js",
  "js/appRoute.js",
  "js/appToast.js",
  "js/areaPages.js",
  "js/attachments.js",
  "js/audio.js",
  "js/audio/audioOwner.js",
  "js/audio/clickSynth.js",
  "js/audio/mixBus.js",
  "js/audio/packCatalog.js",
  "js/audio/sampleLoader.js",
  "js/audio/samplePackRegistry.js",
  "js/audio/sampleVoice.js",
  "js/audio/soundPrefs.js",
  "js/audio/userSounds.js",
  "js/audioDock.js",
  "js/audioOwner.js",
  "js/bootSplash.js",
  "js/chordFinder.js",
  "js/chordReference.js",
  "js/chordWorkout.js",
  "js/chords.js",
  "js/circleOfFifths.js",
  "js/cloud/auth.js",
  "js/cloud/blobSync.js",
  "js/cloud/client.js",
  "js/cloud/cloudConfig.js",
  "js/cloud/cloudSync.js",
  "js/cloud/cloudUI.js",
  "js/cloud/reconcile.js",
  "js/cloud/recordMap.js",
  "js/cloud/shadowStore.js",
  "js/cloud/transport.js",
  "js/data/sweepLibrary.js",
  "js/dataEvents.js",
  "js/drumTabReference.js",
  "js/drums/drumEngine.js",
  "js/drums/drumPatternDb.js",
  "js/drums/kitMapSvg.js",
  "js/drums/notation.js",
  "js/drums/staffLayout.js",
  "js/drums/staffNotation.js",
  "js/drums/staffSvg.js",
  "js/drums/tabReferenceModel.js",
  "js/drums/types.js",
  "js/earTrainer.js",
  "js/exerciseCompanions/diagram.js",
  "js/exerciseCompanions/earTrain.js",
  "js/exerciseCompanions/index.js",
  "js/exerciseCompanions/intervalOrbit.js",
  "js/exerciseCompanions/metronome.js",
  "js/exerciseCompanions/metronomePlan.js",
  "js/exerciseCompanions/panel.js",
  "js/exerciseCompanions/pitchTrain.js",
  "js/exerciseCompanions/scaleRef.js",
  "js/exerciseCompanions/sweepRef.js",
  "js/exerciseCompanions/triadRef.js",
  "js/exerciseCompanions/types.js",
  "js/exercises.js",
  "js/exercisesBulk.js",
  "js/exercisesBulkUI.js",
  "js/folderTree.js",
  "js/gpAnnotations.js",
  "js/gpBackingTrack.js",
  "js/gpExerciseScore.js",
  "js/gpMixPlayer.js",
  "js/gpPlayer.js",
  "js/gpPlayer/annotationsDrawer.js",
  "js/gpPlayer/backingPanel.js",
  "js/gpPlayer/backingSources.js",
  "js/gpPlayer/backingSync.js",
  "js/gpPlayer/dom.js",
  "js/gpPlayer/exerciseImportPanel.js",
  "js/gpPlayer/exerciseSegments.js",
  "js/gpPlayer/followScroll.js",
  "js/gpPlayer/index.js",
  "js/gpPlayer/instrumentVoices.js",
  "js/gpPlayer/layoutMetrics.js",
  "js/gpPlayer/loopSelection.js",
  "js/gpPlayer/measureDigest.js",
  "js/gpPlayer/measureNav.js",
  "js/gpPlayer/metronomePanel.js",
  "js/gpPlayer/metronomeState.js",
  "js/gpPlayer/panelManager.js",
  "js/gpPlayer/parchmentView.js",
  "js/gpPlayer/playerMenu.js",
  "js/gpPlayer/playerState.js",
  "js/gpPlayer/practiceRail.js",
  "js/gpPlayer/rangeUtils.js",
  "js/gpPlayer/scoreLayout.js",
  "js/gpPlayer/settingsDrawer.js",
  "js/gpPlayer/shortcutHelp.js",
  "js/gpPlayer/stringSynth.js",
  "js/gpPlayer/tempoRange.js",
  "js/gpPlayer/trackMixer.js",
  "js/gpPlayer/trackTabs.js",
  "js/gpPlayer/transportDock.js",
  "js/gpPlayer/viewModes.js",
  "js/gpPlayerUI.js",
  "js/interval-map/model.js",
  "js/interval-map/questions.js",
  "js/intervalQuiz.js",
  "js/keyboard.js",
  "js/library/driveBrowser.js",
  "js/library/driveModel.js",
  "js/library/libraryPlayerRoute.js",
  "js/library/libraryTabs.js",
  "js/main.js",
  "js/metronome.js",
  "js/migrations/drumsToExercises.js",
  "js/migrations/exerciseMetadata.js",
  "js/migrations/index.js",
  "js/migrations/notesUnfiled.js",
  "js/movableChordCards.js",
  "js/musicPreferences.js",
  "js/musicalContext.js",
  "js/notes.js",
  "js/nowPlaying.js",
  "js/persistence.js",
  "js/pickers.js",
  "js/pitch.js",
  "js/pitchCapture.js",
  "js/pitchCaptureWorklet.js",
  "js/pitchDetectWorker.js",
  "js/pitchExercises.js",
  "js/pitchGuideLock.js",
  "js/pitchMatch.js",
  "js/pitchMetrics.js",
  "js/pitchMic.js",
  "js/pitchProgress.js",
  "js/pitchRunner.js",
  "js/pitchTrainer.js",
  "js/progressHeader.js",
  "js/qr/qrDecode.js",
  "js/qr/qrEncode.js",
  "js/quizShared.js",
  "js/recents.js",
  "js/recorder.js",
  "js/recorderWorklet.js",
  "js/routeMap.js",
  "js/scaleReference.js",
  "js/scales.js",
  "js/screenUx.js",
  "js/selectionSheet.js",
  "js/shell/contextQuick.js",
  "js/shell/nav.js",
  "js/shell/navStack.js",
  "js/shell/toolPage.js",
  "js/shell/unsavedGuard.js",
  "js/sightReadingTrainer.js",
  "js/songwriter.js",
  "js/stats.js",
  "js/swReloadGuard.js",
  "js/sweepPatterns.js",
  "js/sweepReference.js",
  "js/sync/camera.js",
  "js/sync/crc32.js",
  "js/sync/frames.js",
  "js/sync/syncBundle.js",
  "js/sync/syncProfile.js",
  "js/sync/syncUI.js",
  "js/sync/zip.js",
  "js/tab/gp5.js",
  "js/tab/gpParseClient.js",
  "js/tab/gpParseWorker.js",
  "js/tab/gpPercussion.js",
  "js/tab/guitarPro.js",
  "js/tab/metroClick.js",
  "js/tab/playOrder.js",
  "js/tab/scoreTimeline.js",
  "js/tab/tabAnalysisView.js",
  "js/tab/tabAnalyzer.js",
  "js/tab/tabModel.js",
  "js/tab/tabParser.js",
  "js/tab/tabPlayer.js",
  "js/theory.js",
  "js/tools.js",
  "js/trackToSheet.js",
  "js/trackToSheet/analysisOptions.js",
  "js/trackToSheet/analysisPanel.js",
  "js/trackToSheet/dsp.js",
  "js/trackToSheet/score.js",
  "js/trackToSheet/toTabModel.js",
  "js/trackToSheet/transcribe.js",
  "js/triadReference.js",
  "js/tunings.js",
  "js/uxPrimitives.js",
  "js/vendor/supabase-js.esm.js",
  "js/visualizer.js",
  "js/vocalTrainer.js",
  "js/workbookCompanionPanel.js",
  "js/workbookKeyboard.js",
  "js/workbookModel.js",
  "js/workbookPlaythrough.js",
  "js/workbooks.js",
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
        keys
          .filter((key) => key !== CACHE_NAME && !key.startsWith("musi-pack-"))
          .map((key) => caches.delete(key))
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

// Hosts that serve the YouTube IFrame player, its assets, and its media.
const YOUTUBE_HOSTS = [
  "youtube.com",
  "youtube-nocookie.com",
  "ytimg.com",
  "googlevideo.com",
];

function isYouTubeRequest(url) {
  const host = url.hostname.toLowerCase();
  return YOUTUBE_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
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

  // The YouTube player and its media come from the network every time. The
  // cross-origin branch below would keep a stale copy of a versioned script.
  if (isYouTubeRequest(url)) return;

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
