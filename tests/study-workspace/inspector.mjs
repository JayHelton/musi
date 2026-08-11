/**
 * Inspector unit tests for the Study workspace Phase 4.
 */

import assert from 'node:assert/strict';
import { inspect, INSPECTOR_ACTIONS } from '../../js/core/musicInspector.js';
import { parseNote, INTERVAL_LABELS, NOTE_NAMES_SHARP } from '../../js/theory.js';
import { getScaleNotes } from '../../js/scales.js';
import { getChordNotes } from '../../js/chords.js';
import { TUNING_CATALOG, pitchToMidi } from '../../js/tunings.js';
import { parseRoute } from '../../js/routes.js';

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function normPc(v) {
  return ((Number(v) % 12) + 12) % 12;
}

function pcName(pc, pref) {
  return pref === 'flats' ? FLAT_NAMES[normPc(pc)] : NOTE_NAMES_SHARP[normPc(pc)];
}

function intervalFromRoot(root, pc) {
  const r = parseNote(root);
  if (!r) return null;
  const semi = normPc(pc - r.semi);
  return INTERVAL_LABELS[semi];
}

function scaleDegreeName(root, scaleId, pc) {
  const notes = getScaleNotes(root, scaleId) || [];
  const idx = notes.findIndex((n) => {
    const p = parseNote(n);
    return p && p.semi === normPc(pc);
  });
  return idx >= 0 ? { degree: idx + 1, name: notes[idx] } : null;
}

function guitarPositions(pc, tuningId) {
  const preset = TUNING_CATALOG.find((p) => p.id === tuningId) || TUNING_CATALOG[0];
  const npc = normPc(pc);
  const out = [];
  preset.pitches.forEach((pitch, stringIdx) => {
    const open = pitchToMidi(pitch);
    for (let fret = 0; fret <= 15; fret += 1) {
      if (normPc(open + fret) === npc) {
        out.push(`${stringIdx + 1}:${fret}`);
        break;
      }
    }
  });
  return out;
}

const baseCtx = {
  root: 'C',
  scaleId: 'Major (Ionian)',
  tuningId: '6-e-std',
  keySignaturePreference: 'sharps',
};

export function runInspectorTests(test) {
  test('inspect note derives names, interval, degree, guitar from theory engine', () => {
    const midi = 60;
    const pc = normPc(midi);
    const model = inspect({ kind: 'note', midi }, baseCtx);
    assert.equal(model.facts.find((f) => f.label === 'Note')?.value, 'C4');
    assert.equal(model.facts.find((f) => f.label === 'Pitch class')?.value, pcName(pc, 'sharps'));
    assert.equal(model.facts.find((f) => f.label === 'Interval from root')?.value, intervalFromRoot('C', pc));
    const deg = scaleDegreeName('C', 'Major (Ionian)', pc);
    assert.ok(deg);
    assert.match(model.facts.find((f) => f.label === 'Scale degree')?.value, new RegExp(`${deg.degree}`));
    const expectedGuitar = guitarPositions(pc, '6-e-std').join(', ');
    assert.equal(model.facts.find((f) => f.label === 'Guitar')?.value, expectedGuitar);
    assert.ok(model.actions.some((a) => a.id === INSPECTOR_ACTIONS.practice.id));
    assert.ok(!model.actions.some((a) => a.id === INSPECTOR_ACTIONS.hear.id && !a.play));
  });

  test('inspect pitch-class respects keySignaturePreference spelling', () => {
    const modelSharp = inspect({ kind: 'pitch-class', pc: 1 }, baseCtx);
    assert.equal(modelSharp.facts.find((f) => f.label === 'Pitch class')?.value, 'C#');
    const modelFlat = inspect({ kind: 'pitch-class', pc: 1 }, {
      ...baseCtx,
      keySignaturePreference: 'flats',
    });
    assert.equal(modelFlat.facts.find((f) => f.label === 'Pitch class')?.value, 'Db');
  });

  test('inspect chord membership and tones match getChordNotes', () => {
    const model = inspect({ kind: 'chord', root: 'C', quality: 'Major' }, baseCtx);
    const tones = getChordNotes('C', 'Major') || [];
    assert.equal(model.facts.find((f) => f.label === 'Tones')?.value, tones.join(' · '));
    assert.ok(model.actions.some((a) => a.id === INSPECTOR_ACTIONS.progression.id));
  });

  test('inspect scale lists degrees from getScaleNotes', () => {
    const notes = getScaleNotes('C', 'Major (Ionian)') || [];
    const model = inspect({ kind: 'scale', root: 'C', scaleId: 'Major (Ionian)' }, baseCtx);
    assert.equal(model.facts.find((f) => f.label === 'Degrees')?.value, notes.join(' · '));
  });

  test('inspect interval labels use INTERVAL_LABELS', () => {
    const model = inspect({ kind: 'interval', from: 'C', semitones: 4 }, baseCtx);
    assert.equal(model.facts.find((f) => f.label === 'Interval')?.value, INTERVAL_LABELS[4]);
  });

  test('inspect guitar-position resolves to note facts', () => {
    const model = inspect({
      kind: 'guitar-position',
      string: 2,
      fret: 1,
      tuningId: '6-e-std',
    }, baseCtx);
    const open = pitchToMidi(TUNING_CATALOG[0].pitches[1]);
    const midi = open + 1;
    const pc = normPc(midi);
    assert.equal(model.facts.find((f) => f.label === 'String')?.value, '2');
    assert.equal(model.facts.find((f) => f.label === 'Fret')?.value, '1');
    assert.equal(model.facts.find((f) => f.label === 'Pitch class')?.value, pcName(pc, 'sharps'));
  });

  test('inspect concept includes study paths and hear action', () => {
    const model = inspect({ kind: 'concept', conceptId: 'major_scale' }, baseCtx);
    assert.match(model.title, /major/i);
    assert.ok(model.actions.some((a) => a.id === INSPECTOR_ACTIONS.practice.id));
    assert.ok(model.actions.some((a) => a.id === INSPECTOR_ACTIONS.map.id));
    assert.ok(model.actions.some((a) => a.id === INSPECTOR_ACTIONS.hear.id));
  });

  test('every inspector action route parses via routes.js when present', () => {
    const kinds = [
      { kind: 'note', midi: 64 },
      { kind: 'pitch-class', pc: 7 },
      { kind: 'chord', root: 'G', quality: 'Minor' },
      { kind: 'scale', root: 'D', scaleId: 'Dorian' },
      { kind: 'interval', from: 'A', semitones: 7 },
      { kind: 'concept', conceptId: 'interval_locations' },
      { kind: 'guitar-position', string: 1, fret: 0, tuningId: '6-e-std' },
    ];
    kinds.forEach((sel) => {
      const model = inspect(sel, baseCtx);
      model.actions.forEach((action) => {
        if (!action.route) return;
        const parsed = parseRoute(action.route);
        assert.notEqual(parsed.objective, 'home', `${action.id} route should resolve: ${action.route}`);
        assert.notEqual(parsed.unknown, true);
      });
    });
  });

  test('inapplicable actions are omitted not disabled', () => {
    const empty = inspect(null);
    assert.equal(empty.actions.length, 0);
    const note = inspect({ kind: 'note', midi: 60 }, baseCtx);
    assert.ok(!note.actions.some((a) => a.disabled));
    note.actions.forEach((a) => assert.ok(a.label));
  });
}
