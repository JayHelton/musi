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

console.log('workbook companion-panel: ok');
