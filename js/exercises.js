// Exercises library for Musi. A place to upload practice files (PDFs, images,
// audio and video) or add external lesson links, organize them into categories,
// and view/play them in a built-in viewer.
//
// Storage mirrors the rest of the app:
//   - exercise metadata + categories live in localStorage (musi.exercises)
//   - uploaded file Blobs live in IndexedDB (attachments.js) keyed by an
//     attachment id, with source 'exercise'.
//
// All storage access is defensive so the feature degrades gracefully when
// localStorage / IndexedDB are unavailable.

import {
  saveFile,
  getFileBlob,
  deleteFile,
  renameFile,
  attachmentsSupported,
  ensurePersistentStorage,
} from './attachments.js';

const STORAGE_KEY = 'musi.exercises';
const NAME_LIMIT = 120;
const CAT_LIMIT = 40;
const URL_LIMIT = 2000;
const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250 MB upload guard for video.

// --- storage helpers (defensive) -------------------------------------------

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readKey(key) {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clampText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit);
}

function safeExternalUrl(value) {
  let raw = clampText(typeof value === 'string' ? value.trim() : '', URL_LIMIT);
  if (!raw) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /^[\w.-]+\.[a-z]{2,}/i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) {
    /* invalid URL */
  }
  return '';
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') || 'Exercise link';
  } catch (e) {
    return 'Exercise link';
  }
}

// --- normalization ---------------------------------------------------------

function normalizeCategory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('cat');
  const name = clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Category', CAT_LIMIT);
  return { id, name };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const attachmentId = typeof raw.attachmentId === 'string' && raw.attachmentId ? raw.attachmentId : '';
  const url = safeExternalUrl(raw.url);
  if (!attachmentId && !url) return null;
  const defaultName = url ? titleFromUrl(url) : 'Exercise';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('ex'),
    name: clampText(typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : defaultName, NAME_LIMIT),
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '',
    attachmentId,
    url,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    type: typeof raw.type === 'string' ? raw.type : '',
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : nowISO(),
  };
}

function defaultStore() {
  const t = nowISO();
  return {
    categories: [
      { id: uid('cat'), name: 'Tabs' },
      { id: uid('cat'), name: 'Etudes' },
      { id: uid('cat'), name: 'Warm-ups' },
    ],
    items: [],
    seededAt: t,
  };
}

let storeCache = null;

function getStore() {
  if (storeCache) return storeCache;
  const raw = readKey(STORAGE_KEY);
  if (raw === null) {
    storeCache = defaultStore();
    persist();
    return storeCache;
  }
  try {
    const parsed = JSON.parse(raw);
    storeCache = {
      categories: Array.isArray(parsed && parsed.categories)
        ? parsed.categories.map(normalizeCategory).filter(Boolean)
        : [],
      items: Array.isArray(parsed && parsed.items)
        ? parsed.items.map(normalizeItem).filter(Boolean)
        : [],
    };
  } catch (e) {
    storeCache = { categories: [], items: [] };
  }
  return storeCache;
}

function persist() {
  if (!storeCache) return;
  writeKey(STORAGE_KEY, JSON.stringify(storeCache));
}

// --- public data API (synchronous metadata; Blobs fetched on demand) -------

export function getCategories() {
  return getStore().categories.slice();
}

export function getExercises() {
  return getStore().items.slice();
}

export function getExercise(id) {
  return getStore().items.find(it => it.id === id) || null;
}

function categoryName(categoryId) {
  if (!categoryId) return 'Uncategorized';
  const cat = getStore().categories.find(c => c.id === categoryId);
  return cat ? cat.name : 'Uncategorized';
}

function addCategory(name) {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return null;
  const store = getStore();
  const exists = store.categories.find(c => c.name.toLowerCase() === clean.toLowerCase());
  if (exists) return exists;
  const cat = { id: uid('cat'), name: clean };
  store.categories.push(cat);
  persist();
  return cat;
}

function renameCategory(id, name) {
  const clean = clampText((name || '').trim(), CAT_LIMIT);
  if (!clean) return false;
  const cat = getStore().categories.find(c => c.id === id);
  if (!cat) return false;
  cat.name = clean;
  persist();
  return true;
}

