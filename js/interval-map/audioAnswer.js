/**
 * Play-to-answer validation for Interval Map.
 * Validates pitch / pitch-class only — never claims exact string/fret detection.
 */

import { NOTE_NAMES_SHARP } from '../theory.js';
import { intervalClass, noteLabel, describeInterval, pitchClassName } from './model.js';

export const DEFAULT_AUDIO_OPTS = {
  stableMs: 250,
  toleranceCents: 35,
  minRms: 0.012,
  minClarity: 0.55,
  debounceMs: 400,
};

/**
 * Validate a single played pitch against a target.
 * registerMode: 'pitchClass' | 'exact'
 * directionMode: 'any' | 'ascending' | 'descending' | 'nearest'
 */
export function validatePlayedPitch({
  playedMidi,
  playedCents = 0,
  targetMidi,
  anchorMidi = null,
  registerMode = 'pitchClass',
  directionMode = 'any',
  toleranceCents = DEFAULT_AUDIO_OPTS.toleranceCents,
  intervalClass: expectedIc = null,
} = {}) {
  if (playedMidi == null || !Number.isFinite(playedMidi)) {
    return { ok: false, reason: 'no-pitch', message: 'No stable pitch detected.' };
  }
  if (targetMidi == null && expectedIc == null) {
    return { ok: false, reason: 'no-target', message: 'No target specified.' };
  }

  const played = Math.round(playedMidi);
  const playedPc = ((played % 12) + 12) % 12;
  const cents = Number(playedCents) || 0;

  let target = targetMidi != null ? Math.round(targetMidi) : null;
  if (target == null && anchorMidi != null && expectedIc != null) {
    target = resolveTargetMidi(anchorMidi, expectedIc, directionMode, played);
  }

  const targetPc = target != null ? ((target % 12) + 12) % 12 : null;
  const detectedIc = anchorMidi != null ? intervalClass(played, anchorMidi) : null;
  const withinCents = Math.abs(cents) <= toleranceCents;

  if (registerMode === 'exact') {
    const ok = played === target && withinCents;
    return feedback({
      ok,
      played,
      target,
      cents,
      detectedIc,
      expectedIc: expectedIc ?? (anchorMidi != null && target != null ? intervalClass(target, anchorMidi) : null),
      registerMode,
      reason: ok ? 'correct' : (played === target ? 'cents' : 'pitch'),
      limitation: 'Audio validates pitch only — string/fret is not detected.',
    });
  }

  // pitch-class mode
  const ok = targetPc != null && playedPc === targetPc && withinCents;
  // direction filters when anchor known
  if (ok && anchorMidi != null && directionMode === 'ascending' && played < anchorMidi) {
    return feedback({
      ok: false, played, target, cents, detectedIc,
      expectedIc: expectedIc ?? intervalClass(target, anchorMidi),
      registerMode, reason: 'direction',
      limitation: 'Audio validates pitch only — string/fret is not detected.',
      message: `Played ${noteLabel(played)} is below the root; ascending target required.`,
    });
  }
  if (ok && anchorMidi != null && directionMode === 'descending' && played > anchorMidi) {
    return feedback({
      ok: false, played, target, cents, detectedIc,
      expectedIc: expectedIc ?? intervalClass(target, anchorMidi),
      registerMode, reason: 'direction',
      limitation: 'Audio validates pitch only — string/fret is not detected.',
      message: `Played ${noteLabel(played)} is above the root; descending target required.`,
    });
  }

  return feedback({
    ok,
    played,
    target,
    cents,
    detectedIc,
    expectedIc: expectedIc ?? (anchorMidi != null && target != null ? intervalClass(target, anchorMidi) : null),
    registerMode,
    reason: ok ? 'correct' : (playedPc === targetPc ? 'cents' : 'pitch'),
    limitation: 'Audio validates pitch only — string/fret is not detected.',
  });
}

