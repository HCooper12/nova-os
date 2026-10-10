// DEMO MONEY — demoMode only (NOVA-METHOD: demo content never leaves demo).
//
// An invented October, shaped exactly like GET /api/money, so the Money page
// can be seen and photographed without his ledger. Every merchant, amount,
// budget, bill and file name here is invented; the repo is public.
//
// Writes in demo change this copy in memory (App state), never a server, so
// Undo, the count-ups and the FLIP list can be seen working.
//
// THE WORST CASE (break-ui, his yes 9 Oct): in a DEV build only, the URL
// parameter ?moneyDemo= picks a fixture: demo (the default), worst, empty,
// one, loading, offline, past, import, xlsx, xlsxbig, numbers. A production build always
// shows the demo.

import { merchantKey } from './moneyModel.js';
import { explodeParts, normalizeSplit } from './moneyParts.js';

const pad = (n) => String(n).padStart(2, '0');
const CATEGORY_NAMES = ['Groceries', 'Eating Out', 'Transport', 'Health & Fitness', 'Subscriptions', 'Utilities & Bills', 'Shopping', 'Entertainment', 'Income', 'Other'];
const TODAY = '2026-10-25';
const MONTH = '2026-10';
const PREV = '2026-09';

// [day, merchant, amount (negative = spend), category, source]
const OCT = [
  [25, 'Corner Grocer', -42.18, 'Groceries', 'import'], [22, 'Harbour Fresh Market', -61.4, 'Groceries', 'import'],
  [19, 'Corner Grocer', -88.25, 'Groceries', 'import'], [16, 'Corner Grocer', -54.7, 'Groceries', 'import'],
  [12, 'Harbour Fresh Market', -72.35, 'Groceries', 'import'], [9, 'Corner Grocer', -47.8, 'Groceries', 'import'],
  [5, 'Corner Grocer', -66.92, 'Groceries', 'import'], [2, 'Harbour Fresh Market', -78.4, 'Groceries', 'import'],
  [25, 'Kettle & Crumb', -14.2, 'Eating Out', 'manual'], [21, 'Paper Lantern Cafe', -38.5, 'Eating Out', 'import'],
  [18, 'Kettle & Crumb', -12.8, 'Eating Out', 'manual'], [17, 'Noodle Yard', -46.3, 'Eating Out', 'import'],
  [14, 'Kettle & Crumb', -13.6, 'Eating Out', 'capture'], [11, 'Paper Lantern Cafe', -52.1, 'Eating Out', 'import'],
  [8, 'Kettle & Crumb', -12.4, 'Eating Out', 'manual'], [6, 'Noodle Yard', -41.9, 'Eating Out', 'import'],
  [3, 'Paper Lantern Cafe', -66.2, 'Eating Out', 'scan'],
  [24, 'Metro card top-up', -30, 'Transport', 'import'], [20, 'Fuel Stop', -64.5, 'Transport', 'scan'],
  [13, 'Metro card top-up', -30, 'Transport', 'import'], [7, 'Fuel Stop', -31.5, 'Transport', 'scan'],
  [1, 'Metro card top-up', -30, 'Transport', 'import'],
  [24, 'Workbench Hardware', -27.4, 'Shopping', 'import'], [15, 'Thread & Co', -89.95, 'Shopping', 'import'],
  [4, 'Workbench Hardware', -24.65, 'Shopping', 'scan'],
  [23, 'Reelhouse', -18.99, 'Subscriptions', 'import'], [14, 'Code Courses', -39.54, 'Subscriptions', 'import'],
  [12, 'Fieldnote Radio', -5.99, 'Subscriptions', 'import'], [9, 'Studio Fonts', -12, 'Subscriptions', 'import'],
  [6, 'Pixel Vault', -4.49, 'Subscriptions', 'import'], [1, 'Cloud Storage Plus', -9.99, 'Subscriptions', 'import'],
  [22, 'Tidewater Gym', -18, 'Health & Fitness', 'import'], [15, 'Tidewater Gym', -18, 'Health & Fitness', 'import'],
  [8, 'Tidewater Gym', -18, 'Health & Fitness', 'import'], [1, 'Tidewater Gym', -18, 'Health & Fitness', 'import'],
  [13, 'Northline Mobile', -45, 'Utilities & Bills', 'import'], [5, 'Council bin levy', -13, 'Utilities & Bills', 'manual'],
  [17, 'Lantern Cinema', -28, 'Entertainment', 'manual'],
  [23, 'Odd Jobs Market', -12, 'Other', 'manual'],
  [23, 'Payroll', 3400, 'Income', 'import'],
];

