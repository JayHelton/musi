// Pure timeline layer: tempo map, seconds, and schedulable events.

import { clampVelocity, quartersToSeconds } from './tabModel.js';

const MIN_BPM = 40;
const MAX_BPM = 320;
const MIN_DUR_SEC = 0.05;
// A sounding note rarely holds longer than this, so the event search can stop.
const MAX_EVENT_LOOKBACK_SEC = 30;

function clampBpm(value, fallback = 120) {
  const n = Number(value);
  if (!Number.isFinite(n)) return clampBpm(fallback, 120);
  return Math.max(MIN_BPM, Math.min(MAX_BPM, n));
}

function normalizeRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function barLength(measure) {
  const start = Number.isFinite(measure.startBeat) ? measure.startBeat : 0;
  const end = Number.isFinite(measure.endBeat) ? measure.endBeat : start + 1;
  return Math.max(0, end - start);
}

function findPass(passes, barIndex, passIndex) {
  return passes.find((p) => p.barIndex === barIndex && p.passIndex === passIndex);
}

function firstPassForBar(passes, barIndex) {
  return passes.find((p) => p.barIndex === barIndex && p.passIndex === 0)
    || passes.find((p) => p.barIndex === barIndex);
}

/**
 * Build an absolute-time timeline from play order and track models.
 * @param {{ playOrder: object, tempoMap: object[], baseBpm: number, rate: number,
 *           tracks: { guitarModels: object[], drumModels: object[] } }} params
 */
export function buildTimeline({ playOrder, tempoMap, baseBpm, rate, tracks }) {
  const warnings = [...(playOrder.warnings || [])];
  const normalizedRate = normalizeRate(rate);
  const passes = (playOrder.passes || []).map((p) => ({ ...p }));
  const guitarModels = tracks?.guitarModels || [];
  const drumModels = tracks?.drumModels || [];
  const measureCount = inferMeasureCount(playOrder, guitarModels, drumModels);
  const measures = buildMeasureList(measureCount, guitarModels[0], drumModels[0]);

  if (passes.length === 0 || measureCount === 0) {
    return makeTimeline({
      passes: [],
      events: [],
      tempoSegments: [],
      totalSec: 0,
      rate: normalizedRate,
      warnings,
      measures,
    });
  }

  const map = Array.isArray(tempoMap) ? tempoMap : [];
  const { segments, totalSec } = buildTempoSegments(
    passes,
    map,
    baseBpm,
    measureCount,
    measures,
    warnings,
  );

  attachPassSeconds(passes, segments);

  const events = [];
  for (let ti = 0; ti < guitarModels.length; ti++) {
  events.push(...collectTrackEvents(guitarModels[ti], 'guitar', ti, passes, measures, segments));
  }
  for (let ti = 0; ti < drumModels.length; ti++) {
    events.push(...collectTrackEvents(drumModels[ti], 'drum', ti, passes, measures, segments));
  }
  events.sort((a, b) => a.startSec - b.startSec || a.trackIndex - b.trackIndex);

  return makeTimeline({
    passes,
    events,
    tempoSegments: segments,
    totalSec,
    rate: normalizedRate,
    warnings,
    measures,
  });
}

function inferMeasureCount(playOrder, guitarModels, drumModels) {
  let maxBar = -1;
  for (const p of playOrder.passes || []) {
    if (p.barIndex > maxBar) maxBar = p.barIndex;
  }
  for (const model of [...guitarModels, ...drumModels]) {
    const n = (model?.measures || []).length;
    if (n > 0) maxBar = Math.max(maxBar, n - 1);
  }
  return maxBar + 1;
}

function buildMeasureList(count, guitarModel, drumModel) {
  const src = guitarModel?.measures || drumModel?.measures || [];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (src[i]) {
      out.push(src[i]);
    } else {
      const start = i > 0 && out[i - 1] ? out[i - 1].endBeat : i * 4;
      out.push({ startBeat: start, endBeat: start + 4 });
    }
  }
  return out;
}

