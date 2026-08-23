/**
 * The neck the Scale Reference draws.
 *
 * Both tabs of the Scale Reference show the same neck: the same strings, the
 * same fret numbers, the same yellow position box. Only the choice of which
 * notes to light up differs. The Fretboard tab lights the notes of the scale,
 * and the Interval Map lights the notes at the intervals the player picked.
 *
 * So this module owns the grid and the box, and the caller owns the choice.
 * `noteFor` receives one fret of one string and returns the marker to draw
 * there, or null for an empty fret.
 */

/** Fretboard inlay markers. The neck carries a dot at each of these frets. */
export const FRETBOARD_DOTS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
/** Last fret the neck draws. */
export const MAX_FRET = 24;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Draws the neck into `board`.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.board grid element to fill
 * @param {{note:string, oct:number}[]} opts.strings tuning, low string first
 * @param {number[]} opts.openMidis MIDI note of each open string, low first
 * @param {number} opts.start first fret to draw
 * @param {number} opts.end last fret to draw
 * @param {{start:number, end:number, anchorFret:number}|null} opts.box
 *   the position box to outline, or null to draw no box
 * @param {(ctx:{string:number, fret:number, midi:number, pc:number}) =>
 *   ({label:string, classes?:string[], title?:string}|null)} opts.noteFor
 *   the marker to draw on one fret, or null for none
 */
export function renderFretboard({ board, strings, openMidis, start, end, box, noteFor }) {
  if (!board) return;
  const first = Math.max(0, Math.min(MAX_FRET, start));
  const last = Math.max(first + 1, Math.min(MAX_FRET, end));
  const count = last - first + 1;
  const middleString = Math.floor(strings.length / 2);
  const bandStart = box ? box.start : 0;
  const bandEnd = box ? box.end : -1;

  board.style.gridTemplateColumns = `34px repeat(${count}, minmax(30px, 1fr))`;

  let html = '<div class="ref-fb-corner"></div>';
  for (let f = first; f <= last; f++) {
    // The position starts on this fret, so mark it.
    const isAnchor = box && f === box.anchorFret;
    html += `<div class="ref-fb-fretnum${isAnchor ? ' anchor' : ''}"` +
      `${isAnchor ? ' title="The position starts on this fret"' : ''}>${f}</div>`;
  }

  // The high string draws first, so the neck reads the way the player sees it.
  for (let s = strings.length - 1; s >= 0; s--) {
    const isTop = s === strings.length - 1;
    const isBottom = s === 0;
    html += `<div class="ref-fb-strlabel">${strings[s].note}${strings[s].oct}</div>`;
    for (let f = first; f <= last; f++) {
      const midi = openMidis[s] + f;
      const cls = ['ref-fb-cell'];
      if (f === 0) cls.push('nut');
      if (f > 0 && FRETBOARD_DOTS.includes(f) && s === middleString) cls.push('inlay');
      // Edge classes draw the box, so the position reads as one rectangle
      // across every string instead of six separate outlines.
      if (f >= bandStart && f <= bandEnd) {
        cls.push('in-band');
        if (f === bandStart) cls.push('band-l');
        if (f === bandEnd) cls.push('band-r');
        if (isTop) cls.push('band-t');
        if (isBottom) cls.push('band-b');
      }

      const note = noteFor({ string: s, fret: f, midi, pc: ((midi % 12) + 12) % 12 });
      let inner = '';
      if (note) {
        const noteCls = ['ref-note', ...(note.classes || [])];
        const title = note.title ? ` title="${escapeHtml(note.title)}"` : '';
        inner = `<span class="${noteCls.join(' ')}"${title}>${escapeHtml(note.label)}</span>`;
      }
      html += `<div class="${cls.join(' ')}" data-string="${s}" data-fret="${f}">${inner}</div>`;
    }
  }
  board.innerHTML = html;
}