// September, by category: spend by the 25th, the whole month, visits by the 25th
const SEP = {
  Groceries: [520, 590, 9], 'Eating Out': [210, 251, 7], Transport: [190, 220, 6], Shopping: [205, 240, 4],
  Subscriptions: [89, 89, 6], 'Health & Fitness': [72, 90, 4], 'Utilities & Bills': [110, 150, 2],
  Entertainment: [40, 60, 2], Other: [30, 52, 3],
};
const AUG = { Groceries: 610, 'Eating Out': 240, Transport: 205, Shopping: 180, Subscriptions: 87, 'Health & Fitness': 90, 'Utilities & Bills': 262, Entertainment: 35, Other: 20 };
const BUDGETS = { Groceries: 650, 'Eating Out': 260, Transport: 300, Shopping: 300, Subscriptions: 90, 'Health & Fitness': 120, 'Utilities & Bills': 150 };
// September's daily spend: 1,466 by the 25th, 1,742 by the 30th
const SEP_DAILY = [48, 70, 22, 90, 31, 55, 18, 66, 40, 25, 80, 34, 47, 60, 21, 72, 38, 29, 63, 44, 51, 27, 69, 35, 58];

const SUBS = [
  { key: 'cloud notes pro', merchant: 'Cloud Notes Pro', category: 'Subscriptions', amount: 8, cadence: 'monthly', perMonth: 8, lastDate: '2026-09-27', nextExpected: '2026-10-27', occurrences: 6,
    confidence: { kind: 'sure', word: 'Sure', charges: 6, offsets: [0, 0, 0, 0, 0, 0], window: 0, said: '6 charges, every one on the 27th.' }, history: [], priceRise: null },
  { key: 'tidewater gym', merchant: 'Tidewater Gym', category: 'Health & Fitness', amount: 18, cadence: 'weekly', perMonth: 78, lastDate: '2026-10-22', nextExpected: '2026-10-29', occurrences: 9,
    confidence: { kind: 'sure', word: 'Sure', charges: 9, offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0], window: 0, said: '9 charges, every one on a Thursday.' }, history: [], priceRise: null },
  { key: 'gridline energy', merchant: 'Gridline Energy', category: 'Utilities & Bills', amount: 212, cadence: 'quarterly', perMonth: 70.67, lastDate: '2026-08-04', nextExpected: '2026-11-04', occurrences: 3,
    confidence: { kind: 'likely', word: 'Likely', charges: 3, offsets: [-2, 1, 2], window: 2, said: '3 charges, each within 2 days of the quarter. The window on the calendar is those days.' }, history: [], priceRise: null },
  { key: 'northline mobile', merchant: 'Northline Mobile', category: 'Utilities & Bills', amount: 45, cadence: 'monthly', perMonth: 45, lastDate: '2026-10-13', nextExpected: '2026-11-13', occurrences: 2,
    confidence: { kind: 'guess', word: 'A guess', charges: 2, offsets: [0, 0.01], window: 0, said: 'Seen twice, 31 days apart. Two is the least Nova counts as recurring, so it stays a guess until a third.' }, history: [], priceRise: null },
  { key: 'fieldnote radio', merchant: 'Fieldnote Radio', category: 'Subscriptions', amount: 5.99, cadence: 'monthly', perMonth: 5.99, lastDate: '2026-10-12', nextExpected: '2026-11-12', occurrences: 5,
    confidence: { kind: 'sure', word: 'Sure', charges: 5, offsets: [0, 0, 0, 0, 0], window: 0, said: '5 charges, every one on the 12th.' }, history: [], priceRise: null },
  { key: 'reelhouse', merchant: 'Reelhouse', category: 'Subscriptions', amount: 18.99, cadence: 'monthly', perMonth: 18.99, lastDate: '2026-10-23', nextExpected: '2026-11-23', occurrences: 6,
    confidence: { kind: 'sure', word: 'Sure', charges: 6, offsets: [0, 0, 0, 0, 0, 0], window: 0, said: '6 charges, every one on the 23rd.' },
    history: ['05', '06', '07', '08', '09'].map((m) => ({ date: `2026-${m}-23`, amount: 16.99 })).concat([{ date: '2026-10-23', amount: 18.99 }]),
    priceRise: { from: 16.99, to: 18.99, on: '2026-10-23' } },
];

