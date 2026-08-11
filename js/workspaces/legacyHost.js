/**
 * Adopt and release legacy #sec-* elements into workspace view containers.
 * Sections stay in index.html. Workspaces borrow live DOM nodes.
 */

/** @type {Map<string, { parent: Element, nextSibling: ChildNode|null }>} */
const originalParents = new Map();

/** @type {Set<string>} */
const adopted = new Set();

/**
 * @param {string} sectionId
 * @param {Element} host
 */
export function adoptSection(sectionId, host) {
  const el = document.getElementById(sectionId);
  if (!el || !host) return;
  if (adopted.has(sectionId)) {
    releaseSection(sectionId);
  }
  if (!originalParents.has(sectionId)) {
    originalParents.set(sectionId, {
      parent: el.parentElement,
      nextSibling: el.nextSibling,
    });
  }
  host.appendChild(el);
  el.classList.add('active', 'embedded-section');
  adopted.add(sectionId);
}

/**
 * @param {string} sectionId
 */
export function releaseSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el || !adopted.has(sectionId)) return;
  const orig = originalParents.get(sectionId);
  if (orig?.parent) {
    if (orig.nextSibling) orig.parent.insertBefore(el, orig.nextSibling);
    else orig.parent.appendChild(el);
  }
  el.classList.remove('active', 'embedded-section');
  adopted.delete(sectionId);
}

/**
 * @param {string[]} sectionIds
 */
export function releaseAllExcept(sectionIds) {
  const keep = new Set(sectionIds);
  for (const id of [...adopted]) {
    if (!keep.has(id)) releaseSection(id);
  }
}

/**
 * @returns {string[]}
 */
export function adoptedSections() {
  return [...adopted];
}
