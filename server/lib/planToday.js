import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { salvageJson, failureExcerpt } from './jsonSalvage.js';
import { gatherContext } from './contextSections.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runTextLane, laneVia, assertGrounded } from './textLane.js';
import { NOVA_LENS } from './lens.js';
import { JOURNAL_AUTHORSHIP_RULE } from './journal.js';
import { profileContext } from './profile.js';
import { composeDispatch } from './dispatch.js';
import { listTodos } from './todos.js';
import { createRecord, updateRecord, listRecords, getRecord } from './inboxStore.js';
import { fileDecision } from './inbox.js';
import { laneSkipped } from './modelPrefs.js';

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
  return (await gatherContext(planSections(vaultPath, now).filter((s) => !s.compactOnly))).text;
}

// THE COMPACT PLAN (2 Nov 2026, Phase B), the review's twin
// (dailyReview.js COMPACT_REVIEW_SECTIONS): the plan is local-first now and
// its full context is ~25k characters. The compact one keeps what the three
// are picked FROM (his rules, today's picture, carry-overs, to-dos, goals,
// the week's changes, the last review, yesterday's three, the stuck list,
// what he is working toward) and leaves out the whole profile, the shelf and
// the learned tendencies. Sections load once and both contexts share them.
export const COMPACT_PLAN_SECTIONS = new Set([
  'standing', 'aims', 'morning', 'carryovers', 'todos', 'goals', 'week-changes', 'latest-review', 'yesterday-plan', 'stuck',
]);
export async function buildPlanContexts(vaultPath, now = new Date()) {
  const sections = planSections(vaultPath, now);
  const full = (await gatherContext(sections.filter((s) => !s.compactOnly))).text;
  const compact = (await gatherContext(sections.filter((s) => COMPACT_PLAN_SECTIONS.has(s.label)))).text;
  return { full, compact };
}

const once = (fn) => { let p = null; return () => (p ||= Promise.resolve().then(fn)); };

function planSections(vaultPath, now) {
  // a section that FAILS is named to the model, one that is empty says
  // nothing — the add() used to swallow both the same way (lib/contextSections.js)
  const sections = [];
  const add = (label, load, { compactOnly = false } = {}) => sections.push({ label, load: once(load), compactOnly });
  // the compact context's stand-in for the whole profile
  add('aims', () => profileContext(vaultPath, { only: ['toward'] }), { compactOnly: true });

  add('profile', () => profileContext(vaultPath));
  // what he has been putting into his own head belongs in the day's plan —
  // a protocol he saved on Sunday is a candidate for Monday
  add('his shelf', async () => (await import('./sourceShelf.js')).shelfContext(vaultPath, { topics: 'training recovery nutrition focus leadership', limit: 3 }));
  add('standing', async () => (await import('./standing.js')).standingContext(vaultPath));
  add('learning', async () => (await import('./learning.js')).preferencesContext(vaultPath)); // what he tends to do (twin: the review's)
  add('morning', async () => `TODAY'S PICTURE (computed now):\n${(await composeDispatch(vaultPath, 'morning', now)).text}`);
  add('carryovers', async () => {
    const { makeupContext } = await import('./makeupDay.js');
    const { carryoverContext } = await import('./workoutCarryover.js');
    const [mk, co] = await Promise.all([makeupContext().catch(() => null), carryoverContext()]);
    return [mk, co].filter(Boolean).join(' ') || null;
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
    // SEEN, NOT TICKED (planObserve.js): he stopped ticking on 15 Sep while
    // still training most days, so "no word" read as "not done" and the same
    // promise was re-listed for weeks. His mark wins; the log speaks next.
    const { observePriority, dayFacts } = await import('./planObserve.js');
    const facts = await dayFacts(vaultPath, yIso, now).catch(() => null);
    const word = (p) => {
      if (p.outcome === 'done') return 'DONE (his mark)';
      if (p.outcome === 'skipped') return 'SKIPPED (his mark)';
      const seen = p.observed?.state === 'done' ? p.observed : (facts ? observePriority(p.do, { ...facts, dayOver: true }) : null);
      if (seen?.state === 'done') return `DONE — seen in his log: ${seen.evidence}`;
      if (seen) return `NOT DONE — his log: ${seen.evidence}`;
      return 'no word (nothing in the vault can tell)';
    };
    const lines = ps.map((p, i) => `${i + 1}. ${p.do} — ${word(p)}`);
    const done = lines.filter((l) => / — DONE/.test(l)).length;
    return `YESTERDAY'S TOP 3 (plan ${fate}; ${done} of ${ps.length} done by his mark or his log) — one clause on what happened, then today. Something already done is not re-listed as today's work unless today genuinely needs it again; carry a skipped or undone one forward only if it still matters today:\n${lines.join('\n')}`;
  });
  // THE PLAN STOPS REPEATING ITSELF. A promise listed three days running and
  // settled on none is stuck, and listing it a fourth time is the one move
  // that has already failed. Answered ones follow his answer.
  add('stuck', async () => {
    const { stuckNow } = await import('./planObserve.js');
    const { stuck, answered, dropped, staleTodos } = await stuckNow(vaultPath, { now });
    const out = [];
    if (stuck.length) out.push(`STUCK — on the plan ${stuck.map((s) => `${s.days} days`).join(' / ')} and never started:\n${stuck.map((s) => `- ${s.text}`).join('\n')}\nDo NOT list these again as written. If one still matters today, list only its first physical step, something that takes under two minutes ("open the podcast and play the first minute"), never the whole job. If it does not matter today, leave it out: Home asks him about it separately.`);
    const later = answered.filter((a) => a.answer === 'later');
    if (later.length) out.push(`HE SAID NOT NOW (leave out until the date): ${later.map((a) => `${a.text} (until ${a.until})`).join('; ')}`);
    if (dropped.length) out.push(`HE LET THESE GO — never list them again: ${dropped.map((d) => d.text).filter(Boolean).join('; ')}`);
    if (staleTodos.length) out.push(`TO-DOS OPEN 14+ DAYS: ${staleTodos.map((t) => `${t.text} (${t.days}d)`).join('; ')} — same rule: a two-minute first step or nothing.`);
    return out.length ? out.join('\n\n') : null;
  });
  return sections;
}

