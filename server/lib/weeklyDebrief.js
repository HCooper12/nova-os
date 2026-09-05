import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { firstBalancedObjectMatch } from './jsonSalvage.js';
import { gatherContext } from './contextSections.js';
import { mondayOf } from './cadence.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { NOVA_LENS } from './lens.js';
import { profileContext } from './profile.js';
import { loadSessions } from './workoutSessions.js';
import { loadRecentDays, weightTrendLine } from './healthData.js';
import { computeStreaks } from './streaks.js';
import { createRecord, updateRecord, listRecords } from './inboxStore.js';
import { fileDecision } from './inbox.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// THE WEEKLY DEBRIEF — the Coach's Sunday sit-down. The Daily Review reads
// one day; this reads the WEEK: training done vs planned, strength direction
// (e1RMs), recovery and bodyweight trends, nutrition adherence, what he said
// in the journal — and turns it into wins, honest gaps, and the small set of
// changes next week should carry. It rides the rails to the journal, and its
// text joins the Ask Nova context so he can DISCUSS it out loud afterwards.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'weekly-debrief.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.5';
const DEBRIEF_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

// REGISTERED IN autonomyLedger.js AUTONOMY_TARGETS ('weekly-debrief') — a mode config the
// trust ladder cannot see can never earn (or lose) autonomy. A new mode-config
// lane joins the registry in the same commit.
export const DEBRIEF_MODES = ['off', 'draft', 'auto'];
const DEFAULTS = { mode: 'draft', weekday: 0, hour: 17 }; // Sunday, 5pm

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/* -------------------------------- config --------------------------------- */

