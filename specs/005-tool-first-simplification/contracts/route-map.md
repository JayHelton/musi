# Contract: route map

**Owner modules**: `js/appRoute.js` (generic parse and build), `js/routeMap.js` (legacy
resolution and route catalogue)

**Consumers**: `js/main.js`

**Requirements**: FR-001, FR-079, FR-080, FR-081, FR-082, FR-083, FR-084, FR-085,
FR-086, FR-087, FR-088, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031

This contract fixes the route grammar, the new route ids, the legacy hash table, and the
notice rules. `js/routeMap.js` is pure. It reads no DOM and it calls no history
function.

## 1. Address grammar

`js/appRoute.js` already parses `#id?key=value` into `{ id, params }` and builds it back.
This feature adds no new grammar.

```js
parseAppRoute(hash) -> { id: string, params: Record<string, string> }
buildAppRoute({ id, params }) -> string
routeUrl({ id, params }) -> string
sameRoute(a, b) -> boolean
```

Rules that stay unchanged:

1. `parseAppRoute` accepts a value with or without a leading `#`.
2. `parseAppRoute` returns `{ id: '', params: {} }` for an empty value.
3. `buildAppRoute` omits the query part when the parameter set is empty.
4. `routeUrl` returns `location.pathname + location.search` for an empty id and for the
   root route. The root route id is `tools`. It uses no hash, exactly as `home` does
   today.

A tool mode travels in the `mode` parameter, for example `#scalelab?mode=neck`.

## 2. Module interface

```js
export function resolveRoute(route, ctx?)   // { id, params } -> ResolvedRoute
export function isKnownRoute(id) -> boolean
export const ROUTE_IDS
export const LEGACY_ROUTES
```

```js
ResolvedRoute = {
  id: string,
  params: Record<string, string>,
  notice: string | null,    // null or a stable notice id string
}
```

Rules:

1. `resolveRoute` checks `LEGACY_ROUTES` first when the input `id` is a legacy hash.
2. `resolveRoute` normalises `mode` for routes that declare modes. It fills a missing
   `mode` with the route default.
3. `resolveRoute` returns the input unchanged when the `id` is already a known route and
   carries no legacy alias.
4. `isKnownRoute` returns `true` for every id in `ROUTE_IDS`.
5. `LEGACY_ROUTES` is a read-only map from legacy hash id to a resolver entry.

Optional `ctx` supplies data the resolver needs:

```js
ctx = {
  hasDrumExercises(): boolean,   // true when at least one exercise has instrument drums
  noticesSeen: string[],          // current route.noticesSeen list
}
```

When `ctx` is absent, as in unit tests, `hasDrumExercises` defaults to `false`.

## 3. New route ids and modes

| Route id | Modes | Default mode |
| --- | --- | --- |
| `tools` | `train`, `study`, `create` | `train` |
| `scalelab` | `overview`, `neck`, `harmony`, `modes`, `guide` | `overview` |
| `fretmap` | `learn`, `map`, `chordtones`, `explain` | `map` |
| `chordlab` | `reference`, `map`, `voicings`, `triads`, `build` | `reference` |
| `pitchear` | `tuner`, `tone`, `match`, `runner`, `ear` | `tuner` |
| `metronome` | `metronome`, `plan` | `metronome` |
| `audiostudio` | `capture`, `analyze`, `transcribe` | `capture` |
| `songstudio` | _(none)_ | _(none)_ |
| `library` | `exercises`, `workbooks` | `exercises` |
| `routines` | _(none)_ | _(none)_ |
| `scoreplayer` | _(none)_ | _(none)_ |
| `settings` | `preferences`, `audio`, `data`, `cleanup` | `preferences` |

`routines` keeps the parameter keys `routine`, `session`, `workbook`, `exercise`, and
`companion` from `js/routineRoute.js`. `resolveRoute` passes them through unchanged.

`ROUTE_IDS` lists every id in the table above.

## 4. Legacy route table

`LEGACY_ROUTES` must contain one row for every hash below. `resolveRoute` must return the
listed destination for each hash.

