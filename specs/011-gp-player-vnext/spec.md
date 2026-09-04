# Feature Specification: Musi GP Player vNext

**Feature Branch**: `011-gp-player-vnext`

**Created**: 2026-09-04

**Status**: Implemented (Phases 1–8 P0 scope). See the Implementation Status section at the end.

**Priority**: P0 product initiative

**Input**: Songsterr-level tab playback and practice experience for the Guitar Pro
player.

**Scope**: Guitar Pro score player, score canvas, transport, looping, tracks/mixer,
playback interaction, responsive behavior, visual quality, accessibility, persistence,
and player integration with Musi practice features.

**Relationship to earlier work**: `specs/002-gp-player-overhaul` fixed playback
correctness and the first control layout. This spec builds on that work. It does not
replace the parser, timeline, playback engine, or score geometry engine.

---

## 1. Product Goal

Rebuild the Musi Guitar Pro player into a polished, score-first practice environment.
The target is parity with Songsterr in usability, visual clarity, interaction quality,
and immediacy.

The player must stop feeling like:

> a Musi utility containing a rendered Guitar Pro file

and instead feel like:

> a dedicated music workstation where the score is the primary interface.

When a user opens a Guitar Pro exercise, the app moves the user into a focused practice
environment. There is almost no UI friction between reading the score and practicing it.

The primary interaction loop is:

> See → seek → play → hear → isolate → loop → slow down → repeat.

Every major product decision in this specification must optimize that loop.

---

## 2. Benchmark

Songsterr is a useful baseline because its current player shows the major practice
functions directly around the score:

- track selection
- Tab / Sheet views
- Original / Synth source
- playback speed
- pitch shift
- looping
- solo
- mute
- count-in
- metronome

Those controls are visible as direct player concepts. They are not hidden in application
configuration.

Songsterr also uses a mature keyboard interaction model. Current shortcuts include Space
for play/pause, double-click on a beat to play from it, arrow-key navigation, "T" for
tracks, "S" for speed, "L" for looping, "M" for mute, "Alt+M" for solo, "C" for count-in,
and "N" for metronome.

Its stated player behavior includes synchronized automatic scrolling and an indication of
exactly which note is currently playing.

Musi must reach parity with that interaction quality. Musi keeps its own identity and adds
much stronger deliberate-practice workflows.

This is not a requirement to duplicate Songsterr's visual identity, exact colors, icons,
trade dress, or component positioning.

The target is parity of:

- information hierarchy
- responsiveness
- interaction confidence
- score readability
- practice efficiency
- playback feedback
- visual refinement

---

## 3. Current Musi Technical Baseline

The current player is much more capable internally than its UX communicates.

Musi already has dedicated modules for:

- authoritative player state
- score geometry/layout
- parchment rendering
- playback-follow scrolling
- measure navigation
- range selection
- loop state
- transport controls
- practice controls
- metronome
- count-in
- tempo ramps
- track mixing
- solo/mute
- volume/pan
- backing tracks
- annotations
- player settings
- keyboard shortcut help

Keep these modules. Reorganize them. Do not replace them.

`js/gpPlayer/playerState.js` already holds the important underlying state: BPM, score
BPM, track enablement, volume, pan, solo, metronome, count-in, tempo ramp, transpose,
tuning, loop measure/beat boundaries, follow mode, and score zoom.

`js/gpPlayer/scoreLayout.js` is already a standalone geometry engine. It renders tab,
rhythm, and notation lanes. It renders techniques: bends, slides, hammer-ons, pull-offs,
vibrato, palm muting, harmonics, tapping, slapping, popping, trills, and tremolo.

`js/gpPlayer/parchmentView.js` already supports playback position, selection, measure
clicks, long press, note selection, loop selection, annotations, zoom, and automatic
follow behavior.

### Architectural decision

Do not replace the Guitar Pro parser, timeline, playback engine, or score geometry
engine as part of this project. The one exception is a documented blocker.

Instead:

1. Rebuild the player shell.
2. Redesign the score renderer presentation.
3. Consolidate player interactions.
4. Restructure transport and track controls.
5. Strengthen synchronization and follow behavior.
6. Improve visual fidelity.
7. Add production-grade state, error, and loading behavior.

---

## 4. Primary UX Problems to Fix

### GP-UX-001 — Score does not dominate the experience

The active player is currently nested inside application-style containers, width limits,
bordered stages, and rounded chrome.

The current CSS places the GP layout under the application content maximum
(`--content-max`, 1100px by default in `css/base.css`, applied in `css/gpplayer.css`).
It creates nested rounded dark containers around the player.

This gives too much visual importance to Musi's application shell and too little to the
music.

**Requirement**

When a score is open, the player becomes a dedicated workspace.

The score must visually account for approximately:

- 80–90% of attention
- 70–85% of usable vertical area
- all remaining horizontal area after optional drawers

The player must escape normal content-card width restrictions.

---

## 5. Core Layout

### 5.1 Desktop

Target layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Library   The Migrant                         Lead Guitar ▾   View  Mix  ··· │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                             SCORE CANVAS                                     │
│                                                                              │
│       bar 31      bar 32       bar 33       bar 34                           │
│                                                                              │
│                       │ PLAYHEAD                                              │
│                                                                              │
│                                                                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ↶      ◀ bar       ▶       bar ▶      01:42 / 04:13                         │
│                    85%     LOOP 31–34     METRO     MIX                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Header**

Target height: 48–56px.

Contains:

- Back
- score title
- optional artist/subtitle if available
- current track selector
- notation view control
- mixer
- overflow/settings

Nothing else has a permanent place there.

**Score**

Flexible remaining viewport height. No separate outer card. No large margins.

**Transport**

Target desktop height: 64–72px.

Fixed or sticky to the bottom of the player workspace. The score scrolls behind and above
it. The transport does not cover the score.

---

## 6. Eliminate Nested Player Chrome

The current player uses:

- a dark rounded stage
- a dark rounded player chrome
- a parchment rounded inside that
- toolbar borders
- many individual boxed controls
- a separate measure navigation strip
- several layered shadows

The GP player's current CSS uses the broader Atomic Purple/GBC visual language. That
includes retro UI fonts and parchment styling.

That visual style can remain elsewhere in Musi. It must not dominate the score player.

### GP-VIS-001

The loaded score experience gets its own restrained professional visual system.

**Remove from the active player**

- heavy outer border
- 18px screen/card radius around the score
- pronounced card shadows
- translucent dark nested panels
- pixel-font-heavy control labels
- decorative game-console visual treatment
- permanently visible measure-button strip
- beige "old paper" visual emphasis
- tinted score lanes

