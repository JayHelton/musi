import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination, requestMicStream, releaseMicStream } from './audio.js';
import { parseNote } from './theory.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext } from './musicalContext.js';
import { createPitchTracker } from './pitch.js';
import { createPitchMatcher, midiToLabel } from './pitchMatch.js';
import {
  buildStages,
  SCALE_PATTERNS,
  buildSequenceForTask,
  chromaticMidisInRange,
  pickNextCenterMidi,
  INTERVAL_SEMITONES,
} from './pitchExercises.js';
import {
  HOLD_DURATIONS_MS,
  DEFAULT_HOLD_MS,
  DEFAULT_PROFILE_ID,
  correctionText,
  NO_STABLE_FUNDAMENTAL,
} from './pitchMetrics.js';
import { stopTuner, tuner } from './vocalTrainer.js';
import { runner, stopPitchRunner } from './pitchRunner.js';

const WINDOW_CENTS = 50;
const DISPLAY_SMOOTH_MS = 120;
const ADVANCE_DELAY_MS = 800;

const RANGE_MIN_MIDI = 36;
const RANGE_MAX_MIDI = 84;

const RANGE_PRESETS = [
  { id: 'custom', label: 'Custom' },
  { id: 'bass', label: 'Bass', low: 40, high: 64 },
  { id: 'baritone', label: 'Baritone', low: 43, high: 67 },
  { id: 'tenor', label: 'Tenor', low: 48, high: 72 },
  { id: 'alto', label: 'Alto', low: 53, high: 77 },
  { id: 'soprano', label: 'Soprano', low: 60, high: 84 },
];

const DEFAULT_CUSTOM_PRESETS = [
  { id: 'chest', label: 'Chest', low: 41, high: 62 },
  { id: 'mix', label: 'Mix', low: 64, high: 71 },
  { id: 'head', label: 'Head', low: 67, high: 76 },
];

const TASKS = [
  { id: 'center', label: 'Center' },
  { id: 'land', label: 'Land' },
  { id: 'interval', label: 'Interval' },
  { id: 'pattern', label: 'Pattern' },
];

const PROFILE_OPTIONS = [
  { id: 'learn', label: 'Learn' },
  { id: 'center', label: 'Center' },
  { id: 'precision', label: 'Precision' },
];

const STYLE_OPTIONS = [
  { id: 'straight', label: 'Straight Tone' },
  { id: 'vibrato', label: 'Vibrato' },
];

const FEEDBACK_MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'live', label: 'Live' },
  { id: 'reduced', label: 'Reduced' },
  { id: 'result', label: 'Result only' },
];

const INTERVAL_OPTIONS = Object.keys(INTERVAL_SEMITONES);

const GUIDE_DRONE_LAYERS = [
  { type: 'sine', detune: 0, level: 0.5 },
  { type: 'triangle', detune: 0, level: 0.32 },
];

const pt = {
  running: false,
  initialized: false,
  stream: null,
  source: null,
  analyser: null,
  buf: null,
  rafId: null,
  tracker: null,
  matcher: null,

  profile: DEFAULT_PROFILE_ID,
  holdMs: DEFAULT_HOLD_MS,
  task: 'center',
  style: 'straight',
  feedbackMode: 'auto',
  feedbackEffective: 'live',
  intervalId: 'M2',
  intervalDirection: 'ascending',

  pattern: 'five-tone',
  rangeLow: 48,
  rangeHigh: 72,
  guide: true,
  customPresets: [],

  stages: [],
  stageIdx: 0,
  sequence: [],
  pool: [],
  noteIdx: 0,
  anchorMidi: null,
  advancing: false,
  completed: 0,
  sequenceError: null,

  noteStats: {},
  noteConsecutivePasses: 0,
  attemptSnapshots: [],

  voices: [],
  advanceTimer: null,
  replayActive: false,
  guideEndsAt: 0,
  puckRatio: 0.5,
  lastFrameMs: 0,
  lastTargetMidi: null,
  failHandled: false,
};

function el(id) { return document.getElementById(id); }

function nearestHold(ms) {
  let best = HOLD_DURATIONS_MS[0];
  let bestDist = Math.abs(ms - best);
  for (const h of HOLD_DURATIONS_MS) {
    const d = Math.abs(ms - h);
    if (d < bestDist) { best = h; bestDist = d; }
  }
  return best;
}

