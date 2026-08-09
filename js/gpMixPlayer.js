// Multi-track Guitar Pro mix player: all fretted + drum tracks, per-track mute,
// loop/rest, and optional score metronome on one clock.

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { quartersToSeconds, modelHasRhythm } from './tab/tabModel.js';
import { buildTimedNotes } from './tab/tabPlayer.js';
import { scheduleHit, initEngine } from './drums/drumEngine.js';
import { scheduleMetronomeClick } from './tab/metroClick.js';
import { measureIndexAtBeat } from './gpPlayer/rangeUtils.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;

function scheduleGuitarTone(midi, when, dur, techniques = []) {
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
  gain.connect(getAnalyserDestination());
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
      instrument: e.instrument,
      velocity: Number.isFinite(e.velocity) ? e.velocity : 0.78,
      startBeat: Number.isFinite(e.start) ? e.start : 0,
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

function isMeasureStartBeat(measureStarts, beat, referenceModel) {
  if (measureStarts.length) {
    for (const ms of measureStarts) {
      if (Math.abs(ms - beat) < 1e-5) return true;
    }
    return false;
  }
  const measures = referenceModel?.measures;
  if (measures?.length) {
    const m0 = measures[0];
    const len = (Number.isFinite(m0.endBeat) && Number.isFinite(m0.startBeat))
      ? (m0.endBeat - m0.startBeat)
      : null;
    if (len && len > 0) return beat % len < 1e-6;
  }
  return beat % 4 < 1e-6;
}

function buildMeasureStarts(model) {
  if (!model?.measures?.length) return [];
  return model.measures
    .map((m) => (Number.isFinite(m.startBeat) ? m.startBeat : m.startSlot))
    .filter((b) => Number.isFinite(b));
}

function loopFromMeasures(model, loopMeasures, tempo, guitarNotes, restSec) {
  if (!loopMeasures || !model?.measures?.length) return null;
  const [a, b] = loopMeasures;
  const startIdx = Math.max(0, Math.min(model.measures.length - 1, a));
  const endIdx = Math.max(startIdx, Math.min(model.measures.length - 1, b));
  const startM = model.measures[startIdx];
  const endM = model.measures[endIdx];
  const startBeat = Number.isFinite(startM.startBeat) ? startM.startBeat : startM.startSlot;
  const endBeat = Number.isFinite(endM.endBeat) ? endM.endBeat : endM.endSlot;
  const startSec = quartersToSeconds(startBeat, tempo);
  let endSec = quartersToSeconds(endBeat, tempo);
  if (!modelHasRhythm(model)) {
    const inRange = guitarNotes.filter((n) => n.measureIndex >= startIdx && n.measureIndex <= endIdx);
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

/**
 * @param {object} [opts]
 * @param {(info:object)=>void} [opts.onTick]
 */
export function createGpMixPlayer(opts = {}) {
  const state = {
    guitarModels: [],
    drumModels: [],
    allGuitarNotes: [],
    allDrumHits: [],
    events: [],
    nextIndex: 0,
    nextMetroBeat: 0,
    measureStarts: [],
    referenceModel: null,
    playing: false,
    paused: false,
    pauseAtSec: 0,
    originAudioTime: 0,
    originSongSec: 0,
    timer: null,
    voices: [],
    bpm: 120,
    enabledGuitars: [],
    enabledDrums: [],
    metronomeEnabled: false,
    loop: null,
    inLoopRest: false,
    loopRestUntil: 0,
    range: { startBeat: 0, endBeat: null },
    onTick: typeof opts.onTick === 'function' ? opts.onTick : null,
    measureIndex: 0,
    lastLoopMeasures: null,
    lastLoopRestSec: 0,
  };

  function clearVoices() {
    state.voices.forEach((v) => {
      try { v.osc.stop(); } catch (e) { /* ignore */ }
    });
    state.voices = [];
  }

  function stopTimer() {
    if (state.timer != null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function songTimeNow() {
    if (!state.playing || !audioCtx) return state.pauseAtSec;
    if (state.inLoopRest) return state.loop?.endSec ?? state.pauseAtSec;
    const raw = state.originSongSec + (audioCtx.currentTime - state.originAudioTime);
    return Math.max(state.originSongSec, raw);
  }

  function restRemaining() {
    if (!state.playing || !state.inLoopRest || !audioCtx) return 0;
    return Math.max(0, state.loopRestUntil - audioCtx.currentTime);
  }

  function durationSec() {
    if (state.loop) return state.loop.endSec;
    if (state.range.endBeat != null) {
      return quartersToSeconds(state.range.endBeat, state.bpm);
    }
    let end = 0;
    for (const e of state.events) {
      const eEnd = e.startSec + (e.durSec || 0.05);
      if (eEnd > end) end = eEnd;
    }
    return end;
  }

  function resyncCursor(fromSec) {
    state.nextIndex = 0;
    while (
      state.nextIndex < state.events.length &&
      state.events[state.nextIndex].startSec < fromSec - 0.0001
    ) state.nextIndex += 1;
    const beat = (fromSec / 60) * state.bpm;
    state.nextMetroBeat = Math.max(0, Math.floor(beat + 1e-9));
  }

  function emitTick() {
    if (!state.onTick) return;
    const sec = songTimeNow();
    const beat = (sec / 60) * state.bpm;
    const measures = state.referenceModel?.measures || [];
    state.measureIndex = measureIndexAtBeat(measures, beat);
    state.onTick({
      playing: state.playing,
      currentSec: sec,
      durationSec: durationSec(),
      measureIndex: state.measureIndex,
      beat,
      bpm: state.bpm,
      resting: !!state.inLoopRest,
      restRemaining: restRemaining(),
    });
  }

  function rebuildEvents() {
    const g = [];
    for (const n of state.allGuitarNotes) {
      if (state.enabledGuitars[n.trackIndex] !== false) {
        g.push({ ...n, kind: 'guitar' });
      }
    }
    const d = [];
    for (const h of state.allDrumHits) {
      if (state.enabledDrums[h.trackIndex] !== false) d.push(h);
    }
    state.events = [...g, ...d].sort((a, b) => a.startSec - b.startSec);
  }

  function scheduleMetronome(horizon, now) {
    if (!state.metronomeEnabled || state.inLoopRest) return;
    const quarterSec = 60 / state.bpm;
    const loopStart = state.loop?.startSec ?? 0;
    const loopEnd = state.loop?.endSec ?? Infinity;
    while (state.nextMetroBeat * quarterSec <= horizon + 1e-9) {
      const beatSec = state.nextMetroBeat * quarterSec;
      if (beatSec >= loopStart - 1e-6 && beatSec < loopEnd - 1e-6) {
        const when = state.originAudioTime + (beatSec - state.originSongSec);
        if (when >= now - 0.02) {
          scheduleMetronomeClick(
            Math.max(now + 0.004, when),
            isMeasureStartBeat(state.measureStarts, state.nextMetroBeat, state.referenceModel)
          );
        }
      }
      state.nextMetroBeat += 1;
    }
  }

  function scheduler() {
    if (!state.playing || !audioCtx) return;
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
      clearVoices();
      if (rest > 0) {
        state.inLoopRest = true;
        state.loopRestUntil = now + rest;
        state.originSongSec = state.loop.endSec;
        state.originAudioTime = now;
        emitTick();
        state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
        return;
      }
      state.originSongSec = state.loop.startSec;
      state.originAudioTime = now;
      resyncCursor(state.loop.startSec);
      songNow = state.loop.startSec;
      emitTick();
    }

    const horizon = state.originSongSec + (now - state.originAudioTime) + SCHEDULE_AHEAD;
    while (state.nextIndex < state.events.length) {
      const ev = state.events[state.nextIndex];
      if (state.loop && ev.startSec >= state.loop.endSec - 0.0001) break;
      if (ev.startSec > horizon) break;
      const when = state.originAudioTime + (ev.startSec - state.originSongSec);
      if (when >= now - 0.02) {
        if (ev.kind === 'guitar') {
          state.voices.push(scheduleGuitarTone(
            ev.midi,
            Math.max(now + 0.004, when),
            ev.durSec || 0.2,
            ev.techniques
          ));
        } else if (ev.kind === 'drum') {
          scheduleHit(ev.instrument, Math.max(now + 0.004, when), ev.velocity);
        }
      }
      state.nextIndex += 1;
    }

    scheduleMetronome(horizon, now);

    if (!state.loop && state.nextIndex >= state.events.length) {
      if (songTimeNow() >= durationSec()) {
        stop();
        emitTick();
        return;
      }
    }

    emitTick();
    state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function buildNotesFromModels(guitarModels, drumModels, tempo) {
    let gNotes = [];
    guitarModels.forEach((model, i) => {
      if (!model) return;
      const notes = buildTimedNotes(model, { bpm: tempo });
      notes.forEach((n) => gNotes.push({ ...n, trackIndex: i, kind: 'guitar' }));
    });
    gNotes.sort((a, b) => a.startSec - b.startSec);

    let dHits = [];
    drumModels.forEach((model, i) => {
      if (!model) return;
      dHits = dHits.concat(buildTimedDrums(model, tempo, i));
    });
    dHits.sort((a, b) => a.startSec - b.startSec);
    return { gNotes, dHits };
  }

  function load({
    guitarModels = [],
    drumModels = [],
    bpm = null,
    loopMeasures = null,
    loopBeats = null,
    loopRestSec = 0,
    enabledGuitars = null,
    enabledDrums = null,
    metronomeEnabled = null,
    referenceModel = null,
  } = {}) {
    stop();
    state.guitarModels = guitarModels.filter(Boolean);
    state.drumModels = drumModels.filter(Boolean);
    const tempo = Number(bpm)
      || Number(state.guitarModels[0]?.tempo)
      || Number(state.drumModels[0]?.tempo)
      || 120;
    state.bpm = tempo;
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
    if (metronomeEnabled != null) state.metronomeEnabled = !!metronomeEnabled;

    state.referenceModel = referenceModel
      || state.guitarModels[0]
      || state.drumModels[0]
      || null;
    state.measureStarts = buildMeasureStarts(state.referenceModel);

    const { gNotes, dHits } = buildNotesFromModels(state.guitarModels, state.drumModels, tempo);

    let startBeat = 0;
    let endBeat = null;
    if (loopBeats) {
      const lbStart = Number(loopBeats.startBeat);
      const lbEnd = loopBeats.endBeat != null ? Number(loopBeats.endBeat) : null;
      // An empty window would filter out every note and leave nothing to play.
      const usable = Number.isFinite(lbStart) && (lbEnd == null || lbEnd > lbStart);
      if (usable) {
        startBeat = lbStart;
        endBeat = lbEnd;
      }
    }
    state.range = { startBeat, endBeat };

    const startSec = quartersToSeconds(startBeat, tempo);
    const endSec = endBeat != null ? quartersToSeconds(endBeat, tempo) : null;
    let filteredG = gNotes;
    let filteredD = dHits;
    if (startBeat > 0 || endSec != null) {
      filteredG = gNotes.filter((n) => n.startSec >= startSec - 1e-6 && (endSec == null || n.startSec < endSec - 1e-6));
      filteredD = dHits.filter((n) => n.startSec >= startSec - 1e-6 && (endSec == null || n.startSec < endSec - 1e-6));
    }

    state.allGuitarNotes = filteredG;
    state.allDrumHits = filteredD;
    rebuildEvents();

    const restSec = state.lastLoopRestSec;
    state.loop = null;
    if (loopMeasures && state.referenceModel?.measures?.length) {
      state.loop = loopFromMeasures(
        state.referenceModel,
        loopMeasures,
        tempo,
        state.allGuitarNotes,
        restSec
      );
    } else if (loopBeats && endSec != null && endSec > startSec) {
      state.loop = { startSec, endSec, restSec };
    }

    state.pauseAtSec = state.loop ? state.loop.startSec : startSec;
  }

  function play({ fromSec = null } = {}) {
    ensureAudio();
    if (!state.events.length) rebuildEvents();
    if (audioCtx?.state === 'suspended') {
      try { audioCtx.resume(); } catch (e) { /* ignore */ }
    }
    if (!state.events.length && !state.metronomeEnabled) return;
    initEngine();
    clearVoices();
    stopTimer();
    state.inLoopRest = false;
    const defaultStart = state.loop
      ? state.loop.startSec
      : quartersToSeconds(state.range.startBeat || 0, state.bpm);
    const startSec = fromSec != null
      ? fromSec
      : (state.paused ? state.pauseAtSec : defaultStart);
    state.originSongSec = startSec;
    state.originAudioTime = audioCtx.currentTime + 0.06;
    resyncCursor(startSec);
    state.playing = true;
    state.paused = false;
    state.pauseAtSec = startSec;
    scheduler();
    emitTick();
  }

  function pause() {
    if (!state.playing) return;
    state.pauseAtSec = songTimeNow();
    state.playing = false;
    state.paused = true;
    state.inLoopRest = false;
    stopTimer();
    clearVoices();
    emitTick();
  }

  function stop() {
    state.playing = false;
    state.paused = false;
    state.inLoopRest = false;
    state.pauseAtSec = state.loop
      ? state.loop.startSec
      : quartersToSeconds(state.range.startBeat || 0, state.bpm);
    state.nextIndex = 0;
    state.nextMetroBeat = 0;
    state.measureIndex = 0;
    stopTimer();
    clearVoices();
    emitTick();
  }

  /** Jump to a song position without starting playback. */
  function seek(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const was = state.playing;
    if (was) {
      clearVoices();
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
    const beat = (s / 60) * state.bpm;
    state.measureIndex = measureIndexAtBeat(state.referenceModel?.measures || [], beat);
    emitTick();
  }

  function setTrackEnabled(kind, index, enabled) {
    const arr = kind === 'drum' ? state.enabledDrums : state.enabledGuitars;
    if (index < 0 || index >= arr.length) return;
    arr[index] = !!enabled;
    const was = state.playing;
    const at = songTimeNow();
    rebuildEvents();
    if (was) play({ fromSec: at });
    else emitTick();
  }

  function setMetronomeEnabled(on) {
    state.metronomeEnabled = !!on;
    const was = state.playing;
    const at = songTimeNow();
    if (was) play({ fromSec: at });
    else emitTick();
  }

  function setBpm(bpm) {
    const was = state.playing;
    const at = songTimeNow();
    const beat = (at / 60) * state.bpm;
    load({
      guitarModels: state.guitarModels,
      drumModels: state.drumModels,
      bpm: Number(bpm) || state.bpm,
      loopMeasures: state.lastLoopMeasures,
      loopRestSec: state.lastLoopRestSec,
      enabledGuitars: state.enabledGuitars,
      enabledDrums: state.enabledDrums,
      metronomeEnabled: state.metronomeEnabled,
      referenceModel: state.referenceModel,
    });
    const newSec = quartersToSeconds(beat, state.bpm);
    state.pauseAtSec = newSec;
    if (was) play({ fromSec: newSec });
    else emitTick();
  }

  return {
    load,
    play,
    pause,
    stop,
    seek,
    setBpm,
    setTrackEnabled,
    setMetronomeEnabled,
    setLoop(loop) {
      if (!loop) {
        state.loop = null;
        state.inLoopRest = false;
        return;
      }
      state.loop = {
        startSec: Number(loop.startSec) || 0,
        endSec: Number(loop.endSec) || 0,
        restSec: Math.max(0, Number(loop.restSec) || 0),
      };
    },
    setLoopRestSec(sec) {
      if (!state.loop) return;
      state.loop.restSec = Math.max(0, Number(sec) || 0);
      state.lastLoopRestSec = state.loop.restSec;
    },
    setOnTick(fn) { state.onTick = fn; },
    get playing() { return state.playing; },
    get paused() { return state.paused; },
    get bpm() { return state.bpm; },
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
