// Screen-level UX restructuring: setup summaries, subviews, focus mode,
// and picker wiring. Preserves existing element IDs so domain modules keep working.
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext, setContext } from './musicalContext.js';
import { shortScaleName } from './scales.js';
import { TUNINGS } from './theory.js';
import { CHORDS } from './chords.js';
import {
  openRootPicker, openScalePicker, openChordPicker, openTuningPicker,
  formatChordLabel, getQuickScales, cycleEnharmonicPref, getEnharmonicPref,
} from './pickers.js';
import { stepChord } from './chordReference.js';
import { openSelectionSheet } from './selectionSheet.js';
import {
  renderSetupSummary, initSubviewTabs, renderCompactProgress,
  openOverflowMenu, renderFilterSummary, setEditorNavState, setDrillFocus,
  escapeHtml,
} from './uxPrimitives.js';

let showSectionFn = null;

function ensureBackButton(section) {
  if (!section || section.querySelector('.tool-back')) return;
  const head = section.querySelector('.section-head');
  if (!head) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-back';
  btn.textContent = '← Back';
  head.insertBefore(btn, head.firstChild);
}

function insertBefore(parent, node, ref) {
  if (!parent || !node) return;
  if (ref) parent.insertBefore(node, ref);
  else parent.appendChild(node);
}

function wrapAsSubview(elements, { id, forTabs, active }) {
  const panel = document.createElement('div');
  panel.className = 'subview-panel' + (active ? ' active' : '');
  panel.dataset.subview = id;
  panel.dataset.subviewFor = forTabs;
  if (!active) panel.hidden = true;

  const els = elements.filter(Boolean);
  if (!els.length) return panel;

  // Only move top-level nodes — skip any element contained by another in the set
  // to avoid "new child contains the parent" hierarchy errors.
  const tops = els.filter(el => !els.some(other => other !== el && other.contains(el)));
  const first = tops[0];
  if (!first?.parentNode) return panel;

  first.parentNode.insertBefore(panel, first);
  tops.forEach(el => panel.appendChild(el));
  return panel;
}

/* ── Scale Reference ─────────────────────────────────────────── */
function setupScaleRef() {
  const sec = document.getElementById('sec-scaleref');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);

  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const setup = document.createElement('div');
  setup.id = 'scaleref-setup';
  setup.className = 'mobile-setup-first';
  insertBefore(layout, setup, main);

  const tabs = document.createElement('div');
  tabs.id = 'scaleref-tabs';
  insertBefore(main, tabs, main.firstChild);

  const scaleControls = document.getElementById('ref-scale-controls');
  const sweepControls = document.getElementById('ref-sweep-controls');
  const fbCard = document.getElementById('ref-fb-card');
  const refCard = document.getElementById('ref-card');
  const modes = document.getElementById('ref-modes');

  // Move fret opts into details
  const opts = fbCard?.querySelector('.ref-fb-opts');
  if (opts && !document.getElementById('ref-fb-options-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'ref-fb-options-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    const body = document.createElement('div');
    // Keep view picker outside options — moved to tabs
    const viewPicker = opts.querySelector('#ref-view-picker');
    if (viewPicker) viewPicker.style.display = 'none';
    [...opts.querySelectorAll('.ref-fb-range, .ref-fb-check')].forEach(el => body.appendChild(el));
    details.appendChild(body);
    if (fbCard) fbCard.insertBefore(details, fbCard.querySelector('.ref-fb-scroll'));
  }

  // Sweep prev/next controls
  if (sweepControls && !document.getElementById('ref-sweep-nav')) {
    const nav = document.createElement('div');
    nav.id = 'ref-sweep-nav';
    nav.className = 'setup-summary-fields';
    nav.style.marginBottom = '10px';
    nav.innerHTML = `
      <button type="button" class="btn sm" id="ref-sweep-prev-pat" aria-label="Previous pattern">← Pattern</button>
      <button type="button" class="btn sm" id="ref-sweep-next-pat" aria-label="Next pattern">Pattern →</button>
      <button type="button" class="btn sm" id="ref-sweep-prev-inv" aria-label="Previous inversion">← Inv</button>
      <button type="button" class="btn sm" id="ref-sweep-next-inv" aria-label="Next inversion">Inv →</button>
    `;
    sweepControls.parentNode.insertBefore(nav, sweepControls);
  }

  const scalePanel = wrapAsSubview(
    [fbCard, refCard, modes].filter(Boolean),
    { id: 'scale', forTabs: 'scaleref-tabs', active: true }
  );
  // Sweep panel: sweep controls + shared fretboard stays in scale for now;
  // scaleReference.js already toggles visibility. We sync tabs with view picker.
  const sweepPanel = document.createElement('div');
  sweepPanel.className = 'subview-panel';
  sweepPanel.dataset.subview = 'sweeps';
  sweepPanel.dataset.subviewFor = 'scaleref-tabs';
  sweepPanel.hidden = true;
  if (sweepControls) {
    // Keep sweep controls in DOM where scaleReference expects them;
    // tab switching will toggle via existing view buttons.
  }

  initSubviewTabs(tabs, [
    { id: 'scale', label: 'Scale' },
    { id: 'sweeps', label: 'Sweeps' },
  ], {
    settingsKey: 'subview.scaleref',
    defaultId: 'scale',
    onChange: (id) => {
      const btn = document.querySelector(`.ref-view-btn[data-ref-view="${id === 'sweeps' ? 'sweep' : 'scale'}"]`);
      if (btn) btn.click();
      // Show shared fretboard in both; hide scale-only bits
      if (scaleControls) scaleControls.hidden = id === 'sweeps';
      if (refCard) refCard.hidden = id === 'sweeps';
      if (modes) modes.hidden = id === 'sweeps';
      if (sweepControls) sweepControls.hidden = id !== 'sweeps';
      const nav = document.getElementById('ref-sweep-nav');
      if (nav) nav.hidden = id !== 'sweeps';
      refreshScaleRefSetup();
    },
  });

  // Sync initial
  const initial = getSetting('subview.scaleref', 'scale');
  if (initial === 'sweeps') {
    const btn = document.querySelector('.ref-view-btn[data-ref-view="sweep"]');
    if (btn) btn.click();
  }

  wireSweepNav();
  refreshScaleRefSetup();
  subscribeContext(() => refreshScaleRefSetup());
}

