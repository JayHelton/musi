/**
 * Create objective workspace — Projects, Capture, Compose.
 */

import { OBJECTIVES } from '../routes.js';
import { navigate, setParams } from '../router.js';
import { adoptSection, releaseAllExcept } from './legacyHost.js';
import { mountFeature, stopFeaturesExcept } from '../featureAdapters.js';
import { createWorkspaceShell, renderChipRow } from './workspaceShell.js';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  listNotesInboxLinks,
  attachNoteToTarget,
  listProgressions,
  createProgression,
  attachToProject,
  songIdFromProjectId,
  isSongBackedProjectId,
} from '../create/projectModel.js';

export const CREATE_SECTIONS = {
  projects: { sectionId: 'sec-songwriter', featureId: 'songwriter' },
  notes: { sectionId: 'sec-notes', featureId: 'notes' },
  capture: { sectionId: 'sec-recorder', featureId: 'recorder' },
  compose: {
    default: { sectionId: 'sec-chords', featureId: 'chords' },
    keyboard: { sectionId: 'sec-keyboard', featureId: 'keyboard' },
    beats: { sectionId: 'sec-drums', featureId: 'drums' },
    'import-melody': { sectionId: 'sec-tracktosheet', featureId: 'tracktosheet' },
  },
};

const VIEW_LABELS = [
  { id: 'projects', label: 'Projects' },
  { id: 'capture', label: 'Capture' },
  { id: 'compose', label: 'Compose' },
];

const COMPOSE_CHIPS = [
  { id: 'chords', label: 'Chord Builder' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'beats', label: 'Beats' },
  { id: 'import-melody', label: 'Import Melody', beta: true },
];

const PROJECT_TABS = [
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'notes', label: 'Notes' },
  { id: 'harmony', label: 'Harmony' },
  { id: 'beats', label: 'Beats' },
  { id: 'practice', label: 'Practice' },
];

const KIND_OPTIONS = [
  { id: 'song', label: 'Song' },
  { id: 'riff', label: 'Riff' },
  { id: 'vocal-idea', label: 'Vocal idea' },
  { id: 'exercise-idea', label: 'Exercise idea' },
];

let shellApi = null;
let viewRegion = null;
let activeFeatureIds = [];
let migrationsPromise = null;
let activeProjectId = null;

function defaultView() {
  return OBJECTIVES.find((o) => o.id === 'create')?.defaultView || 'projects';
}

function effectiveView(route) {
  return route.view || defaultView();
}

function resolveCompose(route) {
  if (route.params?.panel === 'keyboard') return CREATE_SECTIONS.compose.keyboard;
  const view = route.params?.view;
  if (view === 'import-melody') return CREATE_SECTIONS.compose['import-melody'];
  if (view === 'beats') return CREATE_SECTIONS.compose.beats;
  return CREATE_SECTIONS.compose.default;
}

function activeComposeChip(route) {
  if (route.params?.panel === 'keyboard') return 'keyboard';
  const view = route.params?.view;
  if (view === 'import-melody') return 'import-melody';
  if (view === 'beats') return 'beats';
  return 'chords';
}