function migrateFromLegacyDifficulty(oldId) {
  if (oldId === 'quick' || oldId === 'easy') {
    return { profile: 'learn', holdMs: nearestHold(oldId === 'quick' ? 500 : 1000) };
  }
  if (oldId === 'medium') return { profile: 'center', holdMs: 1500 };
  if (oldId === 'hard' || oldId === 'expert') {
    return { profile: 'precision', holdMs: nearestHold(oldId === 'hard' ? 2000 : 2500) };
  }
  return { profile: DEFAULT_PROFILE_ID, holdMs: DEFAULT_HOLD_MS };
}

function loadCustomPresets() {
  const saved = getSetting('pitchTrainer.customPresets', null);
  if (Array.isArray(saved) && saved.length) {
    pt.customPresets = saved;
  } else {
    pt.customPresets = DEFAULT_CUSTOM_PRESETS.map(p => ({ ...p }));
    saveSetting('pitchTrainer.customPresets', pt.customPresets);
  }
}

function allRangePresets() {
  return [
    ...RANGE_PRESETS,
    ...pt.customPresets.map(p => ({
      id: `custom-${p.id}`,
      label: `${p.label} (${midiToLabel(p.low).full}–${midiToLabel(p.high).full})`,
      low: p.low,
      high: p.high,
      custom: true,
    })),
  ];
}

function matchPreset() {
  const presets = allRangePresets();
  const found = presets.find(p => p.low === pt.rangeLow && p.high === pt.rangeHigh);
  return found ? found.id : 'custom';
}

function effectiveFeedbackMode() {
  if (pt.feedbackMode !== 'auto') return pt.feedbackMode;
  if (pt.noteConsecutivePasses >= 2) return 'result';
  if (pt.noteConsecutivePasses >= 1) return 'reduced';
  return 'live';
}

function applyFeedbackVisibility() {
  const mode = effectiveFeedbackMode();
  pt.feedbackEffective = mode;
  const meter = el('pt-meter');
  const readout = el('pt-readout');
  const overflow = el('pt-overflow');
  if (meter) {
    meter.classList.toggle('pt-feedback-reduced', mode === 'reduced');
    meter.classList.toggle('pt-feedback-result', mode === 'result');
  }
  if (readout) readout.classList.toggle('pt-feedback-reduced', mode === 'reduced' || mode === 'result');
  if (overflow) overflow.classList.toggle('hidden', mode === 'result');
}

