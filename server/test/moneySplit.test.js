// SPLIT ACROSS CATEGORIES (his call 10 Oct 2026, "Yes, split across
// categories"). A line holds two parts; totals, budgets, the donut's
// categories, the FY export and the over-budget signal count each part in
// its own category; the split is one record with Undo; and a ledger written
// before parts existed reads exactly as it did. Every merchant and amount
// here is invented.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-moneysplit-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-moneysplit-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const money = await import('../lib/money.js');
const { editLine } = await import('../lib/moneyRails.js');
const { undoFiling } = await import('../lib/inbox.js');
const sig = await import('../lib/moneySignals.js');
const { partsOf, explodeParts, normalizeSplit } = await import('../../src/moneyParts.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(vault, { recursive: true, force: true });
});

const NOW = new Date(2026, 9, 25, 12, 0, 0); // 25 Oct 2026, local
const cat = (s, c) => s.byCategory.find((x) => x.category === c) || { spent: 0, visits: 0 };

test('an old ledger month, written before parts existed, loads exactly as it did', async () => {
  await mkdir(path.join(dataDir, 'money'), { recursive: true });
  const old = { month: '2026-08', transactions: [
    { id: 'old1', date: '2026-08-20', amount: -42.18, merchant: 'Demo Old Grocer', category: 'Groceries', note: null, source: 'import', addedAt: '2026-08-21T01:00:00.000Z' },
    { id: 'old2', date: '2026-08-12', amount: -9.5, merchant: 'Demo Old Cafe', category: 'Eating Out', note: 'with Jo', source: 'manual', addedAt: '2026-08-12T01:00:00.000Z' },
    { id: 'old3', date: '2026-08-02', amount: 1800, merchant: 'Demo Payroll', category: 'Income', note: null, source: 'import', addedAt: '2026-08-02T01:00:00.000Z' },
  ] };
  await writeFile(path.join(dataDir, 'money', '2026-08.json'), JSON.stringify(old, null, 2));
  const s = await money.getMonthSummary('2026-08', { now: NOW });
  assert.equal(s.corrupt, false);
  assert.equal(s.count, 3);
  assert.equal(s.spent, 51.68);
  assert.equal(s.income, 1800);
  assert.equal(cat(s, 'Groceries').spent, 42.18);
  assert.equal(cat(s, 'Eating Out').spent, 9.5);
  assert.deepEqual(s.transactions.map((t) => t.id).sort(), ['old1', 'old2', 'old3']);
  for (const t of s.transactions) assert.equal('parts' in t, false, 'reading an old line gave it parts');
  assert.deepEqual(partsOf(old.transactions[0]), [{ category: 'Groceries', amount: -42.18 }]);
  const { csv } = await money.exportFinancialYear(2027);
  assert.match(csv, /^2026-08-20,-42\.18,"Demo Old Grocer",Groceries,"",import$/m);
  assert.match(csv, /^2026-08-12,-9\.50,"Demo Old Cafe",Eating Out,"with Jo",manual$/m);
});

