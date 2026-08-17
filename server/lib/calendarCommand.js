import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fetchEventsForRangeRaw } from './calendar.js';
import { createRecord } from './inboxStore.js';

// Turn a spoken/typed request into ONE structured calendar op — add, move, or
// delete — then file it as a confirm-first inbox proposal. The model only
// INTERPRETS and identifies which event; the actual iCloud write happens later
// in fileDecision, when the user approves. Nothing here touches the calendar.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const CMD_MODEL = process.env.NOVA_CALENDAR_MODEL || 'haiku';
const MAX_BUDGET_USD = '0.5';
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

function interpret(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--model', CMD_MODEL,
      '--strict-mcp-config',
      '--output-format', 'json',
      '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `claude exited ${code}`));
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'interpretation failed');
        const raw = outer.result || '';
        const m = raw.match(/\[[\s\S]*\]/) || raw.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON found in the response');
        resolve(JSON.parse(m[0]));
      } catch (e) {
        reject(e);
      }
    });
    child.on('error', reject);
  });
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

  let events = [];
  try { events = await fetchEventsForRangeRaw(RANGE_DAYS); } catch { /* range is best-effort */ }

  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowLocal = now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parsed = await interpret(buildPrompt(clean, nowLocal, tz, events));
  // One request can carry several changes ("push X to 10:30 AND move Y to
  // 12:15") — each becomes its own proposal so he can approve them
  // independently. A lone object still works (older prompt shape).
  const ops = Array.isArray(parsed) ? parsed : [parsed];
  if (!ops.length) return { proposed: false, reason: "I couldn't turn that into a calendar change." };
  if (ops.length > 1) {
    const results = [];
    for (const one of ops) results.push(await proposeOne(one, clean, events, vaultPath));
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
  return proposeOne(ops[0], clean, events, vaultPath);
}

async function proposeOne(op, clean, events, vaultPath) {
  const base = { id: randomUUID().slice(0, 8), kind: 'calendar', source: 'nova', mode: 'draft', status: 'pending', createdAt: new Date().toISOString() };

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
          payload: { action: 'move', objectUrl: ev.objectUrl, etag: ev.etag, oldRaw: ev.raw, label: ev.label, oldStart: ev.startISO, oldEnd: ev.endISO, newStart: newStart.toISOString(), newEnd: newEnd.toISOString(), ...(ev.recurring ? { occurrence: ev.startISO } : {}) },
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
