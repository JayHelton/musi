// Minimal DOM shim for Node smoke tests (GP player UI modules).

export function installDomShim() {
  if (typeof document !== 'undefined' && document.querySelector) return;

  function matchesSelector(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith('.')) {
      return (el.className || '').split(/\s+/).filter(Boolean).includes(sel.slice(1));
    }
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('[id$=')) {
      const suffix = sel.match(/^\[id\$=\"([^\"]+)\"\]$/)?.[1];
      return suffix ? String(el.id || '').endsWith(suffix) : false;
    }
    if (sel.startsWith('[aria-label=')) {
      const label = sel.match(/^\[aria-label=\"([^\"]+)\"\]$/)?.[1];
      return label ? el.getAttribute?.('aria-label') === label : false;
    }
    return el.tagName?.toLowerCase() === sel.toLowerCase();
  }

  function querySelector(root, sel) {
    if (matchesSelector(root, sel)) return root;
    for (const child of root.children || []) {
      const hit = querySelector(child, sel);
      if (hit) return hit;
    }
    return null;
  }

  function querySelectorAll(root, sel) {
    const out = [];
    function walk(node) {
      if (matchesSelector(node, sel)) out.push(node);
      for (const child of node.children || []) walk(child);
    }
    walk(root);
    return out;
  }

  function makeEvent(type, init = {}) {
    let defaultPrevented = false;
    let propagationStopped = false;
    return {
      type,
      key: init.key || '',
      shiftKey: !!init.shiftKey,
      target: init.target || null,
      currentTarget: null,
      pointerId: init.pointerId ?? 1,
      preventDefault() { defaultPrevented = true; },
      stopPropagation() { propagationStopped = true; },
      get defaultPrevented() { return defaultPrevented; },
      get propagationStopped() { return propagationStopped; },
    };
  }

  function makeStyleStore() {
    const props = new Map();
    const api = {
      setProperty(name, value) { props.set(String(name), String(value)); },
      removeProperty(name) {
        const had = props.has(name);
        props.delete(name);
        return had ? props.get(name) || '' : '';
      },
      getPropertyValue(name) { return props.get(name) || ''; },
    };
    return new Proxy(api, {
      set(_t, prop, value) {
        if (prop in api) return false;
        props.set(String(prop), String(value));
        return true;
      },
      get(_t, prop) {
        if (prop in api) return api[prop];
        return props.get(String(prop));
      },
    });
  }

  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      dataset: {},
      children: [],
      attributes: {},
      parentElement: null,
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      hidden: false,
      disabled: false,
      clientWidth: 600,
      tabIndex: -1,
      offsetTop: 0,
      offsetLeft: 0,
      classList: {
        _classes: new Set(),
        add(...c) { c.forEach((x) => this._classes.add(x)); el.className = [...this._classes].join(' '); },
        remove(...c) { c.forEach((x) => this._classes.delete(x)); el.className = [...this._classes].join(' '); },
        toggle(c, force) {
          if (force === true) { this.add(c); return true; }
          if (force === false) { this.remove(c); return false; }
          if (this.contains(c)) { this.remove(c); return false; }
          this.add(c);
          return true;
        },
        contains(c) { return this._classes.has(c); },
      },
      set className(v) {
        this._className = v || '';
        this.classList._classes = new Set(this._className.split(/\s+/).filter(Boolean));
      },
      get className() {
        return this._className || '';
      },
      setAttribute(k, v) {
        this.attributes[k] = v;
        if (k === 'hidden') this.hidden = true;
        if (k === 'disabled') this.disabled = true;
        if (k === 'id') {
          this.id = v;
          document._byId.set(v, this);
        }
        if (k === 'class') this.className = v;
        if (k === 'value') this.value = v;
      },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(c) {
        if (!c) return c;
        this.children.push(c);
        c.parentElement = this;
        if (c.id) document._byId.set(c.id, c);
        return c;
      },
      append(...nodes) { nodes.flat().forEach((n) => this.appendChild(n)); },
      insertBefore(c, ref) {
        const i = this.children.indexOf(ref);
        if (i >= 0) this.children.splice(i, 0, c);
        else this.children.push(c);
        c.parentElement = this;
        return c;
      },
      removeChild(c) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);
        c.parentElement = null;
        return c;
      },
      replaceChild(next, prev) {
        const i = this.children.indexOf(prev);
        if (i >= 0) {
          this.children[i] = next;
          next.parentElement = this;
          prev.parentElement = null;
        } else {
          this.appendChild(next);
        }
        return prev;
      },
      querySelector(sel) { return querySelector(this, sel); },
      querySelectorAll(sel) { return querySelectorAll(this, sel); },
      closest(sel) {
        let node = this;
        while (node) {
          if (matchesSelector(node, sel)) return node;
          node = node.parentElement;
        }
        return null;
      },
      getBoundingClientRect() {
        const left = this.offsetLeft || 0;
        const top = this.offsetTop || 0;
        return { left, top, right: left + 112, bottom: top + 80, width: 112, height: 80 };
      },
      contains(node) {
        let cur = node;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      addEventListener(type, fn) {
        if (!el._listeners) el._listeners = {};
        if (!el._listeners[type]) el._listeners[type] = [];
        el._listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (!el._listeners?.[type]) return;
        el._listeners[type] = el._listeners[type].filter((h) => h !== fn);
      },
      dispatch(type, event = {}) {
        const ev = event.type ? event : makeEvent(type, { ...event, target: event.target || el });
        let node = el;
        while (node) {
          ev.currentTarget = node;
          if (!ev.target) ev.target = el;
          for (const fn of node._listeners?.[type] || []) fn.call(node, ev);
          if (ev.propagationStopped) break;
          node = node.parentElement;
        }
        return !ev.propagationStopped;
      },
      dispatchEvent(event) {
        const type = event?.type;
        if (!type) return true;
        return this.dispatch(type, event);
      },
      click() { this.dispatch('click'); },
      change() { this.dispatch('change'); },
      input() { this.dispatch('input'); },
      focus() {
        document._activeElement = el;
        this.dispatch('focus');
      },
      blur() {
        if (document._activeElement === el) document._activeElement = null;
        this.dispatch('blur');
      },
      setPointerCapture() { el._pointerCapture = true; },
      releasePointerCapture() { el._pointerCapture = false; },
    };
    Object.defineProperty(el, 'style', {
      get() {
        if (!el._style) el._style = makeStyleStore();
        return el._style;
      },
      configurable: true,
    });
    if (String(tag).toLowerCase() === 'details') {
      Object.defineProperty(el, 'open', {
        get() { return !!el._open; },
        set(v) { el._open = !!v; },
        configurable: true,
      });
    }
    if (String(tag).toLowerCase() === 'option') {
      el.selected = false;
    }
    if (String(tag).toLowerCase() === 'select') {
      Object.defineProperty(el, 'value', {
        get() {
          const opt = el.children.find((c) => c.selected);
          if (opt) return opt.value ?? opt.attributes?.value ?? '';
          return el.children[0]?.value ?? el.children[0]?.attributes?.value ?? '';
        },
        set(v) {
          let matched = false;
          el.children.forEach((c) => {
            const ov = c.value ?? c.attributes?.value ?? '';
            c.selected = ov === v;
            if (c.selected) matched = true;
          });
          if (!matched && el.children[0]) el.children[0].selected = true;
        },
      });
    }
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._innerHTML || ''; },
      set(v) {
        el._innerHTML = v;
        el.children = [];
      },
    });
    return el;
  }

  const head = makeEl('head');
  const body = makeEl('body');
  const root = {
    head,
    body,
    _byId: new Map(),
    _activeElement: null,
    createElement: makeEl,
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    getElementById(id) { return this._byId.get(id) || null; },
    elementFromPoint(x, y) {
      function walk(node) {
        const r = node.getBoundingClientRect?.();
        if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          let deepest = node;
          for (const child of node.children || []) {
            const hit = walk(child);
            if (hit) deepest = hit;
          }
          return deepest;
        }
        return null;
      }
      for (const child of [...body.children, ...head.children]) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    },
    querySelector(sel) { return querySelector(body, sel) || querySelector(head, sel); },
    querySelectorAll(sel) { return querySelectorAll(body, sel); },
    addEventListener(type, fn) {
      if (!root._listeners) root._listeners = {};
      if (!root._listeners[type]) root._listeners[type] = [];
      root._listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!root._listeners?.[type]) return;
      root._listeners[type] = root._listeners[type].filter((h) => h !== fn);
    },
    dispatchKey(type, init = {}) {
      const ev = makeEvent(type, init);
      for (const fn of root._listeners?.[type] || []) fn.call(root, ev);
      return ev;
    },
  };
  Object.defineProperty(root, 'activeElement', {
    get() { return root._activeElement; },
    configurable: true,
  });

  globalThis.document = root;
  globalThis.window = globalThis.window || globalThis;
  window.document = root;
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {}
    disconnect() {}
  };
  window.requestAnimationFrame = window.requestAnimationFrame || (() => 0);
  window.cancelAnimationFrame = window.cancelAnimationFrame || (() => {});
}
