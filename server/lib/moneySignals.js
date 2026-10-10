import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { listTransactions, getBudgets, detectSubscriptions, merchantKey, daysBetween, getMonthSummary } from './money.js';
import { createRecord, listRecords, updateRecord, getRecord } from './inboxStore.js';
import { TIME_ZONE } from './quietHours.js';

// MONEY THAT NEEDS HIM, AS SIGNALS (10 Oct 2026). His words that day: "ensure
// … it interacts with everything else in nova so it can alert me and discuss
// important things as needed".
//
// Code finds the events; no model decides what is news. Four kinds, each a
// rule written here and pinned by a test (server/test/moneySignals.test.js):
//
//   price-rise   a recurring charge's latest amount is more than 2% above the
//                one before it (detectSubscriptions' rule), charged in the
//                last RISE_FRESH_DAYS. An old rise is history, not news.
//   over-budget  this month's spend in a budgeted category is above its budget
//   bill-due     a recurring charge's next date is today or up to BILL_DAYS out
//   unusual      a spend in the last UNUSUAL_FRESH_DAYS that is more than
//                UNUSUAL_MULTIPLE times that merchant's median, over at least
//                UNUSUAL_MIN_PRIOR earlier charges from it (fewer, and "usual"
//                means nothing yet)
//
// Each event files ONE record on the inbox rails (kind `money`, pending, with
// a Talk about it door in the Inbox and a Discuss door on Home), keyed so it
// never files twice: the keys are kept in data/money/signals.json, so a record
// trimmed from the Inbox's history cannot come back as news.
//
// PUSHES (his rule, 10 Oct): only a price rise, a bill due TOMORROW, or a
// category over budget. A bill filed three days out pushes nothing then, and
// pushes once on the day before. Every push goes through push.sendPush, which
// holds it through his quiet hours and delivers it when they end. The inbox's
// own push-on-pending is switched off for this kind (inboxStore.js), so the
// rule here is the only one.
//
// Stale news leaves on its own: a bill whose day has passed, a month that has
// ended, a rise or an unusual charge after its time. Discarded as `expired`,
// never as his decline.

export const UNUSUAL_MULTIPLE = 2.5;
export const UNUSUAL_MIN_PRIOR = 3;
export const UNUSUAL_FRESH_DAYS = 7;
export const RISE_FRESH_DAYS = 35;
export const BILL_DAYS = 3;
const SEEN_KEEP_DAYS = 120;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const SEEN_PATH = () => path.join(dataRoot(), 'money', 'signals.json');

