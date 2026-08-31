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
import { lockoutUntil, isScoringWindowClear, ROOM_TAIL_SEC } from './pitchGuideLock.js';
import { runnerNoteBeats } from './runnerExerciseModel.js';
import {
  nextPassStartBeat,
  runnerPassPosition,
  runnerScoredBudget,
  runnerStepBudget,
  PASS_GAP_MIN_BEATS,
} from './runnerTimeline.js';
import { preparePitchVoice, playPitchNote, pitchVoiceWave } from './audio/pitchVoice.js';
import {
  clampViewCenter,
  easeViewCenter,
  shouldLabelLane,
  targetViewCenter,
  visibleLaneRange,
  visibleLaneSpan,
  VIEW_EDGE_LANES,
} from './runnerPitchView.js';

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
// How far back of the hit line the pitch window still holds a note, in beats.
// The window leads the melody, so it looks only a short way back.
const VIEW_BEHIND_BEATS = 1.5;
const LEAD_IN_BEATS = 4;       // one 4/4 measure of count-in before the first note
const NOTE_GAP_BEATS = 0.18;   // silent gap (beats) between adjacent notes
const NOTE_LENGTHS = [1, 2, 3, 4]; // selectable note durations, in beats
// Output delay compensation, in milliseconds. Bluetooth headphones play a
// sound long after the app schedules it, so the runner sends every click and
// every melody-guide cue out early by this much. The bars on screen then cross
// the line at the moment the player hears the note. The delay has no upper
// limit: a slow link only makes the run start later, because the start waits
// for the whole delay.
const AUDIO_DELAY_MIN_MS = 0;
const AUDIO_DELAY_STEP_MS = 10;
const AUDIO_DELAY_DEFAULT_MS = 0;

/** Read a delay in milliseconds. It keeps any number of 0 or more. */
function clampAudioDelayMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return AUDIO_DELAY_DEFAULT_MS;
  return Math.max(AUDIO_DELAY_MIN_MS, Math.round(ms));
}

// The element names the runner reads. The Pitch section holds elements with
// these ids; a saved runner exercise builds its own stage and binds the same
// names to its own nodes.
const RUNNER_ELEMENT_NAMES = [
  'pr-toggle', 'pr-status', 'pr-judge', 'pr-score', 'pr-combo', 'pr-accuracy',
  'pr-canvas', 'pr-stage', 'pr-overlay', 'pr-difficulty', 'pr-pattern',
  'pr-range-preset', 'pr-length', 'pr-bpm', 'pr-bpm-down', 'pr-bpm-up',
  'pr-metronome', 'pr-guide', 'pr-preview', 'pr-audio-delay',
];

// The longest hold in the run. A free run holds every note for the same
// length. A saved run gives each note its own length, or holds every note for
// the fixed length the run carries.
function maxNoteBeats() {
  if (runner.mode === 'sequence') {
    return runner.sequence.notes.reduce(
      (max, note) => Math.max(max, runnerNoteBeats(runner.sequence, note)),
      1,
    );
  }
  return runner.noteBeats;
}

// Beats of runway shown to the right of the hit line. Scales with note length
// so a long, sustained note still fits comfortably on screen with approach time.
function visibleBeatsAhead() {
  return 6 + (maxNoteBeats() - 1) * 2;
}

/** The tempo the timeline runs at. A saved run carries its own tempo. */
function currentTempo() {
  if (runner.mode === 'sequence') return runner.sequence.bpm;
  return getContext().tempo;
}

/** The count-in length, in beats, before the first note reaches the line. */
function leadInBeats() {
  if (runner.mode === 'sequence') return runner.sequence.countInBeats;
  return LEAD_IN_BEATS;
}

/**
 * The silence a preview pass leaves before the answer, in beats. It outlasts
 * the room tail of the last preview note, so the lockout does not eat the
 * first note the singer sings.
 */
function passGapBeats() {
  return Math.max(PASS_GAP_MIN_BEATS, ROOM_TAIL_SEC / runner.secPerBeat);
}

/** The number of notes in one pass of the phrase. */
function passLength() {
  if (runner.mode === 'sequence') return runner.sequence.notes.length;
  return runner.patternSeq.length;
}

/**
 * The number of notes the run puts on the timeline, preview notes included.
 * Returns 0 for an endless run.
 */
function stepBudget() {
  if (runner.mode !== 'sequence') return 0;
  return runnerStepBudget(passLength(), runner.sequence.repeats, runner.preview);
}

/** The number of notes the run scores, or 0 for an endless run. */
function scoredNoteBudget() {
  if (runner.mode !== 'sequence') return 0;
  return runnerScoredBudget(passLength(), runner.sequence.repeats);
}

const GUIDE_LAYERS = [
  { type: 'sine',     detune: 0, level: 0.5 },
  { type: 'triangle', detune: 0, level: 0.28 },
];

