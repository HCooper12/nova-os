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

// A second date GUARANTEED to sit in the same calendar month as today —
// getMonthSummary only counts this month, so a hardcoded "yesterday" made this
// test fail on the 1st of every month (it did, on 1 August).
const otherDayThisMonth = () => (new Date().getDate() === 1 ? iso(1) : iso(-1));

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
    { date: otherDayThisMonth(), amount: -120.4, merchant: 'Woolworths', category: 'Groceries' },
    { date: otherDayThisMonth(), amount: 2500, merchant: 'Salary — Acme', category: 'Income' },
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
  // one line already in the ledger (the Woolworths row seeded above) + two new
  await writeFile(path.join(dir, 'statement.csv'),
    `Date,Description,Amount\n${otherDayThisMonth()},Woolworths,-120.40\n${iso(-2)},OPAL TRANSPORT,-16.40\n${iso(-3)},NETFLIX.COM,-24.99\n`, 'utf8');

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

// ---- [19] plan 1: a category fix teaches the merchant ----
test('merchant override: fixing one transaction files that merchant his way from then on; setBudget keeps the overrides', async () => {
  const { setTransactionCategory, loadOverrides, getBudgets } = await import('../lib/money.js');
  const [t] = await addTransactions([{ date: otherDayThisMonth(), amount: -18.5, merchant: 'SQ *ZEPHYR HOLDINGS 88', category: 'Other' }], 'import');
  assert.equal(categorize('SQ *ZEPHYR HOLDINGS 88'), 'Other', 'no keyword knows this cafe');
  await setTransactionCategory(t.id, 'Eating Out');
  await loadOverrides();
  assert.equal(categorize('SQ *ZEPHYR HOLDINGS 88'), 'Eating Out', 'the fix holds for the merchant');
  assert.equal(categorize('sq-zephyr HOLDINGS  88'), 'Eating Out', 'case and punctuation do not defeat the key (merchantKey is exact on words)');
  await setBudget('Eating Out', 250);
  await loadOverrides();
  assert.equal(categorize('SQ *ZEPHYR HOLDINGS 88'), 'Eating Out', 'setting a budget did not wipe the override');
  assert.equal((await getBudgets())['Eating Out'], 250);
});

// ---- [19] plan 3: a corrupt month is quarantined and said, never read as empty ----
test('a month file that will not parse is quarantined with its evidence kept, and named', async () => {
  const { listCorruptMonths } = await import('../lib/money.js');
  const moneyDir = path.join(dataDir, 'money');
  await mkdir(moneyDir, { recursive: true });
  await writeFile(path.join(moneyDir, '2025-02.json'), '{ this is not json', 'utf8');
  await listTransactions({ sinceMonths: 30 }); // the read that trips over it
  assert.ok(!existsSync(path.join(moneyDir, '2025-02.json')), 'the broken file is moved aside');
  const { readdir } = await import('node:fs/promises');
  assert.ok((await readdir(moneyDir)).some((f) => /^2025-02\.json\.corrupt-/.test(f)), 'the evidence is kept');
  assert.deepEqual(listCorruptMonths(), ['2025-02']);
});

// ---- [20] plans 1 + 2: skipped lines are shown; a replaced file supersedes its old record ----
test('parseBankCsv names the first skipped lines; scanImports re-scans replaced content and supersedes the old record', async () => {
  const csv = 'Date,Description,Amount\n01/08/2026,WOOLWORTHS 1234,-84.20\nPENDING AUTH — NOT SETTLED\n02/08/2026,,-5.00\n03/08/2026,COLES EXPRESS,-40.00\n';
  const parsed = parseBankCsv(csv);
  assert.equal(parsed.skipped, 2);
  assert.deepEqual(parsed.skippedLines, ['PENDING AUTH — NOT SETTLED', '02/08/2026,,-5.00']);
  const { listRecords, getRecord } = await import('../lib/inboxStore.js');
  const dir = path.join(vault, 'Money', 'Imports');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'replace-me.csv'), 'Date,Description,Amount\n05/01/2024,FIRST EXPORT SHOP,-10.00\nBROKEN LINE HERE\n', 'utf8');
  const first = await scanImports(vault);
  const rec1 = first.records.find((r) => r.decision.payload.file === 'replace-me.csv');
  assert.ok(rec1, 'a pending record for the file');
  assert.match(rec1.decision.reason, /1 unparseable line skipped: 'BROKEN LINE HERE'/);
  assert.ok(rec1.decision.payload.contentHash, 'the content is fingerprinted');
  const again = await scanImports(vault);
  assert.ok(!again.records.some((r) => r.decision.payload.file === 'replace-me.csv'), 'the same content is not re-scanned');
  await writeFile(path.join(dir, 'replace-me.csv'), 'Date,Description,Amount\n05/01/2024,FIRST EXPORT SHOP,-10.00\n06/01/2024,SECOND EXPORT SHOP,-20.00\n', 'utf8');
  const third = await scanImports(vault);
  const rec2 = third.records.find((r) => r.decision.payload.file === 'replace-me.csv');
  assert.ok(rec2 && rec2.id !== rec1.id, 'the corrected export gets a new record');
  assert.equal((await getRecord(rec1.id)).status, 'discarded', 'the old one is superseded');
  assert.match((await getRecord(rec1.id)).declineReason, /superseded — replace-me.csv was replaced/);
  assert.equal((await listRecords()).filter((r) => r.kind === 'money-import' && r.decision?.payload?.file === 'replace-me.csv' && r.status === 'pending').length, 1);
});

// ---- [21] plan 3: the off ramp — three empty closed months pause the report ----
test('cfoPaused: the closing month and the two before it empty → pause; any transaction in the three → report', async () => {
  const { cfoPaused } = await import('../lib/cfoReport.js');
  assert.equal(cfoPaused(0, [0, 0]), true);
  assert.equal(cfoPaused(0, [0, 3]), false, 'a ledger that was alive two months ago is not abandoned');
  assert.equal(cfoPaused(4, [0, 0]), false, 'the closing month has entries — report it');
  assert.equal(cfoPaused(0, [0]), false, 'not enough history to call it abandoned');
  assert.equal(cfoPaused(0, []), false);
});
