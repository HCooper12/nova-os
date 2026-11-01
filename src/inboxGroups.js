// ONE DECISION FOR A PROGRAM REBUILD (1 Nov 2026). The Coach redid his
// program from one request and filed 24 cards in the same second: three new
// training days, eighteen lifts in them, three schedule moves. To him that is
// one decision, and he said so ("those decisions can be discarded if there's
// nothing to actually agree upon").
//
// Pure: pending Inbox records in, groups out; the order a group's members
// must be filed in; a summary line counted by code; which card a blocked
// card waits on. Nothing here writes. Apply all and Discard all call the
// EXISTING per-record approve and discard routes, one after another, in the
// order this file decides (src/inboxGroupRun.js), so every filing keeps its
// own undo.

export const GROUP_WINDOW_MS = 5000;
const GROUPABLE = new Set(['routine-edit', 'schedule-edit']);
const NEW = 'new:';
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const key = (s) => String(s || '').trim().toLowerCase();
const at = (r) => Date.parse(r?.createdAt || '') || 0;
const routeOf = (r) => r?.decision?.route;
const payloadOf = (r) => r?.decision?.payload || {};

// A Coach rebuild: pending, from the Coach, a program or week change, the
// same request text, filed within GROUP_WINDOW_MS of the group's first card.
// Two or more make a group. Members are listed oldest first.
export function rebuildGroups(records = []) {
  const byText = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || r.status !== 'pending' || r.source !== 'coach' || !GROUPABLE.has(routeOf(r))) continue;
    const t = String(r.text || '').trim();
    if (!t) continue;
    if (!byText.has(t)) byText.set(t, []);
    byText.get(t).push(r);
  }
  const groups = [];
  for (const [text, list] of byText) {
    const sorted = [...list].sort((a, b) => at(a) - at(b));
    let cur = null;
    for (const r of sorted) {
      if (cur && at(r) - at(cur[0]) <= GROUP_WINDOW_MS) cur.push(r);
      else { cur = [r]; groups.push({ text, members: cur }); }
    }
  }
  const seen = new Map();
  return groups
    .filter((g) => g.members.length >= 2)
    .map((g) => {
      const i = seen.get(g.text) || 0;
      seen.set(g.text, i + 1);
      return { key: groupKeyOf(g.text, i), text: g.text, ids: g.members.map((r) => r.id), members: g.members };
    });
}

const isCreate = (r) => routeOf(r) === 'routine-edit' && payloadOf(r).action === 'create';

