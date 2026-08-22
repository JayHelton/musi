/**
 * The chords a key or a mode contains.
 *
 * Stacking 1-3-5 from every degree of a seven-note scale gives the seven
 * triads that belong to that key. This module builds those triads and draws
 * them, and it marks each one that differs from the parent major scale, which
 * is where the colour of a mode comes from.
 *
 * The Triads tool renders this panel. The module holds no state of its own, so
 * any caller can pass a root and a scale and get the panel back.
 */

import { parseNote, INTERVAL_LABELS } from './theory.js';
import { SCALES, getScaleNotes } from './scales.js';
import { diatonicTriadQuality } from './chords.js';

const DEGREE_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_SCALE = 'Major (Ionian)';

// Short scale-degree names keyed by the number of semitones above the root.
const DEGREE_LABELS = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

function noteSemi(note) {
  const p = parseNote(note);
  return p ? p.semi : null;
}

function triadQuality(notes) {
  const root = noteSemi(notes[0]);
  const third = noteSemi(notes[1]);
  const fifth = noteSemi(notes[2]);
  if (root == null || third == null || fifth == null) return { name: 'Unknown', suffix: '' };

  const thirdIv = (third - root + 12) % 12;
  const fifthIv = (fifth - root + 12) % 12;
  return diatonicTriadQuality(thirdIv, fifthIv) || {
    name: `${INTERVAL_LABELS[thirdIv] || thirdIv} + ${INTERVAL_LABELS[fifthIv] || fifthIv}`,
    suffix: '',
  };
}

function diatonicTriadsForNotes(notes) {
  if (!notes || notes.length !== 7) return [];
  return notes.map((root, i) => {
    const tones = [root, notes[(i + 2) % 7], notes[(i + 4) % 7]];
    const quality = triadQuality(tones);
    const rootSemi = noteSemi(tones[0]);
    const formula = tones.map((tone, toneIndex) => {
      if (toneIndex === 0 || rootSemi == null) return 'R';
      const semi = noteSemi(tone);
      if (semi == null) return '?';
      const interval = (semi - rootSemi + 12) % 12;
      return DEGREE_LABELS[interval] || INTERVAL_LABELS[interval] || String(interval);
    });
    return {
      degree: DEGREE_ROMAN[i],
      root,
      tones,
      quality: quality.name,
      suffix: quality.suffix,
      formula,
      display: `${root} ${quality.name}`,
      symbol: `${root}${quality.suffix}`,
    };
  });
}

function modeAlterations(scaleName) {
  const major = SCALES[MAJOR_SCALE];
  const current = SCALES[scaleName];
  if (!major || !current || current.length !== 7) return [];

  return current.map((d, i) => {
    const diff = d[1] - major[i][1];
    if (!diff) return null;
    const degree = i + 1;
    if (diff === 1) return `#${degree}`;
    if (diff === -1) return `b${degree}`;
    if (diff === 2) return `##${degree}`;
    if (diff === -2) return `bb${degree}`;
    return `${diff > 0 ? '+' : ''}${diff} on ${degree}`;
  }).filter(Boolean);
}

/**
 * HTML for the panel of every triad in `root` `scale`.
 * Returns an empty string when the scale is not a seven-note scale.
 */
