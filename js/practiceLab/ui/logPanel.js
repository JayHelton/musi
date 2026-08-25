// The live session log, the note field, and the clip controls.
//
// Every action of a session writes a line here. A clip line carries a play
// control and a delete control, and the clip plays inside the log.

import { el, clear, pressable, panel, notice } from './dom.js';
import { describeEntry, formatDuration } from '../model/session.js';

function timeOf(entry) {
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build the log list. The history detail view reuses it.
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function buildLogList({ entries, getClip, onDeleteClip, emptyText }) {
  const list = el('ol', { class: 'pl-log-list' });
  list.setAttribute('aria-label', 'Session log');
  if (!entries.length) {
    list.appendChild(el('li', { class: 'pl-log-empty' }, [notice(emptyText)]));
    return list;
  }

  for (const entry of entries) {
    const row = el('li', { class: `pl-log-row pl-log-${entry.kind}` }, [
      el('span', { class: 'pl-log-time', text: timeOf(entry) }),
      el('span', { class: 'pl-log-text', text: describeEntry(entry) }),
    ]);

    if (entry.kind === 'clip-saved' && entry.data?.clipId) {
      const removed = entry.data.removed === true;
      const media = el('div', { class: 'pl-clip-media' });
      media.hidden = true;

      const actions = el('div', { class: 'pl-log-actions' });
      if (removed) {
        actions.appendChild(el('span', { class: 'pl-log-flag', text: 'Clip deleted' }));
      } else {
        actions.append(
          pressable({
            label: 'Play',
            className: 'small',
            ariaLabel: `Play the ${formatDuration(entry.data.durationMs)} clip`,
            onPress: async (event) => {
              const btn = event.currentTarget;
              if (!media.hidden) {
                media.hidden = true;
                clear(media);
                btn.textContent = 'Play';
                return;
              }
              const clip = await getClip(entry.data.clipId);
              if (!clip || !clip.blob) {
                clear(media);
                media.appendChild(notice('That clip is no longer on this device.', 'warn'));
                media.hidden = false;
                return;
              }
              const video = el('video', { class: 'pl-clip-video', controls: true, playsInline: true });
              video.src = URL.createObjectURL(clip.blob);
              video.addEventListener('emptied', () => URL.revokeObjectURL(video.src), { once: true });
              clear(media);
              media.appendChild(video);
              media.hidden = false;
              btn.textContent = 'Hide';
              video.play().catch(() => { /* the player presses play */ });
            },
          }),
          pressable({
            label: 'Delete',
            className: 'small danger',
            ariaLabel: 'Delete this clip',
            onPress: () => onDeleteClip?.(entry.data.clipId),
          }),
        );
      }
      row.append(actions, media);
    }

    list.appendChild(row);
  }
  return list;
}

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, refresh: Function }}
 */
export function createLogPanel(lab) {
  const view = panel('Session log', 'pl-log');
  const listWrap = el('div', { class: 'pl-log-wrap' });

  const noteInput = el('input', {
    type: 'text', class: 'pl-text', placeholder: 'Add a note',
    attrs: { 'aria-label': 'Add a note to the log', maxlength: '200' },
  });

  async function addNote() {
    const text = noteInput.value;
    if (!text.trim()) return;
    noteInput.value = '';
    await lab.addNote(text);
  }

  noteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addNote(); }
  });

  function refresh() {
    clear(listWrap);
    listWrap.appendChild(buildLogList({
      entries: lab.entries(),
      getClip: (id) => lab.getClip(id),
      onDeleteClip: (id) => lab.deleteClip(id),
      emptyText: 'Nothing logged yet. Start a timer or the click.',
    }));
    listWrap.scrollTop = listWrap.scrollHeight;
  }

  view.body.append(
    listWrap,
    el('div', { class: 'pl-add-row' }, [
      noteInput,
      pressable({ label: 'Note', onPress: addNote, ariaLabel: 'Save this note' }),
    ]),
  );

  refresh();
  return { root: view.root, refresh };
}