**Keep**

- Musi's accent color
- Musi icon language
- broader application navigation
- recognizable Musi identity outside the music surface

The player must feel like a professional instrument tool inside Musi. It must not feel
like a separate branded clone.

---

## 7. Score Surface Visual System

### GP-CANVAS-001

Default score surface:

```
background: #fffefb / equivalent neutral paper white
ink:        near-black
muted ink:  neutral gray
```

Avoid visibly yellow or brown parchment.

The current renderer uses approximately `#f7efd8` with brown/purple score accents and
separate shaded notation/technique/rhythm lanes.

Replace this with a cleaner conventional notation surface.

### GP-CANVAS-002

No rounded corners between:

- systems
- measures
- tab
- notation staff
- rhythm lanes

These are one musical document.

### GP-CANVAS-003

Remove lane background shading.

The distinction between standard notation, techniques, tab, and rhythm must come from
spacing and typography. It must not come from several tinted horizontal bands.

---

## 8. Typography

This is one of the highest-priority visual changes.

### GP-VIS-010

Do not use "VT323", "Pixelify Sans", or equivalent pixel-display fonts inside the score
or player interface.

The broader app can keep them.

**UI**

Use a clean system/native sans-serif stack. Example:

```css
font-family:
  Inter,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Do not add a dependency on Inter unless needed. Native fonts are acceptable.

**Tab**

Use a highly legible numeric treatment. Fret numbers must:

- distinguish 1 / 7
- distinguish 0 / 8
- keep clean spacing
- stay legible at phone distance
- render sharply at high DPI

**Music notation**

Where symbols exist, use proper music notation glyphs or precise SVG paths.

Do not imitate music symbols with arbitrary text characters when a proper renderer path
already exists.

---

## 9. Score Geometry

Keep the existing layout engine. Give the visual geometry a refinement pass.

**Desktop targets**

- 3–6 measures per system under normal density
- dense passages may use fewer
- sparse measures may use more
- system spacing: enough vertical separation to read techniques without collision
- bar numbers aligned consistently
- section names above the system
- first-system tuning/tempo information properly aligned

The existing code supports up to eight measures per system
(`MAX_MEASURES_PER_SYSTEM` in `scoreLayout.js`). It already changes packing based on
width and rhythmic density. That is a good basis. Tune it. Do not discard it.

**Mobile**

The existing one-measure-per-line behavior at narrow viewport sizes is sensible. Keep it
as the baseline.

Allow two measures only where both stay genuinely readable.

Do not optimize for "fitting more". Optimize for sight-reading while the user holds an
instrument.

---

## 10. Playhead

The playhead is one of the most important visual elements in the product.

### GP-PLAYHEAD-001

The active playback position uses a strong vertical line. Recommended:

- 2–3 CSS px
- one Musi accent
- high contrast
- extends through the current tab/rhythm staff
- does not cover fret numbers

Avoid Songsterr's exact signature color.

### GP-PLAYHEAD-002

The active beat receives a very subtle background highlight. Example: accent at 6–10%
opacity.

This gives the eye:

1. the exact beat
2. the current vertical reading region

### GP-PLAYHEAD-003

Do not put a thick outline around the whole current measure.

The current renderer outlines the active measure and fills it with purple.

Replace that with:

- playhead
- subtle beat wash
- optionally a slightly emphasized bar number

The musician must follow the note, not a rectangle.

---

## 11. Seeking

### GP-SEEK-001

Single click or tap on a beat: seek to that beat.

Playback state stays unchanged:

- paused → stays paused
- playing → continues from the newly selected beat

### GP-SEEK-002

Double-click or double-tap: seek and start playback from that beat.

This mirrors an established Songsterr interaction.

### GP-SEEK-003

A click on the empty horizontal space nearest a beat selects the nearest valid beat.

The user must not need a pixel-perfect click on a fret number.

### GP-SEEK-004

Hit areas must be larger than the visible notation glyphs.

Touch interaction must stay useful while the user:

- holds a guitar
- sits at drums
- stands at a microphone

---

## 12. Follow Scrolling

Current Musi pauses auto-follow for 2.5 seconds after a user scroll
(`cooldownMs = 2500` in `followScroll.js`) and then resumes without a signal.

That can cause the UI to take control of the screen again unexpectedly. Replace this.

### GP-FOLLOW-001

Playback uses a stable reading zone.

Preferred playhead area: approximately the upper-middle 35–45% of the viewport.

The viewport must not scroll constantly. Scroll primarily when:

- the playhead approaches the lower reading threshold
- playback changes system
- the user explicitly seeks outside the visible area

### GP-FOLLOW-002

Automatic movement must prefer discrete system transitions over continuous
pixel-by-pixel following.

Goal:

> score moves rarely; playhead moves constantly.

This makes reading much easier.

### GP-FOLLOW-003

Manual user scrolling while playback is active suspends follow mode.

Show:

```
┌─────────────────────┐
│ ↧ Follow playhead   │
└─────────────────────┘
```

Do not take the viewport back automatically after 2.5 seconds.

Follow resumes when:

- the user taps Follow
- the user presses the follow shortcut
- the user seeks to another position
- playback restarts

### GP-FOLLOW-004

This state belongs in the player state model:

```js
follow: {
  enabled: true,
  suspended: false,
  suspendedReason: null | 'user-scroll'
}
```

---

## 13. Looping

Looping must become one of Musi's best interactions.

The existing practice rail already supports range/song/off loop states and draggable
score markers. The underlying feature is adequate. The UX needs a rebuild.

### GP-LOOP-001 — Direct range selection

Desktop:

- pointer down in a measure
- drag across beats/measures
- release
- selection appears

Mobile:

- long press
- drag handles
- release

### GP-LOOP-002 — Context action

After selection:

```
┌────────────────────────────────────────────┐
│ Bars 32–35     Loop     Practice     Clear │
└────────────────────────────────────────────┘
```

This compact contextual toolbar appears close to the range. It does not cover notation.

### GP-LOOP-003

Pressing Loop:

- commits the selection as loop boundaries
- enables looping
- collapses the contextual toolbar
- activates the persistent transport Loop button

### GP-LOOP-004

Loop visualization:

```
╭──────────────────────────────────────╮
│       subtle translucent area        │
╰──────────────────────────────────────╯
▲                                      ▲
A                                      B
```

Use:

- a subtle accent wash
- a clear start/end boundary
- draggable handles

Do not shade each selected measure as a disconnected set of cards.

### GP-LOOP-005

Loop boundaries support beat-level precision where the playback model supports it.

The existing player state already stores `loopStartBeat` and `loopEndBeat`. The UI must
not artificially restrict all loops to complete measures.

Default drag snapping: beat.

Optional precision: subdivision/event.

### GP-LOOP-006

The transport button toggles the current selection/range loop on and off.

Do not make every normal tap cycle:

> range → whole song → off

That is too modal. Whole-song repeat belongs in the loop popover.

---

## 14. Practice Action

This is where Musi must exceed Songsterr.

After a range selection:

```
Loop
Practice
Annotate
```

### GP-PRACTICE-001

"Practice" converts the selected range into a temporary practice block. The user does not
leave the player.

Example:

```
PRACTICE

