// WHEN MONEY IS CHECKED (his call, 10 Oct 2026): "I don't think Nova needs
// to do that entire check every 5 minutes ... Possibly as part of an
// overnight run every night? But other things like a category over budget
// should be presently able to be seen and recognised as soon as it occurs."
// The full check runs once a night; an over budget or an odd charge is
// checked the moment the ledger changes. Code only, no model either way.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-moneywhen-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TODOIST_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const money = await import('../lib/money.js');
const sig = await import('../lib/moneySignals.js');
const { listRecords } = await import('../lib/inboxStore.js');

test('a ledger write pings the change listeners once, after a short settle', async () => {
  let calls = 0;
  const off = money.onMoneyChange(() => { calls++; });
  await money.setBudget('Groceries', 400);
  await money.setBudget('Transport', 100);
  assert.equal(calls, 0, 'fired before the batch settled');
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(calls, 1, 'a batch of writes is one check');
  off();
});

test('the on-change run files only over-budget and unusual news', async () => {
  const today = sig.localISO(Date.now());
  await money.setBudget('Eating Out', 50);
  await money.addTransactions([{ date: today, description: 'Demo Diner', amount: -80, category: 'Eating Out' }], 'test');
  const out = await sig.runMoneySignals({ types: sig.ON_CHANGE_TYPES, deps: { sendPush: async () => {} } });
  assert.ok(out.created.length >= 1, 'the over budget was not seen at once');
  for (const r of out.created) assert.ok(sig.ON_CHANGE_TYPES.includes((r.event || r.decision?.payload?.event)?.type), 'a non-change type filed on change');
  assert.equal(out.expired, 0, 'the on-change run swept old news; that is the nightly job');
  assert.ok((await listRecords()).some((r) => r.kind === 'money'));
});

test('the five-minute tick no longer runs the money check; the night does, and every ledger write does', async () => {
  const src = await readFile(path.join(ROOT, 'server', 'lib', 'moneyImport.js'), 'utf8');
  const tick = src.slice(src.indexOf('const tick = async () => {'), src.indexOf('onMoneyChange(async'));
  assert.match(tick, /lastFullDay !== day && localHour\(Date\.now\(\)\) >= NIGHTLY_HOUR/, 'the full check is not gated to once a night');
  assert.match(src, /onMoneyChange\(async \(\) => \{[\s\S]*?types: ON_CHANGE_TYPES/);
  assert.deepEqual([...sig.ON_CHANGE_TYPES].sort(), ['over-budget', 'unusual']);
});