function resetNoteFeedback() {
  pt.noteConsecutivePasses = 0;
  applyFeedbackVisibility();
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
  gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
  gain.gain.linearRampToValueAtTime(0.09, t + 0.18);

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

function playTone(midi, duration = 0.7) {
  stopGuideTone();
  if (pt.matcher) pt.matcher.markGuideTone();
  const voice = startGuideTone(midi);
  const sustain = duration * 0.5;
  const release = duration * 0.35;
  const muteMs = (sustain + release) * 1000 + 280;
  pt.guideEndsAt = performance.now() + muteMs;
  voice.releaseTimer = setTimeout(() => releaseVoice(voice, release), sustain * 1000);
}

function ptStartReplay() {
  if (pt.replayActive) return;
  const midi = guideMidi();
  if (midi == null) return;
  stopGuideTone(0.05);
  if (pt.matcher) pt.matcher.markGuideTone();
  startGuideTone(midi);
  pt.guideEndsAt = Infinity;
  setReplayButtonActive(true);
}

function ptStopReplay() {
  if (!pt.replayActive) return;
  stopGuideTone(0.14);
  pt.guideEndsAt = performance.now() + 350;
}

function guideMidi() {
  if (pt.task === 'interval') return pt.anchorMidi;
  return currentTargetMidi();
}

// ---- Exercise sequencing ----------------------------------------------------

function currentStage() {
  if (!pt.stages.length) {
    const { scale } = getContext();
    pt.stages = buildStages(scale, pt.pattern);
  }
  return pt.stages[pt.stageIdx % pt.stages.length];
}

function buildSequence() {
  const { root, scale } = getContext();
  pt.stages = buildStages(scale, pt.pattern);
  pt.stageIdx = 0;

  const lo = Math.min(pt.rangeLow, pt.rangeHigh);
  const hi = Math.max(pt.rangeLow, pt.rangeHigh);

  if (pt.task === 'center' || pt.task === 'land') {
    pt.pool = chromaticMidisInRange(lo, hi);
    pt.sequence = [...pt.pool];
    pt.sequenceError = pt.pool.length ? null : 'The selected range has no notes.';
    pt.noteIdx = 0;
    pickAdaptiveTarget();
    return;
  }

  if (pt.task === 'interval') {
    const built = buildSequenceForTask({
      task: 'interval',
      low: lo,
      high: hi,
      intervalSemitones: pt.intervalId,
      intervalDirection: pt.intervalDirection,
    });
    pt.sequenceError = built.ok ? null : built.error;
    pt.anchorMidi = built.anchorMidi ?? null;
    pt.sequence = built.ok ? built.midis : [];
    pt.noteIdx = 0;
    if (built.ok) pickAdaptiveTarget();
    return;
  }

  const built = buildSequenceForTask({
    task: 'pattern',
    patternId: pt.pattern,
    scaleName: scale,
    rootName: root,
    low: lo,
    high: hi,
  });
  pt.sequenceError = built.ok ? null : built.error;
  pt.sequence = built.ok ? built.midis : [];
  pt.anchorMidi = null;
  pt.noteIdx = 0;
}

function pickAdaptiveTarget() {
  const lo = Math.min(pt.rangeLow, pt.rangeHigh);
  const hi = Math.max(pt.rangeLow, pt.rangeHigh);
  const pool = pt.pool.length ? pt.pool : chromaticMidisInRange(lo, hi);

  if (pt.task === 'interval' && pt.sequence.length) {
    const candidates = [];
    for (let anchor = lo; anchor <= hi; anchor++) {
      const semis = INTERVAL_SEMITONES[pt.intervalId] ?? 2;
      const delta = pt.intervalDirection === 'descending' ? -semis : semis;
      const target = anchor + delta;
      if (target >= lo && target <= hi) candidates.push(target);
    }
    if (!candidates.length) return;
    const semis = INTERVAL_SEMITONES[pt.intervalId] ?? 2;
    const delta = pt.intervalDirection === 'descending' ? -semis : semis;
    const target = pickNextCenterMidi(candidates, pt.noteStats);
    pt.anchorMidi = target - delta;
    pt.sequence = [target];
    pt.noteIdx = 0;
    return;
  }

  if ((pt.task === 'center' || pt.task === 'land') && pool.length) {
    const target = pickNextCenterMidi(pool, pt.noteStats);
    pt.sequence = [target];
    pt.noteIdx = 0;
  }
}

function currentTargetMidi() {
  return pt.sequence[pt.noteIdx];
}

function stageLabel() {
  if (pt.task === 'center') return 'Center · chromatic range';
  if (pt.task === 'land') return 'Land · chromatic range';
  if (pt.task === 'interval') {
    return `Interval · ${pt.intervalId} ${pt.intervalDirection}`;
  }
  const stage = currentStage();
  const { root } = getContext();
  const hint = stage.hint ? ` · ${stage.hint}` : '';
  return `${root} · ${stage.label}${hint}`;
}

function intervalLabel() {
  const dir = pt.intervalDirection === 'descending' ? 'down' : 'up';
  return `${pt.intervalId} ${dir}`;
}

function updatePrompt() {
  const stageEl = el('pt-stage');
  const promptEl = el('pt-prompt');
  if (stageEl) {
    stageEl.innerHTML = `<span class="pt-stage-name">${stageLabel()}</span>`;
  }
  if (promptEl) {
    const target = currentTargetMidi();
    let heading = '--';
    let sub = '';
    if (pt.task === 'interval') {
      heading = intervalLabel();
      sub = 'Sing the interval';
    } else if (target != null) {
      heading = midiToLabel(target).full;
      if (pt.task === 'land') {
        sub = 'Land on this note';
      } else {
        const pos = pt.sequence.length > 1 ? `${pt.noteIdx + 1} of ${pt.sequence.length}` : '';
        sub = `Sing &amp; hold this note${pos ? ` · ${pos}` : ''}`;
      }
    }
    promptEl.innerHTML = `${heading}<span class="pt-prompt-sub">${sub}</span>`;
  }
  renderScaleLabels();
  resizeZones();
  updateStartState();
}

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

function resizeZones() {
  const passZone = el('pt-zone-pass');
  if (!passZone || !pt.matcher) return;
  const centerCents = pt.matcher.profile?.centerCents ?? 10;
  const passPct = Math.min(100, (centerCents / WINDOW_CENTS) * 100);
  passZone.style.height = passPct + '%';
}

function setStartDisabled(disabled, message) {
  const btn = el('pt-toggle');
  const status = el('pt-status');
  if (btn) btn.disabled = !!disabled;
  if (status && message) status.textContent = message;
}

function updateStartState() {
  const err = pt.sequenceError;
  if (err) {
    setStartDisabled(true, err);
  } else if (!pt.running) {
    setStartDisabled(false, 'Mic off');
  } else {
    setStartDisabled(false);
  }
}

function rebuildMatcher() {
  pt.matcher = createPitchMatcher({
    profileId: pt.profile,
    holdMs: pt.holdMs,
    style: pt.style,
    windowCents: WINDOW_CENTS,
  });
  resizeZones();
}

function setTarget() {
  const midi = currentTargetMidi();
  pt.attemptSnapshots = [];
  pt.failHandled = false;
  if (midi !== pt.lastTargetMidi) {
    const s = pt.noteStats[midi];
    if (!s || s.consecutivePasses < 2) resetNoteFeedback();
    pt.lastTargetMidi = midi;
  }
  if (pt.matcher) pt.matcher.setTarget(midi);
  updatePrompt();
  const resultEl = el('pt-result');
  if (resultEl) resultEl.hidden = true;
  if (pt.guide && midi != null) {
    const guide = guideMidi();
    if (guide != null) playTone(guide);
  }
}

function advance() {
  pt.advancing = false;
  if (pt.task === 'center' || pt.task === 'land' || pt.task === 'interval') {
    pickAdaptiveTarget();
    setTarget();
    return;
  }
  pt.noteIdx += 1;
  if (pt.noteIdx >= pt.sequence.length) {
    pt.stageIdx = (pt.stageIdx + 1) % pt.stages.length;
    buildSequence();
  }
  setTarget();
}

function recordNoteResult(midi, result) {
  if (midi == null || !result) return;
  const s = pt.noteStats[midi] || { attempts: 0, fails: 0, lastErrorAbs: 0, consecutivePasses: 0 };
  s.attempts += 1;
  if (result.passed) {
    s.consecutivePasses += 1;
    s.lastErrorAbs = result.centerErrorCents != null ? Math.abs(result.centerErrorCents) : 0;
  } else {
    s.fails += 1;
    s.consecutivePasses = 0;
    s.lastErrorAbs = result.centerErrorCents != null ? Math.abs(result.centerErrorCents) : 30;
  }
  pt.noteStats[midi] = s;
}

function formatCenterLine(cents) {
  if (cents == null || !Number.isFinite(cents)) return `Center: ${NO_STABLE_FUNDAMENTAL}`;
  const dir = cents > 0 ? 'sharp' : cents < 0 ? 'flat' : 'centered';
  const abs = Math.round(Math.abs(cents));
  if (dir === 'centered') return 'Center: centered';
  return `Center: ${abs}\u00A2 ${dir}`;
}

function analyzeLandEntry(snapshots) {
  const voiced = snapshots.filter(s => s.voiced && s.centsOff != null);
  if (!voiced.length) {
    return {
      initialDirection: NO_STABLE_FUNDAMENTAL,
      scoopOrOvershoot: '—',
    };
  }
  const first = voiced[0].centsOff;
  let initialDirection = 'Centered';
  if (first > 2) initialDirection = 'Sharp';
  else if (first < -2) initialDirection = 'Flat';

  let scoop = false;
  let overshoot = false;
  let crossed = false;
  for (const s of voiced) {
    const c = s.centsOff;
    if (first < -2 && c >= 0) scoop = true;
    if (!crossed && ((first < 0 && c > 0) || (first > 0 && c < 0))) crossed = true;
    if (crossed && ((first < 0 && c > Math.abs(first)) || (first > 0 && c < -Math.abs(first)))) {
      overshoot = true;
    }
  }
  let scoopOrOvershoot = '—';
  if (overshoot) scoopOrOvershoot = 'Overshoot';
  else if (scoop) scoopOrOvershoot = 'Scoop';

  return { initialDirection, scoopOrOvershoot };
}

function showResultPanel(result) {
  const panel = el('pt-result');
  if (!panel) return;

  const unpitched = !result || result.failureReason === NO_STABLE_FUNDAMENTAL
    || result.centerErrorCents == null;
  const correction = unpitched ? NO_STABLE_FUNDAMENTAL : (result.passed ? 'Passed' : correctionText(result));
  const centerLine = unpitched ? `Center: ${NO_STABLE_FUNDAMENTAL}` : formatCenterLine(result.centerErrorCents);
  const stability = result?.stabilityCents != null ? `Stability: \u00B1${Math.round(result.stabilityCents)}\u00A2` : 'Stability: —';
  const settled = result?.settleTimeMs != null ? `Settled: ${Math.round(result.settleTimeMs)} ms` : 'Settled: —';

  let html = `${centerLine}<br>${stability}<br>${settled}<br>Result: ${correction}`;

  if (pt.task === 'land' && result) {
    const land = analyzeLandEntry(pt.attemptSnapshots);
    html += `<br>Initial direction: ${land.initialDirection}`;
    html += `<br>Scoop or overshoot: ${land.scoopOrOvershoot}`;
    if (!unpitched) {
      html += `<br>Final pitch center: ${formatCenterLine(result.centerErrorCents).replace('Center: ', '')}`;
      html += `<br>Sustain stability: ${stability.replace('Stability: ', '')}`;
    }
  }

  panel.innerHTML = html;
  panel.hidden = false;

  const status = el('pt-status');
  if (status) {
    const note = currentTargetMidi();
    const lbl = note != null ? midiToLabel(note).full : '';
    status.textContent = `${correction}${lbl ? ` · ${lbl}` : ''} (${pt.completed} passed)`;
  }
}

function onMatched() {
  if (pt.advancing) return;
  const result = pt.matcher.finalize();
  if (!result) return;
  pt.advancing = true;
  pt.completed += 1;
  const midi = currentTargetMidi();
  recordNoteResult(midi, result);
  pt.noteConsecutivePasses += 1;
  applyFeedbackVisibility();
  showResultPanel(result);

  const puck = el('pt-puck');
  if (puck) { puck.classList.remove('off', 'close'); puck.classList.add('in'); }

  clearAdvanceTimer();
  pt.advanceTimer = setTimeout(() => { if (pt.running) advance(); }, ADVANCE_DELAY_MS);
}

function onAttemptFailed() {
  if (pt.failHandled || pt.advancing) return;
  pt.failHandled = true;
  const result = pt.matcher.finalize();
  const midi = currentTargetMidi();
  if (result) recordNoteResult(midi, result);
  pt.noteConsecutivePasses = 0;
  applyFeedbackVisibility();
  showResultPanel(result || { failureReason: NO_STABLE_FUNDAMENTAL, passed: false });
  if (pt.matcher) pt.matcher.reset();
  pt.attemptSnapshots = [];
}

// ---- Meter rendering --------------------------------------------------------

function directionLabel(cents) {
  if (cents == null) return '—';
  if (Math.abs(cents) < 2) return 'Center';
  return cents > 0 ? 'Sharp' : 'Flat';
}

function confidenceLabel(tracked, res) {
  if (!res.voiced || res.freq <= 0) return NO_STABLE_FUNDAMENTAL;
  if ((tracked.rms ?? 0) < 0.002 || (tracked.clarity ?? 0) < 0.25) return 'Quiet';
  return 'Voiced';
}

function renderMeter(res, info, tracked) {
  const puck = el('pt-puck');
  const progress = el('pt-progress');
  const noteEl = el('pt-note');
  const centsEl = el('pt-cents');
  const dirEl = el('pt-direction');
  const confEl = el('pt-confidence');
  const overflow = el('pt-overflow');
  if (!puck) return;

  const mode = effectiveFeedbackMode();
  const showLive = mode === 'live' || mode === 'reduced';

  if (!res.active || res.freq <= 0 || res.centsOff == null) {
    if (showLive) puck.style.top = (pt.puckRatio * 100) + '%';
    puck.className = 'pt-puck off';
    puck.textContent = '--';
    if (progress) progress.style.height = (res.progress * 100) + '%';
    if (noteEl) noteEl.textContent = info && info.name ? info.name + info.oct : '--';
    if (centsEl) { centsEl.textContent = '-- \u00A2'; centsEl.className = 'pt-readout-cents off'; }
    if (dirEl) dirEl.textContent = '—';
    if (confEl) confEl.textContent = confidenceLabel(tracked, res);
    if (overflow) overflow.textContent = '';
    return;
  }

  const now = performance.now();
  const dt = pt.lastFrameMs ? now - pt.lastFrameMs : 16;
  const alpha = 1 - Math.exp(-dt / DISPLAY_SMOOTH_MS);
  pt.puckRatio += (res.offsetRatio - pt.puckRatio) * alpha;
  if (showLive) puck.style.top = (pt.puckRatio * 100) + '%';

  const absC = Math.abs(res.centsOff);
  const centerCents = pt.matcher?.profile?.centerCents ?? 10;
  const cls = res.within ? 'in' : absC <= centerCents * 2 ? 'close' : 'off';
  puck.className = 'pt-puck ' + cls;
  puck.textContent = info ? info.name : '\u266a';

  if (progress) progress.style.height = (res.progress * 100) + '%';
  if (noteEl) noteEl.textContent = info ? info.name + info.oct : '--';

  if (centsEl && mode !== 'result') {
    const sign = res.centsOff >= 0 ? '+' : '';
    centsEl.textContent = `${sign}${Math.round(res.centsOff)} \u00A2`;
    centsEl.className = 'pt-readout-cents ' + cls;
    if (mode === 'reduced') centsEl.classList.add('dim');
  }

  if (dirEl && mode !== 'result') {
    dirEl.textContent = directionLabel(res.centsOff);
    dirEl.className = 'pt-readout-direction ' + cls;
  }

  if (confEl) confEl.textContent = confidenceLabel(tracked, res);

  if (overflow) {
    if (absC > WINDOW_CENTS) {
      overflow.textContent = res.centsOff > 0 ? '\u2191' : '\u2193';
      overflow.classList.add('active');
    } else {
      overflow.textContent = '';
      overflow.classList.remove('active');
    }
  }
}

// ---- Mic loop ---------------------------------------------------------------

function loop() {
  if (!pt.running) return;
  const now = performance.now();
  pt.analyser.getFloatTimeDomainData(pt.buf);
  const tracked = pt.tracker.process(pt.buf);
  const { info, frequencyHz, voiced, clarity, rms } = tracked;
  const scoring = now >= pt.guideEndsAt;
  const res = pt.matcher.update({
    timestampMs: now,
    frequencyHz: voiced ? frequencyHz : -1,
    voiced: !!voiced,
    clarity,
    rms,
  }, now, scoring);

  if (scoring && res.centsOff != null) {
    pt.attemptSnapshots.push({ voiced: !!voiced, centsOff: res.centsOff, timestampMs: now });
  }

  renderMeter(res, info, tracked);

  if (res.matched && !pt.advancing) {
    onMatched();
  } else if (scoring && res.progress >= 1 && !res.matched && !pt.advancing && !pt.failHandled) {
    onAttemptFailed();
  }

  pt.lastFrameMs = now;
  pt.rafId = requestAnimationFrame(loop);
}

function buildConstraints() {
  const supported = (navigator.mediaDevices.getSupportedConstraints &&
    navigator.mediaDevices.getSupportedConstraints()) || {};
  const audio = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = true;
  if (supported.channelCount) audio.channelCount = 1;
  return Object.keys(audio).length ? { audio } : { audio: true };
}

async function startPitchTrainer() {
  if (tuner && tuner.running) stopTuner();
  if (runner && runner.running) stopPitchRunner();

  if (pt.sequenceError) {
    updateStartState();
    return;
  }

  ensureAudio();
  rebuildMatcher();
  pt.stageIdx = 0;
  pt.completed = 0;
  pt.guideEndsAt = 0;
  pt.puckRatio = 0.5;
  pt.lastFrameMs = 0;
  buildSequence();
  if (pt.sequenceError) {
    updateStartState();
    return;
  }

  try {
    try {
      pt.stream = await requestMicStream(buildConstraints());
    } catch (constraintErr) {
      pt.stream = await requestMicStream({ audio: true });
    }
    pt.source = audioCtx.createMediaStreamSource(pt.stream);
    pt.analyser = audioCtx.createAnalyser();
    pt.analyser.fftSize = 4096;
    pt.analyser.smoothingTimeConstant = 0;
    pt.buf = new Float32Array(pt.analyser.fftSize);
    pt.tracker = createPitchTracker({
      sampleRate: audioCtx.sampleRate,
      maxFreq: 1400,
      minRms: 0.003,
      minClarity: 0.45,
    });
    pt.source.connect(pt.analyser);

    pt.running = true;
    setToggleLabel(true);
    updateStartState();
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
    updateStartState();
    return;
  }
  pt.running = false;
  pt.advancing = false;
  pt.guideEndsAt = 0;
  clearAdvanceTimer();
  if (pt.rafId) { cancelAnimationFrame(pt.rafId); pt.rafId = null; }
  if (pt.tracker) pt.tracker.reset();
  if (pt.matcher) pt.matcher.reset();
  if (pt.source) { try { pt.source.disconnect(); } catch (e) {} pt.source = null; }
  if (pt.stream) { releaseMicStream(pt.stream); pt.stream = null; }
  stopGuideTone();
  setToggleLabel(false);
  updateStartState();
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
  if (pt.matcher) pt.matcher.reset();
  pt.attemptSnapshots = [];
  advance();
  const status = el('pt-status');
  if (status) status.textContent = 'Skipped — next note';
}

function ptReplay() {
  const midi = guideMidi();
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

function fillSelect(select, options, valueKey, labelKey, selected) {
  if (!select) return;
  select.innerHTML = '';
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o[valueKey];
    opt.textContent = o[labelKey];
    select.appendChild(opt);
  });
  select.value = selected;
}

