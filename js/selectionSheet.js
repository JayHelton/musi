// Reusable selection sheet / dialog for long lists.
// Mobile: bottom sheet. Desktop: centered dialog.
// Supports search, categories, recent, single & multi select,
// keyboard nav, focus trap, Escape, and focus restoration.

let activeSheet = null;
let lastFocus = null;

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const MOBILE_SHEET_MQ = '(max-width: 768px), (orientation: landscape) and (max-height: 500px)';

function isMobile() {
  return window.matchMedia(MOBILE_SHEET_MQ).matches;
}

function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const nodes = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function ensureHost() {
  let overlay = document.getElementById('sel-sheet-overlay');
  let panel = document.getElementById('sel-sheet');
  if (overlay && panel) return { overlay, panel };

  overlay = document.createElement('div');
  overlay.id = 'sel-sheet-overlay';
  overlay.className = 'sel-sheet-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  panel = document.createElement('div');
  panel.id = 'sel-sheet';
  panel.className = 'sel-sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-hidden', 'true');

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  return { overlay, panel };
}

function closeActive(reason = 'dismiss') {
  if (!activeSheet) return;
  const { overlay, panel, opts, resolve } = activeSheet;
  panel.classList.remove('open');
  overlay.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sel-sheet-open');
  document.removeEventListener('keydown', activeSheet.onKey);
  activeSheet = null;
  if (lastFocus && typeof lastFocus.focus === 'function') {
    try { lastFocus.focus(); } catch (_) { /* ignore */ }
  }
  lastFocus = null;
  if (typeof opts.onClose === 'function') opts.onClose(reason);
  if (resolve) resolve(null);
}

/**
 * Open a selection sheet.
 *
 * @param {object} opts
 * @param {string} opts.title - an empty string hides the heading row text
 * @param {string} [opts.ariaLabel] - dialog label when the heading is hidden
 * @param {Array} opts.items - { id, label, sub?, meta?, category?, keywords?, disabled?, actions? }
 *   actions: [{ id, label, className?, icon? }] — trailing row buttons (e.g. delete)
 * @param {string|string[]} [opts.value] - current selection
 * @param {boolean} [opts.multiple]
 * @param {Array} [opts.categories] - [{ id, label }]
 * @param {Array} [opts.recent] - ids
 * @param {boolean} [opts.search=true]
 * @param {string} [opts.searchPlaceholder]
 * @param {string} [opts.emptyText]
 * @param {Function} [opts.onSelect] - (id, item) => void  (single mode, immediate)
 * @param {Function} [opts.onConfirm] - (ids) => void (multi mode)
 * @param {Function} [opts.onItemAction] - (actionId, itemId, item) => void
 * @param {Function} [opts.renderItem] - optional custom renderer (item, el) => void
 * @param {boolean} [opts.grid] - render as grid instead of list
 * @param {string} [opts.gridClass]
 * @returns {Promise<string|string[]|null>}
 */
