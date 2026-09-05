// Small element helpers, local to Riff Spark.

/**
 * Build one element.
 * @param {string} tag
 * @param {Object} [props] `class`, `text`, `attrs`, `on`, and direct properties
 * @param {Array} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'attrs') {
      for (const [name, attr] of Object.entries(value)) {
        if (attr == null || attr === false) continue;
        node.setAttribute(name, attr === true ? '' : String(attr));
      }
    } else if (key === 'on') {
      for (const [name, fn] of Object.entries(value)) node.addEventListener(name, fn);
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
 * A button. Every button of the feature goes through here.
 * @param {{label: string, onPress: Function, className?: string, ariaLabel?: string, pressed?: boolean, disabled?: boolean, title?: string}} options
 */
export function btn({ label, onPress, className = '', ariaLabel = '', pressed, disabled = false, title = '' }) {
  const node = el('button', {
    type: 'button',
    class: `sk-btn ${className}`.trim(),
    text: label,
    disabled: !!disabled,
    on: { click: (event) => onPress?.(event) },
  });
  if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
  if (title) node.title = title;
  if (pressed != null) node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  return node;
}

/**
 * A row of choices where one is on.
 * @param {{options: Array<{id: string, label: string, title?: string}>, value: string, onChange: Function, ariaLabel?: string}} config
 * @returns {{root: HTMLElement, set: Function}}
 */
export function segmented({ options, value, onChange, ariaLabel = '' }) {
  const root = el('div', { class: 'sk-seg' });
  root.setAttribute('role', 'group');
  if (ariaLabel) root.setAttribute('aria-label', ariaLabel);
  const buttons = new Map();
  let current = value;

  function paint() {
    for (const [id, node] of buttons) {
      const on = id === current;
      node.classList.toggle('active', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  for (const option of options) {
    const node = el('button', {
      type: 'button',
      class: 'sk-seg-btn',
      text: option.label,
      title: option.title || '',
      on: { click: () => { if (current === option.id) return; current = option.id; paint(); onChange?.(current); } },
    });
    buttons.set(option.id, node);
    root.appendChild(node);
  }
  paint();
  return { root, set(next) { current = next; paint(); }, value: () => current };
}

/** A labelled control. */
export function field(label, control, className = '') {
  return el('label', { class: `sk-field ${className}`.trim() }, [
    el('span', { class: 'sk-field-label', text: label }),
    control,
  ]);
}

/** A titled panel, the screen tile of this feature. */
export function panel(title, className = '') {
  const body = el('div', { class: 'sk-panel-body' });
  const head = el('div', { class: 'sk-panel-head' }, [
    el('h3', { class: 'sk-panel-title', text: title }),
  ]);
  const root = el('section', { class: `sk-panel ${className}`.trim() }, [head, body]);
  return { root, head, body };
}

/** A short line of help. */
export function hint(text, className = '') {
  return el('p', { class: `sk-hint ${className}`.trim(), text });
}

/**
 * A range control with a live value.
 * @param {{label: string, value: number, min: number, max: number, step: number, format?: Function, onInput: Function}} config
 * @returns {{root: HTMLElement, set: Function}}
 */
export function rangeField({ label, value, min, max, step, format = v => String(v), onInput }) {
  const readout = el('span', { class: 'sk-range-value', text: format(value) });
  const input = el('input', {
    type: 'range', class: 'sk-range', min: String(min), max: String(max), step: String(step), value: String(value),
    on: { input: () => { readout.textContent = format(Number(input.value)); onInput?.(Number(input.value)); } },
  });
  input.setAttribute('aria-label', label);
  const root = el('label', { class: 'sk-field sk-field-range' }, [
    el('span', { class: 'sk-field-label' }, [label, ' ', readout]),
    input,
  ]);
  return { root, set(next) { input.value = String(next); readout.textContent = format(next); } };
}

/**
 * A numeric stepper.
 * @param {{label: string, value: number, min: number, max: number, onChange: Function}} config
 * @returns {{root: HTMLElement, set: Function, value: Function}}
 */
export function stepper({ label, value, min, max, onChange }) {
  let current = value;
  const readout = el('span', { class: 'sk-step-value', text: String(current) });
  function set(next, notify = true) {
    const clamped = Math.max(min, Math.min(max, Math.round(Number(next))));
    if (!Number.isFinite(clamped) || clamped === current) return;
    current = clamped;
    readout.textContent = String(current);
    if (notify) onChange?.(current);
  }
  const minus = el('button', { type: 'button', class: 'sk-step-btn', text: '−', on: { click: () => set(current - 1) } });
  minus.setAttribute('aria-label', `${label} down`);
  const plus = el('button', { type: 'button', class: 'sk-step-btn', text: '+', on: { click: () => set(current + 1) } });
  plus.setAttribute('aria-label', `${label} up`);
  const root = el('div', { class: 'sk-field' }, [
    el('span', { class: 'sk-field-label', text: label }),
    el('div', { class: 'sk-step-row' }, [minus, readout, plus]),
  ]);
  return { root, set, value: () => current };
}

/** An on/off switch. */
export function toggle({ label, checked, onChange }) {
  const box = el('input', { type: 'checkbox', class: 'sk-toggle-box', checked: !!checked, on: { change: () => onChange?.(box.checked) } });
  const root = el('label', { class: 'sk-toggle' }, [box, el('span', { class: 'sk-toggle-label', text: label })]);
  return { root, checked: () => box.checked, set(next) { box.checked = !!next; } };
}
