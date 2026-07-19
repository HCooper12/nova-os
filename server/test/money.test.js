// CFO — ledger, categorisation, subscriptions, CSV import, expense filing.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-money-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-money-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const { addTransactions, removeTransactions, listTransactions, categorize, detectSubscriptions, getMonthSummary, setBudget, exportFinancialYear } = await import('../lib/money.js');
const { parseBankCsv, scanImports } = await import('../lib/moneyImport.js');
const { fileDecision, undoFiling, normalizeDecision } = await import('../lib/inbox.js');
const { runCfoReport } = await import('../lib/cfoReport.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('ledger: add/dedupe/remove, keyword categorisation, month summary with budgets', async () => {
  const [coffee] = await addTransactions([{ date: iso(0), amount: -6.5, merchant: 'Industry Beans Cafe' }], 'capture');
  assert.equal(coffee.category, 'Eating Out'); // keyword map, no category given
  assert.equal(categorize('WOOLWORTHS 1234 SYDNEY'), 'Groceries');
  assert.equal(categorize('Mystery Vendor 99'), 'Other');

  // idempotent: same day+amount+desc does not duplicate — and the return
  // value reports what was ACTUALLY inserted (receipts must never lie)
  const dupResult = await addTransactions([{ date: iso(0), amount: -6.5, merchant: 'Industry Beans Cafe' }], 'capture');
  assert.equal(dupResult.length, 0);
  assert.equal((await listTransactions({})).length, 1);

  await addTransactions([
    { date: iso(-1), amount: -120.4, merchant: 'Woolworths', category: 'Groceries' },
    { date: iso(-1), amount: 2500, merchant: 'Salary — Acme', category: 'Income' },
  ], 'import');

  await setBudget('Groceries', 600);
  const summary = await getMonthSummary();
  assert.equal(summary.spent, 126.9);
  assert.equal(summary.income, 2500);
  const groceries = summary.byCategory.find((c) => c.category === 'Groceries');
  assert.equal(groceries.budget, 600);

  const removed = await removeTransactions([coffee.id]);
  assert.equal(removed, 1);
  assert.equal((await listTransactions({})).length, 2);
});

test('subscriptions: cadence + next-expected + price rise; one-offs are not subscriptions', () => {
  const subs = detectSubscriptions([
    { date: '2026-05-14', amount: -12.99, merchant: 'Spotify AU' },
    { date: '2026-06-14', amount: -12.99, merchant: 'Spotify AU' },
    { date: '2026-06-13', amount: -22.99, merchant: 'Netflix.com' },
    { date: '2026-07-13', amount: -24.99, merchant: 'Netflix.com' }, // price rise
    { date: '2026-07-02', amount: -89.5, merchant: 'One Off Store' },
    { date: '2026-06-01', amount: -50, merchant: 'Variable Vendor' },
    { date: '2026-07-01', amount: -95, merchant: 'Variable Vendor' }, // amount not similar → not a sub
  ]);
  const names = subs.map((s) => s.merchant).sort();
  assert.deepEqual(names, ['Netflix.com', 'Spotify AU']);
  const netflix = subs.find((s) => s.merchant === 'Netflix.com');
  assert.equal(netflix.cadence, 'monthly');
  assert.equal(netflix.nextExpected, '2026-08-12');
  assert.deepEqual(netflix.priceRise, { from: 22.99, to: 24.99 });
  assert.equal(subs.find((s) => s.merchant === 'Spotify AU').priceRise, null);
});

