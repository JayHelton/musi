import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { parseNote } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext } from './musicalContext.js';
import { createPitchTracker } from './pitch.js';
import { createPitchMatcher, midiToLabel } from './pitchMatch.js';
import { buildStages, chooseRootMidi } from './pitchExercises.js';
import { stopTuner, tuner } from './vocalTrainer.js';

// "Pitch trainer" — a guided, mic-driven sing-the-note drill that lives in the
// Pitch section alongside the tuner. It cycles through interval, scale, and
// arpeggio exercises rooted on the shared musical context's key, transposed
// into the singer's configured vocal range. The actual pitch-matching (how
// close / how long held) is delegated to the reusable engine in pitchMatch.js
// so the same machinery can power future sing-along features.

// Challenge presets. Every level keeps the hold time at a full second or more
// so a note must be *sustained* in tune before it counts, and the tolerance
// stays forgiving on the easier levels so the drill is not hair-trigger.
const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   holdMs: 1000, toleranceCents: 40 },
  { id: 'medium', label: 'Medium', holdMs: 1500, toleranceCents: 28 },
  { id: 'hard',   label: 'Hard',   holdMs: 2000, toleranceCents: 18 },
  { id: 'expert', label: 'Expert', holdMs: 2500, toleranceCents: 12 },
];

// Half-range (in cents) the vertical meter spans above/below the target.
const WINDOW_CENTS = 200;

// Selectable vocal-range bounds (MIDI). Covers low bass to high soprano.
const RANGE_MIN_MIDI = 36; // C2
const RANGE_MAX_MIDI = 84; // C6

const RANGE_PRESETS = [
  { id: 'custom',    label: 'Custom' },
  { id: 'bass',      label: 'Bass',      low: 40, high: 64 },
  { id: 'baritone',  label: 'Baritone',  low: 43, high: 67 },
  { id: 'tenor',     label: 'Tenor',     low: 48, high: 72 },
  { id: 'alto',      label: 'Alto',      low: 53, high: 77 },
  { id: 'soprano',   label: 'Soprano',   low: 60, high: 84 },
];

const GUIDE_DRONE_LAYERS = [
  { type: 'sine',     detune: 0,  level: 0.5 },
  { type: 'triangle', detune: -5, level: 0.32 },
  { type: 'sawtooth', detune: 7,  level: 0.18 },
];

const pt = {
  running: false,
  initialized: false,
  stream: null,
  analyser: null,
  buf: null,
  rafId: null,
  tracker: null,
  matcher: null,

  difficulty: 'easy',
  rangeLow: 48,
  rangeHigh: 72,
  guide: true,

  stages: [],
  stageIdx: 0,
  sequence: [],   // resolved target MIDIs for the current stage
  noteIdx: 0,
  advancing: false,
  completed: 0,   // notes passed this session

  voices: [],
  advanceTimer: null,
  replayActive: false,
};

function el(id) { return document.getElementById(id); }

function difficultyById(id) {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[0];
}

// ---- Reference / guide tone -------------------------------------------------

function clearAdvanceTimer() {
  if (pt.advanceTimer) {
    clearTimeout(pt.advanceTimer);
    pt.advanceTimer = null;
  }
}

function setReplayButtonActive(active) {
  pt.replayActive = active;
  const btn = el('pt-replay');
  if (!btn) return;
  btn.classList.toggle('playing', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.textContent = active ? 'Release to stop' : 'Hold note';
}

function cleanupVoice(voice) {
  pt.voices = pt.voices.filter(v => v !== voice);
}

function releaseVoice(voice, release = 0.14) {
  if (!voice || voice.releasing) return;
  voice.releasing = true;
  if (voice.releaseTimer) {
    clearTimeout(voice.releaseTimer);
    voice.releaseTimer = null;
  }

  try {
    const t = audioCtx.currentTime;
    const level = Math.max(voice.gain.gain.value || 0.001, 0.001);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(level, t);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, t + release);
    voice.sources.forEach(src => { try { src.stop(t + release + 0.03); } catch (e) {} });
  } catch (e) {
    voice.sources.forEach(src => { try { src.stop(); } catch (err) {} });
    cleanupVoice(voice);
  }
}

