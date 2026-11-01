// ONE THING FIRST, FOR A FAULT (1 Nov 2026, Wren parity: lib/preflight.mjs +
// dock.js preflightFirstLine). A fault of the now tier he has not heard today
// is said once, right after the ack, in its source's own words; never again
// that day; never invented. Temp data dir BEFORE any server import.
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-first-line-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { dueFirstLine, heardOn, dayKey } from '../../src/firstLine.js';

const { guardianLine, guardianFaults, alertFaults, faultsNow, readHeard, markHeard, firstLineState, HEARD_PATH, GUARDIAN_FRESH_MS } = await import('../lib/firstLineFaults.js');
const { alertsRouter } = await import('../routes/alerts.js');

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

const NOW = new Date(2026, 10, 1, 9, 30).getTime();   // 1 Nov 2026, his morning
const TOMORROW = new Date(2026, 10, 2, 7, 5).getTime();
const REPORT = {
  at: new Date(NOW - 3 * 3600_000).toISOString(),
  status: 'alert',
  checks: [
    { id: 'vault', label: 'Vault', status: 'ok', detail: '812 pages reachable.' },
    { id: 'backups', label: 'Vault snapshots', status: 'alert', detail: 'Snapshot reads back EMPTY: Today.md.2026-10-31T21-00-00-000Z.bak — the net has a hole.' },
    { id: 'health', label: 'Health feed', status: 'warn', detail: "Yesterday's steps are a PARTIAL snapshot." },
  ],
};
const FAULT = { id: 'guardian:backups', line: 'One thing first: Vault snapshots: Snapshot reads back EMPTY.' };

/* --------------------------------------------------------- the pure pick -- */

test('due: the first fault not heard today, in the words the server wrote', () => {
  const due = dueFirstLine({ faults: [FAULT], heardToday: { day: dayKey(NOW), ids: [] }, now: NOW });
  assert.deepEqual(due, { id: FAULT.id, line: FAULT.line, day: '2026-11-01' });
  const two = dueFirstLine({ faults: [FAULT, { id: 'alert:a1', line: 'One thing first: Calendar sync is off.', alertId: 'a1' }], heardToday: { day: '2026-11-01', ids: [FAULT.id] }, now: NOW });
  assert.equal(two.id, 'alert:a1');
  assert.equal(two.alertId, 'a1');
});

test('not due: nothing held, a fault with no words, or every fault already heard today', () => {
  assert.equal(dueFirstLine({ faults: [], heardToday: null, now: NOW }), null);
  assert.equal(dueFirstLine({ faults: undefined, now: NOW }), null);
  assert.equal(dueFirstLine({ faults: [{ id: 'guardian:x', line: '   ' }, { id: '', line: 'One thing first: x.' }, null], now: NOW }), null, 'never a line of its own');
  assert.equal(dueFirstLine({ faults: [FAULT], heardToday: { day: '2026-11-01', ids: [FAULT.id] }, now: NOW }), null);
});

test('once per day: heard yesterday holds nothing back today', () => {
  assert.equal(dueFirstLine({ faults: [FAULT], heardToday: { day: '2026-11-01', ids: [FAULT.id] }, now: NOW }), null);
  assert.equal(dueFirstLine({ faults: [FAULT], heardToday: { day: '2026-11-01', ids: [FAULT.id] }, now: TOMORROW })?.id, FAULT.id);
  // the server's list and this device's own memory join, for today only
  const h = heardOn('2026-11-01', { day: '2026-11-01', ids: ['a'] }, { day: '2026-10-31', ids: ['b'] }, { day: '2026-11-01', ids: ['a', 'c'] }, null);
  assert.deepEqual(h, { day: '2026-11-01', ids: ['a', 'c'] });
});

/* ------------------------------------------------------ the server's faults -- */

test('Guardian: only a red check from a fresh report, in its own first clause', () => {
  const f = guardianFaults(REPORT, NOW);
  assert.deepEqual(f.map((x) => x.id), ['guardian:backups'], 'warn and ok are not the now tier');
  assert.equal(f[0].line, 'One thing first: Vault snapshots: Snapshot reads back EMPTY.');
  assert.equal(guardianFaults({ ...REPORT, at: new Date(NOW - GUARDIAN_FRESH_MS - 1000).toISOString() }, NOW).length, 0, 'a stale report is not what is true now');
  assert.equal(guardianFaults(null, NOW).length, 0);
  assert.equal(guardianFaults({ checks: REPORT.checks }, NOW).length, 0, 'no stamp, no claim');
  assert.equal(guardianLine({ label: 'Vault', detail: 'Vault path unreachable — iCloud offline or the path moved.' }), 'One thing first: Vault: Vault path unreachable.');
  assert.equal(guardianLine({ label: 'Data stores', detail: 'money/ledger.json does not parse · 2 filed records missing undo data' }), 'One thing first: Data stores: money/ledger.json does not parse.');
});

