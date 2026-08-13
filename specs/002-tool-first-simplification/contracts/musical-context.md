# Contract: musical context

**Owner module**: `js/musicalContext.js`

**Consumers**: `js/shell/toolPage.js`, `js/screenUx.js`, `js/pickers.js`, every tool
that shows root, scale, tuning, tempo, or meter

**Requirements**: FR-021 to FR-025, FR-089

One implementation owns musical context precedence (FR-089). This contract fixes the
service fields, the three layers, the scope API, fallback rules, origin sources, controls,
and test hooks.

## 1. Purpose

Musical context ties compatible tools to the same root, scale, tuning, tempo, and meter
values. Local tool context beats origin context, and origin context beats saved defaults
(FR-021). A tool change writes the local layer only (FR-022). Only Set as default writes
saved defaults (FR-023). Back restores the parent context (FR-024). An incompatible value
falls back with an explanation (FR-025).

## 2. Current state

`js/musicalContext.js` today owns `root`, `scale`, `tempo`, `rootMode`, and
`scaleMode`. It persists these keys:

| Key | Field |
| --- | --- |
| `context.root` | `root` |
| `context.scale` | `scale` |
| `context.tempo` | `tempo` |
| `context.rootMode` | `rootMode` |
| `context.scaleMode` | `scaleMode` |

It exports `getContext`, `setContext`, `subscribeContext`, `advanceContext`,
`getIterationModeLabel`, `ITERATION_MODES`, `TEMPO_MIN`, and `TEMPO_MAX`. It does not
own tuning, meter, or volume.

These modules keep a private root, scale, or tuning today:

| Module | Private context |
| --- | --- |
| `js/scaleReference.js` | root, scale |
| `js/chordReference.js` | root, scale |
| `js/triadReference.js` | root, scale, tuning |
| `js/fretboardTrainer.js` | root, scale, tuning |
| `js/chordWorkout.js` | root, scale (ignores shared context by design) |
| `js/sweepReference.js` | root, tuning |
| `js/movableChordCards.js` | root, tuning |
| `js/interval-map/ui.js` | root, scale, tuning |

`js/chordWorkout.js` ignores the shared context by design today. It goes away in WP-04.

## 3. Service fields after the change

The service owns `root`, `key`, `scale`, `tuning`, `tempo`, and `meter` (decision D12).
Volume stays under `global.volume`. The service exposes volume as a passthrough read,
because volume is an audio setting and not a musical value.

New persisted keys:

| Key | Field |
| --- | --- |
| `context.tuning` | `tuning` |
| `context.meter` | `meter` |

Saved defaults keep `context.root`, `context.scale`, and `context.tempo`. The service
also keeps `context.rootMode` and `context.scaleMode` for iteration controls.

## 4. Three layers and precedence

Local tool context beats origin context. Origin context beats saved defaults (FR-021).

| Layer | Who sets it | Lifetime | Persisted |
| --- | --- | --- | --- |
| Local tool context | The open tool through `setLocal` | One tool page scope | No. Recents copy only when the player leaves through a Recent card |
| Origin context | The navigation source that opened the tool | One navigation entry | No |
| Saved defaults | The player through `setAsDefault` only | Until the player changes them | Yes, under `context.*` keys |

The app persists only saved defaults and the Recents copy of a local context.

## 5. Interface

```javascript
export function openScope({ toolId, origin })   // -> scopeId
export function getEffective(scopeId)           // -> resolved context
export function setLocal(scopeId, partial)      // local layer only
export function setAsDefault(scopeId, fields)   // the only writer of saved defaults
export function closeScope(scopeId)
export function resolveValue(field, value, capability) // -> { value, fallbackFrom, reason }
export function subscribeScope(scopeId, fn)
```

The existing exports keep working during the transition:

```javascript
export function getContext()
export function setContext(partial, source)
export function subscribeContext(fn)
export function advanceContext()
export function getIterationModeLabel(mode)
export const ITERATION_MODES
export const TEMPO_MIN
export const TEMPO_MAX
```

Unconverted modules keep calling `getContext` and `setContext` until their work package
converts them.

### 5.1 Resolved context shape

```javascript
{
  root: string,
  key: string,       // root plus scale identity for display
  scale: string,
  tuning: string,
  tempo: number,
  meter: string,
  volume: number,    // passthrough from global.volume
  rootMode: string,
  scaleMode: string,
  fallbacks: Record<string, { value, fallbackFrom, reason }>,
}
```