const runner = {
  running: false,
  stream: null,
  capture: null,
  noiseFloor: null,
  trackSettings: null,
  lastPitchFrame: null,
  guideLockActive: false,
  rafId: null,

  // 'free' follows the shared root / scale / tempo and cycles a pattern for as
  // long as the player sings. 'sequence' plays one saved run and then stops.
  mode: 'free',
  sequence: null,
  dom: null,
  onFinish: null,
  finished: false,

  difficulty: 'medium',
  pattern: 'five-tone',
  rangeLow: 48,
  rangeHigh: 72,
  noteBeats: 2,
  metronome: true,
  guide: false,
  // Preview mode plays each pass twice: the app sings it, then the player
  // does. It gives a musician with little singing practice the target notes.
  preview: false,
  // Milliseconds between a scheduled sound and the moment the player hears it.
  audioDelayMs: AUDIO_DELAY_DEFAULT_MS,

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
  // The pitch window: the lanes the canvas shows now. A run with a wide range
  // shows a part of the range and slides the window as the melody moves.
  viewSpan: 13,
  viewCenter: null,
  lastViewTick: 0,
  trail: [],
  guideVoices: [],
  // The moment the room is quiet again after the last preview note. A preview
  // note sounds over the whole run, so its tail mutes every note, not one.
  previewMuteUntil: 0,

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

// The runner drives one stage at a time, because it owns the microphone. The
// bound map names the elements of that stage.
function el(name) {
  return (runner.dom && runner.dom[name]) || null;
}

function bindRunnerDom(map) {
  runner.dom = map || null;
}

/** Collect the runner elements of the Pitch section by their ids. */
function sectionRunnerDom() {
  const map = {};
  RUNNER_ELEMENT_NAMES.forEach((name) => {
    map[name] = document.getElementById(name);
  });
  return map;
}

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

// A melody-guide cue that sounds a note's whole written length, the same
// duration a preview note holds, so it works as a real pitch reference while
// the singer sings the note live. Scoring runs against the singer's voice
// through it rather than waiting out a lockout — see the mute-skip in
// scheduleAudio(). Returns the cue's audible duration in seconds (including
// release).
function scheduleGuideTone(note, time) {
  return scheduleCueTone(note.midi, time, previewToneSec(note));
}

// The length a preview note sounds for. A preview note holds its whole written
// length, because the singer must hear the target as a note, not as a hint.
function previewToneSec(note) {
  return Math.max(0.18, Math.min(3, note.dur * runner.secPerBeat));
}

// Sound one preview note. It plays louder than a guide cue, because it must
// carry the melody on its own. Returns the audible duration in seconds.
function schedulePreviewTone(note, time) {
  return scheduleCueTone(note.midi, time, previewToneSec(note), { velocity: 0.85, peak: 0.14 });
}

// Play one target note for the ear. Returns the audible duration in seconds
// (including the release), so the caller can mute scoring for that long.
function scheduleCueTone(midi, time, dur, { velocity = 0.7, peak = 0.1 } = {}) {
  const release = 0.12;

  const sampled = playPitchNote({
    audioCtx,
    midi,
    when: time,
    durSec: dur,
    velocity,
    destination: getAnalyserDestination(),
  });
  if (sampled) return dur + release;

  const wave = pitchVoiceWave();
  const freq = midiFreq(midi);
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
    osc.type = wave || layer.type;
    osc.frequency.value = freq;
    osc.detune.value = layer.detune;
    lg.gain.value = layer.level;
    osc.connect(lg);
    lg.connect(filter);
    return osc;
  });
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  oscs.forEach(o => { o.start(time); o.stop(time + dur + release + 0.05); });
  return dur + release;
}

// ---- Sequence building ------------------------------------------------------

function clampRange() {
  const lo = Math.min(runner.rangeLow, runner.rangeHigh);
  const hi = Math.max(runner.rangeLow, runner.rangeHigh);
  return { lo, hi };
}

function buildPatternSeq() {
  if (runner.mode === 'sequence') {
    runner.sequenceError = null;
    runner.patternSeq = runner.sequence.notes.map(note => note.midi);
    let min = Infinity;
    let max = -Infinity;
    runner.patternSeq.forEach(m => { min = Math.min(min, m); max = Math.max(max, m); });
    setLaneBounds(Number.isFinite(min) ? min - 2 : 55, Number.isFinite(max) ? max + 2 : 67);
    updateStartState();
    return;
  }
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
  setLaneBounds(min - 2, max + 2);
  updateStartState();
}

/**
 * Hold the pitch range of the whole run, and then size the visible window for
 * that range. A run of a few notes shows every lane. A run of three octaves
 * shows one part and slides through the rest.
 */
