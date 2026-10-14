// THE ALERT LAYER (server/lib/alerts.js; design/EVIE-STUDY.md §4D). These pin:
// the three tiers deliver where they say and nowhere else, the anatomy is
// bounded, the spoken form is ≤12 words and code-written, standby lets
// tier now through and holds the rest, quiet hours still hold a tier-now
// push, a dedupe key makes one alert of many, every alert lands a receipt,
// and the demotion proposal is a pending Inbox card, never an auto-change.
//
// NOVA_DATA_DIR is set BEFORE any import (the 30-fake-greetings lesson).
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-alerts-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const A = await import('../lib/alerts.js');
const standby = await import('../lib/standby.js');
const push = await import('../lib/push.js');
const { alertsRouter } = await import('../routes/alerts.js');
const { SLICES } = await import('../routes/snapshot.js');
const { slicesForKind } = await import('../lib/writeSlices.js');

const sent = [];
const records = [];
const broadcasts = [];
// quiet hours OFF unless a test turns them on, so the clock of the run
// never decides whether a push goes
const quiet = async (on) => {
  const { setQuietHours } = await import('../lib/quietHours.js');
  if (on) await setQuietHours({ enabled: true, start: '00:00', end: '23:59' });
  else await setQuietHours({ enabled: false });
};

async function reset() {
  sent.length = 0; records.length = 0; broadcasts.length = 0;
  await rm(path.join(dataDir, 'alerts'), { recursive: true, force: true });
  await rm(path.join(dataDir, 'push-held.json'), { force: true });
  await rm(path.join(dataDir, 'voice'), { recursive: true, force: true });
  await quiet(false);
  push._setPushTransportForTests(async (note) => { sent.push(note); return { sent: 1 }; });
  A._setAlertDepsForTests({
    createRecord: async (r) => { records.push(r); return r; },
    getRecord: async (id) => records.find((r) => r.id === id) || null,
    broadcast: async (k) => { broadcasts.push(k); },
    verbIds: async () => ['check.systems', 'check.thing'],
  });
}

test.after(async () => {
  push._setPushTransportForTests(null);
  A._setAlertDepsForTests(null);
  await rm(dataDir, { recursive: true, force: true });
});

const base = { label: 'calendar', what: 'Design review with Sam starts soon', where: 'in 8 minutes', source: 'from your calendar', kind: 'calendar-soon' };

/* -------------------------------------------------------------- anatomy -- */

test('anatomy: label upper-cased and bounded to 14', () => {
  const a = A.normalizeAlert({ ...base, tier: 'now', label: 'researcher brief landed!' });
  assert.equal(a.label, 'RESEARCHER BRI');
  assert.ok(a.label.length <= A.LABEL_MAX);
});

test('anatomy: what is ONE sentence, ≤90 chars, cut at a word', () => {
  const a = A.normalizeAlert({ ...base, tier: 'now', what: 'Your brief is back. It covers creatine, sleep, and a great deal more that should never reach the card.' });
  assert.equal(a.what, 'Your brief is back');
  const long = A.normalizeAlert({ ...base, tier: 'now', what: 'word '.repeat(40) });
  assert.ok(long.what.length <= A.WHAT_MAX);
  assert.ok(long.what.endsWith('…'));
  assert.ok(!/wor…$/.test(long.what));
});

test('anatomy: where and source bounded; a bad tier or an empty what throws', () => {
  const a = A.normalizeAlert({ ...base, tier: 'next', where: 'x'.repeat(80), source: 'y'.repeat(80) });
  assert.ok(a.where.length <= A.WHERE_MAX && a.source.length <= A.SOURCE_MAX);
  assert.throws(() => A.normalizeAlert({ ...base, tier: 'soon' }), /tier/);
  assert.throws(() => A.normalizeAlert({ ...base, tier: 'now', what: '  ' }), /what/);
  assert.throws(() => A.normalizeAlert({ ...base, tier: 'now', label: '!!' }), /label/);
});

