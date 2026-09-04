# Musi

Musi is a practice workbench for musicians. It is an installable progressive web
app with no backend and no build step. Open it, pick an activity, and move from
theory to sound in one place.

The product has four areas and one set of supporting utilities:

```text
Musi
├── Train
├── Study
├── Create
├── Library
│   ├── Exercises
│   └── Workbooks
└── Utilities
    ├── Metronome
    ├── Keyboard
    ├── Score Player
    └── Settings
```

Train, Study, and Create are the three musical activities. Library holds the
material you own. Utilities support the other areas; they are not a fourth
purpose, so they sit behind one compact menu.

## Train

Drills that build your ear, your reading, and your hands.

- **Intervals** — name the note an interval above the root. The root comes from
  the shared musical context.
- **Sight Reading** — read pitches on the treble and bass staff, with a score
  and a streak.
- **Chord Workout** — practice chord shapes on the neck with guided prompts.
- **Pitch & Ear** — one microphone lab with five modes:
  - *Tuner* — note, frequency, and cents offset, with noise rejection.
  - *Reference tone* — sound any note, and play a segment of the context scale.
  - *Pitch match* — sing and hold a target note, with live feedback.
  - *Pitch runner* — a scrolling pitch game in 4/4 at the context tempo. An
    audio delay setting sends the click and the melody guide out early, so a
    Bluetooth headset hears each note as its bar crosses the line. Preview each
    pass plays the phrase to you first, and then you sing the same phrase back
    for the score. A hollow bar is the preview, and a solid bar is your turn.
    Start octave sets the octave the run starts in. The control names the start
    note of every octave that fits your vocal range, so you move a melody or a
    harmony drill down when it sits too high for your voice. Auto lets Musi
    place the run, and the choice holds for the next run.
    The Melody control also holds a *Harmony* drill: Musi holds the context root
    as a drone for the whole run, and you sing the intervals you picked against
    it. You choose the intervals from m2 to P8, and you choose whether they sit
    above the root, below it, or on both sides. A drone volume control sets how
    loud the root holds. A dashed line on the stage marks the root, and each bar
    prints its interval. Wear headphones: the microphone hears a drone that
    plays out loud, and the runner then drops every detected pitch that sits on
    the root. An interval that does not fit your vocal range is dropped, and the
    card names it.
  - *Ear training* — identify a pitch, a degree, or an interval by ear.
- **Practice Lab** — one screen for one practice session, in five tabs:
  - *Session* — pick an instrument, a technique, and a target, then run timers,
    click patterns, ratio drills, a tempo ladder, and camera takes. Every action
    goes in the session log. A drum session opens with a warm-up: the tool picks
    one groove and one rudiment for you, and it never picks what the last three
    sessions used. The pick rides on the session record, so the History tab
    shows what each session warmed up with.
  - *Vocal* — clean and harsh vocal practice. Clean has Chest, Mix, and Head,
    and it runs on the same Pitch Runner the rest of the app uses, with the same
    Start octave control and the same score text: a run from a Guitar Pro file
    names the vowel or the exercise for the pitch that comes. Harsh has
    Low, Mid, and High, and it runs on the Cue Runner: timed instructions,
    timed rest, register changes, phrases, and manual checkpoints. Musi never
    scores a harsh vocal; you report each repetition as Immediate, Searched,
    or Missed, or as Clean, Unstable, or Stopped, and the tab shows the counts
    of the last ten reps. Clean and Harsh each read a Practice Library folder
    you choose. The tab saves the folder id, so a rename does not break it, and
    it reads every folder inside it. A folder that is gone asks for a new one
    and never falls back to the whole library. An empty folder offers the
    starter exercises, which Musi writes into that folder as normal library
    exercises. Effort is optional: Easy, Working, or Strained. Musi records
    Strained and never rewards it.
  - *Drums* — the drum library. Beats holds grooves from ten genres — rock,
    punk, metal, jazz, blues, funk, latin, reggae, country, and hip-hop. Each
    one runs three bars of the groove and one bar of a fill that belongs to the
    genre, and no entry is longer than eight bars. Rudiments holds the flams,
    the paradiddles, the rolls, and the drags, each with a full R and L
    sticking under the staff and a left-hand-lead bar. Every entry opens in the
    Guitar Pro player, so you can loop it, slow it down, and hear it.
  - *Composition* — Composition Lab. It trains the loop a writer needs: hear a
    degree, name it, find it on the neck, write under a constraint, change the
    idea on purpose, and explain the decision. A context row names the
    instrument, the tuning, the tonal center, and the collection, and every
    exercise builds from it, so the work runs in any key and any tuning. Quick
    Practice gives one exercise, a Guided Session walks Recall, Hear, Map,
    Write, Transform, and Explain in order, and nine focus areas give a shorter
    run. The rhythm grid keeps attacks apart from pitches: design the bar first,
    then assign the degrees. Motif Lab holds one original and five descendants
    and names what stays and what changes in each. Section Lab, four guided
    labs, the song study, and the capstone rubric carry the longer work.
    Intervals, Scales, and Chords stay one tap away in a drawer, and opening one
    never disturbs the exercise underneath.
  - *History* — every past session with its log and its clips.

