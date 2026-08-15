// Multi-track Guitar Pro mix player: timeline scheduler, per-track gain,
// loop/rest, and optional score metronome on one clock.

import { audioCtx, ensureAudio, getMixDestination } from './audio.js';
import { claimAudio, releaseAudio } from './audio/audioOwner.js';
import {
  getTrackBus,
  isTrackBusInput,
  setTrackBusGain,
  setTrackBusPan,
  setTrackMuteSolo,
} from './audio/mixBus.js';
import { canUsePackOnNextStart, getLoadState, packBufferKey } from './audio/sampleLoader.js';
import { getPack, packsForPrograms } from './audio/samplePackRegistry.js';
import { pickPitchedSample, playDrumSample, pickDrumSample } from './audio/sampleVoice.js';
import { createVoiceFactory } from './gpPlayer/instrumentVoices.js';
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
// How far ahead the scheduler places notes. The scheduler shares the main
// thread with the score view, so the timer can run late under load. A wide
// window lets the audio ride through that delay without a hole.
const SCHEDULE_AHEAD = 0.3;
// A note that is late by less than this still sounds, a little late. Only a
// seek or a stop makes a note later than this, and then the engine drops it.
const MAX_LATE_SEC = 1;
const VOICE_FADE_SEC = 0.008;
const CHORD_ONSET_EPS = 1e-6;
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

function sourceVolumeFromModel(model) {
  const v = model?.trackInfo?.volume;
  return Number.isFinite(Number(v)) ? clampGain(v) : 1;
}

