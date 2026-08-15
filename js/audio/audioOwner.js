/**
 * Single long-running audio owner registry.
 */

const VALID_KINDS = new Set(['metronome', 'tone', 'score', 'recording', 'media']);

let activeOwner = null;
const listeners = new Set();

function safeCall(fn, label) {
  if (typeof fn !== 'function') return;
  try {
    fn();
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`audioOwner ${label} callback failed`, e);
    }
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(activeOwner);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('audioOwner subscribe callback failed', e);
      }
    }
  }
}

function validateClaim(args) {
  if (!args || typeof args !== 'object') return false;
  if (!args.id || !args.label || !args.kind) return false;
  if (!VALID_KINDS.has(args.kind)) return false;
  if (typeof args.onStop !== 'function') return false;
  return true;
}

/**
 * Claim the audio owner slot.
 * @returns {{ id: string, label: string, kind: string } | null}
 */
export function claimAudio({ id, label, kind, onStop, onPause, canPause }) {
  if (!validateClaim({ id, label, kind, onStop })) return null;

  if (activeOwner && activeOwner.id === id) {
    activeOwner.label = label;
    activeOwner.kind = kind;
    activeOwner.onStop = onStop;
    activeOwner.onPause = onPause;
    activeOwner.canPause = canPause === true;
    return { id: activeOwner.id, label: activeOwner.label, kind: activeOwner.kind };
  }

  if (activeOwner) {
    if (activeOwner.canPause === true && typeof activeOwner.onPause === 'function') {
      safeCall(activeOwner.onPause, 'onPause');
    } else {
      safeCall(activeOwner.onStop, 'onStop');
    }
  }

  activeOwner = {
    id,
    label,
    kind,
    onStop,
    onPause,
    canPause: canPause === true,
  };

  notify();
  return { id, label, kind };
}

/** Release the owner when the handle id matches the active owner. */
export function releaseAudio(handle) {
  if (!handle || !activeOwner || handle.id !== activeOwner.id) return;
  activeOwner = null;
  notify();
}

/** Return the active owner record or null. */
export function getAudioOwner() {
  return activeOwner ? { ...activeOwner, handle: { id: activeOwner.id, label: activeOwner.label, kind: activeOwner.kind } } : null;
}

/** Alias of getAudioOwner for the active record. */
export function getActiveOwner() {
  return getAudioOwner();
}

/** Subscribe to owner transitions. Returns an unsubscribe function. */
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Stop the active owner and clear the slot. */
export function stopActive(reason) {
  if (!activeOwner) return;
  safeCall(activeOwner.onStop, 'onStop');
  activeOwner = null;
  notify();
}

/** Clear state for Node tests. */
export function __resetAudioOwnerForTests() {
  activeOwner = null;
  listeners.clear();
}
