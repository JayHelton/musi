// Song Learning: import a Guitar Pro score, practice with the Guitar Pro Player,
// and save user-selected measure ranges as Exercises. Sections are not auto-detected.

import { parseGuitarPro, isGuitarProName } from './tab/guitarPro.js';
import { mountGpPlayer } from './gpPlayerUI.js';
import { sliceGuitarModel } from './drums/gpDrumImport.js';
import {
  listSongs,
  getSong,
  deleteSong,
  renameSong,
  createSongFromGp,
  getSongSourceBlob,
  attachmentsSupported,
} from './songLearnStore.js';
import { saveFile, ensurePersistentStorage } from './attachments.js';
import { addGpExerciseFromAttachment } from './exercises.js';
import {
  createSongPlayer,
  buildFollowColumns,
  mountFollowView,
} from './songLearnPlayer.js';

const state = {
  bound: false,
  view: 'library', // library | import | detail
  detailId: null,
  import: null,
  player: null,
  follow: null,
  gpMount: null,
  practice: {
    measureStart: 0,
    measureEnd: 0,
    loopRestSec: 2,
    preferredTrackIndex: 0,
    loopEnabled: true,
  },
  activeSectionId: 'all', // 'all' | section id | 'selection'
  loopEnabled: true,
  loopRestSec: 2,
  bpm: 120,
  scoreBpm: 120,
  selStart: 0, // measure index
  selEnd: 0,
  dragAnchor: null, // measure drag-select start
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

function destroyFollow() {
  if (state.follow) {
    try { state.follow.destroy(); } catch (e) { /* ignore */ }
    state.follow = null;
  }
}

function destroyGpMount() {
  if (state.gpMount) {
    try { state.gpMount.destroy(); } catch (e) { /* ignore */ }
    state.gpMount = null;
  }
}

function stopPlayback() {
  if (state.player) {
    try { state.player.stop(); } catch (e) { /* ignore */ }
  }
  if (state.gpMount?.player) {
    try { state.gpMount.player.stop(); } catch (e) { /* ignore */ }
  }
  syncTransportButtons();
}

function syncDropVisibility() {
  const drop = $('sln-drop');
  if (!drop) return;
  // Drop zone is only the empty-library importer. A filled library uses the
  // in-list "+ Import" button; import/detail views hide upload entirely so
  // the file picker isn't offered twice on the same screen.
  drop.hidden = !(state.view === 'library' && listSongs().length === 0);
}

/** Ensure a tab/perc model has a usable measures[] for the strip (4/4 bars from totalBeats). */
function ensureMeasures(model) {
  if (!model) return model;
  if (Array.isArray(model.measures) && model.measures.length) return model;
  const total = Number(model.totalBeats);
  const end = Number.isFinite(total) && total > 0
    ? total
    : Math.max(4, ...((model.events || []).map((e) => (Number(e.start) || 0) + (Number(e.duration) || 0.25))), 4);
  const bars = Math.max(1, Math.ceil(end / 4 - 1e-9));
  const measures = [];
  for (let i = 0; i < bars; i++) {
    measures.push({
      startSlot: i,
      endSlot: i + 1,
      startBeat: i * 4,
      endBeat: Math.min(end, (i + 1) * 4),
      marker: null,
    });
  }
  model.measures = measures;
  if (!Number.isFinite(model.totalBeats) || model.totalBeats < end) model.totalBeats = end;
  return model;
}

function ensurePlayer() {
  if (state.player) return state.player;
  state.player = createSongPlayer({
    onTick: (info) => {
      if (state.follow) {
        state.follow.update({
          ...info,
          playing: info.playing && !info.resting,
        });
      }
      syncTransportButtons(info);
      highlightActiveBar(info.measureIndex);
      const restEl = $('sln-rest-status');
      if (restEl) {
        restEl.textContent = info.resting && info.restRemaining > 0
          ? `Rest ${info.restRemaining.toFixed(1)}s`
          : '';
      }
    },
  });
  return state.player;
}

function songMeasures(song) {
  const { guitar, drums } = songModels(song);
  if (guitar) ensureMeasures(guitar);
  if (drums) ensureMeasures(drums);
  return guitar?.measures || drums?.measures || [];
}

function measureBeatRange(measures, startIdx, endIdx) {
  if (!measures.length) return { startBeat: 0, endBeat: 4 };
  const a = Math.max(0, Math.min(measures.length - 1, startIdx));
  const b = Math.max(a, Math.min(measures.length - 1, endIdx));
  const startBeat = Number.isFinite(measures[a].startBeat) ? measures[a].startBeat : 0;
  const endBeat = Number.isFinite(measures[b].endBeat)
    ? measures[b].endBeat
    : startBeat + 4;
  return { startBeat, endBeat, startIdx: a, endIdx: b };
}

function stitchGuitarFromSections(sections) {
  const parts = (sections || []).filter((s) => s.guitar?.events?.length);
  if (!parts.length) return null;
  if (parts.length === 1 && (parts[0].startBeat || 0) === 0) return parts[0].guitar;
  const base = parts[0].guitar;
  const events = [];
  const measures = [];
  for (const sec of parts) {
    const offset = Number(sec.startBeat) || 0;
    for (const ev of sec.guitar.events || []) {
      events.push({
        ...ev,
        techniques: Array.isArray(ev.techniques) ? ev.techniques.slice() : [],
        start: (Number.isFinite(ev.start) ? ev.start : 0) + offset,
      });
    }
    for (const m of sec.guitar.measures || []) {
      measures.push({
        ...m,
        startBeat: (Number.isFinite(m.startBeat) ? m.startBeat : 0) + offset,
        endBeat: (Number.isFinite(m.endBeat) ? m.endBeat : 0) + offset,
        marker: m.marker || sec.label || null,
      });
    }
  }
  events.sort((a, b) => (a.start - b.start) || (a.stringIndex - b.stringIndex));
  const totalBeats = Math.max(...measures.map((m) => m.endBeat), ...events.map((e) => e.start + (e.duration || 0)), 0);
  return {
    ...base,
    strings: (base.strings || []).map((s) => ({ ...s })),
    events,
    measures,
    totalBeats,
  };
}

function stitchDrumsFromSections(sections, tempo) {
  // Prefer timed events if a section stored a perc-like model under drums.events.
  const hits = [];
  const measures = [];
  for (const sec of sections || []) {
    const offset = Number(sec.startBeat) || 0;
    if (Array.isArray(sec.drums?.events)) {
      for (const e of sec.drums.events) {
        hits.push({ ...e, start: (Number.isFinite(e.start) ? e.start : 0) + offset });
      }
    } else if (sec.drums?.steps && sec.drums.stepsPerBar) {
      // Approximate from quantized pattern steps.
      const spb = ({ '8th': 2, '16th': 4, triplet: 3, sixEight: 2 }[sec.drums.subdivision] || 4);
      for (const s of sec.drums.steps) {
        hits.push({
          start: offset + (s.step / spb),
          duration: 1 / spb,
          instrument: s.instrument,
          velocity: s.velocity ?? 0.78,
          midi: 0,
          slot: s.step,
        });
      }
    }
    measures.push({
      startSlot: measures.length,
      endSlot: measures.length + 1,
      startBeat: offset,
      endBeat: Number(sec.endBeat) || (offset + 4),
      marker: sec.label || null,
    });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);
  return {
    percussion: true,
    name: 'Drums',
    tempo: tempo || 120,
    events: hits,
    measures,
    slots: hits.length,
    totalBeats: Math.max(...measures.map((m) => m.endBeat), ...hits.map((h) => h.start + 0.25), 0),
    warnings: [],
  };
}

function songModels(song) {
  let guitar = song.fullGuitar || null;
  let guitars = Array.isArray(song.fullGuitars) ? song.fullGuitars.filter(Boolean) : [];
  let drums = song.fullDrums || null;
  if (!guitar) guitar = stitchGuitarFromSections(song.sections);
  if (!guitars.length && guitar) guitars = [guitar];
  if (!drums) drums = stitchDrumsFromSections(song.sections, song.tempo);
  return { guitar, guitars, drums };
}

function sectionRange(song, sectionId) {
  const measures = songMeasures(song);
  if (!sectionId || sectionId === 'all') {
    const { guitar, drums } = songModels(song);
    const end = Math.max(
      guitar?.totalBeats || 0,
      drums?.totalBeats || 0,
      ...(song.sections || []).map((s) => s.endBeat || 0),
      4
    );
    return {
      startBeat: 0,
      endBeat: end,
      loop: state.loopEnabled,
      label: 'Full song',
      startIdx: 0,
      endIdx: Math.max(0, measures.length - 1),
    };
  }
  if (sectionId === 'selection') {
    const start = Number.isFinite(state.practice?.measureStart) ? state.practice.measureStart : state.selStart;
    const end = Number.isFinite(state.practice?.measureEnd) ? state.practice.measureEnd : state.selEnd;
    const beats = measureBeatRange(measures, start, end);
    return {
      ...beats,
      loop: state.loopEnabled || !!state.practice?.loopEnabled,
      label: `Bars ${beats.startIdx + 1}–${beats.endIdx + 1}`,
    };
  }
  const sec = (song.sections || []).find((s) => s.id === sectionId);
  if (!sec) return sectionRange(song, 'all');
  // Map section beats back onto measure indices when possible.
  let startIdx = 0;
  let endIdx = Math.max(0, measures.length - 1);
  for (let i = 0; i < measures.length; i++) {
    const ms = Number.isFinite(measures[i].startBeat) ? measures[i].startBeat : 0;
    const me = Number.isFinite(measures[i].endBeat) ? measures[i].endBeat : ms;
    if (ms <= (sec.startBeat || 0) + 1e-6 && me > (sec.startBeat || 0) + 1e-6) startIdx = i;
    if (ms < (sec.endBeat || 0) - 1e-6 && me >= (sec.endBeat || 0) - 1e-6) endIdx = i;
  }
  return {
    startBeat: sec.startBeat || 0,
    endBeat: sec.endBeat || (sec.startBeat + 4),
    loop: state.loopEnabled,
    label: sec.label,
    startIdx,
    endIdx,
  };
}

function loadPlayerForSong(song, sectionId = state.activeSectionId) {
  const player = ensurePlayer();
  const { guitar, guitars, drums } = songModels(song);
  const range = sectionRange(song, sectionId);
  // Full song mixes every fretted track + drums; focused ranges use the primary guitar.
  const mixAll = !sectionId || sectionId === 'all';
  player.load({
    guitarModel: guitar,
    guitarModels: mixAll ? guitars : (guitar ? [guitar] : []),
    percModel: drums,
    bpm: state.bpm || song.tempo,
    startBeat: range.startBeat,
    endBeat: range.endBeat,
    loop: range.loop,
    loopRestSec: state.loopRestSec,
  });
  remountFollow(song, range);
  return range;
}

function highlightActiveBar(idx) {
  document.querySelectorAll('#sln-strip .sln-bar').forEach((b) => {
    const i = Number(b.dataset.index);
    b.classList.toggle('active', i === idx);
    b.classList.toggle(
      'selected',
      i >= Math.min(state.selStart, state.selEnd) && i <= Math.max(state.selStart, state.selEnd)
    );
  });
}

function currentSelectionRange(song) {
  const measures = songMeasures(song);
  const fromPractice = state.practice;
  let a = Number.isFinite(fromPractice.measureStart) ? fromPractice.measureStart : state.selStart;
  let b = Number.isFinite(fromPractice.measureEnd) ? fromPractice.measureEnd : state.selEnd;
  a = Math.min(a, b);
  b = Math.max(a, b);
  if (measures.length) {
    a = Math.max(0, Math.min(measures.length - 1, a));
    b = Math.max(a, Math.min(measures.length - 1, b));
  }
  return { a, b, measures, beats: measureBeatRange(measures, a, b) };
}

async function saveSelectionAsExercise(song) {
  const { a, b, measures, beats } = currentSelectionRange(song);
  if (!measures.length && !song.fullGuitar && !(song.sections || []).some((s) => s.guitar)) {
    setStatus('No measures available to save.', 'error');
    return;
  }
  const rest = Number.isFinite(state.practice.loopRestSec)
    ? state.practice.loopRestSec
    : state.loopRestSec;
  const trackIdx = Number.isFinite(state.practice.preferredTrackIndex)
    ? state.practice.preferredTrackIndex
    : 0;
  const name = `${song.title} · bars ${a + 1}–${b + 1}`;
  try {
    await ensurePersistentStorage();
    const sourceBlob = await getSongSourceBlob(song);
    if (sourceBlob) {
      const meta = await saveFile({
        blob: sourceBlob,
        name: name.replace(/[^\w\- ]+/g, '').trim() || 'exercise',
        type: 'application/x-guitar-pro',
        fileName: song.fileName || 'score.gp',
        size: sourceBlob.size || 0,
        source: 'exercise',
      });
      if (!meta) throw new Error('Could not store exercise file.');
      const item = addGpExerciseFromAttachment({
        attachmentId: meta.id,
        name,
        fileName: song.fileName || meta.fileName || 'score.gp',
        type: 'application/x-guitar-pro',
        size: meta.size || sourceBlob.size || 0,
        measureStart: a,
        measureEnd: b,
        startBeat: beats?.startBeat,
        endBeat: beats?.endBeat,
        loopEnabled: true,
        loopRestSec: rest,
        preferredTrackIndex: trackIdx,
      });
      setStatus(item
        ? `Saved “${item.name}” to Exercises (bars ${a + 1}–${b + 1}, ${rest}s rest).`
        : 'Could not add exercise.', item ? '' : 'error');
      return;
    }

    // Fallback: store a sliced tab-model snippet when the original GP blob is gone.
    const { guitar, guitars } = songModels(song);
    const model = ensureMeasures(guitars?.[trackIdx] || guitar);
    if (!model) {
      setStatus('No guitar track to save as an exercise.', 'error');
      return;
    }
    const sliced = sliceGuitarModel(model, {
      startBeat: beats.startBeat,
      endBeat: beats.endBeat,
      label: name,
    });
    const payload = {
      kind: 'musi-tab-model',
      tempo: state.bpm || song.tempo,
      trackName: song.guitarTrackName || 'Guitar',
      sourceName: song.fileName || song.title,
      measureStart: a,
      measureEnd: b,
      model: sliced,
    };
    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const fileName = `${(song.title || 'exercise').replace(/[^\w\- ]+/g, '').trim() || 'exercise'}-bars-${a + 1}-${b + 1}.musi-tab.json`;
    const meta = await saveFile({
      blob,
      name: fileName.replace(/\.musi-tab\.json$/i, ''),
      type: 'application/x-musi-tab-model',
      fileName,
      size: blob.size,
      source: 'exercise',
    });
    if (!meta) throw new Error('Could not store exercise snippet.');
    const item = addGpExerciseFromAttachment({
      attachmentId: meta.id,
      name,
      fileName,
      type: 'application/x-musi-tab-model',
      size: blob.size,
      measureStart: 0,
      measureEnd: Math.max(0, (sliced.measures || []).length - 1),
      loopEnabled: true,
      loopRestSec: rest,
      preferredTrackIndex: 0,
    });
    setStatus(item
      ? `Saved “${item.name}” to Exercises as a practice snippet.`
      : 'Could not add exercise.', item ? '' : 'error');
  } catch (err) {
    setStatus(err?.message || 'Could not save exercise.', 'error');
  }
}

function remountFollow(song, range) {
  destroyFollow();
  const host = $('sln-follow-host');
  if (!host) return;
  const { guitar, drums } = songModels(song);
  const layout = buildFollowColumns({
    guitarModel: guitar,
    percModel: drums,
    startBeat: range.startBeat,
    endBeat: range.endBeat,
  });
  state.follow = mountFollowView(host, layout);
  state.follow.update({
    currentSec: state.player?.currentSec || 0,
    bpm: state.bpm || song.tempo,
    playing: !!state.player?.playing,
    durationSec: state.player?.durationSec || 0,
  });
}

function syncTransportButtons(info) {
  const playing = info ? info.playing : !!state.player?.playing;
  const playBtn = $('sln-play');
  if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play';
  document.querySelectorAll('[data-sln-sec]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-sln-sec') === state.activeSectionId);
  });
  const gMute = $('sln-mute-g');
  const dMute = $('sln-mute-d');
  if (gMute) gMute.classList.toggle('muted', !!state.player?.muteGuitar);
  if (dMute) dMute.classList.toggle('muted', !!state.player?.muteDrums);
  const timeEl = $('sln-time');
  if (timeEl && state.player) {
    const cur = info?.currentSec ?? state.player.currentSec;
    const dur = info?.durationSec ?? state.player.durationSec;
    const fmt = (s) => {
      const n = Math.max(0, Math.floor(s || 0));
      return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    };
    timeEl.textContent = `${fmt(cur)} / ${fmt(dur)}`;
  }
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
    };
    state.view = 'import';
    const tempo = gp.tempo || gp.tracks?.[0]?.model?.tempo || gp.drumTracks?.[0]?.tempo || 120;
    const bars = gp.tracks?.[0]?.model?.measures?.length
      || gp.drumTracks?.[0]?.model?.measures?.length
      || 0;
    setStatus(
      `Loaded ${file.name} · ${gp.tracks?.length || 0} guitar · ${gp.drumTracks?.length || 0} drums · ${bars || '?'} bars · ${Math.round(tempo)} BPM`
    );
    render();
  } catch (err) {
    setStatus(err?.message || 'Could not read that Guitar Pro file.', 'error');
  }
}

