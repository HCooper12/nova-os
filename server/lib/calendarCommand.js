import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { randomUUID } from 'node:crypto';
import { fetchEventsForRangeRaw } from './calendar.js';
import { createRecord } from './inboxStore.js';
import { laneEnabled, laneOffError } from './modelPrefs.js';
import { runTextLane } from './textLane.js';
import { parseEventLocal, EDIT_WORDS_RE } from './calendarLocal.js';

// Turn a spoken/typed request into ONE structured calendar op — add, move, or
// delete — then file it as a confirm-first inbox proposal. The model only
// INTERPRETS and identifies which event; the actual iCloud write happens later
// in fileDecision, when the user approves. Nothing here touches the calendar.
const RANGE_DAYS = 21; // how far ahead the interpreter can see + act

function buildPrompt(text, nowLocal, tz, events) {
  const list = events.length
    ? events.map((e) => `[${e.id}] ${e.date} ${e.time}${e.end ? '–' + e.end : ''} "${e.label}"${e.recurring ? ' (repeats)' : ''}`).join('\n')
    : '(no events in the next few weeks)';
  return `You convert a person's natural-language calendar request into structured operations. The current LOCAL date-time is ${nowLocal} (timezone ${tz}) — treat that as "now"/"today" and resolve every relative reference against it. Output times as ISO 8601 carrying ${tz}'s UTC offset.

Their upcoming events, each with an [id]:
${list}

Request: "${text}"

Output ONLY a JSON array of operations — one object per thing they asked for. A request like "push X to 10:30 and move Y to 12:15" is TWO operations, so return two objects. Most requests are one; return a single-element array then.
- ADD a new event → {"action":"create","title":<short title>,"start":<ISO>,"end":<ISO>,"notes":<string|null>,"calendarName":<a calendar they named|null>}  (no end/duration → make end 1h after start; a date with no time → 09:00)
- MOVE / reschedule an existing event → {"action":"move","id":"<the [id] of the event they mean>","start":<ISO>,"end":<ISO>}  (keep its original duration unless they state a new one)
- DELETE / cancel an existing event → {"action":"delete","id":"<the [id]>"}
- If you can't identify which event or it can't be done → {"action":"none","reason":<one short sentence>}

A recurring event CAN be moved: moving one names just that occurrence and leaves the rest of the series alone, so treat "push my workout to 10:30" as a normal move even when the event is marked recurring — only refuse if you genuinely cannot tell WHICH event they mean.

Match the intended event by its title and time. No markdown, no prose — just the JSON array.`;
}

// → { parsed, via }: the model's operations, and who read them (Claude, or
// the model on this Mac: lib/textLane.js), kept on each proposal record.
async function interpret(prompt) {
  const out = await runTextLane('calendar-command', prompt, { json: true });
  const raw = out.text || '';
  const m = raw.match(/\[[\s\S]*\]/) || firstBalancedObjectMatch(raw);
  if (!m) throw new Error('no JSON found in the response');
  return { parsed: parseModelJson(m[0]), via: { provider: out.provider, fallback: !!out.fallback } };
}

function fileProposal(record) { return createRecord(record).then(() => ({ proposed: true, record })); }

