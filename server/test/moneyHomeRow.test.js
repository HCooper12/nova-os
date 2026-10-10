// THE MONEY ROW ON BOTH HOMES (his call 10 Oct 2026, "Show row on the other
// home too"). One view model (valsMoney → v.moneyMoment) feeds the summary
// Home (MissionSummary's moments) and the cupertino Home his phone runs
// (MissionStructured). The row exists only while a money record waits on
// him; nothing at all when the money is fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const { valsMoney } = await import('../../src/vals/valsMoney.js');

const app = (state) => ({ state: { novaStyle: 'cupertino', screen: 'mission', ...state }, navigate() {}, moneyDiscuss() {}, moneyAnswer() {}, inboxAction() {}, setState() {} });
const live = (items) => valsMoney(app({ liveInbox: { items } }), { demoMode: false, isOffline: false });
const waiting = { id: 'r1', kind: 'money', status: 'pending', text: 'Demo over', event: { type: 'over-budget', category: 'Groceries', title: 'Groceries is $12 over its $100 budget for October.' } };

test('the moment is null when nothing waits, and present when one does', () => {
  assert.equal(live([]).moneyMoment, null, 'an empty inbox drew a Money row');
  assert.equal(live([{ ...waiting, status: 'filed' }]).moneyMoment, null, 'an answered event still drew the row');
  assert.equal(live([{ ...waiting, event: { type: 'unreadable-file', title: 'x' } }]).moneyMoment, null, 'a file card is the Money page\'s, never Home\'s');
  const m = live([waiting]).moneyMoment;
  assert.ok(m, 'a waiting over-budget drew no row');
  assert.equal(m.count, 1);
  assert.equal(m.items[0].title, waiting.event.title);
  for (const door of ['discuss', 'open', 'noted']) assert.equal(typeof m[door], 'function', `the row has no ${door} door`);
});

test('the same moment, whatever the Home style: it does not depend on summary', () => {
  const a = valsMoney(app({ novaStyle: 'summary', liveInbox: { items: [waiting] } }), { demoMode: false, isOffline: false }).moneyMoment;
  const b = live([waiting]).moneyMoment;
  assert.deepEqual({ ...a, discuss: 0, open: 0, noted: 0 }, { ...b, discuss: 0, open: 0, noted: 0 });
});

test('both Homes draw the row only from v.moneyMoment', () => {
  const summary = read('src/vals/valsSummary.js');
  assert.match(summary, /if \(m\.moneyMoment\) list\.push\('money'\)/, 'the summary Home stopped gating on the moment');
  const structured = read('src/screens/MissionStructured.jsx');
  assert.match(structured, /\{v\.moneyMoment && \(\s*<section[^>]*aria-label="Money"/, 'the cupertino Home has no Money row gated on the moment');
  for (const door of ['discuss', 'open', 'noted']) assert.match(structured, new RegExp(`v\\.moneyMoment\\.${door}`), `the cupertino row lost its ${door} door`);
});