// Deleting a category leaves its exercises in place but uncategorized.
function deleteCategory(id) {
  const store = getStore();
  const idx = store.categories.findIndex(c => c.id === id);
  if (idx < 0) return false;
  store.categories.splice(idx, 1);
  store.items.forEach(it => { if (it.categoryId === id) it.categoryId = ''; });
  persist();
  return true;
}

function renameExercise(id, name) {
  const item = getExercise(id);
  if (!item) return null;
  const clean = clampText((name || '').trim(), NAME_LIMIT) || item.name;
  item.name = clean;
  persist();
  if (item.attachmentId) renameFile(item.attachmentId, clean).catch(() => {});
  return clean;
}

function moveExercise(id, categoryId) {
  const item = getExercise(id);
  if (!item) return false;
  item.categoryId = typeof categoryId === 'string' ? categoryId : '';
  persist();
  return true;
}

async function deleteExercise(id) {
  const store = getStore();
  const idx = store.items.findIndex(it => it.id === id);
  if (idx < 0) return false;
  const [removed] = store.items.splice(idx, 1);
  persist();
  if (removed && removed.attachmentId) {
    try { await deleteFile(removed.attachmentId); } catch (e) {}
  }
  return true;
}

// --- formatting helpers ----------------------------------------------------

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fileExt(item) {
  const name = (item && (item.fileName || item.name)) || '';
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isPdfItem(item) {
  return !!item && (
    item.type === 'application/pdf' ||
    fileExt(item) === 'pdf'
  );
}

function isImageItem(item) {
  return !!item && (
    (typeof item.type === 'string' && item.type.startsWith('image/')) ||
    /^(png|jpe?g|gif|webp|bmp|svg)$/.test(fileExt(item))
  );
}

function isAudioItem(item) {
  return !!item && (
    (typeof item.type === 'string' && item.type.startsWith('audio/')) ||
    /^(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/.test(fileExt(item))
  );
}

function isVideoItem(item) {
  return !!item && (
    (typeof item.type === 'string' && item.type.startsWith('video/')) ||
    /^(mp4|m4v|mov|webm|ogv|ogg)$/.test(fileExt(item))
  );
}

function youtubeEmbedUrl(url) {
  const safe = safeExternalUrl(url);
  if (!safe) return '';
  try {
    const u = new URL(safe);
    const host = u.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/').filter(Boolean)[1] || '';
      }
    }
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return '';
    return `https://www.youtube.com/embed/${id}`;
  } catch (e) {
    return '';
  }
}

function mediaKind(item) {
  if (item && item.url) return youtubeEmbedUrl(item.url) ? 'youtube' : 'link';
  if (isVideoItem(item)) return 'video';
  if (isAudioItem(item)) return 'audio';
  if (isImageItem(item)) return 'image';
  if (isPdfItem(item)) return 'pdf';
  return 'file';
}

function mediaKindLabel(item) {
  const labels = {
    pdf: 'PDF',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    youtube: 'YouTube',
    link: 'Link',
    file: 'File',
  };
  return labels[mediaKind(item)] || 'File';
}

// --- small DOM helper ------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// --- module state ----------------------------------------------------------

let wired = false;
let selectedCategory = 'all'; // 'all', 'uncategorized', or a category id.

let listEl, catListEl, titleEl, statusEl, fileInput, uploadBtn, addLinkBtn, addCatForm, addCatInput;

// --- rendering -------------------------------------------------------------

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.display = text ? '' : 'none';
  statusEl.classList.toggle('error', !!isError);
}

function visibleItems() {
  const items = getExercises();
  if (selectedCategory === 'all') return items;
  if (selectedCategory === 'uncategorized') return items.filter(it => !it.categoryId);
  return items.filter(it => it.categoryId === selectedCategory);
}

