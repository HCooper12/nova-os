import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { budgetFromInput } from '../../src/moneyParse.js';
import { isSplit, explodeParts, partsOf, normalizeSplit } from '../../src/moneyParts.js';

// The CFO's ledger. Transactions live in monthly JSON stores under
// data/money/ (high-volume structured data, same reasoning as the food log);
// the vault gets the human-readable monthly report via the inbox rails.
// Everything here is deterministic — categorisation is a keyword map, and
// subscription detection is arithmetic over intervals, not a model call.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const MONEY_DIR = () => path.join(dataRoot(), 'money');
const CONFIG_PATH = () => path.join(MONEY_DIR(), 'config.json');

export const CATEGORIES = ['Groceries', 'Eating Out', 'Transport', 'Health & Fitness', 'Subscriptions', 'Utilities & Bills', 'Shopping', 'Entertainment', 'Income', 'Other'];

// Keyword → category. Deliberately coarse — a wrong guess is one tap to fix
// on the Money screen, and the map grows as Hayden's real merchants appear.
const CATEGORY_KEYWORDS = [
  ['Groceries', ['woolworths', 'coles', 'aldi', 'iga', 'harris farm', 'grocer', 'supermarket', 'butcher']],
  ['Eating Out', ['cafe', 'coffee', 'restaurant', 'uber eats', 'ubereats', 'menulog', 'doordash', 'deliveroo', 'mcdonald', 'kfc', 'guzman', 'sushi', 'bakery', 'pizza', 'kebab', 'thai ', 'grill']],
  ['Transport', ['opal', 'uber', 'didi', 'ola ', 'translink', 'myki', 'fuel', 'petrol', 'bp ', 'shell', 'caltex', 'ampol', 'parking', 'toll', 'linkt', 'rego']],
  ['Health & Fitness', ['gym', 'fitness', 'anytime', 'f45', 'chemist', 'pharmacy', 'priceline', 'medicare', 'physio', 'dentist', 'doctor', 'medical', 'myprotein', 'supplement']],
  ['Subscriptions', ['netflix', 'spotify', 'youtube', 'disney', 'binge', 'stan', 'kayo', 'apple com', 'icloud', 'openai', 'anthropic', 'claude', 'elevenlabs', 'github', 'patreon', 'audible', 'kindle', 'adobe', 'notion', 'todoist', 'billroo']],
  ['Utilities & Bills', ['origin', 'agl', 'energy', 'electric', 'water', 'telstra', 'optus', 'vodafone', 'internet', 'nbn', 'insurance', 'rent', 'council', 'strata']],
  ['Entertainment', ['cinema', 'hoyts', 'event', 'ticketek', 'ticketmaster', 'steam', 'playstation', 'nintendo', 'xbox', 'bar ', 'pub ', 'brewery', 'bottle']],
  ['Shopping', ['amazon', 'ebay', 'kmart', 'target', 'big w', 'bunnings', 'officeworks', 'jb hi', 'myer', 'uniqlo', 'asos', 'the iconic', 'chemist warehouse']],
  ['Income', ['salary', 'payroll', 'pay ', 'wage', 'interest', 'dividend', 'refund', 'reimburse', 'centrelink']],
];

// his own merchant rule for this text, or null (an import asks first, so
// his correction beats a budget app's category and the keyword guess)
export function overrideFor(text) {
  const key = overridesCache ? merchantKey(text) : null;
  return key && overridesCache[key] ? overridesCache[key] : null;
}