test('anatomy: at most ONE action — a known verb or one of Nova\'s screens, else none', () => {
  const verbIds = ['check.systems'];
  assert.deepEqual(A.normAction({ label: 'Check', verb: 'check.systems' }, verbIds), { label: 'Check', verb: 'check.systems', args: {} });
  assert.equal(A.normAction({ label: 'Do it', verb: 'rm.rf' }, verbIds), null);
  assert.deepEqual(A.normAction({ label: 'Open', open: '#/inbox?open=ab12cd34' }), { label: 'Open', open: '#/inbox?open=ab12cd34' });
  assert.equal(A.normAction({ label: 'Open', open: '#/nowhere' }), null);
  assert.equal(A.normAction({ label: 'Open', open: 'https://evil.example' }), null);
  assert.equal(A.normAction({ open: '#/inbox' }), null, 'an action needs its label');
});

/* --------------------------------------------------------------- spoken -- */

const wc = (s) => s.split(/\s+/).filter(Boolean).length;

test('spoken: "{What}. {Where}." and the obvious source left out', () => {
  assert.equal(A.spokenAlert(A.normalizeAlert({ ...base, tier: 'now' })), 'Design review with Sam starts soon. In 8 minutes.');
});

test('spoken: a source that is not obvious from the label is said', () => {
  const line = A.spokenAlert({ label: 'NOVA', what: 'Your answer landed', where: 'in your thread', source: 'from the Researcher' });
  assert.equal(line, 'Your answer landed. In your thread. From the Researcher.');
});

test('spoken: never more than 12 words, whatever it is handed', () => {
  const samples = [
    { label: 'CALENDAR', what: 'Quarterly planning offsite with the whole leadership team and the board starts soon', where: 'in 9 minutes', source: 'from your calendar' },
    { label: 'NOVA', what: 'A very long sentence that keeps on going well past any reasonable length for a line', where: 'somewhere far away', source: 'from a place nobody expects' },
    { label: 'HEALTH', what: 'HRV is down 14% on your baseline', where: 'over the last 3 days', source: 'from Apple Health' },
  ];
  for (const s of samples) assert.ok(wc(A.spokenAlert(s)) <= A.SPOKEN_MAX_WORDS, A.spokenAlert(s));
});

test('spoken: a path or record id is for the card, never his ears', () => {
  assert.equal(A.spokenAlert({ label: 'PLAN', what: 'Plan today is filed', where: 'Journal/2026-10-15.md' }), 'Plan today is filed.');
  assert.equal(A.spokenAlert({ label: 'PLAN', what: 'Plan today is filed', where: 'ab12cd34ef' }), 'Plan today is filed.');
});

test('spoken: the next-turn opener is one code-written sentence', () => {
  assert.equal(A.firstThingLine({ what: 'HRV is down 14% on your baseline' }), 'One thing first: HRV is down 14% on your baseline.');
  assert.equal(A.firstThingLine({ what: '' }), '');
});

/* ---------------------------------------------------------------- tiers -- */

test('tier now: pushes (tier now), lands in pending.json, broadcasts, writes a receipt', async () => {
  await reset();
  const out = await A.raiseAlert({ ...base, tier: 'now', action: { label: 'See today', open: '#/mission' } });
  assert.equal(out.tier, 'now');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, './#/mission');
  assert.equal(sent[0].title, 'CALENDAR — Nova');
  const pending = A.pendingAlerts();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].label, 'CALENDAR');
  assert.equal(pending[0].action.open, '#/mission');
  assert.deepEqual(broadcasts, ['alerts']);
  const log = A.readLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].acted, null);
  assert.equal(log[0].tier, 'now');
  assert.equal(records.length, 0);
});

test('tier next: pending only — no push, no Inbox record', async () => {
  await reset();
  await A.raiseAlert({ ...base, tier: 'next' });
  assert.equal(sent.length, 0);
  assert.equal(records.length, 0);
  assert.equal(A.pendingAlerts().length, 1);
});

