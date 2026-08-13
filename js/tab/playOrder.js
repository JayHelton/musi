// Pure play-order expansion for repeat marks and alternate endings.
//
// The written score and the sounding score are not the same. A repeat mark
// makes one written bar sound more than one time. This module walks the
// written bars and returns the sounding order as a list of bar passes.
//
// Rules that this module follows:
//  - A repeat open mark starts a section. A score with no open mark starts its
//    first section at bar 0.
//  - A repeat close mark holds the total play count of the section. A close
//    count of 2 plays the section two times.
//  - An alternate ending bar sounds only on the pass that its ending number
//    names. The module skips the other ending bars on that pass.
//  - A nested repeat flattens to one linear pass and adds a warning.
//
// The module is pure. It reads no DOM and no global state.

const DEFAULT_MAX_PASSES = 20000;
const DEFAULT_BAR_QUARTERS = 4;

/**
 * Expand written measures into sounding bar passes.
 * @param {object[]} measures TabModel.measures entries
 * @param {{ maxPasses?: number }} [options]
 * @returns {{ passes: object[], barOrder: number[], flattened: boolean, warnings: string[] }}
 */
export function buildPlayOrder(measures, options = {}) {
  const bars = Array.isArray(measures) ? measures : [];
  if (bars.length === 0) {
    return { passes: [], barOrder: [], flattened: false, warnings: [] };
  }

  const maxPasses = Number.isFinite(options.maxPasses) && options.maxPasses > 0
    ? Math.floor(options.maxPasses)
    : DEFAULT_MAX_PASSES;
  const warnings = [];

  if (hasNestedRepeat(bars)) {
    warnings.push('A nested repeat is present. The player flattened the form to one linear pass.');
    return finish(linearVisits(bars, maxPasses, warnings), bars, true, warnings);
  }

  return finish(repeatVisits(bars, maxPasses, warnings), bars, false, warnings);
}

/** Quarter-note length of one written bar. */
export function barQuarters(measure) {
  if (!measure) return DEFAULT_BAR_QUARTERS;
  const start = Number(measure.startBeat);
  const end = Number(measure.endBeat);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  const sig = measure.timeSig;
  if (Array.isArray(sig) && sig.length === 2) {
    const count = Number(sig[0]);
    const value = Number(sig[1]);
    if (Number.isFinite(count) && Number.isFinite(value) && count > 0 && value > 0) {
      return count * (4 / value);
    }
  }
  return DEFAULT_BAR_QUARTERS;
}

/** True when one repeat section opens inside another open section. */
function hasNestedRepeat(bars) {
  let depth = 0;
  for (const bar of bars) {
    const rep = bar?.repeat;
    if (!rep) continue;
    if (rep.open) {
      if (depth > 0) return true;
      depth += 1;
    }
    if (rep.closeCount != null) depth = Math.max(0, depth - 1);
  }
  return false;
}

/** Total plays of a section from a close mark. */
function totalPlays(closeCount) {
  const n = Number(closeCount);
  if (!Number.isFinite(n) || n < 2) return 2;
  return Math.floor(n);
}

/** Ending numbers on a bar, or null when the bar carries no ending mark. */
function endingsOf(bar) {
  const list = bar?.repeat?.endings;
  if (!Array.isArray(list) || list.length === 0) return null;
  const clean = list.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return clean.length ? clean : null;
}

/** Walk every bar one time, in written order. */
function linearVisits(bars, maxPasses, warnings) {
  const visits = [];
  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    if (visits.length >= maxPasses) {
      warnings.push('The player stopped the play-order expansion at the maxPasses limit.');
      break;
    }
    visits.push({ barIndex, endingNumber: endingsOf(bars[barIndex])?.[0] ?? null });
  }
  return visits;
}

/** Walk the bars and follow every repeat mark and every alternate ending. */
function repeatVisits(bars, maxPasses, warnings) {
  const visits = [];
  let cursor = 0;
  let openBar = 0;
  let playsDone = 0;
  let guard = 0;
  const guardLimit = maxPasses + bars.length + 1;

  while (cursor < bars.length) {
    guard += 1;
    if (guard > guardLimit) {
      warnings.push('The player stopped the play-order expansion at the maxPasses limit.');
      break;
    }
    if (visits.length >= maxPasses) {
      warnings.push('The player stopped the play-order expansion at the maxPasses limit.');
      break;
    }

    const bar = bars[cursor];
    const rep = bar?.repeat;

    // A new open mark starts a new section.
    if (rep?.open && cursor !== openBar) {
      openBar = cursor;
      playsDone = 0;
    }

    // An ending bar sounds only on the pass that its number names.
    const endings = endingsOf(bar);
    const currentPlay = playsDone + 1;
    if (endings && !endings.includes(currentPlay)) {
      cursor += 1;
      continue;
    }

    visits.push({ barIndex: cursor, endingNumber: endings ? currentPlay : null });

    if (rep?.closeCount != null) {
      const plays = totalPlays(rep.closeCount);
      playsDone += 1;

      // Guitar Pro puts the close mark on the last bar of an ending. Some
      // files instead put the ending bars after the close bar. Support both:
      // when the close bar carries no ending mark, play the ending bar of this
      // pass from the group that follows the close bar.
      const group = endingGroup(bars, cursor + 1);
      if (!endings && group.length) {
        const taken = group.find((i) => endingsOf(bars[i]).includes(playsDone));
        if (taken != null) visits.push({ barIndex: taken, endingNumber: playsDone });
      }

      if (playsDone < plays) {
        cursor = openBar;
        continue;
      }
      cursor = group.length ? group[group.length - 1] + 1 : cursor + 1;
      openBar = cursor;
      playsDone = 0;
      continue;
    }

    cursor += 1;
  }

  return visits;
}

/** The run of ending bars that starts at `from`. */
function endingGroup(bars, from) {
  const group = [];
  for (let cursor = from; cursor < bars.length; cursor += 1) {
    if (bars[cursor]?.repeat?.open) break;
    if (!endingsOf(bars[cursor])) break;
    group.push(cursor);
  }
  return group;
}

/** Turn bar visits into passes with quarter spans and pass indexes. */
function finish(visits, bars, flattened, warnings) {
  const passes = [];
  const barOrder = [];
  const seen = new Map();
  let quarter = 0;

  for (let index = 0; index < visits.length; index += 1) {
    const { barIndex, endingNumber } = visits[index];
    const passIndex = seen.get(barIndex) ?? 0;
    seen.set(barIndex, passIndex + 1);
    const length = barQuarters(bars[barIndex]);
    passes.push({
      index,
      barIndex,
      passIndex,
      endingNumber,
      startQuarter: quarter,
      endQuarter: quarter + length,
    });
    barOrder.push(barIndex);
    quarter += length;
  }

  return { passes, barOrder, flattened, warnings };
}
