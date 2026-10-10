// A BUDGET APP'S .xlsx, READ DIRECTLY (his call 10 Oct 2026, "Read it
// directly"). Billroo exports "Excel format" with Date, Description,
// Category, Tags, Amount. The workbook is generated here (test/xlsxFixture.js)
// from invented rows, then goes through the CSV path end to end: dedupe, one
// pending record, his yes, Undo. Its Category column maps onto Nova's where
// the names clearly match; otherwise Nova's guess stands.
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-moneyxlsx-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-moneyxlsx-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeXlsx, excelSerial } from './xlsxFixture.js';

const money = await import('../lib/money.js');
const { scanImports, parseBankXlsx, mapTheirCategory } = await import('../lib/moneyImport.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { updateRecord } = await import('../lib/inboxStore.js');

const DIR = path.join(vault, 'Money/Imports');
await mkdir(DIR, { recursive: true });
test.after(async () => {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(vault, { recursive: true, force: true });
});

const HEAD = ['Date', 'Description', 'Category', 'Tags', 'Amount'];
const rows = [
  HEAD,
  [excelSerial('2026-09-02'), 'Demo Harbour Grocer', 'Groceries', '', -42.18],
  [excelSerial('2026-09-03'), 'Demo Lantern Kitchen', 'Dining out', 'with Jo', -31.5],
  [excelSerial('2026-09-04'), 'Demo Mystery Vendor', 'Home & Garden', '', -19.95], // no clear match: Nova's guess
  [excelSerial('2026-09-05'), 'Woolworths Demo 1234', 'Uncategorised', '', -12.4], // Nova's keyword guess
  ['06/09/2026', 'Demo Payroll', 'Income', '', 2100], // a date typed as text, DD/MM/YYYY
  [excelSerial('2026-09-07'), 'Demo Returns Desk', 'Income', '', -5], // a spend never files as Income
];

test('the budget app\'s category names map onto Nova\'s only where they clearly match', () => {
  assert.equal(mapTheirCategory('Dining out', -10), 'Eating Out');
  assert.equal(mapTheirCategory('Bills & Utilities', -10), 'Utilities & Bills');
  assert.equal(mapTheirCategory('Health and Fitness', -10), 'Health & Fitness');
  assert.equal(mapTheirCategory('Home & Garden', -10), null);
  assert.equal(mapTheirCategory('Travel', -10), null, 'travel is not clearly transport');
  assert.equal(mapTheirCategory('Income', -10), null);
  assert.equal(mapTheirCategory('Income', 10), 'Income');
});

test('an .xlsx export is read directly: its cells, its categories, its tags', async () => {
  const parsed = await parseBankXlsx(makeXlsx(rows, { dateCols: [0] }));
  assert.equal(parsed.skipped, 0);
  const t = parsed.transactions;
  assert.deepEqual(t.map((x) => x.date), ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07']);
  assert.deepEqual(t.map((x) => x.amount), [-42.18, -31.5, -19.95, -12.4, 2100, -5]);
  assert.deepEqual(t.map((x) => x.category), ['Groceries', 'Eating Out', 'Other', 'Groceries', 'Income', 'Other']);
  assert.deepEqual(t.map((x) => x.categoryFrom), ['theirs', 'theirs', 'guess', 'guess', 'theirs', 'guess']);
  assert.equal(t[1].theirs, 'Dining out');
  assert.equal(t[1].note, 'with Jo', 'the Tags column is not kept as the note');
});

test('his merchant rule beats the budget app\'s category', async () => {
  await money.setMerchantOverride('Demo Harbour Grocer', 'Shopping');
  await money.loadOverrides();
  const [first] = (await parseBankXlsx(makeXlsx(rows.slice(0, 2), { dateCols: [0] }))).transactions;
  assert.equal(first.category, 'Shopping');
  assert.equal(first.categoryFrom, 'rule');
  await money.restoreMerchantOverride(money.merchantKey('Demo Harbour Grocer'), null);
  await money.loadOverrides();
});

test('the watcher files an .xlsx like a CSV: dedupe, one pending record, his yes, Undo', async () => {
  // one line of the export is already in the ledger
  await money.addTransactions([{ date: '2026-09-02', amount: -42.18, merchant: 'Demo Harbour Grocer', category: 'Groceries' }], 'import');
  await writeFile(path.join(DIR, 'billroo-export.xlsx'), makeXlsx(rows, { dateCols: [0] }));
  const { records } = await scanImports(vault);
  const rec = records.find((r) => r.kind === 'money-import');
  assert.ok(rec, 'no record for the .xlsx');
  assert.equal(rec.status, 'pending');
  assert.equal(rec.decision.payload.transactions.length, 5, 'the line already in the ledger was not left out');
  assert.match(rec.decision.reason, /1 already in the ledger/);
  assert.equal(records.filter((r) => r.event?.type === 'unreadable-file').length, 0, 'the old re-save-as-CSV card is still raised for .xlsx');

  assert.equal((await scanImports(vault)).records.length, 0, 'the same file raised a second record');

  const { undo } = await fileDecision(vault, rec.decision);
  await updateRecord(rec.id, { status: 'filed' });
  const ledger = await money.listTransactions({ sinceMonths: 26 });
  assert.equal(ledger.filter((t) => t.date.startsWith('2026-09')).length, 6);
  assert.equal(ledger.find((t) => t.merchant === 'Demo Lantern Kitchen').category, 'Eating Out');
  assert.ok(!existsSync(path.join(DIR, 'billroo-export.xlsx')), 'the export was not archived');
  assert.ok((await readdir(path.join(DIR, 'Processed'))).includes('billroo-export.xlsx'));

  await undoFiling(vault, undo);
  const after = await money.listTransactions({ sinceMonths: 26 });
  assert.equal(after.filter((t) => t.date.startsWith('2026-09')).length, 1, 'Undo left imported lines behind');
});

test('a file named .xlsx that is not a spreadsheet fails out loud, once', async () => {
  await writeFile(path.join(DIR, 'statement.xlsx'), 'Date,Description,Amount\n2026-09-01,Demo,-1\n');
  const { records } = await scanImports(vault);
  const err = records.find((r) => r.kind === 'money-import');
  assert.equal(err.status, 'error');
  assert.match(err.error, /ends in \.xlsx but is not a spreadsheet Nova can open/);
  assert.equal((await scanImports(vault)).records.length, 0, 'the broken file raised a second record');
  await rm(path.join(DIR, 'statement.xlsx'));
});

test('an .xlsx with no Amount column says which columns it has', async () => {
  await assert.rejects(parseBankXlsx(makeXlsx([['Date', 'Description', 'Category', 'Tags'], [excelSerial('2026-09-01'), 'Demo', 'Other', '']], { dateCols: [0] })),
    /expected date, description and amount.*this file has: Date, Description, Category, Tags/);
});

test('a 5,000-row export parses whole and quickly', async () => {
  const big = [HEAD];
  for (let i = 0; i < 5000; i++) big.push([excelSerial(`2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`), `Demo Shop ${i}`, i % 3 ? 'Groceries' : 'Entertainment', '', -(1 + (i % 500) / 10)]);
  const t0 = Date.now();
  const parsed = await parseBankXlsx(makeXlsx(big, { dateCols: [0] }));
  assert.equal(parsed.transactions.length, 5000);
  assert.ok(Date.now() - t0 < 5000, `5,000 rows took ${Date.now() - t0} ms`);
});

test('an .xls and a .numbers file still raise the re-save card', async () => {
  await writeFile(path.join(DIR, 'old.xls'), Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  const { records } = await scanImports(vault);
  const card = records.find((r) => r.event?.type === 'unreadable-file');
  assert.equal(card?.text, 'old.xls is an older Excel file (.xls). Nova reads CSV and .xlsx files.');
  await rm(path.join(DIR, 'old.xls'));
});

test('the import card says where categories came from, and a 5,000-line sheet lists 120', async () => {
  const { buildMoneyView } = await import('../../src/moneyModel.js');
  const { demoMoneyState, demoSummary } = await import('../../src/moneyDemo.js');
  for (const [variant, n] of [['xlsx', 41], ['xlsxbig', 5000]]) {
    const st = demoMoneyState(variant);
    const v = buildMoneyView({ money: demoSummary(st), records: st.records, demo: true });
    const card = v.importCards[0];
    assert.equal(card.count, n);
    assert.match(card.mixWords, /Categories: [\d,]+ from the file’s own, where the name matches Nova’s; [\d,]+ guessed by Nova from the merchant name\./);
    const shown = card.groups.flatMap((g) => g.rows);
    assert.equal(shown.length, Math.min(n, 120), 'the sheet draws every line of a huge export');
    if (n > 120) {
      assert.equal(card.capNote, 'Showing the newest 120 of 5,000. Filing files all of them.');
      assert.equal(card.say, '5,000 new lines from billroo-export.xlsx.', 'a big count is not grouped');
      assert.equal(card.countLabel, '5,000');
      assert.equal(card.monthName, '', 'an export spanning months says it files "into" one of them');
    } else assert.equal(card.monthName, 'September');
    assert.ok(shown.some((r) => r.theirs === 'Dining out' && r.catLabel === 'Eating out'), 'the theirs-to-ours mapping is not drawn');
    assert.ok(shown.every((r) => r.theirs !== 'Groceries'), 'a name that already matches is drawn twice');
  }
});
