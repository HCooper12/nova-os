import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
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
import { createRecord, updateRecord, listRecords } from './inboxStore.js';
import { fileDecision } from './inbox.js';

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
  const parts = [];
  const add = (label, fn) => fn().then((v) => v && parts.push(v)).catch(() => {});

  await add('profile', () => profileContext(vaultPath));
  await add('standing', async () => (await import('./standing.js')).standingContext(vaultPath));
  await add('morning', async () => `TODAY'S PICTURE (computed now):\n${(await composeDispatch(vaultPath, 'morning', now)).text}`);
  await add('carryovers', async () => {
    const { carryoverContext } = await import('./workoutCarryover.js');
    return carryoverContext();
  });
  await add('todos', async () => {
    const { items } = await listTodos(vaultPath);
    const open = items.filter((t) => !t.checked);
    return open.length ? `OPEN TO-DOS (${open.length}): ${open.slice(0, 12).map((t) => t.text).join('; ')}.` : null;
  });
  return parts.join('\n\n');
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

Output ONLY a JSON object: {"priorities": [{"do": "the concrete action", "why": "one line tied to the data"}]}. No code fences, no commentary.`;
}

export function composePlanText(parsed, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  const priorities = (Array.isArray(parsed?.priorities) ? parsed.priorities : [])
    .map((p) => ({ do: String(p?.do || '').trim(), why: String(p?.why || '').trim() }))
    .filter((p) => p.do)
    .slice(0, 3);
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
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in plan response');
      const { title, text: body, priorities } = composePlanText(JSON.parse(jsonMatch[0]), now);
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
        import('./push.js').then(({ sendPush }) => sendPush({
          title: 'Plan Today — Nova',
          body: decision.title || "Today's top 3 are in your journal.",
          tag: `record-${recordId}`,
        })).catch(() => {});
      } else {
        await updateRecord(recordId, { status: 'pending', decision });
      }
    } catch (e) {
      await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(recordId, { status: 'error', error: err.message }).catch(() => {});
  });
}

export async function runPlanToday(vaultPath, { force = false } = {}) {
  const config = await getPlanConfig();
  if (config.mode === 'off' && !force) return { skipped: true, reason: 'off' };
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
