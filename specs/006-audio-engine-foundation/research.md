# Phase 0 Research: Audio Engine Foundation

**Feature**: `006-audio-engine-foundation` | **Date**: 2026-08-14 | **Plan**: [plan.md](./plan.md)

## Summary

This file records the technical decisions for the audio engine foundation. The team keeps the in-house player. The team adds one owner registry, one mix graph with a final safety stage, and a pack loader that ships no production samples. The current wavetable voices stay as the fallback.

Decision D1 replaces decision D13 from `specs/002-gp-player-overhaul/research.md`. The old D13 text stays in that file. This file does not rewrite the old decision as if it never existed.

## Decision index

| ID | Topic | Decision |
| --- | --- | --- |
| D1 | Hybrid engine | Replace 002-D13. Use local samples later. Keep the synth as the fallback. Ship no production samples in this feature. |
| D2 | Audio owner | Add `js/audio/audioOwner.js`. One long-running owner at a time. Do not ship the Audio Dock. |
| D3 | Mix graph | Voice to track bus to mix bus to compressor to master to safety. The analyser reads the protected output. |
| D4 | Safety stage | Add one limiter after master gain. Keep the protected peak at or below `-1 dBFS`. |
| D5 | Imported mix | Apply `trackInfo.volume` and `trackInfo.pan` on first load. Keep mute, solo, and later volume changes. |
| D6 | Headroom | Stop scaling note gain from the live voice count. Use same-onset chord size. Keep a voice steal cap. |
| D7 | Pack contract | Define a same-origin manifest schema. Ship no production sample files. |
| D8 | Pack loader | Load only the packs the current score needs. Cancel on score replace. Fall back on any failure. |
| D9 | Cache rules | Precache new modules in the app shell. Store packs in a separate versioned cache. Do not delete pack caches on activate. |
| D10 | Source status | Show `Loading guitar sounds`, `Studio ready`, or `Synth fallback`. Do not switch source mid-note. |
| D11 | Owner consumers | Guitar Pro, keyboard, drums, metronome, and study tones claim the owner. Short previews skip the claim. |
| D12 | Module layout | Put new audio modules under `js/audio/`. Keep `js/audio.js` as the context owner. |

## Prior work

Use prior work as a behavior reference. Do not copy visual style or assets.

### Guitar Pro 7.6

Guitar Pro uses samples, soundbanks, modeled amps, and modeled effects. This confirms that realistic guitar playback needs more than basic oscillators.

