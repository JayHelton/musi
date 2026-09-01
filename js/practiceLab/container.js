// The Practice Lab container.
//
// `createPracticeLab(ports)` builds the whole feature from injected ports. It
// owns the session state, the catalog, the log, the scheduler, and the
// countdown. It draws nothing: the files in `ui/` read this object.
//
// A future micro app supplies its own `defaultPorts()` and mounts this same
// container. No other change is needed.

import { portProblems } from './ports.js';
import { createScheduler } from './engine/scheduler.js';
import { createCountdown } from './engine/countdown.js';
import {
  mergeCatalog,
  addInstrument,
  addTechnique,
  removeInstrument,
  removeTechnique,
  instrumentsOf,
  techniquesOf,
} from './model/catalog.js';
import {
  newSession,
  newEntry,
  newWarmUp,
  rollUpTotals,
  sortEntries,
  SESSION_ENDED,
} from './model/session.js';
import { pickWarmUp, warmUpHistory, warmUpLabel } from './adapters/musiDrumLibrary.js';

/** The recorder caps. The recorder stops itself at either one. */
export const CLIP_CAPS = { durationMs: 5 * 60 * 1000, bytes: 128 * 1024 * 1024 };

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
    catalog: mergeCatalog(null),
    session: null,
    entries: [],
    clips: [],
    /** The trainer that owns the click: '', 'metronome', 'ratio', or 'speed'. */
    activeTrainer: '',
    /** True when the open session comes from an earlier visit. */
    resumed: false,
    /** The warm-up the setup screen offers, before a session opens. */
    warmUp: null,
  };

  const scheduler = createScheduler({ click, clock });
  const countdown = createCountdown({ clock });
  let audioHandle = null;

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

  function refreshTotals() {
    if (!state.session) return;
    state.session.totals = rollUpTotals(state.entries);
  }

  /* ---- catalog ---- */

  async function loadCatalog() {
    const stored = await store.getCatalog();
    state.catalog = mergeCatalog(stored);
    return state.catalog;
  }

  async function persistCatalog() {
    state.catalog = { ...state.catalog, updatedAt: nowIso() };
    await store.saveCatalog(state.catalog);
    emit('catalog', state.catalog);
    return state.catalog;
  }

  /* ---- log ---- */

  async function appendEntry(kind, data = {}) {
    if (!state.session) return null;
    const entry = newEntry({
      id: ids.newId('pl-ent'),
      sessionId: state.session.id,
      at: nowIso(),
      kind,
      data,
    });
    state.entries = sortEntries([...state.entries, entry]);
    refreshTotals();
    emit('log', { entry, entries: state.entries });
    await store.appendEntry(entry);
    if (state.session) await store.endSession(state.session.id, { totals: state.session.totals });
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

  /* ---- session ---- */

  async function loadSession(session) {
    state.session = session ? { ...session } : null;
    state.entries = session ? sortEntries(await store.listEntries(session.id)) : [];
    state.clips = session ? await store.listClips(session.id) : [];
    refreshTotals();
    emit('session', state.session);
    emit('log', { entry: null, entries: state.entries });
    return state.session;
  }

  /** Write the session record at the start, not at the end. */
  async function startSession({ instrument, technique, target, warmUp }) {
    const picked = newWarmUp(warmUp);
    const session = newSession({
      id: ids.newId('pl-sess'),
      at: nowIso(),
      instrument,
      technique,
      target,
      warmUp: picked,
    });
    await store.createSession(session);
    state.resumed = false;
    state.session = session;
    state.entries = [];
    state.clips = [];
    state.warmUp = null;
    emit('session', state.session);
    await appendEntry('session-start', {
      instrument: session.instrument,
      technique: session.technique,
      target: session.target,
      ...(picked ? { warmUp: warmUpLabel(picked) } : {}),
    });
    return session;
  }

  /* ---- vocal practice ---- */

  /** The session that is opening now, so two fast reports open only one. */
  let sessionOpening = null;

  /**
   * Open a session when none is open, so a vocal attempt always lands in the
   * one history model. The labels describe the vocal mode.
   * @param {{ instrument: string, technique: string, target: string }} labels
   */
  async function ensureSession({ instrument, technique, target }) {
    if (state.session) return state.session;
    if (!sessionOpening) {
      sessionOpening = startSession({ instrument, technique, target })
        .finally(() => { sessionOpening = null; });
    }
    return sessionOpening;
  }

  /**
   * Write one vocal attempt into the log of the open session.
   *
   * The entry names the exercise by id. It never copies the exercise.
   *
   * @param {Object} data the output of `newVocalAttempt`
   * @param {{ instrument?: string, technique?: string, target?: string }} [labels]
   *   the session to open when none is open
   */
  async function logVocalAttempt(data, labels = {}) {
    await ensureSession({
      instrument: labels.instrument || 'Voice',
      technique: labels.technique || 'Vocal',
      target: labels.target || 'Vocal practice',
    });
    return appendEntry('vocal-attempt', data);
  }

  /**
   * The vocal attempts of every session, oldest first.
   * @param {{ exerciseId?: string, limit?: number }} [query]
   */
  async function vocalAttempts({ exerciseId = '', limit = 0 } = {}) {
    const all = await store.listAllEntries({ kind: 'vocal-attempt' });
    const list = (Array.isArray(all) ? all : [])
      .filter(entry => !exerciseId || entry.data?.exerciseId === exerciseId);
    if (!limit) return list;
    return list.slice(-Math.max(1, Math.round(limit)));
  }

  return {
    ports,
    state,
    scheduler,
    countdown,
    on,
    emit,
    nowIso,

    /** Load the catalog and the open session. Call this once per mount. */
    async init() {
      state.canSave = store.isAvailable();
      await loadCatalog();
      const open = await store.listSessions({ status: 'active' });
      const found = Array.isArray(open) && open.length ? open[0] : null;
      state.resumed = !!found;
      if (found) await loadSession(found);
      state.ready = true;
      emit('ready', state);
      return state;
    },

    instruments() { return instrumentsOf(state.catalog); },
    techniques(instrumentId) { return techniquesOf(state.catalog, instrumentId); },

    async addInstrument(label) {
      const { catalog, entry } = addInstrument(state.catalog, label);
      state.catalog = catalog;
      await persistCatalog();
      return entry;
    },
    async removeInstrument(id) {
      state.catalog = removeInstrument(state.catalog, id);
      await persistCatalog();
    },
    async addTechnique(instrumentId, label) {
      const { catalog, entry } = addTechnique(state.catalog, instrumentId, label);
      state.catalog = catalog;
      await persistCatalog();
      return entry;
    },
    async removeTechnique(instrumentId, techniqueId) {
      state.catalog = removeTechnique(state.catalog, instrumentId, techniqueId);
      await persistCatalog();
    },

    /**
     * Offer the warm-up of the next session: one groove and one rudiment that
     * the last three sessions did not use.
     *
     * The picker reads the saved sessions, so the cooldown survives a reload.
     * Call it again to re-roll.
     *
     * @param {{ random?: () => number }} [options]
     * @returns {Promise<Object>} the picked warm-up, with both records
     */
    async rollWarmUp({ random } = {}) {
      const sessions = await store.listSessions();
      const picked = pickWarmUp({
        history: warmUpHistory(sessions),
        ...(typeof random === 'function' ? { random } : {}),
      });
      state.warmUp = picked;
      emit('warmup', picked);
      return picked;
    },

    /** The warm-up on offer, or null when none is picked yet. */
    warmUp() { return state.warmUp; },

    /** Drop the warm-up on offer. The next session picks a fresh one. */
    clearWarmUp() {
      state.warmUp = null;
      emit('warmup', null);
    },

    /** Write the session record at the start, not at the end. */
    startSession,

    /** Log that the warm-up of the open session is done. */
    async completeWarmUp() {
      const picked = state.session?.warmUp;
      if (!picked) return null;
      return appendEntry('warm-up-done', {
        beatId: picked.beatId,
        rudimentId: picked.rudimentId,
        label: warmUpLabel(picked),
      });
    },

    /** End the open session. The click, the timer, and the camera stop first. */
    async endSession() {
      if (!state.session) return null;
      stopTrainer();
      countdown.stop();
      video.close();
      const totals = rollUpTotals(state.entries);
      await appendEntry('session-end', totals);
      const patch = { endedAt: nowIso(), status: SESSION_ENDED, totals };
      await store.endSession(state.session.id, patch);
      const ended = { ...state.session, ...patch };
      state.resumed = false;
      state.session = null;
      state.entries = [];
      state.clips = [];
      emit('session', null);
      return ended;
    },

    /** Continue the open session after a reload. */
    hasOpenSession() { return !!state.session; },
    session() { return state.session; },
    entries() { return state.entries; },
    clips() { return state.clips; },

    appendEntry,
    logVocalAttempt,
    vocalAttempts,
    ensureSession,
    async addNote(text) {
      const clean = String(text || '').trim();
      if (!clean) return null;
      return appendEntry('note', { text: clean });
    },

    startTrainer,
    stopTrainer,
    activeTrainer() { return state.activeTrainer; },

    /** Save one recorded clip and attach it to the session. */
    async saveClip({ blob, mime, durationMs, size }) {
      if (!state.session || !blob) return null;
      const clip = {
        id: ids.newId('pl-clip'),
        sessionId: state.session.id,
        entryId: '',
        blob,
        mime: mime || blob.type || 'video/webm',
        durationMs: Math.round(Number(durationMs) || 0),
        size: Number(size) || blob.size || 0,
        createdAt: nowIso(),
      };
      const entry = await appendEntry('clip-saved', {
        clipId: clip.id,
        durationMs: clip.durationMs,
        size: clip.size,
      });
      clip.entryId = entry ? entry.id : '';
      const saved = await store.saveClip(clip);
      if (!saved) {
        notify.toast('The clip could not be saved on this device.');
        return null;
      }
      state.clips = [...state.clips, clip];
      emit('clips', state.clips);
      return clip;
    },

    async getClip(id) { return store.getClip(id); },

    /**
     * Delete a clip and mark its log entry as removed. The clip may belong to
     * the open session or to a session the history view holds.
     */
    async deleteClip(id) {
      const clip = state.clips.find(c => c.id === id) || await store.getClip(id);
      await store.deleteClip(id);
      if (clip?.entryId) await store.updateEntry(clip.entryId, { removed: true });

      const ownerId = clip?.sessionId || '';
      const isOpen = !!state.session && ownerId === state.session.id;
      if (isOpen) {
        state.clips = state.clips.filter(c => c.id !== id);
        if (clip?.entryId) {
          state.entries = state.entries.map(e => (
            e.id === clip.entryId ? { ...e, data: { ...e.data, removed: true } } : e
          ));
        }
        refreshTotals();
        await store.endSession(state.session.id, { totals: state.session.totals });
        emit('clips', state.clips);
        emit('log', { entry: null, entries: state.entries });
      } else if (ownerId) {
        // A past session keeps its own cached totals. Roll them up again.
        const totals = rollUpTotals(await store.listEntries(ownerId));
        await store.endSession(ownerId, { totals });
      }
      return true;
    },

    /* ---- history ---- */

    async listSessions() { return store.listSessions(); },
    async readSession(id) {
      const session = await store.getSession(id);
      if (!session) return null;
      const entries = sortEntries(await store.listEntries(id));
      const clips = await store.listClips(id);
      return { session, entries, clips };
    },
    async deleteSession(id) {
      if (state.session && state.session.id === id) {
        stopTrainer();
        countdown.stop();
        state.session = null;
        state.entries = [];
        state.clips = [];
        emit('session', null);
      }
      return store.deleteSession(id);
    },

    /** Stop every moving part. The tool calls this when the player leaves. */
    stopAll() {
      stopTrainer();
      countdown.stop();
      video.close();
      click.stop();
    },
  };
}