function buildTempoSegments(passes, tempoMap, baseBpm, measureCount, measures, warnings) {
  const totalQuarters = passes[passes.length - 1].endQuarter;
  const points = [];

  // Report an out-of-range tempo entry one time, not one time for each pass.
  for (const entry of tempoMap) {
    const barIndex = Number(entry.barIndex);
    if (!Number.isFinite(barIndex) || barIndex < 0 || barIndex >= measureCount) {
      warnings.push(`The player skipped the tempo map entry at bar ${entry.barIndex}. That bar is past the score end.`);
    }
  }

  for (const pass of passes) {
    for (const entry of tempoMap) {
      const barIndex = Number(entry.barIndex);
      if (!Number.isFinite(barIndex) || barIndex < 0 || barIndex >= measureCount) continue;
      if (pass.barIndex !== barIndex) continue;
      const beatOff = Number.isFinite(entry.beat) ? entry.beat : 0;
      const quarter = pass.startQuarter + beatOff;
      if (quarter < pass.startQuarter || quarter > pass.endQuarter) continue;
      points.push({
        startQuarter: quarter,
        bpm: clampBpm(entry.bpm, baseBpm),
      });
    }
  }

  let startBpm = clampBpm(baseBpm);
  for (const entry of tempoMap) {
    if (Number(entry.barIndex) === 0 && (Number(entry.beat) || 0) === 0) {
      startBpm = clampBpm(entry.bpm, baseBpm);
    }
  }

  const changes = [{ startQuarter: 0, bpm: startBpm }];
  points.sort((a, b) => a.startQuarter - b.startQuarter);
  for (const p of points) {
    if (p.startQuarter === 0) {
      changes[0].bpm = p.bpm;
    } else {
      changes.push(p);
    }
  }

  const merged = [];
  for (const c of changes) {
    if (merged.length && merged[merged.length - 1].startQuarter === c.startQuarter) {
      merged[merged.length - 1].bpm = c.bpm;
    } else {
      merged.push({ ...c });
    }
  }

  const segments = [];
  let startSec = 0;
  for (let i = 0; i < merged.length; i++) {
    const startQuarter = merged[i].startQuarter;
    const endQuarter = i + 1 < merged.length ? merged[i + 1].startQuarter : totalQuarters;
    const bpm = merged[i].bpm;
    const secPerQuarter = 60 / bpm;
    segments.push({
      startSec,
      startQuarter,
      bpm,
      secPerQuarter,
    });
    startSec += (endQuarter - startQuarter) * secPerQuarter;
  }

  if (segments.length === 0) {
    const bpm = startBpm;
    segments.push({
      startSec: 0,
      startQuarter: 0,
      bpm,
      secPerQuarter: 60 / bpm,
    });
    startSec = totalQuarters * (60 / bpm);
  }

  return { segments, totalSec: startSec };
}

function attachPassSeconds(passes, segments) {
  for (const pass of passes) {
    pass.startSec = quarterToSec(pass.startQuarter, segments);
    pass.endSec = quarterToSec(pass.endQuarter, segments);
  }
}

function quarterToSec(quarter, segments) {
  const q = Number(quarter) || 0;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (q >= segments[i].startQuarter) {
      const seg = segments[i];
      return seg.startSec + (q - seg.startQuarter) * seg.secPerQuarter;
    }
  }
  return 0;
}

function secToQuarter(sec, segments) {
  const s = Number(sec) || 0;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (s >= seg.startSec) {
      return seg.startQuarter + (s - seg.startSec) / seg.secPerQuarter;
    }
  }
  return 0;
}

function collectTrackEvents(model, kind, trackIndex, passes, measures, segments) {
  if (!model) return [];
  const beats = model.beats;
  if (beats && beats.length > 0) {
    return collectBeatEvents(model, kind, trackIndex, passes, measures, segments);
  }
  return collectLegacyEvents(model, kind, trackIndex, passes, measures, segments);
}

function collectBeatEvents(model, kind, trackIndex, passes, measures, segments) {
  const events = [];
  const tabEvents = model.events || [];
  const beats = model.beats || [];
  const byBar = groupBeatsByBar(beats);
  const tieDurations = buildTieDurations(beats, tabEvents);
  const gracesByBeat = groupGraceEvents(tabEvents);

  for (const pass of passes) {
    const barIndex = pass.barIndex;
    const measure = measures[barIndex];
    if (!measure) continue;
    const barStart = Number.isFinite(measure.startBeat) ? measure.startBeat : 0;
    const barBeats = byBar.get(barIndex) || [];

    for (const { beat, index: globalBeatIdx } of barBeats) {
      if (beat.rest) continue;

      const beatOffInBar = beat.start - barStart;
      const passQuarter = pass.startQuarter + beatOffInBar;

      for (const ev of gracesByBeat.get(globalBeatIdx) || []) {
        const graceDurQ = Number.isFinite(ev.duration) && ev.duration > 0 ? ev.duration : 0.25;
        const graceStartQ = passQuarter - graceDurQ;
        events.push(makeTimedEvent({
          tabEvent: ev,
          kind,
          trackIndex,
          pass,
          barIndex,
          beatInBar: Math.max(0, beatOffInBar - graceDurQ),
          startSec: quarterToSec(graceStartQ, segments),
          durSec: Math.max(
            MIN_DUR_SEC,
            quarterToSec(passQuarter, segments) - quarterToSec(graceStartQ, segments),
          ),
          voiceIndex: beat.voiceIndex ?? ev.voiceIndex ?? 0,
          techniques: beat.techniques || ev.techniques || [],
        }));
      }

      for (const idx of beat.noteIndices || []) {
        const ev = tabEvents[idx];
        if (!ev || ev.midi == null || ev.dead || ev.grace) continue;
        // A tied tail sounds inside the event that starts the tie chain.
        if (ev.tie) continue;
        const durQ = tieDurations.get(idx) ?? beat.duration;
        events.push(makeTimedEvent({
          tabEvent: ev,
          kind,
          trackIndex,
          pass,
          barIndex,
          beatInBar: beatOffInBar,
          startSec: quarterToSec(passQuarter, segments),
          durSec: Math.max(
            MIN_DUR_SEC,
            quarterToSec(passQuarter + durQ, segments) - quarterToSec(passQuarter, segments),
          ),
          voiceIndex: beat.voiceIndex ?? ev.voiceIndex ?? 0,
          techniques: beat.techniques || ev.techniques || [],
        }));
      }
    }
  }

  return events;
}

