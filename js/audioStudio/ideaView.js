// The idea on screen: a piano roll, the notes in order, and a small editor.
//
// The roll shows the notes against time, so a singer sees the shape of the
// line they sang. A note sits a little high in its row when the voice sang
// sharp, and a little low when it sang flat. The chips under the roll name
// each note with its cents, and a tap on a chip opens the editor for it.
//
// This file draws. `ideaModel.js` decides. The view calls `onChange` with a
// new idea after an edit and never keeps state of its own beyond the note
// that is open in the editor.

import {
  nudgeNote,
  removeNote,
  noteAtTime,
  centsText,
  ideaSummary,
} from './ideaModel.js';

const ROW_H = 11;
const GUTTER = 34;
const MIN_ROWS = 7;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

function noteClass(note) {
  const parts = ['rec-roll-note'];
  if (!note.inKey) parts.push('out-key');
  if (note.snapped) parts.push('snapped');
  if (note.edited) parts.push('edited');
  const drift = Math.abs(note.cents);
  parts.push(drift <= 10 ? 'in-tune' : (drift <= 25 ? 'close' : 'off'));
  return parts.join(' ');
}

function centsClass(cents) {
  const drift = Math.abs(cents);
  return drift <= 10 ? 'in-tune' : (drift <= 25 ? 'close' : 'off');
}

/**
 * @param {{
 *   rollEl: HTMLElement, notesEl: HTMLElement, editorEl: HTMLElement,
 *   summaryEl?: HTMLElement,
 *   onChange: (idea: Object) => void,
 * }} options
 */
