// Backing track drawer for the Score Player.
//
// The panel owns the media source, the saved settings, and the clock follower.
// The player passes its clock in and receives one callback when the backing
// track takes over from the synth.

import { el, uid, fmtTime } from './dom.js';
import { createBackingSync } from './backingSync.js';
import { createFileSource, createYouTubeSource } from './backingSources.js';
import { audioCtx, ensureAudio } from '../audio.js';
import { getAudioBlob, saveAudio, deleteAudio } from '../attachments.js';
import {
  MAX_ANCHOR_SEC,
  MAX_TRIM_MS,
  getBackingTrack,
  normalizeConfig,
  parseYouTubeUrl,
  removeBackingTrack,
  saveBackingTrack,
  usedAttachmentIds,
} from '../gpBackingTrack.js';

const STATUS_TEXT = {
  off: 'Backing track is off.',
  loading: 'Loading the track…',
  idle: 'Ready. Press play.',
  waiting: 'Waiting for the start of the recording.',
  seeking: 'Lining the track up…',
  correcting: 'Correcting a small drift…',
  sync: 'In time with the score.',
  ended: 'The recording has finished.',
  error: 'The track could not play.',
  'unsupported-rate': 'YouTube cannot play at this speed. The synth is back on.',
};

function fmtSigned(ms) {
  const n = Math.round(Number(ms) || 0);
  return `${n > 0 ? '+' : ''}${n} ms`;
}