export async function getDebriefConfig() {
  if (!existsSync(CONFIG_PATH())) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return {
      mode: DEBRIEF_MODES.includes(raw.mode) ? raw.mode : DEFAULTS.mode,
      weekday: Number.isInteger(raw.weekday) && raw.weekday >= 0 && raw.weekday <= 6 ? raw.weekday : DEFAULTS.weekday,
      hour: Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : DEFAULTS.hour,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setDebriefConfig(patch) {
  const current = await getDebriefConfig();
  const num = (v, lo, hi, fallback) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : fallback);
  const next = {
    mode: DEBRIEF_MODES.includes(patch?.mode) ? patch.mode : current.mode,
    weekday: patch?.weekday !== undefined ? num(patch.weekday, 0, 6, current.weekday) : current.weekday,
    hour: patch?.hour !== undefined ? num(patch.hour, 0, 23, current.hour) : current.hour,
  };
  await mkdir(dataRoot(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return next;
}

/* ------------------------------- context --------------------------------- */

// `weekStart` may be overridden for a missed-week catch-up (see debriefWeekFor).
export async function buildDebriefContext(vaultPath, now = new Date(), { weekStart: weekStartOverride = null } = {}) {
  // a section that FAILS is named to the model, one that is empty says
  // nothing — the add() used to swallow both (lib/contextSections.js)
  const sections = [];
  const add = (label, fn) => sections.push({ label, load: fn });
  // the org block — standing rules, the fleet, and what his other agents are
  // asking of him. Inherited, not hand-wired.
  add('org', async () => (await import('./orgContext.js')).orgContext(vaultPath, 'weekly-debrief'));
  add('advice', async () => {
    // the Coach's recommendations this week and their fates — the debrief
    // holds the week against what was actually advised (audit item #11)
    const { adviceContext } = await import('./coach.js');
    return adviceContext(7);
  });
  const weekStart = weekStartOverride || todayISO(mondayOf(now));
  // THE DRAFTED WEEK PLAN — the last link of the week-plan chain: the
  // debrief holds the week against what Nova drafted for it
  add('week-plan', async () => {
    const records = await listRecords();
    const plan = records
      .filter((r) => r.kind === 'week-plan' && r.status !== 'discarded' && r.decision?.payload?.text && String(r.decision.payload.relPath || '').includes(weekStart))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    if (!plan) return null;
    return `THE WEEK PLAN NOVA DRAFTED FOR THIS WEEK (${plan.status === 'filed' ? 'he approved it' : plan.status}) — hold the week against it: training days planned vs done, flagged conflicts vs what actually collided, carry-overs placed vs cleared:\n${String(plan.decision.payload.text).slice(0, 1600)}`;
  });

  add('leadership', async () => {
    // the Leader's week: what was suggested each day and what he is working
    // against — so the Sunday sit-down can close the leadership loop too
    const { readLeaderState } = await import('./leader.js');
    const s = await readLeaderState();
    const week = s.daily.filter((d) => d.date >= weekStart);
    const open = s.profile.struggles.filter((x) => !x.resolvedAt).slice(-4);
    if (!week.length && !open.length) return null;
    const lines = ['LEADERSHIP THIS WEEK (from the Leader agent):'];
    if (week.length) lines.push('ideas suggested: ' + week.map((d) => `${d.date} "${d.title}"`).join(' · '));
    if (open.length) lines.push('his open struggles: ' + open.map((x) => `"${x.text}"`).join(' · '));
    return lines.join('\n');
  });

  add('profile', () => profileContext(vaultPath));
  add('goals', async () => (await import('./fitnessGoals.js')).goalsContext(vaultPath));
  add('tunes', async () => (await import('./progressionTunes.js')).tunesContext(vaultPath));
  add('week-sessions', async () => {
    const sessions = (await loadSessions(vaultPath, { limit: 14 })).filter((s) => s.date >= weekStart);
    if (!sessions.length) return `TRAINING THIS WEEK (since ${weekStart}): no sessions logged.`;
    return `TRAINING THIS WEEK (since ${weekStart}, ${sessions.length} session${sessions.length === 1 ? '' : 's'}):\n` +
      sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => `${e.name} ${e.sets.map((x) => `${x.weight}x${x.reps}${x.rpe ? '@' + x.rpe : ''}`).join(',')}${e.note ? ` — his note: "${e.note}"` : ''}${e.pain ? ` — PAIN: ${e.pain}` : ''}`).join(' | ')}${s.cutShort ? ` [CUT SHORT: ${s.cutShort}]` : ''}`).join('\n');
  });
  add('schedule', async () => {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    return `THE PROGRAM: routines ${routines.map((r) => r.name).join(', ') || 'none'}; weekly schedule ${JSON.stringify(schedule)}.`;
  });
  add('e1rms', async () => {
    const { estimateE1RMs } = await import('./coach.js');
    const trends = estimateE1RMs(await loadSessions(vaultPath, { limit: 12 }));
    return trends.length
      ? 'STRENGTH DIRECTION (e1RM, recent vs prior): ' + trends.slice(0, 10).map((x) => `${x.name} ${x.e1rm}kg${x.delta != null ? ` (${x.delta >= 0 ? '+' : ''}${x.delta})` : ''}`).join('; ') + '.'
      : null;
  });
  add('skipped', async () => {
    const { detectSkippedExercises, skippedContext } = await import('./coach.js');
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    return skippedContext(detectSkippedExercises(routines, await loadSessions(vaultPath, { limit: 30 })));
  });
  add('recovery-week', async () => {
    // genuinely week-bounded: a `|| true` debugging leftover had made this a
    // rolling last-7 under a "THIS WEEK" label — right by accident on Sundays,
    // wrong on any forced mid-week run
    const days = (await loadRecentDays(8)).filter((d) => d.date >= weekStart).slice(-7);
    if (!days.length) return null;
    const avg = (key) => { const w = days.filter((d) => d[key] != null); return w.length ? Math.round(w.reduce((s, d) => s + d[key], 0) / w.length) : null; };
    const hrv = avg('hrv'); const sleep = avg('sleepAsleepMinutes'); const steps = avg('steps');
    return `RECOVERY THIS WEEK (avgs over ${days.length} logged days): HRV ${hrv ?? '—'} ms; sleep ${sleep ? Math.round(sleep / 6) / 10 + 'h' : '—'}; steps ${steps ? steps.toLocaleString() : '—'}/day.`;
  });
  add('weight', async () => 'BODYWEIGHT: ' + weightTrendLine(await loadRecentDays(28)));
  add('nutrition-week', async () => {
    const { loadRecentDays: loadRecentNutritionDays } = await import('./nutritionLog.js');
    const days = (await loadRecentNutritionDays(7)) || [];
    if (!days.length) return 'NUTRITION, LAST 7 DAYS: no tracked days.';
    const met = days.filter((d) => d.floorMet === true).length;
    const tracked = days.filter((d) => d.floorMet != null).length;
    const avgP = Math.round(days.reduce((s, d) => s + (d.p || 0), 0) / days.length);
    return `NUTRITION, LAST 7 DAYS: protein floor met ${met}/${tracked} tracked days; avg ${avgP}g protein/day.`;
  });
  add('streaks', async () => {
    const s = await computeStreaks(vaultPath);
    return `STREAKS: workout ${s.workoutStreak}${s.workoutStreakUnit === 'sessions' ? ' scheduled sessions in a row' : 'd'}, step-goal ${s.stepGoalStreak}d, sleep-goal ${s.sleepGoalStreak}d${s.lastWorkoutDate ? `; last session ${s.lastWorkoutDate}` : ''}.`;
  });
  add('journal-week', async () => {
    const journal = await import('./journal.js');
    const days = (await journal.listEntries(vaultPath, { limit: 10 })).filter((d) => d.date >= weekStart);
    const lines = days.flatMap((d) => (d.sections || []).map((s) =>
      `- ${d.date} ${s.time || ''}${s.heading ? ` [${s.heading}]` : s.category ? ` [${s.category}]` : ''}: ${String(s.text || '').slice(0, 160)}`));
    if (!lines.length) return null;
    return `HIS WEEK IN THE JOURNAL (what he and Nova filed — his own words outrank any metric):\n${lines.slice(0, 15).join('\n')}`;
  });
  add('last-debrief', async () => {
    const records = await listRecords();
    const prior = records
      .filter((r) => r.kind === 'weekly-debrief' && (r.status === 'filed' || r.status === 'pending') && r.decision?.payload?.text)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    return prior ? `LAST WEEK'S DEBRIEF (hold this week against what it said):\n${prior.decision.payload.text}` : null;
  });
  return (await gatherContext(sections)).text;
}

/* ------------------------------- compose --------------------------------- */

export function buildDebriefPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${NOVA_LENS}

You are Nova's Coach closing out Hayden's training week — the WEEKLY DEBRIEF for the week ending ${dateLong}. This is the sit-down a serious coach does with a serious client: step back from the day-to-day, hold the week against the plan and the goals, and be honest about both wins and drift. You may read his vault (sessions, journal, goals) for depth.

What to produce:
- READ (2-4 sentences): the true shape of the week — training done vs planned, strength direction, recovery, fuel — connected to what he's working toward. If last week's debrief set changes, say plainly whether they happened. If Nova drafted a week plan, hold the week against it: training days planned vs done, conflicts flagged vs what actually collided, carry-overs placed vs cleared.
- WINS (1-3): concrete, earned, from the data. Never manufactured.
- CHANGES (1-3): what next week does differently, each one specific and small enough to actually happen, with a one-line why. If the week was on plan, one change or even none ("keep the pattern") is the honest answer.
- QUESTION (exactly 1): the one reflective question a good coach would leave him with — about the week, not a platitude.
- LEADERSHIP (only if the context carries a LEADERSHIP THIS WEEK section): 1-2 sentences holding his leadership week against the ideas the Leader suggested and his open struggles, plus ONE reflective leadership question. Tell him his answer belongs in the Leader chat, where it shapes the coming week's ideas and research. Omit the key entirely when there is no leadership context.

Discipline:
- Ground everything in the data below or the vault; name gaps honestly ("only 2 of 4 planned sessions logged — can't judge volume").
- His own journal words outrank metrics when they conflict — engage with what he SAID.
- Warm, direct, on his side. Say the useful hard thing kindly. No pep-talk filler.

The week:
${context || '(context unavailable — say so and keep it brief)'}

Output ONLY a JSON object: {"read": "…", "wins": ["…"], "changes": [{"do": "…", "why": "…"}], "question": "…", "leadership": {"note": "…", "question": "…"}}. The leadership key only when leadership context exists. No code fences, no commentary.`;
}

export function composeDebriefText(parsed, now = new Date(), { weekEnd = null } = {}) {
  const dateLong = (weekEnd ? new Date(`${weekEnd}T12:00:00`) : now).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  const read = String(parsed?.read || '').trim();
  const wins = (Array.isArray(parsed?.wins) ? parsed.wins : []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 3);
  const changes = (Array.isArray(parsed?.changes) ? parsed.changes : [])
    .map((c) => ({ do: String(c?.do || '').trim(), why: String(c?.why || '').trim() }))
    .filter((c) => c.do)
    .slice(0, 3);
  const question = String(parsed?.question || '').trim();
  if (!read && !wins.length && !changes.length) throw new Error('the debrief came back empty');
  const title = `Weekly Debrief — week ending ${dateLong}`;
  const lines = [title, ''];
  if (read) lines.push(`**The week.** ${read}`, '');
  if (wins.length) {
    lines.push('**Wins.**');
    wins.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }
  if (changes.length) {
    lines.push('**Next week.**');
    changes.forEach((c, i) => lines.push(`${i + 1}. ${c.do}${c.why ? ` — ${c.why}` : ''}`));
    lines.push('');
  }
  const leadNote = String(parsed?.leadership?.note || '').trim();
  const leadQuestion = String(parsed?.leadership?.question || '').trim();
  if (leadNote || leadQuestion) {
    lines.push('**Leading.**' + (leadNote ? ` ${leadNote}` : ''));
    if (leadQuestion) lines.push(`- ${leadQuestion} (answer in the Leader chat — it shapes next week's ideas and research)`);
    lines.push('');
  }
  if (question) lines.push(`**To sit with.** ${question}`);
  // the changes ride the record structured too — the daily lanes read them
  return { title, text: lines.join('\n').trim(), changes };
}