const ev = (id, event) => ({ id, kind: 'money', status: 'pending', text: event.title, event, createdAt: `${TODAY}T08:00:00Z`, decision: { route: 'money-event', title: event.title, payload: { event } } });
const EVENTS = [
  ev('demo-over', { type: 'over-budget', key: 'over|Eating Out|2026-10', category: 'Eating Out', title: 'Eating out is $38 over its $260 budget for October.', body: '$298.00 spent against $260.' }),
  ev('demo-rise', { type: 'price-rise', key: 'rise|reelhouse', merchant: 'Reelhouse', category: 'Subscriptions', cadence: 'monthly', from: 16.99, to: 18.99, on: '2026-10-23', nextExpected: '2026-11-23', title: 'Reelhouse went up from $16.99 to $18.99 a month.', body: 'Up $2.00 a month. Its next charge is due Monday 23 November.' }),
  ev('demo-bill', { type: 'bill-due', key: 'bill|cloud notes pro', merchant: 'Cloud Notes Pro', category: 'Subscriptions', amount: 8, cadence: 'monthly', dueDate: '2026-10-27', confidence: 'Sure', title: 'Cloud Notes Pro, $8.00, is due on Tuesday 27 October.', body: 'Nova is sure of the date from its history.' }),
];

let seq = 0;
const line = ([day, merchant, amount, category, source], month = MONTH) => ({
  id: `d${++seq}`, date: `${month}-${pad(day)}`, amount, merchant, category, note: null, source, addedAt: `${month}-${pad(day)}T09:${pad(seq % 60)}:00Z`,
});

const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const cents = (n) => Math.round(n * 100) / 100;

// THE DEMO'S OWN ARITHMETIC: the server's getMonthSummary, for a list in
// memory (demo only; the real page never adds anything up).
export function summarizeDemo(d) {
  const { lines, budgets, month = MONTH, today = TODAY, prev = SEP, prevDaily = null } = d;
  const days = daysIn(month);
  const isCurrent = month === today.slice(0, 7);
  const asOfDay = isCurrent ? Number(today.slice(8)) : days;
  const spendOf = (l) => cents(l.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0));
  const cats = ['Groceries', 'Eating Out', 'Transport', 'Shopping', 'Subscriptions', 'Health & Fitness', 'Utilities & Bills', 'Entertainment', 'Other', 'Income'];
  const byCategory = cats.map((c) => {
    const mine = explodeParts(lines).filter((t) => t.category === c); // a split counts each part
    const p = prev[c] || [0, 0, 0];
    return { category: c, spent: spendOf(mine), prev: p[1], prevToDay: p[0], visits: mine.filter((t) => t.amount < 0).length, prevVisitsToDay: p[2], history: [AUG[c] || 0, p[1], spendOf(mine)], budget: budgets[c] || null };
  }).filter((c) => c.spent > 0 || c.prev > 0 || c.budget);
  const daily = new Array(days).fill(0);
  for (const t of lines) if (t.amount < 0) { const i = Number(t.date.slice(8)) - 1; if (i >= 0 && i < days) daily[i] = cents(daily[i] - t.amount); }
  const pd = prevDaily || (() => { const s = SEP_DAILY.reduce((a, b) => a + b, 0); const k = 1466 / s; const arr = SEP_DAILY.map((v) => cents(v * k)); const tail = [62, 49, 71, 58, 36]; const tk = 276 / tail.reduce((a, b) => a + b, 0); return arr.concat(tail.map((v) => cents(v * tk))); })();
  const sources = { export: 0, typed: 0, scan: 0 };
  for (const t of lines) sources[t.source === 'import' ? 'export' : t.source === 'scan' ? 'scan' : 'typed'] += 1;
  const incomes = lines.filter((t) => t.amount > 0);
  return {
    month, prevMonth: d.prevMonth || PREV, today, isCurrent, asOfDay, daysInMonth: days, daysInPrev: pd.length,
    spent: spendOf(lines), prevSpent: Object.values(prev).reduce((s, p) => s + p[1], 0),
    prevSpentToDay: Object.values(prev).reduce((s, p) => s + p[0], 0),
    income: cents(incomes.reduce((s, t) => s + t.amount, 0)), incomeCount: incomes.length,
    lastIncomeDate: incomes.map((t) => t.date).sort().pop() || null,
    count: lines.length, corrupt: false, budgets: { ...budgets }, byCategory, daily, prevDaily: pd, sources,
    lastImportAt: '2026-10-22T08:10:00Z', transactions: [...lines].sort((a, b) => (a.date < b.date ? 1 : -1)),
    subscriptions: d.subs || SUBS, months: [MONTH, PREV, '2026-08'], categories: cats, importsDir: 'Money/Imports',
  };
}