function setLaneBounds(min, max) {
  runner.laneMin = Math.round(min);
  runner.laneMax = Math.round(max);
  refreshViewSpan();
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
    // A run that ended leaves its score on the status line. Keep it there.
    setStartDisabled(false, runner.judged ? '' : 'Mic off');
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

/** The output delay the player set, in seconds. */
function audioDelaySec() {
  return clampAudioDelayMs(runner.audioDelayMs) / 1000;
}

/**
 * The AudioContext time to start a cue that the player must hear at
 * `heardTime`. The cue leaves early by the output delay. Returns null when
 * that moment already passed, so the runner drops the cue instead of
 * playing it late.
 */
function cuePlayTime(heardTime) {
  const playAt = heardTime - audioDelaySec();
  if (playAt < audioCtx.currentTime - 0.05) return null;
  return Math.max(playAt, audioCtx.currentTime);
}

/**
 * The delay before the first beat of a run. It holds the whole output delay,
 * so even the first cue has time to leave early.
 */
function startLeadSec() {
  return 0.15 + audioDelaySec();
}

function getAnalysisDelaySec() {
  if (runner.capture) return runner.capture.windowSize / audioCtx.sampleRate / 2;
  return 4096 / audioCtx.sampleRate / 2;
}

// Append notes until the timeline is populated a comfortable margin past the
// right edge, cycling the pattern endlessly.
function ensureNotes(playheadBeat) {
  const horizon = playheadBeat + visibleBeatsAhead() + maxNoteBeats() + 4;
  const budget = stepBudget();
  while (runner.nextBeat < horizon) {
    if (budget && runner.seqIdx >= budget) break;
    const step = sequenceStep(runner.seqIdx);
    if (!step) break;
    // Preview mode starts every pass on a bar line. The preview and the answer
    // then begin on the same beat of the click, and a short silence separates
    // the app's voice from the singer's.
    if (runner.preview && step.passStart && runner.seqIdx > 0) {
      runner.nextBeat = nextPassStartBeat(runner.nextBeat, { minGapBeats: passGapBeats() });
    }
    const startAudioTime = runner.startAudioTime + runner.nextBeat * runner.secPerBeat;
    runner.notes.push({
      startBeat: runner.nextBeat,
      dur: step.dur,
      midi: step.midi,
      preview: step.preview,
      pass: step.pass,
      startAudioTime,
      endAudioTime: startAudioTime + step.dur * runner.secPerBeat,
      samples: [],
      judged: false,
      result: null,
      noteAccuracy: 0,
      guideMuteUntil: 0,
      guideScheduled: false,
    });
    runner.seqIdx += 1;
    runner.nextBeat += step.advance;
  }
}

/**
 * The note at one position of the run: its pitch, how long the bar holds, and
 * how far the timeline moves before the next note starts.
 */
function sequenceStep(index) {
  const pos = runnerPassPosition(index, passLength(), runner.preview);
  if (!pos) return null;
  const place = { preview: pos.preview, pass: pos.pass, passStart: pos.passStart };
  if (runner.mode === 'sequence') {
    const note = runner.sequence.notes[pos.step];
    const beats = runnerNoteBeats(runner.sequence, note);
    const gap = Math.min(NOTE_GAP_BEATS, beats * 0.2);
    return {
      ...place,
      midi: note.midi,
      dur: Math.max(0.25, beats - gap),
      advance: beats + runner.sequence.restBeats,
    };
  }
  return {
    ...place,
    midi: runner.patternSeq[pos.step],
    dur: Math.max(0.35, runner.noteBeats - NOTE_GAP_BEATS),
    advance: runner.noteBeats,
  };
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
    ok: get('--ok', '#4ade80'),
    warn: get('--warn', '#fbbf24'),
    err: get('--err', '#f87171'),
    muted: get('--muted', '#8a8aa0'),
    text: get('--text', '#f0f0f5'),
    border: get('--border', 'rgba(255,255,255,0.12)'),
    card: get('--card', '#15151d'),
    bg2: get('--bg2', '#1c1c26'),
  };
}

function resizeCanvas() {
  const canvas = el('pr-canvas');
  const stage = el('pr-stage');
  if (!canvas || !stage) return;
  // Measure the canvas box. The canvas fills the stage inside its border, so
  // the stage box is 1px larger on each side.
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.round(rect.width);
  const cssH = Math.round(rect.height);
  // The stage is hidden or not laid out yet. The ResizeObserver calls this
  // function again when the stage gets a size.
  if (cssW < 1 || cssH < 1) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  // Do not write a pixel width or height on the canvas. CSS makes the canvas
  // fill the stage. A pixel size becomes a minimum size for the layout and
  // makes the card wider than a phone screen.
  runner.cssW = cssW;
  runner.cssH = cssH;
  refreshViewSpan();
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  runner.ctx2d = ctx;
  if (!runner.running) drawIdle();
}

function pxPerBeat() {
  const hitX = runner.cssW * HIT_X_RATIO;
  return (runner.cssW - hitX) / visibleBeatsAhead();
}

// The lanes fill the canvas between a margin at the top and at the bottom.
const VIEW_PAD_PX = 14;

/** The height the pitch lanes fill, in CSS pixels. */
function laneAreaHeight() {
  return Math.max(1, runner.cssH - VIEW_PAD_PX * 2);
}

/** The number of lanes the whole run covers. */
function contentLaneCount() {
  return runner.laneMax - runner.laneMin + 1;
}

/** The middle lane of the whole run, in MIDI numbers. */
function contentCenter() {
  return (runner.laneMin + runner.laneMax) / 2;
}

/** The middle lane of the window now. */
function viewCenter() {
  return runner.viewCenter == null ? contentCenter() : runner.viewCenter;
}

/**
 * Size the window for the canvas and for the range of the run, and then hold
 * the window inside that range. The canvas calls this on every resize.
 */
function refreshViewSpan() {
  runner.viewSpan = visibleLaneSpan(laneAreaHeight(), contentLaneCount());
  if (runner.viewCenter != null) {
    runner.viewCenter = clampViewCenter(
      runner.viewCenter, runner.viewSpan, runner.laneMin, runner.laneMax,
    );
  }
}