export function openSelectionSheet(opts = {}) {
  return new Promise((resolve) => {
    if (activeSheet) closeActive('replace');

    const { overlay, panel } = ensureHost();
    lastFocus = document.activeElement;
    const multiple = !!opts.multiple;
    const showSearch = opts.search !== false;
    let selected = multiple
      ? new Set(Array.isArray(opts.value) ? opts.value : (opts.value ? [opts.value] : []))
      : (opts.value || null);
    let query = '';
    let activeIndex = -1;

    const itemsById = new Map();
    (opts.items || []).forEach(it => itemsById.set(it.id, it));

    panel.className = 'sel-sheet' + (isMobile() ? ' sheet-mobile' : ' sheet-desktop') + (opts.grid ? ' sel-sheet-grid-mode' : '');
    // A caller can pass an empty title to drop the heading. Screen readers then
    // read the ariaLabel instead.
    const hasTitle = typeof opts.title === 'string' ? !!opts.title : true;
    panel.setAttribute('aria-label', opts.title || opts.ariaLabel || 'Select');

    panel.innerHTML = `
      <div class="sel-sheet-handle" aria-hidden="true"></div>
      <div class="sel-sheet-header${hasTitle ? '' : ' no-title'}">
        ${hasTitle ? `<h2 class="sel-sheet-title" id="sel-sheet-title">${escapeHtml(opts.title || 'Select')}</h2>` : ''}
        <button type="button" class="sel-sheet-close" aria-label="Close">&times;</button>
      </div>
      ${showSearch ? `<div class="sel-sheet-search-wrap">
        <input type="search" class="sel-sheet-search" placeholder="${escapeHtml(opts.searchPlaceholder || 'Search')}" aria-label="Search" autocomplete="off" enterkeyhint="search">
      </div>` : ''}
      <div class="sel-sheet-body" role="listbox" ${multiple ? 'aria-multiselectable="true"' : ''} id="sel-sheet-list"></div>
      ${multiple ? `<div class="sel-sheet-footer">
        <button type="button" class="btn primary sel-sheet-confirm">Done</button>
      </div>` : ''}
    `;

    const listEl = panel.querySelector('#sel-sheet-list');
    const searchEl = panel.querySelector('.sel-sheet-search');
    const closeBtn = panel.querySelector('.sel-sheet-close');

    function matches(item, q) {
      if (!q) return true;
      const hay = [
        item.label,
        item.sub,
        item.meta,
        item.category,
        ...(item.keywords || []),
      ].filter(Boolean).join(' ').toLowerCase();
      const tokens = q.toLowerCase().trim().split(/\s+/);
      return tokens.every(t => hay.includes(t));
    }

    function buildSections() {
      const all = (opts.items || []).filter(it => !it.disabled && matches(it, query));
      const sections = [];
      const used = new Set();

      const pushGroup = (label, ids) => {
        const rows = [];
        (ids || []).forEach(id => {
          if (used.has(id)) return;
          const it = itemsById.get(id);
          if (!it || it.disabled || !matches(it, query)) return;
          rows.push(it);
          used.add(id);
        });
        if (rows.length) sections.push({ label, items: rows });
      };

      if (!query && opts.recent?.length) pushGroup('Recent', opts.recent);

      if (opts.categories?.length) {
        opts.categories.forEach(cat => {
          const rows = all.filter(it => it.category === cat.id && !used.has(it.id));
          rows.forEach(it => used.add(it.id));
          if (rows.length) sections.push({ label: cat.label, items: rows });
        });
        const orphan = all.filter(it => !used.has(it.id));
        if (orphan.length) sections.push({ label: 'Other', items: orphan });
      } else {
        const rest = all.filter(it => !used.has(it.id));
        if (rest.length) sections.push({ label: query ? 'Results' : 'All', items: rest });
      }

      return sections;
    }

    function isSelected(id) {
      return multiple ? selected.has(id) : selected === id;
    }

    function render() {
      const sections = buildSections();
      listEl.innerHTML = '';
      const flat = [];

      if (!sections.length || sections.every(s => !s.items.length)) {
        const empty = document.createElement('div');
        empty.className = 'sel-sheet-empty';
        empty.textContent = opts.emptyText || 'No matches';
        listEl.appendChild(empty);
        activeIndex = -1;
        return;
      }

      sections.forEach(sec => {
        const head = document.createElement('div');
        head.className = 'sel-sheet-group';
        head.textContent = sec.label;
        listEl.appendChild(head);

        const wrap = document.createElement('div');
        wrap.className = opts.grid ? (`sel-sheet-grid ${opts.gridClass || ''}`.trim()) : 'sel-sheet-list';
        sec.items.forEach(item => {
          flat.push(item);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sel-sheet-item' + (isSelected(item.id) ? ' selected' : '');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', isSelected(item.id) ? 'true' : 'false');
          btn.dataset.id = item.id;
          btn.tabIndex = -1;

          if (typeof opts.renderItem === 'function') {
            opts.renderItem(item, btn);
          } else {
            btn.innerHTML = `
              <span class="sel-item-main">
                <span class="sel-item-label">${escapeHtml(item.label)}</span>
                ${item.sub ? `<span class="sel-item-sub">${escapeHtml(item.sub)}</span>` : ''}
                ${item.meta ? `<span class="sel-item-meta">${escapeHtml(item.meta)}</span>` : ''}
              </span>
              <span class="sel-item-trailing">
                ${Array.isArray(item.actions) && item.actions.length ? item.actions.map(action => `<span class="sel-item-action ${action.className || ''}" data-item-action="${escapeHtml(action.id)}" role="button" tabindex="-1" aria-label="${escapeHtml(action.label)}">${action.icon || escapeHtml(action.label)}</span>`).join('') : ''}
                ${isSelected(item.id) ? '<span class="sel-item-check" aria-hidden="true">✓</span>' : ''}
              </span>
            `;
          }

          btn.onclick = (e) => {
            const actionEl = e.target.closest?.('[data-item-action]');
            if (actionEl && typeof opts.onItemAction === 'function') {
              e.stopPropagation();
              opts.onItemAction(actionEl.getAttribute('data-item-action'), item.id, item);
              return;
            }
            pick(item);
          };
          wrap.appendChild(btn);
        });
        listEl.appendChild(wrap);
      });

      // Keep current selection visible
      const selBtn = listEl.querySelector('.sel-sheet-item.selected');
      if (selBtn) {
        requestAnimationFrame(() => {
          selBtn.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        });
      }

      // Restore keyboard highlight near selection
      if (flat.length) {
        const selIdx = flat.findIndex(it => isSelected(it.id));
        activeIndex = selIdx >= 0 ? selIdx : 0;
        highlightActive();
      }
    }

    function pick(item) {
      if (multiple) {
        if (selected.has(item.id)) selected.delete(item.id);
        else selected.add(item.id);
        render();
        return;
      }
      selected = item.id;
      if (typeof opts.onSelect === 'function') opts.onSelect(item.id, item);
      finish(item.id);
    }

    function finish(value) {
      const { overlay: ov, panel: pn } = ensureHost();
      pn.classList.remove('open');
      ov.classList.remove('visible');
      pn.setAttribute('aria-hidden', 'true');
      ov.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('sel-sheet-open');
      document.removeEventListener('keydown', onKey);
      activeSheet = null;
      if (lastFocus && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus(); } catch (_) { /* ignore */ }
      }
      lastFocus = null;
      if (typeof opts.onClose === 'function') opts.onClose('select');
      resolve(value);
    }

    function itemButtons() {
      return [...listEl.querySelectorAll('.sel-sheet-item')];
    }

    function highlightActive() {
      const btns = itemButtons();
      btns.forEach((b, i) => b.classList.toggle('kb-active', i === activeIndex));
      if (activeIndex >= 0 && btns[activeIndex]) {
        btns[activeIndex].scrollIntoView({ block: 'nearest' });
      }
    }

    function onKey(e) {
      if (!activeSheet) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeActive('escape');
        resolve(null);
        return;
      }
      trapFocus(panel, e);

      const btns = itemButtons();
      if (!btns.length) return;

      if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && opts.grid)) {
        e.preventDefault();
        activeIndex = Math.min(btns.length - 1, activeIndex + 1);
        highlightActive();
      } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && opts.grid)) {
        e.preventDefault();
        activeIndex = Math.max(0, activeIndex < 0 ? 0 : activeIndex - 1);
        highlightActive();
      } else if (e.key === 'Home') {
        e.preventDefault();
        activeIndex = 0;
        highlightActive();
      } else if (e.key === 'End') {
        e.preventDefault();
        activeIndex = btns.length - 1;
        highlightActive();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === searchEl) return;
        if (activeIndex >= 0 && btns[activeIndex]) {
          e.preventDefault();
          btns[activeIndex].click();
        }
      }
    }

    closeBtn.onclick = () => { closeActive('close'); resolve(null); };
    overlay.onclick = () => { closeActive('overlay'); resolve(null); };

    if (searchEl) {
      searchEl.oninput = () => {
        query = searchEl.value;
        render();
      };
    }

    if (multiple) {
      panel.querySelector('.sel-sheet-confirm').onclick = () => {
        const ids = [...selected];
        if (typeof opts.onConfirm === 'function') opts.onConfirm(ids);
        finish(ids);
      };
    }

    render();
    overlay.classList.add('visible');
    panel.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sel-sheet-open');
    document.addEventListener('keydown', onKey);

    activeSheet = { overlay, panel, opts, resolve, onKey };

    requestAnimationFrame(() => {
      if (searchEl && !isMobile()) searchEl.focus();
      else closeBtn.focus();
    });
  });
}

export function closeSelectionSheet() {
  if (!activeSheet) return;
  const resolve = activeSheet.resolve;
  closeActive('programmatic');
  if (resolve) resolve(null);
}

export function isSelectionSheetOpen() {
  return !!activeSheet;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