async function saveImport() {
  const imp = state.import;
  if (!imp) return;
  try {
    const gTrack = imp.gp.tracks?.[imp.guitarIdx] || null;
    const dTrack = imp.gp.drumTracks?.[imp.drumIdx] || null;
    const fullGuitar = gTrack?.model ? JSON.parse(JSON.stringify(gTrack.model)) : null;
    const fullGuitars = (imp.gp.tracks || [])
      .map((t) => (t?.model ? JSON.parse(JSON.stringify(t.model)) : null))
      .filter(Boolean);
    const fullDrums = dTrack?.model ? JSON.parse(JSON.stringify(dTrack.model)) : null;
    if (!fullGuitar && !fullGuitars.length && !fullDrums) {
      setStatus('Pick a guitar or drum track to save.', 'error');
      return;
    }
    const tempo = imp.gp.tempo
      || gTrack?.model?.tempo
      || dTrack?.model?.tempo
      || 120;
    const song = await createSongFromGp({
      file: imp.file,
      fileName: imp.fileName,
      title: imp.fileName.replace(/\.(gp|gp5)$/i, ''),
      tempo,
      guitarTrackName: gTrack?.name || null,
      drumTrackName: dTrack?.name || null,
      fullGuitar,
      fullGuitars,
      fullDrums,
    });
    state.detailId = song.id;
    state._practiceSongId = null;
    state.view = 'detail';
    state.activeSectionId = 'selection';
    state.import = null;
    setStatus(`Saved “${song.title}”. Highlight measures in the player to turn them into Exercises.`);
    render();
  } catch (err) {
    setStatus(err?.message || 'Save failed.', 'error');
  }
}

