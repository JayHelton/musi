import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { parseNote } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext, subscribeContext, TEMPO_MIN, TEMPO_MAX } from './musicalContext.js';
import { createPitchTracker } from './pitch.js';
import { centsOffFromTarget, freqToMidiFloat, midiToLabel } from './pitchMatch.js';
import { buildStages, chooseRootMidi, SCALE_PATTERNS } from './pitchExercises.js';
import { stopTuner, tuner } from './vocalTrainer.js';
import { pt, stopPitchTrainer } from './pitchTrainer.js';

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
const LEAD_IN_BEATS = 4;       // one 4/4 measure of count-in before the first note
const NOTE_GAP_BEATS = 0.18;   // silent gap (beats) between adjacent notes
const NOTE_LENGTHS = [1, 2, 3, 4]; // selectable note durations, in beats

// Beats of runway shown to the right of the hit line. Scales with note length
// so a long, sustained note still fits comfortably on screen with approach time.
function visibleBeatsAhead() {
  return 6 + (runner.noteBeats - 1) * 2;
}

const GUIDE_LAYERS = [
  { type: 'sine',     detune: 0,  level: 0.5 },
  { type: 'triangle', detune: -4, level: 0.28 },
];

const runner = {
  running: false,
  initialized: false,
  stream: null,
  source: null,
  analyser: null,
  buf: null,
  tracker: null,
  rafId: null,

  difficulty: 'medium',
  pattern: 'five-tone',
  rangeLow: 48,
  rangeHigh: 72,
  noteBeats: 1,
  metronome: true,
  guide: false,

  // Timeline / scoring state.
  startAudioTime: 0,
  secPerBeat: 0.5,
  toleranceCents: 30,
  hitThreshold: 0.5,
  patternSeq: [],
  seqIdx: 0,
  nextBeat: LEAD_IN_BEATS,
  notes: [],
  nextClickBeat: 0,
  guideBeat: 0,
  laneMin: 55,
  laneMax: 67,
  trail: [],
  guideVoices: [],

  score: 0,
  combo: 0,
  bestCombo: 0,
  hits: 0,
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
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(accented ? 1200 : 800, time);
  osc.frequency.exponentialRampToValueAtTime(accented ? 600 : 400, time + 0.04);
  filter.type = 'bandpass';
  filter.frequency.value = accented ? 1000 : 700;
  filter.Q.value = 2;
  gain.gain.setValueAtTime(accented ? 0.3 : 0.16, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(time);
  osc.stop(time + 0.08);
}

// A short, soft melody-guide tone at a note's start. Kept quiet and brief so it
// hints the pitch without dominating the singer's own voice.
function scheduleGuideTone(midi, time, beats) {
  const freq = midiFreq(midi);
  const dur = Math.max(0.18, beats * runner.secPerBeat * 0.8);
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(Math.max(freq * 6, 1800), 6000);
  filter.Q.value = 0.4;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.12, time + 0.03);
  gain.gain.setValueAtTime(0.1, time + dur * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
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
  oscs.forEach(o => { o.start(time); o.stop(time + dur + 0.05); });
}

// ---- Sequence building ------------------------------------------------------

function clampRange() {
  const lo = Math.min(runner.rangeLow, runner.rangeHigh);
  const hi = Math.max(runner.rangeLow, runner.rangeHigh);
  return { lo, hi };
}

function buildPatternSeq() {
  const { root, scale } = getContext();
  const stages = buildStages(scale, runner.pattern);
  const stage = stages[0];
  const parsed = parseNote(root);
  const rootPc = parsed ? parsed.semi : 0;
  const span = stage.offsets.reduce((m, o) => Math.max(m, o), 0);
  const { lo, hi } = clampRange();
  const rootMidi = chooseRootMidi(rootPc, lo, hi, span);
  runner.patternSeq = stage.offsets.map(off => rootMidi + off);
  if (!runner.patternSeq.length) runner.patternSeq = [rootMidi];

  // Lane bounds cover the whole melody plus a little padding so notes never sit
  // flush against the top/bottom edge.
  let min = Infinity;
  let max = -Infinity;
  runner.patternSeq.forEach(m => { min = Math.min(min, m); max = Math.max(max, m); });
  runner.laneMin = min - 2;
  runner.laneMax = max + 2;
}

// Append notes until the timeline is populated a comfortable margin past the
// right edge, cycling the pattern endlessly.
function ensureNotes(playheadBeat) {
  const horizon = playheadBeat + visibleBeatsAhead() + runner.noteBeats + 4;
  const dur = Math.max(0.35, runner.noteBeats - NOTE_GAP_BEATS);
  while (runner.nextBeat < horizon) {
    const midi = runner.patternSeq[runner.seqIdx % runner.patternSeq.length];
    runner.notes.push({
      startBeat: runner.nextBeat,
      dur,
      midi,
      samples: 0,
      hitSamples: 0,
      judged: false,
      result: null,
    });
    runner.seqIdx += 1;
    runner.nextBeat += runner.noteBeats;
  }
}

// ---- Scoring ----------------------------------------------------------------

function finalizeNote(note) {
  note.judged = true;
  const frac = note.samples > 0 ? note.hitSamples / note.samples : 0;
  runner.judged += 1;
  if (frac >= runner.hitThreshold) {
    note.result = frac >= 0.85 ? 'perfect' : 'good';
    runner.combo += 1;
    runner.bestCombo = Math.max(runner.bestCombo, runner.combo);
    runner.hits += 1;
    // Score rewards accuracy and combo streaks.
    const base = note.result === 'perfect' ? 100 : 60;
    runner.score += base + Math.min(runner.combo, 20) * 5;
    flashJudge(note.result === 'perfect' ? 'Perfect!' : 'Good', note.result);
  } else {
    note.result = 'miss';
    runner.combo = 0;
    flashJudge('Miss', 'miss');
  }
  updateHud();
}

function flashJudge(text, cls) {
  const j = el('pr-judge');
  if (!j) return;
  j.textContent = text;
  j.className = 'pr-judge show ' + cls;
  // Restart the CSS animation.
  void j.offsetWidth;
  j.className = 'pr-judge show ' + cls + ' anim';
}

function updateHud() {
  const scoreEl = el('pr-score');
  const comboEl = el('pr-combo');
  const accEl = el('pr-accuracy');
  if (scoreEl) scoreEl.textContent = String(runner.score);
  if (comboEl) comboEl.textContent = runner.combo > 0 ? `${runner.combo}\u00D7` : '0';
  if (accEl) accEl.textContent = runner.judged ? Math.round((runner.hits / runner.judged) * 100) + '%' : '--';
}

function resetScore() {
  runner.score = 0;
  runner.combo = 0;
  runner.bestCombo = 0;
  runner.hits = 0;
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

  // Pitch lanes (one per semitone), scale tones subtly highlighted.
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui, sans-serif';
  const inSeq = new Set(runner.patternSeq);
  for (let m = runner.laneMin; m <= runner.laneMax; m++) {
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
    let fill;
    if (note.judged) {
      fill = note.result === 'miss' ? c.err : note.result === 'perfect' ? c.ok : c.warn;
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
  const inSeqLbl = new Set(runner.patternSeq);
  for (let m = runner.laneMin; m <= runner.laneMax; m++) {
    const y = midiToY(m);
    const isTarget = inSeqLbl.has(m);
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
    const y = midiToY(last.midiFloat);
    ctx.fillStyle = last.inTune ? c.ok : c.warn;
    ctx.beginPath();
    ctx.arc(hitX, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.card;
    ctx.beginPath();
    ctx.arc(hitX, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Count-in cue before the first note reaches the line.
  if (playheadBeat < LEAD_IN_BEATS) {
    const remaining = Math.ceil(LEAD_IN_BEATS - playheadBeat);
    ctx.fillStyle = c.text;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'center';
    ctx.font = '600 42px system-ui, sans-serif';
    ctx.fillText(String(remaining), W / 2, H / 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
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
  // Optional melody guide tones at each upcoming note's start.
  if (runner.guide) {
    for (const note of runner.notes) {
      if (note.guideScheduled) continue;
      if (note.startBeat <= horizonBeat) {
        const t = runner.startAudioTime + note.startBeat * runner.secPerBeat;
        if (t > audioCtx.currentTime - 0.05) scheduleGuideTone(note.midi, t, note.dur);
        note.guideScheduled = true;
      }
    }
  }
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
  // changes); keep it alive so the timeline clock and mic analyser keep running.
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const playheadBeat = (audioCtx.currentTime - runner.startAudioTime) / runner.secPerBeat;

  ensureNotes(playheadBeat);
  scheduleAudio(playheadBeat);

  // Detect the current sung pitch.
  runner.analyser.getFloatTimeDomainData(runner.buf);
  const { freq } = runner.tracker.process(runner.buf);
  const hasPitch = freq > 0;
  const midiFloat = hasPitch ? freqToMidiFloat(freq) : null;

  // Score any note currently crossing the hit line.
  const target = currentTargetMidi(playheadBeat);
  let inTune = false;
  if (hasPitch && target != null) {
    const cents = centsOffFromTarget(freq, target);
    inTune = cents != null && Math.abs(cents) <= runner.toleranceCents;
  }
  for (const note of runner.notes) {
    if (note.judged) continue;
    const end = note.startBeat + note.dur;
    if (playheadBeat >= note.startBeat && playheadBeat < end) {
      note.samples += 1;
      if (hasPitch) {
        const cents = centsOffFromTarget(freq, note.midi);
        if (cents != null && Math.abs(cents) <= runner.toleranceCents) note.hitSamples += 1;
      }
    } else if (playheadBeat >= end) {
      finalizeNote(note);
    }
  }

  // Record the pitch trace and prune notes/trail that scrolled off-screen.
  runner.trail.push({ beat: playheadBeat, midiFloat: midiFloat ?? runner.laneMin, hasPitch, inTune });
  const leftBeats = (runner.cssW * HIT_X_RATIO) / pxPerBeat();
  const cutoff = playheadBeat - leftBeats - 1;
  while (runner.trail.length && runner.trail[0].beat < cutoff) runner.trail.shift();
  runner.notes = runner.notes.filter(n => n.startBeat + n.dur >= cutoff);

  draw(playheadBeat);
}

// ---- Lifecycle --------------------------------------------------------------

function buildConstraints() {
  const supported = (navigator.mediaDevices.getSupportedConstraints &&
    navigator.mediaDevices.getSupportedConstraints()) || {};
  const audio = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  if (supported.channelCount) audio.channelCount = 1;
  return Object.keys(audio).length ? { audio } : { audio: true };
}

function resetTimeline() {
  runner.secPerBeat = 60 / getContext().tempo;
  runner.startAudioTime = audioCtx.currentTime + 0.15;
  runner.seqIdx = 0;
  runner.nextBeat = LEAD_IN_BEATS;
  runner.nextClickBeat = 0;
  runner.notes = [];
  runner.trail = [];
  buildPatternSeq();
  ensureNotes(0);
}

async function startRunner() {
  // Only one mic-driven tool in the Pitch section runs at a time.
  if (tuner && tuner.running) stopTuner();
  if (pt && pt.running) stopPitchTrainer();

  ensureAudio();
  const diff = difficultyById(runner.difficulty);
  runner.toleranceCents = diff.toleranceCents;
  runner.hitThreshold = diff.hitThreshold;
  readColors();
  resizeCanvas();
  resetScore();
  resetTimeline();

  try {
    try {
      runner.stream = await requestMicStream(buildConstraints());
    } catch (constraintErr) {
      runner.stream = await requestMicStream({ audio: true });
    }
    runner.source = audioCtx.createMediaStreamSource(runner.stream);
    runner.analyser = audioCtx.createAnalyser();
    runner.analyser.fftSize = 4096;
    runner.analyser.smoothingTimeConstant = 0;
    runner.buf = new Float32Array(runner.analyser.fftSize);
    runner.tracker = createPitchTracker({ sampleRate: audioCtx.sampleRate, maxFreq: 1400, minRms: 0.006 });
    runner.source.connect(runner.analyser);

    runner.running = true;
    setToggleLabel(true);
    setOverlay('');
    const status = el('pr-status');
    if (status) status.textContent = 'Listening\u2026 sing the notes as they cross the line';
    // Timeline clock starts now that the mic is live.
    runner.startAudioTime = audioCtx.currentTime + 0.15;
    runner.nextClickBeat = 0;
    loop();
  } catch (e) {
    const status = el('pr-status');
    if (status) status.textContent = 'Mic access denied or unavailable';
    setOverlay('Mic unavailable');
  }
}

function stopRunner() {
  if (!runner.running && !runner.stream) {
    setToggleLabel(false);
    return;
  }
  runner.running = false;
  if (runner.rafId) { cancelAnimationFrame(runner.rafId); runner.rafId = null; }
  if (runner.tracker) runner.tracker.reset();
  if (runner.source) { try { runner.source.disconnect(); } catch (e) { /* noop */ } runner.source = null; }
  if (runner.stream) { releaseMicStream(runner.stream); runner.stream = null; }
  setToggleLabel(false);
  const status = el('pr-status');
  if (status) {
    status.textContent = runner.judged
      ? `Stopped \u2014 best combo ${runner.bestCombo}\u00D7, ${runner.judged ? Math.round((runner.hits / runner.judged) * 100) : 0}% accuracy`
      : 'Mic off';
  }
  setOverlay('Press start to play');
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
    const diff = difficultyById(runner.difficulty);
    runner.toleranceCents = diff.toleranceCents;
    runner.hitThreshold = diff.hitThreshold;
    resetScore();
    resetTimeline();
    runner.startAudioTime = audioCtx.currentTime + 0.15;
    runner.nextClickBeat = 0;
  } else {
    buildPatternSeq();
    if (runner.ctx2d) drawIdle();
  }
}

// ---- Controls / init --------------------------------------------------------

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
  runner.metronome = getSetting('pitchRunner.metronome', runner.metronome) !== false;
  runner.guide = getSetting('pitchRunner.guide', runner.guide) === true;
  if (!(runner.rangeLow >= 36 && runner.rangeLow <= 84)) runner.rangeLow = 48;
  if (!(runner.rangeHigh >= 36 && runner.rangeHigh <= 84)) runner.rangeHigh = 72;
  if (!NOTE_LENGTHS.includes(runner.noteBeats)) runner.noteBeats = 1;

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
      opt.textContent = `${d.label} \u00B7 \u00B1${d.toleranceCents}\u00A2`;
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
    const next = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, getContext().tempo + delta));
    setContext({ tempo: next }, 'pitchRunner');
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

  // Keep tempo label in sync when other tools change the shared context.
  subscribeContext(() => {
    syncTempoLabel();
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
  readColors();
  buildPatternSeq();
  resizeCanvas();
  updateHud();
  setOverlay('Press start to play');
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
  if (diffSel) diffSel.value = runner.difficulty;
  if (patternSel) patternSel.value = runner.pattern;
  if (presetSel) presetSel.value = matchPreset();
  if (lengthSel) lengthSel.value = String(runner.noteBeats);
  if (metroChk) metroChk.checked = runner.metronome;
  if (guideChk) guideChk.checked = runner.guide;
}

window.togglePitchRunner = togglePitchRunner;

export { initPitchRunner, stopRunner as stopPitchRunner, runner };