function renderCategories() {
  if (!catListEl) return;
  catListEl.innerHTML = '';
  const store = getStore();
  const items = getExercises();

  const uncategorizedCount = items.filter(it => !it.categoryId).length;

  const makeRow = (key, name, count, opts = {}) => {
    const row = el('div', { class: 'sl-item ex-cat-item' + (selectedCategory === key ? ' active' : '') });
    row.appendChild(el('span', { class: 'ex-cat-name', text: name }));
    row.appendChild(el('span', { class: 'ex-cat-count', text: String(count) }));
    row.addEventListener('click', (e) => {
      if (e.target.closest('.ex-cat-tool')) return;
      selectedCategory = key;
      render();
    });
    if (opts.editable) {
      const tools = el('div', { class: 'ex-cat-tools' });
      tools.appendChild(el('button', {
        class: 'ex-cat-tool', type: 'button', title: 'Rename category', 'aria-label': 'Rename category',
        html: '&#9998;', onClick: () => onRenameCategory(opts.id, name),
      }));
      tools.appendChild(el('button', {
        class: 'ex-cat-tool ex-cat-del', type: 'button', title: 'Delete category', 'aria-label': 'Delete category',
        html: '&#10005;', onClick: () => onDeleteCategory(opts.id, name),
      }));
      row.appendChild(tools);
    }
    catListEl.appendChild(row);
  };

  makeRow('all', 'All Exercises', items.length);
  store.categories.forEach(cat => {
    const count = items.filter(it => it.categoryId === cat.id).length;
    makeRow(cat.id, cat.name, count, { editable: true, id: cat.id });
  });
  if (uncategorizedCount > 0) {
    makeRow('uncategorized', 'Uncategorized', uncategorizedCount);
  }
}

function currentTitleText() {
  if (selectedCategory === 'all') return 'All Exercises';
  if (selectedCategory === 'uncategorized') return 'Uncategorized';
  return categoryName(selectedCategory);
}

function buildCategorySelect(item) {
  const select = el('select', { class: 'ex-item-cat-select', 'aria-label': 'Category' });
  select.appendChild(el('option', { value: '', text: 'Uncategorized' }));
  getCategories().forEach(cat => {
    const opt = el('option', { value: cat.id, text: cat.name });
    if (cat.id === item.categoryId) opt.selected = true;
    select.appendChild(opt);
  });
  if (!item.categoryId) select.value = '';
  select.addEventListener('change', () => {
    moveExercise(item.id, select.value);
    // Re-render so counts update and the row drops out of a filtered view.
    render();
  });
  return select;
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const items = visibleItems();
  if (!attachmentsSupported()) {
    if (uploadBtn) uploadBtn.disabled = true;
    if (items.length === 0) {
      listEl.appendChild(el('div', {
        class: 'ex-empty',
        text: 'File uploads need browser storage (IndexedDB), which is unavailable here. You can still add exercise links.',
      }));
      return;
    }
  } else if (uploadBtn) {
    uploadBtn.disabled = false;
  }

  if (items.length === 0) {
    const msg = getExercises().length === 0
      ? 'No exercises yet. Upload PDFs, images, audio, video, or add lesson links to practice from.'
      : 'No exercises in this category yet.';
    listEl.appendChild(el('div', { class: 'ex-empty', text: msg }));
    return;
  }

  items.forEach(item => {
    const row = el('div', { class: 'ex-item', 'data-id': item.id });

    const icon = el('div', { class: 'ex-item-icon', html: exerciseIconSvg(item), 'aria-hidden': 'true' });
    row.appendChild(icon);

    const body = el('div', { class: 'ex-item-body' });
    const nameInput = el('input', {
      type: 'text', class: 'ex-item-name', value: item.name, maxlength: String(NAME_LIMIT),
      'aria-label': 'Exercise name',
    });
    nameInput.addEventListener('change', () => {
      const clean = renameExercise(item.id, nameInput.value);
      if (clean) nameInput.value = clean;
    });
    body.appendChild(nameInput);

    const sizeOrSource = item.url ? titleFromUrl(item.url) : fmtSize(item.size);
    const meta = `${categoryName(item.categoryId)} · ${mediaKindLabel(item)} · ${sizeOrSource} · ${fmtRelativeDate(item.addedAt)}`;
    body.appendChild(el('div', { class: 'ex-item-meta', text: meta }));
    row.appendChild(body);

    const actions = el('div', { class: 'ex-item-actions' });
    actions.appendChild(buildCategorySelect(item));
    actions.appendChild(el('button', {
      class: 'btn sm primary ex-item-open', type: 'button', text: 'Open',
      onClick: () => openExerciseViewer(item.id),
    }));
    actions.appendChild(el('button', {
      class: 'btn sm ex-item-del', type: 'button', text: 'Delete',
      'aria-label': `Delete ${item.name}`,
      onClick: () => onDeleteExercise(item),
    }));
    row.appendChild(actions);

    listEl.appendChild(row);
  });
}