function resolveTargetMidi(anchorMidi, ic, directionMode, playedMidi) {
  const base = ic === 12 ? 12 : ((ic % 12) + 12) % 12;
  if (directionMode === 'descending') return anchorMidi - (base === 0 && ic !== 12 ? 12 : base || 12);
  if (directionMode === 'ascending') return anchorMidi + (base === 0 && ic !== 0 ? 12 : base || (ic === 0 ? 0 : 12));
  if (directionMode === 'nearest' && playedMidi != null) {
    const up = anchorMidi + (base || (ic === 12 ? 12 : 0));
    const down = anchorMidi - (base || (ic === 12 ? 12 : 0));
    if (base === 0 && ic !== 12) return Math.abs(playedMidi - anchorMidi) < Math.abs(playedMidi - (anchorMidi + 12))
      ? anchorMidi
      : (Math.abs(playedMidi - (anchorMidi + 12)) <= Math.abs(playedMidi - (anchorMidi - 12)) ? anchorMidi + 12 : anchorMidi - 12);
    return Math.abs(playedMidi - up) <= Math.abs(playedMidi - down) ? up : down;
  }
  return anchorMidi + (ic === 12 ? 12 : base);
}

function feedback(opts) {
  const {
    ok, played, target, cents, detectedIc, expectedIc, registerMode, reason, limitation, message,
  } = opts;
  const playedLabel = noteLabel(played);
  const targetLabel = target != null ? noteLabel(target) : '?';
  const expected = expectedIc != null ? describeInterval(expectedIc === 0 && target != null && Math.abs(target - (played)) >= 11 ? 12 : expectedIc) : null;
  const detected = detectedIc != null ? describeInterval(detectedIc) : null;

  let msg = message;
  if (!msg) {
    if (ok) {
      msg = `Played: ${playedLabel} · Target: ${expected ? expected.name : targetLabel}`
        + (expected ? ` from root` : '')
        + (expected ? ` · +${expected.semis} semitones` : '')
        + ` · ${cents >= 0 ? '+' : ''}${Math.round(cents)} cents · Correct`;
    } else if (detected && expected) {
      msg = `Played: ${playedLabel} · Detected: ${detected.name} · Target: ${expected.name}`;
    } else {
      msg = `Played: ${playedLabel} · Target: ${targetLabel}`;
    }
  }

  return {
    ok,
    playedMidi: played,
    playedLabel,
    playedPitchClass: pitchClassName(played),
    targetMidi: target,
    targetLabel,
    cents: Math.round(cents),
    detectedInterval: detected,
    targetInterval: expected,
    registerMode,
    reason,
    message: msg,
    limitation,
    claimsPhysicalPosition: false,
  };
}

/**
 * Sequence validator for root→interval or multi-step sequences.
 */
export function createSequenceValidator(steps, opts = {}) {
  const registerMode = opts.registerMode || 'pitchClass';
  const toleranceCents = opts.toleranceCents ?? DEFAULT_AUDIO_OPTS.toleranceCents;
  const holdMs = opts.holdMs ?? DEFAULT_AUDIO_OPTS.stableMs;
  let index = 0;
  let lastAcceptedMidi = null;
  let lastAcceptAt = 0;

  function current() {
    return steps[index] || null;
  }

  function reset() {
    index = 0;
    lastAcceptedMidi = null;
    lastAcceptAt = 0;
  }

  function ingest({ midi, cents = 0, nowMs = 0, scoring = true } = {}) {
    if (!scoring) {
      return { ok: false, progress: index, total: steps.length, complete: false, suppressed: true };
    }
    const step = current();
    if (!step) {
      return { ok: true, progress: index, total: steps.length, complete: true };
    }

    // Debounce: ignore sustained frames of the same accepted note
    if (lastAcceptedMidi != null && Math.round(midi) === lastAcceptedMidi) {
      if (nowMs - lastAcceptAt < (opts.debounceMs ?? DEFAULT_AUDIO_OPTS.debounceMs)) {
        return {
          ok: false,
          progress: index,
          total: steps.length,
          complete: false,
          debounced: true,
          step,
        };
      }
    }

    const result = validatePlayedPitch({
      playedMidi: midi,
      playedCents: cents,
      targetMidi: step.targetMidi,
      anchorMidi: step.anchorMidi,
      registerMode: step.registerMode || registerMode,
      directionMode: step.directionMode || 'any',
      toleranceCents: step.toleranceCents ?? toleranceCents,
      intervalClass: step.intervalClass,
    });

    if (result.ok) {
      lastAcceptedMidi = Math.round(midi);
      lastAcceptAt = nowMs;
      index += 1;
      return {
        ok: true,
        progress: index,
        total: steps.length,
        complete: index >= steps.length,
        step,
        result,
        holdMs,
      };
    }

    return {
      ok: false,
      progress: index,
      total: steps.length,
      complete: false,
      step,
      result,
    };
  }

  return {
    reset,
    ingest,
    get index() { return index; },
    get total() { return steps.length; },
    get complete() { return index >= steps.length; },
    current,
  };
}

