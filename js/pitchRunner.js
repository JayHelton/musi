import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { CLICK_TONE, STANDALONE_CLICK_GAIN, scheduleClickSound } from './audio/clickSynth.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext, TEMPO_MIN, TEMPO_MAX } from './musicalContext.js';
import { createAdaptiveNoiseFloor } from './pitch.js';
import { createPitchCapture } from './pitchCapture.js';
import {
  openPitchMic,
  registerPitchMicStop,
  stopOtherPitchMicTools,
  releaseMicStream,
} from './pitchMic.js';
import { centsOffFromTarget, freqToMidiFloat, midiToLabel } from './pitchMatch.js';
import { scoreRunnerNote } from './pitchMetrics.js';
import { buildSequenceForTask, SCALE_PATTERNS } from './pitchExercises.js';
import { ROOTS } from './theory.js';
import { orderedScaleNames, shortScaleName } from './scales.js';
import { lockoutUntil, isScoringWindowClear } from './pitchGuideLock.js';

// "Pitch runner" — a Guitar-Hero / Yousician-style scrolling pitch game that
// lives in the Pitch section. Note bars stream in from the right in strict 4/4
// time; the player must sing each note in tune as it crosses the vertical hit
// line on the left. Pitch is on the vertical axis (an octave-plus ladder of
// note lanes), so the display reads like a piano roll with a live pitch trace.
//
// It reuses the shared building blocks:
//   - musicalContext  -> current root / scale / tempo (so it follows the app)
//   - pitchExercises  -> the melodic pattern that becomes the scrolling notes
//   - pitch.js        -> confident mic pitch detection
//   - pitchMatch.js   -> cents/label helpers
// All timing is driven off the AudioContext clock so the visuals stay locked to
// the metronome clicks.

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   toleranceCents: 45, hitThreshold: 0.4 },
  { id: 'medium', label: 'Medium', toleranceCents: 30, hitThreshold: 0.5 },
  { id: 'hard',   label: 'Hard',   toleranceCents: 18, hitThreshold: 0.6 },
];

const RANGE_PRESETS = [
  { id: 'bass',      label: 'Bass',      low: 40, high: 64 },
  { id: 'baritone',  label: 'Baritone',  low: 43, high: 67 },
  { id: 'tenor',     label: 'Tenor',     low: 48, high: 72 },
  { id: 'alto',      label: 'Alto',      low: 53, high: 77 },
  { id: 'soprano',   label: 'Soprano',   low: 60, high: 84 },
];

// How the timeline maps to the canvas.
const HIT_X_RATIO = 0.28;      // hit line position, fraction of width from left
const LEAD_IN_BEATS = 8;       // two 4/4 measures of count-in before the first note
const MIN_NOTE_GAP_BEATS = 0.18; // smallest silence (beats) between two note bars
const NOTE_LENGTHS = [1, 2, 3, 4, 6, 8]; // selectable note durations, in beats
const REST_CHOICES = [0, 0.5, 1, 2];     // selectable rest after each note, in beats
const REST_LABELS = { 0: 'None', 0.5: '0.5 beat', 1: '1 beat', 2: '2 beats' };
// The runner starts slower than the shared 120 BPM default. A singer needs time
// to breathe and to find each pitch.
const DEFAULT_RUNNER_TEMPO = 76;
// Short cue length for the optional pitch cue. Kept brief so the singer —
// not the app's own speakers — must sustain the note for the hit.
const GUIDE_CUE_BEATS = 0.35;

// Beats of runway shown to the right of the hit line. It grows with the note
// length and with the rest, so a long note and its rest still fit on screen
// with approach time before the hit line.
function visibleBeatsAhead(noteBeats = runner.noteBeats, restBeats = runner.restBeats) {
  return Math.max(6 + (noteBeats - 1) * 2, noteBeats + restBeats + 4);
}

// Length of one note bar, in beats. With no rest the app keeps a small silence
// so two bars do not touch. With a rest the bar keeps its full note length and
// the rest becomes empty space on the timeline.
function noteDurationBeats(noteBeats, restBeats) {
  const gap = restBeats > 0 ? 0 : MIN_NOTE_GAP_BEATS;
  return Math.max(0.35, noteBeats - gap);
}

// Beats from the start of one note to the start of the next note.
function noteStepBeats(noteBeats, restBeats) {
  return noteBeats + restBeats;
}

// Beats of one complete pass of the melody. The listen phase uses this length.
function listenPassBeats(seqLength, noteBeats, restBeats) {
  if (!seqLength) return 0;
  return seqLength * noteStepBeats(noteBeats, restBeats);
}

// Lay out note plans from a start beat up to a horizon beat. This function is
// pure: it reads no state and it writes no state.
function planNotes({ patternSeq, noteBeats, restBeats, startBeat, seqIdx = 0, untilBeat, maxNotes = 512 }) {
  const notes = [];
  let beat = startBeat;
  let idx = seqIdx;
  if (!Array.isArray(patternSeq) || !patternSeq.length) {
    return { notes, nextBeat: beat, seqIdx: idx };
  }
  const dur = noteDurationBeats(noteBeats, restBeats);
  const step = noteStepBeats(noteBeats, restBeats);
  if (!(step > 0)) return { notes, nextBeat: beat, seqIdx: idx };
  while (beat < untilBeat && notes.length < maxNotes) {
    notes.push({ startBeat: beat, dur, midi: patternSeq[idx % patternSeq.length] });
    idx += 1;
    beat += step;
  }
  return { notes, nextBeat: beat, seqIdx: idx };
}

const GUIDE_LAYERS = [
  { type: 'sine',     detune: 0, level: 0.5 },
  { type: 'triangle', detune: 0, level: 0.28 },
];

const runner = {
  running: false,
  initialized: false,
  stream: null,
  capture: null,
  noiseFloor: null,
  trackSettings: null,
  lastPitchFrame: null,
  guideLockActive: false,
  rafId: null,

  difficulty: 'medium',
  pattern: 'five-tone',
  rangeLow: 48,
  rangeHigh: 72,
  noteBeats: 2,
  restBeats: 1,
  metronome: true,
  guide: false,
  listenFirst: true,
  previewing: false,

  // Timeline / scoring state.
  startAudioTime: 0,
  secPerBeat: 0.5,
  sequenceError: null,
  patternSeq: [],
  seqIdx: 0,
  nextBeat: LEAD_IN_BEATS,
  notes: [],
  nextClickBeat: 0,
  guideBeat: 0,
  laneMin: 55,
  laneMax: 67,
  trail: [],
  voices: [],
  listenBeats: 0,
  firstNoteBeat: LEAD_IN_BEATS,
  listenLockUntil: 0,
  overlayText: null,

  score: 0,
  combo: 0,
  bestCombo: 0,
  noteAccuracies: [],
  judged: 0,

  // Canvas metrics (CSS pixels).
  ctx2d: null,
  cssW: 0,
  cssH: 0,
  resizeObs: null,
  colors: null,
};

