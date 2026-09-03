import assert from 'node:assert/strict';
import { fitNoteText, heldNoteText, noteAtPlayhead } from '../../js/runnerNoteText.js';

/** A measure function that gives every character the same width. */
function fixedWidth(perChar) {
  return (text) => text.length * perChar;
}

export function runNoteTextTests() {
  console.log('note text test 1: the note on the line wins');
  {
    const notes = [
      { startBeat: 0, dur: 2, text: 'mee' },
      { startBeat: 2, dur: 2, text: 'may' },
    ];
    assert.equal(noteAtPlayhead(notes, 0).text, 'mee');
    assert.equal(noteAtPlayhead(notes, 1.9).text, 'mee');
    assert.equal(noteAtPlayhead(notes, 2).text, 'may');
  }

  console.log('note text test 2: the next note wins in the gap before it');
  {
    const notes = [
      { startBeat: 4, dur: 2, text: 'mah' },
      { startBeat: 8, dur: 2, text: 'moh' },
    ];
    // The count-in runs before the first note, so the stage already names it.
    assert.equal(noteAtPlayhead(notes, 0).text, 'mah');
    assert.equal(noteAtPlayhead(notes, 6).text, 'moh', 'the rest between two notes names the next one');
    assert.equal(noteAtPlayhead(notes, 20), null, 'nothing comes after the last note');
  }

  console.log('note text test 3: an empty timeline and a bad playhead name nothing');
  {
    assert.equal(noteAtPlayhead([], 0), null);
    assert.equal(noteAtPlayhead(null, 0), null);
    assert.equal(noteAtPlayhead([{ startBeat: 0, dur: 1 }], NaN), null);
  }

  console.log('note text test 4: a bare note keeps the text of the note before it');
  {
    const notes = [
      { startBeat: 0, dur: 1, text: 'mee' },
      { startBeat: 1, dur: 1 },
      { startBeat: 2, dur: 1, text: 'mah' },
    ];
    assert.equal(heldNoteText(notes, 0, ''), 'mee');
    assert.equal(heldNoteText(notes, 1, 'mee'), 'mee', 'the instruction still holds');
    assert.equal(heldNoteText(notes, 2, 'mee'), 'mah', 'a new text replaces it');
    assert.equal(heldNoteText([], 0, 'mee'), 'mee', 'a pruned timeline keeps the text');
    assert.equal(heldNoteText(notes, 1, ''), '', 'a run that never wrote text prints nothing');
  }

  console.log('note text test 5: a label that fits prints in full');
  {
    assert.equal(fitNoteText('mee', 100, fixedWidth(10)), 'mee');
    assert.equal(fitNoteText('mee', 30, fixedWidth(10)), 'mee');
  }

  console.log('note text test 6: a long label is cut with an ellipsis');
  {
    const cut = fitNoteText('lip trill up', 50, fixedWidth(10));
    assert.ok(cut.endsWith('…'), `"${cut}" should end with an ellipsis`);
    assert.ok(cut.length <= 5, `"${cut}" should fit five characters`);
    assert.ok('lip trill up'.startsWith(cut.slice(0, -1)), 'the cut keeps the start of the label');
  }

  console.log('note text test 7: no room means no label');
  {
    assert.equal(fitNoteText('mee', 5, fixedWidth(10)), '');
    assert.equal(fitNoteText('mee', 0, fixedWidth(10)), '');
    assert.equal(fitNoteText('', 100, fixedWidth(10)), '');
  }
}
