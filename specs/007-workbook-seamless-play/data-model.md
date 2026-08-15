# Data Model: Workbook Seamless Play

## Playthrough run

A maximal sequence of adjacent workbook entries whose exercises have media kind `gp`.

| Field | Meaning |
| --- | --- |
| `startIndex` | First entry index in the run |
| `endIndex` | Last entry index in the run |

## Playthrough part

One loaded Guitar Pro exercise inside a run.

| Field | Meaning |
| --- | --- |
| `entryId` | Workbook entry id |
| `gp` | Sliced or whole `gpResult` for that exercise |
| `name` | Exercise name, used as a bar marker when the first bar has no marker |
| `tempo` | Effective tempo for the part (`item.bpm` or score tempo) |

## Playthrough boundary

Maps a region of the joined score back to a workbook entry.

| Field | Meaning |
| --- | --- |
| `entryId` | Workbook entry id |
| `startBeat` | Inclusive start in quarter-note units |
| `endBeat` | Exclusive end in quarter-note units |
| `startMeasure` | Inclusive start bar index in the joined score |
| `endMeasure` | Inclusive end bar index in the joined score |

## Playthrough score

| Field | Meaning |
| --- | --- |
| `gp` | Joined `gpResult` |
| `boundaries` | Ordered boundary list that covers the joined score |

No new persisted fields. `workbook.loopEnabled` stays the Loop preference.
