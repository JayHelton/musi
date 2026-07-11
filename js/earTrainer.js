import { audioCtx, ensureAudio, midiFreq, getAnalyserDestination } from './audio.js';
import { parseNote, spellNote, NOTE_NAMES_SHARP, pick, INTERVAL_LABELS } from './theory.js';
import { SCALES, getScaleNotes } from './scales.js';
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext, advanceContext } from './musicalContext.js';
import { recordAttempt } from './stats.js';

const EAR_FADE_START_MS = 1100;
const CONTEXTS = [
  { val: 'root', label: 'Root first' },
  { val: 'single', label: 'Single tone' },
  { val: 'melodic', label: 'Melodic interval' },
];
const POOLS = [
  { val: 'diatonic', label: 'Diatonic' },
  { val: 'chromatic', label: 'Chromatic' },
];
const ANSWERS = [
  { val: 'note', label: 'Note' },
  { val: 'degree', label: 'Degree' },
  { val: 'interval', label: 'Interval' },
];
const EXERCISES = [
  { val: 'tones', label: 'Notes / intervals' },
  { val: 'modal-progressions', label: 'Modal progressions' },
];
const OCTAVES = [
  { val: '3', label: '3' },
  { val: '4', label: '4' },
  { val: '5', label: '5' },
  { val: 'random', label: 'Random' },
];

const MODAL_ANSWER_MODES = ['Lydian', 'Mixolydian', 'Dorian', 'Phrygian'];
const MINOR_FAMILY_SCALES = new Set([
  'Natural Minor (Aeolian)',
  'Dorian',
  'Phrygian',
  'Locrian',
  'Harmonic Minor',
  'Melodic Minor (Asc)',
  'Minor Pentatonic',
  'Blues',
  'Hungarian Minor',
  'Neapolitan Minor',
]);
const CHORD_QUALITIES = {
  maj: { sym: '', semis: [0, 4, 7] },
  min: { sym: 'm', semis: [0, 3, 7] },
  dom7: { sym: '7', semis: [0, 4, 7, 10] },
  maj7: { sym: 'maj7', semis: [0, 4, 7, 11] },
  min7: { sym: 'm7', semis: [0, 3, 7, 10] },
};
const MODAL_PROGRESSIONS = {
  Lydian: [
    {
      name: 'major lift',
      source: 'major',
      chords: [
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 7, quality: 'maj', numeral: 'V' },
        { semi: 9, quality: 'min', numeral: 'vi' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 0, quality: 'maj7', numeral: 'Imaj7' },
        { semi: 2, quality: 'maj', numeral: 'II' },
        { semi: 7, quality: 'maj', numeral: 'V' },
        { semi: 0, quality: 'maj', numeral: 'I' },
      ],
      change: { interval: 6, label: '#4', chordIndex: 5, text: 'The II major chord carries the raised 4th.' },
    },
    {
      name: 'cinematic Lydian',
      source: 'major',
      chords: [
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 7, quality: 'maj', numeral: 'V' },
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 0, quality: 'maj7', numeral: 'Imaj7' },
        { semi: 2, quality: 'maj', numeral: 'II' },
        { semi: 0, quality: 'maj7', numeral: 'Imaj7' },
        { semi: 7, quality: 'maj', numeral: 'V' },
      ],
      change: { interval: 6, label: '#4', chordIndex: 5, text: 'The II major chord introduces the Lydian raised 4th.' },
    },
  ],
  Mixolydian: [
    {
      name: 'classic bVII',
      source: 'major',
      chords: [
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 7, quality: 'maj', numeral: 'V' },
        { semi: 9, quality: 'min', numeral: 'vi' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 0, quality: 'dom7', numeral: 'I7' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 0, quality: 'maj', numeral: 'I' },
      ],
      change: { interval: 10, label: 'b7', chordIndex: 5, text: 'The bVII chord centers the lowered 7th.' },
    },
    {
      name: 'folk rock turn',
      source: 'major',
      chords: [
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 4, quality: 'min', numeral: 'iii' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 7, quality: 'maj', numeral: 'V' },
        { semi: 0, quality: 'maj', numeral: 'I' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 0, quality: 'dom7', numeral: 'I7' },
      ],
      change: { interval: 10, label: 'b7', chordIndex: 5, text: 'The bVII chord reveals the Mixolydian lowered 7th.' },
    },
  ],
  Dorian: [
    {
      name: 'minor to Dorian vamp',
      source: 'minor',
      chords: [
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 8, quality: 'maj', numeral: 'bVI' },
        { semi: 3, quality: 'maj', numeral: 'bIII' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 0, quality: 'min7', numeral: 'i7' },
        { semi: 5, quality: 'maj', numeral: 'IV' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 0, quality: 'min', numeral: 'i' },
      ],
      change: { interval: 9, label: '6', chordIndex: 5, text: 'The IV major chord carries the natural 6.' },
    },
    {
      name: 'soul minor color',
      source: 'minor',
      chords: [
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 3, quality: 'maj', numeral: 'bIII' },
        { semi: 8, quality: 'maj', numeral: 'bVI' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 0, quality: 'min7', numeral: 'i7' },
        { semi: 5, quality: 'dom7', numeral: 'IV7' },
        { semi: 0, quality: 'min7', numeral: 'i7' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
      ],
      change: { interval: 9, label: '6', chordIndex: 5, text: 'The IV7 chord makes the Dorian natural 6 audible.' },
    },
  ],
  Phrygian: [
    {
      name: 'dark bII cadence',
      source: 'minor',
      chords: [
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 8, quality: 'maj', numeral: 'bVI' },
        { semi: 3, quality: 'maj', numeral: 'bIII' },
        { semi: 7, quality: 'min', numeral: 'v' },
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 1, quality: 'maj', numeral: 'bII' },
        { semi: 10, quality: 'min', numeral: 'bvii' },
        { semi: 0, quality: 'min', numeral: 'i' },
      ],
      change: { interval: 1, label: 'b2', chordIndex: 5, text: 'The bII chord spotlights the Phrygian lowered 2nd.' },
    },
    {
      name: 'Spanish Phrygian hint',
      source: 'minor',
      chords: [
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 10, quality: 'maj', numeral: 'bVII' },
        { semi: 8, quality: 'maj', numeral: 'bVI' },
        { semi: 7, quality: 'min', numeral: 'v' },
        { semi: 0, quality: 'min', numeral: 'i' },
        { semi: 1, quality: 'maj', numeral: 'bII' },
        { semi: 3, quality: 'maj', numeral: 'bIII' },
        { semi: 0, quality: 'min', numeral: 'i' },
      ],
      change: { interval: 1, label: 'b2', chordIndex: 5, text: 'The bII chord introduces the Phrygian lowered 2nd.' },
    },
  ],
};