const LONG = 'Bartholomew’s Artisanal Sourdough & Fermentation Cooperative';
function worstLines() {
  const out = OCT.map((r) => line(r));
  out.push(line([24, LONG, -64.2, 'Groceries', 'import']));
  out.push(line([20, 'Settlement adjustment, property', -1234567.89, 'Other', 'manual']));
  out.push(line([19, 'Thread & Co (refund)', 89.95, 'Shopping', 'import']));
  out.push(line([18, 'Jo', -4, 'Eating Out', 'capture']));
  out.push(line([16, 'Ōtautahi Noodle Bar 🍜', -22.5, 'Eating Out', 'import']));
  // enough lines to pass the 120 cap
  for (let i = 0; i < 90; i++) out.push(line([1 + (i % 25), `Market stall ${i + 1}`, -(3 + (i % 7) * 1.25), i % 3 ? 'Groceries' : 'Entertainment', 'import']));
  return out;
}

const IMPORT_LINES = Array.from({ length: 41 }, (_, i) => {
  const pick = [['Corner Grocer', 'Groceries'], ['Paper Lantern Cafe', 'Eating Out'], ['Metro card top-up', 'Transport'], ['Tidewater Gym', 'Health & Fitness'], ['Workbench Hardware', 'Shopping'], ['Kettle & Crumb', 'Eating Out'], ['Odd Jobs Market', 'Other']][i % 7];
  return { date: `2026-09-${pad(30 - (i % 30))}`, amount: -(8 + (i * 3.7) % 60), merchant: pick[0], category: pick[1], source: 'import' };
});
const IMPORT_REC = { id: 'demo-import', kind: 'money-import', status: 'pending', text: '41 transactions from transactions.csv', createdAt: `${TODAY}T09:45:00Z`,
  decision: { route: 'money-import', title: '41 transactions from transactions.csv', reason: 'Parsed from Money/Imports/transactions.csv: 41 new after dedupe (6 already in the ledger).', payload: { file: 'transactions.csv', transactions: IMPORT_LINES } } };
// a budget app's .xlsx, read directly (10 Oct 2026): its own category on each
// line, mapped where the name clearly matches Nova's, else Nova's guess
const THEIRS = { Groceries: 'Groceries', 'Eating Out': 'Dining out', Transport: 'Travel', 'Health & Fitness': 'Fitness', Shopping: 'Home', Other: 'Uncategorised' };
const MAPS = new Set(['Groceries', 'Eating Out', 'Health & Fitness']); // what mapTheirCategory maps (Travel, Home, Uncategorised do not)
const xlsxRec = (n, file = 'billroo-export.xlsx') => {
  const lines = Array.from({ length: n }, (_, i) => {
    const l = IMPORT_LINES[i % IMPORT_LINES.length];
    return { ...l, date: n > 41 ? `2026-${pad(1 + (i % 9))}-${pad(1 + (i % 28))}` : l.date, amount: n > 41 ? -(1 + (i % 400) / 7) : l.amount, merchant: n > 41 ? `${l.merchant} ${i + 1}` : l.merchant, theirs: THEIRS[l.category], categoryFrom: MAPS.has(l.category) ? 'theirs' : 'guess' };
  });
  return { id: `demo-${file}`, kind: 'money-import', status: 'pending', text: `${n} transactions from ${file}`, createdAt: `${TODAY}T09:45:00Z`,
    decision: { route: 'money-import', title: `${n} transactions from ${file}`, reason: `Parsed from Money/Imports/${file}: ${n} new after dedupe (6 already in the ledger).`, payload: { file, transactions: lines } } };
};
const NUMBERS_REC = ev('demo-numbers', { type: 'unreadable-file', key: 'file|transactions.numbers', file: 'transactions.numbers', dir: 'Money/Imports', title: 'transactions.numbers is a Numbers file. Nova reads CSV and .xlsx files.', body: '' });

