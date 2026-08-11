/**
 * Contextual music inspector. Pure inspect() model and a compact DOM renderer.
 * Derives facts from the shared theory engine. Surfaces universal study actions.
 */

import { parseNote, INTERVAL_LABELS, NOTE_NAMES_SHARP } from '../theory.js';
import { SCALES, getScaleNotes } from '../scales.js';
import { CHORDS, getChordNotes } from '../chords.js';
import { TUNING_CATALOG, pitchToMidi } from '../tunings.js';
import { getMusicContext } from './musicContext.js';
import { formatRoute } from '../routes.js';
import { conceptLabel } from '../genreProfiles.js';
import { studiesForConcept } from '../studyCatalog.js';

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PIANO_START = 21;
const PIANO_END = 108;

export const INSPECTOR_ACTIONS = Object.freeze({
  practice: Object.freeze({ id: 'practice', label: 'Practice this' }),
  quiz: Object.freeze({ id: 'quiz', label: 'Quiz this' }),
  map: Object.freeze({ id: 'map', label: 'Map on fretboard' }),
  hear: Object.freeze({ id: 'hear', label: 'Hear it' }),
  progression: Object.freeze({ id: 'progression', label: 'Use in a progression' }),
  add: Object.freeze({ id: 'add', label: 'Add to a routine or workbook' }),
});

const CONCEPT_DRILLS = {
  major_scale: 'scales',
  natural_minor: 'scales',
  harmonic_minor: 'scales',
  modal_comparison: 'scales',
  interval_locations: 'intervals',
  fretboard_transfer: 'fretboard',
  major_minor_triads: 'chord-workout',
  triad_inversions: 'chord-workout',
  diatonic_harmony: 'chord-workout',
  root_blind_quality: 'ear',
  flat2: 'intervals',
  tritone: 'intervals',
  flat3: 'intervals',
};

const MODE_NAMES = [
  'Ionian',
  'Dorian',
  'Phrygian',
  'Lydian',
  'Mixolydian',
  'Aeolian',
  'Locrian',
];

function normPc(value) {
  return ((Number(value) % 12) + 12) % 12;
}

function pcName(pc, preference = 'sharps') {
  const idx = normPc(pc);
  if (preference === 'flats') return FLAT_NAMES[idx];
  return NOTE_NAMES_SHARP[idx];
}

function midiName(midi, preference = 'sharps') {
  const oct = Math.floor(midi / 12) - 1;
  return `${pcName(midi, preference)}${oct}`;
}

function contextOrDefaults(ctx) {
  const music = getMusicContext();
  return {
    root: ctx?.root || music.root,
    scaleId: ctx?.scaleId || music.scaleId,
    tuningId: ctx?.tuningId || music.tuningId,
    keySignaturePreference: ctx?.keySignaturePreference || music.keySignaturePreference,
  };
}

function rootParsed(root, preference) {
  const parsed = parseNote(root);
  if (!parsed) return null;
  return { ...parsed, display: pcName(parsed.semi, preference) };
}

function semitonesBetween(fromPc, toPc) {
  return normPc(toPc - fromPc);
}

function intervalLabel(semitones) {
  return INTERVAL_LABELS[semitones] || `${semitones} st`;
}

function scaleDegrees(root, scaleId) {
  const notes = getScaleNotes(root, scaleId);
  if (!notes) return [];
  const rootP = parseNote(root);
  if (!rootP) return [];
  return notes.map((name, idx) => {
    const p = parseNote(name);
    return {
      degree: idx + 1,
      name,
      pc: p ? p.semi : null,
      semitones: p ? semitonesBetween(rootP.semi, p.semi) : null,
      interval: p ? intervalLabel(semitonesBetween(rootP.semi, p.semi)) : null,
    };
  });
}

function degreeForPc(pc, root, scaleId) {
  const degrees = scaleDegrees(root, scaleId);
  const hit = degrees.find((d) => d.pc === normPc(pc));
  if (!hit) return null;
  return {
    degree: hit.degree,
    name: hit.name,
    interval: hit.interval,
  };
}

