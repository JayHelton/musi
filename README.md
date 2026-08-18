# Musi

Musi is an installable music theory and practice app for musicians who want one
fast place to learn, drill, hear, create, and analyze musical ideas. It combines
interactive education, browser-native audio tools, guitar-focused workflows, and
creative generators in a lightweight progressive web app.

The product goal is simple: make the practice room feel like a modern creative
workbench. Open Musi, pick what you want to sharpen, and move from theory to
sound without switching apps, installing plug-ins, or waiting on a backend.

## What Musi does

Musi is built around five practice modes:

### Quiz

- **Scale quiz** - spell the seven diatonic modes in order with randomized,
  non-repeating roots, scoring, streaks, and hints.
- **Interval quiz** - identify target notes from interval prompts (rooted in the
  shared musical context's key) across easy, medium, and hard difficulties.
- **Sight-reading trainer** - read treble and bass staff notes with instant
  feedback and score tracking.

### Reference

- **Scale reference** - browse 27 scale and mode families, step patterns,
  intervals, semitone maps, key signatures, diatonic chords, and guitar-friendly
  three-notes-per-string layouts.
- **Chord builder** - select notes and octaves, hear the voicing, and analyze the
  chord quality.
- **Circle of fifths** - explore key relationships visually.

### Tools

- **Playable keyboard** - trigger notes from the UI or QWERTY keyboard, choose
  waveforms, control volume, and sustain drones for pitch practice.
- **Advanced metronome** - set BPM and time signatures, tap tempo, design custom
  rhythmic measures, use dotted/triplet/rest values, toggle accents, loop, and
  load practice presets such as shuffle, gallop, and blast beat.

### Train

- **Fretboard trainer** - practice interval recognition across guitar tunings
  including Standard, Drop D, Half Step Down, Drop C, Open G, Open D, and DADGAD.
- **Interval Orbit** - root-centered interval mapping with orbit sizes, find/identify/
  complete/formula drills, preset & custom progression improv loops, and session history.
- **Vocal trainer** - use confidence-gated microphone pitch detection to see the
  note, frequency, and cents offset while matching reference tones. Detection
  rejects background noise and holds a steady note instead of flickering on small
  voice variations. Play a configurable segment of the shared musical context's
  scale in the selected octave - choose the starting degree, number of notes, and
  the interval between notes (scale steps, thirds for triads, fourths, or fifths)
  to drill triads and other segmented scales, one beat per note at the context
  tempo.
- **Pitch runner** - a Guitar Hero / Yousician-style scrolling pitch game in the
  Pitch section. Note bars stream in from the right in strict 4/4 time and you
  sing each one in tune as it crosses the hit line, with pitch on the vertical
  axis (a piano-roll ladder), a live pitch trace, an optional metronome and
  melody guide, and score/combo/accuracy tracking. Melody, key, scale, and tempo
  follow the shared musical context.
- **Ear trainer** - hear notes in the shared musical context's key and scale and
  identify them by ear, with replay and streak tracking.

### Create

- **Backing track builder** - generate and audition key-aware progressions such
  as pop, jazz ii-V-I, blues, rock, minor, and canon-style patterns with editable
  chord lengths and octaves.
- **Riff generator** - create scale-aware guitar riffs, render them as tab, and
  play them back with highlighted notes.
- **Riff composer** - build your own note/rest timeline, set durations, and play
  the phrase back at tempo.
- **Voice recorder** - record vocal ideas, monitor live pitch, play back takes,
  download audio, view detected notes, and estimate the key using pitch-class
  analysis.

## Home and navigation

- **Home** - a routine dashboard. It shows one card for every stored routine, a
  `New Routine` action, an `Import Routine` action, and a collapsed `Browse tools`
  panel. Home shows no hero, no continue card, no quick-start grid, no study
  recommendation, and no category grid.
- **Routines** - routine content behaves as a stack of layers: the routines list,
  the routine overview, the session detail, the workbook detail, and then an
  exercise or a study companion. One Back press moves up exactly one layer.
- **Workbook companion tools** - a workbook pins reference and drill tools next to
  its exercises: scale, triad, sweep, pitch trainer, ear trainer, interval orbit,
  and metronome. The workbook stores each tool's settings. The metronome stores a
  BPM progression, so the player presses Start instead of building a tempo plan
  again in each session.
- **Workbook notes** - a workbook keeps free text that describes it. Open the
  workbook and press `Notes`, or use `Add notes` in the row menu of the library.
  The first line of the notes shows under the workbook name in the library, and
  the library search finds a workbook by its notes.
- **Library** - Exercises and Workbooks stay separate, but both use the same
  file browser. It works like Google Drive: a folder tree on the left, a
  breadcrumb on top, one folder level at a time, folders above items, sortable
  columns, a list view and a grid view, a row menu, and drag-and-drop to move
  rows into a folder. Unfiled items sit at the root of the library.
- **Settings** - default musical context, audio volume, device sync, cloud
  account, and library cleanup. Every tool is always available; Settings holds no
  feature list and no genre control.
- **Study Lab** - opens a default study. It uses no genre profile.

## Why it is useful

Musi bridges the gap between a theory worksheet and a creative instrument:

- **For students:** focused drills reinforce scales, intervals, notation, ear
  training, and fretboard fluency.
- **For singers:** live pitch feedback turns the browser into a reference tuner,
  recorder, and intonation coach.
- **For guitarists:** alternate tunings, tab rendering, 3-NPS references, and
  fretboard prompts keep theory connected to the instrument.
- **For songwriters:** backing progressions, riff generation, a composer, and a
  recorder make it easy to capture and iterate on musical ideas.
- **For teachers:** the app offers quick, visual exercises that can be opened on
  any modern browser or installed as a standalone PWA.

## Technical highlights

- **Progressive web app:** `manifest.webmanifest` and `service-worker.js` make
  Musi installable and offline-capable with an app-shell cache.
- **Static-first architecture:** the web app is plain HTML, CSS, and ES modules;
  no server, build step, or client framework is required.
- **Browser-native audio:** Web Audio powers synthesis, metronome scheduling,
  keyboard drones, riff playback, backing chords, analyzers, and dynamic
  compression.
- **Microphone workflows:** MediaRecorder and analyser nodes support vocal pitch
  tracking, recording, playback analysis, and downloadable takes.
- **Shared theory engine:** reusable modules handle note parsing, enharmonic
  spelling, scale definitions, intervals, tunings, and frequency-to-note mapping.
- **Persistent preferences:** local storage remembers user selections and tool
  settings. Musi needs no account. An optional cloud account can keep the same
  library on more than one device.
- **Responsive interface:** grouped desktop/mobile navigation keeps the full
  feature set accessible across device sizes.
- **CLI companion:** the `cli/` package exposes terminal versions of core quiz
  and training activities using the same theory data as the web app.

## Project layout

```text
.
+-- index.html              # App shell and feature sections
+-- css/                    # Modular styles by feature area
+-- js/                     # ES modules for theory, tools, trainers, and audio
+-- js/library/             # Shared file-browser for Exercises and Workbooks
+-- js/cloud/               # Optional Supabase account and library sync
+-- js/vendor/              # Vendored Supabase client (offline install)
+-- icons/                  # PWA icons
+-- manifest.webmanifest    # Install metadata
+-- service-worker.js       # Offline app-shell cache
+-- supabase/               # Optional cloud sync schema, policies, and function
+-- cli/                    # Node CLI companion
```

## Run locally

Because Musi uses ES modules and a service worker, run it from a local static
server instead of opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For the CLI:

```bash
cd cli
node bin/musi.js
```

## Optional cloud sync

Musi works fully offline and needs no account. If you want the same library on
a phone, a tablet, and a desktop, you can turn on an optional cloud account.
The account covers notes, songs, exercises, workbooks, routines, score
annotations, drum patterns, practice progress, and shared settings.
The QR and ZIP device sync stays available for people who prefer no account.

Musi never syncs on its own. You start every pass from the Cloud account panel
in Settings, and you pick one of three whole-library operations:

- **Merge** - Musi adds to each side what the other side holds. It deletes
  nothing. A record that both sides hold keeps the copy with the newer time.
- **Get the cloud copy** - Musi clears this device, then writes the cloud
  library onto it.
- **Send this device** - Musi clears the cloud, then writes this library into
  it.

Each pass ends with the device and the cloud the same. A file above the upload
limit of the storage bucket is the one exception: it stays on the device, and
Musi reports it.

The upstream build ships with cloud sync **off**. A checkout makes no request to
Supabase, shows no account panel, and loads no cloud code.

**The Cloud account panel stays hidden until you supply these values.** That is
the off switch. If you do not see the panel in Settings, Musi found no
configuration.

To turn it on for your own copy:

1. Create a Supabase project. Apply the schema in `supabase/`. See
   `supabase/README.md` for the local loop and the deploy path.
2. Copy your project URL and your **publishable (anon)** key from the Supabase
   Dashboard, under Project Settings → API.
3. Give the values to Musi in one of two ways:

**On your own machine**, copy the example file and edit it:

```bash
cp cloud-config.example.json cloud-config.json
```

Git ignores `cloud-config.json`, so your file stays out of the repository.

**On a deployed site** (GitHub Pages, Netlify, S3), that ignored file never
reaches the server. Put the same two values in the `DEFAULTS` object in
`js/cloud/cloudConfig.js` and commit them. The publishable key is made for the
browser, and Row Level Security is the real boundary. Never commit the
service-role key.

4. Serve the app over HTTP. Opening `index.html` directly stops the config fetch
   and the panel stays hidden.
5. Set up Google sign-in (see below). Then open **Settings → Cloud account** and
   click **Continue with Google**. Musi also keeps an email code path in a
   collapsed section for fallback.
6. After you change any JavaScript or CSS, do a hard reload. The service worker
   can hold the old files.

### Google sign-in setup

1. In the Google Cloud console, create an OAuth client of type **Web
   application**. Add the Supabase callback URL as an authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. For the project in
   `js/cloud/cloudConfig.js` that address is
   `https://gtokzekwpsdmvfdjsuag.supabase.co/auth/v1/callback`.
2. In the Supabase Dashboard, open Authentication → Sign In / Providers →
   Google. Turn it on and paste the client ID and the client secret.
3. In the Supabase Dashboard, open Authentication → URL Configuration. Set
   **Site URL** to the address where Musi runs, for example
   `https://jayhelton.github.io/musi/`. Add the same address under **Redirect
   URLs**, plus `http://localhost:8080/` for local work.
4. Step 3 matters because Supabase sends the user to the default address when
   the return address is not on the allow list. The default address is
   `http://localhost:3000`, which is wrong for Musi.

The sign-up allow list still applies to Google sign-in. The database trigger
runs when Supabase creates the user row. Add your email to
`public.signup_allowlist` before the first sign-in (see `supabase/README.md`).

The first device to sign in with an empty cloud uploads its library and becomes
the source of truth. After that the cloud copy is authoritative, and each other
device pulls it on demand. Row Level Security keeps every row private to its
owner. The publishable key is safe in the browser; never put the service-role
key in the app.

## Deploy

Musi can be deployed anywhere that serves static files, including GitHub Pages,
Netlify, Vercel static output, S3, or a basic web server. The service worker is
written with relative paths so the app can run from a domain root or a sub-path.
Supabase never hosts or builds the app.

## Purpose

Musi is designed to make music theory practical, audible, and creative. It gives
learners the repetition they need, gives players immediate sound and visual
feedback, and gives creators a compact sketchpad for ideas - all from a fast,
installable web app.

## Spec-Driven Development

Musi uses [GitHub Spec Kit](https://github.com/github/spec-kit) and
[MiniSpec](https://github.com/ivo-toby/mini-spec) for spec-driven development.
Feature artifacts live under `specs/`. Spec Kit uses Cursor skills in
`.cursor/skills/`. MiniSpec uses `/minispec.*` slash commands in
`.cursor/commands/`. Use one toolkit per feature folder.

See [docs/spec-kit.md](docs/spec-kit.md) and [docs/mini-spec.md](docs/mini-spec.md)
for prerequisites, install steps, and each workflow.