export function categorize(text) {
  // a merchant he has corrected once is filed his way from then on
  if (overridesCache) {
    const key = merchantKey(text);
    if (key && overridesCache[key]) return overridesCache[key];
  }
  // statement descriptions carry merchant-processor noise ("UBER *EATS",
  // "SQ *CAFE") — collapse punctuation so keywords match the real merchant
  const t = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return 'Other';
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function monthOf(date) {
  return (date || '').slice(0, 7);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const monthPath = (month) => path.join(MONEY_DIR(), `${month}.json`);

// A month file that will not parse is QUARANTINED (renamed .corrupt-<stamp>,
// so the next write cannot silently overwrite the evidence) and said out
// loud on the heartbeat — it used to read exactly like an empty month.
const corruptMonths = new Set();
export const listCorruptMonths = () => [...corruptMonths].sort();
async function readMonth(month) {
  if (!existsSync(monthPath(month))) return { month, transactions: [], corrupt: corruptMonths.has(month) };
  try {
    const raw = JSON.parse(await readFile(monthPath(month), 'utf8'));
    return { month, transactions: Array.isArray(raw.transactions) ? raw.transactions : [] };
  } catch (e) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try { await rename(monthPath(month), `${monthPath(month)}.corrupt-${stamp}`); } catch { /* leave it; still report */ }
    corruptMonths.add(month);
    console.error(`money: ${month}.json unreadable — quarantined as .corrupt-${stamp} (${e.message})`);
    import('./heartbeat.js').then(({ note }) => note('money', `${month}.json was unreadable and has been quarantined (.corrupt-${stamp}) — that month's totals are missing until it is restored`)).catch(() => {});
    return { month, transactions: [], corrupt: true };
  }
}

// THE LEDGER TELLS WHEN IT CHANGED (his call, 10 Oct 2026: a category over
// budget is seen the moment it happens, not on a timer). Every write to a
// month or the budget config pings the listeners, debounced, so a batch of
// lines is one check. No listener, nothing happens (tests stay quiet).
const changeListeners = new Set();
let changeTimer = null;
export function onMoneyChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
function noteMoneyChange() {
  if (!changeListeners.size) return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { for (const fn of changeListeners) Promise.resolve().then(fn).catch((e) => console.error('money change listener failed:', e.message)); }, 1500);
}

async function writeMonth(month, data) {
  await mkdir(MONEY_DIR(), { recursive: true });
  const tmp = monthPath(month) + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, monthPath(month));
  noteMoneyChange();
}

