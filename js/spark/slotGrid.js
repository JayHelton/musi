// The slot grid of Riff Spark.
//
// One row per bar. Each slot is a button that shows its role, or a note name
// when the pedal tab lends one. The pulse slots carry a mark, and the count
// line under the row reads "1 e & a".

import { meterById, barCells, countLine, ROLE_MARKS, ROLE_WORDS } from './cadenceModel.js';
import { el, clear } from './dom.js';

/**
 * @param {{onCell?: (index: number) => void}} handlers
 * @returns {{root: HTMLElement, render: Function, setPlayhead: Function}}
 */
export function createSlotGrid({ onCell } = {}) {
  const root = el('div', { class: 'sk-grid' });
  let slots = [];

  /**
   * @param {{cadence: Object, labels?: Map<number, string>}} next
   */
  function render({ cadence, labels = null }) {
    clear(root);
    slots = [];
    const meter = meterById(cadence.meter);
    const counts = countLine(meter.id);
    for (let b = 0; b < cadence.bars; b += 1) {
      const cells = barCells(cadence, b);
      const bar = el('div', { class: 'sk-bar' });
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', `Bar ${b + 1}`);
      for (let start = 0; start < cells.length; start += meter.pulse) {
        const group = el('div', { class: 'sk-group' });
        for (let k = start; k < Math.min(start + meter.pulse, cells.length); k += 1) {
          const index = b * meter.slots + k;
          const role = cells[k];
          const label = labels && labels.has(index) ? labels.get(index) : ROLE_MARKS[role];
          const button = el('button', {
            type: 'button',
            class: `sk-slot${role ? ` on ${role}` : ''}${k % meter.pulse === 0 ? ' beat' : ''}`,
            on: { click: () => onCell?.(index) },
          }, [
            el('span', { class: 'sk-slot-mark', text: label }),
            el('span', { class: 'sk-slot-count', text: counts[k] }),
          ]);
          button.setAttribute('aria-pressed', role ? 'true' : 'false');
          button.setAttribute('aria-label', `Bar ${b + 1}, slot ${k + 1}: ${role ? ROLE_WORDS[role] : 'rest'}`);
          button.title = role ? ROLE_WORDS[role] : 'Rest';
          slots[index] = button;
          group.appendChild(button);
        }
        bar.appendChild(group);
      }
      root.appendChild(bar);
    }
  }

  function setPlayhead(index) {
    slots.forEach((node, i) => { if (node) node.classList.toggle('playing', i === index); });
  }

  return { root, render, setPlayhead };
}