const ear = {
  exercise: 'tones',
  key: 'C',
  activeKey: 'C',
  scale: 'Major (Ionian)',
  context: 'root',
  pool: 'diatonic',
  answerAs: 'note',
  octave: 'random',
  targetNote: null,
  targetSemi: null,
  targetDegree: null,
  targetInterval: null,
  targetMode: null,
  modalQuestion: null,
  answered: false,
  right: 0, total: 0, streak: 0,
  _osc: null, _osc2: null, _gain: null, _stopTimer: null,
  _fadeTimer: null,
  _sequence: null, _seqTimers: [], _voices: [],
};

function earClearTimers() {
  if (ear._fadeTimer) { clearTimeout(ear._fadeTimer); ear._fadeTimer = null; }
}

function clearSeqTimers() {
  if (ear._seqTimers) ear._seqTimers.forEach(clearTimeout);
  ear._seqTimers = [];
}

// Play (and remember) an ordered set of tones so the Replay button can
// reproduce exactly what the listener heard. Each tone is an absolute MIDI
// note plus a delay (ms) from the start of the sequence.
function playEarSequence(seq) {
  clearSeqTimers();
  ear._sequence = seq;
  seq.forEach(tone => {
    if (tone.delay > 0) {
      ear._seqTimers.push(setTimeout(() => playEarTone(tone.midi, tone.dur), tone.delay));
    } else {
      playEarTone(tone.midi, tone.dur);
    }
  });
}

function shortScaleName(name) {
  return name.replace('Major (Ionian)', 'Major').replace('Natural Minor (Aeolian)', 'Minor');
}

function octaveForTone() {
  if (ear.octave !== 'random') return Number(ear.octave);
  return 3 + Math.floor(Math.random() * 3);
}