function el(id) { return document.getElementById(id); }

function difficultyById(id) {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
}

// ---- Audio cues -------------------------------------------------------------

function scheduleClick(time, accented) {
  // The pitch runner clicks under a singing voice, so it stays below the
  // standalone metronome peak.
  scheduleClickSound(audioCtx, getAnalyserDestination(), time, {
    tone: accented ? CLICK_TONE.accent : CLICK_TONE.beat,
    peak: (accented ? STANDALONE_CLICK_GAIN.accent : STANDALONE_CLICK_GAIN.beat) * 0.8,
    decay: accented ? 0.042 : 0.036,
  });
}

// Schedule one soft tone. The app keeps every voice, so stopRunner() and
// stopListenPreview() can stop the sound at once. Returns the audible duration
// in seconds, and the release is part of that duration.
function scheduleTone(midi, time, durSec, peak) {
  const freq = midiFreq(midi);
  const dur = Math.max(0.12, durSec);
  const release = 0.12;
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(Math.max(freq * 6, 1800), 6000);
  filter.Q.value = 0.4;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(peak, time + 0.025);
  gain.gain.setValueAtTime(peak * 0.8, time + dur * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + release);
  const oscs = GUIDE_LAYERS.map(layer => {
    const osc = audioCtx.createOscillator();
    const lg = audioCtx.createGain();
    osc.type = layer.type;
    osc.frequency.value = freq;
    osc.detune.value = layer.detune;
    lg.gain.value = layer.level;
    osc.connect(lg);
    lg.connect(filter);
    return osc;
  });
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  const endTime = time + dur + release + 0.05;
  oscs.forEach(o => { o.start(time); o.stop(endTime); });
  trackVoice({ oscs, gain, endTime });
  return dur + release;
}

function trackVoice(voice) {
  runner.voices.push(voice);
  if (runner.voices.length > 64) {
    const now = audioCtx.currentTime;
    runner.voices = runner.voices.filter(v => v.endTime > now);
  }
}

// Stop every scheduled tone now. The gain falls in 30 ms, so there is no click.
function stopScheduledTones() {
  if (!audioCtx) { runner.voices = []; return; }
  const now = audioCtx.currentTime;
  for (const voice of runner.voices) {
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
      voice.oscs.forEach(o => { try { o.stop(now + 0.05); } catch (e) { /* already stopped */ } });
    } catch (e) {
      // The voice already ended. There is nothing to stop.
    }
  }
  runner.voices = [];
}

// A short, soft pitch cue at a note's start. Intentionally brief — just enough
// to hint the pitch — so speaker bleed can't sustain the hit for the singer.
function scheduleGuideTone(midi, time) {
  const dur = Math.max(0.16, Math.min(0.55, GUIDE_CUE_BEATS * runner.secPerBeat));
  return scheduleTone(midi, time, dur, 0.1);
}

// A full-length tone for the listen phase. The app scores nothing during that
// phase, so the tone can last for the complete note.
function scheduleListenTone(midi, time, durSec) {
  return scheduleTone(midi, time, Math.max(0.18, durSec - 0.06), 0.12);
}

// ---- Sequence building ------------------------------------------------------

function clampRange() {
  const lo = Math.min(runner.rangeLow, runner.rangeHigh);
  const hi = Math.max(runner.rangeLow, runner.rangeHigh);
  return { lo, hi };
}

function buildPatternSeq() {
  const { root, scale } = getContext();
  const { lo, hi } = clampRange();
  const built = buildSequenceForTask({
    task: 'pattern',
    patternId: runner.pattern,
    scaleName: scale,
    rootName: root,
    low: lo,
    high: hi,
  });
  runner.sequenceError = built.ok ? null : built.error;
  runner.patternSeq = built.ok ? built.midis : [];

  let min = Infinity;
  let max = -Infinity;
  runner.patternSeq.forEach(m => { min = Math.min(min, m); max = Math.max(max, m); });
  if (!Number.isFinite(min)) {
    min = lo;
    max = hi;
  }
  runner.laneMin = min - 2;
  runner.laneMax = max + 2;
  updateStartState();
}

function setStartDisabled(disabled, message) {
  const btn = el('pr-toggle');
  const status = el('pr-status');
  if (btn) btn.disabled = !!disabled;
  if (status && message) status.textContent = message;
}

function updateStartState() {
  const err = runner.sequenceError;
  if (err) {
    setStartDisabled(true, err);
  } else if (!runner.running) {
    setStartDisabled(false, 'Mic off');
  } else {
    setStartDisabled(false);
  }
}

function syncNoteAudioTimes() {
  for (const note of runner.notes) {
    note.startAudioTime = runner.startAudioTime + note.startBeat * runner.secPerBeat;
    note.endAudioTime = note.startAudioTime + note.dur * runner.secPerBeat;
  }
}

function getInputLatencySec() {
  if (!runner.stream) return 0;
  const tracks = runner.stream.getAudioTracks?.();
  if (!tracks?.length) return 0;
  const track = tracks[0];
  const settings = track.getSettings?.() || {};
  if (typeof settings.latency === 'number' && Number.isFinite(settings.latency)) {
    return settings.latency;
  }
  const constraints = track.getConstraints?.() || {};
  if (typeof constraints.latency === 'number' && Number.isFinite(constraints.latency)) {
    return constraints.latency;
  }
  return 0;
}

function getAnalysisDelaySec() {
  if (runner.capture) return runner.capture.windowSize / audioCtx.sampleRate / 2;
  return 4096 / audioCtx.sampleRate / 2;
}

// Turn one note plan into a live note on the timeline.
function makeNote(plan, listenOnly = false) {
  const startAudioTime = runner.startAudioTime + plan.startBeat * runner.secPerBeat;
  return {
    startBeat: plan.startBeat,
    dur: plan.dur,
    midi: plan.midi,
    startAudioTime,
    endAudioTime: startAudioTime + plan.dur * runner.secPerBeat,
    samples: [],
    judged: false,
    result: null,
    noteAccuracy: 0,
    guideMuteUntil: 0,
    guideScheduled: false,
    listenOnly,
  };
}

