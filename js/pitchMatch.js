import { midiFreq } from './audio.js';
import { NOTE_NAMES_SHARP } from './theory.js';

// Reusable pitch-matching helpers shared by mic-driven "sing this note" tools.
//
// `pitch.js` turns raw audio frames into a stable detected frequency. This
// module sits one layer above that: given a *target* note, it decides how close
// the singer is and whether they have held the note long enough to pass. The
// logic here is intentionally free of any DOM/audio dependencies so it can be
// unit-tested and reused by future pitch-matching features (guided warm-ups,
// melody trainers, etc.).

const SHARP_NAMES = NOTE_NAMES_SHARP;

export function freqToMidiFloat(freq) {
  return 12 * Math.log2(freq / 440) + 69;
}

// Signed cents the detected frequency sits away from the target MIDI note.
// Positive => sharp (above), negative => flat (below).
export function centsOffFromTarget(freq, targetMidi) {
  if (!(freq > 0)) return null;
  return 1200 * Math.log2(freq / midiFreq(targetMidi));
}

export function midiToLabel(midi) {
  const m = Math.round(midi);
  const name = SHARP_NAMES[((m % 12) + 12) % 12];
  const oct = Math.floor(m / 12) - 1;
  return { midi: m, name, oct, full: name + oct };
}

// A stateful, time-based note matcher. It accumulates "held" time while the
// detected pitch stays within `toleranceCents` of the target and reports the
// note as matched once that time reaches `holdMs`. Time is driven by explicit
// timestamps passed to `update`, which keeps the engine deterministic and
// testable (no reliance on real clocks or frame rates).
//
// Options:
//   holdMs         - how long the note must be held in tune to pass.
//   toleranceCents - half-width of the in-tune window (|cents| <= tolerance).
//   windowCents    - half-range used for UI proximity mapping (default 200).
//   graceMs        - brief out-of-tune dropout tolerated before progress resets,
//                    so vibrato or a momentary wobble doesn't zero the hold.
export function createPitchMatcher(opts = {}) {
  const holdMs = opts.holdMs ?? 1000;
  const toleranceCents = opts.toleranceCents ?? 35;
  const windowCents = opts.windowCents ?? 200;
  const graceMs = opts.graceMs ?? 180;

  let targetMidi = null;
  let heldMs = 0;
  let lastTs = null;
  let lastWithinTs = null;
  let matched = false;

  function setTarget(midi) {
    targetMidi = midi == null ? null : Math.round(midi);
    heldMs = 0;
    lastTs = null;
    lastWithinTs = null;
    matched = false;
  }

  function reset() {
    setTarget(targetMidi);
  }

  // Feed a detected frequency (or <=0 / null for "no pitch") plus the current
  // timestamp in milliseconds. Returns a snapshot describing proximity and
  // progress for both the matching logic and the UI meter.
  //
  // When `count` is false the frame is treated as "don't score": proximity and
  // offset are still computed for the meter, but no hold time accumulates and
  // the progress is held at zero. This lets callers ignore audio they shouldn't
  // credit (e.g. a reference/guide tone bleeding back into the mic) without
  // losing the live visual feedback.
  function update(freq, nowMs, count = true) {
    if (targetMidi == null) {
      return { active: false, freq: -1, centsOff: null, within: false, progress: 0, matched: false, proximity: 0 };
    }

    const dt = lastTs == null ? 0 : Math.max(0, Math.min(250, nowMs - lastTs));
    lastTs = nowMs;

    const hasPitch = freq > 0;
    const centsOff = hasPitch ? centsOffFromTarget(freq, targetMidi) : null;
    const within = hasPitch && Math.abs(centsOff) <= toleranceCents;

    if (!count) {
      // Suppressed frame: keep the hold pinned at zero and drop any grace so a
      // fresh, clean hold begins the moment scoring resumes.
      heldMs = 0;
      lastWithinTs = null;
    } else if (within) {
      heldMs += dt;
      lastWithinTs = nowMs;
    } else if (lastWithinTs != null && nowMs - lastWithinTs <= graceMs) {
      // Within the grace window: keep the accumulated hold but don't add to it.
    } else {
      heldMs = 0;
    }

    if (!matched && heldMs >= holdMs) matched = true;

    // Proximity is a 0..1 "how close" score for the UI: 1 when dead-on, fading
    // to 0 at the edge of the display window.
    let proximity = 0;
    if (centsOff != null) {
      proximity = Math.max(0, 1 - Math.abs(centsOff) / windowCents);
    }

    return {
      active: true,
      freq: hasPitch ? freq : -1,
      centsOff,
      within,
      progress: Math.max(0, Math.min(1, heldMs / holdMs)),
      heldMs,
      matched,
      proximity,
      // Vertical position 0..1 for a meter where 0 = top (sharp) and 1 = bottom
      // (flat); 0.5 is the target. Clamped to the display window.
      offsetRatio: centsOff == null
        ? 0.5
        : 0.5 - Math.max(-1, Math.min(1, centsOff / windowCents)) / 2,
    };
  }

  return {
    setTarget,
    update,
    reset,
    get target() { return targetMidi; },
    get toleranceCents() { return toleranceCents; },
    get windowCents() { return windowCents; },
    get holdMs() { return holdMs; },
  };
}