export function renderDiatonicTriadPanel(root, scale) {
  const currentDef = SCALES[scale];
  const modalNotes = getScaleNotes(root, scale);
  const majorNotes = getScaleNotes(root, MAJOR_SCALE);
  if (!currentDef || currentDef.length !== 7 || !modalNotes || !majorNotes) return '';

  const majorTriads = diatonicTriadsForNotes(majorNotes);
  const modalTriads = diatonicTriadsForNotes(modalNotes);
  const alterations = modeAlterations(scale);
  const changedRows = modalTriads
    .map((chord, i) => ({ chord, base: majorTriads[i] }))
    .filter(({ chord, base }) => chord.display !== base.display || chord.tones.join(',') !== base.tones.join(','));

  const modeLabel = scale.replace(/\s*\(.*\)/, '');
  const alterationText = alterations.length ? alterations.join(', ') : 'no scale-degree changes';

  let html = `<div class="modal-chord-viz">`;
  html += `<div class="modal-chord-head">`;
  html += `<div>`;
  html += `<div class="modal-chord-kicker">Chords in this key/mode</div>`;
  html += `<p>Each chord below stacks 1-3-5 from one degree of the scale. Together they are the full chord set for <strong>${root} ${modeLabel}</strong>.</p>`;
  html += `</div>`;
  html += `<div class="modal-chord-count">7 triads</div>`;
  html += `</div>`;
  html += `<div class="modal-scale-flow">`;
  html += `<div><span>Selected scale</span><strong>${modalNotes.join(' ')}</strong></div>`;
  html += `<div><span>Compared with Major</span><strong>${alterationText}</strong></div>`;
  html += `</div>`;
  html += `<div class="modal-chord-grid">`;
  modalTriads.forEach((chord, i) => {
    const base = majorTriads[i];
    const changed = chord.display !== base.display || chord.tones.join(',') !== base.tones.join(',');
    const toneHtml = chord.tones.map((tone, toneIndex) => {
      const toneChanged = tone !== base.tones[toneIndex];
      return `<span class="modal-tone${toneChanged ? ' changed' : ''}">${tone}</span>`;
    }).join('');
    html += `<div class="modal-chord-card${changed ? ' changed' : ''}">`;
    html += `<div class="modal-card-top"><span class="modal-degree">${chord.degree}</span><span class="modal-card-interval">${INTERVAL_LABELS[currentDef[i][1]] || DEGREE_LABELS[currentDef[i][1]] || currentDef[i][1]}</span></div>`;
    html += `<div class="modal-card-note">${modalNotes[i]}</div>`;
    html += `<div class="modal-card-chord">${chord.display}</div>`;
    html += `<div class="modal-symbol">${chord.symbol}</div>`;
    html += `<div class="modal-card-label">notes</div>`;
    html += `<div class="modal-tones">${toneHtml}</div>`;
    html += `<div class="modal-card-label">formula</div>`;
    html += `<div class="modal-tones">${chord.formula.join(' - ')}</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  html += `<div class="modal-chord-scroll"><table class="modal-chord-table">`;
  html += `<tr><th>Interval</th><th>Scale degree</th><th>Chord triad</th><th>Notes in chord</th><th>Formula</th></tr>`;
  modalTriads.forEach((chord, i) => {
    const base = majorTriads[i];
    const changed = chord.display !== base.display || chord.tones.join(',') !== base.tones.join(',');
    const toneHtml = chord.tones.map((tone, toneIndex) => {
      const toneChanged = tone !== base.tones[toneIndex];
      return `<span class="modal-tone${toneChanged ? ' changed' : ''}">${tone}</span>`;
    }).join('');
    html += `<tr class="${changed ? 'changed' : ''}">`;
    html += `<td><span class="modal-degree">${chord.degree}</span></td>`;
    html += `<td><strong>${modalNotes[i]}</strong><span class="modal-tones">${INTERVAL_LABELS[currentDef[i][1]] || DEGREE_LABELS[currentDef[i][1]] || currentDef[i][1]}</span></td>`;
    html += `<td><strong>${chord.display}</strong><span class="modal-symbol">${chord.symbol}</span></td>`;
    html += `<td><span class="modal-tones">${toneHtml}</span></td>`;
    html += `<td><span class="modal-tones">${chord.formula.join(' - ')}</span></td>`;
    html += `</tr>`;
  });
  html += `</table></div>`;

  if (changedRows.length) {
    html += `<div class="modal-chord-summary">`;
    html += `Compared with ${root} Major, modal-color triads are: ${changedRows.map(({ chord, base }) => `<strong>${chord.display}</strong> instead of ${base.display}`).join(' · ')}`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}