Bars 32–35

Current speed
85% · 128 BPM

Goal
Clean 3 times

[ Start ]
```

### GP-PRACTICE-002

After each run, allow:

```
Clean
Almost
Miss
```

Optional in the initial version.

### GP-PRACTICE-003

Support tempo ramp:

```
Start       80%
Increase    +5%
Every       3 clean repetitions
Target      100%
```

The player already contains tempo-ramp state. This must become a polished product
feature, not an obscure configuration capability.

### GP-PRACTICE-004

Allow:

```
Save as exercise
```

This must use the existing Exercise architecture. No duplicate exercise subsystem.

---

## 15. Transport Redesign

Current Musi separates the transport into two rows. Loop, metronome, and measure movement
live in the collapsible second row.

Replace that hierarchy.

**Core principle**

The controls a musician touches every session must always be reachable.

---

## 16. Desktop Transport

Suggested layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⏮   ◀ BAR       ▶       BAR ▶      1:42 / 4:13                   │
│                                                                     │
│      85% · 128 BPM      LOOP 32–35      METRO      MIX             │
└─────────────────────────────────────────────────────────────────────┘
```

This can be one responsive row on wide screens rather than two literal lines.

**Always-visible controls**

- restart / beginning
- previous bar
- play/pause
- next bar
- position/time
- speed
- loop
- metronome
- mixer

**Secondary (behind popovers)**

- count-in
- whole-song repeat
- tempo ramp
- tuning
- transpose
- track pan
- backing-track sync details
- display options
- annotations
- shortcuts

---

## 17. Play Button

### GP-TRANSPORT-001

Play is visually dominant. Recommended:

- 44–48px desktop
- 52–56px mobile
- filled circular or rounded control
- no extra label required

### GP-TRANSPORT-002

Previous/next controls must visually communicate bar navigation, not track skip.

Use tooltips and accessible names.

---

## 18. Playback Speed

The current transport shows the edited BPM directly.

For song practice, users understand this more naturally:

> 70%, 80%, 90%, 100%

Songsterr shows playback speed this way. It explicitly advertises pitch-preserving speed
adjustment.

### GP-SPEED-001

Primary transport label: `85%`

Optional secondary: `128 BPM`

or: `85% · 128 BPM`

### GP-SPEED-002

Opening Speed:

```
PLAYBACK SPEED

50   75   90   100   110   125

────────────●────────────
25%                     200%

128 BPM

[ Tempo ramp › ]
```

### GP-SPEED-003

Speed presets:

- 50%
- 75%
- 90%
- 100%
- 110%
- 125%

The custom range can stay at approximately 25–200%, subject to engine limits.

### GP-SPEED-004

The speed ratio derives from the score tempo:

```
speedRatio = bpm / scoreBpm
```

Do not create two independent tempo values that can drift.

---

## 19. Metronome

### GP-METRO-001

The metronome is visible directly on the transport.

Tap toggles it. Long press or dropdown opens the configuration.

### GP-METRO-002

The active state must be obvious without color alone. Use:

- a filled state
- a check or active icon treatment
- an accessible `aria-pressed`

### GP-METRO-003

Popover:

```
METRONOME

On                         [●]

Count in                   [●]

Count in                   1 bar ▾

Volume                     ━━━━━●━━

Accent beat 1              [●]
```

If subdivision settings already exist, show them here.

---

## 20. Count-In

Count-in must not occupy permanent toolbar space unless enabled.

When enabled, show `COUNT 1` or a small status badge beside Metronome.

Keyboard shortcut: `C`

---

## 21. Track Selector

The currently viewed track must always be obvious.

### GP-TRACK-001

Top-right/center header element:

```
Lead Guitar ▾
```

Optionally:

```
🎸 Lead Guitar ▾
```

No horizontal tab strip is required as the default desktop presentation.

### GP-TRACK-002

Open state:

```
TRACKS

GUITARS

✓ Lead Guitar
  Distortion Guitar

  Rhythm Guitar L
  Distortion Guitar

  Rhythm Guitar R
  Distortion Guitar

OTHER

  Bass
  Picked Bass

  Drums
  Drum Kit
```

### GP-TRACK-003

Click on a track:

- changes the score view
- keeps the current playback beat
- keeps the loop
- keeps the speed
- keeps the playing/paused state
- keeps the follow state

A track switch must never restart the song.

### GP-TRACK-004

Show useful metadata where available:

- instrument
- tuning
- capo
- role/name

Do not show raw MIDI program numbers.

---

## 22. Mixer

Songsterr treats Mixer as the place to switch and control tracks. Its current help also
includes automatic track switching where one part is spread across several
effect-specific tracks.

Musi already keeps track enablement, solo, volume, and pan in player state.

### GP-MIX-001

The desktop mixer opens from the right as a 320–380px drawer.

The score shrinks horizontally where practical. The drawer does not cover the score.

### GP-MIX-002

Mobile: bottom sheet.

### GP-MIX-003

Each track row:

```
┌────────────────────────────────────────────┐
│ 🎸  Rhythm Guitar L                        │
│     Distortion Guitar                      │
│                                            │
│ [M] [S]       ━━━━━━━━━━━●━━━━             │
└────────────────────────────────────────────┘
```

Required:

- viewed-track indicator
- mute
- solo
- volume

Pan is optional/advanced.

### GP-MIX-004

Mute and solo must have independent semantics.

Never use "track enabled" terminology in user-facing UI.

### GP-MIX-005

Solo on one track:

- temporarily isolates it
- does not destroy the user's existing mute states

The current state implementation already preserves underlying track enablement while a
track is soloed. That is good behavior. Keep it.

---

## 23. Track Autoswitch

P1.

Useful for tabs where:

```
Clean Guitar
→ Distortion Guitar
→ Clean Guitar
```

represent one player's physical part.

Possible metadata:

```
trackGroup: 'guitar-1'
```

The player switches the viewed/audio track as playback crosses sections.

Do not attempt automatic inference initially if the score lacks reliable grouping.
Manual user-defined grouping can come later.

