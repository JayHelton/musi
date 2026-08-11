/**
 * Application bootstrap: global inits, four-destination nav, hash router,
 * compatibility shims, and keyboard/volume wiring.
 */

import { audioCtx } from './audio.js';
import { S, buildNoteButtons, selectItem } from './scaleQuiz.js';
import './intervalQuiz.js';
import { QWERTY_MAP, toggleDrone } from './keyboard.js';
import { initMetronome } from './metronome.js';
import { initVisualizer } from './visualizer.js';
import { initNowPlaying } from './nowPlaying.js';
import { initHoldRecordButton } from './recorder.js';
import { getSetting, saveSetting } from './persistence.js';
import { initProgressHeaders } from './progressHeader.js';
import { initStats } from './stats.js';
import { initGlobalVolume } from './musicPreferences.js';
import { OBJECTIVES } from './routes.js';
import { isHoldRecordRelevant } from './tools.js';
import { DEST_ICONS } from './ui/icons.js';
import { ensureFeatureStyles } from './ui/featureStyles.js';
import { initScreenUx, syncSetupToolbars } from './screenUx.js';
import { initBootSplash, markBootReady } from './bootSplash.js';
import { runMigrations } from './migrations/index.js';
import { FEATURES } from './featureRegistry.js';
import {
  initRouter,
  navigate,
  navigateLegacy,
  currentRoute,
  getNavPushCount,
  popNavHistory,
} from './router.js';
import { showRoute } from './workspaceLoader.js';
import { adoptedSections } from './workspaces/legacyHost.js';
import { parseRoute } from './routes.js';

const sectionToFeature = new Map(FEATURES.map((f) => [f.sectionId, f.id]));

let appMenuEl = null;
let toastTimer = null;

export function showAppToast(message) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
    el.textContent = '';
  }, 4000);
}

function activeSectionId() {
  const adopted = document.querySelector('.embedded-section.active');
  if (adopted) return adopted.id;
  return document.querySelector('.section.active')?.id || null;
}

function updateHoldRecordVisibility(featureId) {
  const relevant = featureId ? isHoldRecordRelevant(featureId) : false;
  document.body.classList.toggle('hold-rec-relevant', relevant);
}

function updateNavActive(route) {
  const objective = route?.objective || 'home';
  document.querySelectorAll('.dock-dest').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.objective === objective);
  });
}

function resolveFeatureIdForRoute(route) {
  if (!route || route.objective === 'home' || route.objective === 'settings') return null;
  const sectionId = activeSectionId();
  if (!sectionId || sectionId === 'sec-home') return null;
  return sectionToFeature.get(sectionId) || null;
}

async function handleRoute(route) {
  updateNavActive(route);
  await showRoute(route);
  const featureId = resolveFeatureIdForRoute(route);
  if (featureId) ensureFeatureStyles(featureId);
  updateHoldRecordVisibility(featureId);
  document.body.classList.toggle('tool-screen', !!featureId);
  syncSetupToolbars();
}

function showSection(idOrRoute, _skipHash) {
  void _skipHash;
  if (!idOrRoute) {
    navigate('#home');
    return;
  }
  const raw = String(idOrRoute);
  if (raw.startsWith('#') && !parseRoute(raw).unknown) {
    navigate(raw);
    return;
  }
  if (['home', 'train', 'study', 'create', 'settings'].includes(raw.split('/')[0].replace('#', ''))) {
    navigate(raw.startsWith('#') ? raw : `#${raw}`);
    return;
  }
  navigateLegacy(raw.replace(/^#/, ''));
}

function showHub(categoryId) {
  const map = {
    train: '#train',
    reference: '#study',
    create: '#create',
    tools: '#train/library',
  };
  navigate(map[categoryId] || '#home');
}

function goBack(fallback) {
  if (getNavPushCount() > 0) {
    popNavHistory();
    return true;
  }
  if (typeof fallback === 'function') {
    fallback();
    return false;
  }
  const route = currentRoute();
  if (route?.objective !== 'home') navigate('#home');
  return false;
}

function closeAppMenu() {
  if (!appMenuEl) return;
  appMenuEl.classList.remove('open');
  appMenuEl.hidden = true;
}

function openAppMenu() {
  if (!appMenuEl) return;
  appMenuEl.hidden = false;
  appMenuEl.classList.add('open');
  const first = appMenuEl.querySelector('.app-menu-item');
  if (first) first.focus();
}

function initAppMenu() {
  const btn = document.getElementById('app-menu-btn');
  if (!btn) return;

  appMenuEl = document.createElement('div');
  appMenuEl.id = 'app-menu';
  appMenuEl.className = 'app-menu';
  appMenuEl.setAttribute('role', 'menu');
  appMenuEl.hidden = true;
  appMenuEl.innerHTML = `
    <button type="button" class="app-menu-item" role="menuitem" data-route="#settings">Settings</button>
    <button type="button" class="app-menu-item" role="menuitem" data-route="#home">About Musi</button>
  `;
  document.body.appendChild(appMenuEl);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (appMenuEl.classList.contains('open')) closeAppMenu();
    else openAppMenu();
  });

  appMenuEl.querySelectorAll('.app-menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      navigate(item.dataset.route);
      closeAppMenu();
      btn.focus();
    });
  });

  document.addEventListener('click', (e) => {
    if (!appMenuEl.contains(e.target) && e.target !== btn) closeAppMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appMenuEl.classList.contains('open')) {
      closeAppMenu();
      btn.focus();
    }
  });
}