test('a split is checked: two categories, at least a cent each, adding up to the line', () => {
  const C = money.CATEGORIES;
  assert.deepEqual(normalizeSplit(-42.18, [{ category: 'Groceries', amount: 34.18 }, { category: 'Health & Fitness', amount: 8 }], C),
    [{ category: 'Groceries', amount: -34.18 }, { category: 'Health & Fitness', amount: -8 }]);
  assert.deepEqual(normalizeSplit(-100, [{ category: 'Groceries', amount: 0.01 }, { category: 'Other', amount: 99.99 }], C),
    [{ category: 'Groceries', amount: -0.01 }, { category: 'Other', amount: -99.99 }]);
  assert.throws(() => normalizeSplit(-10, [{ category: 'Groceries', amount: 10 }, { category: 'Other', amount: 0 }], C), /at least a cent/);
  assert.throws(() => normalizeSplit(-10, [{ category: 'Groceries', amount: 6 }, { category: 'Other', amount: 3.99 }], C), /add up to \$9\.99, not the line's \$10\.00/);
  assert.throws(() => normalizeSplit(-10, [{ category: 'Groceries', amount: 5 }, { category: 'Groceries', amount: 5 }], C), /two different/);
  assert.throws(() => normalizeSplit(-10, [{ category: 'Groceries', amount: 5 }, { category: 'Income', amount: 5 }], C), /cannot be split into Income/);
  // a hand-broken split reads as one line, never as money appearing
  assert.deepEqual(partsOf({ category: 'Groceries', amount: -10, parts: [{ category: 'Groceries', amount: -6 }, { category: 'Other', amount: -6 }] }), [{ category: 'Groceries', amount: -10 }]);
  assert.equal(explodeParts([{ id: 'x', category: 'Groceries', amount: -10 }]).length, 1);
});

test('a split counts each part in its category everywhere, is one record, and Undo puts it back', async () => {
  await money.setBudget('Groceries', 40);
  await money.setBudget('Health & Fitness', 5);
  const [line, other] = await money.addTransactions([
    { date: '2026-10-20', amount: -42.18, merchant: 'Demo Corner Grocer', category: 'Groceries', note: 'sunscreen in it' },
    { date: '2026-10-21', amount: -10, merchant: 'Demo Gym', category: 'Health & Fitness' },
  ], 'import');

  let s = await money.getMonthSummary('2026-10', { now: NOW });
  assert.equal(cat(s, 'Groceries').spent, 42.18);
  assert.equal(cat(s, 'Health & Fitness').spent, 10);
  const spentBefore = s.spent;

  const { record } = await editLine(line.id, { parts: [{ category: 'Groceries', amount: 34.18 }, { category: 'Health & Fitness', amount: 8 }] });
  assert.equal(record.text, 'Split Demo Corner Grocer · $34.18 Groceries · $8.00 Health & fitness');
  assert.equal(record.status, 'filed');
  assert.equal(record.undoData.route, 'money-edit');

  s = await money.getMonthSummary('2026-10', { now: NOW });
  assert.equal(s.spent, spentBefore, 'the month total changed: a split moves money between categories, it adds none');
  assert.equal(cat(s, 'Groceries').spent, 34.18);
  assert.equal(cat(s, 'Health & Fitness').spent, 18);
  assert.equal(cat(s, 'Health & Fitness').visits, 2, 'the split part is not a visit in its category');
  const stored = s.transactions.find((t) => t.id === line.id);
  assert.equal(stored.category, 'Groceries', 'the line\'s category is not its first part\'s');
  assert.equal(stored.note, 'sunscreen in it');
  assert.deepEqual(stored.parts, [{ category: 'Groceries', amount: -34.18 }, { category: 'Health & Fitness', amount: -8 }]);

  // budgets: Groceries is now under its $40, Health & fitness over its $5
  const run = await sig.runMoneySignals({ types: sig.ON_CHANGE_TYPES, now: NOW.getTime(), deps: { sendPush: async () => {} } });
  const overs = run.created.map((r) => (r.event || r.decision?.payload?.event)).filter((e) => e?.type === 'over-budget').map((e) => `${e.category} ${e.spent}`);
  assert.ok(overs.includes('Health & Fitness 18'), `the over-budget signal did not count the split part: ${overs}`);
  assert.ok(!overs.some((o) => o.startsWith('Groceries')), 'Groceries still read the whole line');

  const { csv } = await money.exportFinancialYear(2027);
  assert.match(csv, /^2026-10-20,-34\.18,"Demo Corner Grocer",Groceries,"split 1 of 2; sunscreen in it",import$/m);
  assert.match(csv, /^2026-10-20,-8\.00,"Demo Corner Grocer",Health & Fitness,"split 2 of 2; sunscreen in it",import$/m);
  const exported = csv.trim().split('\n').slice(1).filter((l) => l.startsWith('2026-10')).reduce((n, l) => n + Number(l.split(',')[1]), 0);
  assert.equal(Math.round(exported * 100), Math.round((-42.18 - 10) * 100), 'the export no longer adds up to the ledger');

  // a merchant move leaves a split line's parts alone
  const moved = await editLine(other.id, { category: 'Other', rule: true });
  assert.equal(moved.record.undoData.moved.length, 0);
  await undoFiling(vault, moved.record.undoData);

  // Undo: the line whole again, in its old category
  await undoFiling(vault, record.undoData);
  s = await money.getMonthSummary('2026-10', { now: NOW });
  const back = s.transactions.find((t) => t.id === line.id);
  assert.equal('parts' in back, false);
  assert.equal(back.category, 'Groceries');
  assert.equal(cat(s, 'Groceries').spent, 42.18);
  assert.equal(cat(s, 'Health & Fitness').spent, 10);
});

test('joining a split back into one category is one record, and its Undo brings the split back', async () => {
  const [line] = await money.addTransactions([{ date: '2026-10-22', amount: -100, merchant: 'Demo Market', category: 'Groceries' }], 'import');
  await editLine(line.id, { parts: [{ category: 'Groceries', amount: 0.01 }, { category: 'Other', amount: 99.99 }] });
  const join = await editLine(line.id, { category: 'Shopping', parts: null });
  assert.equal(join.record.text, 'Joined Demo Market into Shopping');
  let t = (await money.findTransactions([line.id]))[0];
  assert.equal('parts' in t, false);
  assert.equal(t.category, 'Shopping');
  await undoFiling(vault, join.record.undoData);
  t = (await money.findTransactions([line.id]))[0];
  assert.deepEqual(t.parts, [{ category: 'Groceries', amount: -0.01 }, { category: 'Other', amount: -99.99 }]);
});

test('a bad split writes nothing', async () => {
  const [line] = await money.addTransactions([{ date: '2026-10-23', amount: -20, merchant: 'Demo Florist', category: 'Shopping' }], 'import');
  await assert.rejects(editLine(line.id, { parts: [{ category: 'Shopping', amount: 15 }, { category: 'Other', amount: 6 }] }), /add up to/);
  const t = (await money.findTransactions([line.id]))[0];
  assert.equal('parts' in t, false);
  assert.equal(t.category, 'Shopping');
});

test('the demo summary counts parts the same way the server does', async () => {
  const { summarizeDemo } = await import('../../src/moneyDemo.js');
  const lines = [{ id: 'a', date: '2026-10-20', amount: -42.18, merchant: 'X', category: 'Groceries', source: 'manual', parts: [{ category: 'Groceries', amount: -34.18 }, { category: 'Health & Fitness', amount: -8 }] }];
  const s = summarizeDemo({ lines, budgets: {} });
  assert.equal(s.byCategory.find((c) => c.category === 'Groceries').spent, 34.18);
  assert.equal(s.byCategory.find((c) => c.category === 'Health & Fitness').spent, 8);
  assert.equal(s.spent, 42.18);
});