// The fixture for a variant: { lines, budgets, records, offline, loading, month, subs }
export function demoMoneyState(variant = 'demo') {
  seq = 0;
  const base = { lines: OCT.map((r) => line(r)), budgets: { ...BUDGETS }, records: [...EVENTS], offline: false, loading: false, variant };
  switch (variant) {
    case 'worst': return { ...base, lines: worstLines(), budgets: { ...BUDGETS, Shopping: 1 } };
    case 'empty': return { ...base, lines: [], records: [], subs: [] };
    case 'one': return { ...base, lines: [line([25, 'Kettle & Crumb', -6.5, 'Eating Out', 'manual'])], budgets: {}, records: [], subs: SUBS.slice(0, 1) };
    case 'loading': return { ...base, loading: true };
    case 'offline': return { ...base, offline: true };
    case 'past': return { ...base, month: PREV, lines: OCT.map(([d, ...rest]) => line([d, ...rest], PREV)), records: [] };
    case 'import': return { ...base, records: [...EVENTS, IMPORT_REC] };
    case 'xlsx': return { ...base, records: [...EVENTS, xlsxRec(41)] };
    case 'xlsxbig': return { ...base, records: [...EVENTS, xlsxRec(5000)] };
    case 'numbers': return { ...base, records: [...EVENTS, NUMBERS_REC] };
    default: return base;
  }
}

// which fixture this build shows (DEV may pick one with ?moneyDemo=)
export function demoVariant() {
  try {
    if (!import.meta.env?.DEV || typeof location === 'undefined') return 'demo';
    return new URLSearchParams(location.search).get('moneyDemo') || 'demo';
  } catch { return 'demo'; }
}

// The summary the page reads, from the state in memory.
export function demoSummary(state) {
  if (!state || state.loading) return null;
  const past = state.month && state.month !== MONTH;
  const s = summarizeDemo({ lines: state.lines, budgets: state.budgets, subs: state.subs, month: state.month || MONTH, ...(past ? { prevMonth: '2026-08' } : {}) });
  if (state.month && state.month !== MONTH) {
    // a past month: the whole month, nothing "left"
    return { ...s, isCurrent: false, asOfDay: s.daysInMonth };
  }
  return s;
}

/* ------------------------------- demo writes ------------------------------ */
// Each returns the next state; the caller keeps the previous one for Undo.
let demoId = 0;
export const demoWrites = {
  add: (st, { merchant, amount, category }) => ({ ...st, lines: [{ id: `dn${++demoId}`, date: TODAY, amount, merchant, category: category || 'Other', note: null, source: 'manual', addedAt: new Date().toISOString() }, ...st.lines] }),
  remove: (st, id) => ({ ...st, lines: st.lines.filter((t) => t.id !== id) }),
  // with `rule`, every other line from the merchant moves too (the server's
  // moveMerchantLines: same direction, not split). `parts` splits the line
  // (or null joins it), as the server's editTransaction does.
  edit: (st, id, { category, note, rule, parts }) => {
    const line = st.lines.find((t) => t.id === id);
    const key = rule && category !== undefined && !Array.isArray(parts) && line ? merchantKey(line.merchant) : null;
    const reshape = (t) => {
      if (Array.isArray(parts)) {
        const sound = normalizeSplit(t.amount, parts, CATEGORY_NAMES);
        return { ...t, parts: sound, category: sound[0].category };
      }
      if (parts === null || category !== undefined) {
        const { parts: _drop, ...rest } = t; // eslint-disable-line no-unused-vars
        return { ...rest, ...(category !== undefined ? { category } : {}) };
      }
      return t;
    };
    return {
      ...st,
      lines: st.lines.map((t) => {
        if (t.id === id) return { ...reshape(t), ...(note !== undefined ? { note: note || null } : {}) };
        if (key && merchantKey(t.merchant) === key && (t.amount > 0) === (line.amount > 0) && !(t.parts?.length > 1)) return { ...t, category };
        return t;
      }),
    };
  },
  // the merchant's other lines by category (GET .../merchant, in memory)
  merchant: (st, id) => {
    const line = st.lines.find((t) => t.id === id);
    if (!line) return null;
    const key = merchantKey(line.merchant);
    const byCategory = {};
    let split = 0;
    for (const t of st.lines) {
      if (t.id === id || merchantKey(t.merchant) !== key || (t.amount > 0) !== (line.amount > 0)) continue;
      if (t.parts?.length > 1) { split++; continue; }
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    return { id, byCategory, split };
  },
  budget: (st, category, value) => { const b = { ...st.budgets }; if (value) b[category] = value; else delete b[category]; return { ...st, budgets: b }; },
  resolve: (st, id) => ({ ...st, records: st.records.filter((r) => r.id !== id) }),
};
