// Section notes drawer / bottom sheet for the GP parchment player.

import { el } from './dom.js';
import { icon } from './icons.js';

function formatRange(anno) {
  if (anno.measureStart != null && anno.measureEnd != null) {
    const a = anno.measureStart + 1;
    const b = anno.measureEnd + 1;
    return a === b ? `Bar ${a}` : `Bars ${a}–${b}`;
  }
  if (Number.isFinite(anno.startBeat) && Number.isFinite(anno.endBeat)) {
    return `Beats ${anno.startBeat}–${anno.endBeat}`;
  }
  return 'Section';
}

function previewText(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const one = t.replace(/\s+/g, ' ');
  return one.length > 72 ? `${one.slice(0, 70)}…` : one;
}

/**
 * @param {HTMLElement} host
 */
export function mountAnnotationsDrawer(host, {
  getScoreKey = () => '',
  getAnnotations = () => [],
  getCurrentSelection = () => null,
  onSave = null,
  onDelete = null,
  onNavigate = null,
} = {}) {
  const noop = {
    open() {},
    close() {},
    toggle() {},
    sync() {},
    destroy() {},
    isOpen: () => false,
    showEditor() {},
  };
  if (!host) return noop;

  let openState = false;
  let sheetMode = false;
  let selectedId = null;
  let editing = null;

  const backdrop = el('div', { class: 'gpp-drawer-backdrop', 'aria-hidden': 'true' });
  const drawer = el('div', {
    class: 'gpp-drawer gpp-anno-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Section notes',
  });
  const sheet = el('div', {
    class: 'gpp-sheet gpp-anno-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Section notes',
  });
  sheet.appendChild(el('div', { class: 'gpp-sheet-handle' }));

  const drawerBody = el('div', { class: 'gpp-drawer-body gpp-anno-drawer-body' });
  const sheetBody = el('div', { class: 'gpp-drawer-body gpp-anno-drawer-body' });

  const addNoteBtn = el('button', {
    class: 'btn sm primary gpp-anno-add-btn',
    type: 'button',
    text: 'Add note',
    'aria-label': 'Add section note',
  });
  const noKeyHint = el('p', {
    class: 'gpp-anno-hint gpp-anno-no-key',
    text: 'Open from Exercises or save the score so notes persist.',
    hidden: true,
  });
  const selectHint = el('p', {
    class: 'gpp-anno-hint gpp-anno-select-hint',
    text: 'Long-press a bar on the score, or drag across bars while this panel is open.',
    hidden: true,
    role: 'status',
    'aria-live': 'polite',
  });
  const emptyHint = el('p', {
    class: 'gpp-anno-hint',
    text: 'Long-press any bar to add a note, or drag a range on the score while this panel is open.',
  });
  const listEl = el('div', { class: 'gpp-anno-list' });
  const editorWrap = el('div', { class: 'gpp-anno-editor', hidden: true });
  const editorMeta = el('div', { class: 'gpp-anno-editor-meta' });
  const titleInput = el('input', {
    class: 'gpp-anno-title-input',
    type: 'text',
    placeholder: 'Short label (optional)',
    'aria-label': 'Note title',
    maxlength: '80',
  });
  const textInput = el('textarea', {
    class: 'gpp-anno-text-input',
    rows: '5',
    placeholder: 'What are you practicing here?',
    'aria-label': 'Note text',
  });
  const actionsRow = el('div', { class: 'gpp-anno-actions' });
  const saveBtn = el('button', { class: 'btn sm primary', type: 'button', text: 'Save' });
  const cancelBtn = el('button', { class: 'btn sm', type: 'button', text: 'Cancel' });
  const deleteBtn = el('button', {
    class: 'btn sm gpp-danger',
    type: 'button',
    text: 'Delete',
    hidden: true,
  });
  actionsRow.append(saveBtn, cancelBtn, deleteBtn);
  editorWrap.append(editorMeta, titleInput, textInput, actionsRow);

  const contentBody = el('div', { class: 'gpp-anno-body' }, [
    el('div', { class: 'gpp-anno-toolbar' }, [addNoteBtn]),
    noKeyHint,
    selectHint,
    emptyHint,
    listEl,
    editorWrap,
  ]);

  drawer.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Section notes' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close section notes',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    drawerBody,
  );
  sheet.append(
    el('div', { class: 'gpp-drawer-head' }, [
      el('span', { class: 'gpp-drawer-title', text: 'Section notes' }),
      el('button', {
        class: 'gpp-icon-btn gpp-drawer-close',
        type: 'button',
        html: icon('close'),
        'aria-label': 'Close section notes',
        title: 'Close',
        onClick: () => close(),
      }),
    ]),
    sheetBody,
  );
  host.append(backdrop, drawer, sheet);

  function hasScoreKey() {
    const key = typeof getScoreKey === 'function' ? getScoreKey() : '';
    return typeof key === 'string' && key.trim().length > 0;
  }

  function paintAddBtn() {
    const ok = hasScoreKey();
    addNoteBtn.disabled = !ok;
    noKeyHint.hidden = ok;
  }

  function updateEmptyHint() {
    const items = typeof getAnnotations === 'function' ? getAnnotations() : [];
    emptyHint.hidden = items.length > 0 || editing != null || !selectHint.hidden;
  }

  function hideSelectHint() {
    selectHint.hidden = true;
    updateEmptyHint();
  }

  function showSelectHint() {
    selectHint.hidden = false;
    emptyHint.hidden = true;
  }

  function renderList() {
    const items = typeof getAnnotations === 'function' ? getAnnotations() : [];
    listEl.innerHTML = '';
    updateEmptyHint();
    if (!items.length) return;
    items.forEach((anno) => {
      const item = el('button', {
        class: 'gpp-anno-item' + (anno.id === selectedId ? ' is-selected' : ''),
        type: 'button',
        'aria-pressed': anno.id === selectedId ? 'true' : 'false',
        onClick: () => {
          selectedId = anno.id;
          hideSelectHint();
          if (typeof onNavigate === 'function') onNavigate(anno);
          showEditor(anno);
          renderList();
        },
      }, [
        el('span', { class: 'gpp-anno-item-title', text: anno.title || 'Untitled' }),
        el('span', { class: 'gpp-anno-item-meta', text: formatRange(anno) }),
        el('span', { class: 'gpp-anno-item-preview', text: previewText(anno.text) }),
      ]);
      listEl.appendChild(item);
    });
  }

  function showEditor(draftOrAnno) {
    if (!draftOrAnno) {
      editing = null;
      editorWrap.hidden = true;
      updateEmptyHint();
      return;
    }
    editing = { ...draftOrAnno };
    editorWrap.hidden = false;
    emptyHint.hidden = true;
    hideSelectHint();
    editorMeta.textContent = formatRange(editing);
    titleInput.value = editing.title || '';
    textInput.value = editing.text || '';
    deleteBtn.hidden = !editing.id;
    if (editing.id) selectedId = editing.id;
    open();
    renderList();
  }

  function cancelEditor() {
    editing = null;
    editorWrap.hidden = true;
    renderList();
  }

  function commitSave() {
    if (!editing || !hasScoreKey()) return;
    const payload = {
      id: editing.id,
      startBeat: editing.startBeat,
      endBeat: editing.endBeat,
      measureStart: editing.measureStart,
      measureEnd: editing.measureEnd,
      title: titleInput.value,
      text: textInput.value,
    };
    const saved = typeof onSave === 'function' ? onSave(payload) : null;
    if (saved) showEditor(saved);
    else {
      editing = null;
      editorWrap.hidden = true;
      renderList();
    }
  }

  addNoteBtn.addEventListener('click', () => {
    if (!hasScoreKey()) return;
    const sel = typeof getCurrentSelection === 'function' ? getCurrentSelection() : null;
    if (!sel) {
      showSelectHint();
      return;
    }
    hideSelectHint();
    selectedId = null;
    showEditor({
      startBeat: sel.startBeat,
      endBeat: sel.endBeat,
      measureStart: sel.measureStart,
      measureEnd: sel.measureEnd,
    });
  });
  saveBtn.addEventListener('click', () => commitSave());
  cancelBtn.addEventListener('click', () => cancelEditor());
  deleteBtn.addEventListener('click', () => {
    if (!editing?.id) return;
    if (typeof onDelete === 'function') onDelete(editing.id);
    editing = null;
    selectedId = null;
    editorWrap.hidden = true;
    renderList();
  });

  function placeBody() {
    const target = sheetMode ? sheetBody : drawerBody;
    if (contentBody.parentElement !== target) target.appendChild(contentBody);
  }

  // Portrait phone sheet; landscape uses side drawer (must match gpplayer.css)
  const SHEET_MQ = '(max-width: 599px)';

  function detectSheetMode() {
    sheetMode = window.matchMedia(SHEET_MQ).matches;
  }

  const mq = window.matchMedia(SHEET_MQ);
  const onMq = () => { detectSheetMode(); if (openState) paintOpen(); };
  mq.addEventListener?.('change', onMq);

  function paintOpen() {
    detectSheetMode();
    placeBody();
    backdrop.classList.toggle('is-open', openState);
    drawer.classList.toggle('is-open', openState && !sheetMode);
    sheet.classList.toggle('is-open', openState && sheetMode);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function open() {
    detectSheetMode();
    openState = true;
    sync();
    paintOpen();
    if (typeof onNavigate === 'function') onNavigate(null, { noteSelectMode: true });
  }
  function close() {
    openState = false;
    hideSelectHint();
    paintOpen();
    if (typeof onNavigate === 'function') onNavigate(null, { noteSelectMode: false });
  }
  function toggle() {
    if (openState) close();
    else open();
  }

  function sync() {
    paintAddBtn();
    renderList();
    if (editing?.id) {
      const fresh = getAnnotations().find((a) => a.id === editing.id);
      if (fresh) showEditor(fresh);
    }
  }

  backdrop.addEventListener('click', () => close());
  function onKey(e) {
    if (e.key === 'Escape' && openState) close();
  }
  document.addEventListener('keydown', onKey);

  function destroy() {
    mq.removeEventListener?.('change', onMq);
    document.removeEventListener('keydown', onKey);
    host.innerHTML = '';
  }

  placeBody();
  sync();

  return {
    open,
    close,
    toggle,
    sync,
    destroy,
    isOpen: () => openState,
    showEditor,
  };
}