/** The pitch the window must show for the notes at one beat. */
function viewTargetAt(playheadBeat) {
  const target = targetViewCenter(runner.notes, playheadBeat, {
    span: runner.viewSpan,
    aheadBeats: visibleBeatsAhead(),
    behindBeats: VIEW_BEHIND_BEATS,
    edgeLanes: VIEW_EDGE_LANES,
    fallbackCenter: viewCenter(),
  });
  return clampViewCenter(target, runner.viewSpan, runner.laneMin, runner.laneMax);
}

/**
 * Move the window toward the notes that play now. `snap` puts the window on
 * the target at once, for the first frame of a run.
 */
function updateView(playheadBeat, { snap = false } = {}) {
  const target = viewTargetAt(playheadBeat);
  if (snap || runner.viewCenter == null) {
    runner.viewCenter = target;
    runner.lastViewTick = 0;
    return;
  }
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const dt = runner.lastViewTick ? now - runner.lastViewTick : 0;
  runner.lastViewTick = now;
  runner.viewCenter = easeViewCenter(runner.viewCenter, target, dt);
}

function midiToY(midiFloat) {
  const top = viewCenter() + runner.viewSpan / 2;
  const span = runner.viewSpan || 1;
  return VIEW_PAD_PX + ((top - midiFloat) / span) * laneAreaHeight();
}

function laneHeight() {
  return laneAreaHeight() / (runner.viewSpan || 1);
}

function drawIdle() {
  const ctx = runner.ctx2d;
  if (!ctx) return;
  ctx.clearRect(0, 0, runner.cssW, runner.cssH);
  ctx.fillStyle = runner.colors ? runner.colors.card : '#15151d';
  ctx.fillRect(0, 0, runner.cssW, runner.cssH);
}