/* ------------------------------ orchestration ---------------------------- */

async function thisWeekDebriefRecord() {
  const items = await listRecords();
  const weekStart = todayISO(mondayOf(new Date()));
  const thisWeek = items.filter((r) => r.kind === 'weekly-debrief' && r.createdAt && todayISO(new Date(r.createdAt)) >= weekStart);
  const live = thisWeek.find((r) => r.status !== 'error');
  if (live) return live;
  return thisWeek.length >= 3 ? thisWeek[0] : null; // 3 failed attempts cap the week
}

function startDebriefJob(vaultPath, context, mode, recordId, now, { weekStart = null, weekEnd = null } = {}) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildDebriefPrompt(context, now),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', DEBRIEF_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--model', modelFor('weekly-debrief'), // was unpinned until the model board
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the weekly debrief", minutes: 15 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = firstBalancedObjectMatch(text);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in debrief response');
      const { title, text: body, changes } = composeDebriefText(JSON.parse(jsonMatch[0]), now, { weekEnd });
      const decision = {
        route: 'journal',
        confidence: 'high',
        title,
        reason: "The Coach's weekly sit-down — the week held against the plan.",
        payload: { text: body, category: 'training', label: 'Weekly debrief', changes, weekStart },
      };
      if (mode === 'auto') {
        const { destination, undo } = await fileDecision(vaultPath, decision);
        await updateRecord(recordId, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, decision });
        import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(`${title}\n\n${body.replace(/\*\*/g, '')}`)).catch(() => {});
        import('./push.js').then(({ sendPush }) => sendPush({
          title: 'Weekly Debrief — Nova',
          body: decision.title || 'The week, held against the plan — in your journal.',
          tag: `record-${recordId}`,
        })).catch(() => {});
      } else {
        await updateRecord(recordId, { status: 'pending', decision });
      }
    } catch (e) {
      await debriefFailed(recordId, e.message, weekStart);
    }
  });
  child.on('error', async (err) => {
    await debriefFailed(recordId, err.message, weekStart);
  });
}

