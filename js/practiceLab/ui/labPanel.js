// The longer work of Composition Lab: guided labs, section writing, the song
// study, and the capstone.
//
// Each one is a list of steps with fields. Musi holds the brief and the notes.
// It does not hold the music. The player writes that on the instrument and
// records it wherever they already do.

import {
  GUIDED_LABS, labById, SONG_STUDY_PASSES, SONG_STUDY_EXAMPLES,
  CAPSTONE_PLAN, CAPSTONE_RUBRIC, RUBRIC_SCORES, rubricTotal,
} from '../model/guidedLabs.js';
import { SECTIONS, sectionAssignment, cardById } from '../model/motifLab.js';
import { el, clear, panel, pressable, notice } from './dom.js';

function fieldNode(field, value, onInput) {
  const input = field.kind === 'text'
    ? el('input', {
      type: 'text', class: 'pl-text', value, placeholder: field.placeholder || '',
      on: { input: event => onInput(field.id, event.target.value) },
    })
    : el('textarea', {
      class: 'pl-textarea', rows: 2, value, placeholder: field.placeholder || '',
      on: { input: event => onInput(field.id, event.target.value) },
    });
  input.setAttribute('aria-label', field.label);
  return el('label', { class: 'pl-field plc-lab-field' }, [
    el('span', { class: 'pl-field-label', text: field.label }),
    input,
  ]);
}

/**
 * Build the lab panel.
 * @param {Object} handlers
 * @param {Function} handlers.onLabField `(labId, fieldId, value)`
 * @param {Function} handlers.onLabStep `(labId, stepIndex)`
 * @param {Function} handlers.onSong `(fieldId, value)`
 * @param {Function} handlers.onCapstonePlan `(fieldId, value)`
 * @param {Function} handlers.onCapstoneScore `(rowId, score)`
 * @param {Function} handlers.onSections `(assignment)`
 * @param {Function} handlers.onSectionField `(sectionId, value)`
 * @returns {{root: HTMLElement, render: Function}}
 */