test('tier later: an Inbox record (kind alert, pending, no undoData), nothing on the island', async () => {
  await reset();
  const out = await A.raiseAlert({ ...base, tier: 'later' });
  assert.equal(sent.length, 0);
  assert.equal(A.pendingAlerts().length, 0);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'alert');
  assert.equal(records[0].status, 'pending');
  assert.equal(records[0].undoData, undefined);
  assert.equal(records[0].alertId, out.id);
});

test('tier later with an existing record: a receipt, never a second card', async () => {
  await reset();
  records.push({ id: 'plan0001', kind: 'plan-today', status: 'filed' });
  const out = await A.raiseAlert({ ...base, tier: 'later', kind: 'plan-today', recordId: 'plan0001' });
  assert.equal(out.existing, true);
  assert.equal(records.length, 1);
  assert.equal(A.readLog()[0].recordId, 'plan0001');
});

test('pending.json is bounded to 10 and drops what has expired', async () => {
  await reset();
  for (let i = 0; i < 13; i += 1) await A.raiseAlert({ ...base, tier: 'next', what: `Thing ${i}` });
  const list = A.pendingAlerts();
  assert.equal(list.length, A.PENDING_MAX);
  assert.equal(list.at(-1).what, 'Thing 12');
  assert.equal(A.pendingAlerts(Date.now() + 2 * 86400_000).length, 0);
});

/* ------------------------------------------------- standby + quiet hours -- */

test('standby: tier now passes it and pushes', async () => {
  await reset();
  await standby.setStandby(30);
  try {
    const out = await A.raiseAlert({ ...base, tier: 'now' });
    assert.ok(!out.standby);
    assert.equal(sent.length, 1);
  } finally { await standby.clearStandby(); }
});

test('standby: next and later are held in its queue (counted for "Back.")', async () => {
  await reset();
  await standby.setStandby(30);
  try {
    const n = await A.raiseAlert({ ...base, tier: 'next' });
    const l = await A.raiseAlert({ ...base, tier: 'later', what: 'Another thing' });
    assert.equal(n.standby, true);
    assert.equal(l.standby, true);
    assert.equal(standby.standbyState().waiting, 2);
    assert.equal(sent.length, 0);
  } finally { await standby.drainStandby(); await standby.clearStandby(); }
});

test('standby end: the held queue goes out as ONE combined push', async () => {
  await reset();
  await standby.setStandby(30);
  await standby.queueWhileStandby({ kind: 'push', text: 'Brief ready — Nova — the morning brief' });
  await standby.queueWhileStandby({ kind: 'alert', text: 'HEALTH: HRV is down 14%' });
  await standby.queueWhileStandby({ kind: 'push', text: 'Training check — Nova — did legs happen?' });
  const { text } = await standby.clearStandby();
  assert.equal(text, 'Back. Three things landed while you were out.');
  for (let i = 0; i < 20 && !sent.length; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^3 while you were out: Brief ready · HEALTH: HRV is down 14% · Training check$/);
  assert.equal(sent[0].tag, 'standby-back');
});

test('quiet hours: a tier-now push is held, the island card still lands', async () => {
  await reset();
  await quiet(true);
  const out = await A.raiseAlert({ ...base, tier: 'now' });
  assert.equal(sent.length, 0);
  assert.equal(out.pushed.held, true);
  assert.equal(A.pendingAlerts().length, 1);
  assert.equal((await push.heldPushes()).length, 1);
  await quiet(false);
});

test('quiet hours: urgent goes through the window', async () => {
  await reset();
  await quiet(true);
  await A.raiseAlert({ ...base, tier: 'now', urgent: true });
  assert.equal(sent.length, 1);
  await quiet(false);
});

/* ---------------------------------------------------- dedupe + receipts -- */

test('dedupe: the same key is one alert', async () => {
  await reset();
  const one = await A.raiseAlert({ ...base, tier: 'now', dedupeKey: 'cal:x:2026-10-15T05:40:00Z' });
  const two = await A.raiseAlert({ ...base, tier: 'now', dedupeKey: 'cal:x:2026-10-15T05:40:00Z' });
  assert.ok(one.id);
  assert.equal(two.deduped, true);
  assert.equal(sent.length, 1);
  assert.equal(A.readLog().length, 1);
});