const pad = (n) => String(n).padStart(2, '0');
const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
// his calendar date at instant `now` (Melbourne), as YYYY-MM-DD
export const localISO = (now) => isoFmt.format(new Date(now));
const addDays = (iso, k) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const money = (n) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const money2 = (n) => `$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const UNIT = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month', quarterly: 'quarter', yearly: 'year' };
const dayWords = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthWords = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-AU', { month: 'long', timeZone: 'UTC' });
const CAT_WORDS = (c) => String(c || '').replace(/\b(Out|Fitness|Bills)\b/g, (w) => w.toLowerCase());
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
// an expiry at the START of a local day, as a UTC stamp (his day, the platform's clock)
const startOfLocalDay = (iso) => {
  // Melbourne is UTC+10 or +11; the start of his day is the previous UTC evening.
  // Taking 13:00 UTC the day before (00:00 at +11) errs an hour late in winter, never early.
  return new Date(`${addDays(iso, -1)}T13:00:00Z`).toISOString();
};

// THE RULES, pure. `transactions` are the last 13 months, `budgets` the config's
// map, `now` the instant (tests pin it). Returns events, newest kinds first.
export function detectMoneyEvents({ transactions = [], budgets = {}, subscriptions = null, now = Date.now() } = {}) {
  const today = localISO(now);
  const month = today.slice(0, 7);
  const subs = subscriptions || detectSubscriptions(transactions);
  const events = [];

  for (const s of subs) {
    if (!s.priceRise) continue;
    const on = s.priceRise.on || s.lastDate;
    const age = daysBetween(on, today);
    if (age < 0 || age > RISE_FRESH_DAYS) continue;
    const unit = UNIT[s.cadence] || 'charge';
    const step = s.priceRise.to - s.priceRise.from;
    events.push({
      type: 'price-rise',
      key: `rise|${s.key || merchantKey(s.merchant)}|${s.priceRise.to}|${on}`,
      merchant: s.merchant, category: s.category || null, cadence: s.cadence,
      from: s.priceRise.from, to: s.priceRise.to, on, nextExpected: s.nextExpected,
      title: `${s.merchant} went up from ${money2(s.priceRise.from)} to ${money2(s.priceRise.to)} a ${unit}.`,
      body: `Up ${money2(step)} a ${unit}. Its next charge is due ${dayWords(s.nextExpected)}.`,
      expiresAt: startOfLocalDay(addDays(on, RISE_FRESH_DAYS + 7)),
    });
  }

  const monthLines = transactions.filter((t) => String(t.date).slice(0, 7) === month);
  for (const [category, budget] of Object.entries(budgets || {})) {
    if (!(budget > 0)) continue;
    const spent = Math.round(monthLines.filter((t) => t.category === category && t.amount < 0).reduce((s, t) => s - t.amount, 0) * 100) / 100;
    if (spent <= budget) continue;
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
    events.push({
      type: 'over-budget',
      key: `over|${category}|${month}`,
      category, budget, spent, over: Math.round((spent - budget) * 100) / 100, month,
      title: `${CAT_WORDS(category)} is ${money(spent - budget)} over its ${money(budget)} budget for ${monthWords(month)}.`,
      body: `${money2(spent)} spent against ${money(budget)}.`,
      expiresAt: startOfLocalDay(nextMonth),
    });
  }

  for (const s of subs) {
    const d = daysBetween(today, s.nextExpected);
    if (d < 0 || d > BILL_DAYS) continue;
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `on ${dayWords(s.nextExpected)}`;
    const sure = s.confidence?.kind;
    events.push({
      type: 'bill-due',
      key: `bill|${s.key || merchantKey(s.merchant)}|${s.nextExpected}`,
      merchant: s.merchant, category: s.category || null, amount: s.amount, cadence: s.cadence, dueDate: s.nextExpected,
      confidence: s.confidence?.word || null,
      title: `${s.merchant}, ${money2(s.amount)}, is due ${when}.`,
      body: sure === 'sure' ? 'Nova is sure of the date from its history.' : sure === 'likely' ? `The date is likely, give or take ${s.confidence.window} day${s.confidence.window === 1 ? '' : 's'}.` : 'The date is a guess: it has only a short or uneven history.',
      expiresAt: startOfLocalDay(addDays(s.nextExpected, 1)),
    });
  }

  const spends = transactions.filter((t) => t.amount < 0 && t.date);
  const byMerchant = new Map();
  for (const t of spends) {
    const k = merchantKey(t.merchant);
    if (!k) continue;
    if (!byMerchant.has(k)) byMerchant.set(k, []);
    byMerchant.get(k).push(t);
  }
  for (const t of spends) {
    const age = daysBetween(t.date, today);
    if (age < 0 || age > UNUSUAL_FRESH_DAYS) continue;
    const prior = (byMerchant.get(merchantKey(t.merchant)) || []).filter((x) => x.id !== t.id && (x.date < t.date || (x.date === t.date && (x.addedAt || '') < (t.addedAt || ''))));
    if (prior.length < UNUSUAL_MIN_PRIOR) continue;
    const usual = median(prior.map((x) => Math.abs(x.amount)));
    if (!(usual > 0) || Math.abs(t.amount) <= usual * UNUSUAL_MULTIPLE) continue;
    const ratio = Math.round((Math.abs(t.amount) / usual) * 10) / 10;
    events.push({
      type: 'unusual',
      key: `unusual|${t.id}`,
      id: t.id, merchant: t.merchant, category: t.category || null, amount: Math.abs(t.amount), usual, ratio, date: t.date,
      title: `${t.merchant} charged ${money2(t.amount)}, ${ratio} times its usual ${money2(usual)}.`,
      body: `Usual is the middle of its last ${prior.length} charges. Nova flags anything over ${UNUSUAL_MULTIPLE} times that.`,
      expiresAt: startOfLocalDay(addDays(t.date, UNUSUAL_FRESH_DAYS + 1)),
    });
  }
  return events;
}

// THE PUSH RULE, pure: a price rise, a bill due tomorrow, a category over.
export function pushRule(event, now = Date.now()) {
  if (!event) return false;
  if (event.type === 'price-rise' || event.type === 'over-budget') return true;
  if (event.type === 'bill-due') return event.dueDate === addDays(localISO(now), 1);
  return false;
}

/* ------------------------------ the seen keys ----------------------------- */

async function loadSeen() {
  if (!existsSync(SEEN_PATH())) return {};
  try { return JSON.parse(await readFile(SEEN_PATH(), 'utf8')).seen || {}; } catch { return {}; }
}
async function saveSeen(seen, now) {
  const cutoff = now - SEEN_KEEP_DAYS * 86400000;
  const kept = Object.fromEntries(Object.entries(seen).filter(([, at]) => Date.parse(at) >= cutoff));
  await mkdir(path.dirname(SEEN_PATH()), { recursive: true });
  const tmp = `${SEEN_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify({ seen: kept }, null, 2), 'utf8');
  await rename(tmp, SEEN_PATH());
}