export function createLabPanel(handlers = {}) {
  let state = null;
  let mode = 'lab';
  let openLab = '';

  const root = el('div', { class: 'plc-labs' });

  function paintLabList() {
    const list = panel('Guided labs', 'plc-lab-list');
    list.body.appendChild(el('p', {
      class: 'pl-hint',
      text: 'A guided lab runs over several steps. Your writing stays between them.',
    }));
    for (const lab of GUIDED_LABS) {
      const answers = (state.labs[lab.id] || {}).answers || {};
      const written = Object.values(answers).filter(v => String(v || '').trim()).length;
      list.body.appendChild(el('button', {
        type: 'button',
        class: 'plc-lab-row',
        on: { click: () => { openLab = lab.id; paint(); } },
      }, [
        el('span', { class: 'plc-lab-name', text: lab.label }),
        el('span', { class: 'plc-lab-summary', text: lab.summary }),
        el('span', { class: 'plc-lab-count', text: written ? `${written} notes` : 'not started' }),
      ]));
    }
    root.appendChild(list.root);
  }

  function paintOpenLab() {
    const lab = labById(openLab);
    if (!lab) { openLab = ''; paintLabList(); return; }
    const steps = lab.steps(state.context);
    const entry = state.labs[lab.id] || {};
    const index = Math.min(Math.max(0, Number(entry.stepIndex) || 0), steps.length - 1);
    const step = steps[index];
    const answers = entry.answers || {};

    const box = panel(`${lab.label} — ${step.title}`, 'plc-lab-open');
    box.head.appendChild(el('span', { class: 'plc-ex-activity', text: `Step ${index + 1} of ${steps.length}` }));
    box.body.appendChild(el('p', { class: 'plc-ex-prompt', text: step.prompt }));
    if (step.brief && step.brief.length) {
      box.body.appendChild(el('ul', { class: 'plc-ex-brief' },
        step.brief.map(line => el('li', { text: line }))));
    }
    for (const field of step.fields) {
      box.body.appendChild(fieldNode(field, answers[field.id] || '',
        (id, value) => handlers.onLabField?.(lab.id, id, value)));
    }
    box.body.appendChild(el('div', { class: 'pl-row' }, [
      pressable({
        label: 'Back',
        className: 'small',
        disabled: index === 0,
        onPress: () => handlers.onLabStep?.(lab.id, index - 1),
      }),
      pressable({
        label: index + 1 >= steps.length ? 'Finish' : 'Next step',
        className: 'primary',
        onPress: () => {
          if (index + 1 >= steps.length) { openLab = ''; paint(); return; }
          handlers.onLabStep?.(lab.id, index + 1);
        },
      }),
      pressable({ label: 'All labs', className: 'small', onPress: () => { openLab = ''; paint(); } }),
    ]));
    root.appendChild(box.root);
  }

  function paintSections() {
    const assignment = state.sections.assignment.length
      ? state.sections.assignment
      : sectionAssignment();
    const box = panel('Section Lab', 'plc-sections');
    box.body.appendChild(el('p', {
      class: 'plc-ex-prompt',
      text: 'Create an opening, a verse, and a chorus from one motif. '
        + 'Musi gives each section a different transformation constraint.',
    }));
    box.body.appendChild(el('div', { class: 'pl-row' }, [
      pressable({
        label: 'New constraints',
        className: 'small',
        onPress: () => handlers.onSections?.(sectionAssignment()),
      }),
    ]));

    for (const row of assignment) {
      const section = SECTIONS.find(s => s.id === row.sectionId);
      const card = cardById(row.card?.id) || row.card;
      const value = state.sections.answers[row.sectionId] || '';
      const inner = panel(section ? section.label : row.label, 'plc-section');
      inner.body.append(
        el('ul', { class: 'plc-ex-brief' },
          (section ? section.purpose : []).map(line => el('li', { text: line }))),
        el('p', { class: 'plc-keep', text: `Preserve: ${card ? card.preserve : ''}` }),
        el('p', { class: 'plc-change', text: `Change: ${card ? card.change : ''}` }),
        fieldNode(
          { id: row.sectionId, label: 'What you wrote', kind: 'textarea' },
          value,
          (id, next) => handlers.onSectionField?.(id, next),
        ),
      );
      box.body.appendChild(inner.root);
    }
    root.appendChild(box.root);
  }

  function paintSong() {
    const box = panel('Study a song', 'plc-song');
    const answers = state.song.answers || {};
    const titleInput = el('input', {
      type: 'text',
      class: 'pl-text',
      value: state.song.title || '',
      placeholder: 'Any song. Type the title.',
      on: { input: () => handlers.onSong?.('__title', titleInput.value) },
    });
    titleInput.setAttribute('aria-label', 'The song you are studying');
    box.body.append(
      el('label', { class: 'pl-field' }, [
        el('span', { class: 'pl-field-label', text: 'The song' }),
        titleInput,
      ]),
      el('p', {
        class: 'pl-hint',
        text: `Nothing here is tied to one track. Ideas: ${SONG_STUDY_EXAMPLES.join(' ')}`,
      }),
    );

    for (const pass of SONG_STUDY_PASSES) {
      const inner = panel(pass.title, 'plc-song-pass');
      inner.body.appendChild(el('p', { class: 'plc-ex-prompt', text: pass.prompt }));
      for (const field of pass.fields) {
        inner.body.appendChild(fieldNode(field, answers[`${pass.id}.${field.id}`] || '',
          (id, value) => handlers.onSong?.(`${pass.id}.${id}`, value)));
      }
      box.body.appendChild(inner.root);
    }
    root.appendChild(box.root);
  }

  function paintCapstone() {
    const plan = panel('Capstone — the plan', 'plc-capstone-plan');
    plan.body.appendChild(el('p', {
      class: 'plc-ex-prompt',
      text: 'Define the piece before you write it. Then write a short multi-section piece '
        + 'on your instrument, beside Musi and not inside it.',
    }));
    for (const field of CAPSTONE_PLAN) {
      plan.body.appendChild(fieldNode(field, state.capstone.plan[field.id] || '',
        (id, value) => handlers.onCapstonePlan?.(id, value)));
    }
    root.appendChild(plan.root);

    const rubric = panel('Capstone — self review', 'plc-capstone-rubric');
    rubric.body.appendChild(el('p', {
      class: 'pl-hint',
      text: 'Musi guides the review. You score the music.',
    }));
    for (const row of CAPSTONE_RUBRIC) {
      const current = Number(state.capstone.scores[row.id]);
      const buttons = el('div', { class: 'pl-chip-row plc-score-row' },
        RUBRIC_SCORES.map((score) => {
          const on = current === score.value;
          const button = el('button', {
            type: 'button',
            class: `plc-score${on ? ' active' : ''}`,
            text: score.label,
            on: { click: () => handlers.onCapstoneScore?.(row.id, score.value) },
          });
          button.setAttribute('aria-pressed', on ? 'true' : 'false');
          button.setAttribute('aria-label', `${row.label}: ${score.label}`);
          return button;
        }));
      rubric.body.appendChild(el('div', { class: 'plc-rubric-row' }, [
        el('span', { class: 'plc-rubric-name', text: row.label }),
        el('span', { class: 'plc-rubric-ask', text: row.ask }),
        buttons,
      ]));
    }
    const total = rubricTotal(state.capstone.scores);
    rubric.body.appendChild(notice(
      `${total.total} of ${total.max}.`
      + (total.weakest.length ? ` Weakest: ${total.weakest.join(', ')}.` : ' Every row holds up.'),
      total.weakest.length ? 'warn' : 'info',
    ));
    root.appendChild(rubric.root);
  }

  function paint() {
    clear(root);
    if (!state) return;
    if (mode === 'section') { paintSections(); return; }
    if (mode === 'song') { paintSong(); return; }
    if (mode === 'capstone') { paintCapstone(); return; }
    if (openLab) paintOpenLab();
    else paintLabList();
  }

  /**
   * Paint the panel.
   * @param {{state: Object, mode: string}} next
   */
  function render(next = {}) {
    state = next.state || state;
    if (next.mode && next.mode !== mode) { mode = next.mode; openLab = ''; }
    paint();
  }

  return { root, render };
}