| Legacy hash | Resolved route | Notice id |
| --- | --- | --- |
| `#scales` | `{ id: 'scalelab', params: { mode: 'overview' } }` | `notice.scales-removed` |
| `#scaleref` | `{ id: 'scalelab', params: { mode: 'overview' } }` | `null` |
| `#circle` | `{ id: 'scalelab', params: { mode: 'modes' } }` | `null` |
| `#studylab` | `{ id: 'scalelab', params: { mode: 'guide' } }` | `null` |
| `#intervals` | `{ id: 'fretmap', params: { mode: 'learn' } }` | `notice.intervals-removed` |
| `#fretboard` | `{ id: 'fretmap', params: { mode: 'map' } }` | `notice.fretboard-removed` |
| `#intervalorbit` | `{ id: 'fretmap', params: { mode: 'map' } }` | `null` |
| `#intervalmap` | `{ id: 'fretmap', params: { mode: 'map' } }` | `null` |
| `#chordlab` | `{ id: 'chordlab', params: { mode: 'reference' } }` | `notice.chordlab-removed` |
| `#chords` | `{ id: 'chordlab', params: { mode: 'reference' } }` | `null` |
| `#triads` | `{ id: 'chordlab', params: { mode: 'triads' } }` | `null` |
| `#tuner` | `{ id: 'pitchear', params: { mode: 'tuner' } }` | `null` |
| `#ear` | `{ id: 'pitchear', params: { mode: 'ear' } }` | `null` |
| `#timing` | `{ id: 'metronome', params: { mode: 'metronome' } }` | `notice.timing-removed` |
| `#metronome` | `{ id: 'metronome', params: { mode: 'metronome' } }` | `null` |
| `#practice` | `{ id: 'metronome', params: { mode: 'plan' } }` | `null` |
| `#sightreading` | `{ id: 'tools', params: { mode: 'train' } }` | `notice.sightreading-removed` |
| `#recorder` | `{ id: 'audiostudio', params: { mode: 'capture' } }` | `null` |
| `#tracktosheet` | `{ id: 'audiostudio', params: { mode: 'transcribe' } }` | `null` |
| `#songwriter` | `{ id: 'songstudio', params: {} }` | `null` |
| `#notes` | `{ id: 'songstudio', params: {} }` | `notice.notes-removed` |
| `#keyboard` | `{ id: 'tools', params: { mode: 'study' } }` | `notice.pitch-reference` |
| `#drums` | See section 5 | `notice.drums-removed` |
| `#exercises` | `{ id: 'library', params: { mode: 'exercises' } }` | `null` |
| `#workbooks` | `{ id: 'library', params: { mode: 'workbooks' } }` | `null` |
| `#routines` | `{ id: 'routines', params: {} }` | `null` |
| `#gpplayer` | `{ id: 'scoreplayer', params: {} }` | `null` |
| `#tabanalyzer` | `{ id: 'scoreplayer', params: {} }` | `null` |
| `#musicprefs` | `{ id: 'settings', params: { mode: 'preferences' } }` | `null` |
| `#home` | `{ id: 'tools', params: {} }` | `null` |

`#intervalmap` and `#tabanalyzer` stay working as aliases (FR-079, FR-087).

Notice ids are stable strings. The UI maps each id to one dismissible message.

## 5. `#drums` conditional rule

Per FR-086:

1. When `ctx.hasDrumExercises()` is `true`, resolve to
   `{ id: 'library', params: { mode: 'exercises' } }` and set the Library filter for
   instrument `drums` through origin context.
2. When `ctx.hasDrumExercises()` is `false`, resolve to
   `{ id: 'library', params: { mode: 'exercises' } }` with no instrument filter.

The resolver learns which case applies from `ctx.hasDrumExercises()`. The live caller
builds that function from the exercise store after `drums-to-exercises.v1` runs. It
returns `true` when at least one exercise carries `instrument: 'drums'`.

Both cases carry the notice id `notice.drums-removed`.

## 6. Notice state

Dismissed notice ids live under the settings key `route.noticesSeen`. The value is a
string array of notice ids the player already dismissed.

Rules per FR-088:

1. A notice is dismissible.
2. A notice shows once per route migration. When the notice id is already in
   `route.noticesSeen`, `resolveRoute` still returns the notice id but the UI does not
   show the banner.
3. The setting syncs through the `settings` sync domain. A device can mark a notice seen
   before it showed the notice on that device.

`js/main.js` reads `route.noticesSeen` when it applies a resolved route. It shows the
banner only when the notice id is non-null and absent from the list.

## 7. Root route

Per FR-001:

1. An empty hash opens `tools` with default mode `train`.
2. `routeUrl({ id: 'tools', params: {} })` returns the path with no hash.
3. The app must not open an empty routine state at boot.

## 8. Integration with `js/main.js`

```text
hashchange / popstate / boot
  -> parseAppRoute(location.hash)
  -> resolveRoute({ id, params }, ctx)
  -> applyRoute(resolved, { source })
  -> show notice when resolved.notice is set and not in route.noticesSeen
```

`resolveRoute` runs before `isValidSection` checks. Legacy hashes never reach removed
section ids.

## 9. Test approach

Suite: `tests/routes/run.mjs`

The suite must assert a destination for every row in section 4.

| Case | Expected result |
| --- | --- |
| Each legacy hash in section 4 | The listed `id`, `params`, and `notice` |
| `#home` with no hash | `{ id: 'tools', params: {}, notice: null }` |
| `#intervalmap` alias | Same destination as `#intervalorbit` |
| `#tabanalyzer` alias | Same destination as `#gpplayer` |
| `#drums` with drum exercises | `library` with mode `exercises` |
| `#drums` without drum exercises | `library` with mode `exercises`, no filter |
| Known route `scalelab` without `mode` | `mode` defaults to `overview` |
| `isKnownRoute('tools')` | `true` |
| `isKnownRoute('scales')` | `false` |
| Notice id in `route.noticesSeen` | Resolver still returns the id; UI helper hides banner |

The suite uses a fake `ctx` and needs no DOM.
