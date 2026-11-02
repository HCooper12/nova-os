// WHAT HE LOGGED OFFLINE STAYS WHERE HE PUT IT (offline mode, 2 Nov 2026).
//
// Before this, a meal logged at a gym with no signal went into the Outbox and
// VANISHED from the day; a shopping line and a capture did the same. The
// write was safe, but the screen said it had not happened, which is the one
// thing Apple Notes never does. So every queued write is drawn back into the
// list it belongs to, marked `queued` (the screens say "waiting for your
// Mac"), and the mark goes the moment the Mac files it and the real row
// replaces it.
//
// Pure functions, applied to the live slices whenever the slices or the
// Outbox change. Each call strips every queued row first and re-adds the
// ones still queued, so applying it twice changes nothing, and a row whose
// item has landed (or was discarded) simply stops being added.
//
// Totals: a queued meal counts in the day's totals, exactly as the optimistic
// row of an online log does for the half second before the Mac answers. He
// ate it; only the filing waits. The row itself says so.
export const QUEUED_PREFIX = 'queued-';
export const isQueuedId = (id) => String(id ?? '').startsWith(QUEUED_PREFIX);
export const queuedItemId = (id) => String(id ?? '').slice(QUEUED_PREFIX.length);
export const QUEUED_WORDS = 'Waiting for your Mac';

const waiting = (outbox, kind) => (outbox || []).filter((i) => i && i.kind === kind && i.status === 'queued');
const notQueued = (rows, idOf = (r) => r.id) => (rows || []).filter((r) => !r?.queued && !isQueuedId(idOf(r)));

// local calendar day, the same shape the server's food log uses (YYYY-MM-DD)
export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// a food day ({ date, entries }) with its queued meals; a payload without a
// date was logged to "today" as it was then, which is the day it was queued
export function foodDayWithQueued(day, outbox) {
  if (!day || !Array.isArray(day.entries)) return day;
  const add = waiting(outbox, 'food')
    .filter((i) => (i.payload?.date || localDay(new Date(i.queuedAt))) === day.date)
    .map((i) => ({
      id: QUEUED_PREFIX + i.id, name: i.payload.name, macros: i.payload.macros || { p: 0, c: 0, f: 0, kcal: 0 },
      source: i.payload.source || 'manual', ...(i.payload.items ? { items: i.payload.items } : {}),
      time: new Date(i.queuedAt).toTimeString().slice(0, 5), pending: true, queued: true,
    }));
  const kept = notQueued(day.entries);
  if (!add.length && kept.length === day.entries.length) return day;
  return { ...day, entries: [...kept, ...add] };
}

export function shoppingWithQueued(list, outbox) {
  if (!list || !Array.isArray(list.items)) return list;
  const add = waiting(outbox, 'shopping').flatMap((i) => (i.payload?.items || []).map((it, n) => ({
    id: `${QUEUED_PREFIX}${i.id}-${n}`, name: it.name, source: it.source || null, checked: false, qty: 1,
    category: 'Household & Other', pending: true, queued: true,
  })));
  const kept = notQueued(list.items);
  if (!add.length && kept.length === list.items.length) return list;
  return { ...list, items: [...kept, ...add] };
}

// the Inbox draws a capture with no routing yet as a card of its own
export function inboxWithQueued(inbox, outbox) {
  if (!inbox || !Array.isArray(inbox.items)) return inbox;
  const add = waiting(outbox, 'capture').map((i) => ({
    id: QUEUED_PREFIX + i.id, kind: null, text: i.payload?.text || i.label, status: 'classifying',
    source: i.payload?.source || 'text', mode: i.payload?.mode, createdAt: i.queuedAt,
    pendingLocally: true, queued: true,
  }));
  const kept = notQueued(inbox.items);
  if (!add.length && kept.length === inbox.items.length) return inbox;
  return { ...inbox, items: [...add, ...kept] };
}

export function todosWithQueued(todos, outbox) {
  if (!todos || !Array.isArray(todos.items)) return todos;
  const add = waiting(outbox, 'todo').map((i) => ({
    raw: QUEUED_PREFIX + i.id, text: i.payload?.text || i.label, checked: false, category: null, pending: true, queued: true,
  }));
  // the add's own optimistic row (`__pending__…`) is superseded by the queued one
  const kept = notQueued(todos.items, (r) => r.raw).filter((r) => !(add.length && String(r.raw || '').startsWith('__pending__')));
  if (!add.length && kept.length === todos.items.length) return todos;
  return { ...todos, items: [...kept, ...add] };
}

// his journal days ([{ date, sections }]) with the lines he wrote offline
export function journalWithQueued(days, outbox) {
  if (!Array.isArray(days)) return days;
  const add = waiting(outbox, 'journal').map((i) => {
    const at = new Date(i.queuedAt);
    const p = i.payload || {};
    return { date: localDay(at), section: {
      time: at.toTimeString().slice(0, 5), category: 'personal', by: 'Hayden', author: 'hayden',
      tag: p.tag || 'own', prompt: p.prompt || null, promptFrom: p.promptFrom || null,
      words: p.text, text: p.text, novaId: QUEUED_PREFIX + i.id, queued: true,
    } };
  });
  const had = days.some((d) => (d.sections || []).some((x) => x.queued));
  if (!add.length && !had) return days;
  let out = days.map((d) => ({ ...d, sections: (d.sections || []).filter((x) => !x.queued) }));
  for (const { date, section } of add) {
    const at = out.findIndex((d) => d.date === date);
    out = at === -1 ? [{ date, sections: [section] }, ...out] : out.map((d, n) => (n === at ? { ...d, sections: [...d.sections, section] } : d));
  }
  return out;
}

// a finished session waiting to file, drawn into the history it will join
export function historyWithQueued(sessions, outbox, routineId = null) {
  if (!Array.isArray(sessions)) return sessions;
  const add = waiting(outbox, 'session')
    .filter((i) => i.payload?.payload && (!routineId || i.payload.payload.routineId === routineId))
    .map((i) => ({
      ...i.payload.payload, id: QUEUED_PREFIX + i.id,
      date: localDay(new Date(i.queuedAt)), queued: true,
    }));
  const kept = notQueued(sessions);
  return add.length ? [...add, ...kept] : kept;
}

// every slice above at once: the state patch to merge after a sync, a boot
// hydrate, or a change to the Outbox. Only the keys that changed come back.
export function queuedPatch(st) {
  const out = {};
  const pairs = [
    ['liveFoodLog', foodDayWithQueued], ['liveFoodLogView', foodDayWithQueued],
    ['liveShoppingList', shoppingWithQueued], ['liveInbox', inboxWithQueued], ['liveTodos', todosWithQueued],
    ['liveJournalEntries', journalWithQueued],
  ];
  for (const [key, fn] of pairs) {
    const next = fn(st[key], st.outbox);
    if (next !== st[key]) out[key] = next;
  }
  return out;
}