function stopGuideTone(release = 0.08) {
  pt.voices.slice().forEach(v => releaseVoice(v, release));
  setReplayButtonActive(false);
}

function startGuideTone(midi) {
  ensureAudio();
  const freq = midiFreq(midi);
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(Math.max(freq * 8, 2200), 7200);
  filter.Q.value = 0.35;

  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
  gain.gain.linearRampToValueAtTime(0.14, t + 0.2);

  const sources = GUIDE_DRONE_LAYERS.map(layer => {
    const osc = audioCtx.createOscillator();
    const layerGain = audioCtx.createGain();
    osc.type = layer.type;
    osc.frequency.value = freq;
    osc.detune.value = layer.detune;
    layerGain.gain.value = layer.level;
    osc.connect(layerGain);
    layerGain.connect(filter);
    return osc;
  });
  filter.connect(gain);
  gain.connect(getAnalyserDestination());

  const voice = { sources, gain, releaseTimer: null, releasing: false };
  sources.forEach(src => src.start(t));
  pt.voices.push(voice);
  sources[0].onended = () => cleanupVoice(voice);
  return voice;
}

// Play a short, soft reference tone for automatic guide cues.
function playTone(midi, duration = 1.1) {
  stopGuideTone();
  const voice = startGuideTone(midi);
  const sustain = duration * 0.55;
  const release = duration * 0.4;
  voice.releaseTimer = setTimeout(() => releaseVoice(voice, release), sustain * 1000);
}

function ptStartReplay() {
  if (pt.replayActive) return;
  const midi = currentTargetMidi();
  if (midi == null) return;
  stopGuideTone(0.05);
  startGuideTone(midi);
  setReplayButtonActive(true);
}

function ptStopReplay() {
  if (!pt.replayActive) return;
  stopGuideTone(0.14);
}

// ---- Exercise sequencing ----------------------------------------------------

function currentStage() {
  if (!pt.stages.length) pt.stages = buildStages();
  return pt.stages[pt.stageIdx % pt.stages.length];
}

// Resolve the active stage's semitone offsets into concrete MIDI targets placed
// in the singer's range, rooted on the shared context key.
function buildSequence() {
  const stage = currentStage();
  const { root } = getContext();
  const parsed = parseNote(root);
  const rootPc = parsed ? parsed.semi : 0;
  const span = stage.offsets.reduce((m, o) => Math.max(m, o), 0);
  const lo = Math.min(pt.rangeLow, pt.rangeHigh);
  const hi = Math.max(pt.rangeLow, pt.rangeHigh);
  const rootMidi = chooseRootMidi(rootPc, lo, hi, span);
  pt.sequence = stage.offsets.map(off => rootMidi + off);
  pt.noteIdx = 0;
}

function currentTargetMidi() {
  return pt.sequence[pt.noteIdx];
}

function stageLabel() {
  const stage = currentStage();
  const { root } = getContext();
  return `${root} · ${stage.label}`;
}

function updatePrompt() {
  const stageEl = el('pt-stage');
  const promptEl = el('pt-prompt');
  if (stageEl) {
    stageEl.innerHTML = `<span class="pt-stage-name">${stageLabel()}</span>`;
  }
  if (promptEl) {
    const target = currentTargetMidi();
    const lbl = target != null ? midiToLabel(target).full : '--';
    const pos = pt.sequence.length ? `${pt.noteIdx + 1} of ${pt.sequence.length}` : '';
    promptEl.innerHTML = `${lbl}<span class="pt-prompt-sub">Sing &amp; hold this note · ${pos}</span>`;
  }
  renderScaleLabels();
  resizeZone();
}

// Draw the cent grid labels in the left gutter (sharp at top, target in the
// middle, flat at the bottom).
function renderScaleLabels() {
  const scale = el('pt-scale');
  if (!scale) return;
  const target = currentTargetMidi();
  const name = target != null ? midiToLabel(target).full : '--';
  scale.innerHTML =
    `<div class="pt-scale-label" style="top:6%">+${WINDOW_CENTS}\u00A2</div>` +
    `<div class="pt-scale-label" style="top:50%">${name}</div>` +
    `<div class="pt-scale-label" style="top:94%">-${WINDOW_CENTS}\u00A2</div>`;
}

