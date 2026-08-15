// Shared Exercises / Workbooks tabs for the Library toolbar destination.

import { initSubviewTabs } from '../uxPrimitives.js';

const LIBRARY_TABS = [
  { id: 'exercises', label: 'Exercises' },
  { id: 'workbooks', label: 'Workbooks' },
];

const controllers = new WeakMap();

/**
 * Mount Library mode tabs on a host element.
 * @param {HTMLElement} host
 * @param {'exercises'|'workbooks'} activeMode
 * @param {{ showSection?: (id: string) => void }} opts
 */
export function mountLibraryTabs(host, activeMode, { showSection } = {}) {
  if (!host) return null;

  const mode = activeMode === 'workbooks' ? 'workbooks' : 'exercises';
  const navigate = typeof showSection === 'function'
    ? showSection
    : (typeof window.showSection === 'function' ? window.showSection : null);

  const prior = controllers.get(host);
  if (prior?.mode === mode && host.querySelector('.library-tabs')) {
    return prior.api;
  }

  host.innerHTML = '';

  const api = initSubviewTabs(host, LIBRARY_TABS, {
    defaultId: mode,
    className: 'subview-tabs library-tabs',
    onChange: (id) => {
      if (navigate) navigate(id);
    },
  });

  controllers.set(host, { mode, api });
  return api;
}
