/**
 * The text the pitch runner prints for one note.
 *
 * A run that came from a Guitar Pro file carries the text of the score. A
 * vocal warm-up writes the vowel or the exercise there: "mee", "lip trill",
 * "hum". The stage prints that text on the bar and above the canvas, so the
 * singer reads what to do with the pitch that comes.
 *
 * The functions here hold no DOM code and no audio code, so the Node test
 * runners can import them.
 */

/**
 * The note the stage names at one moment.
 *
 * The note that sits on the hit line wins. When no note sits on the line, the
 * note that comes next wins, so the singer reads the text before the bar
 * arrives. A preview note counts: the app sings it, and the singer reads the
 * same text.
 *
 * @param {Array<{startBeat:number, dur:number}>} notes the notes on the timeline
 * @param {number} playheadBeat
 * @returns {Object|null} the note, or null for an empty timeline
 */
export function noteAtPlayhead(notes, playheadBeat) {
  const list = Array.isArray(notes) ? notes : [];
  const head = Number(playheadBeat);
  if (!Number.isFinite(head)) return null;
  let next = null;
  for (const note of list) {
    const start = Number(note?.startBeat);
    const dur = Number(note?.dur);
    if (!Number.isFinite(start) || !Number.isFinite(dur)) continue;
    if (head >= start && head < start + dur) return note;
    if (start > head && (!next || start < Number(next.startBeat))) next = note;
  }
  return next;
}

/**
 * The text the stage prints at one moment.
 *
 * A score writes the vowel once and then leaves the next notes bare, because
 * the instruction still holds. The stage does the same: a note with no text of
 * its own keeps the text the stage printed before it. The bar itself prints
 * only the text the score writes on it, so the singer still sees where the
 * instruction changes.
 *
 * @param {Array<{startBeat:number, dur:number, text?:string}>} notes
 * @param {number} playheadBeat
 * @param {string} [previous] the text the stage prints now
 * @returns {string}
 */
export function heldNoteText(notes, playheadBeat, previous = '') {
  const note = noteAtPlayhead(notes, playheadBeat);
  const text = typeof note?.text === 'string' ? note.text : '';
  if (text) return text;
  return typeof previous === 'string' ? previous : '';
}

/**
 * Cut a label until it fits the width the bar allows.
 *
 * The caller supplies the measure function, because only the canvas knows how
 * wide a string draws. A label that does not fit even at one character comes
 * back empty, and the caller then prints nothing.
 *
 * @param {string} text
 * @param {number} maxWidth in pixels
 * @param {(text: string) => number} measure
 * @returns {string} the text, a shorter text with an ellipsis, or ''
 */
export function fitNoteText(text, maxWidth, measure) {
  const full = typeof text === 'string' ? text : '';
  const room = Number(maxWidth);
  if (!full || !Number.isFinite(room) || room <= 0) return '';
  if (measure(full) <= room) return full;
  for (let cut = full.length - 1; cut > 0; cut -= 1) {
    const shorter = `${full.slice(0, cut).trimEnd()}…`;
    if (measure(shorter) <= room) return shorter;
  }
  return '';
}
