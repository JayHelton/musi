# Research: Workbook Seamless Play

## Decision 1: Join scores instead of remount

**Decision**: Join consecutive Guitar Pro results into one `gpResult` when Loop is off.

**Rationale**: The current auto-advance tears down the player, parses the next file, remounts, then starts playback. That path always creates a gap and a visual reload. A joined score is one timeline, so the mix player can schedule across the boundary.

**Alternatives considered**:
- Preload and swap the next model at end: still a visual score change and a scheduler restart.
- Keep remount and skip count-in: still a parse and DOM rebuild gap.

## Decision 2: Join only a maximal Guitar Pro run

**Decision**: Walk left and right from the active entry while items are Guitar Pro. Join that run only.

**Rationale**: Audio, video, and documents cannot join a Guitar Pro timeline. Mixed workbooks must fall back to the existing load path at the first non-Guitar-Pro item.

## Decision 3: Seek inside the joined score

**Decision**: Next, Previous, and playlist clicks that stay in the current run call seek on the mounted player.

**Rationale**: A remount would break the one-score feel for manual moves.

## Decision 4: Tempo map at boundaries

**Decision**: Keep each part's tempo map and add a tempo entry at a part start when that part's tempo differs.

**Rationale**: The mix player timeline already reads `tempoMap`. A single `initialBpm` override would force one tempo on the whole run.
