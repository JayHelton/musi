// Screen-level UX restructuring: setup summaries, subviews, focus mode,
// and picker wiring. Preserves existing element IDs so domain modules keep working.
import { getSetting, saveSetting } from './persistence.js';
import { getContext, subscribeContext } from './musicalContext.js';
import { shortScaleName } from './scales.js';
import { TUNINGS } from './theory.js';
import { resolveTuningKey } from './tunings.js';
import { CHORDS } from './chords.js';
import {
  openRootPicker, openScalePicker, openChordPicker, openTuningPicker,
  formatChordLabel, getQuickScales, cycleEnharmonicPref, getEnharmonicPref,
} from './pickers.js';
import { stepChord, applyChordRefSelection } from './chordReference.js';
import { applyScaleRefSelection } from './scaleReference.js';
import { applyTriadRefSelection, setTriadViewMode, TRIAD_VIEW_MODES } from './triadReference.js';
import { openSelectionSheet, closeSelectionSheet } from './selectionSheet.js';
import {
  renderSetupSummary, initSubviewTabs, renderCompactProgress, infoTipFromElement,
  openOverflowMenu, renderFilterSummary, setEditorNavState, setDrillFocus,
} from './uxPrimitives.js';

let showSectionFn = null;

const MOBILE_UX_MQ = '(max-width: 768px), (orientation: landscape) and (max-height: 500px)';
const LANDSCAPE_PHONE_MQ = '(orientation: landscape) and (max-height: 500px)';

const SETUP_SHEET_BASE = `
  display:none;position:fixed;z-index:480;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--card);border:1px solid var(--border);width:auto!important;
`;
const SETUP_SHEET_PORTRAIT = `
  left:0;right:0;bottom:0;max-height:80vh;border-radius:18px 18px 0 0;padding:16px;
`;
const SETUP_SHEET_LANDSCAPE = `
  top:8px;right:max(8px,env(safe-area-inset-right,0px));
  bottom:calc(var(--dock-h,46px) + 8px);left:auto;
  width:min(360px,48vw);max-height:calc(100dvh - var(--dock-h,46px) - 16px);
  border-radius:14px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,0.45);
`;

function ensureBackButton(section) {
  if (!section) return;
  if (section.dataset.toolPage === '1' || section.querySelector('.tool-page')) return;
  if (section.id === 'sec-scaleref' || section.id === 'sec-metronome') return;
  if (section.querySelector('.tool-back')) return;
  const head = section.querySelector('.section-head');
  if (!head) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-back';
  btn.textContent = '← Back';
  head.insertBefore(btn, head.firstChild);
}

/** Host + inner wrapper so renderSetupSummary innerHTML does not wipe the back button. */
function createSetupToolbar(id, extraClass = 'mobile-setup-first') {
  const host = document.createElement('div');
  host.id = id;
  host.className = ['setup-toolbar', extraClass].filter(Boolean).join(' ');
  const inner = document.createElement('div');
  inner.className = 'setup-summary-inner';
  host.appendChild(inner);
  return { host, inner };
}

function getSetupSummaryTarget(hostOrId) {
  const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
  if (!host) return null;
  return host.querySelector('.setup-summary-inner') || host;
}