function refreshScaleRefSetup() {
  const el = document.getElementById('scaleref-setup');
  if (!el) return;
  const c = getContext();
  const tuning = getSetting('ref.tuning', getSetting('picker.lastTuning', 'Standard'));
  renderSetupSummary(el, [
    { key: 'root', label: 'Root', value: c.root, hint: 'Root', onClick: () => openRootPicker({ value: c.root, source: 'scaleref' }) },
    { key: 'scale', label: 'Scale', value: shortScaleName(c.scale), hint: 'Scale', onClick: () => openScalePicker({ value: c.scale, source: 'scaleref' }) },
    {
      key: 'tuning', label: 'Tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning });
        if (next && next !== 'Custom') {
          saveSetting('ref.tuning', next);
          // Click matching sidebar item if present
          const item = document.querySelector(`#sl-ref-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshScaleRefSetup();
        }
      },
    },
  ]);
}

function wireSweepNav() {
  // Prefer the in-panel inversion steppers that scaleReference renders.
  document.getElementById('ref-sweep-prev-pat')?.addEventListener('click', () => {
    const btns = [...document.querySelectorAll('#ref-sweep-controls [data-sweep-pattern]')];
    const i = btns.findIndex(b => b.classList.contains('active'));
    if (i < 0 || !btns.length) return;
    btns[(i - 1 + btns.length) % btns.length].click();
  });
  document.getElementById('ref-sweep-next-pat')?.addEventListener('click', () => {
    const btns = [...document.querySelectorAll('#ref-sweep-controls [data-sweep-pattern]')];
    const i = btns.findIndex(b => b.classList.contains('active'));
    if (i < 0 || !btns.length) return;
    btns[(i + 1) % btns.length].click();
  });
  document.getElementById('ref-sweep-prev-inv')?.addEventListener('click', () => {
    document.querySelector('#ref-sweep-controls [data-sweep-inv-dir="-1"]')?.click();
  });
  document.getElementById('ref-sweep-next-inv')?.addEventListener('click', () => {
    document.querySelector('#ref-sweep-controls [data-sweep-inv-dir="1"]')?.click();
  });
}

/* ── Chords ──────────────────────────────────────────────────── */
function setupChords() {
  const sec = document.getElementById('sec-chords');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);

  const head = sec.querySelector('.section-head');
  const p = head?.querySelector('p');
  if (p) p.classList.add('drill-explain');

  const layout = sec.querySelector('.quiz-layout');
  const tabs = document.createElement('div');
  tabs.id = 'chords-tabs';
  if (layout) layout.parentNode.insertBefore(tabs, layout);

  const setup = document.createElement('div');
  setup.id = 'chords-setup';
  if (layout) layout.parentNode.insertBefore(setup, layout);

  const mapEls = [layout];
  const mcc = document.getElementById('mcc-block');
  const builder = sec.querySelector('.chord-builder-block');
  const caged = document.getElementById('caged-block');

  wrapAsSubview(mapEls.filter(Boolean), { id: 'map', forTabs: 'chords-tabs', active: true });
  if (mcc) wrapAsSubview([mcc], { id: 'cards', forTabs: 'chords-tabs', active: false });
  if (builder) wrapAsSubview([builder], { id: 'build', forTabs: 'chords-tabs', active: false });
  if (caged) {
    const intro = caged.querySelector('.caged-head p');
    if (intro && !caged.querySelector('.caged-learn-more')) {
      const short = document.createElement('p');
      short.className = 'caged-short';
      short.innerHTML = 'Five movable major shapes — <strong>C A G E D</strong> — link across the neck. <button type="button" class="btn sm caged-learn-more">Learn more</button>';
      intro.hidden = true;
      intro.parentNode.insertBefore(short, intro);
      short.querySelector('button').onclick = () => { intro.hidden = !intro.hidden; };
    }
    wrapAsSubview([caged], { id: 'caged', forTabs: 'chords-tabs', active: false });
  }

  // Cards: collapse filters into sheet
  setupChordCardsFilters();

  initSubviewTabs(tabs, [
    { id: 'map', label: 'Map' },
    { id: 'cards', label: 'Cards' },
    { id: 'build', label: 'Build' },
    { id: 'caged', label: 'CAGED' },
  ], {
    settingsKey: 'subview.chords',
    defaultId: 'map',
    onChange: (id) => {
      setup.hidden = id === 'build';
      refreshChordsSetup();
    },
  });

  // Move fret opts into Options for map
  const chordOpts = document.querySelector('#sec-chords .ref-fb-opts');
  if (chordOpts && !document.getElementById('chord-fb-options-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'chord-fb-options-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    const body = document.createElement('div');
    while (chordOpts.firstChild) body.appendChild(chordOpts.firstChild);
    details.appendChild(body);
    chordOpts.appendChild(details);
  }

  // Overflow for Full viewer / PDF
  const mccActions = document.querySelector('.mcc-head-actions');
  if (mccActions && !document.getElementById('mcc-overflow')) {
    const overflow = document.createElement('button');
    overflow.type = 'button';
    overflow.id = 'mcc-overflow';
    overflow.className = 'options-trigger';
    overflow.setAttribute('aria-label', 'More actions');
    overflow.textContent = '⋯';
    const openBtn = document.getElementById('mcc-open');
    const printBtn = document.getElementById('mcc-print');
    if (openBtn) openBtn.hidden = true;
    if (printBtn) printBtn.hidden = true;
    mccActions.appendChild(overflow);
    overflow.onclick = (e) => {
      e.stopPropagation();
      openOverflowMenu(overflow, [
        { label: 'Full viewer', onClick: () => openBtn?.click() },
        { label: 'Printable PDF', onClick: () => printBtn?.click() },
      ]);
    };
  }

  refreshChordsSetup();
  subscribeContext(() => refreshChordsSetup());
  // Keep Quality chip in sync when swipe / ← → / sidebar changes the chord.
  document.addEventListener('musi:chordref-change', () => refreshChordsSetup());
  wireChordQualityChipSwipe();
}

/** Horizontal swipe on the Quality setup chip cycles chords (tap still opens picker). */
function wireChordQualityChipSwipe() {
  const setup = document.getElementById('chords-setup');
  if (!setup || setup.dataset.chordSwipeWired) return;
  setup.dataset.chordSwipeWired = '1';

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pointerId = null;
  let swiped = false;

  setup.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest?.('.setup-chip[data-key="chord"]');
    if (!chip) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracking = true;
    swiped = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    try { chip.setPointerCapture(e.pointerId); } catch (_) {}
  });

  setup.addEventListener('pointerup', (e) => {
    if (!tracking || e.pointerId !== pointerId) return;
    const chip = setup.querySelector('.setup-chip[data-key="chord"]');
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    tracking = false;
    pointerId = null;
    try { chip?.releasePointerCapture(e.pointerId); } catch (_) {}
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
    swiped = true;
    stepChord(dx < 0 ? 1 : -1);
  });

  setup.addEventListener('pointercancel', () => {
    tracking = false;
    pointerId = null;
  });

  // Suppress the chip's click (picker) after a successful swipe.
  setup.addEventListener('click', (e) => {
    if (!swiped) return;
    if (!e.target.closest?.('.setup-chip[data-key="chord"]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    swiped = false;
  }, true);
}

function refreshChordsSetup() {
  const el = document.getElementById('chords-setup');
  if (!el) return;
  const c = getContext();
  const chord = getSetting('chordref.chord', 'Major');
  const tuning = getSetting('chordref.tuning', 'Standard');
  const title = formatChordLabel(c.root, chord);
  // Update section context line
  const h2 = document.querySelector('#sec-chords .section-head h2');
  if (h2) h2.dataset.context = `${title} · ${tuning}`;

  renderSetupSummary(el, [
    {
      key: 'root', label: 'Root', value: c.root, hint: 'Root',
      onClick: async () => {
        const next = await openRootPicker({ value: c.root, source: 'chordref' });
        if (next) {
          const item = document.querySelector(`#sl-chord-root .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshChordsSetup();
        }
      },
    },
    {
      key: 'chord', label: 'Quality', value: CHORDS[chord] ? (chord) : chord, hint: 'Quality',
      onClick: async () => {
        const next = await openChordPicker({ value: chord });
        if (next) {
          saveSetting('chordref.chord', next);
          const item = document.querySelector(`#sl-chord-type .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshChordsSetup();
        }
      },
    },
    {
      key: 'tuning', label: 'Tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning });
        if (next && next !== 'Custom') {
          saveSetting('chordref.tuning', next);
          const item = document.querySelector(`#sl-chord-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshChordsSetup();
        }
      },
    },
  ], { label: `${title} · ${tuning}` });
}

function setupChordCardsFilters() {
  const toolbar = document.querySelector('.mcc-toolbar');
  if (!toolbar || toolbar.dataset.uxWired) return;
  toolbar.dataset.uxWired = '1';

  const summary = document.createElement('div');
  summary.id = 'mcc-filter-summary';
  toolbar.parentNode.insertBefore(summary, toolbar);

  const searchField = toolbar.querySelector('.mcc-search-field');
  const searchClone = searchField ? searchField.cloneNode(true) : null;
  if (searchClone) {
    searchClone.style.flex = '1';
    const wrap = document.createElement('div');
    wrap.className = 'mcc-search-row';
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.marginBottom = '8px';
    // Keep original search wired — just show summary + hide rest of toolbar on mobile
  }

  toolbar.classList.add('mcc-toolbar-sheet-source');
  const style = document.createElement('style');
  style.textContent = `
    @media(max-width:768px){
      .mcc-toolbar-sheet-source{display:none}
      .mcc-toolbar-sheet-source.force-show{display:flex;flex-direction:column}
    }
  `;
  document.head.appendChild(style);

  const updateSummary = () => {
    const deck = document.getElementById('mcc-deck')?.selectedOptions[0]?.text || 'Core';
    const tun = document.getElementById('mcc-tuning')?.selectedOptions[0]?.text || 'All';
    const root = document.getElementById('mcc-root')?.value;
    const intervals = document.getElementById('mcc-intervals')?.checked;
    const status = document.getElementById('mcc-status')?.textContent || '';
    const bits = [deck, tun];
    if (root && root !== 'all') bits.push(`Root ${root}`);
    if (intervals) bits.push('Intervals on');
    let active = 0;
    ['mcc-deck', 'mcc-tuning', 'mcc-family', 'mcc-root'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value && el.value !== 'all' && !(id === 'mcc-deck' && el.value === 'minimal')) active++;
    });
    const resultMatch = status.match(/(\d+)/);
    renderFilterSummary(summary, {
      summary: bits.join(' · '),
      activeCount: active,
      resultCount: resultMatch ? resultMatch[1] : undefined,
      onClick: () => {
        toolbar.classList.toggle('force-show');
      },
    });
  };
  toolbar.querySelectorAll('select,input').forEach(el => {
    el.addEventListener('change', updateSummary);
    el.addEventListener('input', updateSummary);
  });
  const obs = new MutationObserver(updateSummary);
  const status = document.getElementById('mcc-status');
  if (status) obs.observe(status, { childList: true, characterData: true, subtree: true });
  updateSummary();
}

