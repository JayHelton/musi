import { SCALES } from './scales.js';
import { ROOTS } from './theory.js';
import { setContext } from './musicalContext.js';
import { shortScaleName } from './contextBar.js';

// A Raycast/VS Code style global launcher. It indexes tools, scales, modes,
// keys, chord shortcuts and quick actions so power users can jump anywhere with
// a few keystrokes instead of hunting through the navigation dock.

const TOOL_TITLES = {
  scales: 'Scale Quiz',
  intervals: 'Interval Quiz',
  sightreading: 'Sight Reading',
  scaleref: 'Scale Finder',
  chords: 'Chord Builder',
  circle: 'Circle of Fifths',
  keyboard: 'Keyboard',
  metronome: 'Metronome',
  fretboard: 'Fretboard Trainer',
  tuner: 'Pitch / Tuner',
  ear: 'Ear Trainer',
  timing: 'Timing Drill',
  recorder: 'Recorder',
  songwriter: 'Songwriting',
  notes: 'Notes',
  practice: 'Practice Timer',
  exercises: 'Exercises',
  drums: 'Drums',
  tabanalyzer: 'Tab Analyzer',
};

const TOOL_KEYWORDS = {
  scales: 'spell scale quiz drill practice',
  intervals: 'interval quiz drill recognition',
  sightreading: 'sight reading staff notation clef treble bass note',
  scaleref: 'scale finder reference modes explorer 3nps guitar diatonic',
  chords: 'chord builder analyzer analyser voicing identify',
  circle: 'circle of fifths key signature relative minor',
  keyboard: 'keyboard piano keys notes drone play wave synth',
  metronome: 'metronome tempo bpm click time signature beat',
  fretboard: 'fretboard guitar tuning frets notes intervals',
  tuner: 'pitch tuner vocal microphone reference tone intonation cents',
  ear: 'ear training aural pitch interval degree',
  timing: 'timing rhythm tempo bpm click track metronome thumb tap pocket early late fast slow',
  recorder: 'recorder record audio capture pitch take voice',
  songwriter: 'songwriting lyrics notepad write song demo vocal recording compose',
  notes: 'notes notepad practice notes ideas reminders text journal write',
  practice: 'practice timer countdown stopwatch alarm metronome tempo plan bpm schedule interval session',
  exercises: 'exercises media library pdf audio video lesson links',
  drums: 'drums drum machine beat fill groove rhythm tab sequencer kick snare hihat metal rock punk blast beat practice',
  tabanalyzer: 'tab analyzer analyser guitar bass tablature key tonal center chord progression scale mode arpeggio technique riff solo pdf import breakdown',
};

const MODE_NAMES = new Set([
  'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian',
  'Major (Ionian)', 'Natural Minor (Aeolian)',
]);

const CHORD_SHORTCUTS = [
  { label: 'Major 7th chord', keywords: 'maj7 major seventh' },
  { label: 'Minor 7th chord', keywords: 'm7 minor seventh' },
  { label: 'Dominant 7th chord', keywords: 'dom7 7 dominant seventh' },
  { label: 'Half-diminished chord', keywords: 'm7b5 half diminished' },
  { label: 'Diminished 7th chord', keywords: 'dim7 diminished' },
  { label: 'Altered / extended chord', keywords: 'altered extended 9 11 13 sharp flat analyze' },
];

let overlay, input, list;
let entries = [];
let filtered = [];
let activeIndex = 0;
let showSectionFn = null;
let built = false;