---

## 24. Audio Source

Musi already supports attached backing sources. Treat this as a first-class capability.

### GP-AUDIO-001

When backing audio is available:

```
Audio
● Original
○ Synth
```

or a compact header/transport source selector.

### GP-AUDIO-002

Do not call it "Real song" in core production UI. Prefer:

- Original
- Backing
- Synth

depending on the actual source.

### GP-AUDIO-003

A change of audio source must keep:

- the current beat
- the loop
- the speed where technically possible
- the score location

### GP-AUDIO-004

If synchronization is uncertain, show that explicitly:

```
Backing sync: calibrated
```

or:

```
Backing sync needs adjustment
```

Do not silently pretend two timelines are aligned.

---

## 25. Tab / Standard / Both

Songsterr currently offers Tab/Sheet switching on the website. Musi's layout engine
already has an optional standard-notation lane.

Target:

```
View
○ Tab
○ Standard
● Both
```

### GP-VIEW-001

For fretted instruments: Tab, Standard, Both.

### GP-VIEW-002

The preferred view persists globally or per instrument.

### GP-VIEW-003

Drums use appropriate percussion notation modes.

Do not show Tab/Standard options that are not meaningful for the track.

---

## 26. Measure Navigation Strip

Current Musi shows a horizontally scrolling button for nearly every measure.

Remove this as an always-visible interface element. It costs score height and adds UI
noise.

Replace it with a transport position:

```
Bar 38 / 126
```

Click opens:

```
GO TO

Bar [ 38 ]

Sections
Intro          1
Verse         17
Chorus        33
Solo          74
```

Optional later: a small timeline/minimap.

---

## 27. Song Minimap

P1.

Thin horizontal timeline:

```
Intro |────|
Verse      |─────────|
Chorus               |──────|
Solo                         |──────────|
                           ▲
```

Use it for:

- approximate song position
- section navigation
- loop boundaries
- annotations

Height: 20–28px.

Do not replicate the full waveform unless real backing audio makes one useful.

---

## 28. Annotations

Annotations are valuable. They must not visually compete with the music.

### GP-ANNO-001

Small marker beside the bar number:

```
32  ●
```

### GP-ANNO-002

Click opens a lightweight popover/drawer.

### GP-ANNO-003

Range annotation: subtle bracket/line above the selected measures.

### GP-ANNO-004

Do not permanently reserve an annotation lane when no annotation exists.

---

## 29. Analysis Mode

The current GP CSS supports score / analysis / split views.

This is useful Musi functionality. The normal player must no longer visually advertise
analysis as an equal peer of the score.

### GP-ANALYSIS-001

Normal player = score-only.

### GP-ANALYSIS-002

Analysis opens as:

- a right drawer on large desktop, or
- an explicit Analysis workspace

Do not shrink the primary score vertically into a dashboard unless the user intentionally
chooses split view.

---

## 30. Mobile Player

Mobile must be intentionally designed. It is not a scaled-down desktop.

Target:

```
┌─────────────────────────────┐
│ ‹  The Migrant     Guitar ▾ │
├─────────────────────────────┤
│                             │
│                             │
│           SCORE             │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│       ◀      ▶      ▶       │
│                             │
│  85%     Loop     Metro     │
└─────────────────────────────┘
```

### GP-MOBILE-001

Header: 48–52px.

### GP-MOBILE-002

Bottom transport: approximately 80–100px, depending on the safe-area inset.

### GP-MOBILE-003

Core visible controls:

- previous
- play
- next
- speed
- loop
- metronome

### GP-MOBILE-004

Mixer, tracks, speed configuration, and settings use bottom sheets.

### GP-MOBILE-005

All interactive targets: minimum 44×44 CSS px. Prefer 48px for important controls.

### GP-MOBILE-006

Respect `env(safe-area-inset-bottom)`.

### GP-MOBILE-007

Portrait is the primary phone layout. Landscape must become an excellent "music stand"
mode.

---

## 31. Mobile Landscape

Landscape can be extremely valuable for guitar. Use reduced chrome.

```
┌───────────────────────────────────────────────────────────┐
│ ‹ Song       Guitar ▾                         85%  ⋯       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│                    LARGE SCORE                            │
│                                                           │
│                                                           │
├───────────────────────────────────────────────────────────┤
│      ◀             ▶             ▶      Loop    Metro     │
└───────────────────────────────────────────────────────────┘
```

Collapse nonessential labels automatically when the viewport height is constrained.

---

## 32. Fullscreen / Focus Mode

### GP-FOCUS-001

Desktop and tablet: `F` toggles focus mode.

Focus mode hides:

- Musi primary navigation
- surrounding application page controls
- nonessential title metadata

Focus mode keeps:

- score
- minimal header
- transport

### GP-FOCUS-002

On capable browsers, optionally pair focus mode with the browser Fullscreen API after an
explicit user action.

Do not require fullscreen permission.

---

## 33. Keyboard Interaction

Musi already has a reasonable shortcut system. The current mappings differ substantially
from the conventions that users who move from Songsterr expect. Current Musi uses arrows
for previous/next bar, brackets for speed, and "M" for metronome (see `gpPlayerUI.js`
and `shortcutHelp.js`).

Adopt the following:

| Shortcut | Action |
| -------- | ------ |
| Space | Play / pause |
| Backspace or Home | Beginning |
| Left / Right | Previous / next beat |
| Shift + Left / Right | Previous / next measure, or extend loop boundary when selecting |
| T | Tracks |
| S | Speed |
| L | Toggle loop |
| M | Mute current track |
| Alt/Option + M | Solo current track |
| C | Count-in |
| N | Metronome |
| F | Focus mode |
| ? | Shortcut help |
| Esc | Close active panel / cancel selection |

These closely match common Songsterr muscle memory where that makes sense.

**Important**

Keyboard shortcuts must not fire when focus is inside:

- a text input
- a textarea
- a numeric editor
- an editable annotation
- a select-style keyboard widget

---

## 34. Player State Model

Centralize interaction around one authoritative state.

The current `playerState.js` is a good foundation. Extend it conceptually toward:

```js
{
  playback: {
    status: 'paused',
    beat: 0,
    timeSec: 0
  },

  score: {
    trackKind: 'guitar',
    trackIndex: 0,
    viewMode: 'tab',
    zoom: 1,
    follow: true,
    followSuspended: false
  },

  tempo: {
    scoreBpm: 150,
    bpm: 120,
    ratio: 0.8
  },

  loop: {
    enabled: true,
    startBeat: 96,
    endBeat: 112
  },

  selection: {
    kind: null,
    startBeat: null,
    endBeat: null
  },

  metronome: {
    enabled: false,
    countIn: true
  },

  mixer: {
    solo: null,
    tracks: []
  },

  overlay: {
    panel: null
  }
}
```