function syncRangeUI() {
  const lowSel = el('pt-range-low');
  const highSel = el('pt-range-high');
  const presetSel = el('pt-range-preset');
  if (lowSel) lowSel.value = String(pt.rangeLow);
  if (highSel) highSel.value = String(pt.rangeHigh);
  if (presetSel) presetSel.value = matchPreset();
}

function refreshRangePresetOptions() {
  const presetSel = el('pt-range-preset');
  if (!presetSel) return;
  presetSel.innerHTML = '';
  allRangePresets().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    presetSel.appendChild(opt);
  });
  presetSel.value = matchPreset();
}

function updateTaskVisibility() {
  const patternField = document.querySelector('.pt-pattern-field');
  const intervalWrap = el('pt-interval-wrap');
  const intervalDirWrap = el('pt-interval-dir-wrap');
  const melodyNote = el('pt-melody-note');
  if (patternField) patternField.hidden = pt.task !== 'pattern';
  if (intervalWrap) intervalWrap.hidden = pt.task !== 'interval';
  if (intervalDirWrap) intervalDirWrap.hidden = pt.task !== 'interval';
  if (melodyNote) melodyNote.hidden = pt.task !== 'pattern';
}

function rebuildIfRunning() {
  buildSequence();
  updateTaskVisibility();
  if (pt.running) {
    setTarget();
  } else {
    updatePrompt();
  }
}

