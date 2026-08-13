import assert from 'node:assert/strict';
import { midiFreq } from '../../js/audio.js';
import { createPitchMatcher } from '../../js/pitchMatch.js';
import { createScoringWindow } from '../../js/pitchMetrics.js';
import { samplesForTone, heldDisplaySilence } from './helpers.mjs';

const TARGET_MIDI = 69;

function feedWindow(window, samples, count = true) {
  let last = null;
  for (const s of samples) {
    last = window.update(s, { count });
  }
  return last;
}

function feedMatcher(matcher, samples, count = true) {
  let last = null;
  for (const s of samples) {
    last = matcher.update(s, s.timestampMs, count);
  }
  return last;
}

function makeWindow(profileId = 'center', holdMs = 1000, style = 'straight') {
  return createScoringWindow({ profileId, holdMs, style, targetMidi: TARGET_MIDI });
}

export function runMetricsTests() {
  console.log('test 1: stable 0-cent tone passes Center');
  {
    const w = makeWindow('center', 1000);
    const samples = samplesForTone({ fps: 60, durationMs: 1500, centsOff: 0 });
    const snap = feedWindow(w, samples);
    assert.equal(snap.matched, true, 'should pass Center at 0 cents');
  }

  console.log('test 2: stable +9-cent tone passes Center');
  {
    const w = makeWindow('center', 1000);
    const samples = samplesForTone({ fps: 60, durationMs: 1500, centsOff: 9 });
    const snap = feedWindow(w, samples);
    assert.equal(snap.matched, true, 'should pass Center at +9 cents');
  }

  console.log('test 3: stable +11-cent tone fails Center');
  {
    const w = makeWindow('center', 1000);
    const samples = samplesForTone({ fps: 60, durationMs: 1500, centsOff: 11 });
    const snap = feedWindow(w, samples);
    assert.equal(snap.matched, false, 'should fail Center at +11 cents');
  }

  console.log('test 4: stable +39-cent tone fails all profiles');
  {
    for (const profileId of ['learn', 'center', 'precision']) {
      const w = makeWindow(profileId, 1000);
      const samples = samplesForTone({ fps: 60, durationMs: 1500, centsOff: 39 });
      const snap = feedWindow(w, samples);
      assert.equal(snap.matched, false, `should fail ${profileId} at +39 cents`);
    }
  }

  console.log('test 5: fragments do not combine into pass');
  {
    const w = makeWindow('center', 1000);
    const fps = 60;
    const a = samplesForTone({ fps, durationMs: 600, centsOff: 0, startMs: 0 });
    const gap = heldDisplaySilence({ fps, durationMs: 400, frequencyHz: midiFreq(TARGET_MIDI), startMs: 600 });
    const b = samplesForTone({ fps, durationMs: 600, centsOff: 0, startMs: 1000 });
    const snap = feedWindow(w, [...a, ...gap, ...b]);
    assert.equal(snap.matched, false, 'two fragments must not combine');
  }

  console.log('test 6: held display during silence does not count as voiced');
  {
    const w = makeWindow('center', 1000);
    const fps = 60;
    const voiced = samplesForTone({ fps, durationMs: 200, centsOff: 0, startMs: 0 });
    const held = heldDisplaySilence({
      fps,
      durationMs: 1300,
      frequencyHz: midiFreq(TARGET_MIDI),
      centsOff: 0,
      startMs: 200,
    });
    const snap = feedWindow(w, [...voiced, ...held]);
    assert.ok(snap.voicedCoverage < 0.85, `voicedCoverage ${snap.voicedCoverage} should stay low`);
    assert.equal(snap.matched, false, 'held display must not pass');
  }

  console.log('test 7: vibrato centered at 0 passes');
  {
    const fps = 60;
    const durationMs = 1500;
    const frameMs = 1000 / fps;
    const count = Math.ceil(durationMs / frameMs);
    const samples = [];
    for (let i = 0; i < count; i++) {
      const t = i * frameMs / 1000;
      const cents = 30 * Math.sin(2 * Math.PI * 5 * t);
      const freq = midiFreq(TARGET_MIDI) * Math.pow(2, cents / 1200);
      samples.push({
        timestampMs: i * frameMs,
        frequencyHz: freq,
        centsFromTarget: cents,
        clarity: 0.9,
        rms: 0.1,
        voiced: true,
      });
    }
    const w = makeWindow('center', 1000, 'vibrato');
    const snap = feedWindow(w, samples);
    assert.equal(snap.matched, true, 'vibrato centered at 0 should pass Center');
  }

  console.log('test 8: vibrato centered at +25 fails');
  {
    const fps = 60;
    const durationMs = 1500;
    const frameMs = 1000 / fps;
    const count = Math.ceil(durationMs / frameMs);
    const samples = [];
    for (let i = 0; i < count; i++) {
      const t = i * frameMs / 1000;
      const cents = 25 + 30 * Math.sin(2 * Math.PI * 5 * t);
      const freq = midiFreq(TARGET_MIDI) * Math.pow(2, cents / 1200);
      samples.push({
        timestampMs: i * frameMs,
        frequencyHz: freq,
        centsFromTarget: cents,
        clarity: 0.9,
        rms: 0.1,
        voiced: true,
      });
    }
    const w = makeWindow('center', 1000, 'vibrato');
    const snap = feedWindow(w, samples);
    assert.equal(snap.matched, false, 'vibrato centered at +25 should fail');
  }

  console.log('test 9: fps equivalence for stable tone');
  {
    const results = [];
    for (const fps of [30, 60, 120]) {
      const w = makeWindow('center', 1000);
      const samples = samplesForTone({ fps, durationMs: 1500, centsOff: 0 });
      const snap = feedWindow(w, samples);
      results.push({
        centerErrorCents: snap.centerErrorCents,
        stabilityCents: snap.stabilityCents,
        meanAbsoluteErrorCents: snap.meanAbsoluteErrorCents,
        inTuneCoverage: snap.inTuneCoverage,
        voicedCoverage: snap.voicedCoverage,
      });
    }
    const base = results[0];
    for (let i = 1; i < results.length; i++) {
      const r = results[i];
      assert.ok(Math.abs(r.centerErrorCents - base.centerErrorCents) <= 0.5, 'centerErrorCents fps drift');
      assert.ok(Math.abs(r.stabilityCents - base.stabilityCents) <= 0.5, 'stabilityCents fps drift');
      assert.ok(Math.abs(r.meanAbsoluteErrorCents - base.meanAbsoluteErrorCents) <= 0.5, 'MAE fps drift');
      assert.ok(Math.abs(r.inTuneCoverage - base.inTuneCoverage) <= 0.02, 'inTuneCoverage fps drift');
      assert.ok(Math.abs(r.voicedCoverage - base.voicedCoverage) <= 0.02, 'voicedCoverage fps drift');
    }
  }

  console.log('test 10: guide-tone count=false does not set matched');
  {
    const m = createPitchMatcher({ profileId: 'center', holdMs: 1000 });
    m.setTarget(TARGET_MIDI);
    const samples = samplesForTone({ fps: 60, durationMs: 1000, centsOff: 0 });
    feedMatcher(m, samples, false);
    assert.equal(m.update(samples[0], 0, false).matched, false);
    assert.equal(m.update(samples[samples.length - 1], 999, false).matched, false);

    const after = feedMatcher(
      m,
      samplesForTone({ fps: 60, durationMs: 1500, centsOff: 0, startMs: 1000 }),
      true,
    );
    assert.equal(after.matched, true, 'fresh scoring after guide should pass');
  }
}
