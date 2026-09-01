// The Motif Lab of Composition Lab.
//
// One original and five descendants. Each descendant carries a transformation
// card, and the card names what stays and what changes. The pair sits above
// every variant, because a list of five saved riffs teaches nothing on its own.

import {
  TRANSFORM_CARDS, TRANSFORM_GROUPS, VARIANT_SLOTS, cardById,
  variantBrief, setVariantCard, setVariantNote, familyProgress,
} from '../model/motifLab.js';
import { describeGrid, gridStats } from '../model/rhythmGrid.js';
import { el, clear, panel } from './dom.js';

function cardOptions() {
  const out = [];
  for (const group of TRANSFORM_GROUPS) {
    out.push({ type: 'label', label: group.label });
    for (const card of TRANSFORM_CARDS.filter(c => c.group === group.id)) {
      out.push({ id: card.id, label: card.label });
    }
  }
  return out;
}

function cardSelect(value, onChange) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange(node.value) },
  });
  let group = null;
  for (const entry of cardOptions()) {
    if (entry.type === 'label') {
      group = el('optgroup');
      group.label = entry.label;
      node.appendChild(group);
      continue;
    }
    (group || node).appendChild(el('option', { value: entry.id, text: entry.label }));
  }
  node.value = value;
  node.setAttribute('aria-label', 'Transformation');
  return node;
}

/**
 * Build the Motif Lab.
 * @param {{onChange: Function}} handlers `onChange` receives the new family
 * @returns {{root: HTMLElement, render: Function}}
 */
export function createMotifPanel({ onChange } = {}) {
  let family = null;
  let grid = [];

  const original = panel('Original', 'plc-motif-original');
  const identityInput = el('input', {
    type: 'text',
    class: 'pl-text',
    placeholder: 'The part that must survive every variation.',
    on: { input: () => onChange?.({ ...family, identity: identityInput.value }) },
  });
  identityInput.setAttribute('aria-label', 'Motif identity');

  const originalNote = el('textarea', {
    class: 'pl-textarea',
    rows: 2,
    placeholder: 'What is the original idea?',
    on: {
      input: () => onChange?.({
        ...family,
        original: { ...family.original, note: originalNote.value },
      }),
    },
  });
  originalNote.setAttribute('aria-label', 'The original idea');

  const gridLine = el('code', { class: 'plc-motif-grid' });

  original.body.append(
    el('label', { class: 'pl-field' }, [
      el('span', { class: 'pl-field-label', text: 'Motif identity — what stays in every variant' }),
      identityInput,
    ]),
    el('label', { class: 'pl-field' }, [
      el('span', { class: 'pl-field-label', text: 'The original idea' }),
      originalNote,
    ]),
    gridLine,
  );

  const variants = el('div', { class: 'plc-variants' });
  const progress = el('p', { class: 'pl-hint plc-motif-progress' });

  const root = el('div', { class: 'plc-motif' }, [original.root, variants, progress]);

  function paintVariants() {
    clear(variants);
    for (const slot of VARIANT_SLOTS) {
      const variant = (family.variants || []).find(v => v.id === slot.id);
      if (!variant) continue;
      const briefText = variantBrief(family, variant.id);
      const card = cardById(variant.cardId);

      const select = cardSelect(variant.cardId, (value) => {
        onChange?.(setVariantCard(family, variant.id, value));
      });

      const note = el('textarea', {
        class: 'pl-textarea',
        rows: 2,
        value: variant.note || '',
        placeholder: 'What did you write, and what did you keep?',
        on: { input: () => onChange?.(setVariantNote(family, variant.id, note.value)) },
      });
      note.setAttribute('aria-label', `${variant.label} notes`);

      const box = panel(`${variant.label}${variant.done ? ' — written' : ''}`, 'plc-variant');
      box.body.append(
        el('label', { class: 'pl-field' }, [
          el('span', { class: 'pl-field-label', text: 'Transformation' }),
          select,
        ]),
        el('p', { class: 'plc-keep', text: `What stays: ${briefText ? briefText.stays : ''}` }),
        el('p', { class: 'plc-change', text: `What changes: ${briefText ? briefText.changes : ''}` }),
        el('p', { class: 'pl-hint', text: card ? card.how : '' }),
        note,
      );
      variants.appendChild(box.root);
    }
  }

  function paintOriginal() {
    identityInput.value = family.identity || '';
    originalNote.value = family.original?.note || '';
    const cells = Array.isArray(family.original?.grid) && family.original.grid.length
      ? family.original.grid
      : grid;
    if (cells.length) {
      const stats = gridStats(cells);
      gridLine.textContent = `${describeGrid(cells)}  ·  ${stats.attacks} attacks`;
      gridLine.hidden = false;
    } else {
      gridLine.hidden = true;
    }
  }

  /**
   * Paint the lab.
   * @param {{family: Object, grid?: boolean[]}} next
   */
  function render(next = {}) {
    family = next.family;
    grid = Array.isArray(next.grid) ? next.grid : [];
    if (!family) return;
    paintOriginal();
    paintVariants();
    const done = familyProgress(family);
    progress.textContent = `${done.done} of ${done.total} variants written.`;
  }

  return { root, render };
}