function rebuildPreviewStage() {
  const { scale } = getContext();
  pt.stages = buildStages(scale, pt.pattern);
  pt.stageIdx = 0;
  buildSequence();
  updateTaskVisibility();
  const stageEl = el('pt-stage');
  if (stageEl) stageEl.innerHTML = `<span class="pt-stage-name">${stageLabel()}</span>`;
  updatePrompt();
}

function loadSettings() {
  const legacy = getSetting('pitchTrainer.difficulty', null);
  if (legacy) {
    const migrated = migrateFromLegacyDifficulty(legacy);
    if (!getSetting('pitchTrainer.profile', null)) {
      saveSetting('pitchTrainer.profile', migrated.profile);
      saveSetting('pitchTrainer.holdMs', migrated.holdMs);
    }
  }

  pt.profile = getSetting('pitchTrainer.profile', pt.profile, PROFILE_OPTIONS.map(p => p.id));
  pt.holdMs = Number(getSetting('pitchTrainer.holdMs', pt.holdMs));
  if (!HOLD_DURATIONS_MS.includes(pt.holdMs)) pt.holdMs = DEFAULT_HOLD_MS;

  pt.task = getSetting('pitchTrainer.task', pt.task, TASKS.map(t => t.id));
  pt.style = getSetting('pitchTrainer.style', pt.style, STYLE_OPTIONS.map(s => s.id));
  pt.feedbackMode = getSetting('pitchTrainer.feedbackMode', pt.feedbackMode, FEEDBACK_MODES.map(f => f.id));
  pt.pattern = getSetting('pitchTrainer.pattern', pt.pattern, SCALE_PATTERNS.map(p => p.id));
  pt.intervalId = getSetting('pitchTrainer.intervalId', pt.intervalId, INTERVAL_OPTIONS);
  pt.intervalDirection = getSetting('pitchTrainer.intervalDirection', pt.intervalDirection, ['ascending', 'descending']);
  pt.rangeLow = Number(getSetting('pitchTrainer.rangeLow', pt.rangeLow));
  pt.rangeHigh = Number(getSetting('pitchTrainer.rangeHigh', pt.rangeHigh));
  pt.guide = getSetting('pitchTrainer.guide', pt.guide) !== false;

  if (!(pt.rangeLow >= RANGE_MIN_MIDI && pt.rangeLow <= RANGE_MAX_MIDI)) pt.rangeLow = 48;
  if (!(pt.rangeHigh >= RANGE_MIN_MIDI && pt.rangeHigh <= RANGE_MAX_MIDI)) pt.rangeHigh = 72;

  loadCustomPresets();
}