/* ------------------------------- compose --------------------------------- */

export function buildPlanPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${NOVA_LENS}

You are Nova picking Hayden's TOP 3 PRIORITIES for ${dateLong} — what this day is actually for, decided before it starts. You may read his vault (goals, journal, notes) for depth.

${JOURNAL_AUTHORSHIP_RULE}

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

// The same contract for the model on this Mac (2 Nov 2026, Phase B): the
// lens first, the job and five rules, the compact context, the JSON last.
export function buildCompactPlanPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  // the clock, said (2 Nov 2026, the first bench): with no time in the
  // prompt the 4B told him to eat breakfast "now" at 20:00
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `${NOVA_LENS}

You are Nova picking Hayden's TOP 3 PRIORITIES for ${dateLong}: what today is for. It is ${clock} now.

Rules:
- Every priority must still be doable after ${clock} today; something the facts show already done is not a priority.
- 1 to 3 priorities, most important first. Two is fine; never invent work to fill a slot.
- Each is one concrete action he can finish today, with a one-line why tied to a fact below.
- Pick from the facts below: fixed calendar blocks, training debt, protein gaps, open loops with dates. Fit around the calendar.
- Use numbers exactly as written below; never calculate a new one.
- Follow the STUCK, NOT NOW and LET GO notes below exactly when they are there.

${context || '(context unavailable — say so and keep it brief)'}

Reply with only JSON: {"priorities": [{"do": "the concrete action", "why": "one line tied to the data"}]}`;
}

// The lane's check on an answer, either model's: salvage-parsed JSON (the
// August unescaped-quote failures), composed by composePlanText (which
// refuses an empty plan). This Mac's priorities must say no number it was not
// shown. Throws with the offending excerpt so a failure names its cause.
export function readPlan(text, { provider = 'claude', prompt = '', now = new Date(), todos = null } = {}) {
  const t = String(text || '').trim();
  const salvage = salvageJson(t);
  if (!salvage.value) {
    throw Object.assign(new Error(salvage.error || 'no JSON in plan response'), { excerpt: failureExcerpt(t, salvage.error) });
  }
  if (salvage.repaired) console.log('plan-today: the model\'s JSON needed repairing before it would parse');
  const composed = composePlanText(salvage.value, now, { todos });
  if (provider === 'local') assertGrounded(composed.priorities.map((p) => `${p.do} ${p.why}`).join('\n'), prompt, 'the plan');
  return composed;
}

