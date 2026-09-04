// "Split into exercises" overlay for the Guitar Pro player.

import { el, fmtTime } from './dom.js';
import { icon } from './icons.js';
import { formatBarRange, describeMeasure } from './measureDigest.js';
import {
  addSegment,
  removeSegment,
  updateSegmentRange,
  renameSegment,
  sortSegments,
  assignmentMap,
  coverageStats,
  autoSplitByMarkers,
  autoSplitEveryN,
  autoSplitFromAnnotations,
  segmentBeats,
  estimateSeconds,
  defaultSegmentName,
} from './exerciseSegments.js';

const SEG_COLORS = [
  'var(--btn-a)',
  'var(--btn-b)',
  'var(--btn-x)',
  'var(--accent)',
  'var(--accent2)',
  'var(--ok)',
];

function segColor(order) {
  return SEG_COLORS[(Math.max(1, order) - 1) % SEG_COLORS.length];
}

function resolvedName(seg, digests) {
  const n = (seg.name || '').trim();
  if (n) return n;
  return defaultSegmentName(seg.startIdx, seg.endIdx, digests);
}

function selRange(selection) {
  if (selection.anchorIdx == null || selection.cursorIdx == null) return null;
  const lo = Math.min(selection.anchorIdx, selection.cursorIdx);
  const hi = Math.max(selection.anchorIdx, selection.cursorIdx);
  return [lo, hi];
}

function hasSelection(selection) {
  return selection.anchorIdx != null && selection.cursorIdx != null;
}

const TECH_ABBREV = {
  bend: 'Bd',
  palmMute: 'PM',
  slide: 'Sl',
  hammer: 'H',
  pull: 'P',
  vibrato: 'V',
  harmonic: 'Hm',
  tap: 'T',
  trill: 'Tr',
  tremolo: 'Tm',
  dead: 'X',
  slap: 'Sp',
  pop: 'Po',
};

const TECH_NAMES = {
  bend: 'Bend',
  palmMute: 'Palm mute',
  slide: 'Slide',
  hammer: 'Hammer-on',
  pull: 'Pull-off',
  vibrato: 'Vibrato',
  harmonic: 'Harmonic',
  tap: 'Tap',
  trill: 'Trill',
  tremolo: 'Tremolo picking',
  dead: 'Dead note',
  slap: 'Slap',
  pop: 'Pop',
};

function techniqueAbbrev(tech) {
  const key = String(tech || '');
  if (TECH_ABBREV[key]) return TECH_ABBREV[key];
  return key.slice(0, 2).toUpperCase();
}

function techniqueFullName(tech) {
  const key = String(tech || '');
  return TECH_NAMES[key] || key;
}

function buildSparkline(cells, maxCell) {
  const spark = el('div', { class: 'gpi-spark' });
  const peak = Math.max(1, maxCell || 1);
  (cells || []).forEach((count) => {
    const pct = Math.max(8, Math.round((count / peak) * 100));
    spark.appendChild(el('span', { class: 'gpi-spark-cell', style: { height: `${pct}%` } }));
  });
  return spark;
}

function buildBarChip(digest) {
  const desc = describeMeasure(digest);
  const maxCell = Math.max(1, ...(digest.beatCells || [0]));
  const chip = el('button', {
    class: 'gpi-bar' + (digest.isEmpty ? ' is-empty' : '') + (digest.marker ? ' is-section' : ''),
    type: 'button',
    title: desc,
    'aria-label': desc,
    'data-index': String(digest.index),
  });

  const top = el('div', { class: 'gpi-bar-top' }, [
    el('span', { class: 'gpi-bar-num', text: String(digest.barNumber) }),
  ]);
  const tsBadge = el('span', {
    class: 'gpi-bar-ts',
    text: digest.timeSig ? `${digest.timeSig[0]}/${digest.timeSig[1]}` : '',
    hidden: !digest.timeSigChanged,
  });
  top.appendChild(tsBadge);

  const marker = el('div', {
    class: 'gpi-bar-marker',
    text: digest.marker || '',
    hidden: !digest.marker,
  });

  const meta = el('div', { class: 'gpi-bar-meta' });
  if (!digest.isEmpty) {
    const nc = digest.noteCount || 0;
    meta.appendChild(el('span', {
      class: 'gpi-bar-meta-primary',
      text: `${nc} note${nc === 1 ? '' : 's'}`,
    }));
    const secondary = [];
    if (digest.fretMin != null && digest.fretMax != null) {
      secondary.push(digest.fretMin === digest.fretMax
        ? `fret ${digest.fretMin}`
        : `frets ${digest.fretMin}–${digest.fretMax}`);
    }
    if (digest.drumHits > 0) secondary.push(`🥁 ${digest.drumHits}`);
    if (secondary.length) {
      meta.appendChild(el('span', {
        class: 'gpi-bar-meta-secondary',
        text: secondary.join(' · '),
      }));
    }
  }

  const techs = digest.techniques || [];
  const techRow = el('div', {
    class: 'gpi-bar-tech',
    hidden: techs.length === 0,
  });
  techs.slice(0, 3).forEach((tech) => {
    techRow.appendChild(el('span', {
      class: 'gpi-tech-pill',
      text: techniqueAbbrev(tech),
      title: techniqueFullName(tech),
    }));
  });
  if (techs.length > 3) {
    const rest = techs.slice(3);
    techRow.appendChild(el('span', {
      class: 'gpi-tech-pill gpi-tech-more',
      text: `+${techs.length - 3}`,
      title: rest.map(techniqueFullName).join(', '),
    }));
  }

  const repeat = el('div', {
    class: 'gpi-bar-repeat',
    text: digest.repeatOf != null ? `= bar ${digest.repeatOf + 1}` : '',
    hidden: digest.repeatOf == null,
  });

  const emptyLbl = el('span', { class: 'gpi-bar-empty-lbl', text: 'rest', hidden: !digest.isEmpty });

  const segWrap = el('div', { class: 'gpi-bar-seg', hidden: true }, [
    el('span', { class: 'gpi-bar-seg-badge', text: '' }),
  ]);

  chip.append(top, marker, buildSparkline(digest.beatCells, maxCell), meta, techRow, repeat, emptyLbl, segWrap);
  chip._parts = { tsBadge, marker, meta, techRow, repeat, emptyLbl, segWrap,
    segBadge: segWrap.children[0] };
  chip._digestIndex = digest.index;
  return chip;
}