## Study

Look up scales, chords, triads, and key relationships.

- **Interval Reference** — what each degree above the tonic does to a listener
  and what a writer uses it for. Pick a degree to see its distance in semitones,
  its note above the current tonal center, where it sits on the neck, the scales
  that hold it, and two short compositional examples. Composition Lab opens the
  same component in its reference drawer.
- **Scale Reference** — scale and mode families, step patterns, key signatures,
  diatonic chords, and three-notes-per-string neck layouts.
- **Chord Reference** — voicings on the neck, the chord quality of every degree
  of a key, movable chord cards, and CAGED.
- **Triads** — closed triad voicings and sweep-picking shapes on any string set.
- **Circle of Fifths** — key relationships, drawn.
- **Drum Notation** — where each piece of the kit sits on the staff, what each
  note value lasts, and bars you can read and play. Sticking letters under the
  staff name the hand: R for the right hand and L for the left hand. It also
  covers text drum tab, the format most tabs on the web use.

## Create

Record, write, and keep notes.

- **Audio Studio** — three modes over one recording:
  - *Record* — capture a take with the microphone, then play it back, save it to
    the Library, or download it.
  - *Analyze* — detected key, detected pitches, and a note list for the take.
  - *Import & transcribe* — turn a sung or hummed riff into guitar tab, or drop
    an isolated audio stem and read it onto basic sheet music.
- **Song Studio** — write lyrics and attach a recording to each song.
- **Notes** — plain practice notes and ideas.

## Library

The material you own. Exercises and Workbooks keep separate schemas and separate
storage; the Library page is the door to both.

- **Exercises** — one **Add exercise** chooser names every kind the library
  holds: a link, a document, an audio or video recording, a Guitar Pro file, a
  pitch run, a cue exercise, and a written exercise you type. A new exercise
  joins the folder you have open. Organize them in folders with a file-browser
  view. The player has Previous and Next buttons, so you step through a folder
  without a return to the list.
  - A **pitch run** is a saved run of the vocal Pitch runner game. You type the
    notes and the hold lengths, or you read them from a Guitar Pro file. The run
    keeps its own tempo, note length, rest, count-in, repeat count, and preview
    mode. The player holds a Start octave control that moves the whole run into
    another octave, so you sing the written intervals where your voice reaches
    them. The run keeps the pitches you saved, and the note list names the
    pitches the run plays now. A note length of 0 holds each note as long as it is written. The
    player keeps the note list closed below the game, so a long run does not
    push the game off the screen. A run that came from a Guitar Pro file also
    keeps the text of the score. A vocal warm-up writes the vowel or the
    exercise over the note — "mee", "lip trill", "hum" — and the run prints that
    text on the bar and above the stage. A section marker names the first note
    of its section when that bar carries no text of its own. The section notes
    you save on the same score in the Guitar Pro player fill the notes that are
    still bare. The text holds until the score writes a new one, so a bare note
    keeps the instruction before it. A pitch run can carry clean vocal tags, and
    then the Vocal tab of Practice Lab plays it.
  - A **cue exercise** is a timed instruction list for harsh vocals. You write
    one step per line: perform, rest, transition, phrase, or checkpoint, with
    the seconds and the text. The exercise carries its repetition count, its
    registers, and its focus. The Cue Runner of Practice Lab plays it, and it
    judges nothing.
  - A **written exercise** holds the text you type and any number of files.
  - **Import course** takes a whole course folder at once. Pick the top folder
    and Musi mirrors the folder tree into Exercises. Every supported file
    becomes an exercise in the folder that holds it. Musi mirrors the same tree
    into Workbooks, and each folder that holds files becomes one workbook with
    those exercises, in course order. The dialog shows the tree before the
    import, so you can rename the course, choose where it goes, turn a folder
    off, or leave the workbooks out. Guitar Pro scores stay whole; use **Bulk
    upload** to split a score into sections.
- **Workbooks** — order exercises into a focused practice collection, with
  looping, auto-advance, notes, and companion widgets.

The path is Library → Workbooks → workbook overview → exercise player. Back
walks the same path in reverse.

## Utilities

Supporting tools. They open from the compact Tools button on the navigation bar,
and Settings also opens from the gear beside any page heading.

- **Metronome** — two modes: *Click* for tempo, meter, tap tempo, and a session
  timer; *Tempo plan* for timed phases, each with its own BPM and subdivision.