// ONE CALL, EITHER MODEL (2 Nov 2026). Local-first through runTextLane: the
// compact prompt to this Mac; the full prompt, with Read/Grep/Glob on his
// vault, to Claude when this Mac cannot answer or its plan fails readPlan.
export async function composePlan(vaultPath, { full, compact }, now = new Date(), { run = runTextLane, todos = null } = {}) {
  const prompt = buildPlanPrompt(full, now);
  const localPrompt = buildCompactPlanPrompt(compact, now);
  const out = await run('plan-today', prompt, {
    json: true,
    maxTokens: 700,
    localPrompt,
    claudeTools: 'Read Grep Glob',
    cwd: vaultPath,
    validate: (text, { provider }) => readPlan(text, { provider, prompt: provider === 'local' ? localPrompt : prompt, now, todos }),
  });
  return { composed: out.value, via: laneVia(out) };
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

function startPlanJob(vaultPath, contexts, mode, recordId, now) {
  (async () => {
    // the open to-dos are read BEFORE the model runs (they were read after
    // it, inside the close handler): readPlan links priorities to them
    let todos = null;
    try { todos = (await listTodos(vaultPath)).items; } catch { /* no linkage without the list — the plan still stands */ }
    const { composed, via } = await composePlan(vaultPath, contexts, now, { todos });
    const { title, text: body, priorities } = composed;
    const decision = {
      route: 'journal',
      confidence: 'high',
      title,
      reason: "Plan Today — the day's top 3, picked from the real picture.",
      // priorities ride the decision so the Home card can render them
      // without re-parsing the markdown
      payload: { text: body, category: 'personal', author: 'nova', label: 'Plan today', priorities },
    };
    // who wrote it, the Inbox's shared shape (lib/textLane.js laneVia)
    const who = via || {};
    if (mode === 'auto') {
      const { destination, undo } = await fileDecision(vaultPath, decision);
      await updateRecord(recordId, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: true, decision, ...who });
      import('./telegram.js').then(({ sendTelegramText }) => sendTelegramText(`${title}\n\n${body.replace(/\*\*/g, '')}`)).catch(() => {});
      // tier later (lib/alerts.js): the Inbox record already says it, so
      // this is a receipt and never a second card or a push
      import('./alerts.js').then(({ raiseAlert }) => raiseAlert({
        tier: 'later', label: 'PLAN', kind: 'plan-today', recordId,
        what: decision.title || "Today's top 3 are in your journal",
        where: 'in your journal', source: 'from Plan Today',
        action: { label: 'Open', open: '#/journal' },
        dedupeKey: `plan:${recordId}`,
      })).catch(() => {});
    } else {
      await updateRecord(recordId, { status: 'pending', decision, ...who });
    }
  })().catch(async (e) => {
    await planFailed(recordId, e.message, now, e.excerpt || null);
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
async function planFailed(recordId, message, now, excerpt = null) {
  await updateRecord(recordId, { status: 'error', error: message, ...(excerpt ? { rawExcerpt: excerpt } : {}) }).catch(() => {});
  try {
    if (failedPlansToday(await listRecords(), now) >= PLAN_MAX_ATTEMPTS) {
      const { sendPush } = await import('./push.js');
      await sendPush({ title: 'Plan Today — Nova', body: "Today's plan couldn't compose, three times over — tap to run it from the Inbox.", tag: 'plan-failed', kind: 'compose-failed' });
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
  const contexts = await buildPlanContexts(vaultPath, now);
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'plan-today',
    text: `Plan Today — ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}`,
    source: 'nova',
    mode: config.mode,
    status: 'classifying', // in-flight while the model reasons
    createdAt: now.toISOString(),
  });
  startPlanJob(vaultPath, contexts, config.mode, record.id, now);
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
