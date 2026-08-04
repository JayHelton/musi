// Multi-track song practice player: guitar + drums on one clock, with a
// scrolling follow-along visual (tab columns + drum lanes + playhead).

import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { quartersToSeconds, modelHasRhythm } from './tab/tabModel.js';
import { buildTimedNotes } from './tab/tabPlayer.js';
import { scheduleHit, initEngine } from './drums/drumEngine.js';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;
const COL_BEAT = 0.25; // visual column = 16th note

const DRUM_LANES = [
  { key: 'crash', instruments: ['crash'], label: 'C' },
  { key: 'ride', instruments: ['ride'], label: 'R' },
  { key: 'hihat', instruments: ['hihatClosed', 'hihatOpen'], label: 'H' },
  { key: 'snare', instruments: ['snare', 'snareGhost', 'snareFlam'], label: 'S' },
  { key: 'tomHigh', instruments: ['tomHigh'], label: 'T1' },
  { key: 'tomMid', instruments: ['tomMid'], label: 'T2' },
  { key: 'tomFloor', instruments: ['tomFloor'], label: 'FT' },
  { key: 'kick', instruments: ['kick'], label: 'K' },
];

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

function buildTimedDrums(percModel, bpm) {
  if (!percModel?.events?.length) return [];
  const tempo = Number(bpm) || Number(percModel.tempo) || 120;
  return percModel.events
    .filter((e) => e.instrument)
    .map((e) => ({
      kind: 'drum',
      startSec: quartersToSeconds(Number.isFinite(e.start) ? e.start : 0, tempo),
      instrument: e.instrument,
      velocity: Number.isFinite(e.velocity) ? e.velocity : 0.78,
      startBeat: Number.isFinite(e.start) ? e.start : 0,
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

function measureIndexAtBeat(measures, beat) {
  if (!measures?.length) return 0;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const a = Number.isFinite(m.startBeat) ? m.startBeat : 0;
    const b = Number.isFinite(m.endBeat) ? m.endBeat : a;
    if (beat >= a && beat < b) return i;
  }
  return Math.max(0, measures.length - 1);
}

/**
 * Build visual columns for a beat range (16th-note grid).
 * @returns {{ columns: object[], startBeat: number, endBeat: number, stringCount: number }}
 */
export function buildFollowColumns({
  guitarModel = null,
  percModel = null,
  startBeat = 0,
  endBeat = null,
  colBeat = COL_BEAT,
} = {}) {
  const gEnd = guitarModel
    ? (Number.isFinite(guitarModel.totalBeats) ? guitarModel.totalBeats : 0)
    : 0;
  const dEnd = percModel
    ? (Number.isFinite(percModel.totalBeats) ? percModel.totalBeats : 0)
    : 0;
  const end = endBeat != null ? endBeat : Math.max(gEnd, dEnd, startBeat + 4);
  const span = Math.max(colBeat, end - startBeat);
  const count = Math.max(1, Math.ceil(span / colBeat - 1e-9));
  const strings = guitarModel?.strings || [];
  const stringCount = strings.length;

  const columns = [];
  for (let i = 0; i < count; i++) {
    const beat = startBeat + i * colBeat;
    columns.push({
      index: i,
      beat,
      frets: new Array(stringCount).fill(null), // null | number | 'x'
      drums: {},
      barStart: false,
      marker: null,
    });
  }

  const measures = guitarModel?.measures || percModel?.measures || [];
  for (const m of measures) {
    const ms = Number.isFinite(m.startBeat) ? m.startBeat : 0;
    if (ms < startBeat - 1e-6 || ms >= end - 1e-6) continue;
    const idx = Math.round((ms - startBeat) / colBeat);
    if (columns[idx]) {
      columns[idx].barStart = true;
      if (m.marker) columns[idx].marker = m.marker;
    }
  }

  if (guitarModel) {
    for (const ev of guitarModel.events || []) {
      const b = Number.isFinite(ev.start) ? ev.start : 0;
      if (b < startBeat - 1e-6 || b >= end - 1e-6) continue;
      const idx = Math.round((b - startBeat) / colBeat);
      const col = columns[idx];
      if (!col || ev.stringIndex == null || ev.stringIndex < 0 || ev.stringIndex >= stringCount) continue;
      if (ev.dead) col.frets[ev.stringIndex] = 'x';
      else if (ev.fret != null) col.frets[ev.stringIndex] = ev.fret;
    }
  }

  if (percModel) {
    for (const ev of percModel.events || []) {
      const b = Number.isFinite(ev.start) ? ev.start : 0;
      if (b < startBeat - 1e-6 || b >= end - 1e-6) continue;
      const idx = Math.round((b - startBeat) / colBeat);
      const col = columns[idx];
      if (!col || !ev.instrument) continue;
      const lane = DRUM_LANES.find((l) => l.instruments.includes(ev.instrument));
      if (!lane) continue;
      const pri = ev.instrument === 'hihatOpen' || ev.instrument === 'snareFlam' ? 2 : 1;
      if (!col.drums[lane.key] || pri >= (col.drums[lane.key].pri || 0)) {
        col.drums[lane.key] = {
          instrument: ev.instrument,
          pri,
          glyph: ev.instrument === 'hihatOpen' ? 'O'
            : ev.instrument === 'snareGhost' ? 'g'
              : ev.instrument === 'snareFlam' ? 'f' : '●',
        };
      }
    }
  }

  return { columns, startBeat, endBeat: end, stringCount, strings, colBeat };
}

/**
 * Mount a follow-along visual into `host` and return an updater.
 */
export function mountFollowView(host, layout) {
  if (!host) return { update() {}, destroy() {} };
  host.innerHTML = '';
  host.classList.add('sln-follow');

  const { columns, stringCount, strings, colBeat, startBeat } = layout;
  const activeDrumLanes = DRUM_LANES.filter((lane) =>
    columns.some((c) => c.drums[lane.key])
  );

  const head = document.createElement('div');
  head.className = 'sln-follow-meta';
  const metaLeft = document.createElement('span');
  metaLeft.className = 'sln-follow-pos';
  metaLeft.textContent = 'Ready';
  const metaRight = document.createElement('span');
  metaRight.className = 'sln-follow-time';
  head.append(metaLeft, metaRight);
  host.appendChild(head);

  const stage = document.createElement('div');
  stage.className = 'sln-follow-stage';

  const labels = document.createElement('div');
  labels.className = 'sln-follow-labels';
  // Guitar strings high → low (visual top = high E)
  for (let si = stringCount - 1; si >= 0; si--) {
    const lab = document.createElement('div');
    lab.className = 'sln-follow-label';
    lab.textContent = strings[si]?.label || strings[si]?.note || String(si + 1);
    labels.appendChild(lab);
  }
  if (stringCount && activeDrumLanes.length) {
    const gap = document.createElement('div');
    gap.className = 'sln-follow-label sln-follow-gap';
    gap.textContent = '';
    labels.appendChild(gap);
  }
  activeDrumLanes.forEach((lane) => {
    const lab = document.createElement('div');
    lab.className = 'sln-follow-label drum';
    lab.textContent = lane.label;
    labels.appendChild(lab);
  });
  stage.appendChild(labels);

  const viewport = document.createElement('div');
  viewport.className = 'sln-follow-viewport';
  const playhead = document.createElement('div');
  playhead.className = 'sln-follow-playhead';
  viewport.appendChild(playhead);

  const scroller = document.createElement('div');
  scroller.className = 'sln-follow-scroll';

  const grid = document.createElement('div');
  grid.className = 'sln-follow-grid';
  const colEls = [];

  columns.forEach((col, i) => {
    const colEl = document.createElement('div');
    colEl.className = 'sln-follow-col' + (col.barStart ? ' bar-start' : '');
    colEl.dataset.index = String(i);
    if (col.marker) {
      const m = document.createElement('div');
      m.className = 'sln-follow-marker';
      m.textContent = col.marker;
      colEl.appendChild(m);
    }
    for (let si = stringCount - 1; si >= 0; si--) {
      const cell = document.createElement('div');
      cell.className = 'sln-follow-cell guitar';
      const v = col.frets[si];
      cell.textContent = v == null ? '' : String(v);
      if (v != null) cell.classList.add('hit');
      colEl.appendChild(cell);
    }
    if (stringCount && activeDrumLanes.length) {
      const gap = document.createElement('div');
      gap.className = 'sln-follow-cell gap';
      colEl.appendChild(gap);
    }
    activeDrumLanes.forEach((lane) => {
      const cell = document.createElement('div');
      cell.className = 'sln-follow-cell drum';
      const hit = col.drums[lane.key];
      if (hit) {
        cell.textContent = hit.glyph;
        cell.classList.add('hit', hit.instrument);
      }
      colEl.appendChild(cell);
    });
    grid.appendChild(colEl);
    colEls.push(colEl);
  });

  scroller.appendChild(grid);
  viewport.appendChild(scroller);
  stage.appendChild(viewport);
  host.appendChild(stage);

  let lastActive = -1;

  function update({ currentSec = 0, bpm = 120, playing = false, durationSec = 0 } = {}) {
    const beat = (currentSec / 60) * (Number(bpm) || 120);
    const rel = beat - startBeat;
    const idx = Math.max(0, Math.min(columns.length - 1, Math.floor(rel / colBeat + 1e-6)));
    if (idx !== lastActive) {
      if (lastActive >= 0 && colEls[lastActive]) colEls[lastActive].classList.remove('active');
      if (colEls[idx]) colEls[idx].classList.add('active');
      lastActive = idx;
    }
    // Keep active column under the fixed playhead (~28% into the viewport).
    const colEl = colEls[idx];
    if (colEl) {
      const viewW = viewport.clientWidth || 1;
      const target = colEl.offsetLeft - viewW * 0.28;
      scroller.style.transform = `translateX(${-Math.max(0, target)}px)`;
    }
    const bar = columns[idx] ? Math.floor(columns[idx].beat / 4) + 1 : 1;
    metaLeft.textContent = playing
      ? `Bar ~${bar} · beat ${columns[idx] ? columns[idx].beat.toFixed(2) : '—'}`
      : (currentSec > 0.02 ? 'Paused' : 'Ready');
    const fmt = (s) => {
      const n = Math.max(0, Math.floor(s || 0));
      return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    };
    metaRight.textContent = `${fmt(currentSec)} / ${fmt(durationSec)}`;
  }

  return {
    update,
    destroy() {
      host.innerHTML = '';
      host.classList.remove('sln-follow');
    },
  };
}

/**
 * Create a synced guitar + drums song player.
 */
export function createSongPlayer(opts = {}) {
  const state = {
    guitarNotes: [],
    drumHits: [],
    events: [], // merged schedule cursor
    nextIndex: 0,
    playing: false,
    paused: false,
    pauseAtSec: 0,
    originAudioTime: 0,
    originSongSec: 0,
    timer: null,
    voices: [],
    bpm: 120,
    muteGuitar: false,
    muteDrums: false,
    loop: null, // { startSec, endSec, restSec }
    inLoopRest: false,
    loopRestUntil: 0,
    range: { startBeat: 0, endBeat: null },
    guitarModel: null,
    percModel: null,
    onTick: typeof opts.onTick === 'function' ? opts.onTick : null,
    measureIndex: 0,
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
    return state.originSongSec + (audioCtx.currentTime - state.originAudioTime);
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
  }

  function emitTick() {
    if (!state.onTick) return;
    const sec = songTimeNow();
    const beat = (sec / 60) * state.bpm;
    const measures = state.guitarModel?.measures || state.percModel?.measures || [];
    state.measureIndex = measureIndexAtBeat(measures, beat);
    state.onTick({
      playing: state.playing,
      currentSec: sec,
      durationSec: durationSec(),
      measureIndex: state.measureIndex,
      beat,
      bpm: state.bpm,
      muteGuitar: state.muteGuitar,
      muteDrums: state.muteDrums,
      resting: !!state.inLoopRest,
      restRemaining: restRemaining(),
    });
  }

  function rebuildEvents() {
    const g = state.muteGuitar ? [] : state.guitarNotes.map((n) => ({ ...n, kind: 'guitar' }));
    const d = state.muteDrums ? [] : state.drumHits;
    state.events = [...g, ...d].sort((a, b) => a.startSec - b.startSec);
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
        if (ev.kind === 'guitar' && !state.muteGuitar) {
          state.voices.push(scheduleGuitarTone(
            ev.midi,
            Math.max(now + 0.004, when),
            ev.durSec || 0.2,
            ev.techniques
          ));
        } else if (ev.kind === 'drum' && !state.muteDrums) {
          scheduleHit(ev.instrument, Math.max(now + 0.004, when), ev.velocity);
        }
      }
      state.nextIndex += 1;
    }

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

  function load({
    guitarModel = null,
    guitarModels = null,
    percModel = null,
    bpm = null,
    startBeat = 0,
    endBeat = null,
    loop = false,
    loopRestSec = 0,
  } = {}) {
    stop();
    const models = Array.isArray(guitarModels) && guitarModels.length
      ? guitarModels.filter(Boolean)
      : (guitarModel ? [guitarModel] : []);
    // Primary model drives measure markers / follow range when present.
    state.guitarModel = models[0] || guitarModel || null;
    state.percModel = percModel;
    const tempo = Number(bpm)
      || Number(state.guitarModel?.tempo)
      || Number(percModel?.tempo)
      || 120;
    state.bpm = tempo;
    state.range = { startBeat, endBeat };
    state.inLoopRest = false;

    let gNotes = [];
    for (const model of models) {
      gNotes = gNotes.concat(buildTimedNotes(model, { bpm: tempo }));
    }
    gNotes.sort((a, b) => a.startSec - b.startSec);
    let dHits = percModel ? buildTimedDrums(percModel, tempo) : [];

    const startSec = quartersToSeconds(startBeat, tempo);
    const endSec = endBeat != null ? quartersToSeconds(endBeat, tempo) : null;
    if (startBeat > 0 || endSec != null) {
      gNotes = gNotes.filter((n) => n.startSec >= startSec - 1e-6 && (endSec == null || n.startSec < endSec - 1e-6));
      dHits = dHits.filter((n) => n.startSec >= startSec - 1e-6 && (endSec == null || n.startSec < endSec - 1e-6));
    }

    state.guitarNotes = gNotes;
    state.drumHits = dHits;
    rebuildEvents();

    if (loop && endSec != null && endSec > startSec) {
      state.loop = {
        startSec,
        endSec,
        restSec: Math.max(0, Number(loopRestSec) || 0),
      };
    } else {
      state.loop = null;
    }
    state.pauseAtSec = startSec;
  }

  function play({ fromSec = null } = {}) {
    if (!state.events.length && !state.guitarNotes.length && !state.drumHits.length) {
      rebuildEvents();
    }
    if (!state.events.length) return;
    ensureAudio();
    initEngine();
    clearVoices();
    stopTimer();
    state.inLoopRest = false;
    const startSec = fromSec != null
      ? fromSec
      : (state.paused
        ? state.pauseAtSec
        : (state.loop
          ? state.loop.startSec
          : quartersToSeconds(state.range.startBeat || 0, state.bpm)));
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
    state.measureIndex = 0;
    stopTimer();
    clearVoices();
    emitTick();
  }

  function setMuted({ guitar, drums } = {}) {
    if (guitar != null) state.muteGuitar = !!guitar;
    if (drums != null) state.muteDrums = !!drums;
    const was = state.playing;
    const at = songTimeNow();
    rebuildEvents();
    if (was) play({ fromSec: at });
    else emitTick();
  }

  return {
    load,
    play,
    pause,
    stop,
    setMuted,
    setLoopRestSec(sec) {
      if (!state.loop) return;
      state.loop.restSec = Math.max(0, Number(sec) || 0);
    },
    setOnTick(fn) { state.onTick = fn; },
    get playing() { return state.playing; },
    get paused() { return state.paused; },
    get bpm() { return state.bpm; },
    get currentSec() { return songTimeNow(); },
    get durationSec() { return durationSec(); },
    get muteGuitar() { return state.muteGuitar; },
    get muteDrums() { return state.muteDrums; },
    get range() { return { ...state.range }; },
    get measureIndex() { return state.measureIndex; },
  };
}

export { DRUM_LANES, modelHasRhythm };
