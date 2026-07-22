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
import { loadSessions } from './workoutSessions.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { computeProgressions, computeDeloadSignal } from './coach.js';
import { loadRecentDays } from './healthData.js';
import { computeStreaks } from './streaks.js';
import { listTodos } from './todos.js';
import { preferencesContext } from './learning.js';
import { createRecord, updateRecord, listRecords } from './inboxStore.js';
import { fileDecision } from './inbox.js';

// THE DAILY REVIEW — Nova's flagship intelligent surface. Once a day, a model
// reasons across everything (profile, health, training, nutrition, calendar,
// money, streaks, open loops) through the Nova lens and produces a short
// honest read plus 1-3 concrete adjustments. This is the piece that turns
// Nova's daily proactivity from deterministic REPORTING (the briefs) into
// genuine cross-domain COACHING. It rides the inbox rails like every brief:
// draft → pending for review → journal; auto → filed (undoable); off → silent.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'daily-review.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';
const REVIEW_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

export const REVIEW_MODES = ['off', 'draft', 'auto'];
const DEFAULTS = { mode: 'draft', hour: 8 };

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/* -------------------------------- config --------------------------------- */

export async function getReviewConfig() {
  if (!existsSync(CONFIG_PATH())) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return {
      mode: REVIEW_MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
      hour: Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : DEFAULTS.hour,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setReviewConfig(patch) {
  const current = await getReviewConfig();
  const next = {
    mode: REVIEW_MODES.includes(patch?.mode) ? patch.mode : current.mode,
    hour: Number.isInteger(Number(patch?.hour)) && Number(patch.hour) >= 0 && Number(patch.hour) <= 23 ? Number(patch.hour) : current.hour,
  };
  await mkdir(dataRoot(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return next;
}

/* ------------------------------- context --------------------------------- */

// Assemble the whole cross-domain picture. Leans on the deterministic
// composers (which already gather health/fuel/training/calendar/money) and
// adds the coaching-specific specifics the model needs to reason well.
export async function buildReviewContext(vaultPath, now = new Date()) {
  const parts = [];
  const add = (label, fn) => fn().then((v) => v && parts.push(v)).catch(() => {});

  await add('profile', () => profileContext(vaultPath));
  await add('learning', () => preferencesContext(vaultPath)); // what he tends to do
  await add('morning', async () => `TODAY'S PICTURE (computed now):\n${(await composeDispatch(vaultPath, 'morning', now)).text}`);
  await add('evening', async () => `HOW TODAY IS GOING:\n${(await composeDispatch(vaultPath, 'evening', now)).text}`);
  await add('sessions', async () => {
    const s = await loadSessions(vaultPath, { limit: 4 });
    return s.length ? 'RECENT TRAINING:\n' + s.map((x) => `- ${x.date} ${x.routineName}: ${x.exercises.map((e) => `${e.name} ${e.sets.map((y) => `${y.weight}x${y.reps}`).join(',')}`).join(' | ')}`).join('\n') : null;
  });
  await add('progressions', async () => {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const prog = await computeProgressions(vaultPath, routines);
    const keys = Object.keys(prog);
    return keys.length ? `EARNED PROGRESSIONS: ${keys.map((k) => `${k} +${prog[k].delta}${prog[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.` : null;
  });
  await add('deload', async () => {
    const signal = computeDeloadSignal(await loadRecentDays(7));
    return `RECOVERY/DELOAD SIGNAL: ${signal.advise ? `advise easing — ${signal.reason}` : signal.reason}.`;
  });
  await add('streaks', async () => {
    const s = await computeStreaks(vaultPath);
    return `STREAKS: workout ${s.workoutStreak}d, step-goal ${s.stepGoalStreak}d, sleep-goal ${s.sleepGoalStreak}d${s.lastWorkoutDate ? `; last session ${s.lastWorkoutDate}` : ''}.`;
  });
  await add('todos', async () => {
    const { items } = await listTodos(vaultPath);
    const open = items.filter((t) => !t.checked);
    return open.length ? `OPEN TO-DOS (${open.length}): ${open.slice(0, 8).map((t) => t.text).join('; ')}.` : null;
  });
  // ---- the connections the July sweep found missing ----------------------
  await add('goals', async () => {
    const { goalsContext } = await import('./fitnessGoals.js');
    return goalsContext(vaultPath); // the review reasons TOWARD these — it never had them
  });
  await add('carryovers', async () => {
    const { carryoverContext } = await import('./workoutCarryover.js');
    return carryoverContext(); // recorded training debt
  });
  await add('weight', async () => {
    const { weightTrendLine } = await import('./healthData.js');
    return 'BODYWEIGHT: ' + weightTrendLine(await loadRecentDays(28));
  });
  await add('week-ahead', async () => {
    const { fetchEventsForRange } = await import('./calendar.js');
    const events = await fetchEventsForRange(7);
    if (!events.length) return 'WEEK AHEAD: nothing on the calendar for the next 7 days.';
    const byDate = new Map();
    for (const e of events) byDate.set(e.date, (byDate.get(e.date) || 0) + 1);
    const busiest = [...byDate.entries()].sort((a, b) => b[1] - a[1])[0];
    return `WEEK AHEAD (${events.length} events over ${byDate.size} days; busiest ${busiest[0]} with ${busiest[1]}): ` +
      [...byDate.entries()].map(([d, n]) => `${d}:${n}`).join(' · ') + '.';
  });
  await add('money', async () => {
    const { getMonthSummary } = await import('./money.js');
    const m = await getMonthSummary();
    if (!m || !m.count) return null;
    const over = (m.byCategory || []).filter((c) => c.budget && c.spent > c.budget).map((c) => `${c.category} over budget by $${Math.round(c.spent - c.budget)}`);
    const vsPrev = m.prevSpent ? ` (last month $${Math.round(m.prevSpent)})` : '';
    return `MONEY THIS MONTH: $${Math.round(m.spent)} spent${vsPrev}${over.length ? '; ' + over.join(', ') : ''}.`;
  });
  return parts.join('\n\n');
}

/* ------------------------------- compose --------------------------------- */

export function buildReviewPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${NOVA_LENS}

You are Nova composing Hayden's DAILY REVIEW for ${dateLong} — the single intelligent read of his whole life today. This is the one moment each day where you step back, reason across everything, and tell him what actually matters. You may also read his vault (goals, journal, notes) for depth.

What to produce:
- A short honest READ (2-3 sentences): where he genuinely is today across recovery, training, fuel, and whatever else stands out — grounded in the real numbers below, and connected to what he's working toward.
- 1 to 3 ADJUSTMENTS: the highest-leverage concrete things he could do today to move toward his goals, each with a one-line why tied to the data. A cross-domain connection he didn't ask for is the most valuable kind.

Discipline (this is what makes it worth opening every day):
- Only surface what genuinely warrants attention. If the day is unremarkable, say so plainly and give at most ONE gentle nudge — never manufacture problems to look useful.
- Ground every claim in the data below or the vault. Name gaps honestly ("no protein logged — can't tell if you skipped or didn't log"). Never invent.
- Adjustments are concrete and today-actionable, not platitudes. "Log breakfast before you leave" beats "focus on nutrition".
- Warm, direct, on his side. Say the useful hard thing kindly.

The whole picture:
${context || '(context unavailable — say so and keep it brief)'}

Output ONLY a JSON object: {"read": "the 2-3 sentence read", "adjustments": [{"do": "the concrete action", "why": "one line tied to the data"}]}. No code fences, no commentary.`;
}

export function composeReviewText(parsed, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  const read = String(parsed?.read || '').trim();
  const adjustments = (Array.isArray(parsed?.adjustments) ? parsed.adjustments : [])
    .map((a) => ({ do: String(a?.do || '').trim(), why: String(a?.why || '').trim() }))
    .filter((a) => a.do)
    .slice(0, 3);
  if (!read && !adjustments.length) throw new Error('the review came back empty');
  const title = `Daily Review — ${dateLong}`;
  const lines = [title, ''];
  if (read) lines.push(`**Read.** ${read}`, '');
  if (adjustments.length) {
    lines.push('**Adjustments.**');
    adjustments.forEach((a, i) => lines.push(`${i + 1}. ${a.do}${a.why ? ` — ${a.why}` : ''}`));
  }
  return { title, text: lines.join('\n') };
}

/* ------------------------------ orchestration ---------------------------- */

async function todayReviewRecord() {
  const items = await listRecords();
  const t = todayISO();
  const todays = items.filter((r) => r.kind === 'review' && r.createdAt && todayISO(new Date(r.createdAt)) === t);
  // An errored compose must not block the whole day — an orphaned or failed
  // run used to wedge the review until midnight. But cap the retries (3
  // attempts/day) so a persistently failing compose can't burn budget all day.
  const live = todays.find((r) => r.status !== 'error');
  if (live) return live;
  return todays.length >= 3 ? todays[0] : null;
}

function startReviewJob(vaultPath, context, mode, recordId, now) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildReviewPrompt(context, now),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', REVIEW_DISALLOWED,
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
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in review response');
      const { title, text: body } = composeReviewText(JSON.parse(jsonMatch[0]), now);
      const decision = {
        route: 'journal',
        confidence: 'high',
        title,
        reason: 'Daily Review — reasoned across your whole day through the Nova lens.',
        // personal category, labelled — it lives with Hayden's own reflections
        // but is always distinguishable from them
        payload: { text: body, category: 'personal', label: 'Daily review reflection' },
      };
      if (mode === 'auto') {
        const { destination, undo } = await fileDecision(vaultPath, decision);
        await updateRecord(recordId, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, decision });
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

export async function runDailyReview(vaultPath, { force = false } = {}) {
  const config = await getReviewConfig();
  if (config.mode === 'off' && !force) return { skipped: true, reason: 'off' };
  const existing = await todayReviewRecord();
  if (existing && !force) return { skipped: true, record: existing };

  const now = new Date();
  const context = await buildReviewContext(vaultPath, now);
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'review',
    text: `Daily Review — ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}`,
    source: 'nova',
    mode: config.mode,
    status: 'classifying', // in-flight while the model reasons
    createdAt: now.toISOString(),
  });
  startReviewJob(vaultPath, context, config.mode, record.id, now);
  return { record };
}

export async function getDailyReviewStatus() {
  const config = await getReviewConfig();
  const rec = await todayReviewRecord();
  return {
    config,
    today: rec ? { id: rec.id, status: rec.status, text: rec.decision?.payload?.text || null } : null,
  };
}

export function startDailyReviewScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('review');
    try {
      const config = await getReviewConfig();
      if (config.mode === 'off') return;
      if (new Date().getHours() < config.hour) return;
      if (await todayReviewRecord()) return;
      await runDailyReview(vaultPath);
    } catch (err) {
      console.error('daily review failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