function renderLibrary(root) {
  const songs = listSongs();
  root.innerHTML = '';

  if (!songs.length) {
    // Empty-state upload lives in #sln-drop — no second Import CTA or empty card.
    return;
  }

  root.appendChild(el('div', { class: 'sln-tools' }, [
    el('button', {
      class: 'btn primary', type: 'button', text: '+ Import Guitar Pro',
      onClick: () => $('sln-file')?.click(),
    }),
  ]));

  const list = el('div', { class: 'sln-song-list' });
  songs.forEach((song) => {
    const card = el('div', { class: 'sln-song-card' });
    const bars = songMeasures(song).length;
    const parts = [
      bars ? `${bars} bars` : null,
      song.fullGuitar || (song.fullGuitars || []).length ? 'guitar' : null,
      song.fullDrums ? 'drums' : null,
      `${Math.round(song.tempo)} BPM`,
    ].filter(Boolean).join(' · ');
    card.appendChild(el('div', { class: 'sln-song-head' }, [
      el('div', { class: 'sln-song-title', text: song.title }),
      el('div', { class: 'sln-song-meta', text: parts }),
    ]));
    const actions = el('div', { class: 'sln-song-actions' });
    actions.appendChild(el('button', {
      class: 'btn sm primary', type: 'button', text: 'Practice',
      onClick: () => {
        stopPlayback();
        state.detailId = song.id;
        state._practiceSongId = null; // force practice UI reset
        state.activeSectionId = 'selection';
        state.view = 'detail';
        render();
      },
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
        if (!confirm(`Delete “${song.title}”?`)) return;
        stopPlayback();
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

  root.appendChild(el('div', {
    class: 'sln-player-banner',
    text: 'Choose tracks, save the song, then highlight measures in the Guitar Pro Player to create Exercises. Nothing is auto-split.',
  }));

  const trackRow = el('div', { class: 'sln-track-row' });
  if ((imp.gp.tracks || []).length) {
    const gSel = el('select', { class: 'sln-select', 'aria-label': 'Guitar track' });
    imp.gp.tracks.forEach((t, i) => {
      gSel.appendChild(el('option', { value: String(i), text: `Guitar: ${t.name} (${t.noteCount} notes)` }));
    });
    gSel.value = String(imp.guitarIdx);
    gSel.onchange = () => { imp.guitarIdx = Number(gSel.value) || 0; };
    trackRow.appendChild(el('label', { class: 'sln-field' }, [el('span', { text: 'Guitar track' }), gSel]));
  }
  if ((imp.gp.drumTracks || []).length) {
    const dSel = el('select', { class: 'sln-select', 'aria-label': 'Drum track' });
    imp.gp.drumTracks.forEach((t, i) => {
      dSel.appendChild(el('option', { value: String(i), text: `Drums: ${t.name} (${t.hitCount} hits)` }));
    });
    dSel.value = String(imp.drumIdx);
    dSel.onchange = () => { imp.drumIdx = Number(dSel.value) || 0; };
    trackRow.appendChild(el('label', { class: 'sln-field' }, [el('span', { text: 'Drum track' }), dSel]));
  }
  root.appendChild(trackRow);

  const bars = imp.gp.tracks?.[imp.guitarIdx]?.model?.measures?.length
    || imp.gp.drumTracks?.[imp.drumIdx]?.model?.measures?.length
    || 0;
  const tempo = imp.gp.tempo
    || imp.gp.tracks?.[imp.guitarIdx]?.model?.tempo
    || imp.gp.drumTracks?.[imp.drumIdx]?.model?.tempo
    || 120;
  root.appendChild(el('div', {
    class: 'sln-song-meta',
    text: `${bars || '?'} bars · ${Math.round(tempo)} BPM · full score (pick exercises in the player)`,
  }));

  root.appendChild(el('div', { class: 'sln-import-actions' }, [
    el('button', {
      class: 'btn primary', type: 'button',
      text: 'Save song & open player',
      onClick: saveImport,
    }),
  ]));
}

function renderFallbackMeasurePlayer(host, song) {
  const measures = songMeasures(song);
  if (measures.length) {
    if (state.selEnd === 0 && state.selStart === 0 && state.activeSectionId === 'all') {
      state.selEnd = measures.length - 1;
    }
    state.selStart = Math.max(0, Math.min(measures.length - 1, state.selStart));
    state.selEnd = Math.max(state.selStart, Math.min(measures.length - 1, state.selEnd));
    state.practice.measureStart = state.selStart;
    state.practice.measureEnd = state.selEnd;
  }

  const reload = (sectionId = state.activeSectionId, { autoplay = false } = {}) => {
    const was = autoplay || !!state.player?.playing;
    state.practice.measureStart = state.selStart;
    state.practice.measureEnd = state.selEnd;
    loadPlayerForSong(song, sectionId);
    if (was) state.player.play();
    syncTransportButtons();
    highlightActiveBar(state.player?.measureIndex ?? state.selStart);
    const rangeLabel = $('sln-sel-label');
    if (rangeLabel) {
      rangeLabel.textContent = `Highlighted bars ${Math.min(state.selStart, state.selEnd) + 1}–${Math.max(state.selStart, state.selEnd) + 1}`;
    }
  };

  const playerCard = el('div', { class: 'sln-player' });
  playerCard.appendChild(el('div', {
    class: 'sln-player-banner',
    text: 'Practice player — drag across bars to highlight a range, then save it as an Exercise.',
  }));

  const transport = el('div', { class: 'sln-transport' });
  transport.append(
    el('button', {
      class: 'btn primary', type: 'button', id: 'sln-play', text: 'Play',
      onClick: () => {
        const player = ensurePlayer();
        if (player.playing) player.pause();
        else if (player.paused) player.play();
        else {
          loadPlayerForSong(song, state.activeSectionId === 'all' ? 'selection' : state.activeSectionId);
          player.play();
        }
        syncTransportButtons();
      },
    }),
    el('button', {
      class: 'btn', type: 'button', text: 'Stop',
      onClick: () => {
        stopPlayback();
        if (state.follow) {
          state.follow.update({
            currentSec: state.player?.currentSec || 0,
            bpm: state.bpm,
            playing: false,
            durationSec: state.player?.durationSec || 0,
          });
        }
        syncTransportButtons();
      },
    }),
    el('button', {
      class: 'btn sm sln-mute', type: 'button', id: 'sln-mute-g', text: 'Guitar',
      onClick: () => {
        const player = ensurePlayer();
        player.setMuted({ guitar: !player.muteGuitar });
        syncTransportButtons();
      },
    }),
    el('button', {
      class: 'btn sm sln-mute', type: 'button', id: 'sln-mute-d', text: 'Drums',
      onClick: () => {
        const player = ensurePlayer();
        player.setMuted({ drums: !player.muteDrums });
        syncTransportButtons();
      },
    }),
    el('span', { class: 'sln-time', id: 'sln-time', text: '0:00 / 0:00' }),
    el('span', { class: 'sln-rest-status', id: 'sln-rest-status', text: '' }),
  );
  playerCard.appendChild(transport);

  const controls = el('div', { class: 'sln-controls' });
  const bpmInput = el('input', {
    type: 'number', class: 'sln-num', min: '40', max: '280', step: '1',
    value: String(Math.round(state.bpm)), 'aria-label': 'BPM',
  });
  bpmInput.onchange = () => {
    state.bpm = Math.max(40, Math.min(280, Number(bpmInput.value) || state.scoreBpm));
    bpmInput.value = String(state.bpm);
    reload('selection');
  };
  const loopChk = el('input', { type: 'checkbox', id: 'sln-loop' });
  loopChk.checked = !!state.loopEnabled;
  loopChk.onchange = () => { state.loopEnabled = !!loopChk.checked; reload('selection'); };
  const restInput = el('input', {
    type: 'number', class: 'sln-num', min: '0', max: '30', step: '0.5',
    value: String(state.loopRestSec), 'aria-label': 'Rest seconds between loops',
  });
  restInput.onchange = () => {
    state.loopRestSec = Math.max(0, Math.min(30, Number(restInput.value) || 0));
    state.practice.loopRestSec = state.loopRestSec;
    restInput.value = String(state.loopRestSec);
    reload('selection', { autoplay: !!state.player?.playing });
  };
  const startSel = el('select', { class: 'sln-select sln-bar-sel', 'aria-label': 'Selection start bar' });
  const endSel = el('select', { class: 'sln-select sln-bar-sel', 'aria-label': 'Selection end bar' });
  measures.forEach((m, i) => {
    const label = m.marker ? `${i + 1} · ${m.marker}` : String(i + 1);
    startSel.appendChild(el('option', { value: String(i), text: label }));
    endSel.appendChild(el('option', { value: String(i), text: label }));
  });
  startSel.value = String(state.selStart);
  endSel.value = String(state.selEnd);
  const onSelChange = () => {
    state.selStart = Number(startSel.value) || 0;
    state.selEnd = Number(endSel.value) || 0;
    if (state.selEnd < state.selStart) {
      state.selEnd = state.selStart;
      endSel.value = String(state.selEnd);
    }
    state.activeSectionId = 'selection';
    reload('selection');
  };
  startSel.onchange = onSelChange;
  endSel.onchange = onSelChange;

  controls.append(
    el('div', { class: 'sln-control-block' }, [
      el('div', { class: 'sln-control-label', text: 'Tempo' }),
      el('div', { class: 'sln-control-row' }, [
        bpmInput, el('span', { class: 'sln-unit', text: 'BPM' }),
      ]),
    ]),
    el('div', { class: 'sln-control-block' }, [
      el('div', { class: 'sln-control-label', text: 'Highlighted measures' }),
      el('div', { class: 'sln-control-row' }, [
        startSel, el('span', { class: 'sln-unit', text: '–' }), endSel,
        el('button', {
          class: 'btn sm primary', type: 'button', text: 'Play highlighted',
          onClick: () => {
            state.activeSectionId = 'selection';
            loadPlayerForSong(song, 'selection');
            state.player.play();
            syncTransportButtons();
          },
        }),
      ]),
      el('div', {
        class: 'sln-sel-label', id: 'sln-sel-label',
        text: measures.length
          ? `Highlighted bars ${state.selStart + 1}–${state.selEnd + 1}`
          : 'No measures found',
      }),
    ]),
    el('div', { class: 'sln-control-block' }, [
      el('div', { class: 'sln-control-label', text: 'Loop' }),
      el('div', { class: 'sln-control-row' }, [
        el('label', { class: 'sln-check', for: 'sln-loop' }, [loopChk, el('span', { text: 'Enable' })]),
        el('span', { class: 'sln-unit', text: 'Rest' }),
        restInput,
        el('span', { class: 'sln-unit', text: 'sec' }),
      ]),
    ]),
    el('div', { class: 'sln-control-block' }, [
      el('div', { class: 'sln-control-label', text: 'Exercises' }),
      el('div', { class: 'sln-control-row' }, [
        el('button', {
          class: 'btn sm primary', type: 'button',
          text: 'Save highlighted bars as Exercise',
          onClick: () => saveSelectionAsExercise(song),
        }),
      ]),
    ]),
  );
  playerCard.appendChild(controls);

  const strip = el('div', { class: 'sln-strip', id: 'sln-strip', 'aria-label': 'Measures — drag to highlight' });
  const applyDrag = (i) => {
    const a = state.dragAnchor == null ? i : state.dragAnchor;
    state.selStart = Math.min(a, i);
    state.selEnd = Math.max(a, i);
    startSel.value = String(state.selStart);
    endSel.value = String(state.selEnd);
    state.activeSectionId = 'selection';
    highlightActiveBar(state.selStart);
    const rangeLabel = $('sln-sel-label');
    if (rangeLabel) rangeLabel.textContent = `Highlighted bars ${state.selStart + 1}–${state.selEnd + 1}`;
  };
  measures.forEach((m, i) => {
    const selected = i >= Math.min(state.selStart, state.selEnd) && i <= Math.max(state.selStart, state.selEnd);
    const btn = el('button', {
      class: 'sln-bar' + (m.marker ? ' has-marker' : '') + (selected ? ' selected' : ''),
      type: 'button',
      text: m.marker ? `${i + 1}\n${m.marker}` : String(i + 1),
      title: `Bar ${i + 1} — drag to highlight a range`,
      'data-index': String(i),
    });
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      state.dragAnchor = i;
      applyDrag(i);
      btn.setPointerCapture?.(e.pointerId);
    });
    btn.addEventListener('pointerenter', (e) => {
      if (state.dragAnchor == null || !(e.buttons & 1)) return;
      applyDrag(i);
    });
    btn.addEventListener('pointerup', () => {
      if (state.dragAnchor == null) return;
      state.dragAnchor = null;
      reload('selection');
    });
    strip.appendChild(btn);
  });
  strip.addEventListener('pointerup', () => {
    if (state.dragAnchor == null) return;
    state.dragAnchor = null;
    reload('selection');
  });
  playerCard.appendChild(strip);
  playerCard.appendChild(el('div', { id: 'sln-follow-host', class: 'sln-follow-host' }));
  host.appendChild(playerCard);

  state.activeSectionId = 'selection';
  loadPlayerForSong(song, 'selection');
  syncTransportButtons();
  highlightActiveBar(state.selStart);
}

function renderDetail(root) {
  const song = getSong(state.detailId);
  if (!song) { state.view = 'library'; render(); return; }
  root.innerHTML = '';
  destroyFollow();
  destroyGpMount();
  stopPlayback();

  state.scoreBpm = Number(song.tempo) || 120;
  if (state._practiceSongId !== song.id) {
    state._practiceSongId = song.id;
    state.bpm = state.scoreBpm;
    state.activeSectionId = 'selection';
    state.selStart = 0;
    state.selEnd = 0;
    state.practice = {
      measureStart: 0,
      measureEnd: 0,
      loopRestSec: state.loopRestSec,
      preferredTrackIndex: 0,
      loopEnabled: true,
    };
  }
  const measures = songMeasures(song);
  if (measures.length) {
    if (state.selEnd === 0 && state.selStart === 0) state.selEnd = measures.length - 1;
    state.selStart = Math.max(0, Math.min(measures.length - 1, state.selStart));
    state.selEnd = Math.max(state.selStart, Math.min(measures.length - 1, state.selEnd));
    state.practice.measureStart = state.selStart;
    state.practice.measureEnd = state.selEnd;
  }

  root.appendChild(el('div', { class: 'sln-import-head' }, [
    el('button', {
      class: 'btn sm', type: 'button', text: '← Library',
      onClick: () => {
        stopPlayback();
        destroyFollow();
        destroyGpMount();
        state.view = 'library';
        state.detailId = null;
        render();
      },
    }),
    el('div', { class: 'sln-import-title', text: song.title }),
  ]));
  root.appendChild(el('div', {
    class: 'sln-song-meta',
    text: [
      song.fileName || 'Guitar Pro',
      `${Math.round(state.scoreBpm)} BPM`,
      measures.length ? `${measures.length} bars` : null,
    ].filter(Boolean).join(' · '),
  }));

  // Single Guitar Pro Player — select measures → save as Exercise
  const gpCard = el('div', { class: 'sln-player sln-gp-card' });
  gpCard.appendChild(el('div', {
    class: 'sln-player-banner',
    text: 'Drag across the bar strip (or set Loop bars) to select measures, then save them as an Exercise.',
  }));
  const saveRow = el('div', { class: 'sln-save-row' });
  const selLabel = el('div', {
    class: 'sln-sel-label', id: 'sln-sel-label',
    text: measures.length
      ? `Selected bars ${state.practice.measureStart + 1}–${state.practice.measureEnd + 1}`
      : 'Loading player…',
  });
  const saveBtn = el('button', {
    class: 'btn primary', type: 'button',
    text: 'Save selected bars as Exercise',
    onClick: () => saveSelectionAsExercise(song),
  });
  saveRow.append(selLabel, saveBtn);
  gpCard.appendChild(saveRow);
  const gpHost = el('div', { class: 'sln-gp-host', id: 'sln-gp-host' });
  gpHost.appendChild(el('div', { class: 'sln-empty', text: 'Loading practice player…' }));
  gpCard.appendChild(gpHost);
  root.appendChild(gpCard);

  state.activeSectionId = 'selection';
  void mountDetailGpPlayer(gpHost, song, selLabel);
}

async function mountDetailGpPlayer(host, song, selLabel) {
  if (!host) return;
  destroyGpMount();
  host.innerHTML = '';
  host.appendChild(el('div', { class: 'sln-empty', text: 'Loading practice player…' }));

  try {
    const blob = await getSongSourceBlob(song);
    let gp = null;
    if (blob) {
      const buf = await blob.arrayBuffer();
      gp = await parseGuitarPro(buf);
    } else if (song.fullGuitar || (song.fullGuitars || []).length) {
      const models = (song.fullGuitars || []).length
        ? song.fullGuitars
        : [song.fullGuitar];
      gp = {
        tempo: song.tempo,
        tracks: models.filter(Boolean).map((model, i) => {
          const m = ensureMeasures(JSON.parse(JSON.stringify(model)));
          return {
            index: i,
            name: i === 0 ? (song.guitarTrackName || 'Guitar') : `Track ${i + 1}`,
            tuning: m.tuning || 'Standard',
            noteCount: (m.events || []).filter((e) => e.midi != null).length,
            model: m,
          };
        }),
        drumTracks: [],
        warnings: [],
      };
    }

    if (!gp?.tracks?.length) {
      host.innerHTML = '';
      renderFallbackMeasurePlayer(host, song);
      return;
    }

    // Ensure every track has measures for the strip.
    gp.tracks.forEach((t) => { if (t.model) ensureMeasures(t.model); });

    host.innerHTML = '';
    const saveExtra = el('button', {
      class: 'btn sm primary', type: 'button',
      text: 'Save bars as Exercise',
      onClick: () => saveSelectionAsExercise(song),
    });
    state.gpMount = mountGpPlayer(host, {
      gpResult: gp,
      title: song.title,
      fileName: song.fileName || song.title,
      hideTitle: true,
      preferredTrackIndex: state.practice.preferredTrackIndex || 0,
      initialLoopEnabled: true,
      initialLoopStart: state.practice.measureStart,
      initialLoopEnd: state.practice.measureEnd,
      loopRestSec: state.practice.loopRestSec,
      headerExtra: saveExtra,
      onPracticeSettingsChange: (settings) => {
        state.practice = { ...state.practice, ...settings };
        state.selStart = settings.measureStart ?? state.selStart;
        state.selEnd = settings.measureEnd ?? state.selEnd;
        state.loopRestSec = settings.loopRestSec ?? state.loopRestSec;
        state.activeSectionId = 'selection';
        if (selLabel) {
          selLabel.textContent = `Selected bars ${(settings.measureStart ?? 0) + 1}–${(settings.measureEnd ?? 0) + 1}`;
        }
      },
    });
    if (selLabel) {
      selLabel.textContent = `Selected bars ${state.practice.measureStart + 1}–${state.practice.measureEnd + 1}`;
    }
  } catch (err) {
    host.innerHTML = '';
    host.appendChild(el('div', {
      class: 'sln-empty',
      text: err?.message || 'Could not open the practice player for this song.',
    }));
    renderFallbackMeasurePlayer(host, song);
  }
}

function render() {
  const root = $('sln-root');
  if (!root) return;
  if (state.view !== 'detail') {
    destroyGpMount();
  }
  if (state.view === 'import') renderImport(root);
  else if (state.view === 'detail') renderDetail(root);
  else {
    destroyFollow();
    renderLibrary(root);
  }
  syncDropVisibility();
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
  destroyFollow();
  destroyGpMount();
}

export async function importGpBytesToSongLearn(bytes, fileName = 'score.gp') {
  const file = new File([bytes], fileName, { type: 'application/octet-stream' });
  state.view = 'library';
  await loadGpFile(file);
}