function draw(playheadBeat) {
  const ctx = runner.ctx2d;
  if (!ctx) return;
  const c = runner.colors;
  const W = runner.cssW;
  const H = runner.cssH;
  const hitX = W * HIT_X_RATIO;
  const ppb = pxPerBeat();
  const lh = laneHeight();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = c.card;
  ctx.fillRect(0, 0, W, H);

  // Pitch lanes (one per semitone), scale tones subtly highlighted. Only the
  // lanes of the window get drawn, so a wide run keeps readable lanes.
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui, sans-serif';
  const lanes = visibleLaneRange(viewCenter(), runner.viewSpan, runner.laneMin, runner.laneMax);
  const inSeq = new Set(runner.patternSeq);
  for (let m = lanes.lo; m <= lanes.hi; m++) {
    const y = midiToY(m);
    if (inSeq.has(m)) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y - lh / 2, W, lh);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y - lh / 2);
    ctx.lineTo(W, y - lh / 2);
    ctx.stroke();
  }

  // Beat grid — stronger lines on downbeats to convey 4/4 timing.
  const firstBeat = Math.floor(playheadBeat - hitX / ppb) - 1;
  const lastBeat = Math.ceil(playheadBeat + (W - hitX) / ppb) + 1;
  for (let b = firstBeat; b <= lastBeat; b++) {
    const x = hitX + (b - playheadBeat) * ppb;
    if (x < 0 || x > W) continue;
    const downbeat = ((b % 4) + 4) % 4 === 0;
    ctx.strokeStyle = downbeat ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = downbeat ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Note bars.
  const activeMidi = currentTargetMidi(playheadBeat);
  for (const note of runner.notes) {
    const x = hitX + (note.startBeat - playheadBeat) * ppb;
    const w = note.dur * ppb;
    if (x + w < 0 || x > W) continue;
    const y = midiToY(note.midi);
    const barH = Math.max(10, lh * 0.72);
    if (note.preview) {
      // A preview bar is hollow. The app sings it, so the player must wait.
      roundRect(ctx, x, y - barH / 2, Math.max(6, w), barH, Math.min(8, barH / 2));
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    let fill;
    if (note.judged) {
      fill = note.result === 'miss' ? c.err : note.result === 'centered' ? c.ok : c.warn;
    } else if (note.midi === activeMidi) {
      fill = c.accent;
    } else {
      fill = 'rgba(124,156,255,0.55)';
    }
    ctx.fillStyle = fill;
    roundRect(ctx, x, y - barH / 2, Math.max(6, w), barH, Math.min(8, barH / 2));
    ctx.fill();
  }

  // Pitch trail (recent detected pitch) scrolling left from the hit line.
  if (runner.trail.length > 1) {
    for (let i = 1; i < runner.trail.length; i++) {
      const a = runner.trail[i - 1];
      const b = runner.trail[i];
      if (!a.hasPitch || !b.hasPitch) continue;
      const xa = hitX + (a.beat - playheadBeat) * ppb;
      const xb = hitX + (b.beat - playheadBeat) * ppb;
      ctx.strokeStyle = b.inTune ? c.ok : c.warn;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xa, midiToY(a.midiFloat));
      ctx.lineTo(xb, midiToY(b.midiFloat));
      ctx.stroke();
    }
  }

  // Note-name labels in the left gutter, drawn last so bars never hide them.
  // A short lane prints only the names that matter, so no two names overlap.
  const inSeqLbl = new Set(runner.patternSeq);
  for (let m = lanes.lo; m <= lanes.hi; m++) {
    if (!shouldLabelLane(m, { lanePx: lh })) continue;
    const isTarget = inSeqLbl.has(m);
    const y = midiToY(m);
    const lbl = midiToLabel(m);
    const tw = ctx.measureText(lbl.full).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 3, y - 8, tw + 8, 16, 5);
    ctx.fill();
    ctx.fillStyle = isTarget ? c.text : c.muted;
    ctx.globalAlpha = isTarget ? 0.95 : 0.6;
    ctx.fillText(lbl.full, 7, y);
    ctx.globalAlpha = 1;
  }

  // A rail on the right edge shows where the window sits in the whole range.
  drawRangeRail(ctx);

  // Hit line.
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(hitX, 0);
  ctx.lineTo(hitX, H);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Live pitch puck on the hit line.
  const last = runner.trail[runner.trail.length - 1];
  if (last && last.hasPitch) {
    // A voice above or below the window still shows, held at the edge.
    const y = Math.max(8, Math.min(H - 8, midiToY(last.midiFloat)));
    ctx.fillStyle = last.inTune ? c.ok : c.warn;
    ctx.beginPath();
    ctx.arc(hitX, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.card;
    ctx.beginPath();
    ctx.arc(hitX, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Preview mode says whose turn it is: the app's or the player's.
  if (runner.preview) drawTurnBadge(ctx, playheadBeat);

  // Count-in cue before the first note reaches the line.
  const leadIn = leadInBeats();
  if (playheadBeat < leadIn) {
    const remaining = Math.ceil(leadIn - playheadBeat);
    ctx.fillStyle = c.text;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    ctx.font = '600 42px system-ui, sans-serif';
    ctx.fillText(String(remaining), W / 2, H / 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

/**
 * A rail on the right edge that shows the whole range of the run and the part
 * of it the window holds now. It appears only when the range is too wide for
 * one screen, so a short run keeps a clean canvas.
 */
function drawRangeRail(ctx) {
  if (runner.viewSpan >= contentLaneCount()) return;
  const c = runner.colors;
  const H = runner.cssH;
  const x = runner.cssW - 9;
  const top = VIEW_PAD_PX;
  const bottom = H - VIEW_PAD_PX;
  const height = bottom - top;
  if (height <= 8) return;
  const low = runner.laneMin - 0.5;
  const high = runner.laneMax + 0.5;
  const spanAll = high - low;
  const yFor = midi => top + ((high - midi) / spanAll) * height;

  ctx.fillStyle = c.border;
  ctx.globalAlpha = 0.5;
  roundRect(ctx, x - 2, top, 4, height, 2);
  ctx.fill();

  // A dot for every pitch of the run, so the singer sees the whole shape.
  ctx.fillStyle = c.muted;
  ctx.globalAlpha = 0.55;
  new Set(runner.patternSeq).forEach((midi) => {
    ctx.fillRect(x - 3.5, yFor(midi) - 0.75, 7, 1.5);
  });

  // The window.
  const center = viewCenter();
  const thumbTop = yFor(center + runner.viewSpan / 2);
  const thumbBottom = yFor(center - runner.viewSpan / 2);
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = 0.55;
  roundRect(ctx, x - 3, thumbTop, 6, Math.max(6, thumbBottom - thumbTop), 3);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * The label for the pass that plays now: the app's preview, or the player's
 * turn to sing. Returns null before the first note.
 */
function turnLabel(playheadBeat) {
  let active = null;
  let next = null;
  for (const note of runner.notes) {
    if (playheadBeat >= note.startBeat && playheadBeat < note.startBeat + note.dur) {
      active = note;
      break;
    }
    if (note.startBeat > playheadBeat && (!next || note.startBeat < next.startBeat)) next = note;
  }
  const note = active || next;
  if (!note) return null;
  return note.preview ? 'Listen' : 'Your turn \u2014 sing';
}

/** Draw the preview-mode turn label at the top of the stage. */
function drawTurnBadge(ctx, playheadBeat) {
  const label = turnLabel(playheadBeat);
  if (!label) return;
  const c = runner.colors;
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const boxW = tw + 22;
  const boxH = 22;
  const x = runner.cssW / 2 - boxW / 2;
  roundRect(ctx, x, 8, boxW, boxH, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.text;
  ctx.fillText(label, runner.cssW / 2, 8 + boxH / 2 + 0.5);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function currentTargetMidi(playheadBeat) {
  for (const note of runner.notes) {
    if (playheadBeat >= note.startBeat && playheadBeat < note.startBeat + note.dur) {
      return note.midi;
    }
  }
  return null;
}

// ---- Main loop --------------------------------------------------------------

function scheduleAudio(playheadBeat) {
  const ahead = 0.2; // seconds of look-ahead for click/guide scheduling
  const delay = audioDelaySec();
  // Every cue leaves the app early by the output delay, so the look-ahead
  // window grows by the same amount.
  const horizonBeat = playheadBeat + (ahead + delay) / runner.secPerBeat;
  // Metronome clicks on every beat.
  while (runner.metronome && runner.nextClickBeat < horizonBeat) {
    if (runner.nextClickBeat >= 0) {
      const heardAt = runner.startAudioTime + runner.nextClickBeat * runner.secPerBeat;
      const playAt = cuePlayTime(heardAt);
      if (playAt != null) {
        scheduleClick(playAt, ((runner.nextClickBeat % 4) + 4) % 4 === 0);
      }
    }
    runner.nextClickBeat += 1;
  }
  // Target notes the app sounds for the ear: a preview note and an optional
  // melody-guide cue both hold a note's whole written length. A preview note
  // plays with nobody singing, so scoring stays muted for its audible life.
  // The melody guide instead sounds alongside the singer, so scoring is left
  // running through it rather than muted for the note's whole duration.
  for (const note of runner.notes) {
    if (note.guideScheduled) continue;
    if (!note.preview && !runner.guide) continue;
    if (note.startBeat > horizonBeat) continue;
    const heardAt = runner.startAudioTime + note.startBeat * runner.secPerBeat;
    const playAt = cuePlayTime(heardAt);
    if (playAt != null) {
      if (note.preview) {
        const cueSec = schedulePreviewTone(note, playAt);
        // The microphone hears the cue only after the output delay.
        const muteUntil = lockoutUntil(playAt + delay + cueSec);
        note.guideMuteUntil = muteUntil;
        // A preview note sounds while the notes after it wait their turn, so
        // its tail must mute the whole run and not only its own bar.
        runner.previewMuteUntil = Math.max(runner.previewMuteUntil, muteUntil);
      } else {
        scheduleGuideTone(note, playAt);
      }
    }
    note.guideScheduled = true;
  }
}

/**
 * The moment scoring may start again for one note. It holds the note's own
 * guide cue and the tail of the last preview note the app played.
 */
function cueMuteUntil(note) {
  return Math.max(note.guideMuteUntil, runner.previewMuteUntil);
}

function handleRunnerPitchFrame(frame) {
  if (!runner.running) return;
  const audioTime = frame.audioTime;
  // The app plays the preview notes, so the room is not quiet until the last
  // preview tone dies away.
  let anyLockActive = !isScoringWindowClear(audioTime, runner.previewMuteUntil, runner.capture);
  if (!anyLockActive) {
    for (const note of runner.notes) {
      if (note.guideMuteUntil > 0 && !isScoringWindowClear(audioTime, note.guideMuteUntil, runner.capture)) {
        anyLockActive = true;
        break;
      }
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
  if (!runner.running) return;
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

  const target = currentTargetMidi(playheadBeat);
  let inTune = false;
  if (voiced && frequencyHz > 0 && target != null) {
    const cents = centsOffFromTarget(frequencyHz, target);
    inTune = cents != null && Math.abs(cents) <= 20;
  }

  for (const note of runner.notes) {
    if (note.judged) continue;
    const end = note.startBeat + note.dur;
    if (note.preview) {
      // The app sings a preview note. The game does not listen for it and it
      // never reaches the score.
      if (playheadBeat >= end) note.judged = true;
      continue;
    }
    const inNoteWindow = correctedAudioTime >= note.startAudioTime
      && correctedAudioTime < note.endAudioTime;
    if (inNoteWindow) {
      const scoring = isScoringWindowClear(correctedAudioTime, cueMuteUntil(note), runner.capture);
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

  // A saved run plays a fixed number of notes and then stops on its own.
  // Preview notes carry no score, so only the sung notes end the run.
  const budget = scoredNoteBudget();
  if (budget && !runner.finished && runner.judged >= budget) {
    runner.finished = true;
    updateView(playheadBeat);
    draw(playheadBeat);
    finishRun();
    return;
  }

  // Record the pitch trace and prune notes/trail that scrolled off-screen.
  runner.trail.push({ beat: playheadBeat, midiFloat: midiFloat ?? viewCenter(), hasPitch, inTune });
  const leftBeats = (runner.cssW * HIT_X_RATIO) / pxPerBeat();
  const cutoff = playheadBeat - leftBeats - 1;
  while (runner.trail.length && runner.trail[0].beat < cutoff) runner.trail.shift();
  runner.notes = runner.notes.filter(n => n.startBeat + n.dur >= cutoff);

  updateView(playheadBeat);
  draw(playheadBeat);
}

// ---- Lifecycle --------------------------------------------------------------

function resetTimeline() {
  runner.secPerBeat = 60 / currentTempo();
  runner.startAudioTime = audioCtx.currentTime + startLeadSec();
  runner.seqIdx = 0;
  runner.finished = false;
  runner.nextBeat = leadInBeats();
  runner.nextClickBeat = 0;
  runner.notes = [];
  runner.trail = [];
  runner.previewMuteUntil = 0;
  runner.viewCenter = null;
  runner.lastViewTick = 0;
  buildPatternSeq();
  ensureNotes(0);
  // The window starts on the first notes, so the run does not scroll in from
  // the middle of the range.
  updateView(0, { snap: true });
}

async function startRunner() {
  stopOtherPitchMicTools('runner');

  ensureAudio();
  // The samples of the pitch voice load in the background. Until they are
  // ready, the guide cue plays the built-in oscillator.
  void preparePitchVoice(audioCtx);
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
      status.textContent = runner.preview
        ? 'Listen to each pass, then sing the same notes back'
        : 'Listening\u2026 sing the notes as they cross the line';
    }
    runner.startAudioTime = audioCtx.currentTime + startLeadSec();
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

/** End a saved run that played every note, and report the result. */
function finishRun() {
  const summary = runSummary();
  stopRunner();
  if (typeof runner.onFinish === 'function') {
    try { runner.onFinish(summary); } catch (e) { /* the caller owns its errors */ }
  }
}

/** The score of the run that just ended. */
function runSummary() {
  const accuracy = runner.noteAccuracies.length
    ? Math.round(runner.noteAccuracies.reduce((a, b) => a + b, 0) / runner.noteAccuracies.length)
    : 0;
  return {
    score: runner.score,
    bestCombo: runner.bestCombo,
    accuracy,
    judged: runner.judged,
  };
}

function stopRunner() {
  if (!runner.running && !runner.stream) {
    setToggleLabel(false);
    return;
  }
  runner.running = false;
  if (runner.rafId) { cancelAnimationFrame(runner.rafId); runner.rafId = null; }
  if (runner.capture) { runner.capture.stop(); runner.capture = null; }
  runner.lastPitchFrame = null;
  runner.guideLockActive = false;
  if (runner.noiseFloor) runner.noiseFloor = null;
  if (runner.stream) { releaseMicStream(runner.stream); runner.stream = null; }
  setToggleLabel(false);
  const status = el('pr-status');
  if (status) {
    const summary = runSummary();
    const lead = runner.finished ? 'Run complete' : 'Stopped';
    status.textContent = runner.judged
      ? `${lead} \u2014 best combo ${summary.bestCombo}\u00D7, ${summary.accuracy}% accuracy`
      : 'Mic off';
  }
  updateStartState();
  setOverlay(runner.finished ? 'Run complete \u2014 press start to run it again' : 'Press start to play');
  drawIdle();
}

function togglePitchRunner() {
  if (runner.running) stopRunner(); else startRunner();
}

function setToggleLabel(on) {
  const btn = el('pr-toggle');
  if (btn) btn.textContent = on ? 'Stop game' : 'Start game';
}

function setOverlay(text) {
  const ov = el('pr-overlay');
  if (!ov) return;
  ov.textContent = text || '';
  ov.style.display = text ? 'flex' : 'none';
}

function restartIfRunning() {
  if (runner.running) {
    resetScore();
    resetTimeline();
    runner.startAudioTime = audioCtx.currentTime + startLeadSec();
    runner.nextClickBeat = 0;
    syncNoteAudioTimes();
  } else {
    buildPatternSeq();
    if (runner.ctx2d) drawIdle();
  }
}

// ---- Controls / init --------------------------------------------------------

function syncTempoLabel() {
  const bpmEl = el('pr-bpm');
  if (bpmEl) bpmEl.textContent = String(currentTempo());
  runner.secPerBeat = 60 / currentTempo();
}

/**
 * Read the output delay. It belongs to the headphones the player uses, not to
 * one run, so both modes share the same saved value.
 */
function loadAudioDelay() {
  runner.audioDelayMs = clampAudioDelayMs(
    getSetting('pitchRunner.audioDelayMs', AUDIO_DELAY_DEFAULT_MS),
  );
}

function loadFreeSettings() {
  runner.difficulty = getSetting('pitchRunner.difficulty', runner.difficulty, DIFFICULTIES.map(d => d.id));
  runner.pattern = getSetting('pitchRunner.pattern', runner.pattern, SCALE_PATTERNS.map(p => p.id));
  runner.rangeLow = Number(getSetting('pitchRunner.rangeLow', runner.rangeLow));
  runner.rangeHigh = Number(getSetting('pitchRunner.rangeHigh', runner.rangeHigh));
  runner.noteBeats = Number(getSetting('pitchRunner.noteBeats', runner.noteBeats));
  runner.metronome = getSetting('pitchRunner.metronome', runner.metronome) !== false;
  runner.guide = getSetting('pitchRunner.guide', runner.guide) === true;
  runner.preview = getSetting('pitchRunner.preview', runner.preview) === true;
  if (!(runner.rangeLow >= 36 && runner.rangeLow <= 84)) runner.rangeLow = 48;
  if (!(runner.rangeHigh >= 36 && runner.rangeHigh <= 84)) runner.rangeHigh = 72;
  if (!NOTE_LENGTHS.includes(runner.noteBeats)) runner.noteBeats = 2;
}

// The runner keeps one microphone and one timeline, so only one stage plays at
// a time. `attachRunner` points the engine at the stage that is on screen now.
let globalsWired = false;

/**
 * Point the runner at a stage and wire its controls.
 * @param {{ dom: object, sequence?: object|null, onFinish?: (summary:object)=>void }} options
 * @returns {{ start: () => void, stop: () => void, toggle: () => void, refresh: () => void, detach: () => void }}
 */
function attachRunner({ dom, sequence = null, onFinish = null } = {}) {
  stopRunner();
  detachResizeObserver();
  bindRunnerDom(dom);
  runner.onFinish = onFinish;
  runner.finished = false;

  if (sequence) {
    runner.mode = 'sequence';
    runner.sequence = sequence;
    runner.metronome = sequence.metronome !== false;
    runner.guide = sequence.guide !== false;
    runner.preview = sequence.preview === true;
  } else {
    runner.mode = 'free';
    runner.sequence = null;
    loadFreeSettings();
  }
  loadAudioDelay();

  wireControls();
  wireGlobals();
  observeStage();

  syncControls();
  syncTempoLabel();
  readColors();
  buildPatternSeq();
  resizeCanvas();
  updateHud();
  updateStartState();
  setOverlay('Press start to play');

  return {
    start: () => { if (!runner.running) startRunner(); },
    stop: () => stopRunner(),
    toggle: () => togglePitchRunner(),
    refresh: () => {
      syncControls();
      syncTempoLabel();
      readColors();
      resizeCanvas();
      if (!runner.running) { buildPatternSeq(); drawIdle(); }
    },
    detach: () => {
      if (runner.dom !== dom) return;
      stopRunner();
      detachResizeObserver();
      bindRunnerDom(null);
      runner.onFinish = null;
      runner.mode = 'free';
      runner.sequence = null;
      runner.preview = false;
    },
  };
}

function initPitchRunner() {
  const dom = sectionRunnerDom();
  if (runner.dom && runner.dom['pr-canvas'] === dom['pr-canvas'] && runner.mode === 'free') {
    loadFreeSettings();
    loadAudioDelay();
    syncControls();
    syncTempoLabel();
    readColors();
    resizeCanvas();
    if (!runner.running) { buildPatternSeq(); drawIdle(); }
    return;
  }
  attachRunner({ dom });
}

function wireControls() {
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

  const bpmDown = el('pr-bpm-down');
  const bpmUp = el('pr-bpm-up');
  const changeTempo = (delta) => {
    const next = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, currentTempo() + delta));
    // A saved run keeps its own tempo, so it must not move the shared context.
    if (runner.mode === 'sequence') runner.sequence.bpm = next;
    else setContext({ tempo: next }, 'pitchRunner');
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
      if (runner.mode === 'sequence') runner.sequence.metronome = runner.metronome;
      else saveSetting('pitchRunner.metronome', runner.metronome);
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
      if (runner.mode === 'sequence') runner.sequence.guide = runner.guide;
      else saveSetting('pitchRunner.guide', runner.guide);
    };
  }

  const previewChk = el('pr-preview');
  if (previewChk) {
    previewChk.checked = runner.preview;
    previewChk.onchange = () => {
      runner.preview = previewChk.checked;
      if (runner.mode === 'sequence') runner.sequence.preview = runner.preview;
      else saveSetting('pitchRunner.preview', runner.preview);
      // The pass plan changes, so the timeline must be built again.
      restartIfRunning();
    };
  }

  const delayInput = el('pr-audio-delay');
  if (delayInput) {
    delayInput.min = String(AUDIO_DELAY_MIN_MS);
    // No maximum: a headset with a long link needs whatever the player measures.
    delayInput.removeAttribute('max');
    delayInput.step = String(AUDIO_DELAY_STEP_MS);
    delayInput.value = String(runner.audioDelayMs);
    delayInput.onchange = () => {
      runner.audioDelayMs = clampAudioDelayMs(delayInput.value);
      delayInput.value = String(runner.audioDelayMs);
      saveSetting('pitchRunner.audioDelayMs', runner.audioDelayMs);
    };
  }

  const toggleBtn = el('pr-toggle');
  if (toggleBtn && !toggleBtn.getAttribute('onclick')) {
    toggleBtn.onclick = () => togglePitchRunner();
  }
}

function wireGlobals() {
  if (globalsWired) return;
  globalsWired = true;
  // Keep tempo label in sync when other tools change the shared context.
  subscribeContext(() => {
    if (runner.mode === 'sequence') return;
    syncTempoLabel();
    if (!runner.running) { buildPatternSeq(); if (runner.ctx2d) drawIdle(); }
  });
  registerPitchMicStop('runner', stopRunner);
}

// Redraw the idle or live canvas when the stage resizes.
function observeStage() {
  const stage = el('pr-stage');
  if (stage && typeof ResizeObserver === 'function') {
    runner.resizeObs = new ResizeObserver(() => resizeCanvas());
    runner.resizeObs.observe(stage);
    return;
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', resizeCanvas);
}

function detachResizeObserver() {
  if (runner.resizeObs) {
    try { runner.resizeObs.disconnect(); } catch (e) { /* already gone */ }
    runner.resizeObs = null;
  } else if (typeof window !== 'undefined') {
    window.removeEventListener('resize', resizeCanvas);
  }
}

function matchPreset() {
  const found = RANGE_PRESETS.find(p => p.low === runner.rangeLow && p.high === runner.rangeHigh);
  return found ? found.id : 'tenor';
}

function syncControls() {
  const diffSel = el('pr-difficulty');
  const patternSel = el('pr-pattern');
  const presetSel = el('pr-range-preset');
  const lengthSel = el('pr-length');
  const metroChk = el('pr-metronome');
  const guideChk = el('pr-guide');
  const previewChk = el('pr-preview');
  const delayInput = el('pr-audio-delay');
  if (diffSel) diffSel.value = runner.difficulty;
  if (patternSel) patternSel.value = runner.pattern;
  if (presetSel) presetSel.value = matchPreset();
  if (lengthSel) lengthSel.value = String(runner.noteBeats);
  if (metroChk) metroChk.checked = runner.metronome;
  if (guideChk) guideChk.checked = runner.guide;
  if (previewChk) previewChk.checked = runner.preview;
  if (delayInput) delayInput.value = String(runner.audioDelayMs);
}

if (typeof window !== 'undefined') window.togglePitchRunner = togglePitchRunner;

export { initPitchRunner, attachRunner, stopRunner as stopPitchRunner, runner };
