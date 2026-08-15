let active = null;
const subscribers = new Set();

const STOP_KINDS = new Set(['metronome', 'tone']);

function notifySubscribers() {
  subscribers.forEach((fn) => {
    try {
      fn(getActiveOwner());
    } catch (e) {
      // Keep one bad subscriber from breaking the rest of the chain.
    }
  });
}

function endPriorOwner(prior) {
  if (!prior) return;
  if (STOP_KINDS.has(prior.kind)) {
    prior.onStop?.();
    return;
  }
  if (prior.kind === 'recording') {
    prior.onStop?.();
    return;
  }
  if (prior.kind === 'score' || prior.kind === 'media') {
    if (prior.canPause && prior.onPause) {
      prior.onPause();
    } else {
      prior.onStop?.();
    }
    return;
  }
  prior.onStop?.();
}

export async function claimAudio(spec, promptFn) {
  const { id, label, kind, onStop, onPause, canPause, unsaved, handlers } = spec || {};
  if (!id || !label || !kind || typeof onStop !== 'function') return null;

  if (active && active.kind === 'recording' && active.unsaved) {
    const choice = promptFn
      ? await promptFn({
        title: 'Unsaved recording',
        choices: ['Save', 'Discard', 'Cancel'],
      })
      : 'Cancel';
    if (choice === 'Cancel' || choice == null) return null;
    if (choice === 'Save' && active.handlers?.save) await active.handlers.save();
    if (choice === 'Discard' && active.handlers?.discard) await active.handlers.discard();
  }

  if (active && active.id !== id) {
    endPriorOwner(active);
  }

  active = {
    id,
    label,
    kind,
    onStop,
    onPause,
    canPause,
    unsaved,
    handlers,
  };

  notifySubscribers();
  return { id, label, kind };
}

export function releaseAudio(handle) {
  if (!handle || !active || active.id !== handle.id) return false;
  active = null;
  notifySubscribers();
  return true;
}

export function getActiveOwner() {
  if (!active) return null;
  return { id: active.id, label: active.label, kind: active.kind };
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function stopActive(reason) {
  if (!active) return;
  active.onStop?.();
  active = null;
  notifySubscribers();
}