function fmtAnchor(sec) {
  const n = Number(sec) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const ms = Math.round((abs % 1) * 1000);
  return `${sign}${fmtTime(abs)}.${String(ms).padStart(3, '0')}`;
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Suggest a first trim from the output latency the browser reports.
 * A device that plays late needs the recording to start late by the same
 * amount, so the value is positive.
 */
export function suggestedTrimMs(ctx) {
  const latency = Number(ctx?.outputLatency);
  if (!Number.isFinite(latency) || latency <= 0) return 0;
  return Math.round(Math.min(latency, MAX_TRIM_MS / 1000) * 1000);
}

/**
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {() => string} opts.getScoreKey
 * @param {() => {songSec:number, rate:number, playing:boolean, holding:boolean}} opts.getClock
 * @param {(active:boolean) => void} opts.onActiveChange called when the synth
 *   must go quiet or come back
 * @param {() => void} [opts.onChange] repaint hook for the transport chip
 */
export function mountBackingPanel(host, {
  getScoreKey,
  getClock,
  onActiveChange,
  onChange = null,
} = {}) {
  const noop = {
    sync() {},
    destroy() {},
    hasSource: () => false,
    isActive: () => false,
    setActive() {},
    toggleActive() {},
    statusText: () => '',
    sourceLabel: () => '',
  };
  if (!host || typeof getClock !== 'function') return noop;

  const prefix = uid('gpp-backing');
  let config = getBackingTrack(getScoreKey?.() || '');
  let adapter = null;
  let destroyed = false;
  let statusKey = 'off';
  let statusDetail = '';
  let notice = '';

  const follower = createBackingSync({
    getAdapter: () => adapter,
    getConfig: () => ({
      enabled: !!config?.enabled && !!adapter,
      anchorSec: config?.anchorSec || 0,
      trimMs: config?.trimMs || 0,
    }),
    getClock,
    onStatus: ({ status, detail }) => {
      statusKey = status;
      statusDetail = detail || '';
      syncSynthMute();
      paintStatus();
    },
  });

  let synthMuted = false;

  /**
   * The synth stays quiet while a backing track can carry the notes.
   *
   * YouTube refuses some practice speeds, and a broken source plays nothing.
   * Both cases give the notes straight back, so the learner never practises
   * against silence.
   */
  function syncSynthMute() {
    const blocked = statusKey === 'unsupported-rate' || statusKey === 'error';
    applyActiveToPlayer(!!config?.enabled && !!adapter && !blocked);
  }

  function applyActiveToPlayer(mute) {
    if (synthMuted === mute) return;
    synthMuted = mute;
    if (typeof onActiveChange === 'function') onActiveChange(mute);
  }

  // --- DOM ------------------------------------------------------------------

  const fileInput = el('input', {
    type: 'file',
    accept: 'audio/*',
    class: 'gpp-backing-file',
    id: `${prefix}-file`,
    hidden: true,
  });

  const chooseBtn = el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'Choose audio file',
    title: 'Pick an mp3, m4a, wav, or ogg file from this device',
  });
  chooseBtn.addEventListener('click', () => fileInput.click());

  const urlInput = el('input', {
    type: 'url',
    class: 'gpp-backing-url',
    placeholder: 'Paste a YouTube link',
    'aria-label': 'YouTube link',
  });
  const urlBtn = el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'Use link',
    title: 'Attach this YouTube video to the score',
  });

  const sourceName = el('div', { class: 'gpp-backing-source-name', text: 'No track yet.' });
  const removeBtn = el('button', {
    class: 'btn sm gpp-backing-remove',
    type: 'button',
    text: 'Remove',
    title: 'Detach the backing track from this score',
  });

  const activeToggle = el('input', {
    type: 'checkbox',
    id: `${prefix}-active`,
    class: 'gpp-backing-active',
  });
  const activeRow = el('label', { class: 'gpp-backing-toggle', for: `${prefix}-active` }, [
    activeToggle,
    el('span', { text: 'Play the real song instead of the synth' }),
  ]);

  const ytHost = el('div', { class: 'gpp-backing-yt', hidden: true });

  const volInput = el('input', {
    type: 'range',
    min: '0',
    max: '100',
    step: '1',
    value: '90',
    class: 'gpp-backing-volume',
    'aria-label': 'Backing track volume',
  });

  const anchorInput = el('input', {
    type: 'number',
    step: '0.01',
    min: String(-MAX_ANCHOR_SEC),
    max: String(MAX_ANCHOR_SEC),
    value: '0',
    class: 'gpp-backing-anchor',
    'aria-label': 'Seconds into the recording where bar 1 starts',
  });
  const anchorReadout = el('span', { class: 'gpp-backing-readout', text: '0:00.000' });
  const anchorSetBtn = el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'Set from here',
    title: 'Capture the offset from the point that plays now',
  });
  const anchorResetBtn = el('button', {
    class: 'btn sm',
    type: 'button',
    text: 'Reset',
    title: 'Set the offset back to zero',
  });

  const trimInput = el('input', {
    type: 'range',
    min: String(-MAX_TRIM_MS),
    max: String(MAX_TRIM_MS),
    step: '5',
    value: '0',
    class: 'gpp-backing-trim',
    'aria-label': 'Fine trim in milliseconds',
  });
  const trimReadout = el('span', { class: 'gpp-backing-readout', text: '0 ms' });
  const trimDownBtn = el('button', { class: 'btn sm', type: 'button', text: '−10' });
  const trimUpBtn = el('button', { class: 'btn sm', type: 'button', text: '+10' });
  const trimResetBtn = el('button', { class: 'btn sm', type: 'button', text: 'Reset' });

  const statusLine = el('div', { class: 'gpp-backing-status', role: 'status', text: '' });
  const noticeLine = el('div', { class: 'gpp-backing-notice', text: '', hidden: true });

  function group(title, children) {
    return el('div', { class: 'gpp-backing-group' }, [
      el('div', { class: 'gpp-backing-group-title', text: title }),
      ...children,
    ]);
  }

  host.innerHTML = '';
  host.append(
    el('div', { class: 'gpp-backing-body' }, [
      group('Source', [
        el('div', { class: 'gpp-backing-row' }, [chooseBtn, fileInput]),
        el('div', { class: 'gpp-backing-row' }, [urlInput, urlBtn]),
        el('div', { class: 'gpp-backing-row' }, [sourceName, removeBtn]),
        ytHost,
      ]),
      group('Playback', [
        activeRow,
        el('div', { class: 'gpp-backing-row' }, [
          el('span', { class: 'gpp-backing-label', text: 'Volume' }),
          volInput,
        ]),
      ]),
      group('Delay', [
        el('div', { class: 'gpp-backing-row' }, [
          el('span', { class: 'gpp-backing-label', text: 'Song start' }),
          anchorInput,
          anchorReadout,
        ]),
        el('div', { class: 'gpp-backing-row' }, [anchorSetBtn, anchorResetBtn]),
        el('div', { class: 'gpp-backing-hint', text: 'Seconds into the recording where bar 1 begins.' }),
        el('div', { class: 'gpp-backing-row' }, [
          el('span', { class: 'gpp-backing-label', text: 'Fine trim' }),
          trimInput,
          trimReadout,
        ]),
        el('div', { class: 'gpp-backing-row' }, [trimDownBtn, trimUpBtn, trimResetBtn]),
        el('div', { class: 'gpp-backing-hint', text: 'Shifts the recording against the click, for output delay.' }),
      ]),
      statusLine,
      noticeLine,
    ]),
  );

  // --- config ---------------------------------------------------------------

  function persist(patch) {
    const merged = { ...(config || {}), ...patch };
    const key = getScoreKey?.() || '';
    if (!key) {
      // A score with no stable key cannot save. Keep the values in memory.
      config = normalizeConfig(merged);
      return;
    }
    const saved = saveBackingTrack(key, merged);
    config = saved || normalizeConfig(merged);
  }

  function setNotice(text) {
    notice = text || '';
    noticeLine.textContent = notice;
    noticeLine.hidden = !notice;
  }

  // --- source lifecycle -----------------------------------------------------

  function teardownAdapter() {
    follower.stop();
    follower.reset();
    if (adapter) {
      try { adapter.destroy(); } catch (e) { /* ignore */ }
      adapter = null;
    }
    applyActiveToPlayer(false);
    ytHost.hidden = true;
  }

  async function buildAdapter() {
    if (!config?.kind) return false;
    ensureAudio();
    if (config.kind === 'file') {
      const blob = await getAudioBlob(config.attachmentId);
      if (destroyed) return false;
      if (!blob) {
        setNotice('The saved audio file is gone. Attach it again.');
        return false;
      }
      adapter = createFileSource({ blob, volume: config.volume });
      if (!adapter.pitchHeld) {
        setNotice('This browser changes the pitch when it changes the speed.');
      }
      return true;
    }
    if (config.kind === 'youtube') {
      ytHost.hidden = false;
      adapter = createYouTubeSource({
        videoId: config.videoId,
        host: ytHost,
        volume: config.volume,
      });
      return true;
    }
    return false;
  }

  /**
   * Report a failure in the drawer instead of losing it to the console.
   * Every caller of an async action passes through here.
   */
  function guard(promise, message) {
    return Promise.resolve(promise).catch((err) => {
      console.error(err);
      if (!destroyed) {
        setNotice(message);
        paint();
      }
    });
  }

  async function setActive(on) {
    const want = !!on;
    if (want && !config?.kind) return;
    persist({ enabled: want });
    if (!want) {
      teardownAdapter();
      paint();
      onChange?.();
      return;
    }
    setNotice('');
    if (!adapter) {
      const built = await buildAdapter();
      if (destroyed) return;
      if (!built) {
        persist({ enabled: false });
        paint();
        onChange?.();
        return;
      }
    }
    adapter.setVolume(config.volume);
    follower.start();
    syncSynthMute();
    paint();
    onChange?.();
  }

  function toggleActive() {
    return guard(setActive(!config?.enabled), 'The backing track could not start.');
  }

  /**
   * Point the score at a new source.
   *
   * The old blob can only go after the new record is stored. `usedAttachmentIds`
   * reads that store, so a delete before the write would still see the old id
   * in use and would leave the file behind.
   */
  async function replaceSource(patch) {
    const priorId = config?.kind === 'file' ? config.attachmentId : '';
    teardownAdapter();
    persist({ ...patch, enabled: false });
    if (priorId && priorId !== patch.attachmentId && !usedAttachmentIds().includes(priorId)) {
      await deleteAudio(priorId);
    }
    if (destroyed) return;
    setNotice('');
    paint();
    onChange?.();
  }

  async function attachFile(file) {
    if (!file) return;
    const meta = await saveAudio({
      blob: file,
      name: file.name,
      fileName: file.name,
      type: file.type,
      size: file.size,
      source: 'backing',
    });
    if (destroyed) return;
    if (!meta) {
      setNotice('This browser could not store the audio file.');
      return;
    }
    await replaceSource({
      kind: 'file',
      attachmentId: meta.id,
      videoId: '',
      name: file.name,
      sizeBytes: file.size,
      // A new recording needs a new alignment.
      anchorSec: 0,
    });
  }

  function attachYouTube(raw) {
    const parsed = parseYouTubeUrl(raw);
    if (!parsed) {
      setNotice('That is not a YouTube link.');
      return;
    }
    urlInput.value = '';
    guard(replaceSource({
      kind: 'youtube',
      videoId: parsed.videoId,
      attachmentId: '',
      name: `YouTube ${parsed.videoId}`,
      sizeBytes: 0,
      // A link with a start time already names the offset for bar 1.
      anchorSec: parsed.startSec || 0,
    }), 'The YouTube video could not be attached.');
  }

  /** Detach the current source. Deletes the blob when nothing else uses it. */
  async function clearSource() {
    teardownAdapter();
    const priorId = config?.kind === 'file' ? config.attachmentId : '';
    removeBackingTrack(getScoreKey?.() || '');
    config = null;
    if (priorId && !usedAttachmentIds().includes(priorId)) {
      await deleteAudio(priorId);
    }
  }

  // --- events ---------------------------------------------------------------

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) guard(attachFile(file), 'The audio file could not be attached.');
  });

  urlBtn.addEventListener('click', () => attachYouTube(urlInput.value));
  urlInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      attachYouTube(urlInput.value);
    }
  });

  removeBtn.addEventListener('click', () => {
    guard(clearSource().then(() => {
      if (destroyed) return;
      setNotice('');
      paint();
      onChange?.();
    }), 'The backing track could not be removed.');
  });

  activeToggle.addEventListener('change', () => {
    guard(setActive(activeToggle.checked), 'The backing track could not start.');
  });

  volInput.addEventListener('input', () => {
    const v = Math.max(0, Math.min(1, Number(volInput.value) / 100));
    persist({ volume: v });
    adapter?.setVolume(v);
  });

  function setAnchor(sec) {
    persist({ anchorSec: sec });
    follower.resync();
    paintDelay();
  }

  anchorInput.addEventListener('change', () => setAnchor(Number(anchorInput.value) || 0));
  anchorResetBtn.addEventListener('click', () => setAnchor(0));
  anchorSetBtn.addEventListener('click', () => {
    if (!adapter?.ready) {
      setNotice('Start the track first, then press Set from here.');
      return;
    }
    const clock = getClock() || {};
    const rate = Number(clock.rate) > 0 ? Number(clock.rate) : 1;
    const scoreSec = Math.max(0, Number(clock.songSec) || 0) * rate;
    const mediaSec = Number(adapter.getTime());
    if (!Number.isFinite(mediaSec)) return;
    setAnchor(mediaSec - scoreSec - (config?.trimMs || 0) / 1000);
    setNotice('');
  });

  function setTrim(ms) {
    const clamped = Math.max(-MAX_TRIM_MS, Math.min(MAX_TRIM_MS, Math.round(ms)));
    persist({ trimMs: clamped });
    follower.resync();
    paintDelay();
  }

  trimInput.addEventListener('input', () => setTrim(Number(trimInput.value) || 0));
  trimDownBtn.addEventListener('click', () => setTrim((config?.trimMs || 0) - 10));
  trimUpBtn.addEventListener('click', () => setTrim((config?.trimMs || 0) + 10));
  trimResetBtn.addEventListener('click', () => setTrim(0));

  // --- painting -------------------------------------------------------------

  function paintStatus() {
    const base = STATUS_TEXT[statusKey] || '';
    const drift = statusKey === 'sync' || statusKey === 'correcting'
      ? ` ${fmtSigned(follower.errorSec * 1000)}`
      : '';
    statusLine.textContent = statusDetail ? `${base} (${statusDetail})` : `${base}${drift}`;
  }

  function paintDelay() {
    const anchor = config?.anchorSec || 0;
    const trim = config?.trimMs || 0;
    if (document.activeElement !== anchorInput) anchorInput.value = String(anchor.toFixed(2));
    anchorReadout.textContent = fmtAnchor(anchor);
    trimInput.value = String(trim);
    trimReadout.textContent = fmtSigned(trim);
  }

  function paint() {
    const has = !!config?.kind;
    const size = fmtSize(config?.sizeBytes);
    sourceName.textContent = has
      ? `${config.name || 'Backing track'}${size ? ` · ${size}` : ''}`
      : 'No track yet.';
    removeBtn.disabled = !has;
    activeToggle.disabled = !has;
    activeToggle.checked = !!config?.enabled;
    volInput.value = String(Math.round((config?.volume ?? 0.9) * 100));
    volInput.disabled = !has;
    [anchorInput, anchorSetBtn, anchorResetBtn, trimInput, trimDownBtn, trimUpBtn, trimResetBtn]
      .forEach((node) => { node.disabled = !has; });
    ytHost.hidden = !(has && config.kind === 'youtube' && config.enabled);
    paintDelay();
    paintStatus();
  }

  // A device that plays late needs a trim. Name the amount, but never write
  // the value, so a setting the user chose is safe.
  if (config?.kind && config.trimMs === 0) {
    const suggestion = suggestedTrimMs(audioCtx);
    if (suggestion > 0) {
      setNotice(`This device plays about ${suggestion} ms late. Try that as the fine trim.`);
    }
  }

  paint();

  return {
    sync: paint,
    hasSource: () => !!config?.kind,
    isActive: () => !!config?.enabled,
    setActive,
    toggleActive,
    statusText: () => statusLine.textContent,
    sourceLabel: () => config?.name || '',
    getStatusKey: () => statusKey,
    /** How far the recording sits from the score, in seconds. */
    getDriftSec: () => follower.errorSec,
    destroy() {
      destroyed = true;
      follower.destroy();
      if (adapter) {
        try { adapter.destroy(); } catch (e) { /* ignore */ }
        adapter = null;
      }
      applyActiveToPlayer(false);
      host.innerHTML = '';
    },
  };
}
