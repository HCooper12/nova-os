// MONEY, WIRED INTO NOVA (10 Oct 2026): the parse that stopped "$250"
// clearing a budget, bill confidence over every gap, the four money events
// on a pinned clock, the push rule and quiet hours, the rails every manual
// write now rides, and the CFO's code-computed read for the consult channel.
//
// Isolated: NOVA_DATA_DIR and a vault in temp dirs BEFORE any import, a test
// transport for pushes (never a real device), and nothing posts to the
// conversation record.
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-moneysig-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-moneysig-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const { readAmount, budgetFromInput } = await import('../../src/moneyParse.js');
const money = await import('../lib/money.js');
const { addTransactions, setBudget, getBudgets, billConfidence, listTransactions } = money;
const sig = await import('../lib/moneySignals.js');
const { detectMoneyEvents, pushRule, runMoneySignals, moneyContext, answerMoneyEvent, localISO } = sig;
const rails = await import('../lib/moneyRails.js');
const { listRecords, getRecord, _resetInboxStore } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');
const push = await import('../lib/push.js');
const { AGENTS, runConsults, handoverLine } = await import('../lib/consult.js');

test.after(async () => {
  push._setPushTransportForTests(null);
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(vault, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// noon in Melbourne on Saturday 10 October 2026 (AEDT, UTC+11)
const NOON_10 = Date.UTC(2026, 9, 10, 1, 0);
const DAY = 86400000;

test('the amount reader: "$250" and "1,200" read as numbers; empty clears; nonsense keeps the old budget', async () => {
  assert.deepEqual(readAmount('$250'), { kind: 'number', value: 250 });
  assert.deepEqual(readAmount('1,200'), { kind: 'number', value: 1200 });
  assert.deepEqual(readAmount(' $1,234.50 '), { kind: 'number', value: 1234.5 });
  assert.deepEqual(readAmount('AUD 45'), { kind: 'number', value: 45 });
  assert.deepEqual(readAmount('(12.40)'), { kind: 'number', value: -12.4 });
  assert.deepEqual(readAmount(''), { kind: 'empty' });
  assert.deepEqual(readAmount('abc'), { kind: 'unreadable' });
  assert.deepEqual(readAmount('12.345'), { kind: 'unreadable' });
  assert.equal(budgetFromInput('$250'), 250);
  assert.equal(budgetFromInput('1,200'), 1200);
  assert.equal(budgetFromInput(''), null);
  assert.equal(budgetFromInput('abc'), undefined);
  assert.equal(budgetFromInput('-5'), undefined);

  // through the server's own setBudget, the bug's actual path
  await setBudget('Shopping', '$250');
  assert.equal((await getBudgets()).Shopping, 250);
  await setBudget('Shopping', '1,200');
  assert.equal((await getBudgets()).Shopping, 1200);
  await assert.rejects(() => setBudget('Shopping', 'abc'), /budget is unchanged/);
  assert.equal((await getBudgets()).Shopping, 1200, 'an unreadable amount never clears it');
  await setBudget('Shopping', '');
  assert.equal((await getBudgets()).Shopping, undefined, 'empty clears, as the sheet says');
});

test('bill confidence is computed over every gap: Sure, Likely, A guess', () => {
  const thursdays = ['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'];
  const sure = billConfidence(thursdays, 'weekly');
  assert.equal(sure.word, 'Sure');
  assert.equal(sure.charges, 9);
  assert.deepEqual(sure.offsets, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sure.said, '9 charges, every one on a Thursday.');

  const quarterly = billConfidence(['2026-02-02', '2026-05-05', '2026-08-06'], 'quarterly');
  assert.equal(quarterly.word, 'Likely');
  assert.equal(quarterly.window, 3);
  assert.match(quarterly.said, /each within 3 days of the quarter/);

  const twice = billConfidence(['2026-08-13', '2026-09-13'], 'monthly');
  assert.equal(twice.word, 'A guess');
  assert.match(twice.said, /Seen twice, 31 days apart/);

  // the LAST gap is perfect but an earlier one wandered: still not Sure
  const wandered = billConfidence(['2026-05-01', '2026-06-09', '2026-07-09', '2026-08-09', '2026-09-09'], 'monthly');
  assert.notEqual(wandered.word, 'Sure', 'every gap counts, not the last two');
  // a skipped month is a whole period, not a wander
  const skipped = billConfidence(['2026-05-22', '2026-06-22', '2026-08-22', '2026-09-22'], 'monthly');
  assert.equal(skipped.word, 'Sure');
});

// the invented ledger the events are read from (every name and figure invented)
const LEDGER = [
  // a monthly that rose on 23 Sep
  { date: '2026-06-23', amount: -16.99, merchant: 'Streamio', category: 'Subscriptions' },
  { date: '2026-07-23', amount: -16.99, merchant: 'Streamio', category: 'Subscriptions' },
  { date: '2026-08-23', amount: -16.99, merchant: 'Streamio', category: 'Subscriptions' },
  { date: '2026-09-23', amount: -18.99, merchant: 'Streamio', category: 'Subscriptions' },
  // a weekly due tomorrow (Sunday 11 Oct)
  { date: '2026-09-13', amount: -18, merchant: 'Harbour Gym', category: 'Health & Fitness' },
  { date: '2026-09-20', amount: -18, merchant: 'Harbour Gym', category: 'Health & Fitness' },
  { date: '2026-09-27', amount: -18, merchant: 'Harbour Gym', category: 'Health & Fitness' },
  { date: '2026-10-04', amount: -18, merchant: 'Harbour Gym', category: 'Health & Fitness' },
  // a monthly due in three days (13 Oct), seen twice
  { date: '2026-08-13', amount: -45, merchant: 'Northline Mobile', category: 'Utilities & Bills' },
  { date: '2026-09-13', amount: -45, merchant: 'Northline Mobile', category: 'Utilities & Bills' },
  // eating out over a $100 budget
  { date: '2026-10-02', amount: -60, merchant: 'Kettle Cafe', category: 'Eating Out' },
  { date: '2026-10-05', amount: -50, merchant: 'Lantern Cafe', category: 'Eating Out' },
  // an unusual charge: about 3x the median of three before it
  { date: '2026-09-01', amount: -40, merchant: 'Corner Grocer', category: 'Groceries' },
  { date: '2026-09-12', amount: -42, merchant: 'Corner Grocer', category: 'Groceries' },
  { date: '2026-09-20', amount: -38, merchant: 'Corner Grocer', category: 'Groceries' },
  { date: '2026-10-08', amount: -120, merchant: 'Corner Grocer', category: 'Groceries' },
  // big, but only two charges before it: "usual" means nothing yet
  { date: '2026-09-01', amount: -10, merchant: 'Odd Shop', category: 'Shopping' },
  { date: '2026-09-15', amount: -10, merchant: 'Odd Shop', category: 'Shopping' },
  { date: '2026-10-07', amount: -50, merchant: 'Odd Shop', category: 'Shopping' },
  // 2.4x its usual: under the line
  { date: '2026-09-02', amount: -10, merchant: 'Paper Stand', category: 'Shopping' },
  { date: '2026-09-09', amount: -10, merchant: 'Paper Stand', category: 'Shopping' },
  { date: '2026-09-16', amount: -10, merchant: 'Paper Stand', category: 'Shopping' },
  { date: '2026-10-09', amount: -24, merchant: 'Paper Stand', category: 'Shopping' },
];

test('the four events, on a pinned clock, by code', () => {
  const tx = LEDGER.map((t, i) => ({ ...t, id: `t${i}`, addedAt: `2026-10-0${1 + (i % 9)}T00:00:00Z` }));
  const events = detectMoneyEvents({ transactions: tx, budgets: { 'Eating Out': 100 }, now: NOON_10 });
  const byType = (t) => events.filter((e) => e.type === t);

  const [rise] = byType('price-rise');
  assert.equal(rise.merchant, 'Streamio');
  assert.equal(rise.title, 'Streamio went up from $16.99 to $18.99 a month.');

  const [over] = byType('over-budget');
  assert.equal(over.category, 'Eating Out');
  assert.equal(over.over, 10);
  assert.match(over.title, /^Eating out is \$10 over its \$100 budget for October\.$/);

  const bills = byType('bill-due').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  assert.deepEqual(bills.map((b) => [b.merchant, b.dueDate]), [['Harbour Gym', '2026-10-11'], ['Northline Mobile', '2026-10-13']]);
  assert.match(bills[0].title, /is due tomorrow\.$/);
  assert.equal(bills[1].confidence, 'A guess');

  const unusual = byType('unusual');
  assert.deepEqual(unusual.map((u) => u.merchant), ['Corner Grocer'], 'two prior charges is too few, 2.4x is under the line');
  assert.equal(unusual[0].ratio, 3);

  // an old rise is history, not news
  const later = detectMoneyEvents({ transactions: tx, budgets: {}, now: NOON_10 + 40 * DAY });
  assert.equal(later.filter((e) => e.type === 'price-rise').length, 0);
});

test('the push rule: a rise, a category over, a bill due TOMORROW; nothing else', () => {
  assert.equal(pushRule({ type: 'price-rise' }, NOON_10), true);
  assert.equal(pushRule({ type: 'over-budget' }, NOON_10), true);
  assert.equal(pushRule({ type: 'bill-due', dueDate: '2026-10-11' }, NOON_10), true);
  assert.equal(pushRule({ type: 'bill-due', dueDate: '2026-10-13' }, NOON_10), false);
  assert.equal(pushRule({ type: 'bill-due', dueDate: '2026-10-10' }, NOON_10), false, 'due today was tomorrow yesterday');
  assert.equal(pushRule({ type: 'unusual' }, NOON_10), false);
  assert.equal(pushRule({ type: 'unreadable-file' }, NOON_10), false);
  // his date, not the server's: 23:30 on the 10th in Melbourne is 12:30Z
  assert.equal(localISO(Date.UTC(2026, 9, 10, 12, 30)), '2026-10-10');
  assert.equal(pushRule({ type: 'bill-due', dueDate: '2026-10-11' }, Date.UTC(2026, 9, 10, 12, 30)), true);
});

test('each event files ONE record, pushes by the rule, and stale news expires', async () => {
  await addTransactions(LEDGER, 'import');
  await setBudget('Eating Out', '100');
  const sent = [];
  const deps = { sendPush: async (n) => { sent.push(n); return { sent: 1 }; } };

  const first = await runMoneySignals({ vaultPath: vault, now: NOON_10, deps });
  const types = first.created.map((r) => r.event.type).sort();
  assert.deepEqual(types, ['bill-due', 'bill-due', 'over-budget', 'price-rise', 'unusual']);
  for (const r of first.created) {
    assert.equal(r.kind, 'money');
    assert.equal(r.status, 'pending');
    assert.equal(r.decision.route, 'money-event');
  }
  assert.equal(sent.length, 3, 'the rise, the over and the gym due tomorrow');
  assert.ok(sent.every((n) => n.url === './#/money'));
  assert.ok(!sent.some((n) => /—/.test(n.title + n.body)), 'no em dash in what he reads');

  // the same tick again: nothing new, nothing pushed twice
  const again = await runMoneySignals({ vaultPath: vault, now: NOON_10 + 60_000, deps });
  assert.equal(again.created.length, 0);
  assert.equal(sent.length, 3);

  // a record trimmed from the Inbox cannot return as news: the key is kept
  const seen = JSON.parse(await readFile(path.join(dataDir, 'money', 'signals.json'), 'utf8')).seen;
  assert.equal(Object.keys(seen).length, 5);

  // two days on: the phone is due tomorrow (its ONE push), the gym's day passed
  const later = await runMoneySignals({ vaultPath: vault, now: NOON_10 + 2 * DAY, deps });
  assert.equal(sent.length, 4);
  assert.match(sent[3].body, /Northline Mobile/);
  assert.ok(later.expired >= 1);
  const gym = (await listRecords()).find((r) => r.event?.type === 'bill-due' && r.event.merchant === 'Harbour Gym');
  assert.equal(gym.status, 'discarded');
  assert.equal(gym.expired, true, 'expired, never his decline');
});

test('quiet hours hold a money push and deliver it when they end (22:30 to 05:00)', async () => {
  await writeFile(path.join(dataDir, 'quiet-hours.json'), JSON.stringify({ enabled: true, start: '22:30', end: '05:00' }), 'utf8');
  const delivered = [];
  let clock = Date.UTC(2026, 9, 10, 12, 0); // 23:00 Melbourne
  push._setPushTransportForTests(async (n) => { delivered.push(n); return { sent: 1 }; }, { now: () => clock });
  const out = await push.sendPush({ title: 'Over budget', body: 'Eating out is $10 over', tag: 'money-q', url: './#/money' });
  assert.equal(out.held, true);
  assert.equal(delivered.length, 0);
  clock = Date.UTC(2026, 9, 10, 18, 1); // 05:01 Melbourne
  const flushed = await push.flushHeldPushes();
  assert.equal(flushed.delivered, 1);
  assert.equal(delivered[0].url, './#/money');
  // 22:15 is outside his window: straight through
  clock = Date.UTC(2026, 9, 11, 11, 15);
  const now = await push.sendPush({ title: 'A price went up', body: 'x', tag: 'money-r' });
  assert.equal(now.sent, 1);
  push._setPushTransportForTests(null);
});

test('every manual write rides the rails: a filed record with undoData, and Undo puts it back', async () => {
  const before = (await listTransactions({ sinceMonths: 26 })).length;

  const added = await rails.addLine({ date: '2026-10-09', amount: -6.5, merchant: 'Kerb Coffee', category: 'Eating Out' });
  assert.equal(added.record.status, 'filed');
  assert.equal(added.record.kind, 'money-write');
  assert.deepEqual(added.record.undoData, { route: 'expense', ids: [added.transaction.id] });
  await undoRecord(vault, added.record.id);
  assert.equal((await listTransactions({ sinceMonths: 26 })).length, before, 'Undo took the added line out');

  const victim = (await listTransactions({ sinceMonths: 26 })).find((t) => t.merchant === 'Corner Grocer' && t.amount === -120);
  const del = await rails.deleteLines([victim.id]);
  assert.equal(del.record.undoData.route, 'money-restore');
  assert.ok(!(await listTransactions({ sinceMonths: 26 })).some((t) => t.id === victim.id));
  await undoRecord(vault, del.record.id);
  const back = (await listTransactions({ sinceMonths: 26 })).find((t) => t.id === victim.id);
  assert.deepEqual(back, victim, 'restored exactly: same id, same stamps');

  const edit = await rails.editLine(victim.id, { category: 'Shopping', note: 'party food', rule: false });
  assert.equal(edit.transaction.category, 'Shopping');
  assert.equal(edit.record.undoData.override, null, 'the merchant rule is off unless he turns it on');
  await undoRecord(vault, edit.record.id);
  const unEdited = (await listTransactions({ sinceMonths: 26 })).find((t) => t.id === victim.id);
  assert.equal(unEdited.category, 'Groceries');
  assert.equal(unEdited.note, null);

  const ruled = await rails.editLine(victim.id, { category: 'Shopping', rule: true });
  assert.equal(ruled.record.undoData.override.before, null);
  assert.equal(money.categorize('Corner Grocer'), 'Shopping', 'the rule holds for the merchant');
  await undoRecord(vault, ruled.record.id);
  await money.loadOverrides();
  assert.equal(money.categorize('Corner Grocer'), 'Groceries', 'Undo removed the rule too');

  const b1 = await rails.changeBudget('Groceries', '$250');
  assert.equal(b1.budgets.Groceries, 250);
  assert.deepEqual(b1.record.undoData, { route: 'money-budget', category: 'Groceries', before: null });
  const b2 = await rails.changeBudget('Groceries', '1,200');
  assert.equal(b2.budgets.Groceries, 1200);
  await undoRecord(vault, b2.record.id);
  assert.equal((await getBudgets()).Groceries, 250, 'Undo puts the old budget back');
  await assert.rejects(() => rails.changeBudget('Groceries', 'lots'), /unchanged/);
  assert.equal((await getBudgets()).Groceries, 250);

  // none of these writes pushed: filed records never do
  const writes = (await listRecords()).filter((r) => r.kind === 'money-write');
  assert.ok(writes.length >= 6);
  assert.ok(writes.every((r) => r.status === 'filed' || r.status === 'undone'));
});

test('a price rise he will not keep becomes a To-Do with Undo; keep files it as noted', async () => {
  const rise = (await listRecords()).find((r) => r.event?.type === 'price-rise' && r.status === 'pending');
  const answered = await answerMoneyEvent(vault, rise.id, 'cancel');
  assert.equal(answered.status, 'filed');
  assert.equal(answered.outcome, 'cancel');
  assert.equal(answered.undoData.route, 'todo');
  const todo = await readFile(path.join(vault, 'Wiki/Inbox/To-Do.md'), 'utf8').catch(() => '');
  assert.match(todo, /Cancel Streamio before/);
  await undoRecord(vault, rise.id);
  assert.equal((await getRecord(rise.id)).status, 'undone');

  const over = (await listRecords()).find((r) => r.event?.type === 'over-budget' && r.status === 'pending');
  const kept = await answerMoneyEvent(vault, over.id, 'keep');
  assert.equal(kept.status, 'filed');
  await assert.rejects(() => answerMoneyEvent(vault, over.id, 'keep'), /already been answered/);
});

test('the CFO answers a consult with code-computed numbers, never a model', async () => {
  // the ledger's own month, read at the same instant the context is
  const now = new Date(2026, 9, 10, 12, 0);
  const s = await money.getMonthSummary(undefined, { now });
  const text = await moneyContext({ now });
  assert.match(text, /^MONEY THIS MONTH \(October 2026, day 10 of 31\)/);
  assert.ok(text.includes(`Spent $${s.spent.toFixed(2)}`), 'the spend is the summary\'s own figure');
  assert.match(text, /Eating out \$110\.00 of \$100, \$10\.00 OVER/);
  assert.match(text, /Recurring: \d+ detected/);

  assert.equal(AGENTS.cfo.code, true, 'a code-read source: no model, no lane');
  assert.equal(AGENTS.cfo.lane, null);
  assert.equal(handoverLine([{ agent: 'cfo' }]), 'Checking the CFO.');
  const [answer] = await runConsults(vault, [{ agent: 'cfo', question: 'How am I tracking this month?' }], { from: 'nova' });
  assert.equal(answer.ok, true);
  assert.match(answer.answer, /MONEY THIS MONTH/);
});

test('a spreadsheet in Money/Imports raises ONE honest card, and leaves when the file does', async () => {
  const { scanImports } = await import('../lib/moneyImport.js');
  const dir = path.join(vault, 'Money/Imports');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'transactions.xlsx'), Buffer.from('PK\u0003\u0004 not really a workbook'));
  const first = await scanImports(vault);
  const card = first.records.find((r) => r.event?.type === 'unreadable-file');
  assert.ok(card, 'the .xlsx is said, not skipped in silence');
  assert.equal(card.text, 'transactions.xlsx is a spreadsheet. Nova reads CSV files.');
  const second = await scanImports(vault);
  assert.equal(second.records.filter((r) => r.event?.type === 'unreadable-file').length, 0, 'once per file and content');
  const { rm: rmFile } = await import('node:fs/promises');
  await rmFile(path.join(dir, 'transactions.xlsx'));
  await runMoneySignals({ vaultPath: vault, now: Date.now(), deps: { sendPush: async () => ({ sent: 0 }) } });
  const gone = await getRecord(card.id);
  assert.equal(gone.status, 'discarded');
  assert.ok(existsSync(dir));
  _resetInboxStore();
});