// A change he TYPED, for TODAY, is not a suggestion needing review — he
// already decided. Same-day edits apply straight away (still fully undoable
// via the record's undo data); anything on a future day keeps the
// confirm-first gate, where a misread date is expensive and easy to miss.
function isToday(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
async function applyNow(vaultPath, record, whenISO) {
  if (!vaultPath || !isToday(whenISO)) return fileProposal(record);
  try {
    const { fileDecision } = await import('./inbox.js');
    const { destination, undo } = await fileDecision(vaultPath, record.decision, { source: 'calendar-direct' });
    await createRecord({ ...record, status: 'filed', mode: 'auto', destination, undoData: undo || null, filedAt: new Date().toISOString() });
    return { proposed: true, applied: true, record: { ...record, status: 'filed', destination } };
  } catch (e) {
    // couldn't write it — fall back to a proposal rather than losing the ask
    return fileProposal({ ...record, text: `${record.text} (needs your approval — ${e.message})` });
  }
}
function whenLabel(iso) { return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

export async function runCalendarCommand(text, vaultPath = null) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Tell Nova what to change.');

  // CODE FIRST for an add. When the title and time read with certainty no
  // model is asked: faster, free, and it works when Claude is out of usage.
  // Same rails as the model's add: proposeOne applies it straight away when it
  // is for today, otherwise files a confirm-first proposal (both undoable).
  const local = parseEventLocal(clean, new Date());
  if (local) {
    return proposeOne({ action: 'create', title: local.title, start: local.start.toISOString(), end: local.end.toISOString(), notes: null, calendarName: null }, clean, [], vaultPath);
  }

  // factual (24 Oct): this only fires when the lane is switched off, so say that
  const claudeDown = () => new Error(EDIT_WORDS_RE.test(clean)
    ? `Moving or deleting needs Claude, and ${laneOffError('calendar-command').message} Nothing changed.`
    : `Nova couldn't read a time in that, and ${laneOffError('calendar-command').message} Try 'dentist Friday 3pm'.`);
  if (!laneEnabled('calendar-command')) throw claudeDown();

  let events = [];
  try { events = await fetchEventsForRangeRaw(RANGE_DAYS); } catch { /* range is best-effort */ }

  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowLocal = now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  let parsed;
  let via = null;
  try { ({ parsed, via } = await interpret(buildPrompt(clean, nowLocal, tz, events))); } catch { throw claudeDown(); }
  // One request can carry several changes ("push X to 10:30 AND move Y to
  // 12:15") — each becomes its own proposal so he can approve them
  // independently. A lone object still works (older prompt shape).
  const ops = Array.isArray(parsed) ? parsed : [parsed];
  if (!ops.length) return { proposed: false, reason: "I couldn't turn that into a calendar change." };
  if (ops.length > 1) {
    const results = [];
    for (const one of ops) results.push(await proposeOne(one, clean, events, vaultPath, via));
    const ok = results.filter((r) => r.proposed);
    if (!ok.length) return { proposed: false, reason: results.map((r) => r.reason).filter(Boolean).join(' ') || "I couldn't turn that into a calendar change." };
    return {
      proposed: true,
      count: ok.length,
      records: ok.map((r) => r.record),
      record: ok[0].record,
      ...(ok.length < results.length ? { partial: results.filter((r) => !r.proposed).map((r) => r.reason).join(' ') } : {}),
    };
  }
  return proposeOne(ops[0], clean, events, vaultPath, via);
}

// `via` (who read the request, from interpret) rides on the record; a change
// code read on its own (parseEventLocal) carries none.
async function proposeOne(op, clean, events, vaultPath, via = null) {
  const base = {
    id: randomUUID().slice(0, 8), kind: 'calendar', source: 'nova', mode: 'draft', status: 'pending', createdAt: new Date().toISOString(),
    ...(via ? { provider: via.provider, fallback: !!via.fallback } : {}),
  };

  // ---- ADD ----------------------------------------------------------------
  if (op && op.action === 'create') {
    const start = new Date(op.start);
    const end = new Date(op.end);
    if (!op.title || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
      return { proposed: false, reason: "I couldn't work out a clear time for that — try naming the day and time." };
    }
    const title = `Add “${op.title}” — ${whenLabel(start.toISOString())}`;
    return applyNow(vaultPath, {
      ...base, text: title,
      decision: {
        route: 'calendar', action: 'create', confidence: 'high', title,
        reason: `From "${clean}". Approve to add it to ${op.calendarName || 'your calendar'}${op.notes ? ` — ${op.notes}` : ''}. Nothing changes until you approve.`,
        payload: { action: 'create', title: op.title, start: start.toISOString(), end: end.toISOString(), notes: op.notes || null, calendarName: op.calendarName || null },
      },
    }, start.toISOString());
  }

  // ---- MOVE / DELETE (resolve the target event by id) ---------------------
  if (op && (op.action === 'move' || op.action === 'delete')) {
    const ev = events.find((e) => e.id === op.id);
    if (!ev) return { proposed: false, reason: "I couldn't tell which event you meant — try naming it more specifically." };
    // A repeating event CAN be moved now — one occurrence, via an override
    // (calendar.moveOccurrence). Deleting one of a series is still not offered.
    if (ev.recurring && op.action === 'delete') return { proposed: false, reason: `"${ev.label}" repeats — I can't cancel a single occurrence of a series yet.` };
    if (!ev.objectUrl || !ev.raw) return { proposed: false, reason: "That event can't be edited from here." };

    if (op.action === 'move') {
      const newStart = new Date(op.start);
      const newEnd = new Date(op.end || (ev.endISO && new Date(newStart.getTime() + (new Date(ev.endISO) - new Date(ev.startISO)))));
      if (Number.isNaN(+newStart) || Number.isNaN(+newEnd) || newEnd <= newStart) {
        return { proposed: false, reason: "I couldn't work out the new time — try naming the day and time." };
      }
      const title = `Move “${ev.label}” → ${whenLabel(newStart.toISOString())}`;
      return applyNow(vaultPath, {
        ...base, text: title,
        decision: {
          route: 'calendar', action: 'move', confidence: 'high', title,
          reason: `From "${clean}". Reschedule from ${whenLabel(ev.startISO)} to ${whenLabel(newStart.toISOString())}. Nothing changes until you approve.`,
          payload: { action: 'move', objectUrl: ev.objectUrl, etag: ev.etag, oldRaw: ev.raw, label: ev.label, oldStart: ev.startISO, oldEnd: ev.endISO, newStart: newStart.toISOString(), newEnd: newEnd.toISOString(), ...(ev.recurring ? { occurrence: ev.recurrenceId || ev.startISO } : {}) },
        },
      }, newStart.toISOString());
    }

    // delete
    const title = `Cancel “${ev.label}” (${whenLabel(ev.startISO)})`;
    return fileProposal({
      ...base, text: title,
      decision: {
        route: 'calendar', action: 'delete', confidence: 'high', title,
        reason: `From "${clean}". Remove it from your calendar. You can undo this after — nothing changes until you approve.`,
        payload: { action: 'delete', objectUrl: ev.objectUrl, etag: ev.etag, raw: ev.raw, label: ev.label, startISO: ev.startISO },
      },
    });
  }

  return { proposed: false, reason: (op && op.reason) || "I couldn't turn that into a calendar change." };
}