test('bank CSV parsing: headered, debit/credit, and headerless AU-date shapes', () => {
  const headered = parseBankCsv('Date,Description,Amount,Balance\n19/07/2026,"UBER *EATS, SYDNEY",-34.20,1200.00\n18/07/2026,SALARY ACME PTY LTD,2500.00,1234.20\nbad line,,\n');
  assert.equal(headered.transactions.length, 2);
  assert.deepEqual(headered.transactions[0], { date: '2026-07-19', amount: -34.2, merchant: 'UBER *EATS, SYDNEY', category: 'Eating Out', source: 'import' });
  assert.equal(headered.skipped, 1);

  const debitCredit = parseBankCsv('Date,Details,Debit,Credit\n2026-07-15,GYM MEMBERSHIP,89.00,\n2026-07-14,REFUND KMART,,25.00\n');
  assert.equal(debitCredit.transactions[0].amount, -89);
  assert.equal(debitCredit.transactions[1].amount, 25);

  const headerless = parseBankCsv('19/07/2026,-15.80,"COLES 0412 NSW",984.20\n');
  assert.equal(headerless.transactions[0].category, 'Groceries');
  assert.equal(headerless.transactions[0].date, '2026-07-19');

  assert.throws(() => parseBankCsv('foo,bar\n1,2\n'), /unrecognised CSV columns/);
});

test('drop-folder import: pending record with only-new transactions; approve files + archives; undo removes', async () => {
  const dir = path.join(vault, 'Money/Imports');
  await mkdir(dir, { recursive: true });
  // one line already in the ledger (Woolworths iso(-1) -120.40) + two new
  await writeFile(path.join(dir, 'statement.csv'),
    `Date,Description,Amount\n${iso(-1)},Woolworths,-120.40\n${iso(-2)},OPAL TRANSPORT,-16.40\n${iso(-3)},NETFLIX.COM,-24.99\n`, 'utf8');

  const { records } = await scanImports(vault);
  assert.equal(records.length, 1);
  const rec = records[0];
  assert.equal(rec.status, 'pending');
  assert.equal(rec.decision.payload.transactions.length, 2, 'deduped against the ledger');
  assert.match(rec.decision.reason, /1 already in the ledger/);

  // re-scan while pending → no duplicate record
  const again = await scanImports(vault);
  assert.equal(again.records.length, 0);

  // approve = fileDecision money-import → ledger + CSV archived
  const { destination, undo } = await fileDecision(vault, rec.decision);
  assert.match(destination, /2 transactions imported/);
  assert.ok(existsSync(path.join(vault, 'Money/Imports/Processed/statement.csv')));
  assert.ok(!existsSync(path.join(dir, 'statement.csv')));
  assert.equal((await listTransactions({})).filter((t) => t.source === 'import').length, 4);

  const undoSummary = await undoFiling(vault, undo);
  assert.match(undoSummary, /removed 2 ledger entries/);
});

test('expense capture route: normalize, file, undo', async () => {
  const decision = normalizeDecision({
    route: 'expense', confidence: 'high', title: 'Coffee', reason: 'clear spend',
    payload: { amount: '-6.50', merchant: 'Cafe on Crown', category: 'Eating Out' },
  });
  assert.equal(decision.payload.amount, -6.5);

  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /Cafe on Crown -\$6\.50 \(Eating Out\)/);
  const undoSummary = await undoFiling(vault, undo);
  assert.match(undoSummary, /removed 1 ledger entry/);

  assert.throws(() => normalizeDecision({ route: 'expense', payload: { amount: 0, merchant: 'X' } }), /no usable amount/);
});

test('CFO monthly report drafts once per month; FY export covers the AU financial year', async () => {
  // put one transaction in LAST month so the report has something to say
  const prev = new Date();
  prev.setDate(0);
  const prevIso = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-15`;
  await addTransactions([{ date: prevIso, amount: -49.99, merchant: 'Gym Membership Pty' }], 'import');

  const first = await runCfoReport();
  assert.equal(first.record.kind, 'cfo');
  assert.match(first.record.decision.payload.text, /CFO Report — /);
  assert.match(first.record.decision.payload.text, /\*\*Spend\.\*\*/);
  assert.equal((await runCfoReport()).skipped, true);

  const fyNow = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const fyExport = await exportFinancialYear(fyNow);
  assert.match(fyExport.csv, /Date,Amount,Merchant,Category,Note,Source/);
  assert.ok(fyExport.count >= 1);
  assert.match(fyExport.filename, /nova-money-FY\d{2}-\d{2}\.csv/);
});
