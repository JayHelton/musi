import { getSetting, saveSetting } from './persistence.js';

// Homepage built around scannable tool cards plus a Favorites rail. Musicians
// tend to reach for the same handful of utilities, so pinned tools sit up top
// and a long-press (or the card menu) lets them pin, hide and reorder.

const TITLES = {
  scales: 'Scale Quiz',
  intervals: 'Interval Quiz',
  sightreading: 'Sight Reading',
  scaleref: 'Scale Finder',
  chords: 'Chord Builder',
  circle: 'Circle of Fifths',
  keyboard: 'Keyboard',
  metronome: 'Metronome',
  fretboard: 'Fretboard Trainer',
  tuner: 'Pitch / Tuner',
  ear: 'Ear Trainer',
  recorder: 'Recorder',
};

const DESCRIPTIONS = {
  scales: 'Spell scales by root and type.',
  intervals: 'Name intervals above any root.',
  sightreading: 'Read pitches on the staff.',
  scaleref: 'Find scales, modes and 3-NPS shapes.',
  chords: 'Build voicings and analyze chords.',
  circle: 'Explore keys and relationships.',
  keyboard: 'Play notes and hold drones.',
  metronome: 'Tempo, meter and tap tempo.',
  fretboard: 'Drill notes and intervals on guitar.',
  tuner: 'Live pitch and reference tones.',
  ear: 'Identify pitches by ear.',
  recorder: 'Capture takes and inspect pitch.',
};

let showSectionFn = null;
let icons = {};
let tabs = [];
let longPressTimer = null;
let menuEl = null;
let allToolsDefaultApplied = false;

function favorites() {
  const v = getSetting('home.favorites', []);
  return Array.isArray(v) ? v.filter(id => tabs.some(t => t.id === id)) : [];
}
function hidden() {
  const v = getSetting('home.hidden', []);
  return Array.isArray(v) ? v.filter(id => tabs.some(t => t.id === id)) : [];
}
function setFavorites(list) { saveSetting('home.favorites', list); }
function setHidden(list) { saveSetting('home.hidden', list); }

function toggleFavorite(id) {
  const list = favorites();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  setFavorites(list);
  render();
}
function toggleHidden(id) {
  const list = hidden();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  setHidden(list);
  render();
}
function moveFavorite(id, dir) {
  const list = favorites();
  const i = list.indexOf(id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  setFavorites(list);
  render();
}

function closeMenu() {
  if (menuEl) menuEl.classList.remove('open');
}

function openMenu(id, x, y) {
  if (!menuEl) return;
  const isFav = favorites().includes(id);
  const isHidden = hidden().includes(id);
  menuEl.innerHTML = `
    <button class="tc-menu-item" data-act="fav">${isFav ? '\u2605 Unpin from Home' : '\u2606 Pin to Home'}</button>
    ${isFav ? '<button class="tc-menu-item" data-act="up">\u2191 Move up</button><button class="tc-menu-item" data-act="down">\u2193 Move down</button>' : ''}
    <button class="tc-menu-item" data-act="hide">${isHidden ? 'Show' : 'Hide'}</button>
  `;
  menuEl.querySelectorAll('.tc-menu-item').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'fav') toggleFavorite(id);
      else if (act === 'hide') toggleHidden(id);
      else if (act === 'up') moveFavorite(id, -1);
      else if (act === 'down') moveFavorite(id, 1);
      closeMenu();
    };
  });
  const vw = window.innerWidth, vh = window.innerHeight;
  menuEl.style.left = Math.min(x, vw - 200) + 'px';
  menuEl.style.top = Math.min(y, vh - 180) + 'px';
  menuEl.classList.add('open');
}

function buildCard(id, { pinned } = {}) {
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.dataset.id = id;
  const title = TITLES[id] || (tabs.find(t => t.id === id) || {}).label || id;
  const desc = DESCRIPTIONS[id] || '';
  card.innerHTML = `
    <button class="tool-card-menu" type="button" aria-label="Tool options">&#8943;</button>
    <div class="tool-card-icon">${icons[id] || ''}</div>
    <div class="tool-card-title">${title}</div>
    <div class="tool-card-desc">${desc}</div>
    <button class="btn primary tool-card-open" type="button">Open</button>
  `;
  if (pinned) card.classList.add('pinned');

  card.querySelector('.tool-card-open').onclick = () => showSectionFn(id);
  const menuBtn = card.querySelector('.tool-card-menu');
  menuBtn.onclick = (e) => {
    e.stopPropagation();
    const r = menuBtn.getBoundingClientRect();
    openMenu(id, r.left, r.bottom + 4);
  };

  // Long-press anywhere on the card reveals the same menu on touch devices.
  card.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      const t = e.touches[0];
      openMenu(id, t.clientX, t.clientY);
    }, 500);
  }, { passive: true });
  const cancel = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  card.addEventListener('touchend', cancel);
  card.addEventListener('touchmove', cancel, { passive: true });

  return card;
}

function render() {
  const favWrap = document.getElementById('home-favorites');
  const favSection = document.getElementById('home-fav-section');
  const allPanel = document.getElementById('home-all-panel');
  const grid = document.getElementById('home-grid');
  if (!grid) return;

  const fav = favorites();
  const hid = hidden();

  if (allPanel) {
    if (!allToolsDefaultApplied) {
      allPanel.open = fav.length === 0;
      allToolsDefaultApplied = true;
    } else if (fav.length === 0) {
      allPanel.open = true;
    }
  }

  if (favSection) favSection.style.display = fav.length ? '' : 'none';
  if (favWrap) {
    favWrap.innerHTML = '';
    fav.forEach(id => favWrap.appendChild(buildCard(id, { pinned: true })));
  }

  grid.innerHTML = '';
  tabs.filter(t => !hid.includes(t.id)).forEach(t => grid.appendChild(buildCard(t.id)));

  const hiddenNote = document.getElementById('home-hidden-note');
  if (hiddenNote) {
    if (hid.length) {
      hiddenNote.style.display = '';
      hiddenNote.textContent = `${hid.length} hidden tool${hid.length > 1 ? 's' : ''} — long-press or use the menu to show`;
    } else {
      hiddenNote.style.display = 'none';
    }
  }
}

export function initHome(config) {
  showSectionFn = config.showSection;
  icons = config.icons || {};
  tabs = config.tabs || [];

  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.className = 'tc-menu';
    document.body.appendChild(menuEl);
    document.addEventListener('click', closeMenu);
    document.addEventListener('scroll', closeMenu, true);
  }

  render();
}
