// Study Lab — guided, mic-driven walkthrough for recommended studies.
// Scale-on-string fill, interval orbits, chord-tone finding, drone riffs.

import { getSetting, saveSetting } from './persistence.js';
import { getContext, setContext } from './musicalContext.js';
import { TUNINGS } from './tunings.js';
import { ROOTS } from './theory.js';
import { SCALES, shortScaleName } from './scales.js';
import { renderFretboard } from './interval-map/fretboardView.js';
import { getStudyById } from './studyCatalog.js';
import { recordStudyStarted, recordStudyCompleted } from './studyProgress.js';
import { buildWalkthrough, DEGREE_LABELS, midiLabel } from './studyLabModel.js';
import { createStudyLabMic } from './studyLabMic.js';

const lab = {
  initialized: false,
  studyId: null,
  walkthrough: null,
  stepIndex: 0,
  filledKeys: new Set(),
  hitPitchClasses: new Set(),
  seqIndex: 0,
  mic: null,
  droneOn: true,
  tuning: 'Standard',
  advancing: false,
  status: '',
};

function el(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentStep() {
  return lab.walkthrough?.steps?.[lab.stepIndex] || null;
}

function ensureMic() {
  if (lab.mic) return lab.mic;
  lab.mic = createStudyLabMic({
    holdMs: 260,
    toleranceCents: 42,
    onFrame: handleMicFrame,
  });
  return lab.mic;
}

function handleMicFrame({ info, match, gate, label }) {
  const step = currentStep();
  if (!step || !step.mic || lab.advancing) return;

  // Live detected highlight
  updateLiveDetection(info?.midi ?? null, label);

  if (step.type === 'scale-string' || step.type === 'interval-orbit') {
    handleSequenceFrame(step, info, match, gate);
  } else if (step.type === 'scale-box' || step.type === 'chord-tones' || step.type === 'drone-riff') {
    handleCollectionFrame(step, info, gate);
  }
}

function handleSequenceFrame(step, info, match, gate) {
  const seq = step.sequence || [];
  if (!seq.length || lab.seqIndex >= seq.length) return;
  const target = seq[lab.seqIndex];
  const midi = info?.midi;
  if (midi == null) return;

  // Prefer pitch-class match with hold via matcher progress
  const playedPc = ((Math.round(midi) % 12) + 12) % 12;
  const targetPc = target.pitchClass != null
    ? target.pitchClass
    : ((target.targetMidi % 12) + 12) % 12;

  // Keep matcher aimed at target MIDI for hold meter
  if (lab.mic && match?.active !== false) {
    // retarget if needed
  }

  const held = (match?.within && match?.progress >= 0.85)
    || (gate?.stable && gate.midi != null && ((gate.midi % 12) + 12) % 12 === targetPc);

  if (playedPc === targetPc && held) {
    acceptSequenceNote(step, target);
  } else {
    setStatusMeter(match?.progress || gate?.progress || 0, labelForTarget(target), info);
  }
}

function acceptSequenceNote(step, target) {
  if (target.key) lab.filledKeys.add(target.key);
  // Also fill any position with same PC on the focus string
  (step.positions || []).forEach(p => {
    if (p.pc === target.pitchClass && (step.stringIndex == null || p.string === step.stringIndex)) {
      lab.filledKeys.add(p.key);
    }
  });
  lab.seqIndex += 1;
  paintBoard(step);
  paintProgress();

  if (lab.seqIndex >= (step.sequence || []).length) {
    setStatus('Step complete — nice.', null, 1);
    scheduleAdvance();
    return;
  }
  const next = step.sequence[lab.seqIndex];
  ensureMic().setTargetMidi(next.targetMidi);
  setStatus(`Next: ${labelForTarget(next)}`, null, 0);
}

function handleCollectionFrame(step, info, gate) {
  if (!gate?.stable || gate.midi == null) {
    setStatusMeter(gate?.progress || 0, null, info);
    return;
  }
  const pc = ((gate.midi % 12) + 12) % 12;
  const targets = new Set(step.targetPitchClasses || []);
  if (!targets.has(pc)) {
    setStatus(`Heard ${midiLabel(gate.midi)} — not a target tone yet.`, null, gate.progress);
    return;
  }
  if (lab.hitPitchClasses.has(pc)) {
    setStatusMeter(0, null, info);
    return;
  }
  lab.hitPitchClasses.add(pc);
  (step.positions || []).forEach(p => {
    if (p.pc === pc) lab.filledKeys.add(p.key);
  });
  paintBoard(step);
  paintProgress();

  const needed = step.targetPitchClasses || [];
  const done = needed.every(p => lab.hitPitchClasses.has(p));
  if (done) {
    setStatus('All target tones found.', null, 1);
    if (step.type !== 'drone-riff') scheduleAdvance();
    else setStatus('Targets hit — keep riffing, then continue when ready.', null, 1);
  } else {
    const remaining = needed.filter(p => !lab.hitPitchClasses.has(p));
    setStatus(`Got it. Still need: ${remaining.map(pcLabel).join(', ')}`, null, 0);
  }
}

function pcLabel(pc) {
  const step = currentStep();
  const rootPc = step?.rootPc ?? 0;
  const deg = ((pc - rootPc) % 12 + 12) % 12;
  return DEGREE_LABELS[deg] || String(pc);
}

function labelForTarget(target) {
  if (!target) return '';
  if (target.degreeLabel) return target.degreeLabel;
  if (target.intervalClass != null) return DEGREE_LABELS[target.intervalClass] || String(target.intervalClass);
  return midiLabel(target.targetMidi);
}

function scheduleAdvance() {
  if (lab.advancing) return;
  lab.advancing = true;
  setTimeout(() => {
    lab.advancing = false;
    nextStep();
  }, 700);
}

function updateLiveDetection(midi, label) {
  const live = el('sl-live');
  if (!live) return;
  live.textContent = midi != null ? (label?.full || midiLabel(midi)) : '—';
}

function setStatus(text, _label, progress) {
  lab.status = text || '';
  const status = el('sl-status');
  if (status) status.textContent = lab.status;
  const meter = el('sl-meter-fill');
  if (meter) meter.style.width = `${Math.round((progress || 0) * 100)}%`;
}

function setStatusMeter(progress, targetLabel, info) {
  const heard = info?.midi != null ? midiLabel(info.midi) : '…';
  const tip = targetLabel ? `Target ${targetLabel} · hearing ${heard}` : `Hearing ${heard}`;
  setStatus(tip, targetLabel, progress);
}

function paintProgress() {
  const step = currentStep();
  const steps = lab.walkthrough?.steps || [];
  const prog = el('sl-step-progress');
  if (prog) {
    prog.textContent = `Step ${lab.stepIndex + 1} / ${steps.length}`;
  }
  const fill = el('sl-overall-fill');
  if (fill) {
    fill.style.width = `${Math.round((lab.stepIndex / Math.max(steps.length - 1, 1)) * 100)}%`;
  }
  const chips = el('sl-seq-chips');
  if (!chips || !step) return;
  chips.innerHTML = '';
  if (step.sequence) {
    step.sequence.forEach((t, i) => {
      const c = document.createElement('span');
      c.className = 'sl-chip' + (i < lab.seqIndex ? ' done' : i === lab.seqIndex ? ' current' : '');
      c.textContent = labelForTarget(t);
      chips.appendChild(c);
    });
  } else if (step.targetPitchClasses) {
    step.targetPitchClasses.forEach(pc => {
      const c = document.createElement('span');
      c.className = 'sl-chip' + (lab.hitPitchClasses.has(pc) ? ' done' : '');
      c.textContent = pcLabel(pc);
      chips.appendChild(c);
    });
  }
}

function paintBoard(step) {
  const board = el('sl-board');
  const wrap = el('sl-board-wrap');
  if (!board || !step) return;

  const needsBoard = ['scale-string', 'scale-box', 'interval-orbit', 'chord-tones', 'drone-riff']
    .includes(step.type);
  if (wrap) wrap.hidden = !needsBoard;
  if (!needsBoard) {
    board.innerHTML = '';
    return;
  }

  const strings = TUNINGS[lab.tuning] || TUNINGS.Standard;
  const openMidis = step.openMidis || strings.map((_, i) => 40 + i); // fallback unused
  const fretStart = step.fretStart ?? 0;
  const fretEnd = step.fretEnd ?? 12;
  const positions = (step.positions || []).map(p => ({
    string: p.string,
    fret: p.fret,
    midi: p.midi,
    intervalClass: p.degree,
  }));

  const highlight = {};
  (step.positions || []).forEach(p => {
    highlight[p.key] = {
      ghost: !lab.filledKeys.has(p.key),
      shown: !lab.filledKeys.has(p.key) && step.type !== 'scale-string',
      correct: lab.filledKeys.has(p.key),
      forceLabel: true,
    };
  });

  if (step.type === 'scale-string' && step.sequence?.[lab.seqIndex]) {
    const cur = step.sequence[lab.seqIndex];
    highlight[cur.key] = { ...(highlight[cur.key] || {}), target: true, forceLabel: true };
  }

  if (step.type === 'interval-orbit' && step.anchor) {
    const ak = `${step.anchor.string}:${step.anchor.fret}`;
    highlight[ak] = { ...(highlight[ak] || {}), anchor: true, forceLabel: true };
    const cur = step.sequence?.[lab.seqIndex];
    if (cur) {
      // mark candidate cells for current interval PC
      (step.openMidis || openMidis).forEach((open, s) => {
        for (let f = fretStart; f <= fretEnd; f++) {
          const midi = open + f;
          if (((midi % 12) + 12) % 12 === cur.pitchClass) {
            const key = `${s}:${f}`;
            highlight[key] = {
              ...(highlight[key] || {}),
              target: !lab.filledKeys.has(key),
              correct: lab.filledKeys.has(key),
              forceLabel: true,
            };
          }
        }
      });
      // synthesize positions for interval targets
      positions.length = 0;
      Object.keys(highlight).forEach(key => {
        const [s, f] = key.split(':').map(Number);
        positions.push({
          string: s,
          fret: f,
          midi: openMidis[s] + f,
          intervalClass: ((openMidis[s] + f - (step.anchor?.midi || 0)) % 12 + 12) % 12,
        });
      });
    }
  }

  // For sequence steps, mark completed sequence keys
  if (step.sequence) {
    step.sequence.slice(0, lab.seqIndex).forEach(t => {
      if (t.key) highlight[t.key] = { ...(highlight[t.key] || {}), correct: true, forceLabel: true };
    });
  }

  renderFretboard(board, {
    strings,
    openMidis: step.openMidis || openMidis,
    fretStart,
    fretEnd,
    handedness: 'right',
    anchor: step.anchor || null,
    positions,
    highlight,
    labelMode: 'both',
    showBoundary: false,
    interactive: false,
    answersHidden: false,
  });

  // Emphasize focus string for scale-string
  if (step.type === 'scale-string' && step.stringIndex != null) {
    board.querySelectorAll('.io-cell').forEach(cell => {
      const s = Number(cell.dataset.string);
      if (s !== step.stringIndex) cell.classList.add('sl-dim-string');
      else cell.classList.add('sl-focus-string');
    });
  }
}

function syncDrone(step) {
  const mic = ensureMic();
  if (!step?.drone || !lab.droneOn) {
    mic.stopDrone();
    return;
  }
  const ctx = getContext();
  const rootPc = step.dronePc != null ? step.dronePc : (step.rootPc ?? 0);
  // Place drone near low E range
  let midi = 40 + ((rootPc - 4 + 12) % 12); // E2=40 base
  if (midi < 36) midi += 12;
  mic.setDroneEnabled(true, midi);
  void ctx;
}

async function activateStep() {
  const step = currentStep();
  if (!step) return;
  lab.filledKeys = new Set();
  lab.hitPitchClasses = new Set();
  lab.seqIndex = 0;
  lab.advancing = false;

  const title = el('sl-step-title');
  const prompt = el('sl-step-prompt');
  const focus = el('sl-focus-list');
  if (title) title.textContent = step.title;
  if (prompt) prompt.textContent = step.prompt;
  if (focus) {
    if (step.type === 'intro' && step.focus?.length) {
      focus.hidden = false;
      focus.innerHTML = step.focus.map(f => `<li>${escapeHtml(f)}</li>`).join('');
    } else {
      focus.hidden = true;
      focus.innerHTML = '';
    }
  }

  const micPanel = el('sl-mic-panel');
  if (micPanel) micPanel.hidden = !step.mic;

  const continueBtn = el('sl-continue');
  const skipBtn = el('sl-skip');
  const finishBtn = el('sl-finish');
  if (continueBtn) {
    continueBtn.hidden = !(['intro', 'application', 'drone-riff', 'complete'].includes(step.type));
    continueBtn.textContent = step.type === 'complete' ? 'Done' : (step.type === 'intro' ? 'Begin' : 'Continue');
  }
  if (skipBtn) skipBtn.hidden = step.type === 'complete' || step.type === 'intro';
  if (finishBtn) finishBtn.hidden = step.type === 'complete';

  paintBoard(step);
  paintProgress();
  setStatus(step.mic ? 'Listening for guitar…' : '', null, 0);

  if (step.mic) {
    try {
      await ensureMic().start();
      if (step.sequence?.[0]) {
        ensureMic().setTargetMidi(step.sequence[0].targetMidi);
      } else {
        ensureMic().clearTarget();
      }
      syncDrone(step);
    } catch (err) {
      setStatus('Microphone permission needed to progress by playing. You can still Continue/Skip.', null, 0);
    }
  } else {
    lab.mic?.stopDrone();
    // Keep mic running only if useful — stop to free device between non-mic steps
    if (lab.mic?.running) lab.mic.stop();
  }

  if (step.type === 'complete') {
    const study = lab.studyId ? getStudyById(lab.studyId) : null;
    if (study) recordStudyCompleted(study);
  }
}

function nextStep() {
  if (!lab.walkthrough) return;
  if (lab.stepIndex >= lab.walkthrough.steps.length - 1) {
    // finished
    return;
  }
  lab.stepIndex += 1;
  activateStep();
}

function prevUseful() {
  if (lab.stepIndex <= 0) return;
  lab.stepIndex -= 1;
  activateStep();
}

const DEFAULT_STUDY_ID = 'major-scale-construction';

export function startStudyLab(studyId) {
  const catalogStudy = getStudyById(studyId) || getStudyById(DEFAULT_STUDY_ID);
  const id = catalogStudy?.id || DEFAULT_STUDY_ID;
  if (catalogStudy) recordStudyStarted(catalogStudy);
  const ctx = getContext();
  lab.studyId = id;
  lab.tuning = getSetting('sl.tuning', getSetting('io.tuning', 'Standard'));
  if (catalogStudy?.scale) {
    setContext({ scale: catalogStudy.scale }, 'study-lab');
  }
  lab.walkthrough = buildWalkthrough(catalogStudy, {
    root: ctx.root,
    scale: catalogStudy?.scale || ctx.scale,
    tuning: lab.tuning,
  });
  lab.stepIndex = 0;
  renderShell();
  activateStep();
}

function renderShell() {
  const root = el('study-lab-root');
  if (!root) return;
  const wt = lab.walkthrough;
  const tuningNames = Object.keys(TUNINGS);
  root.innerHTML = `
    <div class="section-head">
      <div class="section-kicker">Study Lab</div>
      <h2 id="sl-title">${escapeHtml(wt?.title || 'Study Lab')}</h2>
      <p id="sl-subtitle">${escapeHtml(shortScaleName(wt?.scaleName || ''))} · ${escapeHtml(wt?.root || '')} · mic-guided walkthrough</p>
    </div>

    <div class="sl-toolbar">
      <label class="sl-field">
        <span>Tuning</span>
        <select id="sl-tuning">${tuningNames.map(n =>
          `<option value="${escapeHtml(n)}"${n === lab.tuning ? ' selected' : ''}>${escapeHtml(n)}</option>`
        ).join('')}</select>
      </label>
      <label class="sl-field">
        <span>Root</span>
        <select id="sl-root">${ROOTS.map(r =>
          `<option value="${r}"${r === (wt?.root || 'E') ? ' selected' : ''}>${r}</option>`
        ).join('')}</select>
      </label>
      <label class="sl-toggle">
        <input type="checkbox" id="sl-drone-toggle" ${lab.droneOn ? 'checked' : ''}>
        <span>Drone</span>
      </label>
      <div class="sl-step-progress" id="sl-step-progress"></div>
    </div>

    <div class="sl-overall"><div class="sl-overall-fill" id="sl-overall-fill"></div></div>

    <article class="sl-card">
      <div class="sl-step-kicker">Now</div>
      <h3 id="sl-step-title">—</h3>
      <p id="sl-step-prompt" class="sl-prompt"></p>
      <ol id="sl-focus-list" class="sl-focus" hidden></ol>

      <div id="sl-board-wrap" class="sl-board-wrap" hidden>
        <div class="sl-board-scroll">
          <div id="sl-board" class="fretboard io-fretboard sl-fretboard" role="grid" aria-label="Study fretboard"></div>
        </div>
      </div>

      <div id="sl-mic-panel" class="sl-mic-panel" hidden>
        <div class="sl-mic-row">
          <div class="sl-live-wrap">
            <span class="sl-live-label">Hearing</span>
            <span id="sl-live" class="sl-live">—</span>
          </div>
          <div class="sl-meter"><div id="sl-meter-fill" class="sl-meter-fill"></div></div>
        </div>
        <div id="sl-seq-chips" class="sl-chips"></div>
        <p id="sl-status" class="sl-status" aria-live="polite"></p>
        <p class="sl-note">Mic checks pitch class — it cannot see which string or fret you used. Pick positions yourself.</p>
      </div>

      <div class="sl-actions">
        <button type="button" class="btn primary" id="sl-continue">Continue</button>
        <button type="button" class="btn" id="sl-skip">Skip step</button>
        <button type="button" class="btn" id="sl-back">Back</button>
        <button type="button" class="btn" id="sl-finish">Finish study</button>
      </div>
    </article>
  `;

  el('sl-tuning').onchange = () => {
    lab.tuning = el('sl-tuning').value;
    saveSetting('sl.tuning', lab.tuning);
    rebuildWalkthroughKeepingStep();
  };
  el('sl-root').onchange = () => {
    setContext({ root: el('sl-root').value }, 'study-lab');
    rebuildWalkthroughKeepingStep();
  };
  el('sl-drone-toggle').onchange = () => {
    lab.droneOn = el('sl-drone-toggle').checked;
    syncDrone(currentStep());
  };
  el('sl-continue').onclick = () => {
    const step = currentStep();
    if (step?.type === 'complete') {
      // stay; user can navigate home via dock
      return;
    }
    nextStep();
  };
  el('sl-skip').onclick = () => nextStep();
  el('sl-back').onclick = () => prevUseful();
  el('sl-finish').onclick = () => {
    const study = lab.studyId ? getStudyById(lab.studyId) : null;
    if (study) recordStudyCompleted(study);
    lab.stepIndex = (lab.walkthrough?.steps.length || 1) - 1;
    activateStep();
  };
}

function rebuildWalkthroughKeepingStep() {
  const study = getStudyById(lab.studyId);
  const ctx = getContext();
  const idx = lab.stepIndex;
  lab.walkthrough = buildWalkthrough(study, {
    root: ctx.root,
    scale: study?.scale || ctx.scale,
    tuning: lab.tuning,
  });
  lab.stepIndex = Math.min(idx, lab.walkthrough.steps.length - 1);
  activateStep();
}

export function initStudyLab() {
  if (!lab.initialized) {
    lab.initialized = true;
    if (!lab.walkthrough) {
      startStudyLab(DEFAULT_STUDY_ID);
      return;
    }
  }
  renderShell();
  activateStep();
}

export function stopStudyLab() {
  if (lab.mic) {
    lab.mic.stop();
  }
}

export function openStudyLabFor(studyId) {
  startStudyLab(studyId);
}

// Avoid unused import warnings in some tooling
void SCALES;
