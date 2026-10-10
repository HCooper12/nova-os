// "YES, EVERY LAST PURCHASE TOO" (his call, 10 Oct 2026). Re-categorising a
// line with the merchant switch on moves every other line already in the
// ledger from that merchant, sets the rule for future lines, and files ONE
// record whose Undo puts every line back in its own old category and the
// rule back as it was. Every merchant and amount here is invented.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-moneymove-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-moneymove-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const money = await import('../lib/money.js');
const { editLine } = await import('../lib/moneyRails.js');
const { undoFiling } = await import('../lib/inbox.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(vault, { recursive: true, force: true });
});

const byId = async () => new Map((await money.listTransactions({ sinceMonths: 26 })).map((t) => [t.id, t]));

test('the switch moves every past line from the merchant, and Undo puts each back where it was', async () => {
  const added = await money.addTransactions([
    { date: '2026-08-03', amount: -12.5, merchant: 'Demo Corner Store', category: 'Groceries' },
    { date: '2026-08-19', amount: -7.25, merchant: 'DEMO CORNER STORE', category: 'Shopping' },
    { date: '2026-09-04', amount: -30, merchant: 'Demo Corner Store', category: 'Other' },
    { date: '2026-09-21', amount: -4.1, merchant: 'Demo Corner Store', category: 'Eating Out' }, // already the target
    { date: '2026-09-22', amount: 6, merchant: 'Demo Corner Store', category: 'Shopping' }, // a refund: money in stays
    { date: '2026-10-02', amount: -18, merchant: 'Demo Corner Store', category: 'Groceries' }, // the line he edits
    { date: '2026-10-02', amount: -9, merchant: 'Another Demo Shop', category: 'Groceries' }, // another merchant
  ], 'import');
  const [a, b, c, d, refund, line, other] = added;
  await money.setMerchantOverride('Demo Corner Store', 'Shopping'); // a rule he had before

  const counts = await money.merchantLines(line.id);
  assert.deepEqual(counts.byCategory, { Groceries: 1, Shopping: 1, Other: 1, 'Eating Out': 1 }, 'the sheet counts the merchant\'s other purchases by category');
  assert.equal(counts.split, 0);

  const { record } = await editLine(line.id, { category: 'Eating Out', rule: true });
  assert.match(record.text, /^Moved Demo Corner Store to Eating out, with 3 past lines and every future one$/);
  assert.equal(record.status, 'filed');

  let now = await byId();
  for (const t of [a, b, c, d, line]) assert.equal(now.get(t.id).category, 'Eating Out', `${t.date} did not move`);
  assert.equal(now.get(refund.id).category, 'Shopping', 'a refund moved with the purchases');
  assert.equal(now.get(other.id).category, 'Groceries', 'another merchant moved');
  assert.equal((await money.getOverrides())[money.merchantKey('Demo Corner Store')], 'Eating Out');
  assert.equal(money.categorize('DEMO CORNER STORE'), 'Eating Out', 'future lines do not follow the rule');

  const said = await undoFiling(vault, record.undoData);
  assert.match(said, /3 more lines back where they were/);
  now = await byId();
  assert.equal(now.get(a.id).category, 'Groceries');
  assert.equal(now.get(b.id).category, 'Shopping');
  assert.equal(now.get(c.id).category, 'Other');
  assert.equal(now.get(d.id).category, 'Eating Out', 'a line already there was touched');
  assert.equal(now.get(line.id).category, 'Groceries');
  assert.equal((await money.getOverrides())[money.merchantKey('Demo Corner Store')], 'Shopping', 'the rule he had before is not back');
});

test('the switch off changes only the line; no rule, nothing moved', async () => {
  const [x, y] = await money.addTransactions([
    { date: '2026-07-01', amount: -3, merchant: 'Demo Kiosk', category: 'Other' },
    { date: '2026-07-08', amount: -3.5, merchant: 'Demo Kiosk', category: 'Other' },
  ], 'import');
  const { record } = await editLine(y.id, { category: 'Eating Out', rule: false });
  assert.equal(record.undoData.moved.length, 0);
  assert.equal((await byId()).get(x.id).category, 'Other');
  assert.equal((await money.getOverrides())[money.merchantKey('Demo Kiosk')], undefined);
  await undoFiling(vault, record.undoData);
  assert.equal((await byId()).get(y.id).category, 'Other');
});

test('a merchant with 400 past lines moves in one record and comes back in one Undo', async () => {
  const rows = Array.from({ length: 401 }, (_, i) => ({ date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`, amount: -(1 + i / 100), merchant: 'Demo Bulk Bakery', category: i % 2 ? 'Groceries' : 'Other' }));
  const added = await money.addTransactions(rows, 'import');
  assert.equal(added.length, 401);
  const line = added[400];
  assert.equal(Object.values((await money.merchantLines(line.id)).byCategory).reduce((s, n) => s + n, 0), 400);
  const { record } = await editLine(line.id, { category: 'Eating Out', rule: true });
  assert.equal(record.undoData.moved.length, 400);
  assert.ok((await money.listTransactions({ sinceMonths: 26 })).filter((t) => t.merchant === 'Demo Bulk Bakery').every((t) => t.category === 'Eating Out'));
  await undoFiling(vault, record.undoData);
  const back = (await money.listTransactions({ sinceMonths: 26 })).filter((t) => t.merchant === 'Demo Bulk Bakery');
  const wrong = back.filter((t) => t.category !== added.find((x) => x.id === t.id).category);
  assert.equal(wrong.length, 0, `${wrong.length} lines did not go back to their own category`);
});

test('an undo after a moved line was deleted puts back the rest and does not fail', async () => {
  const [p, q, r] = await money.addTransactions([
    { date: '2026-06-02', amount: -5, merchant: 'Demo Paper Co', category: 'Shopping' },
    { date: '2026-06-09', amount: -6, merchant: 'Demo Paper Co', category: 'Other' },
    { date: '2026-06-16', amount: -7, merchant: 'Demo Paper Co', category: 'Shopping' },
  ], 'import');
  const { record } = await editLine(r.id, { category: 'Utilities & Bills', rule: true });
  await money.removeTransactions([p.id]);
  await undoFiling(vault, record.undoData);
  const now = await byId();
  assert.equal(now.get(q.id).category, 'Other');
  assert.equal(now.get(r.id).category, 'Shopping');
  assert.equal(now.has(p.id), false, 'a deleted line came back from a category undo');
});