test('receipts: tapped closes the card and stamps ms; spoken-only keeps it and marks it said', async () => {
  await reset();
  const a = await A.raiseAlert({ ...base, tier: 'now' });
  const b = await A.raiseAlert({ ...base, tier: 'next', what: 'Another' });
  await A.markActed(b.id, 'spoken-only');
  assert.ok(A.pendingAlerts().find((x) => x.id === b.id).spokenAt);
  const row = await A.markActed(a.id, 'tapped');
  assert.equal(row.acted, 'tapped');
  assert.ok(Number.isFinite(row.ms));
  assert.equal(A.pendingAlerts().some((x) => x.id === a.id), false);
});

test('receipts: a tap after spoken-only wins; spoken-only never overwrites a tap', async () => {
  await reset();
  const a = await A.raiseAlert({ ...base, tier: 'now' });
  await A.markActed(a.id, 'spoken-only');
  assert.equal((await A.markActed(a.id, 'tapped')).acted, 'tapped');
  assert.equal((await A.markActed(a.id, 'spoken-only')).acted, 'tapped');
  await assert.rejects(() => A.markActed(a.id, 'loved'), /acted/);
  assert.equal(await A.markActed('nope', 'tapped'), null);
});

test('receipts: the log is bounded', async () => {
  await reset();
  await mkdir(path.join(dataDir, 'alerts'), { recursive: true });
  const rows = Array.from({ length: A.LOG_MAX + 5 }, (_, i) => JSON.stringify({ id: `r${i}`, at: new Date().toISOString(), tier: 'next', label: 'X', kind: 'x', acted: null, ms: null }));
  await writeFile(path.join(dataDir, 'alerts', 'log.jsonl'), rows.join('\n') + '\n');
  await A.raiseAlert({ ...base, tier: 'next' });
  assert.equal(A.readLog().length, A.LOG_MAX);
});

/* ------------------------------------------------- stats + demotion -- */

const rowsFor = (kind, n, acted, tier = 'now', at = Date.now()) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, at: new Date(at - i * 3600_000).toISOString(), tier, label: 'X', kind, acted: i < acted ? 'tapped' : (i % 2 ? 'dismissed' : null), ms: null }));

test('stats: per kind raised, acted (taps only), ratio, inside the window', () => {
  const rows = [...rowsFor('calendar-soon', 8, 1), ...rowsFor('pocket', 4, 3), ...rowsFor('old', 9, 0, 'now', Date.now() - 30 * 86400_000)];
  const s = A.alertStats(14, { rows });
  assert.deepEqual(s['calendar-soon'], { raised: 8, acted: 1, ratio: 0.125, tier: 'now' });
  assert.equal(s.pocket.ratio, 0.75);
  assert.equal(s.old, undefined);
});

test('demotion: only ≥6 raised AND <20% acted; now→next, next→later, later never', () => {
  const rows = [...rowsFor('calendar-soon', 8, 1), ...rowsFor('few', 5, 0), ...rowsFor('kept', 10, 2), ...rowsFor('health-hrv', 7, 0, 'next'), ...rowsFor('plan-today', 9, 0, 'later')];
  const c = A.demotionCandidates(A.alertStats(14, { rows }));
  assert.deepEqual(c.map((x) => [x.kind, x.from, x.to]).sort(), [['calendar-soon', 'now', 'next'], ['health-hrv', 'next', 'later']]);
});