function labelForPc(pc) {
  const rootP = parseNote(ear.activeKey);
  const notes = getScaleNotes(ear.activeKey, ear.scale) || [];
  const def = SCALES[ear.scale] || SCALES['Major (Ionian)'];
  if (rootP) {
    const match = def.find(([, semi]) => (rootP.semi + semi) % 12 === pc);
    if (match) {
      const idx = def.indexOf(match);
      if (notes[idx]) return notes[idx];
    }
  }
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  const flatNames = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  return flatKeys.includes(ear.activeKey) ? flatNames[pc] : NOTE_NAMES_SHARP[pc];
}

function modeFamilyForScale(scaleName) {
  return MINOR_FAMILY_SCALES.has(scaleName) ? 'minor' : 'major';
}

function modeSourceScale(family) {
  return family === 'minor' ? 'Natural Minor (Aeolian)' : 'Major (Ionian)';
}

function chordRootLabel(tonic, chord) {
  const letterOffsets = {
    0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3,
    6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6,
  };
  return spellNote(tonic.li, tonic.semi, letterOffsets[chord.semi] || 0, chord.semi) || NOTE_NAMES_SHARP[(tonic.semi + chord.semi) % 12];
}

function chordDisplayName(tonic, chord) {
  const quality = CHORD_QUALITIES[chord.quality] || CHORD_QUALITIES.maj;
  return chordRootLabel(tonic, chord) + quality.sym;
}

function changedToneLabel(tonic, question) {
  const change = question.change;
  const note = spellNote(tonic.li, tonic.semi, change.interval === 1 ? 1 : change.interval === 6 ? 3 : change.interval === 9 ? 5 : 6, change.interval);
  return `${note || labelForPc((tonic.semi + change.interval) % 12)} (${change.label})`;
}

function modalQuestionFromContext() {
  const ctx = getContext();
  const family = modeFamilyForScale(ctx.scale);
  const candidates = family === 'minor' ? ['Dorian', 'Phrygian'] : ['Lydian', 'Mixolydian'];
  const mode = pick(candidates);
  const progression = pick(MODAL_PROGRESSIONS[mode]);
  const tonic = parseNote(ctx.root);
  if (!tonic) return null;
  const scale = modeSourceScale(family);
  const chordNames = progression.chords.map(chord => chordDisplayName(tonic, chord));
  return {
    key: ctx.root,
    tempo: ctx.tempo,
    family,
    sourceScale: scale,
    mode,
    progression,
    chords: progression.chords,
    chordNames,
    change: progression.change,
    changedTone: changedToneLabel(tonic, progression),
  };
}

function resetModalReveal() {
  const card = document.getElementById('ear-modal-card');
  const prompt = document.getElementById('ear-modal-prompt');
  const progression = document.getElementById('ear-modal-progression');
  const change = document.getElementById('ear-modal-change');
  if (!card) return;
  card.hidden = ear.exercise !== 'modal-progressions';
  if (prompt) prompt.textContent = 'Listen for the chord that changes the key color.';
  if (progression) progression.textContent = '';
  if (change) change.textContent = '';
}

function revealModalQuestion() {
  const q = ear.modalQuestion;
  if (!q) return;
  const progression = document.getElementById('ear-modal-progression');
  const change = document.getElementById('ear-modal-change');
  if (progression) {
    const splitAt = Math.floor(q.chordNames.length / 2);
    progression.innerHTML = `<span>${q.chordNames.slice(0, splitAt).join(' - ')}</span><span>${q.chordNames.slice(splitAt).join(' - ')}</span>`;
  }
  if (change) {
    const chordName = q.chordNames[q.change.chordIndex] || 'the modal chord';
    change.textContent = `${q.mode}: ${q.change.text} Changed tone: ${q.changedTone} in ${chordName}.`;
  }
}

function scalePool(rootP) {
  const def = SCALES[ear.scale] || SCALES['Major (Ionian)'];
  const notes = getScaleNotes(ear.activeKey, ear.scale) || [];
  return def.map(([letterOffset, semi], i) => ({
    semi: (rootP.semi + semi) % 12,
    degree: i + 1,
    interval: semi,
    note: notes[i] || labelForPc((rootP.semi + semi) % 12),
    letterOffset,
  }));
}