// THE ORDER A YES MUST GO IN. A card aimed at a day another card creates
// (routineId `new:upper c`) is refused by the server until that day exists
// (server/lib/inbox.js fileDecision), so: the creates first, then the week
// (a day can only be given to a training day that exists), then the lifts,
// each in the order the Coach wrote them; a lift placed "after" another lift
// of the same group comes after it. A card whose day does not exist and that
// no card in the group creates cannot go in: it is BLOCKED, left out of the
// order, and named with the reason.
export function applyOrder(members = [], routineNames = []) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  const exists = new Set((routineNames || []).map(key));
  const creates = list.filter(isCreate).sort((a, b) => at(a) - at(b));
  for (const c of creates) exists.add(key(payloadOf(c).routineName));
  const blocked = [];
  const reachable = (r) => {
    const p = payloadOf(r);
    if (!String(p.routineId || '').startsWith(NEW)) return true;
    if (exists.has(key(p.routineName))) return true;
    blocked.push({ id: r.id, name: p.routineName || 'That day', reason: `${p.routineName || 'That day'} does not exist yet, and no card here creates it` });
    return false;
  };
  const week = list.filter((r) => routeOf(r) === 'schedule-edit').sort((a, b) => at(a) - at(b)).filter(reachable);
  const edits = list.filter((r) => routeOf(r) === 'routine-edit' && !isCreate(r)).sort((a, b) => at(a) - at(b)).filter(reachable);
  // a lift placed after another lift this group adds to the same day goes
  // after it: take, in the Coach's order, the first card whose "after" lift
  // is already placed (a loop of afters falls back to the Coach's order)
  const depOf = (r) => {
    const p = payloadOf(r);
    if (!p.afterName) return null;
    return edits.find((x) => x !== r && key(payloadOf(x).routineName) === key(p.routineName) && key(payloadOf(x).addName) === key(p.afterName)) || null;
  };
  const remaining = [...edits];
  const ordered = [];
  while (remaining.length) {
    const i = remaining.findIndex((r) => { const dep = depOf(r); return !dep || !remaining.includes(dep); });
    ordered.push(remaining.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return { order: [...creates, ...week, ...ordered].map((r) => r.id), blocked };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const Day = (d) => (d ? d.charAt(0).toUpperCase() + d.slice(1) : d);

// "3 new training days, 18 lifts in them, 3 schedule changes: Monday Upper A,
// Wednesday Upper B, Friday Upper C". Counted from the cards, nothing else.
export function groupSummary(members = []) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  const creates = list.filter(isCreate);
  const newDays = new Set(creates.map((c) => key(payloadOf(c).routineName)));
  const adds = list.filter((r) => routeOf(r) === 'routine-edit' && payloadOf(r).action === 'add');
  const intoNew = adds.filter((r) => newDays.has(key(payloadOf(r).routineName))).length;
  const otherEdits = list.filter((r) => routeOf(r) === 'routine-edit' && !isCreate(r) && payloadOf(r).action !== 'add').length;
  const week = list.filter((r) => routeOf(r) === 'schedule-edit')
    .map((r) => payloadOf(r))
    .sort((a, b) => WEEK.indexOf(key(a.day)) - WEEK.indexOf(key(b.day)));
  const bits = [];
  if (creates.length) bits.push(plural(creates.length, 'new training day', 'new training days'));
  if (adds.length) {
    bits.push(intoNew === adds.length && creates.length ? `${plural(adds.length, 'lift', 'lifts')} in ${creates.length === 1 ? 'it' : 'them'}` : plural(adds.length, 'lift added', 'lifts added'));
  }
  if (otherEdits) bits.push(plural(otherEdits, 'other lift change', 'other lift changes'));
  let line = bits.join(', ');
  if (week.length) {
    const days = week.map((p) => `${Day(key(p.day))} ${p.routineId ? (p.routineId === 'active-rest' ? 'active rest' : p.routineName || '') : 'rest'}`.trim()).join(', ');
    line = `${line}${line ? ', ' : ''}${plural(week.length, 'schedule change', 'schedule changes')}: ${days}`;
  }
  return line;
}

// THE CARD THIS ONE WAITS ON. A change aimed at a training day that does not
// exist yet (`new:` id, no routine of that name) waits for the card that
// creates it; null when it waits on nothing. `parentId` is that pending card,
// or null when no pending card creates the day (it stays blocked). A create
// card already FILED counts as the day existing: his routines list on the
// client can lag the filing, the server's own lookup does not.
export function waitingOn(record, { routineNames = [], records = [] } = {}) {
  if (!record || record.status !== 'pending' || !GROUPABLE.has(routeOf(record)) || isCreate(record)) return null;
  const p = payloadOf(record);
  if (!String(p.routineId || '').startsWith(NEW)) return null;
  if ((routineNames || []).some((n) => key(n) === key(p.routineName))) return null;
  const creates = (records || []).filter((r) => r && isCreate(r) && key(payloadOf(r).routineName) === key(p.routineName));
  if (creates.some((r) => r.status === 'filed')) return null;
  const parent = creates.find((r) => r.status === 'pending');
  return { name: p.routineName || 'That day', parentId: parent ? parent.id : null };
}

// the names of training days a filed create card made (see waitingOn)
export function filedDayNames(records = []) {
  return (records || []).filter((r) => r && r.status === 'filed' && isCreate(r)).map((r) => payloadOf(r).routineName).filter(Boolean);
}

// A member's line in the group's list, short and in his words.
export function memberTitle(r) {
  const p = payloadOf(r);
  const route = routeOf(r);
  const day = p.routineName || 'a training day';
  if (route === 'schedule-edit') {
    const d = Day(key(p.day)) || 'A day';
    const to = !p.routineId ? 'rest' : p.routineId === 'active-rest' ? 'active rest' : day;
    return `${d}: ${to}${p.beforeName ? ` (was ${p.beforeName})` : ''}`;
  }
  switch (p.action) {
    case 'create': return `New training day: ${day}`;
    case 'add': return `Add ${p.addName || 'a lift'} to ${day}`;
    case 'remove': return `Take ${p.removeName || 'a lift'} out of ${day}`;
    case 'swap': return `Swap ${p.removeName || 'a lift'} for ${p.addName || 'another'} on ${day}`;
    case 'move': return `Move ${p.removeName || 'a lift'} to ${day}`;
    case 'reorder': return `Move ${p.removeName || 'a lift'} to number ${p.position || '?'} on ${day}`;
    case 'targets': return `Change ${p.removeName || 'a lift'} on ${day}`;
    default: return String(r?.decision?.title || '').replace(/^Coach:\s*/, '') || 'A change to your program';
  }
}

// one stable key per rebuild while its members are filed one by one (the
// oldest member changes as they go; the request text and its order do not)
export function groupKeyOf(text, index = 0) {
  let h = 0;
  for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `rebuild:${(h >>> 0).toString(36)}:${index}`;
}

// What a group run did, in plain words, for the card to say.
export function groupRunLine(run, titleOf = (id) => id) {
  if (!run) return '';
  const total = run.total || 0;
  const done = (run.done || []).length;
  const verb = run.kind === 'discard' ? 'Discarded' : 'Applied';
  if (run.running) return `${run.kind === 'discard' ? 'Discarding' : 'Applying'} ${done + 1} of ${total}…`;
  if (run.failed) {
    const left = total - done;
    return `${verb} ${done} of ${total}. Stopped at "${titleOf(run.failed.id)}": ${run.failed.error}. ${plural(left, 'change is', 'changes are')} still waiting.`;
  }
  return `${verb} all ${total}.${run.kind === 'discard' ? '' : ' Each one can be undone in Filed.'}`;
}