/** Group beats by written bar and keep the index of each beat. */
function groupBeatsByBar(beats) {
  const byBar = new Map();
  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    const list = byBar.get(beat.measureIndex);
    if (list) list.push({ beat, index });
    else byBar.set(beat.measureIndex, [{ beat, index }]);
  }
  for (const list of byBar.values()) list.sort((a, b) => a.beat.start - b.beat.start);
  return byBar;
}

/** Group grace events by the beat that they lead into. */
function groupGraceEvents(tabEvents) {
  const byBeat = new Map();
  for (const ev of tabEvents) {
    if (!ev.grace || ev.midi == null || ev.dead) continue;
    const key = ev.beatIndex;
    if (key == null) continue;
    const list = byBeat.get(key);
    if (list) list.push(ev);
    else byBeat.set(key, [ev]);
  }
  return byBeat;
}

/**
 * Compute the sounding length of every note that starts a tie chain.
 * A tie chain can cross a bar line, so this walks the written beat list of
 * each voice in order. The result maps an event index to quarter-note length.
 */
function buildTieDurations(beats, tabEvents) {
  const durations = new Map();
  const byVoice = new Map();
  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    const voice = beat.voiceIndex ?? 0;
    const list = byVoice.get(voice);
    if (list) list.push({ beat, index });
    else byVoice.set(voice, [{ beat, index }]);
  }

  for (const list of byVoice.values()) {
    list.sort((a, b) => a.beat.start - b.beat.start);
    for (let i = 0; i < list.length; i += 1) {
      for (const evIndex of list[i].beat.noteIndices || []) {
        const ev = tabEvents[evIndex];
        if (!ev || ev.tie || ev.midi == null || ev.dead || ev.grace) continue;
        let total = list[i].beat.duration;
        for (let j = i + 1; j < list.length; j += 1) {
          const tail = (list[j].beat.noteIndices || []).some((k) => {
            const other = tabEvents[k];
            return other && other.tie && other.stringIndex === ev.stringIndex;
          });
          if (!tail) break;
          total += list[j].beat.duration;
        }
        durations.set(evIndex, total);
      }
    }
  }

  return durations;
}

function collectLegacyEvents(model, kind, trackIndex, passes, measures, segments) {
  const events = [];
  const tabEvents = (model.events || []).filter((e) => e.midi != null && !e.dead);

  for (const pass of passes) {
    const barIndex = pass.barIndex;
    const measure = measures[barIndex];
    if (!measure) continue;
    const barStart = Number.isFinite(measure.startBeat) ? measure.startBeat : 0;
    const barEnd = Number.isFinite(measure.endBeat) ? measure.endBeat : barStart + barLength(measure);

    for (const ev of tabEvents) {
      const start = Number.isFinite(ev.start) ? ev.start : 0;
      if (start < barStart || start >= barEnd) continue;
      const beatOff = start - barStart;
      const passQuarter = pass.startQuarter + beatOff;
      const durQ = Number.isFinite(ev.duration) && ev.duration > 0 ? ev.duration : 1;
      events.push(makeTimedEvent({
        model,
        tabEvent: ev,
        kind,
        trackIndex,
        pass,
        barIndex,
        beatInBar: beatOff,
        startSec: quarterToSec(passQuarter, segments),
        durSec: Math.max(MIN_DUR_SEC, quarterToSec(passQuarter + durQ, segments) - quarterToSec(passQuarter, segments)),
        voiceIndex: ev.voiceIndex ?? 0,
        techniques: ev.techniques || [],
      }));
    }
  }

  return events;
}

