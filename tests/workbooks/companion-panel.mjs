/**
 * DOM tests for workbook companion settings panel.
 * Run via: node tests/workbooks/run.mjs
 */

import assert from 'node:assert/strict';
import { installDomShim } from '../gp-player/domShim.mjs';

installDomShim();

const { mountWorkbookCompanionPanel } = await import('../../js/workbookCompanionPanel.js');
const {
  createWorkbook,
  addCompanionToWorkbook,
  getWorkbook,
  moveWorkbookCompanion,
  removeWorkbookCompanion,
  updateWorkbookCompanion,
} = await import('../../js/workbookModel.js');
const { metronomePlanSteps } = await import('../../js/exerciseCompanions/index.js');

function mountHost() {
  return document.createElement('div');
}

function makeApi(wb) {
  return {
    workbookId: wb.id,
    getWorkbook: () => getWorkbook(wb.id),
    onAdd: (type) => { addCompanionToWorkbook(wb.id, type); },
    onUpdate: (id, patch) => { updateWorkbookCompanion(wb.id, id, patch); },
    onRemove: (id) => { removeWorkbookCompanion(wb.id, id); },
    onMove: (id, delta) => { moveWorkbookCompanion(wb.id, id, delta); },
    onChanged() {},
  };
}

{
  const host = mountHost();
  const wb = createWorkbook({ name: 'Panel DOM' });
  const openChanges = [];
  const panel = mountWorkbookCompanionPanel(host, {
    ...makeApi(wb),
    onOpenChange: (open) => openChanges.push(open),
  });
  assert.equal(panel.isOpen(), false);
  panel.open();
  assert.equal(panel.isOpen(), true);
  const drawerEl = host.querySelector('.wb-cmp-drawer');
  const sheetEl = host.querySelector('.wb-cmp-sheet');
  assert.ok(
    (drawerEl && drawerEl.classList.contains('is-open'))
    || (sheetEl && sheetEl.classList.contains('is-open')),
  );
  panel.close();
  assert.equal(panel.isOpen(), false);
  assert.deepEqual(openChanges, [true, false]);
  panel.destroy();
}