// Append notes until the timeline is populated a comfortable margin past the
// right edge, cycling the pattern endlessly.
function ensureNotes(playheadBeat) {
  if (!runner.patternSeq.length) return;
  if (!Number.isFinite(runner.nextBeat)) return;
  const horizon = playheadBeat + visibleBeatsAhead() + runner.noteBeats + 4;
  const planned = planNotes({
    patternSeq: runner.patternSeq,
    noteBeats: runner.noteBeats,
    restBeats: runner.restBeats,
    startBeat: runner.nextBeat,
    seqIdx: runner.seqIdx,
    untilBeat: horizon,
  });
  for (const plan of planned.notes) runner.notes.push(makeNote(plan));
  runner.nextBeat = planned.nextBeat;
  runner.seqIdx = planned.seqIdx;
}

// ---- Scoring ----------------------------------------------------------------

function finalizeNote(note) {
  note.judged = true;
  runner.judged += 1;

  const scored = scoreRunnerNote(
    note.samples,
    note.midi,
    note.startAudioTime * 1000,
    note.endAudioTime * 1000,
  );
  note.noteAccuracy = scored.noteAccuracy;
  note.result = scored.result;
  runner.noteAccuracies.push(scored.noteAccuracy);

  if (scored.result === 'centered') {
    runner.combo += 1;
    runner.bestCombo = Math.max(runner.bestCombo, runner.combo);
    runner.score += 100 + Math.min(runner.combo, 20) * 5;
    flashJudge('Centered', 'centered');
  } else if (scored.result === 'close') {
    runner.combo = 0;
    runner.score += 60;
    flashJudge('Close', 'close');
  } else {
    runner.combo = 0;
    flashJudge('Miss', 'miss');
  }
  updateHud();
}

function flashJudge(text, cls) {
  const j = el('pr-judge');
  if (!j) return;
  const cssCls = cls === 'centered' ? 'perfect' : cls === 'close' ? 'good' : 'miss';
  j.textContent = text;
  j.className = 'pr-judge show ' + cssCls;
  void j.offsetWidth;
  j.className = 'pr-judge show ' + cssCls + ' anim';
}

function updateHud() {
  const scoreEl = el('pr-score');
  const comboEl = el('pr-combo');
  const accEl = el('pr-accuracy');
  if (scoreEl) scoreEl.textContent = String(runner.score);
  if (comboEl) comboEl.textContent = runner.combo > 0 ? `${runner.combo}\u00D7` : '0';
  if (accEl) {
    accEl.textContent = runner.noteAccuracies.length
      ? Math.round(runner.noteAccuracies.reduce((a, b) => a + b, 0) / runner.noteAccuracies.length) + '%'
      : '--';
  }
}

function resetScore() {
  runner.score = 0;
  runner.combo = 0;
  runner.bestCombo = 0;
  runner.noteAccuracies = [];
  runner.judged = 0;
  updateHud();
}

// ---- Canvas -----------------------------------------------------------------

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  runner.colors = {
    accent: get('--accent', '#7c9cff'),
    accent2: get('--accent2', '#b45eff'),
    ok: get('--ok', '#4ade80'),
    warn: get('--warn', '#fbbf24'),
    err: get('--err', '#f87171'),
    muted: get('--muted', '#8a8aa0'),
    text: get('--text', '#f0f0f5'),
    border: get('--border', 'rgba(255,255,255,0.12)'),
    card: get('--card', '#15151d'),
    bg2: get('--bg2', '#1c1c26'),
    // Pixel chrome tokens. The canvas uses the same ink and edge
    // colours as the CSS frames around it.
    ink: get('--px-ink', '#05070f'),
    edge: get('--px-edge', 'rgba(180,140,255,0.42)'),
  };
  // The checker pattern holds a colour, so build it again.
  runner.lanePattern = null;
}

function resizeCanvas() {
  const canvas = el('pr-canvas');
  const stage = el('pr-stage');
  if (!canvas || !stage) return;
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(240, Math.round(rect.width));
  const cssH = Math.max(180, Math.round(rect.height));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  runner.cssW = cssW;
  runner.cssH = cssH;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  runner.ctx2d = ctx;
  if (!runner.running) drawIdle();
}

function pxPerBeat() {
  const hitX = runner.cssW * HIT_X_RATIO;
  return (runner.cssW - hitX) / visibleBeatsAhead();
}

function midiToY(midiFloat) {
  const pad = 14;
  const top = runner.laneMax + 0.5;
  const bottom = runner.laneMin - 0.5;
  const span = top - bottom || 1;
  const usable = runner.cssH - pad * 2;
  return pad + ((top - midiFloat) / span) * usable;
}

function laneHeight() {
  return Math.abs(midiToY(runner.laneMin + 1) - midiToY(runner.laneMin));
}

/* ---- Pixel helpers ---------------------------------------------------------
   The canvas follows css/pixel-ui.css. Shapes are hard rectangles.
   Coordinates snap to whole pixels, so an edge stays crisp. */

const CANVAS_LABEL_FONT = '15px "VT323", monospace';
const CANVAS_COUNT_FONT = '42px "Press Start 2P", monospace';

/** Report the width of one device pixel in canvas units. */
function hairline() {
  return 1 / (window.devicePixelRatio || 1);
}

/** Report true when the browser has the font file. */
function fontLoaded(spec) {
  try {
    return document.fonts ? document.fonts.check(spec) : false;
  } catch {
    return false;
  }
}

/** Give the font for a lane label. Text metrics need a loaded font. */
function labelFont() {
  return fontLoaded('15px "VT323"') ? CANVAS_LABEL_FONT : '12px monospace';
}

/** Give the font for the count-in digit. */
function countFont() {
  return fontLoaded('42px "Press Start 2P"') ? CANVAS_COUNT_FONT : 'bold 36px monospace';
}

/** Build a 4 by 4 checker fill. It replaces a soft gradient. */
function lanePattern(ctx) {
  if (runner.lanePattern) return runner.lanePattern;
  const cell = document.createElement('canvas');
  cell.width = 4;
  cell.height = 4;
  const cc = cell.getContext('2d');
  if (!cc) return null;
  cc.fillStyle = (runner.colors && runner.colors.edge) || 'rgba(180,140,255,0.42)';
  cc.fillRect(0, 0, 1, 1);
  cc.fillRect(2, 2, 1, 1);
  runner.lanePattern = ctx.createPattern(cell, 'repeat');
  return runner.lanePattern;
}