// Size the in-tune band to the current tolerance so the visual target zone
// matches what actually counts as a pass.
function resizeZone() {
  const zone = el('pt-zone');
  if (!zone || !pt.matcher) return;
  const pct = Math.min(100, (pt.matcher.toleranceCents / WINDOW_CENTS) * 100);
  zone.style.height = pct + '%';
}

function setTarget() {
  const midi = currentTargetMidi();
  if (pt.matcher) pt.matcher.setTarget(midi);
  updatePrompt();
  if (pt.guide && midi != null) playTone(midi);
}

function advance() {
  pt.advancing = false;
  pt.noteIdx += 1;
  if (pt.noteIdx >= pt.sequence.length) {
    pt.stageIdx = (pt.stageIdx + 1) % pt.stages.length;
    buildSequence();
  }
  setTarget();
}

function onMatched() {
  if (pt.advancing) return;
  pt.advancing = true;
  pt.completed += 1;
  const status = el('pt-status');
  if (status) status.textContent = `Nice! ${midiToLabel(currentTargetMidi()).full} held. (${pt.completed} passed)`;
  const puck = el('pt-puck');
  if (puck) { puck.classList.remove('off', 'close'); puck.classList.add('in'); }
  // Brief pause so the success state is visible before moving on.
  clearAdvanceTimer();
  pt.advanceTimer = setTimeout(() => { if (pt.running) advance(); }, 650);
}

// ---- Meter rendering --------------------------------------------------------

function renderMeter(res, info) {
  const puck = el('pt-puck');
  const progress = el('pt-progress');
  const noteEl = el('pt-note');
  const centsEl = el('pt-cents');
  if (!puck) return;

  if (!res.active || res.freq <= 0 || res.centsOff == null) {
    puck.style.top = '50%';
    puck.className = 'pt-puck off';
    puck.textContent = '--';
    if (progress) progress.style.height = (res.progress * 100) + '%';
    if (noteEl) noteEl.textContent = '--';
    if (centsEl) { centsEl.textContent = '-- \u00A2'; centsEl.className = 'pt-readout-cents off'; }
    return;
  }

  puck.style.top = (res.offsetRatio * 100) + '%';
  const absC = Math.abs(res.centsOff);
  const cls = res.within ? 'in' : absC <= pt.matcher.toleranceCents * 2 ? 'close' : 'off';
  puck.className = 'pt-puck ' + cls;
  puck.textContent = info ? info.name : '\u266a';

  if (progress) progress.style.height = (res.progress * 100) + '%';
  if (noteEl) noteEl.textContent = info ? info.name + info.oct : '--';
  if (centsEl) {
    const sign = res.centsOff >= 0 ? '+' : '';
    centsEl.textContent = `${sign}${Math.round(res.centsOff)} \u00A2`;
    centsEl.className = 'pt-readout-cents ' + cls;
  }
}

// ---- Mic loop ---------------------------------------------------------------

function loop() {
  if (!pt.running) return;
  pt.analyser.getFloatTimeDomainData(pt.buf);
  const { info, freq } = pt.tracker.process(pt.buf);
  const res = pt.matcher.update(freq > 0 ? freq : -1, performance.now());

  renderMeter(res, info);
  if (res.matched && !pt.advancing) onMatched();

  pt.rafId = requestAnimationFrame(loop);
}

function buildConstraints() {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  };
}

