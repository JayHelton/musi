// Song Learning: import a Guitar Pro score, split it into section snippets
// (guitar + drums), save them individually, and practice each part.

import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import { buildGpSectionSnippets } from './drums/gpDrumImport.js';
import { modelToAsciiTab } from './tab/guitarPro.js';
import { createTabPlayer } from './tab/tabPlayer.js';
import { ensureAudio } from './audio.js';
import * as engine from './drums/drumEngine.js';
import {
  listSongs,
  getSong,
  deleteSong,
  renameSong,
  removeSection,
  createSongFromGpSnippets,
  attachmentsSupported,
} from './songLearnStore.js';
import { savePattern } from './drums/drumPatternDb.js';

const state = {
  bound: false,
  view: 'library', // library | import | detail
  detailId: null,
  import: null, // { file, fileName, gp, snippets, guitarIdx, drumIdx, selected:Set }
  player: null,
  playingSectionId: null,
};

function $(id) { return document.getElementById(id); }

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v === false || v == null) { /* skip */ }
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function setStatus(msg, kind = '') {
  const box = $('sln-status');
  if (!box) return;
  box.textContent = msg || '';
  box.dataset.kind = kind;
  box.hidden = !msg;
}

function stopPlayback() {
  if (state.player) {
    try { state.player.stop(); } catch (e) { /* ignore */ }
  }
  try { engine.stop(); } catch (e) { /* ignore */ }
  state.playingSectionId = null;
}

function rebuildSnippets() {
  const imp = state.import;
  if (!imp?.gp) return;
  imp.snippets = buildGpSectionSnippets(imp.gp, {
    guitarTrackIndex: imp.guitarIdx,
    drumTrackIndex: imp.drumIdx,
    includeGuitar: (imp.gp.tracks || []).length > 0,
    includeDrums: (imp.gp.drumTracks || []).length > 0,
  });
  // Default-select sections that have content.
  imp.selected = new Set(
    imp.snippets.filter((s) => s.hasGuitar || s.hasDrums).map((s) => s.id)
  );
}

async function loadGpFile(file) {
  if (!file || !isGuitarProName(file.name)) {
    setStatus('Choose a Guitar Pro .gp or .gp5 file.', 'error');
    return;
  }
  setStatus(`Reading ${file.name}…`);
  stopPlayback();
  try {
    const buf = await file.arrayBuffer();
    const gp = await parseGuitarPro(buf);
    const hasGuitar = (gp.tracks || []).length > 0;
    const hasDrums = (gp.drumTracks || []).length > 0;
    if (!hasGuitar && !hasDrums) {
      setStatus('No guitar or drum parts found in that file.', 'error');
      return;
    }
    state.import = {
      file,
      fileName: file.name,
      bytes: new Uint8Array(buf),
      gp,
      guitarIdx: 0,
      drumIdx: 0,
      snippets: [],
      selected: new Set(),
      saveDrumsToLibrary: true,
    };
    rebuildSnippets();
    state.view = 'import';
    const tempo = gp.tempo || gp.tracks?.[0]?.model?.tempo || gp.drumTracks?.[0]?.tempo || 120;
    setStatus(
      `Loaded ${file.name} · ${gp.tracks?.length || 0} guitar · ${gp.drumTracks?.length || 0} drums · ${Math.round(tempo)} BPM`
    );
    render();
  } catch (err) {
    setStatus(err?.message || 'Could not read that Guitar Pro file.', 'error');
  }
}