function initPitchTrainer() {
  loadSettings();

  if (pt.initialized) {
    syncRangeUI();
    refreshRangePresetOptions();
    const patternSel = el('pt-pattern');
    if (patternSel) patternSel.value = pt.pattern;
    const taskSel = el('pt-task');
    if (taskSel) taskSel.value = pt.task;
    if (!pt.running) rebuildPreviewStage();
    setReplayButtonActive(false);
    applyFeedbackVisibility();
    return;
  }
  pt.initialized = true;
  wireReplayButton();

  fillSelect(el('pt-task'), TASKS, 'id', 'label', pt.task);
  fillSelect(el('pt-profile'), PROFILE_OPTIONS, 'id', 'label', pt.profile);

  const holdSel = el('pt-hold');
  if (holdSel) {
    holdSel.innerHTML = '';
    HOLD_DURATIONS_MS.forEach(ms => {
      const opt = document.createElement('option');
      opt.value = String(ms);
      opt.textContent = (ms / 1000).toFixed(ms % 1000 ? 2 : 1) + 's';
      holdSel.appendChild(opt);
    });
    holdSel.value = String(pt.holdMs);
    holdSel.onchange = () => {
      pt.holdMs = Number(holdSel.value);
      saveSetting('pitchTrainer.holdMs', pt.holdMs);
      if (pt.matcher) rebuildMatcher();
      if (pt.running) setTarget();
    };
  }

  fillSelect(el('pt-style'), STYLE_OPTIONS, 'id', 'label', pt.style);
  fillSelect(el('pt-feedback'), FEEDBACK_MODES, 'id', 'label', pt.feedbackMode);

  const intervalSel = el('pt-interval');
  if (intervalSel) {
    intervalSel.innerHTML = '';
    INTERVAL_OPTIONS.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      intervalSel.appendChild(opt);
    });
    intervalSel.value = pt.intervalId;
    intervalSel.onchange = () => {
      pt.intervalId = intervalSel.value;
      saveSetting('pitchTrainer.intervalId', pt.intervalId);
      rebuildIfRunning();
    };
  }

  const intervalDirSel = el('pt-interval-dir');
  if (intervalDirSel) {
    intervalDirSel.innerHTML = '';
    ['ascending', 'descending'].forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id === 'ascending' ? 'Ascending' : 'Descending';
      intervalDirSel.appendChild(opt);
    });
    intervalDirSel.value = pt.intervalDirection;
    intervalDirSel.onchange = () => {
      pt.intervalDirection = intervalDirSel.value;
      saveSetting('pitchTrainer.intervalDirection', pt.intervalDirection);
      rebuildIfRunning();
    };
  }

  const taskSel = el('pt-task');
  if (taskSel) {
    taskSel.onchange = () => {
      pt.task = taskSel.value;
      saveSetting('pitchTrainer.task', pt.task);
      rebuildIfRunning();
    };
  }

  const profileSel = el('pt-profile');
  if (profileSel) {
    profileSel.onchange = () => {
      pt.profile = profileSel.value;
      saveSetting('pitchTrainer.profile', pt.profile);
      if (pt.matcher) rebuildMatcher();
      if (pt.running) setTarget();
      resizeZones();
    };
  }

  const styleSel = el('pt-style');
  if (styleSel) {
    styleSel.onchange = () => {
      pt.style = styleSel.value;
      saveSetting('pitchTrainer.style', pt.style);
      if (pt.matcher) rebuildMatcher();
      if (pt.running) setTarget();
    };
  }

  const feedbackSel = el('pt-feedback');
  if (feedbackSel) {
    feedbackSel.onchange = () => {
      pt.feedbackMode = feedbackSel.value;
      saveSetting('pitchTrainer.feedbackMode', pt.feedbackMode);
      applyFeedbackVisibility();
    };
  }

  const lowSel = el('pt-range-low');
  const highSel = el('pt-range-high');
  const presetSel = el('pt-range-preset');
  const patternSel = el('pt-pattern');

  if (patternSel) {
    patternSel.innerHTML = '';
    SCALE_PATTERNS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.label} · ${p.hint}`;
      patternSel.appendChild(opt);
    });
    patternSel.value = pt.pattern;
    patternSel.onchange = () => {
      pt.pattern = patternSel.value;
      saveSetting('pitchTrainer.pattern', pt.pattern);
      rebuildIfRunning();
      if (!pt.running) rebuildPreviewStage();
    };
  }

  fillNoteSelect(lowSel, pt.rangeLow);
  fillNoteSelect(highSel, pt.rangeHigh);
  refreshRangePresetOptions();

  if (presetSel) {
    presetSel.onchange = () => {
      const preset = allRangePresets().find(p => p.id === presetSel.value);
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

  subscribeContext(() => {
    if (pt.running) { buildSequence(); setTarget(); }
    else rebuildPreviewStage();
  });

  if (!pt.stages.length) {
    const { scale } = getContext();
    pt.stages = buildStages(scale, pt.pattern);
  }
  updateTaskVisibility();
  rebuildPreviewStage();
  applyFeedbackVisibility();
}

window.togglePitchTrainer = togglePitchTrainer;
window.ptSkip = ptSkip;
window.ptReplay = ptReplay;

export { initPitchTrainer, stopPitchTrainer, pt };