This does not require a literal replacement of the existing structure if equivalent
semantics already exist.

The requirement is:

> UI state cannot be distributed implicitly across unrelated DOM components.

---

## 35. Player Controller API

Introduce or formalize one orchestration layer.

Suggested API:

```js
player.load(source)

player.play()
player.pause()
player.togglePlay()

player.seekBeat(beat)
player.seekMeasure(index)
player.restart()

player.setSpeedRatio(ratio)
player.setBpm(bpm)

player.setLoop(startBeat, endBeat)
player.enableLoop()
player.disableLoop()
player.clearSelection()

player.setViewedTrack(kind, index)
player.setTrackMute(kind, index, muted)
player.setTrackSolo(kind, index, solo)
player.setTrackVolume(kind, index, gain)

player.setMetronome(enabled)
player.setCountIn(enabled)

player.setViewMode(mode)
player.setZoom(zoom)
player.setFollow(enabled)

player.openPanel(panel)
player.closePanel()
```

Events:

```
score-loading
score-loaded
score-rendered

playback-state-change
position-change
seek

selection-change
loop-change

track-change
mixer-change

tempo-change
metronome-change

follow-change

player-error
```

This is primarily a refactoring boundary around existing behavior.

---

## 36. Loading State

A production player cannot jump from file picker to empty rectangle to eventual score.
Use explicit states.

### GP-LOAD-001

```
Reading Guitar Pro file…
```

### GP-LOAD-002

```
Preparing score…
```

### GP-LOAD-003

When score geometry is available, render it immediately. Audio preparation may continue
independently. Example:

```
Score ready

Preparing playback…
```

### GP-LOAD-004

Disable the Play control only until playback is genuinely ready.

Do not block reading of the score because audio assets are still loading.

---

## 37. Error States

### GP-ERROR-001

Never show a generic `Failed to load` when more information exists. Prefer:

```
Couldn't open this Guitar Pro file

Musi found notation it does not currently support.

File
Infernal Cleansing.gp5

[ View details ]    [ Close ]
```

### GP-ERROR-002

If partial rendering is safe:

```
Some notation could not be displayed

Playback is still available.

Unsupported:
• ...
```

### GP-ERROR-003

A renderer or audio error must not destroy the user's library record.

### GP-ERROR-004

Provide an optional local diagnostic export:

```
Export diagnostics
```

It contains:

- Musi version
- browser
- parser stage
- failure code
- GP feature identifiers

Do not include the original score bytes unless the user explicitly chooses to.

---

## 38. Persistence

When a user opens a score tomorrow, it must feel like a return to a practice session.

**Per-score persistent state**

Persist:

- viewed track
- last playback position
- view mode
- zoom
- speed
- loop boundaries
- loop enabled
- annotations
- backing source
- track volumes/mutes where appropriate

Do not persist temporary solo mode by default.

**Global player preferences**

Persist:

- default follow behavior
- notation preference
- metronome volume
- default count-in configuration
- focus/display preferences

### GP-PERSIST-001

When a score reopens, the player:

- restores the last position
- stays paused
- centers the restored position
- does not suddenly produce audio

---

## 39. Score Rendering Quality

Visual parity will not come from CSS alone. Every notation type must receive a QA and
rendering pass.

### GP-RENDER-001

Required visual verification:

- open strings
- two-digit frets
- chords
- dense 16ths
- tuplets
- dotted rhythms
- ties
- slides
- hammer-ons
- pull-offs
- bends
- pre-bends if supported
- vibrato
- palm mute
- tremolo
- tapping
- harmonics
- dead notes
- rests
- repeated measures
- alternate endings
- time signature changes
- tempo changes
- section markers
- 6-string
- 7-string
- 8-string
- bass
- drums

### GP-RENDER-002

No technique text may collide with:

- fret numbers
- bar lines
- other technique symbols
- notation beams

### GP-RENDER-003

No fret number may be clipped when the user zooms.

### GP-RENDER-004

High-DPI: the score must appear crisp at 1×, 1.5×, 2×, and 3× device pixel ratio.

---

## 40. Zoom

### GP-ZOOM-001

Support:

- Zoom out
- 100%
- Zoom in
- Fit width

### GP-ZOOM-002

On mobile: pinch-to-zoom where feasible.

If pinch gestures conflict with score selection, prioritize stability and provide explicit
controls first.

### GP-ZOOM-003

Zoom must not lose the current beat. Algorithm:

1. Capture the active beat.
2. Rebuild the layout.
3. Determine the new beat geometry.
4. Restore the scroll around the same reading position.

---

## 41. Visual Tokens

Player-specific semantic tokens:

```
--gp-shell-bg
--gp-shell-surface
--gp-toolbar-bg
--gp-toolbar-border

--gp-score-bg
--gp-score-ink
--gp-score-muted
--gp-score-line

--gp-accent
--gp-accent-soft

--gp-playhead
--gp-selection-fill
--gp-loop-fill
--gp-loop-edge

--gp-focus-ring
--gp-danger
```

No control may hard-code the broader Atomic Purple palette.

The player can adapt to the Musi theme while it keeps a stable paper surface.

---

## 42. Light / Dark Application Modes

Dark mode must affect chrome. It must not invert musical notation by default.

Recommended:

```
Dark Musi shell
      +
Light score paper
```

Why:

- familiar sheet-music model
- predictable contrast
- easier printing/export later
- avoids strange technique-color inversions

An optional dark score theme can come later.

---

## 43. Control Styling

Do not turn every action into a bordered rounded button. Use three control classes:

**Primary** — Play. Strong visual emphasis.

**Toggle** — Loop, Metronome, Solo, Mute. Low chrome when off. Clearly filled when on.

**Utility** — Tracks, settings, zoom. Icon/label with minimal container.

Buttons gain backgrounds on hover, focus, and active state. They do not exist as
persistent floating cards.

---

## 44. Icons

Use one consistent SVG icon set.

No text glyphs like `▶`, `↺`, or `✕` for primary production controls, unless the icon
system renders them intentionally.

This removes OS-specific and font-specific rendering differences.

---

## 45. Motion

Motion must communicate state. It must not decorate.

**Durations**

| Element | Duration |
| ------- | -------- |
| Popover | 120–160ms |
| Drawer | 160–220ms |
| Button state | 80–120ms |

**Playhead**

No easing. The playback position must be exact.

**Follow scroll**