async function saveImport() {
  const imp = state.import;
  if (!imp) return;
  const picked = imp.snippets.filter((s) => imp.selected.has(s.id) && (s.hasGuitar || s.hasDrums));
  if (!picked.length) {
    setStatus('Select at least one section with guitar or drums.', 'error');
    return;
  }
  try {
    const song = await createSongFromGpSnippets({
      file: imp.file,
      fileName: imp.fileName,
      title: imp.fileName.replace(/\.(gp|gp5)$/i, ''),
      tempo: picked[0].tempo,
      guitarTrackName: imp.gp.tracks?.[imp.guitarIdx]?.name || null,
      drumTrackName: imp.gp.drumTracks?.[imp.drumIdx]?.name || null,
      snippets: picked,
      saveDrumsToLibrary: !!imp.saveDrumsToLibrary,
    });
    state.detailId = song.id;
    state.view = 'detail';
    state.import = null;
    setStatus(`Saved “${song.title}” with ${song.sections.length} section${song.sections.length === 1 ? '' : 's'}.`);
    render();
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

function playGuitarSnippet(section) {
  stopPlayback();
  if (!section?.guitar?.events?.length) return;
  ensureAudio();
  if (!state.player) state.player = createTabPlayer();
  state.player.load(section.guitar, { bpm: section.tempo || section.guitar.tempo || 120 });
  state.player.play();
  state.playingSectionId = section.id + ':g';
  renderDetailActions();
}

function playDrumSnippet(section) {
  stopPlayback();
  if (!section?.drums?.steps?.length) return;
  engine.initEngine();
  engine.schedulePattern(section.drums);
  engine.setBpm(section.tempo || section.drums.bpmRange?.[0] || 120);
  engine.setEngineOptions({ looping: true, metronome: false, countIn: false });
  engine.start();
  state.playingSectionId = section.id + ':d';
  renderDetailActions();
}

function renderDetailActions() {
  document.querySelectorAll('[data-sln-play]').forEach((btn) => {
    const key = btn.getAttribute('data-sln-play');
    btn.textContent = state.playingSectionId === key ? '■ Stop' : btn.dataset.label || 'Play';
  });
}

function renderLibrary(root) {
  const songs = listSongs();
  root.innerHTML = '';
  const tools = el('div', { class: 'sln-tools' }, [
    el('button', {
      class: 'btn primary', type: 'button', text: '+ Import Guitar Pro',
      onClick: () => $('sln-file')?.click(),
    }),
  ]);
  root.appendChild(tools);

  if (!songs.length) {
    root.appendChild(el('div', {
      class: 'sln-empty',
      text: 'Import a .gp / .gp5 score to split it into practice snippets for guitar and drums.',
    }));
    return;
  }

  const list = el('div', { class: 'sln-song-list' });
  songs.forEach((song) => {
    const card = el('div', { class: 'sln-song-card' });
    const gCount = song.sections.filter((s) => s.hasGuitar).length;
    const dCount = song.sections.filter((s) => s.hasDrums).length;
    card.appendChild(el('div', { class: 'sln-song-head' }, [
      el('div', { class: 'sln-song-title', text: song.title }),
      el('div', { class: 'sln-song-meta', text: `${song.sections.length} sections · ${gCount} guitar · ${dCount} drums · ${Math.round(song.tempo)} BPM` }),
    ]));
    const actions = el('div', { class: 'sln-song-actions' });
    actions.appendChild(el('button', {
      class: 'btn sm primary', type: 'button', text: 'Open',
      onClick: () => { state.detailId = song.id; state.view = 'detail'; render(); },
    }));
    actions.appendChild(el('button', {
      class: 'btn sm', type: 'button', text: 'Rename',
      onClick: () => {
        const next = prompt('Song title', song.title);
        if (next == null) return;
        renameSong(song.id, next);
        render();
      },
    }));
    actions.appendChild(el('button', {
      class: 'btn sm sln-danger', type: 'button', text: 'Delete',
      onClick: async () => {
        if (!confirm(`Delete “${song.title}” and its snippets?`)) return;
        await deleteSong(song.id);
        render();
      },
    }));
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}

function renderImport(root) {
  const imp = state.import;
  if (!imp) { state.view = 'library'; render(); return; }
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'sln-import-head' }, [
    el('button', {
      class: 'btn sm', type: 'button', text: '← Back',
      onClick: () => { state.import = null; state.view = 'library'; setStatus(''); render(); },
    }),
    el('div', { class: 'sln-import-title', text: imp.fileName }),
  ]));

  const trackRow = el('div', { class: 'sln-track-row' });
  if ((imp.gp.tracks || []).length) {
    const gSel = el('select', { class: 'sln-select', 'aria-label': 'Guitar track' });
    imp.gp.tracks.forEach((t, i) => {
      gSel.appendChild(el('option', { value: String(i), text: `Guitar: ${t.name} (${t.noteCount} notes)` }));
    });
    gSel.value = String(imp.guitarIdx);
    gSel.onchange = () => { imp.guitarIdx = Number(gSel.value) || 0; rebuildSnippets(); render(); };
    trackRow.appendChild(el('label', { class: 'sln-field' }, [el('span', { text: 'Guitar track' }), gSel]));
  }
  if ((imp.gp.drumTracks || []).length) {
    const dSel = el('select', { class: 'sln-select', 'aria-label': 'Drum track' });
    imp.gp.drumTracks.forEach((t, i) => {
      dSel.appendChild(el('option', { value: String(i), text: `Drums: ${t.name} (${t.hitCount} hits)` }));
    });
    dSel.value = String(imp.drumIdx);
    dSel.onchange = () => { imp.drumIdx = Number(dSel.value) || 0; rebuildSnippets(); render(); };
    trackRow.appendChild(el('label', { class: 'sln-field' }, [el('span', { text: 'Drum track' }), dSel]));
  }
  root.appendChild(trackRow);

  const opts = el('div', { class: 'sln-import-opts' });
  const chk = el('input', {
    type: 'checkbox', id: 'sln-save-drums',
    checked: imp.saveDrumsToLibrary ? 'checked' : null,
  });
  chk.checked = !!imp.saveDrumsToLibrary;
  chk.onchange = () => { imp.saveDrumsToLibrary = !!chk.checked; };
  opts.appendChild(el('label', { class: 'sln-check', for: 'sln-save-drums' }, [
    chk,
    el('span', { text: 'Also save drum snippets to the Drums library' }),
  ]));
  root.appendChild(opts);

  const list = el('div', { class: 'sln-snip-list' });
  imp.snippets.forEach((s) => {
    const row = el('div', { class: 'sln-snip-card' });
    const head = el('label', { class: 'sln-snip-head' });
    const box = el('input', { type: 'checkbox' });
    box.checked = imp.selected.has(s.id);
    box.onchange = () => {
      if (box.checked) imp.selected.add(s.id);
      else imp.selected.delete(s.id);
    };
    head.append(box, el('div', {}, [
      el('div', { class: 'sln-snip-title', text: s.label }),
      el('div', {
        class: 'sln-snip-meta',
        text: [
          s.type,
          `bars ${s.measureStart + 1}–${s.measureEnd || '?'}`,
          s.hasGuitar ? 'guitar' : null,
          s.hasDrums ? 'drums' : null,
          `${Math.round(s.tempo)} BPM`,
        ].filter(Boolean).join(' · '),
      }),
    ]));
    row.appendChild(head);
    if (s.hasDrums && s.drums?.tab) {
      row.appendChild(el('pre', { class: 'sln-tab', text: s.drums.tab }));
    } else if (s.hasGuitar && s.guitar) {
      row.appendChild(el('pre', { class: 'sln-tab', text: modelToAsciiTab(s.guitar, { maxCols: 72 }) || '(guitar)' }));
    } else {
      row.appendChild(el('div', { class: 'sln-snip-empty', text: 'No playable content in this section for the selected tracks.' }));
    }
    list.appendChild(row);
  });
  root.appendChild(list);

  root.appendChild(el('div', { class: 'sln-import-actions' }, [
    el('button', {
      class: 'btn primary', type: 'button', text: `Save ${imp.selected.size} snippet${imp.selected.size === 1 ? '' : 's'}`,
      onClick: saveImport,
    }),
  ]));
}

function renderDetail(root) {
  const song = getSong(state.detailId);
  if (!song) { state.view = 'library'; render(); return; }
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'sln-import-head' }, [
    el('button', {
      class: 'btn sm', type: 'button', text: '← Library',
      onClick: () => { stopPlayback(); state.view = 'library'; state.detailId = null; render(); },
    }),
    el('div', { class: 'sln-import-title', text: song.title }),
  ]));
  root.appendChild(el('div', {
    class: 'sln-song-meta',
    text: `${song.fileName || 'Guitar Pro'} · ${Math.round(song.tempo)} BPM · ${song.sections.length} sections`,
  }));

  const list = el('div', { class: 'sln-snip-list' });
  song.sections.forEach((sec) => {
    const card = el('div', { class: 'sln-snip-card' });
    card.appendChild(el('div', { class: 'sln-snip-title', text: sec.label }));
    card.appendChild(el('div', {
      class: 'sln-snip-meta',
      text: [
        sec.type,
        sec.hasGuitar ? `guitar (${sec.guitarTrackName || 'track'})` : null,
        sec.hasDrums ? `drums (${sec.drumTrackName || 'kit'})` : null,
        `${Math.round(sec.tempo || song.tempo)} BPM`,
      ].filter(Boolean).join(' · '),
    }));

    if (sec.hasDrums && sec.drums?.tab) {
      card.appendChild(el('pre', { class: 'sln-tab', text: sec.drums.tab }));
    } else if (sec.hasGuitar && sec.guitar) {
      card.appendChild(el('pre', { class: 'sln-tab', text: modelToAsciiTab(sec.guitar, { maxCols: 72 }) || '' }));
    }

    const actions = el('div', { class: 'sln-snip-actions' });
    if (sec.hasGuitar) {
      const gKey = sec.id + ':g';
      const gBtn = el('button', {
        class: 'btn sm primary', type: 'button',
        text: state.playingSectionId === gKey ? '■ Stop' : '▶ Guitar',
        'data-sln-play': gKey,
      });
      gBtn.dataset.label = '▶ Guitar';
      gBtn.onclick = () => {
        if (state.playingSectionId === gKey) { stopPlayback(); renderDetailActions(); return; }
        playGuitarSnippet(sec);
      };
      actions.appendChild(gBtn);
    }
    if (sec.hasDrums) {
      const dKey = sec.id + ':d';
      const dBtn = el('button', {
        class: 'btn sm primary', type: 'button',
        text: state.playingSectionId === dKey ? '■ Stop' : '▶ Drums',
        'data-sln-play': dKey,
      });
      dBtn.dataset.label = '▶ Drums';
      dBtn.onclick = () => {
        if (state.playingSectionId === dKey) { stopPlayback(); renderDetailActions(); return; }
        playDrumSnippet(sec);
      };
      actions.appendChild(dBtn);
      actions.appendChild(el('button', {
        class: 'btn sm', type: 'button', text: 'Save to Drums',
        onClick: async () => {
          if (!sec.drums) return;
          const saved = await savePattern({
            ...sec.drums,
            id: null,
            title: `${song.title} · ${sec.label}`,
            tags: [...(sec.drums.tags || []), 'song-learn'],
          });
          setStatus(saved ? `Saved “${saved.title}” to Drums library.` : 'Could not save drum pattern.', saved ? '' : 'error');
        },
      }));
    }
    actions.appendChild(el('button', {
      class: 'btn sm sln-danger', type: 'button', text: 'Remove',
      onClick: () => {
        if (!confirm(`Remove section “${sec.label}”?`)) return;
        stopPlayback();
        removeSection(song.id, sec.id);
        render();
      },
    }));
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}

function render() {
  const root = $('sln-root');
  if (!root) return;
  if (state.view === 'import') renderImport(root);
  else if (state.view === 'detail') renderDetail(root);
  else renderLibrary(root);
}

function bind() {
  const input = $('sln-file');
  const drop = $('sln-drop');
  if (input) {
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (f) loadGpFile(f);
    });
  }
  if (drop) {
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.classList.add('is-drag');
    }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
      e.preventDefault(); drop.classList.remove('is-drag');
      if (t === 'drop' && e.dataTransfer?.files?.[0]) loadGpFile(e.dataTransfer.files[0]);
    }));
  }
}

export function initSongLearn() {
  if (!state.bound) {
    state.bound = true;
    bind();
  }
  window.__musiLoadSongLearnGp = async (handoff) => {
    if (!handoff?.bytes) return;
    await importGpBytesToSongLearn(handoff.bytes, handoff.name || 'score.gp');
    window.__musiSongLearnGp = null;
  };
  if (!attachmentsSupported()) {
    setStatus('Browser storage is limited here — songs may not persist across sessions.', 'error');
  }
  render();
  if (window.__musiSongLearnGp) {
    window.__musiLoadSongLearnGp(window.__musiSongLearnGp);
  }
}

export function stopSongLearn() {
  stopPlayback();
}

/** Open Song Learning directly into an import of the given GP bytes (handoff). */
export async function importGpBytesToSongLearn(bytes, fileName = 'score.gp') {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  state.view = 'library';
  await loadGpFile(file);
}