/* ── Fretboard Interval Map (route: intervalorbit) ───────────── */
function setupIntervalOrbit() {
  const sec = document.getElementById('sec-intervalorbit');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const explain = sec.querySelector('.section-head p');
  if (explain) explain.classList.add('drill-explain');
  // Tabs, setup summary, board, and subviews are owned by js/interval-map/ui.js.
}

/* ── Pitch ───────────────────────────────────────────────────── */
function setupPitch() {
  const sec = document.getElementById('sec-tuner');
  if (!sec) return;
  ensureBackButton(sec);
  const center = sec.querySelector('.tuner-center');
  if (!center) return;

  const tabs = document.createElement('div');
  tabs.id = 'pitch-tabs';
  sec.insertBefore(tabs, center);

  const cards = [...center.querySelectorAll(':scope > .quiz-card')];
  // Expected order: tuner, reference, trainer, runner
  const names = ['tuner', 'reference', 'trainer', 'runner'];
  cards.forEach((card, i) => {
    wrapAsSubview([card], { id: names[i] || `p${i}`, forTabs: 'pitch-tabs', active: i === 0 });
  });

  // Move trainer/runner configs into options details
  collapsePitchControls();

  // Hide runner intro
  const intro = document.querySelector('.pr-intro');
  if (intro) {
    intro.hidden = true;
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'options-trigger';
    help.textContent = 'Help';
    help.onclick = () => { intro.hidden = !intro.hidden; };
    intro.parentNode.insertBefore(help, intro);
  }

  initSubviewTabs(tabs, [
    { id: 'tuner', label: 'Tuner' },
    { id: 'reference', label: 'Reference' },
    { id: 'trainer', label: 'Trainer' },
    { id: 'runner', label: 'Runner' },
  ], {
    settingsKey: 'subview.tuner',
    defaultId: 'tuner',
  });

  wireDrillFocus('sec-tuner', 'pt');
}