function render() {
  // Selected category may have been deleted; fall back to 'all'.
  if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized'
      && !getStore().categories.some(c => c.id === selectedCategory)) {
    selectedCategory = 'all';
  }
  if (titleEl) titleEl.textContent = currentTitleText();
  renderCategories();
  renderList();
}

function exerciseIconSvg(item) {
  const kind = mediaKind(item);
  if (kind === 'image') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  if (kind === 'audio') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  if (kind === 'video' || kind === 'youtube') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>';
  if (kind === 'link') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
}

// --- upload ----------------------------------------------------------------

async function onUploadFiles() {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  if (!files.length) return;

  if (!attachmentsSupported()) {
    setStatus('Uploading needs browser storage, which is unavailable here.', true);
    return;
  }

  const targetCategory = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
    ? selectedCategory : '';

  let added = 0;
  let rejected = 0;
  for (const file of files) {
    const probe = { type: file.type || '', fileName: file.name };
    const isSupported = isPdfItem(probe) || isImageItem(probe) || isAudioItem(probe) || isVideoItem(probe);
    if (!isSupported) { rejected++; continue; }
    if (file.size > MAX_FILE_BYTES) { rejected++; continue; }

    setStatus(`Uploading "${file.name}"\u2026`);
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const fileType = file.type || (isPdfItem(probe) ? 'application/pdf' : '');
    const meta = await saveFile({
      blob: file, name: base || 'Exercise', type: fileType,
      fileName: file.name, size: file.size, source: 'exercise',
    });
    if (!meta) { rejected++; continue; }

    const store = getStore();
    store.items.unshift({
      id: uid('ex'),
      name: clampText(base || 'Exercise', NAME_LIMIT),
      categoryId: targetCategory,
      attachmentId: meta.id,
      fileName: file.name,
      type: fileType,
      size: file.size,
      addedAt: nowISO(),
    });
    persist();
    added++;
  }

  render();
  if (added && rejected) setStatus(`Added ${added} file${added === 1 ? '' : 's'}. Skipped ${rejected} unsupported or oversized file${rejected === 1 ? '' : 's'}.`, true);
  else if (added) setStatus(`Added ${added} file${added === 1 ? '' : 's'}.`);
  else if (rejected) setStatus('Only PDF, image, audio or video files up to 250 MB can be uploaded.', true);
}

// --- URL exercise creation --------------------------------------------------

function addLinkExercise(name, url) {
  const safe = safeExternalUrl(url);
  if (!safe) {
    setStatus('Enter a valid http(s) link.', true);
    return false;
  }
  const targetCategory = (selectedCategory !== 'all' && selectedCategory !== 'uncategorized')
    ? selectedCategory : '';
  const store = getStore();
  store.items.unshift({
    id: uid('ex'),
    name: clampText((name || '').trim() || titleFromUrl(safe), NAME_LIMIT),
    categoryId: targetCategory,
    attachmentId: '',
    url: safe,
    fileName: '',
    type: 'text/uri-list',
    size: 0,
    addedAt: nowISO(),
  });
  persist();
  render();
  setStatus('Added link.');
  return true;
}

// --- file/link viewer -------------------------------------------------------

let viewerRoot = null;
let viewerURL = null;

function ensureViewerRoot() {
  if (viewerRoot) return viewerRoot;
  viewerRoot = el('div', { id: 'ex-viewer-root' });
  document.body.appendChild(viewerRoot);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerRoot && viewerRoot.firstChild) closeExerciseViewer();
  });
  return viewerRoot;
}