A short smooth transition is acceptable for movement between systems.

Respect `prefers-reduced-motion`. Then use immediate jumps.

---

## 46. Accessibility

### GP-A11Y-001

Every player action is keyboard accessible.

### GP-A11Y-002

Every icon action has an accessible label, and a tooltip/title where useful.

### GP-A11Y-003

Toggles: `aria-pressed="true|false"`

### GP-A11Y-004

Drawers and popovers:

- focus management
- Escape closes
- focus returns to the opener
- correct `aria-expanded`

### GP-A11Y-005

Do not announce every playback beat through live regions. That would make assistive
technology unusable.

### GP-A11Y-006

Color is never the only indication of:

- loop
- mute
- solo
- metronome
- active selection

### GP-A11Y-007

Minimum interactive target: 44×44 CSS px on touch.

---

## 47. Performance Requirements

The existing parser already has a worker architecture under the tab subsystem. Keep
off-main-thread parsing.

**Target budgets**

Score render, typical ~100–200 measure score, measured after file bytes are available:

| Device | First usable score |
| ------ | ------------------ |
| Desktop | ≤1.5s |
| Midrange phone | ≤2.5s |

Input response, transport/controls: <100ms perceived response.

Playback, after audio initialization, play/pause response: <100ms.

Scrolling/playhead: 55–60fps. No routine long main-thread task >50ms while playing.

---

## 48. Long Scores

Stress-test at 250, 500, and 1000 measures.

If full DOM rendering becomes excessive, implement viewport-aware score rendering.
Potential strategies:

- `content-visibility: auto`
- system virtualization
- retained layout geometry + mount visible systems
- ahead/behind render buffer

Do not implement virtualization without a profile first.

---

## 49. Responsive Breakpoints

Use behavior-based breakpoints. Do not use device names.

Suggested starting points:

**Compact** (`< 600px`)

- mobile header
- bottom transport
- bottom sheets
- one bar per system commonly

**Medium** (`600–1024px`)

- tablet
- larger bottom sheets
- 1–3 bars per system
- optional side drawer in landscape

**Large** (`> 1024px`)

- desktop header
- persistent horizontal transport
- right-side mixer/settings drawers

**Wide** (`> 1440px`)

- more score width
- more measures per system where density allows
- optional persistent mixer

---

## 50. Resize Behavior

A resize must not:

- reset the song
- reset the playhead
- reset the loop
- reset the track
- reset the speed
- restart audio

Only the layout changes.

---

## 51. Interaction States

Formal player state lifecycle:

```
EMPTY
  ↓
READING_FILE
  ↓
PARSING
  ↓
SCORE_READY
  ↓
AUDIO_PREPARING
  ↓
READY
  ↔ PLAYING
  ↔ PAUSED
  ↔ SEEKING
```

Independent overlay state:

```
NONE
TRACKS
MIXER
SPEED
METRONOME
SETTINGS
ANNOTATION
SHORTCUTS
```

Independent selection state:

```
NONE
CURSOR
RANGE
LOOP
```

Do not represent these states only through DOM classes.

---

## 52. Panel Rules

Only one large secondary panel is open at a time.

Open Mixer while Settings is open: Settings closes → Mixer opens.

Exception: the small contextual range toolbar may coexist with Mixer.

On mobile, all secondary UI uses a single bottom-sheet framework.

---

## 53. First Open

When a user imports a GP file:

1. Parse.
2. Show the score.
3. Identify the first playable track.
4. Position at bar 1.
5. Paused.
6. No loop.
7. Normal speed.
8. Follow enabled.
9. Restore the global preferred notation view where applicable.

Do not autoplay.

---

## 54. Returning to an Existing Score

1. Show the score.
2. Restore the track.
3. Restore the last position.
4. Restore zoom/view.
5. Restore the practice speed.
6. Restore the saved range.
7. Stay paused.
8. Center the current position.

---

## 55. File-Level Engineering Plan

### `js/gpPlayer/playerState.js`

Keep. Extend with:

- explicit playback position/session state
- speed ratio getter
- follow-suspended state
- cleaner temporary selection state
- per-score session persistence hooks

Do not put rendering logic here.

### `js/gpPlayer/parchmentView.js`

Keep the rendering architecture. Evolve its role toward `ScoreCanvas`.

Required changes:

- neutral visual score style
- better playhead
- large beat hit areas
- click-to-seek
- double-click-to-play
- range selection
- contextual range toolbar anchor
- improved loop handles
- follow-suspended indicator hooks
- no unexpected automatic follow resumption

A file rename is optional. Avoid churn only for a name.

### `js/gpPlayer/scoreLayout.js`

Keep as a pure geometry engine. Tune:

- horizontal spacing
- vertical technique spacing
- system packing
- bar heading band
- standard notation alignment
- glyph collision handling

Do not add UI state.

### `js/gpPlayer/followScroll.js`

The current time-based pause model must change.

Replace "pause for 2500ms" with:

```
ACTIVE
SUSPENDED_BY_USER
```

Expose:

```
suspend()
resume()
isSuspended()
```

### `js/gpPlayer/transportDock.js`

Major rewrite. Remove the two-row collapsible philosophy.

The current code intentionally hides practice controls in a second expandable row.

Replace with:

- a stable primary transport
- direct speed
- direct loop
- direct metronome
- responsive overflow

### `js/gpPlayer/practiceRail.js`

Absorb most capabilities into the main transport.

Do not keep a separate conceptual "practice rail" only to preserve the old DOM.

Possibly keep it as an internal factory for loop, metronome, and measure step actions.

### `js/gpPlayer/measureNav.js`

Demote. Do not render by default. Reuse its data for:

- Go to Bar
- section navigation
- optional minimap

### `js/gpPlayer/trackTabs.js`

Replace the default horizontal track-strip presentation with `TrackSelector`. The module
may keep its current data/controller logic.

### `js/gpPlayer/trackMixer.js`

Expand into a polished Mixer drawer. Required:

- selected track state
- mute
- solo
- volume
- instrument metadata
- optional pan

### `js/gpPlayer/metronomePanel.js`

Convert into a compact popover/sheet opened from the direct transport toggle.

### `js/gpPlayer/settingsDrawer.js`

Player-specific advanced configuration only. Do not duplicate options that are already
directly available.

### `js/gpPlayer/playerMenu.js`

Reduce significantly. If the user uses an action continuously while practicing, it does
not belong here.

The menu contains:

- annotations
- transpose/tuning
- display configuration
- backing configuration
- shortcuts
- diagnostics

### `js/gpPlayer/shortcutHelp.js`

Update the shortcut mappings. Keep the help surface.