- **Keyboard** — play notes from the screen or the QWERTY keys, and hold drones.
- **Score Player** — open a `.gp` or `.gp5` score, mix tracks, mark a loop range,
  and save that range as an exercise.
- **Settings** — the shared musical context, volume, sounds, device and cloud
  sync, import and export, and library cleanup.

## Sounds

The Sounds block in Settings holds one voice for each surface. Each surface has
its own job, so it keeps its own setting:

- **Score player — pitched tracks** — the instrument the guitar, bass, and key
  tracks of a score play.
- **Score player — percussion tracks** — the kit the drum tracks play.
- **Pitch training** — the tone the tuner, the pitch trainer, the pitch runner,
  and the ear trainer sound. The default is the built-in trainer tone, which
  holds one steady pitch.
- **Metronome** — the click.

You can add your own instrument packs on this device. Musi reads three formats,
and all three are one archive that holds the audio files:

- a ZIP with a `manifest.json`, the Musi pack format
- a `.multisample` file, the format Bitwig Studio and other programs write
- a ZIP with an `.sfz` file and the audio files it names

Musi reads the key layout of the file and marks the pack as an instrument or as
a drum kit. You can also state the kind yourself before you add the file. An
instrument shows in the pitched score list and in the pitch training list. A kit
shows in the percussion list only.

The audio stays on this device in the browser file store. It does not sync and
it does not reach the network. See `assets/audio/packs/README.md` for the pack
format and the import rules.

## Shared musical context

One musical context is shared across the app:

```js
{
  root: 'E',
  scale: 'harmonic-minor',
  tempo: 140,
  tuning: 'E Standard'
}
```

Every tool declares which fields it reads, in `js/tools.js`:

```js
{ id: 'scaleref', area: 'study', context: ['root', 'scale', 'tuning'] }
{ id: 'metronome', area: 'utility', utility: true, context: ['tempo'] }
```

No tool depends on the whole context implicitly. When a tool reads at least one
field, the quick context button appears beside the page heading; a click opens a
panel that writes the shared values. Set E harmonic minor at 140 BPM in E
standard, and Scale Reference, Triads, and Pitch & Ear open in that key while the
Metronome opens at that tempo. A tool may still hold local state when its feature
needs it.

## Data and sync

Musi stores everything on the device: `localStorage` for records and IndexedDB
for audio, video, and score files. There is no backend in the default build.

Two ways to move a library between devices:

- **Device sync** — export a ZIP bundle, or hand data across with QR frames. No
  account is involved.
- **Cloud account** — optional Supabase sync, off in the upstream build. See
  *Optional cloud sync* below.

## Project layout

```text
.
+-- index.html              # App shell: one section per area and per tool
+-- css/                    # Modular styles by feature area
+-- js/tools.js             # The tool registry: areas, utilities, and context
+-- js/routeMap.js          # Route ids: the four areas plus every tool
+-- js/areaPages.js         # Train / Study / Create / Library landing pages
+-- js/reference/           # Shared Interval, Scale, and Chord references
+-- js/shell/               # Navigation, the shared tool page, the nav stack
+-- js/library/             # Shared file-browser for Exercises and Workbooks
+-- js/cloud/               # Optional Supabase account and library sync
+-- js/vendor/              # Vendored Supabase client (offline install)
+-- icons/                  # PWA icons
+-- manifest.webmanifest    # Install metadata
+-- service-worker.js       # Offline app-shell cache
+-- supabase/               # Optional cloud sync schema, policies, and function
+-- cli/                    # Node CLI companion
+-- tests/                  # Zero-dependency Node test runners
```

A tool id is one string across the whole app: it is the registry id, the route
id (`#pitchear`), and the DOM section id (`sec-pitchear`). There is no alias
table and no legacy route map.

## Tests

Every suite is a zero-dependency Node runner:

```bash
node tests/product-model/run.mjs   # areas, tools, navigation, no dead references
node tests/routes/run.mjs          # route resolution and tool modes
node tests/shell/run.mjs           # nav stack, shared context, tool page
node tests/workbooks/run.mjs       # workbook model and playthrough
node tests/exercises/run.mjs       # exercise library
node tests/chord-match/run.mjs     # multi-answer chord identification
node tests/practice-lab/run.mjs    # session timing, the vocal model, the cue run
node tests/vocal/run.mjs           # the cue model, the vocal tags, the starter set
node tests/composition-lab/run.mjs # Composition Lab and the shared references
```

`tests/appcheck/run.mjs` boots the app in headless Chrome and fails on any
console error. It needs a static server on port 8080 and `google-chrome` on the
path.

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
The account covers notes, songs, exercises, workbooks, score annotations,
drum patterns, practice progress, and shared settings.
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
