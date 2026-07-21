import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fetchEventsForDay } from './calendar.js';
import { createRecord } from './inboxStore.js';

// Turn a spoken/typed request ("add dentist tomorrow at 2", "gym 6pm Friday")
// into ONE structured calendar op, then file it as a confirm-first inbox
// proposal. Nothing touches the real calendar here — the model only INTERPRETS;
// the write happens later, in fileDecision, when the user approves. Only
// creating events is supported for now; moving/deleting is proposed next.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const CMD_MODEL = process.env.NOVA_CALENDAR_MODEL || 'haiku';
const MAX_BUDGET_USD = '0.5';

function buildPrompt(text, nowLocal, tz, todayEvents) {
  const events = todayEvents.length
    ? todayEvents.map((e) => `- ${e.time}${e.end ? '–' + e.end : ''} ${e.label}`).join('\n')
    : '(none today)';
  return `You convert a person's natural-language scheduling request into ONE structured calendar operation. The current LOCAL date and time is ${nowLocal} (timezone ${tz}) — treat THAT as "now" and "today", and resolve every relative reference ("tomorrow", "next Tuesday", "in 2 hours", "this evening") against it. Output times as ISO 8601 carrying ${tz}'s UTC offset (not UTC "Z").

Today's existing events, for context:
${events}

Their request: "${text}"

Only ADDING a new event is supported right now. Output ONLY a JSON object, nothing else:
- A schedulable event → {"action":"create","title":<short natural title>,"start":<ISO 8601 with timezone offset>,"end":<ISO 8601 with offset>,"notes":<string or null>,"calendarName":<a calendar they explicitly named, else null>}
  · No duration given → make end 1 hour after start. A date with no time → 09:00. Keep the title concise.
- Anything that isn't a clear new event — including a request to MOVE, RESCHEDULE, or DELETE something → {"action":"none","reason":<one short sentence; for move/delete say that's coming but for now you can only add new events>}

No markdown, no code fences, no commentary — just the JSON object.`;
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

export async function runCalendarCommand(text) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Tell Nova what to schedule.');

  let today = [];
  try { today = await fetchEventsForDay(new Date()); } catch { /* context is optional */ }

  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Local wall-clock, so the model's "today"/"tomorrow" match the user's day —
  // passing UTC made "tomorrow" land a day early when local is ahead of UTC.
  const nowLocal = now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const op = await interpret(buildPrompt(clean, nowLocal, tz, today));

  if (!op || op.action !== 'create') {
    return { proposed: false, reason: (op && op.reason) || "I couldn't turn that into a new event." };
  }
  const start = new Date(op.start);
  const end = new Date(op.end);
  if (!op.title || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
    return { proposed: false, reason: "I couldn't work out a clear time for that — try naming the day and time." };
  }

  const when = start.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const title = `Add “${op.title}” — ${when}`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'calendar',
    text: title,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'calendar',
      confidence: 'high',
      title,
      reason: `From "${clean}". Approve to add it to ${op.calendarName || 'your calendar'}${op.notes ? ` — ${op.notes}` : ''}. Nothing changes on your calendar until you approve.`,
      payload: {
        title: op.title,
        start: start.toISOString(),
        end: end.toISOString(),
        notes: op.notes || null,
        calendarName: op.calendarName || null,
      },
    },
  };
  await createRecord(record);
  return { proposed: true, record };
}