export async function openExerciseViewer(id) {
  const item = getExercise(id);
  if (!item) return;
  ensureViewerRoot();
  closeExerciseViewer();

  const blob = item.attachmentId ? await getFileBlob(item.attachmentId) : null;
  const kind = mediaKind(item);

  const overlay = el('div', { class: 'ex-viewer-overlay' });
  const panel = el('div', { class: 'ex-viewer-panel', role: 'dialog', 'aria-label': item.name });

  const head = el('div', { class: 'ex-viewer-head' }, [
    el('div', { class: 'ex-viewer-title', text: item.name, title: item.fileName || item.name }),
  ]);
  const headActions = el('div', { class: 'ex-viewer-actions' });

  if (item.url) {
    headActions.appendChild(el('a', {
      class: 'btn sm', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open link',
    }));
  }
  if (blob) {
    viewerURL = URL.createObjectURL(blob);
    headActions.appendChild(el('a', {
      class: 'btn sm', href: viewerURL, target: '_blank', rel: 'noopener', text: 'Open in tab',
    }));
    const ext = kind === 'pdf' ? 'pdf' : '';
    const downloadName = item.fileName || (ext ? `${item.name}.${ext}` : item.name);
    headActions.appendChild(el('a', {
      class: 'btn sm', href: viewerURL, download: downloadName, text: 'Download',
    }));
  }
  headActions.appendChild(el('button', {
    class: 'btn sm ex-viewer-close', type: 'button', text: 'Close', 'aria-label': 'Close viewer',
    onClick: closeExerciseViewer,
  }));
  head.appendChild(headActions);
  panel.appendChild(head);

  const body = el('div', { class: `ex-viewer-body ex-viewer-body-${kind}` });
  if (item.url) {
    const embedUrl = youtubeEmbedUrl(item.url) || item.url;
    body.appendChild(el('iframe', {
      class: 'ex-viewer-frame ex-viewer-link-frame',
      src: embedUrl,
      title: item.name,
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    }));
    if (!youtubeEmbedUrl(item.url)) {
      body.appendChild(el('div', {
        class: 'ex-viewer-link-note',
        text: 'If this site blocks embedding, use Open link.',
      }));
    }
  } else if (blob) {
    if (kind === 'image') {
      body.appendChild(el('img', {
        class: 'ex-viewer-image', src: viewerURL, alt: item.name,
      }));
    } else if (kind === 'audio') {
      body.appendChild(el('audio', {
        class: 'ex-viewer-media', src: viewerURL, controls: '', preload: 'metadata',
      }));
    } else if (kind === 'video') {
      body.appendChild(el('video', {
        class: 'ex-viewer-media', src: viewerURL, controls: '', preload: 'metadata',
      }));
    } else {
      body.appendChild(el('iframe', {
        class: 'ex-viewer-frame', src: viewerURL, title: item.name,
      }));
    }
  } else {
    body.appendChild(el('div', {
      class: 'ex-viewer-missing',
      text: 'This file is missing from storage. It may have been cleared by the browser.',
    }));
  }
  panel.appendChild(body);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeExerciseViewer(); });
  viewerRoot.appendChild(overlay);
  document.body.classList.add('ex-viewer-open');
}

export function closeExerciseViewer() {
  if (viewerURL) { try { URL.revokeObjectURL(viewerURL); } catch (e) {} viewerURL = null; }
  if (viewerRoot) viewerRoot.innerHTML = '';
  document.body.classList.remove('ex-viewer-open');
}

// --- confirm / prompt modals (reuse shared modal styles) -------------------

let dialogRoot = null;

function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;
  dialogRoot = el('div', { id: 'ex-dialog-root' });
  document.body.appendChild(dialogRoot);
  return dialogRoot;
}

function closeDialog() {
  if (dialogRoot) dialogRoot.innerHTML = '';
}

function openConfirm(title, body, confirmLabel, onConfirm) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog modal-confirm' }, [
    el('h3', { class: 'modal-title', text: title }),
    body ? el('p', { class: 'modal-body', text: body }) : null,
  ]);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { closeDialog(); onConfirm(); },
  }));
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
}

