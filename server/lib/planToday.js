import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { gatherContext } from './contextSections.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { NOVA_LENS } from './lens.js';
import { profileContext } from './profile.js';
import { composeDispatch } from './dispatch.js';
import { listTodos } from './todos.js';
import { createRecord, updateRecord, listRecords, getRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// PLAN TODAY — each morning, one model pass turns the day's real picture
// (calendar, recovery, fuel, carry-overs, open to-dos, standing instructions)
// into TODAY'S TOP 3: the highest-leverage priorities, each with a one-line
// why. It is the planning counterpart to the Daily Review's coaching read —
// the review looks across the whole day and scores it; the plan picks what
// the day is FOR before it starts. Rides the inbox rails like every draft:
// draft → pending for review → journal; auto → filed (undoable); off → silent.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'plan-today.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';
const PLAN_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

// REGISTERED IN autonomyLedger.js AUTONOMY_TARGETS ('plan-today') — a mode config the
// trust ladder cannot see can never earn (or lose) autonomy. A new mode-config
// lane joins the registry in the same commit.
export const PLAN_MODES = ['off', 'draft', 'auto'];
const DEFAULTS = { mode: 'draft', hour: 7 };

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/* -------------------------------- config --------------------------------- */

export async function getPlanConfig() {
  if (!existsSync(CONFIG_PATH())) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return {
      mode: PLAN_MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
      hour: Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : DEFAULTS.hour,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setPlanConfig(patch) {
  const current = await getPlanConfig();
  const next = {
    mode: PLAN_MODES.includes(patch?.mode) ? patch.mode : current.mode,
    hour: Number.isInteger(Number(patch?.hour)) && Number(patch.hour) >= 0 && Number(patch.hour) <= 23 ? Number(patch.hour) : current.hour,
  };
  await mkdir(dataRoot(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return next;
}

/* ------------------------------- context --------------------------------- */

// Leaner than the review's context on purpose: the plan needs the shape of
// TODAY (schedule, body, debts, open loops), not the month's trends.
export async function buildPlanContext(vaultPath, now = new Date()) {
  // a section that FAILS is named to the model, one that is empty says
  // nothing — the add() used to swallow both the same way (lib/contextSections.js)
  const sections = [];
  const add = (label, load) => sections.push({ label, load });

  add('profile', () => profileContext(vaultPath));
  add('standing', async () => (await import('./standing.js')).standingContext(vaultPath));
  add('learning', async () => (await import('./learning.js')).preferencesContext(vaultPath)); // what he tends to do (twin: the review's)
  add('morning', async () => `TODAY'S PICTURE (computed now):\n${(await composeDispatch(vaultPath, 'morning', now)).text}`);
  add('carryovers', async () => {
    const { carryoverContext } = await import('./workoutCarryover.js');
    return carryoverContext();
  });
  add('todos', async () => {
    const { items } = await listTodos(vaultPath);
    const open = items.filter((t) => !t.checked);
    return open.length ? `OPEN TO-DOS (${open.length}): ${open.slice(0, 12).map((t) => t.text).join('; ')}.` : null;
  });
  // the plan reasons TOWARD his goals — the same rail the review reads
  // (dailyReview.js 'goals' is the twin)
  add('goals', async () => (await import('./fitnessGoals.js')).goalsContext(vaultPath));
  // the weekly debrief's standing changes reach the day — the daily lane
  // inherits the debrief's memory instead of building its own
  add('week-changes', async () => (await import('./weeklyDebrief.js')).weekChangesContext(now));
  // THE MORNING SIBLINGS CROSS-FEED: the plan sees the last review's read and
  // adjustments (yesterday evening's, or this morning's if it ran first), so
  // the day's three are picked against what the review already said
  add('latest-review', async () => {
    const rec = (await listRecords())
      .filter((r) => r.kind === 'review' && r.decision?.payload?.text && ['filed', 'pending'].includes(r.status))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if (!rec) return null;
    // calendar days, not rounded hours: last night's review at 20:05 is 'yesterday' at 07:00
    const age = Math.round((new Date(todayISO(now)) - new Date(todayISO(new Date(rec.createdAt)))) / 86400000);
    if (age > 2) return null; // an old review is not this morning's frame
    return `THE LAST DAILY REVIEW (${age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`} — pick today's three so they move what it said; don't re-argue it):\n${String(rec.decision.payload.text).slice(0, 700)}`;
  });
  // THE PLAN REMEMBERS ITSELF. Yesterday's three commitments and what he
  // marked against them ride into today's context — without this, planning
  // could never improve his planning, and a skipped priority simply vanished.
  add('yesterday-plan', async () => {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const yIso = todayISO(y);
    const rec = (await listRecords()).find((r) => r.kind === 'plan-today' && r.createdAt && todayISO(new Date(r.createdAt)) === yIso && Array.isArray(r.decision?.payload?.priorities) && r.decision.payload.priorities.length);
    if (!rec) return null;
    const ps = rec.decision.payload.priorities;
    // his reason for declining a plan is the loudest steer the planner gets (the why-chips on the card)
    const fate = rec.status === 'filed' ? 'approved' : rec.status === 'discarded' ? (rec.expired ? 'expired unread' : `declined${rec.declineReason ? ` — his reason: "${rec.declineReason}" (plan accordingly; never re-issue what he declined unchanged)` : ''}`) : rec.status;
    const done = ps.filter((p) => p.outcome === 'done').length;
    const lines = ps.map((p, i) => `${i + 1}. ${p.do} — ${p.outcome === 'done' ? 'DONE' : p.outcome === 'skipped' ? 'SKIPPED' : 'no word'}`);
    return `YESTERDAY'S TOP 3 (plan ${fate}; ${done} of ${ps.length} marked done) — one clause on what happened, then today; carry a skipped one forward only if it still matters today:\n${lines.join('\n')}`;
  });
  return (await gatherContext(sections)).text;
}

/* ------------------------------- compose --------------------------------- */

export function buildPlanPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${NOVA_LENS}

You are Nova picking Hayden's TOP 3 PRIORITIES for ${dateLong} — what this day is actually for, decided before it starts. You may read his vault (goals, journal, notes) for depth.

What to produce: exactly 1 to 3 priorities, most important first. Each is one concrete, today-doable action with a one-line why tied to the data below.

Discipline:
- Priorities come FROM the day: fixed calendar blocks, training debt, protein gaps, open loops with deadlines. Never invent work to fill three slots — a two-priority day is honest.
- Each priority is specific enough to know when it is DONE ("finish the deck for Thursday's review" beats "make progress on work").
- Respect what is already fixed: a priority must fit AROUND his calendar, not fight it.
- Warm, direct, on his side.

The day:
${context || '(context unavailable — say so and keep it brief)'}

If yesterday's plan is in the picture, its outcomes are real data: build on what got done, and carry a skipped priority forward only if it still matters today — never re-list it out of habit.

Output ONLY a JSON object: {"priorities": [{"do": "the concrete action", "why": "one line tied to the data"}]}. No code fences, no commentary.`;
}

// PRIORITY → TO-DO LINKAGE, containment only. Replayed on his real record
// (28 plans, 84 priorities, 2 Sep): every correct match was a priority that
// named the to-do verbatim ("Clear the 2 open to-dos (swipe verification
// item, …)"), and every looser token-overlap match was a paraphrase not
// worth a write. So: an open to-do whose whole text sits inside the
// priority's text is linked; nothing fuzzier. Pure, exported for the test.
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function linkPrioritiesToTodos(priorities, todoItems) {
  const open = (todoItems || []).filter((t) => !t.checked && t.text && t.text.length >= 8);
  return priorities.map((p) => {
    const hay = norm(p.do);
    const lines = open.filter((t) => hay.includes(norm(t.text))).map((t) => t.raw || t.text);
    return lines.length ? { ...p, todoLines: lines } : p;
  });
}

export function composePlanText(parsed, now = new Date(), { todos = null } = {}) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  let priorities = (Array.isArray(parsed?.priorities) ? parsed.priorities : [])
    .map((p) => ({ do: String(p?.do || '').trim(), why: String(p?.why || '').trim() }))
    .filter((p) => p.do)
    .slice(0, 3);
  if (todos) priorities = linkPrioritiesToTodos(priorities, todos);
  if (!priorities.length) throw new Error('the plan came back empty');
  const title = `Plan Today — ${dateLong}`;
  const lines = [title, '', "**Today's Top 3.**"];
  priorities.forEach((p, i) => lines.push(`${i + 1}. ${p.do}${p.why ? ` — ${p.why}` : ''}`));
  return { title, text: lines.join('\n'), priorities };
}

/* ------------------------------ orchestration ---------------------------- */

async function todayPlanRecord() {
  const items = await listRecords();
  const t = todayISO();
  const todays = items.filter((r) => r.kind === 'plan-today' && r.createdAt && todayISO(new Date(r.createdAt)) === t);
  // An errored compose must not block the day, but cap retries at 3/day so a
  // persistently failing compose can't burn budget all morning.
  const live = todays.find((r) => r.status !== 'error');
  if (live) return live;
  return todays.length >= 3 ? todays[0] : null;
}

function startPlanJob(vaultPath, context, mode, recordId, now) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildPlanPrompt(context, now),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', PLAN_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. The pin
    // now comes from the model board (lib/modelPrefs.js) so it is settable
    // in Settings; the default is the 'sonnet' this lane has always run on.
    '--model', modelFor('plan-today'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the day plan", minutes: 15 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in plan response');
      let todos = null;
      try { todos = (await listTodos(vaultPath)).items; } catch { /* no linkage without the list — the plan still stands */ }
      const { title, text: body, priorities } = composePlanText(JSON.parse(jsonMatch[0]), now, { todos });
      const decision = {
        route: 'journal',
        confidence: 'high',
        title,
        reason: "Plan Today — the day's top 3, picked from the real picture.",
        // priorities ride the decision so the Home card can render them
        // without re-parsing the markdown
        payload: { text: body, category: 'personal', label: 'Plan today', priorities },
      };
      if (mode === 'auto') {
        const { destination, undo } = await fileDecision(vaultPath, decision);
        await updateRecord(recordId, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, decision });
        import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(`${title}\n\n${body.replace(/\*\*/g, '')}`)).catch(() => {});
        import('./push.js').then(({ sendPush }) => sendPush({
          title: 'Plan Today — Nova',
          body: decision.title || "Today's top 3 are in your journal.",
          tag: `record-${recordId}`,
        })).catch(() => {});
      } else {
        await updateRecord(recordId, { status: 'pending', decision });
      }
    } catch (e) {
      await planFailed(recordId, e.message, now);
    }
  });
  child.on('error', async (err) => {
    await planFailed(recordId, err.message, now);
  });
}

// THE DAY'S FINAL FAILURE IS SAID OUT LOUD — parity with the review
// (dailyReview.reviewFailed): the third errored plan of the day sends one
// push naming the retry, instead of an empty morning.
export const PLAN_MAX_ATTEMPTS = 3;
export function failedPlansToday(records, now = new Date()) {
  const t = todayISO(now);
  return records.filter((r) => r.kind === 'plan-today' && r.status === 'error' && r.createdAt && todayISO(new Date(r.createdAt)) === t).length;
}
async function planFailed(recordId, message, now) {
  await updateRecord(recordId, { status: 'error', error: message }).catch(() => {});
  try {
    if (failedPlansToday(await listRecords(), now) >= PLAN_MAX_ATTEMPTS) {
      const { sendPush } = await import('./push.js');
      await sendPush({ title: 'Plan Today — Nova', body: "Today's plan couldn't compose, three times over — tap to run it from the Inbox.", tag: 'plan-failed' });
    }
  } catch { /* the push is the courtesy; the error record is the truth */ }
}

export async function runPlanToday(vaultPath, { force = false } = {}) {
  const config = await getPlanConfig();
  if (config.mode === 'off' && !force) return { skipped: true, reason: 'off' };
  if (laneSkipped('plan-today', 'the morning plan')) return { skipped: true, reason: 'lane switched off in Settings' };
  const existing = await todayPlanRecord();
  if (existing && !force) return { skipped: true, record: existing };

  const now = new Date();
  const context = await buildPlanContext(vaultPath, now);
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'plan-today',
    text: `Plan Today — ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}`,
    source: 'nova',
    mode: config.mode,
    status: 'classifying', // in-flight while the model reasons
    createdAt: now.toISOString(),
  });
  startPlanJob(vaultPath, context, config.mode, record.id, now);
  return { record };
}

// THE COMPLETION LOOP. The day's three commitments were closeable nowhere,
// and tomorrow's plan never knew what happened to today's. `outcome` is
// 'done' | 'skipped' | null (clear), written onto the record's own
// priorities payload through the record-update rail; buildPlanContext reads
// it back the next morning.
export async function setPriorityOutcome(recordId, index, outcome, { vaultPath = null } = {}) {
  const rec = await getRecord(recordId);
  if (!rec || rec.kind !== 'plan-today') throw new Error('that record is not a day plan');
  const priorities = rec.decision?.payload?.priorities;
  const i = Number(index);
  if (!Array.isArray(priorities) || !Number.isInteger(i) || !priorities[i]) throw new Error('no such priority');
  if (![ 'done', 'skipped', null ].includes(outcome)) throw new Error("outcome must be 'done', 'skipped' or null");
  const next = priorities.map((p, k) => {
    if (k !== i) return p;
    const { outcome: _o, outcomeAt: _a, ...rest } = p;
    return outcome ? { ...rest, outcome, outcomeAt: new Date().toISOString() } : rest;
  });
  // a priority that named a to-do checks it when done — through the to-do
  // rail (its own lock, sync and receipt). Never unchecks: a tick is his.
  let checkedTodos = [];
  if (outcome === 'done' && vaultPath && Array.isArray(priorities[i].todoLines) && priorities[i].todoLines.length) {
    try {
      const { listTodos: list, toggleTodo } = await import('./todos.js');
      const { items } = await list(vaultPath);
      for (const line of priorities[i].todoLines) {
        const item = items.find((t) => (t.raw === line || t.text === line) && !t.checked);
        if (item) { await toggleTodo(vaultPath, item.raw); checkedTodos.push(item.text); }
      }
    } catch (e) { console.error('plan priority → to-do check failed: ' + e.message); }
  }
  if (checkedTodos.length) next[i] = { ...next[i], checkedTodos };
  return updateRecord(recordId, { decision: { ...rec.decision, payload: { ...rec.decision.payload, priorities: next } } });
}

export async function getPlanTodayStatus() {
  const config = await getPlanConfig();
  const rec = await todayPlanRecord();
  return {
    config,
    today: rec ? { id: rec.id, status: rec.status, priorities: rec.decision?.payload?.priorities || null, text: rec.decision?.payload?.text || null } : null,
  };
}

export function startPlanTodayScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('plan-today');
    try {
      const config = await getPlanConfig();
      if (config.mode === 'off') return;
      if (new Date().getHours() < config.hour) return;
      if (await todayPlanRecord()) return;
      await runPlanToday(vaultPath);
    } catch (err) {
      console.error('plan today failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