test('demotion proposal: a pending pattern-scout card on the alert-tier route; never auto-applied, never twice', async () => {
  await reset();
  await mkdir(path.join(dataDir, 'alerts'), { recursive: true });
  await writeFile(path.join(dataDir, 'alerts', 'log.jsonl'), rowsFor('calendar-soon', 7, 0).map((r) => JSON.stringify(r)).join('\n') + '\n');
  const store = [];
  const io = { listRecords: async () => store, createRecord: async (r) => { store.push(r); return r; } };
  const { proposed } = await A.proposeAlertDemotions(io);
  assert.equal(proposed.length, 1);
  const r = proposed[0];
  assert.equal(r.kind, 'pattern');
  assert.equal(r.source, 'scout');
  assert.equal(r.status, 'pending');
  assert.equal(r.decision.route, 'alert-tier');
  assert.deepEqual(r.decision.payload, { kind: 'calendar-soon', from: 'now', to: 'next' });
  assert.match(r.decision.reason, /^7 calendar-soon alerts in 14 days, 0 acted on \(0%\)\.$/);
  assert.deepEqual(A.tierOverrides(), {}, 'nothing demoted by itself');
  assert.equal((await A.proposeAlertDemotions(io)).proposed.length, 0, 'one card per kind per 30 days');
});

test('an approved demotion lowers the tier; it can never raise one; undo restores', async () => {
  await reset();
  const { fileDecision, undoFiling } = await import('../lib/inbox.js');
  const { undo } = await fileDecision(dataDir, { route: 'alert-tier', payload: { kind: 'calendar-soon', from: 'now', to: 'next' } });
  assert.equal(A.tierOverrides()['calendar-soon'], 'next');
  const out = await A.raiseAlert({ ...base, tier: 'now' });
  assert.equal(out.tier, 'next');
  assert.equal(sent.length, 0);
  assert.equal(A.readLog().at(-1).tier, 'next');
  assert.equal(A.effectiveTier('later', 'calendar-soon'), 'later', 'never promotes');
  await undoFiling(dataDir, undo);
  assert.deepEqual(A.tierOverrides(), {});
});

/* ------------------------------------------------------------- sources -- */

test('source: calendar — only a timed event inside 10 minutes, once per start', async () => {
  await reset();
  const now = Date.now();
  const ev = (mins, extra = {}) => ({ id: `e${mins}`, label: `Meeting ${mins}`, time: '15:40', startISO: new Date(now + mins * 60_000).toISOString(), ...extra });
  const soon = A.eventsStartingSoon([ev(5), ev(15), ev(-2), ev(8, { time: '' })], now);
  assert.deepEqual(soon.map((e) => e.id), ['e5']);
  await A.calendarSoonCheck([ev(5)], { now });
  await A.calendarSoonCheck([ev(5)], { now: now + 25_000 });
  assert.equal(sent.length, 1);
  const p = A.pendingAlerts()[0];
  assert.equal(p.label, 'CALENDAR');
  assert.match(p.where, /^in 5 minutes, at \d{1,2}:\d{2}$/);
});

test('source: the pocket keeps its own lock-screen words and its one-per-workout key', async () => {
  await reset();
  const note = { key: 'push:123', title: 'Push day in progress', body: '3 of 18 sets · next: Incline press. Tap to pick up where you left off.', url: './#/workouts', tag: 'pocket-workout' };
  await A.raiseAlert(A.pocketAlert(note));
  await A.raiseAlert(A.pocketAlert(note));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, note.body);
  assert.equal(sent[0].tag, 'pocket-workout');
  assert.equal(A.spokenAlert(A.pendingAlerts()[0]), 'Push day in progress. 3 of 18 sets.');
});

test('source: a Researcher brief is now when he is in a voice session, next when not', async () => {
  await reset();
  assert.equal(A.researcherAlert({ recordId: 'ab12', title: 'Creatine and sleep', live: true }).tier, 'now');
  assert.equal(A.researcherAlert({ recordId: 'ab12', title: '', live: false }).tier, 'next');
  assert.equal(await A.voiceLive(), false);
  const { appendTurn } = await import('../lib/voiceTurns.js');
  await appendTurn({ surface: 'ask', reason: 'unknown', heard: true });
  assert.equal(await A.voiceLive(), true);
  assert.equal(await A.voiceLive(Date.now() + A.VOICE_LIVE_MS + 1000), false);
});