function chordTonePcs(root, quality) {
  const notes = getChordNotes(root, quality);
  if (!notes) return [];
  return notes.map((n) => {
    const p = parseNote(n);
    return p ? p.semi : null;
  }).filter((v) => v != null);
}

function chordMembership(pc, root, quality) {
  const tones = chordTonePcs(root, quality);
  const npc = normPc(pc);
  const inChord = tones.includes(npc);
  const rootP = parseNote(root);
  if (!rootP) return { inChord, role: null };
  const semi = semitonesBetween(rootP.semi, npc);
  const def = CHORDS[quality];
  let role = null;
  if (def) {
    const hit = def.tones.find(([, s]) => normPc(rootP.semi + (s % 12)) === npc || s % 12 === semi);
    role = hit ? hit[2] : null;
  }
  return { inChord, role };
}

function presetByTuningId(tuningId) {
  return TUNING_CATALOG.find((p) => p.id === tuningId) || TUNING_CATALOG[0];
}

function guitarPositionsForPc(pc, tuningId, maxFret = 15) {
  const preset = presetByTuningId(tuningId);
  const npc = normPc(pc);
  const positions = [];
  preset.pitches.forEach((pitch, stringIdx) => {
    const openMidi = pitchToMidi(pitch);
    for (let fret = 0; fret <= maxFret; fret += 1) {
      if (normPc(openMidi + fret) === npc) {
        positions.push({
          string: stringIdx + 1,
          fret,
          label: `${stringIdx + 1}:${fret}`,
        });
        break;
      }
    }
  });
  return positions;
}

function pianoKeyForMidi(midi, preference) {
  if (midi < PIANO_START || midi > PIANO_END) {
    return { inRange: false, label: midiName(midi, preference) };
  }
  const white = [0, 2, 4, 5, 7, 9, 11];
  const isBlack = !white.includes(normPc(midi));
  return {
    inRange: true,
    label: midiName(midi, preference),
    blackKey: isBlack,
  };
}

function staffHint(midi) {
  const ref = 60;
  const steps = Math.round((midi - ref) / 2);
  const lines = ['ledger below', 'line 1', 'space 1', 'line 2', 'space 2', 'line 3', 'space 3', 'line 4', 'space 4', 'line 5', 'ledger above'];
  const idx = Math.max(0, Math.min(lines.length - 1, 5 + steps));
  return { clef: 'treble', position: lines[idx] };
}

function relatedScales(root, scaleId) {
  const notes = getScaleNotes(root, scaleId);
  if (!notes) return [];
  const pcs = new Set(notes.map((n) => {
    const p = parseNote(n);
    return p ? p.semi : null;
  }).filter((v) => v != null));

  const related = [];
  if (scaleId === 'Major (Ionian)') {
    MODE_NAMES.forEach((mode, idx) => {
      const name = idx === 0 ? 'Major (Ionian)'
        : idx === 5 ? 'Natural Minor (Aeolian)'
          : mode;
      if (SCALES[name]) related.push({ scaleId: name, relation: `${mode} mode` });
    });
    return related.slice(0, 5);
  }

  for (const [id] of Object.entries(SCALES)) {
    if (id === scaleId) continue;
    const other = getScaleNotes(root, id);
    if (!other) continue;
    const otherPcs = other.map((n) => {
      const p = parseNote(n);
      return p ? p.semi : null;
    }).filter((v) => v != null);
    const overlap = otherPcs.filter((pc) => pcs.has(pc)).length;
    if (overlap >= Math.min(pcs.size, otherPcs.length) - 1) {
      related.push({ scaleId: id, relation: `${overlap} shared tones` });
    }
    if (related.length >= 4) break;
  }
  return related;
}

function drillForConcept(conceptId) {
  return CONCEPT_DRILLS[conceptId] || 'scales';
}

