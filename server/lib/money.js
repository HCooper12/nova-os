import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

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

export function categorize(text) {
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

async function readMonth(month) {
  if (!existsSync(monthPath(month))) return { month, transactions: [] };
  try {
    const raw = JSON.parse(await readFile(monthPath(month), 'utf8'));
    return { month, transactions: Array.isArray(raw.transactions) ? raw.transactions : [] };
  } catch {
    return { month, transactions: [] };
  }
}

async function writeMonth(month, data) {
  await mkdir(MONEY_DIR(), { recursive: true });
  const tmp = monthPath(month) + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, monthPath(month));
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

export async function setTransactionCategory(id, category) {
  if (!CATEGORIES.includes(category)) throw new Error('unknown category');
  for (const month of await listMonths()) {
    const data = await readMonth(month);
    const t = data.transactions.find((x) => x.id === id);
    if (t) {
      t.category = category;
      await writeMonth(month, data);
      return t;
    }
  }
  throw new Error('transaction not found');
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

export async function getBudgets() {
  if (!existsSync(CONFIG_PATH())) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH(), 'utf8')).budgets || {};
  } catch {
    return {};
  }
}

export async function setBudget(category, amount) {
  if (!CATEGORIES.includes(category)) throw new Error('unknown category');
  const budgets = await getBudgets();
  const value = Math.round(Number(amount));
  if (value > 0) budgets[category] = value;
  else delete budgets[category];
  await mkdir(MONEY_DIR(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ budgets }, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return budgets;
}

/* ----------------------------- subscriptions ----------------------------- */

const CADENCES = [
  { name: 'weekly', days: 7, tolerance: 2 },
  { name: 'fortnightly', days: 14, tolerance: 3 },
  { name: 'monthly', days: 30, tolerance: 6 },
  { name: 'quarterly', days: 91, tolerance: 10 },
  { name: 'yearly', days: 365, tolerance: 20 },
];

function merchantKey(m) {
  return (m || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(pty|ltd|au|com|www|pay|payment)\b/g, '').trim();
}

// Recurring spend: same merchant, similar amount (±12%), a consistent
// interval, at least 2 occurrences. Returns cadence, next expected date, and
// whether the price has risen since the previous charge.
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
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const similar = Math.abs(Math.abs(latest.amount) - Math.abs(prev.amount)) <= Math.abs(prev.amount) * 0.12;
    if (!similar) continue;
    const gapDays = Math.round((new Date(latest.date) - new Date(prev.date)) / 86400000);
    const cadence = CADENCES.find((c) => Math.abs(gapDays - c.days) <= c.tolerance);
    if (!cadence) continue;

    const next = new Date(latest.date);
    next.setDate(next.getDate() + cadence.days);
    subs.push({
      merchant: latest.merchant,
      amount: Math.abs(latest.amount),
      cadence: cadence.name,
      lastDate: latest.date,
      nextExpected: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      occurrences: sorted.length,
      priceRise: Math.abs(latest.amount) > Math.abs(prev.amount) * 1.02
        ? { from: Math.abs(prev.amount), to: Math.abs(latest.amount) }
        : null,
    });
  }
  return subs.sort((a, b) => (a.nextExpected < b.nextExpected ? -1 : 1));
}

/* -------------------------------- summary -------------------------------- */

export async function getMonthSummary(month) {
  const m = month || todayISO().slice(0, 7);
  const { transactions } = await readMonth(m);
  const prevDate = new Date(`${m}-15T00:00:00`);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;
  const prev = (await readMonth(prevMonth)).transactions;

  const spendOf = (list) => Math.round(list.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0) * 100) / 100;
  const incomeOf = (list) => Math.round(list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const budgets = await getBudgets();
  const byCategory = CATEGORIES.map((c) => ({
    category: c,
    spent: spendOf(transactions.filter((t) => t.category === c)),
    prev: spendOf(prev.filter((t) => t.category === c)),
    budget: budgets[c] || null,
  })).filter((c) => c.spent > 0 || c.prev > 0 || c.budget);

  return {
    month: m,
    prevMonth,
    spent: spendOf(transactions),
    prevSpent: spendOf(prev),
    income: incomeOf(transactions),
    count: transactions.length,
    byCategory,
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
  for (const t of rows) lines.push([t.date, t.amount.toFixed(2), esc(t.merchant), t.category, esc(t.note || ''), t.source].join(','));
  return { filename: `nova-money-FY${String(fy - 1).slice(2)}-${String(fy).slice(2)}.csv`, csv: lines.join('\n') + '\n', count: rows.length };
}