test('alerts: a pending tier-now SYSTEM alert not yet spoken; nothing else', () => {
  const alerts = [
    { id: 'a1', tier: 'now', label: 'SYSTEM', what: 'Calendar sync is off', spokenAt: null },
    { id: 'a2', tier: 'now', label: 'SYSTEM', what: 'Telegram is off', spokenAt: '2026-11-01T00:00:00Z' },
    { id: 'a3', tier: 'next', label: 'SYSTEM', what: 'Todoist is off' },   // already rides sayFirstThing
    { id: 'a4', tier: 'now', label: 'WORKOUT', what: 'Your workout is still open' },   // not a fault
  ];
  const f = alertFaults(alerts);
  assert.deepEqual(f.map((x) => [x.id, x.alertId, x.line]), [['alert:a1', 'a1', 'One thing first: Calendar sync is off.']]);
  assert.deepEqual(faultsNow({ report: REPORT, alerts, now: NOW }).map((x) => x.id), ['guardian:backups', 'alert:a1']);
  assert.deepEqual(faultsNow({ now: NOW }), [], 'nothing held, nothing to say');
});

test('the heard file: marked once, read back today, empty tomorrow, refuses what is not a fault id', async () => {
  rmSync(HEARD_PATH(), { force: true });
  assert.deepEqual(readHeard(NOW), { day: '2026-11-01', ids: [] });
  await markHeard('guardian:backups', NOW);
  await markHeard('guardian:backups', NOW);
  assert.deepEqual(readHeard(NOW), { day: '2026-11-01', ids: ['guardian:backups'] });
  assert.deepEqual(JSON.parse(readFileSync(HEARD_PATH(), 'utf8')), { day: '2026-11-01', ids: ['guardian:backups'] });
  assert.deepEqual(readHeard(TOMORROW), { day: '2026-11-02', ids: [] });
  await assert.rejects(() => markHeard('../../etc', NOW), /not a fault id/);
  const st = await firstLineState({ now: NOW, getReport: async () => REPORT, alerts: [] });
  assert.deepEqual(st, { day: '2026-11-01', heard: ['guardian:backups'], faults: guardianFaults(REPORT, NOW) });
  // and the pick then says nothing more today
  assert.equal(dueFirstLine({ faults: st.faults, heardToday: { day: st.day, ids: st.heard }, now: NOW }), null);
});

test('the routes: GET /api/alerts carries firstLine; POST marks a fault heard', async () => {
  rmSync(HEARD_PATH(), { force: true });
  const app = express();
  app.use(express.json());
  app.use('/api', alertsRouter());
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const g = await (await fetch(`${base}/alerts`)).json();
    assert.ok(g.firstLine && Array.isArray(g.firstLine.faults) && Array.isArray(g.firstLine.heard));
    assert.equal(g.firstLine.day, dayKey());
    const bad = await fetch(`${base}/alerts/first-line/heard`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'nope' }) });
    assert.equal(bad.status, 400);
    const ok = await (await fetch(`${base}/alerts/first-line/heard`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'guardian:vault' }) })).json();
    assert.deepEqual(ok, { ok: true, day: dayKey(), heard: ['guardian:vault'] });
    const again = await (await fetch(`${base}/alerts`)).json();
    assert.deepEqual(again.firstLine.heard, ['guardian:vault']);
    assert.ok(existsSync(HEARD_PATH()));
  } finally { server.close(); }
});

/* ------------------------------------------------- the wiring, by source -- */

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const body = (name) => {
  const at = app.indexOf(`\n  ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  return app.slice(at, app.indexOf('\n  }\n', at));
};

test('the wiring: after the ack, a fault first and ONE line only; heard is recorded on the server', () => {
  const after = body('sayFirstThingAfter');
  assert.ok(after.indexOf('this.sayFaultFirst()') > 0 && after.indexOf('this.sayFaultFirst()') < after.indexOf('this.sayFirstThing('), 'the fault goes ahead of the tier-next alert');
  assert.match(after, /if \(this\.sayFaultFirst\(\)\) return;/, 'never both in one turn');
  const f = body('sayFaultFirst');
  assert.match(f, /dueFirstLine\(\{ faults: fl\?\.faults, heardToday, now \}\)/);
  assert.match(f, /if \(!due\) return false;/, 'nothing due, nothing said');
  assert.match(f, /this\.speakTtsSentence\(lintSpoken\(due\.line\), null\)/);
  assert.match(f, /api\.firstLineHeard\(conn, due\.id\)/);
  assert.match(f, /if \(due\.alertId\) this\.alertActed\(due\.alertId, 'spoken-only'\)/);
  assert.match(app, /apply\('alerts', \(r\) => \{ this\.setAlertsLive\(r\.alerts\); this\.firstLineLive = r\.firstLine \|\| null; \}\)/);
  // the ack comes first (his 29 Oct call): the first-thing slot follows speakAckLine
  const ask = body('askNova');
  assert.ok(ask.indexOf('this.speakAckLine(ack, agent, turn)') < ask.indexOf('this.sayFirstThingAfter(askSeq)', ask.indexOf('this.speakAckLine(ack, agent, turn)')));
  const api = readFileSync(new URL('../../src/api.js', import.meta.url), 'utf8');
  assert.match(api, /firstLineHeard: \(conn, id\) => post\(conn, '\/api\/alerts\/first-line\/heard', \{ id \}\)/);
});