`fallbacks` lists only fields where `resolveValue` chose a substitute.

### 5.2 `resolveValue` result

```javascript
{
  value: string | number,   // the value the tool must use
  fallbackFrom: string | null,  // the origin or local value that failed
  reason: string | null,    // stable reason id for the context row message
}
```

When no fallback happened, `fallbackFrom` and `reason` are `null`.

## 6. Rules

1. A tool change writes the local layer only through `setLocal` (FR-022).
2. Only `setAsDefault` writes saved defaults (FR-023).
3. Back restores the parent context for the open origin through `closeScope` and parent
   scope resolution (FR-024).
4. An incompatible value falls back. The app explains the fallback and never changes it
   silently (FR-025).
5. A routine, workbook, exercise, score, or song can supply origin context when the tool
   opens (FR-022).

## 7. Fallback rule

A value is incompatible when the target tool or mode cannot use it.

| Example | Incompatible input | Fallback behavior |
| --- | --- | --- |
| Tuning on a neck diagram | Origin sends `Drop D` but the mode draws six strings only | `resolveValue` returns a six-string tuning the mode can draw. `reason` names the constraint. |
| Scale on a chord mode | Origin sends `Minor Pentatonic` but the mode spells chord qualities only | `resolveValue` returns a compatible scale or key spelling. `reason` names the chord mode limit. |

The context row shows the effective value plus a short explanation when `reason` is
non-null. The row does not hide the fallback.

## 8. Origin context sources

| Origin | Fields it can supply |
| --- | --- |
| Routine session | `tempo` and `meter` from the stored `metronome` object with `bpm`, `beats`, `subdiv`, and `accentFirst` |
| Workbook | `root`, `scale`, `tuning`, `tempo` from companion or entry metadata when present |
| Exercise | `bpm` as `tempo`, `tuning`, `transpose` as `key` offset, `retuneMode` as tuning hint |
| Guitar Pro score | `tuning`, `tempo`, and track selection from the parsed file |
| Song | `key`, `tempo`, and `meter` from song metadata when present |

The opener passes origin fields into `openScope`. The service stores them on the origin
layer only.

## 9. Controls

Per decision D13, the context row reuses `js/screenUx.js` and `js/pickers.js`. A large
option set uses `openSelectionSheet` from `js/selectionSheet.js` (FR-018).

Existing picker keys:

| Key | Option set |
| --- | --- |
| `picker.recentRoots` | Recent roots |
| `picker.favoriteRoots` | Favorite roots |
| `picker.recentScales` | Recent scales |
| `picker.favoriteScales` | Favorite scales |
| `picker.recentChords` | Recent chords |
| `picker.favoriteChords` | Favorite chords |
| `picker.recentTunings` | Recent tunings |
| `picker.favoriteTunings` | Favorite tunings |

`setLocal` runs when the player picks a new value. `setAsDefault` runs only when the
player activates Set as default.

## 10. Guarantees

1. One module owns musical context for every tool that shows root, scale, tuning,
   tempo, or meter (FR-089).
2. Local tool context beats origin context, and origin context beats saved defaults
   (FR-021).
3. `setLocal` is the only writer of the local layer (FR-022).
4. `setAsDefault` is the only writer of saved defaults (FR-023).
5. Back restores the parent context for the open origin (FR-024).
6. An incompatible value never applies silently. The service returns a fallback reason
   (FR-025).
7. Volume reads through a passthrough from `global.volume` and does not persist on the
   context layer.
8. Existing `getContext` and `setContext` callers keep working until their tool converts.
9. Recents stores a copy of local context when the player leaves through a Recent card.

## 11. Test hooks

Suite: `tests/shell/run.mjs`

The suite must assert these precedence cases:

| Case | Expected result |
| --- | --- |
| Local change through `setLocal` | Saved defaults under `context.*` stay unchanged |
| Origin value with no local override | `getEffective` returns the origin value |
| Incompatible origin value | `resolveValue` returns `fallbackFrom` and `reason` |
| `setAsDefault` on one field | Only that `context.*` key changes |
| `closeScope` on Back | Parent scope effective context restores |

Pure Node tests cover `openScope`, layer precedence, `resolveValue`, and
`setAsDefault` guards. DOM shims are not required for the precedence cases.
