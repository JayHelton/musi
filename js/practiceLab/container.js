// The Practice Lab container.
//
// `createPracticeLab(ports)` builds the whole feature from injected ports. It
// owns the trainers, the countdown, the camera takes, the vocal attempts, and
// the warm-up pick. It draws nothing: the files in `ui/` read this object.
//
// There is no session to start or to end. Every tool is ready the moment the
// screen opens, and the lab keeps only what a tool needs on its next visit:
// the takes, the vocal attempts, and the last warm-up picks.
//
// A future micro app supplies its own `defaultPorts()` and mounts this same
// container. No other change is needed.

import { portProblems } from './ports.js';
import { createScheduler } from './engine/scheduler.js';
import { createCountdown } from './engine/countdown.js';
import { newEntry, sortEntries, warmUpPicks } from './model/entries.js';
import { pickWarmUp, warmUpLabel, WARM_UP_COOLDOWN } from './adapters/musiDrumLibrary.js';

/** The recorder caps. The recorder stops itself at either one. */
export const CLIP_CAPS = { durationMs: 5 * 60 * 1000, bytes: 128 * 1024 * 1024 };

/** A take record without its video, so a list never holds every blob. */
function clipSummary(clip) {
  if (!clip) return clip;
  const { blob, ...rest } = clip;
  return rest;
}

/**
 * @param {Object} ports
 * @returns {Object} the Practice Lab service
 */
