import { getSetting, saveSetting } from '../persistence.js';
import { initSubviewTabs } from '../uxPrimitives.js';

const LIBRARY_TABS = [
  { id: 'exercises', label: 'Exercises' },
  { id: 'workbooks', label: 'Workbooks' },
];

const tabApis = new Map();
let openRouteFn = null;

function ensureTabBar(sectionId) {
  const sec = document.getElementById(`sec-${sectionId}`);
  if (!sec) return null;

  let container = sec.querySelector('.library-tabs');
  if (!container) {
    const head = sec.querySelector('.section-head');
    if (!head) return null;
    container = document.createElement('div');
    container.className = 'library-tabs subview-tabs';
    container.id = `library-tabs-${sectionId}`;
    head.insertAdjacentElement('afterend', container);
  }

  if (!tabApis.has(sectionId)) {
    const api = initSubviewTabs(container, LIBRARY_TABS, {
      settingsKey: 'library.tab',
      defaultId: 'exercises',
      onChange: (mode) => {
        saveSetting('library.tab', mode);
        if (openRouteFn) {
          openRouteFn('library', { mode }, { replace: true });
        }
      },
    });
    tabApis.set(sectionId, api);
  }

  return tabApis.get(sectionId);
}

export function syncLibraryTabs(activeMode) {
  const mode = activeMode === 'workbooks' ? 'workbooks' : 'exercises';
  saveSetting('library.tab', mode);
  for (const sectionId of ['exercises', 'workbooks']) {
    const api = ensureTabBar(sectionId);
    if (api) api.setActive(mode, { silent: true });
  }
}

export function initLibraryTabs({ openRoute } = {}) {
  openRouteFn = openRoute;
  for (const sectionId of ['exercises', 'workbooks']) {
    ensureTabBar(sectionId);
  }
}
