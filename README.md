# Musi

Musi is a browser-native music practice suite for players, singers, writers, and theory learners who want one focused place to learn, train, and create. It combines music theory references, interactive quizzes, real-time audio tools, practice curricula, and composition helpers into a fast static web app with no account, backend, or install step required.

Designed as both a learning companion and a creative scratchpad, Musi turns the browser into a compact studio for daily practice: drill scales, sharpen interval recognition, map the fretboard, tune vocals, build rhythm exercises, generate backing progressions, and sketch riffs with instant audio feedback.

## Why Musi

- **All-in-one practice flow:** Move from learning concepts to drilling skills to creating musical ideas without changing apps.
- **Immediate feedback:** Scoreboards, streaks, pitch/cents readouts, note recognition, highlighted playback, and visual state changes keep practice measurable.
- **Real audio interaction:** Web Audio powers generated tones, metronome clicks, drones, chords, backing tracks, riffs, and the live audio visualizer.
- **Instrument and voice friendly:** Built for guitar, piano, singers, harsh vocalists, ear training, theory study, and songwriting sessions.
- **Lightweight by design:** A static HTML/CSS/JavaScript app built from ES modules, so it is simple to run, host, inspect, and extend.

## Feature Highlights

### Quiz

- **Scale quiz:** Practice spelling scales by root and scale type, including major modes, harmonic and melodic minor, pentatonic, blues, diminished, bebop, altered, and more.
- **Interval quiz:** Drill note-to-note interval recognition with selectable difficulty and root settings.
- **Sight reading trainer:** Identify notes on staff notation with clef and difficulty controls, score tracking, and streak feedback.

### Reference

- **Scale reference:** Browse scale formulas and note spellings across keys.
- **Chord builder:** Select notes and octaves, play the chord, and analyze the resulting sonority.
- **Circle of fifths:** Explore key relationships visually and interactively.

### Tools

- **Playable keyboard:** Trigger browser-synthesized tones from the on-screen piano or QWERTY keyboard, choose wave shapes, and use drones for practice.
- **Advanced metronome:** Set BPM, tap tempo, time signature, accents, count-in, looping, and custom measures with whole, half, quarter, eighth, sixteenth, dotted, triplet, and rest values.
- **Audio visualizer and now-playing bar:** See active sound output and stop generated audio from a global control.

### Train

- **Fretboard trainer:** Practice interval locations on a guitar fretboard with multiple keys and tunings, including Standard, Drop D, Half Step Down, Drop C, Open G, Open D, and DADGAD.
- **Vocal tuner:** Use the microphone to detect pitch, note name, frequency, and cents of accuracy, then match reference tones.
- **Ear trainer:** Hear a generated note and identify it inside a selected key and mode.

### Create

- **Backing tracks:** Generate and play diatonic chord progressions in major or minor keys, including pop, jazz, blues, rock, sad, and canon-style presets.
- **Riff generator:** Create guitar-tab-style melodic riffs by key, scale, tuning, length, density, and BPM.
- **Riff composer:** Build custom note/rest sequences with note, octave, duration, tempo, and playback controls.

### Learn

- **Guided curricula:** Follow structured practice plans for guitar, piano, harsh vocals, and contemporary singing.
- **Practice session timer:** Run timed blocks, track current exercise focus, and jump directly into related tools such as scale and interval quizzes.
- **Technique notes and progressions:** Review posture, hand position, vocal safety, weekly schedules, voice zones, and skill milestones.

## Technical Overview

Musi is intentionally simple to ship and hack on:

- **Frontend:** Static `index.html`, modular JavaScript in `js/`, and component-oriented CSS in `css/`.
- **Runtime:** Modern browser APIs only - primarily Web Audio API, Canvas, DOM modules, and microphone access through `navigator.mediaDevices`.
- **Audio architecture:** Shared audio context, master gain, compressor, analyser routing, generated oscillators, scheduler loops, and module-level stop controls.
- **Music theory engine:** Reusable helpers for note parsing, enharmonic spelling, MIDI frequency conversion, scale construction, interval labels, and guitar tunings.
- **Navigation:** Responsive dock-style sections with hash-based deep links for direct access to tools.
- **Deployment:** No build step and no server-side dependency. Host it as static files.

## Running Locally

Because the app uses ES modules and microphone APIs, serve it over localhost instead of opening the file directly:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Microphone-powered features such as the vocal tuner require browser permission and work best on localhost or HTTPS.

## Project Structure

```text
index.html       App shell and feature sections
css/             Visual system, layouts, quiz/tool/training styles
js/audio.js      Shared Web Audio setup
js/theory.js     Note parsing, pitch math, intervals, tunings
js/scales.js     Scale definitions and note generation
js/main.js       Navigation and module initialization
js/*.js          Individual quiz, reference, tool, training, creation, and curriculum modules
```

## Purpose

Musi exists to make music practice feel less fragmented. Instead of juggling a tuner, metronome, theory chart, quiz app, fretboard diagram, backing track player, and notes app, Musi brings those workflows into one responsive web experience. It is educational enough for structured study, technical enough for serious practice, and lightweight enough to open whenever inspiration hits.