/**
 * Mount the "Split into exercises" overlay. Renders nothing visible until open().
 * @param {HTMLElement} host
 * @returns {{ open:()=>void, close:()=>void, isOpen:()=>boolean, sync:()=>void, destroy:()=>void }}
 */
export function mountExerciseImportPanel(host, {
  getDigests = () => [],
  getScoreTitle = () => '',
  getTrackLabel = () => '',
  getBpm = () => 120,
  getAnnotations = () => [],
  getFolders = () => [],
  getDefaultFolder = () => '',
  onCreateFolder = null,
  onPreview = null,
  onStopPreview = null,
  onImport = null,
  onClose = null,
} = {}) {
  const noop = {
    open() {},
    close() {},
    isOpen: () => false,
    sync() {},
    destroy() {},
  };
  if (!host) return noop;

  let openState = false;
  let digests = [];
  let digestKey = '';
  let segments = [];
  let selection = { anchorIdx: null, cursorIdx: null };
  let dragging = false;
  let dragMoved = false;
  let dragShift = false;
  let previewingId = null;
  let importing = false;
  let folderId = '';
  let statusText = '';
  let statusError = false;
  let barChips = [];
  let segRows = new Map();
  let focusedNameSegId = null;
  let gridCols = 1;
  let lastImportedKey = null;

  const root = el('div', { class: 'gpi-root', hidden: true });
  const backdrop = el('div', { class: 'gpi-backdrop', 'aria-hidden': 'true' });
  const panel = el('div', {
    class: 'gpi-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Split score into exercises',
  });

  const subtitleEl = el('div', { class: 'gpi-subtitle', text: '' });
  const closeBtn = el('button', {
    class: 'gpi-close gpp-icon-btn',
    type: 'button',
    html: icon('close'),
    'aria-label': 'Close split view',
    title: 'Close',
  });

  const groupBtn = el('button', {
    class: 'btn sm primary gpi-group-btn',
    type: 'button',
    text: 'Group bars',
    disabled: true,
  });
  const splitSectionBtn = el('button', {
    class: 'btn sm gpi-split-section',
    type: 'button',
    text: 'By section',
    disabled: true,
  });
  const everyInput = el('input', {
    class: 'gpi-every-input',
    type: 'number',
    min: '1',
    max: '32',
    value: '4',
    'aria-label': 'Bars per exercise',
  });
  const everyBtn = el('button', {
    class: 'btn sm gpi-every-btn',
    type: 'button',
    text: 'Apply',
    'aria-label': 'Split every N bars',
    title: 'Split every N bars',
  });
  const splitNotesBtn = el('button', {
    class: 'btn sm gpi-split-notes',
    type: 'button',
    text: 'From notes',
    disabled: true,
  });
  const clearBtn = el('button', {
    class: 'btn sm gpp-danger gpi-clear-btn',
    type: 'button',
    text: 'Clear all',
    disabled: true,
  });

  const grid = el('div', {
    class: 'gpi-grid',
    tabIndex: '0',
    role: 'group',
    'aria-label': 'Measure map',
  });
  const mapWrap = el('div', { class: 'gpi-map' }, [grid]);

  const segHeaderCount = el('span', { class: 'gpi-seg-count', text: '0' });
  const segList = el('div', { class: 'gpi-seg-list' });
  const segEmpty = el('p', {
    class: 'gpi-seg-empty',
    text: 'Drag across bars in the map (or use auto-split) to create your first exercise.',
  });
  const segmentsCol = el('div', { class: 'gpi-segments' }, [
    el('div', { class: 'gpi-seg-head' }, [
      el('span', { class: 'gpi-seg-title', text: 'Exercises' }),
      segHeaderCount,
    ]),
    segEmpty,
    segList,
  ]);

  const coverageEl = el('div', { class: 'gpi-coverage', text: '' });
  const folderSelect = el('select', { class: 'gpi-folder', 'aria-label': 'Add to folder' });
  const newFolderWrap = el('div', { class: 'gpi-new-folder', hidden: true });
  const newFolderInput = el('input', {
    class: 'gpi-new-folder-input',
    type: 'text',
    placeholder: 'Folder name',
    'aria-label': 'New folder name',
    maxlength: '80',
  });
  const newFolderCreate = el('button', {
    class: 'btn sm primary gpi-new-folder-create',
    type: 'button',
    text: 'Create',
  });
  newFolderWrap.append(newFolderInput, newFolderCreate);

  const importBtn = el('button', {
    class: 'btn primary gpi-import-btn',
    type: 'button',
    text: 'Add exercises',
    disabled: true,
  });
  const statusEl = el('div', {
    class: 'gpi-status',
    role: 'status',
    'aria-live': 'polite',
    text: '',
    hidden: true,
  });

  panel.append(
    el('div', { class: 'gpi-head' }, [
      el('div', { class: 'gpi-head-titles' }, [
        el('span', { class: 'gpi-kicker', text: 'Guitar Pro' }),
        el('h2', { class: 'gpi-title', text: 'Split into exercises' }),
        subtitleEl,
      ]),
      closeBtn,
    ]),
    el('div', { class: 'gpi-tools' }, [
      el('div', { class: 'gpi-tools-row' }, [
        groupBtn,
        el('div', { class: 'gpi-autosplit' }, [
          el('span', { class: 'gpi-autosplit-label', text: 'Auto-split' }),
          splitSectionBtn,
          el('span', { class: 'gpi-every-wrap' }, [
            el('span', { class: 'gpi-every-label', text: 'Every' }),
            everyInput,
            el('span', { class: 'gpi-every-suffix', text: 'bars' }),
            everyBtn,
          ]),
          splitNotesBtn,
        ]),
        clearBtn,
      ]),
      el('p', {
        class: 'gpi-hint',
        text: 'Drag to select · Enter groups · Space previews',
      }),
    ]),
    el('div', { class: 'gpi-body' }, [mapWrap, segmentsCol]),
    el('div', { class: 'gpi-foot' }, [
      coverageEl,
      el('div', { class: 'gpi-foot-actions' }, [
        el('div', { class: 'gpi-folder-wrap' }, [folderSelect, newFolderWrap]),
        importBtn,
      ]),
      statusEl,
    ]),
  );
  root.append(backdrop, panel);
  host.appendChild(root);

  function readDigests() {
    const next = typeof getDigests === 'function' ? getDigests() : [];
    return Array.isArray(next) ? next : [];
  }

  function digestFingerprint(list) {
    if (!list.length) return '0';
    const first = list[0];
    const last = list[list.length - 1];
    return `${list.length}:${first.signature || first.index}:${last.signature || last.index}`;
  }

  function stopPreview() {
    if (previewingId != null && typeof onStopPreview === 'function') onStopPreview();
    previewingId = null;
    paintSegRows();
  }

  function paintSubtitle() {
    const title = typeof getScoreTitle === 'function' ? getScoreTitle() : '';
    const track = typeof getTrackLabel === 'function' ? getTrackLabel() : '';
    const bpm = typeof getBpm === 'function' ? getBpm() : 120;
    const parts = [title, track, `${digests.length} bar${digests.length === 1 ? '' : 's'}`, `${bpm} BPM`]
      .filter((p) => p != null && String(p).trim());
    subtitleEl.textContent = parts.join(' · ');
  }

  function paintOpen() {
    root.hidden = !openState;
    root.classList.toggle('is-open', openState);
    backdrop.classList.toggle('is-open', openState);
    panel.classList.toggle('is-open', openState);
    backdrop.setAttribute('aria-hidden', openState ? 'false' : 'true');
  }

  function paintGroupBtn() {
    const range = selRange(selection);
    if (!range || importing) {
      groupBtn.disabled = true;
      groupBtn.textContent = 'Group bars';
      return;
    }
    groupBtn.disabled = false;
    groupBtn.textContent = `Group ${formatBarRange(range[0], range[1])}`;
  }

  function segmentsImportKey() {
    return sortSegments(segments)
      .map((seg) => `${seg.startIdx}-${seg.endIdx}:${resolvedName(seg, digests)}`)
      .join('|');
  }

  function isSameAsImported() {
    return lastImportedKey != null && lastImportedKey === segmentsImportKey();
  }

  function invalidateImportState() {
    if (lastImportedKey == null) return;
    lastImportedKey = null;
    if (statusText && !statusError) statusText = '';
  }

  function markSegmentsChanged() {
    invalidateImportState();
  }

  function paintToolbar() {
    const hasMarkers = digests.some((d) => d.marker);
    splitSectionBtn.disabled = !hasMarkers || importing;
    const annos = typeof getAnnotations === 'function' ? getAnnotations() : [];
    const usableNotes = annos.some((a) => a.measureStart != null && a.measureEnd != null);
    splitNotesBtn.disabled = !usableNotes || importing;
    clearBtn.disabled = segments.length === 0 || importing;
    const n = Math.max(1, Math.min(32, Number(everyInput.value) || 4));
    everyBtn.title = `Split every ${n} bar${n === 1 ? '' : 's'}`;
    paintGroupBtn();
  }

  function paintCoverage() {
    const stats = coverageStats(segments, digests.length);
    let text;
    if (stats.count === 0) {
      text = `No bars grouped yet · ${stats.bars} bar${stats.bars === 1 ? '' : 's'} in this score`;
    } else {
      text = `${stats.count} exercise${stats.count === 1 ? '' : 's'} · ${stats.covered} of ${stats.bars} bars covered`;
      if (stats.uncovered > 0) text += ` · ${stats.uncovered} uncovered`;
    }
    coverageEl.textContent = text;
  }

  function paintImportBtn() {
    const n = segments.length;
    importBtn.classList.remove('is-added');
    if (importing) {
      importBtn.disabled = true;
      importBtn.textContent = 'Adding…';
      return;
    }
    if (n === 0) {
      importBtn.disabled = true;
      importBtn.textContent = 'Add exercises';
      return;
    }
    if (isSameAsImported()) {
      importBtn.disabled = true;
      importBtn.textContent = 'Added ✓';
      importBtn.classList.add('is-added');
      return;
    }
    importBtn.disabled = false;
    importBtn.textContent = n === 1 ? 'Add 1 exercise' : `Add ${n} exercises`;
  }

  function paintStatus() {
    if (!statusText) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = statusText;
    statusEl.classList.toggle('is-error', statusError);
  }

  function paintFolders() {
    const folders = typeof getFolders === 'function' ? getFolders() : [];
    const prev = folderSelect.value;
    while (folderSelect.firstChild) folderSelect.removeChild(folderSelect.firstChild);
    folderSelect.appendChild(el('option', { value: '', text: 'No folder' }));
    folders.forEach((f) => {
      folderSelect.appendChild(el('option', { value: f.id, text: f.name }));
    });
    if (typeof onCreateFolder === 'function') {
      folderSelect.appendChild(el('option', { value: '__new__', text: 'New folder…' }));
    }
    const hasPrev = [...folderSelect.children].some((o) => (o.value ?? o.attributes?.value) === prev);
    folderSelect.value = hasPrev ? prev : (folderId || '');
    if (folderSelect.value === '__new__') folderSelect.value = folderId || '';
    newFolderWrap.hidden = folderSelect.value !== '__new__';
  }

  function computeGridCols() {
    const count = barChips.length;
    if (!count) {
      gridCols = 1;
      return;
    }
    const gridWidth = grid.clientWidth;
    const gap = 8;
    const minCol = 132;

    if (gridWidth > 0 && barChips[0]?.getBoundingClientRect) {
      const firstRect = barChips[0].getBoundingClientRect();
      if (firstRect.width > 0) {
        const firstTop = firstRect.top;
        let rowCols = 0;
        for (const chip of barChips) {
          const r = chip.getBoundingClientRect();
          if (Math.abs(r.top - firstTop) < 1) rowCols += 1;
          else break;
        }
        if (rowCols > 0) {
          gridCols = Math.max(1, Math.min(count, rowCols));
          return;
        }
        const derived = Math.floor((gridWidth + gap) / (firstRect.width + gap));
        if (derived > 0) {
          gridCols = Math.max(1, Math.min(count, derived));
          return;
        }
      }
    }

    const est = gridWidth > 0
      ? Math.floor((gridWidth + gap) / (minCol + gap))
      : Math.min(4, count);
    gridCols = Math.max(1, Math.min(count, est || 1));
  }

  function paintBarStates() {
    const range = selRange(selection);
    const assign = assignmentMap(segments, digests.length);
    const sorted = sortSegments(segments);
    const orderById = new Map(sorted.map((s, i) => [s.id, i + 1]));

    barChips.forEach((chip, i) => {
      const d = digests[i];
      if (!d) return;
      chip.classList.toggle('is-selected', !!range && i >= range[0] && i <= range[1]);
      chip.classList.toggle('is-cursor', selection.cursorIdx === i);
      const desc = describeMeasure(d);
      const a = assign[i];
      if (a) {
        const order = orderById.get(a.id) || a.order;
        const color = segColor(order);
        const segName = resolvedName(a, digests);
        const segRange = formatBarRange(a.startIdx, a.endIdx);
        const label = `${desc} · Exercise ${order}: ${segName} · bars ${segRange}`;
        chip.title = label;
        chip.setAttribute('aria-label', label);
        chip.classList.add('is-assigned');
        chip.style.setProperty('--seg-color', color);
        chip._parts.segWrap.hidden = false;
        chip._parts.segBadge.textContent = String(order);
      } else {
        chip.title = desc;
        chip.setAttribute('aria-label', desc);
        chip.classList.remove('is-assigned');
        chip.style.removeProperty('--seg-color');
        chip._parts.segWrap.hidden = true;
      }
    });
  }

  function onBarFocus(e) {
    if (dragging || importing) return;
    const idx = Number(e.currentTarget?._digestIndex);
    if (!Number.isFinite(idx)) return;
    if (selection.anchorIdx == null) selection.cursorIdx = idx;
  }

  function rebuildGrid() {
    try {
      grid.innerHTML = '';
      barChips = digests.map((d) => {
        const chip = buildBarChip(d);
        chip.addEventListener('focus', onBarFocus);
        chip.addEventListener('keydown', onGridKeyDown);
        grid.appendChild(chip);
        return chip;
      });
      computeGridCols();
      paintBarStates();
    } catch (err) {
      console.error(err);
      barChips = [];
      gridCols = 1;
    }
  }

  function refreshSegRowControls(row, seg) {
    const c = row._controls;
    if (!c) return;
    const rangeLabel = formatBarRange(seg.startIdx, seg.endIdx);
    c.previewBtn.classList.toggle('is-active', previewingId === seg.id);
    c.previewBtn.textContent = previewingId === seg.id ? '■' : '▶';
    c.previewBtn.setAttribute('aria-label', `Preview ${rangeLabel}`);
    c.previewBtn.title = previewingId === seg.id ? 'Stop preview' : 'Preview';
    c.startMinus.disabled = seg.startIdx <= 0 || importing;
    c.startPlus.disabled = seg.startIdx >= seg.endIdx || importing;
    c.endMinus.disabled = seg.endIdx <= seg.startIdx || importing;
    c.endPlus.disabled = seg.endIdx >= digests.length - 1 || importing;
    c.useSelBtn.disabled = !selRange(selection) || importing;
    c.removeBtn.disabled = importing;
  }

  function makeSegRow(seg, order) {
    const rangeLabel = formatBarRange(seg.startIdx, seg.endIdx);
    const bars = seg.endIdx - seg.startIdx + 1;
    const secs = estimateSeconds(seg, digests, typeof getBpm === 'function' ? getBpm() : 120);
    const color = segColor(order);
    const isPreview = previewingId === seg.id;

    const nameInput = el('input', {
      class: 'gpi-seg-name',
      type: 'text',
      maxlength: '80',
      value: seg.name || '',
      'aria-label': `Exercise name for ${rangeLabel}`,
    });
    nameInput.addEventListener('focus', () => { focusedNameSegId = seg.id; });
    nameInput.addEventListener('blur', () => {
      if (focusedNameSegId === seg.id) focusedNameSegId = null;
    });
    nameInput.addEventListener('input', () => {
      segments = renameSegment(segments, seg.id, nameInput.value);
      markSegmentsChanged();
      paintBarStates();
      paintCoverage();
      paintImportBtn();
    });
    nameInput.addEventListener('change', () => {
      segments = renameSegment(segments, seg.id, nameInput.value);
      markSegmentsChanged();
      paintSegRows();
    });

    const previewBtn = el('button', {
      class: 'btn sm gpi-seg-preview gpi-icon-btn' + (isPreview ? ' is-active' : ''),
      type: 'button',
      text: isPreview ? '■' : '▶',
      'aria-label': `Preview ${rangeLabel}`,
      title: isPreview ? 'Stop preview' : 'Preview',
    });
    previewBtn.addEventListener('click', () => togglePreview(seg.id));

    const startMinus = el('button', {
      class: 'gpi-icon-btn gpi-seg-start-minus',
      type: 'button',
      text: '◀',
      'aria-label': 'Move start earlier',
      title: 'Start earlier',
      disabled: seg.startIdx <= 0 || importing,
    });
    const startPlus = el('button', {
      class: 'gpi-icon-btn gpi-seg-start-plus',
      type: 'button',
      text: '▶',
      'aria-label': 'Move start later',
      title: 'Start later',
      disabled: seg.startIdx >= seg.endIdx || importing,
    });
    const endMinus = el('button', {
      class: 'gpi-icon-btn gpi-seg-end-minus',
      type: 'button',
      text: '◀',
      'aria-label': 'Move end earlier',
      title: 'End earlier',
      disabled: seg.endIdx <= seg.startIdx || importing,
    });
    const endPlus = el('button', {
      class: 'gpi-icon-btn gpi-seg-end-plus',
      type: 'button',
      text: '▶',
      'aria-label': 'Move end later',
      title: 'End later',
      disabled: seg.endIdx >= digests.length - 1 || importing,
    });
    startMinus.addEventListener('click', () => nudgeSeg(seg.id, 'start', -1));
    startPlus.addEventListener('click', () => nudgeSeg(seg.id, 'start', 1));
    endMinus.addEventListener('click', () => nudgeSeg(seg.id, 'end', -1));
    endPlus.addEventListener('click', () => nudgeSeg(seg.id, 'end', 1));

    const useSelBtn = el('button', {
      class: 'gpi-icon-btn gpi-seg-use-sel',
      type: 'button',
      text: '⊡',
      'aria-label': 'Use current selection',
      title: 'Use current selection',
      disabled: !selRange(selection) || importing,
    });
    useSelBtn.addEventListener('click', () => applySelectionToSeg(seg.id));

    const removeBtn = el('button', {
      class: 'gpp-icon-btn gpp-danger gpi-icon-btn gpi-seg-remove',
      type: 'button',
      html: icon('close'),
      'aria-label': `Remove ${rangeLabel}`,
      title: 'Remove exercise',
      disabled: importing,
    });
    removeBtn.addEventListener('click', () => {
      if (previewingId === seg.id) stopPreview();
      segments = removeSegment(segments, seg.id);
      segRows.delete(seg.id);
      markSegmentsChanged();
      paintAll();
    });

    const startStepper = el('div', { class: 'gpi-seg-stepper' }, [
      el('span', { class: 'gpi-seg-step-label', text: 'Start' }),
      el('div', { class: 'gpi-seg-step-btns' }, [startMinus, startPlus]),
    ]);
    const endStepper = el('div', { class: 'gpi-seg-stepper' }, [
      el('span', { class: 'gpi-seg-step-label', text: 'End' }),
      el('div', { class: 'gpi-seg-step-btns' }, [endMinus, endPlus]),
    ]);

    const row = el('div', {
      class: 'gpi-seg',
      'data-seg-id': seg.id,
      style: { '--seg-color': color },
    }, [
      el('span', { class: 'gpi-seg-swatch', text: String(order) }),
      el('div', { class: 'gpi-seg-main' }, [
        nameInput,
        el('div', {
          class: 'gpi-seg-meta',
          text: `${rangeLabel} · ${bars} bar${bars === 1 ? '' : 's'} · ~${fmtTime(secs)}`,
        }),
        el('div', { class: 'gpi-seg-controls' }, [
          previewBtn, startStepper, endStepper, useSelBtn, removeBtn,
        ]),
      ]),
    ]);
    row._nameInput = nameInput;
    row._controls = {
      previewBtn, startMinus, startPlus, endMinus, endPlus, useSelBtn, removeBtn,
    };
    return row;
  }

  function paintSegRows() {
    const sorted = sortSegments(segments);
    segEmpty.hidden = sorted.length > 0;
    segHeaderCount.textContent = String(sorted.length);

    const ids = new Set(sorted.map((s) => s.id));
    for (const id of [...segRows.keys()]) {
      if (!ids.has(id)) {
        const row = segRows.get(id);
        if (row?.parentElement) row.parentElement.removeChild(row);
        segRows.delete(id);
      }
    }

    sorted.forEach((seg, i) => {
      const order = i + 1;
      const existing = segRows.get(seg.id);
      if (existing && focusedNameSegId === seg.id) {
        const meta = existing.querySelector('.gpi-seg-meta');
        if (meta) {
          const bars = seg.endIdx - seg.startIdx + 1;
          const secs = estimateSeconds(seg, digests, typeof getBpm === 'function' ? getBpm() : 120);
          meta.textContent = `${formatBarRange(seg.startIdx, seg.endIdx)} · ${bars} bar${bars === 1 ? '' : 's'} · ~${fmtTime(secs)}`;
        }
        existing.style.setProperty('--seg-color', segColor(order));
        const swatch = existing.querySelector('.gpi-seg-swatch');
        if (swatch) swatch.textContent = String(order);
        refreshSegRowControls(existing, seg);
        return;
      }
      const row = makeSegRow(seg, order);
      segRows.set(seg.id, row);
      if (existing?.parentElement) existing.parentElement.replaceChild(row, existing);
      else segList.appendChild(row);
    });

    sorted.forEach((seg) => {
      const row = segRows.get(seg.id);
      if (row) refreshSegRowControls(row, seg);
    });

    const orderInDom = sorted.map((s) => s.id);
    const children = [...segList.children];
    orderInDom.forEach((id, idx) => {
      const row = segRows.get(id);
      if (!row) return;
      const cur = segList.children[idx];
      if (cur !== row) segList.insertBefore(row, cur || null);
    });
    children.forEach((c) => {
      if (!orderInDom.includes(c.getAttribute?.('data-seg-id') || c.attributes?.['data-seg-id'])) {
        if (c.parentElement === segList) segList.removeChild(c);
      }
    });
  }

  function paintAll() {
    paintSubtitle();
    paintToolbar();
    paintCoverage();
    paintImportBtn();
    paintStatus();
    paintFolders();
    paintBarStates();
    paintSegRows();
  }

  function clearSelection() {
    selection = { anchorIdx: null, cursorIdx: null };
  }

  function setSelection(anchor, cursor) {
    selection = { anchorIdx: anchor, cursorIdx: cursor ?? anchor };
    paintGroupBtn();
    paintBarStates();
    paintSegRows();
  }

  function groupSelection() {
    const range = selRange(selection);
    if (!range) return;
    const [start, end] = range;
    const cursor = selection.cursorIdx;
    segments = addSegment(segments, start, end, digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    selection = { anchorIdx: null, cursorIdx: cursor };
    paintAll();
    if (barChips[cursor]) barChips[cursor].focus?.();
    else grid.focus?.();
  }

  function nudgeSeg(id, edge, delta) {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    let start = seg.startIdx;
    let end = seg.endIdx;
    if (edge === 'start') start = Math.max(0, Math.min(end, start + delta));
    else end = Math.max(start, Math.min(digests.length - 1, end + delta));
    segments = updateSegmentRange(segments, id, start, end, digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    paintAll();
  }

  function applySelectionToSeg(id) {
    const range = selRange(selection);
    if (!range) return;
    segments = updateSegmentRange(segments, id, range[0], range[1], digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    paintAll();
  }

  function togglePreview(segId) {
    if (previewingId === segId) {
      stopPreview();
      return;
    }
    stopPreview();
    const seg = segments.find((s) => s.id === segId);
    if (!seg || typeof onPreview !== 'function') return;
    previewingId = segId;
    onPreview(seg.startIdx, seg.endIdx);
    paintSegRows();
  }

  function previewSelection() {
    const range = selRange(selection);
    if (range && typeof onPreview === 'function') {
      stopPreview();
      onPreview(range[0], range[1]);
      return;
    }
    const idx = selection.cursorIdx;
    if (idx == null) return;
    const assign = assignmentMap(segments, digests.length);
    const a = assign[idx];
    if (a) togglePreview(a.id);
  }

  function removeSegAtCursor() {
    const idx = selection.cursorIdx;
    if (idx == null) return;
    const assign = assignmentMap(segments, digests.length);
    const a = assign[idx];
    if (!a) return;
    if (previewingId === a.id) stopPreview();
    segments = removeSegment(segments, a.id);
    markSegmentsChanged();
    paintAll();
  }

  function refreshDigests(forceRebuild = false) {
    const next = readDigests();
    const fp = digestFingerprint(next);
    if (fp !== digestKey || forceRebuild) {
      if (fp !== digestKey) {
        segments = [];
        lastImportedKey = null;
        statusText = '';
        statusError = false;
      }
      digestKey = fp;
      digests = next;
      rebuildGrid();
    } else {
      digests = next;
    }
  }

  function chipIndexFromEvent(e) {
    let t = e.target?.closest?.('.gpi-bar');
    if (!t && e.clientX != null && e.clientY != null && typeof document.elementFromPoint === 'function') {
      t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.gpi-bar') ?? null;
    }
    if (!t) return null;
    const idx = Number(t.dataset?.index ?? t.attributes?.['data-index']);
    return Number.isFinite(idx) ? idx : null;
  }

  function onGridPointerDown(e) {
    if (importing) return;
    const idx = chipIndexFromEvent(e);
    if (idx == null) return;
    dragging = true;
    dragMoved = false;
    dragShift = !!e.shiftKey;
    if (e.shiftKey && selection.anchorIdx != null) {
      selection.cursorIdx = idx;
    } else {
      selection.anchorIdx = idx;
      selection.cursorIdx = idx;
    }
    try { grid.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    paintGroupBtn();
    paintBarStates();
    e.preventDefault?.();
  }

  function onGridPointerMove(e) {
    if (!dragging) return;
    const idx = chipIndexFromEvent(e);
    if (idx == null) return;
    if (idx !== selection.cursorIdx) dragMoved = true;
    selection.cursorIdx = idx;
    paintGroupBtn();
    paintBarStates();
  }

  function onGridPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    try { grid.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
    if (!dragMoved && !dragShift) {
      const idx = chipIndexFromEvent(e) ?? selection.cursorIdx;
      if (idx != null) setSelection(idx, idx);
    }
    dragShift = false;
  }

  function onBarDblClick(e) {
    if (importing) return;
    const idx = chipIndexFromEvent(e);
    if (idx == null) return;
    segments = addSegment(segments, idx, idx, digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    selection = { anchorIdx: null, cursorIdx: idx };
    paintAll();
  }

  function onGridKeyDown(e) {
    if (!openState) return;
    const key = e.key;
    const count = digests.length;
    if (!count) return;

    let handled = false;
    let cur = selection.cursorIdx ?? 0;

    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      handled = true;
      let next = cur;
      if (key === 'ArrowLeft') next = Math.max(0, cur - 1);
      else if (key === 'ArrowRight') next = Math.min(count - 1, cur + 1);
      else if (key === 'ArrowUp') next = Math.max(0, cur - gridCols);
      else if (key === 'ArrowDown') next = Math.min(count - 1, cur + gridCols);
      if (e.shiftKey) {
        if (selection.anchorIdx == null) selection.anchorIdx = cur;
        selection.cursorIdx = next;
      } else {
        setSelection(next, next);
      }
      paintGroupBtn();
      paintBarStates();
      barChips[next]?.focus?.();
    } else if (key === 'Home') {
      handled = true;
      if (e.shiftKey) {
        if (selection.anchorIdx == null) selection.anchorIdx = cur;
        selection.cursorIdx = 0;
      } else setSelection(0, 0);
      paintGroupBtn();
      paintBarStates();
    } else if (key === 'End') {
      handled = true;
      const last = count - 1;
      if (e.shiftKey) {
        if (selection.anchorIdx == null) selection.anchorIdx = cur;
        selection.cursorIdx = last;
      } else setSelection(last, last);
      paintGroupBtn();
      paintBarStates();
    } else if (key === 'Enter') {
      if (hasSelection(selection)) { handled = true; groupSelection(); }
    } else if (key === ' ') {
      handled = true;
      previewSelection();
    } else if (key === 'Escape') {
      if (hasSelection(selection)) {
        handled = true;
        clearSelection();
        paintGroupBtn();
        paintBarStates();
      }
    } else if (key === 'Delete' || key === 'Backspace') {
      handled = true;
      removeSegAtCursor();
    }

    if (handled) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
  }

  async function doImport() {
    if (!segments.length || importing) return;
    importing = true;
    statusText = '';
    statusError = false;
    paintAll();
    const sorted = sortSegments(segments);
    const payload = sorted.map((seg) => {
      const beats = segmentBeats(seg, digests);
      return {
        id: seg.id,
        name: resolvedName(seg, digests),
        startIdx: seg.startIdx,
        endIdx: seg.endIdx,
        startBeat: beats.startBeat,
        endBeat: beats.endBeat,
        bars: seg.endIdx - seg.startIdx + 1,
      };
    });
    let result = { ok: true, count: payload.length };
    if (typeof onImport === 'function') {
      try {
        result = await onImport(payload, { categoryId: folderId }) || result;
      } catch (err) {
        result = { ok: false, message: err?.message || 'Import failed.' };
      }
    }
    importing = false;
    if (result.ok) {
      statusError = false;
      statusText = result.message || `Added ${result.count ?? payload.length} exercise${(result.count ?? payload.length) === 1 ? '' : 's'} to Exercises.`;
      lastImportedKey = segmentsImportKey();
    } else {
      statusError = true;
      statusText = result.message || 'Import failed.';
    }
    paintAll();
  }

  function open() {
    openState = true;
    statusText = '';
    statusError = false;
    lastImportedKey = null;
    // New exercises join the folder the library has open, so the picker starts
    // there. The user can still choose another folder.
    folderId = (typeof getDefaultFolder === 'function' ? getDefaultFolder() : '') || '';
    refreshDigests(true);
    paintAll();
    paintOpen();
    requestAnimationFrame(() => {
      computeGridCols();
      if (barChips[0]) barChips[0].focus?.();
      else grid.focus?.();
    });
  }

  function close() {
    if (!openState) return;
    openState = false;
    stopPreview();
    paintOpen();
    if (typeof onClose === 'function') onClose();
  }

  function sync() {
    refreshDigests(false);
    paintAll();
  }

  function destroy() {
    mq.removeEventListener?.('change', onMq);
    gridResizeObserver?.disconnect();
    window.removeEventListener?.('resize', onWindowResize);
    document.removeEventListener('keydown', onDocKey);
    grid.removeEventListener('pointerdown', onGridPointerDown);
    grid.removeEventListener('pointermove', onGridPointerMove);
    grid.removeEventListener('pointerup', onGridPointerUp);
    grid.removeEventListener('pointercancel', onGridPointerUp);
    grid.removeEventListener('dblclick', onBarDblClick);
    grid.removeEventListener('keydown', onGridKeyDown);
    if (root.parentElement) root.parentElement.removeChild(root);
    else host.innerHTML = '';
  }

  groupBtn.addEventListener('click', () => groupSelection());
  splitSectionBtn.addEventListener('click', () => {
    segments = autoSplitByMarkers(digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    clearSelection();
    paintAll();
  });
  everyBtn.addEventListener('click', () => {
    const n = Math.max(1, Math.min(32, Number(everyInput.value) || 4));
    everyInput.value = String(n);
    segments = autoSplitEveryN(digests, n);
    segments = sortSegments(segments);
    markSegmentsChanged();
    clearSelection();
    paintAll();
  });
  splitNotesBtn.addEventListener('click', () => {
    const annos = typeof getAnnotations === 'function' ? getAnnotations() : [];
    segments = autoSplitFromAnnotations(annos, digests);
    segments = sortSegments(segments);
    markSegmentsChanged();
    clearSelection();
    paintAll();
  });
  clearBtn.addEventListener('click', () => {
    stopPreview();
    segments = [];
    markSegmentsChanged();
    clearSelection();
    paintAll();
  });
  closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  importBtn.addEventListener('click', () => doImport());

  everyInput.addEventListener('input', () => paintToolbar());
  everyInput.addEventListener('change', () => {
    const n = Math.max(1, Math.min(32, Number(everyInput.value) || 4));
    everyInput.value = String(n);
    paintToolbar();
  });

  folderSelect.addEventListener('change', () => {
    const v = folderSelect.value;
    if (v === '__new__') {
      newFolderWrap.hidden = false;
      newFolderInput.focus?.();
      return;
    }
    newFolderWrap.hidden = true;
    folderId = v;
  });

  newFolderCreate.addEventListener('click', () => {
    const name = (newFolderInput.value || '').trim();
    if (!name || typeof onCreateFolder !== 'function') return;
    const created = onCreateFolder(name);
    if (!created?.id) return;
    newFolderInput.value = '';
    folderId = created.id;
    newFolderWrap.hidden = true;
    paintFolders();
    folderSelect.value = created.id;
  });

  grid.addEventListener('pointerdown', onGridPointerDown);
  grid.addEventListener('pointermove', onGridPointerMove);
  grid.addEventListener('pointerup', onGridPointerUp);
  grid.addEventListener('pointercancel', onGridPointerUp);
  grid.addEventListener('dblclick', onBarDblClick);
  grid.addEventListener('keydown', onGridKeyDown);

  function onDocKey(e) {
    if (e.key === 'Escape' && openState) {
      if (hasSelection(selection)) {
        clearSelection();
        paintGroupBtn();
        paintBarStates();
        e.preventDefault?.();
        e.stopPropagation?.();
        return;
      }
      close();
      e.preventDefault?.();
    }
  }
  document.addEventListener('keydown', onDocKey);

  const mq = window.matchMedia('(max-width: 768px)');
  const onMq = () => { computeGridCols(); };
  mq.addEventListener?.('change', onMq);

  function onWindowResize() {
    computeGridCols();
  }
  window.addEventListener?.('resize', onWindowResize);

  let gridResizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    gridResizeObserver = new ResizeObserver(() => computeGridCols());
    gridResizeObserver.observe(grid);
  }

  paintOpen();
  try {
    refreshDigests(true);
  } catch (err) {
    console.error(err);
  }

  return {
    open,
    close,
    isOpen: () => openState,
    sync,
    destroy,
  };
}