function targetPool(rootP) {
  if (ear.pool === 'chromatic' && ear.answerAs !== 'degree') {
    return Array.from({ length: 12 }, (_, semi) => ({
      semi,
      degree: null,
      interval: (semi - rootP.semi + 12) % 12,
      note: labelForPc(semi),
    }));
  }
  return scalePool(rootP);
}

function setQuestionStatus(contextLabel) {
  document.getElementById('ear-question').innerHTML =
    `<span class="highlight">${ear.activeKey}</span> · ${shortScaleName(ear.scale)} · ${contextLabel}`;
}

function clearAnswerState() {
  const answers = document.getElementById('ear-answers');
  answers.querySelectorAll('.letter-btn,.int-btn').forEach(b => {
    b.classList.remove('correct', 'wrong', 'selected');
  });
}

function chordMidiVoicing(tonicMidi, chord) {
  const quality = CHORD_QUALITIES[chord.quality] || CHORD_QUALITIES.maj;
  const rootMidi = tonicMidi + chord.semi;
  const third = quality.semis.find(semi => semi === 3 || semi === 4);
  const seventh = quality.semis.find(semi => semi === 10 || semi === 11);
  const notes = [rootMidi, rootMidi + 7];
  if (third != null) notes.push(rootMidi + third + 12);
  if (seventh != null) notes.push(rootMidi + seventh + 12);
  return notes;
}

function scheduleSoftChord(midiNotes, start, dur) {
  const noteCount = Math.max(1, midiNotes.length);
  midiNotes.forEach((midi, i) => {
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const freq = midiFreq(midi);
    const t = start + i * 0.025;
    const end = start + dur;
    const vol = 0.11 / noteCount;

    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 4, 4200), t);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2.2, 2600), end);
    filter.Q.value = 0.45;

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.12);
    gain.gain.setValueAtTime(vol * 0.86, Math.max(t + 0.13, end - 0.55));
    gain.gain.exponentialRampToValueAtTime(0.001, end + 0.35);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(t); osc.stop(end + 0.5);
    osc2.start(t); osc2.stop(end + 0.5);
    ear._voices.push({ osc, gain }, { osc: osc2, gain });
  });
}

function playModalProgression(question) {
  clearSeqTimers();
  stopEarTone();
  ensureAudio();
  ear.modalQuestion = question;

  const tonic = parseNote(question.key);
  if (!tonic) return;
  let tonicMidi = 48 + tonic.semi;
  if (tonicMidi > 58) tonicMidi -= 12;
  const beatDur = 60 / Math.max(40, Math.min(220, Number(question.tempo) || 120));
  const chordDur = Math.max(1.05, beatDur * 1.85);
  const gap = Math.max(0.04, beatDur * 0.15);
  const start = audioCtx.currentTime + 0.08;

  question.chords.forEach((chord, i) => {
    const chordStart = start + i * (chordDur + gap);
    scheduleSoftChord(chordMidiVoicing(tonicMidi, chord), chordStart, chordDur);
    ear._seqTimers.push(setTimeout(triggerPulse, Math.max(0, (chordStart - audioCtx.currentTime) * 1000)));
  });
  ear._stopTimer = setTimeout(() => stopEarTone(), (question.chords.length * (chordDur + gap) + 1) * 1000);
}

function playEarModalQuestion() {
  earClearTimers();
  if (ear.targetMode !== null || ear.total > 0) advanceContext();
  const question = modalQuestionFromContext();
  if (!question) return;

  ear.key = question.key;
  ear.activeKey = question.key;
  ear.scale = question.sourceScale;
  ear.answered = false;
  ear.targetNote = null;
  ear.targetSemi = null;
  ear.targetDegree = null;
  ear.targetInterval = null;
  ear.targetMode = question.mode;
  ear.modalQuestion = question;

  const feedback = document.getElementById('ear-feedback');
  feedback.className = 'fb-feedback';
  feedback.textContent = '';
  clearAnswerState();
  resetModalReveal();

  const familyLabel = question.family === 'minor' ? 'minor key' : 'major key';
  document.getElementById('ear-question').innerHTML =
    `<span class="highlight">${question.key}</span> ${familyLabel} &rarr; what mode?`;
  playModalProgression(question);
}

