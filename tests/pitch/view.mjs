import assert from 'node:assert/strict';
import {
  clampViewCenter,
  easeViewCenter,
  laneLabelStep,
  shouldLabelLane,
  targetViewCenter,
  visibleLaneRange,
  visibleLaneSpan,
  MIN_LANE_PX,
  MIN_VISIBLE_LANES,
} from '../../js/runnerPitchView.js';

/** One line of notes, one beat each, from a list of MIDI numbers. */
function line(midis, { dur = 1, gap = 1 } = {}) {
  return midis.map((midi, i) => ({ midi, startBeat: i * gap, dur }));
}

export function runViewTests() {
  console.log('view test 1: a short run shows every lane');
  {
    // 13 lanes in 400 usable pixels: every lane is over the minimum height.
    assert.equal(visibleLaneSpan(400, 13), 13);
  }

  console.log('view test 2: a wide run shows only the lanes that fit');
  {
    // Three octaves plus padding does not fit; the window holds what fits.
    const span = visibleLaneSpan(400, 41);
    assert.ok(span < 41, 'the window must be smaller than the run');
    assert.equal(span, Math.floor(400 / MIN_LANE_PX));
    assert.ok(400 / span >= MIN_LANE_PX, 'every lane must stay readable');
  }

  console.log('view test 3: a short canvas still shows an octave');
  {
    assert.equal(visibleLaneSpan(120, 41), MIN_VISIBLE_LANES);
    // The window never shows more lanes than the run holds.
    assert.equal(visibleLaneSpan(120, 5), 5);
  }

  console.log('view test 4: the window follows the melody up and down');
  {
    const notes = line([48, 55, 60, 67, 72, 79, 84]);
    const span = 12;
    const low = targetViewCenter(notes, 0, { span, aheadBeats: 4 });
    const high = targetViewCenter(notes, 6, { span, aheadBeats: 4 });
    assert.ok(high > low + 12, `the window must climb (${low} -> ${high})`);
    const back = targetViewCenter(notes, 0.2, { span, aheadBeats: 4 });
    assert.ok(back < high, 'the window must come down again');
  }

  console.log('view test 5: the window holds the note that plays now');
  {
    const notes = line([60, 62, 64, 84, 86]);
    const span = 12;
    for (const beat of [0, 1, 2, 3, 4]) {
      const center = targetViewCenter(notes, beat, { span, aheadBeats: 4 });
      const midi = notes[beat].midi;
      assert.ok(
        Math.abs(midi - center) <= span / 2,
        `note ${midi} must stay in the window at beat ${beat} (centre ${center})`,
      );
    }
  }

  console.log('view test 6: a leap wider than the window keeps the near notes');
  {
    // The window cannot hold both ends, so it holds the notes that play next.
    const notes = line([40, 41, 42, 88, 89, 90]);
    const center = targetViewCenter(notes, 0, { span: 12, aheadBeats: 8 });
    assert.ok(center < 55, `the window must stay low, not split the leap (${center})`);
  }

  console.log('view test 7: an empty window keeps the centre it had');
  {
    assert.equal(targetViewCenter([], 4, { span: 12, fallbackCenter: 61 }), 61);
    assert.equal(targetViewCenter(null, 4, { span: 12, fallbackCenter: 61 }), 61);
    assert.equal(targetViewCenter([], 4, { span: 12 }), null);
  }

  console.log('view test 8: the window stays inside the range of the run');
  {
    assert.equal(clampViewCenter(200, 12, 48, 84), 84.5 - 6);
    assert.equal(clampViewCenter(0, 12, 48, 84), 47.5 + 6);
    // A window as wide as the run sits on the middle and does not move.
    assert.equal(clampViewCenter(90, 40, 48, 84), 66);
    assert.equal(clampViewCenter(10, 40, 48, 84), 66);
  }

  console.log('view test 9: the window slides, it does not jump');
  {
    const step = easeViewCenter(60, 72, 1 / 60);
    assert.ok(step > 60 && step < 72, `one frame must be a part of the move (${step})`);
    // The move settles on the target after a short time.
    let center = 60;
    for (let i = 0; i < 120; i++) center = easeViewCenter(center, 72, 1 / 60);
    assert.equal(center, 72);
    // The first frame of a run puts the window on the target at once.
    assert.equal(easeViewCenter(null, 72, 0), 72);
    // A long frame gap does not overshoot.
    assert.ok(easeViewCenter(60, 72, 10) <= 72);
  }

  console.log('view test 10: the visible lanes stay inside the run');
  {
    const range = visibleLaneRange(60, 12, 48, 84);
    assert.ok(range.lo >= 48 && range.hi <= 84);
    assert.ok(range.hi - range.lo <= 13, 'the window holds about one span of lanes');
    const clipped = visibleLaneRange(50, 12, 48, 84);
    assert.equal(clipped.lo, 48, 'the window never draws below the run');
  }

  console.log('view test 11: short lanes share the names in the gutter');
  {
    assert.equal(laneLabelStep(20), 1, 'a tall lane keeps every name');
    assert.equal(laneLabelStep(7), 3);
    assert.equal(shouldLabelLane(61, { lanePx: 20 }), true);
    assert.equal(shouldLabelLane(61, { lanePx: 7 }), false);
    assert.equal(shouldLabelLane(60, { lanePx: 7 }), true, 'every C keeps its name');
    // Two names never print on each other: the step holds them apart.
    for (const lanePx of [4, 7, 9, 12, 14, 15, 30]) {
      const step = laneLabelStep(lanePx);
      let last = null;
      for (let m = 36; m <= 96; m++) {
        if (!shouldLabelLane(m, { lanePx })) continue;
        if (last != null) assert.ok((m - last) * lanePx >= 14, `names overlap at ${lanePx}px`);
        last = m;
      }
      assert.ok(step >= 1);
    }
  }
}
