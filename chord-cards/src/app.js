import { SHAPES } from '../data/shapes.js';
import { filterShapes, renderCardHTML } from './render.js';

const grid = document.getElementById('card-grid');
const status = document.getElementById('status');

const state = {
  tuning: 'all',
  family: 'all',
  rootString: 'all',
  tag: 'all',
  voicing: 'all',
  deck: 'all',
  q: '',
  showIntervals: true,
  showFingering: false,
};

function readControls() {
  state.tuning = document.getElementById('f-tuning').value;
  state.family = document.getElementById('f-family').value;
  state.rootString = document.getElementById('f-root').value;
  state.tag = document.getElementById('f-tag').value;
  state.voicing = document.getElementById('f-voicing').value;
  state.deck = document.getElementById('f-deck').value;
  state.q = document.getElementById('f-search').value.trim();
  state.showIntervals = document.getElementById('f-intervals').checked;
  state.showFingering = document.getElementById('f-fingering').checked;
}

function render() {
  readControls();
  const filtered = filterShapes(SHAPES, state);
  status.textContent = `${filtered.length} of ${SHAPES.length} cards`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">No shapes match these filters.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((s) =>
      renderCardHTML(s, {
        showIntervals: state.showIntervals,
        showFingering: state.showFingering,
      })
    )
    .join('');
}

function wire() {
  [
    'f-tuning', 'f-family', 'f-root', 'f-tag', 'f-voicing', 'f-deck',
    'f-search', 'f-intervals', 'f-fingering',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    document.getElementById('f-tuning').value = 'all';
    document.getElementById('f-family').value = 'all';
    document.getElementById('f-root').value = 'all';
    document.getElementById('f-tag').value = 'all';
    document.getElementById('f-voicing').value = 'all';
    document.getElementById('f-deck').value = 'all';
    document.getElementById('f-search').value = '';
    document.getElementById('f-intervals').checked = true;
    document.getElementById('f-fingering').checked = false;
    render();
  });
}

wire();
render();