// one key at a time, so the import watcher and the signals tick cannot both file it
let chain = Promise.resolve();
const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

const KIND_WORD = { 'price-rise': 'A price went up', 'over-budget': 'Over budget', 'bill-due': 'A bill is due', unusual: 'An unusual charge', 'unreadable-file': 'A file Nova can’t read yet' };

function recordFor(event, at) {
  return {
    id: randomUUID().slice(0, 8),
    kind: 'money',
    text: event.title,
    source: 'cfo',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date(at).toISOString(),
    event,
    expiresAt: event.expiresAt || null,
    pushedAt: null,
    decision: {
      route: 'money-event',
      confidence: 'high',
      title: event.title,
      reason: `${KIND_WORD[event.type] || 'Money'}. ${event.body || ''} Approve = noted; nothing is written.`.trim(),
      payload: { event },
    },
  };
}

async function pushFor(record, at, deps) {
  const send = deps.sendPush || (await import('./push.js')).sendPush;
  const e = record.event;
  const out = await send({ title: KIND_WORD[e.type] || 'Money', body: e.title, tag: `money-${record.id}`, url: './#/money' });
  await updateRecord(record.id, { pushedAt: new Date(at).toISOString() });
  return out;
}

// THE TICK. Detect, file what is new, push by the rule, expire what is stale.
// `now` and `deps` (sendPush) are injectable for tests.
// `types` limits a run to some event types: the ledger-change check runs
// only over-budget and unusual (news the moment it happens); the nightly run
// passes none and does everything, including the expiry sweep and the bill
// that is now due tomorrow.
export const ON_CHANGE_TYPES = ['over-budget', 'unusual'];
export async function runMoneySignals({ vaultPath = null, now = Date.now(), deps = {}, types = null } = {}) {
  return locked(async () => {
    const transactions = await listTransactions({ sinceMonths: 13 });
    const budgets = await getBudgets();
    const events = detectMoneyEvents({ transactions, budgets, now }).filter((e) => !types || types.includes(e.type));
    const seen = await loadSeen();
    const created = [];
    let pushed = 0;

    for (const e of events) {
      if (seen[e.key]) continue;
      // expired before it was ever filed (a first run on old news): remember it, file nothing
      if (e.expiresAt && Date.parse(e.expiresAt) <= now) { seen[e.key] = new Date(now).toISOString(); continue; }
      const record = await createRecord(recordFor(e, now));
      seen[e.key] = new Date(now).toISOString();
      created.push(record);
      if (pushRule(e, now)) { await pushFor(record, now, deps); pushed++; }
    }

    let expired = 0;
    for (const r of types ? [] : await listRecords()) {
      if (r.kind !== 'money' || r.status !== 'pending') continue;
      const e = r.event || r.decision?.payload?.event;
      // a bill filed days out, now due tomorrow: its one push
      if (e?.type === 'bill-due' && !r.pushedAt && pushRule(e, now)) { await pushFor(r, now, deps); pushed++; }
      const gone = e?.type === 'unreadable-file' && vaultPath && e.file && !existsSync(path.join(vaultPath, e.dir || 'Money/Imports', e.file));
      if ((r.expiresAt && Date.parse(r.expiresAt) <= now) || gone) {
        await updateRecord(r.id, { status: 'discarded', discardedAt: new Date(now).toISOString(), expired: true, error: null, declineReason: gone ? 'the file is no longer in Money/Imports' : 'its time passed' });
        expired++;
      }
    }
    await saveSeen(seen, now);
    return { created, pushed, expired };
  });
}

