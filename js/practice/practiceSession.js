// One practice session at a time: session clock, global metronome ownership, loop
// state, active work item, and attempt logging. A new session always ends the
// previous session first so two metronomes never run together.
//
// Metronome ownership uses an internal driver seam. The default browser driver talks
// to js/metronome.js when DOM and audio exist. In Node tests a state-only driver
// tracks values without audio. Tests inject a fake driver via
// __setMetronomeDriverForTests.

import { getSetting, saveSetting } from '../persistence.js';
import { pushOverride, popOverride } from '../core/musicContext.js';
import { logAttempt } from '../progress/progressLog.js';

export const SESSION_STORAGE_KEY = 'practice.session';

const OVERRIDE_ID = 'practice-session';
const TICK_MS = 250;
const RESTORE_MAX_MS = 12 * 3600000;
const BPM_MIN = 30;
const BPM_MAX = 300;
const BEATS_MIN = 1;
const BEATS_MAX = 12;
const SUBDIV_IDS = new Set(['quarter', 'eighth', 'triplet', 'sixteenth']);

const SOURCE_TYPES = new Set([
  'free',
  'routine-session',
  'workbook',
  'exercise',
  'score',
]);

let session = null;
let tickTimer = null;
let subscribers = new Set();
let timerCompleteEmitted = false;
let customDriverInjected = false;
let metroDriver = null;
let timeSource = defaultTimeSource;
let phaseExhaustedNotified = false;
let lastPhaseIndex = -1;

