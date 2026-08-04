// Tempo-aware Guitar Pro / TabModel scheduler.
//
// Schedules pitched events onto the shared Web Audio bus with a look-ahead
// loop (same pattern as metronome / drums). When the model carries
// start/duration (quarter-note units) and tempo, playback is musical; otherwise
// it falls back to equal-slot timing for ASCII tabs.

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from '../audio.js';
import { modelHasRhythm, quartersToSeconds } from './tabModel.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

/**
 * Build a flat timed note list from a TabModel.
 * @returns {{ startSec:number, durSec:number, midi:number, techniques:string[], measureIndex:number, slot:number }[]}
 */
export function buildTimedNotes(model, { bpm = null, slotStepSec = 0.16 } = {}) {
  if (!model || !Array.isArray(model.events)) return [];
  const useRhythm = modelHasRhythm(model);
  const tempo = Number(bpm) || Number(model.tempo) || 120;
  const measures = model.measures || [];

  const measureIndexAt = (start, slot) => {
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      if (useRhythm && Number.isFinite(m.startBeat) && Number.isFinite(m.endBeat)) {
        if (start >= m.startBeat && start < m.endBeat) return i;
      } else if (slot >= m.startSlot && slot < m.endSlot) return i;
    }
    return Math.max(0, measures.length - 1);
  };

  if (useRhythm) {
    return model.events
      .filter((e) => e.midi != null && !e.dead)
      .map((e) => {
        const startQ = Number.isFinite(e.start) ? e.start : 0;
        const durQ = Number.isFinite(e.duration) && e.duration > 0 ? e.duration : 1;
        return {
          startSec: quartersToSeconds(startQ, tempo),
          durSec: Math.max(0.05, quartersToSeconds(durQ, tempo) * 0.95),
          midi: e.midi,
          techniques: e.techniques || [],
          measureIndex: measureIndexAt(startQ, e.slot),
          slot: e.slot,
          startBeat: startQ,
        };
      })
      .sort((a, b) => a.startSec - b.startSec);
  }

  // Equal-slot fallback for ASCII / untimed models.
  const pitched = model.events.filter((e) => e.midi != null && !e.dead);
  const slots = [...new Set(pitched.map((e) => e.slot))].sort((a, b) => a - b);
  const slotIndex = new Map(slots.map((s, i) => [s, i]));
  return pitched.map((e) => {
    const idx = slotIndex.get(e.slot) || 0;
    return {
      startSec: idx * slotStepSec,
      durSec: slotStepSec * 1.5,
      midi: e.midi,
      techniques: e.techniques || [],
      measureIndex: measureIndexAt(0, e.slot),
      slot: e.slot,
      startBeat: idx,
    };
  }).sort((a, b) => a.startSec - b.startSec);
}

function scheduleTone(midi, when, dur, techniques = []) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const muted = techniques.includes('palmMute') || techniques.includes('dead');
  osc.type = muted ? 'square' : 'triangle';
  osc.frequency.value = midiFreq(midi);
  const peak = muted ? 0.08 : 0.18;
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

/**
 * Create a TabPlayer controller.
 *
 * @param {object} [opts]
 * @param {(info:{playing:boolean, currentSec:number, measureIndex:number})=>void} [opts.onTick]
 */