// A transaction's identity for dedupe: same day, same cents, same
// normalised description. Bank re-exports and overlapping date ranges are
// the norm, so imports must be idempotent.
export function dedupeKey(t) {
  const desc = (t.merchant || t.description || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${t.date}|${Math.round(Number(t.amount) * 100)}|${desc}`;
}

function normalizeTransaction(input, source) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : todayISO();
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount === 0) throw new Error('amount must be a non-zero number');
  const merchant = String(input.merchant || input.description || '').trim().slice(0, 120);
  if (!merchant) throw new Error('merchant/description is required');
  const category = CATEGORIES.includes(input.category) ? input.category : categorize(merchant);
  return {
    id: randomUUID().slice(0, 8),
    date,
    amount, // negative = spend, positive = money in (bank convention)
    merchant,
    category,
    note: String(input.note || '').trim().slice(0, 200) || null,
    source: source || input.source || 'manual',
    addedAt: new Date().toISOString(),
  };
}

// Batch add — returns ONLY what was actually inserted (duplicates are
// dropped silently by dedupeKey), so a filing's receipt and undo ids can
// never describe rows that aren't there.
export async function addTransactions(inputs, source) {
  const normalized = inputs.map((t) => normalizeTransaction(t, source));
  const byMonth = new Map();
  for (const t of normalized) {
    const m = monthOf(t.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(t);
  }
  const inserted = [];
  for (const [month, list] of byMonth) {
    const data = await readMonth(month);
    const seen = new Set(data.transactions.map(dedupeKey));
    for (const t of list) {
      if (seen.has(dedupeKey(t))) continue;
      seen.add(dedupeKey(t));
      data.transactions.push(t);
      inserted.push(t);
    }
    data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    await writeMonth(month, data);
  }
  if (inserted.length) import('./events.js').then(({ broadcast }) => broadcast('money')).catch(() => {});
  return inserted;
}

export async function removeTransactions(ids) {
  const idSet = new Set(ids);
  let removed = 0;
  for (const month of await listMonths()) {
    const data = await readMonth(month);
    const before = data.transactions.length;
    data.transactions = data.transactions.filter((t) => !idSet.has(t.id));
    if (data.transactions.length !== before) {
      removed += before - data.transactions.length;
      await writeMonth(month, data);
    }
  }
  return removed;
}

// The old door: a category change that also files every future line from
// the merchant the same way (the correct-once rail, said nowhere). Kept for
// any caller that wants exactly that; the Money screen now uses
// editTransaction, where the merchant rule is his switch.
export async function setTransactionCategory(id, category) {
  return (await editTransaction(id, { category, rule: true })).transaction;
}

// ONE LINE CHANGED, with everything an undo needs to put it back: the line's
// category and note before, and the merchant rule before (its category, or
// null when there was none). `rule` true files the merchant his way from now
// on AND moves every other line already in the ledger from it ("Yes, every
// last purchase too", his call 10 Oct 2026): `moved` lists each one with the
// category it had, so Undo puts every line back where it was.
//
// `parts` (his call 10 Oct 2026, "Yes, split across categories"): two
// { category, amount } pieces split the line (src/moneyParts.js holds the
// shape; the line's category becomes the first part's); null joins a split
// line back into one category. Giving a category without parts also joins
// it, since one category for the whole line is what that means. `before`
// keeps the parts (or null) so Undo restores the line exactly.
export async function editTransaction(id, { category, note, rule = false, parts } = {}) {
  if (category !== undefined && !CATEGORIES.includes(category)) throw new Error('unknown category');
  for (const month of await listMonths()) {
    const data = await readMonth(month);
    const t = data.transactions.find((x) => x.id === id);
    if (!t) continue;
    const before = { category: t.category, note: t.note ?? null, parts: isSplit(t) ? t.parts.map((p) => ({ ...p })) : null };
    if (Array.isArray(parts)) {
      const sound = normalizeSplit(t.amount, parts, CATEGORIES); // throws before anything is written
      t.parts = sound;
      t.category = sound[0].category;
    } else if (parts === null || category !== undefined) {
      if (category !== undefined) t.category = category;
      delete t.parts;
    }
    if (note !== undefined) t.note = String(note || '').trim().slice(0, 200) || null;
    await writeMonth(month, data);
    let override = null;
    let moved = [];
    if (rule && category !== undefined && !Array.isArray(parts)) {
      const key = merchantKey(t.merchant);
      if (key) {
        const cfg = await readConfig();
        override = { key, before: cfg.merchantOverrides[key] || null };
        await setMerchantOverride(t.merchant, category);
        moved = await moveMerchantLines(key, category, { except: id, incoming: t.amount > 0 });
      }
    }
    return { transaction: t, before, override, moved };
  }
  throw new Error('transaction not found');
}

// Would this other line move with a merchant rule? Same merchant, same
// direction (a purchase moves purchases, money in moves money in), not
// already there, and not one he split by hand (a split keeps its parts).
const movesWith = (t, key, category, { except, incoming }) => t.id !== except
  && merchantKey(t.merchant) === key
  && (t.amount > 0) === !!incoming
  && t.category !== category
  && !isSplit(t);

// Every other line from the merchant filed `category`; returns [{ id, the
// category it had }] for the undo. One write per month touched.
async function moveMerchantLines(key, category, opts) {
  const moved = [];
  for (const month of await listMonths()) {
    const data = await readMonth(month);
    let changed = false;
    for (const t of data.transactions) {
      if (!movesWith(t, key, category, opts)) continue;
      moved.push({ id: t.id, category: t.category });
      t.category = category;
      changed = true;
    }
    if (changed) await writeMonth(month, data);
  }
  if (moved.length) import('./events.js').then(({ broadcast }) => broadcast('money')).catch(() => {});
  return moved;
}

// The other lines in the ledger from this line's merchant, in the same
// direction, counted by the category each is in now: what the line sheet
// says a merchant rule would move. `split` counts the ones that stay put.
export async function merchantLines(id) {
  const all = [];
  for (const month of await listMonths()) all.push(...(await readMonth(month)).transactions);
  const t = all.find((x) => x.id === id);
  if (!t) throw new Error('transaction not found');
  const key = merchantKey(t.merchant);
  const incoming = t.amount > 0;
  const byCategory = {};
  let split = 0;
  for (const x of all) {
    if (x.id === id || !key || merchantKey(x.merchant) !== key || (x.amount > 0) !== incoming) continue;
    if (isSplit(x)) { split++; continue; }
    byCategory[x.category] = (byCategory[x.category] || 0) + 1;
  }
  return { id, byCategory, split };
}

// Lines put back in the categories they had (a merchant move's undo). A line
// deleted since is skipped; returns how many came back.
export async function restoreCategories(list) {
  const want = new Map((list || []).filter((m) => m && m.id && CATEGORIES.includes(m.category)).map((m) => [m.id, m.category]));
  if (!want.size) return 0;
  let restored = 0;
  for (const month of await listMonths()) {
    const data = await readMonth(month);
    let changed = false;
    for (const t of data.transactions) {
      if (!want.has(t.id)) continue;
      t.category = want.get(t.id);
      restored++;
      changed = true;
    }
    if (changed) await writeMonth(month, data);
  }
  if (restored) import('./events.js').then(({ broadcast }) => broadcast('money')).catch(() => {});
  return restored;
}

// A merchant rule set back to what it was (null removes it): an undo's half.
export async function restoreMerchantOverride(key, category) {
  if (!key) return;
  const cfg = await readConfig();
  if (category && CATEGORIES.includes(category)) cfg.merchantOverrides[key] = category;
  else delete cfg.merchantOverrides[key];
  await writeConfig(cfg);
}

// Lines put back EXACTLY as they were (same id, same stamps): a delete's undo.
// A line whose id is already in its month is left alone, so a double undo
// cannot duplicate it.
export async function restoreTransactions(list) {
  const byMonth = new Map();
  for (const t of list || []) {
    if (!t || !t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) continue;
    const m = monthOf(t.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(t);
  }
  let restored = 0;
  for (const [month, rows] of byMonth) {
    const data = await readMonth(month);
    const ids = new Set(data.transactions.map((t) => t.id));
    for (const t of rows) {
      if (ids.has(t.id)) continue;
      data.transactions.push(t);
      restored++;
    }
    data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    await writeMonth(month, data);
  }
  if (restored) import('./events.js').then(({ broadcast }) => broadcast('money')).catch(() => {});
  return restored;
}

// The lines with these ids, as stored (for a delete to keep before it deletes).
export async function findTransactions(ids) {
  const want = new Set(ids);
  const out = [];
  for (const month of await listMonths()) {
    for (const t of (await readMonth(month)).transactions) if (want.has(t.id)) out.push(t);
  }
  return out;
}

export async function listMonths() {
  if (!existsSync(MONEY_DIR())) return [];
  return (await readdir(MONEY_DIR()))
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 7))
    .sort()
    .reverse();
}

export async function listTransactions({ month, sinceMonths } = {}) {
  const months = month ? [month] : (await listMonths()).slice(0, sinceMonths || 13);
  const all = [];
  for (const m of months) all.push(...(await readMonth(m)).transactions);
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// One config file: budgets AND merchant overrides. Read and written whole,
// so setting a budget can never wipe an override (or the reverse).
async function readConfig() {
  if (!existsSync(CONFIG_PATH())) return { budgets: {}, merchantOverrides: {} };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return { budgets: raw.budgets || {}, merchantOverrides: raw.merchantOverrides || {} };
  } catch {
    return { budgets: {}, merchantOverrides: {} };
  }
}
async function writeConfig(cfg) {
  await mkdir(MONEY_DIR(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  overridesCache = cfg.merchantOverrides || {};
  noteMoneyChange();
}

export async function getBudgets() {
  return (await readConfig()).budgets;
}

// The amount is read by the one shared reader (src/moneyParse.js): "$250" and
// "1,200" set 250 and 1200; empty clears; anything unreadable THROWS and the
// old budget stays (it used to become 0, which deleted it).
export async function setBudget(category, amount) {
  if (!CATEGORIES.includes(category)) throw new Error('unknown category');
  const value = budgetFromInput(amount);
  if (value === undefined) throw new Error(`could not read "${String(amount).slice(0, 40)}" as an amount; the budget is unchanged`);
  const cfg = await readConfig();
  if (value) cfg.budgets[category] = value;
  else delete cfg.budgets[category];
  await writeConfig(cfg);
  return cfg.budgets;
}

// The budget a category has right now (null for none), for an undo to restore.
export async function getBudget(category) {
  return (await readConfig()).budgets[category] || null;
}

// MERCHANT OVERRIDES — the correct-once rail, applied to money. A category he
// fixes on one transaction holds for that merchant from then on: categorize()
// consults the overrides before its keywords. Kept in a module cache so the
// synchronous categorize() (the CSV parser calls it per row) can read it;
// loadOverrides() refreshes the cache before a parse.
let overridesCache = null;
export async function loadOverrides() {
  overridesCache = (await readConfig()).merchantOverrides;
  return overridesCache;
}
export async function getOverrides() {
  return loadOverrides();
}
export async function setMerchantOverride(merchant, category) {
  if (!CATEGORIES.includes(category)) throw new Error('unknown category');
  const key = merchantKey(merchant);
  if (!key) return null;
  const cfg = await readConfig();
  cfg.merchantOverrides[key] = category;
  await writeConfig(cfg);
  return { key, category };
}

/* ----------------------------- subscriptions ----------------------------- */

const CADENCES = [
  { name: 'weekly', days: 7, tolerance: 2 },
  { name: 'fortnightly', days: 14, tolerance: 3 },
  { name: 'monthly', days: 30, tolerance: 6 },
  { name: 'quarterly', days: 91, tolerance: 10 },
  { name: 'yearly', days: 365, tolerance: 20 },
];

export function merchantKey(m) {
  return (m || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(pty|ltd|au|com|www|pay|payment)\b/g, '').trim();
}

// Calendar arithmetic on plain dates, in UTC so a daylight-saving night can
// never make a day 23 hours long.
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
const MONTHS_OF = { monthly: 1, quarterly: 3, yearly: 12 };
// One cadence step on from `iso`, `k` times: a month is the same day next
// month (the 31st becomes the last day of a shorter month), never 30 days.
export function addCadence(iso, cadence, k = 1) {
  const c = typeof cadence === 'string' ? CADENCES.find((x) => x.name === cadence) : cadence;
  const months = MONTHS_OF[c.name];
  if (!months) return fromUTC(toUTC(iso) + c.days * k * 86400000);
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months * k;
  const ty = y + Math.floor(total / 12), tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

const NOUN = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month', quarterly: 'quarter', yearly: 'year' };
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// HOW SURE NOVA IS OF A BILL'S NEXT DATE (mockup 90, Bills; his call 5 taken
// as the build's default). Computed over EVERY gap, not the last two: each
// charge is placed against the day the one before it predicted (a missed
// period counts as whole periods, so a skipped month is not a wander), and
// the word comes from the worst miss:
//   Sure      four or more charges, none more than a day off
//   Likely    three or more, none more than five days off; the window on the
//             calendar is that many days either side
//   A guess   two charges, or three or more that wander further
// `offsets` is one per charge, the first at 0, for the strip of dots. Pure.
export function billConfidence(dates, cadence) {
  const c = typeof cadence === 'string' ? CADENCES.find((x) => x.name === cadence) : cadence;
  const sorted = [...dates].sort();
  const offsets = [0];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    const k = Math.max(1, Math.round(gap / c.days));
    offsets.push(daysBetween(addCadence(sorted[i - 1], c, k), sorted[i]));
  }
  const n = sorted.length;
  const worst = Math.max(0, ...offsets.map((o) => Math.abs(o)));
  const kind = n >= 4 && worst <= 1 ? 'sure' : n >= 3 && worst <= 5 ? 'likely' : 'guess';
  const latest = sorted[n - 1];
  let said;
  if (kind === 'sure') {
    if (worst === 0) {
      said = MONTHS_OF[c.name]
        ? `${n} charges, every one on the ${ordinal(Number(latest.slice(8)))}.`
        : `${n} charges, every one on a ${WEEKDAY[new Date(toUTC(latest)).getUTCDay()]}.`;
    } else said = `${n} charges, none more than a day off.`;
  } else if (kind === 'likely') {
    said = `${n} charges, each within ${plural(worst, 'day')} of the ${NOUN[c.name]}. The window on the calendar is those days.`;
  } else if (n === 2) {
    said = `Seen twice, ${daysBetween(sorted[0], sorted[1])} days apart. Two is the least Nova counts as recurring, so it stays a guess until a third.`;
  } else {
    said = `${n} charges, landing up to ${plural(worst, 'day')} from the expected day, so the date is a guess.`;
  }
  return {
    kind,
    word: kind === 'sure' ? 'Sure' : kind === 'likely' ? 'Likely' : 'A guess',
    charges: n,
    offsets: offsets.slice(-12),
    window: kind === 'likely' ? worst : 0,
    said,
  };
}

// What a recurring charge costs a month, for "$72 a month · $18 a week".
const PER_MONTH = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

// Recurring spend: same merchant, similar amount (±12%), a consistent
// interval, at least 2 occurrences. Returns cadence, next expected date (by
// the calendar: a monthly charge on the 13th is next due on the 13th), how
// sure that date is (billConfidence, over every charge), the recent charges
// for the price-rise drawing, and whether the price has risen since the
// previous charge.
export function detectSubscriptions(transactions) {
  const spends = transactions.filter((t) => t.amount < 0);
  const groups = new Map();
  for (const t of spends) {
    const key = merchantKey(t.merchant);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const subs = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const similar = Math.abs(Math.abs(latest.amount) - Math.abs(prev.amount)) <= Math.abs(prev.amount) * 0.12;
    if (!similar) continue;
    const gapDays = daysBetween(prev.date, latest.date);
    const cadence = CADENCES.find((c) => Math.abs(gapDays - c.days) <= c.tolerance);
    if (!cadence) continue;

    // the charges that are this bill: amounts within 30% of the latest, so a
    // one-off purchase at the same merchant does not count as a wander
    const charges = sorted.filter((t) => Math.abs(Math.abs(t.amount) - Math.abs(latest.amount)) <= Math.abs(latest.amount) * 0.3);
    subs.push({
      key,
      merchant: latest.merchant,
      category: latest.category || null,
      amount: Math.abs(latest.amount),
      cadence: cadence.name,
      perMonth: Math.round(Math.abs(latest.amount) * PER_MONTH[cadence.name] * 100) / 100,
      lastDate: latest.date,
      nextExpected: addCadence(latest.date, cadence),
      occurrences: sorted.length,
      confidence: billConfidence(charges.map((t) => t.date), cadence),
      history: charges.slice(-6).map((t) => ({ date: t.date, amount: Math.abs(t.amount) })),
      priceRise: Math.abs(latest.amount) > Math.abs(prev.amount) * 1.02
        ? { from: Math.abs(prev.amount), to: Math.abs(latest.amount), on: latest.date }
        : null,
    });
  }
  return subs.sort((a, b) => (a.nextExpected < b.nextExpected ? -1 : 1));
}

/* -------------------------------- summary -------------------------------- */

const monthShift = (m, k) => {
  const d = new Date(`${m}-15T00:00:00`);
  d.setMonth(d.getMonth() + k);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const daysIn = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const cents = (n) => Math.round(n * 100) / 100;
const spendOf = (list) => cents(list.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
const incomeOf = (list) => cents(list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
// spend per day of the month, index 0 = the 1st
function dailyOf(list, days) {
  const out = new Array(days).fill(0);
  for (const t of list) {
    if (t.amount >= 0) continue;
    const d = Number(String(t.date).slice(8, 10));
    if (d >= 1 && d <= days) out[d - 1] = cents(out[d - 1] - t.amount);
  }
  return out;
}
// where a line came from, in the words the page uses
export function sourceKind(source) {
  const s = String(source || 'manual');
  if (s === 'import') return 'export';
  if (s === 'scan') return 'scan';
  return 'typed'; // manual, capture, voice and anything a person typed
}

// THE MONTH, every figure the page draws, computed here so the screen never
// adds anything up. `asOfDay` is the day the month is compared at: today's
// date in the current month, the whole month for a past one (so a past month
// never says "this month" or "days left"). `now` is injectable for tests.
export async function getMonthSummary(month, { now = new Date() } = {}) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const current = today.slice(0, 7);
  const m = month || current;
  const { transactions, corrupt } = await readMonth(m);
  const prevMonth = monthShift(m, -1);
  const prev = (await readMonth(prevMonth)).transactions;
  const before = (await readMonth(monthShift(m, -2))).transactions;

  const days = daysIn(m);
  const prevDays = daysIn(prevMonth);
  const isCurrent = m === current;
  const asOfDay = isCurrent ? now.getDate() : m < current ? days : 0;
  const prevAsOf = Math.min(asOfDay, prevDays);
  const upTo = (list, day) => list.filter((t) => Number(String(t.date).slice(8, 10)) <= day);
  const prevToDay = upTo(prev, prevAsOf);

  const budgets = await getBudgets();
  // by category, a split line counts each part in its own category
  // (src/moneyParts.js); the month's total and its days read lines whole
  const [partsNow, partsPrev, partsPrevToDay, partsBefore] = [transactions, prev, prevToDay, before].map(explodeParts);
  const byCategory = CATEGORIES.map((c) => {
    const mine = partsNow.filter((t) => t.category === c);
    const theirs = partsPrev.filter((t) => t.category === c);
    return {
      category: c,
      spent: spendOf(mine),
      prev: spendOf(theirs),
      prevToDay: spendOf(partsPrevToDay.filter((t) => t.category === c)),
      visits: mine.filter((t) => t.amount < 0).length,
      prevVisitsToDay: partsPrevToDay.filter((t) => t.category === c && t.amount < 0).length,
      // the two months before this one and this one, oldest first (the budget sheet's bars)
      history: [spendOf(partsBefore.filter((t) => t.category === c)), spendOf(theirs), spendOf(mine)],
      budget: budgets[c] || null,
    };
  }).filter((c) => c.spent > 0 || c.prev > 0 || c.budget);

  const sources = { export: 0, typed: 0, scan: 0 };
  for (const t of transactions) sources[sourceKind(t.source)] += 1;
  const recent = [...transactions, ...prev].filter((t) => t.source === 'import' && t.addedAt).map((t) => t.addedAt).sort();
  const incomes = transactions.filter((t) => t.amount > 0).sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    month: m,
    prevMonth,
    today,
    isCurrent,
    asOfDay,
    daysInMonth: days,
    daysInPrev: prevDays,
    spent: spendOf(transactions),
    prevSpent: spendOf(prev),
    prevSpentToDay: spendOf(prevToDay),
    income: incomeOf(transactions),
    incomeCount: incomes.length,
    lastIncomeDate: incomes[0]?.date || null,
    count: transactions.length,
    corrupt: !!corrupt,
    budgets,
    byCategory,
    daily: dailyOf(transactions, days),
    prevDaily: dailyOf(prev, prevDays),
    sources,
    lastImportAt: recent[recent.length - 1] || null,
    transactions,
    subscriptions: detectSubscriptions(await listTransactions({ sinceMonths: 13 })),
  };
}

/* ---------------------------- FY export (AU) ------------------------------ */

// Australian financial year: 1 July (fy-1) → 30 June (fy). fy=2027 means
// FY26-27. CSV with stable columns for the accountant/spreadsheet.
export async function exportFinancialYear(fy) {
  const from = `${fy - 1}-07-01`;
  const to = `${fy}-06-30`;
  const rows = (await listTransactions({ sinceMonths: 26 }))
    .filter((t) => t.date >= from && t.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['Date,Amount,Merchant,Category,Note,Source'];
  // a split line is one row per part, each in its category, its note saying
  // so; the columns stay the same, and the rows still add up to the ledger
  for (const t of rows) {
    const parts = partsOf(t);
    parts.forEach((p, i) => {
      const note = parts.length > 1 ? `split ${i + 1} of ${parts.length}${t.note ? `; ${t.note}` : ''}` : (t.note || '');
      lines.push([t.date, Number(p.amount).toFixed(2), esc(t.merchant), p.category, esc(note), t.source].join(','));
    });
  }
  return { filename: `nova-money-FY${String(fy - 1).slice(2)}-${String(fy).slice(2)}.csv`, csv: lines.join('\n') + '\n', count: lines.length - 1 };
}