async function startPitchTrainer() {
  // Only one mic-driven tool in the Pitch section runs at a time.
  if (tuner && tuner.running) stopTuner();

  ensureAudio();
  pt.difficulty = getSetting('pitchTrainer.difficulty', pt.difficulty, DIFFICULTIES.map(d => d.id));
  const diff = difficultyById(pt.difficulty);
  pt.matcher = createPitchMatcher({
    holdMs: diff.holdMs,
    toleranceCents: diff.toleranceCents,
    windowCents: WINDOW_CENTS,
  });
  pt.stages = buildStages();
  pt.stageIdx = 0;
  pt.completed = 0;
  buildSequence();

  try {
    try {
      pt.stream = await requestMicStream(buildConstraints());
    } catch (constraintErr) {
      pt.stream = await requestMicStream({ audio: true });
    }
    const source = audioCtx.createMediaStreamSource(pt.stream);
    pt.analyser = audioCtx.createAnalyser();
    pt.analyser.fftSize = 4096;
    pt.analyser.smoothingTimeConstant = 0;
    pt.buf = new Float32Array(pt.analyser.fftSize);
    pt.tracker = createPitchTracker({ sampleRate: audioCtx.sampleRate, maxFreq: 1400 });
    source.connect(pt.analyser);

    pt.running = true;
    setToggleLabel(true);
    const status = el('pt-status');
    if (status) status.textContent = 'Listening… sing the highlighted note';
    setTarget();
    loop();
  } catch (e) {
    const status = el('pt-status');
    if (status) status.textContent = 'Mic access denied or unavailable';
  }
}

function stopPitchTrainer() {
  if (!pt.running && !pt.stream) {
    setToggleLabel(false);
    return;
  }
  pt.running = false;
  pt.advancing = false;
  clearAdvanceTimer();
  if (pt.rafId) { cancelAnimationFrame(pt.rafId); pt.rafId = null; }
  if (pt.tracker) pt.tracker.reset();
  if (pt.matcher) pt.matcher.reset();
  if (pt.stream) { releaseMicStream(pt.stream); pt.stream = null; }
  stopGuideTone();
  setToggleLabel(false);
  const status = el('pt-status');
  if (status) status.textContent = 'Mic off';
  const puck = el('pt-puck');
  if (puck) { puck.className = 'pt-puck off'; puck.style.top = '50%'; puck.textContent = '--'; }
  const progress = el('pt-progress');
  if (progress) progress.style.height = '0%';
}

function setToggleLabel(on) {
  const btn = el('pt-toggle');
  if (btn) btn.textContent = on ? 'Stop training' : 'Start training';
}

function togglePitchTrainer() {
  if (pt.running) stopPitchTrainer(); else startPitchTrainer();
}

function ptSkip() {
  if (!pt.running) return;
  clearAdvanceTimer();
  stopGuideTone();
  pt.advancing = false;
  advance();
  const status = el('pt-status');
  if (status) status.textContent = 'Skipped — next note';
}

function ptReplay() {
  const midi = currentTargetMidi();
  if (midi != null) playTone(midi);
}

function wireReplayButton() {
  const btn = el('pt-replay');
  if (!btn || btn.dataset.holdWired) return;
  btn.dataset.holdWired = '1';
  btn.onclick = null;
  setReplayButtonActive(false);

  const begin = (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    ptStartReplay();
  };
  const end = (e) => {
    e.preventDefault();
    if (btn.hasPointerCapture?.(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    ptStopReplay();
  };

  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('lostpointercapture', ptStopReplay);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  btn.addEventListener('click', e => e.preventDefault());
  btn.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) ptStartReplay();
  });
  btn.addEventListener('keyup', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    ptStopReplay();
  });
  btn.addEventListener('blur', ptStopReplay);
}

// ---- Controls / init --------------------------------------------------------

function fillNoteSelect(select, selected) {
  if (!select) return;
  select.innerHTML = '';
  for (let m = RANGE_MIN_MIDI; m <= RANGE_MAX_MIDI; m++) {
    const lbl = midiToLabel(m);
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = lbl.full;
    select.appendChild(opt);
  }
  select.value = String(selected);
}

function matchPreset() {
  const found = RANGE_PRESETS.find(p => p.low === pt.rangeLow && p.high === pt.rangeHigh);
  return found ? found.id : 'custom';
}

function syncRangeUI() {
  const lowSel = el('pt-range-low');
  const highSel = el('pt-range-high');
  const presetSel = el('pt-range-preset');
  if (lowSel) lowSel.value = String(pt.rangeLow);
  if (highSel) highSel.value = String(pt.rangeHigh);
  if (presetSel) presetSel.value = matchPreset();
}

function rebuildIfRunning() {
  if (pt.running) {
    buildSequence();
    setTarget();
  }
}