function playEarQuestion() {
  if (ear.exercise === 'modal-progressions') {
    playEarModalQuestion();
    return;
  }
  earClearTimers();
  if (ear.targetSemi !== null || ear.total > 0) advanceContext();
  const ctx = getContext();
  ear.key = ctx.root;
  ear.scale = ctx.scale;
  ear.answered = false;
  ear.targetNote = null;
  ear.targetSemi = null;
  ear.targetDegree = null;
  ear.targetInterval = null;
  ear.targetMode = null;
  ear.modalQuestion = null;
  const feedback = document.getElementById('ear-feedback');
  feedback.className = 'fb-feedback';
  feedback.textContent = '';
  clearAnswerState();
  resetModalReveal();

  ear.activeKey = ear.key;
  const tonic = parseNote(ear.activeKey);
  if (!tonic) return;
  const pool = targetPool(tonic);
  const toneDur = 1.25;
  const oct = octaveForTone();
  const baseMidi = 12 * (oct + 1);

  if (ear.context === 'melodic') {
    const first = pick(pool);
    let second = pick(pool);
    let guard = 0;
    while (second.semi === first.semi && guard++ < 20) second = pick(pool);
    const interval = (second.semi - first.semi + 12) % 12;
    ear.targetSemi = second.semi;
    ear.targetNote = second.note;
    ear.targetDegree = second.degree;
    ear.targetInterval = interval;
    // Place the second tone `interval` semitones above the first so the heard
    // interval matches the labelled answer regardless of pitch-class wrap.
    const firstMidi = baseMidi + first.semi;
    playEarSequence([
      { midi: firstMidi, dur: toneDur, delay: 0 },
      { midi: firstMidi + interval, dur: toneDur, delay: 900 },
    ]);
    setQuestionStatus('melodic interval');
    return;
  }

  const target = pick(pool);
  ear.targetSemi = target.semi;
  ear.targetNote = target.note;
  ear.targetDegree = target.degree;
  ear.targetInterval = target.interval;

  if (ear.context === 'root') {
    // Sound the target as an ascending interval above the tonic so the
    // perceived distance matches the degree/interval being tested.
    const rootMidi = baseMidi + tonic.semi;
    const intervalAboveRoot = (target.semi - tonic.semi + 12) % 12;
    playEarSequence([
      { midi: rootMidi, dur: toneDur, delay: 0 },
      { midi: rootMidi + intervalAboveRoot, dur: toneDur, delay: 900 },
    ]);
    setQuestionStatus('root first');
  } else {
    playEarSequence([{ midi: baseMidi + target.semi, dur: toneDur, delay: 0 }]);
    setQuestionStatus('single tone');
  }
}

function replayEarNote() {
  if (ear.exercise === 'modal-progressions') {
    if (ear.modalQuestion && ear.targetMode) playModalProgression(ear.modalQuestion);
    return;
  }
  if (!ear._sequence || ear.targetSemi === null) return;
  // Replay the exact tones from the current question (same notes, octaves and
  // timing) rather than re-rolling a new octave/sequence.
  playEarSequence(ear._sequence);
}

function triggerPulse() {
  const wrap = document.getElementById('ear-ripple-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="ear-pulse"></div>';
  setTimeout(() => { wrap.innerHTML = ''; }, 650);
}

function playEarTone(midi, duration) {
  if (ear._stopTimer) clearTimeout(ear._stopTimer);
  stopEarTone();
  ensureAudio();
  triggerPulse();
  const dur = duration || 1.2;
  const freq = midiFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 4, 5000);
  filter.Q.value = 0.5;

  const sustain = dur * 0.6;
  const release = dur * 0.35;
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
  gain.gain.setValueAtTime(0.15, t + sustain);
  gain.gain.exponentialRampToValueAtTime(0.001, t + sustain + release);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(getAnalyserDestination());
  osc.start(t);
  osc2.start(t);
  ear._osc = osc;
  ear._osc2 = osc2;
  ear._gain = gain;
  ear._stopTimer = setTimeout(() => stopEarTone(), (sustain + release + 0.1) * 1000);
}

function stopEarTone() {
  earClearTimers();
  if (ear._stopTimer) { clearTimeout(ear._stopTimer); ear._stopTimer = null; }
  if (ear._voices.length && audioCtx) {
    const t = audioCtx.currentTime;
    ear._voices.forEach(v => {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.001), t);
        v.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        setTimeout(() => { try { v.osc.stop(); } catch(e) {} }, 150);
      } catch(e) {}
    });
    ear._voices = [];
  }
  if (ear._osc) {
    try {
      const t = audioCtx.currentTime;
      ear._gain.gain.setValueAtTime(ear._gain.gain.value, t);
      ear._gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const o1 = ear._osc, o2 = ear._osc2;
      setTimeout(() => { try { o1.stop(); o2.stop(); } catch(e) {} }, 150);
    } catch(e) {}
    ear._osc = null; ear._osc2 = null; ear._gain = null;
  }
}