function sourcePanFromModel(model) {
  const p = model?.trackInfo?.pan;
  if (!Number.isFinite(Number(p))) return 0;
  return Math.max(-1, Math.min(1, Number(p)));
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
    // Indexes into events[] that sit inside the loop window, plus the cursor
    // that the wrap scheduler uses. A null index means "rebuild on next use".
    loopEventIdx: null,
    wrapPos: 0,
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
    trackPans: { guitar: [], drum: [] },
    trackGains: { guitar: [], drum: [] },
    trackMixInitialized: false,
    scoreId: '',
    playbackSource: 'synth',
    audioHandle: null,
    ownerCallbackActive: false,
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
    voiceFactory: null,
    playGeneration: 0,
  };

  function wallSecFromEvent(ev) {
    return ev.startSec / state.rate;
  }

  function eventDurWall(ev) {
    return ev.durSec / state.rate;
  }

  /**
   * Track one sounding voice and release it when the note ends.
   * A finished gain node stays connected to the destination until something
   * disconnects it. Without this cleanup the audio graph grows with every
   * note, the audio thread walks more nodes on each render block, and the
   * sound starts to break up during a long session.
   */
  function packSessionReady() {
    if (state.playbackSource !== 'pack' || !state.scoreId) return null;
    const session = getLoadState(state.scoreId);
    if (session.status !== 'ready' || !session.buffers) return null;
    return session;
  }

  function scheduleGuitarVoice(factory, ev, when, dur, destination, chordSize = 1) {
    const model = state.guitarModels[ev.trackIndex];
    const program = model?.trackInfo?.program != null ? model.trackInfo.program : 27;
    const family = factory.familyForProgram(program);

    let pack = null;
    const session = packSessionReady();
    if (session) {
      const packIds = packsForPrograms([program]);
      if (packIds.length) {
        const manifest = getPack(packIds[0]);
        const sample = pickPitchedSample(manifest, ev.midi, ev.velocity);
        if (sample) {
          const buffer = session.buffers[packBufferKey(manifest.id, sample.file)];
          if (buffer) {
            pack = {
              buffer,
              rootMidi: sample.rootMidi,
              gainTrim: sample.gainTrim ?? 1,
            };
          }
        }
      }
    }

    return factory.playNote({
      family,
      midi: ev.midi,
      when,
      durSec: dur || 0.2,
      velocity: ev.velocity,
      techniques: ev.techniques || [],
      bend: ev.bend ?? null,
      slideKind: ev.slideKind ?? null,
      chordSize,
      pack,
      destination: destination || getMixDestination(),
    });
  }

  function scheduleDrumVoice(ev, when, velocity, destination) {
    const session = packSessionReady();
    if (!session) return null;
    const manifest = getPack('core-drums');
    if (!manifest) return null;
    const midiOrArt = ev.midi != null ? ev.midi : drumInstrument(ev);
    const sample = pickDrumSample(manifest, midiOrArt);
    if (!sample) return null;
    const buffer = session.buffers[packBufferKey(manifest.id, sample.file)];
    if (!buffer) return null;
    return playDrumSample({
      audioCtx,
      buffer,
      when,
      velocity,
      destination: destination || getMixDestination(),
      gainTrim: sample.gainTrim ?? 1,
    });
  }

  function registerVoice(voice) {
    state.voices.push(voice);
    const cleanup = () => {
      const at = state.voices.indexOf(voice);
      if (at >= 0) state.voices.splice(at, 1);
      try { voice.gain?.disconnect(); } catch (e) { /* ignore */ }
    };
    if (typeof voice.release === 'function') {
      if (typeof voice.osc?.addEventListener === 'function') {
        voice.osc.addEventListener('ended', cleanup, { once: true });
      } else if (voice.osc) {
        voice.osc.onended = cleanup;
      }
      return;
    }
    if (typeof voice.osc?.addEventListener === 'function') {
      voice.osc.addEventListener('ended', cleanup, { once: true });
    } else if (voice.osc) {
      voice.osc.onended = cleanup;
    }
  }

  function fadeVoices() {
    const voices = state.voices;
    state.voices = [];
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    voices.forEach((v) => {
      try {
        if (typeof v.release === 'function') {
          v.release(now);
          return;
        }
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0.0001, now + VOICE_FADE_SEC);
        v.osc.stop(now + VOICE_FADE_SEC + 0.002);
      } catch (e) { /* ignore */ }
    });
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

  /**
   * The audio clock origin that the scheduler uses.
   *
   * A caller that draws on every animation frame must read the same clock as
   * the scheduler. play() starts the sound a short time after the tap, so a
   * second clock that starts at the tap runs ahead of the sound.
   * `holdSec` names a song time to hold, for a loop rest or a pause.
   *
   * @returns {{ originSongSec: number, originAudioTime: number, holdSec: number|null }}
   */
  function getClockAnchor() {
    if (!state.playing || !audioCtx) {
      return { originSongSec: state.pauseAtSec, originAudioTime: 0, holdSec: state.pauseAtSec };
    }
    if (state.inLoopRest) {
      const hold = state.loop?.startSec ?? state.pauseAtSec;
      return { originSongSec: hold, originAudioTime: state.originAudioTime, holdSec: hold };
    }
    return {
      originSongSec: state.originSongSec,
      originAudioTime: state.originAudioTime,
      holdSec: null,
    };
  }

  function resyncCursor(fromSec) {
    state.nextIndex = 0;
    state.wrapPos = 0;
    const events = state.events;
    while (
      state.nextIndex < events.length
      && wallSecFromEvent(events[state.nextIndex]) < fromSec - 0.0001
    ) state.nextIndex += 1;
    // The metronome counts in play-order quarters, the same space that the
    // timeline uses. Written-score beats do not work, because a repeat makes
    // one written bar sound more than one time.
    const metroBeat = state.timeline
      ? state.timeline.quarterAtSeconds(fromSec)
      : (fromSec / 60) * (state.baseBpm * state.rate);
    state.nextMetroBeat = snapMetroBeatToGrid(metroBeat, state.metroConfig.subdiv);
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

  function trackBusKey(kind, index) {
    return `${kind === 'drum' ? 'drum' : 'guitar'}:${index}`;
  }

  function syncMuteSoloBuses() {
    const mutedKeys = [];
    state.enabledGuitars.forEach((on, i) => {
      if (!on) mutedKeys.push(trackBusKey('guitar', i));
    });
    state.enabledDrums.forEach((on, i) => {
      if (!on) mutedKeys.push(trackBusKey('drum', i));
    });
    let soloKey = null;
    const enabledTotal = state.enabledGuitars.filter(Boolean).length
      + state.enabledDrums.filter(Boolean).length;
    if (enabledTotal === 1) {
      const gi = state.enabledGuitars.findIndex(Boolean);
      if (gi >= 0) soloKey = trackBusKey('guitar', gi);
      else {
        const di = state.enabledDrums.findIndex(Boolean);
        if (di >= 0) soloKey = trackBusKey('drum', di);
      }
    }
    setTrackMuteSolo({ mutedKeys, soloKey });
  }

  function ensureTrackGains() {
    ensureAudio();
    if (!state.voiceFactory) state.voiceFactory = createVoiceFactory(audioCtx);
    while (state.trackGains.guitar.length < state.guitarModels.length) {
      const i = state.trackGains.guitar.length;
      const vol = state.trackVolumes.guitar[i] ?? 1;
      const pan = state.trackPans.guitar[i] ?? 0;
      const busInput = getTrackBus(trackBusKey('guitar', i), { volume: vol, pan });
      if (busInput) {
        state.trackGains.guitar.push(busInput);
      } else {
        const g = audioCtx.createGain();
        g.gain.value = vol;
        g.connect(getMixDestination());
        state.trackGains.guitar.push(g);
      }
    }
    while (state.trackGains.drum.length < state.drumModels.length) {
      const i = state.trackGains.drum.length;
      const vol = state.trackVolumes.drum[i] ?? 1;
      const pan = state.trackPans.drum[i] ?? 0;
      const busInput = getTrackBus(trackBusKey('drum', i), { volume: vol, pan });
      if (busInput) {
        state.trackGains.drum.push(busInput);
      } else {
        const g = audioCtx.createGain();
        g.gain.value = vol;
        g.connect(getMixDestination());
        state.trackGains.drum.push(g);
      }
    }
    syncMuteSoloBuses();
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
    state.loopEventIdx = null;
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

  function guitarChordSize(ev) {
    const onset = wallSecFromEvent(ev);
    let count = 0;
    for (const e of state.events) {
      if (e.kind !== 'guitar') continue;
      if (Math.abs(wallSecFromEvent(e) - onset) < CHORD_ONSET_EPS) count += 1;
    }
    return Math.max(1, count);
  }

  function scheduleEvent(ev, when, now) {
    if (state.destroyed || !state.voiceFactory) return;
    // A late note must still sound. The engine used to drop any note whose
    // time had passed, so one slow frame deleted notes from the score and the
    // learner heard a skip. Play a late note now instead. Only a note that is
    // very late belongs to a position the learner already left.
    if (when < now - MAX_LATE_SEC) return;
    const at = Math.max(now + 0.004, when);
    const dur = eventDurWall(ev);
    if (ev.kind === 'guitar') {
      ensureTrackGains();
      const dest = state.trackGains.guitar[ev.trackIndex] || getMixDestination();
      const chordSize = guitarChordSize(ev);
      registerVoice(scheduleGuitarVoice(
        state.voiceFactory,
        ev,
        at,
        dur || 0.2,
        dest,
        chordSize,
      ));
    } else if (ev.kind === 'drum') {
      ensureTrackGains();
      const vel = ev.velocity ?? 0.78;
      const dest = state.trackGains.drum[ev.trackIndex] || getMixDestination();
      const voice = scheduleDrumVoice(ev, at, vel, dest);
      if (voice) registerVoice(voice);
      else scheduleHit(drumInstrument(ev), at, vel);
    }
  }

  /**
   * Seconds for one metronome beat position.
   *
   * The click must follow the tempo map of the score. A score that shifts
   * from 80 BPM to 90 BPM moves every later beat, and a scalar tempo puts the
   * click in the wrong place from the first shift onward. The timeline holds
   * the tempo segments, so the click reads its time from there.
   */
  function metroBeatSec(beat) {
    if (state.timeline?.secondsAtQuarter) return state.timeline.secondsAtQuarter(beat);
    return beat * (60 / (state.baseBpm * state.rate));
  }

  function scheduleMetronome(horizon, now) {
    if (!state.metronomeEnabled || state.inLoopRest) return;
    const loopStart = state.loop?.startSec ?? 0;
    const loopEnd = state.loop?.endSec ?? Infinity;
    const metro = state.metroConfig;
    let guard = 0;
    while (metroBeatSec(state.nextMetroBeat) <= horizon + 1e-9) {
      guard += 1;
      if (guard > 4096) break;
      const beatSec = metroBeatSec(state.nextMetroBeat);
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

  /**
   * Collect the indexes of the events inside the loop window, in time order.
   * The wrap scheduler walks this list with a cursor, so it schedules each
   * note of the next pass one time only.
   */
  function rebuildLoopEventIndex() {
    state.loopEventIdx = [];
    state.wrapPos = 0;
    if (!state.loop) return;
    for (let i = 0; i < state.events.length; i += 1) {
      const evSec = wallSecFromEvent(state.events[i]);
      if (evSec < state.loop.startSec - 1e-6) continue;
      if (evSec >= state.loop.endSec - 1e-6) continue;
      state.loopEventIdx.push(i);
    }
  }

  /**
   * Schedule the start of the next loop pass inside the current lookahead
   * window. This keeps the boundary gapless. The cursor stops a note from
   * sounding more than one time, which would make an audible flam.
   */
  function scheduleLoopWrapEvents(songNow, horizon, now) {
    if (!state.loop || state.inLoopRest) return;
    // A loop rest is a wanted silence, so the next pass must not start early.
    if ((Number(state.loop.restSec) || 0) > 0) return;
    if (state.loop.endSec - state.loop.startSec <= 0) return;
    if (songNow + SCHEDULE_AHEAD < state.loop.endSec - 0.001) return;
    if (!state.loopEventIdx) rebuildLoopEventIndex();

    const wrapBase = state.loop.endSec;
    while (state.wrapPos < state.loopEventIdx.length) {
      const ev = state.events[state.loopEventIdx[state.wrapPos]];
      const schedSongSec = wrapBase + (wallSecFromEvent(ev) - state.loop.startSec);
      if (schedSongSec > horizon + 1e-6) break;
      const when = state.originAudioTime + (schedSongSec - state.originSongSec);
      scheduleEvent(ev, when, now);
      state.wrapPos += 1;
    }
  }

  /**
   * Arm the next scheduler tick.
   *
   * The tick must be armed before any user interface work runs. The onTick
   * callback repaints the score view, and that work used to run first, so a
   * slow repaint pushed the next audio tick out by the same amount. The audio
   * then fell behind its window and the sound broke up.
   */
  function armNextTick() {
    if (!state.playing || state.destroyed) return;
    state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function scheduler() {
    if (!state.playing || !audioCtx || state.destroyed) return;
    const now = audioCtx.currentTime;
    // Arm the next tick first. Every path below may repaint the score view
    // through onTick, and that work must not delay the audio.
    armNextTick();

    if (state.loop && state.inLoopRest) {
      if (now < state.loopRestUntil - 0.001) {
        emitTick();
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
        return;
      }
      state.loopPassCount += 1;
      state.loopRestartFlag = true;
      if (state.onLoopPass) state.onLoopPass({ passCount: state.loopPassCount });
      // The wrap scheduler already started this many notes of the new pass.
      const preScheduled = state.wrapPos;
      state.originSongSec = state.loop.startSec + (songNow - state.loop.endSec);
      state.originAudioTime = now;
      songNow = state.originSongSec;
      resyncCursor(songNow);
      if (preScheduled > 0 && state.loopEventIdx) {
        const resumeAt = state.loopEventIdx[preScheduled];
        state.nextIndex = Math.max(
          state.nextIndex,
          resumeAt != null ? resumeAt : state.events.length,
        );
      }
      state.wrapPos = 0;
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
  }

  function applyRateTimeline() {
    if (!state.baseTimeline) {
      state.timeline = null;
      return;
    }
    state.timeline = state.baseTimeline.withRate(state.rate);
  }

  function releaseOwnerIfHeld() {
    if (!state.audioHandle) return;
    const handle = state.audioHandle;
    state.audioHandle = null;
    releaseAudio(handle);
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
      trackVolumes: paramTrackVolumes = null,
      trackPans: paramTrackPans = null,
      scoreId = null,
    } = params;

    stop({ releaseOwner: true });
    state.endedFired = false;
    if (scoreId != null) state.scoreId = String(scoreId);
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

    const firstMixLoad = !state.trackMixInitialized;
    state.trackVolumes.guitar.length = state.guitarModels.length;
    state.trackVolumes.drum.length = state.drumModels.length;
    state.trackPans.guitar.length = state.guitarModels.length;
    state.trackPans.drum.length = state.drumModels.length;

    for (let i = 0; i < state.guitarModels.length; i += 1) {
      if (paramTrackVolumes?.guitar?.[i] != null) {
        state.trackVolumes.guitar[i] = clampGain(paramTrackVolumes.guitar[i]);
      } else if (firstMixLoad || state.trackVolumes.guitar[i] == null) {
        state.trackVolumes.guitar[i] = sourceVolumeFromModel(state.guitarModels[i]);
      }
      if (paramTrackPans?.guitar?.[i] != null) {
        state.trackPans.guitar[i] = sourcePanFromModel({ trackInfo: { pan: paramTrackPans.guitar[i] } });
      } else if (firstMixLoad || state.trackPans.guitar[i] == null) {
        state.trackPans.guitar[i] = sourcePanFromModel(state.guitarModels[i]);
      }
    }
    for (let i = 0; i < state.drumModels.length; i += 1) {
      if (paramTrackVolumes?.drum?.[i] != null) {
        state.trackVolumes.drum[i] = clampGain(paramTrackVolumes.drum[i]);
      } else if (firstMixLoad || state.trackVolumes.drum[i] == null) {
        state.trackVolumes.drum[i] = sourceVolumeFromModel(state.drumModels[i]);
      }
      if (paramTrackPans?.drum?.[i] != null) {
        state.trackPans.drum[i] = sourcePanFromModel({ trackInfo: { pan: paramTrackPans.drum[i] } });
      } else if (firstMixLoad || state.trackPans.drum[i] == null) {
        state.trackPans.drum[i] = sourcePanFromModel(state.drumModels[i]);
      }
    }
    state.trackMixInitialized = true;
    state.trackGains.guitar = [];
    state.trackGains.drum = [];

    if (metronome?.config) {
      state.metroConfig = normalizeMetronomeConfig({ ...state.metroConfig, ...metronome.config });
    }
    if (metronome?.enabled != null) state.metronomeEnabled = !!metronome.enabled;
    if (metronomeEnabled != null) state.metronomeEnabled = !!metronomeEnabled;

    // The click accent falls on the first beat of each sounding bar, so the
    // bar starts must use play-order quarters, the same space as the clicks.
    state.measureStarts = state.timeline?.barStartQuarters
      ? state.timeline.barStartQuarters()
      : buildMeasureStarts(state.referenceModel);

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

  function playStale(token) {
    return state.destroyed || state.playGeneration !== token;
  }

  async function play({ fromSec = null } = {}) {
    if (state.destroyed) return;
    const token = ++state.playGeneration;

    ensureAudio();
    if (!state.events.length) rebuildEvents();

    if (!state.timeline?.events?.length && !state.metronomeEnabled) {
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
      if (playStale(token)) return;
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

    if (playStale(token)) return;

    const handle = claimAudio({
      id: 'gp-player',
      label: 'Guitar Pro',
      kind: 'score',
      onStop: () => {
        if (state.ownerCallbackActive) return;
        state.ownerCallbackActive = true;
        try {
          stopInternal({ releaseOwner: false });
        } finally {
          state.ownerCallbackActive = false;
          state.audioHandle = null;
        }
      },
      onPause: () => { pause(); },
      canPause: true,
    });
    if (!handle) return;

    state.audioHandle = handle;
    state.playbackSource = canUsePackOnNextStart(state.scoreId) ? 'pack' : 'synth';

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

  function stopInternal({ releaseOwner = false } = {}) {
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
    if (releaseOwner && !state.ownerCallbackActive) releaseOwnerIfHeld();
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

  function stop(opts = {}) {
    const releaseOwner = opts?.releaseOwner !== false;
    stopInternal({ releaseOwner });
  }

  /** Jump to a song position without starting playback. */
  function seek(sec) {
    if (state.destroyed) return;
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
    if (state.destroyed) return;
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
    const oldRate = state.rate;
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
    state.loopEventIdx = null;
    if (state.loop) {
      const restSec = state.lastLoopRestSec;
      if (state.lastLoopMeasures && state.referenceModel?.measures?.length) {
        state.loop = loopFromMeasures(
          state.referenceModel,
          state.lastLoopMeasures,
          state.timeline,
          state.allGuitarNotes,
          restSec,
          state.rate,
        );
      } else {
        const ratio = oldRate / state.rate;
        state.loop = {
          startSec: state.loop.startSec * ratio,
          endSec: state.loop.endSec * ratio,
          restSec: state.loop.restSec,
        };
      }
    }
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
    syncMuteSoloBuses();
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
    const key = trackBusKey(kind, index);
    setTrackBusGain(key, vols[index]);
    const node = gains[index];
    if (node?.gain) node.gain.value = vols[index];
  }

  function setTrackPan(kind, index, pan) {
    const pans = kind === 'drum' ? state.trackPans.drum : state.trackPans.guitar;
    if (index < 0 || index >= pans.length) return;
    pans[index] = Math.max(-1, Math.min(1, Number(pan) || 0));
    const key = trackBusKey(kind, index);
    setTrackBusPan(key, pans[index]);
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
    state.nextMetroBeat = snapMetroBeatToGrid(
      state.timeline ? pos.quarter : pos.beatInScore,
      state.metroConfig.subdiv,
    );
    if (!state.playing) emitTick();
  }

  function setLoop(loop) {
    state.loopEventIdx = null;
    state.wrapPos = 0;
    if (!loop) {
      state.loop = null;
      state.inLoopRest = false;
      state.lastLoopMeasures = null;
      return;
    }
    if (loop.enabled === false) {
      state.loop = null;
      state.inLoopRest = false;
      state.lastLoopMeasures = null;
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
      state.lastLoopMeasures = [loop.startBarIndex, loop.endBarIndex];
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
    if (state.destroyed) return;
    state.destroyed = true;
    state.playGeneration += 1;
    const wasPlaying = state.playing;
    stopInternal({ releaseOwner: true });
    fadeVoices();
    stopTimer();
    stopFrameLoop();
    state.onTick = null;
    state.onPositionFrame = null;
    state.onAudioBlocked = null;
    state.onLoopPass = null;
    state.onEnded = null;
    for (const g of state.trackGains.guitar) {
      if (isTrackBusInput(g)) continue;
      try { g.disconnect(); } catch (e) { /* ignore */ }
    }
    for (const g of state.trackGains.drum) {
      if (isTrackBusInput(g)) continue;
      try { g.disconnect(); } catch (e) { /* ignore */ }
    }
    state.trackGains.guitar = [];
    state.trackGains.drum = [];
    if (state.voiceFactory?.stopAll) state.voiceFactory.stopAll();
    state.voiceFactory = null;
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
    setTrackPan,
    setMetronomeEnabled,
    setMetronomeConfig,
    setLoop,
    setLoopRestSec,
    setOnTick,
    getPosition,
    getClockAnchor,
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
    get playbackSource() { return state.playbackSource; },
    get guitarNotes() { return state.allGuitarNotes; },
    get events() { return state.events; },
    get range() { return { ...state.range }; },
  };
}