/** Draw a block with a dark rim, so it reads over a lane fill. */
function pixelBlock(ctx, x, y, w, h, fill, ink) {
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4));
}

/** Draw the live pitch mark: a chunky plus on the pixel grid. */
function pixelPlus(ctx, cx, cy, fill, ink) {
  const arm = 4;
  const reach = 10;
  const bars = [
    [cx - reach, cy - arm, reach * 2, arm * 2],
    [cx - arm, cy - reach, arm * 2, reach * 2],
  ];
  ctx.fillStyle = ink;
  for (const b of bars) ctx.fillRect(b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4);
  ctx.fillStyle = fill;
  for (const b of bars) ctx.fillRect(b[0], b[1], b[2], b[3]);
}

/** Paint the background, the pitch lanes, and the beat grid. */
function drawBackdrop(ctx, playheadBeat) {
  const c = runner.colors;
  const W = runner.cssW;
  const H = runner.cssH;
  const hair = hairline();
  const lh = laneHeight();

  ctx.fillStyle = c.card;
  ctx.fillRect(0, 0, W, H);

  // One lane per semitone. A scale tone takes a checker fill.
  const inSeq = new Set(runner.patternSeq);
  const checker = lanePattern(ctx);
  for (let m = runner.laneMin; m <= runner.laneMax; m++) {
    const top = Math.round(midiToY(m) - lh / 2);
    if (checker && inSeq.has(m)) {
      ctx.fillStyle = checker;
      ctx.fillRect(0, top, W, Math.max(1, Math.round(lh)));
    }
    ctx.fillStyle = c.border;
    ctx.fillRect(0, top, W, hair);
  }

  // Beat grid. A downbeat takes a wider, brighter line.
  const hitX = Math.round(W * HIT_X_RATIO);
  const ppb = pxPerBeat();
  const firstBeat = Math.floor(playheadBeat - hitX / ppb) - 1;
  const lastBeat = Math.ceil(playheadBeat + (W - hitX) / ppb) + 1;
  for (let b = firstBeat; b <= lastBeat; b++) {
    const x = Math.round(hitX + (b - playheadBeat) * ppb);
    if (x < 0 || x > W) continue;
    const downbeat = ((b % 4) + 4) % 4 === 0;
    ctx.fillStyle = downbeat ? c.edge : c.border;
    ctx.fillRect(x, 0, downbeat ? 2 : hair, H);
  }
}

/** Write the note name of each lane in the left gutter. */
function drawLaneLabels(ctx) {
  const c = runner.colors;
  const inSeq = new Set(runner.patternSeq);
  const lh = laneHeight();
  ctx.font = labelFont();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let m = runner.laneMin; m <= runner.laneMax; m++) {
    const y = Math.round(midiToY(m));
    const isTarget = inSeq.has(m);
    // A short lane only shows the name of a scale tone. The names
    // would touch each other on a small screen.
    if (lh < 22 && !isTarget) continue;
    const lbl = midiToLabel(m).full;
    const tw = Math.ceil(ctx.measureText(lbl).width);
    ctx.fillStyle = c.edge;
    ctx.fillRect(2, y - 10, tw + 12, 20);
    ctx.fillStyle = c.ink;
    ctx.fillRect(3, y - 9, tw + 10, 18);
    ctx.fillStyle = isTarget ? c.accent : c.muted;
    ctx.fillText(lbl, 8, y);
  }
}

/** Draw the line where a note counts. */
function drawHitLine(ctx) {
  const c = runner.colors;
  const hitX = Math.round(runner.cssW * HIT_X_RATIO);
  ctx.fillStyle = c.ink;
  ctx.fillRect(hitX - 3, 0, 8, runner.cssH);
  ctx.fillStyle = c.accent;
  ctx.fillRect(hitX - 1, 0, 3, runner.cssH);
}

function drawIdle() {
  const ctx = runner.ctx2d;
  if (!ctx) return;
  ctx.clearRect(0, 0, runner.cssW, runner.cssH);
  if (!runner.colors) {
    ctx.fillStyle = '#15151d';
    ctx.fillRect(0, 0, runner.cssW, runner.cssH);
    return;
  }
  drawBackdrop(ctx, 0);
  drawLaneLabels(ctx);
  drawHitLine(ctx);
}

function draw(playheadBeat) {
  const ctx = runner.ctx2d;
  if (!ctx) return;
  const c = runner.colors;
  const W = runner.cssW;
  const H = runner.cssH;
  const hitX = Math.round(W * HIT_X_RATIO);
  const ppb = pxPerBeat();
  const lh = laneHeight();

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, playheadBeat);

  // Note bars. Each bar is a hard block with a dark rim.
  const activeMidi = currentTargetMidi(playheadBeat, true);
  for (const note of runner.notes) {
    const x = Math.round(hitX + (note.startBeat - playheadBeat) * ppb);
    const w = Math.max(6, Math.round(note.dur * ppb));
    if (x + w < 0 || x > W) continue;
    const y = Math.round(midiToY(note.midi));
    const barH = Math.max(10, Math.round(lh * 0.72));
    let fill;
    let ahead = false;
    if (note.listenOnly) {
      fill = note.midi === activeMidi ? c.accent : c.muted;
    } else if (note.judged) {
      fill = note.result === 'miss' ? c.err : note.result === 'centered' ? c.ok : c.warn;
    } else if (note.midi === activeMidi) {
      fill = c.accent;
    } else {
      // The note is still ahead of the line.
      fill = c.accent2;
      ahead = true;
    }
    if (ahead) ctx.globalAlpha = 0.72;
    pixelBlock(ctx, x, y - Math.round(barH / 2), w, barH, fill, c.ink);
    ctx.globalAlpha = 1;
  }

  // Pitch trail. Each step is a block, so the trail stays chunky
  // and the singer can still read the shape.
  if (runner.trail.length > 1) {
    for (let i = 1; i < runner.trail.length; i++) {
      const a = runner.trail[i - 1];
      const b = runner.trail[i];
      if (!a.hasPitch || !b.hasPitch) continue;
      const xa = Math.round(hitX + (a.beat - playheadBeat) * ppb);
      const xb = Math.round(hitX + (b.beat - playheadBeat) * ppb);
      const ya = Math.round(midiToY(a.midiFloat));
      const yb = Math.round(midiToY(b.midiFloat));
      const top = Math.min(ya, yb) - 1;
      const h = Math.max(3, Math.abs(yb - ya) + 2);
      ctx.fillStyle = b.inTune ? c.ok : c.warn;
      ctx.fillRect(xa, top, Math.max(3, xb - xa), h);
    }
  }

  drawLaneLabels(ctx);
  drawHitLine(ctx);

  // Live pitch mark on the hit line.
  const last = runner.trail[runner.trail.length - 1];
  if (last && last.hasPitch) {
    const y = Math.round(midiToY(last.midiFloat));
    pixelPlus(ctx, hitX, y, last.inTune ? c.ok : c.warn, c.ink);
  }

  // Count-in cue between the listen phase and the first scored note.
  if (Number.isFinite(runner.firstNoteBeat)
    && playheadBeat >= runner.listenBeats
    && playheadBeat < runner.firstNoteBeat) {
    const remaining = Math.ceil(runner.firstNoteBeat - playheadBeat);
    const cx = Math.round(W / 2);
    const cy = Math.round(H / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = countFont();
    ctx.fillStyle = c.ink;
    ctx.fillText(String(remaining), cx + 4, cy + 4);
    ctx.fillStyle = c.accent;
    ctx.fillText(String(remaining), cx, cy);
    ctx.textAlign = 'left';
  }
}