function buildActions(selection, facts, ctx) {
  const actions = [];
  const kind = selection?.kind;

  const practiceRoute = () => {
    if (kind === 'concept') {
      const drill = drillForConcept(selection.conceptId);
      return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill } });
    }
    if (kind === 'chord') {
      return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'chord-workout' } });
    }
    if (kind === 'scale') {
      return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'scales' } });
    }
    if (kind === 'interval' || kind === 'note' || kind === 'pitch-class' || kind === 'guitar-position') {
      return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'intervals' } });
    }
    return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'scales' } });
  };

  const quizRoute = () => {
    if (kind === 'concept') {
      const drill = drillForConcept(selection.conceptId);
      if (drill === 'ear') {
        return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'ear' } });
      }
      return formatRoute({ objective: 'study', view: 'review' });
    }
    if (kind === 'chord') {
      return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'chord-workout' } });
    }
    return formatRoute({ objective: 'train', view: 'fundamentals', params: { drill: 'intervals' } });
  };

  actions.push({
    ...INSPECTOR_ACTIONS.practice,
    route: practiceRoute(),
  });

  actions.push({
    ...INSPECTOR_ACTIONS.quiz,
    route: quizRoute(),
  });

  if (['note', 'pitch-class', 'guitar-position', 'chord', 'scale', 'interval', 'concept'].includes(kind)) {
    actions.push({
      ...INSPECTOR_ACTIONS.map,
      route: formatRoute({ objective: 'study', view: 'explore', params: { view: 'fretboard' } }),
    });
  }

  if (['note', 'pitch-class', 'guitar-position', 'chord', 'scale', 'interval', 'concept'].includes(kind)) {
    actions.push({
      ...INSPECTOR_ACTIONS.hear,
      route: null,
      play: facts.playback,
    });
  }

  if (['chord', 'scale', 'concept'].includes(kind)) {
    actions.push({
      ...INSPECTOR_ACTIONS.progression,
      route: formatRoute({ objective: 'create', view: 'compose' }),
    });
  }

  if (['concept', 'chord', 'scale'].includes(kind)) {
    actions.push({
      ...INSPECTOR_ACTIONS.add,
      route: formatRoute({ objective: 'train', view: 'library', params: { type: 'workbook' } }),
    });
  }

  return actions;
}

/**
 * @param {object} selection
 * @param {object} [ctx]
 * @returns {object}
 */