function collapsePitchControls() {
  // Trainer controls
  const ptControls = document.querySelectorAll('#sec-tuner .pt-controls, #sec-tuner .pr-toggles');
  const trainerCard = document.querySelector('[data-subview="trainer"] .quiz-card') ||
    [...document.querySelectorAll('#sec-tuner .quiz-card')].find(c => c.querySelector('#pt-toggle'));
  if (trainerCard && !trainerCard.querySelector('#pt-setup-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'pt-setup-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Setup</summary>`;
    const body = document.createElement('div');
    trainerCard.querySelectorAll('.pt-controls').forEach(el => {
      if (el.closest('.pr-card')) return;
      body.appendChild(el);
    });
    details.appendChild(body);
    const stage = trainerCard.querySelector('.pt-stage');
    if (stage) trainerCard.insertBefore(details, stage);
    else trainerCard.insertBefore(details, trainerCard.firstChild);
  }

  // Reference scale playback details
  const refCard = document.querySelector('[data-subview="reference"] .quiz-card');
  if (refCard && !refCard.querySelector('#vt-scale-details')) {
    const scaleControls = refCard.querySelector('.vt-scale-controls');
    if (scaleControls) {
      const details = document.createElement('details');
      details.className = 'adv-options';
      details.id = 'vt-scale-details';
      details.innerHTML = `<summary><span class="adv-gear">⚙</span> Scale playback options</summary>`;
      const body = document.createElement('div');
      body.appendChild(scaleControls);
      details.appendChild(body);
      const label = [...refCard.querySelectorAll('.field-label')].find(l => /Scale playback/i.test(l.textContent));
      if (label) refCard.insertBefore(details, label.nextSibling);
    }
  }

  // Runner setup
  const runnerCard = document.querySelector('.pr-card');
  if (runnerCard && !runnerCard.querySelector('#pr-setup-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'pr-setup-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Setup</summary>`;
    const body = document.createElement('div');
    const controls = runnerCard.querySelector('.pt-controls');
    const toggles = runnerCard.querySelector('.pr-toggles');
    if (controls) body.appendChild(controls);
    if (toggles) body.appendChild(toggles);
    details.appendChild(body);
    const hud = runnerCard.querySelector('.pr-hud');
    if (hud) runnerCard.insertBefore(details, hud);
  }
}

/* ── Fretboard / Ear / Sight / Intervals / Chord Workout ───── */
function setupFretboard() {
  const sec = document.getElementById('sec-fretboard');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const setup = document.createElement('div');
  setup.id = 'fb-setup';
  setup.className = 'mobile-setup-first';
  insertBefore(layout, setup, main);

  const opts = main.querySelector('details.adv-options') || main.querySelector('.fb-workbench-controls');
  // Ensure workbench is in closed details
  if (opts && opts.classList.contains('fb-workbench-controls')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    opts.parentNode.insertBefore(details, opts);
    details.appendChild(opts);
  } else if (opts && opts.tagName === 'DETAILS') {
    opts.open = false;
  }

  const compact = document.createElement('div');
  compact.id = 'fb-compact-progress';
  compact.className = 'compact-progress auto-hide';
  const ph = main.querySelector('.progress-header');
  if (ph) ph.after(compact);

  refreshFbSetup();
  wireDrillFocus('sec-fretboard', 'fb');
}

function refreshFbSetup() {
  const el = document.getElementById('fb-setup');
  if (!el) return;
  const tuning = getSetting('fb.tuning', document.querySelector('#sl-fb-tuning .sl-item.active')?.dataset.val || 'Standard');
  const mode = getSetting('fb.mode', document.querySelector('#sl-fb-mode .sl-item.active')?.dataset.val || 'notes');
  renderSetupSummary(el, [
    {
      key: 'tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning });
        if (next && next !== 'Custom') {
          const item = document.querySelector(`#sl-fb-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshFbSetup();
        }
      },
    },
    {
      key: 'mode', value: String(mode), hint: 'Mode',
      onClick: () => openIoListPicker('Mode', 'sl-fb-mode', 'fb.mode').then(refreshFbSetup),
    },
  ]);
}

function setupEar() {
  const sec = document.getElementById('sec-ear');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const setup = document.createElement('div');
  setup.id = 'ear-setup';
  setup.className = 'mobile-setup-first';
  insertBefore(layout, setup, main);

  // Sidebar becomes setup sheet content
  const sidebar = sec.querySelector('.sidebar');
  renderSetupSummary(setup, [
    {
      key: 'setup', value: 'Ear setup', hint: 'Change',
      onClick: () => openEarSetupSheet(sidebar),
    },
  ]);

  const compact = document.createElement('div');
  compact.id = 'ear-compact-progress';
  compact.className = 'compact-progress auto-hide';
  main.querySelector('.progress-header')?.after(compact);
  wireDrillFocus('sec-ear', 'ear');
  refreshEarSetupSummary();
}

function refreshEarSetupSummary() {
  const el = document.getElementById('ear-setup');
  if (!el) return;
  const bits = [];
  ['sl-ear-context', 'sl-ear-pool', 'sl-ear-answer', 'sl-ear-oct'].forEach(id => {
    const a = document.querySelector(`#${id} .sl-item.active`);
    if (a) bits.push(a.textContent.trim());
  });
  renderSetupSummary(el, [
    {
      key: 'setup',
      value: bits.join(' · ') || 'Ear setup',
      hint: 'Change',
      onClick: () => openEarSetupSheet(document.querySelector('#sec-ear .sidebar')),
    },
  ]);
}

async function openEarSetupSheet(sidebar) {
  if (!sidebar) return;
  // Present as a simple multi-section sheet by cloning labels into selection
  // For each list, open sequentially is heavy — instead show a dialog with the sidebar content.
  const { openSelectionSheet: open } = await import('./selectionSheet.js');
  // Use a lightweight custom panel via selection sheet items for first list only isn't enough.
  // Toggle a class that shows sidebar as a sheet on mobile.
  sidebar.classList.add('mobile-setup-sheet');
  sidebar.classList.toggle('open');
  if (!document.getElementById('ear-setup-sheet-style')) {
    const style = document.createElement('style');
    style.id = 'ear-setup-sheet-style';
    style.textContent = `
      @media(max-width:768px){
        #sec-ear.has-setup-summary .sidebar.mobile-setup-sheet{
          display:none; position:fixed; left:0; right:0; bottom:0; z-index:480;
          max-height:80vh; overflow:auto; background:rgba(18,18,18,.98);
          border-radius:18px 18px 0 0; padding:16px; border:1px solid var(--border);
        }
        #sec-ear.has-setup-summary .sidebar.mobile-setup-sheet.open{display:block}
      }
    `;
    document.head.appendChild(style);
  }
  // Close when picking
  sidebar.querySelectorAll('.sl-item').forEach(item => {
    item.addEventListener('click', () => {
      sidebar.classList.remove('open');
      refreshEarSetupSummary();
    }, { once: true });
  });
}

function setupIntervalsAndSight() {
  ['sec-intervals', 'sec-sightreading'].forEach(id => {
    const sec = document.getElementById(id);
    if (!sec) return;
    sec.classList.add('has-setup-summary');
    ensureBackButton(sec);
    const layout = sec.querySelector('.quiz-layout');
    const main = sec.querySelector('.quiz-main');
    const sidebar = sec.querySelector('.sidebar');
    if (!layout || !main) return;
    const setup = document.createElement('div');
    setup.id = id.replace('sec-', '') + '-setup';
    setup.className = 'mobile-setup-first';
    insertBefore(layout, setup, main);

    const refresh = () => {
      const bits = [...(sidebar?.querySelectorAll('.sl-item.active') || [])].map(el => el.textContent.trim());
      renderSetupSummary(setup, [{
        key: 'setup',
        value: bits.join(' · ') || 'Setup',
        hint: 'Change',
        onClick: () => {
          if (!sidebar) return;
          sidebar.classList.add('mobile-setup-sheet');
          sidebar.classList.toggle('open');
        },
      }]);
    };
    refresh();
    sidebar?.querySelectorAll('.sl-item').forEach(item => {
      item.addEventListener('click', refresh);
    });

    const compact = document.createElement('div');
    compact.className = 'compact-progress auto-hide';
    compact.id = id.replace('sec-', '') + '-compact-progress';
    main.querySelector('.progress-header')?.after(compact);
    wireDrillFocus(id, id.replace('sec-', ''));
  });

  // Shared mobile sidebar sheet style
  if (!document.getElementById('sidebar-sheet-style')) {
    const style = document.createElement('style');
    style.id = 'sidebar-sheet-style';
    style.textContent = `
      @media(max-width:768px){
        .section.has-setup-summary .sidebar.mobile-setup-sheet{
          display:none; position:fixed; left:0; right:0; bottom:0; z-index:480;
          max-height:80vh; overflow:auto; background:rgba(18,18,18,.98);
          border-radius:18px 18px 0 0; padding:16px; border:1px solid var(--border);
          width:auto !important;
        }
        .section.has-setup-summary .sidebar.mobile-setup-sheet.open{display:block}
      }
    `;
    document.head.appendChild(style);
  }
}

function setupChordWorkout() {
  const sec = document.getElementById('sec-chordlab');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const setup = document.createElement('div');
  setup.id = 'cw-setup';
  const head = sec.querySelector('.section-head');
  if (head) head.after(setup);

  const refresh = () => {
    const tuning = getSetting('cw.tuning', document.querySelector('#sl-cw-tuning .sl-item.active')?.dataset.val || 'Standard');
    renderSetupSummary(setup, [{
      key: 'tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning });
        if (next && next !== 'Custom') {
          const item = document.querySelector(`#sl-cw-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refresh();
        }
      },
    }]);
  };
  refresh();

  // Collapse recording until needed
  const recCard = sec.querySelector('.cw-record-card, #cw-record-card, [id*="record"]');
  // chord workout structure — find recording area
  const recBlock = [...sec.querySelectorAll('.quiz-card')].find(c => /record|mic|check my playing/i.test(c.textContent));
  if (recBlock && !recBlock.dataset.collapsed) {
    recBlock.dataset.collapsed = '1';
    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.className = 'btn';
    placeholder.textContent = 'Check my playing';
    placeholder.style.marginBottom = '12px';
    recBlock.hidden = true;
    recBlock.parentNode.insertBefore(placeholder, recBlock);
    placeholder.onclick = () => {
      recBlock.hidden = false;
      placeholder.hidden = true;
    };
  }

  // Compact checklist for tasks if present
  const taskList = sec.querySelector('.cw-tasks, #cw-tasks');
  if (taskList) taskList.classList.add('cw-tasks-compact');

  wireDrillFocus('sec-chordlab', 'cw');
}

/* ── Metronome ───────────────────────────────────────────────── */
function setupMetronome() {
  const sec = document.getElementById('sec-metronome');
  if (!sec) return;
  ensureBackButton(sec);

  const beatCard = sec.querySelector('.metro-settings-card');
  if (beatCard && !beatCard.querySelector('summary')) {
    const title = beatCard.querySelector('.metro-card-title');
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Beat & presets</summary>`;
    const body = document.createElement('div');
    while (beatCard.firstChild) body.appendChild(beatCard.firstChild);
    details.appendChild(body);
    beatCard.appendChild(details);
  }

  // Reduce quick tempo buttons
  const presets = sec.querySelector('.metro-preset-row');
  if (presets && !presets.dataset.uxTrimmed) {
    presets.dataset.uxTrimmed = '1';
    const keep = new Set(['80', '100', '120', '140', '160']);
    const recent = getSetting('metro.recentTempos', [120, 100, 80]);
    [...presets.querySelectorAll('.metro-bpm-preset')].forEach(btn => {
      if (!keep.has(btn.dataset.bpm)) btn.hidden = true;
    });
    // Add recent
    (Array.isArray(recent) ? recent : []).slice(0, 3).forEach(bpm => {
      if (keep.has(String(bpm))) return;
      const btn = document.createElement('button');
      btn.className = 'btn sm metro-bpm-preset';
      btn.dataset.bpm = String(bpm);
      btn.textContent = String(bpm);
      presets.insertBefore(btn, presets.firstChild);
    });
  }

  // Tempo phases collapsed when off
  const phasesCard = document.getElementById('m-phases-card');
  if (phasesCard && !phasesCard.dataset.uxWired) {
    phasesCard.dataset.uxWired = '1';
    const toggle = document.getElementById('m-phases-toggle');
    const editorEls = () => [...phasesCard.children].filter(ch => !ch.classList.contains('phases-collapsed-row'));

    let row = phasesCard.querySelector('.phases-collapsed-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'phases-collapsed-row';
      row.innerHTML = `<div><div class="metro-card-title" style="margin:0">Tempo Phases</div><div class="phases-state">Off</div></div>
        <button type="button" class="btn sm" id="m-phases-configure">Configure</button>`;
      phasesCard.insertBefore(row, phasesCard.firstChild);
      row.querySelector('#m-phases-configure').onclick = () => {
        phasesCard.classList.add('phases-editing');
        syncPhases();
      };
    }

    const syncPhases = () => {
      const on = !!toggle?.checked;
      const editing = phasesCard.classList.contains('phases-editing') || on;
      const state = row.querySelector('.phases-state');
      if (state) state.textContent = on ? 'On' : 'Off';
      if (!editing && !on) {
        row.hidden = false;
        editorEls().forEach(ch => { ch.hidden = true; });
      } else if (on && !phasesCard.classList.contains('phases-editing')) {
        // Enabled: show compact status + configure
        row.hidden = false;
        if (state) {
          const status = document.getElementById('m-phases-status')?.textContent;
          state.textContent = status?.trim() || 'On';
        }
        editorEls().forEach(ch => { ch.hidden = true; });
      } else {
        row.hidden = true;
        editorEls().forEach(ch => { ch.hidden = false; });
      }
    };
    toggle?.addEventListener('change', () => {
      if (toggle.checked) phasesCard.classList.add('phases-editing');
      else phasesCard.classList.remove('phases-editing');
      syncPhases();
    });
    syncPhases();
  }
}

/* ── Practice Timer ──────────────────────────────────────────── */
function setupPracticeTimer() {
  const sec = document.getElementById('sec-practice');
  if (!sec) return;
  ensureBackButton(sec);
  const drive = document.getElementById('ptimer-drive') || sec.querySelector('[id*="drive"], [id*="metro"]');
  // Hide tempo plan until drive enabled
  const plan = sec.querySelector('.ptimer-plan, #ptimer-plan, [class*="tempo-plan"]');
  const planCards = [...sec.querySelectorAll('.quiz-card')].filter(c => /tempo plan|phase|drive the metronome/i.test(c.textContent));
  // Heuristic: last cards after main timer
  const allCards = [...sec.querySelectorAll('.quiz-card')];
  if (allCards.length > 1) {
    const secondary = allCards.slice(1);
    secondary.forEach(c => {
      if (/drive|tempo|phase|plan/i.test(c.textContent)) {
        c.classList.add('ptimer-plan-block');
      }
    });
  }
  const driveToggle = sec.querySelector('input[type=checkbox]');
  const sync = () => {
    const on = !!sec.querySelector('input[type=checkbox]:checked');
    sec.querySelectorAll('.ptimer-plan-block').forEach(el => {
      // Keep the drive toggle card visible; hide deeper editors when off
    });
  };
  // More precise: find "Drive the Metronome" checkbox
  const labels = [...sec.querySelectorAll('label')];
  const driveLabel = labels.find(l => /drive the metronome/i.test(l.textContent));
  if (driveLabel) {
    const cb = driveLabel.querySelector('input[type=checkbox]');
    const planSection = driveLabel.closest('.quiz-card')?.nextElementSibling;
    const hidePlan = () => {
      let el = driveLabel.closest('.quiz-card')?.nextElementSibling;
      while (el) {
        if (el.classList?.contains('quiz-card') || el.matches?.('.flat-block, details, .ptimer-plan')) {
          el.hidden = !cb?.checked;
        }
        el = el.nextElementSibling;
      }
      // Show compact summary when on
      if (cb?.checked) {
        let sum = document.getElementById('ptimer-plan-summary');
        if (!sum) {
          sum = document.createElement('div');
          sum.id = 'ptimer-plan-summary';
          sum.className = 'setup-summary';
          sum.innerHTML = `<div class="setup-summary-label">Tempo plan</div>
            <button type="button" class="btn sm" id="ptimer-edit-plan">Edit plan</button>`;
          driveLabel.closest('.quiz-card')?.after(sum);
          sum.querySelector('#ptimer-edit-plan').onclick = () => {
            let n = sum.nextElementSibling;
            while (n) {
              n.hidden = false;
              n = n.nextElementSibling;
            }
          };
        }
        sum.hidden = false;
      } else {
        const sum = document.getElementById('ptimer-plan-summary');
        if (sum) sum.hidden = true;
      }
    };
    cb?.addEventListener('change', hidePlan);
    hidePlan();
  }
}

/* ── Timing ──────────────────────────────────────────────────── */
function setupTiming() {
  const sec = document.getElementById('sec-timing');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const explain = [...sec.querySelectorAll('p')].filter(p => p.closest('.section-head') || /perfect|threshold|early|late/i.test(p.textContent));
  explain.forEach(p => p.classList.add('drill-explain'));

  const setup = document.createElement('div');
  setup.id = 'timing-setup';
  const head = sec.querySelector('.section-head');
  if (head) head.after(setup);

  const bpm = document.getElementById('td-bpm') || sec.querySelector('input[type=number]');
  const refresh = () => {
    const c = getContext();
    renderSetupSummary(setup, [
      {
        key: 'bpm', value: `${bpm?.value || c.tempo} BPM`, hint: 'Tempo',
        onClick: () => {
          const details = sec.querySelector('details.adv-options') || bpm?.closest('.quiz-card');
          if (details?.tagName === 'DETAILS') details.open = true;
          bpm?.focus();
        },
      },
    ]);
  };
  refresh();
  wireDrillFocus('sec-timing', 'timing');
}

/* ── Tab Analyzer ────────────────────────────────────────────── */
function setupTabAnalyzer() {
  const sec = document.getElementById('sec-tabanalyzer');
  if (!sec) return;
  ensureBackButton(sec);
  sec.classList.add('has-setup-summary');

  const tabs = document.createElement('div');
  tabs.id = 'ta-tabs';
  const layout = sec.querySelector('.ta-layout');
  if (!layout) return;
  layout.parentNode.insertBefore(tabs, layout);

  const inputCol = sec.querySelector('.ta-input-col');
  const results = sec.querySelector('.ta-results');

  const setup = document.createElement('div');
  setup.id = 'ta-setup';
  if (inputCol) inputCol.insertBefore(setup, inputCol.firstChild);

  wrapAsSubview([inputCol].filter(Boolean), { id: 'input', forTabs: 'ta-tabs', active: true });
  wrapAsSubview([results].filter(Boolean), { id: 'analysis', forTabs: 'ta-tabs', active: false });

  // Hide tuning sidebar list on mobile — use picker
  const tunList = document.getElementById('sl-ta-tuning')?.closest('.sidebar-list');
  if (tunList) tunList.classList.add('ta-tuning-list');

  const controller = initSubviewTabs(tabs, [
    { id: 'input', label: 'Input' },
    { id: 'analysis', label: 'Analysis' },
  ], {
    settingsKey: 'subview.tabanalyzer',
    defaultId: 'input',
  });

  // Auto-switch to analysis after results populate
  if (results) {
    const obs = new MutationObserver(() => {
      if (results.querySelector('.ta-report, .ta-section, h3, .quiz-card:not(:only-child)')) {
        const muted = results.textContent.includes('Paste a tab and hit Analyze');
        if (!muted && results.children.length) {
          controller.setActive('analysis');
        }
      }
    });
    obs.observe(results, { childList: true, subtree: true });
  }

  // Edit input action in analysis
  const analysisPanel = document.querySelector('[data-subview="analysis"][data-subview-for="ta-tabs"]');
  if (analysisPanel && !document.getElementById('ta-edit-input')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ta-edit-input';
    btn.className = 'btn sm';
    btn.textContent = 'Edit Input';
    btn.style.marginBottom = '10px';
    btn.onclick = () => controller.setActive('input');
    analysisPanel.insertBefore(btn, analysisPanel.firstChild);
  }

  const refresh = () => {
    const tuning = getSetting('ta.tuning', document.querySelector('#sl-ta-tuning .sl-item.active')?.dataset.val || 'Standard');
    const track = document.querySelector('#sl-ta-track .sl-item.active')?.textContent?.trim();
    const fields = [
      {
        key: 'tuning', value: tuning, hint: 'Tuning',
        onClick: async () => {
          const next = await openTuningPicker({ value: tuning });
          if (next && next !== 'Custom') {
            const item = document.querySelector(`#sl-ta-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
            if (item) item.click();
            refresh();
          }
        },
      },
    ];
    if (track) {
      fields.push({
        key: 'track', value: track, hint: 'Track',
        onClick: () => openIoListPicker('Track', 'sl-ta-track', null),
      });
    }
    renderSetupSummary(setup, fields);
  };
  refresh();

  if (!document.getElementById('ta-mobile-style')) {
    const style = document.createElement('style');
    style.id = 'ta-mobile-style';
    style.textContent = `
      @media(max-width:768px){
        .ta-tuning-list{display:none}
        #ta-tabs{margin-bottom:10px}
        .ta-layout{display:block}
      }
    `;
    document.head.appendChild(style);
  }
}

/* ── Songwriting / Notes ─────────────────────────────────────── */
function setupMasterDetail(sectionId, listSel, editorSel) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  ensureBackButton(sec);
  const root = sec.querySelector('.sw-layout, .notes-layout, .md-layout') || sec;
  root.classList.add('mobile-master-detail', 'nav-list');

  const list = sec.querySelector(listSel);
  const editor = sec.querySelector(editorSel);
  if (list) list.classList.add('md-list');
  if (editor) editor.classList.add('md-editor');

  if (editor && !editor.querySelector('.md-back')) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'md-back';
    back.textContent = '← All items';
    back.onclick = () => setEditorNavState(root, 'list');
    editor.insertBefore(back, editor.firstChild);
  }

  // Enter editor when selecting an item
  sec.addEventListener('click', (e) => {
    const item = e.target.closest('.sw-item, .notes-item, .song-item, [data-song-id], [data-note-id]');
    if (item && !e.target.closest('.md-back')) setEditorNavState(root, 'editor');
  });

  // New button
  sec.querySelectorAll('button').forEach(btn => {
    if (/^new$/i.test(btn.textContent.trim()) || /new song|new note/i.test(btn.textContent)) {
      btn.addEventListener('click', () => setEditorNavState(root, 'editor'));
    }
  });
}

function setupSongwriter() {
  setupMasterDetail('sec-songwriter', '.sw-list, .songwriter-list, #sw-list', '.sw-editor, .songwriter-editor, #sw-editor');
  const sec = document.getElementById('sec-songwriter');
  if (!sec) return;
  // Collapsible recordings
  const rec = [...sec.querySelectorAll('details, .sw-recordings, [class*=record]')].find(el => /recording/i.test(el.textContent || ''));
  if (rec && rec.tagName !== 'DETAILS') {
    // leave as-is if already details
  }
  // Move delete to overflow if present
  const del = [...sec.querySelectorAll('button')].find(b => /^delete$/i.test(b.textContent.trim()));
  if (del && !document.getElementById('sw-overflow')) {
    del.hidden = true;
    const overflow = document.createElement('button');
    overflow.type = 'button';
    overflow.id = 'sw-overflow';
    overflow.className = 'options-trigger';
    overflow.textContent = '⋯';
    del.parentNode?.appendChild(overflow);
    overflow.onclick = (e) => {
      e.stopPropagation();
      openOverflowMenu(overflow, [
        {
          label: 'Delete',
          danger: true,
          onClick: () => {
            if (confirm('Delete this song?')) del.click();
          },
        },
      ]);
    };
  }
}

function setupNotes() {
  setupMasterDetail('sec-notes', '.notes-list, #notes-list', '.notes-editor, #notes-editor');
  const sec = document.getElementById('sec-notes');
  if (!sec) return;
  const del = [...sec.querySelectorAll('button')].find(b => /^delete$/i.test(b.textContent.trim()));
  if (del && !document.getElementById('notes-overflow')) {
    del.hidden = true;
    const overflow = document.createElement('button');
    overflow.type = 'button';
    overflow.id = 'notes-overflow';
    overflow.className = 'options-trigger';
    overflow.textContent = '⋯';
    del.parentNode?.appendChild(overflow);
    overflow.onclick = (e) => {
      e.stopPropagation();
      openOverflowMenu(overflow, [
        {
          label: 'Delete',
          danger: true,
          onClick: () => {
            if (confirm('Delete this note?')) del.click();
          },
        },
      ]);
    };
  }
}

/* ── Exercises ───────────────────────────────────────────────── */
function setupExercises() {
  const sec = document.getElementById('sec-exercises');
  if (!sec) return;
  ensureBackButton(sec);
  const catList = document.getElementById('ex-category-list');
  const sidebar = catList?.closest('.sidebar, .ex-sidebar, aside') || catList?.parentElement;
  if (!sidebar || document.getElementById('ex-folder-pick')) return;

  const bar = document.createElement('div');
  bar.id = 'ex-folder-bar';
  bar.className = 'setup-summary';
  bar.innerHTML = `<button type="button" class="setup-chip" id="ex-folder-pick"><span class="setup-chip-value" id="ex-folder-label">All Exercises</span><span class="setup-chip-hint">Folder</span></button>`;
  const head = sec.querySelector('.section-head');
  if (head) head.after(bar);

  if (!document.getElementById('ex-folder-style')) {
    const style = document.createElement('style');
    style.id = 'ex-folder-style';
    style.textContent = `
      @media(max-width:768px){
        #sec-exercises .ex-layout{display:flex;flex-direction:column}
        #sec-exercises #ex-category-list, #sec-exercises .ex-sidebar, #sec-exercises .sidebar{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  document.getElementById('ex-folder-pick').onclick = async () => {
    const items = [...(catList?.querySelectorAll('button, .sl-item, .ex-cat') || [])].map((el, i) => ({
      id: el.dataset.id || el.dataset.val || String(i),
      label: el.textContent.trim(),
      el,
    }));
    if (!items.length) return;
    const next = await openSelectionSheet({
      title: 'Folder',
      items: items.map(({ id, label }) => ({ id, label })),
      search: items.length > 6,
    });
    if (next != null) {
      const match = items.find(it => it.id === next);
      match?.el?.click();
      const label = document.getElementById('ex-folder-label');
      if (label && match) label.textContent = match.label;
    }
  };

  // Combine upload / add link
  const upload = document.getElementById('ex-upload') || [...sec.querySelectorAll('button,label')].find(b => /upload/i.test(b.textContent));
  const addLink = document.getElementById('ex-add-link') || [...sec.querySelectorAll('button')].find(b => /add link|link/i.test(b.textContent));
  if ((upload || addLink) && !document.getElementById('ex-add-primary')) {
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.id = 'ex-add-primary';
    primary.className = 'btn primary';
    primary.textContent = 'Add';
    primary.onclick = (e) => {
      openOverflowMenu(primary, [
        upload ? { label: 'Upload file', onClick: () => (upload.tagName === 'LABEL' ? document.getElementById(upload.htmlFor)?.click() : upload.click()) } : null,
        addLink ? { label: 'Add link', onClick: () => addLink.click() } : null,
      ].filter(Boolean));
    };
    bar.appendChild(primary);
    if (upload) upload.hidden = true;
    if (addLink) addLink.hidden = true;
  }
}

/* ── Keyboard / Recorder / Drums / Scales quiz ───────────────── */
function setupKeyboard() {
  const sec = document.getElementById('sec-keyboard');
  if (!sec) return;
  ensureBackButton(sec);
  const waveRow = sec.querySelector('.wave-btn')?.closest('.quiz-card, .kb-controls, div');
  // Compact setup strip
  const controls = sec.querySelector('.kb-top, .keyboard-controls') ||
    [...sec.children].find(el => el.querySelector?.('.wave-btn'));
  if (controls) controls.classList.add('kb-setup-strip');

  const stopBtn = [...sec.querySelectorAll('button')].find(b => /stop all/i.test(b.textContent));
  if (stopBtn) {
    const sync = () => {
      // Visibility managed lightly — show when drones exist via MutationObserver on drone UI
    };
    stopBtn.classList.add('kb-stop-all');
  }
}

function setupRecorder() {
  const sec = document.getElementById('sec-recorder');
  if (!sec) return;
  ensureBackButton(sec);
  const tabs = document.createElement('div');
  tabs.id = 'rec-tabs';
  const head = sec.querySelector('.section-head');
  if (head) head.after(tabs);

  const cards = [...sec.querySelectorAll(':scope > .quiz-card, :scope > .rec-card, .recorder-grid > .quiz-card')];
  // Fallback: group by known IDs
  const live = document.getElementById('rec-live-card') || sec.querySelector('.rec-live') || cards[0];
  const takes = document.getElementById('rec-takes')?.closest('.quiz-card') ||
    [...sec.querySelectorAll('.quiz-card')].find(c => /takes|previous/i.test(c.querySelector('h3, .field-label, .rec-section-label')?.textContent || ''));
  const analysis = document.getElementById('rec-analysis-card') ||
    [...sec.querySelectorAll('.quiz-card')].find(c => /analysis|pitch/i.test(c.querySelector('h3, .field-label')?.textContent || ''));

  if (live) wrapAsSubview([live], { id: 'record', forTabs: 'rec-tabs', active: true });
  if (takes) wrapAsSubview([takes], { id: 'takes', forTabs: 'rec-tabs', active: false });
  if (analysis) wrapAsSubview([analysis], { id: 'analysis', forTabs: 'rec-tabs', active: false });

  if (live || takes || analysis) {
    initSubviewTabs(tabs, [
      { id: 'record', label: 'Record' },
      ...(takes ? [{ id: 'takes', label: 'Takes' }] : []),
      ...(analysis ? [{ id: 'analysis', label: 'Analysis' }] : []),
    ], { settingsKey: 'subview.recorder', defaultId: 'record' });
  }
}

function setupDrums() {
  const sec = document.getElementById('sec-drums');
  if (!sec) return;
  ensureBackButton(sec);
  const subnav = sec.querySelector('.drums-subnav, .drum-tabs, [role=tablist]');
  if (subnav) {
    subnav.classList.add('subview-tabs');
    subnav.style.overflowX = 'auto';
  }
}

function setupScaleQuiz() {
  const sec = document.getElementById('sec-scales');
  if (!sec) return;
  ensureBackButton(sec);
  const compact = document.createElement('div');
  compact.id = 'scales-compact-progress';
  compact.className = 'compact-progress auto-hide';
  sec.querySelector('.progress-header')?.after(compact);
  wireDrillFocus('sec-scales', 'scale');
}

/* ── Drill focus helper ──────────────────────────────────────── */
function wireDrillFocus(sectionId, prefix) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  const nextBtns = [...sec.querySelectorAll('button')].filter(b =>
    /^(next|start|play|start training|start game)/i.test(b.textContent.trim()) ||
    /new-q-btn|Next/.test(b.className + b.textContent)
  );
  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setDrillFocus(sec, true);
      syncCompactProgress(sectionId, prefix);
    });
  });
  // Also watch score changes
  const ph = sec.querySelector('.progress-header');
  if (ph) {
    const obs = new MutationObserver(() => syncCompactProgress(sectionId, prefix));
    obs.observe(ph, { subtree: true, characterData: true, childList: true });
  }
}

function syncCompactProgress(sectionId, prefix) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  const compact = sec.querySelector('.compact-progress');
  if (!compact) return;
  const streak = sec.querySelector(`[id$="-streak"], #${prefix}-streak`)?.textContent;
  const right = sec.querySelector(`[id$="-right"], #${prefix}-right`)?.textContent;
  const total = sec.querySelector(`[id$="-total"], #${prefix}-total`)?.textContent;
  const scoreText = sec.querySelector('.ph-bar-count')?.textContent || '';
  let correct = Number(right) || 0;
  let tot = Number(total) || 0;
  const m = scoreText.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) { correct = Number(m[1]); tot = Number(m[2]); }
  const accEl = sec.querySelector('.ph-acc-val');
  const accuracy = accEl ? parseInt(accEl.textContent, 10) : null;
  renderCompactProgress(compact, {
    streak: Number(streak) || 0,
    correct,
    total: tot,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  });
}

/* ── Triads Reference ────────────────────────────────────────── */
function setupTriads() {
  const sec = document.getElementById('sec-triads');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);

  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const setup = document.createElement('div');
  setup.id = 'triads-setup';
  setup.className = 'mobile-setup-first';
  insertBefore(layout, setup, main);

  // Collapse fret opts into Options details
  const opts = sec.querySelector('.ref-fb-opts');
  if (opts && !document.getElementById('triad-fb-options-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'triad-fb-options-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    const body = document.createElement('div');
    const playBtn = opts.querySelector('#triad-fb-play');
    [...opts.querySelectorAll('.ref-fb-range, .ref-fb-check')].forEach(el => body.appendChild(el));
    details.appendChild(body);
    const fbCard = sec.querySelector('.ref-fb-card');
    if (fbCard) fbCard.insertBefore(details, document.getElementById('triad-map'));
    // Keep play button visible in the head
    if (playBtn && opts) opts.appendChild(playBtn);
  }

  refreshTriadsSetup();
  subscribeContext(() => refreshTriadsSetup());
  document.addEventListener('musi:triadref-change', () => refreshTriadsSetup());
}

function refreshTriadsSetup() {
  const el = document.getElementById('triads-setup');
  if (!el) return;
  const c = getContext();
  const tuning = getSetting('triadref.tuning', 'Standard');
  const stringSet = Number(getSetting('triadref.stringSet', NaN));
  const setLabel = (() => {
    const item = document.querySelector(`#sl-triad-stringset .sl-item.active`);
    return item ? item.querySelector('span')?.textContent || 'String set' : 'String set';
  })();
  void stringSet;

  const h2 = document.querySelector('#sec-triads .section-head h2');
  if (h2) h2.dataset.context = `${c.root} · ${tuning}`;

  renderSetupSummary(el, [
    {
      key: 'root', label: 'Root', value: c.root, hint: 'Root',
      onClick: async () => {
        const next = await openRootPicker({ value: c.root, source: 'triadref' });
        if (next) {
          const item = document.querySelector(`#sl-triad-root .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshTriadsSetup();
        }
      },
    },
    {
      key: 'stringset', label: 'Strings', value: setLabel, hint: 'String set',
      onClick: async () => {
        const items = [...document.querySelectorAll('#sl-triad-stringset .sl-item')].map(el => ({
          id: el.dataset.val,
          label: el.querySelector('span')?.textContent || el.dataset.val,
        }));
        if (!items.length) return;
        const current = document.querySelector('#sl-triad-stringset .sl-item.active')?.dataset.val;
        const next = await openSelectionSheet({
          title: 'String set',
          items,
          value: current,
        });
        if (next != null) {
          const item = document.querySelector(`#sl-triad-stringset .sl-item[data-val="${CSS.escape(String(next))}"]`);
          if (item) item.click();
          refreshTriadsSetup();
        }
      },
    },
    {
      key: 'tuning', label: 'Tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning });
        if (next && next !== 'Custom') {
          saveSetting('triadref.tuning', next);
          const item = document.querySelector(`#sl-triad-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
          if (item) item.click();
          refreshTriadsSetup();
        }
      },
    },
  ]);
}

/* ── Generic back buttons for remaining tools ────────────────── */
function ensureAllBackButtons() {
  document.querySelectorAll('.section[id^="sec-"]').forEach(sec => {
    if (sec.id === 'sec-home' || sec.id.startsWith('sec-hub-')) return;
    ensureBackButton(sec);
  });
}

export function initScreenUx(config = {}) {
  showSectionFn = config.showSection;
  setupScaleQuiz();
  setupScaleRef();
  setupChords();
  setupTriads();
  setupIntervalOrbit();
  setupPitch();
  setupFretboard();
  setupEar();
  setupIntervalsAndSight();
  setupChordWorkout();
  setupMetronome();
  setupPracticeTimer();
  setupTiming();
  setupTabAnalyzer();
  setupSongwriter();
  setupNotes();
  setupExercises();
  setupKeyboard();
  setupRecorder();
  setupDrums();
  ensureAllBackButtons();

  // Quick scales on scale ref when context changes
  subscribeContext(() => {
    refreshScaleRefSetup();
    refreshChordsSetup();
    refreshTriadsSetup();
  });
}
