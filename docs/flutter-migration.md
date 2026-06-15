# Moving Musi to Flutter (while keeping `index.html` as the app source)

This guide explains how to ship Musi inside a Flutter app **without rewriting the
app** — keeping the existing `index.html` + ES modules as the single source of
truth — and how to still reach native OS APIs (especially for sound processing).

## TL;DR

- **Flutter cannot render arbitrary HTML/JS apps natively.** It draws its own UI
  with Skia/Impeller and has no HTML engine.
- To run Musi unchanged, embed it in a **WebView** (a real Chromium/WebKit engine)
  using [`flutter_inappwebview`](https://pub.dev/packages/flutter_inappwebview)
  (recommended) or [`webview_flutter`](https://pub.dev/packages/webview_flutter).
- Bundle the web app as Flutter **assets** and load it locally, so `index.html`
  stays the app source.
- You **can** still use native OS sound APIs by bridging WebView JavaScript to
  Flutter platform channels / audio plugins.

---

## Can Flutter "render" the HTML?

| Approach | Runs JS? | CSS? | Web Audio / getUserMedia? | Verdict for Musi |
| --- | --- | --- | --- | --- |
| `flutter_html` package | ❌ | partial | ❌ | Renders *static* HTML to widgets only. Cannot run Musi. |
| **WebView** (`flutter_inappwebview` / `webview_flutter`) | ✅ | ✅ | ✅ | Runs the full app as-is. **Use this.** |
| Rewrite UI in Dart/Flutter widgets | n/a | n/a | via plugins | A true native rewrite (not "rendering the HTML"). |

So: to *render the existing HTML*, you use a WebView. `flutter_html` is only for
displaying formatted text/markup, not for running a Web Audio application.

---

## Architecture: `index.html` stays the source of truth

```
┌──────────────────────────── Flutter app (Dart) ────────────────────────────┐
│  main.dart                                                                   │
│   └── InAppWebView  ──loads──►  assets/web/index.html  (the existing app)    │
│           ▲                              │                                   │
│           │   JavaScript channel (bridge)│                                   │
│           └──────────────────────────────┘                                   │
│                         │                                                    │
│              Native plugins / platform channels                              │
│              (audio, files, permissions, …)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

The whole `css/`, `js/`, `index.html`, `favicon.png`, etc. are copied into the
Flutter project's `assets/web/` folder and shipped inside the app. The web code
is never forked — you keep editing it in this repo and re-copy on build.

### 1. Create the Flutter shell

```bash
flutter create musi_flutter
cd musi_flutter
flutter pub add flutter_inappwebview
```

### 2. Bundle the web app as assets

Copy the repo's web files into the Flutter project (script this in CI so the
source stays single):

```bash
# from the musi web repo root
rsync -a --delete \
  index.html favicon.png css js icons manifest.webmanifest \
  ../musi_flutter/assets/web/
```

Declare the assets in `pubspec.yaml`:

```yaml
flutter:
  assets:
    - assets/web/
    - assets/web/css/
    - assets/web/js/
    - assets/web/icons/
```

### 3. Load it in a WebView

```dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

void main() => runApp(const MusiApp());

class MusiApp extends StatelessWidget {
  const MusiApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Musi',
        home: Scaffold(
          body: SafeArea(
            child: InAppWebView(
              // Loads the bundled web app; assetFilePath serves files locally
              // so ES module imports resolve correctly.
              initialFile: 'assets/web/index.html',
              initialSettings: InAppWebViewSettings(
                allowsInlineMediaPlayback: true,       // iOS audio
                mediaPlaybackRequiresUserGesture: false,
                javaScriptEnabled: true,
              ),
              onPermissionRequest: (controller, request) async {
                // Grant microphone for the Tuner / Ear Trainer / Recorder.
                return PermissionResponse(
                  resources: request.resources,
                  action: PermissionResponseAction.GRANT,
                );
              },
            ),
          ),
        ),
      );
}
```

> ES modules: because the files are served via the WebView's asset loader
> (a real `http(s)`/asset scheme, not bare `file://`), `<script type="module">`
> imports load correctly — the same reason the Electron build uses a custom
> `app://` scheme.

### 4. Platform permissions

- **Android** (`android/app/src/main/AndroidManifest.xml`):
  ```xml
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <uses-permission android:name="android.permission.INTERNET"/>
  ```
- **iOS** (`ios/Runner/Info.plist`):
  ```xml
  <key>NSMicrophoneUsageDescription</key>
  <string>Musi uses the microphone for the tuner, ear trainer, and recorder.</string>
  ```

That's a working hybrid app: Flutter is the native shell, `index.html` is the app.

---

## Is this bad practice?

It depends on the goal. Be honest about the tradeoffs:

**Reasonable when:**
- You want to reuse the entire existing app and ship to iOS/Android quickly.
- You intend to **progressively migrate** — start as a WebView, then replace
  individual screens with native Flutter widgets over time (Flutter can overlay
  native UI on top of / beside the WebView).
- You need Flutter's plugin ecosystem for OS features the web platform can't do
  well (background audio, low-latency DSP, native file pickers, in-app purchases).

**Questionable / overkill when:**
- The *only* job is to display the WebView. In that case Flutter adds a large
  runtime for little benefit versus simpler wrappers you already have:
  - **Android**: a Trusted Web Activity (see [android-play-store.md](android-play-store.md)).
  - **Desktop**: the Electron build (see [desktop-electron.md](desktop-electron.md)).
  - **Mobile install**: the PWA (see [mobile-pwa.md](mobile-pwa.md)).
- A pure WebView wrapper also forfeits Flutter's main advantage (native widget
  performance/feel) — you're essentially shipping a browser with extra steps.