export function inspect(selection, ctx = null) {
  if (!selection || !selection.kind) {
    return {
      title: 'Nothing selected',
      summary: 'Pick a note, chord, or concept to inspect.',
      facts: [],
      actions: [],
      selection: null,
    };
  }

  const music = contextOrDefaults(ctx);
  const preference = music.keySignaturePreference;
  const facts = [];
  let title = 'Selection';
  let summary = '';
  let playback = null;

  if (selection.kind === 'note') {
    const midi = Number(selection.midi);
    const pc = normPc(midi);
    const name = midiName(midi, preference);
    const rootP = rootParsed(music.root, preference);
    const interval = rootP ? intervalLabel(semitonesBetween(rootP.semi, pc)) : null;
    const degree = degreeForPc(pc, music.root, music.scaleId);
    facts.push({ label: 'Note', value: name });
    facts.push({ label: 'Pitch class', value: pcName(pc, preference) });
    if (interval) facts.push({ label: 'Interval from root', value: interval });
    if (degree) facts.push({ label: 'Scale degree', value: `${degree.degree} (${degree.name})` });
    const positions = guitarPositionsForPc(pc, music.tuningId);
    if (positions.length) facts.push({ label: 'Guitar', value: positions.map((p) => p.label).join(', ') });
    facts.push({ label: 'Piano', value: pianoKeyForMidi(midi, preference).label });
    facts.push({ label: 'Staff', value: `${staffHint(midi).clef}, ${staffHint(midi).position}` });
    title = name;
    summary = interval ? `${interval} above ${music.root}` : pcName(pc, preference);
    playback = { midis: [midi] };
  } else if (selection.kind === 'pitch-class') {
    const pc = normPc(selection.pc);
    const name = pcName(pc, preference);
    const rootP = rootParsed(music.root, preference);
    const interval = rootP ? intervalLabel(semitonesBetween(rootP.semi, pc)) : null;
    const degree = degreeForPc(pc, music.root, music.scaleId);
    facts.push({ label: 'Pitch class', value: name });
    if (interval) facts.push({ label: 'Interval from root', value: interval });
    if (degree) facts.push({ label: 'Scale degree', value: `${degree.degree} (${degree.name})` });
    const positions = guitarPositionsForPc(pc, music.tuningId);
    if (positions.length) facts.push({ label: 'Guitar', value: positions.map((p) => p.label).join(', ') });
    title = name;
    summary = interval ? `${interval} above ${music.root}` : name;
    const baseMidi = 12 * 4 + pc;
    playback = { midis: [baseMidi] };
  } else if (selection.kind === 'guitar-position') {
    const preset = presetByTuningId(selection.tuningId || music.tuningId);
    const stringIdx = Number(selection.string) - 1;
    const fret = Number(selection.fret);
    const pitch = preset.pitches[stringIdx];
    const midi = pitch ? pitchToMidi(pitch) + fret : null;
    const inner = midi != null
      ? inspect({ kind: 'note', midi }, ctx)
      : { facts: [], summary: '', title: 'Guitar position' };
    facts.push({ label: 'String', value: String(selection.string) });
    facts.push({ label: 'Fret', value: String(selection.fret) });
    facts.push(...inner.facts);
    title = inner.title || `String ${selection.string}, fret ${selection.fret}`;
    summary = inner.summary || title;
    playback = inner.playback || (midi != null ? { midis: [midi] } : null);
  } else if (selection.kind === 'chord') {
    const root = selection.root || music.root;
    const quality = selection.quality;
    const def = CHORDS[quality];
    const notes = getChordNotes(root, quality) || [];
    facts.push({ label: 'Chord', value: `${root}${def?.sym || ''}` });
    facts.push({ label: 'Quality', value: quality });
    facts.push({ label: 'Tones', value: notes.join(' · ') });
    const scaleNotes = getScaleNotes(root, music.scaleId) || [];
    const chordPcs = chordTonePcs(root, quality);
    const diatonic = chordPcs.every((pc) => scaleNotes.some((n) => {
      const p = parseNote(n);
      return p && p.semi === pc;
    }));
    facts.push({ label: 'In current scale', value: diatonic ? 'Yes' : 'No' });
    title = `${root}${def?.sym || ''}`;
    summary = quality;
    const rootP = parseNote(root);
    if (rootP && def) {
      const baseMidi = 12 * 3 + rootP.semi;
      playback = { midis: def.tones.map(([, so]) => baseMidi + so) };
    }
  } else if (selection.kind === 'scale') {
    const root = selection.root || music.root;
    const scaleId = selection.scaleId || music.scaleId;
    const notes = getScaleNotes(root, scaleId) || [];
    facts.push({ label: 'Scale', value: scaleId });
    facts.push({ label: 'Root', value: root });
    facts.push({ label: 'Degrees', value: notes.join(' · ') });
    const rel = relatedScales(root, scaleId);
    if (rel.length) facts.push({ label: 'Related', value: rel.map((r) => r.scaleId).join(', ') });
    title = `${root} ${scaleId}`;
    summary = `${notes.length} notes`;
    const rootP = parseNote(root);
    if (rootP) {
      const def = SCALES[scaleId];
      const baseMidi = 12 * 3 + rootP.semi;
      playback = { midis: def ? def.map(([, so]) => baseMidi + so).slice(0, 8) : [baseMidi] };
    }
  } else if (selection.kind === 'interval') {
    const from = selection.from || music.root;
    const semi = normPc(Number(selection.semitones));
    const fromP = parseNote(from);
    const toPc = fromP ? normPc(fromP.semi + semi) : semi;
    const label = intervalLabel(semi);
    const toName = pcName(toPc, preference);
    facts.push({ label: 'From', value: from });
    facts.push({ label: 'Interval', value: label });
    facts.push({ label: 'Target', value: toName });
    title = label;
    summary = `${from} → ${toName}`;
    if (fromP) playback = { midis: [12 * 3 + fromP.semi, 12 * 3 + fromP.semi + semi] };
  } else if (selection.kind === 'concept') {
    const label = conceptLabel(selection.conceptId);
    const studies = studiesForConcept(selection.conceptId);
    facts.push({ label: 'Concept', value: label });
    if (studies.length) {
      facts.push({ label: 'Study paths', value: studies.slice(0, 3).map((s) => s.title).join(', ') });
    }
    title = label;
    summary = studies[0]?.summary || 'Study concept';
    const rootP = parseNote(music.root);
    if (rootP) playback = { midis: [12 * 3 + rootP.semi] };
  }

  const actions = buildActions(selection, { playback }, music);

  return {
    title,
    summary,
    facts,
    actions,
    selection,
    playback,
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function playMidis(midis) {
  if (typeof window === 'undefined' || !Array.isArray(midis) || !midis.length) return;
  const { ensureAudio, midiFreq, getAnalyserDestination, audioCtx } = await import('../audio.js');
  ensureAudio();
  const now = audioCtx.currentTime;
  const vol = 0.12 / Math.max(1, midis.length);
  midis.forEach((midi, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const freq = midiFreq(midi);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(start);
    osc.stop(start + 0.75);
  });
}

/**
 * @param {Element} host
 * @param {{ onNavigate?: (route: string) => void, onClose?: () => void, getContext?: () => object }} [opts]
 */
export function mountInspector(host, opts = {}) {
  const panel = document.createElement('aside');
  panel.className = 'music-inspector';
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'Music inspector');
  panel.innerHTML = `
    <header class="music-inspector-head">
      <div>
        <div class="music-inspector-kicker">Inspector</div>
        <h3 class="music-inspector-title" id="mi-title">—</h3>
        <p class="music-inspector-summary" id="mi-summary"></p>
      </div>
      <button type="button" class="music-inspector-close" aria-label="Close inspector">×</button>
    </header>
    <dl class="music-inspector-facts" id="mi-facts"></dl>
    <div class="music-inspector-actions" id="mi-actions" role="group" aria-label="Concept actions"></div>
  `;
  host.appendChild(panel);

  const titleEl = panel.querySelector('#mi-title');
  const summaryEl = panel.querySelector('#mi-summary');
  const factsEl = panel.querySelector('#mi-facts');
  const actionsEl = panel.querySelector('#mi-actions');
  const closeBtn = panel.querySelector('.music-inspector-close');

  let currentModel = null;

  function renderActions(actions) {
    actionsEl.innerHTML = '';
    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `music-inspector-action music-inspector-action--${action.id}`;
      btn.textContent = action.label;
      btn.onclick = () => {
        if (action.id === INSPECTOR_ACTIONS.hear.id && action.play?.midis) {
          playMidis(action.play.midis);
          return;
        }
        if (action.route && opts.onNavigate) opts.onNavigate(action.route);
      };
      actionsEl.appendChild(btn);
    });
  }

  function render(model) {
    currentModel = model;
    titleEl.textContent = model.title || '—';
    summaryEl.textContent = model.summary || '';
    factsEl.innerHTML = (model.facts || []).map((f) => `
      <div class="music-inspector-fact">
        <dt>${escapeHtml(f.label)}</dt>
        <dd>${escapeHtml(f.value)}</dd>
      </div>
    `).join('');
    renderActions(model.actions || []);
    panel.hidden = !model.selection;
  }

  closeBtn.onclick = () => {
    panel.hidden = true;
    opts.onClose?.();
  };

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      panel.hidden = true;
      opts.onClose?.();
    }
  });

  return {
    update(selection) {
      const ctx = opts.getContext?.() || null;
      render(inspect(selection, ctx));
      panel.hidden = false;
    },
    destroy() {
      panel.remove();
      currentModel = null;
    },
  };
}
