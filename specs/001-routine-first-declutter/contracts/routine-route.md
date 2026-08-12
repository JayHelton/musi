# Contract: routine route

**Owner modules**: `js/appRoute.js` (generic parse and build), `js/routineRoute.js`
(routine layer rules)

**Consumers**: `js/main.js`, `js/routineNav.js`

**Requirements**: FR-023, FR-024, FR-029, FR-030, FR-031, FR-033, FR-034, FR-035, FR-036

This contract fixes the address format, the layer rules, and the history rules. Both owner
modules are pure. They read no DOM and they call no history function.

## 1. Address grammar

The app keeps a fragment route. The fragment holds a section id, then an optional query
part.

```text
fragment  := id [ "?" params ]
id        := 1*( ALPHA / DIGIT / "-" )
params    := pair *( "&" pair )
pair      := key "=" value
key       := 1*( ALPHA / DIGIT / "-" / "_" )
value     := 1*( unreserved character, percent-encoded when needed )
```

The routine routes use the id `routines` and these keys.

```text
#routines
#routines?routine=<routineId>
#routines?routine=<routineId>&session=<sessionId>
#routines?routine=<routineId>&session=<sessionId>&workbook=<workbookId>
#routines?routine=<routineId>&session=<sessionId>&workbook=<workbookId>&exercise=<exerciseId>
#routines?routine=<routineId>&session=<sessionId>&companion=<companionId>
```

## 2. `js/appRoute.js`

```js
parseAppRoute(hash) -> { id: string, params: Record<string, string> }
buildAppRoute({ id, params }) -> string          // "routines?routine=r1&session=s2"
routeUrl({ id, params }) -> string               // absolute URL for history calls
sameRoute(a, b) -> boolean
```

Rules:

1. `parseAppRoute` accepts a value with or without a leading `#`.
2. `parseAppRoute` returns `{ id: '', params: {} }` for an empty value.
3. `parseAppRoute` decodes each key and each value with `decodeURIComponent`.
4. `parseAppRoute` drops a pair that carries an empty key or an empty value.
5. When a key repeats, the last pair wins.
6. `buildAppRoute` encodes each value with `encodeURIComponent`.
7. `buildAppRoute` omits the query part when the parameter set is empty.
8. `buildAppRoute` writes the routine keys in this fixed order: `routine`, `session`,
   `workbook`, `exercise`, `companion`. It writes any other key after them, in
   alphabetical order. A fixed order keeps one address for one state.
9. `routeUrl` returns `location.pathname + location.search` for the id `home` and for an
   empty id. For every other id it appends `#` and the built fragment.
10. `sameRoute` compares the id and every parameter. It ignores the key order.

## 3. `js/routineRoute.js`

```js
ROUTINE_ROUTE_ID = 'routines'
ROUTINE_PARAM_KEYS = ['routine', 'session', 'workbook', 'exercise', 'companion']

parseRoutineRoute(params) -> RoutineRoute
buildRoutineParams(route) -> Record<string, string>
routeLayer(route) -> LayerName
parentRoute(route) -> RoutineRoute | null
routeDepth(route) -> number
resolveRoutineRoute(route, data) -> { route: RoutineRoute, dropped: string[], reason: string | null }
```

### 3.1 `RoutineRoute`

```js
{
  routine: string | null,
  session: string | null,
  workbook: string | null,
  exercise: string | null,
  companion: string | null,
}
```

### 3.2 Layer names and depth

| Route state | `routeLayer` | `routeDepth` |
| --- | --- | --- |
| No `routine` | `list` | 0 |
| `routine` only | `routine` | 1 |
| `routine` and `session` | `session` | 2 |
| `routine`, `session`, `workbook` | `workbook` | 3 |
| `routine`, `session`, `companion` | `companion` | 3 |
| `routine`, `session`, `workbook`, `exercise` | `exercise` | 4 |

### 3.3 Structural rules

1. A child key needs every parent key. `session` needs `routine`. `workbook` needs
   `session`. `exercise` needs `workbook`. `companion` needs `session`.
2. `exercise` and `companion` never appear together. When both appear, `parseRoutineRoute`
   keeps `exercise` and drops `companion`, because `exercise` sits deeper.
3. `companion` and `workbook` may appear together. The `companion` key then names the
   companion inside that workbook, and the layer stays `companion`.
4. `parseRoutineRoute` drops a key that breaks rule 1, and it drops every key below it.

### 3.4 Parent route

`parentRoute` removes the deepest key.

| Route | Parent |
| --- | --- |
| `exercise` layer | The same route without `exercise` |
| `workbook` layer | The same route without `workbook` |
| `companion` layer | The same route without `companion` and without `workbook` |
| `session` layer | The same route without `session` |
| `routine` layer | The empty routine route, which shows the list |
| `list` layer | `null`, which means Home |

The companion row removes the `workbook` key as well, because the companion layer sits
directly above the session layer. See decision D8 in `research.md`.

### 3.5 Identifier repair

`resolveRoutineRoute(route, data)` returns the deepest valid route. The caller supplies
`data` with four lookups.

