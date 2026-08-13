// Multi-track Guitar Pro mix player: timeline scheduler, per-track gain,
// loop/rest, and optional score metronome on one clock.

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { quartersToSeconds, modelHasRhythm } from './tab/tabModel.js';
import { buildPlayOrder } from './tab/playOrder.js';
import { buildTimeline } from './tab/scoreTimeline.js';
import { midiToDrumInstrument } from './tab/gpPercussion.js';
import { scheduleHit, initEngine } from './drums/drumEngine.js';
import { scheduleMetronomeClick } from './tab/metroClick.js';
import { measureIndexAtBeat } from './gpPlayer/rangeUtils.js';
import {
  clickLevelAt,
  nextClickBeat,
  normalizeMetronomeConfig,
  snapMetroBeatToGrid,
} from './gpPlayer/metronomeState.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;
const VOICE_FADE_SEC = 0.008;
const MIN_RATE = 0.25;
const MAX_RATE = 3;

function clampRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(MIN_RATE, Math.min(MAX_RATE, n));
}

function clampGain(g) {
  const n = Number(g);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function scheduleGuitarTone(midi, when, dur, techniques = [], destination) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const muted = techniques.includes('palmMute') || techniques.includes('dead');
  osc.type = muted ? 'square' : 'triangle';
  osc.frequency.value = midiFreq(midi);
  const peak = muted ? 0.07 : 0.16;
  const attack = 0.008;
  const release = Math.min(0.08, dur * 0.35);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setValueAtTime(peak * 0.7, Math.max(when + attack, when + dur - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain);
  gain.connect(destination || getAnalyserDestination());
  osc.start(when);
  osc.stop(when + dur + 0.02);
  return { osc, gain };
}

function buildTimedDrums(percModel, bpm, trackIndex) {
  if (!percModel?.events?.length) return [];
  const tempo = Number(bpm) || Number(percModel.tempo) || 120;
  return percModel.events
    .filter((e) => e.instrument)
    .map((e) => ({
      kind: 'drum',
      trackIndex,
      startSec: quartersToSeconds(Number.isFinite(e.start) ? e.start : 0, tempo),
      durSec: 0.05,
      instrument: e.instrument,
      velocity: Number.isFinite(e.velocity) ? e.velocity : 0.78,
      startBeat: Number.isFinite(e.start) ? e.start : 0,
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

function buildMeasureStarts(model) {
  if (!model?.measures?.length) return [];
  return model.measures
    .map((m) => (Number.isFinite(m.startBeat) ? m.startBeat : m.startSlot))
    .filter((b) => Number.isFinite(b));
}

function loopFromMeasures(model, loopMeasures, timeline, guitarNotes, restSec, rate) {
  if (!loopMeasures || !model?.measures?.length) return null;
  const [a, b] = loopMeasures;
  const startIdx = Math.max(0, Math.min(model.measures.length - 1, a));
  const endIdx = Math.max(startIdx, Math.min(model.measures.length - 1, b));
  if (timeline?.loopWindow) {
    const win = timeline.loopWindow({ startBarIndex: startIdx, endBarIndex: endIdx });
    if (win.endSec > win.startSec) {
      return { startSec: win.startSec, endSec: win.endSec, restSec };
    }
  }
  const startM = model.measures[startIdx];
  const endM = model.measures[endIdx];
  const startBeat = Number.isFinite(startM.startBeat) ? startM.startBeat : startM.startSlot;
  const endBeat = Number.isFinite(endM.endBeat) ? endM.endBeat : endM.endSlot;
  const tempo = Number(model.tempo) || 120;
  const startSec = quartersToSeconds(startBeat, tempo) / rate;
  let endSec = quartersToSeconds(endBeat, tempo) / rate;
  if (!modelHasRhythm(model)) {
    const inRange = guitarNotes.filter(
      (n) => n.measureIndex >= startIdx && n.measureIndex <= endIdx,
    );
    if (inRange.length) {
      return {
        startSec: inRange[0].startSec,
        endSec: inRange[inRange.length - 1].startSec + inRange[inRange.length - 1].durSec,
        restSec,
      };
    }
    return null;
  }
  if (endSec > startSec) return { startSec, endSec, restSec };
  return null;
}

function buildTimelineFromModels(guitarModels, drumModels, referenceModel, baseBpm) {
  const ref = referenceModel || guitarModels[0] || drumModels[0];
  const measures = ref?.measures || [];
  const playOrder = buildPlayOrder(measures);
  const tempoMap = ref?.tempoMap || [];
  const tempo = Number(baseBpm)
    || Number(ref?.tempo)
    || Number(guitarModels[0]?.tempo)
    || Number(drumModels[0]?.tempo)
    || 120;
  return buildTimeline({
    playOrder,
    tempoMap,
    baseBpm: tempo,
    rate: 1,
    tracks: { guitarModels, drumModels },
  });
}

function guitarNotesFromEvents(events, rate) {
  return events
    .filter((e) => e.kind === 'guitar')
    .map((e) => ({
      kind: 'guitar',
      trackIndex: e.trackIndex,
      midi: e.midi,
      startSec: e.startSec / rate,
      durSec: e.durSec / rate,
      measureIndex: e.barIndex,
      techniques: e.techniques || [],
      velocity: e.velocity,
    }));
}

/**
 * @param {object} [opts]
 * @param {(info:object)=>void} [opts.onTick]
 * @param {(position:object)=>void} [opts.onPositionFrame]
 * @param {({ cause:string, nextStep:string })=>void} [opts.onAudioBlocked]
 * @param {({ passCount:number })=>void} [opts.onLoopPass]
 * @param {()=>void} [opts.onEnded]
 */
export function createGpMixPlayer(opts = {}) {
  const state = {
    guitarModels: [],
    drumModels: [],
    baseTimeline: null,
    timeline: null,
    allGuitarNotes: [],
    allDrumHits: [],
    events: [],
    nextIndex: 0,
    nextMetroBeat: 0,
    metroConfig: normalizeMetronomeConfig(),
    measureStarts: [],
    loopPassCount: 0,
    loopRestartFlag: false,
    referenceModel: null,
    playing: false,
    paused: false,
    pauseAtSec: 0,
    originAudioTime: 0,
    originSongSec: 0,
    timer: null,
    frameId: null,
    voices: [],
    baseBpm: 120,
    rate: 1,
    enabledGuitars: [],
    enabledDrums: [],
    trackVolumes: { guitar: [], drum: [] },
    trackGains: { guitar: [], drum: [] },
    metronomeEnabled: false,
    loop: null,
    inLoopRest: false,
    loopRestUntil: 0,
    range: { startBeat: 0, endBeat: null },
    onTick: typeof opts.onTick === 'function' ? opts.onTick : null,
    onPositionFrame: typeof opts.onPositionFrame === 'function' ? opts.onPositionFrame : null,
    onAudioBlocked: typeof opts.onAudioBlocked === 'function' ? opts.onAudioBlocked : null,
    onLoopPass: typeof opts.onLoopPass === 'function' ? opts.onLoopPass : null,
    onEnded: typeof opts.onEnded === 'function' ? opts.onEnded : null,
    measureIndex: 0,
    lastLoopMeasures: null,
    lastLoopRestSec: 0,
    destroyed: false,
    endedFired: false,
  };

  function wallSecFromEvent(ev) {
    return ev.startSec / state.rate;
  }

  function eventDurWall(ev) {
    return ev.durSec / state.rate;
  }

  function fadeVoices() {
    if (!audioCtx) {
      state.voices = [];
      return;
    }
    const now = audioCtx.currentTime;
    state.voices.forEach((v) => {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0.0001, now + VOICE_FADE_SEC);
        v.osc.stop(now + VOICE_FADE_SEC + 0.002);
      } catch (e) { /* ignore */ }
    });
    state.voices = [];
  }

  function stopTimer() {
    if (state.timer != null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function stopFrameLoop() {
    if (state.frameId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(state.frameId);
      state.frameId = null;
    }
  }

  function startFrameLoop() {
    if (!state.onPositionFrame || state.frameId != null) return;
    const tick = () => {
      if (!state.playing || state.destroyed) {
        state.frameId = null;
        return;
      }
      state.onPositionFrame(getPosition());
      state.frameId = requestAnimationFrame(tick);
    };
    state.frameId = requestAnimationFrame(tick);
  }

  function songTimeNow() {
    if (!state.playing || !audioCtx) return state.pauseAtSec;
    if (state.inLoopRest) return state.loop?.startSec ?? state.pauseAtSec;
    const raw = state.originSongSec + (audioCtx.currentTime - state.originAudioTime);
    return Math.max(state.originSongSec, raw);
  }

  function restRemaining() {
    if (!state.playing || !state.inLoopRest || !audioCtx) return 0;
    return Math.max(0, state.loopRestUntil - audioCtx.currentTime);
  }

  function durationSec() {
    if (state.loop) return state.loop.endSec;
    if (state.range.endBeat != null && state.timeline) {
      const endInternal = quartersToSeconds(state.range.endBeat, state.baseBpm);
      return endInternal / state.rate;
    }
    return state.timeline?.totalSec ?? 0;
  }

  function positionNow() {
    if (!state.timeline) {
      const sec = songTimeNow();
      const beat = (sec / 60) * (state.baseBpm * state.rate);
      return {
        sec,
        quarter: beat,
        passIndex: 0,
        barIndex: measureIndexAtBeat(state.referenceModel?.measures || [], beat),
        beatInBar: 0,
        beatInScore: beat,
        eventIndex: null,
      };
    }
    return state.timeline.positionAtSeconds(songTimeNow());
  }

  function getPosition() {
    return positionNow();
  }

  function resyncCursor(fromSec) {
    state.nextIndex = 0;
    const events = state.events;
    while (
      state.nextIndex < events.length
      && wallSecFromEvent(events[state.nextIndex]) < fromSec - 0.0001
    ) state.nextIndex += 1;
    const pos = state.timeline
      ? state.timeline.positionAtSeconds(fromSec)
      : { beatInScore: (fromSec / 60) * (state.baseBpm * state.rate) };
    state.nextMetroBeat = snapMetroBeatToGrid(
      pos.beatInScore,
      state.metroConfig.subdiv,
    );
  }

  function emitTick() {
    if (!state.onTick || state.destroyed) return;
    const sec = songTimeNow();
    const pos = positionNow();
    state.measureIndex = pos.barIndex;
    const loopRestart = state.loopRestartFlag;
    state.loopRestartFlag = false;
    state.onTick({
      playing: state.playing,
      currentSec: sec,
      durationSec: durationSec(),
      measureIndex: state.measureIndex,
      beat: pos.beatInScore,
      bpm: state.baseBpm * state.rate,
      resting: !!state.inLoopRest,
      restRemaining: restRemaining(),
      loopRestart,
      loopPassCount: state.loopPassCount,
    });
  }

  function maybeFireEnded() {
    if (state.destroyed || state.endedFired || state.loop) return;
    if (!state.timeline || state.timeline.events.length === 0) return;
    const sec = songTimeNow();
    const end = durationSec();
    if (state.playing && sec >= end - 0.001 && state.nextIndex >= state.events.length) {
      state.endedFired = true;
      stop();
      if (state.onEnded) state.onEnded();
    }
  }

  function ensureTrackGains() {
    ensureAudio();
    while (state.trackGains.guitar.length < state.guitarModels.length) {
      const i = state.trackGains.guitar.length;
      const g = audioCtx.createGain();
      g.gain.value = state.trackVolumes.guitar[i] ?? 1;
      g.connect(getAnalyserDestination());
      state.trackGains.guitar.push(g);
    }
    while (state.trackGains.drum.length < state.drumModels.length) {
      const i = state.trackGains.drum.length;
      const g = audioCtx.createGain();
      g.gain.value = state.trackVolumes.drum[i] ?? 1;
      g.connect(getAnalyserDestination());
      state.trackGains.drum.push(g);
    }
  }

  function rebuildEvents() {
    const out = [];
    for (const ev of state.timeline?.events || []) {
      if (ev.kind === 'guitar' && state.enabledGuitars[ev.trackIndex] === false) continue;
      if (ev.kind === 'drum' && state.enabledDrums[ev.trackIndex] === false) continue;
      out.push(ev);
    }
    out.sort((a, b) => a.startSec - b.startSec || a.trackIndex - b.trackIndex);
    state.events = out;
    state.allGuitarNotes = guitarNotesFromEvents(out, state.rate);
    state.allDrumHits = out
      .filter((e) => e.kind === 'drum')
      .map((e) => ({
        kind: 'drum',
        trackIndex: e.trackIndex,
        startSec: wallSecFromEvent(e),
        durSec: eventDurWall(e),
        instrument: drumInstrument(e),
        velocity: e.velocity ?? 0.78,
      }));
  }

  function filterEventsByBeatRange(events, startBeat, endBeat) {
    if (startBeat <= 0 && endBeat == null) return events;
    const startSec = quartersToSeconds(startBeat, state.baseBpm) / state.rate;
    const endSec = endBeat != null ? quartersToSeconds(endBeat, state.baseBpm) / state.rate : null;
    return events.filter((ev) => {
      const ws = wallSecFromEvent(ev);
      return ws >= startSec - 1e-6 && (endSec == null || ws < endSec - 1e-6);
    });
  }

  function drumInstrument(ev) {
    if (ev.instrument) return ev.instrument;
    return midiToDrumInstrument(ev.midi, { velocity: ev.velocity }) || 'kick';
  }

  function scheduleEvent(ev, when, now) {
    if (when < now - 0.02) return;
    const at = Math.max(now + 0.004, when);
    const dur = eventDurWall(ev);
    if (ev.kind === 'guitar') {
      const dest = state.trackGains.guitar[ev.trackIndex] || getAnalyserDestination();
      state.voices.push(scheduleGuitarTone(
        ev.midi,
        at,
        dur || 0.2,
        ev.techniques,
        dest,
      ));
    } else if (ev.kind === 'drum') {
      scheduleHit(drumInstrument(ev), at, ev.velocity ?? 0.78);
    }
  }

  function scheduleMetronome(horizon, now) {
    if (!state.metronomeEnabled || state.inLoopRest) return;
    const bpm = state.baseBpm * state.rate;
    const quarterSec = 60 / bpm;
    const loopStart = state.loop?.startSec ?? 0;
    const loopEnd = state.loop?.endSec ?? Infinity;
    const metro = state.metroConfig;
    while (state.nextMetroBeat * quarterSec <= horizon + 1e-9) {
      const beatSec = state.nextMetroBeat * quarterSec;
      if (beatSec >= loopStart - 1e-6 && beatSec < loopEnd - 1e-6) {
        const when = state.originAudioTime + (beatSec - state.originSongSec);
        if (when >= now - 0.02) {
          const level = clickLevelAt(
            state.nextMetroBeat,
            metro.subdiv,
            metro,
            state.measureStarts,
          );
          scheduleMetronomeClick(
            Math.max(now + 0.004, when),
            level,
            metro.volume,
          );
        }
      }
      state.nextMetroBeat = nextClickBeat(state.nextMetroBeat, metro.subdiv);
    }
  }

  function scheduleLoopWrapEvents(songNow, horizon, now) {
    if (!state.loop || state.inLoopRest) return;
    const loopLen = state.loop.endSec - state.loop.startSec;
    if (loopLen <= 0) return;
    if (songNow + SCHEDULE_AHEAD < state.loop.endSec - 0.001) return;

    const wrapBase = state.loop.endSec;
    for (const ev of state.events) {
      const evSec = wallSecFromEvent(ev);
      if (evSec < state.loop.startSec - 1e-6 || evSec >= state.loop.endSec - 1e-6) continue;
      const offset = evSec - state.loop.startSec;
      const schedSongSec = wrapBase + offset;
      if (schedSongSec > horizon + 1e-6) continue;
      const when = state.originAudioTime + (schedSongSec - state.originSongSec);
      scheduleEvent(ev, when, now);
    }
  }

  function scheduler() {
    if (!state.playing || !audioCtx || state.destroyed) return;
    const now = audioCtx.currentTime;

    if (state.loop && state.inLoopRest) {
      if (now < state.loopRestUntil - 0.001) {
        emitTick();
        state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
        return;
      }
      state.inLoopRest = false;
      state.originSongSec = state.loop.startSec;
      state.originAudioTime = now + 0.01;
      resyncCursor(state.loop.startSec);
      emitTick();
    }

    let songNow = state.originSongSec + (now - state.originAudioTime);

    if (state.loop && !state.inLoopRest && songNow >= state.loop.endSec - 0.001) {
      const rest = Math.max(0, Number(state.loop.restSec) || 0);
      if (rest > 0) {
        fadeVoices();
        state.inLoopRest = true;
        state.loopRestUntil = now + rest;
        state.originSongSec = state.loop.endSec;
        state.originAudioTime = now;
        emitTick();
        state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
        return;
      }
      state.loopPassCount += 1;
      state.loopRestartFlag = true;
      if (state.onLoopPass) state.onLoopPass({ passCount: state.loopPassCount });
      state.originSongSec = state.loop.startSec + (songNow - state.loop.endSec);
      state.originAudioTime = now;
      songNow = state.originSongSec;
      resyncCursor(songNow);
      emitTick();
    }

    const horizon = songNow + SCHEDULE_AHEAD;

    while (state.nextIndex < state.events.length) {
      const ev = state.events[state.nextIndex];
      const evSec = wallSecFromEvent(ev);
      if (state.loop && (evSec < state.loop.startSec - 1e-6 || evSec >= state.loop.endSec - 1e-6)) {
        state.nextIndex += 1;
        continue;
      }
      if (evSec > horizon) break;
      const when = state.originAudioTime + (evSec - state.originSongSec);
      scheduleEvent(ev, when, now);
      state.nextIndex += 1;
    }

    scheduleLoopWrapEvents(songNow, horizon, now);
    scheduleMetronome(horizon, now);

    if (!state.loop && state.nextIndex >= state.events.length) {
      maybeFireEnded();
      if (!state.playing) return;
    }

    emitTick();
    state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function applyRateTimeline() {
    if (!state.baseTimeline) {
      state.timeline = null;
      return;
    }
    state.timeline = state.baseTimeline.withRate(state.rate);
  }

  function load(params = {}) {
    const {
      timeline: providedTimeline = null,
      tracks = null,
      loop: loopConfig = null,
      metronome = null,
      referenceModel = null,
      guitarModels = tracks?.guitarModels || [],
      drumModels = tracks?.drumModels || [],
      bpm = null,
      loopMeasures = null,
      loopBeats = null,
      loopRestSec = 0,
      enabledGuitars = null,
      enabledDrums = null,
      metronomeEnabled = null,
    } = params;

    stop();
    state.endedFired = false;
    state.guitarModels = guitarModels.filter(Boolean);
    state.drumModels = drumModels.filter(Boolean);

    const ref = referenceModel
      || state.guitarModels[0]
      || state.drumModels[0]
      || null;
    state.referenceModel = ref;

    const tempo = Number(bpm)
      || Number(ref?.tempo)
      || Number(state.guitarModels[0]?.tempo)
      || Number(state.drumModels[0]?.tempo)
      || 120;
    state.baseBpm = tempo;

    if (providedTimeline) {
      state.rate = providedTimeline.rate || 1;
      state.baseTimeline = providedTimeline.withRate(1);
    } else {
      state.rate = 1;
      state.baseTimeline = buildTimelineFromModels(
        state.guitarModels,
        state.drumModels,
        ref,
        tempo,
      );
    }
    applyRateTimeline();

    state.inLoopRest = false;
    state.lastLoopMeasures = loopMeasures;
    state.lastLoopRestSec = Math.max(0, Number(loopRestSec) || 0);

    if (enabledGuitars) {
      state.enabledGuitars = enabledGuitars.map(Boolean);
    } else if (state.enabledGuitars.length !== state.guitarModels.length) {
      state.enabledGuitars = state.guitarModels.map(() => true);
    }
    if (enabledDrums) {
      state.enabledDrums = enabledDrums.map(Boolean);
    } else if (state.enabledDrums.length !== state.drumModels.length) {
      state.enabledDrums = state.drumModels.map(() => true);
    }

    while (state.trackVolumes.guitar.length < state.guitarModels.length) {
      state.trackVolumes.guitar.push(1);
    }
    while (state.trackVolumes.drum.length < state.drumModels.length) {
      state.trackVolumes.drum.push(1);
    }
    state.trackVolumes.guitar.length = state.guitarModels.length;
    state.trackVolumes.drum.length = state.drumModels.length;

    if (metronome?.config) {
      state.metroConfig = normalizeMetronomeConfig({ ...state.metroConfig, ...metronome.config });
    }
    if (metronome?.enabled != null) state.metronomeEnabled = !!metronome.enabled;
    if (metronomeEnabled != null) state.metronomeEnabled = !!metronomeEnabled;

    state.measureStarts = buildMeasureStarts(state.referenceModel);

    let startBeat = 0;
    let endBeat = null;
    if (loopBeats) {
      const lbStart = Number(loopBeats.startBeat);
      const lbEnd = loopBeats.endBeat != null ? Number(loopBeats.endBeat) : null;
      const usable = Number.isFinite(lbStart) && (lbEnd == null || lbEnd > lbStart);
      if (usable) {
        startBeat = lbStart;
        endBeat = lbEnd;
      }
    }
    state.range = { startBeat, endBeat };

    rebuildEvents();
    let filtered = filterEventsByBeatRange(state.events, startBeat, endBeat);
    state.events = filtered;
    state.allGuitarNotes = guitarNotesFromEvents(filtered, state.rate);
    state.allDrumHits = filtered
      .filter((e) => e.kind === 'drum')
      .map((e) => ({
        kind: 'drum',
        trackIndex: e.trackIndex,
        startSec: wallSecFromEvent(e),
        durSec: eventDurWall(e),
        instrument: drumInstrument(e),
        velocity: e.velocity ?? 0.78,
      }));

    const restSec = state.lastLoopRestSec;
    state.loop = null;

    if (loopConfig?.enabled) {
      const win = state.timeline?.loopWindow({
        startBarIndex: loopConfig.startBarIndex,
        endBarIndex: loopConfig.endBarIndex,
      });
      if (win && win.endSec > win.startSec) {
        state.loop = {
          startSec: win.startSec,
          endSec: win.endSec,
          restSec: Math.max(0, Number(loopConfig.restSec) || 0),
        };
      }
    } else if (loopMeasures && state.referenceModel?.measures?.length) {
      state.loop = loopFromMeasures(
        state.referenceModel,
        loopMeasures,
        state.timeline,
        state.allGuitarNotes,
        restSec,
        state.rate,
      );
    } else if (loopBeats && endBeat != null) {
      const startSec = state.timeline
        ? state.timeline.secondsAtPosition({ barIndex: 0, beatInBar: startBeat, passIndex: 0 })
        : quartersToSeconds(startBeat, tempo) / state.rate;
      const endSec = state.timeline
        ? state.timeline.secondsAtPosition({ barIndex: 0, beatInBar: endBeat, passIndex: 0 })
        : quartersToSeconds(endBeat, tempo) / state.rate;
      if (endSec > startSec) state.loop = { startSec, endSec, restSec };
    }

    state.pauseAtSec = state.loop ? state.loop.startSec : (
      startBeat > 0
        ? (state.timeline
          ? state.timeline.secondsAtPosition({ barIndex: 0, beatInBar: startBeat, passIndex: 0 })
          : quartersToSeconds(startBeat, tempo) / state.rate)
        : 0
    );
  }

  async function play({ fromSec = null } = {}) {
    ensureAudio();
    if (!state.events.length) rebuildEvents();

    if (!state.timeline?.events?.length && !state.metronomeEnabled) {
      state.endedFired = true;
      if (state.onEnded) state.onEnded();
      return;
    }

    if (audioCtx?.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {
        if (state.onAudioBlocked) {
          state.onAudioBlocked({
            cause: 'The browser blocked audio playback.',
            nextStep: 'Tap Play again or allow audio for this site in browser settings.',
          });
        }
        return;
      }
      if (audioCtx.state === 'suspended') {
        if (state.onAudioBlocked) {
          state.onAudioBlocked({
            cause: 'The audio context is still suspended.',
            nextStep: 'Tap Play again after you interact with the page.',
          });
        }
        return;
      }
    }

    initEngine();
    ensureTrackGains();
    fadeVoices();
    stopTimer();
    state.inLoopRest = false;
    state.endedFired = false;

    const defaultStart = state.loop
      ? state.loop.startSec
      : (state.range.startBeat > 0
        ? (state.timeline
          ? state.timeline.secondsAtPosition({
            barIndex: 0,
            beatInBar: state.range.startBeat,
            passIndex: 0,
          })
          : quartersToSeconds(state.range.startBeat, state.baseBpm) / state.rate)
        : 0);

    const startSec = fromSec != null
      ? Math.min(fromSec, durationSec())
      : (state.paused ? state.pauseAtSec : defaultStart);

    state.originSongSec = startSec;
    state.originAudioTime = audioCtx.currentTime + 0.06;
    resyncCursor(startSec);
    state.playing = true;
    state.paused = false;
    state.pauseAtSec = startSec;
    scheduler();
    startFrameLoop();
    emitTick();
  }

  function pause() {
    if (!state.playing) return;
    state.pauseAtSec = songTimeNow();
    state.playing = false;
    state.paused = true;
    state.inLoopRest = false;
    stopTimer();
    stopFrameLoop();
    fadeVoices();
    emitTick();
  }

  function stop() {
    state.playing = false;
    state.paused = false;
    state.inLoopRest = false;
    state.pauseAtSec = state.loop
      ? state.loop.startSec
      : (state.range.startBeat > 0
        ? (state.timeline
          ? state.timeline.secondsAtPosition({
            barIndex: 0,
            beatInBar: state.range.startBeat,
            passIndex: 0,
          })
          : quartersToSeconds(state.range.startBeat, state.baseBpm) / state.rate)
        : 0);
    state.nextIndex = 0;
    state.nextMetroBeat = 0;
    state.loopPassCount = 0;
    state.loopRestartFlag = false;
    state.measureIndex = 0;
    stopTimer();
    stopFrameLoop();
    fadeVoices();
    emitTick();
  }

  /** Jump to a song position without starting playback. */
  function seek(sec) {
    const maxSec = state.timeline?.totalSec ?? Infinity;
    const s = Math.max(0, Math.min(maxSec, Number(sec) || 0));
    const was = state.playing;
    if (was) {
      fadeVoices();
      stopTimer();
      state.inLoopRest = false;
      state.originSongSec = s;
      state.originAudioTime = audioCtx.currentTime + 0.06;
      resyncCursor(s);
      state.pauseAtSec = s;
      scheduler();
      emitTick();
      return;
    }
    state.pauseAtSec = s;
    state.paused = true;
    resyncCursor(s);
    const pos = positionNow();
    state.measureIndex = pos.barIndex;
    emitTick();
  }

  function seekToBar({ barIndex, beatInBar = 0 } = {}) {
    if (!state.timeline) {
      const measures = state.referenceModel?.measures || [];
      const m = measures[barIndex];
      const beat = (Number.isFinite(m?.startBeat) ? m.startBeat : barIndex * 4)
        + (Number(beatInBar) || 0);
      seek(quartersToSeconds(beat, state.baseBpm) / state.rate);
      return;
    }
    const sec = state.timeline.secondsAtPosition({
      barIndex: Number(barIndex) || 0,
      beatInBar: Number(beatInBar) || 0,
      passIndex: 0,
    });
    seek(sec);
  }

  function setRate(factor) {
    const r = clampRate(factor);
    const pos = getPosition();
    state.rate = r;
    applyRateTimeline();
    rebuildEvents();
    const filtered = filterEventsByBeatRange(
      state.events,
      state.range.startBeat,
      state.range.endBeat,
    );
    state.events = filtered;
    state.allGuitarNotes = guitarNotesFromEvents(filtered, state.rate);
    const newSec = state.timeline
      ? state.timeline.secondsAtPosition({
        barIndex: pos.barIndex,
        beatInBar: pos.beatInBar,
        passIndex: pos.passIndex,
      })
      : state.pauseAtSec;
    if (state.playing) {
      fadeVoices();
      state.originSongSec = newSec;
      state.originAudioTime = audioCtx.currentTime + 0.01;
      resyncCursor(newSec);
      state.pauseAtSec = newSec;
      scheduler();
    } else {
      state.pauseAtSec = newSec;
      resyncCursor(newSec);
    }
    emitTick();
  }

  function setBpm(bpm) {
    const newBpm = Number(bpm);
    if (!Number.isFinite(newBpm) || newBpm <= 0) return;
    setRate(newBpm / state.baseBpm);
  }

  function setTrackEnabled(kind, index, enabled) {
    const arr = kind === 'drum' ? state.enabledDrums : state.enabledGuitars;
    if (index < 0 || index >= arr.length) return;
    arr[index] = !!enabled;
    const was = state.playing;
    const at = songTimeNow();
    rebuildEvents();
    const filtered = filterEventsByBeatRange(
      state.events,
      state.range.startBeat,
      state.range.endBeat,
    );
    state.events = filtered;
    if (was) play({ fromSec: at });
    else emitTick();
  }

  function setTrackVolume(kind, index, gain) {
    const vols = kind === 'drum' ? state.trackVolumes.drum : state.trackVolumes.guitar;
    const gains = kind === 'drum' ? state.trackGains.drum : state.trackGains.guitar;
    if (index < 0 || index >= vols.length) return;
    vols[index] = clampGain(gain);
    if (gains[index]) gains[index].gain.value = vols[index];
  }

  function setMetronomeEnabled(on) {
    state.metronomeEnabled = !!on;
    const was = state.playing;
    const at = songTimeNow();
    if (was) play({ fromSec: at });
    else emitTick();
  }

  function setMetronomeConfig(config) {
    state.metroConfig = normalizeMetronomeConfig({ ...state.metroConfig, ...config });
    const pos = positionNow();
    state.nextMetroBeat = snapMetroBeatToGrid(pos.beatInScore, state.metroConfig.subdiv);
    if (!state.playing) emitTick();
  }

  function setLoop(loop) {
    if (!loop) {
      state.loop = null;
      state.inLoopRest = false;
      return;
    }
    if (loop.enabled === false) {
      state.loop = null;
      state.inLoopRest = false;
      return;
    }
    if (Number.isFinite(loop.startBarIndex) && Number.isFinite(loop.endBarIndex) && state.timeline) {
      const win = state.timeline.loopWindow({
        startBarIndex: loop.startBarIndex,
        endBarIndex: loop.endBarIndex,
      });
      state.loop = {
        startSec: win.startSec,
        endSec: win.endSec,
        restSec: Math.max(0, Number(loop.restSec) || 0),
      };
      state.lastLoopRestSec = state.loop.restSec;
      return;
    }
    state.loop = {
      startSec: Number(loop.startSec) || 0,
      endSec: Number(loop.endSec) || 0,
      restSec: Math.max(0, Number(loop.restSec) || 0),
    };
    state.lastLoopRestSec = state.loop.restSec;
  }

  function setLoopRestSec(sec) {
    if (!state.loop) return;
    state.loop.restSec = Math.max(0, Number(sec) || 0);
    state.lastLoopRestSec = state.loop.restSec;
  }

  function destroy() {
    state.destroyed = true;
    const wasPlaying = state.playing;
    stop();
    fadeVoices();
    stopTimer();
    stopFrameLoop();
    state.onTick = null;
    state.onPositionFrame = null;
    state.onAudioBlocked = null;
    state.onLoopPass = null;
    state.onEnded = null;
    for (const g of state.trackGains.guitar) {
      try { g.disconnect(); } catch (e) { /* ignore */ }
    }
    for (const g of state.trackGains.drum) {
      try { g.disconnect(); } catch (e) { /* ignore */ }
    }
    state.trackGains.guitar = [];
    state.trackGains.drum = [];
    if (wasPlaying) state.playing = false;
  }

  function setOnTick(fn) { state.onTick = fn; }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (state.destroyed || !state.playing || !audioCtx) return;
      if (document.visibilityState === 'visible') {
        const sec = songTimeNow();
        state.originAudioTime = audioCtx.currentTime;
        state.originSongSec = sec;
        resyncCursor(sec);
      }
    });
  }

  return {
    load,
    play,
    pause,
    stop,
    seek,
    seekToBar,
    setRate,
    setBpm,
    setTrackEnabled,
    setTrackVolume,
    setMetronomeEnabled,
    setMetronomeConfig,
    setLoop,
    setLoopRestSec,
    setOnTick,
    getPosition,
    destroy,
    get playing() { return state.playing; },
    get paused() { return state.paused; },
    get bpm() { return state.baseBpm * state.rate; },
    get currentSec() { return songTimeNow(); },
    get durationSec() { return durationSec(); },
    get measureIndex() { return state.measureIndex; },
    get metronomeEnabled() { return state.metronomeEnabled; },
    get enabledGuitars() { return [...state.enabledGuitars]; },
    get enabledDrums() { return [...state.enabledDrums]; },
    get guitarNotes() { return state.allGuitarNotes; },
    get events() { return state.events; },
    get range() { return { ...state.range }; },
  };
}
