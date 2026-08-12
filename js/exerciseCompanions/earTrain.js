import { parseNote, NOTE_NAMES_SHARP, pick, INTERVAL_LABELS } from '../theory.js';
import { SCALES, getScaleNotes, shortScaleName } from '../scales.js';
import { ensureAudio, midiFreq, audioCtx, getAnalyserDestination } from '../audio.js';
import { createCompanionPanel } from './panel.js';

const EAR_FADE_START_MS = 1100;
const TONE_DUR = 1.25;

export function mountEarTrain(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);

  const lock = document.createElement('p');
  lock.className = 'ec-sub';
  lock.textContent = `Locked: ${companion.root} · ${companion.scale}`;

  const question = document.createElement('p');
  question.className = 'ec-ear-question';

  const feedback = document.createElement('div');
  feedback.className = 'fb-feedback ec-ear-feedback';

  const controls = document.createElement('div');
  controls.className = 'ec-ear-controls';
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'ec-btn';
  playBtn.textContent = 'Play';
  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'ec-btn';
  replayBtn.textContent = 'Replay';
  replayBtn.disabled = true;
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'ec-btn';
  nextBtn.textContent = 'Next';
  nextBtn.disabled = true;
  controls.append(playBtn, replayBtn, nextBtn);

  const answers = document.createElement('div');
  answers.className = 'ec-ear-answers';

  const score = document.createElement('div');
  score.className = 'ec-ear-score';
  const rightEl = document.createElement('span');
  const totalEl = document.createElement('span');
  const streakEl = document.createElement('span');
  score.append(rightEl, totalEl, streakEl);

  shell.body.append(lock, question, feedback, controls, answers, score);

  let targetSemi = null;
  let targetNote = null;
  let targetDegree = null;
  let targetInterval = null;
  let answered = false;
  let right = 0;
  let total = 0;
  let streak = 0;
  let sequence = null;
  let seqTimers = [];
  let stopTimer = null;
  let fadeTimer = null;
  let osc = null;
  let osc2 = null;
  let gain = null;

  function activeKey() {
    return companion.root || 'C';
  }

  function activeScale() {
    return companion.scale || 'Major (Ionian)';
  }

  function labelForPc(pc) {
    const rootP = parseNote(activeKey());
    const notes = getScaleNotes(activeKey(), activeScale()) || [];
    const def = SCALES[activeScale()] || SCALES['Major (Ionian)'];
    if (rootP) {
      const match = def.find(([, semi]) => (rootP.semi + semi) % 12 === pc);
      if (match) {
        const idx = def.indexOf(match);
        if (notes[idx]) return notes[idx];
      }
    }
    const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
    const flatNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return flatKeys.includes(activeKey()) ? flatNames[pc] : NOTE_NAMES_SHARP[pc];
  }

  function scalePool(rootP) {
    const def = SCALES[activeScale()] || SCALES['Major (Ionian)'];
    const notes = getScaleNotes(activeKey(), activeScale()) || [];
    return def.map(([, semi], i) => ({
      semi: (rootP.semi + semi) % 12,
      degree: i + 1,
      interval: semi,
      note: notes[i] || labelForPc((rootP.semi + semi) % 12),
    }));
  }

  function targetPool(rootP) {
    if (companion.earPool === 'chromatic' && companion.earAnswer !== 'degree') {
      return Array.from({ length: 12 }, (_, semi) => ({
        semi,
        degree: null,
        interval: (semi - rootP.semi + 12) % 12,
        note: labelForPc(semi),
      }));
    }
    return scalePool(rootP);
  }

  function contextLabel() {
    if (companion.earContext === 'melodic') return 'melodic interval';
    if (companion.earContext === 'single') return 'single tone';
    return 'root first';
  }

  function renderScore() {
    rightEl.textContent = `Right: ${right}`;
    totalEl.textContent = `Total: ${total}`;
    streakEl.textContent = `Streak: ${streak}`;
  }

  function clearAnswerState() {
    answers.querySelectorAll('.letter-btn,.int-btn').forEach((b) => {
      b.classList.remove('correct', 'wrong', 'selected');
    });
  }

  function stopTone() {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (osc) {
      try {
        const t = audioCtx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        const o1 = osc;
        const o2 = osc2;
        setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) { /* noop */ } }, 150);
      } catch (e) { /* noop */ }
      osc = null;
      osc2 = null;
      gain = null;
    }
  }

  function clearSeqTimers() {
    seqTimers.forEach(clearTimeout);
    seqTimers = [];
  }

  function playTone(midi, duration) {
    if (stopTimer) clearTimeout(stopTimer);
    stopTone();
    ensureAudio();
    const dur = duration || TONE_DUR;
    const freq = midiFreq(midi);
    const o1 = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const g = audioCtx.createGain();
    const t = audioCtx.currentTime;

    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = freq;
    o2.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(freq * 4, 5000);
    filter.Q.value = 0.5;

    const sustain = dur * 0.6;
    const release = dur * 0.35;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.04);
    g.gain.setValueAtTime(0.15, t + sustain);
    g.gain.exponentialRampToValueAtTime(0.001, t + sustain + release);

    o1.connect(filter);
    o2.connect(filter);
    filter.connect(g);
    g.connect(getAnalyserDestination());
    o1.start(t);
    o2.start(t);
    osc = o1;
    osc2 = o2;
    gain = g;
    stopTimer = setTimeout(() => stopTone(), (sustain + release + 0.1) * 1000);
  }

  function playSequence(seq) {
    clearSeqTimers();
    sequence = seq;
    seq.forEach((tone) => {
      if (tone.delay > 0) {
        seqTimers.push(setTimeout(() => playTone(tone.midi, tone.dur), tone.delay));
      } else {
        playTone(tone.midi, tone.dur);
      }
    });
  }

  function buildAnswerButtons() {
    answers.innerHTML = '';
    answers.className = companion.earAnswer === 'interval'
      ? 'ec-ear-answers int-picker'
      : 'ec-ear-answers note-btn-row';

    const rootP = parseNote(activeKey());
    if (!rootP) return;

    if (companion.earAnswer === 'degree') {
      scalePool(rootP).forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'letter-btn';
        btn.textContent = String(item.degree);
        btn.dataset.answer = item.degree;
        btn.addEventListener('click', () => checkAnswer(item.degree, btn));
        answers.appendChild(btn);
      });
      return;
    }

    if (companion.earAnswer === 'interval') {
      const intervals = companion.earPool === 'chromatic'
        ? Array.from({ length: 12 }, (_, semi) => semi)
        : Array.from(new Set(scalePool(rootP).map((item) => item.interval)));
      intervals.forEach((semi) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'int-btn';
        btn.textContent = INTERVAL_LABELS[semi] || `${semi} st`;
        btn.dataset.answer = semi;
        btn.addEventListener('click', () => checkAnswer(semi, btn));
        answers.appendChild(btn);
      });
      return;
    }

    targetPool(rootP).forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'letter-btn' + (item.note.length > 1 ? ' accidental' : '');
      btn.textContent = item.note;
      btn.dataset.answer = item.semi;
      btn.addEventListener('click', () => checkAnswer(item.semi, btn));
      answers.appendChild(btn);
    });
  }

  function expectedAnswer() {
    if (companion.earAnswer === 'degree') return String(targetDegree);
    if (companion.earAnswer === 'interval') {
      return INTERVAL_LABELS[targetInterval] || `${targetInterval} st`;
    }
    return targetNote;
  }

  function answerCorrect(answer) {
    if (companion.earAnswer === 'degree') return Number(answer) === targetDegree;
    if (companion.earAnswer === 'interval') return Number(answer) === targetInterval;
    return Number(answer) === targetSemi;
  }

  function checkAnswer(answer, btn) {
    if (answered || targetSemi === null) return;
    answered = true;
    total += 1;

    const correct = answerCorrect(answer);
    btn.classList.add(correct ? 'correct' : 'wrong');

    if (!correct) {
      answers.querySelectorAll('.letter-btn,.int-btn').forEach((b) => {
        if (answerCorrect(b.dataset.answer)) b.classList.add('correct');
      });
    }

    if (correct) {
      right += 1;
      streak += 1;
      feedback.className = 'fb-feedback ec-ear-feedback show correct';
      feedback.textContent = '✓';
    } else {
      streak = 0;
      feedback.className = 'fb-feedback ec-ear-feedback show wrong';
      feedback.textContent = `Expected: ${expectedAnswer()}`;
    }

    renderScore();
    nextBtn.disabled = false;
    fadeTimer = setTimeout(() => feedback.classList.add('fade-out'), EAR_FADE_START_MS);
  }

  function updateQuestionLine() {
    question.innerHTML = `<span class="highlight">${activeKey()}</span> · ${shortScaleName(activeScale())} · ${contextLabel()}`;
  }

  function playQuestion() {
    stop();
    answered = false;
    targetNote = null;
    targetSemi = null;
    targetDegree = null;
    targetInterval = null;
    feedback.className = 'fb-feedback ec-ear-feedback';
    feedback.textContent = '';
    clearAnswerState();
    nextBtn.disabled = true;
    replayBtn.disabled = true;

    const tonic = parseNote(activeKey());
    if (!tonic) return;
    const pool = targetPool(tonic);
    const oct = 3 + Math.floor(Math.random() * 3);
    const baseMidi = 12 * (oct + 1);

    if (companion.earContext === 'melodic') {
      const first = pick(pool);
      let second = pick(pool);
      let guard = 0;
      while (second.semi === first.semi && guard++ < 20) second = pick(pool);
      const interval = (second.semi - first.semi + 12) % 12;
      targetSemi = second.semi;
      targetNote = second.note;
      targetDegree = second.degree;
      targetInterval = interval;
      const firstMidi = baseMidi + first.semi;
      playSequence([
        { midi: firstMidi, dur: TONE_DUR, delay: 0 },
        { midi: firstMidi + interval, dur: TONE_DUR, delay: 900 },
      ]);
    } else {
      const target = pick(pool);
      targetSemi = target.semi;
      targetNote = target.note;
      targetDegree = target.degree;
      targetInterval = target.interval;

      if (companion.earContext === 'root') {
        const rootMidi = baseMidi + tonic.semi;
        const intervalAboveRoot = (target.semi - tonic.semi + 12) % 12;
        playSequence([
          { midi: rootMidi, dur: TONE_DUR, delay: 0 },
          { midi: rootMidi + intervalAboveRoot, dur: TONE_DUR, delay: 900 },
        ]);
      } else {
        playSequence([{ midi: baseMidi + target.semi, dur: TONE_DUR, delay: 0 }]);
      }
    }

    updateQuestionLine();
    replayBtn.disabled = false;
  }

  function replay() {
    if (!sequence || targetSemi === null) return;
    playSequence(sequence);
  }

  function stop() {
    clearSeqTimers();
    stopTone();
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
  }

  playBtn.addEventListener('click', playQuestion);
  replayBtn.addEventListener('click', replay);
  nextBtn.addEventListener('click', playQuestion);

  buildAnswerButtons();
  updateQuestionLine();
  renderScore();
  lock.textContent = `Locked: ${activeKey()} · ${activeScale()}`;

  return {
    refresh() {
      lock.textContent = `Locked: ${activeKey()} · ${activeScale()}`;
      buildAnswerButtons();
      updateQuestionLine();
    },
    stop,
    destroy() {
      stop();
      playBtn.removeEventListener('click', playQuestion);
      replayBtn.removeEventListener('click', replay);
      nextBtn.removeEventListener('click', playQuestion);
      shell.destroy();
    },
  };
}
