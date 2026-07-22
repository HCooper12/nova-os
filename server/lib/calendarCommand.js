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
    ? events.map((e) => `[${e.id}] ${e.date} ${e.time}${e.end ? '–' + e.end : ''} "${e.label}"${e.recurring ? ' (recurring — cannot move/delete)' : ''}`).join('\n')
    : '(no events in the next few weeks)';
  return `You convert a person's natural-language calendar request into ONE structured operation. The current LOCAL date-time is ${nowLocal} (timezone ${tz}) — treat that as "now"/"today" and resolve every relative reference against it. Output times as ISO 8601 carrying ${tz}'s UTC offset.

Their upcoming events, each with an [id]:
${list}

Request: "${text}"

Output ONLY one JSON object:
- ADD a new event → {"action":"create","title":<short title>,"start":<ISO>,"end":<ISO>,"notes":<string|null>,"calendarName":<a calendar they named|null>}  (no end/duration → make end 1h after start; a date with no time → 09:00)
- MOVE / reschedule an existing event → {"action":"move","id":"<the [id] of the event they mean>","start":<ISO>,"end":<ISO>}  (keep its original duration unless they state a new one)
- DELETE / cancel an existing event → {"action":"delete","id":"<the [id]>"}
- If you can't identify which event, the target is marked recurring, or it can't be done → {"action":"none","reason":<one short sentence>}

Match the intended event by its title and time. No markdown, no prose — just the JSON object.`;
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
        const m = (outer.result || '').match(/\{[\s\S]*\}/);
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
function whenLabel(iso) { return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

export async function runCalendarCommand(text) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Tell Nova what to change.');

  let events = [];
  try { events = await fetchEventsForRangeRaw(RANGE_DAYS); } catch { /* range is best-effort */ }

  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowLocal = now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const op = await interpret(buildPrompt(clean, nowLocal, tz, events));
  const base = { id: randomUUID().slice(0, 8), kind: 'calendar', source: 'nova', mode: 'draft', status: 'pending', createdAt: new Date().toISOString() };

  // ---- ADD ----------------------------------------------------------------
  if (op && op.action === 'create') {
    const start = new Date(op.start);
    const end = new Date(op.end);
    if (!op.title || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
      return { proposed: false, reason: "I couldn't work out a clear time for that — try naming the day and time." };
    }
    const title = `Add “${op.title}” — ${whenLabel(start.toISOString())}`;
    return fileProposal({
      ...base, text: title,
      decision: {
        route: 'calendar', action: 'create', confidence: 'high', title,
        reason: `From "${clean}". Approve to add it to ${op.calendarName || 'your calendar'}${op.notes ? ` — ${op.notes}` : ''}. Nothing changes until you approve.`,
        payload: { action: 'create', title: op.title, start: start.toISOString(), end: end.toISOString(), notes: op.notes || null, calendarName: op.calendarName || null },
      },
    });
  }

  // ---- MOVE / DELETE (resolve the target event by id) ---------------------
  if (op && (op.action === 'move' || op.action === 'delete')) {
    const ev = events.find((e) => e.id === op.id);
    if (!ev) return { proposed: false, reason: "I couldn't tell which event you meant — try naming it more specifically." };
    if (ev.recurring) return { proposed: false, reason: `"${ev.label}" is a repeating event — I can't move or cancel a single occurrence of a series yet.` };
    if (!ev.objectUrl || !ev.raw) return { proposed: false, reason: "That event can't be edited from here." };

    if (op.action === 'move') {
      const newStart = new Date(op.start);
      const newEnd = new Date(op.end || (ev.endISO && new Date(newStart.getTime() + (new Date(ev.endISO) - new Date(ev.startISO)))));
      if (Number.isNaN(+newStart) || Number.isNaN(+newEnd) || newEnd <= newStart) {
        return { proposed: false, reason: "I couldn't work out the new time — try naming the day and time." };
      }
      const title = `Move “${ev.label}” → ${whenLabel(newStart.toISOString())}`;
      return fileProposal({
        ...base, text: title,
        decision: {
          route: 'calendar', action: 'move', confidence: 'high', title,
          reason: `From "${clean}". Reschedule from ${whenLabel(ev.startISO)} to ${whenLabel(newStart.toISOString())}. Nothing changes until you approve.`,
          payload: { action: 'move', objectUrl: ev.objectUrl, etag: ev.etag, oldRaw: ev.raw, label: ev.label, oldStart: ev.startISO, oldEnd: ev.endISO, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() },
        },
      });
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