// THE WEEK'S FINAL FAILURE IS SAID OUT LOUD — parity with the review and
// the plan: the third errored compose for a week sends one push.
export const DEBRIEF_MAX_ATTEMPTS = 3;
async function debriefFailed(recordId, message, weekStart) {
  await updateRecord(recordId, { status: 'error', error: message }).catch(() => {});
  try {
    const records = await listRecords();
    const failed = records.filter((r) => r.kind === 'weekly-debrief' && r.status === 'error' && recordWeekStart(r) === (weekStart || todayISO(mondayOf(new Date())))).length;
    if (failed >= DEBRIEF_MAX_ATTEMPTS) {
      const { sendPush } = await import('./push.js');
      await sendPush({ title: 'Weekly Debrief — Nova', body: "The week's debrief couldn't compose, three times over — tap to run it from the Inbox.", tag: 'debrief-failed' });
    }
  } catch { /* the push is the courtesy; the error record is the truth */ }
}

// Which week a debrief record is FOR: stamped since 3 Sep 2026; older
// records are keyed by the Monday of the week they were created in.
export function recordWeekStart(r) {
  return r.weekStart || r.decision?.payload?.weekStart || (r.createdAt ? todayISO(mondayOf(new Date(r.createdAt))) : null);
}

// THE WEEK THE DEBRIEF SHOULD BE FOR, from the clock and the config — pure,
// because week boundaries are where this platform has been burned.
// - on/after the configured weekday+hour this week → THIS week (Monday of now)
// - within two days after LAST week's slot with no debrief for last week →
//   LAST week, the catch-up (a Mac asleep through Sunday evening)
// - otherwise null: nothing is due
export function debriefWeekFor(now, config, records = []) {
  // Monday-first indices: the week runs Mon→Sun, so a Sunday slot (getDay 0)
  // is the END of the week, not its start — plain getDay() ordering read
  // Saturday as "after Sunday's slot" (caught by the test)
  const idx = (now.getDay() + 6) % 7;
  const slotIdx = ((config.weekday ?? 0) + 6) % 7;
  const h = now.getHours();
  const thisMonday = todayISO(mondayOf(now));
  const lastMonday = todayISO(mondayOf(now, { weeksBack: 1 }));
  const slotPassedThisWeek = idx > slotIdx || (idx === slotIdx && h >= config.hour);
  const hasFor = (ws) => records.some((r) => r.kind === 'weekly-debrief' && r.status !== 'error' && recordWeekStart(r) === ws);
  if (slotPassedThisWeek) return hasFor(thisMonday) ? null : { weekStart: thisMonday, weekEnd: todayISO(new Date(mondayOf(now).getTime() + 6 * 86400000)), catchUp: false };
  // before this week's slot: last week's slot was this many days ago — within two, catch up
  const daysSinceLastSlot = idx + 7 - slotIdx;
  if (daysSinceLastSlot <= 2 && !hasFor(lastMonday)) {
    return { weekStart: lastMonday, weekEnd: todayISO(new Date(mondayOf(now, { weeksBack: 1 }).getTime() + 6 * 86400000)), catchUp: true };
  }
  return null;
}