Source: [Guitar Pro 7.6 audio engine](https://support.guitar-pro.com/hc/en-us/articles/360001599877-GP7-6-Download-Guitar-Pro-7-6-Tablature-Editor-Software)

### Songsterr

Songsterr separates original audio from synth playback. It keeps speed, loop, solo, mute, and pitch controls close to playback. It caches loaded tracks for offline use.

Sources: [Songsterr player help](https://www.songsterr.com/help) and [Songsterr Plus playback features](https://www.songsterr.com/plus)

Lessons for this feature:

- Label the active source. Do not imply that a generated guitar sound is original audio.
- Keep practice controls independent from the sound source.
- Cache installed packs for later features. This feature only adds the cache rule.

### alphaTab and AlphaSynth

alphaTab loads SoundFont files for the programs in the current score. It shows sound loading progress apart from score loading progress.

Sources: [alphaTab player](https://alphatab.net/docs/tutorial-web/player), [multiple SoundFonts](https://alphatab.net/docs/guides/multiple-soundfonts), and [MIDI event handling](https://alphatab.net/docs/guides/handling-midi-events)

Use the same loading pattern. Do not replace the Musi player with alphaTab.

## Current code facts

| File | Current behavior | Fault |
| --- | --- | --- |
| `js/audio.js` | Analyser, then compressor, then master gain, then destination. Master volume can reach `1.5`. | A master value above `1` can restore clipping after the compressor. The analyser reads before protection. |
| `js/gpMixPlayer.js` | One gain node per track. Volume starts at `1`. No pan node. | Imported volume and pan do not reach the output. |
| `js/gpPlayer/playerState.js` | `trackVolumes` arrays start at `1` on load and on reset. | Source volume is ignored. |
| `js/gpPlayer/instrumentVoices.js` | `headroomGain` divides by `active.length`. | Later notes get quieter while earlier notes hold. |
| `js/audioOwner.js` | Missing. Feature 005 described it. | Two tools can play at the same time. |
| `service-worker.js` | Activate deletes every cache except the current app-shell name. | A later pack cache would be deleted on every shell update. |

`normalizeTrackInfo` in `js/tab/tabModel.js` already stores `volume` in `0..1` and `pan` in `-1..1`. The parser already fills those fields. The player does not apply them.

Feature 005 specified `js/audioOwner.js` and an Audio Dock. That module is not in the code. This feature ships the owner service under `js/audio/audioOwner.js`. It does not ship the dock.

## Decisions

### D1 — Hybrid engine replaces 002-D13

**Decision**: Replace decision D13 from Feature 002. Future high-quality playback uses local same-origin sample packs for guitar, bass, and drums. The current wavetable voices stay as the fallback. This feature ships the contract and the loader only. It ships no production sample files.

**Supersedes**: `specs/002-gp-player-overhaul/research.md` decision D13. The old decision required wavetable voices and forbade samples. That design improved instrument separation. It did not produce realistic instruments. The old text stays in the Feature 002 research file.

**Rationale**: Parameter changes on the current oscillator path cannot reach the requested sound quality. Guitar Pro and Songsterr both use samples or recorded audio for realistic instruments. The constitution still forbids a backend and a third-party runtime URL. Same-origin packs with a synth fallback keep playback offline and immediate.

**Alternatives considered**:

- *Keep 002-D13 and tune wavetables only.* Rejected. The product decision states that this path cannot reach the requested quality.
- *Replace the Musi player with alphaTab and a SoundFont.* Rejected. That path duplicates Musi state, timing, and practice controls. It also adds a large asset and a foreign engine.
- *Load samples from a third-party host.* Rejected. FR-034 forbids that. Offline practice would depend on a foreign origin.
- *Ship production packs in this feature.* Rejected. Feature 006 is the foundation only. Features 007 and 009 add licensed packs.

**Consequences**: Feature 006 adds the manifest, the loader, the mix graph, and the owner. Features 007 and 009 add packs. Feature 008 uses the shared bus for drone and keyboard. The old 002-D13 file stays as history.

### D2 — Audio owner

**Decision**: Add `js/audio/audioOwner.js` with `claimAudio({ id, label, kind, onStop, onPause, canPause })`, `releaseAudio(handle)`, `getAudioOwner()`, `getActiveOwner()`, `subscribe(fn)`, and `stopActive(reason)`. A new long-running claim stops or pauses the prior owner. A short preview of three seconds or less does not claim. This feature does not ship `js/audioDock.js`.

**Rationale**: Feature 005 already defined this contract. The module is not in the code. Two tools can play at the same time today. FR-001 to FR-005 need one owner before later audio features land. The dock belongs to Feature 005, not to this foundation.

**Alternatives considered**:

- *A simpler `claimAudio(ownerId, stopCallback)` only.* Rejected as the public shape. The Feature 005 contract already names pause, kind, and subscribe. This feature implements that richer shape and also exports `getAudioOwner()` as an alias of `getActiveOwner()`.
- *Keep `stopOtherTools` as the only mutex.* Rejected. That helper runs on section change. Two sources can live in one tool.
- *Ship the Audio Dock now.* Rejected. The dock is Feature 005 scope. This feature only ships the registry.

**Consequences**: Guitar Pro play, keyboard, drums, metronome, and study tones call `claimAudio` before they create long-running nodes. `stopOtherTools` stays for section-change clean-up.

### D3 — Mix graph

**Decision**: Use this node order after `ensureAudio()`:

1. A voice connects to its track bus.
2. The track bus applies gain, pan, and a small reserved EQ slot.
3. The track bus sends dry sound to the mix bus.
4. The mix bus feeds the existing compressor.
5. Master gain applies the user volume.
6. A safety stage limits the peak.
7. The destination and the analyser read the protected output.

`getMixDestination()` returns the mix bus input. `getAnalyserDestination()` becomes an alias of `getMixDestination()` so current callers keep working. The analyser no longer sits in front of the compressor.

**Rationale**: The current chain is analyser, then compressor, then master, then destination. A master value above `1` can restore clipping. The Study Lab drone can bypass the chain. One mix input and one safety stage fix both faults for every caller that uses the shared helpers.

**Alternatives considered**:

- *Keep the analyser first.* Rejected. FR-015 requires the analyser to read the protected output.
- *Create a compressor per note.* Rejected. FR-016 forbids that.
- *Add the shared reverb now.* Rejected. The impulse and preset sends belong to Feature 010. This feature may reserve a send gain at zero.

**Consequences**: `js/audio.js` keeps the `AudioContext`. `js/audio/mixBus.js` owns buses, pan, safety, and the analyser tap. Existing tools that call `getAnalyserDestination()` automatically enter the new mix.

### D4 — Safety stage

**Decision**: Add one `DynamicsCompressorNode` after master gain. Set it as a limiter: threshold `-1` dB, high ratio, fast attack. Follow it with a hard clip at linear `10 ** (-1 / 20)` so a dense render cannot exceed `-1 dBFS`. Use one safety stage for the whole app.

**Rationale**: FR-014 and SC-003 require a hard peak limit. A compressor alone can overshoot. A clip after the limiter makes the harness result stable.

**Alternatives considered**:

- *Lower every voice peak and skip a safety stage.* Rejected. Master volume above `1` would still restore clipping.
- *A `WaveShaperNode` only.* Rejected as the only stage. A shaper distorts before the limiter can reduce gain. Use clip only as the last guard.

**Consequences**: `peak-headroom.html` must render through the shared mix and safety stage. The pass limit changes from linear `0.999` to `-1 dBFS`.

### D5 — Imported mix

**Decision**: On first load and on `resetForNewScore()`, set each track volume from `model.trackInfo.volume` and each track pan from `model.trackInfo.pan`. Missing values use volume `1` and pan `0`. Add `setTrackPan` beside `setTrackVolume`. Keep mute, solo, and later user volume changes. Do not persist a user pan override in this feature unless the existing practice record already has a place for it.

**Rationale**: The parser already stores volume and pan. The player ignores them. FR-008 requires the imported mix on first play.

**Alternatives considered**:

- *Keep volume at `1` and add pan only.* Rejected. Both fields are in the score.
- *Add a full mixer redesign.* Rejected. Mute, solo, and volume already exist.

**Consequences**: `playerState.js` and `gpMixPlayer.js` stop pushing `1` when `trackInfo.volume` exists. The mixer UI shows the imported volume on first paint.

### D6 — Headroom

**Decision**: Change `headroomGain` in `js/gpPlayer/instrumentVoices.js`. Do not divide by the live `active.length`. Group notes that share the same onset, then scale from that chord size. Keep `MAX_ACTIVE_VOICES` as a steal cap only.

**Rationale**: FR-017 forbids a later note from falling only because earlier notes still hold. The current rule uses the live voice count, so long sustains make later notes too quiet.

**Alternatives considered**:

- *Leave the voice-count rule and rely on the safety stage.* Rejected. The safety stage prevents clip. It does not restore a note that the voice-count rule already lowered.
- *Wait for Feature 009 sample voices.* Rejected. The fallback must stay comfortable now.

**Consequences**: `playNote` needs the chord size or a shared onset key. The mix player can pass `chordSize` when it schedules a group.

### D7 — Pack contract

**Decision**: Define a JSON manifest schema under `assets/audio/packs/<pack-id>/manifest.json`. Required fields: pack id, pack version, license, attribution, sample rate, instrument name, MIDI program or drum note map, root MIDI note, velocity range, round-robin number, articulation, optional loop points, and gain trim. This feature may add the folder, a README, and a test fixture manifest. It must not add production `wav` or `flac` files.

**Rationale**: Features 007 and 009 need one contract. FR-019 lists the fields. FR-020 forbids production samples in this feature.

**Alternatives considered**:

- *SoundFont2 as the pack format.* Rejected. It needs a decoder and a large file. The constitution prefers plain static files.
- *Commit silent placeholder samples.* Rejected. They add weight and imply a kit that is not ready.

**Consequences**: Tests use a tiny fixture manifest under `tests/gp-player/`. The app-shell precache list does not include `assets/audio/packs/`.

### D8 — Pack loader

**Decision**: Add `js/audio/samplePackRegistry.js` and `js/audio/sampleLoader.js`. The registry maps MIDI programs and drum maps to pack ids. The loader fetches same-origin files, decodes each file one time per `AudioContext`, reports progress, and cancels when a new score replaces the old score. Any miss, decode failure, or storage rejection returns a fallback result. The loader never throws to `window`.

**Rationale**: FR-021 to FR-026 match the alphaTab pattern: load only what the score needs, show progress apart from score load, and keep playback available.

**Alternatives considered**:

- *Decode every pack at app boot.* Rejected. FR-027 forbids a first-render wait.
- *Keep a failed load in memory as a hard error.* Rejected. FR-026 requires fallback with no unhandled error.

**Consequences**: Guitar Pro play can start while a load is in progress. A later start may use a ready pack. This feature has no production pack, so the ready state stays `Synth fallback` unless a test fixture pack is present.

### D9 — Cache rules

**Decision**: Precache every new `js/audio/*.js` file in the app-shell list. Bump `CACHE_VERSION`. Do not add optional pack files to `PRECACHE_URLS`. Store installed packs in `musi-pack-<packId>-<version>`. Change the activate handler so it deletes old app-shell caches only. It must keep caches whose names start with `musi-pack-`.

**Rationale**: The current activate handler deletes every cache except the current app-shell name. A later pack cache would vanish on every shell update. FR-031 and FR-032 require a separate versioned pack store.

**Alternatives considered**:

- *Put packs in the app-shell list.* Rejected. The first visit would wait on large files.
- *Use IndexedDB for pack bytes.* Rejected. Cache Storage already serves same-origin `fetch` and offline playback.

**Consequences**: `tests/gp-player/offline-manifest.mjs` must require the new modules and must reject pack files in `PRECACHE_URLS`. Feature 010 can add install and remove UI on this cache rule.

### D10 — Source status

**Decision**: Add a small `role="status"` label on the Guitar Pro player. Values: `Loading guitar sounds`, `Studio ready`, `Synth fallback`. Do not switch the sounding engine during an active note or an active loop pass. A new playback start may use a newly ready pack.

**Rationale**: Songsterr labels the source. Learners must not think the synth is original studio audio. FR-029 and FR-030 set the switch rule and the labels.

**Alternatives considered**:

- *Show raw oscillator names.* Rejected. The product decision forbids that in the main UI.
- *Hot-swap a pack under a held note.* Rejected. That click is worse than a late upgrade.

**Consequences**: With no production pack, the label stays `Synth fallback` after the first play. A test fixture can exercise `Loading guitar sounds`.

### D11 — Owner consumers

**Decision**: Wire `claimAudio` into Guitar Pro play, `js/keyboard.js`, `js/drums/drumEngine.js` start paths, `js/metronome.js`, and study-lab tone start. Keep the Feature 005 short-preview exception. Do not rewrite the Study Lab drone voice in this feature.

**Rationale**: FR-005 names those tools. Feature 008 removes the duplicate drone. This feature only makes those tools share the owner and the mix input.

**Alternatives considered**:

- *Wire Guitar Pro only.* Rejected. The exit criterion is that two audio tools cannot play at the same time.
- *Rewrite the Study Lab drone now.* Rejected. That rewrite is Feature 008.

**Consequences**: A keyboard start pauses or stops Guitar Pro. A study tone longer than three seconds stops the metronome. The current Study Lab drone still exists, but it must claim the owner and connect through `getMixDestination()`.

### D12 — Module layout

**Decision**: Add `js/audio/` for owner, mix, registry, and loader. Keep `js/audio.js` as the only `AudioContext` factory. Do not add `sampleVoice.js` or `droneVoice.js` in this feature.

**Rationale**: The user list named those later modules. Feature 006 must not start Features 007 to 009. An empty voice module would invite early sample work.

**Alternatives considered**:

- *Put the owner at `js/audioOwner.js` as Feature 005 planned.* Rejected. The product plan groups the new audio modules under `js/audio/`. Feature 005 can import the new path later.
- *Add stub voice modules now.* Rejected. They add files with no behavior.

**Consequences**: Feature 008 adds `droneVoice.js`. Feature 009 adds `sampleVoice.js`.

## Resolved unknowns

| Unknown from Technical Context | Resolution |
| --- | --- |
| How to replace 002-D13 | D1 — new decision, old text stays |
| Where the owner module lives | D2 and D12 — `js/audio/audioOwner.js` |
| How to stop clipping after master gain | D3 and D4 — master then safety, analyser after safety |
| How to apply imported mix | D5 — `trackInfo` on first load |
| How to stop later notes from falling | D6 — same-onset chord size |
| How to add packs without shipping samples | D7 and D8 — contract and loader only |
| How to cache packs without breaking the shell | D9 — separate cache, keep pack caches on activate |
| How to label the source | D10 — three status strings |
| Which tools claim the owner | D11 — GP, keyboard, drums, metronome, study tones |

## Risks

| Risk | Impact | Guard |
| --- | --- | --- |
| Activate deletes pack caches | Later packs vanish | D9 changes the activate filter |
| `getAnalyserDestination` change breaks a caller | A tool bypasses the mix | Keep the helper name. Point it at the mix input. |
| Owner wiring misses one tool | Two sources overlap | Browser page `audio-owner.html` plus Node owner tests |
| Headroom change makes chords too loud | Clip before safety | Safety stage plus updated peak test |
| Loader throws on a missing pack | Unhandled error | Loader returns a fallback result. Harness page `pack-fallback.html` |
