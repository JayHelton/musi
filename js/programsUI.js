import {
  createProgramFromMarkdown,
  deleteProgram,
  getProgramSessions,
  getPrograms,
  parseProgramMarkdown,
  programProgress,
} from './programs.js';
import { openEditor, renderHome as renderSessionsHome, startSession } from './sessionsUI.js';
import { setMarkdown } from './markdown.js';

let showSectionFn = null;
let modalRoot = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(child => {
    if (child == null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

function fmtHours(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = el('div', { id: 'program-modal-root' });
  document.body.appendChild(modalRoot);
  return modalRoot;
}

function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
  document.body.classList.remove('program-modal-open');
}

function openModal(contentNode) {
  ensureModalRoot();
  modalRoot.innerHTML = '';
  const overlay = el('div', { class: 'session-overlay program-overlay' });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
  overlay.appendChild(contentNode);
  modalRoot.appendChild(overlay);
  document.body.classList.add('program-modal-open');
}

function createProgressBar(progress) {
  const pct = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  return el('div', { class: 'program-progress', 'aria-label': `${pct}% complete` }, [
    el('div', { class: 'program-progress-fill', style: `width:${pct}%` }),
  ]);
}

function buildProgramCard(program, { compact = false } = {}) {
  const progress = programProgress(program);
  const card = el('div', { class: 'program-card' + (compact ? ' compact' : '') });
  card.appendChild(el('div', { class: 'program-card-kicker', text: `${progress.completed} / ${progress.total} sessions` }));
  card.appendChild(el('div', { class: 'program-card-name', text: program.name }));
  card.appendChild(el('div', {
    class: 'program-card-meta',
    text: `${fmtHours(progress.totalMinutes)} planned · ${progress.total} metronome block${progress.total === 1 ? '' : 's'}`,
  }));
  card.appendChild(createProgressBar(progress));
  if (program.notes) {
    const notes = el('div', { class: 'program-card-notes' });
    setMarkdown(notes, program.notes);
    card.appendChild(notes);
  }
  card.appendChild(el('div', {
    class: 'program-card-next',
    text: progress.nextSession ? `Next: ${progress.nextSession.name}` : 'No sessions available',
  }));

  const actions = el('div', { class: 'program-card-actions' });
  actions.appendChild(el('button', {
    class: 'btn primary',
    type: 'button',
    text: progress.completed > 0 ? 'Continue' : 'Start',
    disabled: progress.nextSession ? null : '',
    onClick: () => { if (progress.nextSession) startSession(progress.nextSession.id); },
  }));
  actions.appendChild(el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'View',
    onClick: () => {
      if (typeof showSectionFn === 'function') showSectionFn('programs');
      setTimeout(() => {
        const target = document.querySelector(`[data-program-id="${program.id}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    },
  }));
  if (!compact) {
    actions.appendChild(el('button', {
      class: 'btn sm program-delete',
      type: 'button',
      text: 'Delete',
      onClick: () => confirmDelete(program),
    }));
  }
  card.appendChild(actions);
  return card;
}

function renderEmpty(container, text, buttonText) {
  container.appendChild(el('div', { class: 'program-empty' }, [
    el('p', { text }),
    el('button', { class: 'btn primary', type: 'button', text: buttonText, onClick: openCreator }),
  ]));
}

export function renderHomePrograms() {
  const grid = document.getElementById('home-programs-grid');
  const empty = document.getElementById('home-programs-empty');
  if (!grid) return;
  const programs = getPrograms();
  grid.innerHTML = '';
  if (programs.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  grid.style.display = '';
  if (empty) empty.style.display = 'none';
  programs.slice(0, 3).forEach(program => grid.appendChild(buildProgramCard(program, { compact: true })));
}

export function renderPrograms() {
  const list = document.getElementById('programs-list');
  if (!list) return;
  const programs = getPrograms();
  list.innerHTML = '';
  if (programs.length === 0) {
    renderEmpty(list, 'No programs yet. Paste a markdown curriculum and Musi will turn each ## heading into a one-hour metronome session.', 'Create Program');
    return;
  }
  programs.forEach(program => list.appendChild(buildProgramDetail(program)));
}

function buildProgramDetail(program) {
  const sessions = getProgramSessions(program);
  const detail = el('article', { class: 'program-detail', 'data-program-id': program.id });
  detail.appendChild(buildProgramCard(program));

  const list = el('div', { class: 'program-session-list' });
  sessions.forEach((session, index) => {
    const row = el('div', { class: 'program-session-row' }, [
      el('div', { class: 'program-session-index', text: String(index + 1) }),
      el('div', { class: 'program-session-main' }, [
        el('div', { class: 'program-session-name', text: session.name }),
        el('div', { class: 'program-session-meta', text: '60 min · Metronome exercise' }),
      ]),
      el('button', { class: 'btn sm', type: 'button', text: 'Edit', onClick: () => openEditor(session.id) }),
      el('button', { class: 'btn primary sm', type: 'button', text: 'Start', onClick: () => startSession(session.id) }),
    ]);
    list.appendChild(row);
  });
  detail.appendChild(list);
  return detail;
}

function confirmDelete(program) {
  const dialog = el('div', { class: 'session-dialog session-confirm' }, [
    el('h3', { class: 'session-dialog-title', text: `Delete “${program.name}”?` }),
    el('p', { class: 'session-dialog-body', text: 'This removes the program and the sessions it generated from this device.' }),
  ]);
  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeModal }));
  actions.appendChild(el('button', {
    class: 'btn primary',
    type: 'button',
    text: 'Delete',
    onClick: () => {
      deleteProgram(program.id, { deleteSessions: true });
      closeModal();
      renderPrograms();
      renderHomePrograms();
      renderSessionsHome();
    },
  }));
  dialog.appendChild(actions);
  openModal(dialog);
}

function openCreator() {
  const dialog = el('div', { class: 'session-dialog program-editor' });
  dialog.appendChild(el('div', { class: 'session-dialog-head' }, [
    el('h3', { class: 'session-dialog-title', text: 'Create Program' }),
    el('button', { class: 'session-dialog-close', type: 'button', 'aria-label': 'Close', html: '&#10005;', onClick: closeModal }),
  ]));

  const nameInput = el('input', {
    type: 'text',
    class: 'session-name-input',
    id: 'program-name-input',
    maxlength: '80',
    placeholder: 'Program name (optional)',
  });
  const mdInput = el('textarea', {
    class: 'program-markdown-input',
    id: 'program-markdown-input',
    placeholder: '# Summer Practice Program\n\nProgram notes...\n\n## Session 1: Time and pulse\nPaste lesson notes here.\n\n## Session 2: Subdivision\nMore notes here.',
    spellcheck: 'true',
  });
  const preview = el('div', { class: 'program-import-preview', id: 'program-import-preview' });
  const errors = el('div', { class: 'session-errors', id: 'program-errors' });

  const updatePreview = () => {
    const parsed = parseProgramMarkdown(mdInput.value, nameInput.value);
    const count = parsed.sessions.length;
    preview.textContent = count
      ? `${count} session${count === 1 ? '' : 's'} detected · ${count} hr planned`
      : 'Add ## headings for each session.';
  };
  nameInput.addEventListener('input', updatePreview);
  mdInput.addEventListener('input', updatePreview);

  dialog.appendChild(el('label', { class: 'session-field-label', text: 'Program name' }));
  dialog.appendChild(nameInput);
  dialog.appendChild(el('label', { class: 'session-field-label', text: 'Markdown import' }));
  dialog.appendChild(mdInput);
  dialog.appendChild(preview);
  dialog.appendChild(errors);

  const actions = el('div', { class: 'session-dialog-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeModal }));
  actions.appendChild(el('button', {
    class: 'btn primary',
    type: 'button',
    text: 'Create Program',
    onClick: () => {
      const result = createProgramFromMarkdown({ name: nameInput.value, markdown: mdInput.value });
      if (!result.ok) {
        errors.textContent = result.errors.join(' ');
        return;
      }
      closeModal();
      renderPrograms();
      renderHomePrograms();
      renderSessionsHome();
    },
  }));
  dialog.appendChild(actions);
  openModal(dialog);
  updatePreview();
  setTimeout(() => mdInput.focus(), 50);
}

export function initPrograms(config) {
  showSectionFn = config.showSection;

  const createButtons = [
    document.getElementById('home-programs-create'),
    document.getElementById('home-programs-empty-create'),
    document.getElementById('programs-create'),
  ];
  createButtons.forEach(btn => {
    if (btn) btn.onclick = openCreator;
  });

  renderHomePrograms();
  renderPrograms();
}
