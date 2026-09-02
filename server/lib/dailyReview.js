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
import { loadSessions } from './workoutSessions.js';
import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { computeProgressions, computeDeloadSignal } from './coach.js';
import { loadRecentDays } from './healthData.js';
import { computeStreaks } from './streaks.js';
import { listTodos } from './todos.js';
import { preferencesContext } from './learning.js';
import { createRecord, updateRecord, listRecords, getRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

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

// REGISTERED IN autonomyLedger.js AUTONOMY_TARGETS ('review') — a mode config the
// trust ladder cannot see can never earn (or lose) autonomy. A new mode-config
// lane joins the registry in the same commit.
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
  // a section that FAILS is named to the model, one that is empty says
  // nothing — the add() used to swallow both the same way, so a crashed money
  // read became "no money logged" (lib/contextSections.js)
  const sections = [];
  const add = (label, load) => sections.push({ label, load });

  add('profile', () => profileContext(vaultPath));
  add('learning', () => preferencesContext(vaultPath)); // what he tends to do
  add('standing', async () => (await import('./standing.js')).standingContext(vaultPath)); // what he has SAID
  add('morning', async () => `TODAY'S PICTURE (computed now):\n${(await composeDispatch(vaultPath, 'morning', now)).text}`);
  // an 8am review must not reason from an "evening" composition of a day
  // that has not happened — the section rides only on late runs (≥ 15:00)
  if (now.getHours() >= 15) add('evening', async () => `HOW TODAY IS GOING:\n${(await composeDispatch(vaultPath, 'evening', now)).text}`);
  add('sessions', async () => {
    const s = await loadSessions(vaultPath, { limit: 4 });
    return s.length ? 'RECENT TRAINING:\n' + s.map((x) => `- ${x.date} ${x.routineName}: ${x.exercises.map((e) => `${e.name} ${e.sets.map((y) => `${y.weight}x${y.reps}`).join(',')}`).join(' | ')}`).join('\n') : null;
  });
  add('progressions', async () => {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const prog = await computeProgressions(vaultPath, routines);
    const keys = Object.keys(prog);
    return keys.length ? `EARNED PROGRESSIONS: ${keys.map((k) => `${k} +${prog[k].delta}${prog[k].kind === 'weight' ? 'kg' : ' rep'}`).join(', ')}.` : null;
  });
  add('deload', async () => {
    const signal = computeDeloadSignal(await loadRecentDays(7));
    return `RECOVERY/DELOAD SIGNAL: ${signal.advise ? `advise easing — ${signal.reason}` : signal.reason}.`;
  });
  add('streaks', async () => {
    const s = await computeStreaks(vaultPath);
    return `STREAKS: workout ${s.workoutStreak}${s.workoutStreakUnit === 'sessions' ? ' scheduled sessions in a row' : 'd'}, step-goal ${s.stepGoalStreak}d, sleep-goal ${s.sleepGoalStreak}d${s.lastWorkoutDate ? `; last session ${s.lastWorkoutDate}` : ''}.`;
  });
  add('todos', async () => {
    const { items } = await listTodos(vaultPath);
    const open = items.filter((t) => !t.checked);
    return open.length ? `OPEN TO-DOS (${open.length}): ${open.slice(0, 8).map((t) => t.text).join('; ')}.` : null;
  });
  // THE REVIEW REMEMBERS ITSELF — the weekly debrief's contract ("say plainly
  // whether last week's changes happened"), applied daily. Without this the
  // one surface built for continuity restarted from zero every morning and
  // its adjustments were fire-and-forget.
  add('yesterday-review', async () => {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const yIso = todayISO(y);
    const rec = (await listRecords()).find((r) => r.kind === 'review' && r.createdAt && todayISO(new Date(r.createdAt)) === yIso && r.decision?.payload?.text);
    if (!rec) return null;
    const fate = rec.status === 'filed' ? 'he took it into his journal'
      : rec.status === 'discarded' ? (rec.expired ? 'it expired unread' : `he declined it${rec.declineReason ? ` — his reason: "${rec.declineReason}"` : ''}`)
        : rec.status === 'pending' ? 'still unanswered' : rec.status;
    // his own marks on each adjustment (done / not today) are facts to quote, not to re-derive
    const adj = Array.isArray(rec.decision.payload.adjustments) ? rec.decision.payload.adjustments : [];
    const marks = adj.some((a) => a.outcome)
      ? `\nHIS MARKS ON THEM: ${adj.map((a, i) => `${i + 1} — ${a.outcome === 'done' ? 'DONE' : a.outcome === 'skipped' ? 'NOT TODAY' : 'unmarked'}`).join(' · ')} (a NOT TODAY is his call — ask about it once, at most, and never re-issue it unchanged).`
      : '';
    return `YESTERDAY'S REVIEW (${fate}) — hold today against it: for each adjustment it set, say plainly from today's data whether it happened, before today's read:\n${String(rec.decision.payload.text).slice(0, 900)}${marks}`;
  });
  // the week's frame — Ask Nova already reasons inside it (askContext.js
  // latestDebriefContext is the twin); the surface built for cross-domain
  // reads did not
  add('debrief', async () => (await import('./weeklyDebrief.js')).latestDebriefContext());
  // the fleet's receipts — "the Watcher's verdict landed overnight" is the
  // cross-domain connection this review exists to make
  add('fleet', async () => (await import('./fleetContext.js')).fleetContext({ now: now.getTime() }));
  // ---- the connections the July sweep found missing ----------------------
  add('goals', async () => {
    const { goalsContext } = await import('./fitnessGoals.js');
    return goalsContext(vaultPath); // the review reasons TOWARD these — it never had them
  });
  add('carryovers', async () => {
    const { carryoverContext } = await import('./workoutCarryover.js');
    return carryoverContext(); // recorded training debt
  });
  add('weight', async () => {
    const { weightTrendLine, sleepEfficiencyLine, vo2MaxLine } = await import('./healthData.js');
    const d28 = await loadRecentDays(28);
    return ['BODYWEIGHT: ' + weightTrendLine(d28), sleepEfficiencyLine(d28), vo2MaxLine(d28)].filter(Boolean).join('\n');
  });
  add('food-patterns', async () => (await import('./foodPatterns.js')).foodPatternsContext({ days: 21 }));
  // cross-domain adjustments need event NAMES and TIMES for today and
  // tomorrow, not day-counts — the counts stay for the rest of the week
  add('calendar-detail', async () => {
    const { fetchEventsForRange } = await import('./calendar.js');
    return calendarDetailLines(await fetchEventsForRange(2, now), now);
  });
  add('week-ahead', async () => {
    const { fetchEventsForRange } = await import('./calendar.js');
    const events = await fetchEventsForRange(7);
    if (!events.length) return 'WEEK AHEAD: nothing on the calendar for the next 7 days.';
    const byDate = new Map();
    for (const e of events) byDate.set(e.date, (byDate.get(e.date) || 0) + 1);
    const busiest = [...byDate.entries()].sort((a, b) => b[1] - a[1])[0];
    return `WEEK AHEAD (${events.length} events over ${byDate.size} days; busiest ${busiest[0]} with ${busiest[1]}): ` +
      [...byDate.entries()].map(([d, n]) => `${d}:${n}`).join(' · ') + '.';
  });
  add('library', async () => {
    // Resurfacing — the library only compounds if its ideas come back.
    // This used to pick the first and last items by list position, which
    // meant the same two sources every day and everything in the middle
    // never seen again. Now it is genuinely SPACED: a picker with a memory
    // that widens the gap each time a source is shown, and jumps anything
    // his vault has newly linked to the front. Deterministic pick; the model
    // decides IF it genuinely connects to today, and its discipline rules
    // already forbid forcing it.
    const { Vault } = await import('./vault.js');
    const { buildLibrary } = await import('./library.js');
    const { pickForResurfacing, readSpacing, markSurfaced } = await import('./librarySpacing.js');
    const items = await buildLibrary(vaultPath, new Vault(vaultPath));
    if (!items.length) return null;
    const pick = pickForResurfacing(items, await readSpacing(), now.getTime());
    if (!pick) return null; // nothing due — say nothing rather than repeat
    const s = pick.item;
    // Marked as surfaced HERE, when it enters the prompt. The alternative —
    // marking only if the model uses it — would let one unused idea block
    // the queue forever.
    await markSurfaced(s, now).catch(() => {});
    const why = pick.reason === 'reconnected'
      ? 'newly linked from elsewhere in his vault — that connection is the reason it is back'
      : pick.reason === 'new' ? 'never resurfaced before' : 'due for a revisit';
    return `FROM HIS LIBRARY (weave it in ONLY if it genuinely connects to today — an idea he stored, coming back when it matters; ${pick.due} source${pick.due === 1 ? '' : 's'} were due, this is the one):\n`
      + `- [${why}] "${s.title}"${s.author ? ` (${s.author})` : ''} — ideas: ${(s.concepts || []).slice(0, 4).join(', ') || String(s.excerpt || '').slice(0, 80)}${s.provenance === 'researched' ? ' [researched, not read]' : ''}`;
  });
  add('money', async () => {
    const { getMonthSummary } = await import('./money.js');
    const m = await getMonthSummary();
    if (!m || !m.count) return null;
    const over = (m.byCategory || []).filter((c) => c.budget && c.spent > c.budget).map((c) => `${c.category} over budget by $${Math.round(c.spent - c.budget)}`);
    const vsPrev = m.prevSpent ? ` (last month $${Math.round(m.prevSpent)})` : '';
    return `MONEY THIS MONTH: $${Math.round(m.spent)} spent${vsPrev}${over.length ? '; ' + over.join(', ') : ''}.`;
  });
  return (await gatherContext(sections)).text;
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
- If yesterday's review is in the picture, open with one clause per adjustment it set — did it happen, from the data, never assumed — then today's read. A review that forgets what it said yesterday is not a review.
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
  // the adjustments ride the record structured too, so each can be marked
  // done / not today on the card and read back tomorrow
  return { title, text: lines.join('\n'), read, adjustments };
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
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. The pin
    // now comes from the model board (lib/modelPrefs.js) so it is settable
    // in Settings; the default is the 'sonnet' this lane has always run on.
    '--model', modelFor('daily-review'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: "the daily review", minutes: 15 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in review response');
      const { title, text: body, read, adjustments } = composeReviewText(JSON.parse(jsonMatch[0]), now);
      const decision = {
        route: 'journal',
        confidence: 'high',
        title,
        reason: 'Daily Review — reasoned across your whole day through the Nova lens.',
        // personal category, labelled — it lives with Hayden's own reflections
        // but is always distinguishable from them
        payload: { text: body, category: 'personal', label: 'Daily review reflection', read, adjustments },
      };
      if (mode === 'auto') {
        const { destination, undo } = await fileDecision(vaultPath, decision);
        await updateRecord(recordId, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, decision });
        // auto mode skips 'pending', so the normal push never fires — but the
        // flagship read of the day landing silently defeats its purpose
        import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(`${title}\n\n${body.replace(/\*\*/g, '')}`)).catch(() => {});
        import('./push.js').then(({ sendPush }) => sendPush({
          title: 'Daily Review — Nova',
          body: decision.title || 'Today\'s review is in your journal.',
          tag: `record-${recordId}`,
        })).catch(() => {});
      } else {
        await updateRecord(recordId, { status: 'pending', decision });
      }
    } catch (e) {
      await reviewFailed(recordId, e.message, now);
    }
  });
  child.on('error', async (err) => {
    await reviewFailed(recordId, err.message, now);
  });
}

