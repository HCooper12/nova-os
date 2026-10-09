// THE MONEY PAGE'S VIEW MODEL (src/moneyModel.js), held to the server's real
// shapes: the summary the server sends today (before this branch's fields
// reach his Mac) must draw an honest page, never crash; the new shape draws
// the mockup's figures by code. Pure: no store, no network. Every figure here
// is invented.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-moneymodel-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildMoneyView, moneyMoment } = await import('../../src/moneyModel.js');
const { demoMoneyState, demoSummary } = await import('../../src/moneyDemo.js');

test('the live server\'s current shape (no new fields, an empty month) draws the empty state, not a zero', () => {
  const old = { month: '2026-10', prevMonth: '2026-09', spent: 0, prevSpent: 0, income: 0, count: 0, byCategory: [], transactions: [], subscriptions: [], months: ['2026-10'], categories: [], importsDir: 'Money/Imports' };
  const v = buildMoneyView({ money: old });
  assert.equal(v.state, 'empty');
  assert.equal(v.news[0].text, 'Nothing filed for October yet.');
  assert.equal(v.coming, null, 'no recurring card when nothing recurs');
  assert.equal(v.against, null, 'nothing to compare is said, not drawn as 0%');
});

test('no summary yet is loading; offline with none says so', () => {
  assert.equal(buildMoneyView({ money: null }).state, 'loading');
  assert.equal(buildMoneyView({ money: null, offline: true }).state, 'offline-empty');
});

test('the demo month draws the mockup\'s figures by code', () => {
  const v = buildMoneyView({ money: demoSummary(demoMoneyState('demo')), records: demoMoneyState('demo').records });
  assert.equal(v.hero.label, 'Left to spend');
  assert.equal(v.hero.totalBudget, 1870);
  assert.equal(v.budgets.rows[0].category, 'Eating Out', 'over budget sorts first');
  assert.equal(v.budgets.rows[0].over, 38);
  assert.ok(v.budgets.rows[0].overW > 0, 'the hatched tab has width');
  assert.match(v.news.map((p) => p.text).join(''), /^\$1,399 spent with six days left\. Under pace overall, but Eating out and Subscriptions are over\.$/);
  assert.equal(v.rise.say, 'Reelhouse is now $18.99 a month.');
  assert.ok(v.coming.bills.every((b) => ['Sure', 'Likely', 'A guess'].includes(b.word)));
  assert.equal(v.compare.say[0].text, 'Eating out');
});

test('a past month never says "this month" or "left"', () => {
  const st = demoMoneyState('past');
  const v = buildMoneyView({ money: demoSummary(st) });
  assert.equal(v.isCurrent, false);
  assert.equal(v.hero.label, 'Spent in September');
  assert.ok(!/left|today/i.test(v.news.map((p) => p.text).join('')));
});

test('Home\'s money row exists only while a money record waits on him', () => {
  assert.equal(moneyMoment([]), null);
  assert.equal(moneyMoment([{ kind: 'money', status: 'filed', event: { type: 'over-budget', title: 'x' } }]), null);
  const m = moneyMoment(demoMoneyState('demo').records);
  assert.equal(m.count, 3);
  assert.equal(m.items[0].type, 'over-budget', 'the most urgent first');
  assert.match(m.talk, /money alerts/);
});
