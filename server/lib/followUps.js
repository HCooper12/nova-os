// CALENDAR FOLLOW-UPS, SERVER-SIDE. "I don't always follow my calendar
// exactly" — a task-like event ("Cook", "Tank Wash", "Plan meals and shopping
// list") gets an evening "did it happen?". The question used to exist only
// in the open app (an ephemeral proposal composed on the client), so an
// unopened evening lost it and nothing ever asked about yesterday. Now the
// sweep files real pending records on the rails — Done approves (a journal
// receipt), Discard lets it go — and a morning pass asks once about
// yesterday's leftovers. The client's live proposal stays as the fast path
// over the SAME records (it skips events that already have one).
//
// TASK_HINTS is a shared format with src/vals/valsInbox.js (pinned by test).
// VALIDATED on his real calendar 3 Sep 2026: 744 events over 120 days, 4
// task-hint labels, every one a genuine task (Plan meals and shopping list,
// Cook, Tank Wash, Tidy up) — zero false positives.
import { randomUUID } from 'node:crypto';
import { createRecord, listRecords } from './inboxStore.js';

export const TASK_HINTS = ['meal prep', 'prep', 'cook', 'clean', 'laundry', 'groceries', 'grocery', 'shopping', 'errand', 'organise', 'organize', 'admin', 'wash', 'tidy', 'pick up', 'drop off', 'book ', 'call ', 'pay ', 'renew', 'study', 'review notes'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const norm = (s) => String(s || '').trim().toLowerCase();

export function isTaskEvent(label) {
  const lower = ` ${norm(label)} `;
  return !!lower.trim() && TASK_HINTS.some((h) => lower.includes(h));
}

export const followUpKey = (date, label) => `followup:${date}:${norm(label).replace(/[^a-z0-9]+/g, '-')}`;

// Which of a day's events still need asking about: task-like, no follow-up
// record for that day yet (any status — an answered or dismissed question
// is answered), and no open to-do with the same text (he already carries
// it). Pure.
export function pendingFollowUps({ date, events = [], records = [], openTodos = [] }) {
  const have = new Set(records.filter((r) => r.kind === 'followup').map((r) => r.findingKey || (r.decision?.payload?.eventLabel ? followUpKey(r.decision.payload.date || (r.createdAt || '').slice(0, 10), r.decision.payload.eventLabel) : followUpKey((r.createdAt || '').slice(0, 10), String(r.text || '').replace(/^✓ /, '').replace(/^Did “(.*)” happen\??$/, '$1')))));
  const todos = new Set(openTodos.map((t) => norm(typeof t === 'string' ? t : t.text)));
  const seen = new Set();
  const out = [];
  for (const ev of events) {
    const label = String(ev.label || '').trim();
    if (!label || !isTaskEvent(label)) continue;
    const key = followUpKey(date, label);
    if (seen.has(key) || have.has(key) || todos.has(norm(label))) continue;
    seen.add(key);
    out.push({ key, label, time: ev.time || '', date });
  }
  return out;
}

export function followUpRecord({ key, label, time, date }, { yesterday = false, now = new Date() } = {}) {
  const when = yesterday ? 'yesterday' : 'today';
  const title = `Did “${label}” happen?`;
  return {
    id: randomUUID().slice(0, 8),
    kind: 'followup',
    findingKey: key,
    text: title,
    source: 'calendar',
    mode: 'draft',
    status: 'pending',
    createdAt: now.toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title: `✓ ${label}`,
      reason: `“${label}” was on ${when}'s calendar${time ? ` at ${time}` : ''}. Approve if it happened — it journals the receipt; discard if it didn't.`,
      payload: { text: `✓ ${label}${time ? ` (${time} on the calendar)` : ''} — done${yesterday ? ` (${date})` : ''}.`, category: 'system', label: 'Calendar follow-up', eventLabel: label, date },
    },
  };
}

// The sweep. Evening (≥19:00): today's task events. Morning (07:00–11:00):
// yesterday's leftovers, once — the records themselves are the memory.
export async function sweepFollowUps(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  const h = now.getHours();
  const evening = h >= 19;
  const morning = h >= 7 && h < 11;
  if (!evening && !morning) return { created: [], skipped: 'outside the windows' };
  const eventsFor = deps.eventsFor || (async (d) => (await import('./calendar.js')).fetchEventsForDay(d));
  const records = deps.records || await listRecords();
  let openTodos = deps.openTodos;
  if (!openTodos) {
    try { openTodos = (await (await import('./todos.js')).listTodos(vaultPath)).items.filter((t) => !t.checked); } catch { openTodos = []; }
  }
  const target = new Date(now);
  if (morning) target.setDate(target.getDate() - 1);
  const date = iso(target);
  let events = [];
  try { events = await eventsFor(target); } catch { return { created: [], skipped: "calendar couldn't be read" }; }
  const due = pendingFollowUps({ date, events, records, openTodos });
  const created = [];
  for (const q of due) created.push(await (deps.createRecord || createRecord)(followUpRecord(q, { yesterday: morning, now })));
  return { created, date, window: morning ? 'morning' : 'evening' };
}

export function startFollowUpScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('followups');
    try { await sweepFollowUps(vaultPath); } catch (err) { console.error('follow-up sweep failed:', err.message); }
  };
  tick();
  setInterval(tick, 3600_000).unref?.();
}