test('source: the morning systems check alerts only on a CONFIGURED connection that is off', async () => {
  await reset();
  const at7 = new Date(); at7.setHours(8, 0, 0, 0);
  const none = await A.systemsAlertCheck({ now: at7, env: {}, checkAll: async () => [{ id: 'vault', label: 'your Obsidian vault', state: 'off' }] });
  assert.equal(none, null, 'never connected is not a fault');
  const out = await A.systemsAlertCheck({ now: at7, env: { VAULT_PATH: '/x' }, checkAll: async () => [{ id: 'vault', label: 'your Obsidian vault', state: 'off' }] });
  assert.equal(out.tier, 'next');
  const p = A.pendingAlerts()[0];
  assert.equal(p.label, 'SYSTEM');
  assert.equal(p.what, 'Obsidian vault is off');
  assert.equal(p.action.verb, 'check.systems');
  assert.equal(await A.systemsAlertCheck({ now: at7, env: { VAULT_PATH: '/x' }, checkAll: async () => [{ id: 'vault', label: 'your Obsidian vault', state: 'off' }] }), null, 'once a day');
});

test('source: an HRV drop past the deload threshold is a tier-next HEALTH alert, once a day', async () => {
  await reset();
  const now = new Date(); now.setHours(9, 0, 0, 0);
  const day = (ago, hrv) => { const d = new Date(now); d.setDate(d.getDate() - ago); return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hrv }; };
  const days = [day(9, 60), day(8, 62), day(7, 58), day(6, 61), day(2, 45), day(1, 44), day(0, 46)];
  const out = await A.hrvAlertCheck({ now, loadDays: async () => days });
  assert.equal(out.tier, 'next');
  const p = A.pendingAlerts()[0];
  assert.match(p.what, /^HRV is down \d+% on your baseline$/);
  assert.equal(p.source, 'from Apple Health');
  assert.equal(await A.hrvAlertCheck({ now, loadDays: async () => days }), null);
  const steady = await A.hrvAlertCheck({ now: new Date(now.getTime() + 86400_000), loadDays: async () => days.map((d) => ({ ...d, hrv: 60 })) });
  assert.equal(steady, null);
});

/* -------------------------------------------------------------- routes -- */

async function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api', alertsRouter());
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}

test('route: GET /api/alerts is the snapshot\'s alerts slice; the broadcast kind tags it', async () => {
  await reset();
  assert.equal(SLICES.alerts, '/api/alerts');
  assert.deepEqual(slicesForKind('alerts'), ['alerts']);
  await A.raiseAlert({ ...base, tier: 'now' });
  const server = await serve();
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/alerts`);
    const body = await r.json();
    assert.equal(body.alerts.length, 1);
    for (const k of ['id', 'tier', 'label', 'what', 'where', 'source', 'action', 'kind', 'spoken']) assert.ok(k in body.alerts[0], k);
    assert.equal(body.alerts[0].spoken, 'Design review with Sam starts soon. In 8 minutes.');
    assert.equal(body.alerts[0].firstThing, null);
  } finally { server.close(); }
});

test('route: POST /api/alerts/:id/acted records it, refuses an unknown how and an unknown id', async () => {
  await reset();
  const a = await A.raiseAlert({ ...base, tier: 'now' });
  const server = await serve();
  const post = (id, how) => fetch(`http://127.0.0.1:${server.address().port}/api/alerts/${id}/acted`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ how }) });
  try {
    assert.equal((await post(a.id, 'loved')).status, 400);
    assert.equal((await post('missing1', 'tapped')).status, 404);
    const ok = await post(a.id, 'dismissed');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).acted, 'dismissed');
    assert.equal(A.readLog()[0].acted, 'dismissed');
    assert.equal(A.pendingAlerts().length, 0);
  } finally { server.close(); }
});

/* ------------------------------------------------------------ by place -- */