**Rule of thumb:** keeping `index.html` as the source is a fine *transitional* or
*hybrid* architecture. It's a poor *permanent end-state* if your goal is a
truly native-feeling app — for that you'd eventually port the UI to Dart and keep
only the music-theory logic (which could move to Dart or stay as a JS engine
behind a bridge). If you just need it packaged, prefer the TWA/Electron/PWA paths
over adding Flutter solely as a WebView host.

---

## Accessing OS APIs for sound processing from Flutter

Yes — you keep native audio access, at two levels:

### Level 1 — inside the WebView (no native code)

Android WebView (Chromium) and iOS `WKWebView` both implement the **Web Audio
API** and `getUserMedia`. Musi's existing audio engine (`js/audio.js`, tuner,
recorder, metronome, etc.) runs as-is. For many use cases this is enough.

Limitations vs native: higher/variable input latency, limited background-audio
control, and no access to platform DSP frameworks.

### Level 2 — native OS audio via a JS ↔ Flutter bridge

When you need low-latency capture, native DSP, or background audio, bridge the
WebView to Flutter and call native plugins or platform channels.

**Useful Flutter audio plugins:**
- [`record`](https://pub.dev/packages/record) — microphone recording.
- [`just_audio`](https://pub.dev/packages/just_audio) / [`audioplayers`](https://pub.dev/packages/audioplayers) — playback.
- [`flutter_sound`](https://pub.dev/packages/flutter_sound) — record/playback + PCM streaming.
- [`mic_stream`](https://pub.dev/packages/mic_stream) — raw PCM mic stream for analysis.
- For the lowest latency / custom DSP, write a **platform channel** to native
  audio engines: **Android Oboe/AAudio**, **iOS AVAudioEngine / Core Audio**.

**Bridge: JS calls Flutter, Flutter calls the OS.** With
`flutter_inappwebview` you register a handler the web app can invoke:

```dart
// Dart: expose a native pitch detector to the web app
controller.addJavaScriptHandler(
  handlerName: 'detectPitch',
  callback: (args) async {
    final samples = (args.first as List).cast<num>();
    return NativeAudio.detectPitch(samples); // your native/plugin DSP
  },
);
```

```js
// JS in index.html: call native code and await the result
async function detectPitchNative(samples) {
  if (window.flutter_inappwebview) {
    return await window.flutter_inappwebview.callHandler('detectPitch', samples);
  }
  return detectPitchInJs(samples); // fall back to the existing Web Audio path
}
```

This pattern lets you **keep `index.html` as the UI/source** while offloading
heavy or latency-sensitive audio to native OS APIs — and it degrades gracefully
to the pure-web implementation when running in a normal browser, Electron, or the
PWA.

> Tip: feature-detect `window.flutter_inappwebview` (as above) so the same
> `index.html` works unchanged across the browser, PWA, Electron, and Flutter
> targets.

---

## Recommended path

1. Ship now with the existing wrappers (PWA / TWA / Electron) — least effort.
2. If you specifically need Flutter (e.g., for native DSP or a future native UI),
   start with the **WebView shell** above so `index.html` stays the source.
3. Add native audio only where the Web Audio API falls short, via the JS↔Flutter
   bridge.
4. Optionally, migrate screens to native Flutter widgets incrementally if/when a
   fully native experience becomes the goal.