export async function runWeeklyDebrief(vaultPath, { force = false, weekStart = null, weekEnd = null } = {}) {
  const config = await getDebriefConfig();
  if (config.mode === 'off' && !force) return { skipped: true, reason: 'off' };
  if (laneSkipped('weekly-debrief', 'the weekly training debrief')) return { skipped: true, reason: 'lane switched off in Settings' };
  const now = new Date();
  const ws = weekStart || todayISO(mondayOf(now));
  const we = weekEnd || todayISO(new Date(mondayOf(now).getTime() + 6 * 86400000));
  const existing = (await listRecords()).filter((r) => r.kind === 'weekly-debrief' && recordWeekStart(r) === ws);
  const live = existing.find((r) => r.status !== 'error') || (existing.length >= DEBRIEF_MAX_ATTEMPTS ? existing[0] : null);
  if (live && !force) return { skipped: true, record: live };

  const context = await buildDebriefContext(vaultPath, now, { weekStart: ws });
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'weekly-debrief',
    weekStart: ws,
    text: `Weekly Debrief — week ending ${new Date(`${we}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}`,
    source: 'coach',
    mode: config.mode,
    status: 'classifying',
    createdAt: now.toISOString(),
  });
  startDebriefJob(vaultPath, context, config.mode, record.id, now, { weekStart: ws, weekEnd: we });
  return { record };
}

// STANDING CHANGES THIS WEEK — the debrief's memory, handed to the daily
// lanes (Plan Today reads it; the Daily Review already carries the whole
// debrief). Reads the latest debrief with structured changes from the last
// eight days; '' when there is none.
export async function weekChangesContext(now = new Date()) {
  const records = await listRecords();
  const cutoff = now.getTime() - 8 * 86400000;
  const latest = records
    .filter((r) => r.kind === 'weekly-debrief' && ['filed', 'pending'].includes(r.status) && Array.isArray(r.decision?.payload?.changes) && r.decision.payload.changes.length && new Date(r.createdAt || 0).getTime() >= cutoff)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  if (!latest) return '';
  return `STANDING CHANGES THIS WEEK (set by the weekly debrief — check adherence, don't re-litigate them):\n${latest.decision.payload.changes.map((c, i) => `${i + 1}. ${c.do}${c.why ? ` — ${c.why}` : ''}`).join('\n')}`;
}

export async function getWeeklyDebriefStatus() {
  const config = await getDebriefConfig();
  const rec = await thisWeekDebriefRecord();
  return {
    config,
    thisWeek: rec ? { id: rec.id, status: rec.status, text: rec.decision?.payload?.text || null } : null,
  };
}

// The debrief is for DISCUSSING, not just reading — this hands the latest
// one (this week's, or last week's if the new one hasn't landed) to the Ask
// Nova context so a voice conversation can pick it apart.
export async function latestDebriefContext() {
  const records = await listRecords();
  const latest = records
    .filter((r) => r.kind === 'weekly-debrief' && (r.status === 'filed' || r.status === 'pending') && r.decision?.payload?.text)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return latest ? `THE LATEST WEEKLY DEBRIEF (he may want to discuss it — engage with its specifics, don't re-summarise it):\n${latest.decision.payload.text}` : '';
}

export function startWeeklyDebriefScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('weekly-debrief');
    try {
      const config = await getDebriefConfig();
      if (config.mode === 'off') return;
      const now = new Date();
      // this week's slot, or the catch-up for a week the Mac slept through
      const due = debriefWeekFor(now, config, await listRecords());
      if (!due) return;
      await runWeeklyDebrief(vaultPath, { weekStart: due.weekStart, weekEnd: due.weekEnd });
    } catch (err) {
      console.error('weekly debrief failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
