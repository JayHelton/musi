import { parseNote } from '../theory.js';
import { SCALES } from '../scales.js';
import { resolveTuningPitches, pitchesToMidi } from '../tunings.js';
import { ensureAudio, midiFreq, getAnalyserDestination, audioCtx } from '../audio.js';
import { createCompanionPanel } from './panel.js';
import { renderFretboardGrid, renderLegend, degreeLegendFromIntervals, DEGREE_LABELS } from './diagram.js';

function scaleSemiSet(root, scaleName) {
  const rootP = parseNote(root);
  const def = SCALES[scaleName];
  if (!rootP || !def) return null;
  return new Set(def.map(([, so]) => ((rootP.semi + so) % 12 + 12) % 12));
}

function tuningStrings(tuningName) {
  const pitches = resolveTuningPitches(tuningName);
  return pitches.map((p) => ({
    note: p.note,
    oct: p.oct,
    label: `${p.note}${p.oct}`,
  }));
}

let toneOscs = [];

function stopTones() {
  toneOscs.forEach(({ osc, gain }) => {
    try { osc.stop(); } catch (e) { /* noop */ }
    try { gain?.disconnect(); } catch (e) { /* noop */ }
  });
  toneOscs = [];
}

function playMidi(midi) {
  if (midi == null) return;
  try {
    ensureAudio();
    stopTones();
    const start = audioCtx.currentTime;
    const freq = midiFreq(midi);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain);
    gain.connect(getAnalyserDestination());
    osc.start(start);
    osc.stop(start + 0.4);
    toneOscs.push({ osc, gain });
    osc.onended = () => {
      toneOscs = toneOscs.filter((x) => x.osc !== osc);
    };
  } catch (e) { /* silent-safe */ }
}

function buildScaleHits(strings, openMidis, fretStart, fretEnd, scaleSemis, rootSemi) {
  const hits = new Map();
  const intervalsSeen = new Set();
  for (let s = 0; s < strings.length; s++) {
    for (let f = fretStart; f <= fretEnd; f++) {
      const pc = (openMidis[s] + f) % 12;
      if (!scaleSemis.has(pc)) continue;
      const interval = (pc - rootSemi + 12) % 12;
      intervalsSeen.add(interval);
      hits.set(`${s}:${f}`, {
        label: DEGREE_LABELS[interval] || String(interval),
        isRoot: interval === 0,
        interval,
        midi: openMidis[s] + f,
      });
    }
  }
  return { hits, intervalsSeen };
}

export function mountScaleRef(host, companion, options = {}) {
  const shell = createCompanionPanel(host, companion, options);
  const rootP = parseNote(companion.root);
  const scaleSemis = scaleSemiSet(companion.root, companion.scale);
  const strings = tuningStrings(companion.tuning);
  const openMidis = pitchesToMidi(resolveTuningPitches(companion.tuning));
  const fretStart = companion.fretStart ?? 0;
  const fretEnd = companion.fretEnd ?? 12;

  const lock = document.createElement('p');
  lock.className = 'ec-sub';
  lock.textContent = `Locked: ${companion.root} · ${companion.scale} · ${companion.tuning} · frets ${fretStart}–${fretEnd}`;

  const diagramHost = document.createElement('div');
  diagramHost.className = 'ec-diagram-host';

  function render() {
    diagramHost.innerHTML = '';
    if (!rootP || !scaleSemis) {
      diagramHost.innerHTML = '<p class="ec-empty">Invalid root or scale.</p>';
      return;
    }
    const { hits, intervalsSeen } = buildScaleHits(
      strings, openMidis, fretStart, fretEnd, scaleSemis, rootP.semi,
    );
    const board = renderFretboardGrid({
      strings,
      fretStart,
      fretEnd,
      hits,
      onCellClick: (hit) => playMidi(hit.midi),
    });
    diagramHost.appendChild(board);
    diagramHost.appendChild(renderLegend(degreeLegendFromIntervals(intervalsSeen)));
  }

  shell.body.append(lock, diagramHost);
  render();

  return {
    refresh() { render(); },
    stop() { stopTones(); },
    destroy() {
      stopTones();
      shell.destroy();
    },
  };
}