// A FILE NOVA CANNOT READ (mockup 90, the .xlsx frame). A spreadsheet in
// Money/Imports was skipped in silence; it now raises one honest card per
// file and content, saying it is a spreadsheet, that Nova reads CSV, and how
// to re-save it. Nothing parses it (reading .xlsx is his call, still open).
export async function noteUnreadableFile({ file, hash, dir = 'Money/Imports', now = Date.now() }) {
  return locked(async () => {
    const seen = await loadSeen();
    const key = `file|${file}|${hash}`;
    if (seen[key]) return null;
    const ext = path.extname(file).slice(1).toLowerCase();
    const event = {
      type: 'unreadable-file', key, file, dir, ext,
      // an .xlsx is read directly (10 Oct 2026); these two still are not
      title: ext === 'xls' ? `${file} is an older Excel file (.xls). Nova reads CSV and .xlsx files.` : ext === 'numbers' ? `${file} is a Numbers file. Nova reads CSV and .xlsx files.` : `${file} is a spreadsheet Nova can’t open. Nova reads CSV and .xlsx files.`,
      body: 'Open it in Numbers, File › Export To › CSV, and save it into the same folder. Nova finds the CSV within five minutes and asks before filing anything.',
      expiresAt: null,
    };
    const record = await createRecord(recordFor(event, now));
    seen[key] = new Date(now).toISOString();
    await saveSeen(seen, now);
    return record;
  });
}

// A money event answered from the Money screen. `keep` / `noted` resolve it
// with nothing written; `cancel` (a price rise he does not want) files a To-Do
// to cancel before the next charge through the to-do rails, with their Undo.
export async function answerMoneyEvent(vaultPath, id, answer) {
  const record = await getRecord(id);
  if (!record || record.kind !== 'money') throw new Error('that money card is gone');
  if (record.status !== 'pending') throw new Error('that card has already been answered');
  const e = record.event || record.decision?.payload?.event || {};
  const at = new Date().toISOString();
  if (answer === 'cancel') {
    if (e.type !== 'price-rise') throw new Error('only a price rise can become a To-Do to cancel');
    const before = addDays(e.nextExpected, -1);
    const text = `Cancel ${e.merchant} before ${dayWords(before)}`;
    const { fileDecision } = await import('./inbox.js');
    const { destination, undo } = await fileDecision(vaultPath, { route: 'todo', confidence: 'high', title: text, reason: 'Money: a price rise he chose not to keep.', payload: { items: [{ text, category: null }] } });
    return updateRecord(id, { status: 'filed', filedAt: at, auto: false, destination, undoData: undo, outcome: 'cancel', error: null });
  }
  if (answer === 'keep' || answer === 'noted' || answer == null) {
    return updateRecord(id, { status: 'filed', filedAt: at, auto: false, destination: null, outcome: answer || 'noted', error: null });
  }
  throw new Error('unknown answer');
}

/* ------------------------------- the CFO's read ---------------------------- */

const CAT_LABEL = (c) => CAT_WORDS(c);

