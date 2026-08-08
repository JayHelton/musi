// DOM helpers for the Guitar Pro parchment player.

let uidCounter = 0;

/**
 * Create an element with props and children (copied from gpPlayerUI pattern).
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') {
      if (typeof v === 'string') node.setAttribute('style', v);
      else if (v && typeof v === 'object') {
        Object.entries(v).forEach(([prop, val]) => {
          if (val == null || val === false) return;
          if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
          else node.style[prop] = String(val);
        });
      }
    } else if (k.startsWith('on') && typeof v === 'function') node[k.toLowerCase()] = v;
    else if (v === false || v == null) { /* skip */ }
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

/** Unique element id (avoids collisions when GP Player + Exercises both mount). */
export function uid(prefix = 'gpp') {
  uidCounter += 1;
  return `${prefix}-${uidCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Format seconds as m:ss. */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