{
  const host = mountHost();
  const wb = createWorkbook({ name: 'Panel CRUD' });
  const api = makeApi(wb);
  const panel = mountWorkbookCompanionPanel(host, api);
  panel.open();
  const addBtn = host.querySelector('.wb-cmp-type-card');
  assert.ok(addBtn, 'expected add type card');
  addBtn.click();
  panel.sync();
  assert.equal(getWorkbook(wb.id).companions.length, 1);

  const labelInput = host.querySelector('.wb-cmp-input');
  assert.ok(labelInput, 'expected label input');
  labelInput.value = 'Warm-up scale';
  labelInput.change();
  const updated = getWorkbook(wb.id).companions[0];
  assert.equal(updated.label, 'Warm-up scale');

  addCompanionToWorkbook(wb.id, 'triad-ref');
  panel.sync();
  assert.equal(getWorkbook(wb.id).companions.length, 2);

  const removeBtn = host.querySelector('.wb-cmp-remove');
  assert.ok(removeBtn);
  removeBtn.click();
  panel.sync();
  assert.equal(getWorkbook(wb.id).companions.length, 1);

  panel.open();
  document.dispatchKey('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(panel.isOpen(), false);
  panel.destroy();
}

{
  const host = mountHost();
  const wb = createWorkbook({ name: 'Orbit panel' });
  const api = makeApi(wb);
  const panel = mountWorkbookCompanionPanel(host, api);
  panel.open();

  const orbitCard = [...host.querySelectorAll('.wb-cmp-type-card')]
    .find((c) => {
      const label = c.querySelector('.wb-cmp-type-card-label');
      return label?.textContent?.includes('Interval orbit')
        || c.textContent?.includes('Interval orbit');
    });
  assert.ok(orbitCard, 'interval orbit add card');
  orbitCard.click();
  panel.sync();

  const orbit = getWorkbook(wb.id).companions.find((c) => c.type === 'interval-orbit');
  assert.ok(orbit);
  assert.equal(orbit.mode, 'locate');
  assert.equal(orbit.mapRange, 1);

  const prefix = `cmp-${orbit.id}`;
  const mapRangeSel = host.querySelector(`#${prefix}-map-range`);
  const levelSel = host.querySelector(`#${prefix}-level`);
  const modeSel = host.querySelector(`#${prefix}-mode`);
  assert.ok(mapRangeSel && levelSel && modeSel, 'orbit editor fields');

  mapRangeSel.value = '3';
  mapRangeSel.change();
  levelSel.value = '4';
  levelSel.change();
  modeSel.value = 'map';
  modeSel.change();

  const updated = getWorkbook(wb.id).companions.find((c) => c.id === orbit.id);
  assert.equal(updated.mapRange, 3);
  assert.equal(updated.level, 4);
  assert.equal(updated.mode, 'map');

  panel.destroy();
}

{
  const host = mountHost();
  const wb = createWorkbook({ name: 'Ear train panel' });
  const api = makeApi(wb);
  const panel = mountWorkbookCompanionPanel(host, api);
  panel.open();

  const earCard = [...host.querySelectorAll('.wb-cmp-type-card')]
    .find((c) => {
      const label = c.querySelector('.wb-cmp-type-card-label');
      return label?.textContent?.includes('Ear trainer')
        || c.textContent?.includes('Ear trainer');
    });
  assert.ok(earCard, 'ear trainer add card');
  earCard.click();
  panel.sync();

  const ear = getWorkbook(wb.id).companions[0];
  assert.equal(ear.type, 'ear-train');
  assert.equal(ear.earContext, 'root');
  assert.equal(ear.earPool, 'diatonic');
  assert.equal(ear.earAnswer, 'note');

  panel.destroy();
}

{
  const host = mountHost();
  const wb = createWorkbook({ name: 'Metronome panel' });
  const api = makeApi(wb);
  const panel = mountWorkbookCompanionPanel(host, api);
  panel.open();

  const metroCard = [...host.querySelectorAll('.wb-cmp-type-card')]
    .find((c) => {
      const label = c.querySelector('.wb-cmp-type-card-label');
      return label?.textContent === 'Metronome';
    });
  assert.ok(metroCard, 'metronome add card');
  metroCard.click();
  panel.sync();

  const metro = getWorkbook(wb.id).companions.find((c) => c.type === 'metronome');
  assert.ok(metro, 'metronome companion added');
  assert.equal(metro.progression, 'ramp');

  const prefix = `cmp-${metro.id}`;
  const progSel = host.querySelector(`#${prefix}-metro-progression`);
  const startInput = host.querySelector(`#${prefix}-metro-start`);
  const targetInput = host.querySelector(`#${prefix}-metro-target`);
  const stepBpmInput = host.querySelector(`#${prefix}-metro-step-bpm`);
  const stepSecInput = host.querySelector(`#${prefix}-metro-step-seconds`);
  const beatsSel = host.querySelector(`#${prefix}-metro-beats`);
  assert.ok(progSel && startInput && targetInput && stepBpmInput && stepSecInput && beatsSel,
    'metronome ramp editor fields');
  // Rounds belong to the burst progression only.
  assert.equal(host.querySelector(`#${prefix}-metro-rounds`), null);

  startInput.value = '70';
  startInput.change();
  targetInput.value = '110';
  targetInput.change();
  stepBpmInput.value = '10';
  stepBpmInput.change();
  stepSecInput.value = '90';
  stepSecInput.change();
  beatsSel.value = '3';
  beatsSel.change();
  panel.sync();

  const ramped = getWorkbook(wb.id).companions.find((c) => c.id === metro.id);
  assert.equal(ramped.startBpm, 70);
  assert.equal(ramped.targetBpm, 110);
  assert.equal(ramped.stepBpm, 10);
  assert.equal(ramped.stepSeconds, 90);
  assert.equal(ramped.beatsPerBar, 3);
  assert.deepEqual(
    metronomePlanSteps(ramped).map((step) => step.bpm),
    [70, 80, 90, 100, 110],
    'the saved plan resolves to the edited progression',
  );

  // Switching to a custom progression opens the step editor.
  const progSelAgain = host.querySelector(`#${prefix}-metro-progression`);
  progSelAgain.value = 'custom';
  progSelAgain.change();
  panel.sync();

  const secInput = host.querySelector(`#${prefix}-metro-new-seconds`);
  const bpmInput = host.querySelector(`#${prefix}-metro-new-bpm`);
  const subSel = host.querySelector(`#${prefix}-metro-new-subdiv`);
  const addStep = host.querySelector('.wb-cmp-metro-step-add');
  assert.ok(secInput && bpmInput && subSel && addStep, 'custom step editor fields');

  secInput.value = '45';
  bpmInput.value = '95';
  subSel.value = 'triplet';
  addStep.click();
  panel.sync();

  const withStep = getWorkbook(wb.id).companions.find((c) => c.id === metro.id);
  assert.deepEqual(withStep.steps, [{ seconds: 45, bpm: 95, subdiv: 'triplet' }]);
  assert.equal(host.querySelectorAll('.wb-cmp-metro-step-row').length, 1);

  // The stored plan is what a new session reads back.
  assert.deepEqual(metronomePlanSteps(getWorkbook(wb.id).companions.find((c) => c.id === metro.id)),
    [{ seconds: 45, bpm: 95, subdiv: 'triplet' }]);

  host.querySelector('.wb-cmp-metro-step-del').click();
  panel.sync();
  assert.deepEqual(getWorkbook(wb.id).companions.find((c) => c.id === metro.id).steps, []);

  panel.destroy();
}

// Exercise/Tools pane switching is covered by browser verification.

console.log('workbook companion-panel: ok');
