// ---------------------------------------------------------------------------
// SEEN, NOT TICKED — what the vault already knows about the day's three.
//
// The measurement that made this (25 Sep, his real record): 27 days of plans,
// 78 priorities, 10 marked done, 5 skipped, 63 never marked, and no mark of
// any kind after 15 Sep. Over the same days he logged a training session on
// 20 of 27. The priorities were being DONE; the tick was what died. So the
// planner read "no word" every morning and re-listed the same things: the
// fixed-protein breakfast priority ran eighteen days straight.
//
// Replayed over all 78: 37 checkable, 29 of them done (he ticked 10), and
// the log agrees with 7 of the 8 he marked himself.
//
// Deterministic first: for the priorities the vault can check (a session is
// logged or it is not; a protein number was reached or it was not), code
// checks. His own mark always wins, and stays the only way to close anything
// the vault cannot see (a conversation, a call, a write-up). Nothing here
// writes to the vault; `observed` rides on the plan record beside `outcome`.
//
// Conservative on purpose: a priority is only claimed when its words say
// plainly what it is. A wrong "done" is worse than a missing one.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Replayed against all 78 of his real priorities before shipping. The first
// cut read "Pull 'Training Frequency…' out" as a Pull session, "make the
// explicit call on Barbell Bench" as training, an active-rest day as a missed
// session, and "plan meals… lock a 40g source" as eating. Hence: a session
// word is required (a routine name alone is a verb as often as a workout),
// and decisions, rest days and planning are named out.
const TRAIN_RE = /\b(session|workout|leg day|upper body|lower body)\b/i;
const TRAIN_NOT_WORDS = /\b(active[- ]rest|rest day|explicit call|decide|decision|walk|stretch|backfill)\b/i;
const TRAIN_NOT_QUOTE = /(?:^|\s)['"‘“][A-Z]/;   // a quoted title is reading, not lifting (an apostrophe is not a quote)
const PROTEIN_RE = /\bprotein\b/i;
const PROTEIN_NOT = /\b(plan|planning|shopping|list|lock|build|stock|buy|prep)\b/i;
const ROUTINE_WORDS = ['push', 'pull', 'leg', 'upper', 'lower'];

// THE PROMISE IS THE OPENING CLAUSE. The rest of the sentence is reasons and
// scaffolding: "Hit the 150g protein floor … against the 179g rotation plan"
// is about eating, "Run the Leg Day session … instead of letting them slip to
// Sunday's rest day" is a session. Judging the whole sentence let a word in
// the reasons veto the promise (the second replay lost 21 real ones that way).
// A leading "At the 07:00 slot," or "During the 15:30 work block," says WHEN,
// not what: the promise is the clause after it.
const WHEN_ONLY = /^(?:at|in|during|by|before|after|from)\b[^,—;]{0,32}$/i;
export function openingClause(text) {
  const parts = String(text || '').split(/\s[—–-]\s|;|,\s|\sand use it\b|\sthen\b|\s\(/);
  return WHEN_ONLY.test(parts[0].trim()) && parts[1] ? parts[1] : parts[0];
}

// What kind of promise a priority is, from its opening clause. Pure.
export function priorityKind(text) {
  const t = openingClause(text);
  if (PROTEIN_RE.test(t)) return PROTEIN_NOT.test(t) ? null : 'protein';
  if (TRAIN_RE.test(t) && !TRAIN_NOT_WORDS.test(t) && !TRAIN_NOT_QUOTE.test(t)) return 'train';
  return null;
}

// Which routine a training priority names, if any ("Run today's Pull
// session" → 'pull'): the earliest routine word, opening clause first. Pure.
export function namedRoutine(text) {
  for (const part of [openingClause(text), String(text || '')]) {
    const t = part.toLowerCase();
    const hits = ROUTINE_WORDS
      .map((w) => ({ w, at: t.search(new RegExp(`\\b${w}(?:s)?\\b`)) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (hits.length) return hits[0].w;
  }
  return null;
}

// The protein promise's shape. "Hit the 150g protein floor" is a day total;
// "eat a fixed ~40g protein source at breakfast" is one entry of about that
// size. WHEN is not checked: his log times are when he logged, not when he
// ate (a breakfast smoothie stamped 21:16; sessions logged hours after the
// 07:30 slot), so a clock rule marked eaten meals as missed. The evidence
// line shows the time, so he can see what was counted. Pure.
export function proteinPromise(text) {
  const t = (/\d{2,3}\s?g\b/.test(openingClause(text)) ? openingClause(text) : String(text || '')).toLowerCase();
  const grams = [...t.matchAll(/~?\s?(\d{2,3})\s?g\b/g)].map((m) => Number(m[1]));
  if (!grams.length) return null;
  const g = grams[0];
  if (/\bfloor|target|total|today\b|hit\b/.test(t) && g >= 100) return { kind: 'total', g };
  if (g < 100) return { kind: 'single', g };
  return { kind: 'total', g };
}

const hm = (s) => (typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) ? s : null);

// One priority against one day's facts → { state, evidence } or null when the
// vault cannot say. `state`: 'done' | 'not-yet' (the day is still going) |
// 'missed' (the day is over and the log shows no sign). Pure.
//   facts = { sessions: [{ routineName, finishedAt }], entries: [{ macros:{p}, time, slot, name }], dayOver }
export function observePriority(text, facts) {
  const kind = priorityKind(text);
  if (!kind || !facts) return null;
  const open = facts.dayOver ? 'missed' : 'not-yet';
  if (kind === 'train') {
    // the session he promised, when it is named: a Tricep top-up is not the
    // Leg Day the plan asked for
    const named = namedRoutine(text);
    const sessions = facts.sessions || [];
    const s = named ? sessions.find((x) => String(x.routineName || '').toLowerCase().includes(named)) : sessions[0];
    if (!s && named && sessions.length) {
      return { state: open, evidence: `${sessions.map((x) => x.routineName).join(' + ')} logged, not ${named[0].toUpperCase()}${named.slice(1)}` };
    }
    if (s) {
      const at = s.finishedAt ? new Date(s.finishedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
      return { state: 'done', evidence: `${s.routineName || 'a session'} logged${at ? ` ${at}` : ''}` };
    }
    return { state: open, evidence: facts.dayOver ? 'no session in the log' : 'no session logged yet' };
  }
  const promise = proteinPromise(text);
  if (!promise) return null;
  const entries = facts.entries || [];
  if (promise.kind === 'total') {
    const total = Math.round(entries.reduce((n, e) => n + (Number(e?.macros?.p) || 0), 0));
    if (total >= promise.g) return { state: 'done', evidence: `${total}g protein logged` };
    return { state: open, evidence: `${total} of ${promise.g}g logged` };
  }
  const hit = entries.find((e) => (Number(e?.macros?.p) || 0) >= promise.g * 0.85);
  if (hit) return { state: 'done', evidence: `${Math.round(hit.macros.p)}g in ${hit.name}${hm(hit.time) ? ` at ${hit.time}` : ''}` };
  return { state: open, evidence: facts.dayOver ? `no single ${promise.g}g entry that day` : `no single ${promise.g}g entry yet` };
}

// Is this priority settled, by his word or the log's? Pure.
export function isSettled(p) {
  return p?.outcome === 'done' || p?.outcome === 'skipped' || p?.observed?.state === 'done';
}

// ---- STUCK: what the plan keeps listing and nothing ever closes ----------
//
// A priority's identity across days is its content words, not its wording:
// "Eat the fixed 40g protein source right after…" and "Put the 40g fixed
// protein source in it…" are one promise. Times, numbers and filler go.
const STOP = new Set(('a an the and or to of in on at for by with your you it its this that today todays day now then '
  + 'run do make get put eat hit use treat complete finish during before after into from as per actually right').split(' '));
export function promiseKey(text) {
  const words = String(text || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, 5).sort().join(' ');
}

// Two keys name the same promise when most of the shorter one's words are
// in the longer. Pure.
export function samePromise(a, b) {
  const A = new Set(String(a).split(' ').filter(Boolean));
  const B = new Set(String(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size >= 0.6 && shared >= 2;
}

// plans: [{ date, priorities: [{ do, outcome?, observed? }] }] newest first.
// → [{ key, text, days, since }] for promises listed on `minDays` or more of
// the window's plans and settled on none of them. Pure.
export function stuckPriorities(plans, { window = 7, minDays = 3 } = {}) {
  const recent = (plans || []).slice(0, window);
  const groups = [];
  for (const plan of recent) {
    for (const p of plan.priorities || []) {
      const key = promiseKey(p.do);
      if (!key) continue;
      let g = groups.find((x) => samePromise(x.key, key));
      if (!g) { g = { key, text: p.do, dates: new Set(), settled: false, since: plan.date }; groups.push(g); }
      g.dates.add(plan.date);
      if (plan.date < g.since) g.since = plan.date;
      if (isSettled(p)) g.settled = true;
    }
  }
  return groups
    .filter((g) => !g.settled && g.dates.size >= minDays)
    .map((g) => ({ key: g.key, text: g.text, days: g.dates.size, since: g.since }))
    .sort((a, b) => b.days - a.days);
}

// The link a promise is about, when it names one: the same podcast is the
// same promise whether the plan says "watch and write up" or the to-do says
// "research and analyse". Pure.
export function linkKey(text) {
  const t = String(text || '');
  const yt = t.match(/(?:youtu\.be\/|[?&]v=)([\w-]{6,})/);
  if (yt) return `yt:${yt[1]}`;
  const url = t.match(/https?:\/\/([^\s?#)]+)/);
  return url ? url[1].replace(/\/$/, '').toLowerCase() : null;
}

// Open to-dos older than `days`. Pure. items: [{ text, added, checked }]
export function staleTodos(items, today, days = 14) {
  const t0 = Date.parse(`${today}T00:00:00`);
  return (items || [])
    .filter((t) => !t.checked && t.added)
    .map((t) => ({ text: t.text, added: t.added, days: Math.round((t0 - Date.parse(`${t.added}T00:00:00`)) / 86400000) }))
    .filter((t) => t.days >= days)
    .sort((a, b) => b.days - a.days);
}

// ---- the loaders (I/O) ----------------------------------------------------

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function dayFacts(vaultPath, dateISO, now = new Date()) {
  const [{ loadSessions }, { getDay }] = await Promise.all([import('./workoutSessions.js'), import('./foodLog.js')]);
  const sessions = (await loadSessions(vaultPath, {}).catch(() => []))
    .filter((s) => String(s.date || '').slice(0, 10) === dateISO);
  const { entries } = await getDay(dateISO).catch(() => ({ entries: [] }));
  return { sessions, entries: entries || [], dayOver: dateISO < localISO(now) };
}

// Stamp `observed` onto every day-plan priority from the last `days` days
// whose reading changed. His `outcome` is never touched. Returns how many
// records were updated. The plan record is the one place both the planner
// and the phone read, so the observation lands where both already look.
export async function observePlans(vaultPath, { days = 3, now = new Date() } = {}) {
  const { listRecords, updateRecord } = await import('./inboxStore.js');
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days);
  const plans = (await listRecords()).filter((r) => r.kind === 'plan-today'
    && Array.isArray(r.decision?.payload?.priorities) && r.createdAt && new Date(r.createdAt) >= cutoff);
  let changed = 0;
  for (const rec of plans) {
    const date = localISO(new Date(rec.createdAt));
    const facts = await dayFacts(vaultPath, date, now);
    const before = rec.decision.payload.priorities;
    const after = before.map((p) => {
      const seen = observePriority(p.do, facts);
      const { observed: _old, ...rest } = p;
      return seen ? { ...rest, observed: seen } : rest;
    });
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    await updateRecord(rec.id, { decision: { ...rec.decision, payload: { ...rec.decision.payload, priorities: after } } });
    changed++;
  }
  return changed;
}

// The plans the stuck detector reads, newest first, from the record store.
export async function recentPlans({ limit = 10 } = {}) {
  const { listRecords } = await import('./inboxStore.js');
  const byDate = new Map();
  for (const r of await listRecords()) {
    if (r.kind !== 'plan-today' || !Array.isArray(r.decision?.payload?.priorities) || !r.createdAt) continue;
    if (r.status === 'discarded' && !r.expired) continue;   // a plan he declined was never his list
    const date = localISO(new Date(r.createdAt));
    const prev = byDate.get(date);
    if (!prev || String(r.createdAt) > String(prev.createdAt)) byDate.set(date, { date, createdAt: r.createdAt, priorities: r.decision.payload.priorities });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

// ---- STUCK, DECIDED: what he said about each stuck promise ----------------
//
// Three answers, all his: START IT (a voice session that takes the first two
// minutes with him, rituals.js 'start'), NOT NOW (hidden for three days, and
// the planner leaves it out until then), LET IT GO (hidden for good, and the
// planner is told never to list it again). Operational state, like the
// commitments' dismissals: nothing in the vault changes, and 'restore'
// undoes either answer.

const STUCK_PATH = () => path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'stuck.json');
export const LATER_DAYS = 3;

export async function readStuckDecisions() {
  if (!existsSync(STUCK_PATH())) return {};
  try { return JSON.parse(await readFile(STUCK_PATH(), 'utf8')).decisions || {}; } catch { return {}; }
}

export async function decideStuck(key, action, { text = '', now = new Date() } = {}) {
  if (!key || typeof key !== 'string') throw new Error('which promise? no key');
  if (!['later', 'drop', 'restore'].includes(action)) throw new Error("action must be 'later', 'drop' or 'restore'");
  const decisions = await readStuckDecisions();
  const prior = decisions[key] || null;
  if (action === 'restore') delete decisions[key];
  else {
    const until = action === 'later' ? localISO(new Date(now.getTime() + LATER_DAYS * 86400000)) : null;
    decisions[key] = { action, at: now.toISOString(), ...(until ? { until } : {}), text: String(text).slice(0, 200) };
  }
  await mkdir(path.dirname(STUCK_PATH()), { recursive: true });
  const tmp = `${STUCK_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify({ decisions }, null, 2), 'utf8');
  await rename(tmp, STUCK_PATH());
  return { key, action, prior };
}

// A stuck item he has answered: dropped for good, or 'later' until its date. Pure.
export function answeredFor(key, decisions, today) {
  const hit = Object.entries(decisions || {}).find(([k]) => k === key || samePromise(k, key));
  if (!hit) return null;
  const [, d] = hit;
  if (d.action === 'drop') return d;
  if (d.action === 'later' && d.until && today < d.until) return d;
  return null;
}

// The whole picture, observed now: stuck promises he has not answered, the
// ones he let go, the ones he put off, and to-dos that have gone stale.
export async function stuckNow(vaultPath, { now = new Date() } = {}) {
  const today = localISO(now);
  const plans = await recentPlans({ limit: 7 });
  const [{ loadSessions }, { getDay }] = await Promise.all([import('./workoutSessions.js'), import('./foodLog.js')]);
  const all = await loadSessions(vaultPath, {}).catch(() => []);
  const seen = [];
  for (const pl of plans) {
    const f = {
      sessions: all.filter((s) => String(s.date || '').slice(0, 10) === pl.date),
      entries: (await getDay(pl.date).catch(() => ({ entries: [] }))).entries || [],
      dayOver: pl.date < today,
    };
    seen.push({ ...pl, priorities: pl.priorities.map((p) => ({ ...p, observed: p.observed || observePriority(p.do, f) })) });
  }
  const decisions = await readStuckDecisions();
  const stuck = stuckPriorities(seen);
  let todos = [];
  try { todos = staleTodos((await (await import('./todos.js')).listTodos(vaultPath)).items, today); } catch { /* no page, no stale to-dos */ }
  const open = [];
  const answered = [];
  for (const s of stuck) {
    const a = answeredFor(s.key, decisions, today);
    (a ? answered : open).push(a ? { ...s, answer: a.action, until: a.until || null } : s);
  }
  const dropped = Object.entries(decisions).filter(([, d]) => d.action === 'drop').map(([key, d]) => ({ key, text: d.text }));
  // a stale to-do that is the same promise as a stuck plan item rides WITH it
  // (one card, and "done" can tick the to-do), instead of being asked twice
  for (const t of todos) {
    const link = linkKey(t.text);
    const twin = link && open.find((s) => linkKey(s.text) === link);
    if (twin) { twin.todo = t.text; t.merged = true; }
  }
  const todoOpen = todos.filter((t) => !t.merged && !answeredFor(promiseKey(t.text), decisions, today))
    .map(({ merged: _m, ...t }) => ({ ...t, key: promiseKey(t.text) }));
  return { stuck: open, answered, dropped, staleTodos: todoOpen };
}

// Keep the day's observations current: the phone reads them off the plan
// record, so a session finished at 14:00 shows as done without a tick. A
// timer for the quiet hours, and a nudge from every workout or food write so
// the tick lands seconds after the log does, not ten minutes.
let observerVault = null;
let nudgeTimer = 0;
const observeNow = () => observePlans(observerVault).then(async (n) => {
  if (!n) return;
  console.log(`plan observer: ${n} plan(s) updated from the log`);
  try { (await import('./events.js')).broadcast('write', { slices: ['inbox', 'stuck'] }); } catch { /* no open apps */ }
}).catch((e) => console.error('plan observer failed:', e.message));

export function startPlanObserver(vaultPath, { everyMs = 10 * 60 * 1000 } = {}) {
  observerVault = vaultPath;
  observeNow();
  return setInterval(observeNow, everyMs);
}

export function nudgePlanObserver() {
  if (!observerVault) return;
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(observeNow, 4000);
}