function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = '';
  OBJECTIVES.forEach((obj) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-dest';
    btn.dataset.objective = obj.id;
    btn.innerHTML = `<span class="dock-icon">${DEST_ICONS[obj.id] || ''}</span><span class="dock-label">${obj.label}</span>`;
    btn.onclick = () => navigate(obj.route);
    nav.appendChild(btn);
  });
}

function init() {
  initBootSplash();
  runMigrations();
  initNav();
  initAppMenu();

  function buildList(containerId, items, defaultVal) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const validValues = items.filter((item) => item.type !== 'label').map((item) => item.val);
    const activeVal = getSetting(containerId, defaultVal, validValues);
    items.forEach(({ type, val, label }) => {
      if (type === 'label') {
        const group = document.createElement('div');
        group.className = 'sl-group-label';
        group.textContent = label;
        container.appendChild(group);
        return;
      }
      const div = document.createElement('div');
      div.className = 'sl-item' + (val === activeVal ? ' active' : '');
      div.dataset.val = val;
      div.textContent = label;
      div.onclick = () => selectItem(containerId, val);
      container.appendChild(div);
    });
  }

  buildList('sl-int-diff',
    [{ val: 'easy', label: 'Diatonic' }, { val: 'medium', label: 'Extended' }, { val: 'hard', label: 'Chromatic' }],
    'easy');

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
    if (activeSectionId() !== 'sec-keyboard') return;
    const midi = QWERTY_MAP[e.key.toLowerCase()];
    if (midi !== undefined) { e.preventDefault(); if (!S.kb.drones[midi]) toggleDrone(midi); }
  });
  document.addEventListener('keyup', (e) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
    if (activeSectionId() !== 'sec-keyboard') return;
    const midi = QWERTY_MAP[e.key.toLowerCase()];
    if (midi !== undefined && S.kb.drones[midi]) toggleDrone(midi);
  });

  document.querySelectorAll('.wave-btn').forEach((btn) => {
    S.kb.wave = getSetting('kb.wave', S.kb.wave, ['sine', 'triangle', 'sawtooth', 'square']);
    btn.classList.toggle('active', btn.dataset.w === S.kb.wave);
    btn.onclick = () => {
      document.querySelectorAll('.wave-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      S.kb.wave = btn.dataset.w;
      saveSetting('kb.wave', S.kb.wave);
    };
  });

  const kbVol = document.getElementById('kb-vol');
  if (kbVol) {
    const savedKbVol = Number(getSetting('kb.vol', Number(kbVol.value) / 100));
    if (!Number.isNaN(savedKbVol)) {
      S.kb.vol = Math.max(0, Math.min(1, savedKbVol));
      kbVol.value = Math.round(S.kb.vol * 100);
    }
    kbVol.oninput = (e) => {
      S.kb.vol = e.target.value / 100;
      saveSetting('kb.vol', S.kb.vol);
      Object.values(S.kb.drones).forEach((dr) => {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
          dr.gain.gain.setValueAtTime(S.kb.vol, audioCtx.currentTime);
        }
      });
    };
  }

  buildNoteButtons('sq-notes', 'scale');
  buildNoteButtons('iq-notes', 'interval');

  initGlobalVolume();
  initMetronome();
  initVisualizer();
  initNowPlaying();
  initHoldRecordButton();
  initProgressHeaders();
  initStats();
  initScreenUx({ showSection, showHub });

  window.showSection = showSection;
  window.showHub = showHub;
  window.goBack = goBack;
  window.showAppToast = showAppToast;

  const wordmark = document.getElementById('wordmark-home');
  if (wordmark) {
    wordmark.onclick = () => navigate('#home');
    wordmark.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('#home'); } };
  }

  initRouter({
    onRoute: (route) => {
      handleRoute(route);
    },
  });

  window.addEventListener('musi:features-changed', () => {
    const route = currentRoute();
    if (route) handleRoute(route);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => markBootReady());
  });
}

document.addEventListener('DOMContentLoaded', init);

export { adoptedSections, activeSectionId, resolveFeatureIdForRoute };