export async function runDailyReview(vaultPath, { force = false } = {}) {
  const config = await getReviewConfig();
  if (config.mode === 'off' && !force) return { skipped: true, reason: 'off' };
  // The lane switch outranks `force`: a forced run of a lane he has turned
  // off is still a run of a lane he turned off.
  if (laneSkipped('daily-review', 'the daily review')) return { skipped: true, reason: 'lane switched off in Settings' };
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

// THE ADJUSTMENT'S COMPLETION LOOP — twin of planToday.setPriorityOutcome,
// over the review's adjustments. 'done' | 'skipped' (= not today) | null
// (clear), written onto the record's own payload through the record-update
// rail; the yesterday-review context section reads it back next morning.
export async function setAdjustmentOutcome(recordId, index, outcome) {
  const rec = await getRecord(recordId);
  if (!rec || rec.kind !== 'review') throw new Error('that record is not a daily review');
  const adjustments = rec.decision?.payload?.adjustments;
  const i = Number(index);
  if (!Array.isArray(adjustments) || !Number.isInteger(i) || !adjustments[i]) throw new Error('no such adjustment');
  if (![ 'done', 'skipped', null ].includes(outcome)) throw new Error("outcome must be 'done', 'skipped' or null");
  const next = adjustments.map((a, k) => {
    if (k !== i) return a;
    const { outcome: _o, outcomeAt: _a, ...rest } = a;
    return outcome ? { ...rest, outcome, outcomeAt: new Date().toISOString() } : rest;
  });
  return updateRecord(recordId, { decision: { ...rec.decision, payload: { ...rec.decision.payload, adjustments: next } } });
}

// THE DAY'S FINAL FAILURE IS SAID OUT LOUD. In auto mode a review that errors
// three times dies silently and he learns at night that the flagship never
// spoke. The third error record of the day (todayReviewRecord's cap) sends
// one push — the existing rail — pointing at the retry.
export const REVIEW_MAX_ATTEMPTS = 3;
export function failedAttemptsToday(records, now = new Date()) {
  const t = todayISO(now);
  return records.filter((r) => r.kind === 'review' && r.status === 'error' && r.createdAt && todayISO(new Date(r.createdAt)) === t).length;
}
async function reviewFailed(recordId, message, now) {
  await updateRecord(recordId, { status: 'error', error: message }).catch(() => {});
  try {
    if (failedAttemptsToday(await listRecords(), now) >= REVIEW_MAX_ATTEMPTS) {
      const { sendPush } = await import('./push.js');
      await sendPush({ title: 'Daily Review — Nova', body: "Today's review couldn't compose, three times over — tap to retry from the Inbox.", tag: 'review-failed' });
    }
  } catch { /* the push is the courtesy; the error record is the truth */ }
}

// Today's and tomorrow's events as `HH:MM label` lines, capped PER DAY and
// honest about the cap ("today: first 4 of 8") — one shared cap let a busy
// today push tomorrow off the list entirely (his real 2 Sep: 8 events by
// noon, tomorrow unseen). Pure; the section above feeds it what the
// calendar returned. An all-day event has no time and says so.
export const CALENDAR_DETAIL_CAP_PER_DAY = 4;
export function calendarDetailLines(events, now = new Date()) {
  const today = todayISO(now);
  const tomorrow = todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const all = (events || []).filter((e) => e && (e.date === today || e.date === tomorrow));
  if (!all.length) return 'TODAY & TOMORROW ON THE CALENDAR: nothing.';
  const line = (e) => `- ${e.date === today ? 'today' : 'tomorrow'} ${e.time || 'all day'}${e.end && e.time ? `–${e.end}` : ''} ${e.label || '(untitled)'}`;
  const out = [];
  const caps = [];
  for (const [name, date] of [['today', today], ['tomorrow', tomorrow]]) {
    const day = all.filter((e) => e.date === date);
    const shown = day.slice(0, CALENDAR_DETAIL_CAP_PER_DAY);
    if (day.length > shown.length) caps.push(`${name}: first ${shown.length} of ${day.length}`);
    out.push(...shown.map(line));
  }
  return `TODAY & TOMORROW ON THE CALENDAR${caps.length ? ` (${caps.join('; ')})` : ''}:\n${out.join('\n')}`;
}
