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

function publicOwner() {
  if (!activeOwner) return null;
  return {
    id: activeOwner.id,
    label: activeOwner.label,
    kind: activeOwner.kind,
    handle: { id: activeOwner.id, label: activeOwner.label, kind: activeOwner.kind },
  };
}

function notify() {
  const record = publicOwner();
  for (const fn of listeners) {
    try {
      fn(record);
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

function storeOwner(spec) {
  activeOwner = {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    onStop: spec.onStop,
    onPause: spec.onPause,
    canPause: spec.canPause === true,
    unsaved: !!spec.unsaved,
    handlers: spec.handlers || null,
  };
  notify();
  return { id: spec.id, label: spec.label, kind: spec.kind };
}

function endPriorOwner() {
  if (!activeOwner) return;
  if (activeOwner.canPause === true && typeof activeOwner.onPause === 'function') {
    safeCall(activeOwner.onPause, 'onPause');
    return;
  }
  safeCall(activeOwner.onStop, 'onStop');
}

async function claimAfterRecordingPrompt(spec, promptFn) {
  const choice = await promptFn({
    title: 'Unsaved recording',
    choices: ['Save', 'Discard', 'Cancel'],
  });
  if (choice === 'Cancel' || choice == null) return null;
  if (choice === 'Save' && activeOwner.handlers?.save) await activeOwner.handlers.save();
  if (choice === 'Discard' && activeOwner.handlers?.discard) await activeOwner.handlers.discard();
  safeCall(activeOwner.onStop, 'onStop');
  return storeOwner(spec);
}

/**
 * Claim the audio owner slot.
 * Returns a handle, null, or a Promise when an unsaved recording needs a prompt.
 */
export function claimAudio(spec, promptFn) {
  if (!validateClaim(spec)) return null;

  if (activeOwner && activeOwner.id === spec.id) {
    activeOwner.label = spec.label;
    activeOwner.kind = spec.kind;
    activeOwner.onStop = spec.onStop;
    activeOwner.onPause = spec.onPause;
    activeOwner.canPause = spec.canPause === true;
    activeOwner.unsaved = !!spec.unsaved;
    activeOwner.handlers = spec.handlers || null;
    return { id: activeOwner.id, label: activeOwner.label, kind: activeOwner.kind };
  }

  if (activeOwner && activeOwner.kind === 'recording' && activeOwner.unsaved) {
    if (typeof promptFn !== 'function') return null;
    return claimAfterRecordingPrompt(spec, promptFn);
  }

  if (activeOwner) endPriorOwner();
  return storeOwner(spec);
}

/** Release the owner when the handle id matches the active owner. */
export function releaseAudio(handle) {
  if (!handle || !activeOwner || handle.id !== activeOwner.id) return false;
  activeOwner = null;
  notify();
  return true;
}

/** Return the active owner record or null. */
export function getAudioOwner() {
  return publicOwner();
}

/** Alias of getAudioOwner for the active record. */
export function getActiveOwner() {
  return publicOwner();
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