function expectedAnswer() {
  if (ear.exercise === 'modal-progressions') return ear.targetMode;
  if (ear.answerAs === 'degree') return String(ear.targetDegree);
  if (ear.answerAs === 'interval') return INTERVAL_LABELS[ear.targetInterval] || `${ear.targetInterval} st`;
  return ear.targetNote;
}

function answerCorrect(answer) {
  if (ear.exercise === 'modal-progressions') return answer === ear.targetMode;
  if (ear.answerAs === 'degree') return Number(answer) === ear.targetDegree;
  if (ear.answerAs === 'interval') return Number(answer) === ear.targetInterval;
  return Number(answer) === ear.targetSemi;
}

function checkEarAnswer(answer, btn) {
  if (ear.answered || (ear.exercise === 'modal-progressions' ? !ear.targetMode : ear.targetSemi === null)) return;
  ear.answered = true;
  ear.total++;

  const correct = answerCorrect(answer);
  recordAttempt('ear', correct);
  const feedback = document.getElementById('ear-feedback');

  btn.classList.add(correct ? 'correct' : 'wrong');

  if (!correct) {
    document.getElementById('ear-answers').querySelectorAll('.letter-btn,.int-btn').forEach(b => {
      if (answerCorrect(b.dataset.answer)) b.classList.add('correct');
    });
  }

  if (correct) {
    ear.right++;
    ear.streak++;
    feedback.className = 'fb-feedback show correct';
    feedback.textContent = ear.exercise === 'modal-progressions' ? `Correct: ${ear.targetMode}` : '✓';
  } else {
    ear.streak = 0;
    feedback.className = 'fb-feedback show wrong';
    feedback.textContent = `Expected: ${expectedAnswer()}`;
  }
  if (ear.exercise === 'modal-progressions') revealModalQuestion();

  document.getElementById('ear-right').textContent = ear.right;
  document.getElementById('ear-total').textContent = ear.total;
  document.getElementById('ear-streak').textContent = ear.streak;
  ear._fadeTimer = setTimeout(() => feedback.classList.add('fade-out'), EAR_FADE_START_MS);
}

let earContextSubscribed = false;