function defaultTimeSource() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function sessionId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ps-${Date.now().toString(36)}-${rand}`;
}

function clampBpm(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(n)));
}

function clampBeats(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(n)));
}

function normalizeSubdiv(value, fallback = 'quarter') {
  return typeof value === 'string' && SUBDIV_IDS.has(value) ? value : fallback;
}

function normalizeMetronome(raw, fallback = {}) {
  const base = {
    bpm: 120,
    subdivision: 'quarter',
    beats: 4,
    accentFirst: true,
    playing: false,
  };
  const src = raw && typeof raw === 'object' ? raw : {};
  const subdiv = normalizeSubdiv(src.subdivision ?? src.subdiv, fallback.subdivision ?? base.subdivision);
  return {
    bpm: clampBpm(src.bpm, fallback.bpm ?? base.bpm),
    subdivision: subdiv,
    beats: clampBeats(src.beats, fallback.beats ?? base.beats),
    accentFirst: src.accentFirst == null
      ? (fallback.accentFirst ?? base.accentFirst)
      : !!src.accentFirst,
    playing: !!src.playing,
  };
}

function normalizeTempoPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const phases = Array.isArray(raw.phases) ? raw.phases : [];
  const normalized = [];
  for (const p of phases) {
    if (!p || typeof p !== 'object') continue;
    const seconds = Math.max(1, Math.min(180 * 60, Math.round(Number(p.seconds))));
    const bpm = clampBpm(p.bpm, null);
    if (!Number.isFinite(seconds) || bpm == null) continue;
    normalized.push({
      seconds,
      bpm,
      subdiv: normalizeSubdiv(p.subdiv ?? p.subdivision),
    });
  }
  if (!normalized.length) return null;
  return { phases: normalized, loop: !!raw.loop };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const targetType = typeof raw.targetType === 'string' ? raw.targetType : '';
  const targetId = typeof raw.targetId === 'string' ? raw.targetId : '';
  if (!id || !targetType || !targetId) return null;
  return {
    id,
    label: typeof raw.label === 'string' ? raw.label : '',
    targetType,
    targetId,
    workbookId: typeof raw.workbookId === 'string' ? raw.workbookId : '',
    workbookName: typeof raw.workbookName === 'string' ? raw.workbookName : '',
    entryId: typeof raw.entryId === 'string' ? raw.entryId : '',
  };
}

function normalizeLoop(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const enabled = raw.enabled != null ? !!raw.enabled : true;
  const out = { enabled };
  if (raw.startMs != null) out.startMs = Math.max(0, Math.floor(Number(raw.startMs)));
  if (raw.endMs != null) out.endMs = Math.max(0, Math.floor(Number(raw.endMs)));
  if (raw.startBeat != null) out.startBeat = Number(raw.startBeat);
  if (raw.endBeat != null) out.endBeat = Number(raw.endBeat);
  return out;
}

function copySessionState(s) {
  return {
    id: s.id,
    sourceType: s.sourceType,
    sourceId: s.sourceId,
    sourceLabel: s.sourceLabel,
    routineId: s.routineId,
    startedAt: s.startedAt,
    elapsedMs: s.elapsedMs,
    timerTargetMs: s.timerTargetMs,
    metronome: { ...s.metronome },
    tempoPlan: s.tempoPlan ? {
      loop: s.tempoPlan.loop,
      phases: s.tempoPlan.phases.map((p) => ({ ...p })),
    } : null,
    loop: s.loop ? { ...s.loop } : null,
    activeItemId: s.activeItemId,
    items: s.items.map((it) => ({ ...it })),
    attemptIds: [...s.attemptIds],
    notes: s.notes,
    status: s.status,
  };
}

function createStateOnlyDriver(initial = {}) {
  const state = normalizeMetronome(initial);
  return {
    readState() { return { ...state }; },
    setBpm(bpm) { state.bpm = clampBpm(bpm, state.bpm); },
    setSubdiv(subdiv) { state.subdivision = normalizeSubdiv(subdiv, state.subdivision); },
    setBeats(beats) { state.beats = clampBeats(beats, state.beats); },
    setAccentFirst(value) { state.accentFirst = !!value; },
    start() { state.playing = true; },
    stop() { state.playing = false; },
    isPlaying() { return state.playing; },
    applyConfig(patch) {
      if (patch.bpm != null) this.setBpm(patch.bpm);
      if (patch.subdivision != null) this.setSubdiv(patch.subdivision);
      if (patch.subdiv != null) this.setSubdiv(patch.subdiv);
      if (patch.beats != null) this.setBeats(patch.beats);
      if (patch.accentFirst != null) this.setAccentFirst(patch.accentFirst);
      if (patch.playing === true) this.start();
      if (patch.playing === false) this.stop();
    },
    syncFrom(statePatch) { this.applyConfig(statePatch); },
  };
}

function createBrowserMetroDriver(stateDriver) {
  let mod = null;
  let loading = null;

  function ensureModule() {
    if (mod) return mod;
    if (!loading) {
      loading = import('../metronome.js').then((m) => {
        mod = m;
        return m;
      });
    }
    return loading;
  }

  function applyToMetro(patch) {
    if (!mod) return;
    const { metro, setBpm, startMetronome, stopMetronome } = mod;
    if (patch.bpm != null) setBpm(patch.bpm, true);
    if (patch.subdivision != null || patch.subdiv != null) {
      metro.subdiv = normalizeSubdiv(patch.subdivision ?? patch.subdiv, metro.subdiv);
    }
    if (patch.beats != null) {
      metro.tsNum = clampBeats(patch.beats, metro.tsNum);
      while (metro.accents.length < metro.tsNum) metro.accents.push(false);
      metro.accents.length = metro.tsNum;
      if (!metro.accents.some(Boolean)) metro.accents[0] = true;
    }
    if (patch.accentFirst != null) {
      while (metro.accents.length < metro.tsNum) metro.accents.push(false);
      metro.accents[0] = !!patch.accentFirst;
    }
    if (patch.playing === true && !metro.playing) startMetronome();
    if (patch.playing === false && metro.playing) stopMetronome();
  }

  function readFromMetro() {
    if (!mod) return stateDriver.readState();
    const { metro } = mod;
    return {
      bpm: metro.bpm,
      subdivision: normalizeSubdiv(metro.subdiv),
      beats: metro.tsNum,
      accentFirst: metro.accents[0] != null ? !!metro.accents[0] : true,
      playing: metro.playing,
    };
  }

  ensureModule().then(() => {
    const live = readFromMetro();
    stateDriver.syncFrom(live);
    applyToMetro(stateDriver.readState());
  }).catch(() => {});

  return {
    readState() {
      if (mod) return readFromMetro();
      return stateDriver.readState();
    },
    setBpm(bpm) {
      stateDriver.setBpm(bpm);
      applyToMetro({ bpm: stateDriver.readState().bpm });
    },
    setSubdiv(subdiv) {
      stateDriver.setSubdiv(subdiv);
      applyToMetro({ subdivision: stateDriver.readState().subdivision });
    },
    setBeats(beats) {
      stateDriver.setBeats(beats);
      applyToMetro({ beats: stateDriver.readState().beats });
    },
    setAccentFirst(value) {
      stateDriver.setAccentFirst(value);
      applyToMetro({ accentFirst: stateDriver.readState().accentFirst });
    },
    start() {
      stateDriver.start();
      applyToMetro({ playing: true });
    },
    stop() {
      stateDriver.stop();
      applyToMetro({ playing: false });
    },
    isPlaying() {
      if (mod) return mod.metro.playing;
      return stateDriver.isPlaying();
    },
    applyConfig(patch) {
      stateDriver.applyConfig(patch);
      applyToMetro(patch);
    },
    syncFrom(patch) {
      stateDriver.syncFrom(patch);
      applyToMetro(patch);
    },
  };
}

function getMetroDriver() {
  if (metroDriver) return metroDriver;
  const stateOnly = createStateOnlyDriver();
  if (typeof window !== 'undefined' && !customDriverInjected) {
    metroDriver = createBrowserMetroDriver(stateOnly);
  } else {
    metroDriver = stateOnly;
  }
  return metroDriver;
}

function phasesTotalSeconds(phases) {
  return phases.reduce((sum, p) => sum + p.seconds, 0);
}

function phaseIndexForElapsed(elapsedSec, phases) {
  let acc = 0;
  for (let i = 0; i < phases.length; i++) {
    acc += phases[i].seconds;
    if (elapsedSec < acc - 1e-6) return i;
  }
  return phases.length - 1;
}

function elapsedSecFromMs(ms) {
  return ms / 1000;
}

function applyTempoPlanTick() {
  if (!session || !session.tempoPlan || session.status !== 'running') return;
  const { phases, loop } = session.tempoPlan;
  const total = phasesTotalSeconds(phases);
  if (total <= 0) return;

  let elapsedSec = elapsedSecFromMs(session.elapsedMs);
  if (loop && total > 0) {
    elapsedSec = elapsedSec % total;
  } else if (elapsedSec >= total - 1e-6) {
    if (!phaseExhaustedNotified) {
      phaseExhaustedNotified = true;
      const driver = getMetroDriver();
      if (driver.isPlaying()) driver.stop();
      session.metronome.playing = false;
      notify('metronome');
    }
    return;
  }

  const idx = phaseIndexForElapsed(elapsedSec, phases);
  const phase = phases[idx];
  const driver = getMetroDriver();

  if (idx !== lastPhaseIndex) {
    lastPhaseIndex = idx;
    driver.setBpm(phase.bpm);
    driver.setSubdiv(phase.subdiv);
    session.metronome.bpm = phase.bpm;
    session.metronome.subdivision = phase.subdiv;
    notify('metronome');
  } else {
    const live = driver.readState();
    if (live.bpm !== phase.bpm) {
      driver.setBpm(phase.bpm);
      session.metronome.bpm = phase.bpm;
    }
    if (live.subdivision !== phase.subdiv) {
      driver.setSubdiv(phase.subdiv);
      session.metronome.subdivision = phase.subdiv;
    }
  }
}

function stopTickTimer() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTickTimer() {
  stopTickTimer();
  tickTimer = setInterval(() => tickClock('tick'), TICK_MS);
}

function sampleElapsedMs() {
  if (!session || session.status !== 'running') return session ? session.elapsedMs : 0;
  return session.clockAtAnchor + (timeSource() - session.clockAnchor);
}

function sampleItemElapsedMs() {
  if (!session) return 0;
  if (session.status !== 'running') return session.itemAccumulatedMs;
  return session.itemAccumulatedMs + (timeSource() - session.itemClockAnchor);
}

function tickClock(reason = 'tick') {
  if (!session || session.status !== 'running') return;

  session.elapsedMs = sampleElapsedMs();

  if (session.timerTargetMs != null) {
    const remaining = session.timerTargetMs - (session.elapsedMs - session.timerStartElapsedMs);
    if (remaining <= 0 && !timerCompleteEmitted) {
      timerCompleteEmitted = true;
      notify('timer-complete');
    }
  }

  applyTempoPlanTick();
  notify(reason);
}

function notify(reason) {
  if (!session) return;
  const state = copySessionState(session);
  const snapshot = [...subscribers];
  for (const fn of snapshot) {
    try {
      fn(state, { reason });
    } catch (_) {
      // Isolate throwing subscribers.
    }
  }
}

function flushSnapshot() {
  if (!session) {
    saveSetting(SESSION_STORAGE_KEY, null);
    return;
  }
  const snap = {
    id: session.id,
    sourceType: session.sourceType,
    sourceId: session.sourceId,
    sourceLabel: session.sourceLabel,
    routineId: session.routineId,
    startedAt: session.startedAt,
    elapsedMs: sampleElapsedMs(),
    timerTargetMs: session.timerTargetMs,
    metronome: { ...session.metronome },
    tempoPlan: session.tempoPlan,
    activeItemId: session.activeItemId,
    items: session.items.map((it) => ({ ...it })),
    attemptIds: [...session.attemptIds],
    notes: session.notes,
    status: session.status,
    savedAt: new Date().toISOString(),
  };
  saveSetting(SESSION_STORAGE_KEY, snap);
}

function clearSnapshot() {
  saveSetting(SESSION_STORAGE_KEY, null);
}

function pushMusicOverride() {
  if (!session) return;
  if (session.sourceType !== 'routine-session' && session.sourceType !== 'workbook') return;
  pushOverride(OVERRIDE_ID, {
    tempoBpm: session.metronome.bpm,
  });
}

function popMusicOverride() {
  popOverride(OVERRIDE_ID);
}

function syncMetronomeToDriver(playingOverride) {
  const driver = getMetroDriver();
  const cfg = { ...session.metronome };
  if (playingOverride != null) cfg.playing = playingOverride;
  driver.applyConfig(cfg);
  const live = driver.readState();
  session.metronome.bpm = live.bpm;
  session.metronome.subdivision = live.subdivision;
  session.metronome.beats = live.beats;
  session.metronome.accentFirst = live.accentFirst;
  session.metronome.playing = live.playing;
}

function resetItemClock() {
  session.itemAccumulatedMs = 0;
  session.itemClockAnchor = timeSource();
}

function setActiveItemInternal(itemId, reason = 'item') {
  if (!session) return false;
  if (!session.items.some((it) => it.id === itemId)) return false;
  if (session.status === 'running') {
    session.itemAccumulatedMs = sampleItemElapsedMs();
  }
  session.activeItemId = itemId;
  resetItemClock();
  notify(reason);
  flushSnapshot();
  return true;
}

function endSessionInternal() {
  if (!session) return;

  stopTickTimer();
  const driver = getMetroDriver();
  if (driver.isPlaying()) driver.stop();

  popMusicOverride();
  session.status = 'ended';
  session.metronome.playing = false;
  notify('end');
  clearSnapshot();
  session = null;
  timerCompleteEmitted = false;
  phaseExhaustedNotified = false;
  lastPhaseIndex = -1;
}

export function startSession(config = {}) {
  if (session && session.status !== 'ended') {
    endSessionInternal();
  }

  const sourceType = typeof config.sourceType === 'string' ? config.sourceType : 'free';
  if (!SOURCE_TYPES.has(sourceType)) {
    throw new Error(`Unknown sourceType: ${sourceType}`);
  }

  const items = Array.isArray(config.items)
    ? config.items.map(normalizeItem).filter(Boolean)
    : [];
  const activeItemId = items.length ? items[0].id : null;
  const driver = getMetroDriver();
  const liveMetro = driver.readState();

  const metronome = normalizeMetronome(config.metronome, liveMetro);
  const tempoPlan = normalizeTempoPlan(config.metronome?.tempoPlan ?? config.tempoPlan);

  const now = timeSource();
  session = {
    id: sessionId(),
    sourceType,
    sourceId: typeof config.sourceId === 'string' ? config.sourceId : '',
    sourceLabel: typeof config.sourceLabel === 'string' ? config.sourceLabel : '',
    routineId: typeof config.routineId === 'string' ? config.routineId : '',
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
    timerTargetMs: config.timerTargetMs != null
      ? Math.max(0, Math.floor(Number(config.timerTargetMs)))
      : null,
    metronome,
    tempoPlan,
    loop: null,
    activeItemId,
    items,
    attemptIds: [],
    notes: typeof config.notes === 'string' ? config.notes : '',
    status: 'running',
    clockAnchor: now,
    clockAtAnchor: 0,
    itemAccumulatedMs: 0,
    itemClockAnchor: now,
    timerStartElapsedMs: 0,
  };

  timerCompleteEmitted = false;
  phaseExhaustedNotified = false;
  lastPhaseIndex = -1;

  if (tempoPlan && tempoPlan.phases.length) {
    const first = tempoPlan.phases[0];
    metronome.bpm = first.bpm;
    metronome.subdivision = first.subdiv;
    session.metronome = metronome;
    lastPhaseIndex = 0;
  }

  syncMetronomeToDriver(metronome.playing);
  pushMusicOverride();
  startTickTimer();
  notify('start');
  flushSnapshot();
  return copySessionState(session);
}

export function getSession() {
  if (!session || session.status === 'ended') return null;
  if (session.status === 'running') {
    session.elapsedMs = sampleElapsedMs();
  }
  return copySessionState(session);
}

export function endSession() {
  endSessionInternal();
}

export function pauseSession() {
  if (!session || session.status !== 'running') return;
  const now = timeSource();
  session.elapsedMs = session.clockAtAnchor + (now - session.clockAnchor);
  session.itemAccumulatedMs = sampleItemElapsedMs();
  session.status = 'paused';

  const driver = getMetroDriver();
  if (driver.isPlaying()) driver.stop();

  stopTickTimer();
  notify('pause');
  flushSnapshot();
}

export function resumeSession() {
  if (!session || session.status !== 'paused') return;
  const now = timeSource();
  session.status = 'running';
  session.clockAnchor = now;
  session.clockAtAnchor = session.elapsedMs;
  session.itemClockAnchor = now;

  if (session.metronome.playing) {
    const driver = getMetroDriver();
    driver.start();
    session.metronome.playing = driver.isPlaying();
  }

  startTickTimer();
  notify('resume');
  flushSnapshot();
}

export function setActiveItem(itemId) {
  if (!session) return;
  if (!session.items.some((it) => it.id === itemId)) return;
  setActiveItemInternal(itemId, 'item');
}

export function nextItem() {
  if (!session || !session.activeItemId) return;
  const idx = session.items.findIndex((it) => it.id === session.activeItemId);
  if (idx < 0 || idx >= session.items.length - 1) return;
  setActiveItemInternal(session.items[idx + 1].id, 'item');
}

export function previousItem() {
  if (!session || !session.activeItemId) return;
  const idx = session.items.findIndex((it) => it.id === session.activeItemId);
  if (idx <= 0) return;
  setActiveItemInternal(session.items[idx - 1].id, 'item');
}

export function restartItem() {
  if (!session || !session.activeItemId) return;
  resetItemClock();
  notify('restart-item');
  flushSnapshot();
}

export function setMetronome(patch = {}) {
  if (!session || !patch || typeof patch !== 'object') return;
  const driver = getMetroDriver();

  if (patch.bpm != null) {
    session.metronome.bpm = clampBpm(patch.bpm, session.metronome.bpm);
    driver.setBpm(session.metronome.bpm);
  }
  if (patch.subdivision != null) {
    session.metronome.subdivision = normalizeSubdiv(patch.subdivision, session.metronome.subdivision);
    driver.setSubdiv(session.metronome.subdivision);
  }
  if (patch.beats != null) {
    session.metronome.beats = clampBeats(patch.beats, session.metronome.beats);
    driver.setBeats(session.metronome.beats);
  }
  if (patch.accentFirst != null) {
    session.metronome.accentFirst = !!patch.accentFirst;
    driver.setAccentFirst(session.metronome.accentFirst);
  }
  if (patch.playing != null) {
    session.metronome.playing = !!patch.playing;
    if (session.metronome.playing && session.status === 'running') driver.start();
    else driver.stop();
  }

  const live = driver.readState();
  session.metronome.playing = live.playing;
  notify('metronome');
  flushSnapshot();
}

export function toggleMetronome() {
  if (!session) return;
  setMetronome({ playing: !session.metronome.playing });
}

export function setLoop(loop) {
  if (!session) return;
  session.loop = normalizeLoop(loop);
  notify('loop');
  flushSnapshot();
}

export function setNotes(text) {
  if (!session) return;
  session.notes = typeof text === 'string' ? text : '';
  notify('notes');
  flushSnapshot();
}

export function setTimerTarget(ms) {
  if (!session) return;
  session.timerTargetMs = ms != null ? Math.max(0, Math.floor(Number(ms))) : null;
  session.timerStartElapsedMs = sampleElapsedMs();
  timerCompleteEmitted = false;
  notify('tick');
  flushSnapshot();
}

export function recordAttempt(partial = {}) {
  if (!session) throw new Error('No active practice session');
  const active = session.items.find((it) => it.id === session.activeItemId);
  const durationMs = sampleItemElapsedMs();
  const startedAt = new Date(Date.now() - durationMs).toISOString();

  const attempt = logAttempt({
    ...partial,
    targetType: partial.targetType ?? active?.targetType,
    targetId: partial.targetId ?? active?.targetId,
    bpm: partial.bpm ?? session.metronome.bpm,
    durationMs: partial.durationMs ?? durationMs,
    startedAt: partial.startedAt ?? startedAt,
  });

  session.attemptIds.push(attempt.id);
  notify('attempt');
  flushSnapshot();
  return attempt;
}

export function subscribeSession(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function restoreSession() {
  const raw = getSetting(SESSION_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') {
    clearSnapshot();
    return null;
  }

  const savedAtMs = Date.parse(raw.savedAt || '');
  if (!Number.isFinite(savedAtMs) || Date.now() - savedAtMs > RESTORE_MAX_MS) {
    clearSnapshot();
    return null;
  }

  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeItem).filter(Boolean)
    : [];
  const activeItemId = typeof raw.activeItemId === 'string' && items.some((it) => it.id === raw.activeItemId)
    ? raw.activeItemId
    : (items.length ? items[0].id : null);

  session = {
    id: typeof raw.id === 'string' ? raw.id : sessionId(),
    sourceType: SOURCE_TYPES.has(raw.sourceType) ? raw.sourceType : 'free',
    sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : '',
    sourceLabel: typeof raw.sourceLabel === 'string' ? raw.sourceLabel : '',
    routineId: typeof raw.routineId === 'string' ? raw.routineId : '',
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    elapsedMs: Math.max(0, Math.floor(Number(raw.elapsedMs) || 0)),
    timerTargetMs: raw.timerTargetMs != null
      ? Math.max(0, Math.floor(Number(raw.timerTargetMs)))
      : null,
    metronome: normalizeMetronome(raw.metronome),
    tempoPlan: normalizeTempoPlan(raw.tempoPlan ?? raw.metronome?.tempoPlan),
    loop: normalizeLoop(raw.loop),
    activeItemId,
    items,
    attemptIds: Array.isArray(raw.attemptIds) ? [...raw.attemptIds] : [],
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    status: 'paused',
    clockAnchor: timeSource(),
    clockAtAnchor: Math.max(0, Math.floor(Number(raw.elapsedMs) || 0)),
    itemAccumulatedMs: 0,
    itemClockAnchor: timeSource(),
    timerStartElapsedMs: Math.max(0, Math.floor(Number(raw.elapsedMs) || 0)),
  };

  timerCompleteEmitted = false;
  phaseExhaustedNotified = false;
  lastPhaseIndex = -1;
  if (session.tempoPlan?.phases?.length) {
    const elapsedSec = elapsedSecFromMs(session.elapsedMs);
    lastPhaseIndex = phaseIndexForElapsed(
      session.tempoPlan.loop
        ? elapsedSec % phasesTotalSeconds(session.tempoPlan.phases)
        : elapsedSec,
      session.tempoPlan.phases,
    );
  }

  session.metronome.playing = false;
  pushMusicOverride();
  notify('restore');
  flushSnapshot();
  return copySessionState(session);
}

export function hasActiveSession() {
  return session != null && session.status !== 'ended';
}

/** Test only: inject a fake metronome driver. */
export function __setMetronomeDriverForTests(driver) {
  customDriverInjected = true;
  metroDriver = driver || createStateOnlyDriver();
}

/** Test only: inject a monotonic time source. Returns ms. */
export function __setTimeSourceForTests(fn) {
  timeSource = typeof fn === 'function' ? fn : defaultTimeSource;
}

/** Test only: advance the session clock one tick without setInterval. */
export function __tickSessionClockForTests(reason = 'tick') {
  tickClock(reason);
}