function initPitchTrainer() {
  // Load persisted config every time the section opens.
  pt.difficulty = getSetting('pitchTrainer.difficulty', pt.difficulty, DIFFICULTIES.map(d => d.id));
  pt.rangeLow = Number(getSetting('pitchTrainer.rangeLow', pt.rangeLow));
  pt.rangeHigh = Number(getSetting('pitchTrainer.rangeHigh', pt.rangeHigh));
  pt.guide = getSetting('pitchTrainer.guide', pt.guide) !== false;
  if (!(pt.rangeLow >= RANGE_MIN_MIDI && pt.rangeLow <= RANGE_MAX_MIDI)) pt.rangeLow = 48;
  if (!(pt.rangeHigh >= RANGE_MIN_MIDI && pt.rangeHigh <= RANGE_MAX_MIDI)) pt.rangeHigh = 72;

  if (pt.initialized) {
    syncRangeUI();
    setReplayButtonActive(false);
    return;
  }
  pt.initialized = true;
  wireReplayButton();

  const diffSel = el('pt-difficulty');
  if (diffSel) {
    diffSel.innerHTML = '';
    DIFFICULTIES.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.label} · hold ${(d.holdMs / 1000).toFixed(d.holdMs % 1000 ? 1 : 0)}s, \u00B1${d.toleranceCents}\u00A2`;
      diffSel.appendChild(opt);
    });
    diffSel.value = pt.difficulty;
    diffSel.onchange = () => {
      pt.difficulty = diffSel.value;
      saveSetting('pitchTrainer.difficulty', pt.difficulty);
      const diff = difficultyById(pt.difficulty);
      if (pt.matcher) {
        // Rebuild the matcher so the new hold/tolerance take effect immediately.
        pt.matcher = createPitchMatcher({ holdMs: diff.holdMs, toleranceCents: diff.toleranceCents, windowCents: WINDOW_CENTS });
        if (pt.running) setTarget();
      }
    };
  }

  const lowSel = el('pt-range-low');
  const highSel = el('pt-range-high');
  const presetSel = el('pt-range-preset');

  fillNoteSelect(lowSel, pt.rangeLow);
  fillNoteSelect(highSel, pt.rangeHigh);

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
      if (preset && preset.low != null) {
        pt.rangeLow = preset.low;
        pt.rangeHigh = preset.high;
        saveSetting('pitchTrainer.rangeLow', pt.rangeLow);
        saveSetting('pitchTrainer.rangeHigh', pt.rangeHigh);
        syncRangeUI();
        rebuildIfRunning();
      }
    };
  }

  if (lowSel) {
    lowSel.onchange = () => {
      pt.rangeLow = Number(lowSel.value);
      saveSetting('pitchTrainer.rangeLow', pt.rangeLow);
      if (presetSel) presetSel.value = matchPreset();
      rebuildIfRunning();
    };
  }
  if (highSel) {
    highSel.onchange = () => {
      pt.rangeHigh = Number(highSel.value);
      saveSetting('pitchTrainer.rangeHigh', pt.rangeHigh);
      if (presetSel) presetSel.value = matchPreset();
      rebuildIfRunning();
    };
  }

  const guideChk = el('pt-guide');
  if (guideChk) {
    guideChk.checked = pt.guide;
    guideChk.onchange = () => {
      pt.guide = guideChk.checked;
      saveSetting('pitchTrainer.guide', pt.guide);
    };
  }

  // Keep the prompt/key in sync if the shared context key changes mid-drill.
  subscribeContext(() => {
    if (pt.running) { buildSequence(); setTarget(); }
    else { const stageEl = el('pt-stage'); if (stageEl && pt.stages.length) stageEl.innerHTML = `<span class="pt-stage-name">${stageLabel()}</span>`; }
  });

  if (!pt.stages.length) pt.stages = buildStages();
  const stageEl = el('pt-stage');
  if (stageEl) stageEl.innerHTML = `<span class="pt-stage-name">${stageLabel()}</span>`;
}

window.togglePitchTrainer = togglePitchTrainer;
window.ptSkip = ptSkip;
window.ptReplay = ptReplay;

export { initPitchTrainer, stopPitchTrainer, pt };