function buildEntries(tabs) {
  const out = [];

  out.push({
    kind: 'Tool',
    title: 'Home',
    sub: 'All tools',
    haystack: 'home dashboard tools start menu'.toLowerCase(),
    run: () => showSectionFn('home'),
  });

  tabs.forEach(t => {
    out.push({
      kind: 'Tool',
      title: TOOL_TITLES[t.id] || t.label,
      sub: t.group,
      haystack: `${TOOL_TITLES[t.id] || t.label} ${t.label} ${TOOL_KEYWORDS[t.id] || ''}`.toLowerCase(),
      run: () => showSectionFn(t.id),
    });
  });

  Object.keys(SCALES).forEach(name => {
    const isMode = MODE_NAMES.has(name);
    out.push({
      kind: isMode ? 'Mode' : 'Scale',
      title: shortScaleName(name),
      sub: 'Open in Scale Finder',
      haystack: `${name} ${shortScaleName(name)} scale mode`.toLowerCase(),
      run: () => { setContext({ scale: name }, 'palette'); showSectionFn('scaleref'); },
    });
  });

  ROOTS.forEach(root => {
    out.push({
      kind: 'Key',
      title: `Key of ${root}`,
      sub: 'Set global context',
      haystack: `key ${root} root tonic`.toLowerCase(),
      run: () => { setContext({ root }, 'palette'); showSectionFn('scaleref'); },
    });
  });

  CHORD_SHORTCUTS.forEach(c => {
    out.push({
      kind: 'Chord',
      title: c.label,
      sub: 'Open Chord Builder',
      haystack: `${c.label} ${c.keywords} chord`.toLowerCase(),
      run: () => showSectionFn('chords'),
    });
  });

  out.push({
    kind: 'Action',
    title: 'Edit musical context',
    sub: 'Change key, mode or tempo',
    haystack: 'context key mode tempo bpm edit change'.toLowerCase(),
    run: () => { const p = document.getElementById('context-pill'); if (p) p.click(); },
  });

  return out;
}

function scoreEntry(entry, query) {
  if (!query) return 1;
  const hay = entry.haystack;
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const tok of tokens) {
    const idx = hay.indexOf(tok);
    if (idx === -1) return -1;
    score += idx === 0 ? 3 : hay.includes(' ' + tok) ? 2 : 1;
  }
  if (entry.title.toLowerCase().startsWith(query)) score += 5;
  return score;
}

function render() {
  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = '<div class="cmd-empty">No matches</div>';
    return;
  }
  let lastKind = null;
  filtered.forEach((entry, i) => {
    if (entry.kind !== lastKind) {
      lastKind = entry.kind;
      const head = document.createElement('div');
      head.className = 'cmd-group';
      head.textContent = entry.kind;
      list.appendChild(head);
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cmd-item' + (i === activeIndex ? ' active' : '');
    row.dataset.index = i;
    row.innerHTML = `<span class="cmd-item-title">${entry.title}</span><span class="cmd-item-sub">${entry.sub}</span>`;
    row.onclick = () => activate(i);
    row.onmousemove = () => setActive(i);
    list.appendChild(row);
  });
}

function setActive(i) {
  activeIndex = Math.max(0, Math.min(filtered.length - 1, i));
  list.querySelectorAll('.cmd-item').forEach(el =>
    el.classList.toggle('active', Number(el.dataset.index) === activeIndex));
  const el = list.querySelector('.cmd-item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function activate(i) {
  const entry = filtered[i];
  if (!entry) return;
  close();
  entry.run();
}

function update() {
  const query = input.value.trim().toLowerCase();
  filtered = entries
    .map(e => ({ e, s: scoreEntry(e, query) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, query ? 30 : 12)
    .map(x => x.e);
  activeIndex = 0;
  render();
}

function open() {
  if (!built) return;
  overlay.classList.add('visible');
  input.value = '';
  update();
  setTimeout(() => input.focus(), 30);
}

function close() {
  if (!built) return;
  overlay.classList.remove('visible');
}

function isOpen() {
  return built && overlay.classList.contains('visible');
}

function buildDom() {
  overlay = document.createElement('div');
  overlay.className = 'cmd-overlay';
  overlay.id = 'cmd-overlay';
  overlay.innerHTML = `
    <div class="cmd-panel" role="dialog" aria-label="Command palette">
      <div class="cmd-search-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cmd-search-icon" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" class="cmd-input" id="cmd-input" placeholder="Search tools, scales, modes, chords..." autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search">
        <kbd class="cmd-kbd">esc</kbd>
      </div>
      <div class="cmd-list" id="cmd-list"></div>
    </div>`;
  document.body.appendChild(overlay);

  input = overlay.querySelector('#cmd-input');
  list = overlay.querySelector('#cmd-list');

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(activeIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
}

export function initCommandPalette({ showSection, tabs }) {
  showSectionFn = showSection;
  buildDom();
  entries = buildEntries(tabs);
  built = true;

  const trigger = document.getElementById('command-trigger');
  if (trigger) trigger.onclick = open;

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen() ? close() : open();
    }
  });
}
