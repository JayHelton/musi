// The context row of Composition Lab.
//
// One line names where the player is working: the instrument, the tuning, the
// tonal center, and the collection. The row opens into an editor with the
// optional fields, and a preset loads a whole row in one tap.
//
// The row writes the root, the collection, and the tuning back to the shared
// musical context, so the Scale Reference and the Composition Lab stay in the
// same key.

import {
  INSTRUMENTS, CONTEXT_PRESETS, instrumentById, tuningsForInstrument,
  describeContext, describeOptions, isFretted, normalizeContext, applyPreset,
} from '../model/compositionContext.js';
import { ROOTS, SCALES, groupedScaleEntries } from '../adapters/musiTheory.js';
import { DEGREE_IDS, degreeById } from '../adapters/musiReference.js';
import { el, clear, stepper } from './dom.js';

function selectNode(label, value, options, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  }, options.map(opt => el('option', { value: opt.id, text: opt.label })));
  node.value = value;
  node.setAttribute('aria-label', label);
  return el('label', { class: 'pl-field' }, [
    el('span', { class: 'pl-field-label', text: label }),
    node,
  ]);
}

function scaleSelectNode(value, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  });
  let group = null;
  for (const entry of groupedScaleEntries(false)) {
    if (entry.type === 'label') {
      group = el('optgroup');
      group.label = entry.label;
      node.appendChild(group);
      continue;
    }
    (group || node).appendChild(el('option', { value: entry.val, text: entry.label }));
  }
  node.value = SCALES[value] ? value : 'Major (Ionian)';
  node.setAttribute('aria-label', 'Collection');
  return el('label', { class: 'pl-field' }, [
    el('span', { class: 'pl-field-label', text: 'Collection' }),
    node,
  ]);
}

/**
 * Build the context row.
 * @param {{onChange: Function}} handlers `onChange` receives the new context
 * @returns {{root: HTMLElement, render: Function}}
 */
export function createContextRow({ onChange } = {}) {
  let context = normalizeContext({});
  let open = false;

  const line = el('span', { class: 'plc-context-line' });
  const options = el('span', { class: 'plc-context-options' });

  const toggleButton = el('button', {
    type: 'button',
    class: 'plc-context-toggle',
    on: { click: () => { open = !open; paint(); } },
  }, [line]);
  toggleButton.setAttribute('aria-expanded', 'false');

  const editor = el('div', { class: 'plc-context-editor', hidden: true });
  const presetRow = el('div', { class: 'pl-chip-row plc-preset-row' });

  const root = el('section', { class: 'plc-context' }, [
    el('div', { class: 'plc-context-head' }, [toggleButton, options]),
    editor,
  ]);

  function update(partial) {
    context = normalizeContext({ ...context, ...partial });
    onChange?.(context);
    paint();
  }

  function paintEditor() {
    clear(editor);
    if (!open) return;

    const instrument = instrumentById(context.instrument);
    const grid = el('div', { class: 'pl-grid plc-context-grid' });

    grid.appendChild(selectNode('Instrument', context.instrument,
      INSTRUMENTS.map(i => ({ id: i.id, label: i.label })),
      value => update({ instrument: value, tuning: '' })));

    if (instrument.fretted) {
      const tunings = tuningsForInstrument(context.instrument);
      grid.appendChild(selectNode('Tuning', context.tuning,
        tunings.map(name => ({ id: name, label: name })),
        value => update({ tuning: value })));
    }

    grid.appendChild(selectNode('Tonal center', context.tonic,
      ROOTS.map(r => ({ id: r, label: r })),
      value => update({ tonic: value })));

    grid.appendChild(scaleSelectNode(context.collection, value => update({ collection: value })));

    grid.appendChild(selectNode('Second center (optional)', context.secondTonic,
      [{ id: '', label: 'none' }].concat(ROOTS.map(r => ({ id: r, label: r }))),
      value => update({ secondTonic: value })));

    grid.appendChild(selectNode('Target color (optional)', context.targetDegree,
      [{ id: '', label: 'none' }].concat(DEGREE_IDS.map((id) => {
        const degree = degreeById(id);
        return { id, label: degree ? `${id} — ${degree.character}` : id };
      })),
      value => update({ targetDegree: value })));

    editor.appendChild(grid);

    if (instrument.fretted) {
      const start = stepper({
        label: 'First fret', value: context.fretStart, min: 0, max: 23, step: 1,
        onChange: value => update({ fretStart: value }),
      });
      const end = stepper({
        label: 'Last fret', value: context.fretEnd, min: 1, max: 24, step: 1,
        onChange: value => update({ fretEnd: value }),
      });
      editor.appendChild(el('div', { class: 'pl-grid plc-range-grid' }, [start.root, end.root]));
    }

    clear(presetRow);
    presetRow.appendChild(el('span', { class: 'pl-field-label', text: 'Presets' }));
    for (const preset of CONTEXT_PRESETS) {
      const button = el('button', {
        type: 'button',
        class: 'plc-preset-chip',
        text: preset.label,
        on: {
          click: () => {
            const next = applyPreset(preset.id);
            if (next) { context = next; onChange?.(context); paint(); }
          },
        },
      });
      button.title = preset.note;
      presetRow.appendChild(button);
    }
    editor.appendChild(presetRow);
    editor.appendChild(el('p', {
      class: 'pl-hint',
      text: 'A preset is a starting row, not a rule. Every exercise runs in any key, '
        + 'any tuning, and any collection this instrument allows.',
    }));
  }

  function paint() {
    line.textContent = describeContext(context);
    const extra = describeOptions(context);
    options.textContent = extra.length ? extra.join(' · ') : '';
    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', `Context: ${describeContext(context)}. Open the editor.`);
    editor.hidden = !open;
    root.classList.toggle('open', open);
    paintEditor();
  }

  /** Paint the row with a context from outside. */
  function render(next) {
    context = normalizeContext(next || {});
    paint();
  }

  paint();

  return { root, render, context: () => context, isFretted: () => isFretted(context) };
}