/** In landscape, park the back button on the setup row; restore to section-head in portrait. */
export function syncSetupToolbars() {
  const landscape = window.matchMedia(LANDSCAPE_PHONE_MQ).matches;
  document.querySelectorAll('.setup-toolbar').forEach((host) => {
    const section = host.closest('.section');
    if (!section) return;
    if (section.dataset.toolPage === '1' || section.querySelector('.tool-page')) return;
    const back = section.querySelector('.tool-back:not(.tool-page-back)');
    const inner = host.querySelector('.setup-summary-inner');
    const head = section.querySelector('.section-head');
    if (!back || !inner) return;
    if (landscape) {
      if (back.parentElement !== host) host.insertBefore(back, inner);
    } else if (head && back.parentElement !== head) {
      head.insertBefore(back, head.firstChild);
    }
  });
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

  const { host: setup } = createSetupToolbar('scaleref-setup');
  insertBefore(layout, setup, main);

  const tabs = document.createElement('div');
  tabs.id = 'scaleref-tabs';
  insertBefore(main, tabs, main.firstChild);

  const fbCard = document.getElementById('ref-fb-card');
  const infoCard = document.getElementById('ref-card');
  const modes = document.getElementById('ref-modes');

  // Neck view and the interval/chord breakdown are long enough on their own, so
  // each gets the full column behind a pill instead of stacking in one scroll.
  // The 3-NPS mode shapes live outside .quiz-main but belong to the fretboard
  // pill, so they get their own panel under the same tab id.
  if (fbCard) wrapAsSubview([fbCard], { id: 'fretboard', forTabs: 'scaleref-tabs', active: true });
  if (modes) wrapAsSubview([modes], { id: 'fretboard', forTabs: 'scaleref-tabs', active: true });
  const ivMapCard = document.getElementById('ref-ivmap-card');
  // The Interval Map leads the tab and the scale table follows it, because the
  // map is the thing the player works with and the table is the reference.
  if (ivMapCard) wrapAsSubview([ivMapCard], { id: 'intervals', forTabs: 'scaleref-tabs', active: false });
  if (infoCard) wrapAsSubview([infoCard], { id: 'intervals', forTabs: 'scaleref-tabs', active: false });

  initSubviewTabs(tabs, [
    { id: 'fretboard', label: 'Fretboard' },
    { id: 'intervals', label: 'Intervals' },
  ], {
    settingsKey: 'subview.scalerefview',
    defaultId: 'fretboard',
  });

  // Move fret opts into details
  const opts = fbCard?.querySelector('.ref-fb-opts');
  if (opts && !document.getElementById('ref-fb-options-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'ref-fb-options-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    const body = document.createElement('div');
    [...opts.querySelectorAll('.ref-fb-range, .ref-fb-check')].forEach(el => body.appendChild(el));
    details.appendChild(body);
    if (fbCard) fbCard.insertBefore(details, fbCard.querySelector('.ref-fb-scroll'));
  }

  subscribeContext(() => refreshScaleRefSetup());
  refreshScaleRefSetup();
}

function refreshScaleRefSetup() {
  const el = getSetupSummaryTarget('scaleref-setup');
  if (!el) return;
  const ctx = getContext();
  // The tuning is part of the shared context, like the root and the scale.
  const tuning = resolveTuningKey(ctx.tuning);

  renderSetupSummary(el, [
    {
      key: 'root',
      label: 'Root',
      value: ctx.root,
      hint: 'Root',
      onClick: async () => {
        const next = await openRootPicker({
          value: ctx.root,
          source: 'scaleref',
          syncContext: false,
        });
        if (next) {
          applyScaleRefSelection({ root: next });
          refreshScaleRefSetup();
        }
      },
    },
    {
      key: 'scale',
      label: 'Scale',
      value: shortScaleName(ctx.scale),
      hint: 'Scale',
      onClick: async () => {
        const next = await openScalePicker({
          value: ctx.scale,
          source: 'scaleref',
          syncContext: false,
        });
        if (next) {
          applyScaleRefSelection({ scale: next });
          refreshScaleRefSetup();
        }
      },
    },
    {
      key: 'tuning',
      label: 'Tuning',
      value: tuning,
      hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({
          value: tuning,
          source: 'scaleref',
          syncContext: false,
        });
        if (next && next !== 'Custom') {
          applyScaleRefSelection({ tuning: next });
          refreshScaleRefSetup();
        }
      },
    },
  ]);
}

function wireTriadSweepNav() {
  document.getElementById('triad-sweep-prev-pat')?.addEventListener('click', () => {
    const btns = [...document.querySelectorAll('#triad-sweep-controls [data-sweep-pattern]')];
    const i = btns.findIndex(b => b.classList.contains('active'));
    if (i < 0 || !btns.length) return;
    btns[(i - 1 + btns.length) % btns.length].click();
  });
  document.getElementById('triad-sweep-next-pat')?.addEventListener('click', () => {
    const btns = [...document.querySelectorAll('#triad-sweep-controls [data-sweep-pattern]')];
    const i = btns.findIndex(b => b.classList.contains('active'));
    if (i < 0 || !btns.length) return;
    btns[(i + 1) % btns.length].click();
  });
  document.getElementById('triad-sweep-prev-inv')?.addEventListener('click', () => {
    document.querySelector('#triad-sweep-controls [data-sweep-inv-dir="-1"]')?.click();
  });
  document.getElementById('triad-sweep-next-inv')?.addEventListener('click', () => {
    document.querySelector('#triad-sweep-controls [data-sweep-inv-dir="1"]')?.click();
  });
}