### `js/gpPlayerUI.js`

Reduce the large DOM orchestration responsibilities. This module mainly composes:

```
PlayerHeader
ScoreCanvas
Transport
OverlayHost
```

Long feature-specific logic lives in the relevant modules.

---

## 56. CSS Architecture

The current `css/gpplayer.css` is approximately 80 KB. It handles shell, score, controls,
menus, drawers, responsive layout, and more.

A production cleanup is warranted. Recommended split:

```
css/gp-player/
  shell.css
  score.css
  transport.css
  mixer.css
  overlays.css
  responsive.css
```

If a split creates unnecessary no-build maintenance overhead, one file is acceptable.
Sections must then be reorganized around these component boundaries.

Remove obsolete selectors in the same migration.

Do not layer vNext rules over old rules indefinitely.

---

## 57. New Optional Modules

Create these only where they simplify boundaries:

```
gpPlayer/playerController.js
gpPlayer/playerSessionStore.js

gpPlayer/selectionToolbar.js
gpPlayer/speedPopover.js
gpPlayer/trackSelector.js
gpPlayer/followButton.js
```

P1:

```
gpPlayer/songMinimap.js
```

---

## 58. Do Not Rebuild

Unless tests demonstrate a real blocker, do not replace:

```
tab/gp5.js
tab/guitarPro.js
tab/scoreTimeline.js

gpMixPlayer.js

gpPlayer/scoreLayout.js core geometry
gpPlayer/playerState.js core state model
```

This project is not a justification to change proven parsing/playback behavior.

---

## 59. Testing Corpus

Create a permanent GP player visual/functional test corpus.

It must include every officially supported Musi format, including `.gp` and `.gp5`.

**Basic**

- one 6-string guitar
- one 7-string guitar
- one 8-string guitar
- bass
- drums

**Arrangement**

- two guitars + bass + drums
- 10+ tracks
- empty tracks
- one track with long silence

**Rhythm**

- whole
- half
- quarter
- eighth
- 16th
- 32nd
- dots
- triplets
- unusual tuplets
- 3/4
- 5/4
- 6/8
- 7/8
- time signature changes

**Guitar techniques**

- bends
- slides
- H/P
- vibrato
- palm mute
- natural harmonic
- pinch harmonic if supported
- tapping
- tremolo
- dead note
- chords
- sweep/arpeggio patterns

**Structure**

- repeat
- alternate ending
- tempo change
- marker
- long score

**Failure**

- malformed file
- truncated file
- unsupported feature
- zero-event track

---

## 60. Visual Regression Testing

Capture canonical screenshots at:

- 360 × 800
- 390 × 844
- 768 × 1024
- 1024 × 768
- 1440 × 900
- 1920 × 1080

States:

- loaded paused
- playing
- loop
- range selection
- mixer
- speed
- metronome
- mobile bottom sheet
- focus mode
- drum score
- standard notation
- dark application shell

A UI change that affects score/player rendering must visibly compare these.

---

## 61. Browser Support Matrix

Test current versions of:

**Desktop**: Chrome, Edge, Firefox, Safari

**Mobile**: Android Chrome, iOS Safari

**PWA**: Android installed PWA, iOS home-screen PWA where supported

---

## 62. Acceptance Requirements

### Layout

- **GP-AC-001** The loaded score player uses the full player workspace, not the normal
  content-card max width.
- **GP-AC-002** Only the header and the transport consume permanent vertical player
  chrome.
- **GP-AC-003** The score stays usable at 360px width.

### Visual

- **GP-AC-010** No GP-player UI uses VT323/Pixelify-style typography.
- **GP-AC-011** The default score surface is neutral paper-white, not visibly beige
  parchment.
- **GP-AC-012** No nested card/shadow treatment surrounds the score.
- **GP-AC-013** The current playback beat is identifiable in under one glance through the
  playhead treatment.

### Seeking

- **GP-AC-020** A click or tap on a beat seeks to it.
- **GP-AC-021** A double-click on a beat starts playback there.
- **GP-AC-022** A seek does not reset speed, loop, mixer, or track.

### Follow

- **GP-AC-030** Playback follows the score without constant micro-scrolling.
- **GP-AC-031** Manual scrolling suspends follow.
- **GP-AC-032** The player never takes scrolling back from the user only because a timer
  expired.

### Loop

- **GP-AC-040** The user can select a range directly on the score.
- **GP-AC-041** A selected range becomes a loop with one additional action.
- **GP-AC-042** The user can adjust loop boundaries visually.
- **GP-AC-043** The loop stays synchronized across track switches.

### Transport

- **GP-AC-050** Play, speed, loop, and metronome are always reachable without a second
  transport row.
- **GP-AC-051** Speed shows primarily as a percentage.
- **GP-AC-052** The current BPM stays accessible.

### Tracks

- **GP-AC-060** The current viewed track is visible in the header.
- **GP-AC-061** A track switch takes no more than two actions.
- **GP-AC-062** A track switch never resets the playback position.
- **GP-AC-063** Mute and solo are independent and immediately reversible.

### Mobile

- **GP-AC-070** All primary controls have touch targets of 44px or larger.
- **GP-AC-071** Mixer/settings open as bottom sheets.
- **GP-AC-072** No horizontal page scroll exists around the player.
- **GP-AC-073** Bottom controls respect the safe-area inset.

### State

- **GP-AC-080** A reopened score restores track, position, speed, zoom, and view.
- **GP-AC-081** A reopened score never autoplays.

### Accessibility

- **GP-AC-090** The whole transport is operable by keyboard.
- **GP-AC-091** A visible focus state exists for every interactive player control.
- **GP-AC-092** Loop/mute/solo/metronome states are distinguishable without color alone.

### Performance

- **GP-AC-100** Transport interaction stays responsive during playback.
- **GP-AC-101** Typical playback does not incur recurring >50ms main-thread work.
- **GP-AC-102** Long-score performance is profiled before release.

---

## 63. Implementation Phases

### Phase 1 — Player Shell Reset (P0)

- eliminate the content-width restriction
- remove nested score cards
- add a dedicated player workspace
- new header
- new transport
- remove retro player typography
- neutral score paper
- de-emphasize measure navigation

This produces a dramatic visual change before the deeper interaction work.

### Phase 2 — Score Canvas Quality (P0)

- playhead redesign
- active beat treatment
- typography
- staff/measure line cleanup
- technique layout refinement
- system spacing
- notation/tab visual hierarchy
- zoom behavior

### Phase 3 — Seeking and Follow (P0)

- click-to-seek
- double-click-to-play
- larger beat hit targets
- stable reading-zone follow
- explicit follow suspension
- Follow Playhead control