function ensureMigrations() {
  if (!migrationsPromise) {
    migrationsPromise = import('../migrations/index.js').then(({ runMigrations }) => {
      runMigrations();
    }).catch(() => {});
  }
  return migrationsPromise;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function readNotes() {
  try {
    const raw = localStorage.getItem('musi.notes');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function selectSongwriterSong(songId) {
  if (!songId) return;
  await mountFeature('songwriter');
  const item = document.querySelector(`#sw-list .sw-list-item[data-id="${CSS.escape(songId)}"]`);
  if (item) item.click();
}

function renderProjectList(host, route) {
  const projects = listProjects();
  const selectedId = route.params?.id || '';
  const list = document.createElement('div');
  list.className = 'create-project-list md-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Projects');

  const head = document.createElement('div');
  head.className = 'create-project-list-head';
  head.innerHTML = '<span class="home-section-label">Projects</span>';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn sm primary';
  newBtn.textContent = '+ New';
  newBtn.onclick = () => {
    const project = createProject({ title: 'Untitled', kind: 'riff' });
    setParams({ id: project.id, view: 'lyrics' });
  };
  head.appendChild(newBtn);
  list.appendChild(head);

  if (!projects.length) {
    const empty = document.createElement('p');
    empty.className = 'create-empty';
    empty.textContent = 'No projects yet. Record an idea or start a new project.';
    list.appendChild(empty);
  } else {
    for (const project of projects) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'create-project-item' + (project.id === selectedId ? ' active' : '');
      btn.dataset.id = project.id;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', project.id === selectedId ? 'true' : 'false');
      btn.innerHTML = `
        <span class="create-project-item-title">${escapeHtml(project.title || 'Untitled')}</span>
        <span class="create-project-item-meta">${escapeHtml(project.kind)} · ${project.recordingIds.length} rec</span>
      `;
      btn.onclick = () => setParams({ id: project.id, view: route.params?.view === 'notes' ? 'notes' : 'lyrics' });
      list.appendChild(btn);
    }
  }
  host.appendChild(list);
}

function renderProjectTabs(host, route, project) {
  const tabId = route.params?.view && route.params.view !== 'notes' ? route.params.view : 'lyrics';
  const row = document.createElement('div');
  row.className = 'create-project-tabs';
  row.setAttribute('role', 'tablist');
  row.setAttribute('aria-label', 'Project sections');
  for (const tab of PROJECT_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'create-project-tab' + (tab.id === tabId ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', tab.id === tabId ? 'true' : 'false');
    btn.textContent = tab.label;
    btn.onclick = () => setParams({ id: project.id, view: tab.id });
    row.appendChild(btn);
  }
  host.appendChild(row);
  return tabId;
}

function renderRecordingsTab(host, project) {
  const panel = document.createElement('div');
  panel.className = 'create-panel create-recordings-panel';
  if (!project.recordingIds.length) {
    panel.innerHTML = '<p class="create-muted">No recordings yet. Use the Lyrics tab or Capture to add vocal takes.</p>';
  } else {
    const list = document.createElement('ul');
    list.className = 'create-id-list';
    for (const id of project.recordingIds) {
      const li = document.createElement('li');
      li.textContent = id;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }
  host.appendChild(panel);
}

function renderProjectNotesTab(host, project) {
  const panel = document.createElement('div');
  panel.className = 'create-panel';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = 'Project notes';
  const textarea = document.createElement('textarea');
  textarea.className = 'create-textarea';
  textarea.value = project.notes || '';
  textarea.rows = 6;
  textarea.setAttribute('aria-label', 'Project notes');
  let timer = null;
  textarea.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => updateProject(project.id, { notes: textarea.value }), 500);
  };
  panel.append(label, textarea);
  host.appendChild(panel);
}

function renderHarmonyTab(host, project) {
  const panel = document.createElement('div');
  panel.className = 'create-panel';
  const progressions = listProgressions(project.progressionIds);
  if (!progressions.length) {
    panel.innerHTML = '<p class="create-muted">No progressions saved. Build chords in Compose and save to this project.</p>';
  } else {
    const list = document.createElement('ul');
    list.className = 'create-id-list';
    for (const prog of progressions) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(prog.name)}</strong> — ${escapeHtml(prog.chords || '')}`;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }
  host.appendChild(panel);
}

function renderBeatsTab(host, project) {
  const panel = document.createElement('div');
  panel.className = 'create-panel';
  if (!project.drumPatternIds.length) {
    panel.innerHTML = '<p class="create-muted">No drum patterns linked. Create beats in Compose › Beats.</p>';
  } else {
    const list = document.createElement('ul');
    list.className = 'create-id-list';
    for (const id of project.drumPatternIds) {
      const li = document.createElement('li');
      li.textContent = id;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }
  host.appendChild(panel);
}

function renderPracticeTab(host, project) {
  const panel = document.createElement('div');
  panel.className = 'create-panel';
  if (!project.linkedExerciseIds.length) {
    panel.innerHTML = '<p class="create-muted">No linked practice material. Attach exercises from Train library.</p>';
  } else {
    const list = document.createElement('ul');
    list.className = 'create-id-list';
    for (const id of project.linkedExerciseIds) {
      const li = document.createElement('li');
      li.textContent = id;
      list.appendChild(li);
    }
    panel.appendChild(list);
  }
  host.appendChild(panel);
}

async function renderProjectDetail(host, route) {
  const projectId = route.params?.id;
  if (!projectId) {
    const empty = document.createElement('div');
    empty.className = 'create-detail-empty md-editor';
    empty.innerHTML = '<p>Select a project from the list, or create a new one.</p>';
    host.appendChild(empty);
    return;
  }

  const project = getProject(projectId);
  if (!project) {
    const missing = document.createElement('div');
    missing.className = 'create-detail-empty md-editor';
    missing.innerHTML = '<p>Project not found.</p>';
    host.appendChild(missing);
    return;
  }

  activeProjectId = project.id;
  const detail = document.createElement('div');
  detail.className = 'create-project-detail md-editor';
  host.appendChild(detail);

  const header = document.createElement('div');
  header.className = 'create-project-detail-head';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'create-title-input';
  titleInput.value = project.title || '';
  titleInput.setAttribute('aria-label', 'Project title');
  titleInput.maxLength = 120;
  let titleTimer = null;
  titleInput.oninput = () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => updateProject(project.id, { title: titleInput.value }), 400);
  };

  const kindSelect = document.createElement('select');
  kindSelect.className = 'create-kind-select';
  kindSelect.setAttribute('aria-label', 'Project kind');
  for (const opt of KIND_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    if (opt.id === project.kind) o.selected = true;
    kindSelect.appendChild(o);
  }
  kindSelect.onchange = () => updateProject(project.id, { kind: kindSelect.value });

  header.append(titleInput, kindSelect);
  detail.appendChild(header);

  const tabId = renderProjectTabs(detail, route, project);
  const tabHost = document.createElement('div');
  tabHost.className = 'create-tab-host';
  detail.appendChild(tabHost);

  if (tabId === 'lyrics') {
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host create-lyrics-host';
    tabHost.appendChild(featureHost);
    adoptSection(CREATE_SECTIONS.projects.sectionId, featureHost);
    activeFeatureIds.push(CREATE_SECTIONS.projects.featureId);
    await mountFeature(CREATE_SECTIONS.projects.featureId);
    const songId = isSongBackedProjectId(project.id) ? songIdFromProjectId(project.id) : null;
    if (songId) await selectSongwriterSong(songId);
  } else if (tabId === 'recordings') {
    renderRecordingsTab(tabHost, project);
  } else if (tabId === 'notes') {
    renderProjectNotesTab(tabHost, project);
  } else if (tabId === 'harmony') {
    renderHarmonyTab(tabHost, project);
  } else if (tabId === 'beats') {
    renderBeatsTab(tabHost, project);
  } else if (tabId === 'practice') {
    renderPracticeTab(tabHost, project);
  }
}

async function paintProjects(route) {
  const isNotesInbox = route.params?.view === 'notes' && !route.params?.id;

  if (isNotesInbox) {
    const wrap = document.createElement('div');
    wrap.className = 'create-notes-inbox';
    const intro = document.createElement('div');
    intro.className = 'create-inbox-intro';
    intro.innerHTML = '<h3 class="create-subhead">Notes inbox</h3><p class="create-muted">All notes live here. Attach them to a project without changing the note body.</p>';
    wrap.appendChild(intro);
    renderNotesAttachBar(wrap, route);
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    wrap.appendChild(featureHost);
    viewRegion.appendChild(wrap);
    adoptSection(CREATE_SECTIONS.notes.sectionId, featureHost);
    activeFeatureIds = [CREATE_SECTIONS.notes.featureId];
    await mountFeature(CREATE_SECTIONS.notes.featureId);
    return;
  }

  const layout = document.createElement('div');
  const hasDetail = !!route.params?.id;
  layout.className = 'create-projects-layout mobile-master-detail' + (hasDetail ? ' nav-editor' : ' nav-list');
  const master = document.createElement('aside');
  master.className = 'create-projects-master';
  const detailWrap = document.createElement('div');
  detailWrap.className = 'create-projects-detail';
  renderProjectList(master, route);
  await renderProjectDetail(detailWrap, route);
  layout.append(master, detailWrap);
  viewRegion.appendChild(layout);
}

function renderNotesAttachBar(host, route) {
  const notes = readNotes();
  const links = listNotesInboxLinks();
  const linkByNote = new Map(links.map((l) => [l.noteId, l]));
  const projects = listProjects();

  const bar = document.createElement('div');
  bar.className = 'create-attach-bar';
  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = 'Attach note to';
  const select = document.createElement('select');
  select.className = 'create-attach-select';
  select.setAttribute('aria-label', 'Attach selected note');

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— Inbox only —';
  select.appendChild(emptyOpt);

  for (const project of projects) {
    const opt = document.createElement('option');
    opt.value = `project:${project.id}`;
    opt.textContent = project.title || project.id;
    select.appendChild(opt);
  }

  const noteSelect = document.createElement('select');
  noteSelect.className = 'create-attach-select';
  noteSelect.setAttribute('aria-label', 'Note to attach');
  for (const note of notes) {
    const opt = document.createElement('option');
    opt.value = note.id;
    opt.textContent = note.title || note.body?.slice(0, 40) || note.id;
    noteSelect.appendChild(opt);
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn sm primary';
  saveBtn.textContent = 'Attach';
  saveBtn.onclick = () => {
    const noteId = noteSelect.value;
    if (!noteId) return;
    const val = select.value;
    if (!val) {
      attachNoteToTarget(noteId, null);
      return;
    }
    const [type, id] = val.split(':');
    attachNoteToTarget(noteId, { type, id });
  };

  const status = document.createElement('span');
  status.className = 'create-muted create-attach-status';
  const firstNote = notes[0];
  if (firstNote) {
    const link = linkByNote.get(firstNote.id);
    status.textContent = link?.attachedTo
      ? `Example: ${firstNote.id} → ${link.attachedTo.type}:${link.attachedTo.id}`
      : `${notes.length} note(s) in inbox`;
  }

  bar.append(label, noteSelect, select, saveBtn, status);
  host.appendChild(bar);
}

function renderCaptureFlow(host) {
  const flow = document.createElement('div');
  flow.className = 'create-capture-flow';
  flow.innerHTML = `
    <div class="create-capture-intro">
      <h3 class="create-subhead">Capture an idea</h3>
      <ol class="create-steps">
        <li>Record or import audio — saved immediately on this device.</li>
        <li>Analyze pitch and key only when you choose.</li>
        <li>Classify as song, riff, vocal idea, or exercise idea.</li>
        <li>Attach to a project or create a new one.</li>
        <li>Optionally convert a range via Compose › Import Melody.</li>
      </ol>
      <p class="create-muted create-mic-note">Microphone access is requested only when you press Record below.</p>
    </div>
  `;

  const classify = document.createElement('div');
  classify.className = 'create-capture-classify';
  const kindLabel = document.createElement('span');
  kindLabel.className = 'field-label';
  kindLabel.textContent = 'Classify as';
  const kindSelect = document.createElement('select');
  kindSelect.className = 'create-kind-select';
  kindSelect.setAttribute('aria-label', 'Idea kind');
  for (const opt of KIND_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    kindSelect.appendChild(o);
  }

  const projectSelect = document.createElement('select');
  projectSelect.className = 'create-attach-select';
  projectSelect.setAttribute('aria-label', 'Attach to project');
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New project';
  projectSelect.appendChild(newOpt);
  for (const project of listProjects()) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.title || project.id;
    projectSelect.appendChild(opt);
  }

  const attachBtn = document.createElement('button');
  attachBtn.type = 'button';
  attachBtn.className = 'btn sm';
  attachBtn.textContent = 'Prepare attach';
  attachBtn.onclick = () => {
    const kind = kindSelect.value;
    const target = projectSelect.value;
    if (target === '__new__') {
      const project = createProject({ title: 'Captured idea', kind });
      navigate({ objective: 'create', view: 'projects', params: { id: project.id, view: 'recordings' } });
    } else if (target) {
      updateProject(target, { kind });
      setParams({ id: target, view: 'recordings' });
    }
  };

  const convertBtn = document.createElement('button');
  convertBtn.type = 'button';
  convertBtn.className = 'btn sm';
  convertBtn.textContent = 'Convert in Import Melody';
  convertBtn.onclick = () => navigate({ objective: 'create', view: 'compose', params: { view: 'import-melody' } });

  classify.append(kindLabel, kindSelect, projectSelect, attachBtn, convertBtn);
  flow.appendChild(classify);
  host.appendChild(flow);
}

function renderImportMelodyDisclosure(host) {
  const box = document.createElement('div');
  box.className = 'create-beta-disclosure';
  box.setAttribute('role', 'note');
  box.innerHTML = `
    <strong>Import Melody (Beta)</strong>
    <p>Monophonic input only; rhythm is approximate. Your original audio is always preserved.
    Review and correct detected notes before saving.</p>
  `;
  host.appendChild(box);
}

function renderChordBuilderExtras(host) {
  if (!activeProjectId) return;
  const bar = document.createElement('div');
  bar.className = 'create-progression-bar';
  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = 'Save progression to active project';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'create-title-input';
  input.placeholder = 'Progression name';
  input.setAttribute('aria-label', 'Progression name');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn sm primary';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => {
    const project = getProject(activeProjectId);
    if (!project) return;
    const prog = createProgression({ name: input.value || 'Progression', chords: '' });
    attachToProject(activeProjectId, { type: 'progression', id: prog.id });
    input.value = '';
  };
  bar.append(label, input, saveBtn);
  host.appendChild(bar);
}

async function paintView(route) {
  await ensureMigrations();
  const view = effectiveView(route);
  shellApi?.updateTabs(view);
  releaseAllExcept([]);
  activeFeatureIds = [];
  activeProjectId = route.params?.id || null;
  viewRegion.innerHTML = '';
  viewRegion.className = 'workspace-view create-workspace-view';

  if (view === 'capture') {
    renderCaptureFlow(viewRegion);
    const mapping = CREATE_SECTIONS.capture;
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
    return;
  }

  if (view === 'projects') {
    await paintProjects(route);
    stopFeaturesExcept(activeFeatureIds);
    return;
  }

  if (view === 'compose') {
    const chipId = activeComposeChip(route);
    renderChipRow(viewRegion, COMPOSE_CHIPS, chipId, (id) => {
      if (id === 'keyboard') setParams({ panel: 'keyboard', view: null });
      else if (id === 'import-melody') setParams({ view: 'import-melody', panel: null });
      else if (id === 'beats') setParams({ view: 'beats', panel: null });
      else setParams({ view: null, panel: null });
    });

    if (chipId === 'import-melody') renderImportMelodyDisclosure(viewRegion);
    if (chipId === 'chords' && activeProjectId) renderChordBuilderExtras(viewRegion);

    const mapping = resolveCompose(route);
    const featureHost = document.createElement('div');
    featureHost.className = 'workspace-feature-host';
    viewRegion.appendChild(featureHost);
    adoptSection(mapping.sectionId, featureHost);
    activeFeatureIds = [mapping.featureId];
    await mountFeature(mapping.featureId);
    stopFeaturesExcept(activeFeatureIds);
  }
}

/**
 * @param {Element} container
 * @param {object} route
 */
export async function mount(container, route) {
  await ensureMigrations();
  const view = effectiveView(route);
  shellApi = createWorkspaceShell(container, {
    label: 'Create',
    views: VIEW_LABELS,
    currentView: view,
    onTabSelect: (id) => navigate({ objective: 'create', view: id, params: {} }),
  });
  viewRegion = shellApi.viewRegion;
  await paintView(route);
}

/**
 * @param {object} route
 */
export async function update(route) {
  await paintView(route);
}

export function unmount() {
  releaseAllExcept([]);
  stopFeaturesExcept([]);
  shellApi = null;
  viewRegion = null;
  activeFeatureIds = [];
  activeProjectId = null;
}