```js
data = {
  getRoutine(routineId) -> Routine | null,
  getSession(routine, sessionId) -> Session | null,
  getWorkbook(workbookId) -> Workbook | null,
  findCompanion(session, companionId) -> { workbook, companion } | null,
}
```

Algorithm, in order:

1. When `routine` is absent, return the list route with `dropped` empty.
2. When `getRoutine` returns nothing, return an empty route, set `reason` to
   `routine-missing`, and record every supplied key in `dropped`. The caller sends the
   player to Home, per FR-036.
3. When `getSession` returns nothing, drop `session`, `workbook`, `exercise`, and
   `companion`. Set `reason` to `session-missing`.
4. When `getWorkbook` returns nothing, drop `workbook` and `exercise`. Set `reason` to
   `workbook-missing`.
5. When `exercise` names no entry in the workbook, drop `exercise`. Set `reason` to
   `exercise-missing`.
6. When `findCompanion` returns nothing, drop `companion` and `workbook`. Set `reason` to
   `companion-missing`.
7. Otherwise return the route unchanged, with `dropped` empty and `reason` `null`.

`findCompanion` reads `session.workbookIds` in order. It returns the first workbook whose
`companions` array holds the requested id.

A non-null `reason` makes the caller show the message `Item not found`. The message must
not block use, per FR-035.

## 4. History rules

`js/main.js` owns every history call. `js/routineNav.js` asks for a route change and never
calls the History API itself.

| Event | History action | Reason |
| --- | --- | --- |
| The player opens a deeper layer. | `pushState` with the child route. One entry only. | FR-024 and FR-030 |
| The player presses Back and an in-app entry exists. | `history.back()`. No new entry. | FR-030 |
| The player presses Back and no in-app entry exists. | `replaceState` with the parent route. | FR-034 |
| The app repairs an invalid identifier. | `replaceState` with the repaired route. | FR-035 |
| The player changes the selected entry inside the workbook layer, for example with the next control. | `replaceState` with the new `exercise` value. | Keeps Back at one layer per press. |
| The app applies a route from `popstate`. | No history call. | Prevents a history loop. |
| The app boots on a deep address. | `replaceState` with the resolved route. | FR-033 |

The history state grows to `{ musiNav: id, params }`. The `params` value holds the same
map that the address carries, so the app can restore a route even when the address is
absent.

The existing counter `navPushCount` still counts in-app pushes. `js/routineNav.js` reads it
through the shell to choose between `history.back()` and a replace. The existing flag
`applyingHistory` still blocks history writes while the app applies a popped entry.

## 5. Worked examples

| Action | Address after the action | History |
| --- | --- | --- |
| Open Home. | `/` | replace |
| Tap the Guitar routine card. | `#routines?routine=rt-guitar` | push |
| Open session 3. | `#routines?routine=rt-guitar&session=rs-guitar-03` | push |
| Open the attached workbook. | `#routines?routine=rt-guitar&session=rs-guitar-03&workbook=wb-1` | push |
| Open the second entry. | `...&workbook=wb-1&exercise=ex-2` | push |
| Press the next control. | `...&workbook=wb-1&exercise=ex-3` | replace |
| Press Back. | `...&session=rs-guitar-03&workbook=wb-1` | back |
| Press Back. | `#routines?routine=rt-guitar&session=rs-guitar-03` | back |
| Press Back. | `#routines?routine=rt-guitar` | back |
| Press Back. | `/` | back |
| Open a new tab on `#routines?routine=rt-guitar&session=rs-guitar-03&workbook=wb-1`. | The same address. | replace on boot |
| Press the visible Musi Back control in that new tab. | `#routines?routine=rt-guitar&session=rs-guitar-03` | replace |
| Load `#routines?routine=rt-guitar&session=nope`. | `#routines?routine=rt-guitar` | replace, message `Item not found` |
| Load `#routines?routine=nope&session=s1`. | `/` | replace, message `Item not found` |

## 6. Test matrix

`tests/routine-nav/run.mjs` must cover every row below.

| Case | Expected result |
| --- | --- |
| Parse `routines` | `{ id: 'routines', params: {} }` |
| Parse `#routines?routine=r1&session=s1` | Both parameters, in the map |
| Parse a value with a percent-encoded id | The decoded id |
| Parse a repeated key | The last value wins |
| Build from an empty parameter set | `routines` |
| Build with keys out of order | The fixed key order |
| Build then parse | The same route |
| `routeLayer` for each of the six states | The table in section 3.2 |
| `parentRoute` for each of the six states | The table in section 3.4 |
| A `session` key without a `routine` key | The parser drops `session` |
| An `exercise` key with a `companion` key | The parser keeps `exercise` |
| A missing routine | An empty route and the reason `routine-missing` |
| A missing session | The routine route and the reason `session-missing` |
| A missing workbook | The session route and the reason `workbook-missing` |
| A missing exercise | The workbook route and the reason `exercise-missing` |
| A missing companion | The session route and the reason `companion-missing` |
| A companion in the second attached workbook | The resolver returns that workbook |
| `routeDepth` from the list route to the exercise route | 0, 1, 2, 3, and 4 |
