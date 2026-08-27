// The history: the session list and the session detail.
//
// The list holds the date, the instrument, the technique, the target, the
// practice time, and the clip count. The detail shows the full log, and a clip
// plays inside it.

import { el, clear, pressable, notice } from './dom.js';
import { buildLogList } from './logPanel.js';
import { formatDuration, rollUpTotals, plural } from '../model/session.js';
import { warmUpLabel } from '../adapters/musiDrumLibrary.js';

function dateOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * @param {Object} lab
 * @returns {{ root: HTMLElement, refresh: Function }}
 */
export function createHistoryView(lab) {
  const listWrap = el('div', { class: 'pl-history-list' });
  const detailWrap = el('div', { class: 'pl-history-detail' });
  detailWrap.hidden = true;

  async function openDetail(id) {
    const record = await lab.readSession(id);
    if (!record) return;
    const { session, entries } = record;
    const totals = rollUpTotals(entries);
    clear(detailWrap);
    detailWrap.append(
      el('div', { class: 'pl-history-detail-head' }, [
        pressable({ label: '← All sessions', onPress: () => closeDetail() }),
        el('h3', {
          class: 'pl-history-title',
          text: `${session.instrument} · ${session.technique}`,
        }),
        el('p', { class: 'pl-history-meta', text: dateOf(session.startedAt) }),
        el('p', { class: 'pl-history-target', text: session.target }),
        el('p', {
          class: 'pl-history-meta',
          text: `${formatDuration(totals.timerMs)} on the clock · ${plural(totals.clips, 'clip')}${totals.topBpm ? ` · top ${totals.topBpm} BPM` : ''}`,
        }),
        // The warm-up is on the record, so the history shows what this session
        // covered and the picker keeps its cooldown honest.
        session.warmUp
          ? el('p', { class: 'pl-history-warmup', text: `Warm-up — ${warmUpLabel(session.warmUp)}` })
          : null,
      ]),
      buildLogList({
        entries,
        getClip: (clipId) => lab.getClip(clipId),
        onDeleteClip: async (clipId) => {
          await lab.deleteClip(clipId);
          openDetail(id);
        },
        emptyText: 'This session holds no log lines.',
      }),
    );
    detailWrap.hidden = false;
    listWrap.hidden = true;
  }

  function closeDetail() {
    detailWrap.hidden = true;
    listWrap.hidden = false;
    refresh();
  }

  async function removeSession(session) {
    const question = `Delete the session of ${dateOf(session.startedAt)}? Its log and its clips go too.`;
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(question)
      : true;
    if (!ok) return;
    await lab.deleteSession(session.id);
    refresh();
  }

  async function refresh() {
    const sessions = await lab.listSessions();
    clear(listWrap);
    if (!sessions.length) {
      listWrap.appendChild(notice('No sessions yet. Start one on the Session tab.'));
      return;
    }
    for (const session of sessions) {
      const totals = session.totals || { timerMs: 0, clips: 0, topBpm: 0 };
      const row = el('article', { class: `pl-history-row${session.status === 'active' ? ' open' : ''}` }, [
        el('div', { class: 'pl-history-row-main' }, [
          el('p', { class: 'pl-history-meta', text: dateOf(session.startedAt) }),
          el('h4', {
            class: 'pl-history-row-title',
            text: `${session.instrument} · ${session.technique}`,
          }),
          el('p', { class: 'pl-history-target', text: session.target }),
          el('p', {
            class: 'pl-history-meta',
            text: `${formatDuration(totals.timerMs)} · ${plural(totals.clips, 'clip')}${totals.topBpm ? ` · top ${totals.topBpm} BPM` : ''}${session.status === 'active' ? ' · still open' : ''}`,
          }),
        ]),
        el('div', { class: 'pl-history-row-actions' }, [
          pressable({
            label: 'Open',
            className: 'small',
            ariaLabel: `Open the session of ${dateOf(session.startedAt)}`,
            onPress: () => openDetail(session.id),
          }),
          pressable({
            label: 'Delete',
            className: 'small danger',
            ariaLabel: `Delete the session of ${dateOf(session.startedAt)}`,
            onPress: () => removeSession(session),
          }),
        ]),
      ]);
      listWrap.appendChild(row);
    }
  }

  const root = el('div', { class: 'pl-history' }, [listWrap, detailWrap]);
  refresh();
  return { root, refresh };
}