export function createTabPlayer(opts = {}) {
  const state = {
    notes: [],
    playing: false,
    paused: false,
    pauseAtSec: 0,
    originAudioTime: 0,
    originSongSec: 0,
    nextNoteIndex: 0,
    timer: null,
    voices: [],
    loop: null, // { startSec, endSec } | null
    bpm: 120,
    onTick: typeof opts.onTick === 'function' ? opts.onTick : null,
    measureIndex: 0,
  };

  function clearVoices() {
    state.voices.forEach((v) => {
      try { v.osc.stop(); } catch (e) { /* already stopped */ }
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
    return state.originSongSec + (audioCtx.currentTime - state.originAudioTime);
  }

  function emitTick() {
    if (!state.onTick) return;
    state.onTick({
      playing: state.playing,
      currentSec: songTimeNow(),
      measureIndex: state.measureIndex,
      bpm: state.bpm,
    });
  }

  function scheduler() {
    if (!state.playing || !audioCtx) return;
    const now = audioCtx.currentTime;
    const songNow = state.originSongSec + (now - state.originAudioTime);
    const horizon = songNow + SCHEDULE_AHEAD;

    // Loop wrap.
    if (state.loop && songNow >= state.loop.endSec - 0.001) {
      const loopLen = Math.max(0.01, state.loop.endSec - state.loop.startSec);
      const overshoot = songNow - state.loop.startSec;
      const wrapped = state.loop.startSec + (overshoot % loopLen);
      state.originSongSec = wrapped;
      state.originAudioTime = now;
      // Resync note cursor to first note at/after loop start.
      state.nextNoteIndex = 0;
      while (
        state.nextNoteIndex < state.notes.length &&
        state.notes[state.nextNoteIndex].startSec < state.loop.startSec - 0.0001
      ) {
        state.nextNoteIndex += 1;
      }
      emitTick();
    }

    const songHorizon = state.originSongSec + (now - state.originAudioTime) + SCHEDULE_AHEAD;
    while (state.nextNoteIndex < state.notes.length) {
      const note = state.notes[state.nextNoteIndex];
      if (state.loop && note.startSec >= state.loop.endSec - 0.0001) break;
      if (note.startSec > songHorizon) break;
      const when = state.originAudioTime + (note.startSec - state.originSongSec);
      if (when >= now - 0.02) {
        state.voices.push(scheduleTone(note.midi, Math.max(now + 0.005, when), note.durSec, note.techniques));
        state.measureIndex = note.measureIndex;
      }
      state.nextNoteIndex += 1;
    }

    // End of song (no loop).
    if (!state.loop && state.nextNoteIndex >= state.notes.length) {
      const endSec = state.notes.length
        ? state.notes[state.notes.length - 1].startSec + state.notes[state.notes.length - 1].durSec
        : 0;
      if (songTimeNow() >= endSec) {
        stop();
        emitTick();
        return;
      }
    }

    emitTick();
    state.timer = setTimeout(scheduler, LOOKAHEAD_MS);
    void horizon;
  }

  function load(model, { bpm = null, loopMeasures = null } = {}) {
    stop();
    const tempo = Number(bpm) || Number(model?.tempo) || 120;
    state.bpm = tempo;
    state.notes = buildTimedNotes(model, { bpm: tempo });
    state.loop = null;
    if (loopMeasures && model?.measures?.length) {
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
        // Equal-slot: map slots via buildTimedNotes positions.
        const inRange = state.notes.filter((n) => n.measureIndex >= startIdx && n.measureIndex <= endIdx);
        if (inRange.length) {
          state.loop = {
            startSec: inRange[0].startSec,
            endSec: inRange[inRange.length - 1].startSec + inRange[inRange.length - 1].durSec,
          };
        }
      } else if (endSec > startSec) {
        state.loop = { startSec, endSec };
      }
    }
  }

  function play({ fromSec = null } = {}) {
    if (!state.notes.length) return;
    ensureAudio();
    clearVoices();
    stopTimer();
    const startSec = fromSec != null ? fromSec : (state.paused ? state.pauseAtSec : (state.loop ? state.loop.startSec : 0));
    state.originSongSec = startSec;
    state.originAudioTime = audioCtx.currentTime + 0.05;
    state.nextNoteIndex = 0;
    while (
      state.nextNoteIndex < state.notes.length &&
      state.notes[state.nextNoteIndex].startSec < startSec - 0.0001
    ) {
      state.nextNoteIndex += 1;
    }
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
    stopTimer();
    clearVoices();
    emitTick();
  }

  function stop() {
    state.playing = false;
    state.paused = false;
    state.pauseAtSec = state.loop ? state.loop.startSec : 0;
    state.nextNoteIndex = 0;
    state.measureIndex = 0;
    stopTimer();
    clearVoices();
    emitTick();
  }

  function setBpm(bpm, model) {
    const wasPlaying = state.playing;
    const at = songTimeNow();
    const ratio = state.bpm > 0 ? (Number(bpm) || state.bpm) / state.bpm : 1;
    load(model, { bpm: Number(bpm) || state.bpm, loopMeasures: null });
    // Preserve relative position when only tempo changes mid-play.
    if (wasPlaying) play({ fromSec: at * (state.notes.length ? 1 : ratio) });
    else state.pauseAtSec = at;
    // Re-apply loop in seconds after reload if caller sets it again.
  }

  return {
    load,
    play,
    pause,
    stop,
    setBpm,
    get playing() { return state.playing; },
    get paused() { return state.paused; },
    get bpm() { return state.bpm; },
    get notes() { return state.notes; },
    get currentSec() { return songTimeNow(); },
    get measureIndex() { return state.measureIndex; },
    get durationSec() {
      if (!state.notes.length) return 0;
      const last = state.notes[state.notes.length - 1];
      return last.startSec + last.durSec;
    },
    setLoop(loop) { state.loop = loop; },
    setOnTick(fn) { state.onTick = fn; },
  };
}