function currentTargetMidi(playheadBeat, includeListen = true) {
  for (const note of runner.notes) {
    if (note.listenOnly && !includeListen) continue;
    if (playheadBeat >= note.startBeat && playheadBeat < note.startBeat + note.dur) {
      return note.midi;
    }
  }
  return null;
}

// ---- Main loop --------------------------------------------------------------

function scheduleAudio(playheadBeat) {
  const ahead = 0.2; // seconds of look-ahead for click/guide scheduling
  const horizonBeat = playheadBeat + ahead / runner.secPerBeat;
  // Metronome clicks on every beat.
  while (runner.metronome && runner.nextClickBeat < horizonBeat) {
    if (runner.nextClickBeat >= 0) {
      const t = runner.startAudioTime + runner.nextClickBeat * runner.secPerBeat;
      if (t > audioCtx.currentTime - 0.05) {
        scheduleClick(t, ((runner.nextClickBeat % 4) + 4) % 4 === 0);
      }
    }
    runner.nextClickBeat += 1;
  }
  // Tones for the listen phase, and the optional short pitch cues during play.
  // Scoring is muted for the audible life of each tone, so speaker bleed can't
  // count as a hit.
  for (const note of runner.notes) {
    if (note.guideScheduled) continue;
    if (note.startBeat > horizonBeat) continue;
    if (!note.listenOnly && !runner.guide) continue;
    const t = runner.startAudioTime + note.startBeat * runner.secPerBeat;
    if (t > audioCtx.currentTime - 0.05) {
      const toneSec = note.listenOnly
        ? scheduleListenTone(note.midi, t, note.dur * runner.secPerBeat)
        : scheduleGuideTone(note.midi, t);
      note.guideMuteUntil = lockoutUntil(t + toneSec);
      if (note.listenOnly) {
        runner.listenLockUntil = Math.max(runner.listenLockUntil, note.guideMuteUntil);
      }
    }
    note.guideScheduled = true;
  }
}

function handleRunnerPitchFrame(frame) {
  if (!runner.running) return;
  const audioTime = frame.audioTime;
  // The listen phase blocks the microphone completely. The app collects no
  // samples and it adapts no noise floor while the melody plays.
  let anyLockActive = !isScoringWindowClear(audioTime, runner.listenLockUntil, runner.capture);
  for (const note of runner.notes) {
    if (anyLockActive) break;
    if (note.guideMuteUntil > 0 && !isScoringWindowClear(audioTime, note.guideMuteUntil, runner.capture)) {
      anyLockActive = true;
      break;
    }
  }
  if (anyLockActive && !runner.guideLockActive) {
    if (runner.capture) runner.capture.reset();
    runner.guideLockActive = true;
  } else if (!anyLockActive && runner.guideLockActive) {
    if (runner.capture) runner.capture.reset();
    runner.guideLockActive = false;
  }
  if (!anyLockActive) {
    const activeMinRms = runner.noiseFloor ? runner.noiseFloor.ingest(frame.rms) : frame.rms;
    if (runner.capture) runner.capture.setMinRms(activeMinRms);
  }
  runner.lastPitchFrame = frame;
}

function loop() {
  if (!runner.running && !runner.previewing) return;
  try {
    step();
  } catch (e) {
    // Never let a transient error kill the animation loop (which would freeze
    // the display and make it look like the mic stopped responding).
    if (typeof console !== 'undefined') console.error('pitchRunner loop error', e);
  }
  runner.rafId = requestAnimationFrame(loop);
}

function step() {
  // The AudioContext can be auto-suspended (tab backgrounded, OS audio focus
  // changes); keep it alive so the timeline clock and mic capture keep running.
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const playheadBeat = (now - runner.startAudioTime) / runner.secPerBeat;

  ensureNotes(playheadBeat);
  scheduleAudio(playheadBeat);
  updatePhaseOverlay(playheadBeat);

  // The listen preview plays the melody with the microphone closed. It draws
  // the timeline and it scores nothing.
  if (runner.previewing) {
    // Stop the preview if the player leaves the pitch runner page.
    const stage = el('pr-stage');
    if (stage && stage.offsetParent === null) { stopListenPreview(); return; }
    pruneTimeline(playheadBeat, false);
    draw(playheadBeat);
    if (playheadBeat >= runner.listenBeats + 1) stopListenPreview(true);
    return;
  }

  const frame = runner.lastPitchFrame;
  const voiced = frame?.voiced ?? false;
  const frequencyHz = frame?.frequencyHz ?? -1;
  const clarity = frame?.clarity ?? 0;
  const rms = frame?.rms ?? 0;
  const displayFreq = frame?.displayFrequencyHz > 0 ? frame.displayFrequencyHz : frequencyHz;
  const hasPitch = displayFreq > 0;
  const midiFloat = hasPitch ? freqToMidiFloat(displayFreq) : null;

  const correctedAudioTime = frame?.audioTime != null
    ? frame.audioTime - getInputLatencySec()
    : now - getAnalysisDelaySec() - getInputLatencySec();
  const sampleTimestampMs = frame?.timestampMs ?? correctedAudioTime * 1000;

  const target = currentTargetMidi(playheadBeat, false);
  let inTune = false;
  if (voiced && frequencyHz > 0 && target != null) {
    const cents = centsOffFromTarget(frequencyHz, target);
    inTune = cents != null && Math.abs(cents) <= 20;
  }

  const listenClear = isScoringWindowClear(correctedAudioTime, runner.listenLockUntil, runner.capture);
  for (const note of runner.notes) {
    if (note.listenOnly || note.judged) continue;
    const end = note.startBeat + note.dur;
    const inNoteWindow = correctedAudioTime >= note.startAudioTime
      && correctedAudioTime < note.endAudioTime;
    if (inNoteWindow) {
      const scoring = listenClear
        && isScoringWindowClear(correctedAudioTime, note.guideMuteUntil, runner.capture);
      if (scoring) {
        const cents = voiced && frequencyHz > 0
          ? centsOffFromTarget(frequencyHz, note.midi)
          : null;
        note.samples.push({
          timestampMs: sampleTimestampMs,
          audioTime: correctedAudioTime,
          frequencyHz: voiced ? frequencyHz : -1,
          centsFromTarget: cents,
          clarity,
          rms,
          voiced: !!voiced,
        });
      }
    } else if (playheadBeat >= end) {
      finalizeNote(note);
    }
  }

  // Record the pitch trace and prune notes/trail that scrolled off-screen.
  runner.trail.push({ beat: playheadBeat, midiFloat: midiFloat ?? runner.laneMin, hasPitch, inTune });
  pruneTimeline(playheadBeat, true);

  draw(playheadBeat);
}