### Phase 4 — Loop UX (P0)

- drag selection
- long-press mobile selection
- handles
- contextual toolbar
- direct Loop toggle
- beat-level loop boundaries
- remove range/song/off cycling as the default interaction

### Phase 5 — Transport Practice Controls (P0)

- percentage speed
- speed popover
- direct metronome
- count-in
- playback time/bar position
- keyboard parity

### Phase 6 — Track and Mixer (P0)

- selected track header
- track picker
- mixer drawer
- mobile mixer sheet
- mute
- solo
- volume
- track metadata

### Phase 7 — Responsive Polish (P0)

- 360px portrait
- phone landscape
- tablet portrait/landscape
- desktop
- wide desktop
- safe-area handling

### Phase 8 — Production Resilience (P0 before public launch)

- explicit parser state
- playback-init state
- malformed score errors
- partial-support warnings
- diagnostics
- per-score restore
- regression suite

### Phase 9 — Advanced Player (P1)

- focus/fullscreen mode
- minimap
- section navigation
- backing-track UX
- standard/tab/both polishing
- autoswitch
- richer annotation UX

### Phase 10 — Musi Advantage (P1/P2)

After the player reaches Songsterr-level fundamentals:

- select score range → Practice
- repetition tracking
- working BPM history
- automatic tempo ramp
- save range as exercise
- weak-section history
- practice heat map
- mastery targets
- resurface difficult sections

This is where Musi stops being "a free Songsterr alternative" and becomes a different
product.

**Delivery note**: treat Phases 1–6 as one unified GP Player vNext initiative. Do not
gradually restyle the current transport and parchment view in place.

---

## 64. Required Product Experience

The release must pass this manual scenario without explanation or documentation:

1. The user opens a Guitar Pro file.
2. The score fills the screen.
3. The user immediately sees which instrument they view.
4. The user taps bar 47.
5. The cursor moves there.
6. The user presses Space.
7. The score plays and follows the passage.
8. The user hears that bars 49–52 are difficult.
9. The user drags across those bars.
10. The user chooses Loop.
11. The passage repeats.
12. The user taps "100%".
13. The user changes it to "75%".
14. The user turns the metronome on.
15. The user solos the guitar.
16. The user practices several repetitions.
17. The user switches to rhythm guitar.
18. The playback position and loop stay unchanged.
19. The user closes Musi.
20. The user returns later.
21. The score reopens where practice stopped.

If any of those steps feels obscure, modal, visually noisy, or fragile, this initiative is
not finished.

---

## 65. Product Definition of Done

The GP player is production-ready when:

> A musician can open an unfamiliar Guitar Pro file and, without learning Musi's
> interface, identify their track, understand the score, start from any musical position,
> follow playback, isolate a passage, loop it, slow it down, use a metronome, control the
> mix, and resume practice later without leaving the score canvas.

And visually:

> The first impression is "music player" rather than "web-app card."

The score is the product. Everything else exists to help the musician interact with it.

The most consequential implementation choice in this spec is to not rebuild the GP engine.
The renderer/state architecture is already fairly sophisticated. The large gap is how the
UI surfaces those capabilities.


---

## 66. Implementation Status

This section records what shipped against the spec and what stays open.

### Shipped

- **Shell and header** (Phases 1, 7): the loaded score takes the full workspace with no
  outer card. The header holds Back, title, subtitle, the track selector, the View panel
  (notation and zoom), and Close. Retro fonts and parchment tint are gone from the player.
- **Score canvas** (Phase 2): neutral paper, no lane tints, a 2.5px playhead that passes
  behind fret numbers, a faint beat wash, a paper mask under each fret number.
- **Seeking and follow** (Phase 3): click seeks to the nearest beat column, double-click
  seeks and plays, the whole measure is the hit area. Follow uses a reading zone and moves
  the sheet only between systems. A user scroll during playback suspends follow; a timer
  never resumes it; the Follow playhead pill, a seek, or Play resumes it.
- **Loop UX** (Phase 4): mouse drag or touch long-press marks a range, the contextual
  toolbar offers Loop, Practice, Note, Clear. The loop draws as one band per system with
  draggable start and end knobs. The transport Loop button toggles the marked range; the
  whole-song repeat lives in the loop long-press panel. Loop boundaries are beat-level.
- **Transport** (Phase 5): one stable row. Restart, previous bar, Play, next bar,
  position (opens Go to bar and sections), speed as a percentage with a panel of presets,
  a slider and the BPM, direct Loop, direct Metronome (long press opens settings), Mixer,
  and the overflow menu. Count-in shows as a badge only when on.
- **Tracks and mixer** (Phase 6): a header track selector grouped by instrument family
  with instrument and tuning metadata; a mixer drawer with viewed-track mark, Mute, Solo,
  volume, and Reset mix. A track switch keeps beat, loop, speed, play state, and follow.
- **Practice action** (Phase 10, first slice): Practice opens a panel with a start speed
  and an optional ramp (step, every N loops, target) that drives the existing tempo ramp.
- **Persistence** (Phase 8): a per-score session store restores track, position, notation
  view, zoom, speed ratio, loop, and mixer mutes and volumes. A restored score stays
  paused and centred. Solo is not saved.
- **Keyboard**: the map in section 33, plus X for the mixer and 1–9 for tracks.
- **Focus mode**: F toggles it when follow is not suspended; it hides the app rail and dock.
- **Tests**: unit tests cover the follow state machine, the reading zone, the session
  store, the transport, the track selector, the loop toggle, and the track switch.
  `tests/gp-player/audio/vnext-shots.mjs` screenshots twelve states at six viewports,
  `vnext-interact.mjs` drives real pointer and keyboard input, and `vnext-app.mjs` opens
  a fixture through the real app shell. Run them with a static server on port 8080.

### Open

- **Standard notation only** (GP-VIEW-001): the layout engine draws tab, or tab with a
  standard staff. A standard-only view waits on the engine.
- **Pinch zoom** (GP-ZOOM-002): the View panel holds explicit zoom controls; pinch is
  not bound.
- **Song minimap, track autoswitch, backing source selector in the header** (P1): not
  started. The original recording keeps its transport toggle and its panel.
- **Structured error and diagnostics export** (GP-ERROR-001, GP-ERROR-004): the screen
  keeps its text status; the diagnostics export is not built.
- **Visual regression baselines**: the screenshot harness exists; stored baselines and a
  comparison step do not.
- **Long-score virtualization** (section 48): the 200 bar fixture renders and follows
  without a visible stall; a profile at 500 and 1000 bars is still to do.