/* ── Chords ──────────────────────────────────────────────────── */
function setupChords() {
  const sec = document.getElementById('sec-chordref');
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

  const { host: setup } = createSetupToolbar('chords-setup', '');
  if (layout) layout.parentNode.insertBefore(setup, layout);

  const mapEls = [layout];
  const mcc = document.getElementById('mcc-block');
  const caged = document.getElementById('caged-block');
  // The in-key panel starts above the layout in the markup. Move it below the
  // tab row first, or its subview panel draws above the tabs that control it.
  const inkey = document.getElementById('inkey-block');
  if (inkey && layout) layout.parentNode.insertBefore(inkey, layout);

  wrapAsSubview(mapEls.filter(Boolean), { id: 'map', forTabs: 'chords-tabs', active: true });
  if (inkey) wrapAsSubview([inkey], { id: 'inkey', forTabs: 'chords-tabs', active: false });
  if (mcc) wrapAsSubview([mcc], { id: 'cards', forTabs: 'chords-tabs', active: false });
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
    { id: 'inkey', label: 'In key' },
    { id: 'cards', label: 'Cards' },
    { id: 'caged', label: 'CAGED' },
  ], {
    settingsKey: 'subview.chords',
    defaultId: 'map',
    onChange: () => refreshChordsSetup(),
  });

  // Move fret opts into Options for map
  const chordOpts = document.querySelector('#sec-chordref .ref-fb-opts');
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
  const el = getSetupSummaryTarget('chords-setup');
  if (!el) return;
  const c = getContext();
  const chord = getSetting('chordref.chord', 'Major');
  const tuning = resolveTuningKey(c.tuning);
  const title = formatChordLabel(c.root, chord);
  // Update section context line
  const h2 = document.querySelector('#sec-chordref .section-head h2');
  if (h2) h2.dataset.context = `${title} · ${tuning}`;

  renderSetupSummary(el, [
    {
      key: 'root', label: 'Root', value: c.root, hint: 'Root',
      onClick: async () => {
        const next = await openRootPicker({ value: c.root, source: 'chordref', syncContext: false });
        if (next) {
          applyChordRefSelection({ root: next });
          refreshChordsSetup();
        }
      },
    },
    {
      key: 'chord', label: 'Quality', value: CHORDS[chord] ? (chord) : chord, hint: 'Quality',
      onClick: async () => {
        const next = await openChordPicker({ value: chord });
        if (next) {
          applyChordRefSelection({ chord: next });
          refreshChordsSetup();
        }
      },
    },
    {
      key: 'tuning', label: 'Tuning', value: tuning, hint: 'Tuning',
      onClick: async () => {
        const next = await openTuningPicker({ value: tuning, syncContext: false });
        if (next && next !== 'Custom') {
          applyChordRefSelection({ tuning: next });
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
    @media ${MOBILE_UX_MQ}{
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


/* ── Pitch ───────────────────────────────────────────────────── */
function setupPitch() {
  const sec = document.getElementById('sec-pitchear');
  if (!sec) return;
  const center = sec.querySelector('.tuner-center');
  if (!center) return;
  if (center.dataset.uxModes === '1') return;
  center.dataset.uxModes = '1';

  // The shared tool-page shell owns the mode bar. Its container id is fixed by
  // js/shell/toolPage.js, so the panels point at it directly.
  const forTabs = 'tool-page-modes-pitchear';
  const cards = [...center.querySelectorAll(':scope > .quiz-card')];
  // Expected order: tuner, reference tone, pitch match, pitch runner.
  const names = ['tuner', 'tone', 'match', 'runner'];
  cards.forEach((card, i) => {
    wrapAsSubview([card], { id: names[i] || `p${i}`, forTabs, active: i === 0 });
  });

  const earPane = center.querySelector(':scope > .ear-pane');
  if (earPane) wrapAsSubview([earPane], { id: 'ear', forTabs, active: false });

  // Move trainer/runner configs into options details
  collapsePitchControls();

  // The runner explains itself in one long paragraph. The info tip holds it,
  // so the game starts at the top of the card.
  const intro = sec.querySelector('.pr-intro');
  const introLabel = intro?.previousElementSibling?.classList?.contains('field-label')
    ? intro.previousElementSibling
    : null;
  infoTipFromElement(intro, { mount: introLabel || undefined, label: 'How the Pitch Runner works' });

  wireDrillFocus('sec-pitchear', 'pt');
}

function collapsePitchControls() {
  // Trainer controls
  const ptControls = document.querySelectorAll('#sec-pitchear .pt-controls, #sec-pitchear .pr-toggles');
  const trainerCard = document.querySelector('[data-subview="match"] .quiz-card') ||
    [...document.querySelectorAll('#sec-pitchear .quiz-card')].find(c => c.querySelector('#pt-toggle'));
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
  const refCard = document.querySelector('[data-subview="tone"] .quiz-card');
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



function setupEar() {
  const pane = document.querySelector('#sec-pitchear .ear-pane');
  if (!pane) return;
  if (pane.dataset.uxWired === '1') return;
  pane.dataset.uxWired = '1';
  pane.classList.add('has-setup-summary');
  const layout = pane.querySelector('.quiz-layout');
  const main = pane.querySelector('.quiz-main');
  if (!layout || !main) return;

  const { host: setup, inner } = createSetupToolbar('ear-setup');
  insertBefore(layout, setup, main);

  // Sidebar becomes setup sheet content
  const sidebar = pane.querySelector('.sidebar');
  renderSetupSummary(inner, [
    {
      key: 'setup', value: 'Ear setup', hint: 'Change',
      onClick: () => openEarSetupSheet(sidebar),
    },
  ]);

  const compact = document.createElement('div');
  compact.id = 'ear-compact-progress';
  compact.className = 'compact-progress auto-hide';
  main.querySelector('.progress-header')?.after(compact);
  refreshEarSetupSummary();
}

function refreshEarSetupSummary() {
  const el = getSetupSummaryTarget('ear-setup');
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
      onClick: () => openEarSetupSheet(document.querySelector('#sec-pitchear .ear-pane .sidebar')),
    },
  ]);
}

function openEarSetupSheet(sidebar) {
  if (!sidebar) return;
  // The sidebar doubles as a bottom sheet on a phone.
  sidebar.classList.add('mobile-setup-sheet');
  sidebar.classList.toggle('open');
  if (!document.getElementById('ear-setup-sheet-style')) {
    const style = document.createElement('style');
    style.id = 'ear-setup-sheet-style';
    style.textContent = `
      @media ${MOBILE_UX_MQ}{
        .ear-pane.has-setup-summary .sidebar.mobile-setup-sheet{
          ${SETUP_SHEET_BASE}
        }
        .ear-pane.has-setup-summary .sidebar.mobile-setup-sheet.open{display:block}
      }
      @media (max-width:768px){
        .ear-pane.has-setup-summary .sidebar.mobile-setup-sheet{${SETUP_SHEET_PORTRAIT}}
      }
      @media ${LANDSCAPE_PHONE_MQ}{
        .ear-pane.has-setup-summary .sidebar.mobile-setup-sheet{${SETUP_SHEET_LANDSCAPE}}
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
    const { host: setup, inner } = createSetupToolbar(id.replace('sec-', '') + '-setup');
    insertBefore(layout, setup, main);

    const refresh = () => {
      const bits = [...(sidebar?.querySelectorAll('.sl-item.active') || [])].map(el => el.textContent.trim());
      renderSetupSummary(inner, [{
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
      @media ${MOBILE_UX_MQ}{
        .section.has-setup-summary .sidebar.mobile-setup-sheet{
          ${SETUP_SHEET_BASE}
        }
        .section.has-setup-summary .sidebar.mobile-setup-sheet.open{display:block}
        .section.has-setup-summary:has(.sidebar.mobile-setup-sheet.open){transform:none!important}
      }
      @media (max-width:768px){
        .section.has-setup-summary .sidebar.mobile-setup-sheet{${SETUP_SHEET_PORTRAIT}}
      }
      @media ${LANDSCAPE_PHONE_MQ}{
        .section.has-setup-summary .sidebar.mobile-setup-sheet{${SETUP_SHEET_LANDSCAPE}}
      }
    `;
    document.head.appendChild(style);
  }
}

function setupChordWorkout() {
  const sec = document.getElementById('sec-chordworkout');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);
  const { host: setup, inner } = createSetupToolbar('cw-setup', '');
  const head = sec.querySelector('.section-head');
  if (head) head.after(setup);

  const refresh = () => {
    const tuning = getSetting('cw.tuning', document.querySelector('#sl-cw-tuning .sl-item.active')?.dataset.val || 'Standard');
    renderSetupSummary(inner, [{
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

  wireDrillFocus('sec-chordworkout', 'cw');
}

/* ── Metronome ───────────────────────────────────────────────── */
function setupMetronome() {
  const sec = document.getElementById('sec-metronome');
  if (!sec) return;

  // The shared tool-page shell owns the mode bar. The click controls sit in
  // one mode, the tempo plan in the other.
  const simple = sec.querySelector('.metronome-simple');
  if (simple && simple.dataset.uxModes !== '1') {
    simple.dataset.uxModes = '1';
    const forTabs = 'tool-page-modes-metronome';
    const cards = [...simple.querySelectorAll(':scope > .quiz-card')];
    const phases = simple.querySelector('#m-phases-card');
    const clickCards = cards.filter(card => card !== phases);
    if (clickCards.length) {
      wrapAsSubview(clickCards, { id: 'metronome', forTabs, active: true });
    }
    if (phases) wrapAsSubview([phases], { id: 'plan', forTabs, active: false });
  }

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

  // Reduce quick tempo buttons — keep the 20 BPM ladder from 80 up to 240
  const presets = sec.querySelector('.metro-preset-row');
  if (presets && !presets.dataset.uxTrimmed) {
    presets.dataset.uxTrimmed = '1';
    const keep = new Set(['80', '100', '120', '140', '160', '180', '200', '220', '240']);
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

  // The tempo plan is the plan editor. It used to open on a summary row with a
  // Configure button, which put one extra tap in front of every edit.
  const phasesCard = document.getElementById('m-phases-card');
  if (phasesCard && !phasesCard.dataset.uxWired) {
    phasesCard.dataset.uxWired = '1';
    phasesCard.classList.add('phases-editing');
    // Older sessions could leave the summary row and hidden children behind.
    phasesCard.querySelector('.phases-collapsed-row')?.remove();
    [...phasesCard.children].forEach(ch => { ch.hidden = false; });
  }
}



/* ── Songwriting / Notes ─────────────────────────────────────── */
function setupMasterDetail(sectionId, listSel, editorSel, itemSel) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  ensureBackButton(sec);
  const root = sec.querySelector('.sw-layout, .notes-layout, .md-layout') || sec;
  root.classList.add('mobile-master-detail', 'nav-list');

  const listAside = sec.querySelector('.sw-sidebar, .notes-sidebar');
  const list = listAside || sec.querySelector(listSel);
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
    if (e.target.closest('.md-back')) return;
    const legacy = e.target.closest('.sw-item, .notes-item, .song-item, [data-song-id], [data-note-id]');
    const item = legacy || (itemSel ? e.target.closest(itemSel) : null);
    if (item && list?.contains(item)) setEditorNavState(root, 'editor');
  });

  // New button
  sec.querySelectorAll('button').forEach(btn => {
    if (/^\+?\s*new\b/i.test(btn.textContent.trim()) || /new song|new note/i.test(btn.textContent)) {
      btn.addEventListener('click', () => setEditorNavState(root, 'editor'));
    }
  });
}

function setupSongwriter() {
  setupMasterDetail('sec-songstudio', '.sw-list, .songwriter-list, #sw-list', '.sw-editor, .songwriter-editor, #sw-editor', '.sw-list-item');
  const sec = document.getElementById('sec-songstudio');
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
  setupMasterDetail('sec-notes', '.notes-list, #notes-list', '.notes-editor, #notes-editor', '.notes-list-item');
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
  // The library browser carries its own navigation: a breadcrumb, folder rows,
  // and a "+ New" menu. A phone hides the folder tree and uses those instead,
  // so no extra mobile chrome goes here.
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
  const sec = document.getElementById('sec-audiostudio');
  if (!sec) return;
  const center = sec.querySelector('.recorder-center');
  if (!center) return;
  if (center.dataset.uxModes === '1') return;
  center.dataset.uxModes = '1';

  // Each card of the Audio Studio opened on a paragraph of help. An info tip
  // next to the title of the card holds that text now.
  tipifyCardHelp(sec, '.rec-idea-help', 'How the idea reads your take');
  tipifyCardHelp(sec, '.asr-empty-text', 'How the Pitch Runner tab works');
  tipifyCardHelp(sec, '.tts-drop-sub', 'What files the stem import reads');

  // The shared tool-page shell owns the mode bar. The Record tab holds the
  // take and the idea it reads; the Import tab holds the stem import.
  const forTabs = 'tool-page-modes-audiostudio';
  const cards = [...center.querySelectorAll(':scope > .quiz-card')];
  const runnerCard = document.getElementById('as-runner-card');
  const ttsPane = center.querySelector(':scope > .tts-pane');
  const captureCards = cards.filter(card => card !== runnerCard);

  if (captureCards.length) {
    wrapAsSubview(captureCards, { id: 'capture', forTabs, active: true });
  }
  if (ttsPane) wrapAsSubview([ttsPane], { id: 'transcribe', forTabs, active: false });
  if (runnerCard) wrapAsSubview([runnerCard], { id: 'run', forTabs, active: false });
}

/**
 * Move one help paragraph of a card into an info tip.
 *
 * The button lands next to the title of the card, or where the paragraph sat
 * when the card carries no title.
 *
 * @param {HTMLElement} root the section that holds the card
 * @param {string} selector the help paragraph
 * @param {string} label the name of the help, for a screen reader
 */
function tipifyCardHelp(root, selector, label) {
  const help = root?.querySelector(selector);
  if (!help) return;
  const card = help.closest('.quiz-card, .tts-drop, .asr-card, .gpp-drop, .m-phases');
  const title = card?.querySelector(
    '.rec-card-title, .tts-drop-title, .gpp-drop-title, .metro-card-title');
  infoTipFromElement(help, { mount: title || undefined, label });
}

/**
 * Move the help paragraph of a section head into an info tip.
 *
 * A tool page hides its own section head and shows its description through the
 * header tip. A page that keeps its own chrome, such as Exercises, needs this
 * instead.
 *
 * @param {string} sectionId the DOM id of the section
 */
function tipifySectionHead(sectionId) {
  const head = document.getElementById(sectionId)?.querySelector('.section-head');
  if (!head || head.dataset.uxTip === '1') return;
  const help = head.querySelector('p');
  const title = head.querySelector('h1, h2');
  if (!help || !title) return;
  head.dataset.uxTip = '1';
  infoTipFromElement(help, { mount: title, label: `About ${title.textContent.trim()}` });
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
let triadsRefTabsApi = null;

/* ── Chord Finder ────────────────────────────────────────────── */
function setupChordFinder() {
  const sec = document.getElementById('sec-chordfinder');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);

  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const { host: setup } = createSetupToolbar('chordfinder-setup');
  insertBefore(layout, setup, main);
  refreshChordFinderSetup();
}

/** The tuning chip that replaces the sidebar on a phone. */
function refreshChordFinderSetup() {
  const el = getSetupSummaryTarget('chordfinder-setup');
  if (!el) return;
  const tuning = resolveTuningKey(getContext().tuning);

  renderSetupSummary(el, [{
    key: 'tuning',
    label: 'Tuning',
    value: tuning,
    hint: 'Tuning',
    onClick: async () => {
      const next = await openTuningPicker({
        value: tuning,
        source: 'chordfinder',
        syncContext: false,
      });
      if (!next || next === 'Custom') return;
      // Click the sidebar row so the finder keeps one path for a tuning change.
      const item = document.querySelector(`#sl-cf-tuning .sl-item[data-val="${CSS.escape(next)}"]`);
      if (item) item.click();
      refreshChordFinderSetup();
    },
  }]);
}

function setupTriads() {
  const sec = document.getElementById('sec-triads');
  if (!sec) return;
  sec.classList.add('has-setup-summary');
  ensureBackButton(sec);

  const layout = sec.querySelector('.quiz-layout');
  const main = sec.querySelector('.quiz-main');
  if (!layout || !main) return;

  const { host: setup } = createSetupToolbar('triads-setup');
  insertBefore(layout, setup, main);

  const tabs = document.createElement('div');
  tabs.id = 'triadsref-tabs';
  insertBefore(main, tabs, main.firstChild);

  const fbCard = sec.querySelector('.ref-fb-card');
  const infoCard = document.getElementById('triad-info-card');
  const triadMap = document.getElementById('triad-map');
  const sweepPanel = document.getElementById('triad-sweep-panel');
  const inKeyPanel = document.getElementById('triad-inkey-panel');
  const sweepControls = document.getElementById('triad-sweep-controls');
  const triadOnlyOpts = document.getElementById('triad-only-opts');
  const stringSetSidebar = document.getElementById('triad-stringset-sidebar');

  // Collapse fret opts into Options details
  const opts = sec.querySelector('.ref-fb-opts');
  if (opts && !document.getElementById('triad-fb-options-details')) {
    const details = document.createElement('details');
    details.className = 'adv-options';
    details.id = 'triad-fb-options-details';
    details.innerHTML = `<summary><span class="adv-gear">⚙</span> Options</summary>`;
    const body = document.createElement('div');
    const playBtn = opts.querySelector('#triad-fb-play');
    const viewPicker = opts.querySelector('#triad-view-picker');
    if (viewPicker) viewPicker.style.display = 'none';
    if (triadOnlyOpts) body.appendChild(triadOnlyOpts);
    details.appendChild(body);
    if (fbCard) fbCard.insertBefore(details, triadMap || sweepPanel);
    if (playBtn && opts) opts.appendChild(playBtn);
  }

  if (sweepControls && !document.getElementById('triad-sweep-nav')) {
    const nav = document.createElement('div');
    nav.id = 'triad-sweep-nav';
    nav.className = 'setup-summary-fields';
    nav.style.marginBottom = '10px';
    nav.hidden = true;
    nav.innerHTML = `
      <button type="button" class="btn sm" id="triad-sweep-prev-pat" aria-label="Previous pattern">← Pattern</button>
      <button type="button" class="btn sm" id="triad-sweep-next-pat" aria-label="Next pattern">Pattern →</button>
      <button type="button" class="btn sm" id="triad-sweep-prev-inv" aria-label="Previous inversion">← Inv</button>
      <button type="button" class="btn sm" id="triad-sweep-next-inv" aria-label="Next inversion">Inv →</button>
    `;
    sweepControls.parentNode.insertBefore(nav, sweepControls);
  }

  // Triads/Sweeps share the same cards — toggle inner panels only (do not wrap
  // fbCard in a subview panel or the Sweeps mobile tab hides the whole fretboard).
  function syncTriadSubviewVisibility(tabId) {
    const isSweep = tabId === 'sweeps';
    const isInKey = tabId === 'inkey';
    const isShapes = !isSweep && !isInKey;
    if (triadMap) triadMap.hidden = !isShapes;
    if (sweepPanel) sweepPanel.hidden = !isSweep;
    if (inKeyPanel) inKeyPanel.hidden = !isInKey;
    if (triadOnlyOpts) triadOnlyOpts.hidden = !isShapes;
    if (stringSetSidebar) stringSetSidebar.hidden = !isShapes;
    const nav = document.getElementById('triad-sweep-nav');
    if (nav) nav.hidden = !isSweep;
  }

  const legacySubview = getSetting('subview.scaleref', null);
  const legacyView = getSetting('ref.viewMode', null, ['scale', 'sweep']);
  let initialSubview = getSetting('subview.triadsref', null);
  if (!initialSubview && (legacySubview === 'sweeps' || legacyView === 'sweep')) {
    initialSubview = 'sweeps';
    saveSetting('subview.triadsref', 'sweeps');
    if (!getSetting('triadref.viewMode', null, ['triads', 'sweep'])) {
      saveSetting('triadref.viewMode', 'sweep');
    }
  }
  initialSubview = initialSubview || 'triads';

  const TAB_VIEW_MODES = { triads: 'triads', sweeps: 'sweep', inkey: 'inkey' };

  triadsRefTabsApi = initSubviewTabs(tabs, [
    { id: 'triads', label: 'Triads' },
    { id: 'sweeps', label: 'Sweeps' },
    { id: 'inkey', label: 'In key' },
  ], {
    settingsKey: 'subview.triadsref',
    defaultId: initialSubview,
    onChange: (id) => {
      syncTriadSubviewVisibility(id);
      setTriadViewMode(TAB_VIEW_MODES[id] || 'triads');
      refreshTriadsSetup();
    },
  });

  // The Scale Reference sends the player here for the chords of the key.
  document.addEventListener('musi:open-triads-inkey', () => {
    triadsRefTabsApi?.setActive('inkey');
  });

  syncTriadSubviewVisibility(triadsRefTabsApi.active);

  wireTriadSweepNav();
  refreshTriadsSetup();
  subscribeContext(() => refreshTriadsSetup());
  document.addEventListener('musi:triadref-change', (e) => {
    const viewMode = e.detail?.viewMode;
    if (viewMode) {
      const tabId = { sweep: 'sweeps', inkey: 'inkey' }[viewMode] || 'triads';
      triadsRefTabsApi?.setActive(tabId, { silent: true });
      syncTriadSubviewVisibility(tabId);
    }
    refreshTriadsSetup();
  });
}

function refreshTriadsSetup() {
  const el = getSetupSummaryTarget('triads-setup');
  if (!el) return;
  const c = getContext();
  const tuning = resolveTuningKey(c.tuning);
  const viewMode = getSetting('triadref.viewMode', 'triads', TRIAD_VIEW_MODES);
  const stringSet = Number(getSetting('triadref.stringSet', NaN));
  const setLabel = (() => {
    const item = document.querySelector(`#sl-triad-stringset .sl-item.active`);
    return item ? item.querySelector('span')?.textContent || 'String set' : 'String set';
  })();
  void stringSet;

  const h2 = document.querySelector('#sec-triads .section-head h2');
  if (h2) h2.dataset.context = `${c.root} · ${tuning}`;

  const fields = [
    {
      key: 'root', label: 'Root', value: c.root, hint: 'Root',
      onClick: async () => {
        const next = await openRootPicker({ value: c.root, source: 'triadref', syncContext: false });
        if (next) {
          applyTriadRefSelection({ root: next });
          refreshTriadsSetup();
        }
      },
    },
  ];

  // The chords of a key come from the root and the scale. Neither the string
  // set nor the tuning changes them, so the scale takes their place there.
  if (viewMode === 'inkey') {
    fields.push({
      key: 'scale', label: 'Scale', value: shortScaleName(c.scale), hint: 'Scale',
      onClick: async () => {
        const next = await openScalePicker({ value: c.scale, source: 'triadref' });
        if (next) refreshTriadsSetup();
      },
    });
    renderSetupSummary(el, fields);
    return;
  }

  if (viewMode !== 'sweep') {
    fields.push({
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
          applyTriadRefSelection({ stringSet: next });
          refreshTriadsSetup();
        }
      },
    });
  }

  fields.push({
    key: 'tuning', label: 'Tuning', value: tuning, hint: viewMode === 'sweep' ? 'Ignored for sweeps' : 'Tuning',
    onClick: async () => {
      const next = await openTuningPicker({ value: tuning, syncContext: false });
      if (next && next !== 'Custom') {
        applyTriadRefSelection({ tuning: next });
        refreshTriadsSetup();
      }
    },
  });

  renderSetupSummary(el, fields);
}

/* ── Generic back buttons for remaining tools ────────────────── */
function ensureAllBackButtons() {
  document.querySelectorAll('.section[id^="sec-"]').forEach(sec => {
    if (sec.classList.contains('area-section')) return;
    ensureBackButton(sec);
  });
}

export function initScreenUx(config = {}) {
  showSectionFn = config.showSection;
  setupScaleRef();
  setupChords();
  setupTriads();
  setupChordFinder();
  setupPitch();
  setupEar();
  setupIntervalsAndSight();
  setupChordWorkout();
  setupMetronome();
  setupSongwriter();
  setupNotes();
  setupExercises();
  setupKeyboard();
  setupRecorder();
  // These pages keep their own chrome, so the shared tool page never moves
  // their help text. The section head carries the info tip instead.
  ['sec-exercises', 'sec-workbooks', 'sec-scoreplayer'].forEach(tipifySectionHead);
  tipifyCardHelp(document.getElementById('sec-scoreplayer'), '.gpp-drop-sub',
    'What the Score Player reads');
  tipifyCardHelp(document.getElementById('sec-metronome'), '.m-phases-note',
    'What a practice phase does');
  ensureAllBackButtons();
  syncSetupToolbars();
  window.matchMedia(LANDSCAPE_PHONE_MQ).addEventListener('change', syncSetupToolbars);

  // Quick scales on scale ref when context changes
  subscribeContext(() => {
    refreshScaleRefSetup();
    refreshChordsSetup();
    refreshTriadsSetup();
    refreshChordFinderSetup();
  });
}