function openPrompt(title, initialValue, confirmLabel, onConfirm) {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: title }));
  const input = el('input', {
    type: 'text', class: 'modal-input', value: initialValue || '', maxlength: String(CAT_LIMIT),
  });
  dialog.appendChild(input);
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  const confirm = el('button', {
    class: 'btn primary', type: 'button', text: confirmLabel,
    onClick: () => { const v = input.value; closeDialog(); onConfirm(v); },
  });
  actions.appendChild(confirm);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = input.value; closeDialog(); onConfirm(v); } });
  dialogRoot.appendChild(overlay);
  setTimeout(() => { input.focus(); input.select(); }, 40);
}

function openLinkDialog() {
  ensureDialogRoot();
  dialogRoot.innerHTML = '';
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal-dialog ex-link-dialog' });
  dialog.appendChild(el('h3', { class: 'modal-title', text: 'Add exercise link' }));
  dialog.appendChild(el('p', {
    class: 'modal-body',
    text: 'Paste a YouTube lesson or any http(s) page. Musi will embed it when the site allows iframes.',
  }));

  const urlInput = el('input', {
    type: 'url', class: 'modal-input', placeholder: 'https://youtu.be/...',
    maxlength: String(URL_LIMIT), 'aria-label': 'Exercise link URL',
  });
  const nameInput = el('input', {
    type: 'text', class: 'modal-input ex-link-name-input', placeholder: 'Optional title',
    maxlength: String(NAME_LIMIT), 'aria-label': 'Exercise link title',
  });
  const error = el('div', { class: 'modal-errors' });
  dialog.appendChild(urlInput);
  dialog.appendChild(nameInput);
  dialog.appendChild(error);

  const save = () => {
    const safe = safeExternalUrl(urlInput.value);
    if (!safe) {
      error.textContent = 'Enter a valid http(s) link.';
      urlInput.focus();
      return;
    }
    closeDialog();
    addLinkExercise(nameInput.value, safe);
  };

  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', { class: 'btn sm', type: 'button', text: 'Cancel', onClick: closeDialog }));
  actions.appendChild(el('button', { class: 'btn primary', type: 'button', text: 'Add Link', onClick: save }));
  dialog.appendChild(actions);

  [urlInput, nameInput].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') save();
    });
  });
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  dialogRoot.appendChild(overlay);
  setTimeout(() => urlInput.focus(), 40);
}

function onRenameCategory(id, current) {
  openPrompt('Rename category', current, 'Save', (name) => {
    if (renameCategory(id, name)) render();
  });
}

function onDeleteCategory(id, name) {
  openConfirm(
    `Delete category "${name}"?`,
    'Exercises in this category are kept but become Uncategorized.',
    'Delete',
    () => {
      deleteCategory(id);
      if (selectedCategory === id) selectedCategory = 'all';
      render();
    },
  );
}

function onDeleteExercise(item) {
  openConfirm(
    `Delete "${item.name}"?`,
    item.url
      ? 'This removes the exercise link from this device.'
      : 'This permanently removes the exercise file from this device.',
    'Delete',
    async () => {
      await deleteExercise(item.id);
      render();
    },
  );
}

// --- init / teardown -------------------------------------------------------

export function initExercises() {
  listEl = document.getElementById('ex-list');
  catListEl = document.getElementById('ex-category-list');
  titleEl = document.getElementById('ex-current-title');
  statusEl = document.getElementById('ex-status');
  fileInput = document.getElementById('ex-file-input');
  uploadBtn = document.getElementById('ex-upload-btn');
  addLinkBtn = document.getElementById('ex-add-link-btn');
  addCatForm = document.getElementById('ex-add-cat-form');
  addCatInput = document.getElementById('ex-add-cat-input');

  if (!listEl) return;

  if (!wired) {
    wired = true;
    if (uploadBtn && fileInput) uploadBtn.onclick = () => fileInput.click();
    if (addLinkBtn) addLinkBtn.onclick = openLinkDialog;
    if (fileInput) fileInput.addEventListener('change', onUploadFiles);
    if (addCatForm) {
      addCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cat = addCategory(addCatInput.value);
        if (cat) { addCatInput.value = ''; selectedCategory = cat.id; render(); }
      });
    }
    if (attachmentsSupported()) ensurePersistentStorage();
  }

  setStatus('');
  render();
}

// Close the viewer when navigating away from the Exercises section.
export function stopExercises() {
  closeExerciseViewer();
}
