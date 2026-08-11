// Workbook companion tools settings drawer / bottom sheet.

import {
  COMPANION_TYPES,
  MAX_COMPANIONS,
  MAX_FRET,
  MAX_LABEL_LEN,
  describeCompanion,
} from './exerciseCompanions/index.js';
import { ROOTS } from './theory.js';
import { orderedScaleNames } from './scales.js';
import { TRIAD_QUALITIES, stringSetsForTuning } from './triadReference.js';
import { SWEEP_STRING_SETS, sweepQualities, patternsForStringSet, inversionOptionsFor } from './sweepPatterns.js';
import { TUNING_CATALOG } from './tunings.js';

const SHEET_MQ = '(max-width: 768px) and (min-height: 501px)';
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const nodes = [...container.querySelectorAll(FOCUSABLE)]
    .filter((node) => node.offsetParent !== null || node === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function fieldLabel(text, forId) {
  return el('label', { class: 'wb-cmp-field-label', for: forId, text });
}

function fieldWrap(labelText, control, forId) {
  const wrap = el('div', { class: 'wb-cmp-field' });
  wrap.appendChild(fieldLabel(labelText, forId));
  wrap.appendChild(control);
  return wrap;
}

function rootSelect(id, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Root note' });
  for (const r of ROOTS) {
    const opt = el('option', { value: r, text: r });
    if (r === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function scaleSelect(id, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Scale' });
  for (const name of orderedScaleNames()) {
    const opt = el('option', { value: name, text: name });
    if (name === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function tuningSelect(id, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Tuning' });
  for (const preset of TUNING_CATALOG) {
    const opt = el('option', { value: preset.name, text: preset.name });
    if (preset.name === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function qualitySelect(id, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Triad quality' });
  for (const q of TRIAD_QUALITIES) {
    const opt = el('option', { value: q.id, text: q.name });
    if (q.id === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function triadStringSetSelect(id, tuning, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'String set' });
  const sets = stringSetsForTuning(tuning);
  sets.forEach((set, idx) => {
    const opt = el('option', { value: String(idx), text: set.label || set.name || `Set ${idx + 1}` });
    if (idx === value) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function sweepStringSetSelect(id, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'String set' });
  for (const key of [3, 4, 5]) {
    const set = SWEEP_STRING_SETS[key];
    const opt = el('option', { value: String(key), text: set.label });
    if (key === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function patternSelect(id, stringSet, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Pattern' });
  const patterns = patternsForStringSet(stringSet);
  for (const p of patterns.length ? patterns : sweepQualities()) {
    const opt = el('option', { value: p.id, text: p.name });
    if (p.id === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function inversionSelect(id, patternId, stringSet, root, value) {
  const sel = el('select', { class: 'wb-cmp-select', id, 'aria-label': 'Inversion' });
  const opts = inversionOptionsFor(patternId, stringSet, root);
  opts.forEach((inv, idx) => {
    const opt = el('option', { value: String(idx), text: inv.label || inv.name || `Inv ${idx}` });
    if (idx === value) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

/**
 * @param {HTMLElement} host
 * @param {object} api
 * @param {string} api.workbookId
 * @param {() => object|null} api.getWorkbook
 * @param {(type: string) => void} api.onAdd
 * @param {(companionId: string, patch: object) => void} api.onUpdate
 * @param {(companionId: string) => void} api.onRemove
 * @param {(companionId: string, delta: number) => void} api.onMove
 * @param {(orderedIds: string[]) => void} [api.onReorder]
 * @param {() => void} api.onChanged
 * @param {(open: boolean) => void} [api.onOpenChange]
 */
export function mountWorkbookCompanionPanel(host, api) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    isOpen: () => false,
    sync() {},
    destroy() {},
  };
  if (!host || !api?.workbookId || typeof api.getWorkbook !== 'function') return noop;

  let drawerOpen = false;
  let sheetMode = false;
  let lastFocus = null;
  let escHandler = null;

  const root = el('div', { class: 'wb-cmp-root' });
  const backdrop = el('div', { class: 'wb-cmp-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'wb-cmp-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Workbook tools',
  });
  const sheet = el('div', {
    class: 'wb-cmp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Workbook tools',
  });
  sheet.appendChild(el('div', { class: 'wb-cmp-sheet-handle', 'aria-hidden': 'true' }));
  const drawerBody = el('div', { class: 'wb-cmp-drawer-body' });
  const sheetBody = el('div', { class: 'wb-cmp-drawer-body' });
  const panelBody = el('div', { class: 'wb-cmp-panel-body' });

  function head(title) {
    return el('div', { class: 'wb-cmp-drawer-head' }, [
      el('span', { class: 'wb-cmp-drawer-title', text: title }),
      el('button', {
        class: 'wb-cmp-drawer-close btn sm',
        type: 'button',
        text: '✕',
        'aria-label': 'Close workbook tools',
        title: 'Close',
        onClick: () => close(),
      }),
    ]);
  }

  drawer.append(head('Workbook tools'), drawerBody);
  sheet.append(head('Workbook tools'), sheetBody);
  root.append(backdrop, drawer, sheet);
  host.appendChild(root);

  const listHost = el('div', { class: 'wb-cmp-list' });
  const emptyNote = el('p', {
    class: 'wb-cmp-empty',
    text: 'No companion tools yet. Add a scale, triad, sweep, or pitch trainer below.',
  });
  const addSection = el('section', { class: 'wb-cmp-add-section' });
  const addTitle = el('h4', { class: 'wb-cmp-section-title', text: 'Add tool' });
  const typePicker = el('div', { class: 'wb-cmp-type-picker' });

  panelBody.append(
    el('section', { class: 'wb-cmp-section' }, [
      el('h4', { class: 'wb-cmp-section-title', text: 'Pinned tools' }),
      emptyNote,
      listHost,
    ]),
    addSection,
  );
  addSection.append(addTitle, typePicker);

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (panelBody.parentElement !== target) target.appendChild(panelBody);
  }

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  function paintDrawer() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', drawerOpen);
    drawer.classList.toggle('is-open', drawerOpen && !sheetMode);
    sheet.classList.toggle('is-open', drawerOpen && sheetMode);
    backdrop.setAttribute('aria-hidden', drawerOpen ? 'false' : 'true');
    drawer.setAttribute('aria-hidden', drawerOpen && !sheetMode ? 'false' : 'true');
    sheet.setAttribute('aria-hidden', drawerOpen && sheetMode ? 'false' : 'true');
    document.body.classList.toggle('wb-cmp-drawer-open', drawerOpen);
  }

  function buildEditFields(companion, prefix) {
    const fields = el('div', { class: 'wb-cmp-edit-fields' });
    const typeMeta = COMPANION_TYPES.find((t) => t.id === companion.type);
    const needs = new Set(typeMeta?.needs || []);

    const labelId = `${prefix}-label`;
    const labelInput = el('input', {
      type: 'text',
      class: 'wb-cmp-input',
      id: labelId,
      maxlength: String(MAX_LABEL_LEN),
      'aria-label': 'Optional label',
      value: companion.label || '',
    });
    fields.appendChild(fieldWrap('Label (optional)', labelInput, labelId));

    let rootSel;
    let scaleSel;
    let tuningSel;
    let qualitySel;
    let triadSetSel;
    let sweepSetSel;
    let patternSel;
    let inversionSel;
    let fretStartInput;
    let fretEndInput;

    if (needs.has('root')) {
      const rootId = `${prefix}-root`;
      rootSel = rootSelect(rootId, companion.root);
      fields.appendChild(fieldWrap('Root', rootSel, rootId));
    }
    if (needs.has('scale')) {
      const scaleId = `${prefix}-scale`;
      scaleSel = scaleSelect(scaleId, companion.scale);
      fields.appendChild(fieldWrap('Scale', scaleSel, scaleId));
    }
    if (needs.has('quality')) {
      const qId = `${prefix}-quality`;
      qualitySel = qualitySelect(qId, companion.quality);
      fields.appendChild(fieldWrap('Quality', qualitySel, qId));
    }
    if (needs.has('tuning')) {
      const tId = `${prefix}-tuning`;
      tuningSel = tuningSelect(tId, companion.tuning);
      fields.appendChild(fieldWrap('Tuning', tuningSel, tId));
    }
    if (needs.has('stringSet') && companion.type === 'triad-ref') {
      const ssId = `${prefix}-triad-set`;
      triadSetSel = triadStringSetSelect(ssId, companion.tuning, companion.stringSet);
      fields.appendChild(fieldWrap('String set', triadSetSel, ssId));
    }
    if (needs.has('stringSet') && companion.type === 'sweep-ref') {
      const ssId = `${prefix}-sweep-set`;
      sweepSetSel = sweepStringSetSelect(ssId, companion.stringSet);
      fields.appendChild(fieldWrap('String set', sweepSetSel, ssId));
    }
    if (needs.has('pattern')) {
      const pId = `${prefix}-pattern`;
      patternSel = patternSelect(pId, companion.stringSet, companion.patternId);
      fields.appendChild(fieldWrap('Pattern', patternSel, pId));
    }
    if (needs.has('inversion')) {
      const invId = `${prefix}-inversion`;
      inversionSel = inversionSelect(
        invId,
        companion.patternId,
        companion.stringSet,
        companion.root,
        companion.inversion,
      );
      fields.appendChild(fieldWrap('Inversion', inversionSel, invId));
    }
    if (needs.has('fretRange')) {
      const fsId = `${prefix}-fret-start`;
      const feId = `${prefix}-fret-end`;
      fretStartInput = el('input', {
        type: 'number',
        class: 'wb-cmp-input',
        id: fsId,
        min: '0',
        max: String(MAX_FRET),
        'aria-label': 'Fret start',
        value: String(companion.fretStart ?? 0),
      });
      fretEndInput = el('input', {
        type: 'number',
        class: 'wb-cmp-input',
        id: feId,
        min: '0',
        max: String(MAX_FRET),
        'aria-label': 'Fret end',
        value: String(companion.fretEnd ?? 12),
      });
      fields.appendChild(fieldWrap('Fret start', fretStartInput, fsId));
      fields.appendChild(fieldWrap('Fret end', fretEndInput, feId));
    }

    function collectPatch() {
      const patch = { label: labelInput.value };
      if (rootSel) patch.root = rootSel.value;
      if (scaleSel) patch.scale = scaleSel.value;
      if (qualitySel) patch.quality = qualitySel.value;
      if (tuningSel) patch.tuning = tuningSel.value;
      if (triadSetSel) patch.stringSet = Number(triadSetSel.value);
      if (sweepSetSel) patch.stringSet = Number(sweepSetSel.value);
      if (patternSel) patch.patternId = patternSel.value;
      if (inversionSel) patch.inversion = Number(inversionSel.value);
      if (fretStartInput) patch.fretStart = Number(fretStartInput.value);
      if (fretEndInput) patch.fretEnd = Number(fretEndInput.value);
      return patch;
    }

    function applyPatch() {
      api.onUpdate?.(companion.id, collectPatch());
      api.onChanged?.();
    }

    labelInput.addEventListener('change', applyPatch);
    [rootSel, scaleSel, qualitySel, tuningSel, triadSetSel, sweepSetSel, patternSel, inversionSel, fretStartInput, fretEndInput]
      .filter(Boolean)
      .forEach((ctrl) => ctrl.addEventListener('change', applyPatch));

    if (tuningSel && triadSetSel) {
      tuningSel.addEventListener('change', () => {
        const next = triadStringSetSelect(triadSetSel.id, tuningSel.value, 0);
        triadSetSel.replaceWith(next);
        triadSetSel = next;
        triadSetSel.addEventListener('change', applyPatch);
        applyPatch();
      });
    }
    if (sweepSetSel && patternSel) {
      sweepSetSel.addEventListener('change', () => {
        const ss = Number(sweepSetSel.value);
        const nextPat = patternSelect(patternSel.id, ss, patternsForStringSet(ss)[0]?.id);
        patternSel.replaceWith(nextPat);
        patternSel = nextPat;
        patternSel.addEventListener('change', () => {
          if (inversionSel) {
            const invNext = inversionSelect(
              inversionSel.id,
              patternSel.value,
              ss,
              rootSel?.value || companion.root,
              0,
            );
            inversionSel.replaceWith(invNext);
            inversionSel = invNext;
            inversionSel.addEventListener('change', applyPatch);
          }
          applyPatch();
        });
        if (inversionSel) {
          const invNext = inversionOptionsFor(patternSel.value, ss, rootSel?.value || companion.root);
          if (invNext.length) {
            const invSel = inversionSelect(inversionSel.id, patternSel.value, ss, rootSel?.value || companion.root, 0);
            inversionSel.replaceWith(invSel);
            inversionSel = invSel;
            inversionSel.addEventListener('change', applyPatch);
          }
        }
        applyPatch();
      });
    }
    if (patternSel && inversionSel) {
      patternSel.addEventListener('change', () => {
        const ss = Number(sweepSetSel?.value ?? companion.stringSet);
        const invNext = inversionSelect(
          inversionSel.id,
          patternSel.value,
          ss,
          rootSel?.value || companion.root,
          0,
        );
        inversionSel.replaceWith(invNext);
        inversionSel = invNext;
        inversionSel.addEventListener('change', applyPatch);
        applyPatch();
      });
    }

    return fields;
  }

  function renderCompanionRow(companion, index, total) {
    const row = el('article', { class: 'wb-cmp-item', 'data-companion-id': companion.id });
    const summary = el('div', { class: 'wb-cmp-item-head' });
    const typeLabel = COMPANION_TYPES.find((t) => t.id === companion.type)?.label || companion.type;
    summary.appendChild(el('span', { class: 'wb-cmp-item-type', text: typeLabel }));
    summary.appendChild(el('span', { class: 'wb-cmp-item-desc', text: describeCompanion(companion) }));

    const tools = el('div', { class: 'wb-cmp-item-tools' });
    tools.appendChild(el('button', {
      class: 'btn sm wb-cmp-move',
      type: 'button',
      text: '↑',
      'aria-label': 'Move up',
      disabled: index === 0 ? 'true' : undefined,
      onClick: () => {
        api.onMove?.(companion.id, -1);
        api.onChanged?.();
      },
    }));
    tools.appendChild(el('button', {
      class: 'btn sm wb-cmp-move',
      type: 'button',
      text: '↓',
      'aria-label': 'Move down',
      disabled: index >= total - 1 ? 'true' : undefined,
      onClick: () => {
        api.onMove?.(companion.id, 1);
        api.onChanged?.();
      },
    }));
    tools.appendChild(el('button', {
      class: 'btn sm wb-cmp-remove',
      type: 'button',
      text: 'Remove',
      'aria-label': 'Remove tool',
      onClick: () => {
        api.onRemove?.(companion.id);
        api.onChanged?.();
      },
    }));
    summary.appendChild(tools);
    row.appendChild(summary);
    row.appendChild(buildEditFields(companion, `cmp-${companion.id}`));
    return row;
  }

  function renderTypePicker(count) {
    typePicker.innerHTML = '';
    if (count >= MAX_COMPANIONS) {
      typePicker.appendChild(el('p', {
        class: 'wb-cmp-cap-note',
        text: `Maximum of ${MAX_COMPANIONS} tools reached. Remove one to add another.`,
      }));
      return;
    }
    for (const type of COMPANION_TYPES) {
      const card = el('button', {
        class: 'wb-cmp-type-card',
        type: 'button',
        'aria-label': `Add ${type.label}`,
      });
      card.appendChild(el('span', { class: 'wb-cmp-type-card-label', text: type.label }));
      card.appendChild(el('span', { class: 'wb-cmp-type-card-desc', text: type.description }));
      card.addEventListener('click', () => {
        api.onAdd?.(type.id);
        api.onChanged?.();
      });
      typePicker.appendChild(card);
    }
  }

  function sync() {
    const wb = api.getWorkbook();
    const companions = wb?.companions || [];
    listHost.innerHTML = '';
    emptyNote.hidden = companions.length > 0;
    companions.forEach((c, i) => {
      listHost.appendChild(renderCompanionRow(c, i, companions.length));
    });
    renderTypePicker(companions.length);
  }

  function onKeydown(e) {
    if (!drawerOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const shell = sheetMode ? sheet : drawer;
    trapFocus(shell, e);
  }

  function open() {
    if (drawerOpen) return;
    lastFocus = document.activeElement;
    drawerOpen = true;
    sync();
    paintDrawer();
    if (!escHandler) {
      escHandler = onKeydown;
      document.addEventListener('keydown', escHandler, true);
    }
    api.onOpenChange?.(true);
    const shell = sheetMode ? sheet : drawer;
    shell.querySelector('.wb-cmp-drawer-close')?.focus();
  }

  function close() {
    if (!drawerOpen) return;
    drawerOpen = false;
    paintDrawer();
    if (escHandler) {
      document.removeEventListener('keydown', escHandler, true);
      escHandler = null;
    }
    api.onOpenChange?.(false);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    lastFocus = null;
  }

  function toggle() {
    if (drawerOpen) close();
    else open();
  }

  backdrop.addEventListener('click', close);

  const mq = window.matchMedia(SHEET_MQ);
  const onMq = () => {
    if (drawerOpen) paintDrawer();
  };
  mq.addEventListener('change', onMq);

  sync();
  paintDrawer();

  return {
    open,
    close,
    toggle,
    isOpen: () => drawerOpen,
    sync,
    destroy() {
      close();
      mq.removeEventListener('change', onMq);
      root.remove();
    },
  };
}