// MONEY THIS MONTH, for every agent that reasons (10 Oct 2026). Ask Nova
// carries it in his context and any agent can consult the CFO for it
// (lib/consult.js AGENTS.cfo, a code-read source like the calendar). Every
// figure is computed here from the ledger; the model only reads it. Returns
// plain text; `null` only when the ledger is unreadable.
export async function moneyContext({ now = new Date() } = {}) {
  const s = await getMonthSummary(undefined, { now });
  const monthName = new Date(`${s.month}-15T12:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const prevName = new Date(`${s.prevMonth}-15T12:00:00`).toLocaleDateString('en-AU', { month: 'long' });
  const lines = [`MONEY THIS MONTH (${monthName}, day ${s.asOfDay} of ${s.daysInMonth}). Computed by code from his ledger; every figure is exact, so quote them rather than estimate.`];
  if (!s.count) {
    lines.push(`- No lines in the ledger for ${monthName} yet${s.prevSpent ? ` (${prevName} was ${money2(s.prevSpent)} spent)` : ''}.`);
  } else {
    lines.push(`- Spent ${money2(s.spent)} across ${s.count} lines${s.income ? `; ${money2(s.income)} came in (${s.incomeCount} payment${s.incomeCount === 1 ? '' : 's'})` : ''}.`);
    const budgeted = s.byCategory.filter((c) => c.budget);
    const total = budgeted.reduce((n, c) => n + c.budget, 0);
    const daysLeft = Math.max(0, s.daysInMonth - s.asOfDay);
    if (total) {
      const left = total - s.spent;
      const pace = total * s.asOfDay / s.daysInMonth;
      lines.push(`- Budgets total ${money(total)}. ${left >= 0 ? `${money2(left)} left` : `${money2(-left)} past the total`}${daysLeft && left > 0 ? `, about ${money(left / daysLeft)} a day for the ${daysLeft} days left` : ''}. An even pace by today is ${money(pace)}; he is ${money(Math.abs(pace - s.spent))} ${s.spent <= pace ? 'under' : 'over'} it.`);
    } else lines.push('- No budgets are set.');
    if (s.prevSpentToDay || s.prevSpent) {
      const d = s.spent - s.prevSpentToDay;
      lines.push(`- By day ${s.asOfDay} of ${prevName} he had spent ${money2(s.prevSpentToDay)}; this month is ${money2(Math.abs(d))} ${d <= 0 ? 'less' : 'more'}. ${prevName} ended at ${money2(s.prevSpent)}.`);
    }
    const cats = [...s.byCategory].filter((c) => c.category !== 'Income' && (c.spent || c.budget)).sort((a, b) => b.spent - a.spent);
    if (cats.length) lines.push(`- By category: ${cats.map((c) => `${CAT_LABEL(c.category)} ${money2(c.spent)}${c.budget ? ` of ${money(c.budget)}${c.spent > c.budget ? `, ${money2(c.spent - c.budget)} OVER` : ''}` : ' (no budget)'}`).join('; ')}.`);
  }
  const subs = s.subscriptions || [];
  if (subs.length) {
    const perMonth = subs.reduce((n, x) => n + (x.perMonth || 0), 0);
    const soon = subs.filter((x) => { const d = daysBetween(s.today, x.nextExpected); return d >= 0 && d <= 14; });
    lines.push(`- Recurring: ${subs.length} detected, about ${money(perMonth)} a month.${soon.length ? ` Next 14 days: ${soon.map((x) => `${x.merchant} ${money2(x.amount)} on ${dayWords(x.nextExpected)} (${(x.confidence?.word || 'a guess').toLowerCase()})`).join('; ')}.` : ''}`);
    const rises = subs.filter((x) => x.priceRise);
    if (rises.length) lines.push(`- Price rises: ${rises.map((x) => `${x.merchant} ${money2(x.priceRise.from)} to ${money2(x.priceRise.to)} (${x.priceRise.on})`).join('; ')}.`);
  }
  try {
    const waiting = (await listRecords()).filter((r) => r.kind === 'money' && r.status === 'pending');
    if (waiting.length) lines.push(`- Waiting on him in the Inbox: ${waiting.slice(0, 6).map((r) => r.text).join(' ')}`);
  } catch { /* the Inbox unreadable: say nothing about it */ }
  return lines.join('\n');
}
