// The setup screen: instrument, technique, target, and Start Session.
//
// The technique chips show only the techniques of the selected instrument.
// Each chip carries a remove control, and a text field adds a custom entry.

import { el, clear, chip, pressable, notice } from './dom.js';
import { createWarmUpPanel } from './warmUpPanel.js';

/**
 * True when an instrument label names a drum kit. A player can add "Drum Kit"
 * or "Drums" to the catalog, and both must open the warm-up.
 */
function isDrumKit(label) {
  return /drum/i.test(String(label || ''));
}

/**
 * @param {Object} lab the Practice Lab service
 * @param {{ onStarted: Function }} handlers
 * @returns {{ root: HTMLElement, refresh: Function }}
 */
export function createSetupView(lab, { onStarted } = {}) {
  let instrumentId = '';
  let techniqueId = '';

  const warmUp = createWarmUpPanel(lab, { mode: 'setup' });
  const warmUpBlock = el('div', { class: 'pl-setup-block pl-setup-warmup' }, [warmUp.root]);
  warmUpBlock.hidden = true;

  const instrumentRow = el('div', { class: 'pl-chip-row' });
  const techniqueRow = el('div', { class: 'pl-chip-row' });

  const instrumentInput = el('input', {
    type: 'text', class: 'pl-text', placeholder: 'Add an instrument',
    attrs: { 'aria-label': 'Add an instrument', maxlength: '40' },
  });
  const techniqueInput = el('input', {
    type: 'text', class: 'pl-text', placeholder: 'Add a technique',
    attrs: { 'aria-label': 'Add a technique', maxlength: '60' },
  });
  const targetInput = el('textarea', {
    class: 'pl-textarea', rows: 2,
    placeholder: 'What are you working on? For example: clean 16ths at 110 BPM on one string.',
    attrs: { 'aria-label': 'Session target', maxlength: '280' },
  });

  const startBtn = pressable({
    label: 'Start Session',
    className: 'primary large',
    onPress: () => start(),
  });

  const problem = el('p', { class: 'pl-notice pl-notice-warn', text: '' });
  problem.hidden = true;

  function setProblem(message) {
    problem.textContent = message || '';
    problem.hidden = !message;
  }

  async function addInstrument() {
    const entry = await lab.addInstrument(instrumentInput.value);
    if (!entry) return;
    instrumentInput.value = '';
    instrumentId = entry.id;
    techniqueId = '';
    paint();
  }

  async function addTechnique() {
    if (!instrumentId) {
      setProblem('Pick an instrument first.');
      return;
    }
    const entry = await lab.addTechnique(instrumentId, techniqueInput.value);
    if (!entry) return;
    techniqueInput.value = '';
    techniqueId = entry.id;
    paint();
  }

  function paintInstruments() {
    clear(instrumentRow);
    const list = lab.instruments();
    if (!list.length) {
      instrumentRow.appendChild(notice('No instruments left. Add one below.'));
      return;
    }
    for (const entry of list) {
      instrumentRow.appendChild(chip({
        label: entry.label,
        selected: entry.id === instrumentId,
        onSelect: () => {
          instrumentId = entry.id;
          techniqueId = '';
          setProblem('');
          paint();
        },
        onRemove: async () => {
          await lab.removeInstrument(entry.id);
          if (instrumentId === entry.id) { instrumentId = ''; techniqueId = ''; }
          paint();
        },
        removeLabel: `Remove the instrument ${entry.label}`,
      }));
    }
  }

  function paintTechniques() {
    clear(techniqueRow);
    if (!instrumentId) {
      techniqueRow.appendChild(notice('Pick an instrument to see its techniques.'));
      return;
    }
    const list = lab.techniques(instrumentId);
    if (!list.length) {
      techniqueRow.appendChild(notice('No techniques left for this instrument. Add one below.'));
      return;
    }
    for (const entry of list) {
      techniqueRow.appendChild(chip({
        label: entry.label,
        selected: entry.id === techniqueId,
        onSelect: () => { techniqueId = entry.id; setProblem(''); paint(); },
        onRemove: async () => {
          await lab.removeTechnique(instrumentId, entry.id);
          if (techniqueId === entry.id) techniqueId = '';
          paint();
        },
        removeLabel: `Remove the technique ${entry.label}`,
      }));
    }
  }

  // The warm-up is a drum warm-up, so it opens only when the session is a drum
  // session. Picking one costs a read of the saved sessions, so it waits for
  // the player to choose the instrument.
  function paintWarmUp() {
    const drums = isDrumKit(labelOf(lab.instruments(), instrumentId));
    warmUpBlock.hidden = !drums;
    if (drums) warmUp.ensure();
    else lab.clearWarmUp();
  }

  function paint() {
    paintInstruments();
    paintTechniques();
    paintWarmUp();
  }

  function labelOf(list, id) {
    return (list.find(e => e.id === id) || {}).label || '';
  }

  async function start() {
    const instrument = labelOf(lab.instruments(), instrumentId);
    const technique = labelOf(lab.techniques(instrumentId), techniqueId);
    if (!instrument) { setProblem('Pick an instrument.'); return; }
    if (!technique) { setProblem('Pick a technique.'); return; }
    const target = targetInput.value.trim();
    if (!target) { setProblem('Write the target of this session.'); return; }
    setProblem('');
    startBtn.disabled = true;
    try {
      const session = await lab.startSession({
        instrument,
        technique,
        target,
        warmUp: warmUpBlock.hidden ? null : warmUp.choice(),
      });
      onStarted?.(session);
    } finally {
      startBtn.disabled = false;
    }
  }

  const root = el('div', { class: 'pl-setup' }, [
    el('div', { class: 'pl-setup-lead' }, [
      el('h3', { class: 'pl-setup-title', text: 'New session' }),
      el('p', { class: 'pl-setup-sub', text: 'One session, one technique, one target.' }),
    ]),
    el('div', { class: 'pl-setup-block' }, [
      el('span', { class: 'pl-field-label', text: '1 · Instrument' }),
      instrumentRow,
      el('div', { class: 'pl-add-row' }, [
        instrumentInput,
        pressable({ label: 'Add', onPress: addInstrument, ariaLabel: 'Add this instrument' }),
      ]),
    ]),
    el('div', { class: 'pl-setup-block' }, [
      el('span', { class: 'pl-field-label', text: '2 · Technique' }),
      techniqueRow,
      el('div', { class: 'pl-add-row' }, [
        techniqueInput,
        pressable({ label: 'Add', onPress: addTechnique, ariaLabel: 'Add this technique' }),
      ]),
    ]),
    el('div', { class: 'pl-setup-block' }, [
      el('span', { class: 'pl-field-label', text: '3 · Target' }),
      targetInput,
    ]),
    warmUpBlock,
    problem,
    el('div', { class: 'pl-setup-actions' }, [startBtn]),
  ]);

  instrumentInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addInstrument(); }
  });
  techniqueInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addTechnique(); }
  });

  paint();
  return {
    root,
    refresh: paint,
    /** Drop the score players of the warm-up cards. */
    stop() { warmUp.stop(); },
  };
}