// Drop notes and trail points that scrolled off the left edge.
function pruneTimeline(playheadBeat, keepTrail) {
  const leftBeats = (runner.cssW * HIT_X_RATIO) / pxPerBeat();
  const cutoff = playheadBeat - leftBeats - 1;
  if (keepTrail) {
    while (runner.trail.length && runner.trail[0].beat < cutoff) runner.trail.shift();
  } else {
    runner.trail = [];
  }
  runner.notes = runner.notes.filter(n => n.startBeat + n.dur >= cutoff);
}

// Show the phase of the run on the overlay: the listen pass, or the game.
function updatePhaseOverlay(playheadBeat) {
  if (runner.listenBeats > 0 && playheadBeat < runner.listenBeats) {
    const total = Math.max(1, Math.round(runner.listenBeats));
    const beat = Math.min(total, Math.max(1, Math.floor(playheadBeat) + 1));
    setOverlay(`LISTEN \u00B7 beat ${beat} of ${total}`, 'pr-listening');
  } else if (!runner.previewing) {
    setOverlay('');
  }
}

// ---- Lifecycle --------------------------------------------------------------

// Build the timeline. The listen phase, when the player asks for it, occupies
// the beats before the count-in. The scored run starts at firstNoteBeat.
function resetTimeline({ previewOnly = false } = {}) {
  runner.secPerBeat = 60 / getContext().tempo;
  runner.startAudioTime = audioCtx.currentTime + 0.15;
  runner.seqIdx = 0;
  runner.nextClickBeat = 0;
  runner.notes = [];
  runner.trail = [];
  runner.listenLockUntil = 0;
  buildPatternSeq();

  const wantListen = previewOnly || runner.listenFirst;
  const listenBeats = wantListen
    ? listenPassBeats(runner.patternSeq.length, runner.noteBeats, runner.restBeats)
    : 0;
  runner.listenBeats = listenBeats;
  runner.firstNoteBeat = previewOnly ? Infinity : listenBeats + LEAD_IN_BEATS;

  if (listenBeats > 0) {
    const pass = planNotes({
      patternSeq: runner.patternSeq,
      noteBeats: runner.noteBeats,
      restBeats: runner.restBeats,
      startBeat: 0,
      seqIdx: 0,
      untilBeat: listenBeats,
    });
    for (const plan of pass.notes) runner.notes.push(makeNote(plan, true));
  }

  runner.seqIdx = 0;
  runner.nextBeat = runner.firstNoteBeat;
  if (!previewOnly) ensureNotes(0);
}

async function startRunner() {
  stopOtherPitchMicTools('runner');
  stopListenPreview();

  ensureAudio();
  readColors();
  resizeCanvas();
  resetScore();
  resetTimeline();
  if (runner.sequenceError) {
    updateStartState();
    return;
  }

  const mic = await openPitchMic();
  if (!mic.ok) {
    const status = el('pr-status');
    if (status) status.textContent = 'Mic access denied or unavailable';
    setOverlay('Mic unavailable');
    updateStartState();
    return;
  }

  try {
    runner.stream = mic.stream;
    runner.trackSettings = mic.settings;
    runner.noiseFloor = createAdaptiveNoiseFloor(0.003);
    runner.noiseFloor.startCollection();
    runner.lastPitchFrame = null;
    runner.guideLockActive = false;

    runner.capture = await createPitchCapture({
      audioCtx,
      stream: runner.stream,
      minRms: runner.noiseFloor.getMinRms(),
      minClarity: 0.45,
      maxFreq: 1400,
      onFrame: handleRunnerPitchFrame,
    });

    runner.running = true;
    setToggleLabel(true);
    setOverlay('');
    const status = el('pr-status');
    if (status) {
      status.textContent = runner.listenBeats > 0
        ? 'Listen to the melody first. Then sing the notes at the line.'
        : 'Listening\u2026 sing the notes as they cross the line';
    }
    runner.startAudioTime = audioCtx.currentTime + 0.15;
    runner.nextClickBeat = 0;
    syncNoteAudioTimes();
    loop();
  } catch (e) {
    stopRunner();
    const status = el('pr-status');
    if (status) status.textContent = 'Mic access denied or unavailable';
    setOverlay('Mic unavailable');
    updateStartState();
  }
}

function stopRunner() {
  if (runner.previewing) stopListenPreview();
  if (!runner.running && !runner.stream) {
    setToggleLabel(false);
    return;
  }
  runner.running = false;
  if (runner.rafId) { cancelAnimationFrame(runner.rafId); runner.rafId = null; }
  stopScheduledTones();
  if (runner.capture) { runner.capture.stop(); runner.capture = null; }
  runner.lastPitchFrame = null;
  runner.guideLockActive = false;
  runner.listenLockUntil = 0;
  if (runner.noiseFloor) runner.noiseFloor = null;
  if (runner.stream) { releaseMicStream(runner.stream); runner.stream = null; }
  setToggleLabel(false);
  const status = el('pr-status');
  if (status) {
    const acc = runner.noteAccuracies.length
      ? Math.round(runner.noteAccuracies.reduce((a, b) => a + b, 0) / runner.noteAccuracies.length)
      : 0;
    status.textContent = runner.judged
      ? `Stopped \u2014 best combo ${runner.bestCombo}\u00D7, ${acc}% accuracy`
      : 'Mic off';
  }
  updateStartState();
  setOverlay('Press start to play');
  drawIdle();
}