export function createIdeaView({ rollEl, notesEl, editorEl, summaryEl, onChange }) {
  let idea = null;
  let openId = null;
  let playhead = null;
  let rollWidth = 640;
  let secPerPx = 0;
  let noteRects = new Map();
  let chips = new Map();

  /* ---- the roll ---- */

  function paintRoll() {
    rollEl.innerHTML = '';
    playhead = null;
    noteRects = new Map();
    const notes = idea?.notes || [];
    if (!notes.length) {
      rollEl.appendChild(el('p', { class: 'rec-seq-empty', text: 'No clear notes yet.' }));
      return;
    }

    const first = Math.min(...notes.map((n) => n.startSec));
    const last = Math.max(...notes.map((n) => n.startSec + n.durationSec));
    const span = Math.max(0.5, last - first);
    let low = Math.min(...notes.map((n) => n.midi));
    let high = Math.max(...notes.map((n) => n.midi));
    while (high - low + 1 < MIN_ROWS) { low -= 1; high += 1; }
    low -= 1;
    high += 1;
    const rows = high - low + 1;
    const height = rows * ROW_H + 8;
    rollWidth = Math.max(320, Math.round(rollEl.clientWidth || 640));
    const plotW = rollWidth - GUTTER - 8;
    secPerPx = span / plotW;

    const svg = svgEl('svg', {
      class: 'rec-roll',
      viewBox: `0 0 ${rollWidth} ${height}`,
      width: '100%',
      height,
      role: 'img',
      'aria-label': `The notes of the idea against time, ${notes.length} notes`,
    });

    const keyPcs = idea.key ? new Set(idea.key.pcs) : null;
    for (let midi = low; midi <= high; midi += 1) {
      const y = 4 + (high - midi) * ROW_H;
      const pc = ((midi % 12) + 12) % 12;
      const inKey = !keyPcs || keyPcs.has(pc);
      svg.appendChild(svgEl('rect', {
        class: `rec-roll-row${inKey ? '' : ' out-key'}${pc === 0 ? ' octave' : ''}`,
        x: GUTTER, y, width: plotW, height: ROW_H,
      }));
      if (pc === 0 || pc === 5 || pc === 9 || rows <= 14) {
        const label = svgEl('text', { class: 'rec-roll-label', x: GUTTER - 4, y: y + ROW_H - 2.5 });
        label.textContent = `${NOTE_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
        svg.appendChild(label);
      }
    }

    // Beat lines, so the timing reads against the tempo Musi found.
    if (idea.bpm > 0) {
      const beatSec = 60 / idea.bpm;
      const phase = ((idea.offsetSec || 0) - first) % beatSec;
      for (let t = phase < 0 ? phase + beatSec : phase; t < span; t += beatSec) {
        svg.appendChild(svgEl('line', {
          class: 'rec-roll-beat',
          x1: GUTTER + t / secPerPx, y1: 4, x2: GUTTER + t / secPerPx, y2: height - 4,
        }));
      }
    }

    for (const note of notes) {
      const x = GUTTER + (note.startSec - first) / secPerPx;
      const w = Math.max(3, note.durationSec / secPerPx - 1);
      // Sharp sits high in the row, flat sits low.
      const y = 4 + (high - note.midi) * ROW_H + 1.5 - (note.cents / 100) * ROW_H;
      const rect = svgEl('rect', {
        class: noteClass(note), x, y, width: w, height: ROW_H - 3, rx: 2,
        'data-id': note.id,
      });
      rect.addEventListener('click', () => openEditor(note.id));
      const title = svgEl('title');
      title.textContent = `${note.label} ${centsText(note.cents)} cents · ${note.startSec.toFixed(2)} s · ${note.durationSec.toFixed(2)} s`;
      rect.appendChild(title);
      svg.appendChild(rect);
      noteRects.set(note.id, rect);
      if (w >= 22) {
        const text = svgEl('text', { class: 'rec-roll-note-label', x: x + 3, y: y + ROW_H - 4.5 });
        text.textContent = note.label;
        text.setAttribute('pointer-events', 'none');
        svg.appendChild(text);
      }
    }

    playhead = svgEl('line', { class: 'rec-roll-playhead', x1: GUTTER, y1: 2, x2: GUTTER, y2: height - 2 });
    playhead.style.display = 'none';
    svg.appendChild(playhead);
    rollEl.appendChild(svg);
    rollEl.dataset.first = String(first);
  }

  /* ---- the chips ---- */

  function paintChips() {
    notesEl.innerHTML = '';
    chips = new Map();
    const notes = idea?.notes || [];
    if (!notes.length) {
      notesEl.appendChild(el('span', { class: 'rec-seq-empty', text: 'No clear pitches detected' }));
      return;
    }
    notes.forEach((note, index) => {
      const chip = el('button', {
        type: 'button',
        class: `rec-seq-chip rec-idea-chip${note.inKey ? '' : ' out-key'}${note.id === openId ? ' open' : ''}`,
        title: `${note.startSec.toFixed(2)} s · ${note.durationSec.toFixed(2)} s`,
        'aria-label': `Note ${index + 1}, ${note.label}, ${centsText(note.cents)} cents. Open to change it.`,
        onclick: () => (openId === note.id ? closeEditor() : openEditor(note.id)),
      }, [
        el('span', { class: 'rec-idea-chip-name', text: note.label }),
        el('span', { class: `rec-idea-chip-cents ${centsClass(note.cents)}`, text: centsText(note.cents) }),
        note.snapped ? el('span', { class: 'rec-idea-chip-flag', text: 'snap' }) : null,
        note.edited ? el('span', { class: 'rec-idea-chip-flag', text: 'edit' }) : null,
      ]);
      notesEl.appendChild(chip);
      chips.set(note.id, chip);
    });
  }

  /* ---- the editor ---- */

  function paintEditor() {
    editorEl.innerHTML = '';
    const note = idea?.notes.find((n) => n.id === openId) || null;
    if (!note) {
      editorEl.hidden = true;
      openId = null;
      return;
    }
    const index = idea.notes.indexOf(note) + 1;
    const facts = [
      `Note ${index} of ${idea.notes.length}`,
      `${centsText(note.cents)} cents`,
      `${note.durationSec.toFixed(2)} s`,
      note.inKey ? 'in key' : 'outside the key',
      note.snapped ? `sung as ${NOTE_NAMES[((note.sungMidi % 12) + 12) % 12]}${Math.floor(note.sungMidi / 12) - 1}` : null,
    ].filter(Boolean).join(' · ');
    editorEl.append(
      el('div', { class: 'rec-idea-editor-head' }, [
        el('span', { class: 'rec-idea-editor-name', text: note.label }),
        el('span', { class: 'rec-idea-editor-facts', text: facts }),
      ]),
      el('div', { class: 'rec-controls rec-idea-editor-actions' }, [
        el('button', { type: 'button', class: 'btn sm', 'aria-label': 'Move this note down one semitone', onclick: () => change(nudgeNote(idea, note.id, -1)) }, '▼ Semitone'),
        el('button', { type: 'button', class: 'btn sm', 'aria-label': 'Move this note up one semitone', onclick: () => change(nudgeNote(idea, note.id, 1)) }, '▲ Semitone'),
        el('button', { type: 'button', class: 'btn sm', 'aria-label': 'Move this note down one octave', onclick: () => change(nudgeNote(idea, note.id, -12)) }, '▼ Octave'),
        el('button', { type: 'button', class: 'btn sm', 'aria-label': 'Move this note up one octave', onclick: () => change(nudgeNote(idea, note.id, 12)) }, '▲ Octave'),
        el('button', { type: 'button', class: 'btn sm rec-idea-danger', onclick: () => { const next = removeNote(idea, note.id); openId = null; change(next); } }, 'Remove'),
        el('button', { type: 'button', class: 'btn sm', onclick: () => closeEditor() }, 'Close'),
      ]),
    );
    editorEl.hidden = false;
  }

  function openEditor(id) {
    openId = id;
    paintChips();
    paintEditor();
    for (const [noteId, rect] of noteRects) rect.classList.toggle('open', noteId === id);
  }

  function closeEditor() {
    openId = null;
    paintChips();
    paintEditor();
    for (const rect of noteRects.values()) rect.classList.remove('open');
  }

  function change(next) {
    if (!next || next === idea) return;
    onChange?.(next);
  }

  /* ---- public ---- */

  function render(nextIdea) {
    idea = nextIdea;
    if (openId && !idea?.notes.some((n) => n.id === openId)) openId = null;
    if (summaryEl) summaryEl.textContent = ideaSummary(idea);
    paintRoll();
    paintChips();
    paintEditor();
    if (openId) for (const [noteId, rect] of noteRects) rect.classList.toggle('open', noteId === openId);
  }

  /**
   * Mark the moment that plays now. `sec` counts from the start of the take;
   * null clears the mark.
   */
  function setPlayhead(sec) {
    const first = Number(rollEl.dataset.first || 0);
    if (playhead) {
      if (sec == null) {
        playhead.style.display = 'none';
      } else {
        const x = GUTTER + Math.max(0, sec - first) / (secPerPx || 1);
        playhead.setAttribute('x1', x);
        playhead.setAttribute('x2', x);
        playhead.style.display = '';
      }
    }
    const current = sec == null ? null : noteAtTime(idea, sec);
    for (const [id, chip] of chips) chip.classList.toggle('active', !!current && current.id === id);
    for (const [id, rect] of noteRects) rect.classList.toggle('active', !!current && current.id === id);
    return current;
  }

  function relayout() {
    if (!idea) return;
    const width = Math.round(rollEl.clientWidth || 0);
    if (width && Math.abs(width - rollWidth) > 24) paintRoll();
  }

  return { render, setPlayhead, relayout, closeEditor };
}