function initEarTrainer() {
  const contextScroll = document.getElementById('sl-ear-context');

  // Key and scale are inherited from the shared musical context (like the
  // drills) rather than per-tool selectors.
  const ctx = getContext();
  ear.key = ctx.root;
  ear.scale = ctx.scale;
  ear.exercise = getSetting('ear.exercise', ear.exercise, EXERCISES.map(o => o.val));
  ear.context = getSetting('ear.context', ear.context, CONTEXTS.map(o => o.val));
  ear.pool = getSetting('ear.pool', ear.pool, POOLS.map(o => o.val));
  ear.answerAs = getSetting('ear.answerAs', ear.answerAs, ANSWERS.map(o => o.val));
  ear.octave = getSetting('ear.octave', ear.octave, OCTAVES.map(o => o.val));

  if (!earContextSubscribed) {
    earContextSubscribed = true;
    subscribeContext((c, source) => {
      if (source === 'advance') {
        ear.key = c.root;
        ear.scale = c.scale;
        return;
      }
      if (c.root === ear.key && c.scale === ear.scale) return;
      ear.key = c.root;
      ear.scale = c.scale;
      buildEarAnswerButtons();
    });
  }

  if (!contextScroll.children.length) {
    buildChoiceList('sl-ear-exercise', EXERCISES, ear.exercise, val => {
      ear.exercise = val;
      saveSetting('ear.exercise', val);
      ear.targetSemi = null;
      ear.targetMode = null;
      ear.modalQuestion = null;
      clearSeqTimers();
      stopEarTone();
      resetModalReveal();
      syncEarExerciseUi();
      buildEarAnswerButtons();
      document.getElementById('ear-question').textContent = val === 'modal-progressions' ? 'Play to hear a modal chord progression.' : 'Play to start.';
    });
    buildChoiceList('sl-ear-context', CONTEXTS, ear.context, val => {
      ear.context = val;
      saveSetting('ear.context', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-pool', POOLS, ear.pool, val => {
      ear.pool = val;
      saveSetting('ear.pool', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-answer', ANSWERS, ear.answerAs, val => {
      ear.answerAs = val;
      saveSetting('ear.answerAs', val);
      buildEarAnswerButtons();
    });
    buildChoiceList('sl-ear-octave', OCTAVES, ear.octave, val => {
      ear.octave = val;
      saveSetting('ear.octave', val);
    });
  }

  syncEarExerciseUi();
  resetModalReveal();
  buildEarAnswerButtons();
}

function buildChoiceList(containerId, items, active, onPick) {
  const container = document.getElementById(containerId);
  items.forEach(({ type, val, label }) => {
    if (type === 'label') {
      const group = document.createElement('div');
      group.className = 'sl-group-label';
      group.textContent = label;
      container.appendChild(group);
      return;
    }
    const div = document.createElement('div');
    div.className = 'sl-item' + (val === active ? ' active' : '');
    div.dataset.val = val;
    div.textContent = label;
    div.onclick = () => {
      container.querySelectorAll('.sl-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      onPick(val);
    };
    container.appendChild(div);
  });
}

function buildEarAnswerButtons() {
  const answersC = document.getElementById('ear-answers');
  const label = document.getElementById('ear-answer-label');
  answersC.innerHTML = '';

  if (ear.exercise === 'modal-progressions') {
    answersC.className = 'note-btn-row ear-mode-answers';
    label.textContent = 'Mode';
    MODAL_ANSWER_MODES.forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'letter-btn mode-btn';
      btn.textContent = mode;
      btn.dataset.answer = mode;
      btn.onclick = () => checkEarAnswer(mode, btn);
      answersC.appendChild(btn);
    });
    return;
  }

  answersC.className = ear.answerAs === 'interval' ? 'int-picker' : 'note-btn-row';
  label.textContent = ear.answerAs === 'degree' ? 'Degree' : ear.answerAs === 'interval' ? 'Interval' : 'Pitch';

  ear.activeKey = ear.key;
  const rootP = parseNote(ear.activeKey);
  if (!rootP) return;

  if (ear.answerAs === 'degree') {
    scalePool(rootP).forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'letter-btn';
      btn.textContent = String(item.degree);
      btn.dataset.answer = item.degree;
      btn.onclick = () => checkEarAnswer(item.degree, btn);
      answersC.appendChild(btn);
    });
    return;
  }

  if (ear.answerAs === 'interval') {
    const intervals = ear.pool === 'chromatic'
      ? Array.from({ length: 12 }, (_, semi) => semi)
      : Array.from(new Set(scalePool(rootP).map(item => item.interval)));
    intervals.forEach(semi => {
      const btn = document.createElement('button');
      btn.className = 'int-btn';
      btn.textContent = INTERVAL_LABELS[semi] || `${semi} st`;
      btn.dataset.answer = semi;
      btn.onclick = () => checkEarAnswer(semi, btn);
      answersC.appendChild(btn);
    });
    return;
  }

  targetPool(rootP).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (item.note.length > 1 ? ' accidental' : '');
    btn.textContent = item.note;
    btn.dataset.answer = item.semi;
    btn.onclick = () => checkEarAnswer(item.semi, btn);
    answersC.appendChild(btn);
  });
}

function syncEarExerciseUi() {
  const isModal = ear.exercise === 'modal-progressions';
  document.querySelectorAll('.ear-tone-setting').forEach(el => {
    el.style.display = isModal ? 'none' : '';
  });
  const contextHead = document.querySelector('#sl-ear-context')?.previousElementSibling;
  if (contextHead) contextHead.textContent = isModal ? 'Start family' : 'Context';
}

function resetEarScore() {
  ear.right = 0; ear.total = 0; ear.streak = 0;
  document.getElementById('ear-right').textContent = 0;
  document.getElementById('ear-total').textContent = 0;
  document.getElementById('ear-streak').textContent = 0;
}

window.playEarQuestion = playEarQuestion;
window.replayEarNote = replayEarNote;
window.resetEarScore = resetEarScore;

export { initEarTrainer, stopEarTone, ear };