function togglePitchRunner() {
  if (runner.running) stopRunner(); else startRunner();
}

// ---- Listen preview ---------------------------------------------------------

// Play one pass of the melody with the microphone closed. The player uses this
// to hear the notes before the game starts.
function startListenPreview() {
  if (runner.running) return;
  if (runner.previewing) { stopListenPreview(); return; }

  ensureAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  readColors();
  resizeCanvas();
  resetTimeline({ previewOnly: true });
  if (runner.sequenceError || !runner.patternSeq.length) {
    updateStartState();
    return;
  }

  runner.previewing = true;
  setListenLabel(true);
  setOverlay('LISTEN', 'pr-listening');
  const status = el('pr-status');
  if (status) status.textContent = 'The app plays the melody. The microphone stays off.';
  loop();
}

function stopListenPreview(finished = false) {
  if (!runner.previewing) return;
  runner.previewing = false;
  if (runner.rafId) { cancelAnimationFrame(runner.rafId); runner.rafId = null; }
  stopScheduledTones();
  runner.notes = [];
  runner.trail = [];
  runner.listenBeats = 0;
  runner.listenLockUntil = 0;
  setListenLabel(false);
  setOverlay('Press start to play');
  const status = el('pr-status');
  if (status) status.textContent = finished ? 'Melody complete. Press start to sing it.' : 'Mic off';
  drawIdle();
}

function setListenLabel(on) {
  const btn = el('pr-listen');
  if (btn) btn.textContent = on ? 'Stop listen' : 'Listen';
}

function setToggleLabel(on) {
  const btn = el('pr-toggle');
  if (btn) btn.textContent = on ? 'Stop game' : 'Start game';
  const listenBtn = el('pr-listen');
  if (listenBtn) listenBtn.disabled = !!on;
}

function setOverlay(text, cls) {
  const ov = el('pr-overlay');
  if (!ov) return;
  const next = (text || '') + '|' + (cls || '');
  if (runner.overlayText === next) return;
  runner.overlayText = next;
  ov.textContent = text || '';
  ov.className = cls ? `pr-overlay ${cls}` : 'pr-overlay';
  ov.style.display = text ? 'flex' : 'none';
}

function restartIfRunning() {
  if (runner.running) {
    resetScore();
    resetTimeline();
    runner.startAudioTime = audioCtx.currentTime + 0.15;
    runner.nextClickBeat = 0;
    stopScheduledTones();
    syncNoteAudioTimes();
  } else {
    if (runner.previewing) stopListenPreview();
    buildPatternSeq();
    if (runner.ctx2d) drawIdle();
  }
}

// ---- Controls / init --------------------------------------------------------

// Push the runner's saved tempo into the shared musical context.
function applyRunnerTempo() {
  const saved = Number(getSetting('pitchRunner.tempo', DEFAULT_RUNNER_TEMPO));
  const tempo = Number.isFinite(saved) ? Math.round(saved) : DEFAULT_RUNNER_TEMPO;
  const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, tempo));
  setContext({ tempo: clamped }, 'pitchRunner');
  runner.secPerBeat = 60 / getContext().tempo;
}

function syncTempoLabel() {
  const bpmEl = el('pr-bpm');
  if (bpmEl) bpmEl.textContent = String(getContext().tempo);
  runner.secPerBeat = 60 / getContext().tempo;
}