test('by place: gym — only now speaks and shows; next waits', () => {
  assert.deepEqual(A.allowedTiers('gym'), { speak: ['now'], card: ['now'], waits: ['next'] });
  const n = A.forPlace({ id: 'a', tier: 'now' }, 'gym');
  const x = A.forPlace({ id: 'b', tier: 'next' }, 'gym');
  assert.deepEqual([n.showCard, n.speak, n.waits], [true, true, false]);
  assert.deepEqual([x.showCard, x.speak, x.waits], [false, false, true]);
});

test('by place: driving — now is spoken only (no card); next waits', () => {
  assert.deepEqual(A.allowedTiers('driving'), { speak: ['now'], card: [], waits: ['next'] });
  const n = A.forPlace({ id: 'a', tier: 'now' }, 'driving');
  assert.deepEqual([n.showCard, n.speak, n.waits], [false, true, false]);
  assert.equal(A.forPlace({ id: 'b', tier: 'next' }, 'driving').waits, true);
});

test('by place: desk, phone and unknown are as before — now and next both show and may speak', () => {
  for (const p of ['desk', 'phone', 'unknown', undefined, 'mars']) {
    assert.deepEqual(A.allowedTiers(p), { speak: ['now', 'next'], card: ['now', 'next'], waits: [] }, String(p));
    for (const tier of ['now', 'next']) {
      const a = A.forPlace({ id: 'a', tier }, p);
      assert.deepEqual([a.showCard, a.speak, a.waits], [true, true, false]);
    }
  }
});

test('by place: allowedTiers hands back a copy, never the table itself', () => {
  A.allowedTiers('gym').speak.push('next');
  assert.deepEqual(A.allowedTiers('gym').speak, ['now']);
});

test('route: GET /api/alerts?place=driving marks a now card spoken-only; an unknown place is unknown', async () => {
  await reset();
  await A.raiseAlert({ ...base, tier: 'now' });
  await A.raiseAlert({ ...base, what: 'HRV is down', label: 'HEALTH', kind: 'health-hrv', tier: 'next' });
  const server = await serve();
  const get = (q) => fetch(`http://127.0.0.1:${server.address().port}/api/alerts${q}`).then((r) => r.json());
  try {
    const d = await get('?place=driving');
    assert.equal(d.place, 'driving');
    const now = d.alerts.find((a) => a.tier === 'now');
    const next = d.alerts.find((a) => a.tier === 'next');
    assert.equal(now.showCard, false);
    assert.equal(now.speak, true);
    assert.equal(next.waits, true);
    const bogus = await get('?place=%3Cscript%3E');
    assert.equal(bogus.place, 'unknown');
    assert.ok(bogus.alerts.every((a) => a.showCard === true && a.waits === false));
  } finally { server.close(); }
});

test('snapshot: ?place= reaches the alerts slice (closed set only); without it, as before', async () => {
  await reset();
  await A.raiseAlert({ ...base, tier: 'now' });
  const { snapshotRouter } = await import('../routes/snapshot.js');
  const app = express();
  app.use('/api', alertsRouter());
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  app.use('/api', snapshotRouter({ port: server.address().port, token: 't' }));
  const snap = (q) => fetch(`http://127.0.0.1:${server.address().port}/api/snapshot?only=alerts${q}`).then((r) => r.json());
  try {
    const d = await snap('&place=driving');
    assert.equal(d.slices.alerts.place, 'driving');
    assert.equal(d.slices.alerts.alerts[0].showCard, false);
    const none = await snap('');
    assert.equal(none.slices.alerts.place, 'unknown');
    assert.equal(none.slices.alerts.alerts[0].showCard, true);
    const bad = await snap('&place=..%2Finbox');
    assert.equal(bad.slices.alerts.place, 'unknown');
  } finally { server.close(); }
});

test('nothing here wrote outside the temp data dir', () => {
  assert.ok(existsSync(path.join(dataDir, 'alerts')));
  const log = readFileSync(path.join(dataDir, 'alerts', 'log.jsonl'), 'utf8');
  assert.ok(log.length > 0);
});