function makeTimedEvent({
  tabEvent,
  kind,
  trackIndex,
  pass,
  barIndex,
  beatInBar,
  startSec,
  durSec,
  voiceIndex,
  techniques,
}) {
  return {
    kind,
    trackIndex,
    startSec,
    durSec,
    midi: tabEvent.midi,
    velocity: clampVelocity(tabEvent.velocity),
    techniques: techniques || [],
    bend: tabEvent.bend ?? null,
    slideKind: tabEvent.slideKind ?? null,
    barIndex,
    passIndex: pass.passIndex,
    beatInBar,
    voiceIndex,
  };
}

function makeTimeline({ passes, events, tempoSegments, totalSec, rate, warnings, measures }) {
  const timeline = {
    passes,
    events,
    tempoSegments,
    totalSec,
    rate,
    warnings,
    positionAtSeconds(sec) {
      return positionAtSecondsImpl(sec, rate, passes, measures, events, tempoSegments);
    },
    secondsAtPosition(pos) {
      return secondsAtPositionImpl(pos, rate, passes, measures, tempoSegments);
    },
    withRate(newRate) {
      const r = normalizeRate(newRate);
      return makeTimeline({
        passes,
        events,
        tempoSegments,
        totalSec: totalSec / r,
        rate: r,
        warnings,
        measures,
      });
    },
    loopWindow({ startBarIndex, endBarIndex }) {
      return loopWindowImpl(startBarIndex, endBarIndex, passes, rate);
    },
  };
  return timeline;
}

const EMPTY_POSITION = Object.freeze({
  sec: 0,
  quarter: 0,
  passIndex: 0,
  barIndex: 0,
  beatInBar: 0,
  beatInScore: 0,
  eventIndex: null,
});

function positionAtSecondsImpl(sec, rate, passes, measures, events, segments) {
  if (passes.length === 0) return { ...EMPTY_POSITION, sec: Number(sec) || 0 };
  // The engine can ask for a time just before the score start while it waits
  // for the first scheduled note. Clamp so the lookup stays inside the score.
  const internalSec = Math.max(0, (Number(sec) || 0) * rate);
  const quarter = secToQuarter(internalSec, segments);
  const pass = findPassAtQuarter(quarter, passes);
  const beatInBar = quarter - pass.startQuarter;
  const measure = measures[pass.barIndex];
  const beatInScore = (Number.isFinite(measure?.startBeat) ? measure.startBeat : 0) + beatInBar;

  const eventIndex = findEventIndex(events, internalSec, pass);

  return {
    sec: Number(sec) || 0,
    quarter,
    passIndex: pass.passIndex,
    barIndex: pass.barIndex,
    beatInBar,
    beatInScore,
    eventIndex,
  };
}

function secondsAtPositionImpl(pos, rate, passes, measures, segments) {
  const barIndex = Number(pos.barIndex) || 0;
  const passIndex = Number(pos.passIndex) || 0;
  const beatInBar = Number(pos.beatInBar) || 0;
  const pass = findPass(passes, barIndex, passIndex) || firstPassForBar(passes, barIndex);
  if (!pass) return 0;
  const quarter = pass.startQuarter + beatInBar;
  const internalSec = quarterToSec(quarter, segments);
  return internalSec / rate;
}

/**
 * Find the event that sounds at one instant. The playhead calls this on every
 * animation frame, so it uses a binary search over the sorted event list.
 */
function findEventIndex(events, internalSec, pass) {
  if (events.length === 0) return null;
  let low = 0;
  let high = events.length - 1;
  let first = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (events[mid].startSec > internalSec) {
      high = mid - 1;
    } else {
      first = mid;
      low = mid + 1;
    }
  }
  for (let i = first; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.passIndex === pass.passIndex
      && ev.barIndex === pass.barIndex
      && internalSec >= ev.startSec
      && internalSec < ev.startSec + ev.durSec) {
      return i;
    }
    // Events sort by start time, so stop once the window cannot reach back.
    if (internalSec - ev.startSec > MAX_EVENT_LOOKBACK_SEC) break;
  }
  return null;
}

function findPassAtQuarter(quarter, passes) {
  for (let i = passes.length - 1; i >= 0; i--) {
    const p = passes[i];
    if (quarter >= p.startQuarter && quarter < p.endQuarter) return p;
  }
  return passes[passes.length - 1];
}

function loopWindowImpl(startBarIndex, endBarIndex, passes, rate) {
  const startBar = Number(startBarIndex) || 0;
  const endBar = Number(endBarIndex) || 0;
  if (startBar > endBar) return { startSec: 0, endSec: 0 };

  const startPass = firstPassForBar(passes, startBar);
  const endPass = firstPassForBar(passes, endBar);
  if (!startPass || !endPass) return { startSec: 0, endSec: 0 };

  return {
    startSec: startPass.startSec / rate,
    endSec: endPass.endSec / rate,
  };
}