function initPitchRunner() {
  runner.difficulty = getSetting('pitchRunner.difficulty', runner.difficulty, DIFFICULTIES.map(d => d.id));
  runner.pattern = getSetting('pitchRunner.pattern', runner.pattern, SCALE_PATTERNS.map(p => p.id));
  runner.rangeLow = Number(getSetting('pitchRunner.rangeLow', runner.rangeLow));
  runner.rangeHigh = Number(getSetting('pitchRunner.rangeHigh', runner.rangeHigh));
  runner.noteBeats = Number(getSetting('pitchRunner.noteBeats', runner.noteBeats));
  runner.restBeats = Number(getSetting('pitchRunner.restBeats', runner.restBeats));
  runner.metronome = getSetting('pitchRunner.metronome', runner.metronome) !== false;
  runner.guide = getSetting('pitchRunner.guide', runner.guide) === true;
  runner.listenFirst = getSetting('pitchRunner.listenFirst', runner.listenFirst) !== false;
  if (!(runner.rangeLow >= 36 && runner.rangeLow <= 84)) runner.rangeLow = 48;
  if (!(runner.rangeHigh >= 36 && runner.rangeHigh <= 84)) runner.rangeHigh = 72;
  if (!NOTE_LENGTHS.includes(runner.noteBeats)) runner.noteBeats = 2;
  if (!REST_CHOICES.includes(runner.restBeats)) runner.restBeats = 1;

  // The runner keeps its own tempo. It is slower than the shared 120 BPM
  // default, because a singer needs more time than an instrument player.
  applyRunnerTempo();

  if (runner.initialized) {
    syncControls();
    syncTempoLabel();
    readColors();
    resizeCanvas();
    if (!runner.running) { buildPatternSeq(); drawIdle(); }
    return;
  }
  runner.initialized = true;

  const diffSel = el('pr-difficulty');
  if (diffSel) {
    diffSel.innerHTML = '';
    DIFFICULTIES.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label;
      diffSel.appendChild(opt);
    });
    diffSel.value = runner.difficulty;
    diffSel.onchange = () => {
      runner.difficulty = diffSel.value;
      saveSetting('pitchRunner.difficulty', runner.difficulty);
      restartIfRunning();
    };
  }

  const keySel = el('pr-key');
  if (keySel) {
    keySel.innerHTML = '';
    ROOTS.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      keySel.appendChild(opt);
    });
    keySel.value = getContext().root;
    keySel.onchange = () => {
      setContext({ root: keySel.value }, 'pitchRunner');
      restartIfRunning();
    };
  }

  const scaleSel = el('pr-scale');
  if (scaleSel) {
    scaleSel.innerHTML = '';
    orderedScaleNames().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = shortScaleName(name);
      scaleSel.appendChild(opt);
    });
    scaleSel.value = getContext().scale;
    scaleSel.onchange = () => {
      setContext({ scale: scaleSel.value }, 'pitchRunner');
      restartIfRunning();
    };
  }

  const patternSel = el('pr-pattern');
  if (patternSel) {
    patternSel.innerHTML = '';
    SCALE_PATTERNS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.label} \u00B7 ${p.hint}`;
      patternSel.appendChild(opt);
    });
    patternSel.value = runner.pattern;
    patternSel.onchange = () => {
      runner.pattern = patternSel.value;
      saveSetting('pitchRunner.pattern', runner.pattern);
      restartIfRunning();
    };
  }

  const presetSel = el('pr-range-preset');
  if (presetSel) {
    presetSel.innerHTML = '';
    RANGE_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      presetSel.appendChild(opt);
    });
    presetSel.value = matchPreset();
    presetSel.onchange = () => {
      const preset = RANGE_PRESETS.find(p => p.id === presetSel.value);
      if (preset) {
        runner.rangeLow = preset.low;
        runner.rangeHigh = preset.high;
        saveSetting('pitchRunner.rangeLow', runner.rangeLow);
        saveSetting('pitchRunner.rangeHigh', runner.rangeHigh);
        restartIfRunning();
      }
    };
  }

  const lengthSel = el('pr-length');
  if (lengthSel) {
    lengthSel.innerHTML = '';
    NOTE_LENGTHS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = n === 1 ? '1 beat' : `${n} beats`;
      lengthSel.appendChild(opt);
    });
    lengthSel.value = String(runner.noteBeats);
    lengthSel.onchange = () => {
      runner.noteBeats = Number(lengthSel.value);
      saveSetting('pitchRunner.noteBeats', runner.noteBeats);
      restartIfRunning();
    };
  }

  const restSel = el('pr-rest');
  if (restSel) {
    restSel.innerHTML = '';
    REST_CHOICES.forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = REST_LABELS[n] || `${n} beats`;
      restSel.appendChild(opt);
    });
    restSel.value = String(runner.restBeats);
    restSel.onchange = () => {
      runner.restBeats = Number(restSel.value);
      saveSetting('pitchRunner.restBeats', runner.restBeats);
      restartIfRunning();
    };
  }

  const bpmDown = el('pr-bpm-down');
  const bpmUp = el('pr-bpm-up');
  const changeTempo = (delta) => {
    const next = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, getContext().tempo + delta));
    setContext({ tempo: next }, 'pitchRunner');
    saveSetting('pitchRunner.tempo', next);
    syncTempoLabel();
    if (runner.running) { runner.secPerBeat = 60 / next; }
  };
  if (bpmDown) bpmDown.onclick = () => changeTempo(-5);
  if (bpmUp) bpmUp.onclick = () => changeTempo(5);

  const metroChk = el('pr-metronome');
  if (metroChk) {
    metroChk.checked = runner.metronome;
    metroChk.onchange = () => {
      runner.metronome = metroChk.checked;
      saveSetting('pitchRunner.metronome', runner.metronome);
      if (runner.running) {
        // Re-anchor the click scheduler so toggling on mid-game lines up.
        const playheadBeat = (audioCtx.currentTime - runner.startAudioTime) / runner.secPerBeat;
        runner.nextClickBeat = Math.ceil(playheadBeat);
      }
    };
  }

  const guideChk = el('pr-guide');
  if (guideChk) {
    guideChk.checked = runner.guide;
    guideChk.onchange = () => {
      runner.guide = guideChk.checked;
      saveSetting('pitchRunner.guide', runner.guide);
    };
  }

  const listenChk = el('pr-listen-first');
  if (listenChk) {
    listenChk.checked = runner.listenFirst;
    listenChk.onchange = () => {
      runner.listenFirst = listenChk.checked;
      saveSetting('pitchRunner.listenFirst', runner.listenFirst);
      restartIfRunning();
    };
  }

  const listenBtn = el('pr-listen');
  if (listenBtn) {
    listenBtn.onclick = () => startListenPreview();
  }

  // Keep the labels and the selects in step when other tools change the
  // shared context.
  subscribeContext(() => {
    syncTempoLabel();
    syncContextControls();
    if (!runner.running) { buildPatternSeq(); if (runner.ctx2d) drawIdle(); }
  });

  // Redraw the idle/live canvas when the stage resizes.
  const stage = el('pr-stage');
  if (stage && 'ResizeObserver' in window) {
    runner.resizeObs = new ResizeObserver(() => resizeCanvas());
    runner.resizeObs.observe(stage);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  syncTempoLabel();
  syncContextControls();
  readColors();
  buildPatternSeq();
  resizeCanvas();
  updateHud();
  updateStartState();
  setOverlay('Press start to play');
  registerPitchMicStop('runner', stopRunner);
}

function matchPreset() {
  const found = RANGE_PRESETS.find(p => p.low === runner.rangeLow && p.high === runner.rangeHigh);
  return found ? found.id : 'tenor';
}

function syncContextControls() {
  const { root, scale } = getContext();
  const keySel = el('pr-key');
  const scaleSel = el('pr-scale');
  if (keySel) keySel.value = root;
  if (scaleSel) scaleSel.value = scale;
}

function syncControls() {
  const diffSel = el('pr-difficulty');
  const patternSel = el('pr-pattern');
  const presetSel = el('pr-range-preset');
  const lengthSel = el('pr-length');
  const restSel = el('pr-rest');
  const metroChk = el('pr-metronome');
  const guideChk = el('pr-guide');
  const listenChk = el('pr-listen-first');
  if (diffSel) diffSel.value = runner.difficulty;
  if (patternSel) patternSel.value = runner.pattern;
  if (presetSel) presetSel.value = matchPreset();
  if (lengthSel) lengthSel.value = String(runner.noteBeats);
  if (restSel) restSel.value = String(runner.restBeats);
  if (metroChk) metroChk.checked = runner.metronome;
  if (guideChk) guideChk.checked = runner.guide;
  if (listenChk) listenChk.checked = runner.listenFirst;
  syncContextControls();
}

if (typeof window !== 'undefined') window.togglePitchRunner = togglePitchRunner;

export {
  initPitchRunner,
  stopRunner as stopPitchRunner,
  runner,
  planNotes,
  noteDurationBeats,
  noteStepBeats,
  listenPassBeats,
  visibleBeatsAhead,
  NOTE_LENGTHS,
  REST_CHOICES,
  LEAD_IN_BEATS,
  DEFAULT_RUNNER_TEMPO,
};