export function createPracticeLab(ports) {
  const problems = portProblems(ports);
  if (problems.length) {
    throw new Error(`Practice Lab ports are incomplete: ${problems.join('; ')}`);
  }

  const { store, click, audioSession, video, clock, ids, notify } = ports;

  const listeners = new Map();
  const state = {
    ready: false,
    canSave: true,
    /** The trainer that owns the click: '', 'metronome', 'ratio', or 'speed'. */
    activeTrainer: '',
    /** The saved camera takes, oldest first, without their video. */
    clips: [],
    /** The warm-up on offer, or null before the Drums tab asks for one. */
    warmUp: null,
  };

  const scheduler = createScheduler({ click, clock });
  const countdown = createCountdown({ clock });
  let audioHandle = null;
  let readyPromise = null;

  function emit(name, payload) {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`practice lab listener ${name} failed`, e);
        }
      }
    }
  }

  function on(name, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  }

  function nowIso() {
    return new Date(clock.nowMs()).toISOString();
  }

  /* ---- entries ---- */

  async function appendEntry(kind, data = {}) {
    const entry = newEntry({
      id: ids.newId('pl-ent'),
      at: nowIso(),
      kind,
      data,
    });
    await store.appendEntry(entry);
    emit('entry', entry);
    return entry;
  }

  /* ---- audio ownership ---- */

  function claimAudio(label) {
    if (audioHandle) return true;
    audioHandle = audioSession.claim({
      label,
      onStop: () => {
        // Another tool took the click. Drop the handle first, so the stop path
        // does not release a slot that is no longer ours.
        audioHandle = null;
        stopTrainer({ fromOwner: true });
      },
    });
    return !!audioHandle;
  }

  function releaseAudio() {
    if (!audioHandle) return;
    audioSession.release();
    audioHandle = null;
  }

  /* ---- trainers ---- */

  /**
   * Start one plan. The lab holds one active trainer, so starting one stops
   * the other two.
   * @param {{ kind: string, plan: Object, label: string, handlers?: Object }} options
   */
  function startTrainer({ kind, plan, label, handlers = {} }) {
    if (!plan) return false;
    if (state.activeTrainer) stopTrainer({ silent: true });
    if (!claimAudio(label)) {
      notify.toast('Another tool is using the audio. Stop it first.');
      return false;
    }
    click.prime();
    state.activeTrainer = kind;
    emit('trainer', { kind, running: true });
    const started = scheduler.start(plan, {
      ...handlers,
      onEnd: (result) => {
        state.activeTrainer = '';
        releaseAudio();
        emit('trainer', { kind, running: false });
        if (typeof handlers.onEnd === 'function') handlers.onEnd(result);
      },
    });
    if (!started) {
      state.activeTrainer = '';
      releaseAudio();
      emit('trainer', { kind, running: false });
    }
    return started;
  }

  /** Stop the trainer that runs now. */
  function stopTrainer({ fromOwner = false, silent = false } = {}) {
    if (!state.activeTrainer) return;
    const kind = state.activeTrainer;
    state.activeTrainer = '';
    scheduler.stop();
    if (!fromOwner) releaseAudio();
    if (!silent) emit('trainer', { kind, running: false });
  }

  /* ---- takes ---- */

  async function loadClips() {
    const found = await store.listClips();
    state.clips = (Array.isArray(found) ? found : []).map(clipSummary);
    emit('clips', state.clips);
    return state.clips;
  }

  const lab = {
    ports,
    state,
    scheduler,
    countdown,
    on,
    emit,
    nowIso,

    /**
     * Read the saved takes. Call it once per mount. A second call returns the
     * same promise, so two screens can wait on one read.
     */
    init() {
      if (readyPromise) return readyPromise;
      readyPromise = (async () => {
        state.canSave = store.isAvailable();
        await loadClips();
        state.ready = true;
        emit('ready', state);
        return state;
      })();
      return readyPromise;
    },

    /** True once `init()` has read the store. */
    isReady() { return state.ready; },

    /* ---- trainers ---- */

    startTrainer,
    stopTrainer,
    activeTrainer() { return state.activeTrainer; },

    /* ---- vocal practice ---- */

    /**
     * Keep one vocal attempt. The entry names the exercise by id. It never
     * copies the exercise.
     * @param {Object} data the output of `newVocalAttempt`
     */
    async logVocalAttempt(data) {
      return appendEntry('vocal-attempt', data);
    },

    /**
     * The vocal attempts, oldest first.
     * @param {{ exerciseId?: string, limit?: number }} [query]
     */
    async vocalAttempts({ exerciseId = '', limit = 0 } = {}) {
      const all = await store.listEntries({ kind: 'vocal-attempt' });
      const list = sortEntries(Array.isArray(all) ? all : [])
        .filter(entry => !exerciseId || entry.data?.exerciseId === exerciseId);
      if (!limit) return list;
      return list.slice(-Math.max(1, Math.round(limit)));
    },

    /* ---- warm-up ---- */

    /**
     * Pick a warm-up: one groove and one rudiment that the last three picks
     * did not use.
     *
     * The picker reads the saved picks, so the cooldown survives a reload.
     * Every pick goes on record, so a re-roll counts as well.
     *
     * @param {{ random?: () => number }} [options]
     * @returns {Promise<Object>} the picked warm-up, with both records
     */
    async rollWarmUp({ random } = {}) {
      const recent = await store.listEntries({ kind: 'warm-up', limit: WARM_UP_COOLDOWN });
      const picked = pickWarmUp({
        history: warmUpPicks(recent, WARM_UP_COOLDOWN),
        ...(typeof random === 'function' ? { random } : {}),
      });
      await appendEntry('warm-up', {
        beatId: picked.beatId,
        rudimentId: picked.rudimentId,
        label: warmUpLabel(picked),
      });
      state.warmUp = picked;
      emit('warmup', picked);
      return picked;
    },

    /** The warm-up on offer, or null when none is picked yet. */
    warmUp() { return state.warmUp; },

    /** The warm-up on offer, or a fresh pick when none is on offer. */
    async ensureWarmUp(options) {
      if (state.warmUp) return state.warmUp;
      return lab.rollWarmUp(options);
    },

    /* ---- takes ---- */

    clips() { return state.clips; },

    /** Save one recorded take. */
    async saveClip({ blob, mime, durationMs, size }) {
      if (!blob) return null;
      const clip = {
        id: ids.newId('pl-clip'),
        blob,
        mime: mime || blob.type || 'video/webm',
        durationMs: Math.round(Number(durationMs) || 0),
        size: Number(size) || blob.size || 0,
        createdAt: nowIso(),
      };
      const saved = await store.saveClip(clip);
      if (!saved) {
        notify.toast('The take could not be saved on this device.');
        return null;
      }
      state.clips = [...state.clips, clipSummary(clip)];
      emit('clips', state.clips);
      return clipSummary(clip);
    },

    async getClip(id) { return store.getClip(id); },

    /** Delete one take. */
    async deleteClip(id) {
      await store.deleteClip(id);
      state.clips = state.clips.filter(c => c.id !== id);
      emit('clips', state.clips);
      return true;
    },

    /** Stop every moving part. The tool calls this when the player leaves. */
    stopAll() {
      stopTrainer();
      countdown.stop();
      video.close();
      click.stop();
    },
  };

  return lab;
}
