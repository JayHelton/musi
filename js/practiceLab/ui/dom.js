// Small element helpers, local to Practice Lab.
//
// The feature draws its own chips, tabs, steppers, and switches. It shares no
// user-interface primitive with another feature, so a later split into a micro
// app moves this folder and nothing else.

/**
 * Build one element.
 * @param {string} tag
 * @param {Object} [props] `class`, `text`, `html`, `attrs`, `on`, and any
 *   direct property such as `type` or `value`.
 * @param {Array} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'attrs') {
      for (const [name, attr] of Object.entries(value)) {
        if (attr == null || attr === false) continue;
        node.setAttribute(name, attr === true ? '' : String(attr));
      }
    } else if (key === 'on') {
      for (const [name, fn] of Object.entries(value)) node.addEventListener(name, fn);
    } else if (key === 'dataset') {
      for (const [name, data] of Object.entries(value)) node.dataset[name] = data;
    } else {
      node[key] = value;
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Remove every child of a node. */
export function clear(node) {
  if (!node) return node;
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * A pressable control. Every button of this feature goes through here, so the
 * keyboard path and the accessible name are the same everywhere.
 * @param {{ label: string, onPress: Function, className?: string, ariaLabel?: string, pressed?: boolean, disabled?: boolean }} options
 * @returns {HTMLButtonElement}
 */
export function pressable({ label, onPress, className = '', ariaLabel = '', pressed, disabled = false }) {
  const btn = el('button', {
    type: 'button',
    class: `pl-btn ${className}`.trim(),
    text: label,
    disabled: !!disabled,
    on: { click: (event) => onPress?.(event) },
  });
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  if (pressed != null) btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  return btn;
}

/**
 * One catalog chip, with an optional remove control.
 * @param {{ label: string, selected?: boolean, onSelect?: Function, onRemove?: Function, removeLabel?: string }} options
 * @returns {HTMLElement}
 */
export function chip({ label, selected = false, onSelect, onRemove, removeLabel = '' }) {
  const wrap = el('span', { class: `pl-chip${selected ? ' selected' : ''}` });
  const main = el('button', {
    type: 'button',
    class: 'pl-chip-main',
    text: label,
    on: { click: () => onSelect?.() },
  });
  main.setAttribute('aria-pressed', selected ? 'true' : 'false');
  wrap.appendChild(main);
  if (typeof onRemove === 'function') {
    const remove = el('button', {
      type: 'button',
      class: 'pl-chip-remove',
      text: '×',
      on: {
        click: (event) => { event.stopPropagation(); onRemove(); },
      },
    });
    remove.setAttribute('aria-label', removeLabel || `Remove ${label}`);
    wrap.appendChild(remove);
  }
  return wrap;
}

/**
 * A tab bar. The tabs carry the ARIA roles, so a screen reader announces the
 * selected panel.
 * `panelIdPrefix` must match the ids the caller gives its panels, or
 * `aria-controls` points at nothing.
 * @param {{ tabs: Array<{id: string, label: string}>, active: string, onChange: Function, ariaLabel?: string, panelIdPrefix?: string }} options
 * @returns {{ root: HTMLElement, setActive: Function }}
 */
export function tabBar({ tabs, active, onChange, ariaLabel = 'Trainers', panelIdPrefix = 'pl-panel-' }) {
  const root = el('div', { class: 'pl-tabs' });
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', ariaLabel);
  const buttons = new Map();

  function paint(activeId) {
    for (const [id, btn] of buttons) {
      const on = id === activeId;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    }
  }

  tabs.forEach((tab) => {
    const btn = el('button', {
      type: 'button',
      class: 'pl-tab',
      text: tab.label,
      on: {
        click: () => { paint(tab.id); onChange?.(tab.id); },
        keydown: (event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const list = tabs.map(t => t.id);
          const at = list.indexOf(tab.id);
          const step = event.key === 'ArrowRight' ? 1 : -1;
          const next = list[(at + step + list.length) % list.length];
          buttons.get(next)?.focus();
          paint(next);
          onChange?.(next);
        },
      },
    });
    btn.setAttribute('role', 'tab');
    btn.id = `pl-tab-${tab.id}`;
    btn.setAttribute('aria-controls', `${panelIdPrefix}${tab.id}`);
    buttons.set(tab.id, btn);
    root.appendChild(btn);
  });

  paint(active);
  return { root, setActive: paint };
}

/**
 * A numeric stepper: a minus control, a value field, and a plus control.
 * The field is the one readout, so the row stays inside its column.
 * @param {{ label: string, value: number, min: number, max: number, step?: number, unit?: string, onChange: Function }} options
 * @returns {{ root: HTMLElement, set: Function, value: Function }}
 */
export function stepper({ label, value, min, max, step = 1, unit = '', onChange }) {
  let current = value;

  const input = el('input', {
    type: 'number', class: 'pl-stepper-input', value: String(current),
    min: String(min), max: String(max), step: String(step),
  });
  input.setAttribute('aria-label', unit ? `${label} in ${unit}` : label);

  function set(next, notify = true) {
    const clamped = Math.max(min, Math.min(max, Math.round(Number(next))));
    const safe = Number.isFinite(clamped) ? clamped : current;
    input.value = String(safe);
    if (safe === current) return current;
    current = safe;
    if (notify) onChange?.(current);
    return current;
  }

  input.addEventListener('change', () => set(input.value));

  const minus = el('button', {
    type: 'button', class: 'pl-step-btn', text: '\u2212',
    on: { click: () => set(current - step) },
  });
  minus.setAttribute('aria-label', `${label} down`);

  const plus = el('button', {
    type: 'button', class: 'pl-step-btn', text: '+',
    on: { click: () => set(current + step) },
  });
  plus.setAttribute('aria-label', `${label} up`);

  const row = el('div', { class: 'pl-stepper-row' }, [minus, input, plus]);
  const heading = el('span', { class: 'pl-field-label', text: unit ? `${label} (${unit})` : label });

  const root = el('div', { class: 'pl-stepper' }, [heading, row]);
  return { root, set, value: () => current };
}

/**
 * A range control. The metronome bar uses it for the tempo.
 * @param {{ label: string, value: number, min: number, max: number, step?: number, onInput: Function, className?: string }} config
 * @returns {{ node: HTMLInputElement, set: Function }}
 */
export function slider({ label, value, min, max, step = 1, onInput, className = '' }) {
  const node = el('input', {
    type: 'range',
    class: `pl-slider ${className}`.trim(),
    min: String(min), max: String(max), step: String(step), value: String(value),
    on: { input: () => onInput?.(Number(node.value)) },
  });
  node.setAttribute('aria-label', label);
  return {
    node,
    set(next) { node.value = String(next); },
  };
}

/**
 * A select control with a label.
 * @param {{ label: string, value: string, options: Array<{id: string, label: string}>, onChange: Function }} config
 * @returns {{ root: HTMLElement, value: Function }}
 */
export function select({ label, value, options, onChange }) {
  const node = el('select', {
    class: 'pl-select',
    on: { change: () => onChange?.(node.value) },
  }, options.map(opt => el('option', { value: opt.id, text: opt.label })));
  node.value = value;
  node.setAttribute('aria-label', label);
  const root = el('label', { class: 'pl-field' }, [
    el('span', { class: 'pl-field-label', text: label }),
    node,
  ]);
  return { root, value: () => node.value };
}

/**
 * An on/off switch.
 * @param {{ label: string, checked: boolean, onChange: Function }} config
 * @returns {{ root: HTMLElement, checked: Function }}
 */
export function toggle({ label, checked, onChange }) {
  const box = el('input', {
    type: 'checkbox', class: 'pl-toggle-box', checked: !!checked,
    on: { change: () => onChange?.(box.checked) },
  });
  const root = el('label', { class: 'pl-toggle' }, [
    box,
    el('span', { class: 'pl-toggle-label', text: label }),
  ]);
  return { root, checked: () => box.checked };
}

/** A titled panel, the screen tile of this feature. */
export function panel(title, className = '') {
  const body = el('div', { class: 'pl-panel-body' });
  const head = el('div', { class: 'pl-panel-head' }, [
    el('h3', { class: 'pl-panel-title', text: title }),
  ]);
  const root = el('section', { class: `pl-panel ${className}`.trim() }, [head, body]);
  return { root, head, body };
}

/** A short notice line, e.g. a denied camera or a blocked database. */
export function notice(message, kind = 'info') {
  return el('p', { class: `pl-notice pl-notice-${kind}`, text: message });
}
