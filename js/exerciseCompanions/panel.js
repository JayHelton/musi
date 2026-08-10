import { describeCompanion } from './types.js';

let uidSeq = 0;

export function nextUid(prefix = 'ec') {
  uidSeq += 1;
  return `${prefix}-${uidSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createCompanionPanel(host, companion, options = {}) {
  const uid = nextUid('ec');
  const panel = document.createElement('section');
  panel.className = 'ec-panel';
  panel.dataset.companionId = companion.id;
  panel.dataset.companionType = companion.type;

  const headingId = `${uid}-heading`;
  const bodyId = `${uid}-body`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ec-toggle';
  toggle.id = headingId;
  toggle.setAttribute('aria-controls', bodyId);
  toggle.setAttribute('aria-expanded', companion.collapsed ? 'false' : 'true');

  const titleText = companion.label?.trim() || describeCompanion(companion);
  const lockLine = document.createElement('span');
  lockLine.className = 'ec-lock';
  lockLine.textContent = titleText;

  const chevron = document.createElement('span');
  chevron.className = 'ec-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = companion.collapsed ? '▸' : '▾';

  toggle.append(lockLine, chevron);

  const body = document.createElement('div');
  body.className = 'ec-body';
  body.id = bodyId;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-labelledby', headingId);
  if (companion.collapsed) body.hidden = true;

  panel.append(toggle, body);
  host.appendChild(panel);

  let collapsed = !!companion.collapsed;

  function setCollapsed(next, notify = true) {
    collapsed = !!next;
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    chevron.textContent = collapsed ? '▸' : '▾';
    panel.classList.toggle('ec-collapsed', collapsed);
    if (notify && typeof options.onCollapsedChange === 'function') {
      options.onCollapsedChange(companion.id, collapsed);
    }
  }

  const onToggle = () => setCollapsed(!collapsed);
  toggle.addEventListener('click', onToggle);

  return {
    panel,
    body,
    uid,
    setCollapsed,
    destroy() {
      toggle.removeEventListener('click', onToggle);
      panel.remove();
    },
  };
}