export function validatePlayedSequence(playedMidis, steps, opts = {}) {
  const v = createSequenceValidator(steps, opts);
  const events = [];
  let now = 1000;
  for (const midi of playedMidis) {
    // Simulate stable note then gap so debounce does not block the next step
    const r = v.ingest({ midi, cents: 0, nowMs: now, scoring: true });
    events.push(r);
    now += (opts.debounceMs ?? DEFAULT_AUDIO_OPTS.debounceMs) + 50;
    if (r.complete) break;
    if (!r.ok && !r.debounced) break;
  }
  return {
    ok: v.complete,
    progress: v.index,
    total: v.total,
    events,
  };
}

/** Stable-note gate: accumulate hold while pitch stays put. */
export function createStableNoteGate(opts = {}) {
  const stableMs = opts.stableMs ?? DEFAULT_AUDIO_OPTS.stableMs;
  const toleranceCents = opts.toleranceCents ?? DEFAULT_AUDIO_OPTS.toleranceCents;
  let heldMidi = null;
  let heldMs = 0;
  let lastTs = null;
  let firedFor = null;

  function reset() {
    heldMidi = null;
    heldMs = 0;
    lastTs = null;
    firedFor = null;
  }

  function update(midi, cents, nowMs, { scoring = true } = {}) {
    if (!scoring || midi == null || !Number.isFinite(midi)) {
      heldMidi = null;
      heldMs = 0;
      lastTs = nowMs;
      return { stable: false, midi: null, progress: 0 };
    }
    const m = Math.round(midi);
    const dt = lastTs == null ? 0 : Math.max(0, Math.min(100, nowMs - lastTs));
    lastTs = nowMs;

    if (heldMidi == null || m !== heldMidi || Math.abs(cents) > toleranceCents) {
      heldMidi = m;
      heldMs = 0;
    } else {
      heldMs += dt;
    }

    const progress = Math.min(1, heldMs / stableMs);
    let released = null;
    if (heldMs >= stableMs && firedFor !== heldMidi) {
      firedFor = heldMidi;
      released = { midi: heldMidi, cents };
    }
    // Allow re-fire after note changes
    if (firedFor != null && m !== firedFor) firedFor = null;

    return {
      stable: !!released,
      midi: heldMidi,
      cents,
      progress,
      released,
      label: heldMidi != null ? NOTE_NAMES_SHARP[((heldMidi % 12) + 12) % 12] + (Math.floor(heldMidi / 12) - 1) : null,
    };
  }

  return { update, reset };
}

export function exerciseAllowsAudioPhysicalScoring(exerciseType) {
  // Exact physical-position exercises cannot be scored by audio alone.
  const blocked = new Set([
    'locate-nearest',
    'locate-every',
    'locate-string',
    'boundary-shift',
    'complete-shape',
    'root-relocation',
  ]);
  return !blocked.has(exerciseType);
}
